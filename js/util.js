// Kleine Hilfsfunktionen ohne Abhängigkeiten.

export function uid() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
}

export const MIN_DB = -60;

export function dbToGain(db) {
  return db <= MIN_DB ? 0 : Math.pow(10, db / 20);
}

export function gainToDb(g) {
  return g <= 0 ? MIN_DB : Math.max(MIN_DB, 20 * Math.log10(g));
}

export function clamp(v, lo, hi) {
  return Math.min(hi, Math.max(lo, v));
}

/** Sekunden -> "m:ss.d" */
export function fmtTime(sec) {
  if (!isFinite(sec) || sec < 0) sec = 0;
  const m = Math.floor(sec / 60);
  const s = sec - m * 60;
  return `${m}:${s < 10 ? '0' : ''}${s.toFixed(1)}`;
}

export function fmtDb(db) {
  return db <= MIN_DB ? '−∞ dB' : `${db > 0 ? '+' : ''}${db.toFixed(1)} dB`;
}

export class Emitter {
  constructor() { this._h = new Map(); }
  on(ev, fn) {
    if (!this._h.has(ev)) this._h.set(ev, new Set());
    this._h.get(ev).add(fn);
    return () => this._h.get(ev).delete(fn);
  }
  emit(ev, ...args) {
    this._h.get(ev)?.forEach((fn) => {
      try { fn(...args); } catch (e) { console.error(e); }
    });
  }
}

/** Pausierbarer Timer (für Pre-/Post-Wait und Action-Cues). */
export class Timer {
  constructor(ms, cb) {
    this.ms = Math.max(0, ms);
    this.cb = cb;
    this.before = 0;
    this.done = false;
    this.running = false;
    this.resume();
  }
  elapsed() {
    return this.before + (this.running ? performance.now() - this.t0 : 0);
  }
  pause() {
    if (!this.running) return;
    clearTimeout(this.h);
    this.before += performance.now() - this.t0;
    this.running = false;
  }
  resume() {
    if (this.running || this.done) return;
    this.t0 = performance.now();
    this.running = true;
    this.h = setTimeout(() => this._fire(), Math.max(0, this.ms - this.before));
  }
  cancel() {
    clearTimeout(this.h);
    this.running = false;
    this.done = true;
  }
  _fire() {
    this.running = false;
    this.done = true;
    this.before = this.ms;
    this.cb();
  }
}

/**
 * Rampe eines AudioParam vom aktuellen Wert auf `to` über `dur` Sekunden.
 * curve: 'linear' (linear in Amplitude) oder 'log' (linear in dB, klingt natürlicher).
 */
export function rampParam(ctx, param, to, dur, curve = 'log', when = ctx.currentTime) {
  const from = param.value;
  param.cancelScheduledValues(when);
  if (dur <= 0.005 || Math.abs(from - to) < 1e-5) {
    param.setValueAtTime(to, when);
    return;
  }
  const n = 128;
  const arr = new Float32Array(n);
  const fromDb = gainToDb(from);
  const toDb = gainToDb(to);
  for (let i = 0; i < n; i++) {
    const x = i / (n - 1);
    arr[i] = curve === 'linear' ? from + (to - from) * x : dbToGain(fromDb + (toDb - fromDb) * x);
  }
  arr[0] = from;
  arr[n - 1] = to;
  try {
    param.setValueCurveAtTime(arr, when, dur);
  } catch {
    param.setValueAtTime(from, when);
    param.linearRampToValueAtTime(to, when + dur);
  }
}

export function debounce(fn, ms) {
  let h;
  return (...a) => { clearTimeout(h); h = setTimeout(() => fn(...a), ms); };
}

/** Lesbare Darstellung eines KeyboardEvent.code */
export function keyLabel(code) {
  if (!code) return '';
  return code.replace(/^Key/, '').replace(/^Digit/, '').replace(/^Numpad/, 'Num ');
}
