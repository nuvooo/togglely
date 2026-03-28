# Togglely KI-Entwicklungsrichtlinien

**Version:** 1.0  
**Gültig für:** Alle KI-Assistenten, die an diesem Projekt arbeiten  
**Status:** Pflichtlektüre vor jeder Änderung

---

## 1. Goldene Regel: Produktionszuerst-Denken

**Jede Änderung muss produktionstauglich sein.**

- Lokales Funktionieren ≠ Produktionsfähig
- Nie davon ausgehen, dass "nur lokale Tests" ausreichen
- Deployment-Prozess (Coolify/Docker) immer im Blick behalten
- Datenbankmigrationen und Schema-Änderungen besonders kritisch prüfen

---

## 2. Das Sieben-Punkte-Regelwerk

### 2.1 Alles ist immer getestet

**Vor jedem Commit:**

```bash
# 1. TypeScript kompiliert?
npm run build

# 2. Unit Tests bestehen?
npm test

# 3. Integration Tests (gegen lokalen Docker)
npm run test:integration

# 4. Linting sauber?
npm run lint
```

**Test-Anforderungen:**
- Mindestens 80% Code-Coverage für neue Features
- Integration Tests für alle API-Endpunkte
- SDK-Tests für jede SDK-Änderung
- Fehlerfälle müssen explizit getestet werden (nicht nur Happy Path)

**Verboten:**
- Code pushen, der nicht kompiliert
- Tests auskommentieren, um sie "grün" zu machen
- "Wird schon gehen"-Mentalität

---

### 2.2 Best Practices strikt einhalten

**Architektur:**
- Single Responsibility Principle
- Dependency Injection für testbaren Code
- Keine Geschäftslogik in Controllern (Services verwenden)
- Repository Pattern für Datenbankzugriff

**Code-Struktur:**
```typescript
// ✅ Richtig: Klare Trennung, Error Handling, Validierung
export const createFeatureFlag = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { name, key, projectId } = req.body;
    
    // Validierung
    if (!name || !key) {
      res.status(400).json({ error: 'Name and key are required' });
      return;
    }
    
    // Service-Aufruf
    const flag = await featureFlagService.create({
      name,
      key,
      projectId,
      createdById: req.user!.userId
    });
    
    res.status(201).json(flag);
  } catch (error) {
    next(error);
  }
};

// ❌ Falsch: Logik im Controller, keine Validierung, kein Error Handling
export const badExample = async (req, res) => {
  const flag = await prisma.featureFlag.create({ data: req.body });
  res.json(flag);
};
```

---

### 2.3 Zero Lint/Format Errors

**Konfiguration:**
- ESLint und Prettier sind Pflicht
- Keine Ausnahmen, keine `// eslint-disable` ohne Begründung
- Pre-commit Hooks müssen durchlaufen

**Vor jedem Commit:**
```bash
npm run lint:fix
npm run format
```

**Wenn Linting fehlschlägt:**
1. Nicht einfach ausschalten
2. Problem verstehen und beheben
3. Bei Unsicherheit: TypeScript Strict Mode befolgen

---

### 2.4 Null Safety (Strict TypeScript)

**Konfiguration:**
```json
// tsconfig.json
{
  "compilerOptions": {
    "strict": true,
    "strictNullChecks": true,
    "noImplicitAny": true,
    "noUncheckedIndexedAccess": true
  }
}
```

**Pflicht bei jedem Type:**
```typescript
// ✅ Richtig: Explizite Null-Handling
interface User {
  id: string;
  email: string;
  firstName: string | null;  // Kann null sein
  lastName?: string;          // Kann undefined sein
}

function getUserName(user: User | null | undefined): string {
  if (!user) return 'Anonymous';
  return `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim();
}

// ❌ Falsch: Implizite Any, keine Null-Checks
function bad(user: any) {
  return user.name;  // Kann crashen!
}
```

**Datenbank-Queries:**
```typescript
// ✅ Immer mit Null-Check
const project = await prisma.project.findUnique({...});
if (!project) {
  res.status(404).json({ error: 'Project not found' });
  return;
}

// ❌ Nie so:
res.json(project.name);  // Crash wenn project null!
```

---

### 2.5 Zero Trust Security

**Prinzip:** Niemals dem Client vertrauen, immer validieren.

**Input-Validierung:**
```typescript
// ✅ Jeder Input wird validiert
import { z } from 'zod';

const createProjectSchema = z.object({
  name: z.string().min(1).max(100),
  key: z.string().regex(/^[a-z0-9-]+$/),
  type: z.enum(['SINGLE', 'MULTI'])
});

export const createProject = async (req, res, next) => {
  try {
    const data = createProjectSchema.parse(req.body);
    // ...
  } catch (error) {
    res.status(400).json({ error: 'Invalid input' });
  }
};
```

**Authentifizierung & Autorisierung:**
- Jeder Endpoint prüft Auth (außer explizit öffentliche)
- Ressourcen gehören immer einem User/Org - das prüfen!
- API Keys niemals loggen oder exponieren
- CORS strikt konfigurieren (kein `*` in Produktion)

**Datenbank:**
- Nie String-Concatenation für Queries (SQL Injection!)
- Immer Prisma Parameterized Queries verwenden
- Cascading Deletes explizit definieren

---

### 2.6 Dokumentation

**Jede Änderung muss dokumentiert:**

1. **Code-Kommentare:**
```typescript
/**
 * Evaluates a feature flag for a given context.
 * @param flagKey - Unique identifier of the flag
 * @param context - User context (userId, tenantId, etc.)
 * @returns Flag value and enabled status
 * @throws {NotFoundError} If flag doesn't exist
 */
