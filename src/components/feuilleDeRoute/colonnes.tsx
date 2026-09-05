import type { ReactNode } from 'react'
import { Badge } from '../ui/Badge'
import { BarreProgression } from '../ui/TuileKpi'
import { LiaisonBadge } from '../liaison/LiaisonBadge'
import type { ProjetFeuilleDeRoute } from '../../types/feuilleDeRoute'
import { libelleIndicateur } from '../../types/feuilleDeRoute'
import { PastilleIndicateur } from './PastilleIndicateur'
import type { Projet } from '../../types/project'
import { TYPE_LABELS, avancementGlobal, totalCommandes, totalFacturesProjet } from '../../types/project'
import {
  CYCLES_ARBITRABLES,
  CYCLE_BUDGET_LABELS,
  tauxPour,
  totalBudget,
  type CycleBudgetId,
  type LigneNavette,
  type TauxChange,
} from '../../types/navette'
import { FACTEUR_ECHELLE } from '../../types/devise'
import type { Resolution } from '../../types/liaison'
import type { Resolveur } from '../../lib/liaison'
import { clesFeuilleDeRoute } from '../../lib/liaisonCles'
import { formatDate } from '../../lib/format'
import { phasesEnCours } from '../../lib/planning'
import type { GroupeAffichage, PresetAffichage } from '../ui/SelecteurAffichage'

// Les 22 colonnes de la feuille de route, décrites une fois : l'en-tête, le
// pied et les cellules se déduisent de cette liste, et l'utilisateur peut
// n'en afficher qu'une partie (SelecteurAffichage). Avant, en-tête et corps
// étaient deux murs de balises à garder synchronisés à la main — le colSpan
// de la ligne « aucun résultat » était d'ailleurs compté à la main.

export const STATUT_COLORS: Record<string, { bg: string; text: string }> = {
  'En cours': { bg: 'bg-blue-100', text: 'text-blue-700' },
  Terminé: { bg: 'bg-green-100', text: 'text-green-700' },
  Annulé: { bg: 'bg-red-100', text: 'text-red-700' },
  Reporté: { bg: 'bg-amber-100', text: 'text-amber-700' },
}

// `p.projetId` (posé par la synchronisation Navette ou par la création de
// fiche ci-dessous) est un lien explicite, prioritaire sur la cascade de
// résolution floue de `resolveur.resoudre()` — qui ne connaît que
// otp/avis/ot/po/nom et ignore ce champ (cf. lib/liaison.ts). Sans cette
// priorité, une ligne liée à la main via une fiche projet sans code OTP ne
// se résoudrait jamais.
export function resoudreLiaison(resolveur: Resolveur, p: ProjetFeuilleDeRoute): Resolution | null {
  if (p.projetId) return { projetId: p.projetId, methode: 'manuel', cleValeur: p.projetId }
  return resolveur.resoudre('feuille-de-route', clesFeuilleDeRoute(p))
}

// Tout ce qu'une ligne du tableau sait d'elle-même : les valeurs dérivées de
// la fiche projet liée sont calculées une fois par ligne, pas une fois par
// cellule.
export interface LigneFdr {
  p: ProjetFeuilleDeRoute
  resolution: Resolution | null
  projetLie: Projet | undefined
  avancement: number | null
  engagementKusd: number | null
  factureKusd: number | null
  // BU et PDC relus sur la ligne navette d'origine quand elle existe (cf.
  // calculerLigne) — `null` si la donnée manque des deux côtés.
  buKusd: number | null
  pdcKusd: number | null
  /** Cycle PDC dont `pdcKusd` porte la valeur — c'est lui qui titre la colonne. */
  cyclePdc: CycleBudgetId
  /** La ligne navette liée existe : BU et PDC viennent d'elle, pas de la saisie. */
  suitLaNavette: boolean
  /**
   * OPEX / CAPEX. La **ligne navette liée fait foi** (c'est elle qui porte la
   * rubrique dans le modèle), la valeur saisie sur la ligne de feuille de
   * route ne sert qu'à défaut — sans quoi les deux modules pourraient se
   * contredire sur la même affaire.
   */
  rubrique: string | null
}

