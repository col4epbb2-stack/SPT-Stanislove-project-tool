import { useState } from 'react'
import type { FormEvent } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { Input } from '../ui/Input'
import { Button } from '../ui/Button'
import { Badge } from '../ui/Badge'
import { ChampMontant } from '../ui/ChampMontant'
import { montantDepuisTexte, texteDepuisMontant } from '../../lib/saisie'
import { useMontant } from '../../lib/montantAffiche'
import { useProjects } from '../../contexts/useProjects'
import { projetsDeCommande, totalFactureCommande, toutesCommandesContrat } from '../../types/project'
import type { Commande } from '../../types/project'
import { SelecteurProjets } from './SelecteurProjets'
import { UNITE_XAF } from '../../lib/unitesMontant'
import { selectClass } from './contratFormConstants'
import { AugmentationsCommande } from './AugmentationsCommande'
import { NouvelleFactureForm } from './NouvelleFactureForm'
import { FactureLigne } from './FactureLigne'

/**
 * Commandes (PO) suivies **depuis le contrat** (`doc/module contrat.docx`
 * §3) : « sur certains contrats — contrat de topographie, contrat EPCM — il
 * est nécessaire de suivre directement les commandes et les factures sans
 * forcément être rattaché à un projet classique ».
 *
 * Deux choses la distinguent de `CommandesContrat` (onglet d'une fiche
 * projet) : elle montre **toutes** les commandes du contrat, quel que soit le
 * projet — c'est la question qu'on se pose ici (« ce contrat, qu'a-t-il
 * engagé ? ») —, et elle permet d'en créer **sans fiche projet**, ce qui
 * n'était possible nulle part avant.
 *
 * Les factures suivent leur commande : une facture rattachée à une commande
 * sans projet est donc elle aussi suivie depuis le contrat, ce que le §3
 * demande également. Leur workflow de validation relève du lot 4.
 */
