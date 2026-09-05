-- 0009 — Procurement follow-up (DA, AO, PO, surveillance, préfabrication)
--
-- Conception : doc/schema-supabase.md §C.7.
-- Colonnes relevées dans le corpus réel : DA 4, AO 16, PO 30, surveillance
-- 32 (1 612 articles), préfa 17.
--
-- Ce module est le seul SANS clé de liaison naturelle : ses journaux ne
-- portent ni n° d'avis ni OT. Le rattachement à une fiche projet est donc
-- EXPLICITE uniquement — `resoudreProjetProcurement()` ne fait que lire
-- `projet_id`, sans cascade de secours. Deviner un projet depuis une
-- désignation d'article produirait de faux rattachements.

create table procurement_da (
  id          uuid primary key default gen_random_uuid(),
  origine     origine_ligne not null default 'saisie',
  projet_id   uuid references projets(id) on delete set null,
  numero      text not null,
  ot          text,
  -- `resumeStatutsDa` compte exactement IN PROGRESS et CLOSED : une
  -- troisième valeur ne serait comptée dans aucune des deux tuiles du
  -- résumé. D'où la contrainte, et l'exclusion de cette liste du
  -- référentiel paramétrable (décision du 18/08/2026).
  statut      text check (statut is null or statut in ('IN PROGRESS', 'CLOSED')),
  cree_le     timestamptz not null default now(),
  constraint procurement_da_numero_unique unique (numero)
);

create table procurement_ao (
  id                    uuid primary key default gen_random_uuid(),
  origine               origine_ligne not null default 'saisie',
  projet_id             uuid references projets(id) on delete set null,
  code                  text,
  ref_ao                text,
  numero_da             text,
  scope                 text,
  plateforme            text,
  fournisseur           text,
  situation             text,
  statut                text,
  sado                  text,
  date_lancement        date,
  date_fin_lancement    date,
  date_debut_traitement date,
  date_fin_traitement   date,
  date_attribution      date,
  date_livraison        date,
  cree_le               timestamptz not null default now()
);

create index procurement_ao_da on procurement_ao (numero_da);

create table procurement_po (
  id                        uuid primary key default gen_random_uuid(),
  origine                   origine_ligne not null default 'saisie',
  projet_id                 uuid references projets(id) on delete set null,
  code                      text,
  code_po                   text,
  numero_po                 text,
  numero_da                 text,
  chrono                    text,
  scope                     text,
  descriptif                text,
  designation               text,
  plateforme                text,
  lead                      text,
  responsable_achat         text,
  fournisseur               text,
  type_materiel             text,
  type_materiel_2           text,
  departement               text,
  dptm_abreviation          text,
  sanction                  text,
  statut                    text,
  date_transmission_po      date,
  date_livraison_prev_exw   date,
  date_livraison_reel_exw   date,
  eta_prev_maritime         date,
  eta_reel_maritime         date,
  eta_prev_aerien           date,
  eta_reel_aerien           date,
  -- P2 — `delaiFabricationJours` et les gaps EXW / maritime / aérien sont
  -- DÉRIVÉS de ces dates (affichés en dérivé pendant la saisie).
  commentaires_duet         text,
  commentaires_transit      text,
  cree_le                   timestamptz not null default now()
);

create index procurement_po_da on procurement_po (numero_da);
create index procurement_po_projet on procurement_po (projet_id);

create table procurement_surveillance (
  id                        uuid primary key default gen_random_uuid(),
  origine                   origine_ligne not null default 'saisie',
  projet_id                 uuid references projets(id) on delete set null,
  numero                    text,
  numero_po                 text,
  scope                     text,
  designation               text,
  statut                    text,
  niveau_risque             text,
  level_inspection          text,
  type_inspection           text,
  type_transit              text,
  mad_lieu                  text,
  date_fat                  date,
  date_livraison_prev_exw   date,
  date_mad_transit          date,
  date_instruction_mad      date,
  avis_mad                  text,
  certificat_progec         text,
  certificat_origine        text,
  colisage                  text,
  signature_facture         text,
  mad_definitive            text,
  pick_up                   text,
  expedition                text,
  etd                       date,
  eta_pog_prev              date,
  eta_lbv                   date,
  eta_pog                   date,
  date_livraison_magasin    date,
  avancement                numeric,
  pds                       numeric,
  -- Le « gap » reste SAISI, et c'est vérifié : sur les 1 612 articles réels,
  -- ce n'est PAS l'écart avancement − PDS (les deux ne concordent sur aucune
  -- ligne). Pas de formule inventée pour combler l'écart.
  gap                       numeric,
  commentaires              text,
  cree_le                   timestamptz not null default now()
);

create index procurement_surveillance_po on procurement_surveillance (numero_po);

create table procurement_prefa (
  id                    uuid primary key default gen_random_uuid(),
  origine               origine_ligne not null default 'saisie',
  projet_id             uuid references projets(id) on delete set null,
  code                  text,
  numero_po             text,
  designation           text,
  plateforme            text,
  responsable           text,
  eta_lbv               date,
  eta_pog               date,
  livraison_magasin     date,
  date_livraison_ctr    date,
  date_mad_revisee      date,
  qte                   numeric,
  avancement            numeric,
  -- ATTENTION : les compteurs OUI/NON du résumé préfa sont des QUANTITÉS,
  -- pas des nombres de lignes (895 livrées pour 36 lignes).
  besoin_ctr            numeric,
  qte_livree_ctr        numeric,
  -- P2 — `resteALivrer` = besoin − livré, vérifié à 0 écart sur 67 lignes.
  commentaires          text,
  cree_le               timestamptz not null default now()
);
