// Namen und Notizen als Markdown: ein Abschnitt je Cue, getrennt durch <!-- cue:<id> … -->.
import { ToolError } from './io.mjs';
import { MARK } from './check.mjs';

const HEAD = /^<!-- cueshow-texte format=(\S+)(?: show=(\S*))? -->$/;
const CUE = /^<!-- cue:(\S+)(?: [^\n]*)? -->$/;
const H1 = /^#(?: (.*))?$/;
const H2 = /^##(?: (.*))?$/;

const str = (v) => (typeof v === 'string' ? v : '');
const lines = (t) => t.replace(/^﻿/, '').replace(/\r\n?/g, '\n').split('\n');
const blank = (l) => l.trim() === '';

/** Leerzeilen am Anfang und Ende weg, Zeilenenden einheitlich. */
function tidy(text) {
  const l = lines(str(text));
  while (l.length && blank(l[0])) l.shift();
  while (l.length && blank(l[l.length - 1])) l.pop();
  return l.join('\n');
}

export function textsToMarkdown(session) {
  const name = str(session.name);
  if (name.includes('\n') || name.includes('\r')) throw new ToolError('Show-Name enthält einen Zeilenumbruch');
  const out = [`<!-- cueshow-texte format=1 show=${session.id} -->`, name ? `# ${name}` : '#'];
  session.cues.forEach((c, i) => {
    const where = `Cue ${i + 1}`;
    if (typeof c.id !== 'string' || !/^[^\s>]+$/.test(c.id)) throw new ToolError(`${where} · id: für texts unbrauchbar (${JSON.stringify(c.id)})`);
    const n = str(c.name);
    const notes = str(c.notes);
    if (/[\r\n]/.test(n)) throw new ToolError(`${where} · name: enthält einen Zeilenumbruch`);
    for (const [k, v] of [['name', n], ['notes', notes]]) {
      if (v.includes(MARK)) throw new ToolError(`${where} · ${k}: enthält „${MARK}“, das lässt sich nicht eindeutig einlesen`);
    }
    out.push('', `<!-- cue:${c.id} nr=${i + 1} typ=${c.type} -->`, n ? `## ${n}` : '##');
    const t = tidy(notes);
    if (t) out.push('', t);
  });
  return out.join('\n') + '\n';
}

/** Liest eine mit textsToMarkdown erzeugte (und bearbeitete) Datei. Ergebnis: { showId, name|null, cues: [{ id, name, notes }] } */
export function parseTexts(md) {
  const l = lines(md);
  let i = 0;
  while (i < l.length && blank(l[i])) i++;
  const head = l[i]?.trim().match(HEAD);
  if (!head) throw new ToolError('Kopfzeile „<!-- cueshow-texte format=1 … -->“ fehlt (Datei nicht mit texts erzeugt?)');
  if (head[1] !== '1') throw new ToolError(`Kopfzeile: Format ${head[1]} wird nicht unterstützt`);
  const result = { showId: head[2] ?? null, name: null, cues: [] };
  i++;
  // Vor dem ersten Abschnitt: optional der Show-Name.
  for (; i < l.length && !CUE.test(l[i]); i++) {
    const m = l[i].match(H1);
    if (m && result.name === null && !H2.test(l[i])) result.name = m[1] ?? '';
  }
  const seen = new Set();
  while (i < l.length) {
    const id = l[i].match(CUE)[1];
    if (seen.has(id)) throw new ToolError(`Abschnitt <!-- cue:${id} --> doppelt`);
    seen.add(id);
    i++;
    while (i < l.length && blank(l[i]) && !CUE.test(l[i])) i++;
    const h = i < l.length ? l[i].match(H2) : null;
    if (!h) throw new ToolError(`Abschnitt <!-- cue:${id} -->: erste Zeile muss der Name mit „## “ sein`);
    i++;
    const body = [];
    for (; i < l.length && !CUE.test(l[i]); i++) body.push(l[i]);
    result.cues.push({ id, name: h[1] ?? '', notes: tidy(body.join('\n')) });
  }
  return result;
}

/**
 * Schreibt Namen und Notizen in eine Kopie der Session. Ergebnis: { session, changes: [{ ort, feld, alt, neu }], warnings }.
 * Fehlende Cues bleiben unverändert; unbekannte IDs und Texte einer anderen Show (ohne force) sind Fehler.
 */
export function applyTexts(session, parsed, { force = false } = {}) {
  const warnings = [];
  if (parsed.showId !== null && parsed.showId !== session.id) {
    const msg = `Die Texte gehören zu einer anderen Show (show=${parsed.showId}, diese Show: ${session.id})`;
    if (!force) throw new ToolError(`${msg}. Trotzdem einspielen mit --force`);
    warnings.push(msg);
  }
  const out = structuredClone(session);
  const index = new Map(out.cues.map((c, i) => [c.id, i]));
  for (const t of parsed.cues) {
    if (!index.has(t.id)) throw new ToolError(`Cue-ID „${t.id}“ gibt es in der Show nicht`);
  }
  const changes = [];
  if (parsed.name !== null && parsed.name !== str(out.name)) {
    changes.push({ ort: 'Show', feld: 'name', alt: str(out.name), neu: parsed.name });
    out.name = parsed.name;
  }
  const byId = new Map(parsed.cues.map((t) => [t.id, t]));
  out.cues.forEach((c, i) => {
    const t = byId.get(c.id);
    if (!t) return;
    if (t.name !== str(c.name)) {
      changes.push({ ort: `Cue ${i + 1}`, feld: 'name', alt: str(c.name), neu: t.name });
      c.name = t.name;
    }
    if (t.notes !== tidy(c.notes)) {
      changes.push({ ort: `Cue ${i + 1}`, feld: 'notes', alt: str(c.notes), neu: t.notes });
      c.notes = t.notes;
    }
  });
  return { session: out, changes, warnings };
}
