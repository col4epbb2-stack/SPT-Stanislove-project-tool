-- 0011 — Contrat EPCM (personnel affecté à un contrat forfaitaire mensuel)
--
-- Conception : doc/schema-supabase.md §C.8.
--
-- Règle centrale du module, à connaître avant de toucher aux calculs : une
-- journée compte comme travaillée si le POINTAGE le dit, et à défaut de
-- pointage si le PLANNING le dit. Le planning porte le prévu, le pointage le
-- réalisé.

create type type_contrat_employe as enum ('CDI', 'CDD', 'AGREMENT');
create type type_affectation_employe as enum ('BUREAU', 'OFFSHORE', 'ONSHORE');
create type statut_signature_contrat as enum ('SIGNE', 'NON_SIGNE', 'CLAUSES_ACCEPTEES');

-- Les 6 affectations POSABLES depuis le rev01 (la palette est passée de 9 à
-- 6). Les trois retirées — REPOS, MISSION, FORMATION — restent dans le type
-- parce que des journées déjà planifiées les portent : les retirer les
-- ferait littéralement disparaître du calendrier.
create type type_affectation_jour as enum (
  'SITE', 'BUREAU', 'ROTATION', 'CONGE', 'ABSENCE_JUSTIFIEE', 'ABSENCE_NON_JUSTIFIEE',
  'REPOS', 'MISSION', 'FORMATION'
);

create table epcm_contrats (
  id                  uuid primary key default gen_random_uuid(),
  reference           text not null unique,
  intitule            text,
  -- Rattachement au module Contrats (lot 4 du rev00) : une fois lié, valeur
  -- cible, AVC et consommation sont AFFICHÉS EN LECTURE et ne se saisissent
  -- pas ici — les redemander ferait exister deux vérités pour un contrat.
  contrat_portfolio_id uuid references contrats(id) on delete set null,
  devise              text references devises(code),
  forfait_mensuel     numeric,
  -- Donnée d'entrée du KPI « taux de consommation des jours commandés » :
  -- l'application savait compter les jours consommés, pas ceux achetés.
  -- NULL = pas de dénominateur, donc PAS DE TAUX (et non un taux de 0).
  jours_commandes     numeric,
  date_debut          date,
  date_fin            date,
  cree_le             timestamptz not null default now()
);

-- Aucun employé n'est pré-créé, aucun coût journalier par défaut, aucun
-- budget de démonstration : une valeur inventée se retrouverait dans les
-- coûts et les alertes comme si elle était réelle. Un employé sans coût
-- journalier pèse 0 et l'écran le signale (« à définir »).
create table epcm_employes (
  id                      uuid primary key default gen_random_uuid(),
  contrat_id              uuid references epcm_contrats(id) on delete set null,
  nom                     text not null,
  prenom                  text not null,
  fonction                text,
  discipline              text,
  service                 text,
  site                    text,
  responsable             text,

  type_contrat            type_contrat_employe,
  type_affectation        type_affectation_employe,

  -- P6 — `ecarte` remplace l'ancien `statut ACTIF/INACTIF` : depuis le lot 7
  -- du rev01, l'activité est DÉRIVÉE des dates de contrat. Ce drapeau ne dit
  -- plus « cette personne est active » mais « cette personne a été écartée à
  -- la main » — il prime sur les dates, et reste le moyen d'écarter
  -- quelqu'un sans le supprimer.
  ecarte                  boolean not null default false,

  date_debut_contrat      date,
  date_fin_contrat        date,
  statut_signature        statut_signature_contrat,

  -- Rotation : UNE paire de dates, le cycle se répète (rev01 lot 6). L'écart
  -- montée -> descente donne la durée sur site ; la période de repos est de
  -- même durée. C'est le « 28/28 » exprimé PAR LES DATES plutôt que codé en
  -- dur — un cycle 14/14 fonctionne sans rien changer.
  date_debut_rotation     date,
  date_fin_rotation       date,

  -- Le binôme est un LIEN, pas un nom recopié : recopier le nom romprait le
  -- binôme au premier renommage.
  binome_id               uuid references epcm_employes(id) on delete set null,

  date_visite_medicale    date,
  -- P2 — l'expiration de la visite médicale (+12 mois) est CALCULÉE. La
  -- saisir en double permettrait aux deux valeurs de diverger.

  -- Les deux formes de rémunération COEXISTENT (§6) : salaire mensuel (CDI,
  -- CDD — payé quel que soit le nombre de jours) et taux journalier
  -- (freelance sous agrément — payé au jour presté). C'est de là que vient
  -- l'écart entre coût pointé et coût réel payé.
  cout_journalier         numeric,
  salaire_brut            numeric,
  devise_salaire          text references devises(code),
  cout_mensuel_vendu      numeric,
  quota_jours_mois        numeric,

  cree_le                 timestamptz not null default now(),
  constraint epcm_employes_pas_son_propre_binome check (binome_id is null or binome_id <> id)
);

create index epcm_employes_contrat on epcm_employes (contrat_id);

-- Une habilitation SANS date d'expiration n'expire jamais : contrairement à
-- la visite médicale, aucune durée commune n'est donnée et elles n'ont pas
-- toutes la même — en inventer une ferait expirer des habilitations valides.
create table epcm_habilitations (
  id              uuid primary key default gen_random_uuid(),
  employe_id      uuid not null references epcm_employes(id) on delete cascade,
  libelle         text not null,
  date_obtention  date,
  date_expiration date
);

