import { useMemo, useState } from 'react'
import { Plus } from 'lucide-react'
import type { ArticleSurveillance, ProcurementCharts } from '../../types/procurementFollowUp'
import {
  histoMoisVersHisto,
  repartitionArticles,
  syntheseSurveillance,
} from '../../lib/procurementFollowUpEngine'
import { formatNombre, formatPercent } from '../../lib/format'
import { usePagination } from '../../lib/usePagination'
import { avecAjouts, valeursDistinctes } from '../../lib/saisie'
import { useListesValeurs } from '../../contexts/useListesValeurs'
import { Button } from '../ui/Button'
import { Pagination } from '../ui/Pagination'
import { TableauColonnes } from '../ui/TableauColonnes'
import { BarreFiltresTableau, ChampRecherche, CompteurLignes, FiltreSelect } from '../ui/FiltresTableau'
import { ModaleSuppression } from '../ui/ModaleSuppression'
import { HistoDureeChart, JaugesChart, RecuChart, StatCard } from './elements'
import { colonnesSurveillance } from './colonnes'
import { SurveillanceSaisieForm, type SurveillanceSaisieInput } from './formulaires'

// Onglet "Surveillance" (1 612 articles) — extrait de
// pages/ProcurementFollowUpPage.tsx le 06/08/2026 et doté de son point de
// saisie. Les compteurs de tête (syntheseSurveillance) sont déjà recalculés
// depuis les articles : ils suivent donc les saisies sans rien changer.

const PAGE_SIZE = 20

