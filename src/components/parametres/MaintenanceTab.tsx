import { useState } from 'react'
import { AlertTriangle, Coins, Database, Play, ScanSearch, ShoppingCart, ToggleLeft } from 'lucide-react'
import { useAuth } from '../../contexts/useAuth'
import { useNavette } from '../../contexts/useNavette'
import { Button } from '../ui/Button'
import { Input } from '../ui/Input'
import {
  migrerAnneeBudgetNavette,
  migrerStatutLignesNavette,
  migrerCommandesVersCollection,
  migrerTauxDevises,
  type ResultatMigration,
  type ResultatMigrationCommandes,
  type ResultatTauxDevises,
} from '../../lib/migrations'
import { signalerIncident } from '../../lib/incidents'
import { MatchingPortefeuilleCard } from './MatchingPortefeuilleCard'
import { formaterValeurTaux } from '../../types/devise'

// Maintenance des données — migrations ponctuelles, réservées aux admins
// (18/08/2026).
//
// Elles écrivent dans la base de production partagée `driver-6ae2b` : d'où le
// parcours en deux temps, analyser puis appliquer, et le décompte affiché
// avant toute écriture. Rien ne se déclenche au chargement de la page.

const ANNEE_PAR_DEFAUT = 2026

export function MaintenanceTab() {
  const { currentUser } = useAuth()
  const { rechargerLignes } = useNavette()
  const [annee, setAnnee] = useState(String(ANNEE_PAR_DEFAUT))
  const [resultat, setResultat] = useState<ResultatMigration | null>(null)
  const [applique, setApplique] = useState(false)
  const [enCours, setEnCours] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)

  if (currentUser?.role !== 'admin') {
    return <p className="text-sm text-gray-500">Les migrations de données sont réservées aux administrateurs.</p>
  }

  const anneeValide = /^\d{4}$/.test(annee.trim()) && Number(annee) >= 2000 && Number(annee) <= 2100

  const lancer = async (simulation: boolean) => {
    if (!anneeValide) return
    if (!simulation) {
      const confirme = window.confirm(
        `Écrire l'année ${annee} sur les lignes navette qui n'en portent pas ?\n\nCette écriture porte sur la base réelle. Les lignes qui ont déjà une année ne sont pas touchées.`
      )
      if (!confirme) return
    }
    setEnCours(true)
    setErreur(null)
    try {
      const sortie = await migrerAnneeBudgetNavette(Number(annee), { simulation })
      // La navette garde ses lignes en mémoire depuis son chargement : sans
      // cette relecture, l'écran continuerait d'afficher « Sans année » après
      // une migration réussie, jusqu'au rechargement de la page.
      if (!simulation && sortie.migres > 0) await rechargerLignes()
      setResultat(sortie)
      setApplique(!simulation)
    } catch (e) {
      // Signalée dans le bandeau comme n'importe quel échec d'écriture : une
      // migration qui échoue à mi-parcours doit se voir.
      signalerIncident('ecriture', 'La migration « année du budget » des lignes navette', e)
      setErreur(e instanceof Error ? e.message : String(e))
    } finally {
      setEnCours(false)
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="font-semibold text-gray-900">Maintenance des données</h3>
        <p className="text-xs text-gray-500 max-w-3xl mt-0.5">
          Migrations ponctuelles, déclenchées à la main. Elles écrivent dans la base réelle : chacune s'analyse avant
          de s'appliquer, et ne touche jamais un document qui porte déjà la valeur.
        </p>
      </div>

      {/* Le matching du portefeuille suit le même parcours que les migrations
          ci-dessous (analyser, puis appliquer après confirmation), mais il ne
          comble pas un champ : il pose les liens entre les trois modules. */}
      <MatchingPortefeuilleCard />

      <MigrationCommandesCard />

      <section className="carte p-4 space-y-3">
        <div className="flex items-start gap-3">
          <span className="w-9 h-9 shrink-0 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
            <Database className="w-4.5 h-4.5" />
          </span>
          <div className="min-w-0">
            <h4 className="font-semibold text-gray-900">Année du budget des lignes navette</h4>
            <p className="text-xs text-gray-500 mt-0.5">
              Le champ <code className="text-[11px]">anneeBudget</code> est saisi à la création depuis le 18/08/2026 ;
              les lignes antérieures — celles reprises du classeur — n'en portent aucune. Cette migration leur pose
              l'année choisie ci-dessous. Les lignes qui en ont déjà une sont laissées telles quelles, relancer la
              migration ne change donc rien.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <Input
            label="Année à poser"
            type="number"
            min={2000}
            max={2100}
            value={annee}
            onChange={(e) => {
              setAnnee(e.target.value)
              setResultat(null)
            }}
            className="w-40"
          />
          <Button type="button" variant="ghost" size="sm" loading={enCours} disabled={!anneeValide} onClick={() => void lancer(true)}>
            <ScanSearch className="w-4 h-4 mr-1.5" />
            Analyser
          </Button>
          <Button
            type="button"
            size="sm"
            loading={enCours}
            disabled={!anneeValide || !resultat || resultat.aMigrer === 0 || applique}
            onClick={() => void lancer(false)}
          >
            <Play className="w-4 h-4 mr-1.5" />
            Appliquer
          </Button>
        </div>

        {!resultat && (
          <p className="text-xs text-gray-400">Lancez l'analyse pour savoir combien de lignes seraient modifiées.</p>
        )}

        {resultat && (
          <div className="rounded-xl border border-gray-100 bg-gray-50/70 px-4 py-3 text-sm space-y-1">
            <p className="text-gray-700">
              {resultat.total} ligne(s) dans la collection · {resultat.dejaPourvus} déjà pourvue(s) ·{' '}
              <span className="font-semibold text-gray-900">{resultat.aMigrer}</span> sans année de budget.
            </p>
            {applique ? (
              <p className="text-emerald-700 font-medium">
                {resultat.migres} ligne(s) mises à jour avec l'année {annee}. La navette a été relue : le filtre
                « Année du budget » les propose immédiatement.
              </p>
            ) : resultat.aMigrer === 0 ? (
              <p className="text-gray-500">Rien à migrer.</p>
            ) : (
              <p className="text-gray-500">Simulation : rien n'a été écrit.</p>
            )}
          </div>
        )}

        {erreur && (
          <p className="flex items-start gap-2 text-xs text-red-700 bg-red-50 rounded-lg px-3 py-2">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            {erreur}
          </p>
        )}
      </section>

      <MigrationStatutNavette />
      <MigrationTauxDevises />
    </div>
  )
}

