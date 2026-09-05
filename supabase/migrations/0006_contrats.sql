-- 0006 — Contrats, commandes, factures
--
-- Conception : doc/schema-supabase.md §C.6.
--
-- Une commande peut exister SANS fiche projet (doc/module contrat.docx §3 :
-- topographie, EPCM « sans forcément être rattaché à un projet classique »).
-- C'est pourquoi `commandes` est une table à part entière et non une liste
-- imbriquée dans la fiche projet.

create table contrats (
  id                      uuid primary key default gen_random_uuid(),
  reference               text not null unique,
  intitule                text,
  type                    text not null,
  fournisseur_id          uuid references fournisseurs(id),
  devise                  text not null references devises(code),

  -- P2 — VALEUR INITIALE seule : celle qui a été signée. La valeur cible
  -- ACTUELLE (= initiale + somme des AVC) est dérivée, jamais stockée. Un
  -- chiffre recopié devient faux au premier AVC.
  valeur_cible_initiale   numeric,

  date_debut              date,
  date_fin                date,
  option_renouvellement   boolean not null default false,
  responsable_client_nom  text,
  responsable_client_email text,
  responsable_fournisseur_nom text,
  responsable_fournisseur_email text,
  commentaire             text,
  cree_le                 timestamptz not null default now()
);

