import { useEffect, useMemo, useRef, useState } from 'react'
import { Eraser, Save, Undo2 } from 'lucide-react'
import { Button } from '../ui/Button'
import { AFFECTATIONS, TYPES_AFFECTATION_SAISIE, estActif, estWeekEnd, joursDuMois, jourSemaine, nomComplet } from '../../lib/contratEpcmEngine'
import { aujourdHui } from '../../lib/saisie'
import { EnteteOnglet, MessageVide, SelecteurMois } from './elements'
import type { EmployeEpcm, PlanningMoisEpcm, TypeAffectation } from '../../types/contratEpcm'

// Onglet « Planning » (§4) : calendrier mensuel employés × jours.
//
// Saisie « au pinceau » : on choisit une affectation dans la palette, puis on
// clique une case ou on glisse sur une plage — ce que le cahier des charges
// appelle « glisser-déposer ou simple sélection ». Peindre une rotation de
// 21 jours est ainsi un seul geste.
//
// Les changements restent en brouillon jusqu'au bouton « Enregistrer » :
// écrire à chaque case traversée produirait des dizaines d'écritures
// Firestore par geste, et autant d'entrées d'historique.

const LETTRES_JOUR = ['D', 'L', 'M', 'M', 'J', 'V', 'S']

type Pinceau = TypeAffectation | 'GOMME'

