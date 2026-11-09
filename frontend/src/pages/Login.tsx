import { Loader2 } from 'lucide-react'
import { type FormEvent, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { AuthLayout, FormError } from '@/components/auth/AuthLayout'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { safeNextPath } from '@/lib/redirect'
import { ROUTES } from '@/lib/routes'
import { useAuthStore } from '@/store/authStore'

export default function Login() {
  const { t } = useTranslation()
  const [searchParams] = useSearchParams()
  const isDemo = searchParams.get('demo') === 'true'
  const next = safeNextPath(searchParams.get('next'))
  const [email, setEmail] = useState(isDemo ? 'demo@togglely.io' : '')
  const [password, setPassword] = useState(isDemo ? 'demo123!' : '')
  const [rememberMe, setRememberMe] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const navigate = useNavigate()
  const { login } = useAuthStore()

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
    <AuthLayout
      footer={
        <p className="mt-6 text-center text-sm text-muted-foreground">
          {t('login.terms-prefix')}{' '}
          <a href="#" className="text-primary hover:underline">
            {t('login.terms-link')}
          </a>{' '}
          {t('common.and')}{' '}
          <a href="#" className="text-primary hover:underline">
            {t('login.privacy-link')}
          </a>
        </p>
      }
    >
      <Card className="shadow-sm">
        <CardHeader className="space-y-1 pb-2 text-center">
          <CardTitle className="text-2xl font-semibold">{t('login.title')}</CardTitle>
          <CardDescription>{t('login.subtitle')}</CardDescription>
          {isDemo && (
            <div className="mt-4 rounded-md border border-warning/40 bg-warning/10 p-3 text-left text-sm text-foreground">
              <p className="mb-1 font-medium">Live Demo Mode</p>
              <p>
                Email: <code className="rounded bg-muted px-1 font-mono">demo@togglely.io</code>
              </p>
              <p>
                Password: <code className="rounded bg-muted px-1 font-mono">demo123!</code>
              </p>
            </div>
          )}
        </CardHeader>

        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-4 pt-4">
            {error && <FormError>{error}</FormError>}

            <div className="space-y-2">
              <Label htmlFor="email">{t('login.email-label')}</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                placeholder={t('login.email-placeholder')}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="h-10"
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">{t('login.password-label')}</Label>
                {/* Without mail, /forgot-password explains the alternatives */}
                <Link to="/forgot-password" className="text-sm font-medium text-primary hover:text-primary/80">
                  {t('login.forgot-password')}
                </Link>
              </div>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                placeholder={t('login.password-placeholder')}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="h-10"
              />
            </div>

            <div className="flex items-center space-x-2">
              <Checkbox
                id="remember"
                checked={rememberMe}
                onCheckedChange={(checked) => setRememberMe(checked as boolean)}
              />
              <Label htmlFor="remember" className="cursor-pointer text-sm font-normal">
                {t('login.remember-me')}
              </Label>
            </div>
          </CardContent>

          <CardFooter className="flex-col gap-4 pt-2">
            <Button type="submit" className="h-10 w-full font-semibold" disabled={isLoading}>
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t('login.signing-in')}
                </>
              ) : (
                t('login.sign-in')
              )}
            </Button>

            <p className="text-center text-sm text-muted-foreground">{t('login.no-account')}</p>
          </CardFooter>
        </form>
      </Card>
    </AuthLayout>
  )
}
