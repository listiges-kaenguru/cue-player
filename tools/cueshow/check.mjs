// Strenge Prüfung einer Show. Strenger als validShow() der App: Typen, Bereiche, Ziele, Medien, wahrscheinliche Versehen.
// Fehler: Die App würde ablehnen, falsch abspielen oder Werte still ersetzen. Warnung: wahrscheinlich ein Versehen.
import { CUE_TYPES, NEXT_ACTIONS, SESSION_VERSION, newCue, newSession, migrateCue } from '../../js/model.js';
import { MIN_DB } from '../../js/util.js';

export const MARK = '<!-- cue:';
const MAX_DB = 12;
const MASTER_MAX_DB = 6;
const LONG_WAIT = 3600;
const BIG_FILE = 1024 ** 3;

const TIMES = {
  all: ['preWait', 'postWait'],
  audio: ['duration', 'start', 'end', 'fadeIn', 'fadeOut'],
  fade: ['duration'],
  startstop: ['fade'],
  pause: ['fadeOut', 'fadeIn'],
};
const TEXTS = ['name', 'notes', 'hotkey', 'midiTrigger', 'color', 'mediaName', 'output'];
const BOOLS = ['loop', 'stopAfter', 'confirm'];
const CHOICES = {
  fadeCurve: ['log', 'linear'],
  msg: ['noteon', 'noteoff', 'cc', 'pc'],
};
const MODES = { startstop: ['toggle', 'start', 'stop'], pause: ['toggle', 'pause', 'resume'] };
const INTS = { channel: [1, 16], data1: [0, 127], data2: [0, 127] };
const COLOR = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

const isObj = (v) => typeof v === 'object' && v !== null && !Array.isArray(v);
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const show = (v) => (typeof v === 'string' ? `„${v}“` : JSON.stringify(v) ?? String(v));
const shortId = (id) => (typeof id === 'string' && id.length > 8 ? id.slice(0, 8) + '…' : String(id));

