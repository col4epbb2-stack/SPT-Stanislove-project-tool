import { CalendarClock, ClipboardList, Coins, FileText, HardHat, Package, Ruler } from 'lucide-react'
import { UNITE_XAF } from '../../lib/unitesMontant'
import type { LigneJournalPeinture, ParametresContratPeinture, TarifPeinture } from '../../types/contratPeinture'
import { APPARTENANCES_EQUIPE, CATEGORIES_SAISIE, categoriePeinture } from '../../types/contratPeinture'
import type { CategoriePeinture } from '../../types/contratPeinture'
import { coutsUnitairesDuTarif, deriveLigneJournal } from '../../lib/contratPeintureEngine'
import { productiviteDeLaLigne } from '../../lib/contratPeintureProductivite'
import { aujourdHui } from '../../lib/saisie'
import { formatNombre, formatPercent } from '../../lib/format'
import { FormulaireEtapes, type EtapeChamps } from '../ui/FormulaireEtapes'
import { useMontant } from '../../lib/montantAffiche'

// Saisie d'une ligne du JOURNAL de pointage peinture (06/08/2026) — la
// feuille était en lecture seule alors que c'est la source de presque tout le
// module : synthèse par site, stand-by par type d'item, courbes journalières
// et coût total au pointage en sont dérivés.
//
// Le formulaire ne demande que les colonnes saisies. Sont dérivées à
// l'enregistrement par lib/contratPeintureEngine.ts :
//   - les 3 coûts unitaires, repris du référentiel DATA par type d'item
//     (RECHERCHEV du classeur — `coutsUnitairesDuTarif`, vérifié sans écart
//     sur les lignes réelles comparables : 1 040 au pointage, 1 996 stand-by,
//     194 ancien contrat) ;
//   - les totaux, % prévisionnel/réel, durée, saving, filtre et mois
//     (`deriveLigneJournal`) ;
//   - la surface prévisionnelle et le % prévisionnel, qui ne se saisissent
//     plus depuis le 07/08/2026 (demande explicite : « on va remplir la
//     surface totale à réaliser, surface réalisée ; l'avancement
//     prévisionnel est calculé seul grâce aux dates ») — ce sont bien les
//     formules du classeur, vérifiées sur ses lignes datées : durée =
//     fin − début + 1, % prévisionnel = 1 / durée (738 lignes, 0 écart),
//     surface prévisionnelle = surface totale / durée (720 lignes, 0 écart).
// `deriveLigneJournal` existait depuis l'import du classeur mais n'avait
// jamais été branchée à une saisie ; la vérifier avant de l'utiliser a révélé
// que sa colonne FILTRE forçait les majuscules, ce que le classeur ne fait
// pas (610 lignes sur 2 124 auraient divergé) — corrigé au passage.
//
// Depuis le 27/08/2026 (lot 2), **« Cible / jour » et « Productivité /
// profil » ne se saisissent plus non plus** : le modèle de productivité des
// paramètres les produit (`productiviteDeLaLigne`) — cible = effectif pointé
// × objectif du profil, part = objectif du profil / objectif du champ.
// Vérifié sur les 640 lignes de pointage PERSONNEL réelles, 0 écart. Une
// ligne dont le type d'item n'est pas un profil déclaré, ou dont le champ
// n'est pas paramétré, garde la valeur qu'elle portait plutôt que de se voir
// écraser par du vide.
//
// Restent saisis parce qu'aucune formule ne les reproduit dans les données
// réelles : CPY (h), temps de production par champ et part de temps
// productif.

export type PeintureSaisieInput = Omit<LigneJournalPeinture, 'id'>

