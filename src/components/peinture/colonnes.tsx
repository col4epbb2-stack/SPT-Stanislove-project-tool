import { Pencil, Trash2 } from 'lucide-react'
import type { ColonneTableau } from '../ui/TableauColonnes'
import type { LigneJournalPeinture, ObjectifProfil, TarifPeinture } from '../../types/contratPeinture'
import type { Resolveur } from '../../lib/liaison'
import { clesJournalPeinture } from '../../lib/liaisonCles'
import { LiaisonBadge } from '../liaison/LiaisonBadge'
import { formatNombre, formatPercent } from '../../lib/format'
import { estTravaux, statutAffaire } from '../../lib/contratPeintureRapports'
import type { FormateurMontant } from '../../lib/montantAffiche'

// Colonnes du module Contrat peinture décrites une seule fois (06/08/2026) —
// même principe que les modules Tonnage, METAL et Procurement : le JOURNAL a
// 41 colonnes, écrites jusqu'ici deux fois (mur de <th> puis mur de <td>).
// Les colonnes calculées de la feuille sont recalculées à l'enregistrement
// par lib/contratPeintureEngine.ts (deriveLigneJournal), pas ici : elles sont
// stockées sur la ligne comme dans le classeur.

const texte = (v: string | number | null | undefined) => (v === null || v === undefined || v === '' ? '—' : String(v))

