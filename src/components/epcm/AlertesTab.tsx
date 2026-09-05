import { AlertTriangle, CheckCircle2, OctagonAlert } from 'lucide-react'
import { CLASSES_ALERTE } from '../../lib/contratEpcmEngine'
import { EnteteOnglet } from './elements'
import type { AlerteEpcm, NiveauAlerte } from '../../types/contratEpcm'

// Onglet « Alertes » (§9). Les règles vivent dans le moteur
// (`construireAlertes`) : cet écran ne fait que les présenter, triées du plus
// critique au plus calme.

const ICONES: Record<NiveauAlerte, typeof AlertTriangle> = {
  critique: OctagonAlert,
  attention: AlertTriangle,
  ok: CheckCircle2,
}

const LIBELLES: Record<NiveauAlerte, string> = {
  critique: 'Critique',
  attention: 'À surveiller',
  ok: 'Sous contrôle',
}

export function AlertesTab({ alertes }: { alertes: AlerteEpcm[] }) {
  const niveaux: NiveauAlerte[] = ['critique', 'attention', 'ok']
  const compte = (niveau: NiveauAlerte) => alertes.filter((a) => a.niveau === niveau).length

  return (
    <div className="space-y-4">
      <EnteteOnglet
        titre="Alertes"
        aide="Quotas dépassés, seuils de budget (80 %, 90 %, 100 %), rotations incomplètes et anomalies de planning. Elles se recalculent à chaque modification, il n'y a rien à acquitter."
      >
        {niveaux.map((niveau) => {
          const Icone = ICONES[niveau]
          return (
            <span
              key={niveau}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${CLASSES_ALERTE[niveau].carte} ${CLASSES_ALERTE[niveau].texte}`}
            >
              <Icone className="w-3.5 h-3.5" />
              {compte(niveau)} {LIBELLES[niveau].toLowerCase()}
            </span>
          )
        })}
      </EnteteOnglet>

      {alertes.length === 0 ? (
        <div className="bg-green-50 border border-green-200 rounded-2xl px-5 py-8 text-center">
          <CheckCircle2 className="w-8 h-8 text-green-500 mx-auto mb-2" />
          <p className="text-sm text-green-700 font-medium">Aucune alerte — quotas, budget et plannings sont dans les clous.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {alertes.map((alerte) => {
            const styles = CLASSES_ALERTE[alerte.niveau]
            const Icone = ICONES[alerte.niveau]
            return (
              <div key={alerte.id} className={`flex items-start gap-3 rounded-2xl border px-4 py-3 ${styles.carte}`}>
                <Icone className={`w-4 h-4 mt-0.5 shrink-0 ${styles.texte}`} />
                <div className="min-w-0">
                  <p className={`text-sm font-semibold ${styles.texte}`}>{alerte.titre}</p>
                  <p className="text-xs text-gray-600 mt-0.5">{alerte.detail}</p>
                </div>
                <span className="ml-auto text-[10px] font-semibold uppercase tracking-wide text-gray-400 shrink-0">
                  {alerte.categorie.replace('_', ' ')}
                </span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
