import { useMemo, useState } from 'react'
import { CheckCircle2, MessageSquare, Plus, Search } from 'lucide-react'
import { Button } from '../ui/Button'
import { rechercheClass, selectFiltreClass } from '../ui/classes'
import { formatDepuis } from '../../lib/format'
import { THEMES_DISCUSSION } from '../../types/discussion'
import type { SujetDiscussion } from '../../types/discussion'

// Colonne de gauche : les sujets, du plus récemment actif au plus ancien
// (l'ordre vient déjà de Firestore, cf. lib/discussionsFirestore). Les sujets
// clôturés sont masqués par défaut — ils restent consultables via le filtre,
// jamais supprimés.
export function ListeSujets({
  sujets,
  sujetActifId,
  onSelectionner,
  onNouveauSujet,
  estNonLu,
}: {
  sujets: SujetDiscussion[]
  sujetActifId: string | null
  onSelectionner: (id: string) => void
  onNouveauSujet: () => void
  estNonLu: (sujet: SujetDiscussion) => boolean
}) {
  const [recherche, setRecherche] = useState('')
  const [theme, setTheme] = useState('')
  const [afficherClotures, setAfficherClotures] = useState(false)

  const filtres = useMemo(() => {
    const terme = recherche.trim().toLowerCase()
    return sujets.filter((s) => {
      if (!afficherClotures && s.cloture) return false
      if (theme && s.theme !== theme) return false
      if (!terme) return true
      return (
        s.titre.toLowerCase().includes(terme) ||
        s.description.toLowerCase().includes(terme) ||
        s.dernierMessageExtrait.toLowerCase().includes(terme)
      )
    })
  }, [sujets, recherche, theme, afficherClotures])

  return (
    <div className="flex flex-col h-full bg-white rounded-2xl border border-gray-200 overflow-hidden">
      <div className="p-4 border-b border-gray-200 space-y-3 shrink-0">
        <Button onClick={onNouveauSujet} className="w-full">
          <Plus className="w-4 h-4 mr-2" />
          Nouveau sujet
        </Button>

        <div className="relative">
          <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            value={recherche}
            onChange={(e) => setRecherche(e.target.value)}
            placeholder="Rechercher un sujet…"
            className={rechercheClass}
          />
        </div>

        <div className="flex items-center gap-2">
          <select className={`${selectFiltreClass} flex-1`} value={theme} onChange={(e) => setTheme(e.target.value)}>
            <option value="">Tous les thèmes</option>
            {THEMES_DISCUSSION.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-1.5 text-xs text-gray-500 whitespace-nowrap">
            <input
              type="checkbox"
              checked={afficherClotures}
              onChange={(e) => setAfficherClotures(e.target.checked)}
              className="rounded border-gray-300"
            />
            Clôturés
          </label>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {filtres.length === 0 ? (
          <p className="p-6 text-sm text-gray-400 text-center">
            {sujets.length === 0 ? 'Aucun sujet ouvert pour le moment.' : 'Aucun sujet ne correspond à ces filtres.'}
          </p>
        ) : (
          filtres.map((sujet) => {
            const actif = sujet.id === sujetActifId
            const nonLu = estNonLu(sujet)
            return (
              <button
                key={sujet.id}
                onClick={() => onSelectionner(sujet.id)}
                className={`w-full text-left px-4 py-3 border-b border-gray-100 transition-colors ${
                  actif ? 'bg-primary/5 border-l-4 border-l-primary' : 'hover:bg-gray-50 border-l-4 border-l-transparent'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <p className={`text-sm truncate ${nonLu ? 'font-bold text-gray-900' : 'font-medium text-gray-800'}`}>
                    {sujet.titre}
                  </p>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {sujet.cloture && <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />}
                    {nonLu && <span className="w-2 h-2 rounded-full bg-accent" />}
                  </div>
                </div>
                <p className="text-xs text-gray-500 truncate mt-0.5">
                  <span className="font-medium">{sujet.dernierMessageAuteur}</span>
                  {sujet.dernierMessageExtrait ? ` — ${sujet.dernierMessageExtrait}` : ''}
                </p>
                <div className="flex items-center gap-2 mt-1.5 text-[11px] text-gray-400">
                  <span className="px-1.5 py-0.5 rounded-md bg-gray-100 text-gray-500 font-medium">{sujet.theme}</span>
                  <span className="flex items-center gap-1">
                    <MessageSquare className="w-3 h-3" />
                    {sujet.nombreMessages}
                  </span>
                  <span className="ml-auto">{formatDepuis(sujet.dernierMessageLe)}</span>
                </div>
              </button>
            )
          })
        )}
      </div>
    </div>
  )
}
