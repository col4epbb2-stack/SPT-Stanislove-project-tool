-- 0013 — Row Level Security
--
-- Conception : doc/schema-supabase.md §A.4 et recueil §MIG-10 à MIG-13.
--
-- Les 62 collections Firestore se rangeaient en SEPT régimes d'accès, et pas
-- un de plus. Ce fichier les reproduit à l'identique.
--
-- ⚠️ CE QUE CE FICHIER NE FAIT PAS, ET C'EST VOULU (MIG-12) :
-- plusieurs contrôles restent CÔTÉ APPLICATION — unicité du viseur d'une
-- révision navette, enchaînement des deux visas, profils EPCM et Tonnage.
-- Les règles Firestore ne bornaient déjà que le droit d'écrire. Durcir ces
-- points ici changerait le comportement fonctionnel, pas seulement la
-- sécurité : ce serait un changement déguisé en migration.

-- ---------------------------------------------------------------------------
-- Fonctions d'autorisation — les 5 de firestore.rules.
--
-- ⚠️ PIÈGE CLASSIQUE (MIG-11) : `est_admin()` lit `utilisateurs`, qui est
-- elle-même protégée par RLS. Sans `security definer`, la policy de
-- `utilisateurs` appellerait `est_admin()` qui relirait `utilisateurs`...
-- récursion infinie. Elle se manifeste par un blocage total, pas par une
-- fuite — donc facile à diagnostiquer, mais fatale.
--
-- `search_path` est fixé explicitement : une fonction `security definer`
-- dont le chemin est modifiable est une élévation de privilège.
-- ---------------------------------------------------------------------------

create or replace function public.connecte()
returns boolean
language sql
stable
as $fn$
  select auth.uid() is not null;
$fn$;

create or replace function public.role_courant()
returns role_utilisateur
language sql
stable
security definer
set search_path = public
as $fn$
  select role from utilisateurs where id = auth.uid();
$fn$;

create or replace function public.est_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $fn$
  select exists (select 1 from utilisateurs where id = auth.uid() and role = 'admin');
$fn$;

-- Porteur d'un profil de module. Remplace `profilNavette()` et `viseNavette()`
-- de firestore.rules, généralisé aux trois modules.
create or replace function public.a_profil(p_module text, p_profil text default null)
returns boolean
language sql
stable
security definer
set search_path = public
as $fn$
  select exists (
    select 1 from utilisateur_profils
    where utilisateur_id = auth.uid()
      and module = p_module
      and (p_profil is null or profil = p_profil)
  );
$fn$;

-- ---------------------------------------------------------------------------
-- Application des régimes.
--
-- Les trois premiers couvrent 51 des 85 tables ; ils sont posés par boucle
-- plutôt que recopiés, pour qu'un régime ne puisse pas diverger d'une table
-- à l'autre par inattention.
-- ---------------------------------------------------------------------------

