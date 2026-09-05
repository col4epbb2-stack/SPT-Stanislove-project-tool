import { useEffect, useRef, useState } from 'react'
import { ChevronDown, Download, FileSpreadsheet, FileText, Loader2 } from 'lucide-react'
import { exporterTableau, type ColonneExport, type FormatExport } from '../../lib/export'

// Bouton d'extraction commun à toutes les pages : un menu CSV / PDF au-dessus
// d'un tableau. Il prend les colonnes déjà utilisées pour l'affichage, donc
// l'ajouter à un tableau existant ne demande pas de redécrire ses colonnes.
//
// Trois formats depuis le 20/08/2026 : un vrai classeur .xlsx (lib/xlsx.ts,
// écrit sans dépendance), le CSV « français » (séparateur `;`, BOM UTF-8)
// qu'Excel ouvre aussi en double-clic, et le PDF de diffusion. Le .xlsx est
// proposé en premier : c'est celui qui conserve les types, et celui que
// l'import de l'écran Agents sait relire.

const FORMATS: { format: FormatExport; label: string; aide: string; icone: typeof FileText }[] = [
  { format: 'xlsx', label: 'Excel (.xlsx)', aide: 'Classeur : les nombres restent des nombres', icone: FileSpreadsheet },
  { format: 'csv', label: 'CSV', aide: 'Texte, réouvrable partout', icone: FileSpreadsheet },
  { format: 'pdf', label: 'PDF', aide: 'Mise en page prête à diffuser', icone: FileText },
]

export function BoutonExport<T>({
  nomFichier,
  titre,
  sousTitre,
  colonnes,
  lignes,
  libelle = 'Exporter',
}: {
  // Base du nom de fichier — la date du jour y est ajoutée.
  nomFichier: string
  // Titre du document PDF.
  titre: string
  sousTitre?: string
  colonnes: ColonneExport<T>[]
  // L'ensemble à extraire : pour un tableau paginé, les lignes filtrées et
  // non la page affichée.
  lignes: T[]
  libelle?: string
}) {
  const [ouvert, setOuvert] = useState(false)
  const [enCours, setEnCours] = useState<FormatExport | null>(null)
  const conteneur = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!ouvert) return
    const auClic = (e: MouseEvent) => {
      if (conteneur.current && !conteneur.current.contains(e.target as Node)) setOuvert(false)
    }
    const auClavier = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOuvert(false)
    }
    document.addEventListener('mousedown', auClic)
    document.addEventListener('keydown', auClavier)
    return () => {
      document.removeEventListener('mousedown', auClic)
      document.removeEventListener('keydown', auClavier)
    }
  }, [ouvert])

  const vide = lignes.length === 0

  const lancer = async (format: FormatExport) => {
    setEnCours(format)
    try {
      await exporterTableau({ format, nomFichier, titre, sousTitre, colonnes, lignes })
      setOuvert(false)
    } finally {
      setEnCours(null)
    }
  }

  return (
    <div className="relative" ref={conteneur}>
      <button
        type="button"
        disabled={vide}
        onClick={() => setOuvert((o) => !o)}
        aria-expanded={ouvert}
        title={vide ? 'Aucune ligne à exporter' : `Exporter ${lignes.length} ligne(s)`}
        className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium transition ${
          vide
            ? 'border-line bg-surface-muted text-gray-300 cursor-not-allowed'
            : ouvert
              ? 'border-primary bg-primary/5 text-primary'
              : 'border-line bg-surface-muted text-gray-700 hover:border-gray-300 hover:bg-surface'
        }`}
      >
        <Download className="w-4 h-4" />
        {libelle}
        <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${ouvert ? 'rotate-180' : ''}`} />
      </button>

      {ouvert && (
        <div className="absolute right-0 z-30 mt-2 w-64 rounded-xl border border-line bg-surface shadow-raised overflow-hidden apparition">
          <p className="px-3 pt-3 pb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
            {lignes.length} ligne(s) · {colonnes.length} colonne(s)
          </p>
          {FORMATS.map((f) => (
            <button
              key={f.format}
              type="button"
              disabled={enCours !== null}
              onClick={() => lancer(f.format)}
              className="w-full flex items-start gap-2.5 px-3 py-2.5 text-left hover:bg-gray-50 disabled:opacity-50 transition-colors"
            >
              {enCours === f.format ? (
                <Loader2 className="w-4 h-4 mt-0.5 shrink-0 text-primary animate-spin" />
              ) : (
                <f.icone className="w-4 h-4 mt-0.5 shrink-0 text-gray-400" />
              )}
              <span className="min-w-0">
                <span className="block text-sm text-gray-800">{f.label}</span>
                <span className="block text-xs text-gray-400">{f.aide}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
