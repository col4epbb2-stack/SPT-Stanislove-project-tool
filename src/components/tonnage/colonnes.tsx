import { Pencil, Trash2 } from 'lucide-react'
import type { ColonneTableau } from '../ui/TableauColonnes'
import type { LigneJournalTonnage, LignePersonnelTonnage, TonnageContrat } from '../../types/tonnageEchaf'
import type { Resolveur } from '../../lib/liaison'
import { clesJournalTonnage } from '../../lib/liaisonCles'
import { LiaisonBadge } from '../liaison/LiaisonBadge'
import { formatNombre, formatPercent } from '../../lib/format'
import {
  anneeDeLigne,
  dureeProjetPrevisionnelle,
  dureeProjetReelle,
  ecartDemontage,
  filtreDemontage,
  filtrePerte,
  gap2,
  m3Reel,
  moisDeLigne,
  perteEnTonnes,
  perteXaf,
  poidsContractuel,
  productionDuJourTonnage,
  retardADate,
  retardEcart,
  savingDemontageCout,
  savingDemontageTonne,
  savingMutualisation,
  semaineDeLigne,
  statutNormalise,
  tonnagePartVariable,
} from '../../lib/tonnageEchafEngine'
import type { FormateurMontant } from '../../lib/montantAffiche'
import {
  colonnesAffichees,
  type ObjectifIndividuel,
  type PointageProductivite,
} from '../../lib/tonnageProductivite'

// Colonnes des grands tableaux du module Tonnage échafaudage, décrites une
// seule fois (06/08/2026). Elles étaient écrites deux fois dans
// pages/TonnageEchafPage.tsx : un mur de 48 <th> puis un mur de 48 <td> qu'il
// fallait garder dans le même ordre à la main. Ici une colonne = un objet
// { entete, valeur }, rendu par components/ui/TableauColonnes.tsx — c'est
// aussi la traduction directe, et désormais unique, des colonnes de la
// feuille Excel d'origine : ajouter/déplacer une colonne se fait à un seul
// endroit, et l'ordre affiché ne peut plus diverger des valeurs.
//
// Les colonnes calculées (savings, retards, pertes, poids contractuel, gap,
// mois/semaine…) appellent lib/tonnageEchafEngine.ts, jamais des valeurs
// figées : c'est la règle du module depuis l'import du classeur.

const texte = (v: string | null | undefined) => v ?? '—'

// Colonne de suppression, réutilisée par le Journal et le Suivi personnel
// (04/09/2026, demande explicite « on le fera sur toutes les interfaces »).
// N'apparaît que sur une ligne **saisie** (`id` en chaîne, le doc ID
// Firestore) — une ligne restée pure import (`id` numérique de la feuille
// classeur) n'a aucun document à supprimer. Même règle et même conséquence
// que côté Procurement : supprimer la saisie d'une ligne qui modifiait un
// import la fait réapparaître avec ses valeurs d'origine ; une ligne créée
// dans l'application disparaît du tableau.
function colonneSupprimer<T extends { id: number | string }>(onSupprimer: (ligne: T) => void): ColonneTableau<T> {
  return {
    cle: 'supprimer',
    entete: '',
    valeur: (l) =>
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
  }
}

