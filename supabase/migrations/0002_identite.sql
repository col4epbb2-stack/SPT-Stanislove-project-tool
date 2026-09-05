-- 0002 — Identité : comptes, rôles, profils de module
--
-- Conception : doc/schema-supabase.md §C.2.
--
-- `utilisateurs.id` référence `auth.users(id)` de Supabase Auth — l'annuaire
-- applicatif et le compte d'authentification sont la même personne. C'est
-- déjà le modèle actuel (doc ID = uid Firebase), ici rendu explicite par une
-- clé étrangère.

-- Rôle applicatif : un utilisateur n'en a qu'UN. C'est précisément pourquoi
-- les profils de module vivent à part (voir plus bas).
create type role_utilisateur as enum ('admin', 'agent', 'controleur');

create table utilisateurs (
  id            uuid primary key,
  nom           text not null,
  email         text not null unique,
  role          role_utilisateur not null default 'agent',
  fonction      text,
  couleur_avatar text,
  actif         boolean not null default true,
  cree_le       timestamptz not null default now()
);

-- Profils de module — table unique, là où le code porte aujourd'hui TROIS
-- mécanismes distincts pour la même idée : `utilisateurs.profilNavette`,
-- `utilisateurs.profilTonnage` (deux colonnes) et `epcm_profils` (une
-- collection à part).
--
-- Le principe reste celui du 11/08/2026 : un profil de module s'AJOUTE au
-- rôle applicatif, il ne le remplace pas. Un chef de département est le plus
-- souvent aussi chargé d'affaires — l'ajouter au rôle l'aurait forcé à
-- choisir. Le quatrième module qui voudra un profil n'aura aucune colonne à
-- ajouter.
create table utilisateur_profils (
  utilisateur_id uuid not null references utilisateurs(id) on delete cascade,
  module        text not null check (module in ('navette', 'tonnage', 'epcm')),
  profil        text not null,
  defini_le     timestamptz not null default now(),
  defini_par    uuid references utilisateurs(id),
  primary key (utilisateur_id, module)
);

-- Les valeurs de profil autorisées, par module. Déclarées ici parce que le
-- code branche dessus (peutViser, peutApprouverTonnage, les 6 niveaux EPCM) :
-- ce sont des unions typées, pas un référentiel ouvert.
alter table utilisateur_profils add constraint utilisateur_profils_valeurs check (
  (module = 'navette' and profil in ('chef_departement', 'directeur_technique'))
  or (module = 'tonnage' and profil in ('responsable_technique', 'superviseur', 'gestionnaire_contrat'))
  or (module = 'epcm' and profil in (
        'administrateur', 'gestionnaire', 'superviseur',
        'consultation', 'rh', 'finance'))
);

-- Les deux clés étrangères posées après coup : `devises.maj_par`,
-- `parametres.maj_par` et `tarifs_npt.maj_par` référencent l'annuaire, qui
-- n'existait pas encore au moment de la migration 0001.
alter table devises      add constraint devises_maj_par_fk
  foreign key (maj_par) references utilisateurs(id) on delete set null;
alter table parametres   add constraint parametres_maj_par_fk
  foreign key (maj_par) references utilisateurs(id) on delete set null;
alter table tarifs_npt   add constraint tarifs_npt_maj_par_fk
  foreign key (maj_par) references utilisateurs(id) on delete set null;