/** Prüft eine geöffnete Show ({ header, blobs }). Ergebnis: [{ stufe: 'fehler'|'warnung', ort, text }]. */
export function checkShow({ header, blobs }) {
  const out = [];
  const add = (stufe, ort, text) => out.push({ stufe, ort, text });
  const s = header.session;

  // Show
  if (!Number.isInteger(s.version) || s.version < 1 || s.version > SESSION_VERSION) {
    add('fehler', 'Show · version', `${show(s.version)} wird nicht unterstützt (1 … ${SESSION_VERSION})`);
  }
  if (typeof s.name !== 'string') add('fehler', 'Show · name', 'kein Text');
  if (typeof s.id !== 'string' || !s.id) add('fehler', 'Show · id', 'fehlt oder ist kein Text');

  // Medien
  const mediaIds = new Map();
  header.media.forEach((m, i) => {
    if (mediaIds.has(m.id)) add('fehler', `media[${i}]`, `id ${show(m.id)} doppelt (wie media[${mediaIds.get(m.id)}])`);
    else mediaIds.set(m.id, i);
    if ((blobs.get(m.id)?.size ?? 0) > BIG_FILE) add('warnung', `media[${i}]`, `„${m.name}“ ist sehr groß (über 1 GB)`);
  });
  const placed = header.media.map((m, i) => ({ ...m, i })).filter((m) => isNum(m.offset) && m.length > 0)
    .sort((a, b) => a.offset - b.offset);
  for (let k = 1; k < placed.length; k++) {
    const prev = placed[k - 1];
    if (placed[k].offset < prev.offset + prev.length) add('fehler', `media[${placed[k].i}]`, `überlappt mit media[${prev.i}]`);
  }
  const usedMedia = new Set(s.cues.map((c) => c.mediaId));
  header.media.forEach((m, i) => {
    if (!usedMedia.has(m.id)) add('warnung', `media[${i}]`, `„${m.name}“: keine Cue nutzt dieses Medium (pack lässt es weg)`);
  });

  // Cues
  const ids = new Map();
  s.cues.forEach((c, i) => { if (typeof c.id === 'string' && c.id && !ids.has(c.id)) ids.set(c.id, i); });
  const hotkeys = new Map();
  const triggers = new Map();
  const midiGo = s.settings?.midi?.go;
  const midiStop = s.settings?.midi?.stopAll;

  s.cues.forEach((orig, i) => {
    const ort = (f) => `Cue ${i + 1} (id ${shortId(orig.id)}) · ${f}`;
    const e = (f, t) => add('fehler', ort(f), t);
    const w = (f, t) => add('warnung', ort(f), t);

    if (typeof orig.id !== 'string' || !orig.id) e('id', 'fehlt oder ist kein Text');
    else if (ids.get(orig.id) !== i) e('id', `doppelt (wie Cue ${ids.get(orig.id) + 1})`);

    let c = orig;
    if (orig.type === 'start' || orig.type === 'stop') {
      w('type', `${show(orig.type)} ist veraltet und wird beim Import zu Start/Stop umgewandelt`);
      c = migrateCue(orig);
    } else if (!(orig.type in CUE_TYPES)) {
      e('type', `unbekannter Cue-Typ ${show(orig.type)} (erlaubt: ${Object.keys(CUE_TYPES).join(', ')})`);
      return;
    }
    const def = newCue(c.type);
    for (const k of Object.keys(c)) if (!(k in def)) w(k, 'unbekanntes Feld (Tippfehler?)');
    for (const k of Object.keys(def)) if (!(k in c) && k !== 'id') w(k, `fehlt, die App nimmt ${show(def[k])}`);
    const has = (k) => k in c && k in def;

    for (const k of TEXTS) if (has(k) && typeof c[k] !== 'string') e(k, 'kein Text');
    if (typeof c.color === 'string' && c.color && !COLOR.test(c.color)) e('color', `${show(c.color)}: nur #rgb oder #rrggbb (die App ersetzt sonst durch keine Farbe)`);
    for (const k of ['name', 'notes']) if (typeof c[k] === 'string' && c[k].includes(MARK)) w(k, `enthält ${show(MARK)}, das bringt texts durcheinander`);

    for (const k of [...TIMES.all, ...(TIMES[c.type] ?? [])]) {
      if (!has(k)) continue;
      if (!isNum(c[k]) || c[k] < 0) e(k, `${show(c[k])}: Zahl ≥ 0 erwartet (Sekunden)`);
      else if (TIMES.all.includes(k) && c[k] > LONG_WAIT) w(k, `${c[k]} s ist länger als 1 h (Einheit richtig?)`);
    }
    if (c.type === 'audio' && isNum(c.start) && isNum(c.end) && c.end !== 0 && c.end <= c.start) {
      e('end', `Ende (${c.end} s) muss nach dem Start (${c.start} s) liegen oder 0 sein`);
    }
    if (has('volume')) {
      if (!isNum(c.volume)) e('volume', `${show(c.volume)}: Zahl erwartet (dB)`);
      else if (c.volume < MIN_DB || c.volume > MAX_DB) w('volume', `${c.volume} dB liegt außerhalb von −60 … +12 dB (Regler im Editor)`);
    }
    if (has('pan') && (!isNum(c.pan) || c.pan < -1 || c.pan > 1)) e('pan', `${show(c.pan)}: Zahl von −1 bis 1 erwartet`);
    for (const [k, [lo, hi]] of Object.entries(INTS)) {
      if (has(k) && (!Number.isInteger(c[k]) || c[k] < lo || c[k] > hi)) e(k, `${show(c[k])}: ganze Zahl von ${lo} bis ${hi} erwartet`);
    }
    for (const k of BOOLS) if (has(k) && typeof c[k] !== 'boolean') e(k, `${show(c[k])}: true oder false erwartet`);
    if (has('nextAction') && !(c.nextAction in NEXT_ACTIONS)) e('nextAction', `${show(c.nextAction)} (erlaubt: ${Object.keys(NEXT_ACTIONS).join(', ')})`);
    for (const [k, list] of Object.entries(CHOICES)) if (has(k) && !list.includes(c[k])) e(k, `${show(c[k])} (erlaubt: ${list.join(', ')})`);
    if (MODES[c.type] && has('mode') && !MODES[c.type].includes(c.mode)) e('mode', `${show(c.mode)} (erlaubt: ${MODES[c.type].join(', ')})`);

    if (has('target')) {
      if (typeof c.target !== 'string') e('target', 'kein Text');
      else if (!c.target) {
        if (c.type === 'fade') w('target', 'kein Ziel-Cue, der Fade bewirkt nichts');
        else if (c.type === 'startstop' && c.mode === 'start') w('target', 'kein Ziel-Cue, „Starten“ bewirkt nichts');
      } else if (c.target === c.id) e('target', 'zeigt auf sich selbst');
      else if (!ids.has(c.target)) e('target', `Ziel-Cue ${show(c.target)} nicht gefunden`);
      else if (c.type === 'fade' && s.cues[ids.get(c.target)].type !== 'audio') e('target', `Ziel Cue ${ids.get(c.target) + 1} ist keine Audio-Cue (Fade wirkt nur auf Audio-Cues)`);
    }
    if (c.type === 'audio' && has('mediaId')) {
      if (c.mediaId === null || c.mediaId === '') w('mediaId', 'Audio-Cue hat keine Datei');
      else if (typeof c.mediaId !== 'string') e('mediaId', `${show(c.mediaId)}: Text oder null erwartet`);
      else if (!mediaIds.has(c.mediaId)) e('mediaId', `Medium ${show(c.mediaId)} nicht in der Show`);
    }

    if (typeof c.hotkey === 'string' && c.hotkey) {
      if (hotkeys.has(c.hotkey)) w('hotkey', `gleiche Taste wie Cue ${hotkeys.get(c.hotkey) + 1} (beide lösen aus)`);
      else hotkeys.set(c.hotkey, i);
    }
    if (typeof c.midiTrigger === 'string' && c.midiTrigger) {
      if (triggers.has(c.midiTrigger)) w('midiTrigger', `gleicher MIDI-Trigger wie Cue ${triggers.get(c.midiTrigger) + 1} (beide lösen aus)`);
      else triggers.set(c.midiTrigger, i);
      if (c.midiTrigger === midiGo) w('midiTrigger', 'gleich wie „GO per MIDI“ in den Einstellungen');
      if (c.midiTrigger === midiStop) w('midiTrigger', 'gleich wie „Stop alle per MIDI“ in den Einstellungen');
    }
    if (i === s.cues.length - 1 && (c.nextAction === 'continue' || c.nextAction === 'follow')) {
      w('nextAction', `${NEXT_ACTIONS[c.nextAction]} an der letzten Cue bewirkt nichts`);
    }
  });

  // Einstellungen
  if (isObj(s.settings)) checkSettings(s.settings, (stufe, k, t) => add(stufe, `Einstellungen · ${k}`, t));
  return out;
}

