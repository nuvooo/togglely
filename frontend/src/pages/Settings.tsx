import {
  CheckCircleIcon,
  ExclamationCircleIcon,
  KeyIcon,
  SwatchIcon,
  UserCircleIcon,
} from '@heroicons/react/24/outline'
import { type ReactNode, useEffect, useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useLocation } from 'react-router-dom'
import { LANGUAGES } from '@/components/LanguageSwitcher'
import { THEME_OPTIONS } from '@/components/ThemeToggle'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import api from '@/lib/axios'
import { getErrorMessage } from '@/lib/errors'

import { cn } from '@/lib/utils'
import { useAuthStore } from '@/store/authStore'
import { useThemeStore } from '@/store/themeStore'

/** Segmented single-choice control (radio group semantics). */
function ChoiceGroup<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: T
  options: { value: T; label: string; icon?: ReactNode }[]
  onChange: (value: T) => void
}) {
  const labelId = useId()
  return (
    <div className="space-y-2">
      <div id={labelId} className="text-sm font-medium">
        {label}
      </div>
      <div role="radiogroup" aria-labelledby={labelId} className="inline-flex flex-wrap gap-1 rounded-lg border bg-muted/40 p-1">
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={value === o.value}
            onClick={() => onChange(o.value)}
            className={cn(
              'flex items-center gap-2 rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground',
              value === o.value && 'bg-background font-medium text-foreground shadow-sm'
            )}
          >
            {o.icon}
            {o.label}
          </button>
        ))}
      </div>
    </div>
  )
}

function AppearanceSection() {
  const { t, i18n } = useTranslation()
  const { theme, setTheme } = useThemeStore()
  const language = (i18n.resolvedLanguage ?? i18n.language) as (typeof LANGUAGES)[number]['code']

  return (
    <Card id="appearance" className="scroll-mt-4">
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <SwatchIcon className="w-5 h-5 text-primary" />
          </div>
          <div>
            <CardTitle>{t('settings.appearance.title')}</CardTitle>
            <CardDescription>{t('settings.appearance.description')}</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        <ChoiceGroup
          label={t('settings.appearance.theme')}
          value={theme}
          onChange={setTheme}
          options={THEME_OPTIONS.map(({ value, label, icon: Icon }) => ({
            value,
            label: t(label),
            icon: <Icon className="h-4 w-4" />,
          }))}
        />
        <ChoiceGroup
          label={t('settings.appearance.language')}
          value={language}
          onChange={(code) => i18n.changeLanguage(code)}
          options={LANGUAGES.map(({ code, label }) => ({ value: code, label: t(label) }))}
        />
      </CardContent>
    </Card>
  )
}

interface UserProfile {
  id: string
  email: string
  firstName: string
  lastName: string
  name: string
  createdAt: string
  updatedAt: string
}

