// Classes Tailwind partagées des champs de saisie et de filtre. Elles
// étaient recopiées à l'identique dans une demi-douzaine de fichiers
// (pages/TonnageEchafPage.tsx, pages/SuiviHebdoCrjPage.tsx,
// components/tonnage/*.tsx) — au point que deux variantes du même champ
// avaient déjà divergé d'un pixel de padding. Un seul endroit ici.

// Champ de formulaire pleine taille (même gabarit que components/ui/Input).
export const champFormClass =
  'w-full px-4 py-3 rounded-xl border text-base focus:outline-none focus:ring-2 transition bg-gray-50 border-gray-200 text-gray-900 placeholder-gray-400 hover:border-gray-300 focus:ring-primary/20 focus:border-primary focus:bg-white'

// Menu déroulant pleine taille d'un formulaire (pendant de champFormClass).
// Il était recopié sous le nom `selectClass` dans AgentsPage, Convertisseur
// et SelecteurDevise — trois copies de la même chaîne.
export const selectClass =
  'w-full px-4 py-3 rounded-xl border text-base bg-gray-50 border-gray-200 text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary focus:bg-white transition disabled:opacity-50'

// Select compact d'une barre de filtres au-dessus d'un tableau.
export const selectFiltreClass =
  'px-3 py-2 rounded-lg border border-gray-200 bg-gray-50 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary'

// Champ de recherche d'une barre de filtres (icône loupe en absolu à gauche).
export const rechercheClass =
  'w-full pl-9 pr-4 py-2 rounded-lg border border-gray-200 bg-gray-50 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary'

// Champ d'une ligne de tableau éditable (listes dynamiques des formulaires).
export const miniInputClass =
  'px-2 py-1.5 rounded-lg border border-gray-200 bg-white text-xs w-full focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary'
