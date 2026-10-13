// Datenmodell: Session und Cue-Typen.
import { uid } from './util.js';
import { firstLine } from './md.js';

export const SESSION_VERSION = 1;

export const CUE_TYPES = {
  audio: { label: 'Audio', icon: '♪' },
  fade: { label: 'Fade', icon: '◢' },
  startstop: { label: 'Start / Stop', icon: '▶■' },
  pause: { label: 'Pause', icon: '❚❚' },
  midi: { label: 'MIDI', icon: '⎍' },
  memo: { label: 'Memo', icon: '✎' },
};

export const NEXT_ACTIONS = {
  none: 'Keine',
  continue: 'Auto-Continue',
  follow: 'Auto-Follow',
};

export function newSession(name = 'Neue Show') {
  return {
    version: SESSION_VERSION,
    id: uid(),
    name,
    updated: Date.now(),
    settings: {
      layout: 'list',
      showMode: false,
      confirmEdit: true,
      cartColumns: 4,
      goLockMs: 300,
      stopAllFade: 1.5,
      pauseAllFade: 0,
      masterDb: 0,
      midi: { enabled: false, go: '', stopAll: '' },
      wakeLock: true,
      sinkId: '',
    },
    cues: [],
  };
}

export function newCue(type, extra = {}) {
  const base = {
    id: uid(),
    type,
    name: '',
    color: '',
    preWait: 0,
    postWait: 0,
    nextAction: 'none',
    hotkey: '',
    midiTrigger: '',
    notes: '',
  };
  const specific = {
    audio: { mediaId: null, mediaName: '', duration: 0, volume: 0, pan: 0, start: 0, end: 0, fadeIn: 0, fadeOut: 0, fadeCurve: 'log', loop: false },
    fade: { target: '', volume: -60, duration: 3, fadeCurve: 'log', stopAfter: true },
    startstop: { target: '', mode: 'toggle', fade: 0 },
    pause: { target: '', mode: 'toggle', fadeOut: 0, fadeIn: 0 },
    midi: { output: '', msg: 'noteon', channel: 1, data1: 60, data2: 127 },
    memo: {},
  }[type];
  return { ...base, ...specific, ...extra };
}

/** Macht aus einem Cue eine Preset-Vorlage: ohne Identität, Trigger und festes Ziel. */
export function cueToPreset(cue, name) {
  const { id, hotkey, midiTrigger, ...rest } = structuredClone(cue);
  if ('target' in rest) rest.target = '';
  return { id: uid(), name, cue: rest, created: Date.now() };
}

/** Standard-Presets beim ersten Start. */
export function defaultPresets() {
  return [
    cueToPreset(newCue('fade', { volume: -60, duration: 3, stopAfter: true }), 'Ausblenden 3 s + Stop'),
    cueToPreset(newCue('fade', { volume: -15, duration: 3, stopAfter: false }), 'Musik unter Text (−15 dB, 3 s)'),
    cueToPreset(newCue('pause', { mode: 'toggle', fadeOut: 2, fadeIn: 2 }), 'Pause/Weiter mit Fade 2 s'),
    cueToPreset(newCue('startstop', { target: '', mode: 'stop', fade: 5 }), 'Alles ausblenden 5 s'),
  ];
}

/** Wandelt Cues älterer Versionen um (v0.2: getrennte Start- und Stop-Cues → Start/Stop). */
export function migrateCue(c) {
  if (c.type === 'start' || c.type === 'stop') return { ...c, type: 'startstop', mode: c.type, fade: c.fade ?? 0 };
  return c;
}

/** Ergänzt fehlende Felder (z. B. nach Import älterer Shows). */
export function normalizeSession(s) {
  const def = newSession();
  s.settings = { ...def.settings, ...s.settings, midi: { ...def.settings.midi, ...s.settings?.midi } };
  s.cues = (s.cues || []).map(migrateCue).map((c) => ({ ...newCue(c.type), ...c }));
  return s;
}

export function cueDisplayName(session, cue) {
  if (cue.name) return cue.name;
  const t = session.cues.find((c) => c.id === cue.target);
  const tn = t ? `#${session.cues.indexOf(t) + 1}` : '';
  switch (cue.type) {
    case 'audio': return cue.mediaName || 'Audio (keine Datei)';
    case 'fade': return `Fade ${tn || '?'} → ${cue.volume <= -60 ? '−∞' : cue.volume + ' dB'}`;
    case 'startstop': return `${{ toggle: 'Start/Stop', start: 'Start', stop: 'Stop' }[cue.mode]} ${tn || (cue.mode === 'start' ? '?' : 'alle')}`;
    case 'pause': return `${{ toggle: 'Pause/Weiter', pause: 'Pause', resume: 'Weiter' }[cue.mode]} ${tn || 'alle'}`;
    case 'midi': return `MIDI ${cue.msg} ${cue.data1}`;
    case 'memo': return firstLine(cue.notes) || 'Memo';
    default: return CUE_TYPES[cue.type]?.label ?? cue.type;
  }
}
