import { useState } from 'react'
import { Archive, History, Pencil, RotateCcw, Table2, Trash2 } from 'lucide-react'
import { Modal } from '../ui/Modal'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import type { ArbitrageNavette, CycleBudgetId, LigneNavette } from '../../types/navette'
import {
  RUBRIQUE_NIV1_COLORS,
  RUBRIQUE_NIV2_LABELS,
  CYCLE_BUDGET_ORDER,
  CYCLE_BUDGET_LABELS,
  CYCLES_ARBITRABLES,
  STATUT_ARBITRAGE_LABELS,
  STATUT_LIGNE_COLORS,
  STATUT_LIGNE_LABELS,
  statutLigne,
  estArbitrageDisponible,
  estEnAttente,
  historiqueRealiseYTD,
  peutAjuster,
  totalBudget,
  visasDuMemeAuteur,
} from '../../types/navette'

import { TYPE_LABELS } from '../../types/project'
import { uniteMontant } from '../../types/devise'
import { useAuth } from '../../contexts/useAuth'
import { useNavette } from '../../contexts/useNavette'
import { ArbitrageModal } from './ArbitrageModal'
import { NavetteLigneEditModal } from './NavetteLigneEditModal'
import { NavetteLigneSuppressionModal } from './NavetteLigneSuppressionModal'
import { HistoriqueRealiseYTD } from './HistoriqueRealiseYTD'
import { Onglets } from '../ui/Onglets'
import { useMontant } from '../../lib/montantAffiche'

interface NavetteLigneDetailModalProps {
  ligne: LigneNavette | null
  onClose: () => void
  onCreerProjet: (ligne: LigneNavette) => void
}

