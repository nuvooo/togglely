import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  BeakerIcon,
  PlayIcon,
  PauseIcon,
  CheckIcon,
  ArrowLeftIcon,
} from '@heroicons/react/24/outline'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import api from '@/lib/api'

interface Variant {
  id: string
  key: string
  name: string
  description: string | null
  value: string
  weight: number
  isControl: boolean
}

interface Experiment {
  id: string
  name: string
  key: string
  description: string | null
  hypothesis: string | null
  status: 'DRAFT' | 'RUNNING' | 'PAUSED' | 'COMPLETED' | 'ARCHIVED'
  trafficPercent: number
  startedAt: string | null
  endedAt: string | null
  createdAt: string
  flag: { id: string; name: string; key: string; flagType: string }
  environment: { id: string; name: string; key: string }
  variants: Variant[]
  createdBy: { firstName: string; lastName: string; email: string }
}

interface ExperimentResults {
  variants: {
    key: string
    name: string
    impressions: number
    conversions: number
    conversionRate: number
    isControl: boolean
  }[]
  totalImpressions: number
  totalConversions: number
  isSignificant: boolean
  confidence: number
  winner: string | null
}

const STATUS_COLORS: Record<string, string> = {
  DRAFT: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300',
  RUNNING: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300',
  PAUSED: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300',
  COMPLETED: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',
  ARCHIVED: 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-500',
}

const VARIANT_COLORS = ['bg-slate-500', 'bg-blue-500', 'bg-green-500', 'bg-amber-500', 'bg-purple-500']

