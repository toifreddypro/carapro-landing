-- Lot 51 — Carte obligatoire AVANT les paiements en ligne : « pour être réservable, il faut être commissionable ».
-- Étape 1 : la carte (commission) — Étape 2 : le compte Stripe (paiements en ligne).
-- Les artisans DÉJÀ inscrits sans carte reçoivent un délai de 14 jours à partir d'aujourd'hui ; les nouveaux n'en ont pas.
-- Sans danger si lancé deux fois (le délai n'est posé qu'une fois).

alter table public.artisans add column if not exists carte_delai_jusqua timestamptz;

update public.artisans
   set carte_delai_jusqua = now() + interval '14 days'
 where coalesce(carte_prestations_enregistree, false) = false
   and carte_delai_jusqua is null;

comment on column public.artisans.carte_delai_jusqua is
  'Délai de grâce (lot 51) : jusqu''à cette date, un artisan déjà inscrit sans carte reste réservable. Vide pour les nouveaux : carte obligatoire.';
