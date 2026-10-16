# Mitwirken

Danke, dass du den Cue Player verbessern möchtest! Fehler, Ideen und Verbesserungen gern als
Issue oder Pull Request.

## Grundregeln

- **Keine Abhängigkeiten zur Laufzeit.** Vanilla-JavaScript, kein Build-Schritt, keine CDNs – die App muss
  offline laufen. `npm` wird nur für den Test gebraucht.
- **Deutsch** für Oberfläche und Doku.
- Neue Dateien der App in `ASSETS` in `sw.js` eintragen, sonst fehlen sie offline.
- Aufbau und Regeln im Detail: [`CLAUDE.md`](CLAUDE.md), offene Punkte: [`IDEEN.md`](IDEEN.md).

## Testen

```bash
npm install
npm start      # http://localhost:8080
npm test       # in zweitem Terminal: Smoke-Test mit Playwright
```

## Changelog pflegen

Jede für Nutzerinnen und Nutzer sichtbare Änderung kommt in [`CHANGELOG.md`](CHANGELOG.md) unter
**`## [Unveröffentlicht]`**, im passenden Unterabschnitt (`Hinzugefügt`, `Geändert`, `Entfernt`, `Behoben`,
`Sicherheit`), ein Satz aus Nutzersicht.

## Neue Version veröffentlichen (Maintainer)

1. `VERSION` in `sw.js` und `version` in `package.json` erhöhen.
2. In `CHANGELOG.md` `## [Unveröffentlicht]` in `## [X.Y.Z] – JJJJ-MM-TT` umbenennen und darüber einen neuen,
   leeren Abschnitt anlegen.
3. Taggen (`vX.Y.Z`), pushen und auf GitHub ein Release aus dem Tag erstellen.

## Lizenz

Mit einem Beitrag stimmst du zu, dass er unter der [AGPL-3.0-or-later](LICENSE) veröffentlicht wird.
