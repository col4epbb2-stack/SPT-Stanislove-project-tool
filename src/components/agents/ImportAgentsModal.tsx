import { useRef, useState } from 'react'
import { AlertTriangle, Check, FileSpreadsheet, Upload, X } from 'lucide-react'
import { useAuth } from '../../contexts/useAuth'
import { ROLE_LABELS, PROFIL_NAVETTE_LABELS } from '../../types/user'
import { lireFichierAgents, type LigneImportAgent, type ResultatLectureAgents } from '../../lib/importAgents'
import { telechargerXlsx } from '../../lib/xlsx'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'

// Import d'utilisateurs depuis un classeur (20/08/2026, demande explicite
// « rajouter l'import en xls »).
//
// Parcours en deux temps, et c'est le point de conception : **déposer un
// fichier n'écrit rien**. L'écran montre d'abord ce qu'il a compris — lignes
// retenues, lignes rejetées avec leur motif — et n'attaque les créations que
// sur un second geste. Un import qui écrirait à la lecture laisserait, en cas
// d'erreur au milieu, la moitié d'un fichier en base sans que personne sache
// laquelle.
//
// La création reste ligne à ligne (`creerUtilisateur`) : chacune crée un
// compte Firebase Auth *et* envoie un email de définition de mot de passe.
// Ça n'est pas groupable, et une ligne qui échoue ne doit pas empêcher les
// suivantes — le compte-rendu final dit exactement ce qui est passé.

type Etape = 'depot' | 'apercu' | 'resultat'

interface EchecCreation {
  ligne: LigneImportAgent
  motif: string
}

