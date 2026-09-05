-- 0008 — Journaux de terrain : Tonnage échafaudage, Contrat peinture, METAL
--
-- Conception : doc/schema-supabase.md §C.7.
--
-- GAIN STRUCTUREL — la double couche import / saisie disparaît.
--
-- Aujourd'hui, chacun de ces journaux existe DEUX FOIS : le blob importé du
-- classeur (`allow write: if false`, donc une modification ne pouvait pas
-- s'écrire au même endroit) et une collection `*_saisie` en miroir, les deux
-- fusionnées à l'affichage par `combinerParCle()` — 11 collections et 36
-- appels de fusion, chacun avec sa convention de clé.
--
-- Ici : UNE table par journal, une colonne `origine`. Les colonnes sont
-- celles relevées dans le corpus réel (src/data/), pas devinées.

-- ---------------------------------------------------------------------------
-- Tonnage échafaudage — journal des demandes (7 911 lignes au corpus)
-- ---------------------------------------------------------------------------
create table tonnage_journal (
  id                        uuid primary key default gen_random_uuid(),
  origine                   origine_ligne not null default 'saisie',
  projet_id                 uuid references projets(id) on delete set null,

  -- Clé d'upsert du module : le n° de demande est obligatoire depuis le
  -- 06/08/2026 — sans lui, la saisie retombait sur un UUID aléatoire qui
  -- cassait le suivi d'une demande dans le temps.
  numero_demande            text not null,

  date                      date,
  projet                    text,
  champs                    text,
  site                      text,
  services                  text,
  mode_facturation          text check (mode_facturation is null or mode_facturation in ('Core crew', 'Part Variable')),
  demandeur_teepg           text,
  type_echafaudage          text,
  statut                    text,

  date_montage_prev         date,
  date_montage_reel         date,
  date_depose_prev          date,
  date_notification_depose  date,
  date_depose_reel          date,

  -- Cotes saisies. P2 — `m3Reel` et `poidsT` sont DÉRIVÉS des trois cotes
  -- (affichés en dérivé pendant la saisie), donc non stockés.
  longueur_reelle           numeric,
  largeur_reelle            numeric,
  hauteur_reelle            numeric,

  -- Deux valeurs fermées : elles commandent le calcul de la production du
  -- jour (« OUI » = la ligne décrit une modification, son poids contractuel
  -- EST la production du jour).
  modification              text check (modification is null or modification in ('OUI', 'NON')),

  description               text,
  commentaires              text,
  cree_le                   timestamptz not null default now(),
  constraint tonnage_journal_demande_unique unique (numero_demande)
);

create index tonnage_journal_date on tonnage_journal (date);
create index tonnage_journal_projet on tonnage_journal (projet_id);

-- Pointage du personnel (3 384 lignes au corpus).
create table tonnage_personnel (
  id                  uuid primary key default gen_random_uuid(),
  origine             origine_ligne not null default 'saisie',
  date                date not null,
  nom                 text not null,
  numero_demande      text,
  projet              text,
  champs              text,
  site                text,
  services            text,
  mode_facturation    text check (mode_facturation is null or mode_facturation in ('Core crew', 'Part Variable')),
  profil              text not null,
  nombre_heures       numeric,
  standby             numeric,

  -- P2 — `productivite`, `objectifProductionT`, `objectifProductionKg`,
  -- `partTempsProductif` et `npt` sont DÉRIVÉS (formules vérifiées à 0 écart
  -- sur les 3 384 pointages réels). La productivité est le coefficient du
  -- profil, lu dans les paramètres du contrat.
  commentaires        text,
  constraint tonnage_personnel_unicite unique (date, nom, numero_demande)
);

create index tonnage_personnel_date on tonnage_personnel (date);

-- Rapport journalier (lot 3, 03/09/2026) : l'unité « journée » qui manquait
-- au module. Il ne duplique rien — il regroupe, par (date, champ).
create table tonnage_rapports (
  id                    uuid primary key default gen_random_uuid(),
  date                  date not null,
  champ_code            text not null references champs(code),
  redacteur             text,
  societe_executante    text,
  standby_total_heures  numeric,

  -- Compteurs HSE — les MÊMES 6 que le CRJ (jamais redéfinis : deux jeux
  -- d'indicateurs donneraient deux LTIF non comparables). Ils vivent ici, à
  -- la maille du rapport : ce module ne porte ni scope ni tâche, ventiler
  -- aurait inventé une dimension qu'il n'a pas.
  hse_accident_fat      integer,
  hse_accident_lti      integer,
  hse_near_miss_hpi     integer,
  hse_premier_soins     integer,
  hse_causerie_securite integer,
  hse_anomalie          integer,

  -- Workflow d'approbation (lot 7). `approuve_le` nul = pas encore approuvé.
  approuve_par          uuid references utilisateurs(id),
  approuve_le           timestamptz,

  saisi_par             uuid references utilisateurs(id),
  saisi_le              timestamptz not null default now(),
  constraint tonnage_rapports_unicite unique (date, champ_code)
);

-- Ventilation du standby du rapport par cause — le total DOIT être égal au
-- total déclaré (contrôle bloquant côté application, les deux nombres étant
-- sous les yeux de qui saisit).
create table tonnage_rapport_standby (
  id          uuid primary key default gen_random_uuid(),
  rapport_id  uuid not null references tonnage_rapports(id) on delete cascade,
  cause       text not null,
  heures      numeric not null check (heures >= 0),
  constraint tonnage_rapport_standby_unicite unique (rapport_id, cause)
);

create table tonnage_rapport_commentaires (
  id                  uuid primary key default gen_random_uuid(),
  rapport_id          uuid not null references tonnage_rapports(id) on delete cascade,
  auteur_id           uuid references utilisateurs(id),
  texte               text not null,
  signalement_erreur  boolean not null default false,
  cree_le             timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Contrat peinture — JOURNAL de pointage (2 124 lignes au corpus)
-- ---------------------------------------------------------------------------
create table peinture_journal (
  id                    uuid primary key default gen_random_uuid(),
  origine               origine_ligne not null default 'saisie',
  projet_id             uuid references projets(id) on delete set null,

  date                  date not null,
  -- La CATÉGORIE commande le formulaire (§5) : les 5 saisies décrites par le
  -- document sont très différentes. Casse d'origine du classeur CONSERVÉE :
  -- la colonne FILTRE en prend les 4 premiers caractères en la respectant
  -- (« Cons », « Pers ») — la normaliser dédoublerait les entrées du filtre,
  -- bug corrigé le 06/08/2026.
  categorie             text not null,
  type_item             text,
  ctr                   text,
  equipe                text,
  site                  text,
  projet                text,
  tache                 text,
  priorite              text,
  numero_ot             text,
  numero_avis           text,

  qte                   numeric,
  unite                 text,
  surface_totale        numeric,
  surface_realisee      numeric,
  core_crew             numeric,
  hors_core_crew        numeric,

  date_debut            date,
  date_fin              date,

  -- Statut d'affaire (lot 3) et lien de reprise d'un rapport au suivant.
  -- C'est ce lien — et non une recherche « la même affaire la veille » —
  -- qui rend la production journalière calculable : sur les 114 affaires du
  -- classeur, 118 des 625 transitions décroissent, aucune clé plus fine ne
  -- les fait disparaître.
  statut                text,
  ligne_precedente_id   uuid references peinture_journal(id) on delete set null,

  -- P2 — les 10 colonnes dérivées du classeur ne sont PAS stockées :
  -- surface prévisionnelle, %prévisionnel, %réel, durée, les 3 coûts
  -- unitaires (repris du référentiel DATA par type d'item), les coûts
  -- totaux, saving, FILTRE et MOIS. Toutes vérifiées à 0 écart sur les
  -- 2 124 lignes réelles.
  cpy_heures            numeric,
  commentaire           text,
  cree_le               timestamptz not null default now()
);

create index peinture_journal_date on peinture_journal (date);
create index peinture_journal_projet on peinture_journal (projet_id);

-- Numéros d'avis multiples (§6 : « numéro d'avis OU liste des avis »).
create table peinture_journal_avis (
  ligne_id    uuid not null references peinture_journal(id) on delete cascade,
  numero      text not null,
  ordre       integer,
  primary key (ligne_id, numero)
);

create table peinture_rapports (
  id                    uuid primary key default gen_random_uuid(),
  date                  date not null,
  champ_code            text not null references champs(code),
  redacteur             text,
  societe_executante    text,
  standby_total_heures  numeric,
  saisi_par             uuid references utilisateurs(id),
  saisi_le              timestamptz not null default now(),
  constraint peinture_rapports_unicite unique (date, champ_code)
);

create table peinture_rapport_standby (
  id          uuid primary key default gen_random_uuid(),
  rapport_id  uuid not null references peinture_rapports(id) on delete cascade,
  cause       text not null,
  heures      numeric not null check (heures >= 0),
  constraint peinture_rapport_standby_unicite unique (rapport_id, cause)
);

-- ---------------------------------------------------------------------------
-- Travaux METAL (116 affaires au corpus)
-- ---------------------------------------------------------------------------
create table metal_affaires (
  id                      uuid primary key default gen_random_uuid(),
  origine                 origine_ligne not null default 'saisie',
  projet_id               uuid references projets(id) on delete set null,

  affaire                 text not null,
  -- La clé de fusion est l'ID de la ligne, PAS le n° d'avis : vérifié sur
  -- les 116 affaires réelles, l'avis vaut « NC » sur 5 lignes et un même
  -- numéro est porté par 2 affaires distinctes.
  avis                    text,
  ot                      text,
  po                      text,
  champ_code              text references champs(code),
  plateforme              text,
  type_avis               text,
  type_core_crew          text,
  type_travaux            text,
  priorite                text,
  risques                 text,
  statut_travaux          text,

  date_demande            date,
  date_debut_planning     date,
  date_fin_planning_prev  date,
  date_debut_reel         date,
  date_fin_reel           date,

  -- Documentation finale : chaque document a son applicabilité (OUI/NON) et
  -- sa date. Le « check » qui en découle est CALCULÉ (OK si OUI + date, OK
  -- si NON, sinon en cours).
  cfp_applicable          text check (cfp_applicable is null or cfp_applicable in ('OUI', 'NON')),
  cfp_date                date,
  cft_applicable          text check (cft_applicable is null or cft_applicable in ('OUI', 'NON')),
  cft_date                date,
  dfa                     text check (dfa is null or dfa in ('OUI', 'NON')),
  dfa_date                date,

  cout_reel               numeric,

  -- P2 — `statut` (IN PROGRESS / CLOSED) est DÉRIVÉ de l'avancement général
  -- depuis le 04/09/2026, et `statutCorrige` l'a toujours été. Ni l'un ni
  -- l'autre n'est stocké : sur les 116 affaires réelles, 5 étaient laissées
  -- « IN PROGRESS » à 100 % d'avancement par la saisie manuelle — exactement
  -- la dérive que la règle automatique supprime.
  cree_le                 timestamptz not null default now()
);

create index metal_affaires_projet on metal_affaires (projet_id);

-- Avancement par phase — table fille plutôt que 8 colonnes.
--
-- La raison est dans les données : `dureeMto`, `avancementPrefab` et
-- `avancementTravauxSite` portent DEUX types dans le corpus réel — un
-- nombre, ou la chaîne « NA ». C'est le troisième état de P6 : NULL =
-- jamais renseigné, `non_applicable` = décision explicite, `pourcentage` =
-- la valeur. Une moyenne SQL ignore naturellement les deux premiers.
create table metal_avancements (
  affaire_id      uuid not null references metal_affaires(id) on delete cascade,
  phase           text not null check (phase in (
                    'etude', 'duree_mto', 'temps_mis_mto', 'prev_mto',
                    'fourniture', 'prefabrication', 'reparation', 'travaux_site')),
  pourcentage     numeric check (pourcentage is null or (pourcentage >= 0 and pourcentage <= 100)),
  non_applicable  boolean not null default false,
  primary key (affaire_id, phase),
  constraint metal_avancements_exclusif check (
    not (non_applicable and pourcentage is not null)
  )
);

-- Commentaires par étape du formulaire (lot 4, 04/09/2026).
create table metal_commentaires (
  id          uuid primary key default gen_random_uuid(),
  affaire_id  uuid not null references metal_affaires(id) on delete cascade,
  etape       text not null check (etape in (
                'identification', 'planning', 'avancement', 'documentation', 'cloture')),
  texte       text not null,
  ordre       integer,
  cree_le     timestamptz not null default now()
);

create index metal_commentaires_affaire on metal_commentaires (affaire_id);
