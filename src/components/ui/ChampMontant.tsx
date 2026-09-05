import { useId, useState } from 'react'
import { useDevises } from '../../contexts/useDevises'
import {
  arrondirPourStockage,
  convertirEchelle,
  formaterMontant,
  formaterTaux,
  uniteMontant,
  type CodeDevise,
  type EchelleMontant,
} from '../../types/devise'
import { ECHELLE_AFFICHAGE } from '../../lib/montantAffiche'

// Champ de saisie d'un montant (18/08/2026) — le point d'application du
// référentiel des devises dans toute l'application.
//
// **Refonte du 19/08/2026** (demande explicite « la devise définie dans le
// système […] plus besoin de les afficher dans les inputs ») : le champ ne
// porte plus de sélecteur de devise. On saisit dans la devise du système —
// celle du pivot, la même sur tous les écrans —, et la conversion vers
// l'unité d'enregistrement du module est faite en silence.
//
// Ce qui a disparu, et pourquoi :
//  - le **sélecteur de devise de frappe** : il posait à chaque champ une
//    question à laquelle le système répond désormais une fois pour toutes ;
//  - la **préférence de poste** « saisir mes montants en … » : deux postes
//    auraient saisi dans deux devises différentes sans que rien ne le dise à
//    la lecture.
//
// Ce qui reste, parce que ce n'est pas la même chose : une entité qui **porte
// sa propre devise** (ligne navette, fiche projet, contrat EPCM) se qualifie
// toujours — par le champ « Devise » séparé de son formulaire
// (`ui/SelecteurDevise`, déjà en place aux 4 endroits concernés), et non par
// un menu collé au montant. Choisir la devise d'une donnée et choisir dans
// quoi on tape sont deux gestes différents ; les confondre dans le même
// contrôle était la source de l'ambiguïté.
//
// L'unité d'enregistrement, elle, ne change pas : chaque module écrit dans
// celle de son classeur source (KUSD pour la navette et la feuille de route,
// XAF pour les journaux terrain et les contrats). La changer voudrait dire
// relire tout l'historique importé pour savoir dans quoi il était compté.

export interface ChampMontantProps {
  label?: string
  /** Valeur enregistrée, exprimée dans `devise` et `echelle`. */
  value: number | null | ''
  onChange: (valeur: number | null) => void
  /** Devise d'enregistrement du module (ou de l'entité, quand elle porte la sienne). */
  devise: CodeDevise
  echelle?: EchelleMontant
  required?: boolean
  disabled?: boolean
  min?: number
  pas?: string
  className?: string
  /** Texte d'aide affiché sous le champ, avant la ligne de conversion. */
  aide?: string
}

