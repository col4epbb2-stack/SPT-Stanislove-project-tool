import { useState } from 'react'
import { AlertTriangle, ChevronDown, X } from 'lucide-react'
import { oublierIncident, useIncidents, type Incident } from '../../lib/incidents'

// Bandeau des échecs Firestore, affiché une seule fois par la coque de
// l'application (DashboardLayout). Il ne bloque rien : l'écran reste
// utilisable, il cesse simplement de faire passer une panne pour une absence
// de données.
//
// Deux messages distincts, parce que les deux situations n'appellent pas la
// même réaction : un chargement qui échoue affiche des données incomplètes,
// une écriture qui échoue veut dire que ce que l'utilisateur vient de faire
// n'est PAS enregistré — c'est le cas le plus grave, il passe en tête.

function texte(incident: Incident): string {
  return incident.type === 'ecriture'
    ? `${incident.quoi} n'a pas été enregistré.`
    : `${incident.quoi} n'a pas pu être chargé.`
}

function conseil(incident: Incident): string {
  return incident.type === 'ecriture'
    ? "Votre modification est affichée mais absente de la base : refaites-la après avoir rechargé la page. Si l'erreur revient, les droits d'écriture sur cette collection sont probablement en cause."
    : "L'écran est donc incomplet — ce n'est pas forcément qu'il n'y a rien à afficher. Rechargez la page ; si l'erreur revient, vérifiez vos droits d'accès et votre connexion."
}

export function BandeauIncidents() {
  const incidents = useIncidents()
  const [deplie, setDeplie] = useState<string | null>(null)

  if (incidents.length === 0) return null

  const tries = [...incidents].sort((a, b) => (a.type === b.type ? 0 : a.type === 'ecriture' ? -1 : 1))

  return (
    <div role="alert" className="flex flex-col gap-2 px-6 pt-4">
      {tries.map((incident) => {
        const ouvert = deplie === incident.id
        return (
          <div
            key={incident.id}
            className={`rounded-xl border px-4 py-3 text-sm ${
              incident.type === 'ecriture'
                ? 'border-red-200 bg-red-50 text-red-900'
                : 'border-amber-200 bg-amber-50 text-amber-900'
            }`}
          >
            <div className="flex items-start gap-2.5">
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="font-semibold">{texte(incident)}</p>
                <p className="text-xs mt-0.5 opacity-80">{conseil(incident)}</p>
                <button
                  type="button"
                  onClick={() => setDeplie(ouvert ? null : incident.id)}
                  aria-expanded={ouvert}
                  className="inline-flex items-center gap-1 text-xs font-medium mt-1.5 underline underline-offset-2"
                >
                  Détail technique
                  <ChevronDown className={`w-3 h-3 transition-transform ${ouvert ? 'rotate-180' : ''}`} />
                </button>
                {ouvert && (
                  <p className="mt-1.5 text-xs font-mono break-words opacity-80">{incident.detail}</p>
                )}
              </div>
              <button
                type="button"
                onClick={() => oublierIncident(incident.id)}
                title="Masquer ce message"
                className="p-1 rounded-lg hover:bg-black/5 shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        )
      })}
    </div>
  )
}
