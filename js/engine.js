// Wiedergabe-Engine: Cue-Ablauf (Pre-Wait, Post-Wait, Auto-Continue/-Follow) und Audio über Web Audio.
import { Emitter, Timer, clamp, dbToGain, rampParam } from './util.js';
import { midiBytes } from './midi.js';
import { blockPeak, waveformPeaks, WAVEFORM_MAX_SEC } from './meter.js';

const DECLICK = 0.015; // s – kurze Rampe gegen Knackser bei Pause/Stop

/** Wellenform: Anzahl der Abschnitte und Abtastrate beim Dekodieren (niedrig, spart Speicher). */
const WAVE_BUCKETS = 2000;
const WAVE_RATE = 11025;

const peakBuf = new Float32Array(2048);
/** Spitzenwert (linear) der letzten fftSize Samples eines AnalyserNodes. */
function analyserPeak(a) {
  const b = peakBuf.subarray(0, a.fftSize);
  a.getFloatTimeDomainData(b);
  return blockPeak(b);
}

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
    if (cue.nextAction === 'continue') this._startPostWait();
    this.changed();
    this.start();
  }

  _startPostWait() {
    this.postTimer = new Timer((this.cue.postWait || 0) * 1000, () => this._postDone());
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
    if (natural && this.cue?.nextAction === 'follow') this._startPostWait();
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
    this.token = 0; // macht veraltete asynchrone Starts ungültig
    this.ready = null;
    this.fadingOut = false;
    this.stopH = null; // Timeout bis zum Ende eines Stop-Fades
    this.pauseH = null; // Timeout bis zum Anhalten nach einem Pause-Fade
    this.envBeforePause = null;
    this.dipToken = 0; // macht veraltete Einblendungen nach dem Springen ungültig
    this.dipH = null;
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
    const dip = ctx.createGain(); // kurzes Aus-/Einblenden beim Springen, unabhängig von den Fades in env
    src.connect(vol).connect(env).connect(dip).connect(pan).connect(this.engine.master);
    // Abgriff für die Pegelanzeige im Aktiv-Bereich (nach Lautstärke, Fades und Panorama)
    const meter = ctx.createAnalyser();
    meter.fftSize = 512;
    pan.connect(meter);
    this.chain = { el: this.el, src, vol, env, dip, pan, meter };
  }

  bounds() {
    const cue = this.cue;
    const dur = this.mediaDuration || cue.duration || 0;
    const start = clamp(cue.start || 0, 0, dur);
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
    const { vol, env, dip, pan } = this.chain;
    const now = ctx.currentTime;
    this.dipToken++; // eine noch ausstehende Einblendung vom Springen verwerfen
    clearTimeout(this.dipH);
    dip.gain.cancelScheduledValues(now);
    dip.gain.setValueAtTime(1, now);
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
    // Läuft noch ein Pause-Fade (schnelles Pause/Weiter/Pause), den ursprünglichen Pegel behalten.
    if (!this.pauseH) this.envBeforePause = this.chain.env.gain.value;
    const f = Math.max(DECLICK, fade);
    rampParam(this.engine.ctx, this.chain.env.gain, 0, f, fade > 0 ? this.cue.fadeCurve : 'linear');
    clearTimeout(this.pauseH);
    this.pauseH = setTimeout(() => { this.pauseH = null; this.el?.pause(); }, f * 1000 + 10);
  }

  resumeAction(fade = 0) {
    clearTimeout(this.pauseH);
    this.pauseH = null;
    if (!this.chain) { this.start(); return; }
    this.fadingOut = false;
    if (this.el.paused) this.el.play().catch(() => {});
    const f = Math.max(DECLICK * 2, fade);
    rampParam(this.engine.ctx, this.chain.env.gain, Math.max(0.0001, this.envBeforePause ?? 1), f, fade > 0 ? this.cue.fadeCurve : 'linear');
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

  /** Laufenden Lautstärke-Fade auf dem aktuellen Wert anhalten (Fade-Cue pausiert). */
  holdVolume() {
    if (!this.chain) return;
    const g = this.chain.vol.gain, now = this.engine.ctx.currentTime;
    // cancelScheduledValues(now) ließe eine schon laufende Kurve weiterlaufen; Firefox kennt cancelAndHoldAtTime nicht.
    if (g.cancelAndHoldAtTime) g.cancelAndHoldAtTime(now);
    else {
      const v = g.value;
      g.cancelScheduledValues(0);
      g.setValueAtTime(v, now);
    }
  }

  /** Springen ist möglich, solange die Datei läuft oder pausiert ist (nicht in Pre-/Post-Wait oder beim Stoppen). */
  canSeek() {
    return this.playing && !!this.chain && !!this.el && !this.stopping;
  }

  /** An Position t (Sekunden in der Datei) springen, begrenzt auf den getrimmten Bereich. */
  seek(t) {
    if (!this.canSeek()) return false;
    const { start, end } = this.bounds();
    const pos = clamp(t, start, end);
    if (!this.el.paused) this._dipAround();
    this.el.currentTime = pos;
    // Lief schon der Fade-Out am Ende: vor dessen Beginn wieder voll, sonst blendet tick() ab hier neu aus.
    if (this.fadingOut) {
      this.fadingOut = false;
      if (pos < end - this.cue.fadeOut) {
        if (this.paused) this.envBeforePause = 1;
        else rampParam(this.engine.ctx, this.chain.env.gain, 1, DECLICK * 2, 'linear');
      }
    }
    return true;
  }

  /**
   * Gegen Knacken beim Springen: sofort kurz ausblenden; das Element braucht ohnehin einige Millisekunden für den
   * Sprung. Nach 'seeked' (spätestens nach 250 ms) wieder einblenden. Schnelle Folgen blenden erst nach dem letzten ein.
   */
  _dipAround() {
    const ctx = this.engine.ctx, g = this.chain.dip.gain, el = this.el;
    const now = ctx.currentTime;
    g.cancelScheduledValues(now);
    g.setValueAtTime(g.value, now);
    g.linearRampToValueAtTime(0, now + DECLICK / 3);
    const tok = ++this.dipToken;
    const back = () => {
      if (tok !== this.dipToken || !this.chain) return;
      clearTimeout(this.dipH);
      el.removeEventListener('seeked', back);
      const t = ctx.currentTime;
      g.cancelScheduledValues(t);
      g.setValueAtTime(g.value, t);
      g.linearRampToValueAtTime(1, t + DECLICK);
    };
    clearTimeout(this.dipH);
    this.dipH = setTimeout(back, 250);
    el.addEventListener('seeked', back, { once: true });
  }

  /** Aktueller Spitzenwert (linear) dieses Cues, 0 ohne Wiedergabe. */
  level() {
    return this.chain && this.playing ? analyserPeak(this.chain.meter) : 0;
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

/** Basisklasse für Aktionen mit Dauer (z. B. Fade). */
class TimedRunner extends Runner {
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
    this.target = target;
    this.runFor(cue.duration, () => {
      if (cue.stopAfter && target.playing) target.stop(0, true);
    });
  }

  /** Pause friert die Lautstärke des Ziels ein … */
  pauseAction() {
    super.pauseAction();
    this.target?.holdVolume();
  }

  /** … „Weiter“ blendet ab dort mit der Restdauer und derselben Kurve zum Zielwert (endet zur angezeigten Zeit). */
  resumeAction() {
    super.resumeAction();
    if (!this.actTimer || !this.target) return;
    const rest = Math.max(0, (this.actTimer.ms - this.actTimer.elapsed()) / 1000);
    this.target.fadeVolume(this.cue.volume, rest, this.cue.fadeCurve); // Ziel inzwischen beendet: tut nichts
  }

  stopAction() {
    this.target = null;
    super.stopAction();
  }
}

/** Start/Stop-Cue. mode: 'start' | 'stop' | 'toggle' (läuft das Ziel → stoppen, sonst starten). Ziel leer = alle laufenden (nur Stop). */
class StartStopRunner extends Runner {
  start() {
    const cue = this.cue;
    const others = () => [...this.engine.runners.values()].filter((r) => r !== this && r.active);
    if (!cue.target) {
      if (cue.mode === 'start') this.engine.emit('info', `${this.engine.label(cue)}: kein Ziel-Cue gewählt`);
      else others().forEach((r) => r.stop(cue.fade));
    } else {
      const target = this.engine.runner(cue.target);
      const stop = cue.mode === 'stop' || (cue.mode === 'toggle' && target?.active && !target.paused);
      if (!stop) this.engine.go(cue.target);
      else if (target?.active) target.stop(cue.fade);
    }
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
      if (doPause) r.pause(cue.fadeOut || 0);
      else r.resume(cue.fadeIn || 0);
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

const RUNNERS = { audio: AudioRunner, fade: FadeRunner, startstop: StartStopRunner, pause: PauseRunner, midi: MidiRunner, memo: Runner };

// ---------------------------------------------------------------------------

export class Engine extends Emitter {
  constructor({ loadMedia, midi }) {
    super();
    this.loadMedia = loadMedia; // async (mediaId) => Blob | null
    this.midi = midi;
    this.ctx = null;
    this.master = null;
    this.meters = null; // AnalyserNodes L/R am Master
    this.session = null;
    this.runners = new Map();
    this.urls = new Map();
    this.waves = new Map(); // mediaId -> Promise<Float32Array | null>
    this.labelFn = (c) => c.name || c.type;
    // Ende-Erkennung, Loop-Sprünge und Fade-Out am Ende der Audio-Cues
    setInterval(() => this.runners.forEach((r) => r.tick?.()), 20);
  }

  /** Muss aus einer Benutzeraktion heraus aufgerufen werden (Autoplay-Richtlinien). */
  ensureContext() {
    if (!this.ctx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      this.ctx = new Ctx({ latencyHint: 'interactive' });
      this.master = this.ctx.createGain();
      // Immer stereo, damit Mono-Quellen auf beiden Kanälen der Pegelanzeige erscheinen
      Object.assign(this.master, { channelCount: 2, channelCountMode: 'explicit', channelInterpretation: 'speakers' });
      this.master.connect(this.ctx.destination);
      // Pegelanzeige nach der Master-Lautstärke: zeigt, was wirklich rausgeht
      const split = this.ctx.createChannelSplitter(2);
      this.master.connect(split);
      this.meters = [0, 1].map((ch) => {
        const a = this.ctx.createAnalyser();
        a.fftSize = 1024;
        split.connect(a, ch);
        return a;
      });
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
    this.waves.clear();
    this.session = session;
    if (this.master) this.setMaster(session.settings.masterDb);
    // Runner anlegen und Audio vorladen
    session.cues.forEach((c) => {
      const r = this.runner(c.id);
      if (c.type === 'audio') r.prepare();
    });
  }

  cue(id) { return this.session?.cues.find((c) => c.id === id); }
  label(cue) { return this.labelFn(cue); }

  runner(id) {
    let r = this.runners.get(id);
    const cue = this.cue(id);
    if (!cue) return null;
    const Cls = RUNNERS[cue.type] || Runner;
    if (r && r.constructor !== Cls) { r.dispose(); r = null; }
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

  /**
   * Wellenform einer Mediendatei (WAVE_BUCKETS Spitzenwerte), einmal berechnet und gecacht.
   * null bei fehlender oder nicht dekodierbarer Datei und bei Dateien über WAVEFORM_MAX_SEC.
   */
  waveform(mediaId, duration) {
    if (!mediaId || !(duration > 0) || duration > WAVEFORM_MAX_SEC) return Promise.resolve(null);
    if (!this.waves.has(mediaId)) this.waves.set(mediaId, this._decodeWave(mediaId));
    return this.waves.get(mediaId);
  }

  async _decodeWave(mediaId) {
    try {
      const blob = await this.loadMedia(mediaId);
      if (!blob) return null;
      const Off = window.OfflineAudioContext || window.webkitOfflineAudioContext;
      const buf = await new Off(1, 1, WAVE_RATE).decodeAudioData(await blob.arrayBuffer());
      const chans = Array.from({ length: buf.numberOfChannels }, (_, i) => buf.getChannelData(i));
      return waveformPeaks(chans, WAVE_BUCKETS);
    } catch {
      return null; // z. B. Video-Container ohne dekodierbare Tonspur: normaler Balken
    }
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

  active() { return [...this.runners.values()].filter((r) => r.active); }

  stopAll(fade = 0) { this.active().forEach((r) => r.stop(fade)); }
  pauseAll(fade = 0) { this.active().forEach((r) => r.pause(fade)); }
  resumeAll(fade = 0) { this.active().forEach((r) => r.resume(fade)); }

  /** Spitzenwerte (linear) links/rechts am Master; vor dem ersten GO (ohne AudioContext) [0, 0]. */
  masterPeaks() {
    return this.meters ? this.meters.map(analyserPeak) : [0, 0];
  }

  setMaster(db) {
    if (!this.master) return;
    this.master.gain.setTargetAtTime(dbToGain(db), this.ctx.currentTime, 0.02);
  }

  /** Audioausgang wählen (Chrome/Edge 110+). */
  async setSink(sinkId) {
    if (!this.ctx?.setSinkId) throw new Error('Ausgabegerät-Auswahl wird nicht unterstützt');
    await this.ctx.setSinkId(sinkId || '');
  }
}
