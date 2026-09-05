import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { collection, deleteDoc, doc, getDocs, setDoc } from 'firebase/firestore'
import { db } from '../lib/firebase'
import { COLLECTIONS } from '../lib/firestoreCollections'
import { surveillerChargement, surveillerEcriture } from '../lib/incidents'
import { avecActivationBasculee, avecRenommage, normaliserValeur, valeursActives, type EntreeListe } from '../types/listeValeur'
import { useAuth } from './useAuth'
import { ListesValeursContext } from './listes-valeurs-context'

// Valeurs de menu ajoutées par un administrateur (18/08/2026) — collection
// `listes_valeurs`, un document par liste du catalogue.
//
// Le référentiel est **additif** : il ne porte que ce qu'un administrateur a
// déclaré, jamais les valeurs déjà présentes dans les journaux, qui restent
// dérivées des données à l'affichage. Deux raisons : recopier ici les
// milliers de valeurs des classeurs importés n'apporterait rien, et une
// valeur portée par des lignes réelles ne peut de toute façon pas être
// retirée d'un menu sans rendre ces lignes illisibles.
//
// Chaque entrée porte désormais un état actif/inactif (04/09/2026, MET-59/60)
// au lieu d'être une simple chaîne : `valeurs: string[]` devient
// `entrees: EntreeListe[]`. **Lu en repli** sur l'ancien format pour les
// documents écrits avant ce jour (`data.valeurs`) — converti en mémoire à la
// lecture, jamais migré en base ; le document Firestore prend la nouvelle
// forme au premier enregistrement qui le touche, comme partout ailleurs dans
// ce projet.

interface ListeDoc {
  entrees?: EntreeListe[]
  valeurs?: string[]
  majLe?: string
  majPar?: string
}

export function ListesValeursProvider({ children }: { children: ReactNode }) {
  const { currentUser } = useAuth()
  const [ajouts, setAjouts] = useState<Record<string, EntreeListe[]>>({})
  const [chargement, setChargement] = useState(true)

  useEffect(() => {
    surveillerChargement('Les listes de valeurs paramétrées', getDocs(collection(db, COLLECTIONS.listesValeurs)), null)
      .then((snap) => {
        if (!snap) return
        const parListe: Record<string, EntreeListe[]> = {}
        for (const d of snap.docs) {
          const data = d.data() as ListeDoc
          const entrees = data.entrees ?? data.valeurs?.map((v) => ({ valeur: v, actif: true })) ?? []
          if (entrees.length) parListe[d.id] = entrees
        }
        setAjouts(parListe)
      })
      .finally(() => setChargement(false))
  }, [])

  const entreesDe = useCallback((idListe: string) => ajouts[idListe] ?? [], [ajouts])
  const valeursDe = useCallback((idListe: string) => valeursActives(ajouts[idListe] ?? []), [ajouts])

  const ecrire = async (idListe: string, entrees: EntreeListe[]) => {
    const reference = doc(db, COLLECTIONS.listesValeurs, idListe)
    const signature = { majLe: new Date().toISOString(), majPar: currentUser?.name ?? currentUser?.email ?? '—' }
    // Une liste vidée est supprimée plutôt que laissée en document vide : le
    // chargement ignore déjà les listes sans valeur, autant ne pas garder de
    // coquille.
    await surveillerEcriture(
      'Les listes de valeurs paramétrées',
      entrees.length === 0 ? deleteDoc(reference) : setDoc(reference, { entrees, ...signature })
    )
    setAjouts((prev) => {
      const suite = { ...prev }
      if (entrees.length === 0) delete suite[idListe]
      else suite[idListe] = entrees
      return suite
    })
  }

  const ajouterValeur = async (idListe: string, valeur: string) => {
    const propre = normaliserValeur(valeur)
    if (propre === '') return
    const actuelles = ajouts[idListe] ?? []
    if (actuelles.some((e) => e.valeur.toLowerCase() === propre.toLowerCase())) return
    await ecrire(
      idListe,
      [...actuelles, { valeur: propre, actif: true }].sort((a, b) => a.valeur.localeCompare(b.valeur, 'fr'))
    )
  }

  const retirerValeur = async (idListe: string, valeur: string) => {
    const actuelles = ajouts[idListe] ?? []
    await ecrire(
      idListe,
      actuelles.filter((e) => e.valeur !== valeur)
    )
  }

  const renommerValeur = async (idListe: string, ancienneValeur: string, nouvelleValeur: string) => {
    const actuelles = ajouts[idListe] ?? []
    const nouvelles = avecRenommage(actuelles, ancienneValeur, nouvelleValeur)
    if (!nouvelles) return
    await ecrire(idListe, nouvelles)
  }

  const basculerActivation = async (idListe: string, valeur: string) => {
    const actuelles = ajouts[idListe] ?? []
    await ecrire(idListe, avecActivationBasculee(actuelles, valeur))
  }

  const valeur = useMemo(
    () => ({ ajouts, chargement, valeursDe, entreesDe, ajouterValeur, retirerValeur, renommerValeur, basculerActivation }),
    // Les fonctions d'écriture se referment sur `ajouts`, déjà dans les
    // dépendances : les recréer à chaque changement est voulu.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ajouts, chargement, valeursDe, entreesDe]
  )

  return <ListesValeursContext.Provider value={valeur}>{children}</ListesValeursContext.Provider>
}
