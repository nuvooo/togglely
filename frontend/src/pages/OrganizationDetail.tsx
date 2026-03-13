import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  BuildingOfficeIcon,
  UsersIcon,
  FolderIcon,
  ArrowLeftIcon,
  PlusIcon,
  EnvelopeIcon,
  TrashIcon,
  ShieldCheckIcon,
  UserIcon,
} from '@heroicons/react/24/outline';
import { Tab } from '@headlessui/react';
import api from '@/lib/api';
import clsx from 'clsx';

// Helper to validate MongoDB ObjectID format (24-char hex)
const isValidObjectId = (id: string | undefined | null): id is string => {
  if (!id || typeof id !== 'string') return false;
  if (id === 'undefined' || id === 'null' || id === 'new') return false;
  return /^[0-9a-fA-F]{24}$/.test(id);
};

interface Organization {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  createdAt: string;
}

interface Member {
  id: string;
  userId: string;
  name: string;
  email: string;
  role: 'OWNER' | 'ADMIN' | 'MEMBER';
  joinedAt: string;
}

interface Project {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  featureFlagCount: number;
  environmentCount: number;
  createdAt: string;
}

export default function OrganizationDetail() {
  const { id } = useParams<{ id: string }>();

  // Validate orgId early
  const orgId = isValidObjectId(id) ? id : null;

  const [organization, setOrganization] = useState<Organization | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'ADMIN' | 'MEMBER'>('MEMBER');
  const [isInviting, setIsInviting] = useState(false);

  useEffect(() => {
    // Skip fetch if orgId is invalid
    if (!orgId) {
      setIsLoading(false);
      return;
    }

    const fetchData = async () => {
      try {
        const [orgRes, membersRes, projectsRes] = await Promise.all([
          api.get(`/organizations/${orgId}`),
          api.get(`/organizations/${orgId}/members`),
          api.get(`/organizations/${orgId}/projects`),
        ]);
        setOrganization(orgRes.data.organization);
        setMembers(membersRes.data.members);
        setProjects(projectsRes.data.projects);
      } catch (error) {
        console.error('Failed to fetch organization data:', error);
        // Mock data for development
        setOrganization({
          id: orgId,
          name: 'Acme Corp',
          slug: 'acme-corp',
          description: 'Main company organization for all Acme projects',
          createdAt: '2024-01-01T00:00:00Z',
        });
        setMembers([
          {
            id: '1',
            userId: 'u1',
            name: 'John Doe',
            email: 'john@acme.com',
            role: 'OWNER',
            joinedAt: '2024-01-01T00:00:00Z',
          },
          {
            id: '2',
            userId: 'u2',
            name: 'Jane Smith',
            email: 'jane@acme.com',
            role: 'ADMIN',
            joinedAt: '2024-01-05T00:00:00Z',
          },
          {
            id: '3',
            userId: 'u3',
            name: 'Bob Wilson',
            email: 'bob@acme.com',
            role: 'MEMBER',
            joinedAt: '2024-01-10T00:00:00Z',
          },
        ]);
        setProjects([
          {
            id: '1',
            name: 'Web Application',
            slug: 'web-app',
            description: 'Main web application',
            featureFlagCount: 12,
            environmentCount: 3,
            createdAt: '2024-01-05T00:00:00Z',
          },
          {
            id: '2',
            name: 'Mobile App',
            slug: 'mobile-app',
            description: 'iOS and Android app',
            featureFlagCount: 8,
            environmentCount: 2,
            createdAt: '2024-01-08T00:00:00Z',
          },
          {
            id: '3',
            name: 'API Gateway',
            slug: 'api-gateway',
            description: 'API gateway service',
            featureFlagCount: 15,
            environmentCount: 4,
            createdAt: '2024-01-10T00:00:00Z',
          },
        ]);
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [orgId]);

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!orgId) return;
    setIsInviting(true);
    try {
      await api.post(`/organizations/${orgId}/invitations`, {
        email: inviteEmail,
        role: inviteRole,
      });
      setInviteEmail('');
      // Refresh members list
      const response = await api.get(`/organizations/${orgId}/members`);
      setMembers(response.data.members);
    } catch (error) {
      console.error('Failed to send invitation:', error);
    } finally {
      setIsInviting(false);
    }
  };

  const handleRemoveMember = async (memberId: string) => {
    if (!orgId || !isValidObjectId(memberId)) {
      console.error('Invalid orgId or memberId:', orgId, memberId);
      return;
    }
    if (!confirm('Are you sure you want to remove this member?')) return;
    try {
      await api.delete(`/organizations/${orgId}/members/${memberId}`);
      setMembers(members.filter((m) => m.id !== memberId));
    } catch (error) {
      console.error('Failed to remove member:', error);
    }
  };

  const getRoleBadgeColor = (role: string) => {
    switch (role) {
      case 'OWNER':
        return 'bg-purple-100 text-purple-800';
      case 'ADMIN':
        return 'bg-blue-100 text-blue-800';
      case 'MEMBER':
        return 'bg-green-100 text-green-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="animate-pulse">
          <div className="h-8 w-64 bg-gray-200 rounded" />
          <div className="mt-2 h-4 w-96 bg-gray-200 rounded" />
        </div>
        <div className="bg-white shadow rounded-lg animate-pulse">
          <div className="p-6 space-y-4">
            <div className="h-10 w-full bg-gray-200 rounded" />
            <div className="h-10 w-full bg-gray-200 rounded" />
          </div>
        </div>
      </div>
    );
  }

  if (!organization) {
    return (
      <div className="text-center py-12">
        <BuildingOfficeIcon className="mx-auto h-12 w-12 text-gray-400" />
        <h3 className="mt-2 text-sm font-semibold text-gray-900">
          Organization not found
        </h3>
        <p className="mt-1 text-sm text-gray-500">
          The organization you are looking for does not exist.
        </p>
        <div className="mt-6">
          <Link
            to="/organizations"
            className="inline-flex items-center text-primary-600 hover:text-primary-500"
          >
            <ArrowLeftIcon className="mr-2 h-4 w-4" />
            Back to organizations
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <Link
          to="/organizations"
          className="inline-flex items-center text-sm text-gray-500 hover:text-gray-700"
        >
          <ArrowLeftIcon className="mr-1 h-4 w-4" />
          Back to organizations
        </Link>
        <div className="mt-2 md:flex md:items-center md:justify-between">
          <div className="min-w-0 flex-1">
            <div className="flex items-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary-100">
                <BuildingOfficeIcon className="h-6 w-6 text-primary-600" />
              </div>
              <div className="ml-4">
                <h2 className="text-2xl font-bold leading-7 text-gray-900 sm:text-3xl">
                  {organization.name}
                </h2>
                <p className="text-sm text-gray-500">{organization.slug}</p>
              </div>
            </div>
          </div>
          <div className="mt-4 flex md:ml-4 md:mt-0 space-x-3">
            <Link
              to={`/projects/new?organization=${id}`}
              className="inline-flex items-center rounded-md bg-white px-3 py-2 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50"
            >
              <PlusIcon className="-ml-0.5 mr-1.5 h-5 w-5 text-gray-400" />
              New Project
            </Link>
            <Link
              to={`/organizations/${id}/settings`}
              className="inline-flex items-center rounded-md bg-primary-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-primary-700"
            >
              Settings
            </Link>
          </div>
        </div>
        {organization.description && (
          <p className="mt-4 text-sm text-gray-600 max-w-3xl">
            {organization.description}
          </p>
        )}
      </div>

      {/* Tabs */}
      <Tab.Group>
        <Tab.List className="flex space-x-1 rounded-xl bg-gray-100 p-1 max-w-md">
          {['Overview', 'Members', 'Projects'].map((tab) => (
            <Tab
              key={tab}
              className={({ selected }) =>
                clsx(
                  'w-full rounded-lg py-2.5 text-sm font-medium leading-5',
                  'ring-white ring-opacity-60 ring-offset-2 ring-offset-primary-400 focus:outline-none focus:ring-2',
                  selected
                    ? 'bg-white text-primary-700 shadow'
                    : 'text-gray-600 hover:bg-white/[0.5] hover:text-gray-800'
                )
              }
            >
              {tab}
            </Tab>
          ))}
        </Tab.List>

        <Tab.Panels>
          {/* Overview Panel */}
          <Tab.Panel className="space-y-6">
            {/* Stats */}
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
              <div className="overflow-hidden rounded-lg bg-white shadow">
                <div className="p-5">
                  <div className="flex items-center">
                    <div className="flex-shrink-0">
                      <UsersIcon className="h-6 w-6 text-gray-400" />
                    </div>
                    <div className="ml-5 w-0 flex-1">
                      <dl>
                        <dt className="text-sm font-medium text-gray-500">
                          Members
                        </dt>
                        <dd className="text-2xl font-semibold text-gray-900">
                          {members.length}
                        </dd>
                      </dl>
                    </div>
                  </div>
                </div>
              </div>
              <div className="overflow-hidden rounded-lg bg-white shadow">
                <div className="p-5">
                  <div className="flex items-center">
                    <div className="flex-shrink-0">
                      <FolderIcon className="h-6 w-6 text-gray-400" />
                    </div>
                    <div className="ml-5 w-0 flex-1">
                      <dl>
                        <dt className="text-sm font-medium text-gray-500">
                          Projects
                        </dt>
                        <dd className="text-2xl font-semibold text-gray-900">
                          {projects.length}
                        </dd>
                      </dl>
                    </div>
                  </div>
                </div>
              </div>
              <div className="overflow-hidden rounded-lg bg-white shadow">
                <div className="p-5">
                  <div className="flex items-center">
                    <div className="flex-shrink-0">
                      <ShieldCheckIcon className="h-6 w-6 text-gray-400" />
                    </div>
                    <div className="ml-5 w-0 flex-1">
                      <dl>
                        <dt className="text-sm font-medium text-gray-500">
                          Created
                        </dt>
                        <dd className="text-lg font-semibold text-gray-900">
                          {formatDate(organization.createdAt)}
                        </dd>
                      </dl>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Recent Projects */}
            <div className="rounded-lg bg-white shadow">
              <div className="border-b border-gray-200 px-4 py-4 sm:px-6">
                <div className="flex items-center justify-between">
                  <h3 className="text-base font-semibold text-gray-900">
                    Recent Projects
                  </h3>
                  <Link
                    to={`/projects?organization=${id}`}
                    className="text-sm text-primary-600 hover:text-primary-500"
                  >
                    View all
                  </Link>
                </div>
              </div>
              <ul className="divide-y divide-gray-200">
                {projects.slice(0, 3).map((project) => (
                  <li
                    key={project.id}
                    className="px-4 py-4 sm:px-6 hover:bg-gray-50"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <Link
                          to={`/projects/${project.id}`}
                          className="text-sm font-medium text-primary-600 hover:text-primary-500"
                        >
                          {project.name}
                        </Link>
                        <p className="text-xs text-gray-500 mt-1">
                          {project.slug}
                        </p>
                      </div>
                      <div className="flex items-center space-x-4 text-sm text-gray-500">
                        <span>{project.featureFlagCount} flags</span>
                        <span>{project.environmentCount} environments</span>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>

            {/* Members preview */}
            <div className="rounded-lg bg-white shadow">
              <div className="border-b border-gray-200 px-4 py-4 sm:px-6">
                <div className="flex items-center justify-between">
                  <h3 className="text-base font-semibold text-gray-900">
                    Members
                  </h3>
                  <button
                    onClick={() => {
                      const membersTab = document.querySelector('[data-tab="members"]');
                      if (membersTab) (membersTab as HTMLElement).click();
                    }}
                    className="text-sm text-primary-600 hover:text-primary-500"
                  >
                    Manage members
                  </button>
                </div>
              </div>
              <ul className="divide-y divide-gray-200">
                {members.slice(0, 5).map((member) => (
                  <li
                    key={member.id}
                    className="px-4 py-4 sm:px-6 hover:bg-gray-50"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center">
                        <div className="h-8 w-8 rounded-full bg-primary-100 flex items-center justify-center">
                          <span className="text-sm font-medium text-primary-600">
                            {member.name.charAt(0)}
                          </span>
                        </div>
                        <div className="ml-3">
                          <p className="text-sm font-medium text-gray-900">
                            {member.name}
                          </p>
                          <p className="text-xs text-gray-500">
                            {member.email}
                          </p>
                        </div>
                      </div>
                      <span
                        className={clsx(
                          'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
                          getRoleBadgeColor(member.role)
                        )}
                      >
                        {member.role}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </Tab.Panel>

          {/* Members Panel */}
          <Tab.Panel className="space-y-6">
            {/* Invite form */}
            <div className="rounded-lg bg-white shadow">
              <div className="px-4 py-5 sm:p-6">
                <h3 className="text-base font-semibold leading-6 text-gray-900">
                  Invite Member
                </h3>
                <p className="mt-1 text-sm text-gray-500">
                  Send an invitation to join this organization.
                </p>
                <form onSubmit={handleInvite} className="mt-5 sm:flex sm:items-center">
                  <div className="w-full sm:max-w-xs">
                    <label htmlFor="email" className="sr-only">
                      Email
                    </label>
                    <div className="relative rounded-md shadow-sm">
                      <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                        <EnvelopeIcon className="h-5 w-5 text-gray-400" />
                      </div>
                      <input
                        type="email"
                        id="email"
                        value={inviteEmail}
                        onChange={(e) => setInviteEmail(e.target.value)}
                        placeholder="colleague@company.com"
                        className="block w-full rounded-md border-gray-300 pl-10 focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
                        required
                      />
                    </div>
                  </div>
                  <div className="mt-3 sm:mt-0 sm:ml-3">
                    <select
                      value={inviteRole}
                      onChange={(e) =>
                        setInviteRole(e.target.value as 'ADMIN' | 'MEMBER')
                      }
                      className="block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
                    >
                      <option value="MEMBER">Member</option>
                      <option value="ADMIN">Admin</option>
                    </select>
                  </div>
                  <button
                    type="submit"
                    disabled={isInviting || !inviteEmail}
                    className="mt-3 inline-flex w-full items-center justify-center rounded-md bg-primary-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-primary-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600 disabled:opacity-50 disabled:cursor-not-allowed sm:mt-0 sm:ml-3 sm:w-auto"
                  >
                    {isInviting ? 'Sending...' : 'Send Invite'}
                  </button>
                </form>
              </div>
            </div>

            {/* Members list */}
            <div className="rounded-lg bg-white shadow">
              <div className="border-b border-gray-200 px-4 py-4 sm:px-6">
                <h3 className="text-base font-semibold text-gray-900">
                  All Members ({members.length})
                </h3>
              </div>
              <ul className="divide-y divide-gray-200">
                {members.map((member) => (
                  <li
                    key={member.id}
                    className="px-4 py-4 sm:px-6 hover:bg-gray-50"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center">
                        <div className="h-10 w-10 rounded-full bg-primary-100 flex items-center justify-center">
                          <UserIcon className="h-5 w-5 text-primary-600" />
                        </div>
                        <div className="ml-4">
                          <p className="text-sm font-medium text-gray-900">
                            {member.name}
                          </p>
                          <p className="text-xs text-gray-500">
                            {member.email} • Joined {formatDate(member.joinedAt)}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center space-x-3">
                        <span
                          className={clsx(
                            'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
                            getRoleBadgeColor(member.role)
                          )}
                        >
                          {member.role}
                        </span>
                        {member.role !== 'OWNER' && (
                          <button
                            onClick={() => handleRemoveMember(member.id)}
                            className="text-gray-400 hover:text-red-600"
                            title="Remove member"
                          >
                            <TrashIcon className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </Tab.Panel>

          {/* Projects Panel */}
          <Tab.Panel className="space-y-6">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold text-gray-900">
                All Projects ({projects.length})
              </h3>
              <Link
                to={`/projects/new?organization=${id}`}
                className="inline-flex items-center rounded-md bg-primary-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-primary-700"
              >
                <PlusIcon className="-ml-0.5 mr-1.5 h-4 w-4" />
                New Project
              </Link>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {projects.map((project) => (
                <div
                  key={project.id}
                  className="relative flex flex-col rounded-lg border border-gray-200 bg-white shadow-sm hover:shadow-md transition-shadow"
                >
                  <div className="flex-1 p-6">
                    <div className="flex items-start">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-100">
                        <FolderIcon className="h-6 w-6 text-green-600" />
                      </div>
                      <div className="ml-4 flex-1">
                        <h3 className="text-lg font-medium text-gray-900">
                          <Link
                            to={`/projects/${project.id}`}
                            className="hover:text-primary-600"
                          >
                            {project.name}
                          </Link>
                        </h3>
                        <p className="text-sm text-gray-500">{project.slug}</p>
                      </div>
                    </div>

                    {project.description && (
                      <p className="mt-3 text-sm text-gray-500 line-clamp-2">
                        {project.description}
                      </p>
                    )}

                    <div className="mt-4 flex items-center space-x-4 text-sm text-gray-500">
                      <div className="flex items-center">
                        <UsersIcon className="mr-1.5 h-4 w-4 flex-shrink-0" />
                        {project.featureFlagCount} flags
                      </div>
                      <div className="flex items-center">
                        <ShieldCheckIcon className="mr-1.5 h-4 w-4 flex-shrink-0" />
                        {project.environmentCount} envs
                      </div>
                    </div>
                  </div>
                  <div className="border-t border-gray-200 px-4 py-4">
                    <Link
                      to={`/projects/${project.id}`}
                      className="text-sm font-medium text-primary-600 hover:text-primary-500"
                    >
                      View project →
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          </Tab.Panel>
        </Tab.Panels>
      </Tab.Group>
    </div>
  );
}
