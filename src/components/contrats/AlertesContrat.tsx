import { AlertTriangle, Info } from 'lucide-react'
import { alertesContrat, type AlerteContrat, type ContratPourAlertes } from '../../lib/alertesContrat'
import { aujourdHui } from '../../lib/saisie'
import type { Facture } from '../../types/project'

/**
 * Alertes d'un contrat (`doc/module contrat.docx`, « alertes et historique de
 * gestion »).
 *
 * Affichées **sans qu'il faille déplier le contrat** : une alerte qu'on ne
 * voit qu'en ouvrant la fiche concernée ne sert à rien — c'est justement pour
 * ne pas avoir à toutes les ouvrir qu'elle existe.
 *
 * Les règles et leurs seuils vivent dans `lib/alertesContrat.ts` : le document
 * demande des alertes sans dire lesquelles, et ce sont des **valeurs à
 * confirmer**.
 */
export function AlertesContrat({ contrat, factures }: { contrat: ContratPourAlertes; factures: Facture[] }) {
  const alertes = alertesContrat(contrat, factures, aujourdHui())
  if (alertes.length === 0) return null
  return (
    <div className="flex flex-wrap gap-1.5">
      {alertes.map((a) => (
        <PastilleAlerte key={a.id} alerte={a} />
      ))}
    </div>
  )
}

function PastilleAlerte({ alerte }: { alerte: AlerteContrat }) {
  const critique = alerte.niveau === 'critique'
  const Icone = critique ? AlertTriangle : Info
  return (
    <span
      // Le détail est en infobulle et en `aria-label` : la pastille reste
      // courte pour tenir dans l'en-tête, sans perdre ce qu'elle explique.
      title={alerte.detail}
      aria-label={`${alerte.titre} — ${alerte.detail}`}
      className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${
        critique ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'
      }`}
    >
      <Icone className="w-3 h-3 shrink-0" aria-hidden />
      {alerte.titre}
    </span>
  )
}
