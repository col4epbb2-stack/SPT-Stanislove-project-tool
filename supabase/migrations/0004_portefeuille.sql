-- 0004 — Portefeuille projet (la fiche projet et tout ce qu'elle porte)
--
-- Conception : doc/schema-supabase.md §C.3.
--
-- C'est ici que le `jsonb` de facilité aurait fait le plus de dégâts :
-- `Projet` porte 47 champs de type tableau, imbriqués sur deux niveaux.
-- La table `projets` ne garde que les champs SCALAIRES (~20 colonnes contre
-- ~60 aujourd'hui) ; tout le reste est en tables reliées.
--
-- P7 — les champs de compatibilité ne sont PAS repris : `risques` /
-- `mitigationRisques` (texte libre, remplacés par projet_risques),
-- `opportunites` / `gainsAttendus`, `pointBloquant` de fiche (modèle
-- intermédiaire d'une seule journée), `ancienSnapshotHSE`, `avisNumero` au
-- singulier, `travauxTerrain` (saisies manuelles abandonnées le 18/08/2026).

create type etat_global as enum ('bon', 'moyen', 'critique');
create type service_client as enum ('exploitation', 'maintenance', 'projets', 'hse', 'logistique', 'autre');
create type vue_planning as enum ('baseline', 'forecast', 'reel');
create type statut_action as enum ('ouverte', 'en_cours', 'cloturee');

create table projets (
  id                    uuid primary key default gen_random_uuid(),
  nom                   text not null,
  type                  type_projet not null,
  service_client        service_client not null,
  etat_global           etat_global not null default 'bon',
  agent_id              uuid references utilisateurs(id),
  champ_code            text references champs(code),
  code_otp              text,
  work_program          boolean not null default false,
  devise                text not null references devises(code),
  budget_previsionnel   numeric,
  estimation_reelle     numeric,
  date_debut            date,
  date_fin              date,
  contexte              text,
  fournisseur           text,
  -- Source du budget de la courbe en S : cycle lu sur la ligne navette liée.
  -- NULL = budget initial (BU), la première source citée par le document.
  source_budget_courbe  cycle_budget,
  cree_le               timestamptz not null default now()
);

create index projets_agent on projets (agent_id);
create index projets_champ on projets (champ_code);
create index projets_code_otp on projets (code_otp);

-- La fk de navette_lignes vers projets, annoncée en 0003.
alter table navette_lignes add constraint navette_lignes_projet_fk
  foreign key (projet_id) references projets(id) on delete set null;

-- ---------------------------------------------------------------------------
-- Références du projet : c'est par elles que les journaux de terrain se
-- rattachent à la fiche (le résolveur n'indexe que ça).
--
-- Un seul modèle pour quatre natures, là où la fiche portait `codeOTP`,
-- `codesOTP[]`, `avisNumeros[]`, `numerosOT[]`, `plateformes[]` ET
-- `referencesOT[]` (le lien OT vers avis) en six champs distincts.
--
-- `parent_id` porte ce lien : un OT regroupe plusieurs avis, un avis ne
-- dépend que d'un seul OT (22/08/2026).
-- ---------------------------------------------------------------------------
create table projet_references (
  id          uuid primary key default gen_random_uuid(),
  projet_id   uuid not null references projets(id) on delete cascade,
  type        text not null check (type in ('avis', 'ot', 'otp', 'plateforme')),
  valeur      text not null,
  parent_id   uuid references projet_references(id) on delete set null,
  constraint projet_references_unicite unique (projet_id, type, valeur),
  -- Un avis peut être rattaché à un OT ; l'inverse n'a pas de sens.
  constraint projet_references_parent_ot check (parent_id is null or type = 'avis')
);

create index projet_references_valeur on projet_references (type, valeur);

-- ---------------------------------------------------------------------------
-- Analyse de risques et d'opportunités — un couple par ligne (23/08/2026).
-- Un risque SANS mitigation s'enregistre : c'est l'état normal d'un début
-- d'analyse, signalé à l'écran mais jamais bloqué.
-- ---------------------------------------------------------------------------
create table projet_risques (
  id          uuid primary key default gen_random_uuid(),
  projet_id   uuid not null references projets(id) on delete cascade,
  risque      text not null,
  mitigation  text,
  ordre       integer
);

create table projet_opportunites (
  id            uuid primary key default gen_random_uuid(),
  projet_id     uuid not null references projets(id) on delete cascade,
  opportunite   text not null,
  gain          text,
  ordre         integer
);

-- ---------------------------------------------------------------------------
-- Phases et planning.
--
-- GAIN STRUCTUREL (doc/schema-supabase.md §C.3) : le planning a trois vues
-- qui décrivent LE MÊME TRAVAIL — seules les dates changent. Aujourd'hui
-- c'est trois copies de chaque tâche, et le code maintient leur cohérence à
-- la main (`definirGabaritTache` écrit dans les trois vues « parce que le
-- gabarit est une propriété de la tâche, pas de la vue » ; `forecastHerite`
-- recalcule l'héritage à chaque lecture).
--
-- Ici : ce qui appartient à la tâche est dans `taches`, ce qui appartient à
-- la vue est dans `tache_vues`. Le forecast n'a plus rien à hériter — il
-- n'a jamais eu que ses dates.
-- ---------------------------------------------------------------------------
create table phases (
  id          uuid primary key default gen_random_uuid(),
  projet_id   uuid not null references projets(id) on delete cascade,
  nom         text not null,
  ordre       integer,
  constraint phases_unicite unique (projet_id, nom)
);

-- Point bloquant d'une phase (18/08/2026) — un seul par phase, et c'est le
-- seul état qui colore le diagramme en rouge.
--
-- P6 : trois états distingués — aucune ligne = jamais renseigné ;
-- `leve_le` nul = blocage en cours ; `leve_le` renseigné = déclaré levé.
-- Sans cette distinction, lever un blocage le ferait réapparaître au rendu
-- suivant.
create table phase_points_bloquants (
  phase_id      uuid primary key references phases(id) on delete cascade,
  description   text not null,
  mitigation    text,
  declare_le    timestamptz not null default now(),
  leve_le       timestamptz
);

-- Identité de la tâche : ce qui ne dépend PAS de la vue.
create table taches (
  id                uuid primary key default gen_random_uuid(),
  projet_id         uuid not null references projets(id) on delete cascade,
  phase_id          uuid references phases(id) on delete set null,
  nom               text not null,
  ordre             integer,
  -- Courbe type retenue (1 à 5, feuille « typical S curve » du classeur).
  -- Défaut applicatif : 4 (Construction EPC) pour une tâche créée dans
  -- l'app ; NULL pour une tâche importée qui n'en portait pas — sans
  -- gabarit, la courbe est un escalier, pas une courbe en S.
  courbe_type       smallint check (courbe_type between 1 and 5),
  budget            numeric,
  type              text,
  classification    text,
  service           text,
  champ_code        text references champs(code),
  plateforme        text,
  code_phase        text
);

create index taches_projet on taches (projet_id);
create index taches_phase on taches (phase_id);

-- Ce qui dépend de la vue : les dates, et l'avancement qu'elles calculent.
--
-- P2 — `duree_jours`, `ponderation`, `ponderation_par_phase` et `bu_phase`
-- NE SONT PAS stockées : ce sont des formules du classeur, vérifiées à 0
-- écart sur 118 pondérations et 3 127 cellules hebdomadaires. Les figer les
-- rendrait fausses au premier changement de date.
create table tache_vues (
  tache_id    uuid not null references taches(id) on delete cascade,
  vue         vue_planning not null,
  date_debut  date,
  date_fin    date,
  avancement  numeric check (avancement is null or (avancement >= 0 and avancement <= 1)),
  primary key (tache_id, vue),
  constraint tache_vues_dates_ordonnees check (
    date_debut is null or date_fin is null or date_fin >= date_debut
  )
);

-- Relevé hebdomadaire du Réalisé (22/08/2026) : la feuille du classeur fait
-- saisir le pointage DANS la cellule de sa semaine. Une ligne par semaine
-- pointée — vider une case efface le relevé, une cellule vidée ne vaut pas
-- zéro (donc : pas de ligne, et non une ligne à 0).
create table tache_releves_hebdo (
  tache_id    uuid not null references taches(id) on delete cascade,
  semaine     date not null,
  avancement  numeric not null check (avancement >= 0 and avancement <= 1),
  primary key (tache_id, semaine)
);

-- ---------------------------------------------------------------------------
-- Suivi, HSE, hypothèses, actions, commentaires
-- ---------------------------------------------------------------------------
create table projet_modifications_scope (
  id                          uuid primary key default gen_random_uuid(),
  projet_id                   uuid not null references projets(id) on delete cascade,
  phase_id                    uuid references phases(id) on delete set null,
  date                        date not null,
  date_demandee               date,
  description                 text not null,
  delai_supplementaire_jours  integer,
  impact_financier            numeric
);

-- Saisie HSE mensuelle. Les heures travaillées sont SAISIES ici — à la
-- différence du module EPCM, où elles valent jours pointés x 12.
create table projet_hse_mensuel (
  id                  uuid primary key default gen_random_uuid(),
  projet_id           uuid not null references projets(id) on delete cascade,
  annee               integer not null,
  mois                smallint not null check (mois between 1 and 12),
  heures_travaillees  numeric,
  fat                 integer,
  lti                 integer,
  chse                integer,
  mtc                 integer,
  fac                 integer,
  hpi                 integer,
  anomalies           integer,
  audits              integer,
  constraint projet_hse_mensuel_unicite unique (projet_id, annee, mois)
);

create table projet_hse_actions (
  id            uuid primary key default gen_random_uuid(),
  projet_id     uuid not null references projets(id) on delete cascade,
  description   text not null,
  statut        text not null check (statut in ('ouverte', 'cloturee')),
  cree_le       timestamptz not null default now()
);

create table projet_hypotheses (
  id                uuid primary key default gen_random_uuid(),
  projet_id         uuid not null references projets(id) on delete cascade,
  titre             text not null,
  avantages         text,
  inconvenients     text,
  contraintes       text,
  points_bloquants  text,
  plan_action       text,
  retenue           boolean not null default false,
  validee_par_id    uuid references utilisateurs(id),
  validee_le        timestamptz
);

-- Commentaires : deux fils DISTINCTS et volontairement séparés — celui de la
-- fiche (plusieurs par jour attendus, donc horodatage complet) et celui qui
-- ne commente que les scénarios d'hypothèses. `hypothese_id` nul = fil de la
-- fiche.
create table projet_commentaires (
  id            uuid primary key default gen_random_uuid(),
  projet_id     uuid not null references projets(id) on delete cascade,
  hypothese_id  uuid references projet_hypotheses(id) on delete cascade,
  auteur_id     uuid references utilisateurs(id),
  texte         text not null,
  cree_le       timestamptz not null default now()
);

create index projet_commentaires_projet on projet_commentaires (projet_id);

create table projet_actions (
  id                  uuid primary key default gen_random_uuid(),
  projet_id           uuid not null references projets(id) on delete cascade,
  origine             text,
  commentaire         text,
  action_corrective   text,
  responsable_id      uuid references utilisateurs(id),
  date_cible          date,
  date_reelle_cloture date,
  statut              statut_action not null default 'ouverte',
  cree_le             timestamptz not null default now()
);

-- Signaux propagés depuis les commentaires Navette / Feuille de route.
create table projet_signaux_externes (
  id          uuid primary key default gen_random_uuid(),
  projet_id   uuid not null references projets(id) on delete cascade,
  source      text not null,
  texte       text not null,
  cree_le     timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Pièces jointes — métadonnées seules.
--
-- Le binaire va dans Supabase Storage (`chemin_storage`), et NON en base 64
-- dans la base : c'est le contournement imposé par Firebase Storage
-- (payant, refusé), qui plafonnait un fichier non compressible à 650 Ko
-- contre 10 Mo. Le plafond disparaît.
--
-- La séparation contenu / métadonnées reste : lister les photos d'un
-- chantier ne doit pas les télécharger toutes.
-- ---------------------------------------------------------------------------
create table pieces_jointes (
  id              uuid primary key default gen_random_uuid(),
  chemin_storage  text not null unique,
  nom             text not null,
  type_mime       text,
  taille_octets   bigint,
  -- Rattachement polymorphe : la pièce jointe appartient à une entité dont
  -- la nature varie (fiche projet, hypothèse, affaire CRJ, scope...).
  entite          text not null,
  entite_id       uuid not null,
  ajoute_par      uuid references utilisateurs(id),
  ajoute_le       timestamptz not null default now()
);

create index pieces_jointes_entite on pieces_jointes (entite, entite_id);
