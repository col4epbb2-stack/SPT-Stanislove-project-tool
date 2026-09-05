import { lireCsv, lireXlsx } from './xlsx'
import type { BudgetPeriode, RubriqueNiv1, RubriqueNiv2 } from '../types/navette'
import type { ProjectType } from '../types/project'
import { TYPE_LABELS } from '../types/project'

// Import de lignes navette depuis un classeur (04/09/2026, demande explicite
// « on fera l'import en masse via un fichier excel, on fera une preview avant,
// generer un modèle avec des bonnes colonnes »). Même patron que l'import des
// utilisateurs (20/08/2026, lib/importAgents.ts) : lecture tolérante à
// l'entrée (ordre des colonnes, casse, accents, avec ou sans le libellé
// exact) mais stricte à la sortie — chaque ligne est retenue ou rejetée avec
// son motif et son numéro de ligne Excel, jamais importée à moitié.
//
// Rien n'est écrit ici : ce module ne fait que lire et juger. C'est l'écran
// (ImportNavetteModal) qui montre le résultat puis, seulement sur un second
// geste, déclenche les créations une par une via NavetteContext.createLigne.

export interface LigneImportNavette {
  /** Numéro de ligne dans le fichier, en-tête comprise — celui qu'affiche Excel. */
  ligne: number
  libelle: string
  codeOTP: string
  type: ProjectType
  rubriqueNiv1: RubriqueNiv1
  rubriqueNiv2: RubriqueNiv2
  devise: string
  anneeBudget?: number
  champ?: string
  chargeAffaireId: string
  chargeAffaireNom: string
  workProgram: boolean
  BU: BudgetPeriode
}

export interface RejetImportNavette {
  ligne: number
  /** Ce que portait la ligne, pour la retrouver dans le fichier. */
  apercu: string
  motif: string
}

export interface ResultatLectureNavette {
  valides: LigneImportNavette[]
  rejets: RejetImportNavette[]
  /** En-têtes reconnues, dans l'ordre du fichier — affichées pour lever un doute. */
  colonnes: string[]
}

export interface AgentImportable {
  id: string
  name: string
  email: string
}

export interface DeviseImportable {
  code: string
}

