// Speichertest für tools/cueshow.mjs: Eine Show mit 1 GB Medien wird entpackt, geprüft und gepackt, ohne dass der
// Prozess die Medien in den Speicher lädt. Schreibt etwa 3 GB in einen Wegwerf-Ordner, deshalb nicht im normalen
// Testlauf. Start:  npm run test:gross   (Größe in MB anpassbar: CUESHOW_GROSS_MB=1024)
import fs from 'node:fs/promises';
import { openAsBlob, createWriteStream } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';
import { buildShowFile } from '../../js/showfile.js';

const MB = Number(process.env.CUESHOW_GROSS_MB || 1024);
const LIMIT_MB = 150; // Prozess insgesamt (Node selbst braucht etwa 50 MB)
const TOOL = fileURLToPath(new URL('../../tools/cueshow.mjs', import.meta.url));
const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'cueshow-gross-'));
let failed = 0;
const check = (name, ok, info = '') => { console.log(`${ok ? 'OK  ' : 'FAIL'} ${name} ${info}`); if (!ok) failed++; };

/** Führt das Werkzeug in einem eigenen Prozess aus und misst dessen höchsten Speicherverbrauch (RSS). */
function run(...args) {
  const probe = `
    let peak = 0;
    const t = setInterval(() => { peak = Math.max(peak, process.memoryUsage().rss); }, 5);
    const { main } = await import(${JSON.stringify(path.join(path.dirname(TOOL), 'cueshow/cli.mjs'))});
    const code = await main(${JSON.stringify(args)}, { out: () => {}, err: (t) => console.error(t) });
    clearInterval(t);
    peak = Math.max(peak, process.memoryUsage().rss);
    console.log(JSON.stringify({ code, peakMb: Math.round(peak / 1024 / 1024) }));`;
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', probe], { cwd: dir, encoding: 'utf8' });
  if (r.stderr) console.error(r.stderr.trim());
  return JSON.parse(r.stdout.trim().split('\n').pop());
}

try {
  // Mediendatei aus Nullbytes, stückweise geschrieben
  const media = path.join(dir, 'gross.wav');
  const chunk = Buffer.alloc(1024 * 1024);
  const out = createWriteStream(media);
  for (let i = 0; i < MB; i++) if (!out.write(chunk)) await new Promise((r) => out.once('drain', r));
  await new Promise((r) => out.end(r));

  const session = { version: 1, id: 's', name: 'Groß', updated: 1, settings: {}, cues: [{ id: 'c', type: 'audio', mediaId: 'm' }] };
  const show = buildShowFile(session, [{ id: 'm', name: 'gross.wav', type: 'audio/wav', blob: await openAsBlob(media) }]);
  await pipeline(Readable.fromWeb(show.stream()), createWriteStream(path.join(dir, 'gross.cueshow')));
  await fs.rm(media);
  console.log(`Show mit ${MB} MB Medien angelegt`);

  for (const [name, args] of [
    ['unpack', ['unpack', 'gross.cueshow', '-o', 'ordner']],
    ['info', ['info', 'gross.cueshow']],
    ['check', ['check', 'ordner']],
    ['pack', ['pack', 'ordner', '-o', 'zurueck.cueshow']],
  ]) {
    const r = run(...args);
    check(`${name}: Exit 0`, r.code === 0, `Exit ${r.code}`);
    check(`${name}: höchstens ${LIMIT_MB} MB Speicher`, r.peakMb <= LIMIT_MB, `${r.peakMb} MB`);
  }
  const [a, b] = await Promise.all(['gross.cueshow', 'zurueck.cueshow'].map((f) => fs.stat(path.join(dir, f))));
  check('Rundreise: gleiche Größe', a.size === b.size, `${a.size} / ${b.size}`);
} finally {
  await fs.rm(dir, { recursive: true, force: true });
}
console.log(failed ? `\n${failed} Prüfung(en) fehlgeschlagen` : '\nAlle Prüfungen bestanden');
process.exit(failed ? 1 : 0);
