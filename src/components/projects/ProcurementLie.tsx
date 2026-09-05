import { useEffect, useState } from 'react'
import { collection, getDocs, query, where } from 'firebase/firestore'
import { Badge } from '../ui/Badge'
import { db } from '../../lib/firebase'
import { surveillerChargement } from '../../lib/incidents'
import { COLLECTIONS } from '../../lib/firestoreCollections'
import { formatDateOuTexte, formatNombre } from '../../lib/format'
import type { Projet } from '../../types/project'

// Lignes du module Procurement rattachées à cette fiche projet (13/08/2026).
//
// Deux choix à connaître :
//
// 1. On interroge **uniquement les collections de saisie**
//    (`procurement_*_saisie`), pas les blobs importés du classeur. Ce n'est
//    pas un raccourci : le module Procurement n'a aucune clé de liaison
//    naturelle, le rattachement passe donc forcément par le `projetId` posé
//    à la saisie — une ligne importée n'en a jamais. Lire les blobs (plus de
//    2 000 articles) ne changerait donc rien au résultat.
//
// 2. La requête filtre côté Firestore (`where projetId ==`), contrairement
//    aux autres blocs liés qui chargent tout puis filtrent en mémoire : ici
//    il n'y a pas de cache partagé à réutiliser, et une fiche ne concerne
//    qu'une poignée de lignes.

interface LigneLiee {
  id: string
  reference: string
  designation: string
  detail: string
}

const SOURCES: {
  cle: string
  collection: string
  titre: string
  vers: (d: Record<string, unknown>, id: string) => LigneLiee
}[] = [
  {
    cle: 'da',
    collection: COLLECTIONS.procurementDaSaisie,
    titre: "Demandes d'achat",
    vers: (d, id) => ({
      id,
      reference: String(d.numero ?? '—'),
      designation: String(d.description ?? d.scope ?? '—'),
      detail: String(d.statut ?? ''),
    }),
  },
  {
    cle: 'ao',
    collection: COLLECTIONS.procurementAoSaisie,
    titre: "Appels d'offres",
    vers: (d, id) => ({
      id,
      reference: String(d.refAo ?? '—'),
      designation: String(d.scope ?? d.code ?? '—'),
      detail: String(d.fournisseurRetenu ?? ''),
    }),
  },
  {
    cle: 'po',
    collection: COLLECTIONS.procurementPoSaisie,
    titre: 'Commandes (PO)',
    vers: (d, id) => ({
      id,
      reference: String(d.numeroPo ?? '—'),
      designation: String(d.scope ?? d.description ?? '—'),
      detail: formatDateOuTexte((d.dateEtaReelle ?? d.dateCommande ?? null) as string | null),
    }),
  },
  {
    cle: 'surveillance',
    collection: COLLECTIONS.procurementSurveillanceSaisie,
    titre: 'Surveillance des commandes',
    vers: (d, id) => ({
      id,
      reference: String(d.numeroPo ?? '—'),
      designation: String(d.designation ?? d.scope ?? '—'),
      detail: String(d.statut ?? ''),
    }),
  },
  {
    cle: 'prefa',
    collection: COLLECTIONS.procurementPrefaSaisie,
    titre: 'Préfabrication',
    vers: (d, id) => ({
      id,
      reference: String(d.numeroPo ?? '—'),
      designation: String(d.designation ?? '—'),
      detail: d.quantiteLivree != null ? `${formatNombre(Number(d.quantiteLivree))} livré(s)` : '',
    }),
  },
]

export function ProcurementLie({ projet }: { projet: Projet }) {
  const [groupes, setGroupes] = useState<{ titre: string; lignes: LigneLiee[] }[] | null>(null)

  useEffect(() => {
    let annule = false
    Promise.all(
      SOURCES.map(async (source) => {
        const snap = await surveillerChargement(
          'Les lignes Procurement rattachées à ce projet',
          getDocs(query(collection(db, source.collection), where('projetId', '==', projet.id))),
          null
        )
        return {
          titre: source.titre,
          lignes: snap ? snap.docs.map((d) => source.vers(d.data() as Record<string, unknown>, d.id)) : [],
        }
      })
    ).then((res) => {
      if (!annule) setGroupes(res.filter((g) => g.lignes.length > 0))
    })
    return () => {
      annule = true
    }
  }, [projet.id])

  if (!groupes) return <p className="text-sm text-gray-400 mt-6">Recherche des lignes procurement…</p>

  if (groupes.length === 0) {
    return (
      <p className="text-xs text-gray-400 mt-6">
        Aucune ligne du module Procurement n'est rattachée à ce projet. Le rattachement se fait à la saisie, en
        choisissant cette fiche dans le formulaire (DA, AO, PO, surveillance ou préfabrication) — les lignes
        importées du classeur ne portent aucun projet.
      </p>
    )
  }

  const total = groupes.reduce((n, g) => n + g.lignes.length, 0)

  return (
    <div className="mt-6 space-y-4">
      <div className="flex items-center gap-2">
        <h4 className="font-semibold text-gray-900">Procurement lié</h4>
        <Badge label={`${total} ligne${total > 1 ? 's' : ''}`} bg="bg-blue-100" text="text-blue-700" />
      </div>

      {groupes.map((groupe) => (
        <div key={groupe.titre}>
          <p className="text-xs font-medium text-gray-500 mb-1.5">{groupe.titre}</p>
          <div className="divide-y divide-gray-100 border border-gray-100 rounded-xl overflow-hidden">
            {groupe.lignes.map((l) => (
              <div key={l.id} className="px-4 py-2.5 text-sm flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <span className="font-mono text-xs text-gray-600">{l.reference}</span>
                  <p className="text-gray-900 truncate">{l.designation}</p>
                </div>
                {l.detail && <span className="text-xs text-gray-500 shrink-0">{l.detail}</span>}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
