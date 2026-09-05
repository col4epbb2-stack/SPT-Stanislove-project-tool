import { useMemo } from 'react'
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { AFFECTATIONS, courbeDuMois, etatDuJour, tauxEquipe, type SyntheseEmployeEpcm, type SyntheseFinanciereEpcm } from '../../lib/contratEpcmEngine'
import type { SyntheseHseEpcm } from '../../lib/contratEpcmEngine'
import { formatNombre, formatPercent } from '../../lib/format'
import { EnteteOnglet, LegendeAffectations, MessageVide, SelecteurMois, StatCard } from './elements'
import type { EmployeEpcm, PlanningMoisEpcm, TypeAffectation } from '../../types/contratEpcm'
import { useMontant } from '../../lib/montantAffiche'
import type { CodeDevise } from '../../types/devise'

// Onglet « Tableau de bord » (§10) : l'état des effectifs à une date donnée,
// les taux du mois et la consommation du budget. Tout y est dérivé — aucune
// valeur n'est saisie sur cet écran.

const COULEURS_SERIE: Record<string, string> = {
  Site: '#3730a3',
  Bureau: '#3b82f6',
  Rotation: '#7c3aed',
  Congé: '#22c55e',
  Absent: '#ef4444',
}

export function TableauDeBordTab({
  deviseAffichage,
  employes,
  plannings,
  mois,
  onChangerMois,
  dateArrete,
  onChangerDate,
  syntheses,
  finance,
  hse,
}: {
  /** Devise d'affichage du module (rev01, point 7) — `null` = celle du système. */
  deviseAffichage: CodeDevise | null
  employes: EmployeEpcm[]
  plannings: PlanningMoisEpcm[]
  mois: string
  onChangerMois: (mois: string) => void
  dateArrete: string
  onChangerDate: (date: string) => void
  syntheses: SyntheseEmployeEpcm[]
  finance: SyntheseFinanciereEpcm
  /** Synthèse HSE du mois (§1 : le tableau de bord intègre les indicateurs HSE). */
  hse: SyntheseHseEpcm
}) {
  const etat = useMemo(() => etatDuJour(employes, plannings, dateArrete), [employes, plannings, dateArrete])
  const courbe = useMemo(() => courbeDuMois(employes, plannings, mois), [employes, plannings, mois])
  const taux = useMemo(() => tauxEquipe(syntheses, mois), [syntheses, mois])
  // Les montants du module s'affichent dans SA devise d'affichage (rev01,
  // point 7) ; ils restent enregistrés dans celle du contrat.
  const { montant: formatMontant } = useMontant(deviseAffichage)
  const montant = (v: number) => formatMontant(v, finance.devise)

  if (employes.length === 0) {
    return <MessageVide>Le tableau de bord se remplit dès qu'un employé est enregistré dans l'onglet Personnel.</MessageVide>
  }

  return (
    <div className="space-y-4">
      <EnteteOnglet
        titre="Tableau de bord"
        aide={`Effectifs au ${dateArrete}, taux et budget du mois affiché. Les jours travaillés retiennent le pointage quand il existe, le planning sinon.`}
      >
        <input
          type="date"
          value={dateArrete}
          onChange={(e) => onChangerDate(e.target.value)}
          className="px-3 py-2 rounded-lg border border-gray-200 bg-gray-50 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
        />
        <SelecteurMois mois={mois} onChange={onChangerMois} />
      </EnteteOnglet>

      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-4">
        {/* La rotation est comptée dans « sur site » (rev01) ; le détail reste
            dit ici, sans quoi on ne saurait plus qui est en cycle 28/28. */}
        <StatCard
          label="Sur site"
          valeur={etat.surSite}
          detail={etat.rotation > 0 ? `dont ${etat.rotation} en rotation` : undefined}
        />
        <StatCard label="Au bureau" valeur={etat.bureau} />
        <StatCard label="En rotation" valeur={etat.rotation} detail="Compris dans « sur site »" />
        <StatCard label="En congé" valeur={etat.conges} />
        <StatCard label="Absents" valeur={etat.absents} ton={etat.absents > 0 ? 'attention' : 'neutre'} />
        <StatCard label="Effectif total" valeur={etat.effectifTotal} detail={`${etat.effectifActif} actifs`} />
        <StatCard
          label="Effectif disponible"
          valeur={etat.effectifDisponible}
          detail={etat.nonPlanifies > 0 ? `${etat.nonPlanifies} non planifié(s)` : 'Tous planifiés'}
          ton={etat.nonPlanifies > 0 ? 'attention' : 'neutre'}
        />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
        <StatCard label="Budget consommé" valeur={montant(finance.coutEngage)} />
        <StatCard label="Budget restant" valeur={montant(finance.coutRestant)} ton={finance.coutRestant < 0 ? 'critique' : 'positif'} />
        <StatCard label="Taux d'occupation" valeur={formatPercent(taux.occupation, 0)} detail="Jours travaillés / capacité" />
        <StatCard label="Taux de présence" valeur={formatPercent(taux.presence, 0)} detail="Réalisé / planifié à date" />
        <StatCard label="Jours consommés" valeur={finance.joursConsommes} />
        <StatCard label="Jours restants" valeur={finance.joursRestants} detail="Encore planifiés ce mois" />
        {/* Indicateurs HSE au tableau de bord (§1 : « il devra intégrer […]
            les indicateurs HSE ») et carte « Alertes HSE ouvertes » de la note
            d'UX. Un compteur à zéro reste affiché en vert : ici, zéro est une
            bonne nouvelle qu'on vient vérifier. */}
        <StatCard
          label="Alertes HSE ouvertes"
          valeur={hse.evenements}
          ton={hse.evenements > 0 ? 'critique' : 'positif'}
          detail={`${hse.semaines} semaine(s) relevée(s)`}
        />
        <StatCard
          label="Heures travaillées"
          valeur={formatNombre(hse.heuresTravaillees, 0)}
          detail={`${hse.joursPointes} jours pointés × 12 h`}
        />
        <StatCard label="LTIF" valeur={formatNombre(hse.ltif, 2)} ton={hse.ltif > 0 ? 'critique' : 'positif'} />
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 p-5">
        <p className="text-sm font-semibold text-gray-900 mb-4">Effectifs jour par jour</p>
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={courbe} margin={{ top: 0, right: 8, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis dataKey="jour" tick={{ fontSize: 11 }} />
            <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
            <Tooltip labelFormatter={(v) => `Jour ${v}`} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            {Object.entries(COULEURS_SERIE).map(([serie, couleur]) => (
              <Bar key={serie} dataKey={serie} stackId="a" fill={couleur} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 p-5 space-y-3">
        <p className="text-sm font-semibold text-gray-900">Répartition du {dateArrete}</p>
        <div className="space-y-1.5">
          {(Object.keys(AFFECTATIONS) as TypeAffectation[]).map((type) => {
            const valeur = etat.parAffectation[type]
            const part = etat.effectifActif ? valeur / etat.effectifActif : 0
            return (
              <div key={type} className="flex items-center gap-3">
                <span className="text-xs text-gray-600 w-40 shrink-0">{AFFECTATIONS[type].label}</span>
                <div className="flex-1 h-2 rounded-full bg-gray-100 overflow-hidden">
                  <div className={`h-full ${AFFECTATIONS[type].classe.split(' ')[0]}`} style={{ width: `${part * 100}%` }} />
                </div>
                <span className="text-xs font-semibold text-gray-900 w-8 text-right">{valeur}</span>
              </div>
            )
          })}
        </div>
        <LegendeAffectations />
      </div>
    </div>
  )
}
