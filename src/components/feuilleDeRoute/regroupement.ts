import type { LigneFdr } from './colonnes'

// Regroupement des projets de la feuille de route (20/08/2026, demande
// explicite « fais une section avec des regroupements des projets par
// catégories, mais une interface dynamique »).
//
// Le tableau montre 22 colonnes ligne à ligne ; il ne dit pas ce que pèse une
// catégorie. Cette partie-là est du calcul pur — pas de JSX, pas de contexte —
// pour que le composant ne fasse qu'afficher.
//
// « Dynamique » se lit ici : le critère de regroupement n'est pas figé sur la
// catégorie. Les colonnes de la feuille qui découpent naturellement le
// portefeuille (année BU, priorité, statut, service leader, champ) sont des
// critères au même titre, et le calcul est le même pour toutes.

export type CritereRegroupement =
  | 'categorie'
  | 'rubrique'
  | 'anneeBu'
  | 'priorite'
  | 'statut'
  | 'serviceLeader'
  | 'champs'

export const CRITERES_REGROUPEMENT: { id: CritereRegroupement; label: string; sansValeur: string }[] = [
  { id: 'categorie', label: 'Catégorie', sansValeur: 'Sans catégorie' },
  // OPEX / CAPEX (21/08/2026) : c'est l'axe d'agrégation que le classeur
  // porte et que la feuille de route n'affichait pas du tout.
  { id: 'rubrique', label: 'Rubrique (OPEX / CAPEX)', sansValeur: 'Sans rubrique' },
  { id: 'anneeBu', label: 'Année BU', sansValeur: 'Sans année BU' },
  { id: 'priorite', label: 'Priorité', sansValeur: 'Sans priorité' },
  { id: 'statut', label: 'Statut', sansValeur: 'Sans statut' },
  { id: 'serviceLeader', label: 'Service leader', sansValeur: 'Sans service leader' },
  { id: 'champs', label: 'Champ', sansValeur: 'Sans champ' },
]

export type TriRegroupement = 'nombre' | 'engagement' | 'avancement' | 'alpha'

export const TRIS_REGROUPEMENT: { id: TriRegroupement; label: string }[] = [
  { id: 'nombre', label: 'Nombre de projets' },
  { id: 'engagement', label: 'Engagement cumulé' },
  { id: 'avancement', label: 'Avancement moyen' },
  { id: 'alpha', label: 'Ordre alphabétique' },
]

export interface GroupeProjets {
  /** Valeur du critère, ou chaîne vide pour le groupe « sans ». */
  cle: string
  libelle: string
  /** Ce groupe rassemble les lignes qui ne portent pas le critère. */
  sansValeur: boolean
  lignes: LigneFdr[]
  // Les cinq montants du tableau, dans le même ordre — BU, PDC, Estimation,
  // Engagement, Factures (21/08/2026 : « ça affiche les totaux par
  // regroupement »). Seuls les trois derniers étaient cumulés.
  bu: number
  pdc: number
  engagement: number
  facture: number
  estimation: number
  /** Moyenne des avancements **renseignés** — `null` si aucun ne l'est. */
  avancementMoyen: number | null
  /** Lignes rapprochées d'une fiche projet. */
  liees: number
}

/** Valeur du critère sur une ligne, normalisée en texte. */
function valeurCritere(ligne: LigneFdr, critere: CritereRegroupement): string {
  // La rubrique n'est pas lue sur la ligne brute : elle vient de la ligne
  // navette rattachée quand il y en a une, et `calculerLigne` a déjà tranché.
  const brut = critere === 'rubrique' ? ligne.rubrique : ligne.p[critere]
  return brut === null || brut === undefined ? '' : String(brut).trim()
}

/**
 * Regroupe des lignes **déjà filtrées** — la section suit donc les filtres et
 * la recherche du tableau, sinon les deux vues de la même page se
 * contrediraient.
 *
 * L'engagement reprend la règle du tableau et des tuiles : le montant calculé
 * s'il existe, sinon le montant du PO. Une donnée absente ne compte pas comme
 * un zéro dans une moyenne (l'avancement rend `null` si rien n'est
 * renseigné), mais n'empêche pas de sommer les autres lignes.
 */
export function regrouperProjets(
  lignes: LigneFdr[],
  critere: CritereRegroupement,
  tri: TriRegroupement = 'nombre'
): GroupeProjets[] {
  const definition = CRITERES_REGROUPEMENT.find((c) => c.id === critere) ?? CRITERES_REGROUPEMENT[0]
  const parCle = new Map<string, LigneFdr[]>()

  for (const ligne of lignes) {
    const cle = valeurCritere(ligne, critere)
    const existant = parCle.get(cle)
    if (existant) existant.push(ligne)
    else parCle.set(cle, [ligne])
  }

  const groupes: GroupeProjets[] = [...parCle.entries()].map(([cle, lignesGroupe]) => {
    let bu = 0
    let pdc = 0
    let engagement = 0
    let facture = 0
    let estimation = 0
    let liees = 0
    let sommeAvancement = 0
    let nbAvancement = 0

    for (const l of lignesGroupe) {
      bu += l.buKusd ?? 0
      pdc += l.pdcKusd ?? 0
      engagement += l.engagementKusd ?? l.p.montantPO ?? 0
      facture += l.factureKusd ?? 0
      estimation += l.p.estimationKusd ?? 0
      if (l.resolution) liees += 1
      const avancement = l.avancement ?? l.p.avancementReel
      if (avancement != null) {
        sommeAvancement += avancement
        nbAvancement += 1
      }
    }

    return {
      cle,
      libelle: cle || definition.sansValeur,
      sansValeur: cle === '',
      lignes: lignesGroupe,
      bu,
      pdc,
      engagement,
      facture,
      estimation,
      avancementMoyen: nbAvancement > 0 ? sommeAvancement / nbAvancement : null,
      liees,
    }
  })

  const comparer: Record<TriRegroupement, (a: GroupeProjets, b: GroupeProjets) => number> = {
    nombre: (a, b) => b.lignes.length - a.lignes.length || a.libelle.localeCompare(b.libelle),
    engagement: (a, b) => b.engagement - a.engagement || a.libelle.localeCompare(b.libelle),
    // Un groupe sans avancement connu passe en dernier plutôt que d'être
    // traité comme un groupe à 0 % — il n'est pas en retard, il est muet.
    avancement: (a, b) =>
      (b.avancementMoyen ?? -1) - (a.avancementMoyen ?? -1) || a.libelle.localeCompare(b.libelle),
    alpha: (a, b) => a.libelle.localeCompare(b.libelle),
  }

  groupes.sort(comparer[tri])

  // Le groupe « sans valeur » est toujours en fin de liste, quel que soit le
  // tri : c'est un trou à combler, pas une catégorie du portefeuille.
  return [...groupes.filter((g) => !g.sansValeur), ...groupes.filter((g) => g.sansValeur)]
}
