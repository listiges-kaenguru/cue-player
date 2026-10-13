# Projektstand & ToDo

Arbeitsnotizen, damit die Entwicklung jederzeit schnell weitergehen kann.
**Bei jeder Sitzung aktualisieren** (Stand, erledigte/neue ToDos, Erkenntnisse aus Tests).

## Stand (2026-10-13, v0.2.0)

PWA ohne Build-Schritt (Vanilla JS, ES-Module). Branch `ccr-c726005c-rg7agm`, noch nicht nach `main` gemergt, kein PR.

**Fertig und automatisiert getestet** (`tests/smoke.mjs`, 22+ Prüfungen, Chromium headless):

- Audio-Cues hinzufügen (Datei-Dialog, Drag & Drop), Editor, Umsortieren (↑↓, Drag, Positionsfeld), Löschen
- GO/Standby, Leertaste, Esc (Stop alle mit Fade, doppelt = sofort), Pause/Weiter für alle
- Fade-Cue, Pre-Wait, Auto-Continue mit Post-Wait, Pause/Resume mitten im Ablauf
- Hotkey lernen und auslösen
- Cart-Ansicht, Show-Modus, responsive Handy-Ansicht (390 px)
- Speicherung in IndexedDB, Neuladen, Export/Import `.cueshow` (inkl. Audio)
- **v0.2.0:**
  - Pause-Cue mit Fade beim Pausieren/Fortsetzen, Einstellung „Pause-alle-Fade“ (Pegelverlauf im Test gemessen)
  - Klonen (Editor-Knopf „Klonen“, überall nutzbar; ⧉ in der Liste am Desktop)
  - Memo A+C: Kapitel-Trenner in Liste/Cart, Regiebuch-Panel mit Markdown (`js/md.js`, escaped HTML), GO überspringt passive Memos
  - Presets (global, IndexedDB-Store `presets`, DB-Version 2): „Als Preset…“ im Editor, Einfügen über „＋ Cue ▾“,
    Verwalten-Dialog (umbenennen, löschen, Standard-Presets wiederherstellen), 4 Standard-Presets beim ersten Start.
    Audio-Presets behalten ihre Datei (`gcMedia` berücksichtigt Presets).

**Nutzertest 1 (Android-Smartphone, Chrome), v0.1.0:**

- ✅ Tonausgabe · ✅ Fade-Cue · ✅ Pause-Cue · ✅ Memo-Cue (Wunsch: auffälliger, umgesetzt in v0.2.0)

**Implementiert, aber noch NICHT vom Nutzer getestet:**

- Alles aus v0.2.0 (Pause-Fade, Klonen, Memo/Regiebuch, Presets), besonders auf dem Handy
- Android: Installation als App, Latenz, Wake Lock, Hintergrundverhalten
- Windows/Linux-Installation als App, Desktop-Darstellung allgemein
- MIDI mit echter Hardware (Lernen, Trigger, MIDI-Cues)
- Ausgabegerät-Wahl (`AudioContext.setSinkId`)
- Stop- und Start-Cues, Auto-Follow, Loop mit Trimmung, Fade-Out am Ende, Panorama (Code vorhanden, nicht einzeln geprüft)
- Offline-Betrieb nach Installation, Update von v0.1.0 auf v0.2.0 (DB-Upgrade auf Version 2)
- GitHub-Pages-Workflow (`.github/workflows/pages.yml`, nie gelaufen; Pages muss in den Repo-Einstellungen aktiviert werden)

## ToDo

### Vom Nutzer gewünscht

Erledigt in v0.2.0: Pause-Cue mit Fade · Memo-Darstellung A+C mit Markdown · Presets (global) · Klonen.

Offen, in dieser Reihenfolge:

Entscheidungen des Nutzers (2026-10-13, nach v0.2.0): **Mehr-Cue-Presets: ja** · **Memo-Bestätigung vor GO: ja (optional)** ·
**LiSP-Import: später**. Nutzer testet v0.2.0 noch, Ergebnisse oben unter „Nutzertest“ eintragen.

Nächste Schritte, in dieser Reihenfolge:

