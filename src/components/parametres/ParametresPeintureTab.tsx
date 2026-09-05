import { useEffect, useState } from 'react'
import { Brush, Calculator, Package, Plus, Timer, Trash2, Users, Wrench } from 'lucide-react'
import { doc, getDoc, setDoc } from 'firebase/firestore'
import { db } from '../../lib/firebase'
import { COLLECTIONS } from '../../lib/firestoreCollections'
import { surveillerChargement } from '../../lib/incidents'
import { chargerPeintureReferentiel } from '../../data/contratPeinture'
import type {
  ParametresContratPeinture,
  PeintureReferentiel,
  TarifPeinture,
} from '../../types/contratPeinture'
import {
  candidatsDepuisReferentiel,
  consommableDepuisTarif,
  equipementDepuisTarif,
  normaliserParametres,
  parametresDepuisReferentiel,
} from '../../lib/contratPeintureParametres'
import { modeleDuSite } from '../../lib/contratPeintureProductivite'
import { formatNombre, formatPercent } from '../../lib/format'
import { useAuth } from '../../contexts/useAuth'
import { Button } from '../ui/Button'
import { Input } from '../ui/Input'

// Paramètres du contrat peinture (27/08/2026, `doc/Contrat peinture.docx` §11
// — lot 1 de `doc/recueil-module-contrat-peinture.md`).
//
// **Pourquoi ici et pas dans le module** : le §8 le demande explicitement
// (« ces informations seront gérées dans l'onglet Paramètres »), et c'est le
// régime déjà retenu pour les Tarifs NPT du CRJ le 23/08/2026 — un réglage
// d'administration se règle là où se règlent les autres, sous les mêmes
// droits (lecture pour tout connecté, écriture admin). L'onglet « Tarifs &
// objectifs (DATA) » du module reste ce qu'il est : la vue du classeur
// importé, en lecture.
//
// **Reprise sans migration** : tant que `peinture_parametres/contrat`
// n'existe pas, l'écran sert ce que porte le référentiel DATA importé
// (même patron que le référentiel des devises, 18/08/2026) — et
// « Enregistrer » écrit ce que l'admin a sous les yeux, ni plus ni moins.

const DOC_ID = 'contrat'

/** Saisie numérique : le vide reste vide (`null`), il ne devient jamais 0. */
const texte = (v: number | null) => (v === null ? '' : String(v))
const valeur = (v: string): number | null => {
  const t = v.trim()
  if (t === '') return null
  const n = Number(t)
  return Number.isFinite(n) ? n : null
}

function Bloc({
  titre,
  icone: Icone,
  aide,
  children,
}: {
  titre: string
  icone: typeof Users
  aide: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-5">
      <div className="flex items-start gap-3 mb-4">
        <span className="w-9 h-9 shrink-0 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
          <Icone className="w-4.5 h-4.5" />
        </span>
        <div className="min-w-0">
          <p className="font-semibold text-gray-900">{titre}</p>
          <p className="text-xs text-gray-500 mt-0.5 max-w-3xl">{aide}</p>
        </div>
      </div>
      {children}
    </div>
  )
}

function LigneSupprimable({ children, onSupprimer }: { children: React.ReactNode; onSupprimer?: () => void }) {
  return (
    <div className="flex items-end gap-2 py-2 border-b border-gray-100 last:border-0">
      <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">{children}</div>
      {onSupprimer && (
        <button
          type="button"
          onClick={onSupprimer}
          className="p-2 mb-0.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition"
          aria-label="Retirer cette ligne"
          title="Retirer cette ligne"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      )}
    </div>
  )
}

