import { useEffect, useMemo, useState } from 'react'
import { HeartPulse, Link2Off, ShieldAlert } from 'lucide-react'
import { StatCard } from './HSETab'
import { EtatVide } from '../ui/EtatVide'
import { BoutonExport } from '../ui/BoutonExport'
import { SqueletteeLignes } from '../ui/Squelette'
import { useResolveur } from '../../contexts/useResolveur'
import { chargerJournalHebdoCrjPartage } from '../../lib/journauxTerrainCache'
import { resoudreProjetCrj } from '../../lib/liaisonCles'
import { deriveIndicateursHSE, hseRecap } from '../../lib/hebdoCrjEngine'
import { OBJECTIF_LTIF, OBJECTIF_HPIF, ltif, hpif } from '../../types/hse'
import { formatNombre, formatDate } from '../../lib/format'
import type { LigneJournalHebdo } from '../../types/hebdoCrj'
import type { Projet } from '../../types/project'

// Synthèse HSE d'un projet **dérivée du CRJ** (13/08/2026, demande explicite :
// « dans le détail on va juste récupérer des infos provenant des HSE des CRJ,
// ici ça serait juste une synthèse »). Rien n'est saisi ici : les compteurs
// viennent des lignes du rapport journalier rattachées au projet, dont les
// 6 champs HSE sont renseignés affaire par affaire depuis le 01/08/2026.
//
// Les lignes sont rattachées au projet par la cascade de résolution
// (lib/liaison.ts), pas par un champ direct — le CRJ ne porte pas d'id de
// fiche projet, seulement des clés naturelles (nom, n° avis/DDM, plateforme).

