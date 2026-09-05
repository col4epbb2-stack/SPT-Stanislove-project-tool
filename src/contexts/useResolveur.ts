import { useMemo } from 'react'
import { creerResolveur } from '../lib/liaison'
import type { Resolveur } from '../lib/liaison'
import { useProjects } from './useProjects'
import { useNavette } from './useNavette'
import { useLiaison } from './useLiaison'

// Résolveur mémoïsé sur l'état courant : fiches projet (clés naturelles),
// lignes navette (héritage du codeOTP), registre des confirmations manuelles
// et table d'alias. Reconstruit uniquement quand l'une de ces sources change.
export function useResolveur(): Resolveur {
  const { projects } = useProjects()
  const { lignes } = useNavette()
  const { liaisons, aliases } = useLiaison()

  return useMemo(
    () => creerResolveur({ projets: projects, lignesNavette: lignes, liaisons, aliases }),
    [projects, lignes, liaisons, aliases]
  )
}
