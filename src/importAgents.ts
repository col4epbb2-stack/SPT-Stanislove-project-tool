import { lireCsv, lireXlsx } from './xlsx'
import { ROLE_LABELS, PROFIL_NAVETTE_LABELS } from '../types/user'
import type { ProfilValidationNavette, UserRole } from '../types/user'

// Import d'utilisateurs depuis un classeur (20/08/2026, demande explicite
// « rajouter l'import en xls »).
//
// Le fichier vient d'un humain : on ne peut compter ni sur l'ordre des
// colonnes, ni sur la casse, ni sur les accents des en-têtes, ni sur le fait
// que le rôle soit écrit avec le libellé exact de l'application. La lecture
// est donc tolérante à l'entrée, mais **stricte à la sortie** : chaque ligne
// est soit valide, soit rejetée avec son motif — jamais importée à moitié.
//
// Rien n'est écrit à ce stade : ce module ne fait que lire et juger. C'est
// l'écran qui montre le résultat puis, seulement si on le lui demande,
// déclenche les créations. Un import qui écrirait en découvrant les lignes
// laisserait la moitié d'un fichier en base en cas d'erreur au milieu.

export interface LigneImportAgent {
  /** Numéro de ligne dans le fichier, en-tête comprise — celui qu'affiche Excel. */
  ligne: number
  nom: string
  email: string
  fonction: string
  role: UserRole
  profilNavette?: ProfilValidationNavette
}

export interface RejetImportAgent {
  ligne: number
  /** Ce que portait la ligne, pour que l'utilisateur la retrouve dans son fichier. */
  apercu: string
  motif: string
}

export interface ResultatLectureAgents {
  valides: LigneImportAgent[]
  rejets: RejetImportAgent[]
  /** En-têtes reconnues, dans l'ordre du fichier — affichées pour lever un doute. */
  colonnes: string[]
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

// Les en-têtes acceptées pour chaque champ. Plusieurs formulations parce que
// le fichier peut aussi bien venir d'un export de l'application que d'une
// liste tapée à la main.
const ENTETES: Record<'nom' | 'email' | 'fonction' | 'role' | 'profilNavette', string[]> = {
  nom: ['nom', 'nom complet', 'prenom nom', 'utilisateur', 'agent', 'name'],
  email: ['email', 'e mail', 'mail', 'adresse email', 'courriel'],
  fonction: ['fonction', 'poste', 'intitule', 'titre', 'job'],
  role: ['role', 'profil', 'droits', 'role applicatif'],
  profilNavette: ['visa navette', 'visa des revisions navette', 'visa', 'profil navette', 'validation navette'],
}

/** Rôle écrit en clair (« Contrôleur de gestion ») ou en code (« controleur »). */
function lireRole(valeur: unknown): UserRole | null {
  const texte = normaliser(valeur)
  if (!texte) return null
  for (const code of Object.keys(ROLE_LABELS) as UserRole[]) {
    if (texte === normaliser(code) || texte === normaliser(ROLE_LABELS[code])) return code
  }
  // Tolérances courantes : « administrateur » abrégé, « contrôleur » seul.
  if (texte.startsWith('admin')) return 'admin'
  if (texte.startsWith('control')) return 'controleur'
  if (texte.startsWith('agent') || texte.startsWith('charge')) return 'agent'
  return null
}

/**
 * Trois réponses possibles, et les distinguer est nécessaire : un visa
 * reconnu, un **refus explicite** (« Aucun » — le libellé que l'application
 * affiche elle-même dans son menu, donc celui qu'on retrouve dans un fichier
 * exporté puis corrigé), et une valeur incomprise, qui doit faire rejeter la
 * ligne. Confondre les deux dernières rejetait « Aucun ».
 */
function lireProfilNavette(valeur: unknown): ProfilValidationNavette | null | undefined {
  const texte = normaliser(valeur)
  if (!texte || texte === 'aucun' || texte === 'non' || texte === 'sans') return null
  for (const code of Object.keys(PROFIL_NAVETTE_LABELS) as ProfilValidationNavette[]) {
    if (texte === normaliser(code) || texte === normaliser(PROFIL_NAVETTE_LABELS[code])) return code
  }
  if (texte.includes('chef')) return 'chef_departement'
  if (texte.includes('technique') || texte.includes('dt')) return 'directeur_technique'
  return undefined
}

/** Contrôle volontairement simple : c'est Firebase Auth qui tranchera. */
function emailPlausible(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)
}

/**
 * Juge une grille déjà lue (classeur ou CSV) contre l'annuaire existant.
 *
 * `emailsExistants` sert à rejeter d'avance ce que la création échouerait à
 * écrire : un compte Firebase Auth existe déjà pour cette adresse, et
 * l'erreur arriverait sinon au milieu de l'import, après plusieurs comptes
 * créés.
 */
