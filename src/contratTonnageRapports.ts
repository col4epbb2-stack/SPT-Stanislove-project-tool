import type {
  LigneJournalTonnage,
  LignePersonnelTonnage,
  ParametresContratTonnage,
  RapportTonnage,
  StandByCauseTonnage,
} from '../types/tonnageEchaf'
import { COMPTEURS_HSE, type CompteurHse } from '../types/hebdoCrj'

// Rapport journalier du module Tonnage échafaudage (03/09/2026, `doc/Suivi
// tonnage rev01.docx` §C — lot 3 de `doc/recueil-module-tonnage-rev01.md`).
//
// Fonctions pures : elles ne lisent ni Firestore ni le DOM, l'écran leur
// passe le Journal et le Suivi personnel déjà chargés.
//
// **Le rapport ne duplique aucune donnée, il la regroupe.** Une demande du
// Journal ou un pointage du Suivi personnel n'a pas besoin du rapport pour
// exister ; ce module se contente de les retrouver par (date, champ) —
// exactement la maille que le §C impose (« sélectionner le champ concerné
// avant de renseigner son rapport journalier »).

/** Comparaison de libellés : le classeur mélange les casses et les espaces. */
const cle = (v: string | null | undefined) => (v ?? '').trim().toLowerCase()

/**
 * Identifiant d'un rapport — doc ID Firestore et clé de regroupement.
 *
 * `idDocument()` (lib/firestoreCollections.ts) n'est pas utilisé ici : cette
 * fonction reste pure et ne dépend d'aucun import Firestore, la page compose
 * l'ID du document à l'écriture à partir d'elle.
 */
export function cleRapport(date: string, champ: string): string {
  return `${date}__${cle(champ)}`
}

/** Les demandes du Journal saisies ou modifiées ce jour-là, sur ce champ. */
export function demandesDuRapport(
  journal: LigneJournalTonnage[],
  date: string,
  champ: string
): LigneJournalTonnage[] {
  return journal.filter((l) => l.date === date && cle(l.champs) === cle(champ))
}

/** Les pointages du Suivi personnel de ce jour-là, sur ce champ. */
export function pointagesDuRapport(
  personnel: LignePersonnelTonnage[],
  date: string,
  champ: string
): LignePersonnelTonnage[] {
  return personnel.filter((l) => l.date === date && cle(l.champs) === cle(champ))
}

/** Le rapport existant pour ce jour et ce champ, `null` s'il n'a jamais été ouvert. */
export function rapportExistant(
  rapports: RapportTonnage[],
  date: string,
  champ: string
): RapportTonnage | null {
  const id = cleRapport(date, champ)
  return rapports.find((r) => r.id === id) ?? null
}

/** Les personnes distinctes ayant pointé, avec le ou les projets qu'elles ont porté (§B, TON1-24 : « qui a travaillé et sur quel projet »). */
export interface PersonneDuRapport {
  nom: string
  profils: string[]
  projets: string[]
}

// --- Allègement de la saisie du Suivi personnel (§B — lot 5, résout TON1-29) -
//
// « Nous ne sommes pas censés renseigner à nouveau les noms des projets etc. »
// (TON1-23) : le Journal du jour connaît déjà le projet et son service,
// inutile de les redemander au pointage personnel.

/**
 * Les projets déjà renseignés dans le Journal montage/dépose, à cette date
 * (et sur ce champ s'il est connu) — TON1-29 : « pas toute la liste des
 * affaires, mais celles renseignées à la date du compte rendu ». Remplace
 * l'historique complet des pointages comme source du menu « Projet » du
 * Suivi personnel.
 */
export function projetsDuJournal(
  journal: LigneJournalTonnage[],
  date: string,
  champ: string | null
): string[] {
  return [
    ...new Set(
      journal
        .filter((l) => l.date === date && (!champ || cle(l.champs) === cle(champ)))
        .map((l) => l.projet)
        .filter((p): p is string => !!p && p.trim() !== '')
    ),
  ].sort((a, b) => a.localeCompare(b, 'fr'))
}

/**
 * Le service porté par le Journal pour ce projet, à cette date — « si on a
 * choisi le projet c'est que l'information sur le service on l'a déjà »
 * (TON1-29). Rend `null` si le projet n'apparaît pas ce jour-là, ou si
 * plusieurs demandes de ce projet portent des services différents : deviner
 * entre deux services serait pire que redemander.
 */
export function serviceDuProjetJournal(
  journal: LigneJournalTonnage[],
  date: string,
  champ: string | null,
  projet: string
): string | null {
  const services = [
    ...new Set(
      journal
        .filter(
          (l) => l.date === date && (!champ || cle(l.champs) === cle(champ)) && cle(l.projet) === cle(projet)
        )
        .map((l) => l.services)
        .filter((s): s is string => !!s && s.trim() !== '')
    ),
  ]
  return services.length === 1 ? services[0] : null
}

export function personnesDuRapport(pointages: LignePersonnelTonnage[]): PersonneDuRapport[] {
  const parNom = new Map<string, PersonneDuRapport>()
  for (const l of pointages) {
    const nom = l.nom ?? '—'
    const p = parNom.get(nom) ?? { nom, profils: [], projets: [] }
    if (l.profil && !p.profils.includes(l.profil)) p.profils.push(l.profil)
    if (l.projet && !p.projets.includes(l.projet)) p.projets.push(l.projet)
    parNom.set(nom, p)
  }
  return [...parNom.values()].sort((a, b) => a.nom.localeCompare(b.nom))
}

