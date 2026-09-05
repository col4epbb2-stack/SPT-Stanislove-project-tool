import { useState } from 'react'
import { ArrowLeftRight } from 'lucide-react'
import { Input } from '../ui/Input'
import { convertir, formaterMontant, formaterTaux, type Devise } from '../../types/devise'

// Convertisseur de vérification : le CDS (§5) demande qu'« une conversion
// entre devises soit disponible ». Elle l'est désormais dans chaque champ de
// montant ; ce bloc sert à la contrôler sans ouvrir un formulaire de saisie.

export function Convertisseur({ devises }: { devises: Devise[] }) {
  const actives = devises.filter((d) => d.actif)
  const [montant, setMontant] = useState('1000')
  const [de, setDe] = useState(actives[0]?.code ?? '')
  const [vers, setVers] = useState(actives[1]?.code ?? actives[0]?.code ?? '')

  const valeur = Number(montant)
  const resultat = Number.isFinite(valeur) ? convertir(valeur, de, vers, devises) : null
  const selectClass =
    'w-full px-4 py-3 rounded-xl border border-gray-200 bg-gray-50 text-base focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary'

  return (
    <section className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100">
        <h3 className="font-semibold text-gray-900">Convertisseur</h3>
        <p className="text-xs text-gray-500 mt-0.5">Vérifier un taux avant de saisir un montant.</p>
      </div>
      <div className="p-5 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
          <Input label="Montant" type="number" step="any" value={montant} onChange={(e) => setMontant(e.target.value)} />
          <div>
            <label className="block text-sm font-medium mb-1.5 text-gray-500">De</label>
            <select value={de} onChange={(e) => setDe(e.target.value)} className={selectClass}>
              {actives.map((d) => (
                <option key={d.code} value={d.code}>
                  {d.code} — {d.libelle}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5 text-gray-500">Vers</label>
            <select value={vers} onChange={(e) => setVers(e.target.value)} className={selectClass}>
              {actives.map((d) => (
                <option key={d.code} value={d.code}>
                  {d.code} — {d.libelle}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex items-center gap-3 rounded-xl bg-gray-50 border border-gray-100 px-4 py-3">
          <ArrowLeftRight className="w-4 h-4 text-primary shrink-0" />
          {resultat === null ? (
            <p className="text-sm text-amber-600">
              Conversion impossible : le taux de {de} ou de {vers} n'est pas renseigné.
            </p>
          ) : (
            <div className="min-w-0">
              <p className="text-base font-semibold text-gray-900 tabular-nums">
                {formaterMontant(valeur, de, devises)} = {formaterMontant(resultat, vers, devises)}
              </p>
              {/* Le taux appliqué, sous le résultat : c'est lui qu'on vient
                  vérifier ici, et il ne se déduit pas d'un résultat arrondi. */}
              <p className="text-xs text-gray-500 mt-0.5 tabular-nums">{formaterTaux(de, vers, devises)}</p>
            </div>
          )}
        </div>
      </div>
    </section>
  )
}
