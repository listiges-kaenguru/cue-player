// Ausgabegerät wach halten (keepalive.js): Einstellungen prüfen, Pulse planen, Signal erzeugen.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as K from '../../js/keepalive.js';

describe('Einstellungen normalisieren', () => {
  it('liefert ohne Eingabe die Standardwerte (aus, 50 Hz, 5 min, 5 s, −26 dB)', () => {
    const d = { enabled: false, signal: 'tone', intervalMin: 5, durationS: 5, levelDb: -26 };
    assert.deepEqual(K.normalizeKeepAlive(), d);
    assert.deepEqual(K.normalizeKeepAlive(null), d);
    assert.deepEqual(K.normalizeKeepAlive('quatsch'), d);
    assert.deepEqual(K.KEEPALIVE_DEFAULTS, d);
  });
  it('übernimmt gültige Werte', () => {
    assert.deepEqual(K.normalizeKeepAlive({ enabled: true, signal: 'noise', intervalMin: 12, durationS: 3, levelDb: -40 }),
      { enabled: true, signal: 'noise', intervalMin: 12, durationS: 3, levelDb: -40 });
    assert.equal(K.normalizeKeepAlive({ signal: 'silence' }).signal, 'silence');
  });
  it('setzt Werte außerhalb auf die Grenzen', () => {
    const lo = K.normalizeKeepAlive({ intervalMin: 0, durationS: 0.2, levelDb: -90 });
    assert.deepEqual([lo.intervalMin, lo.durationS, lo.levelDb], [1, 1, -60]);
    const hi = K.normalizeKeepAlive({ intervalMin: 61, durationS: 11, levelDb: 0 });
    assert.deepEqual([hi.intervalMin, hi.durationS, hi.levelDb], [60, 10, -20]);
    const edge = K.normalizeKeepAlive({ intervalMin: 1, durationS: 10, levelDb: -20 });
    assert.deepEqual([edge.intervalMin, edge.durationS, edge.levelDb], [1, 10, -20]);
  });
  it('rundet das Intervall auf ganze Minuten und nimmt Zahlen als Text an', () => {
    assert.equal(K.normalizeKeepAlive({ intervalMin: 7.6 }).intervalMin, 8);
    assert.equal(K.normalizeKeepAlive({ intervalMin: '15' }).intervalMin, 15);
    assert.equal(K.normalizeKeepAlive({ levelDb: '-30' }).levelDb, -30);
  });
  it('ersetzt ungültige Werte durch den Standard', () => {
    const n = K.normalizeKeepAlive({ enabled: 'ja', signal: '<script>', intervalMin: NaN, durationS: 'abc', levelDb: Infinity });
    assert.deepEqual(n, K.KEEPALIVE_DEFAULTS);
    assert.equal(K.normalizeKeepAlive({ intervalMin: -5 }).intervalMin, 1);
    assert.equal(K.normalizeKeepAlive({ signal: 'constructor' }).signal, 'tone');
    assert.equal(K.normalizeKeepAlive({ levelDb: null }).levelDb, -26);
    assert.equal(K.normalizeKeepAlive({ intervalMin: [] }).intervalMin, 5);
    assert.equal(K.normalizeKeepAlive({ intervalMin: '' }).intervalMin, 5);
    assert.equal(K.normalizeKeepAlive({ intervalMin: '   ' }).intervalMin, 5);
    assert.equal(K.normalizeKeepAlive({ levelDb: ' -30 ' }).levelDb, -30);
  });
  it('übernimmt keine fremden Felder', () => {
    assert.deepEqual(Object.keys(K.normalizeKeepAlive({ x: 1, __proto__: { y: 2 } })).sort(),
      ['durationS', 'enabled', 'intervalMin', 'levelDb', 'signal']);
  });
});

describe('Pulsform', () => {
  it('teilt die Dauer in 40 % Einblenden, 20 % voll, 40 % Ausblenden', () => {
    assert.deepEqual(K.pulseShape(5), { rise: 2, hold: 1, fall: 2 });
    const s = K.pulseShape(1);
    assert.ok(Math.abs(s.rise - 0.4) < 1e-9 && Math.abs(s.hold - 0.2) < 1e-9 && Math.abs(s.fall - 0.4) < 1e-9);
  });
});

