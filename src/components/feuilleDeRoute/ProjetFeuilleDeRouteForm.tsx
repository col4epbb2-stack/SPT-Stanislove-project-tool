import { useState } from 'react'
import type { FormEvent } from 'react'
import { Input } from '../ui/Input'
import { Button } from '../ui/Button'
import { ChampMontant } from '../ui/ChampMontant'
import { UNITE_KUSD } from '../../lib/unitesMontant'
import { useMontant } from '../../lib/montantAffiche'
import type { ProjetFeuilleDeRoute, ProjetFeuilleDeRouteInput } from '../../types/feuilleDeRoute'
import {
  EMPTY_PROJET_FEUILLE_DE_ROUTE,
  ETATS_INDICATEUR,
  RUBRIQUES_FEUILLE_DE_ROUTE,
  STATUTS_FEUILLE_DE_ROUTE,
  SERVICE_LEADERS_FEUILLE_DE_ROUTE,
  etatIndicateur,
  type EtatIndicateur,
} from '../../types/feuilleDeRoute'
import { PastilleIndicateur } from './PastilleIndicateur'

function ChoixEtatIndicateur({
  libelle,
  quoi,
  valeur,
  onChange,
}: {
  libelle: string
  quoi: 'flag' | 'scopes'
  valeur: number | null
  onChange: (etat: EtatIndicateur | '') => void
}) {
  const id = `libelle-${quoi}`
  const courant = etatIndicateur(valeur) ?? ''
  return (
    <div>
      <label className="block text-sm font-medium text-gray-500 mb-1.5" id={id}>
        {libelle}
      </label>
      <div role="radiogroup" aria-labelledby={id} className="flex flex-wrap gap-2">
        {[null, ...ETATS_INDICATEUR].map((d) => {
          const actif = courant === (d?.id ?? '')
          const texte = d ? (quoi === 'flag' ? d.flag : d.scopes) : 'Non renseigné'
          return (
            <button
              key={d?.id ?? 'aucun'}
              type="button"
              role="radio"
              aria-checked={actif}
              onClick={() => onChange(d?.id ?? '')}
              title={texte}
              className={`inline-flex items-center gap-1.5 px-2.5 py-2 rounded-xl border text-xs font-medium transition ${
                actif
                  ? 'border-primary bg-primary/5 text-gray-900'
                  : 'border-gray-200 bg-gray-50 text-gray-500 hover:bg-white hover:border-gray-300'
              }`}
            >
              {d ? <PastilleIndicateur valeur={d.valeur} quoi={quoi} /> : <span className="text-gray-300">—</span>}
              {texte}
            </button>
          )
        })}
      </div>
      {/* Une valeur importée du classeur (80, par exemple) n'est pas une des
          trois valeurs repères : on dit laquelle est enregistrée, sans quoi le
          bouton allumé donnerait à croire qu'elle vaut 100. */}
      {valeur != null && !ETATS_INDICATEUR.some((d) => d.valeur === valeur) && (
        <p className="mt-1 text-xs text-gray-400">
          Valeur enregistrée : {valeur} % — choisir un état la remplacera par sa valeur repère.
        </p>
      )}
    </div>
  )
}

interface ProjetFeuilleDeRouteFormProps {
  initial?: ProjetFeuilleDeRoute
  /**
   * Catégories proposées : celles déjà présentes dans la feuille de route,
   * plus celles déclarées dans Paramètres › Listes de valeurs. La catégorie
   * de la ligne en cours d'édition s'y ajoute si elle n'y figure pas — sinon
   * modifier une ligne dont la catégorie a été retirée du référentiel la
   * ferait disparaître sans prévenir.
   */
  categories?: string[]
  /**
   * Ouvre la Navette (21/08/2026). BU et PDC d'une ligne rattachée sont relus
   * sur la ligne navette à chaque affichage : les saisir ici n'aurait aucun
   * effet visible, le formulaire renvoie donc à la source.
   */
  onOpenNavette?: () => void
  /*
   * Le bloc PDC du formulaire (menu de version + montant lu sur la ligne
   * navette) a été **retiré le 23/08/2026** : les props `pdcNavette` et
   * `cyclePdc` qui l'alimentaient sont parties avec lui. Le PDC d'une ligne
   * ne se lit donc plus que dans le tableau, la modale de détail et la
   * navette. Conséquence à connaître : `pdc02_2026_kusd` — la seule colonne
   * PDC que porte le classeur — n'est plus saisissable pour une ligne **non
   * rattachée** à la navette ; `montantsPdcNavette` (colonnes.tsx) reste
   * utilisée par le tableau et couverte par ses tests.
   */
  /**
   * Engagement de la fiche projet rattachée : cumul de ses commandes (22/08/2026,
   * demande explicite : « concernant les commandes, il ne devrait pas être
   * possible de modifier directement le montant total des commandes depuis la
   * fiche projet ; la modification doit être effectuée au niveau des numéros de
   * commandes rattachés au contrat et liés au projet, puisque c'est cette
   * information qui alimente le montant global »).
   *
   * Quand il est fourni, le champ « Engagement (PO) » devient une lecture : ce
   * qu'on y saisissait n'était de toute façon plus affiché nulle part, le
   * tableau et la modale de détail lisant déjà le cumul des commandes dès
   * qu'une fiche est rattachée.
   */
  engagementLie?: { montantKusd: number; nbCommandes: number; nomProjet: string } | null
  /** Ouvre la fiche rattachée, là où une commande se corrige (onglet Contrats). */
  onOuvrirFiche?: () => void
  onSubmit: (values: ProjetFeuilleDeRouteInput) => void
  onCancel: () => void
}

