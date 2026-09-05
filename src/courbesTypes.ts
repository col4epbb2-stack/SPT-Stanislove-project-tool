import { COURBES_TYPES } from '../data/courbeEnS/courbesTypes'
import type { CourbeType, NumeroCourbeType } from '../types/courbeEnS'

// Accès aux 5 courbes types du paramétrage et à leurs couleurs. Dans un module
// séparé des composants qui s'en servent : un fichier qui exporte à la fois
// des composants et des constantes casse le rafraîchissement à chaud de Vite
// (même raison que components/ui/tonsKpi.ts).

/** Palette des 5 séries dans les graphiques du classeur (thème Office). */
export const COULEURS_COURBES_TYPES: Record<number, string> = {
  1: '#4472C4',
  2: '#ED7D31',
  3: '#A5A5A5',
  4: '#FFC000',
  5: '#5B9BD5',
}

export function couleurCourbeType(numero: number): string {
  return COULEURS_COURBES_TYPES[numero] ?? COULEURS_COURBES_TYPES[1]
}

export function courbeTypePar(numero: NumeroCourbeType): CourbeType | undefined {
  return COURBES_TYPES.find((c) => c.numero === numero)
}
