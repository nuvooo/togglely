import { Building2, Check, Loader2, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import api from '@/lib/axios'
import { getErrorMessage } from '@/lib/errors'
import { refreshWorkspace } from '@/lib/workspace'

interface PendingInvite {
  id: string
  organizationId: string
  organizationName: string
  role: 'OWNER' | 'ADMIN' | 'MEMBER' | 'VIEWER'
  createdAt: string
  expiresAt: string
}

/**
 * Invites addressed to the user's verified email. They are accepted by id
 * (`/auth/pending-invites/:id/accept`): new invites only store a token hash,
 * so the list carries no usable link token.
 */
export default function PendingInvitesBanner() {
  const { t, i18n } = useTranslation()
  const [invites, setInvites] = useState<PendingInvite[]>([])
  const [acceptingId, setAcceptingId] = useState<string | null>(null)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    let active = true
    api
      .get('/auth/pending-invites')
      .then((res) => active && setInvites(res.data.invites ?? []))
      .catch(() => {})
    return () => {
      active = false
    }
  }, [])

  const handleAccept = async (invite: PendingInvite) => {
    setAcceptingId(invite.id)
    try {
      await api.post(`/auth/pending-invites/${invite.id}/accept`)
      setInvites((list) => list.filter((i) => i.id !== invite.id))
      toast.success(t('invite.joined', { org: invite.organizationName }))
      // Show the new organization in the switcher and command palette
      refreshWorkspace().catch(() => {})
    } catch (error: unknown) {
      toast.error(`${t('pending-invites.error')} ${getErrorMessage(error)}`)
    } finally {
      setAcceptingId(null)
    }
  }

  if (dismissed || invites.length === 0) return null

  return (
    <div className="border-b bg-muted/40">
      <div className="mx-auto max-w-7xl space-y-2 px-4 py-2.5 md:px-8">
        {invites.map((invite) => (
          <div key={invite.id} className="flex items-center justify-between gap-4">
            <div className="flex min-w-0 items-center gap-3">
              <div className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-secondary">
                <Building2 className="h-4 w-4 text-secondary-foreground" />
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-foreground">
                  {t('pending-invites.message', { org: invite.organizationName })}
                </p>
                <p className="text-xs text-muted-foreground">
                  {t('pending-invites.meta', {
                    role: t(`roles.${invite.role}`),
                    date: new Date(invite.expiresAt).toLocaleDateString(i18n.language),
                  })}
                </p>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <Button
                size="icon"
                variant="ghost"
                onClick={() => setDismissed(true)}
                aria-label={t('pending-invites.dismiss')}
                className="h-8 w-8 text-muted-foreground"
              >
                <X className="h-4 w-4" />
              </Button>
              <Button size="sm" onClick={() => handleAccept(invite)} disabled={acceptingId === invite.id}>
                {acceptingId === invite.id ? (
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                ) : (
                  <Check className="mr-1.5 h-4 w-4" />
                )}
                {acceptingId === invite.id ? t('invite.joining') : t('pending-invites.accept')}
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
