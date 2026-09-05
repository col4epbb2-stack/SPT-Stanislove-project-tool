import { useMemo, useState } from 'react'
import { Bar, BarChart, CartesianGrid, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Plus } from 'lucide-react'
import type { AoProcurement, JournalAoProcurement, ProcurementCharts } from '../../types/procurementFollowUp'
import { formatDate, formatNombre } from '../../lib/format'
import { usePagination } from '../../lib/usePagination'
import { avecAjouts, valeursDistinctes } from '../../lib/saisie'
import { useListesValeurs } from '../../contexts/useListesValeurs'
import { Button } from '../ui/Button'
import { Pagination } from '../ui/Pagination'
import { TableauColonnes } from '../ui/TableauColonnes'
import { BarreFiltresTableau, ChampRecherche, CompteurLignes, FiltreSelect } from '../ui/FiltresTableau'
import { ModaleSuppression } from '../ui/ModaleSuppression'
import { COULEUR_PRINCIPALE, HistoDureeChart, StatCard } from './elements'
import { colonnesAo } from './colonnes'
import { AoSaisieForm, type AoSaisieInput } from './formulaires'

// Onglet "Journal AO" — extrait de pages/ProcurementFollowUpPage.tsx le
// 06/08/2026 et doté de son point de saisie. Le tableau était sans
// pagination (toutes les lignes d'un coup) : il suit désormais le même
// gabarit que les autres journaux.

const PAGE_SIZE = 20

