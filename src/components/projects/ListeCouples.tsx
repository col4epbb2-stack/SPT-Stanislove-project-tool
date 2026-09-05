import { useState } from 'react'
import { AlertTriangle, Check, Pencil, Plus, Trash2, X, type LucideIcon } from 'lucide-react'
import { Button } from '../ui/Button'
import { ORIGINE_TEXTE_LIBRE } from '../../types/project'

// Liste de couples de textes liés l'un à l'autre — un élément et ce qui le
// traite : **risque / mitigation** et **opportunité / gain attendu**
// (23/08/2026, demandes successives : « pour un risque on doit avoir les
// mitigations associées dans un bloc, on pourra ajouter autant de fois que
// possible », puis « on fera de même » pour les opportunités).
//
// Ce que ces deux sections remplacent : deux textes libres côte à côte, où
// rien ne disait quelle mesure traitait quel risque ni quel gain venait de
// quelle opportunité — une analyse à cinq entrées tenait dans deux paragraphes
// qu'il fallait lire en parallèle.
//
// Un seul composant pour les deux : ils ne diffèrent que par leurs libellés,
// leur icône et le ton du bloc associé. Les **types métier restent distincts**
// (`RisqueProjet`, `OpportuniteProjet`) — un document Firestore portant
// `{ principal, associe }` ne se relirait pas ; ce sont les deux fines
// enveloppes `RisquesProjet` / `OpportunitesProjet` qui font la traduction.

const textareaClass =
  'w-full px-3 py-2 rounded-lg border border-gray-200 bg-gray-50 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary'

/** Une entrée, dans la forme neutre que manipule ce composant. */
export interface CoupleTexte {
  id: string
  principal: string
  associe: string
}

export interface LibellesCouples {
  titre: string
  /** Nom d'une entrée au singulier, pour les boutons et les intitulés de carte. */
  entree: string
  labelPrincipal: string
  aidePrincipal: string
  labelAssocie: string
  aideAssocie: string
  /** Ce que dit le bandeau quand l'associé manque (« Mitigation à définir »…). */
  manquant: string
  /** Badge en tête de section : « n sans mitigation », « n sans gain chiffré ». */
  badgeManquant: (n: number) => string
  /** Icône du bloc associé quand il est renseigné. */
  icone: LucideIcon
}

