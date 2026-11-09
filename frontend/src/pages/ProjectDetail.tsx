import {
  ArrowLeftIcon,
  Cog6ToothIcon,
  FlagIcon,
  FolderIcon,
  PlusIcon,
  TrashIcon,
} from '@heroicons/react/24/outline'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { FlagValueDialog } from '@/components/flags/FlagValueDialog'
import { FlagValueRow } from '@/components/flags/FlagValueRow'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import api from '@/lib/axios'
import { getErrorMessage } from '@/lib/errors'
import { flagPath, orgPath, projectPath, ROUTES } from '@/lib/routes'

// Helper to validate MongoDB ObjectID format (24-char hex)
const isValidObjectId = (id: string | undefined | null): id is string => {
  if (!id || typeof id !== 'string') return false
  if (id === 'undefined' || id === 'null' || id === 'new') return false
  return /^[0-9a-fA-F]{24}$/.test(id)
}

interface Project {
  id: string
  name: string
  key: string
  description: string | null
  type: 'SINGLE' | 'MULTI'
  organizationId: string
  organizationName: string
  createdAt: string
  environments?: Environment[]
}

interface Environment {
  id: string
  name: string
  key: string
}

/**
 * A brand's value in one environment. Without an own row (`inherited`) the
 * brand carries the environment default's effective values.
 */
interface BrandFlagValue {
  brandId: string
  brandName: string
  enabled: boolean
  defaultValue: string
  inherited?: boolean
  isBrandSpecific?: boolean
}

interface FlagEnvironment {
  id: string
  environmentId: string
  environmentName: string
  enabled: boolean
  defaultValue: string
  brandValues?: BrandFlagValue[] // Brand values per environment
}

type FlagType = 'BOOLEAN' | 'STRING' | 'NUMBER' | 'JSON'

interface FeatureFlag {
  id: string
  name: string
  key: string
  description: string | null
  flagType: FlagType
  environments: FlagEnvironment[]
  createdAt: string
  updatedAt: string
}

/** Target of the value editor: the environment default or one brand. */
interface EditingValue {
  flag: FeatureFlag
  env: FlagEnvironment
  brand?: BrandFlagValue
}

