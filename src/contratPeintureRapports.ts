import type {
  AppartenanceEquipe,
  ItemMobilise,
  LigneJournalPeinture,
  ParametresContratPeinture,
  PersonnelMobilise,
  RapportPeinture,
  StandByCause,
  StatutAffairePeinture,
} from '../types/contratPeinture'
import {
  CATEGORIE_CONSOMMABLE,
  CATEGORIE_MATERIEL,
  UNITE_MATERIEL,
} from '../types/contratPeinture'

// Rapport journalier du contrat peinture (27/08/2026, `doc/Contrat
// peinture.docx` §1, §2, §3, §6 et §10 — lot 3).
//
// Le document insiste deux fois sur cette partie : « Cette fonctionnalité est
// essentielle » (§3) et « Cette fonctionnalité constitue le cœur du module de
// suivi peinture » (§6). Ce qu'elle demande :
//
//   « Le 26/08, un rapport de suivi peinture est créé. Le 27/08, lors de la
//   création du nouveau rapport, toutes les affaires dont le statut est
//   "En cours" doivent être automatiquement reprises. […] Les projets
//   terminés ne doivent plus apparaître. […] l'utilisateur n'aura qu'à mettre
//   à jour l'avancement du jour. […] Il doit également pouvoir ajouter de
//   nouvelles affaires si nécessaire. »
//
// Fonctions pures : l'écran leur passe le journal déjà chargé.

const cle = (v: string | null | undefined) => (v ?? '').trim().toLowerCase()
const nombre = (v: number | null | undefined): number | null =>
  typeof v === 'number' && Number.isFinite(v) ? v : null

/** Catégorie normalisée : le classeur mélange `PERSONNEL` et `Personnel`. */
const categorie = (l: LigneJournalPeinture) => (l.categorie ?? '').trim().toUpperCase()

export const estTravaux = (l: LigneJournalPeinture) => categorie(l) === 'TRAVAUX'

/**
 * Statut d'une affaire, avec son repli.
 *
 * **Les 2 124 lignes importées n'ont pas de statut** : elles sont lues « En
 * cours », qui est leur état de fait dans le classeur — une affaire y est
 * suivie tant qu'elle apparaît. Le repli dit exactement ce qu'une migration
 * écrirait, il n'y a donc pas de migration à lancer (même raisonnement que le
 * statut des lignes navette, 20/08/2026).
 */
export function statutAffaire(l: Pick<LigneJournalPeinture, 'statut'>): StatutAffairePeinture {
  return l.statut === 'Terminé' ? 'Terminé' : 'En cours'
}

/** Identifiant du rapport qui porte une ligne : un rapport par jour et par champ. */
export const cleRapport = (date: string, site: string) => `${date}__${cle(site)}`

/** Les lignes de pointage d'un rapport — le rapport ne les duplique pas. */
export function lignesDuRapport(
  journal: LigneJournalPeinture[],
  date: string,
  site: string
): LigneJournalPeinture[] {
  return journal.filter((l) => l.date === date && cle(l.site) === cle(site))
}

/**
 * La date du dernier rapport connu d'un champ **avant** une date donnée.
 *
 * C'est « la veille » du document, mais prise comme *le rapport précédent* et
 * non comme J−1 au calendrier : un chantier qui ne pointe pas le dimanche
 * doit retrouver ses affaires le lundi, pas repartir de zéro.
 */
export function dateRapportPrecedent(
  journal: LigneJournalPeinture[],
  site: string,
  date: string
): string | null {
  const dates = journal
    .filter((l) => cle(l.site) === cle(site) && l.date < date && estTravaux(l))
    .map((l) => l.date)
  return dates.length ? dates.reduce((a, b) => (a > b ? a : b)) : null
}

export interface AffaireReprise {
  /** La ligne du rapport précédent, dont celle du jour sera la suite. */
  origine: LigneJournalPeinture
  /** Surface réalisée à date au rapport précédent — le point de départ du jour. */
  surfaceVeille: number | null
}

/**
 * Les affaires à reprendre dans un nouveau rapport : celles du rapport
 * précédent du même champ **dont le statut est « En cours »**.
 *
 * « Les projets terminés ne doivent plus apparaître » : les affaires
 * « Terminé » sont écartées ici, ce qui *est* leur archivage — elles restent
 * entières dans le journal et dans tous les pivots, elles cessent seulement
 * d'être reproposées. Rien n'est supprimé.
 *
 * Rien n'est repris non plus si le rapport du jour porte déjà cette affaire :
 * une reprise ne doit jamais écraser ce qui a déjà été saisi, ni le dédoubler
 * (la règle du pré-remplissage du planning et du pointage EPCM, 26/08/2026).
 */