export function CommandesDuContrat({ contratId }: { contratId: string }) {
  const { commandes, projects, creerCommande } = useProjects()
  const { montant: formatMontant } = useMontant()
  const [showForm, setShowForm] = useState(false)
  const [numero, setNumero] = useState('')
  const [montant, setMontant] = useState('')
  const [fournisseur, setFournisseur] = useState('')
  const [objet, setObjet] = useState('')
  const [projetId, setProjetId] = useState('')
  // Affaires **supplémentaires** et intitulés créés à la volée (rev01 §5).
  // La fiche du menu ci-dessus reste l'imputation, celle qui porte le montant.
  const [projetIds, setProjetIds] = useState<string[]>([])
  const [projetsLibres, setProjetsLibres] = useState<string[]>([])
  const [commentaire, setCommentaire] = useState('')
  const [enCours, setEnCours] = useState(false)

  // Les commandes restées dans le document d'une fiche (avant migration) sont
  // reprises ici aussi : sans elles, le contrat paraîtrait vide alors qu'il
  // porte des engagements bien réels.
  const liste = toutesCommandesContrat(projects, commandes, contratId)

  const engage = liste.reduce((s, c) => s + c.montant, 0)
  const facture = liste.reduce((s, c) => s + totalFactureCommande(c), 0)
  const sansProjet = liste.filter((c) => !c.projetId).length
  // Le statut des factures et les KPI de traitement vivent dans le tableau de
  // suivi (`FacturesDuContrat`, doc §6), pas ici : deux bandeaux sur le même
  // écran finiraient par se contredire, l'un suivant les filtres du tableau et
  // l'autre non.

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setEnCours(true)
    try {
      await creerCommande({
        numero,
        montantInitial: Number(montant) || 0,
        contratId,
        // Chaîne vide = « aucun projet » : c'est le cas que le §3 rend
        // possible, pas une valeur manquante.
        projetId: projetId || null,
        // L'imputation n'est pas répétée dans la liste des affaires
        // supplémentaires : `projetsDeCommande` la remet en tête à la lecture.
        projetIds: projetIds.filter((id) => id !== projetId),
        projetsLibres,
        fournisseur: fournisseur || undefined,
        objet: objet || undefined,
        commentaire: commentaire || undefined,
      })
      setNumero('')
      setMontant('')
      setFournisseur('')
      setObjet('')
      setProjetId('')
      setProjetIds([])
      setProjetsLibres([])
      setCommentaire('')
      setShowForm(false)
    } finally {
      setEnCours(false)
    }
  }

  return (
    <div className="mb-4 rounded-xl border border-gray-100 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
        <div className="min-w-0">
          <p className="text-xs font-medium text-gray-500">Commandes (PO) de ce contrat, tous projets confondus</p>
          {liste.length > 0 && (
            <p className="text-xs text-gray-400 mt-0.5">
              {liste.length} commande(s) · engagé {formatMontant(engage, 'XAF')} · facturé {formatMontant(facture, 'XAF')}
              {sansProjet > 0 && ` · dont ${sansProjet} sans fiche projet`}
            </p>
          )}
        </div>
        {!showForm && (
          <button
            type="button"
            onClick={() => setShowForm(true)}
            className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline shrink-0"
          >
            <Plus className="w-3.5 h-3.5" />
            Ajouter une commande
          </button>
        )}
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-3 mb-3 border-b border-gray-100 pb-3">
          <Input label="N° commande" value={numero} onChange={(e) => setNumero(e.target.value)} placeholder="4550001" required className="w-40" />
          <ChampMontant
            label="Montant initial"
            devise={UNITE_XAF.devise}
            min={0}
            required
            className="w-48"
            value={montantDepuisTexte(montant)}
            onChange={(v) => setMontant(texteDepuisMontant(v))}
          />
          <div className="w-56">
            <label className="block text-sm font-medium mb-1.5 text-gray-500">Fiche projet imputée</label>
            {/* Facultatif, et c'est tout l'objet du §3 : une commande de
                topographie ou d'EPCM n'a pas de fiche projet. C'est **cette**
                fiche qui porte le montant de la commande dans l'engagement
                d'un projet et dans la feuille de route ; les affaires
                ci-dessous s'y ajoutent sans le répartir (rev01 §5, Q8). */}
            <select value={projetId} onChange={(e) => setProjetId(e.target.value)} className={selectClass}>
              <option value="">Aucune — suivie depuis le contrat</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nom}
                </option>
              ))}
            </select>
          </div>
          <Input label="Fournisseur" value={fournisseur} onChange={(e) => setFournisseur(e.target.value)} className="w-40" />
          <Input label="Objet" value={objet} onChange={(e) => setObjet(e.target.value)} placeholder="Travaux peinture, mois de mars" className="w-56" />
          <Input label="Commentaire" value={commentaire} onChange={(e) => setCommentaire(e.target.value)} placeholder="Relance, anomalie…" className="w-56" />
          {/* Affaires supplémentaires (rev01 §5 : « Sélectionner une fiche
              projet existante **ou des fiches** », « créer le nom des projet
              non existants dans les fihes »). */}
          <div className="w-full">
            <label className="block text-sm font-medium mb-1.5 text-gray-500">Autres affaires concernées</label>
            <SelecteurProjets
              projetIds={projetIds}
              projetsLibres={projetsLibres}
              onChange={(ids, libres) => {
                setProjetIds(ids)
                setProjetsLibres(libres)
              }}
              aide="Le montant de la commande reste imputé à la fiche choisie ci-dessus — il n’est pas réparti entre les affaires."
            />
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => setShowForm(false)}>
              Annuler
            </Button>
            <Button type="submit" size="sm" disabled={enCours}>
              {enCours ? 'Enregistrement…' : 'Ajouter'}
            </Button>
          </div>
        </form>
      )}

      {liste.length === 0 ? (
        <p className="text-xs text-gray-400">Aucune commande rattachée à ce contrat.</p>
      ) : (
        <div className="divide-y divide-gray-100">
          {liste.map((c) => (
            <LigneCommandeContrat key={c.id} commande={c} />
          ))}
        </div>
      )}
    </div>
  )
}

