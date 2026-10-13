# Projektstand & ToDo

Arbeitsnotizen, damit die Entwicklung jederzeit schnell weitergehen kann.
**Bei jeder Sitzung aktualisieren** (Stand, erledigte/neue ToDos, Erkenntnisse aus Tests).

## Stand (2026-10-13, v0.1.0, nach Nutzertest 1)

Erster Prototyp als PWA, ohne Build-Schritt (Vanilla JS, ES-Module).

**Fertig und im Browser getestet** (Chromium, automatisiert über `tests/smoke.mjs`, dazu manuelle Playwright-Läufe):

- Audio-Cues hinzufügen (Datei-Dialog, Drag & Drop), Editor, Umsortieren (↑↓, Drag, Positionsfeld), Duplizieren, Löschen
- GO/Standby, Leertaste, Esc (Stop alle mit Fade, doppelt = sofort), Pause/Weiter für alle
- Fade-Cue, Pre-Wait, Auto-Continue mit Post-Wait, Pause/Resume mitten im Ablauf
- Hotkey lernen und auslösen
- Cart-Ansicht, Show-Modus, responsive Handy-Ansicht (390 px)
- Speicherung in IndexedDB, Neuladen, Export/Import `.cueshow` (inkl. Audio)
- Service Worker registriert

**Nutzertest 1 (Android-Smartphone, Chrome), 2026-10-13:**

- ✅ Tonausgabe
- ✅ Fade-Cue
- ✅ Pause-Cue
- ✅ Memo-Cue (Darstellung auf dem Handy, Wunsch: auffälliger, siehe ToDo „Memo-Darstellung“). Desktop noch nicht getestet.

**Implementiert, aber noch NICHT getestet:**

- Android: Installation als App, Latenz, Wake Lock, Hintergrundverhalten
- Memo-Cue am Desktop
- Windows/Linux-Installation als App
- MIDI mit echter Hardware (Lernen, Trigger, MIDI-Cues)
- Ausgabegerät-Wahl (`AudioContext.setSinkId`)
- Stop-, Start- und Pause-Cues, Auto-Follow, Loop mit Trimmung, Fade-Out am Ende, Panorama (Code vorhanden, nicht einzeln geprüft)
- Offline-Betrieb nach Installation
- GitHub-Pages-Workflow (`.github/workflows/pages.yml`, nie gelaufen; Pages muss in den Repo-Einstellungen aktiviert werden)

**Git:** Branch `ccr-c726005c-rg7agm`, noch nicht nach `main` gemergt, kein PR.

## ToDo

### Vom Nutzer gewünscht

Reihenfolge = Vorschlag für die Umsetzung (klein → groß). Offene Fragen an den Nutzer stehen jeweils dabei.

- [ ] **Pause-Cue mit optionalem Fade (Ausfaden beim Pausieren, Einfaden beim Fortsetzen).**
  Entscheidung (Vorschlag, mit Nutzer bestätigen): **als Option direkt im Pause-Cue**, nicht nur über Presets.
  Der Fade gehört zur Aktion, genau wie beim Stop-Cue (der hat schon „Fade-Out“). Presets (siehe unten)
  speichern dann z. B. „Pause mit 2 s Fade“ zur Wiederverwendung.
  Umsetzung:
  - `model.js`: Pause-Cue um `fadeOut` (beim Pausieren) und `fadeIn` (beim Fortsetzen) erweitern, Standard 0.
  - `engine.js`: `Runner.pause(fade)` / `resume(fade)` durchreichen; `AudioRunner.pauseAction(fade)` rampt `env`
    über `fade` auf 0 und pausiert danach das `<audio>`; `resumeAction(fade)` rampt wieder hoch
    (heute: fest `DECLICK`). Achtung: Wird während des Ausfadens erneut fortgesetzt, muss der `pauseH`-Timer abgebrochen werden.
    Andere Runner ignorieren den Fade.
  - Editor: zwei Felder; Modus „Umschalten“ nutzt je nach Richtung das passende Feld.
  - Optional: Einstellung „Pause alle mit Fade“ für die Transport-Buttons.
  - Doku: Benutzerhandbuch Abschnitt 4 (Pause/Weiter), Smoke-Test ergänzen.

