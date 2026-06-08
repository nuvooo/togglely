---
name: team-meeting
description: "Strukturiertes Team-Meeting mit allen 5 Rollen (Architekt, Open Source Experte, UI/UX Experte, Developer, Tester). Fuehrt systematisch durch Briefing, Analyse, Diskussion, Planung und dokumentiert alles in einem Meeting-Protokoll."
category: workflow
user-invocable: true
metadata:
  version: "1.0.0"
  author: "togglely"
---

# Team-Meeting Skill

Dieser Skill orchestriert ein strukturiertes Team-Meeting gemaess dem Protokoll in `.claude/TEAM.md`. Alle 5 Rollen kommen zu Wort, Entscheidungen werden dokumentiert und als Protokoll-Datei gespeichert.

## Aufruf

- `/team-meeting <Aufgabenbeschreibung>` — Volles Meeting (5 Phasen)
- `/team-meeting --kurz <Aufgabenbeschreibung>` — Kurz-Meeting (3 Phasen)
- `Starte ein Team-Meeting zu: <Aufgabe>` — Volles Meeting
- `Kurzes Team-Meeting zu: <Aufgabe>` — Kurz-Meeting

---

## Vorbereitung

Bevor das Meeting beginnt:

1. Lies `.claude/TEAM.md` fuer das vollstaendige Protokoll
2. Lies die Agenten-Dateien der 5 Rollen:
   - `.claude/agents/architekt.md`
   - `.claude/agents/opensource.md`
   - `.claude/agents/uiux.md`
   - `.claude/agents/developer.md`
   - `.claude/agents/tester.md`
3. Falls ein GitHub Issue angegeben wurde: `gh issue view <nummer>` ausfuehren
4. Bestimme ob volles oder kurzes Meeting (siehe Kriterien unten)

---

## Rollen und Skill-Zuordnung

Jede Rolle konsultiert ihre zugehoerigen Skills waehrend der Analyse:

| Rolle | Konsultierte Skills | Fokus |
|-------|-------------------|-------|
| Architekt | `nestjs-best-practices`, `docker-expert` | Architektur, Module, Skalierbarkeit |
| Open Source Experte | `open-source-strategy` | Lizenzen, Dependencies, Oekosystem |
| UI/UX Experte | `ui-ux-pro-max`, `next-best-practices` | Design, Accessibility, UX |
| Developer | `nestjs-best-practices`, `next-best-practices`, `docker-expert` | Implementierung, Code-Qualitaet |
| Tester | *(keine eigene Skill-Datei)* | Teststrategie, Abdeckung, Regression |

**Wichtig:** "Konsultieren" bedeutet die relevanten Abschnitte des Skills lesen und deren Regeln in die Bewertung einfliessen lassen — nicht nur erwaehnen.

---

## Volles Meeting (5 Phasen)

### Phase 1: Briefing

**Ziel:** Gemeinsames Verstaendnis der Aufgabe herstellen.

1. **Architekt** fasst die Aufgabe zusammen (Kontext, Ziel, betroffene Bereiche)
2. Jede Rolle fuehrt einen **Relevanz-Check** durch:

```
### Relevanz-Matrix

| Rolle               | Relevanz           | Begruendung        |
|---------------------|--------------------|--------------------|
| Architekt           | Voll / Teilweise / Nicht betroffen | ... |
| Open Source Experte  | Voll / Teilweise / Nicht betroffen | ... |
| UI/UX Experte        | Voll / Teilweise / Nicht betroffen | ... |
| Developer            | Voll / Teilweise / Nicht betroffen | ... |
| Tester               | Voll / Teilweise / Nicht betroffen | ... |
```

### Phase 2: Analyse

**Ziel:** Jede Rolle gibt ihr fachliches Statement ab.

