# App-Shell Redesign – Plan 1: Fundament & Shell

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Togglely bekommt das neue App-Gerüst (Icon-Leiste + Kontext-Spalte), Graphit-Tokens für Dark/Light, Geist-Schrift, Command-Palette und die neue URL-Struktur mit Weiterleitungen – bestehende Seiten laufen unverändert darin.

**Architecture:** Neue Shell-Komponenten unter `src/components/shell/` ersetzen `components/layout/MainLayout.tsx`. Der aktive Bereich (Übersicht/Projekt/Organisation/Konto) wird aus der URL abgeleitet (`lib/routes.ts`), der zuletzt genutzte Projekt-/Org-Kontext in einem persistierten Zustand-Store gemerkt (`store/workspaceStore.ts`). Projekte/Orgs für Switcher und Palette lädt ein kleiner Hook (`lib/workspace.ts`). Seiten werden in diesem Plan nur neu verdrahtet, nicht umgestaltet (Plan 2/3).

**Tech Stack:** React 19, React Router 7, Tailwind 4 (`@config` + `darkMode: 'class'`), Radix, lucide-react, zustand, cmdk, vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-11-09-app-shell-redesign-design.md`

**Arbeitsverzeichnis für alle Befehle:** `frontend/` (sofern nicht anders angegeben).

---

## Dateiübersicht

| Datei | Aktion | Verantwortung |
|---|---|---|
| `package.json` | Modify | neue Deps |
| `src/index.css` | Modify | Graphit-Tokens, Schrift |
| `tailwind.config.cjs` | Modify | Token-Farben `success`, `warning`, `sidebar` |
| `src/main.tsx` | Modify | Font-Imports |
| `scripts/check-raw-colors.mjs` | Create | verbietet Roh-Farbklassen in migrierten Ordnern |
| `src/lib/routes.ts` (+test) | Create | Pfad-Builder & Bereichserkennung |
| `src/store/workspaceStore.ts` (+test) | Create | letzter Projekt-/Org-Kontext |
| `src/lib/workspace.ts` (+test) | Create | Projekte/Orgs laden (`useWorkspace`) |
| `src/components/ui/{switch,tooltip,popover,kbd,skeleton}.tsx` | Create | Radix-Bausteine |
| `src/components/ui/button.tsx` | Modify | dichtere Größen |
| `src/components/shell/Rail.tsx` (+test) | Create | Icon-Leiste / mobile Tab-Leiste |
| `src/components/shell/WorkspaceSwitcher.tsx` | Create | Projekt-/Org-Auswahl (Popover) |
| `src/components/shell/ContextNav.tsx` (+test) | Create | Kontext-Spalte je Bereich |
| `src/components/shell/CommandPalette.tsx` (+test) | Create | Ctrl/Cmd+K |
| `src/components/shell/AppShell.tsx` | Create | Gerüst, Drawer, Banner, Outlet |
| `src/components/routing/{LegacyRedirects,ProjectQueryBridge}.tsx` (+test) | Create | alte URLs → neue URLs |
| `src/App.tsx` | Modify | neue Routen |
| `src/i18n/locales/{de,en}.ts` | Modify | Shell-Texte |
| `src/components/layout/MainLayout.tsx`, `src/components/{Layout,Header,Sidebar}.tsx`, `src/lib/api-hexagonal.ts` | Delete | ersetzt / tot |

---

### Task 0: Branch vorbereiten

- [ ] **Step 1: Branch anlegen** (vom aktuellen Stand inkl. Targeting-Änderungen, die vorher committet wurden)

```bash
cd C:/Users/S4196901/Documents/togglely
git checkout -b feat/app-shell-redesign
```

---

### Task 1: Abhängigkeiten

**Files:** Modify `frontend/package.json`, `frontend/package-lock.json`

- [ ] **Step 1: Installieren**

```bash
npm install cmdk @radix-ui/react-switch @radix-ui/react-tooltip @radix-ui/react-popover @fontsource-variable/geist-mono
```

Expected: `added N packages`, keine Peer-Dependency-Fehler.

- [ ] **Step 2: Build prüfen**

Run: `npm run build` → Expected: `✓ built in …`

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore(frontend): add cmdk, radix switch/tooltip/popover and Geist Mono"
```

---

### Task 2: Graphit-Tokens & Schrift

**Files:** Modify `src/index.css` (Blöcke `:root` und `.dark` in `@layer base`), `tailwind.config.cjs` (`theme.extend.colors`), `src/main.tsx`

- [ ] **Step 1: Tokens in `src/index.css` ersetzen** – die beiden Blöcke `:root { … }` und `.dark { … }` innerhalb des ersten `@layer base` vollständig durch Folgendes ersetzen (HSL-Tripel, wie bisher):

```css
  :root {
    --background: 0 0% 100%;
    --foreground: 240 10% 3.9%;
    --card: 0 0% 100%;
    --card-foreground: 240 10% 3.9%;
    --popover: 0 0% 100%;
    --popover-foreground: 240 10% 3.9%;
    --primary: 240 5.9% 10%;
    --primary-foreground: 0 0% 98%;
    --secondary: 240 4.8% 95.9%;
    --secondary-foreground: 240 5.9% 10%;
    --muted: 240 4.8% 95.9%;
    --muted-foreground: 240 3.8% 46.1%;
    --accent: 240 4.8% 95.9%;
    --accent-foreground: 240 5.9% 10%;
    --destructive: 0 72.2% 50.6%;
    --destructive-foreground: 0 0% 98%;
    --success: 142.1 76.2% 36.3%;
    --success-foreground: 0 0% 100%;
    --warning: 37.7 92.1% 50.2%;
    --warning-foreground: 240 10% 3.9%;
    --border: 240 5.9% 90%;
    --input: 240 5.9% 90%;
    --ring: 240 5.9% 10%;
    --sidebar: 0 0% 98%;
    --sidebar-accent: 240 4.8% 94%;
    --radius: 0.5rem;
  }

  .dark {
    --background: 240 10% 3.9%;
    --foreground: 0 0% 98%;
    --card: 240 7% 5.3%;
    --card-foreground: 0 0% 98%;
    --popover: 240 7% 6%;
    --popover-foreground: 0 0% 98%;
    --primary: 0 0% 98%;
    --primary-foreground: 240 5.9% 10%;
    --secondary: 240 3.7% 15.9%;
    --secondary-foreground: 0 0% 98%;
    --muted: 240 3.7% 11%;
    --muted-foreground: 240 5% 64.9%;
    --accent: 240 3.7% 13%;
    --accent-foreground: 0 0% 98%;
    --destructive: 0 72% 51%;
    --destructive-foreground: 0 0% 98%;
    --success: 142.1 70.6% 45.3%;
    --success-foreground: 240 10% 3.9%;
    --warning: 37.7 92.1% 50.2%;
    --warning-foreground: 240 10% 3.9%;
    --border: 240 3.7% 13%;
    --input: 240 3.7% 15.9%;
    --ring: 240 4.9% 83.9%;
    --sidebar: 240 7% 4.7%;
    --sidebar-accent: 240 3.7% 11%;
  }
```

- [ ] **Step 2: Schrift im zweiten `@layer base`-Block** – den `body`-Eintrag ersetzen durch:

```css
  body {
    @apply bg-background text-foreground antialiased;
    font-family: 'Geist Variable', ui-sans-serif, system-ui, sans-serif;
    font-feature-settings: 'cv11', 'ss01';
  }
  code, kbd, pre, .font-mono {
    font-family: 'Geist Mono Variable', ui-monospace, 'Cascadia Code', Consolas, monospace;
  }
```

- [ ] **Step 3: Token-Farben in `tailwind.config.cjs`** – in `theme.extend.colors` ergänzen (neben `destructive`):

```js
        success: {
          DEFAULT: 'hsl(var(--success))',
          foreground: 'hsl(var(--success-foreground))',
        },
        warning: {
          DEFAULT: 'hsl(var(--warning))',
          foreground: 'hsl(var(--warning-foreground))',
        },
        sidebar: {
          DEFAULT: 'hsl(var(--sidebar))',
          accent: 'hsl(var(--sidebar-accent))',
        },
```

