// Extraction des clés naturelles de liaison portées par les enregistrements
// de chaque module portfolio (familles de clés mesurées, voir
// Logique_metier_liaisons_ICP.docx §2.1). Partagé entre les badges de liaison
// des pages portfolio et l'écran de rapprochement.

import type { ClesEnregistrement } from '../types/liaison'
import type { ProjetFeuilleDeRoute } from '../types/feuilleDeRoute'
import type { AffaireMetal } from '../types/travauxMetal'
import type { LigneJournalTonnage } from '../types/tonnageEchaf'
import type { LigneJournalHebdo } from '../types/hebdoCrj'
import type { LigneJournalPeinture } from '../types/contratPeinture'
import type { LigneActiviteFacturation } from '../types/facturationPoint'
import type { ActiviteCourbe } from '../types/courbeEnS'
import type { Resolveur } from './liaison'

// compteImputation = codeOTP : 37/40 lignes (92 %) — la clé la plus fiable.
export const clesFeuilleDeRoute = (p: ProjetFeuilleDeRoute): ClesEnregistrement => ({
  otp: p.compteImputation ?? p.otp,
  nom: p.projet,
  champ: p.champs,
})

// Les affaires métal portent PO/OT/avis en colonnes ET des clés embarquées
// dans le libellé (extraites par le parser).
export const clesAffaireMetal = (a: AffaireMetal): ClesEnregistrement => ({
  nom: a.affaire,
  avis: a.avis,
  ot: a.ot,
  po: a.po,
  champ: a.champ,
  site: a.plateforme,
})

// Registre de numérotation NNN/AAAA + service, commun avec la facturation.
export const clesJournalTonnage = (l: LigneJournalTonnage): ClesEnregistrement => ({
  nom: l.projet,
  demande: l.numeroDemande,
  champ: l.champs,
  site: l.site,
})

export const clesJournalHebdo = (l: LigneJournalHebdo): ClesEnregistrement => ({
  nom: l.nomProjet,
  avis: l.numeroAvisDdm,
  site: l.plateforme,
})

// Même règle pour les autres journaux : lien explicite d'abord, cascade
// ensuite. Trois helpers plutôt qu'un générique — chaque module a ses
// propres clés naturelles et son propre identifiant de module.
export function resoudreProjetTonnage(resolveur: Resolveur, l: LigneJournalTonnage): string | null {
  if (l.projetId) return l.projetId
  return resolveur.resoudre('tonnage-echaf', clesJournalTonnage(l))?.projetId ?? null
}

export function resoudreProjetPeinture(resolveur: Resolveur, l: LigneJournalPeinture): string | null {
  if (l.projetId) return l.projetId
  return resolveur.resoudre('contrat-peinture', clesJournalPeinture(l))?.projetId ?? null
}

export function resoudreProjetMetal(resolveur: Resolveur, a: AffaireMetal): string | null {
  if (a.projetId) return a.projetId
  return resolveur.resoudre('travaux-metal', clesAffaireMetal(a))?.projetId ?? null
}

// Procurement : il n'existe aucune clé naturelle de ce côté (le module n'est
// pas dans `ModuleLiaison`, ses journaux ne portent ni n° d'avis ni OT). Le
// rattachement explicite est donc le seul possible — pas de cascade de
// secours, et c'est volontaire : deviner un projet depuis une désignation
// d'article produirait des faux rattachements.
export function resoudreProjetProcurement(ligne: { projetId?: string | null }): string | null {
  return ligne.projetId ?? null
}

// Fiche projet d'une ligne CRJ. `projetId`, posé à la saisie en choisissant
// la fiche, est un lien explicite : il prime sur la cascade de résolution
// floue, qui ne connaît que les clés naturelles. Même principe que
// `resoudreLiaison` côté Feuille de route.
export function resoudreProjetCrj(resolveur: Resolveur, l: LigneJournalHebdo): string | null {
  if (l.projetId) return l.projetId
  return resolveur.resoudre('suivi-hebdo-crj', clesJournalHebdo(l))?.projetId ?? null
}

// Courbes en S : le classeur ne connaît que le NOM du projet (colonne
// « Projet » de ses 3 feuilles), aucun n° d'avis ni OTP. La cascade se
// rabat donc sur le rapprochement par nom — d'où l'intérêt du lien
// explicite `projetId`, posé depuis la fiche projet elle-même, qui prime.
export const clesActiviteCourbeEnS = (a: ActiviteCourbe): ClesEnregistrement => ({
  nom: a.projet,
  champ: a.champ,
  site: a.plateforme,
})

export function resoudreProjetCourbeEnS(resolveur: Resolveur, a: ActiviteCourbe): string | null {
  if (a.projetId) return a.projetId
  return resolveur.resoudre('courbe-en-s', clesActiviteCourbeEnS(a))?.projetId ?? null
}

// La vraie clé de liaison peinture est numeroAvis/numeroOt, le champ projet
// (descriptions de tâches) ne sert qu'en secours (§2.3).
export const clesJournalPeinture = (l: LigneJournalPeinture): ClesEnregistrement => ({
  nom: l.projet,
  avis: l.numeroAvis,
  ot: l.numeroOt,
  site: l.site,
})

export const clesActiviteFacturation = (l: LigneActiviteFacturation): ClesEnregistrement => ({
  otp: l.imputation,
  nom: l.projet,
  demande: l.numeroDemande,
  site: l.site ?? l.plateforme,
})
