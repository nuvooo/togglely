export interface FeatureFlag {
  id: string
  name: string
  key: string
  description: string | null
  type: 'BOOLEAN' | 'STRING' | 'NUMBER' | 'JSON'
  defaultValue: boolean | string | number | object
  projectId: string
  projectName: string
  environmentId: string
  environmentName: string
  isEnabled: boolean
  createdAt: string
  updatedAt: string
}

export interface Project {
  id: string
  name: string
  environments: { id: string; name: string }[]
}

export interface NewFlagData {
  name: string
  key: string
  description: string
  type: FeatureFlag['type']
  defaultValue: string
  projectId: string
  environmentId: string
}

// Helper to validate MongoDB ObjectID format (24-char hex)
export const isValidObjectId = (id: string | undefined | null): id is string => {
  if (!id || typeof id !== 'string') return false
  if (id === 'undefined' || id === 'null' || id === 'new') return false
  return /^[0-9a-fA-F]{24}$/.test(id)
}

export const formatDate = (dateString: string) => {
  return new Date(dateString).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

export const getTypeColor = (type: string) => {
  switch (type) {
    case 'BOOLEAN':
      return 'bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-400 ring-1 ring-inset ring-blue-700/10 dark:ring-blue-400/20'
    case 'STRING':
      return 'bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-400 ring-1 ring-inset ring-green-600/20 dark:ring-green-400/20'
    case 'NUMBER':
      return 'bg-purple-50 text-purple-700 dark:bg-purple-950 dark:text-purple-400 ring-1 ring-inset ring-purple-700/10 dark:ring-purple-400/20'
    case 'JSON':
      return 'bg-orange-50 text-orange-700 dark:bg-orange-950 dark:text-orange-400 ring-1 ring-inset ring-orange-700/10 dark:ring-orange-400/20'
    default:
      return 'bg-muted text-foreground ring-1 ring-inset ring-border'
  }
}
