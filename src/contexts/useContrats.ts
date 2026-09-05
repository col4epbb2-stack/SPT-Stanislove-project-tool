import { useContext } from 'react'
import { ContratsContext } from './contrats-context'

export function useContrats() {
  const ctx = useContext(ContratsContext)
  if (!ctx) throw new Error('useContrats must be used within a ContratsProvider')
  return ctx
}