function checkSettings(st, add) {
  const def = newSession().settings;
  const e = (k, t) => add('fehler', k, t);
  const range = (k, lo, hi, int = false) => {
    if (!(k in st)) return;
    const v = st[k];
    if (!isNum(v) || v < lo || v > hi || (int && !Number.isInteger(v))) e(k, `${show(v)}: ${int ? 'ganze ' : ''}Zahl von ${lo} bis ${hi} erwartet`);
  };
  for (const k of Object.keys(st)) if (!(k in def)) add('warnung', k, 'unbekannte Einstellung (Tippfehler?)');
  if ('layout' in st && !['list', 'cart'].includes(st.layout)) e('layout', `${show(st.layout)} (erlaubt: list, cart)`);
  for (const k of ['showMode', 'confirmEdit', 'wakeLock']) if (k in st && typeof st[k] !== 'boolean') e(k, `${show(st[k])}: true oder false erwartet`);
  range('cartColumns', 1, 12, true);
  range('goLockMs', 0, 5000);
  range('stopAllFade', 0, 30);
  range('pauseAllFade', 0, 30);
  range('masterDb', MIN_DB, MASTER_MAX_DB);
  if ('sinkId' in st && typeof st.sinkId !== 'string') e('sinkId', 'kein Text');
  if ('midi' in st) {
    const m = st.midi;
    if (!isObj(m)) e('midi', 'Objekt erwartet');
    else {
      if ('enabled' in m && typeof m.enabled !== 'boolean') e('midi.enabled', `${show(m.enabled)}: true oder false erwartet`);
      for (const k of ['go', 'stopAll']) if (k in m && typeof m[k] !== 'string') e(`midi.${k}`, 'kein Text');
      for (const k of Object.keys(m)) if (!(k in def.midi)) add('warnung', `midi.${k}`, 'unbekannte Einstellung (Tippfehler?)');
    }
  }
}
