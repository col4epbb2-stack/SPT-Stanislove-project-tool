import { useEffect, useMemo, useState } from 'react'
import { collection, doc, getDocs, writeBatch } from 'firebase/firestore'
import { PackageSearch } from 'lucide-react'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { EtatVide } from '../ui/EtatVide'
import { SqueletteeLignes } from '../ui/Squelette'
import { FiltreSelect, ChampRecherche, BarreFiltresTableau } from '../ui/FiltresTableau'
import { Pagination } from '../ui/Pagination'
import { usePagination } from '../../lib/usePagination'
import { useProjects } from '../../contexts/useProjects'
import { db } from '../../lib/firebase'
import { surveillerChargement } from '../../lib/incidents'
import { COLLECTIONS } from '../../lib/firestoreCollections'
import {
  chargerJournalDaProcurement,
  chargerJournalAoProcurement,
  chargerJournalPoProcurement,
  chargerSuiviPrefaProcurement,
  chargerSurveillance,
} from '../../data/procurementFollowUp'
import { combinerParCle } from '../../lib/saisie'
import { selectFiltreClass } from '../ui/classes'

// Affectation en lot d'une fiche projet à des lignes Procurement
// (13/08/2026). Contrairement aux 4 modules à clés naturelles — que
// RapprochementPage rattrape en confirmant une liaison dans le registre —
// Procurement n'a aucune clé : une ligne importée ne peut être rattachée
// qu'en portant explicitement un `projetId`. Sans cet écran, il aurait fallu
// rouvrir chaque ligne dans son formulaire, une par une.
//
// Écriture : un document dans la collection de saisie du journal concerné,
// **doc ID = id de la ligne d'origine**. C'est la convention déjà en place
// dans tout le module (« modifier une ligne importée écrit un document dont
// l'ID est son id d'origine »), et c'est ce qui fait que `combinerParCle`
// remplace la ligne du classeur par la version affectée à l'affichage. Le
// blob importé, lui, n'est jamais modifié — il est en lecture seule.

type CleJournal = 'da' | 'ao' | 'po' | 'surveillance' | 'prefa'

interface LigneAffectable {
  cle: CleJournal
  // Clé de sélection : les ids ne sont uniques qu'au sein d'un journal — une
  // DA et une ligne de préfabrication peuvent porter le même. Sans le
  // préfixe, cocher l'une cocherait l'autre, et l'affectation écrirait dans
  // les deux collections.
  selectionCle: string
  id: string
  reference: string
  libelle: string
  brut: Record<string, unknown>
}

// Les journaux passent par les loaders du module (data/procurementFollowUp)
// plutôt que par des clés de blob redéclarées ici : la surveillance est une
// collection et non un blob, et les intitulés de blob ne sont pas devinables
// (« procurement__suivi-prefa »). Un seul endroit sait où vivent ces données.
const JOURNAUX: {
  cle: CleJournal
  label: string
  charger: () => Promise<Record<string, unknown>[]>
  collectionSaisie: string
  reference: (l: Record<string, unknown>) => string
  libelle: (l: Record<string, unknown>) => string
}[] = [
  {
    cle: 'da',
    label: "Demandes d'achat",
    charger: async () => (await chargerJournalDaProcurement()).das as unknown as Record<string, unknown>[],
    collectionSaisie: COLLECTIONS.procurementDaSaisie,
    reference: (l) => String(l.numero ?? '—'),
    libelle: (l) => String(l.description ?? l.scope ?? ''),
  },
  {
    cle: 'ao',
    label: "Appels d'offres",
    charger: async () => (await chargerJournalAoProcurement()).aos as unknown as Record<string, unknown>[],
    collectionSaisie: COLLECTIONS.procurementAoSaisie,
    reference: (l) => String(l.refAo ?? '—'),
    libelle: (l) => String(l.scope ?? l.code ?? ''),
  },
  {
    cle: 'po',
    label: 'Commandes (PO)',
    charger: async () => (await chargerJournalPoProcurement()).pos as unknown as Record<string, unknown>[],
    collectionSaisie: COLLECTIONS.procurementPoSaisie,
    reference: (l) => String(l.numeroPo ?? '—'),
    libelle: (l) => String(l.scope ?? l.description ?? ''),
  },
  {
    cle: 'surveillance',
    label: 'Surveillance',
    charger: async () => (await chargerSurveillance()) as unknown as Record<string, unknown>[],
    collectionSaisie: COLLECTIONS.procurementSurveillanceSaisie,
    reference: (l) => String(l.numeroPo ?? '—'),
    libelle: (l) => String(l.designation ?? l.scope ?? ''),
  },
  {
    cle: 'prefa',
    label: 'Préfabrication',
    charger: async () => (await chargerSuiviPrefaProcurement()).lignes as unknown as Record<string, unknown>[],
    collectionSaisie: COLLECTIONS.procurementPrefaSaisie,
    reference: (l) => String(l.numeroPo ?? '—'),
    libelle: (l) => String(l.designation ?? ''),
  },
]

