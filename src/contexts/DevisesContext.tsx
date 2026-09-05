import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { collection, deleteDoc, doc, getDoc, getDocs, setDoc, writeBatch } from 'firebase/firestore'
import { db } from '../lib/firebase'
import { COLLECTIONS } from '../lib/firestoreCollections'
import { surveillerChargement, surveillerEcriture } from '../lib/incidents'
import { useAuth } from './useAuth'
import { DevisesContext } from './devises-context'
import {
  DEVISES_PAR_DEFAUT,
  deviseDe,
  devisePivot,
  normaliserCode,
  type CodeDevise,
  type Devise,
} from '../types/devise'

// Référentiel des devises (18/08/2026) — collection `devises`, un document
// par devise (doc ID = code ISO).
//
// Tant que rien n'est enregistré, le provider sert DEVISES_PAR_DEFAUT en
// mémoire : c'est exactement ce que l'application connaissait avant (USD
// pivot, 1 EUR = 1,2 USD, 1 USD = 546,6308 XAF) et cela évite d'écrire en base
// au premier chargement d'un utilisateur qui n'a rien demandé — l'écriture
// reste un geste d'administrateur, explicite, depuis l'écran Devises.

type DeviseDoc = Omit<Devise, 'code'>

function versDevise(code: string, data: DeviseDoc): Devise {
  return {
    code,
    libelle: data.libelle ?? code,
    symbole: data.symbole ?? '',
    decimales: data.decimales ?? 2,
    taux: data.taux ?? null,
    pivot: data.pivot ?? false,
    actif: data.actif ?? true,
    majLe: data.majLe,
    majPar: data.majPar,
  }
}

// Reprise de l'ancien réglage : jusqu'au 18/08/2026 les taux vivaient dans
// `parametres_navette/globaux.tauxChange` ({ EUR, XAF }), saisis par un admin
// depuis la carte « Taux de change » de la navette. Tant que le référentiel
// n'a pas été enregistré, ces valeurs continuent de faire foi — sans quoi un
// taux déjà saisi disparaîtrait sans prévenir le jour de cette mise à jour.
// Aucune migration à lancer : `initialiserReferentiel` les écrit telles
// quelles dans la nouvelle collection.
//
// Depuis le 19/08/2026, cette reprise ne comble plus que les taux **inconnus**
// du référentiel par défaut : les taux fournis (EUR, XAF — cf.
// DEVISES_PAR_DEFAUT) font foi. Sans cette réserve, le `XAF: 1` de parité
// neutre écrit dans l'ancien réglage de la navette reviendrait écraser le
// vrai taux du franc CFA, en silence.
const ID_PARAMETRES_GLOBAUX = 'globaux'

function appliquerTauxHistoriques(devises: Devise[], taux: Record<string, number> | null): Devise[] {
  if (!taux) return devises
  return devises.map((d) => (d.pivot || d.taux != null || taux[d.code] == null ? d : { ...d, taux: taux[d.code] }))
}

function trier(devises: Devise[]): Devise[] {
  // Pivot en tête (c'est la référence de lecture des taux), puis alphabétique.
  return [...devises].sort((a, b) => (a.pivot === b.pivot ? a.code.localeCompare(b.code) : a.pivot ? -1 : 1))
}

