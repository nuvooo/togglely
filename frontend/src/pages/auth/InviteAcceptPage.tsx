import { Loader2 } from 'lucide-react'
import { type FormEvent, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import {
  AUTH_LINK_CLASS,
  AuthCard,
  AuthLayout,
  AuthLoading,
  FormError,
  fieldErrorProps,
} from '@/components/auth/AuthLayout'
import { useLogout } from '@/components/shell/useLogout'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import api from '@/lib/axios'
import { getErrorMessage, getErrorStatus } from '@/lib/errors'
import { passwordIssue } from '@/lib/password'
import { loginPath } from '@/lib/redirect'
import { orgPath, ROUTES } from '@/lib/routes'
import { useSetupStatus } from '@/lib/setup'
import { refreshWorkspace } from '@/lib/workspace'
import { type SessionResponse, useAuthStore } from '@/store/authStore'

interface InviteInfo {
  organizationName: string
  role: string
  /** Bound invites only; open links carry no address. */
  email: string | null
  /** A bound invite whose address already has an account: sign in instead. */
  existingUser: boolean
}

const sameEmail = (a: string, b: string) =>
  a.trim().toLowerCase() === b.trim().toLowerCase()

export default function InviteAcceptPage() {
  const { t } = useTranslation()
  const { token: inviteToken = '' } = useParams<{ token: string }>()
  const navigate = useNavigate()
  const authToken = useAuthStore((s) => s.token)
  const user = useAuthStore((s) => s.user)
  const setSession = useAuthStore((s) => s.setSession)
  const mailEnabled = useSetupStatus()?.mailEnabled === true
  const returnToInvite = loginPath(`/invite/${inviteToken}`)
  const switchAccount = useLogout(returnToInvite)

  const [info, setInfo] = useState<InviteInfo | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')

  useEffect(() => {
    let active = true
    setInfo(null)
    setLoadError(null)
    api
      .get<InviteInfo>(`/auth/invite/${encodeURIComponent(inviteToken)}`)
      .then((res) => active && setInfo(res.data))
      .catch((err: unknown) => {
        if (!active) return
        const code = getErrorStatus(err)
        setLoadError(
          code === 404 || code === 400
            ? t('invite.error-invalid')
            : code === 409
              ? t('invite.error-used')
              : t('invite.error-load')
        )
      })
    return () => {
      active = false
    }
  }, [inviteToken, t])

  const tokenPath = `/auth/invite/${encodeURIComponent(inviteToken)}`

  const handleJoin = async () => {
    if (!info) return
    setIsSubmitting(true)
    setError(null)
    try {
      const { data } = await api.post(`${tokenPath}/accept`)
      await refreshWorkspace().catch(() => {})
      toast.success(t('invite.joined', { org: info.organizationName }))
      navigate(
        data?.organizationId ? orgPath(data.organizationId) : ROUTES.projects,
        { replace: true }
      )
    } catch (err: unknown) {
      setError(getErrorMessage(err))
      setIsSubmitting(false)
    }
  }

  const handleRegister = async (e: FormEvent) => {
    e.preventDefault()
    if (!info) return
    setError(null)

    const issue = passwordIssue(password)
    if (issue) return setError(t(`password.${issue}`))
    if (password !== confirmPassword) return setError(t('password.mismatch'))

    const bound = !!info.email
    setIsSubmitting(true)
    try {
      const { data } = await api.post<
        SessionResponse & { organizationId?: string }
      >(`${tokenPath}/register`, {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        password,
        // Bound invites use their own address; the backend ignores any other
        ...(bound ? {} : { email: email.trim() }),
      })
      setSession(data)
      await refreshWorkspace().catch(() => {})
      toast.success(t('invite.joined', { org: info.organizationName }))
      // Open links create unverified accounts; a mail is only sent with SMTP
      if (!bound && mailEnabled) toast.info(t('invite.verify-email-sent'))
      navigate(
        data.organizationId ? orgPath(data.organizationId) : ROUTES.projects,
        { replace: true }
      )
    } catch (err: unknown) {
      setError(getErrorMessage(err))
      setIsSubmitting(false)
    }
  }

  if (loadError) {
    return (
      <AuthLayout>
        <AuthCard centered>
          <div className="space-y-4">
            <FormError>{loadError}</FormError>
            <Button asChild variant="outline" className="w-full">
              <Link to={authToken ? ROUTES.overview : '/login'}>
                {authToken ? t('invite.go-to-app') : t('invite.go-to-login')}
              </Link>
            </Button>
          </div>
        </AuthCard>
      </AuthLayout>
    )
  }

  if (!info) {
    return (
      <AuthLayout>
        <AuthLoading />
      </AuthLayout>
    )
  }

  const title = t('invite.title', { org: info.organizationName })
  const description = t('invite.subtitle', {
    role: t(`roles.${info.role}`, { defaultValue: info.role }),
  })

  // Logged in: join with the current account
  if (authToken) {
    const wrongAccount =
      !!info.email && !!user?.email && !sameEmail(info.email, user.email)
    return (
      <AuthLayout>
        <AuthCard title={title} description={description}>
          <div className="space-y-4">
            {error && <FormError id="invite-error">{error}</FormError>}
            {user?.email && (
              <p className="text-sm text-muted-foreground">
                {t('invite.logged-in-as', { email: user.email })}
              </p>
            )}
            {wrongAccount && info.email && (
              <p className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-sm">
                {t('invite.bound-to', { email: info.email })}
              </p>
            )}
            <div className="space-y-2">
              <Button
                className="w-full"
                onClick={handleJoin}
                disabled={isSubmitting || wrongAccount}
              >
                {isSubmitting && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                {isSubmitting ? t('invite.joining') : t('invite.join')}
              </Button>
              <Button
                variant="ghost"
                className="w-full"
                onClick={switchAccount}
                disabled={isSubmitting}
              >
                {t('invite.switch-account')}
              </Button>
            </div>
          </div>
        </AuthCard>
      </AuthLayout>
    )
  }

  // Logged out, the bound address already has an account: sign in first
  if (info.existingUser && info.email) {
    return (
      <AuthLayout>
        <AuthCard title={title} description={description}>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {t('invite.existing-account', { email: info.email })}
            </p>
            <Button className="w-full" onClick={() => navigate(returnToInvite)}>
              {t('invite.sign-in')}
            </Button>
          </div>
        </AuthCard>
      </AuthLayout>
    )
  }

  // Logged out: create an account via the invite
  const bound = !!info.email
  return (
    <AuthLayout
      footer={
        <Link to={returnToInvite} className={AUTH_LINK_CLASS}>
          {t('invite.have-account')}
        </Link>
      }
    >
      <AuthCard title={title} description={description}>
        <form onSubmit={handleRegister} noValidate className="space-y-4">
          {error && <FormError id="invite-error">{error}</FormError>}

          <div className="space-y-2">
            <Label htmlFor="invite-email">{t('invite.email')}</Label>
            {bound ? (
              <Input
                {...fieldErrorProps('invite-error', Boolean(error))}
                id="invite-email"
                type="email"
                value={info.email ?? ''}
                readOnly
                className="bg-muted"
              />
            ) : (
              <>
                <Input
                  {...fieldErrorProps('invite-error', Boolean(error), 'invite-email-hint')}
                  id="invite-email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={t('login.email-placeholder')}
                  maxLength={254}
                  required
                />
                <p
                  id="invite-email-hint"
                  className="text-xs text-muted-foreground"
                >
                  {t('invite.email-hint-open')}
                </p>
              </>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="invite-first-name">
                {t('invite.first-name')}
              </Label>
              <Input
                {...fieldErrorProps('invite-error', Boolean(error))}
                id="invite-first-name"
                autoComplete="given-name"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                maxLength={100}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="invite-last-name">{t('invite.last-name')}</Label>
              <Input
                {...fieldErrorProps('invite-error', Boolean(error))}
                id="invite-last-name"
                autoComplete="family-name"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                maxLength={100}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="invite-password">{t('invite.password')}</Label>
            <Input
              {...fieldErrorProps('invite-error', Boolean(error), 'invite-password-hint')}
              id="invite-password"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            <p
              id="invite-password-hint"
              className="text-xs text-muted-foreground"
            >
              {t('password.hint')}
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="invite-confirm">
              {t('invite.confirm-password')}
            </Label>
            <Input
              {...fieldErrorProps('invite-error', Boolean(error))}
              id="invite-confirm"
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
            />
          </div>

          <Button
            type="submit"
            className="w-full"
            disabled={
              isSubmitting || !firstName.trim() || (!bound && !email.trim())
            }
          >
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isSubmitting ? t('invite.creating') : t('invite.create-account')}
          </Button>
        </form>
      </AuthCard>
    </AuthLayout>
  )
}
