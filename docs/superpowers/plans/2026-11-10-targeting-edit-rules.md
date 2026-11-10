# Targeting-Regel bearbeiten – Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bestehende Targeting-Regeln lassen sich im Targeting-Tab eines Flags bearbeiten (Paket 1 aus `docs/superpowers/specs/2026-11-10-targeting-improvements-design.md`).

**Architecture:** Nur Frontend. `FlagTargetingTab` bekommt einen Bearbeiten-Modus: derselbe Formular-State wie beim Anlegen, vorbefüllt aus der Regel, gespeichert per bestehendem `PATCH /feature-flags/:flagId/targeting-rules/:ruleId` (Body: `name`, `operator`, `serveValue`, `conditions`; `conditions` ersetzt die Liste komplett). Die Payload-Erzeugung wird in eine reine Hilfsfunktion in `lib/targeting-rules.ts` ausgelagert, damit Anlegen und Bearbeiten sie teilen.

**Tech Stack:** React 19, TypeScript, Vitest + Testing Library, i18next, lucide-react.

---

## Dateien

- Modify: `frontend/src/lib/targeting-rules.ts` – neue Funktion `normalizeConditionValue`
- Modify: `frontend/src/lib/targeting-rules.test.ts` – Tests dafür
- Modify: `frontend/src/pages/projects/flags/detail/FlagTargetingTab.tsx` – Bearbeiten-Modus
- Modify: `frontend/src/pages/projects/flags/detail/FlagDetailPage.test.tsx` – Integrationstests
- Modify: `frontend/src/i18n/locales/en.ts`, `frontend/src/i18n/locales/de.ts` – neue Keys

Befehle (aus `frontend/`):
- Einzeltest: `npx vitest run <pfad>`
- Alles: `npm run build && npx vitest run`
- Lint (aus Repo-Root): `npx @biomejs/biome lint <dateien>`

Hinweis Windows-Checkout: Dateien haben CRLF im Working Tree, Git normalisiert beim Commit. Biome **nicht** mit `--write` auf ganze Dateien loslassen (formatiert fremden Altbestand um); nur `lint` prüfen.

---

### Task 1: Hilfsfunktion `normalizeConditionValue`

Heute steckt die Normalisierung von Listenwerten inline in `handleAddRule` (`FlagTargetingTab.tsx:154-160`). Bearbeiten braucht sie ebenfalls.

**Files:**
- Modify: `frontend/src/lib/targeting-rules.ts` (nach `isListOperator`, Zeile 83)
- Test: `frontend/src/lib/targeting-rules.test.ts`

- [ ] **Step 1: Failing test** – ans Ende von `targeting-rules.test.ts` anhängen (Import `normalizeConditionValue` in den bestehenden Import aus `./targeting-rules` aufnehmen):

```ts
describe('normalizeConditionValue', () => {
  it('trims list entries and drops empty ones for IN / NOT_IN', () => {
    expect(normalizeConditionValue('IN', ' DE, AT ,,CH ')).toBe('DE,AT,CH')
    expect(normalizeConditionValue('NOT_IN', 'x, ')).toBe('x')
  })

  it('keeps other values unchanged', () => {
    expect(normalizeConditionValue('EQUALS', ' DE ')).toBe(' DE ')
  })
})
```

- [ ] **Step 2: Test ausführen** – `npx vitest run src/lib/targeting-rules.test.ts` → FAIL (`normalizeConditionValue` is not exported).

- [ ] **Step 3: Implementierung** in `targeting-rules.ts` nach `isListOperator`:

```ts
/** IN / NOT_IN: comma-separated entries, trimmed, empty ones dropped. */
export function normalizeConditionValue(
  operator: ConditionOperator,
  value: string
): string {
  if (!isListOperator(operator)) return value
  return value
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean)
    .join(',')
}
```

- [ ] **Step 4: Test ausführen** → PASS.

- [ ] **Step 5: `handleAddRule` umstellen** (`FlagTargetingTab.tsx`): den Inline-Block `value: isListOperator(c.operator) ? … : c.value` ersetzen durch `value: normalizeConditionValue(c.operator, c.value)` und `normalizeConditionValue` importieren. Danach `npx vitest run src/pages/projects/flags/detail/FlagDetailPage.test.tsx` → PASS (Test „creates a rule“ erwartet weiterhin `'DE,AT'`).

- [ ] **Step 6: Commit**

```bash
git add frontend/src/lib/targeting-rules.ts frontend/src/lib/targeting-rules.test.ts frontend/src/pages/projects/flags/detail/FlagTargetingTab.tsx
git commit -m "refactor(frontend): extract normalizeConditionValue for targeting rules"
```

