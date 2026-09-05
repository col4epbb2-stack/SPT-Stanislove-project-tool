import { Trash2 } from 'lucide-react'
import type { ColonneTableau } from '../ui/TableauColonnes'
import type { FactureGmi, LigneActiviteFacturation, TarifsFacturationPoint } from '../../types/facturationPoint'
import { formatNombre } from '../../lib/format'
import {
  anneeActivite,
  anneeFacture,
  coeffAssistance,
  coeffLieu,
  coeffNuitDepose,
  coeffNuitPose,
  coeffSuspendu,
  coutDuPointLocation,
  coutLocation,
  coutPoseDepose,
  coutRegie,
  coutTotalActivite,
  equationActivite,
  hauteurRetraitee,
  joursPlus30,
  m3Activite,
  m3Jours,
  montantDepose,
  montantNdc,
  montantPose,
  nbJoursFactures,
  nombrePoints,
  nombrePointsLocation,
  numeroFacture,
  periodeActivite,
  surfaceActivite,
  tarifPoint,
} from '../../lib/facturationPointEngine'
import type { FormateurMontant } from '../../lib/montantAffiche'

// Colonnes des feuilles "SUIVI DES ACTIVITES" (52 colonnes) et "SUIVI DE
// FACTURATION" du classeur Facturation au point, décrites une seule fois —
// même motivation que components/tonnage/colonnes.tsx : l'en-tête et les
// valeurs étaient deux murs de JSX à tenir synchronisés à la main, au point
// que le `colSpan` de la ligne "aucun résultat" avait déjà divergé du nombre
// réel de colonnes. Tout ce qui n'est pas une colonne saisie est calculé par
// lib/facturationPointEngine.ts (0 écart sur les 415 lignes du classeur).

const texte = (v: string | null | undefined) => v ?? '—'

