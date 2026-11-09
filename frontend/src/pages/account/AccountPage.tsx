import { Loader2 } from 'lucide-react'
import {
  type FormEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useId,
  useState,
} from 'react'
import { useTranslation } from 'react-i18next'
import { useLocation } from 'react-router-dom'
import { toast } from 'sonner'
import { FormError } from '@/components/auth/AuthLayout'
import { ErrorState } from '@/components/feedback/ErrorState'
import { LANGUAGES } from '@/components/LanguageSwitcher'
import { PageHeader } from '@/components/page/PageHeader'
import { THEME_OPTIONS } from '@/components/ThemeToggle'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import api from '@/lib/axios'
import { getErrorCode, getErrorMessage } from '@/lib/errors'
import { passwordIssue } from '@/lib/password'
import { cn } from '@/lib/utils'
import { SettingsSection } from '@/pages/projects/settings/SettingsSection'
import { useAuthStore } from '@/store/authStore'
import { useThemeStore } from '@/store/themeStore'

/** Sections linked by hash (`/account#security`) from the context navigation. */
export const ACCOUNT_SECTIONS = ['profile', 'security', 'appearance'] as const

interface Profile {
  email: string
  firstName: string
  lastName: string
}

const fullName = (p: Pick<Profile, 'firstName' | 'lastName'>) =>
  `${p.firstName} ${p.lastName}`.trim()

