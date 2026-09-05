// Palette des tuiles et barres d'indicateurs. Dans son propre fichier : un
// module qui exporte à la fois des composants et des constantes casse le
// rafraîchissement à chaud de Vite (règle react-refresh/only-export-components).

export const TONS_KPI = {
  primary: { fond: 'bg-primary/10', texte: 'text-primary', barre: 'bg-primary' },
  accent: { fond: 'bg-accent/15', texte: 'text-accent', barre: 'bg-accent' },
  emerald: { fond: 'bg-emerald-100', texte: 'text-emerald-700', barre: 'bg-emerald-500' },
  amber: { fond: 'bg-amber-100', texte: 'text-amber-700', barre: 'bg-amber-500' },
  red: { fond: 'bg-red-100', texte: 'text-red-700', barre: 'bg-red-500' },
  gray: { fond: 'bg-gray-100', texte: 'text-gray-500', barre: 'bg-gray-400' },
} as const

export type TonKpi = keyof typeof TONS_KPI