// Statut de vie des lignes navette (20/08/2026). La plus simple des trois :
// une seule valeur, aucun paramètre, et l'application se comporte déjà comme
// si le champ existait (une ligne sans statut est lue « en cours »). Elle sert
// à ce que le champ existe **réellement** dans la collection, pour tout ce qui
// la lit sans passer par l'application.
function MigrationStatutNavette() {
  const { rechargerLignes } = useNavette()
  const [resultat, setResultat] = useState<ResultatMigration | null>(null)
  const [applique, setApplique] = useState(false)
  const [enCours, setEnCours] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)

  const lancer = async (simulation: boolean) => {
    if (!simulation) {
      const confirme = window.confirm(
        `Écrire le statut « En cours » sur ${resultat?.aMigrer ?? 0} ligne(s) navette ?\n\nCette écriture porte sur la base réelle. Les lignes qui portent déjà un statut — y compris clôturées — ne sont pas touchées.`
      )
      if (!confirme) return
    }
    setEnCours(true)
    setErreur(null)
    try {
      const sortie = await migrerStatutLignesNavette({ simulation })
      if (!simulation && sortie.migres > 0) await rechargerLignes()
      setResultat(sortie)
      setApplique(!simulation)
    } catch (e) {
      signalerIncident('ecriture', 'La migration « statut » des lignes navette', e)
      setErreur(e instanceof Error ? e.message : String(e))
    } finally {
      setEnCours(false)
    }
  }

  return (
    <section className="carte p-4 space-y-3">
      <div className="flex items-start gap-3">
        <span className="w-9 h-9 shrink-0 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
          <ToggleLeft className="w-4.5 h-4.5" />
        </span>
        <div className="min-w-0">
          <h4 className="font-semibold text-gray-900">Statut des lignes navette</h4>
          <p className="text-xs text-gray-500 mt-0.5">
            Pose <code className="text-[11px]">statut: « en_cours »</code> sur les lignes qui n'en portent pas. Rien ne
            change à l'écran : une ligne sans statut est déjà considérée comme en cours. La migration sert à ce que le
            champ existe dans la collection. Une ligne déjà clôturée n'est jamais rouverte.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <Button type="button" variant="ghost" size="sm" loading={enCours} onClick={() => void lancer(true)}>
          <ScanSearch className="w-4 h-4 mr-1.5" />
          Analyser
        </Button>
        <Button
          type="button"
          size="sm"
          loading={enCours}
          disabled={!resultat || resultat.aMigrer === 0 || applique}
          onClick={() => void lancer(false)}
        >
          <Play className="w-4 h-4 mr-1.5" />
          Appliquer
        </Button>
      </div>

      {!resultat && <p className="text-xs text-gray-400">Lancez l'analyse pour savoir combien de lignes seraient modifiées.</p>}

      {resultat && (
        <div className="rounded-xl border border-gray-100 bg-gray-50/70 px-4 py-3 text-sm space-y-1">
          <p className="text-gray-700">
            {resultat.total} ligne(s) dans la collection · {resultat.dejaPourvus} déjà pourvue(s) ·{' '}
            <span className="font-semibold text-gray-900">{resultat.aMigrer}</span> sans statut.
          </p>
          {applique ? (
            <p className="text-emerald-700 font-medium">{resultat.migres} ligne(s) mises à jour.</p>
          ) : resultat.aMigrer === 0 ? (
            <p className="text-gray-500">Rien à migrer.</p>
          ) : (
            <p className="text-gray-500">Simulation : rien n'a été écrit.</p>
          )}
        </div>
      )}

      {erreur && (
        <p className="flex items-start gap-2 text-xs text-red-700 bg-red-50 rounded-lg px-3 py-2">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          {erreur}
        </p>
      )}
    </section>
  )
}

