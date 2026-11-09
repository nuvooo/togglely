import { Flag, Plus, SearchX } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { EmptyState } from '@/components/feedback/EmptyState'
import { ErrorState } from '@/components/feedback/ErrorState'
import { FlagValueDialog } from '@/components/flags/FlagValueDialog'
import { PageHeader } from '@/components/page/PageHeader'
import { type FilterChip, PageToolbar } from '@/components/page/PageToolbar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { getErrorMessage } from '@/lib/errors'
import { ROUTES } from '@/lib/routes'
import { CreateFlagDialog } from './CreateFlagDialog'
import { FlagsTable } from './FlagsTable'
import {
  environmentColumns,
  type FlagFilter,
  isFlagFilter,
  matchesFilter,
  matchesSearch,
} from './flagsFilter'
import { type EditingValue, type FeatureFlag, FLAG_TYPES } from './types'
import { useProjectFlags } from './useProjectFlags'

// MongoDB ObjectId (24 hex chars)
const isValidObjectId = (id: string | undefined): id is string =>
  !!id && /^[0-9a-fA-F]{24}$/.test(id)

export default function FlagsPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { projectId: rawProjectId } = useParams<{ projectId: string }>()
  const projectId = isValidObjectId(rawProjectId) ? rawProjectId : null
  const data = useProjectFlags(projectId)
  const { project, flags, isMulti, isLoading, error } = data

  const [searchParams, setSearchParams] = useSearchParams()
  const query = searchParams.get('q') ?? ''
  const rawFilter = searchParams.get('filter')
  const filter: FlagFilter = isFlagFilter(rawFilter) ? rawFilter : 'all'

  const [createOpen, setCreateOpen] = useState(false)
  // `flagToDelete` outlives `deleteOpen` so the dialog text stays while it closes
  const [flagToDelete, setFlagToDelete] = useState<FeatureFlag | null>(null)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  // Value editor (default or brand). `editing` outlives `editorOpen` so the
  // dialog keeps its content while it animates out.
  const [editing, setEditing] = useState<EditingValue | null>(null)
  const [editorOpen, setEditorOpen] = useState(false)
  const openEditor = (value: EditingValue) => {
    setEditing(value)
    setEditorOpen(true)
  }

  /** Updates URL params in place (no history entry); empty values are removed. */
  const updateParams = (changes: Record<string, string | null>) =>
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        for (const [key, value] of Object.entries(changes)) {
          if (value) next.set(key, value)
          else next.delete(key)
        }
        return next
      },
      { replace: true }
    )

  // `?new=1` (command palette "New flag") opens the create dialog once.
  // biome-ignore lint/correctness/useExhaustiveDependencies: updateParams is stable enough (setSearchParams)
  useEffect(() => {
    if (searchParams.get('new') !== '1') return
    setCreateOpen(true)
    updateParams({ new: null })
  }, [searchParams])

  const environments = useMemo(
    () => environmentColumns(project?.environments, flags),
    [project?.environments, flags]
  )
  const lastEnvironment = environments[environments.length - 1]

  const searched = useMemo(
    () => flags.filter((flag) => matchesSearch(flag, query)),
    [flags, query]
  )
  const visible = searched.filter((flag) =>
    matchesFilter(flag, filter, lastEnvironment?.id)
  )

  const count = (id: FlagFilter) =>
    searched.filter((flag) => matchesFilter(flag, id, lastEnvironment?.id))
      .length
  const presentTypes = FLAG_TYPES.filter((type) =>
    flags.some((flag) => flag.flagType === type)
  )
  const chips: FilterChip[] = [
    {
      id: 'all',
      label: t('flags-page.filter-all'),
      count: searched.length,
      active: filter === 'all',
    },
    ...(lastEnvironment
      ? [
          {
            id: 'enabled',
            label: t('flags-page.filter-enabled', {
              environment: lastEnvironment.name,
            }),
            count: count('enabled'),
            active: filter === 'enabled',
          },
        ]
      : []),
    ...presentTypes.map((type) => ({
      id: type,
      label: type,
      count: count(type),
      active: filter === type,
    })),
  ]

  const toggleExpanded = (flagId: string) =>
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(flagId)) next.delete(flagId)
      else next.add(flagId)
      return next
    })

  const confirmDelete = async () => {
    if (!flagToDelete) return
    try {
      await data.deleteFlag(flagToDelete)
      toast.success(t('flags-page.deleted', { name: flagToDelete.name }))
    } catch (err) {
      toast.error(getErrorMessage(err))
    }
  }

  const backToOrgs = (
    <Button variant="outline" onClick={() => navigate(ROUTES.orgs)}>
      {t('project-detail.back-to-organizations')}
    </Button>
  )

  if (!projectId || error === 'not-found') {
    return (
      <div className="mx-auto max-w-6xl">
        <EmptyState
          icon={<Flag className="h-5 w-5" />}
          title={t('project-detail.not-found')}
          action={backToOrgs}
        />
      </div>
    )
  }

  const newFlagButton = (
    <Button onClick={() => setCreateOpen(true)}>
      <Plus className="mr-2 h-4 w-4" />
      {t('flags-page.new')}
    </Button>
  )

  const hasFlags = flags.length > 0
  let content: React.ReactNode
  if (error === 'failed') {
    content = (
      <ErrorState message={t('flags-page.load-error')} onRetry={data.reload} />
    )
  } else if (!isLoading && !hasFlags) {
    content = (
      <EmptyState
        icon={<Flag className="h-5 w-5" />}
        title={t('project-detail.empty.title')}
        description={t('project-detail.empty.description')}
        action={newFlagButton}
      />
    )
  } else {
    content = (
      <div className="space-y-3">
        {hasFlags && (
          <PageToolbar
            onSearch={(value) => updateParams({ q: value })}
            defaultSearch={query}
            searchPlaceholder={t('flags-page.search')}
            filters={chips}
            onFilterChange={(id) =>
              updateParams({ filter: id === 'all' ? null : id })
            }
          />
        )}
        <FlagsTable
          projectId={projectId}
          flags={visible}
          environments={environments}
          multi={isMulti}
          loading={isLoading}
          actions={data}
          onEdit={openEditor}
          onDelete={(flag) => {
            setFlagToDelete(flag)
            setDeleteOpen(true)
          }}
          expanded={expanded}
          onToggleExpanded={toggleExpanded}
          empty={
            <EmptyState
              bordered={false}
              icon={<SearchX className="h-5 w-5" />}
              title={t('flags-page.no-results')}
              description={t('flags-page.no-results-text')}
            />
          }
        />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        title={t('flags-page.title')}
        description={t('flags-page.subtitle')}
        meta={
          isMulti ? (
            <Badge variant="outline">{t('flags-page.multi-badge')}</Badge>
          ) : undefined
        }
        actions={hasFlags && !error ? newFlagButton : undefined}
      />
      {content}

      <CreateFlagDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        projectName={project?.name ?? ''}
        onCreate={data.createFlag}
      />

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title={t('project-detail.delete-flag.title')}
        description={t('flags-page.delete-description', {
          name: flagToDelete?.name ?? '',
        })}
        confirmLabel={t('common.delete')}
        onConfirm={confirmDelete}
      />

      <FlagValueDialog
        open={editorOpen}
        onOpenChange={setEditorOpen}
        flagType={editing?.flag.flagType ?? 'STRING'}
        flagName={editing?.flag.name ?? ''}
        environmentName={editing?.env.environmentName ?? ''}
        targetName={
          !isMulti
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
        onSave={(value) =>
          editing
            ? data.saveValue(editing.flag, editing.env, editing.brand, value)
            : Promise.resolve()
        }
      />
    </div>
  )
}
