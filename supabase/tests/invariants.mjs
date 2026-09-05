import { PGlite } from '@electric-sql/pglite'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const DIR = 'c:/Users/sagou/Desktop/Work/icp-main/supabase/migrations'
const db = await PGlite.create()

await db.exec(`
  create schema if not exists auth;
  create table if not exists auth.users (id uuid primary key);
  create or replace function auth.uid() returns uuid language sql stable as
    $fn$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $fn$;
`)
await db.exec(`do $r$ begin if not exists (select 1 from pg_roles where rolname='authenticated')
  then create role authenticated; end if; end $r$;`)

for (const f of readdirSync(DIR).filter(f => f.endsWith('.sql')).sort()) {
  await db.exec(readFileSync(join(DIR, f), 'utf8'))
}

let ok = 0, ko = 0
const test = async (nom, fn) => {
  try { await fn(); console.log(`  ✓ ${nom}`); ok++ }
  catch (e) { console.log(`  ✗ ${nom}\n      ${e.message}`); ko++ }
}
const assert = (c, m) => { if (!c) throw new Error(m) }
// Vérifie qu'une écriture est REFUSÉE — l'inverse d'un test habituel.
const refuse = async (sql, params, motif) => {
  try { await db.query(sql, params) } catch { return }
  throw new Error(`accepté alors que ça devait être refusé : ${motif}`)
}

console.log('\n— Sécurité —')

await test('aucune table sans RLS', async () => {
  const r = await db.query(`select relname from pg_class
    where relnamespace='public'::regnamespace and relkind='r' and not relrowsecurity`)
  assert(r.rows.length === 0, `sans RLS : ${r.rows.map(x => x.relname).join(', ')}`)
})

await test('aucune table RLS sans policy (sinon table muette)', async () => {
  const r = await db.query(`select c.relname from pg_class c
    where c.relnamespace='public'::regnamespace and c.relkind='r' and c.relrowsecurity
      and not exists (select 1 from pg_policies p where p.tablename = c.relname)`)
  assert(r.rows.length === 0, `RLS sans policy : ${r.rows.map(x => x.relname).join(', ')}`)
})

await test('append-only : aucune policy update/delete', async () => {
  const r = await db.query(`select tablename, cmd from pg_policies
    where schemaname='public'
      and tablename in ('contrat_avc','commande_augmentations','epcm_historique','navette_arbitrage_visas')
      and cmd in ('UPDATE','DELETE')`)
  assert(r.rows.length === 0, `policy interdite : ${JSON.stringify(r.rows)}`)
})

await test('un message ne se modifie pas (aucune policy UPDATE)', async () => {
  const r = await db.query(`select 1 from pg_policies
    where tablename='discussions_messages' and cmd='UPDATE'`)
  assert(r.rows.length === 0, 'une policy UPDATE existe sur discussions_messages')
})

await test('est_admin() est security definer (sinon récursion RLS)', async () => {
  const r = await db.query(`select prosecdef, proconfig from pg_proc
    where proname='est_admin' and pronamespace='public'::regnamespace`)
  assert(r.rows[0]?.prosecdef === true, 'est_admin() n\'est pas security definer')
  assert(String(r.rows[0].proconfig ?? '').includes('search_path'),
    'search_path non fixé — élévation de privilège possible')
})

console.log('\n— Invariants métier —')

// Jeu minimal.
await db.exec(`
  insert into devises (code, libelle, symbole, decimales, taux, pivot)
    values ('USD','Dollar','$',2,1,true), ('XAF','Franc CFA','FCFA',0,0.00182939,false);
  insert into champs (code, libelle) values ('AGM','Anguille'), ('TRM','Torpille');
  insert into utilisateurs (id, nom, email, role)
    values ('11111111-1111-1111-1111-111111111111','Admin','a@x','admin');
  insert into projets (id, nom, type, service_client, devise)
    values ('22222222-2222-2222-2222-222222222222','Riser 6"','avis','projets','USD');
`)

await test('P1 — aucun default sur une colonne de montant', async () => {
  const r = await db.query(`select table_name, column_name, column_default
    from information_schema.columns
    where table_schema='public' and data_type='numeric' and column_default is not null`)
  assert(r.rows.length === 0,
    `une absence deviendrait un zéro : ${r.rows.map(x => x.table_name + '.' + x.column_name).join(', ')}`)
})

