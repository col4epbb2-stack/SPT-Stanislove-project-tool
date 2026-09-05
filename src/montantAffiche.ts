import { useMemo } from 'react'
import { useDevises } from '../contexts/useDevises'
import {
  convertirEchelle,
  FACTEUR_ECHELLE,
  formaterMontant,
  formaterTaux,
  uniteMontant,
  type CodeDevise,
  type Devise,
  type EchelleMontant,
} from '../types/devise'
import { EMPLOIS_DEVISE, type EmploiDevise, type UniteMontant } from './unitesMontant'

// Affichage des montants dans la devise du système (19/08/2026, demande
// explicite « la devise définie dans le système va afficher une information
// pour toutes les interfaces, les calculs se feront via les conversions »).
//
// Jusqu'ici chaque écran affichait ses montants dans l'unité de son classeur
// source : des KUSD dans la navette, des francs CFA dans les journaux
// terrain, la devise de la fiche dans les projets. Lire un portefeuille
// demandait donc de convertir de tête d'un écran à l'autre. Désormais **une
// seule devise s'affiche partout** — celle du pivot, qui est aussi la
// référence de tous les taux (décision du 19/08/2026 : pas de second réglage,
// le pivot fait foi).
//
// Ce que ça ne change pas, et c'est le point important : **l'unité
// d'enregistrement**. Chaque module continue d'écrire dans celle de son
// classeur, parce que tout l'historique importé y est déjà compté et que rien
// ne dit dans quoi il l'était sinon. La conversion est faite au dernier
// moment, à l'affichage.
//
// **21/08/2026** : l'échelle suit le même sort que la devise. Elle restait
// celle du module (des milliers pour les colonnes budgétaires du classeur, des
// unités partout ailleurs), au motif que ça gardait les ordres de grandeur
// lisibles — mais ça laissait cohabiter à l'écran un contrat à
// « 500 000 000 USD » et la ligne navette qui le porte à « 40 000 KUSD ».
// Tout s'affiche désormais à l'unité (cf. `ECHELLE_AFFICHAGE`).

/**
 * Lit une unité écrite comme les écrans la nomment : « KUSD » (milliers de
 * dollars) ou « XAF » (francs CFA à l'unité).
 *
 * Les 121 appels d'affichage de l'application passaient déjà ce libellé à
 * `formatMontant` — le garder évite d'aller réécrire chaque site d'appel pour
 * y séparer la devise de l'échelle, et le `K` de tête est une convention sans
 * ambiguïté (les codes ISO font 3 lettres).
 */
export function uniteDepuisLibelle(libelle: string): UniteMontant {
  const texte = (libelle ?? '').trim().toUpperCase()
  if (/^K[A-Z]{3}$/.test(texte)) return { devise: texte.slice(1), echelle: 'millier' }
  return { devise: texte, echelle: 'unite' }
}

/**
 * Ce dont une définition de colonne a besoin pour afficher un montant.
 *
 * Ces définitions (les fichiers `colonnes.tsx` des modules) ne sont pas des
 * composants :
 * elles ne peuvent pas appeler `useMontant()`. L'onglet qui les construit le
 * fait et leur passe ceci — comme il leur passe déjà le résolveur ou le
 * contrat.
 */
export interface FormateurMontant {
  montant: (valeur: number | null | undefined, unite: string) => string
  uniteAffichee: (unite: string) => string
}

export interface MontantAffiche {
  /** Valeur convertie, ou la valeur d'origine quand la conversion est impossible. */
  valeur: number | null
  /** Unité dans laquelle cette valeur est exprimée. */
  unite: UniteMontant
  /** La conversion a-t-elle eu lieu ? `false` = affiché dans son unité d'origine. */
  converti: boolean
}

/**
 * Échelle dans laquelle **tous** les montants s'affichent (21/08/2026, demande
 * explicite « 1 KUSD = 1 000 USD, mais on va afficher USD partout »).
 *
 * L'échelle appartenait au module jusqu'ici : les colonnes budgétaires de la
 * navette et de la feuille de route comptaient en milliers parce que leurs
 * classeurs les y comptent, tandis que les contrats, les commandes et les
 * fiches projet comptent à l'unité. Lire un engagement de « 500 000 000 USD »
 * sur un contrat et un budget de « 40 000 KUSD » sur la ligne navette qui le
 * porte demandait de convertir de tête d'un écran à l'autre — c'est ce que
 * relève `doc/Navette commentaires.docx` (« tous les montants sont exprimés en
 * USD, pour une harmonisation correcte on va garder tout en USD »).
 *
 * Ce que ça ne change pas : **l'unité d'enregistrement**. Chaque module écrit
 * toujours dans celle de son classeur, où tout l'historique importé est déjà
 * compté. La mise à l'échelle est faite au dernier moment, à l'affichage, au
 * même endroit et en même temps que la conversion de devise.
 */
