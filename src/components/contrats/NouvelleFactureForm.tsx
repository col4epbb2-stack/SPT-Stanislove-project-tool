import { useState } from 'react'
import type { FormEvent } from 'react'
import { Input } from '../ui/Input'
import { Button } from '../ui/Button'
import { ChampMontant } from '../ui/ChampMontant'
import { ChampDatePartielle } from '../ui/ChampDatePartielle'
import { montantDepuisTexte, texteDepuisMontant } from '../../lib/saisie'
import { useProjects } from '../../contexts/useProjects'
import { projetsDeCommande } from '../../types/project'
import type { Commande } from '../../types/project'
import { SelecteurProjets } from './SelecteurProjets'

/**
 * Création d'une facture imputée à une commande (`doc/module contrat.docx`
 * §5 et §6).
 *
 * Les champs sont ceux du **fichier de suivi Excel** joint au document
 * (N° FACTURE, MONTANT HT, SERVICE, MOIS, SITES, OBJET), plus la date de
 * réception, borne de départ des KPI de traitement.
 *
 * Le **workflow de validation n'est pas ici**, et c'est la règle du §6 :
 * « les informations déjà saisies lors de la création doivent être reprises
 * automatiquement ; seules les informations relatives au workflow de
 * validation et de paiement doivent être complétées manuellement ». On saisit
 * donc l'identification une fois, à la création, et les sept étapes se cochent
 * ensuite au fil du traitement, dans la ligne de la facture.
 *
 * Partagé entre la fiche projet et le module Contrats — c'est la même facture.
 */
export function NouvelleFactureForm({
  projetId,
  commande,
  devise,
  onDone,
}: {
  /** `''` pour une commande sans fiche projet (doc §3). */
  projetId: string
  /** La commande porteuse : ses affaires sont proposées en premier (rev01 §6). */
  commande: Commande
  devise: string
  onDone: () => void
}) {
  const { addFacture } = useProjects()
  const [numero, setNumero] = useState('')
  const [montant, setMontant] = useState('')
  const [date, setDate] = useState('')
  const [dateReception, setDateReception] = useState('')
  const [service, setService] = useState('')
  const [site, setSite] = useState('')
  const [mois, setMois] = useState('')
  const [objet, setObjet] = useState('')
  // Affaires payées par la facture (rev01 §6). Laissées vides, la facture
  // suit celles de sa commande : c'est le cas courant, et le redemander à
  // chaque facture d'une commande mono-projet n'apprendrait rien.
  const [projetIds, setProjetIds] = useState<string[]>([])
  const [projetsLibres, setProjetsLibres] = useState<string[]>([])

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    addFacture(projetId, commande.id, numero, Number(montant) || 0, date || undefined, {
      dateReception: dateReception || undefined,
      service: service || undefined,
      site: site || undefined,
      mois: mois || undefined,
      objet: objet || undefined,
      // Listes vides non écrites : « aucune affaire propre » se lit sur
      // l'absence du champ, et un tableau vide en base dirait la même chose
      // en moins clair.
      projetIds: projetIds.length > 0 ? projetIds : undefined,
      projetsLibres: projetsLibres.length > 0 ? projetsLibres : undefined,
    })
    onDone()
  }

  return (
    <form onSubmit={handleSubmit} className="mt-3 rounded-xl border border-gray-100 bg-gray-50/60 p-3">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <Input label="N° facture" value={numero} onChange={(e) => setNumero(e.target.value)} placeholder="132/GMI/03/26" required />
        <ChampMontant
          label="Montant HT"
          devise={devise}
          min={0}
          required
          value={montantDepuisTexte(montant)}
          onChange={(v) => setMontant(texteDepuisMontant(v))}
        />
        {/* Dates à précision variable (rev01 §3) : « Jour + mois + année ou
            Mois + année uniquement ». */}
        <ChampDatePartielle label="Date de la facture" value={date} onChange={setDate} />
        {/* Date de réception : c'est elle qui démarre les KPI de traitement
            (§5), et non la date d'émission de la facture. */}
        <ChampDatePartielle label="Date de réception" value={dateReception} onChange={setDateReception} />
        <Input label="Service" value={service} onChange={(e) => setService(e.target.value)} placeholder="Métal (Atelier)" />
        <Input label="Site" value={site} onChange={(e) => setSite(e.target.value)} placeholder="AGM" />
        <Input label="Mois" value={mois} onChange={(e) => setMois(e.target.value)} placeholder="mars-26" />
        <Input label="Objet" value={objet} onChange={(e) => setObjet(e.target.value)} placeholder="Travaux peinture, mois de mars" />
      </div>
      {/* Affaires payées (rev01 §6) : « Une facture peut être rattachée à
          plusieurs projets, qu'ils soient présents ou non dans la feuille de
          route. » */}
      <div className="mt-3">
        <label className="block text-sm font-medium mb-1.5 text-gray-500">Affaires payées par cette facture</label>
        <SelecteurProjets
          projetIds={projetIds}
          projetsLibres={projetsLibres}
          onChange={(ids, libres) => {
            setProjetIds(ids)
            setProjetsLibres(libres)
          }}
          restreintA={{ projetIds: projetsDeCommande(commande), projetsLibres: commande.projetsLibres ?? [] }}
          aide="Laissé vide, la facture suit les affaires de sa commande."
        />
      </div>

      <p className="mt-2 text-xs text-gray-400">
        Les étapes de validation (technique, comptabilité, SAP, CGE, <strong>DO</strong>, paiement) se renseignent
        ensuite en dépliant la facture.
      </p>
      <div className="mt-2 flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onDone}>
          Annuler
        </Button>
        <Button type="submit" size="sm">
          Ajouter la facture
        </Button>
      </div>
    </form>
  )
}
