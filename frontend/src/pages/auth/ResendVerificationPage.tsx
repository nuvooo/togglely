import { Loader2, Mail } from 'lucide-react'
import { type FormEvent, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import {
  AUTH_LINK_CLASS,
  AuthCard,
  AuthLayout,
  FormError,
  fieldErrorProps,
} from '@/components/auth/AuthLayout'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import api from '@/lib/axios'
import { getErrorMessage } from '@/lib/errors'

/** `/resend-verification`: sends a new verification mail (only routed with a mail server). */
export default function ResendVerificationPage() {
  const { t } = useTranslation()
  const [email, setEmail] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)
    setError(null)
    try {
      await api.post('/auth/resend-verification', { email: email.trim() })
      setSent(true)
    } catch (err: unknown) {
      setError(getErrorMessage(err))
    } finally {
      setIsSubmitting(false)
    }
  }

  if (sent) {
    return (
      <AuthLayout>
        <AuthCard
          centered
          icon={<Mail className="h-5 w-5" />}
          title={t('auth-pages.resend.sent-title')}
          description={t('auth-pages.resend.sent-text', {
            email: email.trim(),
          })}
        >
          <Button asChild variant="outline" className="w-full">
            <Link to="/login">{t('forgot.back')}</Link>
          </Button>
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
      <AuthCard
        title={t('auth-pages.resend.title')}
        description={t('auth-pages.resend.subtitle')}
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && <FormError id="resend-error">{error}</FormError>}
          <div className="space-y-2">
            <Label htmlFor="resend-email">{t('login.email-label')}</Label>
            <Input
              {...fieldErrorProps('resend-error', Boolean(error))}
              id="resend-email"
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
            disabled={isSubmitting || !email.trim()}
          >
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isSubmitting
              ? t('auth-pages.resend.submitting')
              : t('auth-pages.resend.submit')}
          </Button>
        </form>
      </AuthCard>
    </AuthLayout>
  )
}
