import { useMemo } from 'react'
import { formatDate, formatPercent } from '../../lib/format'
import { useMontant } from '../../lib/montantAffiche'
import type { CodeDevise } from '../../types/devise'
import {
  chronologieEpcm,
  echeancesContrats,
  effectifParSite,
  JOURS_ALERTE_CONTRAT_PROCHE,
  mouvementsRotation,
  nomComplet,
  prochainesRotations,
  type EvenementEpcm,
  type SyntheseFinanciereEpcm,
  type SyntheseHseEpcm,
  type EtatJourEpcm,
} from '../../lib/contratEpcmEngine'
import { EnteteOnglet, MessageVide } from './elements'
import type { EmployeEpcm, PlanningMoisEpcm, SaisieHseEpcm } from '../../types/contratEpcm'

/**
 * Page d'accueil du module EPCM — piste 1 de la note d'UX de `doc/EPCM.docx` :
 * « au lieu de commencer par des tableaux, afficher immédiatement des cartes
 * de synthèse. **Je dois comprendre la situation en moins de 10 secondes.** »
 *
 * Les six cartes sont **celles du document, dans son ordre et avec ses
 * couleurs**. Elles répondent aux questions qu'il pose en ouverture : qui est
 * sur quel site, qui monte, qui descend, quels contrats expirent, suis-je dans
 * mon budget, y a-t-il un incident HSE.
 *
 * **Tout est dérivé** : rien ne se saisit pour alimenter cet écran.
 */

/** Fenêtre de projection des montées / descentes, en jours. */
const HORIZON_MOUVEMENTS = 14

/**
 * Horizon des rotations à venir. Plus large que celui des mouvements : ceux-ci
 * se lisent dans le planning déjà posé, une rotation se déduit du cycle et
 * porte donc bien plus loin — c'est ce que le rev01 appelle « les prochaines
 * rotations programmées ».
 */
const HORIZON_ROTATIONS = 90
/** Profondeur de la chronologie, en jours. */
const PROFONDEUR_CHRONOLOGIE = 90

const TONS = {
  vert: 'bg-green-50 border-green-200 text-green-800',
  bleu: 'bg-blue-50 border-blue-200 text-blue-800',
  orange: 'bg-orange-50 border-orange-200 text-orange-800',
  rouge: 'bg-red-50 border-red-200 text-red-800',
  violet: 'bg-purple-50 border-purple-200 text-purple-800',
  neutre: 'bg-gray-50 border-gray-200 text-gray-700',
} as const

function Carte({
  puce,
  label,
  valeur,
  detail,
  ton,
}: {
  puce: string
  label: string
  valeur: string
  detail?: string
  ton: keyof typeof TONS
}) {
  return (
    <div className={`rounded-2xl border p-4 ${TONS[ton]}`}>
      <p className="text-xs font-medium flex items-center gap-1.5">
        <span aria-hidden>{puce}</span>
        {label}
      </p>
      <p className="text-2xl font-bold mt-1 tabular-nums">{valeur}</p>
      {detail && <p className="text-xs mt-0.5 opacity-80">{detail}</p>}
    </div>
  )
}

const ICONE_EVENEMENT: Record<EvenementEpcm['type'], string> = {
  MOBILISATION: '🟢',
  DEMOBILISATION: '⚪️',
  ROTATION: '🔵',
  HSE: '🔴',
  CONTRAT: '🟠',
}

