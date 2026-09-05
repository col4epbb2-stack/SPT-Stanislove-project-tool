// Export tableur des rapports (module Contrat EPCM, §11 « Export au format
// Excel et PDF »). Le pendant PDF existe déjà : lib/exportPdf.ts (jsPDF).
//
// Format retenu : CSV séparé par des points-virgules et préfixé du BOM UTF-8
// — c'est ce qu'Excel ouvre en double-clic sur un poste francophone, sans
// assistant d'import et sans casser les accents. Écrire un vrai .xlsx aurait
// demandé une dépendance de plus (aucune n'est présente dans package.json)
// pour un gain nul ici : ces rapports sont des tableaux plats, sans mise en
// forme ni formule.

export interface ExportCsv {
  colonnes: string[]
  lignes: (string | number | null)[][]
  nomFichier: string
}

function cellule(valeur: string | number | null): string {
  if (valeur == null) return ''
  const texte = String(valeur)
  // Le point-virgule étant le séparateur, toute cellule qui en contient (ou
  // un guillemet, ou un retour à la ligne) doit être échappée.
  return /[";\n\r]/.test(texte) ? `"${texte.replace(/"/g, '""')}"` : texte
}

export function exporterCsv({ colonnes, lignes, nomFichier }: ExportCsv): void {
  const contenu = [colonnes, ...lignes].map((ligne) => ligne.map(cellule).join(';')).join('\r\n')
  const blob = new Blob([`\uFEFF${contenu}`], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const lien = document.createElement('a')
  lien.href = url
  lien.download = nomFichier.endsWith('.csv') ? nomFichier : `${nomFichier}.csv`
  lien.click()
  URL.revokeObjectURL(url)
}
