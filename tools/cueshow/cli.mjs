// Kommandozeile des Werkzeugs: Argumente, Befehle, Ausgabe, Exit-Codes (0 in Ordnung, 1 Show fehlerhaft, 2 Aufruf).
import fs from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { ToolError, openShow, writeFolder, writeShowFile, writeTextFile, freePath } from './io.mjs';
import { checkShow } from './check.mjs';
import { showInfo, formatInfo, formatBytes } from './info.mjs';
import { textsToMarkdown, parseTexts, applyTexts } from './texts.mjs';

const HELP = {
  unpack: ['unpack <show.cueshow> [-o ordner] [--force]', 'In einen Ordner entpacken: show.json + media/<Name>. Ohne -o neben der Quelle.'],
  pack: ['pack <ordner> [-o show.cueshow] [--force]', 'Ordner prüfen und zu einer .cueshow packen. Ohne -o: <ordner>-neu.cueshow.'],
  info: ['info <show.cueshow | ordner> [--json]', 'Übersicht: Cues je Typ, Abläufe, Trigger, Medien mit Größe.'],
  check: ['check <show.cueshow | ordner> [--streng]', 'Streng prüfen. Exit 1 bei Fehlern, mit --streng auch bei Warnungen.'],
  texts: ['texts <show.cueshow | ordner> [-o texte.md] [--force]', 'Show-Name, Cue-Namen und Notizen als Markdown. Ohne -o: <show>-texte.md.'],
  'apply-texts': ['apply-texts <show.cueshow | ordner> <texte.md> [-o ziel] [--probe] [--force]',
    'Texte in eine neue Show schreiben (Original bleibt). --probe zeigt nur die Änderungen.\n'
    + '  --force: auch Texte einer anderen Show einspielen bzw. das Ziel überschreiben.'],
};

function help(cmd) {
  if (cmd && HELP[cmd]) return `node tools/cueshow.mjs ${HELP[cmd][0]}\n  ${HELP[cmd][1]}\n`;
  return ['Werkzeug für .cueshow-Dateien (Cue Player, Entwicklung)', '', 'node tools/cueshow.mjs <befehl> [optionen]', '',
    ...Object.values(HELP).map(([u, d]) => `  ${u}\n      ${d.replace(/\n {2}/g, '\n      ')}`), '',
    'Allgemein: -o/--output Ziel, --force überschreiben, --debug Stacktrace bei Fehlern.',
    'Exit-Codes: 0 in Ordnung, 1 Fehler in der Show, 2 falscher Aufruf.', 'help <befehl> zeigt die Hilfe zu einem Befehl.', ''].join('\n');
}

const OPTIONS = {
  output: { type: 'string', short: 'o' },
  force: { type: 'boolean' },
  streng: { type: 'boolean' },
  probe: { type: 'boolean' },
  json: { type: 'boolean' },
  debug: { type: 'boolean' },
  help: { type: 'boolean', short: 'h' },
};

const withoutExt = (p, ext) => (p.toLowerCase().endsWith(ext) ? p.slice(0, -ext.length) : p);
const stem = (show) => (show.kind === 'file' ? withoutExt(path.resolve(show.path), '.cueshow') : path.resolve(show.path));

async function target(given, base, ext) {
  if (given) return path.resolve(given);
  return freePath(base, ext);
}

function formatFindings(list) {
  return list.map((f) => `${f.stufe === 'fehler' ? 'Fehler ' : 'Warnung'}  ${f.ort}: ${f.text}`);
}

function findingsOf(show) {
  return [...show.warnings.map((text) => ({ stufe: 'warnung', ort: 'show.json', text })), ...checkShow(show)];
}

const summary = (list) => `${list.filter((f) => f.stufe === 'fehler').length} Fehler, ${list.filter((f) => f.stufe === 'warnung').length} Warnungen`;
const errorsIn = (list) => list.some((f) => f.stufe === 'fehler');

