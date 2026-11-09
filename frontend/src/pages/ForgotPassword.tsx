import { Loader2, Mail } from 'lucide-react'
import { type FormEvent, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { AuthLayout, FormError } from '@/components/auth/AuthLayout'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import api from '@/lib/axios'
import { getErrorMessage } from '@/lib/errors'
import { useSetupStatus } from '@/lib/setup'

function BackToLogin() {
  const { t } = useTranslation()
  return (
    <Button asChild variant="outline" className="w-full">
      <Link to="/login">{t('forgot.back')}</Link>
    </Button>
  )
}

/**
 * Requests a reset email. Without a mail server it explains the
 * alternatives instead: a reset link from the organization owner or the CLI.
 */
export default function ForgotPassword() {
  const { t } = useTranslation()
  const status = useSetupStatus()
  const [email, setEmail] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isSent, setIsSent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setError(null)
    try {
      await api.post('/password-reset/request', { email: email.trim() })
      setIsSent(true)
    } catch (err: unknown) {
      setError(getErrorMessage(err))
    } finally {
      setIsLoading(false)
    }
  }

  if (!status) {
    return (
      <AuthLayout>
        <div role="status" className="flex justify-center py-12" aria-label={t('common.loading')}>
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </AuthLayout>
    )
  }

  if (!status.mailEnabled) {
    return (
      <AuthLayout>
        <Card className="shadow-sm">
          <CardHeader className="space-y-1 pb-2 text-center">
            <CardTitle className="text-2xl font-semibold">{t('forgot.no-mail-title')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 pt-4 text-sm">
            <p className="text-muted-foreground">{t('forgot.no-mail-text')}</p>
            <p className="text-muted-foreground">{t('forgot.no-mail-admin')}</p>
            <pre className="overflow-x-auto rounded bg-muted px-3 py-2 font-mono text-xs">
              <code>node dist/cli reset-password &lt;email&gt;</code>
            </pre>
          </CardContent>
          <CardFooter className="pt-2">
            <BackToLogin />
          </CardFooter>
        </Card>
      </AuthLayout>
    )
  }

  if (isSent) {
    return (
      <AuthLayout>
        <Card className="shadow-sm">
          <CardContent className="space-y-4 pt-6 text-center">
            <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-secondary">
              <Mail className="h-6 w-6 text-secondary-foreground" />
            </div>
            <h2 className="text-xl font-semibold">{t('forgot.sent-title')}</h2>
            <p className="text-sm text-muted-foreground">{t('forgot.sent-text', { email: email.trim() })}</p>
            <BackToLogin />
          </CardContent>
        </Card>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout>
      <Card className="shadow-sm">
        <CardHeader className="space-y-1 pb-2 text-center">
          <CardTitle className="text-2xl font-semibold">{t('forgot.title')}</CardTitle>
          <CardDescription>{t('forgot.subtitle')}</CardDescription>
        </CardHeader>
        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-4 pt-4">
            {error && <FormError>{error}</FormError>}
            <div className="space-y-2">
              <Label htmlFor="forgot-email">{t('login.email-label')}</Label>
              <Input
                id="forgot-email"
                type="email"
                autoComplete="email"
                placeholder={t('login.email-placeholder')}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
          </CardContent>
          <CardFooter className="flex-col gap-4 pt-2">
            <Button type="submit" className="w-full" disabled={isLoading || !email.trim()}>
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isLoading ? t('forgot.submitting') : t('forgot.submit')}
            </Button>
            <Link to="/login" className="text-sm font-medium text-primary hover:text-primary/80">
              {t('forgot.back')}
            </Link>
          </CardFooter>
        </form>
      </Card>
    </AuthLayout>
  )
}
