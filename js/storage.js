// Persistenz im Browser (IndexedDB) sowie Export/Import von Shows als .cueshow-Datei.
import { uid } from './util.js';
import { migratePreset } from './model.js';

const DB_NAME = 'cue-player';
const DB_VERSION = 2; // 2: Store „presets“
let dbPromise = null;
let onBlock = () => {};

/**
 * Hinweise bei Upgrades mit mehreren offenen Tabs: fn('blocked') – ein anderer Tab hält die alte Datenbank offen,
 * fn('unblocked') – Upgrade läuft weiter, fn('versionchange') – ein anderer Tab braucht eine neuere Version
 * (die Verbindung wird hier geschlossen, diese Seite muss neu geladen werden).
 */
export function onDbBlock(fn) { onBlock = fn; }

function db() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      let blocked = false;
      req.onblocked = () => { blocked = true; onBlock('blocked'); };
      req.onupgradeneeded = () => {
        const d = req.result;
        if (!d.objectStoreNames.contains('sessions')) d.createObjectStore('sessions', { keyPath: 'id' });
        if (!d.objectStoreNames.contains('media')) d.createObjectStore('media', { keyPath: 'id' });
        if (!d.objectStoreNames.contains('meta')) d.createObjectStore('meta', { keyPath: 'key' });
        if (!d.objectStoreNames.contains('presets')) d.createObjectStore('presets', { keyPath: 'id' });
      };
      req.onsuccess = () => {
        const d = req.result;
        if (blocked) onBlock('unblocked');
        d.onversionchange = () => { d.close(); onBlock('versionchange'); };
        resolve(d);
      };
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

