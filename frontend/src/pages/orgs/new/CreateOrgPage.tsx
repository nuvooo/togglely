import { Loader2 } from 'lucide-react'
import { type FormEvent, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from 'react-router-dom'
import { PageHeader } from '@/components/page/PageHeader'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import api from '@/lib/axios'
import { orgPath, ROUTES } from '@/lib/routes'
import { refreshWorkspace } from '@/lib/workspace'
import { apiMessage } from '@/pages/projects/settings/project'
import { useWorkspaceStore } from '@/store/workspaceStore'

/** Compact form for a new organization; the creator becomes its OWNER. */
export default function CreateOrgPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!name.trim()) return
    setBusy(true)
    setError(null)
    try {
      const response = await api.post('/organizations', { name: name.trim() })
      const org = response.data.organization ?? response.data
      useWorkspaceStore.getState().rememberOrg(org.id)
      // Keep the workspace switcher in sync before the org pages read it.
      await refreshWorkspace().catch(() => {})
      navigate(orgPath(org.id))
    } catch (err) {
      setError(apiMessage(err, t('org-pages.new.failed')))
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <PageHeader
        breadcrumb={[
          { label: t('org-pages.list.title'), to: ROUTES.orgs },
          { label: t('org-pages.new.title') },
        ]}
        title={t('org-pages.new.title')}
        description={t('org-pages.new.subtitle')}
      />
      <form
        onSubmit={submit}
        className="space-y-4 rounded-lg border bg-card p-4 sm:p-6"
      >
        {error && (
          <p
            role="alert"
            className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            {error}
          </p>
        )}
        <div className="space-y-2">
          <Label htmlFor="org-name">{t('org-pages.new.name-label')}</Label>
          <Input
            id="org-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('org-pages.new.name-placeholder')}
            maxLength={100}
            required
            autoFocus
            aria-describedby="org-name-hint"
          />
          <p id="org-name-hint" className="text-xs text-muted-foreground">
            {t('org-pages.new.name-hint')}
          </p>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" asChild>
            <Link to={ROUTES.orgs}>{t('common.cancel')}</Link>
          </Button>
          <Button type="submit" disabled={busy || !name.trim()}>
            {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t('org-pages.new.submit')}
          </Button>
        </div>
      </form>
    </div>
  )
}
