import { useMemo, useState } from 'react'
import { Columns3, Plus } from 'lucide-react'
import { syntheseCommentairesMetal, type AffaireMetal, type MetalReferentiel } from '../../types/travauxMetal'
import { clesAffaireMetal } from '../../lib/liaisonCles'
import { formatNombre } from '../../lib/format'
import { usePagination } from '../../lib/usePagination'
// Le référentiel "Data Travaux METAL" complète les valeurs déjà utilisées :
// une valeur listée mais encore jamais employée doit rester proposable.
import { avecAjouts, valeursDistinctes } from '../../lib/saisie'
import { useListesValeurs } from '../../contexts/useListesValeurs'
import { useAuth } from '../../contexts/useAuth'
import { useResolveur } from '../../contexts/useResolveur'
import { Button } from '../ui/Button'
import { Pagination } from '../ui/Pagination'
import { TableauColonnes } from '../ui/TableauColonnes'
import { BarreFiltresTableau, ChampRecherche, CompteurLignes, FiltreSelect } from '../ui/FiltresTableau'
import { SelecteurAffichage } from '../ui/SelecteurAffichage'
import { ModaleSuppression } from '../ui/ModaleSuppression'
import { usePreferenceSelection } from '../../lib/preferencesAffichage'
import { MonPerimetreToggle } from '../liaison/MonPerimetreToggle'
import { AffaireMetalSaisieForm, type AffaireMetalSaisieInput } from './AffaireMetalSaisieForm'
import { colonnesAffairesMetal } from './colonnes'
import { CATALOGUE_COLONNES, COLONNES_DEFAUT, COLONNE_VERROUILLEE, GROUPES_COLONNES } from './affichageMetal'
import { useMontant } from '../../lib/montantAffiche'

// Onglet "Travaux METAL" — extrait de pages/TravauxMetalPage.tsx le
// 06/08/2026, et doté à cette occasion de son point de saisie
// (AffaireMetalSaisieForm), comme le Journal montage/dépose du module
// Tonnage. Même organisation que components/tonnage/JournalTab.tsx.

const PAGE_SIZE = 20

