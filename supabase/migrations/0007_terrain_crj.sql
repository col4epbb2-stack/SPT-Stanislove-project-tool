-- 0007 — Suivi hebdo CRJ (rapport journalier de chantier)
--
-- Conception : doc/schema-supabase.md §C.7.
--
-- GAIN STRUCTUREL, et c'est le module qui en profite le plus.
--
-- La hiérarchie Phase > Scope > Tâche est aujourd'hui IMBRIQUÉE dans un seul
-- document (`hebdo_crj_journal`), et les lignes de personnel, matériel et HSE
-- la référencent par DES CHAÎNES : `scope` et `tache` sont des `string`, pas
-- des identifiants — « le couple fait la clé ». Renommer une tâche détache
-- donc silencieusement toutes ses lignes.
--
-- C'est aussi le seul module qui a dû corriger DEUX FOIS un écrasement
-- silencieux par clé de document incomplète (04/08/2026 sur la ventilation du
-- standby, 31/08/2026 sur le personnel et le matériel). En clés étrangères,
-- ces deux classes de bugs n'existent plus.

create type origine_ligne as enum ('classeur', 'saisie');
create type type_commentaire_tache as enum ('point_bloquant', 'fait_marquant', 'note');
create type statut_commentaire_tache as enum ('ouvert', 'resolu');

-- Un suivi = une affaire, un jour, un service.
create table crj_suivis (
  id                  uuid primary key default gen_random_uuid(),
  origine             origine_ligne not null default 'saisie',
  date                date not null,
  service             text not null,

  -- Lien EXPLICITE vers la fiche projet. Il était saisi puis jeté avant le
  -- 13/08/2026 (le formulaire proposait « Projet existant » mais n'écrivait
  -- jamais `projetId`), le rattachement retombant sur une cascade floue par
  -- nom qui cassait au moindre renommage.
  projet_id           uuid references projets(id) on delete set null,

  -- Libellés du classeur : ils portent souvent l'intitulé du chantier, pas
  -- le nom de la fiche — conservés même quand une fiche est rattachée.
  projet              text,
  affaire             text,
  core_crew           text,
  contexte            text,
  prevision_travaux_j1 text,
  redacteur           text,

  -- P2 — `statutTravaux`, `societeCtr`, `numeroAvisDdm`, `typeProjet`,
  -- `faitsMarquants`, `plateforme` et les 6 compteurs HSE de l'affaire NE
  -- SONT PAS stockés : tous DÉRIVÉS de ses scopes, tâches et lignes filles
  -- depuis le rev03 (27/08/2026). Les figer les rendrait faux dès la
  -- première tâche modifiée.
  cree_le             timestamptz not null default now(),
  cree_par            uuid references utilisateurs(id)
);

create index crj_suivis_date on crj_suivis (date);
create index crj_suivis_projet on crj_suivis (projet_id);

-- Phase du suivi. « Travaux sur site » est créée d'office ; la dernière ne
-- peut pas être supprimée (les scopes n'auraient plus où s'accrocher) —
-- règle applicative, la base ne la porte pas.
create table crj_phases (
  id          uuid primary key default gen_random_uuid(),
  suivi_id    uuid not null references crj_suivis(id) on delete cascade,
  nom         text not null,
  ordre       integer,
  constraint crj_phases_unicite unique (suivi_id, nom)
);

create table crj_scopes (
  id                uuid primary key default gen_random_uuid(),
  phase_id          uuid not null references crj_phases(id) on delete cascade,
  nom               text not null,
  societe           text,
  points_bloquants  text,
  type_affaire      type_projet,
  -- P2 — `avancementReel` du scope est DÉRIVÉ : moyenne des tâches pointées
  -- dès qu'il y en a, sinon la valeur saisie ci-dessous. Une tâche non
  -- pointée ne compte pas pour 0 : ajouter une tâche ne doit pas faire
  -- chuter l'avancement.
  avancement_saisi  numeric check (avancement_saisi is null or (avancement_saisi >= 0 and avancement_saisi <= 100)),
  avancement_veille numeric check (avancement_veille is null or (avancement_veille >= 0 and avancement_veille <= 100)),
  ordre             integer
);

