import { useMemo, useState } from 'react'
import { Plus } from 'lucide-react'
import type { LigneJournalTonnage, TonnageContrat } from '../../types/tonnageEchaf'
import {
  MOIS_COURTS,
  moisDeLigne,
  poidsContractuel,
  statutNormalise,
  tonnagePartVariable,
} from '../../lib/tonnageEchafEngine'
import { clesJournalTonnage } from '../../lib/liaisonCles'
import { formatNombre } from '../../lib/format'
import { usePagination } from '../../lib/usePagination'
// Valeurs proposées dans les filtres ET dans les menus du formulaire : les
// listes déroulantes de saisie sont reconstituées depuis les lignes
// existantes, sans jamais interdire une nouvelle valeur (datalist).
import { avecAjouts, valeursDistinctes } from '../../lib/saisie'
import { useListesValeurs } from '../../contexts/useListesValeurs'
import { useAuth } from '../../contexts/useAuth'
import { useResolveur } from '../../contexts/useResolveur'
import { useProjects } from '../../contexts/useProjects'
import { Button } from '../ui/Button'
import { Pagination } from '../ui/Pagination'
import { TableauColonnes } from '../ui/TableauColonnes'
import { BarreFiltresTableau, ChampRecherche, CompteurLignes, FiltreSelect } from '../ui/FiltresTableau'
import { ModaleSuppression } from '../ui/ModaleSuppression'
import { MonPerimetreToggle } from '../liaison/MonPerimetreToggle'
import { JournalTonnageSaisieForm, type JournalTonnageSaisieInput } from './JournalTonnageSaisieForm'
import { colonnesJournal } from './colonnes'
import { useMontant } from '../../lib/montantAffiche'

// Onglet "Journal montage/dépose" — extrait de pages/TonnageEchafPage.tsx le
// 06/08/2026 (la page faisait 1 100 lignes en mêlant chargement des données,
// navigation et le détail de 3 gros tableaux). La page n'orchestre plus que
// le chargement et les onglets ; chaque onglet vit à côté du formulaire de
// saisie et des colonnes qui le concernent.

const PAGE_SIZE = 20

