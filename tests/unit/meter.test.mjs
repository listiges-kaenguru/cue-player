// Pegel und Springen (meter.js): dB-Skala der Anzeige, Spitzenwert-Halter, Wellenform, Klick → Zeit, Breite des rechten Bereichs.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as M from '../../js/meter.js';

describe('Anzeigeskala', () => {
  it('bildet −60…0 dBFS linear auf 0…1 ab', () => {
    assert.equal(M.meterFraction(0), 1);
    assert.equal(M.meterFraction(-60), 0);
    assert.equal(M.meterFraction(-30), 0.5);
    assert.equal(M.meterFraction(-15), 0.75);
  });
  it('begrenzt Werte außerhalb und ungültige Werte', () => {
    assert.equal(M.meterFraction(6), 1);
    assert.equal(M.meterFraction(-100), 0);
    assert.equal(M.meterFraction(-Infinity), 0);
    assert.equal(M.meterFraction(NaN), 0);
    assert.equal(M.meterFraction(undefined), 0);
  });
  it('nutzt eine andere Untergrenze', () => {
    assert.equal(M.meterFraction(-20, -40), 0.5);
    assert.equal(M.meterFraction(-40, -40), 0);
  });
});

describe('Spitzenwert eines Blocks', () => {
  it('liefert den größten Betrag', () => {
    assert.equal(M.blockPeak(new Float32Array([0.1, -0.5, 0.3])), 0.5);
    assert.equal(M.blockPeak([0.2, 0.9, -0.1]), 0.9);
  });
  it('leer oder still ergibt 0, NaN wird ignoriert', () => {
    assert.equal(M.blockPeak(new Float32Array(0)), 0);
    assert.equal(M.blockPeak(new Float32Array(128)), 0);
    assert.equal(M.blockPeak([NaN, 0.25]), 0.25);
  });
  it('Werte über 1 bleiben erhalten (Übersteuerung)', () => {
    assert.equal(M.blockPeak([1.5, -0.2]), 1.5);
  });
  it('rechnet in dBFS um, Stille → −Infinity', () => {
    assert.equal(M.peakDb(1), 0);
    assert.ok(Math.abs(M.peakDb(0.5) + 6.02) < 0.01);
    assert.equal(M.peakDb(0), -Infinity);
    assert.equal(M.peakDb(-1), -Infinity);
  });
});

describe('Spitzenwert-Halter', () => {
  it('übernimmt höhere Werte sofort', () => {
    const h = M.holdPeak(null, -20, 1000);
    assert.deepEqual(h, { db: -20, t: 1000 });
    assert.deepEqual(M.holdPeak(h, -10, 1100), { db: -10, t: 1100 });
  });
  it('hält den Wert während der Haltezeit', () => {
    const h = { db: -10, t: 1000 };
    assert.deepEqual(M.holdPeak(h, -40, 1000 + M.PEAK_HOLD_MS), h);
  });
  it('fällt nach der Haltezeit mit fester Rate, aber nicht unter den aktuellen Pegel', () => {
    const h = { db: -10, t: 0 };
    const r = M.holdPeak(h, -60, M.PEAK_HOLD_MS + 1000);
    assert.equal(r.db, -10 - M.PEAK_FALL_DB_S);
    assert.equal(r.t, 0);
    assert.equal(M.holdPeak(h, -12, M.PEAK_HOLD_MS + 1000).db, -12);
  });
  it('ignoriert ungültige Pegel', () => {
    assert.deepEqual(M.holdPeak({ db: -10, t: 0 }, NaN, 10), { db: -10, t: 0 });
    assert.equal(M.holdPeak(null, NaN, 10).db, -Infinity);
  });
});

