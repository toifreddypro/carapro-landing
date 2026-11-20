-- Lot 41 : YouTube parmi les réseaux de la boutique.
-- À lancer dans Supabase (SQL Editor) AVANT de déployer la fonction lire-catalogue et le site.
alter table public.artisans add column if not exists boutique_youtube text;

alter table public.artisans drop constraint if exists artisans_boutique_youtube_check;
alter table public.artisans add constraint artisans_boutique_youtube_check
  check (boutique_youtube is null or boutique_youtube ~ '^[A-Za-z0-9._-]{3,30}$');
