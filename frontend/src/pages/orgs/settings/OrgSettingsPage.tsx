import { Loader2 } from 'lucide-react'
import { type FormEvent, useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { ErrorState } from '@/components/feedback/ErrorState'
import { RoleUnavailableNotice } from '@/components/feedback/RoleUnavailableNotice'
import { PageHeader } from '@/components/page/PageHeader'
import { SettingsSection } from '@/components/page/SettingsSection'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import api from '@/lib/axios'
import { notifyWriteError } from '@/lib/permissions'
import { refreshWorkspace } from '@/lib/workspace'
import { apiMessage } from '@/pages/projects/settings/project'
import { useOrgRole } from '../orgRole'
import { OrgDangerZone } from './OrgDangerZone'

/** `GET /organizations/:id` */
interface OrgDetails {
  id: string
  name: string
  slug?: string
  description?: string | null
}

/** Organization settings: general data (ADMIN+) and deletion (OWNER). */
export default function OrgSettingsPage() {
  const { t } = useTranslation()
  const { orgId = '' } = useParams<{ orgId: string }>()
  const { canManage, isOwner, roleLoading, roleUnavailable } = useOrgRole(orgId)
  const [org, setOrg] = useState<OrgDetails | null>(null)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [saving, setSaving] = useState(false)
  const loadId = useRef(0)

  const load = useCallback(async () => {
    const id = ++loadId.current
    setIsLoading(true)
    setLoadError(false)
    try {
      const response = await api.get(`/organizations/${orgId}`)
      if (id !== loadId.current) return
      const data: OrgDetails = response.data.organization ?? response.data
      setOrg(data)
      setName(data.name ?? '')
      setDescription(data.description ?? '')
    } catch {
      if (id === loadId.current) setLoadError(true)
    } finally {
      if (id === loadId.current) setIsLoading(false)
    }
  }, [orgId])

  useEffect(() => {
    if (orgId) load()
  }, [orgId, load])

  const dirty =
    org !== null &&
    (name.trim() !== org.name || description.trim() !== (org.description ?? ''))

  const save = async (event: FormEvent) => {
    event.preventDefault()
    if (!org || !name.trim() || !dirty) return
    setSaving(true)
    try {
      const response = await api.patch(`/organizations/${orgId}`, {
        name: name.trim(),
        description: description.trim(),
      })
      const saved: OrgDetails = response.data.organization ?? {
        ...org,
        name: name.trim(),
        description: description.trim(),
      }
      setOrg(saved)
      setName(saved.name ?? '')
      setDescription(saved.description ?? '')
      // Keep the workspace switcher in sync.
      refreshWorkspace().catch(() => {})
      toast.success(t('org-pages.settings.saved'))
    } catch (error) {
      notifyWriteError(
        error,
        t,
        apiMessage(error, t('org-pages.settings.save-failed'))
      )
    } finally {
      setSaving(false)
    }
  }

  let content: React.ReactNode
  if (isLoading || roleLoading) {
    content = (
      <div className="space-y-8" aria-busy="true">
        <span role="status" className="sr-only">
          {t('common.loading')}
        </span>
        {[0, 1].map((i) => (
          <div
            key={i}
            className="grid gap-4 md:grid-cols-[minmax(0,15rem)_minmax(0,1fr)] md:gap-8"
          >
            <div className="space-y-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-3 w-40" />
            </div>
            <Skeleton className="h-32 w-full" />
          </div>
        ))}
      </div>
    )
  } else if (loadError || !org) {
    content = (
      <ErrorState message={t('org-pages.settings.load-error')} onRetry={load} />
    )
  } else {
    content = (
      <div className="space-y-10">
        <SettingsSection
          title={t('org-pages.settings.general-title')}
          description={t('org-pages.settings.general-description')}
        >
          <form
            onSubmit={save}
            className="space-y-4 rounded-lg border bg-card p-4"
          >
            <div className="space-y-2">
              <Label htmlFor="org-name">
                {t('org-pages.settings.name-label')}
              </Label>
              <Input
                id="org-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={100}
                required
                readOnly={!canManage}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="org-description">
                {t('org-pages.settings.description-label')}
              </Label>
              <textarea
                id="org-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                maxLength={1000}
                rows={3}
                readOnly={!canManage}
                placeholder={
                  canManage
                    ? t('org-pages.settings.description-placeholder')
                    : undefined
                }
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>
            {org.slug && (
              <p className="text-xs text-muted-foreground">
                {t('org-pages.settings.slug', { slug: org.slug })}
              </p>
            )}
            {canManage ? (
              <div className="flex justify-end">
                <Button
                  type="submit"
                  disabled={saving || !dirty || !name.trim()}
                >
                  {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {t('common.save')}
                </Button>
              </div>
            ) : (
              !roleUnavailable && (
                <p className="text-xs text-muted-foreground">
                  {t('org-pages.settings.read-only')}
                </p>
              )
            )}
          </form>
        </SettingsSection>
        {isOwner && <OrgDangerZone org={org} />}
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader
        title={t('org-pages.settings.title')}
        description={t('org-pages.settings.subtitle')}
      />
      <RoleUnavailableNotice show={roleUnavailable} />
      {content}
    </div>
  )
}
