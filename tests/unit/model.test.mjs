// Datenmodell (model.js): neue Sessions und Cues, Presets, Migration älterer Daten, Anzeigenamen.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as M from '../../js/model.js';

describe('Neue Session und neue Cues', () => {
  it('legt eine Session mit Standardeinstellungen an', () => {
    const s = M.newSession();
    assert.equal(s.version, M.SESSION_VERSION);
    assert.equal(s.name, 'Neue Show');
    assert.deepEqual(s.cues, []);
    assert.equal(s.settings.layout, 'list');
    assert.equal(s.settings.goLockMs, 300);
    assert.deepEqual(s.settings.midi, { enabled: false, go: '', stopAll: '' });
    assert.notEqual(M.newSession().id, s.id);
    assert.notStrictEqual(M.newSession().settings, s.settings, 'jede Session hat eigene Einstellungen');
  });
  it('gibt jedem Cue-Typ seine Standardwerte', () => {
    for (const t of Object.keys(M.CUE_TYPES)) {
      const c = M.newCue(t);
      assert.equal(c.type, t);
      assert.equal(c.nextAction, 'none');
      assert.equal(c.preWait, 0);
    }
    assert.equal(M.newCue('audio').fadeCurve, 'log');
    assert.equal(M.newCue('fade').volume, -60);
    assert.equal(M.newCue('midi').data1, 60);
    assert.equal(M.newCue('memo').confirm, false);
  });
  it('übernimmt Zusatzwerte und überschreibt Standards', () => {
    const c = M.newCue('fade', { volume: -15, name: 'leiser' });
    assert.equal(c.volume, -15);
    assert.equal(c.name, 'leiser');
    assert.equal(c.duration, 3);
  });
  it('legt bei unbekanntem Typ nur die gemeinsamen Felder an', () => {
    const c = M.newCue('gibt-es-nicht');
    assert.equal(c.type, 'gibt-es-nicht');
    assert.equal(c.name, '');
    assert.equal('volume' in c, false);
  });
});

describe('Vorlagen (Presets, Kopieren)', () => {
  const zweiCues = () => {
    const a = M.newCue('audio', { name: 'Musik', hotkey: 'KeyM', midiTrigger: '90 3c' });
    const f = M.newCue('fade', { target: a.id });
    return [a, f];
  };
  it('entfernt ID und Trigger und macht interne Ziele zu Platzhaltern', () => {
    const t = M.cuesToTemplates(zweiCues());
    assert.equal('id' in t[0] || 'hotkey' in t[0] || 'midiTrigger' in t[0], false);
    assert.equal(t[1].target, '#0');
  });
  it('leert externe Ziele, außer beim Klonen', () => {
    const f = M.newCue('fade', { target: 'fremd' });
    assert.equal(M.cuesToTemplates([f])[0].target, '');
    assert.equal(M.cuesToTemplates([f], { keepExternal: true })[0].target, 'fremd');
    assert.equal(M.cuesToTemplates([M.newCue('fade')])[0].target, '');
  });
  it('kopiert tief (Änderungen an der Vorlage ändern das Original nicht)', () => {
    const a = M.newCue('memo', { extra: { tief: 1 } });
    M.cuesToTemplates([a])[0].extra.tief = 2;
    assert.equal(a.extra.tief, 1);
  });
  it('setzt Platzhalter beim Einfügen auf die neuen Cues', () => {
    const neu = M.instantiateCues(M.cuesToTemplates(zweiCues()));
    assert.equal(neu[1].target, neu[0].id);
    assert.equal(neu[0].name, 'Musik');
    assert.notEqual(neu[0].id, neu[1].id);
  });
  it('zeigt leere Fade- und Start-Ziele auf den vorherigen Cue, Stop-Ziele nicht', () => {
    const [fade, start, stop, pause] = M.instantiateCues([
      { type: 'fade', target: '' }, { type: 'startstop', mode: 'start', target: '' },
      { type: 'startstop', mode: 'stop', target: '' }, { type: 'pause', target: '' },
    ], 'vorher');
    assert.equal(fade.target, 'vorher');
    assert.equal(start.target, 'vorher');
    assert.equal(stop.target, '');
    assert.equal(pause.target, '');
    assert.equal(M.instantiateCues([{ type: 'fade', target: '' }])[0].target, '');
  });
  it('macht ungültige Platzhalter zu leeren Zielen', () => {
    const [c] = M.instantiateCues([{ type: 'fade', target: '#5' }]);
    assert.equal(c.target, '');
    const [d] = M.instantiateCues([{ type: 'fade', target: '#abc' }]);
    assert.equal(d.target, '');
  });
  it('baut ein Preset mit Name und Zeitpunkt', () => {
    const p = M.cueToPreset(M.newCue('pause'), 'Pause');
    assert.equal(p.name, 'Pause');
    assert.equal(p.cues.length, 1);
    assert.equal(typeof p.created, 'number');
  });
  it('liefert fünf Standard-Presets mit eindeutigen Namen', () => {
    const d = M.defaultPresets();
    assert.equal(d.length, 5);
    assert.equal(new Set(d.map((p) => p.name)).size, 5);
    assert.equal(d[4].cues.length, 2);
  });
});

