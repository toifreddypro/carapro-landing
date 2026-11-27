-- Lot 55 — Services « groupe » et « forfait » (formulaire d'ajout de service).
-- Un service simple (à l'unité) n'a AUCUNE de ces valeurs : rien ne change pour les artisans existants.
-- Sans danger si lancé deux fois.

alter table public.artisans_services add column if not exists groupe_places int;                 -- vide = une personne à la fois ; sinon nombre max de participants par séance
alter table public.artisans_services add column if not exists forfait_seances int;               -- vide = vendu à la séance ; sinon nombre de séances du forfait
alter table public.artisans_services add column if not exists forfait_prix numeric(10,2);        -- prix du forfait entier
alter table public.artisans_services add column if not exists forfait_validite_jours int;        -- durée de validité du forfait après l'achat
alter table public.artisans_services add column if not exists forfait_annulation text;           -- 'due' = séance due même si annulée ; 'gratuite_24h' = annulation gratuite jusqu'à 24 h avant

alter table public.artisans_services drop constraint if exists artisans_services_groupe_forfait_chk;
alter table public.artisans_services add constraint artisans_services_groupe_forfait_chk check (
  (groupe_places is null or groupe_places between 2 and 100)
  and (forfait_seances is null or forfait_seances between 2 and 100)
  and (forfait_seances is null or (forfait_prix is not null and forfait_prix > 0 and forfait_prix <= 20000))
  and (forfait_validite_jours is null or forfait_validite_jours between 7 and 730)
  and (forfait_annulation is null or forfait_annulation in ('due', 'gratuite_24h'))
);
