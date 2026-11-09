import { Trash2, UserPlus } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { ConfirmDialog } from '@/components/members/ConfirmDialog'
import { InviteDialog } from '@/components/members/InviteDialog'
import { InvitesTable } from '@/components/members/InvitesTable'
import { type Member, memberName, type OrgInvite, type OrgRole } from '@/components/members/types'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import api from '@/lib/axios'
import { getErrorMessage } from '@/lib/errors'
import { ROUTES } from '@/lib/routes'

interface Organization {
  id: string
  name: string
}

type Confirmation =
  | { kind: 'remove'; member: Member }
  | { kind: 'revoke'; invite: OrgInvite }

function Section({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{title}</h2>
        {description && <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>}
      </div>
      {children}
    </section>
  )
}

export default function OrganizationMembers() {
  const { t } = useTranslation()
  const { orgId = '' } = useParams<{ orgId: string }>()
  const navigate = useNavigate()
  const [userId, setUserId] = useState<string | undefined>()
  const [organization, setOrganization] = useState<Organization | null>(null)
  const [members, setMembers] = useState<Member[]>([])
  const [invites, setInvites] = useState<OrgInvite[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [showInviteDialog, setShowInviteDialog] = useState(false)
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null)

  const currentRole = members.find((m) => m.userId === userId)?.role ?? null
  const canManageMembers = currentRole === 'OWNER' || currentRole === 'ADMIN'
  const canChangeRoles = currentRole === 'OWNER'

  const loadInvites = useCallback(async () => {
    try {
      const res = await api.get(`/organizations/${orgId}/invites`)
      setInvites(res.data.invites ?? [])
    } catch {
      // Only ADMIN+ may list invites; others simply see none
      setInvites([])
    }
  }, [orgId])

  useEffect(() => {
    if (!orgId) return
    let active = true
    setIsLoading(true)
    setLoadError(false)
    Promise.all([
      api.get(`/organizations/${orgId}`),
      api.get(`/organizations/${orgId}/members`),
      api.get('/auth/me'),
    ])
      .then(([orgRes, membersRes, meRes]) => {
        if (!active) return
        setOrganization(orgRes.data.organization ?? orgRes.data)
        const list: Member[] = membersRes.data.members ?? []
        const me: string | undefined = meRes.data.user?.id
        setMembers(list)
        setUserId(me)
        const role = list.find((m) => m.userId === me)?.role
        if (role === 'OWNER' || role === 'ADMIN') loadInvites()
      })
      .catch(() => active && setLoadError(true))
      .finally(() => active && setIsLoading(false))
    return () => {
      active = false
    }
  }, [orgId, loadInvites])

  const updateRole = async (member: Member, role: OrgRole) => {
    try {
      await api.patch(`/organizations/${orgId}/members/${member.userId}`, { role })
      setMembers((list) => list.map((m) => (m.userId === member.userId ? { ...m, role } : m)))
      toast.success(t('members.role-updated'))
    } catch (err: unknown) {
      toast.error(getErrorMessage(err))
    }
  }

  const confirmAction = async () => {
    if (!confirmation) return
    try {
      if (confirmation.kind === 'remove') {
        const { member } = confirmation
        await api.delete(`/organizations/${orgId}/members/${member.userId}`)
        setMembers((list) => list.filter((m) => m.userId !== member.userId))
        toast.success(t('members.removed'))
      } else {
        await api.delete(`/organizations/${orgId}/invites/${confirmation.invite.id}`)
        toast.success(t('invites.revoked'))
        await loadInvites()
      }
    } catch (err: unknown) {
      toast.error(getErrorMessage(err))
    }
  }

  if (isLoading) {
    return (
      <div className="mx-auto max-w-4xl space-y-3" aria-busy="true" aria-label={t('common.loading')}>
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-4 w-72" />
        <Skeleton className="h-14 w-full" />
        <Skeleton className="h-14 w-full" />
      </div>
    )
  }

  if (loadError || !organization) {
    return (
      <div className="flex flex-col items-center rounded-lg border border-dashed px-6 py-12 text-center">
        <p className="font-medium">{loadError ? t('members.load-error') : t('members.not-found')}</p>
        <Button className="mt-4" variant="outline" onClick={() => navigate(ROUTES.orgs)}>
          {t('members.back')}
        </Button>
      </div>
    )
  }

  const confirmText =
    confirmation?.kind === 'remove'
      ? {
          title: t('members.remove-title'),
          description: t('members.remove-description', { name: memberName(confirmation.member) }),
          confirmLabel: t('members.remove'),
        }
      : confirmation?.kind === 'revoke'
        ? {
            title: t('invites.revoke-title'),
            description: t('invites.revoke-description', {
              recipient: confirmation.invite.email ?? t('invites.open-link'),
            }),
            confirmLabel: t('invites.revoke'),
          }
        : { title: '', description: '', confirmLabel: '' }

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t('members.title')}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t('members.description', { org: organization.name })}
          </p>
        </div>
        {canManageMembers && (
          <Button onClick={() => setShowInviteDialog(true)}>
            <UserPlus className="mr-2 h-4 w-4" />
            {t('members.invite')}
          </Button>
        )}
      </div>

      <Section title={t('members.list-title', { count: members.length })}>
        {members.length === 0 ? (
          <p className="rounded-lg border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
            {t('members.empty')}
          </p>
        ) : (
          <ul className="divide-y overflow-hidden rounded-lg border bg-card">
            {members.map((member) => {
              const name = memberName(member)
              const isSelf = member.userId === userId
              const editable = !isSelf && member.role !== 'OWNER'
              return (
                <li key={member.id} className="flex items-center gap-3 px-4 py-3">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-secondary text-xs font-semibold text-secondary-foreground">
                    {name.slice(0, 1).toUpperCase()}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {name}
                      {isSelf && <span className="ml-2 text-xs font-normal text-muted-foreground">({t('members.you')})</span>}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">{member.email}</p>
                  </div>
                  {canChangeRoles && editable ? (
                    <Select value={member.role} onValueChange={(value) => updateRole(member, value as OrgRole)}>
                      <SelectTrigger className="h-8 w-32" aria-label={t('members.role-label', { name })}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {(['ADMIN', 'MEMBER', 'VIEWER'] as const).map((r) => (
                          <SelectItem key={r} value={r}>
                            {t(`roles.${r}`)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Badge variant={member.role === 'OWNER' ? 'default' : 'secondary'}>{t(`roles.${member.role}`)}</Badge>
                  )}
                  {canManageMembers && editable && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setConfirmation({ kind: 'remove', member })}
                      aria-label={t('members.remove-label', { name })}
                      className="h-8 w-8 text-destructive hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </Section>

      {canManageMembers && (
        <Section title={t('invites.title')} description={t('invites.description')}>
          <InvitesTable invites={invites} onRevoke={(invite) => setConfirmation({ kind: 'revoke', invite })} />
        </Section>
      )}

      <InviteDialog
        orgId={orgId}
        orgName={organization.name}
        actorRole={currentRole}
        open={showInviteDialog}
        onOpenChange={setShowInviteDialog}
        onCreated={loadInvites}
      />

      <ConfirmDialog
        open={confirmation !== null}
        {...confirmText}
        onConfirm={confirmAction}
        onOpenChange={(open) => !open && setConfirmation(null)}
      />
    </div>
  )
}
