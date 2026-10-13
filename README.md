# Cue Player

Ein plattformübergreifender **Show-Player für Theater, Events und Live-Sound** – inspiriert vom
Funktionsumfang des [Linux Show Player](https://www.linux-show-player.org/) (LSP).

Läuft als **Progressive Web App (PWA)** auf **Android, Windows und Linux** (und macOS) – aus einer
einzigen Codebasis, ohne Store, offline-fähig, installierbar wie eine normale App.

> **Status: Prototyp (v0.1.0).** Grundfunktionen sind da und getestet, für den Ernstfall bitte
> vorher ausgiebig mit dem eigenen Gerät proben (siehe [Grenzen](#grenzen-des-prototyps)).

## Dokumentation

| Dokument | Inhalt |
|---|---|
| [docs/INSTALLATION.md](docs/INSTALLATION.md) | Installation auf Android, Windows, Linux; eigenes Hosting; Entwicklung |
| [docs/BENUTZERHANDBUCH.md](docs/BENUTZERHANDBUCH.md) | Bedienung: Cues anlegen, Show fahren, Trigger, MIDI, Export |
| [docs/STAND.md](docs/STAND.md) | Entwicklungsstand, ToDo-Liste, bekannte Schwächen, Tests |

## Funktionen

| Bereich | Cue Player (Prototyp) | Linux Show Player |
|---|---|---|
| Cue-Liste mit GO-Taste & Standby | ✅ | ✅ |
| Cart-Layout (Button-Raster) | ✅ | ✅ |
| Audio-Cues (MP3, WAV, OGG, FLAC, M4A, Opus …) | ✅ | ✅ |
| Lautstärke (dB), Panorama, Start/Ende-Trimmung, Loop | ✅ | ✅ |
| Fade-In / Fade-Out (linear / logarithmisch) | ✅ | ✅ |
| Fade-Cue (Lautstärke eines laufenden Cues ändern) | ✅ | ✅ |
| Stop-, Start-, Pause/Weiter-Cues (Pause/Weiter mit Fade) | ✅ | ✅ |
| Pre-Wait, Post-Wait, Auto-Continue, Auto-Follow | ✅ | ✅ |
| Stop alle (mit Fade), Pause alle, Weiter | ✅ | ✅ |
| Tastatur-Trigger pro Cue | ✅ | ✅ |
| MIDI-Trigger (Eingang) & MIDI-Cues (Ausgang) | ✅ (Web MIDI) | ✅ |
| Mehrere Shows, Export/Import als eine Datei | ✅ (`.cueshow`) | ✅ (`.lsp`) |
| Show-Modus (Bearbeiten sperren) | ✅ | – |
| Memo-Cues als Zwischenüberschrift, Regiebuch mit Markdown | ✅ | – |
| Cues klonen | ✅ | ✅ |
| Ausgabegerät wählen | ✅ (Chrome/Edge) | ✅ |
| Video-Cues, OSC, Kommando-Cues, Gruppen-Cues | ❌ (Roadmap) | ✅ |
| Mehrkanal-Routing, JACK, Timecode | ❌ | ✅ |

## Warum PWA?

Für das Ziel „Android + Windows + Linux“ wurden drei Wege abgewogen:

1. **PWA (gewählt)** – eine Codebasis (HTML/CSS/JavaScript), läuft in Chrome/Edge/Chromium auf
   allen drei Plattformen, installierbar (eigenes Fenster, Startmenü-/Homescreen-Icon), offline
   dank Service Worker. Kein Build-Schritt, kein App-Store, Updates kommen automatisch.
   Audio läuft über die Web Audio API, MIDI über Web MIDI.
2. **Native App (z. B. Flutter, Qt)** – beste Audio-Kontrolle, aber deutlich mehr Aufwand,
   drei Build-Pipelines und Store-/Signierprozesse.
3. **Hybrid** – die PWA später in eine **Tauri**- (Windows/Linux) bzw. **Capacitor**-Hülle
   (Android-APK) packen. Das ist der geplante nächste Schritt, *falls* Funktionen gebraucht werden,
   die ein Browser nicht kann (OSC/Netzwerk, Systembefehle, Mehrkanal-Audio). Der Code dieses
   Prototyps bleibt dabei wiederverwendbar.

Für einen ersten Prototyp ist die PWA damit der schnellste Weg zu einem auf allen Zielplattformen
benutzbaren Ergebnis.

## Schnellstart (lokal)

```bash
git clone <dieses-repo> cue-player
cd cue-player
python3 -m http.server 8080      # oder: npx http-server -p 8080
```

Dann <http://localhost:8080> in Chrome, Edge oder Chromium öffnen. Details – auch für Android –
in [docs/INSTALLATION.md](docs/INSTALLATION.md).

## Aufbau

```
index.html             Oberfläche (Grundgerüst, Dialoge)
manifest.webmanifest   PWA-Manifest (Name, Icons, Darstellung)
sw.js                  Service Worker (Offline-Cache)
css/app.css            Gestaltung (dunkel, touch-tauglich, responsiv)
js/app.js              UI-Logik: Liste, Cart, Editor, Shows, Einstellungen, Tastatur, MIDI-Trigger
js/engine.js           Wiedergabe-Engine: Cue-Ablauf, Audio-Kette, Fades
js/model.js            Datenmodell (Session, Cue-Typen, Standardwerte)
js/storage.js          IndexedDB-Speicher, Export/Import (.cueshow)
js/midi.js             Web-MIDI-Anbindung
js/md.js               Markdown-Renderer (sicher, ohne Bibliothek)
js/util.js             Hilfsfunktionen (Timer, dB-Umrechnung, Fade-Kurven)
tests/smoke.mjs        Browser-Smoke-Test (Playwright)
icons/                 App-Icons
docs/                  Anleitungen
```

**Audio-Kette pro Audio-Cue:**
`<audio>` (gestreamt) → Lautstärke (Fade-Cues) → Hüllkurve (Fade-In/-Out, Stop-Fade) → Panorama → Master → Ausgang.

Die Audiodateien werden **gestreamt** statt komplett dekodiert – so bleiben auch lange Titel auf
Android speicherschonend.

## Grenzen des Prototyps

- **Browser:** Volle Funktion nur in Chromium-Browsern (Chrome, Edge, Chromium, Brave, Samsung Internet
  teilweise). Firefox spielt ab, kann die App aber auf dem Desktop nicht installieren und unterstützt
  die Ausgabegerät-Wahl nicht. iOS/Safari: kein Web MIDI, eingeschränkt getestet.
- **Timing:** Startlatenz typisch 10–50 ms am Desktop, auf Android teils mehr. Für Theater ausreichend,
  für sample-genaue Synchronisation nicht.
- **Speicher:** Shows und Audiodateien liegen im Browser-Speicher (IndexedDB). Regelmäßig exportieren
  (Backup!). „Dauerhaften Speicher“ in den Einstellungen anfordern.
- **Android:** App im Vordergrund lassen. Die App hält den Bildschirm wach (abschaltbar). Energiesparmodus
  für den Browser deaktivieren.
- **Fehlt noch:** Video, OSC, Gruppen-Cues, Kommando-Cues, Undo, Mehrkanal-Routing, Pegelanzeige.

## Roadmap (Vorschlag)

1. Pegelanzeige (VU) und Vorhören auf zweitem Ausgang
2. Gruppen-Cues, Undo/Redo, Mehrfachauswahl
3. Video-Cues (Vollbild auf zweitem Bildschirm)
4. Tauri-Desktop-Build (OSC, Netzwerk-Fernsteuerung, Ordner statt Browser-Speicher)
5. Capacitor-Android-Build (APK, Hintergrund-Wiedergabe als Foreground-Service)
