import { useMemo, useState } from 'react'
import { AlertTriangle, Check, GitMerge, Link2, Play, Plus } from 'lucide-react'
import { Button } from '../ui/Button'
import { useAuth } from '../../contexts/useAuth'
import { useFeuilleDeRoute } from '../../contexts/useFeuilleDeRoute'
import { useNavette } from '../../contexts/useNavette'
import { useProjects } from '../../contexts/useProjects'
import { useResolveur } from '../../contexts/useResolveur'
import { resoudreLiaison } from '../feuilleDeRoute/colonnes'
import {
  METHODE_RAPPROCHEMENT_LABELS,
  appliquerRapprochement,
  rapprocherPortefeuille,
  rattacherLigneFdr,
  relireFeuilleDeRoute,
  type RapprochementLigneFdr,
} from '../../lib/rapprochementPortefeuille'
import { selectFiltreClass } from '../ui/classes'
import { signalerIncident } from '../../lib/incidents'
import { formatNombre } from '../../lib/format'

// Rapprochement Navette ↔ Feuille de route ↔ Fiche projet (23/08/2026).
//
// Contrairement aux migrations de Paramètres › Maintenance, il n'y a pas de
// bouton « Analyser » : les trois collections sont déjà chargées par leurs
// contextes, l'analyse est donc permanente et se met à jour d'elle-même. Seule
// l'application écrit — et elle ne touche que les liens manquants.

function Compteur({ valeur, libelle, ton }: { valeur: number; libelle: string; ton: string }) {
  return (
    <div className="rounded-xl border border-gray-100 bg-gray-50/70 px-3 py-2">
      <p className={`text-lg font-bold tabular-nums ${ton}`}>{formatNombre(valeur)}</p>
      <p className="text-[11px] text-gray-500 leading-tight">{libelle}</p>
    </div>
  )
}

function LigneAperçu({ ligne }: { ligne: RapprochementLigneFdr }) {
  const methodes = [ligne.methodeNavette, ligne.methodeProjet].filter(
    (m): m is NonNullable<typeof m> => m !== null && m !== 'deja-lie'
  )
  return (
    <tr className="border-t border-gray-100">
      <td className="px-4 py-2 text-gray-900 truncate max-w-xs" title={ligne.fdr.projet}>
        {ligne.fdr.projet || '—'}
      </td>
      <td className="px-4 py-2 text-gray-500 tabular-nums">{ligne.fdr.compteImputation ?? ligne.fdr.otp ?? '—'}</td>
      <td className="px-4 py-2 text-gray-700 truncate max-w-xs" title={ligne.ligneNavette?.libelle}>
        {ligne.patchFdr.ligneNavetteId ? (ligne.ligneNavette?.libelle ?? '—') : <span className="text-gray-300">déjà liée</span>}
      </td>
      <td className="px-4 py-2 text-gray-700 truncate max-w-xs">
        {ligne.patchFdr.projetId ? (ligne.projetId ?? '—') : <span className="text-gray-300">déjà liée</span>}
      </td>
      <td className="px-4 py-2 text-xs text-gray-500">
        {[...new Set(methodes)].map((m) => METHODE_RAPPROCHEMENT_LABELS[m]).join(' · ') || '—'}
      </td>
    </tr>
  )
}

