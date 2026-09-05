// Modèle documentaire Firestore — même schéma que celui de l'ex-API NestJS
// (app_icp_api/src/firebase/collections.ts, abandonnée le 22/07/2026, cf.
// CLAUDE.md) : le front lit/écrit directement les mêmes collections avec le
// SDK client. Repris à l'identique pour rester compatible avec les données
// déjà importées dans le projet Firebase réel (driver-6ae2b).

import type { ProfilTonnage, ProfilValidationNavette, UserRole } from '../types/user'

export const COLLECTIONS = {
  utilisateurs: 'utilisateurs', // doc ID = uid Firebase Auth
  champs: 'champs', // doc ID = code (AGM, TRM…)
  fournisseurs: 'fournisseurs', // doc ID = idDocument(nom)
  services: 'services', // doc ID = code
  projets: 'projets',
  aliasProjets: 'alias_projets',
  lignesNavette: 'lignes_navette',
  // Révisions trimestrielles (arbitrages) des lignes navette — collection
  // nouvelle, pas héritée de l'ex-API (cf. CLAUDE.md, ajouts post-migration
  // Firestore direct comme firestore.rules/firebase.json).
  arbitragesNavette: 'arbitrages_navette',
  // Réglages navette globaux à l'application — un seul doc, id 'global'
  // (ex. cpManuel : CP saisi à la main, indépendant de toute ligne).
  // Collection nouvelle, pas héritée de l'ex-API.
  parametresNavette: 'parametres_navette',
  feuilleDeRoute: 'feuille_de_route',
  contrats: 'contrats', // doc ID = idDocument(reference)
  // Commandes (PO) — collection autonome depuis le 25/08/2026 (doc/module
  // contrat.docx §3 : certains contrats — topographie, EPCM — suivent leurs
  // commandes et leurs factures « sans forcément être rattaché à un projet
  // classique »). Elles vivaient jusque-là dans `projets/{id}.commandes[]`,
  // où une commande sans fiche projet n'avait nulle part où exister.
  // doc ID = l'id de la commande (celui de la fiche pour une commande
  // migrée, un UUID pour une commande nouvelle).
  commandes: 'commandes',
  liaisons: 'liaisons', // doc ID = idDocument(module, cleType, cleValeur normalisée)
  affairesMetal: 'affaires_metal',
  journalTonnage: 'journal_tonnage',
  personnelTonnage: 'personnel_tonnage',
  journalPeinture: 'journal_peinture',
  surveillanceProcurement: 'surveillance_procurement',
  activitesFacturation: 'activites_facturation',
  // Blobs opaques (référentiels/dashboards/grilles bornés) : un doc par
  // fichier JSON mock, champ `valeur` encodé en JSON string (certaines
  // grilles sont des tableaux de tableaux, refusés nativement par Firestore).
  donneesReferentiels: 'donnees_referentiels',
  // Saisie CRJ (29/07/2026, pilote "Personnel sur site") : contrairement aux
  // lignes historiques importées (blob hebdo-crj__personnel-site dans
  // donnees_referentiels, verrouillé en écriture), les entrées saisies depuis
  // l'app vivent ici, une ligne = un document, doc ID = idDocument(date, societe)
  // (upsert par jour/société, comme une ligne du classeur).
  hebdoCrjPersonnelSite: 'hebdo_crj_personnel_site',
  // Suite du même pilote, généralisée à toutes les sections saisissables du
  // rapport journalier (29/07/2026) — même principe : une ligne = un
  // document, doc ID déterministe pour upsert quand une clé métier naturelle
  // existe (journal = pas de clé naturelle, un horodatage y garantit
  // l'unicité à la place).
  hebdoCrjJournal: 'hebdo_crj_journal', // doc ID = idDocument(date, service, horodatage)
  hebdoCrjHseJournalier: 'hebdo_crj_hse_journalier', // doc ID = idDocument(date)
  hebdoCrjPersonnelMobilise: 'hebdo_crj_personnel_mobilise', // doc ID = idDocument(date, societe, profil)
  hebdoCrjMaterielSite: 'hebdo_crj_materiel_site', // doc ID = idDocument(date, societe, materiel)
  hebdoCrjDefautPlanning: 'hebdo_crj_defaut_planning', // doc ID = idDocument(date)
  // Images rattachées à une affaire (01/08/2026) — doc ID = crypto.randomUUID()
  // (pas de clé métier naturelle pour une photo, plusieurs images possibles
  // pour la même affaire le même jour). Ce document ne porte que les
  // métadonnées (PieceJointe) : le contenu de la photo vit en base 64 dans
  // `pieces_jointes_contenu` (cf. lib/piecesJointes.ts).
  hebdoCrjImages: 'hebdo_crj_images',
  // Événements HSE par société et par scope (23/08/2026) — doc ID =
  // idDocument(date, affaireId, societe, scope).
  hebdoCrjHseEvenements: 'hebdo_crj_hse_evenements',
  // Grille de tarifs NPT (03/08/2026, doc/commentaires CRJ.docx : "prévoir en
  // back-end la possibilité d'intégrer le coût des équipements... et du
  // personnel"). Un seul doc, id 'grille' (même principe que
  // parametres_navette) — c'est un référentiel de configuration, pas une
  // liste de lignes. Alimente GrilleTarifsNpt/coutStandbyGlobal
  // (lib/hebdoCrjEngine.ts), écrits le 28/07/2026 mais jamais branchés faute
  // de tarifs réels jusqu'ici.
  hebdoCrjTarifsNpt: 'hebdo_crj_tarifs_npt',
  // Saisie Tonnage échafaudage (04/08/2026, doc/suivi tonnage.docx) — même
  // principe que hebdo_crj_* : les lignes historiques importées restent en
  // lecture seule (journal_tonnage/activites_facturation ci-dessus), les
  // nouvelles saisies depuis l'app vivent dans ces collections dédiées.
  tonnageEchafJournalSaisie: 'tonnage_echaf_journal_saisie', // doc ID = idDocument(numeroDemande) (upsert par demande, cycle de vie montage→dépose)
  tonnageEchafActivitesSaisie: 'tonnage_echaf_activites_saisie', // doc ID = idDocument(numeroDemande, mois) (une demande peut être facturée sur plusieurs mois)
  // Saisie du Suivi personnel (06/08/2026) — une ligne = un intervenant sur
  // une journée : doc ID = idDocument(date, nom, numeroDemande) pour que le
  // même monteur puisse être pointé sur deux demandes le même jour tout en
  // restant en upsert (corriger un pointage ne crée pas de doublon).
  tonnageEchafPersonnelSaisie: 'tonnage_echaf_personnel_saisie',
  // Paramètres métier du contrat Échafaudage (03/09/2026, doc/Suivi tonnage
  // rev01.docx §A9 : « cette valeur doit être paramétrable ») — un document
  // unique `contrat` : unité et objectif journalier par champ, équipe de
  // référence, coefficients par profil, forfaits matériel et Core crew,
  // société exécutante par défaut, causes de stand-by et heures
  // incompressibles. Tant qu'il n'existe pas, l'écran sert les valeurs des
  // blobs importés (cf. lib/contratTonnageParametres.ts). Même forme et même
  // régime que peinture_parametres.
  tonnageEchafParametres: 'tonnage_echaf_parametres',
  // Rapport journalier (03/09/2026, doc/Suivi tonnage rev01.docx §C) — doc ID
  // = idDocument(date, champ), un rapport par jour et par champ. Il ne
  // duplique pas le Journal ni le Suivi personnel : il porte seulement ce
  // qu'aucun des deux ne sait dire (rédacteur, société exécutante) et sert de
  // point d'entrée qui les regroupe (cf. lib/contratTonnageRapports.ts).
  tonnageEchafRapports: 'tonnage_echaf_rapports',
  // Saisie Travaux METAL (06/08/2026) — doc ID = l'id de la ligne importée
  // quand on modifie une affaire du classeur (remplacement exact), sinon le
  // n° d'avis de la nouvelle affaire (cf. TravauxMetalPage : sur les données
  // réelles l'avis n'est ni toujours renseigné ni unique, il ne peut donc pas
  // servir de clé de fusion pour les lignes historiques).
  affairesMetalSaisie: 'affaires_metal_saisie',
  // Saisie Procurement follow-up (06/08/2026) — les 5 journaux du classeur
  // (DA, AO, PO, surveillance, préfabrication) étaient en lecture seule
  // (blobs figés + collection importée). Même convention de doc ID que
  // affaires_metal_saisie : l'id de la ligne importée quand on la modifie,
  // sinon la clé métier de la nouvelle ligne (n° DA, réf AO, n° PO…).
  procurementDaSaisie: 'procurement_da_saisie',
  procurementAoSaisie: 'procurement_ao_saisie',
  procurementPoSaisie: 'procurement_po_saisie',
  procurementSurveillanceSaisie: 'procurement_surveillance_saisie',
  procurementPrefaSaisie: 'procurement_prefa_saisie',
  // Saisie Contrat peinture (06/08/2026) — le JOURNAL de pointage
  // (journal_peinture, importé) reste en lecture seule. Doc ID = l'id de la
  // ligne importée quand on la modifie, sinon un UUID : une ligne de pointage
  // n'a pas de clé métier unique (même jour, même item et même site peuvent
  // revenir plusieurs fois).
  peintureJournalSaisie: 'peinture_journal_saisie',
  // Saisie du Journal « Grand arrêt — suivi préfabrication » (07/08/2026) —
  // la feuille importée est un blob figé de donnees_referentiels
  // (`grand-arret__journal`, verrouillé en écriture) : les lignes saisies
  // vivent ici. Doc ID = `ligne__{rang}` quand on modifie une ligne du
  // classeur (le Journal n'a aucune clé métier fiable : « N° LIGNE » est vide
  // partout et « N° ISO » a des doublons), sinon un UUID pour une ligne
  // créée dans l'app. Une ligne = un document { origineIndex, cellules }.
  grandArretJournalSaisie: 'grand_arret_journal_saisie',
  // Module « Courbes en S » (13/08/2026) — les 3 feuilles d'activités du
  // classeur (Projet_Baseline / Forecast / Réalisé Actualisé) sont livrées
  // avec le module (src/data/courbeEnS/activites.ts) : elles tiennent en 59
  // lignes par vue, contrairement aux journaux servis par Firestore. Seules
  // les saisies vivent ici, fusionnées à l'affichage par combinerParCle.
  // Doc ID = l'id de la ligne (`{vue}-{ordre}` pour une ligne du classeur,
  // UUID pour une activité créée dans l'app) — la vue fait partie de la clé,
  // une même activité existant dans les 3 feuilles avec des dates
  // différentes.
  courbeEnSActivites: 'courbe_en_s_activites',
  // Contenu des pièces jointes en base 64 (14/08/2026) — un document par
  // fichier, doc ID = l'id de la pièce jointe. Séparé des métadonnées, qui
  // vivent dans la fiche projet ou la ligne CRJ : celles-ci se listent en
  // permanence, le contenu ne se lit que lorsqu'une image est affichée. Le
  // plafond de 1 Mio par document borne de fait la taille des fichiers, cf.
  // lib/piecesJointes.ts.
  piecesJointesContenu: 'pieces_jointes_contenu',
  // Module Contrat EPCM (08/08/2026) — pilotage du personnel affecté à un
  // contrat forfaitaire mensuel. Aucun classeur source : tout naît de la
  // saisie, ces collections sont donc les seules données du module.
  epcmEmployes: 'epcm_employes', // doc ID = UUID (aucun matricule fiable)
  epcmPlanning: 'epcm_planning', // doc ID = idDocument(mois, employeId), un doc par employé et par mois
  epcmPointages: 'epcm_pointages', // doc ID = idDocument(mois, employeId), même découpage
  epcmRotations: 'epcm_rotations', // doc ID = UUID
  epcmContrats: 'epcm_contrats', // doc ID = idDocument(reference)
  // Relevés HSE hebdomadaires du contrat EPCM (doc/EPCM.docx §8) — doc ID =
  // idDocument(lundi de la semaine) : un relevé par semaine, réenregistrer
  // la même semaine met à jour au lieu d'empiler des doublons.
  epcmHse: 'epcm_hse',
  epcmProfils: 'epcm_profils', // doc ID = uid Firebase — profil d'accès au module (§13)
  // Journal d'audit (§12) : une entrée par champ modifié, jamais modifiable
  // ni supprimable (cf. firestore.rules).
  epcmHistorique: 'epcm_historique',
  // Discussions entre utilisateurs (07/08/2026) — un doc par sujet, doc ID =
  // crypto.randomUUID() (deux sujets peuvent légitimement porter le même
  // titre, aucune clé métier ici). Les messages du fil vivent dans la
  // sous-collection `messages` de leur sujet (même principe que
  // contrats/{id}/consommations) plutôt que dans une collection plate
  // filtrée par sujetId : trier les messages d'un fil par date n'y demande
  // aucun index composite à déployer.
  discussionsSujets: 'discussions_sujets',
  // Suivi de lecture, un doc par utilisateur (doc ID = uid), champ `sujets`
  // = { [sujetId]: date ISO de dernière ouverture } — alimente la pastille
  // "non lu" de la liste des sujets. Doc privé : les règles Firestore le
  // réservent à son propre uid, contrairement à tout le reste de l'app.
  discussionsLectures: 'discussions_lectures',
  // Référentiel des devises (18/08/2026) — un document par devise, doc ID =
  // code ISO (même convention que `champs` et `services`, dont le doc ID est
  // aussi le code). Le pivot est porté par le champ `pivot` d'un seul de ces
  // documents plutôt que par un document de configuration à part : le
  // référentiel reste d'une seule forme, et changer de pivot est une écriture
  // groupée sur deux devises (cf. contexts/DevisesContext.tsx).
  devises: 'devises',
  // Listes de valeurs paramétrables (18/08/2026) — un document par liste,
  // doc ID = l'identifiant du catalogue (`metal.typesTravaux`…, cf.
  // types/listeValeur.ts). Le document ne porte que les valeurs **ajoutées
  // par un administrateur** : celles déjà présentes dans les données restent
  // dérivées des journaux, elles n'ont pas à être recopiées ici.
  listesValeurs: 'listes_valeurs',
  // Paramètres métier du contrat peinture (27/08/2026, doc/Contrat
  // peinture.docx §11) — un document unique (`contrat`), comme
  // `hebdo_crj_tarifs_npt` et `parametres_navette`. Il porte le modèle de
  // productivité (heures et objectif par site, coefficients par profil), les
  // consommables et leurs deux prix unitaires, les équipements et leur
  // forfait, et les causes de stand-by. Tant qu'il n'existe pas, l'écran sert
  // les valeurs du référentiel DATA importé (cf. lib/contratPeintureParametres.ts).
  peintureParametres: 'peinture_parametres',
  // Rapport journalier du contrat peinture (27/08/2026, doc/Contrat
  // peinture.docx §1/§2/§3/§10) — doc ID = `idDocument(date, site)`, un
  // rapport par champ et par jour. Il ne duplique pas les pointages : il
  // porte l'en-tête (rédacteur, société exécutante) et le **total de
  // stand-by déclaré**, dont la ventilation par cause vit, elle, dans les
  // lignes STD du journal.
  peintureRapports: 'peinture_rapports',
} as const