- [ ] **Memo-Darstellung auffälliger, evtl. mit Formatierung (Markdown).**
  Vor der Umsetzung Darstellung mit dem Nutzer klären. Mockup mit drei Varianten:
  `docs/mockups/memo-varianten.html` (im Browser öffnen).
  - A: Kapitel-Trenner (breite, farbige Zwischenüberschrift, einzeilig)
  - B: Notizkarte in der Liste (Markdown, nach 3 Zeilen gekürzt)
  - C: Regiebuch-Panel. **Empfehlung: C kombiniert mit A**, also in der Liste ein kompakter Trenner und der formatierte Text
    groß im eigenen Bereich, sobald Memo oder Folge-Cue im Standby steht (Desktop: rechte Spalte; Handy: aufklappbar über GO).
  Technische Notizen:
  - Markdown-Teilmenge selbst rendern (keine Bibliothek, wegen Offline): Überschriften, **fett**, *kursiv*, Listen,
    Hervorhebung (z. B. Zeile mit `!` → roter Warnkasten), Zeilenumbrüche.
  - **HTML immer escapen**: Shows werden geteilt (.cueshow), fremder Text darf kein HTML/JS einschleusen.
  - Die Notizen anderer Cues (Feld `notes`) könnten im selben Panel erscheinen.
  - Offene Fragen: Welche Variante? Soll ein Memo die GO-Taste kurz „blockieren“ bzw. bestätigen lassen? Farbe frei oder fest?

- [ ] **Presets (Vorlagen) erstellen und als Cue einfügen.**
  Konzept-Vorschlag:
  - Ein Preset ist ein gespeicherter Cue (später auch mehrere Cues) mit allen Einstellungen, aber ohne `id`, und bei
    Ziel-Cues ohne festes Ziel (beim Einfügen: Ziel = vorheriger Cue, wie heute bei `addCue`).
  - Anlegen: im Editor „Als Preset speichern…“ (Name vergeben). Einfügen: Menü „＋ Cue ▾“ → Abschnitt „Presets“.
  - Verwaltung (umbenennen, löschen) in ⚙ oder eigenem Dialog.
  - Speicherort: **global** im IndexedDB-Store `meta` bzw. eigenem Store `presets` (Store-Version erhöhen), damit Presets in
    allen Shows verfügbar sind. Beim `.cueshow`-Export optional mitnehmen.
  - Beispiele für Standard-Presets: „Ausblenden 3 s + Stop“, „Musik unter Text (−15 dB, 3 s)“, „Pause mit Fade“, „Stop alle 5 s“.
  - Offene Fragen: Nur Cue-Einstellungen oder auch Audiodatei (z. B. Standard-Jingle)? Mehr-Cue-Presets (Abfolgen) gleich mit
    einplanen? Global oder pro Show?

