import { useEffect, useMemo, useState } from 'react'
import { collection, doc, getDocs, setDoc, writeBatch } from 'firebase/firestore'
import { db } from '../../lib/firebase'
import { COLLECTIONS, idDocument } from '../../lib/firestoreCollections'
import { combinerParCle } from '../../lib/saisie'
import { surveillerChargement } from '../../lib/incidents'
import { ACTIVITES_BASELINE, ACTIVITES_FORECAST, ACTIVITES_REALISE } from '../../data/courbeEnS/activites'
import { axeSemaines } from '../../lib/courbeEnSEngine'
import { resoudreProjetCourbeEnS } from '../../lib/liaisonCles'
import { activitesDepuisPlanning } from '../../lib/courbeEnSDepuisPlanning'
import { useResolveur } from '../../contexts/useResolveur'
import { useProjects } from '../../contexts/useProjects'
import type { ActiviteCourbe, VueCourbe } from '../../types/courbeEnS'
import { VUES_COURBE } from '../../types/courbeEnS'

// Chargement et écriture des activités de courbe en S, pour une fiche projet.
//
// Les 3 × 59 activités du classeur sont livrées avec le module
// (data/courbeEnS/activites.ts) : à ce volume, contre 7 911 lignes pour le
// tonnage, un fetch ne se justifie pas. Seules les saisies viennent de
// Firestore, et sont fusionnées par id (combinerParCle).

export interface ActivitesParVue {
  baseline: ActiviteCourbe[]
  forecast: ActiviteCourbe[]
  realise: ActiviteCourbe[]
}

const VIDE: ActivitesParVue = { baseline: [], forecast: [], realise: [] }

const IMPORTEES: ActivitesParVue = {
  baseline: ACTIVITES_BASELINE,
  forecast: ACTIVITES_FORECAST,
  realise: ACTIVITES_REALISE,
}

export type ActiviteSansId = Omit<ActiviteCourbe, 'id'>

/**
 * D'où viennent les activités affichées.
 * - `planning` : converties depuis le planning de la fiche — le cas normal,
 *   puisque toute fiche en reçoit un à sa création.
 * - `classeur` : reprises du classeur KPI_ICP et rattachées à cette fiche.
 *   Elles priment, sinon rattacher un projet du classeur n'aurait aucun effet
 *   visible.
 * - `aucune` : ni l'un ni l'autre.
 */
export type SourceCourbe = 'planning' | 'classeur' | 'aucune'

export interface CourbeEnSProjet {
  /** Chargement Firestore en cours. */
  chargement: boolean
  source: SourceCourbe
  /** Activités rattachées à la fiche projet, par vue. */
  activites: ActivitesParVue
  /**
   * Axe hebdomadaire : 53 semaines depuis le MIN(Start) de la feuille
   * Baseline **entière**, et non du seul projet ouvert. C'est l'axe du
   * classeur (`=+MIN(Baseline[Start])` puis `+7`) : le calculer sur le projet
   * décalerait les bornes de semaine et les pourcentages ne seraient plus
   * ceux du fichier.
   */
  semaines: string[]
  /** Noms de projet du classeur qu'aucune fiche ne réclame — proposés au
   * rattachement dans l'onglet. */
  projetsNonRattaches: string[]
  enregistrer: (vue: VueCourbe, input: ActiviteSansId, initiale: ActiviteCourbe | null) => Promise<void>
  rattacher: (nomProjetClasseur: string) => Promise<void>
  detacher: () => Promise<void>
}

