import { useState } from 'react'
import type { FormEvent } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { Input } from '../ui/Input'
import { Button } from '../ui/Button'
import { ChampMontant } from '../ui/ChampMontant'
import { montantDepuisTexte, texteDepuisMontant } from '../../lib/saisie'
import { useMontant } from '../../lib/montantAffiche'
import { useProjects } from '../../contexts/useProjects'
import { totalFactureCommande } from '../../types/project'
import { AugmentationsCommande } from '../contrats/AugmentationsCommande'
import { FactureLigne } from '../contrats/FactureLigne'
import { NouvelleFactureForm } from '../contrats/NouvelleFactureForm'
import type { Commande, Projet } from '../../types/project'

// Commandes (PO) d'un projet, rattachées à leur contrat (20/08/2026, demande
// explicite « le suivi des commandes se fera dans la partie contrats, plus
// dans le budget »).
//
// Ces blocs vivaient dans l'onglet Budget de la fiche, en une seule liste
// mélangeant toutes les commandes, avec un menu « Contrat » à choisir à
// chaque ajout. Rattachés à la carte du contrat, ils n'ont plus besoin de ce
// menu — la carte sait de quel contrat elle parle — et la question qu'on se
// pose vraiment (« ce contrat, qu'a-t-il engagé et facturé ? ») se lit à
// l'endroit où elle se pose.
//
// Le rattachement lui-même ne change pas : `Commande.contratId` existait
// déjà, et c'est lui qui alimente la consommation dérivée du contrat.

function LigneCommande({ projet, commande }: { projet: Projet; commande: Commande }) {
  const { montant: formatMontant } = useMontant()
  const { removeCommande } = useProjects()
  const [showForm, setShowForm] = useState(false)

  const supprimerCommande = () => {
    if (window.confirm(`Supprimer la commande « ${commande.numero} » et ses factures ?`)) {
      removeCommande(projet.id, commande.id)
    }
  }

  const facture = totalFactureCommande(commande)

  return (
    <div className="px-4 py-2.5 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-col min-w-0">
          <span className="font-mono text-gray-600">{commande.numero}</span>
          {(commande.fournisseur || commande.libelle || commande.objet) && (
            <span className="text-xs text-gray-400 truncate">
              {[commande.fournisseur, commande.libelle, commande.objet].filter(Boolean).join(' · ')}
            </span>
          )}
          {/* Commentaire de suivi (doc/module contrat.docx §5) : relances,
              anomalies, points bloquants. */}
          {commande.commentaire && <span className="text-xs text-gray-600">{commande.commentaire}</span>}
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <span className="text-xs text-gray-500 whitespace-nowrap">
            Facturé : {formatMontant(facture, projet.devise)}
          </span>
          <span className="font-semibold text-gray-900 whitespace-nowrap">
            {formatMontant(commande.montant, projet.devise)}
          </span>
          <button
            onClick={() => setShowForm((v) => !v)}
            className="text-xs font-semibold text-primary hover:underline whitespace-nowrap"
          >
            + Facture
          </button>
          <button
            onClick={supprimerCommande}
            title="Supprimer la commande"
            className="text-gray-400 hover:text-red-600 shrink-0"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Augmentations de la commande (doc §2 et §4) — l'historique et le
          bouton d'augmentation. */}
      <AugmentationsCommande commande={commande} devise={projet.devise} />

      {(commande.factures ?? []).length > 0 && (
        <div className="mt-2 pl-3 border-l-2 border-gray-100">
          {(commande.factures ?? []).map((f) => (
            <FactureLigne key={f.id} facture={f} commande={commande} projetId={projet.id} devise={projet.devise} />
          ))}
        </div>
      )}

      {showForm && (
        <NouvelleFactureForm
          projetId={projet.id}
          commande={commande}
          devise={projet.devise}
          onDone={() => setShowForm(false)}
        />
      )}
    </div>
  )
}

