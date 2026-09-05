import { useEffect, useState } from 'react'
import { HardHat, Package, Plus, Target, Timer, Trash2, Users } from 'lucide-react'
import { doc, getDoc, setDoc } from 'firebase/firestore'
import { db } from '../../lib/firebase'
import { COLLECTIONS } from '../../lib/firestoreCollections'
import { surveillerChargement } from '../../lib/incidents'
import { chargerPersonnelAnnexe, chargerSuiviEchafSheet } from '../../data/tonnageEchaf'
import type {
  ParametresContratTonnage,
  PersonnelAnnexe,
  SuiviEchafSheet,
  UniteObjectifTonnage,
} from '../../types/tonnageEchaf'
import {
  FORFAIT_MATERIEL_MENSUEL_FACTURATION_AU_POINT,
  capaciteReference,
  coefficientDuDocument,
  normaliserParametresTonnage,
  objectifDansLautreUnite,
  parametresDepuisClasseur,
} from '../../lib/contratTonnageParametres'
import { formatNombre } from '../../lib/format'
import { useAuth } from '../../contexts/useAuth'
import { useMontant } from '../../lib/montantAffiche'
import { Button } from '../ui/Button'
import { Input } from '../ui/Input'
import { champFormClass } from '../ui/classes'

// Paramètres du contrat Échafaudage (03/09/2026, `doc/Suivi tonnage
// rev01.docx` — lot 1 de `doc/recueil-module-tonnage-rev01.md`).
//
// **Pourquoi ici et pas dans le module** : c'est le régime déjà retenu pour
// les Tarifs NPT du CRJ (23/08/2026) et pour le contrat peinture
// (27/08/2026) — un réglage d'administration se règle là où se règlent les
// autres, sous les mêmes droits (lecture pour tout connecté, écriture admin).
// L'onglet « Suivi personnel » du module garde ses cartes « Heures de
// productivité » et « Équipe Core crew » : ce sont les valeurs du classeur, en
// lecture.
//
// **Reprise sans migration** : tant que `tonnage_echaf_parametres/contrat`
// n'existe pas, l'écran sert ce que portent les blobs importés (même patron
// que les devises et la peinture) — et « Enregistrer » écrit ce que l'admin a
// sous les yeux, ni plus ni moins. Les blobs ne sont jamais réécrits.
//
// **Ce que ce lot ne fait pas, et l'écran le dit** : aucun calcul ne lit
// encore ces valeurs. Le Suivi personnel continue de dériver ses 4 colonnes
// des paramètres du classeur (`derivePersonnelTonnage`). C'est le lot 2 qui
// les branche, et il attend trois arbitrages (Q1, Q2, Q3 du recueil) dont deux
// feraient diverger l'application du classeur sur les 3 384 lignes aujourd'hui
// vérifiées à 0 écart.

const DOC_ID = 'contrat'

/** Saisie numérique : le vide reste vide (`null`), il ne devient jamais 0. */
const texte = (v: number | null) => (v === null ? '' : String(v))
const valeur = (v: string): number | null => {
  const t = v.trim()
  if (t === '') return null
  const n = Number(t)
  return Number.isFinite(n) ? n : null
}

const UNITES: { valeur: UniteObjectifTonnage; label: string }[] = [
  { valeur: 'T', label: 'Tonnes par jour (T)' },
  { valeur: 'KG', label: 'Kilogrammes par jour (KG)' },
]

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