export function colonnesJournal({
  contrat,
  resolveur,
  onEditer,
  onSupprimer,
  m,
}: {
  contrat: TonnageContrat
  resolveur: Resolveur
  onEditer: (ligne: LigneJournalTonnage) => void
  onSupprimer: (ligne: LigneJournalTonnage) => void
  /** Formatage des montants dans la devise du système (19/08/2026). */
  m: FormateurMontant
}): ColonneTableau<LigneJournalTonnage>[] {
  // Retard et perte ne sont mis en évidence que sur une affaire encore en
  // cours : une demande déjà déposée n'a plus de retard "vivant" à signaler.
  const enCours = (l: LigneJournalTonnage) => !l.dateDeposeReel && statutNormalise(l) !== 'En attente'
  const alerteSiPositif = (valeur: (l: LigneJournalTonnage) => number | null) => (l: LigneJournalTonnage) =>
    enCours(l) && (valeur(l) ?? 0) > 0 ? 'text-red-600 font-medium' : ''

  return [
    {
      cle: 'editer',
      entete: '',
      valeur: (l) => (
        <button
          type="button"
          onClick={() => onEditer(l)}
          className="p-1.5 rounded-lg text-gray-400 hover:text-primary hover:bg-primary/5"
          title="Modifier cette demande"
        >
          <Pencil className="w-3.5 h-3.5" />
        </button>
      ),
    },
    {
      cle: 'projet',
      entete: 'Projet',
      valeur: (l) => texte(l.projet),
      classeCellule: 'whitespace-nowrap font-medium text-gray-900',
    },
    {
      cle: 'liaison',
      entete: 'Liaison',
      valeur: (l) => {
        const resolution = resolveur.resoudre('tonnage-echaf', clesJournalTonnage(l))
        return (
          <LiaisonBadge
            resolution={resolution}
            nomProjet={resolution ? resolveur.projetParId(resolution.projetId)?.nom : undefined}
          />
        )
      },
    },
    { cle: 'champs', entete: 'Champ', valeur: (l) => texte(l.champs) },
    { cle: 'modeFacturation', entete: 'Mode facturation', valeur: (l) => texte(l.modeFacturation) },
    { cle: 'date', entete: 'Date', valeur: (l) => texte(l.date) },
    {
      cle: 'numeroDemande',
      entete: 'N° demande',
      valeur: (l) => texte(l.numeroDemande),
      classeCellule: 'whitespace-nowrap max-w-44 truncate',
      titre: (l) => l.numeroDemande ?? undefined,
    },
    { cle: 'demandeurTeepg', entete: 'Demandeur TEEPG', valeur: (l) => texte(l.demandeurTeepg) },
    { cle: 'site', entete: 'Site', valeur: (l) => texte(l.site) },
    { cle: 'services', entete: 'Services', valeur: (l) => texte(l.services) },
    { cle: 'typeEchafaudage', entete: "Type d'échafaudage", valeur: (l) => texte(l.typeEchafaudage) },
    { cle: 'dateMontagePrev', entete: 'Montage prév.', valeur: (l) => texte(l.dateMontagePrev) },
    { cle: 'dateMontageReel', entete: 'Montage réel', valeur: (l) => texte(l.dateMontageReel) },
    {
      cle: 'anneeMontage',
      entete: 'Année montage',
      align: 'right',
      valeur: (l) => (l.dateMontageReel ? l.dateMontageReel.slice(0, 4) : '—'),
    },
    { cle: 'dateDeposePrev', entete: 'Dépose prév.', valeur: (l) => texte(l.dateDeposePrev) },
    { cle: 'dateNotificationDepose', entete: 'Notification dépose', valeur: (l) => texte(l.dateNotificationDepose) },
    { cle: 'dateDeposeReel', entete: 'Dépose réelle', valeur: (l) => texte(l.dateDeposeReel) },
    {
      cle: 'anneeDepose',
      entete: 'Année dépose',
      align: 'right',
      valeur: (l) => (l.dateDeposeReel ? l.dateDeposeReel.slice(0, 4) : '—'),
    },
    { cle: 'filtreDemontage', entete: 'Filtre démontage', valeur: (l) => filtreDemontage(l) },
    { cle: 'ecartDemontage', entete: 'Écart (j)', align: 'right', valeur: (l) => formatNombre(ecartDemontage(l)) },
    {
      cle: 'savingDemontageT',
      entete: 'Saving démontage (T)',
      align: 'right',
      valeur: (l) => formatNombre(savingDemontageTonne(l, contrat), 2),
    },
    { cle: 'coutTonne', entete: 'Coût à la tonne', align: 'right', valeur: () => formatNombre(contrat.coutTonne) },
    {
      cle: 'savingDemontageCout',
      entete: 'Saving démontage (coût)',
      align: 'right',
      valeur: (l) => formatNombre(savingDemontageCout(l, contrat)),
    },
    {
      cle: 'savingMutualisation',
      entete: 'Saving mutualisation',
      align: 'right',
      valeur: (l) => formatNombre(savingMutualisation(l, contrat), 2),
    },
    { cle: 'eligible', entete: 'Eligible', valeur: (l) => texte(l.eligible) },
    { cle: 'statut', entete: 'Statut', valeur: (l) => texte(l.statut) },
    {
      cle: 'dureePrev',
      entete: 'Durée prév. (j)',
      align: 'right',
      valeur: (l) => formatNombre(dureeProjetPrevisionnelle(l)),
    },
    {
      cle: 'dureeReelle',
      entete: 'Durée réelle (j)',
      align: 'right',
      valeur: (l) => formatNombre(dureeProjetReelle(l)),
    },
    {
      cle: 'retardEcart',
      entete: 'Retard prév./réelle (j)',
      align: 'right',
      valeur: (l) => formatNombre(retardEcart(l)),
    },
    {
      cle: 'retardADate',
      entete: 'Retard à date (j)',
      align: 'right',
      valeur: (l) => formatNombre(retardADate(l)),
      classeLigne: alerteSiPositif((l) => retardADate(l)),
    },
    {
      cle: 'perteXaf',
      entete: `Perte (${m.uniteAffichee('XAF')})`,
      align: 'right',
      valeur: (l) => m.montant(perteXaf(l, contrat), 'XAF'),
      classeLigne: alerteSiPositif((l) => perteXaf(l, contrat)),
    },
    {
      cle: 'perteT',
      entete: 'Perte (T)',
      align: 'right',
      valeur: (l) => formatNombre(perteEnTonnes(l, contrat), 2),
    },
    { cle: 'filtrePerte', entete: 'Filtre perte', valeur: (l) => filtrePerte(l, contrat) ?? '—' },
    { cle: 'longueur', entete: 'Longueur', align: 'right', valeur: (l) => formatNombre(l.longueurReelle, 2) },
    { cle: 'largeur', entete: 'Largeur', align: 'right', valeur: (l) => formatNombre(l.largeurReelle, 2) },
    { cle: 'hauteur', entete: 'Hauteur', align: 'right', valeur: (l) => formatNombre(l.hauteurReelle, 2) },
    { cle: 'm3', entete: 'M3 réel', align: 'right', valeur: (l) => formatNombre(m3Reel(l), 2) },
    { cle: 'poidsT', entete: 'Poids (T)', align: 'right', valeur: (l) => formatNombre(l.poidsT, 3) },
    {
      cle: 'poidsContractuel',
      entete: 'Poids contractuel (T)',
      align: 'right',
      valeur: (l) => formatNombre(poidsContractuel(l, contrat), 3),
    },
    {
      cle: 'tonnagePartVariable',
      entete: 'Tonnage part variable',
      align: 'right',
      valeur: (l) => formatNombre(tonnagePartVariable(l, contrat), 3),
    },
    { cle: 'gap2', entete: 'Gap2', align: 'right', valeur: (l) => formatNombre(gap2(l, contrat), 3) },
    {
      cle: 'description',
      entete: 'Description des travaux',
      valeur: (l) => texte(l.description),
      classeCellule: 'max-w-64 truncate',
      titre: (l) => l.description ?? undefined,
    },
    {
      cle: 'modification',
      entete: 'Modification',
      valeur: (l) => texte(l.modification),
      classeCellule: 'max-w-40 truncate',
      titre: (l) => l.modification ?? undefined,
    },
    {
      // TON1-41 (03/09/2026, lot 5) : quand Modification = OUI, cette ligne
      // est à elle seule la production du jour — son poids contractuel.
      // `null` (donc « — ») pour toute autre ligne : aucune notion générale
      // de « production du jour » n'existe ailleurs dans le module.
      cle: 'productionDuJour',
      entete: 'Production du jour (T)',
      align: 'right',
      valeur: (l) => formatNombre(productionDuJourTonnage(l, contrat), 3),
    },
    {
      cle: 'commentaires',
      entete: 'Commentaires',
      valeur: (l) => texte(l.commentaires),
      classeCellule: 'max-w-40 truncate',
      titre: (l) => l.commentaires ?? undefined,
    },
    { cle: 'mois', entete: 'Mois', valeur: (l) => moisDeLigne(l) ?? '—' },
    {
      cle: 'jours',
      entete: 'Jours',
      valeur: (l) => (l.date ? `${Number(l.date.slice(8, 10))}/${l.date.slice(5, 7)}` : '—'),
    },
    { cle: 'semaine', entete: 'Semaine', align: 'right', valeur: (l) => formatNombre(semaineDeLigne(l)) },
    { cle: 'annee', entete: 'Année', align: 'right', valeur: (l) => formatNombre(anneeDeLigne(l)) },
    colonneSupprimer(onSupprimer),
  ]
}

