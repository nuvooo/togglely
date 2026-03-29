import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { FlaskConical, Plus } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import api from '@/lib/api'

interface Project {
  id: string
  name: string
  key: string
}

interface Experiment {
  id: string
  name: string
  key: string
  description: string | null
  status: 'DRAFT' | 'RUNNING' | 'PAUSED' | 'COMPLETED' | 'ARCHIVED'
  trafficPercent: number
  startedAt: string | null
  endedAt: string | null
  createdAt: string
  flag: { id: string; name: string; key: string }
  environment: { id: string; name: string }
  variants: { id: string; key: string; name: string; weight: number; isControl: boolean }[]
  _count: { events: number }
}

const STATUS_COLORS: Record<string, string> = {
  DRAFT: 'bg-muted text-muted-foreground',
  RUNNING: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  PAUSED: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
  COMPLETED: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  ARCHIVED: 'bg-muted text-muted-foreground opacity-60',
}

export default function ExperimentsList() {
  const { t } = useTranslation()
  const [searchParams, setSearchParams] = useSearchParams()
  const projectId = searchParams.get('projectId') || ''
  const [projects, setProjects] = useState<Project[]>([])
  const [experiments, setExperiments] = useState<Experiment[]>([])
  const [statusFilter, setStatusFilter] = useState<string>('')
  const [isLoading, setIsLoading] = useState(false)

  // Load projects
  useEffect(() => {
    api.get('/projects')
      .then((res) => {
        const list = Array.isArray(res.data) ? res.data : res.data.projects || []
        setProjects(list)
        // Auto-select first project if none selected
        if (!projectId && list.length > 0) {
          setSearchParams({ projectId: list[0].id })
        }
      })
      .catch(() => {})
  }, [])

  // Load experiments when project changes
  useEffect(() => {
    if (!projectId) return
    setIsLoading(true)
    const params: Record<string, string> = { projectId }
    if (statusFilter) params.status = statusFilter

    api.get('/experiments', { params })
      .then((res) => setExperiments(res.data))
      .catch(() => {})
      .finally(() => setIsLoading(false))
  }, [projectId, statusFilter])

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
            <FlaskConical className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">
              {t('experiments.title', 'A/B Experiments')}
            </h1>
            <p className="text-sm text-muted-foreground">
              {t('experiments.subtitle', 'Run experiments to optimize your product')}
            </p>
          </div>
        </div>
        {projectId && (
          <Link
            to={`/experiments/new?projectId=${projectId}`}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors shadow-sm"
          >
            <Plus className="h-4 w-4" />
            {t('experiments.create', 'New Experiment')}
          </Link>
        )}
      </div>

      {/* Project selector + Status filters */}
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-muted-foreground">
            {t('experiments.project', 'Project')}:
          </label>
          <select
            value={projectId}
            onChange={(e) => setSearchParams({ projectId: e.target.value })}
            className="rounded-lg border border-input bg-background px-3 py-1.5 text-sm"
          >
            {projects.length === 0 && <option value="">Loading...</option>}
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>

        <div className="flex gap-1">
          {['', 'DRAFT', 'RUNNING', 'PAUSED', 'COMPLETED'].map((status) => (
            <button
              key={status}
              onClick={() => setStatusFilter(status)}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                statusFilter === status
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:bg-muted/80'
              }`}
            >
              {status || t('experiments.allStatuses', 'All')}
            </button>
          ))}
        </div>
      </div>

      {/* List */}
      {isLoading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      ) : experiments.length === 0 ? (
        <div className="text-center py-16 rounded-lg border border-dashed border-border">
          <FlaskConical className="mx-auto h-12 w-12 text-muted-foreground/50" />
          <h3 className="mt-4 text-base font-semibold">
            {t('experiments.empty', 'No experiments yet')}
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {t('experiments.emptyDescription', 'Create your first A/B experiment to start testing.')}
          </p>
          {projectId && (
            <Link
              to={`/experiments/new?projectId=${projectId}`}
              className="mt-4 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              <Plus className="h-4 w-4" />
              {t('experiments.create', 'New Experiment')}
            </Link>
          )}
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border">
          <table className="min-w-full divide-y divide-border">
            <thead className="bg-muted/50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  {t('experiments.name', 'Name')}
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  {t('experiments.status', 'Status')}
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  {t('experiments.flag', 'Flag')}
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  {t('experiments.variants', 'Variants')}
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  {t('experiments.traffic', 'Traffic')}
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  {t('experiments.events', 'Events')}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border bg-background">
              {experiments.map((exp) => (
                <tr key={exp.id} className="hover:bg-muted/50 transition-colors">
                  <td className="px-4 py-3">
                    <Link
                      to={`/experiments/${exp.id}`}
                      className="text-sm font-medium text-primary hover:underline"
                    >
                      {exp.name}
                    </Link>
                    <p className="text-xs text-muted-foreground font-mono">{exp.key}</p>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_COLORS[exp.status]}`}>
                      {exp.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm">
                    {exp.flag.name}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    {exp.variants.length}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    {exp.trafficPercent}%
                  </td>
                  <td className="px-4 py-3 text-sm">
                    {exp._count.events}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
