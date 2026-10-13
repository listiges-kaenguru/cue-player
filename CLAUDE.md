# Cue Player – Hinweise für Claude

Show-Player als PWA (Vanilla JS, kein Build). Ziel: Funktionsumfang ähnlich Linux Show Player auf Android/Windows/Linux.

- **Zuerst `docs/STAND.md` lesen**: aktueller Stand, ToDo-Liste, bekannte Schwächen, Testanleitung. Am Ende jeder Sitzung aktualisieren.
- Kommunikation, UI-Texte und Doku auf Deutsch.
- Keine externen Laufzeit-Abhängigkeiten oder CDNs (Offline-Betrieb). Neue Dateien in `ASSETS` in `sw.js` eintragen, bei Releases `VERSION` erhöhen.
- Nach Änderungen den Smoke-Test ausführen (`tests/smoke.mjs`, Anleitung in `docs/STAND.md`) und bei Bedarf erweitern.
- Nutzerdoku pflegen: `docs/BENUTZERHANDBUCH.md`, `docs/INSTALLATION.md`, Funktionstabelle in `README.md`.
