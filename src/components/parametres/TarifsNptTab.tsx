import { useEffect, useState } from 'react'
import { Coins, Plus } from 'lucide-react'
import { doc, getDoc, setDoc } from 'firebase/firestore'
import { db } from '../../lib/firebase'
import { COLLECTIONS } from '../../lib/firestoreCollections'
import { surveillerChargement } from '../../lib/incidents'
import type { GrilleTarifsNpt } from '../../lib/hebdoCrjEngine'
import { useListesValeurs } from '../../contexts/useListesValeurs'
import { ChampMontant } from '../ui/ChampMontant'
import { UNITE_XAF } from '../../lib/unitesMontant'
import { montantDepuisTexte, texteDepuisMontant } from '../../lib/saisie'
import { Button } from '../ui/Button'
import { Input } from '../ui/Input'

// Grille de tarifs NPT — coût journalier d'un profil de personnel et d'un type
// de matériel (23/08/2026, `doc/commentaires CRJ_rev02.docx`, répété depuis la
// première version : « prévoir, en back-end, la possibilité d'intégrer le coût
// (PU) des équipements […] de la même manière, pour le personnel, il devrait
// être possible de renseigner en back-end le coût journalier de chaque
// ressource »).
//
// **Elle vivait dans l'onglet « Coût standby » du CRJ** — là où son résultat se
// lit, pas là où un réglage d'administration se règle. Le document parle de
// back-end, et cet écran est celui que l'application appelle ainsi : les tarifs
// rejoignent donc les listes de valeurs, sous le même régime (lecture pour
// tous, écriture admin).
//
// Ce qu'elle alimente : `coutStandbyGlobal()` (lib/hebdoCrjEngine.ts), donc
// l'onglet « Coût standby » du CRJ. Un profil sans tarif y pèse 0 — l'écran le
// dit plutôt que d'inventer un montant.

const DOC_ID = 'grille'
const HEURES_JOUR_DEFAUT = 12

/**
 * Lignes à tarifer : ce que le référentiel déclare, **plus** ce que la grille
 * porte déjà. Un profil retiré des listes de valeurs ne doit pas emporter son
 * tarif avec lui — il resterait appliqué au calcul sans plus être visible.
 */
function lignesTarifs(declares: string[], tarifes: Record<string, number>): string[] {
  return [...new Set([...declares, ...Object.keys(tarifes)])].sort((a, b) => a.localeCompare(b, 'fr'))
}

function BlocTarifs({
  titre,
  aide,
  lignes,
  valeurs,
  onChange,
  onAjouter,
  editable,
}: {
  titre: string
  aide: string
  lignes: string[]
  valeurs: Record<string, string>
  onChange: (cle: string, valeur: string) => void
  onAjouter: (cle: string) => void
  editable: boolean
}) {
  const [nouveau, setNouveau] = useState('')

  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-5">
      <p className="font-semibold text-gray-900">{titre}</p>
      <p className="text-xs text-gray-500 mt-0.5 mb-3">{aide}</p>

      {lignes.length === 0 ? (
        <p className="text-sm text-gray-400">
          Rien à tarifer pour l'instant — déclarez les valeurs dans l'onglet « Listes de valeurs », ou ajoutez-en une
          ci-dessous.
        </p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {lignes.map((cle) => (
            <ChampMontant
              key={cle}
              label={cle}
              devise={UNITE_XAF.devise}
              min={0}
              disabled={!editable}
              value={montantDepuisTexte(valeurs[cle] ?? '')}
              onChange={(v) => onChange(cle, texteDepuisMontant(v))}
            />
          ))}
        </div>
      )}

      {/* Une valeur qui n'est ni au référentiel ni déjà tarifée — un profil
          rencontré sur le terrain avant d'avoir été déclaré — se tarife
          quand même : c'est exactement ce que demande le document. */}
      {editable && (
        <div className="flex items-end gap-2 mt-4 pt-3 border-t border-gray-100">
          <div className="flex-1">
            <Input
              label="Ajouter une valeur à tarifer"
              value={nouveau}
              onChange={(e) => setNouveau(e.target.value)}
              placeholder="Ex. Soudeur, Grue 25 t…"
            />
          </div>
          <Button
            type="button"
            variant="ghost"
            disabled={!nouveau.trim() || lignes.includes(nouveau.trim())}
            onClick={() => {
              onAjouter(nouveau.trim())
              setNouveau('')
            }}
          >
            <Plus className="w-4 h-4 mr-1.5" />
            Ajouter
          </Button>
        </div>
      )}
    </div>
  )
}

