import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { chargerProjets, sauvegarderProjet } from '../data/projects'
import { supprimerProjetEtDetacher } from '../lib/projectsSuppression'
import type { ReferenceProjetGroupe } from '../lib/projectsSuppression'
import {
  ajouterAugmentationCommande as ajouterAugmentationCommandeEngine,
  creerCommande as creerCommandeEngine,
  definirFacturesCommande,
  listerCommandes,
  modifierCommande as modifierCommandeEngine,
  rattacherCommande as rattacherCommandeEngine,
  supprimerCommande as supprimerCommandeEngine,
} from '../lib/commandesEngine'
import type { AjouterAugmentationInput, CreerCommandeInput, ModifierCommandeInput } from '../lib/commandesEngine'
import type { Commande, Facture, OpportuniteProjet, Projet, ProjetInput, RisqueProjet } from '../types/project'
import { createDefaultPlanning, avancementAutomatique } from '../lib/planning'
import type { ActiviteInput, Tache, TacheInput } from '../types/planning'
import { dernierReleve } from '../types/planning'
import { COURBE_TYPE_DEFAUT } from '../types/courbeEnS'
import type { NumeroCourbeType } from '../types/courbeEnS'
import type { CycleBudgetId } from '../types/navette'
import { createDefaultSuiviPhases, phasesPresentes } from '../types/suivi'
import type { ModificationScopeInput, SuiviPhase } from '../types/suivi'
import type { CommandeMaterielInput } from '../types/procurement'
import type { SaisieHSEMensuelleInput } from '../types/hse'
import type { HypotheseInput } from '../types/hypothese'
import type { PieceJointe } from '../types/pieceJointe'
import type { ActionInput } from '../types/action'
import { defaultTravauxTerrain } from '../types/travauxTerrain'
import type { TonnageEntryInput, PeintureEntryInput, CRJEntryInput, StandbyEntryInput } from '../types/travauxTerrain'
import { surveillerChargement, surveillerEcriture } from '../lib/incidents'
import { ProjectsContext } from './projects-context'
import { useAuth } from './useAuth'
import type { PresentationProjetInput } from './projects-context'
import { synchroniserReferences } from '../types/referencesProjet'
import type { ReferenceOT } from '../types/referencesProjet'

/**
 * Réinjecte dans une fiche les commandes de la collection qui la désignent
 * (25/08/2026, doc/module contrat.docx §3).
 *
 * C'est ce qui permet aux ~20 écrans qui lisent `projet.commandes`
 * (engagement d'une fiche, feuille de route, consommation d'un contrat,
 * résolveur de liaison…) de continuer à fonctionner sans être réécrits. Les
 * commandes restées dans le document de la fiche — celles d'avant la
 * migration — sont conservées et affichées à côté ; elles ne sont donc jamais
 * perdues, même si la migration n'est pas passée.
 */
/** Les seules commandes que le document de la fiche porte réellement. */
function sansCollection(projet: Projet): Commande[] {
  return projet.commandes.filter((c) => c.source !== 'collection')
}

function avecCommandes(projet: Projet, commandes: Commande[]): Projet {
  const siennes = commandes.filter((c) => c.projetId === projet.id)
  if (siennes.length === 0) return projet
  // Une commande migrée garde son identifiant d'origine : on écarte la copie
  // restée inline, sinon elle compterait deux fois dans l'engagement.
  const ids = new Set(siennes.map((c) => c.id))
  return { ...projet, commandes: [...projet.commandes.filter((c) => !ids.has(c.id)), ...siennes] }
}

