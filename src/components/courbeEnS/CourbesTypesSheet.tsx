import { COURBES_TYPES } from '../../data/courbeEnS/courbesTypes'
import type { CourbeType } from '../../types/courbeEnS'
import { couleurCourbeType } from '../../lib/courbesTypes'

// Feuille « typical S curve » du classeur KPI_ICP_2905.xlsm, reproduite telle
// qu'elle se présente (18/08/2026, demande explicite : « regarde la feuille
// typical S curve, on produit ces données dans la partie paramétrages tel que
// c'est présenté »).
//
// Ce que la feuille contient, relevé dans le fichier et non supposé :
//   B2            « COURBES TYPES (ne pas toucher merci) »
//   ligne 4       en-tête des unités de temps, 0 à 100 (K4:DG4, fond bleu)
//   lignes 5-9    bloc AVANCEMENT MOIS   — l'effort de la période, colonne
//                 J = TOTAL (sommes : 1,00003 / 1 / 1,0000334 / 1 / 1), et
//                 colonne E = la lettre de la courbe (a → e)
//   ligne 10      le même en-tête, répété pour le second bloc
//   lignes 11-15  bloc AVANCEMENT CUMUL — l'avancement cumulé, colonne
//                 E et J = le n° de la courbe (1 à 5)
//   7 graphiques  une courbe (les 5 cumuls, axe 0-100 %, sans lissage ni
//                 marqueur) et six histogrammes de l'avancement mensuel
//                 (colonnes groupées, axe 0-3 %, gapWidth 150)
//
// Les 1 010 valeurs affichées ici sont celles de `data/courbeEnS/courbesTypes.ts`,
// **rejouées contre le classeur avant d'écrire cet écran : 0 divergence** sur
// les deux séries des 5 courbes. La colonne TOTAL n'est pas reprise du
// fichier mais recalculée (somme de la ligne mensuelle) — elle retrouve J5:J9
// à la décimale, et un total figé cesserait d'être vrai si la donnée bougeait.
//
// La ligne 2 du classeur (K2:DG2) porte une série sans intitulé, égale aux
// écarts successifs de la ligne 5 : un reste de construction de la courbe
// Type 1, pas une donnée de la feuille — elle n'est pas reproduite.

// Palette du classeur (thème Office) : ce sont les couleurs des 5 séries dans
// ses propres graphiques, reprises telles quelles (lib/courbesTypes.ts, la
// même que celle des allures affichées sur une fiche projet).

// Fonds des en-têtes de la feuille.
const FOND_ENTETE_UT = '#99CCFF'
const FOND_LIBELLE = '#FFCC99'

const UT = Array.from({ length: 101 }, (_, i) => i)

// Axes des graphiques, reprises du fichier : maximum 1 (100 %) pour la
// courbe cumulée, 0,03 (3 %) pour les histogrammes.
const MAX_CUMUL = 1
const MAX_MENSUEL = 0.03

const W = 760
const H = 300
const PAD = { top: 12, right: 16, bottom: 26, left: 46 }
const PW = W - PAD.left - PAD.right
const PH = H - PAD.top - PAD.bottom

function pourcent(valeur: number, decimales = 2): string {
  return `${(valeur * 100).toFixed(decimales).replace('.', ',')} %`
}

function Grille({ max, pas }: { max: number; pas: number }) {
  const niveaux = Array.from({ length: Math.round(max / pas) + 1 }, (_, i) => i * pas)
  return (
    <>
      {niveaux.map((v) => {
        const y = PAD.top + PH - (v / max) * PH
        return (
          <g key={v}>
            <line x1={PAD.left} y1={y} x2={W - PAD.right} y2={y} stroke="#d9d9d9" strokeWidth="1" />
            <text x={PAD.left - 6} y={y + 3.5} textAnchor="end" className="fill-gray-500 text-[9px]">
              {pourcent(v, max === MAX_CUMUL ? 0 : 1)}
            </text>
          </g>
        )
      })}
      {[0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100].map((ut) => (
        <text
          key={ut}
          x={PAD.left + (ut / 100) * PW}
          y={H - 8}
          textAnchor="middle"
          className="fill-gray-500 text-[9px]"
        >
          {ut}
        </text>
      ))}
    </>
  )
}

