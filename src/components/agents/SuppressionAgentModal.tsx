import { useState } from 'react'
import { AlertTriangle, ArrowRight } from 'lucide-react'
import { useAuth } from '../../contexts/useAuth'
import { useProjects } from '../../contexts/useProjects'
import { ROLE_LABELS } from '../../types/user'
import type { DirectoryUser } from '../../types/user'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import { selectClass } from '../ui/classes'

// Suppression d'un compte, avec transfert de ses fiches projet (20/08/2026,
// demande explicite « en cas de suppression on va réaffecter les projets
// gérés vers un autre agent »).
//
// Deux choses se passent ici, dans cet ordre, et l'ordre compte : les fiches
// sont d'abord transférées, le compte n'est retiré qu'ensuite. Si le
// transfert échoue, rien n'est supprimé — l'inverse laisserait des fiches
// rattachées à un identifiant qui ne désigne plus personne, invisibles pour
// tout le monde sauf les admins.
//
// Ce que l'écran dit sans détour : le compte Firebase Auth, lui, survit.
// Aucun client ne peut supprimer le compte d'authentification d'un tiers
// (il faudrait l'Admin SDK, et ce projet n'a pas de backend). L'accès à
// l'application est bien coupé — une session sans fiche d'annuaire est
// refusée — mais l'adresse reste prise : recréer un compte avec le même
// email échouera. Le dire ici évite de le découvrir plus tard.

export function SuppressionAgentModal({
  utilisateur,
  onFerme,
}: {
  utilisateur: DirectoryUser
  onFerme: () => void
}) {
  const { users, supprimerUtilisateur } = useAuth()
  const { projects, reaffecterProjets } = useProjects()

  const fiches = projects.filter((p) => p.agentId === utilisateur.id)
  // Un compte ne peut être repris que par quelqu'un qui aura accès aux
  // fiches : les agents les voient par `agentId`, les admins voient tout.
  const repreneurs = users.filter((u) => u.id !== utilisateur.id && (u.role === 'agent' || u.role === 'admin'))

  const [repreneur, setRepreneur] = useState(repreneurs[0]?.id ?? '')
  const [enCours, setEnCours] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)

  const transfertRequis = fiches.length > 0
  const bloque = transfertRequis && !repreneur

  const supprimer = async () => {
    setErreur(null)
    setEnCours(true)
    try {
      // Transfert d'abord : une suppression qui précéderait le transfert
      // laisserait les fiches orphelines si l'écriture échouait ensuite.
      if (transfertRequis) await reaffecterProjets(utilisateur.id, repreneur)
      await supprimerUtilisateur(utilisateur.id)
      onFerme()
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Échec de la suppression.')
    } finally {
      setEnCours(false)
    }
  }

  const nomRepreneur = users.find((u) => u.id === repreneur)?.name ?? ''

  return (
    <Modal isOpen onClose={onFerme} title={`Supprimer ${utilisateur.name}`} maxWidth="max-w-lg">
      <div className="space-y-4">
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 flex items-start gap-2.5">
          <AlertTriangle className="w-4.5 h-4.5 text-amber-600 shrink-0 mt-0.5" />
          <div className="text-sm text-amber-800 space-y-1">
            <p>
              <span className="font-semibold">{utilisateur.name}</span> ({ROLE_LABELS[utilisateur.role]}) perdra l'accès
              à l'application immédiatement.
            </p>
            <p className="text-amber-700 text-xs">
              Son compte de connexion, lui, n'est pas supprimé — cela demande une intervention dans la console Firebase.
              L'adresse <span className="font-medium">{utilisateur.email}</span> restera donc prise : un nouveau compte
              ne pourra pas être créé avec elle.
            </p>
          </div>
        </div>

        {transfertRequis ? (
          <div className="space-y-2">
            <p className="text-sm text-gray-700">
              <span className="font-semibold">{fiches.length}</span> fiche(s) projet lui sont rattachées. Elles doivent
              être reprises par quelqu'un — sans responsable, elles ne s'afficheraient plus que pour les
              administrateurs.
            </p>
            <label className="block text-sm font-medium text-gray-500">Transférer les fiches à</label>
            <select className={selectClass} value={repreneur} onChange={(e) => setRepreneur(e.target.value)}>
              {repreneurs.length === 0 && <option value="">Aucun autre compte disponible</option>}
              {repreneurs.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name} — {ROLE_LABELS[u.role]}
                </option>
              ))}
            </select>

            <div className="rounded-xl border border-gray-100 bg-gray-50/70 px-4 py-3 max-h-44 overflow-auto">
              <ul className="space-y-1 text-xs text-gray-600">
                {fiches.map((p) => (
                  <li key={p.id} className="flex items-center gap-1.5">
                    <span className="truncate">{p.nom}</span>
                    <ArrowRight className="w-3 h-3 text-gray-300 shrink-0" />
                    <span className="text-gray-400 truncate">{nomRepreneur || '—'}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        ) : (
          <p className="text-sm text-gray-500">Aucune fiche projet ne lui est rattachée : rien à transférer.</p>
        )}

        {erreur && <p className="text-sm text-red-600">{erreur}</p>}

        <div className="flex justify-end gap-3 pt-1">
          <Button type="button" variant="ghost" onClick={onFerme}>
            Annuler
          </Button>
          <Button type="button" variant="danger" loading={enCours} disabled={bloque} onClick={() => void supprimer()}>
            {transfertRequis ? `Transférer ${fiches.length} fiche(s) et supprimer` : 'Supprimer le compte'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
