import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'

// Export PDF générique (une table par appel) pour les rapports "Suivi hebdo
// CRJ" — un bouton "Exporter en PDF" par onglet du rapport journalier
// (29/07/2026). Couleurs alignées sur --color-primary/--color-accent de
// src/index.css pour rester visuellement cohérent avec le reste de l'app.
const PRIMARY_RGB: [number, number, number] = [55, 48, 163]
const ROW_ALT_RGB: [number, number, number] = [245, 244, 253]

export interface ExportPdfTableau {
  titre: string
  sousTitre?: string
  colonnes: string[]
  lignes: (string | number)[][]
  nomFichier: string
}

export function exporterTableauPdf({ titre, sousTitre, colonnes, lignes, nomFichier }: ExportPdfTableau): void {
  const doc = new jsPDF({ orientation: colonnes.length > 6 ? 'landscape' : 'portrait' })

  doc.setFontSize(14)
  doc.setTextColor(30, 27, 75)
  doc.text(titre, 14, 16)

  let startY = 22
  if (sousTitre) {
    doc.setFontSize(10)
    doc.setTextColor(100, 100, 120)
    doc.text(sousTitre, 14, 22)
    startY = 27
  }

  autoTable(doc, {
    head: [colonnes],
    body: lignes,
    startY,
    styles: { fontSize: 8, cellPadding: 2.5, textColor: [31, 41, 55] },
    headStyles: { fillColor: PRIMARY_RGB, textColor: [255, 255, 255], fontStyle: 'bold' },
    alternateRowStyles: { fillColor: ROW_ALT_RGB },
    margin: { left: 14, right: 14 },
  })

  doc.save(nomFichier)
}

export interface SectionRapportPdf {
  titre: string
  colonnes: string[]
  lignes: (string | number | null)[][]
  /** Affiché à la place du tableau quand il n'y a rien à montrer. */
  messageVide?: string
}

/**
 * Rapport multi-tableaux dans un seul document (module Contrat EPCM, §11 :
 * un rapport réunit planning, pointages, rotations, coûts et alertes). Chaque
 * section s'enchaîne à la suite de la précédente, avec saut de page
 * automatique géré par autoTable.
 */
export function exporterRapportPdf({
  titre,
  sousTitre,
  sections,
  nomFichier,
}: {
  titre: string
  sousTitre?: string
  sections: SectionRapportPdf[]
  nomFichier: string
}): void {
  const doc = new jsPDF({ orientation: 'landscape' })

  doc.setFontSize(15)
  doc.setTextColor(30, 27, 75)
  doc.text(titre, 14, 16)
  if (sousTitre) {
    doc.setFontSize(10)
    doc.setTextColor(100, 100, 120)
    doc.text(sousTitre, 14, 22)
  }

  let curseur = sousTitre ? 30 : 24
  for (const section of sections) {
    doc.setFontSize(11)
    doc.setTextColor(30, 27, 75)
    doc.text(section.titre, 14, curseur)
    curseur += 4

    if (section.lignes.length === 0) {
      doc.setFontSize(9)
      doc.setTextColor(130, 130, 150)
      doc.text(section.messageVide ?? 'Aucune donnée.', 14, curseur + 3)
      curseur += 12
      continue
    }

    autoTable(doc, {
      head: [section.colonnes],
      body: section.lignes.map((l) => l.map((v) => (v == null ? '' : String(v)))),
      startY: curseur,
      styles: { fontSize: 7.5, cellPadding: 2, textColor: [31, 41, 55] },
      headStyles: { fillColor: PRIMARY_RGB, textColor: [255, 255, 255], fontStyle: 'bold' },
      alternateRowStyles: { fillColor: ROW_ALT_RGB },
      margin: { left: 14, right: 14 },
    })
    // `lastAutoTable` est posé sur le document par jsPDF-autotable après
    // chaque table : c'est ce qui permet d'empiler la section suivante.
    curseur = ((doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? curseur) + 10
  }

  doc.save(nomFichier)
}