/** Anchor target for one account section. */
function Anchor({
  id,
  children,
}: {
  id: (typeof ACCOUNT_SECTIONS)[number]
  children: ReactNode
}) {
  return (
    <div id={id} className="scroll-mt-4">
      {children}
    </div>
  )
}

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
      <div
        role="radiogroup"
        aria-labelledby={labelId}
        className="inline-flex flex-wrap gap-1 rounded-lg border bg-muted/40 p-1"
      >
        {options.map((o) => (
          // biome-ignore lint/a11y/useSemanticElements: segmented control; buttons keep the compact styling and click semantics
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={value === o.value}
            onClick={() => onChange(o.value)}
            className={cn(
              'flex items-center gap-2 rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              value === o.value &&
                'bg-background font-medium text-foreground shadow-sm'
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

function ProfileForm({
  profile,
  onSaved,
}: {
  profile: Profile
  onSaved: (profile: Profile) => void
}) {
  const { t } = useTranslation()
  const updateUser = useAuthStore((s) => s.updateUser)
  const [firstName, setFirstName] = useState(profile.firstName)
  const [lastName, setLastName] = useState(profile.lastName)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const dirty = firstName !== profile.firstName || lastName !== profile.lastName

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      const response = await api.patch('/auth/profile', {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
      })
      const saved = response.data.user ?? response.data
      const next = {
        email: profile.email,
        firstName: saved.firstName ?? firstName.trim(),
        lastName: saved.lastName ?? lastName.trim(),
      }
      onSaved(next)
      updateUser({ name: fullName(next) })
      toast.success(t('settings.profile.success'))
    } catch (err: unknown) {
      setError(getErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <form
      onSubmit={submit}
      className="space-y-4 rounded-lg border bg-card p-4 sm:p-6"
    >
      {error && <FormError>{error}</FormError>}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="account-first-name">
            {t('settings.profile.first-name')}
          </Label>
          <Input
            id="account-first-name"
            autoComplete="given-name"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            maxLength={100}
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="account-last-name">
            {t('settings.profile.last-name')}
          </Label>
          <Input
            id="account-last-name"
            autoComplete="family-name"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            maxLength={100}
          />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="account-email">{t('settings.profile.email')}</Label>
        <Input
          id="account-email"
          type="email"
          value={profile.email}
          readOnly
          aria-describedby="account-email-hint"
          className="bg-muted"
        />
        <p id="account-email-hint" className="text-xs text-muted-foreground">
          {t('account-page.email-hint')}
        </p>
      </div>
      <div className="flex justify-end">
        <Button type="submit" disabled={saving || !dirty || !firstName.trim()}>
          {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {saving ? t('settings.profile.saving') : t('settings.profile.save')}
        </Button>
      </div>
    </form>
  )
}

function PasswordForm() {
  const { t } = useTranslation()
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    const issue = passwordIssue(newPassword)
    if (issue) return setError(t(`password.${issue}`))
    if (newPassword !== confirmPassword) return setError(t('password.mismatch'))

    setSaving(true)
    try {
      const response = await api.post('/auth/change-password', {
        currentPassword,
        newPassword,
      })
      // Old sessions are revoked on password change; keep this one alive
      if (response.data?.token)
        useAuthStore.getState().setToken(response.data.token)
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      toast.success(t('settings.password.success'))
    } catch (err: unknown) {
      setError(
        getErrorCode(err) === 'WRONG_CURRENT_PASSWORD'
          ? t('settings.password.wrong-current')
          : getErrorMessage(err)
      )
    } finally {
      setSaving(false)
    }
  }

  return (
    <form
      onSubmit={submit}
      noValidate
      className="space-y-4 rounded-lg border bg-card p-4 sm:p-6"
    >
      {error && <FormError>{error}</FormError>}
      <div className="space-y-2">
        <Label htmlFor="account-current-password">
          {t('settings.password.current')}
        </Label>
        <Input
          id="account-current-password"
          type="password"
          autoComplete="current-password"
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          required
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="account-new-password">
          {t('settings.password.new')}
        </Label>
        <Input
          id="account-new-password"
          type="password"
          autoComplete="new-password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          aria-describedby="account-new-password-hint"
          required
        />
        <p
          id="account-new-password-hint"
          className="text-xs text-muted-foreground"
        >
          {t('password.hint')}
        </p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="account-confirm-password">
          {t('settings.password.confirm')}
        </Label>
        <Input
          id="account-confirm-password"
          type="password"
          autoComplete="new-password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          required
        />
      </div>
      <p className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-sm">
        {t('account-page.sessions-note')}
      </p>
      <div className="flex justify-end">
        <Button
          type="submit"
          disabled={
            saving || !currentPassword || !newPassword || !confirmPassword
          }
        >
          {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {saving
            ? t('settings.password.changing')
            : t('settings.password.submit')}
        </Button>
      </div>
    </form>
  )
}

function AppearanceForm() {
  const { t, i18n } = useTranslation()
  const { theme, setTheme } = useThemeStore()
  const language = (i18n.resolvedLanguage ??
    i18n.language) as (typeof LANGUAGES)[number]['code']

  return (
    <div className="space-y-5 rounded-lg border bg-card p-4 sm:p-6">
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
        options={LANGUAGES.map(({ code, label }) => ({
          value: code,
          label: t(label),
        }))}
      />
    </div>
  )
}

/** `/account`: profile, password and appearance of the signed-in user. */
export default function AccountPage() {
  const { t } = useTranslation()
  const { hash } = useLocation()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loadError, setLoadError] = useState(false)
  const [isLoading, setIsLoading] = useState(true)

  const load = useCallback(async () => {
    setIsLoading(true)
    setLoadError(false)
    try {
      const response = await api.get('/auth/me')
      const data = response.data.user ?? response.data
      setProfile({
        email: data.email ?? '',
        firstName: data.firstName ?? '',
        lastName: data.lastName ?? '',
      })
    } catch {
      setLoadError(true)
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  // Sections are linked by hash (/account#security); scroll once the page has rendered.
  useEffect(() => {
    if (isLoading || !hash) return
    document
      .getElementById(decodeURIComponent(hash.slice(1)))
      ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [hash, isLoading])

  let profileContent: ReactNode
  if (isLoading) {
    profileContent = (
      <div
        className="space-y-4 rounded-lg border bg-card p-4 sm:p-6"
        aria-busy="true"
      >
        <span role="status" className="sr-only">
          {t('common.loading')}
        </span>
        <Skeleton className="h-9 w-full" />
        <Skeleton className="h-9 w-full" />
      </div>
    )
  } else if (loadError || !profile) {
    profileContent = (
      <ErrorState message={t('settings.profile.load-error')} onRetry={load} />
    )
  } else {
    profileContent = <ProfileForm profile={profile} onSaved={setProfile} />
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader
        title={t('account-page.title')}
        description={t('account-page.description')}
      />
      <div className="space-y-10">
        <Anchor id="profile">
          <SettingsSection
            title={t('account-page.profile-title')}
            description={t('account-page.profile-description')}
          >
            {profileContent}
          </SettingsSection>
        </Anchor>
        <Anchor id="security">
          <SettingsSection
            title={t('account-page.security-title')}
            description={t('account-page.security-description')}
          >
            <PasswordForm />
          </SettingsSection>
        </Anchor>
        <Anchor id="appearance">
          <SettingsSection
            title={t('settings.appearance.title')}
            description={t('settings.appearance.description')}
          >
            <AppearanceForm />
          </SettingsSection>
        </Anchor>
      </div>
    </div>
  )
}