export function affairesAReprendre(
  journal: LigneJournalPeinture[],
  site: string,
  date: string
): AffaireReprise[] {
  const precedente = dateRapportPrecedent(journal, site, date)
  if (!precedente) return []
  const dejaSaisies = new Set(
    lignesDuRapport(journal, date, site).filter(estTravaux).map((l) => cleAffaire(l))
  )
  return lignesDuRapport(journal, precedente, site)
    .filter(estTravaux)
    .filter((l) => statutAffaire(l) === 'En cours')
    .filter((l) => !dejaSaisies.has(cleAffaire(l)))
    .map((l) => ({ origine: l, surfaceVeille: nombre(l.surfaceRealisee) }))
}

/**
 * Ce qui identifie une affaire d'un jour à l'autre : son intitulé, sa tâche et
 * son champ. Sert **uniquement** à ne pas reproposer une affaire déjà saisie
 * dans le rapport du jour — jamais à calculer une production, pour laquelle
 * c'est `lignePrecedenteId` qui fait foi (cf. `productionDuJour`).
 */
export function cleAffaire(l: LigneJournalPeinture): string {
  return [cle(l.projet), cle(l.tache), cle(l.site)].join('|')
}

/**
 * Production réalisée dans la journée, en m².
 *
 * Le §6 fait saisir une surface **cumulée** (« Surface peinte à date : 2 m² »
 * → 20 % d'une surface totale de 10 m²), donc la production d'un jour est la
 * différence avec le rapport précédent. Elle se lit par `lignePrecedenteId`,
 * posé par la reprise — et **pas** en cherchant « la même affaire la veille » :
 * cette recherche est précisément ce qui échoue sur les données importées, où
 * 118 des 625 transitions décroissent.
 *
 * Rend `null` — jamais 0 — pour une ligne sans reprise : une première journée
 * ne dit pas ce qui a été peint la veille, et une ligne importée non plus.
 */
export function productionDuJour(
  ligne: LigneJournalPeinture,
  parId: Map<string, LigneJournalPeinture>
): number | null {
  if (ligne.lignePrecedenteId == null) return null
  const precedente = parId.get(String(ligne.lignePrecedenteId))
  const avant = precedente ? nombre(precedente.surfaceRealisee) : null
  const apres = nombre(ligne.surfaceRealisee)
  if (avant === null || apres === null) return null
  return apres - avant
}

export function indexParId(journal: LigneJournalPeinture[]): Map<string, LigneJournalPeinture> {
  return new Map(journal.map((l) => [String(l.id), l]))
}

// --- Stand-by du jour (§10) ------------------------------------------------

/** Somme des heures ventilées par cause. Une cause non renseignée pèse 0. */
export function totalDesCauses(causes: StandByCause[]): number {
  return causes.reduce((t, c) => t + (nombre(c.heures) ?? 0), 0)
}

/**
 * « Le total des causes doit être obligatoirement égal au total déclaré. »
 *
 * Rend l'écart signé, ou `null` si aucun total n'a été déclaré — un rapport
 * sans stand-by n'est pas un rapport en faute.
 *
 * C'est l'un des rares contrôles de cette application qui **bloque** au lieu
 * d'avertir, et c'est le document qui le veut (« obligatoirement »). Il est
 * défendable ici et il ne l'était pas pour le paiement d'une facture
 * (CTR-26, 26/08/2026) : là-bas, refuser aurait fait perdre un fait déjà
 * constaté ; ici, les deux nombres sont sous les yeux de qui saisit, et l'un
 * des deux est faux.
 */
export function ecartStandBy(
  totalDeclare: number | null,
  causes: StandByCause[]
): number | null {
  const total = nombre(totalDeclare)
  if (total === null) return null
  return totalDesCauses(causes) - total
}

export function standByEstCoherent(totalDeclare: number | null, causes: StandByCause[]): boolean {
  const ecart = ecartStandBy(totalDeclare, causes)
  return ecart === null || Math.abs(ecart) < 1e-9
}

