import { useMemo, useState } from 'react'
import { Pencil, Plus, Search, Trash2 } from 'lucide-react'
import { Button } from '../ui/Button'
import { Pagination } from '../ui/Pagination'
import { usePagination } from '../../lib/usePagination'
import { formatCellule } from '../../lib/formatCellule'
import { BoutonExport } from '../ui/BoutonExport'
import { ModaleSuppression } from '../ui/ModaleSuppression'
import { kpisJournal } from '../../lib/grandArretEngine'
import { formatNombre, formatPercent } from '../../lib/format'
import { JournalSaisieForm } from './JournalSaisieForm'
import type { CelluleGrille, JournalGrandArret, LigneJournalAffichee } from '../../types/grandArret'

// Onglet « Journal » du module Grand arrêt — extrait de pages/GrandArretPage.tsx
// le 07/08/2026 en même temps qu'il recevait son point de saisie, comme les
// onglets des modules Tonnage / METAL / Procurement avant lui.
//
// Les 10 pourcentages du bandeau ne sont plus repris tels quels du classeur
// mais recalculés depuis les lignes affichées (lib/grandArretEngine.ts,
// formules vérifiées sans écart sur les 165 lignes réelles) : figés, ils
// auraient cessé d'être vrais dès la première saisie.

const PAGE_SIZE = 20

export function JournalTab({
  journal,
  lignes,
  onEnregistrer,
  onSupprimer,
}: {
  journal: JournalGrandArret
  lignes: LigneJournalAffichee[]
  onEnregistrer: (cellules: CelluleGrille[], initiale: LigneJournalAffichee | null) => Promise<void>
  // Suppression (04/09/2026, demande explicite). Ne s'affiche que sur une
  // ligne qui porte un `docId` (une saisie) — une ligne restée pure import
  // n'a aucun document à supprimer.
  onSupprimer: (ligne: LigneJournalAffichee) => Promise<void>
}) {
  const [recherche, setRecherche] = useState('')
  const [formOuvert, setFormOuvert] = useState(false)
  const [ligneEnEdition, setLigneEnEdition] = useState<LigneJournalAffichee | null>(null)
  const [ligneASupprimer, setLigneASupprimer] = useState<LigneJournalAffichee | null>(null)

  const filtrees = useMemo(() => {
    const q = recherche.trim().toLowerCase()
    if (!q) return lignes
    return lignes.filter((l) => l.cellules.some((v) => typeof v === 'string' && v.toLowerCase().includes(q)))
  }, [lignes, recherche])

  const { page, pageCount, visible, setPage, resetPage } = usePagination(filtrees, PAGE_SIZE)

  const kpis = useMemo(() => kpisJournal(lignes.map((l) => l.cellules), journal.kpis), [lignes, journal.kpis])

  const labelKpi = (col: number) => {
    const groupe = journal.groupes.find((g) => col >= g.debut && col <= g.fin)
    return { groupe: groupe?.label ?? '', colonne: journal.colonnes[col - 1]?.label ?? '' }
  }

  const ouvrirSaisie = (ligne: LigneJournalAffichee | null) => {
    setLigneEnEdition(ligne)
    setFormOuvert(true)
  }

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl border border-gray-200 p-5 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h3 className="text-base font-semibold text-gray-900">{journal.banner}</h3>
          <p className="text-xs text-gray-400 mt-1">{journal.groupes[0]?.label}</p>
        </div>
        <Button onClick={() => ouvrirSaisie(null)}>
          <Plus className="w-4 h-4 mr-2" />
          Nouvelle ligne
        </Button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-4">
        {kpis.map((k) => {
          const { groupe, colonne } = labelKpi(k.col)
          return (
            <div key={k.col} className="bg-white rounded-2xl border border-gray-200 p-4">
              <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide truncate">{groupe}</p>
              <p className="text-xs text-gray-500 truncate" title={colonne}>
                {colonne}
              </p>
              <p className="text-lg font-bold text-gray-900 mt-1">{formatPercent(k.valeur)}</p>
            </div>
          )
        })}
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-200 flex items-center justify-between gap-3 flex-wrap">
          <p className="text-sm font-semibold text-gray-900">
            Journal ({formatNombre(filtrees.length)} ligne{filtrees.length > 1 ? 's' : ''})
          </p>
          <div className="flex items-center gap-2 flex-wrap">
            <BoutonExport
              nomFichier="grand-arret-journal"
              titre="Grand arrêt — journal de préfabrication"
              colonnes={journal.colonnes.map((c, i) => ({
                entete: c.label,
                valeur: (l: LigneJournalAffichee) => formatCellule(l.cellules[i], c.format),
              }))}
              lignes={filtrees}
            />
            <div className="relative">
              <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              value={recherche}
              onChange={(e) => {
                setRecherche(e.target.value)
                resetPage()
              }}
                placeholder="Rechercher…"
                className="pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="text-sm whitespace-nowrap">
            <thead>
              <tr className="bg-gray-100 text-left text-xs text-gray-600">
                <th className="px-3 py-2" />
                {journal.groupes.map((g) => (
                  <th
                    key={g.debut}
                    colSpan={g.fin - g.debut + 1}
                    className="px-3 py-2 font-semibold border-l border-gray-200"
                  >
                    {g.label}
                  </th>
                ))}
              </tr>
              <tr className="bg-gray-50 text-left text-xs text-gray-500">
                <th className="px-3 py-2 font-medium">Modifier</th>
                {journal.colonnes.map((c, i) => (
                  <th key={i} className="px-3 py-2 font-medium align-bottom max-w-48 whitespace-normal border-l border-gray-100">
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visible.map((ligne) => (
                <tr key={ligne.docId ?? `import-${ligne.origineIndex}`} className="border-t border-gray-100">
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => ouvrirSaisie(ligne)}
                        title="Modifier cette ligne"
                        className="text-gray-400 hover:text-primary transition-colors"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      {ligne.docId && (
                        <button
                          onClick={() => setLigneASupprimer(ligne)}
                          title="Supprimer cette saisie"
                          className="text-gray-400 hover:text-red-600 transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </td>
                  {ligne.cellules.map((v, ci) => (
                    <td
                      key={ci}
                      className={`px-3 py-2 border-l border-gray-50 ${
                        ci <= 1 ? 'max-w-72 whitespace-normal text-gray-900' : 'text-gray-600'
                      }`}
                    >
                      {formatCellule(v, journal.colonnes[ci].format)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pagination page={page} pageCount={pageCount} onPageChange={setPage} total={filtrees.length} />
      </div>

      <JournalSaisieForm
        isOpen={formOuvert}
        onClose={() => setFormOuvert(false)}
        journal={journal}
        lignes={lignes.map((l) => l.cellules)}
        ligneInitiale={ligneEnEdition}
        onSubmit={(cellules) => onEnregistrer(cellules, ligneEnEdition)}
      />

      {ligneASupprimer && (
        <ModaleSuppression
          titre="Supprimer cette ligne du Journal"
          message="Cette saisie sera supprimée définitivement."
          avertissements={[
            ligneASupprimer.origineIndex != null
              ? "Cette ligne provient du classeur importé : elle réapparaîtra avec ses valeurs d'origine — seule la saisie est retirée."
              : 'Cette ligne a été créée directement dans l\'application : elle disparaîtra du tableau.',
          ]}
          libelleBouton="Supprimer"
          onFerme={() => setLigneASupprimer(null)}
          onConfirmer={async () => {
            await onSupprimer(ligneASupprimer)
            setLigneASupprimer(null)
          }}
        />
      )}
    </div>
  )
}
