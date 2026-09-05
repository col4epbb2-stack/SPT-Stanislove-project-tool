import { useMemo, useState } from 'react'
import { AlertTriangle, Check, Plus, Search, X } from 'lucide-react'
import { useProjects } from '../../contexts/useProjects'
import { useFeuilleDeRoute } from '../../contexts/useFeuilleDeRoute'

/**
 * Choix de **plusieurs affaires** pour une commande ou une facture
 * (`doc/module contrat_rev01.docx` §5 et §6).
 *
 * Le document demande deux choses en même temps :
 *
 * - « Sélectionner une fiche projet existante **ou des fiches** » (§5) et
 *   « sélectionner une ou plusieurs affaires **présentes dans la feuille de
 *   route** » (§6) — d'où les **deux sources** proposées ici, groupées ;
 * - « Si le projet n'existe pas dans le catalogue, l'utilisateur doit pouvoir
 *   **saisir librement son intitulé** » (§5), « créer une ou plusieurs
 *   affaires non présentes dans la feuille de route afin de les utiliser
 *   comme **intitulés de rattachement** » (§6) — d'où la saisie libre.
 *
 * **Deux natures, jamais confondues.** Une fiche projet choisie est un
 * identifiant (`projetIds`) : elle se résout, elle porte un budget, un
 * planning, des journaux. Un intitulé créé est une chaîne (`projetsLibres`) :
 * il ne se résout vers rien, et le dire est le seul moyen d'éviter qu'il
 * passe pour un rattachement.
 *
 * **Une ligne de feuille de route rattachée à une fiche sélectionne cette
 * fiche** ; une ligne qui n'en a pas est reprise comme intitulé — c'est
 * exactement ce qu'elle est tant que personne ne lui a créé de fiche, et
 * inventer un troisième espace d'identifiants pour elle ne dirait rien de
 * plus (cf. question Q6 du recueil).
 */