export function SurveillanceTab({
  articles,
  charts,
  onEnregistrer,
  onSupprimer,
}: {
  articles: ArticleSurveillance[]
  charts: ProcurementCharts
  onEnregistrer: (input: SurveillanceSaisieInput, initiale: ArticleSurveillance | null) => Promise<void>
  onSupprimer: (a: ArticleSurveillance) => Promise<void>
}) {
  const [filtreScope, setFiltreScope] = useState('')
  const [filtreStatut, setFiltreStatut] = useState('')
  const [filtreTransit, setFiltreTransit] = useState('')
  const [recherche, setRecherche] = useState('')
  const [formOuvert, setFormOuvert] = useState(false)
  const [ligneEnEdition, setLigneEnEdition] = useState<ArticleSurveillance | null>(null)
  const [ligneASupprimer, setLigneASupprimer] = useState<ArticleSurveillance | null>(null)

  const synthese = useMemo(() => syntheseSurveillance(articles), [articles])
  const parRisque = useMemo(() => repartitionArticles(articles, (a) => a.niveauRisque), [articles])

  const { valeursDe } = useListesValeurs()
  const scopes = useMemo(() => valeursDistinctes(articles, 'scope'), [articles])
  const statuts = useMemo(() => valeursDistinctes(articles, 'statut'), [articles])
  const transits = useMemo(() => valeursDistinctes(articles, 'typeTransit'), [articles])
  const numerosPo = useMemo(() => valeursDistinctes(articles, 'numeroPo'), [articles])
  const niveauxRisque = useMemo(() => valeursDistinctes(articles, 'niveauRisque'), [articles])
  const levelsInspection = useMemo(() => valeursDistinctes(articles, 'levelInspection'), [articles])
  const typesInspection = useMemo(() => valeursDistinctes(articles, 'typeInspection'), [articles])
  const lieuxMad = useMemo(() => valeursDistinctes(articles, 'madLieu'), [articles])

  const filtered = useMemo(() => {
    const q = recherche.trim().toLowerCase()
    return articles.filter(
      (a) =>
        (!filtreScope || a.scope === filtreScope) &&
        (!filtreStatut || a.statut === filtreStatut) &&
        (!filtreTransit || a.typeTransit === filtreTransit) &&
        (!q ||
          `${a.numeroPo ?? ''} ${a.designation ?? ''} ${a.numero ?? ''} ${a.madLieu ?? ''}`.toLowerCase().includes(q))
    )
  }, [articles, filtreScope, filtreStatut, filtreTransit, recherche])

  const { page, pageCount, visible, setPage, resetPage } = usePagination(filtered, PAGE_SIZE)

  const filtrer = (setter: (v: string) => void) => (v: string) => {
    setter(v)
    resetPage()
  }

  const ouvrir = (ligne: ArticleSurveillance | null) => {
    setLigneEnEdition(ligne)
    setFormOuvert(true)
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <StatCard
          label="Articles sous surveillance"
          value={formatNombre(synthese.total)}
          detail={`${formatNombre(synthese.inProgress)} in progress · ${formatNombre(synthese.closed)} closed`}
        />
        <StatCard label="Avancement fabrication moyen" value={formatPercent(synthese.avancementMoyen)} />
        <StatCard
          label="Avis de MAD émis"
          value={formatNombre(synthese.avisMadOui)}
          detail={formatPercent(synthese.avisMadOui / synthese.total)}
        />
        <StatCard
          label="Livrés magasin"
          value={formatNombre(synthese.livresMagasin)}
          detail={formatPercent(synthese.livresMagasin / synthese.total)}
        />
        <div className="bg-white rounded-2xl border border-gray-200 p-5">
          <p className="text-sm text-gray-500 mb-2">Niveaux de risque</p>
          <div className="space-y-1 text-xs text-gray-600">
            {parRisque.slice(0, 4).map((r) => (
              <div key={r.libelle} className="flex justify-between gap-2">
                <span className="truncate">{r.libelle}</span>
                <span className="font-medium text-gray-900">{formatNombre(r.nombre)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
        <JaugesChart titre="Jauges du dashboard (figées au classeur)" jauges={charts.surveillance.jauges} />
        <RecuChart
          lignes={[
            { libelle: 'ETA LBV', recu: charts.surveillance.etaLbv.recu, nonRecu: charts.surveillance.etaLbv.nonRecu },
            { libelle: 'ETA POG', recu: charts.surveillance.etaPog.recu, nonRecu: charts.surveillance.etaPog.nonRecu },
          ]}
        />
      </div>

      <HistoDureeChart
        titre="Avis de MAD réelle (= EXW réel) — durée par PO"
        data={histoMoisVersHisto(charts.surveillance.histoMadReelle)}
        limite={charts.surveillance.limiteJours}
      />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <HistoDureeChart
          titre="ETA maritime — durée par PO"
          data={histoMoisVersHisto(charts.surveillance.histoEtaMaritime)}
          limite={charts.surveillance.limiteJours}
        />
        <HistoDureeChart
          titre="ETA aérien — durée par PO"
          data={histoMoisVersHisto(charts.surveillance.histoEtaAerien)}
          limite={charts.surveillance.limiteJours}
        />
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
        <BarreFiltresTableau>
          <Button type="button" size="sm" onClick={() => ouvrir(null)} className="gap-1.5">
            <Plus className="w-4 h-4" />
            Nouvel article
          </Button>
          <FiltreSelect label="Scope" value={filtreScope} onChange={filtrer(setFiltreScope)} options={scopes} />
          <FiltreSelect label="Statut" value={filtreStatut} onChange={filtrer(setFiltreStatut)} options={statuts} />
          <FiltreSelect
            label="Type de transit"
            value={filtreTransit}
            onChange={filtrer(setFiltreTransit)}
            options={transits}
          />
          <ChampRecherche
            value={recherche}
            onChange={filtrer(setRecherche)}
            placeholder="PO, désignation, n°, lieu MAD..."
          />
          <CompteurLignes filtrees={formatNombre(filtered.length)} total={formatNombre(articles.length)} />
        </BarreFiltresTableau>

        <TableauColonnes
          colonnes={colonnesSurveillance(
            (a) => ouvrir(a),
            (a) => setLigneASupprimer(a)
          )}
          lignes={visible}
          cleLigne={(a) => a.id}
          messageVide="Aucun article ne correspond aux filtres."
          exportation={{ nomFichier: 'procurement-surveillance', titre: 'Surveillance des commandes', lignes: filtered }}
        />

        <Pagination page={page} pageCount={pageCount} onPageChange={setPage} />
      </div>

      <SurveillanceSaisieForm
        isOpen={formOuvert}
        onClose={() => setFormOuvert(false)}
        onSubmit={(input) => onEnregistrer(input, ligneEnEdition)}
        ligneInitiale={ligneEnEdition}
        suggestions={{
          scopes: avecAjouts(scopes, valeursDe('procurement.scopes')),
          numerosPo,
          niveauxRisque: avecAjouts(niveauxRisque, valeursDe('procurement.niveauxRisque')),
          levelsInspection: avecAjouts(levelsInspection, valeursDe('procurement.levelsInspection')),
          typesInspection: avecAjouts(typesInspection, valeursDe('procurement.typesInspection')),
          lieuxMad: avecAjouts(lieuxMad, valeursDe('procurement.lieuxMad')),
          typesTransit: avecAjouts(transits, valeursDe('procurement.typesTransit')),
        }}
      />

      {ligneASupprimer && (
        <ModaleSuppression
          titre={`Supprimer l'article « ${ligneASupprimer.designation ?? ligneASupprimer.numero ?? ligneASupprimer.id} »`}
          message="Cette saisie sera supprimée définitivement."
          avertissements={[
            'Si cette ligne provenait de la surveillance importée, elle réapparaîtra avec ses valeurs d\'origine — seule la saisie est retirée. Sinon, elle disparaît du tableau.',
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
