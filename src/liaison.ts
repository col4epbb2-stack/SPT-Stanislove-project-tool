// Moteur de résolution en cascade (Logique_metier_liaisons_ICP.docx §3.2) :
// normalisation, parser des clés embarquées dans les libellés, cascade
// OTP → avis → OT → PO → demande → nom exact/alias, suggestions floues
// (jamais automatiques). Les index sont construits une fois par jeu de
// données et les résolutions mémoïsées (8 000+ lignes à résoudre).

import type { Projet } from '../types/project'
import type { LigneNavette } from '../types/navette'
import type { AliasProjet, ChampCode } from '../types/referentiels'
import { PREFIXES_SITE_CHAMP } from '../data/referentiels'
import type {
  ClesEnregistrement,
  LiaisonManuelle,
  ModuleLiaison,
  Resolution,
  SuggestionLiaison,
} from '../types/liaison'

// ---------------------------------------------------------------------------
// Normalisation et rapprochement flou

/** Normalise une clé texte : casse, accents, espaces multiples. */
export function normaliser(valeur: string | number | null | undefined): string | null {
  if (valeur === null || valeur === undefined) return null
  const s = String(valeur).trim()
  if (!s || ['nan', 'none', 'null', '-', 'na', 'n/a'].includes(s.toLowerCase())) return null
  return s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .toUpperCase()
}

// Tokens non discriminants dans les noms de projets/affaires. Les codes champ
// n'y figurent PAS : le champ est un discriminant (deux projets identiques à
// champ près sont des projets distincts) — il est traité à part via `champ`.
const STOP_TOKENS = new Set([
  'DE', 'DU', 'DES', 'LA', 'LE', 'LES', 'ET', 'SUR', 'POUR', 'A', 'AU', 'AUX', 'EN',
  'TVX', 'TRAVAUX', 'CDE', 'OT', 'AVIS',
])

/** Tokens significatifs d'un nom (déjà normalisé). */
export function tokensSignificatifs(nomNormalise: string): Set<string> {
  const tokens = nomNormalise.match(/[A-Z0-9]{2,}/g) ?? []
  return new Set(tokens.filter((t) => !STOP_TOKENS.has(t)))
}

/** Similarité de Jaccard entre deux ensembles de tokens (0..1). */
export function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0
  let inter = 0
  for (const t of a) if (b.has(t)) inter++
  return inter / (a.size + b.size - inter)
}

/** Seuil en dessous duquel une suggestion floue n'est pas proposée. */
export const SEUIL_SUGGESTION = 0.5

// ---------------------------------------------------------------------------
// Parser des clés embarquées dans les libellés

// Mesuré sur les données réelles : les affaires métal encodent OT/AVIS/CDE
// ("965 - OT 85054837 - AVIS 25049103 …", "CDE : 4250036569") et 62/102
// libellés navette sont préfixés par le champ ("AGM: …").
export interface ClesEmbarquees {
  ot: string[]
  avis: string[]
  po: string[]
  champ: string | null
}

const RE_OT = /\bOT\s*[:\s]\s*(\d{7,9})/g
const RE_AVIS = /\bAVIS\s*[:\s]\s*(\d{7,9})/g
const RE_PO = /\bCDE\s*:?\s*(\d{7,10})/g
const RE_PREFIXE_CHAMP = /^([A-Z]{2,5})\s*:/

/** Extrait les clés de liaison embarquées dans un libellé normalisé. */
export function extraireClesLibelle(libelleNormalise: string): ClesEmbarquees {
  return {
    ot: [...libelleNormalise.matchAll(RE_OT)].map((m) => m[1]),
    avis: [...libelleNormalise.matchAll(RE_AVIS)].map((m) => m[1]),
    po: [...libelleNormalise.matchAll(RE_PO)].map((m) => m[1]),
    champ: RE_PREFIXE_CHAMP.exec(libelleNormalise)?.[1] ?? null,
  }
}

/** Rattache un code site/plateforme (AGM12, TRM1, PG2…) à son champ. */
export function siteVersChamp(siteNormalise: string): ChampCode | null {
  for (const [re, champ] of PREFIXES_SITE_CHAMP) {
    if (re.test(siteNormalise)) return champ
  }
  return null
}

// ---------------------------------------------------------------------------
// Résolveur

export interface Resolveur {
  /** Cascade de résolution §3.2 ; retourne null si rien ne matche (le flou
   * n'est jamais automatique : il passe par `suggerer` puis confirmation). */
  resoudre(module: ModuleLiaison, cles: ClesEnregistrement): Resolution | null
  /** Suggestions floues (étape 6), scopées par champ, triées par score. */
  suggerer(nom: string | null | undefined, champ?: string | null): SuggestionLiaison[]
  projetParId(id: string): Projet | undefined
}

interface CandidatNom {
  projetId: string
  nom: string
  nomNorm: string
  champ: string | null
  tokens: Set<string>
}

