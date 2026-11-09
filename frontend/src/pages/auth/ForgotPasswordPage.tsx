import { Loader2, Mail } from 'lucide-react'
import { type FormEvent, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import {
  AUTH_LINK_CLASS,
  AuthCard,
  AuthLayout,
  AuthLoading,
  FormError,
} from '@/components/auth/AuthLayout'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import api from '@/lib/axios'
import { getErrorMessage } from '@/lib/errors'
import { useSetupStatusResult } from '@/lib/setup'

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
export default function ForgotPasswordPage() {
  const { t } = useTranslation()
  const { status, error: statusError, retry } = useSetupStatusResult()
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

  // Without the status we cannot tell whether mail works: don't guess, offer a retry
  if (statusError) {
    return (
      <AuthLayout>
        <AuthCard title={t('forgot.title')}>
          <div className="space-y-4">
            <FormError>{t('forgot.status-error')}</FormError>
            <div className="space-y-2">
              <Button className="w-full" onClick={retry}>
                {t('common.retry')}
              </Button>
              <BackToLogin />
            </div>
          </div>
        </AuthCard>
      </AuthLayout>
    )
  }

  if (!status) {
    return (
      <AuthLayout>
        <AuthLoading />
      </AuthLayout>
    )
  }

  if (!status.mailEnabled) {
    return (
      <AuthLayout>
        <AuthCard title={t('forgot.no-mail-title')}>
          <div className="space-y-4 text-sm">
            <p className="text-muted-foreground">{t('forgot.no-mail-text')}</p>
            <p className="text-muted-foreground">{t('forgot.no-mail-admin')}</p>
            <pre className="overflow-x-auto rounded-md bg-muted px-3 py-2 font-mono text-xs">
              <code>node dist/cli reset-password &lt;email&gt;</code>
            </pre>
            <BackToLogin />
          </div>
        </AuthCard>
      </AuthLayout>
    )
  }

  if (isSent) {
    return (
      <AuthLayout>
        <AuthCard
          centered
          icon={<Mail className="h-5 w-5" />}
          title={t('forgot.sent-title')}
          description={t('forgot.sent-text', { email: email.trim() })}
        >
          <BackToLogin />
        </AuthCard>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout
      footer={
        <Link to="/login" className={AUTH_LINK_CLASS}>
          {t('forgot.back')}
        </Link>
      }
    >
      <AuthCard title={t('forgot.title')} description={t('forgot.subtitle')}>
        <form onSubmit={handleSubmit} className="space-y-4">
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
          <Button
            type="submit"
            className="w-full"
            disabled={isLoading || !email.trim()}
          >
            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isLoading ? t('forgot.submitting') : t('forgot.submit')}
          </Button>
        </form>
      </AuthCard>
    </AuthLayout>
  )
}
