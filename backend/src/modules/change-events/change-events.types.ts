/** Kinds of changes that can affect SDK evaluation results. */
export type ChangeAction =
  | 'created'
  | 'updated'
  | 'deleted'
  | 'toggled'
  | 'rules_changed'
  | 'experiment_changed'
  | 'environment_changed'
  | 'brand_changed'
  | 'imported'

export interface FlagChange {
  flagKey?: string
  action: ChangeAction
}

/**
 * One debounced notification per (project, environment): published on the
 * ChangeBus, consumed by the SDK stream hub and the webhook dispatcher.
 */
export interface FlagsChangedEvent {
  eventId: string
  organizationId: string
  projectId: string
  projectKey: string
  environmentId: string
  environmentKey: string
  /** Current configuration version of the environment after the changes */
  version: number
  changes: FlagChange[]
  /** Set when more than MAX_EVENT_CHANGES changes were collected */
  truncated?: boolean
  /** ISO timestamp */
  createdAt: string
}

export interface RecordChangeInput {
  organizationId: string
  projectId: string
  /** Affected environments, or 'all' for every environment of the project */
  environmentIds: string[] | 'all'
  changes: FlagChange[]
  /**
   * Optional id → key fallback for environments that may no longer exist
   * when the event is flushed (e.g. after deleting an environment).
   */
  environmentKeys?: Record<string, string>
}