create index crj_scopes_phase on crj_scopes (phase_id);

-- Numéros d'avis du scope — descendus de l'affaire au scope par le rev03.
-- En lignes plutôt qu'en tableau : c'est par eux que le suivi se rattache à
-- une fiche projet quand aucun `projet_id` explicite n'est posé.
create table crj_scope_avis (
  scope_id    uuid not null references crj_scopes(id) on delete cascade,
  numero      text not null,
  primary key (scope_id, numero)
);

-- La tâche : le grain auquel TOUT est rattaché depuis le rev04.
create table crj_taches (
  id                uuid primary key default gen_random_uuid(),
  scope_id          uuid not null references crj_scopes(id) on delete cascade,
  nom               text not null,
  date_debut        date,
  date_fin          date,
  avancement_reel   numeric check (avancement_reel is null or (avancement_reel >= 0 and avancement_reel <= 100)),

  -- Une tâche ANNULÉE est écartée de l'avancement du scope et de son
  -- planning, mais reste entièrement visible (barrée, avec son motif).
  annulee           boolean not null default false,
  motif_annulation  text,

  -- Cascade tâche > scope > affaire : ces trois champs sont facultatifs ici,
  -- une tâche qui n'en porte pas hérite du niveau au-dessus.
  core_crew         text,
  plateforme        text,
  societe           text,

  ordre             integer,
  constraint crj_taches_unicite unique (scope_id, nom),
  constraint crj_taches_motif_si_annulee check (annulee or motif_annulation is null),
  constraint crj_taches_dates_ordonnees check (
    date_debut is null or date_fin is null or date_fin >= date_debut
  )
);

create index crj_taches_scope on crj_taches (scope_id);

-- P2 — le STATUT d'une tâche est calculé (0-99 % = en cours, 100 % =
-- terminé, annulée = annulé, jamais pointée = non pointée). Il n'est pas
-- stocké : une tâche sans pourcentage n'a pas de statut, elle n'en a pas
-- encore.

create table crj_tache_commentaires (
  id          uuid primary key default gen_random_uuid(),
  tache_id    uuid not null references crj_taches(id) on delete cascade,
  type        type_commentaire_tache not null,
  texte       text not null,
  -- Facultatif : « éventuel » (rev04). Un point bloquant déclaré RÉSOLU ne
  -- remonte plus aux points bloquants du scope ; un point SANS statut y
  -- remonte toujours — une absence n'est pas une résolution.
  statut      statut_commentaire_tache,
  saisi_par   uuid references utilisateurs(id),
  saisi_le    timestamptz not null default now()
);

create index crj_tache_commentaires_tache on crj_tache_commentaires (tache_id);

-- ---------------------------------------------------------------------------
-- Lignes filles — rattachées à la TÂCHE (rev04), ou à l'affaire entière
-- (`tache_id` nul : supervision, ou lignes reprises du classeur).
--
-- Les clés composites qui les identifiaient — idDocument(date, affaireId,
-- scope, tache, societe, profil) — deviennent de vraies contraintes UNIQUE.
-- ---------------------------------------------------------------------------
create table crj_personnel (
  id                    uuid primary key default gen_random_uuid(),
  origine               origine_ligne not null default 'saisie',
  suivi_id              uuid not null references crj_suivis(id) on delete cascade,
  tache_id              uuid references crj_taches(id) on delete cascade,
  date                  date not null,
  societe               text not null,
  profil                text not null,
  quantite              numeric not null,
  core_crew             text,
  prod_previsionnelle   numeric,
  prod_reelle           numeric,
  -- P2 — `dureeStandBy` est la SOMME de la ventilation par cause
  -- (crj_derives_planning) : dérivée, pas stockée.
  constraint crj_personnel_unicite unique (suivi_id, tache_id, societe, profil)
);

