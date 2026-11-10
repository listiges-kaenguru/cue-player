// Werkzeug tools/cueshow.mjs: strenge Prüfung einer Show (check).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { newSession, newCue, SESSION_VERSION } from '../../js/model.js';
import { checkShow } from '../../tools/cueshow/check.mjs';

/** Gültige Show mit jedem Cue-Typ, so wie die App sie anlegt. */
function base() {
  const s = newSession('Prüfshow');
  const a1 = newCue('audio', { name: 'Musik', mediaId: 'm1', mediaName: 'musik', duration: 12.5, hotkey: 'KeyA' });
  const a2 = newCue('audio', { name: 'Donner', mediaId: 'm2', mediaName: 'donner', midiTrigger: '144:60' });
  s.cues = [
    a1,
    a2,
    newCue('fade', { target: a1.id }),
    newCue('startstop', { target: a2.id }),
    newCue('startstop', { mode: 'stop' }),
    newCue('pause'),
    newCue('midi'),
    newCue('memo', { name: 'Szene 2', notes: '## Hinweis\nLicht **aus**' }),
  ];
  const media = [
    { id: 'm1', name: 'musik.mp3', type: 'audio/mpeg' },
    { id: 'm2', name: 'donner.wav', type: 'audio/wav' },
  ];
  const blobs = new Map([['m1', new Blob([new Uint8Array(10)])], ['m2', new Blob([new Uint8Array(4)])]]);
  return { header: { format: 1, session: s, media }, blobs };
}

/** Prüft eine veränderte Show und liefert die Meldungen. */
function run(change) {
  const show = base();
  change(show.header.session, show);
  return checkShow(show);
}

function expectOne(list, stufe, ort, text) {
  const hit = list.filter((f) => f.stufe === stufe && ort.test(f.ort) && (!text || text.test(f.text)));
  assert.ok(hit.length >= 1, `${stufe} ${ort} ${text ?? ''} erwartet, gefunden:\n${JSON.stringify(list, null, 1)}`);
}
const err = (change, ort, text) => expectOne(run(change), 'fehler', ort, text);
const warn = (change, ort, text) => {
  const list = run(change);
  expectOne(list, 'warnung', ort, text);
  assert.deepEqual(list.filter((f) => f.stufe === 'fehler'), [], 'nur Warnung, kein Fehler');
};

describe('gültige Show', () => {
  it('hat keine Meldungen', () => {
    assert.deepEqual(checkShow(base()), []);
  });
  it('nennt Ort mit Cue-Nummer, gekürzter ID und Feld', () => {
    const sh = base();
    sh.header.session.cues[0].fadeIn = -1;
    const list = checkShow(sh);
    assert.equal(list.length, 1);
    const id = sh.header.session.cues[0].id;
    assert.equal(list[0].stufe, 'fehler');
    assert.match(list[0].ort, /^Cue 1 \(id [^)]+\) · fadeIn$/);
    assert.ok(list[0].ort.includes(id.slice(0, 8)) && !list[0].ort.includes(id.slice(0, 9)) || id.length <= 8);
  });
});

describe('Show und Medien', () => {
  it('prüft Version, Name und ID der Show', () => {
    err((s) => { s.version = SESSION_VERSION + 1; }, /^Show · version$/);
    err((s) => { s.version = '1'; }, /^Show · version$/);
    err((s) => { s.version = 0; }, /^Show · version$/);
    err((s) => { s.name = 5; }, /^Show · name$/);
    err((s) => { s.id = ''; }, /^Show · id$/);
  });
  it('erkennt doppelte und überlappende Medien', () => {
    err((s, sh) => { sh.header.media[1].id = 'm1'; }, /^media\[1\]$/, /doppelt/);
    err((s, sh) => {
      sh.header.media[0].offset = 0; sh.header.media[0].length = 10;
      sh.header.media[1].offset = 9; sh.header.media[1].length = 4;
    }, /^media\[1\]$/, /überlappt/);
  });
  it('meldet Medium ohne Cue und Audio-Cue ohne Medium', () => {
    warn((s, sh) => { sh.header.media.push({ id: 'm3', name: 'x.wav', type: 'audio/wav' }); sh.blobs.set('m3', new Blob([])); },
      /^media\[2\]$/, /keine Cue/);
    warn((s) => { s.cues[1].mediaId = null; }, /^Cue 2 .* · mediaId$/, /keine Datei/);
  });
  it('meldet Verweis auf fehlendes Medium als Fehler', () => {
    err((s) => { s.cues[0].mediaId = 'gibtsnicht'; }, /^Cue 1 .* · mediaId$/);
    err((s) => { s.cues[0].mediaId = 7; }, /^Cue 1 .* · mediaId$/);
  });
  it('warnt bei sehr großen Dateien', () => {
    warn((s, sh) => { sh.blobs.set('m1', { size: 2 * 1024 ** 3 }); }, /^media\[0\]$/, /groß/);
  });
});

