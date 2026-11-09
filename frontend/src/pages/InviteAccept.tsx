import { Loader2 } from 'lucide-react'
import { type FormEvent, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { AuthLayout, FormError } from '@/components/auth/AuthLayout'
import { useLogout } from '@/components/shell/useLogout'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
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

const sameEmail = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase()

/** Org id to open after registering: the new account belongs to exactly one org. */
async function joinedOrgId(organizationName: string): Promise<string | null> {
  try {
    const res = await api.get('/organizations')
    const orgs: { id: string; name: string }[] = res.data.organizations ?? []
    return (orgs.find((o) => o.name === organizationName) ?? orgs[0])?.id ?? null
  } catch {
    return null
  }
}

export default function InviteAccept() {
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
      navigate(data?.organizationId ? orgPath(data.organizationId) : ROUTES.projects, { replace: true })
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
      const { data } = await api.post<SessionResponse>(`${tokenPath}/register`, {
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
      const orgId = await joinedOrgId(info.organizationName)
      navigate(orgId ? orgPath(orgId) : ROUTES.projects, { replace: true })
    } catch (err: unknown) {
      setError(getErrorMessage(err))
      setIsSubmitting(false)
    }
  }

  if (loadError) {
    return (
      <AuthLayout>
        <Card className="shadow-sm">
          <CardContent className="space-y-4 pt-6 text-center">
            <p className="font-medium">{loadError}</p>
            <Button asChild variant="outline">
              <Link to={authToken ? ROUTES.overview : '/login'}>
                {authToken ? t('invite.go-to-app') : t('invite.go-to-login')}
              </Link>
            </Button>
          </CardContent>
        </Card>
      </AuthLayout>
    )
  }

  if (!info) {
    return (
      <AuthLayout>
        <div className="flex justify-center py-12" aria-busy="true" aria-label={t('common.loading')}>
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </AuthLayout>
    )
  }

  const header = (
    <CardHeader className="space-y-1 pb-2 text-center">
      <CardTitle className="text-2xl font-semibold">{t('invite.title', { org: info.organizationName })}</CardTitle>
      <CardDescription>{t('invite.subtitle', { role: t(`roles.${info.role}`, { defaultValue: info.role }) })}</CardDescription>
    </CardHeader>
  )

  // Logged in: join with the current account
  if (authToken) {
    const wrongAccount = !!info.email && !!user?.email && !sameEmail(info.email, user.email)
    return (
      <AuthLayout>
        <Card className="shadow-sm">
          {header}
          <CardContent className="space-y-4 pt-4">
            {error && <FormError>{error}</FormError>}
            {user?.email && (
              <p className="text-center text-sm text-muted-foreground">
                {t('invite.logged-in-as', { email: user.email })}
              </p>
            )}
            {wrongAccount && info.email && (
              <p className="rounded-md border-l-2 border-warning bg-warning/10 px-3 py-2 text-sm text-foreground">
                {t('invite.bound-to', { email: info.email })}
              </p>
            )}
          </CardContent>
          <CardFooter className="flex-col gap-2 pt-2">
            <Button className="w-full" onClick={handleJoin} disabled={isSubmitting || wrongAccount}>
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isSubmitting ? t('invite.joining') : t('invite.join')}
            </Button>
            <Button variant="ghost" className="w-full" onClick={switchAccount} disabled={isSubmitting}>
              {t('invite.switch-account')}
            </Button>
          </CardFooter>
        </Card>
      </AuthLayout>
    )
  }

  // Logged out, the bound address already has an account: sign in first
  if (info.existingUser && info.email) {
    return (
      <AuthLayout>
        <Card className="shadow-sm">
          {header}
          <CardContent className="pt-4">
            <p className="text-center text-sm text-muted-foreground">
              {t('invite.existing-account', { email: info.email })}
            </p>
          </CardContent>
          <CardFooter className="pt-2">
            <Button className="w-full" onClick={() => navigate(returnToInvite)}>
              {t('invite.sign-in')}
            </Button>
          </CardFooter>
        </Card>
      </AuthLayout>
    )
  }

  // Logged out: create an account via the invite
  const bound = !!info.email
  return (
    <AuthLayout>
      <Card className="shadow-sm">
        {header}
        <form onSubmit={handleRegister} noValidate>
          <CardContent className="space-y-4 pt-4">
            {error && <FormError>{error}</FormError>}

            <div className="space-y-2">
              <Label htmlFor="invite-email">{t('invite.email')}</Label>
              {bound ? (
                <Input id="invite-email" type="email" value={info.email ?? ''} readOnly className="bg-muted" />
              ) : (
                <>
                  <Input
                    id="invite-email"
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder={t('login.email-placeholder')}
                    maxLength={254}
                    aria-describedby="invite-email-hint"
                    required
                  />
                  <p id="invite-email-hint" className="text-xs text-muted-foreground">
                    {t('invite.email-hint-open')}
                  </p>
                </>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="invite-first-name">{t('invite.first-name')}</Label>
                <Input
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
                id="invite-password"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                aria-describedby="invite-password-hint"
                required
              />
              <p id="invite-password-hint" className="text-xs text-muted-foreground">
                {t('password.hint')}
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="invite-confirm">{t('invite.confirm-password')}</Label>
              <Input
                id="invite-confirm"
                type="password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
              />
            </div>
          </CardContent>

          <CardFooter className="flex-col gap-4 pt-2">
            <Button
              type="submit"
              className="w-full"
              disabled={isSubmitting || !firstName.trim() || (!bound && !email.trim())}
            >
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isSubmitting ? t('invite.creating') : t('invite.create-account')}
            </Button>
            <Link to={returnToInvite} className="text-sm font-medium text-primary hover:text-primary/80">
              {t('invite.have-account')}
            </Link>
          </CardFooter>
        </form>
      </Card>
    </AuthLayout>
  )
}