/**
 * Les lignes de pointage STD que produit le stand-by d'un rapport — une par
 * cause.
 *
 * Le stand-by est **saisi au jour et non par projet** (§10), et c'est ce qui
 * change par rapport à l'existant : sur les 345 lignes STD du classeur, 237
 * portent un projet, une tâche et un avis. Les lignes déjà en base gardent
 * les leurs — rien n'est réécrit —, mais celles saisies depuis un rapport
 * n'en portent aucun.
 *
 * Doc ID déterministe (date, site, cause) : réenregistrer un rapport met à
 * jour ses lignes de stand-by au lieu d'en empiler de nouvelles.
 */
export function lignesStandByDuRapport(rapport: RapportPeinture): {
  cleDocument: string[]
  ligne: Omit<LigneJournalPeinture, 'id'>
}[] {
  return rapport.standByCauses
    .filter((c) => c.cause.trim() !== '')
    .map((c) => ({
      cleDocument: [rapport.date, rapport.site, c.cause],
      ligne: {
        ...ligneVideDuRapport(rapport),
        categorie: 'STD',
        typeItem: c.cause.trim(),
        // §10 : « le stand-by est saisi de manière journalière et non par
        // projet ». Ni projet, ni tâche, ni fiche projet rattachée — c'est
        // déjà l'état de `ligneVideDuRapport`, rappelé ici parce que c'est la
        // seule chose qui distingue ces lignes des 237 lignes STD importées.
        qte: nombre(c.heures),
        unite: 'hr',
      },
    }))
}

/**
 * Le stand-by déjà enregistré pour un rapport, relu **depuis les lignes du
 * journal** plutôt que recopié dans le document du rapport : sans ça, corriger
 * une ligne STD dans le journal ferait diverger les deux.
 *
 * Le total déclaré, lui, reste porté par le rapport — c'est une déclaration de
 * l'utilisateur, pas une somme, et c'est tout l'objet du contrôle du §10.
 */
export function standByDepuisJournal(
  journal: LigneJournalPeinture[],
  date: string,
  site: string
): StandByCause[] {
  return lignesDuRapport(journal, date, site)
    .filter((l) => categorie(l) === 'STD')
    .map((l) => ({ cause: (l.typeItem ?? '').trim(), heures: nombre(l.qte) }))
    .filter((c) => c.cause !== '')
    .sort((a, b) => a.cause.localeCompare(b.cause, 'fr'))
}

// --- Personnel mobilisé du jour (§7) ---------------------------------------

/**
 * Les lignes de pointage PERSONNEL que produit l'effectif d'un rapport — une
 * par profil et par appartenance.
 *
 * §7 : « Cette catégorie sert **uniquement** à renseigner les effectifs
 * mobilisés et dire si c'est du personnel core crew ou hors core crew. » D'où
 * une saisie réduite à trois valeurs, là où le formulaire de pointage
 * proposait les 41 colonnes du classeur — surfaces, dates et priorité
 * comprises, qui n'ont aucun sens sur une ligne de personnel.
 *
 * `coreCrew` et `horsCoreCrew` sont les deux colonnes numériques du classeur :
 * l'effectif va dans l'une **ou** dans l'autre selon l'appartenance, jamais
 * dans les deux. Sur les 2 124 lignes importées, `horsCoreCrew` est vide
 * partout et `equipe` vaut `CORE CREW` — la distinction existait en colonne
 * sans avoir jamais servi.
 *
 * Doc ID déterministe (date, champ, profil, appartenance) : corriger un
 * effectif met la ligne à jour au lieu d'en créer une seconde.
 */
export function lignesPersonnelDuRapport(rapport: RapportPeinture, personnel: PersonnelMobilise[]): {
  cleDocument: string[]
  ligne: Omit<LigneJournalPeinture, 'id'>
}[] {
  return personnel
    .filter((p) => p.profil.trim() !== '' && nombre(p.effectif) !== null)
    .map((p) => ({
      cleDocument: [rapport.date, rapport.site, p.profil, p.appartenance],
      ligne: {
        ...ligneVideDuRapport(rapport),
        categorie: 'PERSONNEL',
        typeItem: p.profil.trim(),
        equipe: p.appartenance,
        qte: nombre(p.effectif),
        unite: 'hr',
        coreCrew: p.appartenance === 'CORE CREW' ? nombre(p.effectif) : null,
        horsCoreCrew: p.appartenance === 'HORS CORE CREW' ? nombre(p.effectif) : null,
      },
    }))
}

/**
 * L'effectif déjà enregistré pour un rapport, relu depuis les lignes du
 * journal — comme le stand-by, et pour la même raison : le recopier dans le
 * document du rapport ferait diverger les deux dès qu'une ligne est corrigée
 * ailleurs.
 */
