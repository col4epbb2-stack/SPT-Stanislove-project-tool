import { ModaleSuppression } from '../ui/ModaleSuppression'
import type { ContratListe } from '../../lib/contratsEngine'
import { useContrats } from '../../contexts/useContrats'

// Suppression définitive d'un contrat (04/09/2026, demande explicite). Même
// parti pris que `NavetteLigneSuppressionModal` : un avertissement qui dit ce
// qui reste orphelin plutôt qu'une confirmation textuelle à retaper — les deux
// passent désormais par `ModaleSuppression` (factorisée le même jour).
export function SuppressionContratModal({
  contrat,
  nombreCommandesLiees,
  onFerme,
  onSupprime,
}: {
  contrat: ContratListe
  // Commandes dont `contratId` pointe sur ce contrat, tous projets confondus
  // (déjà calculé par l'appelant via `toutesCommandesContrat`, qui a besoin du
  // cache des projets — pas de second aller-retour Firestore ici).
  nombreCommandesLiees: number
  onFerme: () => void
  onSupprime: () => void
}) {
  const { supprimerContrat } = useContrats()

  return (
    <ModaleSuppression
      titre={`Supprimer « ${contrat.reference} »`}
      message={
        <>
          Le contrat <span className="font-semibold">{contrat.reference}</span> sera supprimé définitivement, avec sa
          valeur cible et ses options de renouvellement.
        </>
      }
      avertissements={[
        contrat.avc.length > 0 && (
          <>
            Son historique de {contrat.avc.length} augmentation{contrat.avc.length > 1 ? 's' : ''} de valeur cible
            (AVC) ne peut pas être effacé — il restera en base, mais ne sera plus rattaché à aucun contrat.
          </>
        ),
        nombreCommandesLiees > 0 && (
          <>
            {nombreCommandesLiees} commande{nombreCommandesLiees > 1 ? 's' : ''} pointe
            {nombreCommandesLiees > 1 ? 'nt' : ''} vers ce contrat : elle{nombreCommandesLiees > 1 ? 's' : ''} ne{' '}
            {nombreCommandesLiees > 1 ? 'seront' : 'sera'} pas supprimée{nombreCommandesLiees > 1 ? 's' : ''}, seulement
            détachée{nombreCommandesLiees > 1 ? 's' : ''}.
          </>
        ),
        contrat.projetIds.length > 0 && (
          <>
            Il est lié à {contrat.projetIds.length} fiche{contrat.projetIds.length > 1 ? 's' : ''} projet : ce lien
            disparaît avec le contrat (les fiches, elles, ne sont pas supprimées).
          </>
        ),
      ].filter(Boolean)}
      libelleBouton="Supprimer le contrat"
      onFerme={onFerme}
      onConfirmer={async () => {
        await supprimerContrat(contrat.id)
        onSupprime()
      }}
    />
  )
}