export function ProjectsProvider({ children }: { children: ReactNode }) {
  const [projects, setProjects] = useState<Projet[]>([])
  // Commandes de la collection autonome (25/08/2026, doc/module contrat.docx
  // §3) — **y compris celles sans fiche projet**, que `projects` ne peut par
  // construction pas porter. Celles qui ont une fiche sont en plus réinjectées
  // dans `projet.commandes` (cf. `avecCommandes`).
  const [commandes, setCommandes] = useState<Commande[]>([])
  const { currentUser } = useAuth()

  const rechargerCommandes = async () => {
    const liste = await surveillerChargement('Les commandes', listerCommandes(), [])
    setCommandes(liste)
    return liste
  }

  useEffect(() => {
    void Promise.all([
      surveillerChargement('Les fiches projet', chargerProjets(), []),
      surveillerChargement('Les commandes', listerCommandes(), []),
    ]).then(([fiches, liste]) => {
      setCommandes(liste)
      setProjects(fiches.map((p) => avecCommandes(p, liste)))
    })
  }, [])

  const updateProject = (projetId: string, updater: (p: Projet) => Projet) => {
    const actuel = projects.find((p) => p.id === projetId)
    if (!actuel) return
    const suivant = updater(actuel)
    setProjects((prev) => prev.map((p) => (p.id === projetId ? suivant : p)))
    // L'état local est déjà à jour (mise à jour optimiste) : sans ce
    // signalement, un refus d'écriture laisserait l'utilisateur convaincu
    // d'avoir enregistré.
    void surveillerEcriture(`La fiche projet « ${suivant.nom} »`, sauvegarderProjet(suivant))
  }

  // Transfert des fiches d'un chargé d'affaires à un autre — voir
  // projects-context.ts pour la raison d'être. Les écritures passent par
  // `sauvegarderProjet` comme partout ailleurs (un `setDoc` par fiche) :
  // Firestore n'a pas de mise à jour par requête, et un `writeBatch` ne
  // servirait qu'à rendre l'opération atomique, au prix d'une seconde façon
  // d'écrire une fiche. Le nombre de fiches concernées se compte en dizaines.
  const reaffecterProjets = async (deAgentId: string, versAgentId: string): Promise<number> => {
    const concernes = projects.filter((p) => p.agentId === deAgentId)
    if (concernes.length === 0) return 0
    const transferes = concernes.map((p) => ({ ...p, agentId: versAgentId }))
    setProjects((prev) => prev.map((p) => transferes.find((t) => t.id === p.id) ?? p))
    for (const projet of transferes) {
      await surveillerEcriture(`La fiche projet « ${projet.nom} »`, sauvegarderProjet(projet))
    }
    return transferes.length
  }

  // Suppression d'une fiche (04/09/2026) : contrairement aux autres écritures
  // de ce contexte (mise à jour optimiste avant l'écriture), on attend que le
  // détachement et la suppression Firestore aboutissent avant de retirer la
  // fiche de l'état local — un refus des règles (`estAdmin()`) doit laisser
  // la fiche visible plutôt que la faire disparaître de l'écran pour rien.
  const supprimerProjet = async (projetId: string, groupes: ReferenceProjetGroupe[]): Promise<void> => {
    await supprimerProjetEtDetacher(projetId, groupes)
    setProjects((prev) => prev.filter((p) => p.id !== projetId))
  }

  const createProject = (input: ProjetInput): Projet => {
    const planning = createDefaultPlanning(input.dateDebut, input.dateFin)
    const project: Projet = {
      ...input,
      id: crypto.randomUUID(),
      estimationReelle: input.budgetPrevisionnel,
      etatGlobal: 'bon',
      avisNumeros: input.avisNumero ? [input.avisNumero] : [],
      numerosOT: [],
      commandes: [],
      planning,
      suiviPhases: createDefaultSuiviPhases(phasesPresentes(planning.baseline)),
      modificationsScope: [],
      procurement: [],
      hse: [],
      actionsHSE: [],
      hypotheses: [],
      commentairesHypotheses: [],
      travauxTerrain: defaultTravauxTerrain(),
      planAction: [],
      cahierDesCharges: [],
    }
    setProjects((prev) => [project, ...prev])
    sauvegarderProjet(project).catch((e) => console.error('Échec de création du projet', e))
    return project
  }

  // Clés naturelles de la fiche (Logique_metier_liaisons_ICP.docx §2.4). La
  // fiche projet est la **donnée de référence** de tout ce qui la concerne :
  // ce sont ces clés que les journaux terrain rapprochent. Elles n'étaient
  // posées qu'à la création (un seul avis, aucun OT) et n'ont jamais été
  // modifiables ensuite — une fiche ne pouvait donc pas capter un second
  // avis ni un OT apparu en cours de chantier.
  const ajouterReferenceProjet = (projetId: string, type: 'avis' | 'ot', valeur: string) => {
    const v = valeur.trim()
    if (!v) return
    updateProject(projetId, (p) => {
      const liste = type === 'avis' ? p.avisNumeros : p.numerosOT
      // Doublon insensible à la casse : deux graphies du même numéro
      // n'ajoutent rien à la résolution et alourdissent la fiche.
      if (liste.some((x) => x.trim().toLowerCase() === v.toLowerCase())) return p
      return type === 'avis' ? { ...p, avisNumeros: [...p.avisNumeros, v] } : { ...p, numerosOT: [...p.numerosOT, v] }
    })
  }

  const retirerReferenceProjet = (projetId: string, type: 'avis' | 'ot', valeur: string) => {
    updateProject(projetId, (p) =>
      type === 'avis'
        ? { ...p, avisNumeros: p.avisNumeros.filter((x) => x !== valeur) }
        : { ...p, numerosOT: p.numerosOT.filter((x) => x !== valeur) }
    )
  }

  const definirClesProjet = (projetId: string, cles: { codeOTP?: string; champ?: string }) => {
    updateProject(projetId, (p) => ({
      ...p,
      codeOTP: cles.codeOTP?.trim() || undefined,
      champ: cles.champ?.trim() || undefined,
    }))
  }

  // Groupes OT → avis. La liste arrive déjà validée par les règles pures de
  // `types/referencesProjet.ts` ; ce qui est fait ici, et qui ne doit l'être
  // qu'à un seul endroit, c'est de remettre `avisNumeros`/`numerosOT` d'accord
  // avec elle — le résolveur ne lit que ces deux listes plates.
  const definirReferencesOT = (projetId: string, references: ReferenceOT[]) => {
    updateProject(projetId, (p) => synchroniserReferences(p, references))
  }

  const definirPlateformes = (projetId: string, plateformes: string[]) => {
    updateProject(projetId, (p) => ({ ...p, plateformes }))
  }

  const definirCodesOTP = (projetId: string, codes: string[]) => {
    updateProject(projetId, (p) => ({ ...p, codesOTP: codes }))
  }

  // Présentation de la fiche : contexte, risques, mitigation, opportunités,
  // gains. Mise à jour partielle — l'écran enregistre un champ à la fois, et
  // n'a donc pas à renvoyer les quatre autres au risque d'écraser une saisie
  // faite entre-temps ailleurs.
  const definirPresentationProjet = (projetId: string, champs: PresentationProjetInput) => {
    updateProject(projetId, (p) => ({ ...p, ...champs }))
  }

  // Les textes libres `risques`/`mitigationRisques` du modèle précédent ne sont
  // pas effacés : ils restent la trace de ce qui avait été écrit, et
  // `risquesDeLaFiche()` cesse de les lire dès que cette liste existe.
  const definirRisquesProjet = (projetId: string, risques: RisqueProjet[]) => {
    updateProject(projetId, (p) => ({ ...p, analyseRisques: risques }))
  }

  const definirOpportunitesProjet = (projetId: string, opportunites: OpportuniteProjet[]) => {
    updateProject(projetId, (p) => ({ ...p, analyseOpportunites: opportunites }))
  }

  // --- Commandes (PO) — collection autonome depuis le 25/08/2026 -----------
  // Les écritures passent désormais par `commandesEngine`, puis rechargent la
  // collection et réinjectent le résultat dans les fiches. Une commande créée
  // sans fiche projet (doc/module contrat.docx §3) n'apparaît que dans
  // `commandes` ; les autres se retrouvent dans `projet.commandes` comme
  // avant, pour les écrans qui les y lisent.
  const rafraichirCommandes = async () => {
    const liste = await rechargerCommandes()
    setProjects((prev) => prev.map((p) => avecCommandes({ ...p, commandes: sansCollection(p) }, liste)))
  }

  const creerCommande = async (input: Omit<CreerCommandeInput, 'creePar'>) => {
    await surveillerEcriture(`La commande « ${input.numero} »`, creerCommandeEngine({ ...input, creePar: currentUser?.name }))
    await rafraichirCommandes()
  }

  const modifierCommande = async (commandeId: string, input: ModifierCommandeInput) => {
    await surveillerEcriture(`La commande « ${input.numero} »`, modifierCommandeEngine(commandeId, input))
    await rafraichirCommandes()
  }

  const ajouterAugmentationCommande = async (commandeId: string, input: Omit<AjouterAugmentationInput, 'saisiPar'>) => {
    await surveillerEcriture(
      "L'augmentation de la commande",
      ajouterAugmentationCommandeEngine(commandeId, { ...input, saisiPar: currentUser?.name })
    )
    await rafraichirCommandes()
  }

  const rattacherCommande = async (commandeId: string, projetId: string | null) => {
    await surveillerEcriture('Le rattachement de la commande', rattacherCommandeEngine(commandeId, projetId))
    await rafraichirCommandes()
  }

  /**
   * Retrouve une commande, qu'elle vive dans la collection ou soit restée
   * dans le document d'une fiche (commandes d'avant la migration).
   */
  const trouverCommande = (commandeId: string): Commande | undefined =>
    commandes.find((c) => c.id === commandeId) ??
    projects.flatMap((p) => p.commandes).find((c) => c.id === commandeId)

  const addCommande = (projetId: string, numero: string, montant: number, contratId: string, fournisseur?: string, libelle?: string) => {
    void creerCommande({ numero, montantInitial: montant, contratId, projetId, fournisseur, libelle })
  }

  const removeCommande = (projetId: string, commandeId: string) => {
    const commande = trouverCommande(commandeId)
    if (commande?.source === 'collection') {
      void surveillerEcriture('La suppression de la commande', supprimerCommandeEngine(commandeId)).then(() =>
        rafraichirCommandes()
      )
      return
    }
    // Commande restée dans le document de la fiche (avant migration).
    updateProject(projetId, (p) => ({ ...p, commandes: p.commandes.filter((c) => c.id !== commandeId) }))
  }

  const addFacture = (projetId: string, commandeId: string, numero: string, montant: number, date?: string, complement?: Partial<Facture>) => {
    const facture: Facture = { id: crypto.randomUUID(), numero, montant, date, ...complement }
    const commande = trouverCommande(commandeId)
    if (commande?.source === 'collection') {
      void surveillerEcriture(
        `La facture « ${numero} »`,
        definirFacturesCommande(commandeId, [...(commande.factures ?? []), facture])
      ).then(() => rafraichirCommandes())
      return
    }
    updateProject(projetId, (p) => ({
      ...p,
      commandes: p.commandes.map((c) => (c.id === commandeId ? { ...c, factures: [...(c.factures ?? []), facture] } : c)),
    }))
  }

  /**
   * Modifie une facture (identification ou workflow de validation, doc/module
   * contrat.docx §5). Passe par le même aiguillage que `addFacture` : une
   * commande de la collection écrit dans son document, une commande restée
   * dans une fiche passe par la fiche.
   */
  const modifierFacture = (projetId: string, commandeId: string, factureId: string, patch: Partial<Facture>) => {
    const appliquer = (factures: Facture[]) => factures.map((f) => (f.id === factureId ? { ...f, ...patch } : f))
    const commande = trouverCommande(commandeId)
    if (commande?.source === 'collection') {
      void surveillerEcriture(
        'La facture',
        definirFacturesCommande(commandeId, appliquer(commande.factures ?? []))
      ).then(() => rafraichirCommandes())
      return
    }
    updateProject(projetId, (p) => ({
      ...p,
      commandes: p.commandes.map((c) => (c.id === commandeId ? { ...c, factures: appliquer(c.factures ?? []) } : c)),
    }))
  }

  const removeFacture = (projetId: string, commandeId: string, factureId: string) => {
    const commande = trouverCommande(commandeId)
    if (commande?.source === 'collection') {
      void surveillerEcriture(
        'La suppression de la facture',
        definirFacturesCommande(commandeId, (commande.factures ?? []).filter((f) => f.id !== factureId))
      ).then(() => rafraichirCommandes())
      return
    }
    updateProject(projetId, (p) => ({
      ...p,
      commandes: p.commandes.map((c) =>
        c.id === commandeId ? { ...c, factures: (c.factures ?? []).filter((f) => f.id !== factureId) } : c
      ),
    }))
  }

  const updateSuiviPhase = (projetId: string, updated: SuiviPhase) => {
    updateProject(projetId, (p) => ({
      ...p,
      suiviPhases: p.suiviPhases.map((s) => (s.phase === updated.phase ? updated : s)),
    }))
  }

  // Les phases n'étaient posées qu'à la création de la fiche, depuis les
  // phases du planning (createDefaultSuiviPhases) — impossible d'en ajouter
  // une apparue en cours de projet, ni de corriger un intitulé.
  // Une phase se crée avec ses activités (18/08/2026, demande explicite
  // « lors de l'ajout d'une phase on doit avoir la possibilité de rajouter
  // plusieurs activités liées à cette phase ») — une activité est une tâche
  // de planning, la seule chose qui donne à une phase un avancement, une
  // place dans le diagramme d'état et une courbe. Tout part dans la MÊME
  // écriture : passer par `addTacheBaseline` en boucle produirait une
  // sauvegarde Firestore de la fiche entière par activité.
  //
  // La même fonction sert à ajouter des activités à une phase existante
  // (bouton « Ajouter des activités » d'une carte de phase) : la phase n'est
  // créée que si elle manque, les activités sont toujours ajoutées.
  const ajouterPhaseSuivi = (projetId: string, phase: string, activites: ActiviteInput[] = []) => {
    const nom = phase.trim()
    if (!nom) return
    updateProject(projetId, (p) => {
      const taches: Tache[] = activites
        .filter((a) => a.nom.trim() !== '')
        .map((a) => ({
          id: crypto.randomUUID(),
          phase: nom,
          nom: a.nom.trim(),
          dateDebut: a.dateDebut,
          dateFin: a.dateFin,
          avancement: 0,
          typicalSCurve: COURBE_TYPE_DEFAUT,
        }))
      return {
        ...p,
        suiviPhases: p.suiviPhases.some((s) => s.phase === nom)
          ? p.suiviPhases
          : [...p.suiviPhases, ...createDefaultSuiviPhases([nom])],
        planning: {
          ...p.planning,
          baseline: [...p.planning.baseline, ...taches],
          // Les 3 vues décrivent le même travail (cf. addTacheBaseline) : une
          // activité absente du forecast et du réalisé n'aurait ni
          // prévisionnel ni avancement à saisir.
          forecast: [...p.planning.forecast, ...taches.map((t) => ({ ...t }))],
          reel: [...p.planning.reel, ...taches.map((t) => ({ ...t }))],
        },
      }
    })
  }

  // Le nom de la phase est la seule clé de jointure entre le suivi, les
  // tâches du planning (Tache.phase, lue par PhaseEtatDiagram et
  // avancementPlanning) et l'origine des actions : renommer d'un seul côté
  // désolidariserait la phase de son avancement. Les 3 vues du planning sont
  // renommées avec elle, dans la même écriture.
  const renommerPhaseSuivi = (projetId: string, ancien: string, nouveau: string) => {
    const nom = nouveau.trim()
    if (!nom || nom === ancien) return
    updateProject(projetId, (p) => {
      // Deux phases ne peuvent pas porter le même nom : les fusionner
      // silencieusement ferait disparaître le suivi de l'une des deux.
      if (p.suiviPhases.some((s) => s.phase === nom)) return p
      const renommer = (taches: Tache[]) => taches.map((t) => (t.phase === ancien ? { ...t, phase: nom } : t))
      return {
        ...p,
        suiviPhases: p.suiviPhases.map((s) => (s.phase === ancien ? { ...s, phase: nom } : s)),
        planning: {
          ...p.planning,
          baseline: renommer(p.planning.baseline),
          forecast: renommer(p.planning.forecast),
          reel: renommer(p.planning.reel),
        },
        planAction: (p.planAction ?? []).map((a) => (a.origine === ancien ? { ...a, origine: nom } : a)),
      }
    })
  }

  // Ne retire que le suivi : la suppression est refusée côté UI tant que des
  // tâches de planning portent la phase (elles deviendraient orphelines).
  const supprimerPhaseSuivi = (projetId: string, phase: string) => {
    updateProject(projetId, (p) => ({ ...p, suiviPhases: p.suiviPhases.filter((s) => s.phase !== phase) }))
  }

  // Entrée structurée depuis le 18/08/2026 : la phase touchée s'ajoutant aux
  // 4 arguments positionnels précédents, l'ordre devenait indevinable.
  const addModificationScope = (projetId: string, input: ModificationScopeInput) => {
    updateProject(projetId, (p) => ({
      ...p,
      modificationsScope: [
        ...p.modificationsScope,
        {
          ...input,
          id: crypto.randomUUID(),
          date: new Date().toISOString().slice(0, 10),
        },
      ],
    }))
  }

  // Suppression définitive (04/09/2026, demande explicite « on le fera sur
  // toutes les interfaces ») — jusqu'ici seul l'ajout existait, une
  // modification de scope saisie par erreur ne pouvait pas être retirée.
  const removeModificationScope = (projetId: string, id: string) => {
    updateProject(projetId, (p) => ({
      ...p,
      modificationsScope: p.modificationsScope.filter((m) => m.id !== id),
    }))
  }

  const addAction = (projetId: string, input: ActionInput) => {
    updateProject(projetId, (p) => ({
      ...p,
      planAction: [
        ...(p.planAction ?? []),
        { ...input, id: crypto.randomUUID(), statut: 'ouverte', creeLe: new Date().toISOString() },
      ],
    }))
  }

  // Bascule ouverte/clôturée — fixe (ou efface) la date réelle de clôture au
  // passage, pour permettre de calculer l'écart avec la date cible (retour
  // utilisateur : "le suivi de l'écart entre la date cible et la date
  // réelle est important pour mesurer les retards").
  const toggleAction = (projetId: string, actionId: string) => {
    updateProject(projetId, (p) => ({
      ...p,
      planAction: (p.planAction ?? []).map((a) =>
        a.id === actionId
          ? a.statut === 'ouverte'
            ? { ...a, statut: 'cloturee' as const, dateReelleCloture: new Date().toISOString().slice(0, 10) }
            : { ...a, statut: 'ouverte' as const, dateReelleCloture: undefined }
          : a
      ),
    }))
  }

  const addDocumentCahierDesCharges = (projetId: string, document: PieceJointe) => {
    updateProject(projetId, (p) => ({
      ...p,
      cahierDesCharges: [...(p.cahierDesCharges ?? []), document],
    }))
  }

  const removeDocumentCahierDesCharges = (projetId: string, documentId: string) => {
    updateProject(projetId, (p) => ({
      ...p,
      cahierDesCharges: (p.cahierDesCharges ?? []).filter((d) => d.id !== documentId),
    }))
  }

  // Propage un commentaire externe (Navette/Feuille de route) dans le plan
  // d'action du projet lié — upsert par `sourceId` pour que les modifications
  // successives du même commentaire mettent à jour la même entrée plutôt que
  // d'empiler des doublons ; un commentaire vidé/repassé à "RAS" retire le
  // signal (retour utilisateur : généralisation transverse du plan d'action).
  const synchroniserSignalExterne = (projetId: string, sourceId: string, origine: string, commentaire: string) => {
    const texte = commentaire.trim()
    const estVide = texte === '' || texte.toUpperCase() === 'RAS'
    updateProject(projetId, (p) => {
      const signales = p.signalesExternes ?? []
      const existant = signales.find((s) => s.sourceId === sourceId)
      const date = new Date().toISOString().slice(0, 10)
      if (estVide) {
        if (!existant) return p
        return { ...p, signalesExternes: signales.filter((s) => s.sourceId !== sourceId) }
      }
      return {
        ...p,
        signalesExternes: existant
          ? signales.map((s) => (s.sourceId === sourceId ? { ...s, commentaire: texte, date } : s))
          : [...signales, { id: crypto.randomUUID(), origine, sourceId, commentaire: texte, date }],
      }
    })
  }

  const retirerSignalExterne = (projetId: string, signalId: string) => {
    updateProject(projetId, (p) => ({
      ...p,
      signalesExternes: (p.signalesExternes ?? []).filter((s) => s.id !== signalId),
    }))
  }

  const addCommandeMateriel = (projetId: string, input: CommandeMaterielInput) => {
    updateProject(projetId, (p) => ({
      ...p,
      procurement: [...p.procurement, { ...input, id: crypto.randomUUID() }],
    }))
  }

  const receptionCommandeMateriel = (projetId: string, commandeId: string, dateReceptionReelle: string) => {
    updateProject(projetId, (p) => ({
      ...p,
      procurement: p.procurement.map((c) => (c.id === commandeId ? { ...c, dateReceptionReelle } : c)),
    }))
  }

  // Une saisie par (année, mois) — ré-enregistrer le même mois met à jour
  // l'entrée existante plutôt que d'empiler des doublons (même logique que
  // la consommation manuelle des contrats, contratsEngine.ts).
  const saisirHSEMensuel = (projetId: string, input: SaisieHSEMensuelleInput) => {
    updateProject(projetId, (p) => {
      const id = `${input.annee}-${input.mois}`
      const existe = p.hse.some((s) => s.id === id)
      return {
        ...p,
        hse: existe
          ? p.hse.map((s) => (s.id === id ? { ...input, id } : s))
          : [...p.hse, { ...input, id }],
      }
    })
  }

  const addActionHSE = (projetId: string, description: string) => {
    updateProject(projetId, (p) => ({
      ...p,
      actionsHSE: [
        ...p.actionsHSE,
        { id: crypto.randomUUID(), description, statut: 'ouverte', dateCreation: new Date().toISOString().slice(0, 10) },
      ],
    }))
  }

  const toggleActionHSE = (projetId: string, actionId: string) => {
    updateProject(projetId, (p) => ({
      ...p,
      actionsHSE: p.actionsHSE.map((a) =>
        a.id === actionId ? { ...a, statut: a.statut === 'ouverte' ? 'cloturee' : 'ouverte' } : a
      ),
    }))
  }

  const addHypothese = (projetId: string, input: HypotheseInput) => {
    updateProject(projetId, (p) => ({
      ...p,
      hypotheses: [...p.hypotheses, { ...input, id: crypto.randomUUID(), retenue: p.hypotheses.length === 0, piecesJointes: [] }],
    }))
  }

  // `valideParId` trace l'arbitrage/validation formelle (retour utilisateur :
  // la sélection doit être une décision explicite après comparaison des
  // scénarios, pas juste un flag silencieux).
  const retenirHypothese = (projetId: string, hypotheseId: string, valideParId: string) => {
    const valideeLe = new Date().toISOString()
    updateProject(projetId, (p) => ({
      ...p,
      hypotheses: p.hypotheses.map((h) =>
        h.id === hypotheseId
          ? { ...h, retenue: true, valideeParId: valideParId, valideeLe }
          : { ...h, retenue: false, valideeParId: undefined, valideeLe: undefined }
      ),
    }))
  }

  const addPieceJointeHypothese = (projetId: string, hypotheseId: string, pieceJointe: PieceJointe) => {
    updateProject(projetId, (p) => ({
      ...p,
      hypotheses: p.hypotheses.map((h) =>
        h.id === hypotheseId ? { ...h, piecesJointes: [...(h.piecesJointes ?? []), pieceJointe] } : h
      ),
    }))
  }

  const removePieceJointeHypothese = (projetId: string, hypotheseId: string, pieceJointeId: string) => {
    updateProject(projetId, (p) => ({
      ...p,
      hypotheses: p.hypotheses.map((h) =>
        h.id === hypotheseId ? { ...h, piecesJointes: (h.piecesJointes ?? []).filter((pj) => pj.id !== pieceJointeId) } : h
      ),
    }))
  }

  const addCommentaireHypothese = (projetId: string, auteurId: string, texte: string) => {
    updateProject(projetId, (p) => ({
      ...p,
      commentairesHypotheses: [
        ...p.commentairesHypotheses,
        { id: crypto.randomUUID(), auteurId, texte, date: new Date().toISOString().slice(0, 10) },
      ],
    }))
  }

  // Horodatage complet (et non la date seule comme commentairesHypotheses) :
  // plusieurs commentaires par jour sont attendus dans un fil de discussion,
  // il faut pouvoir les ordonner.
  const ajouterCommentaireProjet = (projetId: string, auteurId: string, texte: string) => {
    updateProject(projetId, (p) => ({
      ...p,
      commentaires: [
        ...(p.commentaires ?? []),
        { id: crypto.randomUUID(), auteurId, texte, date: new Date().toISOString() },
      ],
    }))
  }

  const supprimerCommentaireProjet = (projetId: string, commentaireId: string) => {
    updateProject(projetId, (p) => ({
      ...p,
      commentaires: (p.commentaires ?? []).filter((c) => c.id !== commentaireId),
    }))
  }

  const addTonnageEntry = (projetId: string, input: TonnageEntryInput) => {
    updateProject(projetId, (p) => ({
      ...p,
      travauxTerrain: { ...p.travauxTerrain, tonnage: [...p.travauxTerrain.tonnage, { ...input, id: crypto.randomUUID() }] },
    }))
  }

  const addPeintureEntry = (projetId: string, input: PeintureEntryInput) => {
    updateProject(projetId, (p) => ({
      ...p,
      travauxTerrain: { ...p.travauxTerrain, peinture: [...p.travauxTerrain.peinture, { ...input, id: crypto.randomUUID() }] },
    }))
  }

  const addCRJEntry = (projetId: string, input: CRJEntryInput) => {
    updateProject(projetId, (p) => ({
      ...p,
      travauxTerrain: { ...p.travauxTerrain, crj: [...p.travauxTerrain.crj, { ...input, id: crypto.randomUUID() }] },
    }))
  }

  const addStandbyEntry = (projetId: string, input: StandbyEntryInput) => {
    updateProject(projetId, (p) => ({
      ...p,
      travauxTerrain: { ...p.travauxTerrain, standby: [...p.travauxTerrain.standby, { ...input, id: crypto.randomUUID() }] },
    }))
  }

  // Ajout d'une tâche depuis la baseline (retour utilisateur) — répercutée
  // à l'identique (même id) sur forecast/reel pour garder les 3 vues sur le
  // même référentiel de tâches ; seules leurs dates/avancement diffèrent
  // ensuite. Crée aussi une carte SuiviPhase par défaut si le processus/
  // phase saisi est nouveau, pour qu'il apparaisse dans l'onglet Suivi.
  const addTacheBaseline = (projetId: string, input: TacheInput) => {
    updateProject(projetId, (p) => {
      // Type 4 — Construction (EPC) par défaut, comme les tâches créées avec
      // la fiche (createDefaultPlanning) : sans gabarit, la courbe de cette
      // tâche est un escalier (22/08/2026).
      const tache: Tache = {
        ...input,
        id: crypto.randomUUID(),
        avancement: 0,
        typicalSCurve: COURBE_TYPE_DEFAUT,
      }
      const phaseConnue = p.suiviPhases.some((s) => s.phase === input.phase)
      return {
        ...p,
        planning: {
          baseline: [...p.planning.baseline, tache],
          forecast: [...p.planning.forecast, { ...tache }],
          reel: [...p.planning.reel, { ...tache }],
        },
        suiviPhases: phaseConnue ? p.suiviPhases : [...p.suiviPhases, ...createDefaultSuiviPhases([input.phase])],
      }
    })
  }

  // Modification d'une tâche baseline : la phase/le nom (l'identité de la
  // tâche) sont répercutés sur forecast/reel (même id) pour rester la même
  // référence partout ; leurs dates/avancement propres restent inchangés —
  // seule la baseline peut aussi modifier ses propres dates.
  const updateTacheBaseline = (projetId: string, tacheId: string, input: TacheInput) => {
    updateProject(projetId, (p) => ({
      ...p,
      planning: {
        baseline: p.planning.baseline.map((t) => (t.id === tacheId ? { ...t, ...input } : t)),
        forecast: p.planning.forecast.map((t) => (t.id === tacheId ? { ...t, phase: input.phase, nom: input.nom } : t)),
        reel: p.planning.reel.map((t) => (t.id === tacheId ? { ...t, phase: input.phase, nom: input.nom } : t)),
      },
    }))
  }

  // Gabarit d'avancement d'une tâche (colonne « Typical S-curve » du
  // classeur) : répercuté sur les 3 vues comme la phase et le nom, parce qu'il
  // fait partie de l'identité de la tâche — la baseline, le forecast et le
  // réalisé décrivent le même travail, il ne se déroule pas selon deux
  // gabarits différents. C'est la seule donnée que la courbe en S demande au
  // planning et que celui-ci ne portait pas encore (14/08/2026).
  const definirGabaritTache = (projetId: string, tacheId: string, gabarit: NumeroCourbeType | null) => {
    updateProject(projetId, (p) => {
      const poser = (taches: Tache[]) =>
        taches.map((t) => (t.id === tacheId ? { ...t, typicalSCurve: gabarit } : t))
      return {
        ...p,
        planning: {
          baseline: poser(p.planning.baseline),
          forecast: poser(p.planning.forecast),
          reel: poser(p.planning.reel),
        },
      }
    })
  }

  // Même gabarit pour toutes les tâches d'un coup : sur un planning créé
  // automatiquement, les 7 sous-phases relèvent du même type de projet.
  const definirGabaritToutesTaches = (projetId: string, gabarit: NumeroCourbeType) => {
    updateProject(projetId, (p) => {
      const poser = (taches: Tache[]) => taches.map((t) => ({ ...t, typicalSCurve: gabarit }))
      return {
        ...p,
        planning: {
          baseline: poser(p.planning.baseline),
          forecast: poser(p.planning.forecast),
          reel: poser(p.planning.reel),
        },
      }
    })
  }

  // Source du budget de la courbe en S (22/08/2026) : seul le **choix** est
  // enregistré sur la fiche. Le montant, lui, est relu à chaque affichage sur
  // la ligne navette rattachée — le recopier ici le figerait, et une révision
  // validée après coup laisserait un budget périmé sans que rien ne le
  // signale (le défaut corrigé le 13/08/2026 sur la feuille de route).
  const definirSourceBudgetCourbe = (projetId: string, cycle: CycleBudgetId) => {
    updateProject(projetId, (p) => ({ ...p, sourceBudgetCourbe: cycle }))
  }

  const removeTacheBaseline = (projetId: string, tacheId: string) => {
    updateProject(projetId, (p) => ({
      ...p,
      planning: {
        baseline: p.planning.baseline.filter((t) => t.id !== tacheId),
        forecast: p.planning.forecast.filter((t) => t.id !== tacheId),
        reel: p.planning.reel.filter((t) => t.id !== tacheId),
      },
    }))
  }

  const updateForecastTacheDates = (projetId: string, tacheId: string, dateDebut: string, dateFin: string) => {
    updateProject(projetId, (p) => ({
      ...p,
      planning: {
        ...p.planning,
        forecast: p.planning.forecast.map((t) =>
          t.id === tacheId ? { ...t, dateDebut, dateFin, avancement: avancementAutomatique(dateDebut, dateFin) } : t
        ),
      },
    }))
  }

  const updateReelTacheDates = (projetId: string, tacheId: string, dateDebut: string, dateFin: string) => {
    updateProject(projetId, (p) => ({
      ...p,
      planning: {
        ...p.planning,
        reel: p.planning.reel.map((t) => (t.id === tacheId ? { ...t, dateDebut, dateFin } : t)),
      },
    }))
  }

  const updateReelTacheAvancement = (projetId: string, tacheId: string, avancement: number) => {
    const borne = Math.min(100, Math.max(0, Math.round(avancement)))
    updateProject(projetId, (p) => ({
      ...p,
      planning: {
        ...p.planning,
        reel: p.planning.reel.map((t) => (t.id === tacheId ? { ...t, avancement: borne } : t)),
      },
    }))
  }

  /**
   * Relevé d'avancement d'une tâche pour **une semaine** de l'axe (22/08/2026)
   * — la saisie de la feuille « Projet_Réalisé Actualisé », où le pointage
   * s'écrit dans la cellule de sa semaine.
   *
   * `avancement` reste écrit, mais devient **dérivé** : c'est le dernier
   * relevé non vide, exactement la colonne « % » du classeur. Il est lu
   * partout ailleurs dans l'application (avancement de la fiche, cartes de
   * phase, feuille de route) — le recalculer ici évite d'avoir deux
   * avancements pour la même tâche.
   *
   * `valeur === null` efface le relevé de cette semaine : une cellule vidée
   * dans le classeur cesse de compter, elle ne vaut pas zéro.
   */
  const saisirAvancementHebdo = (
    projetId: string,
    tacheId: string,
    semaine: string,
    valeur: number | null
  ) => {
    updateProject(projetId, (p) => ({
      ...p,
      planning: {
        ...p.planning,
        reel: p.planning.reel.map((t) => {
          if (t.id !== tacheId) return t
          const releves = { ...(t.realiseHebdo ?? {}) }
          if (valeur === null) delete releves[semaine]
          else releves[semaine] = Math.min(100, Math.max(0, Math.round(valeur)))
          return { ...t, realiseHebdo: releves, avancement: dernierReleve(releves) ?? 0 }
        }),
      },
    }))
  }

  return (
    <ProjectsContext.Provider
      value={{
        projects,
        createProject,
        reaffecterProjets,
        supprimerProjet,
        ajouterReferenceProjet,
        retirerReferenceProjet,
        definirClesProjet,
        definirReferencesOT,
        definirPlateformes,
        definirCodesOTP,
        definirPresentationProjet,
        definirRisquesProjet,
        definirOpportunitesProjet,
        commandes,
        creerCommande,
        modifierCommande,
        ajouterAugmentationCommande,
        rattacherCommande,
        addCommande,
        removeCommande,
        addFacture,
        modifierFacture,
        removeFacture,
        updateSuiviPhase,
        ajouterPhaseSuivi,
        renommerPhaseSuivi,
        supprimerPhaseSuivi,
        addModificationScope,
        removeModificationScope,
        addAction,
        toggleAction,
        addDocumentCahierDesCharges,
        removeDocumentCahierDesCharges,
        synchroniserSignalExterne,
        retirerSignalExterne,
        addCommandeMateriel,
        receptionCommandeMateriel,
        saisirHSEMensuel,
        addActionHSE,
        toggleActionHSE,
        addHypothese,
        retenirHypothese,
        addPieceJointeHypothese,
        removePieceJointeHypothese,
        addCommentaireHypothese,
        ajouterCommentaireProjet,
        supprimerCommentaireProjet,
        addTonnageEntry,
        addPeintureEntry,
        addCRJEntry,
        addStandbyEntry,
        addTacheBaseline,
        updateTacheBaseline,
        removeTacheBaseline,
        definirGabaritTache,
        definirGabaritToutesTaches,
        definirSourceBudgetCourbe,
        updateForecastTacheDates,
        updateReelTacheDates,
        updateReelTacheAvancement,
        saisirAvancementHebdo,
      }}
    >
      {children}
    </ProjectsContext.Provider>
  )
}
