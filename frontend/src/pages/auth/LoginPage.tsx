import { Loader2 } from 'lucide-react'
import { type FormEvent, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
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
import { PasswordInput } from '@/components/ui/password-input'
import { safeNextPath } from '@/lib/redirect'
import { ROUTES } from '@/lib/routes'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/store/authStore'

const DEMO_EMAIL = 'demo@togglely.io'
const DEMO_PASSWORD = 'demo123!'

/** Credentials of the public demo instance; shown only with `?demo=true`. */
function DemoHint() {
  const { t } = useTranslation()
  return (
    <div className="mb-4 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-sm">
      <p className="font-medium">{t('auth-pages.demo-title')}</p>
      <p className="mt-1 text-muted-foreground">
        {t('login.email-label')}:{' '}
        <code className="font-mono text-foreground">{DEMO_EMAIL}</code>
      </p>
      <p className="text-muted-foreground">
        {t('login.password-label')}:{' '}
        <code className="font-mono text-foreground">{DEMO_PASSWORD}</code>
      </p>
    </div>
  )
}

export default function LoginPage() {
  const { t } = useTranslation()
  const [searchParams] = useSearchParams()
  const isDemo = searchParams.get('demo') === 'true'
  const next = safeNextPath(searchParams.get('next'))
  const [email, setEmail] = useState(isDemo ? DEMO_EMAIL : '')
  const [password, setPassword] = useState(isDemo ? DEMO_PASSWORD : '')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const navigate = useNavigate()
  const login = useAuthStore((s) => s.login)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setError(null)

    try {
      await login(email, password)
      navigate(next ?? ROUTES.overview, { replace: true })
    } catch {
      setError(t('login.error-invalid-credentials'))
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <AuthLayout footer={t('login.no-account')}>
      <AuthCard title={t('login.title')} description={t('login.subtitle')}>
        {isDemo && <DemoHint />}
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && <FormError id="login-error">{error}</FormError>}

          <div className="space-y-2">
            <Label htmlFor="email">{t('login.email-label')}</Label>
            <Input
              {...fieldErrorProps('login-error', Boolean(error))}
              id="email"
              type="email"
              autoComplete="email"
              placeholder={t('login.email-placeholder')}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="password">{t('login.password-label')}</Label>
              {/* Without mail, /forgot-password explains the alternatives */}
              <Link
                to="/forgot-password"
                className={cn(AUTH_LINK_CLASS, 'text-sm text-muted-foreground')}
              >
                {t('login.forgot-password')}
              </Link>
            </div>
            <PasswordInput
              {...fieldErrorProps('login-error', Boolean(error))}
              id="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          <Button type="submit" className="w-full" disabled={isLoading}>
            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isLoading ? t('login.signing-in') : t('login.sign-in')}
          </Button>
        </form>
      </AuthCard>
    </AuthLayout>
  )
}