create index crj_personnel_suivi on crj_personnel (suivi_id);

create table crj_materiel (
  id                  uuid primary key default gen_random_uuid(),
  origine             origine_ligne not null default 'saisie',
  suivi_id            uuid not null references crj_suivis(id) on delete cascade,
  tache_id            uuid references crj_taches(id) on delete cascade,
  date                date not null,
  societe             text not null,
  materiel            text not null,
  quantite            numeric not null,
  -- Heures d'utilisation (rev04) : la donnée qui manquait à
  -- `coutStandbyMateriel()` depuis le 28/07/2026. ABSENTE, l'inactivité est
  -- approximée par le taux de standby du personnel du même jour — et le
  -- régime appliqué est exposé, pour qu'un écran ne fasse jamais passer une
  -- estimation pour une mesure. Une absence n'est PAS 0 h : 0 h signifierait
  -- « matériel inutilisé toute la journée » et gonflerait le coût.
  heures_utilisation  numeric check (heures_utilisation is null or heures_utilisation >= 0),
  observation         text,
  constraint crj_materiel_unicite unique (suivi_id, tache_id, societe, materiel)
);

create index crj_materiel_suivi on crj_materiel (suivi_id);

-- Ventilation du standby par cause. Une même ligne de personnel peut
-- ventiler son standby entre plusieurs causes (« 6h = 2h météo + 1h
-- logistique + 3h FRC ») : d'où une ligne par cause, et non des colonnes.
--
-- C'est le correctif structurel du bug du 04/08/2026 : la clé de document
-- ne distinguait pas une cause d'une autre, si bien que ventiler sur
-- plusieurs causes écrivait plusieurs fois le même document — la dernière
-- écrasant les précédentes en silence.
create table crj_derives_planning (
  id            uuid primary key default gen_random_uuid(),
  origine       origine_ligne not null default 'saisie',
  suivi_id      uuid not null references crj_suivis(id) on delete cascade,
  personnel_id  uuid references crj_personnel(id) on delete cascade,
  date          date not null,
  cause         text not null,
  duree_stb     numeric not null check (duree_stb >= 0),
  commentaire   text,
  constraint crj_derives_unicite unique (suivi_id, personnel_id, cause)
);

-- Événements HSE, ventilés par société ET par scope (rev02), plus la tâche
-- (rev03). Les 6 compteurs de l'affaire en sont la SOMME (P2).
create table crj_hse_evenements (
  id                  uuid primary key default gen_random_uuid(),
  suivi_id            uuid not null references crj_suivis(id) on delete cascade,
  scope_id            uuid references crj_scopes(id) on delete cascade,
  tache_id            uuid references crj_taches(id) on delete cascade,
  date                date not null,
  societe             text not null,
  accident_fat        integer not null default 0 check (accident_fat >= 0),
  accident_lti        integer not null default 0 check (accident_lti >= 0),
  near_miss_hpi       integer not null default 0 check (near_miss_hpi >= 0),
  premier_soins       integer not null default 0 check (premier_soins >= 0),
  causerie_securite   integer not null default 0 check (causerie_securite >= 0),
  anomalie            integer not null default 0 check (anomalie >= 0),
  constraint crj_hse_unicite unique (suivi_id, scope_id, tache_id, societe)
);

-- NB : les compteurs HSE portent `default 0`, seule exception assumée à P1.
-- Ici zéro est une VALEUR — « aucun accident ce jour » est une information,
-- et c'est même la bonne nouvelle qu'on vient vérifier. Ce n'est pas le cas
-- d'un montant ou d'un tarif, où l'absence doit rester lisible.

create index crj_hse_suivi on crj_hse_evenements (suivi_id);
