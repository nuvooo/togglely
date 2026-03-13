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
        return 'bg-blue-100 text-blue-800';
      case 'STRING':
        return 'bg-green-100 text-green-800';
      case 'NUMBER':
        return 'bg-purple-100 text-purple-800';
      case 'JSON':
        return 'bg-orange-100 text-orange-800';
      default:
        return 'bg-gray-100 text-gray-800';
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

  if (!flag) {
    return (
      <div className="text-center py-12">
        <FlagIcon className="mx-auto h-12 w-12 text-gray-400" />
        <h3 className="mt-2 text-sm font-semibold text-gray-900">
          Feature flag not found
        </h3>
        <div className="mt-6">
          <Link
            to="/feature-flags"
            className="inline-flex items-center text-primary-600 hover:text-primary-500"
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
          className="inline-flex items-center text-sm text-gray-500 hover:text-gray-700"
        >
          <ArrowLeftIcon className="mr-1 h-4 w-4" />
          Back to feature flags
        </Link>
        <div className="mt-2 md:flex md:items-center md:justify-between">
          <div className="min-w-0 flex-1">
            <div className="flex items-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-purple-100">
                <FlagIcon className="h-6 w-6 text-purple-600" />
              </div>
              <div className="ml-4">
                <div className="flex items-center space-x-3">
                  <h2 className="text-2xl font-bold leading-7 text-gray-900 sm:text-3xl">
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
                <div className="flex items-center space-x-2 text-sm text-gray-500 mt-1">
                  <code className="bg-gray-100 px-2 py-0.5 rounded text-xs">
                    {flag.key}
                  </code>
                  <button
                    onClick={copyKeyToClipboard}
                    className="text-gray-400 hover:text-gray-600"
                    title="Copy to clipboard"
                  >
                    <DocumentDuplicateIcon className="h-4 w-4" />
                  </button>
                  <span>•</span>
                  <Link
                    to={`/projects/${flag.projectId}`}
                    className="hover:text-primary-600"
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
              className="inline-flex items-center rounded-md bg-white px-3 py-2 text-sm font-semibold text-red-600 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-red-50"
            >
              <TrashIcon className="-ml-0.5 mr-1.5 h-5 w-5" />
              Delete
            </button>
            <Link
              to={`/feature-flags/${id}/edit`}
              className="inline-flex items-center rounded-md bg-primary-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-primary-700"
            >
              Edit Flag
            </Link>
          </div>
        </div>
        {flag.description && (
          <p className="mt-4 text-sm text-gray-600 max-w-3xl">{flag.description}</p>
        )}
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
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
                  ? 'border-primary-500 text-primary-600'
                  : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700',
                'group inline-flex items-center border-b-2 py-4 px-1 text-sm font-medium'
              )}
            >
              <tab.icon
                className={clsx(
                  activeTab === tab.id
                    ? 'text-primary-500'
                    : 'text-gray-400 group-hover:text-gray-500',
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
          <div className="rounded-lg bg-white shadow">
            <div className="border-b border-gray-200 px-4 py-4 sm:px-6">
              <h3 className="text-base font-semibold text-gray-900">
                Environment States
              </h3>
              <p className="mt-1 text-sm text-gray-500">
                Toggle this flag on or off for each environment
              </p>
            </div>
            <div className="divide-y divide-gray-200">
              {environmentStates.map((env) => (
                <div
                  key={env.id}
                  className="flex items-center justify-between px-4 py-4 sm:px-6"
                >
                  <div className="flex items-center">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gray-100">
                      <BeakerIcon className="h-5 w-5 text-gray-600" />
                    </div>
                    <div className="ml-4">
                      <p className="text-sm font-medium text-gray-900">
                        {env.name}
                      </p>
                      <p className="text-xs text-gray-500">
                        Default:{' '}
                        <code className="bg-gray-100 px-1 rounded">
                          {typeof env.defaultValue === 'object'
                            ? JSON.stringify(env.defaultValue)
                            : String(env.defaultValue)}
                        </code>
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-4">
                    {env.isEnabled ? (
                      <span className="inline-flex items-center rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800">
                        <CheckCircleIcon className="mr-1 h-3 w-3" />
                        Enabled
                      </span>
                    ) : (
                      <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-800">
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
                        env.isEnabled ? 'bg-primary-600' : 'bg-gray-200',
                        'relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2'
                      )}
                    >
                      <span
                        className={clsx(
                          env.isEnabled ? 'translate-x-5' : 'translate-x-0',
                          'pointer-events-none relative inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out'
                        )}
                      />
                    </Switch>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* SDK Usage */}
          <div className="rounded-lg bg-white shadow">
            <div className="border-b border-gray-200 px-4 py-4 sm:px-6">
              <h3 className="text-base font-semibold text-gray-900">
                SDK Usage
              </h3>
              <p className="mt-1 text-sm text-gray-500">
                How to use this flag in your code
              </p>
            </div>
            <div className="p-4 sm:p-6">
              <div className="space-y-4">
                <div>
                  <h4 className="text-sm font-medium text-gray-900 mb-2">
                    JavaScript/TypeScript
                  </h4>
                  <pre className="bg-gray-900 text-gray-100 rounded-lg p-4 overflow-x-auto">
                    <code>{`import { Flagify } from '@flagify/sdk';

const flagify = new Flagify({ apiKey: 'YOUR_API_KEY' });

// Check if feature is enabled
const isEnabled = await flagify.getBooleanFlag('${flag.key}');

if (isEnabled) {
  // Show new feature
} else {
  // Show old feature
}`}</code>
                  </pre>
                </div>
                <div>
                  <h4 className="text-sm font-medium text-gray-900 mb-2">
                    cURL
                  </h4>
                  <pre className="bg-gray-900 text-gray-100 rounded-lg p-4 overflow-x-auto">
                    <code>{`curl -X POST https://api.flagify.io/v1/evaluate \\
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
          <div className="rounded-lg bg-white shadow">
            <div className="border-b border-gray-200 px-4 py-4 sm:px-6">
              <h3 className="text-base font-semibold text-gray-900">
                Metadata
              </h3>
            </div>
            <div className="px-4 py-4 sm:px-6">
              <dl className="grid grid-cols-1 gap-x-4 gap-y-6 sm:grid-cols-2">
                <div>
                  <dt className="text-sm font-medium text-gray-500">Created</dt>
                  <dd className="mt-1 text-sm text-gray-900">
                    {formatDate(flag.createdAt)}
                  </dd>
                </div>
                <div>
                  <dt className="text-sm font-medium text-gray-500">
                    Last Updated
                  </dt>
                  <dd className="mt-1 text-sm text-gray-900">
                    {formatDate(flag.updatedAt)}
                  </dd>
                </div>
                <div>
                  <dt className="text-sm font-medium text-gray-500">Flag ID</dt>
                  <dd className="mt-1 text-sm text-gray-900 font-mono">
                    {flag.id}
                  </dd>
                </div>
                <div>
                  <dt className="text-sm font-medium text-gray-500">Type</dt>
                  <dd className="mt-1 text-sm text-gray-900">{flag.type}</dd>
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
              <h3 className="text-base font-semibold text-gray-900">
                Targeting Rules
              </h3>
              <p className="text-sm text-gray-500">
                Define rules to target specific users or contexts
              </p>
            </div>
            <button
              onClick={() => setShowNewRuleForm(!showNewRuleForm)}
              className="inline-flex items-center rounded-md bg-primary-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-primary-700"
            >
              <PlusIcon className="-ml-0.5 mr-1.5 h-4 w-4" />
              Add Rule
            </button>
          </div>

          {/* New Rule Form */}
          {showNewRuleForm && (
            <div className="rounded-lg bg-gray-50 p-4 border border-gray-200">
              <form onSubmit={handleAddRule} className="space-y-4">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label className="block text-sm font-medium text-gray-700">
                      Rule Name
                    </label>
                    <input
                      type="text"
                      value={newRule.name}
                      onChange={(e) =>
                        setNewRule({ ...newRule, name: e.target.value })
                      }
                      placeholder="e.g., Beta Users"
                      className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">
                      Attribute
                    </label>
                    <input
                      type="text"
                      value={newRule.attribute}
                      onChange={(e) =>
                        setNewRule({ ...newRule, attribute: e.target.value })
                      }
                      placeholder="e.g., userGroup, email, country"
                      className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">
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
                      className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
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
                    <label className="block text-sm font-medium text-gray-700">
                      Value
                    </label>
                    <input
                      type="text"
                      value={newRule.value}
                      onChange={(e) =>
                        setNewRule({ ...newRule, value: e.target.value })
                      }
                      placeholder="e.g., beta, @company.com"
                      className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
                      required
                    />
                  </div>
                </div>
                <div className="flex justify-end space-x-3">
                  <button
                    type="button"
                    onClick={() => setShowNewRuleForm(false)}
                    className="rounded-md bg-white px-3 py-2 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSaving}
                    className="rounded-md bg-primary-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-primary-700 disabled:opacity-50"
                  >
                    {isSaving ? 'Saving...' : 'Add Rule'}
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* Rules List */}
          {targetingRules.length === 0 ? (
            <div className="rounded-lg border-2 border-dashed border-gray-300 p-12 text-center">
              <UsersIcon className="mx-auto h-12 w-12 text-gray-400" />
              <h3 className="mt-2 text-sm font-semibold text-gray-900">
                No targeting rules
              </h3>
              <p className="mt-1 text-sm text-gray-500">
                Add rules to target specific users or contexts.
              </p>
            </div>
          ) : (
            <div className="overflow-hidden rounded-lg bg-white shadow">
              <div className="divide-y divide-gray-200">
                {targetingRules.map((rule) => (
                  <div
                    key={rule.id}
                    className="flex items-center justify-between p-6 hover:bg-gray-50"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center space-x-3">
                        <h4 className="text-sm font-medium text-gray-900">
                          {rule.name}
                        </h4>
                        {rule.isEnabled ? (
                          <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800">
                            Active
                          </span>
                        ) : (
                          <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-800">
                            Inactive
                          </span>
                        )}
                      </div>
                      <p className="mt-1 text-sm text-gray-500">
                        <code className="bg-gray-100 px-1.5 py-0.5 rounded text-xs">
                          {rule.attribute}
                        </code>{' '}
                        <span className="text-primary-600 font-medium">
                          {rule.operator.toLowerCase().replace('_', ' ')}
                        </span>{' '}
                        <code className="bg-gray-100 px-1.5 py-0.5 rounded text-xs">
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
                          rule.isEnabled ? 'bg-primary-600' : 'bg-gray-200',
                          'relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2'
                        )}
                      >
                        <span
                          className={clsx(
                            rule.isEnabled ? 'translate-x-4' : 'translate-x-0',
                            'pointer-events-none relative inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out'
                          )}
                        />
                      </Switch>
                      <button
                        onClick={() => handleDeleteRule(rule.id)}
                        className="text-gray-400 hover:text-red-600"
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
        <div className="rounded-lg bg-white shadow">
          <div className="border-b border-gray-200 px-4 py-4 sm:px-6">
            <h3 className="text-base font-semibold text-gray-900">
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
                          className="absolute top-4 left-4 -ml-px h-full w-0.5 bg-gray-200"
                          aria-hidden="true"
                        />
                      )}
                      <div className="relative flex space-x-3">
                        <div>
                          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary-100 ring-8 ring-white">
                            <ClockIcon className="h-4 w-4 text-primary-600" />
                          </span>
                        </div>
                        <div className="flex min-w-0 flex-1 justify-between space-x-4 pt-1.5">
                          <div>
                            <p className="text-sm text-gray-900">
                              <span className="font-medium">{event.action}</span>{' '}
                              - {event.description}
                            </p>
                            <p className="text-xs text-gray-500">
                              by {event.user}
                            </p>
                          </div>
                          <div className="whitespace-nowrap text-right text-sm text-gray-500">
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
