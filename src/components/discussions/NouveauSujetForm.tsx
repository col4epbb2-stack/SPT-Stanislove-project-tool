import { useState } from 'react'
import type { FormEvent } from 'react'
import { Input } from '../ui/Input'
import { Button } from '../ui/Button'
import { champFormClass } from '../ui/classes'
import { THEMES_DISCUSSION } from '../../types/discussion'
import type { NouveauSujetInput, ThemeDiscussion } from '../../types/discussion'

// Ouverture d'un sujet : titre + thème + message d'ouverture. Pas de
// formulaire à étapes ici (contrairement aux saisies métier, cf.
// components/ui/FlecheEtapes) — trois champs, dont un seul obligatoire.
export function NouveauSujetForm({
  onCreer,
  onAnnuler,
}: {
  onCreer: (input: NouveauSujetInput) => Promise<void>
  onAnnuler: () => void
}) {
  const [titre, setTitre] = useState('')
  const [theme, setTheme] = useState<ThemeDiscussion>('Général')
  const [description, setDescription] = useState('')
  const [envoi, setEnvoi] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setErreur(null)
    setEnvoi(true)
    try {
      await onCreer({ titre, description, theme })
    } catch (err) {
      setErreur(err instanceof Error ? err.message : "Impossible d'ouvrir ce sujet.")
      setEnvoi(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <Input
        label="Sujet"
        value={titre}
        onChange={(e) => setTitre(e.target.value)}
        placeholder="Ex. Standby GMI du 04/08 — cause à trancher"
        required
        autoFocus
      />

      <div>
        <label className="block text-sm font-medium text-gray-500 mb-1.5">Thème</label>
        <select className={champFormClass} value={theme} onChange={(e) => setTheme(e.target.value as ThemeDiscussion)}>
          {THEMES_DISCUSSION.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-500 mb-1.5">Message d'ouverture</label>
        <textarea
          className={`${champFormClass} resize-y min-h-24`}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={4}
          placeholder="De quoi s'agit-il, et qu'attendez-vous des autres ?"
        />
      </div>

      {erreur && <p className="text-sm text-red-600">{erreur}</p>}

      <div className="flex justify-end gap-3 pt-2">
        <Button type="button" variant="ghost" onClick={onAnnuler}>
          Annuler
        </Button>
        <Button type="submit" variant="primary" loading={envoi}>
          Ouvrir le sujet
        </Button>
      </div>
    </form>
  )
}
