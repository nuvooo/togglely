import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { notifyWriteError } from '@/lib/permissions'
import { type Experiment, experimentsApi, type LifecycleAction } from './api'

export type ExperimentCommand = LifecycleAction | 'delete'

const DONE: Record<LifecycleAction, string> = { start: 'started', pause: 'paused', complete: 'completed' }

interface Options {
  /** Called with the experiment after a lifecycle change (relations of the old object are kept). */
  onUpdated: (experiment: Experiment) => void
  onDeleted?: (experiment: Experiment) => void
}

/**
 * Start / pause / complete / delete with toasts. "Complete" and "delete" cannot be
 * undone and ask first; `dialog` must be rendered by the caller.
 */
export function useExperimentCommands({ onUpdated, onDeleted }: Options) {
  const { t } = useTranslation()
  const [busyId, setBusyId] = useState<string | null>(null)
  const [pending, setPending] = useState<{ command: 'complete' | 'delete'; experiment: Experiment } | null>(null)

  const run = async (experiment: Experiment, command: ExperimentCommand) => {
    setBusyId(experiment.id)
    try {
      if (command === 'delete') {
        await experimentsApi.remove(experiment.id)
        toast.success(t('experiments-page.toast.deleted', { name: experiment.name }))
        onDeleted?.(experiment)
        return
      }
      const updated = await experimentsApi.lifecycle(experiment.id, command)
      onUpdated({
        ...experiment,
        status: updated.status ?? experiment.status,
        startedAt: updated.startedAt ?? experiment.startedAt,
        endedAt: updated.endedAt ?? experiment.endedAt,
      })
      const key = command === 'start' && experiment.status === 'PAUSED' ? 'resumed' : DONE[command]
      toast.success(t(`experiments-page.toast.${key}`, { name: experiment.name }))
    } catch (err: unknown) {
      notifyWriteError(err, t)
    } finally {
      setBusyId(null)
    }
  }

  const request = (experiment: Experiment, command: ExperimentCommand) => {
    if (command === 'complete' || command === 'delete') setPending({ command, experiment })
    else void run(experiment, command)
  }

  const isDelete = pending?.command === 'delete'
  const dialog = (
    <ConfirmDialog
      open={pending !== null}
      onOpenChange={(open) => !open && setPending(null)}
      variant={isDelete ? 'destructive' : 'default'}
      title={isDelete ? t('experiments-page.confirm.delete-title') : t('experiments-page.confirm.complete-title')}
      description={
        isDelete
          ? t('experiments-page.confirm.delete-text', { name: pending?.experiment.name ?? '' })
          : t('experiments-page.confirm.complete-text', { name: pending?.experiment.name ?? '' })
      }
      confirmLabel={isDelete ? t('common.delete') : t('experiments-page.actions.complete')}
      onConfirm={async () => {
        if (pending) await run(pending.experiment, pending.command)
      }}
    />
  )

  return { request, busyId, dialog }
}
