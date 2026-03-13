import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ClockIcon,

  MagnifyingGlassIcon,
  ArrowPathIcon,
  UserIcon,
  FlagIcon,
  BuildingOfficeIcon,
  FolderIcon,
  KeyIcon,
  UsersIcon,
  Cog6ToothIcon,
} from '@heroicons/react/24/outline';
import api from '@/lib/api';
import clsx from 'clsx';

interface AuditLog {
  id: string;
  action: 'CREATE' | 'UPDATE' | 'DELETE' | 'ENABLE' | 'DISABLE' | 'LOGIN' | 'LOGOUT' | 'INVITE' | 'REVOKE';
  entityType: 'FEATURE_FLAG' | 'PROJECT' | 'ORGANIZATION' | 'API_KEY' | 'MEMBER' | 'ENVIRONMENT' | 'USER';
  entityId: string;
  entityName: string;
  userId: string;
  userName: string;
  userEmail: string;
  projectId: string | null;
  projectName: string | null;
  organizationId: string | null;
  organizationName: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  ipAddress: string | null;
  userAgent: string | null;
}

interface FilterState {
  action: string;
  entityType: string;
  userId: string;
  projectId: string;
  searchTerm: string;
  dateRange: 'today' | 'week' | 'month' | 'all';
}

export default function AuditLogs() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [filteredLogs, setFilteredLogs] = useState<AuditLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filters, setFilters] = useState<FilterState>({
    action: 'all',
    entityType: 'all',
    userId: 'all',
    projectId: 'all',
    searchTerm: '',
    dateRange: 'week',
  });
  const [users, setUsers] = useState<{ id: string; name: string }[]>([]);
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [logsRes, usersRes, projectsRes] = await Promise.all([
          api.get('/audit-logs'),
          api.get('/users'),
          api.get('/projects'),
        ]);
        setLogs(logsRes.data.logs);
        setFilteredLogs(logsRes.data.logs);
        setUsers(usersRes.data.users);
        setProjects(projectsRes.data.projects);
      } catch (error) {
        console.error('Failed to fetch audit logs:', error);
        // Mock data for development
        const mockLogs: AuditLog[] = [
          {
            id: '1',
            action: 'CREATE',
            entityType: 'FEATURE_FLAG',
            entityId: '1',
            entityName: 'Dark Mode',
            userId: 'u1',
            userName: 'John Doe',
            userEmail: 'john@example.com',
            projectId: '1',
            projectName: 'Web Application',
            organizationId: '1',
            organizationName: 'Acme Corp',
            metadata: { type: 'BOOLEAN', defaultValue: false },
            createdAt: '2024-01-15T10:30:00Z',
            ipAddress: '192.168.1.1',
            userAgent: 'Mozilla/5.0',
          },
          {
            id: '2',
            action: 'UPDATE',
            entityType: 'FEATURE_FLAG',
            entityId: '1',
            entityName: 'Dark Mode',
            userId: 'u2',
            userName: 'Jane Smith',
            userEmail: 'jane@example.com',
            projectId: '1',
            projectName: 'Web Application',
            organizationId: '1',
            organizationName: 'Acme Corp',
            metadata: { isEnabled: true },
            createdAt: '2024-01-15T09:15:00Z',
            ipAddress: '192.168.1.2',
            userAgent: 'Mozilla/5.0',
          },
          {
            id: '3',
            action: 'CREATE',
            entityType: 'PROJECT',
            entityId: '2',
            entityName: 'Mobile App',
            userId: 'u1',
            userName: 'John Doe',
            userEmail: 'john@example.com',
            projectId: null,
            projectName: null,
            organizationId: '1',
            organizationName: 'Acme Corp',
            metadata: { slug: 'mobile-app' },
            createdAt: '2024-01-14T16:45:00Z',
            ipAddress: '192.168.1.1',
            userAgent: 'Mozilla/5.0',
          },
          {
            id: '4',
            action: 'DELETE',
            entityType: 'FEATURE_FLAG',
            entityId: '3',
            entityName: 'Old Feature',
            userId: 'u3',
            userName: 'Bob Wilson',
            userEmail: 'bob@example.com',
            projectId: '1',
            projectName: 'Web Application',
            organizationId: '1',
            organizationName: 'Acme Corp',
            metadata: {},
            createdAt: '2024-01-14T14:20:00Z',
            ipAddress: '192.168.1.3',
            userAgent: 'Mozilla/5.0',
          },
          {
            id: '5',
            action: 'INVITE',
            entityType: 'MEMBER',
            entityId: 'u4',
            entityName: 'Alice Johnson',
            userId: 'u1',
            userName: 'John Doe',
            userEmail: 'john@example.com',
            projectId: null,
            projectName: null,
            organizationId: '1',
            organizationName: 'Acme Corp',
            metadata: { role: 'MEMBER', email: 'alice@example.com' },
            createdAt: '2024-01-13T11:00:00Z',
            ipAddress: '192.168.1.1',
            userAgent: 'Mozilla/5.0',
          },
          {
            id: '6',
            action: 'CREATE',
            entityType: 'API_KEY',
            entityId: 'k1',
            entityName: 'Production Server Key',
            userId: 'u2',
            userName: 'Jane Smith',
            userEmail: 'jane@example.com',
            projectId: '1',
            projectName: 'Web Application',
            organizationId: '1',
            organizationName: 'Acme Corp',
            metadata: { type: 'SERVER' },
            createdAt: '2024-01-12T08:30:00Z',
            ipAddress: '192.168.1.2',
            userAgent: 'Mozilla/5.0',
          },
          {
            id: '7',
            action: 'LOGIN',
            entityType: 'USER',
            entityId: 'u1',
            entityName: 'John Doe',
            userId: 'u1',
            userName: 'John Doe',
            userEmail: 'john@example.com',
            projectId: null,
            projectName: null,
            organizationId: null,
            organizationName: null,
            metadata: {},
            createdAt: '2024-01-12T08:00:00Z',
            ipAddress: '192.168.1.1',
            userAgent: 'Mozilla/5.0',
          },
          {
            id: '8',
            action: 'UPDATE',
            entityType: 'ORGANIZATION',
            entityId: '1',
            entityName: 'Acme Corp',
            userId: 'u1',
            userName: 'John Doe',
            userEmail: 'john@example.com',
            projectId: null,
            projectName: null,
            organizationId: '1',
            organizationName: 'Acme Corp',
            metadata: { description: 'Updated organization description' },
            createdAt: '2024-01-11T15:45:00Z',
            ipAddress: '192.168.1.1',
            userAgent: 'Mozilla/5.0',
          },
          {
            id: '9',
            action: 'DISABLE',
            entityType: 'FEATURE_FLAG',
            entityId: '2',
            entityName: 'New Checkout Flow',
            userId: 'u2',
            userName: 'Jane Smith',
            userEmail: 'jane@example.com',
            projectId: '1',
            projectName: 'Web Application',
            organizationId: '1',
            organizationName: 'Acme Corp',
            metadata: { environment: 'Production' },
            createdAt: '2024-01-10T13:20:00Z',
            ipAddress: '192.168.1.2',
            userAgent: 'Mozilla/5.0',
          },
          {
            id: '10',
            action: 'REVOKE',
            entityType: 'API_KEY',
            entityId: 'k2',
            entityName: 'Old Test Key',
            userId: 'u3',
            userName: 'Bob Wilson',
            userEmail: 'bob@example.com',
            projectId: '1',
            projectName: 'Web Application',
            organizationId: '1',
            organizationName: 'Acme Corp',
            metadata: {},
            createdAt: '2024-01-09T10:00:00Z',
            ipAddress: '192.168.1.3',
            userAgent: 'Mozilla/5.0',
          },
        ];
        setLogs(mockLogs);
        setFilteredLogs(mockLogs);
        setUsers([
          { id: 'u1', name: 'John Doe' },
          { id: 'u2', name: 'Jane Smith' },
          { id: 'u3', name: 'Bob Wilson' },
        ]);
        setProjects([
          { id: '1', name: 'Web Application' },
          { id: '2', name: 'Mobile App' },
          { id: '3', name: 'API Gateway' },
        ]);
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, []);

  useEffect(() => {
    let result = [...logs];

    // Filter by action
    if (filters.action !== 'all') {
      result = result.filter((log) => log.action === filters.action);
    }

    // Filter by entity type
    if (filters.entityType !== 'all') {
      result = result.filter((log) => log.entityType === filters.entityType);
    }

    // Filter by user
    if (filters.userId !== 'all') {
      result = result.filter((log) => log.userId === filters.userId);
    }

    // Filter by project
    if (filters.projectId !== 'all') {
      result = result.filter((log) => log.projectId === filters.projectId);
    }

    // Filter by search term
    if (filters.searchTerm) {
      const search = filters.searchTerm.toLowerCase();
      result = result.filter(
        (log) =>
          log.entityName.toLowerCase().includes(search) ||
          log.userName.toLowerCase().includes(search) ||
          log.userEmail.toLowerCase().includes(search)
      );
    }

    // Filter by date range
    if (filters.dateRange !== 'all') {
      const now = new Date();
      const cutoff = new Date();
      switch (filters.dateRange) {
        case 'today':
          cutoff.setHours(0, 0, 0, 0);
          break;
        case 'week':
          cutoff.setDate(now.getDate() - 7);
          break;
        case 'month':
          cutoff.setMonth(now.getMonth() - 1);
          break;
      }
      result = result.filter((log) => new Date(log.createdAt) >= cutoff);
    }

    setFilteredLogs(result);
  }, [filters, logs]);

  const getActionColor = (action: string) => {
    switch (action) {
      case 'CREATE':
        return 'bg-green-100 text-green-800';
      case 'UPDATE':
        return 'bg-blue-100 text-blue-800';
      case 'DELETE':
      case 'REVOKE':
        return 'bg-red-100 text-red-800';
      case 'ENABLE':
        return 'bg-green-100 text-green-800';
      case 'DISABLE':
        return 'bg-yellow-100 text-yellow-800';
      case 'INVITE':
        return 'bg-purple-100 text-purple-800';
      case 'LOGIN':
      case 'LOGOUT':
        return 'bg-gray-100 text-gray-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getEntityIcon = (entityType: string) => {
    switch (entityType) {
      case 'FEATURE_FLAG':
        return FlagIcon;
      case 'PROJECT':
        return FolderIcon;
      case 'ORGANIZATION':
        return BuildingOfficeIcon;
      case 'API_KEY':
        return KeyIcon;
      case 'MEMBER':
        return UsersIcon;
      case 'USER':
        return UserIcon;
      case 'ENVIRONMENT':
        return Cog6ToothIcon;
      default:
        return ClockIcon;
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 60) {
      return `${diffMins}m ago`;
    } else if (diffHours < 24) {
      return `${diffHours}h ago`;
    } else if (diffDays < 7) {
      return `${diffDays}d ago`;
    } else {
      return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    }
  };

  const clearFilters = () => {
    setFilters({
      action: 'all',
      entityType: 'all',
      userId: 'all',
      projectId: 'all',
      searchTerm: '',
      dateRange: 'week',
    });
  };

  const hasActiveFilters =
    filters.action !== 'all' ||
    filters.entityType !== 'all' ||
    filters.userId !== 'all' ||
    filters.projectId !== 'all' ||
    filters.searchTerm !== '' ||
    filters.dateRange !== 'week';

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="md:flex md:items-center md:justify-between">
        <div className="min-w-0 flex-1">
          <h2 className="text-2xl font-bold leading-7 text-gray-900 sm:truncate sm:text-3xl sm:tracking-tight">
            Audit Logs
          </h2>
          <p className="mt-1 text-sm text-gray-500">
            Track all changes and activities in your organization
          </p>
        </div>
        <div className="mt-4 flex md:ml-4 md:mt-0">
          <button
            onClick={() => window.location.reload()}
            className="inline-flex items-center rounded-md bg-white px-3 py-2 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50"
          >
            <ArrowPathIcon className="-ml-0.5 mr-1.5 h-5 w-5 text-gray-400" />
            Refresh
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="rounded-lg bg-white shadow p-4">
        <div className="flex flex-col gap-4">
          {/* Search */}
          <div className="relative">
            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
              <MagnifyingGlassIcon className="h-5 w-5 text-gray-400" />
            </div>
            <input
              type="text"
              placeholder="Search by entity name, user, or email..."
              value={filters.searchTerm}
              onChange={(e) =>
                setFilters({ ...filters, searchTerm: e.target.value })
              }
              className="block w-full rounded-md border-gray-300 pl-10 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
            />
          </div>

          {/* Filter dropdowns */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            <select
              value={filters.action}
              onChange={(e) =>
                setFilters({ ...filters, action: e.target.value })
              }
              className="block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
            >
              <option value="all">All Actions</option>
              <option value="CREATE">Created</option>
              <option value="UPDATE">Updated</option>
              <option value="DELETE">Deleted</option>
              <option value="ENABLE">Enabled</option>
              <option value="DISABLE">Disabled</option>
              <option value="INVITE">Invited</option>
              <option value="REVOKE">Revoked</option>
              <option value="LOGIN">Login</option>
              <option value="LOGOUT">Logout</option>
            </select>

            <select
              value={filters.entityType}
              onChange={(e) =>
                setFilters({ ...filters, entityType: e.target.value })
              }
              className="block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
            >
              <option value="all">All Entities</option>
              <option value="FEATURE_FLAG">Feature Flag</option>
              <option value="PROJECT">Project</option>
              <option value="ORGANIZATION">Organization</option>
              <option value="API_KEY">API Key</option>
              <option value="MEMBER">Member</option>
              <option value="USER">User</option>
            </select>

            <select
              value={filters.userId}
              onChange={(e) =>
                setFilters({ ...filters, userId: e.target.value })
              }
              className="block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
            >
              <option value="all">All Users</option>
              {users.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.name}
                </option>
              ))}
            </select>

            <select
              value={filters.projectId}
              onChange={(e) =>
                setFilters({ ...filters, projectId: e.target.value })
              }
              className="block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
            >
              <option value="all">All Projects</option>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>

            <select
              value={filters.dateRange}
              onChange={(e) =>
                setFilters({
                  ...filters,
                  dateRange: e.target.value as FilterState['dateRange'],
                })
              }
              className="block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
            >
              <option value="today">Today</option>
              <option value="week">Last 7 days</option>
              <option value="month">Last 30 days</option>
              <option value="all">All time</option>
            </select>
          </div>

          {/* Clear filters */}
          {hasActiveFilters && (
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-500">
                Showing {filteredLogs.length} of {logs.length} results
              </span>
              <button
                onClick={clearFilters}
                className="text-sm text-primary-600 hover:text-primary-500 font-medium"
              >
                Clear all filters
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Logs Table */}
      {isLoading ? (
        <div className="rounded-lg bg-white shadow">
          <div className="divide-y divide-gray-200">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="p-6 animate-pulse">
                <div className="flex items-center space-x-4">
                  <div className="h-10 w-10 bg-gray-200 rounded-full" />
                  <div className="flex-1">
                    <div className="h-4 w-48 bg-gray-200 rounded" />
                    <div className="mt-2 h-3 w-32 bg-gray-200 rounded" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : filteredLogs.length === 0 ? (
        <div className="rounded-lg border-2 border-dashed border-gray-300 p-12 text-center">
          <ClockIcon className="mx-auto h-12 w-12 text-gray-400" />
          <h3 className="mt-2 text-sm font-semibold text-gray-900">
            No audit logs found
          </h3>
          <p className="mt-1 text-sm text-gray-500">
            {hasActiveFilters
              ? 'Try adjusting your filters to see more results.'
              : 'No activity has been recorded yet.'}
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg bg-white shadow">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th
                    scope="col"
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                  >
                    Action
                  </th>
                  <th
                    scope="col"
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                  >
                    Entity
                  </th>
                  <th
                    scope="col"
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                  >
                    User
                  </th>
                  <th
                    scope="col"
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                  >
                    Project
                  </th>
                  <th
                    scope="col"
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                  >
                    Time
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredLogs.map((log) => {
                  const EntityIcon = getEntityIcon(log.entityType);

                  return (
                    <tr key={log.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span
                          className={clsx(
                            'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
                            getActionColor(log.action)
                          )}
                        >
                          {log.action}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <div className="flex-shrink-0 h-8 w-8 rounded-full bg-gray-100 flex items-center justify-center">
                            <EntityIcon className="h-4 w-4 text-gray-600" />
                          </div>
                          <div className="ml-3">
                            <div className="text-sm font-medium text-gray-900">
                              {log.entityName}
                            </div>
                            <div className="text-xs text-gray-500">
                              {log.entityType.replace('_', ' ')}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <div className="h-8 w-8 rounded-full bg-primary-100 flex items-center justify-center">
                            <span className="text-sm font-medium text-primary-600">
                              {log.userName.charAt(0)}
                            </span>
                          </div>
                          <div className="ml-3">
                            <div className="text-sm font-medium text-gray-900">
                              {log.userName}
                            </div>
                            <div className="text-xs text-gray-500">
                              {log.userEmail}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {log.projectName ? (
                          <Link
                            to={`/projects/${log.projectId}`}
                            className="text-sm text-primary-600 hover:text-primary-500"
                          >
                            {log.projectName}
                          </Link>
                        ) : (
                          <span className="text-sm text-gray-400">—</span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        <span title={new Date(log.createdAt).toLocaleString()}>
                          {formatDate(log.createdAt)}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
