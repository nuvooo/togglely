import { Link2, Mail, XCircle } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type { InviteStatus, OrgInvite } from './types'

const STATUS_VARIANT: Record<InviteStatus, 'default' | 'secondary' | 'outline' | 'destructive'> = {
  pending: 'default',
  accepted: 'secondary',
  expired: 'outline',
  revoked: 'outline',
}

interface InvitesTableProps {
  invites: OrgInvite[]
  onRevoke: (invite: OrgInvite) => void
}

/** Open and recently used invites of an organization. */
export function InvitesTable({ invites, onRevoke }: InvitesTableProps) {
  const { t, i18n } = useTranslation()
  const date = (value: string) => new Date(value).toLocaleDateString(i18n.language)

  if (invites.length === 0) {
    return (
      <p className="rounded-lg border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
        {t('invites.empty')}
      </p>
    )
  }

  return (
    <div className="overflow-x-auto rounded-lg border bg-card">
      <table className="w-full text-sm">
        <thead className="border-b bg-muted/40 text-left text-xs uppercase tracking-wider text-muted-foreground">
          <tr>
            <th className="px-4 py-2 font-medium">{t('invites.col-recipient')}</th>
            <th className="px-4 py-2 font-medium">{t('invites.col-role')}</th>
            <th className="px-4 py-2 font-medium">{t('invites.col-status')}</th>
            <th className="hidden px-4 py-2 font-medium sm:table-cell">{t('invites.col-expires')}</th>
            <th className="px-4 py-2">
              <span className="sr-only">{t('invites.revoke')}</span>
            </th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {invites.map((invite) => {
            const recipient = invite.email ?? t('invites.open-link')
            return (
              <tr key={invite.id}>
                <td className="px-4 py-2.5">
                  <span className="flex min-w-0 items-center gap-2">
                    {invite.email ? (
                      <Mail className="h-4 w-4 shrink-0 text-muted-foreground" />
                    ) : (
                      <Link2 className="h-4 w-4 shrink-0 text-muted-foreground" />
                    )}
                    <span className={invite.email ? 'truncate' : 'truncate text-muted-foreground'}>{recipient}</span>
                  </span>
                </td>
                <td className="px-4 py-2.5">{t(`roles.${invite.role}`)}</td>
                <td className="px-4 py-2.5">
                  <Badge variant={STATUS_VARIANT[invite.status]} className="font-medium">
                    {t(`invites.status.${invite.status}`)}
                  </Badge>
                </td>
                <td className="hidden px-4 py-2.5 text-muted-foreground sm:table-cell">{date(invite.expiresAt)}</td>
                <td className="px-4 py-2.5 text-right">
                  {invite.status === 'pending' && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onRevoke(invite)}
                      aria-label={t('invites.revoke-label', { recipient })}
                      className="text-destructive hover:text-destructive"
                    >
                      <XCircle className="mr-1.5 h-4 w-4" />
                      {t('invites.revoke')}
                    </Button>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
