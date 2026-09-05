import { ROLES_EPCM, peutAdministrer, peutModifier } from '../../lib/contratEpcmEngine'
import { getAvatarColor } from '../../lib/avatarColors'
import { ROLE_LABELS } from '../../types/user'
import { selectFiltreClass } from '../ui/classes'
import { EnteteOnglet } from './elements'
import type { DirectoryUser } from '../../types/user'
import type { ProfilEpcm, RoleEpcm } from '../../types/contratEpcm'

// Onglet « Accès » (§13). Les 6 profils demandés sont propres au module : ils
// s'ajoutent aux 3 rôles applicatifs (admin / agent / contrôleur) au lieu de
// les remplacer — remanier les rôles globaux aurait touché l'authentification
// de toute l'application, ses règles Firestore et l'écran Utilisateurs, pour
// un besoin qui ne concerne que ce module.
//
// Conséquence à connaître : ces profils filtrent l'interface, pas les règles
// Firestore, qui restent au niveau « utilisateur connecté » comme les autres
// modules de saisie. Un utilisateur en « Consultation » ne peut rien modifier
// dans l'app, mais la base ne le lui interdirait pas s'il contournait l'UI.

const DESCRIPTIONS: Record<RoleEpcm, string> = {
  ADMINISTRATEUR: 'Tout, y compris le contrat, le budget et les profils.',
  RESPONSABLE_CONTRAT: 'Personnel, planning, pointage et rotations.',
  CHEF_PROJET: 'Personnel, planning, pointage et rotations.',
  RH: 'Personnel, planning, pointage et rotations.',
  RESPONSABLE_SITE: 'Personnel, planning, pointage et rotations.',
  CONSULTATION: 'Lecture seule sur tous les onglets.',
}

export function AccesTab({
  utilisateurs,
  profils,
  administrable,
  onChangerRole,
}: {
  utilisateurs: DirectoryUser[]
  profils: ProfilEpcm[]
  administrable: boolean
  onChangerRole: (utilisateur: DirectoryUser, role: RoleEpcm | null) => Promise<void>
}) {
  const roleDe = (uid: string) => profils.find((p) => p.id === uid)?.role ?? null

  return (
    <div className="space-y-4">
      <EnteteOnglet
        titre="Profils d'accès au module"
        aide={
          administrable
            ? "Un utilisateur sans profil accède au module en consultation. Les administrateurs de l'application sont administrateurs EPCM d'office."
            : "Seul un administrateur de l'application peut attribuer les profils."
        }
      />

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        {(Object.keys(ROLES_EPCM) as RoleEpcm[]).map((role) => (
          <div key={role} className="bg-white rounded-2xl border border-gray-200 p-4">
            <p className="text-sm font-semibold text-gray-900">{ROLES_EPCM[role]}</p>
            <p className="text-xs text-gray-500 mt-1">{DESCRIPTIONS[role]}</p>
            <div className="flex gap-1.5 mt-2">
              {peutModifier(role) && (
                <span className="px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 text-[10px] font-semibold">Écriture</span>
              )}
              {peutAdministrer(role) && (
                <span className="px-2 py-0.5 rounded-md bg-accent/10 text-accent text-[10px] font-semibold">Administration</span>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 divide-y divide-gray-100">
        {utilisateurs.map((utilisateur) => {
          const couleur = getAvatarColor(utilisateur.avatarColor)
          const role = roleDe(utilisateur.id)
          return (
            <div key={utilisateur.id} className="flex items-center gap-3 px-5 py-3">
              <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${couleur.bgClass}`}>
                <span className={`text-xs font-bold ${couleur.textClass}`}>{utilisateur.initials}</span>
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-gray-900 truncate">{utilisateur.name}</p>
                <p className="text-xs text-gray-500">
                  {ROLE_LABELS[utilisateur.role]}
                  {utilisateur.role === 'admin' && ' · administrateur EPCM d’office'}
                </p>
              </div>
              <select
                className={selectFiltreClass}
                disabled={!administrable || utilisateur.role === 'admin'}
                value={role ?? ''}
                onChange={(e) => void onChangerRole(utilisateur, (e.target.value || null) as RoleEpcm | null)}
              >
                <option value="">Aucun profil (consultation)</option>
                {(Object.keys(ROLES_EPCM) as RoleEpcm[]).map((r) => (
                  <option key={r} value={r}>
                    {ROLES_EPCM[r]}
                  </option>
                ))}
              </select>
            </div>
          )
        })}
      </div>
    </div>
  )
}