- [ ] **Import aus Linux Show Player (LiSP) und evtl. anderen Programmen.**
  Stand des Wissens (an echter Datei prüfen!):
  - LiSP-Sessions (`.lsp`) sind JSON: Layout-Einstellungen + Liste `cues` mit `_type_` (z. B. `MediaCue`/`GstMediaCue`,
    `VolumeControl`, `StopAll`, `SeekCue`, `CollectionCue`, `IndexActionCue`, `MidiCue`, `OscCue`, `CommandCue`),
    `name`, `pre_wait`, `post_wait`, `next_action` (`DoNothing`, `TriggerAfterWait`, `TriggerAfterEnd`, …).
  - **Medien sind nicht enthalten**: `media` → `elements` → `UriInput.uri` verweist auf die Datei (`file:///…`, je nach
    Version absolut oder relativ zur Session-Datei). Lautstärke, Fades und Start-/Stop-Zeit (ms) stehen ebenfalls unter `media`.
  - Der Browser kennt keine Dateipfade. Daher Import-Ablauf:
    1. `.lsp` auswählen und parsen → Liste der benötigten Dateien anzeigen.
    2. Nutzer wählt die Audiodateien bzw. den Ordner (`<input webkitdirectory>` am Desktop; Android: Mehrfachauswahl).
    3. Zuordnung über Dateinamen (bei Mehrdeutigkeit über relativen Pfad), fehlende Dateien anzeigen. Cue wird trotzdem
       angelegt und die Datei kann später nachgereicht werden.
    4. Nicht unterstützte Cue-Typen (OSC, Command, Seek …) **als Memo-Cue mit Hinweis** übernehmen, damit nichts still verloren geht.
  - Zuordnung: MediaCue → audio, VolumeControl → fade, StopAll → stop (Ziel alle), MidiCue → midi,
    CollectionCue → mehrere Start-Cues (bzw. später Gruppen-Cue), next_action → nextAction (`TriggerAfterWait` → continue,
    `TriggerAfterEnd` → follow; `Select…`-Varianten → none + Hinweis).
  - **Vom Nutzer benötigt: eine oder mehrere echte `.lsp`-Beispieldateien** (möglichst mit verschiedenen Cue-Typen,
    dazu die LiSP-Version). Ohne Beispiel ist das Format nur aus dem Gedächtnis rekonstruiert.
  - Weitere Programme (später, je nach Bedarf): einfache Playlists (M3U, Ordner mit Dateien → Audio-Cues in Reihenfolge),
    CSV-Cue-Listen, Show Cue Systems (SCS, XML). QLab (macOS, Binärformat) eher nicht.

- [ ] **Projekt-Export als ZIP zum Teilen, zusätzlich zu `.cueshow`.**
  **`.cueshow` bleibt auf jeden Fall erhalten** (Nutzer: „Das ist super!“). ZIP ist eine zusätzliche Exportoption.
  Stand: Der Export (☰ → „Aktuelle exportieren“) packt Show **und** Audiodateien bereits in **eine**
  Datei `.cueshow`. Das ist ein eigenes Binärformat (siehe `js/storage.js`, `exportShow`/`importShow`),
  das man nur mit Cue Player öffnen kann.
  Plan:
  - Export als echte **ZIP-Datei** (Endung z. B. `.cueshow.zip` oder `.cuezip`):
    `show.json` + `media/<originalname>` (lesbare Dateinamen, Dubletten durchnummerieren).
    Dann lassen sich die Dateien mit jedem Entpacker einsehen und auch in anderen Programmen verwenden.
  - ZIP ohne Bibliothek schreiben (Methode „stored“, ohne Kompression, weil Audio ohnehin komprimiert ist):
    Local-Header + Daten + Central Directory, CRC32 selbst berechnen. Dateien über 4 GB brauchen ZIP64,
    das ist für Shows vermutlich nicht nötig, aber Größe prüfen und warnen.
    Alternative: `fflate` lokal ins Repo legen (kein CDN, wegen Offline-Betrieb).
  - Speicherverbrauch: Blobs nicht komplett in den RAM laden, sondern `new Blob([...teile])` zusammensetzen
    (wie heute). CRC32 muss trotzdem jede Datei einmal lesen, also stückweise mit `blob.stream()`.
  - Import: ZIP lesen (Central Directory am Ende), dazu weiterhin altes `.cueshow` (Magic `CUESHOW1`) unterstützen.
  - Optional: Import einer ZIP, die jemand von Hand gebaut hat (`show.json` + Ordner).
  - Optional (Desktop): „Als Ordner speichern“ über die File System Access API (`showDirectoryPicker`).
  - Teilen auf Android: `navigator.share({ files: [...] })` (Web Share API), wenn verfügbar.
  - Test in `tests/smoke.mjs` ergänzen: Export → entpacken (z. B. mit `unzip -l`) → Import.

