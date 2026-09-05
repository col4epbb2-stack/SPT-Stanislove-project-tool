import { CircleAlert, CircleCheck, CircleX, Flag } from 'lucide-react'
import type { EtatIndicateur } from '../../types/feuilleDeRoute'
import { definitionEtat, etatIndicateur } from '../../types/feuilleDeRoute'

// Repère visuel des deux indicateurs du classeur — FLAG et RECEPTION SCOPES
// (21/08/2026 : « il est important de conserver les mêmes indicateurs visuels
// que ceux utilisés dans le fichier Excel »).
//
// **23/08/2026, demande explicite** : les deux indicateurs quittent la
// pastille 🟢/🟠/🔴 du classeur pour des icônes qui disent **ce qu'elles
// mesurent**, aux trois mêmes couleurs.
//  - FLAG : un drapeau, dans les trois couleurs (« concernant le flag je veux
//    avoir un drapeau au lieu d'avoir une boule »).
//  - RECEPTION SCOPES : une icône **par état** (« avec check dans cercle », « en
//    rouge un indicateur différent, en orange avec un point d'exclamation ») —
//    check, point d'exclamation, croix. La couleur seule ne se lit pas en
//    niveaux de gris, ni pour un daltonien : la forme la redouble.
// Écart assumé avec le fichier Excel : la règle « conserver les indicateurs
// visuels du classeur » (21/08/2026) portait sur la **couleur**, qui est
// conservée ; deux pastilles identiques dans la même ligne ne disaient pas
// laquelle parlait du délai et laquelle de la réception.
//
// Dans un fichier à part, et non dans `colonnes.tsx` : un module qui exporte
// des composants **et** des constantes casse le rafraîchissement à chaud de
// Vite (même raison que `ui/tonsKpi.ts`), et `colonnes.tsx` n'exporte que des
// définitions.
//
// Le repère est doublé d'un libellé en infobulle et d'un `aria-label` : un
// drapeau (ou un rond) coloré seul ne se lit pas au lecteur d'écran, et ne dit
// pas la valeur numérique que la ligne continue de porter.

// Une icône par état pour la réception des scopes. Non exportée : un module
// qui exporte composants **et** constantes casse le rafraîchissement à chaud
// de Vite (cf. `ui/tonsKpi.ts`).
const ICONES_SCOPES = {
  vert: CircleCheck,
  orange: CircleAlert,
  rouge: CircleX,
} satisfies Record<EtatIndicateur, typeof CircleCheck>

export function PastilleIndicateur({ valeur, quoi }: { valeur: number | null; quoi: 'flag' | 'scopes' }) {
  const etat = etatIndicateur(valeur)
  if (!etat) return <span className="text-gray-300">—</span>
  const definition = definitionEtat(etat)
  const libelle = quoi === 'flag' ? definition.flag : definition.scopes
  const titre = `${libelle} (${valeur} %)`
  const IconeScope = ICONES_SCOPES[etat]

  return (
    <span className={`inline-flex ${definition.couleur}`} title={titre} aria-label={libelle} role="img">
      {/* Rempli, et pas seulement tracé : à 16 px, une icône en contour se
          confond avec les autres icônes grises de la ligne.
          Pour les icônes de scope, `fill="currentColor"` ne suffit pas — il
          remplirait aussi le glyphe (un `<path>`/`<line>` tracé), qui
          deviendrait invisible sur un cercle de la même couleur. On remplit
          donc le seul `<circle>` et on met le glyphe en réserve (blanc). */}
      {quoi === 'flag' ? (
        <Flag className="w-4 h-4" fill="currentColor" strokeWidth={1.75} />
      ) : (
        <IconeScope
          className="w-4 h-4 [&>circle]:fill-current [&>path]:stroke-white [&>line]:stroke-white"
          strokeWidth={2.5}
        />
      )}
    </span>
  )
}
