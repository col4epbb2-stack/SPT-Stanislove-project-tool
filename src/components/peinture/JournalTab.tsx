import { useMemo, useState } from 'react'
import { CalendarPlus, Plus } from 'lucide-react'
import type {
  LigneJournalPeinture,
  ParametresContratPeinture,
  RapportPeinture,
  TarifPeinture,
} from '../../types/contratPeinture'
import { RapportPeintureModal, type RapportSoumis } from './RapportPeintureModal'
import { effectifsDuJour, modeleDuSite, objectifJournalier } from '../../lib/contratPeintureProductivite'
import { clesJournalPeinture } from '../../lib/liaisonCles'
import { formatNombre, formatPercent } from '../../lib/format'
import { usePagination } from '../../lib/usePagination'
import { avecAjouts, valeursDistinctes } from '../../lib/saisie'
import { useListesValeurs } from '../../contexts/useListesValeurs'
import { useAuth } from '../../contexts/useAuth'
import { useResolveur } from '../../contexts/useResolveur'
import { Button } from '../ui/Button'
import { Pagination } from '../ui/Pagination'
import { TableauColonnes } from '../ui/TableauColonnes'
import { BarreFiltresTableau, ChampRecherche, CompteurLignes, FiltreSelect } from '../ui/FiltresTableau'
import { ModaleSuppression } from '../ui/ModaleSuppression'
import { MonPerimetreToggle } from '../liaison/MonPerimetreToggle'
import { PieStandByCard } from './elements'
import { PIE_COLORS } from './couleurs'
import { colonnesJournalPeinture } from './colonnes'
import { JournalPeintureSaisieForm, type PeintureSaisieInput } from './JournalPeintureSaisieForm'
import { CATEGORIES_SAISIE } from '../../types/contratPeinture'
import type { CategoriePeinture } from '../../types/contratPeinture'
import { useMontant } from '../../lib/montantAffiche'

// Onglet "Journal de pointage" — extrait de pages/ContratPeinturePage.tsx le
// 06/08/2026 et doté de son point de saisie (JournalPeintureSaisieForm).
// Les 41 colonnes du tableau sont décrites dans colonnes.tsx.

const PAGE_SIZE = 20

// Catégorie normalisée : le classeur mélange "Personnel"/"PERSONNEL" et
// "Consommable"/"CONSOMMABLE" — les filtres travaillent en majuscules, tandis
// que la colonne FILTRE du classeur conserve la casse d'origine.
const categorieNormalisee = (l: LigneJournalPeinture) => (l.categorie ?? '').trim().toUpperCase()