export function creerResolveur(sources: {
  projets: Projet[]
  lignesNavette: LigneNavette[]
  liaisons: LiaisonManuelle[]
  aliases: AliasProjet[]
}): Resolveur {
  const { projets, lignesNavette, liaisons, aliases } = sources
  const parId = new Map(projets.map((p) => [p.id, p]))

  // Index par clé normalisée — construits une fois, la cascade ne fait plus
  // que des lookups.
  const parOTP = new Map<string, string>()
  const parAvis = new Map<string, string>()
  const parOT = new Map<string, string>()
  const parPO = new Map<string, string>()
  const candidatsNom: CandidatNom[] = []

  for (const p of projets) {
    const otp = normaliser(p.codeOTP)
    if (otp) parOTP.set(otp, p.id)
    for (const avis of [p.avisNumero, ...p.avisNumeros]) {
      const a = normaliser(avis)
      if (a) parAvis.set(a, p.id)
    }
    for (const ot of p.numerosOT) {
      const o = normaliser(ot)
      if (o) parOT.set(o, p.id)
    }
    // Les PO du projet sont portés par ses commandes.
    for (const commande of p.commandes) {
      const po = normaliser(commande.numero)
      if (po) parPO.set(po, p.id)
    }
    const nom = normaliser(p.nom)
    if (nom) {
      candidatsNom.push({ projetId: p.id, nom: p.nom, nomNorm: nom, champ: normaliser(p.champ), tokens: tokensSignificatifs(nom) })
    }
  }

  // codeOTP hérité de la ligne navette liée, sans double saisie sur la fiche.
  for (const ligne of lignesNavette) {
    if (!ligne.projetId) continue
    const otp = normaliser(ligne.codeOTP)
    if (otp && !parOTP.has(otp)) parOTP.set(otp, ligne.projetId)
  }

  const parManuel = new Map<string, string>()
  const parDemande = new Map<string, string>()
  for (const l of liaisons) {
    parManuel.set(`${l.module}|${l.cleType}|${l.cleValeur}`, l.projetId)
    // Le registre NNN/AAAA + service est pérenne entre exercices : une
    // demande confirmée vaut pour tous les modules qui la portent.
    if (l.cleType === 'demande') parDemande.set(l.cleValeur, l.projetId)
  }

  const parAlias = new Map<string, string>()
  for (const a of aliases) {
    const alias = normaliser(a.alias)
    if (alias) parAlias.set(alias, a.projetId)
  }

  // Match nom + même champ (règle §2.3) : un candidat dont le champ est connu
  // et différent de celui de l'enregistrement est exclu ; en cas d'ambiguïté
  // résiduelle, pas de liaison automatique.
  const champCompatible = (candidat: string | null, enregistrement: string | null) =>
    !candidat || !enregistrement || candidat === enregistrement

  function chercherNomExact(nom: string, champ: string | null): string | null {
    const compatibles = candidatsNom.filter((c) => c.nomNorm === nom && champCompatible(c.champ, champ))
    if (compatibles.length === 1) return compatibles[0].projetId
    if (compatibles.length > 1 && champ) {
      const memes = compatibles.filter((c) => c.champ === champ)
      if (memes.length === 1) return memes[0].projetId
    }
    return null
  }

  // Mémoïsation des résolutions : les journaux repassent les mêmes valeurs
  // des milliers de fois.
  const memo = new Map<string, Resolution | null>()

  function resoudre(module: ModuleLiaison, cles: ClesEnregistrement): Resolution | null {
    const nom = normaliser(cles.nom)
    const otp = normaliser(cles.otp)
    const site = normaliser(cles.site)
    const cle = `${module}|${otp}|${normaliser(cles.avis)}|${normaliser(cles.ot)}|${normaliser(cles.po)}|${normaliser(cles.demande)}|${nom}|${normaliser(cles.champ)}|${site}`
    const memoise = memo.get(cle)
    if (memoise !== undefined) return memoise

    // Le parser de libellé enrichit les clés avant les étapes 2-5.
    const embarquees = nom ? extraireClesLibelle(nom) : null

    const resolution = ((): Resolution | null => {
      if (otp) {
        const projetId = parOTP.get(otp)
        if (projetId) return { projetId, methode: 'otp', cleValeur: otp }
      }

      for (const avis of [normaliser(cles.avis), ...(embarquees?.avis ?? [])]) {
        if (!avis) continue
        const projetId = parAvis.get(avis)
        if (projetId) return { projetId, methode: 'avis', cleValeur: avis }
      }

      for (const ot of [normaliser(cles.ot), ...(embarquees?.ot ?? [])]) {
        if (!ot) continue
        const projetId = parOT.get(ot)
        if (projetId) return { projetId, methode: 'ot', cleValeur: ot }
      }

      for (const po of [normaliser(cles.po), ...(embarquees?.po ?? [])]) {
        if (!po) continue
        const projetId = parPO.get(po) ?? parManuel.get(`${module}|po|${po}`)
        if (projetId) return { projetId, methode: 'po', cleValeur: po }
      }

      const demande = normaliser(cles.demande)
      if (demande) {
        const projetId = parDemande.get(demande)
        if (projetId) return { projetId, methode: 'demande', cleValeur: demande }
      }

      if (nom) {
        const manuel = parManuel.get(`${module}|projet|${nom}`)
        if (manuel) return { projetId: manuel, methode: 'manuel', cleValeur: nom }

        const alias = parAlias.get(nom)
        if (alias) return { projetId: alias, methode: 'alias', cleValeur: nom }

        const champ = normaliser(cles.champ) ?? embarquees?.champ ?? (site ? siteVersChamp(site) : null)
        const exact = chercherNomExact(nom, champ)
        if (exact) return { projetId: exact, methode: 'nom_exact', cleValeur: nom }
      }

      return null
    })()

    memo.set(cle, resolution)
    return resolution
  }

  function suggerer(nom: string | null | undefined, champ?: string | null): SuggestionLiaison[] {
    const nomNorm = normaliser(nom)
    if (!nomNorm) return []
    const tokens = tokensSignificatifs(nomNorm)
    const champNorm = normaliser(champ)

    return candidatsNom
      .filter((c) => champCompatible(c.champ, champNorm))
      .map((c) => ({ projetId: c.projetId, nomProjet: c.nom, score: jaccard(tokens, c.tokens) }))
      .filter((s) => s.score >= SEUIL_SUGGESTION)
      .sort((a, b) => b.score - a.score)
  }

  return { resoudre, suggerer, projetParId: (id) => parId.get(id) }
}