await test('P1 — un montant non renseigné reste NULL, pas 0', async () => {
  await db.query(`insert into contrats (reference, type, devise) values ('C-1','METAL','USD')`)
  const r = await db.query(`select valeur_cible_initiale v from contrats where reference='C-1'`)
  assert(r.rows[0].v === null, `vaut ${r.rows[0].v} au lieu de NULL`)
})

await test('P3 — clé composite CRJ : le doublon est refusé par la base', async () => {
  await db.exec(`
    insert into crj_suivis (id, date, service) values
      ('33333333-3333-3333-3333-333333333333','2026-06-16','METAL');
    insert into crj_phases (id, suivi_id, nom) values
      ('44444444-4444-4444-4444-444444444444','33333333-3333-3333-3333-333333333333','Travaux sur site');
    insert into crj_scopes (id, phase_id, nom) values
      ('55555555-5555-5555-5555-555555555555','44444444-4444-4444-4444-444444444444','PVV');
    insert into crj_taches (id, scope_id, nom) values
      ('66666666-6666-6666-6666-666666666666','55555555-5555-5555-5555-555555555555','Soudage');
    insert into crj_personnel (suivi_id, tache_id, date, societe, profil, quantite) values
      ('33333333-3333-3333-3333-333333333333','66666666-6666-6666-6666-666666666666','2026-06-16','GMI','Monteur',3);
  `)
  await refuse(
    `insert into crj_personnel (suivi_id, tache_id, date, societe, profil, quantite)
       values ('33333333-3333-3333-3333-333333333333','66666666-6666-6666-6666-666666666666','2026-06-16','GMI','Monteur',5)`,
    [], 'deux fois le même (suivi, tâche, société, profil) — c\'est le bug du 31/08/2026')
})

await test('P3 — deux tâches homonymes dans DEUX scopes restent distinctes', async () => {
  await db.exec(`
    insert into crj_scopes (id, phase_id, nom) values
      ('77777777-7777-7777-7777-777777777777','44444444-4444-4444-4444-444444444444','Électricité');
    insert into crj_taches (scope_id, nom) values
      ('77777777-7777-7777-7777-777777777777','Soudage');
  `)
  const r = await db.query(`select count(*)::int n from crj_taches where nom='Soudage'`)
  assert(r.rows[0].n === 2, 'les homonymes de scopes différents devraient coexister')
})

await test('renommer une tâche ne détache PAS ses lignes (fk, pas chaîne)', async () => {
  await db.query(`update crj_taches set nom='Soudage TIG' where id='66666666-6666-6666-6666-666666666666'`)
  const r = await db.query(`select count(*)::int n from crj_personnel
    where tache_id='66666666-6666-6666-6666-666666666666'`)
  assert(r.rows[0].n === 1, 'la ligne de personnel a perdu sa tâche')
})

await test('planning : le gabarit est porté par la tâche, pas par la vue', async () => {
  const r = await db.query(`select count(*)::int n from information_schema.columns
    where table_name='tache_vues' and column_name in ('courbe_type','budget','nom')`)
  assert(r.rows[0].n === 0, 'une propriété de tâche a fui dans tache_vues')
})

await test('metal : « NA » et « non renseigné » sont deux états distincts', async () => {
  await db.exec(`
    insert into metal_affaires (id, affaire) values
      ('88888888-8888-8888-8888-888888888888','Remplacement caisson');
    insert into metal_avancements (affaire_id, phase, non_applicable) values
      ('88888888-8888-8888-8888-888888888888','duree_mto', true);
    insert into metal_avancements (affaire_id, phase, pourcentage) values
      ('88888888-8888-8888-8888-888888888888','fourniture', 50);
  `)
  await refuse(
    `insert into metal_avancements (affaire_id, phase, pourcentage, non_applicable)
       values ('88888888-8888-8888-8888-888888888888','etude', 30, true)`,
    [], 'une phase à la fois chiffrée ET non applicable')
  const r = await db.query(`select avg(pourcentage) m from metal_avancements
    where affaire_id='88888888-8888-8888-8888-888888888888'`)
  assert(Number(r.rows[0].m) === 50, 'la moyenne devrait ignorer le NA et le non-renseigné')
})

