// Wiedergabe-Engine: Cue-Ablauf (Pre-Wait, Post-Wait, Auto-Continue/-Follow) und Audio über Web Audio.
import { Emitter, Timer, dbToGain, rampParam } from './util.js';
import { midiBytes } from './midi.js';

const DECLICK = 0.015; // s – kurze Rampe gegen Knackser bei Pause/Stop

/**
 * Basisklasse für den Laufzeitzustand eines Cues.
 * Ablauf: go() -> [Pre-Wait] -> start() -> ... -> ended(natural) -> [Post-Wait] -> idle
 */
class Runner {
  constructor(engine, id) {
    this.engine = engine;
    this.id = id;
    this.playing = false; // Cue-Aktion läuft (Audio spielt, Fade läuft …)
    this.paused = false;
    this.stopping = false;
    this.preTimer = null;
    this.postTimer = null;
  }

  get cue() { return this.engine.cue(this.id); }

  get state() {
    if (this.paused) return 'paused';
    if (this.preTimer) return 'prewait';
    if (this.playing) return 'running';
    if (this.postTimer) return 'postwait';
    return 'idle';
  }

  get active() { return this.state !== 'idle'; }

  go() {
    if (this.paused) { this.resume(); return; }
    if (this.active) this.stop(0, true);
    const cue = this.cue;
    if (cue.preWait > 0) {
      this.preTimer = new Timer(cue.preWait * 1000, () => this._begin());
      this.changed();
    } else {
      this._begin();
    }
  }

  _begin() {
    this.preTimer = null;
    const cue = this.cue;
    this.playing = true;
    this.stopping = false;
    if (cue.nextAction === 'continue') {
      this.postTimer = new Timer((cue.postWait || 0) * 1000, () => this._postDone());
    }
    this.changed();
    this.start();
  }

  _postDone() {
    this.postTimer = null;
    this.changed();
    this.engine.triggerNext(this.id);
  }

  /** Von Unterklassen aufzurufen, wenn die Aktion beendet ist. */
  ended(natural) {
    if (!this.playing) return;
    this.playing = false;
    this.stopping = false;
    if (this.paused) {
      // Aktion endete während des Pause-Fades: Pause aufheben, sonst bliebe der Cue „pausiert“ hängen.
      this.paused = false;
      this.postTimer?.resume();
    }
    const cue = this.cue;
    if (natural && cue?.nextAction === 'follow') {
      this.postTimer = new Timer((cue.postWait || 0) * 1000, () => this._postDone());
    }
    this.changed();
  }

  /** fade: Ausblendzeit in Sekunden (nur Audio-Cues). */
  pause(fade = 0) {
    if (!this.active || this.paused) return;
    this.preTimer?.pause();
    this.postTimer?.pause();
    if (this.playing) this.pauseAction(fade);
    this.paused = true;
    this.changed();
  }

  /** fade: Einblendzeit in Sekunden (nur Audio-Cues). */
  resume(fade = 0) {
    if (!this.paused) return;
    this.paused = false;
    this.preTimer?.resume();
    this.postTimer?.resume();
    if (this.playing) this.resumeAction(fade);
    this.changed();
  }

  /** Stoppt den Cue. fade in Sekunden; hard = ohne Rücksicht auf laufende Fades sofort. */
  stop(fade = 0, hard = false) {
    this.preTimer?.cancel();
    this.preTimer = null;
    this.postTimer?.cancel();
    this.postTimer = null;
    const wasPaused = this.paused;
    this.paused = false;
    if (this.playing) this.stopAction(wasPaused || hard ? 0 : fade, hard);
    this.changed();
  }

  changed() { this.engine.emit('change', this.id); }

  /** Fortschritt für die Anzeige: { phase, elapsed, total } in Sekunden */
  progress() {
    const cue = this.cue;
    if (this.preTimer) return { phase: 'prewait', elapsed: this.preTimer.elapsed() / 1000, total: cue.preWait };
    if (this.playing) return { phase: 'running', ...this.actionProgress() };
    if (this.postTimer) return { phase: 'postwait', elapsed: this.postTimer.elapsed() / 1000, total: cue.postWait };
    return { phase: 'idle', elapsed: 0, total: this.duration() };
  }

  // --- von Unterklassen zu überschreiben ---
  start() { this.ended(true); }
  pauseAction() {}
  resumeAction() {}
  stopAction() { this.ended(false); }
  actionProgress() { return { elapsed: 0, total: 0 }; }
  duration() { return 0; }
  dispose() { this.stop(0, true); }
}

// ---------------------------------------------------------------------------

class AudioRunner extends Runner {
  constructor(engine, id) {
    super(engine, id);
    this.el = null;
    this.chain = null;
    this.mediaId = null;
    this.error = '';
    this.mediaDuration = 0;
    this.token = 0;
  }

