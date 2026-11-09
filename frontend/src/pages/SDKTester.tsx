import {
  ArrowLeftIcon,
  BeakerIcon,
  CheckIcon,
  CodeBracketIcon,
  DocumentDuplicateIcon,
  PlayIcon,
} from '@heroicons/react/24/outline'
import clsx from 'clsx'
import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import api from '@/lib/api'
import { projectPath, ROUTES } from '@/lib/routes'
import {
  buildSdkSnippet,
  fetchSdkFlags,
  type SdkContext,
  type SdkFlagResult,
} from '@/lib/sdk-tester'

interface Project {
  id: string
  name: string
  key: string
  environments: { id: string; name: string; key: string }[]
}

interface TestResult extends SdkFlagResult {
  flagKey: string
}

export default function SDKTester() {
  const [projects, setProjects] = useState<Project[]>([])
  const { projectId } = useParams<{ projectId: string }>()
  // The project from the route is preselected; the tester can still switch.
  const [selectedProject, setSelectedProject] = useState<string>(projectId ?? '')
  const [selectedEnvironment, setSelectedEnvironment] = useState<string>('')
  const [apiKey, setApiKey] = useState<string>('')
  // Flag shown in the generated code (defaults to the first tested flag)
  const [snippetFlagKey, setSnippetFlagKey] = useState<string>('')

  // Context attributes
  const [contextAttrs, setContextAttrs] = useState<
    { key: string; value: string }[]
  >([
    { key: 'userId', value: '' },
    { key: 'tenantId', value: '' },
  ])

  const [isLoading, setIsLoading] = useState(false)
  const [testResults, setTestResults] = useState<TestResult[]>([])
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    fetchProjects()
  }, [])

  // The route stays mounted when switching projects; drop the previous project's state.
  useEffect(() => {
    setSelectedProject(projectId ?? '')
    setSelectedEnvironment('')
    setTestResults([])
    setSnippetFlagKey('')
    setError(null)
  }, [projectId])

  const fetchProjects = async () => {
    try {
      const response = await api.get('/projects')
      const projectsWithEnvs = await Promise.all(
        response.data.projects.map(async (p: Project) => {
          const envRes = await api.get(`/projects/${p.id}/environments`)
          return { ...p, environments: envRes.data.environments }
        })
      )
      setProjects(projectsWithEnvs)
    } catch (error) {
      console.error('Failed to fetch projects:', error)
    }
  }

  const selectedProjectData = projects.find((p) => p.id === selectedProject)
  const environments = selectedProjectData?.environments || []

  // Preselect the first environment so a test can run right away
  useEffect(() => {
    if (!selectedEnvironment && environments.length > 0) {
      setSelectedEnvironment(environments[0].id)
    }
  }, [environments, selectedEnvironment])

  const addContextAttr = () => {
    setContextAttrs([...contextAttrs, { key: '', value: '' }])
  }

  const removeContextAttr = (index: number) => {
    setContextAttrs(contextAttrs.filter((_, i) => i !== index))
  }

  const updateContextAttr = (
    index: number,
    field: 'key' | 'value',
    value: string
  ) => {
    const newAttrs = [...contextAttrs]
    newAttrs[index][field] = value
    setContextAttrs(newAttrs)
  }

  const buildContext = (): SdkContext => {
    const context: SdkContext = {}
    contextAttrs.forEach(({ key, value }) => {
      if (key.trim()) {
        // Try to parse as number or boolean
        if (value === 'true') context[key] = true
        else if (value === 'false') context[key] = false
        else if (!isNaN(Number(value)) && value !== '')
          context[key] = Number(value)
        else context[key] = value
      }
    })
    return context
  }

  const environmentKey =
    environments.find((e) => e.id === selectedEnvironment)?.key || 'development'
  const snippetFlag =
    testResults.find((r) => r.flagKey === snippetFlagKey) ?? testResults[0] ?? null

  const generateCode = () =>
    buildSdkSnippet({
      apiKey,
      projectKey: selectedProjectData?.key || 'your-project',
      environmentKey,
      // Production serves /sdk on the same origin (nginx); in development
      // Vite proxies /sdk to the backend.
      baseUrl: window.location.origin,
      context: buildContext(),
      flag: snippetFlag ? { key: snippetFlag.flagKey, flagType: snippetFlag.flagType } : null,
    })

  const runTest = async () => {
    if (!selectedProjectData || !selectedEnvironment) {
      setError('Please select a project and environment')
      return
    }
    if (!apiKey.trim()) {
      setError('Enter an API key of this organization (Organization → API Keys)')
      return
    }

    setIsLoading(true)
    setError(null)
    setTestResults([])

    try {
      const flags = await fetchSdkFlags({
        projectKey: selectedProjectData.key,
        environmentKey,
        apiKey: apiKey.trim(),
        context: buildContext(),
      })
      const results = Object.entries(flags).map(([flagKey, result]) => ({
        flagKey,
        ...result,
      }))
      setTestResults(results)
      if (results.length === 0) setError('This project has no flags in this environment yet')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to run test')
    } finally {
      setIsLoading(false)
    }
  }

  const copyCode = () => {
    navigator.clipboard.writeText(generateCode())
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <Link
          to={projectId ? projectPath(projectId, 'flags') : ROUTES.overview}
          className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeftIcon className="mr-1 h-4 w-4" />
          Back to Feature Flags
        </Link>
        <div className="mt-2 flex items-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
            <BeakerIcon className="h-6 w-6 text-primary" />
          </div>
          <div className="ml-4">
            <h2 className="text-2xl font-bold leading-7 text-foreground sm:text-3xl">
              SDK Context Tester
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Test your feature flags with different context attributes
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Configuration Panel */}
        <div className="bg-card shadow rounded-lg border border-border p-6 space-y-6">
          <h3 className="text-lg font-medium text-foreground flex items-center">
            <CodeBracketIcon className="mr-2 h-5 w-5" />
            Configuration
          </h3>

          {/* Project & Environment */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-foreground">
                Project
              </label>
              <select
                value={selectedProject}
                onChange={(e) => {
                  setSelectedProject(e.target.value)
                  setSelectedEnvironment('')
                }}
                className="mt-1 block w-full rounded-md border border-input bg-background shadow-sm focus:border-primary focus:ring-primary sm:text-sm"
              >
                <option value="">Select project</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground">
                Environment
              </label>
              <select
                value={selectedEnvironment}
                onChange={(e) => setSelectedEnvironment(e.target.value)}
                disabled={!selectedProject}
                className="mt-1 block w-full rounded-md border border-input bg-background shadow-sm focus:border-primary focus:ring-primary sm:text-sm disabled:opacity-50"
              >
                <option value="">Select environment</option>
                {environments.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* API Key */}
          <div>
            <label className="block text-sm font-medium text-foreground">
              API Key
            </label>
            <input
              type="password"
              autoComplete="off"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="tk_..."
              className="mt-1 block w-full rounded-md border border-input bg-background shadow-sm focus:border-primary focus:ring-primary sm:text-sm"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              An API key of this project's organization. The test calls the
              same public SDK endpoint your application uses.
            </p>
          </div>

          {/* Context Attributes */}
          <div className="border-t border-border pt-4">
            <div className="flex items-center justify-between mb-3">
              <label className="block text-sm font-medium text-foreground">
                Context Attributes
              </label>
              <button
                onClick={addContextAttr}
                className="text-xs text-primary hover:text-primary/80"
              >
                + Add Attribute
              </button>
            </div>
            <p className="text-xs text-muted-foreground mb-3">
              These attributes are used for targeting rules (e.g., userId,
              tenantId, plan, country)
            </p>

            <div className="space-y-3">
              {contextAttrs.map((attr, index) => (
                <div key={index} className="flex items-center space-x-2">
                  <input
                    type="text"
                    value={attr.key}
                    onChange={(e) =>
                      updateContextAttr(index, 'key', e.target.value)
                    }
                    placeholder="Attribute name"
                    className="flex-1 rounded-md border border-input bg-background shadow-sm focus:border-primary focus:ring-primary sm:text-sm"
                  />
                  <input
                    type="text"
                    value={attr.value}
                    onChange={(e) =>
                      updateContextAttr(index, 'value', e.target.value)
                    }
                    placeholder="Value"
                    className="flex-1 rounded-md border border-input bg-background shadow-sm focus:border-primary focus:ring-primary sm:text-sm"
                  />
                  <button
                    onClick={() => removeContextAttr(index)}
                    className="text-muted-foreground hover:text-destructive"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Run Test Button */}
          <button
            onClick={runTest}
            disabled={isLoading || !selectedProject || !selectedEnvironment || !apiKey.trim()}
            className="w-full inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <PlayIcon className="mr-2 h-4 w-4" />
            {isLoading ? 'Testing...' : 'Run Test'}
          </button>

          {error && (
            <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          )}
        </div>

        {/* Results Panel */}
        <div className="space-y-6">
          {/* Generated Code */}
          <div className="bg-card shadow rounded-lg border border-border">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <h3 className="text-sm font-medium text-foreground">
                Generated SDK Code
              </h3>
              <button
                onClick={copyCode}
                className="text-muted-foreground hover:text-foreground"
                title="Copy to clipboard"
              >
                {copied ? (
                  <CheckIcon className="h-4 w-4 text-success" />
                ) : (
                  <DocumentDuplicateIcon className="h-4 w-4" />
                )}
              </button>
            </div>
            <pre className="p-4 overflow-x-auto text-xs text-foreground bg-muted">
              <code>{generateCode()}</code>
            </pre>
          </div>

          {/* Test Results */}
          {testResults.length > 0 && (
            <div className="bg-card shadow rounded-lg border border-border">
              <div className="px-4 py-3 border-b border-border">
                <h3 className="text-sm font-medium text-foreground">
                  Test Results
                </h3>
              </div>
              <div className="divide-y divide-border">
                {testResults.map((result) => (
                  <button
                    type="button"
                    key={result.flagKey}
                    onClick={() => setSnippetFlagKey(result.flagKey)}
                    title="Use in generated code"
                    className={clsx(
                      'w-full px-4 py-3 flex items-center justify-between text-left hover:bg-accent',
                      snippetFlag?.flagKey === result.flagKey && 'bg-accent'
                    )}
                  >
                    <span className="flex items-center gap-2">
                      <code className="text-sm font-medium">{result.flagKey}</code>
                      <span className="text-[10px] uppercase text-muted-foreground">
                        {result.flagType}
                      </span>
                    </span>
                    <div className="flex items-center space-x-4">
                      <span
                        className={clsx(
                          'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium',
                          result.enabled
                            ? 'bg-success/15 text-success'
                            : 'bg-muted text-muted-foreground'
                        )}
                      >
                        {result.enabled ? 'Enabled' : 'Disabled'}
                      </span>
                      <code className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded">
                        {JSON.stringify(result.value)}
                      </code>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
