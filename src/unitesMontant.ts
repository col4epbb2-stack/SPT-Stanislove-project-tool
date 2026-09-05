import type { CodeDevise, EchelleMontant } from '../types/devise'

// Unité dans laquelle chaque module enregistre ses montants (18/08/2026).
//
// Ces unités ne sont pas un choix d'interface : ce sont celles des classeurs
// sources, dans lesquelles tout l'historique importé est déjà compté (colonnes
// « KUSD » de la navette et de la feuille de route, montants en francs CFA des
// journaux terrain et des contrats fournisseurs). Le référentiel des devises
// ne les change pas — il permet de saisir dans une autre devise et convertit
// vers celle-ci.
//
// Rassemblées ici plutôt que recopiées dans chaque formulaire : c'était déjà
// une chaîne 'XAF' en dur dans une demi-douzaine de fichiers, et l'écran
// Devises a besoin de la même liste pour dire où les devises s'appliquent.

export interface UniteMontant {
  devise: CodeDevise
  echelle: EchelleMontant
}

/** Montants budgétaires des classeurs navette / feuille de route : milliers de dollars. */
export const UNITE_KUSD: UniteMontant = { devise: 'USD', echelle: 'millier' }

/** Journaux terrain et contrats fournisseurs (SESI, GMI…) : francs CFA à l'unité. */
export const UNITE_XAF: UniteMontant = { devise: 'XAF', echelle: 'unite' }

/** Unité d'un module dont la devise est portée par la donnée (fiche projet, ligne navette, contrat EPCM). */
export function uniteDe(devise: CodeDevise, echelle: EchelleMontant = 'unite'): UniteMontant {
  return { devise, echelle }
}

export interface EmploiDevise {
  module: string
  ou: string
  /**
   * Unité d'enregistrement, quand le module en a une fixe. `null` = elle est
   * portée par la donnée elle-même (la ligne navette, la fiche projet et le
   * contrat EPCM choisissent la leur).
   */
  unite: UniteMontant | null
  /** D'où vient cette unité — le classeur, ou la donnée elle-même. */
  origine: string
}

// Où l'application enregistre ses montants — la carte des unités de stockage,
// affichée par l'écran Devises.
//
// **19/08/2026** : ces unités étaient des chaînes de prose (« KUSD »,
// « Devise de la fiche projet ») qui ne servaient qu'à remplir un tableau.
// Elles deviennent des `UniteMontant` exploitables, pour que l'écran calcule
// ce qu'il annonce — le taux appliqué, un exemple converti, et le fait qu'un
// module ne soit pas convertible — au lieu de le décrire de mémoire. Une
// unité fausse s'y voit désormais, au lieu de rester vraie sur le papier.
export const EMPLOIS_DEVISE: EmploiDevise[] = [
  {
    module: 'Navette',
    ou: 'Budget initial, révisions PDC, répartition CONSO/SERV/LOG/PERS/AUTRES',
    unite: null,
    origine: 'Chaque ligne navette porte sa devise (colonne du classeur), comptée en milliers.',
  },
  {
    module: 'Feuille de route',
    ou: 'BU initial, PDC02, engagement (PO), estimation',
    unite: UNITE_KUSD,
    origine: 'Colonnes « KUSD » du classeur feuille de route.',
  },
  {
    module: 'Projets',
    ou: 'Budget prévisionnel, commandes et factures de la fiche',
    unite: null,
    origine: 'Champ `devise` de la fiche, choisi à sa création.',
  },
  {
    module: 'Contrats',
    ou: 'Valeur cible, consommation mensuelle saisie',
    unite: UNITE_XAF,
    origine: 'Contrats fournisseurs (SESI, GMI) libellés en francs CFA.',
  },
  {
    module: 'Contrat EPCM',
    ou: 'Coût journalier, forfait mensuel vendu, budget du contrat',
    unite: null,
    origine: 'Champ `devise` du contrat, saisi dans l’onglet Financier.',
  },
  {
    module: 'Contrat peinture',
    ou: 'Coûts du journal de pointage, coût stand-by',
    unite: UNITE_XAF,
    origine: 'Classeur peinture (tarifs GMI en francs CFA).',
  },
  {
    module: 'Travaux METAL',
    ou: 'Coût réel d’une affaire',
    unite: UNITE_XAF,
    origine: 'Colonne « Coût réel (XAF) » du classeur METAL.',
  },
  {
    module: 'Suivi hebdo CRJ',
    ou: 'Grille de tarifs NPT (personnel, matériel)',
    unite: UNITE_XAF,
    origine: 'Tarifs journaliers des sociétés intervenantes.',
  },
]
