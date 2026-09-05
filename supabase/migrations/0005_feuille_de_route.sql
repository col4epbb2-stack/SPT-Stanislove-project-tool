-- 0005 — Feuille de route
--
-- Conception : doc/schema-supabase.md §C.5.
-- Règle métier (24/08/2026) : une ligne de feuille de route PROVIENT de la
-- navette. Le rattachement est donc l'état normal, pas l'exception.

create type rubrique_fdr as enum ('OPEX', 'CAPEX');

create table feuille_de_route (
  -- `generated always as identity` : l'id était calculé côté client par
  -- max(id)+1 sur l'état local, ce qui faisait que deux rattachements
  -- enchaînés produisaient le MÊME identifiant, donc le même document, le
  -- second écrasant le premier sans erreur (bug corrigé le 13/08/2026 par un
  -- horodatage). La base le règle structurellement.
  id                    bigint primary key generated always as identity,

  -- Les deux liens structurants, en clés étrangères RÉELLES. Aujourd'hui ce
  -- sont des chaînes libres : un identifiant pointant vers une ligne
  -- supprimée ne provoque aucune erreur, la ligne cesse simplement d'être
  -- rattachée — silencieusement. C'est ce que l'écran de rapprochement passe
  -- son temps à rattraper.
  ligne_navette_id      uuid references navette_lignes(id) on delete set null,
  projet_id             uuid references projets(id) on delete set null,

  projet                text not null,
  service_leader        text,
  categorie             text,
  champ_code            text references champs(code),
  priorite              text,
  statut                text,
  rubrique              rubrique_fdr,
  annee_bu              integer,
  wp                    text check (wp is null or wp in ('OUI', 'NON')),
  compte_imputation     text,
  otp                   text,

  -- Indicateurs à repère visuel (drapeau / icône d'état). La valeur reste un
  -- nombre : les lignes importées en portent (100, 80, 50...), et choisir un
  -- état écrit sa valeur repère. NULL = jamais renseigné, ce qui n'est PAS
  -- « rien reçu » — les deux appellent des actions différentes.
  flag                  numeric check (flag is null or (flag >= 0 and flag <= 100)),
  reception_scopes      numeric check (reception_scopes is null or (reception_scopes >= 0 and reception_scopes <= 100)),

  date_debut            date,
  date_fin              date,
  avancement_reel       numeric check (avancement_reel is null or (avancement_reel >= 0 and avancement_reel <= 100)),

  -- P2 — `bu_kusd` et `pdc_kusd` NE SONT PAS stockés : dès qu'une ligne
  -- navette est rattachée, ils sont relus sur elle (correctif du 13/08/2026 :
  -- copiés au rattachement puis jamais mis à jour, une révision validée
  -- laissait l'ancien montant sans rien signaler). Seule subsiste la valeur
  -- du classeur, pour les lignes importées SANS ligne navette.
  pdc02_2026_kusd       numeric,
  bu26_serv_kusd        numeric,

  estimation_kusd       numeric,
  numero_po             text,
  montant_po            numeric,
  commentaires          text,
  cree_le               timestamptz not null default now()
);

create index fdr_ligne_navette on feuille_de_route (ligne_navette_id);
create index fdr_projet on feuille_de_route (projet_id);
