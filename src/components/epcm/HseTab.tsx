import { useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { Button } from '../ui/Button'
import { Input } from '../ui/Input'
import { Modal } from '../ui/Modal'
import { ModaleSuppression } from '../ui/ModaleSuppression'
import { TableauColonnes, type ColonneTableau } from '../ui/TableauColonnes'
import { formatDate, formatNombre } from '../../lib/format'
import { libelleMois, saisiesHseDuMois, semaineDe, type SyntheseHseEpcm } from '../../lib/contratEpcmEngine'
import { EnteteOnglet, MessageVide, SelecteurMois, StatCard } from './elements'
import { HEURES_PAR_JOUR_POINTE, type SaisieHseEpcm } from '../../types/contratEpcm'
import type { SaisieHseInput } from '../../lib/contratEpcmFirestore'

/**
 * Onglet HSE du module EPCM (§8 de `doc/EPCM.docx` : « le module HSE doit être
 * ajouté »).
 *
 * **Les indicateurs sont ceux des autres modules** — fat, lti, chse, mtc, fac,
 * hpi, anomalies, audits — et les fréquences (LTIF, TRIR, HPIF) passent par
 * les formules partagées de `types/hse.ts` : « les indicateurs suivis seront
 * les mêmes que ceux utilisés dans les autres modules de l'application ».
 *
 * **Les heures travaillées ne se saisissent pas** : elles valent jours pointés
 * × 12 (§8). C'est la seule ligne du tableau que personne ne remplit.
 *
 * Le suivi est **hebdomadaire**, avec faits marquants — les deux mots du
 * document.
 */

/** Les huit compteurs saisis, dans l'ordre du modèle HSE de l'application. */
const COMPTEURS: { cle: keyof SaisieHseInput; label: string; aide?: string }[] = [
  { cle: 'fat', label: 'Accidents mortels (FAT)' },
  { cle: 'lti', label: 'Accidents avec arrêt (LTI)' },
  { cle: 'chse', label: 'CHSE' },
  { cle: 'mtc', label: 'Traitements médicaux (MTC)' },
  { cle: 'fac', label: 'Premiers soins (FAC)' },
  { cle: 'hpi', label: 'Near-miss haut potentiel (HPI)' },
  { cle: 'anomalies', label: 'Anomalies' },
  { cle: 'audits', label: 'Audits' },
]

function saisieVide(semaine: string): SaisieHseInput {
  return { semaine, fat: 0, lti: 0, chse: 0, mtc: 0, fac: 0, hpi: 0, anomalies: 0, audits: 0, faitsMarquants: null }
}

function SaisieHseForm({
  initiale,
  moisAffiche,
  onClose,
  onSubmit,
}: {
  initiale: SaisieHseEpcm | null
  moisAffiche: string
  onClose: () => void
  onSubmit: (input: SaisieHseInput) => Promise<void>
}) {
  // Une semaine neuve est datée du **lundi de la semaine en cours** quand on
  // regarde le mois courant, sinon du premier lundi du mois affiché : ouvrir
  // un mois passé ne doit pas proposer une semaine qui n'en fait pas partie.
  const [valeurs, setValeurs] = useState<SaisieHseInput>(() => {
    if (initiale) {
      const { id, ...reste } = initiale
      void id
      return reste
    }
    const aujourdHui = new Date().toISOString().slice(0, 10)
    const defaut = aujourdHui.slice(0, 7) === moisAffiche ? aujourdHui : `${moisAffiche}-01`
    return saisieVide(semaineDe(defaut).debut)
  })
  const [envoi, setEnvoi] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)

  const modifier = <K extends keyof SaisieHseInput>(cle: K, valeur: SaisieHseInput[K]) =>
    setValeurs((prev) => ({ ...prev, [cle]: valeur }))

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setEnvoi(true)
    setErreur(null)
    try {
      await onSubmit(valeurs)
      onClose()
    } catch (err) {
      setErreur(err instanceof Error ? err.message : "Échec de l'enregistrement.")
      setEnvoi(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <Input
        label="Semaine (lundi)"
        type="date"
        value={valeurs.semaine}
        // Le relevé est identifié par sa semaine : on recale sur le lundi,
        // sinon deux saisies de la même semaine créeraient deux relevés.
        onChange={(e) => modifier('semaine', e.target.value ? semaineDe(e.target.value).debut : valeurs.semaine)}
        required
        className="w-48"
        disabled={initiale !== null}
      />
      {initiale && <p className="-mt-2 text-xs text-gray-400">La semaine identifie le relevé : elle n'est pas modifiable.</p>}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {COMPTEURS.map((c) => (
          <Input
            key={c.cle}
            label={c.label}
            type="number"
            min="0"
            value={String(valeurs[c.cle] ?? 0)}
            onChange={(e) => modifier(c.cle, (e.target.value === '' ? 0 : Number(e.target.value)) as never)}
          />
        ))}
      </div>

      <div>
        <label className="block text-sm font-medium mb-1.5 text-gray-500">Faits marquants</label>
        <textarea
          value={valeurs.faitsMarquants ?? ''}
          onChange={(e) => modifier('faitsMarquants', e.target.value || null)}
          rows={3}
          placeholder="Ce que les compteurs ne disent pas : circonstances, mesures prises, suites…"
          className="w-full px-4 py-3 rounded-xl border text-base bg-gray-50 border-gray-200 text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary focus:bg-white transition"
        />
      </div>

      <p className="text-xs text-gray-500">
        Les <strong>heures travaillées ne se saisissent pas</strong> : elles valent {HEURES_PAR_JOUR_POINTE} h par jour
        pointé, calculées depuis le pointage.
      </p>

      {erreur && <p className="text-sm text-red-600">{erreur}</p>}
      <div className="flex justify-end gap-3">
        <Button type="button" variant="ghost" onClick={onClose}>
          Annuler
        </Button>
        <Button type="submit" loading={envoi}>
          Enregistrer le relevé
        </Button>
      </div>
    </form>
  )
}

