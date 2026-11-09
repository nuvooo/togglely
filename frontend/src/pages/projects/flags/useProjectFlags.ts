import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import api from '@/lib/axios'
import { getErrorStatus } from '@/lib/errors'
import { handleForbidden, notifyWriteError } from '@/lib/permissions'
import type {
  BrandFlagValue,
  FeatureFlag,
  FlagEnvironment,
  FlagsProject,
  FlagType,
} from './types'

type FlagsLoadError = 'not-found' | 'failed' | null

export interface NewFlag {
  name: string
  key: string
  type: FlagType
}

const INITIAL_VALUE: Record<FlagType, string> = {
  BOOLEAN: 'false',
  NUMBER: '0',
  JSON: '{}',
  STRING: '',
}

async function fetchFlags(projectId: string, multi: boolean) {
  if (multi) {
    const res = await api.get(`/projects/${projectId}/flags-with-brands`)
    return (res.data.flags ?? []) as FeatureFlag[]
  }
  const res = await api.get(`/feature-flags/project/${projectId}`)
  return (res.data.featureFlags ?? []) as FeatureFlag[]
}

export const defaultRowKey = (flagId: string, environmentId: string) =>
  `${flagId}-${environmentId}-default`

export const brandRowKey = (
  flagId: string,
  environmentId: string,
  brandId: string
) => `${flagId}-${environmentId}-${brandId}`

/**
 * Project + flags of the flags page with all mutations. Mutations update
 * optimistically, mark the row busy and refetch afterwards; on error they
 * toast and refetch instead of restoring a snapshot (which could revert
 * concurrent changes of other rows).
 */
