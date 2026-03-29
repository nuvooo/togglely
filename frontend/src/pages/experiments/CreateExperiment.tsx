import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { BeakerIcon, PlusIcon, TrashIcon } from '@heroicons/react/24/outline'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import api from '@/lib/api'

interface Flag {
  id: string
  name: string
  key: string
  flagType: string
}

interface Environment {
  id: string
  name: string
  key: string
}

interface VariantForm {
  key: string
  name: string
  value: string
  weight: number
  isControl: boolean
}

export default function CreateExperiment() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const projectId = searchParams.get('projectId') || ''
  const preselectedFlagId = searchParams.get('flagId') || ''

  const [step, setStep] = useState(1)
  const [flags, setFlags] = useState<Flag[]>([])
  const [environments, setEnvironments] = useState<Environment[]>([])
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Form state
  const [name, setName] = useState('')
  const [key, setKey] = useState('')
  const [hypothesis, setHypothesis] = useState('')
  const [flagId, setFlagId] = useState(preselectedFlagId)
  const [environmentId, setEnvironmentId] = useState('')
  const [trafficPercent, setTrafficPercent] = useState(100)
  const [variants, setVariants] = useState<VariantForm[]>([
    { key: 'control', name: 'Control', value: '', weight: 50, isControl: true },
    { key: 'variant_a', name: 'Variant A', value: '', weight: 50, isControl: false },
  ])

  useEffect(() => {
    if (!projectId) return
    api.get(`/api/feature-flags/project/${projectId}`).then((res) => setFlags(res.data)).catch(() => {})
    api.get(`/api/environments/${projectId}`).then((res) => setEnvironments(res.data)).catch(() => {})
  }, [projectId])

  // Auto-generate key from name
  useEffect(() => {
    if (name && !key) {
      setKey(name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''))
    }
  }, [name, key])

  const totalWeight = variants.reduce((sum, v) => sum + v.weight, 0)
  const isWeightValid = totalWeight === 100
  const hasControl = variants.some((v) => v.isControl)

  const addVariant = () => {
    const idx = variants.length - 1
    const letter = String.fromCharCode(97 + idx) // a, b, c...
    setVariants([...variants, {
      key: `variant_${letter}`,
      name: `Variant ${letter.toUpperCase()}`,
      value: '',
      weight: 0,
      isControl: false,
    }])
  }

  const removeVariant = (index: number) => {
    if (variants.length <= 2) return
    setVariants(variants.filter((_, i) => i !== index))
  }

  const updateVariant = (index: number, field: keyof VariantForm, value: string | number | boolean) => {
    const updated = [...variants]
    updated[index] = { ...updated[index], [field]: value }
    setVariants(updated)
  }

  const distributeWeightsEvenly = () => {
    const weight = Math.floor(100 / variants.length)
    const remainder = 100 - weight * variants.length
    setVariants(variants.map((v, i) => ({
      ...v,
      weight: weight + (i === 0 ? remainder : 0),
    })))
  }

  const handleSubmit = async () => {
    setIsSubmitting(true)
    try {
      const res = await api.post('/api/experiments', {
        name,
        key,
        hypothesis: hypothesis || undefined,
        flagId,
        environmentId,
        trafficPercent,
        variants,
      })
      toast.success(t('experiments.created', 'Experiment created successfully'))
      navigate(`/experiments/${res.data.id}`)
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to create experiment')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <BeakerIcon className="h-7 w-7 text-primary" />
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
          {t('experiments.createTitle', 'Create Experiment')}
        </h1>
      </div>

      {/* Step indicator */}
      <div className="flex items-center gap-2">
        {[1, 2, 3, 4].map((s) => (
          <div key={s} className="flex items-center gap-2">
            <div className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-medium ${
              step >= s ? 'bg-primary text-white' : 'bg-gray-200 text-gray-600 dark:bg-gray-700 dark:text-gray-400'
            }`}>
              {s}
            </div>
            {s < 4 && <div className={`h-0.5 w-8 ${step > s ? 'bg-primary' : 'bg-gray-200 dark:bg-gray-700'}`} />}
          </div>
        ))}
      </div>

      {/* Step 1: Basic info */}
      {step === 1 && (
        <div className="space-y-4 rounded-lg border border-gray-200 dark:border-gray-700 p-6 bg-white dark:bg-gray-900">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            {t('experiments.step1', 'Basic Information')}
          </h2>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              {t('experiments.nameLabel', 'Experiment Name')}
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white"
              placeholder="e.g., Homepage CTA Test"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              {t('experiments.keyLabel', 'Key')}
            </label>
            <input
              type="text"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm font-mono text-gray-900 dark:text-white"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              {t('experiments.hypothesisLabel', 'Hypothesis (optional)')}
            </label>
            <textarea
              value={hypothesis}
              onChange={(e) => setHypothesis(e.target.value)}
              rows={3}
              className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white"
              placeholder="We believe that..."
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              {t('experiments.flagLabel', 'Feature Flag')}
            </label>
            <select
              value={flagId}
              onChange={(e) => setFlagId(e.target.value)}
              className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white"
            >
              <option value="">Select a flag...</option>
              {flags.map((f) => (
                <option key={f.id} value={f.id}>{f.name} ({f.key})</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              {t('experiments.environmentLabel', 'Environment')}
            </label>
            <select
              value={environmentId}
              onChange={(e) => setEnvironmentId(e.target.value)}
              className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white"
            >
              <option value="">Select an environment...</option>
              {environments.map((e) => (
                <option key={e.id} value={e.id}>{e.name}</option>
              ))}
            </select>
          </div>

          <div className="flex justify-end">
            <button
              onClick={() => setStep(2)}
              disabled={!name || !key || !flagId || !environmentId}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {t('common.next', 'Next')}
            </button>
          </div>
        </div>
      )}

      {/* Step 2: Variants */}
      {step === 2 && (
        <div className="space-y-4 rounded-lg border border-gray-200 dark:border-gray-700 p-6 bg-white dark:bg-gray-900">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              {t('experiments.step2', 'Variants')}
            </h2>
            <div className="flex gap-2">
              <button
                onClick={distributeWeightsEvenly}
                className="text-xs text-primary hover:underline"
              >
                {t('experiments.distributeEvenly', 'Distribute evenly')}
              </button>
              <button onClick={addVariant} className="inline-flex items-center gap-1 text-sm text-primary hover:underline">
                <PlusIcon className="h-4 w-4" /> {t('experiments.addVariant', 'Add Variant')}
              </button>
            </div>
          </div>

          {!isWeightValid && (
            <div className="rounded-lg bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 p-3 text-sm text-yellow-700 dark:text-yellow-300">
              Weights must sum to 100% (currently {totalWeight}%)
            </div>
          )}

          <div className="space-y-3">
            {variants.map((v, i) => (
              <div key={i} className="flex items-start gap-3 rounded-lg border border-gray-200 dark:border-gray-700 p-3">
                <div className="flex-1 grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Key</label>
                    <input
                      value={v.key}
                      onChange={(e) => updateVariant(i, 'key', e.target.value)}
                      className="w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-2 py-1.5 text-sm font-mono text-gray-900 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Name</label>
                    <input
                      value={v.name}
                      onChange={(e) => updateVariant(i, 'name', e.target.value)}
                      className="w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-2 py-1.5 text-sm text-gray-900 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Value</label>
                    <input
                      value={v.value}
                      onChange={(e) => updateVariant(i, 'value', e.target.value)}
                      className="w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-2 py-1.5 text-sm text-gray-900 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Weight (%)</label>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={v.weight}
                      onChange={(e) => updateVariant(i, 'weight', Number(e.target.value))}
                      className="w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-2 py-1.5 text-sm text-gray-900 dark:text-white"
                    />
                  </div>
                </div>
                <div className="flex flex-col items-center gap-1 pt-5">
                  <label className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
                    <input
                      type="radio"
                      name="control"
                      checked={v.isControl}
                      onChange={() => {
                        setVariants(variants.map((vv, ii) => ({ ...vv, isControl: ii === i })))
                      }}
                    />
                    Control
                  </label>
                  {variants.length > 2 && (
                    <button onClick={() => removeVariant(i)} className="text-red-500 hover:text-red-700 p-1">
                      <TrashIcon className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="flex justify-between">
            <button onClick={() => setStep(1)} className="rounded-lg border border-gray-300 dark:border-gray-600 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800">
              {t('common.back', 'Back')}
            </button>
            <button
              onClick={() => setStep(3)}
              disabled={!isWeightValid || !hasControl || variants.length < 2}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {t('common.next', 'Next')}
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Traffic */}
      {step === 3 && (
        <div className="space-y-4 rounded-lg border border-gray-200 dark:border-gray-700 p-6 bg-white dark:bg-gray-900">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            {t('experiments.step3', 'Traffic Allocation')}
          </h2>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              {t('experiments.trafficLabel', 'Percentage of traffic to include in experiment')}
            </label>
            <div className="flex items-center gap-4">
              <input
                type="range"
                min={1}
                max={100}
                value={trafficPercent}
                onChange={(e) => setTrafficPercent(Number(e.target.value))}
                className="flex-1"
              />
              <span className="text-lg font-semibold text-gray-900 dark:text-white w-16 text-right">
                {trafficPercent}%
              </span>
            </div>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              {t('experiments.trafficHelp', 'Users not in the experiment will see the default flag value.')}
            </p>
          </div>

          <div className="flex justify-between">
            <button onClick={() => setStep(2)} className="rounded-lg border border-gray-300 dark:border-gray-600 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800">
              {t('common.back', 'Back')}
            </button>
            <button onClick={() => setStep(4)} className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90">
              {t('common.next', 'Next')}
            </button>
          </div>
        </div>
      )}

      {/* Step 4: Review */}
      {step === 4 && (
        <div className="space-y-4 rounded-lg border border-gray-200 dark:border-gray-700 p-6 bg-white dark:bg-gray-900">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            {t('experiments.step4', 'Review')}
          </h2>

          <dl className="space-y-3">
            <div className="flex justify-between border-b border-gray-100 dark:border-gray-800 pb-2">
              <dt className="text-sm text-gray-500 dark:text-gray-400">Name</dt>
              <dd className="text-sm font-medium text-gray-900 dark:text-white">{name}</dd>
            </div>
            <div className="flex justify-between border-b border-gray-100 dark:border-gray-800 pb-2">
              <dt className="text-sm text-gray-500 dark:text-gray-400">Key</dt>
              <dd className="text-sm font-mono text-gray-900 dark:text-white">{key}</dd>
            </div>
            <div className="flex justify-between border-b border-gray-100 dark:border-gray-800 pb-2">
              <dt className="text-sm text-gray-500 dark:text-gray-400">Flag</dt>
              <dd className="text-sm text-gray-900 dark:text-white">{flags.find((f) => f.id === flagId)?.name}</dd>
            </div>
            <div className="flex justify-between border-b border-gray-100 dark:border-gray-800 pb-2">
              <dt className="text-sm text-gray-500 dark:text-gray-400">Environment</dt>
              <dd className="text-sm text-gray-900 dark:text-white">{environments.find((e) => e.id === environmentId)?.name}</dd>
            </div>
            <div className="flex justify-between border-b border-gray-100 dark:border-gray-800 pb-2">
              <dt className="text-sm text-gray-500 dark:text-gray-400">Traffic</dt>
              <dd className="text-sm font-medium text-gray-900 dark:text-white">{trafficPercent}%</dd>
            </div>
          </dl>

          <div>
            <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Variants</h3>
            <div className="space-y-2">
              {variants.map((v) => (
                <div key={v.key} className="flex items-center justify-between rounded-lg bg-gray-50 dark:bg-gray-800 px-3 py-2">
                  <div>
                    <span className="text-sm font-medium text-gray-900 dark:text-white">{v.name}</span>
                    {v.isControl && <span className="ml-2 text-xs text-gray-500">(control)</span>}
                  </div>
                  <span className="text-sm text-gray-700 dark:text-gray-300">{v.weight}%</span>
                </div>
              ))}
            </div>
          </div>

          <div className="flex justify-between">
            <button onClick={() => setStep(3)} className="rounded-lg border border-gray-300 dark:border-gray-600 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800">
              {t('common.back', 'Back')}
            </button>
            <button
              onClick={handleSubmit}
              disabled={isSubmitting}
              className="rounded-lg bg-primary px-6 py-2 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-50"
            >
              {isSubmitting ? t('common.creating', 'Creating...') : t('experiments.createButton', 'Create Experiment')}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
