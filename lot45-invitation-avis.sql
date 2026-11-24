-- ═══════════════════════════════════════════════════════════
--  LOT 45 — Invitation à donner son avis sur CaraLink (25/11/2026)
--  Après une intervention terminée ou 3 achats réglés dans la boutique, l'artisan voit une petite fenêtre :
--  « Donner mon avis » / « Plus tard » / « Non merci ». Une seule relance après « Plus tard », puis plus rien.
--  Ces colonnes servent à se souvenir de sa réponse. Sans danger si lancé deux fois.
-- ═══════════════════════════════════════════════════════════

alter table public.artisans add column if not exists avis_produit_etat text;          -- vide, 'plus_tard', 'envoye' ou 'refuse'
alter table public.artisans add column if not exists avis_produit_demandes int not null default 0;
alter table public.artisans add column if not exists avis_produit_nb_inter int not null default 0;
alter table public.artisans add column if not exists avis_produit_nb_achats int not null default 0;