export function RapprochementPortefeuille() {
  const { currentUser } = useAuth()
  const { projets: lignesFdr, remplacerProjets } = useFeuilleDeRoute()
  const { lignes: lignesNavette, rechargerLignes } = useNavette()
  const { projects } = useProjects()
  const resolveur = useResolveur()
  const [creerLignesManquantes, setCreerLignesManquantes] = useState(false)
  const [detail, setDetail] = useState(false)
  const [enCours, setEnCours] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)
  const [applique, setApplique] = useState<string | null>(null)
  // Rattachement à la main des lignes que le rapprochement refuse de trancher.
  // Une ligne de feuille de route vient forcément de la navette : ce qui reste
  // ici n'est pas « sans origine », c'est un intitulé à confirmer.
  const [choix, setChoix] = useState<Record<number, string>>({})
  const [rattachement, setRattachement] = useState<number | null>(null)

  const rapprochement = useMemo(
    () =>
      rapprocherPortefeuille({
        lignesFdr,
        lignesNavette,
        projets: projects,
        // Dernier recours : la cascade du moteur de liaison, exactement celle
        // que le tableau de la feuille de route utilise déjà pour afficher la
        // colonne « Fiche projet ». Le rapprochement ne fait qu'inscrire en
        // base ce que l'écran déduisait à chaque rendu.
        resoudreProjet: (p) => resoudreLiaison(resolveur, p)?.projetId ?? null,
      }),
    [lignesFdr, lignesNavette, projects, resolveur]
  )

  const { resume } = rapprochement
  const aEcrire =
    resume.aLierNavette + resume.aLierProjet + resume.lignesNavetteAPourvoir + (creerLignesManquantes ? resume.projetsSansLigne : 0)
  const aLier = rapprochement.lignes.filter((l) => Object.keys(l.patchFdr).length > 0)
  // Tout ce qui n'a pas de ligne navette, quelle qu'en soit la raison
  // (ambiguïté, intitulé trop éloigné) : c'est ce qui empêche d'atteindre les
  // 100 % que la règle métier impose.
  const restantes = rapprochement.lignes.filter((l) => !l.ligneNavette)
  const rapprochees = resume.totalFdr - restantes.length
  const lignesNavetteTriees = useMemo(
    () => [...lignesNavette].sort((a, b) => a.libelle.localeCompare(b.libelle)),
    [lignesNavette]
  )

  if (currentUser?.role !== 'admin') return null

  const lancer = async () => {
    const confirme = window.confirm(
      `Écrire ${formatNombre(aEcrire)} lien(s) dans la base réelle ?\n\n` +
        `· ${resume.aLierNavette} ligne(s) de feuille de route rattachée(s) à leur ligne navette\n` +
        `· ${resume.aLierProjet} rattachée(s) à leur fiche projet\n` +
        `· ${resume.lignesNavetteAPourvoir} ligne(s) navette recevant leur fiche projet\n` +
        (creerLignesManquantes ? `· ${resume.projetsSansLigne} ligne(s) de feuille de route créée(s)\n` : '') +
        `\nLes liens déjà posés ne sont jamais réécrits, et les rapprochements ambigus sont laissés de côté.`
    )
    if (!confirme) return
    setEnCours(true)
    setErreur(null)
    try {
      const sortie = await appliquerRapprochement(rapprochement, { creerLignesManquantes })
      // Les trois collections ont été écrites hors des contextes : sans ces
      // relectures, l'écran continuerait d'afficher les mêmes lignes à lier.
      remplacerProjets(await relireFeuilleDeRoute())
      if (sortie.lignesNavetteLiees > 0) await rechargerLignes()
      setApplique(
        `${sortie.lignesFdrLiees} ligne(s) de feuille de route liée(s), ${sortie.lignesNavetteLiees} ligne(s) navette pourvue(s)` +
          (sortie.lignesFdrCreees > 0 ? `, ${sortie.lignesFdrCreees} ligne(s) créée(s).` : '.')
      )
    } catch (e) {
      signalerIncident('ecriture', 'Le rapprochement Navette / Feuille de route / Projets', e)
      setErreur(e instanceof Error ? e.message : String(e))
    } finally {
      setEnCours(false)
    }
  }

  const rattacher = async (ligne: RapprochementLigneFdr) => {
    const ligneNavette = lignesNavette.find((l) => l.id === choix[ligne.fdr.id])
    if (!ligneNavette) return
    setRattachement(ligne.fdr.id)
    setErreur(null)
    try {
      const patch = await rattacherLigneFdr(ligne.fdr, ligneNavette)
      remplacerProjets(lignesFdr.map((p) => (p.id === ligne.fdr.id ? { ...p, ...patch } : p)))
      // La ligne navette a pu recevoir sa fiche projet dans le même geste.
      if (!ligneNavette.projetId && patch.projetId) await rechargerLignes()
      setChoix((prev) => {
        const reste = { ...prev }
        delete reste[ligne.fdr.id]
        return reste
      })
    } catch (e) {
      signalerIncident('ecriture', 'Le rattachement d’une ligne de feuille de route à la navette', e)
      setErreur(e instanceof Error ? e.message : String(e))
    } finally {
      setRattachement(null)
    }
  }

  return (
    <section className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
      <div className="flex items-start gap-3 px-5 py-4 border-b border-gray-100">
        <span className="w-9 h-9 shrink-0 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
          <GitMerge className="w-4.5 h-4.5" />
        </span>
        <div className="min-w-0">
          <h3 className="font-semibold text-gray-900">Navette → Feuille de route → Fiche projet</h3>
          <p className="text-xs text-gray-500 mt-0.5 max-w-3xl">
            Les deux liens structurants (<code className="text-[11px]">ligneNavetteId</code> et{' '}
            <code className="text-[11px]">projetId</code>) n'étaient posés qu'en créant une fiche projet depuis la
            navette : les lignes reprises des classeurs n'en portent aucun. Tant qu'une ligne de feuille de route n'a
            pas sa ligne navette, son BU et son PDC restent figés sur la valeur du classeur, même après une révision
            validée. Ce rapprochement inscrit les liens manquants — il n'en réécrit jamais un déjà posé, et laisse de
            côté tout rattachement ambigu.
          </p>
        </div>
      </div>

      <div className="px-5 py-4 space-y-4">
        {/* Couverture de la règle métier : une ligne de feuille de route vient
            d'une ligne navette, donc la cible est 100 %. Les lignes que le
            rapprochement va rattacher comptent déjà comme rapprochées — c'est
            ce qui sera vrai après application. */}
        <div className="flex items-center gap-3">
          <div className="flex-1 h-2 rounded-full bg-gray-100 overflow-hidden">
            <div
              className={`h-full rounded-full ${rapprochees === resume.totalFdr ? 'bg-emerald-500' : 'bg-primary'}`}
              style={{ width: `${resume.totalFdr > 0 ? (rapprochees / resume.totalFdr) * 100 : 0}%` }}
            />
          </div>
          <span className="text-xs text-gray-500 tabular-nums shrink-0">
            {formatNombre(rapprochees)} / {formatNombre(resume.totalFdr)} lignes rattachées à une ligne navette
          </span>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-2">
          <Compteur valeur={resume.totalFdr} libelle="lignes de feuille de route" ton="text-gray-900" />
          <Compteur valeur={resume.dejaLieesNavette} libelle="déjà liées à la navette" ton="text-gray-500" />
          <Compteur valeur={resume.aLierNavette} libelle="à lier à leur ligne navette" ton="text-primary" />
          <Compteur valeur={resume.aLierProjet} libelle="à lier à leur fiche projet" ton="text-primary" />
          <Compteur valeur={resume.lignesNavetteAPourvoir} libelle="lignes navette à pourvoir" ton="text-primary" />
          <Compteur valeur={resume.avecSuggestion} libelle="à confirmer à la main" ton="text-amber-600" />
          <Compteur valeur={resume.sansOrigine} libelle="sans origine trouvée" ton="text-gray-400" />
        </div>

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
                qui n'en ont pas
              </span>
              <span className="block text-xs text-gray-500 mt-0.5">
                Séparé du reste : rattacher des lignes existantes ne crée rien, alors qu'ajouter une ligne par fiche
                fait grossir la feuille de route. La ligne créée reprend ce que la fiche porte réellement (intitulé,
                dates, OTP, champ) et, quand la fiche a une ligne navette, son BU et son PDC — aucune colonne n'est
                inventée.
              </span>
            </span>
          </label>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" size="sm" loading={enCours} disabled={aEcrire === 0} onClick={() => void lancer()}>
            <Play className="w-4 h-4 mr-1.5" />
            Appliquer le rapprochement
          </Button>
          {aLier.length > 0 && (
            <Button type="button" variant="ghost" size="sm" onClick={() => setDetail((v) => !v)}>
              <Link2 className="w-4 h-4 mr-1.5" />
              {detail ? 'Masquer le détail' : `Voir les ${aLier.length} ligne(s) concernée(s)`}
            </Button>
          )}
          {aEcrire === 0 && (
            <span className="text-xs text-gray-400">
              Rien à lier : tous les liens possibles sont déjà posés.
            </span>
          )}
        </div>

        {applique && (
          <p className="text-sm text-emerald-700 font-medium flex items-center gap-1.5">
            <Check className="w-4 h-4" />
            {applique}
          </p>
        )}
        {erreur && (
          <p className="text-sm text-red-600 flex items-start gap-1.5">
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
            {erreur}
          </p>
        )}

        {detail && aLier.length > 0 && (
          <div className="overflow-x-auto rounded-xl border border-gray-100">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-left text-xs font-semibold text-gray-500 uppercase">
                <tr>
                  <th className="px-4 py-2">Ligne feuille de route</th>
                  <th className="px-4 py-2">Imputation</th>
                  <th className="px-4 py-2">Ligne navette rattachée</th>
                  <th className="px-4 py-2">Fiche projet</th>
                  <th className="px-4 py-2">Retrouvée par</th>
                </tr>
              </thead>
              <tbody>
                {aLier.map((ligne) => (
                  <LigneAperçu key={ligne.fdr.id} ligne={ligne} />
                ))}
              </tbody>
            </table>
          </div>
        )}

        {restantes.length > 0 && (
          <div className="rounded-xl border border-amber-200 bg-amber-50/50 overflow-hidden">
            <div className="px-4 py-3 border-b border-amber-100">
              <p className="text-sm font-medium text-amber-900 flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4" />
                {restantes.length} ligne(s) restent à rapprocher à la main
              </p>
              <p className="text-xs text-amber-900/70 mt-0.5">
                Une ligne de feuille de route vient forcément d'une ligne navette : ces lignes ne sont pas sans
                origine, leur intitulé ou leur imputation ne concorde simplement pas assez pour trancher tout seul.
                Le menu propose d'abord les intitulés les plus proches (score de similarité), puis toute la navette.
              </p>
            </div>
            <div className="max-h-96 overflow-y-auto">
              <table className="w-full text-sm">
                <tbody>
                  {restantes.map((ligne) => (
                    <tr key={ligne.fdr.id} className="border-t border-amber-100 align-middle">
                      <td className="px-4 py-2 max-w-xs">
                        <p className="text-gray-900 truncate" title={ligne.fdr.projet}>
                          {ligne.fdr.projet || '—'}
                        </p>
                        <p className="text-[11px] text-gray-500 tabular-nums">
                          {ligne.fdr.compteImputation ?? ligne.fdr.otp ?? 'sans imputation'}
                          {ligne.navetteAmbigue.length > 0 && ` · ${ligne.navetteAmbigue.length} candidates`}
                        </p>
                      </td>
                      <td className="px-4 py-2">
                        <select
                          className={`${selectFiltreClass} w-full max-w-lg`}
                          value={choix[ligne.fdr.id] ?? ''}
                          onChange={(e) => setChoix((prev) => ({ ...prev, [ligne.fdr.id]: e.target.value }))}
                        >
                          <option value="">Choisir la ligne navette d'origine…</option>
                          {ligne.suggestions.length > 0 && (
                            <optgroup label="Intitulés proches">
                              {ligne.suggestions.map((s) => (
                                <option key={s.ligne.id} value={s.ligne.id}>
                                  {s.ligne.codeOTP} — {s.ligne.libelle} ({Math.round(s.score * 100)} %)
                                </option>
                              ))}
                            </optgroup>
                          )}
                          <optgroup label="Toute la navette">
                            {lignesNavetteTriees.map((l) => (
                              <option key={l.id} value={l.id}>
                                {l.codeOTP} — {l.libelle}
                              </option>
                            ))}
                          </optgroup>
                        </select>
                      </td>
                      <td className="px-4 py-2 w-32">
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          loading={rattachement === ligne.fdr.id}
                          disabled={!choix[ligne.fdr.id]}
                          onClick={() => void rattacher(ligne)}
                        >
                          <Link2 className="w-4 h-4 mr-1.5" />
                          Rattacher
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {resume.projetsSansLigne > 0 && !creerLignesManquantes && (
          <p className="text-xs text-gray-400 flex items-center gap-1.5">
            <Plus className="w-3.5 h-3.5" />
            {resume.projetsSansLigne} fiche(s) projet ne sont représentées par aucune ligne de feuille de route.
          </p>
        )}
      </div>
    </section>
  )
}
