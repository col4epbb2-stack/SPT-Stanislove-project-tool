// Helpers communs à tous les modules de saisie (CRJ, Tonnage échafaudage,
// Facturation au point). Ces deux fonctions étaient dupliquées à l'identique
// dans src/pages/SuiviHebdoCrjPage.tsx et src/pages/TonnageEchafPage.tsx —
// elles décrivent la même mécanique de fond : des lignes historiques
// importées (collections verrouillées en écriture) fusionnées à l'affichage
// avec les lignes saisies depuis l'app (collections dédiées), une saisie
// remplaçant la ligne importée de même clé métier plutôt que de la dupliquer.

export function combinerParCle<T>(importe: T[], saisi: T[], cle: (l: T) => string): T[] {
  const clesSaisies = new Set(saisi.map(cle))
  return [...importe.filter((l) => !clesSaisies.has(cle(l))), ...saisi]
}

export function aujourdHui(): string {
  return new Date().toISOString().slice(0, 10)
}

// Valeurs distinctes d'une colonne, triées : alimente à la fois les filtres
// des tableaux et les listes suggérées (datalist) des formulaires. Écrite une
// fois ici plutôt que recopiée dans chaque onglet — et hors composant, pour
// ne pas devenir une dépendance instable des useMemo qui l'utilisent.
// `complement` permet d'ajouter les valeurs d'un référentiel qui ne sont pas
// encore utilisées par une ligne.
export function valeursDistinctes<T>(lignes: T[], cle: keyof T, complement: string[] = []): string[] {
  const valeurs = lignes
    .map((l) => l[cle])
    .filter((v): v is T[keyof T] & string => typeof v === 'string' && v !== '')
  return [...new Set<string>([...valeurs, ...complement])].sort()
}

// Fusionne une liste dérivée des données avec les valeurs ajoutées à la main
// dans Paramètres › Listes de valeurs (18/08/2026). Additive par
// construction : une valeur portée par des lignes réelles reste proposée même
// si personne ne l'a déclarée, et une valeur déclarée apparaît avant sa
// première utilisation — ce que `valeursDistinctes` seule ne permettait pas.
/**
 * Découpe une saisie multi-valeurs : « AV-1, AV-2 », un par ligne, ou séparés
 * par des points-virgules. Sert partout où un champ porte plusieurs
 * références (plateformes, avis d'un OT, comptes d'imputation).
 */
export function decouperListe(saisie: string): string[] {
  return saisie
    .split(/[\n,;]+/)
    .map((v) => v.trim())
    .filter(Boolean)
}

export function avecAjouts(valeurs: string[], ajouts: string[]): string[] {
  if (ajouts.length === 0) return valeurs
  return [...new Set([...valeurs, ...ajouts])].sort((a, b) => a.localeCompare(b, 'fr'))
}

// Ponts entre l'état d'un formulaire tenu en texte (la plupart des modales de
// l'application gardent leurs champs en `string`, pour laisser un champ vide
// exister) et `ChampMontant`, qui parle en nombres parce qu'il convertit.
export function montantDepuisTexte(texte: string): number | null {
  if (texte.trim() === '') return null
  const nombre = Number(texte)
  return Number.isFinite(nombre) ? nombre : null
}

export function texteDepuisMontant(valeur: number | null): string {
  return valeur === null ? '' : String(valeur)
}
