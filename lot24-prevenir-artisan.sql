-- Lot 24 : « Prévenir cet artisan » — les clients qui voudraient réserver un artisan pas encore réservable en ligne.
-- À coller dans Supabase > SQL Editor > Run. Sans danger si lancé deux fois.
create table if not exists public.artisans_interets (
  id uuid primary key default gen_random_uuid(),
  artisan_id uuid not null references public.artisans(id) on delete cascade,
  prenom text not null check (char_length(prenom) between 1 and 40),
  message text check (message is null or char_length(message) <= 300),
  ip_hash text not null,
  email_envoye boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists artisans_interets_artisan_idx on public.artisans_interets (artisan_id, created_at desc);
create index if not exists artisans_interets_ip_idx on public.artisans_interets (ip_hash, created_at desc);

alter table public.artisans_interets enable row level security;
revoke all on public.artisans_interets from anon, authenticated;
grant select on public.artisans_interets to authenticated;
-- L'artisan ne lit QUE ses propres demandes. Personne n'écrit depuis le navigateur : seule la fonction serveur insère.
drop policy if exists "artisan lit ses interets" on public.artisans_interets;
create policy "artisan lit ses interets" on public.artisans_interets
  for select to authenticated
  using (exists (select 1 from public.artisans a where a.id = artisan_id and a.user_id = auth.uid()));
