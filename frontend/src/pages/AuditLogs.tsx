import {
  BuildingOfficeIcon,
  ClockIcon,
  Cog6ToothIcon,
  FlagIcon,
  FolderIcon,
  KeyIcon,
  MagnifyingGlassIcon,
  UserIcon,
  UsersIcon,
} from '@heroicons/react/24/outline'
import clsx from 'clsx'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import api from '@/lib/api'

interface AuditLog {
  id: string
  action:
    | 'CREATE'
    | 'UPDATE'
    | 'DELETE'
    | 'ENABLE'
    | 'DISABLE'
    | 'LOGIN'
    | 'LOGOUT'
    | 'INVITE'
    | 'REVOKE'
  entityType:
    | 'FEATURE_FLAG'
    | 'PROJECT'
    | 'ORGANIZATION'
    | 'API_KEY'
    | 'MEMBER'
    | 'ENVIRONMENT'
    | 'USER'
  entityId: string
  entityName: string
  userId: string
  userName: string
  userEmail: string
  projectId: string | null
  projectName: string | null
  organizationId: string | null
  organizationName: string | null
  metadata: Record<string, unknown>
  createdAt: string
  ipAddress: string | null
  userAgent: string | null
}

interface FilterState {
  action: string
  entityType: string
  userId: string
  projectId: string
  searchTerm: string
  dateRange: 'today' | 'week' | 'month' | 'all'
}

