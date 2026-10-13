// Datenmodell: Session und Cue-Typen.
import { uid } from './util.js';

export const SESSION_VERSION = 1;

export const CUE_TYPES = {
  audio: { label: 'Audio', icon: '♪' },
  fade: { label: 'Fade', icon: '◢' },
  stop: { label: 'Stop', icon: '■' },
  start: { label: 'Start', icon: '▶' },
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
      cartColumns: 4,
      goLockMs: 300,
      stopAllFade: 1.5,
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
    stop: { target: '', fade: 0 },
    start: { target: '' },
    pause: { target: '', mode: 'toggle' },
    midi: { output: '', msg: 'noteon', channel: 1, data1: 60, data2: 127 },
    memo: {},
  }[type];
  return { ...base, ...specific, ...extra };
}

/** Ergänzt fehlende Felder (z. B. nach Import älterer Shows). */
export function normalizeSession(s) {
  const def = newSession();
  s.settings = { ...def.settings, ...s.settings, midi: { ...def.settings.midi, ...s.settings?.midi } };
  s.cues = (s.cues || []).map((c) => ({ ...newCue(c.type), ...c }));
  return s;
}

export function cueDisplayName(session, cue) {
  if (cue.name) return cue.name;
  const t = session.cues.find((c) => c.id === cue.target);
  const tn = t ? `#${session.cues.indexOf(t) + 1}` : '';
  switch (cue.type) {
    case 'audio': return cue.mediaName || 'Audio (keine Datei)';
    case 'fade': return `Fade ${tn || '?'} → ${cue.volume <= -60 ? '−∞' : cue.volume + ' dB'}`;
    case 'stop': return `Stop ${tn || 'alle'}`;
    case 'start': return `Start ${tn || '?'}`;
    case 'pause': return `${{ toggle: 'Pause/Weiter', pause: 'Pause', resume: 'Weiter' }[cue.mode]} ${tn || 'alle'}`;
    case 'midi': return `MIDI ${cue.msg} ${cue.data1}`;
    default: return CUE_TYPES[cue.type]?.label ?? cue.type;
  }
}
