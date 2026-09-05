import { ShieldCheck } from 'lucide-react'
import { useProjects } from '../../contexts/useProjects'
import type { Projet } from '../../types/project'
import { risquesDeLaFiche, risquesSansMitigation } from '../../types/project'
import { ListeCouples, type LibellesCouples } from './ListeCouples'

// Analyse de risques d'une fiche projet (23/08/2026, demande explicite : « pour
// un risque on doit avoir les mitigations associées dans un bloc, on pourra
// ajouter autant de fois que possible »).
//
// L'écran est `ListeCouples`, partagé avec les opportunités ; ce fichier ne
// fait que la traduction entre le type métier (`RisqueProjet`, dont les champs
// se lisent dans le document Firestore) et la forme neutre du composant.

const LIBELLES: LibellesCouples = {
  titre: 'Risques et mitigations',
  entree: 'Risque',
  labelPrincipal: 'Risque',
  aidePrincipal: 'Ce qui peut compromettre le délai, le coût, la sécurité ou la qualité.',
  labelAssocie: 'Mitigation associée',
  aideAssocie: 'Les actions mises en place pour maîtriser ce risque précis.',
  manquant: 'Mitigation à définir',
  badgeManquant: (n) => `${n} sans mitigation`,
  icone: ShieldCheck,
}

export function RisquesProjet({ projet }: { projet: Projet }) {
  const { definirRisquesProjet } = useProjects()
  const risques = risquesDeLaFiche(projet)

  return (
    <ListeCouples
      libelles={LIBELLES}
      entrees={risques.map((r) => ({ id: r.id, principal: r.risque, associe: r.mitigation }))}
      manquants={risquesSansMitigation(risques)}
      // Toute écriture part de la liste complète : la reprise du texte libre est
      // donc figée dans `analyseRisques` dès la première modification, et les
      // deux champs d'origine cessent d'être lus (ils restent sur la fiche).
      onChange={(entrees) =>
        definirRisquesProjet(
          projet.id,
          entrees.map((e) => ({ id: e.id, risque: e.principal, mitigation: e.associe }))
        )
      }
    />
  )
}
