import { useMemo, useState } from 'react'
import { AlertTriangle, Check, GitMerge, Link2, Play, ScanSearch } from 'lucide-react'
import { Button } from '../ui/Button'
import { selectFiltreClass } from '../ui/classes'
import { useFeuilleDeRoute } from '../../contexts/useFeuilleDeRoute'
import { useNavette } from '../../contexts/useNavette'
import { useProjects } from '../../contexts/useProjects'
import { useResolveur } from '../../contexts/useResolveur'
import { resoudreLiaison } from '../feuilleDeRoute/colonnes'
import { relireFeuilleDeRoute } from '../../lib/rapprochementPortefeuille'
import {
  AUCUN_CHOIX,
  CRITERE_LABELS,
  METHODE_MATCHING_LABELS,
  analyserMatching,
  appliquerPatchs,
  construirePatchs,
  type Candidat,
  type ChoixManuels,
  type LigneMatching,
  type MatchingPortefeuille,
} from '../../lib/matchingPortefeuille'
import { signalerIncident } from '../../lib/incidents'
import { formatNombre } from '../../lib/format'

// Matching du portefeuille (24/08/2026) — Feuille de route (Work Program) →
// Navette, puis Fiches projet → Feuille de route.
//
// Même parcours que les migrations voisines : analyser d'abord, appliquer
// ensuite après confirmation. L'analyse ne lit rien dans Firestore — les trois
// collections sont déjà en mémoire dans leurs contextes — mais elle reste
// derrière un bouton : rien ne se déclenche à l'ouverture de l'écran, et le
// décompte affiché est celui qui sera écrit.

function Compteur({ valeur, libelle, ton }: { valeur: number; libelle: string; ton: string }) {
  return (
    <div className="rounded-xl border border-gray-100 bg-gray-50/70 px-3 py-2">
      <p className={`text-lg font-bold tabular-nums ${ton}`}>{formatNombre(valeur)}</p>
      <p className="text-[11px] text-gray-500 leading-tight">{libelle}</p>
    </div>
  )
}

/** Ce qui a fait pencher la balance : les critères qui concordent. */
function Criteres({ criteres }: { criteres: Candidat<unknown>['criteres'] }) {
  const concordants = criteres.filter((c) => c.part !== null && c.part >= 0.8).map((c) => CRITERE_LABELS[c.id])
  return <>{concordants.join(' · ') || '—'}</>
}

function pourcent(score: number) {
  return `${Math.round(score * 100)} %`
}

