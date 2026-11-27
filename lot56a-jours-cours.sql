-- Lot 56a — Jours et heure d'un cours collectif (service « groupe »).
-- groupe_jours : jours de la semaine où le cours a lieu (1 = lundi … 7 = dimanche). groupe_heure : l'heure de départ, « 18:00 ».
-- Sans danger si lancé deux fois. Les services de groupe déjà créés restent valables (valeurs vides, à compléter).

alter table public.artisans_services add column if not exists groupe_jours int[];
alter table public.artisans_services add column if not exists groupe_heure text;

alter table public.artisans_services drop constraint if exists artisans_services_groupe_horaire_chk;
alter table public.artisans_services add constraint artisans_services_groupe_horaire_chk check (
  (groupe_jours is null or groupe_jours <@ array[1,2,3,4,5,6,7])
  and (groupe_heure is null or groupe_heure ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$')
);