export function AccueilTab({
  deviseAffichage,
  employes,
  plannings,
  hse,
  syntheseHse,
  finance,
  etat,
  aujourdHui,
}: {
  /** Devise d'affichage du module (rev01, point 7) — `null` = celle du système. */
  deviseAffichage: CodeDevise | null
  employes: EmployeEpcm[]
  plannings: PlanningMoisEpcm[]
  hse: SaisieHseEpcm[]
  syntheseHse: SyntheseHseEpcm
  finance: SyntheseFinanciereEpcm
  etat: EtatJourEpcm
  aujourdHui: string
}) {
  // Montants dans la devise d'affichage du module (rev01, point 7).
  const { montant: formatMontant } = useMontant(deviseAffichage)
  const montant = (v: number) => formatMontant(v, finance.devise)

  const horizon = useMemo(() => {
    const d = new Date(aujourdHui)
    d.setDate(d.getDate() + HORIZON_MOUVEMENTS)
    return d.toISOString().slice(0, 10)
  }, [aujourdHui])

  const debutChronologie = useMemo(() => {
    const d = new Date(aujourdHui)
    d.setDate(d.getDate() - PROFONDEUR_CHRONOLOGIE)
    return d.toISOString().slice(0, 10)
  }, [aujourdHui])

  const mouvements = useMemo(
    () => mouvementsRotation(employes, plannings, aujourdHui, horizon),
    [employes, plannings, aujourdHui, horizon]
  )
  const montent = mouvements.filter((m) => m.sens === 'MONTE')
  const descendent = mouvements.filter((m) => m.sens === 'DESCEND')

  // Rotations à venir, déduites du cycle de chaque fiche (rev01, point 3).
  const rotations = useMemo(() => {
    const fin = new Date(aujourdHui)
    fin.setDate(fin.getDate() + HORIZON_ROTATIONS)
    const borne = fin.toISOString().slice(0, 10)
    return employes
      .flatMap((e) => prochainesRotations(e, aujourdHui, borne, 3))
      .sort((a, b) => a.debut.localeCompare(b.debut))
      .slice(0, 12)
  }, [employes, aujourdHui])

  const sites = useMemo(() => effectifParSite(employes, plannings, aujourdHui), [employes, plannings, aujourdHui])
  const contratsProches = useMemo(
    () => echeancesContrats(employes, aujourdHui, JOURS_ALERTE_CONTRAT_PROCHE),
    [employes, aujourdHui]
  )
  const chronologie = useMemo(
    () => chronologieEpcm(employes, plannings, hse, debutChronologie, horizon),
    [employes, plannings, hse, debutChronologie, horizon]
  )

  // « Personnel mobilisé » : le total que le document demande, et que le
  // tableau de bord ne donnait qu'éclaté en sur site / bureau / rotation.
  // **La rotation est comptée dans « sur site » depuis le rev01** : l'ajouter
  // une seconde fois compterait deux fois les mêmes personnes.
  const mobilises = etat.surSite + etat.bureau

  return (
    <div className="space-y-6">
      <EnteteOnglet
        titre="Accueil"
        aide="La situation du contrat en un coup d'œil, au jour d'arrêté choisi. Tout est calculé : rien ne se saisit ici."
      />

      {/* Les six cartes de la note d'UX, dans son ordre et avec ses couleurs. */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        <Carte puce="🟢" ton="vert" label="Personnel mobilisé" valeur={String(mobilises)} detail={`sur ${etat.effectifActif} actifs`} />
        <Carte puce="🔵" ton="bleu" label="Personnel en rotation" valeur={String(etat.rotation)} />
        <Carte
          puce="🟠"
          ton="orange"
          label={`Contrats à renouveler (${JOURS_ALERTE_CONTRAT_PROCHE} j)`}
          valeur={String(contratsProches.length)}
          detail={contratsProches.length > 0 ? contratsProches.slice(0, 2).map((c) => nomComplet(c.employe)).join(', ') : undefined}
        />
        <Carte
          puce="🔴"
          ton={syntheseHse.evenements > 0 ? 'rouge' : 'vert'}
          label="Alertes HSE ouvertes"
          valeur={String(syntheseHse.evenements)}
          detail={`${syntheseHse.semaines} semaine(s) relevée(s)`}
        />
        <Carte
          puce="🟣"
          ton="violet"
          label="Consommation contrat"
          valeur={formatPercent(finance.pctConsomme, 0)}
          detail={`${montant(finance.coutEngage)} / ${montant(finance.budgetVendu)}`}
        />
        {/* Sixième carte du document. Le module n'a aujourd'hui **aucun lien
            avec les projets** : la carte est affichée et dit pourquoi elle est
            vide, plutôt que d'être supprimée (elle est demandée) ou de porter
            un chiffre inventé. */}
        <Carte
          puce="📈"
          ton="neutre"
          label="Projets livrés dans les délais"
          valeur="—"
          detail="Aucun projet rattaché au contrat"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* « Qui est sur quel site ? » */}
        <section className="bg-white rounded-2xl border border-gray-200 p-4">
          <h3 className="text-sm font-semibold text-gray-900 mb-2">Qui est sur quel site</h3>
          {sites.length === 0 ? (
            <p className="text-xs text-gray-400">Personne sur site à cette date.</p>
          ) : (
            <ul className="space-y-2">
              {sites.map((s) => (
                <li key={s.site}>
                  <p className="text-xs font-medium text-gray-700">
                    {s.site} <span className="text-gray-400">· {s.employes.length}</span>
                  </p>
                  <p className="text-xs text-gray-500">{s.employes.map(nomComplet).join(', ')}</p>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* « Qui monte en rotation ? Qui descend ? » */}
        <section className="bg-white rounded-2xl border border-gray-200 p-4">
          <h3 className="text-sm font-semibold text-gray-900 mb-2">
            Montées et descentes <span className="text-xs font-normal text-gray-400">— {HORIZON_MOUVEMENTS} prochains jours</span>
          </h3>
          {mouvements.length === 0 ? (
            <p className="text-xs text-gray-400">Aucun mouvement planifié sur la période.</p>
          ) : (
            <div className="space-y-2 text-xs">
              <div>
                <p className="font-medium text-green-700">Montent ({montent.length})</p>
                {montent.length === 0 ? (
                  <p className="text-gray-400">—</p>
                ) : (
                  montent.map((m) => (
                    <p key={`${m.employe.id}-${m.date}`} className="text-gray-600">
                      {formatDate(m.date)} · {nomComplet(m.employe)}
                    </p>
                  ))
                )}
              </div>
              <div>
                <p className="font-medium text-gray-600">Descendent ({descendent.length})</p>
                {descendent.length === 0 ? (
                  <p className="text-gray-400">—</p>
                ) : (
                  descendent.map((m) => (
                    <p key={`${m.employe.id}-${m.date}`} className="text-gray-600">
                      {formatDate(m.date)} · {nomComplet(m.employe)}
                    </p>
                  ))
                )}
              </div>
            </div>
          )}
        </section>

        {/* « Les prochaines rotations programmées » (rev01, point 3).
            Déduites du cycle porté par chaque fiche — pas du planning, qui
            n'est posé que jusqu'à la fin du contrat, et pas d'une liste tenue
            à la main, qui divergerait dès la première rotation décalée. */}
        <section className="bg-white rounded-2xl border border-gray-200 p-4">
          <h3 className="text-sm font-semibold text-gray-900 mb-2">
            Prochaines rotations{' '}
            <span className="text-xs font-normal text-gray-400">— {HORIZON_ROTATIONS} prochains jours</span>
          </h3>
          {rotations.length === 0 ? (
            <p className="text-xs text-gray-400">
              Aucune rotation programmée : renseignez un début de rotation sur les fiches en affectation offshore ou
              onshore.
            </p>
          ) : (
            <ul className="space-y-1.5 text-xs">
              {rotations.map((r) => (
                <li key={`${r.employeId}-${r.debut}`} className="flex items-baseline justify-between gap-2">
                  <span className="text-gray-700">{r.libelle}</span>
                  <span className="text-gray-500 whitespace-nowrap">
                    {formatDate(r.debut)} → {formatDate(r.fin)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* « Quels contrats expirent ? » */}
        <section className="bg-white rounded-2xl border border-gray-200 p-4">
          <h3 className="text-sm font-semibold text-gray-900 mb-2">Contrats qui expirent</h3>
          {contratsProches.length === 0 ? (
            <p className="text-xs text-gray-400">Aucun contrat à échéance sous {JOURS_ALERTE_CONTRAT_PROCHE} jours.</p>
          ) : (
            <ul className="space-y-1 text-xs">
              {contratsProches.map((c) => (
                <li key={c.employe.id} className="flex justify-between gap-2">
                  <span className="text-gray-700">{nomComplet(c.employe)}</span>
                  <span className={c.jours < 0 ? 'text-red-700 font-medium shrink-0' : 'text-orange-700 shrink-0'}>
                    {c.jours < 0 ? `expiré (${-c.jours} j)` : `${c.jours} j`}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* Piste 5 de la note d'UX : la chronologie des événements. */}
      <section className="bg-white rounded-2xl border border-gray-200 p-4">
        <h3 className="text-sm font-semibold text-gray-900 mb-1">Chronologie des événements</h3>
        <p className="text-xs text-gray-500 mb-3">
          Mobilisations, rotations, événements HSE et contrats — dérivés des données du module, sur les{' '}
          {PROFONDEUR_CHRONOLOGIE} derniers jours et les {HORIZON_MOUVEMENTS} prochains.
        </p>
        {chronologie.length === 0 ? (
          <MessageVide>Aucun événement sur la période.</MessageVide>
        ) : (
          <ol className="space-y-1.5">
            {chronologie.map((e, i) => (
              <li key={`${e.date}-${e.type}-${i}`} className="flex items-baseline gap-2 text-xs">
                <span aria-hidden>{ICONE_EVENEMENT[e.type]}</span>
                <span className="text-gray-400 tabular-nums shrink-0">{formatDate(e.date)}</span>
                <span className="text-gray-700">{e.libelle}</span>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  )
}
