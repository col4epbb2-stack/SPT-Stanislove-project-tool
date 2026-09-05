import { useContext } from 'react'
import { DevisesContext } from './devises-context'

export function useDevises() {
  const ctx = useContext(DevisesContext)
  if (!ctx) throw new Error('useDevises must be used within a DevisesProvider')
  return ctx
}
