import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link2Off, Plus, Search } from 'lucide-react'
import { chargerContratDetail } from '../../lib/contratsEngine'
import type { ContratDetail, ContratListe } from '../../lib/contratsEngine'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { ChartCard, EvolutionChart, RepartitionChart } from '../contrats/ContratCharts'
import { ContratForm, ConsommationForm, OptionsRenouvellement } from '../contrats/ContratForms'
import { TYPE_LABELS, MOIS_LABELS, TYPES_DERIVES } from '../contrats/contratFormConstants'
import { valeurCibleActuelle } from '../../lib/contratsEngine'
import type { Projet } from '../../types/project'
import { totalFactureCommande, toutesCommandesContrat } from '../../types/project'
import { useContrats } from '../../contexts/useContrats'
import { useProjects } from '../../contexts/useProjects'
import { formatDate } from '../../lib/format'
import { useMontant } from '../../lib/montantAffiche'
import { CommandesContrat, CommandesHorsContratsLies } from './CommandesContrat'
import { rechercheClass } from '../ui/classes'

// Onglet "Contrats" de la fiche projet — lit désormais le référentiel
// portfolio (contratsEngine.ts) au lieu d'un système embarqué propre à
// chaque projet (fusion des deux systèmes de contrats, retour utilisateur).

// Liaison de **plusieurs** contrats en une fois (20/08/2026, demande
// explicite). Un projet pouvait déjà en porter plusieurs — `projetIds` est un
// tableau côté données — mais il fallait rouvrir le formulaire à chaque fois,
// ce qui donnait à l'écran l'air de n'en accepter qu'un. Cases à cocher +
// recherche : le référentiel compte plusieurs dizaines de contrats, un menu
// déroulant ne s'y parcourt pas.
function LierContratsForm({
  projetId,
  contratsDisponibles,
  onDone,
}: {
  projetId: string
  contratsDisponibles: ContratListe[]
  onDone: () => void
}) {
  const { lierProjet } = useContrats()
  const [selection, setSelection] = useState<string[]>([])
  const [recherche, setRecherche] = useState('')
  const [enCours, setEnCours] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)

  const filtres = useMemo(() => {
    const terme = recherche.trim().toLowerCase()
    if (!terme) return contratsDisponibles
    return contratsDisponibles.filter((c) =>
      [c.reference, c.intitule ?? '', TYPE_LABELS[c.type], c.fournisseur?.nom ?? ''].some((v) => v.toLowerCase().includes(terme))
    )
  }, [contratsDisponibles, recherche])

  const basculer = (id: string) =>
    setSelection((prev) => (prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]))

  const lier = async () => {
    setErreur(null)
    setEnCours(true)
    try {
      // Une liaison par contrat : `lierProjet` écrit le tableau `projetIds`
      // d'un document, il n'y a rien à grouper. Séquentiel et non en
      // parallèle, pour que l'erreur affichée soit celle du premier échec.
      for (const contratId of selection) await lierProjet(contratId, projetId)
      onDone()
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'La liaison a échoué.')
    } finally {
      setEnCours(false)
    }
  }

  return (
    <div className="mb-4 border border-gray-100 rounded-xl p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label className="text-sm font-medium text-gray-500">Contrats à lier à ce projet</label>
        <div className="relative w-full sm:w-64">
          <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            value={recherche}
            onChange={(e) => setRecherche(e.target.value)}
            placeholder="Référence, intitulé, type, fournisseur…"
            className={rechercheClass}
          />
        </div>
      </div>

      <div className="max-h-56 overflow-auto divide-y divide-gray-100 border border-gray-100 rounded-xl">
        {filtres.length === 0 && (
          <p className="px-4 py-3 text-sm text-gray-400">Aucun contrat disponible pour cette recherche.</p>
        )}
        {filtres.map((c) => (
          <label key={c.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 cursor-pointer">
            <input
              type="checkbox"
              checked={selection.includes(c.id)}
              onChange={() => basculer(c.id)}
              className="w-4 h-4 rounded border-gray-300 text-primary focus:ring-primary/30"
            />
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium text-gray-900 truncate">{c.reference}</span>
              {c.intitule && <span className="block text-xs text-gray-600 truncate">{c.intitule}</span>}
              <span className="block text-xs text-gray-400 truncate">
                {TYPE_LABELS[c.type]} · {c.fournisseur?.nom ?? '—'}
              </span>
            </span>
          </label>
        ))}
      </div>

      {erreur && <p className="text-sm text-red-600">{erreur}</p>}

      <div className="flex items-center justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onDone}>
          Annuler
        </Button>
        <Button size="sm" loading={enCours} disabled={selection.length === 0} onClick={() => void lier()}>
          Lier {selection.length > 0 ? `${selection.length} contrat(s)` : ''}
        </Button>
      </div>
    </div>
  )
}

