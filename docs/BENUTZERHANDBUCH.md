# Benutzerhandbuch

Cue Player spielt eine vorbereitete Liste von **Cues** (Einsätzen) ab – Musik, Geräusche, Fades,
Stopps – jeweils auf Knopfdruck mit der **GO**-Taste. Typische Einsätze: Theater, Lesungen,
Tanzaufführungen, Gottesdienste, Vereinsfeiern.

Inhalt:

1. [Grundbegriffe](#1-grundbegriffe)
2. [Der Bildschirm](#2-der-bildschirm)
3. [Eine Show vorbereiten](#3-eine-show-vorbereiten)
4. [Cue-Typen](#4-cue-typen)
5. [Ablaufsteuerung: Pre-Wait, Post-Wait, Auto-Continue, Auto-Follow](#5-ablaufsteuerung)
6. [Die Show fahren](#6-die-show-fahren)
7. [Cart-Ansicht](#7-cart-ansicht)
8. [Tastatur- und MIDI-Trigger](#8-tastatur--und-midi-trigger)
9. [Shows verwalten, sichern und übertragen](#9-shows-verwalten-sichern-und-übertragen)
10. [Einstellungen](#10-einstellungen)
11. [Tastenkürzel](#11-tastenkürzel)
12. [Checkliste vor der Vorstellung](#12-checkliste-vor-der-vorstellung)
13. [Fehlerbehebung](#13-fehlerbehebung)

---

## 1. Grundbegriffe

| Begriff | Bedeutung |
|---|---|
| **Show** | Eine Sammlung von Cues mit eigenen Einstellungen. |
| **Cue** | Ein Eintrag in der Liste: spielt eine Datei ab oder führt eine Aktion aus. |
| **Standby** | Der Cue, der beim nächsten **GO** ausgelöst wird. Blau markiert mit ▸. |
| **GO** | Löst den Standby-Cue aus und setzt den Standby auf den nächsten Cue. |
| **Fade** | Allmähliche Lautstärkeänderung. |
| **dB** | Lautstärke in Dezibel. 0 dB = Originallautstärke, −6 dB ≈ halbe Amplitude, −∞ = stumm. |

---

## 2. Der Bildschirm

```
┌───────────────────────────────────────────────────────────────────────┐
│ ☰  Meine Show   ＋Audio  ＋Cue▾      ▦ Cart  ✎ Edit ◯━ ▶ Show  ?  ⚙  │  ← Kopfleiste
├────────────────────────────────────────────────────┬──────────────────┤
│ #  Cue                   Pre    Dauer       Post   │ AKTIV            │
│ 1  ♪ Einlassmusik               ███░░ 1:02  ↧ AF   │ 1 · Einlassmusik │
│ 2▸ ◢ Fade #1 → −∞               0:03.0             │        ❚❚  ■     │
│                                                    │ ▁▃▅▇▅▃▂▃▅▆▄▂▁  ▌ │
│ 3  ♪ Gewitter          0:02.0   0:45.0             │                  │
├────────────────────────────────────────────────────┴──────────────────┤
│ [   GO   ]  [■ Stop alle] [❚❚ Pause] [▶ Weiter]  Master ──●─ 0 dB ▬▬▬▫│  ← Transportleiste
│  2 · Fade…                                                            │
└───────────────────────────────────────────────────────────────────────┘
```

- **☰** – Shows verwalten (neu, öffnen, löschen, exportieren, importieren).
- **Show-Name** – direkt anklicken und umbenennen.
- **＋ Audio** – Audiodateien hinzufügen (mehrere auf einmal möglich).
- **＋ Cue ▾** – Fade-, Start/Stop-, Pause/Weiter-, MIDI- oder Memo-Cue oder ein Preset hinzufügen.
- **▦ Cart / ☰ Liste** – zwischen Listen- und Button-Ansicht wechseln.
- **Schalter ✎ Edit / ▶ Show** – links (orange) = Bearbeiten, rechts (grün) = Show-Modus. Der Show-Modus sperrt alle Bearbeitungen, damit während der Vorstellung
  nichts versehentlich verändert wird.
- **?** – diese Hilfe (Benutzerhandbuch) öffnen, auch mit **F1**. Funktioniert offline; Links im
  Inhaltsverzeichnis springen zum Abschnitt, **↑ Inhalt** wieder nach oben.
- **⚙** – Einstellungen.
- **📖 Regiebuch** (rechts oben, auf dem Handy über GO) – Memo-Texte und Notizen zum nächsten Cue,
  siehe [Memo](#-memo).
- **Aktiv** (rechts, auf dem Handy unten) – alle gerade laufenden Cues mit Fortschritt,
  Pause- und Stop-Knopf. Bei Audio-Cues zeigt der Balken die **Wellenform** der Datei (der schon gespielte
  Teil ist farbig), rechts daneben steht der aktuelle **Pegel** des Cues. Ein Klick auf den Balken springt an
  diese Stelle, siehe [Die Show fahren](#6-die-show-fahren).
- **Breite des rechten Bereichs** (am PC): Den linken Rand von Regiebuch/Aktiv mit der Maus ziehen. Die Breite
  merkt sich das Gerät; **Doppelklick** auf den Rand stellt die Standardbreite wieder her. Mit der Tastatur:
  Rand per Tab anwählen, dann **← / →**.
- **Pegelanzeige** (rechts neben dem Master-Regler) – zeigt links/rechts, was tatsächlich rausgeht, also
  nach der Master-Lautstärke. Grün ist normal, gelb laut (über −18 dB), rot sehr laut (über −6 dB). Der weiße
  Strich hält kurz den Spitzenwert. Leuchtet das Feld ganz rechts **rot**, war der Ton übersteuert (0 dB
  erreicht, es kann verzerren). Dann Master oder Cue leiser stellen. Die Markierung erlischt nach drei Sekunden.
- **Farben der Fortschrittsbalken:** grün = läuft, violett = Pre-Wait, orange = Post-Wait,
  gelb = pausiert.

Auf schmalen Bildschirmen (Handy) werden die Spalten Pre/Post ausgeblendet; sie sind im Editor
weiterhin einstellbar.

---

## 3. Eine Show vorbereiten

1. **Show anlegen:** ☰ → **Neue Show**, Namen eingeben. (Beim ersten Start gibt es bereits
   „Meine Show“.)
2. **Audiodateien hinzufügen:**
   - **＋ Audio** antippen und Dateien auswählen, **oder**
   - am PC Dateien aus dem Dateimanager in das Fenster **ziehen**.

   Neue Cues werden **hinter dem Standby-Cue** eingefügt. Unterstützt werden alle Formate, die der
   Browser abspielen kann (MP3, WAV, OGG, FLAC, M4A/AAC, Opus, WebM).
   Die Dateien werden **in die App kopiert** – die Originale können danach verschoben werden.
3. **Cue bearbeiten:** Doppelklick auf die Zeile oder **✎** antippen. Es öffnet sich der Editor
   (siehe [Cue-Typen](#4-cue-typen)). Mit **Übernehmen** speichern.
4. **Reihenfolge ändern:**
   - am PC: Zeile mit der Maus an die neue Stelle ziehen, oder
   - die Pfeile **↑ ↓** in der Zeile, oder
   - im Editor die **Position** (Nummer) ändern – funktioniert auch auf dem Handy.
5. **Klonen:** Im Editor auf **Klonen** tippen (funktioniert überall, auch auf dem Handy und in der
   Cart-Ansicht) oder am PC **⧉** in der Zeile. Die Kopie wird direkt hinter dem Original eingefügt;
   beim Klonen aus dem Editor werden vorher die Änderungen übernommen und gleich der Editor der Kopie
   geöffnet. Die Kopie ist unabhängig vom Original. Tasten- und MIDI-Trigger werden nicht mitkopiert,
   damit eine Taste nicht versehentlich zwei Cues auslöst. Name: „… (Kopie)“.
6. **Löschen:** Im Editor unten links **Löschen**.
7. **Mehrere Cues auf einmal** (Listenansicht, Edit-Modus):
   - am PC: **Strg+Klick** wählt einzelne Cues aus oder ab, **Shift+Klick** wählt einen Bereich;
   - auf Handy/Tablet (und auch am PC): im Tabellenkopf neben **#** auf **☑** tippen. Im Auswahl-Modus
     schaltet jedes Antippen einer Zeile die Auswahl um (☐/☑); Drag & Drop ist dann abgeschaltet.
   Unten erscheint eine Leiste mit **Als Preset…**, **Klonen**, **Löschen** und **✕ Fertig** (Auswahl beenden).
   Beim Klonen einer Auswahl zeigen Fades/Start/Stop innerhalb des Blocks auf die Kopien, nicht auf die Originale.
   Ein normaler Klick/Tipp ohne Taste hebt die Auswahl auf und setzt den Standby.

Alles wird **automatisch gespeichert**.

### Presets (Vorlagen)

Häufig gebrauchte Cues lassen sich als **Preset** speichern und mit zwei Tipps wieder einfügen.
Presets gelten **für alle Shows** auf diesem Gerät.

- **Einfügen:** **＋ Cue ▾** → Abschnitt **Presets** → Preset antippen. Die Cues werden hinter dem
  Standby-Cue eingefügt. Presets aus mehreren Cues sind mit „(N Cues)“ gekennzeichnet.
  Fade- und Start-Cues ohne eigenes Ziel zielen automatisch auf den Cue vor dem eingefügten Block.
- **Speichern (ein Cue):** Cue fertig einstellen, im Editor **Als Preset…** antippen und einen Namen vergeben.
- **Speichern (mehrere Cues):** Cues auswählen (siehe „Mehrere Cues auf einmal“ oben) und in der
  Auswahl-Leiste **Als Preset…** antippen. Verweise *innerhalb* der Auswahl bleiben erhalten: Ein
  Fade auf einen mitgespeicherten Audio-Cue zielt nach dem Einfügen auf dessen neue Kopie. Verweise
  auf Cues *außerhalb* der Auswahl werden geleert.
- Gespeichert werden alle Einstellungen außer Tasten-/MIDI-Trigger. Auch Audio-Cues gehen, z. B. ein
  Standard-Jingle: Die Audiodatei bleibt dann im Gerät gespeichert.
- **Verwalten:** **＋ Cue ▾** → **Presets verwalten…** → umbenennen oder löschen.
  **Standard-Presets wiederherstellen** ergänzt die mitgelieferten Vorlagen, falls sie gelöscht wurden.
- **Ändern:** Preset einfügen, anpassen, unter gleichem Namen neu als Preset speichern und das alte löschen.

Mitgeliefert werden: *Ausblenden 3 s + Stop*, *Musik unter Text (−15 dB, 3 s)*,
*Pause/Weiter mit Fade 2 s*, *Alles ausblenden 5 s* und als Mehr-Cue-Preset
*Szenenwechsel: alles ausblenden + Umbau (bestätigen)* (Stop alle mit 3 s Fade, danach ein Memo
„Umbau“ mit Bestätigung). Wer die App schon vorher genutzt hat, bekommt neue Standard-Presets über
**Presets verwalten… → Standard-Presets wiederherstellen**.

Hinweis: Presets werden (noch) nicht mit einer Show exportiert. Beim Wechsel auf ein anderes Gerät
müssen sie dort neu angelegt werden.

---

## 4. Cue-Typen

Alle Cues haben diese gemeinsamen Felder:

| Feld | Bedeutung |
|---|---|
| Name | Anzeigename. Leer lassen = automatischer Name (z. B. Dateiname, „Fade #1 → −∞“). |
| Position | Nummer in der Liste. |
| Farbe | Farbmarkierung in Liste und Cart. |
| Pre-Wait, Danach, Post-Wait | Ablaufsteuerung, siehe [Abschnitt 5](#5-ablaufsteuerung). |
| Taste, MIDI | Direkt-Trigger, siehe [Abschnitt 8](#8-tastatur--und-midi-trigger). |
| Notizen | Hinweise für die Technik. In der Liste steht die erste Zeile unter dem Namen, vollständig und formatiert erscheinen sie im Regiebuch, wenn der Cue im Standby steht. Markdown wie beim Memo. |

### ♪ Audio

Spielt eine Audiodatei ab.

| Feld | Bedeutung |
|---|---|
| Datei | Andere Datei wählen. |
| Lautstärke | −∞ bis +12 dB. |
| Panorama | −1 = links, 0 = Mitte, +1 = rechts. |
| Start bei / Ende bei | Ausschnitt der Datei in Sekunden. „Ende 0“ = bis Dateiende. |
| Fade-In | Einblenddauer beim Start. |
| Fade-Out | Automatisches Ausblenden vor dem Ende. |
| Fade-Kurve | *Logarithmisch* klingt meist natürlicher, *Linear* fällt anfangs langsamer ab. |
| Schleife | Wiederholt den Ausschnitt endlos, bis der Cue gestoppt wird. |

**GO auf einen laufenden Audio-Cue** startet ihn neu von vorne. **GO auf einen pausierten** setzt
ihn fort.

### ◢ Fade

Ändert die Lautstärke eines **laufenden** Audio-Cues über eine Zeit.

| Feld | Bedeutung |
|---|---|
| Ziel-Cue | Der Audio-Cue, der gefadet wird (vorbelegt: der Cue davor). |
| Ziel-Lautstärke | Endlautstärke; ganz links = −∞ (aus). |
| Dauer | Fade-Dauer in Sekunden. |
| Danach stoppen | Ziel-Cue nach dem Fade beenden (sinnvoll beim Ausblenden auf −∞). |

Beispiel „Musik unter Text ziehen“: Fade-Cue auf −15 dB, 3 s, *Danach stoppen* aus. Später ein
zweiter Fade auf −∞ mit *Danach stoppen* an.

### ▶■ Start / Stop

Startet oder stoppt einen anderen Cue, aufgebaut wie der Pause/Weiter-Cue.

| Feld | Bedeutung |
|---|---|
| Ziel-Cue | Der gesteuerte Cue (vorbelegt: der Cue davor). „Alle laufenden Cues“ wirkt nur beim Stoppen. |
| Aktion | *Umschalten* (Ziel läuft → stoppen, sonst starten; ein pausiertes Ziel wird fortgesetzt), *Starten* oder *Stoppen*. |
| Fade-Out beim Stoppen | Ausblendzeit beim Stoppen. 0 = sofort. |

Beispiele: *Stoppen* mit Ziel „Alle“ und 5 s Fade beendet die Szene. *Starten* löst mehrere Cues
von einer Stelle aus. *Umschalten* auf einer Taste schaltet z. B. eine Regen-Schleife ein und wieder aus.

Shows aus älteren Versionen mit getrennten Start- und Stop-Cues werden beim Öffnen automatisch
umgewandelt.

### ❚❚ Pause / Weiter

Pausiert, setzt fort oder schaltet um – für einen Cue oder alle laufenden.

| Feld | Bedeutung |
|---|---|
| Ziel-Cue | Ein bestimmter Cue oder (leer) alle laufenden Cues. |
| Aktion | *Umschalten* (laufende pausieren, pausierte fortsetzen), *Pausieren* oder *Fortsetzen*. |
| Fade beim Pausieren | Audio wird über diese Zeit ausgeblendet und erst dann angehalten. 0 = sofort. |
| Fade beim Fortsetzen | Audio setzt leise ein und wird über diese Zeit eingeblendet. 0 = sofort. |

Die Fades verwenden die Fade-Kurve des jeweiligen Audio-Cues. Der Cue gilt sofort als „pausiert“,
der Ton blendet aber noch aus. Beispiel: Musik bei einer Szenenunterbrechung über 2 s ausblenden
und später mit 3 s wieder einblenden, an derselben Stelle.

### ⎍ MIDI

Sendet eine MIDI-Nachricht (Note On/Off, Control Change, Program Change) – z. B. um ein
Lichtpult, einen Sampler oder ein Mischpult-Preset anzusteuern. MIDI muss in den Einstellungen
aktiviert sein.

### ✎ Memo

Gliedert die Show und enthält Hinweise für die Technik. Spielt nichts ab.

- **In der Liste** erscheint ein Memo als breite, farbige **Zwischenüberschrift** (Name des Memos,
  z. B. „1. Akt – Im Wald“, „PAUSE“, „Achtung: Umbau“). Die Farbe lässt sich im Editor wählen. In der Cart-Ansicht
  hat die Kachel einen gestrichelten Rahmen.
- **Der Text** des Memos erscheint formatiert im **Regiebuch** (siehe unten), sobald das Memo oder der
  Cue direkt danach im Standby steht. Im Editor zeigt eine Vorschau, wie der Text aussehen wird.
- **GO überspringt Memos**: Nach einem GO landet der Standby nie auf einem Memo, sondern auf dem
  nächsten Cue dahinter. Ein Memo kostet also kein zusätzliches GO, sein Text bleibt aber im Regiebuch
  sichtbar. Ausnahme: Ein Memo mit Pre-Wait oder Auto-Continue/-Follow wird normal angefahren und
  kann so z. B. als Wartezeit vor dem nächsten Cue dienen. Mit ↑/↓ oder Antippen lässt sich ein Memo
  trotzdem auswählen.
- **Bestätigung vor GO (optional):** Im Memo-Editor **„Vor dem nächsten GO bestätigen lassen“**
  anhaken. Steht dieses Memo direkt vor dem Standby-Cue, wird die GO-Taste orange („🔒 bestätigen“).
  Das GO startet dann noch nichts, sondern zeigt eine große Abfrage mit dem Memo-Text:
  **Bestätigen & GO** (oder Leertaste bzw. MIDI-GO) startet den Cue, **Abbrechen** (oder Esc) nicht.
  Gedacht für Stellen, an denen erst ein Zeichen abgewartet werden muss (Umbau, Freigabe, Einlass).
  Cart-Kacheln sowie Tasten- und MIDI-Trigger einzelner Cues werden **nicht** blockiert. In der
  Liste erkennt man solche Memos am Abzeichen „🔒 bestätigen“.

**Formatierung (Markdown)** für Memo-Text und Notizen:

| Eingabe | Ergebnis |
|---|---|
| `# Überschrift`, `## …`, `### …` | Überschriften: `#` als Abschnittskopf (klein, grau, mit Linie), `##` groß, `###` kleiner |
| `**fett**`, `*kursiv*`, `~~durchgestrichen~~`, `==markiert==` | Hervorhebungen |
| `- Punkt` oder `* Punkt` | Aufzählung |
| `1. Schritt` | Nummerierte Liste |
| `! Text` | Roter Warnkasten |
| `> Text` | Zitat, z. B. Stichwort aus dem Textbuch |
| Leerzeile | Neuer Absatz |

### Regiebuch-Bereich

Der Bereich **📖 Regiebuch** steht am PC rechts über „Aktiv“, auf dem Handy über der GO-Taste. Er
zeigt automatisch:

- die Memos, die **direkt vor** dem Standby-Cue stehen (bzw. das Memo selbst, wenn es ausgewählt ist), und
- die **Notizen des Standby-Cues**.

Gibt es nichts anzuzeigen, verschwindet der Bereich. Mit einem Tipp auf die Kopfzeile lässt er sich
zuklappen, z. B. auf dem Handy, wenn der Platz knapp ist. Das Gerät merkt sich, ob er auf- oder zugeklappt ist.

---

## 5. Ablaufsteuerung

Jeder Cue hat drei Einstellungen im Editor unter **Ablauf**:

- **Pre-Wait** – Wartezeit zwischen Auslösen (GO) und tatsächlichem Start.
- **Danach** – was nach diesem Cue automatisch passiert:
  - **Keine** – nichts; der nächste Cue braucht ein neues GO.
  - **Auto-Continue (AC)** – der **nächste Cue startet**, sobald dieser Cue **gestartet** ist –
    nach Ablauf von *Post-Wait*. So laufen Cues gleichzeitig oder versetzt.
  - **Auto-Follow (AF)** – der **nächste Cue startet**, wenn dieser Cue **zu Ende** ist – nach
    Ablauf von *Post-Wait*. So entstehen Abfolgen. Wird der Cue manuell gestoppt, folgt nichts.
- **Post-Wait** – Verzögerung für Auto-Continue/-Follow.

```
GO ─┬─ Pre-Wait ─┬──── Cue läuft ─────────┬─ Post-Wait ─▶ nächster Cue  (Auto-Follow)
    │            └─ Post-Wait ─▶ nächster Cue                           (Auto-Continue)
```

Beispiele:

- *Gewitter + Regen gleichzeitig:* Cue 5 „Donner“ mit **Auto-Continue**, Post-Wait 0 → Cue 6
  „Regen“ startet zeitgleich.
- *Regen setzt 2 s nach dem Donner ein:* wie oben, Post-Wait 2.
- *Playlist für den Einlass:* alle Titel auf **Auto-Follow**.
- *Musik ausblenden und dann Ansage:* Fade-Cue mit **Auto-Follow**, nächster Cue ist die Ansage.

**Verkettungen und Standby:** Nach einem GO springt der Standby automatisch **hinter** alle Cues,
die durch Auto-Continue/-Follow ohnehin ausgelöst werden. Das nächste GO trifft also den nächsten
„eigenständigen“ Cue.

---

## 6. Die Show fahren

1. Vor Beginn den **Schalter auf ▶ Show** stellen (Kopfleiste oder `Strg+E`). Damit sind Editor,
   Hinzufügen und Löschen gesperrt.
2. **Standby setzen:** Zeile antippen, oder mit **↑ / ↓**. Standardmäßig steht der Standby auf Cue 1. Das Gerät
   merkt sich den Standby je Show: Nach einem Neuladen, etwa nach einem Absturz, geht es am selben Cue weiter.
   Die GO-Taste zeigt unten an, welcher Cue als Nächstes kommt.
3. **GO** – großer grüner Knopf oder **Leertaste**. Eine kurze GO-Sperre (Standard 300 ms)
   verhindert versehentliches Doppel-Auslösen.
4. Laufende Cues erscheinen unter **Aktiv**. Dort einzeln pausieren (❚❚/▶) oder stoppen (■ – mit
   dem eingestellten Stop-alle-Fade).
   **Springen:** Bei Audio-Cues zum Ziel im Balken springen, an der Wellenform sieht man laute und leise
   Stellen. Das geht auch bei pausierten Cues, sie bleiben dann pausiert.
   - Im **Edit-Modus** genügt ein Klick bzw. Tipp auf die Stelle.
   - Im **Show-Modus** springt ein kurzer Tipp absichtlich *nicht*. Den Finger oder die Maus auf dem Balken
     **ziehen**: Ein blauer Strich mit Zeitangabe zeigt das Ziel, beim **Loslassen** wird gesprungen. Wer es sich
     anders überlegt, zieht nach oben oder unten vom Balken weg (Strich wird rot, „Abbrechen“) und lässt los.
   - Mit der Tastatur: Balken per Tab anwählen, dann **← / →** springt 5 Sekunden zurück bzw. vor.
   Bei einer Start/Ende-Trimmung umfasst der Balken nur den getrimmten Teil. Ein Sprung in den Fade-Out am Ende
   blendet von dort aus; ein Sprung davor stellt die volle Lautstärke wieder her.
5. **Notfall / Ende:**
   - **Stop alle** oder **Esc** – alle Cues mit dem eingestellten Fade (Standard 1,5 s) ausblenden.
   - **Zweimal Esc** (innerhalb einer Sekunde) oder **Shift+Esc** – sofort stoppen.
   - **Pause** / **Weiter** – alle laufenden Cues anhalten / fortsetzen (inkl. laufender Pre- und
     Post-Waits), mit dem eingestellten Pause-alle-Fade.
6. **Master** – Gesamtlautstärke (−∞ bis +6 dB). Die Pegelanzeige daneben zeigt, ob Ton rausgeht.

**Tipp:** Die App beim ersten Antippen „aufwecken“ – Browser erlauben Audio erst nach einer
Benutzeraktion. Ein Tipp irgendwo in die App genügt; ein GO zählt natürlich auch.

---

## 7. Cart-Ansicht

**▦ Cart** zeigt alle Cues als große Kacheln – ideal für Tablets/Handys und für Jingles,
Soundeffekte oder Einspieler, die in beliebiger Reihenfolge gebraucht werden.

- **Antippen** startet den Cue. **Erneut antippen** stoppt ihn. Ein pausierter Cue wird fortgesetzt.
- Die Kachel füllt sich von unten mit dem Fortschritt und zeigt Restzeit an.
- Im Edit-Modus öffnet **✎** oben rechts den Editor.
- Anzahl der Spalten in den Einstellungen (auf dem Handy immer 2).
- GO, Leertaste, Hotkeys und MIDI funktionieren auch in der Cart-Ansicht.

---

## 8. Tastatur- und MIDI-Trigger

Jeder Cue kann zusätzlich zur GO-Taste **direkt** ausgelöst werden:

- **Taste:** Im Editor bei *Taste* auf **Lernen** klicken und die gewünschte Taste drücken
  (z. B. `F2`, `A`, `1`). **✕** entfernt die Zuordnung. Leertaste, Pfeiltasten und F1 (Hilfe) sind reserviert.
  Mehrere Cues können dieselbe Taste haben – sie starten dann gemeinsam.
- **MIDI:** Bei *MIDI* auf **Lernen** klicken und am MIDI-Gerät eine Taste/einen Pad/Regler
  betätigen. Erkannt werden Note On, Control Change (Wert > 0) und Program Change.

Hotkeys funktionieren nicht, solange ein Dialog geöffnet ist oder in ein Textfeld getippt wird.

**Globale MIDI-Zuordnung:** In ⚙ Einstellungen → MIDI können **GO** und **Stop alle** auf
MIDI-Nachrichten gelegt werden – z. B. auf einen Fußschalter.

---

## 9. Shows verwalten, sichern und übertragen

Über **☰** öffnet sich die Show-Verwaltung:

- **Neue Show** – leere Show anlegen.
- **Öffnen** – zu einer anderen gespeicherten Show wechseln (laufende Cues werden gestoppt).
- **Löschen** – Show inkl. ihrer nicht anderweitig benutzten Audiodateien entfernen.
- **Aktuelle exportieren** – speichert die Show **inklusive aller Audiodateien** als eine Datei
  `Showname.cueshow` (landet im Download-Ordner).
- **Importieren…** – eine `.cueshow`-Datei laden. Sie wird als **neue** Show angelegt; bestehende
  Shows werden nie überschrieben.

**Show auf ein anderes Gerät bringen** (z. B. am PC vorbereiten, auf dem Tablet spielen):
Am PC exportieren → Datei per USB-Kabel, Cloud oder Messenger auf das Tablet → dort ☰ →
Importieren.

**Backup:** Shows liegen im Speicher des Browsers. Wird die App deinstalliert oder werden die
Website-Daten gelöscht, sind sie weg. Deshalb nach jeder Probe **exportieren**.

---

## 10. Einstellungen

| Einstellung | Bedeutung |
|---|---|
| GO-Sperre (ms) | Mindestabstand zwischen zwei GOs. 0 = aus. |
| Show-Modus: nachfragen | Vor dem Wechsel vom Show- in den Edit-Modus wird nachgefragt (Standard: an), damit der Show-Modus nicht versehentlich verlassen wird. |
| Stop-alle-Fade (s) | Ausblendzeit für „Stop alle“/Esc und die ■-Knöpfe im Aktiv-Bereich. |
| Pause-alle-Fade (s) | Aus-/Einblendzeit für „Pause“/„Weiter“, die ❚❚-Knöpfe im Aktiv-Bereich und das Fortsetzen in der Cart-Ansicht. 0 = sofort. |
| Cart-Spalten | Kacheln pro Zeile in der Cart-Ansicht. |
| Bildschirm nicht abschalten | Verhindert, dass das Display während der Show ausgeht. |
| Ausgabegerät | Soundkarte/Interface wählen (nur Chrome/Edge). |
| MIDI verwenden | Web MIDI aktivieren (der Browser fragt nach Erlaubnis). |
| GO / Stop alle per MIDI | Globale MIDI-Trigger. |
| Speicher | Belegung anzeigen, dauerhaften Speicher anfordern, unbenutzte Dateien löschen. |
| Info | Version (mit Hinweis, wenn auf GitHub eine neuere erschienen ist), Hilfe öffnen, Lizenz (GNU AGPL v3) und Link zum Quelltext. Hat der Betreiber der Instanz ein Impressum hinterlegt, steht hier auch der Link dazu. |

Die Einstellungen gelten **pro Show** und werden mit exportiert.

Beim Öffnen der Einstellungen fragt die App höchstens einmal am Tag bei GitHub nach der neuesten Version. Das ist
die einzige Verbindung nach außen; ohne Internet bleibt der Hinweis einfach weg.

---

## 11. Tastenkürzel

| Taste | Funktion |
|---|---|
| **Leertaste** | GO |
| **Esc** | Alle stoppen (mit Fade) |
| **Esc Esc** / **Shift+Esc** | Alle sofort stoppen |
| **↑ / ↓** | Standby verschieben |
| **← / →** | auf einem angewählten Balken im Aktiv-Bereich: 5 s zurück/vor springen; auf dem Rand des rechten Bereichs: Breite ändern |
| **Strg+E** | Edit-/Show-Modus umschalten |
| **F1** | Hilfe (dieses Handbuch) öffnen |
| *eigene Tasten* | Cue-Hotkeys (im Editor festgelegt) |

---

## 12. Checkliste vor der Vorstellung

- [ ] Show vollständig einmal durchgespielt – auf **dem Gerät, das in der Show benutzt wird**.
- [ ] Show **exportiert** (Backup auf USB-Stick o. ä.).
- [ ] Gerät am Netzteil, Benachrichtigungen aus (Flugmodus/Bitte nicht stören).
- [ ] Richtiges **Ausgabegerät** gewählt, Master-Lautstärke geprüft (Pegelanzeige schlägt beim Probe-GO aus, ohne rot zu werden).
- [ ] Schalter auf **▶ Show** (grün).
- [ ] Standby steht auf Cue 1.
- [ ] Einmal in die App getippt (Audio „aufgeweckt“).

---

## 13. Fehlerbehebung

| Problem | Lösung |
|---|---|
| Kein Ton beim ersten GO | Einmal in die App tippen/klicken (Autoplay-Sperre des Browsers). Lautstärke von System und Master prüfen. |
| Pegelanzeige bewegt sich, aber kein Ton | Die App spielt. Ausgabegerät (⚙), Systemlautstärke, Kabel/Bluetooth und Verstärker prüfen. |
| Keine Wellenform im Aktiv-Balken | Bei Dateien über 20 Minuten und manchen Videodateien gibt es keine Wellenform (zu viel Speicher bzw. nicht lesbar). Springen geht trotzdem. |
| Cue zeigt „Datei fehlt“ oder „!“ | Datei wurde gelöscht oder ist beschädigt → Editor → *Datei wählen…* |
| „Datei nicht abspielbar“ | Format wird vom Browser nicht unterstützt (z. B. manche WMA/AIFF). In MP3/WAV/OGG umwandeln. |
| Ton setzt aus / ruckelt auf Android | Akku-Optimierung für Chrome ausschalten; App im Vordergrund lassen; andere Apps schließen. |
| Fade-Cue meldet „Ziel-Cue läuft nicht“ | Ein Fade wirkt nur auf einen gerade **laufenden** Audio-Cue. |
| Ausgabegerät-Auswahl fehlt | Nur in Chrome/Edge verfügbar; sonst Systemeinstellung nutzen. |
| MIDI wird nicht erkannt | Chrome/Edge verwenden, Gerät vor dem Öffnen der App anschließen, in ⚙ MIDI aus- und wieder einschalten. |
| Shows sind weg | Website-Daten wurden gelöscht. Letzten Export importieren. In ⚙ „Dauerhaft: Anfordern“ nutzen. |
| „Update wartet … in einem anderen Tab geöffnet“ | Den Cue Player in allen anderen Tabs und Fenstern schließen, dann lädt die App von selbst weiter. |
| Neue Version wird nicht angezeigt | App komplett schließen und neu öffnen (Updates werden beim nächsten Start aktiv). |
