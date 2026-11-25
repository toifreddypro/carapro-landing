-- ═══════════════════════════════════════════════════════════
--  LOT 47 — Pubs fusionnées + petite phrase sous le logo (25/11/2026)
--  Les pubs partenaires alternent avec les cartes CaraLink Alternance. Chaque partenaire peut avoir une petite phrase (60 caractères).
--  Sans danger si lancé deux fois. Le fonctionnement (interrupteur, dates) ne change pas.
-- ═══════════════════════════════════════════════════════════

alter table public.pub_annonces add column if not exists phrase text;
alter table public.pub_annonces drop constraint if exists pub_annonces_phrase_longueur;
alter table public.pub_annonces add constraint pub_annonces_phrase_longueur check (phrase is null or char_length(phrase) <= 60);

-- Comme avant, avec la petite phrase en plus (la forme de la réponse change : il faut d'abord retirer l'ancienne fonction).
drop function if exists public.pub_annonces_actives();
create or replace function public.pub_annonces_actives()
returns table(nom text, lien text, logo_url text, phrase text)
language sql stable security definer set search_path = public as $$
  select a.nom, a.lien, a.logo_url, a.phrase
  from pub_annonces a
  where (select r.actif from pub_reglages r where r.id = 1)
    and (a.debut is null or a.debut <= (now() at time zone 'America/Guadeloupe')::date)
    and (a.fin   is null or a.fin   >= (now() at time zone 'America/Guadeloupe')::date)
  order by a.position;
$$;
grant execute on function public.pub_annonces_actives() to anon, authenticated;
