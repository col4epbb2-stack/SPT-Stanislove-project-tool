import { useState } from 'react'
import { Check, ChevronRight, Inbox, Pencil, X } from 'lucide-react'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { Modal } from '../ui/Modal'
import { Pagination } from '../ui/Pagination'
import { usePagination } from '../../lib/usePagination'
import { useAuth } from '../../contexts/useAuth'
import { useNavette } from '../../contexts/useNavette'
import {
  CYCLE_BUDGET_LABELS,
  STATUT_ARBITRAGE_LABELS,
  estEnAttente,
  peutAjuster,
  peutViser,
  profilAttendu,
} from '../../types/navette'
import type { ArbitrageNavette } from '../../types/navette'
import { PROFIL_NAVETTE_LABELS } from '../../types/user'
import { formatDate } from '../../lib/format'
import { useMontant } from '../../lib/montantAffiche'
import { ArbitrageModal } from './ArbitrageModal'

// File d'attente des révisions à viser (11/08/2026). Une révision proposée
// passe par deux visas successifs — chef de département puis directeur
// technique — et ce n'est que le second qui l'applique au budget. Cette
// section est donc la boîte de réception des deux profils, et non plus le
// simple bouton Valider/Rejeter de l'admin.
//
// **23/08/2026, demande explicite** (« on pourra avoir plusieurs révisions,
// mieux on les affiche dans une modale accompagnée d'une pagination ») : la
// page ne porte plus que le décompte et le bouton qui ouvre la file. Chaque
// révision occupe une dizaine de lignes (montant, parcours des deux visas,
// actions, motif de refus) — empilées sur la page, quelques révisions en
// attente repoussaient tout le reste de l'écran hors de vue.