// TRIR n'est volontairement pas affiché : sa formule ajoute CHSE et MTC aux
// accidents, or `LigneJournalHebdo` ne porte ni l'un ni l'autre. L'afficher
// à partir des seuls FAT/LTI donnerait un TRIR faussement égal au LTIF.
export function SyntheseHseCrj({ projet }: { projet: Projet }) {
  const resolveur = useResolveur()
  const [journal, setJournal] = useState<LigneJournalHebdo[] | null>(null)
  const [erreur, setErreur] = useState<string | null>(null)

  useEffect(() => {
    chargerJournalHebdoCrjPartage()
      .then(setJournal)
      .catch(() => setErreur('Le journal CRJ n’a pas pu être chargé.'))
  }, [])

  const lignes = useMemo(() => {
    if (!journal) return []
    return journal.filter((l) => resoudreProjetCrj(resolveur, l) === projet.id)
  }, [journal, resolveur, projet.id])

  const indicateurs = useMemo(() => deriveIndicateursHSE(lignes), [lignes])
  const recap = useMemo(() => hseRecap(lignes), [lignes])

  if (erreur) {
    return <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-4 py-3">{erreur}</p>
  }

  if (!journal) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-gray-400">Chargement du journal CRJ…</p>
        <SqueletteeLignes lignes={4} />
      </div>
    )
  }

  if (lignes.length === 0) {
    return (
      <EtatVide
        icone={Link2Off}
        titre="Aucune ligne CRJ rattachée à ce projet"
        description={
          <>
            La synthèse se calcule sur les lignes du rapport journalier résolues vers cette fiche (nom du projet,
            n° d’avis/DDM ou plateforme). Aucune ne correspond pour l’instant — la fiche ne porte probablement pas
            encore les clés opérationnelles du terrain. Le rapprochement se confirme à la main depuis l’écran
            Rapprochement.
          </>
        }
      />
    )
  }

  const dates = lignes.map((l) => l.date).sort()
  const ltifValeur = ltif(indicateurs)
  const hpifValeur = hpif(indicateurs)

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold text-gray-900">Synthèse HSE — dérivée du CRJ</h3>
          <p className="text-xs text-gray-500 mt-0.5 max-w-2xl">
            Cumul des {formatNombre(lignes.length)} ligne(s) du rapport journalier rattachées à ce projet, du{' '}
            {formatDate(dates[0])} au {formatDate(dates[dates.length - 1])}. Aucune valeur n’est saisie ici : tout
            vient des compteurs HSE renseignés affaire par affaire dans le CRJ.
          </p>
        </div>
        <BoutonExport
          nomFichier={`hse-crj-${projet.nom.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40)}`}
          titre={`${projet.nom} — HSE dérivé du CRJ`}
          colonnes={[
            { entete: 'Date', valeur: (l: LigneJournalHebdo) => l.date },
            { entete: 'Service', valeur: (l: LigneJournalHebdo) => l.servicesTeepg ?? '' },
            { entete: 'Projet (CRJ)', valeur: (l: LigneJournalHebdo) => l.nomProjet ?? '' },
            { entete: 'Plateforme', valeur: (l: LigneJournalHebdo) => l.plateforme ?? '' },
            { entete: 'FAT', valeur: (l: LigneJournalHebdo) => l.accidentFat ?? 0 },
            { entete: 'LTI', valeur: (l: LigneJournalHebdo) => l.accidentLti ?? 0 },
            { entete: 'HPI / near-miss', valeur: (l: LigneJournalHebdo) => l.nearMissHpi ?? 0 },
            { entete: 'Premiers soins', valeur: (l: LigneJournalHebdo) => l.premierSoins ?? 0 },
            { entete: 'Anomalies', valeur: (l: LigneJournalHebdo) => l.anomalie ?? 0 },
            { entete: 'Causeries sécurité', valeur: (l: LigneJournalHebdo) => l.causerieSecurite ?? 0 },
          ]}
          lignes={lignes}
        />
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard
          icon={HeartPulse}
          label="Heures travaillées"
          value={formatNombre(indicateurs.heuresTravaillees)}
        />
        <StatCard
          icon={ShieldAlert}
          label="Accidents (FAT + LTI)"
          value={indicateurs.fat + indicateurs.lti}
          color={indicateurs.fat + indicateurs.lti > 0 ? 'red' : 'green'}
        />
        <StatCard
          icon={ShieldAlert}
          label="Quasi-accidents (HPI + 1ers soins)"
          value={indicateurs.hpi + indicateurs.fac}
          color={indicateurs.hpi + indicateurs.fac > 0 ? 'amber' : 'green'}
        />
        <StatCard icon={HeartPulse} label="Causeries sécurité" value={recap.causerieSecurite} />
      </div>

      <div className="grid sm:grid-cols-2 gap-3">
        <div className="rounded-xl border border-gray-100 bg-gray-50/70 p-4">
          <p className="text-xs font-medium text-gray-500">LTIF (objectif ≤ {OBJECTIF_LTIF})</p>
          <p className={`text-2xl font-bold ${ltifValeur > OBJECTIF_LTIF ? 'text-red-600' : 'text-emerald-700'}`}>
            {formatNombre(ltifValeur, 2)}
          </p>
          <p className="text-xs text-gray-400 mt-0.5">(FAT + LTI) × 1 000 000 / heures travaillées</p>
        </div>
        <div className="rounded-xl border border-gray-100 bg-gray-50/70 p-4">
          <p className="text-xs font-medium text-gray-500">HPIF (objectif ≤ {OBJECTIF_HPIF})</p>
          <p className={`text-2xl font-bold ${hpifValeur > OBJECTIF_HPIF ? 'text-red-600' : 'text-emerald-700'}`}>
            {formatNombre(hpifValeur, 2)}
          </p>
          <p className="text-xs text-gray-400 mt-0.5">HPI × 1 000 000 / heures travaillées</p>
        </div>
      </div>

      <p className="text-xs text-gray-400">
        TRIR n’est pas repris : sa formule ajoute les CHSE et les traitements médicaux aux accidents, deux
        compteurs que le CRJ ne porte pas. L’afficher à partir des seuls FAT/LTI donnerait un TRIR
        systématiquement égal au LTIF.
      </p>

      <div>
        <p className="text-sm font-medium text-gray-500 mb-2">Lignes CRJ prises en compte</p>
        <div className="border border-gray-100 rounded-xl overflow-hidden overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-left text-xs text-gray-500">
                <th className="px-3 py-2 font-medium whitespace-nowrap">Date</th>
                <th className="px-3 py-2 font-medium whitespace-nowrap">Service</th>
                <th className="px-3 py-2 font-medium whitespace-nowrap">Projet (CRJ)</th>
                <th className="px-3 py-2 font-medium text-right whitespace-nowrap">FAT</th>
                <th className="px-3 py-2 font-medium text-right whitespace-nowrap">LTI</th>
                <th className="px-3 py-2 font-medium text-right whitespace-nowrap">HPI</th>
                <th className="px-3 py-2 font-medium text-right whitespace-nowrap">1ers soins</th>
                <th className="px-3 py-2 font-medium text-right whitespace-nowrap">Anomalies</th>
                <th className="px-3 py-2 font-medium text-right whitespace-nowrap">Causeries</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {[...lignes]
                .sort((a, b) => b.date.localeCompare(a.date))
                .map((l, i) => (
                  <tr key={`${l.date}-${i}`}>
                    <td className="px-3 py-2 whitespace-nowrap text-gray-600">{formatDate(l.date)}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-gray-600">{l.servicesTeepg ?? '—'}</td>
                    <td className="px-3 py-2 text-gray-900">{l.nomProjet ?? '—'}</td>
                    <td className="px-3 py-2 text-right text-gray-600">{l.accidentFat ?? 0}</td>
                    <td className="px-3 py-2 text-right text-gray-600">{l.accidentLti ?? 0}</td>
                    <td className="px-3 py-2 text-right text-gray-600">{l.nearMissHpi ?? 0}</td>
                    <td className="px-3 py-2 text-right text-gray-600">{l.premierSoins ?? 0}</td>
                    <td className="px-3 py-2 text-right text-gray-600">{l.anomalie ?? 0}</td>
                    <td className="px-3 py-2 text-right text-gray-600">{l.causerieSecurite ?? 0}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
