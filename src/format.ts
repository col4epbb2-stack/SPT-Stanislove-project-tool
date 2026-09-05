export function formatMontant(value: number, devise: string): string {
  return `${new Intl.NumberFormat('fr-FR').format(value)} ${devise}`
}

export function formatDate(value: string): string {
  return new Date(value).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })
}

// Date affichable quand la source peut contenir autre chose qu'une date ISO :
// les classeurs Procurement contiennent des dates saisies en texte
// ("06-mai", "NO ACTION - NA"…), qu'on affiche telles quelles plutôt que de
// les transformer en "Invalid Date".
export function formatDateOuTexte(value: string | null): string {
  if (!value) return '—'
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? formatDate(value) : value
}

export function formatHeure(value: string): string {
  return new Date(value).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
}

// Séparateur de jour d'un fil de discussion : "Aujourd'hui"/"Hier" pour les
// deux jours qui portent l'essentiel des échanges, date complète au-delà.
export function formatJourRelatif(value: string): string {
  const jour = new Date(value)
  const auJour = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  const ecartJours = Math.round((auJour(new Date()) - auJour(jour)) / 86_400_000)
  if (ecartJours === 0) return "Aujourd'hui"
  if (ecartJours === 1) return 'Hier'
  return jour.toLocaleDateString('fr-FR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })
}

// Ancienneté compacte affichée dans une liste ("il y a 5 min", "3 j") — au
// delà d'une semaine, la date exacte est plus parlante qu'un nombre de jours.
export function formatDepuis(value: string): string {
  const minutes = Math.floor((Date.now() - new Date(value).getTime()) / 60_000)
  if (minutes < 1) return "à l'instant"
  if (minutes < 60) return `il y a ${minutes} min`
  const heures = Math.floor(minutes / 60)
  if (heures < 24) return `il y a ${heures} h`
  const jours = Math.floor(heures / 24)
  if (jours < 7) return `il y a ${jours} j`
  return formatDate(value)
}

export function formatNombre(value: number | null | undefined, decimales = 0): string {
  if (value == null) return '—'
  return new Intl.NumberFormat('fr-FR', { maximumFractionDigits: decimales }).format(value)
}

export function formatPercent(value: number | null | undefined, decimales = 1): string {
  if (value == null) return '—'
  return `${(value * 100).toFixed(decimales)}%`
}
