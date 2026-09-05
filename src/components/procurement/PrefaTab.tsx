import { useMemo, useState } from 'react'
import { Plus } from 'lucide-react'
import type { LignePrefa, SuiviPrefaProcurement } from '../../types/procurementFollowUp'
import { resumePrefa } from '../../lib/procurementFollowUpEngine'
import { formatNombre, formatPercent } from '../../lib/format'
import { usePagination } from '../../lib/usePagination'
import { avecAjouts, valeursDistinctes } from '../../lib/saisie'
import { useListesValeurs } from '../../contexts/useListesValeurs'
import { Button } from '../ui/Button'
import { Pagination } from '../ui/Pagination'
import { TableauColonnes } from '../ui/TableauColonnes'
import { BarreFiltresTableau, ChampRecherche, CompteurLignes, FiltreSelect } from '../ui/FiltresTableau'
import { ModaleSuppression } from '../ui/ModaleSuppression'
import { StatCard } from './elements'
import { colonnesPrefa } from './colonnes'
import { PrefaSaisieForm, type PrefaSaisieInput } from './formulaires'

// Onglet "Suivi préfa" — extrait de pages/ProcurementFollowUpPage.tsx le
// 06/08/2026 et doté de son point de saisie. Le résumé de tête n'est plus
// celui figé dans le blob du classeur mais recalculé depuis les lignes
// (resumePrefa) : sinon il resterait faux dès la première saisie. Attention,
// ce sont des QUANTITÉS et non des nombres de lignes — vérifié sur les
// données réelles (895 livrées pour 36 lignes seulement).

const PAGE_SIZE = 20

export function PrefaTab({
  prefa,
  onEnregistrer,
  onSupprimer,
}: {
  prefa: SuiviPrefaProcurement
  onEnregistrer: (input: PrefaSaisieInput, initiale: LignePrefa | null) => Promise<void>
  onSupprimer: (l: LignePrefa) => Promise<void>
}) {
  const [filtrePlateforme, setFiltrePlateforme] = useState('')
  const [filtreLivraison, setFiltreLivraison] = useState('')
  const [recherche, setRecherche] = useState('')
  const [formOuvert, setFormOuvert] = useState(false)
  const [ligneEnEdition, setLigneEnEdition] = useState<LignePrefa | null>(null)
  const [ligneASupprimer, setLigneASupprimer] = useState<LignePrefa | null>(null)

  const lignes = prefa.lignes
  const resume = useMemo(() => resumePrefa(lignes), [lignes])

  const { valeursDe } = useListesValeurs()
  const plateformes = useMemo(() => valeursDistinctes(lignes, 'plateforme'), [lignes])
  const responsables = useMemo(() => valeursDistinctes(lignes, 'responsable'), [lignes])
  const numerosPo = useMemo(() => valeursDistinctes(lignes, 'numeroPo'), [lignes])
  const livraisons = useMemo(() => valeursDistinctes(lignes, 'livraisonMagasin'), [lignes])

  const filtered = useMemo(() => {
    const q = recherche.trim().toLowerCase()
    return lignes.filter(
      (l) =>
        (!filtrePlateforme || l.plateforme === filtrePlateforme) &&
        (!filtreLivraison || l.livraisonMagasin === filtreLivraison) &&
        (!q ||
          `${l.code ?? ''} ${l.numeroPo ?? ''} ${l.designation ?? ''} ${l.responsable ?? ''}`.toLowerCase().includes(q))
    )
  }, [lignes, filtrePlateforme, filtreLivraison, recherche])

  const { page, pageCount, visible, setPage, resetPage } = usePagination(filtered, PAGE_SIZE)

  const filtrer = (setter: (v: string) => void) => (v: string) => {
    setter(v)
    resetPage()
  }

  const ouvrir = (ligne: LignePrefa | null) => {
    setLigneEnEdition(ligne)
    setFormOuvert(true)
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard label="Quantité totale en préfabrication" value={formatNombre(resume.qteTotale)} />
        <StatCard
          label="Livré magasin (OUI)"
          value={formatNombre(resume.livraisonMagasinOui)}
          detail={formatPercent(resume.pctOui)}
        />
        <StatCard
          label="Non livré magasin"
          value={formatNombre(resume.livraisonMagasinNon)}
          detail={formatPercent(resume.pctNon)}
        />
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
        <BarreFiltresTableau>
          <Button type="button" size="sm" onClick={() => ouvrir(null)} className="gap-1.5">
            <Plus className="w-4 h-4" />
            Nouvelle ligne
          </Button>
          <FiltreSelect
            label="Plateforme"
            value={filtrePlateforme}
            onChange={filtrer(setFiltrePlateforme)}
            options={plateformes}
          />
          <FiltreSelect
            label="Livraison magasin"
            value={filtreLivraison}
            onChange={filtrer(setFiltreLivraison)}
            options={livraisons}
          />
          <ChampRecherche
            value={recherche}
            onChange={filtrer(setRecherche)}
            placeholder="Code, PO, désignation, responsable..."
          />
          <CompteurLignes filtrees={formatNombre(filtered.length)} total={formatNombre(lignes.length)} />
        </BarreFiltresTableau>

        <TableauColonnes
          colonnes={colonnesPrefa(
            (l) => ouvrir(l),
            (l) => setLigneASupprimer(l)
          )}
          lignes={visible}
          cleLigne={(l) => l.id}
          exportation={{ nomFichier: 'procurement-prefabrication', titre: 'Suivi préfabrication', lignes: filtered }}
        />

        <Pagination page={page} pageCount={pageCount} onPageChange={setPage} />
      </div>

      <PrefaSaisieForm
        isOpen={formOuvert}
        onClose={() => setFormOuvert(false)}
        onSubmit={(input) => onEnregistrer(input, ligneEnEdition)}
        ligneInitiale={ligneEnEdition}
        suggestions={{
          plateformes: avecAjouts(plateformes, valeursDe('commun.plateformes')),
          responsables: avecAjouts(responsables, valeursDe('procurement.responsables')),
          numerosPo,
        }}
      />

      {ligneASupprimer && (
        <ModaleSuppression
          titre={`Supprimer la ligne préfa « ${ligneASupprimer.code ?? ligneASupprimer.id} »`}
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