export function ImportAgentsModal({ onFerme }: { onFerme: () => void }) {
  const { users, creerUtilisateur } = useAuth()
  const champFichier = useRef<HTMLInputElement>(null)

  const [etape, setEtape] = useState<Etape>('depot')
  const [nomFichier, setNomFichier] = useState('')
  const [lecture, setLecture] = useState<ResultatLectureAgents | null>(null)
  const [erreur, setErreur] = useState<string | null>(null)
  const [enCours, setEnCours] = useState(false)
  const [progression, setProgression] = useState(0)
  const [echecs, setEchecs] = useState<EchecCreation[]>([])
  const [crees, setCrees] = useState(0)

  const choisirFichier = async (fichier: File | undefined) => {
    if (!fichier) return
    setErreur(null)
    setNomFichier(fichier.name)
    try {
      const resultat = await lireFichierAgents(
        fichier,
        users.map((u) => u.email)
      )
      setLecture(resultat)
      setEtape('apercu')
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Fichier illisible.')
    }
  }

  const importer = async () => {
    if (!lecture) return
    setEnCours(true)
    setProgression(0)
    const rates: EchecCreation[] = []
    let reussis = 0
    for (const ligne of lecture.valides) {
      try {
        await creerUtilisateur({
          nom: ligne.nom,
          email: ligne.email,
          role: ligne.role,
          fonction: ligne.fonction,
          profilNavette: ligne.profilNavette,
        })
        reussis++
      } catch (e) {
        rates.push({ ligne, motif: e instanceof Error ? e.message : 'Échec de la création du compte.' })
      }
      setProgression((n) => n + 1)
    }
    setCrees(reussis)
    setEchecs(rates)
    setEnCours(false)
    setEtape('resultat')
  }

  // Modèle vierge : le plus court chemin pour que le fichier déposé ait les
  // bonnes colonnes. Il porte une ligne d'exemple, que l'analyse rejettera
  // d'elle-même si on la laisse (adresse déjà prise ou non plausible).
  const telechargerModele = () => {
    telechargerXlsx(
      [
        {
          nom: 'Agents',
          lignes: [
            ['Nom', 'Email', 'Fonction', 'Rôle', 'Visa navette'],
            ['Awa N’Dong', 'awa.ndong@exemple.ga', 'Chargée d’affaires', ROLE_LABELS.agent, PROFIL_NAVETTE_LABELS.chef_departement],
            ['Jean Obame', 'jean.obame@exemple.ga', 'Contrôle de gestion', ROLE_LABELS.controleur, ''],
          ],
        },
      ],
      'modele-import-agents'
    )
  }

  return (
    <Modal isOpen onClose={onFerme} title="Importer des utilisateurs" maxWidth="max-w-2xl">
      <div className="space-y-4">
        {etape === 'depot' && (
          <>
            <div className="text-sm text-gray-600 space-y-2">
              <p>
                Déposez un classeur <span className="font-semibold">.xlsx</span> ou un fichier{' '}
                <span className="font-semibold">.csv</span>. La première ligne doit porter les en-têtes ; seules{' '}
                <span className="font-semibold">Nom</span> et <span className="font-semibold">Email</span> sont
                obligatoires.
              </p>
              <p className="text-xs text-gray-500">
                Colonnes reconnues : Nom, Email, Fonction, Rôle (Administrateur / Agent / Contrôleur de gestion), Visa
                navette (Chef de département / Directeur technique). Le rôle par défaut est « Agent » — un fichier muet
                ne crée pas d'administrateurs. Chaque compte créé reçoit un email de définition de mot de passe.
              </p>
            </div>

            <button
              type="button"
              onClick={() => champFichier.current?.click()}
              className="w-full rounded-2xl border-2 border-dashed border-gray-200 hover:border-primary hover:bg-primary/5 transition px-6 py-10 flex flex-col items-center gap-2 text-gray-500"
            >
              <Upload className="w-7 h-7 text-gray-400" />
              <span className="text-sm font-semibold text-gray-700">Choisir un fichier</span>
              <span className="text-xs">.xlsx ou .csv</span>
            </button>
            <input
              ref={champFichier}
              type="file"
              accept=".xlsx,.xlsm,.csv,.txt"
              className="hidden"
              onChange={(e) => void choisirFichier(e.target.files?.[0])}
            />

            <button type="button" onClick={telechargerModele} className="text-xs font-semibold text-primary hover:underline">
              Télécharger un modèle vierge (.xlsx)
            </button>
          </>
        )}

        {etape === 'apercu' && lecture && (
          <>
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <FileSpreadsheet className="w-4 h-4 text-gray-400" />
              <span className="font-medium text-gray-900">{nomFichier}</span>
              {lecture.colonnes.length > 0 && (
                <span className="text-xs text-gray-400">— colonnes lues : {lecture.colonnes.join(', ')}</span>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
                <p className="text-2xl font-bold text-emerald-700 tabular-nums">{lecture.valides.length}</p>
                <p className="text-xs text-emerald-700">compte(s) à créer</p>
              </div>
              <div
                className={`rounded-xl border px-4 py-3 ${
                  lecture.rejets.length > 0 ? 'border-amber-200 bg-amber-50' : 'border-gray-200 bg-gray-50'
                }`}
              >
                <p
                  className={`text-2xl font-bold tabular-nums ${
                    lecture.rejets.length > 0 ? 'text-amber-700' : 'text-gray-400'
                  }`}
                >
                  {lecture.rejets.length}
                </p>
                <p className={`text-xs ${lecture.rejets.length > 0 ? 'text-amber-700' : 'text-gray-400'}`}>
                  ligne(s) écartée(s)
                </p>
              </div>
            </div>

            {lecture.valides.length > 0 && (
              <div className="rounded-xl border border-gray-200 overflow-hidden">
                <div className="max-h-56 overflow-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500 sticky top-0">
                      <tr>
                        <th className="px-4 py-2 text-left font-semibold">Nom</th>
                        <th className="px-4 py-2 text-left font-semibold">Email</th>
                        <th className="px-4 py-2 text-left font-semibold">Rôle</th>
                        <th className="px-4 py-2 text-left font-semibold">Visa</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {lecture.valides.map((l) => (
                        <tr key={l.ligne}>
                          <td className="px-4 py-2 text-gray-900">{l.nom}</td>
                          <td className="px-4 py-2 text-gray-500">{l.email}</td>
                          <td className="px-4 py-2 text-gray-600">{ROLE_LABELS[l.role]}</td>
                          <td className="px-4 py-2 text-gray-400">
                            {l.profilNavette ? PROFIL_NAVETTE_LABELS[l.profilNavette] : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {lecture.rejets.length > 0 && (
              <div className="rounded-xl border border-amber-200 bg-amber-50/60 px-4 py-3 max-h-40 overflow-auto">
                <p className="text-xs font-semibold text-amber-800 mb-1.5">
                  Ces lignes ne seront pas importées — le fichier n'est pas modifié, corrigez-le et recommencez :
                </p>
                <ul className="space-y-1 text-xs text-amber-800">
                  {lecture.rejets.map((r, i) => (
                    <li key={`${r.ligne}-${i}`}>
                      <span className="font-semibold">Ligne {r.ligne}</span>
                      {r.apercu && <span className="text-amber-700"> ({r.apercu})</span>} — {r.motif}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {enCours && (
              <p className="text-sm text-gray-500 tabular-nums">
                Création en cours… {progression} / {lecture.valides.length}
              </p>
            )}

            <div className="flex justify-end gap-3">
              <Button type="button" variant="ghost" onClick={() => setEtape('depot')} disabled={enCours}>
                Changer de fichier
              </Button>
              <Button
                type="button"
                variant="primary"
                loading={enCours}
                disabled={lecture.valides.length === 0}
                onClick={() => void importer()}
              >
                Créer {lecture.valides.length} compte(s)
              </Button>
            </div>
          </>
        )}

        {etape === 'resultat' && (
          <>
            <div className="flex items-start gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
              <Check className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
              <div className="text-sm text-emerald-800">
                <p className="font-semibold">{crees} compte(s) créé(s).</p>
                <p className="text-xs text-emerald-700">
                  Chacun a reçu un email de définition de mot de passe — c'est son seul moyen de se connecter.
                </p>
              </div>
            </div>

            {echecs.length > 0 && (
              <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 max-h-48 overflow-auto">
                <p className="flex items-center gap-1.5 text-xs font-semibold text-red-700 mb-1.5">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  {echecs.length} ligne(s) n'ont pas pu être créées :
                </p>
                <ul className="space-y-1 text-xs text-red-700">
                  {echecs.map((e, i) => (
                    <li key={i}>
                      <span className="font-semibold">Ligne {e.ligne.ligne}</span> ({e.ligne.email}) — {e.motif}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="flex justify-end">
              <Button type="button" variant="primary" onClick={onFerme}>
                Terminer
              </Button>
            </div>
          </>
        )}

        {erreur && (
          <p className="flex items-start gap-2 text-sm text-red-600">
            <X className="w-4 h-4 shrink-0 mt-0.5" />
            {erreur}
          </p>
        )}
      </div>
    </Modal>
  )
}