export function useCourbeEnSProjet(projetId: string): CourbeEnSProjet {
  const [saisies, setSaisies] = useState<ActiviteCourbe[] | null>(null)
  const resolveur = useResolveur()
  const { projects } = useProjects()
  const projet = projects.find((p) => p.id === projetId) ?? null

  useEffect(() => {
    let actif = true
    // L'échec est signalé mais ne rejette pas : la règle Firestore de cette
    // collection n'est pas déployée (cf. CLAUDE.md), et un permission-denied
    // masquerait aussi les activités du classeur, qui elles sont livrées avec
    // le module. Sans le signalement, l'écran affirmerait qu'aucune activité
    // n'a été saisie alors qu'il n'a pas pu le vérifier.
    surveillerChargement(
      'Les activités de courbe en S saisies',
      getDocs(collection(db, COLLECTIONS.courbeEnSActivites)),
      null
    ).then((snap) => {
      if (!actif) return
      setSaisies(snap ? snap.docs.map((d) => ({ id: d.id, ...d.data() }) as ActiviteCourbe) : [])
    })
    return () => {
      actif = false
    }
  }, [])

  // Toutes les activités connues, saisies comprises — base de l'axe
  // hebdomadaire et de la liste des projets rattachables.
  const toutes = useMemo(() => {
    const parVue = (vue: VueCourbe) =>
      combinerParCle(
        IMPORTEES[vue],
        (saisies ?? []).filter((a) => a.vue === vue),
        (a) => a.id
      ).sort((a, b) => a.ordre - b.ordre)
    return { baseline: parVue('baseline'), forecast: parVue('forecast'), realise: parVue('realise') }
  }, [saisies])

  // Activités du classeur rattachées à cette fiche.
  const duClasseur = useMemo(
    () => ({
      baseline: toutes.baseline.filter((a) => resoudreProjetCourbeEnS(resolveur, a) === projetId),
      forecast: toutes.forecast.filter((a) => resoudreProjetCourbeEnS(resolveur, a) === projetId),
      realise: toutes.realise.filter((a) => resoudreProjetCourbeEnS(resolveur, a) === projetId),
    }),
    [toutes, resolveur, projetId]
  )

  // Le planning de la fiche, lu comme les 3 feuilles du classeur. Il ne sert
  // que si aucune activité du classeur n'est rattachée : deux sources
  // simultanées produiraient deux courbes pour un même projet.
  const duPlanning = useMemo(
    () => (projet ? activitesDepuisPlanning(projet.planning, projet) : null),
    [projet]
  )

  const source: SourceCourbe =
    duClasseur.baseline.length + duClasseur.forecast.length + duClasseur.realise.length > 0
      ? 'classeur'
      : (duPlanning?.baseline.length ?? 0) > 0
        ? 'planning'
        : 'aucune'

  const activites = source === 'classeur' ? duClasseur : (duPlanning ?? VIDE)

  // L'axe du classeur reste celui de la feuille entière (53 semaines depuis
  // son plus petit Start) ; celui d'un planning de fiche part du projet
  // lui-même, qui n'a pas d'autre référence.
  const semaines = useMemo(
    () => (source === 'planning' ? axeSemaines(activites.baseline) : axeSemaines(toutes.baseline)),
    [source, activites.baseline, toutes.baseline]
  )

  const projetsNonRattaches = useMemo(
    () =>
      [
        ...new Set(
          VUES_COURBE.flatMap((v) => toutes[v])
            .filter((a) => resoudreProjetCourbeEnS(resolveur, a) === null)
            .map((a) => a.projet)
        ),
      ].sort(),
    [toutes, resolveur]
  )

  const remplacerLocal = (lignes: ActiviteCourbe[]) =>
    setSaisies((prev) => {
      const ids = new Set(lignes.map((l) => l.id))
      return [...(prev ?? []).filter((a) => !ids.has(a.id)), ...lignes]
    })

  const enregistrer = async (vue: VueCourbe, input: ActiviteSansId, initiale: ActiviteCourbe | null) => {
    // Modifier une activité du classeur écrit un document dont l'ID EST son id
    // d'origine (`baseline-34`), qui prend alors sa place à l'affichage ; une
    // activité créée depuis la fiche reçoit un UUID préfixé par sa vue, la même
    // activité pouvant exister dans les 3 feuilles.
    const id = initiale ? initiale.id : `${vue}-${crypto.randomUUID()}`
    const ligne: ActiviteCourbe = { id, ...input, vue }
    const { id: _, ...donnees } = ligne
    void _
    await setDoc(doc(db, COLLECTIONS.courbeEnSActivites, idDocument(id)), donnees)
    remplacerLocal([ligne])
  }

  /**
   * Rattache à la fiche toutes les activités portant ce nom de projet dans le
   * classeur, en écrivant `projetId` — le lien explicite, plus sûr qu'un
   * rapprochement par nom qui se casserait au premier renommage. Même
   * convention que les autres modules : la copie écrite prend le pas sur la
   * ligne d'origine, qui n'est jamais modifiée.
   */
  const rattacher = async (nomProjetClasseur: string) => {
    const concernees = VUES_COURBE.flatMap((v) => toutes[v]).filter((a) => a.projet === nomProjetClasseur)
    await ecrireProjetId(concernees, projetId)
    remplacerLocal(concernees.map((a) => ({ ...a, projetId })))
  }

  /** Détache toutes les activités de cette fiche (retour au rapprochement par
   * nom, qui peut lui-même ne plus rien rendre — c'est le but recherché quand
   * on détache). */
  const detacher = async () => {
    const concernees = VUES_COURBE.flatMap((v) => duClasseur[v])
    await ecrireProjetId(concernees, null)
    remplacerLocal(concernees.map((a) => ({ ...a, projetId: null })))
  }

  return {
    chargement: saisies === null,
    source,
    activites,
    semaines,
    projetsNonRattaches,
    enregistrer,
    rattacher,
    detacher,
  }
}

/** `writeBatch` plafonne à 500 opérations ; un projet du classeur compte au
 * plus 3 × 7 activités, mais la borne est posée une fois pour toutes. */
async function ecrireProjetId(activites: ActiviteCourbe[], projetId: string | null) {
  for (let i = 0; i < activites.length; i += 400) {
    const batch = writeBatch(db)
    for (const a of activites.slice(i, i + 400)) {
      const { id, ...donnees } = a
      batch.set(doc(db, COLLECTIONS.courbeEnSActivites, idDocument(id)), { ...donnees, projetId })
    }
    await batch.commit()
  }
}
