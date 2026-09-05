import { useCallback, useState } from 'react'
import { useDevises } from '../contexts/useDevises'
import type { CodeDevise } from '../types/devise'

// Devise proposée par défaut dans un formulaire qui crée une donnée portant
// la sienne (ligne navette, fiche projet) — 21/08/2026, demande explicite
// « faire match la devise sélectionnée par défaut avec celle qui s'affiche
// dans la page ».
//
// Le défaut doit être la **devise du système** (le pivot du référentiel,
// celle qu'affichent tous les écrans depuis le 19/08/2026), pas un `'USD'`
// écrit en dur qui cesse d'être le bon dès que le pivot change.
//
// Un `useState(pivot.code)` ne suffit pas, et c'est la raison d'être de ce
// hook : `DevisesContext` lit le référentiel dans Firestore, donc `pivot`
// vaut d'abord celui des valeurs par défaut (USD) puis change quand la
// lecture aboutit. Un initialiseur de `useState` ne s'exécutant qu'une fois,
// il fige cette première valeur — et ces modales sont montées avec la page,
// bien avant que le référentiel ne soit arrivé.
//
// D'où le choix explicite gardé à part : tant que l'utilisateur n'a rien
// choisi (`null`), la valeur **suit** le pivot ; dès qu'il choisit, c'est son
// choix qui fait foi, y compris s'il retombe sur le pivot.
export function useDeviseParDefaut() {
  const { pivot } = useDevises()
  const [choix, setChoix] = useState<CodeDevise | null>(null)

  // Après enregistrement : on revient au défaut du système, et non à la
  // dernière devise choisie ni à une constante — le formulaire rouvert doit
  // proposer la même chose qu'à la première ouverture.
  const reinitialiser = useCallback(() => setChoix(null), [])

  return { devise: choix ?? pivot.code, setDevise: setChoix, reinitialiser }
}