const selectClass =
  'w-full px-4 py-3 rounded-xl border text-base bg-gray-50 border-gray-200 text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary focus:bg-white transition'
const textareaClass =
  'w-full px-4 py-3 rounded-xl border text-base bg-gray-50 border-gray-200 text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary focus:bg-white transition min-h-20'

export function ProjetFeuilleDeRouteForm({
  initial,
  categories = [],
  onOpenNavette,
  engagementLie,
  onOuvrirFiche,
  onSubmit,
  onCancel,
}: ProjetFeuilleDeRouteFormProps) {
  // WP à **NON** sur une ligne neuve (23/08/2026, demande explicite) : c'est le
  // cas courant, une affaire entre au Work Program par décision, pas par
  // défaut. Le troisième état reste possible — « — » se rechoisit à la main, et
  // les 20 lignes réelles reprises du classeur sans valeur gardent la leur.
  //
  // Le défaut est posé **ici**, sur le formulaire, et non dans
  // `EMPTY_PROJET_FEUILLE_DE_ROUTE` : le rapprochement s'en sert aussi pour
  // fabriquer une ligne depuis une fiche projet, où le WP vient de la fiche —
  // un NON d'office l'y déclarerait hors Work Program sans que personne ne
  // l'ait dit.
  const [values, setValues] = useState<ProjetFeuilleDeRouteInput>(
    initial ?? { ...EMPTY_PROJET_FEUILLE_DE_ROUTE, wp: 'NON' }
  )
  const { montant: formatMontant } = useMontant()

  // Une ligne rattachée à la navette y prend son BU et ses PDC (cf.
  // `calculerLigne`) : les champs correspondants sont donc lus, pas saisis.
  const suitLaNavette = !!initial?.ligneNavetteId

  // Les deux indicateurs se choisissent par leur **état** et non par un nombre
  // (21/08/2026) — mais le nombre reste ce qui est enregistré. Choisir un état
  // écrit sa valeur repère (100 / 50 / 0) ; une valeur importée du classeur
  // (80, par exemple) est conservée tant que l'état n'est pas rechangé, et le
  // menu affiche l'état auquel elle correspond.
  const definirEtat = (cle: 'flag' | 'receptionScopes', choisi: EtatIndicateur | '') => {
    const definition = ETATS_INDICATEUR.find((d) => d.id === choisi)
    setValues((v) => ({ ...v, [cle]: definition ? definition.valeur : null }))
  }

  const courante = values.categorie ?? ''
  const optionsCategorie =
    courante !== '' && !categories.includes(courante) ? [...categories, courante].sort() : categories

  const field =
    <K extends keyof ProjetFeuilleDeRouteInput>(key: K, parse: (raw: string) => ProjetFeuilleDeRouteInput[K]) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setValues((v) => ({ ...v, [key]: e.target.value === '' ? null : parse(e.target.value) }))

  // Les 4 colonnes budgétaires du classeur feuille de route sont en milliers
  // de dollars : `ChampMontant` garde cette unité d'enregistrement et laisse
  // saisir dans une autre devise (18/08/2026, référentiel des devises).
  const montant = (cle: 'bu26ServKusd' | 'pdc02_2026_kusd' | 'montantPO' | 'estimationKusd') => ({
    devise: UNITE_KUSD.devise,
    echelle: UNITE_KUSD.echelle,
    value: values[cle] ?? null,
    onChange: (v: number | null) => setValues((prev) => ({ ...prev, [cle]: v })),
  })

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    if (!values.projet.trim()) return
    onSubmit(values)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <Input
        label="Feuille de route ICP (nom du projet)"
        value={values.projet}
        onChange={(e) => setValues((v) => ({ ...v, projet: e.target.value }))}
        required
      />

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-500 mb-1.5">Service leader</label>
          <select className={selectClass} value={values.serviceLeader ?? ''} onChange={field('serviceLeader', (v) => v)}>
            <option value="">—</option>
            {SERVICE_LEADERS_FEUILLE_DE_ROUTE.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-500 mb-1.5">Statut</label>
          <select className={selectClass} value={values.statut ?? ''} onChange={field('statut', (v) => v)}>
            <option value="">—</option>
            {STATUTS_FEUILLE_DE_ROUTE.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="w-full">
          <label className="block text-sm font-medium mb-1.5 text-gray-500">Catégorie</label>
          <select className={selectClass} value={values.categorie ?? ''} onChange={field('categorie', (v) => v)}>
            <option value="">—</option>
            {optionsCategorie.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <Input label="Champs" value={values.champs ?? ''} onChange={field('champs', (v) => v)} />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Input label="Priorité" value={values.priorite ?? ''} onChange={field('priorite', (v) => v)} />
        <div>
          <label className="block text-sm font-medium text-gray-500 mb-1.5">Rubrique</label>
          <select className={selectClass} value={values.rubrique ?? ''} onChange={field('rubrique', (v) => v as never)}>
            <option value="">—</option>
            {RUBRIQUES_FEUILLE_DE_ROUTE.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
          {suitLaNavette && (
            <p className="mt-1 text-xs text-gray-400">
              La ligne navette rattachée fait foi : c'est sa rubrique qui s'affiche dans le tableau.
            </p>
          )}
        </div>
      </div>

      {/* Les deux indicateurs du classeur. Ils étaient l'un absent du
          formulaire (Flag) et l'autre en saisie numérique (Réception scopes) —
          « il serait préférable de permettre à l'utilisateur de sélectionner
          directement l'état correspondant » (21/08/2026). Depuis le
          23/08/2026, la sélection se fait sur le repère lui-même. */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChoixEtatIndicateur
          libelle="Flag"
          quoi="flag"
          valeur={values.flag}
          onChange={(etat) => definirEtat('flag', etat)}
        />
        <ChoixEtatIndicateur
          libelle="Réception scopes"
          quoi="scopes"
          valeur={values.receptionScopes}
          onChange={(etat) => definirEtat('receptionScopes', etat)}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Input label="Date de début" type="date" value={values.dateDebut ?? ''} onChange={field('dateDebut', (v) => v)} />
        <Input label="Date de fin" type="date" value={values.dateFin ?? ''} onChange={field('dateFin', (v) => v)} />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Input
          label="Avancement réel (%)"
          type="number"
          value={values.avancementReel ?? ''}
          onChange={field('avancementReel', Number)}
        />
        <Input label="OTP" value={values.otp ?? ''} onChange={field('otp', (v) => v)} />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-500 mb-1.5">WP</label>
          <select className={selectClass} value={values.wp ?? ''} onChange={field('wp', (v) => v)}>
            <option value="">—</option>
            <option value="OUI">OUI</option>
            <option value="NON">NON</option>
          </select>
        </div>
        <Input label="Année BU" type="number" value={values.anneeBu ?? ''} onChange={field('anneeBu', Number)} />
      </div>

      <Input label="Compte d'imputation" value={values.compteImputation ?? ''} onChange={field('compteImputation', (v) => v)} />

      <div>
        <div className="grid grid-cols-1 gap-4">
          <ChampMontant label="BU Initial" {...montant('bu26ServKusd')} disabled={suitLaNavette} />
        </div>
        {suitLaNavette && (
          <p className="mt-1.5 text-xs text-amber-600">
            Cette ligne est rattachée à une ligne navette : son BU et ses PDC y sont relus à chaque affichage, une
            valeur saisie ici resterait sans effet.{' '}
            {onOpenNavette && (
              <button type="button" onClick={onOpenNavette} className="font-semibold underline">
                Corriger dans la navette
              </button>
            )}
          </p>
        )}
      </div>

      <Input label="Numéro de commande (PO)" value={values.numeroPO ?? ''} onChange={field('numeroPO', (v) => v)} />

      <div className="grid grid-cols-2 gap-4">
        {engagementLie ? (
          <div>
            <p className="block text-sm font-medium text-gray-500 mb-1.5">Engagement (PO)</p>
            <p className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-gray-50 text-base text-gray-900">
              {formatMontant(engagementLie.montantKusd, 'KUSD')}
            </p>
            <p className="mt-1.5 text-xs text-amber-600">
              Cumul des {engagementLie.nbCommandes} commande(s) de la fiche « {engagementLie.nomProjet} ». Une commande
              se corrige sur elle-même, dans l'onglet Contrats de la fiche.{' '}
              {onOuvrirFiche && (
                <button type="button" onClick={onOuvrirFiche} className="font-semibold underline">
                  Ouvrir la fiche
                </button>
              )}
            </p>
          </div>
        ) : (
          <ChampMontant
            label="Engagement (PO)"
            {...montant('montantPO')}
            aide="Montant saisi, faute de fiche projet rattachée dont cumuler les commandes."
          />
        )}
        <ChampMontant label="Estimation" {...montant('estimationKusd')} />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-500 mb-1.5">Commentaires</label>
        <textarea
          className={textareaClass}
          value={values.commentaires ?? ''}
          onChange={(e) => setValues((v) => ({ ...v, commentaires: e.target.value || null }))}
          rows={3}
        />
      </div>

      <div className="flex justify-end gap-3 pt-2">
        <Button type="button" variant="ghost" onClick={onCancel}>
          Annuler
        </Button>
        <Button type="submit">Enregistrer</Button>
      </div>
    </form>
  )
}
