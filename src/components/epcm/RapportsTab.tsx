import { useCallback, useMemo, useState } from 'react'
import { FileSpreadsheet, FileText } from 'lucide-react'
import { Button } from '../ui/Button'
import { exporterCsv } from '../../lib/exportCsv'
import { exporterRapportPdf, type SectionRapportPdf } from '../../lib/exportPdf'
import { formatNombre, formatPercent } from '../../lib/format'
import {
  AFFECTATIONS,
  compteSurPeriode,
  joursDuMois,
  joursEntre,
  joursTravaillesSurPeriode,
  estActif,
  libelleMois,
  moisDe,
  nomComplet,
  rotationDerivee,
  semaineDe,
  tauxJournalierEffectif,
  type SyntheseFinanciereEpcm,
} from '../../lib/contratEpcmEngine'
import { EnteteOnglet } from './elements'
import { useMontant } from '../../lib/montantAffiche'
import type { CodeDevise } from '../../types/devise'
import type {
  AlerteEpcm,
  EmployeEpcm,
  PlanningMoisEpcm,
  PointageMoisEpcm,
  RotationEpcm,
} from '../../types/contratEpcm'

// Onglet « Rapports » (§11) : rapport journalier, hebdomadaire ou mensuel,
// réunissant indicateurs, planning, pointages, rotations, coûts et alertes.
// Le même contenu part en PDF (un document, une section par bloc) ou en
// tableur — le CSV n'exporte qu'un bloc à la fois, un fichier plat n'ayant
// pas de notion de section.

type Periode = 'journalier' | 'hebdomadaire' | 'mensuel'

const LIBELLES_PERIODE: Record<Periode, string> = {
  journalier: 'Rapport journalier',
  hebdomadaire: 'Rapport hebdomadaire',
  mensuel: 'Rapport mensuel',
}

