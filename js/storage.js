// Persistenz im Browser (IndexedDB) sowie Export/Import von Shows als .cueshow-Datei.
import { uid } from './util.js';
import { migratePreset } from './model.js';

const DB_NAME = 'cue-player';
const DB_VERSION = 2; // 2: Store „presets“
let dbPromise = null;

function db() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const d = req.result;
        if (!d.objectStoreNames.contains('sessions')) d.createObjectStore('sessions', { keyPath: 'id' });
        if (!d.objectStoreNames.contains('media')) d.createObjectStore('media', { keyPath: 'id' });
        if (!d.objectStoreNames.contains('meta')) d.createObjectStore('meta', { keyPath: 'key' });
        if (!d.objectStoreNames.contains('presets')) d.createObjectStore('presets', { keyPath: 'id' });
      };
      req.onsuccess = () => resolve(req.result);
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

export async function listSessions() {
  const all = await tx('sessions', 'readonly', (s) => req2p(s.getAll()));
  return all
    .map(({ id, name, updated, cues }) => ({ id, name, updated, count: cues?.length ?? 0 }))
    .sort((a, b) => (b.updated || 0) - (a.updated || 0));
}

export const loadSession = (id) => tx('sessions', 'readonly', (s) => req2p(s.get(id)));

export function saveSession(session) {
  session.updated = Date.now();
  // structuredClone entfernt evtl. angehängte Laufzeitdaten nicht – Sessions enthalten nur JSON-Daten.
  return tx('sessions', 'readwrite', (s) => s.put(JSON.parse(JSON.stringify(session))));
}

export const deleteSession = (id) => tx('sessions', 'readwrite', (s) => s.delete(id));

export const putMedia = (rec) => tx('media', 'readwrite', (s) => s.put(rec));
export const getMedia = (id) => tx('media', 'readonly', (s) => req2p(s.get(id)));

export async function storeFile(file) {
  const rec = { id: uid(), name: file.name, type: file.type, size: file.size, blob: file };
  await putMedia(rec);
  return rec;
}

/** Löscht Mediendateien, die von keiner Session und keinem Preset mehr referenziert werden. */
export async function gcMedia() {
  const sessions = await tx('sessions', 'readonly', (s) => req2p(s.getAll()));
  const presets = await listPresets();
  const used = new Set();
  sessions.forEach((se) => se.cues?.forEach((c) => c.mediaId && used.add(c.mediaId)));
  presets.forEach((p) => p.cues.forEach((c) => c.mediaId && used.add(c.mediaId)));
  const keys = await tx('media', 'readonly', (s) => req2p(s.getAllKeys()));
  const unused = keys.filter((k) => !used.has(k));
  if (unused.length) await tx('media', 'readwrite', (s) => unused.forEach((k) => s.delete(k)));
  return unused.length;
}

// --- Presets (global, für alle Shows) ---
export async function listPresets() {
  const all = await tx('presets', 'readonly', (s) => req2p(s.getAll()));
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

export async function importShow(file) {
  const head = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  if (new TextDecoder().decode(head.slice(0, 8)) !== MAGIC) throw new Error('Keine gültige .cueshow-Datei');
  const hlen = new DataView(head.buffer).getUint32(8, true);
  const header = JSON.parse(new TextDecoder().decode(await file.slice(12, 12 + hlen).arrayBuffer()));
  const base = 12 + hlen;
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