describe('Pulse planen', () => {
  const base = { lastActivity: 100, intervalS: 300, durationS: 5 };
  it('erster Puls genau ein Intervall nach der letzten Aktivität, dann im festen Abstand', () => {
    assert.deepEqual(K.pulsePlan({ ...base, from: 100, to: 1100 }), [[400, 405], [700, 705], [1000, 1005]]);
  });
  it('plant nur Pulse, die im Fenster [from, to) beginnen', () => {
    assert.deepEqual(K.pulsePlan({ ...base, from: 400, to: 1000 }), [[400, 405], [700, 705]]);
    assert.deepEqual(K.pulsePlan({ ...base, from: 401, to: 1001 }), [[700, 705], [1000, 1005]]);
  });
  it('Aktivität mitten im Plan verschiebt alle folgenden Pulse', () => {
    assert.deepEqual(K.pulsePlan({ ...base, lastActivity: 550, from: 550, to: 1500 }), [[850, 855], [1150, 1155], [1450, 1455]]);
  });
  it('kein Puls vor Ablauf des ersten Intervalls', () => {
    assert.deepEqual(K.pulsePlan({ ...base, from: 100, to: 400 }), []);
  });
  it('lange Leerlaufzeit: setzt im Raster fort, ohne vergangene Pulse nachzuholen', () => {
    assert.deepEqual(K.pulsePlan({ ...base, from: 3000, to: 3700 }), [[3100, 3105], [3400, 3405]]);
  });
  it('Grenzen des Intervalls (1 und 60 Minuten)', () => {
    assert.equal(K.pulsePlan({ lastActivity: 0, intervalS: 60, durationS: 5, from: 0, to: 3600 }).length, 59);
    assert.deepEqual(K.pulsePlan({ lastActivity: 0, intervalS: 3600, durationS: 5, from: 0, to: 7201 }), [[3600, 3605], [7200, 7205]]);
  });
  it('liefert bei ungültigen Werten keinen Plan', () => {
    for (const bad of [
      { ...base, intervalS: 0, from: 0, to: 1000 },
      { ...base, intervalS: -300, from: 0, to: 1000 },
      { ...base, intervalS: NaN, from: 0, to: 1000 },
      { ...base, durationS: 0, from: 0, to: 1000 },
      { ...base, lastActivity: NaN, from: 0, to: 1000 },
      { ...base, from: 1000, to: 500 },
      { ...base, from: 'a', to: 1000 },
      {},
    ]) assert.deepEqual(K.pulsePlan(bad), [], JSON.stringify(bad));
  });
  it('„Jetzt senden“: Puls am Fensteranfang trotz Rundungsfehlern (Audio-Uhr in 128er-Blöcken)', () => {
    let missing = 0;
    for (let i = 0; i < 5000; i++) {
      const now = (i * 128) / 44100, from = now + 0.05;
      const plan = K.pulsePlan({ lastActivity: now + 0.05 - 300, intervalS: 300, durationS: 1, from, to: from + 3600 });
      if (!plan.length || Math.abs(plan[0][0] - from) > 1e-6) missing++;
    }
    assert.equal(missing, 0);
  });
  it('aufeinanderfolgende Fenster planen jeden Puls genau einmal', () => {
    for (const la of [0, 0.1 + 0.2, 1000 - 300 * 3 + 1e-12, 1000 - 300 * 3 - 1e-12, 99.99999999]) {
      const a = K.pulsePlan({ lastActivity: la, intervalS: 300, durationS: 5, from: 0, to: 1000 });
      const b = K.pulsePlan({ lastActivity: la, intervalS: 300, durationS: 5, from: 1000, to: 2000 });
      const all = K.pulsePlan({ lastActivity: la, intervalS: 300, durationS: 5, from: 0, to: 2000 });
      assert.deepEqual([...a, ...b], all, String(la));
    }
  });
  it('begrenzt die Zahl der Pulse (Schutz vor Endlosschleifen)', () => {
    assert.ok(K.pulsePlan({ lastActivity: 0, intervalS: 0.001, durationS: 0.0001, from: 0, to: 1e9 }).length <= 1000);
  });
});

describe('Signal erzeugen', () => {
  const sr = 48000;
  it('tiefer Ton: 50 Hz, Spitze 1, nahtlos schleifbar', () => {
    const t = K.signalSamples('tone', sr);
    assert.equal(t.length, sr);
    let max = 0, crossings = 0;
    for (let i = 0; i < t.length; i++) {
      max = Math.max(max, Math.abs(t[i]));
      if (i && t[i - 1] < 0 && t[i] >= 0) crossings++;
    }
    assert.ok(max > 0.999 && max <= 1);
    assert.equal(crossings, 49); // 50 Schwingungen, der Anfang zählt nicht als Durchgang
    assert.ok(Math.abs(t[0]) < 1e-6); // nach dem letzten Sample kommt wieder sin(0)
    assert.ok(t[t.length - 1] < 0 && t[t.length - 1] > -0.01);
  });
  it('Rauschen: deterministisch, auf Spitze 1 normiert, ohne Gleichanteil, tiefpassgefiltert', () => {
    const a = K.signalSamples('noise', sr);
    const b = K.signalSamples('noise', sr);
    assert.deepEqual(a, b);
    let max = 0, sum = 0, abs = 0, diff = 0;
    for (let i = 0; i < a.length; i++) {
      max = Math.max(max, Math.abs(a[i]));
      sum += a[i];
      abs += Math.abs(a[i]);
      if (i) diff += Math.abs(a[i] - a[i - 1]);
    }
    assert.ok(Math.abs(max - 1) < 1e-6, `Spitze ${max}`);
    assert.ok(Math.abs(sum / a.length) < 0.05, `Gleichanteil ${sum / a.length}`);
    assert.ok(abs / a.length > 0.1, `zu leise ${abs / a.length}`);
    // Tiefpass: benachbarte Werte liegen nah beieinander (weißes Rauschen hätte etwa den doppelten Betragsmittelwert)
    assert.ok(diff / abs < 0.5, `nicht geglättet ${diff / abs}`);
  });
  it('Stille: nur Nullen', () => {
    assert.ok(K.signalSamples('silence', sr).every((v) => v === 0));
  });
  it('unbekannte Signalart und ungültige Abtastrate', () => {
    assert.ok(K.signalSamples('xyz', sr).every((v) => v === 0));
    assert.equal(K.signalSamples('tone', NaN).length, 0);
    assert.equal(K.signalSamples('tone', -1).length, 0);
  });
});
