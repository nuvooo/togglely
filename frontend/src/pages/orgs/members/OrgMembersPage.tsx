import { KeyRound, Trash2, UserPlus } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { DataTable, type DataTableColumn } from '@/components/data/DataTable'
import { ErrorState } from '@/components/feedback/ErrorState'
import { InviteDialog } from '@/components/members/InviteDialog'
import { InvitesTable } from '@/components/members/InvitesTable'
import { PasswordResetLinkDialog } from '@/components/members/PasswordResetLinkDialog'
import {
  type Member,
  memberName,
  type OrgInvite,
  type OrgRole,
} from '@/components/members/types'
import { PageHeader } from '@/components/page/PageHeader'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import api from '@/lib/axios'
import {
  handleForbidden,
  isForbidden,
  notifyWriteError,
} from '@/lib/permissions'
import { apiMessage } from '@/pages/projects/settings/project'

interface Organization {
  id: string
  name: string
}

type Confirmation =
  | { kind: 'remove'; member: Member }
  | { kind: 'revoke'; invite: OrgInvite }

function Section({
  title,
  description,
  children,
}: {
  title: string
  description?: string
  children: React.ReactNode
}) {
  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-sm font-semibold">{title}</h2>
        {description && (
          <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      {children}
    </section>
  )
}

/** Members of an organization, their roles, invites and reset links. */
export default function OrgMembersPage() {
  const { t } = useTranslation()
  const { orgId = '' } = useParams<{ orgId: string }>()
  const [userId, setUserId] = useState<string | undefined>()
  const [organization, setOrganization] = useState<Organization | null>(null)
  const [members, setMembers] = useState<Member[]>([])
  const [invites, setInvites] = useState<OrgInvite[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [reload, setReload] = useState(0)
  const [showInviteDialog, setShowInviteDialog] = useState(false)
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null)
  const [resetMember, setResetMember] = useState<Member | null>(null)

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

  /**
   * The member list is this page's role source: after a 403 the user's role
   * changed, so reload it (quietly) and the write actions follow.
   */
  const refreshMembers = useCallback(async () => {
    try {
      const res = await api.get(`/organizations/${orgId}/members`)
      setMembers(res.data.members ?? [])
    } catch {
      // Keep the current list; the workspace refresh still runs.
    }
  }, [orgId])

  const refreshOnForbidden = (err: unknown) => {
    if (isForbidden(err)) refreshMembers()
  }

  // biome-ignore lint/correctness/useExhaustiveDependencies: `reload` re-runs the load on retry
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
  }, [orgId, loadInvites, reload])

  const updateRole = async (member: Member, role: OrgRole) => {
    try {
      await api.patch(`/organizations/${orgId}/members/${member.userId}`, {
        role,
      })
      setMembers((list) =>
        list.map((m) => (m.userId === member.userId ? { ...m, role } : m))
      )
      toast.success(t('members.role-updated'))
    } catch (err: unknown) {
      refreshOnForbidden(err)
      notifyWriteError(
        err,
        t,
        apiMessage(err, t('org-pages.members.role-failed'))
      )
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
        await api.delete(
          `/organizations/${orgId}/invites/${confirmation.invite.id}`
        )
        toast.success(t('invites.revoked'))
        await loadInvites()
      }
    } catch (err: unknown) {
      // The confirm dialog stays open and shows the message.
      refreshOnForbidden(err)
      handleForbidden(err, t)
      throw new Error(apiMessage(err, t('org-pages.members.action-failed')))
    }
  }

  const columns: DataTableColumn<Member>[] = [
    {
      key: 'member',
      header: t('org-pages.members.col-member'),
      cell: (member) => {
        const name = memberName(member)
        const isSelf = member.userId === userId
        return (
          <div className="flex min-w-0 items-center gap-3">
            <span
              aria-hidden
              className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-muted text-xs font-semibold text-muted-foreground"
            >
              {name.slice(0, 1).toUpperCase()}
            </span>
            <div className="min-w-0">
              <p className="truncate font-medium">
                {name}
                {isSelf && (
                  <span className="ml-2 text-xs font-normal text-muted-foreground">
                    ({t('members.you')})
                  </span>
                )}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {member.email}
              </p>
            </div>
          </div>
        )
      },
    },
    {
      key: 'role',
      header: t('org-pages.members.col-role'),
      width: '10rem',
      cell: (member) => {
        const name = memberName(member)
        const editable = member.userId !== userId && member.role !== 'OWNER'
        return canChangeRoles && editable ? (
          <Select
            value={member.role}
            onValueChange={(value) => updateRole(member, value as OrgRole)}
          >
            <SelectTrigger
              className="h-8 w-32"
              aria-label={t('members.role-label', { name })}
            >
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
          <Badge variant={member.role === 'OWNER' ? 'default' : 'neutral'}>
            {t(`roles.${member.role}`)}
          </Badge>
        )
      },
    },
  ]
  if (canManageMembers) {
    columns.push({
      key: 'actions',
      header: t('org-pages.members.col-actions'),
      srOnlyHeader: true,
      width: '6rem',
      align: 'right',
      className: 'px-2',
      cell: (member) => {
        const name = memberName(member)
        const isSelf = member.userId === userId
        const editable = !isSelf && member.role !== 'OWNER'
        return (
          <div className="flex justify-end gap-1">
            {/* Owners may hand out reset links for themselves and non-owners;
                other owners can only be reset by the server administrator */}
            {canChangeRoles && (isSelf || member.role !== 'OWNER') && (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setResetMember(member)}
                aria-label={t('reset-link.action-label', { name })}
                title={t('reset-link.action')}
                className="h-8 w-8 text-muted-foreground"
              >
                <KeyRound className="h-4 w-4" />
              </Button>
            )}
            {editable && (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setConfirmation({ kind: 'remove', member })}
                aria-label={t('members.remove-label', { name })}
                title={t('members.remove')}
                className="h-8 w-8 text-destructive hover:text-destructive"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>
        )
      },
    })
  }

  const confirmText =
    confirmation?.kind === 'remove'
      ? {
          title: t('members.remove-title'),
          description: t('members.remove-description', {
            name: memberName(confirmation.member),
          }),
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

  let content: React.ReactNode
  if (isLoading) {
    content = (
      <DataTable
        columns={columns}
        rows={[]}
        getRowId={(m) => m.id}
        loading
        loadingRows={3}
      />
    )
  } else if (loadError || !organization) {
    content = (
      <ErrorState
        message={t('members.load-error')}
        onRetry={() => setReload((n) => n + 1)}
      />
    )
  } else {
    content = (
      <div className="space-y-8">
        <Section title={t('members.list-title', { count: members.length })}>
          <DataTable
            columns={columns}
            rows={members}
            getRowId={(m) => m.id}
            label={t('members.title')}
            empty={
              <p className="px-4 py-6 text-center text-sm text-muted-foreground">
                {t('members.empty')}
              </p>
            }
          />
        </Section>
        {canManageMembers && (
          <Section
            title={t('invites.title')}
            description={t('invites.description')}
          >
            <InvitesTable
              invites={invites}
              onRevoke={(invite) => setConfirmation({ kind: 'revoke', invite })}
            />
          </Section>
        )}
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader
        title={t('members.title')}
        description={
          organization
            ? t('members.description', { org: organization.name })
            : undefined
        }
        actions={
          canManageMembers && !isLoading ? (
            <Button onClick={() => setShowInviteDialog(true)}>
              <UserPlus className="mr-2 h-4 w-4" />
              {t('members.invite')}
            </Button>
          ) : undefined
        }
      />
      {content}

      {organization && (
        <InviteDialog
          orgId={orgId}
          orgName={organization.name}
          actorRole={currentRole}
          open={showInviteDialog}
          onOpenChange={setShowInviteDialog}
          onCreated={loadInvites}
          onForbidden={refreshMembers}
        />
      )}

      <PasswordResetLinkDialog
        orgId={orgId}
        member={resetMember}
        onClose={() => setResetMember(null)}
        onForbidden={refreshMembers}
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