export function useProjectFlags(projectId: string | null) {
  const { t } = useTranslation()
  const [project, setProject] = useState<FlagsProject | null>(null)
  const [flags, setFlags] = useState<FeatureFlag[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<FlagsLoadError>(null)
  const [busyRows, setBusyRows] = useState<Set<string>>(new Set())
  const isMulti = project?.type === 'MULTI'
  const isMultiRef = useRef(isMulti)
  isMultiRef.current = isMulti
  /** Id of the latest load; responses for a previous project are dropped. */
  const loadId = useRef(0)

  const load = useCallback(async () => {
    const id = ++loadId.current
    const current = () => id === loadId.current
    if (!projectId) {
      setIsLoading(false)
      return
    }
    setIsLoading(true)
    setError(null)
    try {
      const projectRes = await api.get(`/projects/${projectId}`)
      if (!current()) return
      const data = (projectRes.data?.project ?? projectRes.data) as
        | FlagsProject
        | undefined
      if (!data?.id) {
        setError('not-found')
        return
      }
      const list = await fetchFlags(projectId, data.type === 'MULTI')
      if (!current()) return
      isMultiRef.current = data.type === 'MULTI'
      setProject(data)
      setFlags(Array.isArray(list) ? list : [])
    } catch (err) {
      if (current())
        setError(getErrorStatus(err) === 404 ? 'not-found' : 'failed')
    } finally {
      if (current()) setIsLoading(false)
    }
  }, [projectId])

  useEffect(() => {
    load()
  }, [load])

  /** Reloads only the flags (after a mutation), keeping the page mounted. */
  const refresh = async () => {
    if (!projectId) return
    const id = loadId.current
    try {
      const list = await fetchFlags(projectId, isMultiRef.current)
      if (id !== loadId.current) return // project changed meanwhile
      setFlags(Array.isArray(list) ? list : [])
    } catch (err) {
      console.error('Failed to refresh flags:', err)
    }
  }

  /** Optimistically patches one environment of one flag. */
  const patchEnvironment = (
    flagId: string,
    environmentId: string,
    patch: (env: FlagEnvironment) => FlagEnvironment
  ) => {
    setFlags((prev) =>
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

  const mutate = async (
    rowKey: string,
    optimistic: () => void,
    request: () => Promise<unknown>,
    onSuccess?: () => void
  ) => {
    optimistic()
    setBusyRows((prev) => new Set(prev).add(rowKey))
    try {
      await request()
      onSuccess?.()
      await refresh()
    } catch (err) {
      notifyWriteError(err, t)
      await refresh()
    } finally {
      setBusyRows((prev) => {
        const next = new Set(prev)
        next.delete(rowKey)
        return next
      })
    }
  }

  /** Toggles the environment default (brandId null); inheriting brands follow. */
  const toggleDefault = (
    flag: FeatureFlag,
    env: FlagEnvironment,
    enabled: boolean
  ) => {
    const sync = flag.flagType === 'BOOLEAN' ? String(enabled) : undefined
    return mutate(
      defaultRowKey(flag.id, env.environmentId),
      () =>
        patchEnvironment(flag.id, env.environmentId, (e) => ({
          ...e,
          enabled,
          ...(sync !== undefined && { defaultValue: sync }),
          brandValues: e.brandValues?.map((bv) =>
            bv.inherited
              ? {
                  ...bv,
                  enabled,
                  ...(sync !== undefined && { defaultValue: sync }),
                }
              : bv
          ),
        })),
      () =>
        api.post(`/feature-flags/${flag.id}/toggle`, {
          environmentId: env.environmentId,
          enabled,
        })
    )
  }

  /** Toggles a brand; an inheriting brand gets its own override row. */
  const toggleBrand = (
    flag: FeatureFlag,
    env: FlagEnvironment,
    brand: BrandFlagValue,
    enabled: boolean
  ) => {
    const sync = flag.flagType === 'BOOLEAN' ? String(enabled) : undefined
    return mutate(
      brandRowKey(flag.id, env.environmentId, brand.brandId),
      () =>
        patchEnvironment(flag.id, env.environmentId, (e) => ({
          ...e,
          brandValues: e.brandValues?.map((bv) =>
            bv.brandId === brand.brandId
              ? {
                  ...bv,
                  enabled,
                  inherited: false,
                  isBrandSpecific: true,
                  ...(sync !== undefined && { defaultValue: sync }),
                }
              : bv
          ),
        })),
      () =>
        api.post(`/brands/${brand.brandId}/flags/${flag.id}/toggle`, {
          environmentId: env.environmentId,
          enabled,
        })
    )
  }

  /**
   * Unlinks a brand: creates its own row seeded with the current (default)
   * values; the value itself does not change.
   */
  const unlinkBrand = (
    flag: FeatureFlag,
    env: FlagEnvironment,
    brand: BrandFlagValue
  ) =>
    mutate(
      brandRowKey(flag.id, env.environmentId, brand.brandId),
      () =>
        patchEnvironment(flag.id, env.environmentId, (e) => ({
          ...e,
          brandValues: e.brandValues?.map((bv) =>
            bv.brandId === brand.brandId
              ? { ...bv, inherited: false, isBrandSpecific: true }
              : bv
          ),
        })),
      () =>
        api.post(`/brands/${brand.brandId}/flags/${flag.id}/toggle`, {
          environmentId: env.environmentId,
          enabled: brand.enabled,
        })
    )

  /** Re-links a brand: deletes its override, it follows the default again. */
  const relinkBrand = (
    flag: FeatureFlag,
    env: FlagEnvironment,
    brand: BrandFlagValue
  ) =>
    mutate(
      brandRowKey(flag.id, env.environmentId, brand.brandId),
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
        ),
      () =>
        toast.success(
          t('brand-values.relinked', {
            name: brand.brandName,
            value:
              flag.flagType === 'BOOLEAN'
                ? t(
                    env.enabled
                      ? 'brand-values.state-on'
                      : 'brand-values.state-off'
                  )
                : env.defaultValue,
          })
        )
    )

  /** Saves an edited value; with a brand this creates/updates its override. */
  const saveValue = async (
    flag: FeatureFlag,
    env: FlagEnvironment,
    brand: BrandFlagValue | undefined,
    value: string
  ) => {
    try {
      await api.patch(
        `/feature-flags/${flag.id}/environments/${env.environmentId}/value`,
        brand ? { value, brandId: brand.brandId } : { value }
      )
    } catch (err) {
      handleForbidden(err, t) // the dialog shows the message
      throw err
    }
    await refresh()
  }

  /** Creates a flag; rejects on error (the dialog shows it). */
  const createFlag = async ({ name, key, type }: NewFlag) => {
    if (!projectId) return
    const value = INITIAL_VALUE[type]
    // The backend falls back to 'false' for environments missing here, which
    // is no valid value for non-boolean flags: send every environment.
    const envKeys = project?.environments?.length
      ? project.environments.map((env) => env.key)
      : ['development', 'production']
    const initialValues = Object.fromEntries(
      envKeys.map((envKey) => [envKey, { enabled: false, value }])
    )
    try {
      await api.post(`/feature-flags/project/${projectId}`, {
        name,
        key,
        type,
        initialValues,
      })
    } catch (err) {
      handleForbidden(err, t) // the dialog shows the message
      throw err
    }
    await refresh()
  }

  /** Deletes a flag; rejects on error. */
  const deleteFlag = async (flag: FeatureFlag) => {
    try {
      await api.delete(`/feature-flags/${flag.id}`)
    } catch (err) {
      handleForbidden(err, t) // the confirm dialog shows the message
      throw err
    }
    setFlags((prev) => prev.filter((f) => f.id !== flag.id))
  }

  return {
    project,
    flags,
    isMulti,
    isLoading,
    error,
    reload: load,
    isBusy: (key: string) => busyRows.has(key),
    toggleDefault,
    toggleBrand,
    unlinkBrand,
    relinkBrand,
    saveValue,
    createFlag,
    deleteFlag,
  }
}

