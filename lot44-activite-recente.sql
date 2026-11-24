-- ═══════════════════════════════════════════════════════════
--  LOT 44 — Activité récente des artisans (24/11/2026)
--  But : mettre un peu plus en avant, dans le défilement « Des artisans près de chez vous », les artisans qui font vivre leur boutique.
--  Compte pour « activité » (sur 14 jours, calculé par le site) : nouveau produit ou service, nouvelle photo (profil, galerie, produit, service),
--  changement de prix, nouvelle promo. Une faute corrigée dans la présentation ne compte pas.
--  Rien n'est visible tant que l'annuaire compte moins de 30 artisans : la mesure se prépare dès maintenant.
--  Les avis et l'abonnement Pro n'y entrent jamais (règle du 31/10 : visibilité ≠ réputation).
--  Sans danger si lancé deux fois.
-- ═══════════════════════════════════════════════════════════

alter table public.artisans add column if not exists derniere_activite_le timestamptz;
update public.artisans set derniere_activite_le = created_at where derniere_activite_le is null;

-- Écrit la date d'activité d'un artisan. Réservée au système (les déclencheurs ci-dessous) : un artisan ne peut pas l'appeler lui-même.
create or replace function public.marquer_activite_artisan(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_id is null then return; end if;
  perform set_config('app.activite_ok', '1', true);
  update public.artisans set derniere_activite_le = now() where id = p_id;
  perform set_config('app.activite_ok', '', true);
end $$;
revoke all on function public.marquer_activite_artisan(uuid) from public, anon, authenticated;

-- Déclencheur des tables liées (produits, services, photos).
create or replace function public.trg_activite_liee() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if TG_OP = 'INSERT' then
    if TG_TABLE_NAME = 'artisans_catalogue' then
      if NEW.en_vente is not distinct from false then return NEW; end if; -- « Mon stock » (non mis en vente) ne compte pas
    end if;
    perform public.marquer_activite_artisan(NEW.artisan_id);
  elsif TG_OP = 'UPDATE' then
    if TG_TABLE_NAME = 'artisans_catalogue' then
      if NEW.en_vente is not distinct from false then return NEW; end if;
      if NEW.prix is distinct from OLD.prix or NEW.url_photo is distinct from OLD.url_photo or NEW.promo_pct is distinct from OLD.promo_pct
         or (OLD.en_vente is not distinct from false) then
        perform public.marquer_activite_artisan(NEW.artisan_id);
      end if;
    elsif TG_TABLE_NAME = 'artisans_services' then
      if NEW.prix_indicatif is distinct from OLD.prix_indicatif or NEW.photo_url is distinct from OLD.photo_url then
        perform public.marquer_activite_artisan(NEW.artisan_id);
      end if;
    end if;
  end if;
  return NEW;
end $$;

drop trigger if exists trg_activite_catalogue on public.artisans_catalogue;
create trigger trg_activite_catalogue after insert or update on public.artisans_catalogue for each row execute function public.trg_activite_liee();
drop trigger if exists trg_activite_services on public.artisans_services;
create trigger trg_activite_services after insert or update on public.artisans_services for each row execute function public.trg_activite_liee();
drop trigger if exists trg_activite_photos on public.artisans_photos;
create trigger trg_activite_photos after insert on public.artisans_photos for each row execute function public.trg_activite_liee();
drop trigger if exists trg_activite_catalogue_photos on public.artisans_catalogue_photos;
create trigger trg_activite_catalogue_photos after insert on public.artisans_catalogue_photos for each row execute function public.trg_activite_liee();

-- Sur la fiche de l'artisan : nouvelle photo de profil ou nouveau code promo = activité. Et personne ne peut écrire la date lui-même.
create or replace function public.trg_garde_activite() returns trigger
language plpgsql as $$
begin
  if coalesce(current_setting('app.activite_ok', true), '') <> '1' then
    NEW.derniere_activite_le := OLD.derniere_activite_le;
    if (NEW.photo_profil_url is distinct from OLD.photo_profil_url and NEW.photo_profil_url is not null)
       or (NEW.code_promo_pct is distinct from OLD.code_promo_pct and coalesce(NEW.code_promo_pct, 0) > 0) then
      NEW.derniere_activite_le := now();
    end if;
  end if;
  return NEW;
end $$;
drop trigger if exists trg_garde_activite on public.artisans;
create trigger trg_garde_activite before update on public.artisans for each row execute function public.trg_garde_activite();

-- Quels artisans ont au moins un produit en vente ou un service ? (pour le défilement, à partir de 30 artisans)
create or replace function public.artisans_avec_offre(p_ids uuid[]) returns table(artisan_id uuid)
language sql stable security definer set search_path = public as $$
  select distinct c.artisan_id from public.artisans_catalogue c where c.artisan_id = any(p_ids) and (c.en_vente is null or c.en_vente)
  union
  select distinct s.artisan_id from public.artisans_services s where s.artisan_id = any(p_ids);
$$;
revoke all on function public.artisans_avec_offre(uuid[]) from public, anon, authenticated;
grant execute on function public.artisans_avec_offre(uuid[]) to service_role;
