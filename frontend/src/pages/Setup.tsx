import { Loader2 } from 'lucide-react'
import { type FormEvent, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { AuthLayout, FormError } from '@/components/auth/AuthLayout'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import api from '@/lib/axios'
import { getErrorMessage, getErrorStatus } from '@/lib/errors'
import { passwordIssue } from '@/lib/password'
import { ROUTES } from '@/lib/routes'
import { markSetupComplete, useSetupStatus } from '@/lib/setup'
import { refreshWorkspace } from '@/lib/workspace'
import { type SessionResponse, useAuthStore } from '@/store/authStore'

/** First-run setup: creates the first user (owner) and organization. */
export default function Setup() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const status = useSetupStatus()
  const setSession = useAuthStore((s) => s.setSession)

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [organizationName, setOrganizationName] = useState('')
  const [setupToken, setSetupToken] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const tokenRequired = status?.setupTokenRequired === true

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)

    const issue = passwordIssue(password)
    if (issue) return setError(t(`password.${issue}`))
    if (password !== confirmPassword) return setError(t('password.mismatch'))

    setIsSubmitting(true)
    try {
      const { data } = await api.post<SessionResponse>('/setup', {
        name: name.trim(),
        email: email.trim(),
        password,
        organizationName: organizationName.trim(),
        ...(tokenRequired ? { setupToken: setupToken.trim() } : {}),
      })
      setSession(data)
      markSetupComplete()
      refreshWorkspace().catch(() => {})
      navigate(ROUTES.projects, { replace: true })
    } catch (err: unknown) {
      const code = getErrorStatus(err)
      if (code === 409) {
        // Someone else finished the setup meanwhile: /setup now leads to /login
        setError(t('setup.error-already-done'))
        markSetupComplete()
      } else if (code === 403) {
        setError(t('setup.error-token'))
      } else {
        setError(getErrorMessage(err))
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <AuthLayout>
      <Card className="shadow-sm">
        <CardHeader className="space-y-1 pb-2 text-center">
          <CardTitle className="text-2xl font-semibold">{t('setup.title')}</CardTitle>
          <CardDescription>{t('setup.subtitle')}</CardDescription>
        </CardHeader>

        <form onSubmit={handleSubmit} noValidate>
          <CardContent className="space-y-4 pt-4">
            {error && <FormError>{error}</FormError>}

            <div className="space-y-2">
              <Label htmlFor="setup-name">{t('setup.name-label')}</Label>
              <Input
                id="setup-name"
                autoComplete="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t('setup.name-placeholder')}
                maxLength={200}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="setup-email">{t('setup.email-label')}</Label>
              <Input
                id="setup-email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t('login.email-placeholder')}
                maxLength={254}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="setup-password">{t('setup.password-label')}</Label>
              <Input
                id="setup-password"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                aria-describedby="setup-password-hint"
                required
              />
              <p id="setup-password-hint" className="text-xs text-muted-foreground">
                {t('password.hint')}
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="setup-confirm">{t('setup.confirm-password-label')}</Label>
              <Input
                id="setup-confirm"
                type="password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="setup-org">{t('setup.organization-label')}</Label>
              <Input
                id="setup-org"
                value={organizationName}
                onChange={(e) => setOrganizationName(e.target.value)}
                placeholder={t('setup.organization-placeholder')}
                maxLength={100}
                required
              />
            </div>

            {tokenRequired && (
              <div className="space-y-2">
                <Label htmlFor="setup-token">{t('setup.token-label')}</Label>
                <Input
                  id="setup-token"
                  type="password"
                  autoComplete="off"
                  value={setupToken}
                  onChange={(e) => setSetupToken(e.target.value)}
                  aria-describedby="setup-token-hint"
                  className="font-mono"
                  required
                />
                <p id="setup-token-hint" className="text-xs text-muted-foreground">
                  {t('setup.token-hint')}
                </p>
              </div>
            )}
          </CardContent>

          <CardFooter className="pt-2">
            <Button
              type="submit"
              className="w-full"
              disabled={
                isSubmitting ||
                !name.trim() ||
                !email.trim() ||
                !organizationName.trim() ||
                (tokenRequired && !setupToken.trim())
              }
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t('setup.submitting')}
                </>
              ) : (
                t('setup.submit')
              )}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </AuthLayout>
  )
}
