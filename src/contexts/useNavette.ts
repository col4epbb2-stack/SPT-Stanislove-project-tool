import { useContext } from 'react'
import { NavetteContext } from './navette-context'

export function useNavette() {
  const ctx = useContext(NavetteContext)
  if (!ctx) throw new Error('useNavette must be used within a NavetteProvider')
  return ctx
}