// --- Stand-by du jour (§J/§K — lot 4, résout Q7) ----------------------------
//
// « Le stand-by est saisi de manière journalière et non par projet » (§J) —
// à la différence de la peinture, le module n'a pas de notion de « catégorie »
// dans son Journal (montage/dépose uniquement) : rien n'y accueillerait des
// lignes STD. La ventilation vit donc directement sur le rapport, comme le
// rédacteur ou la société — pas comme des lignes injectées ailleurs.

/**
 * La cause « incompressible » du §K — « les temps qui ne peuvent pas être
 * optimisés » (pause repas, contraintes obligatoires du contrat). Reprise
 * mot pour mot du référentiel peinture (`CAUSE_INCOMPRESSIBLE`), dont
 * `CAUSES_STANDBY_DOCUMENT` (lot 1) est la copie exacte.
 */
export const CAUSE_INCOMPRESSIBLE_TONNAGE = 'STBY INCOMPRESSIBLE'

export function estIncompressibleTonnage(cause: string): boolean {
  return cle(cause) === cle(CAUSE_INCOMPRESSIBLE_TONNAGE)
}

const nombre = (v: number | null | undefined): number | null =>
  typeof v === 'number' && Number.isFinite(v) ? v : null

/** Somme des heures ventilées par cause. Une cause non renseignée pèse 0. */
export function totalDesCausesTonnage(causes: StandByCauseTonnage[]): number {
  return causes.reduce((t, c) => t + (nombre(c.heures) ?? 0), 0)
}

/**
 * « Le total des causes doit être obligatoirement égal au total déclaré »
 * (§K). Rend l'écart signé, ou `null` si aucun total n'a été déclaré — un
 * rapport sans stand-by n'est pas un rapport en faute. Même contrôle que la
 * peinture (27/08/2026), l'un des rares de l'application à **bloquer**
 * l'enregistrement plutôt qu'avertir : les deux nombres sont sous les yeux de
 * qui saisit, et l'un des deux est faux.
 */
export function ecartStandByTonnage(
  totalDeclare: number | null,
  causes: StandByCauseTonnage[]
): number | null {
  const total = nombre(totalDeclare)
  if (total === null) return null
  return totalDesCausesTonnage(causes) - total
}

export function standByEstCoherentTonnage(
  totalDeclare: number | null,
  causes: StandByCauseTonnage[]
): boolean {
  const ecart = ecartStandByTonnage(totalDeclare, causes)
  return ecart === null || Math.abs(ecart) < 1e-9
}

/**
 * Ventilation proposée à l'ouverture d'un rapport : la valeur d'heures
 * incompressibles paramétrée pour ce champ (§K, « une valeur par défaut doit
 * être paramétrée pour chaque site »).
 *
 * **Rien n'est proposé si le champ n'a pas de valeur** — le cas par défaut :
 * le document demande cette valeur sans en donner aucune, et le classeur non
 * plus (Q6 du recueil). Rien n'est proposé non plus si le rapport porte déjà
 * une ventilation : une proposition n'écrase jamais une saisie (même règle
 * que le pré-remplissage du planning et du pointage EPCM, 26/08/2026, et de
 * la peinture, 27/08/2026).
 */
export function standByParDefautTonnage(
  parametres: ParametresContratTonnage | null,
  champ: string,
  dejaSaisi: StandByCauseTonnage[]
): StandByCauseTonnage[] {
  if (dejaSaisi.length) return dejaSaisi
  const heures = parametres?.champs.find((c) => cle(c.champ) === cle(champ))?.heuresIncompressibles
  return nombre(heures) === null ? [] : [{ cause: CAUSE_INCOMPRESSIBLE_TONNAGE, heures: heures as number }]
}

// --- HSE du jour (§22 — lot 4, résout Q8) -----------------------------------
//
// « On garde exactement les mêmes informations que dans les autres suivis […]
// on garde la logique de remplissage mise dans CRJ. » Les 6 compteurs sont
// donc **repris depuis `types/hebdoCrj.ts`**, jamais redéfinis — deux jeux
// d'indicateurs donneraient deux LTIF non comparables. Le CRJ les ventile par
// société, scope et tâche ; rien de tout cela n'existe ici, et le rapport ne
// porte de toute façon qu'une seule société par jour (`societeExecutante`) :
// les compteurs vivent donc directement sur le rapport, à sa maille
// (date + champ), sans ventilation inventée.

/** Les 6 compteurs à 0 — un rapport jamais renseigné n'a pas de champ `hse`. */
export const HSE_VIDE: Record<CompteurHse, number> = Object.fromEntries(
  COMPTEURS_HSE.map((c) => [c.cle, 0])
) as Record<CompteurHse, number>

/**
 * Les compteurs d'un rapport, complétés à 0. `undefined` (jamais ouvert) et
 * « 0 partout » (RAS déclaré) restent deux états distincts côté document —
 * cette fonction ne sert qu'à l'affichage et à la pré-saisie du formulaire.
 */
export function hseDuRapport(r: Pick<RapportTonnage, 'hse'> | null | undefined): Record<CompteurHse, number> {
  return { ...HSE_VIDE, ...(r?.hse ?? {}) }
}
