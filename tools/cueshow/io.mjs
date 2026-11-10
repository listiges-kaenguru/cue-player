// Show lesen (.cueshow oder entpackter Ordner) und sicher schreiben. Medien werden gestreamt, nie ganz geladen.
import fs from 'node:fs/promises';
import { createWriteStream, openAsBlob } from 'node:fs';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { FORMAT, buildShowFile, readShowFile, mediaBlob } from '../../js/showfile.js';
import { mediaFileNames, typeForFile } from './names.mjs';

/** Fehler für die Kommandozeile. code 1: Show fehlerhaft, code 2: falscher Aufruf. */
export class ToolError extends Error {
  constructor(message, code = 1) {
    super(message);
    this.code = code;
  }
}

const isObj = (v) => typeof v === 'object' && v !== null && !Array.isArray(v);
const exists = (p) => fs.lstat(p).then(() => true, () => false);

/**
 * Öffnet eine Show. Ergebnis:
 * { kind: 'file'|'folder', path, header: { format, session, media: [{ id, name, type, file? | offset?, length? }] },
 *   blobs: Map, warnings }
 */
export async function openShow(p) {
  const st = await fs.stat(p).catch(() => null);
  if (!st) throw new ToolError(`Quelle nicht gefunden: ${p}`, 2);
  return st.isDirectory() ? openFolder(p) : openFile(p);
}

async function openFile(p) {
  const blob = await openAsBlob(p);
  let res;
  try {
    res = await readShowFile(blob);
  } catch (e) {
    throw new ToolError(`${e.message}: ${p}`);
  }
  const { header, base } = res;
  const blobs = new Map(header.media.map((m) => [m.id, mediaBlob(blob, base, m)]));
  const media = header.media.map(({ id, name, type, offset, length }) => ({ id, name, type, offset, length }));
  return {
    kind: 'file', path: p, fileSize: blob.size, headerSize: base - 12,
    header: { format: header.format, session: header.session, media }, blobs, warnings: [],
  };
}

/** Pfad aus show.json auflösen; muss eine Datei innerhalb des Show-Ordners sein (auch nach Symlinks). */
async function resolveInside(root, file, where) {
  if (typeof file !== 'string' || !file) throw new ToolError(`${where}: „file“ fehlt oder ist kein Text`);
  if (path.isAbsolute(file) || /^[a-z]:/i.test(file) || file.includes('\\') || file.includes('\0')) {
    throw new ToolError(`${where}: ungültiger Pfad „${file}“ (nur relative Pfade mit /)`);
  }
  const norm = path.posix.normalize(file);
  if (norm === '..' || norm.startsWith('../')) throw new ToolError(`${where}: „${file}“ liegt außerhalb des Show-Ordners`);
  const full = path.join(root, norm);
  const real = await fs.realpath(full).catch(() => null);
  if (!real) throw new ToolError(`${where}: Datei nicht gefunden: ${file}`);
  if (!real.startsWith(root + path.sep)) throw new ToolError(`${where}: „${file}“ liegt außerhalb des Show-Ordners`);
  if (!(await fs.stat(real)).isFile()) throw new ToolError(`${where}: „${file}“ ist keine Datei`);
  return real;
}

