import { useMemo, useState } from 'react'
import { CalendarPlus, CheckCircle2, Pencil, Trash2 } from 'lucide-react'
import type {
  LigneJournalTonnage,
  LignePersonnelTonnage,
  ParametresContratTonnage,
  RapportTonnage,
} from '../../types/tonnageEchaf'
import { demandesDuRapport, hseDuRapport, pointagesDuRapport } from '../../lib/contratTonnageRapports'
import { estApprouve } from '../../lib/contratTonnageWorkflow'
import { COMPTEURS_HSE } from '../../types/hebdoCrj'
import { formatDate, formatNombre } from '../../lib/format'
import { usePagination } from '../../lib/usePagination'
import { useAuth } from '../../contexts/useAuth'
import { Button } from '../ui/Button'
import { Pagination } from '../ui/Pagination'
import { TableauColonnes, type ColonneTableau } from '../ui/TableauColonnes'
import { BarreFiltresTableau, ChampRecherche, CompteurLignes, FiltreSelect } from '../ui/FiltresTableau'
import { ModaleSuppression } from '../ui/ModaleSuppression'
import { RapportTonnageModal, type RapportTonnageSoumis } from './RapportTonnageModal'

// Onglet « Rapport journalier » (03/09/2026, `doc/Suivi tonnage rev01.docx`
// §C — lot 3). Point d'entrée unique par jour et par champ : chaque ligne
// renvoie au Journal montage/dépose et au Suivi personnel du même jour, sans
// en être une troisième copie.

const PAGE_SIZE = 20

