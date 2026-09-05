import { useState } from 'react'
import type { FormEvent } from 'react'
import { Plus, X } from 'lucide-react'
import { Input } from './Input'
import { Modal } from './Modal'
import { ChampDerive, DatalistInput, EnteteSection, SelectChamp } from './ChampsSaisie'
import { EnteteEtapes, PiedEtapes } from './FlecheEtapes'
import { SelecteurFicheProjet } from '../projects/SelecteurFicheProjet'
import type { Projet } from '../../types/project'
import type { CodeDevise, EchelleMontant } from '../../types/devise'
import { ChampMontant } from './ChampMontant'
import {
  bloquerEntree,
  useEtapes,
  type DefinitionEtape,
  type EtapeAffichee,
  type EtatEtape,
} from '../../lib/etapesFormulaire'

// Formulaire à étapes (flèche de suivi) DÉCLARATIF : les étapes et leurs
// champs sont décrits par des objets plutôt qu'écrits en JSX.
//
// Motivation (06/08/2026) : le module Procurement a 5 journaux à saisir
// (DA, AO, PO, surveillance, préfabrication) dont les formulaires ne
// diffèrent que par leur liste de champs — les écrire à la main aurait fait
// 5 × ~350 lignes de JSX quasi identiques. Les formulaires du CRJ, du
// Tonnage et de METAL gardent leur JSX propre : ils ont chacun une mécanique
// que ce moteur ne couvre pas (listes de lignes dynamiques, ventilation du
// standby, bouton "NA" des avancements METAL, reprise J-1…).
//
// Ce que le moteur couvre : champs texte / date / nombre / montant /
// pourcentage / select / fiche projet / liste suggérée (datalist), listes de
// lignes dynamiques, champs dérivés en lecture seule
// (calculés par un moteur métier et affichés au fil de la saisie), et l'état
// de remplissage de chaque étape.

/**
 * Un champ peut être **masqué selon la saisie en cours** (`visible`) : l'étape
 * « Coûts » de la fiche employé EPCM n'affiche le taux journalier que pour un
 * intervenant sous agrément, et le salaire mensuel que pour un salarié
 * (`doc/EPCM_rev01.docx`, point 6 : « La présentation devrait s'adapter
 * automatiquement selon le type de contrat »).
 *
 * **Un champ masqué n'est pas rendu** : son attribut `requis` échappe donc à
 * la validation native du navigateur. Ne masquer un champ obligatoire qu'en
 * sachant que rien ne l'exigera plus.
 */
export type ChampSaisie<T> = ChampSaisieVariante<T> & { visible?: (v: T) => boolean }

type ChampSaisieVariante<T> =
  | {
      type: 'texte' | 'date'
      cle: keyof T & string
      label: string
      requis?: boolean
      placeholder?: string
      // Valeurs déjà utilisées, proposées sans jamais interdire une nouvelle.
      suggestions?: string[]
      pleineLargeur?: boolean
    }
  | { type: 'nombre'; cle: keyof T & string; label: string; pas?: string }
  // Montant : même stockage qu'un nombre, mais saisissable dans n'importe
  // quelle devise convertible vers l'unité du module (18/08/2026, référentiel
  // des devises). `devise` peut dépendre de la saisie en cours — un journal
  // dont la devise est portée par la fiche projet choisie, par exemple.
  | {
      type: 'montant'
      cle: keyof T & string
      label: string
      devise: CodeDevise | ((v: T) => CodeDevise)
      echelle?: EchelleMontant
      pas?: string
      requis?: boolean
    }
  // Stocké en ratio 0-1 (convention du projet), saisi en points de %.
  | { type: 'pourcentage'; cle: keyof T & string; label: string }
  | {
      type: 'select'
      cle: keyof T & string
      label: string
      options: string[]
      /** Libellé lisible quand la valeur stockée est un code ou un identifiant. */
      libelles?: Record<string, string>
      pleineLargeur?: boolean
    }
  // Rattachement explicite à une fiche projet : stocke l'id de la fiche, pas
  // son nom. `onChoix` laisse le formulaire préremplir ses propres champs
  // depuis la fiche choisie (chaque journal a les siens).
  | {
      type: 'ficheProjet'
      cle: keyof T & string
      label?: string
      onChoix?: (projet: Projet | null, valeurs: T) => Partial<T>
      pleineLargeur?: boolean
    }
  // Liste de lignes dynamiques (26/08/2026) : plusieurs habilitations HSE
  // par personne, plusieurs périodes de renouvellement par contrat…
  // C'était jusqu'ici la mécanique qui obligeait un formulaire à garder son
  // JSX propre ; deux besoins identiques dans un même écran ont justifié de
  // l'ajouter au moteur plutôt que de la recopier deux fois.
  //
  // La valeur stockée est un tableau d'objets portant chacun un `id` — c'est
  // lui qui sert de clé React, et non l'index : supprimer une ligne du milieu
  // ferait sinon glisser l'état des suivantes.
  | {
      type: 'lignes'
      cle: keyof T & string
      label: string
      /** Colonnes d'une ligne, dans l'ordre d'affichage. */
      colonnes: { cle: string; label: string; type: 'texte' | 'date'; placeholder?: string }[]
      /** Valeurs d'une ligne neuve (hors `id`, posé par le moteur). */
      nouvelle?: () => Record<string, unknown>
      libelleAjout: string
      messageVide: string
      pleineLargeur?: boolean
    }
  | { type: 'derive'; label: string; valeur: (v: T) => string | number | null; aide?: string }

