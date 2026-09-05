import { createContext } from 'react'
import type { OpportuniteProjet, Projet, ProjetInput, RisqueProjet } from '../types/project'
import type { ReferenceOT } from '../types/referencesProjet'
import type { ModificationScopeInput, SuiviPhase } from '../types/suivi'
import type { CommandeMaterielInput } from '../types/procurement'
import type { Commande, Facture } from '../types/project'
import type { AjouterAugmentationInput, CreerCommandeInput, ModifierCommandeInput } from '../lib/commandesEngine'
import type { SaisieHSEMensuelleInput } from '../types/hse'
import type { HypotheseInput } from '../types/hypothese'
import type { PieceJointe } from '../types/pieceJointe'
import type { ActionInput } from '../types/action'
import type { TonnageEntryInput, PeintureEntryInput, CRJEntryInput, StandbyEntryInput } from '../types/travauxTerrain'
import type { ActiviteInput, TacheInput } from '../types/planning'
import type { NumeroCourbeType } from '../types/courbeEnS'
import type { CycleBudgetId } from '../types/navette'
import type { ReferenceProjetGroupe } from '../lib/projectsSuppression'

/** Champs de présentation modifiables depuis la fiche (voir `definirPresentationProjet`). */
export type PresentationProjetInput = Partial<
  Pick<Projet, 'contexte' | 'risques' | 'mitigationRisques' | 'opportunites' | 'gainsAttendus'>
>

