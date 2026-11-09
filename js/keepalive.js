// Ausgabegerät wach halten: Manche Lautsprecher (z. B. Bluetooth) schalten sich bei Stille ab. Ein leiser, kurzer
// Puls nach einer Weile ohne Wiedergabe hält sie wach. Hier die reine Logik (ohne DOM, ohne Web Audio, unit-getestet)
// und die Klasse, die den Plan auf einen GainNode legt.

export const SIGNALS = ['tone', 'noise', 'silence'];
export const KEEPALIVE_DEFAULTS = Object.freeze({ enabled: false, signal: 'tone', intervalMin: 5, durationS: 5, levelDb: -26 });
export const LIMITS = Object.freeze({ intervalMin: [1, 60], durationS: [1, 10], levelDb: [-60, -20] });
const TONE_HZ = 50; // 1 s Puffer = 50 ganze Schwingungen, schleift ohne Knacken
const MAX_PULSES = 1000;
const EPS = 1e-6; // s

function num(v, def, [lo, hi]) {
  const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : typeof v === 'number' ? v : NaN;
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : def;
}

/** Prüft gespeicherte bzw. eingegebene Einstellungen; Unbekanntes und Ungültiges wird zum Standard. */
export function normalizeKeepAlive(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const d = KEEPALIVE_DEFAULTS;
  return {
    enabled: r.enabled === true,
    signal: SIGNALS.includes(r.signal) ? r.signal : d.signal,
    intervalMin: Math.round(num(r.intervalMin, d.intervalMin, LIMITS.intervalMin)),
    durationS: num(r.durationS, d.durationS, LIMITS.durationS),
    levelDb: num(r.levelDb, d.levelDb, LIMITS.levelDb),
  };
}

/** Pulsform: je 40 % lineares Ein- und Ausblenden, dazwischen voller Pegel. */
export function pulseShape(durationS) {
  return { rise: durationS * 0.4, hold: durationS * 0.2, fall: durationS * 0.4 };
}

/**
 * Pulse als [start, ende] (Sekunden, Audio-Uhr), die im Fenster [from, to) beginnen. Der erste liegt genau ein
 * Intervall nach der letzten Wiedergabe, die weiteren im selben Abstand.
 */
export function pulsePlan({ lastActivity, intervalS, durationS, from, to } = {}) {
  const ok = [lastActivity, intervalS, durationS, from, to].every((v) => typeof v === 'number' && Number.isFinite(v));
  if (!ok || intervalS <= 0 || durationS <= 0 || to <= from) return [];
  // Toleranz gegen Rundungsfehler der Audio-Uhr, an beiden Grenzen gleich: aufeinanderfolgende Fenster
  // [a, b) und [b, c) planen jeden Puls genau einmal.
  const lo = from - EPS, hi = to - EPS;
  const k0 = Math.max(1, Math.ceil((lo - lastActivity) / intervalS));
  const out = [];
  for (let k = k0; out.length < MAX_PULSES; k++) {
    const start = lastActivity + k * intervalS;
    if (start >= hi) break;
    if (start >= lo) out.push([start, start + durationS]);
  }
  return out;
}

/** Eine Sekunde Signal mit Spitze 1 (Pegel kommt über den Gain): 50-Hz-Sinus, Rauschen oder Stille. */
export function signalSamples(signal, sampleRate) {
  const n = Number.isFinite(sampleRate) && sampleRate > 0 ? Math.round(sampleRate) : 0;
  const out = new Float32Array(n);
  if (signal === 'tone') {
    for (let i = 0; i < n; i++) out[i] = Math.sin((2 * Math.PI * TONE_HZ * i) / n);
  } else if (signal === 'noise') {
    // Weißes Rauschen mit festem Startwert (reproduzierbar), Tiefpass 1. Ordnung, auf Spitze 1 normiert
    let seed = 0x2545f491, y = 0, max = 0;
    for (let i = 0; i < n; i++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      y += 0.1 * ((seed / 0x100000000) * 2 - 1 - y);
      out[i] = y;
      max = Math.max(max, Math.abs(y));
    }
    if (max > 0) for (let i = 0; i < n; i++) out[i] /= max;
  }
  return out;
}

const HORIZON = 3600; // s – so weit im Voraus werden Pulse geplant
const REFILL_MS = 60_000;
const QUICK = 0.05; // s – Ausblenden, wenn eine Cue startet

/**
 * Legt die Pulse auf die Audio-Uhr: geloopte Quelle → GainNode → ctx.destination (am Master vorbei).
 * Die Quelle läuft durchgehend (hält den Audiostrom offen), der Gain ist außer bei Pulsen 0.
 */