// Firestore plafonne un writeBatch à 500 opérations : une affectation de
// masse sur un journal de plusieurs centaines de lignes doit être découpée.
const TAILLE_LOT = 400

async function lireSaisies(nomCollection: string): Promise<Record<string, unknown>[]> {
  // Même principe que la page Procurement : les règles de ces collections ne
  // sont pas déployées, un permission-denied ne doit pas bloquer l'écran — mais
  // il est signalé, sans quoi l'affectation semblerait porter sur des lignes
  // déjà toutes traitées.
  const snap = await surveillerChargement(
    'Les saisies du module Procurement',
    getDocs(collection(db, nomCollection)),
    null
  )
  return snap ? snap.docs.map((d) => ({ id: d.id, ...d.data() })) : []
}

export function AffectationProcurement() {
  const { projects } = useProjects()
  const [lignes, setLignes] = useState<LigneAffectable[] | null>(null)
  const [filtreJournal, setFiltreJournal] = useState('')
  const [recherche, setRecherche] = useState('')
  const [selection, setSelection] = useState<Set<string>>(new Set())
  const [projetId, setProjetId] = useState('')
  const [enCours, setEnCours] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [erreur, setErreur] = useState<string | null>(null)

  const charger = useMemo(
    () => async () => {
      const parJournal = await Promise.all(
        JOURNAUX.map(async (j) => {
          const [importees, saisies] = await Promise.all([
            j.charger().catch(() => [] as Record<string, unknown>[]),
            lireSaisies(j.collectionSaisie),
          ])
          const fusionnees = combinerParCle(importees, saisies, (l) => String(l.id))
          return fusionnees
            .filter((l) => !l.projetId)
            .map<LigneAffectable>((l) => ({
              cle: j.cle,
              selectionCle: `${j.cle}-${String(l.id)}`,
              id: String(l.id),
              reference: j.reference(l),
              libelle: j.libelle(l),
              brut: l,
            }))
        })
      )
      return parJournal.flat()
    },
    []
  )

  useEffect(() => {
    let actif = true
    charger().then((l) => actif && setLignes(l))
    return () => {
      actif = false
    }
  }, [charger])

  const filtrees = useMemo(() => {
    if (!lignes) return []
    const q = recherche.trim().toLowerCase()
    return lignes.filter((l) => {
      if (filtreJournal && JOURNAUX.find((j) => j.cle === l.cle)?.label !== filtreJournal) return false
      if (q && !`${l.reference} ${l.libelle}`.toLowerCase().includes(q)) return false
      return true
    })
  }, [lignes, filtreJournal, recherche])

  const { page, pageCount, visible, setPage, resetPage } = usePagination(filtrees, 15)

  const basculer = (id: string) =>
    setSelection((prev) => {
      const suivant = new Set(prev)
      if (suivant.has(id)) suivant.delete(id)
      else suivant.add(id)
      return suivant
    })

  const toutSelectionner = () => {
    const idsPage = visible.map((l) => l.selectionCle)
    const toutesCochees = idsPage.every((id) => selection.has(id))
    setSelection((prev) => {
      const suivant = new Set(prev)
      idsPage.forEach((id) => (toutesCochees ? suivant.delete(id) : suivant.add(id)))
      return suivant
    })
  }

  const affecter = async () => {
    const cibles = filtrees.filter((l) => selection.has(l.selectionCle))
    if (!projetId || cibles.length === 0) return
    setEnCours(true)
    setErreur(null)
    setMessage(null)
    try {
      for (let i = 0; i < cibles.length; i += TAILLE_LOT) {
        const lot = cibles.slice(i, i + TAILLE_LOT)
        const batch = writeBatch(db)
        for (const ligne of lot) {
          const journal = JOURNAUX.find((j) => j.cle === ligne.cle)
          if (!journal) continue
          // La ligne entière est réécrite dans la collection de saisie : le
          // blob restant en lecture seule, c'est cette copie qui fera foi à
          // l'affichage une fois fusionnée.
          const { id, ...reste } = ligne.brut
          void id
          batch.set(doc(db, journal.collectionSaisie, ligne.id), { ...reste, projetId })
        }
        await batch.commit()
      }
      const nom = projects.find((p) => p.id === projetId)?.nom ?? 'la fiche'
      setMessage(`${cibles.length} ligne(s) rattachée(s) à « ${nom} ».`)
      setSelection(new Set())
      setLignes(await charger())
      resetPage()
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "Échec de l'affectation.")
    } finally {
      setEnCours(false)
    }
  }

  const nbSelection = filtrees.filter((l) => selection.has(l.selectionCle)).length

  return (
    <div className="carte overflow-hidden">
      <div className="px-5 py-4 border-b border-line">
        <div className="flex items-center gap-2">
          <PackageSearch className="w-4 h-4 text-primary" />
          <h3 className="font-semibold text-gray-900">Procurement — affectation par lot</h3>
          {lignes && <Badge label={`${lignes.length} sans projet`} bg="bg-amber-100" text="text-amber-700" />}
        </div>
        <p className="text-xs text-gray-500 mt-1 max-w-3xl">
          Le module Procurement n'a aucune clé de liaison naturelle : ses lignes ne peuvent être rattachées qu'en
          désignant la fiche explicitement. Les lignes importées du classeur ne sont pas modifiées — l'affectation
          écrit une copie dans la collection de saisie, qui prend le dessus à l'affichage.
        </p>
      </div>

      {!lignes ? (
        <div className="p-5">
          <SqueletteeLignes lignes={5} />
        </div>
      ) : lignes.length === 0 ? (
        <EtatVide
          icone={PackageSearch}
          titre="Toutes les lignes sont rattachées"
          description="Aucune ligne Procurement n'est sans fiche projet."
          compact
        />
      ) : (
        <>
          <BarreFiltresTableau>
            <FiltreSelect
              label="Journal"
              value={filtreJournal}
              onChange={(v) => {
                setFiltreJournal(v)
                resetPage()
              }}
              options={JOURNAUX.map((j) => j.label)}
            />
            <ChampRecherche
              value={recherche}
              onChange={(v) => {
                setRecherche(v)
                resetPage()
              }}
              placeholder="Référence ou désignation…"
            />
            <span className="text-xs text-gray-500 whitespace-nowrap ml-auto">
              {filtrees.length} ligne(s) · {nbSelection} sélectionnée(s)
            </span>
          </BarreFiltresTableau>

          <div className="flex flex-wrap items-end gap-3 px-5 py-3 bg-surface-muted border-b border-line">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Fiche projet à affecter</label>
              <select className={selectFiltreClass} value={projetId} onChange={(e) => setProjetId(e.target.value)}>
                <option value="">— Sélectionner —</option>
                {[...projects]
                  .sort((a, b) => a.nom.localeCompare(b.nom))
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nom}
                    </option>
                  ))}
              </select>
            </div>
            <Button onClick={affecter} disabled={!projetId || nbSelection === 0} loading={enCours}>
              Affecter à {nbSelection} ligne(s)
            </Button>
            {message && <p className="text-xs text-emerald-700">{message}</p>}
            {erreur && <p className="text-xs text-red-600">{erreur}</p>}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-gray-500">
                  <th className="px-3 py-2 w-10">
                    <input
                      type="checkbox"
                      aria-label="Tout sélectionner sur cette page"
                      checked={visible.length > 0 && visible.every((l) => selection.has(l.selectionCle))}
                      onChange={toutSelectionner}
                      className="rounded border-gray-300 text-primary focus:ring-primary/40"
                    />
                  </th>
                  <th className="px-3 py-2 font-medium whitespace-nowrap">Journal</th>
                  <th className="px-3 py-2 font-medium whitespace-nowrap">Référence</th>
                  <th className="px-3 py-2 font-medium">Désignation</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {visible.map((l) => (
                  <tr key={l.selectionCle} className="hover:bg-gray-50">
                    <td className="px-3 py-2">
                      <input
                        type="checkbox"
                        checked={selection.has(l.selectionCle)}
                        onChange={() => basculer(l.selectionCle)}
                        className="rounded border-gray-300 text-primary focus:ring-primary/40"
                      />
                    </td>
                    <td className="px-3 py-2 text-gray-500 whitespace-nowrap">
                      {JOURNAUX.find((j) => j.cle === l.cle)?.label}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs text-gray-700 whitespace-nowrap">{l.reference}</td>
                    <td className="px-3 py-2 text-gray-900 max-w-96 truncate" title={l.libelle}>
                      {l.libelle || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <Pagination page={page} pageCount={pageCount} onPageChange={setPage} total={filtrees.length} />
        </>
      )}
    </div>
  )
}
