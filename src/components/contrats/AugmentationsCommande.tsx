import { useState } from 'react'
import type { FormEvent } from 'react'
import { Plus } from 'lucide-react'
import { Input } from '../ui/Input'
import { Button } from '../ui/Button'
import { Badge } from '../ui/Badge'
import { ChampMontant } from '../ui/ChampMontant'
import { aujourdHui, montantDepuisTexte, texteDepuisMontant } from '../../lib/saisie'
import { formatDate } from '../../lib/format'
import { useMontant } from '../../lib/montantAffiche'
import { useProjects } from '../../contexts/useProjects'
import { montantActuelCommande } from '../../types/project'
import type { Commande } from '../../types/project'
import { selectClass } from './contratFormConstants'

/**
 * Historique des augmentations d'une commande et saisie d'une nouvelle
 * (`doc/module contrat.docx` §2 « Augmentation d'une commande » et §4 « le
 * même principe que pour les contrats doit être applicable aux commandes »).
 *
 * L'exemple du document : commande 4550001 à 500 000 USD au début du contrat,
 * 600 000 USD à la fin des travaux — « deux solutions existent : émettre une
 * nouvelle commande, ou augmenter la valeur de la commande existante. Le
 * module doit permettre cette deuxième option **en conservant l'historique** ».
 *
 * Comme pour un AVC de contrat, on saisit **le montant ajouté** et le nouveau
 * montant s'affiche en dérivé : `montantInitial` n'est jamais réécrit.
 *
 * Partagé entre la fiche projet (onglet Contrats) et le module Contrats — le
 * geste est le même des deux côtés.
 */
export function AugmentationsCommande({ commande, devise }: { commande: Commande; devise: string }) {
  const { ajouterAugmentationCommande } = useProjects()
  const { montant: formatMontant } = useMontant()
  const [ouvert, setOuvert] = useState(false)
  const [date, setDate] = useState(aujourdHui())
  const [montantAjoute, setMontantAjoute] = useState('')
  const [commentaire, setCommentaire] = useState('')
  const [erreur, setErreur] = useState('')
  const [enCours, setEnCours] = useState(false)

  const augmentations = commande.augmentations ?? []
  // Une commande restée dans le document d'une fiche (avant la migration) n'a
  // pas de `montantInitial` : elle ne peut pas porter d'augmentation tant
  // qu'elle n'a pas rejoint la collection, et l'écran le dit plutôt que de
  // proposer un bouton qui échouerait.
  const migrable = commande.source === 'collection'
  const actuel = montantActuelCommande(commande)
  const ajout = Number(montantAjoute) || 0

  const fermer = () => {
    setOuvert(false)
    setMontantAjoute('')
    setCommentaire('')
    setErreur('')
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setErreur('')
    if (ajout === 0) {
      setErreur("Le montant de l'augmentation ne peut pas être nul.")
      return
    }
    setEnCours(true)
    try {
      await ajouterAugmentationCommande(commande.id, { date, montantAjoute: ajout, commentaire })
      fermer()
    } catch (err) {
      setErreur(err instanceof Error ? err.message : 'Erreur inattendue')
    } finally {
      setEnCours(false)
    }
  }

  if (augmentations.length === 0 && !ouvert) {
    if (!migrable) return null
    return (
      <button
        type="button"
        onClick={() => setOuvert(true)}
        className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
      >
        <Plus className="w-3 h-3" />
        Augmenter le montant
      </button>
    )
  }

  return (
    <div className="mt-2 pl-3 border-l-2 border-amber-100">
      {augmentations.length > 0 && (
        <>
          <p className="text-xs text-gray-400">
            Montant initial {formatMontant(commande.montantInitial ?? commande.montant, devise)} · {augmentations.length}{' '}
            augmentation(s) · actuel {formatMontant(actuel, devise)}
          </p>
          <ul className="space-y-1 mt-1">
            {augmentations.map((a, i) => (
              <li key={a.id} className="flex flex-wrap items-baseline gap-x-2 text-xs">
                <Badge label={`+${i + 1}`} bg="bg-amber-100" text="text-amber-700" />
                <span className="font-medium text-gray-800">+{formatMontant(a.montantAjoute, devise)}</span>
                <span className="text-gray-500">{formatDate(a.date)}</span>
                {a.commentaire && <span className="text-gray-600 basis-full">{a.commentaire}</span>}
                {a.saisiPar && <span className="text-gray-400 basis-full">Enregistré par {a.saisiPar}</span>}
              </li>
            ))}
          </ul>
        </>
      )}

      {!ouvert ? (
        migrable && (
          <button
            type="button"
            onClick={() => setOuvert(true)}
            className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
          >
            <Plus className="w-3 h-3" />
            Augmenter le montant
          </button>
        )
      ) : (
        <form onSubmit={handleSubmit} className="mt-2 flex flex-wrap items-end gap-3">
          <Input
            label="Date de l'augmentation"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            required
            className="w-40"
          />
          <ChampMontant
            label="Montant ajouté"
            devise={devise}
            className="w-48"
            value={montantDepuisTexte(montantAjoute)}
            onChange={(v) => setMontantAjoute(texteDepuisMontant(v))}
          />
          <div className="flex-1 min-w-[12rem]">
            <label className="block text-sm font-medium mb-1.5 text-gray-500">Commentaire</label>
            <input
              value={commentaire}
              onChange={(e) => setCommentaire(e.target.value)}
              placeholder="Motif de l'augmentation…"
              className={selectClass}
            />
          </div>
          <p className="basis-full text-xs text-gray-500">
            Nouveau montant de la commande : <span className="font-medium text-gray-900">{formatMontant(actuel + ajout, devise)}</span>
          </p>
          {erreur && <p className="basis-full text-xs text-red-600">{erreur}</p>}
          <div className="flex gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={fermer}>
              Annuler
            </Button>
            <Button type="submit" size="sm" disabled={enCours}>
              {enCours ? 'Enregistrement…' : "Enregistrer l'augmentation"}
            </Button>
          </div>
        </form>
      )}
    </div>
  )
}
