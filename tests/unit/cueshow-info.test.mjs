// Werkzeug tools/cueshow.mjs: Übersicht (info).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { newSession, newCue } from '../../js/model.js';
import { showInfo, formatInfo, formatBytes } from '../../tools/cueshow/info.mjs';

function show() {
  const s = newSession('Weihnachtsmärchen');
  s.cues = [
    newCue('audio', { mediaId: 'm1', hotkey: 'KeyA', nextAction: 'follow' }),
    newCue('audio', { mediaId: 'm2', midiTrigger: '144:1' }),
    newCue('audio', { mediaId: 'm1', nextAction: 'continue' }),
    newCue('fade'),
    newCue('memo'),
  ];
  return {
    kind: 'file',
    fileSize: 5_000_123,
    headerSize: 1834,
    header: {
      format: 1,
      session: s,
      media: [{ id: 'm1', name: 'Ouvertüre.mp3', type: 'audio/mpeg' }, { id: 'm2', name: 'Donner.wav', type: 'audio/wav' }],
    },
    blobs: new Map([['m1', { size: 4_800_000 }], ['m2', { size: 12_100 }]]),
  };
}

describe('showInfo', () => {
  it('zählt Cues, Abläufe, Trigger und Medien', () => {
    const i = showInfo(show(), [{ stufe: 'fehler' }, { stufe: 'warnung' }, { stufe: 'warnung' }]);
    assert.equal(i.name, 'Weihnachtsmärchen');
    assert.equal(i.format, 1);
    assert.equal(i.version, 1);
    assert.equal(i.fileSize, 5_000_123);
    assert.equal(i.headerSize, 1834);
    assert.deepEqual(i.cues, { total: 5, byType: { audio: 3, fade: 1, memo: 1 } });
    assert.deepEqual(i.flow, { continue: 1, follow: 1, hotkeys: 1, midi: 1 });
    assert.deepEqual(i.media, [
      { name: 'Ouvertüre.mp3', type: 'audio/mpeg', size: 4_800_000, cues: [1, 3] },
      { name: 'Donner.wav', type: 'audio/wav', size: 12_100, cues: [2] },
    ]);
    assert.equal(i.mediaBytes, 4_812_100);
    assert.deepEqual(i.check, { fehler: 1, warnungen: 2 });
  });

  it('kommt mit einer leeren Show und einem Ordner zurecht', () => {
    const s = show();
    s.kind = 'folder';
    delete s.fileSize;
    delete s.headerSize;
    s.header.session.cues = [];
    s.header.media = [];
    const i = showInfo(s, []);
    assert.deepEqual(i.cues, { total: 0, byType: {} });
    assert.equal(i.fileSize, null);
    assert.equal(i.mediaBytes, 0);
    assert.doesNotThrow(() => formatInfo(i));
  });
});

describe('formatInfo', () => {
  it('gibt eine lesbare Übersicht auf Deutsch aus', () => {
    const t = formatInfo(showInfo(show(), []));
    assert.match(t, /^Show\s+Weihnachtsmärchen$/m);
    assert.match(t, /^Größe\s+4,8 MB \(Header 1,8 kB\)$/m);
    assert.match(t, /^Cues\s+5: Audio 3, Fade 1, Memo 1$/m);
    assert.match(t, /^Ablauf\s+Auto-Continue 1, Auto-Follow 1, Trigger: 1 Tasten, 1 MIDI$/m);
    assert.match(t, /^Medien\s+2 Dateien, 4,6 MB$/m);
    assert.match(t, /Ouvertüre\.mp3\s+audio\/mpeg\s+4,6 MB\s+Cue 1, 3/);
    assert.match(t, /^Prüfung\s+0 Fehler, 0 Warnungen/m);
  });
});

describe('formatBytes', () => {
  it('rechnet mit 1024 und einer Nachkommastelle', () => {
    assert.equal(formatBytes(0), '0 B');
    assert.equal(formatBytes(1023), '1023 B');
    assert.equal(formatBytes(1024), '1 kB');
    assert.equal(formatBytes(1536), '1,5 kB');
    assert.equal(formatBytes(1024 ** 2 * 148.25), '148,3 MB');
    assert.equal(formatBytes(1024 ** 3 * 2), '2 GB');
  });
});
