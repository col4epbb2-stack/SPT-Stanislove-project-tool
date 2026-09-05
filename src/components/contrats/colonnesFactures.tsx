import { Badge } from '../ui/Badge'
import { LIBELLE_RAISON_ECART, formatDatePartielle } from '../../lib/datesPartielles'
import type { ColonneTableau } from '../ui/TableauColonnes'
import type { Commande, Facture } from '../../types/project'
import { STATUT_FACTURE_LABELS, delaisFacture, raisonDelaiAbsent, statutFacture } from '../../lib/facturesContratEngine'
import type { FormateurMontant } from '../../lib/montantAffiche'

/**
 * Une facture avec ce qui l'identifie hors d'elle-même : sa commande (première
 * colonne du fichier de suivi Excel) et, s'il y en a une, sa fiche projet.
 */
export interface LigneFacture {
  facture: Facture
  commande: Commande
  /**
   * Affaires payées par la facture, déjà résolues en libellés
   * (`doc/module contrat_rev01.docx` §6). Vide pour une commande suivie
   * depuis le contrat qui n'a aucune affaire.
   */
  affaires: string[]
  /** Ces affaires viennent-elles de la commande, faute d'affaires propres ? */
  affairesHeritees: boolean
}

const RIEN = '—'

function texte(v?: string | null) {
  return v && v.trim() !== '' ? v : RIEN
}

/**
 * Oui / Non de la feuille Excel, en trois états. Une case **vide** n'est pas
 * un « NON » : le fichier distingue les deux, et un « NON » affiché d'office
 * ferait passer une facture non renseignée pour une facture explicitement
 * refusée à cette étape.
 */
function ouiNon(valeur?: boolean) {
  if (valeur === undefined) return RIEN
  return valeur ? 'OUI' : 'NON'
}

/**
 * Colonnes du tableau de suivi des factures d'un contrat (`doc/module
 * contrat.docx` §6).
 *
 * L'ordre reprend celui du **fichier de suivi Excel** joint au document
 * (COMMANDE · N° FACTURE · SERVICE · MOIS · MONTANT HT · SITES · statut ·
 * COMMENTAIRE · OBJET, puis les étapes), et les colonnes du workflow sont
 * complétées par **leurs dates**, que le fichier ne montre pas mais que le
 * texte du §5 demande — « il faut juste t'assurer que toutes les informations
 * relatives à la facture et les informations sur le workflow de validation
 * jusqu'au paiement s'y trouvent ».
 *
 * **Une colonne du fichier n'est volontairement pas reproduite** :
 * « EN COURS DE TRAITEMENT » (12ᵉ colonne, entre la comptabilité et SAP) ne
 * correspond à aucune étape des deux documents. Elle reste à préciser — on ne
 * devine pas une étape de plus. À ne pas confondre avec la **Validation DO**,
 * qui est, elle, explicitement demandée par le rev01 §2 et qui figure ici.
 */
