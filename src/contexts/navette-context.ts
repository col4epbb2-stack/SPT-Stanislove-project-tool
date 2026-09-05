import { createContext } from 'react'
import type { AjustementArbitrage, ArbitrageInput, ArbitrageNavette, LigneNavette, LigneNavetteEdition, LigneNavetteInput, RFSRecurrent, ProjetCandidatBU, StatutLigneNavette, TauxChange } from '../types/navette'
import type { ProfilValidationNavette } from '../types/user'

export interface NavetteContextValue {
  lignes: LigneNavette[]
  chargement: boolean
  rfsRecurrents: RFSRecurrent[]
  projetsCandidatsBU: ProjetCandidatBU[]
  arbitrages: ArbitrageNavette[]
  // Réserve globale, une seule valeur pour toute l'application, totalement
  // indépendante du CP — piochée pour combler un déficit lors d'une
  // révision (cf. ArbitrageModal, NavetteContext.viserArbitrage). C'est le
  // "reste de cale à absorber" : décrémenté automatiquement (atomique côté
  // Firestore) à chaque révision validée qui pioche dedans.
  caleDisponible: number | null
  // Référence fixe "cale à absorber" fixée par un admin — ne se décrémente
  // jamais toute seule ; sert à dériver "arbitrages réalisés"
  // (caleInitiale - caleDisponible) et le taux d'absorption.
  caleInitiale: number | null
  // Taux de change (code → valeur en devise pivot) — vue navette du
  // référentiel des devises (contexts/DevisesContext.tsx, écran Devises).
  // C'était un réglage propre à la navette jusqu'au 18/08/2026 ; il n'y est
  // plus modifiable, seulement lu. Pas d'API
  // de conversion disponible dans cet environnement offline (CDS §5).
  tauxChange: TauxChange | null
  // Passent désormais par l'API (Firestore) : résultat connu de façon
  // asynchrone, contrairement au mock précédent.
  createLigne: (input: LigneNavetteInput) => Promise<LigneNavette>
  /**
   * Corrige les informations de création d'une ligne existante (21/08/2026) —
   * libellé, année du budget, rubrique, champ, chargé d'affaires, devise, WP
   * et budget initial.
   *
   * Deux limites portées par la signature elle-même : le **code OTP** n'y
   * figure pas (il est l'identifiant du document Firestore), et `BU` est
   * facultatif — fourni, il ne se propage qu'aux cycles qu'aucune révision
   * validée n'a écrits et qui portent encore exactement sa valeur
   * (`cyclesSuivantLeBU`). Réservé aux admins par `firestore.rules`
   * (`lignes_navette` est en `allow update: if estAdmin()`).
   */
  updateLigne: (ligneId: string, edition: LigneNavetteEdition) => Promise<void>
  linkToProject: (ligneId: string, projetId: string) => Promise<void>
  updateCommentaire: (ligneId: string, commentaire: string) => Promise<void>
  /**
   * Clôture ou rouvre une ligne (20/08/2026). Réversible, et sans effet sur
   * les budgets : une ligne clôturée garde ses cycles et son historique de
   * révisions — elle sort du travail courant, pas des chiffres.
   */
  definirStatutLigne: (ligneId: string, statut: StatutLigneNavette) => Promise<void>
  /**
   * Supprime définitivement une ligne (04/09/2026). Irréversible, contrairement
   * à `definirStatutLigne` : le document est retiré, son historique de
   * révisions dans `arbitrages_navette` n'est pas effacé mais devient orphelin.
   * Réservé aux admins par `firestore.rules` (`allow delete: if estAdmin()`).
   */
  supprimerLigne: (ligneId: string) => Promise<void>
  proposerArbitrage: (input: ArbitrageInput) => Promise<ArbitrageNavette>
  // Un visa du parcours à deux étapes (chef de département puis directeur
  // technique) — c'est le second qui valide la révision et applique le
  // budget. Lève si le profil ne correspond pas à l'étape en cours, ou si la
  // même personne tente les deux visas.
  viserArbitrage: (arbitrageId: string, viseurId: string, profil: ProfilValidationNavette) => Promise<void>
  /**
   * Les deux visas d'un coup, par un admin (23/08/2026, demande explicite
   * « je veux que l'admin valide pour les deux profils ») : la révision passe
   * de « attente chef » à « validée » en une écriture, et est appliquée au
   * budget comme n'importe quel visa de directeur technique. Les deux visas
   * portent l'identité de l'admin — la trace dit donc qu'ils viennent de la
   * même personne, ce que l'écran affiche.
   *
   * Réservé aux admins côté écran, comme la cale ou les correctifs ; côté
   * base, `arbitrages_navette` est en `allow update: if estAdmin() ||
   * viseNavette()`.
   */
  viserLesDeuxEtapes: (arbitrageId: string, adminId: string) => Promise<void>
  /**
   * Réajuste une proposition **encore en attente** : nouveau montant, nouvelle
   * ventilation, nouveau prélèvement de cale éventuel. Le parcours repart au
   * visa du chef de département (cf. `parcoursApresAjustement`) — un visa déjà
   * donné portait sur un autre montant.
   */
  ajusterArbitrage: (arbitrageId: string, ajustement: AjustementArbitrage) => Promise<void>
  rejeterArbitrage: (arbitrageId: string, viseurId: string, motif?: string) => Promise<void>
  // Révision admin appliquée immédiatement (pas d'étape "en attente"),
  // pour corriger un cycle déjà validé ou hors de sa fenêtre normale — cf.
  // NavetteLigneDetailModal (bouton "Réviser (correctif)", admin only).
  reviserCorrectif: (input: ArbitrageInput, validateurId: string) => Promise<void>
  definirCale: (valeur: number) => Promise<void>
  definirCaleInitiale: (valeur: number) => Promise<void>
  /** Relit les lignes depuis Firestore — après une migration, par exemple. */
  rechargerLignes: () => Promise<void>
}

export const NavetteContext = createContext<NavetteContextValue | undefined>(undefined)
