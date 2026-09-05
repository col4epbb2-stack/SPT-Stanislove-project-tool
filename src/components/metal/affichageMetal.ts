import type { GroupeAffichage } from '../ui/SelecteurAffichage'

// Colonnes affichables du tableau Travaux METAL (04/09/2026, lot 1 du recueil
// doc/recueil-module-travaux-metal.md) — même patron que
// components/navette/affichageNavette.ts. Jusqu'ici les 42 colonnes étaient
// toutes affichées en permanence, sans aucun moyen d'en masquer certaines :
// c'est ce sélecteur qui l'introduit pour ce tableau.
//
// La colonne d'action `editer` n'est volontairement pas listée ici : elle
// n'est pas une donnée à choisir d'afficher ou non, elle reste toujours en
// tête (cf. AffairesTab.tsx).

export const COLONNE_VERROUILLEE = 'affaire'

export const GROUPES_COLONNES: GroupeAffichage[] = [
  {
    titre: 'Identification',
    options: [
      { id: 'affaire', label: 'Affaire' },
      { id: 'liaison', label: 'Liaison' },
      { id: 'typeCoreCrew', label: 'Type de Core crew' },
      { id: 'typeAvis', label: "Type d'avis" },
      { id: 'priorite', label: 'Priorité' },
      { id: 'po', label: 'PO' },
      { id: 'ot', label: 'OT' },
      { id: 'avis', label: 'Avis' },
      { id: 'champ', label: 'Champ' },
      { id: 'plateforme', label: 'Plateforme' },
      { id: 'risques', label: 'Risques' },
      { id: 'typeTravaux', label: 'Type de travaux' },
      { id: 'statutTravaux', label: 'Statut travaux' },
      { id: 'statutCorrige', label: 'Statut corrigé' },
    ],
  },
  {
    titre: 'Planning',
    options: [
      { id: 'dateDemande', label: 'Date demande' },
      { id: 'dateDebutPlanning', label: 'Début planning' },
      { id: 'dateFinPlanningPrev', label: 'Fin prév.' },
      { id: 'dateDebutReel', label: 'Début réel' },
      { id: 'dateFinReel', label: 'Fin réelle' },
      { id: 'dureeTraitement', label: 'Durée traitement demande (j)' },
      { id: 'dureeProjet', label: 'Durée projet (j)' },
      { id: 'dureePlanning', label: 'Durée planning (j)' },
    ],
  },
  {
    titre: 'Avancement',
    options: [
      { id: 'etude', label: 'Étude' },
      { id: 'dureeMto', label: 'Durée MTO' },
      { id: 'tempsMisMto', label: 'Temps mis MTO' },
      { id: 'prevMto', label: 'Prév. MTO' },
      { id: 'fourniture', label: 'Fourniture' },
      { id: 'prefab', label: 'Préfab' },
      { id: 'pctReparation', label: '% réparation' },
      { id: 'travauxSite', label: 'Tvx sur site' },
      { id: 'avctPrev', label: 'Avct général prév.' },
      { id: 'avctReel', label: 'Avct général réel' },
    ],
  },
  {
    titre: 'Documentation finale',
    options: [
      { id: 'cfp', label: 'CFP' },
      { id: 'cfpDate', label: 'Date CFP' },
      { id: 'checkCfp', label: 'Check CFP' },
      { id: 'cft', label: 'CFT' },
      { id: 'cftDate', label: 'Date CFT' },
      { id: 'checkCft', label: 'Check CFT' },
      { id: 'dfa', label: 'DFA' },
      { id: 'dfaDate', label: 'Date DFA' },
      // Check DFA reste visible par défaut, contrairement à Check CFP/CFT
      // (masqués, lot 1) : le document demande explicitement de « dire si le
      // DFA a été validé » (MET-23), c'est l'inverse d'un champ back end.
      { id: 'checkDfa', label: 'Check DFA' },
    ],
  },
  {
    titre: 'Coût & statut',
    options: [
      { id: 'coutReel', label: 'Coût réel' },
      { id: 'statut', label: 'Statut' },
      { id: 'commentaire', label: 'Commentaire' },
    ],
  },
]

export const CATALOGUE_COLONNES: string[] = GROUPES_COLONNES.flatMap((g) => g.options.map((o) => o.id))

// Par défaut, masquées : les 8 colonnes "back end" du document (MET-33→41,
// recueil lot 1) — conservées en base pour les contrôles, mais qui n'ont pas
// à s'imposer à tous les utilisateurs du tableau.
const COLONNES_MASQUEES_DEFAUT = [
  'statutCorrige',
  'dureeTraitement',
  'dureeProjet',
  'dureeMto',
  'tempsMisMto',
  'prevMto',
  'checkCfp',
  'checkCft',
]

export const COLONNES_DEFAUT: string[] = CATALOGUE_COLONNES.filter((id) => !COLONNES_MASQUEES_DEFAUT.includes(id))
