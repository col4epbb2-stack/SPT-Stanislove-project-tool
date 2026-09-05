import { Pencil, Trash2 } from 'lucide-react'
import type { ColonneTableau } from '../ui/TableauColonnes'
import { syntheseCommentairesMetal, type AffaireMetal, type AvancementMetal } from '../../types/travauxMetal'
import type { Resolveur } from '../../lib/liaison'
import { clesAffaireMetal } from '../../lib/liaisonCles'
import { LiaisonBadge } from '../liaison/LiaisonBadge'
import { formatNombre, formatPercent } from '../../lib/format'
import {
  avancementGeneralPrev,
  avancementGeneralReel,
  checkCfp,
  checkCft,
  checkDfa,
  dureePlanning,
  dureeProjet,
  dureeTraitementDemande,
  statutAutomatique,
  statutCorrige,
} from '../../lib/travauxMetalEngine'
import type { FormateurMontant } from '../../lib/montantAffiche'

// Colonnes de la feuille "Travaux METAL" (42 colonnes + la colonne d'édition),
// décrites une seule fois (06/08/2026) — même principe que
// components/tonnage/colonnes.tsx : l'en-tête et les valeurs étaient deux murs
// de JSX à tenir dans le même ordre à la main. Toutes les colonnes calculées
// (statut corrigé, durées, checks CFP/CFT, avancements généraux) passent par
// lib/travauxMetalEngine.ts : dans le classeur source elles sont cassées en
// #REF!, elles sont donc toujours recalculées ici, jamais reprises figées.

const texte = (v: string | null | undefined) => v ?? '—'

// Un avancement de phase vaut un ratio, "NA" (non applicable) ou vide.
export function formatAvancement(v: AvancementMetal): string {
  if (typeof v === 'number') return formatPercent(v)
  return v ?? '—'
}