  /** Lädt die Datei in ein <audio>-Element (gestreamt, nicht komplett dekodiert – spart Speicher). */
  prepare() {
    const cue = this.cue;
    if (this.el && this.mediaId === cue.mediaId) return this.ready;
    this._release();
    this.mediaId = cue.mediaId;
    this.error = '';
    if (!cue.mediaId) {
      this.error = 'Keine Datei';
      return (this.ready = Promise.resolve());
    }
    this.ready = (async () => {
      const url = await this.engine.mediaUrl(cue.mediaId);
      if (!url) { this.error = 'Datei fehlt'; return; }
      const el = new Audio();
      el.preload = 'auto';
      el.crossOrigin = 'anonymous';
      this.el = el;
      await new Promise((res) => {
        el.addEventListener('loadedmetadata', res, { once: true });
        el.addEventListener('error', () => { this.error = 'Datei nicht abspielbar'; res(); }, { once: true });
        el.src = url;
        el.load();
      });
      el.addEventListener('ended', () => { if (this.playing && !this.stopping) this._finish(true); });
      if (isFinite(el.duration)) {
        this.mediaDuration = el.duration;
        if (Math.abs((cue.duration || 0) - el.duration) > 0.05) {
          cue.duration = el.duration;
          this.engine.emit('duration', this.id);
        }
      }
      this.changed();
    })();
    return this.ready;
  }

  _release() {
    if (this.el) { this.el.pause(); this.el.removeAttribute('src'); this.el.load(); }
    this.chain?.src.disconnect();
    this.chain?.pan.disconnect();
    this.el = null;
    this.chain = null;
  }

  _ensureChain() {
    if (this.chain && this.chain.el === this.el) return;
    const ctx = this.engine.ctx;
    const src = ctx.createMediaElementSource(this.el);
    const vol = ctx.createGain();
    const env = ctx.createGain();
    const pan = ctx.createStereoPanner ? ctx.createStereoPanner() : ctx.createGain();
    src.connect(vol).connect(env).connect(pan).connect(this.engine.master);
    this.chain = { el: this.el, src, vol, env, pan };
  }

  bounds() {
    const cue = this.cue;
    const dur = this.mediaDuration || cue.duration || 0;
    const start = Math.min(Math.max(0, cue.start || 0), dur);
    const end = cue.end > 0 ? Math.min(cue.end, dur) : dur;
    return { start, end: Math.max(start, end) };
  }

  duration() {
    const { start, end } = this.bounds();
    return end - start;
  }

  async start() {
    const tok = ++this.token;
    await this.prepare();
    if (tok !== this.token || !this.playing) return;
    if (!this.el || this.error) {
      this.engine.emit('error', `${this.cue.name || 'Audio-Cue'}: ${this.error || 'Fehler'}`);
      this.ended(false);
      return;
    }
    const ctx = this.engine.ctx;
    this._ensureChain();
    const cue = this.cue;
    const { start, end } = this.bounds();
    const { vol, env, pan } = this.chain;
    const now = ctx.currentTime;
    vol.gain.cancelScheduledValues(now);
    vol.gain.setValueAtTime(dbToGain(cue.volume), now);
    if (pan.pan) pan.pan.setValueAtTime(cue.pan || 0, now);
    env.gain.cancelScheduledValues(now);
    env.gain.setValueAtTime(cue.fadeIn > 0 ? 0 : 1, now);
    if (cue.fadeIn > 0) rampParam(ctx, env.gain, 1, cue.fadeIn, cue.fadeCurve);
    this.fadingOut = false;
    // Nahtloser Loop nur ohne Trimmung möglich; sonst springt tick() zurück.
    this.el.loop = !!cue.loop && start === 0 && end >= this.mediaDuration - 0.01;
    this.el.currentTime = start;
    try {
      await this.el.play();
    } catch (e) {
      if (tok !== this.token) return;
      this.engine.emit('error', `Wiedergabe fehlgeschlagen: ${e.message}`);
      this.ended(false);
    }
  }

  /** Wird von der Engine regelmäßig aufgerufen. */
  tick() {
    if (!this.playing || this.paused || !this.el || !this.chain) return;
    const cue = this.cue;
    const { start, end } = this.bounds();
    const pos = this.el.currentTime;
    if (cue.loop) {
      if (!this.el.loop && pos >= end - 0.01) this.el.currentTime = start;
      return;
    }
    if (!this.stopping && !this.fadingOut && cue.fadeOut > 0 && pos >= end - cue.fadeOut) {
      this.fadingOut = true;
      rampParam(this.engine.ctx, this.chain.env.gain, 0, Math.max(0.01, end - pos), cue.fadeCurve);
    }
    if (pos >= end - 0.005) this._finish(true);
  }

