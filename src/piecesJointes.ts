import { deleteDoc, doc, getDoc, setDoc } from 'firebase/firestore'
import { db } from './firebase'
import { COLLECTIONS } from './firestoreCollections'
import type { PieceJointe, TypePieceJointe } from '../types/pieceJointe'

// Pièces jointes stockées dans Firestore, en base 64 (14/08/2026).
//
// Firebase Storage exige le plan payant Blaze sur ce projet, qui n'est pas
// souscrit — les uploads d'hypothèses, de cahier des charges et de photos CRJ
// étaient donc écrits mais inertes depuis le 27/07/2026. Ils passent ici par
// Firestore, ce que le plan gratuit couvre.
//
// Trois contraintes commandent tout ce fichier :
//
// 1. **Un document Firestore est plafonné à 1 Mio.** Le base 64 gonfle le
//    binaire d'environ 33 % (3 octets → 4 caractères), et l'en-tête
//    `data:image/jpeg;base64,` s'y ajoute. Le budget utile est donc de l'ordre
//    de 650 Ko de binaire, et non des 10 Mo que Storage acceptait.
// 2. **Le contenu vit à part des métadonnées.** Les pièces jointes des
//    hypothèses et du cahier des charges sont imbriquées dans le document
//    `projets/{id}` : y coller du base 64 le ferait exploser en quelques
//    fichiers. Et lire la liste des photos d'un chantier ne doit pas
//    télécharger les photos elles-mêmes. D'où une collection dédiée, lue
//    seulement quand une image est réellement affichée.
// 3. **Une image est recompressée avant d'être encodée.** Une photo de
//    téléphone fait 3 à 8 Mo : sans réduction, rien ne passerait. Les fichiers
//    non compressibles (PDF, bureautique) sont refusés au-delà de la limite,
//    avec un message qui le dit — c'est la contrepartie assumée de l'abandon
//    de Storage.

/** Plafond Firestore (1 Mio), moins la marge des autres champs du document. */
export const TAILLE_MAX_DOCUMENT = 900_000

/** Cible visée à la compression : laisse de l'air sous le plafond. */
export const CIBLE_COMPRESSION = 600_000

/**
 * Au-delà, un fichier non compressible est refusé — exprimé en octets du
 * fichier d'origine, alors que la limite ci-dessus porte sur la chaîne
 * encodée. Le base 64 produit 4 caractères pour 3 octets : 650 Ko de binaire
 * donnent ~867 Ko encodés, ce qui passe. Prendre 700 Ko ici, comme c'était le
 * cas à la première écriture de ce module, annonçait à l'utilisateur une
 * limite que le contrôle final refusait ensuite.
 */
export const TAILLE_MAX_NON_COMPRESSIBLE = 650_000

const EXTENSIONS_DOCUMENT = ['.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.txt']

// Paliers de compression, du plus fidèle au plus économe. On s'arrête au
// premier qui passe sous la cible : inutile de dégrader davantage une image
// déjà légère.
const PALIERS = [
  { dimensionMax: 1600, qualite: 0.75 },
  { dimensionMax: 1600, qualite: 0.6 },
  { dimensionMax: 1200, qualite: 0.6 },
  { dimensionMax: 1200, qualite: 0.45 },
  { dimensionMax: 900, qualite: 0.45 },
  { dimensionMax: 700, qualite: 0.4 },
]

function typePieceJointe(file: File, accepteDocuments: boolean): TypePieceJointe | null {
  if (file.type.startsWith('image/')) return 'image'
  if (file.type === 'application/pdf') return 'pdf'
  if (accepteDocuments && EXTENSIONS_DOCUMENT.some((ext) => file.name.toLowerCase().endsWith(ext))) return 'document'
  return null
}

function lireEnDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, rejeter) => {
    const lecteur = new FileReader()
    lecteur.onload = () => resolve(String(lecteur.result))
    lecteur.onerror = () => rejeter(new Error('Lecture du fichier impossible.'))
    lecteur.readAsDataURL(file)
  })
}

function chargerImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, rejeter) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => rejeter(new Error("Ce fichier n'est pas une image lisible."))
    image.src = dataUrl
  })
}

