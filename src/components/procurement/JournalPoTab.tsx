import { useMemo, useState } from 'react'
import { Plus } from 'lucide-react'
import type { JournalPoProcurement, PoProcurement } from '../../types/procurementFollowUp'
import { formatNombre } from '../../lib/format'
import { usePagination } from '../../lib/usePagination'
import { avecAjouts, valeursDistinctes } from '../../lib/saisie'
import { useListesValeurs } from '../../contexts/useListesValeurs'
import { Button } from '../ui/Button'
import { Pagination } from '../ui/Pagination'
import { TableauColonnes } from '../ui/TableauColonnes'
import { BarreFiltresTableau, ChampRecherche, CompteurLignes, FiltreSelect } from '../ui/FiltresTableau'
import { ModaleSuppression } from '../ui/ModaleSuppression'
import { colonnesPo } from './colonnes'
import { PoSaisieForm, type PoSaisieInput } from './formulaires'

// Onglet "Journal PO" — extrait de pages/ProcurementFollowUpPage.tsx le
// 06/08/2026 et doté de son point de saisie. Les 29 colonnes du tableau sont
// désormais décrites dans colonnes.tsx.

const PAGE_SIZE = 20

export function JournalPoTab({
  journalPo,
  onEnregistrer,
  onSupprimer,
}: {
  journalPo: JournalPoProcurement
  onEnregistrer: (input: PoSaisieInput, initiale: PoProcurement | null) => Promise<void>
  onSupprimer: (p: PoProcurement) => Promise<void>
}) {
  const [filtreStatut, setFiltreStatut] = useState('')
  const [filtreFournisseur, setFiltreFournisseur] = useState('')
  const [recherche, setRecherche] = useState('')
  const [formOuvert, setFormOuvert] = useState(false)
  const [ligneEnEdition, setLigneEnEdition] = useState<PoProcurement | null>(null)
  const [ligneASupprimer, setLigneASupprimer] = useState<PoProcurement | null>(null)

  const pos = journalPo.pos
  const { valeursDe } = useListesValeurs()
  const statuts = useMemo(() => valeursDistinctes(pos, 'statut'), [pos])
  const fournisseurs = useMemo(() => valeursDistinctes(pos, 'fournisseur'), [pos])
  const plateformes = useMemo(() => valeursDistinctes(pos, 'plateforme'), [pos])
  const leads = useMemo(() => valeursDistinctes(pos, 'lead'), [pos])
  const responsables = useMemo(() => valeursDistinctes(pos, 'responsableAchat'), [pos])
  const typesMateriel = useMemo(() => valeursDistinctes(pos, 'typeMateriel'), [pos])
  const numerosDa = useMemo(() => valeursDistinctes(pos, 'numeroDa'), [pos])
  const departements = useMemo(() => valeursDistinctes(pos, 'departement'), [pos])

  const filtered = useMemo(() => {
    const q = recherche.trim().toLowerCase()
    return pos.filter(
      (p) =>
        (!filtreStatut || p.statut === filtreStatut) &&
        (!filtreFournisseur || p.fournisseur === filtreFournisseur) &&
        (!q ||
          `${p.code ?? ''} ${p.descriptif ?? ''} ${p.numeroPo ?? ''} ${p.numeroDa ?? ''} ${p.designation ?? ''} ${p.fournisseur ?? ''}`
            .toLowerCase()
            .includes(q))
    )
  }, [pos, filtreStatut, filtreFournisseur, recherche])

  const { page, pageCount, visible, setPage, resetPage } = usePagination(filtered, PAGE_SIZE)

  const filtrer = (setter: (v: string) => void) => (v: string) => {
    setter(v)
    resetPage()
  }

  const ouvrir = (ligne: PoProcurement | null) => {
    setLigneEnEdition(ligne)
    setFormOuvert(true)
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
      <BarreFiltresTableau>
        <Button type="button" size="sm" onClick={() => ouvrir(null)} className="gap-1.5">
          <Plus className="w-4 h-4" />
          Nouveau PO
        </Button>
        <FiltreSelect label="Statut" value={filtreStatut} onChange={filtrer(setFiltreStatut)} options={statuts} />
        <FiltreSelect
          label="Fournisseur"
          value={filtreFournisseur}
          onChange={filtrer(setFiltreFournisseur)}
          options={fournisseurs}
        />
        <ChampRecherche
          value={recherche}
          onChange={filtrer(setRecherche)}
          placeholder="Code, descriptif, PO, DA, désignation..."
        />
        <CompteurLignes filtrees={formatNombre(filtered.length)} total={formatNombre(pos.length)} />
      </BarreFiltresTableau>

      <TableauColonnes
        colonnes={colonnesPo(
          (p) => ouvrir(p),
          (p) => setLigneASupprimer(p)
        )}
        lignes={visible}
        cleLigne={(p) => p.id}
        exportation={{ nomFichier: 'procurement-po', titre: 'Journal des PO', lignes: filtered }}
      />

      <Pagination page={page} pageCount={pageCount} onPageChange={setPage} />

      <PoSaisieForm
        isOpen={formOuvert}
        onClose={() => setFormOuvert(false)}
        onSubmit={(input) => onEnregistrer(input, ligneEnEdition)}
        ligneInitiale={ligneEnEdition}
        suggestions={{
          plateformes: avecAjouts(plateformes, valeursDe('commun.plateformes')),
          fournisseurs: avecAjouts(fournisseurs, valeursDe('procurement.fournisseurs')),
          leads: avecAjouts(leads, valeursDe('procurement.leads')),
          responsables: avecAjouts(responsables, valeursDe('procurement.responsables')),
          typesMateriel: avecAjouts(typesMateriel, valeursDe('procurement.typesMateriel')),
          numerosDa,
          departements: avecAjouts(departements, valeursDe('procurement.departements')),
        }}
      />

      {ligneASupprimer && (
        <ModaleSuppression
          titre={`Supprimer le PO « ${ligneASupprimer.numeroPo ?? ligneASupprimer.code ?? ligneASupprimer.id} »`}
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
