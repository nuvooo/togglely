import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { BeakerIcon, PlusIcon } from '@heroicons/react/24/outline'
import { useTranslation } from 'react-i18next'
import api from '@/lib/api'

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
  DRAFT: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300',
  RUNNING: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300',
  PAUSED: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300',
  COMPLETED: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',
  ARCHIVED: 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-500',
}

export default function ExperimentsList() {
  const { t } = useTranslation()
  const [searchParams] = useSearchParams()
  const projectId = searchParams.get('projectId') || ''
  const [experiments, setExperiments] = useState<Experiment[]>([])
  const [statusFilter, setStatusFilter] = useState<string>('')
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    if (!projectId) {
      setIsLoading(false)
      return
    }
    setIsLoading(true)
    const params: Record<string, string> = { projectId }
    if (statusFilter) params.status = statusFilter

    api.get('/api/experiments', { params })
      .then((res) => setExperiments(res.data))
      .catch(() => {})
      .finally(() => setIsLoading(false))
  }, [projectId, statusFilter])

  if (!projectId) {
    return (
      <div className="p-6">
        <p className="text-gray-500 dark:text-gray-400">
          Please select a project to view experiments.
        </p>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <BeakerIcon className="h-7 w-7 text-primary" />
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            {t('experiments.title', 'A/B Experiments')}
          </h1>
        </div>
        <Link
          to={`/experiments/new?projectId=${projectId}`}
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90 transition-colors"
        >
          <PlusIcon className="h-4 w-4" />
          {t('experiments.create', 'New Experiment')}
        </Link>
      </div>

      {/* Filters */}
      <div className="flex gap-2">
        {['', 'DRAFT', 'RUNNING', 'PAUSED', 'COMPLETED'].map((status) => (
          <button
            key={status}
            onClick={() => setStatusFilter(status)}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
              statusFilter === status
                ? 'bg-primary text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600'
            }`}
          >
            {status || t('experiments.allStatuses', 'All')}
          </button>
        ))}
      </div>

      {/* List */}
      {isLoading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      ) : experiments.length === 0 ? (
        <div className="text-center py-12">
          <BeakerIcon className="mx-auto h-12 w-12 text-gray-400" />
          <h3 className="mt-2 text-sm font-semibold text-gray-900 dark:text-white">
            {t('experiments.empty', 'No experiments yet')}
          </h3>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            {t('experiments.emptyDescription', 'Create your first A/B experiment to start testing.')}
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-gray-200 dark:border-gray-700">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-800">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  {t('experiments.name', 'Name')}
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  {t('experiments.status', 'Status')}
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  {t('experiments.flag', 'Flag')}
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  {t('experiments.variants', 'Variants')}
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  {t('experiments.traffic', 'Traffic')}
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  {t('experiments.events', 'Events')}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700 bg-white dark:bg-gray-900">
              {experiments.map((exp) => (
                <tr key={exp.id} className="hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                  <td className="px-4 py-3">
                    <Link
                      to={`/experiments/${exp.id}`}
                      className="text-sm font-medium text-primary hover:underline"
                    >
                      {exp.name}
                    </Link>
                    <p className="text-xs text-gray-500 dark:text-gray-400 font-mono">{exp.key}</p>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_COLORS[exp.status]}`}>
                      {exp.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">
                    {exp.flag.name}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">
                    {exp.variants.length}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">
                    {exp.trafficPercent}%
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">
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
