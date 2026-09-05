import { useMemo, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import type {
  AppartenanceEquipe,
  ItemMobilise,
  LigneJournalPeinture,
  ParametresContratPeinture,
  PersonnelMobilise,
  RapportPeinture,
  StandByCause,
} from '../../types/contratPeinture'
import {
  APPARTENANCES_EQUIPE,
  CATEGORIE_CONSOMMABLE,
  CATEGORIE_MATERIEL,
  UNITE_MATERIEL,
} from '../../types/contratPeinture'
import { useNavette } from '../../contexts/useNavette'
import {
  affairesAReprendre,
  dateRapportPrecedent,
  ecartStandBy,
  lignesDuRapport,
  itemsDepuisJournal,
  marquerForfait,
  materielAuForfait,
  personnelDepuisJournal,
  estIncompressible,
  standByDepuisJournal,
  standByEstCoherent,
  standByParDefaut,
  statutAffaire,
  texteDepuisAvis,
  totalDesCauses,
} from '../../lib/contratPeintureRapports'
import { effectifsDuJour, modeleDuSite, objectifJournalier } from '../../lib/contratPeintureProductivite'
import { aujourdHui } from '../../lib/saisie'
import { formatNombre } from '../../lib/format'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import { Input } from '../ui/Input'
import { selectClass } from '../ui/classes'

// Rapport journalier du contrat peinture (27/08/2026, `doc/Contrat
// peinture.docx` §1, §2, §3, §6, §10 — lot 3).
//
// **Le parcours suit l'ordre du document**, et ce n'est pas cosmétique : « il
// doit donc commencer par sélectionner le champ concerné avant de renseigner
// son rapport journalier » (§2). Le champ et la date viennent donc en premier,
// et c'est ce couple qui détermine ce que la reprise a le droit de proposer.
//
// Ce que l'écran ne fait pas : il ne crée pas un second modèle de données. Les
// affaires reprises deviennent des **lignes de pointage** ordinaires, le
// stand-by devient des **lignes STD**, et tout le module continue de lire le
// journal. Le document du rapport ne porte que ce que le journal ne sait pas
// dire — l'en-tête, et le total de stand-by *déclaré* dont le §10 demande
// qu'il soit contrôlé contre la somme des causes.

export interface AffaireDuRapport {
  /** Ligne existante du rapport du jour, ou `null` si elle reste à créer. */
  ligneExistante: LigneJournalPeinture | null
  /** Ligne du rapport précédent dont celle-ci est la suite (§3). */
  lignePrecedenteId: string | number | null
  projet: string
  tache: string
  /** Ligne navette dont le libellé est repris (§6), ou `null` = routine. */
  ligneNavetteId: string | null
  /** Fiche projet héritée de la ligne navette, quand elle en a une. */
  projetId: string | null
  /** Un ou plusieurs avis, séparés par des virgules (§6). */
  numeroAvis: string
  numeroOt: string
  surfaceTotale: string
  surfaceRealisee: string
  /** Surface à date au rapport précédent — sert à montrer la production. */
  surfaceVeille: number | null
  statut: 'En cours' | 'Terminé'
  reprise: boolean
}

export interface RapportSoumis {
  rapport: Omit<RapportPeinture, 'id'>
  affaires: AffaireDuRapport[]
  personnel: PersonnelMobilise[]
  consommables: ItemMobilise[]
  materiel: ItemMobilise[]
}

const texte = (v: unknown) => (v === null || v === undefined ? '' : String(v))
const valeur = (v: string): number | null => {
  const t = v.trim()
  if (t === '') return null
  const n = Number(t)
  return Number.isFinite(n) ? n : null
}

function affaireVide(): AffaireDuRapport {
  return {
    ligneExistante: null,
    lignePrecedenteId: null,
    ligneNavetteId: null,
    projetId: null,
    projet: '',
    tache: '',
    numeroAvis: '',
    numeroOt: '',
    surfaceTotale: '',
    surfaceRealisee: '',
    surfaceVeille: null,
    statut: 'En cours',
    reprise: false,
  }
}

/**
 * Une liste d'items (consommables ou matériel) : menu déroulant du
 * référentiel, quantité, unité.
 *
 * §8 : « Les consommables doivent être sélectionnés dans une **liste
 * déroulante** ». Un item déjà enregistré mais absent du référentiel reste
 * proposé dans son propre menu — le retirer effacerait silencieusement une
 * saisie (même précaution que les causes de stand-by).
 */
function ListeItems({
  items,
  onChange,
  choix,
  uniteImposee,
  vide,
  ajout,
}: {
  items: ItemMobilise[]
  onChange: (items: ItemMobilise[]) => void
  choix: { nom: string; unite: string | null }[]
  uniteImposee?: string
  vide: React.ReactNode
  ajout: string
}) {
  if (items.length === 0 && choix.length === 0) return <>{vide}</>
  const maj = (i: number, patch: Partial<ItemMobilise>) =>
    onChange(items.map((x, j) => (j === i ? { ...x, ...patch } : x)))
  return (
    <div className="space-y-2 max-w-3xl">
      {items.map((item, i) => (
        <div key={i} className="flex items-center gap-2 flex-wrap">
          <select
            className="flex-1 min-w-48 px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm"
            value={item.nom}
            onChange={(e) => {
              const c = choix.find((x) => x.nom === e.target.value)
              maj(i, { nom: e.target.value, unite: uniteImposee ?? c?.unite ?? item.unite })
            }}
          >
            <option value="">Choisir…</option>
            {choix.map((c) => (
              <option key={c.nom} value={c.nom}>
                {c.nom}
              </option>
            ))}
            {item.nom && !choix.some((c) => c.nom === item.nom) && (
              <option value={item.nom}>{item.nom}</option>
            )}
          </select>
          <input
            type="number"
            min="0"
            step="0.01"
            placeholder="Quantité"
            className="w-28 px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm"
            value={item.quantite === null ? '' : String(item.quantite)}
            onChange={(e) => maj(i, { quantite: valeur(e.target.value) })}
          />
          <input
            placeholder="Unité"
            disabled={!!uniteImposee}
            className="w-24 px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm disabled:bg-gray-50 disabled:text-gray-500"
            value={item.unite ?? ''}
            onChange={(e) => maj(i, { unite: e.target.value.trim() || null })}
          />
          {item.auForfait && (
            <span className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700">Au forfait</span>
          )}
          <button
            type="button"
            onClick={() => onChange(items.filter((_, j) => j !== i))}
            className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition"
            aria-label="Retirer cette ligne"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      ))}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => onChange([...items, { nom: '', quantite: null, unite: uniteImposee ?? null }])}
      >
        <Plus className="w-4 h-4 mr-1.5" />
        {ajout}
      </Button>
    </div>
  )
}

