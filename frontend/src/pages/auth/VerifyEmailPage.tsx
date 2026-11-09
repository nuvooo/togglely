import { CheckCircle2, Mail } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useParams } from 'react-router-dom'
import {
  AUTH_LINK_CLASS,
  AuthCard,
  AuthLayout,
  AuthLoading,
  FormError,
} from '@/components/auth/AuthLayout'
import { Button } from '@/components/ui/button'
import api from '@/lib/axios'
import { getErrorMessage } from '@/lib/errors'
import { useSetupStatus } from '@/lib/setup'

type VerifyState =
  | { status: 'loading' }
  | { status: 'success' }
  | { status: 'error'; message: string }

/** `/verify-email/:token`: confirms the address from a verification mail. */
export default function VerifyEmailPage() {
  const { t } = useTranslation()
  const { token } = useParams<{ token: string }>()
  const [state, setState] = useState<VerifyState>({ status: 'loading' })
  // Resending needs a mail server
  const mailEnabled = useSetupStatus()?.mailEnabled === true

  useEffect(() => {
    if (!token) return
    let active = true
    setState({ status: 'loading' })
    api
      .get(`/auth/verify-email/${encodeURIComponent(token)}`)
      .then(() => active && setState({ status: 'success' }))
      .catch(
        (err: unknown) =>
          active && setState({ status: 'error', message: getErrorMessage(err) })
      )
    return () => {
      active = false
    }
  }, [token])

  if (state.status === 'loading') {
    return (
      <AuthLayout>
        <AuthLoading />
      </AuthLayout>
    )
  }

  if (state.status === 'success') {
    return (
      <AuthLayout>
        <AuthCard
          centered
          icon={<CheckCircle2 className="h-5 w-5 text-success" />}
          title={t('auth-pages.verify.success-title')}
          description={t('auth-pages.verify.success-text')}
        >
          <Button asChild className="w-full">
            <Link to="/login">{t('auth-pages.continue-to-login')}</Link>
          </Button>
        </AuthCard>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout
      footer={
        mailEnabled && (
          <Link to="/resend-verification" className={AUTH_LINK_CLASS}>
            {t('auth-pages.verify.resend-link')}
          </Link>
        )
      }
    >
      <AuthCard
        centered
        icon={<Mail className="h-5 w-5" />}
        title={t('auth-pages.verify.error-title')}
      >
        <div className="space-y-4">
          <FormError>{state.message}</FormError>
          <Button asChild variant="outline" className="w-full">
            <Link to="/login">{t('forgot.back')}</Link>
          </Button>
        </div>
      </AuthCard>
    </AuthLayout>
  )
}
