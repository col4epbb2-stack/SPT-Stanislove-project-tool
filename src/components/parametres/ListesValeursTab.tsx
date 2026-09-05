import { useState } from 'react'
import type { FormEvent } from 'react'
import { AlertTriangle, Check, Eye, EyeOff, ListPlus, Lock, Pencil, Plus, X } from 'lucide-react'
import { useAuth } from '../../contexts/useAuth'
import { useListesValeurs } from '../../contexts/useListesValeurs'
import { Button } from '../ui/Button'
import { Badge } from '../ui/Badge'
import {
  LISTES_VALEURS,
  MODULE_LISTE_LABELS,
  listesDuModule,
  verifierValeur,
  type DefinitionListe,
  type EntreeListe,
  type ModuleListe,
} from '../../types/listeValeur'

// Paramétrage des listes de valeurs proposées dans les menus de saisie
// (18/08/2026, demande explicite).
//
// Ce que l'écran dit, et qu'il faut lire avant de s'étonner d'y voir des
// listes vides : il ne gère que les valeurs **ajoutées** ici. Les menus
// continuent de proposer, en plus, tout ce que les journaux contiennent déjà
// — une valeur portée par des lignes réelles ne peut pas être retirée d'un
// menu sans rendre ces lignes illisibles, et recopier ici les milliers de
// valeurs des classeurs importés n'apporterait rien.

// Onglets du haut : **dérivés du catalogue**, dans son ordre de déclaration.
// Ils étaient écrits en dur, et le module `crj` (4 listes, ajoutées le
// 23/08/2026) n'y avait jamais été ajouté : ses listes existaient, étaient
// lues par les formulaires du CRJ, mais **aucun onglet ne permettait de les
// atteindre pour les alimenter**. Une liste recopiée d'un tableau qu'on peut
// dériver finit toujours par en diverger (28/08/2026).
const MODULES: ModuleListe[] = [...new Set(LISTES_VALEURS.map((l) => l.module))]

// Une entrée ajoutée, avec son renommage et sa bascule active/inactive
// (04/09/2026, MET-59/60) — le renommage s'ouvre en ligne, à la place du
// texte, plutôt que dans une modale : c'est une correction ponctuelle d'un
// libellé, pas une saisie qui mérite son propre écran.
function ChipEntree({
  entree,
  autresValeurs,
  administrable,
  onRenommer,
  onBasculerActivation,
  onRetirer,
}: {
  entree: EntreeListe
  autresValeurs: string[]
  administrable: boolean
  onRenommer: (nouvelleValeur: string) => Promise<void>
  onBasculerActivation: () => Promise<void>
  onRetirer: () => Promise<void>
}) {
  const [edition, setEdition] = useState(false)
  const [saisie, setSaisie] = useState(entree.valeur)
  const [erreur, setErreur] = useState<string | null>(null)
  const [enCours, setEnCours] = useState(false)

  const ouvrirEdition = () => {
    setSaisie(entree.valeur)
    setErreur(null)
    setEdition(true)
  }

  const valider = async (e: FormEvent) => {
    e.preventDefault()
    if (saisie.trim() === entree.valeur) {
      setEdition(false)
      return
    }
    const probleme = verifierValeur(saisie, autresValeurs)
    if (probleme) {
      setErreur(probleme)
      return
    }
    setEnCours(true)
    try {
      await onRenommer(saisie)
      setEdition(false)
    } finally {
      setEnCours(false)
    }
  }

  if (edition) {
    return (
      <form onSubmit={valider} className="inline-flex flex-col gap-1">
        <div className="inline-flex items-center gap-1">
          <input
            autoFocus
            value={saisie}
            onChange={(e) => {
              setSaisie(e.target.value)
              setErreur(null)
            }}
            className="w-40 px-2 py-1 rounded-lg border border-primary/40 bg-white text-xs focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
          <button
            type="submit"
            disabled={enCours}
            title="Valider le renommage"
            className="p-1 rounded text-primary hover:bg-primary/10"
          >
            <Check className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setEdition(false)}
            title="Annuler"
            className="p-1 rounded text-gray-400 hover:text-gray-600 hover:bg-gray-100"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
        {erreur && <p className="text-[11px] text-red-600">{erreur}</p>}
      </form>
    )
  }

  return (
    <span
      className={`inline-flex items-center gap-1 pl-2.5 pr-1.5 py-1 rounded-lg border text-xs ${
        entree.actif
          ? 'bg-gray-50 border-gray-200 text-gray-800'
          : 'bg-gray-50/50 border-gray-100 text-gray-400 line-through'
      }`}
    >
      {entree.valeur}
      {!entree.actif && <Badge label="Désactivée" bg="bg-gray-100" text="text-gray-500" />}
      {administrable && (
        <>
          <button
            type="button"
            onClick={ouvrirEdition}
            title={`Renommer « ${entree.valeur} »`}
            className="p-0.5 rounded text-gray-400 hover:text-primary hover:bg-primary/10"
          >
            <Pencil className="w-3 h-3" />
          </button>
          <button
            type="button"
            onClick={() => void onBasculerActivation()}
            title={entree.actif ? `Désactiver « ${entree.valeur} »` : `Réactiver « ${entree.valeur} »`}
            className="p-0.5 rounded text-gray-400 hover:text-amber-600 hover:bg-amber-50"
          >
            {entree.actif ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
          </button>
          <button
            type="button"
            onClick={() => void onRetirer()}
            title={`Supprimer « ${entree.valeur} » définitivement`}
            className="p-0.5 rounded text-gray-400 hover:text-red-600 hover:bg-red-50"
          >
            <X className="w-3 h-3" />
          </button>
        </>
      )}
    </span>
  )
}