Reihenfolge (fest):
1. **Architekt** — Architektur-Impact, betroffene Module, Risiken, Pattern-Empfehlungen
2. **Open Source Experte** — Dependency-Check, Lizenz-Kompatibilitaet, existierende Loesungen
3. **UI/UX Experte** — User-Impact, Design-Konsistenz, Accessibility
4. **Developer** — Implementierungsaufwand, technische Machbarkeit, Code-Qualitaet
5. **Tester** — Teststrategie, Risikobereiche, Regressionsgefahr

**Regeln:**
- Max 5-7 Saetze pro Statement (praezise bleiben)
- Konsultierte Skills mit `> Konsultierte Skills: skill-name` angeben
- Rollen mit "Nicht betroffen" geben ein kurzes "Keine Betroffenheit aus meiner Perspektive, keine Einwaende." ab
- Jede Rolle nutzt das Output-Format aus ihrer Agenten-Datei
- Keine Wiederholung: Auf vorherige Statements aufbauen oder widersprechen

### Phase 3: Diskussion

**Ziel:** Konflikte loesen, Trade-offs abwaegen, Entscheidungen treffen.

1. Identifiziere Konflikte zwischen den Statements aus Phase 2
2. Diskutiere Trade-offs offen
3. Dokumentiere jede Entscheidung:

```
| # | Thema | Optionen | Entscheidung | Begruendung |
|---|-------|----------|-------------|-------------|
| 1 | ...   | A / B    | A           | ...         |
```

4. **Architekt hat finales Entscheidungsrecht** bei Uneinigkeit
5. Falls keine Konflikte: "Konsens erreicht — keine offenen Punkte."

### Phase 4: Planung

**Ziel:** Aufgaben in konkrete Work Items zerlegen.

Erstelle eine Tabelle der geplanten Issues:

```
| # | Titel                  | Labels                         | Zugewiesen | Abhaengigkeit |
|---|------------------------|-------------------------------|-----------|---------------|
| 1 | feat(scope): ...       | role:developer, type:feature  | Developer | -             |
| 2 | test(scope): ...       | role:tester, type:test        | Tester    | #1            |
```

Fuer jedes Issue zusaetzlich:
- **Beschreibung** mit Kontext
- **Akzeptanzkriterien** als Checkliste

**Wichtig:** Issues werden NUR dokumentiert, NICHT automatisch erstellt. Der User entscheidet selbst, ob Issues angelegt werden sollen.

### Phase 5: Naechste Schritte

**Ziel:** Klare Action Items und Review-Zuordnung.

```
| # | Aufgabe          | Verantwortlich | Prioritaet |
|---|-----------------|---------------|-----------|
| 1 | ...             | Developer      | high      |
```

Review-Zuordnung:
- Architekt reviewt: Architektur-Konformitaet
- Tester reviewt: Testabdeckung
- UI/UX Experte reviewt: Frontend-Aenderungen
- Open Source Experte reviewt: Neue Dependencies

---

## Kurz-Meeting (3 Phasen)

**Wann:** Fuer kleine, klar abgegrenzte Aufgaben:
- Single-File Aenderungen
- Dokumentations-Updates
- Minor Bugfixes
- Config-Aenderungen
- Wenn der User `--kurz` angibt

### Phase 1: Kontext (kurz)

Architekt fasst in 2-3 Saetzen zusammen. Relevanz-Matrix entfaellt.

### Phase 2: Analyse + Entscheidung (kombiniert)

Alle relevanten Rollen geben in einer Runde ihr Statement ab (max 2-3 Saetze pro Rolle). Irrelevante Rollen werden uebersprungen. Entscheidungen werden direkt getroffen.

### Phase 3: Action Items

Einfache Todo-Liste statt formaler GitHub Issues:

```
- [ ] Aufgabe 1 (Developer)
- [ ] Aufgabe 2 (Tester)
```

---

## Protokoll-Format

Das Meeting wird als Markdown-Datei mit YAML-Frontmatter gespeichert:

