# Projektstand & ToDo

Arbeitsnotizen, damit die Entwicklung jederzeit schnell weitergehen kann.
**Bei jeder Sitzung aktualisieren** (Stand, erledigte/neue ToDos, Erkenntnisse aus Tests).

## Stand (2026-10-15, v0.5.4)

PWA ohne Build-Schritt (Vanilla JS, ES-Module). Entwicklung auf Branch `ccr-c726005c-rg7agm`; `main` wurde am 2026-10-14
auf dem Stand v0.4.1 angelegt, v0.4.2 + v0.5.0 per PR #1 gemergt, v0.5.1 per PR #2, v0.5.2 per PR #3, v0.5.3 per PR #4, v0.5.4 per PR #6. **Releases:** v0.5.0 (erstes), v0.5.1 (Icon-Fix), v0.5.2 (Regiebuch-Überschriften), v0.5.3 (Impressum-Link), v0.5.4 (Linux-Show-Player-Hinweise nur noch in der README).
GitHub Pages ist noch nicht aktiviert (Deploy-Läufe auf `main` schlagen deshalb fehl), Repo ist privat.
Workflow-Änderungen per SSH pushen (gh-Token ohne `workflow`-Scope).

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
- **v0.3.0** (Nutzerwunsch):
  - Start- und Stop-Cue zu **einem** Typ `startstop` zusammengelegt (`mode`: toggle/start/stop, `fade` beim Stoppen), analog Pause/Weiter.
    Migration alter Cues/Presets über `migrateCue()` in `model.js` (in `normalizeSession` und `listPresets`).
  - Show/Edit als **Schalter** (orange ✎ Edit / grün ▶ Show), Einstellung „Vor dem Wechsel in den Edit-Modus nachfragen“
    (`settings.confirmEdit`, Standard an; gilt auch für Strg+E).
- **v0.4.0** (Nutzerwunsch):
  - Memo-Bestätigung: Memo-Feld `confirm`. `guardMemo()` in `app.js` prüft, ob ein solches Memo direkt vor dem Standby
    steht (oder selbst Standby ist). `go()` öffnet dann `#dlg-confirm`, erst `go({ confirmed: true })` löst aus.
    Leertaste/MIDI-GO bestätigen, Esc bricht ab. Cart/Hotkeys/MIDI-Trigger einzelner Cues werden nicht blockiert.
  - Mehr-Cue-Presets: Format `{ id, name, cues: [...] }`. Alte Presets (`cue`) werden in `migratePreset()` umgewandelt.
    Interne Ziele werden zu `'#<Index>'` (`cuesToTemplates`) und beim Einfügen aufgelöst (`instantiateCues`).
  - Mehrfachauswahl in der Liste (Strg/Shift+Klick, Touch: lange drücken) mit Leiste: Als Preset…, Klonen (Block,
    interne Verweise auf Kopien), Löschen. Nur Listenansicht und Edit-Modus.
  - Neues Standard-Preset „Szenenwechsel: alles ausblenden + Umbau (bestätigen)“ (Bestandsnutzer: über
    „Standard-Presets wiederherstellen“).
- **v0.4.1** (nach Nutzertest 2):
  - Langes Drücken zur Auswahl **entfernt** (kollidierte mit Scrollen, da `pointercancel` nicht abgefangen, und mit
    Chromes Touch-Drag&Drop). Stattdessen Knopf **☑** im Tabellenkopf (`toggleSelectMode`), im Auswahl-Modus sind
    Zeilen nicht `draggable`. Strg/Shift+Klick am PC bleibt.
  - Memo-Zeile ohne `colspan`: Mit ausgeblendeten Spalten (Handy) verschob `colspan` die Tabelle. Jetzt gleiche Zellen
    wie andere Zeilen. Smoke-Test prüft gleiche Zeilenbreite bei 1280 und 390 px. Badge auf dem Handy nur „🔒“.

