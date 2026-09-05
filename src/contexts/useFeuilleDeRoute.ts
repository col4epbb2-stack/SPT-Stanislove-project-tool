import { useContext } from 'react'
import { FeuilleDeRouteContext } from './feuille-de-route-context'

export function useFeuilleDeRoute() {
  const ctx = useContext(FeuilleDeRouteContext)
  if (!ctx) throw new Error('useFeuilleDeRoute must be used within a FeuilleDeRouteProvider')
  return ctx
}
