import type {
  GroupeAffichage,
  PresetAffichage,
} from "../ui/SelecteurAffichage";
import {
  CYCLE_BUDGET_ORDER,
  CYCLE_BUDGET_LABELS,
  type CycleBudgetId,
} from "../../types/navette";

// Ce que le tableau navette peut montrer ou masquer. Il porte 8 cycles
// budgétaires × 5 postes + le total, soit 48 colonnes de chiffres : les
// afficher toutes en permanence rend la lecture d'un exercice précis
// impossible. Les listes ci-dessous décrivent les colonnes une fois, la page
// s'en sert pour l'en-tête, les lignes et le pied "Total ICP" — plus de
// murs de <th>/<td> à garder synchronisés à la main.

// --- Postes d'un cycle budgétaire -------------------------------------------

export type ComposanteBudget =
  | "total"
  | "conso"
  | "serv"
  | "log"
  | "pers"
  | "autres";

export const COMPOSANTES_BUDGET: { id: ComposanteBudget; label: string }[] = [
  { id: "total", label: "Total" },
  { id: "conso", label: "CONSO" },
  { id: "serv", label: "SERV" },
  { id: "log", label: "LOG" },
  { id: "pers", label: "PERS" },
  { id: "autres", label: "AUTRES" },
];

// Par défaut : le total de chaque cycle seulement (8 colonnes au lieu de
// 48). Le détail poste par poste d'une ligne reste à un clic, dans
// NavetteLigneDetailModal, qui l'affiche déjà en entier.
export const COMPOSANTES_DEFAUT: ComposanteBudget[] = ["total"];

export const GROUPES_COMPOSANTES: GroupeAffichage[] = [
  { options: COMPOSANTES_BUDGET.map((c) => ({ id: c.id, label: c.label })) },
];

// Catalogue complet des postes — sert à `usePreferenceSelection`, qui compare
// les options connues au moment de l'enregistrement à celles d'aujourd'hui.
export const CATALOGUE_COMPOSANTES: string[] = COMPOSANTES_BUDGET.map(
  (c) => c.id,
);

export const PRESETS_COMPOSANTES: PresetAffichage[] = [
  { label: "Totaux", ids: ["total"] },
  { label: "Détail", ids: COMPOSANTES_BUDGET.map((c) => c.id) },
];

// --- Cycles budgétaires ------------------------------------------------------

export const GROUPES_CYCLES: GroupeAffichage[] = [
  {
    titre: "Références",
    options: [
      { id: "realiseN1", label: CYCLE_BUDGET_LABELS.realiseN1 },
      { id: "BU", label: CYCLE_BUDGET_LABELS.BU },
      { id: "realiseYTD", label: CYCLE_BUDGET_LABELS.realiseYTD },
      { id: "BUN1", label: CYCLE_BUDGET_LABELS.BUN1 },
    ],
  },
  {
    titre: "Révisions trimestrielles",
    options: (["PDC02", "PDC05", "PDC09", "PDC11"] as CycleBudgetId[]).map(
      (id) => ({
        id,
        label: CYCLE_BUDGET_LABELS[id],
      }),
    ),
  },
];

export const PRESETS_CYCLES: PresetAffichage[] = [
  { label: "Budget vs réalisé", ids: ["realiseN1", "BU", "realiseYTD"] },
  { label: "Révisions PDC", ids: ["PDC02", "PDC05", "PDC09", "PDC11"] },
  { label: "Exercice suivant", ids: ["BU", "PDC11", "BUN1"] },
  { label: "Tout", ids: [...CYCLE_BUDGET_ORDER] },
];

export const CYCLES_DEFAUT: CycleBudgetId[] = [...CYCLE_BUDGET_ORDER];

// --- Colonnes d'identification ----------------------------------------------

// `libelle` est verrouillée : une ligne navette sans son libellé n'est plus
// identifiable, masquer la colonne rendrait le tableau inutilisable.
export const COLONNE_VERROUILLEE = "libelle";

export const GROUPES_COLONNES: GroupeAffichage[] = [
  {
    titre: "Identification",
    options: [
      { id: "rubrique", label: "Rubrique" },
      { id: "statut", label: "Statut", indice: "En cours / clôturée" },
      // « Type projet » = le type de la ligne (avis / DDM / SOR / autre),
      // saisi à la création et corrigeable ensuite. L'option portait jusqu'au
      // 23/08/2026 l'identifiant `programme` — le champ « Rubr » du classeur,
      // qu'aucune colonne ne rendait : la case était donc sans effet.
      { id: "type", label: "Type projet" },
      { id: "anneeBudget", label: "Année du budget" },
      { id: "codeOTP", label: "Code OTP" },
      { id: "libelle", label: "Libellé" },
      { id: "chargeAffaire", label: "Chargé d'affaires" },
      { id: "champ", label: "Champ" },
      // Absente de COLONNES_DEFAUT : elle n'est renseignée que sur les lignes
      // créées depuis l'application (les lignes du classeur n'ont pas de date
      // de création), et le tableau est déjà large. Elle est là pour qui
      // filtre par année de création.
      { id: "creeLe", label: "Créée le" },
    ],
  },
  {
    titre: "Suivi",
    options: [
      { id: "ficheProjet", label: "Feuille de route" },
      { id: "commentaire", label: "Commentaire" },
    ],
  },
];

export const CATALOGUE_COLONNES: string[] = GROUPES_COLONNES.flatMap((g) =>
  g.options.map((o) => o.id),
);

export const COLONNES_DEFAUT = [
  "rubrique",
  // Visible par défaut (20/08/2026) : une ligne clôturée doit se distinguer
  // d'une ligne active au premier coup d'œil, sans ouvrir son détail.
  "statut",
  "type",
  // Saisie à la création d'une ligne depuis le 18/08/2026 (elle y remplace le
  // programme) : visible par défaut, sinon la valeur saisie ne se lirait nulle
  // part. Les lignes reprises du classeur n'en portent pas.
  "anneeBudget",
  "codeOTP",
  "libelle",
  "chargeAffaire",
  "champ",
  "ficheProjet",
  "commentaire",
];

// --- Sections de la page -----------------------------------------------------

export const GROUPES_SECTIONS: GroupeAffichage[] = [
  {
    options: [
      {
        id: "kpi",
        label: "Bandeau indicateurs",
        indice: "CP, cale, arbitrages",
      },
      { id: "cale", label: "Pilotage de la cale" },
      { id: "taux", label: "Taux de change" },
      { id: "arbitrages", label: "Arbitrages en attente" },
      {
        id: "commentaires",
        label: "Synthèse des commentaires",
        indice: "Ce qui a été noté sur les lignes",
      },
    ],
  },
];

export const CATALOGUE_SECTIONS: string[] = GROUPES_SECTIONS.flatMap((g) =>
  g.options.map((o) => o.id),
);

export const SECTIONS_DEFAUT = [
  "kpi",
  "cale",
  "taux",
  "arbitrages",
  "commentaires",
];