function ligneVide(): PeintureSaisieInput {
  return {
    date: aujourdHui(),
    dateDemande: null,
    ctr: null,
    equipe: null,
    categorie: null,
    typeItem: null,
    numeroOt: null,
    numeroAvis: null,
    projet: null,
    tache: null,
    priorite: null,
    qte: null,
    surfaceTotale: null,
    surfaceRealisee: null,
    surfacePrevisionnelle: null,
    coreCrew: null,
    horsCoreCrew: null,
    unite: null,
    dateDebut: null,
    dateFin: null,
    duree: null,
    site: null,
    pctPrevisionnel: null,
    pctReel: null,
    cpyHeures: null,
    coutUnitairePointage: null,
    coutTotalPointage: null,
    coutUnitaireStandBy: null,
    coutTotalStandByMateriel: null,
    coutStandBy: null,
    coutUnitaireAncienContrat: null,
    coutTotalAncienContrat: null,
    saving: null,
    commentaire: null,
    filtre: null,
    mois: null,
    tempsProductionChamp: null,
    productiviteParProfil: null,
    cibleJour: null,
    partTempsProductif: null,
  }
}

export interface PeintureSuggestions {
  categories: string[]
  typesItem: string[]
  sites: string[]
  ctrs: string[]
  equipes: string[]
  unites: string[]
  priorites: string[]
  projets: string[]
}

type EtapePeinture = 'pointage' | 'affaire' | 'surfaces' | 'periode' | 'personnel' | 'item' | 'couts' | 'notes'