---

### Task 2: Integrationstests für das Bearbeiten (rot)

**Files:**
- Modify: `frontend/src/pages/projects/flags/detail/FlagDetailPage.test.tsx` – im `describe('targeting', …)` nach `it('deletes a rule after confirmation', …)` einfügen

- [ ] **Step 1: Tests schreiben**

```tsx
    it('edits a rule', async () => {
      state.rules = [rule()]
      mocks.patch.mockResolvedValue({
        data: {
          rule: rule({
            name: 'Austrian users',
            serveValue: 'false',
            conditions: [
              { id: 'c2', attribute: 'country', operator: 'IN', value: 'AT,CH' },
            ],
          }),
        },
      })
      const user = userEvent.setup()
      renderPage('?tab=targeting')
      await user.click(
        await screen.findByRole('button', { name: 'Edit rule "German users"' })
      )

      // Prefilled from the rule
      expect(screen.getByLabelText(/Rule name/)).toHaveValue('German users')
      expect(screen.getByLabelText('Condition 1 attribute')).toHaveValue(
        'country'
      )
      expect(screen.getByLabelText('Condition 1 value')).toHaveValue('DE')

      await user.clear(screen.getByLabelText(/Rule name/))
      await user.type(screen.getByLabelText(/Rule name/), 'Austrian users')
      await user.selectOptions(
        screen.getByLabelText('Condition 1 operator'),
        'IN'
      )
      await user.clear(screen.getByLabelText('Condition 1 value'))
      await user.type(screen.getByLabelText('Condition 1 value'), 'AT, CH')
      await user.selectOptions(
        screen.getByLabelText('Serve value (BOOLEAN)'),
        'false'
      )
      const form = screen
        .getByLabelText('Condition 1 value')
        .closest('form') as HTMLFormElement
      await user.click(within(form).getByRole('button', { name: 'Save' }))

      await waitFor(() =>
        expect(mocks.patch).toHaveBeenCalledWith(
          `/feature-flags/${FLAG}/targeting-rules/r1`,
          {
            name: 'Austrian users',
            operator: 'AND',
            serveValue: 'false',
            conditions: [
              { attribute: 'country', operator: 'IN', value: 'AT,CH' },
            ],
          }
        )
      )
      expect(await screen.findByText('Austrian users')).toBeInTheDocument()
      expect(screen.queryByText('German users')).not.toBeInTheDocument()
      expect(toast.success).toHaveBeenCalledWith('Targeting rule updated')
      expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument()
    })

    it('clears the rule name when emptied while editing', async () => {
      state.rules = [rule()]
      mocks.patch.mockResolvedValue({ data: { rule: rule({ name: '' }) } })
      const user = userEvent.setup()
      renderPage('?tab=targeting')
      await user.click(
        await screen.findByRole('button', { name: 'Edit rule "German users"' })
      )
      await user.clear(screen.getByLabelText(/Rule name/))
      await user.click(screen.getByRole('button', { name: 'Save' }))
      await waitFor(() =>
        expect(mocks.patch).toHaveBeenCalledWith(
          `/feature-flags/${FLAG}/targeting-rules/r1`,
          expect.objectContaining({ name: '' })
        )
      )
    })

    it('discards edits on cancel', async () => {
      state.rules = [rule()]
      const user = userEvent.setup()
      renderPage('?tab=targeting')
      await user.click(
        await screen.findByRole('button', { name: 'Edit rule "German users"' })
      )
      await user.type(screen.getByLabelText(/Rule name/), ' changed')
      await user.click(screen.getByRole('button', { name: 'Cancel' }))
      expect(mocks.patch).not.toHaveBeenCalled()
      expect(screen.queryByLabelText(/Rule name/)).not.toBeInTheDocument()
      expect(screen.getByText('German users')).toBeInTheDocument()
    })

    it('shows a server error when saving an edit fails', async () => {
      state.rules = [rule()]
      mocks.patch.mockRejectedValue(axiosError(400, 'Invalid regex'))
      const user = userEvent.setup()
      renderPage('?tab=targeting')
      await user.click(
        await screen.findByRole('button', { name: 'Edit rule "German users"' })
      )
      const form = screen
        .getByLabelText('Condition 1 value')
        .closest('form') as HTMLFormElement
      await user.click(within(form).getByRole('button', { name: 'Save' }))
      expect(await within(form).findByRole('alert')).toHaveTextContent(
        'Invalid regex'
      )
      expect(screen.getByLabelText(/Rule name/)).toHaveValue('German users')
    })

    it('closes the edit form when the environment changes', async () => {
      state.rules = [rule()]
      const user = userEvent.setup()
      renderPage('?tab=targeting')
      await user.click(
        await screen.findByRole('button', { name: 'Edit rule "German users"' })
      )
      await user.selectOptions(screen.getByLabelText('Environment'), ENV_PROD)
      expect(screen.queryByLabelText(/Rule name/)).not.toBeInTheDocument()
    })

    it('hides the edit button for viewers', async () => {
      mocks.role = 'VIEWER'
      state.rules = [rule()]
      renderPage('?tab=targeting')
      await screen.findByText('German users')
      expect(
        screen.queryByRole('button', { name: 'Edit rule "German users"' })
      ).not.toBeInTheDocument()
    })
```