do $bloc$
declare
  t text;

  -- RÉGIME 1 — LECTURE SEULE pour tout le monde.
  -- Vide ici : sur une base neuve, les journaux importés vivent dans les
  -- mêmes tables que les saisies (colonne `origine`), et sont donc
  -- modifiables. La protection de l'historique importé passe désormais par
  -- P5 (règle applicative) et non par un verrou d'écriture global.

  -- RÉGIME 2 — lecture connecté / écriture ADMIN (référentiels et réglages).
  admin_seul text[] := array[
    'champs', 'services', 'fournisseurs', 'devises', 'listes', 'liste_valeurs',
    'parametres', 'tarifs_npt', 'classeur_blobs', 'feuille_de_route',
    'liaisons', 'epcm_contrats', 'utilisateur_profils'
  ];

  -- RÉGIME 3 — lecture / écriture pour tout utilisateur connecté.
  -- C'est le régime des tables de SAISIE : la trace de qui a écrit est
  -- portée par les colonnes `saisi_par` / `cree_par`, pas par la permission.
  connecte_ecrit text[] := array[
    'projets', 'projet_references', 'projet_risques', 'projet_opportunites',
    'projet_modifications_scope', 'projet_hse_mensuel', 'projet_hse_actions',
    'projet_hypotheses', 'projet_commentaires', 'projet_actions',
    'projet_signaux_externes', 'pieces_jointes',
    'phases', 'phase_points_bloquants', 'taches', 'tache_vues', 'tache_releves_hebdo',
    'contrats', 'contrat_projets', 'contrat_consommations',
    'commandes', 'commande_projets', 'factures', 'facture_projets',
    'crj_suivis', 'crj_phases', 'crj_scopes', 'crj_scope_avis', 'crj_taches',
    'crj_tache_commentaires', 'crj_personnel', 'crj_materiel',
    'crj_derives_planning', 'crj_hse_evenements',
    'tonnage_journal', 'tonnage_personnel', 'tonnage_rapports',
    'tonnage_rapport_standby', 'tonnage_rapport_commentaires',
    'peinture_journal', 'peinture_journal_avis', 'peinture_rapports',
    'peinture_rapport_standby',
    'metal_affaires', 'metal_avancements', 'metal_commentaires',
    'procurement_da', 'procurement_ao', 'procurement_po',
    'procurement_surveillance', 'procurement_prefa',
    'grand_arret_journal', 'lut_lignes',
    'courbe_activites', 'courbe_releves_hebdo',
    'epcm_employes', 'epcm_habilitations', 'epcm_renouvellements',
    'epcm_planning', 'epcm_pointages', 'epcm_hse'
  ];
begin
  foreach t in array admin_seul loop
    execute format('alter table %I enable row level security', t);
    execute format(
      'create policy %I on %I for select to authenticated using (connecte())',
      t || '_lecture', t);
    execute format(
      'create policy %I on %I for all to authenticated using (est_admin()) with check (est_admin())',
      t || '_ecriture_admin', t);
  end loop;

  foreach t in array connecte_ecrit loop
    execute format('alter table %I enable row level security', t);
    execute format(
      'create policy %I on %I for all to authenticated using (connecte()) with check (connecte())',
      t || '_connecte', t);
  end loop;
end;
$bloc$;

-- ---------------------------------------------------------------------------
-- RÉGIME 4 — AJOUT SEUL (append-only).
--
-- Ni update ni delete, PAS MÊME POUR UN ADMIN. Une trace d'audit ou une
-- augmentation de valeur cible réécrite après coup ne prouve plus rien.
--
-- ⚠️ Obtenu par l'ABSENCE de policy update/delete, jamais par un
-- `check (false)` : une policy qui existe est une policy qu'on peut être
-- tenté d'assouplir. Sous RLS, ce qui n'a pas de policy est refusé.
-- ---------------------------------------------------------------------------
do $bloc$
declare
  t text;
  ajout_seul text[] := array[
    'contrat_avc', 'commande_augmentations', 'epcm_historique',
    'navette_arbitrage_visas'
  ];
begin
  foreach t in array ajout_seul loop
    execute format('alter table %I enable row level security', t);
    execute format(
      'create policy %I on %I for select to authenticated using (connecte())',
      t || '_lecture', t);
    execute format(
      'create policy %I on %I for insert to authenticated with check (connecte())',
      t || '_ajout', t);
  end loop;
end;
$bloc$;

-- ---------------------------------------------------------------------------
-- RÉGIME 5 — MIXTE : verbes séparés.
-- ---------------------------------------------------------------------------

-- `utilisateurs` : lisible par tout connecté (c'est l'annuaire), écrit par
-- un admin seul. La suppression est ouverte à l'admin depuis le 20/08/2026 —
-- mais elle ne supprime PAS le compte auth.users : l'accès est coupé,
-- l'adresse reste prise.
alter table utilisateurs enable row level security;
create policy utilisateurs_lecture on utilisateurs
  for select to authenticated using (connecte());