- **v0.4.2:** Lizenz **AGPL-3.0-or-later** (`LICENSE` = unveränderter GNU-Text, `license`/`repository` in `package.json`,
  Abschnitt „Lizenz“ im README). In ⚙ Einstellungen → Info Links zu Lizenz und Quelltext (`SOURCE_URL` in `app.js`,
  zeigt auf `github.com/listiges-kaenguru/cue-player`, Lizenz über `blob/HEAD/LICENSE`, funktioniert also auch vor dem
  Merge nach `main`). Pages-Workflow kopiert `LICENSE` mit. Noch offen: Copyright-Zeile (Name des Rechteinhabers)
  im README bzw. in den Quelldateien, falls gewünscht. **Achtung:** Das Repo ist privat – der Quelltext-Link erfüllt
  die AGPL erst, wenn Nutzer der App den Quelltext tatsächlich abrufen können (Repo öffentlich machen).
- **v0.5.0** (Nutzerwunsch): **Eingebaute Hilfe.** Knopf **?** (Handy: erste Zeile neben dem Show-Namen), **F1**,
  oder ⚙ → Info → „Benutzerhandbuch öffnen“. Dialog `#dlg-help` lädt `docs/BENUTZERHANDBUCH.md` (in `ASSETS`, also
  offline; Pages-Workflow kopiert die Datei mit) und rendert sie mit `renderDocument()` in `js/md.js`: Tabellen,
  Codeblöcke, `Code`, Links (nur `#anker`/http(s)), `---`, verschachtelte Listen, `- [ ]`. Anker wie GitHub
  (`slugify`, Präfix `hilfe-`), Klicks im Inhaltsverzeichnis scrollen im Dialog. Memo-Renderer unverändert.
  F1 ist beim Hotkey-Lernen reserviert; hat eine ältere Show F1 als Cue-Hotkey, gewinnt der Cue.
  **Beim Bearbeiten des Handbuchs** prüft der Smoke-Test, dass alle Sprungmarken auflösen.
- **v0.5.1** (Fehler vom Nutzer): Chromium (Linux) installierte die App mit grauem „C“ statt Icon. Ursache: Der
  Server `cue-player.schmaralde.de` (Apache) hat den Standard-`Alias /icons/ /usr/share/httpd/icons/`, alle
  `icons/*`-Anfragen gingen ins Apache-Symbolverzeichnis → 404. Ordner in **`img/`** umbenannt (Manifest,
  `index.html`, `sw.js`, Pages-Workflow). Smoke-Test prüft, dass alle Manifest-Icons als Bild laden und nicht unter
  `icons/` liegen. Bereits installierte Apps behalten das Ersatz-Icon → deinstallieren und neu installieren.
- **v0.5.2** (Nutzerwunsch): Regiebuch sieht wieder aus wie die Editor-Vorschau. Unterschied war nur `# Überschrift`:
  In der Vorschau griff `.form-grid h3` (Abschnittskopf: klein, grau, Großbuchstaben, Linie), im Regiebuch `.md h3`
  (18 px fett). Jetzt hat `.md:not(.doc) h3` überall das Aussehen des Abschnittskopfs, `.form-grid > h3` gilt nur noch
  für die eigenen Editor-Köpfe. Die Hilfe (`.md.doc`) ist ausgenommen. Smoke-Test vergleicht die berechneten Stile
  von Vorschau und Regiebuch.
- **v0.5.3:** Optionaler Impressum-Link in ⚙ → Info aus **`site.json`** (`{ "legal": { "url", "label" } }`, nur http(s)).
  Im Repo leer (`{}`), damit Selbst-Hoster kein fremdes Impressum erben; die Demo-Instanz bekommt ihre befüllte
  Datei aus dem Deploy-Projekt `../demo-cueplayer` (`site.json`, `scripts/build.sh`). `site.json` steht in `ASSETS` (muss auf jedem Server
  existieren) und im Pages-Workflow. Smoke-Test prüft beide Fälle (ohne Angaben kein Link, mit Angaben Link).
  Hintergrund: Demo zieht nach `demo-cueplayer.schmaralde.de`, Homepage `get-cueplayer.schmaralde.de` (Projekt
  `../get-cueplayer`) mit `impressum.html` für beide.

- **v0.5.4** (Nutzerwunsch): Hinweise auf Linux Show Player aus App (Handbuch, Grundbegriff „Show“) und Homepage
  entfernt. Nur die README erwähnt ihn noch, im Abschnitt „Entstehung“; die Funktionstabelle hat keine Vergleichsspalte mehr.