  _finish(natural) {
    clearTimeout(this.stopH);
    clearTimeout(this.pauseH);
    this.pauseH = null;
    this.token++;
    this.el?.pause();
    this.ended(natural);
  }

  pauseAction(fade = 0) {
    if (!this.chain) { this.token++; return; }
    const ctx = this.engine.ctx;
    // Läuft noch ein Pause-Fade (schnelles Pause/Weiter/Pause), den ursprünglichen Pegel behalten.
    if (!this.pauseH) this.envBeforePause = this.chain.env.gain.value;
    const f = Math.max(DECLICK, fade);
    rampParam(ctx, this.chain.env.gain, 0, f, fade > 0 ? this.cue.fadeCurve : 'linear');
    clearTimeout(this.pauseH);
    this.pauseH = setTimeout(() => { this.pauseH = null; this.el?.pause(); }, f * 1000 + 10);
  }

  resumeAction(fade = 0) {
    clearTimeout(this.pauseH);
    this.pauseH = null;
    if (!this.chain) { this.start(); return; }
    const ctx = this.engine.ctx;
    this.fadingOut = false;
    if (this.el.paused) this.el.play().catch(() => {});
    const f = Math.max(DECLICK * 2, fade);
    rampParam(ctx, this.chain.env.gain, Math.max(0.0001, this.envBeforePause ?? 1), f, fade > 0 ? this.cue.fadeCurve : 'linear');
  }

  stopAction(fade, immediate) {
    if (immediate || !this.chain || !this.el || this.el.paused) { this._finish(false); return; }
    this.stopping = true;
    const f = Math.max(DECLICK, fade);
    rampParam(this.engine.ctx, this.chain.env.gain, 0, f, this.cue.fadeCurve);
    clearTimeout(this.stopH);
    this.stopH = setTimeout(() => this._finish(false), f * 1000 + 20);
  }

  /** Lautstärke-Fade (von Fade-Cues). */
  fadeVolume(db, dur, curve) {
    if (!this.chain || !this.playing) return false;
    rampParam(this.engine.ctx, this.chain.vol.gain, dbToGain(db), dur, curve);
    return true;
  }

  actionProgress() {
    const { start, end } = this.bounds();
    const pos = this.el ? this.el.currentTime : start;
    return { elapsed: Math.max(0, pos - start), total: end - start, loop: !!this.cue.loop };
  }

  dispose() {
    super.dispose();
    this._release();
  }
}

// ---------------------------------------------------------------------------

class TimedRunner extends Runner {
  /** Hilfsklasse für Aktionen mit Dauer (z. B. Fade). */
  runFor(sec, onDone) {
    this.actTimer = new Timer(sec * 1000, () => { this.actTimer = null; onDone?.(); this.ended(true); });
  }
  pauseAction() { this.actTimer?.pause(); }
  resumeAction() { this.actTimer?.resume(); }
  stopAction() { this.actTimer?.cancel(); this.actTimer = null; this.ended(false); }
  actionProgress() {
    return this.actTimer ? { elapsed: this.actTimer.elapsed() / 1000, total: this.actTimer.ms / 1000 } : { elapsed: 0, total: 0 };
  }
}

class FadeRunner extends TimedRunner {
  duration() { return this.cue.duration || 0; }
  start() {
    const cue = this.cue;
    const target = this.engine.runners.get(cue.target);
    if (!(target instanceof AudioRunner) || !target.fadeVolume(cue.volume, cue.duration, cue.fadeCurve)) {
      this.engine.emit('info', `${this.engine.label(cue)}: Ziel-Cue läuft nicht`);
      this.ended(true);
      return;
    }
    this.runFor(cue.duration, () => {
      if (cue.stopAfter && target.playing) target.stop(0, true);
    });
  }
}

class StopRunner extends Runner {
  start() {
    const cue = this.cue;
    const targets = cue.target ? [this.engine.runners.get(cue.target)] : [...this.engine.runners.values()];
    targets.forEach((r) => { if (r && r !== this && r.active) r.stop(cue.fade); });
    this.ended(true);
  }
}

class StartRunner extends Runner {
  start() {
    if (this.cue.target) this.engine.go(this.cue.target);
    this.ended(true);
  }
}

class PauseRunner extends Runner {
  start() {
    const cue = this.cue;
    const targets = cue.target ? [this.engine.runners.get(cue.target)] : [...this.engine.runners.values()];
    targets.forEach((r) => {
      if (!r || r === this || !r.active) return;
      const doPause = cue.mode === 'pause' || (cue.mode === 'toggle' && !r.paused);
      doPause ? r.pause(cue.fadeOut || 0) : r.resume(cue.fadeIn || 0);
    });
    this.ended(true);
  }
}