export const ECHELLE_AFFICHAGE: EchelleMontant = 'unite'

/**
 * Convertit un montant vers la devise du système, et le ramène à l'unité.
 *
 * Quand la conversion de devise n'est pas possible (taux non renseigné,
 * devise absente du référentiel), on rend le montant **dans sa devise
 * d'origine** plutôt qu'un tiret : un chiffre juste dans une autre devise vaut
 * mieux qu'un écran vide, à condition de dire laquelle — d'où `converti`, que
 * l'appelant peut signaler. La mise à l'échelle, elle, a lieu dans tous les
 * cas : c'est une multiplication exacte, elle ne dépend d'aucun taux.
 */
export function convertirPourAffichage(
  valeur: number | null | undefined,
  libelleUnite: string,
  devises: Devise[],
  systeme: CodeDevise
): MontantAffiche {
  const source = uniteDepuisLibelle(libelleUnite)
  const uniteOrigine: UniteMontant = { devise: source.devise, echelle: ECHELLE_AFFICHAGE }
  if (valeur == null || !Number.isFinite(valeur)) return { valeur: null, unite: uniteOrigine, converti: false }
  const cible: UniteMontant = { devise: systeme, echelle: ECHELLE_AFFICHAGE }
  const converti = convertirEchelle(
    valeur,
    { code: source.devise, echelle: source.echelle },
    { code: cible.devise, echelle: cible.echelle },
    devises
  )
  if (converti === null) {
    return {
      valeur: valeur * FACTEUR_ECHELLE[source.echelle],
      unite: uniteOrigine,
      converti: false,
    }
  }
  return { valeur: converti, unite: cible, converti: true }
}

/**
 * Accès aux montants pour un composant : `montant()` remplace `formatMontant`
 * au site d'appel, avec exactement la même signature — la conversion
 * s'intercale sans avoir à toucher les 121 endroits qui affichent un montant.
 *
 * `cible` — devise d'affichage **de cet écran**, quand il en propose une
 * (27/08/2026, `doc/EPCM_rev01.docx` point 7 : « je pourrais saisir un contrat
 * en XAF […] puis l'interface convertirait ou afficherait automatiquement les
 * montants dans une autre devise de référence (USD ou EUR). Cela éviterait de
 * nombreux allers-retours vers l'onglet Paramètres uniquement pour changer la
 * devise »).
 *
 * **Sans argument, rien ne change** : la devise du système fait foi, comme
 * depuis le 19/08/2026 — c'est le cas des 21 écrans qui appellent ce hook.
 * Un écran qui passe une cible ne déplace pas le réglage global : il choisit
 * seulement dans quoi **il** s'affiche, et doit le dire, sans quoi ses
 * chiffres se compareraient à ceux du reste de l'application dans une autre
 * unité sans que rien ne le signale.
 */
export function useMontant(cible?: CodeDevise | null) {
  const { devises, pivot } = useDevises()

  return useMemo(() => {
    const systeme = cible ?? pivot.code

    /** Montant formaté dans la devise du système (« 1 234 KUSD »). */
    const montant = (valeur: number | null | undefined, libelleUnite: string): string => {
      const affiche = convertirPourAffichage(valeur, libelleUnite, devises, systeme)
      return formaterMontant(affiche.valeur, affiche.unite.devise, devises, affiche.unite.echelle)
    }

    /** Valeur nue, pour un total à recalculer ou une extraction chiffrée. */
    const valeurAffichee = (valeur: number | null | undefined, libelleUnite: string): number | null =>
      convertirPourAffichage(valeur, libelleUnite, devises, systeme).valeur

    /**
     * Unité telle qu'elle doit apparaître en en-tête de colonne : « KUSD »
     * devient « USD », et « XAF » si le système compte en francs CFA. Rend la
     * devise d'origine quand le taux manque — l'en-tête ne doit jamais
     * annoncer une devise que les cellules n'ont pas ; l'échelle, elle, est
     * toujours celle de l'affichage (cf. `ECHELLE_AFFICHAGE`).
     */
    const uniteAffichee = (libelleUnite: string): string => {
      const source = uniteDepuisLibelle(libelleUnite)
      const affiche = convertirPourAffichage(1, libelleUnite, devises, systeme)
      return uniteMontant(affiche.converti ? systeme : source.devise, ECHELLE_AFFICHAGE)
    }

    /**
     * Unité d'un montant **déjà compté dans la devise du système**.
     *
     * Les agrégats multi-devises (`sommeCycles`, `pdcRevises`) et la cale sont
     * exprimés dans le pivot, pas en dollars : les libeller « KUSD » les
     * faisait reconvertir une seconde fois par `montant()` — un facteur ~547
     * sur un portefeuille affiché en francs CFA. Ce n'est pas une préférence
     * d'écriture, c'est le seul libellé juste pour ces valeurs-là.
     *
     * L'échelle par défaut reste `millier` : ces agrégats portent celle de la
     * navette, dont les cycles sont comptés en milliers. C'est bien l'unité
     * d'**enregistrement** qu'on nomme ici, pas celle d'affichage.
     */
    const uniteSysteme = (echelle: EchelleMontant = 'millier'): string => uniteMontant(systeme, echelle)

    /** Le taux manque-t-il pour afficher cette unité dans la devise système ? */
    const conversionManquante = (libelleUnite: string): boolean =>
      !convertirPourAffichage(1, libelleUnite, devises, systeme).converti

    return { montant, valeurAffichee, uniteAffichee, uniteSysteme, conversionManquante, systeme, devises }
  }, [devises, pivot, cible])
}