function ChampDeriveTexte({ libelle, valeur: v }: { libelle: string; valeur: string }) {
  return (
    <div>
      <span className="block text-sm font-medium text-gray-500 mb-1.5">{libelle}</span>
      <p className="px-4 py-3 rounded-xl border border-gray-100 bg-gray-50 text-base text-gray-500">{v}</p>
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

export function ParametresTonnageTab({ estAdmin }: { estAdmin: boolean }) {
  const { currentUser } = useAuth()
  const { montant: formatMontant } = useMontant()
  const [parametres, setParametres] = useState<ParametresContratTonnage | null>(null)
  const [enregistre, setEnregistre] = useState<boolean | null>(null)
  const [chargement, setChargement] = useState(true)
  const [enCours, setEnCours] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)
  const [succes, setSucces] = useState(false)

  useEffect(() => {
    let actif = true
    Promise.all([
      surveillerChargement(
        'Les paramètres du contrat Échafaudage',
        getDoc(doc(db, COLLECTIONS.tonnageEchafParametres, DOC_ID)),
        null
      ),
      chargerPersonnelAnnexe().catch(() => null) as Promise<PersonnelAnnexe | null>,
      chargerSuiviEchafSheet().catch(() => null) as Promise<SuiviEchafSheet | null>,
    ]).then(([snap, annexe, sheet]) => {
      if (!actif) return
      const lu = snap?.exists() ? (snap.data() as Partial<ParametresContratTonnage>) : null
      setEnregistre(!!lu)
      // Reprise : les blobs du classeur servent de point de départ tant que
      // rien n'a été enregistré. S'ils n'ont pas pu être chargés non plus,
      // l'écran part sur les seules valeurs que le document énonce.
      setParametres(lu ? normaliserParametresTonnage(lu) : parametresDepuisClasseur(annexe, sheet))
      setChargement(false)
    })
    return () => {
      actif = false
    }
  }, [])

  if (chargement) return <p className="text-sm text-gray-500">Chargement des paramètres…</p>
  if (!parametres) return null

  const p = parametres
  const maj = (patch: Partial<ParametresContratTonnage>) => {
    setParametres({ ...p, ...patch })
    setSucces(false)
  }

  const capacite = capaciteReference(p)
  const effectifReference =
    p.equipeReference.chefsEquipe === null && p.equipeReference.monteurs === null
      ? null
      : (p.equipeReference.chefsEquipe ?? 0) + (p.equipeReference.monteurs ?? 0)
  const sansCoefficient = p.profils.filter((x) => x.coefficient === null).map((x) => x.profil)
  const uniteCourte = p.uniteObjectif === 'T' ? 'T' : 'kg'

  const enregistrer = async () => {
    setEnCours(true)
    setErreur(null)
    try {
      const suivant: ParametresContratTonnage = {
        ...p,
        misAJourLe: new Date().toISOString(),
        ...(currentUser ? { misAJourPar: currentUser.name } : {}),
      }
      await setDoc(doc(db, COLLECTIONS.tonnageEchafParametres, DOC_ID), suivant)
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
            <HardHat className="w-4.5 h-4.5" />
          </span>
          <div className="min-w-0">
            <p className="font-semibold text-gray-900">Contrat Échafaudage — paramètres métier</p>
            <p className="text-xs text-gray-500 mt-0.5 max-w-3xl">
              L'objectif contractuel de production, l'équipe de référence et ses coefficients, les forfaits matériel et
              Core crew, et les causes de stand-by. Jusqu'ici l'objectif de 2,5 T/jour n'était nommé nulle part : il se
              déduisait d'un blob importé en lecture seule. Le modifier ne doit pas demander de toucher au code.
            </p>
            {enregistre === false && (
              <p className="text-xs text-amber-600 mt-1.5">
                Rien n'a encore été enregistré : les valeurs ci-dessous viennent des blobs importés du classeur et du
                contrat. Elles ne deviennent les paramètres du contrat qu'une fois enregistrées.
              </p>
            )}
            <p className="text-xs text-gray-400 mt-1.5">
              Aucun calcul ne lit encore ces valeurs : le Suivi personnel dérive toujours ses objectifs des paramètres
              du classeur. Le branchement est le lot suivant.
            </p>
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
            La composition sur laquelle l'objectif contractuel a été défini — 1 chef d'équipe et 2 monteurs dans le
            contrat actuel, soit une équipe de 3 personnes (Core crew). <strong>Elle entre dans le calcul</strong> : sa
            capacité productive est le dénominateur de la répartition des objectifs individuels. La modifier changera
            tous les objectifs par profil.
          </>
        }
      >
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 max-w-3xl">
          <Input
            label="Chefs d'équipe"
            type="number"
            min="0"
            disabled={!estAdmin}
            value={texte(p.equipeReference.chefsEquipe)}
            onChange={(e) => maj({ equipeReference: { ...p.equipeReference, chefsEquipe: valeur(e.target.value) } })}
          />
          <Input
            label="Monteurs"
            type="number"
            min="0"
            disabled={!estAdmin}
            value={texte(p.equipeReference.monteurs)}
            onChange={(e) => maj({ equipeReference: { ...p.equipeReference, monteurs: valeur(e.target.value) } })}
          />
          <ChampDeriveTexte
            libelle="Effectif de référence"
            valeur={effectifReference === null ? '—' : `${formatNombre(effectifReference)} personnes`}
          />
          <ChampDeriveTexte
            libelle="Capacité productive"
            valeur={capacite === null ? '—' : formatNombre(capacite, 2)}
          />
        </div>
        {capacite === null && (
          <p className="text-xs text-amber-600 mt-3">
            La capacité productive ne peut pas être établie tant qu'un des deux profils de l'équipe de référence n'a pas
            de coefficient (bloc « Profils et coefficients », plus bas).
          </p>
        )}
      </Bloc>

      <Bloc
        titre="Objectif de production — par champ"
        icone={Target}
        aide={
          <>
            L'objectif journalier de l'équipe et la durée d'une journée de travail, pour chacun des trois champs du
            contrat (AGM · IM · TRM). L'unité vaut pour tout le contrat : le document donne les deux formes
            (« 2,5 T/jour », « 500 KG/jour »), et 1 tonne = 1 000 kg. Le forfait matériel de la mutualisation se règle
            plus bas ; les heures de stand-by incompressible, dans le bloc Stand-by — un champ ne se déclare qu'une fois.
          </>
        }
      >
        <div className="max-w-sm mb-4">
          {/* Menu fermé et sans option vide : l'objectif est toujours exprimé
              dans l'une des deux unités, il n'y a pas d'état « non renseigné ». */}
          <label className="block text-sm font-medium mb-1.5 text-gray-500" htmlFor="tonnage-unite-objectif">
            Unité de l'objectif
          </label>
          <select
            id="tonnage-unite-objectif"
            value={p.uniteObjectif}
            disabled={!estAdmin}
            onChange={(e) => maj({ uniteObjectif: e.target.value === 'KG' ? 'KG' : 'T' })}
            className={champFormClass}
          >
            {UNITES.map((u) => (
              <option key={u.valeur} value={u.valeur}>
                {u.label}
              </option>
            ))}
          </select>
        </div>
        {p.champs.length === 0 ? (
          <p className="text-sm text-gray-400">Aucun champ déclaré.</p>
        ) : (
          p.champs.map((c, i) => {
            const autre = objectifDansLautreUnite(c.objectifJour, p.uniteObjectif)
            return (
              <LigneSupprimable
                key={c.champ + i}
                onSupprimer={estAdmin ? () => maj({ champs: p.champs.filter((_, j) => j !== i) }) : undefined}
              >
                <Input
                  label="Champ"
                  disabled={!estAdmin}
                  value={c.champ}
                  onChange={(e) =>
                    maj({ champs: p.champs.map((x, j) => (j === i ? { ...x, champ: e.target.value } : x)) })
                  }
                />
                <Input
                  label="Heures / jour"
                  type="number"
                  min="0"
                  step="0.5"
                  disabled={!estAdmin}
                  value={texte(c.nombreHeures)}
                  onChange={(e) =>
                    maj({
                      champs: p.champs.map((x, j) => (j === i ? { ...x, nombreHeures: valeur(e.target.value) } : x)),
                    })
                  }
                />
                <Input
                  label={`Objectif / jour (${uniteCourte})`}
                  type="number"
                  min="0"
                  step="0.1"
                  disabled={!estAdmin}
                  value={texte(c.objectifJour)}
                  onChange={(e) =>
                    maj({
                      champs: p.champs.map((x, j) => (j === i ? { ...x, objectifJour: valeur(e.target.value) } : x)),
                    })
                  }
                />
                <ChampDeriveTexte
                  libelle="Soit"
                  valeur={
                    autre === null
                      ? '—'
                      : `${formatNombre(autre.valeur, autre.unite === 'KG' ? 0 : 3)} ${
                          autre.unite === 'KG' ? 'kg' : 'T'
                        } / jour`
                  }
                />
              </LigneSupprimable>
            )
          })
        )}
        {estAdmin && (
          <ChampAjout
            libelle="Ajouter un champ"
            placeholder="Ex. AGM, IM, TRM…"
            existantes={p.champs.map((x) => x.champ)}
            onAjouter={(champ) =>
              maj({
                champs: [
                  ...p.champs,
                  {
                    champ,
                    nombreHeures: null,
                    objectifJour: null,
                    forfaitMaterielTonnesJour: null,
                    heuresIncompressibles: null,
                  },
                ],
              })
            }
          />
        )}
      </Bloc>

      <Bloc
        titre="Profils et coefficients de productivité"
        icone={Users}
        aide={
          <>
            La contribution théorique d'un monteur vaut deux fois celle d'un chef d'équipe, qui partage son temps entre
            encadrement, préparation, coordination et reporting — d'où les coefficients 1 et 0,5. C'est d'eux que se
            déduiront les objectifs individuels : un profil <strong>sans coefficient ne pèse rien</strong>, il n'en
            reçoit pas un d'office.
          </>
        }
      >
        {p.profils.length === 0 ? (
          <p className="text-sm text-gray-400">Aucun profil déclaré.</p>
        ) : (
          p.profils.map((x, i) => (
            <LigneSupprimable
              key={x.profil + i}
              onSupprimer={estAdmin ? () => maj({ profils: p.profils.filter((_, j) => j !== i) }) : undefined}
            >
              <Input
                label="Profil"
                disabled={!estAdmin}
                value={x.profil}
                onChange={(e) =>
                  maj({ profils: p.profils.map((y, j) => (j === i ? { ...y, profil: e.target.value } : y)) })
                }
              />
              <Input
                label="Coefficient"
                type="number"
                min="0"
                step="0.1"
                placeholder="Non défini"
                disabled={!estAdmin}
                value={texte(x.coefficient)}
                onChange={(e) =>
                  maj({ profils: p.profils.map((y, j) => (j === i ? { ...y, coefficient: valeur(e.target.value) } : y)) })
                }
              />
            </LigneSupprimable>
          ))
        )}
        {sansCoefficient.length > 0 && (
          <p className="text-xs text-amber-600 mt-3">
            Sans coefficient : {sansCoefficient.join(', ')}. Ces profils ne compteront pas dans la capacité productive
            tant qu'ils n'en ont pas — le contrat n'en définit que deux.
          </p>
        )}
        {estAdmin && (
          <ChampAjout
            libelle="Ajouter un profil"
            placeholder="Ex. Monteur, Chef d'Equipe, Coordinateur…"
            existantes={p.profils.map((x) => x.profil)}
            onAjouter={(profil) =>
              maj({ profils: [...p.profils, { profil, coefficient: coefficientDuDocument(profil) }] })
            }
          />
        )}
      </Bloc>

      <Bloc
        titre="Forfaits du contrat"
        icone={Package}
        aide={
          <>
            Le forfait matériel couvre la mise à disposition de 5 tonnes d'échafaudage par champ et par jour — c'est lui
            que la mutualisation reporte d'un jour sur l'autre. Le forfait personnel couvre la Core crew ; toute
            ressource mobilisée en renfort est facturée en Part Variable.
          </>
        }
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-2xl mb-4">
          <Input
            label="Forfait matériel (XAF / mois)"
            type="number"
            min="0"
            disabled={!estAdmin}
            value={texte(p.forfaitMaterielMensuelXaf)}
            onChange={(e) => maj({ forfaitMaterielMensuelXaf: valeur(e.target.value) })}
          />
          <Input
            label="Forfait Core crew (XAF / mois)"
            type="number"
            min="0"
            disabled={!estAdmin}
            value={texte(p.forfaitCoreCrewMensuelXaf)}
            onChange={(e) => maj({ forfaitCoreCrewMensuelXaf: valeur(e.target.value) })}
          />
        </div>
        <p className="text-xs text-amber-600 mb-4">
          Le forfait Core crew concorde avec le classeur « Facturation au point » (
          {formatMontant(6_000_000, 'XAF')} / mois) ; celui du matériel n'y concorde pas — le classeur y porte{' '}
          {formatMontant(FORFAIT_MATERIEL_MENSUEL_FACTURATION_AU_POINT, 'XAF')} / mois. C'est la valeur du document du
          contrat Échafaudage qui est proposée ici, à confirmer.
        </p>

        <p className="text-sm font-medium text-gray-700 mb-2">Forfait matériel par champ (tonnes / jour)</p>
        {p.champs.length === 0 ? (
          <p className="text-sm text-gray-400">Déclarez d'abord les champs, dans le bloc Objectif de production.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 max-w-2xl">
            {p.champs.map((c, i) => (
              <Input
                key={c.champ + i}
                label={c.champ || 'Champ sans nom'}
                type="number"
                min="0"
                step="0.5"
                placeholder="Non défini"
                disabled={!estAdmin}
                value={texte(c.forfaitMaterielTonnesJour)}
                onChange={(e) =>
                  maj({
                    champs: p.champs.map((x, j) =>
                      j === i ? { ...x, forfaitMaterielTonnesJour: valeur(e.target.value) } : x
                    ),
                  })
                }
              />
            ))}
          </div>
        )}
      </Bloc>

      <Bloc
        titre="Stand-by"
        icone={Timer}
        aide={
          <>
            Les causes proposées à la saisie, et les heures de stand-by incompressible de chaque champ — le temps qui ne
            peut pas être optimisé (pause repas, contraintes obligatoires du contrat). La liste est{' '}
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
            placeholder="Ex. STBY METEO, STBY LOG TG…"
            existantes={p.causesStandBy}
            onAjouter={(cause) => maj({ causesStandBy: [...p.causesStandBy, cause] })}
          />
        )}

        <p className="text-sm font-medium text-gray-700 mt-6 mb-1">Heures incompressibles par champ</p>
        <p className="text-xs text-gray-500 mb-2">
          Aucune valeur n'est proposée : ni le document ni le classeur n'en donnent. Un champ laissé vide n'a pas
          d'incompressible <em>défini</em> — ce n'est pas la même chose qu'un incompressible nul.
        </p>
        {p.champs.length === 0 ? (
          <p className="text-sm text-gray-400">Déclarez d'abord les champs, dans le bloc Objectif de production.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 max-w-2xl">
            {p.champs.map((c, i) => (
              <Input
                key={c.champ + i}
                label={c.champ || 'Champ sans nom'}
                type="number"
                min="0"
                step="0.5"
                placeholder="Non défini"
                disabled={!estAdmin}
                value={texte(c.heuresIncompressibles)}
                onChange={(e) =>
                  maj({
                    champs: p.champs.map((x, j) =>
                      j === i ? { ...x, heuresIncompressibles: valeur(e.target.value) } : x
                    ),
                  })
                }
              />
            ))}
          </div>
        )}
      </Bloc>

      <Bloc
        titre="Rapport journalier"
        icone={HardHat}
        aide={
          <>
            La société exécutante proposée par défaut à la saisie. « GMI » détient actuellement l'exclusivité du
            contrat, mais la valeur reste modifiable — au réglage comme à la saisie.
          </>
        }
      >
        <div className="max-w-sm">
          <Input
            label="Société exécutante par défaut"
            disabled={!estAdmin}
            value={p.societeExecutanteParDefaut ?? ''}
            onChange={(e) => maj({ societeExecutanteParDefaut: e.target.value.trim() || null })}
          />
        </div>
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
