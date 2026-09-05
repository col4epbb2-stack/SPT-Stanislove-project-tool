import type { AliasProjet, ChampCode, FournisseurRef } from '../types/referentiels'

// Valeurs des référentiels partagés, mesurées dans les données réelles des
// classeurs (Logique_metier_liaisons_ICP.docx §3.1).

export const CHAMPS: ChampCode[] = ['AGM', 'TRM', 'IM']

// Plateformes rencontrées dans les classeurs — information **distincte** du
// champ (22/08/2026). La liste n'est pas fermée : elle sert de suggestions à
// la saisie, et Paramètres › Listes de valeurs (`commun.plateformes`) permet
// d'en déclarer d'autres sans toucher au code.
export const PLATEFORMES: string[] = ['BDN', 'BDNM', 'TRM2', 'MDJ', 'PG', 'TCN']

// Roll-up site/plateforme → champ par préfixe du code site (mesuré 32/39
// sites rattachés : AGM12 → AGM, TRM1 → TRM, PG2 → IM…).
//
// MDJ et BDN(M) n'y figurent plus : ce sont des plateformes, et **à quel
// champ elles se rattachent n'a pas été dit**. Leur laisser un champ homonyme
// aurait produit une valeur hors référentiel, incompatible avec le champ réel
// de la fiche — un site inconnu rend désormais `null`, ce qui élargit le
// rapprochement flou au lieu de le fausser.
export const PREFIXES_SITE_CHAMP: [RegExp, ChampCode][] = [
  [/^AGM/, 'AGM'],
  [/^TRM/, 'TRM'],
  [/^(PG|TCN|IM)/, 'IM'],
]

// Titulaires de contrats, sociétés CRJ et fournisseurs PO.
export const FOURNISSEURS: FournisseurRef[] = [
  { nom: 'GMI', alias: [] },
  { nom: 'SESI', alias: ['SESI-TEEPG'] },
  { nom: 'CTPM', alias: [] },
  { nom: 'ADF/SGSI', alias: ['ADF', 'SGSI'] },
  { nom: 'FRIEDLANDER', alias: [] },
]

// Service client / leader / demandeur / consommateur — commun à 5+ modules.
export const SERVICES: string[] = ['CONSTRUCTION', 'METAL', 'EXP', 'PROJET', 'OPP', 'TELECOM', 'QUALITE/ICP']

// Table d'alias nom libre → projetId : vide au départ, alimentée au fil du
// rapprochement (persistance : Phase 5).
export const initialAliasProjets: AliasProjet[] = []
