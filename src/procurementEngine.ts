import type { AoProcurement, DaProcurement, PoProcurement } from '../types/procurementFollowUp'

// Moteur de dérivation "Procurement" (Logique_metier_liaisons_ICP.docx §3.2/
// 3.3) : reconstitue la chaîne DA → AO → PO via numeroDa (mesuré : 8 DA
// suivies sur toute la chaîne dans le classeur source) et calcule les délais
// réels par étape à partir des dates déjà présentes sur les journaux AO/PO —
// aucune donnée inventée, uniquement des différences de dates existantes.

function joursEntre(debut: string | null, fin: string | null): number | null {
  if (!debut || !fin) return null
  const d = Date.parse(debut)
  const f = Date.parse(fin)
  if (Number.isNaN(d) || Number.isNaN(f)) return null
  return Math.round((f - d) / 86_400_000)
}

export interface ChaineDa {
  da: DaProcurement
  aos: AoProcurement[]
  pos: PoProcurement[]
  // AO le plus avancé (dateAttribution la plus récente, ou premier trouvé) —
  // sert de référence aux délais ci-dessous.
  aoReference: AoProcurement | null
  poReference: PoProcurement | null
  delaiLancementJours: number | null // dateLancement → dateFinLancement (AO)
  delaiTraitementJours: number | null // dateDebutTraitement → dateFinTraitement (AO)
  delaiFabricationJours: number | null // PO.delaiFabricationJours saisi, sinon dateTransmissionPo → dateLivraisonReelExw
  ecartEtaMaritimeJours: number | null // etaReelMaritime − etaPrevMaritime (retard si positif)
  ecartEtaAerienJours: number | null // etaReelAerien − etaPrevAerien
}

function plusRecent<T extends { dateAttribution?: string | null }>(items: T[]): T | null {
  if (items.length === 0) return null
  return [...items].sort((a, b) => (b.dateAttribution ?? '').localeCompare(a.dateAttribution ?? ''))[0]
}

export function chaineDa(da: DaProcurement, aos: AoProcurement[], pos: PoProcurement[]): ChaineDa {
  const numero = (da.numero ?? '').trim()
  const aosLies = numero ? aos.filter((a) => (a.numeroDa ?? '').trim() === numero) : []
  const posLies = numero ? pos.filter((p) => (p.numeroDa ?? '').trim() === numero) : []
  const aoReference = plusRecent(aosLies)
  const poReference = posLies[0] ?? null

  return {
    da,
    aos: aosLies,
    pos: posLies,
    aoReference,
    poReference,
    delaiLancementJours: aoReference ? joursEntre(aoReference.dateLancement, aoReference.dateFinLancement) : null,
    delaiTraitementJours: aoReference ? joursEntre(aoReference.dateDebutTraitement, aoReference.dateFinTraitement) : null,
    delaiFabricationJours: poReference?.delaiFabricationJours ?? (poReference ? joursEntre(poReference.dateTransmissionPo, poReference.dateLivraisonReelExw) : null),
    ecartEtaMaritimeJours: poReference ? joursEntre(poReference.etaPrevMaritime, poReference.etaReelMaritime) : null,
    ecartEtaAerienJours: poReference ? joursEntre(poReference.etaPrevAerien, poReference.etaReelAerien) : null,
  }
}

export function chainesDa(das: DaProcurement[], aos: AoProcurement[], pos: PoProcurement[]): ChaineDa[] {
  return das.map((da) => chaineDa(da, aos, pos))
}