- [ ] **Memo: optionale Bestätigung vor GO.**
  Vorschlag zur Umsetzung:
  - `model.js`: Memo-Feld `confirm: false` (Checkbox im Editor „Vor dem nächsten GO bestätigen“) und optional `confirmText`.
  - Verhalten: Steht ein Memo mit `confirm` direkt vor dem Standby-Cue (bzw. ist es selbst Standby), löst das **erste GO
    nicht aus**, sondern zeigt eine deutliche Abfrage (großes Overlay mit Memo-Titel/Text, Knöpfe „Bestätigen & GO“ / „Abbrechen“).
    Leertaste/MIDI-GO im Overlay = bestätigen. Esc = abbrechen. Nach der Bestätigung gilt sie nur für dieses eine GO.
  - Cart, Hotkeys und Direkt-Trigger einzelner Cues: **nicht** blockieren (nur der GO-Ablauf).
  - In der Liste ein Schloss-Symbol 🔒 am Memo-Trenner, im Regiebuch Hinweis „Bestätigung erforderlich“.
  - GO-Taste zeigt bei anstehender Bestätigung z. B. „GO (bestätigen)“ in Orange.
  - Smoke-Test: GO → Overlay sichtbar, Cue läuft nicht; Bestätigen → Cue läuft.

- [ ] **Mehr-Cue-Presets.**
  Vorschlag zur Umsetzung:
  - Preset-Format erweitern: `{ id, name, cues: [...] }`. Alte Presets mit `cue` beim Lesen in `cues: [cue]` umwandeln
    (in `listPresets` oder `model.js`).
  - **Ziele innerhalb des Presets erhalten:** Beim Speichern Ziel-IDs, die auf Cues *innerhalb* der Auswahl zeigen, in
    Platzhalter umschreiben (`target: '#2'` = 2. Cue im Preset). Ziele *außerhalb* → leer. Beim Einfügen neue IDs vergeben
    und Platzhalter auflösen. Leere Fade-/Start-Ziele zeigen wie bisher auf den Cue vor dem eingefügten Block.
  - **Auswahl mehrerer Cues** wird dafür gebraucht (steht ohnehin auf der Roadmap): Mehrfachauswahl in der Liste
    (Desktop: Strg/Shift+Klick; Handy: „Auswählen“-Modus mit Checkboxen). Aktionen für die Auswahl: „Als Preset…“,
    Klonen, Löschen. Einfacher Zwischenschritt, falls nötig: „Als Preset…“ im Editor mit Feld „+ folgende N Cues“.
  - Menü: Mehr-Cue-Presets mit Anzahl anzeigen („◢■ Ausblenden & Stop (2 Cues)“).
  - Mitgeliefertes Beispiel: „Szenenwechsel“ = Fade −∞ 3 s (+Stop) → Memo „Umbau“ mit Bestätigung → leerer Platzhalter?
    (mit Nutzer abstimmen, welche Standard-Abfolgen sinnvoll sind).
  - Weiterhin offen: Presets exportieren/importieren bzw. mit `.cueshow` weitergeben. Preset direkt bearbeiten.

- [ ] **Memo:** Zustand des Regiebuchs (auf-/zugeklappt) merken (klein, bei Gelegenheit).

- [ ] **Import aus Linux Show Player (LiSP) und evtl. anderen Programmen.** *(Nutzer: später)*
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

- DB-Upgrade (Version 1 → 2): Ist die App noch in einem zweiten Tab mit alter Version offen, blockiert das Upgrade
  (`onblocked` wird nicht behandelt). Die Lösung für Nutzer ist, alle Tabs zu schließen.
- Geklonte Fade-/Start-/Stop-Cues zielen weiterhin auf denselben Ziel-Cue wie das Original (gewollt, aber ggf. überraschend).

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
- `js/md.js`: Markdown-Teilmenge, escaped zuerst alles HTML. Ergebnis darf per `innerHTML` gesetzt werden, anderes nicht.
- Presets: `storage.js` (`listPresets/savePreset/deletePreset`), `model.js` (`cueToPreset`, `defaultPresets`),
  UI in `app.js` (Abschnitt „Presets“). Seed einmalig über Meta-Key `presetsSeeded`.
- `window.cuePlayer = { engine, state }` für Tests/DevTools (Smoke-Test liest darüber Pegel und Cue-Daten).
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