export function calculerLigne(
  p: ProjetFeuilleDeRoute,
  resolveur: Resolveur,
  tauxChange?: TauxChange | null,
  lignesNavette: LigneNavette[] = [],
  // Cycle PDC affiché par la colonne « PDC » (21/08/2026) : il était figé sur
  // PDC02 — « l'utilisateur devrait pouvoir choisir la PDC qu'il souhaite voir
  // apparaître dans le tableau ».
  cyclePdc: CycleBudgetId = 'PDC02'
): LigneFdr {
  const resolution = resoudreLiaison(resolveur, p)
  const projetLie = resolution ? resolveur.projetParId(resolution.projetId) : undefined
  // Commande.montant est dans la devise du projet (USD/EUR/XAF) **et à
  // l'unité** — les colonnes de cette feuille, elles, sont en milliers
  // (`unite: 'KUSD'`). La conversion de devise ne suffit donc pas : il faut
  // aussi diviser par 1 000.
  //
  // **Défaut corrigé le 21/08/2026** : seul le taux était appliqué, ce qui
  // rendait l'engagement et le facturé de toute ligne rattachée à une fiche
  // **1 000 fois trop grands** (500 000 USD de commandes s'affichaient
  // « 500 000 KUSD », soit 500 millions). Invisible tant que rien n'était
  // rattaché ; sorti au grand jour en remettant les unités d'accord.
  const facteurDevise = (projetLie ? tauxPour(projetLie.devise, tauxChange) : 1) / FACTEUR_ECHELLE.millier
  // BU et PDC02 étaient copiés sur la ligne feuille de route au moment où on
  // la rattachait à la navette (synchroniserDepuisNavette) et plus jamais
  // ensuite : une révision validée après coup laissait ici l'ancien montant,
  // sans que rien ne le signale. Ils sont désormais relus sur la ligne
  // navette d'origine — lien direct par `ligneNavetteId`, pas de résolution
  // floue. Les 84 lignes importées, qui n'ont pas de ligne navette, gardent
  // la valeur du classeur.
  const ligneNavette = p.ligneNavetteId ? lignesNavette.find((l) => l.id === p.ligneNavetteId) : undefined
  // Les cycles d'une ligne navette sont comptés dans **sa** devise : une ligne
  // libellée en euros alimentait ces colonnes en KEUR sous un en-tête KUSD
  // (corrigé le 21/08/2026, même passe que l'engagement ci-dessus). L'échelle,
  // elle, concorde déjà — cycles et colonnes comptent en milliers.
  const facteurNavette = ligneNavette ? tauxPour(ligneNavette.devise, tauxChange) : 1

  return {
    p,
    resolution,
    projetLie,
    avancement: projetLie ? avancementGlobal(projetLie) : p.avancementReel,
    engagementKusd: projetLie ? totalCommandes(projetLie) * facteurDevise : null,
    factureKusd: projetLie ? totalFacturesProjet(projetLie) * facteurDevise : null,
    buKusd: ligneNavette ? ligneNavette.cycles.BU.serv * facteurNavette : p.bu26ServKusd,
    // Sans ligne navette, la seule valeur connue est celle du classeur, et
    // c'est **explicitement le PDC02-2026** : la resservir sous un autre cycle
    // ferait passer un chiffre pour ce qu'il n'est pas.
    pdcKusd: ligneNavette
      ? totalBudget(ligneNavette.cycles[cyclePdc]) * facteurNavette
      : cyclePdc === 'PDC02'
        ? p.pdc02_2026_kusd
        : null,
    cyclePdc,
    suitLaNavette: !!ligneNavette,
    rubrique: ligneNavette?.rubriqueNiv1 ?? p.rubrique ?? null,
  }
}

/**
 * Les 4 révisions PDC d'une ligne rattachée à la navette, dans la devise de
 * cette ligne ramenée au pivot — mêmes montants que la colonne « PDC », pour
 * les 4 cycles à la fois (22/08/2026, demande explicite : « il serait
 * préférable de permettre à l'utilisateur de sélectionner la version de PDC
 * qu'il souhaite consulter ou mettre en avant à l'aide d'un menu déroulant »).
 *
 * `null` quand la ligne n'a pas de ligne navette : le classeur ne porte alors
 * qu'une seule colonne, explicitement le PDC02-2026, et il n'y a rien à
 * choisir. Même règle que `calculerLigne`, qui refuse de resservir cette
 * valeur sous un autre cycle.
 */
