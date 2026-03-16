import { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import {
  FlagIcon,
  ArrowLeftIcon,
  TrashIcon,
  CheckCircleIcon,
  XCircleIcon,
  PlusIcon,
  CodeBracketIcon,
  DocumentDuplicateIcon,
  ClockIcon,
  BeakerIcon,
  UsersIcon,
} from '@heroicons/react/24/outline';
import { Switch } from '@headlessui/react';
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
  projectId: string;
  projectName: string;
  createdAt: string;
  updatedAt: string;
}

interface EnvironmentState {
  id: string;
  name: string;
  isEnabled: boolean;
  defaultValue: boolean | string | number | object;
}

interface TargetingRule {
  id: string;
  name: string;
  operator: 'EQUALS' | 'NOT_EQUALS' | 'CONTAINS' | 'IN' | 'NOT_IN' | 'GREATER_THAN' | 'LESS_THAN';
  attribute: string;
  value: string;
  isEnabled: boolean;
}

export default function FeatureFlagDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  // Validate flagId early
  const flagId = isValidObjectId(id) ? id : null;

  const [flag, setFlag] = useState<FeatureFlag | null>(null);
  const [environmentStates, setEnvironmentStates] = useState<EnvironmentState[]>([]);
  const [targetingRules, setTargetingRules] = useState<TargetingRule[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<'overview' | 'targeting' | 'history'>('overview');
  const [showNewRuleForm, setShowNewRuleForm] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editDefaultValue, setEditDefaultValue] = useState<string>('');
  const [editEnvironmentId, setEditEnvironmentId] = useState<string>('');
  const [newRule, setNewRule] = useState({
    name: '',
    attribute: '',
    operator: 'EQUALS' as TargetingRule['operator'],
    value: '',
  });

  useEffect(() => {
    // Skip fetch if flagId is invalid
    if (!flagId) {
      setIsLoading(false);
      return;
    }

    const fetchData = async () => {
      try {
        const [flagRes, envStatesRes, rulesRes] = await Promise.all([
          api.get(`/feature-flags/${flagId}`),
          api.get(`/feature-flags/${flagId}/environments`),
          api.get(`/feature-flags/${flagId}/targeting-rules`),
        ]);
        setFlag(flagRes.data.featureFlag);
        setEnvironmentStates(envStatesRes.data.environments);
        setTargetingRules(rulesRes.data.rules);
      } catch (error) {
        console.error('Failed to fetch feature flag data:', error);
        // Mock data for development
        setFlag({
          id: flagId,
          name: 'Dark Mode',
          key: 'dark-mode',
          description: 'Enable dark mode for the UI across all platforms',
          type: 'BOOLEAN',
          projectId: '1',
          projectName: 'Web Application',
          createdAt: '2024-01-05T00:00:00Z',
          updatedAt: '2024-01-15T10:30:00Z',
        });
        setEnvironmentStates([
          {
            id: '1',
            name: 'Development',
            isEnabled: true,
            defaultValue: true,
          },
          {
            id: '2',
            name: 'Staging',
            isEnabled: true,
            defaultValue: false,
          },
          {
            id: '3',
            name: 'Production',
            isEnabled: false,
            defaultValue: false,
          },
        ]);
        setTargetingRules([
          {
            id: '1',
            name: 'Beta Users',
            attribute: 'userGroup',
            operator: 'EQUALS',
            value: 'beta',
            isEnabled: true,
          },
          {
            id: '2',
            name: 'Internal Users',
            attribute: 'email',
            operator: 'CONTAINS',
            value: '@company.com',
            isEnabled: true,
          },
        ]);
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [flagId]);

  const handleToggleEnvironment = async (envId: string, currentValue: boolean) => {
    if (!flagId || !isValidObjectId(envId)) {
      console.error('Invalid flagId or envId:', flagId, envId);
      return;
    }
    try {
      await api.patch(`/feature-flags/${flagId}/environments/${envId}`, {
        isEnabled: !currentValue,
      });
      setEnvironmentStates((prev) =>
        prev.map((env) =>
          env.id === envId ? { ...env, isEnabled: !currentValue } : env
        )
      );
    } catch (error) {
      console.error('Failed to toggle environment:', error);
    }
  };

  // const handleDefaultValueChange = async (
  //   envId: string,
  //   value: boolean | string | number
  // ) => {
  //   try {
  //     await api.patch(`/feature-flags/${id}/environments/${envId}`, {
  //       defaultValue: value,
  //     });
  //     setEnvironmentStates((prev) =>
  //       prev.map((env) =>
  //         env.id === envId ? { ...env, defaultValue: value } : env
  //       )
  //     );
  //   } catch (error) {
  //     console.error('Failed to update default value:', error);
  //   }
  // };

  const handleDelete = async () => {
    if (!flagId) return;
    if (!confirm('Are you sure you want to delete this feature flag?')) return;
    try {
      await api.delete(`/feature-flags/${flagId}`);
      navigate('/feature-flags');
    } catch (error) {
      console.error('Failed to delete feature flag:', error);
    }
  };

  const handleAddRule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!flagId) return;
    setIsSaving(true);
    try {
      const response = await api.post(`/feature-flags/${flagId}/targeting-rules`, newRule);
      setTargetingRules([...targetingRules, response.data.rule]);
      setNewRule({ name: '', attribute: '', operator: 'EQUALS', value: '' });
      setShowNewRuleForm(false);
    } catch (error) {
      console.error('Failed to add targeting rule:', error);
      // Mock: Add to local state
      setTargetingRules([
        ...targetingRules,
        {
          id: String(Date.now()),
          ...newRule,
          isEnabled: true,
        },
      ]);
      setNewRule({ name: '', attribute: '', operator: 'EQUALS', value: '' });
      setShowNewRuleForm(false);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteRule = async (ruleId: string) => {
    if (!flagId || !isValidObjectId(ruleId)) {
      console.error('Invalid flagId or ruleId:', flagId, ruleId);
      return;
    }
    if (!confirm('Are you sure you want to delete this rule?')) return;
    try {
      await api.delete(`/feature-flags/${flagId}/targeting-rules/${ruleId}`);
      setTargetingRules(targetingRules.filter((r) => r.id !== ruleId));
    } catch (error) {
      console.error('Failed to delete targeting rule:', error);
    }
  };

  const handleToggleRule = async (ruleId: string, currentValue: boolean) => {
    if (!flagId || !isValidObjectId(ruleId)) {
      console.error('Invalid flagId or ruleId:', flagId, ruleId);
      return;
    }
    try {
      await api.patch(`/feature-flags/${flagId}/targeting-rules/${ruleId}`, {
        isEnabled: !currentValue,
      });
      setTargetingRules((prev) =>
        prev.map((rule) =>
          rule.id === ruleId ? { ...rule, isEnabled: !currentValue } : rule
        )
      );
    } catch (error) {
      console.error('Failed to toggle rule:', error);
    }
  };

  const copyKeyToClipboard = () => {
    if (flag?.key) {
      navigator.clipboard.writeText(flag.key);
    }
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

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="animate-pulse">
          <div className="h-8 w-64 bg-muted rounded" />
          <div className="mt-2 h-4 w-96 bg-muted rounded" />
        </div>
        <div className="bg-card shadow rounded-lg animate-pulse border border-border">
          <div className="p-6 space-y-4">
            <div className="h-10 w-full bg-muted rounded" />
            <div className="h-10 w-full bg-muted rounded" />
          </div>
        </div>
      </div>
    );
  }

  if (!flag) {
    return (
      <div className="text-center py-12">
        <FlagIcon className="mx-auto h-12 w-12 text-muted-foreground" />
        <h3 className="mt-2 text-sm font-semibold text-foreground">
          Feature flag not found
        </h3>
        <div className="mt-6">
          <Link
            to="/feature-flags"
            className="inline-flex items-center text-primary hover:text-primary/80"
          >
            <ArrowLeftIcon className="mr-2 h-4 w-4" />
            Back to feature flags
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
          to="/feature-flags"
          className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeftIcon className="mr-1 h-4 w-4" />
          Back to feature flags
        </Link>
        <div className="mt-2 md:flex md:items-center md:justify-between">
          <div className="min-w-0 flex-1">
            <div className="flex items-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
                <FlagIcon className="h-6 w-6 text-primary" />
              </div>
              <div className="ml-4">
                <div className="flex items-center space-x-3">
                  <h2 className="text-2xl font-bold leading-7 text-foreground sm:text-3xl">
                    {flag.name}
                  </h2>
                  <span
                    className={clsx(
                      'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
                      getTypeColor(flag.type)
                    )}
                  >
                    {flag.type}
                  </span>
                </div>
                <div className="flex items-center space-x-2 text-sm text-muted-foreground mt-1">
                  <code className="bg-muted px-2 py-0.5 rounded text-xs">
                    {flag.key}
                  </code>
                  <button
                    onClick={copyKeyToClipboard}
                    className="text-muted-foreground hover:text-foreground"
                    title="Copy to clipboard"
                  >
                    <DocumentDuplicateIcon className="h-4 w-4" />
                  </button>
                  <span>•</span>
                  <Link
                    to={`/projects/${flag.projectId}`}
                    className="hover:text-primary"
                  >
                    {flag.projectName}
                  </Link>
                </div>
              </div>
            </div>
          </div>
          <div className="mt-4 flex md:ml-4 md:mt-0 space-x-3">
            <button
              onClick={handleDelete}
              className="inline-flex items-center rounded-md bg-background px-3 py-2 text-sm font-semibold text-destructive shadow-sm ring-1 ring-inset ring-border hover:bg-destructive/10"
            >
              <TrashIcon className="-ml-0.5 mr-1.5 h-5 w-5" />
              Delete
            </button>
            <button
              onClick={() => {
                setEditName(flag?.name || '');
                setEditDescription(flag?.description || '');
                setEditEnvironmentId(environmentStates[0]?.id || '');
                setEditDefaultValue(String(environmentStates[0]?.defaultValue || ''));
                setIsEditing(true);
              }}
              className="inline-flex items-center rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground shadow-sm hover:bg-primary/90"
            >
              Edit Flag
            </button>
          </div>
        </div>
        {flag.description && !isEditing && (
          <p className="mt-4 text-sm text-muted-foreground max-w-3xl">{flag.description}</p>
        )}
        
        {/* Edit Form */}
        {isEditing && flag && (
          <div className="mt-4 bg-muted p-4 rounded-lg border border-border">
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-foreground">Flag Name</label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="mt-1 block w-full rounded-md border border-input bg-background shadow-sm focus:border-primary focus:ring-primary sm:text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground">Description</label>
                <textarea
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  rows={2}
                  className="mt-1 block w-full rounded-md border border-input bg-background shadow-sm focus:border-primary focus:ring-primary sm:text-sm"
                />
              </div>
              
              {/* Edit Default Value per Environment */}
              <div className="border-t border-border pt-4">
                <h4 className="text-sm font-medium text-foreground mb-3">Edit Default Value</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm text-muted-foreground">Environment</label>
                    <select
                      value={editEnvironmentId}
                      onChange={(e) => {
                        const envId = e.target.value;
                        setEditEnvironmentId(envId);
                        const env = environmentStates.find(es => es.id === envId);
                        setEditDefaultValue(String(env?.defaultValue || ''));
                      }}
                      className="mt-1 block w-full rounded-md border border-input bg-background shadow-sm focus:border-primary focus:ring-primary sm:text-sm"
                    >
                      {environmentStates.map((env) => (
                        <option key={env.id} value={env.id}>
                          {env.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm text-muted-foreground">
                      Default Value ({flag.type})
                    </label>
                    {flag.type === 'BOOLEAN' ? (
                      <select
                        value={editDefaultValue}
                        onChange={(e) => setEditDefaultValue(e.target.value)}
                        className="mt-1 block w-full rounded-md border border-input bg-background shadow-sm focus:border-primary focus:ring-primary sm:text-sm"
                      >
                        <option value="true">true</option>
                        <option value="false">false</option>
                      </select>
                    ) : flag.type === 'NUMBER' ? (
                      <input
                        type="number"
                        value={editDefaultValue}
                        onChange={(e) => setEditDefaultValue(e.target.value)}
                        className="mt-1 block w-full rounded-md border border-input bg-background shadow-sm focus:border-primary focus:ring-primary sm:text-sm"
                      />
                    ) : (
                      <input
                        type="text"
                        value={editDefaultValue}
                        onChange={(e) => setEditDefaultValue(e.target.value)}
                        placeholder={flag.type === 'JSON' ? '{"key": "value"}' : 'Enter value'}
                        className="mt-1 block w-full rounded-md border border-input bg-background shadow-sm focus:border-primary focus:ring-primary sm:text-sm"
                      />
                    )}
                  </div>
                </div>
              </div>

              <div className="flex justify-end space-x-3 pt-4 border-t border-border">
                <button
                  onClick={() => setIsEditing(false)}
                  className="rounded-md bg-background px-3 py-2 text-sm font-semibold text-foreground shadow-sm ring-1 ring-inset ring-border hover:bg-muted"
                >
                  Cancel
                </button>
                <button
                  onClick={async () => {
                    if (!flagId) return;
                    setIsSaving(true);
                    try {
                      // Update flag name/description
                      await api.patch(`/feature-flags/${flagId}`, {
                        name: editName,
                        description: editDescription,
                      });
                      
                      // Update default value for selected environment
                      if (editEnvironmentId) {
                        await api.patch(`/feature-flags/${flagId}/environments/${editEnvironmentId}`, {
                          defaultValue: editDefaultValue,
                        });
                      }
                      
                      // Refresh data
                      const [flagRes, envStatesRes] = await Promise.all([
                        api.get(`/feature-flags/${flagId}`),
                        api.get(`/feature-flags/${flagId}/environments`),
                      ]);
                      setFlag(flagRes.data.featureFlag);
                      setEnvironmentStates(envStatesRes.data.environments);
                      setIsEditing(false);
                    } catch (error) {
                      console.error('Failed to update flag:', error);
                    } finally {
                      setIsSaving(false);
                    }
                  }}
                  disabled={isSaving || !editName}
                  className="rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground shadow-sm hover:bg-primary/90 disabled:opacity-50"
                >
                  {isSaving ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="border-b border-border">
        <nav className="-mb-px flex space-x-8">
          {[
            { id: 'overview', name: 'Overview', icon: CodeBracketIcon },
            { id: 'targeting', name: 'Targeting Rules', icon: UsersIcon },
            { id: 'history', name: 'History', icon: ClockIcon },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as typeof activeTab)}
              className={clsx(
                activeTab === tab.id
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:border-border hover:text-foreground',
                'group inline-flex items-center border-b-2 py-4 px-1 text-sm font-medium'
              )}
            >
              <tab.icon
                className={clsx(
                  activeTab === tab.id
                    ? 'text-primary'
                    : 'text-muted-foreground group-hover:text-muted-foreground',
                  '-ml-0.5 mr-2 h-5 w-5'
                )}
              />
              {tab.name}
            </button>
          ))}
        </nav>
      </div>

      {/* Overview Tab */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {/* Environment Toggles */}
          <div className="rounded-lg bg-card shadow border border-border">
            <div className="border-b border-border px-4 py-4 sm:px-6">
              <h3 className="text-base font-semibold text-foreground">
                Environment States
              </h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Toggle this flag on or off for each environment
              </p>
            </div>
            <div className="divide-y divide-border">
              {environmentStates.map((env) => (
                <div
                  key={env.id}
                  className="flex items-center justify-between px-4 py-4 sm:px-6"
                >
                  <div className="flex items-center">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
                      <BeakerIcon className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <div className="ml-4">
                      <p className="text-sm font-medium text-foreground">
                        {env.name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Value:{' '}
                        <code className="bg-muted px-1 rounded">
                          {typeof env.defaultValue === 'object'
                            ? JSON.stringify(env.defaultValue)
                            : String(env.defaultValue)}
                        </code>
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-4">
                    {env.isEnabled ? (
                      <span className="inline-flex items-center rounded-full bg-green-100 dark:bg-green-950 px-2.5 py-0.5 text-xs font-medium text-green-800 dark:text-green-400">
                        <CheckCircleIcon className="mr-1 h-3 w-3" />
                        Enabled
                      </span>
                    ) : (
                      <span className="inline-flex items-center rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
                        <XCircleIcon className="mr-1 h-3 w-3" />
                        Disabled
                      </span>
                    )}
                    <Switch
                      checked={env.isEnabled}
                      onChange={() =>
                        handleToggleEnvironment(env.id, env.isEnabled)
                      }
                      className={clsx(
                        env.isEnabled ? 'bg-primary' : 'bg-muted',
                        'relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2'
                      )}
                    >
                      <span
                        className={clsx(
                          env.isEnabled ? 'translate-x-5' : 'translate-x-0',
                          'pointer-events-none relative inline-block h-5 w-5 transform rounded-full bg-background shadow ring-0 transition duration-200 ease-in-out'
                        )}
                      />
                    </Switch>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* SDK Usage */}
          <div className="rounded-lg bg-card shadow border border-border">
            <div className="border-b border-border px-4 py-4 sm:px-6">
              <h3 className="text-base font-semibold text-foreground">
                SDK Usage
              </h3>
              <p className="mt-1 text-sm text-muted-foreground">
                How to use this flag in your code
              </p>
            </div>
            <div className="p-4 sm:p-6">
              <div className="space-y-4">
                <div>
                  <h4 className="text-sm font-medium text-foreground mb-2">
                    JavaScript/TypeScript
                  </h4>
                  <pre className="bg-gray-900 text-gray-100 rounded-lg p-4 overflow-x-auto">
                    <code>{`import { Togglely } from '@togglely/sdk';

const togglely = new Togglely({ apiKey: 'YOUR_API_KEY' });

// Check if feature is enabled
const isEnabled = await togglely.getBooleanFlag('${flag.key}');

if (isEnabled) {
  // Show new feature
} else {
  // Show old feature
}`}</code>
                  </pre>
                </div>
                <div>
                  <h4 className="text-sm font-medium text-foreground mb-2">
                    cURL
                  </h4>
                  <pre className="bg-gray-900 text-gray-100 rounded-lg p-4 overflow-x-auto">
                    <code>{`curl -X POST https://api.togglely.io/v1/evaluate \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "flagKey": "${flag.key}",
    "context": {
      "userId": "user-123",
      "email": "user@example.com"
    }
  }'`}</code>
                  </pre>
                </div>
              </div>
            </div>
          </div>

          {/* Metadata */}
          <div className="rounded-lg bg-card shadow border border-border">
            <div className="border-b border-border px-4 py-4 sm:px-6">
              <h3 className="text-base font-semibold text-foreground">
                Metadata
              </h3>
            </div>
            <div className="px-4 py-4 sm:px-6">
              <dl className="grid grid-cols-1 gap-x-4 gap-y-6 sm:grid-cols-2">
                <div>
                  <dt className="text-sm font-medium text-muted-foreground">Created</dt>
                  <dd className="mt-1 text-sm text-foreground">
                    {formatDate(flag.createdAt)}
                  </dd>
                </div>
                <div>
                  <dt className="text-sm font-medium text-muted-foreground">
                    Last Updated
                  </dt>
                  <dd className="mt-1 text-sm text-foreground">
                    {formatDate(flag.updatedAt)}
                  </dd>
                </div>
                <div>
                  <dt className="text-sm font-medium text-muted-foreground">Flag ID</dt>
                  <dd className="mt-1 text-sm text-foreground font-mono">
                    {flag.id}
                  </dd>
                </div>
                <div>
                  <dt className="text-sm font-medium text-muted-foreground">Type</dt>
                  <dd className="mt-1 text-sm text-foreground">{flag.type}</dd>
                </div>
              </dl>
            </div>
          </div>
        </div>
      )}

      {/* Targeting Rules Tab */}
      {activeTab === 'targeting' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-semibold text-foreground">
                Targeting Rules
              </h3>
              <p className="text-sm text-muted-foreground">
                Define rules to target specific users or contexts
              </p>
            </div>
            <button
              onClick={() => setShowNewRuleForm(!showNewRuleForm)}
              className="inline-flex items-center rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground shadow-sm hover:bg-primary/90"
            >
              <PlusIcon className="-ml-0.5 mr-1.5 h-4 w-4" />
              Add Rule
            </button>
          </div>

          {/* New Rule Form */}
          {showNewRuleForm && (
            <div className="rounded-lg bg-muted p-4 border border-border">
              <form onSubmit={handleAddRule} className="space-y-4">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label className="block text-sm font-medium text-foreground">
                      Rule Name
                    </label>
                    <input
                      type="text"
                      value={newRule.name}
                      onChange={(e) =>
                        setNewRule({ ...newRule, name: e.target.value })
                      }
                      placeholder="e.g., Beta Users"
                      className="mt-1 block w-full rounded-md border border-input bg-background shadow-sm focus:border-primary focus:ring-primary sm:text-sm"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-foreground">
                      Attribute
                    </label>
                    <input
                      type="text"
                      value={newRule.attribute}
                      onChange={(e) =>
                        setNewRule({ ...newRule, attribute: e.target.value })
                      }
                      placeholder="e.g., userGroup, email, country"
                      className="mt-1 block w-full rounded-md border border-input bg-background shadow-sm focus:border-primary focus:ring-primary sm:text-sm"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-foreground">
                      Operator
                    </label>
                    <select
                      value={newRule.operator}
                      onChange={(e) =>
                        setNewRule({
                          ...newRule,
                          operator: e.target.value as TargetingRule['operator'],
                        })
                      }
                      className="mt-1 block w-full rounded-md border border-input bg-background shadow-sm focus:border-primary focus:ring-primary sm:text-sm"
                    >
                      <option value="EQUALS">equals</option>
                      <option value="NOT_EQUALS">not equals</option>
                      <option value="CONTAINS">contains</option>
                      <option value="IN">in</option>
                      <option value="NOT_IN">not in</option>
                      <option value="GREATER_THAN">greater than</option>
                      <option value="LESS_THAN">less than</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-foreground">
                      Value
                    </label>
                    <input
                      type="text"
                      value={newRule.value}
                      onChange={(e) =>
                        setNewRule({ ...newRule, value: e.target.value })
                      }
                      placeholder="e.g., beta, @company.com"
                      className="mt-1 block w-full rounded-md border border-input bg-background shadow-sm focus:border-primary focus:ring-primary sm:text-sm"
                      required
                    />
                  </div>
                </div>
                <div className="flex justify-end space-x-3">
                  <button
                    type="button"
                    onClick={() => setShowNewRuleForm(false)}
                    className="rounded-md bg-background px-3 py-2 text-sm font-semibold text-foreground shadow-sm ring-1 ring-inset ring-border hover:bg-muted"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSaving}
                    className="rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground shadow-sm hover:bg-primary/90 disabled:opacity-50"
                  >
                    {isSaving ? 'Saving...' : 'Add Rule'}
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* Rules List */}
          {targetingRules.length === 0 ? (
            <div className="rounded-lg border-2 border-dashed border-border p-12 text-center">
              <UsersIcon className="mx-auto h-12 w-12 text-muted-foreground" />
              <h3 className="mt-2 text-sm font-semibold text-foreground">
                No targeting rules
              </h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Add rules to target specific users or contexts.
              </p>
            </div>
          ) : (
            <div className="overflow-hidden rounded-lg bg-card shadow border border-border">
              <div className="divide-y divide-border">
                {targetingRules.map((rule) => (
                  <div
                    key={rule.id}
                    className="flex items-center justify-between p-6 hover:bg-muted/50"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center space-x-3">
                        <h4 className="text-sm font-medium text-foreground">
                          {rule.name}
                        </h4>
                        {rule.isEnabled ? (
                          <span className="inline-flex items-center rounded-full bg-green-100 dark:bg-green-950 px-2 py-0.5 text-xs font-medium text-green-800 dark:text-green-400">
                            Active
                          </span>
                        ) : (
                          <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                            Inactive
                          </span>
                        )}
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">
                        <code className="bg-muted px-1.5 py-0.5 rounded text-xs">
                          {rule.attribute}
                        </code>{' '}
                        <span className="text-primary font-medium">
                          {rule.operator.toLowerCase().replace('_', ' ')}
                        </span>{' '}
                        <code className="bg-muted px-1.5 py-0.5 rounded text-xs">
                          {rule.value}
                        </code>
                      </p>
                    </div>
                    <div className="ml-4 flex items-center space-x-3">
                      <Switch
                        checked={rule.isEnabled}
                        onChange={() =>
                          handleToggleRule(rule.id, rule.isEnabled)
                        }
                        className={clsx(
                          rule.isEnabled ? 'bg-primary' : 'bg-muted',
                          'relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2'
                        )}
                      >
                        <span
                          className={clsx(
                            rule.isEnabled ? 'translate-x-4' : 'translate-x-0',
                            'pointer-events-none relative inline-block h-4 w-4 transform rounded-full bg-background shadow ring-0 transition duration-200 ease-in-out'
                          )}
                        />
                      </Switch>
                      <button
                        onClick={() => handleDeleteRule(rule.id)}
                        className="text-muted-foreground hover:text-destructive"
                        title="Delete rule"
                      >
                        <TrashIcon className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* History Tab */}
      {activeTab === 'history' && (
        <div className="rounded-lg bg-card shadow border border-border">
          <div className="border-b border-border px-4 py-4 sm:px-6">
            <h3 className="text-base font-semibold text-foreground">
              Change History
            </h3>
          </div>
          <div className="p-4 sm:p-6">
            <div className="flow-root">
              <ul className="-mb-8">
                {[
                  {
                    id: '1',
                    action: 'Flag updated',
                    description: 'Enabled flag in Production environment',
                    user: 'John Doe',
                    timestamp: '2024-01-15T10:30:00Z',
                  },
                  {
                    id: '2',
                    action: 'Targeting rule added',
                    description: 'Added rule: "Beta Users"',
                    user: 'Jane Smith',
                    timestamp: '2024-01-14T14:20:00Z',
                  },
                  {
                    id: '3',
                    action: 'Flag created',
                    description: 'Created feature flag "Dark Mode"',
                    user: 'John Doe',
                    timestamp: '2024-01-05T09:00:00Z',
                  },
                ].map((event, eventIdx) => (
                  <li key={event.id}>
                    <div className="relative pb-8">
                      {eventIdx !== 2 && (
                        <span
                          className="absolute top-4 left-4 -ml-px h-full w-0.5 bg-border"
                          aria-hidden="true"
                        />
                      )}
                      <div className="relative flex space-x-3">
                        <div>
                          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 ring-8 ring-card">
                            <ClockIcon className="h-4 w-4 text-primary" />
                          </span>
                        </div>
                        <div className="flex min-w-0 flex-1 justify-between space-x-4 pt-1.5">
                          <div>
                            <p className="text-sm text-foreground">
                              <span className="font-medium">{event.action}</span>{' '}
                              - {event.description}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              by {event.user}
                            </p>
                          </div>
                          <div className="whitespace-nowrap text-right text-sm text-muted-foreground">
                            {formatDate(event.timestamp)}
                          </div>
                        </div>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