- [ ] **Step 4: Fonts in `src/main.tsx` laden** – vor `import './index.css'`:

```ts
import '@fontsource-variable/geist'
import '@fontsource-variable/geist-mono'
```

- [ ] **Step 5: Build + Klasse prüfen**

Run: `npm run build && grep -c "bg-success\|--success" dist/assets/*.css`
Expected: Build ok, Zahl ≥ 1.

- [ ] **Step 6: Commit**

```bash
git add src/index.css tailwind.config.cjs src/main.tsx
git commit -m "feat(frontend): graphite design tokens for light and dark, Geist fonts"
```

---

### Task 3: Farb-Lint für migrierte Ordner

**Files:** Create `scripts/check-raw-colors.mjs`; Modify `package.json` (Script)

- [ ] **Step 1: Script schreiben**

```js
// Fails when raw Tailwind palette colors are used in the given folders.
// Migrated UI must use design tokens (bg-background, text-muted-foreground,
// bg-success, …) so light and dark mode stay consistent.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const PALETTE =
  'slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose'
const RAW = new RegExp(
  `\\b(?:[a-z-]+:)*(?:bg|text|border|ring|from|to|via|fill|stroke|divide|outline|shadow)-(?:${PALETTE})-\\d{2,3}(?:/\\d+)?\\b|\\b(?:bg|text)-(?:white|black)\\b`,
  'g'
)

function* files(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) yield* files(path)
    else if (/\.(tsx?|jsx?)$/.test(name) && !/\.test\./.test(name)) yield path
  }
}

const dirs = process.argv.slice(2)
let violations = 0
for (const dir of dirs) {
  for (const file of files(dir)) {
    readFileSync(file, 'utf8')
      .split('\n')
      .forEach((line, i) => {
        for (const match of line.matchAll(RAW)) {
          violations++
          console.log(`${file}:${i + 1}  ${match[0]}`)
        }
      })
  }
}
if (violations) {
  console.error(`\n${violations} raw color class(es) found. Use design tokens.`)
  process.exit(1)
}
console.log(`No raw color classes in: ${dirs.join(', ')}`)
```

- [ ] **Step 2: npm-Script** in `package.json` unter `scripts`:

```json
"lint:colors": "node scripts/check-raw-colors.mjs src/components/shell src/components/ui src/components/routing"
```

- [ ] **Step 3: Gegenprobe** – Run: `node scripts/check-raw-colors.mjs src/pages`
Expected: FAIL mit Treffern wie `bg-green-50` (beweist, dass der Check greift). Dann `npm run lint:colors` → Expected: Treffer nur in `src/components/ui` falls vorhanden; diese in Task 5 beheben.

- [ ] **Step 4: Commit**

```bash
git add scripts/check-raw-colors.mjs package.json
git commit -m "chore(frontend): add raw color class check for migrated UI"
```

---

### Task 4: Routen-Helfer

**Files:** Create `src/lib/routes.ts`, Test `src/lib/routes.test.ts`

- [ ] **Step 1: Failing Test**

```ts
import { describe, expect, it } from 'vitest'
import { getArea, orgPath, projectPath } from './routes'

describe('routes', () => {
  it('builds project and org paths', () => {
    expect(projectPath('p1')).toBe('/projects/p1/flags')
    expect(projectPath('p1', 'experiments')).toBe('/projects/p1/experiments')
    expect(orgPath('o1')).toBe('/orgs/o1/projects')
    expect(orgPath('o1', 'audit-log')).toBe('/orgs/o1/audit-log')
  })

  it.each([
    ['/overview', { area: 'overview' }],
    ['/projects/p1/flags/f1', { area: 'project', id: 'p1', section: 'flags' }],
    ['/orgs/o1/members', { area: 'org', id: 'o1', section: 'members' }],
    ['/orgs/new', { area: 'org' }],
    ['/account', { area: 'account' }],
    ['/something', { area: 'overview' }],
  ])('detects area for %s', (path, expected) => {
    expect(getArea(path)).toEqual(expected)
  })
})
```

- [ ] **Step 2: Fehlschlag prüfen** – Run: `npx vitest run src/lib/routes.test.ts` → Expected: FAIL `Cannot find module './routes'`.

- [ ] **Step 3: Implementierung**

```ts
export type ProjectSection =
  | 'flags'
  | 'experiments'
  | 'environments'
  | 'brands'
  | 'sdk'
  | 'settings'
export type OrgSection =
  | 'projects'
  | 'members'
  | 'api-keys'
  | 'audit-log'
  | 'settings'

export type Area =
  | { area: 'overview' }
  | { area: 'account' }
  | { area: 'project'; id: string; section: string }
  | { area: 'org'; id?: string; section?: string }

export const projectPath = (projectId: string, section: ProjectSection = 'flags') =>
  `/projects/${projectId}/${section}`

export const orgPath = (orgId: string, section: OrgSection = 'projects') =>
  `/orgs/${orgId}/${section}`

/** Derives the active navigation area from a pathname. */
export function getArea(pathname: string): Area {
  const parts = pathname.split('/').filter(Boolean)
  if (parts[0] === 'projects' && parts[1]) {
    return { area: 'project', id: parts[1], section: parts[2] ?? 'flags' }
  }
  if (parts[0] === 'orgs') {
    if (!parts[1] || parts[1] === 'new') return { area: 'org' }
    return { area: 'org', id: parts[1], section: parts[2] ?? 'projects' }
  }
  if (parts[0] === 'account') return { area: 'account' }
  return { area: 'overview' }
}
```

- [ ] **Step 4: Grün** – Run: `npx vitest run src/lib/routes.test.ts` → Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/routes.ts src/lib/routes.test.ts
git commit -m "feat(frontend): route helpers for the new app shell"
```

---

### Task 5: Workspace-Store & -Daten

**Files:** Create `src/store/workspaceStore.ts`, `src/store/workspaceStore.test.ts`, `src/lib/workspace.ts`, `src/lib/workspace.test.ts`

- [ ] **Step 1: Failing Tests**

`src/store/workspaceStore.test.ts`:

```ts
import { beforeEach, describe, expect, it } from 'vitest'
import { useWorkspaceStore } from './workspaceStore'

describe('workspaceStore', () => {
  beforeEach(() => useWorkspaceStore.setState({ lastProjectId: null, lastOrgId: null }))

  it('remembers project and its org', () => {
    useWorkspaceStore.getState().rememberProject('p1', 'o1')
    expect(useWorkspaceStore.getState()).toMatchObject({ lastProjectId: 'p1', lastOrgId: 'o1' })
  })

  it('remembers org without touching project', () => {
    useWorkspaceStore.getState().rememberProject('p1', 'o1')
    useWorkspaceStore.getState().rememberOrg('o2')
    expect(useWorkspaceStore.getState()).toMatchObject({ lastProjectId: 'p1', lastOrgId: 'o2' })
  })

  it('forgets everything on reset', () => {
    useWorkspaceStore.getState().rememberProject('p1', 'o1')
    useWorkspaceStore.getState().reset()
    expect(useWorkspaceStore.getState()).toMatchObject({ lastProjectId: null, lastOrgId: null })
  })
})
```

`src/lib/workspace.test.ts`:

```ts
import { renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/axios', () => ({
  default: {
    get: vi.fn((url: string) =>
      Promise.resolve({
        data:
          url === '/projects'
            ? { projects: [{ id: 'p1', name: 'Shop', key: 'shop', type: 'SINGLE', organizationId: 'o1' }] }
            : { organizations: [{ id: 'o1', name: 'Acme', role: 'OWNER' }] },
      })
    ),
  },
}))

import { resetWorkspaceCache, useWorkspace } from './workspace'

describe('useWorkspace', () => {
  beforeEach(() => resetWorkspaceCache())

  it('loads projects and organizations', async () => {
    const { result } = renderHook(() => useWorkspace())
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.projects[0].name).toBe('Shop')
    expect(result.current.organizations[0].name).toBe('Acme')
    expect(result.current.projectsByOrg('o1')).toHaveLength(1)
  })
})
```

- [ ] **Step 2: Fehlschlag** – Run: `npx vitest run src/store/workspaceStore.test.ts src/lib/workspace.test.ts` → Expected: FAIL (Module fehlen).

- [ ] **Step 3: Store**

```ts
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface WorkspaceState {
  lastProjectId: string | null
  lastOrgId: string | null
  rememberProject: (projectId: string, orgId: string) => void
  rememberOrg: (orgId: string) => void
  reset: () => void
}

