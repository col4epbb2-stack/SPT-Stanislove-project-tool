import { useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { CalendarCheck, Upload } from 'lucide-react'
import { Button } from '../ui/Button'
import { Input } from '../ui/Input'
import { Modal } from '../ui/Modal'
import { AFFECTATIONS, estActif, estWeekEnd, joursDuMois, joursPointes, nomComplet, type PropositionPointage } from '../../lib/contratEpcmEngine'
import { aujourdHui } from '../../lib/saisie'
import { PreremplissageModal } from './PreremplissageModal'
import { analyserCsvPointage, MODELE_CSV_POINTAGE, type ResultatImportPointage } from '../../lib/contratEpcmImport'
import { formatNombre } from '../../lib/format'
import { EnteteOnglet, MessageVide, SelecteurMois } from './elements'
import { HEURES_PAR_JOUR_POINTE } from '../../types/contratEpcm'
import type { EmployeEpcm, PlanningMoisEpcm, PointageJourEpcm, PointageMoisEpcm } from '../../types/contratEpcm'
import type { LotPointageImport } from '../../lib/contratEpcmImport'

// Onglet « Pointage » (§5) : ce qui s'est réellement passé, jour par jour. Le
// planning dit le prévu, le pointage le réalisé ; c'est lui qui l'emporte dans
// le calcul des jours travaillés (cf. `jourTravaille` dans le moteur).
//
// **Depuis le rev01 (27/08/2026), on pointe des JOURS, plus des heures** :
// « lorsqu'une personne est présente, elle doit simplement renseigner le
// chiffre 1 […] les heures travaillées ne doivent donc pas être saisies
// manuellement ». Une journée vaut 12 h, et les heures supplémentaires se
// convertissent en jours facturés — c'est en jours que le contrat facture.

const POINTAGE_VIDE: PointageJourEpcm = {
  jours: null,
  heuresTravaillees: null,
  heuresSupplementaires: null,
  retardMinutes: null,
  absent: false,
  commentaire: null,
}

function CelluleJour({ pointe }: { pointe: PointageJourEpcm | undefined }) {
  if (!pointe) return <span className="text-gray-300">·</span>
  if (pointe.absent) return <span className="text-red-600 font-bold">A</span>
  // Un jour **pré-rempli** est une déduction du planning, pas une
  // déclaration : il est marqué d'un point médian discret tant qu'il n'a pas
  // été repris à la main (§4). Il compte comme travaillé dans tous les cas.
  if (pointe.jours == null && pointe.heuresTravaillees == null) {
    return pointe.prerempli ? (
      <span className="text-primary/60" title="Pré-rempli depuis le planning — non confirmé">
        ·
      </span>
    ) : (
      <span className="text-gray-400">?</span>
    )
  }
  // La cellule porte le **nombre de jours facturés** : 1, ou 1,5 quand des
  // heures supplémentaires portent la journée à 18 h. L'exposant rappelle les
  // heures supplémentaires qui l'expliquent.
  const total = joursPointes(pointe)
  return (
    <span
      className={pointe.prerempli ? 'text-primary/70' : 'text-gray-900 font-medium'}
      title={`${formatNombre(total, 2)} jour(s) — ${formatNombre(total * HEURES_PAR_JOUR_POINTE, 1)} h${
        pointe.prerempli ? ' · pré-rempli depuis le planning, non confirmé' : ''
      }`}
    >
      {formatNombre(total, total % 1 === 0 ? 0 : 2)}
      {pointe.heuresSupplementaires ? <sup className="text-accent">+{formatNombre(pointe.heuresSupplementaires, 1)}h</sup> : null}
    </span>
  )
}

function PointageJourForm({
  employe,
  date,
  valeurInitiale,
  onClose,
  onSubmit,
}: {
  employe: EmployeEpcm
  date: string
  valeurInitiale: PointageJourEpcm
  onClose: () => void
  onSubmit: (valeurs: PointageJourEpcm) => Promise<void>
}) {
  const [valeurs, setValeurs] = useState<PointageJourEpcm>(valeurInitiale)
  const [envoi, setEnvoi] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)

  const modifier = <K extends keyof PointageJourEpcm>(cle: K, valeur: PointageJourEpcm[K]) =>
    setValeurs((prev) => ({ ...prev, [cle]: valeur }))

  const nombre = (v: string) => (v === '' ? null : Number(v))
  const heuresSupPosees = !valeurs.absent && (valeurs.heuresSupplementaires ?? 0) > 0

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setEnvoi(true)
    setErreur(null)
    try {
      // La saisie à la main **confirme** le jour : le marqueur de
      // pré-remplissage tombe (§4, « l'utilisateur ne corrige que les
      // exceptions » — une exception corrigée n'est plus une déduction).
      await onSubmit({ ...valeurs, prerempli: false })
      onClose()
    } catch (err) {
      setErreur(err instanceof Error ? err.message : "Échec de l'enregistrement.")
      setEnvoi(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <p className="text-sm text-gray-500">
        {nomComplet(employe)} — {date}
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Input
          label="Jours travaillés"
          type="number"
          step="0.5"
          min="0"
          value={valeurs.jours == null ? '' : String(valeurs.jours)}
          onChange={(e) => modifier('jours', nombre(e.target.value))}
          disabled={valeurs.absent}
        />
        <Input
          label="Heures supplémentaires"
          type="number"
          step="0.25"
          min="0"
          value={valeurs.heuresSupplementaires == null ? '' : String(valeurs.heuresSupplementaires)}
          onChange={(e) => modifier('heuresSupplementaires', nombre(e.target.value))}
          disabled={valeurs.absent}
        />
        <Input
          label="Retard (minutes)"
          type="number"
          min="0"
          value={valeurs.retardMinutes == null ? '' : String(valeurs.retardMinutes)}
          onChange={(e) => modifier('retardMinutes', nombre(e.target.value))}
          disabled={valeurs.absent}
        />
        <div className="flex items-end">
          <label className="flex items-center gap-2 text-sm text-gray-700 pb-3">
            <input
              type="checkbox"
              checked={valeurs.absent}
              onChange={(e) =>
                // Une journée d'absence ne porte ni heures ni retard : les
                // laisser en place produirait un jour à la fois absent et
                // travaillé.
                setValeurs((prev) => ({
                  ...prev,
                  absent: e.target.checked,
                  ...(e.target.checked
                    ? { jours: null, heuresTravaillees: null, heuresSupplementaires: null, retardMinutes: null }
                    : {}),
                }))
              }
              className="rounded border-gray-300"
            />
            Absent ce jour
          </label>
        </div>
      </div>
      {/* Ce que la journée vaut, dit avant l'enregistrement : les heures ne
          sont plus saisies, elles se déduisent — autant les montrer. */}
      {!valeurs.absent && (valeurs.jours != null || valeurs.heuresSupplementaires != null) && (
        <p className="rounded-xl border border-gray-100 bg-gray-50/60 px-4 py-3 text-sm text-gray-700">
          Journée de <strong>{formatNombre((valeurs.jours ?? 0) * HEURES_PAR_JOUR_POINTE, 1)} h</strong>
          {valeurs.heuresSupplementaires
            ? <> + <strong>{formatNombre(valeurs.heuresSupplementaires, 1)} h</strong> supplémentaires</>
            : null}{' '}
          = <strong>{formatNombre(joursPointes(valeurs), 2)} jour(s)</strong> facturé(s) au taux journalier.
        </p>
      )}
      <Input
        // « La raison des heures supplémentaires doit être renseignée, car
        // cette information impacte directement la facturation » (rev01) :
        // c'est le seul champ que ce formulaire rend obligatoire, et
        // seulement quand des heures supplémentaires sont saisies.
        label={heuresSupPosees ? 'Raison des heures supplémentaires (obligatoire)' : 'Commentaire'}
        value={valeurs.commentaire ?? ''}
        onChange={(e) => modifier('commentaire', e.target.value || null)}
        required={heuresSupPosees}
      />
      {erreur && <p className="text-sm text-red-600">{erreur}</p>}
      <div className="flex justify-end gap-3">
        <Button type="button" variant="ghost" onClick={onClose}>
          Annuler
        </Button>
        <Button type="submit" loading={envoi}>
          Enregistrer le pointage
        </Button>
      </div>
    </form>
  )
}

function ImportForm({
  employes,
  onImporter,
  onClose,
}: {
  employes: EmployeEpcm[]
  onImporter: (lots: LotPointageImport[]) => Promise<void>
  onClose: () => void
}) {
  const [contenu, setContenu] = useState('')
  const [resultat, setResultat] = useState<ResultatImportPointage | null>(null)
  const [envoi, setEnvoi] = useState(false)

  const analyser = (texte: string) => {
    setContenu(texte)
    setResultat(texte.trim() ? analyserCsvPointage(texte, employes) : null)
  }

  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm text-gray-600">Collez le contenu du fichier, ou sélectionnez-le.</p>
        <pre className="mt-2 text-[11px] bg-gray-50 border border-gray-200 rounded-lg p-3 overflow-x-auto text-gray-600">
          {MODELE_CSV_POINTAGE}
        </pre>
      </div>

      <input
        type="file"
        accept=".csv,text/csv,text/plain"
        onChange={(e) => {
          const fichier = e.target.files?.[0]
          if (fichier) void fichier.text().then(analyser)
        }}
        className="block w-full text-sm text-gray-600 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-primary/10 file:text-primary"
      />

      <textarea
        value={contenu}
        onChange={(e) => analyser(e.target.value)}
        rows={6}
        placeholder="date;employe;heures;heures_sup;retard_min;absent;commentaire"
        className="w-full px-3 py-2 rounded-xl border border-gray-200 bg-gray-50 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
      />

      {resultat && (
        <div className="space-y-2">
          <p className="text-sm text-gray-700">
            <span className="font-semibold text-gray-900">{resultat.nbJours}</span> journée(s) reconnue(s) pour{' '}
            <span className="font-semibold text-gray-900">{resultat.lots.length}</span> employé(s)/mois.
          </p>
          {resultat.rejets.length > 0 && (
            <div className="text-xs text-orange-700 bg-orange-50 border border-orange-200 rounded-lg p-3 max-h-40 overflow-y-auto">
              <p className="font-semibold mb-1">{resultat.rejets.length} ligne(s) non importée(s) :</p>
              <ul className="space-y-0.5">
                {resultat.rejets.slice(0, 20).map((r) => (
                  <li key={r.ligne}>
                    Ligne {r.ligne} — {r.motif}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      <div className="flex justify-end gap-3">
        <Button type="button" variant="ghost" onClick={onClose}>
          Annuler
        </Button>
        <Button
          disabled={!resultat || resultat.lots.length === 0}
          loading={envoi}
          onClick={async () => {
            if (!resultat) return
            setEnvoi(true)
            try {
              await onImporter(resultat.lots)
              onClose()
            } finally {
              setEnvoi(false)
            }
          }}
        >
          Importer
        </Button>
      </div>
    </div>
  )
}

export function PointageTab({
  employes,
  mois,
  onChangerMois,
  pointages,
  plannings,
  modifiable,
  onEnregistrerJour,
  onImporter,
  onPreremplir,
}: {
  employes: EmployeEpcm[]
  mois: string
  onChangerMois: (mois: string) => void
  pointages: PointageMoisEpcm[]
  plannings: PlanningMoisEpcm[]
  modifiable: boolean
  onEnregistrerJour: (employe: EmployeEpcm, date: string, valeurs: PointageJourEpcm) => Promise<void>
  onImporter: (lots: LotPointageImport[]) => Promise<void>
  onPreremplir: (propositions: PropositionPointage[], mois: string) => Promise<void>
}) {
  const [cellule, setCellule] = useState<{ employe: EmployeEpcm; date: string } | null>(null)
  const [importOuvert, setImportOuvert] = useState(false)
  const [preremplirOuvert, setPreremplirOuvert] = useState(false)

  const jours = useMemo(() => joursDuMois(mois), [mois])
  const parEmploye = useMemo(
    () => new Map(pointages.filter((p) => p.mois === mois).map((p) => [p.employeId, p])),
    [pointages, mois]
  )
  const planningsDuMois = useMemo(
    () => new Map(plannings.filter((p) => p.mois === mois).map((p) => [p.employeId, p])),
    [plannings, mois]
  )
  // Activité déduite du contrat (rev01) — cf. `estActif`.
  const actifs = useMemo(() => employes.filter((e) => estActif(e, aujourdHui())), [employes])

  return (
    <div className="space-y-4">
      <EnteteOnglet
        titre="Pointage"
        aide={`Une journée de présence se pointe par un 1 — les heures ne se saisissent plus, une journée vaut ${HEURES_PAR_JOUR_POINTE} h. Les heures supplémentaires se convertissent en jours facturés (6 h = 0,5 jour). Une case grisée signale un jour non planifié.`}
      >
        <SelecteurMois mois={mois} onChange={onChangerMois} />
        {modifiable && (
          <>
            {/* §4 : « l'objectif est de réduire les saisies manuelles ». Le
                pré-remplissage lit le planning du mois affiché. */}
            <Button variant="ghost" size="sm" onClick={() => setPreremplirOuvert(true)}>
              <CalendarCheck className="w-3.5 h-3.5 mr-1.5" />
              Pré-remplir
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setImportOuvert(true)}>
              <Upload className="w-3.5 h-3.5 mr-1.5" />
              Importer
            </Button>
          </>
        )}
      </EnteteOnglet>

      {actifs.length === 0 ? (
        <MessageVide>Aucun employé actif à pointer.</MessageVide>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-200 overflow-x-auto">
          <table className="text-sm border-separate border-spacing-0">
            <thead>
              <tr>
                <th className="sticky left-0 z-10 bg-white px-3 py-2 text-left text-xs font-medium text-gray-500 border-b border-gray-200 min-w-52">
                  Employé
                </th>
                {jours.map((date) => (
                  <th
                    key={date}
                    className={`px-0 py-1 text-center text-[10px] font-medium border-b border-gray-200 w-10 ${
                      estWeekEnd(date) ? 'bg-gray-50 text-gray-400' : 'text-gray-600'
                    }`}
                  >
                    {Number(date.slice(8))}
                  </th>
                ))}
                <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 border-b border-gray-200" title={`Jours facturés × ${HEURES_PAR_JOUR_POINTE} h`}>
                  Total h
                </th>
                <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 border-b border-gray-200">HS</th>
                <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 border-b border-gray-200">Jours facturés</th>
              </tr>
            </thead>
            <tbody>
              {actifs.map((employe) => {
                const pointage = parEmploye.get(employe.id)
                const valeurs = Object.entries(pointage?.jours ?? {}).filter(([date]) => date.startsWith(mois))
                // Jours facturés d'abord : c'est l'unité du contrat. Les
                // heures s'en déduisent (12 h par journée) au lieu d'être
                // sommées depuis une saisie qui n'existe plus.
                const totalJours = valeurs.reduce((t, [, v]) => t + joursPointes(v), 0)
                const totalHs = valeurs.reduce((t, [, v]) => t + (v.heuresSupplementaires ?? 0), 0)
                const totalH = totalJours * HEURES_PAR_JOUR_POINTE
                return (
                  <tr key={employe.id}>
                    <td className="sticky left-0 z-10 bg-white px-3 py-1 border-b border-gray-100 whitespace-nowrap font-medium text-gray-900">
                      {nomComplet(employe)}
                    </td>
                    {jours.map((date) => {
                      const affectation = planningsDuMois.get(employe.id)?.jours[date]
                      const prevuTravaille = affectation ? AFFECTATIONS[affectation].travaille : false
                      return (
                        <td
                          key={date}
                          className={`p-0 text-center border-b border-gray-100 ${estWeekEnd(date) ? 'bg-gray-50' : ''}`}
                        >
                          <button
                            disabled={!modifiable}
                            onClick={() => setCellule({ employe, date })}
                            title={`${nomComplet(employe)} — ${date}${affectation ? ` · prévu : ${AFFECTATIONS[affectation].label}` : ' · non planifié'}`}
                            className={`w-10 h-8 text-[11px] transition-colors ${
                              modifiable ? 'hover:bg-primary/5 cursor-pointer' : 'cursor-default'
                            } ${prevuTravaille ? '' : 'text-gray-300'}`}
                          >
                            <CelluleJour pointe={pointage?.jours[date]} />
                          </button>
                        </td>
                      )
                    })}
                    <td className="px-3 py-1 text-right font-semibold text-gray-900 border-b border-gray-100">
                      {formatNombre(totalH, 1)}
                    </td>
                    <td className="px-3 py-1 text-right text-accent border-b border-gray-100">{formatNombre(totalHs, 1)}</td>
                    <td className="px-3 py-1 text-right text-gray-600 border-b border-gray-100">{formatNombre(totalJours, 2)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <Modal isOpen={cellule !== null} onClose={() => setCellule(null)} title="Pointage de la journée">
        {cellule && (
          <PointageJourForm
            employe={cellule.employe}
            date={cellule.date}
            valeurInitiale={parEmploye.get(cellule.employe.id)?.jours[cellule.date] ?? POINTAGE_VIDE}
            onClose={() => setCellule(null)}
            onSubmit={(valeurs) => onEnregistrerJour(cellule.employe, cellule.date, valeurs)}
          />
        )}
      </Modal>

      {preremplirOuvert && (
        <PreremplissageModal
          employes={actifs}
          plannings={plannings}
          pointages={pointages}
          mois={mois}
          onClose={() => setPreremplirOuvert(false)}
          onAppliquer={onPreremplir}
        />
      )}

      <Modal isOpen={importOuvert} onClose={() => setImportOuvert(false)} title="Importer des pointages" maxWidth="max-w-2xl">
        <ImportForm employes={employes} onImporter={onImporter} onClose={() => setImportOuvert(false)} />
      </Modal>
    </div>
  )
}