export const SOUS_COLLECTION_CONSOMMATIONS = 'consommations'
// Augmentations de valeur cible d'un contrat (doc/module contrat.docx §2),
// sous `contrats/{id}/avc` — un historique, donc en création seule côté
// règles (comme `epcm_historique`).
export const SOUS_COLLECTION_AVC = 'avc'
// Augmentations du montant d'une commande (doc/module contrat.docx §2 et §4),
// sous `commandes/{id}/augmentations` — même régime que les AVC d'un contrat :
// un historique, donc en création seule.
export const SOUS_COLLECTION_AUGMENTATIONS = 'augmentations'
export const SOUS_COLLECTION_MESSAGES = 'messages'

// Journaux exposés par module (ex `GET /journaux/:cle` de l'API).
export const JOURNAUX: Record<string, string> = {
  'affaires-metal': COLLECTIONS.affairesMetal,
  tonnage: COLLECTIONS.journalTonnage,
  'personnel-tonnage': COLLECTIONS.personnelTonnage,
  peinture: COLLECTIONS.journalPeinture,
  'surveillance-procurement': COLLECTIONS.surveillanceProcurement,
  'activites-facturation': COLLECTIONS.activitesFacturation,
}

/**
 * ID de document déterministe : joint les parties par '__' en neutralisant
 * les caractères interdits ('/') ou ambigus. Matérialise les contraintes
 * d'unicité du CDS (codeOTP, référence contrat, registre {module, clé}).
 */
export function idDocument(...parties: string[]): string {
  return parties.map((p) => encodeURIComponent(p)).join('__')
}

export interface UtilisateurDoc {
  nom: string
  email: string
  role: UserRole
  fonction?: string
  // Profil de visa des révisions navette — absent tant qu'un admin ne l'a
  // pas désigné (cf. types/user.ts).
  profilNavette?: ProfilValidationNavette
  // Profil du workflow d'approbation Tonnage échafaudage (03/09/2026, lot 7)
  // — même principe, absent tant qu'un admin ne l'a pas désigné.
  profilTonnage?: ProfilTonnage
}
