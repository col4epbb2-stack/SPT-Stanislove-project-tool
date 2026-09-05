import { ModaleSuppression } from '../ui/ModaleSuppression'
import type { LigneNavette } from '../../types/navette'
import { useNavette } from '../../contexts/useNavette'

// Suppression définitive d'une ligne navette (04/09/2026, demande explicite).
// Contrairement à la clôture (bouton "Clôturer la ligne", réversible), ce
// geste retire le document — pas de confirmation textuelle à retaper comme
// dans le reste de l'application, un bouton distinctement rouge après
// lecture de l'avertissement suffit (cf. `ModaleSuppression`, factorisée le
// même jour à son second usage).
export function NavetteLigneSuppressionModal({
  ligne,
  onFerme,
  onSupprime,
}: {
  ligne: LigneNavette
  onFerme: () => void
  onSupprime: () => void
}) {
  const { arbitrages, supprimerLigne } = useNavette()
  const nbRevisions = arbitrages.filter((a) => a.ligneId === ligne.id).length

  return (
    <ModaleSuppression
      titre={`Supprimer « ${ligne.libelle} »`}
      message={
        <>
          La ligne <span className="font-semibold">{ligne.codeOTP}</span> sera supprimée définitivement, avec ses 8
          cycles budgétaires.
        </>
      }
      avertissements={[
        nbRevisions > 0 && (
          <>
            Son historique de {nbRevisions} révision{nbRevisions > 1 ? 's' : ''} n'est pas effacé, mais ne sera plus
            rattaché à aucune ligne.
          </>
        ),
        ligne.projetId && "Elle est liée à une fiche projet : ce lien sera rompu (la fiche, elle, n'est pas supprimée).",
      ].filter(Boolean)}
      libelleBouton="Supprimer la ligne"
      onFerme={onFerme}
      onConfirmer={async () => {
        await supprimerLigne(ligne.id)
        onSupprime()
      }}
    />
  )
}
