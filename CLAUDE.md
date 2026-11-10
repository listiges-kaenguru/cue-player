# Cue Player – Hinweise für Claude

Show-Player als PWA (Vanilla JS, kein Build). Ziel: Funktionsumfang ähnlich Linux Show Player auf
Android/Windows/Linux. Homepage: <https://get-cueplayer.schmaralde.de/>,
Demo: <https://demo-cueplayer.schmaralde.de/>.

## Orientierung

- `README.md` – Funktionen, Schnellstart, Aufbau, Lizenz
- `CHANGELOG.md` – Änderungen je Version; jede Änderung unter `## [Unveröffentlicht]` eintragen
- `IDEEN.md` – ToDo, Ideen, bekannte Schwächen, Nutzertests; **zuerst lesen**, Erledigtes ins CHANGELOG
- `docs/BENUTZERHANDBUCH.md` (auch Hilfe in der App), `docs/INSTALLATION.md` – Nutzerdoku
- Entwürfe und Mockups gehören nicht ins Repo.

## Regeln

- Kommunikation, UI-Texte und Doku auf Deutsch.
- Keine externen Laufzeit-Abhängigkeiten oder CDNs (Offline-Betrieb). Einzige Verbindung nach außen: die
  Versionsprüfung (`latestRelease()` in `util.js`, GitHub-API, höchstens einmal am Tag). Neue Dateien in `ASSETS` in `sw.js` eintragen,
  bei Releases `VERSION` erhöhen (auch in `package.json`).
- Nach Änderungen den Smoke-Test ausführen (`tests/smoke.mjs`, siehe unten) und bei Bedarf erweitern.
- Nutzerdoku pflegen: `docs/BENUTZERHANDBUCH.md`, `docs/INSTALLATION.md`, Funktionstabelle in `README.md`.
- Neue Entwicklungsdateien in `.gitattributes` als `export-ignore` eintragen (Release-ZIP nur mit Benötigtem).
- Neue Speicherung, Berechtigungen oder externe Verbindungen im CHANGELOG deutlich nennen: Die Datenschutzerklärung
  der Homepage muss dann angepasst werden.

## Aufbau

- `js/engine.js`: `Runner` (Zustände prewait/running/paused/postwait/idle, Timer) und Unterklassen je Cue-Typ.
  Audio: `<audio>` (gestreamt) → MediaElementSource → vol-Gain (Fade-Cues) → env-Gain (Fade-In/-Out/Stop) → Panner → Master.
  Pegel: Analyser je Cue hinter dem Panner (`level()`), am Master Splitter → 2 Analyser (`masterPeaks()`). Wellenform
  über `engine.waveform()` (OfflineAudioContext mit 11 025 Hz, gecacht je mediaId, nicht über 20 min). Springen: `seek()`.
  Neuer Cue-Typ: Runner-Klasse + Eintrag in `RUNNERS`, Defaults in `model.js` (`newCue`), Editor-Felder in `app.js`
  (`openEditor`), Menüeintrag in `index.html`.
- `js/keepalive.js`: Ausgabegerät wach halten. Reine Logik (`normalizeKeepAlive`, `pulsePlan`, `signalSamples`,
  unit-getestet) und Klasse `KeepAlive` (geloopte Quelle → Gain → `ctx.destination`, am Master vorbei; Pulse als
  Gain-Automation auf der Audio-Uhr, eine Stunde im Voraus). `engine.keepAlive`; die Engine meldet über `audible()`
  bei jedem `change`, ob eine Audio-Cue hörbar spielt, der Zähler beginnt danach neu.
- `js/meter.js`: reine Logik für Pegelanzeigen, Wellenform, Springen und Breite des rechten Bereichs (unit-getestet).
- `js/showfile.js`: Dateiformat `.cueshow` (`buildShowFile`, `readShowFile`, `validShow`, `mediaBlob`), nur `Blob`, ohne
  IndexedDB; läuft im Browser und in Node. `storage.js` nutzt es für Export/Import.
- `js/md.js`: Markdown-Teilmenge, escaped zuerst alles HTML. Ergebnis darf per `innerHTML` gesetzt werden, anderes nicht.
- Presets: `storage.js` (`listPresets/savePreset/deletePreset`), `model.js` (`cueToPreset`, `defaultPresets`),
  UI in `app.js` (Abschnitt „Presets“). Seed einmalig über Meta-Key `presetsSeeded`.
- `window.cuePlayer = { engine, state }` für Tests/DevTools (Smoke-Test liest darüber Pegel und Cue-Daten).
- `js/app.js`: komplette UI. Rendering bei Strukturänderung neu (`renderAll`), Fortschritt pro Frame (`frame`).
- `js/storage.js`: IndexedDB-Stores `sessions`, `media` (Blobs), `meta`, `presets`. Export/Import. Meta-Keys: `lastSession`,
  `presetsSeeded`, `keepAlive` (Einstellung „wach halten“, je Gerät, wird nicht exportiert), `standby:<sessionId>`, `exportiert:<sessionId>` (Fingerabdruck beim letzten Export/Import,
  `sessionFingerprint()`/`needsBackup()` in `model.js`, Hinweis beim Schließen). Upgrade mit anderen offenen Tabs: `onDbBlock()` (Hinweis in `app.js`).
  Gerätebezogene Ansicht im localStorage: `cue-player-side-width`, `cue-player-memo-open`.
