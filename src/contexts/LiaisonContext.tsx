import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { collection, deleteDoc, doc, getDocs, orderBy, query, setDoc } from 'firebase/firestore'
import { db } from '../lib/firebase'
import { COLLECTIONS, idDocument } from '../lib/firestoreCollections'
import { normaliser } from '../lib/liaison'
import type { LiaisonManuelle, ModuleLiaison } from '../types/liaison'
import { initialAliasProjets } from '../data/referentiels'
import { surveillerChargement } from '../lib/incidents'
import { LiaisonContext } from './liaison-context'

interface LiaisonDoc {
  module: string
  cleType: string
  cleValeur: string
  projetId: string
  creeLe: string
}

const versLiaisonFront = (id: string, l: LiaisonDoc): LiaisonManuelle => ({
  id,
  module: l.module as ModuleLiaison,
  cleType: l.cleType as LiaisonManuelle['cleType'],
  cleValeur: l.cleValeur,
  projetId: l.projetId,
  date: l.creeLe.slice(0, 10),
})

// Registre des rapprochements manuels (Logique_metier_liaisons_ICP.docx §3.2)
// lu/écrit directement dans Firestore (collection `liaisons`, 22/07/2026 —
// plus de couche API intermédiaire) plutôt que le mock local — persistance
// anticipée dès la Phase 1 plutôt qu'attendre la Phase 5.
export function LiaisonProvider({ children }: { children: ReactNode }) {
  const [liaisons, setLiaisons] = useState<LiaisonManuelle[]>([])
  const [aliases] = useState(initialAliasProjets)

  const rafraichir = () =>
    surveillerChargement(
      'Le registre des rapprochements',
      getDocs(query(collection(db, COLLECTIONS.liaisons), orderBy('creeLe', 'desc'))),
      null
    ).then((snap) => {
      if (snap) setLiaisons(snap.docs.map((d) => versLiaisonFront(d.id, d.data() as LiaisonDoc)))
    })

  useEffect(() => {
    rafraichir()
  }, [])

  const confirmerLiaison = async (
    module: ModuleLiaison,
    cleType: LiaisonManuelle['cleType'],
    cleValeur: string,
    projetId: string
  ) => {
    const cleNormalisee = normaliser(cleValeur) ?? cleValeur
    const id = idDocument(module, cleType, cleNormalisee)
    const enregistrement: LiaisonDoc = {
      module,
      cleType,
      cleValeur: cleNormalisee,
      projetId,
      creeLe: new Date().toISOString(),
    }
    await setDoc(doc(db, COLLECTIONS.liaisons, id), enregistrement, { merge: true })
    await rafraichir()
  }

  const supprimerLiaison = async (id: string) => {
    await deleteDoc(doc(db, COLLECTIONS.liaisons, id))
    setLiaisons((prev) => prev.filter((l) => l.id !== id))
  }

  return (
    <LiaisonContext.Provider value={{ liaisons, aliases, confirmerLiaison, supprimerLiaison }}>
      {children}
    </LiaisonContext.Provider>
  )
}
