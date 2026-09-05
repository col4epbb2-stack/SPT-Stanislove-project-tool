import { useMemo, useState } from 'react'
import { Plus } from 'lucide-react'
import type { ActiviteCourbe, VueCourbe } from '../../types/courbeEnS'
import { VUE_COURBE_DESCRIPTIONS, VUE_COURBE_LABELS, VUE_COURBE_TITRES, VUES_COURBE } from '../../types/courbeEnS'
import { REFERENTIEL_COURBE_EN_S } from '../../data/courbeEnS/referentiel'
import { valeursDistinctes } from '../../lib/saisie'
import { usePagination } from '../../lib/usePagination'
import { Button } from '../ui/Button'
import { Onglets } from '../ui/Onglets'
import { Pagination } from '../ui/Pagination'
import { TableauColonnes } from '../ui/TableauColonnes'
import { BarreFiltresTableau, ChampRecherche, CompteurLignes, FiltreSelect } from '../ui/FiltresTableau'
import { ActiviteSaisieForm } from './ActiviteSaisieForm'
import { colonnesActivites } from './colonnes'
import type { ActivitesParVue, ActiviteSansId } from './useCourbeEnS'

// Onglet « Activités » : les 3 feuilles du classeur pour la fiche projet
// ouverte, une par sous-onglet. C'est ici que se saisit tout ce dont la courbe
// a besoin — les feuilles étaient jusqu'ici en lecture seule alors qu'elles
// sont la seule source du module (le reste n'est que formules).

const PAGE_SIZE = 15

export function ActivitesTab({
  activites,
  semaines,
  nomProjet,
  projetId,
  devise,
  onEnregistrer,
}: {
  activites: ActivitesParVue
  semaines: string[]
  nomProjet: string
  projetId: string
  // Devise de la fiche projet : le classeur ne dit pas dans quelle unité sa
  // colonne « Budget » est comptée (toutes ses cellules sont #ERROR!, cf.
  // CLAUDE.md), donc rien à reprendre de lui. Toute valeur y sera saisie
  // depuis l'app, dans la devise de la fiche qui porte la courbe.
  devise: string
  onEnregistrer: (vue: VueCourbe, input: ActiviteSansId, initiale: ActiviteCourbe | null) => Promise<void>
}) {
  const [vue, setVue] = useState<VueCourbe>('baseline')
  const [filtrePhase, setFiltrePhase] = useState('')
  const [recherche, setRecherche] = useState('')
  const [formOuvert, setFormOuvert] = useState(false)
  const [enEdition, setEnEdition] = useState<ActiviteCourbe | null>(null)

  const lignes = activites[vue]

  const phases = useMemo(() => valeursDistinctes(lignes, 'phase'), [lignes])

  const suggestions = useMemo(
    () => ({
      projets: valeursDistinctes(lignes, 'projet', REFERENTIEL_COURBE_EN_S.projets),
      phases: valeursDistinctes(lignes, 'phase', REFERENTIEL_COURBE_EN_S.phases),
      taches: valeursDistinctes(lignes, 'activite', REFERENTIEL_COURBE_EN_S.taches),
      champs: valeursDistinctes(lignes, 'champ', REFERENTIEL_COURBE_EN_S.champs),
      plateformes: valeursDistinctes(lignes, 'plateforme', REFERENTIEL_COURBE_EN_S.plateformes),
      services: valeursDistinctes(lignes, 'service', REFERENTIEL_COURBE_EN_S.services),
      typesAvis: valeursDistinctes(lignes, 'typeAvis', REFERENTIEL_COURBE_EN_S.typesAvis),
      classifications: valeursDistinctes(lignes, 'classification'),
    }),
    [lignes]
  )

  const filtrees = useMemo(() => {
    const q = recherche.trim().toLowerCase()
    return lignes.filter(
      (a) =>
        (!filtrePhase || a.phase === filtrePhase) &&
        (!q ||
          `${a.activite ?? ''} ${a.phase ?? ''} ${a.service ?? ''} ${a.plateforme ?? ''}`.toLowerCase().includes(q))
    )
  }, [lignes, filtrePhase, recherche])

  const { page, pageCount, visible, setPage, resetPage } = usePagination(filtrees, PAGE_SIZE)

  const filtrer = (setter: (v: string) => void) => (v: string) => {
    setter(v)
    resetPage()
  }

  const colonnes = useMemo(
    () =>
      colonnesActivites({
        toutes: lignes,
        onEditer: (a) => {
          setEnEdition(a)
          setFormOuvert(true)
        },
      }),
    [lignes]
  )

  const prochainOrdre = lignes.reduce((max, a) => Math.max(max, a.ordre), 0) + 1
  // Le nom porté par les activités déjà rattachées prime sur celui de la
  // fiche : une nouvelle activité doit rejoindre le même projet du classeur,
  // sinon elle formerait une seconde courbe à côté.
  const projetParDefaut = lignes[0]?.projet ?? activites.baseline[0]?.projet ?? nomProjet

  return (
    <div className="space-y-3">
      <Onglets
        ariaLabel="Feuilles d'activités"
        onglets={VUES_COURBE.map((v) => ({
          key: v,
          label: VUE_COURBE_LABELS[v],
          compteur: activites[v].length,
        }))}
        actif={vue}
        onChange={(v) => {
          setVue(v)
          resetPage()
        }}
      />

      <p className="text-xs text-gray-500">
        <span className="font-semibold text-gray-700">{VUE_COURBE_TITRES[vue]}</span> — {VUE_COURBE_DESCRIPTIONS[vue]}
      </p>

      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
        <BarreFiltresTableau>
          <Button
            type="button"
            size="sm"
            onClick={() => {
              setEnEdition(null)
              setFormOuvert(true)
            }}
            className="gap-1.5"
          >
            <Plus className="w-4 h-4" />
            Nouvelle activité
          </Button>
          <FiltreSelect
            label="Phase"
            value={filtrePhase}
            onChange={filtrer(setFiltrePhase)}
            options={phases}
            libelleTous="Toutes les phases"
          />
          <ChampRecherche value={recherche} onChange={filtrer(setRecherche)} placeholder="Activité, service…" />
          <CompteurLignes filtrees={String(filtrees.length)} total={String(lignes.length)} suffixe=" · activités" />
        </BarreFiltresTableau>

        <TableauColonnes
          colonnes={colonnes}
          lignes={visible}
          cleLigne={(a) => a.id}
          messageVide={`Aucune activité dans la feuille ${VUE_COURBE_LABELS[vue]} pour ce projet.`}
          exportation={{
            nomFichier: `courbe-en-s-activites-${vue}`,
            titre: `${nomProjet} — ${VUE_COURBE_TITRES[vue]}`,
            sousTitre: `${filtrees.length} activité(s)`,
            lignes: filtrees,
          }}
        />
        {pageCount > 1 && (
          <Pagination
            page={page}
            pageCount={pageCount}
            onPageChange={setPage}
            total={filtrees.length}
            itemLabel="activités"
          />
        )}
      </div>

      <ActiviteSaisieForm
        devise={devise}
        isOpen={formOuvert}
        onClose={() => setFormOuvert(false)}
        onSubmit={(input) => onEnregistrer(vue, input, enEdition)}
        vue={vue}
        suggestions={suggestions}
        semaines={semaines}
        activiteInitiale={enEdition}
        prochainOrdre={prochainOrdre}
        toutes={lignes}
        projetParDefaut={projetParDefaut}
        projetId={projetId}
      />
    </div>
  )
}