/** Remembers the last used project/organization for the navigation rail. */
export const useWorkspaceStore = create<WorkspaceState>()(
  persist(
    (set) => ({
      lastProjectId: null,
      lastOrgId: null,
      rememberProject: (lastProjectId, lastOrgId) => set({ lastProjectId, lastOrgId }),
      rememberOrg: (lastOrgId) => set({ lastOrgId }),
      reset: () => set({ lastProjectId: null, lastOrgId: null }),
    }),
    { name: 'togglely-workspace' }
  )
)
```

- [ ] **Step 4: Daten-Hook** `src/lib/workspace.ts`

```ts
import { useCallback, useEffect, useState } from 'react'
import api from '@/lib/axios'

export interface WorkspaceProject {
  id: string
  name: string
  key: string
  type: 'SINGLE' | 'MULTI'
  organizationId: string
}
export interface WorkspaceOrganization {
  id: string
  name: string
  role?: string
}
interface WorkspaceData {
  projects: WorkspaceProject[]
  organizations: WorkspaceOrganization[]
}

let cache: WorkspaceData | null = null
let inflight: Promise<WorkspaceData> | null = null
const listeners = new Set<() => void>()

async function load(): Promise<WorkspaceData> {
  const [projects, orgs] = await Promise.all([api.get('/projects'), api.get('/organizations')])
  return {
    projects: projects.data.projects ?? [],
    organizations: orgs.data.organizations ?? [],
  }
}

/** Clears the cache (tests, logout, after creating projects/orgs). */
export function resetWorkspaceCache() {
  cache = null
  inflight = null
}

/** Reloads projects/orgs and notifies all mounted consumers. */
export async function refreshWorkspace() {
  inflight = load()
  cache = await inflight
  inflight = null
  for (const notify of listeners) notify()
}

/** Projects and organizations of the current user, shared across the shell. */
export function useWorkspace() {
  const [data, setData] = useState<WorkspaceData | null>(cache)
  const [error, setError] = useState<unknown>(null)

  useEffect(() => {
    const notify = () => setData(cache)
    listeners.add(notify)
    if (!cache) {
      inflight ??= load()
      inflight
        .then((result) => {
          cache = result
          inflight = null
          setData(result)
        })
        .catch((err) => {
          inflight = null
          setError(err)
        })
    }
    return () => {
      listeners.delete(notify)
    }
  }, [])

  const projectsByOrg = useCallback(
    (orgId: string) => (data?.projects ?? []).filter((p) => p.organizationId === orgId),
    [data]
  )

  return {
    projects: data?.projects ?? [],
    organizations: data?.organizations ?? [],
    isLoading: !data && !error,
    error,
    projectsByOrg,
  }
}
```

- [ ] **Step 5: Grün** – Run: `npx vitest run src/store/workspaceStore.test.ts src/lib/workspace.test.ts` → Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add src/store/workspaceStore.ts src/store/workspaceStore.test.ts src/lib/workspace.ts src/lib/workspace.test.ts
git commit -m "feat(frontend): workspace store and data hook for the app shell"
```

---

### Task 6: UI-Bausteine

**Files:** Create `src/components/ui/switch.tsx`, `tooltip.tsx`, `popover.tsx`, `kbd.tsx`, `skeleton.tsx`; Modify `src/components/ui/button.tsx` (nur `size`-Varianten)

- [ ] **Step 1: `switch.tsx`**

```tsx
import * as SwitchPrimitive from '@radix-ui/react-switch'
import * as React from 'react'
import { cn } from '@/lib/utils'

/** Toggle switch; "on" uses the success token (green) in both themes. */
const Switch = React.forwardRef<
  React.ElementRef<typeof SwitchPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof SwitchPrimitive.Root>
>(({ className, ...props }, ref) => (
  <SwitchPrimitive.Root
    ref={ref}
    className={cn(
      'peer inline-flex h-[18px] w-8 shrink-0 cursor-pointer items-center rounded-full border border-transparent transition-colors',
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
      'disabled:cursor-not-allowed disabled:opacity-50',
      'data-[state=checked]:bg-success data-[state=unchecked]:bg-input',
      className
    )}
    {...props}
  >
    <SwitchPrimitive.Thumb className="pointer-events-none block h-3.5 w-3.5 rounded-full bg-background shadow-sm ring-0 transition-transform data-[state=checked]:translate-x-[15px] data-[state=unchecked]:translate-x-0.5 dark:bg-foreground" />
  </SwitchPrimitive.Root>
))
Switch.displayName = 'Switch'

export { Switch }
```

- [ ] **Step 2: `tooltip.tsx`**

```tsx
import * as TooltipPrimitive from '@radix-ui/react-tooltip'
import * as React from 'react'
import { cn } from '@/lib/utils'

const TooltipProvider = TooltipPrimitive.Provider
const Tooltip = TooltipPrimitive.Root
const TooltipTrigger = TooltipPrimitive.Trigger

const TooltipContent = React.forwardRef<
  React.ElementRef<typeof TooltipPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>
>(({ className, sideOffset = 6, ...props }, ref) => (
  <TooltipPrimitive.Portal>
    <TooltipPrimitive.Content
      ref={ref}
      sideOffset={sideOffset}
      className={cn(
        'z-50 rounded-md border bg-popover px-2 py-1 text-xs text-popover-foreground shadow-md animate-in fade-in-0 zoom-in-95',
        className
      )}
      {...props}
    />
  </TooltipPrimitive.Portal>
))
TooltipContent.displayName = 'TooltipContent'

export { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger }
```

- [ ] **Step 3: `popover.tsx`**

```tsx
import * as PopoverPrimitive from '@radix-ui/react-popover'
import * as React from 'react'
import { cn } from '@/lib/utils'

const Popover = PopoverPrimitive.Root
const PopoverTrigger = PopoverPrimitive.Trigger

const PopoverContent = React.forwardRef<
  React.ElementRef<typeof PopoverPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Content>
>(({ className, align = 'start', sideOffset = 6, ...props }, ref) => (
  <PopoverPrimitive.Portal>
    <PopoverPrimitive.Content
      ref={ref}
      align={align}
      sideOffset={sideOffset}
      className={cn(
        'z-50 w-72 rounded-lg border bg-popover p-1 text-popover-foreground shadow-lg outline-none animate-in fade-in-0 zoom-in-95',
        className
      )}
      {...props}
    />
  </PopoverPrimitive.Portal>
))
PopoverContent.displayName = 'PopoverContent'

export { Popover, PopoverContent, PopoverTrigger }
```

- [ ] **Step 4: `kbd.tsx` und `skeleton.tsx`**

```tsx
// kbd.tsx
import { cn } from '@/lib/utils'

export function Kbd({ className, ...props }: React.HTMLAttributes<HTMLElement>) {
  return (
    <kbd
      className={cn(
        'pointer-events-none inline-flex h-5 select-none items-center rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground',
        className
      )}
      {...props}
    />
  )
}
```

```tsx
// skeleton.tsx
import { cn } from '@/lib/utils'

export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('animate-pulse rounded-md bg-muted', className)} {...props} />
}
```

- [ ] **Step 5: Button dichter** – in `button.tsx` den `size`-Block ersetzen:

```ts
      size: {
        default: 'h-9 px-3.5 py-2',
        sm: 'h-8 rounded-md px-3 text-xs',
        lg: 'h-10 rounded-md px-6',
        icon: 'h-9 w-9',
      },
```

- [ ] **Step 6: Prüfen** – Run: `npx tsc --noEmit -p tsconfig.json && npm run lint:colors`
Expected: keine TS-Fehler; Farb-Check meldet nur ggf. bestehende Roh-Farben in `src/components/ui` – diese im selben Commit durch Tokens ersetzen (z. B. `bg-white` → `bg-background`, `text-gray-500` → `text-muted-foreground`), bis `npm run lint:colors` grün ist.

- [ ] **Step 7: Commit**

