import { useEffect, useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import { useProjects } from '../../contexts/useProjects'
import type { Projet } from '../../types/project'
import { trouverReferencesProjet } from '../../lib/projectsSuppression'
import type { ReferenceProjetGroupe } from '../../lib/projectsSuppression'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'

// Suppression d'une fiche projet (04/09/2026, demande explicite, admin
// uniquement). Même structure que `SuppressionAgentModal` : bandeau
// d'avertissement, résumé de ce que l'action va toucher, bouton destructeur
// désactivé tant qu'une condition bloquante n'est pas levée.
//
// Ici la condition bloquante n'est pas un choix à faire (un repreneur) mais
// une donnée financière déjà là : des commandes rattachées. Les autres
// références (navette, feuille de route, journaux terrain, courbe en S,
// Procurement) ne bloquent rien — elles sont détachées (`projetId` remis à
// `null`), jamais supprimées.
export function SuppressionProjetModal({ projet, onFerme }: { projet: Projet; onFerme: () => void }) {
  const { supprimerProjet } = useProjects()
  const bloque = projet.commandes.length > 0

  const [groupes, setGroupes] = useState<ReferenceProjetGroupe[] | null>(null)
  // Bloquée d'emblée (commandes rattachées) : rien à charger, pas de passage
  // par « en cours de chargement ».
  const [chargement, setChargement] = useState(!bloque)
  const [enCours, setEnCours] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)

  useEffect(() => {
    if (bloque) return
    let annule = false
    // `chargement` vaut déjà `true` à l'ouverture (état initial) : rien à
    // reposer ici, cet effet ne joue qu'une fois par ouverture de la modale.
    trouverReferencesProjet(projet.id)
      .then((r) => {
        if (!annule) setGroupes(r)
      })
      .catch((e) => {
        if (!annule) setErreur(e instanceof Error ? e.message : 'Impossible de vérifier les données liées.')
      })
      .finally(() => {
        if (!annule) setChargement(false)
      })
    return () => {
      annule = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const totalDetache = groupes?.reduce((s, g) => s + g.ids.length, 0) ?? 0

  const supprimer = async () => {
    if (!groupes) return
    setErreur(null)
    setEnCours(true)
    try {
      await supprimerProjet(projet.id, groupes)
      onFerme()
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "La suppression n'a pas pu être enregistrée.")
    } finally {
      setEnCours(false)
    }
  }

  return (
    <Modal isOpen onClose={onFerme} title={`Supprimer — ${projet.nom}`} maxWidth="max-w-lg">
      <div className="space-y-4">
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 flex items-start gap-2.5">
          <AlertTriangle className="w-4.5 h-4.5 text-red-600 shrink-0 mt-0.5" />
          <p className="text-sm text-red-800">
            La fiche <span className="font-semibold">{projet.nom}</span> sera définitivement supprimée. Cette action
            est irréversible.
          </p>
        </div>

        {bloque ? (
          <p className="text-sm text-gray-700">
            <span className="font-semibold">{projet.commandes.length}</span> commande(s) sont rattachées à cette
            fiche : la suppression est bloquée tant qu'elles n'ont pas été détachées ou supprimées depuis l'onglet
            Contrats de la fiche.
          </p>
        ) : chargement ? (
          <p className="text-sm text-gray-400">Vérification des données liées…</p>
        ) : totalDetache > 0 ? (
          <div className="space-y-2">
            <p className="text-sm text-gray-700">
              <span className="font-semibold">{totalDetache}</span> document(s) référencent cette fiche et seront
              détachés — leur lien vers le projet sera retiré, sans qu'ils soient eux-mêmes supprimés :
            </p>
            <div className="rounded-xl border border-gray-100 bg-gray-50/70 px-4 py-3 max-h-44 overflow-auto">
              <ul className="space-y-1 text-xs text-gray-600">
                {groupes!.map((g) => (
                  <li key={g.collection} className="flex items-center justify-between gap-2">
                    <span>{g.libelle}</span>
                    <span className="text-gray-400 tabular-nums">{g.ids.length}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        ) : (
          <p className="text-sm text-gray-500">Aucune autre donnée ne référence cette fiche.</p>
        )}

        {erreur && <p className="text-sm text-red-600">{erreur}</p>}

        <div className="flex justify-end gap-3 pt-1">
          <Button type="button" variant="ghost" onClick={onFerme}>
            Annuler
          </Button>
          <Button
            type="button"
            variant="danger"
            loading={enCours}
            disabled={bloque || chargement}
            onClick={() => void supprimer()}
          >
            Supprimer définitivement
          </Button>
        </div>
      </div>
    </Modal>
  )
}
