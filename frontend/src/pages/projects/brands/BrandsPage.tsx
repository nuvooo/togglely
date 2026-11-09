import { Building2, MoreHorizontal, Pencil, Plus, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { DataTable, type DataTableColumn } from '@/components/data/DataTable'
import { EmptyState } from '@/components/feedback/EmptyState'
import { ErrorState } from '@/components/feedback/ErrorState'
import { PageHeader } from '@/components/page/PageHeader'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import api from '@/lib/axios'
import { brandPath, projectPath } from '@/lib/routes'
import {
  apiMessage,
  fetchProject,
  type ProjectType,
  useCanManageProject,
} from '../settings/project'
import { type Brand, BrandDialog, type BrandInput } from './BrandDialog'

export default function BrandsPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { projectId = '' } = useParams<{ projectId: string }>()
  const { canManage, roleLoading } = useCanManageProject(projectId)
  const [projectType, setProjectType] = useState<ProjectType | null>(null)
  const [brands, setBrands] = useState<Brand[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  // Targets outlive the open flags so the dialogs keep their content while closing.
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<Brand | null>(null)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleting, setDeleting] = useState<Brand | null>(null)

  const load = useCallback(async () => {
    setIsLoading(true)
    setLoadError(false)
    try {
      const project = await fetchProject(projectId)
      setProjectType(project.type)
      if (project.type === 'MULTI') {
        const response = await api.get(`/brands/project/${projectId}`)
        setBrands(response.data.brands ?? [])
      } else {
        setBrands([])
      }
    } catch {
      setLoadError(true)
    } finally {
      setIsLoading(false)
    }
  }, [projectId])

  useEffect(() => {
    if (projectId) load()
  }, [projectId, load])

  const save = async ({ name, key, description }: BrandInput) => {
    try {
      if (editing) {
        const response = await api.patch(`/brands/${editing.id}`, {
          name,
          description,
        })
        const updated: Brand = response.data.brand ?? response.data
        setBrands((list) =>
          list.map((b) => (b.id === editing.id ? { ...b, ...updated } : b))
        )
        toast.success(t('brands-page.toast.updated'))
      } else {
        const response = await api.post(`/brands/project/${projectId}`, {
          name,
          key,
          description,
        })
        setBrands((list) => [...list, response.data.brand ?? response.data])
        toast.success(t('brands-page.toast.created'))
      }
    } catch (error) {
      toast.error(
        apiMessage(
          error,
          editing
            ? t('brands-page.toast.update-failed')
            : t('brands-page.toast.create-failed')
        )
      )
      throw error
    }
  }

  const remove = async () => {
    if (!deleting) return
    try {
      await api.delete(`/brands/${deleting.id}`)
      setBrands((list) => list.filter((b) => b.id !== deleting.id))
      toast.success(t('brands-page.toast.deleted'))
    } catch (error) {
      toast.error(apiMessage(error, t('brands-page.toast.delete-failed')))
    }
  }

  const openCreate = () => {
    setEditing(null)
    setDialogOpen(true)
  }

  const loading = isLoading || roleLoading
  const isMulti = projectType === 'MULTI'

  const columns: DataTableColumn<Brand>[] = [
    {
      key: 'name',
      header: t('brands-page.col-name'),
      cell: (brand) => (
        <Link
          to={brandPath(projectId, brand.id)}
          className="font-medium text-foreground hover:underline"
        >
          {brand.name}
        </Link>
      ),
    },
    {
      key: 'key',
      header: t('brands-page.col-key'),
      cell: (brand) => (
        <code className="font-mono text-xs text-muted-foreground">
          {brand.key}
        </code>
      ),
    },
    {
      key: 'description',
      header: t('brands-page.col-description'),
      hideBelow: 'md',
      className: 'max-w-xs truncate text-muted-foreground',
      cell: (brand) => brand.description || '–',
    },
  ]
  if (canManage && !loading) {
    columns.push({
      key: 'actions',
      header: t('brands-page.col-actions'),
      srOnlyHeader: true,
      width: '3rem',
      align: 'right',
      className: 'px-2',
      cell: (brand) => (
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground"
              aria-label={t('brands-page.actions', { name: brand.name })}
            >
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              onSelect={() => {
                setEditing(brand)
                setDialogOpen(true)
              }}
            >
              <Pencil className="mr-2 h-4 w-4" />
              {t('common.edit')}
            </DropdownMenuItem>
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onSelect={() => {
                setDeleting(brand)
                setDeleteOpen(true)
              }}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              {t('common.delete')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    })
  }

  const addButton = (
    <Button onClick={openCreate}>
      <Plus className="mr-2 h-4 w-4" />
      {t('brands-page.add')}
    </Button>
  )

  let content: React.ReactNode
  if (loading) {
    content = (
      <DataTable
        columns={columns}
        rows={[]}
        getRowId={(b) => b.id}
        loading
        loadingRows={3}
      />
    )
  } else if (loadError) {
    content = (
      <ErrorState message={t('brands-page.load-error')} onRetry={load} />
    )
  } else if (!isMulti) {
    content = (
      <EmptyState
        icon={<Building2 className="h-5 w-5" />}
        title={t('brands-page.single-title')}
        description={t('brands-page.single-text')}
        action={
          canManage ? (
            <Button variant="outline" asChild>
              <Link to={projectPath(projectId, 'settings')}>
                {t('brands-page.single-action')}
              </Link>
            </Button>
          ) : undefined
        }
      />
    )
  } else if (brands.length === 0) {
    content = (
      <EmptyState
        icon={<Building2 className="h-5 w-5" />}
        title={t('brands-page.empty-title')}
        description={t('brands-page.empty-text')}
        action={canManage ? addButton : undefined}
      />
    )
  } else {
    content = (
      <div className="space-y-2">
        {!canManage && (
          <p className="text-xs text-muted-foreground">
            {t('brands-page.read-only')}
          </p>
        )}
        <DataTable
          columns={columns}
          rows={brands}
          getRowId={(b) => b.id}
          onRowClick={(brand) => navigate(brandPath(projectId, brand.id))}
          label={t('brands-page.title')}
        />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader
        title={t('brands-page.title')}
        description={t('brands-page.subtitle')}
        actions={
          canManage && !loading && !loadError && isMulti && brands.length > 0
            ? addButton
            : undefined
        }
      />
      {content}

      <BrandDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        brand={editing}
        onSubmit={save}
      />

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title={t('brands-page.delete.title')}
        description={t('brands-page.delete.description', {
          name: deleting?.name ?? '',
        })}
        confirmLabel={t('common.delete')}
        onConfirm={remove}
      />
    </div>
  )
}