export function colonnesActivites(
  tarifs: TarifsFacturationPoint,
  /** Formatage des montants dans la devise du système (19/08/2026). */
  m: FormateurMontant,
  // Suppression (04/09/2026, demande explicite). Ligne saisie seulement
  // (`id` en chaîne) — une ligne restée pure import n'a aucun document à
  // supprimer.
  onSupprimer?: (ligne: LigneActiviteFacturation) => void
): ColonneTableau<LigneActiviteFacturation>[] {
  return [
    {
      cle: 'projet',
      entete: 'Projet',
      valeur: (l) => texte(l.projet),
      classeCellule: 'whitespace-nowrap font-medium text-gray-900',
    },
    { cle: 'numeroDemande', entete: 'N° demande', valeur: (l) => texte(l.numeroDemande) },
    { cle: 'division', entete: 'Division', valeur: (l) => texte(l.division) },
    { cle: 'service', entete: 'Service', valeur: (l) => texte(l.service) },
    { cle: 'site', entete: 'Site', valeur: (l) => texte(l.site) },
    { cle: 'plateforme', entete: 'Plateforme', valeur: (l) => texte(l.plateforme) },
    { cle: 'imputation', entete: 'Imputation', valeur: (l) => texte(l.imputation) },
    { cle: 'longueur', entete: 'Longueur', align: 'right', valeur: (l) => formatNombre(l.longueur, 2) },
    { cle: 'largeur', entete: 'Largeur', align: 'right', valeur: (l) => formatNombre(l.largeur, 2) },
    { cle: 'surface', entete: 'Surface', align: 'right', valeur: (l) => formatNombre(surfaceActivite(l), 2) },
    { cle: 'hauteur', entete: 'Hauteur', align: 'right', valeur: (l) => formatNombre(l.hauteur, 2) },
    { cle: 'm3', entete: 'M3', align: 'right', valeur: (l) => formatNombre(m3Activite(l), 2) },
    { cle: 'mois', entete: 'Mois', valeur: (l) => (l.mois ? l.mois.slice(0, 7) : '—') },
    { cle: 'du', entete: 'Facturation du', valeur: (l) => texte(l.du) },
    { cle: 'au', entete: '...au', valeur: (l) => texte(l.au) },
    { cle: 'nbJours', entete: 'Jours facturés', align: 'right', valeur: (l) => formatNombre(nbJoursFactures(l)) },
    { cle: 'm3Jours', entete: 'm3/j', align: 'right', valeur: (l) => formatNombre(m3Jours(l), 1) },
    { cle: 'suspendu', entete: 'Suspendu', valeur: (l) => texte(l.suspendu) },
    {
      cle: 'coeffSuspendu',
      entete: 'Point 1',
      align: 'right',
      valeur: (l) => formatNombre(coeffSuspendu(l, tarifs), 2),
    },
    { cle: 'assistance', entete: 'Assistance resp.', valeur: (l) => texte(l.assistance) },
    {
      cle: 'coeffAssistance',
      entete: 'Point 2',
      align: 'right',
      valeur: (l) => formatNombre(coeffAssistance(l, tarifs), 2),
    },
    { cle: 'lieu', entete: 'Lieu', valeur: (l) => texte(l.lieu) },
    { cle: 'coeffLieu', entete: 'Coeff', align: 'right', valeur: (l) => formatNombre(coeffLieu(l, tarifs), 2) },
    { cle: 'tarifPoint', entete: 'Tarif', align: 'right', valeur: (l) => formatNombre(tarifPoint(l, tarifs)) },
    {
      cle: 'chefEquipeHeures',
      entete: "Chef d'équipe (h)",
      align: 'right',
      valeur: (l) => formatNombre(l.chefEquipeHeures, 1),
    },
    {
      cle: 'coordinateurHeures',
      entete: 'Coordinateur (h)',
      align: 'right',
      valeur: (l) => formatNombre(l.coordinateurHeures, 1),
    },
    {
      cle: 'monteursHeures',
      entete: 'Monteurs (h)',
      align: 'right',
      valeur: (l) => formatNombre(l.monteursHeures, 1),
    },
    { cle: 'hauteurRetraitee', entete: 'H retraité', align: 'right', valeur: (l) => formatNombre(hauteurRetraitee(l)) },
    { cle: 'equation', entete: 'Équation', valeur: (l) => equationActivite(l, tarifs) ?? '—' },
    {
      cle: 'nombrePoints',
      entete: 'Points pose/dépose',
      align: 'right',
      valeur: (l) => formatNombre(nombrePoints(l, tarifs), 2),
    },
    {
      cle: 'coutPoseDepose',
      entete: `Coût pose/dépose (${m.uniteAffichee('XAF')})`,
      align: 'right',
      valeur: (l) => m.montant(coutPoseDepose(l, tarifs), 'XAF'),
    },
    { cle: 'pose', entete: 'Pose', valeur: (l) => texte(l.pose) },
    { cle: 'nuitPose', entete: 'Nuit/pose', valeur: (l) => texte(l.nuitPose) },
    {
      cle: 'coeffNuitPose',
      entete: 'Coeff nuit pose',
      align: 'right',
      valeur: (l) => formatNombre(coeffNuitPose(l, tarifs), 2),
    },
    { cle: 'montantPose', entete: 'Montant pose', align: 'right', valeur: (l) => formatNombre(montantPose(l, tarifs)) },
    { cle: 'depose', entete: 'Dépose', valeur: (l) => texte(l.depose) },
    { cle: 'nuitDepose', entete: 'Nuit/dépose', valeur: (l) => texte(l.nuitDepose) },
    {
      cle: 'coeffNuitDepose',
      entete: 'Coeff nuit dépose',
      align: 'right',
      valeur: (l) => formatNombre(coeffNuitDepose(l, tarifs), 2),
    },
    {
      cle: 'montantDepose',
      entete: 'Montant dépose',
      align: 'right',
      valeur: (l) => formatNombre(montantDepose(l, tarifs)),
    },
    { cle: 'ndc', entete: 'N.D.C', valeur: (l) => texte(l.ndc) },
    { cle: 'montantNdc', entete: 'Montant NDC', align: 'right', valeur: (l) => formatNombre(montantNdc(l, tarifs)) },
    { cle: 'joursMoins15', entete: '< 15 j', align: 'right', valeur: (l) => formatNombre(l.joursMoins15) },
    { cle: 'joursMoins30', entete: '< 30 j', align: 'right', valeur: (l) => formatNombre(l.joursMoins30) },
    { cle: 'joursPlus30', entete: '> 30 j', align: 'right', valeur: (l) => formatNombre(joursPlus30(l)) },
    {
      cle: 'pointsLocation',
      entete: 'Points location',
      align: 'right',
      valeur: (l) => formatNombre(nombrePointsLocation(l), 1),
    },
    {
      cle: 'coutDuPoint',
      entete: 'Coût du point',
      align: 'right',
      valeur: (l) => formatNombre(coutDuPointLocation(l, tarifs)),
    },
    {
      cle: 'coutLocation',
      entete: 'Coût location',
      align: 'right',
      valeur: (l) => formatNombre(coutLocation(l, tarifs)),
    },
    { cle: 'coutRegie', entete: 'Coût régie', align: 'right', valeur: (l) => formatNombre(coutRegie(l, tarifs)) },
    {
      cle: 'coutTotal',
      entete: 'Coût total à facturer',
      align: 'right',
      valeur: (l) => formatNombre(coutTotalActivite(l, tarifs)),
      classeCellule: 'whitespace-nowrap font-medium text-gray-900',
    },
    {
      cle: 'commentaires',
      entete: 'Commentaires',
      valeur: (l) => texte(l.commentaires),
      classeCellule: 'max-w-56 truncate',
      titre: (l) => l.commentaires ?? undefined,
    },
    { cle: 'periode', entete: 'Période', valeur: (l) => periodeActivite(l) ?? '—' },
    { cle: 'annee', entete: 'Année', align: 'right', valeur: (l) => formatNombre(anneeActivite(l)) },
    ...(onSupprimer
      ? [
          {
            cle: 'supprimer',
            entete: '',
            valeur: (l: LigneActiviteFacturation) =>
              typeof l.id === 'string' ? (
                <button
                  type="button"
                  onClick={() => onSupprimer(l)}
                  className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50"
                  title="Supprimer cette saisie"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              ) : null,
          } satisfies ColonneTableau<LigneActiviteFacturation>,
        ]
      : []),
  ]
}

