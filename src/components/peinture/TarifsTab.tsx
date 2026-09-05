import type { PeintureReferentiel } from '../../types/contratPeinture'
import { formatNombre } from '../../lib/format'
import { TableauColonnes } from '../ui/TableauColonnes'
import { StatCard } from './elements'
import { colonnesObjectifs, colonnesTarifs } from './colonnes'
import { useMontant } from '../../lib/montantAffiche'

// Onglet "Tarifs & objectifs (DATA)" — extrait de
// pages/ContratPeinturePage.tsx le 06/08/2026. Référentiel en lecture seule :
// il est importé du classeur et alimente les coûts unitaires du journal
// (RECHERCHEV par type d'item), il ne se saisit pas ligne à ligne ici.
//
// Depuis le 27/08/2026 (lot 1 de `doc/recueil-module-contrat-peinture.md`),
// le **modèle de productivité** de cette feuille — heures et objectif par
// champ, coefficient par profil — se règle dans Paramètres › Contrat
// peinture, avec les consommables, les équipements et les causes de
// stand-by. Cet onglet reste ce qu'il a toujours été : la vue de ce que le
// classeur portait. Le renvoi ci-dessous existe pour qu'on ne cherche pas
// ici un champ modifiable qui n'y est pas.

export function TarifsTab({ referentiel }: { referentiel: PeintureReferentiel }) {
  const m = useMontant()
  const { objectifsProfil, tarifs, parametres } = referentiel
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Objectif de production"
          value={`${formatNombre(parametres.objectifProductionM2ParHeureHomme, 1)} m²/h/homme`}
        />
        <StatCard label="Taux horaire journalier" value={`${formatNombre(parametres.tauxHoraireJournalier)} h`} />
        <StatCard label="Engagement" value={m.montant(parametres.engagementKusd, 'KUSD')} />
        <StatCard label="Réalisé" value={m.montant(parametres.realiseKusd, 'KUSD')} />
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-200">
          <h3 className="font-semibold text-gray-900">Objectifs de production et répartition par profil</h3>
          <p className="text-xs text-gray-400">
            Valeurs du classeur, en lecture. Le modèle de productivité du contrat (heures et objectif par champ,
            coefficient par profil) se règle dans Paramètres › Contrat peinture.
          </p>
        </div>
        <TableauColonnes
          colonnes={colonnesObjectifs()}
          lignes={objectifsProfil}
          cleLigne={(o) => o.id}
          exportation={{ nomFichier: 'peinture-objectifs', titre: 'Objectifs par profil' }}
        />
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-200">
          <h3 className="font-semibold text-gray-900">Tarifs par type d'item ({tarifs.length})</h3>
          <p className="text-xs text-gray-400">
            Ces tarifs alimentent automatiquement les coûts unitaires des lignes du Journal de pointage.
          </p>
        </div>
        <TableauColonnes
          colonnes={colonnesTarifs(m)}
          lignes={tarifs}
          cleLigne={(t) => t.id}
          exportation={{ nomFichier: 'peinture-tarifs', titre: 'Référentiel des tarifs' }}
        />
      </div>
    </div>
  )
}
