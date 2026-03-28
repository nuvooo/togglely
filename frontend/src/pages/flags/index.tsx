import {
  FlagIcon,
  PlusIcon,
} from '@heroicons/react/24/outline'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router-dom'
import api from '@/lib/api'
import { getErrorMessage } from '@/lib/errors'
import { toast } from 'sonner'
import FlagCard from './FlagCard'
import FlagFilters from './FlagFilters'
import CreateFlagDialog from './CreateFlagDialog'
import type { FeatureFlag, NewFlagData, Project } from './types'
import { isValidObjectId } from './types'

const INITIAL_FLAG_DATA: NewFlagData = {
  name: '',
  key: '',
  description: '',
  type: 'BOOLEAN',
  defaultValue: 'false',
  projectId: '',
  environmentId: '',
}

export default function FeatureFlags() {
  const { t } = useTranslation()
  const [searchParams, setSearchParams] = useSearchParams()
  const [featureFlags, setFeatureFlags] = useState<FeatureFlag[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedProject, setSelectedProject] = useState<string>(
    searchParams.get('project') || 'all'
  )
  const [selectedEnvironment, setSelectedEnvironment] = useState<string>('all')

  // Modal state
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isCreating, setIsCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const [createSuccess, setCreateSuccess] = useState<string | null>(null)
  const [newFlagData, setNewFlagData] = useState<NewFlagData>(INITIAL_FLAG_DATA)

  // Toggle state
  const [togglingFlags, setTogglingFlags] = useState<Set<string>>(new Set())

  // Delete state
  const [isDeleting, setIsDeleting] = useState<string | null>(null)

  // Validate projectId from search params
  const validProjectId = isValidObjectId(selectedProject)
    ? selectedProject
    : null

  const fetchFeatureFlags = async () => {
    try {
      setIsLoading(true)
      const response = await api.get('/feature-flags', {
        params: {
          projectId: validProjectId || undefined,
          environmentId:
            selectedEnvironment !== 'all' ? selectedEnvironment : undefined,
        },
      })
      const flags = response.data.featureFlags || []
      // Normalize the flag data to ensure consistent structure
      setFeatureFlags(
        flags.map((flag: any) => ({
          ...flag,
          isEnabled: flag.enabled ?? flag.isEnabled ?? false,
          environmentId: flag.environmentId || selectedEnvironment,
        }))
      )
    } catch (error) {
      console.error('Failed to fetch feature flags:', error)
      setFeatureFlags([])
    } finally {
      setIsLoading(false)
    }
  }

  const fetchProjects = async () => {
    try {
      const response = await api.get('/projects')
      setProjects(response.data.projects || [])
    } catch (error) {
      console.error('Failed to fetch projects:', error)
    }
  }

  useEffect(() => {
    fetchFeatureFlags()
    fetchProjects()
  }, [validProjectId, selectedEnvironment])

  const createFeatureFlag = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsCreating(true)
    setCreateError(null)
    setCreateSuccess(null)

    try {
      const response = await api.post(
        `/feature-flags/project/${newFlagData.projectId}`,
        {
          name: newFlagData.name,
          key: newFlagData.key,
          description: newFlagData.description || undefined,
          flagType: newFlagData.type,
          defaultValue: newFlagData.defaultValue,
        }
      )

      const newFlag = response.data.featureFlag || response.data
      setFeatureFlags((prev) => [newFlag, ...prev])
      setCreateSuccess(t('feature-flags.create.success'))

      // Reset form and close modal after a brief delay
      setTimeout(() => {
        setNewFlagData(INITIAL_FLAG_DATA)
        setIsModalOpen(false)
        setCreateSuccess(null)
      }, 1500)
    } catch (err: unknown) {
      console.error('Failed to create feature flag:', err)
      setCreateError(getErrorMessage(err))
    } finally {
      setIsCreating(false)
    }
  }

  const toggleFlag = async (
    flagId: string,
    currentValue: boolean,
    environmentId?: string
  ) => {
    if (!isValidObjectId(flagId)) {
      console.error('Invalid flagId:', flagId)
      return
    }

    // Get the effective environment ID
    const effectiveEnvId = environmentId || selectedEnvironment
    if (!effectiveEnvId || effectiveEnvId === 'all') {
      toast.error(t('feature-flags.toggle.select-environment'))
      return
    }

    const newEnabled = !currentValue

    setTogglingFlags((prev) => new Set(prev).add(flagId))
    try {
      await api.post(`/feature-flags/${flagId}/toggle`, {
        environmentId: effectiveEnvId,
        enabled: newEnabled,
      })
      setFeatureFlags((prev) =>
        prev.map((flag) => {
          if (flag.id === flagId) {
            // For BOOLEAN flags, sync defaultValue with enabled state
            const updates: Partial<FeatureFlag> = { isEnabled: newEnabled }
            if (flag.type === 'BOOLEAN') {
              updates.defaultValue = newEnabled
            }
            return { ...flag, ...updates }
          }
          return flag
        })
      )
    } catch (error) {
      console.error('Failed to toggle feature flag:', error)
      toast.error(t('feature-flags.toggle.error'))
    } finally {
      setTogglingFlags((prev) => {
        const next = new Set(prev)
        next.delete(flagId)
        return next
      })
    }
  }

  const deleteFeatureFlag = async (flagId: string) => {
    if (
      !confirm(t('feature-flags.delete.confirm'))
    ) {
      return
    }

    setIsDeleting(flagId)
    try {
      await api.delete(`/feature-flags/${flagId}`)
      setFeatureFlags((prev) => prev.filter((flag) => flag.id !== flagId))
    } catch (err: unknown) {
      console.error('Failed to delete feature flag:', err)
      toast.error(getErrorMessage(err))
    } finally {
      setIsDeleting(null)
    }
  }

  // Auto-generate key from name
  const handleNameChange = (name: string) => {
    setNewFlagData((prev) => ({
      ...prev,
      name,
      key: name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, ''),
    }))
  }

  const handleDataChange = (data: Partial<NewFlagData>) => {
    setNewFlagData((prev) => ({ ...prev, ...data }))
  }

  // Get available environments for selected project
  const selectedProjectData = projects.find(
    (p) => p.id === newFlagData.projectId
  )
  const availableEnvironments = selectedProjectData?.environments || []

  const projectNames = Array.from(
    new Set(featureFlags.map((f) => f.projectName))
  )
  const environments = Array.from(
    new Set(featureFlags.map((f) => f.environmentName))
  )

  const filteredFlags = featureFlags.filter((flag) => {
    const matchesSearch =
      flag.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      flag.key.toLowerCase().includes(searchTerm.toLowerCase())
    const matchesProject =
      selectedProject === 'all' || flag.projectId === selectedProject
    const matchesEnvironment =
      selectedEnvironment === 'all' ||
      flag.environmentId === selectedEnvironment
    return matchesSearch && matchesProject && matchesEnvironment
  })

  const handleProjectChange = (value: string) => {
    setSelectedProject(value)
    if (value !== 'all') {
      setSearchParams({ project: value })
    } else {
      setSearchParams({})
    }
  }

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="md:flex md:items-center md:justify-between">
        <div className="min-w-0 flex-1">
          <h2 className="text-2xl font-bold leading-7 text-foreground sm:truncate sm:text-3xl sm:tracking-tight">
            {t('feature-flags.title')}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {t('feature-flags.subtitle')}
          </p>
        </div>
        <div className="mt-4 flex md:ml-4 md:mt-0">
          <button
            onClick={() => setIsModalOpen(true)}
            className="inline-flex items-center rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground shadow-sm hover:bg-primary/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            <PlusIcon className="-ml-0.5 mr-1.5 h-5 w-5" />
            {t('feature-flags.new')}
          </button>
        </div>
      </div>

      {/* Filters */}
      <FlagFilters
        searchTerm={searchTerm}
        selectedProject={selectedProject}
        selectedEnvironment={selectedEnvironment}
        projectNames={projectNames}
        environments={environments}
        onSearchChange={setSearchTerm}
        onProjectChange={handleProjectChange}
        onEnvironmentChange={setSelectedEnvironment}
      />

      {/* Create Feature Flag Modal */}
      <CreateFlagDialog
        isOpen={isModalOpen}
        isCreating={isCreating}
        createError={createError}
        createSuccess={createSuccess}
        newFlagData={newFlagData}
        projects={projects}
        availableEnvironments={availableEnvironments}
        onClose={() => setIsModalOpen(false)}
        onSubmit={createFeatureFlag}
        onNameChange={handleNameChange}
        onDataChange={handleDataChange}
      />

      {/* Feature flags list */}
      {isLoading ? (
        <div className="rounded-lg bg-card shadow border border-border">
          <div className="divide-y divide-border">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="p-6 animate-pulse">
                <div className="flex items-center justify-between">
                  <div className="h-6 w-48 bg-muted rounded" />
                  <div className="h-6 w-20 bg-muted rounded" />
                </div>
                <div className="mt-2 h-4 w-32 bg-muted rounded" />
              </div>
            ))}
          </div>
        </div>
      ) : filteredFlags.length === 0 ? (
        <div className="rounded-lg border-2 border-dashed border-border p-12 text-center">
          <FlagIcon className="mx-auto h-12 w-12 text-muted-foreground" />
          <h3 className="mt-2 text-sm font-semibold text-foreground">
            {t('feature-flags.empty.title')}
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {t('feature-flags.empty.description')}
          </p>
          <div className="mt-6">
            <button
              onClick={() => setIsModalOpen(true)}
              className="inline-flex items-center rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground shadow-sm hover:bg-primary/90"
            >
              <PlusIcon className="-ml-0.5 mr-1.5 h-5 w-5" />
              {t('feature-flags.new')}
            </button>
          </div>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg bg-card shadow border border-border">
          <div className="divide-y divide-border">
            {filteredFlags.map((flag) => (
              <FlagCard
                key={flag.id}
                flag={flag}
                isToggling={togglingFlags.has(flag.id)}
                isDeleting={isDeleting === flag.id}
                disableToggle={selectedEnvironment === 'all'}
                onToggle={toggleFlag}
                onDelete={deleteFeatureFlag}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