const COMMANDS = {
  async info([src], o, io) {
    const show = await openShow(src);
    const i = showInfo(show, findingsOf(show));
    io.out(o.json ? JSON.stringify(i, null, 2) : formatInfo(i));
    return 0;
  },

  async check([src], o, io) {
    const show = await openShow(src);
    const list = findingsOf(show);
    for (const l of formatFindings(list)) io.out(l);
    io.out(`Geprüft: ${summary(list)}`);
    return errorsIn(list) || (o.streng && list.length) ? 1 : 0;
  },

  async unpack([src], o, io) {
    const show = await openShow(src);
    if (show.kind !== 'file') throw new ToolError('unpack erwartet eine .cueshow-Datei (zum Packen eines Ordners: pack)', 2);
    const list = findingsOf(show);
    const out = await target(o.output, stem(show), '');
    const r = await writeFolder(show, out, { force: o.force });
    io.out(`Entpackt nach ${path.relative(process.cwd(), out) || '.'}${path.sep}`);
    io.out(`  show.json     ${r.cues} Cues, ${r.media} Medien`);
    io.out(`  media${path.sep}        ${r.media} Dateien, ${formatBytes(r.bytes)}`);
    if (list.length) io.out(`Prüfung: ${summary(list)} (Einzelheiten: check)`);
    return 0;
  },

  async pack([src], o, io) {
    const show = await openShow(src);
    if (show.kind !== 'folder') throw new ToolError('pack erwartet einen entpackten Ordner (zum Entpacken: unpack)', 2);
    const list = findingsOf(show);
    io.out(`Geprüft: ${summary(list)}`);
    for (const l of formatFindings(list)) io.out('  ' + l);
    if (errorsIn(list)) throw new ToolError('Die Show hat Fehler und wurde nicht gepackt');
    const out = await target(o.output, stem(show) + '-neu', '.cueshow');
    const r = await writeShowFile(show, out, { force: o.force });
    for (const w of r.warnings) io.out(`  Warnung  ${w}`);
    io.out(`Gepackt: ${path.relative(process.cwd(), out)} (${formatBytes(r.bytes)})`);
    return 0;
  },

  async texts([src], o, io) {
    const show = await openShow(src);
    const md = textsToMarkdown(show.header.session);
    const out = await target(o.output, stem(show) + '-texte', '.md');
    await writeTextFile(out, md, { force: o.force });
    io.out(`Texte geschrieben: ${path.relative(process.cwd(), out)} (${show.header.session.cues.length} Cues)`);
    return 0;
  },

  async 'apply-texts'([src, mdFile], o, io) {
    if (!mdFile) throw new ToolError('apply-texts braucht eine Show und eine Markdown-Datei', 2);
    const show = await openShow(src);
    const md = await fs.readFile(mdFile, 'utf8').catch(() => null);
    if (md === null) throw new ToolError(`Quelle nicht gefunden: ${mdFile}`, 2);
    const r = applyTexts(show.header.session, parseTexts(md), { force: o.force });
    for (const w of r.warnings) io.out(`Warnung  ${w}`);
    io.out(o.probe ? 'Änderungen (nichts geschrieben):' : 'Änderungen:');
    const q = (t) => `„${t}“`;
    for (const c of r.changes) {
      const lines = (t) => (t ? t.split('\n').length : 0);
      const what = c.feld === 'notes' ? `Notizen geändert (${lines(c.alt)} → ${lines(c.neu)} ${lines(c.neu) === 1 ? 'Zeile' : 'Zeilen'})` : `name: ${q(c.alt)} → ${q(c.neu)}`;
      io.out(`  ${c.ort.padEnd(7)} ${what}`);
    }
    io.out(`${r.changes.length} ${r.changes.length === 1 ? 'Änderung' : 'Änderungen'}`);
    if (o.probe) return 0;
    const next = { ...show, header: { ...show.header, session: r.session }, warnings: [] };
    const list = checkShow(next);
    if (errorsIn(list)) {
      for (const l of formatFindings(list)) io.out('  ' + l);
      throw new ToolError('Nach dem Einspielen hat die Show Fehler, nichts geschrieben');
    }
    if (show.kind === 'file') {
      const out = await target(o.output, stem(show) + '-neu', '.cueshow');
      await writeShowFile(next, out, { force: o.force });
      io.out(`Geschrieben: ${path.relative(process.cwd(), out)}`);
    } else {
      const out = await target(o.output, stem(show) + '-neu', '');
      await writeFolder(next, out, { force: o.force });
      io.out(`Geschrieben: ${path.relative(process.cwd(), out)}${path.sep}`);
    }
    io.out('Hinweis: Der Import in die App legt die Show neben der alten an (neue Show-ID).');
    return 0;
  },
};

const NEEDS = { info: 1, check: 1, unpack: 1, pack: 1, texts: 1, 'apply-texts': 2 };

/** Führt das Werkzeug aus. Ergebnis: Exit-Code. */
export async function main(argv, io = { out: (t) => process.stdout.write(t + '\n'), err: (t) => process.stderr.write(t + '\n') }) {
  let debug = argv.includes('--debug');
  try {
    let parsed;
    try {
      parsed = parseArgs({ args: argv, options: OPTIONS, allowPositionals: true, strict: true });
    } catch (e) {
      throw new ToolError(`${e.message}\n\n${help()}`, 2);
    }
    const { values: o, positionals: [cmd, ...args] } = parsed;
    debug = !!o.debug;
    if (!cmd) { io.err(help()); return 2; }
    if (cmd === 'help' || o.help) { io.out(help(cmd === 'help' ? args[0] : cmd)); return 0; }
    if (!COMMANDS[cmd]) throw new ToolError(`Unbekannter Befehl „${cmd}“\n\n${help()}`, 2);
    if (args.length < NEEDS[cmd]) throw new ToolError(`Zu wenige Angaben.\n\n${help(cmd)}`, 2);
    if (args.length > NEEDS[cmd]) throw new ToolError(`Zu viele Angaben: ${args.slice(NEEDS[cmd]).join(' ')}\n\n${help(cmd)}`, 2);
    return await COMMANDS[cmd](args, o, io);
  } catch (e) {
    io.err(`Fehler: ${e.message}`);
    if (debug && e.stack) io.err(e.stack);
    return e instanceof ToolError ? e.code : 1;
  }
}
