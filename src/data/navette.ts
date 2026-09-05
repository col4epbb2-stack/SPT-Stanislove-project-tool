import type { RFSRecurrent, ProjetCandidatBU } from '../types/navette'

// Les 102 lignes navette réelles sont servies par l'API (GET /navette/lignes,
// Firestore) — voir NavetteContext.tsx. Seules les annexes ci-dessous restent
// en mock local (données génériques illustratives, hors périmètre API).

// Annexe "Récap" — engagements récurrents hors lignes navette (RFS), données
// génériques illustratives (les vrais montants ne sont pas repris ici).
export const initialRFSRecurrents: RFSRecurrent[] = [
  { id: 'rfs1', libelle: 'RFS Support déploiement outil terrain', montantUSD: 33 },
  { id: 'rfs2', libelle: 'RFS Nouveau référentiel domaine', montantUSD: 67.1 },
  { id: 'rfs3', libelle: 'RFS Support expertise projet', montantUSD: 198.3 },
  { id: 'rfs4', libelle: 'RFS Support technique spécifique', montantUSD: 147.4 },
]

// Annexe "Feuil1" — brouillon de projets candidats au prochain BU, pas
// encore promus en ligne navette (pas de code OTP à ce stade).
export const initialProjetsCandidatsBU: ProjetCandidatBU[] = [
  { id: 'cand1', libelle: 'Travaux surface Réouverture puits PO006', serviceEtConso: 0, logEtPers: 0 },
  { id: 'cand2', libelle: 'Remplacement nez de torche AGM', serviceEtConso: 3065, logEtPers: 700 },
  { id: 'cand3', libelle: 'Remplacement nez de torche TRM', serviceEtConso: 2825, logEtPers: 1753.22 },
  { id: 'cand4', libelle: 'Gas instrument AGM6', serviceEtConso: 399, logEtPers: 700 },
  { id: 'cand5', libelle: 'Campagne intégrité IM', serviceEtConso: 800, logEtPers: 534.4 },
  { id: 'cand6', libelle: 'Campagne maritime ISM AGM', serviceEtConso: 1200, logEtPers: 0 },
]