- `tools/cueshow.mjs`: Entwicklungswerkzeug (Node, nicht im Release): `unpack`, `pack`, `info`, `check`, `texts`,
  `apply-texts`; Hilfe mit `node tools/cueshow.mjs help`. Logik in `tools/cueshow/`: `io.mjs` (Show lesen, sicher
  schreiben, Pfadprüfung), `names.mjs` (Dateinamen), `check.mjs` (strenge Prüfung), `info.mjs`, `texts.mjs`, `cli.mjs`.
  Neue Cue-Felder oder Einstellungen: Regeln in `check.mjs` ergänzen (sonst meldet `check` sie als unbekannt).
- Handbuch-Bilder: `docs/img/` (WebP-Screenshots, `ablauf.svg` von Hand gezeichnet), im Markdown als
  `![Alt-Text](img/name.webp)`. `renderDocument` in `md.js` lässt nur einfache Dateinamen unter `img/` zu, die App
  übergibt `images: 'docs/'`. Neue Bilder in `ASSETS` in `sw.js` eintragen (`tests/hilfe.mjs` prüft das). Die
  Screenshots erzeugt `tools/handbuch-bilder.mjs` (Beispielshow, nummerierte Marken auf dem Hauptbildschirm; braucht
  ImageMagick); neu erzeugen, wenn sich die Oberfläche sichtbar ändert, danach ansehen und die Texte im Handbuch
  (Legende in Kapitel 2, Alt-Texte) abgleichen. Kursiv/fett im Handbuch nicht über Zeilenumbrüche ziehen.
- `sw.js`: Cache-First, lädt beim Installieren am HTTP-Cache vorbei.
- `site.json`: optionaler Impressum-Link, im Repo leer (`{}`); die Demo bringt ihre eigene mit.
- Icons in `img/`, nie in `icons/` (Apache-Alias).

## Entwickeln & Testen

```bash
npm install            # einmalig (http-server, playwright)
npm start              # http://localhost:8080
npm test               # in zweitem Terminal: Smoke-Test
```

Am besten in einem Container mit Node, Playwright und Chromium, damit keine Browser auf dem Rechner installiert
werden müssen. Die Playwright-Version des Containers muss zu `node_modules/playwright` passen.

Vollständiger Testlauf: Syntax- und Linkprüfung, Unit-Tests (`tests/unit/*.test.mjs`, `node:test`, für `md.js`, `util.js`, `model.js`, `meter.js`, `keepalive.js`, `showfile.js`
und `tools/cueshow/`), den
Smoke-Test und die Browsertests `tests/import.mjs` (präparierte `.cueshow`-Dateien, `site.json`) und `tests/pegel.mjs`
(GO-Taste, Pegel, Wellenform, Springen, Breite des rechten Bereichs) sowie `tests/zustand.mjs` (Standby, DB-Upgrade), `tests/fade.mjs` (Fade-Cue pausieren), `tests/fadein.mjs` (Fade-In/-Out der Audio-Cues), `tests/sicherung.mjs`
(Backup-Hinweis beim Schließen), `tests/hilfe.mjs` (Bilder im Handbuch, offline), `tests/wachhalten.mjs` (Ausgabegerät wach halten) und `tests/cueshow.mjs` (Werkzeug
`tools/cueshow.mjs` zusammen mit der App: Export, Rundreise, Bearbeiten, Import);
weitere `tests/*.mjs` gehören dazu (`node tests/<name>.mjs`, Server auf Port 8080). Weitere Befehle:
`npm run test:coverage` (Coverage der Unit-Tests), `npm run test:mutation` (Stryker, ca. 10 Minuten),
`npm run test:gross` (Werkzeug mit 1 GB Medien: Speicherverbrauch, schreibt etwa 3 GB, gehört zum vollständigen Testlauf).

- Bewusste Testlücke: `engine.js` und `app.js` haben keine Unit-Tests, nur die Browsertests.

Shows ansehen und von Hand bearbeiten (Werkzeug `tools/cueshow.mjs`):

```bash
node tools/cueshow.mjs unpack Show.cueshow      # → Show/show.json + Show/media/
node tools/cueshow.mjs pack Show                # prüft und packt → Show-neu.cueshow
node tools/cueshow.mjs check Show.cueshow --streng
node tools/cueshow.mjs texts Show.cueshow       # → Show-texte.md; bearbeiten, dann:
node tools/cueshow.mjs apply-texts Show.cueshow Show-texte.md --probe
```

- Fremde Shows (`.cueshow`) prüft `importShow()` in `storage.js` über `validShow()` in `showfile.js` vollständig, bevor
  etwas gespeichert wird. Neue Pflichtfelder dort ergänzen. Werte, die als CSS oder Attribut in die Seite gehen, vorher prüfen (wie `safeColor`
  in `model.js`); Text nur über `h()`/`textContent`, Markdown nur über `md.js`.

In der Claude-Cloud-Umgebung (Playwright und Chromium sind vorinstalliert, `npm install` ist nicht nötig):

```bash
mkdir -p node_modules && ln -sf /opt/node22/lib/node_modules/playwright node_modules/playwright
npx http-server -p 8080 -c-1 -s &
CHROMIUM_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome node tests/smoke.mjs
```

Den Server nicht mit `pkill -f http-server` beenden, das beendet auch die eigene Shell.
Besser: `kill $(lsof -t -i:8080)` oder `fuser -k 8080/tcp`.
