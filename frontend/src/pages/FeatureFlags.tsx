import { useEffect, useState, Fragment } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  FlagIcon,
  PlusIcon,
  EllipsisVerticalIcon,
  CheckCircleIcon,
  XCircleIcon,
  ClockIcon,
  MagnifyingGlassIcon,
  FunnelIcon,
  XMarkIcon,
  TrashIcon,
} from '@heroicons/react/24/outline';
import { Menu, Transition, Switch, Dialog } from '@headlessui/react';
import api from '@/lib/api';
import clsx from 'clsx';

// Helper to validate MongoDB ObjectID format (24-char hex)
const isValidObjectId = (id: string | undefined | null): id is string => {
  if (!id || typeof id !== 'string') return false;
  if (id === 'undefined' || id === 'null' || id === 'new') return false;
  return /^[0-9a-fA-F]{24}$/.test(id);
};

interface FeatureFlag {
  id: string;
  name: string;
  key: string;
  description: string | null;
  type: 'BOOLEAN' | 'STRING' | 'NUMBER' | 'JSON';
  defaultValue: boolean | string | number | object;
  projectId: string;
  projectName: string;
  environmentId: string;
  environmentName: string;
  isEnabled: boolean;
  createdAt: string;
  updatedAt: string;
}

interface Project {
  id: string;
  name: string;
  environments: { id: string; name: string }[];
}