export function MatchingPortefeuilleCard() {
  const { projets: lignesFdr, remplacerProjets } = useFeuilleDeRoute()
  const { lignes: lignesNavette, rechargerLignes } = useNavette()
  const { projects } = useProjects()
  const resolveur = useResolveur()

  const [wpSeulement, setWpSeulement] = useState(true)
  const [creerLignesManquantes, setCreerLignesManquantes] = useState(false)
  const [analyse, setAnalyse] = useState<MatchingPortefeuille | null>(null)
  const [choix, setChoix] = useState<ChoixManuels>(AUCUN_CHOIX)
  const [detail, setDetail] = useState(false)
  const [enCours, setEnCours] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)
  const [applique, setApplique] = useState<string | null>(null)

  const patchs = useMemo(
    () => (analyse ? construirePatchs(analyse, choix, { creerLignesManquantes }) : null),
    [analyse, choix, creerLignesManquantes]
  )
  const aEcrire = patchs ? patchs.fdr.length + patchs.navette.length + patchs.creations.length : 0

  const lignesNavetteTriees = useMemo(
    () => [...lignesNavette].sort((a, b) => a.libelle.localeCompare(b.libelle)),
    [lignesNavette]
  )
  const projetsTries = useMemo(() => [...projects].sort((a, b) => a.nom.localeCompare(b.nom)), [projects])

  const lancerAnalyse = () => {
    setErreur(null)
    setApplique(null)
    setChoix({ navette: {}, projet: {} })
    setAnalyse(
      analyserMatching({
        lignesFdr,
        lignesNavette,
        projets: projects,
        wpSeulement,
        // Dernier recours pour la fiche projet : la cascade du moteur de
        // liaison, exactement celle que le tableau de la feuille de route
        // utilise déjà pour afficher sa colonne « Fiche projet ».
        resoudreProjet: (p) => resoudreLiaison(resolveur, p)?.projetId ?? null,
      })
    )
  }

  const appliquer = async () => {
    if (!analyse || !patchs) return
    const confirme = window.confirm(
      `Écrire ${formatNombre(aEcrire)} lien(s) dans la base réelle ?\n\n` +
        `· ${patchs.fdr.length} ligne(s) de feuille de route rattachée(s)\n` +
        `· ${patchs.navette.length} ligne(s) navette recevant leur fiche projet\n` +
        (patchs.creations.length > 0 ? `· ${patchs.creations.length} ligne(s) de feuille de route créée(s)\n` : '') +
        `\nLes liens déjà posés ne sont jamais réécrits, et rien de ce qui reste « à confirmer » n'est écrit sans choix explicite.`
    )
    if (!confirme) return
    setEnCours(true)
    setErreur(null)
    try {
      const sortie = await appliquerPatchs(patchs)
      // Les deux collections ont été écrites hors des contextes : sans ces
      // relectures, l'écran continuerait d'afficher les mêmes lignes à lier.
      remplacerProjets(await relireFeuilleDeRoute())
      if (sortie.lignesNavetteLiees > 0) await rechargerLignes()
      setApplique(
        `${sortie.lignesFdrLiees} ligne(s) de feuille de route liée(s), ${sortie.lignesNavetteLiees} ligne(s) navette pourvue(s)` +
          (sortie.lignesFdrCreees > 0 ? `, ${sortie.lignesFdrCreees} ligne(s) créée(s).` : '.') +
          ' Relancez l’analyse pour repartir des données à jour.'
      )
      setAnalyse(null)
      setChoix({ navette: {}, projet: {} })
    } catch (e) {
      signalerIncident('ecriture', 'Le matching Feuille de route / Navette / Projets', e)
      setErreur(e instanceof Error ? e.message : String(e))
    } finally {
      setEnCours(false)
    }
  }

  const resume = analyse?.resume
  const aConfirmer = analyse?.lignes.filter(
    (l) => l.navette.decision === 'a-confirmer' || l.projet.decision === 'a-confirmer'
  )
  const automatiques = analyse?.lignes.filter(
    (l) => l.navette.decision === 'automatique' || l.projet.decision === 'automatique'
  )
  // Lignes du périmètre pour lesquelles aucune ligne navette n'atteint le seuil.
  const sansCandidat = analyse?.lignes.filter((l) => l.navette.decision === 'aucun')
  const entrees = analyse?.entrees
  const rienRecu = entrees ? entrees.lignesFdr === 0 || entrees.lignesNavette === 0 : false

  return (
    <section className="carte p-4 space-y-3">
      <div className="flex items-start gap-3">
        <span className="w-9 h-9 shrink-0 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
          <GitMerge className="w-4.5 h-4.5" />
        </span>
        <div className="min-w-0">
          <h4 className="font-semibold text-gray-900">Matching du portefeuille — Feuille de route → Navette → Fiche projet</h4>
          <p className="text-xs text-gray-500 mt-0.5">
            Rapproche chaque ligne <span className="font-medium">Work Program</span> de la feuille de route de sa ligne
            navette d'origine, puis chaque fiche projet de la ligne qui la représente. Le rapprochement note chaque
            candidat sur un faisceau de critères (imputation, intitulé, champ, Work Program, année, budget) : ce qui est
            franc est appliqué, ce qui ne l'est pas est <span className="font-medium">proposé</span> et attend un choix.
            Un lien déjà posé n'est jamais réécrit — relancer ne change rien.
          </p>
        </div>
      </div>

      <label className="flex items-start gap-2.5 text-sm text-gray-700 cursor-pointer">
        <input
          type="checkbox"
          className="mt-0.5"
          checked={wpSeulement}
          onChange={(e) => {
            setWpSeulement(e.target.checked)
            setAnalyse(null)
          }}
        />
        <span>
          Limiter aux lignes Work Program (<code className="text-[11px]">WP = OUI</code>)
          <span className="block text-xs text-gray-500">
            Le périmètre demandé. Les lignes marquées NON et celles qui ne portent pas la colonne sont laissées de côté
            — décocher les analyse aussi.
          </span>
        </span>
      </label>

      <div className="flex flex-wrap items-end gap-3">
        <Button type="button" variant="ghost" size="sm" onClick={lancerAnalyse}>
          <ScanSearch className="w-4 h-4 mr-1.5" />
          Analyser
        </Button>
        <Button type="button" size="sm" loading={enCours} disabled={!analyse || aEcrire === 0} onClick={() => void appliquer()}>
          <Play className="w-4 h-4 mr-1.5" />
          Appliquer {aEcrire > 0 ? `(${formatNombre(aEcrire)})` : ''}
        </Button>
      </div>

      {!analyse && !applique && (
        <p className="text-xs text-gray-400">Lancez l'analyse pour voir les liens qui seraient posés.</p>
      )}

      {analyse && resume && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-2">
            <Compteur valeur={resume.analysees} libelle="lignes analysées" ton="text-gray-900" />
            <Compteur valeur={resume.navetteDejaLiees} libelle="déjà liées à la navette" ton="text-gray-500" />
            <Compteur valeur={resume.navetteAutomatiques} libelle="rattachées à leur ligne navette" ton="text-primary" />
            <Compteur valeur={resume.projetAutomatiques} libelle="rattachées à leur fiche projet" ton="text-primary" />
            <Compteur valeur={resume.lignesNavetteAPourvoir} libelle="lignes navette à pourvoir" ton="text-primary" />
            <Compteur
              valeur={resume.navetteAConfirmer + resume.projetAConfirmer}
              libelle="à confirmer à la main"
              ton="text-amber-600"
            />
            <Compteur valeur={resume.navetteAucun} libelle="sans candidat" ton="text-gray-400" />
          </div>

          {/* Ce que l'analyse a reçu : sans ce rappel, un rapprochement vide ne
              se distingue pas d'un chargement qui a échoué. */}
          <p className={`text-xs ${rienRecu ? 'text-amber-700' : 'text-gray-500'}`}>
            Analysé sur {formatNombre(entrees?.lignesFdr ?? 0)} ligne(s) de feuille de route ·{' '}
            {formatNombre(entrees?.lignesNavette ?? 0)} ligne(s) navette · {formatNombre(entrees?.projets ?? 0)} fiche(s)
            projet — dont {formatNombre(entrees?.wpOui ?? 0)} ligne(s) Work Program et{' '}
            {formatNombre(entrees?.avecImputation ?? 0)} portant une imputation.
            {rienRecu &&
              ' Une des collections est arrivée vide : c’est un problème de chargement (bandeau d’incidents), pas de rapprochement.'}
          </p>

          {analyse.perimetre.horsPerimetre > 0 && (
            <p className="text-xs text-gray-400">
              {formatNombre(analyse.perimetre.horsPerimetre)} ligne(s) hors périmètre Work Program, non analysées.
            </p>
          )}

          {resume.projetsSansLigne > 0 && (
            <label className="flex items-start gap-2.5 rounded-xl border border-gray-100 bg-gray-50/70 px-4 py-3 cursor-pointer">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={creerLignesManquantes}
                onChange={(e) => setCreerLignesManquantes(e.target.checked)}
              />
              <span className="text-sm text-gray-700">
                <span className="font-medium text-gray-900">
                  Créer une ligne de feuille de route pour les {formatNombre(resume.projetsSansLigne)} fiche(s) projet
                  qui n'en ont aucune
                </span>
                <span className="block text-xs text-gray-500 mt-0.5">
                  Séparé du reste : rattacher des lignes existantes ne crée rien, alors qu'ajouter une ligne par fiche
                  fait grossir la feuille de route. La ligne créée reprend ce que la fiche porte réellement (intitulé,
                  dates, OTP, champ) et, quand une seule ligne navette la désigne, son BU et son PDC — aucune colonne
                  n'est inventée. Le décompte se met à jour avec les choix faits ci-dessous.
                </span>
              </span>
            </label>
          )}

          {automatiques && automatiques.length > 0 && (
            <>
              <Button type="button" variant="ghost" size="sm" onClick={() => setDetail((v) => !v)}>
                <Link2 className="w-4 h-4 mr-1.5" />
                {detail ? 'Masquer le détail' : `Voir les ${automatiques.length} rattachement(s) automatique(s)`}
              </Button>
              {detail && (
                <div className="overflow-x-auto rounded-xl border border-gray-100">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 text-left text-xs font-semibold text-gray-500 uppercase">
                      <tr>
                        <th className="px-4 py-2">Ligne feuille de route</th>
                        <th className="px-4 py-2">Ligne navette</th>
                        <th className="px-4 py-2">Fiche projet</th>
                        <th className="px-4 py-2">Retenue par</th>
                      </tr>
                    </thead>
                    <tbody>
                      {automatiques.map((l) => (
                        <tr key={l.fdr.id} className="border-t border-gray-100 align-top">
                          <td className="px-4 py-2 max-w-xs">
                            <p className="text-gray-900 truncate" title={l.fdr.projet}>
                              {l.fdr.projet || '—'}
                            </p>
                            <p className="text-[11px] text-gray-500 tabular-nums">
                              {l.fdr.compteImputation ?? l.fdr.otp ?? 'sans imputation'}
                            </p>
                          </td>
                          <td className="px-4 py-2 max-w-xs text-gray-700 truncate">
                            {l.navette.decision === 'automatique' ? (
                              <>
                                <span title={l.navette.retenu?.cible.libelle}>{l.navette.retenu?.cible.libelle}</span>
                                <span className="block text-[11px] text-gray-400 tabular-nums">
                                  {pourcent(l.navette.retenu?.score ?? 0)}
                                </span>
                              </>
                            ) : (
                              <span className="text-gray-300">
                                {l.navette.decision === 'deja-lie' ? 'déjà liée' : '—'}
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-2 max-w-xs text-gray-700 truncate">
                            {l.projet.decision === 'automatique' ? (
                              l.projet.retenu?.cible.nom
                            ) : (
                              <span className="text-gray-300">
                                {l.projet.decision === 'deja-lie' ? 'déjà liée' : '—'}
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-2 text-xs text-gray-500">
                            {[l.navette, l.projet]
                              .filter((c) => c.decision === 'automatique' && c.methode)
                              .map((c) => METHODE_MATCHING_LABELS[c.methode!])
                              .filter((v, i, t) => t.indexOf(v) === i)
                              .join(' · ') || '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}

          {sansCandidat && sansCandidat.length > 0 && (
            <details className="rounded-xl border border-gray-100 bg-gray-50/70 px-4 py-3">
              <summary className="text-sm text-gray-700 cursor-pointer">
                {sansCandidat.length} ligne(s) sans candidat au-dessus du seuil
              </summary>
              <p className="text-xs text-gray-500 mt-1">
                Le meilleur score obtenu est rappelé : un intitulé à 40 % est une variation à rapprocher à la main
                depuis l'écran Rapprochement, un score nul veut dire que l'affaire n'est pas dans la navette.
              </p>
              <ul className="mt-2 space-y-1">
                {sansCandidat.map((l) => (
                  <li key={l.fdr.id} className="text-xs text-gray-600 flex justify-between gap-3">
                    <span className="truncate">{l.fdr.projet || '—'}</span>
                    <span className="tabular-nums text-gray-400 shrink-0">{pourcent(l.navette.meilleurScore)}</span>
                  </li>
                ))}
              </ul>
            </details>
          )}

          {aConfirmer && aConfirmer.length > 0 && (
            <div className="rounded-xl border border-amber-200 bg-amber-50/50 overflow-hidden">
              <div className="px-4 py-3 border-b border-amber-100">
                <p className="text-sm font-medium text-amber-900 flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4" />
                  {aConfirmer.length} ligne(s) à confirmer
                </p>
                <p className="text-xs text-amber-900/70 mt-0.5">
                  Les candidats se ressemblent sans qu'aucun ne se détache — ou plusieurs se valent. Rien n'est écrit
                  tant qu'un choix n'est pas fait ici. Les propositions sont classées par score, puis viennent toutes
                  les valeurs.
                </p>
              </div>
              <div className="max-h-[32rem] overflow-y-auto divide-y divide-amber-100">
                {aConfirmer.map((l) => (
                  <LigneAConfirmer
                    key={l.fdr.id}
                    ligne={l}
                    choix={choix}
                    onChoix={setChoix}
                    lignesNavette={lignesNavetteTriees}
                    projets={projetsTries}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {applique && (
        <p className="text-sm text-emerald-700 font-medium flex items-start gap-1.5">
          <Check className="w-4 h-4 mt-0.5 shrink-0" />
          {applique}
        </p>
      )}
      {erreur && (
        <p className="flex items-start gap-2 text-xs text-red-700 bg-red-50 rounded-lg px-3 py-2">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          {erreur}
        </p>
      )}
    </section>
  )
}

function LigneAConfirmer({
  ligne,
  choix,
  onChoix,
  lignesNavette,
  projets,
}: {
  ligne: LigneMatching
  choix: ChoixManuels
  onChoix: (maj: ChoixManuels) => void
  lignesNavette: MatchingPortefeuille['lignesNavette']
  projets: MatchingPortefeuille['projets']
}) {
  const poser = (cle: keyof ChoixManuels, valeur: string) => {
    const suivant = { ...choix, [cle]: { ...choix[cle] } }
    if (valeur) suivant[cle][ligne.fdr.id] = valeur
    else delete suivant[cle][ligne.fdr.id]
    onChoix(suivant)
  }

  return (
    <div className="px-4 py-3 space-y-2">
      <div>
        <p className="text-sm text-gray-900">{ligne.fdr.projet || '—'}</p>
        <p className="text-[11px] text-gray-500 tabular-nums">
          {ligne.fdr.compteImputation ?? ligne.fdr.otp ?? 'sans imputation'}
          {ligne.fdr.champs ? ` · ${ligne.fdr.champs}` : ''}
          {ligne.navette.ambigu ? ' · plusieurs candidates également probables' : ''}
        </p>
      </div>

      {ligne.navette.decision === 'a-confirmer' && (
        <label className="block">
          <span className="text-[11px] font-medium text-gray-500 uppercase">Ligne navette d'origine</span>
          <select
            className={`${selectFiltreClass} w-full`}
            value={choix.navette[ligne.fdr.id] ?? ''}
            onChange={(e) => poser('navette', e.target.value)}
          >
            <option value="">Ne rien écrire pour l'instant</option>
            {ligne.navette.candidats.length > 0 && (
              <optgroup label="Propositions">
                {ligne.navette.candidats.map((c) => (
                  <option key={c.cible.id} value={c.cible.id}>
                    {pourcent(c.score)} — {c.cible.codeOTP} — {c.cible.libelle}
                  </option>
                ))}
              </optgroup>
            )}
            <optgroup label="Toute la navette">
              {lignesNavette.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.codeOTP} — {l.libelle}
                </option>
              ))}
            </optgroup>
          </select>
          {ligne.navette.retenu && (
            <span className="block text-[11px] text-gray-500 mt-0.5">
              Mieux placée : {pourcent(ligne.navette.retenu.score)} · <Criteres criteres={ligne.navette.retenu.criteres} />
            </span>
          )}
        </label>
      )}

      {ligne.projet.decision === 'a-confirmer' && (
        <label className="block">
          <span className="text-[11px] font-medium text-gray-500 uppercase">Fiche projet</span>
          <select
            className={`${selectFiltreClass} w-full`}
            value={choix.projet[ligne.fdr.id] ?? ''}
            onChange={(e) => poser('projet', e.target.value)}
          >
            <option value="">Ne rien écrire pour l'instant</option>
            {ligne.projet.candidats.length > 0 && (
              <optgroup label="Propositions">
                {ligne.projet.candidats.map((c) => (
                  <option key={c.cible.id} value={c.cible.id}>
                    {pourcent(c.score)} — {c.cible.nom}
                  </option>
                ))}
              </optgroup>
            )}
            <optgroup label="Toutes les fiches">
              {projets.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nom}
                </option>
              ))}
            </optgroup>
          </select>
          {ligne.projet.retenu && (
            <span className="block text-[11px] text-gray-500 mt-0.5">
              Mieux placée : {pourcent(ligne.projet.retenu.score)} · <Criteres criteres={ligne.projet.retenu.criteres} />
            </span>
          )}
        </label>
      )}
    </div>
  )
}