export function personnelDepuisJournal(
  journal: LigneJournalPeinture[],
  date: string,
  site: string
): PersonnelMobilise[] {
  return lignesDuRapport(journal, date, site)
    .filter((l) => categorie(l) === 'PERSONNEL')
    .map((l) => ({
      profil: (l.typeItem ?? '').trim(),
      effectif: nombre(l.qte),
      appartenance: ((l.equipe ?? '').trim().toUpperCase() === 'HORS CORE CREW'
        ? 'HORS CORE CREW'
        : 'CORE CREW') as AppartenanceEquipe,
    }))
    .filter((p) => p.profil !== '')
    .sort((a, b) => a.profil.localeCompare(b.profil, 'fr'))
}

/**
 * Les avis d'une affaire, saisis en une seule fois et séparés par des
 * virgules ou des points-virgules (§6 : « Numéro d'avis **ou liste des
 * avis** »).
 *
 * Le premier reste `numeroAvis` : c'est lui que lisent le tableau, l'export
 * et la cascade de résolution vers une fiche projet. Les suivants vont dans
 * `numerosAvis`, sans quoi ajouter un second avis ferait perdre le premier.
 */
export function avisDepuisTexte(texte: string): {
  numeroAvis: string | null
  numerosAvis: string[]
} {
  const tous = texte
    .split(/[,;]/)
    .map((v) => v.trim())
    .filter(Boolean)
  return { numeroAvis: tous[0] ?? null, numerosAvis: tous }
}

export function texteDepuisAvis(ligne: Pick<LigneJournalPeinture, 'numeroAvis' | 'numerosAvis'>): string {
  const tous = ligne.numerosAvis?.length
    ? ligne.numerosAvis
    : ligne.numeroAvis != null
      ? [ligne.numeroAvis]
      : []
  return tous.map(String).join(', ')
}

/** Colonnes communes à toute ligne produite par un rapport, à vide. */
function ligneVideDuRapport(rapport: RapportPeinture): Omit<LigneJournalPeinture, 'id'> {
  return {
    date: rapport.date,
    dateDemande: null,
    ctr: rapport.societeExecutante,
    equipe: null,
    categorie: null,
    typeItem: null,
    numeroOt: null,
    numeroAvis: null,
    projet: null,
    projetId: null,
    tache: null,
    priorite: null,
    qte: null,
    surfaceTotale: null,
    surfaceRealisee: null,
    surfacePrevisionnelle: null,
    coreCrew: null,
    horsCoreCrew: null,
    unite: null,
    dateDebut: null,
    dateFin: null,
    duree: null,
    site: rapport.site,
    pctPrevisionnel: null,
    pctReel: null,
    cpyHeures: null,
    coutUnitairePointage: null,
    coutTotalPointage: null,
    coutUnitaireStandBy: null,
    coutTotalStandByMateriel: null,
    coutStandBy: null,
    coutUnitaireAncienContrat: null,
    coutTotalAncienContrat: null,
    saving: null,
    commentaire: null,
    filtre: null,
    mois: null,
    tempsProductionChamp: null,
    productiviteParProfil: null,
    cibleJour: null,
    partTempsProductif: null,
  }
}

// --- Consommables et matériel du jour (§8 et §9) ---------------------------

/**
 * Les lignes de pointage que produit une liste de consommables ou
 * d'équipements — une par item.
 *
 * Doc ID déterministe (date, champ, catégorie, item) : corriger une quantité
 * met la ligne à jour au lieu d'en créer une seconde. La **catégorie fait
 * partie de la clé** : rien n'interdit qu'un même nom existe des deux côtés,
 * et les écraser l'un l'autre serait pire que de les laisser cohabiter.
 */
export function lignesItemsDuRapport(
  rapport: RapportPeinture,
  items: ItemMobilise[],
  categorieCible: typeof CATEGORIE_CONSOMMABLE | typeof CATEGORIE_MATERIEL
): { cleDocument: string[]; ligne: Omit<LigneJournalPeinture, 'id'> }[] {
  return items
    .filter((i) => i.nom.trim() !== '')
    .map((i) => ({
      cleDocument: [rapport.date, rapport.site, categorieCible, i.nom],
      ligne: {
        ...ligneVideDuRapport(rapport),
        categorie: categorieCible,
        typeItem: i.nom.trim(),
        qte: nombre(i.quantite),
        unite: i.unite?.trim() || (categorieCible === CATEGORIE_MATERIEL ? UNITE_MATERIEL : null),
      },
    }))
}

