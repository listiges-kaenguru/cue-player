# Projektstand & ToDo

Arbeitsnotizen, damit die Entwicklung jederzeit schnell weitergehen kann.
**Bei jeder Sitzung aktualisieren** (Stand, erledigte/neue ToDos, Erkenntnisse aus Tests).

## Stand (2026-10-13, v0.1.0)

Erster Prototyp als PWA, ohne Build-Schritt (Vanilla JS, ES-Module).

**Fertig und im Browser getestet** (Chromium, automatisiert über `tests/smoke.mjs`, dazu manuelle Playwright-Läufe):

- Audio-Cues hinzufügen (Datei-Dialog, Drag & Drop), Editor, Umsortieren (↑↓, Drag, Positionsfeld), Duplizieren, Löschen
- GO/Standby, Leertaste, Esc (Stop alle mit Fade, doppelt = sofort), Pause/Weiter für alle
- Fade-Cue, Pre-Wait, Auto-Continue mit Post-Wait, Pause/Resume mitten im Ablauf
- Hotkey lernen und auslösen
- Cart-Ansicht, Show-Modus, responsive Handy-Ansicht (390 px)
- Speicherung in IndexedDB, Neuladen, Export/Import `.cueshow` (inkl. Audio)
- Service Worker registriert

**Implementiert, aber noch NICHT getestet:**

- Ob tatsächlich Ton ausgegeben wird (Tests laufen headless: nur Status und Zeiten geprüft, nicht die Ausgabe)
- Echte Android-Geräte (Installation, Latenz, Wake Lock, Hintergrundverhalten)
- Windows/Linux-Installation als App
- MIDI mit echter Hardware (Lernen, Trigger, MIDI-Cues)
- Ausgabegerät-Wahl (`AudioContext.setSinkId`)
- Stop-, Start- und Pause-Cues, Auto-Follow, Loop mit Trimmung, Fade-Out am Ende, Panorama (Code vorhanden, nicht einzeln geprüft)
- Offline-Betrieb nach Installation
- GitHub-Pages-Workflow (`.github/workflows/pages.yml`, nie gelaufen; Pages muss in den Repo-Einstellungen aktiviert werden)

**Git:** Branch `ccr-c726005c-rg7agm`, noch nicht nach `main` gemergt, kein PR.

## ToDo

### Vom Nutzer gewünscht

- [ ] **Projekt-Export als ZIP (o. ä.) zum Teilen mit anderen.**
  Stand: Der Export (☰ → „Aktuelle exportieren“) packt Show **und** Audiodateien bereits in **eine**
  Datei `.cueshow`. Das ist aber ein eigenes Binärformat (siehe `js/storage.js`, `exportShow`/`importShow`),
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
