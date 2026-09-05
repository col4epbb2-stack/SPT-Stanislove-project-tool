import type { MetalReferentiel } from '../../types/travauxMetal'
import { useMontant } from '../../lib/montantAffiche'
import { valeurCibleActuelle, type ConsommationBc, type ContratDetail } from '../../lib/contratsEngine'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'

// Onglet "Data Travaux METAL" (listes de référence + suivi des POs) — extrait
// de pages/TravauxMetalPage.tsx le 06/08/2026, contenu inchangé.
//
// Suivi financier vivant ajouté le 04/09/2026 (lot 6, `doc/TRAVAUX
// METAL.docx` "DATA TRAVAUX MÉTAL", Q3 tranchée pour l'option A du recueil :
// réutiliser le mécanisme générique du module Contrat — commandes, AVC,
// factures — plutôt qu'en construire un propre à METAL). Cet onglet en
// devient une **vue de lecture** : créer une commande, l'augmenter ou lui
// rattacher une facture se fait toujours dans le module Contrats
// (`ContratsPage`), qui sait déjà le faire pour un contrat de type Métal
// sans qu'aucun code n'y ait été ajouté pour l'occasion.

/** Suivi financier d'un contrat Métal — commandes/AVC/factures du module Contrat (lot 6). */
function SuiviContratMetal({ contrat, onOpenContrats }: { contrat: ContratDetail; onOpenContrats?: () => void }) {
  const { montant: formatMontant } = useMontant()
  const cible = valeurCibleActuelle(contrat)
  const conso = contrat.consommation as { total: number; horsBc: number; parBc: ConsommationBc[] }
  const pct = cible > 0 ? Math.round((conso.total / cible) * 100) : 0
  const nombreCommandes = conso.parBc.filter((p) => p.origine === 'commande').length

  return (
    <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
      <div className="px-5 py-3 border-b border-gray-200 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="font-semibold text-gray-900">{contrat.intitule ?? contrat.reference}</h3>
          <p className="text-xs text-gray-400">
            Valeur cible actuelle {formatMontant(cible, 'XAF')}
            {contrat.avc.length > 0 && ` (dont ${contrat.avc.length} AVC)`} · Consommation{' '}
            {formatMontant(conso.total, 'XAF')} ({pct}%) · {nombreCommandes} commande(s) suivie(s) depuis Contrats
          </p>
        </div>
        {onOpenContrats && (
          <Button variant="ghost" size="sm" onClick={onOpenContrats}>
            Gérer les commandes, AVC et factures →
          </Button>
        )}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-left text-gray-500">
              <th className="px-4 py-2 font-medium whitespace-nowrap">BC / N° commande</th>
              <th className="px-4 py-2 font-medium whitespace-nowrap">Origine</th>
              <th className="px-4 py-2 font-medium text-right whitespace-nowrap">Valeur cible</th>
              <th className="px-4 py-2 font-medium text-right whitespace-nowrap">Consommation (factures)</th>
              <th className="px-4 py-2 font-medium text-right whitespace-nowrap">Reste</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {conso.parBc.map((p) => (
              <tr key={p.bc}>
                <td className="px-4 py-2 font-medium text-gray-900 whitespace-nowrap">{p.bc}</td>
                <td className="px-4 py-2 whitespace-nowrap">
                  {p.origine === 'commande' ? (
                    <Badge label="Commande (vivant)" bg="bg-indigo-50" text="text-indigo-700" />
                  ) : (
                    <Badge label="Classeur (historique)" bg="bg-gray-100" text="text-gray-500" />
                  )}
                </td>
                <td className="px-4 py-2 text-right text-gray-600">
                  {p.valeurCible != null ? formatMontant(p.valeurCible, 'XAF') : '—'}
                </td>
                <td className="px-4 py-2 text-right text-gray-600">{formatMontant(p.consommation, 'XAF')}</td>
                <td className="px-4 py-2 text-right text-gray-600">
                  {p.valeurCible != null ? formatMontant(p.valeurCible - p.consommation, 'XAF') : '—'}
                </td>
              </tr>
            ))}
            {conso.horsBc > 0 && (
              <tr>
                <td className="px-4 py-2 text-gray-500 italic" colSpan={2}>
                  Hors BC (affaires sans PO)
                </td>
                <td className="px-4 py-2 text-right">—</td>
                <td className="px-4 py-2 text-right font-medium text-gray-900">{formatMontant(conso.horsBc, 'XAF')}</td>
                <td className="px-4 py-2 text-right">—</td>
              </tr>
            )}
            {conso.parBc.length === 0 && conso.horsBc === 0 && (
              <tr>
                <td className="px-4 py-2 text-gray-400 italic" colSpan={5}>
                  Aucun BC historique ni commande sur ce contrat pour l'instant.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export function ReferentielTab({
  referentiel,
  contratsMetal = [],
  onOpenContrats,
}: {
  referentiel: MetalReferentiel
  /** Contrat(s) de type Métal, avec leur détail — lot 6 (04/09/2026). */
  contratsMetal?: ContratDetail[]
  onOpenContrats?: () => void
}) {
  const { montant: formatMontant } = useMontant()
  const listes: { titre: string; valeurs: string[] }[] = [
    { titre: 'Types de travaux', valeurs: referentiel.typesTravaux },
    { titre: 'Risques', valeurs: referentiel.risques },
    { titre: 'Statuts travaux', valeurs: referentiel.statutsTravaux },
    { titre: "Types d'avis", valeurs: referentiel.typesAvis },
    { titre: 'Champs', valeurs: referentiel.champs },
    { titre: 'Sites', valeurs: referentiel.sites },
  ]
  const totalCible = referentiel.suiviPo.reduce((s, p) => s + (p.valeurCible ?? 0), 0)
  const totalConso = referentiel.suiviPo.reduce((s, p) => s + (p.consommation ?? 0), 0)

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <h3 className="font-semibold text-gray-900">Suivi financier (commandes, valeur cible, factures)</h3>
        {contratsMetal.length === 0 ? (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-amber-800">
              Aucun contrat de type <strong>Métal</strong> n'est encore créé dans le module Contrats — créez-en un
              pour suivre ici ses commandes, leur valeur cible (initiale + augmentations) et leurs factures.
            </p>
            {onOpenContrats && (
              <Button size="sm" onClick={onOpenContrats}>
                Ouvrir le module Contrats →
              </Button>
            )}
          </div>
        ) : (
          contratsMetal.map((c) => <SuiviContratMetal key={c.id} contrat={c} onOpenContrats={onOpenContrats} />)
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {listes.map((l) => (
          <div key={l.titre} className="bg-white rounded-2xl border border-gray-200 p-5">
            <h3 className="font-semibold text-gray-900 mb-3">
              {l.titre} ({l.valeurs.length})
            </h3>
            <div className="flex flex-wrap gap-1.5 max-h-40 overflow-y-auto">
              {l.valeurs.map((v) => (
                <span key={v} className="text-xs px-2 py-1 rounded-lg bg-gray-100 text-gray-700">
                  {v}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-200">
          <h3 className="font-semibold text-gray-900">Suivi des POs — historique du classeur ({referentiel.suiviPo.length})</h3>
          <p className="text-xs text-gray-400">
            Repris tel quel de l'import, jamais modifiable ici. Reste = valeur cible − consommation (la colonne
            consommation est vide dans le classeur). Les commandes créées depuis le module Contrats vivent dans le
            bloc « Suivi financier » ci-dessus.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-gray-500">
                <th className="px-4 py-2 font-medium whitespace-nowrap">BC</th>
                <th className="px-4 py-2 font-medium text-right whitespace-nowrap">Valeur cible</th>
                <th className="px-4 py-2 font-medium text-right whitespace-nowrap">Consommation</th>
                <th className="px-4 py-2 font-medium text-right whitespace-nowrap">Reste</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {referentiel.suiviPo.map((p, i) => (
                <tr key={`${p.bc}-${i}`}>
                  <td className="px-4 py-2 font-medium text-gray-900 whitespace-nowrap">{p.bc}</td>
                  <td className="px-4 py-2 text-right text-gray-600">
                    {p.valeurCible != null ? formatMontant(p.valeurCible, 'XAF') : '—'}
                  </td>
                  <td className="px-4 py-2 text-right text-gray-600">
                    {p.consommation != null ? formatMontant(p.consommation, 'XAF') : '—'}
                  </td>
                  <td className="px-4 py-2 text-right text-gray-600">
                    {p.valeurCible != null ? formatMontant(p.valeurCible - (p.consommation ?? 0), 'XAF') : '—'}
                  </td>
                </tr>
              ))}
              <tr className="bg-gray-50 font-semibold text-gray-900">
                <td className="px-4 py-2">Total général</td>
                <td className="px-4 py-2 text-right">{formatMontant(totalCible, 'XAF')}</td>
                <td className="px-4 py-2 text-right">{formatMontant(totalConso, 'XAF')}</td>
                <td className="px-4 py-2 text-right">{formatMontant(totalCible - totalConso, 'XAF')}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 p-5">
        <h3 className="font-semibold text-gray-900 mb-2">Intitulés des faits marquants</h3>
        <ul className="list-disc list-inside text-sm text-gray-600 space-y-1">
          {referentiel.intitulesFaitsMarquants.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
      </div>
    </div>
  )
}
