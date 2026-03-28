import {
  CheckCircleIcon,
  ExclamationCircleIcon,
  KeyIcon,
  UserCircleIcon,
} from '@heroicons/react/24/outline'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
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

import { useAuthStore } from '@/store/authStore'

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
      await api.post('/auth/change-password', {
        currentPassword,
        newPassword,
      })

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
        <h1 className="text-3xl font-bold tracking-tight">{t('settings.title')}</h1>
        <p className="text-muted-foreground mt-1">
          {t('settings.subtitle')}
        </p>
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
      <Card>
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
                <Label htmlFor="firstName">{t('settings.profile.first-name')}</Label>
                <Input
                  id="firstName"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  placeholder="John"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="lastName">{t('settings.profile.last-name')}</Label>
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
                {isSaving ? t('settings.profile.saving') : t('settings.profile.save')}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Password Section */}
      <Card>
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
              <Label htmlFor="currentPassword">{t('settings.password.current')}</Label>
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
              <Label htmlFor="confirmPassword">{t('settings.password.confirm')}</Label>
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
                {isChangingPassword ? t('settings.password.changing') : t('settings.password.submit')}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