function LigneCommandeContrat({ commande }: { commande: Commande }) {
  const { projects, removeCommande, modifierCommande } = useProjects()
  const { montant: formatMontant } = useMontant()
  const [showForm, setShowForm] = useState(false)
  const [editionAffaires, setEditionAffaires] = useState(false)

  const projet = commande.projetId ? projects.find((p) => p.id === commande.projetId) : undefined
  const facture = totalFactureCommande(commande)
  const nomProjet = (id: string) => projects.find((p) => p.id === id)?.nom ?? id
  // L'imputation en premier, les autres affaires ensuite (rev01 §5).
  const affaires = projetsDeCommande(commande)
  const autresAffaires = affaires.filter((id) => id !== commande.projetId)
  const libres = commande.projetsLibres ?? []
  // Une commande restée dans le document d'une fiche (avant migration) n'a
  // pas de document propre : `modifierCommande` ne la trouverait pas. On le
  // dit au lieu de proposer un bouton qui échouerait.
  const modifiable = commande.source === 'collection'

  /**
   * Enregistre les affaires. `modifierCommande` réécrit l'identification
   * entière : les champs qu'on ne touche pas doivent être renvoyés tels
   * quels, sinon les omettre les effacerait.
   */
  const enregistrerAffaires = (projetIds: string[], projetsLibres: string[]) => {
    void modifierCommande(commande.id, {
      numero: commande.numero,
      contratId: commande.contratId ?? null,
      projetIds: projetIds.filter((id) => id !== commande.projetId),
      projetsLibres,
      fournisseur: commande.fournisseur,
      libelle: commande.libelle,
      objet: commande.objet,
      commentaire: commande.commentaire,
    })
  }

  const supprimer = () => {
    if (!window.confirm(`Supprimer la commande « ${commande.numero} » et ses factures ?`)) return
    removeCommande(commande.projetId ?? '', commande.id)
  }

  return (
    <div className="py-2.5 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-col min-w-0">
          <span className="font-mono text-gray-600">{commande.numero}</span>
          <span className="text-xs text-gray-400 truncate">
            {[commande.fournisseur, commande.libelle, commande.objet].filter(Boolean).join(' · ') || '—'}
          </span>
          {commande.commentaire && <span className="text-xs text-gray-600">{commande.commentaire}</span>}
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {/* Dire d'où vient la commande : sans projet, c'est le cas du §3 ;
              avec, c'est une commande de fiche que le contrat agrège. */}
          {projet ? (
            <Badge label={projet.nom} bg="bg-gray-100" text="text-gray-600" />
          ) : (
            <Badge label="Sans fiche projet" bg="bg-indigo-50" text="text-indigo-700" />
          )}
          {/* Les affaires supplémentaires (rev01 §5) : comptées ici, listées
              sous la ligne — les afficher toutes en badges pousserait le
              montant hors de l'écran sur une commande à dix affaires. */}
          {autresAffaires.length + libres.length > 0 && (
            <span className="text-xs text-gray-500 whitespace-nowrap">
              +{autresAffaires.length + libres.length} affaire(s)
            </span>
          )}
          <span className="text-xs text-gray-500 whitespace-nowrap">Facturé : {formatMontant(facture, 'XAF')}</span>
          <span className="font-semibold text-gray-900 whitespace-nowrap">{formatMontant(commande.montant, 'XAF')}</span>
          <button onClick={() => setShowForm((v) => !v)} className="text-xs font-semibold text-primary hover:underline whitespace-nowrap">
            + Facture
          </button>
          <button onClick={supprimer} title="Supprimer la commande" className="text-gray-400 hover:text-red-600">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Affaires de la commande (rev01 §5) : « Sélectionner une fiche projet
          existante ou des fiches », « créer le nom des projet non existants
          dans les fihes ». */}
      <div className="mt-1 text-xs">
        <span className="text-gray-500">
          Affaires : {[...affaires.map(nomProjet), ...libres].join(', ') || 'aucune'}
        </span>
        {modifiable ? (
          <button
            type="button"
            onClick={() => setEditionAffaires((v) => !v)}
            className="ml-2 font-semibold text-primary hover:underline"
          >
            {editionAffaires ? 'Terminer' : 'Modifier'}
          </button>
        ) : (
          <span className="ml-2 text-gray-400">
            (commande encore dans une fiche projet — à migrer depuis Paramètres › Maintenance pour la modifier ici)
          </span>
        )}
        {editionAffaires && (
          <div className="mt-1.5">
            <SelecteurProjets
              projetIds={affaires}
              projetsLibres={libres}
              onChange={enregistrerAffaires}
              aide="Le montant reste imputé à la fiche projet de la commande — il n’est pas réparti entre les affaires."
            />
          </div>
        )}
      </div>

      <AugmentationsCommande commande={commande} devise={UNITE_XAF.devise} />

      {(commande.factures ?? []).length > 0 && (
        <div className="mt-2 pl-3 border-l-2 border-gray-100">
          {(commande.factures ?? []).map((f) => (
            <FactureLigne
              key={f.id}
              facture={f}
              commande={commande}
              projetId={commande.projetId ?? ''}
              devise={UNITE_XAF.devise}
            />
          ))}
        </div>
      )}

      {showForm && (
        <NouvelleFactureForm
          projetId={commande.projetId ?? ''}
          commande={commande}
          devise={UNITE_XAF.devise}
          onDone={() => setShowForm(false)}
        />
      )}
    </div>
  )
}