export function montantsPdcNavette(
  p: ProjetFeuilleDeRoute,
  lignesNavette: LigneNavette[],
  tauxChange?: TauxChange | null
): Record<string, number> | null {
  const ligneNavette = p.ligneNavetteId ? lignesNavette.find((l) => l.id === p.ligneNavetteId) : undefined
  if (!ligneNavette) return null
  const facteur = tauxPour(ligneNavette.devise, tauxChange)
  return Object.fromEntries(
    CYCLES_ARBITRABLES.map((cycle) => [cycle, totalBudget(ligneNavette.cycles[cycle]) * facteur])
  )
}

export interface ActionsFdr {
  isAdmin: boolean
  /**
   * Formatage d'un montant dans la devise du système (19/08/2026). Ces
   * définitions de colonnes ne sont pas des composants : elles ne peuvent pas
   * appeler `useMontant()` elles-mêmes, la page le fait et le passe ici — au
   * même titre que les actions dont chaque cellule a besoin.
   */
  montant: (valeur: number | null | undefined, unite: string) => string
  onDetail: (p: ProjetFeuilleDeRoute) => void
  onCreerFiche: (p: ProjetFeuilleDeRoute) => void
  onOpenProject?: (projetId: string) => void
}

export interface ColonneFdr {
  id: string
  entete: string
  /**
   * Unité d'enregistrement des valeurs de cette colonne (« KUSD »). L'en-tête
   * n'écrit plus l'unité en dur : elle est ajoutée par la page dans la devise
   * du système, sans quoi un tableau converti garderait des titres « KUSD »
   * au-dessus de chiffres qui n'en sont plus.
   */
  unite?: string
  aligne?: 'droite'
  rendu: (l: LigneFdr, a: ActionsFdr) => ReactNode
  /**
   * Texte à extraire quand le rendu ne s'y prête pas — une cellule qui porte
   * une action affiche son libellé (« Modifier la fiche »), qui n'a rien à
   * faire dans un fichier. Même échappatoire que `ColonneTableau.texte`.
   */
  texte?: (l: LigneFdr) => string
}

const tiret = <span className="text-gray-300">—</span>

// Colonne d'identification : figée à gauche pendant le défilement horizontal
// (22 colonnes) et jamais masquable — c'est elle qui dit de quel projet parle
// la ligne.
//
// **L'œil a été retiré le 22/08/2026** (demande explicite) : la ligne entière
// ouvre déjà le détail au clic, l'icône faisait double emploi et mangeait de
// la largeur dans la seule colonne figée. C'est donc le **nom du projet** qui
// devient le bouton — un `<tr onClick>` n'est pas atteignable au clavier, et
// l'œil était jusqu'ici le seul point focalisable de la ligne : le supprimer
// sans le remplacer aurait rendu le détail inaccessible autrement qu'à la
// souris.
export const COLONNE_IDENTITE: ColonneFdr = {
  id: 'projet',
  entete: 'Feuille de route ICP',
  texte: ({ p }) => p.projet,
  rendu: ({ p }, a) => (
    <button
      onClick={(e) => {
        e.stopPropagation()
        a.onDetail(p)
      }}
      title="Voir le détail de la ligne"
      className="min-w-0 text-left rounded-lg -mx-1 px-1 py-0.5 hover:text-primary transition-colors"
    >
      <span className="block font-medium text-gray-900 truncate max-w-64">{p.projet}</span>
      {p.serviceLeader && <span className="block text-xs text-gray-400">{p.serviceLeader}</span>}
    </button>
  ),
}

/**
 * FLAG — **première colonne du tableau** depuis le 23/08/2026 (demande
 * explicite), donc rendue à part par la page, avant même la colonne
 * d'identité : c'est le repère d'état de la ligne, il ouvre la ligne.
 *
 * Elle reste dans `COLONNES_FDR` pour que le sélecteur de colonnes et les
 * préréglages continuent de la commander — la page la retire simplement des
 * colonnes défilantes pour l'afficher en tête.
 */
export const COLONNE_FLAG: ColonneFdr = {
  id: 'flag',
  entete: 'Flag',
  // Le rendu est une icône : sans `texte`, l'extraction sortirait une cellule
  // vide (un ReactNode sans enfant textuel).
  texte: ({ p }) => libelleIndicateur(p.flag, 'flag'),
  rendu: ({ p }) => <PastilleIndicateur valeur={p.flag} quoi="flag" />,
}

