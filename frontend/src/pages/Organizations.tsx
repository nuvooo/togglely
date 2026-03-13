import { useEffect, useState, Fragment } from 'react';
import { Link } from 'react-router-dom';
import {
  BuildingOfficeIcon,
  PlusIcon,
  EllipsisVerticalIcon,
  UsersIcon,
  ExclamationTriangleIcon,
  XMarkIcon,
  CheckCircleIcon,
  TrashIcon,
} from '@heroicons/react/24/outline';
import { Menu, Transition, Dialog } from '@headlessui/react';
import api from '@/lib/api';
import clsx from 'clsx';

interface Organization {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  memberCount: number;
  projectCount: number;
  role: string;
  createdAt: string;
}

export default function Organizations() {
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createSuccess, setCreateSuccess] = useState<string | null>(null);
  const [newOrgData, setNewOrgData] = useState({
    name: '',
    slug: '',
    description: '',
  });
  
  // Delete state
  const [isDeleting, setIsDeleting] = useState<string | null>(null);

  const fetchOrganizations = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const response = await api.get('/organizations');
      console.log('Organizations response:', response.data);
      // Handle both direct array and wrapped response
      let orgs = [];
      if (Array.isArray(response.data)) {
        orgs = response.data;
      } else if (response.data && Array.isArray(response.data.organizations)) {
        orgs = response.data.organizations;
      } else if (response.data) {
        // If it's a single object, wrap in array
        orgs = [response.data];
      }
      setOrganizations(orgs);
    } catch (err: any) {
      console.error('Failed to fetch organizations:', err);
      console.error('Error response:', err.response?.data);
      setError(err.response?.data?.error || 'Failed to load organizations. Please try again later.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchOrganizations();
  }, []);

  const createOrganization = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsCreating(true);
    setCreateError(null);
    setCreateSuccess(null);
    
    try {
      const response = await api.post('/organizations', {
        name: newOrgData.name,
        slug: newOrgData.slug || undefined,
        description: newOrgData.description || undefined,
      });
      
      const newOrg = response.data.organization || response.data;
      setOrganizations((prev) => [newOrg, ...prev]);
      setCreateSuccess('Organization created successfully!');
      
      // Reset form and close modal after a brief delay
      setTimeout(() => {
        setNewOrgData({ name: '', slug: '', description: '' });
        setIsModalOpen(false);
        setCreateSuccess(null);
      }, 1500);
    } catch (err: any) {
      console.error('Failed to create organization:', err);
      setCreateError(err.response?.data?.message || 'Failed to create organization. Please try again.');
    } finally {
      setIsCreating(false);
    }
  };

  const deleteOrganization = async (orgId: string) => {
    if (!confirm('Are you sure you want to delete this organization? This action cannot be undone.')) {
      return;
    }
    
    setIsDeleting(orgId);
    try {
      await api.delete(`/organizations/${orgId}`);
      setOrganizations((prev) => prev.filter((org) => org.id !== orgId));
    } catch (err: any) {
      console.error('Failed to delete organization:', err);
      alert(err.response?.data?.message || 'Failed to delete organization. Please try again.');
    } finally {
      setIsDeleting(null);
    }
  };

  // Auto-generate slug from name
  const handleNameChange = (name: string) => {
    setNewOrgData((prev) => ({
      ...prev,
      name,
      slug: name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
    }));
  };

  const filteredOrganizations = organizations.filter((org) =>
    org.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    org.slug.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="md:flex md:items-center md:justify-between">
        <div className="min-w-0 flex-1">
          <h2 className="text-2xl font-bold leading-7 text-gray-900 sm:truncate sm:text-3xl sm:tracking-tight">
            Organizations
          </h2>
          <p className="mt-1 text-sm text-gray-500">
            Manage your organizations and teams
          </p>
        </div>
        <div className="mt-4 flex md:ml-4 md:mt-0">
          <button
            onClick={() => setIsModalOpen(true)}
            className="inline-flex items-center rounded-md bg-primary-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-primary-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600"
          >
            <PlusIcon className="-ml-0.5 mr-1.5 h-5 w-5" />
            New Organization
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="max-w-lg">
        <label htmlFor="search" className="sr-only">
          Search organizations
        </label>
        <input
          type="search"
          id="search"
          placeholder="Search organizations..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
        />
      </div>

      {/* Error message */}
      {error && (
        <div className="rounded-md bg-red-50 p-4">
          <div className="flex">
            <div className="flex-shrink-0">
              <ExclamationTriangleIcon className="h-5 w-5 text-red-400" aria-hidden="true" />
            </div>
            <div className="ml-3">
              <h3 className="text-sm font-medium text-red-800">Error</h3>
              <div className="mt-2 text-sm text-red-700">
                <p>{error}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Create Organization Modal */}
      <Transition appear show={isModalOpen} as={Fragment}>
        <Dialog as="div" className="relative z-10" onClose={() => !isCreating && setIsModalOpen(false)}>
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
                <Dialog.Panel className="w-full max-w-md transform overflow-hidden rounded-lg bg-white p-6 text-left align-middle shadow-xl transition-all">
                  <div className="flex items-center justify-between mb-4">
                    <Dialog.Title
                      as="h3"
                      className="text-lg font-semibold leading-6 text-gray-900"
                    >
                      Create New Organization
                    </Dialog.Title>
                    <button
                      onClick={() => setIsModalOpen(false)}
                      disabled={isCreating}
                      className="text-gray-400 hover:text-gray-500 disabled:opacity-50"
                    >
                      <XMarkIcon className="h-5 w-5" />
                    </button>
                  </div>

                  {createError && (
                    <div className="mb-4 rounded-md bg-red-50 p-3">
                      <p className="text-sm text-red-700">{createError}</p>
                    </div>
                  )}

                  {createSuccess && (
                    <div className="mb-4 rounded-md bg-green-50 p-3 flex items-center">
                      <CheckCircleIcon className="h-5 w-5 text-green-400 mr-2" />
                      <p className="text-sm text-green-700">{createSuccess}</p>
                    </div>
                  )}

                  <form onSubmit={createOrganization} className="space-y-4">
                    <div>
                      <label htmlFor="org-name" className="block text-sm font-medium text-gray-700">
                        Organization Name <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        id="org-name"
                        value={newOrgData.name}
                        onChange={(e) => handleNameChange(e.target.value)}
                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
                        placeholder="e.g., Acme Corporation"
                        required
                        disabled={isCreating}
                      />
                    </div>

                    <div>
                      <label htmlFor="org-slug" className="block text-sm font-medium text-gray-700">
                        Slug
                      </label>
                      <input
                        type="text"
                        id="org-slug"
                        value={newOrgData.slug}
                        onChange={(e) => setNewOrgData({ ...newOrgData, slug: e.target.value })}
                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
                        placeholder="acme-corporation"
                        disabled={isCreating}
                      />
                      <p className="mt-1 text-xs text-gray-500">
                        Used in URLs. Auto-generated from name.
                      </p>
                    </div>

                    <div>
                      <label htmlFor="org-description" className="block text-sm font-medium text-gray-700">
                        Description
                      </label>
                      <textarea
                        id="org-description"
                        value={newOrgData.description}
                        onChange={(e) => setNewOrgData({ ...newOrgData, description: e.target.value })}
                        rows={3}
                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
                        placeholder="Brief description of your organization"
                        disabled={isCreating}
                      />
                    </div>

                    <div className="mt-6 flex justify-end space-x-3">
                      <button
                        type="button"
                        onClick={() => setIsModalOpen(false)}
                        disabled={isCreating}
                        className="rounded-md bg-white px-3 py-2 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50 disabled:opacity-50"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={isCreating || !newOrgData.name}
                        className="rounded-md bg-primary-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {isCreating ? 'Creating...' : 'Create Organization'}
                      </button>
                    </div>
                  </form>
                </Dialog.Panel>
              </Transition.Child>
            </div>
          </div>
        </Dialog>
      </Transition>

      {/* Organizations list */}
      {isLoading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="rounded-lg bg-white shadow animate-pulse">
              <div className="p-6">
                <div className="h-6 w-32 bg-gray-200 rounded" />
                <div className="mt-2 h-4 w-48 bg-gray-200 rounded" />
                <div className="mt-4 flex space-x-4">
                  <div className="h-4 w-16 bg-gray-200 rounded" />
                  <div className="h-4 w-16 bg-gray-200 rounded" />
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : filteredOrganizations.length === 0 ? (
        <div className="rounded-lg border-2 border-dashed border-gray-300 p-12 text-center">
          <BuildingOfficeIcon className="mx-auto h-12 w-12 text-gray-400" />
          <h3 className="mt-2 text-sm font-semibold text-gray-900">No organizations</h3>
          <p className="mt-1 text-sm text-gray-500">
            Get started by creating a new organization.
          </p>
          <div className="mt-6">
            <button
              onClick={() => setIsModalOpen(true)}
              className="inline-flex items-center rounded-md bg-primary-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-primary-700"
            >
              <PlusIcon className="-ml-0.5 mr-1.5 h-5 w-5" />
              New Organization
            </button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filteredOrganizations.map((org) => (
            <div
              key={org.id}
              className="relative flex flex-col rounded-lg border border-gray-200 bg-white shadow-sm hover:shadow-md transition-shadow"
            >
              <div className="flex-1 p-6">
                <div className="flex items-start justify-between">
                  <div className="flex items-center">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary-100">
                      <BuildingOfficeIcon className="h-6 w-6 text-primary-600" />
                    </div>
                    <div className="ml-4">
                      <h3 className="text-lg font-medium text-gray-900">
                        <Link to={`/organizations/${org.id}`} className="hover:text-primary-600">
                          {org.name}
                        </Link>
                      </h3>
                      <p className="text-sm text-gray-500">{org.slug}</p>
                    </div>
                  </div>
                  <Menu as="div" className="relative ml-2 inline-block text-left">
                    <Menu.Button className="flex items-center rounded-full bg-white p-2 text-gray-400 hover:text-gray-600 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2">
                      <span className="sr-only">Open options</span>
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
                      <Menu.Items className="absolute right-0 z-10 mt-2 w-48 origin-top-right rounded-md bg-white shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none">
                        <div className="py-1">
                          <Menu.Item>
                            {({ active }) => (
                              <Link
                                to={`/organizations/${org.id}`}
                                className={clsx(
                                  active ? 'bg-gray-100 text-gray-900' : 'text-gray-700',
                                  'block px-4 py-2 text-sm'
                                )}
                              >
                                View details
                              </Link>
                            )}
                          </Menu.Item>
                          <Menu.Item>
                            {({ active }) => (
                              <Link
                                to={`/organizations/${org.id}/settings`}
                                className={clsx(
                                  active ? 'bg-gray-100 text-gray-900' : 'text-gray-700',
                                  'block px-4 py-2 text-sm'
                                )}
                              >
                                Settings
                              </Link>
                            )}
                          </Menu.Item>
                          {org.role === 'OWNER' && (
                            <div className="border-t border-gray-100">
                              <Menu.Item>
                                {({ active }) => (
                                  <button
                                    onClick={() => deleteOrganization(org.id)}
                                    disabled={isDeleting === org.id}
                                    className={clsx(
                                      active ? 'bg-gray-100 text-red-900' : 'text-red-700',
                                      'block w-full px-4 py-2 text-left text-sm disabled:opacity-50'
                                    )}
                                  >
                                    <span className="flex items-center">
                                      <TrashIcon className="mr-2 h-4 w-4" />
                                      {isDeleting === org.id ? 'Deleting...' : 'Delete'}
                                    </span>
                                  </button>
                                )}
                              </Menu.Item>
                            </div>
                          )}
                        </div>
                      </Menu.Items>
                    </Transition>
                  </Menu>
                </div>

                {org.description && (
                  <p className="mt-3 text-sm text-gray-500 line-clamp-2">
                    {org.description}
                  </p>
                )}

                <div className="mt-4 flex items-center space-x-4 text-sm text-gray-500">
                  <div className="flex items-center">
                    <UsersIcon className="mr-1.5 h-4 w-4 flex-shrink-0" />
                    {org.memberCount} members
                  </div>
                  <div className="flex items-center">
                    <BuildingOfficeIcon className="mr-1.5 h-4 w-4 flex-shrink-0" />
                    {org.projectCount} projects
                  </div>
                </div>

                <div className="mt-4">
                  <span
                    className={clsx(
                      'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
                      org.role === 'OWNER' && 'bg-purple-100 text-purple-800',
                      org.role === 'ADMIN' && 'bg-blue-100 text-blue-800',
                      org.role === 'MEMBER' && 'bg-green-100 text-green-800'
                    )}
                  >
                    {org.role}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
