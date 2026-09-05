-- 0003 — Navette budgétaire
--
-- Conception : doc/schema-supabase.md §C.4.
-- C'est le cœur financier : une ligne navette porte le budget d'une affaire,
-- révisé jusqu'à 4 fois par an (cycles PDC), chaque révision passant par
-- deux visas avant d'être appliquée.

create type cycle_budget as enum (
  'realiseN1', 'BU', 'PDC02', 'PDC05', 'PDC09', 'PDC11', 'BUN1', 'realiseYTD'
);
create type rubrique_niv1 as enum ('OPEX', 'CAPEX');
create type rubrique_niv2 as enum ('GES', 'Dev_IGP', 'Dev_Projets', 'Dev_Forage', 'Dev_Etudes');
create type type_projet as enum ('avis', 'ddm', 'sor', 'autre');
create type statut_ligne_navette as enum ('en_cours', 'cloture');
-- 4 valeurs depuis le 11/08/2026 : le visa du chef ne fait qu'avancer la
-- révision, c'est celui du directeur technique qui applique la cascade de
-- cycles et débite la cale.
create type statut_arbitrage as enum ('en_attente_chef', 'en_attente_dt', 'valide', 'refuse');

create table navette_lignes (
  id                uuid primary key default gen_random_uuid(),
  code_otp          text not null unique,
  libelle           text not null,
  rubrique_niv1     rubrique_niv1 not null,
  rubrique_niv2     rubrique_niv2 not null,
  type              type_projet not null,
  annee_budget      integer,
  champ_code        text references champs(code),
  charge_affaire_id uuid references utilisateurs(id),
  projet_id         uuid,          -- fk posée en 0004 (projets n'existe pas encore)
  devise            text not null references devises(code),
  work_program      boolean not null default false,
  statut            statut_ligne_navette not null default 'en_cours',
  hypotheses_pdc09  text,
  hypotheses_bun1   text,
  commentaire       text,
  cree_le           timestamptz not null default now(),
  cree_par          uuid references utilisateurs(id)
);

create index navette_lignes_projet on navette_lignes (projet_id);
create index navette_lignes_champ on navette_lignes (champ_code);

-- Les 8 cycles d'une ligne, une ligne par cycle.
--
-- Choix de grain délibéré (doc/schema-supabase.md §C.4) : le cycle est
-- normalisé en lignes, mais les CINQ POSTES restent des colonnes. Les
-- éclater en (cycle, poste, montant) serait plus « pur », mais les cinq
-- postes sont un ensemble fermé, toujours lus ensemble (sommeCycles,
-- coutPrevisionnel = serv + conso) : l'éclatement transformerait chaque
-- lecture en pivot. La normalisation s'arrête là où elle cesse de servir.
--
-- P1 — aucun `default 0` : un poste non renseigné vaut NULL. Un budget
-- inconnu n'est pas un budget nul.
create table navette_cycles (
  ligne_id    uuid not null references navette_lignes(id) on delete cascade,
  cycle       cycle_budget not null,
  conso       numeric,
  serv        numeric,
  log         numeric,
  pers        numeric,
  autres      numeric,
  primary key (ligne_id, cycle)
);

-- Révision proposée sur un cycle. Un seul arbitrage en attente par cycle et
-- par ligne — contrainte vérifiée par la base (index partiel), là où le code
-- devait s'en assurer pour proposer le réajustement plutôt qu'un doublon.
create table navette_arbitrages (
  id                  uuid primary key default gen_random_uuid(),
  ligne_id            uuid not null references navette_lignes(id) on delete cascade,
  cycle               cycle_budget not null,
  montant             numeric not null,
  -- Ventilation du montant sur les 5 postes (même grain que navette_cycles).
  repartition_conso   numeric,
  repartition_serv    numeric,
  repartition_log     numeric,
  repartition_pers    numeric,
  repartition_autres  numeric,
  demandeur_id        uuid not null references utilisateurs(id),
  statut              statut_arbitrage not null default 'en_attente_chef',
  motif_refus         text,
  montant_preleve_cale numeric,
  -- Relevé du réalisé à date capturé AU MOMENT du visa DT (23/08/2026) :
  -- c'est ce qui fait l'historique du YTD par révision.
  releve_ytd_conso    numeric,
  releve_ytd_serv     numeric,
  releve_ytd_log      numeric,
  releve_ytd_pers     numeric,
  releve_ytd_autres   numeric,
  cree_le             timestamptz not null default now()
);

create unique index navette_arbitrages_un_seul_en_attente
  on navette_arbitrages (ligne_id, cycle)
  where statut in ('en_attente_chef', 'en_attente_dt');

create index navette_arbitrages_ligne on navette_arbitrages (ligne_id);

-- Les deux visas, en lignes append-only (P4).
--
-- Aujourd'hui ce sont deux champs d'un même document, réécrits par updateDoc :
-- la garantie « un visa ne se réécrit pas » n'existe que dans le code. Ici,
-- l'absence de policy update/delete (migration RLS) la rend structurelle.
--
-- Un visa porte l'identité de son auteur : c'est ce qui permet de dire, quand
-- un admin supplée les deux étapes (23/08/2026), que les deux visas ont été
-- posés par la même personne — la trace remplace la règle levée.
create table navette_arbitrage_visas (
  id            uuid primary key default gen_random_uuid(),
  arbitrage_id  uuid not null references navette_arbitrages(id) on delete cascade,
  etape         text not null check (etape in ('chef_departement', 'directeur_technique')),
  par_id        uuid not null references utilisateurs(id),
  le            timestamptz not null default now(),
  constraint navette_visas_une_fois_par_etape unique (arbitrage_id, etape)
);