// Les 4 colonnes dérivées du Suivi personnel (03/09/2026, lot 2) : recalculées
// par lib/tonnageProductivite.ts pour les lignes saisies dans l'application,
// reprises du classeur pour les 3 384 lignes importées — la règle du document
// et celle du classeur divergent dès que l'effectif s'écarte de l'équipe de
// référence, et on ne réécrit pas l'historique. Une ligne recalculée est
// signalée dans son infobulle.
//
// `objectifs` vide (paramètres du contrat inaccessibles) : tout retombe sur les
// valeurs enregistrées, l'écran ne se vide pas.
export function colonnesPersonnel(
  onSupprimer: (ligne: LignePersonnelTonnage) => void,
  objectifs: Map<PointageProductivite['id'], ObjectifIndividuel> = new Map()
): ColonneTableau<LignePersonnelTonnage>[] {
  const vues = (l: LignePersonnelTonnage) => colonnesAffichees(l, objectifs)
  const origine = (l: LignePersonnelTonnage) =>
    vues(l).recalculee ? 'Recalculé depuis les paramètres du contrat' : 'Valeur du classeur'
  return [
    {
      cle: 'projet',
      entete: 'Projet',
      valeur: (l) => texte(l.projet),
      classeCellule: 'whitespace-nowrap font-medium text-gray-900',
    },
    { cle: 'champs', entete: 'Champ', valeur: (l) => texte(l.champs) },
    { cle: 'modeFacturation', entete: 'Mode facturation', valeur: (l) => texte(l.modeFacturation) },
    { cle: 'date', entete: 'Date', valeur: (l) => l.date },
    {
      cle: 'numeroDemande',
      entete: 'N° demande',
      valeur: (l) => texte(l.numeroDemande),
      classeCellule: 'whitespace-nowrap max-w-44 truncate',
      titre: (l) => l.numeroDemande ?? undefined,
    },
    { cle: 'site', entete: 'Site', valeur: (l) => texte(l.site) },
    { cle: 'services', entete: 'Services', valeur: (l) => texte(l.services) },
    { cle: 'nom', entete: 'Nom', valeur: (l) => texte(l.nom) },
    { cle: 'profil', entete: 'Profil', valeur: (l) => texte(l.profil) },
    { cle: 'productivite', entete: 'Productivité', align: 'right', valeur: (l) => formatNombre(l.productivite, 2) },
    {
      cle: 'objectifProductionT',
      entete: 'Objectif / jour (T)',
      align: 'right',
      valeur: (l) => formatNombre(vues(l).objectifJourT, 2),
      titre: origine,
    },
    // Nouvelle colonne (§A5 : « le suivi opérationnel doit être disponible à la
    // fois en tonnes et en kilogrammes », 1 T = 1 000 kg). Toujours calculée :
    // ce n'est qu'une conversion de la colonne précédente, elle ne peut donc
    // pas contredire le classeur.
    {
      cle: 'objectifJourKg',
      entete: 'Objectif / jour (kg)',
      align: 'right',
      valeur: (l) => formatNombre(vues(l).objectifJourKg, 0),
      titre: origine,
    },
    // Ex-« Objectif prod. (KG) ». Le contenu ne change pas — 83,33 pour un
    // monteur — il reçoit son vrai nom : c'est la productivité horaire du §A6
    // (1 T / 12 h = 0,0833 T/h = 83,33 kg/h), pas un objectif de journée.
    {
      cle: 'objectifProductionKg',
      entete: 'Productivité horaire (kg/h)',
      align: 'right',
      valeur: (l) => formatNombre(vues(l).productiviteHoraireKg, 1),
      titre: origine,
    },
    { cle: 'nombreHeures', entete: 'Nb heures', align: 'right', valeur: (l) => formatNombre(l.nombreHeures) },
    // Le §J intitule sa section « Stand-by (STD=NPT) » et le §A8 définit le NPT
    // en heures comme les heures de stand-by : c'est la même colonne, elle le
    // dit désormais. Le ratio garde son en-tête, en pourcentage.
    {
      cle: 'standby',
      entete: 'Stand-by = NPT (h)',
      align: 'right',
      valeur: (l) => formatNombre(vues(l).nptHeures),
    },
    {
      cle: 'partTempsProductif',
      entete: 'Part temps productif',
      align: 'right',
      valeur: (l) => formatPercent(vues(l).partTempsProductif),
      titre: origine,
    },
    { cle: 'npt', entete: 'NPT (%)', align: 'right', valeur: (l) => formatPercent(vues(l).npt), titre: origine },
    {
      cle: 'commentaires',
      entete: 'Commentaires',
      valeur: (l) => texte(l.commentaires),
      classeCellule: 'whitespace-nowrap max-w-55 truncate',
      titre: (l) => l.commentaires ?? undefined,
    },
    colonneSupprimer(onSupprimer),
  ]
}