// Report des taux de conversion fournis dans la collection `devises`
// (19/08/2026). Séparée de la migration ci-dessus : elle ne comble pas des
// trous, elle **remplace** des taux — d'où l'analyse détaillée, valeur par
// valeur, avant d'écrire quoi que ce soit.
function MigrationTauxDevises() {
  const { currentUser } = useAuth()
  const [resultat, setResultat] = useState<ResultatTauxDevises | null>(null)
  const [applique, setApplique] = useState(false)
  const [enCours, setEnCours] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)

  const lancer = async (simulation: boolean) => {
    if (!simulation) {
      const detail = (resultat?.ecarts ?? [])
        .map((e) => `  ${e.code} : ${e.actuel === null ? 'non renseigné' : formaterValeurTaux(e.actuel)} → ${formaterValeurTaux(e.attendu)}`)
        .join('\n')
      const confirme = window.confirm(
        `Écrire ces taux dans la collection « devises » ?\n\n${detail}\n\nCette écriture porte sur la base réelle et remplace les taux existants.`
      )
      if (!confirme) return
    }
    setEnCours(true)
    setErreur(null)
    try {
      const sortie = await migrerTauxDevises(currentUser?.name ?? currentUser?.email ?? '—', { simulation })
      setResultat(sortie)
      setApplique(!simulation && sortie.migres > 0)
    } catch (e) {
      signalerIncident('ecriture', 'La migration des taux de conversion (référentiel des devises)', e)
      setErreur(e instanceof Error ? e.message : String(e))
    } finally {
      setEnCours(false)
    }
  }

  return (
    <section className="carte p-4 space-y-3">
      <div className="flex items-start gap-3">
        <span className="w-9 h-9 shrink-0 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
          <Coins className="w-4.5 h-4.5" />
        </span>
        <div className="min-w-0">
          <h4 className="font-semibold text-gray-900">Taux de conversion du référentiel des devises</h4>
          <p className="text-xs text-gray-500 mt-0.5">
            Porte les taux de référence (1 EUR = 1,2 USD, 1 USD = 546,6308 XAF) dans la collection{' '}
            <code className="text-[11px]">devises</code>. Ils s'appliquent déjà tant que le référentiel n'a jamais été
            enregistré ; cette migration sert quand il l'a été, avec d'anciennes valeurs. Seul le taux est écrit —
            libellé, décimales, état actif et devise pivot sont laissés tels quels. Une devise absente est créée.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <Button type="button" variant="ghost" size="sm" loading={enCours} onClick={() => void lancer(true)}>
          <ScanSearch className="w-4 h-4 mr-1.5" />
          Analyser
        </Button>
        <Button
          type="button"
          size="sm"
          loading={enCours}
          disabled={!resultat || resultat.ecarts.length === 0 || applique || !!resultat.blocage}
          onClick={() => void lancer(false)}
        >
          <Play className="w-4 h-4 mr-1.5" />
          Appliquer
        </Button>
      </div>

      {!resultat && <p className="text-xs text-gray-400">Lancez l'analyse pour voir les taux qui seraient modifiés.</p>}

      {resultat && (
        <div className="rounded-xl border border-gray-100 bg-gray-50/70 px-4 py-3 text-sm space-y-2">
          <p className="text-gray-700">
            {resultat.total === 0
              ? 'Collection vide : le référentiel n’a jamais été enregistré.'
              : `${resultat.total} devise(s) dans la collection.`}{' '}
            Pivot : <span className="font-semibold text-gray-900">{resultat.pivot}</span>.
          </p>

          {resultat.blocage ? (
            <p className="text-amber-700">{resultat.blocage}</p>
          ) : resultat.ecarts.length === 0 ? (
            <p className="text-gray-500">Tous les taux sont déjà à jour — rien à écrire.</p>
          ) : (
            <>
              <ul className="space-y-1">
                {resultat.ecarts.map((ecart) => (
                  <li key={ecart.code} className="flex flex-wrap items-baseline gap-2 tabular-nums">
                    <span className="font-semibold text-gray-900 w-12">{ecart.code}</span>
                    <span className="text-gray-500 line-through">
                      {ecart.actuel === null ? (ecart.existe ? 'non renseigné' : 'absente') : formaterValeurTaux(ecart.actuel)}
                    </span>
                    <span className="text-gray-400">→</span>
                    <span className="font-semibold text-gray-900">{formaterValeurTaux(ecart.attendu)}</span>
                    <span className="text-xs text-gray-400">{resultat.pivot} pour 1 {ecart.code}</span>
                  </li>
                ))}
              </ul>
              {applique ? (
                <p className="text-emerald-700 font-medium">
                  {resultat.migres} devise(s) écrite(s). Rechargez la page pour que les écrans reprennent ces taux.
                </p>
              ) : (
                <p className="text-gray-500">Simulation : rien n'a été écrit.</p>
              )}
            </>
          )}
        </div>
      )}

      {erreur && (
        <p className="flex items-start gap-2 text-xs text-red-700 bg-red-50 rounded-lg px-3 py-2">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          {erreur}
        </p>
      )}
    </section>
  )
}

