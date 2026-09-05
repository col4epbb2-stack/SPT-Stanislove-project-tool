import { collection, deleteDoc, doc, getDocs, writeBatch } from 'firebase/firestore'
import { db } from './firebase'
import { COLLECTIONS } from './firestoreCollections'
import { enLots } from './migrations'

// Suppression d'une fiche projet (04/09/2026, demande explicite). Une fiche
// est référencée par `projetId` dans une dizaine de collections — les
// détacher (remettre `projetId` à `null`) plutôt que les laisser pointer vers
// un document qui n'existe plus, sans pour autant supprimer ces documents
// eux-mêmes : une ligne de journal terrain ou une ligne navette reste une
// donnée réelle, seul son rattachement disparaît.
//
// Les commandes (et leurs factures, qu'elles portent) ne sont volontairement
// **pas** dans cette liste : leur présence bloque la suppression côté écran
// (`SuppressionProjetModal`) plutôt que d'être détachées en silence — c'est
// une donnée financière, pas un simple lien de classement.
interface CollectionReferencante {
  collection: string
  libelle: string
}

const COLLECTIONS_REFERENCANTES: CollectionReferencante[] = [
  { collection: COLLECTIONS.lignesNavette, libelle: 'Lignes navette' },
  { collection: COLLECTIONS.feuilleDeRoute, libelle: 'Lignes de feuille de route' },
  { collection: COLLECTIONS.hebdoCrjJournal, libelle: 'Affaires CRJ' },
  { collection: COLLECTIONS.tonnageEchafJournalSaisie, libelle: 'Lignes Journal tonnage' },
  { collection: COLLECTIONS.peintureJournalSaisie, libelle: 'Lignes Journal peinture' },
  { collection: COLLECTIONS.affairesMetalSaisie, libelle: 'Affaires Travaux METAL' },
  { collection: COLLECTIONS.courbeEnSActivites, libelle: 'Activités courbe en S' },
  { collection: COLLECTIONS.procurementDaSaisie, libelle: 'DA Procurement' },
  { collection: COLLECTIONS.procurementAoSaisie, libelle: 'AO Procurement' },
  { collection: COLLECTIONS.procurementPoSaisie, libelle: 'PO Procurement' },
  { collection: COLLECTIONS.procurementSurveillanceSaisie, libelle: 'Surveillance Procurement' },
  { collection: COLLECTIONS.procurementPrefaSaisie, libelle: 'Préfa Procurement' },
]

export interface ReferenceProjetGroupe {
  collection: string
  libelle: string
  ids: string[]
}

/**
 * Ce que la suppression de cette fiche va détacher — à charger avant de
 * confirmer, pour que l'ampleur de l'opération ne soit jamais une surprise.
 *
 * Chaque collection est lue en entier puis filtrée côté client (comme
 * `RapprochementPage`/`AffectationProcurement` le font déjà) : `projetId`
 * n'est indexé nulle part, et aucune de ces collections n'a d'index composite
 * garanti pour une requête `where`.
 */
export async function trouverReferencesProjet(projetId: string): Promise<ReferenceProjetGroupe[]> {
  const groupes: ReferenceProjetGroupe[] = []
  for (const spec of COLLECTIONS_REFERENCANTES) {
    const snap = await getDocs(collection(db, spec.collection))
    const ids = snap.docs.filter((d) => d.data().projetId === projetId).map((d) => d.id)
    if (ids.length > 0) groupes.push({ collection: spec.collection, libelle: spec.libelle, ids })
  }
  return groupes
}

/**
 * Détache les documents déjà trouvés (`trouverReferencesProjet`) puis
 * supprime la fiche elle-même. `groupes` est calculé une fois par l'écran
 * (au moment d'afficher le résumé) et réutilisé ici tel quel — le
 * recalculer changerait ce qui a été annoncé à l'admin avant sa confirmation.
 */
export async function supprimerProjetEtDetacher(projetId: string, groupes: ReferenceProjetGroupe[]): Promise<void> {
  for (const groupe of groupes) {
    for (const lot of enLots(groupe.ids)) {
      const batch = writeBatch(db)
      for (const id of lot) batch.update(doc(db, groupe.collection, id), { projetId: null })
      await batch.commit()
    }
  }
  await deleteDoc(doc(db, COLLECTIONS.projets, projetId))
}
