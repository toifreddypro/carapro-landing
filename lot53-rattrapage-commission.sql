-- Lot 53 — Rattrapage de la commission « prestations » : complément du mois précédent, le 8 de chaque mois.
-- Un seul rattrapage par artisan et par mois (contrainte unique). Table réservée au serveur (aucune règle d'accès publique).

create table if not exists public.prelevements_prestations_rattrapage (
  id uuid primary key default gen_random_uuid(),
  artisan_id uuid not null references public.artisans(id) on delete cascade,
  mois date not null,
  ca_total numeric,
  commission_montant numeric not null,
  statut text not null check (statut in ('reussi', 'echoue')),
  stripe_payment_intent_id text,
  erreur text,
  created_at timestamptz not null default now(),
  unique (artisan_id, mois)
);

alter table public.prelevements_prestations_rattrapage enable row level security;