describe('Migration älterer Daten', () => {
  it('wandelt Start- und Stop-Cues aus v0.2 in Start/Stop um', () => {
    assert.deepEqual(M.migrateCue({ type: 'start', target: 'a' }), { type: 'startstop', mode: 'start', target: 'a', fade: 0 });
    assert.deepEqual(M.migrateCue({ type: 'stop', fade: 2 }), { type: 'startstop', mode: 'stop', fade: 2 });
    const c = { type: 'audio' };
    assert.strictEqual(M.migrateCue(c), c);
  });
  it('bringt Presets mit einem Cue auf das Mehr-Cue-Format', () => {
    const p = M.migratePreset({ name: 'alt', cue: { type: 'stop' } });
    assert.equal('cue' in p, false);
    assert.equal(p.cues[0].type, 'startstop');
    assert.deepEqual(M.migratePreset({ name: 'leer' }).cues, []);
    assert.equal(M.migratePreset({ cues: [{ type: 'memo' }], cue: { type: 'audio' } }).cues[0].type, 'memo');
  });
  it('ergänzt fehlende Einstellungen und Cue-Felder', () => {
    const s = M.normalizeSession({ name: 'alt', settings: { layout: 'cart', midi: { go: '90 3c' } }, cues: [{ type: 'start', id: 'x' }] });
    assert.equal(s.settings.layout, 'cart');
    assert.equal(s.settings.goLockMs, 300);
    assert.deepEqual(s.settings.midi, { enabled: false, go: '90 3c', stopAll: '' });
    assert.equal(s.cues[0].type, 'startstop');
    assert.equal(s.cues[0].id, 'x');
    assert.equal(s.cues[0].nextAction, 'none');
  });
  it('übernimmt nur Farben als #rgb oder #rrggbb (keine CSS-Ausdrücke aus fremden Dateien)', () => {
    const farben = ['#b62324', '#ABC', '', 'url(https://evil.example/x)', 'red;background:url(//x)', '#12345', '#1234567',
      'var(--x)', 'red', 42, null, { r: 1 }, '#b62324 url(x)'];
    const s = M.normalizeSession({ cues: farben.map((color) => ({ type: 'memo', color })) });
    assert.deepEqual(s.cues.map((c) => c.color), ['#b62324', '#ABC', '', '', '', '', '', '', '', '', '', '', '']);
  });
  it('kommt ohne Einstellungen und Cues aus', () => {
    const s = M.normalizeSession({});
    assert.deepEqual(s.cues, []);
    assert.equal(s.settings.cartColumns, 4);
  });
  it('verschmutzt keine Prototypen (__proto__ aus einer fremden Datei)', () => {
    const fremd = JSON.parse('{"settings":{"__proto__":{"boese":1},"midi":{"__proto__":{"boese":2}}},"cues":[{"type":"memo","__proto__":{"boese":3}}]}');
    const s = M.normalizeSession(fremd);
    assert.equal({}.boese, undefined);
    assert.equal(Object.prototype.boese, undefined);
    assert.equal(s.cues[0].type, 'memo');
  });
});