```markdown
---
datum: YYYY-MM-DD
thema: "<Thema>"
typ: voll | kurz
teilnehmer:
  - rolle: Architekt
    relevanz: voll | teilweise | nicht betroffen
  - rolle: Open Source Experte
    relevanz: voll | teilweise | nicht betroffen
  - rolle: UI/UX Experte
    relevanz: voll | teilweise | nicht betroffen
  - rolle: Developer
    relevanz: voll | teilweise | nicht betroffen
  - rolle: Tester
    relevanz: voll | teilweise | nicht betroffen
---

# Team-Meeting: <Thema>

**Datum:** YYYY-MM-DD
**Typ:** Volles Meeting | Kurz-Meeting
**Ausloeser:** <Issue-Link oder Beschreibung>

---

## Phase 1: Briefing

### Zusammenfassung
<Architekt fasst die Aufgabe zusammen>

### Relevanz-Matrix

| Rolle | Relevanz | Begruendung |
|-------|----------|-------------|
| ... | ... | ... |

---

## Phase 2: Analyse

### Architekt
> Konsultierte Skills: nestjs-best-practices, docker-expert

<Statement>

### Open Source Experte
> Konsultierte Skills: open-source-strategy

<Statement>

### UI/UX Experte
> Konsultierte Skills: ui-ux-pro-max, next-best-practices

<Statement>

### Developer
> Konsultierte Skills: nestjs-best-practices, next-best-practices

<Statement>

### Tester

<Statement>

---

## Phase 3: Diskussion

### Identifizierte Konflikte
<Liste der Konflikte oder "Keine Konflikte — Konsens erreicht.">

### Entscheidungen

| # | Thema | Optionen | Entscheidung | Begruendung |
|---|-------|----------|-------------|-------------|
| ... | ... | ... | ... | ... |

---

## Phase 4: Planung

### Geplante Issues

| # | Titel | Labels | Zugewiesen | Abhaengigkeit |
|---|-------|--------|-----------|---------------|
| ... | ... | ... | ... | ... |

### Issue-Details

#### Issue 1: <Titel>
**Beschreibung:** ...
**Akzeptanzkriterien:**
- [ ] ...

---

## Phase 5: Naechste Schritte

### Action Items

| # | Aufgabe | Verantwortlich | Prioritaet |
|---|---------|---------------|-----------|
| ... | ... | ... | ... |

### Review-Zuordnung

| Reviewer | Prueft |
|----------|--------|
| Architekt | Architektur-Konformitaet |
| Tester | Testabdeckung |
| UI/UX Experte | Frontend-Aenderungen |
| Open Source Experte | Neue Dependencies |

---

*Protokoll erstellt am YYYY-MM-DD durch Team-Meeting Skill v1.0.0*
```

---

## Protokoll speichern

1. Speichere das Protokoll unter: `docs/meetings/YYYY-MM-DD-<topic-slug>.md`
2. **Topic-Slug:** Kleinbuchstaben, Kebab-Case, max 50 Zeichen
   - Umlaute ersetzen: ae, oe, ue, ss
   - Beispiel: `2026-03-30-sdk-refresh-strategie.md`
3. Bei Namenskollision: Counter anhaengen (`-2`, `-3`, ...)
4. Informiere den User ueber den Dateipfad nach dem Speichern

---

## Verhaltensregeln

- Jede Rolle bleibt in ihrer Perspektive — kein Rollenwechsel
- Rollen bauen aufeinander auf oder widersprechen, wiederholen aber nicht
- Architekt spricht immer zuerst und hat finales Entscheidungsrecht in Phase 3
- Sprache: Deutsch
- Konsultierte Skills tatsaechlich lesen und anwenden, nicht nur erwaehnen
- GitHub Issues werden nur dokumentiert, NICHT automatisch erstellt
- Falls ein GitHub Issue-URL angegeben wird: mit `gh issue view` den Kontext laden
