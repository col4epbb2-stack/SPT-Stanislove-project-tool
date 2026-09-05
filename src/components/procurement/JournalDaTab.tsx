import { useMemo, useState } from 'react'
import { Plus } from 'lucide-react'
import type { DaProcurement, JournalDaProcurement } from '../../types/procurementFollowUp'
import { resumeStatutsDa } from '../../lib/procurementFollowUpEngine'
import { formatNombre } from '../../lib/format'
import { usePagination } from '../../lib/usePagination'
import { Button } from '../ui/Button'
import { Pagination } from '../ui/Pagination'
import { TableauColonnes } from '../ui/TableauColonnes'
import { BarreFiltresTableau, ChampRecherche, CompteurLignes, FiltreSelect } from '../ui/FiltresTableau'
import { ModaleSuppression } from '../ui/ModaleSuppression'
import { StatCard } from './elements'
import { colonnesDa } from './colonnes'
import { DaSaisieForm, type DaSaisieInput } from './formulaires'

// Onglet "Journal DA" — extrait de pages/ProcurementFollowUpPage.tsx le
// 06/08/2026 et doté de son point de saisie. Le résumé des statuts n'est plus
// celui figé dans le blob du classeur mais recalculé depuis les lignes
// (resumeStatutsDa) : sinon il resterait faux dès la première DA saisie.

const PAGE_SIZE = 20

export function JournalDaTab({
  journalDa,
  onEnregistrer,
  onSupprimer,
}: {
  journalDa: JournalDaProcurement
  onEnregistrer: (input: DaSaisieInput, initiale: DaProcurement | null) => Promise<void>
  onSupprimer: (d: DaProcurement) => Promise<void>
}) {
  const [filtreStatut, setFiltreStatut] = useState('')
  const [recherche, setRecherche] = useState('')
  const [formOuvert, setFormOuvert] = useState(false)
  const [ligneEnEdition, setLigneEnEdition] = useState<DaProcurement | null>(null)
  const [ligneASupprimer, setLigneASupprimer] = useState<DaProcurement | null>(null)

  const das = journalDa.das
  const resume = useMemo(() => resumeStatutsDa(das), [das])
  const statuts = useMemo(
    () => [...new Set(das.map((d) => d.statut).filter((s): s is string => !!s))].sort(),
    [das]
  )
  const ots = useMemo(() => [...new Set(das.map((d) => d.ot).filter((o): o is string => !!o))].sort(), [das])

  const filtered = useMemo(() => {
    const q = recherche.trim().toLowerCase()
    return das.filter(
      (d) =>
        (!filtreStatut || d.statut === filtreStatut) &&
        (!q || `${d.numero ?? ''} ${d.ot ?? ''}`.toLowerCase().includes(q))
    )
  }, [das, filtreStatut, recherche])

  const { page, pageCount, visible, setPage, resetPage } = usePagination(filtered, PAGE_SIZE)

  const filtrer = (setter: (v: string) => void) => (v: string) => {
    setter(v)
    resetPage()
  }

  const ouvrir = (ligne: DaProcurement | null) => {
    setLigneEnEdition(ligne)
    setFormOuvert(true)
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Demandes d'achat" value={formatNombre(das.length)} />
        <StatCard label="In progress" value={formatNombre(resume.inProgress)} />
        <StatCard label="Closed" value={formatNombre(resume.closed)} />
        <StatCard
          label="Fournisseurs / contractors"
          value={`${formatNombre(journalDa.fournisseurs.length)} / ${formatNombre(journalDa.contractors.length)}`}
          detail="listes de référence du classeur"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">
        <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-200 overflow-hidden">
          <BarreFiltresTableau>
            <Button type="button" size="sm" onClick={() => ouvrir(null)} className="gap-1.5">
              <Plus className="w-4 h-4" />
              Nouvelle DA
            </Button>
            <FiltreSelect label="Statut" value={filtreStatut} onChange={filtrer(setFiltreStatut)} options={statuts} />
            <ChampRecherche value={recherche} onChange={filtrer(setRecherche)} placeholder="Numéro DA, OT..." />
            <CompteurLignes filtrees={formatNombre(filtered.length)} total={formatNombre(das.length)} />
          </BarreFiltresTableau>

          <TableauColonnes
            colonnes={colonnesDa(
              (d) => ouvrir(d),
              (d) => setLigneASupprimer(d)
            )}
            lignes={visible}
            cleLigne={(d) => d.id}
            exportation={{ nomFichier: 'procurement-da', titre: 'Journal des DA', lignes: filtered }}
          />

          <Pagination page={page} pageCount={pageCount} onPageChange={setPage} />
        </div>

        <div className="space-y-4">
          <div className="bg-white rounded-2xl border border-gray-200 p-5">
            <h3 className="font-semibold text-gray-900 mb-3">Contractors ({journalDa.contractors.length})</h3>
            <div className="flex flex-wrap gap-1.5">
              {journalDa.contractors.map((c) => (
                <span key={c} className="text-xs px-2 py-1 rounded-lg bg-gray-100 text-gray-700">
                  {c}
                </span>
              ))}
            </div>
          </div>
          <div className="bg-white rounded-2xl border border-gray-200 p-5">
            <h3 className="font-semibold text-gray-900 mb-3">Fournisseurs ({journalDa.fournisseurs.length})</h3>
            <div className="flex flex-wrap gap-1.5 max-h-56 overflow-y-auto">
              {journalDa.fournisseurs.map((f) => (
                <span key={f} className="text-xs px-2 py-1 rounded-lg bg-gray-100 text-gray-700">
                  {f}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      <DaSaisieForm
        isOpen={formOuvert}
        onClose={() => setFormOuvert(false)}
        onSubmit={(input) => onEnregistrer(input, ligneEnEdition)}
        ligneInitiale={ligneEnEdition}
        suggestions={{ ots }}
      />

      {ligneASupprimer && (
        <ModaleSuppression
          titre={`Supprimer la DA « ${ligneASupprimer.numero ?? ligneASupprimer.id} »`}
          message="Cette saisie sera supprimée définitivement."
          avertissements={[
            'Si cette ligne provenait du classeur importé, elle réapparaîtra avec ses valeurs d\'origine — seule la saisie est retirée. Sinon, elle disparaît du tableau.',
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
