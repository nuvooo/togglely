/** True on macOS/iOS, where shortcuts use ⌘ instead of Ctrl. */
export function isMac(): boolean {
  if (typeof navigator === 'undefined') return false
  return /Mac/i.test(navigator.platform || navigator.userAgent)
}

/** Whether the platform's primary shortcut modifier is held. */
export function hasModKey(e: Pick<KeyboardEvent, 'metaKey' | 'ctrlKey'>): boolean {
  return isMac() ? e.metaKey : e.ctrlKey
}

/** Display label for a Mod+<key> shortcut, e.g. "⌘K" or "Ctrl K". */
export function shortcutLabel(key: string): string {
  return isMac() ? `⌘${key.toUpperCase()}` : `Ctrl ${key.toUpperCase()}`
}
