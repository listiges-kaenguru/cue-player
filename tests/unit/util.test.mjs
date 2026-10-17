// Hilfsfunktionen (util.js): dB-Umrechnung, Zeitformat, Timer, Fade-Rampen, Versionsprüfung.
// Zeit (Timer, Date.now) und Netz (fetch) sind gemockt, localStorage liegt im Speicher.
import { describe, it, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import * as U from '../../js/util.js';

describe('dB und Verstärkung', () => {
  it('rechnet dB in Verstärkung um', () => {
    assert.equal(U.dbToGain(0), 1);
    assert.ok(Math.abs(U.dbToGain(-6) - 0.501) < 0.001);
    assert.ok(Math.abs(U.dbToGain(6) - 1.995) < 0.001);
    assert.equal(U.dbToGain(-59.9) > 0, true);
    assert.equal(U.dbToGain(U.MIN_DB), 0);
    assert.equal(U.dbToGain(-1000), 0);
    assert.equal(U.dbToGain(-Infinity), 0);
  });
  it('rechnet Verstärkung in dB um, nach unten bei −60 begrenzt', () => {
    assert.equal(U.gainToDb(1), 0);
    assert.ok(Math.abs(U.gainToDb(0.5) + 6.02) < 0.01);
    assert.equal(U.gainToDb(0), U.MIN_DB);
    assert.equal(U.gainToDb(-1), U.MIN_DB);
    assert.equal(U.gainToDb(1e-9), U.MIN_DB);
    assert.equal(U.gainToDb(U.dbToGain(-12)).toFixed(6), '-12.000000');
  });
  it('begrenzt Werte auf einen Bereich', () => {
    assert.equal(U.clamp(5, 0, 10), 5);
    assert.equal(U.clamp(-1, 0, 10), 0);
    assert.equal(U.clamp(11, 0, 10), 10);
    assert.equal(U.clamp(0, 0, 10), 0);
    assert.equal(U.clamp(10, 0, 10), 10);
  });
});

describe('Anzeige', () => {
  it('formatiert Sekunden als m:ss.d', () => {
    assert.equal(U.fmtTime(0), '0:00.0');
    assert.equal(U.fmtTime(9.94), '0:09.9');
    assert.equal(U.fmtTime(10), '0:10.0');
    assert.equal(U.fmtTime(61.25), '1:01.3');
    assert.equal(U.fmtTime(3600), '60:00.0');
  });
  it('zeigt bei ungültigen Zeiten 0:00.0', () => {
    for (const v of [-1, NaN, Infinity, -Infinity]) assert.equal(U.fmtTime(v), '0:00.0');
  });
  it('formatiert dB mit Vorzeichen und −∞', () => {
    assert.equal(U.fmtDb(0), '0.0 dB');
    assert.equal(U.fmtDb(3.25), '+3.3 dB');
    assert.equal(U.fmtDb(-12), '-12.0 dB');
    assert.equal(U.fmtDb(-60), '−∞ dB');
    assert.equal(U.fmtDb(-80), '−∞ dB');
  });
  it('beschriftet Tasten lesbar', () => {
    assert.equal(U.keyLabel('KeyA'), 'A');
    assert.equal(U.keyLabel('Digit5'), '5');
    assert.equal(U.keyLabel('Numpad7'), 'Num 7');
    assert.equal(U.keyLabel('Space'), 'Space');
    assert.equal(U.keyLabel(''), '');
    assert.equal(U.keyLabel(undefined), '');
  });
  it('erzeugt eindeutige IDs, auch ohne crypto.randomUUID', () => {
    const ids = new Set(Array.from({ length: 200 }, U.uid));
    assert.equal(ids.size, 200);
    Object.defineProperty(globalThis.crypto, 'randomUUID', { value: undefined, configurable: true });
    try {
      const a = U.uid(), b = U.uid();
      assert.match(a, /^id-[a-z0-9]+-[a-z0-9]+$/);
      assert.notEqual(a, b);
    } finally {
      delete globalThis.crypto.randomUUID;
    }
    assert.match(U.uid(), /^[0-9a-f-]{36}$/);
  });
});

describe('Emitter', () => {
  it('ruft Abonnenten auf und lässt sich abmelden', () => {
    const e = new U.Emitter();
    const got = [];
    const off = e.on('x', (a, b) => got.push([a, b]));
    e.emit('x', 1, 2);
    off();
    e.emit('x', 3, 4);
    e.emit('unbekannt');
    assert.deepEqual(got, [[1, 2]]);
  });
  it('ein fehlerhafter Abonnent hält die anderen nicht auf', () => {
    const e = new U.Emitter();
    const errs = mock.method(console, 'error', () => {});
    let ok = false;
    e.on('x', () => { throw new Error('kaputt'); });
    e.on('x', () => { ok = true; });
    e.emit('x');
    assert.equal(ok, true);
    assert.equal(errs.mock.callCount(), 1);
    errs.mock.restore();
  });
});

describe('Timer und debounce (gemockte Zeit)', () => {
  let jetzt;
  beforeEach(() => {
    jetzt = 5000; // nicht 0, damit vertauschte Vorzeichen bei performance.now() auffallen
    mock.timers.enable({ apis: ['setTimeout'] });
    mock.method(performance, 'now', () => jetzt);
  });
  afterEach(() => { mock.timers.reset(); mock.restoreAll(); });
  const vor = (ms) => { jetzt += ms; mock.timers.tick(ms); };

  it('löst nach der Zeit aus, nicht vorher', () => {
    let n = 0;
    const t = new U.Timer(1000, () => n++);
    vor(999);
    assert.equal(n, 0);
    vor(1);
    assert.equal(n, 1);
    assert.equal(t.done, true);
    assert.equal(t.elapsed(), 1000);
  });
  it('pausiert und setzt mit der Restzeit fort', () => {
    let n = 0;
    const t = new U.Timer(1000, () => n++);
    vor(400);
    t.pause();
    t.pause();
    vor(5000);
    assert.equal(n, 0);
    assert.equal(t.elapsed(), 400);
    t.resume();
    t.resume();
    vor(599);
    assert.equal(n, 0);
    vor(1);
    assert.equal(n, 1);
  });
  it('löst nach cancel nie aus und lässt sich nicht fortsetzen', () => {
    let n = 0;
    const t = new U.Timer(100, () => n++);
    t.cancel();
    t.resume();
    vor(1000);
    assert.equal(n, 0);
  });
  it('behandelt negative Zeiten wie 0', () => {
    let n = 0;
    const t = new U.Timer(-50, () => n++);
    assert.equal(t.ms, 0);
    vor(0);
    assert.equal(n, 1);
  });
  it('debounce ruft nur einmal mit den letzten Argumenten auf', () => {
    const got = [];
    const f = U.debounce((x) => got.push(x), 100);
    f(1); vor(50); f(2); vor(99);
    assert.deepEqual(got, []);
    vor(1);
    assert.deepEqual(got, [2]);
  });
});

describe('rampParam (Fade-Kurven)', () => {
  /** Nachbau eines AudioParam, der die Aufrufe mitschreibt */
  const param = (value, kurveWirft = false) => ({
    value, calls: [],
    cancelScheduledValues(t) { this.calls.push(['cancel', t]); },
    setValueAtTime(v, t) { this.calls.push(['set', v, t]); },
    linearRampToValueAtTime(v, t) { this.calls.push(['linear', v, t]); },
    setValueCurveAtTime(arr, t, d) { if (kurveWirft) throw new Error('überlappt'); this.calls.push(['curve', arr, t, d]); },
  });
  const ctx = { currentTime: 10 };

  it('springt bei sehr kurzer Dauer oder gleichem Wert direkt', () => {
    const p = param(1);
    U.rampParam(ctx, p, 0.5, 0.005);
    assert.deepEqual(p.calls, [['cancel', 10], ['set', 0.5, 10]]);
    const q = param(0.5);
    U.rampParam(ctx, q, 0.5 + 1e-6, 3);
    assert.deepEqual(q.calls.at(-1), ['set', 0.5 + 1e-6, 10]);
  });
  it('linear: gleichmäßige Schritte in der Amplitude', () => {
    const p = param(1);
    U.rampParam(ctx, p, 0, 2, 'linear', 5);
    const [, arr, t, d] = p.calls.at(-1);
    assert.equal(arr.length, 128);
    assert.equal(arr[0], 1);
    assert.equal(arr[127], 0);
    assert.ok(Math.abs(arr[64] - (1 - 64 / 127)) < 1e-6);
    assert.deepEqual([t, d], [5, 2]);
  });
  it('log: gleichmäßige Schritte in dB (Mitte bei −30 dB)', () => {
    const p = param(1);
    U.rampParam(ctx, p, U.dbToGain(-60), 3);
    const [, arr] = p.calls.at(-1);
    assert.equal(arr[0], 1);
    assert.equal(arr[127], 0);
    // Index 63/64 von 127 liegt knapp um die Mitte → etwa −30 dB
    assert.ok(Math.abs(U.gainToDb(arr[63]) + 29.76) < 0.05, String(U.gainToDb(arr[63])));
    for (let i = 1; i < 127; i++) assert.ok(arr[i] <= arr[i - 1] + 1e-7, 'fällt monoton');
  });
  it('fällt auf eine lineare Rampe zurück, wenn der Browser die Kurve ablehnt', () => {
    const p = param(0.2, true);
    U.rampParam(ctx, p, 0.8, 1);
    assert.deepEqual(p.calls.slice(-2), [['set', 0.2, 10], ['linear', 0.8, 11]]);
  });
});

describe('Versionsvergleich', () => {
  it('vergleicht Versionen numerisch', () => {
    assert.ok(U.compareVersions('0.10.0', '0.9.9') > 0);
    assert.ok(U.compareVersions('1.0.0', '0.99.99') > 0);
    assert.ok(U.compareVersions('0.6.0', '0.6.1') < 0);
    assert.equal(U.compareVersions('0.6.0', '0.6.0'), 0);
    assert.equal(U.compareVersions('1.2', '1.2.0'), 0);
  });
  it('liest nur saubere Tags wie v1.2.3', () => {
    assert.equal(U.versionFromTag('v0.6.0'), '0.6.0');
    assert.equal(U.versionFromTag('1.2.3'), '1.2.3');
    for (const t of ['v1.2', 'v1.2.3-beta', 'x1.2.3', ' v1.2.3', 'v1.2.3<script>', '', null, undefined, 123, {}])
      assert.equal(U.versionFromTag(t), null, JSON.stringify(t));
  });
});

describe('latestRelease (GitHub gemockt, Zeit gemockt)', () => {
  const API = 'https://api.github.com/repos/x/y/releases/latest';
  const KEY = 'test-release';
  let daten, jetzt, abrufe;
  const antwort = (status, body) => async (url, opt) => {
    abrufe.push([url, opt]);
    return { ok: status === 200, status, json: async () => (typeof body === 'function' ? body() : body) };
  };
  beforeEach(() => {
    daten = new Map();
    jetzt = 1_700_000_000_000;
    abrufe = [];
    globalThis.localStorage = {
      getItem: (k) => daten.get(k) ?? null,
      setItem: (k, v) => void daten.set(k, String(v)),
    };
    mock.method(Date, 'now', () => jetzt);
  });
  afterEach(() => { delete globalThis.localStorage; mock.restoreAll(); });

  it('fragt GitHub und merkt sich Version und Zeitpunkt', async () => {
    mock.method(globalThis, 'fetch', antwort(200, { tag_name: 'v0.7.0' }));
    assert.equal(await U.latestRelease(API, KEY), '0.7.0');
    assert.equal(abrufe.length, 1);
    assert.equal(abrufe[0][0], API);
    assert.equal(abrufe[0][1].headers.Accept, 'application/vnd.github+json');
    assert.deepEqual(JSON.parse(daten.get(KEY)), { version: '0.7.0', checked: jetzt });
  });
  it('fragt innerhalb eines Tages nicht erneut, danach schon', async () => {
    mock.method(globalThis, 'fetch', antwort(200, { tag_name: 'v0.8.0' }));
    daten.set(KEY, JSON.stringify({ version: '0.7.0', checked: jetzt - 24 * 3600 * 1000 + 1 }));
    assert.equal(await U.latestRelease(API, KEY), '0.7.0');
    assert.equal(abrufe.length, 0);
    jetzt += 1;
    assert.equal(await U.latestRelease(API, KEY), '0.8.0');
    assert.equal(abrufe.length, 1);
  });
  it('merkt sich auch Fehlschläge (kein erneutes Fragen bei gesperrtem Netz)', async () => {
    mock.method(globalThis, 'fetch', async () => { abrufe.push(1); throw new TypeError('offline'); });
    assert.equal(await U.latestRelease(API, KEY), null);
    assert.equal(await U.latestRelease(API, KEY), null);
    assert.equal(abrufe.length, 1);
    assert.deepEqual(JSON.parse(daten.get(KEY)), { version: null, checked: jetzt });
  });
  for (const [name, f] of [
    ['HTTP 403 (Limit)', antwort(403, { message: 'rate limit' })],
    ['kaputtes JSON', antwort(200, () => { throw new SyntaxError('kaputt'); })],
    ['fremder Tag', antwort(200, { tag_name: '<img src=x onerror=alert(1)>' })],
    ['Tag fehlt', antwort(200, {})],
    ['null als Antwort', antwort(200, null)],
  ]) {
    it(`liefert null bei ${name}`, async () => {
      mock.method(globalThis, 'fetch', f);
      assert.equal(await U.latestRelease(API, KEY), null);
    });
  }
  it('fragt neu bei kaputtem Zwischenspeicher', async () => {
    mock.method(globalThis, 'fetch', antwort(200, { tag_name: 'v1.0.0' }));
    for (const alt of ['{kaputt', '"text"', JSON.stringify({ version: '9.9.9', checked: 'gestern' }), 'null']) {
      daten.set(KEY, alt);
      assert.equal(await U.latestRelease(API, KEY), '1.0.0', alt);
    }
  });
  it('läuft weiter, wenn localStorage gesperrt ist', async () => {
    globalThis.localStorage = { getItem: () => { throw new Error('gesperrt'); }, setItem: () => { throw new Error('gesperrt'); } };
    mock.method(globalThis, 'fetch', antwort(200, { tag_name: 'v1.0.1' }));
    assert.equal(await U.latestRelease(API, KEY), '1.0.1');
  });
});

// Nachgeschärft nach Mutation Testing
describe('Randfälle Timer, Rampen, Versionen', () => {
  let jetzt;
  beforeEach(() => { jetzt = 5000; mock.timers.enable({ apis: ['setTimeout'] }); mock.method(performance, 'now', () => jetzt); });
  afterEach(() => { mock.timers.reset(); mock.restoreAll(); });
  const vor = (ms) => { jetzt += ms; mock.timers.tick(ms); };

  it('zählt die vergangene Zeit während des Laufs mit, nach cancel nicht mehr', () => {
    const t = new U.Timer(1000, () => {});
    vor(250);
    assert.equal(t.elapsed(), 250);
    t.pause(); vor(100); t.resume(); vor(50);
    assert.equal(t.elapsed(), 300);
    t.cancel();
    const beimAbbruch = t.elapsed();
    vor(500);
    assert.equal(t.running, false);
    assert.equal(t.elapsed(), beimAbbruch, 'läuft nach cancel nicht weiter');
  });
  it('log-Rampe von leise nach laut (Ausgangswert ungleich 0 dB)', () => {
    const calls = [];
    const p = { value: U.dbToGain(-40), cancelScheduledValues() {}, setValueAtTime() {}, linearRampToValueAtTime() {}, setValueCurveAtTime: (a) => calls.push(a) };
    U.rampParam({ currentTime: 0 }, p, U.dbToGain(-10), 1);
    assert.ok(Math.abs(U.gainToDb(calls[0][127]) + 10) < 1e-4);
    assert.ok(Math.abs(U.gainToDb(calls[0][63]) - (-40 + 30 * 63 / 127)) < 1e-3, String(U.gainToDb(calls[0][63])));
  });
  it('vergleicht mehrstellige Versionen und ignoriert eine vierte Stelle', () => {
    assert.equal(U.versionFromTag('v10.20.30'), '10.20.30');
    assert.ok(U.compareVersions('0.10.0', '0.2.0') > 0);
    assert.equal(U.compareVersions('1.2.3.4', '1.2.3.9'), 0);
  });
  it('liefert bei HTTP-Fehler auch mit Tag im Inhalt null', async () => {
    globalThis.localStorage = { getItem: () => null, setItem: () => {} };
    mock.method(globalThis, 'fetch', async () => ({ ok: false, status: 500, json: async () => ({ tag_name: 'v9.9.9' }) }));
    try { assert.equal(await U.latestRelease('https://api.github.com/x', 'k'), null); } finally { delete globalThis.localStorage; }
  });
  it('erzeugt IDs auch ganz ohne crypto', () => {
    const orig = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
    Object.defineProperty(globalThis, 'crypto', { value: undefined, configurable: true });
    try { assert.match(U.uid(), /^id-/); } finally { Object.defineProperty(globalThis, 'crypto', orig); }
  });
});
