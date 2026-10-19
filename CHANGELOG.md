# Changelog

Alle nennenswerten Änderungen am Cue Player stehen in dieser Datei, die neuesten oben.

Das Format basiert auf [Keep a Changelog](https://keepachangelog.com/de/1.1.0/),
die Versionierung folgt [Semantic Versioning](https://semver.org/lang/de/).
Die laufende Version steht in `sw.js` (`VERSION`) und `package.json`.

## [Unveröffentlicht]

### Hinzugefügt
- **Pegelanzeige am Master:** Neben dem Master-Regler zeigt eine Stereo-Anzeige (L/R) mit Spitzenwert-Halter, dass
  Ton rausgeht. Sie misst nach der Master-Lautstärke. Übersteuerung (≥ 0 dBFS) markiert ein rotes Feld, das drei
  Sekunden stehen bleibt.
- **Wellenform und Pegel im Aktiv-Bereich:** Laufende Audio-Cues zeigen im Fortschrittsbalken die Wellenform der
  Datei (getrimmter Bereich, gespielter Teil farbig) und daneben ihren aktuellen Pegel. Die Wellenform wird einmal je
  Datei im Hintergrund berechnet; Dateien über 20 Minuten und nicht dekodierbare Dateien behalten den normalen Balken.
- **Springen in laufenden Cues:** Ein Klick auf den Balken springt an diese Stelle, auch bei pausierten Cues. Im
  Show-Modus springt nur Ziehen und Loslassen (ein versehentlicher Tipp tut nichts); während des Ziehens zeigt ein
  Marker die Zielzeit, Loslassen neben dem Balken bricht ab. Auf dem fokussierten Balken springen ←/→ um 5 Sekunden.
  Ein laufender Fade-Out am Ende wird dabei richtig fortgesetzt bzw. zurückgenommen. Beim Sprung wird kurz aus- und
  wieder eingeblendet, damit es nicht knackt.
- **Breite des rechten Bereichs** (Regiebuch und Aktiv) ist am PC per Griff am linken Rand verstellbar (240 px bis
  60 % der Fensterbreite, auch mit ←/→ am fokussierten Griff). Die Breite wird je Gerät gespeichert, Doppelklick stellt
  die Standardbreite wieder her. Unter 900 px Fensterbreite bleibt das Layout wie bisher.

### Geändert
- **Standby wird gemerkt:** Nach dem Neuladen (z. B. nach einem Absturz mitten in der Vorstellung) oder beim Wechsel
  zurück zu einer Show steht der Standby wieder auf dem zuletzt gewählten Cue, je Show und Gerät. Er gehört nicht zur
  Show und wird nicht exportiert. Ist der Cue gelöscht, steht der Standby auf Cue 1.
- **Regiebuch:** Auf- oder zugeklappt bleibt nach dem Neuladen erhalten (je Gerät gespeichert).

### Behoben
- **Fade-Cue pausieren:** Bisher hielt eine Pause (Pause alle, Pause-Cue) nur die Zeitanzeige eines Fade-Cues an,
  die Lautstärke änderte sich weiter. Jetzt friert sie ein; „Weiter“ blendet ab dort mit der Restdauer und derselben
  Kurve zum Zielwert. Stop während der Pause lässt die Lautstärke, wo sie ist.
- **Update bei mehreren offenen Tabs:** Hielt ein zweiter Tab die alte Datenbank offen, blieb die App nach einem Update
  ohne Hinweis hängen. Jetzt erscheint „Bitte dort schließen“, danach lädt die App von selbst weiter. Ab dieser Version
  gibt eine geöffnete App die Datenbank für eine neuere Version frei und bittet um Neuladen.
- **Schmale Bildschirme:** Die Cue-Liste sprang während der Wiedergabe, weil die laufende Zeitanzeige die
  Spaltenbreite veränderte und Cue-Namen kurz umbrachen. Die Zeitanzeige hat jetzt keinen Einfluss mehr auf die Breite.
- **Handy:** Die GO-Taste schnitt beim Standby-Namen die Unterlängen ab (g, p, y). „GO“ hat jetzt eine engere
  Zeilenhöhe, der Name passt vollständig in die Taste.

### Intern
- Entwicklungsabhängigkeit `qs` (über Stryker → `typed-rest-client`) per npm-`overrides` auf ≥ 6.16.0 angehoben
  (Dependabot: DoS in `qs.stringify`; betrifft nur die Entwicklungsumgebung, nicht die App). `npm audit`: 0 Funde.
- `uid()` nutzt ohne `crypto.randomUUID` (z. B. ohne HTTPS) jetzt `crypto.getRandomValues` statt `Math.random`
  (CodeQL-Hinweis „Insecure randomness“; die IDs sind nur lokale Datenbankschlüssel).
- Neues Modul `js/meter.js` (Pegelskala, Spitzenwert-Halter, Wellenform, Klick → Zeit, Breite des rechten Bereichs)
  mit Unit-Tests `tests/unit/meter.test.mjs`, auch im Mutation Testing.
- Neuer Browsertest `tests/fade.mjs` (Fade-Cue pausieren und fortsetzen).
- Neuer Browsertest `tests/zustand.mjs` (Standby merken, Datenbank-Upgrade mit zweitem Tab).
- Neuer Browsertest `tests/pegel.mjs` (GO-Taste, Pegelanzeigen, Springen, Breite des rechten Bereichs).

## [0.6.1] – 2026-10-18

Sicherheitskorrektur für den Import von Shows (`.cueshow`). Version 0.6.1 in `sw.js`, `app.js`, `package.json`.

### Sicherheit
- Cue-Farben werden nur noch als `#rgb`/`#rrggbb` übernommen. Eine präparierte `.cueshow` konnte über eine
  Farbe wie `url(https://…)` beim Anzeigen einen fremden Server anfragen (und so verraten, wer die Show wann öffnet).

### Behoben
- **Import:** Eine `.cueshow` wird vollständig geprüft (Kennung, Headerlänge, Format, Aufbau der Show, Lage der
  Mediendaten), bevor etwas gespeichert wird. Bisher blieben bei kaputten Dateien Audiodateien verwaist im Speicher, und
  verfälschte Dateien (unsinnige Headerlänge, Medien außerhalb der Datei, fremde Formatversion) wurden angenommen.
  Fehlermeldung einheitlich „Keine gültige .cueshow-Datei“.

### Intern
- Unit-Tests mit `node:test` (ohne neue Abhängigkeit) für `md.js`, `util.js` und `model.js` in `tests/unit/`:
  XSS-Versuche im Markdown, nur `#anker`/http(s)-Links im Handbuch, dB-Umrechnung, Fade-Kurven, Timer mit gemockter
  Zeit, Versionsprüfung mit gemocktem GitHub, Migration älterer Daten, `__proto__` aus fremden Dateien
  (`npm run test:unit`).
- Browsertest `tests/import.mjs`: Import präparierter `.cueshow`-Dateien (kaputt, verfälscht, mit HTML/JS in allen
  Textfeldern) und Impressum-Link aus `site.json` nur mit http(s) (`npm run test:import`).
- Coverage der Unit-Tests mit dem in Node eingebauten Werkzeug (`npm run test:coverage`, 100 % Zeilen) und Mutation
  Testing mit Stryker (Command-Runner, `npm run test:mutation`, 92 %). Stryker ist die einzige neue devDependency;
  die App bleibt ohne Build und ohne Laufzeit-Abhängigkeiten.
- Smoke-Test läuft lokal in der gemeinsamen Testumgebung (`~/projects/testumgebung/pt test`), nicht mehr mit Browsern aus `~/.cache/ms-playwright`.

## [0.6.0] – 2026-10-17

### Hinzugefügt
- **Versionsprüfung:** ⚙ Einstellungen → Info zeigt neben der Version, ob auf GitHub eine neuere erschienen ist
  (mit Link zum Release), sonst „(neueste Version)“. Die App fragt dafür die GitHub-API höchstens einmal am Tag und
  nur beim Öffnen der Einstellungen (Ergebnis im `localStorage`, Schlüssel `cue-player-release`); ohne Netz bleibt
  die Zeile leer. Smoke-Test spielt ein Release vor, statt GitHub zu fragen. Version 0.6.0 in `sw.js`, `app.js`,
  `package.json`.

### Geändert
- Code aufgeräumt, ohne Funktionsänderung: Hilfsfunktionen in `app.js` (`cueIndex`, `standbyIndex`, `numbered`,
  `baseName`, `progressPct`, `updateItem` für Liste/Cart, `memoRow`/`cueRow`), `Runner._startPostWait()`;
  ungenutzte `Engine.stop/pause/resume(id)` und CSS `button.small`/`.form-grid .full` entfernt, `clamp` aus
  `util.js` wird jetzt genutzt. Smoke-Test vorher/nachher identisch. Beim nächsten Release `VERSION` in `sw.js`
  erhöhen (JS geändert).
- `docs/INSTALLATION.md`: GitHub Pages (Variante A) jetzt ohne eigenen Workflow, über „Deploy from a branch“.

### Entfernt
- GitHub-Pages-Workflow (`.github/workflows/pages.yml`). Er wurde nicht genutzt; die App liegt auf eigenem Webspace.

## [0.5.5] – 2026-10-15

### Geändert
- `sw.js` lädt beim Installieren alle `ASSETS` mit `cache: 'reload'`, also am HTTP-Cache vorbei. Vorher konnten
  alte JS/CSS-Dateien aus dem Browser-Cache im Cache der neuen Version landen.
- `INSTALLATION.md` empfiehlt `Cache-Control: no-cache` (Apache-`.htaccess`); GitHub Pages (Variante A) setzt
  einen eigenen Fork voraus, mit der Download-ZIP gelten Variante B oder C.
- Release-Archive enthalten per `export-ignore` nur noch, was zum Betrieb gebraucht wird.

## [0.5.4] – 2026-10-15

### Geändert
- Hinweise auf Linux Show Player aus App (Handbuch, Grundbegriff „Show“) und Homepage entfernt. Nur die README
  erwähnt ihn noch im Abschnitt „Entstehung“; die Funktionstabelle hat keine Vergleichsspalte mehr.

## [0.5.3] – 2026-10-14

### Hinzugefügt
- Optionaler Impressum-Link in ⚙ → Info aus **`site.json`** (`{ "legal": { "url", "label" } }`, nur http(s)).
  Im Repo leer (`{}`), damit Selbst-Hoster kein fremdes Impressum erben; die Demo-Instanz bekommt ihre befüllte
  Datei aus `../demo-cueplayer`. `site.json` steht in `ASSETS` (muss auf jedem Server existieren). Smoke-Test
  prüft beide Fälle.

## [0.5.2] – 2026-10-14

### Behoben
- Regiebuch sieht wieder aus wie die Editor-Vorschau: `.md:not(.doc) h3` hat überall das Aussehen des
  Abschnittskopfs, `.form-grid > h3` gilt nur noch für die eigenen Editor-Köpfe. Smoke-Test vergleicht die
  berechneten Stile von Vorschau und Regiebuch.

## [0.5.1] – 2026-10-14

### Behoben
- Chromium (Linux) installierte die App mit grauem „C“ statt Icon. Ursache: Apache-Standard-`Alias /icons/`
  verdeckte den Ordner. Icons liegen jetzt in **`img/`**. Smoke-Test prüft, dass alle Manifest-Icons laden und
  nicht unter `icons/` liegen. Bereits installierte Apps: deinstallieren und neu installieren.

## [0.5.0] – 2026-10-14

### Hinzugefügt
- **Eingebaute Hilfe:** Knopf **?**, **F1** oder ⚙ → Info → „Benutzerhandbuch öffnen“. Dialog `#dlg-help` lädt
  `docs/BENUTZERHANDBUCH.md` (offline in `ASSETS`) und rendert sie mit `renderDocument()` in `js/md.js`
  (Tabellen, Codeblöcke, Links nur `#anker`/http(s), verschachtelte Listen). Anker wie GitHub mit Präfix `hilfe-`.
  F1 ist beim Hotkey-Lernen reserviert; hat eine ältere Show F1 als Hotkey, gewinnt der Cue. Smoke-Test prüft,
  dass alle Sprungmarken des Handbuchs auflösen.

## [0.4.2] – 2026-10-14

### Hinzugefügt
- Lizenz **AGPL-3.0-or-later** (`LICENSE`, `package.json`, Abschnitt „Lizenz“ im README). In ⚙ → Info Links zu
  Lizenz und Quelltext (`SOURCE_URL` in `app.js`).

## [0.4.1] – 2026-10-13

### Geändert
- Langes Drücken zur Auswahl entfernt (kollidierte mit Scrollen und Touch-Drag&Drop). Stattdessen Knopf **☑** im
  Tabellenkopf (`toggleSelectMode`); im Auswahl-Modus sind Zeilen nicht `draggable`. Strg/Shift+Klick bleibt.

### Behoben
- Memo-Zeilen ohne `colspan`, damit sie mit ausgeblendeten Spalten (Handy) gleich breit sind wie andere Cues.
  Smoke-Test prüft gleiche Zeilenbreite bei 1280 und 390 px.

## [0.4.0] – 2026-10-13

### Hinzugefügt
- Memo-Bestätigung (`confirm`): `guardMemo()` öffnet vor dem GO `#dlg-confirm`; Leertaste/MIDI-GO bestätigen,
  Esc bricht ab. Cart, Hotkeys und MIDI-Trigger einzelner Cues werden nicht blockiert.
- Mehr-Cue-Presets (`{ id, name, cues: [...] }`, alte Presets per `migratePreset()`); interne Ziele werden zu
  `'#<Index>'` und beim Einfügen aufgelöst.
- Mehrfachauswahl in der Liste (Strg/Shift+Klick) mit Leiste: Als Preset…, Klonen, Löschen.
- Standard-Preset „Szenenwechsel: alles ausblenden + Umbau (bestätigen)“.

## [0.3.0] – 2026-10-13

### Geändert
- Start- und Stop-Cue zu **einem** Typ `startstop` zusammengelegt (`mode`: toggle/start/stop, `fade` beim
  Stoppen). Migration alter Cues/Presets über `migrateCue()`.
- Show/Edit als **Schalter** mit Einstellung „Vor dem Wechsel in den Edit-Modus nachfragen“ (`settings.confirmEdit`).

## [0.2.0] – 2026-10-13

### Hinzugefügt
- Pause-Cue mit Fade beim Pausieren/Fortsetzen, Einstellung „Pause-alle-Fade“.
- Klonen (Editor-Knopf „Klonen“; ⧉ in der Liste am Desktop).
- Memo-Darstellung: Kapitel-Trenner in Liste/Cart, Regiebuch-Panel mit Markdown (`js/md.js`); GO überspringt
  passive Memos.
- Presets (global, IndexedDB-Store `presets`, DB-Version 2) mit Verwalten-Dialog und 4 Standard-Presets.

## [0.1.0] – 2026-10-13

### Hinzugefügt
- Erster Prototyp als PWA: Audio-Cues, GO/Standby, Fade-, Pause-, Start/Stop-Cues, Pre-/Post-Wait,
  Auto-Continue/-Follow, Hotkeys, MIDI, Cart-Ansicht, Show-Modus, Speicherung in IndexedDB,
  Export/Import `.cueshow`, Smoke-Test.
