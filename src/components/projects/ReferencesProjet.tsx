import { useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { ArrowUpRight, KeyRound, Link2, Plus, Settings2, TriangleAlert, Unlink, X } from 'lucide-react'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { useProjects } from '../../contexts/useProjects'
import { useListesValeurs } from '../../contexts/useListesValeurs'
import { avecAjouts, decouperListe } from '../../lib/saisie'
import { CHAMPS, PLATEFORMES } from '../../data/referentiels'
import type { Projet } from '../../types/project'
import {
  ajouterOT,
  ajouterValeur,
  avisSansOT,
  detacherAvis,
  rattacherAvis,
  referencesOT,
  retirerOT,
  retirerValeur,
  tousLesCodesOTP,
} from '../../types/referencesProjet'
import type { ReferenceOT } from '../../types/referencesProjet'

// Références du projet (Logique_metier_liaisons_ICP.docx §2.4) — 13/08/2026,
// demande explicite : « la donnée de référence est le projet pour l'ensemble
// du projet ». La fiche est le pivot auquel tous les modules se rattachent,
// et ce sont ces clés qui font le rattachement : les journaux terrain (CRJ,
// tonnage, peinture) n'exposent que `nom`, `avis`, `ot` et `site` — jamais
// l'OTP, qui ne sert qu'à la Feuille de route.
//
// **22/08/2026** — trois règles de gestion reçues :
//   1. un OT porte plusieurs avis, un avis ne dépend que d'un seul OT : les
//      deux listes indépendantes deviennent des **groupes** (un OT, ses avis),
//      et on ajoute un OT *avec* ses avis ;
//   2. champ (site) et plateforme sont deux informations distinctes — le champ
//      a trois valeurs (AGM/TRM/IM), les plateformes sont multiples ;
//   3. un projet peut porter plusieurs comptes d'imputation (codes OTP).
//
// Les règles elles-mêmes vivent dans `types/referencesProjet.ts` : l'écran ne
// fait que les appeler et afficher leur refus.

const inputClass =
  'px-3 py-1.5 rounded-lg border border-gray-200 bg-gray-50 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary'

/**
 * Lien « paramétrer ces valeurs » (22/08/2026, demande explicite : « pour les
 * champs et plateformes on mettra un lien vers la partie paramétrages pour la
 * création des nouveaux types »).
 *
 * Ces deux menus ne proposent que le référentiel livré plus ce que déclare
 * Paramètres › Listes de valeurs : sans ce lien, un utilisateur devant une
 * plateforme manquante n'avait aucun moyen de savoir où l'ajouter.
 */
function LienParametrage({ listeId, onOuvrir }: { listeId: string; onOuvrir?: (id: string) => void }) {
  if (!onOuvrir) return null
  return (
    <button
      type="button"
      onClick={() => onOuvrir(listeId)}
      className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
    >
      <Settings2 className="w-3.5 h-3.5" />
      Paramétrer ces valeurs
      <ArrowUpRight className="w-3 h-3" />
    </button>
  )
}

function Puce({ valeur, onRetirer, titre }: { valeur: string; onRetirer?: () => void; titre?: string }) {
  return (
    <span
      title={titre}
      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-mono bg-primary/10 text-primary"
    >
      {valeur}
      {onRetirer && (
        <button onClick={onRetirer} title="Retirer" className="text-primary/60 hover:text-red-600 transition">
          <X className="w-3 h-3" />
        </button>
      )}
    </span>
  )
}

/**
 * Liste de valeurs simples (plateformes, comptes d'imputation) : puces +
 * ajout, avec suggestions.
 */
function ListeValeurs({
  titre,
  aide,
  placeholder,
  valeurs,
  suggestions,
  lien,
  figees = [],
  titreFigees,
  onChange,
}: {
  titre: string
  aide: string
  placeholder: string
  valeurs: string[]
  suggestions?: string[]
  /** Lien vers la liste de Paramètres qui alimente les suggestions. */
  lien?: ReactNode
  /** Valeurs affichées mais non supprimables (venues d'ailleurs). */
  figees?: string[]
  titreFigees?: string
  onChange: (valeurs: string[]) => void
}) {
  const [saisie, setSaisie] = useState('')
  const listeId = `suggestions-${titre.replace(/\W+/g, '-').toLowerCase()}`

  const ajouter = (e: FormEvent) => {
    e.preventDefault()
    const suivant = decouperListe(saisie).reduce(ajouterValeur, valeurs)
    if (suivant !== valeurs) onChange(suivant)
    setSaisie('')
  }

  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-xs font-medium text-gray-500">{titre}</p>
        {lien}
      </div>
      <p className="text-xs text-gray-400 mb-2">{aide}</p>
      <div className="flex flex-wrap items-center gap-1.5 mb-2">
        {figees.map((v) => (
          <span
            key={v}
            title={titreFigees}
            className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-mono bg-gray-100 text-gray-600"
          >
            {v}
          </span>
        ))}
        {valeurs.map((v) => (
          <Puce key={v} valeur={v} onRetirer={() => onChange(retirerValeur(valeurs, v))} />
        ))}
        {valeurs.length === 0 && figees.length === 0 && <span className="text-xs text-gray-300">Aucune</span>}
      </div>
      <form onSubmit={ajouter} className="flex items-center gap-2">
        <input
          value={saisie}
          onChange={(e) => setSaisie(e.target.value)}
          placeholder={placeholder}
          list={suggestions ? listeId : undefined}
          className={`${inputClass} flex-1 min-w-0`}
        />
        {suggestions && (
          <datalist id={listeId}>
            {suggestions.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
        )}
        <Button type="submit" size="sm" variant="ghost" disabled={!saisie.trim()}>
          <Plus className="w-3.5 h-3.5 mr-1" />
          Ajouter
        </Button>
      </form>
    </div>
  )
}

/** Un OT et les avis qu'il regroupe. */
function CarteOT({
  projet,
  reference,
  onErreur,
}: {
  projet: Projet
  reference: ReferenceOT
  onErreur: (motif: string | null) => void
}) {
  const { definirReferencesOT } = useProjects()
  const [saisie, setSaisie] = useState('')

  const ajouter = (e: FormEvent) => {
    e.preventDefault()
    onErreur(null)
    // Une saisie multiple est traitée avis par avis : si le deuxième est déjà
    // pris ailleurs, le premier est quand même enregistré et le refus dit
    // lequel a été rejeté.
    const initiales = referencesOT(projet)
    let courant = projet
    let references = initiales
    for (const avis of decouperListe(saisie)) {
      const resultat = rattacherAvis(courant, reference.id, avis)
      if (!resultat.ok) {
        onErreur(resultat.motif)
        break
      }
      references = resultat.valeur
      courant = { ...courant, referencesOT: references }
    }
    if (references !== initiales) definirReferencesOT(projet.id, references)
    setSaisie('')
  }

  return (
    <div className="rounded-xl border border-gray-100 px-3 py-2.5">
      <div className="flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-gray-900 font-mono">
          <Link2 className="w-3.5 h-3.5 text-gray-400" />
          {reference.numeroOT}
        </span>
        <button
          onClick={() => {
            onErreur(null)
            definirReferencesOT(projet.id, retirerOT(projet, reference.id))
          }}
          title="Retirer cet OT (ses avis restent sur la fiche)"
          className="text-xs text-gray-400 hover:text-red-600 transition inline-flex items-center gap-1"
        >
          <Unlink className="w-3.5 h-3.5" />
          Retirer
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-1.5 my-2">
        {reference.avisNumeros.map((a) => (
          <Puce
            key={a}
            valeur={a}
            titre="Détacher cet avis de cet OT (il reste sur la fiche)"
            onRetirer={() => {
              onErreur(null)
              definirReferencesOT(projet.id, detacherAvis(projet, reference.id, a))
            }}
          />
        ))}
        {reference.avisNumeros.length === 0 && (
          <span className="text-xs text-gray-300">Aucun avis rattaché à cet OT</span>
        )}
      </div>

      <form onSubmit={ajouter} className="flex items-center gap-2">
        <input
          value={saisie}
          onChange={(e) => setSaisie(e.target.value)}
          placeholder="Avis à rattacher à cet OT — AV-2026-000"
          className={`${inputClass} flex-1 min-w-0`}
        />
        <Button type="submit" size="sm" variant="ghost" disabled={!saisie.trim()}>
          <Plus className="w-3.5 h-3.5 mr-1" />
          Rattacher
        </Button>
      </form>
    </div>
  )
}

/** Formulaire « un OT + ses avis », le geste décrit par la règle de gestion. */
function NouvelOT({ projet, onErreur }: { projet: Projet; onErreur: (motif: string | null) => void }) {
  const { definirReferencesOT } = useProjects()
  const [numeroOT, setNumeroOT] = useState('')
  const [avis, setAvis] = useState('')

  const soumettre = (e: FormEvent) => {
    e.preventDefault()
    const resultat = ajouterOT(projet, numeroOT, decouperListe(avis))
    if (!resultat.ok) {
      onErreur(resultat.motif)
      return
    }
    onErreur(null)
    definirReferencesOT(projet.id, resultat.valeur)
    setNumeroOT('')
    setAvis('')
  }

  return (
    <form onSubmit={soumettre} className="rounded-xl border border-dashed border-gray-200 px-3 py-2.5 space-y-2">
      <p className="text-xs font-medium text-gray-500">Ajouter un OT et ses avis</p>
      <div className="grid sm:grid-cols-2 gap-2">
        <input
          value={numeroOT}
          onChange={(e) => setNumeroOT(e.target.value)}
          placeholder="N° d'OT — OT-000000"
          className={`${inputClass} w-full font-mono`}
        />
        <input
          value={avis}
          onChange={(e) => setAvis(e.target.value)}
          placeholder="Avis rattachés, séparés par une virgule"
          className={`${inputClass} w-full`}
        />
      </div>
      <div className="flex justify-end">
        <Button type="submit" size="sm" variant="ghost" disabled={!numeroOT.trim()}>
          <Plus className="w-3.5 h-3.5 mr-1" />
          Ajouter l'OT
        </Button>
      </div>
    </form>
  )
}

/** Avis de la fiche qu'aucun OT ne porte, avec de quoi les y rattacher. */
function AvisSansOT({ projet, onErreur }: { projet: Projet; onErreur: (motif: string | null) => void }) {
  const { ajouterReferenceProjet, retirerReferenceProjet, definirReferencesOT } = useProjects()
  const [saisie, setSaisie] = useState('')
  const orphelins = avisSansOT(projet)
  const ots = referencesOT(projet)

  const ajouter = (e: FormEvent) => {
    e.preventDefault()
    for (const avis of decouperListe(saisie)) ajouterReferenceProjet(projet.id, 'avis', avis)
    setSaisie('')
  }

  return (
    <div>
      <p className="text-xs font-medium text-gray-500">Avis sans OT</p>
      <p className="text-xs text-gray-400 mb-2">
        Un avis peut exister avant son OT. Les fiches créées avant le 22/08/2026 sont toutes ici : le lien
        OT ↔ avis n'était pas enregistré, il n'a pas été deviné après coup.
      </p>

      {orphelins.length === 0 ? (
        <p className="text-xs text-gray-300 mb-2">Aucun</p>
      ) : (
        <ul className="space-y-1.5 mb-2">
          {orphelins.map((a) => {
            // `avisNumero` (saisi à la création) est lu par le résolveur au même
            // titre que la liste, mais ne s'en retire pas : il n'y est pas.
            const supprimable = projet.avisNumeros.some((v) => v === a)
            return (
              <li key={a} className="flex flex-wrap items-center gap-2">
                <span className="px-2.5 py-1 rounded-full text-xs font-mono bg-gray-100 text-gray-600">{a}</span>
                {ots.length > 0 && (
                  <select
                    className={`${inputClass} text-xs py-1`}
                    value=""
                    onChange={(e) => {
                      const resultat = rattacherAvis(projet, e.target.value, a)
                      if (!resultat.ok) onErreur(resultat.motif)
                      else {
                        onErreur(null)
                        definirReferencesOT(projet.id, resultat.valeur)
                      }
                    }}
                  >
                    <option value="">Rattacher à un OT…</option>
                    {ots.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.numeroOT}
                      </option>
                    ))}
                  </select>
                )}
                {supprimable && (
                  <button
                    onClick={() => retirerReferenceProjet(projet.id, 'avis', a)}
                    title="Retirer cet avis de la fiche"
                    className="text-gray-300 hover:text-red-600 transition"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </li>
            )
          })}
        </ul>
      )}

      <form onSubmit={ajouter} className="flex items-center gap-2">
        <input
          value={saisie}
          onChange={(e) => setSaisie(e.target.value)}
          placeholder="AV-2026-000"
          className={`${inputClass} flex-1 min-w-0`}
        />
        <Button type="submit" size="sm" variant="ghost" disabled={!saisie.trim()}>
          <Plus className="w-3.5 h-3.5 mr-1" />
          Ajouter
        </Button>
      </form>
    </div>
  )
}