export function SelecteurProjets({
  projetIds,
  projetsLibres,
  onChange,
  restreintA,
  aide,
}: {
  projetIds: string[]
  projetsLibres: string[]
  onChange: (projetIds: string[], projetsLibres: string[]) => void
  /**
   * Affaires de la commande, quand ce sélecteur sert une **facture** : le §6
   * les prend « parmi les 10 affaires de la commande ». Elles sont proposées
   * en premier, et ce qui sort de cette liste est **signalé, pas refusé**.
   */
  restreintA?: { projetIds: string[]; projetsLibres: string[] }
  aide?: string
}) {
  const { projects } = useProjects()
  const { projets: lignesFdr } = useFeuilleDeRoute()
  const [recherche, setRecherche] = useState('')
  const [nouveau, setNouveau] = useState('')
  const [ouvert, setOuvert] = useState(false)

  const nomProjet = (id: string) => projects.find((p) => p.id === id)?.nom ?? id

  /**
   * Les options, dédoublonnées : une ligne de feuille de route rattachée à
   * une fiche déjà proposée n'apparaît pas deux fois — c'est la même affaire,
   * et la proposer deux fois ferait douter de laquelle choisir.
   */
  const options = useMemo(() => {
    const fiches = projects.map((p) => ({ cle: p.id, libelle: p.nom, type: 'fiche' as const }))
    const dejaVues = new Set(projects.map((p) => p.id))
    const libellesFiches = new Set(projects.map((p) => p.nom.trim().toLowerCase()))
    const fdr: { cle: string; libelle: string; type: 'fiche' | 'libre' }[] = []
    for (const ligne of lignesFdr) {
      if (ligne.projetId && !dejaVues.has(ligne.projetId)) {
        dejaVues.add(ligne.projetId)
        fdr.push({ cle: ligne.projetId, libelle: ligne.projet, type: 'fiche' })
      } else if (!ligne.projetId && ligne.projet && !libellesFiches.has(ligne.projet.trim().toLowerCase())) {
        libellesFiches.add(ligne.projet.trim().toLowerCase())
        fdr.push({ cle: ligne.projet, libelle: ligne.projet, type: 'libre' })
      }
    }
    return { fiches, fdr }
  }, [projects, lignesFdr])

  const estChoisi = (cle: string, type: 'fiche' | 'libre') =>
    type === 'fiche' ? projetIds.includes(cle) : projetsLibres.includes(cle)

  const basculer = (cle: string, type: 'fiche' | 'libre') => {
    if (type === 'fiche') {
      onChange(projetIds.includes(cle) ? projetIds.filter((v) => v !== cle) : [...projetIds, cle], projetsLibres)
    } else {
      onChange(projetIds, projetsLibres.includes(cle) ? projetsLibres.filter((v) => v !== cle) : [...projetsLibres, cle])
    }
  }

  const ajouterLibre = () => {
    const valeur = nouveau.trim()
    if (!valeur) return
    // Un intitulé qui désigne une fiche existante sélectionne la fiche : la
    // recopier en texte créerait un doublon que rien ne rapprocherait.
    const fiche = projects.find((p) => p.nom.trim().toLowerCase() === valeur.toLowerCase())
    if (fiche) {
      if (!projetIds.includes(fiche.id)) onChange([...projetIds, fiche.id], projetsLibres)
    } else if (!projetsLibres.some((v) => v.toLowerCase() === valeur.toLowerCase())) {
      onChange(projetIds, [...projetsLibres, valeur])
    }
    setNouveau('')
  }

  const terme = recherche.trim().toLowerCase()
  const filtre = (o: { libelle: string }) => !terme || o.libelle.toLowerCase().includes(terme)
  // Les affaires de la commande d'abord (§6) : c'est là qu'on choisit dans
  // 99 % des cas, et les faire chercher dans toute la liste serait le
  // « fonctionnement trop restrictif » remplacé par un fonctionnement trop
  // bavard.
  const priorite = (cle: string, type: 'fiche' | 'libre') =>
    restreintA ? (type === 'fiche' ? restreintA.projetIds.includes(cle) : restreintA.projetsLibres.includes(cle)) : false

  const horsCommande = restreintA
    ? [
        ...projetIds.filter((id) => !restreintA.projetIds.includes(id)).map(nomProjet),
        ...projetsLibres.filter((v) => !restreintA.projetsLibres.includes(v)),
      ]
    : []

  const total = projetIds.length + projetsLibres.length

  return (
    <div>
      <div className="flex flex-wrap items-center gap-1.5 mb-1.5">
        {projetIds.map((id) => (
          <Puce key={id} libelle={nomProjet(id)} type="fiche" onRetirer={() => basculer(id, 'fiche')} />
        ))}
        {projetsLibres.map((v) => (
          <Puce key={v} libelle={v} type="libre" onRetirer={() => basculer(v, 'libre')} />
        ))}
        {total === 0 && <span className="text-xs text-gray-400">Aucune affaire sélectionnée</span>}
        <button
          type="button"
          onClick={() => setOuvert((v) => !v)}
          className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
        >
          <Plus className="w-3.5 h-3.5" />
          {ouvert ? 'Fermer' : 'Choisir des affaires'}
        </button>
      </div>

      {horsCommande.length > 0 && (
        <p className="mb-1.5 flex items-start gap-1 text-xs text-amber-700">
          <AlertTriangle className="w-3 h-3 shrink-0 mt-0.5" />
          {horsCommande.join(', ')} — {horsCommande.length > 1 ? 'ne figurent pas' : 'ne figure pas'} parmi les
          affaires de la commande. Enregistré quand même : la commande a pu être complétée après.
        </p>
      )}

      {ouvert && (
        <div className="rounded-xl border border-gray-200 bg-white p-2 space-y-2">
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={recherche}
              onChange={(e) => setRecherche(e.target.value)}
              placeholder="Chercher une affaire…"
              className="w-full pl-8 pr-3 py-1.5 rounded-lg border border-gray-200 bg-gray-50 text-xs focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
            />
          </div>

          <div className="max-h-52 overflow-y-auto space-y-2">
            {restreintA && (
              <Groupe titre="Affaires de la commande">
                {[
                  ...restreintA.projetIds.map((id) => ({ cle: id, libelle: nomProjet(id), type: 'fiche' as const })),
                  ...restreintA.projetsLibres.map((v) => ({ cle: v, libelle: v, type: 'libre' as const })),
                ]
                  .filter(filtre)
                  .map((o) => (
                    <Option key={`c-${o.type}-${o.cle}`} {...o} choisi={estChoisi(o.cle, o.type)} onClick={() => basculer(o.cle, o.type)} />
                  ))}
              </Groupe>
            )}

            <Groupe titre="Fiches projet">
              {options.fiches
                .filter(filtre)
                .filter((o) => !priorite(o.cle, o.type))
                .map((o) => (
                  <Option key={`f-${o.cle}`} {...o} choisi={estChoisi(o.cle, o.type)} onClick={() => basculer(o.cle, o.type)} />
                ))}
            </Groupe>

            {options.fdr.length > 0 && (
              <Groupe titre="Feuille de route">
                {options.fdr
                  .filter(filtre)
                  .filter((o) => !priorite(o.cle, o.type))
                  .map((o) => (
                    <Option
                      key={`r-${o.type}-${o.cle}`}
                      {...o}
                      choisi={estChoisi(o.cle, o.type)}
                      onClick={() => basculer(o.cle, o.type)}
                    />
                  ))}
              </Groupe>
            )}
          </div>

          <div className="flex items-end gap-2 border-t border-gray-100 pt-2">
            <div className="flex-1">
              <label className="block text-[11px] font-medium text-gray-500 mb-1">
                Créer un intitulé d'affaire (absent des fiches et de la feuille de route)
              </label>
              <input
                value={nouveau}
                onChange={(e) => setNouveau(e.target.value)}
                onKeyDown={(e) => {
                  // Entrée ajoute l'intitulé sans soumettre le formulaire qui
                  // entoure ce sélecteur.
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    ajouterLibre()
                  }
                }}
                placeholder="Ex. Réfection caillebotis P3"
                className="w-full px-3 py-1.5 rounded-lg border border-gray-200 bg-gray-50 text-xs focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
              />
            </div>
            <button
              type="button"
              onClick={ajouterLibre}
              className="px-2.5 py-1.5 rounded-lg bg-primary/10 text-primary text-xs font-semibold hover:bg-primary/20 shrink-0"
            >
              Ajouter
            </button>
          </div>
          <p className="text-[11px] text-gray-400">
            Un intitulé créé ici est un libellé de rattachement : il ne crée pas de fiche projet et ne remonte dans
            aucun total par projet.
          </p>
        </div>
      )}

      {aide && <p className="text-xs text-gray-400">{aide}</p>}
    </div>
  )
}