class MidiRunner extends Runner {
  start() {
    const cue = this.cue;
    const midi = this.engine.midi;
    if (!midi?.enabled) {
      this.engine.emit('error', 'MIDI ist nicht aktiviert (Einstellungen)');
    } else if (!midi.send(cue.output, midiBytes(cue))) {
      this.engine.emit('error', 'Kein MIDI-Ausgang verfügbar');
    }
    this.ended(true);
  }
}

const RUNNERS = { audio: AudioRunner, fade: FadeRunner, stop: StopRunner, start: StartRunner, pause: PauseRunner, midi: MidiRunner, memo: Runner };

// ---------------------------------------------------------------------------

export class Engine extends Emitter {
  constructor({ loadMedia, midi }) {
    super();
    this.loadMedia = loadMedia; // async (mediaId) => Blob | null
    this.midi = midi;
    this.ctx = null;
    this.master = null;
    this.session = null;
    this.runners = new Map();
    this.urls = new Map();
    this.labelFn = (c) => c.name || c.type;
    setInterval(() => this._tick(), 20);
  }

  /** Muss aus einer Benutzeraktion heraus aufgerufen werden (Autoplay-Richtlinien). */
  ensureContext() {
    if (!this.ctx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      this.ctx = new Ctx({ latencyHint: 'interactive' });
      this.master = this.ctx.createGain();
      this.master.connect(this.ctx.destination);
      this.setMaster(this.session?.settings.masterDb ?? 0);
      if (this.session?.settings.sinkId) this.setSink(this.session.settings.sinkId).catch(() => {});
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    return this.ctx;
  }

  setSession(session) {
    this.runners.forEach((r) => r.dispose());
    this.runners.clear();
    this.urls.forEach((u) => URL.revokeObjectURL(u));
    this.urls.clear();
    this.session = session;
    if (this.master) this.setMaster(session.settings.masterDb);
    session.cues.forEach((c) => this.runner(c.id));
    // Audio vorladen
    this.preloadAll();
  }

  preloadAll() {
    this.session.cues.filter((c) => c.type === 'audio').forEach((c) => this.runner(c.id)?.prepare());
  }

  cue(id) { return this.session?.cues.find((c) => c.id === id); }
  label(cue) { return this.labelFn(cue); }

  runner(id) {
    let r = this.runners.get(id);
    const cue = this.cue(id);
    if (!cue) return null;
    const Cls = RUNNERS[cue.type] || Runner;
    if (r && !(r.constructor === Cls)) { r.dispose(); r = null; }
    if (!r) { r = new Cls(this, id); this.runners.set(id, r); }
    return r;
  }

  /** Nach dem Bearbeiten eines Cues aufrufen. */
  cueChanged(id) {
    const r = this.runner(id);
    if (r instanceof AudioRunner && !r.active) r.prepare();
  }

  removeCue(id) {
    this.runners.get(id)?.dispose();
    this.runners.delete(id);
  }

  async mediaUrl(mediaId) {
    if (this.urls.has(mediaId)) return this.urls.get(mediaId);
    const blob = await this.loadMedia(mediaId);
    if (!blob) return null;
    const url = URL.createObjectURL(blob);
    this.urls.set(mediaId, url);
    return url;
  }

  go(id) {
    this.ensureContext();
    const r = this.runner(id);
    if (!r) return;
    r.go();
    this.emit('go', id);
  }

  triggerNext(id) {
    const cues = this.session.cues;
    const i = cues.findIndex((c) => c.id === id);
    if (i >= 0 && i + 1 < cues.length) this.go(cues[i + 1].id);
  }

  stop(id, fade = 0) { this.runners.get(id)?.stop(fade); }
  pause(id, fade = 0) { this.runners.get(id)?.pause(fade); }
  resume(id, fade = 0) { this.runners.get(id)?.resume(fade); }

  active() { return [...this.runners.values()].filter((r) => r.active); }

  stopAll(fade = 0) { this.active().forEach((r) => r.stop(fade)); }
  pauseAll(fade = 0) { this.active().forEach((r) => r.pause(fade)); }
  resumeAll(fade = 0) { this.active().forEach((r) => r.resume(fade)); }

  setMaster(db) {
    if (!this.master) return;
    this.master.gain.setTargetAtTime(dbToGain(db), this.ctx.currentTime, 0.02);
  }

  /** Audioausgang wählen (Chrome/Edge 110+). */
  async setSink(sinkId) {
    if (!this.ctx?.setSinkId) throw new Error('Ausgabegerät-Auswahl wird nicht unterstützt');
    await this.ctx.setSinkId(sinkId || '');
  }

  _tick() {
    this.runners.forEach((r) => r.tick?.());
  }
}