export default function FeatureFlags() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [featureFlags, setFeatureFlags] = useState<FeatureFlag[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedProject, setSelectedProject] = useState<string>(
    searchParams.get('project') || 'all'
  );
  const [selectedEnvironment, setSelectedEnvironment] = useState<string>('all');
  
  // Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createSuccess, setCreateSuccess] = useState<string | null>(null);
  const [newFlagData, setNewFlagData] = useState({
    name: '',
    key: '',
    description: '',
    type: 'BOOLEAN' as FeatureFlag['type'],
    defaultValue: 'false',
    projectId: '',
    environmentId: '',
  });
  
  // Toggle state
  const [togglingFlags, setTogglingFlags] = useState<Set<string>>(new Set());
  
  // Delete state
  const [isDeleting, setIsDeleting] = useState<string | null>(null);

  // Validate projectId from search params
  const validProjectId = isValidObjectId(selectedProject) ? selectedProject : null;

  const fetchFeatureFlags = async () => {
    try {
      setIsLoading(true);
      const response = await api.get('/feature-flags', {
        params: {
          projectId: validProjectId || undefined,
          environmentId:
            selectedEnvironment !== 'all' ? selectedEnvironment : undefined,
        },
      });
      const flags = response.data.featureFlags || [];
      // Normalize the flag data to ensure consistent structure
      setFeatureFlags(flags.map((flag: any) => ({
        ...flag,
        isEnabled: flag.enabled ?? flag.isEnabled ?? false,
        environmentId: flag.environmentId || selectedEnvironment,
      })));
    } catch (error) {
      console.error('Failed to fetch feature flags:', error);
      setFeatureFlags([]);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchProjects = async () => {
    try {
      const response = await api.get('/projects');
      setProjects(response.data.projects || []);
    } catch (error) {
      console.error('Failed to fetch projects:', error);
    }
  };

  useEffect(() => {
    fetchFeatureFlags();
    fetchProjects();
  }, [validProjectId, selectedEnvironment]);

  const createFeatureFlag = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsCreating(true);
    setCreateError(null);
    setCreateSuccess(null);
    
    try {
      const response = await api.post(`/feature-flags/project/${newFlagData.projectId}`, {
        name: newFlagData.name,
        key: newFlagData.key,
        description: newFlagData.description || undefined,
        flagType: newFlagData.type,
        defaultValue: newFlagData.defaultValue,
      });
      
      const newFlag = response.data.featureFlag || response.data;
      setFeatureFlags((prev) => [newFlag, ...prev]);
      setCreateSuccess('Feature flag created successfully!');
      
      // Reset form and close modal after a brief delay
      setTimeout(() => {
        setNewFlagData({
          name: '',
          key: '',
          description: '',
          type: 'BOOLEAN',
          defaultValue: 'false',
          projectId: '',
          environmentId: '',
        });
        setIsModalOpen(false);
        setCreateSuccess(null);
      }, 1500);
    } catch (err: any) {
      console.error('Failed to create feature flag:', err);
      setCreateError(err.response?.data?.message || 'Failed to create feature flag. Please try again.');
    } finally {
      setIsCreating(false);
    }
  };

  const toggleFlag = async (flagId: string, currentValue: boolean, environmentId?: string) => {
    if (!isValidObjectId(flagId)) {
      console.error('Invalid flagId:', flagId);
      return;
    }
    
    // Get the effective environment ID
    const effectiveEnvId = environmentId || selectedEnvironment;
    if (!effectiveEnvId || effectiveEnvId === 'all') {
      alert('Please select a specific environment to toggle flags');
      return;
    }
    
    setTogglingFlags((prev) => new Set(prev).add(flagId));
    try {
      await api.post(`/feature-flags/${flagId}/toggle`, {
        environmentId: effectiveEnvId,
        enabled: !currentValue,
      });
      setFeatureFlags((prev) =>
        prev.map((flag) =>
          flag.id === flagId ? { ...flag, isEnabled: !currentValue } : flag
        )
      );
    } catch (error) {
      console.error('Failed to toggle feature flag:', error);
      alert('Failed to toggle feature flag. Please try again.');
    } finally {
      setTogglingFlags((prev) => {
        const next = new Set(prev);
        next.delete(flagId);
        return next;
      });
    }
  };

  const deleteFeatureFlag = async (flagId: string) => {
    if (!confirm('Are you sure you want to delete this feature flag? This action cannot be undone.')) {
      return;
    }
    
    setIsDeleting(flagId);
    try {
      await api.delete(`/feature-flags/${flagId}`);
      setFeatureFlags((prev) => prev.filter((flag) => flag.id !== flagId));
    } catch (err: any) {
      console.error('Failed to delete feature flag:', err);
      alert(err.response?.data?.message || 'Failed to delete feature flag. Please try again.');
    } finally {
      setIsDeleting(null);
    }
  };

  // Auto-generate key from name
  const handleNameChange = (name: string) => {
    setNewFlagData((prev) => ({
      ...prev,
      name,
      key: name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, ''),
    }));
  };

  // Get available environments for selected project
  const selectedProjectData = projects.find((p) => p.id === newFlagData.projectId);
  const availableEnvironments = selectedProjectData?.environments || [];

  const projectNames = Array.from(
    new Set(featureFlags.map((f) => f.projectName))
  );
  const environments = Array.from(
    new Set(featureFlags.map((f) => f.environmentName))
  );

  const filteredFlags = featureFlags.filter((flag) => {
    const matchesSearch =
      flag.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      flag.key.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesProject =
      selectedProject === 'all' || flag.projectId === selectedProject;
    const matchesEnvironment =
      selectedEnvironment === 'all' || flag.environmentId === selectedEnvironment;
    return matchesSearch && matchesProject && matchesEnvironment;
  });

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'BOOLEAN':
        return 'bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-400 ring-1 ring-inset ring-blue-700/10 dark:ring-blue-400/20';
      case 'STRING':
        return 'bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-400 ring-1 ring-inset ring-green-600/20 dark:ring-green-400/20';
      case 'NUMBER':
        return 'bg-purple-50 text-purple-700 dark:bg-purple-950 dark:text-purple-400 ring-1 ring-inset ring-purple-700/10 dark:ring-purple-400/20';
      case 'JSON':
        return 'bg-orange-50 text-orange-700 dark:bg-orange-950 dark:text-orange-400 ring-1 ring-inset ring-orange-700/10 dark:ring-orange-400/20';
      default:
        return 'bg-muted text-foreground ring-1 ring-inset ring-border';
    }
  };

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="md:flex md:items-center md:justify-between">
        <div className="min-w-0 flex-1">
          <h2 className="text-2xl font-bold leading-7 text-foreground sm:truncate sm:text-3xl sm:tracking-tight">
            Feature Flags
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage feature flags across your projects and environments
          </p>
        </div>
        <div className="mt-4 flex md:ml-4 md:mt-0">
          <button
            onClick={() => setIsModalOpen(true)}
            className="inline-flex items-center rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground shadow-sm hover:bg-primary/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            <PlusIcon className="-ml-0.5 mr-1.5 h-5 w-5" />
            New Feature Flag
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <div className="relative flex-1 max-w-lg">
          <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
            <MagnifyingGlassIcon className="h-5 w-5 text-muted-foreground" />
          </div>
          <input
            type="search"
            id="search"
            placeholder="Search feature flags..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="block w-full rounded-md border border-input bg-background pl-10 shadow-sm focus:border-primary focus:ring-primary sm:text-sm"
          />
        </div>
        <div className="flex items-center space-x-2">
          <FunnelIcon className="h-5 w-5 text-muted-foreground" />
          <select
            value={selectedProject}
            onChange={(e) => {
              setSelectedProject(e.target.value);
              if (e.target.value !== 'all') {
                setSearchParams({ project: e.target.value });
              } else {
                setSearchParams({});
              }
            }}
            className="rounded-md border border-input bg-background shadow-sm focus:border-primary focus:ring-primary sm:text-sm"
          >
            <option value="all">All Projects</option>
            {projectNames.map((project) => (
              <option key={project} value={project}>
                {project}
              </option>
            ))}
          </select>
          <select
            value={selectedEnvironment}
            onChange={(e) => setSelectedEnvironment(e.target.value)}
            className="rounded-md border border-input bg-background shadow-sm focus:border-primary focus:ring-primary sm:text-sm"
          >
            <option value="all">All Environments</option>
            {environments.map((env) => (
              <option key={env} value={env}>
                {env}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Create Feature Flag Modal */}
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
                <Dialog.Panel className="w-full max-w-lg transform overflow-hidden rounded-lg bg-background p-6 text-left align-middle shadow-xl transition-all border border-border">
                  <div className="flex items-center justify-between mb-4">
                    <Dialog.Title
                      as="h3"
                      className="text-lg font-semibold leading-6 text-foreground"
                    >
                      Create New Feature Flag
                    </Dialog.Title>
                    <button
                      onClick={() => setIsModalOpen(false)}
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
                      <p className="text-sm text-green-700 dark:text-green-400">{createSuccess}</p>
                    </div>
                  )}

                  <form onSubmit={createFeatureFlag} className="space-y-4">
                    <div>
                      <label htmlFor="flag-project" className="block text-sm font-medium text-foreground">
                        Project <span className="text-destructive">*</span>
                      </label>
                      <select
                        id="flag-project"
                        value={newFlagData.projectId}
                        onChange={(e) => setNewFlagData({ ...newFlagData, projectId: e.target.value, environmentId: '' })}
                        className="mt-1 block w-full rounded-md border border-input bg-background shadow-sm focus:border-primary focus:ring-primary sm:text-sm"
                        required
                        disabled={isCreating}
                      >
                        <option value="">Select a project</option>
                        {projects.map((project) => (
                          <option key={project.id} value={project.id}>
                            {project.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label htmlFor="flag-environment" className="block text-sm font-medium text-foreground">
                        Environment
                      </label>
                      <select
                        id="flag-environment"
                        value={newFlagData.environmentId}
                        onChange={(e) => setNewFlagData({ ...newFlagData, environmentId: e.target.value })}
                        className="mt-1 block w-full rounded-md border border-input bg-background shadow-sm focus:border-primary focus:ring-primary sm:text-sm"
                        disabled={isCreating || !newFlagData.projectId || availableEnvironments.length === 0}
                      >
                        <option value="">
                          {availableEnvironments.length === 0 ? 'Default environment' : 'Select environment'}
                        </option>
                        {availableEnvironments.map((env) => (
                          <option key={env.id} value={env.id}>
                            {env.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label htmlFor="flag-name" className="block text-sm font-medium text-foreground">
                        Flag Name <span className="text-destructive">*</span>
                      </label>
                      <input
                        type="text"
                        id="flag-name"
                        value={newFlagData.name}
                        onChange={(e) => handleNameChange(e.target.value)}
                        className="mt-1 block w-full rounded-md border border-input bg-background shadow-sm focus:border-primary focus:ring-primary sm:text-sm"
                        placeholder="e.g., Dark Mode"
                        required
                        disabled={isCreating}
                      />
                    </div>

                    <div>
                      <label htmlFor="flag-key" className="block text-sm font-medium text-foreground">
                        Key <span className="text-destructive">*</span>
                      </label>
                      <input
                        type="text"
                        id="flag-key"
                        value={newFlagData.key}
                        onChange={(e) => setNewFlagData({ ...newFlagData, key: e.target.value })}
                        className="mt-1 block w-full rounded-md border border-input bg-background shadow-sm focus:border-primary focus:ring-primary sm:text-sm"
                        placeholder="dark_mode"
                        required
                        disabled={isCreating}
                      />
                      <p className="mt-1 text-xs text-muted-foreground">
                        Used in code to reference this flag. Auto-generated from name.
                      </p>
                    </div>

                    <div>
                      <label htmlFor="flag-type" className="block text-sm font-medium text-foreground">
                        Type
                      </label>
                      <select
                        id="flag-type"
                        value={newFlagData.type}
                        onChange={(e) => {
                          const newType = e.target.value as FeatureFlag['type'];
                          let defaultValue = 'false';
                          if (newType === 'STRING') defaultValue = '';
                          else if (newType === 'NUMBER') defaultValue = '0';
                          else if (newType === 'JSON') defaultValue = '{}';
                          setNewFlagData({ ...newFlagData, type: newType, defaultValue });
                        }}
                        className="mt-1 block w-full rounded-md border border-input bg-background shadow-sm focus:border-primary focus:ring-primary sm:text-sm"
                        disabled={isCreating}
                      >
                        <option value="BOOLEAN">Boolean (true/false)</option>
                        <option value="STRING">String</option>
                        <option value="NUMBER">Number</option>
                        <option value="JSON">JSON</option>
                      </select>
                    </div>

                    <div>
                      <label htmlFor="flag-default" className="block text-sm font-medium text-foreground">
                        Default Value
                      </label>
                      {newFlagData.type === 'BOOLEAN' ? (
                        <select
                          id="flag-default"
                          value={newFlagData.defaultValue}
                          onChange={(e) => setNewFlagData({ ...newFlagData, defaultValue: e.target.value })}
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
                          onChange={(e) => setNewFlagData({ ...newFlagData, defaultValue: e.target.value })}
                          className="mt-1 block w-full rounded-md border border-input bg-background shadow-sm focus:border-primary focus:ring-primary sm:text-sm"
                          placeholder={newFlagData.type === 'JSON' ? '{"enabled": true}' : 'Enter default value'}
                          disabled={isCreating}
                        />
                      )}
                    </div>

                    <div>
                      <label htmlFor="flag-description" className="block text-sm font-medium text-foreground">
                        Description
                      </label>
                      <textarea
                        id="flag-description"
                        value={newFlagData.description}
                        onChange={(e) => setNewFlagData({ ...newFlagData, description: e.target.value })}
                        rows={2}
                        className="mt-1 block w-full rounded-md border border-input bg-background shadow-sm focus:border-primary focus:ring-primary sm:text-sm"
                        placeholder="Brief description of this feature flag"
                        disabled={isCreating}
                      />
                    </div>

                    <div className="mt-6 flex justify-end space-x-3">
                      <button
                        type="button"
                        onClick={() => setIsModalOpen(false)}
                        disabled={isCreating}
                        className="rounded-md bg-background px-3 py-2 text-sm font-semibold text-foreground shadow-sm ring-1 ring-inset ring-border hover:bg-muted disabled:opacity-50"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={isCreating || !newFlagData.name || !newFlagData.key || !newFlagData.projectId}
                        className="rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground shadow-sm hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {isCreating ? 'Creating...' : 'Create Feature Flag'}
                      </button>
                    </div>
                  </form>
                </Dialog.Panel>
              </Transition.Child>
            </div>
          </div>
        </Dialog>
      </Transition>

      {/* Feature flags list */}
      {isLoading ? (
        <div className="rounded-lg bg-card shadow border border-border">
          <div className="divide-y divide-border">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="p-6 animate-pulse">
                <div className="flex items-center justify-between">
                  <div className="h-6 w-48 bg-muted rounded" />
                  <div className="h-6 w-20 bg-muted rounded" />
                </div>
                <div className="mt-2 h-4 w-32 bg-muted rounded" />
              </div>
            ))}
          </div>
        </div>
      ) : filteredFlags.length === 0 ? (
        <div className="rounded-lg border-2 border-dashed border-border p-12 text-center">
          <FlagIcon className="mx-auto h-12 w-12 text-muted-foreground" />
          <h3 className="mt-2 text-sm font-semibold text-foreground">
            No feature flags
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Get started by creating a new feature flag.
          </p>
          <div className="mt-6">
            <button
              onClick={() => setIsModalOpen(true)}
              className="inline-flex items-center rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground shadow-sm hover:bg-primary/90"
            >
              <PlusIcon className="-ml-0.5 mr-1.5 h-5 w-5" />
              New Feature Flag
            </button>
          </div>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg bg-card shadow border border-border">
          <div className="divide-y divide-border">
            {filteredFlags.map((flag) => (
              <div
                key={flag.id}
                className="flex items-center justify-between p-6 hover:bg-muted/50 transition-colors"
              >
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
                        On
                      </span>
                    ) : (
                      <span className="inline-flex items-center rounded-full bg-gray-100 dark:bg-gray-800 px-2.5 py-0.5 text-xs font-medium text-gray-600 dark:text-gray-300 ring-1 ring-inset ring-gray-500/10 dark:ring-gray-400/20">
                        <XCircleIcon className="mr-1 h-3 w-3" />
                        Off
                      </span>
                    )}
                  </div>

                  <div className="mt-1 flex items-center space-x-4 text-sm text-muted-foreground">
                    <code className="text-xs bg-muted px-2 py-0.5 rounded">
                      {flag.key}
                    </code>
                    <span>•</span>
                    <span>{flag.projectName}</span>
                    <span>•</span>
                    <span>{flag.environmentName}</span>
                  </div>

                  {flag.description && (
                    <p className="mt-1 text-sm text-muted-foreground line-clamp-1">
                      {flag.description}
                    </p>
                  )}

                  <div className="mt-2 flex items-center text-xs text-muted-foreground">
                    <ClockIcon className="mr-1 h-3 w-3" />
                    Updated {formatDate(flag.updatedAt)}
                  </div>
                </div>

                <div className="ml-4 flex items-center space-x-4">
                  <Switch
                    checked={flag.isEnabled}
                    onChange={() => toggleFlag(flag.id, flag.isEnabled, flag.environmentId)}
                    disabled={togglingFlags.has(flag.id) || selectedEnvironment === 'all'}
                    className={clsx(
                      flag.isEnabled ? 'bg-primary' : 'bg-gray-200 dark:bg-gray-700',
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
                                Edit
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
                                Duplicate
                              </button>
                            )}
                          </Menu.Item>
                          <div className="border-t border-border">
                            <Menu.Item>
                              {({ active }) => (
                                <button
                                  onClick={() => deleteFeatureFlag(flag.id)}
                                  disabled={isDeleting === flag.id}
                                  className={clsx(
                                    active
                                      ? 'bg-muted text-destructive'
                                      : 'text-destructive',
                                    'block w-full px-4 py-2 text-left text-sm disabled:opacity-50'
                                  )}
                                >
                                  <span className="flex items-center">
                                    <TrashIcon className="mr-2 h-4 w-4" />
                                    {isDeleting === flag.id ? 'Deleting...' : 'Delete'}
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
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