describe('Cues: Aufbau', () => {
  it('verlangt eindeutige, nicht leere IDs', () => {
    err((s) => { s.cues[1].id = s.cues[0].id; }, /^Cue 2 .* · id$/, /doppelt/);
    err((s) => { s.cues[1].id = ''; }, /^Cue 2 .* · id$/);
    err((s) => { s.cues[1].id = 3; }, /^Cue 2 .* · id$/);
  });
  it('kennt nur die Cue-Typen der App, alte Typen als Warnung', () => {
    err((s) => { s.cues[6].type = 'video'; }, /^Cue 7 .* · type$/);
    warn((s) => { s.cues[4].type = 'stop'; delete s.cues[4].mode; }, /^Cue 5 .* · type$/, /Start\/Stop/);
  });
  it('verlangt Texte als Zeichenketten', () => {
    for (const f of ['name', 'notes', 'hotkey', 'midiTrigger', 'color']) err((s) => { s.cues[7][f] = 1; }, new RegExp(`^Cue 8 .* · ${f}$`));
    err((s) => { s.cues[0].mediaName = null; }, /^Cue 1 .* · mediaName$/);
  });
  it('lässt nur #rgb und #rrggbb als Farbe zu', () => {
    for (const c of ['red', 'url(https://x)', '#12', '#1234', '#ggg', 'expression(1)']) err((s) => { s.cues[0].color = c; }, /· color$/);
    assert.deepEqual(run((s) => { s.cues[0].color = '#a1B'; s.cues[1].color = '#00ff00'; }), []);
  });
});

describe('Cues: Zahlen', () => {
  it('verlangt endliche Zahlen ≥ 0 für Zeiten', () => {
    const fields = [[0, 'preWait'], [0, 'postWait'], [0, 'duration'], [0, 'start'], [0, 'end'], [0, 'fadeIn'], [0, 'fadeOut'],
      [2, 'duration'], [3, 'fade'], [5, 'fadeOut'], [5, 'fadeIn']];
    for (const [i, f] of fields) {
      for (const v of [-0.1, NaN, Infinity, '1', null]) err((s) => { s.cues[i][f] = v; }, new RegExp(`^Cue ${i + 1} .* · ${f}$`));
    }
    assert.deepEqual(run((s) => { s.cues[0].preWait = 0; s.cues[0].postWait = 3600; }), []);
  });
  it('verlangt Ende nach dem Start', () => {
    err((s) => { s.cues[0].start = 5; s.cues[0].end = 5; }, /^Cue 1 .* · end$/);
    err((s) => { s.cues[0].start = 5; s.cues[0].end = 4; }, /^Cue 1 .* · end$/);
    assert.deepEqual(run((s) => { s.cues[0].start = 5; s.cues[0].end = 0; }), []);
    assert.deepEqual(run((s) => { s.cues[0].start = 5; s.cues[0].end = 5.1; }), []);
  });
  it('prüft Lautstärke und Panorama', () => {
    err((s) => { s.cues[0].volume = NaN; }, /^Cue 1 .* · volume$/);
    err((s) => { s.cues[2].volume = '0'; }, /^Cue 3 .* · volume$/);
    warn((s) => { s.cues[0].volume = 12.5; }, /^Cue 1 .* · volume$/, /−60 … \+12/);
    warn((s) => { s.cues[0].volume = -61; }, /^Cue 1 .* · volume$/);
    assert.deepEqual(run((s) => { s.cues[0].volume = 12; s.cues[1].volume = -60; s.cues[0].pan = -1; s.cues[1].pan = 1; }), []);
    err((s) => { s.cues[0].pan = 1.01; }, /^Cue 1 .* · pan$/);
    err((s) => { s.cues[0].pan = -2; }, /^Cue 1 .* · pan$/);
  });
  it('prüft MIDI-Werte', () => {
    for (const [f, bad, ok] of [['channel', [0, 17, 1.5, '1'], [1, 16]], ['data1', [-1, 128, 0.5], [0, 127]], ['data2', [-1, 128], [0, 127]]]) {
      for (const v of bad) err((s) => { s.cues[6][f] = v; }, new RegExp(`^Cue 7 .* · ${f}$`));
      for (const v of ok) assert.deepEqual(run((s) => { s.cues[6][f] = v; }), [], `${f}=${v}`);
    }
  });
  it('warnt bei sehr langen Wartezeiten', () => {
    warn((s) => { s.cues[0].preWait = 3601; }, /^Cue 1 .* · preWait$/, /1 h/);
  });
});

