import { useState } from 'react'
import { Check, Pencil, X } from 'lucide-react'
import { Button } from '../ui/Button'
import { useProjects } from '../../contexts/useProjects'
import type { PresentationProjetInput } from '../../contexts/projects-context'
import type { Projet } from '../../types/project'
import { RisquesProjet } from './RisquesProjet'
import { OpportunitesProjet } from './OpportunitesProjet'

const textareaClass =
  'w-full px-3 py-2 rounded-lg border border-gray-200 bg-gray-50 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary'

/** Un champ = sa clé sur la fiche, son titre et l'aide qui dit quoi y écrire. */
interface ChampPresentation {
  cle: keyof PresentationProjetInput
  titre: string
  aide: string
  hauteur: string
}

const CHAMPS_PRESENTATION: ChampPresentation[] = [
  {
    cle: 'contexte',
    titre: 'Contexte',
    aide: "La situation qui a déclenché le projet et ce qu'il doit résoudre.",
    hauteur: 'min-h-24',
  },
]

function BlocPresentation({ projet, champ }: { projet: Projet; champ: ChampPresentation }) {
  const { definirPresentationProjet } = useProjects()
  const valeur = (projet[champ.cle] ?? '') as string
  const [edition, setEdition] = useState(false)
  const [saisie, setSaisie] = useState(valeur)

  const ouvrir = () => {
    setSaisie(valeur)
    setEdition(true)
  }

  const enregistrer = () => {
    const texte = saisie.trim()
    if (texte !== valeur) definirPresentationProjet(projet.id, { [champ.cle]: texte })
    setEdition(false)
  }

  return (
    <div className="rounded-xl border border-gray-100 px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-semibold text-gray-900">{champ.titre}</p>
        {!edition && (
          <button
            onClick={ouvrir}
            title={`Modifier « ${champ.titre} »`}
            aria-label={`Modifier ${champ.titre}`}
            className="shrink-0 inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
          >
            <Pencil className="w-3.5 h-3.5" />
            Modifier
          </button>
        )}
      </div>

      {edition ? (
        <div className="mt-2 space-y-2">
          <p className="text-xs text-primary bg-primary/5 border border-primary/15 rounded-lg px-2.5 py-1.5">
            {champ.aide}
          </p>
          <textarea
            className={`${textareaClass} ${champ.hauteur}`}
            value={saisie}
            autoFocus
            onChange={(e) => setSaisie(e.target.value)}
            // Échap ferme sans enregistrer : le geste attendu d'une édition en
            // place, et le seul moyen d'abandonner sans viser un bouton.
            onKeyDown={(e) => {
              if (e.key === 'Escape') setEdition(false)
            }}
          />
          <div className="flex items-center justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setEdition(false)}>
              <X className="w-4 h-4 mr-1.5" />
              Annuler
            </Button>
            <Button type="button" onClick={enregistrer}>
              <Check className="w-4 h-4 mr-1.5" />
              Enregistrer
            </Button>
          </div>
        </div>
      ) : valeur ? (
        // `whitespace-pre-line` : ces textes sont saisis en plusieurs lignes
        // (une par risque, une par mesure) — les aplatir en un paragraphe les
        // rendrait illisibles.
        <p className="mt-1 text-sm text-gray-800 whitespace-pre-line">{valeur}</p>
      ) : (
        // Une absence est dite comme telle, avec l'aide : c'est le moment où
        // elle sert le plus.
        <p className="mt-1 text-sm text-gray-400">
          Non renseigné — <span className="text-gray-500">{champ.aide}</span>
        </p>
      )}
    </div>
  )
}

export function PresentationProjet({ projet }: { projet: Projet }) {
  return (
    <div className="space-y-3">
      {CHAMPS_PRESENTATION.map((champ) => (
        <BlocPresentation key={champ.cle} projet={projet} champ={champ} />
      ))}
      {/* Le contexte d'abord, ce qui menace le projet ensuite, ce qu'il peut
          rapporter après — l'ordre des textes qu'ils remplacent. */}
      <RisquesProjet projet={projet} />
      <OpportunitesProjet projet={projet} />
    </div>
  )
}