export function HseTab({
  saisies,
  synthese,
  mois,
  onChangerMois,
  modifiable,
  onEnregistrer,
  onSupprimer,
}: {
  saisies: SaisieHseEpcm[]
  synthese: SyntheseHseEpcm
  mois: string
  onChangerMois: (mois: string) => void
  modifiable: boolean
  onEnregistrer: (input: SaisieHseInput, initiale: SaisieHseEpcm | null) => Promise<void>
  // Suppression définitive (04/09/2026, demande explicite).
  onSupprimer: (saisie: SaisieHseEpcm) => Promise<void>
}) {
  const [formOuvert, setFormOuvert] = useState(false)
  const [enEdition, setEnEdition] = useState<SaisieHseEpcm | null>(null)
  const [aSupprimer, setASupprimer] = useState<SaisieHseEpcm | null>(null)

  const duMois = useMemo(() => saisiesHseDuMois(saisies, mois), [saisies, mois])

  const ouvrir = (saisie: SaisieHseEpcm | null) => {
    setEnEdition(saisie)
    setFormOuvert(true)
  }

  const colonnes: ColonneTableau<SaisieHseEpcm>[] = [
    ...(modifiable
      ? [
          {
            cle: 'edition',
            entete: '',
            valeur: (s: SaisieHseEpcm) => (
              <div className="flex items-center gap-2">
                <button onClick={() => ouvrir(s)} title="Modifier" className="text-gray-400 hover:text-primary transition-colors">
                  <Pencil className="w-3.5 h-3.5" />
                </button>
                <button onClick={() => setASupprimer(s)} title="Supprimer" className="text-gray-400 hover:text-red-600 transition-colors">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ),
            exportable: false,
          },
        ]
      : []),
    {
      cle: 'semaine',
      entete: 'Semaine',
      valeur: (s) => `${formatDate(s.semaine)} → ${formatDate(semaineDe(s.semaine).fin)}`,
      texte: (s) => s.semaine,
    },
    ...COMPTEURS.map((c) => ({
      cle: c.cle as string,
      entete: c.label,
      align: 'right' as const,
      valeur: (s: SaisieHseEpcm) => formatNombre(s[c.cle as keyof SaisieHseEpcm] as number, 0),
    })),
    {
      cle: 'faits',
      entete: 'Faits marquants',
      valeur: (s) => s.faitsMarquants ?? '—',
      classeCellule: 'max-w-[20rem] truncate',
      titre: (s) => s.faitsMarquants ?? undefined,
    },
  ]

  return (
    <div className="space-y-5">
      <EnteteOnglet
        titre="HSE"
        aide="Suivi hebdomadaire des événements HSE. Les heures travaillées sont calculées depuis le pointage (1 jour pointé = 12 h) ; le reste est saisi."
      >
        <SelecteurMois mois={mois} onChange={onChangerMois} />
        {modifiable && (
          <Button variant="ghost" size="sm" onClick={() => ouvrir(null)}>
            <Plus className="w-3.5 h-3.5 mr-1.5" />
            Relevé de la semaine
          </Button>
        )}
      </EnteteOnglet>

      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        <StatCard
          label="Heures travaillées"
          valeur={formatNombre(synthese.heuresTravaillees, 0)}
          detail={`${synthese.joursPointes} jours pointés × ${HEURES_PAR_JOUR_POINTE} h`}
        />
        <StatCard
          label="Événements"
          valeur={synthese.evenements}
          ton={synthese.evenements > 0 ? 'attention' : 'positif'}
          detail={`${synthese.semaines} semaine(s) relevée(s)`}
        />
        {/* Fréquences pour 1 000 000 d'heures — les formules partagées du
            classeur de référence. Le TRIR est calculable ici, contrairement à
            la synthèse HSE du CRJ : ce module saisit bien CHSE et MTC. */}
        <StatCard label="LTIF" valeur={formatNombre(synthese.ltif, 2)} ton={synthese.ltif > 0 ? 'critique' : 'positif'} />
        <StatCard label="TRIR" valeur={formatNombre(synthese.trir, 2)} ton={synthese.trir > 0 ? 'attention' : 'positif'} />
        <StatCard label="HPIF" valeur={formatNombre(synthese.hpif, 2)} ton={synthese.hpif > 0 ? 'attention' : 'positif'} />
        <StatCard label="Anomalies · audits" valeur={`${synthese.anomalies} · ${synthese.audits}`} />
      </div>

      {duMois.length === 0 ? (
        <MessageVide>Aucun relevé HSE sur {libelleMois(mois)}.</MessageVide>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
          <TableauColonnes
            colonnes={colonnes}
            lignes={duMois}
            cleLigne={(s) => s.id}
            exportation={{ nomFichier: 'epcm-hse', titre: `EPCM — HSE ${libelleMois(mois)}` }}
          />
        </div>
      )}

      <Modal isOpen={formOuvert} onClose={() => setFormOuvert(false)} title="Relevé HSE hebdomadaire" maxWidth="max-w-2xl">
        <SaisieHseForm
          initiale={enEdition}
          moisAffiche={mois}
          onClose={() => setFormOuvert(false)}
          onSubmit={(input) => onEnregistrer(input, enEdition)}
        />
      </Modal>

      {aSupprimer && (
        <ModaleSuppression
          titre={`Supprimer le relevé du ${formatDate(aSupprimer.semaine)}`}
          message="Ce relevé HSE hebdomadaire sera supprimé définitivement."
          libelleBouton="Supprimer"
          onFerme={() => setASupprimer(null)}
          onConfirmer={async () => {
            await onSupprimer(aSupprimer)
            setASupprimer(null)
          }}
        />
      )}
    </div>
  )
}
