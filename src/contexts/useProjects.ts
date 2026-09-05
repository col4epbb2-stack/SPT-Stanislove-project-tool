import { useContext } from 'react'
import { ProjectsContext } from './projects-context'

export function useProjects() {
  const ctx = useContext(ProjectsContext)
  if (!ctx) throw new Error('useProjects must be used within a ProjectsProvider')
  return ctx
}
