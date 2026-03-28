import { Dialog, Transition } from '@headlessui/react'
import {
  CheckCircleIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline'
import { Fragment } from 'react'
import { useTranslation } from 'react-i18next'
import type { NewFlagData, Project } from './types'

interface CreateFlagDialogProps {
  isOpen: boolean
  isCreating: boolean
  createError: string | null
  createSuccess: string | null
  newFlagData: NewFlagData
  projects: Project[]
  availableEnvironments: { id: string; name: string }[]
  onClose: () => void
  onSubmit: (e: React.FormEvent) => void
  onNameChange: (name: string) => void
  onDataChange: (data: Partial<NewFlagData>) => void
}

export default function CreateFlagDialog({
  isOpen,
  isCreating,
  createError,
  createSuccess,
  newFlagData,
  projects,
  availableEnvironments,
  onClose,
  onSubmit,
  onNameChange,
  onDataChange,
}: CreateFlagDialogProps) {
  const { t } = useTranslation()
  return (
    <Transition appear show={isOpen} as={Fragment}>
      <Dialog
        as="div"
        className="relative z-10"
        onClose={() => !isCreating && onClose()}
      >
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-black bg-opacity-25" />
        </Transition.Child>

        <div className="fixed inset-0 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4 text-center">
            <Transition.Child
              as={Fragment}
              enter="ease-out duration-300"
              enterFrom="opacity-0 scale-95"
              enterTo="opacity-100 scale-100"
              leave="ease-in duration-200"
              leaveFrom="opacity-100 scale-100"
              leaveTo="opacity-0 scale-95"
            >
              <Dialog.Panel className="w-full max-w-lg transform overflow-hidden rounded-lg bg-background p-6 text-left align-middle shadow-xl transition-all border border-border">
                <div className="flex items-center justify-between mb-4">
                  <Dialog.Title
                    as="h3"
                    className="text-lg font-semibold leading-6 text-foreground"
                  >
                    {t('feature-flags.create.title')}
                  </Dialog.Title>
                  <button
                    onClick={onClose}
                    disabled={isCreating}
                    className="text-muted-foreground hover:text-foreground disabled:opacity-50"
                  >
                    <XMarkIcon className="h-5 w-5" />
                  </button>
                </div>

                {createError && (
                  <div className="mb-4 rounded-md bg-destructive/10 p-3 border border-destructive/20">
                    <p className="text-sm text-destructive">{createError}</p>
                  </div>
                )}

                {createSuccess && (
                  <div className="mb-4 rounded-md bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-900/50 p-3 flex items-center">
                    <CheckCircleIcon className="h-5 w-5 text-green-600 dark:text-green-400 mr-2" />
                    <p className="text-sm text-green-700 dark:text-green-400">
                      {createSuccess}
                    </p>
                  </div>
                )}

                <form onSubmit={onSubmit} className="space-y-4">
                  <div>
                    <label
                      htmlFor="flag-project"
                      className="block text-sm font-medium text-foreground"
                    >
                      {t('feature-flags.create.project-label')} <span className="text-destructive">*</span>
                    </label>
                    <select
                      id="flag-project"
                      value={newFlagData.projectId}
                      onChange={(e) =>
                        onDataChange({
                          projectId: e.target.value,
                          environmentId: '',
                        })
                      }
                      className="mt-1 block w-full rounded-md border border-input bg-background shadow-sm focus:border-primary focus:ring-primary sm:text-sm"
                      required
                      disabled={isCreating}
                    >
                      <option value="">{t('feature-flags.create.select-project')}</option>
                      {projects.map((project) => (
                        <option key={project.id} value={project.id}>
                          {project.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label
                      htmlFor="flag-environment"
                      className="block text-sm font-medium text-foreground"
                    >
                      {t('feature-flags.create.environment-label')}
                    </label>
                    <select
                      id="flag-environment"
                      value={newFlagData.environmentId}
                      onChange={(e) =>
                        onDataChange({ environmentId: e.target.value })
                      }
                      className="mt-1 block w-full rounded-md border border-input bg-background shadow-sm focus:border-primary focus:ring-primary sm:text-sm"
                      disabled={
                        isCreating ||
                        !newFlagData.projectId ||
                        availableEnvironments.length === 0
                      }
                    >
                      <option value="">
                        {availableEnvironments.length === 0
                          ? t('feature-flags.create.default-environment')
                          : t('feature-flags.create.select-environment')}
                      </option>
                      {availableEnvironments.map((env) => (
                        <option key={env.id} value={env.id}>
                          {env.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label
                      htmlFor="flag-name"
                      className="block text-sm font-medium text-foreground"
                    >
                      {t('feature-flags.create.name-label')} <span className="text-destructive">*</span>
                    </label>
                    <input
                      type="text"
                      id="flag-name"
                      value={newFlagData.name}
                      onChange={(e) => onNameChange(e.target.value)}
                      className="mt-1 block w-full rounded-md border border-input bg-background shadow-sm focus:border-primary focus:ring-primary sm:text-sm"
                      placeholder={t('feature-flags.create.name-placeholder')}
                      required
                      disabled={isCreating}
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="flag-key"
                      className="block text-sm font-medium text-foreground"
                    >
                      {t('feature-flags.create.key-label')} <span className="text-destructive">*</span>
                    </label>
                    <input
                      type="text"
                      id="flag-key"
                      value={newFlagData.key}
                      onChange={(e) =>
                        onDataChange({ key: e.target.value })
                      }
                      className="mt-1 block w-full rounded-md border border-input bg-background shadow-sm focus:border-primary focus:ring-primary sm:text-sm"
                      placeholder={t('feature-flags.create.key-placeholder')}
                      required
                      disabled={isCreating}
                    />
                    <p className="mt-1 text-xs text-muted-foreground">
                      {t('feature-flags.create.key-help')}
                    </p>
                  </div>

                  <div>
                    <label
                      htmlFor="flag-type"
                      className="block text-sm font-medium text-foreground"
                    >
                      {t('feature-flags.create.type-label')}
                    </label>
                    <select
                      id="flag-type"
                      value={newFlagData.type}
                      onChange={(e) => {
                        const newType = e.target.value as NewFlagData['type']
                        let defaultValue = 'false'
                        if (newType === 'STRING') defaultValue = ''
                        else if (newType === 'NUMBER') defaultValue = '0'
                        else if (newType === 'JSON') defaultValue = '{}'
                        onDataChange({ type: newType, defaultValue })
                      }}
                      className="mt-1 block w-full rounded-md border border-input bg-background shadow-sm focus:border-primary focus:ring-primary sm:text-sm"
                      disabled={isCreating}
                    >
                      <option value="BOOLEAN">{t('feature-flags.create.type-boolean')}</option>
                      <option value="STRING">{t('feature-flags.create.type-string')}</option>
                      <option value="NUMBER">{t('feature-flags.create.type-number')}</option>
                      <option value="JSON">{t('feature-flags.create.type-json')}</option>
                    </select>
                  </div>

                  <div>
                    <label
                      htmlFor="flag-default"
                      className="block text-sm font-medium text-foreground"
                    >
                      {t('feature-flags.create.default-value-label')}
                    </label>
                    {newFlagData.type === 'BOOLEAN' ? (
                      <select
                        id="flag-default"
                        value={newFlagData.defaultValue}
                        onChange={(e) =>
                          onDataChange({ defaultValue: e.target.value })
                        }
                        className="mt-1 block w-full rounded-md border border-input bg-background shadow-sm focus:border-primary focus:ring-primary sm:text-sm"
                        disabled={isCreating}
                      >
                        <option value="false">false</option>
                        <option value="true">true</option>
                      </select>
                    ) : (
                      <input
                        type="text"
                        id="flag-default"
                        value={newFlagData.defaultValue}
                        onChange={(e) =>
                          onDataChange({ defaultValue: e.target.value })
                        }
                        className="mt-1 block w-full rounded-md border border-input bg-background shadow-sm focus:border-primary focus:ring-primary sm:text-sm"
                        placeholder={
                          newFlagData.type === 'JSON'
                            ? '{"enabled": true}'
                            : t('feature-flags.create.default-value-placeholder')
                        }
                        disabled={isCreating}
                      />
                    )}
                  </div>

                  <div>
                    <label
                      htmlFor="flag-description"
                      className="block text-sm font-medium text-foreground"
                    >
                      {t('feature-flags.create.description-label')}
                    </label>
                    <textarea
                      id="flag-description"
                      value={newFlagData.description}
                      onChange={(e) =>
                        onDataChange({ description: e.target.value })
                      }
                      rows={2}
                      className="mt-1 block w-full rounded-md border border-input bg-background shadow-sm focus:border-primary focus:ring-primary sm:text-sm"
                      placeholder={t('feature-flags.create.description-placeholder')}
                      disabled={isCreating}
                    />
                  </div>

                  <div className="mt-6 flex justify-end space-x-3">
                    <button
                      type="button"
                      onClick={onClose}
                      disabled={isCreating}
                      className="rounded-md bg-background px-3 py-2 text-sm font-semibold text-foreground shadow-sm ring-1 ring-inset ring-border hover:bg-muted disabled:opacity-50"
                    >
                      {t('common.cancel')}
                    </button>
                    <button
                      type="submit"
                      disabled={
                        isCreating ||
                        !newFlagData.name ||
                        !newFlagData.key ||
                        !newFlagData.projectId
                      }
                      className="rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground shadow-sm hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isCreating ? t('feature-flags.create.creating') : t('feature-flags.create.submit')}
                    </button>
                  </div>
                </form>
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition>
  )
}