function CarteListe({
  definition,
  entrees,
  administrable,
  cible,
  onAjouter,
  onRetirer,
  onRenommer,
  onBasculerActivation,
}: {
  definition: DefinitionListe
  entrees: EntreeListe[]
  administrable: boolean
  /** Liste visée par le lien qui a ouvert l'écran — mise en avant pour qu'on la retrouve. */
  cible?: boolean
  onAjouter: (valeur: string) => Promise<void>
  onRetirer: (valeur: string) => Promise<void>
  onRenommer: (ancienneValeur: string, nouvelleValeur: string) => Promise<void>
  onBasculerActivation: (valeur: string) => Promise<void>
}) {
  const [saisie, setSaisie] = useState('')
  const [erreur, setErreur] = useState<string | null>(null)
  const [enCours, setEnCours] = useState(false)

  const toutesLesValeurs = entrees.map((e) => e.valeur)
  const nombreActives = entrees.filter((e) => e.actif).length

  const ajouter = async (e: FormEvent) => {
    e.preventDefault()
    const probleme = verifierValeur(saisie, toutesLesValeurs)
    if (probleme) {
      setErreur(probleme)
      return
    }
    setErreur(null)
    setEnCours(true)
    try {
      await onAjouter(saisie)
      setSaisie('')
    } finally {
      setEnCours(false)
    }
  }

  return (
    <section className={`carte p-4 ${cible ? 'ring-2 ring-primary/40' : ''}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h4 className="font-semibold text-gray-900">{definition.libelle}</h4>
            {entrees.length > 0 && (
              <Badge
                label={
                  nombreActives === entrees.length
                    ? `${entrees.length} ajoutée${entrees.length > 1 ? 's' : ''}`
                    : `${nombreActives}/${entrees.length} active${nombreActives > 1 ? 's' : ''}`
                }
                bg="bg-primary/10"
                text="text-primary"
              />
            )}
          </div>
          <p className="text-xs text-gray-500 mt-0.5">{definition.ou}</p>
        </div>
        <code className="text-[11px] text-gray-400 shrink-0">{definition.id}</code>
      </div>

      {entrees.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-3">
          {entrees.map((entree) => (
            <ChipEntree
              key={entree.valeur}
              entree={entree}
              autresValeurs={toutesLesValeurs.filter((v) => v !== entree.valeur)}
              administrable={administrable}
              onRenommer={(nouvelleValeur) => onRenommer(entree.valeur, nouvelleValeur)}
              onBasculerActivation={() => onBasculerActivation(entree.valeur)}
              onRetirer={() => onRetirer(entree.valeur)}
            />
          ))}
        </div>
      )}

      {administrable ? (
        <form onSubmit={ajouter} className="flex flex-wrap items-center gap-2 mt-3">
          <input
            value={saisie}
            onChange={(e) => {
              setSaisie(e.target.value)
              setErreur(null)
            }}
            placeholder="Nouvelle valeur…"
            className="flex-1 min-w-48 px-3 py-1.5 rounded-lg border border-gray-200 bg-gray-50 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
          />
          <Button type="submit" size="sm" variant="ghost" loading={enCours} disabled={!saisie.trim()}>
            <Plus className="w-3.5 h-3.5 mr-1" />
            Ajouter
          </Button>
        </form>
      ) : (
        entrees.length === 0 && <p className="text-xs text-gray-400 mt-3">Aucune valeur ajoutée.</p>
      )}

      {erreur && <p className="text-xs text-red-600 mt-1.5">{erreur}</p>}
    </section>
  )
}

// `cible` : identifiant d'une liste (« commun.plateformes ») quand l'écran a
// été ouvert par un lien venu d'un formulaire — le module qui la porte est
// alors sélectionné d'emblée et sa carte est mise en avant. Sans ça, le lien
// déposerait sur une page de 36 listes en laissant chercher la bonne.
export function ListesValeursTab({ cible }: { cible?: string }) {
  const { currentUser } = useAuth()
  const { entreesDe, ajouterValeur, retirerValeur, renommerValeur, basculerActivation, chargement } = useListesValeurs()
  const moduleCible = LISTES_VALEURS.find((l) => l.id === cible)?.module
  const [module, setModule] = useState<ModuleListe>(moduleCible ?? 'commun')
  const administrable = currentUser?.role === 'admin'

  const listes = listesDuModule(module)
  const totalAjouts = LISTES_VALEURS.reduce((n, l) => n + entreesDe(l.id).length, 0)

  if (chargement) return <p className="text-sm text-gray-400">Chargement des listes…</p>

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold text-gray-900">Listes de valeurs</h3>
          <p className="text-xs text-gray-500 max-w-3xl mt-0.5">
            Les valeurs proposées dans les menus de saisie. Une valeur ajoutée ici apparaît immédiatement dans le
            module concerné, sans attendre qu'une ligne la porte — c'est tout l'intérêt : préparer un type de travaux
            ou un profil avant la première saisie qui l'utilise.
          </p>
        </div>
        <span className="inline-flex items-center gap-1.5 text-xs text-gray-500 shrink-0">
          <ListPlus className="w-4 h-4 text-primary" />
          {totalAjouts} valeur(s) ajoutée(s) sur {LISTES_VALEURS.length} listes
        </span>
      </div>

      <div className="rounded-xl border border-gray-100 bg-gray-50/70 px-4 py-3 text-xs text-gray-600 space-y-1.5">
        <p className="flex items-start gap-2">
          <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
          <span>
            Les menus proposent <span className="font-medium">en plus</span> toutes les valeurs déjà présentes dans les
            journaux et dans les référentiels repris des classeurs. Une liste vide ci-dessous ne veut donc pas dire un
            menu vide — elle veut dire qu'aucune valeur n'a encore été ajoutée à la main. Retirer, renommer ou
            désactiver une valeur ici ne change rien aux lignes qui la portent déjà : une valeur désactivée
            (icône <EyeOff className="w-3 h-3 inline align-text-bottom" />) n'est simplement plus proposée pour une
            nouvelle saisie.
          </span>
        </p>
        <p className="flex items-start gap-2">
          <Lock className="w-3.5 h-3.5 text-gray-400 shrink-0 mt-0.5" />
          <span>
            Ne figurent pas ici les listes dont le code dépend (type de projet avis/DDM/SOR, rubrique OPEX/CAPEX,
            statuts du parcours de visa, cycles PDC, rôles) : leur valeur déclenche un comportement, en ajouter une
            créerait une entrée de menu qu'aucun traitement ne saurait suivre.
          </span>
        </p>
      </div>

      <div className="flex flex-wrap gap-1 border-b border-line">
        {MODULES.map((cle) => {
          const nombre = listesDuModule(cle).reduce((n, l) => n + entreesDe(l.id).length, 0)
          return (
            <button
              key={cle}
              type="button"
              onClick={() => setModule(cle)}
              className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                module === cle
                  ? 'border-primary text-primary'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {MODULE_LISTE_LABELS[cle]}
              {nombre > 0 && <span className="ml-1.5 text-xs text-gray-400">({nombre})</span>}
            </button>
          )
        })}
      </div>

      {!administrable && (
        <p className="text-xs text-gray-500">
          Lecture seule : seul un administrateur peut modifier ces listes.
        </p>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {listes.map((definition) => (
          <CarteListe
            key={definition.id}
            definition={definition}
            entrees={entreesDe(definition.id)}
            administrable={administrable}
            cible={definition.id === cible}
            onAjouter={(valeur) => ajouterValeur(definition.id, valeur)}
            onRetirer={(valeur) => retirerValeur(definition.id, valeur)}
            onRenommer={(ancienneValeur, nouvelleValeur) => renommerValeur(definition.id, ancienneValeur, nouvelleValeur)}
            onBasculerActivation={(valeur) => basculerActivation(definition.id, valeur)}
          />
        ))}
      </div>
    </div>
  )
}