export class KeepAlive {
  constructor() {
    this.ctx = null;
    this.settings = { ...KEEPALIVE_DEFAULTS };
    this.src = null;
    this.gain = null;
    this.lastActivity = 0; // ctx-Zeit der letzten Wiedergabe
    this.audible = false; // spielt gerade eine Audio-Cue hörbar?
    this.plannedUntil = 0;
    this.pulses = [];
    this.timer = null;
  }

  get running() { return !!this.src; }

  /** Wird von der Engine aufgerufen, sobald der AudioContext existiert. */
  attach(ctx) {
    if (this.ctx === ctx) return;
    this.ctx = ctx;
    this.lastActivity = ctx.currentTime;
    this._apply();
  }

  configure(settings) {
    const next = normalizeKeepAlive(settings);
    const prev = this.settings;
    this.settings = next;
    if (prev.signal !== next.signal && this.src) this._stopSource();
    this._apply();
  }

  /** Wiedergabe-Zustand der Audio-Cues; der Zähler beginnt nach dem letzten Spielen neu. */
  setAudible(audible) {
    if (audible === this.audible) return;
    this.audible = audible;
    if (!this.ctx) return;
    this.lastActivity = this.ctx.currentTime;
    this._replan();
  }

  /** Sofort einen Puls schicken (zum Ausprobieren am Gerät). */
  pulseNow() {
    if (!this.running) return false;
    // Erster Puls direkt nach dem kurzen Ausblenden in _replan(); Zeit nur einmal lesen (läuft auf dem Audio-Thread weiter)
    const now = this.ctx.currentTime;
    this.lastActivity = now + QUICK - this.intervalS;
    this.audible = false;
    this._replan(now);
    return true;
  }

  get intervalS() { return this.settings.intervalMin * 60; }

  /** Beginn (ctx-Zeit) des letzten Pulses, der schon begonnen hat, sonst null. */
  lastPulse() {
    if (!this.ctx) return null;
    const now = this.ctx.currentTime;
    const past = this.pulses.filter(([s]) => s <= now);
    return past.length ? past[past.length - 1][0] : null;
  }

  _apply() {
    const on = this.settings.enabled && this.ctx;
    if (!on) { this._stopSource(); return; }
    if (!this.src) this._startSource();
    this._replan();
  }

  _startSource() {
    const ctx = this.ctx;
    const buf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    buf.getChannelData(0).set(signalSamples(this.settings.signal, ctx.sampleRate));
    this.gain = ctx.createGain();
    this.gain.gain.value = 0;
    this.src = ctx.createBufferSource();
    this.src.buffer = buf;
    this.src.loop = true;
    this.src.connect(this.gain).connect(ctx.destination);
    this.src.start();
    this.timer = setInterval(() => this._refill(), REFILL_MS);
  }

  _stopSource() {
    clearInterval(this.timer);
    this.timer = null;
    if (this.src) {
      try { this.src.stop(); } catch { /* schon gestoppt */ }
      this.src.disconnect();
      this.gain.disconnect();
    }
    this.src = null;
    this.gain = null;
    this.pulses = [];
    this.plannedUntil = 0;
  }

  _replan(now = this.ctx?.currentTime) {
    if (!this.running) return;
    const g = this.gain.gain;
    // Laufenden Puls weich beenden, geplante verwerfen
    if (g.cancelAndHoldAtTime) g.cancelAndHoldAtTime(now); else { g.cancelScheduledValues(now); g.setValueAtTime(g.value, now); }
    g.linearRampToValueAtTime(0, now + QUICK);
    const past = this.pulses.filter(([s]) => s <= now);
    this.pulses = past.slice(-1); // nur der letzte vergangene Puls (Anzeige)
    this.plannedUntil = now + QUICK;
    if (!this.audible) this._refill();
  }

  _refill() {
    if (!this.running || this.audible || this.settings.signal === 'silence') return;
    const { durationS, levelDb } = this.settings;
    const to = this.ctx.currentTime + HORIZON;
    const plan = pulsePlan({ lastActivity: this.lastActivity, intervalS: this.intervalS, durationS, from: this.plannedUntil, to });
    const amp = Math.pow(10, levelDb / 20);
    const { rise, hold } = pulseShape(durationS);
    const g = this.gain.gain;
    const now = this.ctx.currentTime;
    const past = this.pulses.filter(([s]) => s <= now);
    this.pulses = [...past.slice(-1), ...this.pulses.filter(([s]) => s > now)];
    for (const [s, e] of plan) {
      g.setValueAtTime(0, s);
      g.linearRampToValueAtTime(amp, s + rise);
      g.setValueAtTime(amp, s + rise + hold);
      g.linearRampToValueAtTime(0, e);
      this.pulses.push([s, e]);
    }
    // Bis zum Fensterende geplant, auch wenn dort kein Puls beginnt
    this.plannedUntil = Math.max(this.plannedUntil, to);
  }
}
