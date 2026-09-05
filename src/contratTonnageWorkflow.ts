import type { DirectoryUser } from '../types/user'
import type { RapportTonnage } from '../types/tonnageEchaf'

// Workflow de vérification et d'approbation du rapport journalier
// (03/09/2026, `doc/Suivi tonnage rev01.docx` §D « WORKLOW », TON1-35→37 —
// lot 7 de `doc/recueil-module-tonnage-rev01.md`). Résout Q10.
//
// Le document nomme quatre acteurs qu'aucun rôle ni profil de l'application
// ne portait :
//   - « Chefs d'équipe » : ils saisissent. La saisie du Journal et du Suivi
//     personnel est déjà ouverte à tout connecté dans ce module, comme
//     partout ailleurs dans l'application — le document ne demande pas de
//     la restreindre, seulement de savoir **qui** a saisi (TON1-35). Ce
//     n'est donc pas un profil, seulement une trace (`RapportTonnage.
//     saisiPar`/`saisiLe`, posée une fois à la création du rapport).
//   - « Responsable Technique », « superviseurs », « gestionnaires du
//     contrat » : trois acteurs qui vérifient, approuvent et commentent —
//     ils deviennent `ProfilTonnage` (types/user.ts), un champ à part du
//     rôle applicatif, même raisonnement que `ProfilValidationNavette`
//     (11/08/2026) et les profils EPCM (08/08/2026).
//
// **Un seul niveau d'approbation**, contrairement au parcours à deux visas
// de la navette : le document ne décrit qu'un acteur qui approuve
// (« le Responsable Technique... approuve le compte rendu »), pas une
// cascade chef → directeur. Un admin peut toujours suppléer un profil
// manquant — même principe que la navette et l'EPCM, sinon aucun rapport ne
// pourrait être approuvé tant qu'aucun Responsable Technique n'est désigné.

type UtilisateurProfils = Pick<DirectoryUser, 'role' | 'profilTonnage'>

/** Seul le Responsable Technique — ou un admin, qui supplée — approuve. */
export function peutApprouverTonnage(user: UtilisateurProfils | null | undefined): boolean {
  if (!user) return false
  return user.role === 'admin' || user.profilTonnage === 'responsable_technique'
}

/**
 * « Le système devra également permettre aux superviseurs et aux
 * gestionnaires du contrat de commenter » — les deux profils, plus le
 * Responsable Technique (qui n'a aucune raison d'en être exclu) et un
 * admin.
 */
export function peutCommenterTonnage(user: UtilisateurProfils | null | undefined): boolean {
  if (!user) return false
  return user.role === 'admin' || user.profilTonnage != null
}

export function estApprouve(rapport: Pick<RapportTonnage, 'validation'>): boolean {
  return rapport.validation != null
}
