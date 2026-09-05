import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { Layers3, PaintBucket, ClipboardList, TimerOff } from 'lucide-react'
import { Badge } from '../ui/Badge'
import type { Projet } from '../../types/project'
import {
  LIEU_PEINTURE_LABELS,
  MODE_FACTURATION_LABELS,
  montantPeinture,
  coutNPT,
  tonnageNetInstalle,
  avancementCRJMoyen,
} from '../../types/travauxTerrain'
import { useResolveur } from '../../contexts/useResolveur'
import {
  resoudreProjetCrj,
  resoudreProjetTonnage,
  resoudreProjetPeinture,
  resoudreProjetMetal,
} from '../../lib/liaisonCles'
import {
  chargerJournalTonnagePartage,
  chargerJournalPeinturePartage,
  chargerJournalHebdoCrjPartage,
  chargerAffairesMetalPartage,
} from '../../lib/journauxTerrainCache'
import type { LigneJournalTonnage } from '../../types/tonnageEchaf'
import type { LigneJournalPeinture } from '../../types/contratPeinture'
import type { LigneJournalHebdo } from '../../types/hebdoCrj'
import type { AffaireMetal } from '../../types/travauxMetal'
import { hseRecap } from '../../lib/hebdoCrjEngine'
import { formatDate, formatNombre } from '../../lib/format'
import { useMontant } from '../../lib/montantAffiche'

// Onglet Travaux terrain — **lecture seule** (18/08/2026, demande explicite
// « dans la section travaux terrain je veux que les données proviennent de ce
// qui est rempli dans le CRJ, plus de bouton d'ajout ici »).
//
// L'onglet portait quatre journaux saisis à la main sur la fiche (tonnage,
// peinture, comptes rendus journaliers, périodes de standby), doublant des
// données que les modules opérationnels tiennent déjà : le même chantier
// pouvait avoir un standby de 6 h côté CRJ et 2 jours ici, sans que rien ne
// dise lequel faisait foi. Les formulaires et leurs boutons « Ajouter » sont
// retirés ; chaque sous-onglet montre désormais ce que les modules ont
// enregistré et que le moteur de liaison rattache à cette fiche :
//
//   Tonnage échafaudage .... journal du module Tonnage (+ affaires METAL)
//   Peinture ............... journal du module Contrat peinture
//   CRJ .................... rapports journaliers du module Suivi hebdo CRJ
//   Standby / NPT .......... dérivé des mêmes lignes CRJ (durée de standby et
//                            sa répartition par cause : FRC, EXP, LOG, METEO,
//                            CTR, ICP, OTTO 2 — les 7 causes du classeur)
//
// Les saisies manuelles déjà enregistrées ne sont pas effacées : elles
// restent affichées sous un intitulé qui dit ce qu'elles sont, en lecture
// seule (`SaisiesManuelles`). Rien ne permet de les rapprocher d'une ligne de
// module — les deux schémas ne coïncident pas — et les supprimer serait
// perdre la seule trace de ce qui avait été relevé.