export function ChampMontant({
  label,
  value,
  onChange,
  devise,
  echelle = 'unite',
  required,
  disabled,
  min,
  pas = 'any',
  className = '',
  aide,
}: ChampMontantProps) {
  const { devises, pivot } = useDevises()
  const id = useId()

  // Devise de frappe = celle du système, sauf si le montant ne peut pas y
  // être converti (taux non renseigné) : on reste alors dans l'unité
  // d'enregistrement plutôt que d'offrir un champ qui refuse ce qu'on y tape.
  const conversionPossibleIci =
    devise !== pivot.code &&
    convertirEchelle(1, { code: pivot.code, echelle }, { code: devise, echelle }, devises) !== null
  const deviseFrappe = conversionPossibleIci ? pivot.code : devise
  // **On tape à l'unité, comme on lit à l'unité** (21/08/2026, « on va
  // afficher USD partout ») : un champ en milliers au milieu d'un écran qui
  // n'en affiche plus serait le seul endroit où il faudrait diviser de tête.
  // La mise à l'échelle vers l'unité d'enregistrement est exacte et sans taux,
  // `convertirEchelle` s'en charge dans les deux sens.
  const echelleFrappe = ECHELLE_AFFICHAGE

  // Texte tapé dans la devise de frappe. Tant qu'il existe, il fait foi :
  // réafficher la valeur reconvertie à chaque frappe ferait danser les
  // décimales sous le curseur (500 → 499,999…).
  const [brouillon, setBrouillon] = useState<string | null>(null)

  // Remise à zéro du brouillon quand la donnée éditée change (autre fiche,
  // ligne requalifiée) : ajustement pendant le rendu, pas dans un effet.
  const [deviseConnue, setDeviseConnue] = useState(devise)
  if (devise !== deviseConnue) {
    setDeviseConnue(devise)
    setBrouillon(null)
  }

  // Deux questions distinctes, qui étaient la même tant que l'échelle de
  // frappe suivait celle du module :
  //  - `memeUnite` : ce qu'on tape est-il exactement ce qui est enregistré ?
  //    (sinon il faut convertir dans les deux sens) ;
  //  - `memeDevise` : y a-t-il un **taux** appliqué ? Une mise à l'échelle,
  //    elle, est exacte — elle n'a rien à signaler à l'utilisateur.
  const memeDevise = deviseFrappe === devise
  const memeUnite = memeDevise && echelleFrappe === echelle
  const stocke = value === '' || value == null ? null : Number(value)

  const valeurAffichee = () => {
    if (brouillon !== null) return brouillon
    if (stocke === null) return ''
    if (memeUnite) return String(stocke)
    const converti = convertirEchelle(
      stocke,
      { code: devise, echelle },
      { code: deviseFrappe, echelle: echelleFrappe },
      devises
    )
    if (converti === null) return String(stocke)
    // Arrondi d'affichage : la valeur enregistrée, elle, garde sa précision.
    return String(Math.round(converti * 100) / 100)
  }

  const saisir = (texte: string) => {
    setBrouillon(texte)
    if (texte.trim() === '') {
      onChange(null)
      return
    }
    const nombre = Number(texte)
    if (!Number.isFinite(nombre)) return
    if (memeUnite) {
      onChange(nombre)
      return
    }
    const converti = convertirEchelle(
      nombre,
      { code: deviseFrappe, echelle: echelleFrappe },
      { code: devise, echelle },
      devises
    )
    // Arrondi à ce que l'unité d'enregistrement sait porter : c'est le montant
    // annoncé juste sous le champ (« Enregistré : … ») qui doit être celui
    // écrit en base, pas un flottant à douze décimales dont l'affichage
    // masquerait la queue.
    onChange(converti === null ? nombre : arrondirPourStockage(converti, devise, devises, echelle))
  }

  return (
    <div className={`w-full ${className}`}>
      {label && (
        <label htmlFor={id} className="block text-sm font-medium mb-1.5 text-gray-500">
          {label}
        </label>
      )}
      <div
        className={`flex items-stretch rounded-xl border bg-gray-50 border-gray-200 transition focus-within:ring-2 focus-within:ring-primary/20 focus-within:border-primary focus-within:bg-white ${
          disabled ? 'opacity-50' : 'hover:border-gray-300'
        }`}
      >
        <input
          id={id}
          type="number"
          inputMode="decimal"
          step={pas}
          min={min}
          required={required}
          disabled={disabled}
          value={valeurAffichee()}
          onChange={(e) => saisir(e.target.value)}
          onBlur={() => setBrouillon(null)}
          className="w-full min-w-0 px-4 py-3 rounded-l-xl bg-transparent text-base tabular-nums focus:outline-none disabled:cursor-not-allowed"
        />
        {/* L'unité de frappe reste écrite : sans elle, un champ de montant ne
            dit plus dans quoi on tape. C'est le *choix* qui disparaît, pas
            l'information. */}
        <span className="shrink-0 flex items-center px-3 text-sm font-semibold text-gray-500">
          {uniteMontant(deviseFrappe, echelleFrappe)}
        </span>
      </div>

      {aide && <p className="mt-1 text-xs text-gray-400">{aide}</p>}

      {/* Ce qui part réellement en base, quand un **taux** a été appliqué.
          C'est la contrepartie de la conversion silencieuse : elle ne doit
          jamais être invisible.
          Volontairement muet sur la seule mise à l'échelle (21/08/2026) :
          taper 40 000 000 USD pour 40 000 KUSD enregistrés est une
          multiplication exacte, sans arrondi ni taux — l'annoncer ne
          réintroduirait des KUSD à l'écran que pour dire un détail de
          stockage. */}
      {!memeDevise && (
        <p className="mt-1 text-xs text-primary">
          Enregistré : {formaterMontant(stocke, devise, devises, echelle)}
          {' · '}
          {formaterTaux(deviseFrappe, devise, devises)}
        </p>
      )}

      {/* Cas inverse : le module enregistre dans une devise qui n'est pas
          convertible vers celle du système. On tape alors dans l'unité du
          module, et on le dit — sinon l'utilisateur croirait saisir dans la
          devise affichée partout ailleurs. */}
      {memeUnite && devise !== pivot.code && (
        <p className="mt-1 text-xs text-amber-600">
          Saisie en {uniteMontant(devise, echelle)} : le taux vers {pivot.code} n'est pas renseigné dans le référentiel
          des devises.
        </p>
      )}
    </div>
  )
}
