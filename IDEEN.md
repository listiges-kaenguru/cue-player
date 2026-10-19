# Ideen & ToDo

Offene Punkte und Ideen für spätere Versionen. Erledigtes wird hier gestrichen und ins
[CHANGELOG](CHANGELOG.md) übernommen.

## ToDo

### Vor dem ersten echten Einsatz

- [ ] Nutzertest auf Android/Windows/Linux (Ergebnisse unten unter „Tests“ eintragen)
- [ ] Undo/Redo
- [ ] Warnung beim Schließen, wenn noch nichts exportiert wurde (Backup-Hinweis)

### Vom Nutzer gewünscht

- [ ] **Presets – Ausbau (bei Bedarf):** Presets exportieren/importieren bzw. mit `.cueshow` weitergeben (heute nur
  lokal); Preset direkt bearbeiten (heute: einfügen, ändern, neu speichern, altes löschen); Mehrfachauswahl auch in
  der Cart-Ansicht?
- [ ] **Ausgabegerät wach halten** (globale Option, z. B. für Bluetooth-Lautsprecher, die nach 10 Minuten Stille
  abschalten; heute Notlösung per Stille-Cue in Schleife). Konzept mit offenen Fragen:
  `~/projects/entwuerfe/2026-10-cueplayer-geraet-wach-halten/konzept-geraet-wach-halten.md`
- [ ] **Import aus Linux Show Player (LiSP)** und evtl. anderen Programmen. *(Nutzer: später)*
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
  Datei `.cueshow`, ein eigenes Binärformat (`js/storage.js`, `exportShow`/`importShow`).
  Plan:
  - Export als echte **ZIP-Datei** (Endung z. B. `.cueshow.zip` oder `.cuezip`):
    `show.json` + `media/<originalname>` (lesbare Dateinamen, Dubletten durchnummerieren).
  - ZIP ohne Bibliothek schreiben (Methode „stored“, ohne Kompression, weil Audio ohnehin komprimiert ist):
    Local-Header + Daten + Central Directory, CRC32 selbst berechnen. Dateien über 4 GB brauchen ZIP64,
    das ist für Shows vermutlich nicht nötig, aber Größe prüfen und warnen.
    Alternative: `fflate` lokal ins Repo legen (kein CDN, wegen Offline-Betrieb).
  - Speicherverbrauch: Blobs nicht komplett in den RAM laden, sondern `new Blob([...teile])` zusammensetzen.
    CRC32 stückweise mit `blob.stream()`.
  - Import: ZIP lesen (Central Directory am Ende), dazu weiterhin altes `.cueshow` (Magic `CUESHOW1`) unterstützen.
  - Optional: Import einer ZIP, die jemand von Hand gebaut hat (`show.json` + Ordner).
  - Optional (Desktop): „Als Ordner speichern“ über die File System Access API (`showDirectoryPicker`).
  - Teilen auf Android: `navigator.share({ files: [...] })` (Web Share API), wenn verfügbar.
  - Test in `tests/smoke.mjs` ergänzen: Export → entpacken (z. B. mit `unzip -l`) → Import.

## Ideen

Roadmap-Vorschläge (auch in der README):

- Gruppen-Cues (Mehrfachauswahl ist seit v0.4.0 da)
- Vorhören auf zweitem Ausgang
- Video-Cues (Vollbild, zweiter Bildschirm)
- Tauri-Desktop-Build (OSC, Netzwerk-Fernsteuerung, Projektordner statt Browser-Speicher)
- Capacitor-Android-Build (APK, Foreground-Service für Hintergrundwiedergabe)

## Bekannte Schwächen

- Geklonte Fade-/Start-/Stop-Cues zielen weiterhin auf denselben Ziel-Cue wie das Original (gewollt, aber ggf. überraschend).
- Ersetzte Audiodateien bleiben in IndexedDB liegen, bis die Show gewechselt oder gelöscht wird
  oder in ⚙ „Unbenutzte Medien löschen“ gedrückt wird (`gcMedia`).
- Fade-Cue pausiert nur seinen Timer; die laufende Gain-Automation in Web Audio läuft beim Pausieren weiter.
- Loop mit Start/Ende-Trimmung springt per `tick()` (20 ms) zurück, das ist nicht ganz nahtlos.
  Ohne Trimmung wird `el.loop` genutzt und ist nahtlos.
- Ende-Erkennung und Fade-Out am Ende laufen per 20-ms-Intervall (Timer im Hintergrund-Tab: Audio-Tabs werden nicht gedrosselt).
- Die Wellenform wird bei 11 025 Hz berechnet; sehr hohe Frequenzen (z. B. Hi-Hats) sind darin kaum zu sehen.
- Firefox: keine Installation auf dem Desktop, kein `setSinkId` am AudioContext.
- AGPL: Copyright-Zeile (Name des Rechteinhabers) in README bzw. Quelldateien fehlt noch, falls gewünscht.

## Tests

**Nutzertest 1 (Android-Smartphone, Chrome), v0.1.0:**
✅ Tonausgabe · ✅ Fade-Cue · ✅ Pause-Cue · ✅ Memo-Cue (Wunsch: auffälliger, umgesetzt in v0.2.0)

**Nutzertest 2 (Smartphone), v0.4.0:**
❌ Langes Drücken zur Auswahl kollidierte mit Scrollen und Drag & Drop → v0.4.1 ·
❌ Memo-Zeilen unterschiedlich breit → v0.4.1 · Desktop noch nicht getestet

**Implementiert, aber noch nicht vom Nutzer getestet:**

- Eingebaute Hilfe (v0.5.0) auf Handy und Desktop, offline nach Update
- Alles aus v0.2.0–v0.4.0 (Pause-Fade, Klonen, Memo/Regiebuch, Presets, Start/Stop-Cue, Show/Edit-Schalter,
  Memo-Bestätigung, Mehr-Cue-Presets, Mehrfachauswahl), besonders auf dem Handy
- Android: Installation als App, Latenz, Wake Lock, Hintergrundverhalten
- Windows/Linux-Installation als App, Desktop-Darstellung allgemein
- MIDI mit echter Hardware (Lernen, Trigger, MIDI-Cues)
- Ausgabegerät-Wahl (`AudioContext.setSinkId`)
- Start/Stop-Cue mit Ziel „Alle“, Auto-Follow, Loop mit Trimmung, Fade-Out am Ende, Panorama
- Offline-Betrieb nach Installation, Update von v0.1.0 auf v0.2.0 (DB-Upgrade auf Version 2)
