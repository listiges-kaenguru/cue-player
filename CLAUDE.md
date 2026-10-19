# Cue Player – Hinweise für Claude

Show-Player als PWA (Vanilla JS, kein Build). Ziel: Funktionsumfang ähnlich Linux Show Player auf
Android/Windows/Linux. Homepage `../get-cueplayer`, Demo `../demo-cueplayer`.

## Orientierung

- `README.md` – Funktionen, Schnellstart, Aufbau, Lizenz
- `CHANGELOG.md` – Änderungen je Version; jede Änderung unter `## [Unveröffentlicht]` eintragen
- `IDEEN.md` – ToDo, Ideen, bekannte Schwächen, Nutzertests; **zuerst lesen**, Erledigtes ins CHANGELOG
- `docs/BENUTZERHANDBUCH.md` (auch Hilfe in der App), `docs/INSTALLATION.md` – Nutzerdoku
- Entwürfe und Mockups liegen in `~/projects/entwuerfe/`, nicht im Repo.

## Regeln

- Kommunikation, UI-Texte und Doku auf Deutsch.
- Keine externen Laufzeit-Abhängigkeiten oder CDNs (Offline-Betrieb). Einzige Verbindung nach außen: die
  Versionsprüfung (`latestRelease()` in `util.js`, GitHub-API, höchstens einmal am Tag). Neue Dateien in `ASSETS` in `sw.js` eintragen,
  bei Releases `VERSION` erhöhen (auch in `package.json`).
- Nach Änderungen den Smoke-Test ausführen (`tests/smoke.mjs`, siehe unten) und bei Bedarf erweitern.
- Nutzerdoku pflegen: `docs/BENUTZERHANDBUCH.md`, `docs/INSTALLATION.md`, Funktionstabelle in `README.md`.
- Neue Entwicklungsdateien in `.gitattributes` als `export-ignore` eintragen (Release-ZIP nur mit Benötigtem).
- **Abhängige Projekte mitziehen:** Nach einem Release (Tag `vX.Y.Z`) `../get-cueplayer/scripts/build-download.sh` und
  `../demo-cueplayer/scripts/build.sh` ausführen, Änderungen dort committen und pushen. Bei neuen oder geänderten
  Funktionen auch die Texte in `../get-cueplayer/index.html` anpassen; bei neuer Speicherung, Berechtigung oder
  externen Verbindungen die Datenschutzerklärung in `../get-cueplayer/impressum.html`. Danach an den Upload erinnern
  (Hochladen auf ALL-INKL macht der Nutzer selbst).

## Aufbau

- `js/engine.js`: `Runner` (Zustände prewait/running/paused/postwait/idle, Timer) und Unterklassen je Cue-Typ.
  Audio: `<audio>` (gestreamt) → MediaElementSource → vol-Gain (Fade-Cues) → env-Gain (Fade-In/-Out/Stop) → Panner → Master.
  Pegel: Analyser je Cue hinter dem Panner (`level()`), am Master Splitter → 2 Analyser (`masterPeaks()`). Wellenform
  über `engine.waveform()` (OfflineAudioContext mit 11 025 Hz, gecacht je mediaId, nicht über 20 min). Springen: `seek()`.
  Neuer Cue-Typ: Runner-Klasse + Eintrag in `RUNNERS`, Defaults in `model.js` (`newCue`), Editor-Felder in `app.js`
  (`openEditor`), Menüeintrag in `index.html`.
- `js/meter.js`: reine Logik für Pegelanzeigen, Wellenform, Springen und Breite des rechten Bereichs (unit-getestet).
- `js/md.js`: Markdown-Teilmenge, escaped zuerst alles HTML. Ergebnis darf per `innerHTML` gesetzt werden, anderes nicht.
- Presets: `storage.js` (`listPresets/savePreset/deletePreset`), `model.js` (`cueToPreset`, `defaultPresets`),
  UI in `app.js` (Abschnitt „Presets“). Seed einmalig über Meta-Key `presetsSeeded`.
- `window.cuePlayer = { engine, state }` für Tests/DevTools (Smoke-Test liest darüber Pegel und Cue-Daten).
- `js/app.js`: komplette UI. Rendering bei Strukturänderung neu (`renderAll`), Fortschritt pro Frame (`frame`).
- `js/storage.js`: IndexedDB-Stores `sessions`, `media` (Blobs), `meta`, `presets`. Export/Import. Meta-Keys: `lastSession`,
  `presetsSeeded`, `standby:<sessionId>`. Upgrade mit anderen offenen Tabs: `onDbBlock()` (Hinweis in `app.js`).
  Gerätebezogene Ansicht im localStorage: `cue-player-side-width`, `cue-player-memo-open`.
- `sw.js`: Cache-First, lädt beim Installieren am HTTP-Cache vorbei.
- `site.json`: optionaler Impressum-Link, im Repo leer (`{}`); die Demo bringt ihre eigene mit.
- Icons in `img/`, nie in `icons/` (Apache-Alias).

## Entwickeln & Testen

```bash
npm install            # einmalig (http-server, playwright)
npm start              # http://localhost:8080
npm test               # in zweitem Terminal: Smoke-Test
```

Lokal (Fedora) in der gemeinsamen Testumgebung, keine Browser auf dem Host installieren:

```bash
~/projects/testumgebung/pt test     # Syntax, Links und Smoke-Test im Container (startet den Server selbst)
```

Die Playwright-Version im Image muss zu `node_modules/playwright` passen; der Test warnt bei Abweichung.

`pt test` führt aus: Unit-Tests (`tests/unit/*.test.mjs`, `node:test`, für `md.js`, `util.js`, `model.js`, `meter.js`), den
Smoke-Test und die Browsertests `tests/import.mjs` (präparierte `.cueshow`-Dateien, `site.json`) und `tests/pegel.mjs`
(GO-Taste, Pegel, Wellenform, Springen, Breite des rechten Bereichs) sowie `tests/zustand.mjs` (Standby, DB-Upgrade) und `tests/fade.mjs` (Fade-Cue pausieren);
weitere `tests/*.mjs` laufen automatisch mit. Weitere Befehle im
Container: `pt npm run test:coverage` (Coverage der Unit-Tests), `pt npm run test:mutation` (Stryker, ca. 10 Minuten).

- Fremde Shows (`.cueshow`) prüft `importShow()` in `storage.js` vollständig, bevor etwas gespeichert wird. Neue
  Pflichtfelder dort ergänzen. Werte, die als CSS oder Attribut in die Seite gehen, vorher prüfen (wie `safeColor`
  in `model.js`); Text nur über `h()`/`textContent`, Markdown nur über `md.js`.

In der Claude-Cloud-Umgebung (Playwright und Chromium sind vorinstalliert, `npm install` ist nicht nötig):

```bash
mkdir -p node_modules && ln -sf /opt/node22/lib/node_modules/playwright node_modules/playwright
npx http-server -p 8080 -c-1 -s &
CHROMIUM_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome node tests/smoke.mjs
```

Den Server nicht mit `pkill -f http-server` beenden, das beendet auch die eigene Shell.
Besser: `kill $(lsof -t -i:8080)` oder `fuser -k 8080/tcp`.
