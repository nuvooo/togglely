import { lazy, Suspense, useEffect, useState } from 'react'
import { isPaletteShortcut, OPEN_COMMAND_PALETTE_EVENT } from './commandPaletteEvents'

const CommandPalette = lazy(() => import('./CommandPalette'))

/**
 * Always-mounted stub that loads the command palette (and cmdk) on first use.
 * Once loaded, the palette owns the shortcut and open event itself.
 */
export function CommandPaletteLauncher() {
  const [requested, setRequested] = useState(false)

  useEffect(() => {
    if (requested) return
    const onKey = (e: KeyboardEvent) => {
      if (!isPaletteShortcut(e)) return
      e.preventDefault()
      setRequested(true)
    }
    const onOpen = () => setRequested(true)
    document.addEventListener('keydown', onKey)
    document.addEventListener(OPEN_COMMAND_PALETTE_EVENT, onOpen)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener(OPEN_COMMAND_PALETTE_EVENT, onOpen)
    }
  }, [requested])

  if (!requested) return null
  return (
    <Suspense fallback={null}>
      <CommandPalette initialOpen />
    </Suspense>
  )
}