export function AffairesTab({
  affaires,
  referentiel,
  onEnregistrer,
  onSupprimer,
}: {
  affaires: AffaireMetal[]
  referentiel: MetalReferentiel
  onEnregistrer: (input: AffaireMetalSaisieInput, initiale: AffaireMetal | null) => Promise<void>
  onSupprimer: (affaire: AffaireMetal) => Promise<void>
}) {
  const m = useMontant()
  const { currentUser } = useAuth()
  const resolveur = useResolveur()
  const [filtreChamp, setFiltreChamp] = useState('')
  const [filtreStatut, setFiltreStatut] = useState('')
  const [filtreTypeTravaux, setFiltreTypeTravaux] = useState('')
  const [filtreTypeAvis, setFiltreTypeAvis] = useState('')
  const [monPerimetre, setMonPerimetre] = useState(false)
  const [recherche, setRecherche] = useState('')
  const [formOuvert, setFormOuvert] = useState(false)
  const [affaireEnEdition, setAffaireEnEdition] = useState<AffaireMetal | null>(null)
  const [affaireASupprimer, setAffaireASupprimer] = useState<AffaireMetal | null>(null)
  // Colonnes visibles du tableau (04/09/2026, lot 1 du recueil) : les 42
  // colonnes étaient jusqu'ici toutes affichées en permanence, sans aucun
  // moyen d'en masquer — 8 d'entre elles (statut corrigé, durées, checks
  // CFP/CFT) restent en base pour les contrôles mais n'ont pas à s'imposer à
  // tous les utilisateurs, cf. COLONNES_DEFAUT.
  const [colonnesVisibles, setColonnesVisibles] = usePreferenceSelection(
    'metal.colonnes',
    COLONNES_DEFAUT,
    CATALOGUE_COLONNES
  )

  const { valeursDe } = useListesValeurs()
  const champs = useMemo(() => valeursDistinctes(affaires, 'champ', referentiel.champs), [affaires, referentiel])
  const statuts = useMemo(
    () => valeursDistinctes(affaires, 'statutTravaux', referentiel.statutsTravaux),
    [affaires, referentiel]
  )
  const typesTravaux = useMemo(
    () => valeursDistinctes(affaires, 'typeTravaux', referentiel.typesTravaux),
    [affaires, referentiel]
  )
  const typesAvis = useMemo(() => valeursDistinctes(affaires, 'typeAvis', referentiel.typesAvis), [affaires, referentiel])
  const plateformes = useMemo(() => valeursDistinctes(affaires, 'plateforme', referentiel.sites), [affaires, referentiel])
  const risques = useMemo(() => valeursDistinctes(affaires, 'risques', referentiel.risques), [affaires, referentiel])
  const typesCoreCrew = useMemo(() => valeursDistinctes(affaires, 'typeCoreCrew'), [affaires])
  const priorites = useMemo(() => valeursDistinctes(affaires, 'priorite'), [affaires])

  // Les filtres portent sur les valeurs réellement présentes (proposer un
  // filtre qui ne peut rien retenir n'aide personne), contrairement aux menus
  // de saisie ci-dessus qui s'ouvrent au référentiel complet.
  const filtresChamps = useMemo(() => valeursDistinctes(affaires, 'champ'), [affaires])
  const filtresStatuts = useMemo(() => valeursDistinctes(affaires, 'statutTravaux'), [affaires])
  const filtresTypesTravaux = useMemo(() => valeursDistinctes(affaires, 'typeTravaux'), [affaires])
  const filtresTypesAvis = useMemo(() => valeursDistinctes(affaires, 'typeAvis'), [affaires])

  const filtered = useMemo(() => {
    const q = recherche.trim().toLowerCase()
    return affaires.filter(
      (a) =>
        (!filtreChamp || a.champ === filtreChamp) &&
        (!filtreStatut || a.statutTravaux === filtreStatut) &&
        (!filtreTypeTravaux || a.typeTravaux === filtreTypeTravaux) &&
        (!filtreTypeAvis || a.typeAvis === filtreTypeAvis) &&
        (!monPerimetre ||
          !currentUser ||
          resolveur.projetParId(resolveur.resoudre('travaux-metal', clesAffaireMetal(a))?.projetId ?? '')?.agentId ===
            currentUser.id) &&
        (!q ||
          // Commentaires par étape inclus (04/09/2026, lot 4, MET-31 :
          // « tous doivent être consultables depuis l'espace commentaire
          // global ») — la recherche en fait partie.
          `${a.affaire ?? ''} ${a.po ?? ''} ${a.ot ?? ''} ${a.avis ?? ''} ${a.plateforme ?? ''} ${syntheseCommentairesMetal(a)}`
            .toLowerCase()
            .includes(q))
    )
  }, [
    affaires,
    filtreChamp,
    filtreStatut,
    filtreTypeTravaux,
    filtreTypeAvis,
    recherche,
    monPerimetre,
    currentUser,
    resolveur,
  ])

  const { page, pageCount, visible, setPage, resetPage } = usePagination(filtered, PAGE_SIZE)

  const filtrer = (setter: (v: string) => void) => (v: string) => {
    setter(v)
    resetPage()
  }

  const ouvrirCreation = () => {
    setAffaireEnEdition(null)
    setFormOuvert(true)
  }
  const ouvrirEdition = (a: AffaireMetal) => {
    setAffaireEnEdition(a)
    setFormOuvert(true)
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
      <BarreFiltresTableau>
        <Button type="button" size="sm" onClick={ouvrirCreation} className="gap-1.5">
          <Plus className="w-4 h-4" />
          Nouvelle affaire
        </Button>
        <FiltreSelect label="Champ" value={filtreChamp} onChange={filtrer(setFiltreChamp)} options={filtresChamps} />
        <FiltreSelect
          label="Statut travaux"
          value={filtreStatut}
          onChange={filtrer(setFiltreStatut)}
          options={filtresStatuts}
        />
        <FiltreSelect
          label="Type de travaux"
          value={filtreTypeTravaux}
          onChange={filtrer(setFiltreTypeTravaux)}
          options={filtresTypesTravaux}
        />
        <FiltreSelect
          label="Type d'avis"
          value={filtreTypeAvis}
          onChange={filtrer(setFiltreTypeAvis)}
          options={filtresTypesAvis}
        />
        <ChampRecherche
          value={recherche}
          onChange={filtrer(setRecherche)}
          placeholder="Affaire, PO, OT, avis, plateforme..."
        />
        <MonPerimetreToggle
          actif={monPerimetre}
          onChange={(v) => {
            setMonPerimetre(v)
            resetPage()
          }}
        />
        <CompteurLignes filtrees={formatNombre(filtered.length)} total={formatNombre(affaires.length)} />
      </BarreFiltresTableau>

      <div className="flex flex-wrap items-center gap-2 px-5 py-3 border-b border-gray-100">
        <SelecteurAffichage
          libelle="Colonnes"
          icone={<Columns3 className="w-4 h-4 text-gray-400" />}
          groupes={GROUPES_COLONNES}
          selection={colonnesVisibles}
          onChange={setColonnesVisibles}
          verrouilles={[COLONNE_VERROUILLEE]}
          alignement="gauche"
        />
      </div>

      <TableauColonnes
        colonnes={colonnesAffairesMetal({
          resolveur,
          onEditer: ouvrirEdition,
          onSupprimer: (a) => setAffaireASupprimer(a),
          m,
        }).filter((c) => c.cle === 'editer' || c.cle === 'supprimer' || colonnesVisibles.includes(c.cle))}
        lignes={visible}
        cleLigne={(a) => a.id}
        messageVide="Aucune affaire ne correspond aux filtres."
        exportation={{ nomFichier: 'travaux-metal-affaires', titre: 'Travaux METAL — affaires', lignes: filtered }}
      />

      <Pagination page={page} pageCount={pageCount} onPageChange={setPage} />

      <AffaireMetalSaisieForm
        isOpen={formOuvert}
        onClose={() => setFormOuvert(false)}
        onSubmit={(input) => onEnregistrer(input, affaireEnEdition)}
        affaireInitiale={affaireEnEdition}
        suggestions={{
          // Valeurs des affaires + référentiel du classeur (déjà fusionnés
          // ci-dessus) + valeurs ajoutées dans Paramètres › Listes de valeurs.
          // Les filtres de la barre gardent, eux, les seules valeurs présentes
          // dans les affaires.
          champs: avecAjouts(champs, valeursDe('commun.champs')),
          plateformes: avecAjouts(plateformes, valeursDe('commun.plateformes')),
          typesTravaux: avecAjouts(typesTravaux, valeursDe('metal.typesTravaux')),
          typesAvis: avecAjouts(typesAvis, valeursDe('metal.typesAvis')),
          statutsTravaux: avecAjouts(statuts, valeursDe('metal.statutsTravaux')),
          risques: avecAjouts(risques, valeursDe('metal.risques')),
          typesCoreCrew: avecAjouts(typesCoreCrew, valeursDe('metal.typesCoreCrew')),
          priorites: avecAjouts(priorites, valeursDe('metal.priorites')),
        }}
      />

      {affaireASupprimer && (
        <ModaleSuppression
          titre={`Supprimer l'affaire « ${affaireASupprimer.affaire ?? affaireASupprimer.id} »`}
          message="Cette saisie sera supprimée définitivement."
          avertissements={[
            'Si cette affaire provenait du classeur importé, elle réapparaîtra avec ses valeurs d\'origine — seule la saisie est retirée. Sinon, elle disparaît du tableau.',
          ]}
          libelleBouton="Supprimer"
          onFerme={() => setAffaireASupprimer(null)}
          onConfirmer={async () => {
            await onSupprimer(affaireASupprimer)
            setAffaireASupprimer(null)
          }}
        />
      )}
    </div>
  )
}
