import { useMemo, useState } from 'react'
import { MessageSquareText, Search } from 'lucide-react'
import { Badge } from '../ui/Badge'
import { RUBRIQUE_NIV1_COLORS, type LigneNavette } from '../../types/navette'

// Synthèse des commentaires portés par les lignes navette (18/08/2026,
// demande explicite).
//
// Le commentaire d'une ligne se saisit dans sa cellule du tableau, une ligne à
// la fois : pour savoir ce qui a été noté sur le portefeuille, il fallait
// parcourir les pages du tableau et lire une colonne étroite. Cette carte les
// rassemble.
//
// Elle suit les **filtres du tableau** (elle reçoit les lignes filtrées) :
// filtrer sur un champ ou un chargé d'affaires restreint aussi la synthèse,
// sinon les deux vues de la même page se contrediraient.
//
// Les commentaires sont **regroupés par projet** (18/08/2026) : plusieurs
// lignes navette peuvent pointer vers la même fiche projet, et leurs
// commentaires se lisent alors ensemble plutôt que dispersés dans la liste.
// Une ligne sans fiche forme son propre groupe, sous son libellé — c'est le
// cas courant, la plupart des lignes n'étant pas rattachées.
//
// Ce que la carte ne peut pas faire, faute de donnée : ni tri chronologique,
// ni auteur. `LigneNavette.commentaire` est une simple chaîne, sans
// horodatage ni signature — contrairement aux commentaires d'une fiche projet
// (types/hypothese.ts, `Commentaire`). Les groupes gardent donc l'ordre du
// tableau, et rien n'est inventé sur « qui » ni « quand ».

interface GroupeCommentaires {
  cle: string
  titre: string
  /** Vrai quand le groupe correspond à une fiche projet rattachée. */
  fiche: boolean
  lignes: LigneNavette[]
}

export function SyntheseCommentaires({
  lignes,
  chargeAffaireName,
  peutVoirChargeAffaire,
  nomProjet,
  onOuvrirLigne,
}: {
  /** Lignes déjà filtrées par le tableau. */
  lignes: LigneNavette[]
  chargeAffaireName: (id: string) => string
  peutVoirChargeAffaire: boolean
  /** Nom de la fiche projet rattachée — `null` si la fiche est introuvable. */
  nomProjet: (projetId: string) => string | null
  onOuvrirLigne: (ligne: LigneNavette) => void
}) {
  const [recherche, setRecherche] = useState('')

  const commentees = useMemo(
    () => lignes.filter((l) => (l.commentaire ?? '').trim() !== ''),
    [lignes]
  )

  const visibles = useMemo(() => {
    const q = recherche.trim().toLowerCase()
    if (!q) return commentees
    return commentees.filter((l) =>
      `${l.commentaire ?? ''} ${l.libelle} ${l.codeOTP}`.toLowerCase().includes(q)
    )
  }, [commentees, recherche])

  // Regroupement par fiche projet ; à défaut, la ligne fait groupe seule sous
  // son libellé. L'ordre du tableau est conservé (premier commentaire
  // rencontré = position du groupe).
  const groupes = useMemo<GroupeCommentaires[]>(() => {
    const parCle = new Map<string, GroupeCommentaires>()
    for (const ligne of visibles) {
      const nom = ligne.projetId ? nomProjet(ligne.projetId) : null
      const cle = ligne.projetId ?? `ligne:${ligne.id}`
      const groupe = parCle.get(cle)
      if (groupe) groupe.lignes.push(ligne)
      else parCle.set(cle, { cle, titre: nom ?? ligne.libelle, fiche: nom !== null, lignes: [ligne] })
    }
    return [...parCle.values()]
  }, [visibles, nomProjet])

  return (
    <section className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
      <div className="flex flex-wrap items-start justify-between gap-3 px-5 py-4 border-b border-gray-100">
        <div className="flex items-start gap-3 min-w-0">
          <span className="w-9 h-9 shrink-0 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
            <MessageSquareText className="w-4.5 h-4.5" />
          </span>
          <div className="min-w-0">
            <h3 className="font-semibold text-gray-900">Synthèse des commentaires</h3>
            <p className="text-xs text-gray-500 mt-0.5">
              {commentees.length} ligne{commentees.length > 1 ? 's' : ''} commentée
              {commentees.length > 1 ? 's' : ''} sur {lignes.length} affichée{lignes.length > 1 ? 's' : ''}, regroupées
              par projet — suit les filtres du tableau.
            </p>
          </div>
        </div>
        {commentees.length > 3 && (
          <div className="relative w-full sm:w-64 shrink-0">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              value={recherche}
              onChange={(e) => setRecherche(e.target.value)}
              placeholder="Rechercher dans les commentaires…"
              className="w-full pl-9 pr-3 py-2 rounded-lg border border-gray-200 bg-gray-50 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
            />
          </div>
        )}
      </div>

      {commentees.length === 0 ? (
        <p className="px-5 py-6 text-sm text-gray-400">
          Aucune des lignes affichées ne porte de commentaire. Ils se saisissent dans la colonne « Commentaire » du
          tableau, et se propagent à la fiche projet liée.
        </p>
      ) : visibles.length === 0 ? (
        <p className="px-5 py-6 text-sm text-gray-400">Aucun commentaire ne contient « {recherche.trim()} ».</p>
      ) : (
        <ul className="divide-y divide-gray-100 max-h-96 overflow-y-auto">
          {groupes.map((groupe) => (
            <li key={groupe.cle} className="px-5 py-3">
              <div className="flex flex-wrap items-center gap-2 mb-1.5">
                <span className="font-semibold text-gray-900 truncate">{groupe.titre}</span>
                {groupe.fiche && <Badge label="Fiche projet" bg="bg-green-100" text="text-green-700" />}
                {groupe.lignes.length > 1 && (
                  <Badge label={`${groupe.lignes.length} lignes`} bg="bg-gray-100" text="text-gray-600" />
                )}
              </div>

              <ul className="space-y-2">
                {groupe.lignes.map((ligne) => {
                  const couleurs = RUBRIQUE_NIV1_COLORS[ligne.rubriqueNiv1]
                  return (
                    <li key={ligne.id}>
                      <button
                        type="button"
                        onClick={() => onOuvrirLigne(ligne)}
                        className="w-full text-left rounded-lg px-3 py-2 -mx-1 hover:bg-gray-50 transition-colors"
                        title="Ouvrir le détail de la ligne"
                      >
                        <div className="flex flex-wrap items-center gap-2 mb-0.5">
                          <Badge label={ligne.rubriqueNiv1} bg={couleurs.bg} text={couleurs.text} />
                          <span className="font-mono text-[11px] text-gray-400">{ligne.codeOTP}</span>
                          {/* Le libellé n'est répété que s'il n'est pas déjà le
                              titre du groupe (ligne sans fiche projet). */}
                          {groupe.fiche && <span className="text-[11px] text-gray-500 truncate">{ligne.libelle}</span>}
                          {ligne.champ && <span className="text-[11px] text-gray-400">· {ligne.champ}</span>}
                          {peutVoirChargeAffaire && (
                            <span className="text-[11px] text-gray-400">
                              · {chargeAffaireName(ligne.chargeAffaireId)}
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-gray-700 whitespace-pre-line">{ligne.commentaire}</p>
                      </button>
                    </li>
                  )
                })}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