describe('Anzeigenamen', () => {
  const show = () => {
    const s = M.newSession();
    const a = M.newCue('audio', { mediaName: 'intro.wav' });
    s.cues.push(a);
    return { s, a };
  };
  it('nimmt den eigenen Namen, sonst einen beschreibenden', () => {
    const { s, a } = show();
    assert.equal(M.cueDisplayName(s, M.newCue('audio', { name: 'Eigen' })), 'Eigen');
    assert.equal(M.cueDisplayName(s, a), 'intro.wav');
    assert.equal(M.cueDisplayName(s, M.newCue('audio')), 'Audio (keine Datei)');
    assert.equal(M.cueDisplayName(s, M.newCue('fade', { target: a.id, volume: -10 })), 'Fade #1 → -10 dB');
    assert.equal(M.cueDisplayName(s, M.newCue('fade', { volume: -60 })), 'Fade ? → −∞');
    assert.equal(M.cueDisplayName(s, M.newCue('startstop', { mode: 'stop' })), 'Stop alle');
    assert.equal(M.cueDisplayName(s, M.newCue('startstop', { mode: 'start' })), 'Start ?');
    assert.equal(M.cueDisplayName(s, M.newCue('startstop', { target: a.id })), 'Start/Stop #1');
    assert.equal(M.cueDisplayName(s, M.newCue('pause', { mode: 'resume' })), 'Weiter alle');
    assert.equal(M.cueDisplayName(s, M.newCue('midi', { msg: 'cc', data1: 7 })), 'MIDI cc 7');
    assert.equal(M.cueDisplayName(s, M.newCue('memo', { notes: '# Umbau\nmehr' })), 'Umbau');
    assert.equal(M.cueDisplayName(s, M.newCue('memo')), 'Memo');
  });
  it('stürzt bei unbekanntem Typ oder Modus nicht ab', () => {
    const { s } = show();
    assert.equal(M.cueDisplayName(s, { type: 'raetsel' }), 'raetsel');
    assert.doesNotThrow(() => M.cueDisplayName(s, { type: 'startstop', mode: 'quatsch' }));
    assert.doesNotThrow(() => M.cueDisplayName(s, { type: 'pause', mode: null }));
  });
});

