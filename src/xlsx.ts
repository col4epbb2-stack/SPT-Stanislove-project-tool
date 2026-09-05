// Lecture et écriture de vrais fichiers .xlsx, sans dépendance (20/08/2026,
// demande explicite « rajouter l'import en xls et export pdf et xls »).
//
// Jusqu'ici l'application exportait du CSV « français » (séparateur `;` + BOM
// UTF-8) présenté comme « CSV (Excel) » : le choix de ne pas produire de vrai
// classeur était assumé et documenté (lib/exportCsv.ts) — écrire un .xlsx
// aurait demandé une dépendance de plus pour des tableaux plats. **Importer**
// change la donne : un utilisateur qui prépare sa liste dans Excel enregistre
// un .xlsx, et lui demander de le réenregistrer en CSV serait lui faire faire
// le travail à la place de l'application.
//
// Un .xlsx est un ZIP de fichiers XML. Les deux morceaux qui manquaient à la
// plateforme sont désormais standard :
//   - `DecompressionStream('deflate-raw')` décompresse les entrées du ZIP —
//     c'est ce que fait un lecteur de .xlsx, et le navigateur sait le faire ;
//   - l'écriture se passe même de compression : une entrée ZIP « stored »
//     (méthode 0) est parfaitement valide, il suffit d'en donner le CRC32.
//
// Le XML est lu et écrit par expressions régulières et non par DOMParser :
// ce module doit tourner à l'identique dans le navigateur et sous Vitest
// (environnement Node, sans DOM), et le XML d'un classeur est généré par une
// machine — sa forme est régulière.
//
// **Limite assumée** : une cellule de date revient sous sa forme interne
// (numéro de série Excel), faute de lire les styles et formats de nombre du
// classeur. Les imports de l'application portent du texte et des nombres ;
// le jour où une date sera attendue, c'est ici qu'il faudra la traiter,
// plutôt que dans l'écran qui appelle.

export interface FeuilleXlsx {
  nom: string
  /** Première ligne = en-têtes, comme dans les fichiers que les gens échangent. */
  lignes: (string | number | null)[][]
}

// --- ZIP ---------------------------------------------------------------------

const TABLE_CRC = (() => {
  const table = new Uint32Array(256)
  for (let i = 0; i < 256; i++) {
    let c = i
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[i] = c >>> 0
  }
  return table
})()