-- Un renouvellement REPOUSSE l'échéance : la fin de contrat effective est la
-- plus tardive entre la fin initiale et celle du dernier renouvellement.
create table epcm_renouvellements (
  id          uuid primary key default gen_random_uuid(),
  employe_id  uuid not null references epcm_employes(id) on delete cascade,
  debut       date,
  fin         date,
  constraint epcm_renouvellements_ordre check (debut is null or fin is null or fin >= debut)
);

-- ---------------------------------------------------------------------------
-- Planning et pointage — UNE LIGNE PAR JOUR.
--
-- GAIN STRUCTUREL : aujourd'hui c'est un document par employé et par MOIS,
-- portant `jours: Record<'YYYY-MM-DD', affectation>` — choix explicitement
-- fait « pour ~40 documents mensuels au lieu de ~1 200 ». C'est une
-- optimisation de facturation Firestore, pas un modèle. En Postgres, 1 200
-- lignes ne sont rien, et une ligne par jour rend indexable et requêtable ce
-- qui demandait de charger douze documents pour compter les jours d'une année.
-- ---------------------------------------------------------------------------
create table epcm_planning (
  employe_id  uuid not null references epcm_employes(id) on delete cascade,
  date        date not null,
  affectation type_affectation_jour not null,
  primary key (employe_id, date)
);

create index epcm_planning_date on epcm_planning (date);

create table epcm_pointages (
  employe_id      uuid not null references epcm_employes(id) on delete cascade,
  date            date not null,

  -- On pointe des JOURS depuis le rev01, plus des heures : les heures en
  -- sont dérivées (jours x 12). Un jour + 6 h supplémentaires = 1,5 jour.
  jours           numeric check (jours is null or jours >= 0),
  heures_sup      numeric check (heures_sup is null or heures_sup >= 0),

  -- Le SEUL champ obligatoire du formulaire, et seulement quand il y a des
  -- heures supplémentaires : « cette information impacte directement la
  -- facturation ». Écart assumé avec le parti pris habituel (avertir plutôt
  -- que bloquer) — ici l'information est entre les mains de qui saisit, à
  -- l'instant où il saisit.
  motif_heures_sup text,
  retard_minutes  integer check (retard_minutes is null or retard_minutes >= 0),
  affectation     type_affectation_jour,

  -- Un jour posé par la machine est une DÉDUCTION du planning ; un jour
  -- saisi est une DÉCLARATION. Les confondre ferait passer une hypothèse
  -- pour un constat dans les coûts et les rapports. Ne change rien aux
  -- calculs — se lit à l'écran, et tombe dès que la case est reprise.
  prerempli       boolean not null default false,

  primary key (employe_id, date),
  constraint epcm_pointages_motif_si_sup check (
    heures_sup is null or heures_sup = 0 or motif_heures_sup is not null
  )
);

create index epcm_pointages_date on epcm_pointages (date);

-- Relevé HSE hebdomadaire — doc ID = le LUNDI de la semaine, pour que
-- réenregistrer la même semaine mette à jour au lieu d'empiler des doublons :
-- un incident ne doit pas compter deux fois parce que la saisie a été reprise.
--
-- P2 — les heures travaillées NE SONT PAS saisies : jours pointés x 12.
-- C'est déjà la règle du CRJ, vérifiée sur données réelles le 30/07/2026.
create table epcm_hse (
  id                  uuid primary key default gen_random_uuid(),
  contrat_id          uuid references epcm_contrats(id) on delete cascade,
  semaine             date not null,
  fat                 integer,
  lti                 integer,
  chse                integer,
  mtc                 integer,
  fac                 integer,
  hpi                 integer,
  anomalies           integer,
  audits              integer,
  faits_marquants     text,
  saisi_par           uuid references utilisateurs(id),
  saisi_le            timestamptz not null default now(),
  constraint epcm_hse_unicite unique (contrat_id, semaine),
  -- La semaine est identifiée par son lundi.
  constraint epcm_hse_lundi check (extract(isodow from semaine) = 1)
);

-- ---------------------------------------------------------------------------
-- Historique d'audit — APPEND-ONLY (P4), une entrée par champ modifié.
--
-- `epcm_historique` est en CRÉATION SEULE : ni update ni delete, pas même
-- pour un admin. Une trace réécrite ne prouve plus rien. Toutes les
-- écritures du module passent par une seule couche pour cette raison, et
-- l'entrée d'audit part dans LA MÊME TRANSACTION que la donnée.
-- ---------------------------------------------------------------------------
create table epcm_historique (
  id              uuid primary key default gen_random_uuid(),
  entite          text not null check (entite in (
                    'EMPLOYE', 'PLANNING', 'POINTAGE', 'ROTATION', 'CONTRAT', 'PROFIL', 'HSE')),
  entite_id       text not null,
  champ           text not null,
  ancienne_valeur text,
  nouvelle_valeur text,
  par_id          uuid references utilisateurs(id),
  le              timestamptz not null default now()
);

create index epcm_historique_entite on epcm_historique (entite, entite_id, le desc);