export async function evaluateFlag(
  flagKey: string, 
  context: Context
): Promise<FlagResult> {
  // Implementation...
}
```

2. **API-Änderungen in README.md:**
- Neue Endpunkte dokumentieren
- Breaking Changes markieren
- Request/Response Beispiele

3. **Architektur-Entscheidungen:**
- In `docs/adr/` (Architecture Decision Records)
- Warum wurde diese Lösung gewählt?
- Welche Alternativen wurden verworfen?

4. **Deployment-Notizen:**
- Neue Environment Variables?
- Datenbank-Migrationen nötig?
- Breaking Changes für Clients?

---

### 2.7 SDK-Tests Pflicht

**Jede Backend-Änderung die den SDK betrifft:**

1. **SDK Integration Tests laufen lassen:**
```bash
cd sdk/core
npm run test:integration
```

2. **Manueller Test mit echtem SDK:**
```typescript
// Test-Script
import { TogglelyClient } from '@togglely/sdk-core';

const client = new TogglelyClient({
  apiKey: 'test-key',
  project: 'test-project',
  environment: 'development',
  baseUrl: 'http://localhost:4000'
});

// Feature testen
const value = await client.getValue('test-flag');
console.log('SDK Test:', value);
```

3. **Produktions-SDK-Test:**
- Nach Deployment: Echte API-Keys testen
- CORS-Origin testen
- Error-Handling testen (was passiert bei 401?)

---

## 3. Deployment-Checkliste

**Vor jedem Deployment:**

- [ ] `npm run build` erfolgreich
- [ ] `npm test` alle grün
- [ ] `npm run lint` keine Fehler
- [ ] Integration Tests gegen lokalen Docker OK
- [ ] Prisma Schema migrated (falls nötig)
- [ ] Environment Variables dokumentiert
- [ ] SDK Tests erfolgreich
- [ ] Breaking Changes kommuniziert

**Nach dem Deployment:**

- [ ] Health Check Endpoint prüfen: `GET /health`
- [ ] Logs auf Errors prüfen
- [ ] SDK Test gegen Produktion
- [ ] Frontend Basics testen (Login, Projekt anzeigen)

---

## 4. Datenbank-Änderungen

**Prisma Schema Änderungen:**

1. **Nie direkt in Produktion ändern!**
2. Migration erstellen:
   ```bash
   npx prisma migrate dev --name add_allowed_origins
   ```
3. Migration testen in lokalem Docker
4. Migration script in `prisma/migrations/` einchecken
5. Deployment: Migration läuft automatisch

**Breaking Schema Changes:**
- Feld umbenennen = Migration + Code-Update gleichzeitig
- Feld löschen = Zuerst Code anpassen (optional machen), dann Migration
- Nie Daten verlieren!

---

## 5. Debugging-Regeln

**Wenn etwas nicht funktioniert:**

1. **Logs lesen** (nicht raten!)
   ```bash
   docker-compose logs backend --tail 100
   ```

2. **Schritt-für-Schritt testen:**
   - Datenbank erreichbar?
   - Backend startet?
   - Health Check OK?
   - Einzelner Endpoint testbar?

3. **Nie "quick fixes" ohne Verständnis:**
   - Warum crasht es wirklich?
   - Was hat sich zuletzt geändert?
   - Reproduzierbarer Test Case?

4. **Rollback-Plan immer parat:**
   - Letzte funktionierende Version kennen
   - Schnelles Downgrade möglich?

---

## 6. Verbotene Praktiken

❌ **Nie tun:**

- Code pushen der nicht kompiliert
- Tests ignorieren/weglassen
- `console.log` in Produktions-Code lassen
- Secrets in Code committen
- Datenbank-Schema ohne Migration ändern
- "Es wird schon gehen"-Mentalität
- CORS auf `*` setzen in Produktion
- Error-Messages mit Stacktraces an Client senden
- API Keys in Logs ausgeben

---

## 7. Checkliste für Code-Reviews

**Vor dem Merge:**

- [ ] TypeScript strict kompiliert
- [ ] Tests vorhanden und grün
- [ ] Keine Lint-Fehler
- [ ] Null Safety gewährleistet
- [ ] Error Handling vorhanden
- [ ] Dokumentation aktualisiert
- [ ] Security geprüft (Input-Validierung, Auth)
- [ ] SDK Tests laufen
- [ ] Breaking Changes dokumentiert

---

## 8. Notfall-Protokoll

**Wenn Produktion down ist:**

1. **Sofort:** Coolify Dashboard → Restart
2. **Logs prüfen:** Wo crasht es?
3. **Letzte funktionierende Version:** Git commit hash finden
4. **Rollback:** `git revert` oder Coolify → vorheriges Deployment
5. **Post-Mortem:** Was ist schiefgelaufen? Wie verhindern?

---

**Letzte Aktualisierung:** 2026-03-16  
**Verantwortlich:** Entwicklungs-Team + KI-Assistenten

**Wichtig:** Diese Richtlinien sind bindend. Bei Unsicherheit: Lieber über- als unter-engineeren.