function Groupe({ titre, children }: { titre: string; children: React.ReactNode }) {
  const vide = Array.isArray(children) ? children.flat().filter(Boolean).length === 0 : !children
  if (vide) return null
  return (
    <div>
      <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide px-1 mb-0.5">{titre}</p>
      <div className="space-y-0.5">{children}</div>
    </div>
  )
}

function Option({
  libelle,
  type,
  choisi,
  onClick,
}: {
  libelle: string
  type: 'fiche' | 'libre'
  choisi: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={choisi}
      className={`w-full flex items-center gap-2 px-2 py-1 rounded-lg text-xs text-left transition-colors ${
        choisi ? 'bg-primary/10 text-primary font-medium' : 'hover:bg-gray-50 text-gray-700'
      }`}
    >
      <span
        className={`w-3.5 h-3.5 shrink-0 rounded border flex items-center justify-center ${
          choisi ? 'bg-primary border-primary text-white' : 'border-gray-300'
        }`}
        aria-hidden
      >
        {choisi && <Check className="w-2.5 h-2.5" />}
      </span>
      <span className="truncate">{libelle}</span>
      {type === 'libre' && <span className="ml-auto text-[10px] text-gray-400 shrink-0">intitulé</span>}
    </button>
  )
}

function Puce({ libelle, type, onRetirer }: { libelle: string; type: 'fiche' | 'libre'; onRetirer: () => void }) {
  return (
    <span
      className={`inline-flex items-center gap-1 text-xs rounded-full px-2.5 py-1 ${
        type === 'fiche' ? 'bg-gray-100 text-gray-700' : 'bg-indigo-50 text-indigo-700'
      }`}
      title={type === 'fiche' ? 'Fiche projet' : 'Intitulé de rattachement, sans fiche projet'}
    >
      {libelle}
      <button type="button" onClick={onRetirer} title="Retirer" className="text-gray-400 hover:text-red-600">
        <X className="w-3 h-3" />
      </button>
    </span>
  )
}
