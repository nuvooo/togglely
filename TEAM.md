# Togglely Team-Agenten System

**Version:** 1.0
**Projekt:** Togglely (Feature Toggle Management Platform)
**Versionierung:** [Conventional Commits](https://www.conventionalcommits.org/) + [Semantic Versioning](https://semver.org/)

---

## Team-Rollen

| Rolle | Agent-Datei | Verantwortung |
|-------|------------|---------------|
| Architekt | `.claude/agents/architekt.md` | Systemdesign, Technologieentscheidungen, Skalierbarkeit |
| Open Source Experte | `.claude/agents/opensource.md` | Lizenzen, Dependencies, Community-Standards |
| UI/UX Experte | `.claude/agents/uiux.md` | Design-System, Accessibility, User Experience |
| Developer | `.claude/agents/developer.md` | Implementierung, Code-Qualitat, Performance |
| Tester | `.claude/agents/tester.md` | Teststrategien, QA, CI/CD-Validierung |

---

## Meeting-Protokoll

### Ablauf eines Team-Meetings

Jedes Meeting folgt einem strukturierten 5-Phasen-Ablauf:

#### Phase 1: Briefing (Aufgabe verstehen)
- Der **Architekt** liest die Aufgabe/das Issue und fasst den Kontext zusammen
- Jeder Agent identifiziert Betroffenheit aus seiner Perspektive
- Output: Gemeinsames Verstandnis der Anforderung

#### Phase 2: Analyse (Perspektiven sammeln)
Jeder Agent gibt sein Statement ab:
1. **Architekt**: Auswirkung auf Systemarchitektur, betroffene Module, Risiken
2. **Open Source Experte**: Dependency-Check, Lizenz-Kompatibilitat, existierende Losungen
3. **UI/UX Experte**: User-Impact, Design-Konsistenz, Accessibility
4. **Developer**: Implementierungsaufwand, technische Machbarkeit, Code-Qualitat
5. **Tester**: Teststrategie, Risikobereiche, Regressionsgefahr

#### Phase 3: Diskussion (Beste Losung finden)
- Agenten diskutieren Konflikte und Trade-offs
- Entscheidungen werden mit Begrundung dokumentiert
- Bei Uneinigkeit: Architekt hat finales Entscheidungsrecht

#### Phase 4: Planung (GitHub Issues erstellen)
- Aufgaben werden in GitHub Issues zerlegt
- Jedes Issue bekommt:
  - Klaren Titel mit Prafix (`feat:`, `fix:`, `refactor:`, `test:`, `docs:`, `chore:`)
  - Beschreibung mit Akzeptanzkriterien
  - Labels (siehe unten)
  - Zugewiesene Rolle
- Issues werden mit Abhangigkeiten verknupft

#### Phase 5: Umsetzung & Review
- Developer implementiert
- Tester validiert
- Architekt reviewt Architektur-Konformitat
- UI/UX Experte pruft Frontend-Anderungen
- Open Source Experte pruft neue Dependencies

---

## GitHub Issue Labels

| Label | Beschreibung |
|-------|-------------|
| `role:architekt` | Architektur-Entscheidung erforderlich |
| `role:opensource` | Dependency/Lizenz-Review noetig |
| `role:uiux` | Design/UX-Review noetig |
| `role:developer` | Implementierungsaufgabe |
| `role:tester` | Test-Aufgabe |
| `priority:critical` | Sofort bearbeiten |
| `priority:high` | Naechster Sprint |
| `priority:medium` | Eingeplant |
| `priority:low` | Backlog |
| `type:feature` | Neues Feature |
| `type:bugfix` | Fehlerbehebung |
| `type:refactor` | Code-Verbesserung |
| `type:test` | Test-Erweiterung |
| `type:docs` | Dokumentation |
| `type:chore` | Wartung/Tooling |

---

## Commit-Konvention (Conventional Commits)

### Format

```
<type>(<scope>): <description>

[optional body]

[optional footer(s)]
```

### Types

| Type | SemVer | Beschreibung |
|------|--------|-------------|
| `feat` | MINOR | Neues Feature |
| `fix` | PATCH | Bugfix |
| `refactor` | PATCH | Code-Umstrukturierung ohne Verhaltensanderung |
| `test` | - | Tests hinzufugen/andern |
| `docs` | - | Dokumentation |
| `chore` | - | Build, Tooling, Dependencies |
| `ci` | - | CI/CD-Konfiguration |
| `perf` | PATCH | Performance-Verbesserung |
| `style` | - | Formatierung (kein Code-Change) |

### Breaking Changes

```
feat(api)!: change authentication endpoint

BREAKING CHANGE: /auth/login now requires email instead of username
```

Breaking Changes erhoehen die MAJOR Version.

### Scopes

| Scope | Bereich |
|-------|---------|
| `backend` | Backend/NestJS |
| `frontend` | Frontend/React |
| `sdk` | SDK-Pakete |
| `sdk-core` | SDK Core |
| `sdk-react` | React SDK |
| `sdk-vue` | Vue SDK |
| `sdk-svelte` | Svelte SDK |
| `sdk-vanilla` | Vanilla SDK |
| `api` | API-Endpunkte |
| `auth` | Authentifizierung |
| `flags` | Feature Flags |
| `ui` | UI-Komponenten |
| `db` | Datenbank/Prisma |
| `ci` | CI/CD Pipeline |

---

## Semantic Versioning

```
MAJOR.MINOR.PATCH

Beispiel: 2.1.3
         |  |  |
         |  |  +-- PATCH: Bugfixes, Refactoring (fix, refactor, perf)
         |  +-- MINOR: Neue Features, rueckwaertskompatibel (feat)
         +-- MAJOR: Breaking Changes (feat!, fix!, BREAKING CHANGE)
```

### Versionierung pro Paket

| Paket | Aktuelle Version | Datei |
|-------|-----------------|-------|
| Backend | 2.0.0 | `backend/package.json` |
| Frontend | 1.0.0 | `frontend/package.json` |
| SDK Workspace | 1.1.1 | `sdk/package.json` |

---

## Workflow: Von Issue zu Merge

```
1. Issue erstellen (Team-Meeting Phase 4)
      |
2. Branch erstellen: <type>/<kurzbeschreibung>
      |     feat/add-user-roles
      |     fix/sdk-refresh-strategy
      |     refactor/extract-auth-middleware
      |
3. Implementierung (Developer)
      |
4. Selbsttest (Developer)
      |     npm run build
      |     npm test
      |     npm run biome:check
      |
5. Code Review (Team)
      |     Architekt: Architektur
      |     Tester: Testabdeckung
      |     UI/UX: Frontend-Qualitat
      |     OpenSource: Dependencies
      |
6. CI/CD Pipeline (automatisch)
      |
7. Merge in main
      |
8. Version-Bump + Tag
      |
9. Deployment via Coolify
```

---

## Meeting starten

Um ein Team-Meeting zu starten, verwende:

```
Starte ein Team-Meeting zu: [Aufgabenbeschreibung]
```

Der Ablauf wird automatisch durch alle 5 Phasen gefuehrt.
