import type { ReactNode } from 'react'
import { ArrowUpRight, Pencil, Trash2 } from 'lucide-react'
import { Modal } from '../ui/Modal'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { BarreProgression } from '../ui/TuileKpi'
import { LiaisonBadge } from '../liaison/LiaisonBadge'
import { STATUT_COLORS, type LigneFdr } from './colonnes'
import { PastilleIndicateur } from './PastilleIndicateur'
import { CYCLE_BUDGET_LABELS } from '../../types/navette'
import { TYPE_LABELS } from '../../types/project'
import { METHODE_LIAISON_LABELS } from '../../types/liaison'
import { formatDate } from '../../lib/format'
import { phasesEnCours } from '../../lib/planning'
import { useMontant } from '../../lib/montantAffiche'
import { usePreferenceAffichage } from '../../lib/preferencesAffichage'

/** Budget auquel l'engagement est rapporté : budget initial ou budget révisé. */
type ReferenceEngagement = 'bu' | 'pdc'

// Vue « détail » d'une ligne de feuille de route (ouverte par l'œil du
// tableau) : le tableau ne peut montrer qu'une valeur par colonne, alors que
// la ligne porte à la fois ses champs saisis, ceux dérivés de la fiche projet
// liée et des écarts qui ne valent que rapprochés (engagement vs estimation,
// facturé vs engagé). Rien n'est calculé ici quand une des deux entrées
// manque — un « — » plutôt qu'un zéro trompeur.

function Champ({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <p className="text-xs font-medium text-gray-500">{label}</p>
      <div className="text-sm text-gray-900 mt-0.5">{children}</div>
    </div>
  )
}

function Section({ titre, children }: { titre: string; children: ReactNode }) {
  return (
    <section>
      <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">{titre}</h4>
      <div className="rounded-xl border border-gray-100 bg-gray-50/70 p-4 grid grid-cols-2 sm:grid-cols-3 gap-4">
        {children}
      </div>
    </section>
  )
}

const RIEN = <span className="text-gray-300">—</span>

// Durée en jours bornes comprises, même convention que les autres modules
// (fin − début + 1).
function dureeJours(debut: string | null, fin: string | null): number | null {
  if (!debut || !fin) return null
  const d = new Date(debut).getTime()
  const f = new Date(fin).getTime()
  if (Number.isNaN(d) || Number.isNaN(f)) return null
  return Math.round((f - d) / 86_400_000) + 1
}

