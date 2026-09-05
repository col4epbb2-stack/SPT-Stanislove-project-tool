import { useContext } from 'react'
import { LiaisonContext } from './liaison-context'

export function useLiaison() {
  const ctx = useContext(LiaisonContext)
  if (!ctx) throw new Error('useLiaison must be used within a LiaisonProvider')
  return ctx
}