```bash
git add src/components/ui
git commit -m "feat(frontend): switch, tooltip, popover, kbd and skeleton primitives"
```

---

### Task 7: Shell-Texte (i18n)

**Files:** Modify `src/i18n/locales/de.ts`, `src/i18n/locales/en.ts` (nach dem Block `'nav.register'`)

- [ ] **Step 1: Deutsch**

```ts
  'nav.overview': 'Übersicht',
  'nav.project': 'Projekt',
  'nav.organization': 'Organisation',
  'nav.account': 'Konto',
  'nav.experiments': 'Experimente',
  'nav.environments': 'Environments',
  'nav.brands': 'Brands',
  'nav.sdk': 'SDK Tester',
  'nav.members': 'Mitglieder',
  'nav.audit-log': 'Audit Log',
  'nav.develop': 'Entwickeln',
  'nav.select-project': 'Projekt wählen',
  'nav.select-org': 'Organisation wählen',
  'nav.no-projects': 'Noch keine Projekte',
  'nav.new-org': 'Neue Organisation',
  'nav.profile-security': 'Sicherheit',
  'nav.appearance': 'Darstellung',
  'nav.open-menu': 'Menü öffnen',
  'cmd.placeholder': 'Suchen oder Befehl eingeben…',
  'cmd.empty': 'Keine Treffer',
  'cmd.navigation': 'Navigation',
  'cmd.projects': 'Projekte',
  'cmd.flags': 'Feature Flags',
  'cmd.actions': 'Aktionen',
  'cmd.toggle-theme': 'Hell/Dunkel umschalten',
  'cmd.new-flag': 'Neues Flag',
  'cmd.search': 'Suchen',
```

- [ ] **Step 2: Englisch** (gleiche Keys)

```ts
  'nav.overview': 'Overview',
  'nav.project': 'Project',
  'nav.organization': 'Organization',
  'nav.account': 'Account',
  'nav.experiments': 'Experiments',
  'nav.environments': 'Environments',
  'nav.brands': 'Brands',
  'nav.sdk': 'SDK Tester',
  'nav.members': 'Members',
  'nav.audit-log': 'Audit log',
  'nav.develop': 'Develop',
  'nav.select-project': 'Select project',
  'nav.select-org': 'Select organization',
  'nav.no-projects': 'No projects yet',
  'nav.new-org': 'New organization',
  'nav.profile-security': 'Security',
  'nav.appearance': 'Appearance',
  'nav.open-menu': 'Open menu',
  'cmd.placeholder': 'Search or type a command…',
  'cmd.empty': 'No results',
  'cmd.navigation': 'Navigation',
  'cmd.projects': 'Projects',
  'cmd.flags': 'Feature flags',
  'cmd.actions': 'Actions',
  'cmd.toggle-theme': 'Toggle light/dark',
  'cmd.new-flag': 'New flag',
  'cmd.search': 'Search',
```

- [ ] **Step 3: Commit**

```bash
git add src/i18n/locales
git commit -m "feat(frontend): shell navigation texts (de/en)"
```

---

### Task 8: Rail (Icon-Leiste)

**Files:** Create `src/components/shell/Rail.tsx`, Test `src/components/shell/Rail.test.tsx`

- [ ] **Step 1: Failing Test**

```tsx
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it } from 'vitest'
import '@/i18n'
import { TooltipProvider } from '@/components/ui/tooltip'
import { useWorkspaceStore } from '@/store/workspaceStore'
import { Rail } from './Rail'

const renderAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <TooltipProvider>
        <Rail />
      </TooltipProvider>
    </MemoryRouter>
  )

describe('Rail', () => {
  beforeEach(() => useWorkspaceStore.setState({ lastProjectId: 'p1', lastOrgId: 'o1' }))

  it('links project and org to the remembered context', () => {
    renderAt('/overview')
    expect(screen.getByRole('link', { name: /projekt|project/i })).toHaveAttribute('href', '/projects/p1/flags')
    expect(screen.getByRole('link', { name: /organisation|organization/i })).toHaveAttribute('href', '/orgs/o1/projects')
  })

  it('marks the active area', () => {
    renderAt('/projects/p1/experiments')
    expect(screen.getByRole('link', { name: /projekt|project/i })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: /übersicht|overview/i })).not.toHaveAttribute('aria-current')
  })

  it('falls back to selection pages without context', () => {
    useWorkspaceStore.setState({ lastProjectId: null, lastOrgId: null })
    renderAt('/overview')
    expect(screen.getByRole('link', { name: /projekt|project/i })).toHaveAttribute('href', '/overview')
    expect(screen.getByRole('link', { name: /organisation|organization/i })).toHaveAttribute('href', '/orgs')
  })
})
```

- [ ] **Step 2: Fehlschlag** – Run: `npx vitest run src/components/shell/Rail.test.tsx` → Expected: FAIL (Modul fehlt).

- [ ] **Step 3: Implementierung**

```tsx
import { Building2, Flag, LayoutGrid, UserRound } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link, useLocation } from 'react-router-dom'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { getArea, orgPath, projectPath } from '@/lib/routes'
import { cn } from '@/lib/utils'
import { useWorkspaceStore } from '@/store/workspaceStore'

/**
 * Primary navigation. Vertical icon rail on desktop, bottom tab bar on
 * mobile (`orientation="bottom"`).
 */
export function Rail({ orientation = 'side' }: { orientation?: 'side' | 'bottom' }) {
  const { t } = useTranslation()
  const { pathname } = useLocation()
  const { lastProjectId, lastOrgId } = useWorkspaceStore()
  const current = getArea(pathname).area

  const items = [
    { area: 'overview', label: t('nav.overview'), icon: LayoutGrid, href: '/overview' },
    {
      area: 'project',
      label: t('nav.project'),
      icon: Flag,
      href: lastProjectId ? projectPath(lastProjectId) : '/overview',
    },
    {
      area: 'org',
      label: t('nav.organization'),
      icon: Building2,
      href: lastOrgId ? orgPath(lastOrgId) : '/orgs',
    },
    { area: 'account', label: t('nav.account'), icon: UserRound, href: '/account' },
  ] as const

  if (orientation === 'bottom') {
    return (
      <nav className="grid grid-cols-4 border-t bg-sidebar" aria-label={t('nav.overview')}>
        {items.map(({ area, label, icon: Icon, href }) => (
          <Link
            key={area}
            to={href}
            aria-label={label}
            aria-current={current === area ? 'page' : undefined}
            className={cn(
              'flex flex-col items-center gap-0.5 py-2 text-[11px] text-muted-foreground',
              current === area && 'text-foreground'
            )}
          >
            <Icon className="h-5 w-5" />
            {label}
          </Link>
        ))}
      </nav>
    )
  }

  return (
    <nav
      className="flex h-full w-14 flex-col items-center gap-1 border-r bg-sidebar py-3"
      aria-label={t('nav.overview')}
    >
      <Link
        to="/overview"
        className="mb-3 grid h-8 w-8 place-items-center rounded-lg bg-primary text-sm font-bold text-primary-foreground"
        aria-label={t('common.app-name')}
      >
        T
      </Link>
      {items.map(({ area, label, icon: Icon, href }) => (
        <Tooltip key={area}>
          <TooltipTrigger asChild>
            <Link
              to={href}
              aria-label={label}
              aria-current={current === area ? 'page' : undefined}
              className={cn(
                'grid h-9 w-9 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground',
                current === area && 'bg-sidebar-accent text-foreground',
                area === 'account' && 'mt-auto'
              )}
            >
              <Icon className="h-[18px] w-[18px]" />
            </Link>
          </TooltipTrigger>
          <TooltipContent side="right">{label}</TooltipContent>
        </Tooltip>
      ))}
    </nav>
  )
}
```

Hinweis: Tooltips brauchen einen `TooltipProvider`; die App stellt ihn in `AppShell` (Task 11) bereit, der Test oben ebenfalls.

- [ ] **Step 4: Grün** – Run: `npx vitest run src/components/shell/Rail.test.tsx` → Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/shell/Rail.tsx src/components/shell/Rail.test.tsx
git commit -m "feat(frontend): navigation rail with area detection"
```

---

### Task 9: WorkspaceSwitcher & ContextNav

**Files:** Create `src/components/shell/WorkspaceSwitcher.tsx`, `src/components/shell/ContextNav.tsx`, Test `src/components/shell/ContextNav.test.tsx`

- [ ] **Step 1: Failing Test**

```tsx
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import '@/i18n'