describe('Cues: Auswahlwerte und Wahrheitswerte', () => {
  it('lässt nur die Werte des Editors zu', () => {
    err((s) => { s.cues[0].nextAction = 'auto'; }, /· nextAction$/);
    err((s) => { s.cues[0].fadeCurve = 'exp'; }, /^Cue 1 .* · fadeCurve$/);
    err((s) => { s.cues[2].fadeCurve = 'Linear'; }, /^Cue 3 .* · fadeCurve$/);
    err((s) => { s.cues[3].mode = 'pause'; }, /^Cue 4 .* · mode$/);
    err((s) => { s.cues[5].mode = 'stop'; }, /^Cue 6 .* · mode$/);
    err((s) => { s.cues[6].msg = 'sysex'; }, /^Cue 7 .* · msg$/);
    assert.deepEqual(run((s) => {
      s.cues[0].nextAction = 'follow'; s.cues[0].fadeCurve = 'linear'; s.cues[3].mode = 'start';
      s.cues[5].mode = 'resume'; s.cues[6].msg = 'pc';
    }), []);
  });
  it('verlangt Wahrheitswerte', () => {
    err((s) => { s.cues[0].loop = 'ja'; }, /^Cue 1 .* · loop$/);
    err((s) => { s.cues[2].stopAfter = 1; }, /^Cue 3 .* · stopAfter$/);
    err((s) => { s.cues[7].confirm = null; }, /^Cue 8 .* · confirm$/);
  });
});

describe('Cues: Ziele', () => {
  it('verlangt vorhandene Ziele, nicht sich selbst, bei Fade nur Audio', () => {
    err((s) => { s.cues[2].target = 'fehlt'; }, /^Cue 3 .* · target$/, /nicht gefunden/);
    err((s) => { s.cues[3].target = s.cues[3].id; }, /^Cue 4 .* · target$/, /selbst/);
    err((s) => { s.cues[2].target = s.cues[7].id; }, /^Cue 3 .* · target$/, /Audio/);
    err((s) => { s.cues[2].target = 5; }, /^Cue 3 .* · target$/);
    assert.deepEqual(run((s) => { s.cues[3].target = s.cues[7].id; s.cues[5].target = s.cues[0].id; }), []);
  });
  it('warnt bei fehlendem Ziel, wo es nichts bewirkt', () => {
    warn((s) => { s.cues[2].target = ''; }, /^Cue 3 .* · target$/);
    warn((s) => { s.cues[4].mode = 'start'; }, /^Cue 5 .* · target$/);
  });
});

describe('Cues: Versehen', () => {
  it('warnt bei unbekannten und fehlenden Feldern', () => {
    warn((s) => { s.cues[0].prewait = 2; }, /^Cue 1 .* · prewait$/, /unbekannt/);
    warn((s) => { delete s.cues[0].fadeOut; }, /^Cue 1 .* · fadeOut$/, /fehlt/);
  });
  it('warnt bei doppelten Tasten und MIDI-Triggern', () => {
    warn((s) => { s.cues[1].hotkey = 'KeyA'; }, /^Cue 2 .* · hotkey$/, /Cue 1/);
    warn((s) => { s.cues[0].midiTrigger = '144:60'; }, /^Cue 2 .* · midiTrigger$|^Cue 1 .* · midiTrigger$/, /Cue/);
    warn((s) => { s.settings.midi.go = '144:60'; }, /^Cue 2 .* · midiTrigger$/, /GO/);
  });
  it('warnt bei Auto-Continue und Auto-Follow am Ende der Liste', () => {
    warn((s) => { s.cues[7].nextAction = 'continue'; }, /^Cue 8 .* · nextAction$/, /letzte/);
    warn((s) => { s.cues[7].nextAction = 'follow'; }, /^Cue 8 .* · nextAction$/);
  });
  it('warnt, wenn Texte die Markierung von texts enthalten', () => {
    warn((s) => { s.cues[7].notes = 'x <!-- cue:abc --> y'; }, /^Cue 8 .* · notes$/, /texts/);
    warn((s) => { s.cues[7].name = '<!-- cue:abc -->'; }, /^Cue 8 .* · name$/);
  });
});

describe('Einstellungen', () => {
  it('prüft Typen und Bereiche', () => {
    const bad = [['layout', 'grid'], ['showMode', 'nein'], ['confirmEdit', 0], ['wakeLock', null], ['cartColumns', 0],
      ['cartColumns', 13], ['cartColumns', 2.5], ['goLockMs', -1], ['goLockMs', 5001], ['stopAllFade', 31], ['pauseAllFade', -1],
      ['masterDb', 7], ['masterDb', -61], ['masterDb', NaN], ['sinkId', 1], ['midi', 'x']];
    for (const [k, v] of bad) err((s) => { s.settings[k] = v; }, new RegExp(`^Einstellungen · ${k}$`));
    err((s) => { s.settings.midi.enabled = 'ja'; }, /^Einstellungen · midi\.enabled$/);
    err((s) => { s.settings.midi.go = 1; }, /^Einstellungen · midi\.go$/);
    assert.deepEqual(run((s) => {
      Object.assign(s.settings, { layout: 'cart', cartColumns: 12, goLockMs: 5000, stopAllFade: 30, pauseAllFade: 0, masterDb: 6 });
    }), []);
  });
  it('warnt bei unbekannten Einstellungen und erlaubt fehlende Einstellungen', () => {
    warn((s) => { s.settings.farbe = 'rot'; }, /^Einstellungen · farbe$/, /unbekannt/);
    assert.deepEqual(run((s) => { delete s.settings; }), []);
  });
});
