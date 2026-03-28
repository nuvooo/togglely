/**
 * Minimal mock of svelte/store for testing
 */

type Subscriber<T> = (value: T) => void
type Unsubscriber = () => void
type StartStopNotifier<T> = (set: (value: T) => void) => Unsubscriber | void

interface Readable<T> {
  subscribe(run: Subscriber<T>): Unsubscriber
}

interface Writable<T> extends Readable<T> {
  set(value: T): void
  update(updater: (value: T) => T): void
}

export function readable<T>(
  initialValue: T,
  start?: StartStopNotifier<T>
): Readable<T> {
  let value = initialValue
  const subscribers: Set<Subscriber<T>> = new Set()
  let stop: Unsubscriber | void

  return {
    subscribe(run: Subscriber<T>): Unsubscriber {
      subscribers.add(run)
      if (subscribers.size === 1 && start) {
        stop = start((newValue: T) => {
          value = newValue
          subscribers.forEach((s) => s(value))
        })
      }
      run(value)
      return () => {
        subscribers.delete(run)
        if (subscribers.size === 0 && stop) {
          stop()
        }
      }
    },
  }
}

export function writable<T>(
  initialValue: T,
  start?: StartStopNotifier<T>
): Writable<T> {
  let value = initialValue
  const subscribers: Set<Subscriber<T>> = new Set()
  let stop: Unsubscriber | void

  function set(newValue: T) {
    value = newValue
    subscribers.forEach((s) => s(value))
  }

  return {
    subscribe(run: Subscriber<T>): Unsubscriber {
      subscribers.add(run)
      if (subscribers.size === 1 && start) {
        stop = start(set)
      }
      run(value)
      return () => {
        subscribers.delete(run)
        if (subscribers.size === 0 && stop) {
          stop()
        }
      }
    },
    set,
    update(updater: (value: T) => T) {
      set(updater(value))
    },
  }
}

export function derived<T, S>(
  store: Readable<S>,
  fn: (value: S) => T
): Readable<T> {
  return readable<T>(undefined as T, (set) => {
    return store.subscribe((value) => {
      set(fn(value))
    })
  })
}
