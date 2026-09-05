import { useState } from 'react'
import type { FormEvent } from 'react'
import { Plus, X } from 'lucide-react'
import { Input } from '../ui/Input'
import { Button } from '../ui/Button'
import { ChampMontant } from '../ui/ChampMontant'
import { aujourdHui, montantDepuisTexte, texteDepuisMontant } from '../../lib/saisie'
import { UNITE_XAF } from '../../lib/unitesMontant'
import { Badge } from '../ui/Badge'
import { useContrats } from '../../contexts/useContrats'
import { valeurCibleActuelle } from '../../lib/contratsEngine'
import type { ContratListe, OptionRenouvellement, TypeContrat } from '../../lib/contratsEngine'
import { useMontant } from '../../lib/montantAffiche'
import { formatDate } from '../../lib/format'
import { TYPE_LABELS, MOIS_LABELS, selectClass } from './contratFormConstants'

/**
 * Formulaire d'un contrat — **le même pour la création et la modification**
 * (`doc/module contrat.docx` §1). Deux composants jumeaux auraient divergé au
 * premier champ ajouté ; c'est le patron déjà retenu pour `AgentForm`.
 *
 * En modification, la **référence est en lecture seule** : elle est
 * l'identifiant du document Firestore, la changer abandonnerait le contrat
 * avec tout ce qui pointe dessus (cf. `ModifierContratInput`). Les options de
 * renouvellement ne se saisissent qu'à la création : elles s'exercent ensuite
 * une par une (cf. `OptionsRenouvellement`).
 */