export function itemsDepuisJournal(
  journal: LigneJournalPeinture[],
  date: string,
  site: string,
  categorieCible: typeof CATEGORIE_CONSOMMABLE | typeof CATEGORIE_MATERIEL
): ItemMobilise[] {
  return lignesDuRapport(journal, date, site)
    .filter((l) => categorie(l) === categorieCible.toUpperCase())
    .map((l) => ({ nom: (l.typeItem ?? '').trim(), quantite: nombre(l.qte), unite: l.unite }))
    .filter((i) => i.nom !== '')
    .sort((a, b) => a.nom.localeCompare(b.nom, 'fr'))
}

/**
 * Le matériel proposé d'office chaque jour : celui que les paramètres
 * déclarent **au forfait** (§9).
 *
 * « Le matériel inclus dans le forfait doit être comptabilisé automatiquement
 * chaque jour. Seul le matériel hors forfait devra être saisi manuellement. »
 *
 * **Quantité 1**, et c'est le seul endroit de ce lot où une valeur est posée
 * sans que le document la donne : « comptabilisé chaque jour » se lit comme
 * une occurrence par jour, au tarif unitaire du référentiel. Elle reste
 * modifiable et l'écran dit d'où elle vient — un forfait à quantité vide
 * serait facturé au tarif unitaire par `deriveLigneJournal` (la règle du
 * 07/08/2026), donc ne rien poser reviendrait au même sans le dire.
 *
 * **Ne propose que ce qui n'est pas déjà saisi** : un jour déjà pointé garde
 * ses quantités, la proposition ne les écrase jamais et se rejoue sans
 * doublon (la règle du pré-remplissage du planning et du pointage EPCM).
 */
export function materielAuForfait(
  parametres: ParametresContratPeinture | null,
  dejaSaisi: ItemMobilise[]
): ItemMobilise[] {
  if (!parametres) return []
  const presents = new Set(dejaSaisi.map((i) => cle(i.nom)))
  return parametres.equipements
    .filter((e) => e.auForfait && !presents.has(cle(e.nom)))
    .map((e) => ({ nom: e.nom, quantite: 1, unite: UNITE_MATERIEL, auForfait: true }))
}

/** Marque, pour l'affichage, les items que les paramètres disent au forfait. */
export function marquerForfait(
  items: ItemMobilise[],
  parametres: ParametresContratPeinture | null
): ItemMobilise[] {
  const forfaits = new Set(
    (parametres?.equipements ?? []).filter((e) => e.auForfait).map((e) => cle(e.nom))
  )
  return items.map((i) => ({ ...i, auForfait: forfaits.has(cle(i.nom)) }))
}

/**
 * La cause de stand-by que le §10 nomme « incompressible » — « les temps qui
 * ne peuvent pas être optimisés » (pause repas, contraintes obligatoires du
 * contrat).
 *
 * Reconnue par son libellé, faute de mieux : ni le document ni le référentiel
 * ne portent de marqueur. C'est la cause la plus fréquente du classeur (168
 * lignes sur 345).
 */
export const CAUSE_INCOMPRESSIBLE = 'STBY INCOMPRESSIBLE'

export function estIncompressible(cause: string): boolean {
  return cle(cause) === cle(CAUSE_INCOMPRESSIBLE)
}

/**
 * Ventilation de stand-by proposée à l'ouverture d'un rapport : la valeur
 * d'heures incompressibles paramétrée pour ce champ (§10, « une valeur par
 * défaut doit être paramétrée pour chaque site »).
 *
 * **Rien n'est proposé si le champ n'a pas de valeur** — et c'est le cas par
 * défaut : le document demande cette valeur sans en donner aucune, et le
 * classeur n'en porte pas non plus (Q6 du recueil). Rien n'est proposé non
 * plus si la journée porte déjà une ventilation : une proposition n'écrase
 * jamais une saisie.
 */
export function standByParDefaut(
  parametres: ParametresContratPeinture | null,
  site: string,
  dejaSaisi: StandByCause[]
): StandByCause[] {
  if (dejaSaisi.length) return dejaSaisi
  const heures = parametres?.sites.find((s) => cle(s.site) === cle(site))?.heuresIncompressibles
  return nombre(heures) === null ? [] : [{ cause: CAUSE_INCOMPRESSIBLE, heures: heures as number }]
}