export interface EtapeChamps<T, C extends string> extends DefinitionEtape<C> {
  aide?: string
  champs: ChampSaisie<T>[]
  // Nombre de colonnes de la grille de champs (2 par défaut).
  colonnes?: 1 | 2 | 3
  // État de remplissage, calculé sur la saisie en cours.
  etat: (v: T) => { etat: EtatEtape; resume: string }
}

const GRILLE: Record<1 | 2 | 3, string> = {
  1: 'grid-cols-1',
  2: 'grid-cols-1 sm:grid-cols-2',
  3: 'grid-cols-1 sm:grid-cols-3',
}

export function FormulaireEtapes<T extends object, C extends string>({
  isOpen,
  onClose,
  titre,
  libelleSubmit,
  etapes,
  valeurInitiale,
  // Identité de la ligne en cours d'édition : change ⇒ le formulaire se
  // recharge (création ou passage à une autre ligne).
  cleEdition,
  onSubmit,
}: {
  isOpen: boolean
  onClose: () => void
  titre: string
  libelleSubmit: string
  etapes: EtapeChamps<T, C>[]
  valeurInitiale: () => T
  cleEdition: string
  onSubmit: (valeurs: T) => Promise<void>
}) {
  const [valeurs, setValeurs] = useState<T>(valeurInitiale)
  const [enregistrement, setEnregistrement] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)
  const { etapeActive, allerEtape, reinitialiserEtapes, etapesVues } = useEtapes<C>(etapes[0].key)

  // Rechargement à l'ouverture / au changement de ligne, ajusté pendant le
  // rendu plutôt que dans un useEffect (recommandation React : éviter un
  // setState synchrone dans un effet, qui déclenche un rendu en cascade).
  const [cleAppliquee, setCleAppliquee] = useState<string | null>(null)
  const cleCourante = isOpen ? cleEdition : null
  if (cleCourante !== null && cleCourante !== cleAppliquee) {
    setCleAppliquee(cleCourante)
    setValeurs(valeurInitiale())
    setErreur(null)
    reinitialiserEtapes()
  } else if (cleCourante === null && cleAppliquee !== null) {
    setCleAppliquee(null)
  }

  const lire = (cle: string) => (valeurs as Record<string, unknown>)[cle]
  const ecrire = (cle: string, v: unknown) => setValeurs((prev) => ({ ...prev, [cle]: v }))

  const etapesAffichees: EtapeAffichee<C>[] = etapes.map((e) => {
    const { etat, resume } = e.etat(valeurs)
    // Une étape optionnelle consultée et laissée vide vaut "rien à signaler".
    const ajuste = etat === 'vide' && e.optionnel && etapesVues.includes(e.key) ? 'vu' : etat
    return { key: e.key, label: e.label, icon: e.icon, optionnel: e.optionnel, etat: ajuste, resume }
  })
  const manquantes = etapesAffichees.filter((e) => !e.optionnel && e.etat !== 'complet')
  const etapeCourante = etapes.find((e) => e.key === etapeActive) ?? etapes[0]

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    // Les champs `required` des étapes non affichées ne sont pas dans le DOM :
    // la validation native ne les voit plus, c'est donc ici qu'on vérifie les
    // étapes obligatoires — et on ramène sur la première qui manque.
    if (manquantes.length > 0) {
      setErreur(`À compléter avant d'enregistrer : ${manquantes.map((m) => m.label).join(', ')}.`)
      allerEtape(manquantes[0].key)
      return
    }
    setEnregistrement(true)
    setErreur(null)
    try {
      await onSubmit(valeurs)
      onClose()
    } catch (err) {
      setErreur(err instanceof Error ? err.message : "Échec de l'enregistrement.")
    } finally {
      setEnregistrement(false)
    }
  }

  const rendreChamp = (champ: ChampSaisie<T>, index: number) => {
    // Champ conditionnel : masqué, il n'est pas rendu du tout — sa valeur
    // reste portée par la saisie et sera enregistrée telle quelle.
    if (champ.visible && !champ.visible(valeurs)) return null
    if (champ.type === 'derive') {
      return <ChampDerive key={`derive-${index}`} label={champ.label} valeur={champ.valeur(valeurs)} aide={champ.aide} />
    }
    const brut = lire(champ.cle)
    switch (champ.type) {
      case 'ficheProjet':
        return (
          <div key={champ.cle} className={champ.pleineLargeur ? 'sm:col-span-full' : undefined}>
          <SelecteurFicheProjet
            label={champ.label}
            valeur={brut as string | null}
            onChange={(projet) =>
              setValeurs((prev) => ({
                ...prev,
                [champ.cle]: projet?.id ?? null,
                ...(champ.onChoix?.(projet, prev) ?? {}),
              }))
            }
          />
          </div>
        )
      case 'select':
        return (
          <div key={champ.cle} className={champ.pleineLargeur ? 'sm:col-span-full' : undefined}>
            <SelectChamp
              label={champ.label}
              value={(brut as string | null) ?? ''}
              onChange={(v) => ecrire(champ.cle, v || null)}
              options={champ.options}
              libelles={champ.libelles}
            />
          </div>
        )
      case 'montant':
        return (
          <ChampMontant
            key={champ.cle}
            label={champ.label}
            devise={typeof champ.devise === 'function' ? champ.devise(valeurs) : champ.devise}
            echelle={champ.echelle}
            pas={champ.pas}
            required={champ.requis}
            value={typeof brut === 'number' ? brut : null}
            onChange={(v) => ecrire(champ.cle, v)}
          />
        )
      case 'nombre':
        return (
          <Input
            key={champ.cle}
            label={champ.label}
            type="number"
            step={champ.pas ?? '1'}
            value={brut == null ? '' : String(brut)}
            onChange={(e) => ecrire(champ.cle, e.target.value === '' ? null : Number(e.target.value))}
          />
        )
      case 'lignes': {
        const lignes = (Array.isArray(brut) ? brut : []) as Record<string, unknown>[]
        const majLignes = (suivantes: Record<string, unknown>[]) => ecrire(champ.cle, suivantes as never)
        return (
          <div key={champ.cle} className={champ.pleineLargeur === false ? undefined : 'sm:col-span-full'}>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-sm font-medium text-gray-500">{champ.label}</label>
              <button
                type="button"
                onClick={() => majLignes([...lignes, { id: crypto.randomUUID(), ...(champ.nouvelle?.() ?? {}) }])}
                className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
              >
                <Plus className="w-3.5 h-3.5" />
                {champ.libelleAjout}
              </button>
            </div>
            {lignes.length === 0 ? (
              <p className="text-xs text-gray-400">{champ.messageVide}</p>
            ) : (
              <div className="space-y-2">
                {lignes.map((ligne, i) => (
                  <div key={String(ligne.id ?? i)} className="flex flex-wrap items-end gap-2">
                    {champ.colonnes.map((col) => (
                      <Input
                        key={col.cle}
                        label={col.label}
                        type={col.type === 'date' ? 'date' : 'text'}
                        placeholder={col.placeholder}
                        value={(ligne[col.cle] as string | null) ?? ''}
                        onChange={(e) =>
                          majLignes(lignes.map((l, j) => (j === i ? { ...l, [col.cle]: e.target.value || null } : l)))
                        }
                        className={col.type === 'date' ? 'w-40' : 'w-56'}
                      />
                    ))}
                    <button
                      type="button"
                      onClick={() => majLignes(lignes.filter((_, j) => j !== i))}
                      title="Retirer cette ligne"
                      className="mb-3 text-gray-400 hover:text-red-600"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )
      }
      case 'pourcentage':
        return (
          <Input
            key={champ.cle}
            label={`${champ.label} (%)`}
            type="number"
            min="0"
            max="100"
            value={typeof brut === 'number' ? String(Math.round(brut * 100)) : ''}
            onChange={(e) => ecrire(champ.cle, e.target.value === '' ? null : Number(e.target.value) / 100)}
          />
        )
      default: {
        const valeur = (brut as string | null) ?? ''
        if (champ.suggestions) {
          return (
            <DatalistInput
              key={champ.cle}
              id={`dl-${champ.cle}`}
              label={champ.label}
              value={valeur}
              onChange={(v) => ecrire(champ.cle, v || null)}
              options={champ.suggestions}
              placeholder={champ.placeholder}
            />
          )
        }
        return (
          <div key={champ.cle} className={champ.pleineLargeur ? 'sm:col-span-full' : undefined}>
            <Input
              label={champ.label}
              type={champ.type === 'date' ? 'date' : 'text'}
              value={valeur}
              placeholder={champ.placeholder}
              required={champ.requis}
              onChange={(e) => ecrire(champ.cle, e.target.value || null)}
            />
          </div>
        )
      }
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={titre} maxWidth="max-w-3xl">
      <form onSubmit={handleSubmit} onKeyDown={bloquerEntree(etapesAffichees, etapeActive)} className="space-y-5">
        <EnteteEtapes
          etapes={etapesAffichees}
          active={etapeActive}
          onSelect={allerEtape}
          manquantes={manquantes}
        />

        <div className="space-y-4">
          <EnteteSection titre={etapeCourante.label} aide={etapeCourante.aide} />
          <div className={`grid gap-4 ${GRILLE[etapeCourante.colonnes ?? 2]}`}>
            {etapeCourante.champs.map(rendreChamp)}
          </div>
        </div>

        {erreur && <p className="text-xs text-red-600">{erreur}</p>}

        <PiedEtapes
          etapes={etapesAffichees}
          active={etapeActive}
          onAller={allerEtape}
          onAnnuler={onClose}
          enregistrement={enregistrement}
          complet={manquantes.length === 0}
          libelleSubmit={libelleSubmit}
        />
      </form>
    </Modal>
  )
}
