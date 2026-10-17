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

/** Typspezifische Standardwerte (nur primitive Werte, daher gefahrlos per Spread kopierbar). */
const CUE_DEFAULTS = {
  audio: { mediaId: null, mediaName: '', duration: 0, volume: 0, pan: 0, start: 0, end: 0, fadeIn: 0, fadeOut: 0, fadeCurve: 'log', loop: false },
  fade: { target: '', volume: -60, duration: 3, fadeCurve: 'log', stopAfter: true },
  startstop: { target: '', mode: 'toggle', fade: 0 },
  pause: { target: '', mode: 'toggle', fadeOut: 0, fadeIn: 0 },
  midi: { output: '', msg: 'noteon', channel: 1, data1: 60, data2: 127 },
  memo: { confirm: false },
};

export function newCue(type, extra = {}) {
  return {
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
    ...CUE_DEFAULTS[type],
    ...extra,
  };
}

/**
 * Macht aus Cues eine Vorlage (Preset oder Kopiervorlage): ohne Identität und Trigger.
 * Ziele auf Cues innerhalb der Auswahl werden zu Platzhaltern '#<Index>', damit sie beim Einfügen erhalten bleiben.
 * Ziele außerhalb: leer (Preset) bzw. unverändert (keepExternal, z. B. beim Klonen).
 */
export function cuesToTemplates(list, { keepExternal = false } = {}) {
  const idx = new Map(list.map((c, i) => [c.id, i]));
  return list.map((c) => {
    const { id, hotkey, midiTrigger, ...rest } = structuredClone(c);
    if ('target' in rest && rest.target) {
      rest.target = idx.has(rest.target) ? `#${idx.get(rest.target)}` : (keepExternal ? rest.target : '');
    }
    return rest;
  });
}

export function cuesToPreset(list, name) {
  return { id: uid(), name, cues: cuesToTemplates(list), created: Date.now() };
}

export const cueToPreset = (cue, name) => cuesToPreset([cue], name);

/** Erzeugt neue Cues aus Vorlagen. '#k'-Ziele zeigen danach auf die neuen Cues; leere Fade-/Start-Ziele auf prevId. */
export function instantiateCues(templates, prevId = null) {
  const created = templates.map((t) => ({ ...newCue(t.type), ...structuredClone(t), id: uid() }));
  created.forEach((c) => {
    if (!('target' in c)) return;
    if (typeof c.target === 'string' && c.target.startsWith('#')) c.target = created[Number(c.target.slice(1))]?.id ?? '';
    else if (!c.target && prevId && (c.type === 'fade' || (c.type === 'startstop' && c.mode === 'start'))) c.target = prevId;
  });
  return created;
}

/** Presets älterer Versionen (ein Cue unter `cue`) auf das Mehr-Cue-Format `cues` bringen. */
export function migratePreset(p) {
  if (!p.cues && p.cue) p.cues = [p.cue];
  delete p.cue;
  p.cues = (p.cues || []).map(migrateCue);
  return p;
}

/** Standard-Presets beim ersten Start. */
export function defaultPresets() {
  return [
    cueToPreset(newCue('fade', { volume: -60, duration: 3, stopAfter: true }), 'Ausblenden 3 s + Stop'),
    cueToPreset(newCue('fade', { volume: -15, duration: 3, stopAfter: false }), 'Musik unter Text (−15 dB, 3 s)'),
    cueToPreset(newCue('pause', { mode: 'toggle', fadeOut: 2, fadeIn: 2 }), 'Pause/Weiter mit Fade 2 s'),
    cueToPreset(newCue('startstop', { target: '', mode: 'stop', fade: 5 }), 'Alles ausblenden 5 s'),
    cuesToPreset([
      newCue('startstop', { target: '', mode: 'stop', fade: 3 }),
      newCue('memo', { name: 'Umbau', notes: '! Erst GO nach Freigabe durch die Bühne', confirm: true }),
    ], 'Szenenwechsel: alles ausblenden + Umbau (bestätigen)'),
  ];
}

/** Wandelt Cues älterer Versionen um (v0.2: getrennte Start- und Stop-Cues → Start/Stop). */
export function migrateCue(c) {
  if (c.type === 'start' || c.type === 'stop') return { ...c, type: 'startstop', mode: c.type, fade: c.fade ?? 0 };
  return c;
}

/** Nur Farben als #rgb/#rrggbb: Die Farbe landet als CSS-Wert in der Seite, url(…) aus einer fremden Show lüde fremde Server. */
const safeColor = (c) => (typeof c === 'string' && /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(c) ? c : '');

/** Ergänzt fehlende Felder (z. B. nach Import älterer Shows). */
export function normalizeSession(s) {
  const def = newSession();
  s.settings = { ...def.settings, ...s.settings, midi: { ...def.settings.midi, ...s.settings?.midi } };
  s.cues = (s.cues || []).map(migrateCue).map((c) => ({ ...newCue(c.type), ...c, color: safeColor(c.color) }));
  return s;
}

export function cueDisplayName(session, cue) {
  if (cue.name) return cue.name;
  const ti = session.cues.findIndex((c) => c.id === cue.target);
  const tn = ti >= 0 ? `#${ti + 1}` : '';
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
