import { Loader2 } from 'lucide-react'
import { type FormEvent, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { AuthLayout, FormError } from '@/components/auth/AuthLayout'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import api from '@/lib/axios'
import { getErrorMessage } from '@/lib/errors'
import { passwordIssue } from '@/lib/password'
import { ROUTES } from '@/lib/routes'
import { useAuthStore } from '@/store/authStore'

/**
 * Sets a new password via `?token=` — from a reset email, an owner's reset
 * link or the server CLI, so it works with or without a mail server.
 */
export default function ResetPassword() {
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
        <div role="status" className="flex justify-center py-12" aria-label={t('common.loading')}>
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </AuthLayout>
    )
  }

  if (done) {
    return (
      <AuthLayout>
        <Card className="shadow-sm">
          <CardContent className="space-y-4 pt-6 text-center">
            <h2 className="text-xl font-semibold">{t('reset.success-title')}</h2>
            <p className="text-sm text-muted-foreground">{t('reset.success-logged-in')}</p>
            <Button asChild className="w-full">
              <Link to={ROUTES.overview}>{t('reset.continue')}</Link>
            </Button>
          </CardContent>
        </Card>
      </AuthLayout>
    )
  }

  if (!valid) {
    return (
      <AuthLayout>
        <Card className="shadow-sm">
          <CardContent className="space-y-4 pt-6 text-center">
            <h2 className="text-xl font-semibold">{t('reset.invalid-title')}</h2>
            <p className="text-sm text-muted-foreground">{t('reset.invalid-text')}</p>
            <Button asChild variant="outline" className="w-full">
              <Link to={loggedIn ? `${ROUTES.account}#security` : '/forgot-password'}>{t('reset.request-new')}</Link>
            </Button>
          </CardContent>
        </Card>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout>
      <Card className="shadow-sm">
        <CardHeader className="space-y-1 pb-2 text-center">
          <CardTitle className="text-2xl font-semibold">{t('reset.title')}</CardTitle>
          <CardDescription>{t('reset.subtitle')}</CardDescription>
        </CardHeader>
        <form onSubmit={handleSubmit} noValidate>
          <CardContent className="space-y-4 pt-4">
            {error && <FormError>{error}</FormError>}
            <div className="space-y-2">
              <Label htmlFor="reset-password">{t('reset.password-label')}</Label>
              <Input
                id="reset-password"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                aria-describedby="reset-password-hint"
                required
              />
              <p id="reset-password-hint" className="text-xs text-muted-foreground">
                {t('password.hint')}
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="reset-confirm">{t('reset.confirm-label')}</Label>
              <Input
                id="reset-confirm"
                type="password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
              />
            </div>
          </CardContent>
          <CardFooter className="pt-2">
            <Button type="submit" className="w-full" disabled={isSaving}>
              {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isSaving ? t('reset.submitting') : t('reset.submit')}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </AuthLayout>
  )
}