function ContratCard({ projet, contrat }: { projet: Projet; contrat: ContratListe }) {
  const { montant: formatMontant } = useMontant()
  const { projects, commandes } = useProjects()
  const { delierProjet } = useContrats()
  const [detail, setDetail] = useState<ContratDetail | null>(null)
  const [showConsoForm, setShowConsoForm] = useState(false)

  // Commandes **de cette fiche** sur ce contrat : ce sont elles qui rendent le
  // détachement risqué, puisqu'elles portent son id.
  const commandesDuProjet = projet.commandes.filter((c) => c.contratId === contrat.id)

  const delier = async () => {
    const avertissement =
      commandesDuProjet.length > 0
        ? `\n\n${commandesDuProjet.length} commande(s) de ce projet lui sont rattachées : elles resteront enregistrées, mais s'afficheront sous « Commandes sans contrat lié » jusqu'à ce que le contrat soit relié.`
        : ''
    if (!window.confirm(`Détacher le contrat « ${contrat.reference} » de ce projet ?${avertissement}`)) return
    await delierProjet(contrat.id, projet.id)
  }

  const chargerDetail = useCallback(() => chargerContratDetail(contrat.id).then(setDetail), [contrat.id])
  useEffect(() => {
    chargerDetail()
  }, [chargerDetail])

  const estManuel = !TYPES_DERIVES.has(contrat.type)
  const consoManuelle = detail && 'entrees' in detail.consommation ? detail.consommation : null
  const consoDerivee = detail && 'parBc' in detail.consommation ? detail.consommation : null

  // Consommation dérivée des commandes/factures rattachées à ce contrat
  // (retour utilisateur : plus besoin de ressaisir l'affectation dans le
  // suivi contrat) — vient s'ajouter à la consommation manuelle, uniquement
  // pour les types sans dérivation métier déjà établie (Métal/Échafaudage/
  // Peinture dérivent déjà de journaux réels, on n'y touche pas).
  // « Tous projets confondus » comprend désormais les commandes **sans fiche
  // projet** (doc/module contrat.docx §3) : sans elles, le compteur affirmerait
  // un total qu'il n'a pas, et la consommation du contrat en oublierait une
  // part.
  const commandesLiees = toutesCommandesContrat(projects, commandes, contrat.id)
  const consoCommandes = commandesLiees.reduce((s, c) => s + totalFactureCommande(c), 0)
  // On repart de la part **saisie à la main** et non du total du moteur : le
  // moteur ne voit que les commandes de la collection, alors que cet écran
  // voit aussi celles restées dans les fiches (avant migration). Additionner
  // son total à `consoCommandes` compterait deux fois les mêmes factures.
  const totalManuel = consoManuelle?.totalSaisi ?? 0
  const total = estManuel ? totalManuel + consoCommandes : contrat.consommation
  // Valeur cible actuelle = initiale + AVC (doc/module contrat.docx §2).
  const cible = valeurCibleActuelle(contrat)
  const vcMois = cible / 12
  const depassement = total > cible

  // Barre "12 mois vs VC mensuelle" (contrat annuel, VC/12) — même
  // simplification que l'ancien système embarqué (pas de distinction
  // d'année) : les mois sont cumulés toutes années confondues.
  const parMois = Array(12).fill(0) as number[]
  if (estManuel) {
    for (const e of consoManuelle?.entrees ?? []) {
      if (e.mois >= 1 && e.mois <= 12) parMois[e.mois - 1] += e.montant
    }
    for (const c of commandesLiees) {
      for (const f of c.factures ?? []) {
        if (!f.date) continue
        const mois = Number(f.date.slice(5, 7))
        if (mois >= 1 && mois <= 12) parMois[mois - 1] += f.montant
      }
    }
  }
  const maxBar = Math.max(vcMois, ...parMois, 1)

  return (
    <div className="border border-gray-100 rounded-xl p-4 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-semibold text-gray-900">{contrat.reference}</p>
          {/* Intitulé du contrat (doc/module contrat.docx §1) — absent sur les
              contrats créés avant ce champ, la ligne disparaît alors. */}
          {contrat.intitule && <p className="text-sm text-gray-700">{contrat.intitule}</p>}
          <p className="text-xs text-gray-500 mt-0.5">
            {TYPE_LABELS[contrat.type]} · {contrat.fournisseur?.nom ?? '—'} · {formatDate(contrat.dateDebut)} → {formatDate(contrat.dateFin)}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Badge
            label={depassement ? `Dépassement VC` : `${cible > 0 ? Math.round((total / cible) * 100) : 0}% de la VC consommée`}
            bg={depassement ? 'bg-red-100' : 'bg-green-100'}
            text={depassement ? 'text-red-700' : 'text-green-700'}
          />
          {/* Détacher, et non supprimer : le contrat continue d'exister dans
              le référentiel et pour ses autres projets. Ce geste manquait —
              un contrat lié par erreur ne pouvait plus être retiré. */}
          <button
            type="button"
            onClick={() => void delier()}
            title="Détacher ce contrat du projet"
            aria-label={`Détacher ${contrat.reference}`}
            className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition"
          >
            <Link2Off className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3 text-sm">
        <div>
          <p className="text-gray-500 text-xs">Valeur Cible</p>
          <p className="font-semibold text-gray-900">{formatMontant(cible, projet.devise)}</p>
          {/* Le détail initiale + AVC ne s'affiche que s'il y a eu une
              augmentation — sinon les deux chiffres seraient les mêmes. */}
          {contrat.avc.length > 0 && (
            <p className="text-xs text-gray-400">
              dont {contrat.avc.length} AVC · initiale {formatMontant(contrat.valeurCible, projet.devise)}
            </p>
          )}
        </div>
        <div>
          <p className="text-gray-500 text-xs">VC mensuelle (÷12)</p>
          <p className="font-semibold text-gray-900">{formatMontant(vcMois, projet.devise)}</p>
        </div>
        <div>
          <p className="text-gray-500 text-xs">Consommé à date</p>
          <p className="font-semibold text-gray-900">{formatMontant(total, projet.devise)}</p>
        </div>
      </div>

      {/* Portée de ce compteur : **tous les projets** rattachés au contrat.
          Le bloc de commandes plus bas ne montre que celles de cette fiche —
          les deux nombres peuvent donc différer, et chacun dit lequel il
          compte plutôt que de laisser deviner. */}
      {commandesLiees.length > 0 && (
        <p className="text-xs text-gray-500">
          {commandesLiees.length} commande{commandesLiees.length > 1 ? 's' : ''} sur ce contrat, tous projets
          confondus · facturé{' '}
          {formatMontant(commandesLiees.reduce((s, c) => s + totalFactureCommande(c), 0), projet.devise)}
          {commandesDuProjet.length !== commandesLiees.length && (
            <> · dont {commandesDuProjet.length} pour ce projet</>
          )}
        </p>
      )}

      {contrat.optionsRenouvellement && contrat.optionsRenouvellement.length > 0 && (
        <OptionsRenouvellement contratId={contrat.id} options={contrat.optionsRenouvellement} />
      )}

      {/* Suivi des commandes, déplacé ici depuis l'onglet Budget le
          20/08/2026 (demande explicite). */}
      <CommandesContrat projet={projet} contratId={contrat.id} />

      {!detail ? (
        <p className="text-sm text-gray-400">Chargement…</p>
      ) : consoDerivee ? (
        <>
          {consoDerivee.evolution && consoDerivee.evolution.length > 0 && (
            <ChartCard title="Évolution de la consommation">
              <EvolutionChart data={consoDerivee.evolution} />
            </ChartCard>
          )}
          {consoDerivee.parService && consoDerivee.parService.length > 0 && (
            <ChartCard title="Répartition par service consommateur" height={Math.max(120, consoDerivee.parService.length * 32)}>
              <RepartitionChart data={consoDerivee.parService.map((s) => ({ label: s.service, montant: s.montant }))} />
            </ChartCard>
          )}
        </>
      ) : (
        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-medium text-gray-500">Consommation mensuelle vs VC</p>
            {!showConsoForm && (
              <button onClick={() => setShowConsoForm(true)} className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline">
                <Plus className="w-3.5 h-3.5" />
                Ajouter une consommation
              </button>
            )}
          </div>

          {showConsoForm && (
            <ConsommationForm
              contratId={contrat.id}
              onAjoutee={() => {
                setShowConsoForm(false)
                chargerDetail()
              }}
            />
          )}

          <div className="space-y-1.5">
            {MOIS_LABELS.map((label, i) => (
              <div key={label} className="flex items-center gap-2 text-xs">
                <span className="w-8 text-gray-500 shrink-0">{label}</span>
                <div className="flex-1 h-2.5 bg-gray-100 rounded-full overflow-hidden relative">
                  <div className="absolute inset-y-0 left-0 border-r-2 border-gray-400" style={{ width: `${(vcMois / maxBar) * 100}%` }} />
                  <div
                    className={`h-full rounded-full ${parMois[i] > vcMois ? 'bg-red-400' : 'bg-primary'}`}
                    style={{ width: `${(parMois[i] / maxBar) * 100}%` }}
                  />
                </div>
                <span className="w-24 text-right text-gray-600 shrink-0">{formatMontant(parMois[i], projet.devise)}</span>
              </div>
            ))}
          </div>
          <p className="text-xs text-gray-400 flex items-center gap-3 mt-2">
            <span className="inline-flex items-center gap-1">
              <span className="inline-block w-2.5 h-2.5 rounded-full bg-primary" /> Consommation du mois
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="inline-block w-0.5 h-2.5 bg-gray-400" /> VC mensuelle cible
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="inline-block w-2.5 h-2.5 rounded-full bg-red-400" /> Dépassement du mois
            </span>
          </p>
        </div>
      )}
    </div>
  )
}