export function colonnesJournalPeinture({
  resolveur,
  onEditer,
  onSupprimer,
  m,
}: {
  resolveur: Resolveur
  onEditer: (ligne: LigneJournalPeinture) => void
  // Suppression (04/09/2026, demande explicite). Ligne saisie seulement (`id`
  // en chaîne) — une ligne restée pure import n'a aucun document à supprimer.
  onSupprimer: (ligne: LigneJournalPeinture) => void
  /** Formatage des montants dans la devise du système (19/08/2026). */
  m: FormateurMontant
}): ColonneTableau<LigneJournalPeinture>[] {
  // Le classeur peinture compte en francs CFA (tarifs GMI) ; l'unité est
  // rappelée dans l'en-tête parce que ces colonnes n'en portaient aucune —
  // ambigu tant qu'il n'y avait qu'une devise, faux dès qu'on convertit.
  const u = m.uniteAffichee('XAF')
  return [
    {
      cle: 'editer',
      entete: '',
      valeur: (l) => (
        <button
          type="button"
          onClick={() => onEditer(l)}
          className="p-1.5 rounded-lg text-gray-400 hover:text-primary hover:bg-primary/5"
          title="Modifier cette ligne de pointage"
        >
          <Pencil className="w-3.5 h-3.5" />
        </button>
      ),
    },
    { cle: 'date', entete: 'Date', valeur: (l) => l.date },
    { cle: 'dateDemande', entete: 'Date demande', valeur: (l) => texte(l.dateDemande) },
    { cle: 'ctr', entete: 'CTR', valeur: (l) => texte(l.ctr) },
    { cle: 'equipe', entete: 'Équipe', valeur: (l) => texte(l.equipe) },
    { cle: 'categorie', entete: 'Catégorie', valeur: (l) => texte((l.categorie ?? '').trim()) },
    { cle: 'typeItem', entete: 'Type item', valeur: (l) => texte((l.typeItem ?? '').trim()) },
    { cle: 'numeroOt', entete: 'N° OT', valeur: (l) => texte(l.numeroOt) },
    { cle: 'numeroAvis', entete: 'N° avis', valeur: (l) => texte(l.numeroAvis) },
    {
      cle: 'projet',
      entete: 'Projet / affaire',
      valeur: (l) => texte(l.projet),
      classeCellule: 'font-medium text-gray-900 max-w-56 truncate',
      titre: (l) => l.projet ?? undefined,
    },
    {
      cle: 'liaison',
      entete: 'Liaison',
      valeur: (l) => {
        const resolution = resolveur.resoudre('contrat-peinture', clesJournalPeinture(l))
        return (
          <LiaisonBadge
            resolution={resolution}
            nomProjet={resolution ? resolveur.projetParId(resolution.projetId)?.nom : undefined}
          />
        )
      },
    },
    {
      cle: 'tache',
      entete: 'Tâche',
      valeur: (l) => texte(l.tache),
      classeCellule: 'max-w-48 truncate',
      titre: (l) => l.tache ?? undefined,
    },
    { cle: 'priorite', entete: 'Priorité', valeur: (l) => texte(l.priorite) },
    {
      // Statut d'affaire (27/08/2026, §6). Il ne concerne que les TRAVAUX :
      // une ligne de personnel ou de consommable n'est pas une affaire, lui
      // afficher « En cours » lui prêterait un état qu'elle n'a pas.
      cle: 'statut',
      entete: 'Statut',
      texte: (l) => (estTravaux(l) ? statutAffaire(l) : ''),
      valeur: (l) =>
        !estTravaux(l) ? (
          <span className="text-gray-300">—</span>
        ) : statutAffaire(l) === 'Terminé' ? (
          <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">Terminé</span>
        ) : (
          <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700">En cours</span>
        ),
    },
    { cle: 'qte', entete: 'Qté', align: 'right', valeur: (l) => formatNombre(l.qte, 2) },
    {
      cle: 'surfaceTotale',
      entete: 'Surface totale (m²)',
      align: 'right',
      valeur: (l) => formatNombre(l.surfaceTotale, 2),
    },
    {
      cle: 'surfaceRealisee',
      entete: 'Surface réalisée',
      align: 'right',
      valeur: (l) => formatNombre(l.surfaceRealisee, 2),
    },
    {
      cle: 'surfacePrevisionnelle',
      entete: 'Surface prév.',
      align: 'right',
      valeur: (l) => formatNombre(l.surfacePrevisionnelle, 2),
    },
    { cle: 'coreCrew', entete: 'Core crew', align: 'right', valeur: (l) => formatNombre(l.coreCrew) },
    { cle: 'horsCoreCrew', entete: 'Hors core crew', align: 'right', valeur: (l) => formatNombre(l.horsCoreCrew) },
    { cle: 'unite', entete: 'Unité', valeur: (l) => texte(l.unite) },
    { cle: 'dateDebut', entete: 'Début', valeur: (l) => texte(l.dateDebut) },
    { cle: 'dateFin', entete: 'Fin', valeur: (l) => texte(l.dateFin) },
    { cle: 'duree', entete: 'Durée (j)', align: 'right', valeur: (l) => formatNombre(l.duree) },
    { cle: 'site', entete: 'Site', valeur: (l) => texte(l.site) },
    { cle: 'pctPrevisionnel', entete: '% prév.', align: 'right', valeur: (l) => formatPercent(l.pctPrevisionnel) },
    { cle: 'pctReel', entete: '% réel', align: 'right', valeur: (l) => formatPercent(l.pctReel) },
    { cle: 'cpyHeures', entete: 'CPY (h)', align: 'right', valeur: (l) => formatNombre(l.cpyHeures, 2) },
    {
      cle: 'coutUnitairePointage',
      entete: `Coût unit. pointage (${u})`,
      align: 'right',
      valeur: (l) => m.montant(l.coutUnitairePointage, 'XAF'),
    },
    {
      cle: 'coutTotalPointage',
      entete: `Coût total pointage (${u})`,
      align: 'right',
      valeur: (l) => m.montant(l.coutTotalPointage, 'XAF'),
    },
    {
      cle: 'coutUnitaireStandBy',
      entete: `Coût unit. stand-by (${u})`,
      align: 'right',
      valeur: (l) => m.montant(l.coutUnitaireStandBy, 'XAF'),
    },
    {
      cle: 'coutTotalStandByMateriel',
      entete: `Coût total stand-by mat. (${u})`,
      align: 'right',
      valeur: (l) => m.montant(l.coutTotalStandByMateriel, 'XAF'),
    },
    { cle: 'coutStandBy', entete: `Coût stand-by (${u})`, align: 'right', valeur: (l) => m.montant(l.coutStandBy, 'XAF') },
    {
      cle: 'coutUnitaireAncienContrat',
      entete: `Coût unit. ancien (${u})`,
      align: 'right',
      valeur: (l) => m.montant(l.coutUnitaireAncienContrat, 'XAF'),
    },
    {
      cle: 'coutTotalAncienContrat',
      entete: `Coût total ancien (${u})`,
      align: 'right',
      valeur: (l) => m.montant(l.coutTotalAncienContrat, 'XAF'),
    },
    {
      cle: 'saving',
      entete: `Saving (${u})`,
      align: 'right',
      valeur: (l) => m.montant(l.saving, 'XAF'),
      classeLigne: (l) => ((l.saving ?? 0) < 0 ? 'text-red-600 font-medium' : ''),
    },
    {
      cle: 'commentaire',
      entete: 'Commentaire',
      valeur: (l) => texte(l.commentaire),
      classeCellule: 'max-w-44 truncate',
      titre: (l) => l.commentaire ?? undefined,
    },
    { cle: 'filtre', entete: 'Filtre', valeur: (l) => texte(l.filtre) },
    { cle: 'mois', entete: 'Mois', valeur: (l) => texte(l.mois) },
    {
      cle: 'tempsProductionChamp',
      entete: 'Temps prod. / champ',
      align: 'right',
      valeur: (l) => formatNombre(l.tempsProductionChamp),
    },
    {
      cle: 'productiviteParProfil',
      entete: 'Productivité / profil',
      align: 'right',
      valeur: (l) => formatPercent(l.productiviteParProfil),
    },
    { cle: 'cibleJour', entete: 'Cible / jour', align: 'right', valeur: (l) => formatNombre(l.cibleJour, 2) },
    {
      cle: 'partTempsProductif',
      entete: 'Part temps productif',
      align: 'right',
      valeur: (l) => formatPercent(l.partTempsProductif),
    },
    {
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
    },
  ]
}