await test('commande : imputation OU libellé libre, jamais les deux', async () => {
  await db.exec(`insert into commandes (id, numero) values ('99999999-9999-9999-9999-999999999999','4550001')`)
  await refuse(
    `insert into commande_projets (commande_id, projet_id, libelle)
       values ('99999999-9999-9999-9999-999999999999','22222222-2222-2222-2222-222222222222','Divers')`,
    [], 'un identifiant ET un libellé sur la même ligne')
  await refuse(
    `insert into commande_projets (commande_id) values ('99999999-9999-9999-9999-999999999999')`,
    [], 'ni identifiant ni libellé')
})

await test('devises : un seul pivot possible', async () => {
  await refuse(`update devises set pivot = true where code='XAF'`, [], 'deux devises pivots')
})

await test('feuille de route : les id ne peuvent plus entrer en collision', async () => {
  await db.exec(`insert into feuille_de_route (projet) values ('A'), ('B'), ('C')`)
  const r = await db.query(`select count(distinct id)::int n, count(*)::int t from feuille_de_route`)
  assert(r.rows[0].n === r.rows[0].t, 'des identifiants dupliqués — le bug du 13/08/2026')
})

await test('epcm : planning et pointage au JOUR, pas au mois', async () => {
  const r = await db.query(`select count(*)::int n from information_schema.columns
    where table_name in ('epcm_planning','epcm_pointages') and column_name='date'`)
  assert(r.rows[0].n === 2, 'une des deux tables n\'est pas au grain du jour')
})

await test('epcm : heures sup sans motif refusées (impact facturation)', async () => {
  await db.exec(`insert into epcm_employes (id, nom, prenom) values
    ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','Doe','John')`)
  await refuse(
    `insert into epcm_pointages (employe_id, date, jours, heures_sup)
       values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','2026-06-16',1,6)`,
    [], 'heures supplémentaires sans motif')
  await db.query(`insert into epcm_pointages (employe_id, date, jours, heures_sup, motif_heures_sup)
    values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','2026-06-16',1,6,'Reprise de soudure')`)
})

await test('epcm : le relevé HSE est identifié par son lundi', async () => {
  await refuse(
    `insert into epcm_hse (semaine) values ('2026-06-16')`, [], 'un mardi comme clé de semaine')
  await db.query(`insert into epcm_hse (semaine) values ('2026-06-15')`)
})

await test('discussions : l\'aperçu est maintenu par trigger, pas par le client', async () => {
  await db.exec(`
    insert into discussions_sujets (id, titre, auteur_id) values
      ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','Navette Q3','11111111-1111-1111-1111-111111111111');
    insert into discussions_messages (sujet_id, auteur_id, texte) values
      ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','11111111-1111-1111-1111-111111111111','Premier'),
      ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','11111111-1111-1111-1111-111111111111','Second');
  `)
  const r = await db.query(`select nombre_messages n, dernier_message_extrait e
    from discussions_sujets where id='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'`)
  assert(r.rows[0].n === 2, `compteur = ${r.rows[0].n}`)
  assert(r.rows[0].e === 'Second', `extrait = ${r.rows[0].e}`)
})

await test('discussions : supprimer un sujet supprime ses messages (cascade)', async () => {
  await db.query(`delete from discussions_sujets where id='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'`)
  const r = await db.query(`select count(*)::int n from discussions_messages`)
  assert(r.rows[0].n === 0, 'des messages orphelins subsistent')
})

await test('liste_valeurs : doublon insensible à la casse refusé', async () => {
  await db.exec(`insert into listes (id, module, libelle) values ('metal.risques','metal','Risques')`)
  await db.query(`insert into liste_valeurs (liste_id, valeur) values ('metal.risques','Chute')`)
  await refuse(`insert into liste_valeurs (liste_id, valeur) values ('metal.risques','chute')`,
    [], 'même valeur à la casse près')
})

