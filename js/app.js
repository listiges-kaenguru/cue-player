// Oberfläche und Bedienlogik.
import { Engine } from './engine.js';
import { Midi, midiLabel } from './midi.js';
import * as store from './storage.js';
import { CUE_TYPES, NEXT_ACTIONS, newSession, newCue, normalizeSession, cueDisplayName } from './model.js';
import { fmtTime, fmtDb, debounce, keyLabel, uid, MIN_DB } from './util.js';

export const APP_VERSION = '0.1.0';

const $ = (sel, root = document) => root.querySelector(sel);
const COLORS = ['', '#b62324', '#bd561d', '#9e6a03', '#1a7f37', '#0f6e6e', '#1f6feb', '#6639ba', '#bf3989', '#57606a'];

const midi = new Midi();
const engine = new Engine({ loadMedia: async (id) => (await store.getMedia(id))?.blob ?? null, midi });

const state = {
  session: null,
  standbyId: null,
  goLockedUntil: 0,
  learn: null, // { kind: 'key' | 'midi', apply(value) }
  lastEsc: 0,
  rows: new Map(), // cueId -> { row, bar, fill, txt, lastState }
  tiles: new Map(),
  runItems: new Map(),
  runningDirty: true,
  wakeLock: null,
};

const cues = () => state.session.cues;
const settings = () => state.session.settings;
const label = (cue) => cueDisplayName(state.session, cue);
engine.labelFn = label;

const save = debounce(() => store.saveSession(state.session).catch((e) => toast('Speichern fehlgeschlagen: ' + e.message, true)), 400);

// ---------------------------------------------------------------------------
// Hilfen

function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'class') el.className = v;
    else if (k === 'value') el.value = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k in el && typeof v !== 'string') el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) if (c != null && c !== false) el.append(c.nodeType ? c : String(c));
  return el;
}

function toast(msg, error = false) {
  const t = h('div', { class: 'toast' + (error ? ' error' : '') }, msg);
  $('#toasts').append(t);
  setTimeout(() => t.remove(), error ? 5000 : 2800);
}