export default function ProjectDetail() {
  const { t } = useTranslation()
  const { projectId = '' } = useParams<{ projectId: string }>()
  const navigate = useNavigate()
  const [project, setProject] = useState<Project | null>(null)
  const orgId = project?.organizationId ?? ''
  const [featureFlags, setFeatureFlags] = useState<FeatureFlag[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [showCreateFlagDialog, setShowCreateFlagDialog] = useState(false)
  const [searchParams, setSearchParams] = useSearchParams()

  // `?new=1` (command palette "New flag") opens the create dialog once.
  useEffect(() => {
    if (searchParams.get('new') !== '1') return
    setShowCreateFlagDialog(true)
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        next.delete('new')
        return next
      },
      { replace: true }
    )
  }, [searchParams, setSearchParams])
  const [newFlagName, setNewFlagName] = useState('')
  const [newFlagKey, setNewFlagKey] = useState('')
  const [newFlagType, setNewFlagType] = useState<FlagType>('BOOLEAN')
  const [isCreatingFlag, setIsCreatingFlag] = useState(false)

  // Delete flag dialog state
  const [flagToDelete, setFlagToDelete] = useState<FeatureFlag | null>(null)
  const [isDeletingFlag, setIsDeletingFlag] = useState(false)

  // Value editor (default, brand or single-project environment)
  const [editing, setEditing] = useState<EditingValue | null>(null)

  // Brand management
  const [isMultiTenant, setIsMultiTenant] = useState(false)
  const [busyRows, setBusyRows] = useState<Set<string>>(new Set())

  // Validate IDs early
  const validProjectId = isValidObjectId(projectId) ? projectId : null

  const fetchData = async (skipLoading = false) => {
    if (!validProjectId) return

    try {
      if (!skipLoading) setIsLoading(true)

      // Use optimized API for multi-tenant projects
      const projectRes = await api.get(`/projects/${validProjectId}`)
      const projectData = projectRes.data.project || projectRes.data
      setProject(projectData)
      setIsMultiTenant(projectData.type === 'MULTI')

      if (projectData.type === 'MULTI') {
        const flagsWithBrandsRes = await api.get(
          `/projects/${validProjectId}/flags-with-brands`
        )
        setFeatureFlags(flagsWithBrandsRes.data.flags || [])
      } else {
        const flagsRes = await api.get(
          `/feature-flags/project/${validProjectId}`
        )
        const flags = flagsRes.data.featureFlags || []
        setFeatureFlags(flags)
      }
    } catch (error) {
      console.error('Failed to fetch project data:', error)
    } finally {
      if (!skipLoading) setIsLoading(false)
    }
  }

  /** Reloads only the flags (after a mutation), keeping the page mounted. */
  const refreshFlags = async () => {
    if (!validProjectId) return
    try {
      if (isMultiTenant) {
        const res = await api.get(
          `/projects/${validProjectId}/flags-with-brands`
        )
        setFeatureFlags(res.data.flags || [])
      } else {
        const res = await api.get(`/feature-flags/project/${validProjectId}`)
        setFeatureFlags(res.data.featureFlags || [])
      }
    } catch (error) {
      console.error('Failed to refresh flags:', error)
    }
  }

  useEffect(() => {
    if (!validProjectId) {
      setIsLoading(false)
      return
    }

    fetchData()
  }, [validProjectId])

  const generateKey = (name: string) => {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
  }

  const handleNameChange = (value: string) => {
    setNewFlagName(value)
    if (!newFlagKey || newFlagKey === generateKey(newFlagName)) {
      setNewFlagKey(generateKey(value))
    }
  }

  const handleCreateFlag = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!validProjectId) return
    setIsCreatingFlag(true)
    try {
      // Determine default value based on type
      const defaultValue =
        newFlagType === 'BOOLEAN'
          ? 'false'
          : newFlagType === 'NUMBER'
            ? '0'
            : newFlagType === 'JSON'
              ? '{}'
              : ''

      await api.post(`/feature-flags/project/${validProjectId}`, {
        name: newFlagName,
        key: newFlagKey,
        type: newFlagType,
        initialValues: {
          development: { enabled: false, value: defaultValue },
          production: { enabled: false, value: defaultValue },
        },
      })

      // Refresh flags to get complete data (including environments, brandValues, etc.)
      await fetchData()

      setShowCreateFlagDialog(false)
      setNewFlagName('')
      setNewFlagKey('')
      setNewFlagType('BOOLEAN')
    } catch (error) {
      console.error('Failed to create feature flag:', error)
    } finally {
      setIsCreatingFlag(false)
    }
  }

  /** Optimistically patches one environment of one flag. */
  const patchEnvironment = (
    flagId: string,
    environmentId: string,
    patch: (env: FlagEnvironment) => FlagEnvironment
  ) => {
    setFeatureFlags((prev) =>
      prev.map((f) =>
        f.id === flagId
          ? {
              ...f,
              environments: f.environments.map((e) =>
                e.environmentId === environmentId ? patch(e) : e
              ),
            }
          : f
      )
    )
  }

  /**
   * Runs a mutation with optimistic update, refetch on success and rollback
   * plus toast on error. `rowKey` marks the row busy meanwhile.
   */
  const mutate = async (
    rowKey: string,
    optimistic: () => void,
    request: () => Promise<unknown>
  ) => {
    const previousFlags = featureFlags
    optimistic()
    setBusyRows((prev) => new Set(prev).add(rowKey))
    try {
      await request()
      await refreshFlags()
    } catch (error) {
      setFeatureFlags(previousFlags)
      toast.error(getErrorMessage(error))
    } finally {
      setBusyRows((prev) => {
        const next = new Set(prev)
        next.delete(rowKey)
        return next
      })
    }
  }

  /** Toggles the environment default (brandId null); inheriting brands follow. */
  const handleToggleDefault = (
    flag: FeatureFlag,
    env: FlagEnvironment,
    newEnabled: boolean
  ) => {
    const syncValue =
      flag.flagType === 'BOOLEAN' ? String(newEnabled) : undefined
    return mutate(
      `${flag.id}-${env.environmentId}-default`,
      () =>
        patchEnvironment(flag.id, env.environmentId, (e) => ({
          ...e,
          enabled: newEnabled,
          ...(syncValue !== undefined && { defaultValue: syncValue }),
          brandValues: e.brandValues?.map((bv) =>
            bv.inherited
              ? {
                  ...bv,
                  enabled: newEnabled,
                  ...(syncValue !== undefined && { defaultValue: syncValue }),
                }
              : bv
          ),
        })),
      () =>
        api.post(`/feature-flags/${flag.id}/toggle`, {
          environmentId: env.environmentId,
          enabled: newEnabled,
        })
    )
  }

  /** Toggles a brand; an inheriting brand gets its own override row. */
  const handleToggleBrand = (
    flag: FeatureFlag,
    env: FlagEnvironment,
    brand: BrandFlagValue,
    newEnabled: boolean
  ) => {
    const syncValue =
      flag.flagType === 'BOOLEAN' ? String(newEnabled) : undefined
    return mutate(
      `${flag.id}-${env.environmentId}-${brand.brandId}`,
      () =>
        patchEnvironment(flag.id, env.environmentId, (e) => ({
          ...e,
          brandValues: e.brandValues?.map((bv) =>
            bv.brandId === brand.brandId
              ? {
                  ...bv,
                  enabled: newEnabled,
                  inherited: false,
                  isBrandSpecific: true,
                  ...(syncValue !== undefined && { defaultValue: syncValue }),
                }
              : bv
          ),
        })),
      () =>
        api.post(`/brands/${brand.brandId}/flags/${flag.id}/toggle`, {
          environmentId: env.environmentId,
          enabled: newEnabled,
        })
    )
  }

  /** Deletes the brand override: the brand inherits the default again. */
  const handleResetBrand = (
    flag: FeatureFlag,
    env: FlagEnvironment,
    brand: BrandFlagValue
  ) =>
    mutate(
      `${flag.id}-${env.environmentId}-${brand.brandId}`,
      () =>
        patchEnvironment(flag.id, env.environmentId, (e) => ({
          ...e,
          brandValues: e.brandValues?.map((bv) =>
            bv.brandId === brand.brandId
              ? {
                  ...bv,
                  enabled: e.enabled,
                  defaultValue: e.defaultValue,
                  inherited: true,
                  isBrandSpecific: false,
                }
              : bv
          ),
        })),
      () =>
        api.delete(
          `/brands/${brand.brandId}/flags/${flag.id}/environments/${env.environmentId}`
        )
    )

  /** Saves the edited value; with a brand this creates/updates its override. */
  const handleSaveValue = async (value: string) => {
    if (!editing) return
    const { flag, env, brand } = editing
    await api.patch(
      `/feature-flags/${flag.id}/environments/${env.environmentId}/value`,
      brand ? { value, brandId: brand.brandId } : { value }
    )
    await refreshFlags()
  }

  const openDeleteDialog = (flag: FeatureFlag) => {
    setFlagToDelete(flag)
  }

  const handleDeleteFlag = async () => {
    if (!flagToDelete) return
    setIsDeletingFlag(true)
    try {
      await api.delete(`/feature-flags/${flagToDelete.id}`)
      setFeatureFlags((prev) => prev.filter((f) => f.id !== flagToDelete.id))
      setFlagToDelete(null)
    } catch (error) {
      console.error('Failed to delete flag:', error)
    } finally {
      setIsDeletingFlag(false)
    }
  }

  const filteredFlags = Array.isArray(featureFlags)
    ? featureFlags.filter(
        (flag) =>
          (flag.name || '')
            .toLowerCase()
            .includes((searchTerm || '').toLowerCase()) ||
          (flag.key || '')
            .toLowerCase()
            .includes((searchTerm || '').toLowerCase())
      )
    : []

  if (!validProjectId) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <p className="text-destructive">Invalid project ID</p>
        <Button className="mt-4" onClick={() => navigate(ROUTES.orgs)}>
          Back to Organizations
        </Button>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    )
  }

  if (!project) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <p className="text-muted-foreground">Project not found</p>
        <Button
          className="mt-4"
          onClick={() => navigate(ROUTES.orgs)}
        >
          Back to Organizations
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link
          to={ROUTES.orgs}
          className="hover:text-foreground transition-colors"
        >
          {t('organization-detail.breadcrumb.organizations')}
        </Link>
        {orgId && (
          <>
            <span>/</span>
            <Link
              to={orgPath(orgId)}
              className="hover:text-foreground transition-colors"
            >
              {project.organizationName || 'Organization'}
            </Link>
          </>
        )}
        <span>/</span>
        <span className="text-foreground font-medium">{project.name}</span>
      </div>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-4">
          <Button
            variant="outline"
            size="icon"
            onClick={() => navigate(orgPath(orgId))}
          >
            <ArrowLeftIcon className="h-4 w-4" />
          </Button>
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-green-500 to-green-600 flex items-center justify-center text-white font-bold text-xl">
              {project.name?.charAt(0).toUpperCase() || 'P'}
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">
                {project.name}
              </h1>
              <p className="text-muted-foreground text-sm">{project.key}</p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={() => navigate(projectPath(projectId, 'settings'))}
          >
            <Cog6ToothIcon className="w-4 h-4 mr-2" />
            Settings
          </Button>
          <Dialog
            open={showCreateFlagDialog}
            onOpenChange={setShowCreateFlagDialog}
          >
            <DialogTrigger asChild>
              <Button>
                <PlusIcon className="w-4 h-4 mr-2" />
                New Feature Flag
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create Feature Flag</DialogTitle>
                <DialogDescription>
                  Create a new feature flag in {project.name}
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleCreateFlag}>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="flagName">Flag Name</Label>
                    <Input
                      id="flagName"
                      placeholder="New Feature"
                      value={newFlagName}
                      onChange={(e) => handleNameChange(e.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="flagKey">Flag Key</Label>
                    <Input
                      id="flagKey"
                      placeholder="new-feature"
                      value={newFlagKey}
                      onChange={(e) =>
                        setNewFlagKey(
                          e.target.value
                            .toLowerCase()
                            .replace(/[^a-z0-9-]/g, '')
                        )
                      }
                      required
                      className="font-mono"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="flagType">Type</Label>
                    <select
                      id="flagType"
                      value={newFlagType}
                      onChange={(e) =>
                        setNewFlagType(e.target.value as FlagType)
                      }
                      className="w-full rounded-md border border-input bg-background px-3 py-2"
                    >
                      <option value="BOOLEAN">Boolean (true/false)</option>
                      <option value="STRING">String</option>
                      <option value="NUMBER">Number</option>
                      <option value="JSON">JSON</option>
                    </select>
                  </div>
                </div>
                <DialogFooter>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setShowCreateFlagDialog(false)}
                  >
                    {t('common.cancel')}
                  </Button>
                  <Button
                    type="submit"
                    disabled={isCreatingFlag || !newFlagName || !newFlagKey}
                  >
                    {isCreatingFlag ? t('common.loading') : t('common.create')}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <Separator />

      {/* Search */}
      <div className="flex items-center justify-between">
        <div className="relative max-w-md w-full">
          <input
            type="text"
            placeholder="Search feature flags..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 rounded-lg border border-input bg-background"
          />
          <FolderIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        </div>
        <Badge variant="secondary">{filteredFlags.length} flags</Badge>
      </div>

      {/* Feature Flags Table */}
      {filteredFlags.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-16">
            <FlagIcon className="w-12 h-12 text-muted-foreground mb-4" />
            <h3 className="text-xl font-semibold mb-2">No feature flags yet</h3>
            <p className="text-sm text-muted-foreground text-center max-w-sm mb-6">
              Create your first feature flag to start managing feature toggles
            </p>
            <Button onClick={() => setShowCreateFlagDialog(true)}>
              <PlusIcon className="w-4 h-4 mr-2" />
              Create Feature Flag
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {filteredFlags.map((flag) => {
            const editable = flag.flagType !== 'BOOLEAN'
            return (
              <Card key={flag.id} className="hover:shadow-md transition-shadow">
                <CardContent className="p-6">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center text-white font-bold">
                        <FlagIcon className="w-5 h-5" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-lg">
                          <Link
                            to={flagPath(projectId, flag.id)}
                            className="hover:underline"
                          >
                            {flag.name}
                          </Link>
                        </h3>
                        <p className="text-sm text-muted-foreground font-mono">
                          {flag.key}
                        </p>
                        <div className="flex items-center gap-2 mt-1">
                          <Badge variant="outline">{flag.flagType}</Badge>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => openDeleteDialog(flag)}
                        className="p-2 text-muted-foreground hover:text-destructive transition-colors"
                      >
                        <TrashIcon className="w-5 h-5" />
                      </button>
                    </div>
                  </div>

                  {/* Multi-brand: one card per environment, default first,
                      then every brand (inheriting or overridden) */}
                  {isMultiTenant ? (
                    <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                      {!flag.environments || flag.environments.length === 0 ? (
                        <div className="col-span-3 text-sm text-muted-foreground p-4 border border-dashed rounded-lg">
                          No environments found.
                        </div>
                      ) : (
                        flag.environments.map((env) => (
                          <div
                            key={env.id}
                            data-testid={`env-card-${env.environmentId}`}
                            className="p-4 rounded-lg border bg-muted border-border"
                          >
                            <h4 className="font-semibold text-foreground mb-3 pb-2 border-b border-border">
                              {env.environmentName}
                            </h4>
                            <div className="space-y-2">
                              <FlagValueRow
                                primary
                                label={t('brand-values.default-all')}
                                name={`${env.environmentName} ${t('brand-values.default-all')}`}
                                flagType={flag.flagType}
                                enabled={env.enabled}
                                value={env.defaultValue}
                                busy={busyRows.has(
                                  `${flag.id}-${env.environmentId}-default`
                                )}
                                onToggle={(next) =>
                                  handleToggleDefault(flag, env, next)
                                }
                                onEdit={
                                  editable
                                    ? () => setEditing({ flag, env })
                                    : undefined
                                }
                              />
                              {env.brandValues?.map((brand) => {
                                const inherited = brand.inherited ?? false
                                return (
                                  <FlagValueRow
                                    key={brand.brandId}
                                    label={brand.brandName}
                                    name={`${env.environmentName} ${brand.brandName}`}
                                    flagType={flag.flagType}
                                    enabled={brand.enabled}
                                    value={brand.defaultValue}
                                    inherited={inherited}
                                    overridden={!inherited}
                                    busy={busyRows.has(
                                      `${flag.id}-${env.environmentId}-${brand.brandId}`
                                    )}
                                    onToggle={(next) =>
                                      handleToggleBrand(flag, env, brand, next)
                                    }
                                    onEdit={
                                      editable
                                        ? () => setEditing({ flag, env, brand })
                                        : undefined
                                    }
                                    onReset={() =>
                                      handleResetBrand(flag, env, brand)
                                    }
                                  />
                                )
                              })}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  ) : (
                    /* For Single-Tenant: one row per environment */
                    <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                      {!flag.environments || flag.environments.length === 0 ? (
                        <div className="col-span-3 text-sm text-muted-foreground p-4 border border-dashed rounded-lg">
                          No environments found. Please refresh the page.
                        </div>
                      ) : (
                        flag.environments.map((env) => (
                          <FlagValueRow
                            key={env.id}
                            primary
                            label={env.environmentName}
                            name={env.environmentName}
                            flagType={flag.flagType}
                            enabled={env.enabled}
                            value={env.defaultValue}
                            busy={busyRows.has(
                              `${flag.id}-${env.environmentId}-default`
                            )}
                            onToggle={(next) =>
                              handleToggleDefault(flag, env, next)
                            }
                            onEdit={
                              editable
                                ? () => setEditing({ flag, env })
                                : undefined
                            }
                          />
                        ))
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* Delete Flag Dialog */}
      <Dialog open={!!flagToDelete} onOpenChange={() => setFlagToDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Feature Flag</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete{' '}
              <strong>{flagToDelete?.name}</strong>? This action cannot be
              undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setFlagToDelete(null)}
              disabled={isDeletingFlag}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteFlag}
              disabled={isDeletingFlag}
            >
              {isDeletingFlag ? 'Deleting...' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Flag Value Dialog (default, brand or environment) */}
      <FlagValueDialog
        open={!!editing}
        onOpenChange={(open) => !open && setEditing(null)}
        flagType={editing?.flag.flagType ?? 'STRING'}
        flagName={editing?.flag.name ?? ''}
        environmentName={editing?.env.environmentName ?? ''}
        targetName={
          !isMultiTenant
            ? undefined
            : editing?.brand
              ? editing.brand.brandName
              : t('brand-values.default-all')
        }
        initialValue={
          editing?.brand
            ? editing.brand.defaultValue
            : (editing?.env.defaultValue ?? '')
        }
        hint={
          editing?.brand?.inherited
            ? t('brand-values.edit-creates-override')
            : undefined
        }
        onSave={handleSaveValue}
      />
    </div>
  )
}