function CarteCouple({
  entree,
  index,
  libelles,
  onEnregistrer,
  onSupprimer,
}: {
  entree: CoupleTexte
  index: number
  libelles: LibellesCouples
  onEnregistrer: (modifie: CoupleTexte) => void
  onSupprimer: () => void
}) {
  // Une entrée neuve s'ouvre directement en saisie : l'ajouter puis devoir
  // cliquer « Modifier » pour la remplir serait un geste de trop.
  const [edition, setEdition] = useState(entree.principal === '' && entree.associe === '')
  const [principal, setPrincipal] = useState(entree.principal)
  const [associe, setAssocie] = useState(entree.associe)

  const ouvrir = () => {
    // Repris de la fiche à l'ouverture, pas à la frappe : un brouillon resté en
    // mémoire ne doit pas écraser une modification faite entre-temps.
    setPrincipal(entree.principal)
    setAssocie(entree.associe)
    setEdition(true)
  }

  const enregistrer = () => {
    onEnregistrer({ ...entree, principal: principal.trim(), associe: associe.trim() })
    setEdition(false)
  }

  const annuler = () => {
    // Une entrée jamais remplie disparaît à l'annulation : la garder laisserait
    // une carte vide dans la liste.
    if (entree.principal === '' && entree.associe === '') onSupprimer()
    else setEdition(false)
  }

  const titreCarte = `${libelles.entree} ${index + 1}`
  const Icone = libelles.icone

  return (
    <div className="rounded-xl border border-gray-100 px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-semibold text-gray-900">{titreCarte}</p>
        <div className="flex items-center gap-2 shrink-0">
          {!edition && (
            <button
              onClick={ouvrir}
              title={`Modifier — ${titreCarte}`}
              className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
            >
              <Pencil className="w-3.5 h-3.5" />
              Modifier
            </button>
          )}
          <button
            onClick={onSupprimer}
            title={`Supprimer — ${titreCarte}`}
            aria-label={`Supprimer ${titreCarte}`}
            className="p-1 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {entree.id === ORIGINE_TEXTE_LIBRE && !edition && (
        // Dit d'où vient cette entrée : elle porte en bloc les deux textes
        // libres — ceux du modèle précédent, et ceux que le formulaire de
        // création demande encore aujourd'hui —, souvent plusieurs éléments à
        // la fois.
        <p className="mt-1.5 text-xs text-amber-600">
          Repris de la saisie en texte libre — à découper en un bloc par {libelles.entree.toLowerCase()}.
        </p>
      )}

      {edition ? (
        <div className="mt-2 space-y-3">
          {[
            {
              label: libelles.labelPrincipal,
              aide: libelles.aidePrincipal,
              valeur: principal,
              setter: setPrincipal,
              focus: true,
            },
            { label: libelles.labelAssocie, aide: libelles.aideAssocie, valeur: associe, setter: setAssocie, focus: false },
          ].map((champ) => (
            <div key={champ.label} className="space-y-1.5">
              <label className="block text-xs font-semibold uppercase tracking-wide text-gray-400">
                {champ.label}
              </label>
              <p className="text-xs text-primary bg-primary/5 border border-primary/15 rounded-lg px-2.5 py-1.5">
                {champ.aide}
              </p>
              <textarea
                className={`${textareaClass} min-h-16`}
                value={champ.valeur}
                autoFocus={champ.focus}
                onChange={(e) => champ.setter(e.target.value)}
                // Échap ferme sans enregistrer : le geste attendu d'une édition
                // en place, et le seul moyen d'abandonner sans viser un bouton.
                onKeyDown={(e) => {
                  if (e.key === 'Escape') annuler()
                }}
              />
            </div>
          ))}
          <div className="flex items-center justify-end gap-2">
            <Button type="button" variant="ghost" onClick={annuler}>
              <X className="w-4 h-4 mr-1.5" />
              Annuler
            </Button>
            {/* Une entrée sans son associé s'enregistre : c'est l'état normal
                d'un début d'analyse, signalé et non bloqué (même règle que le
                point bloquant d'une phase, cf. SuiviPhaseForm). */}
            <Button type="button" onClick={enregistrer} disabled={principal.trim() === ''}>
              <Check className="w-4 h-4 mr-1.5" />
              Enregistrer
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-2 space-y-2">
          {/* `whitespace-pre-line` : ces textes se rédigent parfois en plusieurs
              lignes, les aplatir les rendrait illisibles. */}
          <p className="text-sm text-gray-800 whitespace-pre-line">{entree.principal || '—'}</p>
          {entree.associe ? (
            <div className="flex items-start gap-2 rounded-lg bg-emerald-50/60 px-3 py-2">
              <Icone className="w-4 h-4 mt-0.5 shrink-0 text-emerald-600" />
              <p className="text-sm text-gray-700 whitespace-pre-line">{entree.associe}</p>
            </div>
          ) : (
            <div className="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2">
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0 text-amber-600" />
              <p className="text-sm text-amber-700">
                {libelles.manquant} — <span className="text-amber-600/80">{libelles.aideAssocie}</span>
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export function ListeCouples({
  libelles,
  entrees,
  manquants,
  onChange,
}: {
  libelles: LibellesCouples
  entrees: CoupleTexte[]
  /** Entrées dont l'associé manque — compté par le module métier appelant. */
  manquants: number
  onChange: (entrees: CoupleTexte[]) => void
}) {
  return (
    <div className="rounded-xl border border-gray-100 px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-semibold text-gray-900">{libelles.titre}</p>
          <span className="px-1.5 py-0.5 rounded-full bg-gray-100 text-[11px] font-semibold text-gray-500 tabular-nums">
            {entrees.length}
          </span>
          {manquants > 0 && (
            <span className="px-2 py-0.5 rounded-full bg-amber-100 text-[11px] font-semibold text-amber-700">
              {libelles.badgeManquant(manquants)}
            </span>
          )}
        </div>
        <button
          onClick={() => onChange([...entrees, { id: crypto.randomUUID(), principal: '', associe: '' }])}
          className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
        >
          <Plus className="w-3.5 h-3.5" />
          Ajouter — {libelles.entree.toLowerCase()}
        </button>
      </div>

      {entrees.length === 0 ? (
        <p className="mt-2 text-sm text-gray-400">
          Rien de renseigné — <span className="text-gray-500">{libelles.aidePrincipal}</span>
        </p>
      ) : (
        <div className="mt-3 space-y-3">
          {entrees.map((entree, index) => (
            <CarteCouple
              // La clé porte l'identifiant : réutiliser l'index remonterait
              // l'état de saisie d'une carte sur sa voisine après suppression.
              key={entree.id}
              entree={entree}
              index={index}
              libelles={libelles}
              onEnregistrer={(modifie) => onChange(entrees.map((e) => (e.id === entree.id ? modifie : e)))}
              onSupprimer={() => onChange(entrees.filter((e) => e.id !== entree.id))}
            />
          ))}
        </div>
      )}
    </div>
  )
}