function redimensionner(image: HTMLImageElement, dimensionMax: number, qualite: number): string {
  const facteur = Math.min(1, dimensionMax / Math.max(image.width, image.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(image.width * facteur))
  canvas.height = Math.max(1, Math.round(image.height * facteur))
  const contexte = canvas.getContext('2d')
  if (!contexte) throw new Error('Compression impossible dans ce navigateur.')
  // Fond blanc : un PNG transparent converti en JPEG rendrait un fond noir.
  contexte.fillStyle = '#ffffff'
  contexte.fillRect(0, 0, canvas.width, canvas.height)
  contexte.drawImage(image, 0, 0, canvas.width, canvas.height)
  return canvas.toDataURL('image/jpeg', qualite)
}

/**
 * Réduit une image jusqu'à passer sous la cible, en descendant les paliers.
 * Renvoie le premier résultat acceptable — ou le plus petit obtenu, si même
 * le dernier palier ne suffit pas (le contrôle de taille final tranchera).
 */
export async function compresserImage(file: File): Promise<string> {
  const origine = await lireEnDataUrl(file)
  // Une image déjà sous la cible n'a rien à gagner à être ré-encodée : on
  // garde l'original, format et qualité compris.
  if (origine.length <= CIBLE_COMPRESSION) return origine

  const image = await chargerImage(origine)
  let meilleure = origine
  for (const palier of PALIERS) {
    const candidate = redimensionner(image, palier.dimensionMax, palier.qualite)
    if (candidate.length < meilleure.length) meilleure = candidate
    if (candidate.length <= CIBLE_COMPRESSION) return candidate
  }
  return meilleure
}

function formatOctets(n: number): string {
  return n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)} Mo` : `${Math.round(n / 1000)} Ko`
}

/**
 * Valide, compresse si c'est une image, écrit le contenu dans sa collection
 * dédiée et renvoie les seules métadonnées — c'est ce que l'appelant range
 * dans sa propre donnée (fiche projet, ligne CRJ…).
 */
export async function enregistrerPieceJointe(
  file: File,
  ajouteParId: string,
  accepteDocuments: boolean
): Promise<PieceJointe> {
  const type = typePieceJointe(file, accepteDocuments)
  if (!type) {
    throw new Error(
      accepteDocuments
        ? 'Format non supporté — images, PDF ou documents bureautiques uniquement.'
        : 'Format non supporté — seules les images et les PDF sont acceptés.'
    )
  }

  // Un fichier non compressible se refuse sur sa taille d'origine, avant
  // d'être lu : inutile de charger 5 Mo en mémoire pour les rejeter ensuite.
  if (type !== 'image' && file.size > TAILLE_MAX_NON_COMPRESSIBLE) {
    throw new Error(
      `Fichier trop volumineux (${formatOctets(file.size)}, maximum ${formatOctets(TAILLE_MAX_NON_COMPRESSIBLE)}). ` +
        'Les documents ne peuvent pas être compressés : joignez une version allégée.'
    )
  }

  const contenu = type === 'image' ? await compresserImage(file) : await lireEnDataUrl(file)

  // Garde-fou final : c'est la taille ENCODÉE qui compte pour Firestore.
  if (contenu.length > TAILLE_MAX_DOCUMENT) {
    throw new Error(
      type === 'image'
        ? `Image trop lourde même après compression (${formatOctets(contenu.length)}). Réduisez-la avant de la joindre.`
        : `Fichier trop volumineux une fois encodé (${formatOctets(contenu.length)}).`
    )
  }

  const id = crypto.randomUUID()
  await setDoc(doc(db, COLLECTIONS.piecesJointesContenu, id), {
    contenu,
    contentType: type === 'image' ? 'image/jpeg' : file.type || 'application/octet-stream',
    tailleOctets: contenu.length,
    ajouteLe: new Date().toISOString(),
  })

  return {
    id,
    nom: file.name,
    type,
    contenuId: id,
    // Taille réellement stockée, et non celle du fichier d'origine : c'est
    // elle qui compte pour le plafond Firestore.
    tailleOctets: contenu.length,
    ajouteParId,
    ajouteLe: new Date().toISOString(),
  }
}

export function enregistrerPieceJointeHypothese(file: File, ajouteParId: string): Promise<PieceJointe> {
  return enregistrerPieceJointe(file, ajouteParId, false)
}

export function enregistrerDocumentCahierDesCharges(file: File, ajouteParId: string): Promise<PieceJointe> {
  return enregistrerPieceJointe(file, ajouteParId, true)
}

export function enregistrerImageCrj(file: File, ajouteParId: string): Promise<PieceJointe> {
  return enregistrerPieceJointe(file, ajouteParId, false)
}

// Cache mémoire : une vignette réaffichée (changement d'onglet, filtre,
// pagination) ne doit pas relire son document. Les contenus sont immuables,
// le cache n'a donc pas à être invalidé.
const cache = new Map<string, string | null>()

/** Contenu d'une pièce jointe, en data URL — `null` s'il est introuvable. */
export async function chargerContenuPieceJointe(contenuId: string): Promise<string | null> {
  const enCache = cache.get(contenuId)
  if (enCache !== undefined) return enCache
  const snap = await getDoc(doc(db, COLLECTIONS.piecesJointesContenu, contenuId))
  const contenu = snap.exists() ? ((snap.data() as { contenu?: string }).contenu ?? null) : null
  cache.set(contenuId, contenu)
  return contenu
}

export async function supprimerPieceJointe(piece: Pick<PieceJointe, 'contenuId'>): Promise<void> {
  if (!piece.contenuId) return
  await deleteDoc(doc(db, COLLECTIONS.piecesJointesContenu, piece.contenuId))
  cache.delete(piece.contenuId)
}
