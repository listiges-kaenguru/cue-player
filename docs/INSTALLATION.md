# Installation

Cue Player ist eine Web-App (PWA). Sie wird **einmal auf einem Webserver bereitgestellt** und dann
auf jedem Gerät im Browser geöffnet und dort **installiert**. Danach läuft sie wie eine normale App –
auch **ohne Internet**.

> **Wichtig:** PWAs funktionieren nur über **HTTPS** oder über **`http://localhost`**.
> Eine einfache `http://192.168.x.x`-Adresse reicht für Installation und Offline-Betrieb nicht.

Inhalt:

1. [Bereitstellen](#1-bereitstellen) – GitHub Pages (empfohlen), lokal, eigener Server
2. [Installieren auf Android](#2-android)
3. [Installieren auf Windows](#3-windows)
4. [Installieren auf Linux](#4-linux)
5. [Updates](#5-updates)
6. [Deinstallieren & Daten](#6-deinstallieren--daten)
7. [Für Entwickler](#7-für-entwickler)

---

## 1. Bereitstellen

### Variante A: GitHub Pages (empfohlen, kostenlos, HTTPS inklusive)

Das Repository enthält bereits einen Workflow (`.github/workflows/pages.yml`), der die App bei jedem
Push auf `main` veröffentlicht.

1. Auf GitHub im Repository: **Settings → Pages**.
2. Unter **Build and deployment → Source** „**GitHub Actions**“ wählen.
3. Den Code auf den Branch `main` bringen (Merge des Pull Requests) – oder unter **Actions →
   „Deploy to GitHub Pages“ → Run workflow** manuell starten.
4. Nach ca. einer Minute ist die App erreichbar unter
   `https://<benutzername>.github.io/<repository>/`
   (hier z. B. `https://listiges-kaenguru.github.io/cue-player/`).

> Hinweis: Bei privaten Repositories ist GitHub Pages nur mit einem kostenpflichtigen GitHub-Plan
> verfügbar. Alternativ Variante C nutzen (z. B. Netlify, Cloudflare Pages – dort einfach den
> Repository-Ordner ohne Build-Befehl veröffentlichen).

### Variante B: Lokal auf einem Rechner (Windows/Linux)

Geeignet, wenn die App nur auf **diesem einen Rechner** laufen soll oder zum Ausprobieren.

Mit Python (unter Linux meist vorinstalliert, unter Windows über <https://python.org>):

```bash
cd cue-player
python3 -m http.server 8080        # Windows: py -m http.server 8080
```

Oder mit Node.js:

```bash
cd cue-player
npx http-server -p 8080 -c-1
```

Dann im Browser <http://localhost:8080> öffnen. `localhost` gilt als sicher – Installation und
Offline-Betrieb funktionieren. Nach der Installation muss der Server **nicht mehr laufen**; die
App kommt aus dem Offline-Cache.

### Variante C: Eigener Webserver

Den Inhalt des Repositorys (alle Dateien außer `.git`/`.github`/`tests`; aus `docs` wird nur
`docs/BENUTZERHANDBUCH.md` gebraucht, die eingebaute Hilfe) in ein Verzeichnis eines
HTTPS-Webservers kopieren (nginx, Apache, Caddy …). Es gibt keinen Build-Schritt und keine
Server-Logik – es sind nur statische Dateien. Unterordner (`https://example.org/cue/`) funktionieren.

Empfohlener MIME-Typ für das Manifest: `application/manifest+json` (die meisten Server machen das
automatisch).

Die App-Icons liegen bewusst in `img/` und nicht in `icons/`: Apache leitet `/icons/` in der
Standard-Konfiguration auf seine eigenen Symbole um (`Alias /icons/ …`), dann fänden Browser die
App-Icons nicht.

**Cache-Header (empfohlen):** Damit neue Versionen sofort ankommen, sollte der Server bei allen
Dateien `Cache-Control: no-cache` senden (der Browser fragt dann jedes Mal kurz nach, unveränderte
Dateien kommen als „304 Not Modified“). Bei Apache genügt eine `.htaccess` im App-Ordner:

```apache
<IfModule mod_headers.c>
  Header set Cache-Control "no-cache"
</IfModule>
```

**Impressum-Link (optional):** Die Datei `site.json` enthält Angaben des Betreibers. Im Repository
ist sie leer (`{}`), damit eine selbst gehostete Kopie kein fremdes Impressum übernimmt. Für einen
Link in ⚙ Einstellungen → Info die Datei auf dem eigenen Server so befüllen:

```json
{ "legal": { "url": "https://example.org/impressum.html", "label": "Impressum & Datenschutz" } }
```

`label` ist optional. Die Datei muss vorhanden sein (notfalls mit `{}`), sonst kann die App nicht
offline installiert werden. Beim Aktualisieren der App die eigene `site.json` nicht überschreiben.
Geänderte Angaben erscheinen bei installierten Apps mit dem nächsten App-Update.

---

## 2. Android

Voraussetzung: **Google Chrome** (empfohlen) oder Microsoft Edge, Android 8 oder neuer.

1. Die App-Adresse (z. B. `https://listiges-kaenguru.github.io/cue-player/`) in Chrome öffnen.
2. Chrome zeigt unten „**App installieren**“ – antippen. Falls nicht:
   Menü **⋮ → App installieren** (bzw. „Zum Startbildschirm hinzufügen“).
3. Die App erscheint auf dem Startbildschirm und in der App-Übersicht und öffnet sich ohne
   Browserleiste.
4. Einmal mit Internet öffnen – danach funktioniert sie offline.

**Empfohlene Einstellungen für den Show-Einsatz:**

- *Einstellungen → Apps → Chrome → Akku → Nicht eingeschränkt* (sonst kann Android den Browser
  drosseln).
- Bitte-nicht-stören aktivieren (keine Benachrichtigungstöne über die Anlage!).
- In Cue Player unter ⚙ **„Bildschirm nicht abschalten“** aktiv lassen.
- In Cue Player unter ⚙ → Speicher → **„Dauerhaft: Anfordern“** antippen.
- Audio über Kopfhörerbuchse oder USB-Audio-Interface (USB-C) ausgeben; Bluetooth hat hohe
  Latenz (100–300 ms) und ist für Shows ungeeignet.

**MIDI auf Android:** USB-MIDI-Geräte (per OTG-Adapter) werden von Chrome erkannt. Beim Aktivieren
von MIDI fragt Chrome nach der Berechtigung.

---

## 3. Windows

Voraussetzung: **Microsoft Edge** oder **Google Chrome** (Windows 10/11).

1. App-Adresse öffnen.
2. In der Adressleiste rechts auf das Symbol **„App installieren“** (Monitor mit Pfeil) klicken –
   oder Menü **⋯ → Apps → Diese Website als App installieren** (Edge) bzw.
   **⋮ → Streamen, speichern und teilen → Seite als App installieren** (Chrome).
3. Die App bekommt ein eigenes Fenster, einen Startmenü-Eintrag und kann an die Taskleiste
   angeheftet werden.

**Tipps:**

- Ausgabegerät (z. B. USB-Interface) in Cue Player unter ⚙ → **Ausgabegerät** wählen. Um
  Gerätenamen statt „Ausgang 1, 2 …“ zu sehen, „Namen anzeigen“ klicken und die
  Mikrofon-Freigabe erlauben (wird nur für die Gerätenamen benötigt).
- Windows-Systemklänge für die Show abschalten.
- Energieoptionen: „Höchstleistung“, Bildschirmschoner aus.

---

## 4. Linux

Voraussetzung: **Chromium**, **Google Chrome**, **Brave** oder **Microsoft Edge**.

1. App-Adresse öffnen.
2. Installieren-Symbol in der Adressleiste anklicken (oder Menü **⋮ → … → Seite als App
   installieren**).
3. Der Browser legt einen Starter (`.desktop`-Datei) an – die App erscheint im Anwendungsmenü.

**Hinweise:**

- Firefox kann die Seite benutzen, aber nicht als App installieren und bietet keine
  Ausgabegerät-Auswahl. Für den Show-Betrieb Chromium-basierte Browser verwenden.
- Chromium als Snap/Flatpak: Für MIDI-Geräte ggf. Zugriff erlauben
  (`snap connect chromium:alsa`, bzw. bei Flatpak `--device=all`).
- Audio läuft über PulseAudio/PipeWire. Mit PipeWire lässt sich die Ausgabe der App mit
  `qpwgraph`/`helvum` frei routen – auch auf mehrkanalige Interfaces.
- Zeigt die installierte App nur einen grauen Buchstaben statt des Icons, konnte der Browser die
  Icons bei der Installation nicht laden (z. B. Version vor 0.5.1 auf einem Apache-Server). Die App
  deinstallieren und nach dem Update neu installieren – das Icon wird nur bei der Installation
  übernommen.

---

## 5. Updates

Die App prüft beim Start im Hintergrund auf eine neue Version. Liegt eine vor, erscheint
„Update geladen – beim nächsten Start aktiv“. App einfach schließen und neu öffnen.

**Shows und Audiodateien bleiben bei Updates erhalten.** Vor größeren Updates trotzdem die Shows
exportieren (☰ → „Aktuelle exportieren“).

---

## 6. Deinstallieren & Daten

- **Android:** App-Icon lange drücken → Deinstallieren.
- **Windows/Linux:** In der App Menü **⋯ → „Cue Player deinstallieren“** oder unter
  `chrome://apps` bzw. `edge://apps`.

Achtung: Beim Deinstallieren (bzw. beim Löschen der Website-Daten im Browser) werden **alle
gespeicherten Shows und Audiodateien gelöscht**. Vorher exportieren!

Die Daten liegen im Browserprofil (IndexedDB) des jeweiligen Geräts. Zwischen Geräten werden sie
über **Export/Import von `.cueshow`-Dateien** übertragen (siehe Benutzerhandbuch).

---

## 7. Für Entwickler

- Kein Build-Schritt, keine Abhängigkeiten: reines HTML, CSS und JavaScript-Module.
- Lokal starten wie in Variante B. Mit `npx http-server -c-1` wird das HTTP-Caching abgeschaltet.
- **Service-Worker-Cache:** Die App-Dateien werden „Cache-First“ ausgeliefert. Nach Codeänderungen
  entweder in den DevTools unter *Application → Service Workers* „Update on reload“ aktivieren oder
  `VERSION` in `sw.js` erhöhen (das ist auch für jedes Release nötig, damit Nutzer das Update
  bekommen). Neue Dateien in `ASSETS` in `sw.js` eintragen.
- Debuggen auf Android: Gerät per USB verbinden, USB-Debugging aktivieren, am PC
  `chrome://inspect` öffnen. Für Tests im LAN ohne HTTPS kann Port-Forwarding in
  `chrome://inspect` genutzt werden (`localhost:8080` auf dem Handy → PC).
- Aufbau der Module: siehe [README](../README.md#aufbau).