export function RapportTab({
  rapports,
  journal,
  personnel,
  parametres,
  onEnregistrer,
  onSupprimer,
  onApprouver,
  onCommenter,
  onOuvrirJournal,
  onOuvrirPersonnel,
}: {
  rapports: RapportTonnage[]
  journal: LigneJournalTonnage[]
  personnel: LignePersonnelTonnage[]
  parametres: ParametresContratTonnage
  onEnregistrer: (v: RapportTonnageSoumis) => Promise<void>
  // Suppression définitive (04/09/2026, demande explicite). Réservée aux
  // admins : un rapport approuvé est un document de suivi validé, au même
  // titre qu'une ligne navette ou un contrat.
  onSupprimer: (r: RapportTonnage) => Promise<void>
  /** §D « WORKLOW » (03/09/2026, lot 7) — approbation du Responsable Technique. */
  onApprouver: (id: string) => Promise<void>
  /** Commentaire d'un superviseur / gestionnaire du contrat, avec signalement d'erreur éventuel. */
  onCommenter: (id: string, texte: string, signalementErreur: boolean) => Promise<void>
  onOuvrirJournal: (date: string, champ: string) => void
  onOuvrirPersonnel: (date: string, champ: string) => void
}) {
  const { currentUser } = useAuth()
  const isAdmin = currentUser?.role === 'admin'
  const [filtreChamp, setFiltreChamp] = useState('')
  const [recherche, setRecherche] = useState('')
  const [formOuvert, setFormOuvert] = useState(false)
  const [rapportEnEdition, setRapportEnEdition] = useState<RapportTonnage | null>(null)
  const [rapportASupprimer, setRapportASupprimer] = useState<RapportTonnage | null>(null)

  const champs = useMemo(() => [...new Set(rapports.map((r) => r.champ))].sort(), [rapports])

  const filtered = useMemo(() => {
    const q = recherche.trim().toLowerCase()
    return rapports.filter(
      (r) =>
        (!filtreChamp || r.champ === filtreChamp) &&
        (!q || `${r.champ} ${r.redacteur ?? ''} ${r.societeExecutante ?? ''}`.toLowerCase().includes(q))
    )
  }, [rapports, filtreChamp, recherche])

  const trie = useMemo(() => [...filtered].sort((a, b) => (a.date < b.date ? 1 : -1)), [filtered])
  const { page, pageCount, visible, setPage, resetPage } = usePagination(trie, PAGE_SIZE)

  const filtrer = (setter: (v: string) => void) => (v: string) => {
    setter(v)
    resetPage()
  }

  const ouvrirCreation = () => {
    setRapportEnEdition(null)
    setFormOuvert(true)
  }
  const ouvrirEdition = (r: RapportTonnage) => {
    setRapportEnEdition(r)
    setFormOuvert(true)
  }

  const colonnes: ColonneTableau<RapportTonnage>[] = [
    {
      cle: 'editer',
      entete: '',
      exportable: false,
      valeur: (r) => (
        <button
          type="button"
          onClick={() => ouvrirEdition(r)}
          className="p-1.5 rounded-lg text-gray-400 hover:text-primary hover:bg-primary/5"
          title="Ouvrir ce rapport"
        >
          <Pencil className="w-3.5 h-3.5" />
        </button>
      ),
    },
    { cle: 'date', entete: 'Date', valeur: (r) => formatDate(r.date), classeCellule: 'whitespace-nowrap font-medium text-gray-900' },
    { cle: 'champ', entete: 'Champ', valeur: (r) => r.champ },
    { cle: 'redacteur', entete: 'Rédacteur', valeur: (r) => r.redacteur ?? '—' },
    { cle: 'societe', entete: 'Société exécutante', valeur: (r) => r.societeExecutante ?? '—' },
    {
      cle: 'demandes',
      entete: 'Demandes',
      align: 'right',
      valeur: (r) => formatNombre(demandesDuRapport(journal, r.date, r.champ).length),
    },
    {
      cle: 'personnel',
      entete: 'Pointages',
      align: 'right',
      valeur: (r) => formatNombre(pointagesDuRapport(personnel, r.date, r.champ).length),
    },
    {
      cle: 'standby',
      entete: 'Stand-by (h)',
      align: 'right',
      valeur: (r) => (r.standByTotalHeures == null ? '—' : formatNombre(r.standByTotalHeures, 2)),
    },
    {
      cle: 'hse',
      entete: 'Événements HSE',
      align: 'right',
      valeur: (r) => {
        const h = hseDuRapport(r)
        const total = COMPTEURS_HSE.reduce((s, c) => s + h[c.cle], 0)
        return r.hse === undefined ? '—' : formatNombre(total)
      },
    },
    {
      // §D « WORKLOW » (03/09/2026, lot 7) : approbation du Responsable
      // Technique — sans elle, rien à l'écran ne disait qu'un rapport avait
      // été vérifié.
      cle: 'statut',
      entete: 'Statut',
      texte: (r) => (estApprouve(r) ? 'Approuvé' : 'Non approuvé'),
      valeur: (r) =>
        estApprouve(r) ? (
          <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700">
            <CheckCircle2 className="w-3.5 h-3.5" />
            Approuvé
          </span>
        ) : (
          <span className="text-xs text-gray-400">Non approuvé</span>
        ),
    },
    ...(isAdmin
      ? [
          {
            cle: 'supprimer',
            entete: '',
            exportable: false,
            valeur: (r: RapportTonnage) => (
              <button
                type="button"
                onClick={() => setRapportASupprimer(r)}
                className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50"
                title="Supprimer ce rapport"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            ),
          } satisfies ColonneTableau<RapportTonnage>,
        ]
      : []),
  ]

  return (
    <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
      <BarreFiltresTableau>
        <Button type="button" size="sm" onClick={ouvrirCreation} className="gap-1.5">
          <CalendarPlus className="w-4 h-4" />
          Nouveau rapport
        </Button>
        <FiltreSelect label="Champ" value={filtreChamp} onChange={filtrer(setFiltreChamp)} options={champs} />
        <ChampRecherche value={recherche} onChange={filtrer(setRecherche)} placeholder="Champ, rédacteur, société..." />
        <CompteurLignes filtrees={formatNombre(filtered.length)} total={formatNombre(rapports.length)} />
      </BarreFiltresTableau>

      <TableauColonnes
        colonnes={colonnes}
        lignes={visible}
        cleLigne={(r) => r.id}
        exportation={{ nomFichier: 'tonnage-rapports', titre: 'Rapports journaliers', lignes: filtered }}
      />

      <Pagination page={page} pageCount={pageCount} onPageChange={setPage} />

      <RapportTonnageModal
        isOpen={formOuvert}
        onClose={() => setFormOuvert(false)}
        onEnregistrer={onEnregistrer}
        onApprouver={onApprouver}
        onCommenter={onCommenter}
        onOuvrirJournal={onOuvrirJournal}
        onOuvrirPersonnel={onOuvrirPersonnel}
        rapports={rapports}
        journal={journal}
        personnel={personnel}
        parametres={parametres}
        champs={parametres.champs.map((c) => c.champ)}
        redacteurParDefaut={currentUser?.name ?? null}
        currentUser={currentUser}
        rapportInitial={rapportEnEdition}
      />

      {rapportASupprimer && (
        <ModaleSuppression
          titre={`Supprimer le rapport du ${formatDate(rapportASupprimer.date)} (${rapportASupprimer.champ})`}
          message="Ce rapport journalier sera supprimé définitivement, avec son approbation et ses commentaires éventuels."
          avertissements={[
            'Les demandes du Journal et les pointages du Suivi personnel de ce jour ne sont pas supprimés : ce rapport n\'en est qu\'un regroupement.',
          ]}
          libelleBouton="Supprimer le rapport"
          onFerme={() => setRapportASupprimer(null)}
          onConfirmer={async () => {
            await onSupprimer(rapportASupprimer)
            setRapportASupprimer(null)
          }}
        />
      )}
    </div>
  )
}