function Legende({ courbes }: { courbes: { nom: string; couleur: string }[] }) {
  return (
    <div className="flex flex-wrap justify-center gap-x-5 gap-y-1 pt-2">
      {courbes.map((c) => (
        <span key={c.nom} className="inline-flex items-center gap-1.5 text-[11px] text-gray-600">
          <span className="w-3.5 h-2 rounded-sm" style={{ backgroundColor: c.couleur }} />
          {c.nom}
        </span>
      ))}
    </div>
  )
}

// Graphique en courbes de l'avancement cumulé — `smooth val="0"` et
// `symbol val="none"` dans le fichier : segments droits, aucun marqueur.
function GraphiqueCumul({ courbes }: { courbes: CourbeType[] }) {
  return (
    <figure className="bg-white rounded-2xl border border-gray-200 p-4">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Avancement cumulé des courbes types">
        <Grille max={MAX_CUMUL} pas={0.2} />
        {courbes.map((courbe) => (
          <path
            key={courbe.numero}
            d={courbe.cumul
              .map((v, i) => {
                const x = PAD.left + (i / 100) * PW
                const y = PAD.top + PH - Math.min(1, v / MAX_CUMUL) * PH
                return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`
              })
              .join(' ')}
            fill="none"
            stroke={couleurCourbeType(courbe.numero)}
            strokeWidth="2"
          />
        ))}
      </svg>
      <figcaption>
        <Legende courbes={courbes.map((c) => ({ nom: c.nom, couleur: couleurCourbeType(c.numero) }))} />
      </figcaption>
    </figure>
  )
}

// Histogramme de l'avancement de la période — colonnes groupées, gapWidth 150
// (l'écart entre deux groupes vaut 1,5 barre), axe borné à 3 % comme dans le
// fichier.
function Histogramme({ courbes, titre }: { courbes: CourbeType[]; titre: string }) {
  const largeurCategorie = PW / 101
  const largeurBarre = largeurCategorie / (courbes.length + 1.5)

  return (
    <figure className="bg-white rounded-2xl border border-gray-200 p-4">
      <figcaption className="text-xs font-semibold text-gray-700 text-center mb-1">{titre}</figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={titre}>
        <Grille max={MAX_MENSUEL} pas={0.005} />
        {courbes.map((courbe, indexSerie) =>
          courbe.mensuel.map((v, i) => {
            const hauteur = Math.min(1, v / MAX_MENSUEL) * PH
            const x = PAD.left + i * largeurCategorie + (0.75 + indexSerie) * largeurBarre
            return (
              <rect
                key={`${courbe.numero}-${i}`}
                x={x}
                y={PAD.top + PH - hauteur}
                width={largeurBarre}
                height={hauteur}
                fill={couleurCourbeType(courbe.numero)}
              />
            )
          })
        )}
      </svg>
      <Legende courbes={courbes.map((c) => ({ nom: c.nom, couleur: couleurCourbeType(c.numero) }))} />
    </figure>
  )
}

// Un des deux blocs de la feuille. `cle` désigne la série lue, `colonneJ` ce
// que le classeur met dans sa colonne J : le total pour le bloc mensuel, le
// n° de la courbe pour le bloc cumulé.
function BlocTableau({
  titreLigne,
  serie,
  enteteJ,
  valeurE,
  valeurJ,
}: {
  titreLigne: string
  serie: 'mensuel' | 'cumul'
  enteteJ: string
  valeurE: (c: CourbeType) => string | number
  valeurJ: (c: CourbeType) => string
}) {
  return (
    <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-2.5 border-b border-gray-100">
        <span className="text-xs font-bold tracking-wide text-gray-900">{titreLigne}</span>
        <span className="text-[11px] text-gray-400">
          {serie === 'mensuel' ? 'Effort de la période (lignes 5 à 9 du classeur)' : 'Avancement cumulé (lignes 11 à 15)'}
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="text-[11px] border-separate border-spacing-0 whitespace-nowrap">
          <thead>
            <tr>
              <th
                className="sticky left-0 z-20 px-3 py-1.5 text-left font-bold text-gray-800 border-b border-r border-gray-300 min-w-72"
                style={{ backgroundColor: FOND_LIBELLE }}
              >
                Courbes modèle sur 100 UT
              </th>
              <th
                className="px-2 py-1.5 text-center font-bold text-gray-800 border-b border-gray-300"
                style={{ backgroundColor: FOND_LIBELLE }}
              >
                N° courbe
              </th>
              <th
                className="px-2 py-1.5 text-right font-bold text-gray-800 border-b border-r border-gray-300"
                style={{ backgroundColor: FOND_LIBELLE }}
              >
                {enteteJ}
              </th>
              {UT.map((ut) => (
                <th
                  key={ut}
                  className="px-2 py-1.5 text-right font-medium text-gray-700 border-b border-gray-300"
                  style={{ backgroundColor: FOND_ENTETE_UT }}
                >
                  {ut}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {COURBES_TYPES.map((courbe) => (
              <tr key={courbe.numero}>
                <td
                  className="sticky left-0 z-10 bg-white px-3 py-1 text-gray-900 font-medium border-b border-r border-gray-200"
                >
                  <span className="inline-flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: couleurCourbeType(courbe.numero) }} />
                    {courbe.nom}
                  </span>
                </td>
                <td className="px-2 py-1 text-center text-gray-700 border-b border-gray-200">{valeurE(courbe)}</td>
                <td className="px-2 py-1 text-right tabular-nums text-gray-900 font-semibold border-b border-r border-gray-200">
                  {valeurJ(courbe)}
                </td>
                {UT.map((ut) => (
                  <td key={ut} className="px-2 py-1 text-right tabular-nums text-gray-600 border-b border-gray-100">
                    {pourcent(courbe[serie][ut])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

const LETTRES = ['a', 'b', 'c', 'd', 'e']

// TOTAL de la colonne J : somme de la ligne mensuelle. Recalculée plutôt que
// reprise — elle retrouve les valeurs du classeur à la décimale.
function total(courbe: CourbeType): number {
  return courbe.mensuel.reduce((somme, v) => somme + v, 0)
}

function courbe(numero: number): CourbeType {
  return COURBES_TYPES.find((c) => c.numero === numero) as CourbeType
}

export function CourbesTypesSheet() {
  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-sm font-bold text-gray-900">COURBES TYPES (ne pas toucher merci)</h3>
        <p className="text-xs text-gray-500 mt-0.5">
          Feuille « typical S curve » du classeur KPI_ICP_2905.xlsm, reproduite telle quelle. Ce sont les gabarits
          d'avancement de l'entreprise : le calcul de la courbe en S d'un projet ne va chercher qu'eux hors des
          activités, et la feuille elle-même porte la consigne de ne pas y toucher.
        </p>
      </div>

      <BlocTableau
        titreLigne="AVANCEMENT MOIS"
        serie="mensuel"
        enteteJ="TOTAL"
        valeurE={(c) => LETTRES[c.numero - 1]}
        valeurJ={(c) => pourcent(total(c), 3)}
      />

      <BlocTableau
        titreLigne="AVANCEMENT CUMUL"
        serie="cumul"
        enteteJ="N° courbe"
        valeurE={(c) => c.numero}
        valeurJ={(c) => String(c.numero)}
      />

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <GraphiqueCumul courbes={COURBES_TYPES} />
        <Histogramme courbes={COURBES_TYPES} titre="Avancement mensuel — les 5 courbes" />
        <Histogramme courbes={[courbe(5)]} titre={courbe(5).nom} />
        <Histogramme courbes={[courbe(1)]} titre={courbe(1).nom} />
        <Histogramme courbes={[courbe(1), courbe(3), courbe(4)]} titre="Types 1, 3 et 4" />
        <Histogramme courbes={[courbe(3)]} titre={courbe(3).nom} />
        <Histogramme courbes={[courbe(4)]} titre={courbe(4).nom} />
      </div>
    </div>
  )
}