function JournalTonnageLie({ projet }: { projet: Projet }) {
  const resolveur = useResolveur()
  const [journal, setJournal] = useState<LigneJournalTonnage[] | null>(null)

  useEffect(() => {
    chargerJournalTonnagePartage().then(setJournal)
  }, [])

  const lignes = useMemo(() => {
    if (!journal) return null
    return journal.filter((l) => resoudreProjetTonnage(resolveur, l) === projet.id)
  }, [journal, resolveur, projet.id])

  if (!journal) return <p className="text-sm text-gray-400 mt-6">Résolution du journal tonnage échafaudage…</p>
  if (lignes && lignes.length === 0) {
    return (
      <p className="text-xs text-gray-400 mt-6">
        Journal tonnage échafaudage ({journal.length} lignes) : aucune résolue automatiquement à ce projet — le journal
        porte peu de clés de liaison exploitables en l'état (doc §2.3, rapprochement à affiner).
      </p>
    )
  }
  if (!lignes) return null

  return (
    <div className="mt-6">
      <div className="flex items-center gap-2 mb-1">
        <h4 className="font-semibold text-gray-900">Journal tonnage échafaudage lié</h4>
        <Badge label={`${lignes.length} ligne${lignes.length > 1 ? 's' : ''}`} bg="bg-blue-100" text="text-blue-700" />
      </div>
      <p className="text-xs text-gray-500 mb-3">
        Résolu automatiquement depuis le journal portfolio (module Tonnage échafaudage) — lecture seule, distinct de la
        saisie manuelle ci-dessus.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-left text-gray-500">
              <th className="py-2 pr-3 font-medium">Date montage</th>
              <th className="py-2 px-3 font-medium">Site</th>
              <th className="py-2 px-3 font-medium">Statut</th>
              <th className="py-2 pl-3 font-medium text-right">Poids</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {lignes.map((l) => (
              <tr key={l.id}>
                <td className="py-2 pr-3 text-gray-600">{l.dateMontageReel ? formatDate(l.dateMontageReel) : '—'}</td>
                <td className="py-2 px-3 text-gray-900 font-medium">{l.site ?? '—'}</td>
                <td className="py-2 px-3 text-gray-600">{l.statut ?? '—'}</td>
                <td className="py-2 pl-3 text-right text-gray-900">{l.poidsT != null ? `${formatNombre(l.poidsT, 1)} T` : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function JournalPeintureLie({ projet }: { projet: Projet }) {
  const { montant: formatMontant } = useMontant()
  const resolveur = useResolveur()
  const [journal, setJournal] = useState<LigneJournalPeinture[] | null>(null)

  useEffect(() => {
    chargerJournalPeinturePartage().then(setJournal)
  }, [])

  const lignes = useMemo(() => {
    if (!journal) return null
    return journal.filter((l) => resoudreProjetPeinture(resolveur, l) === projet.id)
  }, [journal, resolveur, projet.id])

  if (!journal) return <p className="text-sm text-gray-400 mt-6">Résolution du journal peinture…</p>
  if (lignes && lignes.length === 0) {
    return (
      <p className="text-xs text-gray-400 mt-6">
        Journal peinture ({journal.length} lignes) : aucune résolue automatiquement à ce projet — la vraie clé de
        liaison peinture (n° avis/OT) n'est pas encore renseignée sur cette fiche (doc §2.3).
      </p>
    )
  }
  if (!lignes) return null

  const totalCout = lignes.reduce((s, l) => s + (l.coutTotalPointage ?? 0), 0)

  return (
    <div className="mt-6">
      <div className="flex items-center gap-2 mb-1">
        <h4 className="font-semibold text-gray-900">Journal peinture lié</h4>
        <Badge label={`${lignes.length} ligne${lignes.length > 1 ? 's' : ''}`} bg="bg-blue-100" text="text-blue-700" />
      </div>
      <p className="text-xs text-gray-500 mb-3">
        Résolu automatiquement depuis le journal du contrat Peinture GMI (module portfolio) — lecture seule, coût total au
        pointage {formatMontant(totalCout, projet.devise)}.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-left text-gray-500">
              <th className="py-2 pr-3 font-medium">Date</th>
              <th className="py-2 px-3 font-medium">Site</th>
              <th className="py-2 px-3 font-medium text-right">Surface réalisée</th>
              <th className="py-2 pl-3 font-medium text-right">Coût pointage</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {lignes.map((l) => (
              <tr key={l.id}>
                <td className="py-2 pr-3 text-gray-600">{l.date ? formatDate(l.date) : '—'}</td>
                <td className="py-2 px-3 text-gray-900 font-medium">{l.site ?? '—'}</td>
                <td className="py-2 px-3 text-right text-gray-900">{l.surfaceRealisee != null ? `${formatNombre(l.surfaceRealisee, 1)} m²` : '—'}</td>
                <td className="py-2 pl-3 text-right font-semibold text-gray-900">{formatMontant(l.coutTotalPointage ?? 0, projet.devise)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

type SousOnglet = 'tonnage' | 'peinture' | 'crj' | 'standby'

const SOUS_ONGLETS: { key: SousOnglet; label: string; icon: typeof Layers3 }[] = [
  { key: 'tonnage', label: 'Tonnage échafaudage', icon: Layers3 },
  { key: 'peinture', label: 'Peinture', icon: PaintBucket },
  { key: 'crj', label: 'CRJ', icon: ClipboardList },
  { key: 'standby', label: 'Standby / NPT', icon: TimerOff },
]

function StatCard({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="border border-gray-100 rounded-xl p-3">
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <p className="text-lg font-bold text-gray-900">{value}</p>
    </div>
  )
}

// Ce que la fiche portait en saisie manuelle avant le 18/08/2026 : conservé,
// affiché tel quel, plus modifiable. Rien ne s'affiche quand il n'y en a pas —
// c'est le cas de toute fiche qui n'a jamais utilisé ces formulaires.
function SaisiesManuelles({ nombre, children }: { nombre: number; children: ReactNode }) {
  if (nombre === 0) return null
  return (
    <details className="mt-6 border border-gray-100 rounded-xl">
      <summary className="px-4 py-2.5 text-xs font-semibold text-gray-500 cursor-pointer">
        Saisies manuelles antérieures ({nombre}) — lecture seule
      </summary>
      <div className="px-4 pb-4">
        <p className="text-xs text-gray-400 mb-3">
          Relevés saisis sur la fiche avant que cet onglet ne soit alimenté par les modules. Ils ne sont plus
          modifiables et ne sont rapprochés d'aucune ligne de module.
        </p>
        {children}
      </div>
    </details>
  )
}

function TonnageSection({ projet }: { projet: Projet }) {
  const { montant: formatMontant } = useMontant()
  const entries = projet.travauxTerrain.tonnage

  return (
    <div>
      <JournalTonnageLie projet={projet} />
      <AffairesMetalLiees projet={projet} />

      <SaisiesManuelles nombre={entries.length}>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-3">
          <StatCard label="Tonnage net installé" value={`${tonnageNetInstalle(entries).toLocaleString('fr-FR')} T`} />
          <StatCard label="Personnel mobilisé (cumul)" value={entries.reduce((somme, e) => somme + e.personnelMobilise, 0)} />
          <StatCard
            label="Coût cumulé"
            value={formatMontant(entries.reduce((somme, e) => somme + e.coutAssocie, 0), projet.devise)}
          />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-gray-500">
                <th className="py-2 pr-3 font-medium">Date</th>
                <th className="py-2 px-3 font-medium">Site</th>
                <th className="py-2 px-3 font-medium text-right">Installé (T)</th>
                <th className="py-2 px-3 font-medium text-right">Démonté (T)</th>
                <th className="py-2 pl-3 font-medium text-right">Coût</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {entries.map((e) => (
                <tr key={e.id}>
                  <td className="py-2 pr-3 text-gray-600 whitespace-nowrap">{formatDate(e.date)}</td>
                  <td className="py-2 px-3 text-gray-900">{e.site}</td>
                  <td className="py-2 px-3 text-right text-gray-600">{formatNombre(e.tonnageInstalle)}</td>
                  <td className="py-2 px-3 text-right text-gray-600">{formatNombre(e.tonnageDemonte)}</td>
                  <td className="py-2 pl-3 text-right text-gray-900">{formatMontant(e.coutAssocie, projet.devise)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SaisiesManuelles>
    </div>
  )
}

function PeintureSection({ projet }: { projet: Projet }) {
  const { montant: formatMontant } = useMontant()
  const entries = projet.travauxTerrain.peinture

  return (
    <div>
      <JournalPeintureLie projet={projet} />

      <SaisiesManuelles nombre={entries.length}>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-3">
          <StatCard
            label="Surface peinte cumulée"
            value={`${entries.reduce((somme, e) => somme + e.surfaceM2, 0).toLocaleString('fr-FR')} m²`}
          />
          <StatCard
            label="Montant facturé cumulé"
            value={formatMontant(entries.reduce((somme, e) => somme + montantPeinture(e), 0), projet.devise)}
          />
          <StatCard label="Interventions" value={entries.length} />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-gray-500">
                <th className="py-2 pr-3 font-medium">Date</th>
                <th className="py-2 px-3 font-medium">Lieu</th>
                <th className="py-2 px-3 font-medium">Facturation</th>
                <th className="py-2 px-3 font-medium text-right">Surface (m²)</th>
                <th className="py-2 pl-3 font-medium text-right">Montant</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {entries.map((e) => (
                <tr key={e.id}>
                  <td className="py-2 pr-3 text-gray-600 whitespace-nowrap">{formatDate(e.date)}</td>
                  <td className="py-2 px-3 text-gray-600">{LIEU_PEINTURE_LABELS[e.lieu]}</td>
                  <td className="py-2 px-3 text-gray-600">{MODE_FACTURATION_LABELS[e.modeFacturation]}</td>
                  <td className="py-2 px-3 text-right text-gray-600">{formatNombre(e.surfaceM2)}</td>
                  <td className="py-2 pl-3 text-right text-gray-900">{formatMontant(montantPeinture(e), projet.devise)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SaisiesManuelles>
    </div>
  )
}

// Affaires du module Travaux METAL rattachées à cette fiche. METAL n'avait
// aucun bloc ici : c'est pourtant la source des pivots du KPI METAL, et une
// fiche projet n'avait aucun moyen de voir les affaires qui la concernent.
function AffairesMetalLiees({ projet }: { projet: Projet }) {
  const resolveur = useResolveur()
  const [affaires, setAffaires] = useState<AffaireMetal[] | null>(null)

  useEffect(() => {
    chargerAffairesMetalPartage()
      .then(setAffaires)
      .catch(() => setAffaires([]))
  }, [])

  const liees = useMemo(() => {
    if (!affaires) return null
    return affaires.filter((a) => resoudreProjetMetal(resolveur, a) === projet.id)
  }, [affaires, resolveur, projet.id])

  if (!affaires) return <p className="text-sm text-gray-400 mt-6">Résolution des affaires METAL…</p>
  if (!liees) return null
  if (liees.length === 0) {
    return (
      <p className="text-xs text-gray-400 mt-6">
        Affaires METAL ({affaires.length}) : aucune rattachée à ce projet. Une affaire se rattache ici si elle a
        été saisie en choisissant cette fiche, ou si elle porte l'un de ses n° d'avis/OT.
      </p>
    )
  }

  return (
    <div className="mt-6">
      <div className="flex items-center gap-2 mb-1">
        <h4 className="font-semibold text-gray-900">Affaires METAL liées</h4>
        <Badge label={`${liees.length} affaire${liees.length > 1 ? 's' : ''}`} bg="bg-blue-100" text="text-blue-700" />
      </div>
      <p className="text-xs text-gray-500 mb-3">Reprises du module Travaux METAL — lecture seule.</p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-left text-gray-500">
              <th className="py-2 pr-3 font-medium">Affaire</th>
              <th className="py-2 px-3 font-medium">Champ</th>
              <th className="py-2 px-3 font-medium">N° avis</th>
              <th className="py-2 pl-3 font-medium">Statut</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {liees.map((a) => (
              <tr key={a.id}>
                <td className="py-2 pr-3 text-gray-900">{a.affaire ?? '—'}</td>
                <td className="py-2 px-3 text-gray-600 whitespace-nowrap">{a.champ ?? '—'}</td>
                <td className="py-2 px-3 text-gray-600 whitespace-nowrap">{a.avis ?? '—'}</td>
                <td className="py-2 pl-3 text-gray-600">{a.statut ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// Rapports journaliers réels (module Suivi hebdo CRJ) rattachés à cette
// fiche — pendant du bloc manuel ci-dessous, qui reste une saisie libre
// interne à la fiche. Le rattachement passe d'abord par le lien explicite
// posé à la saisie CRJ, puis par la cascade (resoudreProjetCrj).
// Lignes du journal CRJ rattachées à cette fiche — la source des deux
// sous-onglets ci-dessous. Le chargement passe par le cache mémoire des
// journaux terrain : les deux vues lisent le même fetch.
function useLignesCrj(projetId: string): { chargement: boolean; total: number; lignes: LigneJournalHebdo[] } {
  const resolveur = useResolveur()
  const [journal, setJournal] = useState<LigneJournalHebdo[] | null>(null)

  useEffect(() => {
    chargerJournalHebdoCrjPartage()
      .then(setJournal)
      .catch(() => setJournal([]))
  }, [])

  const lignes = useMemo(
    () => (journal ?? []).filter((l) => resoudreProjetCrj(resolveur, l) === projetId),
    [journal, resolveur, projetId]
  )

  return { chargement: journal === null, total: journal?.length ?? 0, lignes }
}

// Message commun aux deux vues quand rien ne se rattache : dire pourquoi vaut
// mieux qu'un tableau vide, le rattachement se jouant à la saisie du CRJ.
function AucuneLigneCrj({ total }: { total: number }) {
  return (
    <p className="text-xs text-gray-400">
      Journal CRJ ({total} lignes) : aucune rattachée à ce projet. Une affaire saisie dans le module CRJ se rattache
      ici si elle a été créée en choisissant cette fiche, ou si elle porte l'un de ses n° d'avis/DDM (cf. Références du
      projet, onglet Présentation).
    </p>
  )
}

function JournalCrjLie({ projet }: { projet: Projet }) {
  const { chargement, total, lignes } = useLignesCrj(projet.id)

  if (chargement) return <p className="text-sm text-gray-400">Résolution du journal CRJ…</p>
  if (lignes.length === 0) return <AucuneLigneCrj total={total} />

  const recap = hseRecap(lignes)
  const triees = [...lignes].sort((a, b) => b.date.localeCompare(a.date))
  const avancements = lignes.map((l) => l.avancementReel).filter((v): v is number => v != null)

  return (
    <div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
        <StatCard
          label="Avancement moyen"
          value={
            avancements.length > 0
              ? `${Math.round(avancements.reduce((somme, v) => somme + v, 0) / avancements.length)} %`
              : '—'
          }
        />
        <StatCard label="Rapports journaliers" value={lignes.length} />
        <StatCard label="Accidents cumulés" value={recap.accidentFat + recap.accidentLti} />
      </div>

      <div className="flex items-center gap-2 mb-1">
        <h4 className="font-semibold text-gray-900">Rapports journaliers CRJ</h4>
        <Badge label={`${lignes.length} ligne${lignes.length > 1 ? 's' : ''}`} bg="bg-blue-100" text="text-blue-700" />
      </div>
      <p className="text-xs text-gray-500 mb-3">
        Repris du module Suivi hebdo CRJ — lecture seule. HSE cumulé : {recap.accidentFat + recap.accidentLti}{' '}
        accident(s), {recap.nearMissHpi + recap.premierSoins} quasi-accident(s), {recap.anomalie} anomalie(s).
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-left text-gray-500">
              <th className="py-2 pr-3 font-medium">Date</th>
              <th className="py-2 px-3 font-medium">Service</th>
              <th className="py-2 px-3 font-medium">Statut</th>
              <th className="py-2 px-3 font-medium">Faits marquants</th>
              <th className="py-2 px-3 font-medium text-right">Avancement</th>
              <th className="py-2 pl-3 font-medium text-right">Standby (h)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {triees.map((l, i) => (
              <tr key={`${l.id}-${i}`}>
                <td className="py-2 pr-3 text-gray-600 whitespace-nowrap">{formatDate(l.date)}</td>
                <td className="py-2 px-3 text-gray-600 whitespace-nowrap">{l.servicesTeepg ?? '—'}</td>
                <td className="py-2 px-3 text-gray-600">{l.statutTravaux ?? '—'}</td>
                <td className="py-2 px-3 text-gray-600 max-w-xs truncate" title={l.faitsMarquants ?? undefined}>
                  {l.faitsMarquants ?? '—'}
                </td>
                <td className="py-2 px-3 text-right text-gray-900">
                  {l.avancementReel != null ? `${l.avancementReel} %` : '—'}
                </td>
                <td className="py-2 pl-3 text-right text-gray-600">{formatNombre(l.dureeStandBy)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function CRJSection({ projet }: { projet: Projet }) {
  const entries = projet.travauxTerrain.crj

  return (
    <div>
      <JournalCrjLie projet={projet} />

      <SaisiesManuelles nombre={entries.length}>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-3">
          <StatCard label="Avancement moyen" value={`${avancementCRJMoyen(entries)} %`} />
          <StatCard label="Comptes rendus" value={entries.length} />
          <StatCard
            label="Points bloquants actifs"
            value={entries.filter((e) => e.pointsBloquants.trim() !== 'RAS').length}
          />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-gray-500">
                <th className="py-2 pr-3 font-medium">Date</th>
                <th className="py-2 px-3 font-medium">Faits marquants</th>
                <th className="py-2 px-3 font-medium">Points bloquants</th>
                <th className="py-2 pl-3 font-medium text-right">Avancement</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {entries.map((e) => (
                <tr key={e.id}>
                  <td className="py-2 pr-3 text-gray-600 whitespace-nowrap">{formatDate(e.date)}</td>
                  <td className="py-2 px-3 text-gray-900">{e.faitsMarquants || '—'}</td>
                  <td className="py-2 px-3 text-gray-600">{e.pointsBloquants}</td>
                  <td className="py-2 pl-3 text-right text-gray-600">{e.avancementJour} %</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SaisiesManuelles>
    </div>
  )
}

// Les 7 causes de standby du classeur CRJ (feuille « Data », colonne des
// causes : FRC, EXP, LOG, METEO, CTR, ICP, OTTO 2 — chacune en heures). Le
// champ `ctr2` du type porte la cause « CTR » du classeur.
const CAUSES_NPT: { cle: keyof LigneJournalHebdo; label: string }[] = [
  { cle: 'frc', label: 'FRC' },
  { cle: 'exp', label: 'EXP' },
  { cle: 'log', label: 'LOG' },
  { cle: 'meteo', label: 'METEO' },
  { cle: 'ctr2', label: 'CTR' },
  { cle: 'icp', label: 'ICP' },
  { cle: 'otto2', label: 'OTTO 2' },
]

function heures(ligne: LigneJournalHebdo, cle: keyof LigneJournalHebdo): number {
  const valeur = ligne[cle]
  return typeof valeur === 'number' ? valeur : 0
}

function StandbySection({ projet }: { projet: Projet }) {
  const { montant: formatMontant } = useMontant()
  const { chargement, total, lignes } = useLignesCrj(projet.id)
  const entries = projet.travauxTerrain.standby

  const parCause = CAUSES_NPT.map((cause) => ({
    ...cause,
    heures: lignes.reduce((somme, l) => somme + heures(l, cause.cle), 0),
  }))
  // Le total affiché est celui que le CRJ déclare (`dureeStandBy`), pas la
  // somme des causes : les deux ne coïncident pas forcément sur les lignes
  // importées, et recalculer l'un depuis l'autre masquerait l'écart.
  const totalStandby = lignes.reduce((somme, l) => somme + (l.dureeStandBy ?? 0), 0)
  const totalCauses = parCause.reduce((somme, c) => somme + c.heures, 0)
  const joursAvecStandby = lignes.filter((l) => (l.dureeStandBy ?? 0) > 0).length
  const avecStandby = [...lignes].filter((l) => (l.dureeStandBy ?? 0) > 0 || CAUSES_NPT.some((c) => heures(l, c.cle) > 0))
  avecStandby.sort((a, b) => b.date.localeCompare(a.date))

  return (
    <div>
      {chargement ? (
        <p className="text-sm text-gray-400">Résolution du journal CRJ…</p>
      ) : lignes.length === 0 ? (
        <AucuneLigneCrj total={total} />
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
            <StatCard label="Standby cumulé" value={`${formatNombre(totalStandby, 1)} h`} />
            <StatCard label="Journées avec standby" value={joursAvecStandby} />
            <StatCard label="Réparti par cause" value={`${formatNombre(totalCauses, 1)} h`} />
          </div>

          <h4 className="font-semibold text-gray-900 mb-1">Standby / NPT du CRJ</h4>
          <p className="text-xs text-gray-500 mb-3">
            Dérivé des rapports journaliers rattachés à cette fiche — lecture seule. Les 7 causes sont celles du
            classeur CRJ. Le cumul déclaré ({formatNombre(totalStandby, 1)} h) et la somme des causes (
            {formatNombre(totalCauses, 1)} h) sont affichés séparément : le classeur ne garantit pas qu'ils
            coïncident, et les rapprocher de force masquerait l'écart.
          </p>

          <div className="flex flex-wrap gap-2 mb-4">
            {parCause.map((cause) => (
              <span
                key={cause.label}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs ${
                  cause.heures > 0 ? 'bg-amber-50 text-amber-800' : 'bg-gray-50 text-gray-400'
                }`}
              >
                <span className="font-semibold">{cause.label}</span>
                {formatNombre(cause.heures, 1)} h
              </span>
            ))}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left text-gray-500">
                  <th className="py-2 pr-3 font-medium">Date</th>
                  <th className="py-2 px-3 font-medium">Affaire</th>
                  <th className="py-2 px-3 font-medium text-right">Standby (h)</th>
                  {CAUSES_NPT.map((cause) => (
                    <th key={cause.label} className="py-2 px-3 font-medium text-right whitespace-nowrap">
                      {cause.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {avecStandby.map((l, i) => (
                  <tr key={`${l.id}-${i}`}>
                    <td className="py-2 pr-3 text-gray-600 whitespace-nowrap">{formatDate(l.date)}</td>
                    <td className="py-2 px-3 text-gray-900 max-w-xs truncate" title={l.description ?? undefined}>
                      {l.description ?? l.nomProjet ?? '—'}
                    </td>
                    <td className="py-2 px-3 text-right font-semibold text-gray-900">
                      {formatNombre(l.dureeStandBy, 1)}
                    </td>
                    {CAUSES_NPT.map((cause) => (
                      <td key={cause.label} className="py-2 px-3 text-right text-gray-600">
                        {heures(l, cause.cle) > 0 ? formatNombre(heures(l, cause.cle), 1) : '—'}
                      </td>
                    ))}
                  </tr>
                ))}
                {avecStandby.length === 0 && (
                  <tr>
                    <td colSpan={3 + CAUSES_NPT.length} className="py-6 text-center text-gray-400">
                      Aucun standby déclaré sur les rapports de ce projet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      <SaisiesManuelles nombre={entries.length}>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-3">
          <StatCard
            label="Coût NPT cumulé"
            value={formatMontant(entries.reduce((somme, e) => somme + coutNPT(e), 0), projet.devise)}
          />
          <StatCard label="Jours de standby cumulés" value={entries.reduce((somme, e) => somme + e.dureeJours, 0)} />
          <StatCard label="Périodes enregistrées" value={entries.length} />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-gray-500">
                <th className="py-2 pr-3 font-medium">Date</th>
                <th className="py-2 px-3 font-medium">Motif</th>
                <th className="py-2 px-3 font-medium text-right">Durée (j)</th>
                <th className="py-2 pl-3 font-medium text-right">Coût</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {entries.map((e) => (
                <tr key={e.id}>
                  <td className="py-2 pr-3 text-gray-600 whitespace-nowrap">{formatDate(e.date)}</td>
                  <td className="py-2 px-3 text-gray-900">{e.motif}</td>
                  <td className="py-2 px-3 text-right text-gray-600">{e.dureeJours}</td>
                  <td className="py-2 pl-3 text-right text-gray-900">{formatMontant(coutNPT(e), projet.devise)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SaisiesManuelles>
    </div>
  )
}

export function TravauxTerrainTab({ projet }: { projet: Projet }) {
  const [sousOnglet, setSousOnglet] = useState<SousOnglet>('tonnage')

  return (
    <div>
      <div className="flex flex-wrap gap-2 mb-6">
        {SOUS_ONGLETS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setSousOnglet(key)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              sousOnglet === key ? 'bg-primary/10 text-primary' : 'text-gray-500 hover:bg-gray-100'
            }`}
          >
            <Icon className="w-3.5 h-3.5" />
            {label}
          </button>
        ))}
      </div>

      {sousOnglet === 'tonnage' && <TonnageSection projet={projet} />}
      {sousOnglet === 'peinture' && <PeintureSection projet={projet} />}
      {sousOnglet === 'crj' && <CRJSection projet={projet} />}
      {sousOnglet === 'standby' && <StandbySection projet={projet} />}
    </div>
  )
}
