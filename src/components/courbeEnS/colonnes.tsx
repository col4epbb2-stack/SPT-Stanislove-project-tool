import { Pencil } from 'lucide-react'
import type { ColonneTableau } from '../ui/TableauColonnes'
import type { ActiviteCourbe } from '../../types/courbeEnS'
import { calculsActivite, gabarit } from '../../lib/courbeEnSEngine'
import { formatDate, formatNombre, formatPercent } from '../../lib/format'

// Les 18 colonnes des feuilles Projet_Baseline / Forecast / Réalisé
// Actualisé, décrites une seule fois (même principe que
// components/metal/colonnes.tsx).
//
// Les 4 dernières — Duation (d), Pondération, Pondération par phase,
// BU / Phase — sont les colonnes calculées du classeur : elles ne sont pas
// stockées mais recalculées par lib/courbeEnSEngine.ts à partir des dates,
// donc toujours cohérentes avec la ligne affichée.

const texte = (v: string | null | undefined) => v ?? '—'

export function colonnesActivites({
  toutes,
  onEditer,
}: {
  // Toutes les activités de la même feuille : la « Pondération » d'une ligne
  // se calcule sur la durée totale de la feuille, pas sur la page affichée.
  toutes: ActiviteCourbe[]
  onEditer?: (activite: ActiviteCourbe) => void
}): ColonneTableau<ActiviteCourbe>[] {
  const colonnes: ColonneTableau<ActiviteCourbe>[] = [
    { cle: 'ordre', entete: 'N° Ordre', valeur: (a) => a.ordre, align: 'right' },
    {
      cle: 'projet',
      entete: 'Projet',
      valeur: (a) => a.projet,
      classeCellule: 'max-w-64 truncate',
      titre: (a) => a.projet,
    },
    { cle: 'typeAvis', entete: 'Types AVIS/DDM/SOR', valeur: (a) => texte(a.typeAvis) },
    { cle: 'classification', entete: 'Classification', valeur: (a) => texte(a.classification) },
    { cle: 'phase', entete: 'Phase', valeur: (a) => texte(a.phase) },
    {
      cle: 'activite',
      entete: 'Activity Name / Sous-phase',
      valeur: (a) => texte(a.activite),
      classeCellule: 'max-w-56 truncate',
      titre: (a) => a.activite ?? undefined,
    },
    { cle: 'champ', entete: 'Champs', valeur: (a) => texte(a.champ) },
    { cle: 'plateforme', entete: 'Plateformes', valeur: (a) => texte(a.plateforme) },
    { cle: 'service', entete: 'Services', valeur: (a) => texte(a.service) },
    {
      cle: 'debut',
      entete: 'Start',
      valeur: (a) => (a.debut ? formatDate(a.debut) : '—'),
      texte: (a) => a.debut,
    },
    { cle: 'fin', entete: 'End', valeur: (a) => (a.fin ? formatDate(a.fin) : '—'), texte: (a) => a.fin },
    {
      cle: 'duree',
      entete: 'Duation (d)',
      align: 'right',
      valeur: (a) => formatNombre(calculsActivite(a, toutes).duree),
      texte: (a) => calculsActivite(a, toutes).duree,
    },
    {
      cle: 'courbeType',
      entete: 'Typical S-curve',
      valeur: (a) => (a.courbeType ? `${a.courbeType} — ${gabarit(a.courbeType)?.nom ?? ''}` : '—'),
      classeCellule: 'max-w-48 truncate',
      titre: (a) => gabarit(a.courbeType)?.nom,
    },
    { cle: 'tests', entete: 'Tests', valeur: (a) => texte(a.tests) },
    {
      cle: 'budget',
      entete: 'Budget',
      align: 'right',
      valeur: (a) => formatNombre(a.budget),
      texte: (a) => a.budget,
    },
    {
      cle: 'ponderation',
      entete: 'Pondération',
      align: 'right',
      valeur: (a) => formatPercent(calculsActivite(a, toutes).ponderation, 2),
      texte: (a) => calculsActivite(a, toutes).ponderation,
    },
    {
      cle: 'ponderationPhase',
      entete: 'Pondération par phase',
      align: 'right',
      valeur: (a) => formatPercent(calculsActivite(a, toutes).ponderationParPhase, 2),
      texte: (a) => calculsActivite(a, toutes).ponderationParPhase,
    },
    {
      cle: 'buPhase',
      entete: 'BU / Phase',
      align: 'right',
      valeur: (a) => formatNombre(calculsActivite(a, toutes).buPhase),
      texte: (a) => calculsActivite(a, toutes).buPhase,
    },
  ]

  if (!onEditer) return colonnes

  return [
    {
      cle: 'editer',
      entete: '',
      exportable: false,
      valeur: (a) => (
        <button
          type="button"
          onClick={() => onEditer(a)}
          title="Modifier cette activité"
          className="p-1 rounded-lg text-gray-400 hover:text-primary hover:bg-primary/10 transition-colors"
        >
          <Pencil className="w-3.5 h-3.5" />
        </button>
      ),
    },
    ...colonnes,
  ]
}
