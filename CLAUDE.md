# icp-front — Front React de l'outil ICP

Front React 19 + Vite + Tailwind 4 de l'application ICP (dématérialisation des
classeurs Excel de pilotage de projets d'ingénierie/travaux industriels,
TotalEnergies EP Gabon). Extrait du monorepo `../app_icp` (ex `apps/web`) le
18 juillet 2026 — projet désormais **indépendant** : son propre package.json,
son propre git, aucun workspace.

## Backend : abandonné le 22/07/2026, Firestore direct depuis le front

`../app_icp_api` (NestJS 11 + Firebase) est **abandonnée** depuis le
22/07/2026 — décision explicite de l'utilisateur pour tenir un déploiement le
23/07/2026 après que l'API déployée sur Render soit restée en 500 sur toutes
les routes (Secret File Firebase probablement mal posé) et que le plan payant
Blaze (nécessaire pour Cloud Functions/Cloud Run) ait été refusé pour
`driver-6ae2b`. Le front parle désormais **directement à Firestore** avec le
SDK client (`firebase/firestore`) : plus de serveur du tout, ce qui règle
aussi le problème Render au passage (Firestore direct + règles de sécurité
tourne très bien en plan gratuit Spark). `app_icp_api` reste sur disque comme
référence de la logique métier déjà portée (cf. son CLAUDE.md), mais n'est
plus déployée ni appelée.

- `src/lib/firebase.ts` — `auth` (Firebase Auth) + `db` (Firestore). Le projet
  réel derrière dépend de la branche depuis le 04/09/2026 (deux instances,
  voir plus bas) : `driver-6ae2b` sur `main`, `webicp` sur `prod`.
- `src/lib/firestoreCollections.ts` — noms de collections + `idDocument()`,
  repris à l'identique de l'ex-`app_icp_api/src/firebase/collections.ts` pour
  rester compatible avec les données déjà importées.
- `src/lib/firestoreData.ts` — `chargerDonnee()`/`chargerJournal()`,
  remplacent les anciennes routes génériques `GET /donnees/:cle` et
  `GET /journaux/:cle`.
- `src/lib/contratsEngine.ts` — port client du calcul de consommation par
  type de contrat (Métal/Échafaudage/Peinture dérivés, autres en saisie
  manuelle), qui vivait dans `ContratsService` côté API.
- Le rôle admin/agent (`AuthContext.tsx`) était un **custom claim** Firebase
  Auth posé par l'Admin SDK côté API ; sans backend pour en poser, la source
  d'autorité devient le champ **`utilisateurs/{uid}.role`** dans Firestore
  (déjà présent, déjà lu en parallèle par l'ex-API pour la fiche affichée) —
  cohérent avec `firestore.rules` qui lit ce même document.
- `firestore.rules` + `firebase.json` + `.firebaserc` (nouveaux, 22/07/2026) —
  règles de sécurité scopées explicitement aux collections ICP (jamais un
  `match /{document=**}` général) : **`driver-6ae2b` est un projet Firebase
  partagé** avec des apps "driver" (Android + web) qui cohabitent dans la
  même base Firestore. Aucune règle n'avait jamais été déployée jusqu'ici
  (l'API utilisait l'Admin SDK, qui contourne les règles) — **avant tout
  premier `firebase deploy --only firestore:rules`, vérifier les règles
  actuellement en place dans la console Firebase** pour ne pas casser le
  fonctionnement des apps "driver" ; c'est une action sur une infra de
  production partagée, à confirmer explicitement, pas à automatiser.
- Tous les `charger*()` de `data/*.ts` gardent la même signature
  (`Promise<T>`) qu'avant — seule l'implémentation interne a changé (lecture
  Firestore directe au lieu d'un fetch API).

**Saisie CRJ (pilote, 29/07/2026)** : la page `SuiviHebdoCrjPage` reproduit
`CRJ_16 06 26.xlsm` (feuille "Rapport journalier" seule — plus d'onglets
Synthèse/Journal, qui appartenaient à un autre classeur). Un premier circuit
d'écriture y a été ajouté pour valider que la saisie est possible malgré le
verrou `donnees_referentiels` (`allow write: if false`, où vivent les blobs
`hebdo-crj__*` historiques) : la section "Personnel sur site" écrit
réellement dans une **nouvelle collection Firestore dédiée**
`hebdo_crj_personnel_site` (une ligne = un document, doc ID =
`idDocument(date, societe)` pour upsert par jour/société), combinée à
l'affichage avec les lignes historiques importées via `combinerPersonnelSite()`
(une saisie remplace la ligne importée du même jour/société plutôt que de la
dupliquer). `firestore.rules` a une nouvelle règle pour cette collection
(`allow read/write: if connecte()`, comme `lignes_navette`/`contrats`) —
**ajoutée dans le fichier local, pas encore déployée** : comme toute
modification de `firestore.rules` sur ce projet Firebase partagé
(`driver-6ae2b`), un `firebase deploy --only firestore:rules` reste à
confirmer explicitement avant exécution. Le sélecteur de date du rapport est
devenu un vrai `<input type="date">` (au lieu d'un menu limité aux jours déjà
connus) pour permettre d'ouvrir un jour tout neuf et commencer à le
renseigner.

**Généralisé à toutes les sections saisissables (29/07/2026, même jour)** :
même principe répliqué sur 5 nouvelles collections Firestore dédiées —
`hebdo_crj_journal` (affaires des 3 sections SERVICE, doc ID =
`idDocument(date, service, horodatage)` car pas de clé métier naturelle,
comme `arbitrages_navette`), `hebdo_crj_hse_journalier` (doc ID =
`idDocument(date)`, une ligne par jour), `hebdo_crj_personnel_mobilise` (doc
ID = `idDocument(date, societe, profil)`), `hebdo_crj_materiel_site` (doc ID
= `idDocument(date, societe, materiel)`), `hebdo_crj_defaut_planning` (doc ID
= `idDocument(date)`). Toutes avec `allow read/write: if connecte()` dans
`firestore.rules`, déployées. Les formulaires de saisie (affaire, HSE,
personnel mobilisé, matériel, dérive planning) ne couvrent que les colonnes
affichées dans le rapport — les champs plus larges des types (ex.
`LigneJournalHebdo` a ~30 colonnes, seules ~12 sont dans le tableau visible)
restent à `null` pour les lignes saisies depuis l'app, pas d'invention de
valeur. Seul le bloc "Avancement général" reste purement dérivé (calculé
depuis les affaires des 3 sections SERVICE) — pas de formulaire dédié, ça
n'aurait pas de sens vu que c'est une moyenne.

**Restructuration du 30/07/2026 (retour explicite après test utilisateur)** :
- **"Personnel sur site" devient un onglet de synthèse pure** (comme
  "Avancement général" l'était déjà) : son formulaire de saisie a été
  supprimé, la collection `hebdo_crj_personnel_site` n'est plus utilisée par
  la page (règle Firestore laissée en place, inoffensive). La section
  calcule désormais `effectif`/`heuresMobilisation` (= effectif × 12h — une
  journée de travail vaut 12h, vérifié sur les données 16/06/2026 : SESI 3
  pers. → 36h, GMI 10 pers. → 120h) directement depuis "Suivi du personnel"
  (`personnelMobilise`), qui en devient la source de vérité explicite.
- **Personnel mobilisé et matériel sont rattachés à une affaire précise** :
  `PersonnelMobiliseLigne`/`MaterielSiteLigne` ont un nouveau champ
  `affaireId: number | string | null` (types/hebdoCrj.ts) — `null` pour les
  lignes historiques importées (jamais rétro-liées). Les doc ID Firestore
  intègrent désormais l'affaire (`idDocument(date, affaireId, societe,
  profil/materiel)`) pour éviter les collisions entre deux affaires
  partageant la même société/le même jour. Motivation explicite : sans ce
  rattachement, le NPT (`dureeStandBy`…) de plusieurs projets se mélangeait
  et devenait impossible à attribuer à l'un ou l'autre.
- **Saisie déplacée dans la ligne affaire elle-même** : dans les 3 sections
  SERVICE, chaque ligne affaire est désormais dépliable (`AffaireRow`,
  chevron cliquable) — le panneau déplié regroupe personnel mobilisé (+
  société de chaque intervenant) et matériel de CETTE affaire précise, avec
  leurs propres mini-formulaires (`PersonnelMobiliseSaisieForm`/
  `MaterielSiteSaisieForm`, qui prennent maintenant `affaireId` en prop).
  "Suivi du personnel" et "Suivi matériel sur site" restent des onglets mais
  en **lecture seule** : ce sont des synthèses agrégées des saisies par
  affaire (colonne "Affaire" ajoutée à "Suivi du personnel" via lookup dans
  le journal du jour), plus des points de saisie indépendants.
- **HSE** : la colonne "J-1" a toujours été une reprise automatique de la
  veille (le formulaire ne demandait déjà que "J") — clarifié dans l'UI par
  une note explicite plutôt que changé fonctionnellement. Nouvelle ligne
  "Heures travaillées" (J-1/J), jamais saisie : calculée comme effectif total
  du jour (Σ quantite de `personnelMobilise`, toutes affaires confondues) ×
  12h.

**Photos par affaire + HSE alimenté par les affaires (01/08/2026, demande
explicite)** :
- **Images** : chaque affaire dépliée (sections SERVICE) a un 4ᵉ bloc
  optionnel "Photos de ce projet", même principe que
  personnel/matériel/dérive planning — nouvelle collection Firestore
  `hebdo_crj_images` (métadonnées, `CrjImageLigne extends PieceJointe` +
  `affaireId`/`date`) et fichiers dans Firebase Storage sous
  `hebdo_crj/{affaireId}/...` (`lib/storageUpload.ts` →
  `uploaderImageCrj()`, réutilise le type `PieceJointe`/`uploaderFichier()`
  déjà utilisé par hypothèses et cahier des charges). **Bloquant découvert à
  cette occasion : Firebase Storage n'est pas activé sur `driver-6ae2b`**
  (`firebase deploy --only storage` échoue avec "has not been set up") — ce
  qui casse aussi, déjà, les uploads d'hypothèses/cahier des charges en
  prod. Nécessite un clic "Get Started" dans la console Firebase (action
  ponctuelle sur infra partagée, pas automatisable) avant que l'upload
  fonctionne réellement ; le code et `storage.rules` sont prêts.
- **HSE n'est plus une saisie séparée** : les 6 compteurs (FAT/LTI/HPI,
  premiers soins, anomalie, causerie sécurité) sont désormais saisis
  directement dans `AffaireSaisieForm` (section "HSE de cette affaire") et
  l'onglet HSE du rapport se contente de sommer `hseRecap()`
  (`lib/hebdoCrjEngine.ts`, déjà utilisé ailleurs pour le même calcul côté
  fiche projet/tableau de bord) sur les affaires du jour — `hseJournalier`
  (blob `hebdo-crj__hse-journalier` + collection `hebdo_crj_hse_journalier`)
  n'est plus chargé ni écrit par cette page. La ligne "Traitements médicaux"
  a été retirée de l'onglet HSE : `LigneJournalHebdo` n'a pas ce champ, donc
  rien à sommer — pas de donnée inventée pour combler l'écart avec l'ancien
  modèle de saisie manuelle.
- En chantier au passage : la section "Suivi dérive planning" en onglet
  autonome (vue calendrier du mois, `DefautPlanningTable`) avait été
  entièrement retirée sans que le code mort correspondant (filtres, memos)
  soit nettoyé — `tsc -b` échouait avant cette session. Nettoyé ici ; la
  dérive planning ne vit plus que dans le panneau déplié de chaque affaire
  (déjà le cas depuis le 30/07/2026).

**Couverture complète de `doc/commentaires CRJ.docx` (03/08/2026, demande
explicite « fais tout, couvre tout ce qui est dans le fichier »)** :
- **Date automatique + reprise J-1** : la date du rapport (en-tête) et celle
  de "Nouveau suivi" s'ouvrent désormais sur la date du jour (`aujourdHui()`)
  plutôt que la dernière date connue en base. Si une affaire du même
  projet/service existait la veille, ses scopes (voir ci-dessous)
  préremplissent le J-1 de la nouvelle ligne.
- **Scopes multiples par affaire** : `LigneJournalHebdo.scopes`
  (`types/hebdoCrj.ts`) remplace le couple unique description/avancement —
  plusieurs tâches par affaire ("Scope PVV 50 %", "Scope Électricité
  70 %"...), chacune avec son propre J-1/J ; `avancementReel`/
  `avancementVeille` de l'affaire restent alimentés (moyenne des scopes,
  recalculée à la saisie) pour que le reste du code continue de lire un seul
  nombre. `phase` (toujours "Exécution", automatique) ajouté au même champ.
- **Dérive planning simplifiée** : H prod. normale (12h fixe) et Nb PAX
  (= personnel mobilisé de la même affaire) ne sont plus saisis ligne par
  ligne — calculés automatiquement.
- **Onglet "Dérive planning" réintroduit en lecture seule** — retour en
  arrière partiel, décision explicite de l'utilisateur, sur le retrait du
  01/08/2026 : la synthèse (`causesDerivePlanning()`, déjà écrite le
  22/07/2026 mais jamais branchée) redevient un onglet séparé, alimentée par
  la fusion ci-dessous.
- **Coût standby (NPT) branché** : nouvel onglet "Coût standby" qui utilise
  enfin `coutStandbyGlobal()` (écrit le 28/07/2026, resté inutilisé faute de
  tarifs réels) via une grille désormais éditable par les admins
  (`GrilleTarifsForm`) et persistée dans la nouvelle collection Firestore
  `hebdo_crj_tarifs_npt` (un seul document `grille`, comme
  `parametres_navette`). Règle Firestore ajoutée dans le fichier local,
  **PAS ENCORE DÉPLOYÉE** (même réserve que les autres collections
  `hebdo_crj_*` sur ce projet Firebase partagé — confirmé explicitement
  refusé pour l'instant côté déploiement, 04/08/2026).
- `data/hebdoCrj.ts` (mort, plus importé nulle part) supprimé au passage —
  il bloquait `tsc -b` une fois `phase`/`scopes` ajoutés à
  `LigneJournalHebdo`.

**Fusion Personnel mobilisé / Dérive planning (04/08/2026, suite à une
vérification croisée demandée par l'utilisateur du travail du 03/08/2026,
qui a révélé un vrai doublon de saisie)** : la section "Dérive planning" du
formulaire "Nouveau suivi" (Durée STB + Cause, indépendante de "Personnel
mobilisé") a été supprimée — la cause et sa part de durée se saisissent
désormais directement dans chaque ligne "Personnel mobilisé"
(`PersonnelRowInput.standby: StandbyRowInput[]` côté formulaire, une même
ligne peut ventiler son standby entre plusieurs causes comme demandé par le
doc : "6h = 2h météo + 1h logistique + 3h FRC"). `dureeStandBy` de la ligne
= somme calculée de sa ventilation. Chaque entrée de la ventilation continue
d'écrire un `DefautPlanningLigne` dans `hebdo_crj_defaut_planning` (mêmes
champs qu'avant), donc l'onglet "Dérive planning" en lecture seule n'a rien
eu à changer. **Bug corrigé au même moment** : l'ID de ces documents
(`idDocument(date, affaireId)` seul, sans rien pour distinguer une cause
d'une autre) faisait que ventiler un standby sur plusieurs causes écrivait
plusieurs fois le même document Firestore — la dernière cause écrasait
silencieusement les précédentes, un bug déjà présent avant la fusion (dans
l'ancienne section "Dérive planning" elle-même) mais qui n'avait pas été
repéré lors de la vérification croisée initiale. `crypto.randomUUID()`
ajouté à la clé (même principe que `hebdo_crj_images`).

**Saisie par étapes + service dédié (06/08/2026, demande explicite)** : le
formulaire "Nouveau suivi journalier" (`NouveauSuiviForm`) n'empile plus ses
6 sections d'un coup — il en affiche **une à la fois**, précédée d'une
**flèche de suivi** (`FlecheEtapes`, chevrons imbriqués en clip-path) qui
donne en permanence l'état de remplissage de chacune : Projet, Phases &
scopes, Personnel & NPT (obligatoires) puis Matériel, HSE, Photos
(optionnelles). Les états (`complet` / `partiel` / `vu` / `vide`) sont
**dérivés de l'état du formulaire à chaque rendu**, pas de drapeaux posés à
la main — revider une section la fait repasser au gris d'elle-même. `vu` =
étape optionnelle ouverte et laissée vide volontairement (aucun matériel,
RAS HSE, aucune photo) : elle se coche, contrairement à une étape jamais
ouverte. Le menu déroulant "Service", jusque-là noyé au milieu des champs
généraux, devient un **onglet dédié en tête de modale** (METAL /
CONSTRUCTION / PROJET, style des 3 onglets du classeur Excel, cf.
`commentaires CRJ_rev01.docx` : "la feuille de saisie reste identique pour
les trois services") — le titre de la modale porte le service actif, et
`service` n'est plus réinitialisé après enregistrement (même raison que
`date` : on enchaîne les affaires d'un même service/jour). Conséquence
technique notée dans le code : les attributs `required` des étapes non
affichées ne sont plus dans le DOM, donc la validation native du navigateur
ne les voit plus — `handleSubmit` vérifie lui-même les 3 étapes obligatoires
et renvoie sur la première manquante ; `Entrée` ne valide plus le formulaire
avant la dernière étape. Le bouton "Enregistrer" reste proposé à toutes les
étapes (rien n'oblige à dérouler les optionnelles une fois l'obligatoire
rempli). Aucun changement de modèle de données ni de collection Firestore —
c'est purement le parcours de saisie.

**Tonnage échafaudage aligné sur le CRJ + factorisation (06/08/2026, demande
explicite « adapte le fichier selon SuiviHebdoCrjPage, crée des formulaires en
t'appuyant sur les colonnes des champs, organise la page, tout ce qui peut
être factorisé fais-le »)** :
- **Briques partagées extraites** (elles étaient dupliquées, parfois avec des
  divergences déjà installées) : `lib/etapesFormulaire.ts` (types + `useEtapes`
  + `bloquerEntree`) et `components/ui/FlecheEtapes.tsx` (`FlecheEtapes`,
  `EnteteEtapes`, `PiedEtapes`) — la flèche de suivi écrite le matin même pour
  le CRJ sert maintenant aux 3 formulaires Tonnage ; `lib/saisie.ts`
  (`combinerParCle`, `aujourdHui`) ; `components/ui/classes.ts` (classes
  Tailwind des champs/filtres) ; `components/ui/ChampsSaisie.tsx`
  (`DatalistInput`, `ChampDerive`, `SelectChamp`, `EnteteSection`) ;
  `components/ui/FiltresTableau.tsx` (barre de filtres + recherche +
  compteur) ; `components/ui/TableauColonnes.tsx`. Les 2 `Pagination` locales
  (page Tonnage + FacturationPointTabs) sont remplacées par
  `components/ui/Pagination` + `usePagination`.
- **Tableaux pilotés par des définitions de colonnes** (`components/tonnage/
  colonnes.tsx` et `colonnesFacturation.tsx`) au lieu d'un mur de `<th>` suivi
  d'un mur de `<td>` à garder synchronisés à la main : Journal 48 colonnes,
  SUIVI DES ACTIVITES 52, Suivi personnel 17, factures GMI 11. Au passage, le
  `colSpan` de la ligne "aucun résultat" de SUIVI DES ACTIVITES était faux
  (52 déclaré pour 52 colonnes réelles côté en-tête mais 53 `<th>` comptés) —
  le problème disparaît structurellement.
- **Page réorganisée** : `pages/TonnageEchafPage.tsx` passe de ~1 120 à ~330
  lignes et ne fait plus que charger les données, écrire dans Firestore et
  gérer les 2 groupes d'onglets ; `SyntheseTab`, `JournalTab`, `PersonnelTab`
  vivent dans `components/tonnage/`.
- **Formulaires par étapes** (même parcours que le CRJ, une section à la fois
  + flèche de suivi) construits sur les groupes de colonnes des feuilles :
  Journal montage/dépose (Identification → Cycle de vie → Dimensions →
  Notes ; M3 et poids contractuel affichés en dérivé pendant la saisie des
  cotes), SUIVI DES ACTIVITES (Demande → Période facturée → Prestations →
  Régie → Notes). Le n° de demande devient obligatoire dans le Journal : c'est
  la clé d'upsert Firestore, sans lui la saisie retombait sur un
  `crypto.randomUUID()` qui cassait le suivi d'une demande dans le temps.
- **Nouveau : saisie du Suivi personnel** (`PersonnelTonnageSaisieForm`,
  collection `tonnage_echaf_personnel_saisie`, doc ID = `idDocument(date, nom,
  numeroDemande)`) — c'était le seul onglet opérationnel encore en lecture
  seule alors qu'il porte le NPT. Comme partout, seules les colonnes
  manuelles sont demandées : `derivePersonnelTonnage()`
  (`lib/tonnageEchafEngine.ts`) calcule NPT = standby/heures, part temps
  productif = 1 − NPT, objectif prod. (T) = productivité × objectif kg/h du
  champ × heures/jour ÷ 1000 et objectif prod. (kg) = objectif (T) × 1000 ÷
  heures/jour — **formules vérifiées sur les 3 384 lignes réelles du classeur,
  0 écart sur les 4 colonnes**. La productivité d'un profil est proposée
  d'après les pointages existants (`productiviteHabituelle()`) plutôt que
  codée en dur : un profil inconnu du classeur reste à saisir à la main.
  Règle `firestore.rules` ajoutée localement, **PAS ENCORE DÉPLOYÉE** (même
  réserve que les autres collections de saisie sur `driver-6ae2b`).

**Travaux METAL : même traitement (06/08/2026, dans la foulée)** — page
réorganisée (`pages/TravauxMetalPage.tsx` : 743 → 156 lignes, `KpiTab`,
`AffairesTab`, `ReferentielTab` déplacés dans `components/metal/`), `Pagination`
locale + `selectClass` + barre de filtres remplacés par les briques partagées,
tableau des 42 colonnes piloté par `components/metal/colonnes.tsx`, et
**nouveau formulaire de saisie d'une affaire** (`AffaireMetalSaisieForm`,
étapes Identification → Planning → Avancement → Doc. finale → Coût & statut).
La feuille "Travaux METAL" était en lecture seule alors qu'elle est la source
de tous les pivots du KPI METAL. Les colonnes calculées (statut corrigé, les
3 durées, checks CFP/CFT, avancement général prév./réel) sont affichées en
dérivé pendant la saisie via `travauxMetalEngine` — d'autant plus utile
qu'elles sont **cassées en #REF! dans le classeur source**, l'app est le seul
endroit où elles ont une valeur. Les avancements de phase se saisissent en %
ou "NA" (bouton dédié), les 3 valeurs possibles de la colonne d'origine.
Collection `affaires_metal_saisie` : **la clé de fusion est l'id de la ligne,
pas le n° d'avis** — vérifié sur les 116 affaires réelles, l'avis vaut "NC"
sur 5 lignes et un même n° est porté par 2 affaires distinctes, l'utiliser
comme clé aurait écrasé plusieurs lignes historiques d'un coup. Modifier une
affaire importée écrit donc un document dont l'ID est son id d'origine
(remplacement 1 pour 1) ; une affaire nouvelle prend son n° d'avis (ou un
UUID). Règle `firestore.rules` ajoutée localement, **PAS ENCORE DÉPLOYÉE**.

**Procurement follow-up : même traitement (06/08/2026, dans la foulée)** —
page réorganisée (`pages/ProcurementFollowUpPage.tsx` : 1 388 → 270 lignes,
les 7 onglets dans `components/procurement/`, briques d'affichage communes —
StatCard, StatutBadge, histogrammes, jauges, ETA reçu/non reçu — dans
`elements.tsx`), tableaux pilotés par `components/procurement/colonnes.tsx`
(DA 3 colonnes, AO 14, PO 29, surveillance 31, préfa 16), et **5 nouveaux
formulaires de saisie** : les 5 journaux du classeur étaient en lecture seule
(4 blobs figés + la collection surveillance importée).
- **Nouveau moteur `components/ui/FormulaireEtapes.tsx`** : formulaire à
  étapes **déclaratif** (étapes et champs décrits en objets), parce que ces
  5 formulaires ne diffèrent que par leur liste de champs — les écrire à la
  main aurait fait 5 × ~350 lignes de JSX quasi identiques. Types de champs
  couverts : texte / date / nombre / pourcentage / select / liste suggérée /
  champ dérivé en lecture seule. Les formulaires CRJ, Tonnage et METAL
  gardent leur JSX propre : chacun a une mécanique que ce moteur ne couvre
  pas (lignes dynamiques, ventilation du standby, bouton "NA", reprise J-1).
- Colonnes calculées affichées en dérivé pendant la saisie : délai de
  fabrication réel et gaps EXW / maritime / aérien (PO), reste à livrer
  (préfa). **Le "gap" de la surveillance reste saisi** : vérifié sur les
  1 612 articles réels, ce n'est pas l'écart avancement − PDS (les deux ne
  concordent sur aucune ligne), donc pas de formule inventée pour combler
  l'écart.
- **Deux résumés figés deviennent dérivés** (`resumeStatutsDa`,
  `resumePrefa` dans `lib/procurementFollowUpEngine.ts`) : ils venaient des
  blobs du classeur et seraient devenus faux dès la première saisie. Vérifiés
  à l'identique avant bascule (DA 57 in progress / 25 closed ; préfa qté
  totale 1 342 dont 895 livrées / 447 non livrées). Attention, les compteurs
  préfa OUI/NON sont des **quantités**, pas des nombres de lignes (895 pour
  36 lignes). `resteALivrerPrefa` = besoin − livré, 0 écart sur 67 lignes.
- Collections `procurement_{da,ao,po,surveillance,prefa}_saisie`, même
  convention de clé que METAL (doc ID = id de la ligne importée quand on la
  modifie, clé métier ou UUID pour une nouvelle). Règles ajoutées localement,
  **PAS ENCORE DÉPLOYÉES**.
- Factorisation transverse au passage : `valeursDistinctes()`
  (`lib/saisie.ts`) et `formatDateOuTexte()` (`lib/format.ts`, dates parfois
  saisies en texte dans les classeurs Procurement) remplacent les copies
  locales des modules Tonnage, METAL et Procurement.

**Contrat peinture : même traitement (06/08/2026, dans la foulée)** — page
réorganisée (`pages/ContratPeinturePage.tsx` : 982 → 141 lignes, les 4 onglets
+ les briques d'affichage dans `components/peinture/`), tableaux pilotés par
`components/peinture/colonnes.tsx` (JOURNAL 41 colonnes, tarifs 10, objectifs
8), briques partagées à la place des copies locales, et **saisie du JOURNAL de
pointage** (`JournalPeintureSaisieForm`, moteur déclaratif `FormulaireEtapes`,
étapes Pointage → Affaire → Quantités → Période → Coûts → Commentaire ;
collection `peinture_journal_saisie`, clé = id de la ligne). Le JOURNAL était
en lecture seule alors qu'il est la source de presque tout le module (synthèse
par site, stand-by par type d'item, courbes journalières, coût au pointage).
- **`deriveLigneJournal()` enfin branchée** : elle existait depuis l'import du
  classeur mais n'avait jamais servi. La vérifier avant de s'en servir a
  révélé un **bug** : sa colonne FILTRE forçait les majuscules alors que le
  classeur conserve la casse ("Cons"/"Pers" pour Consommable/Personnel) —
  **610 des 2 124 lignes réelles auraient divergé**. Corrigé.
- **Les 3 coûts unitaires ne sont plus saisis** : nouveau
  `coutsUnitairesDuTarif()` qui les reprend du référentiel DATA par type
  d'item (le RECHERCHEV du classeur), vérifié sans écart sur toutes les lignes
  réelles comparables (1 040 au pointage, 1 996 stand-by, 194 ancien contrat).
  Restent saisis, faute de formule reproductible dans les données réelles :
  CPY (h), temps de production/champ, productivité/profil, cible/jour, part de
  temps productif. Règle `firestore.rules` ajoutée localement, **PAS ENCORE
  DÉPLOYÉE**.

**Module « Contrat EPCM » (08/08/2026, demande explicite « on fera un module
à part comme c'est fait avec contrats », suivie d'un cahier des charges en 14
points)** — pilotage des ressources humaines affectées à un contrat
forfaitaire mensuel : `pages/ContratEpcmPage.tsx` + `components/epcm/` (10
onglets) + `lib/contratEpcmEngine.ts` (calculs purs), `contratEpcmFirestore.ts`
(écritures + audit), `contratEpcmImport.ts` (import de pointages).
- **Premier module sans classeur source** : aucune donnée n'est importée,
  tout naît de la saisie. Rien n'est pré-rempli — aucun employé, aucun coût
  journalier par défaut, aucun budget de démonstration : une valeur inventée
  se retrouverait dans les coûts et les alertes comme si elle était réelle.
  Un employé sans coût journalier pèse 0 et l'écran le signale (« à définir »)
  au lieu de le valoriser au hasard.
- **Règle centrale, à connaître avant de toucher aux calculs** : une journée
  compte comme travaillée si le **pointage** le dit, et à défaut de pointage
  si le **planning** le dit (`jourTravaille`). Le planning porte le prévu, le
  pointage le réalisé. Les affectations qui comptent un jour travaillé sont
  déclarées dans une seule table (`AFFECTATIONS` : site, bureau, rotation,
  mission, formation ; pas congé/repos/absences) — changer la règle, c'est
  changer cette colonne. La rotation est comptée à part du « présent sur
  site » : le tableau de bord demande les deux effectifs séparément (§10),
  les additionner compterait deux fois la même personne.
- **Stockage** : un document de planning et un de pointage **par employé et
  par mois** (`{ jours: { 'YYYY-MM-DD': … } }`), soit ~40 documents mensuels
  au lieu de ~1 200 en un-doc-par-jour — repeindre une semaine entière au
  pinceau reste une seule écriture. Collections `epcm_employes`,
  `epcm_planning`, `epcm_pointages`, `epcm_rotations`, `epcm_contrats`,
  `epcm_profils`, `epcm_historique`.
- **Planning peint à la souris** (§4 « glisser-déposer ou simple sélection ») :
  palette d'affectations puis clic ou glissé sur une plage de jours. Les
  changements restent en brouillon jusqu'au bouton Enregistrer — écrire à
  chaque case traversée produirait des dizaines d'écritures et autant
  d'entrées d'audit par geste.
- **Rotations non saisies deux fois** (§6) : jours site / bureau / repos
  comptés dans le planning de la période (`rotationDerivee`), jamais
  ressaisis. Une rotation dont la période est passée mais dont des jours
  n'ont jamais été planifiés est « incomplète » — c'est l'alerte du §9.
- **Historique (§12) écrit dans le même `writeBatch` que la donnée** : une
  entrée par champ modifié (ancienne et nouvelle valeur, utilisateur,
  horodatage). `epcm_historique` est en **création seule** dans
  `firestore.rules` — ni update ni delete, pas même pour un admin : une trace
  réécrite ne prouve plus rien. Toutes les écritures du module passent par
  `contratEpcmFirestore.ts` pour cette raison.
- **Profils d'accès (§13) propres au module** : les 6 niveaux demandés vivent
  dans `epcm_profils/{uid}` et s'ajoutent aux 3 rôles applicatifs
  (admin/agent/controleur) **sans les remplacer** — remanier les rôles
  globaux aurait touché l'authentification de toute l'app, ses règles et
  l'écran Utilisateurs pour un besoin local. Un admin de l'app est
  administrateur EPCM d'office. **Limite assumée** : ces profils filtrent
  l'interface, pas les règles Firestore, qui restent au niveau « utilisateur
  connecté » comme les autres modules de saisie.
- **Export Excel = CSV** (`lib/exportCsv.ts`, séparateur `;` + BOM UTF-8, ce
  qu'Excel ouvre en double-clic sur un poste francophone) : écrire un vrai
  .xlsx aurait demandé une dépendance de plus pour des tableaux plats sans
  mise en forme. Le PDF réutilise jsPDF (`exporterRapportPdf`, nouveau :
  plusieurs tableaux dans un document).
- **Seuils de budget** : 80 % et 90 % partagent l'orange (le CDS demande
  trois seuils mais seulement trois couleurs, le rouge étant réservé au
  dépassement) — leurs libellés les distinguent.
- Vérification : pas de classeur à rejouer ici, donc le moteur a été validé
  sur un scénario complet (2 employés, planning et pointage contradictoires,
  quotas, rotations, budget) — **25 assertions, toutes passantes**, y compris
  la primauté du pointage sur le planning et le déclenchement des alertes.
- Règles `firestore.rules` ajoutées localement, **PAS ENCORE DÉPLOYÉES**.
  Sans déploiement, les lectures renvoient vide et les écritures affichent
  l'erreur en tête de page (elles ne sont pas silencieuses).
- Reste ouvert : le module ne remonte pas encore sa consommation au contrat
  `PERSONNEL_EPCM` du module Contrats (`ContratsPage`), qui continue de se
  saisir à la main — c'est le branchement naturel suivant.

**Contrat peinture — avancement prévisionnel déduit des dates (08/08/2026,
demande explicite « dans l'onglet quantité on va remplir la surface totale à
réaliser, surface réalisée ; l'avancement prévisionnel est calculé seul grâce
aux dates »)** : l'étape « Quantités » de `JournalPeintureSaisieForm` ne
demande plus que les deux surfaces. **La règle demandée est exactement celle
du classeur**, retrouvée en la cherchant dans les données plutôt qu'en
l'inventant : `% prévisionnel = 1 / durée` (part de l'ouvrage prévue par jour
de planning) et `surface prévisionnelle = surface totale / durée`, avec
`durée = fin − début + 1` — vérifiées sur les lignes datées du JOURNAL, **0
écart** (739 / 739 / 738 lignes). L'étape « Période » passe donc **avant**
« Quantités » : c'est elle qui produit ces valeurs. Elle reste optionnelle —
seules 738 des 2 124 lignes réelles ont une période (les pointages stand-by
et personnel n'en ont pas) — et sans dates, la valeur déjà en place est
conservée plutôt qu'écrasée.
- **Deux bugs préexistants corrigés au passage**, révélés en rejouant
  `deriveLigneJournal()` sur les 2 124 lignes réelles (ils faussaient ce que
  le formulaire écrivait depuis le 06/08/2026, pas les lignes importées) :
  le **forfait de stand-by** ne s'appliquait qu'à la catégorie MATERIEL alors
  que le classeur facture le tarif unitaire sur **toute ligne sans
  quantité** (394 lignes à 0 au lieu de leur tarif : 380 Consommable, 14
  Personnel) — 1 996 lignes vérifiées, 0 écart contre 1 602 ; et la colonne
  **MOIS** était écrite en toutes lettres ("avril") alors que le classeur
  abrège ("avr"), ce qui aurait dédoublé l'entrée du filtre Mois de l'onglet
  Journal dès la première saisie. Les 10 colonnes dérivées du module
  reproduisent désormais le classeur sans aucun écart.

**Grand arrêt — saisie du Journal (07/08/2026, demande explicite « pour la
section journal je veux que tu appliques un formulaire comme c'est fait pour
la modal suivi »)** : la feuille « Journal » (préfabrication / atelier) était
en lecture seule alors qu'elle est la source des deux onglets dérivés du
classeur (Dashboard, Backend). Elle a désormais son formulaire à étapes, et
l'onglet est sorti de la page dans `components/grandArret/JournalTab.tsx`
(même réorganisation que Tonnage / METAL / Procurement).
- **Formulaire construit depuis la feuille, pas depuis un modèle métier** :
  le Journal n'est pas une liste d'objets typés mais une grille brute de 93
  colonnes × 165 lignes (`JournalGrandArret`, cellules non nommées).
  `JournalSaisieForm` génère donc ses étapes à partir des **bandes de
  colonnes du classeur** (ligne 5 : GRAND ARRÊT AGM 2023, ETUDES, MTO,
  FOURNITURES MATERIEL, OUVRAGE, STR, PVV, PREPARATION ASSEMBLAGE, SOUDAGE,
  CND, EPREUVE HYDRAULIQUE, PEINTURE = 12 étapes) et un champ par colonne,
  typé par le format déjà détecté à l'import. Ajouter une colonne au classeur
  ajoute son champ sans toucher au code. Seule la première bande
  (SCOPE/AFFAIRE/PLATEFORME/ENTREPRISE) est obligatoire — le reste se
  remplit au fil des phases. Les colonnes texte à moins de 40 valeurs
  distinctes sont proposées en liste suggérée ; les n° d'ISO et autres
  colonnes à forte cardinalité restent en frappe libre.
- **Colonnes calculées** (`lib/grandArretEngine.ts`, index de colonnes
  1-based = numérotation Excel, seul repère stable de cette feuille), toutes
  vérifiées sur les 165 lignes réelles avant d'être écrites — le moteur
  rejoue le classeur à l'identique : **4 055 cellules numériques recalculées,
  0 divergence**. Durée d'exécution = fin − début ; **durée courue = jours
  écoulés depuis le début plafonnés par la durée d'exécution** (retrouvée
  avec la date d'extraction du classeur, 10/05/2023 — cohérente avec son nom
  « VF_1005 ») ; avancement prévisionnel = durée courue / durée d'exécution,
  pour les 5 phases qui répètent ce bloc ; RESTE A LIVRER = 1 − LIVRAISON
  CPY ; avancement réel SOUDAGE = **pouces réalisés / pouces total** et non
  soudures réalisées / total, qui diverge sur 20 lignes (c'est le métrage
  soudé qui fait l'avancement, pas le comptage de joints). Une formule dont
  les entrées manquent laisse la valeur en place au lieu de l'écraser :
  beaucoup de lignes importées ont une durée sans les dates correspondantes.
  La durée courue est la seule colonne qui dépend du jour du calcul — elle
  est figée à l'enregistrement, les lignes importées gardant la valeur du
  classeur (pas de réécriture rétroactive de l'historique).
- **Les 10 % du bandeau deviennent dérivés** (`kpisJournal`) : moyenne de
  leur propre colonne, sauf « Revue CPY » = 1 − moyenne de « REALISATION
  CTR » et « RESTE A LIVRER » = 1 − moyenne de « LIVRAISON CPY » (et non la
  moyenne de la colonne 9, que 2 lignes renseignent sans la livraison).
  Vérifié à 0 écart sur les 10 KPI ; figés, ils auraient cessé d'être vrais
  dès la première saisie — même raison que les résumés du module Procurement.
- **Clé de fusion = le rang de la ligne dans le blob importé**, faute de clé
  métier : « N° LIGNE » est vide sur les 165 lignes et « N° ISO » compte 153
  valeurs distinctes pour 163 lignes renseignées (doublons « 100-1 », « En
  cours »…). Collection `grand_arret_journal_saisie` (doc ID = `ligne__{rang}`
  pour une ligne du classeur modifiée, UUID pour une ligne créée dans l'app,
  document = `{ origineIndex, cellules }`) fusionnée à l'affichage. Ce rang
  n'est stable que tant que le blob n'est pas réimporté dans un autre ordre.
  La colonne 14, que le classeur intitule lui-même « N° Soudure (COLONNE à
  SUPPRIMER) », n'est pas proposée à la saisie mais sa valeur d'origine est
  conservée. Règle `firestore.rules` ajoutée localement, **PAS ENCORE
  DÉPLOYÉE**. Dashboard et Backend restent servis par leurs blobs figés :
  les dériver du Journal serait le prolongement naturel, pas fait ici.

**Discussions entre utilisateurs (07/08/2026, demande explicite « une partie
chat entre les users pour discuter sur des sujets »)** — nouveau module
`pages/DiscussionsPage.tsx` (menu « Discussions », accessible à tous les
rôles) : liste de **sujets** à gauche, fil de messages du sujet ouvert à
droite, comme une messagerie (les deux panneaux cohabitent à partir de `lg`,
en dessous c'est liste OU fil avec bouton retour).
- **Premier module non métier de l'app** : c'est de la conversation, rien
  n'entre dans un calcul, aucun rattachement à une fiche projet ni à une
  résolution `lib/liaison.ts`. Le thème d'un sujet (« Navette », « Suivi
  hebdo CRJ »…, `THEMES_DISCUSSION` dans `types/discussion.ts`) est un
  simple filtre d'affichage, pas un lien fonctionnel.
- **Seul module en temps réel** : `lib/discussionsFirestore.ts` s'abonne via
  `onSnapshot` (sujets, messages du fil ouvert, suivi de lecture) au lieu du
  `getDocs` au montage utilisé partout ailleurs (`lib/firestoreData.ts`) —
  un fil qui n'arrive qu'au rechargement n'est pas une conversation. Coût
  borné : les fils sont courts, contrairement aux journaux métier.
- **Collections** : `discussions_sujets` (doc ID = UUID, aucune clé métier)
  avec les messages en **sous-collection `messages`** de chaque sujet (comme
  `contrats/{id}/consommations`) — une collection plate filtrée par
  `sujetId` puis triée par date aurait demandé un index composite à
  déployer, la sous-collection non. Le sujet porte un aperçu **dénormalisé**
  du dernier message (`dernierMessageLe`/`Auteur`/`Extrait`,
  `nombreMessages`) pour afficher et trier la liste sans lire les messages
  de chaque sujet. `discussions_lectures/{uid}` (champ `sujets` =
  `{ [sujetId]: date ISO d'ouverture }`) alimente la pastille « non lu ».
- **Règles Firestore** : lecture des sujets et messages ouverte à tout
  connecté (espace commun, **pas de messagerie privée** — rien de
  confidentiel n'a à y être écrit) ; création vérifiée en son propre nom
  (`auteurId == request.auth.uid`, côté règles et pas seulement côté UI) ;
  un message **ne se modifie pas** (`allow update: if false` — pas de
  réécriture silencieuse d'un échange déjà lu) et ne se supprime que par son
  auteur ou un admin ; `discussions_lectures/{uid}` est la seule collection
  du fichier réservée à son propre uid (qui a lu quoi n'a pas à être
  exposé). L'`update` d'un sujet reste ouvert à tout connecté : l'aperçu
  dénormalisé est écrit par celui qui poste, pas par l'auteur du sujet — la
  restriction « clôturer/rouvrir = auteur ou admin » est donc côté UI
  seulement, assumé (le pire cas est un sujet rouvert par un tiers, pas une
  perte de donnée). Comme toutes les modifications de `firestore.rules` sur
  ce projet Firebase partagé `driver-6ae2b`, ces règles sont **ajoutées
  localement, PAS ENCORE DÉPLOYÉES** — sans déploiement, la page affichera
  son message d'erreur de chargement.
- Un sujet tranché se **clôture** (masqué par défaut, retrouvable via le
  filtre « Clôturés ») plutôt que de se supprimer : l'échange qui a mené à
  la décision reste consultable. La suppression complète existe mais est
  réservée aux admins — elle supprime explicitement les messages de la
  sous-collection avant le sujet (Firestore ne le fait pas tout seul, les
  documents resteraient orphelins et facturés).
- Horodatages en ISO client, comme le reste de l'app : deux messages postés
  dans la même seconde depuis des postes aux horloges décalées peuvent
  s'afficher dans le désordre — assumé, l'échange étant asynchrone.
  `formatHeure`/`formatJourRelatif`/`formatDepuis` ajoutés à `lib/format.ts`.

**Navette — affichage à la carte + refonte des indicateurs (11/08/2026,
demande explicite « affichage conditionnel, la possibilité de masquer une
section et afficher ce que je veux »)** :
- **Le tableau navette se compose** : 3 menus « Affichage » (nouveau
  `components/ui/SelecteurAffichage.tsx`, menu à cases à cocher + vues
  préréglées, distinct de `FiltresTableau` qui filtre les *lignes*) pour
  choisir les colonnes d'identification, les cycles budgétaires (8) et les
  postes (Total/CONSO/SERV/LOG/PERS/AUTRES). Décocher tous les postes masque
  entièrement le bloc budgétaire. **Défaut changé : `Total` seul**, soit 8
  colonnes de chiffres au lieu de 48 — le détail poste par poste d'une ligne
  est déjà affiché en entier par `NavetteLigneDetailModal`, à un clic. La
  colonne Libellé est verrouillée (une ligne sans libellé n'est plus
  identifiable) et « Chargé d'affaires » disparaît du menu pour qui n'a pas
  le droit de la voir, pas seulement du tableau.
- **Tableau piloté par des définitions de colonnes** (`ColonneNavette` dans
  la page + `components/navette/affichageNavette.ts`) au lieu du mur de
  `<th>` doublé d'un mur de `<td>` : les `colSpan`/`rowSpan` de l'en-tête à
  deux étages, du pied « Total ICP » et de la ligne « aucun résultat » se
  déduisent des colonnes visibles. Au passage, `sommeCycles(filtered)` était
  appelée **dans chaque cellule** du pied (8 agrégations complètes par
  rendu) — hissée dans un `useMemo`.
- **Sections masquables** : bandeau d'indicateurs, pilotage de la cale, taux
  de change, arbitrages en attente, RFS récurrentes, projets candidats BU.
- **Présentation refondue** (`components/navette/IndicateursNavette.tsx`) :
  les chiffres de pilotage étaient en petit texte gris au bout de la barre
  de filtres (CP total, cale) et en liste libellé/valeur. Ils deviennent un
  bandeau de 4 tuiles (CP total filtré, cale, arbitrages réalisés avec barre
  d'absorption, arbitrages en attente) + une carte « Pilotage de la cale »
  avec barre de progression et montants éditables en place par les admins.
  Le taux d'absorption vire à l'ambre à 60 % puis au rouge à 85 % : il
  mesure ce qui a été **pioché** dans la réserve, donc plus il monte moins
  il reste de marge.
- **Nouveau `lib/preferencesAffichage.ts`** : ces choix sont persistés en
  `localStorage` (`icp:affichage:*`), pas en Firestore — ce n'est pas de la
  donnée métier, ça ne vaut que pour le poste qui regarde, et une écriture
  Firestore par case cochée serait disproportionnée. Premier usage de
  `localStorage` dans l'app.

**Feuille de route — vue détail + refonte de l'écran (11/08/2026, dans la
foulée, demande explicite « une option avec un œil pour voir plus de détails
liés à une ligne », « modifier le libellé liaison en Création d'une fiche
projet », « rendre l'interface fluide et ergonomique »)** :
- **Modale de détail** (`components/feuilleDeRoute/ProjetFdrDetailModal.tsx`,
  ouverte par l'œil de la colonne projet ou par un clic sur la ligne) :
  planning, budget/engagement, références, commentaires, plus **3 écarts que
  le tableau ne pouvait pas montrer** parce qu'ils n'existent que rapprochés
  — engagement − estimation, taux de facturation, reste à facturer. Chacun
  reste vide si une de ses deux entrées manque (pas de 0 par défaut, une
  absence n'est pas un zéro).
- **Colonne « Liaison » renommée « Création d'une fiche projet »**, et le
  bouton « Lier / créer » devient « Créer une fiche projet ». Une ligne non
  liée affiche « Aucune fiche » pour un non-admin (au lieu de rien du tout).
- **Tableau piloté par `components/feuilleDeRoute/colonnes.tsx`** (22
  colonnes) + sélecteur de colonnes partagé (`SelecteurAffichage`, écrit le
  même jour pour la Navette) avec préréglages Essentiel / Planning / Budget /
  Tout, persistés en `localStorage`. Défaut inchangé : tout visible.
- **Ergonomie du grand tableau** : en-tête et colonne projet **figés**
  pendant le défilement (conteneur à hauteur bornée — `sticky` n'agit que
  dans un conteneur qui défile réellement — et `border-separate`, sans quoi
  les bordures des cellules figées disparaissent), colonne projet fusionnant
  œil + libellé + service leader, barres de progression pour avancement /
  réception scopes, **champ de recherche** (projet, OTP, PO, service leader)
  qui manquait, bandeau de 4 tuiles KPI (projets affichés, fiches
  rapprochées, engagement et facturé cumulés).
- `TuileKpi`/`BarreProgression` remontés de `components/navette/` vers
  `components/ui/TuileKpi.tsx` à leur second usage (palette isolée dans
  `ui/tonsKpi.ts` : un module qui exporte composants **et** constantes casse
  le rafraîchissement à chaud de Vite).
- Au passage : la résolution vers la fiche projet (`resoudreLiaison`) était
  refaite **deux fois par ligne** (une fois dans le filtre « mon périmètre »,
  une fois au rendu) — calculée une seule fois par ligne dans un `useMemo`,
  et partagée avec les totaux et la modale.

**Projets — PDC, filtres, santé en smileys, commentaires (11/08/2026,
demande explicite « la possibilité de rajouter un PDC au choix, fais des
filtres, la partie état mets des smileys à la place des textes, rajoute une
section commentaire »)** :
- **PDC affichés sur la fiche projet, en lecture seule** — première version
  écrite avec un circuit de saisie (`RevisionPdc` porté par la fiche),
  **retirée le jour même sur retour explicite de l'utilisateur : « on va
  juste afficher les PDC qui ont été révisés, pas faire le traitement »**.
  Réviser un budget est un acte de la navette (arbitrage proposé puis validé,
  avec sa fenêtre de révision et son éventuel prélèvement sur la cale) ; le
  dupliquer côté projet aurait fait exister la même révision à deux endroits
  avec deux valeurs possibles. Le projet lit donc les lignes navette dont
  `projetId` pointe vers lui, via `pdcRevises()` (`types/navette.ts`) :
  cycles PDC02/05/09/11 dont le montant total est non nul — **la règle
  qu'utilise déjà `revisionActuelle()`** pour décider quel cycle fait foi.
  Montants convertis en KUSD (une fiche peut porter plusieurs lignes de
  devises différentes) et cumulés. Aucun nouveau champ sur `Projet`.
- **Fil de commentaires par fiche** (`Projet.commentaires`, type
  `Commentaire` déjà existant) — distinct de `commentairesHypotheses`, qui ne
  commente que les scénarios. Horodatage **complet** (et non la date seule
  comme les commentaires d'hypothèses) : plusieurs messages par jour sont
  attendus, il faut pouvoir les ordonner. Suppression par l'auteur ou un
  admin.
- **Les deux vivent dans une même modale** (`components/projects/
  PdcCommentairesModal.tsx`) ouverte depuis la liste : on commente presque
  toujours une révision. Bloc PDC en lecture seule (BU / dernier PDC révisé /
  écart, puis la liste des cycles révisés avec un badge « Fait foi » sur le
  dernier), bloc commentaires éditable.
- **4 nouveaux filtres** : PDC (tous / révisés / jamais révisés / un cycle
  précis — lus depuis la navette), Work Program, présence de commentaires, en
  plus des existants.
- **Santé projet en smileys** (`ETAT_SMILEYS`) : 🙂 / 😐 / 🙁 sur pastille
  colorée dans le tableau, libellé complet conservé en `title`/`aria-label`
  (un emoji seul n'est pas accessible) et dans le menu du filtre.
- Au passage : pagination locale remplacée par `Pagination`/`usePagination`,
  avancement affiché en `BarreProgression`. **Non corrigé, signalé** : le
  `NewProjectModal` de cette page est inatteignable (rien ne passe
  `showNewForm` à `true`, aucun bouton « Nouveau projet ») — bug préexistant,
  hors périmètre de la demande.

**Fiche projet — onglet Suivi : formulaire à étapes par phase + phases
éditables (11/08/2026, demande explicite « fais un formulaire à plusieurs
étapes pour chaque phase et fais en sorte que les phases soient éditables,
un peu comme les formulaires du CRJ »)** :
- **`SuiviPhaseForm`** (`components/projects/`) reprend le parcours des
  formulaires CRJ / Tonnage / METAL (`useEtapes` + `EnteteEtapes`/
  `PiedEtapes`) : 4 étapes — Points bloquants, Points critiques, Contraintes,
  Décisions. L'onglet affichait jusqu'ici les 6 champs de **chaque** phase
  dépliés en permanence (24 zones de texte sur un projet à 4 phases) sans
  jamais dire lesquelles étaient renseignées.
- **Aucune étape n'est obligatoire** — une phase sans point bloquant est un
  cas normal, pas un formulaire incomplet ; c'est exactement ce que dit
  l'état « vu » face à « vide ». Le seul signal ambre (`partiel`) est **un
  point déclaré sans sa mitigation**, cohérent avec la raison d'être des deux
  mitigations séparées ; il avertit sans jamais bloquer l'enregistrement.
- **Phases éditables** (`PhasesSuiviSection`) : ajout, renommage,
  suppression, là où elles étaient figées à ce que le planning contenait à la
  création de la fiche. **Le renommage propage** : le nom de la phase est la
  seule clé de jointure entre `suiviPhases`, `Tache.phase` (lue par
  `PhaseEtatDiagram` et `avancementPlanning`) et `Action.origine` — renommer
  d'un seul côté détacherait la phase de son avancement. Les 3 vues du
  planning et les actions sont renommées dans la même écriture. Deux phases
  ne peuvent pas porter le même nom (les fusionner ferait disparaître un
  suivi), et **la suppression est refusée tant que des tâches de planning
  portent la phase** (elles deviendraient orphelines) — la carte affiche le
  nombre de tâches liées et l'explique dans l'infobulle.
- Chaque phase devient une carte compacte : badges d'état (RAS / point
  bloquant / critique / mitigation manquante / contraintes / décision),
  nombre de tâches et avancement réel repris du planning, bouton qui ouvre le
  formulaire. `estRenseigne()` (« ni vide ni RAS ») remonte dans
  `types/suivi.ts`, où `couleurPhase` en avait déjà une copie locale.

**Navette — parcours de validation à deux visas (11/08/2026, demande
explicite « après une révision on soumet cette révision à deux profils,
directeur technique et chef de département, pour validation ; rajouter cela
dans le parcours »)**. Deux points tranchés avec l'utilisateur avant
d'écrire : **enchaînement séquentiel** (chef de département puis directeur
technique) et **profil porté par un champ à part** du rôle applicatif.
- **`StatutArbitrage` passe de 3 à 4 valeurs** : `en_attente_chef` →
  `en_attente_dt` → `valide`, plus `refuse` atteignable des deux étapes.
  Le visa du chef **ne fait qu'avancer la révision** ; c'est celui du
  directeur technique qui applique la cascade de cycles et débite la cale —
  jusque-là rien n'est écrit sur la ligne. `'en_attente'` (l'ancien statut
  unique) n'existe plus côté front : `versArbitrageFront` relit les documents
  déjà en base comme `en_attente_chef`, **aucune migration à lancer**.
- **`ProfilValidationNavette` (`types/user.ts`) est un champ distinct de
  `UserRole`**, pas deux valeurs de plus : un chef de département est le plus
  souvent aussi chargé d'affaires, et un utilisateur n'a qu'un seul rôle —
  l'ajouter à `UserRole` l'aurait forcé à choisir. Ça évite aussi de toucher
  `lib/permissions.ts`, l'authentification et les règles de toute l'app pour
  un besoin d'un module (même raisonnement que les profils EPCM). Désignation
  par un admin depuis `AgentsPage` (menu sur chaque fiche +
  `definirProfilNavette` dans `AuthContext`).
- **Un admin peut suppléer les deux profils** — sans ça aucune révision ne
  passerait tant qu'aucun profil n'est désigné — **mais jamais deux fois la
  même révision** : `peutViser()` refuse le second visa à qui a posé le
  premier, sinon la double validation demandée ne vaudrait rien.
- **La section de validation n'est plus réservée à `peutVoirTout`**
  (admin/contrôleur) : un chef de département a le rôle `agent`, il ne
  voyait donc rien à viser. Nouveau `components/navette/
  ValidationsEnAttente.tsx` — file d'attente avec le fil des deux visas (qui,
  quand), ce que l'utilisateur peut viser lui-même en tête, et un **motif de
  refus** facultatif désormais tracé (`motifRefus`, affiché dans l'historique
  de la ligne). Un refus met fin au parcours : le demandeur propose une
  nouvelle révision, celle refusée restant à l'historique.
- `firestore.rules` : `arbitrages_navette` passe de `allow update: if
  estAdmin()` à `estAdmin() || viseNavette()`. **Modification locale, PAS
  ENCORE DÉPLOYÉE** (même réserve que toutes les règles de ce projet Firebase
  partagé). L'enchaînement des visas et l'unicité du viseur restent vérifiés
  côté application : les règles ne bornent que le droit d'écrire.

**Couche design transverse (11/08/2026, demande explicite « une couche design
sur l'ensemble de l'application afin d'avoir quelque chose d'ergonomique et
simple à utiliser »)**. Parti pris : agir sur la **coque et les primitives
partagées**, que toutes les pages traversent, plutôt que retoucher 20 pages
une à une — le langage visuel des pages était déjà homogène, c'est la
navigation et les états transverses qui manquaient.
- **Jetons dans `index.css`** (`--color-surface/canvas/line`, `--radius-card`,
  `--shadow-card/raised/overlay`) + utilitaire `.carte`. Les utilitaires
  Tailwind écrits en dur restent valides : on migre au fil des fichiers
  touchés, pas en réécrivant une centaine de blocs d'un coup. Ajouts de base :
  **anneau de `:focus-visible`** (la plupart des boutons n'en avaient aucun,
  la navigation clavier était intraçable), chiffres tabulaires sur `body`
  (colonnes de montants qui ne tressautent plus), barres de défilement fines
  (ces écrans en empilent deux par tableau).
- **`lib/navigation.ts`** : les 18 entrées du menu, jusque-là une liste plate
  dans `DashboardLayout`, sont regroupées en 5 familles métier (Pilotage /
  Terrain & production / Achats & contrats / Échanges / Administration) et
  portent une description + des mots-clés d'usage. Fichier séparé du layout
  parce que la palette de commandes le lit aussi (un module qui exporte
  composants **et** données casse le rafraîchissement à chaud, cf.
  `ui/tonsKpi.ts`).
- **Coque refondue** : barre latérale groupée, **repliable en rail d'icônes**
  (préférence `localStorage`, ~200 px rendus aux tableaux de 50 colonnes),
  onglet actif marqué par une barre d'accent (sur fond uni, une variation
  d'opacité seule se repère mal) ; barre supérieure qui porte titre **et**
  description du module.
- **Palette de commandes ⌘K / Ctrl+K** (`components/layout/PaletteCommandes.
  tsx`) : atteindre un module en le tapant, avec recherche sur les mots-clés
  d'usage (« budget » → Navette, « préfa » → Grand arrêt) que les libellés du
  menu ne contiennent pas. Filtrée par `ROLE_PERMISSIONS`, comme le menu.
- **`components/ui/Onglets.tsx`** remplace **8 copies** du même bloc de barre
  d'onglets (fiche projet, Tonnage, METAL, Procurement, Peinture, Grand
  arrêt, LUT, EPCM) — au passage : état actif teinté et pas seulement
  souligné, survol qui répond, `role="tablist"` qui manquait, et un
  **compteur** optionnel par onglet (utilisé par LUT, dont le nombre de
  lignes était bricolé dans le libellé).
- **`components/ui/EnTetePage.tsx`** : les 6 pages de module ouvraient sur un
  pavé de 3 à 10 lignes décrivant le classeur source, qui repoussait le
  contenu utile sous la ligne de flottaison **à chaque visite**. Replié
  derrière « À propos de ce module ».
- **`components/ui/Squelette.tsx`** : le `Suspense fallback` d'`App.tsx`
  valait `null` — changer de page vidait l'écran jusqu'à l'arrivée du bundle,
  l'app paraissait figée. `Chargement` (grilles Excel) s'aligne dessus.
- **`components/ui/EtatVide.tsx`** branché sur Navette / Projets / Feuille de
  route : le message distingue désormais « rien n'a encore été saisi » de
  « les filtres excluent tout », deux situations que le même « Aucun
  résultat » gris confondait.
- Au passage : `formatCellule` sortie de `GrilleFeuilleTable.tsx` vers
  `lib/formatCellule.ts` — **`npm run lint` passe maintenant sans aucune
  erreur** (celle-ci traînait avant cette session).

**Extractions CSV / PDF sur toutes les pages (11/08/2026, demande explicite
« fais un composant pour faire des extractions en csv, pdf pour toutes les
pages »)** :
- **`lib/export.ts` + `components/ui/BoutonExport.tsx`**. Les deux briques de
  sortie existaient déjà (`exportCsv.ts` écrit pour EPCM, `exportPdf.ts` pour
  le CRJ) mais chaque page devait construire ses en-têtes et ses lignes à la
  main — d'où **2 modules sur 15 qui exportaient quoi que ce soit**. Le
  composant prend en entrée **les définitions de colonnes déjà utilisées pour
  l'affichage** (`ColonneTableau`) : une colonne sert à afficher *et* à
  extraire, il n'y a pas de seconde liste à tenir à jour.
- **`texteDepuisNoeud()`** retrouve le texte d'une cellule qui est un
  ReactNode. Les composants qui portent leur libellé en prop (`Badge` →
  `label`) sont traités à part : ils n'ont pas d'enfants, un parcours naïf
  rendrait une cellule vide. Deux échappatoires sur `ColonneTableau` :
  `texte?` (valeur explicite, pour une barre de progression) et
  `exportable: false` (colonne d'actions).
- **Branché dans `TableauColonnes`** : les 17 tableaux des modules Tonnage,
  METAL, Procurement, Peinture et EPCM en héritent en passant un seul objet
  `exportation`. **Piège traité explicitement** : ces tableaux reçoivent en
  `lignes` leur *page courante* — chaque appel passe donc son ensemble
  filtré, sinon on exporterait 20 lignes sur 7 911 sans le dire.
- Branché aussi sur les tableaux écrits à la main : Navette, Feuille de
  route, Projets, Contrats, feuilles Excel reprises telles quelles
  (`GrilleFeuilleTable` → LUT + Grand arrêt) et journal Grand arrêt. Navette
  et Feuille de route **exportent exactement les colonnes affichées** :
  masquer des cycles ou des postes allège aussi le fichier produit.
- **Montants exportés en nombres bruts**, pas via `formatMontant` : un
  tableur doit pouvoir sommer la colonne, ce qu'une chaîne « 1 234 KUSD »
  interdirait. Le tiret cadratin (« pas de valeur » à l'écran) redevient une
  cellule vide, pour la même raison.
- **jsPDF est importé dynamiquement** dans le gestionnaire de clic : la
  dépendance pèse ~430 ko et le bouton est désormais présent presque partout
  — vérifié après build, elle reste dans son propre chunk et n'entre dans
  aucun bundle de page.
- Le CRJ garde ses exports PDF par onglet (écrits le 29/07/2026, un rapport
  par onglet et non un tableau plat) et EPCM son rapport multi-tableaux
  (§11). **`RapprochementPage` est volontairement laissée de côté** : c'est
  une file de travail dont les colonnes sont des actions (« Lier à la
  fiche »), pas un état à diffuser.

**HSE — liste alignée sur Projets, détail dérivé du CRJ (13/08/2026, demandes
explicites « applique le même design que la page project » puis « dans le
détail on va juste récupérer des infos provenant des HSE des CRJ, ici ça
serait juste une synthèse »)** :
- **Liste** : mêmes filtres que `ProjectsPage` (service client, état, chargé
  de projet) plus un filtre propre au module — **avec / sans saisie HSE**, le
  trou qu'on vient chercher en premier sur cet écran. Pagination partagée,
  `EtatVide`, `BoutonExport`, et l'état en smiley : `EtatSmiley` est remonté
  de `ProjectsPage` vers `components/projects/EtatSmiley.tsx` à son second
  usage. Les actions HSE ouvertes passent en badge ambre (un compteur à zéro
  s'efface, une action ouverte ressort).
- **Détail = `components/projects/SyntheseHseCrj.tsx`**, en lecture seule :
  les lignes du journal CRJ résolues vers la fiche (`clesJournalHebdo` +
  cascade `lib/liaison.ts` — le CRJ ne porte pas d'id de fiche projet)
  alimentent `deriveIndicateursHSE()`/`hseRecap()`, écrites le 22/07/2026 et
  **jusqu'ici jamais branchées à l'UI**. Le détail des lignes prises en
  compte est affiché sous les indicateurs : un compteur agrégé sans sa liste
  n'est pas vérifiable.
- **TRIR volontairement absent** : sa formule ajoute CHSE et MTC aux
  accidents, deux compteurs que `LigneJournalHebdo` ne porte pas. Le calculer
  sur les seuls FAT/LTI donnerait un TRIR systématiquement égal au LTIF —
  seuls LTIF et HPIF sont affichés, et l'écran le dit.
- **La saisie mensuelle (`HSETab`) est conservée sous la synthèse, repliée** —
  écart assumé avec « juste une synthèse » : c'est le **seul point d'entrée
  de l'application** pour la renseigner (l'onglet HSE de la fiche projet est
  en `readOnly`), et c'est elle qui alimente le bloc « HSE global —
  portefeuille » de cette même page. La synthèse CRJ ne la remplace pas
  encore : elle ne couvre ni les CHSE/MTC ni les audits.
- **Attendu à la première ouverture : une synthèse vide.** Mesuré au
  22/07/2026, les 20 fiches projet actuelles (jeu illustratif) ne portent pas
  les clés opérationnelles du terrain — ~0 ligne se résout. L'écran l'explique
  et renvoie vers Rapprochement plutôt que d'afficher des zéros.

**Audit du parcours Navette → … → terrain (13/08/2026, demande explicite
« un workflow de test en débutant à la navette afin d'épurer le workflow de
l'app », option retenue : tracer la chaîne dans le code, lister les ruptures,
corriger)**. Chaîne suivie : créer une ligne → réviser un PDC → visa chef →
visa DT (cascade + cale) → créer la fiche projet → feuille de route → fiche
projet (budget, planning) → journaux terrain (CRJ/HSE).
- **Corrigé — la Feuille de route restait figée après une révision.**
  `pdc02_2026_kusd` et `bu26ServKusd` étaient **copiés** sur la ligne FdR au
  moment du rattachement (`synchroniserDepuisNavette`) et plus jamais
  ensuite : une révision validée après coup laissait l'ancien montant, sans
  rien signaler. `calculerLigne` les relit désormais sur la ligne navette
  d'origine (lien direct par `ligneNavetteId`, pas de résolution floue) ; les
  84 lignes importées, sans ligne navette, gardent la valeur du classeur.
  Même principe que les résumés Procurement et les KPI du Grand arrêt :
  **un chiffre recopié devient faux à la première modification de sa source**.
- **Corrigé — collision d'identifiants en Feuille de route.** `addProjet` et
  `synchroniserDepuisNavette` calculaient `max(id) + 1` sur l'état local :
  deux rattachements enchaînés (ou deux utilisateurs) produisaient le même
  id, donc le **même document Firestore**, le second écrasant le premier sans
  erreur. Remplacé par un horodatage (`prochainIdFdr()`), sans collision
  possible avec les petits entiers des lignes importées.
- **Corrigé — code OTP et champ perdus à la création d'une fiche.**
  `LinkProjectModal` (le seul chemin réellement atteignable) construisait son
  `ProjetInput` sans `codeOTP` ni `champ`, alors que les deux sont connus de
  la ligne d'origine. Ils sont désormais préremplis et modifiables. Le
  `champ` compte : c'est lui qui départage deux projets de même nom lors du
  rattachement automatique (règle §2.3).
- **Retiré — point d'entrée mort dans `ProjectsPage`.** `NewProjectModal`
  (qui crée fiche **et** ligne navette d'un coup) y était monté sans qu'aucun
  bouton ne l'ouvre, depuis un moment. Le branchement mort est supprimé ; le
  composant reste sur disque, prêt si un jour on veut ce parcours inverse.
- **Vérifié sans défaut** (ne pas re-chercher) : la fenêtre de révision
  (`estArbitrageDisponible`) laisse bien PDC05 ouvert à cette date ; le visa
  DT met à jour la cale **et** l'état local (`appliquerArbitrageLocal`), pas
  seulement Firestore ; le résolveur reçoit bien les lignes navette et hérite
  de leur `codeOTP` (`useResolveur`).
- **Limite constatée puis traitée** (voir entrée suivante) : l'héritage du
  `codeOTP` ne sert qu'à la Feuille de route — `clesJournalHebdo`/`Tonnage`/
  `Peinture` ne portent pas d'OTP, ces journaux ne se rattachent que par nom,
  n° d'avis/OT ou site.

**La fiche projet devient la donnée de référence (13/08/2026, demande
explicite « rends-la obligatoire, après la donnée de référence est le projet
pour l'ensemble du projet »)** :
- **N° d'avis / DDM obligatoire à la création** (`LinkProjectModal`), et
  demandé **quel que soit le type de projet** — il n'apparaissait qu'en type
  « avis » et n'était pas requis. C'est la seule clé que portent les journaux
  terrain (`clesJournal*` exposent `avis`, jamais l'OTP) : sans elle, la
  fiche ne voit jamais remonter ses lignes de chantier. Le formulaire dit
  désormais à quoi sert ce numéro.
- **Nouveau bloc « Références du projet »** (`components/projects/
  ReferencesProjet.tsx`, onglet Présentation) : n° d'avis/DDM et n° d'OT en
  listes **ajoutables et supprimables**, plus code OTP et champ éditables.
  `avisNumeros`/`numerosOT` existaient dans le type et étaient lus par le
  résolveur, mais n'étaient **posés qu'à la création** (un seul avis, aucun
  OT) et **modifiables nulle part** : une affaire qui recevait un second avis
  ou un OT en cours de chantier ne pouvait plus le déclarer, ses lignes
  restaient orphelines. Nouvelles méthodes `ajouterReferenceProjet`,
  `retirerReferenceProjet`, `definirClesProjet` dans `ProjectsContext`.
- Le bloc **avertit quand la fiche n'a aucune clé terrain** (ni avis, ni OT) :
  c'est exactement le cas où les journaux ne remonteront pas, et il était
  jusqu'ici invisible. `avisNumero` (champ historique au singulier, lu par le
  résolveur au même titre que la liste) est affiché mais non supprimable — il
  vient du formulaire de création.

**Workflow fiche projet ↔ CRJ (13/08/2026, suite de l'audit : « continue
avec fiche projet → crj et les autres, le but c'est de mettre en place un
workflow »)** :
- **Le lien explicite était saisi puis jeté.** Le formulaire d'affaire du CRJ
  proposait déjà « Projet existant » et préremplissait les champs depuis la
  fiche (`selectionnerProjet`), mais **`projetId` n'était jamais écrit sur la
  ligne** : le rattachement retombait sur la cascade floue par nom/avis et se
  cassait dès qu'on renommait la fiche ou le libellé de l'affaire. Nouveau
  champ `LigneJournalHebdo.projetId` (`null` sur les lignes importées et sur
  celles saisies en mode « nouveau travail »), écrit dans le payload.
- **`resoudreProjetCrj()` (`lib/liaisonCles.ts`)** : lien explicite d'abord,
  cascade ensuite — même principe que `resoudreLiaison` côté Feuille de
  route. Utilisé par `SyntheseHseCrj` et le nouveau bloc ci-dessous.
- **La fiche projet voit enfin son CRJ** : `TravauxTerrainTab` gagne
  `JournalCrjLie`, pendant de `JournalTonnageLie`/`JournalPeintureLie` — date,
  service, statut, avancement, standby, plus le cumul HSE. Le CRJ en était
  exclu au motif qu'il n'avait que des données illustratives ; depuis qu'il a
  son circuit de saisie et un lien explicite, la raison ne tient plus.
  L'ancien bloc CRJ manuel (`projet.travauxTerrain.crj`) reste au-dessus :
  c'est une saisie libre interne à la fiche, sans rapport avec le module.
- `selectionnerProjet` reprend désormais `avisNumero ?? avisNumeros[0]` — la
  fiche porte une liste de références depuis ce jour, se limiter au champ
  historique laissait le n° d'avis vide sur les fiches récentes.
**Le même patron répliqué sur Tonnage, Peinture et METAL (13/08/2026, dans
la foulée)** — la fiche projet devient le pivot de tous les journaux :
- **`components/projects/SelecteurFicheProjet.tsx`** : un seul sélecteur pour
  les trois formulaires. Il rend `Projet` à l'appelant (et non juste un id)
  pour que chaque journal préremplisse ses propres champs. **Volontairement
  facultatif** : beaucoup de lignes ne concernent aucune fiche (travaux
  récurrents, prestations hors projet) — forcer un choix produirait des
  rattachements faux, pires que pas de rattachement.
- `projetId?: string | null` ajouté à `LigneJournalTonnage`,
  `LigneJournalPeinture` et `AffaireMetal`, avec
  `resoudreProjetTonnage/Peinture/Metal` sur le modèle de
  `resoudreProjetCrj` — trois helpers plutôt qu'un générique, chaque module
  ayant ses clés naturelles et son identifiant de module.
- **Nouveau type de champ `ficheProjet` dans `FormulaireEtapes`** (le moteur
  déclaratif utilisé par Peinture et les 5 formulaires Procurement) : son
  `select` ne prenait que des `string[]`, incapable de porter un couple
  id/libellé. `onChoix` laisse le formulaire préremplir ses champs depuis la
  fiche choisie.
- Les libellés du classeur (`projet`, `affaire`, `avis`) restent modifiables
  après le choix d'une fiche : ils portent souvent l'intitulé du chantier,
  pas le nom de la fiche.
- **`JournalTonnageLie`/`JournalPeintureLie` passent aux nouveaux résolveurs**
  (lien explicite prioritaire), et **METAL gagne son bloc lié**
  (`AffairesMetalLiees`) — il n'en avait aucun alors que c'est la source des
  pivots du KPI METAL. `chargerAffairesMetalPartage()` ajouté au cache des
  journaux terrain.
**Procurement rattaché à son tour (13/08/2026, « fais l'ensemble »)** :
- `projetId` sur les 5 types (`DaProcurement`, `AoProcurement`,
  `PoProcurement`, `ArticleSurveillance`, `LignePrefa`) et champ
  `ficheProjet` en tête des 5 formulaires — immédiat, le moteur déclaratif
  venait de recevoir ce type de champ.
- **Pas de cascade de secours ici, et c'est volontaire** :
  `resoudreProjetProcurement()` ne fait que lire `projetId`. Le module n'a
  aucune clé de liaison naturelle (il n'est pas dans `ModuleLiaison`, ses
  journaux ne portent ni n° d'avis ni OT) — deviner un projet depuis une
  désignation d'article produirait des faux rattachements.
- **`components/projects/ProcurementLie.tsx`** (onglet Procurement de la
  fiche) interroge **uniquement les collections de saisie** avec un `where
  projetId ==` côté Firestore. Ce n'est pas un raccourci : une ligne
  importée du classeur n'a jamais de `projetId`, lire les blobs (2 000+
  articles) donnerait exactement le même résultat pour beaucoup plus cher.
  C'est aussi le seul bloc lié qui filtre côté serveur — les autres
  réutilisent le cache mémoire des journaux terrain.

**Rattrapage de l'existant** : les lignes déjà en base n'ont pas de
`projetId`. Pour les 4 modules à clés naturelles (CRJ, tonnage, peinture,
METAL), `RapprochementPage` sert déjà à confirmer un rattachement à la main
(`confirmerLiaison` → registre `liaisons`, lu en priorité par le résolveur).
Procurement n'avait pas cette issue — d'où
**`components/liaison/AffectationProcurement.tsx`**, monté dans
`RapprochementPage` (admin) :
- Liste les lignes **sans projet** des 5 journaux (blob importé fusionné avec
  la collection de saisie via `combinerParCle`, comme la page du module),
  filtre par journal + recherche, sélection multiple, puis affectation d'une
  fiche en une fois.
- **Écrit dans la collection de saisie, doc ID = id de la ligne d'origine** —
  la convention déjà en place dans le module. Le blob importé n'est jamais
  modifié (il est en lecture seule) : c'est la copie qui prend le dessus à
  l'affichage.
- **Découpage en lots de 400** : `writeBatch` plafonne à 500 opérations, et
  ces journaux comptent plusieurs centaines de lignes.
- **Les journaux passent par les loaders de `data/procurementFollowUp.ts`**,
  pas par des clés de blob redéclarées : la surveillance est une *collection*
  et non un blob, et les intitulés ne sont pas devinables
  (`procurement__suivi-prefa`). Un seul endroit sait où vivent ces données.
- **Clé de sélection préfixée par le journal** (`da-123`) : les ids ne sont
  uniques qu'au sein d'un journal — sans préfixe, cocher une DA aurait coché
  la ligne de préfabrication de même id, et l'affectation aurait écrit dans
  les deux collections.

**Courbes en S — dans la fiche projet (13/08/2026, demande explicite
« reproduis fidèlement tout ce que tu vas trouver dans ce fichier afin de
pouvoir obtenir le même résultat », puis « mets-le dans le détail d'un projet,
en fait une courbe en S est liée à un projet »)** — les 6 feuilles de la
section courbes en S de `KPI_ICP_2905.xlsm` portées dans **l'onglet « Courbe
en S » de la fiche projet** (`components/projects/CourbeSTab.tsx`, 4
sous-onglets) + `components/courbeEnS/` + `lib/courbeEnSEngine.ts` (calculs
purs).
- **Pas de module autonome** : une première version en page de menu a été
  retirée le jour même sur ce retour. Une courbe en S décrit l'avancement
  d'UN projet — hors de sa fiche, elle demandait un sélecteur de projet qui
  refaisait à la main ce que la fiche fournit déjà.
- **Rattachement à la fiche** : `ActiviteCourbe.projetId` (lien explicite,
  écrit depuis la fiche) puis, à défaut, la cascade `lib/liaison.ts` —
  `'courbe-en-s'` ajouté à `ModuleLiaison`, `resoudreProjetCourbeEnS`
  (`lib/liaisonCles.ts`). La cascade ne peut ici que se rabattre sur le nom :
  le classeur ne porte ni n° d'avis ni OTP, juste une colonne « Projet ».
  D'où le sélecteur « Reprendre un projet du classeur » affiché tant que rien
  n'est rattaché — il pose le lien explicite en une fois sur les 3 feuilles
  (l'équivalent local de `AffectationProcurement`, mais à l'endroit où la
  question se pose). « Détacher » est réservé aux admins.
- **L'axe hebdomadaire reste celui de la feuille entière** (53 semaines
  depuis le `MIN(Baseline[Start])` de toutes les activités, pas seulement
  celles de la fiche) : le recalculer sur un projet décalerait les bornes de
  semaine et les pourcentages ne seraient plus ceux du fichier.
- **`lib/scurve.ts` et `components/projects/SCurveChart.tsx` supprimés** :
  l'ancien onglet dérivait une courbe des tâches du planning avec un
  avancement linéaire, en affirmant en commentaire reproduire
  Progress_Curve / Data courbe en S — c'était faux. Le planning d'une fiche
  ne porte pas de numéro de gabarit, il ne pouvait pas alimenter le vrai
  calcul.
- **L'onglet est chargé à la demande** (`lazy` dans `ProjectDetailPage`) : il
  embarque les 3 feuilles et les 5 gabarits (~120 ko), que les 9 autres
  onglets n'ont pas à traîner.
- **La formule, portée telle quelle** : l'avancement d'une activité à une date
  vaut 0 avant son début, 1 à partir de sa fin, et entre les deux
  `gabarit[ARRONDI((date − début) × 100 / durée)]` — le RECHERCHEH des
  colonnes hebdomadaires vers `'typical S curve'!$K$10:$DG$15`. L'avancement
  d'un projet est la moyenne pondérée par la durée des activités
  (`SOMMEPROD` de la ligne « % » de « Data courbe en S »). Les 5 gabarits
  (`data/courbeEnS/courbesTypes.ts`, 101 points chacun) sont repris tels
  quels : la feuille porte la consigne « ne pas toucher merci ».
- **Vérifié avant d'être écrit, puis re-vérifié en TypeScript** : les blocs de
  tableau croisé de « Data courbe en S » gardent en cache l'avancement calculé
  par le classeur pour chaque activité et chaque semaine. `avancementPlanifie`
  a été rejouée dessus — **3 612 cellules, 18 blocs, 0 divergence**, et les
  totaux pondérés retrouvent à la décimale près les valeurs de Progress_Curve
  (0,0403802817 / 0,3369211268 / 0,7778732394…).
- **Trois blocs de pivot du classeur ne concordent pas — et c'est le classeur
  qui a tort** : « Surfer Landing », « stand pipe » et « plancher » affichent
  dans leur ligne « % » les valeurs d'un autre projet, l'un d'eux pondérant
  même par la pondération globale au lieu de la pondération par phase. Leurs
  lignes de détail, elles, sont exactes. Ce sont des caches jamais actualisés
  — le classeur le signale lui-même en tête de Progress_Curve (« Actualiser
  les données ------> »). Rien n'est repris figé ici, donc le module n'hérite
  pas de cette dérive.
- **Les 3 × 59 activités sont livrées avec le module**
  (`data/courbeEnS/activites.ts`) et non importées dans Firestore : à ce
  volume (contre 7 911 lignes pour le tonnage) le fetch ne se justifie pas, et
  l'onglet est déjà chargé à la demande. Les saisies vivent dans
  `courbe_en_s_activites` (doc ID = l'id de la ligne, `{vue}-{ordre}` pour une
  ligne du classeur), fusionnées par `combinerParCle`. Règle
  `firestore.rules` ajoutée localement, **PAS ENCORE DÉPLOYÉE**.
- **Aucune colonne calculée n'est stockée** : durée, pondération, pondération
  par phase, BU/Phase et les 53 colonnes hebdomadaires sont recalculées à
  l'affichage — les figer les rendrait fausses au premier changement de date
  (même raison que les résumés Procurement et les KPI du Grand arrêt).
- **Budget laissé vide**, volontairement : la colonne est un XLOOKUP vers une
  table « Coût » qui n'a pas survécu au fichier (toutes ses cellules valent
  #ERROR!). Elle reste saisissable, aucun montant n'a été inventé. Même
  raison pour une activité sans gabarit : elle rend 0, comme le #N/A du
  classeur, plutôt qu'une progression linéaire de substitution.
- **Seule différence assumée avec le classeur** : une semaine dont aucune
  activité n'a de relevé donne `null` (courbe Réalisé interrompue) là où le
  classeur affiche 0 — ses cellules vides valent 0 dans un SOMMEPROD, ce qui
  fait retomber sa courbe à zéro après le dernier pointage. Les semaines
  renseignées donnent le même nombre qu'Excel.

**Consolidation (13-14/08/2026, « du plus simple au complexe » — les paliers
demandés après l'état des lieux)** :
- **Les échecs Firestore ne sont plus silencieux** (`lib/incidents.ts` +
  `components/layout/BandeauIncidents.tsx`). Un magasin de module, pas un
  contexte : les échecs se produisent dans `data/*.ts` et dans les providers,
  hors de tout composant. Branché sur **20 chargements et 3 écritures** — les
  5 contextes, les 6 lectures de l'écran Rapprochement, et les 10 garde-fous
  `.catch(() => null)` des pages de module qui, écrits pour éviter qu'une
  collection inaccessible bloque la page, la laissaient prétendre que la
  collection était vide. Le repli est inchangé ; c'est le silence qui a
  disparu. Un libellé par module (le bandeau dédoublonne), et deux messages
  distincts : une lecture ratée rend l'écran incomplet, une écriture ratée
  veut dire que la saisie n'est pas enregistrée.
- **Tests : Vitest, 86 tests, 8 fichiers** (`npm test`). Les ~10 Mo de JSON de
  `src/data/*/` que plus aucun code n'importait — les extractions des
  classeurs — deviennent le corpus : ils portent à la fois les colonnes
  saisies et celles que le tableur calculait. **Ne pas les supprimer.**
  Couverture : courbe en S (3 612 cellules, fixture extraite du classeur dans
  `__tests__/fixtures/`), Grand arrêt (4 055 cellules), peinture (10 colonnes
  sur 2 124 lignes), Procurement (résumés DA et préfa), Tonnage (4 colonnes
  sur 3 384 pointages), plus le filet d'incidents, les seuils des pièces
  jointes et l'avancement pondéré.
  - **Ce que les tests ont trouvé.** Sur la peinture, 599 cellules divergent :
    **598 sont des trous du classeur** (formule non recopiée jusqu'en bas) que
    le moteur comble, et **une seule** va dans l'autre sens (ligne 691, une
    durée de 1 saisie en dur sans dates — le moteur a raison de ne rien en
    déduire). L'invariant testé est donc dissymétrique et explicite : identité
    partout où le classeur a calculé, comptes de trous comblés figés colonne
    par colonne. Et sur les pièces jointes, le test a démenti le module que
    je venais d'écrire (limite annoncée à 700 Ko, refusée à l'écriture) —
    corrigée à 650 Ko, les seuils sont désormais importés du module par le
    test au lieu d'y être recopiés.
- **Pièces jointes en base 64 dans Firestore** (`lib/piecesJointes.ts`,
  `components/ui/PieceJointeApercu.tsx`, collection
  `pieces_jointes_contenu`) — Firebase Storage exige le plan payant, non
  souscrit : hypothèses, cahier des charges et photos CRJ étaient écrits mais
  inertes depuis le 27/07/2026. `lib/storageUpload.ts`, `storage.rules` et le
  bloc `storage` de `firebase.json` sont supprimés (le déploiement ne tente
  plus une ressource indisponible), `firebase.ts` n'initialise plus Storage.
  - **Le contenu vit à part des métadonnées** : sans ça, du base 64 dans
    `projets/{id}` ferait exploser la fiche, et lister les photos d'un
    chantier les téléchargerait toutes. Lu à la demande, mis en cache.
  - **Compression par paliers** avant encodage (1600 px / 0,75, puis on
    descend jusqu'à passer sous 600 000 caractères) ; une image déjà légère
    n'est pas ré-encodée. **Les fichiers non compressibles sont plafonnés à
    650 Ko** contre 10 Mo avec Storage — contrepartie assumée, dite dans le
    message d'erreur, qui touche surtout le cahier des charges.
- **L'avancement d'un projet est désormais pondéré par la durée**
  (`avancementPlanning`, types/planning.ts) — la règle du classeur, celle
  qu'appliquait déjà la courbe en S. C'était une moyenne simple : une tâche
  d'un jour y pesait autant qu'une de 65 jours, et la fiche affichait un
  avancement différent de sa propre courbe. Sans durée exploitable, une tâche
  compte pour 1 jour ; sans aucune durée, on retombe sur la moyenne simple.
- **Le planning de la fiche alimente la courbe en S**
  (`lib/courbeEnSDepuisPlanning.ts`) : les deux décrivaient le même objet —
  `Planning` a les 3 mêmes vues et `Tache` porte les colonnes des feuilles du
  classeur — si bien que chaque fiche recevait 7 tâches à sa création pendant
  que sa courbe démarrait vide. Les activités reprises du classeur **priment**
  quand elles existent (sinon le rattachement n'aurait aucun effet) ; sinon la
  courbe se construit sur le planning. La vue Réalisé y reçoit **un relevé
  unique daté du jour** : le planning connaît l'avancement d'aujourd'hui, pas
  son historique — pas de courbe reconstituée à rebours.
  - Seule donnée que le planning ne portait pas : le **gabarit**. Nouveau
    `GabaritsPlanning` (sous-onglet « Gabarits ») + `definirGabaritTache` /
    `definirGabaritToutesTaches` dans `ProjectsContext`, propagés aux 3 vues
    comme le nom et la phase — la baseline, le forecast et le réalisé
    décrivent le même travail.
  - **Sans gabarit, la courbe n'est pas plate : c'est un escalier.** La
    formule du classeur teste les dates avant d'aller chercher le gabarit, une
    tâche terminée vaut donc 1 quoi qu'il arrive. Le texte de l'interface
    affirmait le contraire à la première écriture — démenti par le test,
    corrigé des deux côtés.
- Corrigé au passage : `Tache.typicalSCurve` était typé `'Y' | 'N'`, les deux
  colonnes voisines du classeur ayant été inverties à l'import (« Typical
  S-curve » porte le numéro 1-5, « Tests » le Y/N). Aucune donnée en base ne
  portait l'un ni l'autre — rien à migrer. `CourbePoint`/`courbeHebdo`,
  structure qui attendait l'onglet Courbe en S sans jamais être alimentée,
  supprimée. Et le module Courbes en S apparaît enfin dans l'écran
  Rapprochement (feuille Baseline seule, activités déjà rattachées écartées).

**Courbe en S — allure vérifiée contre le classeur (14/08/2026, demande
explicite « les allures doivent rester comme dans le fichier Excel source, le
procédé doit être le même »)** : le pipeline complet de l'onglet (planning →
activités → axe → `courbeProgression` → `fenetreProjet` → SVG) a été rejoué,
sur un planning de fiche et sur les 9 projets du classeur, puis confronté à
`KPI_ICP_2905 (1).xlsm` lui-même. **Ce que le classeur fait réellement**, relevé
dans le fichier et non supposé : chacune des 3 feuilles a son propre axe
(`=+MIN(<table>[Start])` puis `+7`, 53 colonnes) ; un relevé Réalisé se saisit
**dans la cellule de sa colonne hebdomadaire** ; `Progress_Curve` rapproche les
3 feuilles en **cherchant la période par sa date** (`XLOOKUP` sur la ligne des
dates du bloc, une période absente rendant #N/A donc un trou) ; la série tracée
est le bloc de tableau croisé du projet (13 à 30 périodes selon le projet),
**plateau à 100 % compris**, en `lineChart` sans marqueur (`symbol val="none"`)
et sans lissage (`smooth val="0"`).
- **Corrigé — le relevé Réalisé d'une fiche tombait hors de l'axe.**
  `activitesDepuisPlanning` datait son relevé unique du **jour même**, alors que
  `avancementReleve` lit `realiseHebdo` par date exacte : 6 fois sur 7 la clé
  tombait entre deux colonnes et **aucune courbe Réalisé n'était tracée** —
  tuiles « Réalisé » et « Écart au planning » à « — », colonne Delta vide, alors
  que le planning portait bien l'avancement. Le relevé est désormais porté par
  la semaine d'axe qui contient aujourd'hui (`semaineDeLAxe`), ce que fait la
  saisie manuelle du classeur. Avant l'origine de l'axe, rien n'est daté : la
  feuille n'a pas de colonne où le porter.
- **Corrigé — `fenetreProjet` coupait à l'achèvement, le classeur non.** Sa
  version précédente s'arrêtait à la première période à 100 %, au motif que le
  classeur ne tracerait que jusque-là. C'est faux : sur « Remplacement tronçon
  de ligne riser 6" », `Progress_Curve!$F$8:$F$23` trace 16 périodes dont **les
  10 dernières valent 1**. La coupure est retirée, seule l'amorce reste rognée
  (le bloc du classeur ouvre lui aussi sur une période à 0). Le plateau est
  l'allure du classeur, pas un défaut d'affichage.
- **Deux constats laissés tels quels, volontairement** : l'axe reste figé à
  **53 semaines** même pour un projet de plus d'un an (dont la courbe plafonne
  alors avant 100 %) — c'est la largeur des tables du classeur, la changer
  serait s'en écarter ; et un relevé Réalisé **isolé n'est pas tracé**
  (`troncons` n'émet un chemin qu'à partir de 2 points, et rien ne dessine de
  marqueur) — le classeur ne tranche pas ce cas, ses 13 graphiques
  `Progress_Curve` ne portent **que la série Baseline**. Ajouter un marqueur
  serait une invention ; la valeur reste lisible dans le tableau et la tuile.
- À noter en lisant le fichier source : ses colonnes Réalisé, Forecast, Delta
  et « Monthly effort » sont **#ERROR! dans le classeur livré** (les
  `TRANSPOSE`/`XLOOKUP`/`LOOKUP` ont été cassés par un aller-retour Google
  Sheets, visible aux `ARRAY_CONSTRAIN(ARRAYFORMULA(...))` de la colonne « % »).
  Seule la Baseline y a encore des valeurs — l'app calcule les 3 séries, elle
  est donc plus complète que sa source, à partir des mêmes formules.
- Vérification verrouillée par 6 tests de plus (92 au total) : la montée
  retrouve les valeurs du classeur à la décimale (0,0404 · 0,3369 · 0,7779 ·
  0,8184 · 0,9437), le plateau reste dans la fenêtre, et le relevé tombe sur
  l'axe quel que soit le jour de la semaine.

**Devises — référentiel, écran de gestion, application à tous les champs de
montant (18/08/2026, demande explicite « je veux faire une interface pour la
gestion des devises et les appliquer partout où il y a des inputs de
montants »)** :
- **Le code de devise redevient une donnée** : `Devise` était une union figée
  de trois codes (`'USD' | 'EUR' | 'XAF'`, types/project.ts) recopiée en dur
  dans trois modales, et les taux vivaient dans un coin des paramètres navette
  (`parametres_navette/globaux.tauxChange`, deux valeurs). Nouveau
  `types/devise.ts` (modèle + helpers purs) et collection Firestore `devises`
  (un document par code ISO, comme `champs`/`services`). `Devise` vaut
  désormais `CodeDevise = string` — l'élargissement n'a rien cassé côté
  compilation, `TauxChange` restant un `Record<string, number>`.
- **Le pivot est porté par un champ `pivot` d'un des documents** plutôt que
  par un document de configuration à part : le référentiel garde une seule
  forme. En changer recalcule tous les taux dans la nouvelle référence, en un
  seul `writeBatch` — un taux est une valeur relative, le laisser tel quel
  après le changement lui ferait dire silencieusement autre chose.
- **Un taux absent est `null`, jamais 0 ni 1** : `convertir()` rend `null` et
  l'écran le dit. Le franc CFA était livré **sans taux** — la navette lui
  appliquait une parité neutre (1 XAF = 1 USD, faux d'un facteur ~600) faute
  de valeur connue ; reprendre ce 1 dans le référentiel en aurait fait un taux
  d'apparence officielle. **Corrigé le 19/08/2026, taux fournis par
  l'utilisateur** (voir ci-dessous) : plus aucune devise par défaut n'est sans
  taux.
- **`components/ui/ChampMontant.tsx`, le point d'application** — 26 champs
  dans 13 fichiers, plus un type de champ `montant` dans le moteur déclaratif
  `FormulaireEtapes` (4 usages). Principe : **chaque module continue
  d'enregistrer dans l'unité de son classeur source** (KUSD navette/feuille de
  route, XAF journaux terrain et contrats, devise de la fiche/du contrat
  ailleurs — table `EMPLOIS_DEVISE` dans `lib/unitesMontant.ts`, affichée en
  bas de l'écran Devises). Le champ ajoute ce qui manquait : saisir dans une
  autre devise, conversion au taux du référentiel, et affichage permanent de
  ce qui sera réellement enregistré (« Enregistré : 1 481 KUSD · 1 EUR =
  1,2 USD »). Changer l'unité de stockage aurait voulu dire relire tout
  l'historique importé pour savoir dans quoi il était compté — pas fait, pas
  souhaitable.
  - Deux modes : unité de stockage fixe (le sélecteur choisit la devise de
    **frappe**), ou entité qui porte sa devise (`onDeviseChange` fourni —
    ligne navette, fiche projet, contrat EPCM : le sélecteur **requalifie** la
    donnée, sans convertir le montant).
  - `lib/saisie.ts` gagne `montantDepuisTexte`/`texteDepuisMontant` : la
    plupart des modales gardent leurs champs en `string`, le champ parle en
    nombres parce qu'il convertit.
- **Préférence de poste « saisir mes montants en … »** (localStorage, comme
  les colonnes visibles) : les champs proposent d'emblée cette devise quand
  elle est convertible vers l'unité du module. L'avertissement « taux non
  renseigné » n'apparaît que dans ce cas — sinon chaque champ en francs CFA
  porterait une alerte permanente dont son utilisateur n'a que faire.
- **Écran `pages/DevisesPage.tsx`** (menu Administration, lecture ouverte à
  tous, écriture admin) : bandeau de 4 tuiles, table du référentiel
  (taux direct **et** inverse, décimales, état, traçabilité), ajout/modif
  (`DeviseForm`), désignation du pivot, suppression, convertisseur de
  vérification (CDS §5), et le tableau « où les devises s'appliquent ».
- **La carte « Taux de change » de la navette devient une lecture** du
  référentiel avec un lien vers l'écran ; `definirTauxChange` disparaît de
  `NavetteContext`, dont le `tauxChange` est désormais **dérivé** des devises.
  **Reprise sans migration** : tant que la collection `devises` est vide, le
  provider sert les valeurs par défaut **enrichies du `tauxChange` historique**
  lu dans `parametres_navette/globaux`, et « Enregistrer ce référentiel »
  écrit ce que l'admin a sous les yeux.
- **Trois affichages faux corrigés au passage** : les colonnes budgétaires du
  tableau navette, celles de `NavetteLigneDetailModal` et les tuiles/cale de
  `IndicateursNavette` affichaient toutes « KUSD » en dur — faux pour une
  ligne libellée en euros, et faux pour les agrégats si le pivot change. Elles
  prennent la devise de la ligne, ou celle du pivot pour les totaux.
- **Courbe en S** : le champ « Budget » reçoit la devise de la fiche projet
  (threadée depuis `CourbeSTab`). Le classeur ne dit rien de son unité — sa
  colonne Budget est un XLOOKUP cassé, toutes cellules en #ERROR! —, donc
  aucune valeur n'en vient : tout y sera saisi depuis l'app.
- **19 tests de plus** (`lib/__tests__/devises.test.ts`, 111 au total) :
  aller-retour de conversion, refus de convertir sans taux (ni 0 ni 1),
  combinaison devise × échelle (1 200 EUR dans une colonne KUSD → 1,44 KUSD),
  décimales par devise, contrôles de saisie.
- Règle `firestore.rules` ajoutée (`devises` : lecture connecté, écriture
  admin), **PAS ENCORE DÉPLOYÉE** — même réserve que toutes les modifications
  de règles sur le projet Firebase partagé `driver-6ae2b`. Sans déploiement,
  la lecture échoue et le référentiel retombe sur ses valeurs par défaut, en
  le disant (bandeau + incident).

**Fiche projet — onglet Suivi : phases avec activités, point bloquant unique,
scope rattaché à une phase (18/08/2026, demande explicite)** :
- **Une phase se crée avec ses activités** (`PhaseSaisieForm`) : nom de la
  phase + liste de lignes (activité, début, fin). Une activité est une
  **tâche de planning** — c'est elle qui donne à la phase son avancement, sa
  place dans le diagramme d'état et sa courbe en S ; une phase sans activité
  n'existait nulle part ailleurs que dans la liste des phases, et il fallait
  aller la retaper tâche par tâche dans l'onglet Planning. `ajouterPhaseSuivi`
  prend désormais les activités et écrit **tout dans la même mise à jour** de
  la fiche (une boucle sur `addTacheBaseline` aurait produit une sauvegarde
  Firestore complète par activité). Le même formulaire sert à ajouter des
  activités à une phase existante (bouton « Activités » de sa carte), qui les
  liste maintenant avec leurs dates.
- **Un point bloquant unique par phase, et rien d'autre dans la modale de
  suivi.** Deux retours successifs le même jour, dans cet ordre : d'abord
  « un seul point bloquant » (il est alors remonté au niveau de la fiche,
  `Projet.pointBloquant` + une section en tête de l'onglet), puis « le point
  bloquant sera affiché dans la modale de renseignement du suivi, le reste des
  sections sera remplacé » — il redescend à la phase, et les 3 autres étapes
  (points critiques, contraintes, décisions) **disparaissent** de
  `SuiviPhaseForm`, qui n'a donc plus d'étapes du tout (une section unique n'a
  pas de parcours : la flèche de suivi est retirée). L'état d'une phase se lit
  désormais à une seule question : est-elle bloquée, et par quoi.
  - **Aucune migration de données, une lecture qui rattrape trois modèles** :
    `pointBloquantDePhase()` rend le point de la phase, à défaut celui de la
    fiche s'il désignait cette phase (modèle intermédiaire), à défaut l'ancien
    texte libre `pointsBloquants` de la phase. Les champs historiques
    (`pointsCritiques`, `contraintes`, `decisionsAttente`…) deviennent
    facultatifs, ne sont plus ni saisis ni affichés, et ne sont **jamais
    effacés** — `updateSuiviPhase` réécrit la phase entière. Un point repris
    est signalé (« À confirmer ») au lieu de passer pour une saisie récente.
  - **« Jamais saisi » (`undefined`) et « déclaré levé » (`null`) sont
    distincts** : sans cette distinction, lever un blocage aurait fait
    réapparaître l'ancien au rendu suivant.
  - `couleurPhase(avancement, bloquee)` : le rouge du diagramme d'état ne vient
    plus que de ce point. Le faire encore dépendre des points critiques
    figerait dans un indicateur des valeurs que plus personne ne peut mettre à
    jour. La carte de phase affiche le blocage et sa mitigation en clair.
  - `createDefaultSuiviPhases` ne pose plus de `RAS` d'avance : une phase
    jamais renseignée et une phase sans blocage ne sont plus le même état.
- **Une modification de scope est rattachée à une phase**
  (`ModificationScope.phase`) : un avenant de délai ou de coût touche une
  phase précise, et c'est à elle qu'il faut pouvoir imputer les jours et le
  montant. La liste est regroupée par phase avec ses sous-totaux, la carte de
  phase en affiche le nombre. Les modifications enregistrées avant ce
  changement restent **sans phase** (groupe « Sans phase rattachée ») — rien
  ne permet de la deviner après coup. `addModificationScope` passe d'une liste
  de 4 arguments positionnels à un `ModificationScopeInput`.
- **12 tests de plus** (`lib/__tests__/suiviPhases.test.ts`, 123 au total) :
  reprise des deux modèles précédents (point de fiche rendu à la phase qu'il
  désignait, ancien texte libre), non-régression du « levé » face à cette
  reprise, et couleur de phase.

**Feuille « typical S curve » reproduite dans Paramètres (18/08/2026, demande
explicite « regarde la feuille typical S curve, on produit ces données dans la
partie paramétrages tel que c'est présenté »)** — `pages/ParametresPage.tsx`
passe de la seule fiche du compte à deux onglets (Mon compte / Courbes types),
et `components/courbeEnS/CourbesTypesSheet.tsx` reproduit la feuille du
classeur `KPI_ICP_2905 (1).xlsm` telle qu'elle se présente : titre « COURBES
TYPES (ne pas toucher merci) », les deux blocs **AVANCEMENT MOIS** (lignes 5-9,
colonne E = lettre a→e, colonne J = TOTAL) et **AVANCEMENT CUMUL** (lignes
11-15, E et J = n° de courbe), leurs **101 colonnes d'unités de temps** (0 à
100, pas une sur cinq), les fonds d'en-tête du classeur (bleu pour les UT,
orange pour les libellés), les pourcentages à 2 décimales de son format
`0.00%`, puis ses **7 graphiques** : la courbe des 5 cumuls (axe 0-100 %,
`smooth val="0"` et `symbol val="none"` — segments droits, aucun marqueur) et
les 6 histogrammes de l'avancement mensuel (colonnes groupées, `gapWidth`
150, axe borné à 3 %), dans la palette de séries du fichier (4472C4 / ED7D31 /
A5A5A5 / FFC000 / 5B9BD5).
- **Vérifié avant d'être écrit** : les 1 010 valeurs de
  `data/courbeEnS/courbesTypes.ts` ont été rejouées cellule par cellule contre
  la feuille — **0 divergence** (à l'arrondi d'extraction près de la courbe
  Type 3, ≤ 4,3·10⁻¹⁰, cf. le test). La colonne TOTAL n'est **pas** reprise du
  fichier mais recalculée (somme de la ligne mensuelle) : elle retrouve J5:J9 à
  la décimale, et un total figé cesserait d'être vrai si la donnée bougeait —
  même raison que les résumés Procurement et les KPI du Grand arrêt.
- **La ligne 2 du classeur n'est pas reproduite** : K2:DG2 porte une série sans
  intitulé, égale aux écarts successifs de la ligne 5 — un reste de
  construction de la courbe Type 1, pas une donnée de la feuille.
- `CourbesTypesTab` (l'ancien rendu de l'onglet Courbe en S d'une fiche
  projet : palette maison, une colonne sur cinq, bascule cumul/mensuel) est
  **supprimé** au profit de ce composant, monté aux deux endroits — deux
  rendus de la même feuille auraient divergé, et c'est celui du classeur qui
  fait foi.
- **6 tests de plus** (`lib/__tests__/courbesTypes.test.ts`, 129 au total) :
  intitulés et ordre des 5 courbes, 101 points par série, TOTAL recalculé
  retrouvant la colonne J, dernier point cumulé égal à ce total, cumul
  croissant depuis 0, et mensuel sous le plafond de 3 % des histogrammes.

**Planning — courbe type choisie sur la tâche, et onglet du tracé (18/08/2026,
demande explicite « dans le planning on va choisir le type de courbe Typical
S-curve en fonction de ce qui est dans le paramétrage, maintenant prévois un
onglet pour afficher le tracé de la courbe »)** :
- **La colonne « Typical S-curve » du tableau devient un choix**, alimenté par
  les 5 courbes types du paramétrage (`COURBES_TYPES`, la feuille du classeur
  affichée dans Paramètres). Elle était en lecture seule depuis l'import du
  planning, et le gabarit ne se choisissait que dans l'onglet Courbe en S —
  loin des dates qu'il accompagne. Écriture par `definirGabaritTache`, qui
  pose déjà la valeur **sur les 3 vues** : le gabarit est une propriété de la
  tâche, pas de la vue, donc modifiable depuis n'importe laquelle. Une tâche
  sans gabarit garde une cellule ambre, et le pied du tableau compte celles
  qui restent.
- **Nouvel onglet « Courbe » dans le Planning** (`PlanningView` passe à deux
  onglets, Tâches / Courbe) : le tracé que ce planning produit, via
  `activitesDepuisPlanning` + `axeSemaines` + **le `ProgressionTab` de la
  courbe en S**, réutilisé tel quel. Refaire un graphique ici aurait donné
  deux courbes pour un même projet, avec le risque qu'elles divergent — c'est
  le même calcul, sur les mêmes activités dérivées du planning. L'onglet
  rappelle que la vue Réalisé n'y porte qu'un relevé, daté de la semaine en
  cours, et avertit quand aucune tâche n'a de courbe type (le tracé est alors
  un escalier, pas une courbe en S).
- `PlanningView` prend maintenant `projet` au lieu du couple
  `projetId`/`planning` : le tracé a besoin du nom de la fiche (titre des
  extractions) et de son id.
- **`GabaritsPlanning` (onglet Courbe en S) est conservé** : les deux écrans
  écrivent par le même `definirGabaritTache`, et ce qui lui reste propre est
  l'application en une fois à toutes les tâches et le décompte des manquantes.
- Poids : `ProgressionTab` devient un chunk partagé (15,8 ko, 6,4 ko gzip)
  entre la fiche projet et l'onglet Courbe en S, au lieu d'être enfermé dans
  le second.

**Fiche projet — la section « Courbe en S » se réduit à la courbe retenue et
son allure (18/08/2026, demande explicite « dans la section courbe en S on va
afficher juste la courbe choisie et son allure uniquement »)** — dernier
mouvement d'une réorganisation en trois temps le même jour : le **tracé du
projet** est passé dans Planning › Courbe, les **5 courbes types** dans
Paramètres, et le **choix du gabarit** dans la colonne « Typical S-curve » du
tableau du planning. L'onglet ne garde donc que la lecture : quelle courbe
type ce projet a retenue et à quoi elle ressemble — **un seul graphique**
(`AllureCourbes`) portant toutes les allures retenues, tracées comme dans le
classeur (sans lissage ni marqueur, axe 0-100 %), et **une légende** sous lui
qui dit quel trait est quelle courbe, combien de tâches l'ont retenue, et ce
qu'elle vaut au quart, à la moitié et aux trois quarts du temps. Une première
version faisait une carte et un graphique par courbe : retour explicite de
l'utilisateur, « une seule courbe avec les allures dessus et une légende, pas
plusieurs graphiques » — un projet dont les tâches ne suivent pas toutes le
même modèle se lit alors d'un coup d'œil. Le décompte des tâches sans courbe
type reste affiché, avec ce qu'il implique (saut de 0 à 100 % le jour de la
fin).
- `useCourbeEnSProjet` reste la source : le gabarit retenu se lit de la même
  façon que les activités viennent du planning de la fiche ou du classeur
  KPI_ICP rattaché.
- `lib/courbesTypes.ts` (nouveau) porte la palette du classeur et l'accès aux
  5 courbes — la palette était recopiée dans `CourbesTypesSheet`, et un module
  qui exporte composants **et** constantes casse le rafraîchissement à chaud
  de Vite (cf. `components/ui/tonsKpi.ts`).
- **`GabaritsPlanning` supprimé** : la colonne du tableau du planning le
  remplace, et son « appliquer à toutes les tâches » est repris dans l'en-tête
  de l'onglet Planning › Tâches — c'était la seule chose qu'une colonne ne
  sait pas faire.
- **Devenus inatteignables, laissés sur disque et signalés** (pas supprimés
  d'office : ce sont des capacités que la demande ne dit pas d'abandonner) —
  `ActivitesTab` + `ActiviteSaisieForm` (saisie des activités de courbe en S,
  collection `courbe_en_s_activites`) et `AvancementHebdoTab` (la feuille
  « Data courbe en S »). Le rattachement d'un projet du classeur à une fiche
  reste possible depuis l'écran Rapprochement, qui expose le module
  `courbe-en-s`.
- Poids : le chunk `CourbeSTab` passe de 39 à 10 ko.

**Fiche projet — l'onglet Travaux terrain passe en lecture seule, alimenté par
les modules (18/08/2026, demande explicite « dans la section travaux terrain
je veux que les données proviennent de ce qui est rempli dans le CRJ, plus de
bouton d'ajout ici »)** : les 4 formulaires de saisie de la fiche (journal
tonnage, journal peinture, comptes rendus journaliers, périodes de standby) et
leurs boutons « Ajouter » sont retirés. Ils doublaient ce que les modules
opérationnels tiennent déjà — le même chantier pouvait porter 6 h de standby
côté CRJ et 2 jours ici, sans que rien ne dise lequel faisait foi.
- Chaque sous-onglet montre ce que le moteur de liaison rattache à la fiche :
  **Tonnage** = journal du module Tonnage + affaires METAL, **Peinture** =
  journal du module Contrat peinture, **CRJ** = rapports journaliers du module
  Suivi hebdo CRJ (bandeau avancement moyen / nombre de rapports / accidents
  cumulés, faits marquants en clair).
- **Standby / NPT devient dérivé du CRJ** : cumul de `dureeStandBy` des
  rapports rattachés, et la **répartition par cause** — FRC, EXP, LOG, METEO,
  CTR, ICP, OTTO 2, les 7 causes relevées dans la feuille « Data » du classeur
  `CRJ_16 06 26.xlsm` (colonne des causes, chacune en heures ; le champ `ctr2`
  du type porte la cause « CTR »). **Le cumul déclaré et la somme des causes
  sont affichés séparément** : rien dans le classeur ne garantit qu'ils
  coïncident, et recalculer l'un depuis l'autre masquerait l'écart.
- **Les saisies manuelles déjà enregistrées ne sont pas effacées** : chaque
  sous-onglet les rouvre sous « Saisies manuelles antérieures (n) — lecture
  seule », replié et vide de sens sur une fiche qui n'a jamais utilisé ces
  formulaires. Rien ne permet de les rapprocher d'une ligne de module (les
  deux schémas ne coïncident pas), et les supprimer serait perdre la seule
  trace de ce qui avait été relevé.
- `addTonnageEntry` / `addPeintureEntry` / `addCRJEntry` / `addStandbyEntry`
  ne sont plus appelés nulle part : laissés dans `ProjectsContext` (l'écriture
  reste possible si un besoin revient), signalés ici comme la seule API morte
  du module.

**Listes de valeurs paramétrables (18/08/2026, demande explicite « je veux
tout ce qui est type dans les select, je veux pouvoir les paramétrer dans la
section paramétrages afin de les rajouter proprement »)** — nouvel onglet
Paramètres › **Listes de valeurs** (`components/parametres/ListesValeursTab.tsx`),
catalogue dans `types/listeValeur.ts`, collection `listes_valeurs` (doc ID =
l'identifiant de la liste), contexte `ListesValeursContext`.
- **Ce qui alimentait les menus jusqu'ici** : les valeurs déjà présentes dans
  les données (`valeursDistinctes`, 71 appels) plus, pour METAL et la courbe
  en S, un référentiel livré avec le classeur. Conséquence : une valeur neuve
  n'apparaissait qu'**après** avoir été saisie ailleurs. Le référentiel ajoute
  la troisième source — ce qu'un admin déclare — et **reste additif** : il ne
  peut pas faire disparaître d'un menu une valeur que des lignes portent déjà
  (elles deviendraient illisibles), et les milliers de valeurs des classeurs
  importés n'ont pas à y être recopiées. Un seul point d'injection,
  `avecAjouts()` (`lib/saisie.ts`), à côté de `valeursDistinctes`.
- **36 listes câblées** sur 5 modules + un groupe commun (champs,
  plateformes, services, sociétés/CTR) : METAL (types d'avis, de travaux, de
  Core crew, statuts, risques, priorités), peinture (types d'item,
  catégories, sites, équipes, unités, priorités), tonnage (types
  d'échafaudage, modes de facturation, sites, profils), Procurement (types de
  matériel/transit/inspection, levels, niveaux de risque, lieux de MAD,
  scopes, départements, situations, leads, responsables, fournisseurs), EPCM
  (services, sites, fonctions, responsables).
- **Les ajouts vont aux formulaires, pas aux barres de filtres** : un filtre
  qui propose une valeur ne ramenant aucune ligne n'aide personne. METAL
  séparait déjà les deux jeux de listes ; les autres modules partageaient le
  même memo, d'où la fusion faite au niveau de l'objet `suggestions` du
  formulaire.
- **Deux exclusions, décidées en lisant le code** : les unions typées sur
  lesquelles il branche (type de projet avis/DDM/SOR, rubrique OPEX/CAPEX,
  statuts du parcours de visa navette, cycles PDC, rôles) restent dans le
  code — décision explicite de l'utilisateur : leur valeur déclenche un
  comportement, en ajouter une créerait une entrée de menu qu'aucun traitement
  ne saurait suivre. Et le **statut des journaux Procurement** a été retiré du
  catalogue en cours de route : `resumeStatutsDa` compte exactement
  `IN PROGRESS` et `CLOSED`, une troisième valeur ne serait comptée dans
  aucune des deux tuiles du résumé. Le statut des travaux METAL, lui, est
  ouvert : `statutCorrige` reconnaît les statuts par préfixe (« Terminée… »,
  « Soldée… »), une valeur neuve y garde un sens.
- **Le CRJ n'est pas câblé** : ses champs société / profil / matériel sont des
  saisies libres, sans liste suggérée à alimenter — leur en donner une serait
  ajouter des menus, pas paramétrer ceux qui existent.
- **Feuille de route ajoutée ensuite** (18/08/2026, « tout ce qui est
  catégorie je veux les configurer dans la partie paramétrage et rajouter un
  select dans la partie création projet ») : nouveau module `feuilleDeRoute`
  du catalogue avec sa liste `feuilleDeRoute.categories`, et le champ
  « Catégorie » du formulaire d'un projet — une **saisie libre** jusque-là —
  devient un select. Ses options sont les catégories déjà présentes dans les
  lignes plus celles déclarées dans Paramètres ; **la catégorie de la ligne en
  cours d'édition s'y ajoute si elle n'y figure pas**, sinon modifier une
  ligne dont la catégorie a été retirée du référentiel l'effacerait sans
  prévenir. Le filtre du tableau, lui, garde les seules catégories présentes
  dans les données. Les deux autres champs « catégorie » de l'application
  étaient déjà traités : `peinture.categories` (câblé), et `CategorieAlerte`
  de l'EPCM qui est une union typée sur laquelle le code branche — elle reste
  dans le code.
- Règle `firestore.rules` ajoutée (`listes_valeurs` : lecture connecté,
  écriture admin), **PAS ENCORE DÉPLOYÉE** — même réserve que toutes les
  règles de ce projet Firebase partagé. Sans déploiement, la lecture échoue,
  l'incident est signalé et les menus retombent sur les seules valeurs des
  données.
- **9 tests de plus** (`lib/__tests__/listesValeurs.test.ts`, 138 au total) :
  unicité et préfixage des identifiants du catalogue, caractère additif de la
  fusion (une valeur des données survit à tout), absence du statut
  Procurement, et contrôles d'ajout (vide, doublon insensible à la casse,
  normalisation des espaces).

**Navette — filtre par année (18/08/2026, en trois temps)** : d'abord « fais un
filtre sur l'année en fonction de la date de création » — `LigneNavette` ne
portait **aucune date de création**, d'où le nouveau champ `creeLe` (ISO) posé
par `createLigne` et la colonne « Créée le » du sélecteur de colonnes
(décochée par défaut). Puis, l'année du budget ayant été ajoutée à la saisie,
« dans le filtre on va récupérer les années directement » : le filtre devient
**« Année du budget »** et lit `anneeBudget` sur la ligne au lieu de le déduire
d'une date (`anneesBudget()`, `types/navette.ts` — `anneeCreation()`/
`anneesCreation()` supprimées avec leurs tests).
- **Pourquoi la bascule** : aucune ligne reprise du classeur n'a de date de
  création et rien ne permet de la reconstituer — le filtre ne proposait donc
  rien tant qu'aucune ligne n'avait été créée dans l'application. `creeLe`
  reste écrit et affichable en colonne, il n'alimente simplement plus le
  filtre.
- **Les lignes sans année restent atteignables** sous une entrée **« Sans
  année (n) »**, sans quoi filtrer les ferait disparaître sans qu'aucun choix
  ne permette de les retrouver — jusqu'à ce que la migration de Paramètres ›
  Maintenance les pourvoie.
- **Année du budget à la création** (18/08/2026, dans la foulée : « dans
  nouvelle navette remplace programme par année du budget ») : le champ
  « Programme (détail) » du formulaire de création laisse la place à
  **`anneeBudget`** — l'exercice que décrivent les 8 cycles de la ligne (BU et
  PDC de cet exercice, BUN1 du suivant), l'année en cours par défaut.
  Équivalent de `anneeBu` côté feuille de route. `programme` **reste sur le
  type et sur les lignes reprises du classeur** (colonne « Rubr » de la
  feuille ICP, affichée en colonne « Type Projet ») : il n'est simplement plus
  demandé à la saisie. Même remplacement dans `NewProjectModal`, qui crée une
  fiche **et** sa ligne navette avec les mêmes champs. Nouvelle colonne
  « Année budget » (visible par défaut, sinon la valeur saisie ne se lirait
  nulle part) et badge « Budget {année} » dans la modale de détail, à côté des
  cycles qu'elle qualifie.
- **Migration de l'existant** (18/08/2026, demande explicite « fais une
  migration afin de rajouter anneeBudget avec 2026 par défaut dans la
  collection ») — `lib/migrations.ts` + onglet **Paramètres › Maintenance**
  (admin uniquement). Il n'y a ni serveur ni script d'administration dans ce
  projet et `lignes_navette` est en `allow update: if estAdmin()` : la
  migration tourne donc dans la session d'un admin connecté, sous les mêmes
  règles que le reste de l'application — pas de chemin privilégié caché.
  - **Analyse d'abord, écriture ensuite** : le bouton « Analyser » compte sans
    rien écrire (total / déjà pourvues / à migrer), « Appliquer » demande une
    confirmation avant de toucher la base réelle.
  - **Idempotente** : une ligne qui porte déjà une année n'est jamais
    réécrite, quelle que soit sa valeur — relancer la migration ne change
    rien. `writeBatch` par lots de 400 (plafond Firestore : 500).
  - L'année est saisissable, 2026 par défaut (l'exercice décrit par les cycles
    du classeur importé).
  - **La navette est relue après coup** (`rechargerLignes`, nouveau sur
    `NavetteContext`) : ses lignes sont chargées une fois au montage, et une
    migration écrit dans la collection sans passer par le contexte — l'écran
    continuait donc d'afficher « Sans année » après une migration réussie,
    jusqu'au rechargement de la page.
  - **Bug préexistant corrigé au même endroit** : `createLigne` écrivait
    `champCode: undefined` quand le champ (site) était laissé vide, ce que
    Firestore refuse (« Unsupported field value: undefined », aucun
    `ignoreUndefinedProperties` n'est configuré). `anneeBudget`, facultatif
    lui aussi, tombait dans le même cas depuis son ajout. Les clés non
    renseignées sont désormais retirées avant l'écriture (`sansIndefinis`)
    plutôt qu'écrites à `null`, qui distinguerait mal « pas saisi » de
    « effacé ».
  - **7 tests** (`lib/__tests__/migrations.test.ts`) : sélection des documents
    sans valeur (y compris `0`, qui est une valeur et non une absence),
    relance sans effet, lots sous le plafond, aucun élément perdu ni dupliqué.
- **5 tests** (`lib/__tests__/anneeBudgetNavette.test.ts`, 150 au total) :
  année lue directement sur la ligne, dédoublonnage et tri de la plus récente
  à la plus ancienne, décompte séparé des lignes sans année, et « sans année »
  qui retombe à zéro une fois la migration passée.

**Navette — l'unité monétaire passe de la cellule à l'en-tête (18/08/2026,
demande explicite « à la place de total dans le tableau mets la devise déjà
sélectionnée et retirer cela dans les lignes »)** : le libellé « Total » de la
colonne de poste est remplacé par l'unité (« KUSD »), et les cellules
n'affichent plus que le nombre. Avec les 8 cycles affichés par défaut, c'était
8 fois « KUSD » par ligne.
- **L'en-tête ne porte l'unité que si toutes les lignes affichées partagent la
  même devise** (`deviseColonne`, calculé sur les lignes filtrées) : sinon un
  en-tête unique affirmerait une unité fausse pour une partie des cellules, et
  ce sont elles qui la portent alors, comme avant. Même règle pour le pied
  « Total ICP », converti dans la devise pivot : il garde son unité en cellule
  dès qu'elle diffère de celle de l'en-tête.
- **Le nombre affiché ne change pas** : `formatNombre(v, 3)` reproduit
  exactement ce que `formatMontant` laissait passer (maximum 3 décimales par
  défaut d'`Intl.NumberFormat`) — vérifié sur des montants entiers et au
  centième, un arbitrage en produisant.
- **L'extraction porte l'unité dans l'intitulé de colonne** (« Révision PDC02
  — Total (KUSD) ») : sortie du tableau, elle ne se lirait plus nulle part.

**Navette — synthèse des commentaires (18/08/2026, demande explicite « je veux
que tu affiches une synthèse des commentaires qui ont été faits sur les
lignes »)** : nouvelle carte `components/navette/SyntheseCommentaires.tsx`,
section à part entière du sélecteur « Sections » (visible par défaut), posée
au-dessus des annexes RFS / projets candidats.
- Le commentaire d'une ligne se saisit dans sa cellule du tableau, une ligne à
  la fois : pour savoir ce qui avait été noté sur le portefeuille, il fallait
  parcourir les pages et lire une colonne étroite.
- **Elle suit les filtres du tableau** (elle reçoit `filtered`) : filtrer sur
  un champ ou un chargé d'affaires restreint aussi la synthèse, sinon les deux
  vues de la même page se contrediraient. Le compteur le dit (« n lignes
  commentées sur m affichées »), et un clic ouvre la ligne concernée.
- **Ni tri chronologique ni auteur, faute de donnée** :
  `LigneNavette.commentaire` est une simple chaîne, sans horodatage ni
  signature — contrairement au type `Commentaire` d'une fiche projet. Les
  lignes gardent donc l'ordre du tableau ; rien n'est inventé sur « qui » ni
  « quand ». C'est le changement de modèle à faire si un historique est
  attendu.
- **Regroupée par projet** (dans la foulée : « fais un regroupement pour les
  projets ayant un commentaire ») : plusieurs lignes navette peuvent pointer
  vers la même fiche projet, leurs commentaires se lisent alors ensemble sous
  son nom (badge « Fiche projet » + nombre de lignes). Une ligne non rattachée
  — le cas courant — forme son propre groupe sous son libellé, qui n'est donc
  pas répété dans l'entrée.
- Les deux annexes **RFS récurrentes** et **Projets candidats BU** ont été
  retirées de la page par l'utilisateur lui-même. Leurs bascules du menu
  « Sections » ont été retirées avec elles (deux cases qui ne commandaient
  plus rien), ainsi que les variables devenues orphelines dans la page.
  `initialRFSRecurrents`/`initialProjetsCandidatsBU` restent exposées par
  `NavetteContext` mais ne sont plus affichées nulle part.

**Préférences d'affichage : une option ajoutée après coup n'apparaissait
jamais (18/08/2026, signalé par l'utilisateur — « la section ne s'affiche
pas »)** — la synthèse des commentaires venait d'être ajoutée à
`SECTIONS_DEFAUT`, mais `usePreferenceAffichage` ne sert le défaut qu'**en
l'absence de valeur stockée** : tout poste ayant déjà ouvert la navette gardait
sa liste de sections, où la nouveauté n'était pas mentionnée — donc traitée
comme une case décochée. Le même piège attendait la colonne « Année budget ».
- Nouveau `usePreferenceSelection` (`lib/preferencesAffichage.ts`) : la
  préférence enregistre aussi **le catalogue des options connues à ce
  moment-là**. À la relecture, une option présente dans le défaut mais absente
  de ce catalogue est ajoutée aux visibles ; une option que l'utilisateur a
  décochée figure, elle, dans le catalogue enregistré et reste masquée. Les
  quatre menus de la navette (colonnes, cycles, postes, sections) y passent.
- **Reprise des anciennes valeurs** (simple tableau, sans catalogue) : la liste
  elle-même en tient lieu. Conséquence assumée et unique : une option du défaut
  qui avait été décochée réapparaît une fois, puis le premier enregistrement
  rétablit le comportement exact. Les identifiants d'options disparues (`rfs`,
  `candidats`) restent dans la liste stockée sans effet.
- **6 tests** (`lib/__tests__/preferencesAffichage.test.ts`, 156 au total) :
  ajout d'une option nouvelle, respect d'une option décochée, catalogue
  inchangé, reprise d'une ancienne valeur, et option hors défaut qui reste
  masquée (« Créée le »).

**Taux de conversion réels (19/08/2026, fournis par l'utilisateur : « 1 euro =
1,20 usd, 1 euro = 655,957, 1 usd = 546,6308, 1 xaf = 0,00183 »)** — le
référentiel livré par défaut (`DEVISES_PAR_DEFAUT`, types/devise.ts) porte
enfin le franc CFA. Le pivot restant l'USD, deux nombres suffisent : EUR = 1,2
et XAF = `1 / USD_VERS_XAF` (546,6308, nouvelle constante exportée).
- **Les quatre valeurs se recoupent, et c'est ce qui a décidé de l'écriture** :
  1,2 × 546,6308 = 655,95696, soit la parité fixe EUR/XAF à 4·10⁻⁵ près (1,2
  est un EUR/USD arrondi au centime), et 0,00183 est l'inverse arrondi de
  546,6308 (1/546,6308 = 0,00182939). Le taux du franc CFA est donc stocké
  comme **l'inverse exact du USD→XAF** plutôt que comme son arrondi à 5
  décimales : dans l'autre sens, 0,00183 aurait rendu 546,448 XAF pour 1 USD.
- **La reprise des taux historiques ne comble plus que les taux inconnus**
  (`appliquerTauxHistoriques`, `DevisesContext`) : tant que le référentiel
  n'est pas enregistré, le `XAF: 1` de parité neutre encore présent dans
  `parametres_navette/globaux.tauxChange` serait revenu écraser le vrai taux,
  en silence. Les taux fournis font foi ; le mécanisme de reprise reste en
  place pour une devise qui n'aurait, elle, aucun taux par défaut.
- `TAUX_CHANGE_DEFAUT` (types/navette.ts) est aligné sur le même couple : son
  `XAF: 1` comptait un montant en francs CFA comme autant de dollars dans tout
  total mêlant plusieurs devises. **Les totaux navette d'une ligne libellée en
  XAF changent donc de ~600×** — c'est la correction, pas un effet de bord.
- La carte « Taux de change » de la navette affichait `{devise.taux}` brut :
  lisible pour 1,2, illisible pour 0,001829385… Le taux est formaté, et
  **doublé de son inverse sous les 0,1** (« soit 1 USD = 546,6308 XAF »),
  le sens dans lequel ce taux-là se lit réellement.
- **2 tests** remplacent celui qui figeait « XAF sans taux »
  (`lib/__tests__/devises.test.ts`) : les quatre valeurs annoncées retrouvées
  dans les deux sens par `convertir()`, et l'absence de toute devise sans taux
  dans le référentiel par défaut.

**Toute la chaîne de conversion alignée sur ce résultat (19/08/2026, demande
explicite « affiner tout le process afin d'avoir ce même résultat »)** — le
parcours complet (référentiel → champ de saisie → agrégat navette →
affichage) a été rejoué sur les taux réels. **Quatre écarts trouvés, tous
révélés par le franc CFA** : ses montants sont d'un ordre de grandeur que
l'application n'avait jamais eu à afficher, la parité neutre les ayant
masqués jusqu'ici.
- **Un taux n'est pas un montant** : il était affiché aux décimales d'une des
  deux devises, ce qui donnait « 1 USD = 547 XAF » (décimales du franc CFA)
  et « 1 XAF = 0,00 USD » (celles du dollar) dans la ligne d'aide du champ de
  saisie. Nouveau `formaterValeurTaux`/`formaterTaux` (types/devise.ts) — 4
  décimales au-dessus de l'unité, 6 chiffres significatifs en dessous, soit
  exactement les valeurs fournies dans les deux sens — partagé par le champ
  de saisie, le convertisseur, la carte « Taux de change » et le tableau de
  l'écran Devises, qui en avaient trois formats différents.
- **`formaterMontant` descend sous les décimales de la devise** quand le
  montant s'y écraserait (`decimalesLisibles`) : 500 000 XAF saisis dans une
  colonne KUSD s'annonçaient « Enregistré : 1 KUSD » pour 0,91469 réellement
  écrit. Un montant qui tient dans ses décimales garde exactement le format
  d'avant — c'est vérifié.
- **`arrondirPourStockage`, appliqué au montant converti** avant
  `onChange` : 3 000 USD tapés dans un champ en XAF enregistraient
  1 639 892,4 — un franc CFA n'a pas de centième — pendant que la ligne
  « Enregistré : » annonçait 1 639 892. L'arrondi et l'affichage partagent
  désormais la même précision (décimales de la devise, +3 rangs en échelle
  des milliers : 0,001 KUSD, c'est 1 USD). Un montant saisi directement dans
  l'unité du module n'est jamais touché.
- **`tauxPour()` rendait `undefined` — donc des totaux `NaN`** — pour une
  devise absente du référentiel *et* des défauts. Bug latent depuis que
  `Devise` est une chaîne libre (18/08/2026) : une seule ligne en GBP
  suffisait à effacer une colonne entière de la navette, lignes correctes
  comprises. Repli explicite à la parité neutre, et nouveau
  `devisesSansTaux()` pour que l'écran puisse nommer ce qui est agrégé sans
  taux — un agrégat ne doit jamais être le seul endroit où l'approximation se
  voit. Le message de la carte « Taux de change » disait d'ailleurs « parité
  neutre » alors que le repli est le taux par défaut : il nomme maintenant le
  taux réellement appliqué.
- **`TAUX_CHANGE_DEFAUT` n'écrit plus ses propres taux** : il dérive de
  `DEVISES_PAR_DEFAUT` (`tauxParDefaut()`). C'était la seconde liste de taux
  à tenir d'accord, et celle qui portait encore la parité neutre.
- **16 tests de plus** (173 au total) : format des taux, seuil de
  `decimalesLisibles` dans les deux sens, aller-retour saisie → stockage →
  affichage qui retombe sur le même nombre, absence de `NaN`, et l'identité
  `TAUX_CHANGE_DEFAUT === tauxParDefaut()`.

**Écriture des taux dans la collection `devises` (19/08/2026, demande
explicite « mets à jour les infos des datas dans la collection avec ces datas
soumis »)** — `migrerTauxDevises()` (`lib/migrations.ts`) + une seconde carte
dans **Paramètres › Maintenance**. Les taux ci-dessus s'appliquent déjà tant
que la collection est vide (le provider sert `DEVISES_PAR_DEFAUT`) ; cette
migration sert quand elle a été enregistrée, avec d'anciennes valeurs. Même
chemin que la migration « année du budget » : pas de serveur ni d'Admin SDK
ici, elle tourne dans la session d'un admin connecté, sous les règles
communes.
- **Elle remplace au lieu de combler, contrairement à l'autre migration** —
  c'est la demande, mais ça la rend moins anodine : d'où l'analyse qui liste
  chaque devise avec son ancienne et sa nouvelle valeur, et la confirmation
  qui reprend ce détail. Un taux déjà juste (à 1e-12) n'est pas réécrit :
  relancer ne change rien et n'avance pas l'horodatage.
- **Seul le taux est écrit** sur un document existant : libellé, symbole,
  décimales, état actif et **le pivot** sont des choix d'administration, pas
  des valeurs livrées. Une devise absente est créée en entier depuis le
  référentiel par défaut.
- **Les taux sont reconvertis dans le pivot en place** (`tauxAttendus()`) : un
  taux ne veut rien dire sans sa référence, et écrire 1,2 pour l'euro dans un
  référentiel pivoté sur l'euro aurait inventé un chiffre. Si ce pivot n'a
  lui-même aucun taux de référence connu, la migration **refuse et le dit**
  plutôt que de deviner.
- **7 tests** (`lib/__tests__/migrations.test.ts`) sur la partie qui décide :
  expression dans un pivot autre que l'USD, refus sur pivot inconnu, sélection
  des seuls écarts réels, relance sans effet, devise absente vs. sans taux,
  casse de l'identifiant.
- **Rappel** : la règle `devises` de `firestore.rules` (lecture connecté,
  écriture admin) est **toujours non déployée** — sans elle l'écriture est
  refusée, l'erreur s'affiche sur la carte et dans le bandeau d'incidents.

**Devise du système : une seule devise affichée partout (19/08/2026, demande
explicite « je veux que cette section soit dynamique, aussi la devise définie
dans le système va afficher une information pour toutes les interfaces, les
calculs se feront via les conversions, plus besoin de les afficher dans les
inputs »)**. Trois arbitrages tranchés avec l'utilisateur avant d'écrire :
**le pivot fait office de devise système** (pas de second réglage), le
sélecteur de devise **disparaît des champs** mais la devise d'une donnée reste
choisissable ailleurs, et la conversion s'applique **à tout, tableaux et
extractions compris**.
- **`lib/montantAffiche.ts`, le point de passage** : `useMontant()` rend un
  `montant(valeur, unite)` **de signature identique à `formatMontant`** — les
  121 sites d'affichage (21 fichiers) sont passés à la conversion en aliasant
  le hook, sans réécrire un seul appel. `uniteDepuisLibelle()` relit le
  libellé que ces appels passaient déjà (« KUSD » → milliers de dollars, le
  `K` de tête étant sans ambiguïté face à un code ISO de 3 lettres).
- **L'unité d'enregistrement ne bouge pas, l'échelle non plus.** Chaque module
  continue d'écrire dans l'unité de son classeur (tout l'historique importé y
  est compté, rien ne dirait dans quoi il l'était après coup) et les colonnes
  budgétaires restent en milliers : seule la devise est convertie, KUSD → KXAF.
  Convertir aussi l'échelle ferait changer d'ordre de grandeur une colonne en
  changeant de devise.
- **Un taux manquant n'efface pas le montant** : il reste affiché dans son
  unité d'origine, et `converti: false` permet à l'écran de le dire. Les
  en-têtes suivent (`uniteAffichee()`) — un titre « (KUSD) » figé au-dessus de
  chiffres convertis serait le pire des deux mondes.
- **Le champ de montant perd son sélecteur** (`ChampMontant`) : on saisit dans
  la devise du système, la conversion vers l'unité d'enregistrement reste
  affichée sous le champ (« Enregistré : … »). La **préférence de poste
  « saisir mes montants en … » est supprimée** avec lui (`deviseSaisie` du
  contexte, clé `localStorage`) : deux postes auraient saisi dans deux devises
  différentes sans que rien ne le dise à la lecture. Ce qui reste, parce que
  ce n'est pas la même chose : `ui/SelecteurDevise`, le champ « Devise » des
  entités qui portent la leur (ligne navette, fiche projet, contrat EPCM) —
  qualifier une donnée et choisir dans quoi on tape sont deux gestes
  différents, les confondre dans un menu collé au montant était l'ambiguïté.
- **Navette** : la logique « unité en en-tête seulement si toutes les lignes
  partagent la même devise » disparaît — les lignes étant converties, l'unité
  de l'en-tête est vraie pour toutes. Une ligne dont la devise n'a pas de taux
  fait exception et porte la sienne dans la cellule.
- **Colonnes hors composant** (`colonnes.tsx` des modules feuille de route,
  METAL, tonnage, peinture) : elles ne peuvent pas appeler le hook, l'onglet
  le fait et leur passe un `FormateurMontant` — comme il leur passe déjà le
  résolveur ou le contrat. `ColonneFdr` gagne une `unite`, et l'en-tête est
  composé par la page dans la devise du système.
- **L'indication est portée par la coque** (`layout/IndicateurDeviseSysteme`,
  barre supérieure) plutôt que répétée sur 20 écrans : code de la devise,
  point ambre tant que le référentiel n'a pas été enregistré, et lien vers
  l'écran Devises. Un tableau converti sans rien dire laisserait croire que
  ses chiffres sont ceux du classeur source.
- **Le tableau « Où les devises s'appliquent » devient calculé**
  (`emploisAffiches()`) au lieu d'être de la prose : `EMPLOIS_DEVISE` porte
  désormais des `UniteMontant` exploitables, et chaque ligne affiche le **taux
  réellement appliqué**, un exemple converti, et le cas « non convertible ».
  C'est ce qui permet de vérifier là ce que font les autres écrans — une unité
  fausse s'y voit, au lieu de rester vraie sur le papier.
- **Longue traîne traitée** : formateurs locaux (`FinancierTab` de l'EPCM),
  en-têtes « (XAF) » écrits en dur (tonnage), étiquettes et camemberts des
  graphiques peinture, aperçus dérivés et résumés d'étapes des formulaires
  peinture/METAL, cartes KUSD du tableau de bord peinture, et le déficit de
  `ArbitrageModal` (qui écrivait « KUSD » alors que la cale est comptée dans
  le pivot, quel qu'il soit). Les extractions CSV/PDF héritent de la
  conversion : elles lisent le texte des cellules rendues.
- **10 tests** (`lib/__tests__/montantAffiche.test.ts`, 183 au total) :
  lecture d'une unité, conversion qui garde l'échelle, aller-retour, montant
  intact quand le taux manque, absence qui ne devient pas zéro, et le tableau
  des emplois recalculé pour trois devises système différentes.

**Écran Agents : CRUD complet, import et export (20/08/2026, demande
explicite « on va faire un CRUD pour agent, aussi en cas de suppression on va
réaffecter les projets gérés vers un autre agent, on va rajouter l'import en
xls et export pdf et xls »)** — `pages/AgentsPage.tsx` + `components/agents/`
(formulaire, modale de suppression, modale d'import). L'écran ne savait que
créer un compte et désigner un viseur de révisions navette.
- **Un seul formulaire pour créer et modifier** (`AgentForm`) : mêmes champs,
  deux composants jumeaux auraient divergé au premier ajout. **L'email n'est
  pas modifiable** — il identifie le compte Firebase Auth, que seul l'Admin
  SDK pourrait renommer (pas de backend ici) ; le changer dans le seul
  document Firestore ferait mentir l'annuaire sur l'identité réelle. Le champ
  reste visible, désactivé, et l'écran dit pourquoi.
- **Suppression = transfert puis retrait, dans cet ordre** : les fiches sont
  réaffectées (`reaffecterProjets`, ProjectsContext) **avant** que le compte
  ne soit retiré. L'inverse laisserait, si l'écriture échouait, des fiches
  rattachées à un `agentId` qui ne désigne plus personne — invisibles pour
  tous sauf les admins et sans responsable, `agentId` étant ce qui donne à un
  agent l'accès à ses fiches (Projets, tableau de bord, « mon périmètre » des
  journaux terrain). La modale liste les fiches concernées et refuse de
  supprimer tant qu'aucun repreneur n'est choisi.
- **Ce que la suppression ne fait pas, et l'écran le dit** : le compte
  Firebase Auth survit — aucun client ne peut supprimer celui d'un tiers.
  L'accès est bien coupé (`AuthContext` refuse une session sans fiche
  d'annuaire), mais **l'adresse reste prise** : recréer un compte avec le même
  email échouera. Se supprimer soi-même est refusé côté contexte *et* grisé
  côté écran : un admin qui efface sa propre fiche perd l'accès à l'écran qui
  permettrait de la recréer.
- `firestore.rules` : `utilisateurs` passe de `allow delete: if false` à
  `estAdmin()`. **Modification locale, PAS ENCORE DÉPLOYÉE**, même réserve que
  toutes les règles de ce projet Firebase partagé — sans déploiement, la
  suppression échoue et l'erreur s'affiche dans la modale.
- **`lib/xlsx.ts` — vrais fichiers .xlsx, toujours sans dépendance.** Le CSV
  « français » restait défendable pour exporter ; **importer** change la
  donne : un utilisateur qui prépare sa liste dans Excel enregistre un .xlsx,
  et lui demander de le convertir serait lui faire faire le travail. Les deux
  morceaux qui manquaient sont désormais standard — `DecompressionStream`
  ('deflate-raw') pour lire les entrées du ZIP, et l'écriture se passe de
  compression (une entrée « stored » avec son CRC32 est valide). Le XML est lu
  et écrit par expressions régulières et non par DOMParser : ce module doit
  tourner à l'identique dans le navigateur et sous Vitest (environnement Node,
  sans DOM). **Limite assumée** : une cellule de date revient en numéro de
  série Excel — les imports de l'app portent du texte et des nombres.
- **Le format est vérifié dans les deux sens, contre un vrai tableur** : la
  fixture de test est un classeur **produit par openpyxl** (table de chaînes
  partagées, cellule vide au milieu d'une ligne, mélange texte/nombres) — un
  aller-retour avec soi-même aurait passé avec un format inventé. Et le
  classeur écrit par ce module a été relu par openpyxl : onglets, accents,
  échappement de `&`/`<`, cellules nulles et nombres restés nombres.
- **Le bouton d'export partagé gagne le .xlsx** (`lib/export.ts`,
  `BoutonExport`) : les ~20 tableaux de l'application en héritent, pas
  seulement cet écran. jsPDF **et** le module xlsx sont importés
  dynamiquement, au clic.
- **Import en deux temps : déposer n'écrit rien.** `lib/importAgents.ts` lit
  et juge (lecture tolérante — en-têtes dans n'importe quel ordre, sans
  accent, rôle en clair ou en code —, sortie stricte : chaque ligne est
  retenue ou rejetée avec son motif et son **numéro de ligne Excel**), l'écran
  montre le résultat, et les créations n'ont lieu que sur un second geste. Un
  import qui écrirait à la lecture laisserait la moitié d'un fichier en base
  sans qu'on sache laquelle. Les doublons sont détectés avant écriture (contre
  l'annuaire **et** à l'intérieur du fichier), sinon l'erreur arriverait au
  milieu, après plusieurs comptes créés. Le rôle par défaut est `agent`, le
  moins doté : un fichier muet ne doit pas créer d'administrateurs.
- **L'export et l'import parlent le même langage** : les colonnes extraites
  sont exactement les en-têtes que l'import sait relire — exporter l'annuaire,
  le corriger dans Excel et le réimporter fonctionne. C'est une propriété
  entre deux modules écrits séparément, donc **vérifiée par un test de bout en
  bout** plutôt qu'affirmée. Un modèle vierge est téléchargeable depuis la
  modale.
- **Un défaut trouvé par les tests** : « Aucun » — le libellé que
  l'application affiche elle-même dans son menu de visa navette — était rejeté
  comme valeur non reconnue, parce que le code confondait « refus explicite »
  et « valeur incomprise ». Corrigé par un état à trois valeurs.
- Au passage : `ROLES`/`PROFILS_NAVETTE` remontent dans `types/user.ts` (un
  fichier qui exporte composants **et** constantes casse le rafraîchissement à
  chaud de Vite), `selectClass` rejoint `components/ui/classes.ts` (il était
  recopié dans trois fichiers) et `Button` gagne une variante `danger` — le
  rouge d'une action irréversible se posait jusqu'ici en `className` au cas
  par cas.
- **25 tests de plus** (208 au total) : `lib/__tests__/xlsx.test.ts` (11) et
  `lib/__tests__/importAgents.test.ts` (15, dont l'aller-retour).

**Navette — statut « En cours » / « Clôturée » (20/08/2026, demande explicite
« on rajoute le statut en cours, clôturé, on fera un filtre dessus également,
toutes les items seront considérés comme étant en cours, on rajoute la
nouvelle propriété directement dans la collection »)** :
- `StatutLigneNavette` (`types/navette.ts`) — deux valeurs, et **`statutLigne()`
  lit « en cours » quand le champ est absent**. Les 84 lignes reprises du
  classeur n'ont pas ce champ ; sans ce repli elles auraient formé un
  troisième état de fait, invisible et non filtrable. L'application se
  comporte donc de la même façon avant et après la migration — c'est
  volontaire : le repli et la migration disent la même chose.
- **Filtre « Statut » dans la barre de filtres**, sur le statut *effectif* :
  une ligne sans champ en base ressort bien sous « En cours » dès maintenant.
  Nouvelle **colonne « Statut »** (badge vert / gris), ajoutée au catalogue du
  sélecteur de colonnes et **visible par défaut** — sinon la valeur ne se
  lirait nulle part. Une ligne clôturée est atténuée dans le tableau.
- **Clôturer se fait depuis le détail de la ligne** (admin), là où vivent déjà
  ses actions, et **se défait** : clôturer n'est pas supprimer — la ligne garde
  ses cycles, ses révisions et son historique, elle sort du travail courant.
  `definirStatutLigne` attend l'écriture avant de mettre l'état local à jour,
  comme les autres écritures de ce contexte : un refus des règles remonte à
  l'écran au lieu d'afficher un statut non enregistré.
- **`createLigne` écrit `statut` explicitement** : une ligne créée après ce
  jour n'a aucune raison de dépendre de la migration.
- **Migration `migrerStatutLignesNavette`** + troisième carte dans Paramètres ›
  Maintenance, même parcours que les deux autres (analyser, puis appliquer
  après confirmation, par lots de 400). Idempotente : une ligne qui porte déjà
  un statut n'est jamais réécrite — **relancer ne rouvre aucune ligne
  clôturée**.
- **Les totaux suivent le filtre, comme le reste de l'écran** : une ligne
  clôturée reste comptée dans « Total ICP » et le CP tant qu'elle est
  affichée. Pour des chiffres sur le seul portefeuille actif, on filtre sur
  « En cours » — le pied de tableau suit. Ce n'est pas un oubli : exclure
  d'office les lignes clôturées d'un total ferait diverger le pied du tableau
  qu'il résume.
- **Pas de tests unitaires sur ce lot, à la demande explicite de
  l'utilisateur.** `tsc -b`, `npm run lint`, `npm run build` et les 209 tests
  existants passent.

**Feuille de route — section « Regroupements » (20/08/2026, demande explicite
« fais une section avec des regroupements des projets par catégories, mais une
interface dynamique »)** — `components/feuilleDeRoute/RegroupementProjets.tsx`
(affichage) + `regroupement.ts` (calcul pur, sans JSX ni contexte).
- Le tableau montre les projets ligne à ligne sur 22 colonnes ; il ne dit pas
  **ce que pèse une catégorie**. La section répond à l'autre question :
  combien de projets, quel engagement, quel facturé, quelle estimation, quel
  avancement moyen, combien de fiches rapprochées.
- **Ce qui la rend dynamique** : le critère de regroupement n'est pas figé sur
  la catégorie — année BU, priorité, statut, service leader et champ sont des
  critères au même titre (ce sont les colonnes qui découpent naturellement le
  portefeuille, et le calcul est identique) ; le tri se choisit (nombre,
  engagement, avancement, alphabétique) ; chaque groupe se déplie sur ses
  projets, et un clic ouvre **la modale de détail déjà utilisée par le
  tableau** — pas de seconde façon de lire un projet.
- **Elle suit les filtres du tableau** (elle reçoit `filtered`, comme la
  synthèse des commentaires de la navette) : filtrer sur une année restreint
  aussi les regroupements, sinon les deux vues de la même page se
  contrediraient. Le compteur le dit.
- **Trois reprises de règles déjà en place, volontairement identiques** :
  l'engagement vaut le montant calculé sinon le montant du PO (comme le
  tableau et les tuiles) ; un groupe dont aucun projet n'a d'avancement
  renseigné affiche **un tiret et non 0 %** (il n'est pas en retard, il est
  muet) et passe en dernier au tri par avancement ; les lignes sans valeur de
  critère forment un groupe **« Sans catégorie »** toujours en fin de liste —
  un trou à combler, pas une catégorie du portefeuille (même principe que
  « Sans année » du filtre navette).
- Les barres de part rapportent chaque groupe **au plus gros**, pas au total :
  rapportées au total, elles deviennent illisibles dès une dizaine de groupes.
- Critère, tri et état plié/déplié de la section sont persistés en
  `localStorage` (préférence de poste, comme les colonnes visibles) — mais
  **pas la liste des groupes dépliés** : ses clés dépendent du critère et des
  données, une liste gardée d'une session à l'autre désignerait des groupes
  qui n'existent plus.
- **Pas de tests unitaires**, la demande précédente de l'utilisateur valant
  toujours ; `regrouperProjets()` est isolée et pure, donc testable telle
  quelle si le besoin revient. Son comportement a été vérifié à la main sur un
  jeu de lignes couvrant les quatre tris, le repli PO, l'avancement absent et
  le groupe sans catégorie.

**Fiche projet — contrats multiples et suivi des commandes déplacé
(20/08/2026, demande explicite « dans le détail projet, la section contrats,
je veux avoir la possibilité de lier plusieurs contrats à un projet ; le suivi
des commandes se fera dans la partie contrats, plus dans le budget »)** :
- **Lier plusieurs contrats était déjà possible côté données** (`projetIds`
  est un tableau) mais l'écran ne le montrait pas : un menu déroulant, un
  contrat, formulaire à rouvrir à chaque fois. Il devient une **liste à cases
  à cocher avec recherche** (référence, type, fournisseur — le référentiel
  compte plusieurs dizaines de contrats) et un bouton « Lier n contrat(s) ».
  Les liaisons sont écrites une par une, séquentiellement : `lierProjet` écrit
  le `projetIds` d'un document, il n'y a rien à grouper, et l'erreur affichée
  est celle du premier échec.
- **Détacher un contrat devient possible** : `delierProjet` existait dans le
  contexte mais **n'était appelé nulle part** — un contrat lié par erreur ne
  pouvait plus être retiré. Bouton sur chaque carte, avec confirmation qui
  annonce le nombre de commandes concernées. Détacher n'est pas supprimer : le
  contrat reste au référentiel et pour ses autres projets.
- **Les commandes (PO) quittent l'onglet Budget pour la carte de leur
  contrat** (`components/projects/CommandesContrat.tsx`, extrait de
  `ProjectDetailPage`). Conséquence directe : le formulaire d'ajout **perd son
  menu « Contrat »** — la carte sait de quel contrat elle parle, et c'était le
  champ le plus facile à se tromper. Le modèle ne change pas :
  `Commande.contratId` existait déjà et alimente la consommation dérivée.
- **Rien ne disparaît de l'écran au passage** : les commandes dont le contrat
  n'est pas (ou plus) lié à la fiche — y compris celles sans `contratId`, le
  champ étant facultatif — sont regroupées sous **« Commandes sans contrat
  lié »**, visibles et modifiables, avec la marche à suivre. Sans ce bloc, le
  déplacement aurait masqué des commandes bien réelles.
- **Deux compteurs de portées différentes cohabitent sur la carte**, et chacun
  dit laquelle : « n commandes sur ce contrat, tous projets confondus » (ce que
  `commandesParContrat` mesure, et qui alimente la consommation du contrat) et
  « Commandes (PO) de ce projet sur ce contrat ». Ils diffèrent dès qu'un
  contrat sert plusieurs projets.
- L'onglet Budget garde un **renvoi chiffré** (nombre de commandes, engagé,
  facturé) vers l'onglet Contrats : sans lui, il donnerait l'impression que la
  fiche ne porte plus de commandes. Les totaux d'engagement et de facturé
  remontent en tête de l'onglet Contrats, où vivent désormais les commandes.

**Courbe en S — le tracé revient dans la fiche projet (20/08/2026, document de
référence « Typical S Curve » fourni par l'utilisateur : « cette feuille
résulte des données issues des trois plannings précédents : Baseline,
Forecast, Réalisé. Elle permet de tracer les courbes en S et de comparer
l'évolution prévisionnelle et réelle du projet », avec `KPI_ICP_2905 (1).xlsm`
pour référent)** :
- **Attention au nom** : dans le classeur, la feuille `typical S curve`
  contient les **5 gabarits** (« ne pas toucher merci », reproduits dans
  Paramètres › Courbes types). La feuille que décrit le document — celle
  alimentée par les 3 plannings — est **`Progress_Curve`**, appuyée sur
  `Data courbe en S`. Vérifié dans le fichier avant d'écrire quoi que ce soit.
- **Ce qui existait déjà et n'a pas été refait** : `ProgressionTab` reproduit
  `Progress_Curve` colonne pour colonne — relu dans le classeur à cette
  occasion : B/D → Période, F → Baseline, H → Forecast, G → Réalisé (les deux
  par XLOOKUP sur la date, comme la feuille), I → Delta = Réalisé − Baseline,
  et **K/L/M → effort par période « planned / forecast / actual »**
  (= cumul(n) − cumul(n−1) de la série correspondante). Les 4 indicateurs de
  tête sont ceux de la feuille : L2 jours restants, L3 prévisionnel, L4
  réalisé, L5 « Retard » = `IF(M5<0, M5, 0%)` avec M5 = dernier Delta.
- **Le seul écart avec le classeur, assumé et déjà étiqueté à l'écran**
  (« Prévisionnel **à date** ») : la feuille lit L3 = dernier Baseline non
  vide, qui vaut **toujours 100 %** puisque la courbe finit à 1 — la tuile du
  classeur n'apprend donc rien. L'application prend le prévisionnel à la date
  du dernier relevé, seul point où la comparaison avec le réalisé a un sens.
  Le Delta, lui, est pris au même endroit que le classeur (M5).
- **Ce qui manquait était la place, pas le calcul** : ce tracé n'était
  accessible que par Planning › Courbe, alors que l'onglet nommé « Courbe en
  S » ne montrait que l'allure du gabarit retenu. `CourbeSTab` a désormais
  **deux vues** — « Allure » (inchangée, et toujours celle d'ouverture : le
  choix explicite du 18/08/2026 n'est pas défait) et « Progress curve ».
- **Aucune seconde implémentation** : la vue monte le `ProgressionTab` déjà
  utilisé par Planning › Courbe, sur les activités que sert
  `useCourbeEnSProjet` — les mêmes que l'allure, donc classeur rattaché ou
  planning de la fiche selon le cas. Deux tracés d'une même courbe finiraient
  par diverger.
- Rappel utile en lisant le classeur : ses colonnes G, H, I et « Monthly
  effort » sont **#ERROR!** dans le fichier livré (array formulas cassées par
  un aller-retour Google Sheets), et ses 6 graphiques ne portent que la série
  Baseline. Seule la colonne F a des valeurs — ce sont elles que les tests
  rejouent (0,0404 · 0,3369 · 0,7779 · 0,8184 · 0,9437). L'application calcule
  les trois séries : elle est plus complète que sa source, à partir des mêmes
  formules.

**Navette — retours de `doc/Navette commentaires.docx` (21/08/2026, demande
explicite « parcours le fichier et identifie les points à implémenter », puis
« on y va avec les 3 premiers »)** — trois des cinq points du document sont
faits ; les deux autres restent ouverts (voir plus bas).
- **Titre de la modale de révision** : `CYCLE_BUDGET_LABELS` dit déjà
  « Révision PDC05 », le préfixe `'Réviser'` d'`ArbitrageModal` donnait donc
  « Réviser Révision PDC05 ». Retiré ; le correctif garde le sien
  (« Correctif — Révision PDC05 »), c'est un autre geste.
- **Bandeau d'indicateurs en deux rangées** : le document demandait le total
  du BU initial et celui des PDC, qui manquaient. Ils ne demandaient **aucun
  nouveau calcul** — `totauxCycles` agrège déjà les 8 cycles sur les lignes
  filtrées pour le pied « Total ICP », les tuiles le relisent et suivent donc
  les filtres exactement comme le tableau qu'elles résument. La tuile PDC
  porte **son sélecteur de cycle dans son libellé** (PDC02/05/09/11, un seul à
  la fois, comme demandé : « si il est possible que je fasse le choix de
  l'affichage c'est le top »), persisté en `localStorage`
  (`navette.cyclePdc`) comme les autres choix d'affichage. `TuileKpi.libelle`
  est élargi de `string` à `ReactNode` pour ça.
  - **Le « reste de la cale à absorber » devient une tuile** au lieu d'un
    petit texte de détail. La valeur ne change pas : `caleDisponible` **est**
    déjà `cale à absorber − arbitrages réalisés` (elle se décrémente à chaque
    arbitrage validé), c'était sa place à l'écran qui manquait.
  - Deux rangées et non une grille de sept tuiles : la première dit ce que
    pèse le portefeuille **filtré**, la seconde l'état de la cale, qui est
    globale et ne bouge pas avec les filtres — le mélange des deux portées
    dans une même grille était précisément ce qui ne « passait pas à l'œil ».
  - Un cumul PDC à 0 ne dit pas si le cycle n'est renseigné nulle part ou si
    les montants s'annulent : la tuile affiche aussi le nombre de lignes qui
    portent un montant sur ce cycle.
- **Filtre par fiche projet** : le filtre « Liaison » ne disait que liée /
  non liée, et la recherche ne porte que sur le libellé et le code OTP —
  isoler les lignes d'une fiche précise était impossible alors que plusieurs
  lignes navette peuvent pointer vers la même. Le menu ne propose que les
  fiches **qu'une ligne du périmètre désigne réellement** (un choix qui ne
  ramènerait rien n'aide personne) et n'apparaît pas tant qu'aucune ligne
  n'est liée. Une fiche introuvable garde son identifiant : la ligne existe,
  la masquer du menu la rendrait impossible à isoler.
- **Deux points du document restent ouverts, volontairement** (lots suivants,
  non commencés) :
  1. **Modifier une ligne depuis la navette** (icône crayon : année,
     intitulé, budget…). `NavetteContext` n'expose aucun `updateLigne` — seuls
     le commentaire, le statut et la liaison projet s'écrivent après coup.
     Deux arbitrages à trancher avant d'écrire : le **code OTP est l'ID du
     document Firestore** (`idDocument(input.codeOTP)`), donc non modifiable
     par un `updateDoc` sans casser les `projetId`, arbitrages et lignes de
     feuille de route qui pointent dessus ; et corriger le **BU** après coup
     ne doit pas écraser les PDC déjà révisés, que la création avait semés
     depuis lui.
  2. **Stockage des montants en USD au lieu de KUSD** (cohérence avec les
     fiches projet, contrats et commandes, tous à l'unité). C'est le lot
     lourd : ~10 fichiers, une **migration Firestore ×1000** sur les cycles,
     la cale et les arbitrages, plus `pdcRevises()` et
     `reconciliationBudgetaire.ts` qui comparent la navette à une feuille de
     route restée en milliers. Contrairement aux trois migrations existantes,
     celle-ci **n'est pas idempotente par nature** — relancée, elle
     multiplierait une seconde fois : elle exige un marqueur explicite par
     document. Et le seuil d'affichage demandé est ambigu (« plus de 5
     chiffres » = 100 000, mais « (en millions USD) » = 1 000 000), à lever
     avant d'écrire.

**Devise du système : la valeur par défaut et l'affichage remis d'accord
(21/08/2026, demande explicite « faire match la devise sélectionnée par défaut
avec celle qui s'affiche dans la page »)** — la refonte du 19/08/2026 avait
posé le principe (une seule devise affichée partout, celle du pivot) mais
laissé deux familles d'écarts, l'une dans les défauts de formulaire, l'autre
dans les libellés d'unité.
- **`lib/deviseParDefaut.ts` (nouveau)** : `useDeviseParDefaut()` pour les
  formulaires qui créent une donnée portant sa devise (ligne navette, fiche
  projet). Un `useState(pivot.code)` **ne suffit pas** et c'est la raison
  d'être du hook : `DevisesContext` lit le référentiel dans Firestore, donc
  `pivot` vaut d'abord celui des valeurs par défaut (USD) puis change quand la
  lecture aboutit — un initialiseur de `useState` fige cette première valeur,
  et ces modales sont **montées avec la page**, bien avant l'arrivée du
  référentiel. Le choix explicite est donc gardé à part : tant que rien n'est
  choisi, la valeur suit le pivot. Corrige au passage `NewNavetteLigneModal`,
  dont le `resetAndClose()` remettait `'USD'` **écrit en dur** après chaque
  création, et `NewProjectModal` / `LinkProjectModal`, qui partaient de
  `useState<Devise>('USD')`.
- **La modale de révision annonçait deux devises à la fois.** `ChampMontant`
  fait saisir dans la devise du système depuis le 19/08/2026, mais les
  affichages **en lecture seule** qui l'entourent rendaient leurs nombres
  bruts avec « K{ligne.devise} » écrit à la main : « Budget actuel (PDC02) en
  KUSD : 40000 » se retrouvait à côté d'un champ « Arbitrage » libellé KXAF,
  et la ligne de contrôle « Total réparti : 40000 / 40000 KUSD » contredisait
  les six champs qu'elle contrôle. Tous passent par `useMontant()` avec
  l'unité d'enregistrement de la ligne (`ArbitrageModal`,
  `RepartitionBudgetFields`). Le seul endroit où l'unité de stockage reste
  écrite est la mention « (ligne enregistrée en KUSD : 40000) » du bloc
  déficit — c'est précisément son objet.
- **Un montant déjà compté dans le pivot n'est pas un montant en dollars.**
  `sommeCycles()`, `pdcRevises()` et la cale convertissent déjà vers le pivot ;
  **cinq écrans libellaient pourtant leur résultat « KUSD » en dur**, ce qui le
  faisait reconvertir une seconde fois par `useMontant()` — un facteur ~547 sur
  un système en francs CFA, sur des chiffres justes avant l'affichage.
  Corrigés : `ValidationsEnAttente` (montant de la révision, et le « pioche …
  dans la cale »), `PdcCommentairesModal`, `ProjectsPage` (dernier PDC),
  `TableauDeBordPage` (budget actuel, réalisé YTD, tooltip et titre du
  graphique), plus `ProjectDetailPage` dont la table des cycles d'une ligne
  navette lisait « KUSD » là où `NavetteLigneDetailModal`, la **même table**,
  lisait déjà l'unité sur la ligne. Nouveau `uniteSysteme()` sur `useMontant()`
  pour nommer ce cas sans le recopier.
  - Le commentaire de `pdcRevises()` (types/navette.ts) disait « convertis en
    KUSD (pivot) » : c'est cette confusion que les appelants avaient reprise au
    pied de la lettre. Reformulé.
- **2 tests** (`lib/__tests__/montantAffiche.test.ts`, 211 au total) sur la
  partie pure : un montant dont l'unité est celle du système traverse
  `convertirPourAffichage` inchangé, et le même nombre libellé « KUSD » à tort
  en ressort multiplié par le taux — la régression est verrouillée par les
  deux côtés, pas seulement par le bon.
- **Laissé tel quel, volontairement** : les « KUSD » de la feuille de route et
  du contrat peinture sont justes — c'est l'unité d'enregistrement de ces
  classeurs (`UNITE_KUSD`), et `useMontant()` doit bien la convertir. Le repli
  `?? 'XAF'` du module EPCM aussi : c'est l'unité documentée de ses contrats
  fournisseurs, pas un défaut d'interface.

**Navette — corriger une ligne existante (21/08/2026, demande explicite « fais
la modification d'une navette à partir des informations rentrées »)** — le
premier des deux lots laissés ouverts par `doc/Navette commentaires.docx`
(« j'ai fait une erreur sur le titre du projet, sur l'année ou sur la valeur de
son budget »). Crayon « Modifier les informations » dans
`NavetteLigneDetailModal` → `components/navette/NavetteLigneEditModal.tsx`,
`updateLigne()` sur `NavetteContext`.
- **Le formulaire reprend les champs de la création** (`NewNavetteLigneModal`,
  préremplis), avec deux écarts : le **code OTP est en lecture seule** — il est
  l'identifiant du document Firestore (`idDocument(codeOTP)`), le changer
  serait créer une autre ligne et abandonner celle-ci avec tout ce qui pointe
  dessus (`projetId`, arbitrages, ligne de feuille de route) ; et la
  **rubrique de niveau 2** y est proposée alors que la création la fixe à GES
  sans la demander — le commentaire de `NewNavetteLigneModal` renvoyait
  justement ici depuis le 18/08/2026.
- **Corriger le BU ne réécrit jamais une révision.** À la création, le budget
  initial est semé à l'identique sur les 5 cycles de `CASCADE_CYCLES` : le
  corriger doit donc les corriger aussi, sinon la ligne resterait fausse
  partout sauf sur la première ligne de son tableau. Deux garde-fous, et non
  un seul (`cyclesSuivantLeBU`, types/navette.ts) : le cycle ne doit pas
  figurer dans `cyclesDejaRevises()` — **les arbitrages validés font foi**, y
  compris quand la révision a rendu par coïncidence le montant du BU — **et**
  sa valeur doit encore être exactement celle du BU, les 5 postes comparés
  (`memePeriode`), ce qui protège les **84 lignes reprises du classeur**, qui
  n'ont aucun arbitrage en base mais des cycles distincts les uns des autres.
  `cyclesDejaRevises()` reproduit la cascade de `appliquerArbitrage` : un visa
  sur PDC05 écrit aussi PDC09, PDC11 et BUN1.
  - **La règle est affichée avant l'enregistrement**, pas appliquée en
    silence : la modale nomme les cycles qui vont suivre et ceux qui restent
    inchangés parce que révisés.
  - Un BU inchangé n'est pas renvoyé au contexte — corriger un libellé ne
    réécrit pas les cycles avec leur propre valeur.
- **Réservé aux admins**, comme l'impose `firestore.rules` (`lignes_navette`
  est en `allow update: if estAdmin()`) : proposer le crayon à un agent ne
  produirait qu'un refus des règles. Aucune règle à déployer pour ce lot.
- Un champ facultatif vidé (champ/site, année) est **retiré** du document via
  `deleteField()` — ni `undefined`, que Firestore refuse, ni `null`, qui
  distinguerait mal « pas saisi » de « effacé » (même raisonnement que
  `sansIndefinis` à la création).
- **Bug préexistant corrigé au passage** : `NavettePage` gardait dans
  `selected` l'objet ligne capté au clic, jamais relu ensuite — la modale de
  détail affichait donc des valeurs périmées après toute écriture. Visible dès
  qu'on peut corriger une ligne, mais **déjà vrai du badge de statut** après
  une clôture depuis cette même modale. La ligne vivante est désormais relue
  par son id dans `lignes`.
- **10 tests** (`lib/__tests__/editionLigneNavette.test.ts`, 220 au total) sur
  les deux fonctions qui décident : cascade d'une révision validée, révision
  en attente ou refusée qui ne compte pas, révision d'une autre ligne, ligne
  jamais révisée (toute la cascade suit), révision qui coïncide avec le BU,
  ligne du classeur aux cycles distincts, et les réalisés jamais touchés.
- **Reste ouvert** : le second lot du document, la bascule du stockage KUSD →
  USD (voir l'entrée précédente — migration ×1000 non idempotente par nature,
  et seuil d'affichage à confirmer).

**Tout s'affiche en USD, à l'unité (21/08/2026, demande explicite « 1 KUSD =
1 000 USD, mais on va afficher USD partout »)** — le second lot de
`doc/Navette commentaires.docx` (« les contrats sont en USD, les commandes
aussi, donc pour une harmonisation correcte on va garder tout en USD »),
livré **sans migration de données**.
- **Un seul point de bascule** : `ECHELLE_AFFICHAGE` (`lib/montantAffiche.ts`).
  `convertirPourAffichage` ramenait la devise au pivot **en gardant l'échelle
  du module** ; elle ramène désormais aussi l'échelle à l'unité. Les ~121
  sites d'affichage n'ont rien eu à changer : ils passent déjà leur unité
  d'enregistrement (« KUSD ») à `montant()`, qui fait le reste. `uniteAffichee`
  suit — un en-tête « KUSD » au-dessus de cellules à l'unité serait le pire des
  deux mondes.
- **L'unité d'enregistrement ne bouge pas**, et c'est ce qui rend le lot sans
  risque : la navette et la feuille de route continuent d'écrire en milliers,
  l'échelle est appliquée au dernier moment comme la devise l'est déjà depuis
  le 19/08/2026. La migration ×1000 envisagée (entrée précédente) devient
  **inutile pour l'affichage** — elle ne servirait qu'à rendre les documents
  Firestore lisibles à l'œil nu, au prix d'une réécriture non idempotente de
  `lignes_navette`, `arbitrages_navette` et de la cale. Pas faite, pas
  nécessaire.
- **On tape à l'unité aussi** (`ChampMontant`) : un champ en milliers au milieu
  d'un écran qui n'en affiche plus serait le seul endroit où il faudrait
  diviser de tête. `memeUnite` (faut-il convertir ?) est désormais distinct de
  `memeDevise` (un **taux** est-il appliqué ?) — et la ligne « Enregistré : … »
  ne s'affiche que dans le second cas : taper 40 000 000 USD pour 40 000 KUSD
  enregistrés est une multiplication exacte, l'annoncer ne réintroduirait des
  KUSD à l'écran que pour dire un détail de stockage.
- Points qui ne passaient pas par ces deux briques, traités un par un : la
  **cale** de `IndicateursNavette` (gros chiffre éditable, pas un
  `ChampMontant` — mise à l'échelle à la main dans les deux sens), l'**unité
  d'en-tête** du tableau navette, et le **graphique** « Budget par cycle » du
  tableau de bord, dont l'axe Y rendait des milliers bruts sous un titre et une
  infobulle passés à l'unité.
- **La colonne « Total » retrouve son libellé** (retour utilisateur dans la
  foulée) : la devise l'avait remplacé le 18/08/2026, mais cette colonne nomme
  d'abord ce qu'elle contient — la somme CONSO + SERV + LOG + PERS + AUTRES.
  L'unité est annoncée **une seule fois**, dans la barre d'affichage
  (« 8 cycle(s) × 5 poste(s) · montants en USD ») ; une cellule ne la porte
  plus que si sa ligne n'a pas pu être convertie.
- **Deux défauts d'unité préexistants, sortis au grand jour et corrigés**
  (`components/feuilleDeRoute/colonnes.tsx`, colonnes déclarées `unite:
  'KUSD'`) :
  - `engagementKusd` / `factureKusd` n'appliquaient **que le taux** aux
    commandes d'une fiche, qui sont comptées **à l'unité** — 500 000 USD de
    commandes s'affichaient « 500 000 KUSD », soit 500 millions. **Facteur
    1 000**, sur toute ligne rattachée à une fiche.
  - `buKusd` / `pdc02Kusd` reprenaient les cycles de la ligne navette **sans
    convertir sa devise** : une ligne en euros alimentait ces colonnes en KEUR
    sous un en-tête en dollars.
- **4 tests de plus** (`lib/__tests__/uniteFeuilleDeRoute.test.ts`) sur ces
  deux corrections, et les tests d'affichage existants réécrits sur la nouvelle
  règle (`montantAffiche.test.ts`) — dont un nouveau cas : la mise à l'échelle
  a lieu **même quand le taux manque**, parce que c'est une multiplication et
  non une conversion. **225 tests au total.**
- Le tableau « Où les devises s'appliquent » (écran Devises) montre désormais
  son exemple converti même quand seule l'échelle change : c'est l'écran où
  l'on vient vérifier ce que font les autres, le laisser muet sur un facteur
  1 000 aurait été le rendre faux.

**Feuille de route — retours de `doc/feuille de route commentaire.docx`
(21/08/2026, « on fera le même process pour la page FeuilleDeRoutePage »)** :
- **Commentaire 1 déjà satisfait** : « renseigner les informations en USD et
  non KUSD… comme avec la feuille de navette » — c'est exactement ce que fait
  `ECHELLE_AFFICHAGE` depuis l'entrée précédente. Rien à refaire, l'unité
  d'enregistrement reste celle du classeur.
- **Bandeau à deux rangées** : ce que compte le portefeuille (projets, fiches
  rapprochées), puis ce qu'il pèse — **BU, PDC, Estimation, Engagement,
  Factures**, dans l'ordre du commentaire 7 et identique à celui des colonnes.
  BU et PDC manquaient, l'estimation était reléguée en sous-titre de
  l'engagement.
- **Le cycle PDC se choisit** (`feuilleDeRoute.cyclePdc`, préférence de poste) :
  « à cet emplacement, l'utilisateur devrait pouvoir choisir la PDC qu'il
  souhaite voir apparaître ». Le sélecteur commande **à la fois** la colonne et
  la tuile. `calculerLigne` prend le cycle en paramètre et lit
  `ligneNavette.cycles[cyclePdc]`. **Une ligne sans ligne navette ne montre sa
  valeur que sur PDC02** : le classeur ne porte que ce cycle-là
  (`pdc02_2026_kusd`), la resservir sous PDC05 ferait passer un chiffre pour ce
  qu'il n'est pas — la cellule rend un tiret et l'infobulle le dit.
- **Colonne FLAG** (absente du tableau alors que le champ existait) et
  **Réception scopes** repassent aux **repères visuels du classeur** — pastille
  🟢/🟠/🔴 au lieu d'une barre de progression — et se **saisissent par un
  menu d'états**, plus par un nombre. Le nombre reste le format enregistré :
  les lignes importées en portent un (100, 80…), et choisir un état écrit sa
  valeur repère (100 / 50 / 0). `etatIndicateur()` (types/feuilleDeRoute.ts)
  range **la tranche 1–50 % avec l'orange** — le document ne définit l'orange
  qu'au-dessus de 50 % et laisse ce creux sans couleur ; le mettre au rouge
  ferait passer un scope partiellement reçu pour un scope jamais reçu. Une
  valeur absente rend `null`, pas rouge.
- **Phase en cours enrichie** : `phasesEnCours()` (`lib/planning.ts`) rend
  **toutes** les phases entamées et non terminées **avec leur avancement**, là
  où `phaseActuelle` ne rendait qu'un nom. C'est la règle du document et son
  exemple : Étude 100 / Exécution 50 / Clôture 10 affiche « Exécution (50 %) »
  *et* « Clôture (10 %) ». Les deux bornes ne sont pas effacées — tout à 0 rend
  la première phase, tout à 100 la dernière.
- **Colonne Rubrique OPEX / CAPEX** (commentaire 6). La **ligne navette liée
  fait foi** (c'est elle qui porte `rubriqueNiv1`) ; le nouveau champ
  `ProjetFeuilleDeRoute.rubrique` ne sert qu'aux lignes qui n'en ont pas, sans
  quoi les deux modules pourraient se contredire sur la même affaire. Ajoutée
  aussi comme **critère de regroupement**.
- **Colonnes de coût réordonnées** : BU → PDC → Estimation → Engagement →
  Factures. Elles suivaient l'ordre d'ajout, avec BU et PDC bien plus loin,
  après la colonne WP. Groupes et préréglages du sélecteur suivent.
- **Trois filtres ajoutés** : **nom du projet**, chargé d'affaires (porté par
  la fiche projet rattachée — la ligne de feuille de route n'en a pas ; seuls
  les agents réellement porteurs d'une ligne sont proposés) et **type
  d'affaire WP / hors WP**. Le nom du chargé d'affaires entre aussi dans la
  recherche, à côté du projet, de l'OTP et du PO.
  - Le filtre par nom double la recherche, qui le couvrait déjà. Il a été
    ajouté sur demande explicite après coup, et l'usage diffère : un menu dit
    **quels** projets existent, ce qu'un champ de saisie ne fait pas — on y
    choisit sans connaître l'intitulé exact. Largeur bornée, les intitulés de
    cette feuille dépassant souvent 60 caractères.
- **Lien vers la navette** (commentaire 7) : des deux solutions du document, la
  **synchronisation était déjà en place** depuis le 13/08/2026 (BU et PDC d'une
  ligne rattachée sont relus sur la ligne navette à chaque affichage). Ce qui
  manquait était le raccourci — et surtout la cohérence du formulaire, qui
  laissait **saisir BU et PDC02 sur une ligne rattachée alors que la valeur
  saisie n'était jamais affichée**. Ces deux champs sont désormais désactivés
  dans ce cas, avec un renvoi « Corriger dans la navette » ; un bouton « Ouvrir
  la navette » est ajouté en tête de page (`onOpenNavette`, câblé dans
  `App.tsx`).
- **Regroupements** : les totaux par groupe portent maintenant les **cinq**
  montants dans le même ordre (BU et PDC manquaient).
- `usePreferenceAffichage` → **`usePreferenceSelection`** pour les colonnes :
  sans le catalogue, « Flag » et « Rubrique » n'apparaîtraient jamais chez qui
  a déjà ouvert l'écran (le piège du 18/08/2026, retombé ici).
- **Piège de lint retrouvé** : `PastilleIndicateur` vit dans son propre fichier
  — un module qui exporte composants **et** constantes casse le
  rafraîchissement à chaud. Et `export const CATALOGUE_COLONNES_FDR =
  COLONNES_FDR_DEFAUT` (un `const` en majuscules initialisé par un simple
  identifiant) était **pris pour un composant** par
  `react-refresh/only-export-components`, ce qui faisait échouer le lint sur
  tous les autres exports du fichier : le type est écrit explicitement.
- **10 tests de plus** (`lib/__tests__/feuilleDeRouteIndicateurs.test.ts`, 235
  au total) : les trois couleurs, la tranche 1–50 %, « jamais renseigné » vs
  « rien reçu », l'aller-retour menu ↔ valeur enregistrée, et les cinq cas de
  `phasesEnCours` (dont les deux exemples du document et la pondération par
  durée).
- **Modale de détail remise d'accord avec le tableau** (trouvé en repassant le
  document point par point) : elle lisait `p.bu26ServKusd` et
  `p.pdc02_2026_kusd` **directement sur la ligne**, alors que le tableau les
  relit sur la ligne navette rattachée depuis le 13/08/2026 — le même chiffre
  pouvait donc différer entre une ligne et la modale qui l'ouvre, dès qu'une
  révision était validée. Elle prend désormais les valeurs calculées
  (`buKusd`/`pdcKusd`), suit le cycle PDC choisi, affiche les deux indicateurs
  en pastille (le Flag y était un nombre brut) et porte la rubrique.
- **L'en-tête de la colonne PDC porte le cycle affiché** : son intitulé est
  générique dans la définition (il ne peut plus être écrit en dur depuis que le
  cycle se choisit), le tableau n'aurait sinon dit nulle part de quelle
  révision il parle.
- **Laissé de côté, faute d'énoncé** : « concernant le bouton *Nouveau projet*,
  son fonctionnement reste à préciser selon les besoins métier » — rien n'est
  changé. Et le filtre « nom du projet » demandé au commentaire 3 reste servi
  par la **recherche** (qui le couvre déjà) plutôt que par un menu déroulant de
  84 intitulés.
- **Écart assumé avec le document** : il propose de garder l'**affichage en
  KUSD** (« comme avec la feuille de navette »). L'instruction du même jour,
  postérieure, dit « on va afficher USD partout » — c'est elle qui est
  appliquée, ici comme partout ailleurs. Et « renseigner les informations en
  USD » vaut pour la **saisie** (faite) ; le **stockage** reste en milliers,
  cf. l'entrée précédente : la migration ×1000 n'apporterait plus rien à
  l'écran.

**`doc/PROJET.docx` — lot 1, les points sans arbitrage (22/08/2026, « on va
aller du plus simple au plus complexe, en vérifiant ce qui est déjà fait »)**.
Le document est un retour de recette en trois blocs : page Projets / fiche
projet, Feuille de route, et une refonte de la partie Planning / Courbe en S.
Les commentaires sur la page Projets (colonnes Estimation + Engagement après
PDC, colonne Service client retirée, tuiles BU et PDC), la Présentation
éditable avec la mitigation qui suit les risques, et les références (1 OT → n
avis, plateformes multiples, champ limité à AGM/TRM/IM, comptes OTP
multiples) étaient **déjà faits** le même jour. Ce lot traite les quatre
points restants qui ne demandaient aucune décision métier :
- **« Reste à facturer » retiré** de la modale de détail de la feuille de
  route (demande explicite). Les deux taux restent : le taux de facturation
  affiché y suit déjà la formule du document (facturé / commandes).
- **« Hors Work Program »** affiché quand `wp = NON` — rien ne l'était, et
  l'absence de badge se confondait avec l'absence d'information. **Trois
  états, pas deux** : sur les 84 lignes réelles, 44 sont à OUI, 20 à NON et
  **20 n'ont aucune valeur** ; ces dernières restent sans badge plutôt que
  d'être déclarées hors Work Program, ce que rien ne dit.
- **Type 4 — Construction (EPC) par défaut** sur toute tâche créée depuis
  l'application (`COURBE_TYPE_DEFAUT`, types/courbeEnS.ts), appliqué aux
  **trois** points de création : `createDefaultPlanning` (les 7 tâches d'une
  fiche neuve), `addTacheBaseline` et `ajouterPhaseSuivi` — et sur les 3 vues,
  le gabarit faisant partie de l'identité de la tâche. Les tâches **importées**
  gardent leur colonne d'origine, y compris vide. Ce n'est pas un confort de
  saisie : sans gabarit la courbe d'une tâche est un escalier (0 % jusqu'à la
  veille de la fin, 100 % le jour de la fin — la formule du classeur teste les
  dates avant d'aller chercher le gabarit).
- **Colonne « Création d'une fiche projet » → « Fiche projet »**, avec
  l'action portée par la cellule. Le document demande « Modification d'une
  fiche projet », mais sous condition (« si tel est bien le cas ») : en
  réalité la colonne fait les deux selon l'état de la ligne, et **76 des 85
  lignes n'ont aucune fiche**, où le lien crée bel et bien. Un en-tête ne peut
  pas varier d'une ligne à l'autre — renommer sec aurait déplacé
  l'incohérence signalée au lieu de la lever. La cellule dit donc l'action :
  « Créer une fiche projet » sans fiche, « Modifier la fiche » avec. **Le
  badge de liaison devient cliquable** au passage : il ne l'était nulle part,
  si bien qu'aucune cellule de cette colonne ne modifiait quoi que ce soit —
  exactement ce que son intitulé promettait. À rediscuter au lot 2, qui doit
  décider si la création disparaît d'ici (comme elle disparaît de l'œil) ;
  l'en-tête deviendra alors littéralement celui du document.
  - `ColonneFdr` gagne un `texte?` (même échappatoire que `ColonneTableau`) :
    sans lui, l'extraction sortait « Nom du projet Modifier la fiche » — le
    libellé d'un bouton n'a rien à faire dans un fichier.
- **4 tests** (`courbeEnSDepuisPlanning.test.ts`, 252 au total). Les trois
  tests qui décrivaient le cas « sans gabarit » s'appuyaient sur
  `createDefaultPlanning` et **échouaient** une fois le défaut posé : le
  fixture devient explicite (`sansGabarit()`, l'état des tâches importées) et
  un test verrouille le défaut sur les 3 vues.
- **Restent ouverts** (lots suivants, non commencés) : retirer la création de
  fiche depuis l'œil, taux d'engagement avec choix de la référence BU ↔ PDC,
  sélecteur de version PDC sur la fiche projet, verrouillage des dates du
  Réalisé, réorganisation du menu Planning en 3 sous-menus (Gestion des
  phases d'abord), engagement non modifiable depuis la ligne de feuille de
  route, Forecast entièrement hérité de la Baseline. Puis le lot lourd :
  **source du budget de la Baseline** (initial ↔ PDC) et pondérations
  calculées — **bloqué faute de la règle de calcul de la pondération**, que le
  document ne donne pas (il renvoie à la feuille « Data courbe en S », absente
  du .docx) ; l'application pondère aujourd'hui **par la durée**, alors que le
  classeur affiche 30/24/8/3/1/6 % sur des tâches de durées voisines. Et
  l'**historisation du Réalisé semaine par semaine**, sans quoi sa courbe
  restera un point là où le classeur en trace dix.

**`doc/PROJET.docx` — lot 2, la Feuille de route et le Réalisé (22/08/2026,
« on y va, on va retirer l'œil sur ligne »)** :
- **L'œil de la ligne est retiré** : la ligne entière ouvrait déjà le détail
  au clic, l'icône faisait double emploi et mangeait de la largeur dans la
  seule colonne figée. C'est le **nom du projet** qui devient le bouton — un
  `<tr onClick>` n'est pas atteignable au clavier et l'œil était le seul point
  focalisable de la ligne : le supprimer sans le remplacer aurait rendu le
  détail inaccessible autrement qu'à la souris.
- **Plus de création de fiche depuis le détail** (« nous sommes déjà dans une
  fiche projet […] permettre uniquement la consultation et la modification ») :
  le bouton disparaît de la modale, `onCreerFiche` avec lui. La création reste
  là où elle a un sens — la colonne « Fiche projet » du tableau et le bouton
  « Nouveau projet » — et le message du cas non lié le dit, sans quoi l'écran
  ne dirait plus nulle part comment rattacher la ligne.
- **Taux d'engagement, avec sa référence au choix** (il n'existait pas) :
  engagement / budget, le budget étant **le BU initial ou la révision PDC
  affichée**, au choix — « selon la période de l'année et l'indicateur que
  l'on souhaite mettre en avant ». Le choix est gardé d'une ouverture à
  l'autre (`feuilleDeRoute.referenceEngagement`, localStorage, comme le cycle
  PDC de la page). **Pas de repli sur l'autre référence** quand celle choisie
  manque : un taux dont on ne sait plus par rapport à quoi il est calculé ne
  vaut rien — la barre reste vide et l'écran dit pourquoi.
  - Le **taux de facturation existait déjà et suivait déjà la formule du
    document** (facturé / commandes) ; il gagne juste la mention de son
    dénominateur. Les deux taux lisent maintenant le **même** engagement que
    celui affiché deux lignes au-dessus (commandes de la fiche, sinon montant
    PO) : deux nombres différents pour le même mot sur un même écran, c'est ce
    qui rend un indicateur inutilisable.
- **Version de PDC choisie dans la modale « Modifier le projet »**
  (`montantsPdcNavette`, colonnes.tsx) : le champ « PDC02-2026 » y était figé.
  Dès que la ligne suit la navette, c'est elle qui fait foi — et elle porte
  **quatre** révisions : le champ devient un menu de version + le montant en
  lecture seule, dans la devise pivot. **Une ligne sans ligne navette garde le
  champ PDC02 saisissable** : le classeur ne porte que cette colonne-là, la
  resservir sous un autre cycle ferait passer un chiffre pour ce qu'il n'est
  pas (même règle que `calculerLigne` depuis le 21/08/2026).
- **Réalisé : les dates ne sont plus saisissables** (« la seule information à
  renseigner ici c'est le pourcentage réel »). Écart assumé avec le CDS, dont
  la description de la vue disait « dates réelles » — le document est
  postérieur. `updateReelTacheDates` reste exposé par `ProjectsContext` mais
  n'est plus appelé : l'écriture existe si la saisie des dates réelles
  revient. Un écart de délai se lit dans le Forecast, qui est fait pour ça.
- `ColonneFdr.texte` sert aussi à la colonne d'identité, dont le rendu est
  désormais un bouton.
- **4 tests** (`lib/__tests__/pdcFeuilleDeRoute.test.ts`, 256 au total) sur la
  seule partie pure du lot : les 4 révisions rendues, l'absence de menu sans
  ligne navette (et sur une ligne navette disparue), et la conversion de
  devise.
- **Reste ouvert du document** : réorganisation du menu Planning en 3
  sous-menus (Gestion des phases d'abord), engagement non modifiable depuis la
  ligne de feuille de route et cumul systématique des commandes, Forecast
  entièrement hérité de la Baseline — puis le lot lourd (source du budget de
  la Baseline, pondérations calculées, historisation du Réalisé), toujours
  **bloqué faute de la règle de pondération**, que le document ne donne pas.

**`doc/PROJET.docx` — lot 3, le Planning (22/08/2026)** :
- **Le menu Planning prend ses 3 sous-menus** : Gestion des phases → Suivi du
  planning (Baseline / Forecast / Réalisé, la bascule existante) → Courbe.
  « Gestion des phases » était jusqu'ici un onglet **frère** du Planning, et
  **après** lui dans la barre. L'ordre du document porte une règle de gestion :
  « on commence toujours par créer les phases et les tâches du projet […] le
  suivi ne doit donc jamais être renseigné indépendamment de la gestion des
  phases » — d'où sa place en premier **et** par défaut à l'ouverture de
  l'onglet. `SuiviTab` est monté tel quel dans `PlanningView` : la fiche passe
  de 10 à 9 onglets, rien n'est réécrit.
- **L'engagement d'une ligne rattachée ne se saisit plus** (« il ne devrait pas
  être possible de modifier directement le montant total des commandes depuis
  la fiche projet ; la modification doit être effectuée au niveau des numéros
  de commandes rattachés au contrat ») : dès qu'une fiche est résolue, le champ
  « Engagement (PO) » de la modale « Modifier le projet » devient le **cumul de
  ses commandes**, en lecture, avec le nombre de commandes, le nom de la fiche
  et un lien vers elle. Ce n'est pas une perte : la valeur saisie **n'était
  déjà plus affichée nulle part** dans ce cas — le tableau comme la modale de
  détail lisent le cumul des commandes dès qu'une fiche est rattachée
  (`calculerLigne`). Une ligne **sans** fiche garde son champ saisissable :
  c'est alors la seule source du montant.
- **Le Forecast hérite de la Baseline, sauf ses dates** (`forecastHerite`,
  lib/planning.ts) — « il reprend les mêmes phases, les mêmes sous-phases, les
  mêmes pondérations, les mêmes types de S-Curve, les mêmes budgets […] tout le
  reste doit être verrouillé ou automatiquement repris depuis la Baseline ».
  - **L'héritage se fait à la lecture, pas par recopie à l'écriture** : une
    copie posée au moment de la modification redeviendrait fausse au premier
    champ de la baseline qu'un écran laisserait modifier sans y penser. Ici la
    question ne se pose plus. Appliqué aux deux endroits qui lisent le forecast
    — le tableau du planning et `activitesDepuisPlanning` (sans quoi la courbe
    Forecast tracerait le même travail selon un autre gabarit que la Baseline).
  - Restent propres au forecast : ses deux dates, la durée qui en découle et
    l'avancement qu'elles calculent. Une tâche présente au forecast mais absente
    de la baseline est **laissée telle quelle** — impossible depuis
    l'application (les 3 vues partagent leurs identifiants), mais un import
    pourrait en produire, et l'écarter la ferait disparaître de l'écran.
- **4 tests** (`planning.test.ts`, 260 au total) : héritage de tout ce qui
  n'est pas une date, conservation des dates/durée/avancement du forecast,
  baseline non modifiée, tâche orpheline intacte.
- **La « Courbe en S » quitte la fiche pour devenir le 3ᵉ sous-menu du
  Planning** (demande explicite dans la foulée : « la présentation de la courbe
  dans cet onglet, mets-le dans l'onglet courbe en S dans le planning ») — la
  fiche passe de 9 à 8 onglets. Elle rejoint ce dont elle dépend : les dates du
  planning et la colonne « Typical S-curve » qui la nourrissent sont dans le
  sous-menu voisin.
  - **`CourbeDuPlanning` est supprimé, pas fusionné** : ce composant local
    traçait la même `ProgressionTab` mais sur les seules activités dérivées du
    planning, là où `CourbeSTab` passe par `useCourbeEnSProjet` (activités du
    classeur KPI_ICP quand le projet y est rattaché, planning sinon). Garder
    les deux aurait redonné deux tracés pour un même projet — exactement ce que
    le 20/08/2026 avait évité. Ses deux mentions utiles sont reprises : le
    relevé Réalisé unique daté de la semaine en cours (affiché seulement quand
    la source est le planning) et l'avertissement sur les tâches sans courbe
    type, déjà présent sous le tableau des tâches.
  - **Le chargement à la demande est conservé** : `CourbeSTab` est relazyfié
    depuis `PlanningView` (chunk de 23 ko, 9 ko gzip) — les deux autres
    sous-menus du Planning n'ont pas à traîner les 3 feuilles d'activités et
    les 5 gabarits du classeur.
- **Reste du document** : le lot lourd de la Baseline (source du budget
  initial ↔ PDC, colonnes calculées, historisation du Réalisé semaine par
  semaine, courbe consolidée multi-projets), **toujours bloqué faute de la
  règle de pondération** — le document renvoie aux « explications de la feuille
  data courbe en S », qui n'est pas jointe. L'application pondère par la durée
  là où le classeur affiche 30/24/8/3/1/6 % sur des tâches de durées voisines.

**`KPI_ICP_30062026 -.xlsm` — le classeur de production relu, et l'allure de
la courbe corrigée (22/08/2026, « utilise ce fichier », puis « l'allure de la
courbe n'est pas conforme, vérifie bien comment c'est fait dans le fichier »)**.
Ce fichier lève le blocage du lot 4 : la règle de pondération que
`doc/PROJET.docx` ne donnait pas est dans ses formules.
- **Ce que le classeur calcule** (feuille « Projet_Baseline Actualisé ») :
  `Duation (d) = End − Start + 1` · `Pondération = durée / SOMME(durées de la
  feuille)` · `Pondération par phase = durée / SOMME.SI(même projet ; durées)`
  · `BU / Phase = Budget × Pondération` · colonnes hebdo = le RECHERCHEH dans
  « typical S curve » déjà implémenté. **La pondération est donc bien la durée**
  — ce que l'application faisait déjà. La réserve inscrite ici les jours
  précédents (« le classeur affiche 30/24/8/3/1/6 % sur des tâches de durées
  voisines ») était une supposition non vérifiée : ces tâches ont des durées
  très différentes, et les deux colonnes leur sont proportionnelles.
- **Vérifié, pas supposé** : `lib/__tests__/baselineKpiIcp.test.ts` rejoue le
  moteur sur la feuille du fichier — **59 activités, 9 projets, 118
  pondérations, 59 BU/Phase et 3 127 cellules hebdomadaires : 0 écart**. La
  fixture porte les valeurs calculées par Excel (`fixtures/
  baselineKpi30062026.json`), c'est le classeur qui juge.
- **L'allure de la courbe était fausse, et c'est corrigé** (`fenetreProjet`) :
  la fenêtre tracée ne rognait que l'amorce et gardait **les 53 semaines de
  l'axe**, si bien que la montée d'un chantier de six semaines occupait un
  huitième du graphique, suivie de 45 semaines de trait plat. Les 5 blocs de
  `Progress_Curve` et les plages que leurs graphiques tracent réellement
  montrent l'inverse : 16, 18, 30, 30 et 20 périodes, s'arrêtant **0 à 4
  périodes après le dernier mouvement** de la dernière série. La fenêtre s'y
  arrête désormais, marge 4 — celle du bloc de référence, dont le graphique est
  reproduit à l'identique (16 périodes, dont 10 à 100 %). C'est la moitié de
  cette lecture qui manquait le 14/08/2026 : le plateau fait partie de
  l'allure, mais **un plateau borné**.
  - Le tracé lui-même était déjà conforme : segments droits, aucun marqueur —
    `smooth val="0"`, `symbol val="none"` dans les 13 graphiques du fichier.
- **Colonnes calculées du tableau du planning** : durée, pondération et
  BU/Phase ne sont plus lues sur la tâche mais recalculées à l'affichage. « N°
  Ordre » disparaît — le document la donne pour ce qu'elle est, « une solution
  de contournement propre à Excel ». Et **une seule colonne de pondération** :
  la feuille du classeur mélange 9 projets, donc ses deux colonnes diffèrent ;
  le planning d'une fiche n'en porte qu'un, où elles sont égales — « si un seul
  projet est sélectionné : utiliser la pondération par phase ».
- **Le budget ne se saisit plus** (`Projet.sourceBudgetCourbe`,
  `definirSourceBudgetCourbe`) : on choisit sa **source** — budget initial ou
  l'une des 4 révisions PDC — et le montant est relu sur la ligne navette
  rattachée, comme le `XLOOKUP(Projet ; Coût[PROJET] ; Coût[CP PDC 02])` de la
  feuille. C'est le **coût prévisionnel** du cycle : `coutPrevisionnel()` =
  **services + consommables**, la colonne « CP … » du classeur, et non le total
  des cinq postes que la navette additionne ailleurs.
  - **Écart assumé avec le document** : il annonce que le budget « est utilisé
    pour tous les calculs de pondération et d'avancement ». C'est faux dans le
    classeur — les pondérations sont des durées et l'avancement un RECHERCHEH ;
    le budget n'alimente que la colonne BU/Phase. Rien n'a donc été branché sur
    des calculs qui ne l'utilisent pas.
  - **Non reproduit, volontairement** : la colonne `CP PDC 02` du classeur
    porte un `*1000` que `CP PDC 05/09/11` n'ont pas, sur des postes déjà
    comptés à l'unité — elle rend 100 000 000 là où `CP PDC 05` rend 100 000
    sur la même ligne. C'est une erreur de la feuille.
- **Le Réalisé est historisé semaine par semaine** (`Tache.realiseHebdo`,
  `saisirAvancementHebdo`, `dernierReleve`) : la feuille « Projet_Réalisé
  Actualisé » fait saisir le pointage **dans la cellule de sa semaine**
  (0,05 · 0,15 · 0,45 · 0,65…) et sa colonne « % » n'est qu'un
  `RECHERCHE(2;1/(plage<>"");plage)` — le dernier relevé non vide. La fiche ne
  gardait qu'un chiffre par tâche : sa courbe Réalisé était un point, là où le
  classeur en trace dix. L'écran ne reproduit pas les 53 colonnes — on choisit
  **la semaine pointée** en tête de la vue, et chaque ligne saisit la sienne.
  `avancement` reste écrit mais devient dérivé (dernier relevé), pour que tout
  ce qui le lit déjà — fiche, cartes de phase, feuille de route — continue de
  fonctionner sans migration. Vider une case efface le relevé de la semaine :
  une cellule vidée ne vaut pas zéro.
- **12 tests de plus** (267 au total) : la feuille Baseline rejouée (5),
  `dernierReleve` (4), l'axe et les relevés hebdo (4 dans
  `courbeEnSDepuisPlanning.test.ts`), la fenêtre bornée (2) — dont le nombre de
  périodes du graphique de référence, verrouillé à 16.
- **Présentation de `Progress_Curve` reproduite** (demande explicite dans la
  foulée : « regarde la feuille Progress_Curve dans le fichier, reproduis la
  présentation fidèlement »), relevée dans la feuille **et** dans
  `xl/charts/chart17.xml` :
  - **Graphique** : 3 courbes dans l'ordre Baseline · Réalisé · Forecast, aux
    couleurs du thème Office que le classeur leur donne (accent2 orange,
    accent1 bleu, accent3 gris), traits pleins de 1,75 pt, **aucun marqueur,
    aucun lissage**, légende en haut, axe des valeurs **0 → 120 %** au format
    `0%`, dates de période en étiquettes **verticales** (rot -5400000), et
    **aucun quadrillage** — ni sur l'axe des valeurs ni sur celui des dates.
    Les **étiquettes de données ne sont posées que sur la série Réalisé**
    (`showVal val="1"` sur elle seule) : c'est la courbe qu'on vient lire.
  - **L'histogramme « Monthly effort % » est retiré** : c'était une invention
    de l'application. Aucun des 103 graphiques du classeur ne lit les colonnes
    K/L/M — elles vivent dans le **tableau** de la feuille, et y restent.
  - **Tableau** aligné sur la feuille : bloc d'identification Période ·
    Semaine · **Date de Cut-Off** (nouvelle, `mmm yy`, la fin du mois de la
    période — le classeur la saisit à la main et s'y trompe, ses lignes de
    mars 2026 portent « 2023-03-30 » : elle est calculée ici), puis les deux
    en-têtes fusionnés du classeur, **« Cumulative % »** (Baseline · Réalisé ·
    Forecast · Delta, dans cet ordre — le réalisé au milieu, entre le plan de
    référence et le plan révisé) et **« Monthly effort  % »** (planned ·
    forecast · actual). Les formats de nombre sont ceux des cellules : 0 %
    pour les cumuls, 0,00 % pour le Delta et les efforts, 0,0 % pour l'effort
    forecast ; les colonnes que la feuille met en gras le sont aussi.
    `TableauColonnes` gagne pour ça une propriété `groupes` (bandeau d'en-tête
    au-dessus des colonnes), utilisable par les autres modules.
  - **Bandeau** dans l'ordre et les intitulés de K2:L5 : Jours restants ·
    Prévisionnel · Réalisé · Retard. Le titre « PROGRESS CURVE » et le nom du
    projet coiffent le graphique, comme P1 et le bloc fusionné Q2:AC2.
  - Seul écart conservé, celui du 20/08/2026 : « Prévisionnel » vaut la
    baseline **au dernier pointage** et non la dernière valeur de la colonne,
    qui vaut toujours 100 % et n'apprend rien. La tuile le dit.
  - **Trois raisons pour lesquelles l'écran ne montrait qu'une courbe**, toutes
    corrigées après un retour utilisateur (« il manque baseline, réalisé »,
    puis « chaque phase a une courbe : regarde le modèle des courbes dans le
    paramétrage en fonction du type associé dans les plannings ») :
    1. **Aucune tâche déjà en base ne porte de courbe type** — la colonne ne se
       choisit que depuis le 22/08/2026, et le défaut Type 4 ne vaut que pour
       les tâches créées après. `activitesDepuisPlanning` applique donc
       `COURBE_TYPE_DEFAUT` **à la lecture** : sans lui, `avancementPlanifie`
       rend 0 entre les dates (le #N/A du RECHERCHEH) et toutes ces fiches
       traçaient un escalier — 0 % jusqu'à la veille de la fin, puis 100 % —
       au lieu de l'allure du modèle. Chaque phase suit maintenant la courbe
       type retenue dans son planning, lue dans les 5 modèles du paramétrage.
       Les activités **reprises du classeur** ne passent pas par là et gardent
       leur colonne d'origine, y compris vide : le moteur reste fidèle à Excel.
    2. **Le Forecast recouvrait la Baseline** : il en hérite tout sauf ses
       dates, donc tant qu'aucune n'a été révisée les deux séries sont
       identiques — et la dernière tracée efface la première. Une série
       confondue avec une précédente est désormais en pointillé, et la légende
       le dit (« confondu avec Baseline ») plutôt que de laisser croire à une
       courbe absente.
    3. **Un relevé Réalisé isolé n'était pas tracé** (un point ne fait pas un
       segment) — c'est pourtant l'état d'une fiche qui commence à pointer.
       Il est rendu par un marqueur. Le classeur ne tranche pas ce cas : ses
       graphiques n'ont jamais de relevé seul.
  - **2 tests remplacent l'invariant « escalier sans gabarit »** : le défaut
    Type 4 appliqué à la conversion d'un planning, et l'escalier conservé pour
    une activité du classeur sans gabarit (268 tests).
- **Reste ouvert** : la courbe consolidée multi-projets (pondération globale,
  colonne T) — la règle est connue et implémentée (`calculsActivite`), mais
  aucun écran ne propose de tracer plusieurs projets ensemble ; et l'axe d'une
  fiche part du premier début de **son** planning, là où le classeur part du
  premier début de la feuille entière (décalage d'au plus 6 jours sur la
  grille, sans effet sur l'allure).

**Chaîne Navette → Feuille de route → Fiche projet : rapprochement de
l'existant (23/08/2026, demande explicite « vérifie en partant de la navette à
feuille de route et projet, je veux lier tous les projets qui sont dans la
feuille de route en fonction de la navette, tout ce qui est dans les projets
sera lié à la feuille de route »)**.
- **Ce que la vérification a trouvé** : les deux liens structurants
  (`ProjetFeuilleDeRoute.ligneNavetteId` et `.projetId`) n'étaient posés qu'à
  **un seul endroit** — `FeuilleDeRouteContext.synchroniserDepuisNavette()`,
  appelé quand on crée une fiche projet depuis la navette. Les 84 lignes de
  feuille de route et les lignes navette reprises des classeurs n'ont jamais
  traversé ce chemin : **aucun rattrapage n'existait**. Conséquence concrète,
  et pas seulement cosmétique : `calculerLigne` ne relit BU et PDC sur la
  navette que s'il y a un `ligneNavetteId` — sans lui, la feuille de route
  reste figée sur la valeur du classeur, y compris après une révision validée
  (c'est exactement le défaut corrigé le 13/08/2026, qui ne pouvait profiter
  qu'aux lignes déjà rattachées).
- **`lib/rapprochementPortefeuille.ts` (nouveau, pur)** : `rapprocherPortefeuille()`
  propose, ligne par ligne, la ligne navette (lien déjà posé → code OTP /
  compte d'imputation → même fiche projet → intitulé) puis la fiche projet
  (lien déjà posé → celle de la ligne navette → cascade `lib/liaison.ts`), plus
  le retour manquant : la ligne navette reçoit la fiche que la feuille de route
  connaît. Deux principes repris des migrations : **un lien déjà posé n'est
  jamais réécrit** (relancer ne change rien, même s'il pointe ailleurs que ce
  que le rapprochement proposerait) et **une ambiguïté n'est jamais tranchée**
  — deux lignes navette candidates, rien n'est écrit, la ligne est listée à
  part. Les libellés navette sont comparés **préfixe de champ retiré**
  (« AGM: … » sur 62 des 102 lignes mesurées) ; une fiche projet qui n'existe
  plus n'est pas propagée.
- **Écran** : section en tête de `RapprochementPage` (admin), pas une carte de
  Paramètres › Maintenance — les trois collections sont déjà chargées par leurs
  contextes, donc **pas de bouton « Analyser »** : le décompte est permanent et
  se met à jour tout seul, seule l'application écrit. Écritures par lots de 400
  (`enLots`), relecture des deux contextes ensuite (`remplacerProjets`,
  `rechargerLignes`) — sans quoi l'écran continuerait d'afficher les mêmes
  lignes à lier.
- **Créer une ligne de feuille de route par fiche projet orpheline est une
  case à cocher séparée** : rattacher des lignes existantes ne crée rien,
  ajouter une ligne par fiche fait grossir la feuille de route — les deux
  gestes n'ont pas la même portée. La ligne créée ne reprend que ce que la
  fiche porte réellement (intitulé, dates, OTP, champ, WP) et, quand la fiche a
  une ligne navette, son BU et son PDC ; **aucune colonne de saisie n'est
  inventée** (catégorie, priorité, statut, flag restent vides).
- **Deux défauts corrigés au passage**, tous deux invisibles jusqu'ici parce
  que le chemin qui les portait était peu emprunté :
  - `synchroniserDepuisNavette` cherchait la ligne existante par **égalité
    brute de chaînes** sur l'OTP (`p.otp === ligne.codeOTP`) : une imputation
    qui ne différait que par la casse ou une espace — ou absente — faisait
    **créer un doublon** au lieu de mettre à jour. Elle passe par les mêmes
    clés normalisées que le rapprochement (lien explicite → OTP → fiche →
    intitulé).
  - Créer une fiche projet **depuis la feuille de route** ne posait que
    `projetId` : la ligne navette de la même affaire restait « non liée » et la
    ligne de feuille de route sans `ligneNavetteId`, donc sans suivre les
    révisions. Le geste complète désormais la chaîne, avec exactement les
    règles du rapprochement en lot (un seul candidat ou rien). Le bouton étant
    déjà réservé aux admins, l'écriture sur `lignes_navette` (`allow update: if
    estAdmin()`) est légitime.
- **Le mappage ligne navette + fiche → colonnes de feuille de route est
  désormais partagé** (`champsFdrDepuisNavette`) : le contexte en portait sa
  propre copie, et le rapprochement devait justement pouvoir la reproduire à
  l'identique.
- **Aucune règle `firestore.rules` à déployer** pour ce lot : il n'écrit que
  dans `feuille_de_route` et `lignes_navette`, déjà couvertes.
- **17 tests** (`lib/__tests__/rapprochementPortefeuille.test.ts`, 285 au
  total) sur la partie qui décide : rattachement par OTP puis par intitulé
  (préfixe retiré), refus d'écrire sur ambiguïté, lien déjà posé jamais
  réécrit, fiche héritée de la navette, fiche disparue ignorée, cascade
  appelée en dernier recours seulement, retour vers la ligne navette, relance
  sans effet, et les identifiants distincts des lignes créées dans un même lot
  (l'horodatage seul les aurait fait s'écraser dans le même document).

- **Objectif 100 %, dans la foulée (23/08/2026, précision de l'utilisateur :
  « tout ce qui se trouve dans feuille de route doit être rapproché avec ce
  qui est dans navette, vu que pour avoir un item dans feuille de route elle
  doit provenir de la navette »)**. La règle métier change la cible : ce qui
  n'est pas rapproché automatiquement n'est pas une ligne sans origine, c'est
  un intitulé à trancher. Trois ajouts, aucun n'assouplit la règle « le flou
  n'est jamais automatique » :
  - **Ambiguïté levée quand deux critères concordent** : plusieurs lignes
    navette portent le même intitulé, mais une seule porte aussi l'imputation
    de la ligne de feuille de route → elle est retenue. Le rapprochement ne
    descend toujours pas au critère suivant pour départager, il ne retient que
    l'intersection.
  - **Suggestions floues vers la navette** (`suggestionsNavette`) — même mesure
    que `Resolveur.suggerer` (Jaccard sur les tokens significatifs, même seuil
    de 0,5), et **même garde-fou de champ** : deux affaires de même intitulé
    sur deux champs différents sont deux affaires distinctes (§2.3).
  - **Rattachement à la main, ligne par ligne** (`rattacherLigneFdr`) : menu
    proposant d'abord les intitulés proches avec leur score, puis toute la
    navette. La fiche projet suit dans le même geste quand l'un des deux côtés
    la connaît et l'autre non — c'est le seul moment où les deux sont sous les
    yeux. Un lien déjà posé n'est jamais réécrit, ici non plus.
  - L'écran porte une **barre de couverture** (n / total rattachées) : la cible
    étant 100 %, le reste à traiter doit se lire sans compter.
  - **5 tests de plus** (22 sur ce module, 290 au total) : ambiguïté levée par
    un second critère, suggestion proposée mais jamais appliquée, champ
    différent qui écarte une candidate, candidates d'une ambiguïté rendues
    comme suggestions, et absence de suggestion pour une ligne déjà rapprochée.

**Navette — le CP suit la version de référence choisie (23/08/2026, demande
explicite : « le montant du CP dépend du référentiel sélectionné […] merci
d'ajouter un menu déroulant permettant à l'utilisateur de sélectionner la
version de référence (BU ou PDC) »)** : la tuile « CP total » du bandeau porte
désormais son sélecteur dans son libellé, comme la tuile PDC porte son cycle
depuis le 21/08/2026 — BU initial (défaut) ou l'une des 4 révisions PDC
(`REFERENCES_CP`), préférence de poste `navette.referenceCp`.
- **Ce qui était faux** : le CP était calculé par `revisionActuelle()`, qui
  choisit le cycle toute seule (dernier PDC non nul, sinon BU). Le bandeau
  pouvait donc afficher un CP calculé sur PDC05 à côté d'un tableau et d'une
  tuile réglés sur le BU, sans que rien ne le dise — exactement l'incohérence
  signalée. `revisionActuelle` reste utilisée là où aucun cycle n'est affiché
  à côté (`TableauDeBordPage`, « Budget actuel »).
- **Défaut au BU initial** et non « révision actuelle » : c'est le seul
  référentiel dont chaque ligne porte toujours un montant, et le seul qui ne
  dépende d'aucune révision. Garder l'ancien choix automatique comme option
  aurait reconduit l'ambiguïté que la demande vient lever.
- `cpCumule()` / `lignesAvecCp()` (types/navette.ts) : le calcul quitte la
  page pour rejoindre `coutPrevisionnel()` (SERV + CONSO, déjà utilisé par la
  courbe en S), avec la conversion depuis la devise de chaque ligne. La tuile
  affiche aussi **combien de lignes portent un CP sur ce cycle** — un cumul à
  0 ne dit pas si le cycle est vide partout ou si les montants s'annulent
  (même raison que la tuile PDC).
- **6 tests** (`lib/__tests__/cpNavette.test.ts`, 296 au total) : SERV + CONSO
  seuls (log/pers/autres exclus), montant qui change avec la référence,
  divergence assumée avec `revisionActuelle`, conversion de devise, décompte
  des lignes portantes.

**Navette — la modification d'une ligne demande exactement ce que sa création
demande (23/08/2026, demande explicite « la modification d'une navette doit
être comme lors de la création, remplace programme par type projet »)** :
- **Le menu « Programme » quitte `NavetteLigneEditModal`** : c'était le seul
  champ que la création ne demandait pas (elle fixe `rubriqueNiv2` à GES depuis
  le 18/08/2026), donc le seul par lequel les deux formulaires divergeaient. La
  valeur reste portée par la ligne et **réenregistrée telle quelle** — la
  retirer du formulaire ne l'efface pas. Conséquence assumée et notée dans les
  deux fichiers : `rubriqueNiv2` n'est plus modifiable nulle part dans
  l'application ; les lignes du classeur gardent la leur, celles créées depuis
  l'app restent sur GES. Il ne reste qu'un écart entre les deux modales, le
  code OTP en lecture seule (il identifie le document Firestore).
- **La colonne « Type projet » du sélecteur devient une vraie colonne** : elle
  portait l'identifiant `programme` (colonne « Rubr » du classeur) et
  **`NavettePage` ne rendait aucune cellule pour elle** — cochée par défaut,
  elle n'affichait rien depuis sa création. Elle pointe désormais sur
  `LigneNavette.type` (avis / DDM / SOR / autre, `TYPE_LABELS`), c'est-à-dire
  la valeur réellement saisie à la création et corrigée à la modification. Le
  changement d'identifiant est absorbé par `usePreferenceSelection` : `type`
  étant absent du catalogue enregistré et présent dans le défaut, il apparaît
  chez qui a déjà ouvert l'écran (le mécanisme du 18/08/2026).
- **`NavetteLigneDetailModal`** affiche le type de projet à côté du chargé
  d'affaires, à la place du bloc « Programme » retiré. `LigneNavette.programme`
  reste sur le modèle et sur les lignes importées — il n'est simplement plus
  affiché nulle part.

**Navette — historique du réalisé à date, par révision PDC (23/08/2026,
demande explicite « je veux faire un historique [du] Réalisé à date (YTD) qui
dépendra de la révision d'un PDC qui a été faite, fais un onglet pour voir
ça »)**. Deux points tranchés avec l'utilisateur avant d'écrire : le relevé est
**capturé au visa du directeur technique** (et non saisi à la main), et
l'onglet vit **dans le détail d'une ligne**.
- **Le relevé est porté par la révision elle-même**
  (`ArbitrageNavette.realiseYTDAuVisa`, `BudgetPeriode`) et non par une
  collection à part : le document est déjà écrit à cet instant précis, il porte
  déjà la date et l'auteur du visa, et `arbitrages_navette` a **ses règles
  Firestore déjà déployées** — ce lot n'en demande aucune nouvelle, ce qui est
  rare ici. Écrit dans le `writeBatch` qui applique la révision : jamais de
  relevé sans révision appliquée, ni l'inverse. Les correctifs admin
  (`reviserCorrectif`) relèvent aussi — c'est le même acte, sans les deux
  visas.
- **Limite dite à l'utilisateur avant de coder, et affichée à l'écran** : rien
  dans l'application ne met à jour `cycles.realiseYTD` (il vient du classeur
  importé), donc deux révisions successives peuvent relever la même valeur.
  L'onglet l'affiche telle quelle, indique la provenance du chiffre et marque
  la variation « Inchangé » plutôt que de masquer le relevé. Le jour où le
  réalisé sera saisi ou dérivé, l'historique devient immédiatement parlant sans
  rien changer au modèle.
- **`historiqueRealiseYTD()` (types/navette.ts)**, pure : révisions
  **validées** de la ligne (une refusée ou en attente n'a rien appliqué), du
  plus ancien au plus récent, avec la variation par rapport au **dernier relevé
  connu** — et non au relevé précédent, sinon une révision antérieure au champ
  (donc sans relevé) couperait la série en deux. Une révision sans relevé reste
  listée, marquée « Non relevé » : l'exclure laisserait croire qu'elle n'a pas
  eu lieu.
- **`NavetteLigneDetailModal` passe à deux onglets** (`components/ui/Onglets`,
  déjà partagé par 8 écrans) : « Budget & révisions » (le tableau des 8 cycles,
  l'historique des révisions et les hypothèses, inchangés) et « Réalisé à date
  (YTD) » avec son compteur. L'identité de la ligne, la clôture et le lien vers
  la fiche projet restent hors des onglets. Nouveau
  `components/navette/HistoriqueRealiseYTD.tsx` : valeur actuelle du cycle
  détaillée par poste, tableau des relevés (date, cycle, montant révisé,
  réalisé, variation, viseur), et l'écart entre le dernier relevé et la valeur
  d'aujourd'hui — la seule chose que la liste seule ne montre pas.
- **6 tests** (`lib/__tests__/historiqueRealiseYTD.test.ts`, 302 au total) :
  révisions non validées et lignes voisines écartées, ordre chronologique,
  variation (première entrée à `null` et non 0), relevé absent conservé sans
  réalisé prêté, série non coupée par une révision non relevée.

**Navette — l'admin vise les deux étapes, et une proposition se réajuste
(23/08/2026, demande explicite « je veux que l'admin valide pour les deux
profils et aussi une possibilité de pouvoir réajuster la proposition de
révision qui a été faite »)** :
- **`peutViser` ne refuse plus le second visa à un admin** qui a posé le
  premier — c'était la règle du 11/08/2026 (« deux visas, deux personnes »),
  explicitement levée pour lui. Elle **reste entière pour un non-admin** : un
  chef de département ne peut toujours pas se donner le visa du directeur
  technique. Ce qui garantit la double validation n'est donc plus la règle mais
  **la trace** : les deux visas portent l'identité de leur auteur, et
  `visasDuMemeAuteur()` la fait dire à l'historique de la ligne (« les deux
  visas ont été posés par la même personne »). Sans cet affichage, la levée de
  la règle rendrait le parcours indistinguable d'une vraie double validation.
- **Correctif du même jour, signalé à l'usage** (« quand je suis connecté avec
  un admin il peut tout faire ») : seul `peutViser` avait été levé, pas le
  garde-fou de `viserArbitrage` dans le contexte, qui refusait toujours le
  second visa au même identifiant — l'écran proposait donc le bouton et
  l'écriture le rejetait. `NavetteProvider` lit désormais `useAuth()`
  (AuthProvider l'enveloppe déjà dans `App.tsx`) pour appliquer la même
  exemption. Règle à retenir : **la règle d'affichage et le garde-fou
  d'écriture doivent dire la même chose**, sinon l'un promet ce que l'autre
  refuse.
- **`viserLesDeuxEtapes(arbitrageId, adminId)`** (NavetteContext) : bouton
  « Viser les 2 étapes et appliquer » dans la file d'attente, proposé aux
  admins sur une révision encore à la première étape. Une seule écriture — les
  deux visas, le statut, le relevé de réalisé YTD et l'application au budget
  partent dans le même `writeBatch` que le visa DT ordinaire
  (`validerEtAppliquer`, extrait des deux chemins). **Un visa de chef déjà posé
  par quelqu'un d'autre n'est jamais écrasé** : l'admin n'ajoute alors que le
  second.
- **`ajusterArbitrage(arbitrageId, ajustement)`** : la proposition se corrige
  sur place (montant, ventilation, prélèvement de cale) au lieu de devoir être
  refusée puis ressaisie — un cycle n'accepte qu'une révision en attente à la
  fois, c'était la seule issue. `ArbitrageModal` gagne un mode réajustement
  (prop `arbitrageAAjuster`), prérempli avec ce qui a été proposé ; l'écart est
  reconstitué par `gapPropose()`, y compris pour une proposition **en déficit**
  dont le total a été plafonné à 0 — sa part négative n'a survécu que dans le
  prélèvement de cale, exprimé dans le pivot.
  - **Le parcours repart au visa du chef** et ce visa est retiré
    (`parcoursApresAjustement`) : un visa porte sur un montant, celui d'avant
    ne vaut pas pour la nouvelle proposition. Rien n'a été appliqué à ce stade
    (seul le visa DT écrit sur la ligne et débite la cale), il n'y a donc rien
    à défaire — et la modale l'annonce **avant** l'enregistrement.
  - **`peutAjuster` = admin ou porteur d'un profil de visa**, exactement ce
    qu'autorise `firestore.rules` sur `arbitrages_navette` (`allow update: if
    estAdmin() || viseNavette()`). Le demandeur simple agent n'y a pas droit :
    lui proposer le bouton ne produirait qu'un refus des règles. Une révision
    déjà traitée ne se réajuste pas — validée, c'est un correctif admin qu'il
    faut ; refusée, le parcours est clos.
  - Point d'entrée aux deux endroits où la révision se regarde : la file
    `ValidationsEnAttente` et la cellule « Révision » du tableau des cycles
    dans le détail de la ligne.
- **Aucune règle Firestore à déployer** pour ce lot : les deux écritures
  passent par `arbitrages_navette`, déjà couverte.
- **11 tests** (`lib/__tests__/visasEtAjustement.test.ts`, 313 au total) :
  admin qui vise deux fois, non-admin qui ne le peut pas (même en changeant de
  profil), révision traitée, détection des deux visas d'un même auteur,
  périmètre de `peutAjuster`, remise à la première étape, et la reconstitution
  de l'écart (cas nominal et cas du déficit converti).

**Navette — la file des révisions passe en modale paginée (23/08/2026, demande
explicite « on pourra avoir plusieurs révisions, mieux on les affiche dans une
modale accompagnée d'une pagination ; un admin peut valider pour le chef de
département et directeur technique »)** :
- La page ne porte plus que le **résumé** (nombre en attente, nombre à viser
  par soi, rappel du parcours) et un bouton « Ouvrir la file ». Chaque révision
  occupe une dizaine de lignes — montant, parcours des deux visas, actions,
  champ de motif de refus — et quelques révisions en attente repoussaient tout
  le reste de l'écran sous la ligne de flottaison.
- **Modale paginée** (`usePagination` + `Pagination` partagés, 5 par page) avec
  deux filtres : « Toutes » et « À viser par vous ». L'ordre reste celui du
  11/08/2026 — ce que l'utilisateur peut viser d'abord. Un filtre « à viser »
  vide alors que la file ne l'est pas est **dit** au lieu d'afficher une liste
  vide.
- **Le bouton de visa nomme le profil suppléé** (« Viser (chef de
  département) », « Viser et appliquer (directeur technique) ») : un admin
  visant pour les deux doit savoir lequel il est en train de poser. Le
  raccourci « Viser les 2 étapes et appliquer » (écrit plus tôt le même jour)
  reste proposé à la première étape.
- La modale de réajustement s'ouvre **depuis** cette modale : le patron est
  déjà en place (`NavetteLigneDetailModal` monte `ArbitrageModal` de la même
  façon).

**Feuille de route — le FLAG passe en tête et devient un drapeau (23/08/2026,
demande explicite « la première colonne c'est le flag ; concernant le flag je
veux avoir un drapeau au lieu d'avoir une boule »)** :
- **Première colonne du tableau, avant la colonne d'identité** : `COLONNE_FLAG`
  est extraite de `COLONNES_FDR` (où elle reste, pour que le sélecteur de
  colonnes et les préréglages continuent de la commander) et rendue à part par
  la page, **figée à gauche** comme la colonne projet. La colonne projet suit,
  décalée de la largeur du flag (`left-12`) — d'où une largeur imposée dans les
  deux sens (`width` **et** `minWidth`) sur la cellule du flag : en
  `table-layout: auto`, une largeur seulement suggérée peut être élargie, et le
  contenu qui défile passerait alors derrière la colonne figée. Masquer le flag
  ramène la colonne projet à `left-0`.
- **Les deux indicateurs quittent la pastille 🟢/🟠/🔴 pour une icône qui dit ce
  qu'elle mesure**, aux trois mêmes couleurs (demandes successives du même
  jour) : **drapeau** plein pour le FLAG, et pour RECEPTION SCOPES une icône
  **par état** — check, point d'exclamation, croix (« avec check dans cercle »,
  puis « en rouge un indicateur différent, en orange avec un point
  d'exclamation »). La forme redouble la couleur, qui ne se lit ni en niveaux
  de gris ni pour un daltonien. **Écart assumé avec le classeur** : la règle du
  21/08/2026 (« conserver les indicateurs visuels du fichier Excel ») portait
  sur la couleur, qui est conservée ; deux pastilles identiques ouvrant chaque
  ligne, on ne savait plus laquelle parlait du délai et laquelle de la
  réception. Le libellé reste en infobulle et en `aria-label`.
- Détail de rendu qui compte : `fill="currentColor"` seul remplirait aussi le
  glyphe (un `<path>`/`<line>` tracé), qui disparaîtrait sur un cercle de la
  même couleur — on remplit le seul `<circle>` et on met le glyphe en réserve
  (`[&>circle]:fill-current [&>path]:stroke-white [&>line]:stroke-white`).
- Le champ `emoji` d'`ETATS_INDICATEUR` est **supprimé** : plus rendu nulle
  part une fois les deux menus remplacés, il serait resté en donnée morte.
- **`libelleIndicateur()` (types/feuilleDeRoute.ts)** : une icône est un
  ReactNode sans enfant textuel, donc une **cellule vide à l'extraction** —
  `texteDepuisNoeud` n'en tire rien. Les deux colonnes d'indicateur déclarent
  désormais leur `texte` (« Dans les délais », « Reçu à 100 % »…), et le flag
  garde sa place de première colonne dans le fichier produit.
- **Le repère est aussi ce qu'on choisit** (dans la foulée, demande explicite
  « je veux avoir le drapeau lors de la création et la modification ») : les
  deux menus déroulants du formulaire laissent la place à des boutons portant
  le **même `PastilleIndicateur`** que le tableau, plus « Non renseigné » — une
  `<option>` ne rend pas d'icône, et choisir sur le repère qu'on verra vaut
  mieux qu'un emoji de substitution. Un seul composant local
  (`ChoixEtatIndicateur`) sert les deux, et `definirEtat(cle, etat)` remplace
  le gestionnaire de `<select>`. Une valeur importée hors des trois repères
  (80 %, par exemple) est **affichée sous les boutons** : le bouton allumé
  donnerait sinon à croire qu'elle vaut 100.
- **2 tests** (`feuilleDeRouteIndicateurs.test.ts`, 315 au total) : libellés des
  deux indicateurs, et chaîne vide quand rien n'est renseigné (« jamais
  renseigné » n'est pas « action corrective »).

**Feuille de route — WP à NON par défaut, et le bloc PDC quitte le formulaire
(23/08/2026)** :
- **`wp: 'NON'` sur une ligne neuve** (demande explicite, après clarification) :
  une affaire entre au Work Program par décision, pas par défaut. Les **trois**
  états restent possibles — « — » se rechoisit à la main, et les 20 lignes du
  classeur sans valeur gardent la leur. Le défaut est posé **dans le
  formulaire** et non dans `EMPTY_PROJET_FEUILLE_DE_ROUTE` : le rapprochement
  s'en sert aussi pour fabriquer une ligne depuis une fiche projet, où le WP
  vient de la fiche — un NON d'office l'y déclarerait hors Work Program sans
  que personne ne l'ait dit.
- **Le bloc PDC du formulaire est retiré** (menu de version + montant lu sur la
  ligne navette, écrit le 22/08/2026) — retrait fait par l'utilisateur, dont le
  code mort a été nettoyé ici : props `pdcNavette`/`cyclePdc`, état
  `cycleConsulte` et imports devenus inutiles côté formulaire **et** côté page
  (`tsc -b` échouait). **Conséquence à connaître** : `pdc02_2026_kusd` — la
  seule colonne PDC que porte le classeur — n'est plus saisissable pour une
  ligne **non rattachée** à la navette ; le PDC ne se lit plus que dans le
  tableau, la modale de détail et la navette. `montantsPdcNavette`
  (colonnes.tsx) n'a plus d'appelant mais reste exportée et couverte par ses
  4 tests : c'est la règle de lecture des révisions d'une ligne, pas du code
  mort à supprimer sans demande.

**Fiche projet — un risque et sa mitigation, une opportunité et son gain,
autant de blocs qu'on veut (23/08/2026, demandes explicites « pour un risque on
doit avoir les mitigations associées dans un bloc, on pourra ajouter autant de
fois que possible », puis « on fera de même pour la sélection »)** —
nouveau `components/projects/RisquesProjet.tsx`, à la place des deux textes
libres « Risques identifiés » / « Mesures de mitigation » de
`PresentationProjet`.
- **Ce qui n'allait pas** : les deux champs étaient côte à côte mais rien ne
  disait quelle mesure traitait quel risque — une analyse à cinq risques tenait
  dans deux paragraphes qu'il fallait lire en parallèle. L'ordre demandé le
  22/08/2026 (la mitigation immédiatement après le risque) est désormais tenu
  **risque par risque**.
- **`Projet.analyseRisques?: RisqueProjet[]`** (`{ id, risque, mitigation }`),
  écrit par `definirRisquesProjet(projetId, risques)` — une seule méthode de
  contexte plutôt qu'ajouter/modifier/supprimer : chaque écriture sauvegarde de
  toute façon le document entier.
- **Aucune migration, et rien d'effacé** : `risquesDeLaFiche()` rend la liste
  structurée dès qu'elle existe — **y compris vide** (une liste vidée à la main
  est une décision, pas une absence) — sinon reprend les deux textes libres en
  **une seule entrée**, signalée à l'écran comme « à découper ». Les apparier
  ligne à ligne serait inventer : l'ancien modèle n'appariait rien. Les champs
  `risques`/`mitigationRisques` restent sur la fiche, simplement plus lus une
  fois la liste créée.
- **Un risque sans mitigation s'enregistre** — c'est l'état normal d'un début
  d'analyse : il est signalé (bandeau ambre sur la carte, compteur « n sans
  mitigation » en tête) et jamais bloqué, même règle que le point bloquant
  d'une phase. Le bouton n'exige que le risque lui-même.
- **Même chose pour les opportunités** (dans la foulée, « on fera de même pour
  la sélection ») : `Projet.analyseOpportunites?: OpportuniteProjet[]`
  (`{ id, opportunite, gain }`), `definirOpportunitesProjet`,
  `opportunitesDeLaFiche()` / `opportunitesSansGain()` — mêmes règles de reprise
  et de comptage. L'onglet Présentation n'a donc plus qu'un texte libre (le
  contexte) suivi de deux listes de couples.
- **Un seul composant d'écran pour les deux** (`components/projects/
  ListeCouples.tsx`, forme neutre `{ id, principal, associe }`) : ils ne
  diffèrent que par leurs libellés, leur icône et le ton du bloc associé. Les
  **types métier restent distincts** — un document Firestore portant
  `{ principal, associe }` ne se relirait pas ; `RisquesProjet` et
  `OpportunitesProjet` sont deux enveloppes de ~40 lignes qui font la
  traduction.
- **Les deux formulaires de création gardent leurs textes libres**
  (`NewProjectModal`, `LinkProjectModal`) : c'est une première passe rapide, et
  la reprise les transforme en une entrée dès l'ouverture de la fiche. À
  convertir si la saisie par blocs doit exister dès la création.
- **11 tests** (`lib/__tests__/risquesProjet.test.ts`, 326 au total) : liste
  structurée prioritaire, liste vidée respectée, reprise en une entrée, risque
  sans mitigation et mitigation sans risque, fiche jamais renseignée, et le
  décompte des manquants (une carte encore vide n'en est pas un) — les deux
  lectures sont testées séparément : elles lisent des champs différents de la
  fiche, une seule des deux pourrait régresser.

**CRJ — recueil des retours puis lot « partiels » (23/08/2026, demande
explicite « fais un état des recommandations et observations […] fusionner tout
ce qui est commun », puis « on va débuter avec tout ce qui est partiel »)** —
`doc/recueil-observations-crj.md` fusionne `commentaires CRJ.docx` (03/08) et
**`commentaires CRJ_rev02.docx`** (nouveau, 23/08) en 34 observations
numérotées, chacune avec l'état réel de l'application. Trois arbitrages
tranchés avec l'utilisateur avant d'écrire : HSE **par société et par scope**,
retard **dérivé des dates**, tarifs **dans Paramètres**.
- **HSE ventilé (CRJ-30)** — nouvelle collection `hebdo_crj_hse_evenements`
  (doc ID = `idDocument(date, affaireId, societe, scope)`), une ligne par
  société **et** par scope, saisie dans l'étape HSE du formulaire. Les 6
  compteurs de `LigneJournalHebdo` **restent écrits** et deviennent la somme de
  ces lignes : `hseRecap`, la synthèse HSE d'une fiche projet et les exports
  continuent de fonctionner **sans migration**. Une affaire antérieure n'a pas
  de ventilation — l'onglet HSE le dit au lieu de laisser croire à un écart.
  Règle `firestore.rules` ajoutée, **PAS ENCORE DÉPLOYÉE**.
- **Le CRJ est enfin câblé au référentiel (CRJ-24, CRJ-31)** : il était le seul
  module métier absent de Paramètres › Listes de valeurs. Nouveau module `crj`
  du catalogue — causes de standby, types de matériel, profils, phases —
  cumulé aux valeurs déjà présentes dans les données et à l'ajout à la volée.
  **Listes suggérées, jamais fermées** (`CelluleSuggeree`, datalist) : « si
  demain un type d'équipement n'apparaît pas dans la liste, je pourrai tout de
  même l'ajouter ».
- **Tarifs NPT dans Paramètres (CRJ-32/33)** : `GrilleTarifsForm` quitte
  l'onglet « Coût standby » du CRJ — où le **résultat** se lit — pour
  `components/parametres/TarifsNptTab.tsx`, sous le régime des autres
  référentiels (lecture connectée, écriture admin). Les lignes à tarifer sont
  celles du référentiel **plus celles déjà tarifées** (un profil retiré des
  listes ne doit pas emporter son tarif en silence) ; un champ vide reste un
  tarif **non défini**, pas un zéro. **Le vrai bloquant reste entier : la règle
  `hebdo_crj_tarifs_npt` n'est pas déployée.**
- **Statut et retard (CRJ-16)** : les 5 valeurs du document
  (`STATUTS_TRAVAUX`), « Standby » conservé comme libellé historique — le
  retirer ferait retomber les lignes qui le portent sur un badge neutre. Le
  **retard est dérivé** (`estEnRetard` : fin prévue dépassée et affaire non
  terminée), badge à côté du statut : une affaire peut être « en cours » **et**
  en retard, et un retard saisi resterait faux une fois rattrapé.
- **Rédacteur (CRJ-03)** porté par le suivi et non par un en-tête de journée —
  plusieurs personnes rédigent le même jour ; l'en-tête affiche les rédacteurs
  de ses suivis, à défaut celui du classeur. **Avis multiples (CRJ-04)** :
  `numerosAvisDdm`, le premier restant `numeroAvisDdm` (seul lu par le tableau,
  l'export et la résolution vers la fiche). **Photos par scope (CRJ-20)** :
  `CrjImageLigne.scope`, choisi photo par photo. **Société hors onglet Projet
  (CRJ-07)** : `societeCtr` devient **dérivé** des sociétés réellement
  mobilisées.
- **11 tests** (`lib/__tests__/crjRev02.test.ts`, 337 au total) : les 4 cas du
  retard (dont « pas de date de fin » et « le jour même »), les 5 statuts et le
  libellé historique, la somme des compteurs HSE, et le câblage au référentiel
  — y compris ce qui n'y est **pas** (le statut, sur lequel le code branche).
- **Reste ouvert** (§11 du recueil) : la hiérarchie Phase → Scope → Tâche
  (CRJ-11/13/15/17), le déplacement des champs vers Phases & Scopes (CRJ-09),
  les dates dérivées des phases, la modification d'un suivi enregistré, le type
  d'affaire, « Travaux prévus J+1 » et l'ergonomie de la saisie du standby.

**CRJ — hiérarchie Phase → Scope → Tâche et fin du rev02 (24/08/2026, « fais
le reste »)** — second lot de `doc/recueil-observations-crj.md`, après les
points « partiels » de la veille. Le module passe d'une liste plate de scopes à
la hiérarchie que demande le document, et tout ce qui décrit l'exécution
descend au niveau de l'activité concernée.
- **`ScopeAffaire` porte désormais ses tâches** (`TacheScope` : nom, date de
  début, date de fin, % réel), **sa société exécutante** et **ses points
  bloquants**. `avancementScope()` : moyenne des tâches **pointées** dès qu'il
  y en a, sinon le pourcentage du scope — les deux niveaux coexistent, les
  scopes saisis avant ce jour n'ayant pas de tâches. Une tâche non pointée ne
  compte pas pour 0 : ajouter une tâche ne doit pas faire chuter l'avancement.
- **Les phases se gèrent** (CRJ-11) : « Travaux sur site » créée d'office
  (`PHASE_PAR_DEFAUT`), renommable, ajoutable, supprimable. Renommer une phase
  renomme ses scopes, la supprimer réaffecte les siens, et **la dernière ne se
  supprime pas** — les scopes n'auraient plus où s'accrocher. Chaque bloc
  s'intitule « {phase} – Scopes », le titre demandé.
- **Les dates de l'affaire sont dérivées** (`datesDepuisScopes` : premier début,
  dernière fin des tâches) et ne sont plus demandées dans l'onglet Projet. Sans
  tâche datée, la valeur reprise de la fiche projet est conservée : on
  n'invente pas une date à partir de celle du rapport.
- **Ce qui décrit l'exécution quitte l'onglet Projet** (CRJ-09) : statut, core
  crew et contexte sont saisis dans « Phases & Scopes » ; société et points
  bloquants descendent au **scope**. L'onglet Projet ne garde que
  l'identification — plus « Travaux prévus demain » (CRJ-19), texte libre,
  qui alimente enfin `previsionTravauxJ1` (le champ existait, rien ne
  l'écrivait).
- **Un suivi enregistré se modifie** (CRJ-10) : bouton « Modifier » dans le
  détail, **le même formulaire** prérempli — un second formulaire aurait
  divergé du premier au premier champ ajouté. Le document est réécrit **sous
  son identifiant** (le changer détacherait ses lignes de personnel, de
  matériel, de HSE et de dérive planning, qui le référencent par `affaireId`),
  et `supprimerLignesObsoletes` efface les lignes filles retirées de la
  saisie : les doc ID étant déterministes, réenregistrer met à jour ce qui
  reste mais n'efface jamais ce qui a disparu. Réservé aux suivis saisis dans
  l'app — une ligne du classeur a un id numérique et vit dans un blob en
  lecture seule.
  - **Limite assumée, dite à l'écran** : la ventilation du standby par cause
    est portée par l'affaire, jamais par une personne (`DefautPlanningLigne`
    n'a ni société ni profil). À la réouverture, elle est donc regroupée sur
    la première ligne de personnel — la répartir au jugé inventerait une
    information que la base n'a jamais eue.
- **Type d'affaire** (CRJ-05) : Avis / DDM / SOR, la liste `TYPE_LABELS` des
  fiches projet, « selon la logique déjà utilisée dans les autres modules ».
  Elle reste **dans le code** : c'est une union sur laquelle le code branche,
  l'exclusion documentée du 18/08/2026.
- **Ergonomie du standby** (CRJ-25) : les deux champs sont nommés (« Durée (h) »
  / « Cause du standby »), le menu dit « Choisir une cause… » et l'ajout est un
  bouton en clair — « il est difficile de deviner que le petit bouton de droite
  est celui où on récupère les causes ».
- **11 tests** (`lib/__tests__/crjHierarchie.test.ts`, 348 au total) sur les
  règles qui décident : avancement d'un scope (moyenne des tâches pointées,
  repli sur le scope, tâche non pointée ignorée), dates dérivées, retard (les
  4 cas, dont « le jour même » et « sans date de fin »), somme des compteurs
  HSE. Le test des libellés d'indicateur de la feuille de route a été aligné
  sur le renommage fait entre-temps dans `ETATS_INDICATEUR` (Maitrisé / Sous
  surveillance / A risque) : le test suit la source, il ne fige que le fait
  que chaque indicateur a bien **son** libellé.
- **Le recueil est à jour** : 31 points ✅, 2 🟡 (CRJ-32/33 — la règle
  `hebdo_crj_tarifs_npt` n'est pas déployée, ce n'est pas du code) et 1 ❓
  (CRJ-28, capture manquante). **Trois règles Firestore restent à déployer**
  sur `driver-6ae2b` : `hebdo_crj_tarifs_npt`, `listes_valeurs` et la nouvelle
  `hebdo_crj_hse_evenements`.

**Matching du portefeuille — Feuille de route (WP) → Navette → Fiche projet
(24/08/2026, demande explicite « un algo qui va faire un matching : lier tous
les items présents dans la feuille de route avec WP à ce qui est présent dans
la navette, ensuite lier tous les projets […] avec ce qui est présent dans
feuille de route », « on fera comme les corrections dans la partie
paramètres »)** — `lib/matchingPortefeuille.ts` (pur) +
`components/parametres/MatchingPortefeuilleCard.tsx`, monté en tête de
**Paramètres › Maintenance**, même parcours que les 3 migrations voisines :
analyser, puis appliquer après confirmation.
- **Ce que ça ajoute à `rapprochementPortefeuille.ts` (23/08/2026), qui reste
  en place** pour la reprise à la main dans l'écran Rapprochement : un
  **score** au lieu d'une cascade de critères testés un à un. La cascade
  s'arrêtait au premier critère qui répondait — une imputation absente faisait
  retomber tout le poids sur l'intitulé **exact**, et un intitulé à un mot près
  ne rapprochait rien. Le score note chaque candidat sur un faisceau :
  imputation (5), intitulé (4, similarité de Jaccard et non égalité), fiche
  projet commune (3), champ (2), budget (2), Work Program (1), année (1).
- **Un critère non évaluable est retiré du dénominateur**, jamais compté 0 :
  sinon une ligne qui ne renseigne ni année ni budget serait pénalisée pour ce
  qu'elle ne dit pas, et aucune ne passerait le seuil. Deux montants nuls ne
  sont pas une concordance, c'est une absence.
- **Le budget n'est comparé qu'en dollars** : les colonnes de la feuille de
  route sont comptées en KUSD sans porter de devise ; les opposer à une ligne
  navette en euros ferait diverger un critère pour une raison étrangère à
  l'identité de l'affaire.
- **Les clés fortes passent avant le score** (imputation identique, intitulé
  identique, même fiche) — c'est ce que faisait le rapprochement, il n'y a pas
  de raison de le défaire. Deux nuances : un intitulé identique **que
  l'imputation dément** ne tranche plus rien (deux signaux forts qui se
  contredisent, c'est un cas à regarder), et une clé forte portée par plusieurs
  candidats est départagée par le score, à défaut proposée.
- **Rien de flou n'est écrit** : `automatique` (clé forte unique, ou score
  ≥ 0,85 devançant le second de 0,1) s'applique ; tout le reste au-dessus de
  0,5 est **proposé** et attend un choix explicite dans l'écran. Le champ
  (site) **écarte** un homonyme d'un autre champ au lieu de le proposer (règle
  §2.3) — sauf imputation identique, où un champ divergent est une erreur de
  saisie et non une seconde affaire.
- **Périmètre Work Program**, la demande : seules les lignes `wp = OUI` sont
  analysées (case à décocher pour les traiter toutes). Les 20 lignes du
  classeur sans valeur de WP ne sont **pas** déclarées hors Work Program, elles
  sont simplement hors périmètre — et le décompte le dit.
- **Étage 2** : la fiche projet est d'abord héritée de la ligne navette
  retenue (lien explicite déjà posé d'un côté), **sauf si cette ligne navette
  n'est elle-même que probable** — un lien probable ne fonde pas un lien
  certain. Sinon score sur les fiches (imputation, y compris les
  `codesOTP` multiples, intitulé, champ, WP, dates), puis la cascade
  `lib/liaison.ts` en dernier recours. Le retour vers la navette
  (`ligne.projetId`) et la création d'une ligne par fiche orpheline
  (case séparée) reprennent les règles du 23/08/2026.
- `construirePatchs()` est pure et **c'est elle qui décide de ce qui sera
  écrit** — patchs recalculés à chaque choix manuel, donc le compteur du bouton
  « Appliquer » dit exactement ce qui partira. Un lien déjà posé n'y entre
  jamais : relancer ne change rien. Écriture par lots de 400 (`enLots`), puis
  relecture de la feuille de route et de la navette.
- **19 + 4 tests** (`lib/__tests__/matchingPortefeuille.test.ts` et
  `matchingPortefeuilleReel.test.ts`, 371 au total) :
  critères non évaluables, deux zéros, devises, les 4 chemins de décision,
  l'homonyme écarté, l'héritage refusé sur une navette probable, le hors
  périmètre qui n'écrit rien, l'idempotence, et les identifiants distincts des
  lignes créées dans un même lot.
- **Aucune règle `firestore.rules` à déployer** : ce lot n'écrit que dans
  `feuille_de_route` et `lignes_navette`, déjà couvertes (la partie navette
  est en `allow update: if estAdmin()`, d'où l'écran réservé aux admins).
- **Rejoué sur les données réellement importées** (24/08/2026, après un « aucune
  liaison n'est faite » de l'utilisateur) — 84 lignes de feuille de route, 102
  lignes navette, 20 fiches projet, avec le mapping des contextes :
  **33 des 44 lignes WP rattachées à leur ligne navette, 2 à confirmer, 9 sans
  candidat ; 6 fiches projet rattachées et 6 lignes navette pourvues**. Le
  corpus a montré deux choses qu'aucun test écrit à la main n'aurait montrées :
  - **le Work Program de la navette n'est pas une donnée sur ces lignes**,
    seulement un repli — `versLigneFront` rend `workProgram: false` dès que le
    champ est absent, ce qui est le cas des 102 lignes du classeur. Le compter
    comme critère faisait diverger **toutes** les lignes WP de la feuille de
    route contre leur propre origine. Il est retiré de l'étage navette (il
    reste à l'étage fiche projet, où la valeur est réelle) ; la devise absente
    est lue comme l'unité du classeur, sans quoi le critère budget n'était
    jamais évalué ;
  - un candidat dont **une clé forte concorde est proposé même sous le seuil**
    (intitulé identique mais imputation différente) : son score est bas *parce
    que* deux critères s'opposent — c'est ce qu'il faut faire regarder, pas ce
    qu'il faut taire.
  Fixture `__tests__/fixtures/portefeuille.json` + 4 tests
  (`matchingPortefeuilleReel.test.ts`), dont l'**idempotence rejouée** : une
  seconde passe sur le résultat de la première n'écrit plus rien.
- **L'écran dit ce qu'il a reçu** (« analysé sur 84 lignes … 102 lignes navette
  … 44 Work Program … 42 avec imputation ») et liste les lignes sans candidat
  avec leur meilleur score : un rapprochement vide ne se distingue pas, sinon,
  d'un chargement qui a échoué — une collection inaccessible rend une liste
  vide et l'écran dirait « rien à lier » au lieu de « rien n'est arrivé ».
- **Ce que le lot ne rend pas visible, et c'est attendu** : un `ligneNavetteId`
  posé ne s'affiche nulle part dans le tableau de la feuille de route — il fait
  seulement que BU et PDC y suivent enfin les révisions de la navette. Seule la
  colonne « Fiche projet » se remplit à l'œil, et les 20 fiches actuelles sont
  un jeu illustratif : 6 lignes sur 44 s'y rapprochent.

**Module Contrat — recueil des demandes puis lot 1 (25/08/2026, demande
explicite « parcours le document, mets toutes les implémentations dans le
fichier md, récupère tous les points listés tels que c'est présent, je veux un
plan d'implémentation », puis « on y va avec le lot 1, je veux pas des tests à
chaque phase »)** — `doc/recueil-module-contrat.md` relève les **41 points**
de `doc/module contrat.docx` (6 sections + les colonnes de la capture Excel
qu'il fournit, qui portent 5 informations absentes du texte : SERVICE, MOIS,
SITES, OBJET, et le fait que le montant est **HT**) et pose un plan en **6
lots**. Seul le lot 1 est livré.

- **Trois champs sur le contrat** (`lib/contratsEngine.ts`) : `intitule`
  (« identifier rapidement l'objet du contrat sans se limiter à une référence
  ou un numéro »), `responsableClient` / `responsableFournisseur`
  (`ResponsableContrat { nom, email? }`) et `commentaire`. Tous
  **facultatifs** — les contrats déjà en base n'en ont pas, et déduire un
  intitulé de la référence inventerait une donnée : l'écran affiche alors la
  référence seule plutôt qu'une grille de tirets.
- **Les responsables sont du texte libre, pas des comptes de l'annuaire** :
  celui côté fournisseur n'a pas de compte dans l'application, et le document
  donne les deux sous la même forme. L'adresse est contrôlée par
  `type="email"` sans être obligatoire ; le **nom fait exister** le
  responsable (une adresse seule ne désigne personne à l'écran).
- **Un contrat se modifie enfin** : il n'existait aucun chemin de
  modification (`creerContrat` seulement) — sans `modifierContrat()`, les
  trois champs n'auraient pu être renseignés que sur les contrats créés après
  ce jour. **La référence y est en lecture seule** : elle est l'identifiant du
  document Firestore (`idDocument(reference)`), la changer abandonnerait le
  contrat avec tout ce qui pointe dessus — `Commande.contratId`, `projetIds`,
  ses consommations. Même règle que le code OTP d'une ligne navette.
  `modifierContrat` ne touche ni à `projetIds`, ni aux options de
  renouvellement, ni aux consommations : chacun a son propre geste, et un
  `setDoc` complet les effacerait.
- **Un seul formulaire pour créer et modifier** (`ContratForm`, ex
  `NewContratForm`) — deux composants jumeaux auraient divergé au premier
  champ ajouté (patron déjà retenu pour `AgentForm`). Les options de
  renouvellement ne restent proposées qu'à la création : elles s'exercent
  ensuite une par une.
- Un champ facultatif vidé est **retiré** du document (`deleteField()`), ni
  `undefined` (refusé par Firestore) ni `null` (qui distinguerait mal « pas
  saisi » de « effacé ») — et `sansVides()` écarte aussi la chaîne vide à la
  création, qui se relirait comme « renseigné, mais avec rien dedans ».
- **Aucune règle `firestore.rules` à déployer** : `contrats` est déjà en
  `allow update: if connecte()`. C'est le seul lot du plan dans ce cas — les
  lots 2 à 4 en demandent quatre.
- **Corrigé au passage** : `ContratListe` ne déclarait pas `fournisseurId`
  alors que `listerContrats` le sert déjà (spread du document) — sans lui, le
  formulaire de modification ne pouvait pas être prérempli.
- **Pas de tests sur ce lot, à la demande explicite de l'utilisateur.**
  `tsc -b`, `npm run lint`, `npm run build` et les 371 tests existants
  passent.
- **Reste ouvert** : les lots 2 à 6 du recueil — AVC du contrat (valeur cible
  dérivée + escalier sur le graphique), **commandes autonomes** (l'arbitrage
  structurant : une commande vit aujourd'hui dans `projets/{id}.commandes[]`,
  or le §3 du document en demande sans fiche projet — topographie, EPCM),
  factures et workflow de validation en 6 étapes, tableau de suivi par
  contrat, alertes. Et **6 questions à faire préciser** (§9 du recueil), dont
  la colonne « EN COURS DE TRAITEMENT » de la capture Excel, qui ne
  correspond à aucune des 6 étapes du texte.

**Module Contrat — lot 2 : les AVC (25/08/2026, « on y va avec le lot 2 »)**
— augmentations de valeur cible (`doc/module contrat.docx` §2 : VC initiale
2 000 000 USD → nouvelle VC 3 000 000 → **AVC n°1 : +1 000 000**).

- **La valeur cible devient dérivée** : `valeurCibleActuelle(contrat)` =
  valeur initiale + Σ des AVC, jamais recopiée dans le document. C'est la
  règle appliquée partout ici (résumés Procurement, KPI Grand arrêt) — un
  chiffre recopié devient faux au premier AVC. `ContratDoc.valeurCible` reste
  donc explicitement **la valeur initiale**, celle qui a été signée, et n'est
  jamais réécrite par une augmentation.
- **Tous les taux suivent la cible actuelle**, pas l'initiale : `pct` de
  `listerContrats`, le badge de dépassement et la « VC mensuelle (÷12) » de
  l'onglet Contrats d'une fiche projet, et les cumuls du **tableau de bord**
  (valeur cible totale, décompte des dépassements, graphique par type).
  Rapportée à l'initiale, la jauge continuerait d'annoncer un dépassement
  après l'augmentation qui l'a précisément levé.
- **Le numéro d'AVC est calculé, pas saisi** : c'est le rang chronologique
  (AVC1, AVC2…). Le stocker permettrait à deux AVC de porter le même. Deux
  augmentations du même jour sont départagées par leur **horodatage de
  saisie**, sans quoi leur ordre — donc leur numéro — changerait d'un
  chargement à l'autre.
- **On saisit le montant ajouté, pas la nouvelle valeur cible** : c'est ce que
  le document nomme « l'augmentation ». La nouvelle valeur cible est affichée
  **en dérivé pendant la saisie**, puisque c'est en ces termes que le
  management décide (« on passe à 3 000 000 »).
- **La cible est tracée en escalier** sur les courbes de consommation
  (`paliersValeurCible`, `type="stepAfter"`, gris pointillé sans point — un
  repère, pas une seconde mesure) : elle ne progresse pas continûment, elle
  saute le jour d'un AVC. Les paliers sont calculés **sur les périodes de la
  courbe qu'ils accompagnent**, pour que les deux séries partagent le même
  axe ; une augmentation antérieure à la première période est déjà comprise
  dans la valeur de départ et ne crée pas de marche hors du graphique. Piège
  traité : la consommation **saisie** affiche un libellé (« Mars 2026 ») et
  non une période ISO — elle porte sa clé `YYYY-MM` à part, sinon les marches
  tomberaient au mauvais endroit.
- **Stockage en sous-collection `contrats/{id}/avc`** (le patron
  `consommations` déjà en place), doc ID = UUID : deux augmentations peuvent
  porter la même date et le même montant sans qu'aucune n'écrase l'autre.
  Chaque AVC est signé (`saisiPar` depuis la session — `ContratsProvider` lit
  `useAuth()`, comme `NavetteProvider` — et `saisiLe`).
- **Règle `firestore.rules` : `contrats/{id}/avc` en création seule** —
  lecture et `create` connecté, `update`/`delete` **refusés, pas même pour un
  admin** (même régime qu'`epcm_historique`) : la valeur cible actuelle se
  déduit de cette suite, une augmentation réécrite après coup changerait un
  budget déjà arbitré sans laisser de trace. **Ajoutée localement, PAS ENCORE
  DÉPLOYÉE** — sans déploiement la lecture des AVC échoue (l'incident est
  signalé) et l'enregistrement d'une augmentation est refusé.
- **Pas de tests, à la demande explicite de l'utilisateur.** `tsc -b`,
  `npm run lint`, `npm run build` et les 371 tests existants passent.
- `doc/recueil-module-contrat.md` porte désormais un **§12 « Journal de
  livraison »** : pour chaque élément livré, le **libellé réellement affiché**
  à l'écran, le champ correspondant et le point du document qu'il couvre —
  c'est par le libellé qu'on retrouve un élément, pas par son nom technique.
- **Reste ouvert** : lots 3 à 6. Le lot 3 porte l'arbitrage structurant (une
  commande vit dans `projets/{id}.commandes[]`, or le §3 du document en
  demande sans fiche projet) et emporte avec lui CTR-09→13 et l'autre moitié
  de CTR-14 (augmentations de commandes).

**Module Contrat — lot 3 : les commandes deviennent autonomes (25/08/2026,
« pour le lot 3 fais les éléments tel que c'est mentionné dans le fichier
soumis »)** — `doc/module contrat.docx` §2 (« Augmentation d'une commande »),
§3 (« Suivi des commandes depuis le module contrat ») et §4.

- **L'arbitrage structurant est tranché : collection `commandes` autonome.**
  Une commande vivait dans le document de sa fiche
  (`projets/{id}.commandes[]`) ; le §3 demande de suivre les commandes et les
  factures de certains contrats — **topographie, EPCM** — « sans forcément
  être rattaché à un projet classique », or sans fiche une commande n'avait
  nulle part où exister. Les deux autres options ont été écartées : une
  sous-collection du contrat rendrait ambiguë une commande liée à un projet
  *et* à un contrat (deux emplacements possibles) ; une fiche projet
  « fictive » par contrat polluerait Projets, la feuille de route et le
  rapprochement avec des projets qui n'en sont pas.
- **`Projet.commandes` n'a pas été supprimé, il est ré-alimenté.**
  `ProjectsContext` réinjecte dans chaque fiche les commandes de la collection
  qui la désignent (`avecCommandes`, marquées `source: 'collection'`) : les
  ~20 écrans qui les lisent — engagement d'une fiche, feuille de route,
  consommation d'un contrat, `lib/liaison.ts` — n'ont pas eu à être réécrits.
  **Le garde-fou qui rend ça sûr est unique et vital** : `sauvegarderProjet`
  **retire** ces commandes avant d'écrire la fiche ; sans ce filtre, chaque
  sauvegarde les recopierait dans le document et elles compteraient double.
  Une commande migrée gardant son identifiant d'origine, la copie restée
  inline est écartée à la lecture — elles ne peuvent pas se dédoubler non plus
  pendant la transition.
- **`Commande.montant` devient dérivé** (`montantActuelCommande` = initial +
  Σ augmentations) et garde exactement le sens que les écrans lui donnaient
  déjà : ce que la commande vaut **aujourd'hui**. `montantInitial` est
  nouveau et n'est jamais réécrit. Une commande antérieure à ce champ n'en a
  pas : son `montant` est son seul montant connu, on n'invente pas un initial
  différent.
- **Le montant ne se corrige pas dans le formulaire de modification** : il ne
  change que par une **augmentation**, qui laisse une trace (§2, « en
  conservant l'historique »). Le corriger sur place effacerait la différence
  entre « la commande valait 500 000 » et « on l'a portée à 600 000 » —
  exactement l'exemple du document (commande 4550001).
- **Augmentations en sous-collection `commandes/{id}/augmentations`**, mêmes
  règles que les AVC d'un contrat : on saisit le **montant ajouté**, le
  nouveau montant s'affiche en dérivé, chaque entrée est datée et signée, et
  la sous-collection est en **création seule** côté règles.
  `AugmentationsCommande` est le **même composant** dans la fiche projet et
  dans le module Contrats — le geste est le même des deux côtés.
- **CTR-16 (factures sans fiche projet) est livré ici, pas au lot 4** : une
  facture suit sa commande, donc dès qu'une commande peut vivre sans fiche,
  ses factures aussi. Elles restent portées par le document de la commande,
  comme elles l'étaient par la commande dans la fiche — le lot 4 leur donnera
  leur propre modèle avec le workflow de validation, les déplacer maintenant
  serait le faire deux fois.
- **Nouveau `toutesCommandesContrat(projects, commandes, contratId)`** : le
  compteur « n commandes sur ce contrat, **tous projets confondus** » de la
  fiche projet parcourait les fiches — il aurait donc affirmé un total qu'il
  n'avait pas dès la première commande sans projet, et la consommation du
  contrat en aurait oublié une part. Il unit les deux sources en écartant les
  doublons par identifiant.
- **Migration `migrerCommandesVersCollection()`** + carte Paramètres ›
  Maintenance (analyser, puis appliquer après confirmation, lots de 400).
  Elle **déplace** des objets au lieu de combler un champ, d'où deux
  garanties dites à l'écran : la fiche d'origine **n'est pas modifiée** (sa
  liste reste en place et cesse simplement d'être lue — rien n'est perdu si
  la migration est interrompue, et la fiche se nettoie d'elle-même à sa
  prochaine sauvegarde), et une commande déjà déplacée n'est jamais reprise
  (**doc ID = son identifiant d'origine**, c'est ce qui rend la migration
  idempotente). Le montant repris devient le montant **initial** : ces
  commandes n'ont jamais été augmentées dans l'application.
- **Deux règles `firestore.rules`** : `commandes` (lecture/écriture connecté,
  même régime que les fiches projet dont elles sortent) et
  `commandes/{id}/augmentations` (**création seule**). **Ajoutées localement,
  PAS ENCORE DÉPLOYÉES** — sans déploiement, la collection est lue vide
  (l'incident est signalé) et les commandes restent celles des fiches.
- **Pas de tests, à la demande explicite de l'utilisateur.** `tsc -b`,
  `npm run lint`, `npm run build` et les 371 tests existants passent.
- **Reste ouvert** : lot 4 (factures et **workflow de validation** en 6
  étapes — technique, compta, SAP, CGE, paiement en cours, paiement réalisé —
  avec statut PAYÉE/IMPAYÉE calculé et KPI de délais), lot 5 (tableau de suivi
  des factures par contrat, aux colonnes de la capture Excel), lot 6 (alertes,
  et la consommation d'un contrat tirée de ses commandes). Et la question Q1
  du recueil, toujours ouverte : la colonne « EN COURS DE TRAITEMENT » du
  fichier Excel ne correspond à aucune des 6 étapes du texte.

**Module Contrat — lot 4 : factures et workflow de validation (26/08/2026)** —
`doc/module contrat.docx` §5 (« le module doit permettre de suivre toutes les
étapes avant paiement ») et §6.

- **Pas de collection `factures`, et c'est un écart assumé avec le plan.**
  Le recueil en prévoyait une, au motif qu'« une facture doit pouvoir exister
  sans fiche projet » — mais le **lot 3 a réglé ce point autrement** : une
  facture suit sa commande, et les commandes sont autonomes depuis. Le
  document ne connaît d'ailleurs pas de facture sans commande (§5 : « une
  facture doit pouvoir être rattachée à une commande ») et la première colonne
  de son fichier de suivi est « COMMANDE ». Une seconde collection aurait
  ajouté une migration et un second modèle sans rien permettre de plus. Les
  factures restent donc dans le document de leur commande — **aucune règle
  Firestore à déployer pour ce lot**, la règle `commandes` du lot 3 les
  couvre.
- **`lib/facturesContratEngine.ts` (nouveau, pur)** — trois règles à connaître
  avant d'y toucher :
  - **`statutFacture()` ne regarde que le paiement réalisé**, pas l'étape
    atteinte : une facture ayant franchi les cinq premières étapes reste
    IMPAYÉE. C'est exactement ce que dit le §5 (« tant que le paiement n'est
    pas effectué : IMPAYÉE »). **Calculé, jamais saisi** — contrairement à
    `FactureGmi.statut` du module Tonnage, qui est une donnée importée.
  - **`etapeCourante()` prend la plus avancée des étapes franchies**, et non
    la première lacune : le document décrit un parcours, mais rien n'oblige la
    réalité à le suivre dans l'ordre — une facture peut être introduite dans
    SAP avant que la date de validation technique n'ait été notée. Prendre la
    première lacune ferait reculer l'avancement d'une facture pour un champ
    oublié.
  - **`delaisFacture()` rend `null`, jamais `0`, quand une borne manque** : un
    délai inconnu n'est pas un délai nul. `moyennesDelais()` n'agrège que les
    factures dont les deux bornes existent **et dit sur combien elle porte** —
    une moyenne calculée sur 2 factures parmi 40 passerait sinon pour la
    mesure du contrat.
- **CTR-26 avertit, ne bloque pas** : cocher « paiement réalisé » alors que des
  étapes antérieures sont vides affiche `etapesManquantes()` en clair et
  enregistre quand même. Refuser le paiement parce qu'une date de SAP n'a pas
  été notée ferait perdre la seule information sûre — le paiement a eu lieu.
  Même traitement que « un risque sans mitigation » et « un point bloquant
  sans mitigation ».
- **Les Oui/Non ont trois états** (non renseigné / Oui / Non). Un booléen à
  deux états ferait passer « pas encore renseigné » pour « Non », alors que le
  fichier de suivi Excel distingue bien une case vide d'un « NON » explicite.
- **La séparation création / workflow est celle du §6** : l'identification
  (N° facture, montant **HT**, date, **date de réception**, service, site,
  mois, objet — les colonnes du fichier Excel, CTR-40) se saisit **une fois**
  à la création (`NouvelleFactureForm`, partagé par la fiche projet et le
  module Contrats) ; le panneau déplié la reprend et n'ouvre que les six
  étapes. « Éviter les doubles saisies », littéralement.
- **`dateReception` est un champ nouveau et distinct de `date`** : le §5 fait
  partir les KPI de la *réception* de la facture, pas de son émission.
  `Facture.montant` garde son nom mais est documenté comme le **montant HT** —
  tout ce qui le lit (facturé d'une fiche, de la feuille de route, d'un
  contrat) comptait déjà du HT.
- **Bandeau de suivi au niveau du contrat** (`resumeFactures`) : nombre,
  montant, payé, impayé et les délais moyens, sur **toutes** les factures du
  contrat quelle que soit leur commande. C'est le premier étage de CTR-19 ; le
  **tableau** aux colonnes du fichier Excel reste le lot 5.
- `modifierFacture()` sur `ProjectsContext` passe par le même aiguillage que
  `addFacture` : une commande de la collection écrit dans son document, une
  commande restée dans une fiche passe par la fiche.
- **Pas de tests, à la demande explicite de l'utilisateur.** `tsc -b`,
  `npm run lint`, `npm run build` et les 371 tests existants passent.
- **Reste ouvert** : lot 5 (tableau de suivi des factures par contrat, aux
  colonnes de la capture Excel, avec export) et lot 6 (alertes, et la
  consommation d'un contrat tirée de ses commandes). Et **CTR-41 est toujours
  à clarifier** : la colonne « EN COURS DE TRAITEMENT » du fichier Excel ne
  correspond à aucune des 6 étapes du texte — aucune septième n'a été
  inventée.

**Module Contrat — lot 5 : le tableau de suivi des factures (26/08/2026)** —
`doc/module contrat.docx` §6. `components/contrats/FacturesDuContrat.tsx` +
`colonnesFactures.tsx`, monté dans le contrat déplié sous la section
Commandes.

- **Le tableau ne saisit rien, et c'est la règle du §6** : « les informations
  déjà saisies lors de la création doivent être reprises automatiquement ;
  seules les informations relatives au workflow de validation et de paiement
  doivent être complétées manuellement ». Il rassemble les factures de
  **toutes** les commandes du contrat — celles rattachées à une fiche projet
  comme celles suivies directement (§3) — et la saisie reste là où elle a
  lieu, dans la ligne de la facture sous sa commande. Un second point de
  saisie aurait donné deux endroits pour la même valeur.
- **Colonnes reprises du fichier de suivi Excel** joint au document (commande,
  n° facture, service, mois, montant HT, site, objet, commentaire), complétées
  des **dates** des six étapes que le fichier ne montre pas mais que le §5
  demande — « il faut juste t'assurer que toutes les informations relatives à
  la facture et les informations sur le workflow de validation jusqu'au
  paiement s'y trouvent ». Piloté par `ColonneTableau`, donc l'extraction
  CSV / PDF / XLSX en découle sans travail supplémentaire.
- **`CTR-41` reste non traité, et l'écran le dit** : la 12ᵉ colonne du fichier,
  « EN COURS DE TRAITEMENT », ne correspond à aucune des six étapes du texte —
  une note de pied de tableau l'annonce plutôt que de laisser croire à un
  oubli. Aucune septième étape n'a été inventée.
- **Le bandeau de KPI du lot 4 est retiré de la section « Commandes »** au
  profit de celui du tableau : deux bandeaux sur le même écran auraient fini
  par se contredire, l'un suivant les filtres du tableau et l'autre non. Celui
  qui reste **suit les filtres**, comme le tableau qu'il résume.
- Deux règles d'extraction reprises de l'existant : montants en **nombres
  bruts** (un tableur doit pouvoir sommer la colonne) et extraction de
  l'ensemble **filtré**, pas de la page affichée — sinon on sortirait 15
  lignes sur 60 sans le dire.
- **Un Oui/Non non renseigné s'affiche « — », pas « NON »** dans le tableau
  comme dans le formulaire : le fichier Excel distingue une case vide d'un
  « NON » explicite, et les confondre ferait passer une facture non
  renseignée pour une facture refusée à cette étape.
- **Aucune règle Firestore à déployer** : les factures vivent dans le document
  de leur commande (lot 4), déjà couvert.
- **Pas de tests, à la demande explicite de l'utilisateur.** `tsc -b`,
  `npm run lint`, `npm run build` et les 371 tests existants passent.
- **Reste ouvert** : le lot 6 (alertes de contrat — CTR-39, que le document
  demande **sans les définir** —, et la consommation d'un contrat tirée de ses
  commandes, qui est aussi le branchement resté ouvert du module EPCM vers le
  contrat `PERSONNEL_EPCM`). Et **CTR-41**, toujours à clarifier.

**Module Contrat — lot 6 : alertes et consolidation (26/08/2026)** — dernier
lot du plan, `doc/module contrat.docx` (« Bénéfice attendu » : suivi des
consommations, « alertes et historique de gestion »). **Les 6 lots sont
livrés.**

- **Les alertes sont livrées sous hypothèse, et c'est dit.** Le document les
  demande **sans dire lesquelles ni sur quels seuils** (Q2 du recueil, restée
  sans réponse). `lib/alertesContrat.ts` en propose trois familles — budget
  (80 % / 90 % / dépassement de la valeur cible **actuelle**), échéance (échu,
  ou dans moins de 90 jours) et factures impayées de plus de 60 jours — avec
  **tous les seuils nommés en constantes exportées**, précisément pour être
  changés d'une ligne le jour où la réponse arrive. Les deux premiers seuils
  budget partagent l'ambre et le rouge est réservé au dépassement : ce sont
  exactement les seuils et les couleurs du module EPCM
  (`contratEpcmEngine.construireAlertes`), il n'y avait aucune raison d'en
  inventer d'autres.
- **Fonction pure, date du jour en paramètre** : sans ça son résultat
  dépendrait de l'horloge au moment du rendu, et elle serait intestable.
- **Quatre règles qui décident**, à connaître avant d'y toucher :
  - **une valeur cible à 0 ne déclenche rien** — ce n'est pas un contrat
    consommé à l'infini, c'est un contrat dont le budget n'a pas été
    renseigné ;
  - **une option de renouvellement non exercée est mentionnée dans l'alerte
    d'échéance** : le contrat n'est pas en fin de vie, il attend une
    décision ;
  - **une facture sans date de réception n'est jamais « ancienne »** — son
    ancienneté est inconnue, pas nulle et pas infinie ;
  - les pastilles sont affichées **sans qu'il faille déplier le contrat** :
    une alerte qu'on ne voit qu'en ouvrant la fiche concernée ne sert à rien.
- **La consommation d'un contrat intègre enfin ses commandes** — c'est le
  branchement resté ouvert depuis le 08/08/2026 (« le module EPCM ne remonte
  pas encore sa consommation au contrat `PERSONNEL_EPCM` »). Il n'était pas
  possible avant le lot 3 : une commande vivait dans le document de sa fiche,
  et l'atteindre depuis le référentiel des contrats aurait demandé de charger
  toutes les fiches. Depuis que les commandes ont leur collection, une seule
  lecture suffit. **Ce qui compte est la facture, pas la commande** : une
  commande passée est un engagement, pas une consommation.
- **Les deux sources restent séparées** (`totalSaisi` / `totalCommandes`) et ne
  sont pas fondues dans un seul nombre : sans ça, une même dépense saisie à la
  main *et* facturée sur une commande passerait pour deux consommations sans
  qu'on puisse le voir. L'écran affiche la décomposition.
- **Double comptage évité dans l'onglet Contrats d'une fiche projet** : il
  repart de `totalSaisi` et non du total du moteur, parce qu'il ajoute
  lui-même les factures des commandes — et il en voit **plus** que le moteur
  (celles restées dans les fiches, avant migration).
- **Limite connue, dite à l'écran** : le moteur ne voit que les commandes de la
  collection. Le contrat signale combien de ses commandes vivent encore dans
  une fiche projet et renvoie vers Paramètres › Maintenance, plutôt que
  d'afficher un total qui paraît complet.
- **Aucune règle Firestore à déployer** pour ce lot.
- **Pas de tests, à la demande explicite de l'utilisateur.** `tsc -b`,
  `npm run lint`, `npm run build` et les 371 tests existants passent.
- **État du module : 40 points sur 41 faits.** Reste **CTR-41**, à clarifier :
  la colonne « EN COURS DE TRAITEMENT » du fichier de suivi Excel ne
  correspond à aucune des six étapes du texte — aucune septième n'a été
  inventée, et le tableau des factures le dit en pied. Et **trois règles
  `firestore.rules` restent non déployées** pour ce module :
  `contrats/{id}/avc`, `commandes` et `commandes/{id}/augmentations`.

**Module EPCM — recueil de `doc/EPCM.docx` puis lot 1 (26/08/2026, « on fera
le même process avec le fichier suivant », puis « on y va lot 1 »)** —
`doc/recueil-module-epcm.md` relève **75 points** (EPCM-01 à EPCM-75) et pose
un plan en **7 lots**. Seul le lot 1 est livré.

- **Le fichier est en deux parties de nature différente** : une **note d'UX**
  en ouverture, donnée explicitement comme des pistes (« que des exemples, tu
  peux faire à ta sauce »), puis une **spécification numérotée** §1 à §8 + 4
  KPI, qui fait foi. Deux remarques sur le fichier lui-même : **sa liste d'UX
  saute de 1 à 5** (les items 2, 3 et 4 n'y sont pas — rien n'a été deviné à
  leur place), et il ne contient ni tableau ni capture.
- **Trois constats qui structurent le plan** : le §6 **renverse l'onglet
  « Suivi financier »** (« cet onglet concerne les contrats des collaborateurs
  et non le contrat EPCM principal » — or c'est exactement ce qu'il contient
  aujourd'hui) ; le §5 demande de **supprimer l'onglet Rotations** au profit de
  la fiche du personnel, seule suppression du document ; et le §7 devient
  possible grâce au module Contrat livré la veille (commandes sans fiche
  projet, valeur cible, AVC, factures).

**Lot 1 — la fiche personnel complétée** (EPCM-26→35, 52→60) :
- **`FormulaireEtapes` gagne un type de champ `lignes`** (lignes dynamiques).
  C'était jusqu'ici *la* mécanique qui obligeait un formulaire à garder son JSX
  propre — habilitations HSE et périodes de renouvellement en avaient toutes
  deux besoin **dans le même écran**, ce qui justifiait de l'ajouter au moteur ;
  un seul besoin ne l'aurait pas fait. Les lignes portent un `id` qui sert de
  clé React : avec l'index, supprimer une ligne du milieu ferait glisser l'état
  des suivantes. `SelectChamp` gagne au passage des **libellés** (`AGREMENT` →
  « Freelance (agrément) », un identifiant d'employé → son nom).
- **L'expiration de la visite médicale est calculée, jamais stockée**
  (`expirationVisiteMedicale`, +12 mois — la règle est dans le document). La
  saisir en double permettrait aux deux valeurs de diverger.
- **Une habilitation sans date d'expiration n'expire jamais** : contrairement à
  la visite médicale, le document ne donne **aucune durée commune** pour les
  habilitations, et elles n'ont pas toutes la même — en inventer une ferait
  expirer des habilitations valides.
- **`finContratEffective()`** : la fin du contrat, ou celle du dernier
  renouvellement si elle est postérieure. Un renouvellement **repousse**
  l'échéance ; afficher la date initiale ferait croire à une expiration
  imminente et déclencherait l'alerte pour rien.
- **Le binôme est un lien, pas un nom recopié** : `binomeId` désigne un autre
  employé, choisi dans la liste. Recopier le nom romprait le binôme au premier
  renommage. La personne en cours d'édition est exclue de la liste — on ne peut
  pas être son propre binôme.
- **`TypeAffectationEmploye` (fiche) est distinct de `TypeAffectation`
  (journée de planning)** et les deux coexistent : l'un dit où la personne est
  rattachée, l'autre ce qu'elle a fait le 12 août. Le site quitte l'étape
  « Emploi » pour l'étape « Affectation », où il a un sens.
- **Les deux options de salaire coexistent** (taux journalier / brut + net) :
  le document les présente comme un choix, mais rien ne permettrait de déduire
  l'une de l'autre, et interdire la seconde ferait perdre une donnée réelle.
- **Le budget client devient obligatoire dans le formulaire**, pas dans le
  type : les fiches déjà saisies n'en ont pas, elles affichent « à définir »
  plutôt qu'une valeur prêtée (même traitement que le coût journalier).
- **Aucune migration** : `normaliserEmploye()` complète les fiches déjà en base
  **à la lecture**, avec des absences (`null`, liste vide) et jamais des
  valeurs de substitution. Écrit champ par champ et non par spread de défauts —
  le type déclare ces clés comme présentes, TypeScript considérerait donc que
  le spread de la fiche les écrase toujours, alors que ce sont précisément les
  clés qui manquent.
- **Aucune règle `firestore.rules` à déployer** : `epcm_employes` et
  `epcm_contrats` sont déjà couvertes.
- **Pas de tests, à la demande explicite de l'utilisateur.** `tsc -b`,
  `npm run lint`, `npm run build` et les 371 tests existants passent.
- **Reste ouvert** : lots 2 à 7 — rotations dans la fiche et **planning
  généré** (cycle 28/28, week-ends compris), **pointage pré-rempli**,
  **rattachement au module Contrats**, **volet HSE** (1 jour pointé = 12 h,
  la règle du CRJ), **KPI et lien aux projets**, **page d'accueil et
  chronologie**. Le lot 6 est **bloqué par trois questions** (§13 du recueil) :
  aucun **livrable** n'est suivi, l'état « prêt à passer à l'étape suivante »
  n'existe sur aucune fiche projet, et le module n'a **aucun lien avec les
  projets**.

**Module EPCM — lot 2 : rotations dans la fiche et planning généré
(26/08/2026)** — §3 et §5 de `doc/EPCM.docx`.

- **L'onglet « Rotations » est retiré** (§5 : « créer un onglet spécifique
  Rotation n'est pas nécessaire, la logique doit être intégrée directement
  dans la fiche du personnel ») : le module passe de **10 à 9 onglets**. La
  collection `epcm_rotations` reste **lue** — les rotations déjà enregistrées
  alimentent toujours `rotationDerivee` et l'alerte « rotation incomplète » —
  elle n'est simplement plus alimentée depuis l'application.
  `RotationsTab.tsx`, `enregistrerRotation` et `supprimerRotation` restent sur
  disque, inatteignables : c'est une capacité que le document dit de ne plus
  exposer, pas une capacité à détruire (même traitement que `NewProjectModal`
  ou `ActivitesTab`).
- **`genererPlanning()` (pur)** : cycle **28 jours sur site / 28 de repos**
  pour une affectation offshore ou onshore, **week-ends compris** — le rang du
  jour dans le cycle décide, sans regarder le jour de la semaine, c'est le sens
  de « les week-ends sont travaillés ». Pour une affectation bureau, jours
  ouvrés seulement : les samedis et dimanches sont **laissés vides** et non
  posés en repos, un samedi non planifié se distinguant ainsi d'un samedi
  déclaré chômé.
- **Le binôme reçoit le cycle inversé dans le même geste**
  (`propositionsAffectation`, `decale`) — « Stan 28 jours ON, Armel 28 jours
  OFF, puis inversion du cycle ». Il n'est proposé que si **son** affectation
  est renseignée : générer sur une fiche vide poserait des jours sur une
  période qui n'est pas la sienne.
- **Deux garde-fous, qui décident de la sûreté du lot** :
  - **un jour déjà planifié n'est jamais écrasé** — c'est ce qui rend la
    génération rejouable ; sans lui, regénérer effacerait les exceptions
    saisies à la main, c'est-à-dire tout le travail de l'utilisateur. Dit à
    l'écran, pas seulement dans le code ;
  - **le chevauchement reste autorisé** (§5, passation de binômes) : la
    génération ne vérifie **aucune exclusivité**, deux personnes peuvent être
    sur site le même jour. C'était le piège à ne pas créer en automatisant.
- **Elle montre avant d'écrire** (`GenerationPlanningModal`) : nombre de jours
  à poser par type, jours déjà planifiés donc conservés, période et mois
  couverts, pour la personne **et** son binôme. Poser plusieurs mois de
  planning est un geste large — même parcours que les migrations de
  Paramètres › Maintenance.
- **Écart avec le plan, tranché ici** : la génération **exige une date de fin
  d'affectation**. Sans borne, elle n'aurait pas d'horizon — le document ne dit
  pas jusqu'où aller, et choisir à sa place poserait des mois de planning que
  personne n'a demandés. L'écran l'annonce au lieu d'échouer, et le bouton
  n'apparaît que quand l'affectation est complète.
- **Les trois sites du §5 (AGM, TRM, IM) sont proposés** depuis le référentiel
  commun `CHAMPS`, que l'application connaît déjà : ce n'est pas inventer une
  donnée, c'est réutiliser la sienne. La liste reste ouverte. **Les 2
  superviseurs par site ne sont pas pré-créés** — la règle fondatrice du module
  (aucun employé inventé) tient toujours.
- Nouveau `parMois()` : le planning s'écrit **un document par employé et par
  mois**, alors qu'une génération s'étale sur plusieurs — `appliquerPropositions`
  (page) découpe et écrit mois par mois.
- **Aucune règle `firestore.rules` à déployer** : `epcm_planning` est déjà
  couverte.
- **Pas de tests, à la demande explicite de l'utilisateur.** `tsc -b`,
  `npm run lint`, `npm run build` et les 371 tests existants passent.
- **Reste ouvert** : lots 3 à 7 — **pointage pré-rempli** (lot 3, la suite
  naturelle : le planning existe maintenant pour l'alimenter), rattachement au
  module Contrats, volet HSE, KPI, page d'accueil.

**Module EPCM — lot 3 : pointage pré-rempli (26/08/2026)** — §4 de
`doc/EPCM.docx` (« l'objectif est de réduire les saisies manuelles »).

- **`preremplirPointage()` (pur)** : chaque jour du planning qui compte comme
  travaillé est posé comme présent. **C'est la table `AFFECTATIONS` qui
  décide** — celle-là même qui décide des jours travaillés — donc congés,
  repos et absences sont exclus **par construction** (§4 : « les jours de
  congés précédemment enregistrés sont exclus automatiquement »). La règle
  n'est pas réécrite une seconde fois : changer la table les change tous les
  deux ensemble.
- **Un jour déjà pointé n'est jamais réécrit**, même garde-fou que la
  génération du planning : relancer ne perd aucune correction.
- **Les heures par jour ne sont pas devinées.** Le champ est proposé, **vide
  par défaut** : le document ne dit pas ce que vaut une journée de pointage —
  sa règle « 1 jour = 12 h » du §8 sert à calculer les **heures HSE**, pas à
  décrire un horaire de bureau. Sans horaire, le jour est posé comme présent
  et `jourTravaille` le compte via son affectation.
- **Nouveau marqueur `prerempli` sur `PointageJourEpcm`** — un ajout délibéré
  que le document ne demande pas. Un jour posé par la machine est une
  **déduction du planning**, un jour saisi est une **déclaration** : les
  confondre ferait passer une hypothèse pour un constat dans les coûts et les
  rapports. La distinction **ne change rien aux calculs** (un jour pré-rempli
  compte comme travaillé), elle se lit à l'écran — teinte et infobulle — et
  **tombe dès que la case est reprise à la main**.
- **`enregistrerJoursPointage()`** : une écriture par employé au lieu d'une
  par jour, et **une entrée d'audit récapitulative** plutôt qu'une par jour —
  un mois complet ferait sinon une trentaine d'écritures et autant d'entrées
  pour un seul geste. Le détail des jours est dans le pointage lui-même.
- **Elle montre avant d'écrire** (`PreremplissageModal`), comme la génération
  du planning : jours à poser, déjà pointés donc conservés, et **écartés**
  (congé, repos, absence). Un mois sans planning le dit et renvoie vers la
  génération, plutôt que d'afficher un zéro muet.
- **Aucune règle `firestore.rules` à déployer** : `epcm_pointages` est déjà
  couverte.
- **Pas de tests, à la demande explicite de l'utilisateur.** `tsc -b`,
  `npm run lint`, `npm run build` et les 371 tests existants passent.
- **Reste ouvert** : lots 4 à 7 — **rattachement au module Contrats** (lot 4,
  qui referme la boucle du 08/08/2026 et dépend des **règles Firestore du
  module Contrat, toujours non déployées**), volet HSE, KPI, page d'accueil.

**Module EPCM — lot 4 : rattachement au module Contrats (26/08/2026, « on y va
mais en s'appuyant sur le fichier comme base »)** — préambule et §7 de
`doc/EPCM.docx`. **Ce lot referme la boucle ouverte le 08/08/2026** (« le
module EPCM ne remonte pas encore sa consommation au contrat
`PERSONNEL_EPCM` »).

- **`ContratEpcmDoc.contratPortfolioId`** rattache le contrat EPCM à celui du
  module Contrats — le préambule le dit sans ambiguïté : « le contrat EPCM
  existe déjà dans le module Contrats ; pour tout ce qui concerne les
  commandes, avenants, valeurs contractuelles et factures, nous conservons la
  logique déjà présente ». Une fois rattaché, **valeur cible, AVC et
  consommation sont affichés en lecture** et l'écran dit qu'ils ne se
  saisissent pas ici : les redemander ferait exister deux vérités pour un même
  contrat.
- **Les quatre montants du §7, en quatre tuiles jamais fondues**
  (`comparaisonMensuelle`) : coût du personnel **pointé**, coût **réel payé**,
  montant **facturé au client**, **budget client**. Les additionner ou déduire
  l'un des autres ferait disparaître l'écart qu'ils ont pour objet de montrer.
- **Q7 tranchée en s'appuyant sur le document**, faute de réponse : le « coût
  réel payé » n'est **pas un champ de plus à saisir**, il se déduit du §6, qui
  fait précisément saisir deux formes de rémunération — **salaire mensuel**
  (CDI, CDD), payé quel que soit le nombre de jours, et **taux journalier**
  (freelance sous agrément), payé au jour presté. C'est de là que vient
  l'écart avec le coût pointé : un CDI à 18 jours pointés dans un mois de 22
  coûte le même salaire, alors que son coût *pointé* baisse. Une rémunération
  non renseignée est **comptée pour rien et signalée**, jamais devinée
  (`coutReelPaye` rend `null`).
- **Le montant facturé vaut `null`, et non `0`, sans rattachement** : un
  montant facturé inconnu n'est pas un montant facturé nul. Il est lu sur les
  **factures des commandes** du contrat lié — `toutesCommandesContrat`, donc
  **y compris les commandes sans fiche projet**, qui sont justement le cas
  d'un contrat EPCM (lot 3 du module Contrat).
- **`joursCommandes` sur le contrat EPCM** : la donnée d'entrée du KPI « taux
  de consommation des jours commandés », qui n'existait nulle part —
  l'application savait compter les jours consommés, pas ceux qui avaient été
  achetés. `tauxConsommationJours` rend **`null` sans jours commandés** :
  sans dénominateur il n'y a pas de taux, et en supposer un donnerait un
  pourcentage d'apparence officielle assis sur rien.
- **EPCM-65 (coûts complémentaires ponctuels) est couvert sans rien ajouter**
  côté EPCM : ce sont des commandes ou des factures du module Contrats, où le
  préambule les envoie explicitement — les rattacher au contrat lié les fait
  entrer dans le montant facturé.
- **Aucune règle `firestore.rules` à déployer pour ce lot** — mais il **dépend
  en pratique** des trois règles du module Contrat toujours non déployées
  (`contrats/{id}/avc`, `commandes`, `commandes/{id}/augmentations`) : sans
  elles, les commandes sont lues vides et le montant facturé restera à 0.
- **Pas de tests, à la demande explicite de l'utilisateur.** `tsc -b`,
  `npm run lint`, `npm run build` et les 371 tests existants passent.
- **Reste ouvert** : lot 5 (**volet HSE** — 1 jour pointé = 12 h, la règle du
  CRJ), lot 6 (**KPI et lien aux projets**, toujours bloqué par Q1/Q2/Q3) et
  lot 7 (page d'accueil et chronologie).

**Module EPCM — lot 5 : volet HSE (26/08/2026)** — §8 de `doc/EPCM.docx`
(« le module HSE doit être ajouté »). Nouvel onglet `HseTab`, collection
`epcm_hse`, le module passe de 9 à 10 onglets.

- **Rien n'a été réinventé** : les 8 compteurs (FAT, LTI, CHSE, MTC, FAC, HPI,
  anomalies, audits) et les formules **LTIF / TRIR / HPIF** viennent de
  `types/hse.ts`, le modèle HSE du reste de l'application. C'est ce que dit le
  §8 — « les indicateurs suivis seront les mêmes que ceux utilisés dans les
  autres modules » — et deux jeux d'indicateurs auraient donné deux LTIF non
  comparables. **Le TRIR est calculable ici**, contrairement à la synthèse HSE
  du CRJ (13/08/2026) : ce module saisit bien CHSE et MTC.
- **Les heures travaillées ne se saisissent pas** : jours pointés × 12
  (`HEURES_PAR_JOUR_POINTE`, §8 : « 1 jour pointé = 12 heures travaillées ;
  20 jours pointés = 240 heures »). Elles ne sont **jamais stockées** — le §8
  demande précisément de les automatiser, les saisir en double permettrait aux
  deux valeurs de diverger. À noter : **c'est déjà la règle du CRJ**, vérifiée
  sur données réelles le 30/07/2026 ; le document rappelle une convention de
  l'application, il n'en invente pas une.
- **Suivi hebdomadaire** (§8) : un relevé par semaine, **doc ID = le lundi**
  de la semaine — réenregistrer la même semaine met à jour au lieu d'empiler
  des doublons, un incident ne doit pas compter deux fois parce que la saisie
  a été reprise. Le champ de date recale sur le lundi à la saisie, et la
  semaine n'est plus modifiable une fois le relevé créé.
- **Champ « Faits marquants »** (§8) : le récit que les compteurs ne disent
  pas. La **traçabilité** passe par `epcm_historique`, comme toutes les
  écritures du module.
- **Les « alertes HSE ouvertes » excluent causeries et audits** : ce sont des
  actions de **prévention**, pas des incidents — les compter ferait monter
  l'alerte au moment où la prévention progresse. Elles comptent FAT, LTI,
  CHSE, MTC, FAC et HPI.
- **Le tableau de bord reçoit trois cartes** (§1 : « il devra intégrer […] les
  indicateurs HSE ») : alertes HSE ouvertes, heures travaillées et LTIF. Un
  compteur à zéro reste affiché en vert : ici, zéro est une bonne nouvelle
  qu'on vient vérifier.
- **Règle `firestore.rules` : `epcm_hse`** (lecture / écriture connecté, comme
  les autres collections du module). **Ajoutée localement, PAS ENCORE
  DÉPLOYÉE.**
- **Pas de tests, à la demande explicite de l'utilisateur.** `tsc -b`,
  `npm run lint`, `npm run build` et les 371 tests existants passent.
- **Reste ouvert** : lot 6 (**KPI et lien aux projets**, toujours bloqué par
  Q1/Q2/Q3 — aucun livrable n'est suivi, l'état « prêt à passer à l'étape
  suivante » n'existe nulle part, et le module n'a aucun lien avec les
  projets) et lot 7 (page d'accueil et chronologie).

**Module EPCM — lot 7 : page d'accueil et chronologie (26/08/2026, « on y va
avec le dernier lot mais en restant fidèle sur le document »)** — la note
d'expérience utilisateur de `doc/EPCM.docx` (« je dois comprendre la situation
en moins de 10 secondes »). Nouvel onglet **Accueil**, en tête du module, qui
passe à 11 onglets.

- **Les six cartes sont celles du document**, dans son ordre et avec ses
  couleurs (🟢 personnel mobilisé · 🔵 en rotation · 🟠 contrats à renouveler
  sous 30 jours · 🔴 alertes HSE ouvertes · 🟣 consommation contrat ·
  📈 projets livrés dans les délais). « Personnel mobilisé » est le **total**
  que le document demande — le tableau de bord ne le donnait qu'éclaté en sur
  site / bureau / rotation.
- **Deux points restent vides, et l'écran le dit** : la carte « Projets livrés
  dans les délais » et l'alerte « Projets en retard ». Le module n'a **aucun
  lien avec les projets** (Q3 du recueil, sans réponse). La carte est
  **affichée avec sa raison** (« aucun projet rattaché au contrat ») plutôt
  que supprimée : elle est demandée, et un chiffre inventé y serait pire que
  son absence.
- **Tout est dérivé, rien ne se saisit pour alimenter l'accueil** :
  - « qui est sur quel site » (`effectifParSite`) — un site non renseigné
    forme son propre groupe plutôt que de disparaître : la personne est bien
    sur site, c'est le site qui manque ;
  - « qui monte, qui descend » (`mouvementsRotation`) — lu **dans le
    planning** : un jour sur site précédé d'un jour qui ne l'est pas est une
    montée, l'inverse une descente. Projeté sur 14 jours ;
  - la **chronologie** (`chronologieEpcm`) — mobilisations, rotations,
    événements HSE et contrats, exactement les quatre natures des exemples du
    document. Un journal saisi à la main divergerait des faits dès la première
    omission. **À ne pas confondre avec l'onglet Historique**, qui est un
    journal d'audit (qui a modifié quel champ) et non une chronologie métier.
    Une semaine HSE sans incident n'y entre pas : la chronologie ne liste que
    ce qui s'est passé.
- **La vue Alertes reçoit les sept regroupements du document** : contrats à
  30 j (critique) et à 60 j (attention), visites médicales expirées,
  habilitations expirées, personnel absent, factures en attente. Cinq
  nouvelles catégories (`CONTRAT`, `VISITE_MEDICALE`, `HABILITATION`,
  `ABSENCE`, `FACTURE`). Trois précautions :
  - **un seul niveau par contrat** — le même contrat ne produit pas deux
    alertes à 30 et à 60 jours ;
  - **une visite jamais renseignée n'est pas une visite expirée** : c'est une
    information manquante, et les deux appellent des actions différentes ;
  - **sans contrat rattaché, l'alerte « factures » ne dit rien** plutôt
    qu'annoncer « 0 facture en attente », qui serait rassurant et faux
    (`facturesEnAttente: null` ≠ `0`).
- `ContexteAlertes` est **optionnel** : `construireAlertes` reste utilisable
  sans lui et rend alors les seules alertes du CDS d'origine.
- **Aucune règle `firestore.rules` à déployer** pour ce lot.
- **Pas de tests, à la demande explicite de l'utilisateur.** `tsc -b`,
  `npm run lint`, `npm run build` et les 371 tests existants passent.
- **État du module : 66 des 75 points faits, six lots sur sept livrés.** Seul
  le **lot 6 (KPI et lien aux projets)** reste, **bloqué par Q1, Q2 et Q3** —
  aucun livrable n'est suivi, l'état « prêt à passer à l'étape suivante »
  n'existe sur aucune fiche projet, et le module n'a aucun lien avec un
  portefeuille de projets. Les 5 points ⬜ et les 2 🟡 restants en dépendent
  tous.
- **Rappel des règles Firestore en attente sur `driver-6ae2b`** :
  `contrats/{id}/avc`, `commandes`, `commandes/{id}/augmentations` (module
  Contrat) et `epcm_hse` (lot 5).

**Contrat peinture — recueil de `doc/Contrat peinture.docx` puis lot 1
(27/08/2026, même méthode que `module contrat.docx` et `EPCM.docx`)** —
`doc/recueil-module-contrat-peinture.md` relève **93 points** (PEINT-01 à
PEINT-93) et pose un plan en **6 lots**. Seul le lot 1 est livré.

- **Le document est en deux parties** : « La feuille DATA » (le modèle de
  productivité du contrat — objectif 10 m²/jour, équipe de référence 1 chef +
  2 peintres, coefficients 0,5 / 1, rendement 10 / 2,5 = 4 m² par unité
  productive) puis « FEUILLE JOURNAL » (§1 à §11 + « Résultat attendu »).
  Tout y est prescriptif — contrairement à `EPCM.docx`, rien n'est présenté
  comme une piste libre. Ni tableau ni capture : `word/media/` est absent de
  l'archive.
- **Quatre anomalies du fichier**, dites dans le recueil plutôt que devinées :
  la section « 4. Logique métier - Productivité » **est vide** (deux mots,
  « Feuille DATA » — un renvoi, numéroté PEINT-27 et exclu des décomptes) ; le
  titre de la section 1 est **tombé au milieu de sa première puce** ; et le §6
  **se contredit** (« l'utilisateur renseigne le pourcentage réel », puis un
  exemple où il renseigne la surface et où le système calcule le pourcentage —
  c'est ce second cas que l'application fait déjà).
- **Le constat central, trouvé en lisant le code avant d'écrire un statut** :
  *le modèle de productivité du document est déjà entièrement en base, et
  n'est branché sur rien*. `objectifJourM2 = 10`, `nombreHeures = 12`,
  `chefEquipeObjectif = 2`, `peintreObjectif = 4` et `TarifPeinture.coefficient`
  (1 pour un peintre, 0,5 pour un chef) sont lus — `grep` sur tout `src/` —
  **uniquement par `colonnes.tsx` et `TarifsTab.tsx`**, c'est-à-dire pour être
  affichés en tableau. Et la colonne « Cible / jour », qui porte exactement 8
  pour 2 peintres et 2 pour 1 chef sur 640 lignes réelles, est un **champ de
  saisie**. Les deux extrémités de la chaîne existent, le calcul entre les
  deux n'existe pas.
  - **Réserve inscrite dans le recueil** : le classeur n'exerce qu'**une seule
    configuration d'effectif** (2 peintres + 1 chef, l'équipe de référence,
    640 lignes sur 640). La formule `cible = effectif × objectif du profil`
    concorde partout, mais les données ne la testent pas sur un autre
    effectif — elle est reprise du document, pas induite des données.
- **Trois écarts entre le document et les 2 124 lignes réelles**, qui font
  trois des cinq questions bloquantes : `STBY SITE TG` (128 lignes, 2ᵉ cause du
  classeur) n'est **dans aucune des deux listes de causes**, tandis que
  `STBY ICP` et `STBY GMI` du document n'apparaissent nulle part ; **237 des
  345 lignes de stand-by portent un projet** alors que le §10 dit « journalier
  et **non par projet** » ; et `Grit` / `M02` / `T02` sont classés `MATERIEL`
  par la feuille DATA mais `Consommable` par le JOURNAL et par le §8.

**Lot 1 — l'onglet Paramètres** (PEINT-02, 12, 57, 73→84, 93) : nouvel onglet
**Paramètres › Contrat peinture**, collection `peinture_parametres` (un
document `contrat`), `lib/contratPeintureParametres.ts` (reprise et
normalisation, pur).

- **Pourquoi dans Paramètres et non dans le module** : le §8 le demande
  explicitement (« ces informations seront gérées dans l'onglet Paramètres »),
  et c'est le régime déjà retenu pour les Tarifs NPT du CRJ le 23/08/2026 — un
  réglage d'administration se règle là où se règlent les autres, sous les mêmes
  droits (lecture connecté, écriture admin). L'onglet « Tarifs & objectifs
  (DATA) » du module reste la vue du classeur importé et **renvoie vers
  Paramètres**, pour qu'on n'y cherche pas un champ modifiable qui n'y est pas.
- **L'écran ne tranche aucune des questions ouvertes, et le dit.** Les listes
  de consommables et d'équipements partent **vides** ; les types d'item tarifés
  du classeur sont proposés dans un encart à part (« Types d'item tarifés du
  classeur, à classer ») avec un bouton **→ Consommables** et un bouton
  **→ Matériel**. Semer l'une des deux listes aurait répondu à la place de
  l'utilisateur sur une classification qui commande ensuite le tarif appliqué.
  Les causes de stand-by, elles, sont reprises du référentiel : il en porte
  **exactement les six du §10**, les deux sources concordent, il n'y a rien à
  trancher.
- **Les heures incompressibles par site restent vides** (« Non défini ») : le
  document demande « une valeur par défaut […] pour chaque site » **sans en
  donner aucune**, et le classeur n'en porte pas non plus. Un 0 se lirait comme
  « aucun stand-by incompressible » — or c'est la cause la plus fréquente du
  classeur (168 lignes sur 345). Même traitement pour l'unité des consommables,
  que le §8 dit `m²` et que les 382 lignes réelles portent en `hr`.
- **Reprise sans migration** : tant que le document n'existe pas, l'écran sert
  les valeurs du référentiel DATA importé **et le signale**, et « Enregistrer »
  écrit ce que l'admin a sous les yeux — le patron du référentiel des devises
  (18/08/2026). Le blob du classeur n'est jamais réécrit.
- **Une seule expression du coefficient**, là où le classeur en a trois
  (`coefficient`, `peintrePct`, `peintreObjectif`) : les deux autres se
  déduiront de l'objectif au lot 2. Les garder toutes les trois les laisserait
  diverger au premier changement d'objectif — exactement ce que le document
  interdit (« si demain l'objectif change, la logique doit rester la même »).
- **Un seul champ se déclare une fois** : le §11 range les heures par site sous
  « Productivité » et les heures incompressibles sous « Stand-by » ; l'écran
  respecte ce découpage mais les deux blocs lisent **la même liste de sites**.
  Deux listes séparées auraient fini par diverger.
- **Le forfait ne se devine pas depuis un tarif, il se déclare** : la case
  « Inclus dans le forfait journalier » est décochée par défaut sur tout
  équipement repris, y compris « Forfait matériel Core Crew ».
- **Ce que le lot ne fait pas, et pourquoi PEINT-12 reste 🟡** : aucun calcul
  ne lit encore ces paramètres. « Cible / jour » reste un champ saisi, et
  changer l'objectif ne change toujours aucun chiffre — c'est le **lot 2** qui
  branche le modèle (capacité productive, rendement par unité, objectif par
  profil, objectif journalier depuis les effectifs).
- Règle `firestore.rules` ajoutée (`peinture_parametres` : lecture connecté,
  écriture admin), **PAS ENCORE DÉPLOYÉE** — même réserve que toutes les règles
  du projet partagé `driver-6ae2b`. Sans déploiement, la lecture échoue,
  l'incident est signalé, et l'écran retombe sur le référentiel DATA importé.
- **Pas de tests, à la demande explicite de l'utilisateur.** `tsc -b`,
  `npm run lint`, `npm run build` et les 371 tests existants passent.
- **Reste ouvert** : lots 2 à 6 — modèle de productivité calculé, **statut
  d'affaire et reprise du rapport de la veille** (ce que le document appelle
  deux fois « essentiel » et « le cœur du module »), en-tête et catégories
  différenciées, consommables/matériel/forfait, mesure de la performance.
  **Cinq des neuf questions bloquent un lot**, et trois d'entre elles (Q3, Q4,
  Q5) viennent d'un écart entre le document et le classeur, pas d'une
  imprécision de rédaction.

**Contrat peinture — lot 2 : le modèle de productivité devient un calcul
(27/08/2026)** — partie « La feuille DATA » de `doc/Contrat peinture.docx`.
Nouveau `lib/contratPeintureProductivite.ts` (pur).

- **La chaîne du document, portée telle quelle** : capacité productive =
  Σ (effectif × coefficient) → rendement par unité = objectif ÷ capacité de
  **l'équipe de référence** (10 ÷ 2,5 = 4 m²/jour) → objectif d'un profil =
  rendement × coefficient (chef 2, peintre 4) → objectif d'une journée =
  Σ (effectif réel × objectif du profil).
- **⚠️ Le lot 1 s'était trompé de modèle, et c'est corrigé ici** : il affirmait
  — dans le type, dans le moteur de reprise, dans l'écran et dans le recueil —
  que l'équipe de référence « n'entre dans aucun calcul ». **C'est sa capacité
  productive qui est le dénominateur du rendement** : sans elle, le 4 m² par
  unité ne se déduit de rien, ni les objectifs par profil qui en découlent.
  L'aide de l'écran dit désormais « La modifier change tous les objectifs ».
- **Vérifié contre le classeur avant d'être écrit, puis re-vérifié sur le code
  TypeScript** : la chaîne rejoue les **6 valeurs figées du bloc « objectifs »
  de la feuille DATA** sur les 3 champs (`chefEquipeObjectif` 2,
  `peintreObjectif` 4, `chefEquipePct` 0,2, `peintrePct` 0,4) — **0 écart** —
  et retrouve `cibleJour` et `productiviteParProfil` sur les **640 lignes de
  pointage PERSONNEL** du JOURNAL — **0 écart**. La boucle se referme :
  appliqué à l'équipe de référence, le modèle redonne 10 m²/jour ; 4 peintres
  + 1 chef donnent 18 m². **Réserve inscrite dans le code** : le classeur
  n'exerce qu'une seule configuration d'effectif (2 peintres + 1 chef, 640
  lignes sur 640) — la formule est reprise du document, pas induite des
  données.
- **Deux colonnes cessent d'être saisies** : « Cible / jour » et
  « Productivité / profil » de l'étape « Coûts » du formulaire deviennent
  dérivées (`productiviteDeLaLigne`). Le commentaire qui les gardait en saisie
  depuis le 06/08/2026 (« aucune formule ne les reproduit dans les données
  réelles ») n'est plus vrai : le document donne la formule. À noter,
  `productiviteParProfil` n'est pas une productivité constatée mais **la part
  contractuelle du profil** (0,4 / 0,2) — elle ne dépend pas de l'effectif,
  ce que les 640 lignes confirment.
- **Le moteur du classeur n'est pas touché** : `deriveLigneJournal` reproduit
  les formules de la feuille JOURNAL et est verrouillé par 12 tests sur 2 124
  lignes. La productivité est une **seconde couche**, appliquée à côté, comme
  `coutsUnitairesDuTarif` depuis le 06/08/2026.
- **Ce qui n'est pas livré est affiché, pas masqué** — PEINT-48 (productivité
  réelle) et PEINT-49 (écart objectif / réalisation) : ils demandent la
  production **d'une journée**, or le JOURNAL enregistre la surface réalisée
  **à date** (cumulée) et **son écart d'un jour à l'autre décroît sur 118 des
  625 transitions** du classeur. Trois clés de regroupement ont été essayées
  (projet+tâche+site, puis avec l'avis, puis avec la période) : aucune ne les
  fait disparaître (118 → 115 → 111). Ni `max(0, …)` ni moyenne de
  substitution — la carte « Productivité théorique du jour » dit en pied
  pourquoi le réalisé n'y est pas, et la question part en Q10 du recueil. Les
  deux points basculent au lot 3, où la reprise d'une affaire d'un rapport au
  suivant rend la production du jour explicite.
- **Trois règles de sûreté**, les mêmes que partout ici : une valeur en place
  n'est **jamais écrasée par du vide** (la moitié des lignes réelles ne sont
  pas des pointages de personnel) ; un champ inconnu rend `null` et **ne
  retombe pas sur un autre** (les 3 champs portent aujourd'hui les mêmes
  valeurs — s'appuyer dessus serait vrai maintenant et faux au premier qui
  diverge) ; un profil sans coefficient **est nommé à l'écran** et ne compte
  pas, un objectif silencieusement trop bas étant pire qu'un objectif absent.
- **Les noms des deux profils ne sont pas codés en dur** :
  `effectifsDeReference` retrouve « le peintre » et « le chef » par leur
  coefficient (le plus élevé est le plus productif, ce que dit le document)
  plutôt que par les chaînes « Peintre » et « Chef d'Equipe » — renommer un
  profil dans les paramètres ne casse pas le calcul.
- **Aucune règle `firestore.rules` à déployer** pour ce lot ; il ne lit que
  `peinture_parametres`, déjà ajoutée localement au lot 1 (**toujours non
  déployée** — sans elle, l'écran retombe sur le référentiel DATA importé, et
  le calcul tourne sur ces valeurs-là).
- **Pas de tests ajoutés, à la demande explicite de l'utilisateur** — les
  vérifications ci-dessus ont été passées sur un fichier temporaire, exécuté
  puis supprimé. `tsc -b`, `npm run lint`, `npm run build` et les 371 tests
  existants passent.
- **Reste ouvert** : lots 3 à 6. Le **lot 3** est celui que le document appelle
  deux fois « essentiel » et « le cœur du module » (statut d'affaire et reprise
  du rapport de la veille) ; il est bloqué par **Q5** (le stand-by est-il par
  projet ou par jour ?) et **Q10** (la surface réalisée cumulée et ses 118
  transitions décroissantes).

**Contrat peinture — lot 3 : rapport journalier, statut d'affaire et reprise
(27/08/2026, « on y va pour les questions on tiendra compte de ce qui a été dit
dans le fichier commentaire »)** — §1, §2, §3, §6 et §10 de `doc/Contrat
peinture.docx`. C'est le lot que le document appelle deux fois « **essentiel** »
et « le **cœur du module de suivi peinture** ». Nouveau
`lib/contratPeintureRapports.ts` (pur), `components/peinture/RapportPeintureModal.tsx`,
collection `peinture_rapports`.

- **Deux questions tranchées par le document, sur décision explicite de
  l'utilisateur** :
  - **le stand-by est journalier, pas par projet** (§10, littéralement) — les
    lignes STD produites par un rapport ne portent ni projet, ni tâche, ni
    avis, ni fiche projet. **Les 237 lignes importées qui en portent ne sont
    pas réécrites** : le document décrit ce qu'il faut saisir désormais, pas ce
    qu'il faut refaire dans l'historique ;
  - **la surface réalisée est cumulée « à date »** (§6 : « Surface totale
    10 m² · Surface peinte **à date** 2 m² → 20 % »), donc la production d'une
    journée est la différence avec le rapport précédent.
- **Ce qui débloque vraiment la production journalière : un lien, pas une
  copie.** La reprise pose `lignePrecedenteId` sur la ligne du jour. Il n'y a
  donc plus à chercher « la même affaire la veille » — et c'était bien cette
  recherche qui échouait : sur les 114 affaires du classeur, **118 des 625
  transitions décroissent**, et aucune clé plus fine (avis, période) ne les
  fait disparaître (118 → 115 → 111). Les lignes importées n'ayant pas ce lien,
  rien n'y est calculé, et l'écran ne prétend pas le contraire.
- **Le rapport ne duplique pas la donnée, il la regroupe.** Les affaires
  deviennent des lignes de pointage ordinaires, le stand-by des lignes STD ;
  `peinture_rapports` ne porte que ce que le journal ne sait pas dire —
  l'en-tête (§1 : rédacteur, société exécutante, « GMI » par défaut et
  modifiable) et le **total de stand-by déclaré**. Tous les écrans du module
  (pivots, camemberts, coûts, synthèse) continuent de lire le journal sans une
  ligne de changement.
- **Trouvé en vérifiant sur les données réelles, et ce n'était pas l'objectif :
  116 affaires sortent d'un rapport au suivant sans avoir été déclarées
  terminées** (AGM 42, TRM 37, IM 37). Le classeur ne porte aucun statut :
  elles ont simplement cessé d'être recopiées. C'est exactement la ressaisie
  manuelle que le §3 veut supprimer — la reprise ne fait donc pas que gagner du
  temps, **elle rend visible ce qui se perdait**.
- **« La veille » est le rapport précédent, pas J−1 au calendrier**
  (`dateRapportPrecedent`) : un champ qui ne pointe pas le dimanche doit
  retrouver ses affaires le lundi, pas repartir de zéro. C'est aussi ce qui
  répond au §6 (« suivre le projet jusqu'à sa clôture, **même lorsqu'il existe
  des périodes de stand-by** »).
- **L'archivage est la sortie de la reprise, pas une suppression** : une
  affaire « Terminé » cesse d'être reproposée et reste entière dans le journal.
  La masquer fausserait tous les pivots du module.
- **Aucune migration pour le statut** : une ligne sans `statut` est lue « En
  cours », son état de fait dans le classeur. Le repli dit exactement ce qu'une
  migration écrirait — le raisonnement déjà tenu pour le statut des lignes
  navette (20/08/2026). `STATUTS_AFFAIRE_PEINTURE` reste **dans le code** et
  non dans les listes de valeurs : il commande un traitement (reprise,
  archivage).
- **Un seul `writeBatch` par rapport** — affaires, lignes de stand-by et
  en-tête partent ensemble ; un rapport à moitié écrit laisserait une journée
  incohérente sans que rien ne le signale. Et **réenregistrer met à jour au
  lieu d'empiler** : doc ID déterministe pour le rapport (date + champ) et pour
  chaque ligne de stand-by (date + champ + cause), une affaire déjà saisie ce
  jour-là gardant son identifiant.
- **Le contrôle du stand-by bloque l'enregistrement, et c'est délibéré** :
  « le total des causes doit être **obligatoirement** égal au total déclaré ».
  C'est l'un des rares contrôles bloquants de l'application. Défendable ici et
  pas pour le paiement d'une facture (CTR-26, 26/08/2026) : là-bas refuser
  aurait fait perdre un fait déjà constaté ; ici les deux nombres sont sous les
  yeux de qui saisit, et l'un des deux est faux. L'écart s'affiche en direct.
  Une **production négative**, elle, est seulement signalée : ce peut être une
  correction légitime.
- **Une cause absente du référentiel mais déjà enregistrée reste
  sélectionnable** — la retirer du menu effacerait silencieusement une saisie.
  C'est le cas de `STBY SITE TG`, 2ᵉ cause du classeur et absente des deux
  listes (Q4 du recueil).
- **Le pointage ligne à ligne reste** (bouton « Pointage isolé ») : le classeur
  compte des catégories que le rapport ne couvre pas — personnel, consommable,
  matériel. Ce sont les lots 4 et 5.
- Règle `firestore.rules` ajoutée (`peinture_rapports` : lecture/écriture
  connecté, comme `peinture_journal_saisie` dont il est l'en-tête), **PAS
  ENCORE DÉPLOYÉE**, comme `peinture_parametres` du lot 1.
- **Pas de tests ajoutés au dépôt, à la demande explicite de l'utilisateur** —
  10 vérifications ont tourné sur un fichier temporaire, exécuté puis supprimé
  (dont l'exemple de stand-by du document, 8 h = 3 + 1 + 1 + 3, et le fait
  qu'aucune reprise ne doublonne une affaire déjà saisie, sur les 3 champs et
  toutes les dates du classeur). `tsc -b`, `npm run lint`, `npm run build` et
  les 371 tests existants passent.
- **État du module : 64 points ✅ sur 92 comptés, 26 🟡, 2 ⬜.** Les deux
  derniers ⬜ sont **PEINT-17** (qualifier une sous-performance — *aucun seuil
  n'est donné nulle part*) et **PEINT-63** (matériel au forfait, lot 5).
  **Q6 et Q7 ne peuvent pas être tranchées par le document** : il demande une
  valeur par défaut d'heures incompressibles par site et une notion de
  sous-performance sans donner ni valeur ni seuil — les écrans concernés le
  disent au lieu d'afficher un chiffre inventé.

**Contrat peinture — lot 4 : la catégorie commande le formulaire (27/08/2026)**
— §5 à §9 de `doc/Contrat peinture.docx`. Trois écrans touchés, aucun nouveau
modèle de données.

- **Q2 tranchée par le document** (« Le nom de projet peut provenir d'une
  **navette existante** ») : chaque affaire du rapport a un sélecteur listant
  les **lignes navette**, pas les fiches projet. Mais les deux ne s'excluent
  pas — quand la ligne navette choisie porte déjà une fiche,
  **`projetId` en est hérité**, ce qui préserve tout le rattachement existant
  (bloc « Journal peinture » d'une fiche projet, écran Rapprochement). C'est la
  chaîne navette → fiche que l'application construit déjà, pas un second
  vocabulaire. « Activité de routine » est la première option, l'autre cas du
  §6.
- **La catégorie décide des étapes** (§5 : « la compréhension de la colonne
  Catégorie est essentielle ») : les §6 à §10 décrivent cinq saisies très
  différentes, servies jusqu'ici par les mêmes 41 colonnes — une ligne de
  personnel se voyait proposer surfaces, période et priorité. Elle **se choisit
  avant d'ouvrir** (menu « Pointage isolé… ») et n'est plus une saisie libre :
  `FormulaireEtapes` reçoit ses étapes de l'appelant, les calculer depuis une
  valeur interne au formulaire aurait demandé de le réécrire.
  - **Une catégorie inconnue garde toutes les étapes.** Les 6 libellés bruts du
    classeur tombent bien dans les 5 cas — vérifié, casse mélangée comprise
    (`Consommable` → CONSOMMABLE, `Personnel` → PERSONNEL) — mais une valeur
    atypique ne doit pas rendre une ligne importée inéditable.
  - **La casse d'origine est conservée à l'édition** : la normaliser changerait
    la colonne FILTRE du classeur, qui prend ses 4 premiers caractères en
    respectant la casse (`Cons`, `Pers`) — le bug corrigé le 06/08/2026.
  - **`STD` n'est pas proposé** au pointage isolé : le stand-by se déclare pour
    la journée (§10), donc dans le rapport. Ouvrir une ligne STD existante
    reste possible.
- **Section « Personnel mobilisé » dans le rapport journalier** (§7 : « Cette
  catégorie sert **uniquement** à renseigner les effectifs mobilisés et dire si
  c'est du personnel core crew ou hors core crew ») : profil, nombre,
  appartenance, et rien d'autre. Une ligne par profil déclaré, préremplie
  depuis Paramètres. **L'objectif du jour se recalcule pendant la saisie** et
  non depuis ce que le journal porte déjà — c'est le moment où on veut le voir.
- **CORE CREW / HORS CORE CREW devient un choix** (§6) : l'effectif va dans
  `coreCrew` **ou** dans `horsCoreCrew`, jamais dans les deux ; un même profil
  peut avoir une ligne dans chacune, avec des doc ID distincts. Sur les 2 124
  lignes importées, `horsCoreCrew` est vide partout — la distinction existait
  en colonne sans avoir jamais servi.
- **Liste d'avis** (§6, « Numéro d'avis **ou liste des avis** ») : `numerosAvis`
  sur la ligne, saisis séparés par des virgules. **Le premier reste
  `numeroAvis`** — seul lu par le tableau, l'export et la cascade de résolution
  vers une fiche projet ; ajouter une liste sans cela ferait perdre le
  rattachement des lignes existantes. Même convention que `numerosAvisDdm` du
  CRJ (23/08/2026).
- **Piège Vite retrouvé** : `CATEGORIES_SAISIE` et `categoriePeinture()`
  vivent dans `types/contratPeinture.ts` et non dans le fichier du formulaire —
  un module qui exporte composants **et** constantes casse le rafraîchissement
  à chaud. Le lint l'a signalé, comme pour `ui/tonsKpi.ts`.
- **Vérification de bout en bout sur les données réelles** : l'effectif du
  06/03/2026 sur IM relu depuis le classeur — 1 chef d'équipe + 2 peintres,
  tous core crew — passé au modèle du lot 2, **redonne exactement les 10 m²
  contractuels**. Les lots 2, 3 et 4 se referment l'un sur l'autre.
- **Aucune règle `firestore.rules` à déployer** pour ce lot ; il écrit dans
  `peinture_journal_saisie` et `peinture_rapports` (cette dernière **toujours
  non déployée**, comme `peinture_parametres`).
- **Pas de tests ajoutés, à la demande de l'utilisateur** — 6 vérifications sur
  un fichier temporaire, exécuté puis supprimé. `tsc -b`, `npm run lint`,
  `npm run build` et les 371 tests existants passent.
- **État du module : 73 ✅ sur 92 comptés, 17 🟡, 2 ⬜.** Restent le **lot 5**
  (consommables, matériel, forfait journalier — Q3, à laquelle le §8 répond) et
  le **lot 6** (mesure de la performance). Les deux ⬜ sont PEINT-17 (aucun
  seuil de sous-performance n'est donné) et PEINT-63 (matériel au forfait).

**Contrat peinture — lot 5 : consommables, matériel et forfait journalier
(27/08/2026)** — §8 et §9 de `doc/Contrat peinture.docx`. Deux sections de plus
au rapport journalier, un menu déroulant au pointage isolé.

- **Q3 tranchée par le document** : `Grit`, `T02` et `M02` sont des
  **consommables** (§8), contre la catégorie `MATERIEL` que leur donne la
  feuille DATA. Deux précisions qui comptent : **le tarif ne change pas de
  source** — il vient toujours du référentiel DATA **par type d'item**, un
  RECHERCHEV qui ne dépend pas de la catégorie, donc requalifier un item ne
  change aucun coût ; et **les noms courts du classeur sont conservés** (`M02`,
  et non « Système peinture M02 » comme l'écrit le document) — les renommer
  détacherait les 382 lignes qui les portent de leur tarif.
- **Le forfait journalier est proposé, jamais imposé** (§9) : les équipements
  cochés « Inclus dans le forfait journalier » apparaissent d'office dans
  chaque rapport, **quantité 1**, avec le badge « Au forfait ». C'est le seul
  endroit du lot où une valeur est posée sans que le document la donne —
  « comptabilisé automatiquement chaque jour » se lit comme une occurrence par
  jour, au tarif unitaire. Elle reste modifiable, l'écran dit d'où elle vient,
  et **ne rien poser reviendrait au même sans le dire** : une ligne sans
  quantité est déjà facturée au tarif unitaire par `deriveLigneJournal` (la
  règle du 07/08/2026).
- **La proposition n'écrase jamais une saisie et se rejoue sans doublon** : un
  équipement déjà pointé ce jour-là n'est pas reproposé, seulement marqué. Même
  règle que la reprise des affaires (lot 3) et que le pré-remplissage du
  planning EPCM. Et **un équipement hors forfait n'est jamais proposé** — c'est
  littéralement le §9 (« seul le matériel hors forfait devra être saisi
  manuellement »).
- **La catégorie fait partie de la clé du document** (`date, champ, catégorie,
  item`) : rien n'interdit qu'un même nom existe en consommable et en matériel,
  et sans elle l'un écraserait l'autre.
- **La casse du classeur est respectée** — `Consommable` et `MATERIEL`, pas des
  majuscules uniformes : la colonne FILTRE prend les 4 premiers caractères en
  la conservant (`Cons`, `MATE`), et la changer dédoublerait les entrées du
  filtre Catégorie du Journal. C'est le bug du 06/08/2026, vérifié ici sur les
  deux catégories.
- **L'unité suit le consommable choisi et reste paramétrable** : le §8 dit
  `m²`, mais les 382 lignes réelles portent `hr` (Q8) — l'imposer les rendrait
  incohérentes. Le **matériel**, lui, a son unité **imposée à `nombre`**, qui
  est le titre même du §9.
- **Un item enregistré mais absent du référentiel reste dans son menu** (même
  précaution que les causes de stand-by) : le retirer effacerait une saisie
  sans le dire.
- **Constat sur les données, signalé à l'écran plutôt que comblé** : dans la
  feuille DATA, **seul `M02` porte un prix d'ancien contrat** (100) — `Grit` et
  `T02` n'en ont aucun. La comparaison avec l'ancien contrat et le gain
  resteront donc vides pour ces deux consommables tant qu'un administrateur ne
  les aura pas renseignés.
- **Au passage** : les lignes produites par un rapport (affaires, personnel,
  consommables, matériel) passent désormais toutes par `coutsUnitairesDuTarif`,
  donc une ligne de personnel reçoit automatiquement son tarif du référentiel
  (Peintre 70, Chef d'Equipe 80 — les valeurs des lignes réelles).
- **Aucune règle `firestore.rules` à déployer** pour ce lot.
- **Pas de tests ajoutés, à la demande de l'utilisateur** — 8 vérifications sur
  un fichier temporaire, exécuté puis supprimé (dont : `Grit × 3` reçoit 20 de
  PU et 60 de coût total depuis DATA ; FILTRE rend `Cons` et `MATE` ; le
  forfait n'est pas reproposé s'il est déjà saisi). `tsc -b`, `npm run lint`,
  `npm run build` et les 371 tests existants passent.
- **État du module : 80 ✅ sur 92 comptés, 11 🟡, 1 ⬜.** Reste le **lot 6**
  (mesure de la performance), et **PEINT-17** est le seul point qu'aucun lot ne
  peut clore : *aucun seuil de sous-performance n'est donné nulle part* dans le
  document (Q7), pas plus que les heures incompressibles par site (Q6).

**Contrat peinture — lot 6 : mesure de la performance (27/08/2026). Les 6 lots
du recueil sont livrés.** § « Mesure de la performance » de `doc/Contrat
peinture.docx`. Nouveau `lib/contratPeinturePerformance.ts` (pur) et **onglet
« Performance »** — le module passe de 4 à 5 onglets.

- **Les quatre grandeurs du document, et rien de plus** : objectif attendu
  (calculé depuis l'effectif, lot 2), surface réellement réalisée dans la
  journée, taux d'atteinte, écart signé — par journée, par champ, et en cumul.
- **Deux taux du tableau de bord cessent d'être figés** : « Réalisation » =
  réalisé ÷ plan de charge et « Productivité » = réalisé ÷ cible venaient du
  blob du reporting de mai 2026. Recalculés, ils **retrouvent à l'identique**
  les valeurs du classeur sur les 3 sites (0,838644 · 0,806118 · 0,973572 et
  0,71817 · 0,811077 · 0,515742). Et la **cible journalière** est désormais lue
  dans Paramètres, où elle vaut exactement ce que porte le blob (10 m² sur les
  31 points des 3 sites, vérifié) — c'est ce qui fait qu'un changement
  d'objectif contractuel se voit enfin sur la courbe.
- **Ce qui reste figé, et pourquoi c'est le bon choix** : le **plan de charge**
  et le **réalisé** de la courbe ne sont **pas reproductibles depuis le
  JOURNAL** — 222,63 m² au blob contre **533,54 m²** en sommant les surfaces
  réalisées du journal sur AGM, avec plusieurs journées franchement
  divergentes. C'est un pivot de la feuille Feuil3 avec sa propre logique ; le
  dériver aurait remplacé une valeur juste par une valeur fausse. La règle
  « rien de recopié qui puisse être dérivé » ne s'applique qu'à ce qui *peut*
  l'être — le vérifier avant de basculer est ce qui a évité l'erreur ici.
- **L'objectif est calculé, la production est constatée, et les deux restent
  séparés** : les faire dériver l'un de l'autre viderait l'écran de son objet.
- **Une production inconnue vaut `null`, jamais 0** : sur les lignes importées,
  la colonne « Réalisé du jour » est vide et l'infobulle dit pourquoi — la
  surface y est cumulée à date, sans lien de reprise auquel la comparer. Un
  compteur « affaires mesurables / total » le chiffre journée par journée, et
  **le cumul n'agrège que les journées mesurables en disant combien** (même
  précaution que `moyennesDelais()` du module Contrat).
- **Rien n'est qualifié de sous- ou surperformance** (PEINT-17) : le document
  le demande mais **ne donne aucun seuil** (Q7). Le taux et l'écart sont
  signés, colorés selon leur seul signe, et une note dit en toutes lettres
  qu'aucun seuil n'est défini pour le contrat.
- **Les heures incompressibles sont proposées, pas imposées** : la valeur
  paramétrée du champ préremplit la ventilation du stand-by du rapport et
  n'écrase jamais une saisie ; **rien n'est proposé tant qu'aucune valeur n'a
  été saisie**, le document en demandant une sans en donner (Q6).
  L'incompressible est reconnu **par son libellé**, faute de marqueur dans le
  document comme dans le référentiel.
- **Aucune règle `firestore.rules` à déployer** pour ce lot.
- **Pas de tests ajoutés, à la demande de l'utilisateur** — 7 vérifications sur
  un fichier temporaire, exécuté puis supprimé. `tsc -b`, `npm run lint`,
  `npm run build` et les 371 tests existants passent.

**État final du module : 87 points ✅ sur 92 comptés, 5 🟡, 0 ⬜.** Les cinq
partiels tiennent tous à une donnée que le document ne fournit pas, et chacun
le dit à l'écran : **PEINT-17** (aucun seuil de sous-performance, Q7),
**PEINT-70 / 84** (aucune valeur d'heures incompressibles par champ, Q6),
**PEINT-71** (`STBY SITE TG`, 128 lignes, absent des deux listes de causes,
Q4) et **PEINT-93** (les listes `peinture.*` restent dans l'onglet voisin et
les 20 tarifs par type d'item en lecture dans le module — « *tous* les
paramètres » n'est pas tenu à la lettre). Quatre attendent une réponse métier ;
le cinquième est un choix d'organisation d'écran.

⚠️ **Deux règles Firestore restent non déployées** sur `driver-6ae2b` —
`peinture_parametres` (lot 1) et `peinture_rapports` (lot 3). **Sans elles,
rien de ce qui a été livré du lot 1 au lot 6 ne fonctionne en production** :
les paramètres retombent sur le référentiel DATA importé et l'enregistrement
d'un rapport journalier est refusé.

**`firestore.rules` DÉPLOYÉ (27/08/2026) — la longue file d'attente est
vidée.** Confirmé par l'utilisateur (« j'ai appliqué les règles »).

- **Ce que ça change, et pourquoi c'est plus large que les deux règles
  peinture** : `firebase deploy --only firestore:rules` publie **tout le
  fichier d'un seul tenant**, jamais une règle isolée. Toutes les règles
  ajoutées localement depuis le 03/08/2026 et signalées « pas encore
  déployées » sont donc en production ensemble : `hebdo_crj_tarifs_npt`,
  `hebdo_crj_hse_evenements`, les trois `tonnage_echaf_*_saisie`,
  `affaires_metal_saisie`, les cinq `procurement_*_saisie`,
  `peinture_journal_saisie`, `courbe_en_s_activites`, `listes_valeurs`,
  `devises`, `epcm_hse`, `commandes` et sa sous-collection `augmentations`,
  `contrats/{id}/avc`, plus `peinture_parametres` et `peinture_rapports`.
- **Ce que ça débloque, module par module** — jusqu'ici ces écrans lisaient
  vide et refusaient d'écrire, en le signalant : Paramètres › Listes de valeurs
  (les 36 listes câblées, donc les menus de saisie de 5 modules), Paramètres ›
  Tarifs NPT (donc l'onglet « Coût standby » du CRJ, écrit le 03/08/2026 et
  inerte depuis), le référentiel des **devises**, le volet **HSE de l'EPCM**,
  les **commandes autonomes** du module Contrat (donc le montant facturé du
  lot 4 EPCM, qui restait à 0), les **AVC**, et l'ensemble du module **Contrat
  peinture** livré ce jour (paramètres + rapports journaliers).
- **`firestore.rules` porte désormais une note en tête** rappelant que le
  déploiement est à l'échelle du fichier et datant le dernier en date. Les
  cinq mentions « PAS ENCORE DÉPLOYÉE » qui parsemaient le fichier ont été
  remplacées par la date effective — une mention périmée est pire qu'absente,
  elle fait croire à un blocage qui n'existe plus.
- **Règle à tenir pour la suite** : toute règle ajoutée **après le 27/08/2026**
  est à nouveau en attente et doit être signalée comme telle. Le geste reste
  une action sur une infra de production partagée (`driver-6ae2b`, qui héberge
  aussi les apps « driver ») : il se confirme explicitement, il ne
  s'automatise pas.
- **Rien à vérifier côté code** : aucune ligne n'a changé, seules les mentions
  documentaires. `tsc -b`, `npm run lint`, `npm run build` et les 371 tests
  passent, inchangés.

**CRJ — recueil de `doc/commentaires CRJ_rev03.docx` puis les 4 lots
(27/08/2026, « parcours le fichier […] je veux un plan d'implémentation », puis
« applique le tout en te référant au fichier source »)** —
`doc/recueil-module-crj.md` relève les **48 points** (R3-01 à R3-48) et pose un
plan en 5 lots ; **les 5 lots sont livrés**, 48 points sur 48.

- **Le document décale toute la hiérarchie d'un cran** : le rev02 avait
  installé Phase → Scope → Tâche en laissant l'information à l'affaire (statut,
  core crew, plateforme, faits marquants) ou au scope (société, points
  bloquants) ; le rev03 la descend à la **tâche** (§3 : « Toutes les
  informations de la tâche devraient être visibles sur une même ligne ») et
  descend type d'affaire et n° d'avis de l'affaire au **scope** (§2). Deux
  demandes **défont** donc des choix du rev02, dont la séparation des onglets
  Projet et Phases & Scopes que le §1 demande de refusionner.
- **Aucune migration, et c'est la contrainte qui a guidé le modèle** : les 6
  champs descendus à la tâche (`statut` dérivé, `annulee`, `motifAnnulation`,
  `coreCrew`, `plateforme`, `societe`, `commentaires`) et les 2 descendus au
  scope (`typeAffaire`, `numerosAvis`) sont **optionnels** — une tâche ou un
  scope qui n'en porte pas lit la valeur du niveau au-dessus
  (`societeDeLaTache`, `plateformeDeLaTache`, `coreCrewDeLaTache`,
  `typeAffaireDuScope`, `avisDuScope`), le patron de `pointBloquantDePhase()`.
  Les 165 lignes du classeur restent lisibles sans être réécrites.
- **Rien de ce que l'affaire portait n'est perdu** : `typeProjet`,
  `numeroAvisDdm`, `statutTravaux`, `faitsMarquants`, `plateforme`,
  `coreCrewPartVariable` et `ScopeAffaire.pointsBloquants` continuent d'être
  écrits, **dérivés** de ce que portent désormais scopes et tâches — exactement
  comme `societeCtr` l'est devenue au rev02. C'est ce qui compte le plus ici :
  `clesJournalHebdo` lit `numeroAvisDdm`, donc descendre les avis au scope sans
  les remonter aurait détaché tous les suivis de leur fiche projet.
- **Statuts calculés** (§3, §8) : `statutTache()` (0-99 % → En cours, 100 % →
  Terminé, `Annulé` seul statut saisi) et `statutProjetDepuisScopes()`. Le menu
  « Statut global » devient une lecture, et ne réapparaît que sur une affaire
  **sans aucune tâche** — il n'y a alors rien à calculer. Une tâche **jamais
  pointée** n'a pas de statut (« Non pointée ») plutôt que « En cours » : le
  tableau du document part d'un avancement, et une tâche sans pourcentage n'en
  a pas. Une tâche **annulée** est écartée de l'avancement du scope et de son
  planning (le document ne le dit pas, mais la compter ferait bouger
  l'avancement au moment où l'on décide que ce travail n'aura pas lieu) — elle
  reste entièrement visible, barrée, avec son motif.
- **Le formulaire passe de 6 étapes affichées une à une à 5 sections empilées
  sur une page qui défile** (§1 + §7). Le §7 demande à la fois « guidé
  naturellement étape par étape » et « une page de rapport à compléter » plutôt
  qu'« une succession d'onglets indépendants » : la flèche de suivi est donc
  **conservée mais change de rôle** — d'un aiguillage qui substituait une
  section à l'autre, elle devient une navigation ancrée qui fait défiler
  jusqu'à la section et garde son décompte des sections obligatoires.
  `useEtapes` gagne `marquerActive()` pour ça : le suivi du défilement déplace
  le curseur **sans** marquer une section optionnelle comme « vérifiée », sinon
  faire défiler jusqu'en bas cocherait tout. `PiedEtapes` et `bloquerEntree` ne
  sont plus utilisés par le CRJ (les formulaires Tonnage les gardent).
- **Le menu « Projet existant » propose les trois origines** (§2 : « feuille de
  route et fichier navette ») — fiches projet, lignes navette, lignes de
  feuille de route, groupées. Une ligne déjà rattachée à une fiche n'est pas
  proposée deux fois ; une ligne **sans** fiche reste sélectionnable et l'écran
  dit que le rattachement se fera par nom et n° d'avis, au lieu de laisser
  croire à un `projetId` qui n'existe pas.
- **Commentaires typés par tâche** (§6) : `CommentaireTache { type, texte }`,
  une **liste** — la capture du document montre plusieurs commentaires sur une
  même tâche, chacun typé (point bloquant / fait marquant / note générale). Ni
  horodatage ni signature : le document n'en montre pas.
- **Photos joignables depuis la carte du scope** (§9), la section Photos
  restant pour celles qui documentent l'affaire entière ; **HSE rattaché à
  l'activité** (`HseEvenementLigne.tache`) — le dernier des quatre reproches du
  document que le rev02 n'avait pas levé.
- **« Je ne retrouve plus le tableau » (R3-40) n'était pas une régression** :
  l'onglet « Suivi du personnel » n'a jamais été retiré, c'est la barre à 8
  onglets qui l'escamotait hors de l'écran — la capture jointe montre justement
  la barre coupée avec sa flèche de défilement. Elle **passe à la ligne**, et un
  tableau vide distingue désormais « aucune saisie pour cette date » de « aucune
  ligne ne correspond au filtre ».
- **Attention en lisant le document : plusieurs captures montrent une version
  antérieure.** `image15.png` (HSE) montre les 6 compteurs globaux sans les
  colonnes Société/Scope, soit l'écran d'**avant** le rev02 ; `image11.png`
  montre l'ancien champ de standby non intitulé. Les reproches correspondants
  étaient déjà levés.
- **Un seul point du document n'a pas été tranché par lui** : §8 écrit « Si au
  moins une tâche est en cours → Projet "En cours" **ou** "Non démarré" » sans
  dire ce qui départage. Règle retenue, la plus littérale : aucune tâche à un
  avancement strictement positif → « Non démarré ». Verrouillée par un test.
- **R3-41 (« Suivi matériel commentaire à prendre en compte ») est tranché par
  le cadrage de la capture**, la phrase ne disant rien : l'image est rognée sur
  trois défauts exactement — l'en-tête `Site —` / `Rédacteur : —` **vide sur
  ses deux champs** alors que le §2 demande qu'il porte date et rédacteur, la
  barre d'onglets coupée avec son ascenseur (R3-40), et le tableau à `0/0`
  muet. Le **site** se déduit désormais des plateformes des suivis du jour
  (`sitesDuJour` : celle de chaque tâche, à défaut celle de l'affaire) — il ne
  venait que de l'en-tête du classeur importé, donc toute date saisie depuis
  l'application affichait un tiret — et une journée sans suivi le dit en clair.
- **Lot 5 — l'exploitation, cadrée au strict énoncé.** Le §9 justifie le
  rattachement à la tâche par « l'exploitation future des données (tableaux de
  bord, KPI, synthèses automatiques, etc.) » **sans les spécifier** : rien n'a
  été inventé. Seules ont été livrées les deux questions du §9 auxquelles la
  **saisie** répondait depuis le lot 2 mais que la **lecture** ne montrait pas
  — colonne **Activité** dans la ventilation HSE du jour, et tableau
  **« Statistiques du jour par entreprise »** (`totauxHse`). L'export PDF de
  l'onglet passe de un à **trois tableaux** (`exporterRapportPdf`) : n'extraire
  que les compteurs globaux reproduisait à l'identique, dans le fichier produit,
  ce que le document reproche à l'écran. Les autres ventilations que le lot 2
  rend possibles (avancement par plateforme, standby par tâche) attendent une
  demande.
- **Deux défauts introduits par ce lot, trouvés en relisant ce qui est
  réellement écrit en base** (aucun ne se voit à l'écran) : `??` au lieu de
  `||` sur les états `numeroAvisDdm`/`typeProjet` devenus des replis, qui
  écrivait `""` en base au lieu de `null` — `??` ne se déclenche que sur
  null/undefined ; et surtout, **la perte silencieuse des n° d'avis
  supplémentaires d'un suivi antérieur** : les avis vivant désormais sur le
  scope et n'étant plus saisissables au niveau de l'affaire, réenregistrer un
  suivi d'avant ce lot écrivait `numerosAvisDdm: null`. Les avis de l'affaire
  sont donc posés sur son **premier scope** à l'ouverture du formulaire de
  modification. À retenir pour les prochains déplacements de champ d'un niveau
  à l'autre : le chemin dangereux n'est pas la saisie neuve, c'est la
  **réouverture d'un enregistrement antérieur**.
- **Non couvert par les tests, et assumé** : les dérivations faites dans le
  composant (avis et type remontés des scopes, site du rapport, reprise d'un
  suivi antérieur) vivent dans `NouveauSuiviForm`, et le dépôt n'a ni `jsdom`
  ni `@testing-library/react` — les ajouter romprait avec sa façon de tester
  (fonctions pures rejouées sur les données réelles). Les règles qui décident
  sont extraites dans `types/hebdoCrj.ts` et couvertes.
- **Vérifié contre l'exemple chiffré du §4** (`lib/__tests__/crjRev03.test.ts`,
  **21 tests**, 392 au total) : les deux plannings de scope (24/08 → 06/09 et
  07/09 → 10/10), le planning du projet (24/08 → 10/10), la moyenne
  d'avancement, le tableau des statuts, les quatre cas du statut global, et la
  lecture en cascade d'une tâche antérieure au rev03. C'est le document qui
  juge.
- **Aucune règle `firestore.rules` à déployer** : tout ce qui descend au niveau
  tâche vit dans `ScopeAffaire.taches`, donc dans `hebdo_crj_journal` déjà
  couverte, et le champ `tache` reste dans `hebdo_crj_hse_evenements`, déployée
  le 27/08/2026.

**Module EPCM — recueil de `doc/EPCM_rev01.docx` puis lot 1 (27/08/2026)** —
`doc/recueil-module-epcm-rev01.md` relève les **58 points** (R1-01 à R1-58) et
pose un plan en **7 lots**. Seul le lot 1 est livré.

- **Fichier de recueil séparé de `recueil-module-epcm.md`, volontairement** :
  le rev00 est le cahier des charges qui a produit les 6 lots livrés le
  26/08/2026 ; le rev01 est un **retour de recette sur ce qui vient d'être
  livré** — ses 5 captures montrent l'application dans son état actuel (barre
  à 11 onglets comprise). Fusionner les deux aurait effacé la trace de ce qui
  a été décidé puis remis en cause.
- **Quatre points demandent de défaire une décision documentée**, et le
  recueil les isole dans une section « Conflits avec le rev00 » plutôt que de
  les traiter comme des oublis d'implémentation : retirer les dates
  d'affectation (dont dépend la génération de planning que le même document
  valide), calculer le salaire brut depuis le taux journalier (là où
  `coutReelPaye` fait primer le salaire mensuel d'un CDI, tranché au lot 4 du
  rev00), rouvrir le choix de la devise dans les champs de montant (retiré le
  19/08/2026), et compter la rotation comme « présente sur site » (là où le
  §10 du rev00 demandait les deux effectifs séparément). **Aucun n'est
  arbitrable sans l'utilisateur** — d'où 12 questions, dont 6 des 7 lots
  dépendent.
- **Anomalies du fichier, dites plutôt que devinées** : au point 2, la phrase
  « Je propose donc de supprimer cette section. » est écrite **deux fois** et
  placée **avant** sa justification (« Or, … ») ; trois listes à puces sont
  fusionnées par la mise en forme. Et **les captures portent ce que le texte
  tait** : la palette du planning (`image4.png`) montre **Mission** et
  **Formation**, que le document ne cite ni pour les garder ni pour les
  retirer, et la modale de pointage (`image5.png`) montre **« Retard
  (minutes) »**, jamais mentionné. Deux questions qu'une lecture du seul texte
  n'aurait pas posées.

**Lot 1 — retraits et menus déroulants** (R1-02→04, R1-08, R1-30, R1-39), le
seul lot sans arbitrage :
- **Fonction, Discipline et Service passent de la liste suggérée au menu
  déroulant** (point 1 : « prévoir des menus déroulants […] Cela permettra
  d'harmoniser les données et d'éviter les erreurs de saisie »). La frappe
  libre laissait cohabiter deux orthographes d'une même fonction — c'est
  exactement ce que la demande vise. Les options restent celles d'avant :
  valeurs déjà présentes sur les fiches **plus** référentiel de Paramètres.
  **Aucun garde-fou « valeur courante » n'a été ajouté, et c'est délibéré** :
  la valeur de la fiche en cours d'édition vient du même annuaire que les
  autres (`valeursDistinctes(employes, …)`), elle figure donc toujours dans
  les options — un garde-fou explicite aurait été du code mort déguisé en
  précaution.
- **Contrepartie assumée du menu fermé, dite à l'écran** : une valeur neuve ne
  peut plus se créer en tapant. L'aide de l'étape Identité renvoie vers
  Paramètres › Listes de valeurs **et précise que c'est réservé aux
  administrateurs** (`listes_valeurs` est en écriture admin) — sans quoi un
  agent chercherait en vain où ajouter sa discipline.
- **`epcm.disciplines` était lue sans exister.** `PersonnelTab` appelait
  `valeursDe('epcm.disciplines')` depuis le 26/08/2026, mais la liste n'était
  pas déclarée dans `CATALOGUE_LISTES` : l'appel rendait toujours `[]` et la
  liste **n'apparaissait pas dans Paramètres**, donc rien ne pouvait
  l'alimenter. Déclarée ici — le menu déroulant l'aurait sinon rendue
  inutilisable au lieu de simplement inerte.
- **Trois champs retirés du formulaire, aucun effacé du modèle** :
  « Contrat EPCM » de l'étape Emploi (point 2 : « toutes les informations
  saisies dans cette partie concernent déjà le contrat EPCM »), « Salaire net
  mensuel » (point 6) et « Heures max / mois » (point 8). `contratReference`,
  `salaireNet` et `quotaHeuresMois` **restent sur la fiche et gardent leur
  valeur** : le document demande de ne plus les *saisir*, pas d'effacer ce qui
  a été renseigné. `contratReference` continue même d'être **posé sans être
  demandé** — le contrat courant à la création, la valeur de la fiche à la
  modification —, sinon le rattachement disparaîtrait des fiches créées après
  ce lot. Chacun des trois porte désormais un commentaire disant pourquoi plus
  rien ne l'écrit.
- **Le retrait du quota d'heures va jusqu'au bout** : champ, colonne
  « Quota h », `quotaHeuresRestantes` de la synthèse et alerte « quota
  d'heures dépassé » (`QUOTA_HEURES` disparaît de `CategorieAlerte`). Garder
  un reste de quota que plus aucun écran ne lit aurait été du code mort ;
  garder l'alerte aurait signalé le dépassement d'un plafond qu'on ne peut
  plus régler.
- **Le salaire brut, lui, reste saisi** — le point 6 donne pourtant une
  formule (« Montant brut = Taux journalier × Nombre de jours travaillés »),
  mais elle contredit `coutReelPaye` et viderait de son objet la comparaison
  mensuelle du §7 rev00 (un CDI est payé quel que soit le nombre de jours
  pointés). L'arbitrage est posé en Q2 du recueil, il n'appartient pas à ce
  lot.
- **Aucune règle `firestore.rules` à ajouter ni à déployer** : le lot n'écrit
  que dans `epcm_employes` et `listes_valeurs`, déployées le 27/08/2026.
- **Pas de tests, à la demande permanente de l'utilisateur.** `tsc -b`,
  `npm run lint`, `npm run build` et les **392 tests** existants passent.
- **Reste ouvert** : lots 2 à 7 — onglet Coût adapté au type de contrat (Q1,
  Q2, Q3), devise choisie au fil de la saisie (Q12), planning réduit à
  6 affectations (Q4, Q5, Q6), **pointage en jours** (Q7, Q8, et une migration
  des pointages saisis en heures — qu'une relecture naïve transformerait en
  jours), dates de rotation sur la fiche (Q10, Q11) et statut actif dérivé des
  dates de contrat (Q9).

**Module EPCM — lot 2 du rev01 : l'onglet Coût s'adapte au type de contrat
(27/08/2026)** — R1-23→25 et R1-31 de `doc/EPCM_rev01.docx`. **Trois
arbitrages tranchés avec l'utilisateur avant d'écrire**, le document ne les
donnant pas : une seule donnée de forfait (Q1), le salaire mensuel continue de
primer (Q2), et freelance ⇒ taux journalier / salarié ⇒ salaire mensuel (Q3).

- **`FormulaireEtapes` accepte des champs conditionnels** (`visible?: (v) =>
  boolean`) : c'était le seul obstacle technique au point 6, `etapes` étant
  construit hors du formulaire. Les 5 formulaires Procurement, la peinture et
  l'EPCM en héritent. Un champ masqué n'est **pas rendu** — son `requis`
  échappe donc à la validation native, ce que le type documente.
- **Le piège de ce lot, et la raison d'être de `tauxJournalierEffectif()`** :
  masquer le taux journalier d'un CDI aurait mis **son coût pointé à zéro
  partout** (coût engagé, prévisionnel fin de mois, % consommé, marge,
  rapports, alertes budget) sans que rien ne le dise — `syntheseEmploye`
  faisait `employe.coutJournalier ?? 0`, et trois écrans lisaient le champ en
  direct. Le taux est donc **déduit du salaire mensuel** au lieu d'être perdu,
  et la synthèse porte son **origine** (`SAISI` / `SALAIRE_MENSUEL`) pour que
  l'écran puisse dire « déduit » plutôt que de faire passer une déduction pour
  une saisie.
- **Le diviseur est la seule extrapolation du lot, et elle est affichée** : le
  document dit « calculer le taux journalier en fonction du nombre de jours du
  mois considéré » pour le forfait **vendu**, et ne se prononce pas sur le côté
  **payé**. Les jours calendaires du mois sont retenus, **nommés à l'écran**
  (« ÷ N jours du mois en cours »), et la question est posée en Q13 du recueil
  — pas tranchée en silence.
- **Deux taux journaliers cohabitent et ne doivent jamais être confondus** :
  « Soit par jour travaillé » (ce que la personne **coûte**) et « Vendu par
  jour » (budget facturé ÷ jours du mois, ce que le client **paie**, R1-25).
  Ils se ressemblent et disent l'inverse l'un de l'autre ; les libellés les
  séparent, et la marge lit bien le premier.
- **Q2 : la formule du document n'est pas appliquée aux salariés, et c'est
  décidé.** « Montant brut = Taux journalier × Nombre de jours travaillés »
  supprimerait l'écart « coût pointé / coût réel payé » du §7 rev00 — un CDI
  est payé quel que soit le nombre de jours pointés. `coutReelPaye` est
  inchangé ; la formule s'applique là où le taux **est** la rémunération
  (freelance). Dans le document, cette phrase justifie surtout le retrait du
  salaire net, fait au lot 1.
- **Défaut préexistant corrigé** : le forfait d'une personne sans budget propre
  était lu **deux fois de deux façons** — `venduMensuel` valait 0 dans sa ligne
  de tableau, tandis que `syntheseFinanciere` lui appliquait le forfait du
  contrat pour le budget vendu global. Deux chiffres pour la même grandeur sur
  le même écran. Le repli se fait désormais une seule fois, dans
  `syntheseEmploye` (nouveau paramètre `forfaitParDefaut`), et
  `syntheseFinanciere` somme ce que la synthèse a déjà résolu. C'est aussi ce
  que dit Q1 : **une seule donnée**, portée par la fiche, celle du contrat
  n'étant qu'un défaut — l'écran le dit maintenant en toutes lettres.
- **Aucune règle `firestore.rules` à ajouter ni à déployer.**
- **Pas de tests, à la demande permanente de l'utilisateur.** `tsc -b`,
  `npm run lint`, `npm run build` et les **392 tests** existants passent.
- **Reste ouvert** : lots 3 à 7 — devise choisie au fil de la saisie (Q12),
  planning réduit à 6 affectations (Q4, Q5, Q6), pointage en jours (Q7, Q8, et
  la migration des pointages saisis en heures), dates de rotation sur la fiche
  (Q10, Q11), statut actif dérivé des dates (Q9).

**Module EPCM — lot 3 du rev01 : le module choisit sa devise d'affichage
(27/08/2026, « suis le document fidèlement »)** — R1-34, R1-36, R1-37 du
point 7 de `doc/EPCM_rev01.docx` (« Aujourd'hui, il faut passer par les
paramètres pour changer de devise. Ce fonctionnement n'est pas pratique »).
**Q12 tranchée avec l'utilisateur avant d'écrire, en trois points** :
conversion **à l'affichage seulement**, **module EPCM seulement**, et **pas de
retour du sélecteur de devise à la saisie**.

- **La décision du 19/08/2026 n'est pas défaite**, alors que le §11 du recueil
  la donnait comme l'un des quatre conflits. Le document parle d'« afficher »
  et de « la fiche contrat » — pas de ressaisir, pas de toute l'application.
  `ChampMontant` garde donc sa saisie unifiée : deux postes saisiraient sinon
  dans deux devises sans que rien ne le dise à la lecture, ce qui était le
  motif du retrait. **Ce qui change est en aval de la saisie, pas dedans.**
- **`useMontant(cible?)` accepte une devise d'affichage explicite** ; sans
  argument, le pivot fait foi comme depuis le 19/08 — les 21 écrans qui
  l'appellent ne changent pas d'un caractère. Un écran qui passe une cible ne
  déplace pas le réglage global : il choisit dans quoi **il** s'affiche, et
  doit le dire, d'où le rappel permanent « Montants enregistrés en XAF,
  convertis pour l'affichage » dès que les deux diffèrent.
- **Incohérence préexistante corrigée au passage, et c'est le vrai gain du
  lot** : le module affichait déjà **deux devises à la fois, dont une muette**.
  Les tuiles du Suivi financier passaient par `useMontant()` et s'affichaient
  dans la devise du système ; les tableaux, eux, rendaient le **nombre brut
  enregistré** — étiqueté avec la devise du contrat côté Personnel, et **sans
  aucune unité** côté Suivi financier. Les 5 écrans à montants (Accueil,
  Tableau de bord, Personnel, Suivi financier, Rapports) lisent désormais la
  même devise, annoncée en en-tête de colonne.
- **Le rapport exporté suit l'écran** : PDF et CSV sortent dans la devise
  d'affichage, sinon un document diffusé dirait autre chose que l'écran d'où
  il vient.
- **Préférence de poste** (`localStorage`, comme les colonnes visibles) : ce
  n'est pas de la donnée métier et ça ne vaut que pour celui qui regarde. Le
  défaut — suivre le système — fait que **rien ne change tant que personne ne
  choisit**.
- **Laissé dans la devise du contrat, volontairement** : les champs dérivés du
  formulaire de la fiche employé (« Soit par jour travaillé », « Vendu par
  jour », « Marge au quota »). Ils accompagnent des champs de **saisie**, dont
  la ligne « Enregistré : … » parle déjà cette devise — les convertir mettrait
  deux unités dans le même bloc.
- **Aucune règle `firestore.rules`.** `tsc -b`, `npm run lint`,
  `npm run build` et les **392 tests** existants passent.
- **Reste ouvert** : lots 4 à 7 — planning réduit à 6 affectations (Q4, Q5,
  Q6), pointage en jours (Q7, Q8, et la migration des pointages saisis en
  heures), dates de rotation sur la fiche (Q10, Q11), statut actif dérivé des
  dates (Q9).

**Module EPCM — lots 4 et 5 du rev01 : planning réduit et pointage en jours
(27/08/2026)** — points « Onglet Planning » et « Onglet Pointage » de
`doc/EPCM_rev01.docx`. **Cinq arbitrages tranchés avant d'écrire** : Q4, Q5 et
Q6 avec l'utilisateur ; **Q7 et Q8 par le document lui-même** — il définit la
journée à 12 h, donc les « heures normales » qu'il évoque sont ces 12 h, et il
ne mentionne jamais le champ « Retard », qui est donc conservé (supprimer une
donnée qu'un document ne cite pas n'est pas suivre ce document).

**Lot 4 — le planning.**
- **La palette passe de 9 à 6 affectations** (S, B, Rotation, Congé, AJ, AN).
  `AFFECTATIONS` **garde les neuf** : `REPOS`, `MISSION` et `FORMATION` ne sont
  plus *posables* mais des journées déjà planifiées les portent — les retirer
  de la table les ferait littéralement disparaître du calendrier. D'où
  `TYPES_AFFECTATION_SAISIE`, distinct de `TYPES_AFFECTATION` : ce qu'on peut
  poser n'est pas ce qu'on peut lire. Mission et Formation ne sont nommées
  **nulle part** dans le document — leur retrait est la lecture littérale de
  « ne conserver que », confirmée avec l'utilisateur.
- **La génération ne pose plus rien sur les 28 jours OFF** d'un cycle (Q5).
  Les déclarer en congé aurait consommé des congés que personne n'a posés ; un
  jour vide se distingue d'un jour déclaré, comme les week-ends d'une
  affectation bureau.
- **Conséquence traitée, et c'est le vrai travail du lot** : l'alerte
  « planning incomplet » aurait dès lors signalé **28 jours par cycle**.
  Nouveau `affectationAttendue(employe, date)` — ce que le régime de la
  personne attend un jour donné —, et `joursNonPlanifiesAttendus` ne compte que
  ces jours-là. **Quand le régime est inconnu** (pas de type d'affectation ou
  pas de dates), on retombe sur le compte brut : se taire masquerait
  précisément le cas où l'alerte est utile.
- **La rotation est comptée « sur site »** (Q6), ce qui défait le §10 du rev00
  — mais sans perdre l'information : `EtatJourEpcm.rotation` reste servi à
  part, la tuile « Sur site » porte « dont n en rotation » et la tuile « En
  rotation » dit qu'elle y est comprise. **Double comptage corrigé au passage**
  : la carte « Personnel mobilisé » de l'Accueil additionnait sur site + bureau
  + rotation, elle aurait compté deux fois les mêmes personnes.

**Lot 5 — le pointage change d'unité.**
- **On pointe des jours, plus des heures** : `PointageJourEpcm.jours`, et les
  heures en sont **dérivées** (jours × 12). Les heures supplémentaires se
  convertissent en jours facturés, ce qui rend les deux exemples du document :
  1 jour + 6 h = **1,5 jour**, 1 jour + 12 h = **2 jours**. `joursPointes()` et
  `quantiteJourTravaille()` remplacent le comptage booléen — une date peut
  désormais valoir plus d'une journée, ce que le modèle interdisait.
- **Aucune migration, et c'est délibéré.** Un pointage antérieur ne porte pas
  de `jours` mais des heures : `joursPointes()` les relit à 12 h par journée —
  la règle que le document donne lui-même —, si bien que 12 h + 6 h de sup
  redonnent exactement 1,5 jour. Rien n'est réécrit en base, un pointage ancien
  garde le sens qu'il avait, et le format d'import CSV reste valable. Une
  migration aurait dû trancher ce que valent 8 h saisies — 1 journée ? 0,67 ? —
  alors que la relecture ne tranche rien.
- **Le seul champ obligatoire de ce formulaire** est la raison des heures
  supplémentaires, et seulement quand il y en a : « doit être renseignée, car
  cette information impacte directement la facturation ». Écart assumé avec le
  parti pris habituel (avertir plutôt que bloquer) : ici l'information est
  entre les mains de qui saisit, à l'instant où il saisit.
- **Le champ « Heures par jour » du pré-remplissage disparaît** : il existait
  parce que le rev00 ne disait pas ce que vaut une journée de pointage. Le
  rev01 le dit.
- **Vérifié contre le code, pas supposé** : les deux exemples chiffrés du
  document rejoués sur le moteur réel, plus la génération sur un cycle complet,
  la palette et le comptage de la rotation — **7 vérifications passantes**, sur
  un fichier temporaire exécuté puis supprimé (pas de test ajouté au dépôt,
  demande permanente). Au passage, ma première assertion attendait 28 jours
  posés sur une affectation de trois mois : il y en a **56**, deux cycles ON —
  c'était l'attente qui était fausse, pas le code.
- **Aucune règle `firestore.rules`.** `tsc -b`, `npm run lint`,
  `npm run build` et les **392 tests** existants passent.
- **Reste ouvert** : lot 6 (dates de rotation sur la fiche — Q10, Q11) et
  lot 7 (statut actif dérivé des dates — Q9). Le §11 du recueil ne porte plus
  qu'**un seul conflit** avec le rev00, celui des dates d'affectation, qui est
  précisément l'objet du lot 6.

**Module EPCM — lots 6 et 7 du rev01 : rotations sur la fiche et activité
dérivée (28/08/2026). Les 7 lots du rev01 sont livrés.** Points 2 et 3 de
`doc/EPCM_rev01.docx`. **Trois arbitrages tranchés avant d'écrire** : les dates
du contrat font l'horizon (Q10), une seule paire de dates de rotation dont le
cycle se répète (Q11), activité dérivée avec forçage possible (Q9).

**Lot 6 — les dates de rotation remplacent les dates d'affectation.**
- **Le conflit que le recueil signalait n'en était pas un.** Retirer les dates
  d'affectation semblait priver la génération de son horizon (« sans borne, la
  génération n'aurait pas d'horizon », lot 2 du rev00) — mais le document donne
  lui-même le remplacement : « nous renseignons déjà la date de début du
  contrat ; la date de fin du contrat ». `horizonPlanning()` court donc du
  début du contrat à sa **fin effective**, renouvellements compris. Une fiche
  sans dates de contrat ne génère plus, et la modale le dit au lieu d'échouer.
- **Une seule paire de dates, le cycle se répète** (`cycleRotation`) : l'écart
  montée → descente donne la durée sur site, la période de repos est de même
  durée. C'est le « 28/28 » exprimé **par les dates** plutôt que codé en dur —
  un cycle 14/14 fonctionne sans rien changer. Sans date de descente, on
  retombe sur `JOURS_CYCLE_ROTATION`, la seule valeur que le document nomme.
- **Le cycle est ancré sur la date de montée, pas sur le début du contrat** :
  un contrat ne commence pas forcément un jour de rotation. Le rang du jour se
  calcule en modulo positif depuis la montée, si bien qu'un contrat antérieur
  est planifié **à rebours du même cycle** au lieu d'être décalé d'un cycle
  entier.
- **`prochainesRotations()` déduit, ne stocke pas** (R1-17) : une liste de
  rotations tenue à la main divergerait du planning dès la première rotation
  décalée. Nouveau bloc « Prochaines rotations » de l'Accueil, sur 90 jours —
  plus loin que le bloc « Montées et descentes », qui lit le planning déjà posé
  et ne peut donc pas voir au-delà.
- **La reprogrammation est le seul geste du module qui écrase du planning**
  (R1-20), donc le seul qui se coche : case décochée par défaut, et le nombre
  de jours qui seront **remplacés** est annoncé avant d'écrire. Sans elle, le
  garde-fou du rev00 tient — un jour déjà posé n'est jamais touché. C'était la
  seule façon de satisfaire « reprogrammer les rotations concernées » sans
  rendre destructeur un bouton qui ne l'était pas.

**Lot 7 — le statut cesse d'être saisi.**
- **`statut` change de sens sans changer de forme** : il ne dit plus « cette
  personne est active » mais « cette personne a été écartée à la main ».
  `INACTIF` **prime sur les dates** et reste le moyen d'écarter quelqu'un sans
  le supprimer — sans lui, il faudrait avancer une date de fin de contrat pour
  un motif qui n'est pas contractuel. **Aucune migration** : les fiches déjà
  INACTIF le restent, les autres passent sous la règle dérivée. Le champ
  devient « Écarter cette personne ».
- **Seule la fin du contrat compte, pas le début.** Une fiche dont le contrat
  n'a pas commencé **reste dans l'effectif** : c'est précisément la période où
  l'on planifie sa mobilisation, et l'exclure ferait disparaître les arrivées à
  préparer. L'écran le signale (« à venir ») au lieu de la sortir. Une fiche
  **sans dates** reste active : une absence de date n'est pas une fin de
  contrat.
- **Les 8 filtres d'effectif passent par `estActif(employe, date)`**, chacun
  avec la date qui lui convient — la date d'arrêté pour les synthèses (d'où
  `SyntheseEmployeEpcm.actif`), la date du jour pour les onglets, sa propre
  date pour `etatDuJour`. Le filtre « Statut » de l'écran Personnel porte lui
  aussi sur l'activité dérivée : filtrer « Actifs » doit rendre ceux dont le
  contrat court, pas ceux dont la case est cochée.
- **Vérifié contre le code, pas supposé** : **15 vérifications passantes** sur
  un fichier temporaire exécuté puis supprimé — cycle déduit (28/28 et 14/14),
  horizon avec renouvellement, les deux refus explicites, l'ancrage du cycle,
  la reprogrammation dans les deux sens, les rotations à venir, les jours OFF
  non signalés comme planning incomplet, et les cinq cas de l'activité dérivée.
- **Aucune règle `firestore.rules`.** `tsc -b`, `npm run lint`,
  `npm run build` et les **392 tests** existants passent.

**État final du module : 57 points ✅ sur 58, 1 🟡, 0 ⬜, 0 ❓.** Le seul point
partiel est **R1-31**, écart **assumé et décidé** avec l'utilisateur (Q2) : le
salaire mensuel continue de primer pour un salarié, sans quoi la comparaison
« coût pointé / coût réel payé » du §7 rev00 perdrait son objet. Et le §11 du
recueil — les quatre points qui demandaient de défaire une décision du rev00 —
**ne porte plus aucun conflit ouvert** : trois ont trouvé une lecture qui
satisfait les deux documents, le quatrième garde la règle du rev00 sur décision
explicite.

**Module Contrat — `doc/module contrat_rev01.docx` : recueil puis les 5 lots
(28/08/2026)** — `doc/recueil-module-contrat-rev01.md` relève les **37 points**
(CTR1-01 à CTR1-37) et pose un plan en 5 lots ; **les 5 lots sont livrés**,
31 points ✅ et 6 🟡, aucun ⬜. Fichier séparé de `recueil-module-contrat.md`
(comme EPCM rev00/rev01) : ce rev01 est un **retour de recette sur ce qui
vient d'être livré** les 25 et 26/08 — ses deux captures montrent
l'application dans son état d'alors.

- **Le §4 était déjà fait** (statut automatique PAYÉE/IMPAYÉE, lot 4 du
  rev00). Son titre porte pourtant une parenthèse contradictoire, surlignée en
  vert : « fonctionnalité  pas été prise et présente dans le doc commenté ».
  Relevée comme anomalie du fichier, pas devinée.

**Lot 1 — l'écran Contrats a deux états** (§1 : « lorsqu'un utilisateur
sélectionne une référence de contrat, **seules** les informations relatives à
ce contrat doivent être affichées ») : une **vue globale** (une ligne par
contrat, avec une recherche qui n'existait pas) et une **vue contrat**, avec
« ← Tous les contrats ». L'accordéon d'avant n'ouvrait déjà qu'un contrat à la
fois — le reproche portait sur autre chose : il posait la fiche, les AVC, les
commandes, les factures et les graphiques **par-dessus** la liste de tous les
autres. Le détail se charge désormais à l'affichage de la vue, et la ligne
vivante est relue dans la liste plutôt que captée au clic (le défaut corrigé
sur la navette le 21/08).

**Lot 2 — la 7ᵉ étape, « Validation DO »** (§2 : « Une étape a été oubliée dans
le processus de validation »), insérée **entre CGE et le paiement**, à la
place que la liste du document lui donne.
- **Elle est la seule étape à porter un département responsable** (DO / CHEX /
  ICP), et « d'autres départements pourront être ajoutés ultérieurement via le
  menu Paramètres » : nouveau module **`contrat`** dans `CATALOGUE_LISTES`,
  liste `contrat.departementsValidationDo`. C'est la première liste du module,
  et le premier menu du référentiel qu'**aucune donnée existante n'alimente**
  — d'où `DEPARTEMENTS_VALIDATION_DO`, trois valeurs de départ fusionnées avec
  ce qu'un admin déclare **et avec la valeur déjà enregistrée sur la facture** :
  retirer un département du référentiel ne doit pas effacer en silence la
  saisie des factures qui le portent.
- **Aucune migration** : une facture antérieure n'a pas d'étape DO, elle y est
  « non renseignée » — ce qui n'est pas « Non ». Déclarer non franchie une
  étape que personne n'a encore eu à franchir serait inventer un refus.
- **Deux points du document non tranchés, et laissés tels quels** : il numérote
  « Validation 1/2/3 » **sans les nommer** (les libellés actuels sont
  conservés — renommer au jugé rendrait illisible un suivi déjà en usage), et
  il ne cite qu'**un** « paiement » là où l'application en a deux. Les fusionner
  casserait le §4 : c'est « Paiement réalisé » qui commande le statut PAYÉE.
- **`NOMBRE_ETAPES` remplace les « /6 » écrits en dur** — ils étaient déjà deux
  à devoir suivre.

**Lot 3 — dates à précision variable et le KPI principal** (§3, « l'outil ne
sera pas connecté à l'API SAP […] la saisie des dates ne doit pas être
bloquante »).
- **`lib/datesPartielles.ts` + `ui/ChampDatePartielle`** : `2026-03-17` au
  jour, `2026-03` au mois — **la précision se lit dans la valeur**, pas dans un
  second champ qui finirait par en diverger. Deux champs natifs
  (`type="date"` / `type="month"`) rendent exactement ces deux formes, donc
  aucun analyseur maison. Passer au mois garde le mois ; **revenir au jour
  n'invente pas de jour** : le champ se vide et le dit.
- **Le KPI que le document désigne comme principal n'existait pas**
  (`sapAPaiement`) : `dateIntroductionSap` était saisie et affichée en colonne,
  mais **aucun des quatre délais ne la prenait pour borne**. Il est désormais
  en tête, dans la ligne de la facture, dans le bandeau du tableau et en
  colonne — donc dans les extractions.
- **Ce que le document ne dit pas et que je n'ai pas tranché** : sur quel jour
  compter un délai quand la date n'est connue qu'au mois. `ecartJours` rend
  `null` et `raisonEcartAbsent` distingue « une borne manque » de « une borne
  est au mois près » — l'écran affiche « date au mois près » au lieu d'un
  tiret. Choisir le 1ᵉʳ, le 15 ou le dernier jour inventerait jusqu'à trente
  jours d'écart sur le KPI principal du document.

**Lots 4 et 5 — d'un projet à plusieurs, sur la commande puis sur la facture**
(§5 et §6, les seuls passages surlignés en jaune).
- **L'arbitrage central, et il est structurant** : `Commande.projetId` **reste
  l'imputation**, celle qui porte le montant ; `projetIds` s'y **ajoute**. Le
  document demande de *savoir* quelles affaires une commande concerne, pas
  comment répartir son montant entre elles — et l'engagement d'une fiche
  projet, les colonnes de la feuille de route et la consommation d'un contrat
  lisent `commande.montant` **en entier** pour l'unique projet rattaché. Le
  faire compter sur chacune des affaires citées le compterait deux, trois, dix
  fois. Les deux écrans annoncent en clair que le montant n'est pas réparti ;
  la clé de répartition reste la seule vraie question ouverte (Q8).
- **Deux natures, jamais confondues** : une fiche projet choisie est un
  identifiant (`projetIds`) — elle se résout, elle porte un budget et des
  journaux ; un intitulé créé est une chaîne (`projetsLibres`) — il ne se
  résout vers rien. Le sélecteur le dit à l'écran, sans quoi un libellé
  passerait pour un rattachement.
- **Le §5 dit « fiche projet », le §6 « affaires présentes dans la feuille de
  route »** : le sélecteur propose **les deux, groupés**. Une ligne de feuille
  de route déjà rattachée à une fiche sélectionne **cette fiche** ; une ligne
  qui n'en a aucune est reprise comme **intitulé**, faute d'identifiant vers
  quoi pointer — lui ouvrir un troisième espace d'identifiants ne dirait rien
  de plus tant que Q6 n'est pas tranchée.
- **Une facture sans affaires propres suit sa commande** (`projetsDeFacture`,
  drapeau `heritee`) : c'est l'état de toutes les factures antérieures **et**
  le cas normal d'une commande mono-projet. L'écran affiche « (héritées de la
  commande) » — un tiret se lirait comme un oubli. **Aucune migration** ici non
  plus.
- **Le §6 borne les affaires d'une facture à celles de sa commande** (« une ou
  deux affaire parmis les 10 affaires de la commande ») : elles sont proposées
  **en premier**, sous leur propre groupe, et ce qui sort de la liste est
  **signalé, pas refusé** — la commande a pu être complétée après sa facture,
  et perdre la saisie serait pire que l'incohérence (même parti pris que
  CTR-26 du rev00).
- **`modifierCommande` reçoit son premier appelant** : il était exposé par
  `ProjectsContext` depuis le lot 3 du rev00 et **appelé nulle part**. Sans
  lui, les commandes déjà enregistrées n'auraient jamais pu recevoir
  d'affaires. Il réécrit l'identification entière, donc l'appel renvoie les
  champs non touchés tels quels — les omettre les effacerait. Une commande
  restée dans le document d'une fiche (avant migration) n'a pas de document
  propre : le bouton n'est pas proposé et l'écran dit pourquoi, plutôt que
  d'échouer.

**Deux défauts préexistants corrigés au passage**, aucun demandé par le
document :
- **Le module `crj` n'avait aucun onglet dans Paramètres › Listes de valeurs.**
  Ses 4 listes existent depuis le 23/08/2026 et sont lues par les formulaires
  du CRJ, mais la barre d'onglets de l'écran était **écrite en dur** et ne les
  mentionnait pas : personne ne pouvait les alimenter. Elle est désormais
  **dérivée de `LISTES_VALEURS`** — c'est ainsi que le module `contrat` y est
  apparu sans rien ajouter, et le cas ne peut plus se reproduire.
- **Remettre un Oui/Non du workflow à « — » faisait échouer l'écriture** : le
  patch produit `{ introduiteSap: undefined }` *à l'intérieur* de `workflow`,
  et Firestore refuse `undefined` à **n'importe quelle profondeur** (aucun
  `ignoreUndefinedProperties` n'est configuré). `definirFacturesCommande`
  nettoie désormais chaque facture **et son workflow** avant d'écrire.

- **Aucune règle `firestore.rules` ajoutée ni à déployer** — c'est le premier
  lot du projet dans ce cas : tout s'écrit dans `commandes` (la 7ᵉ étape, son
  département, les affaires d'une commande et d'une facture) et
  `listes_valeurs`, déployées le 27/08/2026.
- **Pas de tests ajoutés au dépôt, à la demande permanente de l'utilisateur** —
  10 vérifications ont tourné sur un fichier temporaire, exécuté puis supprimé
  (les 7 étapes et la place de la DO, son franchissement par le Oui et non par
  le département seul, les deux précisions de date, le refus de compter des
  jours sur une date au mois, le KPI SAP → paiement et sa moyenne qui n'agrège
  que le calculable, l'imputation en tête, l'héritage d'une facture, le
  signalement hors commande). `tsc -b`, `npm run lint`, `npm run build` et les
  **392 tests** existants passent.
- **Reste ouvert** : les 6 points 🟡, qui n'attendent **aucun code** mais une
  réponse métier — ce que valident « Validation 1/2/3 » (Q1), le jour de
  référence d'une date au mois (Q5), l'identité d'une ligne de feuille de route
  sans fiche (Q6) et surtout **la clé de répartition d'un montant entre
  plusieurs affaires** (Q8). Et **CTR-41** du rev00, toujours là : la colonne
  « EN COURS DE TRAITEMENT » du fichier de suivi Excel ne correspond à aucune
  étape — la Validation DO n'est pas elle, elle est explicitement demandée par
  le §2 et vient après CGE.

**CRJ — `doc/commentaires CRJ_rev04.docx` : recueil puis les 3 lots
(31/08/2026)** — `doc/recueil-module-crj-rev04.md` relève les **33 points**
(R4-01 à R4-33) et pose un plan en 3 lots ; **les 3 lots sont livrés**,
30 points ✅, 1 🟡, 2 ❓. Fichier séparé de `recueil-module-crj.md` (rev03) :
ce rev04 est un **retour de recette sur ce que le rev03 a livré** — ses trois
captures montrent la hiérarchie Phase → Scope → Tâche telle qu'elle est
depuis le 27/08.

- **Deux sujets seulement, et les étapes 1 et 2 sont validées** d'un « OK »
  surligné en vert. **L'« Étape 3 : Création du scope » est annoncée puis rien
  n'en est dit** — ni OK, ni reproche : relevé comme anomalie du fichier, pas
  deviné (R4-03, ❓).

**Lot 1 — les commentaires d'une tâche passent en panneau latéral (§5)** :
« il n'est pas intuitif de saisir un commentaire ni de visualiser facilement
les commentaires déjà enregistrés ».
- **Le document valide le contenu et ne conteste que la présentation** (« Les
  informations actuellement présentes sont pertinentes ») : **rien n'a été
  retiré du modèle**, les trois types restent ceux du rev03.
- Des trois formes proposées (panneau latéral, fenêtre contextuelle,
  historique déroulant), le **panneau** est retenu : c'est le seul qui laisse
  la place d'écrire plusieurs lignes **et** de lire l'historique sans quitter
  la ligne de tâche. Le champ est ouvert et focalisé à l'ouverture, avec un
  type déjà choisi — auparavant il fallait déplier, ajouter une ligne, choisir
  un type, puis taper : trois gestes avant le premier caractère.
- **Le compteur existait déjà** (exposant de 9 px) : il n'a pas été refait,
  il a été rendu lisible. C'était le seul point du §5 déjà acquis.
- **`CommentaireTache` reçoit `saisiPar` / `saisiLe`**, posés à la création :
  le mot « **historique** » du document suppose une chronologie. **Jamais
  reconstitués** pour les commentaires antérieurs, qui n'en portent pas —
  l'écran n'affiche alors ni auteur ni date plutôt que de leur prêter celle de
  leur relecture. Ils ne bougent pas quand on corrige un commentaire : ils
  datent le fait, pas la dernière frappe.
- **« Le statut éventuel » n'a pas été inventé** : le document écrit le mot
  sans dire s'il vise le **type** (qui existe) ou un état ouvert/résolu (qui
  n'existe pas). Le type est affiché et modifiable ; la question reste posée.

**Lots 2 et 3 — « Personnel & NPT » et « Matériel » héritent des tâches
(§2 et §3)** : « Les données renseignées une seule fois dans l'onglet "Projet,
Phases & Scopes" doivent être réutilisées automatiquement ».
- **Deux arbitrages que le document ne tranche pas, tranchés par la lecture
  la plus proche de lui** :
  - **granularité : la tâche, pas le scope.** C'est elle qui porte la société
    **et** le core crew (le document le dit lui-même) : rattacher au scope
    aurait laissé le core crew indéterminé, c'est-à-dire précisément
    l'information à récupérer. « Toute l'affaire » reste possible — c'est
    l'état des lignes historiques, et une supervision ne se rattache pas
    toujours à une tâche.
  - **pré-remplissage : un bouton, pas une génération silencieuse.**
    « Reprendre les tâches saisies (n) » crée une ligne par tâche non encore
    reprise, société et core crew déjà posés, **sans écraser aucune ligne
    saisie** et en disant combien il en ajoutera. Choisir une tâche dans une
    ligne existante remplit les mêmes champs, jamais par-dessus une valeur
    déjà tapée.
- **`scope` et `tache` sont deux chaînes, pas des identifiants** : c'est la
  forme déjà retenue pour les événements HSE et les photos — une tâche n'a pas
  d'identifiant propre, elle est nommée dans son scope. Le couple fait la
  clé : deux scopes peuvent nommer « Soudage » le même jour, et les confondre
  ferait hériter la société de l'autre.
- **Trois fonctions pures** (`types/hebdoCrj.ts`) portent la règle plutôt que
  l'écran : `contexteDesTaches()` (les tâches avec leur société et leur core
  crew **déjà résolus** par la cascade tâche → scope → affaire, tâches
  annulées et sans nom écartées), `contexteDeLaTache()`, `societesDesTaches()`.
  Les helpers de cascade existants (`societeDeLaTache`, `coreCrewDeLaTache`)
  ont été assouplis en `Pick<...>` pour que le formulaire n'ait pas à
  fabriquer un `ScopeAffaire` complet pour poser une question aussi simple.
- **⚠️ Les clés de document changent, et c'est le point le plus risqué du
  lot.** `hebdo_crj_personnel_mobilise` et `hebdo_crj_materiel_site` passent
  de `(date, affaireId, societe, profil | materiel)` à
  `(date, affaireId, scope, tache, societe, profil | materiel)` : sans cela,
  deux monteurs de la même société sur deux tâches d'un même scope auraient
  été **un seul document**, le second écrasant le premier **en silence**.
  C'est exactement le bug corrigé le 04/08/2026 sur
  `hebdo_crj_defaut_planning`, un cran plus bas. Réenregistrer un suivi
  antérieur écrit donc de nouveaux documents, et `supprimerLignesObsoletes`
  retire les anciens — rien ne se dédouble.
- **⚠️ Le sens de la dérivation de la société s'inverse.**
  `societesIntervenantes` — qui alimente `societeCtr` de l'affaire depuis le
  rev02 — était calculée **depuis** les lignes de personnel et de matériel.
  Celles-ci héritant désormais des tâches, elle est rebasée sur les scopes et
  leurs tâches, plus les sociétés saisies à la main sur une ligne rattachée à
  « toute l'affaire ». Sans ce changement, la société de l'affaire aurait
  dérivé d'une dérivation d'elle-même.
- **`MaterielSiteLigne.heuresUtilisation` n'est pas une colonne de plus** :
  c'est la donnée qui manquait à `coutStandbyMateriel()` depuis le
  28/07/2026, lequel approxime l'inactivité du matériel par le taux de
  standby du **personnel** du même jour, faute de durée propre. Heures
  saisies → inactivité mesurée (`1 − heures / 12`) ; heures absentes →
  l'ancienne approximation, et le régime appliqué est **exposé** (`mesure`)
  pour qu'un écran ne fasse jamais passer une estimation pour une mesure. Un
  total mi-mesuré mi-estimé reste une estimation. **Une absence n'est pas
  0 h** : 0 h signifierait « matériel inutilisé toute la journée » et
  gonflerait le coût de tout l'historique d'un coup.
- **Aucune migration** : les six champs ajoutés sont optionnels, et une ligne
  d'avant ce jour reste exactement ce qu'elle est — rattachée à toute
  l'affaire, sans heures connues. Une tâche renommée dans les scopes après
  coup reste proposée dans le menu de la ligne qui la porte, marquée « hors
  scopes du jour » : l'effacer du menu effacerait la saisie.
- **Aucune règle `firestore.rules` ajoutée ni à déployer** : tout ajoute des
  champs à `hebdo_crj_journal`, `hebdo_crj_personnel_mobilise` et
  `hebdo_crj_materiel_site`, déployées le 27/08/2026.
- **Pas de tests ajoutés au dépôt, à la demande permanente de l'utilisateur** —
  8 vérifications ont tourné sur un fichier temporaire, exécuté puis supprimé
  (cascade société/core crew, tâches annulées et sans nom écartées, homonymes
  distingués par leur scope, société de l'affaire rebasée, inactivité mesurée
  à 3 h sur 12, approximation quand les heures manquent, « 0 h saisi » ≠
  « heures inconnues », total mi-mesuré non déclaré mesuré). `tsc -b`,
  `npm run lint`, `npm run build` et les **392 tests** existants passent.
**Périmètre confirmé par l'utilisateur (01/09/2026)** : « l'implémentation
débute à partir de ce texte — *Étape 3 : Création du scope / Commentaires,
liaison entre les onglets "Projet, Phases & Scopes" et "Personnel & NPT"* ».
Le document annonce « Étape 3 » puis n'en dit rien, là où les étapes 1 et 2
portent un « OK » : **ce n'est pas un oubli, c'est le titre sous lequel tout
le reste est écrit** — les commentaires sur la liaison commencent là, et les
deux captures qui suivent sont l'écran des scopes et celui du personnel. Le
périmètre livré est donc R4-04 → R4-33.

**L'écran des scopes devient la source visible de la chaîne (31/08/2026)** —
la moitié amont du §2, livrée après les trois lots :
- elle annonce ce qu'elle alimente (« n tâche(s) saisie(s) — leur société et
  leur core crew alimentent "Personnel & NPT" et "Matériel" ») : la continuité
  existait depuis les lots 2 et 3, mais ne se voyait pas depuis l'endroit où
  l'on saisit ;
- **chaque tâche porte deux icônes** disant combien de lignes de personnel et
  de matériel lui sont déjà rattachées, et en ajoutant une au clic — avec la
  société et le core crew de **cette** tâche. C'est le même geste que
  « Reprendre les tâches saisies », mais depuis l'endroit où l'on sait qui va
  faire le travail ;
- **les deux compteurs sont dérivés** des lignes des sections 2 et 3 : rien
  n'est stocké côté tâche, ils ne peuvent donc pas contredire la saisie. Les
  icônes sont désactivées tant que la tâche n'a pas de nom — une ligne
  rattachée à une tâche anonyme ne se relierait à rien.
**Les deux derniers points livrés sur demande explicite (01/09/2026, « fais une
implémentation »)** — le document ne donne pas l'information nécessaire dans
les deux cas ; chacun a donc été livré dans la forme **la moins présomptueuse**,
et chacun se défait sans rien casser. Le module passe à **33 points ✅ sur 33**.
- **R4-20, « les informations complémentaires spécifiques au matériel »** : le
  document écrit la phrase et n'en nomme aucune. `MaterielSiteLigne.observation`,
  **champ libre** — la seule forme qui ne présuppose pas lesquelles. Choisir un
  n° de série, un état ou un fournisseur aurait été décider à la place de
  l'auteur et créer des colonnes que rien ne remplirait ; le jour où elles
  seront nommées, elles s'extrairont de ce champ, alors que retirer des
  colonnes déjà saisies ne se rattrape pas. **Relu** sous le tableau croisé de
  l'onglet « Suivi matériel » : un champ saisi et jamais relu vaut moins que
  pas de champ du tout.
- **R4-32, « le statut éventuel »** : `CommentaireTache.statut`, facultatif —
  Sans statut / Ouvert / Résolu. **C'est le mot « éventuel » qui a tranché**
  entre les deux lectures possibles : le type d'un commentaire est
  obligatoire, il est toujours là, le mot ne peut donc pas le qualifier. Deux
  valeurs et une absence, **pas un cycle de vie** — le document ne décrit aucun
  parcours, et inventer « à traiter → en cours → clos » aurait fabriqué un
  processus que personne n'a demandé. Le type reste affiché à côté.
  - Conséquence voulue : **un point bloquant déclaré résolu ne remonte plus aux
    points bloquants du scope**, alors qu'un point sans statut y remonte
    toujours — une absence n'est pas une résolution. C'est tout l'intérêt du
    champ, et c'est la seule chose qui en dépend : le retirer ne casserait rien
    d'autre s'il s'avérait que « statut » désignait le type.

**Tonnage échafaudage — recueil de `doc/Suivi tonnage rev01.docx` puis lot 1
(03/09/2026)** — `doc/recueil-module-tonnage-rev01.md` relève les **58 points**
(TON1-01 à TON1-58) et pose un plan en **7 lots**. Seul le lot 1 est livré :
**19 ✅, 25 🟡, 14 ⬜** (9 / 27 / 22 au relevé initial).

- **Premier recueil du module** : le rev00 (`doc/suivi tonnage.docx`) n'en
  avait jamais eu, il a été appliqué directement les 04→06/08/2026. Ce rev01
  est un **retour de recette sur cet état-là** — ses 5 captures montrent le
  formulaire à 4 étapes et le `SelecteurFicheProjet` livrés alors.
- **Le document ne demande presque rien qui n'existe déjà ailleurs.** Son
  modèle de productivité (2,5 T/jour, 1 chef + 2 monteurs, coefficients
  0,5 / 1, capacité 2,5) est celui du contrat peinture à l'unité près ; ses
  **six causes de stand-by sont mot pour mot** celles du référentiel peinture
  (vérifié une à une) ; son HSE renvoie explicitement au CRJ ; son rapport
  journalier est celui de la peinture. Les lots 1 à 4 sont des reprises.
- **Anomalies du fichier, relevées et non devinées** : la numérotation de la
  partie JOURNAL saute de 1 à 3 (**pas de section 2**, aucune n'a été
  inventée) ; « WORKLOW » ; le sous-titre du §C est tombé au milieu de sa
  première puce ; le tableau de mutualisation est daté de **juin 2025** alors
  que le classeur porte 2026 ; et la colonne « Forfait core crew » de ce
  tableau vaut **5** — les 5 tonnes du forfait *matériel*, pas le forfait
  personnel de 6 000 000 XAF/mois du paragraphe voisin.
- **La « courbe de cartographie » du §L existe déjà** : c'est le `chart1.xml`
  du classeur, repris à l'identique dans l'onglet SUIVI TONNAGE_ECHAF
  (« Poids contractuel par site »). Mais **la capture du document affiche
  d'autres valeurs** (796,26 contre 154,251 pour TRMPFK) et une plateforme
  `TRM-TOR` absente du classeur importé : elle vient d'un autre fichier ou
  d'une autre période (Q9). Le §L dit « il **manque** la courbe » — elle ne
  manque pas, elle ne se voit pas (bas du premier onglet, figée sur juin).
- **Le vrai point dur n'est pas une formule, c'est le figé.** TON1-20
  (« recalcul automatique ») est incompatible avec la façon dont le Suivi
  personnel enregistre ses colonnes dérivées — **figées à l'enregistrement**
  et relues telles quelles, contrairement à celles du Journal, recalculées à
  l'affichage. Idem pour la mutualisation quotidienne, servie par une feuille
  reproduite à valeurs figées.

**Lot 1 — Paramètres du contrat Échafaudage** (TON1-04, 05, 06, 09, 10, 18,
33, 45, 46, 47, 55, 56, 57) : nouvel onglet **Paramètres › Tonnage
échafaudage** (7ᵉ onglet), `types/tonnageEchaf.ts` (+`ParametresContratTonnage`),
`lib/contratTonnageParametres.ts` (pur),
`components/parametres/ParametresTonnageTab.tsx`, collection
`tonnage_echaf_parametres` (un document `contrat`).

- **Pourquoi ici** : le §A9 demande « L'utilisateur doit pouvoir modifier
  l'objectif de production **sans modifier les règles de calcul** ». C'est le
  régime déjà retenu pour les Tarifs NPT du CRJ (23/08/2026) et le contrat
  peinture (27/08/2026) — lecture connecté, écriture admin. Reprise sans
  migration : tant que le document n'existe pas, l'écran sert les valeurs des
  blobs importés **et le signale**, et « Enregistrer » écrit ce que l'admin a
  sous les yeux ; les blobs ne sont jamais réécrits.
- **L'objectif contractuel n'était nommé nulle part.** Il se déduisait de
  `personnelAnnexe.json` (blob en lecture seule) : 83,33 kg/h × 12 h × la
  capacité 2,5 = 2 500 kg/jour. Le chiffre était juste, il n'était ni lisible
  ni modifiable. **L'unité fait partie du réglage** (`UniteObjectifTonnage`,
  T ou KG), ce qui rend les trois exemples du §A9 saisissables tels quels
  (2,5 T/jour · 3 T/jour · 500 KG/jour), avec l'équivalent dans l'autre unité
  affiché à côté (§A5 : 1 T = 1 000 kg).
- **Les libellés de profil viennent des données, les coefficients du
  document.** Le classeur écrit « Chef d'Equipe » (sans accent, majuscule au
  E), le document « Chef d'équipe » — reprendre celui du document aurait
  introduit une orthographe concurrente de celle que portent les 3 384
  pointages et tous les menus. `coefficientDuDocument()` reconnaît le profil
  par son libellé ; **un profil que le document ne nomme pas n'a pas de
  coefficient inventé** et l'écran le signale (même règle que
  `productiviteHabituelle()`, 06/08/2026).
- **Le forfait de 5 T/champ/jour vient de la feuille, pas du document** :
  la colonne « Seuil » de SUIVI TONNAGE_ECHAF porte 5,0 sur les 3 champs et
  les 26 jours importés. Un champ portant plusieurs seuils rend `null` — on ne
  moyenne pas un forfait contractuel. **À ne pas confondre avec
  `TonnageContrat.seuilMutualisationT`**, qui alimente la colonne « Saving
  mutualisation » du Journal : un autre calcul, par ligne, dont le commentaire
  d'origine parle d'un plancher de 10 T.
- **Un écart de montant est affiché, pas tranché** : forfait matériel
  1 400 000 XAF/mois (document) contre 1 418 250 (classeur « Facturation au
  point »). La valeur du document est proposée — c'est le document de ce
  contrat — et l'écran dit l'écart sous le champ. Le forfait Core crew, lui,
  concorde exactement (6 000 000).
- **Les heures incompressibles partent vides**, et l'écran dit pourquoi : ni le
  document ni le classeur n'en donnent (même question ouverte que côté
  peinture). Un 0 se lirait « aucun incompressible », ce qui est faux.
- **Écart assumé avec le plan du recueil** : les causes de stand-by ne sont
  **pas** déclarées dans `CATALOGUE_LISTES` mais dans les paramètres du
  contrat — le régime de la peinture. Une cause appartient au contrat, avec
  son incompressible et ses forfaits ; la déclarer aux deux endroits en ferait
  deux sources à tenir d'accord.
- **Ce que le lot ne fait pas, et l'écran le dit en toutes lettres** : aucun
  calcul ne lit encore ces valeurs. Le Suivi personnel continue de dériver ses
  4 colonnes des paramètres du classeur (`derivePersonnelTonnage`). Le
  branchement est le **lot 2**, bloqué par trois questions dont **Q1** — le §A4
  affirme que « la somme des objectifs individuels doit **toujours** être égale
  à l'objectif global », ce qui fait dépendre l'objectif de l'effectif réel et
  **ferait diverger l'application du classeur sur les 3 384 lignes aujourd'hui
  vérifiées à 0 écart**. Les deux lectures coïncident exactement sur l'équipe
  de référence, d'où l'exemple du document qui ne les départage pas.
- **⚠️ Règle `firestore.rules` ajoutée : `tonnage_echaf_parametres` (lecture
  connecté, écriture admin) — PAS ENCORE DÉPLOYÉE.** C'est la première depuis
  le déploiement du 27/08/2026, et l'en-tête du fichier la signale comme telle.
  Sans déploiement, l'écran s'ouvre sur les valeurs des blobs (l'incident est
  signalé) mais l'enregistrement est refusé, l'erreur s'affichant sous le
  bouton.
- **Pas de tests ajoutés au dépôt, à la demande permanente de l'utilisateur** —
  10 vérifications ont tourné sur un fichier temporaire, exécuté puis supprimé
  (les 3 champs à 12 h / 5 T / 2,5 T ; les coefficients repris qui sont **les
  seules valeurs de productivité des 3 384 pointages réels** ;
  `capaciteReference()` = 2,5 et l'objectif rapporté à cette capacité qui
  redonne 1 T par monteur — la chaîne du document se referme ; la conversion
  T ↔ kg ; un profil hors document sans coefficient ; un document vide qui ne
  devient pas un document à zéros). `tsc -b`, `npm run lint`, `npm run build`
  et les **392 tests** existants passent.
- **Reste ouvert** : lots 2 à 7 — modèle de productivité calculé (Q1, Q2, Q3),
  rapport journalier (date / rédacteur / société, champ d'abord), stand-by
  journalier par cause + HSE (Q7, Q8), allègement de la saisie du pointage
  (Q11), mutualisation dérivée et courbe de cartographie (Q4, Q5, Q9, Q12),
  workflow de vérification et d'approbation (Q10 — « Responsable Technique »,
  « Chefs d'équipe », « superviseurs », « gestionnaires » : quatre acteurs
  cités, aucun existant dans les rôles de l'app).

**Tonnage échafaudage — lot 2 : le modèle de productivité devient un calcul
(03/09/2026)** — partie « DATA pour le calcul de la productivité » de
`doc/Suivi tonnage rev01.docx` (§A1 à §A10, 7 des 9 pages du document). Nouveau
`lib/tonnageProductivite.ts` (pur), branché sur le Suivi personnel et son
formulaire de saisie.

- **L'arbitrage central, tranché par l'utilisateur avant d'écrire (Q1)** :
  « l'objectif individuel se rapporte à l'effectif **réellement pointé** », et
  non à l'équipe de référence. C'est la seule lecture où la phrase du §A4
  (« la somme des objectifs individuels doit **toujours** être égale à
  l'objectif global ») est vraie — le classeur, lui, applique un rendement
  **fixe** par unité productive. Les deux coïncident exactement sur l'équipe de
  référence (d'où l'exemple du document, qui ne les départage pas) et divergent
  au-delà. **Mesuré avant d'écrire** : sur les 655 jours-champ du classeur, 318
  portent l'équipe de référence et 337 un effectif plus large — soit 2 430 des
  3 384 pointages sur un jour où les deux règles divergent, le plus souvent un
  **multiple exact** de l'équipe (2 équipes sur 151 jours, 3 sur 51, 4 sur 29).
  La relation entre les deux règles est exacte : `objectif retenu / objectif
  classeur = 2,5 / capacité du jour`.
- **Les 3 384 lignes importées gardent les valeurs du classeur** — le recalcul
  ne s'applique qu'aux lignes saisies dans l'application
  (`estLigneSaisie` : id numérique pour l'historique, doc ID Firestore pour une
  saisie, convention du module depuis le 06/08/2026). On ne réécrit pas
  l'histoire à rebours — même règle que la durée courue du Grand arrêt et les
  lignes importées de la peinture. `derivePersonnelTonnage` (le moteur qui
  reproduit le classeur, verrouillé à 0 écart par un test) **n'est pas touché**
  : il reste ce qui est écrit en base à l'enregistrement, et le nouveau moteur
  est une seconde couche à côté — la cohabitation déjà retenue pour
  `coutsUnitairesDuTarif` face à `deriveLigneJournal` côté peinture.
- **Q2 et Q3 tranchées sans rien faire diverger.** « Objectif prod. (KG) »
  (83,33 pour un monteur) était en réalité une **productivité horaire** — elle
  reçoit son vrai nom, « Productivité horaire (kg/h) », sans que son contenu
  change ; une **nouvelle colonne « Objectif / jour (kg) »** porte les 1 000 kg
  du §A5, toujours calculée (simple conversion, ne peut pas diverger). Le NPT
  existe désormais en heures **et** en pourcentage — « Stand-by = NPT (h) » /
  « NPT (%) » — sans donnée nouvelle : le §J l'intitule lui-même « Stand-by
  (STD=NPT) ».
- **La productivité n'est plus saisie** : c'est le coefficient du profil, lu
  dans les paramètres du contrat (lot 1), à défaut des pointages existants, et
  redevenant un champ **seulement** si aucun des deux ne connaît le profil — on
  n'invente pas un coefficient, on ne bloque pas la saisie non plus. Le
  formulaire montre en direct l'objectif en T et en kg, la productivité
  horaire, l'effectif du jour et sa capacité productive, et signale un profil
  sans coefficient — c'est le seul endroit où « une ressource est ajoutée »
  (§A10) se voit avant d'écrire.
- **Vérifié avant d'être branché, puis rejoué sur les 3 384 pointages réels** :
  l'exemple chiffré du §A4/§A6 à l'identique (0,5 T · 1 T · 1 T, 0,0417 et
  0,0833 T/h), l'invariant « la somme fait toujours l'objectif du champ » sur
  les 655 jours-champ, **0 écart avec le classeur sur les 954 pointages** à
  équipe de référence, la relation exacte `2,5/capacité` sur les 2 430 qui
  divergent, NPT et part de temps productif identiques au classeur partout. Une
  première assertion (« l'objectif recalculé est toujours inférieur à celui du
  classeur ») s'est révélée fausse — un chef d'équipe seul sur un champ reçoit
  à lui seul les 2,5 T, plus que le classeur — et a été remplacée par la
  relation exacte.
- **Aucune règle Firestore ajoutée par ce lot.** Celle du lot 1
  (`tonnage_echaf_parametres`) reste **non déployée** : le calcul tourne sur
  les valeurs des blobs importés tant qu'elle ne l'est pas.
- **Pas de tests ajoutés au dépôt, à la demande permanente de l'utilisateur** —
  18 vérifications sur un fichier temporaire, exécuté puis supprimé. `tsc -b`,
  `npm run lint`, `npm run build` et les **392 tests** existants passent.
- **État du recueil : 30 ✅ sur 58 (9 au départ), 17 🟡, 11 ⬜.** La partie A du
  document (7 de ses 9 pages) est close : 19 points sur 22.
- **Reste ouvert** : lots 3 à 7 — rapport journalier (date / rédacteur /
  société, champ d'abord), stand-by journalier par cause + HSE, allègement de
  la saisie du pointage, mutualisation dérivée et courbe de cartographie,
  workflow de vérification et d'approbation.

**Tonnage échafaudage — lot 3 : le rapport journalier (03/09/2026)** — partie
« FEUILLE JOURNAL (montage/dépose) » de `doc/Suivi tonnage rev01.docx` (§C,
TON1-24, 31-34). Le module n'avait pas d'unité de saisie « journée » : le
Journal est une liste de demandes, le Suivi personnel une liste de pointages.
Nouveau `types/tonnageEchaf.ts` (+`RapportTonnage`),
`lib/contratTonnageRapports.ts` (pur), `components/tonnage/RapportTab.tsx` +
`RapportTonnageModal.tsx`, collection `tonnage_echaf_rapports`.

- **Un point d'entrée par (date, champ)**, exactement la maille du §C
  (« sélectionner le champ concerné avant de renseigner son rapport
  journalier ») : le champ se choisit en premier, l'en-tête (rédacteur,
  société exécutante « GMI » par défaut) devient ensuite éditable, et deux
  panneaux listent — en lecture — les demandes du Journal et les pointages du
  Suivi personnel de ce jour-là sur ce champ.
- **Le rapport ne duplique aucune donnée** — même principe que
  `RapportPeinture` (27/08/2026) : deux fonctions pures filtrent le Journal
  et le Suivi personnel déjà chargés, elles n'écrivent rien.
  `personnesDuRapport()` regroupe les pointages par personne (nom, profils,
  projets) — exactement ce que demande TON1-24 (« qui a travaillé et sur
  quel projet »), qui restait noyé dans le reste avant ce lot.
- **Deux boutons « Ajouter »** ouvrent les formulaires de saisie existants,
  **préremplis sur la date et le champ du rapport** (nouveau prop `defaut`,
  appliqué à la création seulement) — le rapport ne devient pas une
  troisième façon de saisir une demande ou un pointage, c'est un raccourci
  vers les deux qui existent déjà. `cleRapport(date, champ)` fait l'upsert :
  rouvrir un rapport déjà renseigné et l'enregistrer met à jour son en-tête
  au lieu d'en créer un second.
- **Vérifié dans un vrai navigateur, pas seulement par des fonctions
  pures** — parce que l'essentiel de ce lot est un parcours d'écran :
  serveur `vite dev` + Playwright headless, connexion avec le compte de
  démonstration admin affiché sur l'écran de connexion. Rejoué sur une
  vraie journée du classeur (24/06/2026, TRM) : le rapport affiche
  exactement 52 demandes et 9 pointages, les mêmes chiffres que les
  fonctions pures donnent hors écran ; le module se charge sans erreur
  console hors les `permission-denied` **attendues** des deux collections
  non déployées.
- **Un bug trouvé en conditions réelles, invisible à `tsc`** : le bouton
  « Ajouter » côté Journal préremplissait la date mais pas le champ.
  `JournalTab`/`PersonnelTab` déclarent l'objet transmis par le rapport
  `{ date, champ }` (singulier, comme `RapportTonnage.champ`), les
  formulaires de saisie attendent `{ date?, champs? }` (pluriel, comme
  `LigneJournalTonnage.champs`) — `defaut` étant optionnel et passé par une
  variable, la vérification des propriétés en excès de TypeScript ne s'y
  applique pas. Corrigé en traduisant `champ` → `champs` au point de
  transmission plutôt qu'en unifiant les deux noms partout : `champ` reste
  le vocabulaire du rapport, `champs` celui des feuilles importées (colonne
  réelle du classeur) — les confondre aurait touché des dizaines d'usages
  existants pour un gain nul. Revérifié après correction : les deux
  formulaires préremplissent désormais date **et** champ.
- **Aucune règle Firestore déployée** pour `tonnage_echaf_rapports`
  (ajoutée localement, comme celle du lot 1) : sans déploiement, la liste
  reste vide en production et l'enregistrement échoue, en le disant.
- **Pas de tests ajoutés au dépôt, à la demande permanente de
  l'utilisateur.** `tsc -b`, `npm run lint`, `npm run build` et les
  **392 tests** existants passent.
- **État du recueil : 35 ✅ sur 58 (9 au départ), 13 🟡, 10 ⬜.** La partie A
  (7 pages sur 9) et la partie C (en-tête du rapport, §31-34) du document
  sont closes.
- **Reste ouvert** : lots 4 à 7 — stand-by journalier par cause + HSE dans le
  rapport, allègement de la saisie du pointage, mutualisation dérivée et
  courbe de cartographie, workflow de vérification et d'approbation.

**Tonnage échafaudage — lot 4 : stand-by journalier et HSE journalier
(03/09/2026)** — les deux sections du rapport laissées vides au lot 3
(TON1-21, 22, 52-55). Résout **Q7 et Q8**, les deux questions qui bloquaient
ce lot.

- **Aucune nouvelle collection** : `RapportTonnage` (`types/tonnageEchaf.ts`)
  gagne `standByTotalHeures` + `standByCauses: StandByCauseTonnage[]` et
  `hse?: Record<CompteurHse, number>` — le module n'a pas de notion de
  « catégorie » dans son Journal (montage/dépose uniquement, contrairement à
  la peinture), rien n'y aurait accueilli des lignes STD. Les deux sections
  vivent donc à côté du rédacteur et de la société, sur le même document.
- **Stand-by, repris fonction pour fonction de la peinture**
  (`contratPeintureRapports.ts`, 27/08/2026) : `lib/contratTonnageRapports.ts`
  gagne `totalDesCausesTonnage`, `ecartStandByTonnage`,
  `standByEstCoherentTonnage`, `estIncompressibleTonnage`,
  `standByParDefautTonnage`. **Contrôle bloquant** (comme la peinture) : le
  bouton « Enregistrer le rapport » de `RapportTonnageModal` reste désactivé
  tant que le total des causes ne coïncide pas avec le total déclaré, écart
  affiché en direct.
- **Q7 tranchée sans migration ni dérivation** : la colonne `standby` du
  pointage personnel (`LignePersonnelTonnage.standby`, par nom et n° de
  demande) reste **inchangée** — elle continue d'alimenter le NPT du
  classeur via `derivePersonnelTonnage` (lot 2). Le stand-by journalier du
  document est une saisie **distincte** qui ne la lit ni ne l'écrit : les
  deux répondent à deux demandes différentes du document (§A11 vs §J), pas à
  la même.
- **HSE, mêmes 6 compteurs que le CRJ, jamais redéfinis** :
  `RapportTonnage.hse` reprend directement `COMPTEURS_HSE`/`CompteurHse` de
  `types/hebdoCrj.ts` — deux jeux d'indicateurs auraient donné deux LTIF non
  comparables entre modules.
- **Q8 tranchée par ce que le rapport porte déjà** : le CRJ ventile ses
  événements par société, scope et tâche ; le rapport tonnage ne porte
  qu'**une seule société par jour** (`societeExecutante`) et n'a ni scope ni
  tâche. Ventiler aurait inventé une dimension que ce module ne porte pas —
  les 6 compteurs vivent directement sur le document, à sa maille
  (date + champ).
- **`RapportTonnageModal`** gagne les deux sections, dont le pré-remplissage
  (total existant, ventilation, incompressible par défaut, compteurs HSE) se
  recharge à chaque changement de (date, champ) — pas seulement à
  l'ouverture, puisque le champ se choisit à l'intérieur d'elle — même patron
  `chargePour` pendant le rendu que le rapport peinture. `RapportTab` (la
  liste) gagne deux colonnes, « Stand-by (h) » et « Événements HSE ».
- **Vérifié en direct dans un navigateur** (Playwright headless, compte de
  démonstration admin) : choix du champ AGM, total 8 h + une cause 3 h → le
  bouton « Enregistrer » est bien **désactivé** et l'écart (« −5 h »)
  s'affiche ; ajout d'une seconde cause portant le total à 8 h → le bouton se
  **réactive** ; les 6 champs HSE s'affichent avec les libellés exacts du
  CRJ. Le clic sur « Enregistrer » échoue avec « Missing or insufficient
  permissions » : attendu, la règle `tonnage_echaf_rapports` du lot 3 n'est
  toujours pas déployée — pas un défaut de ce lot.
- **8 vérifications** sur un fichier temporaire (`vitest run`, exécuté puis
  supprimé), dont l'exemple chiffré du document (8 h = causes ventilées) et
  l'identité des 6 compteurs avec le CRJ.
- **Aucune règle Firestore de plus à ajouter** : tout s'écrit dans
  `tonnage_echaf_rapports`, déjà couverte par la règle du lot 3
  (elle-même **toujours non déployée**).
- **Pas de tests ajoutés au dépôt, à la demande permanente de
  l'utilisateur.** `tsc -b`, `npm run lint`, `npm run build` et les
  **392 tests** existants passent.
- **État du recueil : 40 ✅ sur 58 (9 au départ), 12 🟡, 6 ⬜.** La partie A11
  (stand-by + HSE, §J/§K) est close ; TON1-55 (heures incompressibles par
  défaut) reste 🟡, faute de valeur donnée par le document ou le classeur
  (Q6, sans réponse).
- **Reste ouvert** : lots 5 (allègement de la saisie), 6 (mutualisation
  dérivée et courbe de cartographie, bloqué par Q9) et 7 (workflow de
  vérification et d'approbation, bloqué par Q10).

**Tonnage échafaudage — lot 5 : allègement de la saisie (03/09/2026)** —
feuille personnelle, identification, modification (TON1-23, 27, 29, 38, 39,
40, 41, 42). Résout **Q11**.

- **Feuille personnel (§B, TON1-23/29)** : `projetsDuJournal(journal, date,
  champ)` remplace `valeursDistinctes(personnel, 'projet')` comme source du
  menu Projet — « pas toute la liste des affaires, mais celles renseignées à
  la date du compte rendu ». Repli sur l'historique complet si le Journal du
  jour est encore vide. `serviceDuProjetJournal()` déduit le service dès
  qu'il est sans ambiguïté (« si on a choisi le projet c'est que
  l'information sur le service on l'a déjà ») et l'affiche en `ChampDerive` ;
  sinon la saisie manuelle reste le repli, comme partout dans ce projet
  quand une dérivation ne peut pas trancher. Site et n° de demande restent
  manuels — le document ne les cite pas dans TON1-29.
- **Deux enums fermés, casse des données réelles reprise plutôt que celle
  du document** (même arbitrage que `FILTRE` côté peinture, 06/08/2026) :
  `MODES_FACTURATION_TONNAGE = ['Core crew', 'Part Variable']` (Journal **et**
  Suivi personnel, résout TON1-39 et la réserve de TON1-27) et
  `VALEURS_MODIFICATION_TONNAGE = ['OUI', 'NON']` (TON1-40). Une valeur déjà
  enregistrée hors de ces listes resterait sélectionnable, aucune ligne
  réelle n'est dans ce cas.
- **Modification change d'étape** : de « Notes » (facultative) vers
  « Dimensions », à côté du poids contractuel qu'elle qualifie — « elle
  commande un calcul ».
- **`productionDuJourTonnage(l, contrat)` résout TON1-41 et Q11** : rend le
  poids contractuel de la ligne quand `modification === 'OUI'`, `null`
  sinon — aucune notion générale de « production du jour » n'existe ailleurs
  dans le module opérationnel. **Q11 tranchée par l'exemple même du
  document** : « Jour 1 montage initial · Jour 2 demande de modification »
  décrit deux demandes distinctes, donc les cotes d'une ligne modification
  décrivent la modification seule — l'égalité avec le poids contractuel est
  immédiate, pas de delta à calculer. Affichée en dérivé pendant la saisie et
  en colonne du Journal (« Production du jour (T) »). **Vérifié sur les 142
  lignes réelles « OUI »** du classeur : chacune retrouve exactement son
  propre poids contractuel, aucune des autres lignes n'affiche de valeur
  inventée.
- **N° de demande visible sur les 3 autres étapes** (résout TON1-42) : une
  ligne « Demande n° {numeroDemande} » sous la flèche de suivi dès qu'on
  quitte « Identification » — jusqu'ici il ne se lisait qu'en résumé de
  chevron, donc seulement quand on l'avait déjà quittée.
- **Nettoyage** : `tonnage.modesFacturation` retirée de Paramètres › Listes
  de valeurs (`CATALOGUE_LISTES`), devenue orpheline une fois le champ fermé
  à deux valeurs qui commandent un traitement — même exclusion que les
  statuts Procurement et le société/profil du CRJ.
- **Vérifié en direct dans un navigateur** (Playwright headless, compte
  admin) : Journal — Projet en `DatalistInput`, Mode de facturation en menu
  fermé à 3 options, n° de demande « TEST-9999 » visible en changeant
  d'étape, 3 cotes à 2 m + Modification = OUI affichant « Production du jour
  (T) : 0,288 », identique au poids contractuel affiché juste à côté. Suivi
  personnel — sur le 24/06/2026 (champ AGM), le menu Projet ne propose que 3
  noms réels du Journal de ce jour ; choisir « ARMOIR COMPTABLE » fait
  passer Service en lecture seule avec « Construction », déduit.
- **10 vérifications** sur un fichier temporaire (`vitest run`, exécuté puis
  supprimé), dont la production du jour rejouée sur les 142 lignes réelles.
- **Aucune règle Firestore** touchée par ce lot.
- **Pas de tests ajoutés au dépôt, à la demande permanente de
  l'utilisateur.** `tsc -b`, `npm run lint`, `npm run build` et les
  **392 tests** existants passent.
- **État du recueil : 47 ✅ sur 58 (9 au départ), 8 🟡, 3 ⬜.** Les parties B,
  E, F et G du document sont closes.
- **Reste ouvert** : lot 6 (mutualisation dérivée et courbe de cartographie,
  bloqué par Q9) et lot 7 (workflow de vérification et d'approbation,
  bloqué par Q10).

**Tonnage échafaudage — lot 7 : workflow de vérification et d'approbation
(03/09/2026, demande explicite « fais le lot 5 et ensuite le 7 », orientée
« en t'appuyant sur le document »)** — §D « WORKLOW » (TON1-35, 36, 37).
Résout **Q10**. Le `.docx` a été relu directement (extraction XML) pour
vérifier qu'aucun détail n'échappait au recueil — confirmé, les trois
phrases du §D sont tout ce que le document dit sur ces quatre acteurs.

- **« Chefs d'équipe » ne devient pas un profil** : la saisie reste ouverte
  à tout connecté, comme partout ailleurs dans le module — seule manquait la
  trace de qui avait saisi (`RapportTonnage.saisiPar`/`saisiLe`, posés une
  fois à la création, jamais réécrits par une modification ultérieure de
  l'en-tête).
- **`ProfilTonnage`** (`types/user.ts` :
  `'responsable_technique' | 'superviseur' | 'gestionnaire_contrat'`) pour
  les trois autres — même mécanique que `ProfilValidationNavette`
  (11/08/2026) : un champ à part de `UserRole`, désigné par un admin
  (`definirProfilTonnage`, calque exact de `definirProfilNavette`), sans
  toucher aux rôles globaux ni aux règles Firestore de toute l'application.
  Second menu « Workflow Tonnage échafaudage » sur l'écran Utilisateurs, à
  côté de celui de la navette.
- **Un seul niveau d'approbation**, tranché entre les deux précédents du
  plan de lot (visa à deux étapes de la navette / workflow à 7 étapes du
  module Contrat) : le document ne décrit qu'un acteur qui approuve
  (« le Responsable Technique... approuve »), jamais une cascade.
- **`RapportTonnage.validation?: { approuvePar, approuveLe }`** (absent =
  jamais approuvé) et **`commentaires?: CommentaireRapportTonnage[]`**
  (`{ id, auteur, texte, signalementErreur, creeLe }`) — aucune nouvelle
  collection. `lib/contratTonnageWorkflow.ts` (pur) :
  `peutApprouverTonnage` (Responsable Technique ou admin qui supplée),
  `peutCommenterTonnage` (les trois profils, ou admin), `estApprouve`.
- **Piège trouvé en concevant `enregistrerRapportTonnage`, avant tout
  test** : `setDoc` remplace le document entier — sans reporter
  explicitement `saisiPar`/`saisiLe`/`validation`/`commentaires` de
  l'existant vers le nouveau, corriger un simple champ d'en-tête (le
  rédacteur, par exemple) aurait **effacé silencieusement** l'approbation et
  les commentaires d'un rapport déjà vérifié.
- **`RapportTonnageModal`** gagne une section « Vérification et
  approbation » (statut, bouton d'approbation gardé par
  `peutApprouverTonnage`, liste de commentaires + formulaire gardé par
  `peutCommenterTonnage`, les deux désactivés tant que le rapport n'a pas
  été enregistré une première fois) et **verrouille les autres champs**
  (rédacteur, société, stand-by, HSE) pour qui ne peut pas approuver un
  rapport déjà approuvé — « validation définitive » (TON1-37) devient
  concret. Les commentaires restent ouverts après approbation : ce n'est
  pas ce que le document verrouille. `RapportTab` gagne une colonne
  « Statut ».
- **Vérifié en direct dans un navigateur** (Playwright headless, compte
  admin) pour la partie la plus à risque, la section Vérification et
  approbation : elle s'affiche dès qu'un champ est choisi, avec « Pas
  encore approuvé. », un bouton « Approuver ce rapport » **correctement
  désactivé** (aucun rapport enregistré) et un champ de commentaire
  **correctement désactivé**, chacun avec le message expliquant pourquoi.
  Le sélecteur de profil de l'écran Utilisateurs, lui, **n'a pas pu être
  vérifié par capture** : la liste des comptes est revenue vide dans le
  navigateur de test (« Aucun utilisateur »), même instabilité de connexion
  Firestore que sur de nombreuses autres collections pendant cette session
  (`Missing or insufficient permissions`, présente **avant** ce lot). C'est
  un calque mécanique du menu `profilNavette` déjà en production ; la
  vérification visuelle reste à refaire.
- **3 vérifications** sur un fichier temporaire (`vitest run`, exécuté puis
  supprimé) : matrice complète des deux permissions sur les 4 profils +
  admin + `null`, et `estApprouve` absent vs. présent.
- **Aucune règle Firestore de plus** : les écritures passent par
  `tonnage_echaf_rapports` (lot 3) et `utilisateurs` (déjà `if estAdmin()`
  en écriture) — l'application applique le profil plus finement que la
  règle, même principe que les visas de la navette.
- **Pas de tests ajoutés au dépôt, à la demande permanente de
  l'utilisateur.** `tsc -b`, `npm run build` et les **392 tests** existants
  passent ; `npm run lint` (portée `src/`) aussi — l'exécution sans portée
  (`eslint .`) échoue sur un fichier `firebase.ts` apparu à la racine
  pendant la session (voir l'anomalie ci-dessous), étranger à ce lot.
- **État du recueil : 50 ✅ sur 58 (9 au départ), 8 🟡, 0 ⬜ — plus aucun
  point non traité.** Les parties B, C, D, E, F, G du document sont closes.
- **Anomalie signalée, sans rapport avec ce lot** : en fin de session,
  `git status` a montré un état inattendu du dépôt apparu sans action de ma
  part — un `firebase.ts` non suivi à la racine (config d'un projet
  Firebase **différent**, `webicp`, pas `driver-6ae2b`), deux PDF suivis
  disparus du disque (`Logique_metier_liaisons_ICP.pdf`,
  `doc/Module Contrat — état de livraison.pdf`) et un `Présentation1.pptx`
  non suivi. Rien de tout cela n'a été touché ni créé par ce travail —
  signalé à l'utilisateur, aucun fichier concerné modifié ou supprimé.
- **Reste ouvert** : lot 6 seul (mutualisation dérivée et courbe de
  cartographie), bloqué par Q9 — les valeurs de la capture `image5.png` ne
  correspondent à aucune donnée disponible.

Ne restent en mock/local :
- `data/courbeEnS/*.ts` : les 3 feuilles d'activités et les 5 courbes types
  du classeur (données réelles, livrées avec le module — cf. ci-dessus).
- `data/navette.ts` : `initialRFSRecurrents` et `initialProjetsCandidatsBU`
  (annexes Navette) — données génériques illustratives, jamais rattachées à
  un classeur réel, aucune collection Firestore.

Le second étage de la Phase 3 du document de liaison (dériver
planning/HSE/procurement depuis les journaux plutôt que servir la copie
figée importée par `import-projets-complets.ts`) n'est fait qu'en partie —
voir "Liaison inter-modules" ci-dessous.

`ProjectsContext` (fiches projet) **persiste bien** : chaque mutation passe
par `updateProject()` → `sauvegarderProjet()` (`data/projects.ts`, `setDoc`
sur `projets/{id}`), et `firestore.rules` ouvre l'écriture à tout connecté
(commentaire daté du 26/07/2026 dans le fichier de règles). Ce paragraphe
affirmait le contraire jusqu'au 11/08/2026 — corrigé après vérification du
code.

**Deux instances Firebase, une par branche (04/09/2026, demande explicite
« on va distinguer les instances »)** — l'anomalie relevée en fin de session
le 03/09/2026 (un `firebase.ts` non suivi apparu à la racine, config d'un
projet `webicp` différent de `driver-6ae2b`) était en réalité le dépôt
volontaire, par l'utilisateur, de la config du nouveau projet destiné à la
partie prod : « ces informations seront pour la partie prod dédiée […] la
base de données sera vide, le déploiement se fera sur Hosting de Firebase ».
Clarifié dans l'échange : **la branche `main` garde `driver-6ae2b`** comme
instance **pré-prod** (celle déjà utilisée jusqu'ici, partagée avec les apps
"driver", cf. section Backend ci-dessus) ; **la branche `prod` (celle-ci)
devient l'instance dédiée `webicp`** — base Firestore volontairement vide au
déploiement, seules les règles de sécurité et les comptes créés depuis
l'écran Agents y vivent, aucune donnée métier n'y est importée.
- **La distinction se fait par fichier suivi, pas par `.env.local`** :
  `.env.local` est ignoré par git (`*.local`), donc identique quelle que soit
  la branche extraite — il ne peut pas porter cette différence. Nouveau
  `.env.production` (suivi par git, contrairement à `.env.local`) : les clés
  de config Firebase web (apiKey/authDomain/projectId) ne sont pas des
  secrets — protégées par `firestore.rules`, pas par leur confidentialité —
  et peuvent donc être committées sans risque, une valeur différente par
  branche. `.firebaserc` (`"default"`, déjà suivi) passe de `driver-6ae2b` à
  `webicp` sur cette branche, pour que les commandes `firebase deploy` de
  `package.json` ciblent la bonne instance sans option supplémentaire.
  Renommées dans la foulée (04/09/2026, demande explicite « des commandes
  différentes pour les règles et déploiement ») : `reg`/`prod` (noms courts,
  et `prod` risquait de se confondre avec la branche du même nom) deviennent
  `deploy:rules` (règles seules), `deploy:hosting` (Hosting seul, sans
  reconstruire) et `deploy` (build + `deploy:hosting`, le geste courant).
- **Aucun changement dans `src/lib/firebase.ts`** : il lisait déjà
  `import.meta.env.VITE_FIREBASE_*`, jamais de config en dur — seul son
  commentaire d'en-tête a été mis à jour pour ne plus affirmer un projet
  unique. Le mécanisme qui fait fonctionner la distinction est entièrement
  dans l'ordre de priorité des fichiers `.env` de Vite, vérifié dans le
  code source de Vite avant d'être exploité (`getEnvFilesForMode` :
  `.env` < `.env.local` < `.env.[mode]` < `.env.[mode].local`, un fichier
  spécifique au mode l'emportant sur `.env.local`) puis **vérifié par un
  vrai build des deux côtés** : `vite build` (mode "production" par défaut)
  embarque `webicp`, `vite build --mode development` embarque
  `driver-6ae2b`. `npm run dev` n'est donc pas affecté par `.env.production`
  et continue de lire `.env.local`.
- `firestore.rules` reste un seul fichier de règles, dont le contenu (les
  `match` par collection) est le même sur les deux branches — seul son
  commentaire d'en-tête distingue désormais les deux historiques de
  déploiement : celui de `driver-6ae2b` (27/08/2026, partagé, précautions
  toujours impératives) et celui de `webicp`, encore à écrire une fois un
  premier `firebase deploy --only firestore:rules` confirmé sur ce projet
  dédié — pas fait dans cette session, c'est une action sur une infra de
  production à confirmer explicitement comme toute autre.
- **Reste à faire, hors code** (actions côté compte/console Firebase de
  l'utilisateur, pas automatisables) : créer le ou les premiers comptes
  Firebase Auth + document `utilisateurs/{uid}` (rôle admin) sur `webicp` —
  la base y étant vide, personne ne peut encore se connecter à l'écran
  Agents pour en créer d'autres depuis l'application elle-même — puis
  confirmer le premier déploiement des règles et du Hosting sur ce projet.
- Le fichier `firebase.ts` de la racine (scratch, non suivi, signalé le
  03/09/2026) a été supprimé une fois sa config reprise dans
  `.env.production` : il ne servait qu'à transmettre ces valeurs, sans lien
  avec `src/lib/firebase.ts` (jamais importé nulle part).

**Piège découvert le 04/09/2026, en conditions réelles : le script `build`
partagé rendait `npm run deploy` dangereux sur `main`.** Le mécanisme
ci-dessus (mode Vite « production » par défaut → `.env.production` →
`webicp`) est correct pour la branche `prod`, où `.firebaserc` cible aussi
`webicp` — build et déploiement se correspondent. Mais `package.json` est un
fichier ordinaire, pas branché sur la branche courante : sur `main`, où
`.firebaserc` cible `driver-6ae2b`, `npm run build` (mode par défaut)
embarquait quand même la config `webicp`. Un `npm run deploy` classique sur
`main` publiait donc sur le **Hosting de `driver-6ae2b`** un bundle qui parle
en réalité au projet `webicp` — dont la base Firestore est volontairement
vide et dont les règles ne sont pas déployées : **« Missing or insufficient
permissions » sur à peu près toutes les collections**, immédiatement
visible à l'usage. Reproduit puis corrigé le jour même : `dist/` embarquait
bien la chaîne `webicp` et aucune trace de `driver-6ae2b` (`grep -rl` sur les
deux valeurs dans `dist/`) ; un rebuild en `vite build --mode development`
puis un nouveau `firebase deploy --only hosting` ont résolu l'incident sur le
Hosting déjà en production.
- **Correctif** : le script `build` de **cette branche (`main`)** force
  désormais `vite build --mode development` (donc `.env.local`, donc
  `driver-6ae2b`) — `npm run build`/`npm run deploy` sur `main` ne peuvent
  plus embarquer `webicp` par erreur. Édition locale à cette branche : le
  script de la branche `prod` n'est pas concerné et doit garder le mode par
  défaut pour continuer à cibler `webicp`.
- **Retenir pour la suite** : la config Firebase embarquée dans un bundle
  dépend du **mode Vite au moment du build**, pas du `.firebaserc` utilisé au
  moment du déploiement — les deux peuvent diverger silencieusement. Avant
  tout déploiement Hosting sur ce projet, vérifier que le bundle dans `dist/`
  porte bien l'identifiant du projet visé (`grep -rl driver-6ae2b dist/` ou
  `grep -rl webicp dist/`) plutôt que de faire confiance au script par défaut.

**Module Travaux METAL — recueil de `doc/TRAVAUX METAL.docx` puis lots 1 et 2
(04/09/2026)** — `doc/recueil-module-travaux-metal.md` relève les **65 points**
(MET-01 à MET-65) et pose un plan en **7 lots**. Deux lots livrés à ce jour.

- **Lot 1 — masquer les champs et colonnes « back end »** (MET-13, 15→22,
  33→41), le plus simple : aucun nouveau champ, aucune migration, uniquement
  de l'affichage. `components/metal/affichageMetal.ts` (nouveau, même patron
  que `components/navette/affichageNavette.ts`) porte le catalogue des 42
  colonnes du tableau Travaux METAL en 5 groupes, avec les 8 colonnes visées
  par le document (Statut corrigé, Durée traitement, Durée projet, Durée MTO,
  Temps mis MTO, Prév. MTO, Check CFP, Check CFT) masquées par défaut —
  `AffairesTab.tsx` gagne le sélecteur `SelecteurAffichage` +
  `usePreferenceSelection('metal.colonnes', …)`, colonne `Affaire`
  verrouillée. Dans `AffaireMetalSaisieForm.tsx` : `PHASES_SAISIES` retire
  Durée MTO / Temps mis MTO / Prév. MTO de l'étape Avancement (aucune fonction
  de `travauxMetalEngine.ts` ne les lit, cf. le point de vigilance n°3 du
  recueil — elles restent sur le modèle) ; les deux `ChampDerive` Check
  CFP/Check CFT disparaissent de l'étape Documentation finale (restent
  calculés, utilisés dans le résumé d'étape et la colonne du tableau) ; DFA
  passe d'un `Input` texte libre à un `SelectChamp` Oui/Non, **sans** ajouter
  de statut de validation (Q2, réservée au lot 3).
- **Lot 2 — distinction « fiche existante » / « nouvelle affaire »**
  (MET-01, 04→06), tranché sur **Q1** : le document demande « le même
  fonctionnement que pour les CRJ » sans préciser lequel des deux CRJ possède
  (le `SelecteurFicheProjet` de base que METAL avait déjà depuis le
  13/08/2026, ou le menu à 3 origines gagné par le CRJ le 27/08/2026, rev03) —
  tranché pour l'option la plus complète et la plus littéralement fidèle au
  texte : le mécanisme du CRJ rev03 est **reproduit à l'identique** dans
  `AffaireMetalSaisieForm.tsx` (pas de composant partagé extrait — la logique
  reste, comme dans le CRJ lui-même, inline au formulaire, faute d'une
  seconde demande qui justifierait la factorisation). Menu à 3 groupes
  (`Fiches projet` / `Fichier navette` / `Feuille de route`, `useProjects` +
  `useNavette` + `useFeuilleDeRoute`, déjà disponibles dans l'arbre puisque
  ces providers enveloppent toute l'application) ; une ligne navette/FdR déjà
  liée à une fiche visible n'est pas listée une seconde fois ; une ligne sans
  fiche ne pré-remplit que son libellé, rien d'autre n'étant connu d'elle.
  **Deux modes visuellement distincts** (boutons « Projet existant » /
  « Nouvelle affaire », MET-06) remplacent l'ancien menu facultatif suivi
  d'un champ texte toujours modifiable — choisir « Nouvelle affaire » remet
  explicitement `projetId` à `null`, ce qui évite qu'un ancien rattachement
  survive silencieusement au changement de mode. Pré-remplissage à la
  sélection : `affaire` (nom/libellé), `champ` (uniquement connu pour une
  fiche projet — une ligne navette/FdR n'en porte pas), `avis` (premier
  `avisNumero`/`avisNumeros` non vide de la fiche). En édition d'une affaire
  déjà rattachée (`affaireInitiale.projetId` renseigné), le mode s'ouvre sur
  « Projet existant » avec l'option correspondante présélectionnée.
- **Aucune règle `firestore.rules` à ajouter ni à déployer** pour ces deux
  lots : ils ne font que lire `projets`, `lignes_navette` et `feuille_de_route`
  (déjà couvertes) et affichent différemment des champs déjà en base.
- **Pas de tests ajoutés au dépôt** — lot purement UI/affichage, aucune
  fonction pure nouvelle à isoler. `tsc -b`, `npm run lint`, `npm run build`
  et les **412 tests** existants passent après chaque lot.
- **Reste ouvert (avant le lot 3)** : commentaires par étape du formulaire,
  listes de référence restantes (Q5 transverse à tous les modules, Q6
  cosmétique), refonte de « Data Travaux Métal » en suivi financier réel via
  le mécanisme générique du module Contrat (Q3, la décision la plus
  structurante du recueil), distinction visuelle « donnée administrée ».

**Module Travaux METAL — lot 3 : DFA validé + statut automatique (04/09/2026,
« On y va avec le lot 3 »)** — MET-23, 42→45. Deux questions tranchées avant
d'écrire (Q2, Q4), en s'appuyant sur le patron déjà en place pour CFP/CFT.

- **Q2 — le DFA prend exactement la forme de CFP/CFT.** Le document demandait
  « dire si le DFA a été validé » en plus du Oui/Non déjà posé au lot 1 ;
  `dfa` joue désormais le rôle de `cfpApplicable`/`cftApplicable`, complété
  d'un nouveau `dfaDate` (`types/travauxMetal.ts`) et d'une fonction
  `checkDfa()` (`lib/travauxMetalEngine.ts`, réutilise `checkDocument()` —
  OK si OUI+date, OK si NON, sinon IN PROGRESS). **Écart assumé et voulu avec
  Check CFP/Check CFT** (masqués au lot 1, MET-19/20) : Check DFA reste
  **affiché** dans le formulaire (`AffaireMetalSaisieForm.tsx`, étape
  Documentation finale) et en colonne du tableau — c'est l'inverse d'un champ
  back end, MET-23 demande explicitement de le montrer. `enAttenteDocumentation()`
  lit désormais `checkDfa(a) !== 'OK'` au lieu de `!a.dfa` ; sans effet sur les
  116 affaires réelles, dont `dfa` vaut `null` partout.
- **Q4 — `statutAutomatique()` retombe sur IN PROGRESS, jamais CLOSED par
  défaut.** `statut` (`SelectChamp` manuel jusqu'ici) devient dérivé de
  `avancementGeneralReel()` : CLOSED seulement à 100 % d'avancement, IN
  PROGRESS dans tous les autres cas — y compris quand `avancementGeneralReel()`
  rend `null` (aucune phase chiffrée). Une affaire qui n'a pas commencé n'est
  jamais « terminée » par défaut. **Vérifié sur les 116 affaires réelles avant
  d'écrire la règle** : 107 des 112 lignes à statut connu concordaient déjà
  avec la règle automatique ; les 5 désaccords sont des affaires à 100 %
  d'avancement laissées « IN PROGRESS » par la saisie manuelle du classeur —
  exactement la dérive que cette règle supprime (MET-42, « le statut ne doit
  plus être renseigné manuellement »).
- **Le tableau ne fait jamais confiance à la valeur stockée** : la colonne
  « Statut » de `colonnes.tsx` appelle `statutAutomatique(a)` sur chaque
  ligne plutôt que de lire `a.statut` — même principe que les durées et les
  checks CFP/CFT, toujours recalculés dans ce module plutôt que repris figés
  (son classeur source les a de toute façon cassés en #REF!). Conséquence
  voulue : les 116 affaires importées et toute ligne enregistrée avant ce lot
  affichent immédiatement le bon statut, sans migration ni ré-enregistrement.
  Le champ `statut` reste écrit dans le document Firestore au moment
  d'enregistrer (`statutAutomatique(apercu)` appliqué juste avant
  `onSubmit`), pour qu'il reste lisible hors de l'application.
- Ne touche pas à `statutCorrige()`/`statutTravaux`, qui restent des champs
  indépendants, déjà automatiques depuis l'origine du module (point de
  vigilance n°1 du recueil).
- **Aucune règle `firestore.rules` à ajouter ni à déployer** — écriture dans
  `affaires_metal_saisie`, déjà couverte.
- **Pas de tests ajoutés au dépôt** — le module Travaux METAL n'a jamais eu de
  suite de tests depuis sa création (06/08/2026) ; comme pour lui, la
  vérification s'est faite en rejouant la règle sur les données réelles avant
  de l'écrire (script temporaire, exécuté puis supprimé). `tsc -b`,
  `npm run lint`, `npm run build` et les **412 tests** existants passent.
- **Reste ouvert (avant le lot 4)** : commentaires par étape du formulaire,
  listes de référence restantes (Q5, Q6), refonte de « Data Travaux Métal »
  en suivi financier réel (Q3, la décision la plus structurante du recueil),
  distinction visuelle « donnée administrée ».

**Module Travaux METAL — lot 4 : commentaires par onglet (04/09/2026, « ok le
lot 4 »)** — MET-25→31. Reprend le patron déjà en place pour les listes
structurées qui remplacent un champ texte unique (`Projet.analyseRisques`/
`analyseOpportunites`, `CommentaireTache` du CRJ).

- **`AffaireMetal.commentaire` (unique, texte libre) n'est jamais effacé ni
  réécrit** — un nouveau `commentaires?: CommentaireMetal[]`
  (`{ id, etape, texte }`, `types/travauxMetal.ts`) fait foi dès qu'il existe,
  **y compris vide** (une liste vidée à la main est une décision, pas une
  absence de saisie — même règle que `analyseRisques`).
  `commentairesDeLAffaire()` reprend l'ancien champ en **une seule entrée**
  rattachée à `cloture` (« Coût & statut », la seule étape où il était
  saisissable jusqu'ici) tant que `commentaires` n'existe pas, avec un
  sentinelle `ORIGINE_COMMENTAIRE_TEXTE_LIBRE` signalé à l'écran (« Repris de
  l'ancien commentaire unique… ») — même mécanique que
  `ORIGINE_TEXTE_LIBRE`/`risquesDeLaFiche()`. Le premier ajout, dans
  n'importe quelle étape, convertit l'affaire au nouveau modèle sans rien
  perdre.
- **`CommentairesEtape`** (composant local à `AffaireMetalSaisieForm.tsx`,
  une instance par étape — Identification / Planning / Avancement /
  Documentation finale / Coût & statut) : liste des entrées de l'étape
  courante, ajout en ligne, suppression. **Pas de side-panel séparé**
  (contrairement au CRJ, qui en a un pour une tâche du planning) : les 5
  étapes de ce formulaire sont déjà visitées une à une dans la même modale,
  un second niveau de navigation n'aurait rien ajouté.
- **`syntheseCommentairesMetal()`** concatène toutes les entrées, préfixées
  par leur étape (`[Planning] blah · [Avancement] blah2`, MET-26/27) — la
  colonne « Commentaire » du tableau (`colonnes.tsx`) et la recherche texte
  de `AffairesTab.tsx` (MET-31, « espace commentaire global ») lisent
  désormais cette même fonction au lieu du seul `a.commentaire`.
- **Aucune règle `firestore.rules` à ajouter ni à déployer** — écriture dans
  `affaires_metal_saisie`, déjà couverte.
- **Pas de tests ajoutés au dépôt** — même raison que le lot 3 : le module
  n'a jamais eu de suite de tests, la partie pure (`commentairesDeLAffaire`,
  `syntheseCommentairesMetal`) reste isolée et testable si le besoin revient.
  `tsc -b`, `npm run lint`, `npm run build` et les **412 tests** existants
  passent.
- **Correction du recueil au passage** : en clôturant ce lot, un recomptage
  ligne par ligne de `doc/recueil-module-travaux-metal.md` (script Python sur
  les 65 points, plutôt qu'un calcul de tête) a révélé que **9 points du
  lot 1** (MET-13, 15→18, 33→41) étaient restés marqués ⬜ dans les relevés
  précédents alors que le code les couvrait déjà intégralement depuis le
  04/09/2026 — erreur de tenue du document, pas un écart de code. Corrigés.
  État réel après le lot 4 : **52 ✅ / 4 🟡 / 6 ⬜ / 1 ❓ / 2 —** (sur 65).
- **Reste ouvert (avant le lot 5)** : listes de référence restantes (Q5,
  Q6), refonte de « Data Travaux Métal » en suivi financier réel (Q3, la
  décision la plus structurante du recueil), distinction visuelle « donnée
  administrée ».

**Module Travaux METAL — lot 5, partiel : listes de référence restantes
(04/09/2026, « On y va avec le lot 5 »)** — MET-55, 56, 59, 60. Avant
d'implémenter MET-59/60, l'utilisateur a été consulté explicitement sur Q5
(« comment traiter ça pour le lot 5 ? ») : **Q5 confirmée comme une décision
transverse, MET-59/60 reportés** — le référentiel de listes de valeurs de
toute l'application (Tonnage, Peinture, Procurement, EPCM, CRJ, feuille de
route, METAL…) reste **purement additif**, aucun mécanisme de renommage ou de
désactivation n'a été ajouté à `ListesValeursContext`.

- **MET-55/Q6, tranchée sans code** : « Type d'AIS » est bien une coquille
  pour « Type d'avis » — `metal.typesAvis` est déjà administrable depuis
  Paramètres › Listes de valeurs. Le recueil corrige la marque ❓ en ✅.
- **MET-56, tranchée sans code** : pas de nouvelle liste `metal.sites`
  dédiée — le référentiel `commun.plateformes` (déjà administrable, déjà
  partagé par les fiches projet, METAL, Procurement et les journaux terrain)
  **est** ce que le document appelle « Sites », c'est lui qui alimente le
  champ « Plateforme » du formulaire. En créer un second propre à METAL
  aurait dupliqué ce référentiel sans rien ajouter — un admin aurait dû se
  souvenir d'ajouter un site à deux endroits pour qu'il apparaisse partout.
- **MET-59/60, reportés sur décision explicite** : autoriser la modification
  ou la désactivation d'une valeur existante changerait un principe posé
  volontairement dès la création du référentiel (18/08/2026 pour la première
  liste, généralisé le 18/08/2026 à toutes) — « une valeur retirée du
  référentiel ne doit jamais faire disparaître un menu qu'une ligne porte
  déjà ». Le déployer casserait potentiellement l'affichage de données
  existantes dans **tous les modules qui l'utilisent**, pas seulement METAL.
  Trois options ont été présentées à l'utilisateur (reporter / l'ajouter
  partout / le réserver aux 6 listes `metal.*`) — **reporter** a été choisi,
  ce qui laisse le mécanisme actuel inchangé.
- **Aucune règle `firestore.rules` à ajouter ni à déployer**, **aucun code
  modifié** pour ce lot — seul le recueil a été corrigé. `tsc -b`,
  `npm run lint`, `npm run build` et les **412 tests** existants restent
  inchangés et passent.
- **Recueil à jour (avant la suite) : 54 ✅ / 3 🟡 / 6 ⬜ / 0 ❓ / 2 —** (sur
  65) — dont MET-59 et MET-60 parmi les 6 ⬜, accompagnés de la décision de
  report.

**Module Travaux METAL — MET-59/60 finalement implémentés, transverse à tout
le référentiel (04/09/2026, « Pour le lot 5 on peut faire ce qui est demande
sur le document directement »)** — revirement le jour même sur la décision
de report qui précède : renommer et désactiver une valeur de référentiel,
pour toutes les listes de l'application (Tonnage, Peinture, Procurement,
EPCM, CRJ, feuille de route, METAL, Contrats), pas seulement METAL.

- **`types/listeValeur.ts`** : `EntreeListe` (`{ valeur, actif }`) remplace la
  chaîne nue comme brique de base d'une liste ajoutée. `avecRenommage()`
  (renomme en place, refuse une valeur vide/identique/en collision — casse
  ignorée) et `avecActivationBasculee()` (bascule `actif`, jamais de
  suppression), toutes deux pures, **7 tests** ajoutés.
- **`ListesValeursContext`** gagne `entreesDe()` (actives + inactives, pour
  l'écran d'administration), `renommerValeur()` et `basculerActivation()`,
  aux côtés de `ajouterValeur()`/`retirerValeur()` déjà là. **`valeursDe()`
  garde exactement sa signature** (`string[]`, actives seulement) : c'est
  l'API lue par les ~71 sites existants de l'application, aucun n'a eu à
  changer.
- **Portée délibérément bornée à ce que cette collection possède déjà** :
  seules les valeurs qu'un administrateur a **ajoutées** ici peuvent être
  renommées ou désactivées — jamais une valeur venue des données réelles
  (`valeursDistinctes`) ni d'un classeur importé (référentiel METAL, courbe
  en S…). C'est exactement la limite que Q5 avait fait remonter : renommer
  une valeur que des lignes réelles portent leur ferait afficher autre chose
  que ce que dit ce référentiel, et désactiver une valeur qu'elles utilisent
  la ferait disparaître d'un menu qu'elles proposent encore. Une valeur
  désactivée reste donc visible pour toute ligne qui la porte déjà (via
  `valeursDistinctes`) — seule la proposition pour une **nouvelle** saisie
  s'efface, ce qui laisse le référentiel additif intact pour tout le reste.
- **Aucune migration** : un document `listes_valeurs/{id}` écrit avant ce
  jour (`{ valeurs: string[] }`) reste lisible — converti en mémoire à la
  lecture (`{ valeur, actif: true }` par entrée), jamais réécrit en base à
  froid ; il prend la nouvelle forme au premier enregistrement qui le
  touche, comme toutes les évolutions de schéma de ce projet.
- **`ListesValeursTab.tsx`** : chaque puce de valeur ajoutée gagne un crayon
  (renommage en ligne, formulaire remplaçant la puce le temps de la saisie),
  un œil barré/œil (bascule active/inactive, badge « Désactivée » et texte
  barré sur les puces inactives) en plus de la croix de suppression
  définitive déjà là.
- **Vérifié en direct dans un navigateur** (Playwright, compte admin,
  `metal.typesTravaux` réel avec ses 42 valeurs déjà ajoutées) : ajout d'une
  valeur test, désactivation (badge affiché), réactivation (badge disparu),
  renommage (ancien nom disparu, nouveau visible), puis suppression —
  aucune trace laissée, aucune erreur console hors les
  « Missing or insufficient permissions » déjà documentées comme
  pré-existantes et sans rapport.
- **Aucune règle `firestore.rules` à ajouter** : `listes_valeurs` est déjà en
  écriture admin.
- `tsc -b`, `npm run lint`, `npm run build` et les **419 tests** (7 de plus)
  passent.
- **Recueil final : 56 ✅ / 3 🟡 / 4 ⬜ / 0 ❓ / 2 —** (sur 65).
- **Reste ouvert** : lots 6 et 7 — refonte de « Data Travaux Métal » en
  suivi financier réel (Q3, la décision la plus structurante du recueil) et
  distinction visuelle « donnée administrée ».
- **Anomalie sans rapport, observée puis résolue d'elle-même pendant cette
  session** : un `tsc -b` a momentanément échoué sur
  `src/components/tonnage/PersonnelTab.tsx` (imports/props non utilisés),
  fichier non touché par ce lot et modifié par un processus concurrent sur
  ce même dépôt — déjà résolu au contrôle suivant, sans intervention.

**Module Travaux METAL — lot 6 : Data Travaux Métal devient un vrai suivi
financier (04/09/2026, demande explicite « fais le lot 6, appuie-toi sur ce
qui est écrit dans le document »)** — MET-46→51, le lot le plus structurant
du recueil (Q3), tranché pour l'**option A** : celle que le recueil marquait
déjà « a priori recommandée » — réutiliser le mécanisme générique du module
Contrat (`commandes`, AVC, factures) plutôt qu'en construire un propre à
METAL.
- **Aucune affaire METAL n'a été rattachée à une commande** — la réserve du
  plan initial (« suppose de rattacher chaque affaire à une commande de ce
  contrat ») ne s'est pas concrétisée : `AffaireMetal.po` reste un texte
  libre, jamais transformé en identifiant de commande. Les deux sources
  cohabitent simplement dans le même tableau à l'affichage — même principe
  que partout ailleurs dans ce projet (jamais migrer, jamais halluciner une
  donnée pour combler un mécanisme neuf).
- **`consommationMetal(contrat, contratId)` réécrite** (`lib/contratsEngine.ts`)
  pour fusionner deux sources : les BC **historiques** importés du classeur
  (`contrat.suiviPo` — vérifié avant d'écrire : ce champ n'est écrit par
  aucun formulaire de l'application, seulement lu ici), dont la consommation
  reste `AffaireMetal.coutReel` groupé par `po` (inchangé, aucune facture
  n'existe pour ces lignes) ; et les commandes **vivantes** de la collection
  `commandes` dont `contratId` pointe sur ce contrat, dont la valeur cible
  (`montantActuelCommande` = initiale + AVC) et la consommation
  (`totalFactureCommande`, MET-50/51 : « la colonne Consommation doit donc
  représenter l'ensemble des montants facturés associés à cette commande »)
  sont désormais les vraies grandeurs vivantes. Une commande dont le numéro
  coïncide avec un BC historique **remplace** la ligne figée — c'est elle qui
  fait foi. Nouveau `ConsommationBc.origine?: 'commande'` pour que l'écran
  distingue les deux sans les confondre.
- **`ReferentielTab.tsx` ("Data Travaux METAL") devient une vue de lecture**,
  littéralement comme le recueil le décrivait : `TravauxMetalPage.tsx` charge
  désormais, en plus du reste, les contrats de type Métal
  (`listerContrats()` filtré `type === 'METAL'`, puis
  `chargerContratDetail()` pour chacun) et les passe à un nouveau bloc
  « Suivi financier » — valeur cible actuelle, consommation, taux, et le
  détail par BC/commande avec un badge d'origine (« Commande (vivant) » /
  « Classeur (historique) »). **Aucune saisie n'y est ajoutée** : un bouton
  « Gérer les commandes, AVC et factures → » (nouveau prop `onOpenContrats`,
  câblé dans `App.tsx` exactement comme `onOpenNavette` pour la feuille de
  route) renvoie vers `ContratsPage`, où `CommandesDuContrat`/
  `AugmentationsCommande`/`FacturesDuContrat` fonctionnent déjà pour un
  contrat de type Métal — confirmé avant d'écrire : ces trois composants sont
  rendus **sans condition de type** de contrat, aucune ligne n'y a été
  touchée pour ce lot.
- **L'ancien tableau « Suivi des POs »** (`MetalReferentiel.suiviPo`, blob
  figé importé du classeur, sans aucun rapport avec `ContratDoc.suiviPo` ni
  avec les commandes — deux structures homonymes mais disjointes) **reste
  affiché tel quel**, à part, sous un titre clarifié (« historique du
  classeur ») : le retirer aurait effacé de l'écran des montants d'affaires
  réels sans que le nouveau bloc ne les remplace (aucune commande n'existe
  encore pour ces BC-là).
- **Aucune règle `firestore.rules` à ajouter** : le lot ne fait que *lire*
  `commandes` et `contrats`, déjà couvertes ; aucune écriture nouvelle.
- **Pas de tests ajoutés au dépôt** — même raison que les lots précédents de
  ce module (jamais de suite de tests pour Travaux METAL) ; `consommationMetal`
  reste une fonction Firestore-directe, comme les 3 autres variantes
  `consommationX` du fichier, aucune d'elles testée. `tsc -b`, `npm run lint`,
  `npm run build` et les **419 tests** existants passent, à une réserve près
  (voir anomalie ci-dessous, sans rapport avec ce lot).
- **Recueil final : 62 ✅ / 0 🟡 / 1 ⬜ (MET-64) / 0 ❓ / 2 —** (sur 65). Seul
  le **lot 7** (distinction visuelle « donnée administrée ») reste ouvert.
- **Anomalie sans rapport avec ce lot, signalée puis résolue d'elle-même** :
  `src/pages/SuiviHebdoCrjPage.tsx:707` portait une erreur `tsc`
  (`supprimerAffaireExistante` déclarée mais jamais appelée) qui bloquait
  `npm run build` sur toute la branche — confirmé via `git status` : ce
  fichier n'était pas modifié par cette session, l'erreur venait donc d'un
  travail concurrent sur le module CRJ (même phénomène que les anomalies déjà
  relevées sur `components/tonnage/*` les 03-04/09/2026). Non corrigée ici,
  et déjà résolue au contrôle suivant (lot 7, ci-dessous) sans intervention
  de cette session.

**Module Travaux METAL — lot 7 : distinction visuelle « donnée administrée »
(04/09/2026, demande explicite « fais-le » — dernier lot du plan)** —
MET-64, le point le plus cosmétique du recueil.
- `DatalistInput` (`components/ui/ChampsSaisie.tsx`, composant partagé par
  Tonnage échafaudage, Facturation au point, CRJ **et** METAL) gagne un prop
  `administree?: boolean` : icône `Settings2` à côté du libellé, fin liseré
  indigo sur le champ (`ring-1 ring-indigo-200/70`) et `title` explicatif au
  survol (« Suggestions administrées depuis Paramètres › Listes de
  valeurs »). **Posé additivement** (`ring`, pas une réécriture de
  `border-*`) pour ne rien écraser de `champFormClass` — un conflit de
  spécificité Tailwind aurait pu rendre la teinte invisible ou incohérente
  selon l'ordre de génération du CSS.
- **Le marqueur se pose sur le champ, pas sur le composant** : un
  `DatalistInput` dont les suggestions ne viennent que des données existantes
  (`valeursDistinctes` seule, sans `avecAjouts`/`valeursDe`) n'a rien à
  administrer, et `administree` reste `undefined` par défaut — **aucun appel
  existant du composant n'est affecté**, le rendu est strictement identique à
  avant tant que le prop n'est pas fourni.
- **Les 8 champs concernés, vérifiés un par un** contre `suggestions`
  (`AffairesTab.tsx`) plutôt que devinés : les 6 listes propres à METAL
  (`metal.typesAvis/typesTravaux/typesCoreCrew/statutsTravaux/risques/
  priorites`) et les 2 listes partagées (`commun.champs`,
  `commun.plateformes`) sont **toutes** construites par
  `avecAjouts(donnees, valeursDe('…'))` — aucun champ de l'étape
  Identification n'utilise `DatalistInput` sans ce mélange, les 8 sont donc
  marqués.
- **Non étendu au-delà de METAL** : le plan du recueil le disait optionnel
  (« à étendre au-delà de METAL si retenu ») — ce lot clôt le recueil de
  `TRAVAUX METAL.docx`, il n'a pas mandat sur les autres modules qui
  utilisent aussi `DatalistInput`. Le prop est réutilisable partout où le
  composant sert déjà, sans migration ni changement de comportement à
  prévoir ailleurs.
- **Aucune règle `firestore.rules` à ajouter** — purement visuel, aucune
  écriture nouvelle.
- **Pas de tests ajoutés au dépôt** — même raison que les 6 lots précédents
  de ce module. `tsc -b`, `npm run lint`, `npm run build` (dont le blocage
  externe signalé ci-dessus, déjà résolu) et les **419 tests** existants
  passent.

**État final du recueil `doc/recueil-module-travaux-metal.md` : 63 ✅ / 0 🟡 /
0 ⬜ / 0 ❓ / 2 — sur 65 — les 7 lots du plan sont livrés.** Les deux seules
lignes non actionnables (MET-07, MET-65) sont de la rationale de document,
pas des demandes.

## Références métier

Les classeurs Excel sources, le CDS (`CDS outil.pdf`) et le document de
liaison (`Logique_metier_liaisons_ICP.docx` / `.pdf`) restent dans
`../app_icp` (racine). La description détaillée du domaine, des modules et de
l'état d'avancement backend est dans `../app_icp/CLAUDE.md` — elle fait
référence pour ce projet aussi (les chemins `apps/web/src/...` y
correspondent à `src/...` ici).

## Commandes

- `npm run dev` — serveur Vite (port 5173, ou 5174 si occupé)
- `npm run build` — tsc -b + vite build
- `npm run lint` — eslint

## Points structurants

- Domaine : pilotage projets/budgets/contrats industriels — **pas un CRM**.
- Gros journaux JSON (tonnage 7 911 lignes, peinture 2 124…) servis par
  l'API (`api.get()`), jamais dans le bundle initial.
- Liaison inter-modules (Logique_metier_liaisons_ICP.docx) :
  - **Phases 0-1 faites** : moteur de résolution en cascade
    `src/lib/liaison.ts`, extraction des clés par module
    `src/lib/liaisonCles.ts`, registre des confirmations manuelles
    `src/contexts/LiaisonContext.tsx` (persisté côté API depuis la Phase 1,
    `POST /liaison/confirmer` / `DELETE /liaison/registre/:id`), écran admin
    `src/pages/RapprochementPage.tsx`, hook `useResolveur()`.
  - **Phase 2 faite** (contrats portfolio, consommation dérivée — « plus de
    saisie ») : `src/pages/ContratsPage.tsx` + `ContratsService` côté API.
    Métal SESI (coûts réels par BC), Échafaudage GMI (chaîne facturation →
    BC), **Peinture GMI** (coût au pointage du journal, par site — ajouté le
    21/07/2026, contrat `GMI-PEINTURE-2026`). Les autres types (TIG,
    Personnel EPCM, Plongée, Topographie) restent en saisie manuelle
    mensuelle fallback.
  - **Phase 3 partiellement faite** : `ProjectsContext` sert désormais les 20
    fiches projet depuis `GET /projets` (21/07/2026) — mais c'est encore la
    copie figée du mock importée par `import-projets-complets.ts`, pas une
    dérivation depuis les journaux. Premier pas de dérivation ajouté le
    22/07/2026 : `components/projects/TravauxTerrainTab.tsx` affiche, sous
    les sections Tonnage et Peinture saisies manuellement, les lignes des
    journaux réels (Tonnage échafaudage, Peinture) résolues automatiquement
    à la fiche projet ouverte via `useResolveur()` — lecture seule, source
    marquée, `src/lib/journauxTerrainCache.ts` cache les deux journaux en
    mémoire (7 911 + 2 124 lignes, un seul fetch par session). **Mesuré sur
    les 20 fiches projet actuelles : ~0 lignes résolues** — ces fiches sont
    un jeu illustratif (générées depuis les libellés Navette ou saisies à la
    main) sans les vraies clés opérationnelles (n° avis/OT à 8 chiffres,
    codeOTP pas utilisé par `clesJournalTonnage`/`clesJournalPeinture`) que
    portent les journaux réels ; le rapprochement automatique ne s'active
    donc qu'avec de vraies données de fiche projet. Le composant l'affiche
    explicitement (« aucune résolue automatiquement ») plutôt que de masquer
    la section, pour que ce ne soit pas pris pour un bug.
  - **Logique métier ajoutée le 22/07/2026, pas encore branchée à l'UI**
    (demande explicite : la logique d'abord, les liens/interactions ensuite).
    Chaque fonction est pure (prend des données déjà chargées/résolues en
    entrée, ne fetch rien) et vérifiée contre les vraies données via l'API
    avant d'être écrite ici :
    - `lib/hebdoCrjEngine.ts` → `deriveIndicateursHSE(journal)` : accidents =
      fatal + LTI, quasi-accidents = near-miss + premiers soins, heures
      travaillées = somme des heures de productivité réelle du CRJ.
      `joursArretCumules` reste à 0 : pas de champ "jours d'arrêt" dans le
      journal (compteurs d'événements uniquement), donc pas dérivable en
      l'état — resterait en saisie manuelle. Vérifié sur le CRJ réel (9
      lignes en base) : 2 quasi-accidents, 0 accident.
    - `lib/hebdoCrjEngine.ts` → `dernierAvancementReel(lignesProjet)` :
      dernier `avancementReel` connu par date, sur des lignes déjà filtrées
      pour un projet (le filtrage lui-même = liaison, phase suivante).
    - `lib/procurementEngine.ts` → `chainesDa()` : reconstitue DA → AO → PO
      via `numeroDa` et calcule les délais réels par étape (lancement,
      traitement AO, fabrication PO, écarts ETA maritime/aérien) à partir
      des dates déjà présentes sur les journaux. Vérifié sur les données
      réelles : 21/82 DA ont un AO lié, 31/82 un PO lié, dates complètes sur
      les lignes matchées.
    - `lib/reconciliationBudgetaire.ts` → `ecartBudgetaire(fdr, lignesNavette)`
      (FdR ↔ Navette via compteImputation = codeOTP) et
      `coherenceRealiseYTD(ligneNavette, projet)` (Navette.realiseYTD vs
      cumul commandes + consommations contrats du projet lié par
      `ligne.projetId`, un lien direct déjà existant, pas une résolution
      floue). Vérifié : 38/84 lignes FdR se résolvent à une ligne Navette
      réelle, écarts non nuls observés (ex. 2 520 kUSD sur une campagne TIG
      AGM) — la fonction ne corrige rien, elle expose l'écart (principe CDS).
    - **Standby/NPT valorisé — logique ajoutée le 28/07/2026, toujours
      bloquée côté données** : `lib/hebdoCrjEngine.ts` →
      `coutStandbyPersonnel()`, `coutStandbyMateriel()`,
      `coutStandbyGlobal()`, paramétrées par une `GrilleTarifsNpt` fournie
      par l'appelant (tarifs journaliers par profil personnel et par type de
      matériel + heures/jour de référence pour la conversion jour→heure,
      même convention que TABLEAU_REGIE dans `facturationPointEngine.ts`).
      Le personnel se calcule proprement depuis `PersonnelMobiliseLigne.
      dureeStandBy` (heures de standby déjà présentes par société/profil/
      date) ; le matériel n'a **aucune durée d'inactivité propre** dans
      `MaterielSiteLigne` (juste une quantité mobilisée/jour), donc son coût
      est une approximation : taux de standby du personnel ce jour-là
      appliqué au matériel mobilisé la même date — à corriger si une vraie
      donnée d'inactivité matériel apparaît un jour. Aucune grille de tarifs
      journaliers n'a été importée (les blobs `lut__*`/`grand-arret__lut-*`
      sont des listes de travaux, pas des tarifs ; pas de collection
      `hebdo-crj__tarifs`) — **pas de tarifs fictifs codés en dur dans le
      moteur**, volontairement, pour ne jamais risquer d'être pris pour une
      vraie grille contractuelle : ces fonctions ne sont utilisables qu'avec
      une grille construite par l'appelant (test ou future donnée réelle) et
      ne sont pas encore branchées à l'UI. `causesDerivePlanning()` (heures
      cumulées par cause, préexistant) reste la seule pièce dérivable sans
      cette grille.
  - **Restant** : brancher ces fonctions aux onglets (HSETab, PlanningView,
    ProcurementTab, RapprochementPage/tableau de bord) et à la résolution
    par projet — c'est l'étape "interactions et liens" explicitement mise de
    côté pour cette session. Tableau de bord croisé (Phase 4, KPI multi-
    modules) pas commencé.
- Rôles admin/agent : `src/lib/permissions.ts` ; comptes réels via
  `AuthContext.tsx` + Firebase Auth (`data/users.ts`, le mock qu'il
  remplaçait, déjà supprimé).