export function RapportPeintureModal({
  isOpen,
  onClose,
  onSubmit,
  journal,
  parametres,
  rapports,
  sites,
  societes,
  redacteurParDefaut,
}: {
  isOpen: boolean
  onClose: () => void
  onSubmit: (v: RapportSoumis) => Promise<void>
  journal: LigneJournalPeinture[]
  parametres: ParametresContratPeinture | null
  rapports: RapportPeinture[]
  sites: string[]
  societes: string[]
  redacteurParDefaut: string | null
}) {
  const [site, setSite] = useState('')
  const [date, setDate] = useState(aujourdHui())
  const [redacteur, setRedacteur] = useState(redacteurParDefaut ?? '')
  // §1 : « par défaut "GMI", car cette société détient actuellement
  // l'exclusivité du contrat. Cependant, cette valeur doit rester modifiable ».
  const [societe, setSociete] = useState('GMI')
  const [standByTotal, setStandByTotal] = useState('')
  const [causes, setCauses] = useState<StandByCause[]>([])
  const [affaires, setAffaires] = useState<AffaireDuRapport[]>([])
  const [personnel, setPersonnel] = useState<PersonnelMobilise[]>([])
  const [consommables, setConsommables] = useState<ItemMobilise[]>([])
  const [materiel, setMateriel] = useState<ItemMobilise[]>([])
  const { lignes: lignesNavette } = useNavette()
  // Le couple (champ, date) déjà chargé : sert à ne réinitialiser le contenu
  // qu'une fois par changement, pendant le rendu — pas dans un effet, qui
  // déclencherait un rendu en cascade (même mécanique que la reprise J-1 du
  // CRJ).
  const [chargePour, setChargePour] = useState<string | null>(null)

  const clef = site ? `${date}__${site}` : null
  const causesConnues = useMemo(
    () => parametres?.causesStandBy ?? [],
    [parametres]
  )

  if (isOpen && clef && clef !== chargePour) {
    setChargePour(clef)
    const existantes = lignesDuRapport(journal, date, site).filter(
      (l) => (l.categorie ?? '').trim().toUpperCase() === 'TRAVAUX'
    )
    const reprises = affairesAReprendre(journal, site, date)
    setAffaires([
      ...existantes.map((l) => ({
        ligneExistante: l,
        lignePrecedenteId: l.lignePrecedenteId ?? null,
        ligneNavetteId: l.ligneNavetteId ?? null,
        projetId: l.projetId ?? null,
        projet: texte(l.projet),
        tache: texte(l.tache),
        numeroAvis: texteDepuisAvis(l),
        numeroOt: texte(l.numeroOt),
        surfaceTotale: texte(l.surfaceTotale),
        surfaceRealisee: texte(l.surfaceRealisee),
        surfaceVeille: null,
        statut: statutAffaire(l),
        reprise: false,
      })),
      ...reprises.map((r) => ({
        ligneExistante: null,
        lignePrecedenteId: r.origine.id,
        // Le rattachement suit l'affaire : la reprise ne redemande pas d'où
        // vient le projet, elle continue le même.
        ligneNavetteId: r.origine.ligneNavetteId ?? null,
        projetId: r.origine.projetId ?? null,
        projet: texte(r.origine.projet),
        tache: texte(r.origine.tache),
        numeroAvis: texteDepuisAvis(r.origine),
        numeroOt: texte(r.origine.numeroOt),
        surfaceTotale: texte(r.origine.surfaceTotale),
        // La surface repart de celle de la veille : l'utilisateur « n'aura
        // qu'à mettre à jour l'avancement du jour » (§3), pas tout retaper.
        surfaceRealisee: texte(r.origine.surfaceRealisee),
        surfaceVeille: r.surfaceVeille,
        statut: 'En cours' as const,
        reprise: true,
      })),
    ])
    const rapportExistant = rapports.find((r) => r.date === date && r.site.trim().toLowerCase() === site.trim().toLowerCase())
    setStandByTotal(texte(rapportExistant?.standByTotalHeures))
    // §10 : les heures incompressibles paramétrées pour le champ sont
    // proposées d'office. Rien n'est proposé si le champ n'a pas de valeur —
    // le document en demande une sans en donner — ni si la journée porte déjà
    // une ventilation.
    setCauses(standByParDefaut(parametres, site, standByDepuisJournal(journal, date, site)))
    // Effectif déjà pointé, sinon une ligne vide par profil déclaré : c'est
    // exactement ce que le §7 demande de renseigner, et rien d'autre.
    const dejaPointe = personnelDepuisJournal(journal, date, site)
    setPersonnel(
      dejaPointe.length
        ? dejaPointe
        : (parametres?.profils ?? []).map((p) => ({
            profil: p.profil,
            effectif: null,
            appartenance: 'CORE CREW' as AppartenanceEquipe,
          }))
    )
    setConsommables(itemsDepuisJournal(journal, date, site, CATEGORIE_CONSOMMABLE))
    // §9 : le matériel au forfait est proposé d'office chaque jour ; ce qui
    // est déjà saisi n'est jamais écrasé, et la proposition se rejoue sans
    // doublon.
    const materielSaisi = itemsDepuisJournal(journal, date, site, CATEGORIE_MATERIEL)
    setMateriel([
      ...marquerForfait(materielSaisi, parametres),
      ...materielAuForfait(parametres, materielSaisi),
    ])
    if (rapportExistant?.redacteur) setRedacteur(rapportExistant.redacteur)
    if (rapportExistant?.societeExecutante) setSociete(rapportExistant.societeExecutante)
  }

  const datePrecedente = site ? dateRapportPrecedent(journal, site, date) : null
  const ecart = ecartStandBy(valeur(standByTotal), causes)
  const coherent = standByEstCoherent(valeur(standByTotal), causes)

  // Objectif du jour : calculé sur **l'effectif en cours de saisie** et non
  // sur ce que le journal porte déjà — sans quoi il ne bougerait pas pendant
  // qu'on renseigne le personnel, ce qui est précisément le moment où on veut
  // le voir (§7 : « la productivité attendue dépend directement des
  // ressources mobilisées »).
  const objectif = useMemo(() => {
    if (!parametres || !site) return null
    const saisis = personnel
      .filter((p) => p.profil.trim() !== '' && p.effectif !== null)
      .map((p) => ({ profil: p.profil, effectif: p.effectif as number }))
    const effectifs = saisis.length ? saisis : effectifsDuJour(journal, date, site)
    return objectifJournalier(effectifs, modeleDuSite(parametres, site))
  }, [parametres, journal, date, site, personnel])

  const majAffaire = (i: number, patch: Partial<AffaireDuRapport>) =>
    setAffaires((a) => a.map((x, j) => (j === i ? { ...x, ...patch } : x)))

  const [enCours, setEnCours] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)

  const enregistrer = async () => {
    setEnCours(true)
    setErreur(null)
    try {
      await onSubmit({
        rapport: {
          date,
          site,
          redacteur: redacteur.trim() || null,
          societeExecutante: societe.trim() || null,
          standByTotalHeures: valeur(standByTotal),
          standByCauses: causes,
        },
        affaires: affaires.filter((a) => a.projet.trim() !== ''),
        personnel: personnel.filter((p) => p.profil.trim() !== '' && p.effectif !== null),
        consommables: consommables.filter((c) => c.nom.trim() !== ''),
        materiel: materiel.filter((m) => m.nom.trim() !== ''),
      })
      setChargePour(null)
      onClose()
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "Le rapport n'a pas pu être enregistré.")
    } finally {
      setEnCours(false)
    }
  }

  const fermer = () => {
    setChargePour(null)
    onClose()
  }

  return (
    <Modal isOpen={isOpen} onClose={fermer} title="Rapport journalier de suivi peinture" maxWidth="max-w-5xl">
      <div className="space-y-6">
        {/* --- §1 et §2 : l'en-tête, et le champ avant tout le reste ------ */}
        <section>
          <h4 className="font-semibold text-gray-900 text-sm mb-1">Informations générales</h4>
          <p className="text-xs text-gray-500 mb-3">
            Le champ se choisit en premier : c'est lui qui détermine les affaires reprises du rapport précédent.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-500 mb-1.5">Champ (site)</label>
              <select value={site} onChange={(e) => setSite(e.target.value)} className={selectClass}>
                <option value="">Choisir un champ…</option>
                {sites.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
            <Input label="Date du rapport" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            <Input
              label="Rédacteur du rapport"
              value={redacteur}
              onChange={(e) => setRedacteur(e.target.value)}
              placeholder="Nom de la personne"
            />
            <div>
              <label className="block text-sm font-medium text-gray-500 mb-1.5">Société exécutante</label>
              <input
                list="peinture-societes"
                value={societe}
                onChange={(e) => setSociete(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-gray-50 text-base text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary focus:bg-white"
              />
              <datalist id="peinture-societes">
                {societes.map((s) => (
                  <option key={s} value={s} />
                ))}
              </datalist>
            </div>
          </div>
        </section>

        {!site ? (
          <p className="text-sm text-gray-400">Choisissez un champ pour composer le rapport.</p>
        ) : (
          <>
            {/* --- §3 et §6 : les affaires, reprises puis mises à jour ---- */}
            <section>
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div>
                  <h4 className="font-semibold text-gray-900 text-sm">Affaires du jour</h4>
                  <p className="text-xs text-gray-500 mt-0.5 max-w-2xl">
                    {datePrecedente ? (
                      <>
                        Les affaires « En cours » du rapport du {datePrecedente} sont reprises automatiquement — il n'y
                        a que l'avancement du jour à mettre à jour. Les affaires « Terminé » ne sont plus reproposées ;
                        elles restent entières dans le journal.
                      </>
                    ) : (
                      <>Aucun rapport antérieur sur ce champ : rien à reprendre, les affaires se saisissent à neuf.</>
                    )}
                  </p>
                </div>
                {objectif?.objectif != null && (
                  <span className="text-xs px-2.5 py-1 rounded-full bg-primary/10 text-primary shrink-0">
                    Objectif du jour {formatNombre(objectif.objectif, 2)} m²
                  </span>
                )}
              </div>

              <div className="mt-3 space-y-2">
                {affaires.length === 0 && (
                  <p className="text-sm text-gray-400">Aucune affaire — ajoutez-en une ci-dessous.</p>
                )}
                {affaires.map((a, i) => {
                  const totale = valeur(a.surfaceTotale)
                  const realisee = valeur(a.surfaceRealisee)
                  const production =
                    a.surfaceVeille !== null && realisee !== null ? realisee - a.surfaceVeille : null
                  return (
                    <div key={i} className="rounded-xl border border-gray-100 bg-gray-50/60 p-3">
                      <div className="flex items-center gap-2 mb-2">
                        {a.reprise && (
                          <span className="text-[11px] px-2 py-0.5 rounded-full bg-blue-50 text-blue-700">
                            Reprise du {datePrecedente}
                          </span>
                        )}
                        {a.ligneExistante && (
                          <span className="text-[11px] px-2 py-0.5 rounded-full bg-gray-200 text-gray-600">
                            Déjà saisie ce jour
                          </span>
                        )}
                        {a.ligneNavetteId && (
                          <span className="text-[11px] px-2 py-0.5 rounded-full bg-violet-50 text-violet-700">
                            Navette{a.projetId ? ' · fiche projet' : ''}
                          </span>
                        )}
                        <span className="flex-1" />
                        <select
                          value={a.statut}
                          onChange={(e) => majAffaire(i, { statut: e.target.value as 'En cours' | 'Terminé' })}
                          className="px-2.5 py-1 rounded-lg border border-gray-200 bg-white text-xs text-gray-900"
                        >
                          <option value="En cours">En cours</option>
                          <option value="Terminé">Terminé</option>
                        </select>
                        <button
                          type="button"
                          onClick={() => setAffaires((x) => x.filter((_, j) => j !== i))}
                          className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition"
                          aria-label="Retirer cette affaire du rapport"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-2">
                        {/* §6 : « Le nom de projet peut provenir d'une
                            navette existante » / « peut également être une
                            activité de routine ». Les deux cas du document,
                            explicitement — le libellé reste modifiable après
                            le choix, il porte souvent l'intitulé du chantier
                            et non celui de la ligne budgétaire. */}
                        <select
                          className="lg:col-span-2 px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm"
                          value={a.ligneNavetteId ?? ''}
                          onChange={(e) => {
                            const ligne = lignesNavette.find((l) => l.id === e.target.value)
                            majAffaire(i, {
                              ligneNavetteId: ligne?.id ?? null,
                              // La fiche projet est **héritée de la navette**,
                              // pas devinée : c'est la chaîne que
                              // l'application construit déjà (navette → fiche).
                              projetId: ligne?.projetId ?? null,
                              projet: ligne ? ligne.libelle : a.projet,
                            })
                          }}
                        >
                          <option value="">Activité de routine</option>
                          {lignesNavette.map((l) => (
                            <option key={l.id} value={l.id}>
                              {l.libelle}
                              {l.codeOTP ? ` — ${l.codeOTP}` : ''}
                            </option>
                          ))}
                        </select>
                        <input
                          className="lg:col-span-2 px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm"
                          placeholder="Projet / affaire"
                          value={a.projet}
                          onChange={(e) => majAffaire(i, { projet: e.target.value })}
                        />
                        <input
                          className="lg:col-span-2 px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm"
                          placeholder="Tâche"
                          value={a.tache}
                          onChange={(e) => majAffaire(i, { tache: e.target.value })}
                        />
                        <input
                          className="px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm"
                          placeholder="N° avis (séparés par des virgules)"
                          title="Un ou plusieurs avis : 25049104, 25049105"
                          value={a.numeroAvis}
                          onChange={(e) => majAffaire(i, { numeroAvis: e.target.value })}
                        />
                        <input
                          className="px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm"
                          placeholder="N° OT"
                          value={a.numeroOt}
                          onChange={(e) => majAffaire(i, { numeroOt: e.target.value })}
                        />
                        <input
                          type="number"
                          step="0.01"
                          className="px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm"
                          placeholder="Surface totale (m²)"
                          value={a.surfaceTotale}
                          onChange={(e) => majAffaire(i, { surfaceTotale: e.target.value })}
                        />
                        <input
                          type="number"
                          step="0.01"
                          className="px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm"
                          placeholder="Surface réalisée à date (m²)"
                          value={a.surfaceRealisee}
                          onChange={(e) => majAffaire(i, { surfaceRealisee: e.target.value })}
                        />
                        <div className="lg:col-span-4 text-xs text-gray-500 self-center">
                          {totale && realisee !== null
                            ? `Avancement réel ${formatNombre((realisee / totale) * 100, 1)} %`
                            : 'Avancement réel — surface totale et réalisée requises'}
                          {a.surfaceVeille !== null && (
                            <>
                              {' · '}
                              <span className={production !== null && production < 0 ? 'text-amber-600' : ''}>
                                {production === null
                                  ? 'production du jour —'
                                  : `production du jour ${formatNombre(production, 2)} m²`}
                              </span>
                              {production !== null && production < 0 && ' (inférieure à la veille)'}
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>

              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="mt-2"
                onClick={() => setAffaires((a) => [...a, affaireVide()])}
              >
                <Plus className="w-4 h-4 mr-1.5" />
                Ajouter une affaire
              </Button>
            </section>

            {/* --- §7 : les effectifs, et rien d'autre -------------------- */}
            <section>
              <h4 className="font-semibold text-gray-900 text-sm">Personnel mobilisé</h4>
              <p className="text-xs text-gray-500 mt-0.5 mb-3 max-w-2xl">
                Combien de personnes de chaque profil sont présentes, et si elles sont core crew ou hors core crew.
                C'est tout ce que cette catégorie demande — et c'est de là que vient l'objectif du jour affiché
                ci-dessus.
              </p>
              {personnel.length === 0 ? (
                <p className="text-sm text-amber-600">
                  Aucun profil déclaré dans Paramètres › Contrat peinture — l'effectif ne peut pas être saisi, et
                  l'objectif du jour ne peut pas être calculé.
                </p>
              ) : (
                <div className="space-y-2 max-w-3xl">
                  {personnel.map((p, i) => {
                    const modele = parametres ? modeleDuSite(parametres, site) : null
                    const profil = modele?.profils.find(
                      (x) => x.profil.trim().toLowerCase() === p.profil.trim().toLowerCase()
                    )
                    return (
                      <div key={i} className="flex items-center gap-2 flex-wrap">
                        <input
                          className="flex-1 min-w-40 px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm"
                          placeholder="Profil"
                          value={p.profil}
                          onChange={(e) =>
                            setPersonnel((x) => x.map((y, j) => (j === i ? { ...y, profil: e.target.value } : y)))
                          }
                        />
                        <input
                          type="number"
                          min="0"
                          step="1"
                          placeholder="Nombre"
                          className="w-28 px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm"
                          value={texte(p.effectif)}
                          onChange={(e) =>
                            setPersonnel((x) =>
                              x.map((y, j) => (j === i ? { ...y, effectif: valeur(e.target.value) } : y))
                            )
                          }
                        />
                        <select
                          className="px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm"
                          value={p.appartenance}
                          onChange={(e) =>
                            setPersonnel((x) =>
                              x.map((y, j) =>
                                j === i ? { ...y, appartenance: e.target.value as AppartenanceEquipe } : y
                              )
                            )
                          }
                        >
                          {APPARTENANCES_EQUIPE.map((a) => (
                            <option key={a} value={a}>
                              {a}
                            </option>
                          ))}
                        </select>
                        <span className="text-xs text-gray-500 min-w-36">
                          {profil?.objectifJour == null ? (
                            <span className="text-amber-600">coefficient non défini</span>
                          ) : p.effectif === null ? (
                            `${formatNombre(profil.objectifJour, 2)} m² par personne`
                          ) : (
                            `${formatNombre(p.effectif * profil.objectifJour, 2)} m² attendus`
                          )}
                        </span>
                        <button
                          type="button"
                          onClick={() => setPersonnel((x) => x.filter((_, j) => j !== i))}
                          className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition"
                          aria-label="Retirer cette ligne de personnel"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    )
                  })}
                </div>
              )}
              {/* Un même profil peut être présent en core crew *et* hors core
                  crew le même jour : ce sont deux lignes de pointage. */}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="mt-2"
                onClick={() =>
                  setPersonnel((x) => [...x, { profil: '', effectif: null, appartenance: 'CORE CREW' }])
                }
              >
                <Plus className="w-4 h-4 mr-1.5" />
                Ajouter une ligne
              </Button>
            </section>

            {/* --- §8 : les consommables, choisis dans une liste ---------- */}
            <section>
              <h4 className="font-semibold text-gray-900 text-sm">Consommables</h4>
              <p className="text-xs text-gray-500 mt-0.5 mb-3 max-w-2xl">
                Les consommables déclarés dans Paramètres › Contrat peinture, avec leur unité et leurs deux prix
                unitaires. Le coût réel, la comparaison avec l'ancien contrat et le gain s'en déduisent.
              </p>
              <ListeItems
                items={consommables}
                onChange={setConsommables}
                choix={(parametres?.consommables ?? []).map((c) => ({ nom: c.nom, unite: c.unite }))}
                vide={
                  <p className="text-sm text-amber-600">
                    Aucun consommable déclaré dans Paramètres › Contrat peinture.
                  </p>
                }
                ajout="Ajouter un consommable"
              />
            </section>

            {/* --- §9 : le matériel, et son forfait journalier ------------ */}
            <section>
              <h4 className="font-semibold text-gray-900 text-sm">Matériel</h4>
              <p className="text-xs text-gray-500 mt-0.5 mb-3 max-w-2xl">
                Les équipements utilisés, comptés en nombre. Ceux que le contrat couvre par un{' '}
                <strong>forfait journalier</strong> sont proposés d'office chaque jour, à raison d'une occurrence —
                quantité modifiable. Le reste se saisit à la main.
              </p>
              <ListeItems
                items={materiel}
                onChange={setMateriel}
                choix={(parametres?.equipements ?? []).map((e) => ({ nom: e.nom, unite: UNITE_MATERIEL }))}
                uniteImposee={UNITE_MATERIEL}
                vide={
                  <p className="text-sm text-amber-600">
                    Aucun équipement déclaré dans Paramètres › Contrat peinture.
                  </p>
                }
                ajout="Ajouter un équipement"
              />
            </section>

            {/* --- §10 : le stand-by, journalier et non par projet -------- */}
            <section>
              <h4 className="font-semibold text-gray-900 text-sm">Stand-by du jour</h4>
              <p className="text-xs text-gray-500 mt-0.5 mb-3 max-w-2xl">
                Le stand-by se déclare pour la journée et non par projet : les lignes créées ici ne portent aucune
                affaire. Le total des causes doit être égal au total déclaré.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 max-w-2xl">
                <Input
                  label="Total déclaré (h)"
                  type="number"
                  min="0"
                  step="0.5"
                  value={standByTotal}
                  onChange={(e) => setStandByTotal(e.target.value)}
                />
                <div>
                  <span className="block text-sm font-medium text-gray-500 mb-1.5">Total des causes</span>
                  <p
                    className={`px-4 py-3 rounded-xl border text-base ${
                      coherent ? 'border-gray-100 bg-gray-50 text-gray-600' : 'border-amber-300 bg-amber-50 text-amber-700'
                    }`}
                  >
                    {formatNombre(totalDesCauses(causes), 2)} h
                  </p>
                </div>
                {ecart !== null && Math.abs(ecart) > 1e-9 && (
                  <p className="text-xs text-amber-700 self-end pb-3">
                    Écart de {formatNombre(ecart, 2)} h — le rapport ne peut pas être enregistré tant que les deux
                    totaux diffèrent.
                  </p>
                )}
              </div>

              <div className="mt-3 space-y-2 max-w-2xl">
                {causes.map((c, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <select
                      value={c.cause}
                      onChange={(e) => setCauses((x) => x.map((y, j) => (j === i ? { ...y, cause: e.target.value } : y)))}
                      className="flex-1 px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm"
                    >
                      <option value="">Choisir une cause…</option>
                      {causesConnues.map((cc) => (
                        <option key={cc} value={cc}>
                          {cc}
                        </option>
                      ))}
                      {/* Une cause déjà enregistrée mais absente du référentiel
                          reste sélectionnable : la retirer du menu effacerait
                          silencieusement une saisie. */}
                      {c.cause && !causesConnues.includes(c.cause) && <option value={c.cause}>{c.cause}</option>}
                    </select>
                    {estIncompressible(c.cause) && (
                      <span
                        className="text-[11px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 shrink-0"
                        title="Temps qui ne peut pas être optimisé — pause repas, contraintes obligatoires du contrat"
                      >
                        Incompressible
                      </span>
                    )}
                    <input
                      type="number"
                      min="0"
                      step="0.5"
                      placeholder="Heures"
                      value={texte(c.heures)}
                      onChange={(e) =>
                        setCauses((x) => x.map((y, j) => (j === i ? { ...y, heures: valeur(e.target.value) } : y)))
                      }
                      className="w-28 px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm"
                    />
                    <button
                      type="button"
                      onClick={() => setCauses((x) => x.filter((_, j) => j !== i))}
                      className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition"
                      aria-label="Retirer cette cause"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
                {causesConnues.length === 0 && (
                  <p className="text-xs text-amber-600">
                    Aucune cause déclarée dans Paramètres › Contrat peinture — la ventilation ne peut pas être saisie.
                  </p>
                )}
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setCauses((x) => [...x, { cause: '', heures: null }])}
                >
                  <Plus className="w-4 h-4 mr-1.5" />
                  Ajouter une cause
                </Button>
              </div>
            </section>
          </>
        )}

        {erreur && <p className="text-sm text-red-600">{erreur}</p>}

        <div className="flex items-center justify-end gap-3 pt-2 border-t border-gray-100">
          <Button type="button" variant="ghost" onClick={fermer}>
            Annuler
          </Button>
          <Button type="button" loading={enCours} disabled={!site || !coherent} onClick={() => void enregistrer()}>
            Enregistrer le rapport
          </Button>
        </div>
      </div>
    </Modal>
  )
}
