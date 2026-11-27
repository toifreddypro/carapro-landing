-- Lot 56d : lien d'un forfait vendu avec la fiche client et la ligne de vente créées dans MPA. À coller dans Supabase > SQL Editor > Run. Sans danger si lancé deux fois.
alter table public.artisans_forfaits add column if not exists client_id uuid;
alter table public.artisans_forfaits add column if not exists intervention_id uuid;