function download(blob, filename) {
  const a = h('a', { href: URL.createObjectURL(blob), download: filename });
  document.body.append(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
}

const isTyping = (e) => e.target.closest?.('input, textarea, select, [contenteditable]') && e.target.type !== 'range' && e.target.type !== 'checkbox';
const dialogOpen = () => !!document.querySelector('dialog[open]');

// ---------------------------------------------------------------------------
// Session laden / wechseln

async function openSession(session) {
  engine.stopAll(0);
  state.session = normalizeSession(session);
  engine.setSession(state.session);
  state.standbyId = cues()[0]?.id ?? null;
  await store.setMeta('lastSession', session.id);
  $('#session-name').value = session.name;
  $('#master').value = settings().masterDb;
  $('#master-val').textContent = fmtDb(settings().masterDb);
  if (settings().midi.enabled && !midi.enabled) {
    midi.enable().catch((e) => toast('MIDI: ' + e.message, true));
  }
  applyWakeLock();
  renderAll();
}

async function init() {
  let session = null;
  try {
    const last = await store.getMeta('lastSession');
    if (last) session = await store.loadSession(last);
    if (!session) {
      const list = await store.listSessions();
      if (list.length) session = await store.loadSession(list[0].id);
    }
  } catch (e) {
    toast('Speicher nicht verfügbar: ' + e.message, true);
  }
  if (!session) {
    session = newSession('Meine Show');
    await store.saveSession(session).catch(() => {});
  }
  await openSession(session);
  requestAnimationFrame(frame);
  registerSW();
}

// ---------------------------------------------------------------------------
// Rendering

function renderAll() {
  const s = settings();
  document.body.classList.toggle('show-mode', s.showMode);
  $('#btn-showmode').textContent = s.showMode ? '🔒 Show' : '🔓 Edit';
  $('#btn-showmode').title = s.showMode ? 'Show-Modus aktiv – klicken zum Bearbeiten' : 'Bearbeiten aktiv – klicken für Show-Modus (sperrt Änderungen)';
  const cart = s.layout === 'cart';
  $('#list-view').hidden = cart;
  $('#cart-view').hidden = !cart;
  $('#btn-layout').textContent = cart ? '☰ Liste' : '▦ Cart';
  if (cart) renderCart(); else renderList();
  state.runningDirty = true;
  updateGo();
}

function durationText(cue) {
  if (!cue) return '';
  const r = engine.runners.get(cue.id);
  if (cue.type === 'audio') {
    if (r?.error) return r.error;
    const d = r?.duration() || cue.duration;
    return d ? fmtTime(d) + (cue.loop ? ' ⟳' : '') : '…';
  }
  if (cue.type === 'fade') return fmtTime(cue.duration);
  return '–';
}

function renderList() {
  const tbody = $('#cue-rows');
  tbody.textContent = '';
  state.rows.clear();
  const edit = !settings().showMode;
  $('#empty-hint').hidden = cues().length > 0;
  cues().forEach((cue, i) => {
    const fill = h('div', { class: 'fill' });
    const txt = h('div', { class: 'txt' }, durationText(cue));
    const bar = h('div', { class: 'bar' }, fill, txt);
    const badges = h('span', { class: 'badges' },
      cue.hotkey && h('span', { class: 'badge', title: 'Tastatur-Trigger' }, '⌨ ' + keyLabel(cue.hotkey)),
      cue.midiTrigger && h('span', { class: 'badge', title: 'MIDI-Trigger' }, '🎹 ' + midiLabel(cue.midiTrigger)),
      cue.type === 'audio' && engine.runners.get(cue.id)?.error && h('span', { class: 'badge err' }, '!'));
    const post = cue.nextAction === 'none' ? (cue.postWait ? fmtTime(cue.postWait) : '') :
      `${cue.nextAction === 'continue' ? '⤵ AC' : '↧ AF'}${cue.postWait ? ' ' + fmtTime(cue.postWait) : ''}`;
    const row = h('tr', {
      class: 'cue-row', 'data-id': cue.id, draggable: edit ? 'true' : null,
      onclick: (e) => { if (!e.target.closest('button')) setStandby(cue.id); },
      ondblclick: (e) => { if (!e.target.closest('button') && edit) openEditor(cue.id); },
    },
      h('td', { class: 'c-num' }, i + 1),
      h('td', { class: 'c-name' },
        h('div', { class: 'nm' },
          cue.color && h('span', { class: 'colorchip', style: { background: cue.color } }),
          h('span', { class: 'ic', title: CUE_TYPES[cue.type]?.label }, CUE_TYPES[cue.type]?.icon),
          h('span', { class: 'title' }, label(cue)),
          badges),
        cue.notes && h('div', { class: 'notes' }, cue.notes)),
      h('td', { class: 'c-pre' }, cue.preWait ? fmtTime(cue.preWait) : ''),
      h('td', { class: 'c-dur' }, bar),
      h('td', { class: 'c-post' }, post),
      edit && h('td', { class: 'c-act' },
        h('button', { class: 'wide-only', title: 'Nach oben', onclick: () => moveCue(cue.id, -1) }, '↑'), ' ',
        h('button', { class: 'wide-only', title: 'Nach unten', onclick: () => moveCue(cue.id, 1) }, '↓'), ' ',
        h('button', { class: 'wide-only', title: 'Klonen (Kopie dahinter einfügen)', onclick: () => cloneCue(cue.id) }, '⧉'), ' ',
        h('button', { title: 'Bearbeiten', onclick: () => openEditor(cue.id) }, '✎')));
    tbody.append(row);
    state.rows.set(cue.id, { row, bar, fill, txt, lastState: null });
  });
  updateStandbyMarks();
}

function renderCart() {
  const view = $('#cart-view');
  view.textContent = '';
  view.style.setProperty('--cols', settings().cartColumns);
  state.tiles.clear();
  const edit = !settings().showMode;
  if (!cues().length) view.append(h('div', { class: 'empty-hint', style: { gridColumn: '1/-1' } }, 'Noch keine Cues – in der Listenansicht oder per Drag & Drop hinzufügen.'));
  cues().forEach((cue, i) => {
    const fill = h('div', { class: 'cb-fill' });
    const time = h('div', { class: 'cb-time' }, durationText(cue));
    const tile = h('button', {
      class: 'cart-btn', 'data-id': cue.id,
      style: { background: cue.color || null },
      onclick: (e) => { if (!e.target.closest('.cb-edit')) cartPress(cue.id); },
    },
      fill,
      h('div', { class: 'cb-top' }, h('span', {}, `${i + 1} ${CUE_TYPES[cue.type]?.icon ?? ''}`), h('span', {}, cue.hotkey ? keyLabel(cue.hotkey) : ''), edit && h('span', { class: 'cb-edit-space' })),
      h('div', { class: 'cb-name' }, label(cue)),
      time,
      edit && h('span', { class: 'cb-edit', role: 'button', title: 'Bearbeiten', onclick: () => openEditor(cue.id) }, '✎'));
    view.append(tile);
    state.tiles.set(cue.id, { tile, fill, time, lastState: null });
  });
  updateStandbyMarks();
}

function updateStandbyMarks() {
  state.rows.forEach((r, id) => r.row.classList.toggle('standby', id === state.standbyId));
  state.tiles.forEach((t, id) => t.tile.classList.toggle('standby', id === state.standbyId));
  updateGo();
}

function updateGo() {
  const cue = cues().find((c) => c.id === state.standbyId);
  const i = cues().indexOf(cue);
  $('#go-next').textContent = cue ? `${i + 1} · ${label(cue)}` : 'Ende der Liste';
}

function progressText(p) {
  if (p.phase === 'prewait') return `Pre-Wait ${fmtTime(p.total - p.elapsed)}`;
  if (p.phase === 'postwait') return `Post-Wait ${fmtTime(p.total - p.elapsed)}`;
  if (p.loop) return `⟳ ${fmtTime(p.elapsed)} / ${fmtTime(p.total)}`;
  if (!p.total) return '';
  return `${fmtTime(p.elapsed)} / −${fmtTime(p.total - p.elapsed)}`;
}

/** Wird pro Frame aufgerufen: Fortschrittsbalken und Status. */
function frame() {
  const update = (id, setState, setProgress) => {
    const r = engine.runners.get(id);
    const st = r?.state ?? 'idle';
    setState(st);
    if (st !== 'idle') setProgress(r.progress(), st);
  };

  state.rows.forEach((item, id) => {
    update(id, (st) => {
      if (st === item.lastState) return;
      item.row.classList.remove('st-' + item.lastState);
      item.row.classList.add('st-' + st);
      item.bar.className = 'bar st-' + st;
      if (st === 'idle') { item.fill.style.width = '0'; item.txt.textContent = durationText(engine.cue(id)); }
      item.lastState = st;
    }, (p) => {
      item.fill.style.width = p.total ? `${Math.min(100, (p.elapsed / p.total) * 100)}%` : '100%';
      item.txt.textContent = progressText(p);
    });
  });

  state.tiles.forEach((item, id) => {
    update(id, (st) => {
      if (st === item.lastState) return;
      item.tile.classList.remove('st-' + item.lastState);
      item.tile.classList.add('st-' + st);
      if (st === 'idle') { item.fill.style.height = '0'; item.time.textContent = durationText(engine.cue(id)); }
      item.lastState = st;
    }, (p) => {
      item.fill.style.height = p.total ? `${Math.min(100, (p.elapsed / p.total) * 100)}%` : '100%';
      item.time.textContent = progressText(p);
    });
  });

  if (state.runningDirty) renderRunning();
  state.runItems.forEach((item, id) => {
    const r = engine.runners.get(id);
    if (!r) return;
    const p = r.progress();
    item.bar.className = 'bar st-' + r.state;
    item.fill.style.width = p.total ? `${Math.min(100, (p.elapsed / p.total) * 100)}%` : '100%';
    item.txt.textContent = progressText(p);
    item.pp.textContent = r.paused ? '▶' : '❚❚';
  });

  const locked = performance.now() < state.goLockedUntil;
  $('#btn-go').classList.toggle('locked', locked);
  requestAnimationFrame(frame);
}

function renderRunning() {
  state.runningDirty = false;
  const list = $('#running-list');
  const active = engine.active();
  list.textContent = '';
  state.runItems.clear();
  if (!active.length) { list.append(h('p', { class: 'muted' }, 'Nichts läuft.')); return; }
  active.forEach((r) => {
    const cue = r.cue;
    if (!cue) return;
    const fill = h('div', { class: 'fill' });
    const txt = h('div', { class: 'txt' });
    const bar = h('div', { class: 'bar' }, fill, txt);
    const pp = h('button', { title: 'Pause / Weiter', onclick: () => (r.paused ? r.resume(settings().pauseAllFade) : r.pause(settings().pauseAllFade)) }, '❚❚');
    list.append(h('div', { class: 'run-item' },
      h('div', { class: 'ri-head' },
        h('span', { class: 'ri-name' }, `${cues().indexOf(cue) + 1} · ${label(cue)}`),
        pp,
        h('button', { class: 'danger', title: 'Stop (mit Stop-alle-Fade)', onclick: () => r.stop(settings().stopAllFade) }, '■')),
      bar));
    state.runItems.set(cue.id, { bar, fill, txt, pp });
  });
}

// ---------------------------------------------------------------------------
// Transport

function setStandby(id) {
  state.standbyId = id;
  updateStandbyMarks();
  state.rows.get(id)?.row.scrollIntoView({ block: 'nearest' });
}

function go() {
  const now = performance.now();
  if (now < state.goLockedUntil) return;
  state.goLockedUntil = now + (settings().goLockMs || 0);
  const list = cues();
  const i = list.findIndex((c) => c.id === state.standbyId);
  if (i < 0) return;
  engine.go(list[i].id);
  // Standby hinter die automatisch verketteten Cues setzen.
  let j = i + 1;
  while (j < list.length && list[j - 1].nextAction !== 'none') j++;
  setStandby(list[j]?.id ?? null);
}

function stopAll(immediate = false) {
  const now = performance.now();
  // Zweimal kurz hintereinander = sofort stoppen.
  const fade = immediate || now - state.lastEsc < 1000 ? 0 : settings().stopAllFade;
  state.lastEsc = now;
  engine.stopAll(fade);
}

function cartPress(id) {
  engine.ensureContext();
  const r = engine.runner(id);
  if (r.paused) r.resume(settings().pauseAllFade);
  else if (r.active) r.stop(0);
  else engine.go(id);
}

// ---------------------------------------------------------------------------
// Cues bearbeiten

function insertIndex() {
  const i = cues().findIndex((c) => c.id === state.standbyId);
  return i < 0 ? cues().length : i + 1;
}

async function addAudioFiles(files) {
  files = [...files].filter((f) => /^(audio|video)\//.test(f.type) || /\.(mp3|wav|ogg|oga|flac|m4a|aac|opus|webm|mp4)$/i.test(f.name));
  if (!files.length) return;
  navigator.storage?.persist?.().catch(() => {});
  let at = insertIndex();
  let first = null;
  for (const f of files) {
    try {
      const rec = await store.storeFile(f);
      const cue = newCue('audio', { mediaId: rec.id, mediaName: f.name.replace(/\.[^.]+$/, '') });
      cues().splice(at++, 0, cue);
      engine.runner(cue.id).prepare();
      first ??= cue;
    } catch (e) {
      toast(`${f.name}: ${e.message}`, true);
    }
  }
  if (!state.standbyId && first) state.standbyId = first.id;
  save();
  renderAll();
  toast(`${files.length} Audio-Cue(s) hinzugefügt`);
}

function addCue(type) {
  const cue = newCue(type);
  // Sinnvolles Ziel vorbelegen: der Cue davor.
  const prev = cues()[insertIndex() - 1];
  if ('target' in cue && prev && type !== 'stop' && type !== 'pause') cue.target = prev.id;
  cues().splice(insertIndex(), 0, cue);
  engine.runner(cue.id);
  save();
  renderAll();
  openEditor(cue.id);
}

function moveCue(id, delta) {
  const list = cues();
  const i = list.findIndex((c) => c.id === id);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= list.length) return;
  [list[i], list[j]] = [list[j], list[i]];
  save();
  renderAll();
}

function moveCueTo(id, beforeId) {
  const list = cues();
  const i = list.findIndex((c) => c.id === id);
  if (i < 0 || id === beforeId) return;
  const [cue] = list.splice(i, 1);
  const j = beforeId ? list.findIndex((c) => c.id === beforeId) : list.length;
  list.splice(j < 0 ? list.length : j, 0, cue);
  save();
  renderAll();
}

/** Fügt eine unabhängige Kopie direkt hinter dem Cue ein. Trigger werden nicht mitkopiert (sonst doppelte Auslösung). */
function cloneCue(id) {
  const i = cues().findIndex((c) => c.id === id);
  if (i < 0) return null;
  const copy = { ...structuredClone(cues()[i]), id: uid(), hotkey: '', midiTrigger: '' };
  if (copy.name) copy.name += ' (Kopie)';
  cues().splice(i + 1, 0, copy);
  engine.cueChanged(copy.id);
  save();
  renderAll();
  return copy;
}

function deleteCue(id) {
  const i = cues().findIndex((c) => c.id === id);
  if (i < 0) return;
  engine.removeCue(id);
  cues().splice(i, 1);
  cues().forEach((c) => { if (c.target === id) c.target = ''; });
  if (state.standbyId === id) state.standbyId = cues()[i]?.id ?? cues()[i - 1]?.id ?? null;
  save();
  renderAll();
}

// --- Formular-Bausteine ---

function field(labelText, control, hint) {
  return [h('label', {}, labelText), control, hint && h('div', { class: 'hint' }, hint)];
}

function numInput(draft, key, { min = 0, max = 99999, step = 'any' } = {}) {
  return h('input', {
    type: 'number', min, max, step, value: draft[key],
    oninput: (e) => { const v = parseFloat(e.target.value); draft[key] = isFinite(v) ? v : 0; },
  });
}

function textInput(draft, key, placeholder = '') {
  return h('input', { type: 'text', value: draft[key] ?? '', placeholder, oninput: (e) => { draft[key] = e.target.value; } });
}

function selectInput(draft, key, options, onchange) {
  const sel = h('select', { onchange: (e) => { draft[key] = e.target.value; onchange?.(); } },
    options.map(([v, l]) => h('option', { value: v, selected: String(draft[key]) === String(v) }, l)));
  return sel;
}

function checkInput(draft, key, text) {
  return h('label', { class: 'row' }, h('input', { type: 'checkbox', checked: !!draft[key], onchange: (e) => { draft[key] = e.target.checked; } }), text);
}

function dbSlider(draft, key, max = 12) {
  const out = h('output', {}, fmtDb(draft[key]));
  return h('div', { class: 'row' },
    h('input', { type: 'range', min: MIN_DB, max, step: 0.5, value: draft[key], oninput: (e) => { draft[key] = parseFloat(e.target.value); out.textContent = fmtDb(draft[key]); } }),
    out);
}

function targetSelect(draft, selfId, { allowAll = false, onlyAudio = false } = {}) {
  const opts = cues()
    .filter((c) => c.id !== selfId && (!onlyAudio || c.type === 'audio'))
    .map((c) => [c.id, `${cues().indexOf(c) + 1} · ${label(c)}`]);
  if (allowAll) opts.unshift(['', '— Alle laufenden Cues —']);
  else opts.unshift(['', '— bitte wählen —']);
  return selectInput(draft, 'target', opts);
}

function learnButton(kind, current, onSet) {
  const lbl = h('span', {}, current ? (kind === 'key' ? keyLabel(current) : midiLabel(current)) : '—');
  const btn = h('button', {
    type: 'button', class: 'learn',
    onclick: async () => {
      if (kind === 'midi' && !midi.enabled) {
        try { await midi.enable(); settings().midi.enabled = true; save(); } catch (e) { toast(e.message, true); return; }
      }
      btn.classList.add('active');
      btn.textContent = kind === 'key' ? 'Taste drücken…' : 'MIDI senden…';
      state.learn = {
        kind,
        apply: (v) => {
          state.learn = null;
          btn.classList.remove('active');
          btn.textContent = 'Lernen';
          lbl.textContent = kind === 'key' ? keyLabel(v) : midiLabel(v);
          onSet(v);
        },
      };
    },
  }, 'Lernen');
  const clr = h('button', { type: 'button', onclick: () => { lbl.textContent = '—'; onSet(''); } }, '✕');
  return h('div', { class: 'row' }, lbl, btn, clr);
}

function openEditor(id) {
  if (settings().showMode) return;
  const cue = cues().find((c) => c.id === id);
  if (!cue) return;
  const draft = structuredClone(cue);
  const dlg = $('#dlg-cue');
  const body = $('#cue-form-body');
  body.textContent = '';
  $('#cue-form-title').textContent = `Cue ${cues().indexOf(cue) + 1} · ${CUE_TYPES[cue.type].label}`;

  const add = (...parts) => body.append(...parts.flat().filter(Boolean));

  add(field('Name', textInput(draft, 'name', label(cue))));
  const pos = { value: cues().indexOf(cue) + 1 };
  add(field('Position', numInput(pos, 'value', { min: 1, max: cues().length, step: 1 }), 'Nummer in der Cue-Liste'));
  const colorRow = h('div', { class: 'colors' });
  const paintColors = () => {
    colorRow.textContent = '';
    COLORS.forEach((c) => colorRow.append(h('button', {
      type: 'button', class: draft.color === c ? 'sel' : '', title: c || 'Keine Farbe',
      style: { background: c || 'var(--bg3)' }, onclick: () => { draft.color = c; paintColors(); },
    }, c ? '' : '∅')));
  };
  paintColors();
  add(field('Farbe', colorRow));

  if (cue.type === 'audio') {
    add(h('h3', {}, 'Audio'));
    const fileName = h('span', {}, draft.mediaName || '— keine —');
    const fileInput = h('input', {
      type: 'file', accept: 'audio/*,video/*', hidden: true,
      onchange: async (e) => {
        const f = e.target.files[0];
        if (!f) return;
        const rec = await store.storeFile(f);
        draft.mediaId = rec.id;
        draft.mediaName = f.name.replace(/\.[^.]+$/, '');
        draft.duration = 0;
        fileName.textContent = draft.mediaName;
      },
    });
    add(field('Datei', h('div', { class: 'row' }, fileName, h('button', { type: 'button', onclick: () => fileInput.click() }, 'Datei wählen…'), fileInput)));
    add(field('Lautstärke', dbSlider(draft, 'volume')));
    const panOut = h('output', {}, draft.pan.toFixed(2));
    add(field('Panorama', h('div', { class: 'row' },
      h('input', { type: 'range', min: -1, max: 1, step: 0.05, value: draft.pan, oninput: (e) => { draft.pan = parseFloat(e.target.value); panOut.textContent = draft.pan.toFixed(2); } }),
      panOut), 'Links −1 … 0 Mitte … +1 Rechts'));
    add(field('Start bei (s)', numInput(draft, 'start')));
    add(field('Ende bei (s)', numInput(draft, 'end'), `0 = bis zum Dateiende${cue.duration ? ` (Länge ${fmtTime(cue.duration)})` : ''}`));
    add(field('Fade-In (s)', numInput(draft, 'fadeIn')));
    add(field('Fade-Out (s)', numInput(draft, 'fadeOut'), 'Automatischer Fade vor dem Ende'));
    add(field('Fade-Kurve', selectInput(draft, 'fadeCurve', [['log', 'Logarithmisch (natürlich)'], ['linear', 'Linear']])));
    add(field('Schleife', checkInput(draft, 'loop', 'Endlos wiederholen (bis Stop)')));
  } else if (cue.type === 'fade') {
    add(h('h3', {}, 'Fade'));
    add(field('Ziel-Cue', targetSelect(draft, cue.id, { onlyAudio: true })));
    add(field('Ziel-Lautstärke', dbSlider(draft, 'volume')));
    add(field('Dauer (s)', numInput(draft, 'duration')));
    add(field('Kurve', selectInput(draft, 'fadeCurve', [['log', 'Logarithmisch'], ['linear', 'Linear']])));
    add(field('Danach', checkInput(draft, 'stopAfter', 'Ziel-Cue nach dem Fade stoppen')));
  } else if (cue.type === 'stop') {
    add(h('h3', {}, 'Stop'));
    add(field('Ziel-Cue', targetSelect(draft, cue.id, { allowAll: true })));
    add(field('Fade-Out (s)', numInput(draft, 'fade')));
  } else if (cue.type === 'start') {
    add(h('h3', {}, 'Start'));
    add(field('Ziel-Cue', targetSelect(draft, cue.id)));
  } else if (cue.type === 'pause') {
    add(h('h3', {}, 'Pause / Weiter'));
    add(field('Ziel-Cue', targetSelect(draft, cue.id, { allowAll: true })));
    add(field('Aktion', selectInput(draft, 'mode', [['toggle', 'Umschalten'], ['pause', 'Pausieren'], ['resume', 'Fortsetzen']])));
    add(field('Fade beim Pausieren (s)', numInput(draft, 'fadeOut'), 'Ausblenden, bevor angehalten wird. 0 = sofort'));
    add(field('Fade beim Fortsetzen (s)', numInput(draft, 'fadeIn'), 'Einblenden nach dem Fortsetzen. 0 = sofort. Es gilt die Fade-Kurve des jeweiligen Audio-Cues.'));
  } else if (cue.type === 'midi') {
    add(h('h3', {}, 'MIDI-Nachricht'));
    const outs = [['', 'Alle Ausgänge'], ...midi.outputs().map((o) => [o.id, o.name])];
    if (draft.output && !outs.some(([v]) => v === draft.output)) outs.push([draft.output, '(nicht verbunden)']);
    add(field('Ausgang', selectInput(draft, 'output', outs), midi.enabled ? '' : 'MIDI ist noch nicht aktiviert (Einstellungen)'));
    add(field('Nachricht', selectInput(draft, 'msg', [['noteon', 'Note On'], ['noteoff', 'Note Off'], ['cc', 'Control Change'], ['pc', 'Program Change']])));
    add(field('Kanal', numInput(draft, 'channel', { min: 1, max: 16, step: 1 })));
    add(field('Note / CC / Programm', numInput(draft, 'data1', { min: 0, max: 127, step: 1 })));
    add(field('Velocity / Wert', numInput(draft, 'data2', { min: 0, max: 127, step: 1 })));
  }

  add(h('h3', {}, 'Ablauf'));
  add(field('Pre-Wait (s)', numInput(draft, 'preWait'), 'Verzögerung zwischen GO und Start'));
  add(field('Danach', selectInput(draft, 'nextAction', Object.entries(NEXT_ACTIONS)),
    'Auto-Continue: nächster Cue startet Post-Wait nach dem Start. Auto-Follow: nächster Cue startet Post-Wait nach dem Ende.'));
  add(field('Post-Wait (s)', numInput(draft, 'postWait')));

  add(h('h3', {}, 'Trigger'));
  add(field('Taste', learnButton('key', draft.hotkey, (v) => { draft.hotkey = v; })));
  add(field('MIDI', learnButton('midi', draft.midiTrigger, (v) => { draft.midiTrigger = v; })));
  add(field('Notizen', h('textarea', { value: draft.notes, oninput: (e) => { draft.notes = e.target.value; } })));

  $('#cue-delete').onclick = () => {
    if (confirm(`Cue „${label(cue)}“ löschen?`)) { dlg.close('deleted'); deleteCue(id); }
  };
  dlg.onclose = () => {
    state.learn = null;
    const action = dlg.returnValue;
    if (action !== 'ok' && action !== 'clone') return;
    if (draft.type === 'audio' && draft.end > 0 && draft.end <= draft.start) {
      toast('Ende liegt vor dem Start – Ende wird ignoriert', true);
      draft.end = 0;
    }
    Object.assign(cue, draft);
    const from = cues().indexOf(cue);
    const to = Math.min(cues().length, Math.max(1, Math.round(pos.value))) - 1;
    if (from >= 0 && to !== from) cues().splice(to, 0, ...cues().splice(from, 1));
    engine.cueChanged(id);
    save();
    renderAll();
    if (action === 'clone') {
      const copy = cloneCue(id);
      if (copy) { toast('Cue geklont – Kopie wird bearbeitet'); openEditor(copy.id); }
    }
  };
  dlg.returnValue = '';
  dlg.showModal();
}

// ---------------------------------------------------------------------------
// Shows verwalten

async function renderSessions() {
  const list = $('#session-list');
  list.textContent = '';
  const sessions = await store.listSessions();
  sessions.forEach((s) => {
    const current = s.id === state.session.id;
    list.append(h('div', { class: 'ses' + (current ? ' current' : '') },
      h('div', { class: 'ses-name' }, h('div', {}, s.name || 'Ohne Namen'),
        h('div', { class: 'ses-meta' }, `${s.count} Cues · ${new Date(s.updated).toLocaleString()}`)),
      current ? h('span', { class: 'muted' }, 'geöffnet') : h('button', {
        type: 'button', onclick: async () => {
          await store.saveSession(state.session);
          await openSession(await store.loadSession(s.id));
          $('#dlg-sessions').close();
          store.gcMedia().catch(() => {});
        },
      }, 'Öffnen'),
      !current && h('button', {
        type: 'button', class: 'danger', onclick: async () => {
          if (!confirm(`Show „${s.name}“ endgültig löschen?`)) return;
          await store.deleteSession(s.id);
          await store.gcMedia();
          renderSessions();
        },
      }, 'Löschen')));
  });
}

async function exportCurrent() {
  await store.saveSession(state.session);
  toast('Export wird erstellt…');
  const blob = await store.exportShow(state.session);
  const fname = (state.session.name || 'show').replace(/[^\w\-äöüÄÖÜß ]+/g, '_').trim() + '.cueshow';
  download(blob, fname);
}

// ---------------------------------------------------------------------------
// Einstellungen

async function openSettings() {
  const s = settings();
  const body = $('#settings-body');
  body.textContent = '';
  const add = (...parts) => body.append(...parts.flat().filter(Boolean));
  const bindNum = (obj, key, opts) => {
    const inp = numInput(obj, key, opts);
    inp.addEventListener('change', () => { save(); renderAll(); });
    return inp;
  };

  add(h('h3', {}, 'Bedienung'));
  add(field('GO-Sperre (ms)', bindNum(s, 'goLockMs', { min: 0, max: 5000, step: 50 }), 'Verhindert versehentliches doppeltes Auslösen'));
  add(field('Stop-alle-Fade (s)', bindNum(s, 'stopAllFade', { min: 0, max: 30, step: 0.1 }), 'Esc / „Stop alle“. Zweimal drücken oder Shift = sofort.'));
  add(field('Pause-alle-Fade (s)', bindNum(s, 'pauseAllFade', { min: 0, max: 30, step: 0.1 }), 'Aus-/Einblenden für „Pause“/„Weiter“ und die ❚❚-Knöpfe im Aktiv-Bereich.'));
  add(field('Cart-Spalten', bindNum(s, 'cartColumns', { min: 1, max: 12, step: 1 })));
  const wl = checkInput(s, 'wakeLock', 'Bildschirm nicht abschalten');
  wl.addEventListener('change', () => { save(); applyWakeLock(); });
  add(field('Display', wl, 'wakeLock' in navigator ? '' : 'Von diesem Browser nicht unterstützt'));

  add(h('h3', {}, 'Audio'));
  if (engine.ctx?.setSinkId || ('setSinkId' in (window.AudioContext?.prototype ?? {}))) {
    const sel = h('select', {
      onchange: async (e) => {
        s.sinkId = e.target.value;
        save();
        try { engine.ensureContext(); await engine.setSink(s.sinkId); toast('Ausgang gewechselt'); } catch (err) { toast(err.message, true); }
      },
    });
    const fill = async () => {
      const devs = (await navigator.mediaDevices?.enumerateDevices?.() ?? []).filter((d) => d.kind === 'audiooutput');
      sel.textContent = '';
      sel.append(h('option', { value: '' }, 'Standard'));
      devs.filter((d) => d.deviceId && d.deviceId !== 'default').forEach((d, i) =>
        sel.append(h('option', { value: d.deviceId, selected: d.deviceId === s.sinkId }, d.label || `Ausgang ${i + 1}`)));
    };
    await fill();
    const btn = h('button', {
      type: 'button',
      onclick: async () => {
        try { (await navigator.mediaDevices.getUserMedia({ audio: true })).getTracks().forEach((t) => t.stop()); } catch {}
        fill();
      },
    }, 'Namen anzeigen');
    add(field('Ausgabegerät', h('div', { class: 'row' }, sel, btn), 'Gerätenamen erfordern eine einmalige Mikrofon-Freigabe (wird nicht genutzt).'));
  } else {
    add(field('Ausgabegerät', h('span', { class: 'muted' }, 'Auswahl in diesem Browser nicht möglich – Systemausgang wird verwendet.')));
  }

  add(h('h3', {}, 'MIDI'));
  const midiStatus = h('span', { class: 'muted' }, midi.supported ? (midi.enabled ? `${midi.inputs().length} Eingänge, ${midi.outputs().length} Ausgänge` : 'aus') : 'nicht unterstützt');
  const midiChk = h('input', {
    type: 'checkbox', checked: s.midi.enabled, disabled: !midi.supported,
    onchange: async (e) => {
      s.midi.enabled = e.target.checked;
      save();
      if (s.midi.enabled) {
        try { await midi.enable(); } catch (err) { toast(err.message, true); }
      }
      openSettings();
    },
  });
  add(field('MIDI verwenden', h('label', { class: 'row' }, midiChk, midiStatus)));
  if (midi.enabled) {
    add(field('GO per MIDI', learnButton('midi', s.midi.go, (v) => { s.midi.go = v; save(); })));
    add(field('Stop alle per MIDI', learnButton('midi', s.midi.stopAll, (v) => { s.midi.stopAll = v; save(); })));
  }

  add(h('h3', {}, 'Speicher'));
  const est = await navigator.storage?.estimate?.().catch(() => null);
  const persisted = await navigator.storage?.persisted?.().catch(() => false);
  add(field('Belegt', h('span', {}, est ? `${(est.usage / 1e6).toFixed(1)} MB von ca. ${(est.quota / 1e9).toFixed(1)} GB` : 'unbekannt')));
  add(field('Dauerhaft', h('div', { class: 'row' },
    h('span', {}, persisted ? 'ja – Browser löscht Daten nicht automatisch' : 'nein'),
    !persisted && h('button', { type: 'button', onclick: async () => { const ok = await navigator.storage?.persist?.(); toast(ok ? 'Speicher ist jetzt dauerhaft' : 'Browser hat abgelehnt (App installieren hilft meist)', !ok); openSettings(); } }, 'Anfordern'))));
  add(field('Aufräumen', h('button', { type: 'button', onclick: async () => toast(`${await store.gcMedia()} unbenutzte Datei(en) gelöscht`) }, 'Unbenutzte Medien löschen')));

  add(h('h3', {}, 'Info'));
  add(field('Version', h('span', {}, `Cue Player ${APP_VERSION}`)));
  add(field('Tastatur', h('span', { class: 'muted' }, 'Leertaste = GO · Esc = Stop alle · ↑/↓ = Standby wählen · Strg+E = Edit/Show')));

  const dlg = $('#dlg-settings');
  if (!dlg.open) dlg.showModal();
}

// ---------------------------------------------------------------------------
// Wake Lock, Service Worker

async function applyWakeLock() {
  try {
    if (settings().wakeLock && 'wakeLock' in navigator && document.visibilityState === 'visible') {
      if (!state.wakeLock || state.wakeLock.released) state.wakeLock = await navigator.wakeLock.request('screen');
    } else if (state.wakeLock) {
      await state.wakeLock.release();
      state.wakeLock = null;
    }
  } catch { /* z. B. Energiesparmodus */ }
}

function registerSW() {
  if (!('serviceWorker' in navigator) || location.protocol === 'file:') return;
  navigator.serviceWorker.register('sw.js').then((reg) => {
    reg.addEventListener('updatefound', () => {
      const w = reg.installing;
      w?.addEventListener('statechange', () => {
        if (w.state === 'installed' && navigator.serviceWorker.controller) toast('Update geladen – beim nächsten Start aktiv');
      });
    });
  }).catch((e) => console.warn('Service Worker:', e));
}

// ---------------------------------------------------------------------------
// Ereignisse

function bindUI() {
  $('#btn-go').addEventListener('click', go);
  $('#btn-stopall').addEventListener('click', (e) => stopAll(e.shiftKey));
  $('#btn-pauseall').addEventListener('click', () => engine.pauseAll(settings().pauseAllFade));
  $('#btn-resumeall').addEventListener('click', () => engine.resumeAll(settings().pauseAllFade));
  $('#master').addEventListener('input', (e) => {
    const db = parseFloat(e.target.value);
    settings().masterDb = db;
    $('#master-val').textContent = fmtDb(db);
    engine.ensureContext();
    engine.setMaster(db);
    save();
  });
  $('#session-name').addEventListener('input', (e) => { state.session.name = e.target.value; save(); });

  $('#btn-add-audio').addEventListener('click', () => $('#file-audio').click());
  $('#btn-empty-add').addEventListener('click', () => $('#file-audio').click());
  $('#file-audio').addEventListener('change', (e) => { addAudioFiles(e.target.files); e.target.value = ''; });
  $('#btn-add-cue').addEventListener('click', (e) => { e.stopPropagation(); $('#add-menu').hidden = !$('#add-menu').hidden; });
  $('#add-menu').addEventListener('click', (e) => {
    const t = e.target.closest('[data-add]');
    if (t) { $('#add-menu').hidden = true; addCue(t.dataset.add); }
  });
  document.addEventListener('click', () => { $('#add-menu').hidden = true; });

  $('#btn-layout').addEventListener('click', () => {
    settings().layout = settings().layout === 'cart' ? 'list' : 'cart';
    save();
    renderAll();
  });
  $('#btn-showmode').addEventListener('click', toggleShowMode);
  $('#btn-settings').addEventListener('click', openSettings);

  $('#btn-sessions').addEventListener('click', async () => { await renderSessions(); $('#dlg-sessions').showModal(); });
  $('#ses-new').addEventListener('click', async () => {
    const name = prompt('Name der neuen Show:', 'Neue Show');
    if (name == null) return;
    await store.saveSession(state.session);
    const s = newSession(name || 'Neue Show');
    await store.saveSession(s);
    await openSession(s);
    $('#dlg-sessions').close();
  });
  $('#ses-export').addEventListener('click', () => exportCurrent().catch((e) => toast('Export fehlgeschlagen: ' + e.message, true)));
  $('#ses-import').addEventListener('click', () => $('#file-import').click());
  $('#file-import').addEventListener('change', async (e) => {
    const f = e.target.files[0];
    e.target.value = '';
    if (!f) return;
    try {
      await store.saveSession(state.session);
      const s = await store.importShow(f);
      await openSession(s);
      $('#dlg-sessions').close();
      toast(`„${s.name}“ importiert`);
    } catch (err) {
      toast('Import fehlgeschlagen: ' + err.message, true);
    }
  });

  // Drag & Drop: Dateien aus dem Dateimanager und Umsortieren der Liste
  let dragDepth = 0;
  const hasFiles = (e) => [...(e.dataTransfer?.types ?? [])].includes('Files');
  window.addEventListener('dragenter', (e) => { if (hasFiles(e) && !settings().showMode) { dragDepth++; $('#drop-overlay').hidden = false; } });
  window.addEventListener('dragleave', (e) => { if (hasFiles(e) && --dragDepth <= 0) { dragDepth = 0; $('#drop-overlay').hidden = true; } });
  window.addEventListener('dragover', (e) => e.preventDefault());
  window.addEventListener('drop', (e) => {
    e.preventDefault();
    dragDepth = 0;
    $('#drop-overlay').hidden = true;
    if (hasFiles(e)) {
      if (!settings().showMode) addAudioFiles(e.dataTransfer.files);
      return;
    }
    const id = e.dataTransfer.getData('text/x-cue');
    if (id) moveCueTo(id, e.target.closest?.('.cue-row')?.dataset.id ?? null);
  });
  $('#cue-rows').addEventListener('dragstart', (e) => {
    const row = e.target.closest('.cue-row');
    if (row) { e.dataTransfer.setData('text/x-cue', row.dataset.id); e.dataTransfer.effectAllowed = 'move'; }
  });

  // Tastatur
  window.addEventListener('keydown', onKeyDown, true);
  window.addEventListener('keyup', (e) => { if (e.code === 'Space' && !isTyping(e) && !dialogOpen()) e.preventDefault(); }, true);

  // Erste Benutzeraktion: Audio-Kontext erzeugen (Autoplay-Richtlinien)
  const unlock = () => { engine.ensureContext(); };
  window.addEventListener('pointerdown', unlock, { once: true, capture: true });
  window.addEventListener('keydown', unlock, { once: true, capture: true });

  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') applyWakeLock(); });
  window.addEventListener('beforeunload', (e) => {
    store.saveSession(state.session);
    if (engine.active().length) { e.preventDefault(); e.returnValue = ''; }
  });

  // Engine-Ereignisse
  engine.on('change', () => { state.runningDirty = true; });
  engine.on('duration', () => { save(); state.rows.forEach((r) => { r.lastState = null; }); state.tiles.forEach((t) => { t.lastState = null; }); });
  engine.on('error', (msg) => toast(msg, true));
  engine.on('info', (msg) => toast(msg));

  // MIDI
  midi.on('trigger', (key) => {
    if (state.learn?.kind === 'midi') { state.learn.apply(key); return; }
    if (dialogOpen()) return;
    const s = settings().midi;
    if (key === s.go) go();
    if (key === s.stopAll) stopAll();
    cues().forEach((c) => { if (c.midiTrigger === key) engine.go(c.id); });
  });
}

function toggleShowMode() {
  settings().showMode = !settings().showMode;
  save();
  renderAll();
  toast(settings().showMode ? 'Show-Modus: Bearbeiten gesperrt' : 'Bearbeiten freigegeben');
}

function onKeyDown(e) {
  if (state.learn?.kind === 'key') {
    if (['ShiftLeft', 'ShiftRight', 'ControlLeft', 'ControlRight', 'AltLeft', 'AltRight', 'MetaLeft', 'MetaRight'].includes(e.code)) return;
    e.preventDefault();
    e.stopPropagation();
    if (e.code === 'Escape') { state.learn.apply(''); return; }
    if (['Space', 'ArrowUp', 'ArrowDown'].includes(e.code)) { toast('Diese Taste ist reserviert', true); return; }
    state.learn.apply(e.code);
    return;
  }
  if (dialogOpen() || isTyping(e)) return;
  if (e.ctrlKey && e.code === 'KeyE') { e.preventDefault(); toggleShowMode(); return; }
  if (e.ctrlKey || e.metaKey || e.altKey) return;

  switch (e.code) {
    case 'Space':
      e.preventDefault();
      if (!e.repeat) go();
      return;
    case 'Escape':
      e.preventDefault();
      stopAll(e.shiftKey);
      return;
    case 'ArrowDown':
    case 'ArrowUp': {
      e.preventDefault();
      const list = cues();
      const i = list.findIndex((c) => c.id === state.standbyId);
      const j = e.code === 'ArrowDown' ? (i < 0 ? 0 : Math.min(list.length - 1, i + 1)) : (i < 0 ? list.length - 1 : Math.max(0, i - 1));
      if (list[j]) setStandby(list[j].id);
      return;
    }
  }
  if (e.repeat) return;
  const hits = cues().filter((c) => c.hotkey === e.code);
  if (hits.length) {
    e.preventDefault();
    hits.forEach((c) => engine.go(c.id));
  }
}

// Für automatisierte Tests und Fehlersuche in den DevTools.
window.cuePlayer = { engine, state };

bindUI();
init();
