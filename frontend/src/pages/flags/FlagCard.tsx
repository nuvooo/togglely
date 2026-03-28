import { Menu, Switch, Transition } from '@headlessui/react'
import {
  CheckCircleIcon,
  ClockIcon,
  EllipsisVerticalIcon,
  TrashIcon,
  XCircleIcon,
} from '@heroicons/react/24/outline'
import clsx from 'clsx'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import type { FeatureFlag } from './types'
import { formatDate, getTypeColor } from './types'

interface FlagCardProps {
  flag: FeatureFlag
  isToggling: boolean
  isDeleting: boolean
  disableToggle: boolean
  onToggle: (flagId: string, currentValue: boolean, environmentId?: string) => void
  onDelete: (flagId: string) => void
}

export default function FlagCard({
  flag,
  isToggling,
  isDeleting,
  disableToggle,
  onToggle,
  onDelete,
}: FlagCardProps) {
  const { t } = useTranslation()
  return (
    <div className="flex items-center justify-between p-6 hover:bg-muted/50 transition-colors">
      <div className="flex-1 min-w-0">
        <div className="flex items-center space-x-3">
          <h3 className="text-base font-semibold text-foreground">
            <Link
              to={`/feature-flags/${flag.id}`}
              className="hover:text-primary"
            >
              {flag.name}
            </Link>
          </h3>
          <span
            className={clsx(
              'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
              getTypeColor(flag.type)
            )}
          >
            {flag.type}
          </span>
          {flag.isEnabled ? (
            <span className="inline-flex items-center rounded-full bg-green-100 dark:bg-green-900/60 px-2.5 py-0.5 text-xs font-medium text-green-800 dark:text-green-300 ring-1 ring-inset ring-green-600/20 dark:ring-green-400/30">
              <CheckCircleIcon className="mr-1 h-3 w-3" />
              {t('feature-flags.status.on')}
            </span>
          ) : (
            <span className="inline-flex items-center rounded-full bg-gray-100 dark:bg-gray-800 px-2.5 py-0.5 text-xs font-medium text-gray-600 dark:text-gray-300 ring-1 ring-inset ring-gray-500/10 dark:ring-gray-400/20">
              <XCircleIcon className="mr-1 h-3 w-3" />
              {t('feature-flags.status.off')}
            </span>
          )}
        </div>

        <div className="mt-1 flex items-center space-x-4 text-sm text-muted-foreground">
          <code className="text-xs bg-muted px-2 py-0.5 rounded">
            {flag.key}
          </code>
          <span>&bull;</span>
          <span>{flag.projectName}</span>
          <span>&bull;</span>
          <span>{flag.environmentName}</span>
        </div>

        {flag.description && (
          <p className="mt-1 text-sm text-muted-foreground line-clamp-1">
            {flag.description}
          </p>
        )}

        <div className="mt-2 flex items-center text-xs text-muted-foreground">
          <ClockIcon className="mr-1 h-3 w-3" />
          {t('feature-flags.updated', { date: formatDate(flag.updatedAt) })}
        </div>
      </div>

      <div className="ml-4 flex items-center space-x-4">
        <Switch
          checked={flag.isEnabled}
          onChange={() =>
            onToggle(flag.id, flag.isEnabled, flag.environmentId)
          }
          disabled={isToggling || disableToggle}
          className={clsx(
            flag.isEnabled
              ? 'bg-primary'
              : 'bg-gray-200 dark:bg-gray-700',
            'relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed'
          )}
        >
          <span
            className={clsx(
              flag.isEnabled ? 'translate-x-5' : 'translate-x-0',
              'pointer-events-none relative inline-block h-5 w-5 transform rounded-full bg-white dark:bg-gray-200 shadow ring-0 transition duration-200 ease-in-out'
            )}
          />
        </Switch>

        <Menu as="div" className="relative">
          <Menu.Button className="flex items-center rounded-full p-2 text-muted-foreground hover:text-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2">
            <span className="sr-only">{t('feature-flags.menu.open-options')}</span>
            <EllipsisVerticalIcon className="h-5 w-5" />
          </Menu.Button>
          <Transition
            enter="transition ease-out duration-100"
            enterFrom="transform opacity-0 scale-95"
            enterTo="transform opacity-100 scale-100"
            leave="transition ease-in duration-75"
            leaveFrom="transform opacity-100 scale-100"
            leaveTo="transform opacity-0 scale-95"
          >
            <Menu.Items className="absolute right-0 z-10 mt-2 w-48 origin-top-right rounded-md bg-popover shadow-lg ring-1 ring-border focus:outline-none">
              <div className="py-1">
                <Menu.Item>
                  {({ active }) => (
                    <Link
                      to={`/feature-flags/${flag.id}`}
                      className={clsx(
                        active
                          ? 'bg-muted text-foreground'
                          : 'text-foreground',
                        'block px-4 py-2 text-sm'
                      )}
                    >
                      {t('feature-flags.menu.edit')}
                    </Link>
                  )}
                </Menu.Item>
                <Menu.Item>
                  {({ active }) => (
                    <button
                      className={clsx(
                        active
                          ? 'bg-muted text-foreground'
                          : 'text-foreground',
                        'block w-full px-4 py-2 text-left text-sm'
                      )}
                    >
                      {t('feature-flags.menu.duplicate')}
                    </button>
                  )}
                </Menu.Item>
                <div className="border-t border-border">
                  <Menu.Item>
                    {({ active }) => (
                      <button
                        onClick={() => onDelete(flag.id)}
                        disabled={isDeleting}
                        className={clsx(
                          active
                            ? 'bg-muted text-destructive'
                            : 'text-destructive',
                          'block w-full px-4 py-2 text-left text-sm disabled:opacity-50'
                        )}
                      >
                        <span className="flex items-center">
                          <TrashIcon className="mr-2 h-4 w-4" />
                          {isDeleting ? t('feature-flags.menu.deleting') : t('feature-flags.menu.delete')}
                        </span>
                      </button>
                    )}
                  </Menu.Item>
                </div>
              </div>
            </Menu.Items>
          </Transition>
        </Menu>
      </div>
    </div>
  )
}
