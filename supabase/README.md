# Schéma Supabase

Conception : [`doc/schema-supabase.md`](../doc/schema-supabase.md).
Contexte et inventaire de départ : [`doc/recueil-migration-supabase.md`](../doc/recueil-migration-supabase.md).

**Base neuve, aucune reprise Firebase** (décision du 05/09/2026). Le corpus
des classeurs (`src/data/`) est réinjecté à part — ce n'est pas une reprise
Firebase, sa source est le dépôt.

## Migrations

| Fichier | Contenu |
| --- | --- |
| `0001_referentiel.sql` | champs, services, fournisseurs, devises, listes de valeurs, paramètres, tarifs NPT |
| `0002_identite.sql` | utilisateurs, profils de module |
| `0003_navette.sql` | lignes, cycles, arbitrages, visas |
| `0004_portefeuille.sql` | fiche projet, références, phases, tâches et leurs 3 vues, HSE, hypothèses |
| `0005_feuille_de_route.sql` | feuille de route |
| `0006_contrats.sql` | contrats, AVC, commandes, augmentations, factures |
| `0007_terrain_crj.sql` | CRJ : suivis, phases, scopes, tâches, personnel, matériel, HSE |
| `0008_terrain_journaux.sql` | tonnage, peinture, METAL |
| `0009_procurement.sql` | DA, AO, PO, surveillance, préfabrication |
| `0010_grand_arret_lut_courbe.sql` | grand arrêt, LUT, courbe en S |
| `0011_epcm.sql` | employés, planning, pointages, HSE, historique |
| `0012_discussions_liaison.sql` | discussions (+ trigger d'aperçu), registre de liaison |
| `0013_rls.sql` | Row Level Security — les 7 régimes |

**85 tables · 809 colonnes · 123 clés étrangères · 32 contraintes d'unicité ·
60 checks · RLS sur les 85 tables (114 policies).**

## Appliquer

```bash
supabase link --project-ref <ref>
supabase db push
```

Ou, sans le CLI, en collant les fichiers **dans l'ordre** dans l'éditeur SQL
de la console Supabase.

## Vérifier

`tests/invariants.mjs` rejoue les 13 migrations dans un vrai PostgreSQL et
vérifie **28 invariants** — pas seulement que le DDL s'applique, mais que les
règles tiennent : un doublon de clé composite est refusé, « NA » et « non
renseigné » restent distincts, un montant absent reste `NULL`, les tables
append-only n'ont aucune policy `update`/`delete`, `est_admin()` ne peut pas
provoquer de récursion RLS.

Il tourne **sans serveur ni conteneur**, sur PGlite (PostgreSQL compilé en
WebAssembly) :

```bash
npm install --no-save @electric-sql/pglite
node supabase/tests/invariants.mjs
```

Pour l'intégrer à `npm test` (vitest), il faudrait ajouter `@electric-sql/pglite`
aux `devDependencies` — **pas fait**, c'est une dépendance de ~30 Mo et le
choix revient à l'équipe.
