// Browsertest: Werkzeug tools/cueshow.mjs zusammen mit der App (Playwright + Chromium).
// Start:  npx http-server -p 8080 -c-1 -s &   dann:  node tests/cueshow.mjs   (pt test erledigt beides)
// Weg: Show in der App anlegen → exportieren → check (keine Meldung) → unpack/pack (byte-gleich)
//      → Audiodatei austauschen, Namen über texts/apply-texts ändern → pack → in der App importieren und prüfen.
import { chromium } from 'playwright';
import { writeFileSync, readFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const APP = process.env.APP_URL || 'http://localhost:8080/';
const TOOL = fileURLToPath(new URL('../tools/cueshow.mjs', import.meta.url));
const dir = mkdtempSync(join(tmpdir(), 'cue-cueshow-'));
let failed = 0;
const check = (name, ok, info = '') => { console.log(`${ok ? 'OK  ' : 'FAIL'} ${name} ${info}`); if (!ok) failed++; };

function wav(file, freq, sec) {
  const rate = 44100, n = Math.floor(rate * sec), buf = Buffer.alloc(44 + n * 2);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write('WAVEfmt ', 8);
  buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(rate, 24); buf.writeUInt32LE(rate * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34);
  buf.write('data', 36); buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) buf.writeInt16LE(Math.round(8000 * Math.sin((2 * Math.PI * freq * i) / rate)), 44 + i * 2);
  writeFileSync(file, buf);
  return file;
}
function tool(...args) {
  const r = spawnSync(process.execPath, [TOOL, ...args], { cwd: dir, encoding: 'utf8' });
  return { code: r.status, out: (r.stdout + r.stderr).trim() };
}

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, acceptDownloads: true, serviceWorkers: 'block' });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.route('https://api.github.com/**', (r) => r.fulfill({ json: { tag_name: 'v0.0.1' }, headers: { 'access-control-allow-origin': '*' } }));
await page.goto(APP);
await page.waitForFunction(() => window.cuePlayer?.state?.session);

// Show anlegen: zwei Audio-Cues und ein Fade
await page.setInputFiles('#file-audio', [wav(join(dir, 'ton-a.wav'), 440, 3), wav(join(dir, 'ton-b.wav'), 660, 2)]);
await page.waitForFunction(() => document.querySelectorAll('.cue-row').length === 2);
await page.click('#btn-add-cue');
await page.click('[data-add="fade"]');
await page.click('#cue-form .primary');
await page.waitForFunction(() => document.querySelectorAll('.cue-row').length === 3);
await page.waitForFunction(() => window.cuePlayer.state.session.cues.slice(0, 2).every((c) => c.duration > 0));
const altId = await page.evaluate(() => window.cuePlayer.state.session.id);

await page.click('#btn-sessions');
const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#ses-export')]);
await dl.saveAs(join(dir, 'export.cueshow'));
await page.keyboard.press('Escape');

// Export der App: streng geprüft ohne Meldung
const c = tool('check', 'export.cueshow', '--streng');
check('check: Export der App ohne Fehler und Warnungen', c.code === 0 && /0 Fehler, 0 Warnungen/.test(c.out), c.out);
const info = JSON.parse(tool('info', 'export.cueshow', '--json').out);
check('info: 3 Cues, 2 Medien', info.cues.total === 3 && info.media.length === 2, JSON.stringify(info.cues));

// Rundreise byte-gleich
check('unpack', tool('unpack', 'export.cueshow', '-o', 'show').code === 0);
check('pack', tool('pack', 'show', '-o', 'zurueck.cueshow').code === 0);
check('Rundreise byte-gleich', readFileSync(join(dir, 'zurueck.cueshow')).equals(readFileSync(join(dir, 'export.cueshow'))));

// Bearbeiten: zweite Audiodatei austauschen (5 s), Namen von Cue 1 über Texte ändern
const json = JSON.parse(readFileSync(join(dir, 'show/show.json'), 'utf8'));
const audio = json.session.cues.map((x, i) => ({ ...x, nr: i + 1 })).filter((x) => x.type === 'audio');
const m2 = json.media.find((m) => m.id === audio[1].mediaId);
wav(join(dir, 'show', m2.file), 880, 5);
check('texts', tool('texts', 'show', '-o', 'texte.md').code === 0);
const md = readFileSync(join(dir, 'texte.md'), 'utf8');
writeFileSync(join(dir, 'texte.md'), md.replace(new RegExp(`(<!-- cue:${audio[0].id} [^\\n]*\\n)##.*\\n`), '$1## Umbenannt Ä 🎵\n\nNotiz aus dem Werkzeug\n'));
const a = tool('apply-texts', 'show', 'texte.md', '-o', 'show-bearbeitet');
check('apply-texts', a.code === 0 && new RegExp(`Cue ${audio[0].nr}\\s+name:`).test(a.out), a.out);
const p = tool('pack', 'show-bearbeitet', '-o', 'bearbeitet.cueshow');
check('pack der bearbeiteten Show', p.code === 0, p.out);

// Import in die App
await page.setInputFiles('#file-import', join(dir, 'bearbeitet.cueshow'));
await page.waitForFunction(() => window.cuePlayer.state.session.cues.some((c) => c.name === 'Umbenannt Ä 🎵'), null, { timeout: 5000 }).catch(() => {});
const s = await page.evaluate(() => window.cuePlayer.state.session.cues.map((c) => ({ id: c.id, name: c.name, notes: c.notes, type: c.type })));
const i1 = audio[0].nr - 1, i2 = audio[1].nr - 1;
check('Import: neuer Name und Notiz', s[i1]?.name === 'Umbenannt Ä 🎵' && s[i1]?.notes === 'Notiz aus dem Werkzeug', JSON.stringify(s[i1]));
const neu = await page.evaluate(async () => ({ id: window.cuePlayer.state.session.id }));
const anzahl = await page.evaluate(() => new Promise((res) => {
  const r = indexedDB.open('cue-player');
  r.onsuccess = () => { const q = r.result.transaction('sessions').objectStore('sessions').count(); q.onsuccess = () => { r.result.close(); res(q.result); }; };
}));
check('Import: neue Show neben der alten (neue Show-ID)', s.length === 3 && neu.id !== altId && anzahl === 2, `${altId} → ${neu.id}, ${anzahl} Shows`);
const dur = await page.waitForFunction((i) => {
  const d = window.cuePlayer.state.session.cues[i].duration;
  return Math.abs(d - 5) < 0.05 ? d : false;
}, i2, { timeout: 5000 }).then((h) => h.jsonValue()).catch(() => null);
check('Import: ausgetauschte Datei hat die neue Dauer (5 s)', dur !== null, String(dur));
const rows = await page.$$eval('.cue-row', (r) => r.map((x) => x.textContent));
check('Import: Name in der Cue-Liste', rows[i1]?.includes('Umbenannt Ä 🎵'), rows[i1]);
check('Keine Konsolenfehler', errors.length === 0, errors.join(' | '));

await browser.close();
console.log(failed ? `\n${failed} Prüfung(en) fehlgeschlagen` : '\nAlle Prüfungen bestanden');
process.exit(failed ? 1 : 0);
