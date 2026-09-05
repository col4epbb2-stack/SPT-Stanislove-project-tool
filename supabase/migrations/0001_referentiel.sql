-- 0001 — Référentiel et configuration
--
-- Conception : doc/schema-supabase.md §C.1.
-- Base neuve, aucune reprise Firebase (décision du 05/09/2026).
--
-- P1 — aucune valeur par défaut sur une colonne numérique : « une absence
-- n'est pas un zéro » (un tarif absent reste « à définir »).

-- `gen_random_uuid()` est dans le cœur de Postgres depuis la version 13 :
-- aucune extension à activer (pgcrypto n'est plus nécessaire).

-- Champ (site) : AGM, TRM, IM. Il n'en existe que trois, mais la table
-- reste ouverte — c'est un référentiel, pas une union du code.
create table champs (
  code        text primary key,
  libelle     text not null,
  ordre       integer,
  actif       boolean not null default true
);

create table services (
  code        text primary key,
  libelle     text not null,
  actif       boolean not null default true
);

create table fournisseurs (
  id          uuid primary key default gen_random_uuid(),
  nom         text not null unique,
  actif       boolean not null default true
);

-- Devises — le pivot est porté par un champ de la table elle-même (et non
-- par un document de configuration à part) : le référentiel garde une seule
-- forme. Un taux absent vaut NULL, jamais 0 ni 1 : convertir sans taux
-- rendrait un montant faux d'apparence officielle.
create table devises (
  code        text primary key,
  libelle     text not null,
  symbole     text not null,
  decimales   smallint not null,
  taux        numeric,
  pivot       boolean not null default false,
  actif       boolean not null default true,
  maj_le      timestamptz,
  maj_par     uuid,
  constraint devises_decimales_valides check (decimales between 0 and 6),
  constraint devises_taux_positif check (taux is null or taux > 0)
);

-- Un seul pivot possible — contrainte vérifiée par la base, là où le code
-- devait la maintenir à la main lors d'un changement de pivot.
create unique index devises_un_seul_pivot on devises (pivot) where pivot;

-- Listes de valeurs paramétrables (36+ listes câblées sur 7 modules).
-- Le catalogue est déclaré dans le code (types/listeValeur.ts) ; cette table
-- porte ce qu'un administrateur y ajoute.
create table listes (
  id          text primary key,
  module      text not null,
  libelle     text not null
);

-- Une LIGNE par valeur, et non un tableau dans un document : deux admins
-- qui ajoutent une valeur en même temps ne se perdent plus l'un l'autre.
-- `actif` = désactivée sans être supprimée (04/09/2026) — une valeur
-- désactivée cesse d'être proposée à la saisie mais reste lisible sur les
-- lignes qui la portent déjà.
create table liste_valeurs (
  id          uuid primary key default gen_random_uuid(),
  liste_id    text not null references listes(id) on delete cascade,
  valeur      text not null,
  actif       boolean not null default true,
  ordre       integer,
  cree_le     timestamptz not null default now(),
  constraint liste_valeurs_unicite unique (liste_id, valeur)
);

-- Insensible à la casse : « Peintre » et « peintre » sont la même valeur.
create unique index liste_valeurs_unicite_casse
  on liste_valeurs (liste_id, lower(valeur));

-- Réglages singleton (ex-documents à id fixe : parametres_navette/globaux,
-- peinture_parametres/contrat, tonnage_echaf_parametres/contrat).
-- jsonb natif : Firestore refusait les tableaux de tableaux, ce qui obligeait
-- à encoder le JSON en string puis à le reparser à chaque lecture.
create table parametres (
  cle         text primary key,
  valeur      jsonb not null,
  maj_le      timestamptz not null default now(),
  maj_par     uuid
);

-- Grille de tarifs NPT (coût du standby) — un tarif absent est NULL, pas 0 :
-- l'écran affiche « à définir » plutôt que de valoriser à zéro.
create table tarifs_npt (
  id                  uuid primary key default gen_random_uuid(),
  categorie           text not null check (categorie in ('personnel', 'materiel')),
  cle                 text not null,
  tarif_journalier    numeric,
  maj_le              timestamptz not null default now(),
  maj_par             uuid,
  constraint tarifs_npt_unicite unique (categorie, cle),
  constraint tarifs_npt_positif check (tarif_journalier is null or tarif_journalier >= 0)
);

-- Tableaux de bord et pivots figés repris des classeurs (les 30 clés
-- ex-`donnees_referentiels` qui ne sont pas des listes de lignes : *__dashboard,
-- *__charts, grand-arret__backend…). Les listes de lignes, elles, vont dans
-- leur propre table métier avec origine = 'classeur'.
create table classeur_blobs (
  cle         text primary key,
  valeur      jsonb not null,
  importe_le  timestamptz not null default now()
);
