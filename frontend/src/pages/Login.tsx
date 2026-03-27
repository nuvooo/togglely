import { FlagIcon, Loader2 } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { ThemeToggle } from '@/components/ThemeToggle'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAuthStore } from '@/store/authStore'

export default function Login() {
  const { t } = useTranslation()
  const [searchParams] = useSearchParams()
  const isDemo = searchParams.get('demo') === 'true'
  const [email, setEmail] = useState(isDemo ? 'demo@togglely.io' : '')
  const [password, setPassword] = useState(isDemo ? 'demo1234' : '')
  const [rememberMe, setRememberMe] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const navigate = useNavigate()
  const { login } = useAuthStore()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setError(null)

    try {
      await login(email, password)
      navigate('/')
    } catch (err: unknown) {
      setError(t('login.error-invalid-credentials'))
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      {/* Theme Toggle - positioned absolute top right */}
      <div className="fixed top-4 right-4">
        <ThemeToggle />
      </div>
      <div className="w-full max-w-md">
        <div className="flex justify-center mb-8">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-primary rounded-xl flex items-center justify-center shadow-lg shadow-primary/20">
              <FlagIcon className="w-7 h-7 text-primary-foreground" />
            </div>
            <span className="text-3xl font-bold text-foreground">
              {t('common.app-name')}
            </span>
          </div>
        </div>

        <Card className="border-0 shadow-2xl shadow-slate-200/50 dark:shadow-slate-900/50">
          <CardHeader className="space-y-1 text-center pb-2">
            <CardTitle className="text-2xl font-bold">
              {t('login.title')}
            </CardTitle>
            <CardDescription>{t('login.subtitle')}</CardDescription>
            {isDemo && (
              <div className="mt-4 p-3 rounded-lg bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300 text-sm">
                <p className="font-medium mb-1">🎮 Live Demo Mode</p>
                <p>
                  Email:{' '}
                  <code className="font-mono bg-amber-100 dark:bg-amber-950 px-1 rounded">
                    demo@togglely.io
                  </code>
                </p>
                <p>
                  Password:{' '}
                  <code className="font-mono bg-amber-100 dark:bg-amber-950 px-1 rounded">
                    demo1234
                  </code>
                </p>
              </div>
            )}
          </CardHeader>

          <form onSubmit={handleSubmit}>
            <CardContent className="space-y-4 pt-4">
              {error && (
                <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm">
                  {error}
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="email">{t('login.email-label')}</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder={t('login.email-placeholder')}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="h-11"
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password">{t('login.password-label')}</Label>
                  <Link
                    to="/forgot-password"
                    className="text-sm text-primary hover:text-primary/80 font-medium"
                  >
                    {t('login.forgot-password')}
                  </Link>
                </div>
                <Input
                  id="password"
                  type="password"
                  placeholder={t('login.password-placeholder')}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="h-11"
                />
              </div>

              <div className="flex items-center space-x-2">
                <Checkbox
                  id="remember"
                  checked={rememberMe}
                  onCheckedChange={(checked) =>
                    setRememberMe(checked as boolean)
                  }
                />
                <Label
                  htmlFor="remember"
                  className="text-sm font-normal cursor-pointer"
                >
                  {t('login.remember-me')}
                </Label>
              </div>
            </CardContent>

            <CardFooter className="flex-col gap-4 pt-2">
              <Button
                type="submit"
                className="w-full h-11 text-base font-semibold"
                disabled={isLoading}
              >
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {t('login.signing-in')}
                  </>
                ) : (
                  t('login.sign-in')
                )}
              </Button>

              <div className="relative w-full">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-border" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-background px-2 text-muted-foreground">
                    {t('common.or')}
                  </span>
                </div>
              </div>

              <p className="text-sm text-muted-foreground text-center">
                {t('login.no-account')}{' '}
                <Link
                  to="/register"
                  className="text-primary font-semibold hover:text-primary/80"
                >
                  {t('login.sign-up')}
                </Link>
              </p>
            </CardFooter>
          </form>
        </Card>

        <p className="text-center text-sm text-muted-foreground mt-6">
          {t('login.terms-prefix')}{' '}
          <a href="#" className="text-primary hover:underline">
            {t('login.terms-link')}
          </a>{' '}
          {t('common.and')}{' '}
          <a href="#" className="text-primary hover:underline">
            {t('login.privacy-link')}
          </a>
        </p>
      </div>
    </div>
  )
}