Vor dem Schreiben prüfen: Wie setzen bestehende Tests die Rolle zurück (`mocks.role` im `beforeEach`)? Falls nicht zurückgesetzt wird, im neuen VIEWER-Test am Ende `mocks.role = 'ADMIN'` setzen bzw. dem vorhandenen Muster folgen (`grep -n "mocks.role" FlagDetailPage.test.tsx`).

- [ ] **Step 2: Tests ausführen** – `npx vitest run src/pages/projects/flags/detail/FlagDetailPage.test.tsx` → die 5 Edit-Tests FAIL (kein Button „Edit rule …“), der VIEWER-Test PASS (Button gibt es nicht).

---

### Task 3: i18n-Keys

**Files:** `frontend/src/i18n/locales/en.ts`, `frontend/src/i18n/locales/de.ts` – direkt nach `'flag-detail.targeting.created'` einfügen.

- [ ] **Step 1:** en:

```ts
  'flag-detail.targeting.updated': 'Targeting rule updated',
  'flag-detail.targeting.edit-label': 'Edit rule "{{name}}"',
  'flag-detail.targeting.edit-title': 'Edit rule',
```

de:

```ts
  'flag-detail.targeting.updated': 'Targeting-Regel aktualisiert',
  'flag-detail.targeting.edit-label': 'Regel „{{name}}“ bearbeiten',
  'flag-detail.targeting.edit-title': 'Regel bearbeiten',
```

(`common.save` = „Save“/„Speichern“ existiert bereits.)

---

### Task 4: Bearbeiten-Modus in `FlagTargetingTab`

**Files:** `frontend/src/pages/projects/flags/detail/FlagTargetingTab.tsx`

- [ ] **Step 1: State + Import.** `Pencil` zum lucide-Import hinzufügen. Nach `ruleToDelete`-State:

```ts
  /** Rule currently being edited; null = the form creates a new rule. */
  const [editingRule, setEditingRule] = useState<TargetingRule | null>(null)
```

- [ ] **Step 2: `resetForm` erweitert** um `setEditingRule(null)` (letzte Zeile der Funktion).

- [ ] **Step 3: Formular aus einer Regel füllen** (nach `updateCondition`):

```ts
  const startEdit = (rule: TargetingRule) => {
    setEditingRule(rule)
    setRuleName(rule.name ?? '')
    setMatchOperator(rule.operator)
    setConditions(
      rule.conditions.map((c) => ({
        key: ++conditionKeyCounter,
        attribute: c.attribute,
        operator: c.operator,
        value: c.value,
      }))
    )
    setServeValue(rule.serveValue)
    setFormError(null)
    setShowForm(true)
  }
```

- [ ] **Step 4: Submit für beide Modi.** `handleAddRule` umbenennen in `handleSubmitRule`. Gemeinsame Felder einmal bauen, dann je nach Modus POST oder PATCH:

```ts
  const handleSubmitRule = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!environmentId) return

    const fields = {
      operator: matchOperator,
      serveValue,
      conditions: conditions.map((c) => ({
        attribute: c.attribute.trim(),
        operator: c.operator,
        value: normalizeConditionValue(c.operator, c.value),
      })),
    }
    const name = ruleName.trim()

    const validationError = validateRuleInput(flagType, {
      ...fields,
      name: name || undefined,
    })
    if (validationError) {
      setFormError(validationError)
      return
    }

    setSaving(true)
    setFormError(null)
    try {
      if (editingRule) {
        const ruleId = editingRule.id
        // Empty name clears it (backend stores '', list shows "unnamed")
        const response = await api.patch(
          `/feature-flags/${flagId}/targeting-rules/${ruleId}`,
          { name, ...fields }
        )
        const updated: TargetingRule = response.data.rule
        setRules((prev) => prev.map((r) => (r.id === ruleId ? updated : r)))
        toast.success(t('flag-detail.targeting.updated'))
      } else {
        const response = await api.post(
          `/feature-flags/${flagId}/targeting-rules`,
          {
            environmentId,
            name: name || undefined,
            ...fields,
            priority: nextPriority(rules),
            enabled: true,
          }
        )
        setRules((prev) => [...prev, response.data.rule])
        toast.success(t('flag-detail.targeting.created'))
      }
      resetForm()
      setShowForm(false)
    } catch (err) {
      handleForbidden(err, t)
      setFormError(getErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }
```