export default function ExperimentDetail() {
  const { t } = useTranslation()
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [experiment, setExperiment] = useState<Experiment | null>(null)
  const [results, setResults] = useState<ExperimentResults | null>(null)
  const [activeTab, setActiveTab] = useState<'results' | 'config' | 'activity'>('results')
  const [isLoading, setIsLoading] = useState(true)
  const [isActing, setIsActing] = useState(false)

  const loadExperiment = () => {
    if (!id) return
    api.get(`/api/experiments/${id}`)
      .then((res) => setExperiment(res.data))
      .catch(() => toast.error('Failed to load experiment'))
      .finally(() => setIsLoading(false))
  }

  const loadResults = () => {
    if (!id) return
    api.get(`/api/experiments/${id}/results`)
      .then((res) => setResults(res.data))
      .catch(() => {})
  }

  useEffect(() => {
    loadExperiment()
    loadResults()
  }, [id])

  const handleAction = async (action: 'start' | 'pause' | 'complete') => {
    if (!id) return
    setIsActing(true)
    try {
      await api.post(`/api/experiments/${id}/${action}`)
      toast.success(`Experiment ${action}ed`)
      loadExperiment()
      if (action === 'complete') loadResults()
    } catch (err: any) {
      toast.error(err.response?.data?.message || `Failed to ${action} experiment`)
    } finally {
      setIsActing(false)
    }
  }

  const handleDelete = async () => {
    if (!id || !confirm('Delete this experiment?')) return
    try {
      await api.delete(`/api/experiments/${id}`)
      toast.success('Experiment deleted')
      navigate(-1)
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to delete')
    }
  }

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    )
  }

  if (!experiment) {
    return <div className="p-6 text-gray-500">Experiment not found.</div>
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200">
            <ArrowLeftIcon className="h-5 w-5" />
          </button>
          <BeakerIcon className="h-7 w-7 text-primary" />
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{experiment.name}</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 font-mono">{experiment.key}</p>
          </div>
          <span className={`ml-3 inline-flex items-center rounded-full px-3 py-1 text-sm font-medium ${STATUS_COLORS[experiment.status]}`}>
            {experiment.status}
          </span>
        </div>

        <div className="flex gap-2">
          {experiment.status === 'DRAFT' && (
            <>
              <button onClick={() => handleAction('start')} disabled={isActing} className="inline-flex items-center gap-1 rounded-lg bg-green-600 px-3 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50">
                <PlayIcon className="h-4 w-4" /> {t('experiments.start', 'Start')}
              </button>
              <button onClick={handleDelete} className="rounded-lg border border-red-300 px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50 dark:border-red-700 dark:text-red-400 dark:hover:bg-red-900/20">
                {t('common.delete', 'Delete')}
              </button>
            </>
          )}
          {experiment.status === 'RUNNING' && (
            <>
              <button onClick={() => handleAction('pause')} disabled={isActing} className="inline-flex items-center gap-1 rounded-lg bg-yellow-500 px-3 py-2 text-sm font-medium text-white hover:bg-yellow-600 disabled:opacity-50">
                <PauseIcon className="h-4 w-4" /> {t('experiments.pause', 'Pause')}
              </button>
              <button onClick={() => handleAction('complete')} disabled={isActing} className="inline-flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
                <CheckIcon className="h-4 w-4" /> {t('experiments.complete', 'Complete')}
              </button>
            </>
          )}
          {experiment.status === 'PAUSED' && (
            <>
              <button onClick={() => handleAction('start')} disabled={isActing} className="inline-flex items-center gap-1 rounded-lg bg-green-600 px-3 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50">
                <PlayIcon className="h-4 w-4" /> {t('experiments.resume', 'Resume')}
              </button>
              <button onClick={() => handleAction('complete')} disabled={isActing} className="inline-flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
                <CheckIcon className="h-4 w-4" /> {t('experiments.complete', 'Complete')}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Meta info */}
      {experiment.hypothesis && (
        <div className="rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 p-4">
          <h3 className="text-sm font-medium text-blue-700 dark:text-blue-300 mb-1">
            {t('experiments.hypothesis', 'Hypothesis')}
          </h3>
          <p className="text-sm text-blue-600 dark:text-blue-400">{experiment.hypothesis}</p>
        </div>
      )}

      <div className="grid grid-cols-4 gap-4">
        <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-3 bg-white dark:bg-gray-900">
          <p className="text-xs text-gray-500 dark:text-gray-400">Flag</p>
          <p className="text-sm font-medium text-gray-900 dark:text-white">{experiment.flag.name}</p>
        </div>
        <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-3 bg-white dark:bg-gray-900">
          <p className="text-xs text-gray-500 dark:text-gray-400">Environment</p>
          <p className="text-sm font-medium text-gray-900 dark:text-white">{experiment.environment.name}</p>
        </div>
        <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-3 bg-white dark:bg-gray-900">
          <p className="text-xs text-gray-500 dark:text-gray-400">Traffic</p>
          <p className="text-sm font-medium text-gray-900 dark:text-white">{experiment.trafficPercent}%</p>
        </div>
        <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-3 bg-white dark:bg-gray-900">
          <p className="text-xs text-gray-500 dark:text-gray-400">Created by</p>
          <p className="text-sm font-medium text-gray-900 dark:text-white">{experiment.createdBy.firstName} {experiment.createdBy.lastName}</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 dark:border-gray-700">
        <nav className="flex gap-6">
          {(['results', 'config'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`pb-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab
                  ? 'border-primary text-primary'
                  : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
              }`}
            >
              {tab === 'results' ? t('experiments.resultsTab', 'Results') : t('experiments.configTab', 'Configuration')}
            </button>
          ))}
        </nav>
      </div>

      {/* Results Tab */}
      {activeTab === 'results' && (
        <div className="space-y-4">
          {results && results.totalImpressions > 0 ? (
            <>
              <div className="grid grid-cols-3 gap-4">
                <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-4 bg-white dark:bg-gray-900">
                  <p className="text-xs text-gray-500 dark:text-gray-400">{t('experiments.totalImpressions', 'Total Impressions')}</p>
                  <p className="text-2xl font-bold text-gray-900 dark:text-white">{results.totalImpressions.toLocaleString()}</p>
                </div>
                <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-4 bg-white dark:bg-gray-900">
                  <p className="text-xs text-gray-500 dark:text-gray-400">{t('experiments.totalConversions', 'Total Conversions')}</p>
                  <p className="text-2xl font-bold text-gray-900 dark:text-white">{results.totalConversions.toLocaleString()}</p>
                </div>
                <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-4 bg-white dark:bg-gray-900">
                  <p className="text-xs text-gray-500 dark:text-gray-400">{t('experiments.confidence', 'Confidence')}</p>
                  <p className="text-2xl font-bold text-gray-900 dark:text-white">
                    {results.confidence > 0 ? `${(results.confidence * 100).toFixed(1)}%` : 'N/A'}
                  </p>
                  {results.winner && (
                    <p className="text-xs text-green-600 dark:text-green-400 mt-1">
                      Winner: {results.winner}
                    </p>
                  )}
                </div>
              </div>

              <div className="space-y-3">
                {results.variants.map((v, i) => {
                  const maxRate = Math.max(...results.variants.map((vv) => vv.conversionRate), 0.01)
                  return (
                    <div key={v.key} className="rounded-lg border border-gray-200 dark:border-gray-700 p-4 bg-white dark:bg-gray-900">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <div className={`h-3 w-3 rounded-full ${VARIANT_COLORS[i % VARIANT_COLORS.length]}`} />
                          <span className="text-sm font-medium text-gray-900 dark:text-white">{v.name}</span>
                          {v.isControl && <span className="text-xs text-gray-500">(control)</span>}
                          {results.winner === v.key && <span className="text-xs bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300 rounded px-1.5 py-0.5">Winner</span>}
                        </div>
                        <div className="text-right">
                          <span className="text-lg font-bold text-gray-900 dark:text-white">
                            {(v.conversionRate * 100).toFixed(2)}%
                          </span>
                          <span className="ml-2 text-xs text-gray-500">
                            ({v.conversions}/{v.impressions})
                          </span>
                        </div>
                      </div>
                      <div className="h-2 rounded-full bg-gray-100 dark:bg-gray-800">
                        <div
                          className={`h-2 rounded-full ${VARIANT_COLORS[i % VARIANT_COLORS.length]} transition-all`}
                          style={{ width: `${maxRate > 0 ? (v.conversionRate / maxRate) * 100 : 0}%` }}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
            </>
          ) : (
            <div className="text-center py-12">
              <BeakerIcon className="mx-auto h-12 w-12 text-gray-400" />
              <h3 className="mt-2 text-sm font-semibold text-gray-900 dark:text-white">
                {t('experiments.noResults', 'No results yet')}
              </h3>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                {experiment.status === 'DRAFT'
                  ? t('experiments.noResultsDraft', 'Start the experiment to begin collecting data.')
                  : t('experiments.noResultsWaiting', 'Waiting for data to come in...')}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Configuration Tab */}
      {activeTab === 'config' && (
        <div className="space-y-4">
          {/* Traffic Split Donut */}
          <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-6 bg-white dark:bg-gray-900">
            <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-4">
              {t('experiments.trafficSplit', 'Traffic Split')}
            </h3>
            <div className="flex items-center gap-8">
              <svg viewBox="0 0 100 100" className="h-32 w-32">
                {(() => {
                  let cumAngle = 0
                  return experiment.variants.map((v, i) => {
                    const angle = (v.weight / 100) * 360
                    const startAngle = cumAngle
                    cumAngle += angle
                    const startRad = ((startAngle - 90) * Math.PI) / 180
                    const endRad = ((startAngle + angle - 90) * Math.PI) / 180
                    const largeArc = angle > 180 ? 1 : 0
                    const x1 = 50 + 40 * Math.cos(startRad)
                    const y1 = 50 + 40 * Math.sin(startRad)
                    const x2 = 50 + 40 * Math.cos(endRad)
                    const y2 = 50 + 40 * Math.sin(endRad)

                    const colors = ['#64748b', '#3b82f6', '#22c55e', '#f59e0b', '#a855f7']
                    return (
                      <path
                        key={v.key}
                        d={`M 50 50 L ${x1} ${y1} A 40 40 0 ${largeArc} 1 ${x2} ${y2} Z`}
                        fill={colors[i % colors.length]}
                        stroke="white"
                        strokeWidth="1"
                      />
                    )
                  })
                })()}
              </svg>
              <div className="flex-1 space-y-2">
                {experiment.variants.map((v, i) => (
                  <div key={v.key} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className={`h-3 w-3 rounded-full ${VARIANT_COLORS[i % VARIANT_COLORS.length]}`} />
                      <span className="text-sm text-gray-700 dark:text-gray-300">{v.name}</span>
                      {v.isControl && <span className="text-xs text-gray-500">(control)</span>}
                    </div>
                    <span className="text-sm font-medium text-gray-900 dark:text-white">{v.weight}%</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Variants table */}
          <div className="rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead className="bg-gray-50 dark:bg-gray-800">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Key</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Name</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Value</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Weight</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Type</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700 bg-white dark:bg-gray-900">
                {experiment.variants.map((v) => (
                  <tr key={v.id}>
                    <td className="px-4 py-3 text-sm font-mono text-gray-900 dark:text-white">{v.key}</td>
                    <td className="px-4 py-3 text-sm text-gray-900 dark:text-white">{v.name}</td>
                    <td className="px-4 py-3 text-sm font-mono text-gray-700 dark:text-gray-300">{v.value}</td>
                    <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">{v.weight}%</td>
                    <td className="px-4 py-3 text-sm">
                      {v.isControl ? (
                        <span className="rounded bg-gray-100 dark:bg-gray-700 px-2 py-0.5 text-xs text-gray-600 dark:text-gray-400">Control</span>
                      ) : (
                        <span className="rounded bg-blue-100 dark:bg-blue-900 px-2 py-0.5 text-xs text-blue-600 dark:text-blue-400">Variant</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