export function colonnesFactures(): ColonneTableau<FactureGmi>[] {
  return [
    {
      cle: 'numero',
      entete: 'N°',
      valeur: (f) => numeroFacture(f.code, f.mois),
      classeCellule: 'whitespace-nowrap font-medium text-gray-900',
    },
    { cle: 'mois', entete: 'Mois', valeur: (f) => (f.mois ? f.mois.slice(0, 7) : '—') },
    { cle: 'annee', entete: 'Année', align: 'right', valeur: (f) => formatNombre(anneeFacture(f.mois)) },
    { cle: 'service', entete: 'Service', valeur: (f) => texte(f.service) },
    { cle: 'projet', entete: 'Projet', valeur: (f) => texte(f.projet) },
    { cle: 'montant', entete: 'Montant', align: 'right', valeur: (f) => formatNombre(f.montant) },
    { cle: 'bonCommande', entete: 'Bon de commande', valeur: (f) => texte(f.bonCommande) },
    { cle: 'dateValidation', entete: 'Validation facture', valeur: (f) => texte(f.dateValidation) },
    { cle: 'dateEnvoiCompta', entete: 'Envoi à la compta', valeur: (f) => texte(f.dateEnvoiCompta) },
    {
      cle: 'statut',
      entete: 'Statut',
      valeur: (f) => (
        <span
          className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
            f.statut === 'PAYEE' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'
          }`}
        >
          {f.statut ?? '—'}
        </span>
      ),
    },
    {
      cle: 'commentaire',
      entete: 'Commentaire',
      valeur: (f) => texte(f.commentaire),
      classeCellule: 'max-w-56 truncate',
      titre: (f) => f.commentaire ?? undefined,
    },
  ]
}