await test('un cycle budgétaire est unique par ligne navette', async () => {
  await db.exec(`
    insert into navette_lignes (id, code_otp, libelle, rubrique_niv1, rubrique_niv2, type, devise)
      values ('cccccccc-cccc-cccc-cccc-cccccccccccc','OTP-1','AGM: Riser','OPEX','GES','avis','USD');
    insert into navette_cycles (ligne_id, cycle, serv, conso) values
      ('cccccccc-cccc-cccc-cccc-cccccccccccc','BU',100,50);
  `)
  await refuse(
    `insert into navette_cycles (ligne_id, cycle, serv) values ('cccccccc-cccc-cccc-cccc-cccccccccccc','BU',200)`,
    [], 'deux fois le cycle BU sur la même ligne')
})

await test('une seule révision en attente par cycle', async () => {
  await db.exec(`insert into navette_arbitrages (ligne_id, cycle, montant, demandeur_id)
    values ('cccccccc-cccc-cccc-cccc-cccccccccccc','PDC02',500,'11111111-1111-1111-1111-111111111111')`)
  await refuse(
    `insert into navette_arbitrages (ligne_id, cycle, montant, demandeur_id)
       values ('cccccccc-cccc-cccc-cccc-cccccccccccc','PDC02',600,'11111111-1111-1111-1111-111111111111')`,
    [], 'deux révisions en attente sur le même cycle')
})

await test('un visa ne se pose qu\'une fois par étape', async () => {
  const a = await db.query(`select id from navette_arbitrages limit 1`)
  const id = a.rows[0].id
  await db.query(`insert into navette_arbitrage_visas (arbitrage_id, etape, par_id)
    values ($1,'chef_departement','11111111-1111-1111-1111-111111111111')`, [id])
  await refuse(
    `insert into navette_arbitrage_visas (arbitrage_id, etape, par_id)
       values ('${id}','chef_departement','11111111-1111-1111-1111-111111111111')`,
    [], 'deux visas de chef sur la même révision')
})

await test('supprimer un projet emporte ses tables filles', async () => {
  await db.exec(`
    insert into phases (id, projet_id, nom) values
      ('dddddddd-dddd-dddd-dddd-dddddddddddd','22222222-2222-2222-2222-222222222222','Exécution');
    insert into taches (id, projet_id, phase_id, nom) values
      ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee','22222222-2222-2222-2222-222222222222','dddddddd-dddd-dddd-dddd-dddddddddddd','Pose');
    insert into tache_vues (tache_id, vue, date_debut, date_fin) values
      ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee','baseline','2026-06-01','2026-06-30');
  `)
  await db.query(`delete from projets where id='22222222-2222-2222-2222-222222222222'`)
  const r = await db.query(`select
    (select count(*)::int from phases) p,
    (select count(*)::int from taches) t,
    (select count(*)::int from tache_vues) v`)
  assert(r.rows[0].p === 0 && r.rows[0].t === 0 && r.rows[0].v === 0, 'des orphelins subsistent')
})

await test('mais la ligne navette SURVIT au projet supprimé (set null)', async () => {
  const r = await db.query(`select count(*)::int n from navette_lignes`)
  assert(r.rows[0].n === 1, 'la ligne navette a été emportée — un budget ne se supprime pas en cascade')
})

await test('dates : une fin ne peut pas précéder son début', async () => {
  await refuse(
    `insert into crj_taches (scope_id, nom, date_debut, date_fin)
       values ('55555555-5555-5555-5555-555555555555','Test','2026-06-30','2026-06-01')`,
    [], 'fin avant début')
})

await test('facture : date au mois acceptée, date absurde refusée', async () => {
  await db.query(`insert into factures (commande_id, numero, date_introduction_sap)
    values ('99999999-9999-9999-9999-999999999999','F-1','2026-03')`)
  await db.query(`insert into factures (commande_id, numero, date_introduction_sap)
    values ('99999999-9999-9999-9999-999999999999','F-2','2026-03-17')`)
  await refuse(
    `insert into factures (commande_id, numero, date_introduction_sap)
       values ('99999999-9999-9999-9999-999999999999','F-3','mars 2026')`,
    [], 'une date au format libre')
})

console.log(`\n${ok} invariants vérifiés, ${ko} en échec`)
process.exit(ko === 0 ? 0 : 1)