-- Contrat rattaché à des fiches projet — n-n (`projetIds[]` aujourd'hui).
create table contrat_projets (
  contrat_id  uuid not null references contrats(id) on delete cascade,
  projet_id   uuid not null references projets(id) on delete cascade,
  primary key (contrat_id, projet_id)
);

-- Augmentations de valeur cible — APPEND-ONLY (P4).
--
-- Le numéro d'AVC (AVC1, AVC2...) est le rang chronologique, CALCULÉ et non
-- stocké : le stocker permettrait à deux AVC de porter le même. Deux
-- augmentations du même jour sont départagées par `saisi_le`.
--
-- Aucune policy update/delete (voir migration RLS) : la valeur cible se
-- déduit de cette suite, une augmentation réécrite après coup changerait un
-- budget déjà arbitré sans laisser de trace.
create table contrat_avc (
  id              uuid primary key default gen_random_uuid(),
  contrat_id      uuid not null references contrats(id) on delete cascade,
  date            date not null,
  montant_ajoute  numeric not null,
  commentaire     text,
  saisi_par       uuid references utilisateurs(id),
  saisi_le        timestamptz not null default now()
);

create index contrat_avc_contrat on contrat_avc (contrat_id, date, saisi_le);

-- Consommation saisie à la main (contrats sans commandes : TIG, plongée...).
-- Reste distincte de la consommation dérivée des factures : sans ça, une
-- même dépense saisie ici ET facturée sur une commande passerait pour deux
-- consommations sans qu'on puisse le voir.
create table contrat_consommations (
  id          uuid primary key default gen_random_uuid(),
  contrat_id  uuid not null references contrats(id) on delete cascade,
  annee       integer not null,
  mois        smallint not null check (mois between 1 and 12),
  montant     numeric,
  commentaire text,
  constraint contrat_consommations_unicite unique (contrat_id, annee, mois)
);

-- ---------------------------------------------------------------------------
-- Commandes
-- ---------------------------------------------------------------------------
create table commandes (
  id                uuid primary key default gen_random_uuid(),
  numero            text not null,
  contrat_id        uuid references contrats(id) on delete set null,

  -- L'IMPUTATION : la fiche projet qui porte le montant. Distincte des
  -- affaires que la commande « concerne » (table commande_projets) — sans
  -- cette distinction, le montant serait compté sur chacune des affaires
  -- citées, donc plusieurs fois.
  projet_id         uuid references projets(id) on delete set null,

  -- P2 — montant INITIAL seul ; le montant actuel = initial + augmentations.
  -- Le montant ne se corrige pas : il ne change que par une augmentation, qui
  -- laisse une trace. Le corriger sur place effacerait la différence entre
  -- « la commande valait 500 000 » et « on l'a portée à 600 000 ».
  montant_initial   numeric,

  fournisseur       text,
  libelle           text,
  objet             text,
  commentaire       text,
  cree_le           timestamptz not null default now(),
  constraint commandes_numero_unique unique (numero)
);

create index commandes_contrat on commandes (contrat_id);
create index commandes_projet on commandes (projet_id);

-- APPEND-ONLY (P4), même régime que contrat_avc.
create table commande_augmentations (
  id              uuid primary key default gen_random_uuid(),
  commande_id     uuid not null references commandes(id) on delete cascade,
  date            date not null,
  montant_ajoute  numeric not null,
  commentaire     text,
  saisi_par       uuid references utilisateurs(id),
  saisi_le        timestamptz not null default now()
);

create index commande_augmentations_commande on commande_augmentations (commande_id, date, saisi_le);

-- Affaires que la commande concerne (§5 de module contrat_rev01) — n-n.
--
-- Deux natures qui ne doivent JAMAIS être confondues : une fiche projet
-- choisie est un identifiant (elle se résout, porte un budget et des
-- journaux) ; un intitulé créé est une chaîne qui ne pointe vers rien. La
-- contrainte impose exactement l'un des deux — ce que le code vérifie
-- aujourd'hui à la main.
create table commande_projets (
  id          uuid primary key default gen_random_uuid(),
  commande_id uuid not null references commandes(id) on delete cascade,
  projet_id   uuid references projets(id) on delete cascade,
  libelle     text,
  constraint commande_projets_exclusif check (
    (projet_id is not null and libelle is null)
    or (projet_id is null and libelle is not null)
  )
);

create unique index commande_projets_unicite_projet
  on commande_projets (commande_id, projet_id) where projet_id is not null;
create unique index commande_projets_unicite_libelle
  on commande_projets (commande_id, libelle) where libelle is not null;

-- ---------------------------------------------------------------------------
-- Factures — une facture suit sa commande (§5 : « une facture doit pouvoir
-- être rattachée à une commande »), d'où la fk obligatoire.
--
-- Le WORKFLOW en 7 étapes (la Validation DO ajoutée par le rev01 s'insère
-- entre CGE et le paiement). Chaque étape porte son booléen ET sa date :
-- un booléen non renseigné n'est PAS « Non » — le fichier de suivi Excel
-- distingue une case vide d'un « NON » explicite.
--
-- P2 — le statut PAYÉE / IMPAYÉE n'est PAS une colonne : il se déduit du
-- seul `paiement_realise`. Une facture ayant franchi les six premières
-- étapes reste IMPAYÉE.
--
-- Les dates sont en `text` et non en `date` : elles sont à PRÉCISION
-- VARIABLE (§3 du rev01, « la saisie des dates ne doit pas être bloquante »)
-- — 'YYYY-MM-DD' au jour, 'YYYY-MM' au mois. La précision se lit dans la
-- valeur, plutôt que dans une seconde colonne qui finirait par en diverger.
-- ---------------------------------------------------------------------------
create table factures (
  id                  uuid primary key default gen_random_uuid(),
  commande_id         uuid not null references commandes(id) on delete cascade,
  numero              text not null,
  -- Montant HORS TAXES (colonne du fichier de suivi).
  montant_ht          numeric,
  date_emission       date,
  -- Les KPI de délai partent de la RÉCEPTION, pas de l'émission.
  date_reception      date,
  objet               text,
  service             text,
  site                text,
  mois                text,
  commentaire         text,

  date_validation_technique   text,
  date_transmission_compta    text,
  introduite_sap              boolean,
  date_introduction_sap       text,
  traitement_cge              boolean,
  date_validation_cge         text,
  validation_do               boolean,
  date_validation_do          text,
  departement_validation_do   text,
  paiement_en_cours           boolean,
  paiement_realise            boolean,
  date_paiement               text,

  cree_le             timestamptz not null default now(),
  constraint factures_numero_unique unique (commande_id, numero),
  constraint factures_dates_precision check (
    coalesce(date_validation_technique, '2000-01') ~ '^\d{4}-\d{2}(-\d{2})?$'
    and coalesce(date_transmission_compta, '2000-01') ~ '^\d{4}-\d{2}(-\d{2})?$'
    and coalesce(date_introduction_sap, '2000-01') ~ '^\d{4}-\d{2}(-\d{2})?$'
    and coalesce(date_validation_cge, '2000-01') ~ '^\d{4}-\d{2}(-\d{2})?$'
    and coalesce(date_validation_do, '2000-01') ~ '^\d{4}-\d{2}(-\d{2})?$'
    and coalesce(date_paiement, '2000-01') ~ '^\d{4}-\d{2}(-\d{2})?$'
  )
);

create index factures_commande on factures (commande_id);

-- Affaires d'une facture. Vide = la facture SUIT sa commande (état de toute
-- facture d'une commande mono-projet) ; l'héritage se fait à la lecture.
create table facture_projets (
  id          uuid primary key default gen_random_uuid(),
  facture_id  uuid not null references factures(id) on delete cascade,
  projet_id   uuid references projets(id) on delete cascade,
  libelle     text,
  constraint facture_projets_exclusif check (
    (projet_id is not null and libelle is null)
    or (projet_id is null and libelle is not null)
  )
);
