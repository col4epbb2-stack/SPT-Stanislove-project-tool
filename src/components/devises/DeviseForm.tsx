import { useState } from 'react'
import { Button } from '../ui/Button'
import { Input } from '../ui/Input'
import { Modal } from '../ui/Modal'
import { normaliserCode, verifierDevise, type Devise } from '../../types/devise'

// Création / modification d'une devise du référentiel. Le taux est saisi dans
// le sens « 1 <devise> = ? <pivot> » — c'est la lecture naturelle d'un taux
// et celle qu'utilisait déjà la carte « Taux de change » de la navette.

const DEVISE_VIDE: Devise = {
  code: '',
  libelle: '',
  symbole: '',
  decimales: 2,
  taux: null,
  pivot: false,
  actif: true,
}

export function DeviseForm({
  isOpen,
  devise,
  devises,
  codePivot,
  onFermer,
  onEnregistrer,
}: {
  isOpen: boolean
  /** `null` = création. */
  devise: Devise | null
  devises: Devise[]
  codePivot: string
  onFermer: () => void
  onEnregistrer: (devise: Devise, codeInitial?: string) => Promise<void>
}) {
  const initial = devise ?? DEVISE_VIDE
  const [valeurs, setValeurs] = useState<Devise>(initial)
  const [tauxTexte, setTauxTexte] = useState(initial.taux === null ? '' : String(initial.taux))
  const [erreur, setErreur] = useState<string | null>(null)
  const [enregistrement, setEnregistrement] = useState(false)

  // La modale est remontée à chaque ouverture (clé sur le code appelant),
  // l'état local part donc toujours de la devise passée en props.
  const modifier = <K extends keyof Devise>(cle: K, valeur: Devise[K]) =>
    setValeurs((prev) => ({ ...prev, [cle]: valeur }))

  const soumettre = async () => {
    // Un taux vide n'est pas 0 : c'est un taux non renseigné, la conversion
    // le dira au lieu de valoriser la devise à zéro.
    const taux = tauxTexte.trim() === '' ? null : Number(tauxTexte)
    const candidate: Devise = { ...valeurs, code: normaliserCode(valeurs.code), taux }
    const probleme = verifierDevise(candidate, devises, devise?.code)
    if (probleme) {
      setErreur(probleme)
      return
    }
    setEnregistrement(true)
    try {
      await onEnregistrer(candidate, devise?.code)
      onFermer()
    } catch (e) {
      setErreur(e instanceof Error ? e.message : String(e))
    } finally {
      setEnregistrement(false)
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onFermer} title={devise ? `Devise ${devise.code}` : 'Nouvelle devise'}>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <Input
            label="Code ISO"
            value={valeurs.code}
            onChange={(e) => modifier('code', e.target.value.toUpperCase().slice(0, 3))}
            placeholder="USD"
            required
          />
          <Input
            label="Symbole"
            value={valeurs.symbole}
            onChange={(e) => modifier('symbole', e.target.value)}
            placeholder="$"
          />
        </div>
        <Input
          label="Libellé"
          value={valeurs.libelle}
          onChange={(e) => modifier('libelle', e.target.value)}
          placeholder="Dollar américain"
          required
        />
        <div className="grid grid-cols-2 gap-4">
          <Input
            label="Décimales affichées"
            type="number"
            min={0}
            max={4}
            value={valeurs.decimales}
            onChange={(e) => modifier('decimales', Number(e.target.value))}
          />
          {valeurs.pivot ? (
            <div>
              <p className="block text-sm font-medium mb-1.5 text-gray-500">Taux</p>
              <p className="px-4 py-3 rounded-xl bg-gray-50 border border-gray-200 text-sm text-gray-500">
                Devise pivot : taux = 1 par construction.
              </p>
            </div>
          ) : (
            <Input
              label={`1 ${normaliserCode(valeurs.code) || '···'} = ? ${codePivot}`}
              type="number"
              step="any"
              min={0}
              value={tauxTexte}
              onChange={(e) => setTauxTexte(e.target.value)}
              placeholder="Non renseigné"
            />
          )}
        </div>

        <label className="flex items-center gap-2.5 text-sm text-gray-700">
          <input
            type="checkbox"
            checked={valeurs.actif}
            onChange={(e) => modifier('actif', e.target.checked)}
            className="w-4 h-4 rounded border-gray-300 text-primary focus:ring-primary/30"
          />
          Proposée à la saisie
        </label>
        <p className="text-xs text-gray-400 -mt-2">
          Une devise désactivée reste lisible sur les données déjà enregistrées, mais n'est plus proposée dans les
          champs de montant.
        </p>

        {erreur && <p className="text-sm text-red-600">{erreur}</p>}

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onFermer}>
            Annuler
          </Button>
          <Button onClick={soumettre} loading={enregistrement}>
            Enregistrer
          </Button>
        </div>
      </div>
    </Modal>
  )
}