vi.mock('@/lib/workspace', () => ({
  useWorkspace: () => ({
    projects: [
      { id: 'p1', name: 'Shop', key: 'shop', type: 'MULTI', organizationId: 'o1' },
      { id: 'p2', name: 'Blog', key: 'blog', type: 'SINGLE', organizationId: 'o1' },
    ],
    organizations: [{ id: 'o1', name: 'Acme' }],
    isLoading: false,
    error: null,
    projectsByOrg: () => [],
  }),
}))

import { ContextNav } from './ContextNav'

const renderAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <ContextNav />
    </MemoryRouter>
  )

describe('ContextNav', () => {
  it('shows project sections incl. brands for MULTI projects', () => {
    renderAt('/projects/p1/flags')
    expect(screen.getByRole('link', { name: /feature flags/i })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: /brands/i })).toHaveAttribute('href', '/projects/p1/brands')
    expect(screen.getByText('Shop')).toBeInTheDocument()
  })

  it('hides brands for SINGLE projects', () => {
    renderAt('/projects/p2/flags')
    expect(screen.queryByRole('link', { name: /brands/i })).toBeNull()
  })

  it('shows organization sections', () => {
    renderAt('/orgs/o1/members')
    expect(screen.getByRole('link', { name: /audit log/i })).toHaveAttribute('href', '/orgs/o1/audit-log')
    expect(screen.getByRole('link', { name: /mitglieder|members/i })).toHaveAttribute('aria-current', 'page')
  })

  it('renders nothing on the overview', () => {
    const { container } = renderAt('/overview')
    expect(container).toBeEmptyDOMElement()
  })
})
```

- [ ] **Step 2: Fehlschlag** – Run: `npx vitest run src/components/shell/ContextNav.test.tsx` → Expected: FAIL.

- [ ] **Step 3: `WorkspaceSwitcher.tsx`**

```tsx
import { Check, ChevronsUpDown, Plus } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { orgPath, projectPath } from '@/lib/routes'
import { cn } from '@/lib/utils'
import { useWorkspace } from '@/lib/workspace'

function Avatar({ name }: { name: string }) {
  return (
    <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md bg-secondary text-[10px] font-semibold text-secondary-foreground">
      {name.slice(0, 2).toUpperCase()}
    </span>
  )
}

/** Popover to switch the current project (grouped by org) or organization. */
export function WorkspaceSwitcher({ kind, currentId }: { kind: 'project' | 'org'; currentId?: string }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const { projects, organizations } = useWorkspace()

  const current =
    kind === 'project'
      ? projects.find((p) => p.id === currentId)
      : organizations.find((o) => o.id === currentId)
  const subtitle =
    kind === 'project' && current
      ? organizations.find((o) => o.id === (current as { organizationId: string }).organizationId)?.name
      : undefined

  const go = (path: string) => {
    setOpen(false)
    navigate(path)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex w-full items-center gap-2 rounded-lg border bg-background px-2 py-1.5 text-left transition-colors hover:bg-accent"
        >
          <Avatar name={current?.name ?? '?'} />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold">
              {current?.name ?? t(kind === 'project' ? 'nav.select-project' : 'nav.select-org')}
            </span>
            {subtitle && <span className="block truncate text-xs text-muted-foreground">{subtitle}</span>}
          </span>
          <ChevronsUpDown className="h-4 w-4 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="max-h-80 overflow-y-auto">
        {kind === 'project'
          ? organizations.map((org) => {
              const orgProjects = projects.filter((p) => p.organizationId === org.id)
              return (
                <div key={org.id} className="py-1">
                  <div className="px-2 pb-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                    {org.name}
                  </div>
                  {orgProjects.length === 0 && (
                    <div className="px-2 py-1.5 text-xs text-muted-foreground">{t('nav.no-projects')}</div>
                  )}
                  {orgProjects.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => go(projectPath(p.id))}
                      className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent"
                    >
                      <Avatar name={p.name} />
                      <span className="flex-1 truncate text-left">{p.name}</span>
                      <Check className={cn('h-4 w-4', p.id === currentId ? 'opacity-100' : 'opacity-0')} />
                    </button>
                  ))}
                </div>
              )
            })
          : (
            <>
              {organizations.map((o) => (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => go(orgPath(o.id))}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent"
                >
                  <Avatar name={o.name} />
                  <span className="flex-1 truncate text-left">{o.name}</span>
                  <Check className={cn('h-4 w-4', o.id === currentId ? 'opacity-100' : 'opacity-0')} />
                </button>
              ))}
              <button
                type="button"
                onClick={() => go('/orgs/new')}
                className="mt-1 flex w-full items-center gap-2 rounded-md border-t px-2 py-1.5 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                <Plus className="h-4 w-4" /> {t('nav.new-org')}
              </button>
            </>
          )}
      </PopoverContent>
    </Popover>
  )
}
```

- [ ] **Step 4: `ContextNav.tsx`**

```tsx
import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useLocation } from 'react-router-dom'
import { getArea, orgPath, projectPath } from '@/lib/routes'
import { cn } from '@/lib/utils'
import { useWorkspace } from '@/lib/workspace'
import { useWorkspaceStore } from '@/store/workspaceStore'
import { WorkspaceSwitcher } from './WorkspaceSwitcher'

interface NavItem {
  key: string
  label: string
  href: string
}

function NavList({ items, activeKey }: { items: NavItem[]; activeKey: string }) {
  return (
    <ul className="space-y-0.5">
      {items.map((item) => (
        <li key={item.key}>
          <Link
            to={item.href}
            aria-current={item.key === activeKey ? 'page' : undefined}
            className={cn(
              'block rounded-md px-2.5 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground',
              item.key === activeKey && 'bg-sidebar-accent font-medium text-foreground'
            )}
          >
            {item.label}
          </Link>
        </li>
      ))}
    </ul>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-1 mt-5 px-2.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
      {children}
    </div>
  )
}

/** Second navigation column; content depends on the active area. */
export function ContextNav() {
  const { t } = useTranslation()
  const { pathname, hash } = useLocation()
  const area = getArea(pathname)
  const { projects } = useWorkspace()
  const { rememberProject, rememberOrg } = useWorkspaceStore()

  const project = area.area === 'project' ? projects.find((p) => p.id === area.id) : undefined

  useEffect(() => {
    if (area.area === 'project' && project) rememberProject(project.id, project.organizationId)
    if (area.area === 'org' && area.id) rememberOrg(area.id)
  }, [area.area, area.area === 'org' ? area.id : undefined, project, rememberProject, rememberOrg])

  if (area.area === 'overview') return null

  let content: React.ReactNode = null

  if (area.area === 'project') {
    const main: NavItem[] = [
      { key: 'flags', label: t('nav.feature-flags'), href: projectPath(area.id, 'flags') },
      { key: 'experiments', label: t('nav.experiments'), href: projectPath(area.id, 'experiments') },
      { key: 'environments', label: t('nav.environments'), href: projectPath(area.id, 'environments') },
    ]
    if (project?.type === 'MULTI') {
      main.push({ key: 'brands', label: t('nav.brands'), href: projectPath(area.id, 'brands') })
    }
    const develop: NavItem[] = [
      { key: 'sdk', label: t('nav.sdk'), href: projectPath(area.id, 'sdk') },
      { key: 'settings', label: t('nav.settings'), href: projectPath(area.id, 'settings') },
    ]
    content = (
      <>
        <WorkspaceSwitcher kind="project" currentId={area.id} />
        <div className="mt-4" />
        <NavList items={main} activeKey={area.section} />
        <SectionLabel>{t('nav.develop')}</SectionLabel>
        <NavList items={develop} activeKey={area.section} />
      </>
    )
  } else if (area.area === 'org') {
    const items: NavItem[] = area.id
      ? [
          { key: 'projects', label: t('nav.projects'), href: orgPath(area.id, 'projects') },
          { key: 'members', label: t('nav.members'), href: orgPath(area.id, 'members') },
          { key: 'api-keys', label: t('nav.api-keys'), href: orgPath(area.id, 'api-keys') },
          { key: 'audit-log', label: t('nav.audit-log'), href: orgPath(area.id, 'audit-log') },
          { key: 'settings', label: t('nav.settings'), href: orgPath(area.id, 'settings') },
        ]
      : []
    content = (
      <>
        <WorkspaceSwitcher kind="org" currentId={area.id} />
        <div className="mt-4" />
        <NavList items={items} activeKey={area.section ?? ''} />
      </>
    )
  } else {
    const items: NavItem[] = [
      { key: '', label: t('nav.profile'), href: '/account' },
      { key: '#security', label: t('nav.profile-security'), href: '/account#security' },
      { key: '#appearance', label: t('nav.appearance'), href: '/account#appearance' },
    ]
    content = (
      <>
        <div className="px-2.5 pb-3 text-sm font-semibold">{t('nav.account')}</div>
        <NavList items={items} activeKey={hash} />
      </>
    )
  }

  return <aside className="h-full w-60 overflow-y-auto border-r bg-sidebar p-3">{content}</aside>
}
```

- [ ] **Step 5: Grün** – Run: `npx vitest run src/components/shell/ContextNav.test.tsx` → Expected: PASS (4 tests). Danach `npm run lint:colors` → grün.

- [ ] **Step 6: Commit**

```bash
git add src/components/shell/WorkspaceSwitcher.tsx src/components/shell/ContextNav.tsx src/components/shell/ContextNav.test.tsx
git commit -m "feat(frontend): context navigation with project and org switcher"
```

---

### Task 10: Command-Palette

**Files:** Create `src/components/shell/CommandPalette.tsx`, Test `src/components/shell/CommandPalette.test.tsx`

- [ ] **Step 1: Failing Test**

```tsx
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import '@/i18n'

