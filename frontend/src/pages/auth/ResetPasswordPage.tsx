import { CheckCircle2, Loader2, XCircle } from 'lucide-react'
import { type FormEvent, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import {
  AuthCard,
  AuthLayout,
  AuthLoading,
  FormError,
  fieldErrorProps,
} from '@/components/auth/AuthLayout'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { PasswordInput } from '@/components/ui/password-input'
import api from '@/lib/axios'
import { getErrorMessage } from '@/lib/errors'
import { passwordIssue } from '@/lib/password'
import { ROUTES } from '@/lib/routes'
import { useAuthStore } from '@/store/authStore'

/**
 * Sets a new password via `?token=` — from a reset email, an owner's reset
 * link or the server CLI, so it works with or without a mail server.
 */
export default function ResetPasswordPage() {
  const { t } = useTranslation()
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()
  // Read once and kept in state: the token is removed from the URL right away
  const [token] = useState(() => searchParams.get('token'))
  const loggedIn = useAuthStore((s) => !!s.token)
  const [done, setDone] = useState(false)

  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [valid, setValid] = useState<boolean | null>(token ? null : false)
  const [error, setError] = useState<string | null>(null)

  // Keep the secret out of the address bar, history and Referer headers
  useEffect(() => {
    if (searchParams.has('token')) setSearchParams({}, { replace: true })
  }, [searchParams, setSearchParams])

  useEffect(() => {
    if (!token) return
    let active = true
    api
      .get('/password-reset/validate', { params: { token } })
      .then((res) => active && setValid(res.data.valid === true))
      .catch(() => active && setValid(false))
    return () => {
      active = false
    }
  }, [token])

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    const issue = passwordIssue(password)
    if (issue) return setError(t(`password.${issue}`))
    if (password !== confirmPassword) return setError(t('password.mismatch'))

    setIsSaving(true)
    try {
      await api.post('/password-reset/reset', { token, password })
      // A logged-in user may have reset someone else's account, so the local
      // session stays. If it was their own, the server revoked it and the next
      // API call ends it via the session-expired handling.
      if (loggedIn) {
        setDone(true)
        return
      }
      toast.success(t('reset.success'))
      navigate('/login', { replace: true })
    } catch (err: unknown) {
      setError(getErrorMessage(err))
      setIsSaving(false)
    }
  }

  if (valid === null) {
    return (
      <AuthLayout>
        <AuthLoading />
      </AuthLayout>
    )
  }

  if (done) {
    return (
      <AuthLayout>
        <AuthCard
          centered
          icon={<CheckCircle2 className="h-5 w-5 text-success" />}
          title={t('reset.success-title')}
          description={t('reset.success-logged-in')}
        >
          <Button asChild className="w-full">
            <Link to={ROUTES.overview}>{t('reset.continue')}</Link>
          </Button>
        </AuthCard>
      </AuthLayout>
    )
  }

  if (!valid) {
    return (
      <AuthLayout>
        <AuthCard
          centered
          icon={<XCircle className="h-5 w-5 text-destructive" />}
          title={t('reset.invalid-title')}
          description={t('reset.invalid-text')}
        >
          <Button asChild variant="outline" className="w-full">
            <Link
              to={loggedIn ? `${ROUTES.account}#security` : '/forgot-password'}
            >
              {t('reset.request-new')}
            </Link>
          </Button>
        </AuthCard>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout>
      <AuthCard title={t('reset.title')} description={t('reset.subtitle')}>
        <form onSubmit={handleSubmit} noValidate className="space-y-4">
          {error && <FormError id="reset-error">{error}</FormError>}
          <div className="space-y-2">
            <Label htmlFor="reset-password">{t('reset.password-label')}</Label>
            <PasswordInput
              {...fieldErrorProps('reset-error', Boolean(error), 'reset-password-hint')}
              id="reset-password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            <p
              id="reset-password-hint"
              className="text-xs text-muted-foreground"
            >
              {t('password.hint')}
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="reset-confirm">{t('reset.confirm-label')}</Label>
            <PasswordInput
              {...fieldErrorProps('reset-error', Boolean(error))}
              id="reset-confirm"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
            />
          </div>
          <Button type="submit" className="w-full" disabled={isSaving}>
            {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isSaving ? t('reset.submitting') : t('reset.submit')}
          </Button>
        </form>
      </AuthCard>
    </AuthLayout>
  )
}
