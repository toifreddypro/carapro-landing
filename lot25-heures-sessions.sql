-- Lot 25 : heures précises + sessions avec places. À coller dans Supabase > SQL Editor > Run. Sans danger si lancé deux fois.

-- ── 1. Heures précises : liste d'heures de départ « 08:00 », « 10:00 »… (valable tous les jours). Vide = comportement d'avant. ──
alter table public.artisans add column if not exists heures_fixes text[];

-- ── 2. Sessions avec places (coaching, atelier, cours collectif) ──
create table if not exists public.artisans_sessions (
  id uuid primary key default gen_random_uuid(),
  artisan_id uuid not null references public.artisans(id) on delete cascade,
  titre text not null check (char_length(titre) between 3 and 80),
  description text check (description is null or char_length(description) <= 500),
  date_session date not null,
  heure_debut time not null,
  duree_min int not null check (duree_min between 15 and 720),
  lieu text not null check (char_length(lieu) between 3 and 160),
  places int not null check (places between 2 and 100),
  prix_par_personne numeric(10,2) not null default 0 check (prix_par_personne >= 0 and prix_par_personne <= 5000),
  statut text not null default 'ouverte' check (statut in ('ouverte','annulee')),
  created_at timestamptz not null default now()
);
create index if not exists artisans_sessions_artisan_idx on public.artisans_sessions (artisan_id, date_session);

create table if not exists public.artisans_sessions_inscrits (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.artisans_sessions(id) on delete cascade,
  nom text not null check (char_length(nom) between 2 and 60),
  telephone text not null check (char_length(telephone) between 6 and 20),
  email text check (email is null or char_length(email) <= 120),
  nb_places int not null default 1 check (nb_places between 1 and 10),
  statut text not null default 'confirme' check (statut in ('confirme','annule')),
  ip_hash text,
  created_at timestamptz not null default now()
);
create index if not exists artisans_sessions_inscrits_idx on public.artisans_sessions_inscrits (session_id, statut);

alter table public.artisans_sessions enable row level security;
alter table public.artisans_sessions_inscrits enable row level security;
revoke all on public.artisans_sessions, public.artisans_sessions_inscrits from anon, authenticated;
grant select, insert, update, delete on public.artisans_sessions to authenticated;
grant select, update on public.artisans_sessions_inscrits to authenticated;

-- L'artisan gère SES sessions et lit/annule SES inscrits. Le public passe uniquement par les fonctions serveur (jamais d'accès direct).
drop policy if exists "artisan gere ses sessions" on public.artisans_sessions;
create policy "artisan gere ses sessions" on public.artisans_sessions
  for all to authenticated
  using (exists (select 1 from public.artisans a where a.id = artisan_id and a.user_id = auth.uid()))
  with check (exists (select 1 from public.artisans a where a.id = artisan_id and a.user_id = auth.uid()));
drop policy if exists "artisan lit ses inscrits" on public.artisans_sessions_inscrits;
create policy "artisan lit ses inscrits" on public.artisans_sessions_inscrits
  for select to authenticated
  using (exists (select 1 from public.artisans_sessions s join public.artisans a on a.id = s.artisan_id where s.id = session_id and a.user_id = auth.uid()));
drop policy if exists "artisan annule ses inscrits" on public.artisans_sessions_inscrits;
create policy "artisan annule ses inscrits" on public.artisans_sessions_inscrits
  for update to authenticated
  using (exists (select 1 from public.artisans_sessions s join public.artisans a on a.id = s.artisan_id where s.id = session_id and a.user_id = auth.uid()))
  with check (exists (select 1 from public.artisans_sessions s join public.artisans a on a.id = s.artisan_id where s.id = session_id and a.user_id = auth.uid()));

-- Réservation d'une place EN UNE SEULE OPÉRATION : la session est verrouillée le temps du calcul, donc deux clients qui réservent
-- la dernière place en même temps ne peuvent pas tous les deux l'obtenir. Appelée uniquement par la fonction serveur « reserver-session ».
create or replace function public.reserver_place_session(p_session uuid, p_nom text, p_tel text, p_email text, p_nb int, p_ip_hash text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare s record; pris int; restantes int; nid uuid;
begin
  select * into s from public.artisans_sessions where id = p_session for update;
  if not found or s.statut <> 'ouverte' then return jsonb_build_object('ok', false, 'code', 'indisponible'); end if;
  if (s.date_session + s.heure_debut) <= (now() at time zone 'America/Guadeloupe') then return jsonb_build_object('ok', false, 'code', 'passee'); end if;
  select coalesce(sum(nb_places), 0) into pris from public.artisans_sessions_inscrits where session_id = p_session and statut = 'confirme';
  restantes := s.places - pris;
  if restantes <= 0 then return jsonb_build_object('ok', false, 'code', 'complet'); end if;
  if p_nb > restantes then return jsonb_build_object('ok', false, 'code', 'pas_assez', 'restantes', restantes); end if;
  insert into public.artisans_sessions_inscrits (session_id, nom, telephone, email, nb_places, ip_hash)
    values (p_session, p_nom, p_tel, nullif(p_email, ''), p_nb, p_ip_hash) returning id into nid;
  return jsonb_build_object('ok', true, 'id', nid, 'restantes', restantes - p_nb);
end $$;
revoke all on function public.reserver_place_session(uuid, text, text, text, int, text) from public, anon, authenticated;
grant execute on function public.reserver_place_session(uuid, text, text, text, int, text) to service_role;
