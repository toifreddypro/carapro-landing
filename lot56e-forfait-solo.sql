-- Lot 56e : forfaits « Une personne » (séances individuelles sur les créneaux libres du coach). À coller dans Supabase > SQL Editor > Run. Sans danger si lancé deux fois.
alter table public.artisans_forfaits_seances add column if not exists intervention_id uuid;

-- Réservation d'une séance individuelle EN UNE OPÉRATION : crée la séance (décomptée du solde) ET l'intervention dans le planning du coach.
-- Le coach est verrouillé le temps du calcul : deux clients ne peuvent pas prendre le même créneau.
create or replace function public.reserver_seance_solo(p_token text, p_date date, p_heure text, p_duree int)
returns jsonb language plpgsql security definer set search_path = public as $$
declare f record; s record; utilisees int; debut time; fin time; iid uuid; maintenant timestamp;
begin
  select * into f from public.artisans_forfaits where token = p_token for update;
  if not found or f.statut <> 'actif' then return jsonb_build_object('ok', false, 'code', 'forfait_inactif'); end if;
  if f.valable_jusqua < now() then return jsonb_build_object('ok', false, 'code', 'expire'); end if;
  perform 1 from public.artisans where id = f.artisan_id for update;
  select * into s from public.artisans_services where id::text = f.service_id;
  if not found or s.groupe_places is not null or f.client_id is null then return jsonb_build_object('ok', false, 'code', 'indisponible'); end if;
  maintenant := now() at time zone 'America/Guadeloupe';
  if (p_date + p_heure::time) <= maintenant then return jsonb_build_object('ok', false, 'code', 'passee'); end if;
  if (p_date + p_heure::time) > (f.valable_jusqua at time zone 'America/Guadeloupe') then return jsonb_build_object('ok', false, 'code', 'apres_validite'); end if;
  select count(*) into utilisees from public.artisans_forfaits_seances where forfait_id = f.id and statut <> 'annulee';
  if utilisees >= f.nb_total then return jsonb_build_object('ok', false, 'code', 'solde_vide'); end if;
  debut := p_heure::time; fin := debut + make_interval(mins => greatest(15, least(p_duree, 720)));
  if fin <= debut then return jsonb_build_object('ok', false, 'code', 'jour_invalide'); end if;
  if exists (select 1 from public.mpa_artisans_interventions i where i.artisan_id = f.artisan_id and i.date_intervention = p_date and i.statut <> 'annulee'
             and i.heure_debut is not null and i.heure_debut::time < fin and coalesce(i.heure_fin::time, i.heure_debut::time + interval '60 minutes') > debut) then
    return jsonb_build_object('ok', false, 'code', 'complet'); end if;
  insert into public.mpa_artisans_interventions (artisan_id, client_id, service_id, date_intervention, heure_debut, heure_fin, creneau, prix, statut, notes)
    values (f.artisan_id, f.client_id, s.id, p_date, debut, fin, case when debut < time '12:00' then 'matin' else 'apres_midi' end, 0, 'planifiee',
            '📦 Séance de forfait (payée à l''achat du forfait « ' || f.nom_service || ' ») : rien à encaisser.')
    returning id into iid;
  insert into public.artisans_forfaits_seances (forfait_id, artisan_id, service_id, date_seance, heure, intervention_id) values (f.id, f.artisan_id, f.service_id, p_date, p_heure, iid);
  return jsonb_build_object('ok', true, 'solde', f.nb_total - utilisees - 1);
end $$;
revoke all on function public.reserver_seance_solo(text, date, text, int) from public, anon, authenticated;
grant execute on function public.reserver_seance_solo(text, date, text, int) to service_role;

-- Annulation par le client : en plus de rendre la séance, on annule l'intervention du planning.
create or replace function public.annuler_seance_forfait(p_token text, p_seance uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare f record; q record; debut timestamp;
begin
  select * into f from public.artisans_forfaits where token = p_token for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'introuvable'); end if;
  select * into q from public.artisans_forfaits_seances where id = p_seance and forfait_id = f.id for update;
  if not found or q.statut <> 'reservee' then return jsonb_build_object('ok', false, 'code', 'introuvable'); end if;
  debut := q.date_seance + q.heure::time;
  if f.annulation <> 'gratuite_24h' then return jsonb_build_object('ok', false, 'code', 'due'); end if;
  if debut - interval '24 hours' < (now() at time zone 'America/Guadeloupe') then return jsonb_build_object('ok', false, 'code', 'trop_tard'); end if;
  update public.artisans_forfaits_seances set statut = 'annulee' where id = q.id;
  if q.intervention_id is not null then update public.mpa_artisans_interventions set statut = 'annulee' where id = q.intervention_id and statut = 'planifiee'; end if;
  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.annuler_seance_forfait(text, uuid) from public, anon, authenticated;
grant execute on function public.annuler_seance_forfait(text, uuid) to service_role;

-- Si le COACH annule l'intervention dans son planning, la séance est rendue au client (crédit recrédité).
create or replace function public.trg_seance_rendue_si_intervention_annulee() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.statut = 'annulee' and old.statut is distinct from 'annulee' then
    update public.artisans_forfaits_seances set statut = 'annulee' where intervention_id = new.id and statut = 'reservee';
  end if;
  return new;
end $$;
drop trigger if exists trg_seance_rendue on public.mpa_artisans_interventions;
create trigger trg_seance_rendue after update of statut on public.mpa_artisans_interventions for each row execute function public.trg_seance_rendue_si_intervention_annulee();