// Nachgeschärft nach Mutation Testing: Standardwerte festhalten, Ziele beim Einfügen, Farbprüfung
describe('Standardwerte', () => {
  it('Cue-Typen und Folgeaktionen', () => {
    assert.deepEqual(M.CUE_TYPES, {
      audio: { label: 'Audio', icon: '♪' }, fade: { label: 'Fade', icon: '◢' }, startstop: { label: 'Start / Stop', icon: '▶■' },
      pause: { label: 'Pause', icon: '❚❚' }, midi: { label: 'MIDI', icon: '⎍' }, memo: { label: 'Memo', icon: '✎' },
    });
    assert.deepEqual(M.NEXT_ACTIONS, { none: 'Keine', continue: 'Auto-Continue', follow: 'Auto-Follow' });
  });
  it('Einstellungen einer neuen Show', () => {
    const { id, updated, ...rest } = M.newSession('X');
    assert.deepEqual(rest, {
      version: 1, name: 'X', cues: [],
      settings: { layout: 'list', showMode: false, confirmEdit: true, cartColumns: 4, goLockMs: 300, stopAllFade: 1.5,
        pauseAllFade: 0, masterDb: 0, midi: { enabled: false, go: '', stopAll: '' }, wakeLock: true, sinkId: '' },
    });
  });
  it('Felder je Cue-Typ', () => {
    const ohneId = (c) => { const { id, ...r } = c; return r; };
    const gemeinsam = { name: '', color: '', preWait: 0, postWait: 0, nextAction: 'none', hotkey: '', midiTrigger: '', notes: '' };
    assert.deepEqual(ohneId(M.newCue('audio')), { type: 'audio', ...gemeinsam, mediaId: null, mediaName: '', duration: 0, volume: 0, pan: 0, start: 0, end: 0, fadeIn: 0, fadeOut: 0, fadeCurve: 'log', loop: false });
    assert.deepEqual(ohneId(M.newCue('fade')), { type: 'fade', ...gemeinsam, target: '', volume: -60, duration: 3, fadeCurve: 'log', stopAfter: true });
    assert.deepEqual(ohneId(M.newCue('startstop')), { type: 'startstop', ...gemeinsam, target: '', mode: 'toggle', fade: 0 });
    assert.deepEqual(ohneId(M.newCue('pause')), { type: 'pause', ...gemeinsam, target: '', mode: 'toggle', fadeOut: 0, fadeIn: 0 });
    assert.deepEqual(ohneId(M.newCue('midi')), { type: 'midi', ...gemeinsam, output: '', msg: 'noteon', channel: 1, data1: 60, data2: 127 });
    assert.deepEqual(ohneId(M.newCue('memo')), { type: 'memo', ...gemeinsam, confirm: false });
  });
  it('Inhalt der Standard-Presets', () => {
    const kurz = M.defaultPresets().map((p) => [p.name, p.cues.map((c) => {
      const { name, color, preWait, postWait, nextAction, notes, ...r } = c;
      return { ...r, ...(name && { name }), ...(notes && { notes }) };
    })]);
    assert.deepEqual(kurz, [
      ['Ausblenden 3 s + Stop', [{ type: 'fade', target: '', volume: -60, duration: 3, fadeCurve: 'log', stopAfter: true }]],
      ['Musik unter Text (−15 dB, 3 s)', [{ type: 'fade', target: '', volume: -15, duration: 3, fadeCurve: 'log', stopAfter: false }]],
      ['Pause/Weiter mit Fade 2 s', [{ type: 'pause', target: '', mode: 'toggle', fadeOut: 2, fadeIn: 2 }]],
      ['Alles ausblenden 5 s', [{ type: 'startstop', target: '', mode: 'stop', fade: 5 }]],
      ['Szenenwechsel: alles ausblenden + Umbau (bestätigen)', [
        { type: 'startstop', target: '', mode: 'stop', fade: 3 },
        { type: 'memo', confirm: true, name: 'Umbau', notes: '! Erst GO nach Freigabe durch die Bühne' }]],
    ]);
  });
});

describe('Ziele und Farben: Randfälle', () => {
  it('legt bei Cues ohne Ziel kein Ziel an', () => {
    assert.equal('target' in M.cuesToTemplates([M.newCue('memo')])[0], false);
    assert.equal('target' in M.instantiateCues([{ type: 'memo' }], 'vorher')[0], false);
  });
  it('lässt externe und nicht-textuelle Ziele beim Einfügen stehen', () => {
    const [a, b] = M.instantiateCues([{ type: 'fade', target: 'fremd' }, { type: 'startstop', mode: 'stop', target: 7 }], 'vorher');
    assert.equal(a.target, 'fremd');
    assert.equal(b.target, 7);
  });
  it('lehnt Farben mit Text davor ab', () => {
    const s = M.normalizeSession({ cues: [{ type: 'memo', color: 'x#abc' }, { type: 'memo', color: 'url(x)#abcdef' }] });
    assert.deepEqual(s.cues.map((c) => c.color), ['', '']);
  });
  it('benennt Pause-Cues nach Modus', () => {
    const s = M.newSession();
    assert.equal(M.cueDisplayName(s, M.newCue('pause')), 'Pause/Weiter alle');
    assert.equal(M.cueDisplayName(s, M.newCue('pause', { mode: 'pause' })), 'Pause alle');
    assert.equal(M.cueDisplayName(s, M.newCue('startstop', { mode: 'toggle' })), 'Start/Stop alle');
  });
});