export function DevisesProvider({ children }: { children: ReactNode }) {
  const { currentUser } = useAuth()
  const [devisesBase, setDevisesBase] = useState<Devise[] | null>(null)
  const [tauxHistoriques, setTauxHistoriques] = useState<Record<string, number> | null>(null)
  const [chargement, setChargement] = useState(true)

  useEffect(() => {
    surveillerChargement('Le référentiel des devises', getDocs(collection(db, COLLECTIONS.devises)), null)
      .then((snap) => {
        if (!snap) return
        // Une collection vide n'est pas une erreur : c'est un référentiel
        // jamais initialisé, cas signalé à part (referentielVierge).
        setDevisesBase(snap.empty ? [] : snap.docs.map((d) => versDevise(d.id, d.data() as DeviseDoc)))
      })
      .finally(() => setChargement(false))
    surveillerChargement(
      'Les taux de change historiques (paramètres navette)',
      getDoc(doc(db, COLLECTIONS.parametresNavette, ID_PARAMETRES_GLOBAUX)),
      null
    ).then((snap) => {
      const data = snap?.data() as { tauxChange?: Record<string, number> } | undefined
      setTauxHistoriques(data?.tauxChange ?? null)
    })
  }, [])

  const referentielVierge = !devisesBase || devisesBase.length === 0

  const devises = useMemo(
    () =>
      trier(
        referentielVierge
          ? appliquerTauxHistoriques(DEVISES_PAR_DEFAUT, tauxHistoriques)
          : (devisesBase as Devise[])
      ),
    [devisesBase, referentielVierge, tauxHistoriques]
  )

  // Le pivot est en principe unique (les écritures y veillent) ; si un
  // document mal formé en laissait deux — ou aucun —, on retombe sur la
  // première devise plutôt que de rendre l'application inutilisable.
  const pivot = devisePivot(devises) ?? devises[0] ?? DEVISES_PAR_DEFAUT[0]

  const signature = () => ({ majLe: new Date().toISOString(), majPar: currentUser?.name ?? currentUser?.email ?? '—' })

  const ecrire = useCallback(async (quoi: string, promesse: Promise<unknown>) => {
    await surveillerEcriture(quoi, promesse)
  }, [])

  const enregistrerDevise = async (devise: Devise, codeInitial?: string) => {
    const code = normaliserCode(devise.code)
    const { code: _ignore, ...reste } = { ...devise, ...signature() }
    void _ignore
    const donnees: DeviseDoc = { ...reste, taux: devise.pivot ? 1 : reste.taux }
    await ecrire('Le référentiel des devises', setDoc(doc(db, COLLECTIONS.devises, code), donnees))
    // Renommer le code, c'est changer d'identifiant de document : l'ancien
    // est supprimé après l'écriture du nouveau, jamais avant (une coupure
    // entre les deux laisse alors un doublon, pas un trou).
    const ancien = codeInitial ? normaliserCode(codeInitial) : ''
    if (ancien && ancien !== code) {
      await ecrire('Le référentiel des devises', deleteDoc(doc(db, COLLECTIONS.devises, ancien)))
    }
    setDevisesBase((prev) => {
      const sans = (prev ?? devises).filter((d) => d.code !== code && d.code !== ancien)
      return [...sans, { ...devise, code, taux: devise.pivot ? 1 : devise.taux, ...signature() }]
    })
  }

  const supprimerDevise = async (code: CodeDevise) => {
    const cible = deviseDe(devises, code)
    if (!cible) return
    if (cible.pivot) throw new Error('La devise pivot ne peut pas être supprimée — désignez d’abord un autre pivot.')
    await ecrire('Le référentiel des devises', deleteDoc(doc(db, COLLECTIONS.devises, cible.code)))
    setDevisesBase((prev) => (prev ?? devises).filter((d) => d.code !== cible.code))
  }

  const definirTaux = async (code: CodeDevise, taux: number | null) => {
    const cible = deviseDe(devises, code)
    if (!cible || cible.pivot) return
    await enregistrerDevise({ ...cible, taux })
  }

  // Changer de pivot recalcule tous les taux dans la nouvelle référence : un
  // taux est une valeur *relative*, le laisser tel quel après le changement
  // ferait silencieusement dire à chaque devise autre chose que ce qu'elle
  // disait. Écriture groupée pour que le référentiel ne soit jamais à moitié
  // converti.
  const definirPivot = async (code: CodeDevise) => {
    const nouveau = deviseDe(devises, code)
    if (!nouveau || nouveau.pivot) return
    if (nouveau.taux == null || nouveau.taux <= 0) {
      throw new Error(`Renseignez d’abord le taux de ${nouveau.code} : sans lui, les autres devises ne peuvent pas être converties.`)
    }
    const facteur = nouveau.taux
    const majs = signature()
    const recalculees = devises.map((d) => ({
      ...d,
      pivot: d.code === nouveau.code,
      taux: d.code === nouveau.code ? 1 : d.taux == null ? null : d.taux / facteur,
      ...majs,
    }))
    const batch = writeBatch(db)
    for (const d of recalculees) {
      const { code: _c, ...donnees } = d
      void _c
      batch.set(doc(db, COLLECTIONS.devises, d.code), donnees)
    }
    await ecrire('Le référentiel des devises', batch.commit())
    setDevisesBase(recalculees)
  }

  // Écrit le référentiel tel qu'il est actuellement servi — défauts compris
  // des taux historiques repris de la navette : c'est ce que l'utilisateur a
  // sous les yeux au moment où il valide.
  const initialiserReferentiel = async () => {
    const batch = writeBatch(db)
    const majs = signature()
    const initiales = devises.map((d) => ({ ...d, ...majs }))
    for (const d of initiales) {
      const { code: _c, ...donnees } = d
      void _c
      batch.set(doc(db, COLLECTIONS.devises, d.code), donnees)
    }
    await ecrire('Le référentiel des devises', batch.commit())
    setDevisesBase(initiales)
  }

  return (
    <DevisesContext.Provider
      value={{
        devises,
        pivot,
        chargement,
        referentielVierge,
        enregistrerDevise,
        supprimerDevise,
        definirTaux,
        definirPivot,
        initialiserReferentiel,
      }}
    >
      {children}
    </DevisesContext.Provider>
  )
}