export function PlanningTab({
  employes,
  mois,
  onChangerMois,
  plannings,
  modifiable,
  onEnregistrer,
}: {
  employes: EmployeEpcm[]
  mois: string
  onChangerMois: (mois: string) => void
  plannings: PlanningMoisEpcm[]
  modifiable: boolean
  onEnregistrer: (changements: { employeId: string; jours: Record<string, TypeAffectation | null> }[]) => Promise<void>
}) {
  const [pinceau, setPinceau] = useState<Pinceau>('SITE')
  const [brouillon, setBrouillon] = useState<Record<string, Record<string, TypeAffectation | null>>>({})
  const [enregistrement, setEnregistrement] = useState(false)
  const peinture = useRef(false)

  const jours = useMemo(() => joursDuMois(mois), [mois])
  const planningsDuMois = useMemo(
    () => new Map(plannings.filter((p) => p.mois === mois).map((p) => [p.employeId, p])),
    [plannings, mois]
  )
  // L'activité se déduit du contrat depuis le rev01 : le champ `statut`
  // n'est plus qu'un forçage (« écarter cette personne »).
  const actifs = useMemo(() => employes.filter((e) => estActif(e, aujourdHui())), [employes])

  // Le brouillon appartient au mois affiché : en changer sans le vider
  // repeindrait des jours d'un autre mois.
  const [moisBrouillon, setMoisBrouillon] = useState(mois)
  if (moisBrouillon !== mois) {
    setMoisBrouillon(mois)
    setBrouillon({})
  }

  // Relâcher la souris n'importe où arrête la peinture — y compris hors du
  // tableau, sinon le pinceau resterait actif après être sorti de la grille.
  useEffect(() => {
    const arreter = () => {
      peinture.current = false
    }
    window.addEventListener('mouseup', arreter)
    return () => window.removeEventListener('mouseup', arreter)
  }, [])

  const affectation = (employeId: string, date: string): TypeAffectation | null => {
    const modifie = brouillon[employeId]?.[date]
    if (modifie !== undefined) return modifie
    return planningsDuMois.get(employeId)?.jours[date] ?? null
  }

  const peindre = (employeId: string, date: string) => {
    if (!modifiable) return
    const valeur = pinceau === 'GOMME' ? null : pinceau
    if (affectation(employeId, date) === valeur) return
    setBrouillon((prev) => ({ ...prev, [employeId]: { ...(prev[employeId] ?? {}), [date]: valeur } }))
  }

  const nbModifications = Object.values(brouillon).reduce((t, jours) => t + Object.keys(jours).length, 0)

  const enregistrer = async () => {
    setEnregistrement(true)
    try {
      await onEnregistrer(Object.entries(brouillon).map(([employeId, jours]) => ({ employeId, jours })))
      setBrouillon({})
    } finally {
      setEnregistrement(false)
    }
  }

  const joursTravailles = (employeId: string) =>
    jours.filter((date) => {
      const a = affectation(employeId, date)
      return a ? AFFECTATIONS[a].travaille : false
    }).length

  return (
    <div className="space-y-4">
      <EnteteOnglet
        titre="Planning mensuel"
        aide={
          modifiable
            ? 'Choisissez une affectation, puis cliquez une case ou glissez sur une plage de jours. Les changements ne partent en base qu’à l’enregistrement.'
            : 'Consultation seule : votre profil EPCM ne permet pas de modifier le planning.'
        }
      >
        <SelecteurMois mois={mois} onChange={onChangerMois} />
      </EnteteOnglet>

      {modifiable && (
        <div className="bg-white rounded-2xl border border-gray-200 p-4 flex flex-wrap items-center gap-2">
          {TYPES_AFFECTATION_SAISIE.map((type) => {
            const info = AFFECTATIONS[type]
            const actif = pinceau === type
            return (
              <button
                key={type}
                onClick={() => setPinceau(type)}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  actif ? `${info.classe} ring-2 ring-offset-1 ring-gray-300` : info.classeDouce
                }`}
              >
                <span className="font-mono mr-1.5">{info.court}</span>
                {info.label}
              </button>
            )
          })}
          <button
            onClick={() => setPinceau('GOMME')}
            className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 transition-all ${
              pinceau === 'GOMME' ? 'bg-gray-800 text-white ring-2 ring-offset-1 ring-gray-300' : 'bg-gray-100 text-gray-600'
            }`}
          >
            <Eraser className="w-3.5 h-3.5" />
            Effacer
          </button>

          <div className="ml-auto flex items-center gap-2">
            {nbModifications > 0 && (
              <>
                <span className="text-xs text-gray-500">
                  {nbModifications} jour{nbModifications > 1 ? 's' : ''} modifié{nbModifications > 1 ? 's' : ''}
                </span>
                <Button variant="ghost" size="sm" onClick={() => setBrouillon({})}>
                  <Undo2 className="w-3.5 h-3.5 mr-1.5" />
                  Annuler
                </Button>
              </>
            )}
            <Button size="sm" onClick={() => void enregistrer()} loading={enregistrement} disabled={nbModifications === 0}>
              <Save className="w-3.5 h-3.5 mr-1.5" />
              Enregistrer
            </Button>
          </div>
        </div>
      )}

      {actifs.length === 0 ? (
        <MessageVide>Aucun employé actif : le planning se construit à partir de l’onglet Personnel.</MessageVide>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-200 overflow-x-auto select-none">
          <table className="text-sm border-separate border-spacing-0">
            <thead>
              <tr>
                <th className="sticky left-0 z-10 bg-white px-3 py-2 text-left text-xs font-medium text-gray-500 border-b border-gray-200 min-w-52">
                  Employé
                </th>
                {jours.map((date) => (
                  <th
                    key={date}
                    className={`px-0 py-1 text-center text-[10px] font-medium border-b border-gray-200 w-8 ${
                      estWeekEnd(date) ? 'bg-gray-50 text-gray-400' : 'text-gray-500'
                    }`}
                  >
                    <span className="block">{LETTRES_JOUR[jourSemaine(date)]}</span>
                    <span className="block text-gray-700">{Number(date.slice(8))}</span>
                  </th>
                ))}
                <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 border-b border-gray-200 whitespace-nowrap">
                  Jours travaillés
                </th>
              </tr>
            </thead>
            <tbody>
              {actifs.map((employe) => (
                <tr key={employe.id}>
                  <td className="sticky left-0 z-10 bg-white px-3 py-1 border-b border-gray-100 whitespace-nowrap">
                    <span className="font-medium text-gray-900">{nomComplet(employe)}</span>
                    {employe.fonction && <span className="block text-[11px] text-gray-400">{employe.fonction}</span>}
                  </td>
                  {jours.map((date) => {
                    const valeur = affectation(employe.id, date)
                    const info = valeur ? AFFECTATIONS[valeur] : null
                    const modifie = brouillon[employe.id]?.[date] !== undefined
                    return (
                      <td key={date} className={`p-0.5 border-b border-gray-100 ${estWeekEnd(date) ? 'bg-gray-50' : ''}`}>
                        <button
                          disabled={!modifiable}
                          onMouseDown={(e) => {
                            // Empêche la sélection de texte pendant le glissé.
                            e.preventDefault()
                            peinture.current = true
                            peindre(employe.id, date)
                          }}
                          onMouseEnter={() => {
                            if (peinture.current) peindre(employe.id, date)
                          }}
                          title={`${nomComplet(employe)} — ${date}${info ? ` · ${info.label}` : ''}`}
                          className={`w-7 h-7 rounded text-[10px] font-bold transition-colors ${
                            info ? info.classe : 'bg-gray-100 text-transparent hover:bg-gray-200'
                          } ${modifie ? 'ring-2 ring-offset-1 ring-gray-900/40' : ''} ${
                            modifiable ? 'cursor-pointer' : 'cursor-default'
                          }`}
                        >
                          {info?.court ?? '·'}
                        </button>
                      </td>
                    )
                  })}
                  <td className="px-3 py-1 text-right font-semibold text-gray-900 border-b border-gray-100">
                    {joursTravailles(employe.id)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