export function JournalAoTab({
  journalAo,
  charts,
  onEnregistrer,
  onSupprimer,
}: {
  journalAo: JournalAoProcurement
  charts: ProcurementCharts
  onEnregistrer: (input: AoSaisieInput, initiale: AoProcurement | null) => Promise<void>
  onSupprimer: (a: AoProcurement) => Promise<void>
}) {
  const [filtreStatut, setFiltreStatut] = useState('')
  const [filtrePlateforme, setFiltrePlateforme] = useState('')
  const [recherche, setRecherche] = useState('')
  const [formOuvert, setFormOuvert] = useState(false)
  const [ligneEnEdition, setLigneEnEdition] = useState<AoProcurement | null>(null)
  const [ligneASupprimer, setLigneASupprimer] = useState<AoProcurement | null>(null)

  const aos = journalAo.aos
  const { valeursDe } = useListesValeurs()
  const statuts = useMemo(() => valeursDistinctes(aos, 'statut'), [aos])
  const plateformes = useMemo(() => valeursDistinctes(aos, 'plateforme'), [aos])
  const fournisseurs = useMemo(() => valeursDistinctes(aos, 'fournisseur'), [aos])
  const situations = useMemo(() => valeursDistinctes(aos, 'situation'), [aos])
  const numerosDa = useMemo(() => valeursDistinctes(aos, 'numeroDa'), [aos])

  const filtered = useMemo(() => {
    const q = recherche.trim().toLowerCase()
    return aos.filter(
      (a) =>
        (!filtreStatut || a.statut === filtreStatut) &&
        (!filtrePlateforme || a.plateforme === filtrePlateforme) &&
        (!q ||
          `${a.code ?? ''} ${a.refAo ?? ''} ${a.numeroDa ?? ''} ${a.fournisseur ?? ''} ${a.plateforme ?? ''}`
            .toLowerCase()
            .includes(q))
    )
  }, [aos, filtreStatut, filtrePlateforme, recherche])

  const { page, pageCount, visible, setPage, resetPage } = usePagination(filtered, PAGE_SIZE)

  const filtrer = (setter: (v: string) => void) => (v: string) => {
    setter(v)
    resetPage()
  }

  const ouvrir = (ligne: AoProcurement | null) => {
    setLigneEnEdition(ligne)
    setFormOuvert(true)
  }

  // Les 3 histogrammes de l'onglet partagent la même mise en forme : libellé
  // = fournisseur, détail = plateforme · semaine · période.
  const serie = (evts: ProcurementCharts['ao']['livraisonExw']) =>
    evts.map((e) => ({
      libelle: e.fournisseur ?? '—',
      duree: e.duree,
      detail: [e.plateforme, e.semaine, e.periode].filter(Boolean).join(' · '),
    }))

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard label="Appels d'offres" value={formatNombre(aos.length)} />
        <StatCard
          label="Début lancement"
          value={journalAo.parametres.debutLancement ? formatDate(journalAo.parametres.debutLancement) : '—'}
        />
        <StatCard
          label="Délais d'arrivée"
          value={journalAo.parametres.delaiMaritime ?? '—'}
          detail={`maritime — aérien : ${journalAo.parametres.delaiAerien ?? '—'}`}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl border border-gray-200 p-5">
          <h3 className="font-semibold text-gray-900 mb-3">Statut des AO</h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart
              data={[
                { statut: 'CLOSED', nombre: charts.ao.statuts.closed },
                { statut: 'IN PROGRESS', nombre: charts.ao.statuts.inProgress },
              ]}
              margin={{ top: 20 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
              <XAxis dataKey="statut" tick={{ fontSize: 11, fill: '#6b7280' }} />
              <YAxis tick={{ fontSize: 11, fill: '#6b7280' }} allowDecimals={false} />
              <Tooltip formatter={(v) => formatNombre(Number(v))} />
              <Bar dataKey="nombre" name="Nombre d'AO" fill={COULEUR_PRINCIPALE} radius={[4, 4, 0, 0]} maxBarSize={44}>
                <LabelList dataKey="nombre" position="top" style={{ fill: '#374151', fontSize: 11 }} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <HistoDureeChart
          titre="LIVRAISON EXW — par fournisseur"
          data={serie(charts.ao.livraisonExw)}
          limite={charts.ao.limiteJours}
          hauteur={200}
        />
        <HistoDureeChart
          titre="ETA (maritime)"
          data={serie(charts.ao.etaMaritime)}
          limite={charts.ao.limiteJours}
          hauteur={200}
        />
        <HistoDureeChart
          titre="ETA (aérien)"
          data={serie(charts.ao.etaAerien)}
          limite={charts.ao.limiteJours}
          hauteur={200}
        />
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
        <BarreFiltresTableau>
          <Button type="button" size="sm" onClick={() => ouvrir(null)} className="gap-1.5">
            <Plus className="w-4 h-4" />
            Nouvel AO
          </Button>
          <FiltreSelect label="Statut" value={filtreStatut} onChange={filtrer(setFiltreStatut)} options={statuts} />
          <FiltreSelect
            label="Plateforme"
            value={filtrePlateforme}
            onChange={filtrer(setFiltrePlateforme)}
            options={plateformes}
          />
          <ChampRecherche
            value={recherche}
            onChange={filtrer(setRecherche)}
            placeholder="Code, réf AO, DA, fournisseur..."
          />
          <CompteurLignes filtrees={formatNombre(filtered.length)} total={formatNombre(aos.length)} />
        </BarreFiltresTableau>

        <TableauColonnes
          colonnes={colonnesAo(
            (a) => ouvrir(a),
            (a) => setLigneASupprimer(a)
          )}
          lignes={visible}
          cleLigne={(a) => a.id}
          exportation={{ nomFichier: 'procurement-ao', titre: 'Journal des AO', lignes: filtered }}
        />

        <Pagination page={page} pageCount={pageCount} onPageChange={setPage} />
      </div>

      <AoSaisieForm
        isOpen={formOuvert}
        onClose={() => setFormOuvert(false)}
        onSubmit={(input) => onEnregistrer(input, ligneEnEdition)}
        ligneInitiale={ligneEnEdition}
        suggestions={{
          plateformes: avecAjouts(plateformes, valeursDe('commun.plateformes')),
          fournisseurs: avecAjouts(fournisseurs, valeursDe('procurement.fournisseurs')),
          situations: avecAjouts(situations, valeursDe('procurement.situations')),
          numerosDa,
        }}
      />

      {ligneASupprimer && (
        <ModaleSuppression
          titre={`Supprimer l'AO « ${ligneASupprimer.refAo ?? ligneASupprimer.code ?? ligneASupprimer.id} »`}
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