export interface EmploiAffiche extends EmploiDevise {
  /** Unité d'enregistrement telle qu'elle s'écrit (« KUSD »), ou la mention pour une devise portée par la donnée. */
  uniteStockage: string
  /** Taux appliqué à l'affichage (« 1 XAF = 0,00182939 USD »), `null` si sans objet ou inconnu. */
  taux: string | null
  /** Exemple converti, pour vérifier d'un coup d'œil. */
  exemple: string | null
  /** Ce module peut-il être affiché dans la devise du système ? */
  convertible: boolean
  /** Son unité d'enregistrement est déjà celle du système : rien à convertir. */
  identique: boolean
}

/**
 * Le tableau « où les devises s'appliquent » de l'écran Devises, calculé
 * contre le référentiel en place plutôt que décrit à la main.
 *
 * Chaque ligne dit désormais **le taux réellement appliqué** et un exemple
 * converti : c'est ce qui permet de vérifier que ce qu'annonce l'écran est ce
 * que font les autres écrans. Un module dont l'unité n'est pas convertible
 * vers la devise du système le dit ici, à l'endroit où on vient chercher la
 * règle.
 */
export function emploisAffiches(devises: Devise[], systeme: CodeDevise): EmploiAffiche[] {
  return EMPLOIS_DEVISE.map((emploi) => {
    if (!emploi.unite) {
      // Unité portée par la donnée : convertible tant que toute devise
      // proposable à cette donnée a un taux.
      const proposables = devises.filter((d) => d.actif)
      const sansTaux = proposables.filter((d) => !d.pivot && d.taux == null)
      return {
        ...emploi,
        uniteStockage: 'Devise de la donnée',
        taux: null,
        exemple: null,
        convertible: sansTaux.length === 0,
        identique: false,
      }
    }
    const libelle = uniteMontant(emploi.unite.devise, emploi.unite.echelle)
    const affiche = convertirPourAffichage(1000, libelle, devises, systeme)
    // Un module qui enregistre déjà dans la devise du système n'a pas de taux
    // à montrer : « 1 USD = 1 USD » occuperait une ligne pour ne rien dire.
    const identique = emploi.unite.devise === systeme
    return {
      ...emploi,
      uniteStockage: libelle,
      taux: identique ? null : formaterTaux(emploi.unite.devise, systeme, devises),
      identique,
      // L'exemple sert dès que l'affichage ne rend pas le nombre enregistré :
      // un taux appliqué, **ou** une simple mise à l'échelle (21/08/2026). Les
      // colonnes en milliers d'un classeur s'affichant désormais à l'unité, le
      // masquer quand seule l'échelle change laisserait le seul écran censé
      // vérifier ce que font les autres muet sur un facteur 1 000.
      exemple:
        affiche.converti && (!identique || emploi.unite.echelle !== ECHELLE_AFFICHAGE)
          ? `${formaterMontant(1000, emploi.unite.devise, devises, emploi.unite.echelle)} → ${formaterMontant(
              affiche.valeur,
              affiche.unite.devise,
              devises,
              affiche.unite.echelle
            )}`
          : null,
      convertible: affiche.converti,
    }
  })
}
