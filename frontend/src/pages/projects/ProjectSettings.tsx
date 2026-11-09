import { useLocation } from 'react-router-dom'
import { getArea } from '@/lib/routes'
import BrandsPage from './brands/BrandsPage'
import EnvironmentsPage from './environments/EnvironmentsPage'
import ProjectSettingsPage from './settings/ProjectSettingsPage'

/**
 * Router entry for `/projects/:projectId/{environments,brands,settings}`: renders
 * the page of the current segment. Once the router points each route at its
 * page directly, this dispatcher can go.
 */
export default function ProjectSettings() {
  const { pathname } = useLocation()
  const area = getArea(pathname)
  const section = area.area === 'project' ? area.section : 'settings'
  // `key` remounts on a section change so no state leaks between the pages.
  if (section === 'environments') return <EnvironmentsPage key="environments" />
  if (section === 'brands') return <BrandsPage key="brands" />
  return <ProjectSettingsPage key="settings" />
}