export function ProjetFdrDetailModal({
  ligne,
  onClose,
  isAdmin,
  onModifier,
  onSupprimer,
  onOpenProject,
}: {
  ligne: LigneFdr | null
  onClose: () => void
  isAdmin: boolean
  onModifier: () => void
  onSupprimer: () => void
  onOpenProject?: (projetId: string) => void
}) {
  const { montant: formatMontant } = useMontant()
  // Référence du taux d'engagement, gardée d'une ouverture à l'autre comme le
  // cycle PDC de la page (22/08/2026, demande explicite : « il est important de
  // pouvoir utiliser soit le budget initial, soit la PDC (budget révisé) comme
  // référence ; selon la période de l'année et l'indicateur que l'on souhaite
  // mettre en avant […] il serait donc pertinent de prévoir la possibilité de
  // sélectionner la référence utilisée pour le calcul »).
  const [referenceEngagement, setReferenceEngagement] = usePreferenceAffichage<ReferenceEngagement>(
    'feuilleDeRoute.referenceEngagement',
    'bu'
  )
  if (!ligne) return null
  const { p, resolution, projetLie, avancement, engagementKusd, factureKusd, buKusd, pdcKusd, cyclePdc, rubrique, suitLaNavette } = ligne

  const statutColors = p.statut ? STATUT_COLORS[p.statut] : undefined
  const duree = dureeJours(p.dateDebut, p.dateFin)
  // Écart d'engagement : ce qui a été engagé au-delà (ou en deçà) de
  // l'estimation. Sans l'un des deux, pas d'écart — pas de 0 par défaut.
  const ecartEstimation =
    engagementKusd != null && p.estimationKusd != null ? engagementKusd - p.estimationKusd : null
  // Les deux taux du document, dans ses termes exacts :
  //   engagement  = commandes imputées au projet / budget total du projet
  //   facturation = montant facturé / montant total des commandes
  // Le dénominateur du premier est donc l'engagement lui-même pour le second —
  // c'est la même grandeur, prise une fois en numérateur, une fois en
  // dénominateur. On reprend le montant **affiché** juste au-dessus (commandes
  // de la fiche, sinon montant PO saisi) : deux nombres différents pour le même
  // mot sur un même écran, c'est ce qui rend un indicateur inutilisable.
  const engagementAffiche = engagementKusd ?? p.montantPO ?? null
  const tauxFacturation =
    engagementAffiche != null && engagementAffiche !== 0 && factureKusd != null
      ? factureKusd / engagementAffiche
      : null
  // Budget de référence : celui que l'utilisateur a choisi, et rien d'autre —
  // retomber sur l'autre quand il manque donnerait un taux dont on ne saurait
  // plus par rapport à quoi il est calculé.
  const budgetReference = referenceEngagement === 'bu' ? buKusd : pdcKusd
  const tauxEngagement =
    engagementAffiche != null && budgetReference != null && budgetReference !== 0
      ? engagementAffiche / budgetReference
      : null

  return (
    <Modal isOpen={!!ligne} onClose={onClose} title={p.projet} maxWidth="max-w-3xl">
      <div className="space-y-6">
        <div className="flex flex-wrap items-center gap-2">
          {p.statut && (
            <Badge
              label={p.statut}
              bg={statutColors?.bg ?? 'bg-gray-100'}
              text={statutColors?.text ?? 'text-gray-600'}
            />
          )}
          {p.serviceLeader && <Badge label={p.serviceLeader} bg="bg-primary/10" text="text-primary" />}
          {p.categorie && <Badge label={p.categorie} bg="bg-gray-100" text="text-gray-700" />}
          {rubrique && (
            <Badge
              label={rubrique}
              bg={rubrique === 'CAPEX' ? 'bg-indigo-100' : 'bg-sky-100'}
              text={rubrique === 'CAPEX' ? 'text-indigo-700' : 'text-sky-700'}
            />
          )}
          {p.champs && <Badge label={p.champs} bg="bg-gray-100" text="text-gray-600" />}
          {p.priorite && <Badge label={`Priorité ${p.priorite}`} bg="bg-amber-100" text="text-amber-700" />}
          {/* Work Program : « si le projet n'est pas associé au Work Program
              (WP = Non), l'affichage doit automatiquement indiquer Hors Work
              Program » (22/08/2026). Rien n'était affiché dans ce cas — on ne
              savait pas si la ligne était hors WP ou si l'information manquait,
              ce que le troisième cas (`wp` absent) laisse justement de côté. */}
          {p.wp === 'OUI' ? (
            <Badge label="Work Program" bg="bg-accent/15" text="text-accent" />
          ) : (
            p.wp === 'NON' && <Badge label="Hors Work Program" bg="bg-gray-100" text="text-gray-600" />
          )}
          {p.anneeBu != null && <Badge label={`BU ${p.anneeBu}`} bg="bg-gray-100" text="text-gray-600" />}
        </div>

        <section>
          <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">Fiche projet</h4>
          <div className="rounded-xl border border-gray-100 bg-gray-50/70 p-4 flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <LiaisonBadge resolution={resolution} nomProjet={projetLie?.nom} />
              <p className="text-xs text-gray-500 mt-1.5">
                {resolution
                  ? `Rapproché par ${METHODE_LIAISON_LABELS[resolution.methode]} (${resolution.cleValeur})`
                  : "Aucune fiche projet ne correspond à cette ligne — sans elle, phase, type, engagement et facturé restent vides. La colonne « Fiche projet » du tableau permet d'en créer une."}
              </p>
            </div>
            {/* Plus de création depuis ce détail (22/08/2026, demande
                explicite : « je constate qu'il est possible de créer une fiche
                projet depuis cet écran ; or cette fonctionnalité ne semble pas
                pertinente, étant donné que nous sommes déjà dans une fiche
                projet ; il serait préférable de permettre uniquement la
                consultation et la modification »). La création reste offerte
                là où elle a un sens : la colonne « Fiche projet » du tableau,
                et le bouton « Nouveau projet » de la page. */}
            {projetLie && (
              <Button variant="ghost" size="sm" onClick={() => onOpenProject?.(projetLie.id)}>
                Ouvrir la fiche
                <ArrowUpRight className="w-3.5 h-3.5 ml-1.5" />
              </Button>
            )}
          </div>
        </section>

        <Section titre="Planning">
          <Champ label="Date début">{p.dateDebut ? formatDate(p.dateDebut) : RIEN}</Champ>
          <Champ label="Date fin">{p.dateFin ? formatDate(p.dateFin) : RIEN}</Champ>
          <Champ label="Durée">{duree != null ? `${duree} j` : RIEN}</Champ>
          <Champ label="Phase en cours">
            {(() => {
              if (!projetLie) return RIEN
              const phases = phasesEnCours(projetLie.planning.reel)
              if (phases.length === 0) return RIEN
              return phases.map(({ phase, avancement: pct }) => (
                <span key={phase} className="block whitespace-nowrap">
                  {phase} <span className="text-gray-400 tabular-nums">({pct} %)</span>
                </span>
              ))
            })()}
          </Champ>
          <Champ label={projetLie ? 'Avancement (planning lié)' : 'Avancement (saisi)'}>
            <BarreProgression valeur={avancement} />
          </Champ>
          <Champ label="Réception scopes">
            <PastilleIndicateur valeur={p.receptionScopes} quoi="scopes" />
          </Champ>
        </Section>

        <Section titre="Budget & engagement">
          {/* Les valeurs **calculées** de la ligne, pas les champs bruts :
              elles sont relues sur la ligne navette rattachée quand il y en a
              une, et suivent le cycle PDC choisi. Lire `p.bu26ServKusd` et
              `p.pdc02_2026_kusd` ici faisait diverger la modale du tableau
              qui l'ouvre, dès qu'une révision était validée (21/08/2026). */}
          <Champ label="BU initial">
            <span title={suitLaNavette ? 'Repris de la ligne navette liée' : 'Valeur du classeur importé'}>
              {buKusd != null ? formatMontant(buKusd, 'KUSD') : RIEN}
            </span>
          </Champ>
          <Champ label={CYCLE_BUDGET_LABELS[cyclePdc]}>
            {pdcKusd != null ? formatMontant(pdcKusd, 'KUSD') : RIEN}
          </Champ>
          <Champ label="Estimation">{p.estimationKusd != null ? formatMontant(p.estimationKusd, 'KUSD') : RIEN}</Champ>
          <Champ label={projetLie ? 'Engagement (commandes liées)' : 'Engagement (montant PO saisi)'}>
            {engagementKusd != null
              ? formatMontant(engagementKusd, 'KUSD')
              : p.montantPO != null
                ? formatMontant(p.montantPO, 'KUSD')
                : RIEN}
          </Champ>
          <Champ label="Facturé">{factureKusd != null ? formatMontant(factureKusd, 'KUSD') : RIEN}</Champ>
          <Champ label="Écart engagement / estimation">
            {ecartEstimation != null ? (
              <span className={ecartEstimation > 0 ? 'text-red-600 font-semibold' : 'text-emerald-700 font-semibold'}>
                {ecartEstimation > 0 ? '+' : ''}
                {formatMontant(ecartEstimation, 'KUSD')}
              </span>
            ) : (
              RIEN
            )}
          </Champ>
          <Champ label="Taux d'engagement">
            <BarreProgression valeur={tauxEngagement != null ? tauxEngagement * 100 : null} ton="primary" />
            <select
              value={referenceEngagement}
              onChange={(e) => setReferenceEngagement(e.target.value as ReferenceEngagement)}
              aria-label="Budget de référence du taux d'engagement"
              className="mt-1 w-full text-xs text-gray-500 bg-transparent border-0 p-0 focus:ring-0 cursor-pointer"
            >
              <option value="bu">sur le BU initial</option>
              <option value="pdc">sur {CYCLE_BUDGET_LABELS[cyclePdc]}</option>
            </select>
            {tauxEngagement === null && budgetReference == null && (
              <p className="text-xs text-gray-400">Budget de référence non renseigné.</p>
            )}
          </Champ>
          <Champ label="Taux de facturation">
            <BarreProgression valeur={tauxFacturation != null ? tauxFacturation * 100 : null} ton="emerald" />
            <p className="text-xs text-gray-400 mt-1">facturé / commandes</p>
          </Champ>
          <Champ label="Type de projet">{projetLie ? TYPE_LABELS[projetLie.type] : RIEN}</Champ>
        </Section>

        <Section titre="Références">
          <Champ label="Code OTP">
            {p.otp ? <span className="font-mono text-xs">{p.otp}</span> : RIEN}
          </Champ>
          <Champ label="Compte d'imputation">
            {p.compteImputation ? <span className="font-mono text-xs">{p.compteImputation}</span> : RIEN}
          </Champ>
          <Champ label="N° PO">
            {p.numeroPO ? <span className="font-mono text-xs">{p.numeroPO}</span> : RIEN}
          </Champ>
          <Champ label="Commandes de la fiche">
            {projetLie ? `${projetLie.commandes.length}` : RIEN}
          </Champ>
          <Champ label="Ligne navette d'origine">{p.ligneNavetteId ? 'Oui' : RIEN}</Champ>
          <Champ label="Flag">
            <PastilleIndicateur valeur={p.flag} quoi="flag" />
          </Champ>
        </Section>

        <section>
          <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">Commentaires</h4>
          <p className="text-sm text-gray-800 rounded-xl border border-gray-100 bg-gray-50/70 p-4 whitespace-pre-wrap">
            {p.commentaires || 'Aucun commentaire.'}
          </p>
        </section>

        {isAdmin && (
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" size="sm" className="text-red-600 border-red-200 hover:bg-red-50" onClick={onSupprimer}>
              <Trash2 className="w-3.5 h-3.5 mr-1.5" />
              Supprimer
            </Button>
            <Button size="sm" onClick={onModifier}>
              <Pencil className="w-3.5 h-3.5 mr-1.5" />
              Modifier
            </Button>
          </div>
        )}
      </div>
    </Modal>
  )
}
