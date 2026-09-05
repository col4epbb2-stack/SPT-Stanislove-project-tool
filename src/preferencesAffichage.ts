import { useCallback, useState } from 'react'

// Préférences d'affichage d'un écran (colonnes visibles, sections dépliées…)
// gardées d'une session à l'autre. Volontairement en localStorage et pas en
// Firestore : ce n'est pas de la donnée métier, ça ne concerne que le poste
// de celui qui regarde, et une écriture Firestore par case cochée serait
// disproportionnée.
const PREFIXE = 'icp:affichage:'

function lire<T>(cle: string, defaut: T): T {
  try {
    const brut = localStorage.getItem(PREFIXE + cle)
    return brut === null ? defaut : (JSON.parse(brut) as T)
  } catch {
    // Navigation privée / quota / valeur corrompue : on repart du défaut
    // plutôt que de casser le rendu de la page.
    return defaut
  }
}

export function usePreferenceAffichage<T>(cle: string, defaut: T) {
  const [valeur, setValeurState] = useState<T>(() => lire(cle, defaut))

  const setValeur = useCallback(
    (v: T) => {
      setValeurState(v)
      try {
        localStorage.setItem(PREFIXE + cle, JSON.stringify(v))
      } catch {
        // La préférence reste alors valable pour la session en cours.
      }
    },
    [cle]
  )

  return [valeur, setValeur] as const
}

/**
 * Sélection d'affichage (colonnes, sections, cycles…) gardée d'une session à
 * l'autre — variante de `usePreferenceAffichage` qui sait accueillir une
 * option ajoutée **après** le dernier enregistrement.
 *
 * Le problème qu'elle règle (constaté le 18/08/2026) : la liste stockée est
 * celle des éléments visibles, et le défaut ne s'applique qu'en l'absence de
 * valeur stockée. Une section ajoutée au produit n'apparaissait donc jamais
 * chez quelqu'un ayant déjà ouvert l'écran — son localStorage ne la
 * mentionnait pas, elle passait pour décochée.
 *
 * D'où le second champ enregistré, `connus` : le catalogue des options au
 * moment de l'enregistrement. À la relecture, une option **présente dans le
 * défaut mais inconnue de cet enregistrement** est ajoutée aux visibles ;
 * une option que l'utilisateur a décochée, elle, figure dans `connus` et
 * reste masquée.
 *
 * Reprise des anciennes valeurs (simple tableau) : elles n'ont pas de
 * `connus`, on prend la liste elle-même. Conséquence assumée et unique — une
 * option du défaut qui avait été décochée réapparaît une fois, puis le premier
 * enregistrement rétablit le comportement exact.
 */
export function usePreferenceSelection(
  cle: string,
  defaut: string[],
  catalogue: string[]
): readonly [string[], (v: string[]) => void] {
  const [stocke, setStocke] = useState<{ ids: string[]; connus: string[] }>(() => {
    const brut = lire<{ ids: string[]; connus: string[] } | string[] | null>(cle, null)
    if (brut === null) return { ids: defaut, connus: catalogue }
    if (Array.isArray(brut)) return { ids: brut, connus: brut }
    return brut
  })

  const setValeur = useCallback(
    (ids: string[]) => {
      const valeur = { ids, connus: catalogue }
      setStocke(valeur)
      try {
        localStorage.setItem(PREFIXE + cle, JSON.stringify(valeur))
      } catch {
        // La préférence reste alors valable pour la session en cours.
      }
    },
    [cle, catalogue]
  )

  return [selectionEffective(stocke, defaut), setValeur] as const
}

/**
 * Sélection réellement affichée : ce qui a été enregistré, plus les options du
 * défaut qui n'existaient pas encore lors de cet enregistrement. Isolée du
 * hook pour être vérifiable.
 */
export function selectionEffective(
  stocke: { ids: string[]; connus: string[] },
  defaut: string[]
): string[] {
  const nouvelles = defaut.filter((id) => !stocke.connus.includes(id))
  return nouvelles.length === 0 ? stocke.ids : [...stocke.ids, ...nouvelles]
}

// Coche/décoche un identifiant dans une liste de sélection.
export function basculer(selection: string[], id: string): string[] {
  return selection.includes(id) ? selection.filter((s) => s !== id) : [...selection, id]
}