- **Unveröffentlicht (kommt mit dem nächsten Release):** `sw.js` lädt beim Installieren alle `ASSETS` mit
  `cache: 'reload'`, also am HTTP-Cache vorbei. Vorher konnten alte JS/CSS-Dateien aus dem Browser-Cache im Cache
  der neuen Version landen. `INSTALLATION.md` empfiehlt `Cache-Control: no-cache` (Apache-`.htaccess`); die
  Demo-Instanz setzt das ab sofort für alle Dateien (`../demo-cueplayer/htaccess`).

**Nutzertest 1 (Android-Smartphone, Chrome), v0.1.0:**

- ✅ Tonausgabe · ✅ Fade-Cue · ✅ Pause-Cue · ✅ Memo-Cue (Wunsch: auffälliger, umgesetzt in v0.2.0)

**Nutzertest 2 (Smartphone), v0.4.0:**

- ❌ Langes Drücken zur Auswahl kollidierte manchmal mit Scrollen und mit Drag & Drop → in v0.4.1 durch Knopf ☑ ersetzt
- ❌ Memo-Zeilen unterschiedlich breit als andere Cues → in v0.4.1 behoben
- (Desktop noch nicht getestet)

**Implementiert, aber noch NICHT vom Nutzer getestet:**

- Eingebaute Hilfe (v0.5.0) auf Handy und Desktop, offline nach Update
- Alles aus v0.2.0–v0.4.0 (Pause-Fade, Klonen, Memo/Regiebuch, Presets, Start/Stop-Cue, Show/Edit-Schalter, Memo-Bestätigung,
  Mehr-Cue-Presets, Mehrfachauswahl inkl. langem Drücken auf echtem Touchscreen), besonders auf dem Handy
- Android: Installation als App, Latenz, Wake Lock, Hintergrundverhalten
- Windows/Linux-Installation als App, Desktop-Darstellung allgemein
- MIDI mit echter Hardware (Lernen, Trigger, MIDI-Cues)
- Ausgabegerät-Wahl (`AudioContext.setSinkId`)
- Start/Stop-Cue mit Ziel „Alle“, Auto-Follow, Loop mit Trimmung, Fade-Out am Ende, Panorama (Code vorhanden, nicht einzeln geprüft)
- Offline-Betrieb nach Installation, Update von v0.1.0 auf v0.2.0 (DB-Upgrade auf Version 2)
- GitHub-Pages-Workflow (`.github/workflows/pages.yml`, nie gelaufen; Pages muss in den Repo-Einstellungen aktiviert werden)

## ToDo

### Vom Nutzer gewünscht

Erledigt in v0.2.0: Pause-Cue mit Fade · Memo-Darstellung A+C mit Markdown · Presets (global) · Klonen.
Erledigt in v0.3.0: Start/Stop-Cue zusammengelegt · Show/Edit-Schalter mit Nachfrage.
Erledigt in v0.4.0: Memo-Bestätigung vor GO · Mehr-Cue-Presets mit Mehrfachauswahl.

Nutzer-Entscheidung: **LiSP-Import später**. Nutzer testet v0.2.0–v0.4.0 noch, Ergebnisse oben unter „Nutzertest“ eintragen.

Offen:

- [ ] **Presets – Ausbau (bei Bedarf):** Presets exportieren/importieren bzw. mit `.cueshow` weitergeben (heute nur lokal);
  Preset direkt bearbeiten (heute: einfügen, ändern, neu speichern, altes löschen); Mehrfachauswahl auch in der Cart-Ansicht?

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

- [ ] Gruppen-Cues (Mehrfachauswahl ist seit v0.4.0 da)
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

Lokal (Fedora, Browser aus `~/.cache/ms-playwright`): `npm install`, dann Server starten und
`CHROMIUM_PATH=$(ls -d ~/.cache/ms-playwright/chromium-*/chrome-linux*/ | head -1)chrome node tests/smoke.mjs`.

Achtung: Den Server nicht mit `pkill -f http-server` beenden, das beendet auch die eigene Shell.
Besser: `kill $(lsof -t -i:8080)` oder `fuser -k 8080/tcp`.