/**
 * Déplacement des commandes (PO) vers leur collection autonome (25/08/2026,
 * `doc/module contrat.docx` §3).
 *
 * Contrairement aux trois autres migrations, celle-ci ne comble pas un champ :
 * elle **déplace** des objets. Deux garanties, dites à l'écran parce qu'elles
 * décident de sa sûreté : la fiche d'origine n'est pas modifiée (sa liste
 * reste en place, elle cesse simplement d'être lue), et une commande déjà
 * déplacée n'est jamais reprise — son identifiant est celui du document créé.
 */
function MigrationCommandesCard() {
  const [resultat, setResultat] = useState<ResultatMigrationCommandes | null>(null)
  const [applique, setApplique] = useState(false)
  const [enCours, setEnCours] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)

  const lancer = async (simulation: boolean) => {
    if (!simulation) {
      const confirme = window.confirm(
        `Déplacer ${resultat?.aMigrer ?? 0} commande(s) vers la collection « commandes » ?\n\nCette écriture porte sur la base réelle. Les fiches projet ne sont pas modifiées et les commandes déjà déplacées ne sont pas reprises.`
      )
      if (!confirme) return
    }
    setEnCours(true)
    setErreur(null)
    try {
      const sortie = await migrerCommandesVersCollection({ simulation })
      setResultat(sortie)
      setApplique(!simulation)
      // Pas de rechargement d'un contexte ici : `ProjectsContext` lit la
      // collection au montage, et l'écran de maintenance n'affiche aucune
      // commande. Le module Contrats les verra au prochain chargement.
    } catch (e) {
      signalerIncident('ecriture', 'La migration des commandes', e)
      setErreur(e instanceof Error ? e.message : String(e))
    } finally {
      setEnCours(false)
    }
  }

  return (
    <section className="carte p-4 space-y-3">
      <div className="flex items-start gap-3">
        <span className="w-9 h-9 shrink-0 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
          <ShoppingCart className="w-4.5 h-4.5" />
        </span>
        <div className="min-w-0">
          <h4 className="font-semibold text-gray-900">Commandes vers leur collection</h4>
          <p className="text-xs text-gray-500 mt-0.5">
            Les commandes (PO) vivaient dans le document de leur fiche projet, où une commande <em>sans</em> fiche ne
            pouvait pas exister — ce que demande le suivi des contrats de topographie et d'EPCM. Elles ont désormais
            leur propre collection. Le montant enregistré devient le <strong>montant initial</strong> : ces commandes
            n'ont jamais été augmentées dans l'application. <strong>La fiche d'origine n'est pas modifiée</strong> : sa
            liste reste en place et cesse d'être lue, rien n'est perdu si la migration est interrompue.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <Button type="button" variant="ghost" size="sm" loading={enCours} onClick={() => void lancer(true)}>
          <ScanSearch className="w-4 h-4 mr-1.5" />
          Analyser
        </Button>
        <Button
          type="button"
          size="sm"
          loading={enCours}
          disabled={!resultat || resultat.aMigrer === 0 || applique}
          onClick={() => void lancer(false)}
        >
          <Play className="w-4 h-4 mr-1.5" />
          Appliquer
        </Button>
      </div>

      {!resultat && <p className="text-xs text-gray-400">Lancez l'analyse pour savoir combien de commandes seraient déplacées.</p>}

      {resultat && (
        <div className="rounded-xl border border-gray-100 bg-gray-50/70 px-4 py-3 text-sm space-y-1">
          <p className="text-gray-700">
            {resultat.total} commande(s) dans les fiches projet · {resultat.dejaPourvus} déjà déplacée(s) ·{' '}
            <span className="font-semibold text-gray-900">{resultat.aMigrer}</span> à déplacer.
          </p>
          {/* Une commande sans contrat n'est pas un blocage, mais elle
              n'apparaîtra dans aucun contrat : autant le dire avant. */}
          {resultat.aMigrer > 0 && resultat.sansContrat > 0 && (
            <p className="text-amber-700">
              {resultat.sansContrat} d'entre elles ne sont rattachées à aucun contrat : elles resteront visibles dans
              leur fiche projet, sous « Commandes sans contrat lié ».
            </p>
          )}
          {applique ? (
            <p className="text-emerald-700 font-medium">{resultat.migres} commande(s) déplacée(s).</p>
          ) : resultat.aMigrer === 0 ? (
            <p className="text-gray-500">Rien à migrer.</p>
          ) : (
            <p className="text-gray-500">Simulation : rien n'a été écrit.</p>
          )}
        </div>
      )}

      {erreur && (
        <p className="flex items-start gap-2 text-xs text-red-700 bg-red-50 rounded-lg px-3 py-2">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          {erreur}
        </p>
      )}
    </section>
  )
}