export function colonnesFactures(format: FormateurMontant, devise: string): ColonneTableau<LigneFacture>[] {
  return [
    { cle: 'commande', entete: 'Commande', valeur: (l) => <span className="font-mono text-xs">{l.commande.numero}</span>, texte: (l) => l.commande.numero },
    { cle: 'numero', entete: 'N° facture', valeur: (l) => <span className="font-mono text-xs">{l.facture.numero}</span>, texte: (l) => l.facture.numero },
    {
      cle: 'projet',
      entete: 'Affaires',
      // Les affaires **de la facture** (rev01 §6), et non plus le seul projet
      // de sa commande. Quand la facture n'en cite aucune, ce sont celles de
      // la commande — dit explicitement, sinon l'héritage passerait pour une
      // saisie. Une commande suivie depuis le contrat (doc §3) peut n'en
      // avoir aucune : on le dit au lieu d'un tiret, qui se lirait comme une
      // donnée manquante.
      valeur: (l) =>
        l.affaires.length === 0 ? (
          <span className="text-indigo-700">Sans affaire</span>
        ) : (
          <span title={l.affaires.join(', ')}>
            {l.affaires.join(', ')}
            {l.affairesHeritees && <span className="text-gray-400"> (de la commande)</span>}
          </span>
        ),
      texte: (l) => (l.affaires.length === 0 ? 'Sans affaire' : l.affaires.join(', ')),
      classeCellule: 'max-w-[16rem] truncate',
    },
    { cle: 'service', entete: 'Service', valeur: (l) => texte(l.facture.service) },
    { cle: 'mois', entete: 'Mois', valeur: (l) => texte(l.facture.mois) },
    {
      cle: 'montant',
      entete: `Montant HT (${format.uniteAffichee(devise)})`,
      align: 'right',
      valeur: (l) => format.montant(l.facture.montant, devise),
      // Nombre brut à l'extraction : un tableur doit pouvoir sommer la colonne.
      texte: (l) => l.facture.montant,
    },
    { cle: 'site', entete: 'Site', valeur: (l) => texte(l.facture.site) },
    {
      cle: 'statut',
      entete: 'Statut',
      valeur: (l) => {
        const statut = statutFacture(l.facture)
        return (
          <Badge
            label={STATUT_FACTURE_LABELS[statut]}
            bg={statut === 'PAYEE' ? 'bg-green-100' : 'bg-amber-100'}
            text={statut === 'PAYEE' ? 'text-green-700' : 'text-amber-700'}
          />
        )
      },
      // Un badge n'a pas d'enfant textuel : sans `texte`, la cellule sortirait
      // vide du fichier extrait.
      texte: (l) => STATUT_FACTURE_LABELS[statutFacture(l.facture)],
    },
    { cle: 'objet', entete: 'Objet', valeur: (l) => texte(l.facture.objet), classeCellule: 'max-w-[16rem] truncate', titre: (l) => l.facture.objet },
    { cle: 'dateFacture', entete: 'Date facture', valeur: (l) => formatDatePartielle(l.facture.date, RIEN), texte: (l) => l.facture.date ?? '' },
    { cle: 'dateReception', entete: 'Réception', valeur: (l) => formatDatePartielle(l.facture.dateReception, RIEN), texte: (l) => l.facture.dateReception ?? '' },

    // Les six étapes du §5, dans l'ordre du document.
    {
      cle: 'validationTechnique',
      entete: '1. Validation technique',
      valeur: (l) => formatDatePartielle(l.facture.workflow?.dateValidationTechnique, RIEN),
      texte: (l) => l.facture.workflow?.dateValidationTechnique ?? '',
    },
    {
      cle: 'compta',
      entete: '2. Transmise en compta',
      valeur: (l) => formatDatePartielle(l.facture.workflow?.dateTransmissionCompta, RIEN),
      texte: (l) => l.facture.workflow?.dateTransmissionCompta ?? '',
    },
    { cle: 'sap', entete: '3. Dans SAP', valeur: (l) => ouiNon(l.facture.workflow?.introduiteSap) },
    {
      cle: 'dateSap',
      entete: '3. Date SAP',
      valeur: (l) => formatDatePartielle(l.facture.workflow?.dateIntroductionSap, RIEN),
      texte: (l) => l.facture.workflow?.dateIntroductionSap ?? '',
    },
    { cle: 'cge', entete: '4. Traitement CGE', valeur: (l) => ouiNon(l.facture.workflow?.traitementCge) },
    {
      cle: 'dateCge',
      entete: '4. Date CGE',
      valeur: (l) => formatDatePartielle(l.facture.workflow?.dateValidationCge, RIEN),
      texte: (l) => l.facture.workflow?.dateValidationCge ?? '',
    },
    // L'étape que le rev01 §2 signale comme oubliée, avec son département
    // responsable — la seule étape du workflow qui en porte un.
    { cle: 'validationDo', entete: '5. Validation DO', valeur: (l) => ouiNon(l.facture.workflow?.validationDo) },
    { cle: 'departementDo', entete: '5. Département DO', valeur: (l) => texte(l.facture.workflow?.departementValidationDo) },
    {
      cle: 'dateDo',
      entete: '5. Date validation DO',
      valeur: (l) => formatDatePartielle(l.facture.workflow?.dateValidationDo, RIEN),
      texte: (l) => l.facture.workflow?.dateValidationDo ?? '',
    },
    { cle: 'paiementEnCours', entete: '6. Paiement en cours', valeur: (l) => ouiNon(l.facture.workflow?.paiementEnCours) },
    { cle: 'paiementRealise', entete: '7. Paiement réalisé', valeur: (l) => ouiNon(l.facture.workflow?.paiementRealise) },
    {
      cle: 'datePaiement',
      entete: '7. Date de paiement',
      valeur: (l) => formatDatePartielle(l.facture.workflow?.datePaiement, RIEN),
      texte: (l) => l.facture.workflow?.datePaiement ?? '',
    },
    // Le KPI principal du rev01 §3, à la colonne près : « Délai entre la date
    // de chargement dans SAP et la date de paiement de la facture ». Vide
    // quand une borne manque, ou n'est connue qu'au mois — un délai inconnu
    // n'est pas un délai nul.
    {
      cle: 'delaiSapPaiement',
      entete: 'Délai SAP → paiement (j)',
      align: 'right',
      valeur: (l) => {
        const valeur = delaisFacture(l.facture).sapAPaiement
        if (valeur !== null) return valeur
        return raisonDelaiAbsent(l.facture, 'sapAPaiement') === 'precision' ? (
          <span className="text-gray-400" title={LIBELLE_RAISON_ECART.precision}>
            date au mois
          </span>
        ) : (
          RIEN
        )
      },
      texte: (l) => delaisFacture(l.facture).sapAPaiement ?? '',
    },

    { cle: 'commentaire', entete: 'Commentaire', valeur: (l) => texte(l.facture.commentaire), classeCellule: 'max-w-[16rem] truncate', titre: (l) => l.facture.commentaire },
  ]
}
