import { useState } from 'react'
import type { ReactNode } from 'react'
import { AlertTriangle } from 'lucide-react'
import { Modal } from './Modal'
import { Button } from './Button'

/**
 * Confirmation générique de suppression (04/09/2026, demande explicite « on
 * le fera sur toutes les interfaces ») — factorise le patron déjà écrit deux
 * fois à la main (`NavetteLigneSuppressionModal`, `SuppressionContratModal`) :
 * un avertissement qui dit ce qui reste orphelin ou irréversible, un bouton
 * rouge après lecture, pas de confirmation textuelle à retaper.
 *
 * `avertissements` prend une liste de phrases déjà composées par l'appelant
 * (chacun sait ce qui dépend de sa propre donnée — commandes liées, AVC
 * indélébiles, tâches de planning qui bloquent une phase…) plutôt qu'un
 * mécanisme générique de détection des dépendances, qui varie trop d'un
 * module à l'autre pour être unifié utilement.
 */
export function ModaleSuppression({
  titre,
  message,
  avertissements = [],
  libelleBouton = 'Supprimer',
  onFerme,
  onConfirmer,
}: {
  titre: string
  /** Phrase d'introduction, au-dessus des avertissements. */
  message: ReactNode
  /** Une entrée par ligne, dans l'encart rouge (ce qui sera perdu ou détaché). */
  avertissements?: ReactNode[]
  libelleBouton?: string
  onFerme: () => void
  onConfirmer: () => Promise<void>
}) {
  const [enCours, setEnCours] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)

  const confirmer = async () => {
    setErreur(null)
    setEnCours(true)
    try {
      await onConfirmer()
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Échec de la suppression.')
    } finally {
      setEnCours(false)
    }
  }

  return (
    <Modal isOpen onClose={onFerme} title={titre} maxWidth="max-w-lg">
      <div className="space-y-4">
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 flex items-start gap-2.5">
          <AlertTriangle className="w-4.5 h-4.5 text-red-600 shrink-0 mt-0.5" />
          <div className="text-sm text-red-800 space-y-1">
            <p>{message}</p>
            {avertissements.map((a, i) => (
              <p key={i} className="text-red-700 text-xs">
                {a}
              </p>
            ))}
          </div>
        </div>

        <p className="text-sm text-gray-600">Cette action est irréversible. Voulez-vous continuer ?</p>

        {erreur && <p className="text-sm text-red-600">{erreur}</p>}

        <div className="flex justify-end gap-3 pt-1">
          <Button type="button" variant="ghost" onClick={onFerme}>
            Annuler
          </Button>
          <Button type="button" variant="danger" loading={enCours} onClick={() => void confirmer()}>
            {libelleBouton}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
