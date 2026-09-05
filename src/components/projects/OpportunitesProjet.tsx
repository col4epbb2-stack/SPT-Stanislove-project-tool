import { TrendingUp } from 'lucide-react'
import { useProjects } from '../../contexts/useProjects'
import type { Projet } from '../../types/project'
import { opportunitesDeLaFiche, opportunitesSansGain } from '../../types/project'
import { ListeCouples, type LibellesCouples } from './ListeCouples'

// Opportunités d'une fiche projet et le gain attendu de chacune (23/08/2026,
// « on fera de même » que pour les risques) — mêmes principes : un bloc par
// opportunité, autant qu'on veut, et les deux textes libres du modèle
// précédent (`opportunites` / `gainsAttendus`) repris en une entrée sans
// jamais être effacés.

const LIBELLES: LibellesCouples = {
  titre: 'Opportunités et gains attendus',
  entree: 'Opportunité',
  labelPrincipal: 'Opportunité',
  aidePrincipal: "Ce que le projet permet de gagner au-delà de son objet (synergies, optimisations).",
  labelAssocie: 'Gain attendu',
  aideAssocie: 'Le bénéfice attendu de cette opportunité : production, coût évité, conformité…',
  manquant: 'Gain à préciser',
  badgeManquant: (n) => `${n} sans gain`,
  icone: TrendingUp,
}

export function OpportunitesProjet({ projet }: { projet: Projet }) {
  const { definirOpportunitesProjet } = useProjects()
  const opportunites = opportunitesDeLaFiche(projet)

  return (
    <ListeCouples
      libelles={LIBELLES}
      entrees={opportunites.map((o) => ({ id: o.id, principal: o.opportunite, associe: o.gain }))}
      manquants={opportunitesSansGain(opportunites)}
      onChange={(entrees) =>
        definirOpportunitesProjet(
          projet.id,
          entrees.map((e) => ({ id: e.id, opportunite: e.principal, gain: e.associe }))
        )
      }
    />
  )
}