export function ContratForm({
  contrat,
  onDone,
  onSaved,
}: {
  /** Absent = création. Présent = modification de ce contrat. */
  contrat?: ContratListe
  onDone: () => void
  onSaved: (contratId: string) => void
}) {
  const { fournisseurs, creerContrat, modifierContrat } = useContrats()
  const edition = contrat !== undefined
  const [reference, setReference] = useState(contrat?.reference ?? '')
  const [intitule, setIntitule] = useState(contrat?.intitule ?? '')
  const [type, setType] = useState<TypeContrat>(contrat?.type ?? 'TIG')
  const [fournisseurId, setFournisseurId] = useState(contrat?.fournisseurId ?? fournisseurs[0]?.id ?? '')
  const [dateDebut, setDateDebut] = useState(contrat?.dateDebut ?? '')
  const [dateFin, setDateFin] = useState(contrat?.dateFin ?? '')
  const [valeurCible, setValeurCible] = useState(texteDepuisMontant(contrat?.valeurCible ?? 0))
  const [clientNom, setClientNom] = useState(contrat?.responsableClient?.nom ?? '')
  const [clientEmail, setClientEmail] = useState(contrat?.responsableClient?.email ?? '')
  const [fournisseurNom, setFournisseurNom] = useState(contrat?.responsableFournisseur?.nom ?? '')
  const [fournisseurEmail, setFournisseurEmail] = useState(contrat?.responsableFournisseur?.email ?? '')
  const [commentaire, setCommentaire] = useState(contrat?.commentaire ?? '')
  // Options de renouvellement (retour utilisateur : "3 ans avec options de
  // renouvellement 1 an + 1 an") — juste une durée en années par option à la
  // création, exercées une par une plus tard (cf. OptionsRenouvellement).
  const [dureesOptions, setDureesOptions] = useState<string[]>([])
  const [erreur, setErreur] = useState('')
  const [enCours, setEnCours] = useState(false)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setErreur('')
    setEnCours(true)
    try {
      const commun = {
        intitule,
        type,
        fournisseurId,
        dateDebut,
        dateFin,
        valeurCible: Number(valeurCible) || 0,
        responsableClient: { nom: clientNom, email: clientEmail },
        responsableFournisseur: { nom: fournisseurNom, email: fournisseurEmail },
        commentaire,
      }
      if (edition) {
        await modifierContrat(contrat.id, commun)
        onSaved(contrat.id)
        return
      }
      const optionsRenouvellement = dureesOptions
        .map((d) => Number(d))
        .filter((d) => d > 0)
        .map((dureeAns) => ({ dureeAns }))
      const cree = await creerContrat({
        reference,
        ...commun,
        ...(optionsRenouvellement.length > 0 ? { optionsRenouvellement } : {}),
      })
      onSaved(cree.id)
    } catch (err) {
      setErreur(err instanceof Error ? err.message : 'Erreur inattendue')
    } finally {
      setEnCours(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-3 bg-white border border-gray-200 rounded-2xl p-4">
      <Input
        label="Référence"
        value={reference}
        onChange={(e) => setReference(e.target.value)}
        required
        disabled={edition}
        title={edition ? "La référence identifie le contrat et n'est pas modifiable." : undefined}
        className="col-span-2"
      />
      {edition && (
        <p className="col-span-2 -mt-2 text-xs text-gray-400">
          La référence identifie le contrat (et ses commandes, projets et consommations) : elle n'est pas modifiable.
        </p>
      )}
      {/* Intitulé juste sous la référence : c'est lui qu'on lit en premier
          (doc §1, « identifier rapidement l'objet du contrat sans se limiter à
          une référence ou un numéro »). */}
      <Input
        label="Intitulé du contrat"
        value={intitule}
        onChange={(e) => setIntitule(e.target.value)}
        placeholder="Assistance Technique Maintenance Offshore"
        className="col-span-2"
      />
      <div className="w-full">
        <label className="block text-sm font-medium mb-1.5 text-gray-500">Type de contrat</label>
        <select value={type} onChange={(e) => setType(e.target.value as TypeContrat)} className={selectClass}>
          {Object.entries(TYPE_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>
      <div className="w-full">
        <label className="block text-sm font-medium mb-1.5 text-gray-500">Fournisseur</label>
        <select value={fournisseurId} onChange={(e) => setFournisseurId(e.target.value)} className={selectClass}>
          {fournisseurs.map((f) => (
            <option key={f.id} value={f.id}>
              {f.nom}
            </option>
          ))}
        </select>
      </div>
      <Input label="Début de validité" type="date" value={dateDebut} onChange={(e) => setDateDebut(e.target.value)} required />
      <Input label="Fin de validité" type="date" value={dateFin} onChange={(e) => setDateFin(e.target.value)} required />
      {/* Contrats fournisseurs libellés en francs CFA (cf. ContratsPage) :
          l'unité d'enregistrement ne change pas, la saisie peut se faire dans
          une autre devise (18/08/2026, référentiel des devises). */}
      <ChampMontant
        label="Valeur Cible (VC)"
        devise={UNITE_XAF.devise}
        min={0}
        value={montantDepuisTexte(valeurCible)}
        onChange={(v) => setValeurCible(texteDepuisMontant(v))}
        className="col-span-2"
      />

      {/* Responsables du contrat (doc §1) — deux blocs côte à côte, comme le
          document les présente. Texte libre : le responsable côté fournisseur
          n'a pas de compte dans l'application. */}
      <ResponsableFields
        titre="Responsable côté client"
        nom={clientNom}
        email={clientEmail}
        onNom={setClientNom}
        onEmail={setClientEmail}
        exempleNom="Stanislove MEZUI-MENIE"
      />
      <ResponsableFields
        titre="Responsable côté fournisseur"
        nom={fournisseurNom}
        email={fournisseurEmail}
        onNom={setFournisseurNom}
        onEmail={setFournisseurEmail}
        exempleNom="Guillaume Mercier"
      />

      <div className="col-span-2">
        <label className="block text-sm font-medium mb-1.5 text-gray-500">Commentaire</label>
        <textarea
          value={commentaire}
          onChange={(e) => setCommentaire(e.target.value)}
          rows={2}
          placeholder="Points bloquants, relances, anomalies, informations importantes de suivi…"
          className={selectClass}
        />
      </div>

      {!edition && (
        <div className="col-span-2">
          <div className="flex items-center justify-between mb-1.5">
            <label className="block text-sm font-medium text-gray-500">Options de renouvellement</label>
            <button
              type="button"
              onClick={() => setDureesOptions((prev) => [...prev, '1'])}
              className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
            >
              <Plus className="w-3.5 h-3.5" />
              Ajouter une option
            </button>
          </div>
          {dureesOptions.length === 0 ? (
            <p className="text-xs text-gray-400">Aucune — la fin de validité ci-dessus est la seule échéance.</p>
          ) : (
            <div className="space-y-2">
              {dureesOptions.map((duree, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Input
                    type="number"
                    min="1"
                    value={duree}
                    onChange={(e) => setDureesOptions((prev) => prev.map((d, j) => (j === i ? e.target.value : d)))}
                    className="w-24"
                  />
                  <span className="text-sm text-gray-500">an(s)</span>
                  <button
                    type="button"
                    onClick={() => setDureesOptions((prev) => prev.filter((_, j) => j !== i))}
                    className="text-gray-400 hover:text-red-600"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {erreur && <p className="col-span-2 text-xs text-red-600">{erreur}</p>}
      <div className="col-span-2 flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onDone}>
          Annuler
        </Button>
        <Button type="submit" size="sm" disabled={enCours}>
          {enCours ? 'Enregistrement…' : edition ? 'Enregistrer' : 'Ajouter'}
        </Button>
      </div>
    </form>
  )
}

/**
 * Le couple nom + e-mail d'un responsable. Le nom fait exister le
 * responsable ; l'adresse est facultative (`type="email"` suffit à la
 * contrôler, sans la rendre obligatoire).
 */
function ResponsableFields({
  titre,
  nom,
  email,
  onNom,
  onEmail,
  exempleNom,
}: {
  titre: string
  nom: string
  email: string
  onNom: (v: string) => void
  onEmail: (v: string) => void
  exempleNom: string
}) {
  return (
    <div className="space-y-2 rounded-xl border border-gray-100 bg-gray-50/60 p-3">
      <p className="text-xs font-semibold text-gray-500">{titre}</p>
      <Input label="Nom" value={nom} onChange={(e) => onNom(e.target.value)} placeholder={exempleNom} />
      <Input
        label="Adresse e-mail"
        type="email"
        value={email}
        onChange={(e) => onEmail(e.target.value)}
        placeholder="prenom.nom@…"
      />
    </div>
  )
}

// Affichage + exercice des options de renouvellement d'un contrat déjà créé
// — partagé entre la vue portfolio (ContratsPage) et l'onglet projet
// (ContratsTab).
export function OptionsRenouvellement({ contratId, options }: { contratId: string; options: OptionRenouvellement[] }) {
  const { exercerOptionRenouvellement } = useContrats()
  const [enCours, setEnCours] = useState<string | null>(null)

  if (options.length === 0) return null

  const handleExercer = async (optionId: string, dureeAns: number) => {
    if (!window.confirm(`Exercer l'option de +${dureeAns} an(s) ? La date de fin du contrat sera prolongée d'autant.`)) return
    setEnCours(optionId)
    try {
      await exercerOptionRenouvellement(contratId, optionId)
    } finally {
      setEnCours(null)
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2 mb-3">
      <span className="text-xs text-gray-500">Options de renouvellement :</span>
      {options.map((o) =>
        o.exercee ? (
          <Badge key={o.id} label={`+${o.dureeAns} an(s) exercée le ${formatDate(o.dateExercice ?? '')}`} bg="bg-gray-100" text="text-gray-500" />
        ) : (
          <button
            key={o.id}
            onClick={() => handleExercer(o.id, o.dureeAns)}
            disabled={enCours === o.id}
            className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full bg-amber-100 text-amber-700 hover:bg-amber-200 disabled:opacity-50"
          >
            +{o.dureeAns} an(s) — {enCours === o.id ? 'Exercice…' : 'Exercer'}
          </button>
        )
      )}
    </div>
  )
}

/**
 * Liste des AVC d'un contrat et saisie d'une nouvelle augmentation
 * (`doc/module contrat.docx` §2).
 *
 * Le formulaire demande **le montant ajouté**, pas la nouvelle valeur cible :
 * c'est ce que le document nomme « l'augmentation » (« AVC n°1 : +1 000 000
 * USD »). La nouvelle valeur cible est affichée en dérivé pendant la saisie,
 * pour vérifier qu'on arrive bien au chiffre décidé par le management.
 */
export function AvcContratSection({ contrat }: { contrat: ContratListe }) {
  const { ajouterAvcContrat } = useContrats()
  const { montant: formatMontant } = useMontant()
  const [ouvert, setOuvert] = useState(false)
  const [date, setDate] = useState(aujourdHui())
  const [montantAjoute, setMontantAjoute] = useState('')
  const [commentaire, setCommentaire] = useState('')
  const [erreur, setErreur] = useState('')
  const [enCours, setEnCours] = useState(false)

  const cibleActuelle = valeurCibleActuelle(contrat)
  const ajout = Number(montantAjoute) || 0

  const fermer = () => {
    setOuvert(false)
    setMontantAjoute('')
    setCommentaire('')
    setErreur('')
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setErreur('')
    if (ajout === 0) {
      setErreur("Le montant de l'augmentation ne peut pas être nul.")
      return
    }
    setEnCours(true)
    try {
      await ajouterAvcContrat(contrat.id, { date, montantAjoute: ajout, commentaire })
      fermer()
    } catch (err) {
      setErreur(err instanceof Error ? err.message : 'Erreur inattendue')
    } finally {
      setEnCours(false)
    }
  }

  return (
    <div className="mb-4 rounded-xl border border-gray-100 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
        <div>
          <p className="text-xs font-medium text-gray-500">Valeur cible et augmentations (AVC)</p>
          <p className="text-sm text-gray-900">
            <span className="font-semibold">{formatMontant(cibleActuelle, 'XAF')}</span>
            {contrat.avc.length > 0 && (
              <span className="text-xs text-gray-500">
                {' '}
                — initiale {formatMontant(contrat.valeurCible, 'XAF')} + {contrat.avc.length} AVC
              </span>
            )}
          </p>
        </div>
        {!ouvert && (
          <button
            type="button"
            onClick={() => setOuvert(true)}
            className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
          >
            <Plus className="w-3.5 h-3.5" />
            Augmenter la valeur cible
          </button>
        )}
      </div>

      {contrat.avc.length === 0 ? (
        <p className="text-xs text-gray-400">Aucune augmentation — la valeur cible est celle d'origine.</p>
      ) : (
        <ul className="divide-y divide-gray-100">
          {contrat.avc.map((a) => (
            <li key={a.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-2 text-sm">
              <Badge label={`AVC${a.numero}`} bg="bg-amber-100" text="text-amber-700" />
              <span className="font-medium text-gray-900">+{formatMontant(a.montantAjoute, 'XAF')}</span>
              <span className="text-xs text-gray-500">{formatDate(a.date)}</span>
              {a.commentaire && <span className="text-xs text-gray-600 basis-full">{a.commentaire}</span>}
              {a.saisiPar && <span className="text-xs text-gray-400 basis-full">Enregistré par {a.saisiPar}</span>}
            </li>
          ))}
        </ul>
      )}

      {ouvert && (
        <form onSubmit={handleSubmit} className="mt-3 grid grid-cols-2 gap-3 border-t border-gray-100 pt-3">
          <Input label="Date de l'augmentation" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
          <ChampMontant
            label="Montant ajouté"
            devise={UNITE_XAF.devise}
            value={montantDepuisTexte(montantAjoute)}
            onChange={(v) => setMontantAjoute(texteDepuisMontant(v))}
          />
          <div className="col-span-2">
            <label className="block text-sm font-medium mb-1.5 text-gray-500">Commentaire</label>
            <textarea
              value={commentaire}
              onChange={(e) => setCommentaire(e.target.value)}
              rows={2}
              placeholder="Motif de l'augmentation, décision de référence…"
              className={selectClass}
            />
          </div>
          {/* Nouvelle valeur cible affichée en dérivé : le document raisonne en
              « nouvelle valeur cible » (3 000 000) là où on saisit
              l'augmentation (+1 000 000). */}
          <p className="col-span-2 text-xs text-gray-500">
            Nouvelle valeur cible : <span className="font-medium text-gray-900">{formatMontant(cibleActuelle + ajout, 'XAF')}</span>
            {contrat.avc.length > 0 || ajout !== 0 ? ` (AVC${contrat.avc.length + 1})` : ''}
          </p>
          {erreur && <p className="col-span-2 text-xs text-red-600">{erreur}</p>}
          <div className="col-span-2 flex justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={fermer}>
              Annuler
            </Button>
            <Button type="submit" size="sm" disabled={enCours}>
              {enCours ? 'Enregistrement…' : "Enregistrer l'augmentation"}
            </Button>
          </div>
        </form>
      )}
    </div>
  )
}

export function ConsommationForm({ contratId, onAjoutee }: { contratId: string; onAjoutee: () => void }) {
  const { ajouterConsommationContrat } = useContrats()
  const maintenant = new Date()
  const [annee, setAnnee] = useState(String(maintenant.getFullYear()))
  const [mois, setMois] = useState(String(maintenant.getMonth() + 1))
  const [montant, setMontant] = useState('0')

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    await ajouterConsommationContrat(contratId, {
      annee: Number(annee),
      mois: Number(mois),
      montant: Number(montant) || 0,
    })
    onAjoutee()
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-3 mb-4">
      <div className="w-28">
        <label className="block text-sm font-medium mb-1.5 text-gray-500">Année</label>
        <Input type="number" value={annee} onChange={(e) => setAnnee(e.target.value)} />
      </div>
      <div className="w-32">
        <label className="block text-sm font-medium mb-1.5 text-gray-500">Mois</label>
        <select value={mois} onChange={(e) => setMois(e.target.value)} className={selectClass}>
          {MOIS_LABELS.map((label, i) => (
            <option key={label} value={i + 1}>
              {label}
            </option>
          ))}
        </select>
      </div>
      <ChampMontant
        label="Montant consommé"
        devise={UNITE_XAF.devise}
        min={0}
        value={montantDepuisTexte(montant)}
        onChange={(v) => setMontant(texteDepuisMontant(v))}
        className="w-52"
      />
      <Button type="submit" size="sm">
        Ajouter
      </Button>
    </form>
  )
}