export const COLONNES_FDR: ColonneFdr[] = [
  COLONNE_FLAG,
  {
    // « Création d'une fiche projet » jusqu'au 22/08/2026, retour explicite :
    // « nous sommes déjà dans la section Projet […] si l'objectif est de créer
    // une nouvelle fiche projet, cette fonctionnalité existe déjà via le bouton
    // Nouveau projet […] lorsque je clique sur le lien concerné, j'ai davantage
    // l'impression qu'il permet de modifier les informations de la fiche projet
    // existante ».
    //
    // La colonne fait bel et bien les deux, selon l'état de la ligne : elle
    // crée quand aucune fiche ne correspond (76 des 85 lignes aujourd'hui), et
    // ouvre la fiche à modifier quand une fiche est rapprochée. L'en-tête ne
    // peut pas varier d'une ligne à l'autre : il nomme donc l'objet de la
    // colonne, et c'est la **cellule** qui dit l'action — « Créer une fiche
    // projet » ou « Modifier la fiche ». Renommer sec en « Modification d'une
    // fiche projet » aurait déplacé l'incohérence signalée au lieu de la
    // lever, la majorité des lignes n'ayant pas de fiche.
    id: 'liaison',
    entete: 'Fiche projet',
    texte: ({ projetLie, resolution }) => (resolution ? (projetLie?.nom ?? 'Fiche liée') : ''),
    rendu: ({ p, resolution, projetLie }, a) =>
      resolution ? (
        // Le badge devient l'entrée de la modification : il n'était cliquable
        // nulle part, si bien qu'aucune cellule de cette colonne ne modifiait
        // quoi que ce soit — exactement ce que son intitulé promettait.
        <button
          onClick={(e) => {
            e.stopPropagation()
            a.onOpenProject?.(projetLie?.id ?? resolution.projetId)
          }}
          title={`Ouvrir la fiche « ${projetLie?.nom ?? '?'} » pour la modifier`}
          className="inline-flex items-center gap-1.5 group"
        >
          <LiaisonBadge resolution={resolution} nomProjet={projetLie?.nom} />
          <span className="text-xs font-semibold text-accent group-hover:underline whitespace-nowrap">
            Modifier la fiche
          </span>
        </button>
      ) : a.isAdmin ? (
        <button onClick={() => a.onCreerFiche(p)} className="text-xs font-semibold text-accent hover:underline">
          Créer une fiche projet
        </button>
      ) : (
        <span className="text-xs text-gray-300">Aucune fiche</span>
      ),
  },
  { id: 'categorie', entete: 'Catégorie', rendu: ({ p }) => p.categorie ?? tiret },
  {
    id: 'rubrique',
    entete: 'Rubrique',
    rendu: ({ rubrique, suitLaNavette }) =>
      rubrique ? (
        <Badge
          label={rubrique}
          bg={rubrique === 'CAPEX' ? 'bg-indigo-100' : 'bg-sky-100'}
          text={rubrique === 'CAPEX' ? 'text-indigo-700' : 'text-sky-700'}
        />
      ) : (
        <span title={suitLaNavette ? undefined : 'À renseigner, ou à reprendre en liant une ligne navette'}>{tiret}</span>
      ),
  },
  { id: 'champs', entete: 'Champs', rendu: ({ p }) => p.champs ?? tiret },
  { id: 'priorite', entete: 'Priorité', rendu: ({ p }) => p.priorite ?? tiret },
  {
    id: 'type',
    entete: 'Type de projet',
    rendu: ({ projetLie }) => (projetLie ? TYPE_LABELS[projetLie.type] : tiret),
  },
  {
    id: 'phase',
    entete: 'Phase en cours',
    // Reprise automatique de la fiche projet, comme le type juste au-dessus :
    // toutes les phases entamées et non terminées, avec leur avancement.
    rendu: ({ projetLie }) => {
      if (!projetLie) return tiret
      const phases = phasesEnCours(projetLie.planning.reel)
      if (phases.length === 0) return tiret
      return (
        <span className="flex flex-col">
          {phases.map(({ phase, avancement }) => (
            <span key={phase} className="whitespace-nowrap">
              {phase} <span className="text-gray-400 tabular-nums">({avancement} %)</span>
            </span>
          ))}
        </span>
      )
    },
  },
  {
    id: 'avancement',
    entete: 'Avancement',
    aligne: 'droite',
    rendu: ({ avancement, projetLie }) => (
      <div title={projetLie ? 'Depuis le planning du projet lié' : 'Saisi manuellement'}>
        <BarreProgression valeur={avancement} />
      </div>
    ),
  },
  { id: 'dateDebut', entete: 'Date début', rendu: ({ p }) => (p.dateDebut ? formatDate(p.dateDebut) : tiret) },
  { id: 'dateFin', entete: 'Date fin', rendu: ({ p }) => (p.dateFin ? formatDate(p.dateFin) : tiret) },
  {
    id: 'receptionScopes',
    entete: 'Réception scopes',
    // Pastille et non barre de progression (21/08/2026) : « il est important
    // de conserver les mêmes indicateurs visuels que ceux du fichier Excel ».
    // C'est le seul des deux indicateurs à garder la pastille du classeur : le
    // FLAG est passé au drapeau le 23/08/2026 (cf. `COLONNE_FLAG`).
    texte: ({ p }) => libelleIndicateur(p.receptionScopes, 'scopes'),
    rendu: ({ p }) => <PastilleIndicateur valeur={p.receptionScopes} quoi="scopes" />,
  },
  {
    id: 'otp',
    entete: 'OTP',
    rendu: ({ p }) => (p.otp ? <span className="font-mono text-xs">{p.otp}</span> : tiret),
  },
  {
    id: 'po',
    entete: 'PO',
    rendu: ({ p, projetLie }, a) =>
      projetLie ? (
        <button
          onClick={(e) => {
            e.stopPropagation()
            a.onOpenProject?.(projetLie.id)
          }}
          className="font-semibold text-accent hover:underline"
        >
          Voir ({projetLie.commandes.length})
        </button>
      ) : p.numeroPO ? (
        <span className="font-mono text-xs">{p.numeroPO}</span>
      ) : (
        tiret
      ),
  },
  {
    id: 'wp',
    entete: 'WP',
    rendu: ({ p }) =>
      p.wp ? (
        <Badge
          label={p.wp}
          bg={p.wp === 'OUI' ? 'bg-accent/15' : 'bg-gray-100'}
          text={p.wp === 'OUI' ? 'text-accent' : 'text-gray-500'}
        />
      ) : (
        tiret
      ),
  },
  // Les 5 colonnes de coût, dans l'ordre du document du 21/08/2026 : « BU
  // initiale (on commence par le BU), PDC, Estimation, Engagement, Factures
  // (on finit par les factures) ». Elles suivaient jusqu'ici l'ordre
  // d'ajout — engagement, facturé, estimation, puis BU et PDC bien plus loin,
  // après la colonne WP.
  {
    id: 'bu',
    entete: 'BU Initial',
    unite: 'KUSD',
    aligne: 'droite',
    rendu: ({ buKusd, suitLaNavette }, a) => (
      <span title={suitLaNavette ? 'Repris de la ligne navette liée' : 'Valeur du classeur importé'}>
        {buKusd != null ? a.montant(buKusd, 'KUSD') : tiret}
      </span>
    ),
  },
  {
    id: 'pdc',
    // L'en-tête porte le cycle réellement affiché : il se choisit désormais
    // dans la barre d'affichage, il ne peut plus être écrit en dur.
    entete: 'PDC',
    unite: 'KUSD',
    aligne: 'droite',
    rendu: ({ pdcKusd, cyclePdc, suitLaNavette }, a) => (
      <span
        title={
          suitLaNavette
            ? `${CYCLE_BUDGET_LABELS[cyclePdc]} — repris de la ligne navette liée`
            : cyclePdc === 'PDC02'
              ? 'Valeur du classeur importé (PDC02-2026)'
              : `Le classeur ne porte que le PDC02 : ${CYCLE_BUDGET_LABELS[cyclePdc]} n'est connu que par une ligne navette liée`
        }
      >
        {pdcKusd != null ? a.montant(pdcKusd, 'KUSD') : tiret}
      </span>
    ),
  },
  {
    id: 'estimation',
    entete: 'Estimation',
    unite: 'KUSD',
    aligne: 'droite',
    rendu: ({ p }, a) => (p.estimationKusd != null ? a.montant(p.estimationKusd, 'KUSD') : tiret),
  },
  {
    id: 'engagement',
    entete: 'Engagement',
    unite: 'KUSD',
    aligne: 'droite',
    rendu: ({ p, engagementKusd }, a) =>
      engagementKusd != null
        ? a.montant(engagementKusd, 'KUSD')
        : p.montantPO != null
          ? a.montant(p.montantPO, 'KUSD')
          : tiret,
  },
  {
    id: 'facture',
    entete: 'Facturé',
    unite: 'KUSD',
    aligne: 'droite',
    rendu: ({ factureKusd }, a) => (factureKusd != null ? a.montant(factureKusd, 'KUSD') : tiret),
  },
  { id: 'anneeBu', entete: 'Année BU', rendu: ({ p }) => p.anneeBu ?? tiret },
  {
    id: 'statut',
    entete: 'Statut',
    rendu: ({ p }) => {
      if (!p.statut) return tiret
      const colors = STATUT_COLORS[p.statut]
      return <Badge label={p.statut} bg={colors?.bg ?? 'bg-gray-100'} text={colors?.text ?? 'text-gray-600'} />
    },
  },
  {
    id: 'commentaire',
    entete: 'Commentaire',
    rendu: ({ p }) => (
      <span className="block max-w-xs truncate" title={p.commentaires ?? undefined}>
        {p.commentaires ?? tiret}
      </span>
    ),
  },
]

