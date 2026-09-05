import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { collection, deleteDoc, deleteField, doc, getDoc, getDocs, increment, orderBy, query, setDoc, updateDoc, writeBatch } from 'firebase/firestore'
import { db } from '../lib/firebase'
import { COLLECTIONS, idDocument } from '../lib/firestoreCollections'
import { initialRFSRecurrents, initialProjetsCandidatsBU } from '../data/navette'
import type { AjustementArbitrage, ArbitrageInput, ArbitrageNavette, CycleBudgetId, BudgetPeriode, LigneNavette, LigneNavetteEdition, LigneNavetteInput, StatutArbitrage, StatutLigneNavette, TauxChange, VisaArbitrage } from '../types/navette'
import type { ProfilValidationNavette } from '../types/user'
import { PROFIL_NAVETTE_LABELS } from '../types/user'
import type { ProjectType, Devise } from '../types/project'
import { useDevises } from './useDevises'
// Le rôle de la personne connectée : les règles de visa en dépendent (un
// admin supplée les deux profils). AuthProvider enveloppe NavetteProvider
// (App.tsx), le hook est donc disponible ici.
import { useAuth } from './useAuth'
import {
  cyclesACascader,
  cyclesDejaRevises,
  cyclesSuivantLeBU,
  cyclesVides,
  estEnAttente,
  parcoursApresAjustement,
  profilAttendu,
  STATUT_LIGNE_DEFAUT,
} from '../types/navette'
import { surveillerChargement } from '../lib/incidents'
import { NavetteContext } from './navette-context'

// Doc Firestore : cycles est un Partial — à la création (docs/navette.md,
// principe directeur) le budget initial saisi est dupliqué sur BU et sur
// tous les cycles PDC jusqu'à BUN1 (aucun arbitrage n'a encore eu lieu),
// realiseN1/realiseYTD restent absents (valeurs réalisées, jamais saisies).
// On complète toujours avec cyclesVides() pour respecter le contrat du
// type front (LigneNavette.cycles couvre les 8 cycles).
interface LigneNavetteDoc {
  rubriqueNiv1: string
  rubriqueNiv2: string
  programme?: string
  anneeBudget?: number
  codeOTP: string
  libelle: string
  champCode?: string
  chargeAffaireId: string
  projetId?: string
  // Absents sur les lignes créées avant l'ajout de ces champs — on retombe
  // sur 'autre'/'USD'/false pour rester compatible avec les données déjà en base.
  type?: ProjectType
  devise?: Devise
  workProgram?: boolean
  cycles: Partial<Record<CycleBudgetId, BudgetPeriode>>
  hypothesesPDC09?: string
  hypothesesBUN1?: string
  commentaire?: string
  // Posée à la création depuis l'application (18/08/2026) — absente des
  // lignes reprises du classeur, cf. types/navette.ts.
  creeLe?: string
  // Statut de vie (20/08/2026). Absent sur les lignes antérieures : lu comme
  // « en cours » côté front, et posé en base par la migration de Paramètres ›
  // Maintenance.
  statut?: StatutLigneNavette
}

/** Retire les clés dont la valeur est `undefined` — refusées par Firestore. */
function sansIndefinis<T extends object>(donnees: T): T {
  return Object.fromEntries(Object.entries(donnees).filter(([, v]) => v !== undefined)) as T
}

function versLigneFront(id: string, l: LigneNavetteDoc): LigneNavette {
  return {
    id,
    rubriqueNiv1: l.rubriqueNiv1 as LigneNavette['rubriqueNiv1'],
    rubriqueNiv2: l.rubriqueNiv2 as LigneNavette['rubriqueNiv2'],
    programme: l.programme,
    anneeBudget: l.anneeBudget,
    codeOTP: l.codeOTP,
    libelle: l.libelle,
    chargeAffaireId: l.chargeAffaireId,
    champ: l.champCode,
    projetId: l.projetId,
    type: l.type ?? 'autre',
    devise: l.devise ?? 'USD',
    workProgram: l.workProgram ?? false,
    cycles: { ...cyclesVides(), ...l.cycles },
    hypothesesPDC09: l.hypothesesPDC09,
    hypothesesBUN1: l.hypothesesBUN1,
    commentaire: l.commentaire,
    creeLe: l.creeLe,
    statut: l.statut,
  }
}

