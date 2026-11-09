import { AsyncLocalStorage } from 'node:async_hooks'

/** The API key on whose behalf the current request acts. */
export interface ActorContext {
  apiKeyId: string
  apiKeyName: string
}

const storage = new AsyncLocalStorage<ActorContext>()

/** Runs `fn` so that `currentActor()` returns `actor` anywhere inside it. */
export function runWithActor<T>(
  actor: ActorContext,
  fn: () => Promise<T>
): Promise<T> {
  return storage.run(actor, fn)
}

/** The acting API key, or undefined outside `runWithActor`. */
export function currentActor(): ActorContext | undefined {
  return storage.getStore()
}
