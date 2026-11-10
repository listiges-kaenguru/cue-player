// Dateiformat .cueshow, ohne Speicherung: läuft im Browser (storage.js) und in Node (tools/cueshow.mjs).
//
//   "CUESHOW1" | uint32 LE Header-Länge | Header (JSON, UTF-8) | Mediendaten hintereinander
//   Header: { format: 1, session, media: [{ id, name, type, offset, length }] }, offset ab Ende des Headers

export const MAGIC = 'CUESHOW1';
export const FORMAT = 1;
export const INVALID = 'Keine gültige .cueshow-Datei';
const HEAD = MAGIC.length + 4;

const isObj = (v) => typeof v === 'object' && v !== null && !Array.isArray(v);
const isSize = (v) => Number.isSafeInteger(v) && v >= 0;

/** Prüft Header und Medienangaben einer .cueshow vollständig, bevor etwas gespeichert wird. */
export function validShow(header, dataSize) {
  if (!isObj(header) || header.format !== FORMAT) return false;
  const s = header.session;
  if (!isObj(s) || !Array.isArray(s.cues) || !s.cues.every((c) => isObj(c) && typeof c.type === 'string')) return false;
  if (s.settings !== undefined && !isObj(s.settings)) return false;
  return Array.isArray(header.media) && header.media.every((m) => isObj(m) && typeof m.id === 'string'
    && isSize(m.offset) && isSize(m.length) && m.offset + m.length <= dataSize);
}

/**
 * Setzt eine Datei zusammen. items: [{ id, name, type, blob }] in der gewünschten Reihenfolge.
 * Die Medien werden nur verkettet, nicht in den Speicher kopiert.
 */
export function buildShowFile(session, items) {
  const media = [];
  let offset = 0;
  for (const { id, name, type, blob } of items) {
    media.push({ id, name, type, offset, length: blob.size });
    offset += blob.size;
  }
  const header = new TextEncoder().encode(JSON.stringify({ format: FORMAT, session, media }));
  const len = new Uint8Array(4);
  new DataView(len.buffer).setUint32(0, header.length, true);
  return new Blob([MAGIC, len, header, ...items.map((m) => m.blob)], { type: 'application/octet-stream' });
}

/** Liest und prüft den Header. Ergebnis: { header, base } (base = Beginn der Mediendaten). Fehler: INVALID. */
export async function readShowFile(blob) {
  const invalid = () => new Error(INVALID);
  if (blob.size < HEAD) throw invalid();
  const head = new Uint8Array(await blob.slice(0, HEAD).arrayBuffer());
  if (new TextDecoder().decode(head.slice(0, MAGIC.length)) !== MAGIC) throw invalid();
  const hlen = new DataView(head.buffer).getUint32(MAGIC.length, true);
  if (hlen > blob.size - HEAD) throw invalid();
  let header;
  try {
    header = JSON.parse(new TextDecoder().decode(await blob.slice(HEAD, HEAD + hlen).arrayBuffer()));
  } catch {
    throw invalid();
  }
  const base = HEAD + hlen;
  if (!validShow(header, blob.size - base)) throw invalid();
  return { header, base };
}

/** Ausschnitt eines Mediums (verweist auf die Quelle, kopiert nichts). */
export const mediaBlob = (blob, base, m) => blob.slice(base + m.offset, base + m.offset + m.length, m.type);