async function openFolder(dir) {
  const root = await fs.realpath(dir);
  const jsonPath = path.join(root, 'show.json');
  const text = await fs.readFile(jsonPath, 'utf8').catch(() => null);
  if (text === null) throw new ToolError(`show.json fehlt in ${dir}`, 2);
  let h;
  try {
    h = JSON.parse(text.replace(/^﻿/, ''));
  } catch (e) {
    throw new ToolError(`show.json ist kein gültiges JSON: ${e.message}`);
  }
  if (!isObj(h)) throw new ToolError('show.json: kein Objekt');
  if (h.format !== FORMAT) throw new ToolError(`show.json: Format ${JSON.stringify(h.format)} wird nicht unterstützt (erwartet ${FORMAT})`);
  const s = h.session;
  if (!isObj(s) || !Array.isArray(s.cues) || !s.cues.every((c) => isObj(c) && typeof c.type === 'string')
    || (s.settings !== undefined && !isObj(s.settings))) {
    throw new ToolError('show.json: „session“ ungültig (Objekt mit „cues“: Liste von Cues mit „type“ erwartet)');
  }
  if (!Array.isArray(h.media)) throw new ToolError('show.json: „media“ muss eine Liste sein');
  const warnings = [];
  const blobs = new Map();
  const media = [];
  for (const [i, m] of h.media.entries()) {
    const where = `media[${i}]`;
    if (!isObj(m)) throw new ToolError(`${where}: kein Objekt`);
    if (typeof m.id !== 'string' || !m.id) throw new ToolError(`${where}: „id“ fehlt oder ist kein Text`);
    if (blobs.has(m.id)) throw new ToolError(`${where}: id „${m.id}“ doppelt`);
    const real = await resolveInside(root, m.file, where);
    let { name, type } = m;
    if (name === undefined) {
      name = path.posix.basename(m.file);
      warnings.push(`${where}: „name“ fehlt, verwendet „${name}“`);
    } else if (typeof name !== 'string') throw new ToolError(`${where}: „name“ ist kein Text`);
    if (type === undefined) {
      type = typeForFile(m.file) || 'application/octet-stream';
      warnings.push(`${where}: „type“ fehlt, verwendet „${type}“`);
    } else if (typeof type !== 'string') throw new ToolError(`${where}: „type“ ist kein Text`);
    blobs.set(m.id, await openAsBlob(real, { type }));
    media.push({ id: m.id, name, type, file: m.file });
  }
  return { kind: 'folder', path: dir, header: { format: h.format, session: s, media }, blobs, warnings };
}

const tmpName = (target) => `${target}.tmp-${process.pid}-${randomBytes(4).toString('hex')}`;

async function checkTarget(target, force) {
  if (await exists(target) && !force) throw new ToolError(`Ziel existiert bereits: ${target} (überschreiben mit --force)`, 2);
}

/** Erst in eine Zwischendatei bzw. einen Zwischenordner schreiben, dann umbenennen. Bei Fehlern wird aufgeräumt. */
async function atomically(target, force, write) {
  await checkTarget(target, force);
  const tmp = tmpName(target);
  try {
    await write(tmp);
    if (await exists(target)) await fs.rm(target, { recursive: true, force: true });
    await fs.rename(tmp, target);
  } catch (e) {
    await fs.rm(tmp, { recursive: true, force: true });
    throw e;
  }
}

const writeBlob = (blob, file) => pipeline(Readable.fromWeb(blob.stream()), createWriteStream(file, { flags: 'wx' }));

/** Entpackt in einen Ordner: show.json (eingerückt) + media/<Name>. */
export async function writeFolder(show, outDir, { force = false } = {}) {
  const { header, blobs } = show;
  const names = mediaFileNames(header.media);
  let bytes = 0;
  await atomically(outDir, force, async (tmp) => {
    await fs.mkdir(path.join(tmp, 'media'), { recursive: true });
    for (const [i, m] of header.media.entries()) {
      const blob = blobs.get(m.id);
      await writeBlob(blob, path.join(tmp, 'media', names[i]));
      bytes += blob.size;
    }
    const media = header.media.map((m, i) => ({ id: m.id, name: m.name, type: m.type, file: `media/${names[i]}` }));
    const json = JSON.stringify({ format: header.format, session: header.session, media }, null, 2) + '\n';
    await fs.writeFile(path.join(tmp, 'show.json'), json, { flag: 'wx' });
  });
  return { outDir, cues: header.session.cues.length, media: header.media.length, bytes };
}

/** Packt zu einer .cueshow. Nur Medien, die eine Cue nennt (wie der Export der App). */
export async function writeShowFile(show, outFile, { force = false } = {}) {
  const { header, blobs } = show;
  const used = new Set(header.session.cues.map((c) => c.mediaId).filter(Boolean));
  const warnings = [];
  const items = [];
  for (const m of header.media) {
    if (used.has(m.id)) items.push({ id: m.id, name: m.name, type: m.type, blob: blobs.get(m.id) });
    else warnings.push(`Medium „${m.name}“${m.file ? ` (${m.file})` : ''} wird von keiner Cue genannt und nicht eingepackt`);
  }
  const blob = buildShowFile(header.session, items);
  await atomically(outFile, force, (tmp) => writeBlob(blob, tmp));
  return { outFile, bytes: blob.size, warnings };
}

/** Freier Name neben der Quelle: base+ext, sonst base-2+ext, base-3+ext … */
export async function freePath(base, ext) {
  let p = base + ext;
  for (let k = 2; await exists(p); k++) p = `${base}-${k}${ext}`;
  return p;
}
