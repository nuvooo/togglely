# KI-Assistenten Regeln (Kurzfassung)

**Diese Regeln sind BINDEND.** Bei Konflikt: Lieber zu vorsichtig als zu nachlässig.

---

## Die 7 Pflichten

### 1. Getestet
```bash
# Vor JEDEM Commit:
npm run build      # Muss kompilieren
npm test           # Muss grün sein
npm run lint       # Keine Errors
```

### 2. Best Practices
- Single Responsibility
- Dependency Injection
- Service Layer für Business Logic
- Repository Pattern für DB

### 3. Lint/Format
```bash
npm run lint:fix
npm run format
# Keine Ausnahmen, keine eslint-disable
```

### 4. Null Safety
```typescript
// Immer:
if (!entity) { return 404; }

// Nie:
res.json(entity.name);  // Kann crashen!
```

### 5. Zero Trust
- Jeder Input validieren (Zod)
- Jeder Endpoint authentifizieren
- Nie `*` für CORS in Prod
- API Keys nie loggen

### 6. Dokumentiert
- JSDoc für alle public Functions
- README bei API-Änderungen
- ADR für Architektur-Entscheidungen

### 7. SDK-Getestet
```bash
cd sdk/core
npm run test:integration  # Muss laufen
```

---

## Deployment-Fails verhindern

**Prisma Schema geändert?**
```bash
npx prisma migrate dev --name beschreibung
# Migration einchecken!
```

**Neue Env Variable?**
- In `.env.example` dokumentieren
- In Coolify setzen
- In README beschreiben

**Backend + Frontend betroffen?**
- Backend zuerst deployen
- Frontend erst danach
- Oder: Beide gleichzeitig, nie Frontend vor Backend

---

## Die 3 Goldenen Fragen

Vor jedem Commit fragen:

1. **"Kompiliert es?"** → `npm run build`
2. **"Läuft es in Docker?"** → `docker-compose up --build`
3. **"Was passiert bei Fehlern?"** → Error Handling prüfen

---

## Sofort-Stop-Signale

**Wenn du siehst:**
- ❌ "any" als Type
- ❌ `console.log` im Code
- ❌ `// @ts-ignore`
- ❌ `/* eslint-disable */`
- ❌ Unbehandelte Promises
- ❌ Kein Error Handling

**Dann:** Stoppen, beheben, erst dann weiter.

---

## Produktions-Checkliste

- [ ] Build erfolgreich
- [ ] Tests grün
- [ ] Lint sauber
- [ ] Prisma Schema migrated (falls nötig)
- [ ] Env Vars gesetzt
- [ ] SDK Tests OK
- [ ] Breaking Changes dokumentiert

---

## Notfall

**Produktion down?**
1. Coolify → Restart
2. Logs prüfen
3. Rollback zu letztem funktionierenden Commit
4. Fix entwickeln → Durch alle 7 Pflichten
5. Erst dann redeployen

---

**Merksatz:** *Lieber langsam und richtig, als schnell und kaputt.*