Achtung Key-Reihenfolge im POST-Body: Der bestehende Test „creates a rule“ vergleicht mit `toHaveBeenCalledWith` (Objektgleichheit, Reihenfolge egal) – passt. Im PATCH-Test ist der Body exakt `{ name, operator, serveValue, conditions }`.

`<form onSubmit={handleAddRule}>` → `onSubmit={handleSubmitRule}`.

- [ ] **Step 5: Löschen der gerade bearbeiteten Regel.** In `handleDeleteRule` nach `setRules(...)`:

```ts
      if (editingRule?.id === ruleId) {
        resetForm()
        setShowForm(false)
      }
```

- [ ] **Step 6: Umgebungswechsel schließt das Formular.** Im `onChange` des Environment-`<select>` statt nur `setFormError(null)`:

```ts
                setEnvironmentId(e.target.value)
                if (editingRule) {
                  resetForm()
                  setShowForm(false)
                } else {
                  setFormError(null)
                }
```

- [ ] **Step 7: „Add rule“-Button im Kopf.** Wenn gerade bearbeitet wird, öffnet der Button ein leeres Anlege-Formular statt zu schließen:

```tsx
            <Button
              onClick={() => {
                if (editingRule) {
                  resetForm()
                  setShowForm(true)
                  return
                }
                if (showForm) resetForm()
                setShowForm(!showForm)
              }}
              disabled={!environmentId}
            >
```

- [ ] **Step 8: Formular-Überschrift und Submit-Label.** Als erstes Kind im `<form>`:

```tsx
          {editingRule && (
            <h3 className="text-sm font-semibold">
              {t('flag-detail.targeting.edit-title')}
            </h3>
          )}
```

Submit-Button:

```tsx
            <Button type="submit" disabled={saving}>
              {saving
                ? t('flag-detail.saving')
                : editingRule
                  ? t('common.save')
                  : t('flag-detail.targeting.add')}
            </Button>
```

- [ ] **Step 9: Bearbeiten-Button pro Regel** im `!readOnly`-Block vor dem Löschen-Button (beide in ein Fragment):

```tsx
                {!readOnly && (
                  <>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-foreground"
                      onClick={() => startEdit(rule)}
                      aria-label={t('flag-detail.targeting.edit-label', {
                        name,
                      })}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    {/* bestehender Löschen-Button unverändert */}
                  </>
                )}
```

- [ ] **Step 10: Doc-Kommentar** über der Komponente: `(list, create, edit, toggle, delete)`.

- [ ] **Step 11: Tests ausführen** – `npx vitest run src/pages/projects/flags/detail/FlagDetailPage.test.tsx` → alle PASS.

- [ ] **Step 12: Commit**

```bash
git add frontend/src/pages/projects/flags/detail/FlagTargetingTab.tsx frontend/src/pages/projects/flags/detail/FlagDetailPage.test.tsx frontend/src/i18n/locales/en.ts frontend/src/i18n/locales/de.ts
git commit -m "feat(frontend): edit existing targeting rules"
```

---

### Task 5: Gesamtprüfung

- [ ] `cd frontend && npm run build` → erfolgreich
- [ ] `npx vitest run` → alle Tests grün (inkl. `src/i18n/locales.test.ts`, prüft die neuen Keys in de/en)
- [ ] Repo-Root: `npx @biomejs/biome lint frontend/src/lib/targeting-rules.ts frontend/src/lib/targeting-rules.test.ts frontend/src/pages/projects/flags/detail/FlagTargetingTab.tsx frontend/src/pages/projects/flags/detail/FlagDetailPage.test.tsx frontend/src/i18n/locales/en.ts frontend/src/i18n/locales/de.ts` → keine Fehler
- [ ] Lokaler Stack: `docker compose up -d --build frontend`, im Browser Flag → Targeting → Regel anlegen, bearbeiten, speichern; Seite neu laden, Änderung bleibt.