export default function Settings() {
  const { t } = useTranslation()
  const { updateUser } = useAuthStore()
  const { hash } = useLocation()
  const [, setProfile] = useState<UserProfile | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [message, setMessage] = useState<{
    type: 'success' | 'error'
    text: string
  } | null>(null)

  // Form states
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')

  // Password change states
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [isChangingPassword, setIsChangingPassword] = useState(false)

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const response = await api.get('/auth/me')
        const data = response.data.user || response.data
        setProfile({
          ...data,
          name: `${data.firstName} ${data.lastName}`.trim(),
        })
        setFirstName(data.firstName || '')
        setLastName(data.lastName || '')
        setEmail(data.email || '')
      } catch (error) {
        console.error('Failed to fetch profile:', error)
        setMessage({ type: 'error', text: t('settings.profile.load-error') })
      } finally {
        setIsLoading(false)
      }
    }

    fetchProfile()
  }, [])

  // Account sections are linked by hash (/account#security); scroll once the page has rendered.
  useEffect(() => {
    if (isLoading || !hash) return
    document.getElementById(decodeURIComponent(hash.slice(1)))?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [hash, isLoading])

  const handleProfileSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSaving(true)
    setMessage(null)

    try {
      const response = await api.patch('/auth/profile', {
        firstName,
        lastName,
      })

      const updatedUser = response.data.user || response.data

      setProfile({
        ...updatedUser,
        name: `${updatedUser.firstName} ${updatedUser.lastName}`.trim(),
      })

      // Update auth store
      updateUser({
        name: `${updatedUser.firstName} ${updatedUser.lastName}`.trim(),
      })

      setMessage({ type: 'success', text: t('settings.profile.success') })
    } catch (error: unknown) {
      console.error('Failed to update profile:', error)
      setMessage({
        type: 'error',
        text: getErrorMessage(error),
      })
    } finally {
      setIsSaving(false)
    }
  }

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setMessage(null)

    if (newPassword !== confirmPassword) {
      setMessage({ type: 'error', text: t('settings.password.mismatch') })
      return
    }

    if (newPassword.length < 8) {
      setMessage({
        type: 'error',
        text: t('settings.password.too-short'),
      })
      return
    }

    setIsChangingPassword(true)

    try {
      const response = await api.post('/auth/change-password', {
        currentPassword,
        newPassword,
      })
      // Old sessions are revoked on password change; keep this one alive
      if (response.data?.token) {
        useAuthStore.getState().setToken(response.data.token)
      }

      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      setMessage({ type: 'success', text: t('settings.password.success') })
    } catch (error: unknown) {
      console.error('Failed to change password:', error)
      setMessage({
        type: 'error',
        text: getErrorMessage(error),
      })
    } finally {
      setIsChangingPassword(false)
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">
          {t('settings.title')}
        </h1>
        <p className="text-muted-foreground mt-1">{t('settings.subtitle')}</p>
      </div>

      {message && (
        <div
          className={`p-4 rounded-lg ${message.type === 'success' ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-destructive/10 text-destructive border border-destructive/20'}`}
        >
          <div className="flex items-center gap-2">
            {message.type === 'success' ? (
              <CheckCircleIcon className="h-5 w-5" />
            ) : (
              <ExclamationCircleIcon className="h-5 w-5" />
            )}
            <span>{message.text}</span>
          </div>
        </div>
      )}

      {/* Profile Section */}
      <Card id="profile" className="scroll-mt-4">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <UserCircleIcon className="w-5 h-5 text-primary" />
            </div>
            <div>
              <CardTitle>{t('settings.profile.title')}</CardTitle>
              <CardDescription>
                {t('settings.profile.description')}
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleProfileSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="firstName">
                  {t('settings.profile.first-name')}
                </Label>
                <Input
                  id="firstName"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  placeholder="John"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="lastName">
                  {t('settings.profile.last-name')}
                </Label>
                <Input
                  id="lastName"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  placeholder="Doe"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">{t('settings.profile.email')}</Label>
              <Input
                id="email"
                type="email"
                value={email}
                disabled
                className="bg-muted"
              />
              <p className="text-xs text-muted-foreground">
                {t('settings.profile.email-help')}
              </p>
            </div>
            <div className="flex justify-end">
              <Button type="submit" disabled={isSaving}>
                {isSaving
                  ? t('settings.profile.saving')
                  : t('settings.profile.save')}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Password Section */}
      <Card id="security" className="scroll-mt-4">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <KeyIcon className="w-5 h-5 text-primary" />
            </div>
            <div>
              <CardTitle>{t('settings.password.title')}</CardTitle>
              <CardDescription>
                {t('settings.password.description')}
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={handlePasswordSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="currentPassword">
                {t('settings.password.current')}
              </Label>
              <Input
                id="currentPassword"
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="••••••••"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="newPassword">{t('settings.password.new')}</Label>
              <Input
                id="newPassword"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="••••••••"
                required
                minLength={8}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmPassword">
                {t('settings.password.confirm')}
              </Label>
              <Input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
                required
              />
            </div>
            <div className="flex justify-end">
              <Button type="submit" disabled={isChangingPassword}>
                {isChangingPassword
                  ? t('settings.password.changing')
                  : t('settings.password.submit')}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <AppearanceSection />
    </div>
  )
}
