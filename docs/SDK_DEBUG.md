# SDK Debug Guide - "Immer false" Problem

Wenn deine SDK immer `false` zurückgibt, obwohl die Flags im Dashboard aktiviert sind, folge dieser Anleitung.

## Schnell-Check

### 1. Backend Logs prüfen

Deploye das aktualisierte Backend (mit dem neuen Logging), dann schaue in die Logs:

```bash
# Coolify Logs
docker-compose logs -f backend

# Oder direkt im Container
docker exec togglely-backend tail -f /var/log/app.log
```

**Was du sehen solltest:**
```
[SDK] Request: /sdk/flags/my-project/production/my-flag
[SDK] API Key present: true, Origin: https://meine-app.de
[SDK Service] Validating API key for project: my-project
[SDK Service] API key found, org: xxx
[SDK Service] Project found: yyy
[SDK Service] Environment found: zzz
[SDK Service] Flag found: aaa, type: BOOLEAN
[SDK Service] FlagEnvironment: enabled=true, value=true
[SDK] Success: my-flag = { value: true, enabled: true, flagType: 'BOOLEAN' }
```

**Wenn du das siehst, ist alles OK!**

---

## Häufige Probleme

### Problem 1: "Invalid API key" (401)

**Symptom:**
```json
{ "error": "Invalid API key", "code": "INVALID_API_KEY" }
```

**Lösung:**
1. Gehe zum Togglely Dashboard
2. Einstellungen → API Keys
3. Erstelle einen neuen **SDK** Key (nicht Admin!)
4. Kopiere den **vollständigen** Key
5. Achte auf Tippfehler (Leerzeichen, Groß-/Kleinschreibung)

**Test:**
```bash
curl "https://api.deine-domain.de/sdk/flags/my-project/production/my-flag?apiKey=DEIN_KEY"
```

---

### Problem 2: "Origin not allowed" (403)

**Symptom:**
```json
{ "error": "Origin not allowed", "code": "ORIGIN_NOT_ALLOWED" }
```

**Lösung:**
1. Dashboard → Projekt → Einstellungen
2. "Allowed Origins" hinzufügen:
   - `https://meine-app.de` (genaue Domain)
   - `*` (alle Domains - nur für Testing!)
   - `*.meine-domain.de` (alle Subdomains)
3. Speichern & Backend neu starten

**Test:**
```bash
# Mit Origin Header
curl -H "Origin: https://meine-app.de" \
  "https://api.deine-domain.de/sdk/flags/...?apiKey=xxx"
```

---

### Problem 3: "Project not found" (404)

**Symptom:**
```json
{ "error": "Project not found", "code": "PROJECT_NOT_FOUND" }
```

**Lösung:**
Überprüfe den Project Key:
- Dashboard zeigt: "My Project"
- Aber der **Key** ist: `my-project` (klein, mit Bindestrichen)
- URL: `https://api.../sdk/flags/my-project/...` (nicht "My Project")

---

### Problem 4: "Environment not found" (404)

**Symptom:**
```json
{ "error": "Environment not found", "code": "ENV_NOT_FOUND" }
```

**Lösung:**
- Standard: `development`, `production`, `staging`
- Groß-/Kleinschreibung beachten!
- URL: `/sdk/flags/my-project/development/...`

---

### Problem 5: Flag ist "disabled" obwohl aktiviert

**Symptom:**
```json
{ "value": false, "enabled": false, "flagType": "BOOLEAN" }
```

**Aber im Dashboard ist es aktiviert!**

**Ursachen:**

1. **Falsche Environment**
   - Dashboard zeigt: Production = ✅ aktiviert
   - SDK fragt: Development → ❌ nicht aktiviert
   - Lösung: Gleiche Environment verwenden

2. **Falsches Flag**
   - Dashboard: `dark-mode`
   - SDK: `darkmode` (ohne Bindestrich)
   - Lösung: Exakten Flag-Key verwenden

3. **Brand/Tenant spezifisch**
   - Projekt ist "Multi-Brand"
   - Flag ist für Brand "acme" aktiviert
   - SDK fragt ohne Brand → default (aus)
   - Lösung: `?brandKey=acme` oder `?tenantId=acme` hinzufügen

4. **Cache**
   - SDK cached Ergebnisse
   - Lösung: `client.refresh()` aufrufen

---

## Debug Script verwenden

### Node.js (Cross-Platform)

```bash
node test-sdk.js https://api.deine-domain.de DEIN_API_KEY mein-project production mein-flag
```

### PowerShell (Windows)

```powershell
.\test-sdk.ps1 -BackendUrl "https://api.deine-domain.de" `
  -ApiKey "DEIN_API_KEY" `
  -Project "mein-project" `
  -Environment "production" `
  -Flag "mein-flag"
```

### cURL (Schnell-Test)

```bash
# Health Check
curl https://api.deine-domain.de/health

# Single Flag
curl "https://api.deine-domain.de/sdk/flags/PROJECT/ENV/FLAG?apiKey=KEY"

# All Flags
curl "https://api.deine-domain.de/sdk/flags/PROJECT/ENV?apiKey=KEY"

# Mit Brand
curl "https://api.deine-domain.de/sdk/flags/PROJECT/ENV/FLAG?apiKey=KEY&brandKey=BRAND"
```

---

## Browser Debug

Öffne die Browser DevTools (F12) → Network Tab:

1. **Suche den SDK Request**
   - URL sollte: `https://api.../sdk/flags/...` sein
   - Status sollte: `200 OK` sein

2. **Prüfe die Response**
   ```json
   {
     "value": true,      // ← Das ist der Wert
     "enabled": true,    // ← Ist es aktiviert?
     "flagType": "BOOLEAN"
   }
   ```

3. **Falls 401/403:**
   - Response Tab zeigt genauen Fehler
   - Siehe oben "Häufige Probleme"

---

## CORS Debug

Falls der Browser CORS blockt:

```
Access to fetch at 'https://api...' from origin 'https://app...' 
has been blocked by CORS policy
```

**Lösung:**

1. Backend Env-Variable setzen:
   ```env
   CORS_ORIGINS=https://app.deine-domain.de,https://meine-app.de
   ```

2. Backend neu starten

3. Prüfen mit:
   ```bash
   curl -H "Origin: https://meine-app.de" \
     -I "https://api.deine-domain.de/sdk/flags/..."
   ```
   
   Sollte enthalten:
   ```
   access-control-allow-origin: https://meine-app.de
   ```

---

## Noch immer Probleme?

Schicke mir:
1. Output vom Debug Script
2. Screenshot vom Dashboard (Flag-Einstellungen)
3. Deine SDK Config (ohne API Key!)
4. Backend Logs (letzte 50 Zeilen)

Dann können wir genauer schauen!