create policy utilisateurs_ecriture_admin on utilisateurs
  for all to authenticated using (est_admin()) with check (est_admin());

-- `navette_lignes` : création ouverte à tout connecté, MODIFICATION et
-- suppression réservées à l'admin. C'est ce qui fait que le crayon
-- « Modifier » n'est proposé qu'aux admins — le proposer à un agent ne
-- produirait qu'un refus des règles.
alter table navette_lignes enable row level security;
create policy navette_lignes_lecture on navette_lignes
  for select to authenticated using (connecte());
create policy navette_lignes_creation on navette_lignes
  for insert to authenticated with check (connecte());
create policy navette_lignes_modification on navette_lignes
  for update to authenticated using (est_admin()) with check (est_admin());
create policy navette_lignes_suppression on navette_lignes
  for delete to authenticated using (est_admin());

-- `navette_cycles` suit sa ligne : les cycles ne se modifient qu'avec elle.
alter table navette_cycles enable row level security;
create policy navette_cycles_lecture on navette_cycles
  for select to authenticated using (connecte());
create policy navette_cycles_ecriture on navette_cycles
  for all to authenticated using (est_admin()) with check (est_admin());

-- `navette_arbitrages` : proposé par tout connecté, visé par un admin OU un
-- porteur de profil de visa. La SUPPRESSION est interdite à tous — une
-- révision refusée reste à l'historique.
alter table navette_arbitrages enable row level security;
create policy navette_arbitrages_lecture on navette_arbitrages
  for select to authenticated using (connecte());
create policy navette_arbitrages_creation on navette_arbitrages
  for insert to authenticated with check (connecte());
create policy navette_arbitrages_visa on navette_arbitrages
  for update to authenticated
  using (est_admin() or a_profil('navette'))
  with check (est_admin() or a_profil('navette'));

-- `epcm_profils` a fusionné dans `utilisateur_profils` (régime 2, admin).

-- ---------------------------------------------------------------------------
-- RÉGIME 6 — PROPRIÉTAIRE PAR AUTEUR (discussions).
-- ---------------------------------------------------------------------------
alter table discussions_sujets enable row level security;
create policy discussions_sujets_lecture on discussions_sujets
  for select to authenticated using (connecte());
-- Création vérifiée EN SON PROPRE NOM, côté base et pas seulement côté UI.
create policy discussions_sujets_creation on discussions_sujets
  for insert to authenticated with check (auteur_id = auth.uid());
-- L'update reste ouvert à tout connecté : la clôture est une décision
-- d'auteur ou d'admin, mais c'est une règle d'UI — le pire cas est un sujet
-- rouvert par un tiers, pas une perte de donnée. (Note : l'aperçu du dernier
-- message est désormais écrit par TRIGGER, plus par celui qui poste.)
create policy discussions_sujets_maj on discussions_sujets
  for update to authenticated using (connecte()) with check (connecte());
create policy discussions_sujets_suppression on discussions_sujets
  for delete to authenticated using (est_admin());

alter table discussions_messages enable row level security;
create policy discussions_messages_lecture on discussions_messages
  for select to authenticated using (connecte());
create policy discussions_messages_creation on discussions_messages
  for insert to authenticated with check (auteur_id = auth.uid());
-- Un message NE SE MODIFIE PAS : pas de policy update. Réécrire un échange
-- déjà lu n'est pas une correction, c'est une falsification.
create policy discussions_messages_suppression on discussions_messages
  for delete to authenticated using (auteur_id = auth.uid() or est_admin());

-- ---------------------------------------------------------------------------
-- RÉGIME 7 — PROPRIÉTAIRE PAR UID.
-- Qui a lu quoi n'a pas à être exposé aux autres.
-- ---------------------------------------------------------------------------
alter table discussions_lectures enable row level security;
create policy discussions_lectures_propre on discussions_lectures
  for all to authenticated
  using (utilisateur_id = auth.uid())
  with check (utilisateur_id = auth.uid());
