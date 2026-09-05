-- 0012 — Discussions et registre de liaison
--
-- Conception : doc/schema-supabase.md §C.9.

-- ---------------------------------------------------------------------------
-- Discussions — le seul module temps réel (6 abonnements aujourd'hui).
-- Espace commun, PAS de messagerie privée : rien de confidentiel n'a à y
-- être écrit.
-- ---------------------------------------------------------------------------
create table discussions_sujets (
  id              uuid primary key default gen_random_uuid(),
  titre           text not null,
  theme           text,
  auteur_id       uuid not null references utilisateurs(id),
  cloture         boolean not null default false,
  cree_le         timestamptz not null default now()
  -- P8 — l'aperçu dénormalisé (dernier message, auteur, extrait, nombre) est
  -- MAINTENU PAR TRIGGER ci-dessous, et non plus écrit par celui qui poste.
  -- C'est l'une des deux seules exceptions assumées à P2 : sans elle, lister
  -- les sujets demanderait de lire les messages de chacun.
);

create table discussions_messages (
  id          uuid primary key default gen_random_uuid(),
  -- `on delete cascade` : Firestore ne supprimait pas les sous-collections,
  -- les messages devaient être effacés à la main avant le sujet sous peine
  -- de rester orphelins et facturés.
  sujet_id    uuid not null references discussions_sujets(id) on delete cascade,
  auteur_id   uuid not null references utilisateurs(id),
  texte       text not null,
  cree_le     timestamptz not null default now()
);

create index discussions_messages_sujet on discussions_messages (sujet_id, cree_le);

-- Colonnes de l'aperçu, alimentées par trigger.
alter table discussions_sujets
  add column dernier_message_le timestamptz,
  add column dernier_message_auteur_id uuid references utilisateurs(id),
  add column dernier_message_extrait text,
  add column nombre_messages integer not null default 0;

create or replace function discussions_rafraichir_apercu()
returns trigger
language plpgsql
as $$
declare
  cible uuid := coalesce(new.sujet_id, old.sujet_id);
begin
  update discussions_sujets s set
    nombre_messages = (select count(*) from discussions_messages m where m.sujet_id = cible),
    dernier_message_le = d.cree_le,
    dernier_message_auteur_id = d.auteur_id,
    dernier_message_extrait = left(d.texte, 140)
  from (
    select cree_le, auteur_id, texte
    from discussions_messages
    where sujet_id = cible
    order by cree_le desc
    limit 1
  ) d
  where s.id = cible;

  -- Sujet vidé de ses messages : l'aperçu doit disparaître, pas rester figé
  -- sur un message supprimé.
  update discussions_sujets s
     set nombre_messages = 0,
         dernier_message_le = null,
         dernier_message_auteur_id = null,
         dernier_message_extrait = null
   where s.id = cible
     and not exists (select 1 from discussions_messages m where m.sujet_id = cible);

  return null;
end;
$$;

create trigger discussions_apercu
after insert or update or delete on discussions_messages
for each row execute function discussions_rafraichir_apercu();

-- Qui a lu quoi. Seule table réservée à son propre utilisateur (voir RLS) :
-- ça n'a pas à être exposé aux autres.
create table discussions_lectures (
  utilisateur_id  uuid not null references utilisateurs(id) on delete cascade,
  sujet_id        uuid not null references discussions_sujets(id) on delete cascade,
  lu_le           timestamptz not null default now(),
  primary key (utilisateur_id, sujet_id)
);

-- ---------------------------------------------------------------------------
-- Registre des rapprochements confirmés à la main (écran Rapprochement).
-- Lu EN PRIORITÉ par le moteur de résolution, avant toute cascade floue.
-- ---------------------------------------------------------------------------
create table liaisons (
  id            uuid primary key default gen_random_uuid(),
  module        text not null,
  cle_type      text not null,
  cle_valeur    text not null,
  projet_id     uuid not null references projets(id) on delete cascade,
  confirme_par  uuid references utilisateurs(id),
  confirme_le   timestamptz not null default now(),
  -- La clé est normalisée à l'écriture (casse, espaces) : c'est elle qui
  -- rend le rapprochement reproductible.
  constraint liaisons_unicite unique (module, cle_type, cle_valeur)
);

create index liaisons_projet on liaisons (projet_id);