function crc32(donnees: Uint8Array): number {
  let c = 0xffffffff
  for (let i = 0; i < donnees.length; i++) c = TABLE_CRC[(c ^ donnees[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

interface EntreeZip {
  nom: string
  donnees: Uint8Array
}

function concat(morceaux: Uint8Array[]): Uint8Array {
  const total = morceaux.reduce((n, m) => n + m.length, 0)
  const sortie = new Uint8Array(total)
  let position = 0
  for (const m of morceaux) {
    sortie.set(m, position)
    position += m.length
  }
  return sortie
}

/**
 * ZIP à entrées non compressées (« stored »).
 *
 * Compresser n'apporterait qu'un gain de taille sur des fichiers qui font
 * quelques kilo-octets, au prix d'un flux asynchrone dans une fonction que
 * les appelants utilisent au clic. Un lecteur de ZIP — Excel compris —
 * n'attend pas de compression.
 */
function ecrireZip(entrees: EntreeZip[]): Uint8Array {
  const encodeur = new TextEncoder()
  const morceaux: Uint8Array[] = []
  const central: Uint8Array[] = []
  let decalage = 0

  for (const entree of entrees) {
    const nom = encodeur.encode(entree.nom)
    const crc = crc32(entree.donnees)
    const taille = entree.donnees.length

    const enTete = new DataView(new ArrayBuffer(30))
    enTete.setUint32(0, 0x04034b50, true) // signature d'en-tête local
    enTete.setUint16(4, 20, true) // version minimale
    enTete.setUint16(6, 0, true) // pas de drapeau
    enTete.setUint16(8, 0, true) // méthode 0 = stored
    enTete.setUint16(10, 0, true) // heure (non significative)
    enTete.setUint16(12, 0x21, true) // date : 1980-01-01, la plus ancienne représentable
    enTete.setUint32(14, crc, true)
    enTete.setUint32(18, taille, true)
    enTete.setUint32(22, taille, true)
    enTete.setUint16(26, nom.length, true)
    enTete.setUint16(28, 0, true)
    morceaux.push(new Uint8Array(enTete.buffer), nom, entree.donnees)

    const fiche = new DataView(new ArrayBuffer(46))
    fiche.setUint32(0, 0x02014b50, true) // signature de fiche centrale
    fiche.setUint16(4, 20, true)
    fiche.setUint16(6, 20, true)
    fiche.setUint16(8, 0, true)
    fiche.setUint16(10, 0, true)
    fiche.setUint16(12, 0, true)
    fiche.setUint16(14, 0x21, true)
    fiche.setUint32(16, crc, true)
    fiche.setUint32(20, taille, true)
    fiche.setUint32(24, taille, true)
    fiche.setUint16(28, nom.length, true)
    fiche.setUint32(42, decalage, true)
    central.push(new Uint8Array(fiche.buffer), nom)

    decalage += 30 + nom.length + taille
  }

  const tailleCentral = central.reduce((n, m) => n + m.length, 0)
  const fin = new DataView(new ArrayBuffer(22))
  fin.setUint32(0, 0x06054b50, true)
  fin.setUint16(8, entrees.length, true)
  fin.setUint16(10, entrees.length, true)
  fin.setUint32(12, tailleCentral, true)
  fin.setUint32(16, decalage, true)

  return concat([...morceaux, ...central, new Uint8Array(fin.buffer)])
}

async function inflater(donnees: Uint8Array): Promise<Uint8Array> {
  const flux = new Blob([donnees as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate-raw'))
  return new Uint8Array(await new Response(flux).arrayBuffer())
}

/**
 * Lit un ZIP par sa table centrale (et non en suivant les en-têtes locaux,
 * dont les tailles peuvent être reportées après les données quand le
 * producteur a écrit en flux — cas courant des classeurs générés par un
 * serveur).
 */
async function lireZip(octets: Uint8Array): Promise<Map<string, Uint8Array>> {
  const vue = new DataView(octets.buffer, octets.byteOffset, octets.byteLength)
  let finCentral = -1
  // La fin de répertoire central est en queue de fichier, précédée au plus
  // d'un commentaire de 64 Ko.
  for (let i = octets.length - 22; i >= Math.max(0, octets.length - 22 - 65535); i--) {
    if (vue.getUint32(i, true) === 0x06054b50) {
      finCentral = i
      break
    }
  }
  if (finCentral < 0) throw new Error("Ce fichier n'est pas un classeur Excel (.xlsx) lisible.")

  const nombre = vue.getUint16(finCentral + 10, true)
  let position = vue.getUint32(finCentral + 16, true)
  const decodeur = new TextDecoder()
  const fichiers = new Map<string, Uint8Array>()

  for (let i = 0; i < nombre; i++) {
    if (vue.getUint32(position, true) !== 0x02014b50) break
    const methode = vue.getUint16(position + 10, true)
    const tailleCompressee = vue.getUint32(position + 20, true)
    const longueurNom = vue.getUint16(position + 28, true)
    const longueurExtra = vue.getUint16(position + 30, true)
    const longueurCommentaire = vue.getUint16(position + 32, true)
    const debutLocal = vue.getUint32(position + 42, true)
    const nom = decodeur.decode(octets.subarray(position + 46, position + 46 + longueurNom))

    // L'en-tête local ne redonne que ses propres longueurs de nom et d'extra,
    // qui peuvent différer de celles de la fiche centrale.
    const nomLocal = vue.getUint16(debutLocal + 26, true)
    const extraLocal = vue.getUint16(debutLocal + 28, true)
    const debutDonnees = debutLocal + 30 + nomLocal + extraLocal
    const brut = octets.subarray(debutDonnees, debutDonnees + tailleCompressee)
    fichiers.set(nom, methode === 0 ? brut : await inflater(brut))

    position += 46 + longueurNom + longueurExtra + longueurCommentaire
  }
  return fichiers
}

// --- XML ---------------------------------------------------------------------

function echapper(texte: string): string {
  return texte
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    // Excel refuse d'ouvrir un classeur qui contient un caractère de contrôle
    // (la tabulation et les retours à la ligne, eux, sont légitimes). C'est
    // précisément ce que la règle no-control-regex interdit d'écrire, et
    // exactement ce qu'il faut faire ici.
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
}

function desechapper(texte: string): string {
  return texte
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/g, '&')
}

/** « A1 », « BC12 » → index de colonne 0-based. */
export function colonneDepuisReference(reference: string): number {
  const lettres = /^([A-Z]+)/.exec(reference.toUpperCase())?.[1] ?? ''
  let index = 0
  for (const lettre of lettres) index = index * 26 + (lettre.charCodeAt(0) - 64)
  return index - 1
}

/** 0 → « A », 26 → « AA ». */
export function referenceColonne(index: number): string {
  let reste = index + 1
  let nom = ''
  while (reste > 0) {
    const modulo = (reste - 1) % 26
    nom = String.fromCharCode(65 + modulo) + nom
    reste = Math.floor((reste - modulo) / 26)
  }
  return nom
}

// --- Écriture ----------------------------------------------------------------

function celluleXml(valeur: string | number | null, reference: string): string {
  if (valeur == null || valeur === '') return ''
  if (typeof valeur === 'number' && Number.isFinite(valeur)) {
    return `<c r="${reference}"><v>${valeur}</v></c>`
  }
  // Chaîne « en ligne » plutôt que table de chaînes partagées : une table
  // n'économise que sur les répétitions, et coûte un fichier et un niveau
  // d'indirection de plus à écrire comme à relire.
  return `<c r="${reference}" t="inlineStr"><is><t xml:space="preserve">${echapper(String(valeur))}</t></is></c>`
}

function feuilleXml(feuille: FeuilleXlsx): string {
  const lignes = feuille.lignes
    .map((ligne, i) => {
      const cellules = ligne.map((valeur, j) => celluleXml(valeur, `${referenceColonne(j)}${i + 1}`)).join('')
      return `<row r="${i + 1}">${cellules}</row>`
    })
    .join('')
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${lignes}</sheetData></worksheet>`
}

/** Excel refuse ces caractères dans un nom d'onglet, et le limite à 31 signes. */
function nomFeuilleValide(nom: string, index: number): string {
  const propre = nom.replace(/[\\/?*[\]:]/g, ' ').trim().slice(0, 31)
  return propre || `Feuille${index + 1}`
}

/** Construit le classeur en mémoire. Séparé du téléchargement pour être testable. */
export function construireXlsx(feuilles: FeuilleXlsx[]): Uint8Array {
  const encodeur = new TextEncoder()
  const noms = feuilles.map((f, i) => nomFeuilleValide(f.nom, i))

  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${feuilles
    .map(
      (_, i) =>
        `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`
    )
    .join('')}</Types>`

  const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`

  const workbook = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${noms
    .map((nom, i) => `<sheet name="${echapper(nom)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`)
    .join('')}</sheets></workbook>`

  const workbookRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${feuilles
    .map(
      (_, i) =>
        `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`
    )
    .join('')}</Relationships>`

  return ecrireZip([
    { nom: '[Content_Types].xml', donnees: encodeur.encode(contentTypes) },
    { nom: '_rels/.rels', donnees: encodeur.encode(rels) },
    { nom: 'xl/workbook.xml', donnees: encodeur.encode(workbook) },
    { nom: 'xl/_rels/workbook.xml.rels', donnees: encodeur.encode(workbookRels) },
    ...feuilles.map((feuille, i) => ({
      nom: `xl/worksheets/sheet${i + 1}.xml`,
      donnees: encodeur.encode(feuilleXml(feuille)),
    })),
  ])
}

export function telechargerXlsx(feuilles: FeuilleXlsx[], nomFichier: string): void {
  const octets = construireXlsx(feuilles)
  const blob = new Blob([octets as BlobPart], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  const url = URL.createObjectURL(blob)
  const lien = document.createElement('a')
  lien.href = url
  lien.download = nomFichier.endsWith('.xlsx') ? nomFichier : `${nomFichier}.xlsx`
  lien.click()
  URL.revokeObjectURL(url)
}

// --- Lecture -----------------------------------------------------------------

function chainesPartagees(xml: string): string[] {
  const chaines: string[] = []
  for (const [, contenu] of xml.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)) {
    // Une chaîne mise en forme est découpée en segments <r><t>…</t></r> :
    // les concaténer redonne le texte que l'utilisateur voit dans Excel.
    const morceaux = [...contenu.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((m) => desechapper(m[1]))
    chaines.push(morceaux.join(''))
  }
  return chaines
}

function valeurCellule(cellule: string, type: string | undefined, chaines: string[]): string | number | null {
  if (type === 'inlineStr') {
    const morceaux = [...cellule.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((m) => desechapper(m[1]))
    return morceaux.length ? morceaux.join('') : null
  }
  const brut = /<v\b[^>]*>([\s\S]*?)<\/v>/.exec(cellule)?.[1]
  if (brut == null) return null
  if (type === 's') return chaines[Number(brut)] ?? null
  // `str` = résultat de formule, `b` = booléen ; sinon c'est un nombre.
  if (type === 'str') return desechapper(brut)
  if (type === 'b') return brut === '1' ? 'VRAI' : 'FAUX'
  const nombre = Number(brut)
  return Number.isFinite(nombre) ? nombre : desechapper(brut)
}

/**
 * Lit la première feuille d'un classeur et rend sa grille.
 *
 * Les cellules vides du classeur ne produisent pas de balise `<c>` : on se
 * repère donc sur la référence (« C4 ») de chaque cellule et non sur leur
 * ordre, sinon une colonne laissée vide décalerait toute la ligne.
 */
export async function lireXlsx(fichier: ArrayBuffer): Promise<(string | number | null)[][]> {
  const fichiers = await lireZip(new Uint8Array(fichier))
  const decodeur = new TextDecoder()
  const texte = (nom: string) => {
    const contenu = fichiers.get(nom)
    return contenu ? decodeur.decode(contenu) : ''
  }

  // La première feuille du classeur est celle que l'utilisateur voit en
  // l'ouvrant ; son fichier n'est pas nécessairement `sheet1.xml`.
  const workbook = texte('xl/workbook.xml')
  const premierId = /<sheet\b[^>]*r:id="([^"]+)"/.exec(workbook)?.[1]
  const relations = texte('xl/_rels/workbook.xml.rels')
  const cible = premierId
    ? new RegExp(`<Relationship[^>]*Id="${premierId}"[^>]*Target="([^"]+)"`).exec(relations)?.[1]
    : undefined
  const chemin = cible
    ? `xl/${cible.replace(/^\/?xl\//, '').replace(/^\//, '')}`
    : [...fichiers.keys()].find((n) => n.startsWith('xl/worksheets/'))
  if (!chemin || !fichiers.has(chemin)) throw new Error("Ce classeur ne contient aucune feuille lisible.")

  const chaines = chainesPartagees(texte('xl/sharedStrings.xml'))
  const feuille = texte(chemin)
  const grille: (string | number | null)[][] = []

  for (const [, attributsLigne, contenuLigne] of feuille.matchAll(/<row\b([^>]*)>([\s\S]*?)<\/row>/g)) {
    const numero = Number(/r="(\d+)"/.exec(attributsLigne)?.[1] ?? grille.length + 1)
    const ligne: (string | number | null)[] = []
    for (const [cellule, attributs] of contenuLigne.matchAll(/<c\b([^>]*)(?:\/>|>[\s\S]*?<\/c>)/g)) {
      const reference = /r="([A-Z]+\d+)"/.exec(attributs)?.[1]
      const type = /t="([^"]+)"/.exec(attributs)?.[1]
      const index = reference ? colonneDepuisReference(reference) : ligne.length
      while (ligne.length < index) ligne.push(null)
      ligne[index] = valeurCellule(cellule, type, chaines)
    }
    while (grille.length < numero - 1) grille.push([])
    grille[numero - 1] = ligne
  }
  return grille
}

/**
 * Lit un CSV « français » — celui que l'application exporte, et ce que
 * produit Excel quand on enregistre en CSV sur un poste francophone.
 * Séparateur détecté entre `;` et `,` sur la première ligne.
 */
export function lireCsv(texte: string): (string | number | null)[][] {
  const contenu = texte.replace(/^\uFEFF/, '')
  const premiereLigne = contenu.split(/\r?\n/)[0] ?? ''
  const separateur = (premiereLigne.match(/;/g)?.length ?? 0) >= (premiereLigne.match(/,/g)?.length ?? 0) ? ';' : ','

  const grille: string[][] = []
  let ligne: string[] = []
  let cellule = ''
  let entreGuillemets = false
  for (let i = 0; i < contenu.length; i++) {
    const c = contenu[i]
    if (entreGuillemets) {
      if (c === '"' && contenu[i + 1] === '"') {
        cellule += '"'
        i++
      } else if (c === '"') entreGuillemets = false
      else cellule += c
      continue
    }
    if (c === '"') entreGuillemets = true
    else if (c === separateur) {
      ligne.push(cellule)
      cellule = ''
    } else if (c === '\n') {
      ligne.push(cellule)
      grille.push(ligne)
      ligne = []
      cellule = ''
    } else if (c !== '\r') cellule += c
  }
  if (cellule !== '' || ligne.length) {
    ligne.push(cellule)
    grille.push(ligne)
  }
  return grille
}
