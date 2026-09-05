import { useMemo, useState } from 'react'
import { ArrowRight } from 'lucide-react'
import { Pagination } from '../ui/Pagination'
import { TableauColonnes, type ColonneTableau } from '../ui/TableauColonnes'
import { BarreFiltresTableau, ChampRecherche, CompteurLignes, FiltreSelect } from '../ui/FiltresTableau'
import { usePagination } from '../../lib/usePagination'
import { formatNombre } from '../../lib/format'
import { EnteteOnglet, MessageVide } from './elements'
import type { EntiteEpcm, EntreeHistoriqueEpcm } from '../../types/contratEpcm'

// Onglet « Historique » (§12) : utilisateur, date, heure, ancienne et
// nouvelle valeur. Écrit dans le même batch que la donnée modifiée (cf.
// lib/contratEpcmFirestore.ts) et non modifiable, pas même par un admin —
// les règles Firestore interdisent update et delete sur la collection.

const ENTITES: EntiteEpcm[] = ['EMPLOYE', 'PLANNING', 'POINTAGE', 'ROTATION', 'CONTRAT', 'PROFIL']
const PAGE_SIZE = 25

function horodatageLisible(iso: string): string {
  const d = new Date(iso)
  return `${d.toLocaleDateString('fr-FR')} ${d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`
}

export function HistoriqueTab({ historique }: { historique: EntreeHistoriqueEpcm[] }) {
  const [recherche, setRecherche] = useState('')
  const [filtreEntite, setFiltreEntite] = useState('')
  const [filtreUtilisateur, setFiltreUtilisateur] = useState('')

  const utilisateurs = useMemo(
    () => [...new Set(historique.map((h) => h.utilisateurNom).filter(Boolean))].sort(),
    [historique]
  )

  const filtres = useMemo(() => {
    const q = recherche.trim().toLowerCase()
    return historique
      .filter(
        (h) =>
          (!filtreEntite || h.entite === filtreEntite) &&
          (!filtreUtilisateur || h.utilisateurNom === filtreUtilisateur) &&
          (!q ||
            h.libelle.toLowerCase().includes(q) ||
            h.champ.toLowerCase().includes(q) ||
            (h.nouvelleValeur ?? '').toLowerCase().includes(q))
      )
      .sort((a, b) => b.horodatage.localeCompare(a.horodatage))
  }, [historique, recherche, filtreEntite, filtreUtilisateur])

  const { page, pageCount, visible, setPage, resetPage } = usePagination(filtres, PAGE_SIZE)

  const colonnes: ColonneTableau<EntreeHistoriqueEpcm>[] = [
    { cle: 'horodatage', entete: 'Date et heure', valeur: (h) => horodatageLisible(h.horodatage) },
    { cle: 'utilisateur', entete: 'Utilisateur', valeur: (h) => h.utilisateurNom || '—' },
    {
      cle: 'entite',
      entete: 'Objet',
      valeur: (h) => (
        <span className="px-2 py-0.5 rounded-md bg-gray-100 text-gray-600 text-[11px] font-semibold">{h.entite}</span>
      ),
    },
    { cle: 'libelle', entete: 'Concerné', valeur: (h) => h.libelle, classeCellule: 'max-w-72 truncate', titre: (h) => h.libelle },
    { cle: 'champ', entete: 'Champ', valeur: (h) => h.champ },
    {
      cle: 'valeurs',
      entete: 'Modification',
      valeur: (h) => (
        <span className="inline-flex items-center gap-2 text-xs">
          <span className="text-gray-400 line-through">{h.ancienneValeur ?? '∅'}</span>
          <ArrowRight className="w-3 h-3 text-gray-300" />
          <span className="text-gray-900 font-medium">{h.nouvelleValeur ?? '∅'}</span>
        </span>
      ),
    },
  ]

  return (
    <div className="space-y-4">
      <EnteteOnglet
        titre="Historique des modifications"
        aide="Une ligne par champ modifié. Les 500 dernières entrées sont chargées ; elles ne peuvent être ni corrigées ni supprimées."
      />

      {historique.length === 0 ? (
        <MessageVide>Aucune modification enregistrée pour l'instant.</MessageVide>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
          <BarreFiltresTableau>
            <FiltreSelect label="Objet" value={filtreEntite} onChange={(v) => { setFiltreEntite(v); resetPage() }} options={ENTITES} />
            <FiltreSelect label="Utilisateur" value={filtreUtilisateur} onChange={(v) => { setFiltreUtilisateur(v); resetPage() }} options={utilisateurs} />
            <ChampRecherche value={recherche} onChange={(v) => { setRecherche(v); resetPage() }} placeholder="Concerné, champ, valeur…" />
            <CompteurLignes filtrees={formatNombre(filtres.length)} total={formatNombre(historique.length)} />
          </BarreFiltresTableau>
          <TableauColonnes
            colonnes={colonnes}
            lignes={visible}
            cleLigne={(h) => h.id}
            exportation={{ nomFichier: 'epcm-historique', titre: 'EPCM — historique des modifications', lignes: filtres }}
          />
          <Pagination page={page} pageCount={pageCount} onPageChange={setPage} total={filtres.length} itemLabel="entrées" />
        </div>
      )}
    </div>
  )
}