export default function AuditLogs() {
  const { t } = useTranslation()
  const [logs, setLogs] = useState<AuditLog[]>([])
  const [filteredLogs, setFilteredLogs] = useState<AuditLog[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [filters, setFilters] = useState<FilterState>({
    action: 'all',
    entityType: 'all',
    userId: 'all',
    projectId: 'all',
    searchTerm: '',
    dateRange: 'week',
  })
  const [users, setUsers] = useState<{ id: string; name: string }[]>([])
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([])

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [logsRes, projectsRes] = await Promise.all([
          api.get('/audit-logs'),
          api.get('/projects'),
        ])
        const auditLogs = logsRes.data.auditLogs || []
        setLogs(auditLogs)
        setFilteredLogs(auditLogs)

        const projs = projectsRes.data.projects || []
        setProjects(projs)

        // Extract unique users from logs for filtering
        const uniqueUsers = Array.from(
          new Set(auditLogs.map((l: any) => l.userId))
        ).map((id) => {
          const log = auditLogs.find((l: any) => l.userId === id)
          return {
            id: String(id),
            name: String(log?.userName || log?.userEmail || id),
          }
        })
        setUsers(uniqueUsers)
      } catch (error) {
        console.error('Failed to fetch audit logs:', error)
        setLogs([])
        setFilteredLogs([])
      } finally {
        setIsLoading(false)
      }
    }
    fetchData()
  }, [])

  useEffect(() => {
    let result = [...logs]

    // Filter by action
    if (filters.action !== 'all') {
      result = result.filter((log) => log.action === filters.action)
    }

    // Filter by entity type
    if (filters.entityType !== 'all') {
      result = result.filter((log) => log.entityType === filters.entityType)
    }

    // Filter by user
    if (filters.userId !== 'all') {
      result = result.filter((log) => log.userId === filters.userId)
    }

    // Filter by project
    if (filters.projectId !== 'all') {
      result = result.filter((log) => log.projectId === filters.projectId)
    }

    // Filter by search term
    if (filters.searchTerm) {
      const search = filters.searchTerm.toLowerCase()
      result = result.filter(
        (log) =>
          log.entityName?.toLowerCase().includes(search) ||
          log.userName?.toLowerCase().includes(search) ||
          log.userEmail?.toLowerCase().includes(search)
      )
    }

    // Filter by date range
    if (filters.dateRange !== 'all') {
      const now = new Date()
      const cutoff = new Date()
      if (filters.dateRange === 'today') cutoff.setHours(0, 0, 0, 0)
      if (filters.dateRange === 'week') cutoff.setDate(now.getDate() - 7)
      if (filters.dateRange === 'month') cutoff.setMonth(now.getMonth() - 1)

      result = result.filter((log) => new Date(log.createdAt) >= cutoff)
    }

    setFilteredLogs(result)
  }, [filters, logs])

  const getActionColor = (action: string) => {
    switch (action) {
      case 'CREATE':
        return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
      case 'UPDATE':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400'
      case 'DELETE':
        return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
      case 'ENABLE':
        return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400'
      case 'DISABLE':
        return 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400'
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-400'
    }
  }

  const getEntityIcon = (type: string) => {
    switch (type) {
      case 'FEATURE_FLAG':
        return <FlagIcon className="w-4 h-4" />
      case 'PROJECT':
        return <FolderIcon className="w-4 h-4" />
      case 'ORGANIZATION':
        return <BuildingOfficeIcon className="w-4 h-4" />
      case 'API_KEY':
        return <KeyIcon className="w-4 h-4" />
      case 'MEMBER':
        return <UsersIcon className="w-4 h-4" />
      case 'ENVIRONMENT':
        return <Cog6ToothIcon className="w-4 h-4" />
      default:
        return <ClockIcon className="w-4 h-4" />
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            {t('audit-logs.title')}
          </h1>
          <p className="text-gray-500 dark:text-gray-400 text-sm">
            {t('audit-logs.subtitle')}
          </p>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-4 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          <div className="relative">
            <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              placeholder={t('audit-logs.search-placeholder')}
              className="w-full pl-9 pr-4 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-md text-sm focus:ring-indigo-500 focus:border-indigo-500 dark:text-white"
              value={filters.searchTerm}
              onChange={(e) =>
                setFilters({ ...filters, searchTerm: e.target.value })
              }
            />
          </div>

          <select
            className="bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-md py-2 px-3 text-sm focus:ring-indigo-500 focus:border-indigo-500 dark:text-white"
            value={filters.action}
            onChange={(e) => setFilters({ ...filters, action: e.target.value })}
          >
            <option value="all">{t('audit-logs.filter.all-actions')}</option>
            <option value="CREATE">{t('audit-logs.filter.create')}</option>
            <option value="UPDATE">{t('audit-logs.filter.update')}</option>
            <option value="DELETE">{t('audit-logs.filter.delete')}</option>
            <option value="ENABLE">{t('audit-logs.filter.enable')}</option>
            <option value="DISABLE">{t('audit-logs.filter.disable')}</option>
          </select>

          <select
            className="bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-md py-2 px-3 text-sm focus:ring-indigo-500 focus:border-indigo-500 dark:text-white"
            value={filters.entityType}
            onChange={(e) =>
              setFilters({ ...filters, entityType: e.target.value })
            }
          >
            <option value="all">{t('audit-logs.filter.all-entity-types')}</option>
            <option value="FEATURE_FLAG">{t('audit-logs.filter.feature-flags')}</option>
            <option value="PROJECT">{t('audit-logs.filter.projects')}</option>
            <option value="ORGANIZATION">{t('audit-logs.filter.organizations')}</option>
            <option value="API_KEY">{t('audit-logs.filter.api-keys')}</option>
            <option value="MEMBER">{t('audit-logs.filter.members')}</option>
          </select>

          <select
            className="bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-md py-2 px-3 text-sm focus:ring-indigo-500 focus:border-indigo-500 dark:text-white"
            value={filters.userId}
            onChange={(e) => setFilters({ ...filters, userId: e.target.value })}
          >
            <option value="all">{t('audit-logs.filter.all-users')}</option>
            {users.map((user) => (
              <option key={user.id} value={user.id}>
                {user.name}
              </option>
            ))}
          </select>

          <select
            className="bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-md py-2 px-3 text-sm focus:ring-indigo-500 focus:border-indigo-500 dark:text-white"
            value={filters.projectId}
            onChange={(e) =>
              setFilters({ ...filters, projectId: e.target.value })
            }
          >
            <option value="all">{t('audit-logs.filter.all-projects')}</option>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>

          <select
            className="bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-md py-2 px-3 text-sm focus:ring-indigo-500 focus:border-indigo-500 dark:text-white"
            value={filters.dateRange}
            onChange={(e) =>
              setFilters({
                ...filters,
                dateRange: e.target.value as FilterState['dateRange'],
              })
            }
          >
            <option value="all">{t('audit-logs.filter.all-time')}</option>
            <option value="today">{t('audit-logs.filter.today')}</option>
            <option value="week">{t('audit-logs.filter.past-week')}</option>
            <option value="month">{t('audit-logs.filter.past-month')}</option>
          </select>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 shadow rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-900/50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  {t('audit-logs.table.activity')}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  {t('audit-logs.table.user')}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  {t('audit-logs.table.context')}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  {t('audit-logs.table.date')}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {filteredLogs.length > 0 ? (
                filteredLogs.map((log) => (
                  <tr
                    key={log.id}
                    className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                  >
                    <td className="px-6 py-4">
                      <div className="flex items-center space-x-3">
                        <div
                          className={clsx(
                            'p-2 rounded-full',
                            getActionColor(log.action)
                          )}
                        >
                          {getEntityIcon(log.entityType)}
                        </div>
                        <div>
                          <div className="flex items-center space-x-2">
                            <span
                              className={clsx(
                                'px-2 py-0.5 rounded text-[10px] font-bold uppercase',
                                getActionColor(log.action)
                              )}
                            >
                              {log.action}
                            </span>
                            <span className="text-sm font-medium text-gray-900 dark:text-white">
                              {log.entityName}
                            </span>
                          </div>
                          <p className="text-xs text-gray-500 dark:text-gray-400">
                            {log.entityType.replace('_', ' ')}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center space-x-2">
                        <div className="w-7 h-7 bg-indigo-100 dark:bg-indigo-900/30 rounded-full flex items-center justify-center">
                          <UserIcon className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-gray-900 dark:text-white">
                            {log.userName}
                          </p>
                          <p className="text-xs text-gray-500 dark:text-gray-400">
                            {log.userEmail}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="space-y-1">
                        {log.projectName && (
                          <div className="flex items-center text-xs text-gray-500 dark:text-gray-400">
                            <FolderIcon className="w-3 h-3 mr-1" />
                            {log.projectName}
                          </div>
                        )}
                        {log.organizationName && (
                          <div className="flex items-center text-xs text-gray-500 dark:text-gray-400">
                            <BuildingOfficeIcon className="w-3 h-3 mr-1" />
                            {log.organizationName}
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center text-xs text-gray-500 dark:text-gray-400">
                        <ClockIcon className="w-3 h-3 mr-1" />
                        {new Date(log.createdAt).toLocaleString()}
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td
                    colSpan={4}
                    className="px-6 py-12 text-center text-gray-500 dark:text-gray-400"
                  >
                    {t('audit-logs.empty')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
