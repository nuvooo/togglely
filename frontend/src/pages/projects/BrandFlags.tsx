import clsx from 'clsx'
import { ArrowLeft, Building2, Edit2, Flag } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import api from '@/lib/axios'
import { projectPath, ROUTES } from '@/lib/routes'

interface Brand {
  id: string
  name: string
  key: string
  description: string | null
}

interface FlagEnvironment {
  id: string
  environmentId: string
  environmentName: string
  enabled: boolean
  defaultValue: string
  isBrandSpecific: boolean
}

interface FeatureFlag {
  id: string
  name: string
  key: string
  description: string | null
  flagType: 'BOOLEAN' | 'STRING' | 'NUMBER' | 'JSON'
  environments: FlagEnvironment[]
}

export default function BrandFlags() {
  const { t: _t } = useTranslation()
  const { projectId = '', brandId } = useParams<{
    projectId: string
    brandId: string
  }>()
  const navigate = useNavigate()

  const [brand, setBrand] = useState<Brand | null>(null)
  const [flags, setFlags] = useState<FeatureFlag[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [togglingFlags, setTogglingFlags] = useState<Set<string>>(new Set())

  // Edit value dialog
  const [editingFlag, setEditingFlag] = useState<FeatureFlag | null>(null)
  const [editingEnv, setEditingEnv] = useState<FlagEnvironment | null>(null)
  const [editValue, setEditValue] = useState('')
  const [isSavingValue, setIsSavingValue] = useState(false)

  useEffect(() => {
    if (!brandId) return

    const fetchData = async () => {
      try {
        setIsLoading(true)
        const response = await api.get(`/brands/${brandId}/flags`)
        setBrand(response.data.brand)
        setFlags(response.data.flags)
      } catch (error) {
        console.error('Failed to fetch brand flags:', error)
      } finally {
        setIsLoading(false)
      }
    }

    fetchData()
  }, [brandId])

  const handleToggle = async (flag: FeatureFlag, env: FlagEnvironment) => {
    if (!brandId) return

    const toggleKey = `${flag.id}-${env.environmentId}`
    setTogglingFlags((prev) => new Set(prev).add(toggleKey))

    try {
      await api.post(`/brands/${brandId}/flags/${flag.id}/toggle`, {
        environmentId: env.environmentId,
        enabled: !env.enabled,
      })

      // Refresh data
      const response = await api.get(`/brands/${brandId}/flags`)
      setFlags(response.data.flags)
    } catch (error) {
      console.error('Failed to toggle flag:', error)
    } finally {
      setTogglingFlags((prev) => {
        const next = new Set(prev)
        next.delete(toggleKey)
        return next
      })
    }
  }

  const openEditValue = (flag: FeatureFlag, env: FlagEnvironment) => {
    setEditingFlag(flag)
    setEditingEnv(env)
    setEditValue(env.defaultValue)
  }

  const handleSaveValue = async () => {
    if (!brandId || !editingFlag || !editingEnv) return

    setIsSavingValue(true)
    try {
      await api.patch(
        `/feature-flags/${editingFlag.id}/environments/${editingEnv.environmentId}/value`,
        { value: editValue, brandId }
      )

      // Refresh data
      const response = await api.get(`/brands/${brandId}/flags`)
      setFlags(response.data.flags)
      setEditingFlag(null)
      setEditingEnv(null)
    } catch (error) {
      console.error('Failed to save flag value:', error)
    } finally {
      setIsSavingValue(false)
    }
  }

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'BOOLEAN':
        return 'bg-blue-100 text-blue-800'
      case 'STRING':
        return 'bg-green-100 text-green-800'
      case 'NUMBER':
        return 'bg-purple-100 text-purple-800'
      case 'JSON':
        return 'bg-orange-100 text-orange-800'
      default:
        return 'bg-gray-100 text-gray-800'
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    )
  }

  if (!brand) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <p className="text-destructive">Brand not found</p>
        <Button
          className="mt-4"
          onClick={() => navigate(projectPath(projectId, 'settings'))}
        >
          Back to Settings
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
          Organizations
        </Link>
        <span>/</span>
        <Link
          to={projectPath(projectId, 'settings')}
          className="hover:text-foreground transition-colors"
        >
          Project Settings
        </Link>
        <span>/</span>
        <span className="text-foreground font-medium">{brand.name} Flags</span>
      </div>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-4">
          <Button
            variant="outline"
            size="icon"
            onClick={() => navigate(projectPath(projectId, 'settings'))}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-500 to-purple-600 flex items-center justify-center text-white font-bold text-xl">
              <Building2 className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">
                {brand.name}
              </h1>
              <p className="text-muted-foreground text-sm">
                Brand-specific feature flags
              </p>
            </div>
          </div>
        </div>
      </div>

      <Separator />

      {/* Flags List */}
      <div className="space-y-4">
        {flags.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-16">
              <Flag className="w-12 h-12 text-muted-foreground mb-4" />
              <h3 className="text-xl font-semibold mb-2">No feature flags</h3>
              <p className="text-sm text-muted-foreground text-center max-w-sm">
                This project has no feature flags yet. Create flags in the
                project first.
              </p>
            </CardContent>
          </Card>
        ) : (
          flags.map((flag) => (
            <Card key={flag.id}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center text-white font-bold">
                      <Flag className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <CardTitle className="text-lg">{flag.name}</CardTitle>
                        <Badge className={getTypeColor(flag.flagType)}>
                          {flag.flagType}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground font-mono">
                        {flag.key}
                      </p>
                      {flag.description && (
                        <p className="text-sm text-muted-foreground mt-1">
                          {flag.description}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {flag.environments.map((env) => {
                    const toggleKey = `${flag.id}-${env.environmentId}`
                    const isToggling = togglingFlags.has(toggleKey)

                    return (
                      <div
                        key={env.environmentId}
                        className={clsx(
                          'p-4 rounded-lg border transition-colors',
                          env.enabled
                            ? 'bg-green-50 border-green-200 dark:bg-green-900/20 dark:border-green-800'
                            : 'bg-gray-50 border-gray-200 dark:bg-gray-900/20 dark:border-gray-800'
                        )}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="font-medium">
                              {env.environmentName}
                            </span>
                            {env.isBrandSpecific && (
                              <Badge variant="outline" className="text-xs">
                                Custom
                              </Badge>
                            )}
                          </div>
                          <button
                            onClick={() => handleToggle(flag, env)}
                            disabled={isToggling}
                            className={clsx(
                              'relative inline-flex h-6 w-11 items-center rounded-full transition-colors',
                              env.enabled ? 'bg-green-500' : 'bg-gray-300'
                            )}
                          >
                            <span
                              className={clsx(
                                'inline-block h-4 w-4 transform rounded-full bg-white transition-transform',
                                env.enabled ? 'translate-x-6' : 'translate-x-1'
                              )}
                            />
                          </button>
                        </div>
                        <div className="mt-2 text-sm text-muted-foreground flex items-center gap-2">
                          Value:{' '}
                          <code className="bg-background px-1 rounded">
                            {env.defaultValue}
                          </code>
                          <button
                            onClick={() => openEditValue(flag, env)}
                            className="text-xs text-primary hover:underline flex items-center gap-1"
                          >
                            <Edit2 className="w-3 h-3" />
                            Edit
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* Edit Value Dialog */}
      <Dialog open={!!editingFlag} onOpenChange={() => setEditingFlag(null)}>
        <DialogContent aria-describedby="dialog-description">
          <DialogHeader>
            <DialogTitle>Edit Brand Flag Value</DialogTitle>
            <DialogDescription id="dialog-description">
              Update the value for <strong>{editingFlag?.name}</strong> in{' '}
              {editingEnv?.environmentName} for brand{' '}
              <strong>{brand.name}</strong>
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="flagValue">Value ({editingFlag?.flagType})</Label>
              {editingFlag?.flagType === 'BOOLEAN' ? (
                <div className="flex items-center gap-4 py-2">
                  <button
                    type="button"
                    onClick={() => setEditValue('true')}
                    className={clsx(
                      'flex-1 py-2 px-4 rounded-md border text-sm font-medium transition-colors',
                      editValue === 'true'
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'bg-background text-foreground border-input hover:bg-accent'
                    )}
                  >
                    true
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditValue('false')}
                    className={clsx(
                      'flex-1 py-2 px-4 rounded-md border text-sm font-medium transition-colors',
                      editValue === 'false'
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'bg-background text-foreground border-input hover:bg-accent'
                    )}
                  >
                    false
                  </button>
                </div>
              ) : editingFlag?.flagType === 'JSON' ? (
                <textarea
                  id="flagValue"
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  className="w-full min-h-[100px] rounded-md border border-input bg-background px-3 py-2 font-mono text-sm"
                  placeholder='{"enabled": true}'
                />
              ) : editingFlag?.flagType === 'NUMBER' ? (
                <Input
                  id="flagValue"
                  type="number"
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                />
              ) : (
                <Input
                  id="flagValue"
                  type="text"
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                />
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingFlag(null)}>
              Cancel
            </Button>
            <Button onClick={handleSaveValue} disabled={isSavingValue}>
              {isSavingValue ? 'Saving...' : 'Save Value'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