/** Compare deux libellés sans tenir compte de la casse, des accents ni des espaces. */
function normaliser(valeur: unknown): string {
  return String(valeur ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/** Nombre saisi à la française (virgule décimale, espaces milliers) ou déjà numérique. */
function nombre(valeur: unknown): number {
  if (typeof valeur === 'number') return valeur
  const texte = String(valeur ?? '').trim().replace(/\s/g, '').replace(',', '.')
  const n = Number(texte)
  return Number.isFinite(n) ? n : 0
}

// Les en-têtes acceptées pour chaque champ — le fichier peut venir d'un
// export de l'application (colonnes exactes) ou d'une liste tapée à la main.
const ENTETES = {
  libelle: ['libelle', 'intitule', 'nom du projet', 'projet', 'designation'],
  codeOTP: ['code otp', 'codeotp', 'otp', 'code'],
  type: ['type', 'type de projet', 'type projet'],
  rubrique: ['rubrique', 'rubrique niv1', 'rubrique niveau 1', 'opex capex'],
  anneeBudget: ['annee budget', 'annee du budget', 'annee', 'exercice'],
  champ: ['champ', 'site'],
  devise: ['devise', 'monnaie'],
  chargeAffaire: ['charge d affaires', 'charge daffaires', 'charge affaires', 'charge de projet', 'agent'],
  workProgram: ['work program', 'wp', 'work program wp'],
  conso: ['conso', 'consommable', 'consommables'],
  serv: ['serv', 'service', 'services'],
  log: ['log', 'logistique'],
  pers: ['pers', 'personnel'],
  autres: ['autres', 'autre'],
} satisfies Record<string, string[]>

/** Type de projet écrit en clair (« DDM ») ou en code (« ddm »). Vide → 'autre'. */
function lireType(valeur: unknown): ProjectType | null {
  const texte = normaliser(valeur)
  if (!texte) return 'autre'
  for (const code of Object.keys(TYPE_LABELS) as ProjectType[]) {
    if (texte === normaliser(code) || texte === normaliser(TYPE_LABELS[code])) return code
  }
  return null
}

/** Rubrique OPEX/CAPEX, tolérante sur la casse. Vide → 'OPEX', comme la création manuelle. */
function lireRubrique(valeur: unknown): RubriqueNiv1 | null {
  const texte = normaliser(valeur)
  if (!texte) return 'OPEX'
  if (texte.includes('opex')) return 'OPEX'
  if (texte.includes('capex')) return 'CAPEX'
  return null
}

function lireWorkProgram(valeur: unknown): boolean {
  const texte = normaliser(valeur)
  return texte === 'oui' || texte === 'yes' || texte === 'true' || texte === '1' || texte === 'x'
}

/**
 * Juge une grille déjà lue (classeur ou CSV) contre les lignes existantes,
 * l'annuaire des chargés d'affaires et le référentiel des devises actives.
 *
 * `codesOTPExistants` sert à rejeter d'avance ce que la création échouerait à
 * écrire : `NavetteContext.createLigne` refuse un code OTP déjà pris (c'est
 * l'identifiant du document Firestore), et l'erreur arriverait sinon au
 * milieu de l'import, après plusieurs lignes déjà créées.
 */
export function analyserLignesNavette(
  grille: (string | number | null)[][],
  codesOTPExistants: string[],
  agents: AgentImportable[],
  devisesActives: DeviseImportable[],
  deviseParDefaut: string
): ResultatLectureNavette {
  const rejets: RejetImportNavette[] = []
  const valides: LigneImportNavette[] = []

  const premiere = grille.findIndex((l) => l.some((c) => String(c ?? '').trim() !== ''))
  if (premiere < 0) return { valides, rejets, colonnes: [] }

  const entetes = grille[premiere].map(normaliser)
  const indexDe = (champ: keyof typeof ENTETES) => entetes.findIndex((e) => e && ENTETES[champ].includes(e))

  const iLibelle = indexDe('libelle')
  const iCodeOTP = indexDe('codeOTP')
  const iType = indexDe('type')
  const iRubrique = indexDe('rubrique')
  const iAnnee = indexDe('anneeBudget')
  const iChamp = indexDe('champ')
  const iDevise = indexDe('devise')
  const iChargeAffaire = indexDe('chargeAffaire')
  const iWorkProgram = indexDe('workProgram')
  const iConso = indexDe('conso')
  const iServ = indexDe('serv')
  const iLog = indexDe('log')
  const iPers = indexDe('pers')
  const iAutres = indexDe('autres')

  const colonnes: string[] = []
  if (iLibelle >= 0) colonnes.push('Libellé')
  if (iCodeOTP >= 0) colonnes.push('Code OTP')
  if (iType >= 0) colonnes.push('Type')
  if (iRubrique >= 0) colonnes.push('Rubrique')
  if (iAnnee >= 0) colonnes.push('Année budget')
  if (iChamp >= 0) colonnes.push('Champ')
  if (iDevise >= 0) colonnes.push('Devise')
  if (iChargeAffaire >= 0) colonnes.push("Chargé d'affaires")
  if (iWorkProgram >= 0) colonnes.push('Work Program')
  if (iConso >= 0) colonnes.push('CONSO')
  if (iServ >= 0) colonnes.push('SERV')
  if (iLog >= 0) colonnes.push('LOG')
  if (iPers >= 0) colonnes.push('PERS')
  if (iAutres >= 0) colonnes.push('AUTRES')

  // Sans ces deux colonnes il n'y a pas de ligne à créer : le dire une fois
  // vaut mieux que rejeter chaque ligne pour la même raison.
  if (iLibelle < 0 || iCodeOTP < 0) {
    return {
      valides,
      rejets: [
        {
          ligne: premiere + 1,
          apercu: grille[premiere].map((c) => String(c ?? '')).join(' | '),
          motif: 'En-têtes « Libellé » et « Code OTP » introuvables sur la première ligne du fichier.',
        },
      ],
      colonnes,
    }
  }

  // Un même fichier peut porter deux fois le même code OTP : détecté ici,
  // sinon la seconde création échouerait après la première.
  const dejaVus = new Set(codesOTPExistants.map((c) => c.trim().toUpperCase()))

  for (let i = premiere + 1; i < grille.length; i++) {
    const ligneFichier = i + 1
    const cellules = grille[i] ?? []
    const cellule = (index: number) => (index >= 0 ? String(cellules[index] ?? '').trim() : '')
    const libelle = cellule(iLibelle)
    const codeOTP = cellule(iCodeOTP)

    if (!libelle && !codeOTP) continue // ligne vide : on l'ignore, ce n'est pas une erreur
    const apercu = [libelle, codeOTP].filter(Boolean).join(' — ') || cellules.map((c) => String(c ?? '')).join(' | ')

    if (!libelle) {
      rejets.push({ ligne: ligneFichier, apercu, motif: 'Libellé manquant.' })
      continue
    }
    if (!codeOTP) {
      rejets.push({ ligne: ligneFichier, apercu, motif: 'Code OTP manquant.' })
      continue
    }
    if (dejaVus.has(codeOTP.toUpperCase())) {
      rejets.push({
        ligne: ligneFichier,
        apercu,
        motif: `Code OTP déjà utilisé : « ${codeOTP} » (ligne navette existante ou ligne précédente du fichier).`,
      })
      continue
    }

    const typeBrut = cellule(iType)
    const type = lireType(typeBrut)
    if (type === null) {
      rejets.push({
        ligne: ligneFichier,
        apercu,
        motif: `Type de projet non reconnu : « ${typeBrut} ». Attendu : ${Object.values(TYPE_LABELS).join(', ')}.`,
      })
      continue
    }

    const rubriqueBrute = cellule(iRubrique)
    const rubriqueNiv1 = lireRubrique(rubriqueBrute)
    if (rubriqueNiv1 === null) {
      rejets.push({ ligne: ligneFichier, apercu, motif: `Rubrique non reconnue : « ${rubriqueBrute} ». Attendu : OPEX ou CAPEX.` })
      continue
    }

    const deviseBrute = cellule(iDevise).toUpperCase()
    const devise = deviseBrute || deviseParDefaut
    const deviseConnue = devisesActives.some((d) => d.code.toUpperCase() === devise)
    if (!deviseConnue) {
      rejets.push({ ligne: ligneFichier, apercu, motif: `Devise non reconnue ou inactive : « ${devise} ».` })
      continue
    }

    const chargeAffaireBrut = cellule(iChargeAffaire)
    if (!chargeAffaireBrut) {
      rejets.push({ ligne: ligneFichier, apercu, motif: "Chargé d'affaires manquant." })
      continue
    }
    const chargeAffaireNorm = normaliser(chargeAffaireBrut)
    const chargeAffaire = agents.find(
      (a) => normaliser(a.name) === chargeAffaireNorm || a.email.toLowerCase() === chargeAffaireBrut.toLowerCase()
    )
    if (!chargeAffaire) {
      rejets.push({ ligne: ligneFichier, apercu, motif: `Chargé d'affaires introuvable parmi les agents : « ${chargeAffaireBrut} ».` })
      continue
    }

    const anneeBrute = cellule(iAnnee)
    const anneeBudget = anneeBrute ? Number(anneeBrute) : undefined
    if (anneeBrute && (!Number.isFinite(anneeBudget) || (anneeBudget as number) < 2000 || (anneeBudget as number) > 2100)) {
      rejets.push({ ligne: ligneFichier, apercu, motif: `Année du budget invalide : « ${anneeBrute} ».` })
      continue
    }

    const BU: BudgetPeriode = {
      conso: nombre(cellule(iConso)),
      serv: nombre(cellule(iServ)),
      log: nombre(cellule(iLog)),
      pers: nombre(cellule(iPers)),
      autres: nombre(cellule(iAutres)),
    }
    const budgetTotal = BU.conso + BU.serv + BU.log + BU.pers + BU.autres
    if (budgetTotal <= 0) {
      rejets.push({
        ligne: ligneFichier,
        apercu,
        motif: 'Budget nul : au moins un des postes CONSO/SERV/LOG/PERS/AUTRES doit être renseigné.',
      })
      continue
    }

    dejaVus.add(codeOTP.toUpperCase())
    valides.push({
      ligne: ligneFichier,
      libelle,
      codeOTP,
      type,
      rubriqueNiv1,
      // Le « Programme » (rubrique de niveau 2) n'est plus demandé depuis le
      // 18/08/2026, même à la création manuelle : une ligne importée part sur
      // GES comme une ligne saisie à la main.
      rubriqueNiv2: 'GES',
      devise,
      anneeBudget,
      champ: cellule(iChamp) || undefined,
      chargeAffaireId: chargeAffaire.id,
      chargeAffaireNom: chargeAffaire.name,
      workProgram: lireWorkProgram(cellule(iWorkProgram)),
      BU,
    })
  }

  return { valides, rejets, colonnes }
}

/** Lit un fichier déposé — classeur .xlsx ou texte CSV — puis l'analyse. */
export async function lireFichierNavette(
  fichier: File,
  codesOTPExistants: string[],
  agents: AgentImportable[],
  devisesActives: DeviseImportable[],
  deviseParDefaut: string
): Promise<ResultatLectureNavette> {
  const nom = fichier.name.toLowerCase()
  if (nom.endsWith('.xlsx') || nom.endsWith('.xlsm')) {
    return analyserLignesNavette(
      await lireXlsx(await fichier.arrayBuffer()),
      codesOTPExistants,
      agents,
      devisesActives,
      deviseParDefaut
    )
  }
  if (nom.endsWith('.csv') || nom.endsWith('.txt')) {
    return analyserLignesNavette(lireCsv(await fichier.text()), codesOTPExistants, agents, devisesActives, deviseParDefaut)
  }
  // Le .xls d'avant 2007 est un format binaire propriétaire, sans rapport
  // avec le .xlsx : le lire demanderait une bibliothèque entière.
  if (nom.endsWith('.xls')) {
    throw new Error(
      "Ce fichier est au format Excel 97-2003 (.xls). Ouvrez-le dans Excel puis « Enregistrer sous » au format .xlsx (ou .csv) avant de l'importer."
    )
  }
  throw new Error('Format non reconnu. Déposez un classeur .xlsx ou un fichier .csv.')
}