/** Les commandes de ce projet rattachées à ce contrat, + l'ajout d'une commande. */
export function CommandesContrat({ projet, contratId }: { projet: Projet; contratId: string }) {
  const { montant: formatMontant } = useMontant()
  const { creerCommande } = useProjects()
  const [showForm, setShowForm] = useState(false)
  const [numero, setNumero] = useState('')
  const [montant, setMontant] = useState('')
  const [fournisseur, setFournisseur] = useState('')
  const [libelle, setLibelle] = useState('')
  const [commentaire, setCommentaire] = useState('')

  // Commandes **de ce projet** sur ce contrat : la carte parle d'un contrat
  // depuis une fiche projet. Le contrat peut en porter d'autres, venues
  // d'autres projets — elles se lisent dans le module Contrats, pas ici.
  const commandes = projet.commandes.filter((c) => c.contratId === contratId)
  const engage = commandes.reduce((s, c) => s + c.montant, 0)
  const facture = commandes.reduce((s, c) => s + totalFactureCommande(c), 0)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    // Le montant saisi est le **montant initial** : le montant actuel se
    // déduit ensuite des augmentations (doc/module contrat.docx §2).
    await creerCommande({
      numero,
      montantInitial: Number(montant) || 0,
      contratId,
      projetId: projet.id,
      fournisseur: fournisseur || undefined,
      libelle: libelle || undefined,
      commentaire: commentaire || undefined,
    })
    setNumero('')
    setMontant('')
    setFournisseur('')
    setLibelle('')
    setCommentaire('')
    setShowForm(false)
  }

  return (
    <div className="border-t border-gray-100 pt-3">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
        <div className="min-w-0">
          <p className="text-xs font-medium text-gray-500">Commandes (PO) de ce projet sur ce contrat</p>
          {commandes.length > 0 && (
            <p className="text-xs text-gray-400 mt-0.5">
              {commandes.length} commande(s) · engagé {formatMontant(engage, projet.devise)} · facturé{' '}
              {formatMontant(facture, projet.devise)}
            </p>
          )}
        </div>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline shrink-0"
        >
          <Plus className="w-3.5 h-3.5" />
          Ajouter une commande
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-3 mb-3">
          {/* Pas de menu « Contrat » : la carte sait déjà lequel. C'était le
              champ le plus facile à se tromper dans l'ancien formulaire. */}
          <Input
            label="N° commande"
            value={numero}
            onChange={(e) => setNumero(e.target.value)}
            placeholder="4550012345"
            required
            className="w-40"
          />
          <ChampMontant
            label="Montant initial"
            devise={projet.devise}
            min={0}
            required
            className="w-48"
            value={montantDepuisTexte(montant)}
            onChange={(v) => setMontant(texteDepuisMontant(v))}
          />
          <Input
            label="Fournisseur"
            value={fournisseur}
            onChange={(e) => setFournisseur(e.target.value)}
            placeholder="TFE"
            className="w-40"
          />
          <Input
            label="Libellé"
            value={libelle}
            onChange={(e) => setLibelle(e.target.value)}
            placeholder="Objet de la commande"
            className="w-56"
          />
          {/* Commentaire de suivi (doc §5) : relances, anomalies. */}
          <Input
            label="Commentaire"
            value={commentaire}
            onChange={(e) => setCommentaire(e.target.value)}
            placeholder="Relance, anomalie…"
            className="w-56"
          />
          <Button type="submit" size="sm">
            Ajouter
          </Button>
        </form>
      )}

      {commandes.length === 0 ? (
        <p className="text-xs text-gray-400">Aucune commande sur ce contrat.</p>
      ) : (
        <div className="divide-y divide-gray-100 border border-gray-100 rounded-xl overflow-hidden">
          {commandes.map((c) => (
            <LigneCommande key={c.id} projet={projet} commande={c} />
          ))}
        </div>
      )}
    </div>
  )
}

/**
 * Commandes du projet dont le contrat n'est **pas** (ou plus) lié à la fiche.
 *
 * Sans ce bloc, déplacer le suivi des commandes dans les cartes de contrat
 * ferait disparaître de l'écran des commandes bien réelles : celles saisies
 * avant qu'un contrat ne soit délié, ou dont le contrat a été supprimé du
 * référentiel. Elles restent visibles et supprimables, à part et signalées.
 */
export function CommandesHorsContratsLies({
  projet,
  contratIdsLies,
}: {
  projet: Projet
  contratIdsLies: string[]
}) {
  // `contratId` est facultatif sur le type : une commande sans contrat est
  // orpheline au même titre qu'une commande dont le contrat a été délié.
  const orphelines = projet.commandes.filter((c) => !c.contratId || !contratIdsLies.includes(c.contratId))
  if (orphelines.length === 0) return null

  return (
    <div className="border border-amber-200 bg-amber-50/50 rounded-xl p-4">
      <p className="text-sm font-semibold text-amber-800">Commandes sans contrat lié ({orphelines.length})</p>
      <p className="text-xs text-amber-700 mt-0.5 mb-3">
        Leur contrat n'est plus rattaché à cette fiche (ou n'existe plus dans le référentiel). Reliez le contrat
        concerné pour les retrouver dans sa carte.
      </p>
      <div className="divide-y divide-amber-100 border border-amber-100 rounded-xl overflow-hidden bg-white">
        {orphelines.map((c) => (
          <LigneCommande key={c.id} projet={projet} commande={c} />
        ))}
      </div>
    </div>
  )
}
