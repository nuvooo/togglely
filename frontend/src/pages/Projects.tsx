import { useEffect, useState, Fragment } from 'react';
import { Link } from 'react-router-dom';
import {
  FolderIcon,
  PlusIcon,
  EllipsisVerticalIcon,
  FlagIcon,
  ClockIcon,
  ExclamationTriangleIcon,
  XMarkIcon,
  CheckCircleIcon,
  TrashIcon,
  BuildingOfficeIcon,
} from '@heroicons/react/24/outline';
import { Menu, Transition, Dialog } from '@headlessui/react';
import api from '@/lib/api';
import clsx from 'clsx';

interface Project {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  organizationId: string;
  organizationName: string;
  featureFlagCount: number;
  environmentCount: number;
  createdAt: string;
}

interface Organization {
  id: string;
  name: string;
}

export default function Projects() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedOrg, setSelectedOrg] = useState<string>('all');
  
  // Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createSuccess, setCreateSuccess] = useState<string | null>(null);
  const [newProjectData, setNewProjectData] = useState({
    name: '',
    slug: '',
    description: '',
    organizationId: '',
  });
  
  // Delete state
  const [isDeleting, setIsDeleting] = useState<string | null>(null);

  const fetchProjects = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const response = await api.get('/projects');
      // Handle both direct array and wrapped response
      const projs = Array.isArray(response.data) 
        ? response.data 
        : response.data.projects || [];
      setProjects(projs);
    } catch (err) {
      console.error('Failed to fetch projects:', err);
      setError('Failed to load projects. Please try again later.');
    } finally {
      setIsLoading(false);
    }
  };

  const fetchOrganizations = async () => {
    try {
      const response = await api.get('/organizations');
      const orgs = Array.isArray(response.data) 
        ? response.data 
        : response.data.organizations || [];
      setOrganizations(orgs);
    } catch (err) {
      console.error('Failed to fetch organizations:', err);
    }
  };

  useEffect(() => {
    fetchProjects();
    fetchOrganizations();
  }, []);

  const createProject = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsCreating(true);
    setCreateError(null);
    setCreateSuccess(null);
    
    try {
      const response = await api.post(`/projects/organization/${newProjectData.organizationId}`, {
        name: newProjectData.name,
        key: newProjectData.slug || undefined,
        description: newProjectData.description || undefined,
      });
      
      const newProject = response.data.project || response.data;
      setProjects((prev) => [newProject, ...prev]);
      setCreateSuccess('Project created successfully!');
      
      // Reset form and close modal after a brief delay
      setTimeout(() => {
        setNewProjectData({ name: '', slug: '', description: '', organizationId: '' });
        setIsModalOpen(false);
        setCreateSuccess(null);
      }, 1500);
    } catch (err: any) {
      console.error('Failed to create project:', err);
      setCreateError(err.response?.data?.message || 'Failed to create project. Please try again.');
    } finally {
      setIsCreating(false);
    }
  };

  const deleteProject = async (projectId: string) => {
    if (!confirm('Are you sure you want to delete this project? This action cannot be undone.')) {
      return;
    }
    
    setIsDeleting(projectId);
    try {
      await api.delete(`/projects/${projectId}`);
      setProjects((prev) => prev.filter((p) => p.id !== projectId));
    } catch (err: any) {
      console.error('Failed to delete project:', err);
      alert(err.response?.data?.message || 'Failed to delete project. Please try again.');
    } finally {
      setIsDeleting(null);
    }
  };

  // Auto-generate slug from name
  const handleNameChange = (name: string) => {
    setNewProjectData((prev) => ({
      ...prev,
      name,
      slug: name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
    }));
  };

  const orgNames = Array.from(
    new Set(projects.map((p) => p.organizationName))
  );

  const filteredProjects = projects.filter((project) => {
    const matchesSearch =
      project.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      project.slug.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesOrg =
      selectedOrg === 'all' || project.organizationName === selectedOrg;
    return matchesSearch && matchesOrg;
  });

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="md:flex md:items-center md:justify-between">
        <div className="min-w-0 flex-1">
          <h2 className="text-2xl font-bold leading-7 text-gray-900 sm:truncate sm:text-3xl sm:tracking-tight">
            Projects
          </h2>
          <p className="mt-1 text-sm text-gray-500">
            Manage your projects and their feature flags
          </p>
        </div>
        <div className="mt-4 flex md:ml-4 md:mt-0">
          <button
            onClick={() => setIsModalOpen(true)}
            className="inline-flex items-center rounded-md bg-primary-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-primary-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600"
          >
            <PlusIcon className="-ml-0.5 mr-1.5 h-5 w-5" />
            New Project
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <div className="flex-1 max-w-lg">
          <label htmlFor="search" className="sr-only">
            Search projects
          </label>
          <input
            type="search"
            id="search"
            placeholder="Search projects..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
          />
        </div>
        <div className="sm:w-48">
          <select
            value={selectedOrg}
            onChange={(e) => setSelectedOrg(e.target.value)}
            className="block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
          >
            <option value="all">All Organizations</option>
            {orgNames.map((org) => (
              <option key={org} value={org}>
                {org}
              </option>
            ))}
          </select>
        </div>
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
          <div className="mt-4">
            <button
              onClick={() => window.location.reload()}
              className="rounded-md bg-red-100 px-3 py-2 text-sm font-medium text-red-800 hover:bg-red-200"
            >
              Retry
            </button>
          </div>
        </div>
      )}

      {/* Create Project Modal */}
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
                      Create New Project
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

                  <form onSubmit={createProject} className="space-y-4">
                    <div>
                      <label htmlFor="project-org" className="block text-sm font-medium text-gray-700">
                        Organization <span className="text-red-500">*</span>
                      </label>
                      <select
                        id="project-org"
                        value={newProjectData.organizationId}
                        onChange={(e) => setNewProjectData({ ...newProjectData, organizationId: e.target.value })}
                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
                        required
                        disabled={isCreating}
                      >
                        <option value="">Select an organization</option>
                        {organizations.map((org) => (
                          <option key={org.id} value={org.id}>
                            {org.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label htmlFor="project-name" className="block text-sm font-medium text-gray-700">
                        Project Name <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        id="project-name"
                        value={newProjectData.name}
                        onChange={(e) => handleNameChange(e.target.value)}
                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
                        placeholder="e.g., Web Application"
                        required
                        disabled={isCreating}
                      />
                    </div>

                    <div>
                      <label htmlFor="project-slug" className="block text-sm font-medium text-gray-700">
                        Slug
                      </label>
                      <input
                        type="text"
                        id="project-slug"
                        value={newProjectData.slug}
                        onChange={(e) => setNewProjectData({ ...newProjectData, slug: e.target.value })}
                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
                        placeholder="web-application"
                        disabled={isCreating}
                      />
                      <p className="mt-1 text-xs text-gray-500">
                        Used in URLs. Auto-generated from name.
                      </p>
                    </div>

                    <div>
                      <label htmlFor="project-description" className="block text-sm font-medium text-gray-700">
                        Description
                      </label>
                      <textarea
                        id="project-description"
                        value={newProjectData.description}
                        onChange={(e) => setNewProjectData({ ...newProjectData, description: e.target.value })}
                        rows={3}
                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
                        placeholder="Brief description of your project"
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
                        disabled={isCreating || !newProjectData.name || !newProjectData.organizationId}
                        className="rounded-md bg-primary-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {isCreating ? 'Creating...' : 'Create Project'}
                      </button>
                    </div>
                  </form>
                </Dialog.Panel>
              </Transition.Child>
            </div>
          </div>
        </Dialog>
      </Transition>

      {/* Projects list */}
      {isLoading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[...Array(4)].map((_, i) => (
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
      ) : filteredProjects.length === 0 ? (
        <div className="rounded-lg border-2 border-dashed border-gray-300 p-12 text-center">
          <FolderIcon className="mx-auto h-12 w-12 text-gray-400" />
          <h3 className="mt-2 text-sm font-semibold text-gray-900">No projects</h3>
          <p className="mt-1 text-sm text-gray-500">
            Get started by creating a new project.
          </p>
          <div className="mt-6">
            <button
              onClick={() => setIsModalOpen(true)}
              className="inline-flex items-center rounded-md bg-primary-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-primary-700"
            >
              <PlusIcon className="-ml-0.5 mr-1.5 h-5 w-5" />
              New Project
            </button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filteredProjects.map((project) => (
            <div
              key={project.id}
              className="relative flex flex-col rounded-lg border border-gray-200 bg-white shadow-sm hover:shadow-md transition-shadow"
            >
              <div className="flex-1 p-6">
                <div className="flex items-start justify-between">
                  <div className="flex items-center">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-100">
                      <FolderIcon className="h-6 w-6 text-green-600" />
                    </div>
                    <div className="ml-4">
                      <h3 className="text-lg font-medium text-gray-900">
                        <Link to={`/projects/${project.id}`} className="hover:text-primary-600">
                          {project.name}
                        </Link>
                      </h3>
                      <p className="text-sm text-gray-500">{project.slug}</p>
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
                                to={`/projects/${project.id}`}
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
                                to={`/feature-flags?project=${project.id}`}
                                className={clsx(
                                  active ? 'bg-gray-100 text-gray-900' : 'text-gray-700',
                                  'block px-4 py-2 text-sm'
                                )}
                              >
                                View feature flags
                              </Link>
                            )}
                          </Menu.Item>
                          <Menu.Item>
                            {({ active }) => (
                              <Link
                                to={`/projects/${project.id}/settings`}
                                className={clsx(
                                  active ? 'bg-gray-100 text-gray-900' : 'text-gray-700',
                                  'block px-4 py-2 text-sm'
                                )}
                              >
                                Settings
                              </Link>
                            )}
                          </Menu.Item>
                          <div className="border-t border-gray-100">
                            <Menu.Item>
                              {({ active }) => (
                                <button
                                  onClick={() => deleteProject(project.id)}
                                  disabled={isDeleting === project.id}
                                  className={clsx(
                                    active ? 'bg-gray-100 text-red-900' : 'text-red-700',
                                    'block w-full px-4 py-2 text-left text-sm disabled:opacity-50'
                                  )}
                                >
                                  <span className="flex items-center">
                                    <TrashIcon className="mr-2 h-4 w-4" />
                                    {isDeleting === project.id ? 'Deleting...' : 'Delete'}
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

                <div className="mt-2">
                  <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-800">
                    <BuildingOfficeIcon className="mr-1 h-3 w-3" />
                    {project.organizationName}
                  </span>
                </div>

                {project.description && (
                  <p className="mt-3 text-sm text-gray-500 line-clamp-2">
                    {project.description}
                  </p>
                )}

                <div className="mt-4 flex items-center space-x-4 text-sm text-gray-500">
                  <div className="flex items-center">
                    <FlagIcon className="mr-1.5 h-4 w-4 flex-shrink-0" />
                    {project.featureFlagCount} flags
                  </div>
                  <div className="flex items-center">
                    <ClockIcon className="mr-1.5 h-4 w-4 flex-shrink-0" />
                    {formatDate(project.createdAt)}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