vi.mock('@/lib/workspace', () => ({
  useWorkspace: () => ({
    projects: [{ id: 'p1', name: 'Shop', key: 'shop', type: 'SINGLE', organizationId: 'o1' }],
    organizations: [{ id: 'o1', name: 'Acme' }],
    isLoading: false,
    error: null,
    projectsByOrg: () => [],
  }),
}))
vi.mock('@/lib/axios', () => ({
  default: { get: vi.fn(() => Promise.resolve({ data: { featureFlags: [] } })) },
}))

import { CommandPalette } from './CommandPalette'

describe('CommandPalette', () => {
  it('opens with Ctrl+K and lists projects', () => {
    render(
      <MemoryRouter>
        <CommandPalette />
      </MemoryRouter>
    )
    expect(screen.queryByPlaceholderText(/suchen|search/i)).toBeNull()
    fireEvent.keyDown(document, { key: 'k', ctrlKey: true })
    expect(screen.getByPlaceholderText(/suchen|search/i)).toBeInTheDocument()
    expect(screen.getByText('Shop')).toBeInTheDocument()
  })
})
```

Falls jsdom `ResizeObserver`/`scrollIntoView` fehlt (cmdk nutzt beides), in `src/test/setup.ts` ergänzen:

```ts
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver
Element.prototype.scrollIntoView ??= () => {}
```

- [ ] **Step 2: Fehlschlag** – Run: `npx vitest run src/components/shell/CommandPalette.test.tsx` → Expected: FAIL.

- [ ] **Step 3: Implementierung**

```tsx
import { Command } from 'cmdk'
import { Building2, Flag, FolderKanban, Moon, Plus, Search } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useLocation, useNavigate } from 'react-router-dom'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import api from '@/lib/axios'
import { getArea, orgPath, projectPath } from '@/lib/routes'
import { useWorkspace } from '@/lib/workspace'
import { useThemeStore } from '@/store/themeStore'

interface FlagHit {
  id: string
  name: string
  key: string
}

const itemClass =
  'flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm aria-selected:bg-accent aria-selected:text-accent-foreground'
const groupClass =
  '[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-muted-foreground'

/** Global Ctrl/Cmd+K palette: navigation, projects, flags, actions. */
export function CommandPalette() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const { projects, organizations } = useWorkspace()
  const { toggleTheme } = useThemeStore()
  const [open, setOpen] = useState(false)
  const [flags, setFlags] = useState<FlagHit[]>([])
  const area = getArea(pathname)
  const projectId = area.area === 'project' ? area.id : undefined

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setOpen((o) => !o)
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    if (!open || !projectId) return
    api
      .get(`/feature-flags/project/${projectId}`)
      .then((res) => setFlags(res.data.featureFlags ?? []))
      .catch(() => setFlags([]))
  }, [open, projectId])

  const run = (fn: () => void) => {
    setOpen(false)
    fn()
  }

  return (
    <>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="overflow-hidden p-0 sm:max-w-xl">
          <DialogTitle className="sr-only">{t('cmd.search')}</DialogTitle>
          <Command label={t('cmd.search')} className="flex flex-col">
            <div className="flex items-center gap-2 border-b px-3">
              <Search className="h-4 w-4 text-muted-foreground" />
              <Command.Input
                autoFocus
                placeholder={t('cmd.placeholder')}
                className="h-11 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              />
            </div>
            <Command.List className="max-h-80 overflow-y-auto p-1">
              <Command.Empty className="py-6 text-center text-sm text-muted-foreground">
                {t('cmd.empty')}
              </Command.Empty>
              {flags.length > 0 && projectId && (
                <Command.Group heading={t('cmd.flags')} className={groupClass}>
                  {flags.map((f) => (
                    <Command.Item
                      key={f.id}
                      value={`flag ${f.name} ${f.key}`}
                      onSelect={() => run(() => navigate(`${projectPath(projectId, 'flags')}/${f.id}`))}
                      className={itemClass}
                    >
                      <Flag className="h-4 w-4 text-muted-foreground" />
                      {f.name}
                      <span className="ml-auto font-mono text-xs text-muted-foreground">{f.key}</span>
                    </Command.Item>
                  ))}
                </Command.Group>
              )}
              <Command.Group heading={t('cmd.projects')} className={groupClass}>
                {projects.map((p) => (
                  <Command.Item
                    key={p.id}
                    value={`project ${p.name} ${p.key}`}
                    onSelect={() => run(() => navigate(projectPath(p.id)))}
                    className={itemClass}
                  >
                    <FolderKanban className="h-4 w-4 text-muted-foreground" />
                    {p.name}
                  </Command.Item>
                ))}
                {organizations.map((o) => (
                  <Command.Item
                    key={o.id}
                    value={`org ${o.name}`}
                    onSelect={() => run(() => navigate(orgPath(o.id)))}
                    className={itemClass}
                  >
                    <Building2 className="h-4 w-4 text-muted-foreground" />
                    {o.name}
                  </Command.Item>
                ))}
              </Command.Group>
              <Command.Group heading={t('cmd.actions')} className={groupClass}>
                {projectId && (
                  <Command.Item
                    value="new flag"
                    onSelect={() => run(() => navigate(`${projectPath(projectId, 'flags')}?new=1`))}
                    className={itemClass}
                  >
                    <Plus className="h-4 w-4 text-muted-foreground" />
                    {t('cmd.new-flag')}
                  </Command.Item>
                )}
                <Command.Item value="theme dark light" onSelect={() => run(toggleTheme)} className={itemClass}>
                  <Moon className="h-4 w-4 text-muted-foreground" />
                  {t('cmd.toggle-theme')}
                </Command.Item>
              </Command.Group>
            </Command.List>
          </Command>
        </DialogContent>
      </Dialog>
    </>
  )
}
```

Die Shell öffnet die Palette über dasselbe Tastatur-Event (Task 11): `document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true }))`.

- [ ] **Step 4: Grün** – Run: `npx vitest run src/components/shell/CommandPalette.test.tsx` → Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/shell/CommandPalette.tsx src/components/shell/CommandPalette.test.tsx src/test/setup.ts
git commit -m "feat(frontend): Ctrl+K command palette"
```

---

### Task 11: AppShell

**Files:** Create `src/components/shell/AppShell.tsx`

- [ ] **Step 1: Implementierung**