### Wichtig vor dem ersten echten Einsatz

- [ ] Nutzertest auf Android/Windows/Linux (Ergebnisse hier eintragen)
- [ ] Pegelanzeige (VU) am Master, damit man sieht, dass Ton rausgeht
- [ ] Undo/Redo
- [ ] Warnung beim Schließen, wenn noch nichts exportiert wurde (Backup-Hinweis)

### Roadmap (aus README)

- [ ] Gruppen-Cues, Mehrfachauswahl
- [ ] Vorhören auf zweitem Ausgang
- [ ] Video-Cues (Vollbild, zweiter Bildschirm)
- [ ] Tauri-Desktop-Build (OSC, Netzwerk-Fernsteuerung, Projektordner statt Browser-Speicher)
- [ ] Capacitor-Android-Build (APK, Foreground-Service für Hintergrundwiedergabe)

### Kleinigkeiten / bekannte Schwächen

- Ersetzte Audiodateien bleiben in IndexedDB liegen, bis die Show gewechselt oder gelöscht wird
  oder in ⚙ „Unbenutzte Medien löschen“ gedrückt wird (`gcMedia`).
- Fade-Cue pausiert nur seinen Timer; die laufende Gain-Automation in Web Audio läuft beim Pausieren weiter.
- Loop mit Start/Ende-Trimmung springt per `tick()` (20 ms) zurück, das ist nicht ganz nahtlos.
  Ohne Trimmung wird `el.loop` genutzt und ist nahtlos.
- Ende-Erkennung und Fade-Out am Ende laufen per 20-ms-Intervall (Timer im Hintergrund-Tab: Audio-Tabs werden nicht gedrosselt).
- Nach dem Neuladen steht der Standby immer auf Cue 1 (wird nicht gespeichert).
- Firefox: keine Installation auf dem Desktop, kein `setSinkId` am AudioContext.

## Architektur-Kurzüberblick

- `js/engine.js`: `Runner` (Zustände prewait/running/paused/postwait/idle, Timer) und Unterklassen je Cue-Typ.
  Audio: `<audio>` (gestreamt) → MediaElementSource → vol-Gain (Fade-Cues) → env-Gain (Fade-In/-Out/Stop) → Panner → Master.
  Neuer Cue-Typ: Runner-Klasse + Eintrag in `RUNNERS`, Defaults in `model.js` (`newCue`), Editor-Felder in `app.js` (`openEditor`), Menüeintrag in `index.html`.
- `js/app.js`: komplette UI. Rendering bei Strukturänderung neu (`renderAll`), Fortschritt pro Frame (`frame`).
- `js/storage.js`: IndexedDB-Stores `sessions`, `media` (Blobs), `meta`. Export/Import.
- `sw.js`: Cache-First. **Bei jedem Release `VERSION` erhöhen und neue Dateien in `ASSETS` eintragen.**
- Sprache in UI und Doku: Deutsch.
- Mockups für Abstimmungen mit dem Nutzer: `docs/mockups/` (statisches HTML, nutzt `css/app.css`).

## Entwickeln & Testen

```bash
npm install            # einmalig (http-server, playwright)
npm start              # http://localhost:8080
npm test               # in zweitem Terminal: Smoke-Test
```

In der Claude-Cloud-Umgebung (Playwright und Chromium sind vorinstalliert, `npm install` ist nicht nötig):

```bash
mkdir -p node_modules && ln -sf /opt/node22/lib/node_modules/playwright node_modules/playwright
npx http-server -p 8080 -c-1 -s &
CHROMIUM_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome node tests/smoke.mjs
```

Achtung: Den Server nicht mit `pkill -f http-server` beenden, das beendet auch die eigene Shell.
Besser: `kill $(lsof -t -i:8080)` oder `fuser -k 8080/tcp`.