describe('Wellenform', () => {
  it('teilt in Abschnitte und nimmt je Abschnitt das Maximum aller Kanäle', () => {
    const l = new Float32Array([0.1, 0.2, 0.3, 0.4, 0, 0, -0.9, 0]);
    const r = new Float32Array([0.5, 0, 0, 0, 0, 0.6, 0, 0]);
    assert.deepEqual([...M.waveformPeaks([l, r], 4)].map((v) => +v.toFixed(2)), [0.5, 0.4, 0.6, 0.9]);
  });
  it('mehr Abschnitte als Samples: höchstens ein Abschnitt je Sample', () => {
    assert.equal(M.waveformPeaks([new Float32Array([0.5, 0.25])], 10).length, 2);
  });
  it('ungleichmäßige Teilung verliert keine Samples', () => {
    const p = M.waveformPeaks([new Float32Array([0, 0, 0, 0, 0, 0, 0.7])], 3);
    assert.equal(p.length, 3);
    assert.equal(+p[2].toFixed(2), 0.7);
  });
  it('leer oder ungültig → leeres Ergebnis', () => {
    assert.equal(M.waveformPeaks([], 10).length, 0);
    assert.equal(M.waveformPeaks([new Float32Array(0)], 10).length, 0);
    assert.equal(M.waveformPeaks([new Float32Array(8)], 0).length, 0);
    assert.equal(M.waveformPeaks([new Float32Array(8)], -3).length, 0);
    assert.equal(M.waveformPeaks([new Float32Array(8)], NaN).length, 0);
  });
  it('Ausschnitt für getrimmte Cues', () => {
    assert.deepEqual(M.peakRange(100, 10, 2, 7), [20, 70]);
    assert.deepEqual(M.peakRange(100, 10, 0, 10), [0, 100]);
    assert.deepEqual(M.peakRange(100, 10, -1, 99), [0, 100]);
    assert.deepEqual(M.peakRange(100, 10, 5, 5), [50, 51]);
    assert.deepEqual(M.peakRange(100, 0, 0, 1), [0, 0]);
    assert.deepEqual(M.peakRange(0, 10, 0, 10), [0, 0]);
  });
});

describe('Klick → Zeit', () => {
  it('Anteil aus Mausposition', () => {
    assert.equal(M.fractionAt(150, 100, 200), 0.25);
    assert.equal(M.fractionAt(100, 100, 200), 0);
    assert.equal(M.fractionAt(300, 100, 200), 1);
  });
  it('außerhalb wird begrenzt, Breite 0 oder ungültig → 0', () => {
    assert.equal(M.fractionAt(50, 100, 200), 0);
    assert.equal(M.fractionAt(999, 100, 200), 1);
    assert.equal(M.fractionAt(150, 100, 0), 0);
    assert.equal(M.fractionAt(150, 100, -5), 0);
    assert.equal(M.fractionAt(NaN, 100, 200), 0);
  });
  it('Zeit im getrimmten Bereich', () => {
    assert.equal(M.seekTarget(0.5, { start: 2, end: 8 }), 5);
    assert.equal(M.seekTarget(0, { start: 2, end: 8 }), 2);
    assert.equal(M.seekTarget(1, { start: 2, end: 8 }), 8);
    assert.equal(M.seekTarget(-1, { start: 2, end: 8 }), 2);
    assert.equal(M.seekTarget(2, { start: 2, end: 8 }), 8);
    assert.equal(M.seekTarget(NaN, { start: 2, end: 8 }), 2);
    assert.equal(M.seekTarget(0.5, { start: 3, end: 3 }), 3);
  });
  it('Schritt per Pfeiltaste bleibt im Bereich', () => {
    assert.equal(M.stepTarget(5, 5, { start: 2, end: 8 }), 8);
    assert.equal(M.stepTarget(5, -5, { start: 2, end: 8 }), 2);
    assert.equal(M.stepTarget(4, 1, { start: 2, end: 8 }), 5);
  });
});

describe('Breite des rechten Bereichs', () => {
  it('begrenzt auf Minimum und 60 % des Fensters', () => {
    assert.equal(M.clampSideWidth(400, 1600), 400);
    assert.equal(M.clampSideWidth(100, 1600), M.SIDE_MIN);
    assert.equal(M.clampSideWidth(5000, 1600), 960);
    assert.equal(M.clampSideWidth(-50, 1600), M.SIDE_MIN);
  });
  it('schmales Fenster: Minimum hat Vorrang', () => {
    assert.equal(M.clampSideWidth(500, 300), M.SIDE_MIN);
  });
  it('ungültige gespeicherte Werte → null (Standardbreite)', () => {
    for (const v of [NaN, 'abc', '', null, undefined, Infinity, {}]) assert.equal(M.clampSideWidth(v, 1600), null, String(v));
  });
  it('Zahl als Text wird akzeptiert (localStorage)', () => {
    assert.equal(M.clampSideWidth('420', 1600), 420);
    assert.equal(M.clampSideWidth('420.6', 1600), 421);
  });
});
