# 🔧 CORS Fix Guide

## Schnell-Fix (für Testing)

**In Coolify:**

1. Gehe zu deiner Resource → Backend Service
2. Environment Variables:
   ```
   CORS_ORIGINS=*
   ```
3. **Redeploy** (wichtig!)

Das erlaubt ALLE Origins (nur zum Testen!)

---

## Production CORS Setup

**In Coolify:**

```
CORS_ORIGINS=https://app.deine-domain.de,https://www.deine-website.de
```

**Mehrere Domains mit Komma trennen!**

---

## Testen ob CORS funktioniert

### Option 1: PowerShell Script
```powershell
.\test-cors.ps1 -BackendUrl "https://api.deine-domain.de"
```

### Option 2: Browser Test
1. Öffne `test-cors.html` im Browser
2. Fülle deine Backend URL ein
3. Klicke "Test SDK"

### Option 3: curl
```bash
# Mit Origin Header (simuliert Browser)
curl -H "Origin: https://deine-app.de" \
  -I "https://api.deine-domain.de/health"

# Sollte zurückgeben:
# access-control-allow-origin: https://deine-app.de
```

---

## Häufige CORS Fehler

### "No 'Access-Control-Allow-Origin' header"
```
CORS_ORIGINS ist nicht gesetzt oder falsch
```
**Fix:** `CORS_ORIGINS=*` setzen und redeployen

### "Origin not allowed"
```
Deine Domain ist nicht in CORS_ORIGINS
```
**Fix:** Domain zur Liste hinzufügen

### "CORS policy: No 'Access-Control-Allow-Origin'"
```
Backend blockiert den Origin
```
**Fix:** In Coolify Logs prüfen:
```
[CORS] BLOCKED origin: https://deine-app.de
[CORS] Allowed origins: ["https://..."]
```

---

## CORS in Backend Logs

Nach dem Deploy solltest du sehen:
```
[CORS] Configuration:
[CORS] CORS_ORIGINS env: "https://app.deine-domain.de"
[CORS] Parsed origins: ["https://app.deine-domain.de"]
```

Oder für Wildcard:
```
[CORS] Parsed origins: ALLOWING ALL (*)
```

---

## WICHTIG: CORS vs SDK "immer false"

Diese sind **unterschiedliche Probleme**:

| Symptom | Problem | Lösung |
|---------|---------|--------|
| Browser zeigt CORS Error in Console | CORS falsch konfiguriert | `CORS_ORIGINS` setzen |
| SDK gibt `false` zurück, kein CORS Error | Flag ist disabled | Im Dashboard aktivieren |
| SDK gibt `null` zurück | API Key falsch | Neuen Key erstellen |

**Reihenfolge:**
1. Zuerst CORS fixen (siehe oben)
2. Dann testen ob Requests durchkommen
3. Dann prüfen ob Werte richtig sind

---

## Test nach CORS Fix

```bash
# 1. Backend neu deployen
# 2. Warten bis gestartet
# 3. Test:

curl -H "Origin: https://deine-app.de" \
  "https://api.deine-domain.de/sdk/flags/proj/env/flag?apiKey=xxx"

# Sollte zurückgeben:
# HTTP 200
# access-control-allow-origin: https://deine-app.de
# {"value": true/false, "enabled": true/false}
```

Wenn das klappt, funktioniert CORS! 🎉
