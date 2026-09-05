-- 0010 — Grand arrêt, LUT intégrité, Courbe en S
--
-- Conception : doc/schema-supabase.md §C.7.

-- ---------------------------------------------------------------------------
-- Grand arrêt — feuille « Journal » (préfabrication / atelier).
--
-- SEUL cas où jsonb est le bon choix, et pour une raison précise : ce n'est
-- pas une liste d'objets typés mais une GRILLE BRUTE de 93 colonnes x 165
-- lignes, dont les cellules ne sont pas nommées. Le formulaire de saisie
-- génère d'ailleurs ses étapes à partir des bandes de colonnes du classeur —
-- ajouter une colonne au classeur ajoute son champ sans toucher au code.
--
-- Les typer une à une figerait ce que le classeur peut changer, pour aucun
-- gain : rien ne les requête individuellement.
-- ---------------------------------------------------------------------------
create table grand_arret_journal (
  id              uuid primary key default gen_random_uuid(),
  origine         origine_ligne not null default 'saisie',
  -- Rang de la ligne dans le blob importé : faute de clé métier (« N° LIGNE »
  -- est vide sur les 165 lignes, « N° ISO » compte 153 valeurs distinctes
  -- pour 163 lignes renseignées). Ce rang n'est stable que tant que le blob
  -- n'est pas réimporté dans un autre ordre.
  origine_index   integer,
  cellules        jsonb not null default '{}'::jsonb,
  cree_le         timestamptz not null default now(),
  constraint grand_arret_journal_origine_unique unique (origine, origine_index)
);

-- P2 — les 10 KPI du bandeau sont DÉRIVÉS (moyenne de leur colonne, sauf
-- « Revue CPY » = 1 − moyenne de REALISATION CTR et « RESTE A LIVRER » =
-- 1 − moyenne de LIVRAISON CPY). Vérifiés à 0 écart ; figés, ils auraient
-- cessé d'être vrais dès la première saisie.

-- ---------------------------------------------------------------------------
-- LUT intégrité — listes de travaux AGM / MDJ / TRM.
-- Même nature : des feuilles Excel reprises telles quelles, sans modèle
-- métier propre. Lecture seule aujourd'hui, aucune saisie.
-- ---------------------------------------------------------------------------
create table lut_lignes (
  id          uuid primary key default gen_random_uuid(),
  origine     origine_ligne not null default 'classeur',
  feuille     text not null check (feuille in ('agm', 'mdj', 'trm')),
  origine_index integer,
  cellules    jsonb not null default '{}'::jsonb,
  constraint lut_lignes_unicite unique (feuille, origine_index)
);

-- ---------------------------------------------------------------------------
-- Courbe en S — activités des 3 feuilles du classeur KPI_ICP.
--
-- Ces activités sont aujourd'hui LIVRÉES AVEC LE MODULE (data/courbeEnS/,
-- 3 x 59 activités) et non chargées : à ce volume, le fetch ne se justifiait
-- pas. Sur une base neuve, elles rejoignent la table — le module y gagne de
-- pouvoir les modifier comme les autres journaux.
-- ---------------------------------------------------------------------------
create table courbe_activites (
  id                uuid primary key default gen_random_uuid(),
  origine           origine_ligne not null default 'saisie',
  vue               vue_planning not null,
  projet_id         uuid references projets(id) on delete set null,
  -- Le classeur ne porte ni n° d'avis ni OTP, juste une colonne « Projet » :
  -- la cascade de rattachement ne peut se rabattre que sur le nom.
  projet            text,
  activite          text not null,
  date_debut        date,
  date_fin          date,
  courbe_type       smallint check (courbe_type between 1 and 5),
  -- Budget laissé vide volontairement : la colonne du classeur est un
  -- XLOOKUP vers une table « Coût » qui n'a pas survécu au fichier (toutes
  -- ses cellules valent #ERROR!). Aucun montant n'a été inventé.
  budget            numeric,
  ordre             integer
);

create index courbe_activites_projet on courbe_activites (projet_id);
create index courbe_activites_vue on courbe_activites (vue);

-- Relevés hebdomadaires du Réalisé, même grain que tache_releves_hebdo.
create table courbe_releves_hebdo (
  activite_id uuid not null references courbe_activites(id) on delete cascade,
  semaine     date not null,
  avancement  numeric not null check (avancement >= 0 and avancement <= 1),
  primary key (activite_id, semaine)
);

-- P2 — durée, pondération, pondération par phase, BU/Phase et les 53
-- colonnes hebdomadaires ne sont PAS stockées : recalculées à l'affichage,
-- vérifiées à 0 écart sur 3 612 cellules du classeur. Les figer les rendrait
-- fausses au premier changement de date.
--
-- Les 5 COURBES TYPES (101 points chacune) restent dans le code
-- (data/courbeEnS/courbesTypes.ts) : la feuille porte la consigne « ne pas
-- toucher merci », et leurs 1 010 valeurs ont été vérifiées cellule par
-- cellule contre le classeur. Ce n'est pas de la donnée d'application.
