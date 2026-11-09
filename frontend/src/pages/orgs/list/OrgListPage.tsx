import { Building2, Plus } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from 'react-router-dom'
import { DataTable, type DataTableColumn } from '@/components/data/DataTable'
import { EmptyState } from '@/components/feedback/EmptyState'
import { ErrorState } from '@/components/feedback/ErrorState'
import { PageHeader } from '@/components/page/PageHeader'
import { PageToolbar } from '@/components/page/PageToolbar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import api from '@/lib/axios'
import { orgPath, ROUTES } from '@/lib/routes'

/** `GET /organizations` */
interface OrgRow {
  id: string
  name: string
  role?: string
  projectCount?: number
  memberCount?: number
}

/** Organizations of the current user. */
export default function OrgListPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [orgs, setOrgs] = useState<OrgRow[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [query, setQuery] = useState('')
  const loadId = useRef(0)

  const load = useCallback(async () => {
    const id = ++loadId.current
    setIsLoading(true)
    setLoadError(false)
    try {
      const response = await api.get('/organizations')
      if (id === loadId.current) setOrgs(response.data.organizations ?? [])
    } catch {
      if (id === loadId.current) setLoadError(true)
    } finally {
      if (id === loadId.current) setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    return q ? orgs.filter((o) => o.name.toLowerCase().includes(q)) : orgs
  }, [orgs, query])

  const columns: DataTableColumn<OrgRow>[] = [
    {
      key: 'name',
      header: t('org-pages.list.col-name'),
      cell: (org) => (
        <Link
          to={orgPath(org.id)}
          className="block truncate font-medium hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {org.name}
        </Link>
      ),
    },
    {
      key: 'role',
      header: t('org-pages.list.col-role'),
      width: '8rem',
      cell: (org) =>
        org.role ? (
          <Badge variant={org.role === 'OWNER' ? 'default' : 'neutral'}>
            {t(`roles.${org.role}`)}
          </Badge>
        ) : (
          '–'
        ),
    },
    {
      key: 'projects',
      header: t('org-pages.list.col-projects'),
      width: '7rem',
      hideBelow: 'sm',
      className: 'tabular-nums',
      cell: (org) => org.projectCount ?? '–',
    },
    {
      key: 'members',
      header: t('org-pages.list.col-members'),
      width: '7rem',
      hideBelow: 'sm',
      className: 'tabular-nums',
      cell: (org) => org.memberCount ?? '–',
    },
  ]

  const createButton = (
    <Button asChild>
      <Link to={ROUTES.newOrg}>
        <Plus className="mr-2 h-4 w-4" />
        {t('org-pages.list.create')}
      </Link>
    </Button>
  )

  let content: React.ReactNode
  if (isLoading) {
    content = (
      <DataTable
        columns={columns}
        rows={[]}
        getRowId={(o) => o.id}
        loading
        loadingRows={3}
      />
    )
  } else if (loadError) {
    content = (
      <ErrorState message={t('org-pages.list.load-error')} onRetry={load} />
    )
  } else if (orgs.length === 0) {
    content = (
      <EmptyState
        icon={<Building2 className="h-5 w-5" />}
        title={t('org-pages.list.empty-title')}
        description={t('org-pages.list.empty-text')}
        action={createButton}
      />
    )
  } else {
    content = (
      <div className="space-y-3">
        {orgs.length > 5 && (
          <PageToolbar
            onSearch={setQuery}
            searchPlaceholder={t('org-pages.list.search')}
          />
        )}
        <DataTable
          columns={columns}
          rows={visible}
          getRowId={(o) => o.id}
          label={t('org-pages.list.title')}
          onRowClick={(o) => navigate(orgPath(o.id))}
          rowFocusable={false}
          empty={
            <EmptyState
              bordered={false}
              title={t('org-pages.list.no-results')}
            />
          }
        />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader
        title={t('org-pages.list.title')}
        description={t('org-pages.list.subtitle')}
        actions={
          !isLoading && !loadError && orgs.length > 0 ? createButton : undefined
        }
      />
      {content}
    </div>
  )
}
