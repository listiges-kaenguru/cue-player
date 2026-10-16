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
  Neuer Cue-Typ: Runner-Klasse + Eintrag in `RUNNERS`, Defaults in `model.js` (`newCue`), Editor-Felder in `app.js`
  (`openEditor`), Menüeintrag in `index.html`.
- `js/md.js`: Markdown-Teilmenge, escaped zuerst alles HTML. Ergebnis darf per `innerHTML` gesetzt werden, anderes nicht.
- Presets: `storage.js` (`listPresets/savePreset/deletePreset`), `model.js` (`cueToPreset`, `defaultPresets`),
  UI in `app.js` (Abschnitt „Presets“). Seed einmalig über Meta-Key `presetsSeeded`.
- `window.cuePlayer = { engine, state }` für Tests/DevTools (Smoke-Test liest darüber Pegel und Cue-Daten).
- `js/app.js`: komplette UI. Rendering bei Strukturänderung neu (`renderAll`), Fortschritt pro Frame (`frame`).
- `js/storage.js`: IndexedDB-Stores `sessions`, `media` (Blobs), `meta`, `presets`. Export/Import.
- `sw.js`: Cache-First, lädt beim Installieren am HTTP-Cache vorbei.
- `site.json`: optionaler Impressum-Link, im Repo leer (`{}`); die Demo bringt ihre eigene mit.
- Icons in `img/`, nie in `icons/` (Apache-Alias).

## Entwickeln & Testen

```bash
npm install            # einmalig (http-server, playwright)
npm start              # http://localhost:8080
npm test               # in zweitem Terminal: Smoke-Test
```

Lokal (Fedora, Browser aus `~/.cache/ms-playwright`): `npm install`, dann Server starten und
`CHROMIUM_PATH=$(ls -d ~/.cache/ms-playwright/chromium-*/chrome-linux*/ | head -1)chrome node tests/smoke.mjs`.

In der Claude-Cloud-Umgebung (Playwright und Chromium sind vorinstalliert, `npm install` ist nicht nötig):

```bash
mkdir -p node_modules && ln -sf /opt/node22/lib/node_modules/playwright node_modules/playwright
npx http-server -p 8080 -c-1 -s &
CHROMIUM_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome node tests/smoke.mjs
```

Den Server nicht mit `pkill -f http-server` beenden, das beendet auch die eigene Shell.
Besser: `kill $(lsof -t -i:8080)` oder `fuser -k 8080/tcp`.