interface ArbitrageDoc {
  ligneId: string
  cycleId: CycleBudgetId
  montant: number
  repartition: BudgetPeriode
  demandeurId: string
  // `'en_attente'` sur les documents écrits avant le parcours à deux visas
  // (11/08/2026) : ils repartent naturellement à la première étape.
  statut: StatutArbitrage | 'en_attente'
  creeLe: string
  traiteParId?: string
  traiteLe?: string
  visaChefDepartement?: VisaArbitrage
  visaDirecteurTechnique?: VisaArbitrage
  motifRefus?: string
  montantPreleveCale?: number
  // Réalisé à date de la ligne au moment où cette révision a été appliquée
  // (23/08/2026) — cf. types/navette.ts. Absent des documents écrits avant.
  realiseYTDAuVisa?: BudgetPeriode
}

function versArbitrageFront(id: string, a: ArbitrageDoc): ArbitrageNavette {
  return { ...a, id, statut: a.statut === 'en_attente' ? 'en_attente_chef' : a.statut }
}

// Réglages navette globaux — un seul doc ('global'), pas de lien avec une
// ligne en particulier.
const ID_PARAMETRES_GLOBAUX = 'global'

// Navette branchée directement sur Firestore (collection `lignes_navette`,
// 22/07/2026 — plus de couche API NestJS intermédiaire, cf. CLAUDE.md).
// rfsRecurrents/projetsCandidatsBU restent en mock local : hors périmètre
// Phase 0/1 du document de liaison, jamais rattachés à une collection.
export function NavetteProvider({ children }: { children: ReactNode }) {
  const { currentUser } = useAuth()
  const [lignes, setLignes] = useState<LigneNavette[]>([])
  const [chargement, setChargement] = useState(true)
  const [rfsRecurrents] = useState(initialRFSRecurrents)
  const [projetsCandidatsBU] = useState(initialProjetsCandidatsBU)
  const [arbitrages, setArbitrages] = useState<ArbitrageNavette[]>([])
  const [caleDisponible, setCaleDisponible] = useState<number | null>(null)
  const [caleInitiale, setCaleInitiale] = useState<number | null>(null)

  // Les taux ne sont plus un réglage de la navette (18/08/2026) : ils
  // viennent du référentiel des devises, commun à toute l'application. La
  // navette en garde la même vue qu'avant (`TauxChange`, code → valeur en
  // pivot) pour que `tauxPour`/`sommeCycles` n'aient rien à changer. Une
  // devise sans taux n'y figure pas : `tauxPour` retombe alors sur son défaut
  // historique, comme avant.
  const { devises } = useDevises()
  const tauxChange = useMemo<TauxChange>(
    () =>
      Object.fromEntries(
        devises.filter((d) => d.pivot || d.taux != null).map((d) => [d.code, d.pivot ? 1 : (d.taux as number)])
      ),
    [devises]
  )

  // Relecture des lignes depuis Firestore. Exposée par le contexte : une
  // migration lancée depuis Paramètres écrit dans la collection sans passer
  // par ici, et les lignes déjà chargées resteraient sinon telles quelles
  // jusqu'au rechargement de la page (18/08/2026).
  const rechargerLignes = useCallback(async () => {
    const snap = await surveillerChargement(
      'Les lignes de la navette',
      getDocs(query(collection(db, COLLECTIONS.lignesNavette), orderBy('codeOTP'))),
      null
    )
    if (snap) setLignes(snap.docs.map((d) => versLigneFront(d.id, d.data() as LigneNavetteDoc)))
  }, [])

  useEffect(() => {
    // Trois lectures indépendantes : chacune signale son propre échec plutôt
    // qu'une seule erreur globale — la navette reste consultable si seule la
    // cale est inaccessible.
    // Le drapeau de chargement est posé après l'attente, pas dans un
    // `.finally` synchrone — la règle react-hooks/set-state-in-effect
    // interdit un setState synchrone dans un effet.
    void (async () => {
      await rechargerLignes()
      setChargement(false)
    })()
    surveillerChargement(
      'Les révisions de la navette',
      getDocs(query(collection(db, COLLECTIONS.arbitragesNavette), orderBy('creeLe', 'desc'))),
      null
    ).then((snap) => {
      if (snap) setArbitrages(snap.docs.map((d) => versArbitrageFront(d.id, d.data() as ArbitrageDoc)))
    })
    surveillerChargement(
      'Les paramètres de la navette (cale)',
      getDoc(doc(db, COLLECTIONS.parametresNavette, ID_PARAMETRES_GLOBAUX)),
      null
    ).then((snap) => {
      if (!snap) return
      const data = snap.data() as { cale?: number; caleInitiale?: number } | undefined
      setCaleDisponible(data?.cale ?? null)
      setCaleInitiale(data?.caleInitiale ?? null)
    })
    // `rechargerLignes` est stable (useCallback sans dépendance) : ce bloc ne
    // rejoue qu'au montage, comme avant.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const createLigne = async (input: LigneNavetteInput): Promise<LigneNavette> => {
    const { BU, champ, ...rest } = input
    const id = idDocument(input.codeOTP)
    const ref = doc(db, COLLECTIONS.lignesNavette, id)
    if ((await getDoc(ref)).exists()) throw new Error(`Code OTP déjà utilisé : ${input.codeOTP}`)
    const cyclesInitiaux: Partial<Record<CycleBudgetId, BudgetPeriode>> = {
      BU,
      PDC02: BU,
      PDC05: BU,
      PDC09: BU,
      PDC11: BU,
      BUN1: BU,
    }
    const docData: LigneNavetteDoc = {
      ...rest,
      champCode: champ,
      cycles: cyclesInitiaux,
      creeLe: new Date().toISOString(),
      // Une ligne naît ouverte. Écrit explicitement plutôt que laissé au
      // repli de lecture : une ligne créée après ce jour n'a aucune raison
      // d'avoir besoin de la migration.
      statut: STATUT_LIGNE_DEFAUT,
    }
    // Firestore refuse une valeur `undefined` (aucun `ignoreUndefinedProperties`
    // n'est configuré côté SDK) : `champ` et `anneeBudget` étant facultatifs,
    // les laisser vides faisait échouer la création avec « Unsupported field
    // value: undefined ». On retire donc les clés non renseignées plutôt que
    // de les écrire à null, ce qui distinguerait mal « pas saisi » de
    // « effacé » à la relecture.
    await setDoc(ref, sansIndefinis(docData))
    const ligne = versLigneFront(id, docData)
    setLignes((prev) => [ligne, ...prev])
    return ligne
  }

  // Correction d'une ligne existante (21/08/2026). Jusqu'ici, seuls le
  // commentaire, le statut et la liaison projet s'écrivaient après coup : une
  // erreur de libellé, d'année ou de budget à la création était définitive.
  //
  // Deux points valent d'être connus avant d'y toucher :
  //  - **le code OTP n'est pas modifiable** (cf. `LigneNavetteEdition`) : il
  //    est l'identifiant du document ;
  //  - **corriger le BU ne réécrit pas une révision** : la nouvelle valeur ne
  //    se propage qu'aux cycles que `cyclesSuivantLeBU` déclare intacts.
  const updateLigne = async (ligneId: string, edition: LigneNavetteEdition) => {
    const ligne = lignes.find((l) => l.id === ligneId)
    if (!ligne) throw new Error(`Ligne navette introuvable : ${ligneId}`)

    const { BU, realiseN1, BUN1, champ, anneeBudget, ...rest } = edition

    // Un champ facultatif vidé doit être **retiré** du document et non écrit à
    // `undefined`, que Firestore refuse — et pas non plus à `null`, qui
    // distinguerait mal « pas saisi » de « effacé » à la relecture (même
    // raisonnement que `sansIndefinis` à la création).
    const patch: Record<string, unknown> = {
      ...rest,
      champCode: champ && champ.trim() !== '' ? champ.trim() : deleteField(),
      anneeBudget: anneeBudget === undefined ? deleteField() : anneeBudget,
    }

    let cycles = ligne.cycles
    if (BU) {
      const suivants = cyclesSuivantLeBU(ligne.cycles, cyclesDejaRevises(arbitrages, ligneId))
      patch['cycles.BU'] = BU
      for (const cycle of suivants) patch[`cycles.${cycle}`] = BU
      cycles = {
        ...ligne.cycles,
        BU,
        ...Object.fromEntries(suivants.map((cycle) => [cycle, BU])),
      }
    }
    // realiseN1 et BUN1 se corrigent chacun pour lui-même, sans cascade — ce
    // ne sont pas des révisions de BU (04/09/2026).
    if (realiseN1) {
      patch['cycles.realiseN1'] = realiseN1
      cycles = { ...cycles, realiseN1 }
    }
    if (BUN1) {
      patch['cycles.BUN1'] = BUN1
      cycles = { ...cycles, BUN1 }
    }

    // `await` avant la mise à jour locale, comme les autres écritures de ce
    // contexte : `lignes_navette` est en `allow update: if estAdmin()`, un
    // refus des règles doit remonter à l'écran plutôt que d'y laisser une
    // correction qui n'a pas été enregistrée.
    await updateDoc(doc(db, COLLECTIONS.lignesNavette, ligneId), patch)
    setLignes((prev) =>
      prev.map((l) =>
        l.id === ligneId
          ? { ...l, ...rest, champ: champ?.trim() || undefined, anneeBudget, cycles }
          : l
      )
    )
  }

  const linkToProject = async (ligneId: string, projetId: string) => {
    await updateDoc(doc(db, COLLECTIONS.lignesNavette, ligneId), { projetId })
    setLignes((prev) => prev.map((ligne) => (ligne.id === ligneId ? { ...ligne, projetId } : ligne)))
  }

  // Clôture ou réouverture d'une ligne (20/08/2026). Réversible : clôturer
  // n'est pas supprimer — la ligne reste lisible, filtrable et porte son
  // historique de révisions.
  const definirStatutLigne = async (ligneId: string, statut: StatutLigneNavette) => {
    // `await` avant la mise à jour locale, comme les autres écritures de ce
    // contexte : un refus des règles Firestore remonte à l'appelant, qui
    // l'affiche, plutôt que de laisser l'écran montrer un statut qui n'a pas
    // été enregistré.
    await updateDoc(doc(db, COLLECTIONS.lignesNavette, ligneId), { statut })
    setLignes((prev) => prev.map((l) => (l.id === ligneId ? { ...l, statut } : l)))
  }

  const updateCommentaire = async (ligneId: string, commentaire: string) => {
    await updateDoc(doc(db, COLLECTIONS.lignesNavette, ligneId), { commentaire })
    setLignes((prev) => prev.map((ligne) => (ligne.id === ligneId ? { ...ligne, commentaire } : ligne)))
  }

  // Suppression définitive d'une ligne (04/09/2026, demande explicite). À la
  // différence de la clôture (`definirStatutLigne`), qui est réversible et ne
  // touche pas aux données, ce geste retire le document — l'historique de ses
  // révisions dans `arbitrages_navette` n'est volontairement pas effacé avec
  // (une trace déjà posée ne s'efface pas ici), il reste seulement orphelin.
  // Réservé aux admins par `firestore.rules` (`allow delete: if estAdmin()`).
  const supprimerLigne = async (ligneId: string) => {
    await deleteDoc(doc(db, COLLECTIONS.lignesNavette, ligneId))
    setLignes((prev) => prev.filter((ligne) => ligne.id !== ligneId))
  }

  const proposerArbitrage = async (input: ArbitrageInput): Promise<ArbitrageNavette> => {
    // Une seule révision en attente à la fois par ligne, tous cycles
    // confondus — évite deux arbitrages concurrents sur le même budget.
    if (arbitrages.some((a) => a.ligneId === input.ligneId && estEnAttente(a))) {
      throw new Error('Une révision est déjà en attente de validation pour cette ligne.')
    }
    const id = idDocument(input.ligneId, input.cycleId, Date.now().toString())
    // Première étape du parcours : le chef de département.
    const docData: ArbitrageDoc = { ...input, statut: 'en_attente_chef', creeLe: new Date().toISOString() }
    await setDoc(doc(db, COLLECTIONS.arbitragesNavette, id), docData)
    const arbitrage = versArbitrageFront(id, docData)
    setArbitrages((prev) => [arbitrage, ...prev])
    return arbitrage
  }

  // Mise à jour cascade des cycles (docs/navette.md : tant qu'un cycle
  // suivant n'a pas sa propre révision, il porte le montant du cycle
  // précédent — la révision validée se propage donc aux cycles après
  // celui-ci) + décrément atomique de la cale — partagé entre une
  // validation normale (viserArbitrage, visa du directeur technique) et un correctif admin
  // (reviserCorrectif), qui appliquent tous les deux le même arbitrage à la
  // ligne, seule la façon dont il transite par 'en_attente' diffère.
  //
  // `ligneCourante` (04/09/2026, demande explicite « tenir compte n-1 et
  // n+1 ») : la cascade ne s'étend plus aveuglément à tout ce qui suit dans
  // `CASCADE_CYCLES` — une révision pouvant désormais arriver à tout moment,
  // et non plus dans l'ordre chronologique strict des fenêtres, elle
  // s'arrête au premier cycle qui porte déjà sa propre valeur (cf.
  // `cyclesACascader`), pour ne jamais écraser une révision indépendante
  // posée sur un cycle plus tardif (n+1 ou au-delà).
  const appliquerArbitrage = (
    batch: ReturnType<typeof writeBatch>,
    arbitrage: ArbitrageNavette,
    ligneCourante: LigneNavette
  ): CycleBudgetId[] => {
    const cyclesAMettreAJour = cyclesACascader(ligneCourante.cycles, arbitrage.cycleId)
    const cyclesMisAJour = Object.fromEntries(cyclesAMettreAJour.map((cycleId) => [`cycles.${cycleId}`, arbitrage.repartition]))
    batch.update(doc(db, COLLECTIONS.lignesNavette, arbitrage.ligneId), cyclesMisAJour)
    // Le déficit couvert par la cale n'est réellement débité qu'à la
    // validation (pas à la proposition) — décrément atomique pour éviter
    // toute course avec un autre prélèvement concurrent.
    if (arbitrage.montantPreleveCale) {
      batch.update(doc(db, COLLECTIONS.parametresNavette, ID_PARAMETRES_GLOBAUX), {
        cale: increment(-arbitrage.montantPreleveCale),
      })
    }
    return cyclesAMettreAJour
  }

  const appliquerArbitrageLocal = (arbitrage: ArbitrageNavette, cyclesAMettreAJour: CycleBudgetId[]) => {
    setLignes((prev) =>
      prev.map((ligne) =>
        ligne.id === arbitrage.ligneId
          ? {
              ...ligne,
              cycles: {
                ...ligne.cycles,
                ...Object.fromEntries(cyclesAMettreAJour.map((cycleId) => [cycleId, arbitrage.repartition])),
              },
            }
          : ligne
      )
    )
    if (arbitrage.montantPreleveCale) {
      setCaleDisponible((prev) => (prev ?? 0) - (arbitrage.montantPreleveCale ?? 0))
    }
  }

  // Un visa du parcours à deux étapes. Le visa du chef de département fait
  // seulement avancer la révision d'une case ; c'est celui du directeur
  // technique qui la valide et applique le budget — jusque-là, rien n'est
  // écrit sur la ligne ni prélevé sur la cale.
  const viserArbitrage = async (arbitrageId: string, viseurId: string, profil: ProfilValidationNavette) => {
    const arbitrage = arbitrages.find((a) => a.id === arbitrageId)
    if (!arbitrage) throw new Error(`Arbitrage introuvable : ${arbitrageId}`)
    const attendu = profilAttendu(arbitrage.statut)
    if (!attendu) throw new Error('Cette révision est déjà traitée.')
    if (attendu !== profil) {
      throw new Error(`Cette révision attend le visa du profil « ${PROFIL_NAVETTE_LABELS[attendu]} ».`)
    }
    // Les deux visas doivent venir de deux personnes différentes, sinon la
    // double validation demandée ne vaudrait rien — **sauf pour un admin**,
    // qui vise pour les deux profils depuis le 23/08/2026.
    //
    // Ce garde-fou doit dire exactement ce que dit `peutViser`
    // (types/navette.ts), qui commande l'affichage du bouton : sans
    // l'exemption ici, l'écran proposait le visa à l'admin et l'écriture le
    // refusait (constaté à l'usage le 23/08/2026).
    if (arbitrage.visaChefDepartement?.parId === viseurId && currentUser?.role !== 'admin') {
      throw new Error('Vous avez déjà visé cette révision : le second visa doit venir d’une autre personne.')
    }
    const le = new Date().toISOString()
    const visa: VisaArbitrage = { parId: viseurId, le }

    if (profil === 'chef_departement') {
      const maj = { statut: 'en_attente_dt' as const, visaChefDepartement: visa }
      await updateDoc(doc(db, COLLECTIONS.arbitragesNavette, arbitrageId), maj)
      setArbitrages((prev) => prev.map((a) => (a.id === arbitrageId ? { ...a, ...maj } : a)))
      return
    }

    // Réalisé à date figé au moment du visa (23/08/2026, demande explicite) :
    // c'est ce qu'on savait du réalisé quand la décision a été prise. Écrit
    // sur le document de la révision, dans le batch qui l'applique — donc
    // jamais de relevé sans révision appliquée, ni l'inverse.
    //
    // À savoir en lisant ce chiffre : **rien dans l'application ne met à jour
    // `cycles.realiseYTD`** aujourd'hui (il vient du classeur importé). Deux
    // révisions successives peuvent donc relever la même valeur — l'onglet
    // « Réalisé YTD » l'affiche telle quelle et le signale, plutôt que de
    // masquer un relevé identique au précédent.
    const realiseYTDAuVisa = lignes.find((l) => l.id === arbitrage.ligneId)?.cycles.realiseYTD
    const maj = {
      statut: 'valide' as const,
      visaDirecteurTechnique: visa,
      traiteParId: viseurId,
      traiteLe: le,
      ...(realiseYTDAuVisa ? { realiseYTDAuVisa } : {}),
    }
    await validerEtAppliquer(arbitrage, maj)
  }

  // Écriture commune au visa du directeur technique et au double visa admin :
  // le document de la révision et l'application au budget partent dans le même
  // batch, l'état local suit ensuite.
  const validerEtAppliquer = async (
    arbitrage: ArbitrageNavette,
    maj: Partial<ArbitrageNavette> & { statut: 'valide' }
  ) => {
    const ligneCourante = lignes.find((l) => l.id === arbitrage.ligneId)
    if (!ligneCourante) throw new Error(`Ligne navette introuvable : ${arbitrage.ligneId}`)
    const batch = writeBatch(db)
    batch.update(doc(db, COLLECTIONS.arbitragesNavette, arbitrage.id), maj)
    const cyclesAMettreAJour = appliquerArbitrage(batch, arbitrage, ligneCourante)
    await batch.commit()

    setArbitrages((prev) => prev.map((a) => (a.id === arbitrage.id ? { ...a, ...maj } : a)))
    appliquerArbitrageLocal(arbitrage, cyclesAMettreAJour)
  }

  // Les deux visas posés d'un coup par un admin (23/08/2026, demande
  // explicite). Ils portent tous deux son identité : la double validation
  // n'est plus garantie par la règle mais par la trace, que l'écran affiche
  // (« les deux visas ont été posés par la même personne »).
  //
  // Le contrôle de rôle est côté écran, comme pour la cale et les correctifs
  // de ce même contexte ; côté base, `arbitrages_navette` est en
  // `allow update: if estAdmin() || viseNavette()`.
  const viserLesDeuxEtapes = async (arbitrageId: string, adminId: string) => {
    const arbitrage = arbitrages.find((a) => a.id === arbitrageId)
    if (!arbitrage) throw new Error(`Arbitrage introuvable : ${arbitrageId}`)
    if (!estEnAttente(arbitrage)) throw new Error('Cette révision est déjà traitée.')

    const le = new Date().toISOString()
    const visa: VisaArbitrage = { parId: adminId, le }
    const realiseYTDAuVisa = lignes.find((l) => l.id === arbitrage.ligneId)?.cycles.realiseYTD
    // Un visa de chef déjà posé par quelqu'un d'autre n'est pas écrasé : on
    // ne réécrit pas la trace d'un tiers, l'admin ne fait alors qu'ajouter le
    // second visa.
    const maj = {
      statut: 'valide' as const,
      ...(arbitrage.visaChefDepartement ? {} : { visaChefDepartement: visa }),
      visaDirecteurTechnique: visa,
      traiteParId: adminId,
      traiteLe: le,
      ...(realiseYTDAuVisa ? { realiseYTDAuVisa } : {}),
    }
    await validerEtAppliquer(arbitrage, maj)
  }

  // Réajustement d'une proposition encore en attente (23/08/2026, demande
  // explicite). Rien n'a été appliqué à ce stade — seul le visa du directeur
  // technique écrit sur la ligne et débite la cale — il n'y a donc rien à
  // défaire : on corrige le document de la révision et on renvoie le parcours
  // à sa première étape (cf. `parcoursApresAjustement`).
  const ajusterArbitrage = async (arbitrageId: string, ajustement: AjustementArbitrage) => {
    const arbitrage = arbitrages.find((a) => a.id === arbitrageId)
    if (!arbitrage) throw new Error(`Arbitrage introuvable : ${arbitrageId}`)
    if (!estEnAttente(arbitrage)) {
      throw new Error('Cette révision est déjà traitée : elle ne peut plus être réajustée.')
    }

    const { statut, visaChefRetire } = parcoursApresAjustement(arbitrage)
    const maj = {
      statut,
      montant: ajustement.montant,
      repartition: ajustement.repartition,
      montantPreleveCale: ajustement.montantPreleveCale,
    }
    await updateDoc(doc(db, COLLECTIONS.arbitragesNavette, arbitrageId), {
      ...maj,
      // `deleteField` et non `null` : un prélèvement retiré doit disparaître du
      // document, pas y rester à zéro (même convention que `motifRefus`).
      montantPreleveCale: ajustement.montantPreleveCale ?? deleteField(),
      ...(visaChefRetire ? { visaChefDepartement: deleteField() } : {}),
    })
    setArbitrages((prev) =>
      prev.map((a) =>
        a.id === arbitrageId ? { ...a, ...maj, visaChefDepartement: visaChefRetire ? undefined : a.visaChefDepartement } : a
      )
    )
  }

  // Un refus, à n'importe quelle étape, met fin au parcours : la révision ne
  // repart pas au demandeur pour correction (il en propose une nouvelle),
  // l'historique gardant trace de celle qui a été refusée et pourquoi.
  const rejeterArbitrage = async (arbitrageId: string, viseurId: string, motif?: string) => {
    const traiteLe = new Date().toISOString()
    const maj = { statut: 'refuse' as const, traiteParId: viseurId, traiteLe, motifRefus: motif?.trim() || undefined }
    await updateDoc(doc(db, COLLECTIONS.arbitragesNavette, arbitrageId), {
      ...maj,
      motifRefus: maj.motifRefus ?? deleteField(),
    })
    setArbitrages((prev) => prev.map((a) => (a.id === arbitrageId ? { ...a, ...maj } : a)))
  }

  // Révision admin appliquée immédiatement, sans passer par 'en_attente' —
  // pour corriger un cycle déjà validé, ou simplement obtenir l'application
  // immédiate d'une révision sans attendre les deux visas (retour
  // utilisateur : "ouvrir/corriger une révision déjà validée en conservant
  // l'historique"). Garde la même règle qu'une proposition normale (une
  // seule opération en attente à la fois par ligne) : un correctif ne doit
  // pas court-circuiter une révision en cours d'approbation.
  const reviserCorrectif = async (input: ArbitrageInput, validateurId: string) => {
    if (arbitrages.some((a) => a.ligneId === input.ligneId && estEnAttente(a))) {
      throw new Error('Une révision est déjà en attente de validation pour cette ligne.')
    }
    const ligneCourante = lignes.find((l) => l.id === input.ligneId)
    if (!ligneCourante) throw new Error(`Ligne navette introuvable : ${input.ligneId}`)
    const id = idDocument(input.ligneId, input.cycleId, Date.now().toString())
    const traiteLe = new Date().toISOString()
    // Même relevé qu'au visa du directeur technique : un correctif est le même
    // acte, appliqué sans passer par les deux visas.
    const realiseYTDAuVisa = ligneCourante.cycles.realiseYTD
    const docData: ArbitrageDoc = sansIndefinis({
      ...input,
      statut: 'valide',
      creeLe: traiteLe,
      traiteParId: validateurId,
      traiteLe,
      realiseYTDAuVisa,
    })
    const arbitrage = versArbitrageFront(id, docData)

    const batch = writeBatch(db)
    batch.set(doc(db, COLLECTIONS.arbitragesNavette, id), docData)
    const cyclesAMettreAJour = appliquerArbitrage(batch, arbitrage, ligneCourante)
    await batch.commit()

    setArbitrages((prev) => [arbitrage, ...prev])
    appliquerArbitrageLocal(arbitrage, cyclesAMettreAJour)
  }

  const definirCale = async (valeur: number) => {
    await setDoc(doc(db, COLLECTIONS.parametresNavette, ID_PARAMETRES_GLOBAUX), { cale: valeur }, { merge: true })
    setCaleDisponible(valeur)
  }

  const definirCaleInitiale = async (valeur: number) => {
    await setDoc(doc(db, COLLECTIONS.parametresNavette, ID_PARAMETRES_GLOBAUX), { caleInitiale: valeur }, { merge: true })
    setCaleInitiale(valeur)
  }

  return (
    <NavetteContext.Provider
      value={{
        lignes,
        chargement,
        rfsRecurrents,
        projetsCandidatsBU,
        arbitrages,
        caleDisponible,
        caleInitiale,
        tauxChange,
        createLigne,
        updateLigne,
        linkToProject,
        updateCommentaire,
        definirStatutLigne,
        supprimerLigne,
        proposerArbitrage,
        viserArbitrage,
        viserLesDeuxEtapes,
        ajusterArbitrage,
        rejeterArbitrage,
        reviserCorrectif,
        definirCale,
        definirCaleInitiale,
        rechargerLignes,
      }}
    >
      {children}
    </NavetteContext.Provider>
  )
}
