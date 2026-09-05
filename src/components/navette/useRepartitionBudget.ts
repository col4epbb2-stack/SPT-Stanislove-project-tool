import { useState } from 'react'
import type { BudgetPeriode } from '../../types/navette'

export type SectionBU = keyof BudgetPeriode
export const SECTIONS: SectionBU[] = ['conso', 'serv', 'log', 'pers', 'autres']
export const SECTION_LABELS: Record<SectionBU, string> = { conso: 'CONSO', serv: 'SERV', log: 'LOG', pers: 'PERS', autres: 'AUTRES' }

export interface RepartitionBudgetState {
  budgetInitial: string
  setBudgetInitial: (v: string) => void
  budgetTotal: number
  conso: string
  setConso: (v: string) => void
  serv: string
  setServ: (v: string) => void
  log: string
  setLog: (v: string) => void
  pers: string
  setPers: (v: string) => void
  autres: string
  setAutres: (v: string) => void
  repartition: BudgetPeriode
  sommeRepartie: number
  ecart: number
  repartitionValide: boolean
  reset: () => void
}

// État + logique du mécanisme "montant + répartition" du principe directeur
// (docs/navette.md) — partagé entre la création d'une ligne navette
// (NewNavetteLigneModal) et la proposition d'un arbitrage (ArbitrageModal),
// qui "reprend le premier principe" sur un cycle PDC donné. Répartition
// exclusivement manuelle (le mode automatique a été retiré) : les 5
// sections sont saisies à la main, avec point de contrôle sur la somme.
export function useRepartitionBudget(): RepartitionBudgetState {
  const [budgetInitial, setBudgetInitial] = useState('')
  const [conso, setConso] = useState('0')
  const [serv, setServ] = useState('0')
  const [log, setLog] = useState('0')
  const [pers, setPers] = useState('0')
  const [autres, setAutres] = useState('0')

  const budgetTotal = Number(budgetInitial) || 0

  const repartition: BudgetPeriode = {
    conso: Number(conso) || 0,
    serv: Number(serv) || 0,
    log: Number(log) || 0,
    pers: Number(pers) || 0,
    autres: Number(autres) || 0,
  }

  const sommeRepartie = repartition.conso + repartition.serv + repartition.log + repartition.pers + repartition.autres
  // Point de contrôle du principe directeur : la somme des 5 sections doit
  // toujours égaler le budget initial saisi.
  const ecart = Math.round((sommeRepartie - budgetTotal) * 100) / 100
  const repartitionValide = budgetTotal > 0 && ecart === 0

  const reset = () => {
    setBudgetInitial('')
    setConso('0')
    setServ('0')
    setLog('0')
    setPers('0')
    setAutres('0')
  }

  return {
    budgetInitial,
    setBudgetInitial,
    budgetTotal,
    conso,
    setConso,
    serv,
    setServ,
    log,
    setLog,
    pers,
    setPers,
    autres,
    setAutres,
    repartition,
    sommeRepartie,
    ecart,
    repartitionValide,
    reset,
  }
}