export interface ProjectsContextValue {
  projects: Projet[]
  createProject: (input: ProjetInput) => Projet
  /**
   * Transfère les fiches d'un chargé d'affaires à un autre (20/08/2026).
   *
   * Écrit pour la suppression d'un compte : `agentId` est ce qui donne à un
   * agent l'accès à ses fiches (ProjectsPage, tableau de bord, journaux
   * terrain filtrés « mon périmètre »). Supprimer le compte sans transférer
   * laisserait des fiches rattachées à un identifiant qui ne désigne plus
   * personne — invisibles pour tous sauf les admins, et sans responsable.
   *
   * Rend le nombre de fiches transférées.
   */
  reaffecterProjets: (deAgentId: string, versAgentId: string) => Promise<number>
  /**
   * Supprime définitivement une fiche (04/09/2026, admin uniquement — même
   * régime que la suppression d'une ligne navette ou d'un contrat).
   *
   * `groupes` (calculé par `trouverReferencesProjet`, affiché à l'admin avant
   * confirmation) porte les documents à détacher (`projetId` remis à `null`,
   * jamais supprimés eux-mêmes) : lignes navette, feuille de route, journaux
   * terrain (CRJ/Tonnage/Peinture/METAL), activités courbe en S, Procurement.
   * Bloquée en amont, côté écran, si la fiche porte encore des commandes —
   * donnée financière, pas un simple lien de classement.
   */
  supprimerProjet: (projetId: string, groupes: ReferenceProjetGroupe[]) => Promise<void>
  ajouterReferenceProjet: (projetId: string, type: 'avis' | 'ot', valeur: string) => void
  retirerReferenceProjet: (projetId: string, type: 'avis' | 'ot', valeur: string) => void
  definirClesProjet: (projetId: string, cles: { codeOTP?: string; champ?: string }) => void
  /**
   * Groupes OT → avis de la fiche (22/08/2026). L'écran calcule la liste
   * suivante avec les règles pures de `types/referencesProjet.ts` (un avis ne
   * dépend que d'un seul OT) ; le contexte l'enregistre et remet les listes
   * plates `avisNumeros`/`numerosOT` d'accord avec elle — ce sont elles que
   * le résolveur indexe.
   */
  definirReferencesOT: (projetId: string, references: ReferenceOT[]) => void
  /** Plateformes de l'affaire — plusieurs par fiche (22/08/2026). */
  definirPlateformes: (projetId: string, plateformes: string[]) => void
  /** Comptes d'imputation supplémentaires (codes OTP) — voir `tousLesCodesOTP`. */
  definirCodesOTP: (projetId: string, codes: string[]) => void
  /**
   * Contexte, risques, mitigation, opportunités et gains de la fiche
   * (22/08/2026, demande explicite : « il n'est pas clair de quelle manière ces
   * informations peuvent être modifiées ; il est indispensable de prévoir une
   * fonctionnalité permettant leur mise à jour »).
   *
   * Ces cinq champs n'étaient saisis qu'à la création de la fiche et
   * n'étaient modifiables nulle part ensuite — une analyse de risques est
   * pourtant ce qui bouge le plus au fil d'un chantier. Mise à jour partielle :
   * l'écran enregistre un champ à la fois, les autres ne sont pas touchés.
   */
  definirPresentationProjet: (projetId: string, champs: PresentationProjetInput) => void
  /**
   * Remplace l'analyse de risques de la fiche (23/08/2026) — un couple risque /
   * mitigation par entrée, autant que nécessaire.
   *
   * Une seule méthode plutôt qu'ajouter/modifier/supprimer : chaque écriture
   * sauvegarde de toute façon le document entier (`sauvegarderProjet`), et
   * l'écran compose la liste avant d'écrire. Les textes libres `risques` /
   * `mitigationRisques` du modèle précédent ne sont pas touchés.
   */
  definirRisquesProjet: (projetId: string, risques: RisqueProjet[]) => void
  /** Même chose pour les opportunités et leurs gains attendus (23/08/2026). */
  definirOpportunitesProjet: (projetId: string, opportunites: OpportuniteProjet[]) => void
  /**
   * Commandes (PO) de la collection autonome — **y compris celles qui ne sont
   * rattachées à aucune fiche projet** (25/08/2026, doc/module contrat.docx
   * §3 : topographie, EPCM). Celles qui ont une fiche sont en plus réinjectées
   * dans `projet.commandes`, où les écrans les lisent déjà.
   */
  commandes: Commande[]
  creerCommande: (input: Omit<CreerCommandeInput, 'creePar'>) => Promise<void>
  /** Identification seule : le montant ne se change que par une augmentation. */
  modifierCommande: (commandeId: string, input: ModifierCommandeInput) => Promise<void>
  ajouterAugmentationCommande: (commandeId: string, input: Omit<AjouterAugmentationInput, 'saisiPar'>) => Promise<void>
  /** Rattache une commande à une fiche, ou l'en détache (`null`). */
  rattacherCommande: (commandeId: string, projetId: string | null) => Promise<void>
  addCommande: (projetId: string, numero: string, montant: number, contratId: string, fournisseur?: string, libelle?: string) => void
  removeCommande: (projetId: string, commandeId: string) => void
  addFacture: (
    projetId: string,
    commandeId: string,
    numero: string,
    montant: number,
    date?: string,
    // Champs d'identification du fichier de suivi Excel (objet, service,
    // site, mois, date de réception, commentaire) — doc/module contrat.docx.
    complement?: Partial<Facture>
  ) => void
  /** Identification ou workflow de validation d'une facture (doc §5). */
  modifierFacture: (projetId: string, commandeId: string, factureId: string, patch: Partial<Facture>) => void
  removeFacture: (projetId: string, commandeId: string, factureId: string) => void
  updateSuiviPhase: (projetId: string, updated: SuiviPhase) => void
  // Une phase se crée avec ses activités (= tâches de planning), et la même
  // méthode sert à en ajouter à une phase existante (cf. ProjectsContext).
  ajouterPhaseSuivi: (projetId: string, phase: string, activites?: ActiviteInput[]) => void
  renommerPhaseSuivi: (projetId: string, ancien: string, nouveau: string) => void
  supprimerPhaseSuivi: (projetId: string, phase: string) => void
  addModificationScope: (projetId: string, input: ModificationScopeInput) => void
  removeModificationScope: (projetId: string, id: string) => void
  addAction: (projetId: string, input: ActionInput) => void
  toggleAction: (projetId: string, actionId: string) => void
  addDocumentCahierDesCharges: (projetId: string, document: PieceJointe) => void
  removeDocumentCahierDesCharges: (projetId: string, documentId: string) => void
  synchroniserSignalExterne: (projetId: string, sourceId: string, origine: string, commentaire: string) => void
  retirerSignalExterne: (projetId: string, signalId: string) => void
  addCommandeMateriel: (projetId: string, input: CommandeMaterielInput) => void
  receptionCommandeMateriel: (projetId: string, commandeId: string, dateReceptionReelle: string) => void
  saisirHSEMensuel: (projetId: string, input: SaisieHSEMensuelleInput) => void
  addActionHSE: (projetId: string, description: string) => void
  toggleActionHSE: (projetId: string, actionId: string) => void
  addHypothese: (projetId: string, input: HypotheseInput) => void
  retenirHypothese: (projetId: string, hypotheseId: string, valideParId: string) => void
  addPieceJointeHypothese: (projetId: string, hypotheseId: string, pieceJointe: PieceJointe) => void
  removePieceJointeHypothese: (projetId: string, hypotheseId: string, pieceJointeId: string) => void
  addCommentaireHypothese: (projetId: string, auteurId: string, texte: string) => void
  ajouterCommentaireProjet: (projetId: string, auteurId: string, texte: string) => void
  supprimerCommentaireProjet: (projetId: string, commentaireId: string) => void
  addTonnageEntry: (projetId: string, input: TonnageEntryInput) => void
  addPeintureEntry: (projetId: string, input: PeintureEntryInput) => void
  addCRJEntry: (projetId: string, input: CRJEntryInput) => void
  addStandbyEntry: (projetId: string, input: StandbyEntryInput) => void
  addTacheBaseline: (projetId: string, input: TacheInput) => void
  updateTacheBaseline: (projetId: string, tacheId: string, input: TacheInput) => void
  removeTacheBaseline: (projetId: string, tacheId: string) => void
  // Gabarit d'avancement (« Typical S-curve », 1 à 5) — posé sur les 3 vues à
  // la fois, cf. ProjectsContext.
  definirGabaritTache: (projetId: string, tacheId: string, gabarit: NumeroCourbeType | null) => void
  definirGabaritToutesTaches: (projetId: string, gabarit: NumeroCourbeType) => void
  /**
   * Source du budget de la courbe en S : budget initial ou l'une des 4
   * révisions PDC (22/08/2026). Le montant n'est pas stocké — il est relu sur
   * la ou les lignes navette rattachées, comme le `XLOOKUP` de la feuille
   * Baseline va le chercher dans la table `Coût`.
   */
  definirSourceBudgetCourbe: (projetId: string, cycle: CycleBudgetId) => void
  updateForecastTacheDates: (projetId: string, tacheId: string, dateDebut: string, dateFin: string) => void
  updateReelTacheDates: (projetId: string, tacheId: string, dateDebut: string, dateFin: string) => void
  updateReelTacheAvancement: (projetId: string, tacheId: string, avancement: number) => void
  /**
   * Relevé hebdomadaire de la vue Réalisé (22/08/2026) : la saisie se fait
   * dans la semaine à laquelle elle appartient, comme dans la feuille du
   * classeur. `null` efface le relevé de cette semaine — une cellule vidée ne
   * vaut pas zéro. `avancement` de la tâche en est déduit (dernier relevé).
   */
  saisirAvancementHebdo: (projetId: string, tacheId: string, semaine: string, valeur: number | null) => void
}

export const ProjectsContext = createContext<ProjectsContextValue | undefined>(undefined)
