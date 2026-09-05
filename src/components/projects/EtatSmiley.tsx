import { ETAT_COLORS, ETAT_LABELS, ETAT_SMILEYS } from '../../types/project'
import type { EtatGlobal } from '../../types/project'

// Pastille de santé projet : le smiley porte la couleur, le libellé complet
// reste dans le title/aria-label — un emoji seul ne dit rien à un lecteur
// d'écran, et « 🙂 » n'est pas plus explicite que « Vert » hors contexte.
// Écrit pour la liste des projets (11/08/2026), remonté ici dès son second
// usage (page HSE) plutôt que recopié.
export function EtatSmiley({ etat }: { etat: EtatGlobal }) {
  const colors = ETAT_COLORS[etat]
  return (
    <span
      title={ETAT_LABELS[etat]}
      aria-label={ETAT_LABELS[etat]}
      role="img"
      className={`inline-flex items-center justify-center w-8 h-8 rounded-full text-lg leading-none ${colors.bg}`}
    >
      {ETAT_SMILEYS[etat]}
    </span>
  )
}
