import { Loader2, TriangleAlert } from 'lucide-react'
import { type FormEvent, useEffect, useState } from 'react'
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
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import api from '@/lib/axios'
import { getErrorMessage, getErrorStatus } from '@/lib/errors'
import { useSetupStatus } from '@/lib/setup'
import { CopyLinkField } from './CopyLinkField'
import { type CreatedInvite, grantableRoles, type OrgRole } from './types'

interface InviteDialogProps {
  orgId: string
  orgName: string
  actorRole: OrgRole | null
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Called after an invite was created (e.g. to reload the invite list). */
  onCreated: () => void
  /** Called on a 403: the caller's role changed (e.g. to reload it). */
  onForbidden?: () => void
}

/**
 * Creates an invite link (optionally bound to an email) and shows it for
 * copying. The link works without a mail server; with SMTP it is also mailed.
 */
export function InviteDialog({
  orgId,
  orgName,
  actorRole,
  open,
  onOpenChange,
  onCreated,
  onForbidden,
}: InviteDialogProps) {
  const { t, i18n } = useTranslation()
  const mailEnabled = useSetupStatus()?.mailEnabled === true
  const roles = grantableRoles(actorRole)

  const [email, setEmail] = useState('')
  const [role, setRole] = useState<OrgRole>('MEMBER')
  const [error, setError] = useState<string | null>(null)
  const [isCreating, setIsCreating] = useState(false)
  const [created, setCreated] = useState<CreatedInvite | null>(null)

  // Every opening starts with a fresh form
  useEffect(() => {
    if (!open) return
    setEmail('')
    setRole('MEMBER')
    setError(null)
    setCreated(null)
  }, [open])

  const trimmedEmail = email.trim()

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setIsCreating(true)
    setError(null)
    try {
      const { data } = await api.post<CreatedInvite>(`/organizations/${orgId}/invites`, {
        role,
        ...(trimmedEmail ? { email: trimmedEmail } : {}),
      })
      setCreated(data)
      onCreated()
    } catch (err: unknown) {
      if (getErrorStatus(err) === 403) onForbidden?.()
      setError(getErrorMessage(err))
    } finally {
      setIsCreating(false)
    }
  }

  const deliveryHint = (invite: CreatedInvite) => {
    if (!invite.invite.email) return t('invites.share-open')
    if (invite.emailSent) return t('invites.sent', { email: invite.invite.email })
    return mailEnabled ? t('invites.send-failed') : t('invites.no-mail')
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !isCreating && onOpenChange(next)}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('invites.dialog-title')}</DialogTitle>
          <DialogDescription>{t('invites.dialog-description', { org: orgName })}</DialogDescription>
        </DialogHeader>

        {created ? (
          <div className="space-y-4">
            <div className="space-y-2">
              <CopyLinkField id="invite-link" label={t('invites.link-label')} value={created.inviteUrl} />
              <p className="text-sm text-muted-foreground" data-testid="invite-delivery">
                {deliveryHint(created)}
              </p>
              <p className="text-xs text-muted-foreground">
                {t('invites.valid-until', {
                  date: new Date(created.invite.expiresAt).toLocaleDateString(i18n.language),
                })}
              </p>
            </div>
            <DialogFooter>
              <Button type="button" onClick={() => onOpenChange(false)}>
                {t('invites.done')}
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div role="alert" className="rounded-md border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">
                {error}
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="invite-role">{t('invites.role-label')}</Label>
              <Select value={role} onValueChange={(value) => setRole(value as OrgRole)}>
                <SelectTrigger id="invite-role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {roles.map((r) => (
                    <SelectItem key={r} value={r}>
                      {t(`roles.${r}`)} – {t(`invites.role-desc.${r}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="invite-email">{t('invites.email-label')}</Label>
              <Input
                id="invite-email"
                type="email"
                autoComplete="off"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="colleague@example.com"
                maxLength={254}
              />
              {trimmedEmail ? (
                <p className="text-xs text-muted-foreground">{t('invites.email-hint')}</p>
              ) : (
                <p
                  className="flex gap-2 rounded-md border-l-2 border-warning bg-warning/10 px-2.5 py-2 text-xs text-foreground"
                  data-testid="open-link-warning"
                >
                  <TriangleAlert className="mt-px h-3.5 w-3.5 shrink-0 text-warning" />
                  <span>{t('invites.open-link-warning')}</span>
                </p>
              )}
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isCreating}>
                {t('common.cancel')}
              </Button>
              <Button type="submit" disabled={isCreating || roles.length === 0}>
                {isCreating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {isCreating ? t('invites.creating') : t('invites.create')}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