export function NavetteLigneDetailModal({ ligne, onClose, onCreerProjet }: NavetteLigneDetailModalProps) {
  const { montant: formatMontant } = useMontant()
  const { currentUser, users } = useAuth()
  const { arbitrages, definirStatutLigne } = useNavette()
  const [revision, setRevision] = useState<{ cycleId: CycleBudgetId; correctif: boolean } | null>(null)
  // Correction des informations de création (21/08/2026) — distincte d'une
  // révision, qui porte sur un cycle budgétaire et passe par deux visas.
  const [edition, setEdition] = useState(false)
  // Réajustement d'une proposition encore en attente (23/08/2026) — le même
  // formulaire que la révision, prérempli avec ce qui a été proposé.
  const [ajustement, setAjustement] = useState<ArbitrageNavette | null>(null)
  const [statutEnCours, setStatutEnCours] = useState(false)
  // Suppression définitive de la ligne (04/09/2026) — distincte de la clôture,
  // réversible, ci-dessus.
  const [suppression, setSuppression] = useState(false)
  // Deux vues d'une même ligne : ce que vaut son budget cycle par cycle, et
  // ce qu'a valu son réalisé à date à chaque révision appliquée (23/08/2026).
  // Empilées, elles faisaient deux grands tableaux dans une seule modale.
  const [onglet, setOnglet] = useState<'budget' | 'realise'>('budget')
  const [erreurStatut, setErreurStatut] = useState<string | null>(null)
  if (!ligne) return null

  const isAdmin = currentUser?.role === 'admin'
  const colors = RUBRIQUE_NIV1_COLORS[ligne.rubriqueNiv1]
  const chargeAffaire = users.find((u) => u.id === ligne.chargeAffaireId)
  const nomUtilisateur = (id?: string) => (id ? users.find((u) => u.id === id)?.name ?? '—' : '—')
  // Révisions déjà traitées de la ligne (validées ou refusées) — sert de
  // "conserver l'historique complet des révisions" (retour utilisateur),
  // sans écran séparé : les arbitrages sont déjà chargés dans le contexte.
  const statutCourant = statutLigne(ligne)

  // Clôturer n'est pas supprimer : la ligne garde ses cycles, ses révisions
  // et son historique — elle sort du travail courant, et le geste se défait.
  const basculerStatut = async () => {
    setErreurStatut(null)
    setStatutEnCours(true)
    try {
      await definirStatutLigne(ligne.id, statutCourant === 'cloture' ? 'en_cours' : 'cloture')
    } catch (e) {
      setErreurStatut(e instanceof Error ? e.message : 'Le statut n’a pas pu être enregistré.')
    } finally {
      setStatutEnCours(false)
    }
  }

  const historique = arbitrages
    .filter((a) => a.ligneId === ligne.id && !estEnAttente(a))
    .sort((a, b) => (b.traiteLe ?? b.creeLe).localeCompare(a.traiteLe ?? a.creeLe))

  return (
    <Modal isOpen={!!ligne} onClose={onClose} title={ligne.libelle} maxWidth="max-w-6xl">
      <div className="space-y-6">
        {/* Le crayon des autres fiches de l'application (retour utilisateur du
            21/08/2026). Réservé aux admins, comme l'exige `firestore.rules` :
            `lignes_navette` est en `allow update: if estAdmin()` — le proposer
            à un agent ne produirait qu'un refus des règles. */}
        {isAdmin && (
          <div className="flex justify-end -mb-3">
            <button
              type="button"
              onClick={() => setEdition(true)}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline"
            >
              <Pencil className="w-3.5 h-3.5" />
              Modifier les informations
            </button>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <Badge label={ligne.rubriqueNiv1} bg={colors.bg} text={colors.text} />
          <Badge label={RUBRIQUE_NIV2_LABELS[ligne.rubriqueNiv2]} bg="bg-gray-100" text="text-gray-700" />
          <Badge label={ligne.codeOTP} bg="bg-primary/10" text="text-primary" />
          {ligne.champ && <Badge label={ligne.champ} bg="bg-gray-100" text="text-gray-600" />}
          {/* Exercice décrit par les 8 cycles ci-dessous — saisi à la création
              depuis le 18/08/2026, absent des lignes reprises du classeur. */}
          {ligne.anneeBudget != null && (
            <Badge label={`Budget ${ligne.anneeBudget}`} bg="bg-accent/15" text="text-accent" />
          )}
          {/* Statut de vie (20/08/2026) — affiché pour tous, modifiable par
              les seuls admins, comme la cale et les autres décisions qui
              engagent la ligne. */}
          <Badge
            label={STATUT_LIGNE_LABELS[statutCourant]}
            bg={STATUT_LIGNE_COLORS[statutCourant].bg}
            text={STATUT_LIGNE_COLORS[statutCourant].text}
            dot={STATUT_LIGNE_COLORS[statutCourant].dot}
          />
        </div>
        
        {/* Le type de projet prend la place du « Programme » (23/08/2026,
            demande explicite) : c'est lui qui se saisit à la création et se
            corrige dans la modale de modification, quand `programme` est une
            colonne du classeur (« Rubr » de la feuille ICP) que rien ne
            renseigne depuis l'application — elle reste sur le modèle et sur
            les lignes importées, simplement plus affichée. */}
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-gray-500">Type de projet</p>
            <p className="font-medium text-gray-900">{TYPE_LABELS[ligne.type]}</p>
          </div>
          <div>
            <p className="text-gray-500">Chargé d'affaires</p>
            <p className="font-medium text-gray-900">{chargeAffaire?.name ?? '—'}</p>
          </div>
        </div>

        <Onglets
          onglets={[
            { key: 'budget' as const, label: 'Budget & révisions', icone: Table2 },
            {
              key: 'realise' as const,
              label: 'Réalisé à date (YTD)',
              icone: History,
              compteur: historiqueRealiseYTD(arbitrages, ligne.id).length,
            },
          ]}
          actif={onglet}
          onChange={setOnglet}
          ariaLabel="Vues de la ligne navette"
        />

        {onglet === 'budget' && (
          <div className="space-y-6">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 text-left text-gray-500">
                    <th className="py-2 pr-3 font-medium">Cycle</th>
                    <th className="py-2 px-3 font-medium">CONSO</th>
                    <th className="py-2 px-3 font-medium">SERV</th>
                    <th className="py-2 px-3 font-medium">LOG</th>
                    <th className="py-2 px-3 font-medium">PERS</th>
                    <th className="py-2 px-3 font-medium">AUTRES</th>
                    <th className="py-2 pl-3 font-medium text-right">Total</th>
                    <th className="py-2 pl-3 font-medium">Révision</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {(() => {
                    // Une seule révision en attente à la fois pour la ligne,
                    // tous cycles confondus (cf. NavetteContext.proposerArbitrage)
                    // — les autres cycles n'affichent pas de bouton "Réviser"
                    // tant que celle-ci n'est pas traitée.
                    const arbitragePendingLigne = arbitrages.find((a) => a.ligneId === ligne.id && estEnAttente(a))
                    // Les cycles d'une ligne sont comptés en milliers de SA
                    // devise — « KUSD » y était écrit en dur, faux pour une ligne
                    // en euros (18/08/2026).
                    const unite = uniteMontant(ligne.devise, 'millier')
                    return CYCLE_BUDGET_ORDER.map((key) => {
                      const periode = ligne.cycles[key]
                      return (
                        <tr key={key}>
                          <td className="py-2 pr-3 text-gray-600">{CYCLE_BUDGET_LABELS[key]}</td>
                          <td className="py-2 px-3 text-gray-900">{formatMontant(periode.conso, unite)}</td>
                          <td className="py-2 px-3 text-gray-900">{formatMontant(periode.serv, unite)}</td>
                          <td className="py-2 px-3 text-gray-900">{formatMontant(periode.log, unite)}</td>
                          <td className="py-2 px-3 text-gray-900">{formatMontant(periode.pers, unite)}</td>
                          <td className="py-2 px-3 text-gray-900">{formatMontant(periode.autres, unite)}</td>
                          <td className="py-2 pl-3 text-right font-semibold text-gray-900">
                            {formatMontant(totalBudget(periode), unite)}
                          </td>
                          <td className="py-2 pl-3 whitespace-nowrap">
                            {!CYCLES_ARBITRABLES.includes(key) ? null : arbitragePendingLigne?.cycleId === key ? (
                              <div className="flex flex-col items-start gap-1">
                                <Badge
                                  label={STATUT_ARBITRAGE_LABELS[arbitragePendingLigne.statut]}
                                  bg="bg-amber-100"
                                  text="text-amber-700"
                                />
                                {/* Corriger la proposition sans en créer une seconde : un
                                    cycle n'accepte qu'une révision en attente à la fois,
                                    sans quoi la seule issue était de la refuser puis de
                                    tout ressaisir. */}
                                {currentUser && peutAjuster(arbitragePendingLigne, currentUser) && (
                                  <button
                                    onClick={() => setAjustement(arbitragePendingLigne)}
                                    className="text-xs font-semibold text-primary hover:underline"
                                  >
                                    Réajuster
                                  </button>
                                )}
                              </div>
                            ) : arbitragePendingLigne ? (
                              <span className="text-xs text-gray-400">Bloqué (révision en attente)</span>
                            ) : (
                              // 04/09/2026, demande explicite : une révision de PDC est
                              // désormais possible à tout moment, peu importe la période —
                              // le bouton "Réviser" n'est plus gardé par
                              // `estArbitrageDisponible`. La fenêtre habituelle reste
                              // affichée à titre indicatif (hors fenêtre = information,
                              // jamais un blocage), et le correctif admin (application
                              // immédiate, sans les deux visas) reste disponible en plus,
                              // à tout moment lui aussi.
                              <div className="flex flex-col items-start gap-1">
                                <button
                                  onClick={() => setRevision({ cycleId: key, correctif: false })}
                                  className="text-xs font-semibold text-accent hover:underline"
                                >
                                  Réviser
                                </button>
                                {!estArbitrageDisponible(key) && (
                                  <span className="text-[11px] text-gray-400">hors fenêtre habituelle</span>
                                )}
                                {isAdmin && (
                                  <button
                                    onClick={() => setRevision({ cycleId: key, correctif: true })}
                                    className="text-xs font-semibold text-amber-600 hover:underline"
                                  >
                                    Réviser (correctif)
                                  </button>
                                )}
                              </div>
                            )}
                          </td>
                        </tr>
                      )
                    })
                  })()}
                </tbody>
              </table>
            </div>

            {historique.length > 0 && (
              <div>
                <p className="text-sm font-medium text-gray-500 mb-2">Historique des révisions</p>
                <div className="divide-y divide-gray-100 border border-gray-100 rounded-xl overflow-hidden">
                  {historique.map((a) => (
                    <div key={a.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                      <div>
                        <p className="text-gray-900">
                          {CYCLE_BUDGET_LABELS[a.cycleId]} · {formatMontant(a.montant, `K${ligne.devise}`)}
                        </p>
                        <p className="text-xs text-gray-500">
                          {a.statut === 'valide' ? 'Validée' : 'Refusée'} par {nomUtilisateur(a.traiteParId)}
                          {a.traiteLe && ` le ${new Date(a.traiteLe).toLocaleDateString('fr-FR')}`}
                        </p>
                        {/* Le parcours à deux visas n'existe que depuis le
                            11/08/2026 : les révisions plus anciennes n'en portent
                            aucun, on n'affiche donc la ligne que si elle existe. */}
                        {a.visaChefDepartement && (
                          <p className="text-xs text-gray-400">
                            Visa chef de département : {nomUtilisateur(a.visaChefDepartement.parId)} le{' '}
                            {new Date(a.visaChefDepartement.le).toLocaleDateString('fr-FR')}
                          </p>
                        )}
                        {/* Depuis le 23/08/2026 un admin peut poser les deux visas :
                            ce n'est plus la règle qui garantit la double validation,
                            c'est la trace — encore faut-il qu'elle se lise. */}
                        {visasDuMemeAuteur(a) && (
                          <p className="text-xs text-amber-600">
                            Les deux visas ont été posés par la même personne (administrateur).
                          </p>
                        )}
                        {a.motifRefus && <p className="text-xs text-red-600">Motif : {a.motifRefus}</p>}
                      </div>
                      <Badge
                        label={a.statut === 'valide' ? 'Validée' : 'Refusée'}
                        bg={a.statut === 'valide' ? 'bg-green-100' : 'bg-red-100'}
                        text={a.statut === 'valide' ? 'text-green-700' : 'text-red-700'}
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {(ligne.hypothesesPDC09 || ligne.hypothesesBUN1) && (
              <div className="space-y-3 text-sm">
                {ligne.hypothesesPDC09 && (
                  <div>
                    <p className="text-gray-500 mb-1">Hypothèses PDC09</p>
                    <p className="text-gray-800">{ligne.hypothesesPDC09}</p>
                  </div>
                )}
                {ligne.hypothesesBUN1 && (
                  <div>
                    <p className="text-gray-500 mb-1">Hypothèses BU N+1</p>
                    <p className="text-gray-800">{ligne.hypothesesBUN1}</p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {onglet === 'realise' && (
          <HistoriqueRealiseYTD ligne={ligne} arbitrages={arbitrages} nomUtilisateur={nomUtilisateur} />
        )}

        {erreurStatut && <p className="text-sm text-red-600">{erreurStatut}</p>}

        <div className="flex flex-wrap justify-end items-center gap-3 pt-2">
          {isAdmin && (
            <button
              type="button"
              onClick={() => setSuppression(true)}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-red-600 hover:underline"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Supprimer la ligne
            </button>
          )}
          {isAdmin && (
            <Button type="button" variant="ghost" loading={statutEnCours} onClick={() => void basculerStatut()}>
              {statutCourant === 'cloture' ? (
                <>
                  <RotateCcw className="w-4 h-4 mr-2" />
                  Rouvrir la ligne
                </>
              ) : (
                <>
                  <Archive className="w-4 h-4 mr-2" />
                  Clôturer la ligne
                </>
              )}
            </Button>
          )}
          {ligne.projetId ? (
            <Badge label="Fiche projet liée" bg="bg-green-100" text="text-green-700" />
          ) : (
            <Button onClick={() => onCreerProjet(ligne)}>Lier / créer la fiche projet</Button>
          )}
        </div>
      </div>

      {edition && (
        <NavetteLigneEditModal ligne={ligne} isOpen={edition} onClose={() => setEdition(false)} />
      )}

      {ajustement && (
        <ArbitrageModal
          ligne={ligne}
          cycleId={ajustement.cycleId}
          arbitrageAAjuster={ajustement}
          isOpen={!!ajustement}
          onClose={() => setAjustement(null)}
        />
      )}

      {revision && (
        <ArbitrageModal
          ligne={ligne}
          cycleId={revision.cycleId}
          correctif={revision.correctif}
          isOpen={!!revision}
          onClose={() => setRevision(null)}
        />
      )}

      {suppression && (
        <NavetteLigneSuppressionModal
          ligne={ligne}
          onFerme={() => setSuppression(false)}
          onSupprime={() => {
            setSuppression(false)
            // La ligne n'existe plus : fermer aussi la fiche de détail, sinon
            // elle continuerait d'afficher sa dernière copie captée au clic.
            onClose()
          }}
        />
      )}
    </Modal>
  )
}
