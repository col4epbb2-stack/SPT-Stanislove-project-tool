import { useMemo, useState } from 'react'
import { Plus } from 'lucide-react'
import type {
  LigneJournalTonnage,
  LignePersonnelTonnage,
  ParametresContratTonnage,
  PersonnelAnnexe,
} from '../../types/tonnageEchaf'
import { productiviteHabituelle } from '../../lib/tonnageEchafEngine'
import { groupeObjectif, objectifsDuJour } from '../../lib/tonnageProductivite'
import { formatNombre } from '../../lib/format'
import { usePagination } from '../../lib/usePagination'
import { avecAjouts, valeursDistinctes } from '../../lib/saisie'
import { useListesValeurs } from '../../contexts/useListesValeurs'
import { Button } from '../ui/Button'
import { Pagination } from '../ui/Pagination'
import { TableauColonnes } from '../ui/TableauColonnes'
import { BarreFiltresTableau, ChampRecherche, CompteurLignes, FiltreSelect } from '../ui/FiltresTableau'
import { ModaleSuppression } from '../ui/ModaleSuppression'
import { PersonnelTonnageSaisieForm, type PersonnelTonnageSaisieInput } from './PersonnelTonnageSaisieForm'
import { colonnesPersonnel } from './colonnes'

// Onglet "Suivi personnel" — extrait de pages/TonnageEchafPage.tsx le
// 06/08/2026, et doté à cette occasion de son propre point de saisie
// (cf. PersonnelTonnageSaisieForm) : c'était le seul onglet opérationnel du
// module encore en lecture seule alors qu'il porte le NPT, donnée clé de la
// valorisation du contrat.

const PAGE_SIZE = 20

