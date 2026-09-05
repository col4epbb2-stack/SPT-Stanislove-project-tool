import type { TypeContrat } from '../../lib/contratsEngine'

// Partagé entre ContratsPage (vue portfolio) et ContratsTab (onglet projet) —
// référentiel unique de contrats (retour utilisateur : fusion des deux
// systèmes de contrats qui coexistaient sans lien).
export const TYPE_LABELS: Record<TypeContrat, string> = {
  METAL: 'Métal',
  TIG: 'TIG',
  PEINTURE: 'Peinture',
  ECHAFAUDAGE: 'Échafaudage',
  PERSONNEL_EPCM: 'Personnel (EPCM)',
  PLONGEE: 'Plongée',
  TOPOGRAPHIE: 'Topographie',
}
export const MOIS_LABELS = ['Janv', 'Févr', 'Mars', 'Avr', 'Mai', 'Juin', 'Juil', 'Août', 'Sept', 'Oct', 'Nov', 'Déc']
// Consommation dérivée automatiquement (plus de saisie, doc §3.3) — les
// autres types (TIG, Personnel EPCM, Plongée, Topographie) restent en saisie
// manuelle mensuelle en fallback, complétée par les commandes/factures
// rattachées (cf. ContratsTab).
export const TYPES_DERIVES = new Set<TypeContrat>(['METAL', 'ECHAFAUDAGE', 'PEINTURE'])

export const selectClass =
  'w-full px-4 py-3 rounded-xl border text-base bg-gray-50 border-gray-200 text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary focus:bg-white transition'
