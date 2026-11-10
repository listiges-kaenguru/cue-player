// Werkzeug tools/cueshow.mjs: Dateinamen beim Entpacken bereinigen, MIME-Typ und Endung.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { safeFileName, mediaFileNames, extForType, typeForFile } from '../../tools/cueshow/names.mjs';

describe('safeFileName', () => {
  it('lässt normale Namen unverändert, auch mit Umlauten und Emoji', () => {
    assert.equal(safeFileName('Ouvertüre.mp3', 'audio/mpeg', 0), 'Ouvertüre.mp3');
    assert.equal(safeFileName('Applaus 🎉.wav', 'audio/wav', 0), 'Applaus 🎉.wav');
    assert.equal(safeFileName('Szene 1 – Wald.ogg', 'audio/ogg', 0), 'Szene 1 – Wald.ogg');
  });

  it('normalisiert Unicode nach NFC', () => {
    assert.equal(safeFileName('Ouvertu\u0308re.mp3', 'audio/mpeg', 0), 'Ouvert\u00fcre.mp3');
    assert.equal(safeFileName('U\u0308ber.mp3', 'audio/mpeg', 0), 'Über.mp3');
  });

  it('nimmt nur den letzten Pfadteil', () => {
    assert.equal(safeFileName('../../etc/passwd', '', 0), 'passwd.bin');
    assert.equal(safeFileName('/etc/x.mp3', 'audio/mpeg', 0), 'x.mp3');
    assert.equal(safeFileName('C:\\Musik\\a.wav', 'audio/wav', 0), 'a.wav');
    assert.equal(safeFileName('a/b\\c.ogg', 'audio/ogg', 0), 'c.ogg');
  });

  it('ersetzt Steuer- und Sonderzeichen', () => {
    assert.equal(safeFileName('a<b>c:d"e|f?g*h.mp3', 'audio/mpeg', 0), 'a_b_c_d_e_f_g_h.mp3');
    assert.equal(safeFileName('zeile\nzwei\t\x00.mp3', 'audio/mpeg', 0), 'zeile_zwei__.mp3');
    assert.equal(safeFileName('del\x7f.mp3', 'audio/mpeg', 0), 'del_.mp3');
  });

  it('entfernt Punkte und Leerzeichen am Anfang und Ende', () => {
    assert.equal(safeFileName('.versteckt.mp3', 'audio/mpeg', 0), 'versteckt.mp3');
    assert.equal(safeFileName('  name.wav. . ', 'audio/wav', 0), 'name.wav');
  });

  it('schützt für Windows reservierte Namen', () => {
    assert.equal(safeFileName('CON.mp3', 'audio/mpeg', 0), '_CON.mp3');
    assert.equal(safeFileName('nul', 'audio/wav', 0), '_nul.wav');
    assert.equal(safeFileName('Com1.tar.wav', 'audio/wav', 0), '_Com1.tar.wav');
    assert.equal(safeFileName('lpt9.ogg', 'audio/ogg', 0), '_lpt9.ogg');
    assert.equal(safeFileName('console.mp3', 'audio/mpeg', 0), 'console.mp3');
    assert.equal(safeFileName('COM0.mp3', 'audio/mpeg', 0), 'COM0.mp3');
  });

  it('ergänzt die Endung aus dem MIME-Typ, wenn keine da ist', () => {
    assert.equal(safeFileName('Donner', 'audio/wav', 0), 'Donner.wav');
    assert.equal(safeFileName('Donner', 'audio/x-unbekannt', 0), 'Donner.bin');
    assert.equal(safeFileName('Donner', '', 0), 'Donner.bin');
  });

  it('kürzt auf 120 Zeichen und behält die Endung', () => {
    const n = safeFileName('x'.repeat(300) + '.flac', 'audio/flac', 0);
    assert.equal([...n].length, 120);
    assert.ok(n.endsWith('.flac'));
    const e = safeFileName('🎵'.repeat(200) + '.mp3', 'audio/mpeg', 0);
    assert.equal([...e].length, 120);
    assert.ok(e.endsWith('.mp3'));
    assert.ok(!/[\ud800-\udbff](?![\udc00-\udfff])/.test(e), 'keine halben Ersatzzeichen');
  });

  it('nimmt für leere und unbrauchbare Namen medium-<n>', () => {
    assert.equal(safeFileName('', 'audio/mpeg', 0), 'medium-1.mp3');
    assert.equal(safeFileName('   ', 'audio/wav', 2), 'medium-3.wav');
    assert.equal(safeFileName('..', 'audio/ogg', 4), 'medium-5.ogg');
    assert.equal(safeFileName('../', '', 0), 'medium-1.bin');
    assert.equal(safeFileName(undefined, 'audio/mpeg', 1), 'medium-2.mp3');
    assert.equal(safeFileName(42, 'audio/mpeg', 1), 'medium-2.mp3');
    assert.equal(safeFileName('.mp3', 'audio/mpeg', 0), 'mp3.mp3');
  });
});

describe('mediaFileNames', () => {
  it('nummeriert Dubletten ohne Rücksicht auf Groß-/Kleinschreibung', () => {
    const names = mediaFileNames([
      { name: 'Donner.wav', type: 'audio/wav' },
      { name: 'donner.WAV', type: 'audio/wav' },
      { name: 'Donner.wav', type: 'audio/wav' },
      { name: 'Donner-2.wav', type: 'audio/wav' },
      { name: 'Regen.wav', type: 'audio/wav' },
    ]);
    assert.deepEqual(names, ['Donner.wav', 'donner-2.WAV', 'Donner-3.wav', 'Donner-2-2.wav', 'Regen.wav']);
    assert.equal(new Set(names.map((n) => n.toLowerCase())).size, names.length);
  });

  it('nummeriert auch nach dem Bereinigen gleiche Namen', () => {
    assert.deepEqual(mediaFileNames([
      { name: 'a/x.mp3', type: 'audio/mpeg' },
      { name: 'b/x.mp3', type: 'audio/mpeg' },
      { name: '', type: 'audio/mpeg' },
      { name: '', type: 'audio/mpeg' },
    ]), ['x.mp3', 'x-2.mp3', 'medium-3.mp3', 'medium-4.mp3']);
  });

  it('liefert für eine leere Liste eine leere Liste', () => {
    assert.deepEqual(mediaFileNames([]), []);
  });
});

describe('MIME-Typ und Endung', () => {
  it('kennt die üblichen Audioformate in beide Richtungen', () => {
    assert.equal(extForType('audio/mpeg'), '.mp3');
    assert.equal(extForType('AUDIO/WAV'), '.wav');
    assert.equal(extForType('audio/x-wav'), '.wav');
    assert.equal(extForType('audio/ogg; codecs=opus'), '.ogg');
    assert.equal(extForType('audio/mp4'), '.m4a');
    assert.equal(extForType('foo/bar'), '.bin');
    assert.equal(extForType(null), '.bin');
    assert.equal(typeForFile('media/a.MP3'), 'audio/mpeg');
    assert.equal(typeForFile('a.wav'), 'audio/wav');
    assert.equal(typeForFile('a.flac'), 'audio/flac');
    assert.equal(typeForFile('a.m4a'), 'audio/mp4');
    assert.equal(typeForFile('a.xyz'), '');
    assert.equal(typeForFile('ohne'), '');
  });
});