export function TarifsNptTab({ estAdmin }: { estAdmin: boolean }) {
  const { valeursDe } = useListesValeurs()
  const [grille, setGrille] = useState<GrilleTarifsNpt | null>(null)
  const [chargement, setChargement] = useState(true)
  const [heures, setHeures] = useState(String(HEURES_JOUR_DEFAUT))
  const [profils, setProfils] = useState<Record<string, string>>({})
  const [materiels, setMateriels] = useState<Record<string, string>>({})
  // Valeurs ajoutées à la main dans cet écran, tant qu'elles n'ont pas de
  // tarif enregistré (sans quoi elles disparaîtraient au rendu suivant).
  const [ajouts, setAjouts] = useState<{ profils: string[]; materiels: string[] }>({
    profils: [],
    materiels: [],
  })
  const [enregistrement, setEnregistrement] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)
  const [enregistre, setEnregistre] = useState(false)

  useEffect(() => {
    let actif = true
    surveillerChargement(
      'La grille de tarifs NPT',
      getDoc(doc(db, COLLECTIONS.hebdoCrjTarifsNpt, DOC_ID)),
      null
    ).then((snap) => {
      if (!actif) return
      const lue = snap?.exists() ? (snap.data() as GrilleTarifsNpt) : null
      setGrille(lue)
      setHeures(String(lue?.heuresJourReference ?? HEURES_JOUR_DEFAUT))
      const versTexte = (tarifs: Record<string, number> = {}) =>
        Object.fromEntries(Object.entries(tarifs).map(([k, v]) => [k, String(v)]))
      setProfils(versTexte(lue?.tarifJournalierParProfil))
      setMateriels(versTexte(lue?.tarifJournalierParMateriel))
      setChargement(false)
    })
    return () => {
      actif = false
    }
  }, [])

  const lignesProfils = lignesTarifs(
    [...valeursDe('crj.profils'), ...ajouts.profils],
    grille?.tarifJournalierParProfil ?? {}
  )
  const lignesMateriels = lignesTarifs(
    [...valeursDe('crj.materiels'), ...ajouts.materiels],
    grille?.tarifJournalierParMateriel ?? {}
  )

  const enregistrer = async () => {
    setEnregistrement(true)
    setErreur(null)
    try {
      // Seules les valeurs réellement saisies sont écrites : un champ laissé
      // vide n'est pas un tarif à 0, c'est un tarif non défini — et
      // `coutStandbyGlobal` fait la différence.
      const chiffres = (valeurs: Record<string, string>, lignes: string[]) =>
        Object.fromEntries(
          lignes
            .filter((cle) => (valeurs[cle] ?? '').trim() !== '')
            .map((cle) => [cle, Number(valeurs[cle]) || 0])
        )
      const suivante: GrilleTarifsNpt = {
        heuresJourReference: Number(heures) || HEURES_JOUR_DEFAUT,
        tarifJournalierParProfil: chiffres(profils, lignesProfils),
        tarifJournalierParMateriel: chiffres(materiels, lignesMateriels),
      }
      await setDoc(doc(db, COLLECTIONS.hebdoCrjTarifsNpt, DOC_ID), suivante)
      setGrille(suivante)
      setAjouts({ profils: [], materiels: [] })
      setEnregistre(true)
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "La grille n'a pas pu être enregistrée.")
    } finally {
      setEnregistrement(false)
    }
  }

  if (chargement) return <p className="text-sm text-gray-500">Chargement de la grille…</p>

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl border border-gray-200 p-5">
        <div className="flex items-start gap-3">
          <span className="w-9 h-9 shrink-0 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
            <Coins className="w-4.5 h-4.5" />
          </span>
          <div className="min-w-0">
            <p className="font-semibold text-gray-900">Tarifs NPT (coût standby)</p>
            <p className="text-xs text-gray-500 mt-0.5 max-w-2xl">
              Coût journalier d'un profil de personnel et d'un type de matériel, en francs CFA. Ils alimentent l'onglet
              « Coût standby » du Suivi hebdo CRJ : une heure de standby y est valorisée au tarif journalier divisé par
              les heures d'une journée pleine. Une valeur sans tarif pèse 0, et l'écran le signale — aucun montant n'est
              inventé.
            </p>
            {grille === null && (
              <p className="text-xs text-amber-600 mt-1.5">
                Aucune grille enregistrée : le coût standby reste à 0 tant que rien n'est tarifé.
              </p>
            )}
          </div>
        </div>

        <div className="mt-4 max-w-xs">
          <Input
            label="Heures d'une journée pleine"
            type="number"
            min="1"
            disabled={!estAdmin}
            value={heures}
            onChange={(e) => setHeures(e.target.value)}
          />
          <p className="text-xs text-gray-400 mt-1">Sert à convertir un tarif journalier en tarif horaire.</p>
        </div>
      </div>

      <BlocTarifs
        titre="Personnel — tarif journalier par profil"
        aide="Les profils déclarés dans « Listes de valeurs » (CRJ), plus ceux déjà tarifés."
        lignes={lignesProfils}
        valeurs={profils}
        editable={estAdmin}
        onChange={(cle, v) => setProfils((t) => ({ ...t, [cle]: v }))}
        onAjouter={(cle) => setAjouts((a) => ({ ...a, profils: [...a.profils, cle] }))}
      />

      <BlocTarifs
        titre="Matériel — tarif journalier (PU) par type d'équipement"
        aide="Les types de matériel déclarés dans « Listes de valeurs » (CRJ), plus ceux déjà tarifés."
        lignes={lignesMateriels}
        valeurs={materiels}
        editable={estAdmin}
        onChange={(cle, v) => setMateriels((t) => ({ ...t, [cle]: v }))}
        onAjouter={(cle) => setAjouts((a) => ({ ...a, materiels: [...a.materiels, cle] }))}
      />

      {erreur && <p className="text-sm text-red-600">{erreur}</p>}

      {estAdmin ? (
        <div className="flex items-center justify-end gap-3">
          {enregistre && !enregistrement && <span className="text-xs text-emerald-600">Grille enregistrée.</span>}
          <Button type="button" loading={enregistrement} onClick={() => void enregistrer()}>
            Enregistrer la grille
          </Button>
        </div>
      ) : (
        <p className="text-xs text-gray-400">
          Consultation seule — la grille se modifie par un administrateur.
        </p>
      )}
    </div>
  )
}
