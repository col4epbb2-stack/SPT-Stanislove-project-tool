import { useState } from 'react'
import type { FormEvent } from 'react'
import { Info } from 'lucide-react'
import { useAuth } from '../../contexts/useAuth'
import { ROLES, PROFILS_NAVETTE, ROLE_LABELS, PROFIL_NAVETTE_LABELS } from '../../types/user'
import type { DirectoryUser, ProfilValidationNavette, UserRole } from '../../types/user'
import { Input } from '../ui/Input'
import { Button } from '../ui/Button'
import { selectClass } from '../ui/classes'

// Formulaire d'un utilisateur — création **et** modification (20/08/2026,
// demande explicite « on va faire un CRUD pour agent »). Un seul composant
// pour les deux : les champs sont les mêmes, et deux formulaires jumeaux
// auraient divergé au premier ajout de champ.
//
// Deux différences, portées par `utilisateur` :
//  - à la création, pas de champ mot de passe : `creerCompteAuth` génère un
//    secret jeté et Firebase envoie un email de définition de mot de passe,
//    seul chemin d'entrée du nouvel utilisateur (cf. lib/firebase.ts) ;
//  - à la modification, **l'email n'est pas modifiable** : il identifie le
//    compte Firebase Auth, que seul l'Admin SDK pourrait renommer. Le
//    changer ici ne changerait que l'affichage, et l'annuaire mentirait sur
//    l'identité réelle. Le champ reste visible, désactivé et expliqué.

export function AgentForm({ utilisateur, onDone }: { utilisateur?: DirectoryUser; onDone: () => void }) {
  const { creerUtilisateur, modifierUtilisateur } = useAuth()
  const edition = utilisateur !== undefined

  const [nom, setNom] = useState(utilisateur?.name ?? '')
  const [email, setEmail] = useState(utilisateur?.email ?? '')
  const [fonction, setFonction] = useState(utilisateur?.fonction ?? '')
  const [role, setRole] = useState<UserRole>(utilisateur?.role ?? 'agent')
  const [profilNavette, setProfilNavette] = useState<ProfilValidationNavette | ''>(utilisateur?.profilNavette ?? '')
  const [envoi, setEnvoi] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)
  const [succes, setSucces] = useState<string | null>(null)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setErreur(null)
    setEnvoi(true)
    try {
      if (edition) {
        await modifierUtilisateur(utilisateur.id, {
          nom,
          fonction,
          role,
          profilNavette: profilNavette || null,
        })
        onDone()
        return
      }
      await creerUtilisateur({ nom, email, role, fonction, profilNavette: profilNavette || undefined })
      setSucces(`Compte créé — email de définition de mot de passe envoyé à ${email}.`)
      setNom('')
      setEmail('')
      setFonction('')
      setRole('agent')
      setProfilNavette('')
    } catch (err) {
      setErreur(err instanceof Error ? err.message : 'Erreur inattendue lors de l’enregistrement du compte.')
    } finally {
      setEnvoi(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <Input label="Nom" value={nom} onChange={(e) => setNom(e.target.value)} required />

      <div>
        <Input
          label="Email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          disabled={edition}
        />
        {edition && (
          <p className="flex items-start gap-1.5 text-xs text-gray-400 mt-1">
            <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            L'adresse identifie le compte de connexion : la modifier demande une intervention hors application.
          </p>
        )}
      </div>

      <Input label="Fonction" value={fonction} onChange={(e) => setFonction(e.target.value)} />

      <div>
        <label className="block text-sm font-medium text-gray-500 mb-1.5">Rôle</label>
        <select className={selectClass} value={role} onChange={(e) => setRole(e.target.value as UserRole)}>
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {ROLE_LABELS[r]}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-500 mb-1.5">Visa des révisions navette</label>
        <select
          className={selectClass}
          value={profilNavette}
          onChange={(e) => setProfilNavette(e.target.value as ProfilValidationNavette | '')}
        >
          <option value="">Aucun</option>
          {PROFILS_NAVETTE.map((p) => (
            <option key={p} value={p}>
              {PROFIL_NAVETTE_LABELS[p]}
            </option>
          ))}
        </select>
        <p className="text-xs text-gray-400 mt-1">
          Une révision proposée est visée par le chef de département, puis par le directeur technique.
        </p>
      </div>

      {erreur && <p className="text-sm text-red-600">{erreur}</p>}
      {succes && <p className="text-sm text-green-600">{succes}</p>}

      <div className="flex justify-end gap-3 pt-2">
        <Button type="button" variant="ghost" onClick={onDone}>
          Fermer
        </Button>
        <Button type="submit" variant="primary" loading={envoi}>
          {edition ? 'Enregistrer' : 'Créer le compte'}
        </Button>
      </div>
    </form>
  )
}
