import { useMemo, useState } from 'react'
import type { LigneJournalPeinture, ParametresContratPeinture } from '../../types/contratPeinture'
import {
  cumulPerformance,
  performanceParJour,
  type PerformanceJour,
} from '../../lib/contratPeinturePerformance'
import { formatNombre, formatPercent } from '../../lib/format'
import { valeursDistinctes } from '../../lib/saisie'
import { StatCard } from './elements'
import { TableauColonnes, type ColonneTableau } from '../ui/TableauColonnes'
import { BarreFiltresTableau, FiltreSelect } from '../ui/FiltresTableau'

// Onglet « Performance » (27/08/2026, lot 6) — le § « Mesure de la
// performance » du document :
//
//   « L'application doit permettre de visualiser : l'objectif de production
//   attendu ; la surface réellement réalisée ; le taux d'atteinte de
//   l'objectif ; l'écart entre le réalisé et le prévisionnel. »
//
// Les quatre grandeurs, par journée et par champ. **Rien n'y est qualifié de
// sous- ou surperformant** : le document le demande mais ne donne aucun seuil
// (Q7 du recueil), et un seuil deviné vaudrait moins que son absence. Le taux
// et l'écart sont signés, la lecture reste au lecteur.

const tonEcart = (v: number | null) =>
  v === null ? 'text-gray-400' : v < 0 ? 'text-amber-700' : 'text-emerald-700'

export function PerformanceTab({
  journal,
  parametres,
}: {
  journal: LigneJournalPeinture[]
  parametres: ParametresContratPeinture | null
}) {
  const sites = useMemo(() => valeursDistinctes(journal, 'site'), [journal])
  const [site, setSite] = useState('')
  const siteRetenu = site || sites[0] || ''

  const jours = useMemo(
    () => (siteRetenu ? performanceParJour(journal, parametres, siteRetenu) : []),
    [journal, parametres, siteRetenu]
  )
  const cumul = useMemo(() => cumulPerformance(jours), [jours])

  const colonnes: ColonneTableau<PerformanceJour>[] = [
    { cle: 'date', entete: 'Date', valeur: (j) => j.date },
    {
      cle: 'effectif',
      entete: 'Effectif',
      texte: (j) => j.effectifs.map((e) => `${e.effectif} ${e.profil}`).join(' + '),
      valeur: (j) =>
        j.effectifs.length ? (
          <span className="text-gray-600">
            {j.effectifs.map((e) => `${formatNombre(e.effectif)} × ${e.profil}`).join(' + ')}
          </span>
        ) : (
          <span className="text-gray-300">—</span>
        ),
    },
    {
      cle: 'objectif',
      entete: 'Objectif (m²)',
      align: 'right',
      valeur: (j) => formatNombre(j.objectif, 2),
    },
    {
      cle: 'production',
      entete: 'Réalisé du jour (m²)',
      align: 'right',
      texte: (j) => (j.production === null ? '' : String(j.production)),
      valeur: (j) =>
        j.production === null ? (
          <span
            className="text-gray-300"
            title={
              j.affaires === 0
                ? 'Aucune affaire ce jour-là'
                : "Aucune affaire du jour n'est la reprise d'un rapport précédent : la surface est cumulée à date, il n'y a rien à quoi la comparer."
            }
          >
            —
          </span>
        ) : (
          formatNombre(j.production, 2)
        ),
    },
    {
      cle: 'taux',
      entete: "Taux d'atteinte",
      align: 'right',
      texte: (j) => (j.tauxAtteinte === null ? '' : String(j.tauxAtteinte)),
      valeur: (j) =>
        j.tauxAtteinte === null ? (
          <span className="text-gray-300">—</span>
        ) : (
          <span className={tonEcart(j.ecart)}>{formatPercent(j.tauxAtteinte)}</span>
        ),
    },
    {
      cle: 'ecart',
      entete: 'Écart (m²)',
      align: 'right',
      texte: (j) => (j.ecart === null ? '' : String(j.ecart)),
      valeur: (j) =>
        j.ecart === null ? (
          <span className="text-gray-300">—</span>
        ) : (
          <span className={tonEcart(j.ecart)}>
            {j.ecart > 0 ? '+' : ''}
            {formatNombre(j.ecart, 2)}
          </span>
        ),
    },
    {
      cle: 'chainees',
      entete: 'Affaires',
      align: 'right',
      texte: (j) => `${j.affairesChainees}/${j.affaires}`,
      valeur: (j) => (
        <span
          className="text-gray-500"
          title="Affaires dont la production du jour est mesurable (reprise du rapport précédent) sur le total du jour"
        >
          {j.affairesChainees} / {j.affaires}
        </span>
      ),
    },
  ]

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Objectif cumulé"
          value={cumul.objectif === null ? '—' : `${formatNombre(cumul.objectif, 1)} m²`}
          detail={
            cumul.joursMesures
              ? `sur ${formatNombre(cumul.joursMesures)} journée(s) mesurable(s)`
              : 'aucune journée mesurable'
          }
        />
        <StatCard
          label="Réalisé cumulé"
          value={cumul.production === null ? '—' : `${formatNombre(cumul.production, 1)} m²`}
        />
        <StatCard
          label="Taux d'atteinte"
          value={cumul.tauxAtteinte === null ? '—' : formatPercent(cumul.tauxAtteinte)}
        />
        <StatCard
          label="Écart cumulé"
          value={cumul.ecart === null ? '—' : `${cumul.ecart > 0 ? '+' : ''}${formatNombre(cumul.ecart, 1)} m²`}
          negatif={cumul.ecart !== null && cumul.ecart < 0}
        />
      </div>

      {/* Le document demande d'« identifier rapidement les situations de
          sous-performance ou de surperformance » — mais ne donne aucun seuil.
          Le dire vaut mieux que d'en inventer un. */}
      <p className="text-xs text-gray-400">
        Le taux et l'écart sont affichés signés, sans être qualifiés de sous- ou surperformance : aucun seuil n'est
        défini pour le contrat. Le vert et l'ambre marquent seulement le signe de l'écart.
      </p>

      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
        <BarreFiltresTableau>
          <FiltreSelect
            label="Champ"
            value={siteRetenu}
            onChange={setSite}
            options={sites}
            libelleTous={sites.length ? undefined : 'Aucun champ'}
          />
          <span className="text-xs text-gray-400">
            {cumul.joursMesures} journée(s) mesurable(s) sur {cumul.jours}
          </span>
        </BarreFiltresTableau>

        {cumul.joursMesures === 0 && jours.length > 0 && (
          <p className="px-5 py-3 text-xs text-amber-700 bg-amber-50/60 border-b border-amber-100">
            Aucune journée n'est encore mesurable sur ce champ. La production d'un jour est l'écart avec le rapport
            précédent : elle n'existe que pour les affaires <strong>reprises d'un rapport à l'autre</strong>. Les lignes
            importées du classeur portent une surface cumulée à date sans lien de reprise — l'objectif reste calculé,
            le réalisé non.
          </p>
        )}

        <TableauColonnes
          colonnes={colonnes}
          lignes={jours}
          cleLigne={(j) => `${j.date}-${j.site}`}
          exportation={{
            nomFichier: 'peinture-performance',
            titre: `Contrat peinture — performance ${siteRetenu}`,
          }}
        />
      </div>
    </div>
  )
}