export function ReferencesProjet({
  projet,
  onOuvrirListeValeurs,
}: {
  projet: Projet
  onOuvrirListeValeurs?: (id: string) => void
}) {
  const { definirClesProjet, definirPlateformes, definirCodesOTP } = useProjects()
  const { valeursDe } = useListesValeurs()
  const [champ, setChamp] = useState<string | null>(null)
  const [erreur, setErreur] = useState<string | null>(null)

  const references = referencesOT(projet)
  const codesOTP = tousLesCodesOTP(projet)
  const sansCleTerrain = projet.avisNumeros.length === 0 && !projet.avisNumero && projet.numerosOT.length === 0

  // Le champ de la fiche est proposé même s'il sort du référentiel : une fiche
  // qui porte « MDJ » (une plateforme, avant la séparation des deux notions)
  // ne doit pas voir sa valeur effacée à la première ouverture du menu.
  const champsProposes = avecAjouts(
    avecAjouts([...CHAMPS], valeursDe('commun.champs')),
    projet.champ ? [projet.champ] : []
  )

  return (
    <section className="carte p-5">
      <div className="flex items-start gap-2.5 mb-4">
        <span className="w-7 h-7 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
          <KeyRound className="w-4 h-4" />
        </span>
        <div>
          <h4 className="font-semibold text-gray-900">Références du projet</h4>
          <p className="text-xs text-gray-500 mt-0.5 max-w-2xl">
            Cette fiche est la référence de tout ce qui concerne le projet. C'est par ces clés que les autres
            modules s'y rattachent : le CRJ, le tonnage et la peinture par le n° d'avis/DDM, l'OT ou le nom ; la
            Feuille de route par le code OTP.
          </p>
        </div>
      </div>

      {sansCleTerrain && (
        <p className="flex items-start gap-2 text-xs text-amber-800 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2.5 mb-4">
          <TriangleAlert className="w-4 h-4 shrink-0 mt-px" />
          <span>
            Aucun n° d'avis/DDM ni OT sur cette fiche : les lignes de chantier du CRJ, du tonnage et de la
            peinture ne pourront pas s'y rattacher automatiquement. Ajoutez-en au moins un ci-dessous.
          </span>
        </p>
      )}

      {/* Le refus d'une règle de gestion est dit ici, une fois, plutôt que
          répété sous chaque formulaire : il vient toujours du même geste. */}
      {erreur && (
        <p className="flex items-start gap-2 text-xs text-red-800 bg-red-50 border border-red-100 rounded-xl px-3 py-2.5 mb-4">
          <TriangleAlert className="w-4 h-4 shrink-0 mt-px" />
          <span>{erreur}</span>
        </p>
      )}

      <div className="space-y-3">
        <div>
          <p className="text-xs font-medium text-gray-500">Ordres de travail (OT) et avis rattachés</p>
          <p className="text-xs text-gray-400 mb-2">
            Un OT peut porter plusieurs avis ; un avis ne dépend que d'un seul OT. On déclare donc un OT avec les
            avis qui lui reviennent.
          </p>
        </div>
        {references.map((reference) => (
          <CarteOT key={reference.id} projet={projet} reference={reference} onErreur={setErreur} />
        ))}
        <NouvelOT projet={projet} onErreur={setErreur} />
      </div>

      <div className="mt-5 pt-5 border-t border-gray-100">
        <AvisSansOT projet={projet} onErreur={setErreur} />
      </div>

      <div className="grid sm:grid-cols-2 gap-5 mt-5 pt-5 border-t border-gray-100">
        <div>
          <div className="flex items-baseline justify-between gap-2 mb-1">
            <label className="block text-xs font-medium text-gray-500">Champ (site)</label>
            <LienParametrage listeId="commun.champs" onOuvrir={onOuvrirListeValeurs} />
          </div>
          {/* Trois valeurs, et trois seulement (22/08/2026) — c'était une
              saisie libre, ce qui laissait entrer des plateformes. */}
          <select
            value={champ ?? projet.champ ?? ''}
            onChange={(e) => {
              setChamp(e.target.value)
              definirClesProjet(projet.id, { codeOTP: projet.codeOTP, champ: e.target.value })
            }}
            className={`${inputClass} w-full`}
          >
            <option value="">— Non renseigné —</option>
            {champsProposes.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <p className="text-xs text-gray-400 mt-1">
            AGM, TRM ou IM. Départage deux projets de même nom lors du rattachement.
          </p>
        </div>
        <ListeValeurs
          titre="Plateforme(s)"
          aide="Information distincte du champ. Une affaire peut passer d'une plateforme à une autre en cours d'exécution."
          placeholder="BDN, BDNM, TRM2…"
          valeurs={projet.plateformes ?? []}
          suggestions={avecAjouts([...PLATEFORMES], valeursDe('commun.plateformes'))}
          lien={<LienParametrage listeId="commun.plateformes" onOuvrir={onOuvrirListeValeurs} />}
          onChange={(v) => definirPlateformes(projet.id, v)}
        />
      </div>

      <div className="mt-5 pt-5 border-t border-gray-100">
        <ListeValeurs
          titre="Comptes d'imputation (codes OTP)"
          aide="Un projet peut en porter plusieurs. Le premier, hérité de la ligne navette, sert à la Feuille de route."
          placeholder="GA-XXX-000000"
          valeurs={projet.codesOTP ?? []}
          figees={projet.codeOTP ? [projet.codeOTP] : []}
          titreFigees="Hérité de la ligne navette liée — se corrige dans la Navette"
          onChange={(v) => definirCodesOTP(projet.id, v)}
        />
        {codesOTP.length === 0 && (
          <p className="text-xs text-gray-400 mt-1">Aucun compte d'imputation : la Feuille de route ne pourra pas s'y rattacher.</p>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-1.5 mt-4 pt-4 border-t border-gray-100">
        <span className="text-xs text-gray-400 mr-1">Commandes (PO) rattachées :</span>
        {projet.commandes.length === 0 ? (
          <span className="text-xs text-gray-300">aucune</span>
        ) : (
          <Badge label={`${projet.commandes.length}`} bg="bg-gray-100" text="text-gray-600" />
        )}
        <span className="text-xs text-gray-400">— déclarées dans l'onglet Contrats, elles servent aussi de clé.</span>
      </div>
    </section>
  )
}
