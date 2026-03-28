import {
  FunnelIcon,
  MagnifyingGlassIcon,
} from '@heroicons/react/24/outline'
import { useTranslation } from 'react-i18next'

interface FlagFiltersProps {
  searchTerm: string
  selectedProject: string
  selectedEnvironment: string
  projectNames: string[]
  environments: string[]
  onSearchChange: (value: string) => void
  onProjectChange: (value: string) => void
  onEnvironmentChange: (value: string) => void
}

export default function FlagFilters({
  searchTerm,
  selectedProject,
  selectedEnvironment,
  projectNames,
  environments,
  onSearchChange,
  onProjectChange,
  onEnvironmentChange,
}: FlagFiltersProps) {
  const { t } = useTranslation()
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
      <div className="relative flex-1 max-w-lg">
        <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
          <MagnifyingGlassIcon className="h-5 w-5 text-muted-foreground" />
        </div>
        <input
          type="search"
          id="search"
          placeholder={t('feature-flags.search-placeholder')}
          value={searchTerm}
          onChange={(e) => onSearchChange(e.target.value)}
          className="block w-full rounded-md border border-input bg-background pl-10 shadow-sm focus:border-primary focus:ring-primary sm:text-sm"
        />
      </div>
      <div className="flex items-center space-x-2">
        <FunnelIcon className="h-5 w-5 text-muted-foreground" />
        <select
          value={selectedProject}
          onChange={(e) => onProjectChange(e.target.value)}
          className="rounded-md border border-input bg-background shadow-sm focus:border-primary focus:ring-primary sm:text-sm"
        >
          <option value="all">{t('feature-flags.filter.all-projects')}</option>
          {projectNames.map((project) => (
            <option key={project} value={project}>
              {project}
            </option>
          ))}
        </select>
        <select
          value={selectedEnvironment}
          onChange={(e) => onEnvironmentChange(e.target.value)}
          className="rounded-md border border-input bg-background shadow-sm focus:border-primary focus:ring-primary sm:text-sm"
        >
          <option value="all">{t('feature-flags.filter.all-environments')}</option>
          {environments.map((env) => (
            <option key={env} value={env}>
              {env}
            </option>
          ))}
        </select>
      </div>
    </div>
  )
}
