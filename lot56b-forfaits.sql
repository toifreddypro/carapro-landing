-- Lot 56b : forfaits de séances (achat par le client, solde, réservation des jours avec places). À coller dans Supabase > SQL Editor > Run. Sans danger si lancé deux fois.

create table if not exists public.artisans_forfaits (
  id uuid primary key default gen_random_uuid(),
  token text not null unique default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  artisan_id uuid not null references public.artisans(id) on delete cascade,
  service_id text,
  nom_service text not null,
  nom text not null check (char_length(nom) between 2 and 60),
  telephone text not null check (char_length(telephone) between 6 and 20),
  email text not null check (char_length(email) between 5 and 120),
  nb_total int not null check (nb_total between 2 and 100),
  prix numeric(10,2) not null check (prix >= 0 and prix <= 20000),
  commission_montant numeric(10,2) not null default 0,
  annulation text not null default 'due' check (annulation in ('due','gratuite_24h')),
  valable_jusqua timestamptz not null,
  statut text not null default 'en_attente' check (statut in ('en_attente','actif','annule','rembourse')),
  stripe_payment_intent_id text,
  stripe_account text,
  paye_le timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists artisans_forfaits_artisan_idx on public.artisans_forfaits (artisan_id, statut);

create table if not exists public.artisans_forfaits_seances (
  id uuid primary key default gen_random_uuid(),
  forfait_id uuid not null references public.artisans_forfaits(id) on delete cascade,
  artisan_id uuid not null references public.artisans(id) on delete cascade,
  service_id text,
  date_seance date not null,
  heure text not null check (heure ~ '^[0-2][0-9]:[0-5][0-9]$'),
  statut text not null default 'reservee' check (statut in ('reservee','presente','absente','annulee')),
  accepte_le timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create unique index if not exists artisans_forfaits_seances_uniq on public.artisans_forfaits_seances (forfait_id, date_seance, heure) where statut <> 'annulee';
create index if not exists artisans_forfaits_seances_jour_idx on public.artisans_forfaits_seances (service_id, date_seance, heure) where statut <> 'annulee';

alter table public.artisans_forfaits enable row level security;
alter table public.artisans_forfaits_seances enable row level security;
revoke all on public.artisans_forfaits, public.artisans_forfaits_seances from anon, authenticated;
grant select on public.artisans_forfaits to authenticated;
grant select, update on public.artisans_forfaits_seances to authenticated;

drop policy if exists "artisan lit ses forfaits" on public.artisans_forfaits;
create policy "artisan lit ses forfaits" on public.artisans_forfaits for select to authenticated
  using (exists (select 1 from public.artisans a where a.id = artisan_id and a.user_id = auth.uid()));
drop policy if exists "artisan lit ses seances" on public.artisans_forfaits_seances;
create policy "artisan lit ses seances" on public.artisans_forfaits_seances for select to authenticated
  using (exists (select 1 from public.artisans a where a.id = artisan_id and a.user_id = auth.uid()));
drop policy if exists "artisan pointe ses seances" on public.artisans_forfaits_seances;
create policy "artisan pointe ses seances" on public.artisans_forfaits_seances for update to authenticated
  using (exists (select 1 from public.artisans a where a.id = artisan_id and a.user_id = auth.uid()))
  with check (exists (select 1 from public.artisans a where a.id = artisan_id and a.user_id = auth.uid()));

-- Réservation d'une séance EN UNE SEULE OPÉRATION (le service est verrouillé : la dernière place ne peut pas être prise par deux clients).
-- Le décompte se fait à la réservation : séance réservée = séance due.
create or replace function public.reserver_seance_forfait(p_token text, p_date date, p_heure text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare f record; s record; utilisees int; pris int; jour int; maintenant timestamp;
begin
  select * into f from public.artisans_forfaits where token = p_token for update;
  if not found or f.statut <> 'actif' then return jsonb_build_object('ok', false, 'code', 'forfait_inactif'); end if;
  if f.valable_jusqua < now() then return jsonb_build_object('ok', false, 'code', 'expire'); end if;
  select * into s from public.artisans_services where id::text = f.service_id for update;
  if not found or s.groupe_places is null then return jsonb_build_object('ok', false, 'code', 'indisponible'); end if;
  jour := extract(isodow from p_date)::int;
  if s.groupe_jours is null or not (jour = any(s.groupe_jours)) or s.groupe_heure is distinct from p_heure then
    return jsonb_build_object('ok', false, 'code', 'jour_invalide'); end if;
  maintenant := now() at time zone 'America/Guadeloupe';
  if (p_date + p_heure::time) <= maintenant then return jsonb_build_object('ok', false, 'code', 'passee'); end if;
  if (p_date + p_heure::time) > (f.valable_jusqua at time zone 'America/Guadeloupe') then return jsonb_build_object('ok', false, 'code', 'apres_validite'); end if;
  select count(*) into utilisees from public.artisans_forfaits_seances where forfait_id = f.id and statut <> 'annulee';
  if utilisees >= f.nb_total then return jsonb_build_object('ok', false, 'code', 'solde_vide'); end if;
  if exists (select 1 from public.artisans_forfaits_seances where forfait_id = f.id and date_seance = p_date and heure = p_heure and statut <> 'annulee') then
    return jsonb_build_object('ok', false, 'code', 'deja_reserve'); end if;
  select count(*) into pris from public.artisans_forfaits_seances where service_id = f.service_id and date_seance = p_date and heure = p_heure and statut <> 'annulee';
  if pris >= s.groupe_places then return jsonb_build_object('ok', false, 'code', 'complet'); end if;
  insert into public.artisans_forfaits_seances (forfait_id, artisan_id, service_id, date_seance, heure) values (f.id, f.artisan_id, f.service_id, p_date, p_heure);
  return jsonb_build_object('ok', true, 'restantes', s.groupe_places - pris - 1, 'solde', f.nb_total - utilisees - 1);
end $$;
revoke all on function public.reserver_seance_forfait(text, date, text) from public, anon, authenticated;
grant execute on function public.reserver_seance_forfait(text, date, text) to service_role;

-- Annulation par le client : gratuite (crédit rendu) seulement si la règle du service le permet et si on est à plus de 24 h ; sinon la séance reste due.
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
  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.annuler_seance_forfait(text, uuid) from public, anon, authenticated;
grant execute on function public.annuler_seance_forfait(text, uuid) to service_role;