function ChampAjout({
  libelle,
  placeholder,
  existantes,
  onAjouter,
}: {
  libelle: string
  placeholder: string
  existantes: string[]
  onAjouter: (nom: string) => void
}) {
  const [nouveau, setNouveau] = useState('')
  const nom = nouveau.trim()
  const doublon = existantes.some((e) => e.trim().toLowerCase() === nom.toLowerCase())
  return (
    <div className="flex items-end gap-2 mt-4 pt-3 border-t border-gray-100">
      <div className="flex-1 max-w-md">
        <Input label={libelle} value={nouveau} onChange={(e) => setNouveau(e.target.value)} placeholder={placeholder} />
      </div>
      <Button
        type="button"
        variant="ghost"
        disabled={!nom || doublon}
        onClick={() => {
          onAjouter(nom)
          setNouveau('')
        }}
      >
        <Plus className="w-4 h-4 mr-1.5" />
        Ajouter
      </Button>
      {doublon && <span className="text-xs text-amber-600 mb-3">Déjà dans la liste.</span>}
    </div>
  )
}

export function ParametresPeintureTab({ estAdmin }: { estAdmin: boolean }) {
  const { currentUser } = useAuth()
  const [parametres, setParametres] = useState<ParametresContratPeinture | null>(null)
  const [referentiel, setReferentiel] = useState<PeintureReferentiel | null>(null)
  const [enregistre, setEnregistre] = useState<boolean | null>(null)
  const [chargement, setChargement] = useState(true)
  const [enCours, setEnCours] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)
  const [succes, setSucces] = useState(false)

  useEffect(() => {
    let actif = true
    Promise.all([
      surveillerChargement(
        'Les paramètres du contrat peinture',
        getDoc(doc(db, COLLECTIONS.peintureParametres, DOC_ID)),
        null
      ),
      chargerPeintureReferentiel().catch(() => null),
    ]).then(([snap, ref]) => {
      if (!actif) return
      setReferentiel(ref)
      const lu = snap?.exists() ? (snap.data() as Partial<ParametresContratPeinture>) : null
      setEnregistre(!!lu)
      // Reprise : le référentiel DATA sert de point de départ tant que rien
      // n'a été enregistré. S'il n'a pas pu être chargé non plus, l'écran
      // part vide plutôt que d'inventer des valeurs de contrat.
      setParametres(
        lu
          ? normaliserParametres(lu)
          : ref
            ? parametresDepuisReferentiel(ref)
            : normaliserParametres({})
      )
      setChargement(false)
    })
    return () => {
      actif = false
    }
  }, [])

  if (chargement) return <p className="text-sm text-gray-500">Chargement des paramètres…</p>
  if (!parametres) return null

  const p = parametres
  const maj = (patch: Partial<ParametresContratPeinture>) => {
    setParametres({ ...p, ...patch })
    setSucces(false)
  }

  const candidats = referentiel ? candidatsDepuisReferentiel(referentiel) : []
  const dejaClasse = (t: TarifPeinture) => {
    const nom = t.typeItem.trim().toLowerCase()
    return (
      p.consommables.some((c) => c.nom.trim().toLowerCase() === nom) ||
      p.equipements.some((e) => e.nom.trim().toLowerCase() === nom)
    )
  }
  const aClasser = candidats.filter((t) => !dejaClasse(t))

  const enregistrer = async () => {
    setEnCours(true)
    setErreur(null)
    try {
      const suivant: ParametresContratPeinture = {
        ...p,
        misAJourLe: new Date().toISOString(),
        ...(currentUser ? { misAJourPar: currentUser.name } : {}),
      }
      await setDoc(doc(db, COLLECTIONS.peintureParametres, DOC_ID), suivant)
      setParametres(suivant)
      setEnregistre(true)
      setSucces(true)
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "Les paramètres n'ont pas pu être enregistrés.")
    } finally {
      setEnCours(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl border border-gray-200 p-5">
        <div className="flex items-start gap-3">
          <span className="w-9 h-9 shrink-0 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
            <Brush className="w-4.5 h-4.5" />
          </span>
          <div className="min-w-0">
            <p className="font-semibold text-gray-900">Contrat peinture — paramètres métier</p>
            <p className="text-xs text-gray-500 mt-0.5 max-w-3xl">
              Le modèle de productivité du contrat, ses consommables, son matériel et ses causes de stand-by. Une
              modification de l'objectif contractuel ou des rendements doit se répercuter d'elle-même sur les
              indicateurs, sans passer par le code : c'est ce que ces valeurs rendent possible.
            </p>
            {enregistre === false && (
              <p className="text-xs text-amber-600 mt-1.5">
                Rien n'a encore été enregistré : les valeurs ci-dessous sont celles du référentiel DATA importé du
                classeur. Elles ne deviennent les paramètres du contrat qu'une fois enregistrées.
              </p>
            )}
            {p.misAJourLe && (
              <p className="text-xs text-gray-400 mt-1.5">
                Dernière modification le {new Date(p.misAJourLe).toLocaleDateString('fr-FR')}
                {p.misAJourPar ? ` par ${p.misAJourPar}` : ''}.
              </p>
            )}
          </div>
        </div>
      </div>

      <Bloc
        titre="Équipe de référence"
        icone={Users}
        aide={
          <>
            La composition sur laquelle l'objectif contractuel a été défini — 1 chef d'équipe et 2 peintres dans le
            contrat actuel. <strong>Elle entre dans le calcul</strong> : sa capacité productive sert de dénominateur au
            rendement par unité (10 m² ÷ 2,5 = 4 m² par unité et par jour), dont se déduit l'objectif de chaque profil.
            La modifier change tous les objectifs.
          </>
        }
      >
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 max-w-2xl">
          <Input
            label="Chefs d'équipe"
            type="number"
            min="0"
            disabled={!estAdmin}
            value={texte(p.equipeReference.chefsEquipe)}
            onChange={(e) => maj({ equipeReference: { ...p.equipeReference, chefsEquipe: valeur(e.target.value) } })}
          />
          <Input
            label="Peintres"
            type="number"
            min="0"
            disabled={!estAdmin}
            value={texte(p.equipeReference.peintres)}
            onChange={(e) => maj({ equipeReference: { ...p.equipeReference, peintres: valeur(e.target.value) } })}
          />
          <div>
            <span className="block text-sm font-medium text-gray-500 mb-1.5">Effectif de référence</span>
            <p className="px-4 py-3 rounded-xl border border-gray-100 bg-gray-50 text-base text-gray-500">
              {p.equipeReference.chefsEquipe === null && p.equipeReference.peintres === null
                ? '—'
                : `${(p.equipeReference.chefsEquipe ?? 0) + (p.equipeReference.peintres ?? 0)} personnes`}
            </p>
          </div>
        </div>
      </Bloc>

      <Bloc
        titre="Productivité — par champ (site)"
        icone={Timer}
        aide={
          <>
            Heures d'une journée de travail et objectif de production, pour chaque champ du contrat. Les heures de
            stand-by incompressible sont dans le bloc Stand-by, plus bas — un champ ne se déclare qu'une fois.
          </>
        }
      >
        {p.sites.length === 0 ? (
          <p className="text-sm text-gray-400">Aucun champ déclaré.</p>
        ) : (
          p.sites.map((s, i) => (
            <LigneSupprimable
              key={s.site + i}
              onSupprimer={estAdmin ? () => maj({ sites: p.sites.filter((_, j) => j !== i) }) : undefined}
            >
              <Input
                label="Champ"
                disabled={!estAdmin}
                value={s.site}
                onChange={(e) =>
                  maj({ sites: p.sites.map((x, j) => (j === i ? { ...x, site: e.target.value } : x)) })
                }
              />
              <Input
                label="Heures / jour"
                type="number"
                min="0"
                step="0.5"
                disabled={!estAdmin}
                value={texte(s.nombreHeures)}
                onChange={(e) =>
                  maj({
                    sites: p.sites.map((x, j) => (j === i ? { ...x, nombreHeures: valeur(e.target.value) } : x)),
                  })
                }
              />
              <Input
                label="Objectif journalier (m²)"
                type="number"
                min="0"
                step="0.1"
                disabled={!estAdmin}
                value={texte(s.objectifJourM2)}
                onChange={(e) =>
                  maj({
                    sites: p.sites.map((x, j) => (j === i ? { ...x, objectifJourM2: valeur(e.target.value) } : x)),
                  })
                }
              />
            </LigneSupprimable>
          ))
        )}
        {estAdmin && (
          <ChampAjout
            libelle="Ajouter un champ"
            placeholder="Ex. AGM, TRM, IM…"
            existantes={p.sites.map((s) => s.site)}
            onAjouter={(site) =>
              maj({ sites: [...p.sites, { site, nombreHeures: null, objectifJourM2: null, heuresIncompressibles: null }] })
            }
          />
        )}
      </Bloc>

      <Bloc
        titre="Productivité — coefficient par profil"
        icone={Users}
        aide={
          <>
            Le rapport de productivité entre les profils : dans le contrat actuel, un peintre compte pour 1 et un chef
            d'équipe pour 0,5 — « un peintre est considéré comme deux fois plus productif qu'un chef d'équipe », qui
            partage son temps entre encadrement, suivi administratif, préparation et coordination. Un profil sans
            coefficient ne pèsera <strong>rien</strong> dans l'objectif, et l'écran le dira plutôt que de lui en prêter
            un.
          </>
        }
      >
        {p.profils.length === 0 ? (
          <p className="text-sm text-gray-400">Aucun profil déclaré.</p>
        ) : (
          p.profils.map((pr, i) => (
            <LigneSupprimable
              key={pr.profil + i}
              onSupprimer={estAdmin ? () => maj({ profils: p.profils.filter((_, j) => j !== i) }) : undefined}
            >
              <Input
                label="Profil"
                disabled={!estAdmin}
                value={pr.profil}
                onChange={(e) =>
                  maj({ profils: p.profils.map((x, j) => (j === i ? { ...x, profil: e.target.value } : x)) })
                }
              />
              <Input
                label="Coefficient"
                type="number"
                min="0"
                step="0.1"
                disabled={!estAdmin}
                value={texte(pr.coefficient)}
                onChange={(e) =>
                  maj({
                    profils: p.profils.map((x, j) => (j === i ? { ...x, coefficient: valeur(e.target.value) } : x)),
                  })
                }
              />
            </LigneSupprimable>
          ))
        )}
        {estAdmin && (
          <ChampAjout
            libelle="Ajouter un profil"
            placeholder="Ex. Peintre, Chef d'Equipe, Sableur…"
            existantes={p.profils.map((x) => x.profil)}
            onAjouter={(profil) => maj({ profils: [...p.profils, { profil, coefficient: null }] })}
          />
        )}
      </Bloc>

      <Bloc
        titre="Ce que ces paramètres produisent"
        icone={Calculator}
        aide={
          <>
            Rien ne se saisit ici : c'est la chaîne du contrat, recalculée à chaque changement ci-dessus — capacité de
            l'équipe de référence, production attendue par unité productive, puis objectif de chaque profil et part
            qu'il représente dans l'objectif de la journée. Appliquée à l'équipe de référence elle-même, elle redonne
            exactement l'objectif contractuel : c'est le contrôle à faire d'un coup d'œil.
          </>
        }
      >
        {p.sites.length === 0 ? (
          <p className="text-sm text-gray-400">Déclarez un champ pour voir ce que le modèle produit.</p>
        ) : (
          <div className="space-y-4">
            {p.sites.map((s, i) => {
              const modele = modeleDuSite(p, s.site)
              if (!modele) return null
              const boucle =
                modele.rendementParUnite !== null && modele.capaciteReference !== null
                  ? modele.capaciteReference * modele.rendementParUnite
                  : null
              return (
                <div key={s.site + i} className="rounded-xl border border-gray-100 bg-gray-50/60 p-4">
                  <p className="font-medium text-gray-900 text-sm mb-2">{s.site || 'Champ sans nom'}</p>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                    <div>
                      <span className="block text-xs text-gray-500">Objectif journalier</span>
                      <span className="text-gray-900">
                        {modele.objectifJourM2 === null ? '—' : `${formatNombre(modele.objectifJourM2, 2)} m²`}
                      </span>
                    </div>
                    <div>
                      <span className="block text-xs text-gray-500">Capacité de référence</span>
                      <span className="text-gray-900">
                        {modele.capaciteReference === null
                          ? '—'
                          : `${formatNombre(modele.capaciteReference, 2)} unités`}
                      </span>
                    </div>
                    <div>
                      <span className="block text-xs text-gray-500">Production / unité productive</span>
                      <span className="text-gray-900">
                        {modele.rendementParUnite === null
                          ? '—'
                          : `${formatNombre(modele.rendementParUnite, 2)} m² / jour`}
                      </span>
                    </div>
                    <div>
                      <span className="block text-xs text-gray-500">Contrôle — équipe de référence</span>
                      <span className={boucle === null ? 'text-gray-400' : 'text-gray-900'}>
                        {boucle === null ? '—' : `${formatNombre(boucle, 2)} m² / jour`}
                      </span>
                    </div>
                  </div>

                  {modele.rendementParUnite === null ? (
                    <p className="text-xs text-amber-600 mt-3">
                      Objectif non calculable sur ce champ : il manque l'objectif journalier, ou l'équipe de référence
                      n'a aucune capacité productive (profils sans coefficient). Rien n'est supposé à la place.
                    </p>
                  ) : (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {modele.profils.map((pr) => (
                        <span
                          key={pr.profil}
                          className="text-xs px-2.5 py-1 rounded-full bg-white border border-gray-200 text-gray-700"
                        >
                          <strong className="font-medium">{pr.profil}</strong>{' '}
                          {pr.objectifJour === null ? (
                            <span className="text-amber-600">coefficient non défini — ne compte pas</span>
                          ) : (
                            <>
                              {formatNombre(pr.objectifJour, 2)} m²/jour · {formatPercent(pr.part)} de l'objectif
                            </>
                          )}
                        </span>
                      ))}
                    </div>
                  )}

                  {modele.profilsSansCoefficient.length > 0 && (
                    <p className="text-xs text-amber-600 mt-2">
                      Équipe de référence : {modele.profilsSansCoefficient.join(', ')} sans coefficient déclaré — ces
                      personnes ne comptent pas dans la capacité, donc le rendement est surévalué.
                    </p>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </Bloc>

      <Bloc
        titre="Consommables"
        icone={Package}
        aide={
          <>
            Ce que propose la liste déroulante de la catégorie Consommable, avec son unité et ses deux prix unitaires —
            celui du contrat actuel et celui de l'ancien, dont se déduisent les gains et les pertes.
          </>
        }
      >
        {p.consommables.length === 0 ? (
          <p className="text-sm text-gray-400">Aucun consommable déclaré.</p>
        ) : (
          p.consommables.map((c, i) => (
            <LigneSupprimable
              key={c.nom + i}
              onSupprimer={estAdmin ? () => maj({ consommables: p.consommables.filter((_, j) => j !== i) }) : undefined}
            >
              <Input
                label="Consommable"
                disabled={!estAdmin}
                value={c.nom}
                onChange={(e) =>
                  maj({ consommables: p.consommables.map((x, j) => (j === i ? { ...x, nom: e.target.value } : x)) })
                }
              />
              <Input
                label="Unité"
                disabled={!estAdmin}
                placeholder="m², hr…"
                value={c.unite ?? ''}
                onChange={(e) =>
                  maj({
                    consommables: p.consommables.map((x, j) =>
                      j === i ? { ...x, unite: e.target.value.trim() === '' ? null : e.target.value } : x
                    ),
                  })
                }
              />
              <Input
                label="PU contrat actuel"
                type="number"
                min="0"
                step="0.01"
                disabled={!estAdmin}
                value={texte(c.prixUnitaireActuel)}
                onChange={(e) =>
                  maj({
                    consommables: p.consommables.map((x, j) =>
                      j === i ? { ...x, prixUnitaireActuel: valeur(e.target.value) } : x
                    ),
                  })
                }
              />
              <Input
                label="PU ancien contrat"
                type="number"
                min="0"
                step="0.01"
                disabled={!estAdmin}
                value={texte(c.prixUnitaireAncien)}
                onChange={(e) =>
                  maj({
                    consommables: p.consommables.map((x, j) =>
                      j === i ? { ...x, prixUnitaireAncien: valeur(e.target.value) } : x
                    ),
                  })
                }
              />
            </LigneSupprimable>
          ))
        )}
        {estAdmin && (
          <ChampAjout
            libelle="Ajouter un consommable"
            placeholder="Ex. Grit, Système peinture M02…"
            existantes={p.consommables.map((x) => x.nom)}
            onAjouter={(nom) =>
              maj({
                consommables: [...p.consommables, { nom, unite: null, prixUnitaireActuel: null, prixUnitaireAncien: null }],
              })
            }
          />
        )}
      </Bloc>

      <Bloc
        titre="Matériel"
        icone={Wrench}
        aide={
          <>
            Les équipements et leur tarif unitaire. <strong>Au forfait</strong> désigne le matériel couvert par le
            forfait journalier du contrat : c'est lui qui sera comptabilisé automatiquement chaque jour, le reste
            restant à saisir.
          </>
        }
      >
        {p.equipements.length === 0 ? (
          <p className="text-sm text-gray-400">Aucun équipement déclaré.</p>
        ) : (
          p.equipements.map((eq, i) => (
            <LigneSupprimable
              key={eq.nom + i}
              onSupprimer={estAdmin ? () => maj({ equipements: p.equipements.filter((_, j) => j !== i) }) : undefined}
            >
              <Input
                label="Équipement"
                disabled={!estAdmin}
                value={eq.nom}
                onChange={(e) =>
                  maj({ equipements: p.equipements.map((x, j) => (j === i ? { ...x, nom: e.target.value } : x)) })
                }
              />
              <Input
                label="Tarif unitaire"
                type="number"
                min="0"
                step="0.01"
                disabled={!estAdmin}
                value={texte(eq.tarifUnitaire)}
                onChange={(e) =>
                  maj({
                    equipements: p.equipements.map((x, j) =>
                      j === i ? { ...x, tarifUnitaire: valeur(e.target.value) } : x
                    ),
                  })
                }
              />
              <label className="flex items-center gap-2 text-sm text-gray-700 pb-3 self-end">
                <input
                  type="checkbox"
                  disabled={!estAdmin}
                  checked={eq.auForfait}
                  onChange={(e) =>
                    maj({
                      equipements: p.equipements.map((x, j) =>
                        j === i ? { ...x, auForfait: e.target.checked } : x
                      ),
                    })
                  }
                  className="w-4 h-4 rounded border-gray-300 text-primary focus:ring-primary/30"
                />
                Inclus dans le forfait journalier
              </label>
            </LigneSupprimable>
          ))
        )}
        {estAdmin && (
          <ChampAjout
            libelle="Ajouter un équipement"
            placeholder="Ex. Sableuse, Pompe Airless, Brosse MBX…"
            existantes={p.equipements.map((x) => x.nom)}
            onAjouter={(nom) => maj({ equipements: [...p.equipements, { nom, tarifUnitaire: null, auForfait: false }] })}
          />
        )}
      </Bloc>

      {estAdmin && aClasser.length > 0 && (
        <div className="bg-amber-50/60 rounded-2xl border border-amber-200 p-5">
          <p className="font-semibold text-gray-900">Types d'item tarifés du classeur, à classer</p>
          <p className="text-xs text-gray-600 mt-0.5 max-w-3xl">
            Le référentiel DATA importé les classe tous en catégorie <strong>MATERIEL</strong>, alors que le JOURNAL
            enregistre <em>Grit</em> et <em>M02</em> en <strong>Consommable</strong>. Les deux vocabulaires du classeur
            divergent, et c'est cette classification qui décidera ensuite du tarif appliqué : elle n'est donc pas
            devinée ici. Choisissez la liste de chacun — leurs tarifs sont repris avec eux.
          </p>
          <div className="mt-3 space-y-1.5">
            {aClasser.map((t) => (
              <div key={t.id} className="flex items-center gap-3 flex-wrap text-sm">
                <span className="font-medium text-gray-900">{t.typeItem}</span>
                <span className="text-xs text-gray-500">
                  {t.categorie ?? 'sans catégorie'}
                  {t.societe ? ` · ${t.societe}` : ''}
                  {t.tarifPointageReel !== null ? ` · PU ${t.tarifPointageReel}` : ''}
                  {t.ancienContrat !== null ? ` · ancien ${t.ancienContrat}` : ''}
                </span>
                <span className="flex-1" />
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => maj({ consommables: [...p.consommables, consommableDepuisTarif(t)] })}
                >
                  → Consommables
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => maj({ equipements: [...p.equipements, equipementDepuisTarif(t)] })}
                >
                  → Matériel
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      <Bloc
        titre="Stand-by"
        icone={Timer}
        aide={
          <>
            Les causes proposées à la saisie, et les heures de stand-by incompressible de chaque champ — le temps qui
            ne peut pas être optimisé (pause repas, contraintes obligatoires du contrat). La liste est{' '}
            <strong>additive</strong> : une cause retirée d'ici reste lisible sur les pointages qui la portent.
          </>
        }
      >
        <p className="text-sm font-medium text-gray-700 mb-2">Causes de stand-by</p>
        {p.causesStandBy.length === 0 ? (
          <p className="text-sm text-gray-400">Aucune cause déclarée.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {p.causesStandBy.map((c, i) => (
              <span
                key={c + i}
                className="inline-flex items-center gap-1.5 pl-3 pr-2 py-1 rounded-full bg-gray-100 text-sm text-gray-700"
              >
                {c}
                {estAdmin && (
                  <button
                    type="button"
                    onClick={() => maj({ causesStandBy: p.causesStandBy.filter((_, j) => j !== i) })}
                    className="text-gray-400 hover:text-red-600 transition"
                    aria-label={`Retirer ${c}`}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </span>
            ))}
          </div>
        )}
        {estAdmin && (
          <ChampAjout
            libelle="Ajouter une cause"
            placeholder="Ex. STBY METEO, STBY SITE TG…"
            existantes={p.causesStandBy}
            onAjouter={(cause) => maj({ causesStandBy: [...p.causesStandBy, cause] })}
          />
        )}

        <p className="text-sm font-medium text-gray-700 mt-6 mb-1">Heures incompressibles par champ</p>
        <p className="text-xs text-gray-500 mb-2">
          Aucune valeur n'est proposée : ni le document ni le classeur n'en donnent. Un champ laissé vide n'a pas
          d'incompressible <em>défini</em> — ce n'est pas la même chose qu'un incompressible nul.
        </p>
        {p.sites.length === 0 ? (
          <p className="text-sm text-gray-400">Déclarez d'abord les champs, dans le bloc Productivité.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 max-w-2xl">
            {p.sites.map((s, i) => (
              <Input
                key={s.site + i}
                label={s.site || 'Champ sans nom'}
                type="number"
                min="0"
                step="0.5"
                placeholder="Non défini"
                disabled={!estAdmin}
                value={texte(s.heuresIncompressibles)}
                onChange={(e) =>
                  maj({
                    sites: p.sites.map((x, j) =>
                      j === i ? { ...x, heuresIncompressibles: valeur(e.target.value) } : x
                    ),
                  })
                }
              />
            ))}
          </div>
        )}
      </Bloc>

      {erreur && <p className="text-sm text-red-600">{erreur}</p>}

      {estAdmin ? (
        <div className="flex items-center justify-end gap-3">
          {succes && !enCours && <span className="text-xs text-emerald-600">Paramètres enregistrés.</span>}
          <Button type="button" loading={enCours} onClick={() => void enregistrer()}>
            Enregistrer les paramètres
          </Button>
        </div>
      ) : (
        <p className="text-xs text-gray-400">Consultation seule — ces paramètres se modifient par un administrateur.</p>
      )}
    </div>
  )
}