describe('Backup-Hinweis: Fingerabdruck und Exportstand', () => {
  const show = () => {
    const s = M.newSession('Probe');
    s.cues = [M.newCue('audio'), M.newCue('memo')];
    return s;
  };
  it('gleicher Inhalt → gleicher Fingerabdruck, auch nach JSON-Rundreise', () => {
    const s = show();
    const fp = M.sessionFingerprint(s);
    assert.equal(typeof fp, 'string');
    assert.ok(fp.length > 0);
    assert.equal(M.sessionFingerprint(JSON.parse(JSON.stringify(s))), fp);
  });
  it('ignoriert Speicherzeit, ermittelte Dauer und Reihenfolge der Schlüssel', () => {
    const s = show();
    const fp = M.sessionFingerprint(s);
    s.updated += 5000;
    s.cues[0].duration = 12.5;
    assert.equal(M.sessionFingerprint(s), fp);
    const umsortiert = Object.fromEntries(Object.entries(s).reverse());
    assert.equal(M.sessionFingerprint(umsortiert), fp);
  });
  it('ändert sich bei Name, Cue-Feld, Einstellung, Reihenfolge, neuem oder gelöschtem Cue', () => {
    // Feste IDs: newSession/newCue vergeben sonst bei jedem Aufruf neue, und alles wäre „verschieden“
    const fp = (f) => { const s = show(); s.id = 'show'; s.cues[0].id = 'a'; s.cues[1].id = 'b'; f(s); return M.sessionFingerprint(s); };
    const basis = fp(() => {});
    assert.equal(fp(() => {}), basis);
    assert.notEqual(fp((s) => { s.name = 'Probe 2'; }), basis);
    assert.notEqual(fp((s) => { s.cues[0].name = 'Intro'; }), basis);
    assert.notEqual(fp((s) => { s.cues[1].text = 'Notiz'; }), basis);
    assert.notEqual(fp((s) => { s.settings.goLockMs = 0; }), basis);
    assert.notEqual(fp((s) => { s.cues.reverse(); }), basis);
    assert.notEqual(fp((s) => { s.cues.push(M.newCue('stop')); }), basis);
    assert.notEqual(fp((s) => { s.cues.pop(); }), basis);
    assert.notEqual(fp((s) => { s.cues[0].volume = -3; }), basis);
  });
  it('fehlende Cues wie leere Liste, Felder mit undefined wie fehlende', () => {
    const s = M.newSession();
    const leer = M.sessionFingerprint(s);
    assert.equal(M.sessionFingerprint({ ...s, cues: undefined }), leer);
    const { cues, ...ohne } = s;
    assert.equal(M.sessionFingerprint(ohne), leer);
    assert.equal(M.sessionFingerprint({ ...s, extra: undefined }), leer);
    const c = show();
    const mitCues = M.sessionFingerprint(c);
    c.cues[0].notiz = undefined;
    assert.equal(M.sessionFingerprint(c), mitCues);
  });
  it('unterscheidet Typen und Sonderzeichen', () => {
    const s = show();
    s.id = 'show';
    s.name = '1';
    const a = M.sessionFingerprint(s);
    s.name = 1;
    assert.notEqual(M.sessionFingerprint(s), a);
    s.name = 'Ünïcödé 🎭 "\\';
    const b = M.sessionFingerprint(s);
    s.name = 'Ünïcödé 🎭 "/';
    assert.notEqual(M.sessionFingerprint(s), b);
  });
  it('Show ohne Cues braucht kein Backup', () => {
    const s = M.newSession();
    assert.equal(M.needsBackup(s, undefined), false);
    assert.equal(M.needsBackup({ ...s, cues: undefined }, undefined), false);
  });
  it('Show mit Cues: Backup nötig, solange der Exportstand fehlt oder abweicht', () => {
    const s = show();
    assert.equal(M.needsBackup(s, undefined), true);
    assert.equal(M.needsBackup(s, null), true);
    assert.equal(M.needsBackup(s, ''), true);
    assert.equal(M.needsBackup(s, 42), true);
    assert.equal(M.needsBackup(s, { fp: 'x' }), true);
    assert.equal(M.needsBackup(s, 'anderer-stand'), true);
    assert.equal(M.needsBackup(s, M.sessionFingerprint(s)), false);
    s.cues[0].name = 'geändert';
    assert.equal(M.needsBackup(s, M.sessionFingerprint(show())), true);
  });
});