export function JournalPeintureSaisieForm({
  isOpen,
  onClose,
  onSubmit,
  ligneInitiale,
  suggestions,
  tarifs,
  parametres,
  categorie,
}: {
  isOpen: boolean
  onClose: () => void
  onSubmit: (input: PeintureSaisieInput) => Promise<void>
  ligneInitiale: LigneJournalPeinture | null
  suggestions: PeintureSuggestions
  tarifs: TarifPeinture[]
  /** Paramètres du contrat (Paramètres › Contrat peinture). `null` tant
   *  qu'ils n'ont pas été chargés : les deux colonnes dérivées restent alors
   *  telles quelles, elles ne sont pas mises à zéro. */
  parametres: ParametresContratPeinture | null
  /** Catégorie saisie — elle décide des étapes affichées. */
  categorie: CategoriePeinture | null
}) {
  const { montant: formatMontant } = useMontant()
  // L'aide de ces deux colonnes dit d'où vient le chiffre — et, quand il n'y
  // en a pas, pourquoi : un « — » sans explication laisserait chercher.
  const aideProductivite = parametres
    ? "Effectif pointé × objectif du profil, d'après Paramètres › Contrat peinture. Vide si le type d'item n'est pas un profil déclaré ou si le champ n'est pas paramétré."
    : 'Paramètres du contrat non chargés : la valeur déjà enregistrée est conservée telle quelle.'
  // Aperçu des colonnes calculées sur la saisie en cours : mêmes fonctions que
  // celles appliquées à l'enregistrement, donc ce qui est affiché est bien ce
  // qui sera écrit.
  const apercu = (v: PeintureSaisieInput) =>
    deriveLigneJournal({
      ...v,
      ...coutsUnitairesDuTarif(tarifs, v.typeItem),
      ...productiviteDeLaLigne(v, parametres),
    })

  // Une ligne déjà enregistrée impose sa propre catégorie : on ne la
  // requalifie pas en l'ouvrant.
  const cat = ligneInitiale ? categoriePeinture(ligneInitiale.categorie) : categorie

  // Référentiel d'abord (l'ordre du menu suit celui des paramètres), valeurs
  // du journal ensuite — et la valeur de la ligne ouverte, quoi qu'il arrive.
  const declares = (
    cat === 'MATERIEL'
      ? (parametres?.equipements ?? []).map((e) => e.nom)
      : (parametres?.consommables ?? []).map((c) => c.nom)
  ).filter(Boolean)
  const optionsItem = [
    ...new Set([
      ...declares,
      ...suggestions.typesItem,
      ...(ligneInitiale?.typeItem ? [ligneInitiale.typeItem] : []),
    ]),
  ]

  const toutesEtapes: EtapeChamps<PeintureSaisieInput, EtapePeinture>[] = [
    {
      key: 'pointage',
      label: 'Pointage',
      icon: ClipboardList,
      optionnel: false,
      aide: "Le type d'item détermine les tarifs appliqués (référentiel DATA) ; la catégorie sépare le pointage réel (TRAVAUX, PERSONNEL…) du stand-by (STD).",
      champs: [
        { type: 'date', cle: 'date', label: 'Date du pointage', requis: true },
        { type: 'date', cle: 'dateDemande', label: 'Date de la demande' },
        // La catégorie n'est plus un champ libre : elle est choisie avant
        // d'ouvrir le formulaire et c'est elle qui décide des étapes. Le type
        // d'item, lui, descend dans l'étape de sa catégorie quand elle en a
        // une (Effectif, Quantité) — il ne reste ici que pour les lignes hors
        // des cinq cas connus.
        ...(cat === 'PERSONNEL' || cat === 'CONSOMMABLE' || cat === 'MATERIEL'
          ? []
          : [
              {
                type: 'texte' as const,
                cle: 'typeItem' as const,
                label: "Type d'item",
                suggestions: suggestions.typesItem,
              },
            ]),
        { type: 'texte', cle: 'site', label: 'Site', suggestions: suggestions.sites },
        { type: 'texte', cle: 'ctr', label: 'CTR', suggestions: suggestions.ctrs },
        { type: 'texte', cle: 'equipe', label: 'Équipe', suggestions: suggestions.equipes },
      ],
      etat: (v) =>
        v.date && v.typeItem && v.site
          ? { etat: 'complet', resume: `${v.typeItem} · ${v.site}` }
          : v.typeItem || v.site
            ? { etat: 'partiel', resume: "Type d'item ou site manquant" }
            : { etat: 'vide', resume: 'Quoi, où, quand' },
    },
    {
      key: 'affaire',
      label: 'Affaire',
      icon: FileText,
      optionnel: false,
      aide: "L'avis et l'OT rattachent la ligne à une affaire — ce sont eux qui permettent la résolution automatique vers une fiche projet.",
      champs: [
        {
          type: 'ficheProjet',
          cle: 'projetId',
          pleineLargeur: true,
          // Le libellé « Projet / affaire » du classeur reste saisissable :
          // il porte souvent l'intitulé du chantier, pas le nom de la fiche.
          onChoix: (projet, v) => (projet ? { projet: projet.nom } : { projet: v.projet }),
        },
        { type: 'texte', cle: 'projet', label: 'Projet / affaire', suggestions: suggestions.projets, pleineLargeur: true },
        { type: 'texte', cle: 'tache', label: 'Tâche', pleineLargeur: true },
        { type: 'texte', cle: 'numeroAvis', label: "N° d'avis" },
        { type: 'texte', cle: 'numeroOt', label: 'N° OT' },
        { type: 'texte', cle: 'priorite', label: 'Priorité', suggestions: suggestions.priorites },
      ],
      etat: (v) =>
        v.projet
          ? { etat: 'complet', resume: v.numeroAvis ? `Avis ${v.numeroAvis}` : 'Sans avis' }
          : { etat: 'vide', resume: 'Projet manquant' },
    },
    // La période passe avant les quantités depuis le 07/08/2026 : c'est elle
    // qui produit l'avancement prévisionnel de l'étape suivante, la remplir
    // après reviendrait à regarder un « — » sans savoir pourquoi.
    {
      key: 'periode',
      label: 'Période',
      icon: CalendarClock,
      optionnel: true,
      aide: "Dates de la tâche associée : la durée en jours calendaires s'en déduit, et avec elle l'avancement prévisionnel de l'étape Quantités.",
      champs: [
        { type: 'date', cle: 'dateDebut', label: 'Début' },
        { type: 'date', cle: 'dateFin', label: 'Fin' },
        {
          type: 'derive',
          label: 'Durée (j)',
          valeur: (v) => formatNombre(apercu(v).duree),
          aide: 'Fin − début + 1',
        },
      ],
      colonnes: 3,
      // Étape optionnelle : sur les 2 124 lignes réelles, seules 738 ont une
      // période — les pointages stand-by et personnel n'en ont pas.
      etat: (v) =>
        v.dateDebut || v.dateFin
          ? { etat: 'complet', resume: `${formatNombre(apercu(v).duree)} j` }
          : { etat: 'vide', resume: 'Pas de période' },
    },
    {
      key: 'surfaces',
      label: 'Quantités',
      icon: Ruler,
      optionnel: false,
      aide: "La quantité pointée (heures, m², forfait selon l’item) porte tous les coûts. Ne se saisissent ici que la surface totale à réaliser et la surface déjà réalisée : l’avancement prévisionnel, lui, se déduit des dates de la période.",
      champs: [
        { type: 'nombre', cle: 'qte', label: 'Quantité pointée', pas: '0.01' },
        { type: 'texte', cle: 'unite', label: 'Unité', suggestions: suggestions.unites },
        { type: 'nombre', cle: 'surfaceTotale', label: 'Surface totale à réaliser (m²)', pas: '0.01' },
        { type: 'nombre', cle: 'surfaceRealisee', label: 'Surface réalisée (m²)', pas: '0.01' },
        { type: 'nombre', cle: 'coreCrew', label: 'Core crew' },
        { type: 'nombre', cle: 'horsCoreCrew', label: 'Hors core crew' },
        {
          type: 'derive',
          label: 'Surface prévisionnelle (m²)',
          valeur: (v) => formatNombre(apercu(v).surfacePrevisionnelle, 2),
          aide: 'Surface totale / durée de la période',
        },
        {
          type: 'derive',
          label: '% prévisionnel',
          valeur: (v) => formatPercent(apercu(v).pctPrevisionnel),
          aide: '1 / durée — renseignez la période pour l’obtenir',
        },
        {
          type: 'derive',
          label: '% réel',
          valeur: (v) => formatPercent(apercu(v).pctReel),
          aide: 'Surface réalisée / surface totale',
        },
      ],
      etat: (v) => {
        if (v.qte == null) return { etat: 'vide', resume: 'Quantité manquante' }
        const reel = apercu(v).pctReel
        const quantite = `${formatNombre(v.qte, 2)} ${v.unite ?? ''}`.trim()
        return {
          etat: 'complet',
          resume: reel != null ? `${quantite} · ${formatPercent(reel)} réalisé` : quantite,
        }
      },
    },
    {
      // §7 — « Cette catégorie sert **uniquement** à renseigner les effectifs
      // mobilisés et dire si c'est du personnel core crew ou hors core crew. »
      key: 'personnel',
      label: 'Effectif',
      icon: HardHat,
      optionnel: false,
      aide: "Le profil et le nombre de personnes présentes. La productivité attendue en découle : elle n'est pas saisie.",
      champs: [
        {
          type: 'texte',
          cle: 'typeItem',
          label: 'Profil',
          suggestions: (parametres?.profils ?? []).map((p) => p.profil),
        },
        { type: 'nombre', cle: 'qte', label: 'Nombre de personnes', pas: '1' },
        {
          // §6 : « CORE CREW ou HORS CORE CREW (c'est pour le personnel) » —
          // deux valeurs, donc un choix et non une frappe libre.
          type: 'select',
          cle: 'equipe',
          label: 'Appartenance',
          options: [...APPARTENANCES_EQUIPE],
        },
        {
          type: 'derive',
          label: 'Cible / jour (m²)',
          valeur: (v) => formatNombre(apercu(v).cibleJour, 2),
          aide: aideProductivite,
        },
      ],
      colonnes: 2,
      etat: (v) =>
        v.typeItem && v.qte != null
          ? { etat: 'complet', resume: `${formatNombre(v.qte)} × ${v.typeItem}` }
          : { etat: 'vide', resume: 'Profil et effectif' },
    },
    {
      // §8 et §9 — un consommable ou un équipement, sa quantité, son unité.
      key: 'item',
      label: 'Quantité',
      icon: Package,
      optionnel: false,
      aide: "L'item et la quantité pointée. Les coûts unitaires viennent du référentiel : ils ne se saisissent pas.",
      champs: [
        {
          // §8 : « Les consommables doivent être sélectionnés dans une liste
          // déroulante. » Les options sont celles du référentiel **plus** les
          // valeurs déjà présentes dans le journal pour cette catégorie :
          // sans elles, ouvrir une ligne importée dont l'item n'a jamais été
          // déclaré afficherait un menu vide et effacerait sa valeur.
          type: 'select',
          cle: 'typeItem',
          label: cat === 'MATERIEL' ? 'Équipement' : 'Consommable',
          options: optionsItem,
        },
        { type: 'nombre', cle: 'qte', label: 'Quantité', pas: '0.01' },
        { type: 'texte', cle: 'unite', label: 'Unité', suggestions: suggestions.unites },
        {
          type: 'derive',
          label: 'Coût total',
          valeur: (v) => formatMontant(apercu(v).coutTotalPointage, 'XAF'),
          aide: 'Quantité × tarif du type d’item',
        },
      ],
      colonnes: 3,
      etat: (v) =>
        v.qte != null
          ? { etat: 'complet', resume: `${formatNombre(v.qte, 2)} ${v.unite ?? ''}`.trim() }
          : { etat: 'vide', resume: 'Quantité manquante' },
    },
    {
      key: 'couts',
      label: 'Coûts',
      icon: Coins,
      optionnel: true,
      aide: "Les coûts unitaires viennent du référentiel DATA (tarif du type d'item) et les totaux de la quantité : rien à saisir ici, sauf le stand-by constaté et les indicateurs de productivité.",
      champs: [
        {
          type: 'derive',
          label: 'Coût unit. pointage',
          valeur: (v) => formatMontant(apercu(v).coutUnitairePointage, 'XAF'),
          aide: 'Tarif DATA du type d’item',
        },
        {
          type: 'derive',
          label: 'Coût total pointage',
          valeur: (v) => formatMontant(apercu(v).coutTotalPointage, 'XAF'),
          aide: 'Quantité × tarif',
        },
        {
          type: 'derive',
          label: 'Coût unit. stand-by',
          valeur: (v) => formatMontant(apercu(v).coutUnitaireStandBy, 'XAF'),
        },
        {
          type: 'derive',
          label: 'Coût total stand-by matériel',
          valeur: (v) => formatMontant(apercu(v).coutTotalStandByMateriel, 'XAF'),
        },
        {
          type: 'derive',
          label: 'Coût total ancien contrat',
          valeur: (v) => formatMontant(apercu(v).coutTotalAncienContrat, 'XAF'),
        },
        {
          type: 'derive',
          label: 'Saving',
          valeur: (v) => formatMontant(apercu(v).saving, 'XAF'),
          aide: 'Ancien contrat − pointage',
        },
        // Journal peinture compté en francs CFA (tarifs GMI) — saisie
        // possible dans une autre devise, convertie à l'enregistrement.
        { type: 'montant', cle: 'coutStandBy', label: 'Coût stand-by constaté', devise: UNITE_XAF.devise, pas: '0.01' },
        { type: 'nombre', cle: 'cpyHeures', label: 'CPY (h)', pas: '0.01' },
        { type: 'nombre', cle: 'tempsProductionChamp', label: 'Temps de production / champ (h)' },
        {
          type: 'derive',
          label: 'Productivité / profil',
          valeur: (v) => formatPercent(apercu(v).productiviteParProfil),
          aide: aideProductivite,
        },
        {
          type: 'derive',
          label: 'Cible / jour (m²)',
          valeur: (v) => formatNombre(apercu(v).cibleJour, 2),
          aide: aideProductivite,
        },
        { type: 'pourcentage', cle: 'partTempsProductif', label: 'Part de temps productif' },
      ],
      colonnes: 3,
      etat: (v) => {
        const d = apercu(v)
        return d.coutTotalPointage
          ? { etat: 'complet', resume: formatMontant(d.coutTotalPointage, 'XAF') }
          : { etat: 'vide', resume: 'Aucun coût' }
      },
    },
    {
      key: 'notes',
      label: 'Commentaire',
      icon: FileText,
      optionnel: true,
      colonnes: 1,
      champs: [{ type: 'texte', cle: 'commentaire', label: 'Commentaire' }],
      etat: (v) => (v.commentaire ? { etat: 'complet', resume: 'Commentaire saisi' } : { etat: 'vide', resume: 'RAS' }),
    },
  ]

  // Les étapes retenues par catégorie — les §6 à §10 du document, chacun avec
  // ce qu'il demande et rien de plus. Une catégorie inconnue garde toutes les
  // étapes : c'est ce qui laisse éditables les lignes importées hors des cinq
  // cas du classeur.
  const ETAPES_PAR_CATEGORIE: Record<CategoriePeinture, EtapePeinture[]> = {
    TRAVAUX: ['pointage', 'affaire', 'periode', 'surfaces', 'notes'],
    PERSONNEL: ['pointage', 'personnel', 'couts', 'notes'],
    CONSOMMABLE: ['pointage', 'item', 'couts', 'notes'],
    MATERIEL: ['pointage', 'item', 'couts', 'notes'],
    // Le stand-by se déclare pour la journée entière (§10), donc dans le
    // rapport journalier. Ouvrir une ligne STD existante reste possible.
    STD: ['pointage', 'item', 'couts', 'notes'],
  }
  const retenues = cat ? ETAPES_PAR_CATEGORIE[cat] : null
  const etapes = retenues
    ? retenues.map((k) => toutesEtapes.find((e) => e.key === k)!).filter(Boolean)
    : toutesEtapes.filter((e) => e.key !== 'personnel' && e.key !== 'item')

  const libelleCategorie = cat
    ? (CATEGORIES_SAISIE.find((c) => c.valeur === cat)?.libelle ?? cat)
    : 'toutes colonnes'

  return (
    <FormulaireEtapes
      isOpen={isOpen}
      onClose={onClose}
      titre={
        ligneInitiale
          ? `Modifier le pointage du ${ligneInitiale.date} — ${libelleCategorie}`
          : `Nouveau pointage — ${libelleCategorie}`
      }
      libelleSubmit="Enregistrer le pointage"
      cleEdition={`${ligneInitiale?.id ?? 'nouveau'}__${cat ?? 'tout'}`}
      valeurInitiale={() => {
        if (!ligneInitiale) return ligneVide()
        const { id, ...reste } = ligneInitiale
        void id
        return reste
      }}
      etapes={etapes}
      // Tarifs du référentiel puis colonnes calculées : la ligne enregistrée
      // porte les mêmes valeurs que celles affichées pendant la saisie.
      onSubmit={(v) => {
        // La catégorie n'est plus saisie : elle vient du mode choisi. Une
        // ligne déjà enregistrée garde la sienne, casse d'origine comprise —
        // la normaliser changerait la colonne FILTRE du classeur.
        const avecCategorie = { ...v, categorie: ligneInitiale ? v.categorie : (cat ?? v.categorie) }
        return onSubmit(
          deriveLigneJournal({
            ...avecCategorie,
            ...coutsUnitairesDuTarif(tarifs, avecCategorie.typeItem),
            ...productiviteDeLaLigne(avecCategorie, parametres),
          })
        )
      }}
    />
  )
}
