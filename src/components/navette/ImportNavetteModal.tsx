import { useRef, useState } from 'react'
import { AlertTriangle, Check, FileSpreadsheet, Upload, X } from 'lucide-react'
import { useAuth } from '../../contexts/useAuth'
import { useNavette } from '../../contexts/useNavette'
import { useDevises } from '../../contexts/useDevises'
import { TYPE_LABELS } from '../../types/project'
import { lireFichierNavette, type LigneImportNavette, type ResultatLectureNavette } from '../../lib/importNavette'
import { telechargerXlsx } from '../../lib/xlsx'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'

// Import de lignes navette depuis un classeur (04/09/2026, demande explicite
// « on fera l'import en masse via un fichier excel, on fera une preview
// avant, generer un model avec des bonnes colonnes ») — même parcours que
// l'import des utilisateurs (20/08/2026, ImportAgentsModal) : **déposer un
// fichier n'écrit rien**. L'écran montre d'abord ce qu'il a compris — lignes
// retenues, lignes rejetées avec leur motif — et n'attaque les créations que
// sur un second geste.
//
// La création reste ligne à ligne (`createLigne`) : chacune vérifie
// l'unicité du code OTP (identifiant du document Firestore) au moment de
// l'écriture, une ligne qui échoue ne doit pas empêcher les suivantes.

type Etape = 'depot' | 'apercu' | 'resultat'

interface EchecCreation {
  ligne: LigneImportNavette
  motif: string
}

export function ImportNavetteModal({ onFerme }: { onFerme: () => void }) {
  const { users } = useAuth()
  const { lignes, createLigne } = useNavette()
  const { devises, pivot } = useDevises()
  const champFichier = useRef<HTMLInputElement>(null)

  const [etape, setEtape] = useState<Etape>('depot')
  const [nomFichier, setNomFichier] = useState('')
  const [lecture, setLecture] = useState<ResultatLectureNavette | null>(null)
  const [erreur, setErreur] = useState<string | null>(null)
  const [enCours, setEnCours] = useState(false)
  const [progression, setProgression] = useState(0)
  const [echecs, setEchecs] = useState<EchecCreation[]>([])
  const [creees, setCreees] = useState(0)

  const agents = users.filter((u) => u.role === 'agent')

  const choisirFichier = async (fichier: File | undefined) => {
    if (!fichier) return
    setErreur(null)
    setNomFichier(fichier.name)
    try {
      const resultat = await lireFichierNavette(
        fichier,
        lignes.map((l) => l.codeOTP),
        agents,
        devises.filter((d) => d.actif),
        pivot.code
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
    let reussies = 0
    for (const ligne of lecture.valides) {
      try {
        await createLigne({
          rubriqueNiv1: ligne.rubriqueNiv1,
          rubriqueNiv2: ligne.rubriqueNiv2,
          anneeBudget: ligne.anneeBudget,
          codeOTP: ligne.codeOTP,
          champ: ligne.champ,
          libelle: ligne.libelle,
          chargeAffaireId: ligne.chargeAffaireId,
          type: ligne.type,
          devise: ligne.devise,
          workProgram: ligne.workProgram,
          BU: ligne.BU,
        })
        reussies++
      } catch (e) {
        rates.push({ ligne, motif: e instanceof Error ? e.message : 'Échec de la création de la ligne.' })
      }
      setProgression((n) => n + 1)
    }
    setCreees(reussies)
    setEchecs(rates)
    setEnCours(false)
    setEtape('resultat')
  }

  // Modèle vierge : le plus court chemin pour que le fichier déposé ait les
  // bonnes colonnes. Il porte une ligne d'exemple, que l'analyse rejettera
  // d'elle-même si on la laisse (code OTP déjà pris).
  const telechargerModele = () => {
    telechargerXlsx(
      [
        {
          nom: 'Navette',
          lignes: [
            [
              'Libellé',
              'Code OTP',
              'Type',
              'Rubrique',
              'Année budget',
              'Champ',
              'Devise',
              "Chargé d'affaires",
              'Work Program',
              'CONSO',
              'SERV',
              'LOG',
              'PERS',
              'AUTRES',
            ],
            [
              'Remplacement tronçon de ligne riser 6"',
              'GA-EXEMPLE-000001',
              TYPE_LABELS.avis,
              'OPEX',
              new Date().getFullYear(),
              'AGM',
              pivot.code,
              agents[0]?.name ?? 'Nom du chargé d’affaires',
              'Non',
              100,
              50,
              20,
              30,
              0,
            ],
          ],
        },
      ],
      'modele-import-navette'
    )
  }

  return (
    <Modal isOpen onClose={onFerme} title="Importer des lignes navette" maxWidth="max-w-3xl">
      <div className="space-y-4">
        {etape === 'depot' && (
          <>
            <div className="text-sm text-gray-600 space-y-2">
              <p>
                Déposez un classeur <span className="font-semibold">.xlsx</span> ou un fichier{' '}
                <span className="font-semibold">.csv</span>. La première ligne doit porter les en-têtes ; seuls{' '}
                <span className="font-semibold">Libellé</span> et <span className="font-semibold">Code OTP</span> sont
                obligatoires.
              </p>
              <p className="text-xs text-gray-500">
                Colonnes reconnues : Libellé, Code OTP, Type, Rubrique (OPEX/CAPEX), Année budget, Champ, Devise,
                Chargé d'affaires (nom ou email d'un agent), Work Program (Oui/Non), CONSO, SERV, LOG, PERS, AUTRES —
                au moins un des 5 derniers postes doit être renseigné, c'est le budget initial de la ligne. Une ligne
                sans budget ou dont le code OTP est déjà utilisé est rejetée.
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
                <p className="text-xs text-emerald-700">ligne(s) à créer</p>
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
                        <th className="px-4 py-2 text-left font-semibold">Libellé</th>
                        <th className="px-4 py-2 text-left font-semibold">Code OTP</th>
                        <th className="px-4 py-2 text-left font-semibold">Type</th>
                        <th className="px-4 py-2 text-left font-semibold">Chargé d'affaires</th>
                        <th className="px-4 py-2 text-right font-semibold">Budget</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {lecture.valides.map((l) => {
                        const budgetTotal = l.BU.conso + l.BU.serv + l.BU.log + l.BU.pers + l.BU.autres
                        return (
                          <tr key={l.ligne}>
                            <td className="px-4 py-2 text-gray-900">{l.libelle}</td>
                            <td className="px-4 py-2 text-gray-500">{l.codeOTP}</td>
                            <td className="px-4 py-2 text-gray-600">{TYPE_LABELS[l.type]}</td>
                            <td className="px-4 py-2 text-gray-600">{l.chargeAffaireNom}</td>
                            <td className="px-4 py-2 text-right text-gray-900 tabular-nums">
                              {budgetTotal.toLocaleString('fr-FR')} {l.devise}
                            </td>
                          </tr>
                        )
                      })}
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
                Créer {lecture.valides.length} ligne(s)
              </Button>
            </div>
          </>
        )}

        {etape === 'resultat' && (
          <>
            <div className="flex items-start gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
              <Check className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
              <div className="text-sm text-emerald-800">
                <p className="font-semibold">{creees} ligne(s) créée(s).</p>
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
                      <span className="font-semibold">Ligne {e.ligne.ligne}</span> ({e.ligne.codeOTP}) — {e.motif}
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
