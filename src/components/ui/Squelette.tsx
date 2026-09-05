import type { CSSProperties } from 'react'

// Squelettes de chargement. Chaque page est chargée à la demande (React.lazy
// dans App.tsx) et le `Suspense fallback` valait `null` : changer de page
// vidait l'écran jusqu'à l'arrivée du bundle, sans rien indiquer. Sur une
// connexion lente, l'app paraissait figée.

function Barre({ className = '', style }: { className?: string; style?: CSSProperties }) {
  return <div style={style} className={`bg-gray-200/70 rounded-lg animate-pulse ${className}`} />
}

// Forme générique d'une page du module : un bandeau d'indicateurs, une barre
// de filtres, un grand tableau — la structure de presque tous les écrans.
export function SqueletteePage() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Chargement de la page">
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="carte p-4 flex items-start gap-3">
            <Barre className="w-10 h-10 shrink-0" />
            <div className="flex-1 space-y-2">
              <Barre className="h-3 w-2/3" />
              <Barre className="h-5 w-1/2" />
            </div>
          </div>
        ))}
      </div>

      <div className="carte p-4 flex flex-wrap gap-3">
        {Array.from({ length: 5 }, (_, i) => (
          <Barre key={i} className="h-9 w-32" />
        ))}
      </div>

      <div className="carte p-4 space-y-3">
        <Barre className="h-4 w-full" />
        {Array.from({ length: 8 }, (_, i) => (
          <Barre key={i} className="h-8 w-full" style={{ opacity: 1 - i * 0.08 }} />
        ))}
      </div>
    </div>
  )
}

export function SqueletteeLignes({ lignes = 5 }: { lignes?: number }) {
  return (
    <div className="space-y-2" aria-busy="true">
      {Array.from({ length: lignes }, (_, i) => (
        <Barre key={i} className="h-9 w-full" />
      ))}
    </div>
  )
}
