// Reine Hilfsfunktionen für Pegelanzeigen, Wellenform und Springen (ohne DOM und Web Audio, damit unit-testbar).

/** Untergrenze der Pegelanzeige in dBFS. */
export const METER_FLOOR = -60;
/** So lange bleibt der Spitzenwert stehen, danach fällt er mit PEAK_FALL_DB_S dB pro Sekunde. */
export const PEAK_HOLD_MS = 1500;
export const PEAK_FALL_DB_S = 20;
/** So lange bleibt die Clip-Markierung nach einer Übersteuerung sichtbar. */
export const CLIP_HOLD_MS = 3000;
/** Längere Dateien bekommen keine Wellenform (Dekodieren bräuchte zu viel Speicher, vor allem am Handy). */
export const WAVEFORM_MAX_SEC = 20 * 60;
/** Mindestbreite des rechten Bereichs (px) und größter Anteil an der Fensterbreite. */
export const SIDE_MIN = 240;
export const SIDE_MAX_FRAC = 0.6;

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/** Pegel (dBFS) → Anteil 0…1 der Anzeige, linear in dB zwischen floor und 0 dBFS. */
export function meterFraction(db, floor = METER_FLOOR) {
  if (!(db > floor)) return 0; // auch NaN, undefined, −Infinity
  return Math.min(1, (db - floor) / -floor);
}

/** Größter Betrag in einem Sample-Block (NaN wird übersprungen). */
export function blockPeak(samples) {
  let p = 0;
  for (let i = 0; i < samples.length; i++) {
    const v = Math.abs(samples[i]);
    if (v > p) p = v;
  }
  return p;
}

/** Spitzenwert (linear) → dBFS; Stille → −Infinity. */
export const peakDb = (p) => (p > 0 ? 20 * Math.log10(p) : -Infinity);

/**
 * Spitzenwert-Halter. hold: { db, t } vom letzten Aufruf (oder null), db: aktueller Pegel, now: Zeit in ms.
 * Höhere Werte gelten sofort; sonst bleibt der Wert PEAK_HOLD_MS stehen und fällt danach gleichmäßig.
 */
export function holdPeak(hold, db, now) {
  if (Number.isNaN(db)) return hold ?? { db: -Infinity, t: now };
  if (!hold) return { db, t: now };
  const over = now - hold.t - PEAK_HOLD_MS;
  const held = over > 0 ? hold.db - (PEAK_FALL_DB_S * over) / 1000 : hold.db;
  if (db >= held) return { db, t: now };
  return over > 0 ? { db: held, t: hold.t } : hold;
}

/**
 * Wellenform: teilt die Samples in `buckets` gleich große Abschnitte und liefert je Abschnitt
 * den größten Betrag über alle Kanäle.
 */
export function waveformPeaks(channels, buckets) {
  const n = channels[0]?.length ?? 0;
  const b = Math.min(Math.floor(buckets) || 0, n);
  const out = new Float32Array(Math.max(0, b));
  for (let i = 0; i < b; i++) {
    const from = Math.floor((i * n) / b), to = Math.floor(((i + 1) * n) / b);
    let p = 0;
    for (const ch of channels) {
      for (let k = from; k < to; k++) {
        const v = Math.abs(ch[k]);
        if (v > p) p = v;
      }
    }
    out[i] = p;
  }
  return out;
}

/** Indexbereich [von, bis) der Wellenform für den getrimmten Bereich start…end (Sekunden). */
export function peakRange(len, duration, start, end) {
  if (!(len > 0) || !(duration > 0)) return [0, 0];
  const i0 = clamp(Math.floor((start / duration) * len), 0, len);
  let i1 = clamp(Math.ceil((end / duration) * len), 0, len);
  if (i1 <= i0) i1 = Math.min(len, i0 + 1);
  return [i0, i1];
}

/** Anteil 0…1 der Klickposition x in einem Element (left, width). */
export function fractionAt(x, left, width) {
  if (!(width > 0)) return 0;
  const f = (x - left) / width;
  return Number.isNaN(f) ? 0 : clamp(f, 0, 1);
}

/** Zielzeit (Sekunden in der Datei) für einen Anteil des getrimmten Bereichs. */
export function seekTarget(fraction, { start, end }) {
  const f = Number.isNaN(fraction) ? 0 : clamp(fraction, 0, 1);
  return start + f * (end - start);
}

/** Zielzeit für einen Schritt (Pfeiltaste) von der aktuellen Position aus. */
export const stepTarget = (pos, step, { start, end }) => clamp(pos + step, start, end);

/**
 * Breite des rechten Bereichs begrenzen. Ungültige Werte (z. B. aus localStorage) → null, dann gilt die Standardbreite.
 */
export function clampSideWidth(w, viewport) {
  if (typeof w === 'string' ? !w.trim() : typeof w !== 'number') return null;
  const n = Number(w);
  if (!Number.isFinite(n)) return null;
  return clamp(Math.round(n), SIDE_MIN, Math.max(SIDE_MIN, Math.floor(viewport * SIDE_MAX_FRAC)));
}
