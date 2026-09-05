import { useState } from 'react'
import type { KeyboardEvent } from 'react'
import type { LucideIcon } from 'lucide-react'

// Types et état d'un formulaire découpé en étapes ("flèche de suivi",
// 06/08/2026). Séparés des composants de rendu (components/ui/FlecheEtapes.tsx)
// pour que ce fichier-là n'exporte que des composants — contrainte du Fast
// Refresh, cf. règle eslint react-refresh/only-export-components.

// "complet" = renseigné · "vu" = étape optionnelle consultée et laissée vide
// volontairement (rien à signaler) · "partiel" = commencé mais pas
// exploitable · "vide" = jamais touchée.
export type EtatEtape = 'complet' | 'vu' | 'partiel' | 'vide'

// Définition statique d'une étape (hors état de remplissage).
export interface DefinitionEtape<C extends string> {
  key: C
  label: string
  icon: LucideIcon
  // Étape où ne rien saisir est une réponse valide : elle se coche une fois
  // consultée, et n'entre pas dans les manquantes bloquant l'enregistrement.
  optionnel: boolean
}

export interface EtapeAffichee<C extends string> extends DefinitionEtape<C> {
  etat: EtatEtape
  resume: string
}

// État de navigation du formulaire. `etapesVues` ne sert qu'aux étapes
// optionnelles : y passer sans rien saisir vaut "rien à signaler" et coche la
// flèche, alors que ne jamais les ouvrir laisse un doute sur un oubli.
export function useEtapes<C extends string>(premiere: C) {
  const [etapeActive, setEtapeActive] = useState<C>(premiere)
  const [etapesVues, setEtapesVues] = useState<C[]>([premiere])

  const allerEtape = (cle: C) => {
    setEtapeActive(cle)
    setEtapesVues((vues) => (vues.includes(cle) ? vues : [...vues, cle]))
  }
  const reinitialiserEtapes = () => {
    setEtapeActive(premiere)
    setEtapesVues([premiere])
  }

  // Marque une étape comme active **sans** la marquer vue (27/08/2026, CRJ) :
  // dans un formulaire d'une seule page où les sections défilent, le suivi du
  // défilement doit déplacer le curseur de la flèche sans pour autant décider
  // qu'une section optionnelle a été « vérifiée ». Sinon, faire défiler
  // jusqu'en bas cocherait tout — le signal ne voudrait plus rien dire.
  const marquerActive = (cle: C) => setEtapeActive(cle)

  return { etapeActive, etapesVues, allerEtape, marquerActive, reinitialiserEtapes }
}

// Empêche `Entrée` de valider le formulaire tant qu'on n'est pas à la
// dernière étape : la validation "toutes les sections obligatoires"
// renverrait l'utilisateur en arrière au milieu de sa frappe.
export function bloquerEntree<C extends string>(etapes: EtapeAffichee<C>[], active: C) {
  return (e: KeyboardEvent<HTMLFormElement>) => {
    const dernier = etapes.length > 0 && etapes[etapes.length - 1].key === active
    if (e.key === 'Enter' && !(e.target instanceof HTMLTextAreaElement) && !dernier) {
      e.preventDefault()
    }
  }
}
