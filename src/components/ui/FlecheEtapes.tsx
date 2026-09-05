import { ArrowLeft, ArrowRight, Check } from 'lucide-react'
import type { EtapeAffichee, EtatEtape } from '../../lib/etapesFormulaire'
import { Button } from './Button'

// "Flèche de suivi" d'un formulaire découpé en étapes (06/08/2026, demande
// explicite sur le CRJ : "vu qu'on doit tout remplir pour le suivi on fera un
// process avec une flèche de suivi pour savoir ce qui est déjà rempli"),
// généralisée ici pour être partagée par les formulaires du CRJ et du Tonnage
// échafaudage : même besoin (beaucoup de colonnes à saisir, une seule modale)
// et même solution, il n'y a aucune raison d'en avoir deux implémentations.
//
// Le formulaire n'affiche qu'une section à la fois ; la bande de chevrons dit
// en permanence où on en est et ce qui reste. L'ordre est une suggestion, pas
// un couloir forcé : chaque chevron est cliquable, on revient corriger une
// section sans repasser par les suivantes.

const STYLE_ETAT: Record<EtatEtape, { chip: string; texte: string }> = {
  complet: { chip: 'bg-green-50 text-green-700', texte: 'text-green-600' },
  vu: { chip: 'bg-gray-50 text-gray-500', texte: 'text-gray-400' },
  partiel: { chip: 'bg-amber-50 text-amber-700', texte: 'text-amber-600' },
  vide: { chip: 'bg-gray-100 text-gray-500', texte: 'text-gray-400' },
}

export function FlecheEtapes<C extends string>({
  etapes,
  active,
  onSelect,
}: {
  etapes: EtapeAffichee<C>[]
  active: C
  onSelect: (cle: C) => void
}) {
  const encoche = 12
  return (
    <div className="flex overflow-x-auto pb-1">
      {etapes.map((e, i) => {
        const premier = i === 0
        const dernier = i === etapes.length - 1
        const estActive = e.key === active
        const clip = premier
          ? `polygon(0 0, calc(100% - ${encoche}px) 0, 100% 50%, calc(100% - ${encoche}px) 100%, 0 100%)`
          : dernier
            ? `polygon(0 0, 100% 0, 100% 100%, 0 100%, ${encoche}px 50%)`
            : `polygon(0 0, calc(100% - ${encoche}px) 0, 100% 50%, calc(100% - ${encoche}px) 100%, 0 100%, ${encoche}px 50%)`
        const styleEtat = estActive ? { chip: 'bg-primary text-white', texte: 'text-white/70' } : STYLE_ETAT[e.etat]
        return (
          <button
            key={e.key}
            type="button"
            onClick={() => onSelect(e.key)}
            style={{ clipPath: clip }}
            className={`flex-1 min-w-30 text-left py-2 pr-4 transition-colors ${premier ? 'pl-3' : 'pl-6 -ml-3'} ${
              styleEtat.chip
            } ${estActive ? '' : 'hover:brightness-95'}`}
          >
            <span className="flex items-center gap-1.5">
              {e.etat === 'complet' || e.etat === 'vu' ? (
                <Check className="w-3.5 h-3.5 shrink-0" />
              ) : (
                <e.icon className="w-3.5 h-3.5 shrink-0" />
              )}
              <span className="text-xs font-semibold truncate">{e.label}</span>
            </span>
            <span className={`block text-[10px] truncate mt-0.5 ${styleEtat.texte}`}>{e.resume}</span>
          </button>
        )
      })}
    </div>
  )
}

// En-tête complet : flèche + ligne de synthèse "X/Y sections renseignées".
export function EnteteEtapes<C extends string>({
  etapes,
  active,
  onSelect,
  manquantes,
}: {
  etapes: EtapeAffichee<C>[]
  active: C
  onSelect: (cle: C) => void
  manquantes: EtapeAffichee<C>[]
}) {
  const renseignees = etapes.filter((e) => e.etat === 'complet' || e.etat === 'vu').length
  return (
    <div>
      <FlecheEtapes etapes={etapes} active={active} onSelect={onSelect} />
      <p className="text-xs text-gray-500 mt-1.5">
        {renseignees}/{etapes.length} sections renseignées
        {manquantes.length > 0
          ? ` — obligatoire(s) restante(s) : ${manquantes.map((e) => e.label).join(', ')}.`
          : ' — prêt à enregistrer.'}
      </p>
    </div>
  )
}

// Pied de formulaire : Annuler · étape précédente · étape suivante ·
// Enregistrer. Le submit est proposé à toutes les étapes — une fois les
// sections obligatoires remplies, rien n'oblige à dérouler les optionnelles.
export function PiedEtapes<C extends string>({
  etapes,
  active,
  onAller,
  onAnnuler,
  enregistrement,
  complet,
  libelleSubmit = 'Enregistrer',
}: {
  etapes: EtapeAffichee<C>[]
  active: C
  onAller: (cle: C) => void
  onAnnuler: () => void
  enregistrement: boolean
  complet: boolean
  libelleSubmit?: string
}) {
  const index = etapes.findIndex((e) => e.key === active)
  return (
    <div className="flex items-center gap-2 pt-2 border-t border-gray-100">
      <Button type="button" variant="ghost" onClick={onAnnuler} disabled={enregistrement}>
        Annuler
      </Button>
      {index > 0 && (
        <Button type="button" variant="ghost" onClick={() => onAller(etapes[index - 1].key)} disabled={enregistrement}>
          <ArrowLeft className="w-4 h-4 mr-1.5" />
          {etapes[index - 1].label}
        </Button>
      )}
      <div className="ml-auto flex items-center gap-2">
        {index < etapes.length - 1 && (
          <Button
            type="button"
            variant={complet ? 'ghost' : 'primary'}
            onClick={() => onAller(etapes[index + 1].key)}
            disabled={enregistrement}
          >
            {etapes[index + 1].label}
            <ArrowRight className="w-4 h-4 ml-1.5" />
          </Button>
        )}
        <Button type="submit" loading={enregistrement} variant={complet ? 'primary' : 'ghost'}>
          {libelleSubmit}
        </Button>
      </div>
    </div>
  )
}