function EtapesVisa({ arbitrage, nomUtilisateur }: { arbitrage: ArbitrageNavette; nomUtilisateur: (id?: string) => string }) {
  const etapes = [
    {
      cle: 'chef_departement' as const,
      visa: arbitrage.visaChefDepartement,
      atteinte: arbitrage.statut !== 'en_attente_chef',
    },
    {
      cle: 'directeur_technique' as const,
      visa: arbitrage.visaDirecteurTechnique,
      atteinte: arbitrage.statut === 'valide',
    },
  ]

  return (
    <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
      {etapes.map((e, i) => (
        <span key={e.cle} className="flex items-center gap-1.5">
          {i > 0 && <ChevronRight className="w-3 h-3 text-gray-300" />}
          <span
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs ${
              e.visa ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
            }`}
            title={
              e.visa
                ? `Visé par ${nomUtilisateur(e.visa.parId)} le ${formatDate(e.visa.le)}`
                : 'Visa en attente'
            }
          >
            {e.visa && <Check className="w-3 h-3" />}
            {PROFIL_NAVETTE_LABELS[e.cle]}
          </span>
        </span>
      ))}
    </div>
  )
}

function LigneValidation({ arbitrage }: { arbitrage: ArbitrageNavette }) {
  const { montant: formatMontant, uniteSysteme } = useMontant()
  const { currentUser, users } = useAuth()
  const { lignes, viserArbitrage, viserLesDeuxEtapes, rejeterArbitrage } = useNavette()
  const [motif, setMotif] = useState<string | null>(null)
  // Réajustement de la proposition (23/08/2026) : le même formulaire que la
  // proposition, prérempli avec ce qui a été proposé.
  const [ajustement, setAjustement] = useState(false)
  const [enCours, setEnCours] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)

  if (!currentUser) return null

  const ligne = lignes.find((l) => l.id === arbitrage.ligneId)
  const nomUtilisateur = (id?: string) => (id ? (users.find((u) => u.id === id)?.name ?? '—') : '—')
  const attendu = profilAttendu(arbitrage.statut)
  const peutAgir = peutViser(arbitrage, currentUser)
  const estAdmin = currentUser.role === 'admin'
  // Un admin peut poser les deux visas d'un coup depuis le 23/08/2026 : le
  // raccourci n'a de sens qu'à la première étape — à la seconde, « Viser et
  // appliquer » fait déjà exactement cela.
  const peutToutViser = estAdmin && arbitrage.statut === 'en_attente_chef'
  const peutCorriger = peutAjuster(arbitrage, currentUser)
  // Distingue « ce n'est pas votre tour » de « vous avez déjà visé » : pour un
  // non-admin, le second visa doit venir d'une autre personne.
  const dejaVise = arbitrage.visaChefDepartement?.parId === currentUser.id

  const executer = async (action: () => Promise<void>) => {
    setEnCours(true)
    setErreur(null)
    try {
      await action()
      setMotif(null)
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Échec de l’opération.')
    } finally {
      setEnCours(false)
    }
  }

  return (
    <div className="py-3 text-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium text-gray-900">{ligne?.libelle ?? '—'}</p>
          <p className="text-xs text-gray-500">
            {CYCLE_BUDGET_LABELS[arbitrage.cycleId]} ·{' '}
            {/* La ligne porte sa devise ; quand elle est introuvable, on
                retombe sur celle du système et non sur un 'USD' écrit en dur. */}
            {formatMontant(arbitrage.montant, ligne ? `K${ligne.devise}` : uniteSysteme())} · proposé par{' '}
            {nomUtilisateur(arbitrage.demandeurId)}
            {arbitrage.montantPreleveCale
              // La cale est comptée dans le pivot : « KUSD » écrit en dur la
              // faisait reconvertir une seconde fois dès que le pivot changeait.
              ? ` · pioche ${formatMontant(arbitrage.montantPreleveCale, uniteSysteme())} dans la cale`
              : ''}
          </p>
          <EtapesVisa arbitrage={arbitrage} nomUtilisateur={nomUtilisateur} />
        </div>

        <div className="flex flex-col items-end gap-2 shrink-0">
          <Badge label={STATUT_ARBITRAGE_LABELS[arbitrage.statut]} bg="bg-amber-100" text="text-amber-700" />
          <div className="flex flex-wrap items-center justify-end gap-2">
            {peutAgir && (
              <>
                {/* Le bouton nomme le profil qu'il supplée : un admin vise
                    pour le chef de département **et** pour le directeur
                    technique (23/08/2026), il doit savoir lequel des deux il
                    est en train de poser. */}
                <Button
                  size="sm"
                  className="bg-green-600 hover:bg-green-700 shadow-none"
                  loading={enCours}
                  onClick={() => attendu && executer(() => viserArbitrage(arbitrage.id, currentUser.id, attendu))}
                >
                  {arbitrage.statut === 'en_attente_dt' ? 'Viser et appliquer' : 'Viser'}
                  {attendu && ` (${PROFIL_NAVETTE_LABELS[attendu].toLowerCase()})`}
                </Button>
                {/* Les deux visas d'un coup (23/08/2026, demande explicite).
                    Le bouton dit ce qu'il fait — appliquer au budget — parce
                    qu'il saute une étape du parcours. */}
                {peutToutViser && (
                  <Button
                    size="sm"
                    className="bg-green-700 hover:bg-green-800 shadow-none"
                    loading={enCours}
                    onClick={() => executer(() => viserLesDeuxEtapes(arbitrage.id, currentUser.id))}
                  >
                    Viser les 2 étapes et appliquer
                  </Button>
                )}
              </>
            )}
            {peutCorriger && (
              <Button size="sm" variant="ghost" disabled={enCours} onClick={() => setAjustement(true)}>
                <Pencil className="w-3.5 h-3.5 mr-1.5" />
                Réajuster
              </Button>
            )}
            {peutAgir ? (
              <Button
                size="sm"
                variant="ghost"
                className="text-red-600 border-red-200 hover:bg-red-50"
                disabled={enCours}
                onClick={() => setMotif(motif === null ? '' : null)}
              >
                Refuser
              </Button>
            ) : (
              <span className="text-xs text-gray-400 text-right max-w-56">
                {dejaVise
                  ? 'Vous avez déjà visé — le second visa doit venir d’une autre personne.'
                  : attendu
                    ? `En attente du visa « ${PROFIL_NAVETTE_LABELS[attendu]} ».`
                    : 'Traitée.'}
              </span>
            )}
          </div>
        </div>
      </div>

      {motif !== null && (
        <div className="flex flex-wrap items-center gap-2 mt-3">
          <input
            autoFocus
            value={motif}
            onChange={(e) => setMotif(e.target.value)}
            placeholder="Motif du refus (facultatif)"
            className="flex-1 min-w-56 px-3 py-1.5 rounded-lg border border-gray-200 bg-gray-50 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
          />
          <Button
            size="sm"
            variant="ghost"
            className="text-red-600 border-red-200 hover:bg-red-50"
            loading={enCours}
            onClick={() => executer(() => rejeterArbitrage(arbitrage.id, currentUser.id, motif))}
          >
            Confirmer le refus
          </Button>
          <button
            onClick={() => setMotif(null)}
            title="Annuler"
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {erreur && <p className="text-xs text-red-600 mt-2">{erreur}</p>}

      {ajustement && ligne && (
        <ArbitrageModal
          ligne={ligne}
          cycleId={arbitrage.cycleId}
          arbitrageAAjuster={arbitrage}
          isOpen={ajustement}
          onClose={() => setAjustement(false)}
        />
      )}
    </div>
  )
}

export function ValidationsEnAttente() {
  const { currentUser } = useAuth()
  const { arbitrages } = useNavette()
  const [ouverte, setOuverte] = useState(false)
  // « À viser par moi » d'abord : dans une file de plusieurs dizaines de
  // révisions, la question posée en ouvrant est « qu'ai-je à traiter ? ».
  const [filtre, setFiltre] = useState<'toutes' | 'moi'>('toutes')

  const enAttente = arbitrages.filter(estEnAttente)
  // Ce que l'utilisateur peut viser lui-même remonte en tête : c'est sa file
  // de travail, le reste n'est que du suivi.
  const aViser = currentUser ? enAttente.filter((a) => peutViser(a, currentUser)) : []
  const listee = filtre === 'moi' ? aViser : [...aViser, ...enAttente.filter((a) => !aViser.includes(a))]
  const { page, pageCount, visible, setPage, resetPage } = usePagination(listee, 5)

  if (!currentUser || enAttente.length === 0) return null

  const changerFiltre = (valeur: 'toutes' | 'moi') => {
    setFiltre(valeur)
    resetPage()
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-semibold text-gray-900">Révisions en attente de validation</h3>
            <Badge label={`${enAttente.length}`} bg="bg-gray-100" text="text-gray-600" />
            {aViser.length > 0 && (
              <Badge label={`${aViser.length} à viser par vous`} bg="bg-amber-100" text="text-amber-700" />
            )}
          </div>
          <p className="text-xs text-gray-500 mt-1 max-w-2xl">
            Chaque révision est visée par le chef de département, puis par le directeur technique — c'est ce second
            visa qui l'applique au budget et débite la cale. Un administrateur peut viser pour l'un et l'autre.
          </p>
        </div>
        <Button onClick={() => setOuverte(true)}>
          <Inbox className="w-4 h-4 mr-2" />
          Ouvrir la file
        </Button>
      </div>

      <Modal
        isOpen={ouverte}
        onClose={() => setOuverte(false)}
        title={`Révisions en attente (${enAttente.length})`}
        maxWidth="max-w-5xl"
      >
        <div className="flex flex-wrap items-center gap-2 mb-1">
          {[
            { cle: 'toutes' as const, label: `Toutes (${enAttente.length})` },
            { cle: 'moi' as const, label: `À viser par vous (${aViser.length})` },
          ].map((onglet) => (
            <button
              key={onglet.cle}
              type="button"
              onClick={() => changerFiltre(onglet.cle)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                filtre === onglet.cle ? 'bg-primary/10 text-primary' : 'text-gray-500 hover:bg-gray-100'
              }`}
            >
              {onglet.label}
            </button>
          ))}
        </div>

        {listee.length === 0 ? (
          // Le filtre « à viser par vous » peut être vide alors que la file ne
          // l'est pas : le dire, plutôt que d'afficher une liste vide.
          <p className="py-6 text-sm text-gray-500">
            Aucune révision n'attend votre visa. Les autres restent consultables sous « Toutes ».
          </p>
        ) : (
          <>
            <div className="divide-y divide-gray-100">
              {visible.map((a) => (
                <LigneValidation key={a.id} arbitrage={a} />
              ))}
            </div>
            {/* La pagination reste affichée à une seule page : elle porte le
                décompte, qui dit combien la file compte en tout. */}
            <div className="-mx-6 -mb-6 mt-2">
              <Pagination
                page={page}
                pageCount={pageCount}
                onPageChange={setPage}
                total={listee.length}
                itemLabel="révisions"
              />
            </div>
          </>
        )}
      </Modal>
    </div>
  )
}