export function RapportsTab({
  deviseAffichage,
  employes,
  plannings,
  pointages,
  rotations,
  alertes,
  finance,
  mois,
  dateArrete,
}: {
  /** Devise d'affichage du module (rev01, point 7) — `null` = celle du système. */
  deviseAffichage: CodeDevise | null
  employes: EmployeEpcm[]
  plannings: PlanningMoisEpcm[]
  pointages: PointageMoisEpcm[]
  rotations: RotationEpcm[]
  alertes: AlerteEpcm[]
  finance: SyntheseFinanciereEpcm
  mois: string
  dateArrete: string
}) {
  // Le rapport sort dans la devise d'affichage du module, pas dans celle
  // d'enregistrement : un PDF exporté doit dire la même chose que l'écran.
  const { montant: formatMontant, uniteAffichee, valeurAffichee: convertir } = useMontant(deviseAffichage)
  const montant = useCallback((v: number) => formatMontant(v, finance.devise), [formatMontant, finance.devise])
  const uniteMontants = uniteAffichee(finance.devise)

  const [periode, setPeriode] = useState<Periode>('mensuel')

  const { jours, libellePeriode } = useMemo(() => {
    if (periode === 'journalier') return { jours: [dateArrete], libellePeriode: `journée du ${dateArrete}` }
    if (periode === 'hebdomadaire') {
      const { debut, fin } = semaineDe(dateArrete)
      return { jours: joursEntre(debut, fin), libellePeriode: `semaine du ${debut} au ${fin}` }
    }
    return { jours: joursDuMois(mois), libellePeriode: libelleMois(mois) }
  }, [periode, dateArrete, mois])

  // Activité déduite du contrat, à la date d'arrêté du rapport (rev01).
  const actifs = useMemo(() => employes.filter((e) => estActif(e, dateArrete)), [employes, dateArrete])

  const sections: SectionRapportPdf[] = useMemo(() => {
    const parEmploye = (liste: { employeId: string; mois: string }[], employeId: string) =>
      new Map(liste.filter((x) => x.employeId === employeId).map((x) => [x.mois, x]))

    const lignesPlanning = actifs.map((employe) => {
      const planningsEmploye = parEmploye(plannings, employe.id) as Map<string, PlanningMoisEpcm>
      const pointagesEmploye = parEmploye(pointages, employe.id) as Map<string, PointageMoisEpcm>
      const compteurs = compteSurPeriode(jours, planningsEmploye, pointagesEmploye)
      const travailles = joursTravaillesSurPeriode(jours, planningsEmploye, pointagesEmploye)
      // Taux du mois de la période : un salarié n'en saisit plus, le sien se
      // déduit de son salaire mensuel (rev01, point 6).
      const taux = tauxJournalierEffectif(employe, moisDe(jours[0]))
      return {
        employe,
        compteurs,
        travailles,
        taux,
        cout: travailles * (taux.valeur ?? 0),
      }
    })

    const rotationsPeriode = rotations
      .filter((r) => r.debut <= jours[jours.length - 1] && r.fin >= jours[0])
      .map((r) => rotationDerivee(r, employes, plannings, dateArrete))

    return [
      {
        titre: 'Indicateurs',
        colonnes: ['Indicateur', 'Valeur'],
        lignes: [
          ['Effectif actif', actifs.length],
          ['Jours travaillés sur la période', lignesPlanning.reduce((t, l) => t + l.travailles, 0)],
          ['Heures pointées', formatNombre(lignesPlanning.reduce((t, l) => t + l.compteurs.heuresTravaillees, 0), 1)],
          ['Heures supplémentaires', formatNombre(lignesPlanning.reduce((t, l) => t + l.compteurs.heuresSupplementaires, 0), 1)],
          ['Coût de la période', montant(lignesPlanning.reduce((t, l) => t + l.cout, 0))],
          ['Budget vendu (mois)', montant(finance.budgetVendu)],
          ['Coût engagé (mois)', montant(finance.coutEngage)],
          ['Prévisionnel fin de mois', montant(finance.coutPrevisionnelFinMois)],
          ['Écart au budget', montant(finance.ecart)],
          ['Consommation du budget', formatPercent(finance.pctConsomme, 0)],
        ],
      },
      {
        titre: 'Planning',
        colonnes: ['Employé', 'Fonction', ...Object.values(AFFECTATIONS).map((a) => a.label), 'Non planifiés'],
        lignes: lignesPlanning.map((l) => [
          nomComplet(l.employe),
          l.employe.fonction ?? '',
          ...Object.keys(AFFECTATIONS).map((type) => l.compteurs.parAffectation[type as keyof typeof l.compteurs.parAffectation]),
          l.compteurs.joursNonPlanifies,
        ]),
      },
      {
        titre: 'Pointages',
        colonnes: ['Employé', 'Jours travaillés', 'Heures', 'Heures sup.', 'Retards (min)', 'Absences'],
        lignes: lignesPlanning.map((l) => [
          nomComplet(l.employe),
          l.travailles,
          formatNombre(l.compteurs.heuresTravaillees, 1),
          formatNombre(l.compteurs.heuresSupplementaires, 1),
          l.compteurs.retardMinutes,
          l.compteurs.joursAbsence,
        ]),
      },
      {
        titre: 'Rotations de la période',
        colonnes: ['Employé', 'Début', 'Fin', 'Jours site', 'Jours bureau', 'Jours repos', 'Cycle constaté', 'État'],
        lignes: rotationsPeriode.map((r) => [
          r.employe ? nomComplet(r.employe) : '—',
          r.rotation.debut,
          r.rotation.fin,
          r.joursSite,
          r.joursBureau,
          r.joursRepos,
          r.cycleConstate,
          r.complete ? 'Complète' : r.terminee ? 'Incomplète' : 'En cours',
        ]),
        messageVide: 'Aucune rotation sur la période.',
      },
      {
        titre: 'Coûts',
        colonnes: ['Employé', `Coût / jour (${uniteMontants})`, 'Jours travaillés', `Coût période (${uniteMontants})`, `Forfait vendu (${uniteMontants})`],
        lignes: lignesPlanning.map((l) => [
          nomComplet(l.employe),
          l.taux.valeur == null ? 'non défini' : formatNombre(convertir(l.taux.valeur, finance.devise), 0),
          l.travailles,
          formatNombre(convertir(l.cout, finance.devise), 0),
          formatNombre(convertir(l.employe.coutMensuelVendu, finance.devise), 0),
        ]),
      },
      {
        titre: 'Dépassements et alertes',
        colonnes: ['Niveau', 'Catégorie', 'Alerte', 'Détail'],
        lignes: alertes.map((a) => [a.niveau.toUpperCase(), a.categorie.replace('_', ' '), a.titre, a.detail]),
        messageVide: 'Aucune alerte.',
      },
    ]
    // `montant`, `convertir` et `uniteMontants` viennent de `useMontant`, qui
    // change avec la devise d'affichage : sans eux, changer de devise
    // laisserait le rapport dans l'ancienne.
  }, [actifs, employes, plannings, pointages, rotations, alertes, finance, jours, dateArrete, montant, convertir, uniteMontants])

  const nomFichier = `rapport-epcm-${periode}-${periode === 'mensuel' ? mois : dateArrete}`

  return (
    <div className="space-y-4">
      <EnteteOnglet
        titre={LIBELLES_PERIODE[periode]}
        aide={`Portée : ${libellePeriode}. Les indicateurs financiers restent mensuels (le budget vendu l'est), le reste suit la période choisie.`}
      >
        <div className="flex rounded-lg border border-gray-200 overflow-hidden">
          {(Object.keys(LIBELLES_PERIODE) as Periode[]).map((p) => (
            <button
              key={p}
              onClick={() => setPeriode(p)}
              className={`px-3 py-1.5 text-xs font-semibold transition-colors ${
                periode === p ? 'bg-primary text-white' : 'bg-white text-gray-600 hover:bg-gray-50'
              }`}
            >
              {p === 'journalier' ? 'Jour' : p === 'hebdomadaire' ? 'Semaine' : 'Mois'}
            </button>
          ))}
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() =>
            exporterRapportPdf({
              titre: LIBELLES_PERIODE[periode],
              sousTitre: `Contrat EPCM — ${libellePeriode}`,
              sections,
              nomFichier: `${nomFichier}.pdf`,
            })
          }
        >
          <FileText className="w-3.5 h-3.5 mr-1.5" />
          PDF
        </Button>
      </EnteteOnglet>

      {sections.map((section) => (
        <div key={section.titre} className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-200 flex items-center justify-between gap-3">
            <p className="text-sm font-semibold text-gray-900">{section.titre}</p>
            <Button
              variant="ghost"
              size="sm"
              disabled={section.lignes.length === 0}
              onClick={() =>
                exporterCsv({
                  colonnes: section.colonnes,
                  lignes: section.lignes,
                  nomFichier: `${nomFichier}-${section.titre.toLowerCase().replace(/[^a-z]+/g, '-')}`,
                })
              }
            >
              <FileSpreadsheet className="w-3.5 h-3.5 mr-1.5" />
              Excel
            </Button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-left text-xs text-gray-500">
                  {section.colonnes.map((c) => (
                    <th key={c} className="px-3 py-2 font-medium whitespace-nowrap">
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {section.lignes.map((ligne, i) => (
                  <tr key={i}>
                    {ligne.map((valeur, j) => (
                      <td key={j} className={`px-3 py-2 whitespace-nowrap ${j === 0 ? 'text-gray-900' : 'text-gray-600'}`}>
                        {valeur ?? '—'}
                      </td>
                    ))}
                  </tr>
                ))}
                {section.lignes.length === 0 && (
                  <tr>
                    <td colSpan={section.colonnes.length} className="px-5 py-6 text-center text-gray-400 text-sm">
                      {section.messageVide ?? 'Aucune donnée.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  )
}