```tsx
import { Menu, Search } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import PendingInvitesBanner from '@/components/PendingInvitesBanner'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Kbd } from '@/components/ui/kbd'
import { TooltipProvider } from '@/components/ui/tooltip'
import { getArea } from '@/lib/routes'
import { resetWorkspaceCache } from '@/lib/workspace'
import { useAuthStore } from '@/store/authStore'
import { useWorkspaceStore } from '@/store/workspaceStore'
import { CommandPalette } from './CommandPalette'
import { ContextNav } from './ContextNav'
import { Rail } from './Rail'

const openPalette = () =>
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true }))

/** Application frame: rail, context column, top bar and page outlet. */
export default function AppShell() {
  const { t } = useTranslation()
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const { user, logout } = useAuthStore()
  const [drawerOpen, setDrawerOpen] = useState(false)
  const hasContext = getArea(pathname).area !== 'overview'

  useEffect(() => setDrawerOpen(false), [pathname])

  const handleLogout = () => {
    resetWorkspaceCache()
    useWorkspaceStore.getState().reset()
    logout()
    navigate('/login')
  }

  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex h-dvh overflow-hidden bg-background text-foreground">
        <div className="hidden md:block">
          <Rail />
        </div>
        {hasContext && (
          <div className="hidden md:block">
            <ContextNav />
          </div>
        )}

        {drawerOpen && hasContext && (
          <div className="fixed inset-0 z-40 md:hidden">
            <button
              type="button"
              aria-label={t('common.close')}
              className="absolute inset-0 bg-background/70 backdrop-blur-sm"
              onClick={() => setDrawerOpen(false)}
            />
            <div className="absolute inset-y-0 left-0 shadow-xl">
              <ContextNav />
            </div>
          </div>
        )}

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex h-12 shrink-0 items-center gap-2 border-b px-3 md:px-5">
            {hasContext && (
              <Button
                variant="ghost"
                size="icon"
                className="md:hidden"
                aria-label={t('nav.open-menu')}
                onClick={() => setDrawerOpen(true)}
              >
                <Menu className="h-5 w-5" />
              </Button>
            )}
            <button
              type="button"
              onClick={openPalette}
              className="ml-auto flex h-8 w-full max-w-64 items-center gap-2 rounded-md border bg-muted/40 px-2.5 text-sm text-muted-foreground transition-colors hover:bg-muted"
            >
              <Search className="h-4 w-4" />
              <span className="flex-1 text-left">{t('cmd.search')}…</span>
              <Kbd>Ctrl K</Kbd>
            </button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="grid h-8 w-8 place-items-center rounded-full bg-secondary text-xs font-semibold text-secondary-foreground"
                  aria-label={t('nav.account')}
                >
                  {(user?.name || user?.email || '?').slice(0, 1).toUpperCase()}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel className="font-normal">
                  <div className="text-sm font-medium">{user?.name}</div>
                  <div className="truncate text-xs text-muted-foreground">{user?.email}</div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => navigate('/account')}>{t('nav.account')}</DropdownMenuItem>
                <DropdownMenuItem onClick={handleLogout}>{t('nav.logout')}</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </header>

          <PendingInvitesBanner />

          <main className="min-h-0 flex-1 overflow-y-auto">
            <Outlet />
          </main>

          <div className="md:hidden">
            <Rail orientation="bottom" />
          </div>
        </div>
      </div>
      <CommandPalette />
    </TooltipProvider>
  )
}
```

- [ ] **Step 2: Typecheck** – Run: `npx tsc --noEmit -p tsconfig.json && npm run lint:colors` → Expected: grün. (Falls `user.name` im Typ fehlt: `authStore.ts` Typ `User` prüfen und `user?.email` als Fallback nutzen.)

- [ ] **Step 3: Commit**

```bash
git add src/components/shell/AppShell.tsx
git commit -m "feat(frontend): app shell with rail, context column and mobile drawer"
```

---

### Task 12: Routen & Weiterleitungen

**Files:** Create `src/components/routing/LegacyRedirects.tsx`, `src/components/routing/ProjectQueryBridge.tsx`, Test `src/components/routing/LegacyRedirects.test.tsx`; Modify `src/App.tsx` (geschützter Routen-Block, Zeilen ~69–126, und Import von `MainLayout`)

- [ ] **Step 1: Failing Test**

```tsx
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/axios', () => ({
  default: { get: vi.fn(() => Promise.resolve({ data: { featureFlag: { id: 'f1', projectId: 'p1' } } })) },
}))

import { LegacyFlagRedirect, ParamRedirect } from './LegacyRedirects'
import { ProjectQueryBridge } from './ProjectQueryBridge'

function Where() {
  const { pathname, search } = useLocation()
  return <div data-testid="where">{pathname + search}</div>
}

describe('legacy redirects', () => {
  it('maps params into a new path', () => {
    render(
      <MemoryRouter initialEntries={['/organizations/o1/members']}>
        <Routes>
          <Route path="/organizations/:orgId/members" element={<ParamRedirect to="/orgs/:orgId/members" />} />
          <Route path="*" element={<Where />} />
        </Routes>
      </MemoryRouter>
    )
    expect(screen.getByTestId('where')).toHaveTextContent('/orgs/o1/members')
  })

  it('resolves the project of an old flag link', async () => {
    render(
      <MemoryRouter initialEntries={['/feature-flags/f1']}>
        <Routes>
          <Route path="/feature-flags/:id" element={<LegacyFlagRedirect />} />
          <Route path="*" element={<Where />} />
        </Routes>
      </MemoryRouter>
    )
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/projects/p1/flags/f1'))
  })

  it('adds projectId as query param for legacy pages', () => {
    render(
      <MemoryRouter initialEntries={['/projects/p1/experiments']}>
        <Routes>
          <Route path="/projects/:projectId/experiments" element={<ProjectQueryBridge><Where /></ProjectQueryBridge>} />
        </Routes>
      </MemoryRouter>
    )
    expect(screen.getByTestId('where')).toHaveTextContent('/projects/p1/experiments?projectId=p1')
  })
})
```

- [ ] **Step 2: Fehlschlag** – Run: `npx vitest run src/components/routing` → Expected: FAIL.

- [ ] **Step 3: `LegacyRedirects.tsx`**

```tsx
import { useEffect, useState } from 'react'
import { Navigate, useParams } from 'react-router-dom'
import api from '@/lib/axios'
import { projectPath } from '@/lib/routes'

/** Redirects to `to`, replacing `:param` placeholders with current params. */
export function ParamRedirect({ to }: { to: string }) {
  const params = useParams()
  const target = to.replace(/:([A-Za-z]+)/g, (_, name: string) => params[name] ?? '')
  return <Navigate to={target} replace />
}

/** Old `/feature-flags/:id` links: look up the flag's project first. */
export function LegacyFlagRedirect() {
  const { id } = useParams()
  const [target, setTarget] = useState<string | null>(null)

  useEffect(() => {
    api
      .get(`/feature-flags/${id}`)
      .then((res) => setTarget(`${projectPath(res.data.featureFlag.projectId, 'flags')}/${id}`))
      .catch(() => setTarget('/overview'))
  }, [id])

  return target ? <Navigate to={target} replace /> : null
}
```

- [ ] **Step 4: `ProjectQueryBridge.tsx`**

```tsx
import { Navigate, useLocation, useParams } from 'react-router-dom'

/**
 * Pages built before the new routes read the project from `?projectId=`.
 * Mirrors the route param into the query until those pages are migrated.
 */
export function ProjectQueryBridge({ children }: { children: React.ReactNode }) {
  const { projectId } = useParams()
  const { pathname, search } = useLocation()
  const params = new URLSearchParams(search)
  if (projectId && params.get('projectId') !== projectId) {
    params.set('projectId', projectId)
    return <Navigate to={`${pathname}?${params}`} replace />
  }
  return <>{children}</>
}
```

- [ ] **Step 5: Grün** – Run: `npx vitest run src/components/routing` → Expected: PASS (3 tests).

