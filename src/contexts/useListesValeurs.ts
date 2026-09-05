import { useContext } from 'react'
import { ListesValeursContext } from './listes-valeurs-context'

export function useListesValeurs() {
  const ctx = useContext(ListesValeursContext)
  if (!ctx) throw new Error('useListesValeurs must be used within a ListesValeursProvider')
  return ctx
}
