import { hasModKey } from './platform'

/** Kept separate from the palette so the shell can open it without loading cmdk eagerly. */
export const OPEN_COMMAND_PALETTE_EVENT = 'togglely:open-command-palette'

/** Opens the palette from anywhere (e.g. the search button in the top bar). */
export const openCommandPalette = () => document.dispatchEvent(new Event(OPEN_COMMAND_PALETTE_EVENT))

/** Ctrl+K (Cmd+K on Mac), ignoring key repeat. */
export const isPaletteShortcut = (e: KeyboardEvent) => !e.repeat && e.key.toLowerCase() === 'k' && hasModKey(e)