export function JournalTab({
  journal,
  contrat,
  onEnregistrer,
  onSupprimer,
  ouvertureDemandee,
}: {
  journal: LigneJournalTonnage[]
  contrat: TonnageContrat
  onEnregistrer: (input: JournalTonnageSaisieInput) => Promise<void>
  onSupprimer: (ligne: LigneJournalTonnage) => Promise<void>
  /**
   * Ouvre le formulaire de création, préremplie sur cette date et ce champ
   * (03/09/2026, lot 3 — bouton « Ajouter » d'un rapport journalier). Un
   * nouvel objet à chaque demande, comparé par référence : c'est ce qui
   * permet de rouvrir sur la même date/champ sans que rien ne le bloque.
   */
  ouvertureDemandee?: { date: string; champ: string } | null
}) {
  const m = useMontant()
  const { currentUser } = useAuth()
  const resolveur = useResolveur()
  const { projects } = useProjects()
  const [filtreChamp, setFiltreChamp] = useState('')
  const [filtreMois, setFiltreMois] = useState('')
  const [filtreStatut, setFiltreStatut] = useState('')
  const [filtreMode, setFiltreMode] = useState('')
  const [monPerimetre, setMonPerimetre] = useState(false)
  const [recherche, setRecherche] = useState('')
  const [formOuvert, setFormOuvert] = useState(false)
  const [ligneEnEdition, setLigneEnEdition] = useState<LigneJournalTonnage | null>(null)
  const [ligneASupprimer, setLigneASupprimer] = useState<LigneJournalTonnage | null>(null)

  // Ouverture pilotée depuis l'extérieur (le rapport journalier) — ajustée
  // pendant le rendu, même pattern que le pré-remplissage du formulaire
  // lui-même (pas de useEffect en cascade).
  const [ouvertureAppliquee, setOuvertureAppliquee] = useState<typeof ouvertureDemandee>(undefined)
  if (ouvertureDemandee && ouvertureDemandee !== ouvertureAppliquee) {
    setOuvertureAppliquee(ouvertureDemandee)
    setLigneEnEdition(null)
    setFormOuvert(true)
  }

  const { valeursDe } = useListesValeurs()
  const champs = useMemo(() => valeursDistinctes(journal, 'champs'), [journal])
  // Fiches PROJET + intitulés déjà portés par le Journal (03/09/2026, lot 5,
  // TON1-38 : « l'objectif est que le nom du projet renseigné dans le
  // journal soit identique à celui utilisé dans le module PROJET »).
  const projetsSuggeres = useMemo(
    () => [...new Set([...valeursDistinctes(journal, 'projet'), ...projects.map((p) => p.nom)])].sort(),
    [journal, projects]
  )
  const modes = useMemo(() => valeursDistinctes(journal, 'modeFacturation'), [journal])
  const sites = useMemo(() => valeursDistinctes(journal, 'site'), [journal])
  const services = useMemo(() => valeursDistinctes(journal, 'services'), [journal])
  const typesEchafaudage = useMemo(() => valeursDistinctes(journal, 'typeEchafaudage'), [journal])
  const statuts = useMemo(
    () => [...new Set(journal.map((l) => statutNormalise(l)).filter(Boolean))].sort(),
    [journal]
  )
  const mois = useMemo(() => {
    const presents = new Set(journal.map((l) => moisDeLigne(l)).filter(Boolean))
    return MOIS_COURTS.filter((m) => presents.has(m))
  }, [journal])

  const filtered = useMemo(() => {
    const q = recherche.trim().toLowerCase()
    return journal.filter(
      (l) =>
        (!filtreChamp || l.champs === filtreChamp) &&
        (!filtreMois || moisDeLigne(l) === filtreMois) &&
        (!filtreStatut || statutNormalise(l) === filtreStatut) &&
        (!filtreMode || l.modeFacturation === filtreMode) &&
        (!monPerimetre ||
          !currentUser ||
          resolveur.projetParId(resolveur.resoudre('tonnage-echaf', clesJournalTonnage(l))?.projetId ?? '')?.agentId ===
            currentUser.id) &&
        (!q ||
          `${l.projet ?? ''} ${l.numeroDemande ?? ''} ${l.site ?? ''} ${l.demandeurTeepg ?? ''} ${l.description ?? ''}`
            .toLowerCase()
            .includes(q))
    )
  }, [journal, filtreChamp, filtreMois, filtreStatut, filtreMode, recherche, monPerimetre, currentUser, resolveur])

  // Équivalent des cellules SUBTOTAL en tête de la feuille Journal :
  // poids contractuel, tonnage part variable et écart des lignes filtrées.
  const totaux = useMemo(() => {
    let pc = 0
    let pv = 0
    for (const l of filtered) {
      pc += poidsContractuel(l, contrat) ?? 0
      pv += tonnagePartVariable(l, contrat) ?? 0
    }
    return { pc, pv, ecart: pc - pv }
  }, [filtered, contrat])

  const { page, pageCount, visible, setPage, resetPage } = usePagination(filtered, PAGE_SIZE)

  const filtrer = (setter: (v: string) => void) => (v: string) => {
    setter(v)
    resetPage()
  }

  const ouvrirCreation = () => {
    setLigneEnEdition(null)
    setFormOuvert(true)
  }
  const ouvrirEdition = (l: LigneJournalTonnage) => {
    setLigneEnEdition(l)
    setFormOuvert(true)
  }

  const colonnes = colonnesJournal({
    contrat,
    resolveur,
    onEditer: ouvrirEdition,
    onSupprimer: (l) => setLigneASupprimer(l),
    m,
  })

  return (
    <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
      <BarreFiltresTableau>
        <Button type="button" size="sm" onClick={ouvrirCreation} className="gap-1.5">
          <Plus className="w-4 h-4" />
          Nouvelle demande
        </Button>
        <FiltreSelect label="Champ" value={filtreChamp} onChange={filtrer(setFiltreChamp)} options={champs} />
        <FiltreSelect label="Mois" value={filtreMois} onChange={filtrer(setFiltreMois)} options={mois} />
        <FiltreSelect label="Statut" value={filtreStatut} onChange={filtrer(setFiltreStatut)} options={statuts} />
        <FiltreSelect
          label="Mode de facturation"
          value={filtreMode}
          onChange={filtrer(setFiltreMode)}
          options={modes}
        />
        <ChampRecherche
          value={recherche}
          onChange={filtrer(setRecherche)}
          placeholder="Projet, n° demande, site, demandeur, description..."
        />
        <MonPerimetreToggle
          actif={monPerimetre}
          onChange={(v) => {
            setMonPerimetre(v)
            resetPage()
          }}
        />
        <CompteurLignes
          filtrees={formatNombre(filtered.length)}
          total={formatNombre(journal.length)}
          suffixe={` — poids contractuel : ${formatNombre(totaux.pc, 1)} T · part variable : ${formatNombre(
            totaux.pv,
            1
          )} T · écart : ${formatNombre(totaux.ecart, 1)} T`}
        />
      </BarreFiltresTableau>

      <TableauColonnes
        colonnes={colonnes}
        lignes={visible}
        cleLigne={(l) => l.id}
        exportation={{ nomFichier: 'tonnage-journal', titre: 'Journal montage / dépose', lignes: filtered }}
      />

      <Pagination page={page} pageCount={pageCount} onPageChange={setPage} />

      <JournalTonnageSaisieForm
        isOpen={formOuvert}
        onClose={() => setFormOuvert(false)}
        onSubmit={onEnregistrer}
        ligneInitiale={ligneEnEdition}
        contrat={contrat}
        defaut={
          ouvertureDemandee
            ? { date: ouvertureDemandee.date, champs: ouvertureDemandee.champ }
            : undefined
        }
        suggestions={{
          champs: avecAjouts(champs, valeursDe('commun.champs')),
          sites: avecAjouts(sites, valeursDe('tonnage.sites')),
          services: avecAjouts(services, valeursDe('commun.services')),
          typesEchafaudage: avecAjouts(typesEchafaudage, valeursDe('tonnage.typesEchafaudage')),
          statuts,
          projets: projetsSuggeres,
        }}
      />

      {ligneASupprimer && (
        <ModaleSuppression
          titre={`Supprimer la demande « ${ligneASupprimer.numeroDemande ?? ligneASupprimer.id} »`}
          message="Cette saisie sera supprimée définitivement."
          avertissements={[
            'Si cette ligne provenait du classeur importé, elle réapparaîtra avec ses valeurs d\'origine — seule la saisie est retirée. Sinon, elle disparaît du tableau.',
          ]}
          libelleBouton="Supprimer"
          onFerme={() => setLigneASupprimer(null)}
          onConfirmer={async () => {
            await onSupprimer(ligneASupprimer)
            setLigneASupprimer(null)
          }}
        />
      )}
    </div>
  )
}