export function colonnesAffairesMetal({
  resolveur,
  onEditer,
  onSupprimer,
  m,
}: {
  resolveur: Resolveur
  onEditer: (affaire: AffaireMetal) => void
  // Suppression (04/09/2026, demande explicite). Ligne saisie seulement
  // (`id` en chaîne) — une affaire restée pure import n'a aucun document à
  // supprimer.
  onSupprimer: (affaire: AffaireMetal) => void
  /** Formatage des montants dans la devise du système (19/08/2026). */
  m: FormateurMontant
}): ColonneTableau<AffaireMetal>[] {
  return [
    {
      cle: 'editer',
      entete: '',
      valeur: (a) => (
        <button
          type="button"
          onClick={() => onEditer(a)}
          className="p-1.5 rounded-lg text-gray-400 hover:text-primary hover:bg-primary/5"
          title="Modifier cette affaire"
        >
          <Pencil className="w-3.5 h-3.5" />
        </button>
      ),
    },
    {
      cle: 'affaire',
      entete: 'Affaire',
      valeur: (a) => texte(a.affaire),
      classeCellule: 'font-medium text-gray-900 max-w-72 truncate',
      titre: (a) => a.affaire ?? undefined,
    },
    {
      cle: 'liaison',
      entete: 'Liaison',
      valeur: (a) => {
        const resolution = resolveur.resoudre('travaux-metal', clesAffaireMetal(a))
        return (
          <LiaisonBadge
            resolution={resolution}
            nomProjet={resolution ? resolveur.projetParId(resolution.projetId)?.nom : undefined}
          />
        )
      },
    },
    { cle: 'typeCoreCrew', entete: 'Type de Core crew', valeur: (a) => texte(a.typeCoreCrew) },
    { cle: 'typeAvis', entete: "Type d'avis", valeur: (a) => texte(a.typeAvis) },
    { cle: 'priorite', entete: 'Priorité', valeur: (a) => texte(a.priorite) },
    { cle: 'po', entete: 'PO', valeur: (a) => texte(a.po) },
    { cle: 'ot', entete: 'OT', valeur: (a) => texte(a.ot) },
    { cle: 'avis', entete: 'Avis', valeur: (a) => texte(a.avis) },
    { cle: 'champ', entete: 'Champ', valeur: (a) => texte(a.champ) },
    { cle: 'plateforme', entete: 'Plateforme', valeur: (a) => texte(a.plateforme) },
    { cle: 'risques', entete: 'Risques', valeur: (a) => texte(a.risques) },
    { cle: 'typeTravaux', entete: 'Type de travaux', valeur: (a) => texte(a.typeTravaux) },
    { cle: 'statutTravaux', entete: 'Statut travaux', valeur: (a) => texte(a.statutTravaux) },
    { cle: 'statutCorrige', entete: 'Statut corrigé', valeur: (a) => statutCorrige(a) || '—' },
    { cle: 'dateDemande', entete: 'Date demande', valeur: (a) => texte(a.dateDemande) },
    { cle: 'dateDebutPlanning', entete: 'Début planning', valeur: (a) => texte(a.dateDebutPlanning) },
    { cle: 'dateFinPlanningPrev', entete: 'Fin prév.', valeur: (a) => texte(a.dateFinPlanningPrev) },
    { cle: 'dateDebutReel', entete: 'Début réel', valeur: (a) => texte(a.dateDebutReel) },
    { cle: 'dateFinReel', entete: 'Fin réelle', valeur: (a) => texte(a.dateFinReel) },
    {
      cle: 'dureeTraitement',
      entete: 'Durée traitement demande (j)',
      align: 'right',
      valeur: (a) => formatNombre(dureeTraitementDemande(a)),
    },
    { cle: 'dureeProjet', entete: 'Durée projet (j)', align: 'right', valeur: (a) => formatNombre(dureeProjet(a)) },
    {
      cle: 'dureePlanning',
      entete: 'Durée planning (j)',
      align: 'right',
      valeur: (a) => formatNombre(dureePlanning(a)),
    },
    { cle: 'etude', entete: 'Étude', align: 'right', valeur: (a) => formatAvancement(a.avancementEtude) },
    { cle: 'dureeMto', entete: 'Durée MTO', align: 'right', valeur: (a) => formatAvancement(a.dureeMto) },
    { cle: 'tempsMisMto', entete: 'Temps mis MTO', align: 'right', valeur: (a) => formatAvancement(a.tempsMisMto) },
    { cle: 'prevMto', entete: 'Prév. MTO', align: 'right', valeur: (a) => formatAvancement(a.avancementPrevMto) },
    {
      cle: 'fourniture',
      entete: 'Fourniture',
      align: 'right',
      valeur: (a) => formatAvancement(a.avancementFourniture),
    },
    { cle: 'prefab', entete: 'Préfab', align: 'right', valeur: (a) => formatAvancement(a.avancementPrefab) },
    { cle: 'pctReparation', entete: '% réparation', align: 'right', valeur: (a) => formatAvancement(a.pctReparation) },
    {
      cle: 'travauxSite',
      entete: 'Tvx sur site',
      align: 'right',
      valeur: (a) => formatAvancement(a.avancementTravauxSite),
    },
    { cle: 'cfp', entete: 'CFP', valeur: (a) => texte(a.cfpApplicable) },
    { cle: 'cfpDate', entete: 'Date CFP', valeur: (a) => texte(a.cfpDate) },
    { cle: 'checkCfp', entete: 'Check CFP', valeur: (a) => checkCfp(a) },
    { cle: 'cft', entete: 'CFT', valeur: (a) => texte(a.cftApplicable) },
    { cle: 'cftDate', entete: 'Date CFT', valeur: (a) => texte(a.cftDate) },
    { cle: 'checkCft', entete: 'Check CFT', valeur: (a) => checkCft(a) },
    { cle: 'dfa', entete: 'DFA', valeur: (a) => texte(a.dfa) },
    { cle: 'dfaDate', entete: 'Date DFA', valeur: (a) => texte(a.dfaDate) },
    { cle: 'checkDfa', entete: 'Check DFA', valeur: (a) => checkDfa(a) },
    {
      cle: 'avctPrev',
      entete: 'Avct général prév.',
      align: 'right',
      // "NA" plutôt que "—" : la formule du classeur renvoie NA quand les
      // dates de planning manquent, ce n'est pas une valeur absente.
      valeur: (a) => {
        const prev = avancementGeneralPrev(a)
        return prev != null ? formatPercent(prev) : 'NA'
      },
    },
    {
      cle: 'avctReel',
      entete: 'Avct général réel',
      align: 'right',
      valeur: (a) => {
        const reel = avancementGeneralReel(a)
        return reel != null ? formatPercent(reel) : '—'
      },
    },
    {
      cle: 'coutReel',
      // La colonne du classeur METAL est en francs CFA ; l'en-tête suit la
      // devise du système, comme les valeurs.
      entete: `Coût réel (${m.uniteAffichee('XAF')})`,
      align: 'right',
      valeur: (a) => m.montant(a.coutReel, 'XAF'),
    },
    {
      cle: 'statut',
      entete: 'Statut',
      // Toujours recalculé (04/09/2026, lot 3, MET-42→45) plutôt que lu sur
      // `a.statut` : même principe que les durées et checks CFP/CFT ci-dessus
      // — une valeur figée avant ce lot (ou modifiée hors de l'application)
      // ne doit jamais s'afficher comme si elle faisait encore foi.
      valeur: (a) => {
        const s = statutAutomatique(a)
        return (
          <span
            className={`text-xs px-2 py-0.5 rounded-full ${
              s === 'CLOSED' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
            }`}
          >
            {s}
          </span>
        )
      },
    },
    {
      // Synthèse de tous les commentaires par étape (04/09/2026, lot 4,
      // MET-26/27) — plus le seul champ `commentaire` de l'étape Coût &
      // statut.
      cle: 'commentaire',
      entete: 'Commentaire',
      valeur: (a) => texte(syntheseCommentairesMetal(a) || null),
      classeCellule: 'max-w-56 truncate',
      titre: (a) => syntheseCommentairesMetal(a) || undefined,
    },
    {
      cle: 'supprimer',
      entete: '',
      valeur: (a) =>
        typeof a.id === 'string' ? (
          <button
            type="button"
            onClick={() => onSupprimer(a)}
            className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50"
            title="Supprimer cette saisie"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        ) : null,
    },
  ]
}