export function JournalTab({
  journal,
  tarifs,
  parametres,
  rapports,
  onEnregistrer,
  onSupprimer,
  onEnregistrerRapport,
}: {
  journal: LigneJournalPeinture[]
  tarifs: TarifPeinture[]
  parametres: ParametresContratPeinture | null
  rapports: RapportPeinture[]
  onEnregistrer: (input: PeintureSaisieInput, initiale: LigneJournalPeinture | null) => Promise<void>
  onSupprimer: (ligne: LigneJournalPeinture) => Promise<void>
  onEnregistrerRapport: (v: RapportSoumis) => Promise<void>
}) {
  const { currentUser } = useAuth()
  const resolveur = useResolveur()
  const m = useMontant()
  const [filtreMois, setFiltreMois] = useState('')
  const [filtreSite, setFiltreSite] = useState('')
  const [filtreCategorie, setFiltreCategorie] = useState('')
  const [monPerimetre, setMonPerimetre] = useState(false)
  const [recherche, setRecherche] = useState('')
  const [formOuvert, setFormOuvert] = useState(false)
  const [ligneEnEdition, setLigneEnEdition] = useState<LigneJournalPeinture | null>(null)
  const [ligneASupprimer, setLigneASupprimer] = useState<LigneJournalPeinture | null>(null)
  const [rapportOuvert, setRapportOuvert] = useState(false)
  // Catégorie du pointage isolé : elle est choisie **avant** d'ouvrir le
  // formulaire, parce que c'est elle qui décide des étapes affichées (§5 :
  // « la compréhension de la colonne Catégorie est essentielle »).
  const [categorieSaisie, setCategorieSaisie] = useState<CategoriePeinture | null>(null)

  // Les mois gardent l'ordre du journal (chronologique), pas l'ordre
  // alphabétique : "avril, décembre, février…" n'aiderait personne.
  const moisDisponibles = useMemo(
    () => [...new Set(journal.map((l) => l.mois).filter((m): m is string => !!m))],
    [journal]
  )
  const { valeursDe } = useListesValeurs()
  const sites = useMemo(() => valeursDistinctes(journal, 'site'), [journal])
  const categories = useMemo(
    () => [...new Set(journal.map(categorieNormalisee).filter(Boolean))].sort(),
    [journal]
  )
  const typesItem = useMemo(
    () => [...new Set([...valeursDistinctes(journal, 'typeItem'), ...tarifs.map((t) => t.typeItem)])].sort(),
    [journal, tarifs]
  )
  const ctrs = useMemo(() => valeursDistinctes(journal, 'ctr'), [journal])
  const equipes = useMemo(() => valeursDistinctes(journal, 'equipe'), [journal])
  const unites = useMemo(() => valeursDistinctes(journal, 'unite'), [journal])
  const priorites = useMemo(() => valeursDistinctes(journal, 'priorite'), [journal])
  const projets = useMemo(() => valeursDistinctes(journal, 'projet'), [journal])
  const categoriesSaisie = useMemo(
    () => [...new Set([...valeursDistinctes(journal, 'categorie'), ...tarifs.map((t) => t.categorie ?? '')])]
      .filter(Boolean)
      .sort(),
    [journal, tarifs]
  )

  const filtered = useMemo(() => {
    const q = recherche.trim().toLowerCase()
    return journal.filter(
      (l) =>
        (!filtreMois || l.mois === filtreMois) &&
        (!filtreSite || l.site === filtreSite) &&
        (!filtreCategorie || categorieNormalisee(l) === filtreCategorie) &&
        (!monPerimetre ||
          !currentUser ||
          resolveur.projetParId(resolveur.resoudre('contrat-peinture', clesJournalPeinture(l))?.projetId ?? '')
            ?.agentId === currentUser.id) &&
        (!q ||
          `${l.projet ?? ''} ${l.tache ?? ''} ${l.typeItem ?? ''} ${l.numeroAvis ?? ''} ${l.numeroOt ?? ''}`
            .toLowerCase()
            .includes(q))
    )
  }, [journal, filtreMois, filtreSite, filtreCategorie, recherche, monPerimetre, currentUser, resolveur])

  const { page, pageCount, visible, setPage, resetPage } = usePagination(filtered, PAGE_SIZE)

  // Camemberts de la feuille JOURNAL du classeur : heures de stand-by perdues
  // et coût du stand-by par type d'item (catégorie STD), suivant les filtres
  // (équivalent des segments Excel). Couleur affectée par type dans un ordre
  // fixe sur tout le journal, pour qu'un filtre ne repeigne pas les tranches.
  const typesStandBy = useMemo(
    () =>
      [
        ...new Set(
          journal.filter((l) => categorieNormalisee(l) === 'STD').map((l) => (l.typeItem ?? '—').trim())
        ),
      ].sort(),
    [journal]
  )
  const couleurStandBy = useMemo(
    () => new Map(typesStandBy.map((t, i) => [t, PIE_COLORS[i % PIE_COLORS.length]])),
    [typesStandBy]
  )
  const standByPie = useMemo(() => {
    const acc = new Map<string, { name: string; heures: number; cout: number }>()
    for (const l of filtered) {
      if (categorieNormalisee(l) !== 'STD') continue
      const t = (l.typeItem ?? '—').trim()
      const e = acc.get(t) ?? { name: t, heures: 0, cout: 0 }
      e.heures += l.qte ?? 0
      e.cout += l.coutStandBy ?? 0
      acc.set(t, e)
    }
    return typesStandBy
      .map((t) => acc.get(t))
      .filter((e): e is { name: string; heures: number; cout: number } => !!e && (e.heures > 0 || e.cout > 0))
  }, [filtered, typesStandBy])

  // --- Productivité du jour (27/08/2026, lot 2) ---------------------------
  //
  // « Le système doit être capable de calculer automatiquement : la
  // productivité théorique de l'équipe » (§7). Elle se calcule à partir de
  // l'effectif réellement pointé — les lignes PERSONNEL du jour — et du modèle
  // de productivité des paramètres.
  //
  // La date par défaut est **la plus récente du journal filtré** et non celle
  // du jour : le classeur s'arrête au 31/05/2026, ouvrir sur aujourd'hui
  // n'afficherait qu'un écran vide.
  const datesDisponibles = useMemo(
    () => [...new Set(filtered.map((l) => l.date))].sort((a, b) => b.localeCompare(a)),
    [filtered]
  )
  const [dateProductivite, setDateProductivite] = useState('')
  const dateRetenue = dateProductivite && datesDisponibles.includes(dateProductivite) ? dateProductivite : datesDisponibles[0]

  const productiviteDuJour = useMemo(() => {
    if (!parametres || !dateRetenue) return []
    const sitesDuJour = [
      ...new Set(journal.filter((l) => l.date === dateRetenue).map((l) => (l.site ?? '').trim()).filter(Boolean)),
    ].sort()
    return sitesDuJour.map((site) => {
      const effectifs = effectifsDuJour(journal, dateRetenue, site)
      const modele = modeleDuSite(parametres, site)
      return { site, effectifs, modele, ...objectifJournalier(effectifs, modele) }
    })
  }, [journal, parametres, dateRetenue])

  const filtrer = (setter: (v: string) => void) => (v: string) => {
    setter(v)
    resetPage()
  }

  const ouvrir = (ligne: LigneJournalPeinture | null) => {
    setLigneEnEdition(ligne)
    setFormOuvert(true)
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <PieStandByCard
          titre="Nombre d'heures de stand-by perdues"
          data={standByPie.filter((e) => e.heures > 0).map((e) => ({ name: e.name, value: e.heures }))}
          couleurs={couleurStandBy}
          unite="h"
        />
        <PieStandByCard
          titre="Coût du stand-by par type d'item"
          data={standByPie
            .filter((e) => e.cout > 0)
            .map((e) => ({ name: e.name, value: m.valeurAffichee(e.cout, 'XAF') ?? e.cout }))}
          couleurs={couleurStandBy}
          unite={m.uniteAffichee('XAF')}
        />
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 p-5">
        <div className="flex items-start justify-between gap-4 flex-wrap mb-1">
          <div className="min-w-0">
            <h3 className="font-semibold text-gray-900">Productivité théorique du jour</h3>
            <p className="text-xs text-gray-500 mt-0.5 max-w-3xl">
              L'objectif de production d'une journée, recalculé à partir de l'effectif réellement pointé et des
              coefficients de Paramètres › Contrat peinture — et non saisi.
            </p>
          </div>
          {datesDisponibles.length > 0 && (
            <label className="text-xs text-gray-500 shrink-0">
              <span className="block mb-1">Journée</span>
              <select
                value={dateRetenue ?? ''}
                onChange={(e) => setDateProductivite(e.target.value)}
                className="px-3 py-1.5 rounded-lg border border-gray-200 bg-gray-50 text-sm text-gray-900"
              >
                {datesDisponibles.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>

        {!parametres ? (
          <p className="text-sm text-amber-600 mt-3">
            Paramètres du contrat non chargés — aucun objectif ne peut être calculé. Rien n'est supposé à la place.
          </p>
        ) : productiviteDuJour.length === 0 ? (
          <p className="text-sm text-gray-400 mt-3">Aucun pointage sur la période affichée.</p>
        ) : (
          <div className="mt-3 grid grid-cols-1 lg:grid-cols-3 gap-3">
            {productiviteDuJour.map((p) => (
              <div key={p.site} className="rounded-xl border border-gray-100 bg-gray-50/60 p-4">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-medium text-gray-900 text-sm">{p.site}</span>
                  <span className="text-lg font-semibold text-gray-900">
                    {p.objectif === null ? '—' : `${formatNombre(p.objectif, 2)} m²`}
                  </span>
                </div>
                <p className="text-xs text-gray-500">
                  Objectif du jour
                  {p.capacite !== null && p.modele?.rendementParUnite != null
                    ? ` · ${formatNombre(p.capacite, 2)} unités × ${formatNombre(p.modele.rendementParUnite, 2)} m²`
                    : ''}
                </p>

                {p.effectifs.length === 0 ? (
                  <p className="text-xs text-gray-400 mt-2">Aucun personnel pointé ce jour-là.</p>
                ) : (
                  <ul className="mt-2 space-y-0.5">
                    {p.effectifs.map((e) => {
                      const profil = p.modele?.profils.find(
                        (x) => x.profil.trim().toLowerCase() === e.profil.trim().toLowerCase()
                      )
                      return (
                        <li key={e.profil} className="text-xs text-gray-600 flex justify-between gap-2">
                          <span>
                            {formatNombre(e.effectif)} × {e.profil}
                          </span>
                          <span className={profil?.objectifJour == null ? 'text-amber-600' : 'text-gray-500'}>
                            {profil?.objectifJour == null
                              ? 'sans coefficient'
                              : `${formatNombre(e.effectif * profil.objectifJour, 2)} m² · ${formatPercent(profil.part)}`}
                          </span>
                        </li>
                      )
                    })}
                  </ul>
                )}

                {!p.modele && (
                  <p className="text-xs text-amber-600 mt-2">
                    Champ non déclaré dans les paramètres — aucun objectif calculable.
                  </p>
                )}
                {p.profilsSansCoefficient.length > 0 && (
                  <p className="text-xs text-amber-600 mt-2">
                    {p.profilsSansCoefficient.join(', ')} : aucun coefficient déclaré, ces personnes ne comptent pas
                    dans l'objectif.
                  </p>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Le pendant réel de cet objectif — production du jour, taux
            d'atteinte, écart — n'est pas affiché, et ce n'est pas un oubli :
            le JOURNAL enregistre la surface réalisée **à date** (cumulée), et
            la différence entre deux jours d'une même affaire est négative sur
            118 des 625 transitions du classeur. Un chiffre tiré de là serait
            faux sans le dire. Il faudra la continuité des rapports (lot 3),
            où la production d'une journée est déclarée. */}
        <p className="text-xs text-gray-400 mt-3 pt-3 border-t border-gray-100">
          La production réellement réalisée du jour n'est pas comparée ici : le journal enregistre la surface réalisée
          <em> à date</em> (cumulée), et son écart d'un jour à l'autre décroît sur 118 des 625 transitions du classeur.
          Le rapprochement objectif / réalisé demande la reprise des affaires d'un rapport à l'autre.
        </p>
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
        <BarreFiltresTableau>
          {/* Le rapport journalier est le point d'entrée du document (§2 :
              « commencer par sélectionner le champ concerné avant de
              renseigner son rapport journalier »). Le pointage ligne à ligne
              reste possible : le classeur en compte des catégories que le
              rapport ne couvre pas (personnel, consommable, matériel). */}
          <Button type="button" size="sm" onClick={() => setRapportOuvert(true)} className="gap-1.5">
            <CalendarPlus className="w-4 h-4" />
            Nouveau rapport journalier
          </Button>
          <label className="inline-flex items-center gap-1.5 text-sm">
            <Plus className="w-4 h-4 text-gray-400" />
            <select
              value=""
              onChange={(e) => {
                if (!e.target.value) return
                setCategorieSaisie(e.target.value as CategoriePeinture)
                ouvrir(null)
              }}
              className="px-2.5 py-1.5 rounded-lg border border-gray-200 bg-white text-sm text-gray-700"
              aria-label="Ajouter un pointage isolé"
            >
              <option value="">Pointage isolé…</option>
              {CATEGORIES_SAISIE.map((c) => (
                <option key={c.valeur} value={c.valeur}>
                  {c.libelle}
                </option>
              ))}
            </select>
          </label>
          <FiltreSelect label="Mois" value={filtreMois} onChange={filtrer(setFiltreMois)} options={moisDisponibles} />
          <FiltreSelect label="Site" value={filtreSite} onChange={filtrer(setFiltreSite)} options={sites} />
          <FiltreSelect
            label="Catégorie"
            value={filtreCategorie}
            onChange={filtrer(setFiltreCategorie)}
            options={categories}
            libelleTous="Toutes"
          />
          <ChampRecherche
            value={recherche}
            onChange={filtrer(setRecherche)}
            placeholder="Projet, tâche, item, avis, OT..."
          />
          <MonPerimetreToggle
            actif={monPerimetre}
            onChange={(v) => {
              setMonPerimetre(v)
              resetPage()
            }}
          />
          <CompteurLignes filtrees={formatNombre(filtered.length)} total={formatNombre(journal.length)} />
        </BarreFiltresTableau>

        <TableauColonnes
          colonnes={colonnesJournalPeinture({
            resolveur,
            onEditer: (l) => ouvrir(l),
            onSupprimer: (l) => setLigneASupprimer(l),
            m,
          })}
          lignes={visible}
          cleLigne={(l) => l.id}
          exportation={{ nomFichier: 'peinture-journal', titre: 'Contrat peinture — journal de pointage', lignes: filtered }}
        />

        <Pagination page={page} pageCount={pageCount} onPageChange={setPage} />
      </div>

      <RapportPeintureModal
        isOpen={rapportOuvert}
        onClose={() => setRapportOuvert(false)}
        onSubmit={onEnregistrerRapport}
        journal={journal}
        parametres={parametres}
        rapports={rapports}
        sites={avecAjouts(sites, valeursDe('peinture.sites'))}
        societes={avecAjouts(ctrs, valeursDe('commun.societes'))}
        redacteurParDefaut={currentUser?.name ?? null}
      />

      <JournalPeintureSaisieForm
        isOpen={formOuvert}
        onClose={() => setFormOuvert(false)}
        onSubmit={(input) => onEnregistrer(input, ligneEnEdition)}
        ligneInitiale={ligneEnEdition}
        tarifs={tarifs}
        parametres={parametres}
        categorie={categorieSaisie}
        suggestions={{
          // Valeurs des lignes + celles ajoutées dans Paramètres › Listes de
          // valeurs. Les filtres au-dessus gardent, eux, les seules valeurs
          // présentes dans le journal : proposer un filtre qui ne ramène
          // aucune ligne n'aiderait personne.
          categories: avecAjouts(categoriesSaisie, valeursDe('peinture.categories')),
          typesItem: avecAjouts(typesItem, valeursDe('peinture.typesItem')),
          sites: avecAjouts(sites, valeursDe('peinture.sites')),
          ctrs: avecAjouts(ctrs, valeursDe('commun.societes')),
          equipes: avecAjouts(equipes, valeursDe('peinture.equipes')),
          unites: avecAjouts(unites, valeursDe('peinture.unites')),
          priorites: avecAjouts(priorites, valeursDe('peinture.priorites')),
          projets,
        }}
      />

      {ligneASupprimer && (
        <ModaleSuppression
          titre="Supprimer cette ligne du JOURNAL"
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
