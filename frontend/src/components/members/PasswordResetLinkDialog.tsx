import { Loader2, ShieldAlert } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import api from '@/lib/axios'
import { getErrorCode, getErrorMessage } from '@/lib/errors'
import { CopyLinkField } from './CopyLinkField'
import { type Member, memberName } from './types'

/** CLI the server operator runs when an owner may not reset the password. */
export const resetPasswordCommand = (email: string) =>
  `docker exec -it togglely-backend node dist/cli reset-password ${email}`

type State =
  | { step: 'confirm' }
  | { step: 'done'; resetUrl: string; expiresAt: string }
  | { step: 'server-admin' }

interface PasswordResetLinkDialogProps {
  orgId: string
  /** The member to reset; `null` closes the dialog. */
  member: Member | null
  onClose: () => void
}

/**
 * Lets an OWNER create a one-time password reset link for a member (works
 * without a mail server). Accounts that also belong to organizations the
 * owner does not own can only be reset by the server administrator.
 */
export function PasswordResetLinkDialog({ orgId, member, onClose }: PasswordResetLinkDialogProps) {
  const { t, i18n } = useTranslation()
  const [state, setState] = useState<State>({ step: 'confirm' })
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!member) return
    setState({ step: 'confirm' })
    setError(null)
  }, [member])

  if (!member) return null
  const name = memberName(member)

  const create = async () => {
    setBusy(true)
    setError(null)
    try {
      const { data } = await api.post<{ resetUrl: string; expiresAt: string }>(
        `/organizations/${orgId}/members/${member.userId}/password-reset-link`
      )
      setState({ step: 'done', resetUrl: data.resetUrl, expiresAt: data.expiresAt })
    } catch (err: unknown) {
      if (getErrorCode(err) === 'RESET_REQUIRES_SERVER_ADMIN') setState({ step: 'server-admin' })
      else setError(getErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && !busy && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('reset-link.title')}</DialogTitle>
          <DialogDescription>{t('reset-link.description', { name, email: member.email })}</DialogDescription>
        </DialogHeader>

        {state.step === 'confirm' && (
          <>
            {error && (
              <div role="alert" className="rounded-md border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">
                {error}
              </div>
            )}
            <ul className="list-disc space-y-1.5 pl-5 text-sm text-muted-foreground">
              <li>{t('reset-link.explain-validity')}</li>
              <li>{t('reset-link.explain-sessions', { name })}</li>
              <li>{t('reset-link.explain-share')}</li>
            </ul>
            <DialogFooter>
              <Button variant="outline" onClick={onClose} disabled={busy}>
                {t('common.cancel')}
              </Button>
              <Button onClick={create} disabled={busy}>
                {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {t('reset-link.create')}
              </Button>
            </DialogFooter>
          </>
        )}

        {state.step === 'done' && (
          <>
            <div className="space-y-2">
              <CopyLinkField id="reset-link" label={t('reset-link.link-label')} value={state.resetUrl} />
              <p className="text-xs text-muted-foreground">
                {t('reset-link.valid-until', {
                  time: new Date(state.expiresAt).toLocaleString(i18n.language, {
                    dateStyle: 'short',
                    timeStyle: 'short',
                  }),
                })}
              </p>
            </div>
            <DialogFooter>
              <Button onClick={onClose}>{t('invites.done')}</Button>
            </DialogFooter>
          </>
        )}

        {state.step === 'server-admin' && (
          <>
            <div className="space-y-3 rounded-md border-l-2 border-warning bg-warning/10 p-3 text-sm text-foreground" data-testid="server-admin-hint">
              <p className="flex items-center gap-2 font-medium">
                <ShieldAlert className="h-4 w-4 shrink-0 text-warning" />
                {t('reset-link.server-admin-title')}
              </p>
              <p>{t('reset-link.server-admin-text', { name })}</p>
              <pre className="overflow-x-auto rounded bg-muted px-3 py-2 font-mono text-xs">
                <code>{resetPasswordCommand(member.email)}</code>
              </pre>
            </div>
            <DialogFooter>
              <Button onClick={onClose}>{t('common.close')}</Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