export function colonnesTarifs(m: FormateurMontant): ColonneTableau<TarifPeinture>[] {
  const u = m.uniteAffichee('XAF')
  return [
    { cle: 'categorie', entete: 'Catégorie', valeur: (t) => texte(t.categorie) },
    { cle: 'societe', entete: 'Société', valeur: (t) => texte(t.societe) },
    {
      cle: 'typeItem',
      entete: "Type d'item",
      valeur: (t) => t.typeItem,
      classeCellule: 'whitespace-nowrap font-medium text-gray-900',
    },
    {
      cle: 'tarifPointageReel',
      entete: `Tarif au pointage réel (${u})`,
      align: 'right',
      valeur: (t) => m.montant(t.tarifPointageReel, 'XAF'),
    },
    { cle: 'tarifStandBy', entete: `Tarif stand-by (${u})`, align: 'right', valeur: (t) => m.montant(t.tarifStandBy, 'XAF') },
    { cle: 'coefficient', entete: 'Coefficient', align: 'right', valeur: (t) => formatNombre(t.coefficient, 2) },
    {
      cle: 'tempsProductionH',
      entete: 'Temps de production (h)',
      align: 'right',
      valeur: (t) => formatNombre(t.tempsProductionH),
    },
    {
      cle: 'objectifProductionM2',
      entete: 'Objectif de production (m²)',
      align: 'right',
      valeur: (t) => formatNombre(t.objectifProductionM2),
    },
    { cle: 'ancienContrat', entete: `Ancien contrat (${u})`, align: 'right', valeur: (t) => m.montant(t.ancienContrat, 'XAF') },
    {
      cle: 'saving',
      entete: `Saving (${u})`,
      align: 'right',
      valeur: (t) => m.montant(t.saving, 'XAF'),
      classeLigne: (t) => ((t.saving ?? 0) < 0 ? 'text-red-600 font-medium' : ''),
    },
  ]
}

export function colonnesObjectifs(): ColonneTableau<ObjectifProfil>[] {
  return [
    {
      cle: 'champ',
      entete: 'Champ',
      valeur: (o) => o.champ,
      classeCellule: 'whitespace-nowrap font-medium text-gray-900',
    },
    { cle: 'nombreHeures', entete: "Nombre d'heures", align: 'right', valeur: (o) => formatNombre(o.nombreHeures) },
    {
      cle: 'objectifJourM2',
      entete: 'Objectif / jour (m²)',
      align: 'right',
      valeur: (o) => formatNombre(o.objectifJourM2),
    },
    { cle: 'objectifHeure', entete: 'Objectif / heure', align: 'right', valeur: (o) => formatNombre(o.objectifHeure, 3) },
    { cle: 'chefEquipePct', entete: "Chef d'équipe — %", align: 'right', valeur: (o) => formatPercent(o.chefEquipePct) },
    {
      cle: 'chefEquipeObjectif',
      entete: "Chef d'équipe — objectif",
      align: 'right',
      valeur: (o) => formatNombre(o.chefEquipeObjectif),
    },
    { cle: 'peintrePct', entete: 'Peintre — %', align: 'right', valeur: (o) => formatPercent(o.peintrePct) },
    {
      cle: 'peintreObjectif',
      entete: 'Peintre — objectif',
      align: 'right',
      valeur: (o) => formatNombre(o.peintreObjectif),
    },
  ]
}
