import { Check, ExternalLink, MoreHorizontal, Pause, Play, Trash2 } from 'lucide-react'
import type { TFunction } from 'i18next'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { canDeleteStatus, type Experiment, type LifecycleAction, lifecycleActions } from './api'
import type { ExperimentCommand } from './useExperimentCommands'

export const LIFECYCLE_ICON = { start: Play, pause: Pause, complete: Check } as const

/** Label of a lifecycle action; "start" on a paused experiment reads "resume". */
export function lifecycleLabel(t: TFunction, action: LifecycleAction, experiment: Pick<Experiment, 'status'>) {
  if (action === 'start' && experiment.status === 'PAUSED') return t('experiments-page.actions.resume')
  return t(`experiments-page.actions.${action}`)
}

interface Props {
  experiment: Experiment
  detailPath: string
  canEdit: boolean
  canDelete: boolean
  busy: boolean
  onCommand: (experiment: Experiment, command: ExperimentCommand) => void
}

/** Row menu of the experiments table. */
export function ExperimentActionsMenu({ experiment, detailPath, canEdit, canDelete, busy, onCommand }: Props) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const actions = canEdit ? lifecycleActions(experiment.status) : []
  const deletable = canDelete && canDeleteStatus(experiment.status)

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-muted-foreground"
          disabled={busy}
          aria-label={t('experiments-page.actions.label', { name: experiment.name })}
        >
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={() => navigate(detailPath)}>
          <ExternalLink className="mr-2 h-4 w-4" />
          {t('experiments-page.actions.open')}
        </DropdownMenuItem>
        {actions.map((action) => {
          const Icon = LIFECYCLE_ICON[action]
          return (
            <DropdownMenuItem key={action} onSelect={() => onCommand(experiment, action)}>
              <Icon className="mr-2 h-4 w-4" />
              {lifecycleLabel(t, action, experiment)}
            </DropdownMenuItem>
          )
        })}
        {deletable && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={() => onCommand(experiment, 'delete')}
              className="text-destructive focus:text-destructive"
            >
              <Trash2 className="mr-2 h-4 w-4" />
              {t('common.delete')}
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