export const GROUPES_COLONNES_FDR: GroupeAffichage[] = [
  {
    titre: 'Identification',
    options: [
      { id: 'flag', label: 'Flag', indice: 'drapeau vert / orange / rouge du classeur' },
      { id: 'liaison', label: 'Fiche projet' },
      { id: 'serviceLeader', label: 'Service leader', indice: 'aussi sous le nom du projet' },
      { id: 'categorie', label: 'Catégorie' },
      { id: 'rubrique', label: 'Rubrique', indice: 'OPEX / CAPEX, repris de la navette' },
      { id: 'champs', label: 'Champs' },
      { id: 'priorite', label: 'Priorité' },
      { id: 'type', label: 'Type de projet' },
      { id: 'anneeBu', label: 'Année BU' },
      { id: 'statut', label: 'Statut' },
    ],
  },
  {
    titre: 'Planning',
    options: [
      { id: 'phase', label: 'Phase en cours' },
      { id: 'avancement', label: 'Avancement' },
      { id: 'dateDebut', label: 'Date début' },
      { id: 'dateFin', label: 'Date fin' },
      { id: 'receptionScopes', label: 'Réception scopes' },
    ],
  },
  {
    titre: 'Budget & engagement',
    options: [
      { id: 'otp', label: 'OTP' },
      { id: 'po', label: 'PO' },
      { id: 'wp', label: 'WP' },
      // Mêmes cinq colonnes, dans l'ordre où elles se lisent : BU → PDC →
      // Estimation → Engagement → Factures.
      { id: 'bu', label: 'BU Initial' },
      { id: 'pdc', label: 'PDC', indice: 'cycle au choix, ci-contre' },
      { id: 'estimation', label: 'Estimation' },
      { id: 'engagement', label: 'Engagement' },
      { id: 'facture', label: 'Facturé' },
    ],
  },
  { titre: 'Divers', options: [{ id: 'commentaire', label: 'Commentaire' }] },
]