export function analyserLignesAgents(
  grille: (string | number | null)[][],
  emailsExistants: string[] = []
): ResultatLectureAgents {
  const rejets: RejetImportAgent[] = []
  const valides: LigneImportAgent[] = []

  const premiere = grille.findIndex((l) => l.some((c) => String(c ?? '').trim() !== ''))
  if (premiere < 0) return { valides, rejets, colonnes: [] }

  const entetes = grille[premiere].map(normaliser)
  const indexDe = (champ: keyof typeof ENTETES) =>
    entetes.findIndex((e) => e && ENTETES[champ].includes(e))

  const iNom = indexDe('nom')
  const iEmail = indexDe('email')
  const iFonction = indexDe('fonction')
  const iRole = indexDe('role')
  const iProfil = indexDe('profilNavette')

  const colonnes: string[] = []
  if (iNom >= 0) colonnes.push('Nom')
  if (iEmail >= 0) colonnes.push('Email')
  if (iFonction >= 0) colonnes.push('Fonction')
  if (iRole >= 0) colonnes.push('Rôle')
  if (iProfil >= 0) colonnes.push('Visa navette')

  // Sans ces deux colonnes il n'y a pas d'utilisateur à créer : le dire une
  // fois vaut mieux que rejeter chaque ligne pour la même raison.
  if (iNom < 0 || iEmail < 0) {
    return {
      valides,
      rejets: [
        {
          ligne: premiere + 1,
          apercu: grille[premiere].map((c) => String(c ?? '')).join(' | '),
          motif:
            'En-têtes « Nom » et « Email » introuvables sur la première ligne du fichier. Les autres colonnes (Fonction, Rôle, Visa navette) sont facultatives.',
        },
      ],
      colonnes,
    }
  }

  // Un même fichier peut porter deux fois la même adresse : le doublon est
  // détecté ici, sinon la seconde création échouerait après la première.
  const dejaVus = new Set(emailsExistants.map((e) => e.trim().toLowerCase()))

  for (let i = premiere + 1; i < grille.length; i++) {
    const ligneFichier = i + 1
    const cellules = grille[i] ?? []
    const cellule = (index: number) => (index >= 0 ? String(cellules[index] ?? '').trim() : '')
    const nom = cellule(iNom)
    const email = cellule(iEmail).toLowerCase()

    if (!nom && !email) continue // ligne vide : on l'ignore, ce n'est pas une erreur
    const apercu = [nom, email].filter(Boolean).join(' — ') || cellules.map((c) => String(c ?? '')).join(' | ')

    if (!nom) {
      rejets.push({ ligne: ligneFichier, apercu, motif: 'Nom manquant.' })
      continue
    }
    if (!email) {
      rejets.push({ ligne: ligneFichier, apercu, motif: 'Email manquant.' })
      continue
    }
    if (!emailPlausible(email)) {
      rejets.push({ ligne: ligneFichier, apercu, motif: `Adresse email invalide : « ${email} ».` })
      continue
    }
    if (dejaVus.has(email)) {
      rejets.push({ ligne: ligneFichier, apercu, motif: 'Cette adresse est déjà utilisée (annuaire ou ligne précédente du fichier).' })
      continue
    }

    const roleBrut = cellule(iRole)
    const role = lireRole(roleBrut)
    if (roleBrut && !role) {
      rejets.push({ ligne: ligneFichier, apercu, motif: `Rôle non reconnu : « ${roleBrut} ». Attendu : Administrateur, Agent ou Contrôleur de gestion.` })
      continue
    }

    const profilBrut = cellule(iProfil)
    const profil = lireProfilNavette(profilBrut)
    if (profil === undefined) {
      rejets.push({ ligne: ligneFichier, apercu, motif: `Visa navette non reconnu : « ${profilBrut} ». Attendu : Chef de département, Directeur technique, ou vide.` })
      continue
    }

    dejaVus.add(email)
    valides.push({
      ligne: ligneFichier,
      nom,
      email,
      fonction: cellule(iFonction),
      // Rôle par défaut : agent, le moins doté de l'application. Un fichier
      // muet ne doit pas créer des administrateurs.
      role: role ?? 'agent',
      ...(profil ? { profilNavette: profil } : {}),
    })
  }

  return { valides, rejets, colonnes }
}

/** Lit un fichier déposé — classeur .xlsx ou texte CSV — puis l'analyse. */
export async function lireFichierAgents(fichier: File, emailsExistants: string[] = []): Promise<ResultatLectureAgents> {
  const nom = fichier.name.toLowerCase()
  if (nom.endsWith('.xlsx') || nom.endsWith('.xlsm')) {
    return analyserLignesAgents(await lireXlsx(await fichier.arrayBuffer()), emailsExistants)
  }
  if (nom.endsWith('.csv') || nom.endsWith('.txt')) {
    return analyserLignesAgents(lireCsv(await fichier.text()), emailsExistants)
  }
  // Le .xls d'avant 2007 est un format binaire propriétaire, sans rapport
  // avec le .xlsx : le lire demanderait une bibliothèque entière. On le dit
  // plutôt que d'échouer sur un message obscur.
  if (nom.endsWith('.xls')) {
    throw new Error(
      "Ce fichier est au format Excel 97-2003 (.xls). Ouvrez-le dans Excel puis « Enregistrer sous » au format .xlsx (ou .csv) avant de l'importer."
    )
  }
  throw new Error('Format non reconnu. Déposez un classeur .xlsx ou un fichier .csv.')
}