async function tx(store, mode, fn) {
  const d = await db();
  return new Promise((resolve, reject) => {
    const t = d.transaction(store, mode);
    const s = t.objectStore(store);
    let result;
    Promise.resolve(fn(s)).then((r) => { result = r; });
    t.oncomplete = () => resolve(result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}

const req2p = (req) => new Promise((res, rej) => { req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error); });
const getAll = (store) => tx(store, 'readonly', (s) => req2p(s.getAll()));

export async function listSessions() {
  return (await getAll('sessions'))
    .map(({ id, name, updated, cues }) => ({ id, name, updated, count: cues?.length ?? 0 }))
    .sort((a, b) => (b.updated || 0) - (a.updated || 0));
}

export const loadSession = (id) => tx('sessions', 'readonly', (s) => req2p(s.get(id)));

export function saveSession(session) {
  session.updated = Date.now();
  // structuredClone entfernt evtl. angehängte Laufzeitdaten nicht – Sessions enthalten nur JSON-Daten.
  return tx('sessions', 'readwrite', (s) => s.put(JSON.parse(JSON.stringify(session))));
}

export async function deleteSession(id) {
  await tx('sessions', 'readwrite', (s) => s.delete(id));
  await tx('meta', 'readwrite', (s) => s.delete('standby:' + id));
}

export const putMedia = (rec) => tx('media', 'readwrite', (s) => s.put(rec));
export const getMedia = (id) => tx('media', 'readonly', (s) => req2p(s.get(id)));

export async function storeFile(file) {
  const rec = { id: uid(), name: file.name, type: file.type, size: file.size, blob: file };
  await putMedia(rec);
  return rec;
}

/** Löscht Mediendateien, die von keiner Session und keinem Preset mehr referenziert werden. */
export async function gcMedia() {
  const owners = [...await getAll('sessions'), ...await listPresets()];
  const used = new Set(owners.flatMap((o) => o.cues ?? []).map((c) => c.mediaId).filter(Boolean));
  const keys = await tx('media', 'readonly', (s) => req2p(s.getAllKeys()));
  const unused = keys.filter((k) => !used.has(k));
  if (unused.length) await tx('media', 'readwrite', (s) => unused.forEach((k) => s.delete(k)));
  return unused.length;
}

// --- Presets (global, für alle Shows) ---
export async function listPresets() {
  const all = await getAll('presets');
  all.forEach(migratePreset);
  return all.sort((a, b) => a.name.localeCompare(b.name, 'de'));
}
export const savePreset = (p) => tx('presets', 'readwrite', (s) => s.put(JSON.parse(JSON.stringify(p))));
export const deletePreset = (id) => tx('presets', 'readwrite', (s) => s.delete(id));

export const getMeta = async (key) => (await tx('meta', 'readonly', (s) => req2p(s.get(key))))?.value;
export const setMeta = (key, value) => tx('meta', 'readwrite', (s) => s.put({ key, value }));

// ---------------------------------------------------------------------------
// .cueshow-Format:  "CUESHOW1" | uint32 LE Header-Länge | Header (JSON, UTF-8) | Mediendaten hintereinander
// Header: { format: 1, session, media: [{ id, name, type, offset, length }] }

const MAGIC = 'CUESHOW1';

export async function exportShow(session) {
  const ids = [...new Set(session.cues.map((c) => c.mediaId).filter(Boolean))];
  const media = [];
  const blobs = [];
  let offset = 0;
  for (const id of ids) {
    const rec = await getMedia(id);
    if (!rec) continue;
    media.push({ id, name: rec.name, type: rec.type, offset, length: rec.blob.size });
    blobs.push(rec.blob);
    offset += rec.blob.size;
  }
  const header = new TextEncoder().encode(JSON.stringify({ format: 1, session, media }));
  const len = new Uint8Array(4);
  new DataView(len.buffer).setUint32(0, header.length, true);
  return new Blob([MAGIC, len, header, ...blobs], { type: 'application/octet-stream' });
}

const isObj = (v) => typeof v === 'object' && v !== null && !Array.isArray(v);
const isSize = (v) => Number.isSafeInteger(v) && v >= 0;

/** Prüft Header und Medienangaben einer .cueshow vollständig, bevor etwas gespeichert wird. */
function validShow(header, dataSize) {
  if (!isObj(header) || header.format !== 1) return false;
  const s = header.session;
  if (!isObj(s) || !Array.isArray(s.cues) || !s.cues.every((c) => isObj(c) && typeof c.type === 'string')) return false;
  if (s.settings !== undefined && !isObj(s.settings)) return false;
  return Array.isArray(header.media) && header.media.every((m) => isObj(m) && typeof m.id === 'string'
    && isSize(m.offset) && isSize(m.length) && m.offset + m.length <= dataSize);
}

export async function importShow(file) {
  const invalid = () => new Error('Keine gültige .cueshow-Datei');
  if (file.size < 12) throw invalid();
  const head = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  if (new TextDecoder().decode(head.slice(0, 8)) !== MAGIC) throw invalid();
  const hlen = new DataView(head.buffer).getUint32(8, true);
  if (hlen > file.size - 12) throw invalid();
  let header;
  try {
    header = JSON.parse(new TextDecoder().decode(await file.slice(12, 12 + hlen).arrayBuffer()));
  } catch {
    throw invalid();
  }
  const base = 12 + hlen;
  if (!validShow(header, file.size - base)) throw invalid();
  // Neue Media-IDs vergeben, damit Importe bestehende Shows nie überschreiben.
  const idMap = new Map();
  for (const m of header.media) {
    const blob = file.slice(base + m.offset, base + m.offset + m.length, m.type);
    // In einen eigenständigen Blob kopieren (die Quelldatei kann später verschwinden).
    const copy = new Blob([await blob.arrayBuffer()], { type: m.type });
    const id = uid();
    idMap.set(m.id, id);
    await putMedia({ id, name: m.name, type: m.type, size: m.length, blob: copy });
  }
  const session = header.session;
  session.id = uid();
  session.cues.forEach((c) => { if (c.mediaId) c.mediaId = idMap.get(c.mediaId) ?? null; });
  await saveSession(session);
  return session;
}