export const COLONNES_FDR_DEFAUT = COLONNES_FDR.map((c) => c.id)

// Catalogue des colonnes connues — `usePreferenceSelection` le compare à celui
// enregistré sur le poste pour savoir quelles colonnes sont **nouvelles** et
// doivent donc apparaître. Sans lui, « Flag » et « Rubrique », ajoutées le
// 21/08/2026, ne seraient jamais visibles chez qui a déjà ouvert l'écran.
//
// Le type est écrit explicitement : un `const` en majuscules initialisé par un
// simple identifiant est pris pour un composant par
// `react-refresh/only-export-components`, qui fait alors échouer le lint sur
// tous les autres exports du fichier.
export const CATALOGUE_COLONNES_FDR: string[] = COLONNES_FDR.map((c) => c.id)

export const PRESETS_COLONNES_FDR: PresetAffichage[] = [
  {
    label: 'Essentiel',
    ids: ['flag', 'liaison', 'statut', 'avancement', 'dateDebut', 'dateFin', 'engagement', 'facture'],
  },
  {
    label: 'Planning',
    ids: ['flag', 'liaison', 'phase', 'avancement', 'dateDebut', 'dateFin', 'receptionScopes', 'statut'],
  },
  {
    label: 'Budget',
    ids: ['liaison', 'rubrique', 'otp', 'po', 'wp', 'bu', 'pdc', 'estimation', 'engagement', 'facture'],
  },
  { label: 'Tout', ids: COLONNES_FDR_DEFAUT },
]