- [ ] **Step 6: `App.tsx` umbauen**
  - Import `MainLayout` ersetzen: `import AppShell from './components/shell/AppShell'` und `import { LegacyFlagRedirect, ParamRedirect } from './components/routing/LegacyRedirects'`, `import { ProjectQueryBridge } from './components/routing/ProjectQueryBridge'`.
  - Lazy-Import ergänzen: `const AuditLogs = lazy(() => import('./pages/AuditLogs'))`.
  - Den gesamten geschützten Block (`<Route path="/" element={<ProtectedRoute><MainLayout /></ProtectedRoute>}> … </Route>`) ersetzen durch:

```tsx
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <AppShell />
          </ProtectedRoute>
        }
      >
        <Route index element={<Navigate to="/overview" replace />} />
        <Route path="overview" element={<Dashboard />} />

        {/* Project area */}
        <Route path="projects/:projectId">
          <Route index element={<ParamRedirect to="/projects/:projectId/flags" />} />
          <Route path="flags" element={<ProjectDetail />} />
          <Route path="flags/:id" element={<FeatureFlagDetail />} />
          <Route path="experiments" element={<ProjectQueryBridge><ExperimentsList /></ProjectQueryBridge>} />
          <Route path="experiments/new" element={<ProjectQueryBridge><CreateExperiment /></ProjectQueryBridge>} />
          <Route path="experiments/:id" element={<ExperimentDetail />} />
          <Route path="environments" element={<ProjectSettings />} />
          <Route path="brands" element={<ProjectSettings />} />
          <Route path="brands/:brandId" element={<BrandFlags />} />
          <Route path="sdk" element={<SDKTester />} />
          <Route path="settings" element={<ProjectSettings />} />
        </Route>

        {/* Organization area */}
        <Route path="orgs" element={<OrganizationList />} />
        <Route path="orgs/new" element={<CreateOrganization />} />
        <Route path="orgs/:orgId">
          <Route index element={<ParamRedirect to="/orgs/:orgId/projects" />} />
          <Route path="projects" element={<OrganizationDetail />} />
          <Route path="members" element={<OrganizationMembers />} />
          <Route path="api-keys" element={<ApiKeys />} />
          <Route path="audit-log" element={<AuditLogs />} />
          <Route path="settings" element={<OrganizationSettings />} />
        </Route>

        <Route path="account" element={<Settings />} />

        {/* Legacy URLs (bookmarks, emails) */}
        <Route path="dashboard" element={<Navigate to="/overview" replace />} />
        <Route path="organizations" element={<Navigate to="/orgs" replace />} />
        <Route path="organizations/new" element={<Navigate to="/orgs/new" replace />} />
        <Route path="organizations/:orgId" element={<ParamRedirect to="/orgs/:orgId/projects" />} />
        <Route path="organizations/:orgId/settings" element={<ParamRedirect to="/orgs/:orgId/settings" />} />
        <Route path="organizations/:orgId/members" element={<ParamRedirect to="/orgs/:orgId/members" />} />
        <Route path="organizations/:orgId/projects/:projectId" element={<ParamRedirect to="/projects/:projectId/flags" />} />
        <Route path="projects/:projectId/brands/:brandId/flags" element={<ParamRedirect to="/projects/:projectId/brands/:brandId" />} />
        <Route path="feature-flags" element={<Navigate to="/overview" replace />} />
        <Route path="feature-flags/:id" element={<LegacyFlagRedirect />} />
        <Route path="experiments" element={<Navigate to="/overview" replace />} />
        <Route path="api-keys" element={<Navigate to="/orgs" replace />} />
        <Route path="sdk-tester" element={<Navigate to="/overview" replace />} />
        <Route path="settings" element={<Navigate to="/account" replace />} />

        <Route path="*" element={<Navigate to="/overview" replace />} />
      </Route>
```

  - Die Lazy-Imports für `FeatureFlags` (globale Liste) entfernen.
  - Alle `navigate('/dashboard')`/`<Navigate to="/dashboard" />` in `App.tsx` (öffentliche Routen) auf `/overview` ändern.

- [ ] **Step 7: Interne Links nachziehen** – Run: `grep -rn "'/dashboard'\|\"/dashboard\"\|/organizations/\|/feature-flags/\${\|'/api-keys'\|'/settings'\|'/experiments" src/pages src/components | grep -v "api\.\(get\|post\|patch\|put\|delete\)"`
Jeden Treffer, der eine **Router-Navigation** (`navigate(…)`, `<Link to=…>`, `href`) ist, auf die neuen Pfade umstellen (`/overview`, `orgPath(...)`, `projectPath(...)`, `` `${projectPath(projectId, 'flags')}/${flag.id}` ``). API-Aufrufe (`api.get('/feature-flags/…')`) **nicht** ändern. Weiterleitungen fangen Übersehenes ab, das Ziel ist aber kein Redirect bei internen Klicks.

- [ ] **Step 8: Tests & Build** – Run: `npm test && npx tsc --noEmit -p tsconfig.json && npm run build` → Expected: alles grün.

- [ ] **Step 9: Commit**

```bash
git add src/App.tsx src/components/routing src/pages src/components
git commit -m "feat(frontend): new route structure with legacy redirects"
```

---

### Task 13: Altes Layout & toten Code entfernen

**Files:** Delete `src/components/layout/MainLayout.tsx`, `src/components/Layout.tsx`, `src/components/Header.tsx`, `src/components/Sidebar.tsx`, `src/lib/api-hexagonal.ts`

- [ ] **Step 1: Unbenutzt bestätigen** – Run: `grep -rn "layout/MainLayout\|components/Layout\|components/Header\|components/Sidebar\|api-hexagonal" src` → Expected: keine Treffer außer den Dateien selbst.
- [ ] **Step 2: Löschen** – `git rm src/components/layout/MainLayout.tsx src/components/Layout.tsx src/components/Header.tsx src/components/Sidebar.tsx src/lib/api-hexagonal.ts`
- [ ] **Step 3: Prüfen** – Run: `npm test && npm run build` → Expected: grün.
- [ ] **Step 4: Commit** – `git commit -m "refactor(frontend): remove replaced layout and dead API client"`

---

### Task 14: Visuelle Abnahme

**Files:** keine Repo-Dateien (Screenshots im Scratchpad)

- [ ] **Step 1: Lokal starten** – Backend (Port 4000, `ENABLE_DEMO_RESET=true`), Frontend `npx vite --port 3000`, Demo-Daten via `POST /api/setup/reset-demo`.
- [ ] **Step 2: Screenshots** – mit `puppeteer-core` (im Scratchpad installiert, Edge unter `C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe`): Login als Demo-Nutzer, dann je Seite `/overview`, `/projects/:id/flags`, `/projects/:id/flags/:flagId`, `/orgs/:id/members`, `/account` in Theme `dark` und `light` (`localStorage.setItem('togglely-theme', JSON.stringify({state:{theme:'dark'},version:0}))` vor dem Laden), Viewports 1440×900 und 390×844.
- [ ] **Step 3: Prüfen** – Keine Konsolenfehler (`page.on('console')`), Navigation sichtbar, aktiver Bereich markiert, Text in beiden Themes lesbar. Screenshots an den Nutzer schicken.
- [ ] **Step 4: Abschluss** – `npm test`, `npm run build`, `npx tsc --noEmit -p tsconfig.json`, `npm run lint:colors` grün.

---

## Folge-Pläne (nach Abnahme von Plan 1)

- **Plan 2 – Projekt-Seiten:** `PageHeader`, `PageToolbar`, `DataTable`, `EmptyState`, `ErrorState`, `ConfirmDialog`; Flags-Tabelle (Schalter je Environment), Flag-Detail in Tabs zerlegt, Experimente, Environments/Brands als eigene Seiten (aus `ProjectSettings` herausgelöst), SDK-Tester, Projekt-Einstellungen.
- **Plan 3 – Org/Konto/Auth/Übersicht:** org-gebundene API-Keys & Audit Log, Mitglieder, Org-Einstellungen, Konto-Seite (Profil/Sicherheit/Darstellung), Auth-Seiten, neues Dashboard.
- **Plan 4 – Bereinigung & Feinschliff:** tote Seiten löschen (`pages/{Organizations,Projects,FeatureFlags,OrganizationDetail}.tsx`, `pages/flags/*`), Bibliotheken bereinigen (Heroicons/Headless UI/Base UI), `lint:colors` auf `src/pages` ausweiten, finale Screenshots.