export function ContratsTab({ projet }: { projet: Projet }) {
  const { montant: formatMontant } = useMontant()
  const { contrats, lierProjet } = useContrats()
  const [showNewForm, setShowNewForm] = useState(false)
  const [showLierForm, setShowLierForm] = useState(false)

  const contratsDuProjet = contrats.filter((c) => c.projetIds.includes(projet.id))
  const contratsDisponibles = contrats.filter((c) => !c.projetIds.includes(projet.id))
  const contratIdsLies = contratsDuProjet.map((c) => c.id)

  // Engagement et facturé du projet, tous contrats confondus. Ces totaux
  // étaient dans l'onglet Budget ; ils suivent les commandes, ils suivent donc
  // les commandes ici (20/08/2026).
  const engage = projet.commandes.reduce((s, c) => s + c.montant, 0)
  const facture = projet.commandes.reduce((s, c) => s + totalFactureCommande(c), 0)

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between mb-4 gap-3">
        <div className="min-w-0">
          <h4 className="font-semibold text-gray-900">Contrats liés au projet</h4>
          <p className="text-xs text-gray-500 mt-0.5">
            {contratsDuProjet.length === 0
              ? 'Un projet peut être rattaché à plusieurs contrats.'
              : `${contratsDuProjet.length} contrat(s) · ${projet.commandes.length} commande(s) · engagé ${formatMontant(
                  engage,
                  projet.devise
                )} · facturé ${formatMontant(facture, projet.devise)}`}
          </p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {!showLierForm && !showNewForm && contratsDisponibles.length > 0 && (
            <button onClick={() => setShowLierForm(true)} className="text-xs font-semibold text-primary hover:underline">
              Lier des contrats existants
            </button>
          )}
          {!showNewForm && !showLierForm && (
            <button
              onClick={() => setShowNewForm(true)}
              className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
            >
              <Plus className="w-3.5 h-3.5" />
              Créer un contrat
            </button>
          )}
        </div>
      </div>

      {showLierForm && (
        <LierContratsForm
          projetId={projet.id}
          contratsDisponibles={contratsDisponibles}
          onDone={() => setShowLierForm(false)}
        />
      )}

      {showNewForm && (
        <ContratForm
          onDone={() => setShowNewForm(false)}
          onSaved={async (contratId: string) => {
            await lierProjet(contratId, projet.id)
            setShowNewForm(false)
          }}
        />
      )}

      {contratsDuProjet.length === 0 ? (
        <p className="text-sm text-gray-400">
          Aucun contrat lié à ce projet. Les commandes (PO) se saisissent dans la carte du contrat concerné : liez-en
          un pour commencer.
        </p>
      ) : (
        <div className="space-y-4">
          {contratsDuProjet.map((c) => (
            <ContratCard key={c.id} projet={projet} contrat={c} />
          ))}
        </div>
      )}

      {/* Rien ne doit disparaître de l'écran parce qu'un contrat a été
          détaché : ces commandes-là restent visibles, à part. */}
      <div className="mt-4">
        <CommandesHorsContratsLies projet={projet} contratIdsLies={contratIdsLies} />
      </div>
    </div>
  )
}