export function PersonnelTab({
  personnel,
  personnelAnnexe,
  parametres,
  journal,
  onEnregistrer,
  onSupprimer,
  ouvertureDemandee,
}: {
  personnel: LignePersonnelTonnage[]
  personnelAnnexe: PersonnelAnnexe
  parametres: ParametresContratTonnage
  /** Journal montage/dépose — filtre le menu « Projet » au jour saisi et en
   *  déduit le service (03/09/2026, lot 5, TON1-29). */
  journal: LigneJournalTonnage[]
  onEnregistrer: (input: PersonnelTonnageSaisieInput) => Promise<void>
  onSupprimer: (ligne: LignePersonnelTonnage) => Promise<void>
  /**
   * Ouvre le formulaire de création, préremplie sur cette date et ce champ
   * (03/09/2026, lot 3 — bouton « Ajouter » d'un rapport journalier). Un
   * nouvel objet à chaque demande, comparé par référence.
   */
  ouvertureDemandee?: { date: string; champ: string } | null
}) {
  const [filtreChamp, setFiltreChamp] = useState('')
  const [filtreProfil, setFiltreProfil] = useState('')
  const [recherche, setRecherche] = useState('')
  const [formOuvert, setFormOuvert] = useState(false)
  const [ligneASupprimer, setLigneASupprimer] = useState<LignePersonnelTonnage | null>(null)

  // Ouverture pilotée depuis l'extérieur — même pattern que JournalTab.
  const [ouvertureAppliquee, setOuvertureAppliquee] = useState<typeof ouvertureDemandee>(undefined)
  if (ouvertureDemandee && ouvertureDemandee !== ouvertureAppliquee) {
    setOuvertureAppliquee(ouvertureDemandee)
    setFormOuvert(true)
  }

  const { valeursDe } = useListesValeurs()
  const champs = useMemo(() => valeursDistinctes(personnel, 'champs'), [personnel])
  const profils = useMemo(() => valeursDistinctes(personnel, 'profil'), [personnel])
  const sites = useMemo(() => valeursDistinctes(personnel, 'site'), [personnel])
  const services = useMemo(() => valeursDistinctes(personnel, 'services'), [personnel])
  const projets = useMemo(() => valeursDistinctes(personnel, 'projet'), [personnel])
  const numerosDemande = useMemo(() => valeursDistinctes(personnel, 'numeroDemande'), [personnel])
  // Les noms proposés à la saisie viennent des pointages existants ET de
  // l'équipe Core crew des annexes (une recrue n'a pas encore de pointage).
  const noms = useMemo(
    () => [...new Set([...valeursDistinctes(personnel, 'nom'), ...personnelAnnexe.equipeCoreCrew.map((m) => m.nom)])].sort(),
    [personnel, personnelAnnexe]
  )

  // Le modèle du document appliqué à tous les pointages : l'objectif d'une
  // personne dépend de l'effectif pointé le même jour sur le même champ, il ne
  // peut donc pas se calculer ligne à ligne. Seules les lignes saisies dans
  // l'application affichent le résultat (cf. colonnesAffichees) — les 3 384
  // lignes importées gardent les valeurs du classeur.
  const objectifs = useMemo(() => objectifsDuJour(personnel, parametres), [personnel, parametres])

  // Effectif déjà pointé un jour donné sur un champ donné — le formulaire s'en
  // sert pour montrer, pendant la saisie, l'objectif que la personne ajoutée
  // recevra et celui que les autres deviennent (« une ressource est ajoutée »,
  // §A10).
  const parJourChamp = useMemo(() => {
    const index = new Map<string, LignePersonnelTonnage[]>()
    for (const l of personnel) {
      const g = groupeObjectif(l)
      index.set(g, [...(index.get(g) ?? []), l])
    }
    return index
  }, [personnel])
  const effectifDuJour = (date: string, champ: string | null) =>
    parJourChamp.get(groupeObjectif({ date, champs: champ })) ?? []

  const filtered = useMemo(() => {
    const q = recherche.trim().toLowerCase()
    return personnel.filter(
      (l) =>
        (!filtreChamp || l.champs === filtreChamp) &&
        (!filtreProfil || l.profil === filtreProfil) &&
        (!q || `${l.nom ?? ''} ${l.projet ?? ''} ${l.site ?? ''} ${l.numeroDemande ?? ''}`.toLowerCase().includes(q))
    )
  }, [personnel, filtreChamp, filtreProfil, recherche])

  const { page, pageCount, visible, setPage, resetPage } = usePagination(filtered, PAGE_SIZE)

  const filtrer = (setter: (v: string) => void) => (v: string) => {
    setter(v)
    resetPage()
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-200">
            <h3 className="font-semibold text-gray-900">Heures de productivité</h3>
            {/* Valeurs du classeur, en lecture. Le modèle contractuel
                (objectif journalier, équipe de référence, coefficients par
                profil, forfaits) se déclare depuis le 03/09/2026 dans
                Paramètres › Tonnage échafaudage — il n'alimente pas encore ces
                colonnes, c'est le lot suivant du recueil rev01. */}
            <p className="text-xs text-gray-400">
              Valeurs du classeur, en lecture. Le modèle de productivité du contrat (objectif journalier, équipe de
              référence, coefficients par profil) se déclare dans Paramètres › Tonnage échafaudage.
            </p>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-gray-500">
                <th className="px-5 py-2 font-medium">Champ</th>
                <th className="px-5 py-2 font-medium text-right">Heures / jour</th>
                <th className="px-5 py-2 font-medium text-right">Objectif (kg/h)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {personnelAnnexe.heuresProductivite.map((h) => (
                <tr key={h.champ}>
                  <td className="px-5 py-2 font-medium text-gray-900">{h.champ}</td>
                  <td className="px-5 py-2 text-right text-gray-600">{formatNombre(h.heuresParJour)}</td>
                  <td className="px-5 py-2 text-right text-gray-600">{formatNombre(h.objectifKgParHeure, 2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 p-5">
          <p className="text-sm text-gray-500 mb-2">Objectif de production</p>
          <p className="text-2xl font-bold text-gray-900">
            {formatNombre(personnelAnnexe.objectifProductionKgParHeureHomme)} kg/h/homme
          </p>
          <p className="text-xs text-gray-400 mt-2">Référence de la feuille "Suivi personnel"</p>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-200">
            <h3 className="font-semibold text-gray-900">Équipe Core crew ({personnelAnnexe.equipeCoreCrew.length})</h3>
          </div>
          <div className="max-h-44 overflow-y-auto">
            <table className="w-full text-sm">
              <tbody className="divide-y divide-gray-100">
                {personnelAnnexe.equipeCoreCrew.map((m) => (
                  <tr key={m.nom}>
                    <td className="px-5 py-2 text-gray-900">{m.nom}</td>
                    <td className="px-5 py-2 text-right text-gray-500">{m.profil}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
        <BarreFiltresTableau>
          <Button type="button" size="sm" onClick={() => setFormOuvert(true)} className="gap-1.5">
            <Plus className="w-4 h-4" />
            Nouveau pointage
          </Button>
          <FiltreSelect label="Champ" value={filtreChamp} onChange={filtrer(setFiltreChamp)} options={champs} />
          <FiltreSelect label="Profil" value={filtreProfil} onChange={filtrer(setFiltreProfil)} options={profils} />
          <ChampRecherche
            value={recherche}
            onChange={filtrer(setRecherche)}
            placeholder="Nom, projet, site, n° demande..."
          />
          <CompteurLignes filtrees={formatNombre(filtered.length)} total={formatNombre(personnel.length)} />
        </BarreFiltresTableau>

        <TableauColonnes
          colonnes={colonnesPersonnel((l) => setLigneASupprimer(l), objectifs)}
          lignes={visible}
          cleLigne={(l) => l.id}
          exportation={{ nomFichier: 'tonnage-suivi-personnel', titre: 'Suivi du personnel', lignes: filtered }}
        />

        <Pagination page={page} pageCount={pageCount} onPageChange={setPage} />
      </div>

      <PersonnelTonnageSaisieForm
        isOpen={formOuvert}
        onClose={() => setFormOuvert(false)}
        onSubmit={onEnregistrer}
        annexe={personnelAnnexe}
        parametres={parametres}
        journal={journal}
        effectifDuJour={effectifDuJour}
        productivitePourProfil={(profil) => productiviteHabituelle(profil, personnel)}
        defaut={
          ouvertureDemandee
            ? { date: ouvertureDemandee.date, champs: ouvertureDemandee.champ }
            : undefined
        }
        suggestions={{
          champs: avecAjouts(champs, valeursDe('commun.champs')),
          sites: avecAjouts(sites, valeursDe('tonnage.sites')),
          services: avecAjouts(services, valeursDe('commun.services')),
          profils: avecAjouts(profils, valeursDe('tonnage.profils')),
          noms,
          projets,
          numerosDemande,
        }}
      />

      {ligneASupprimer && (
        <ModaleSuppression
          titre={`Supprimer le pointage de « ${ligneASupprimer.nom ?? ligneASupprimer.id} »`}
          message="Cette saisie sera supprimée définitivement."
          avertissements={[
            'Si cette ligne provenait du classeur importé, elle réapparaîtra avec ses valeurs d\'origine — seule la saisie est retirée. Sinon, elle disparaît du tableau.',
          ]}
          libelleBouton="Supprimer"
          onFerme={() => setLigneASupprimer(null)}
          onConfirmer={async () => {
            await onSupprimer(ligneASupprimer)
            setLigneASupprimer(null)
          }}
        />
      )}
    </div>
  )
}
