// Browsertest: Hinweis beim Schließen, solange die Show seit dem letzten Export (oder Import) geändert ist.
// Start:  npx http-server -p 8080 -c-1 &   dann:  node tests/sicherung.mjs
import { chromium } from 'playwright';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const URL = process.env.APP_URL || 'http://localhost:8080/';
const dir = mkdtempSync(join(tmpdir(), 'cue-sicherung-'));

function wav(file, sec) {
  const rate = 8000, n = Math.floor(rate * sec), buf = Buffer.alloc(44 + n * 2);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write('WAVEfmt ', 8);
  buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(rate, 24); buf.writeUInt32LE(rate * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34);
  buf.write('data', 36); buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) buf.writeInt16LE(Math.round(4000 * Math.sin((2 * Math.PI * 440 * i) / rate)), 44 + i * 2);
  writeFileSync(file, buf);
  return file;
}
const eins = wav(join(dir, 'eins.wav'), 2);
const zwei = wav(join(dir, 'zwei.wav'), 2);

let failed = 0;
const check = (name, ok, info = '') => { console.log(`${ok ? 'OK  ' : 'FAIL'} ${name} ${info}`); if (!ok) failed++; };

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('dialog', (d) => d.accept(d.type() === 'prompt' ? 'Zweite Show' : undefined));
await page.route('https://api.github.com/**', (r) => r.fulfill({ json: { tag_name: 'v0.0.1' }, headers: { 'access-control-allow-origin': '*' } }));

// Löst beforeunload aus wie der Browser beim Schließen; true = der Browser würde nachfragen
const warns = () => page.evaluate(() => {
  const e = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(e);
  return e.defaultPrevented;
});
const rows = (n) => page.waitForFunction((k) => document.querySelectorAll('.cue-row').length === k, n);
const settle = () => page.waitForTimeout(600); // Speichern ist entprellt (400 ms), Dauer lädt asynchron
const reload = async (n) => { await page.reload(); await rows(n); await settle(); };
const sessions = async () => { await page.click('#btn-sessions'); await page.waitForSelector('#dlg-sessions[open]'); };
let exported = 0;
const exportShow = async () => {
  await sessions();
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#ses-export')]);
  const file = join(dir, `export-${++exported}.cueshow`);
  await dl.saveAs(file);
  await page.keyboard.press('Escape');
  await settle();
  return file;
};

await page.goto(URL);
await page.waitForSelector('#session-name');
await settle();
check('leere Show: kein Hinweis', (await warns()) === false);

await page.setInputFiles('#file-audio', [eins]);
await rows(1);
await settle();
check('Cue hinzugefügt, nie exportiert: Hinweis', (await warns()) === true);
await reload(1);
check('… auch nach dem Neuladen', (await warns()) === true);

const datei = await exportShow();
check('nach dem Export: kein Hinweis', (await warns()) === false);
await reload(1);
check('… auch nach dem Neuladen (Dauer neu ermittelt)', (await warns()) === false);

await page.fill('#session-name', 'Geänderter Name');
await settle();
check('Name geändert: Hinweis', (await warns()) === true);
await page.fill('#session-name', 'Meine Show');
await settle();
check('Änderung rückgängig gemacht: kein Hinweis', (await warns()) === false);
await page.setInputFiles('#file-audio', [zwei]);
await rows(2);
await settle();
check('zweiter Cue: Hinweis', (await warns()) === true);
await exportShow();
check('erneut exportiert: kein Hinweis', (await warns()) === false);

await page.click('#btn-go');
await page.waitForFunction(() => window.cuePlayer.engine.active().length > 0);
check('Wiedergabe läuft: Hinweis wie bisher', (await warns()) === true);
await page.evaluate(() => window.cuePlayer.engine.stopAll(0));
await page.waitForFunction(() => window.cuePlayer.engine.active().length === 0);
check('Wiedergabe gestoppt: kein Hinweis', (await warns()) === false);

// Exportstand gilt je Show
await sessions();
await page.click('#ses-new');
await rows(0);
await settle();
check('neue leere Show: kein Hinweis', (await warns()) === false);
await page.setInputFiles('#file-audio', [eins]);
await rows(1);
await settle();
check('neue Show mit Cue: Hinweis', (await warns()) === true);
await sessions();
await page.click('#session-list .ses:not(.current) button:not(.danger)');
await rows(2);
await settle();
check('zurück zur exportierten Show: kein Hinweis', (await warns()) === false);

// Import zählt als gesichert
await sessions();
await page.setInputFiles('#file-import', datei);
await page.waitForFunction(() => document.querySelectorAll('#session-list .ses').length === 0 || !document.querySelector('#dlg-sessions[open]'));
await rows(1);
await settle();
check('importierte Show: kein Hinweis', (await warns()) === false);
await reload(1);
check('… auch nach dem Neuladen', (await warns()) === false);

// Ungültiger oder fremder Exportstand → Hinweis; Löschen der Show entfernt den Eintrag
const meta = await page.evaluate(async () => {
  const store = await import('./js/storage.js');
  const sid = window.cuePlayer.state.session.id;
  const vorher = await store.getMeta('exportiert:' + sid);
  const zweite = (await store.listSessions()).find((s) => s.name === 'Zweite Show');
  await store.setMeta('exportiert:' + zweite.id, 'irgendwas');
  await store.deleteSession(zweite.id);
  return { vorher: typeof vorher, nachLoeschen: await store.getMeta('exportiert:' + zweite.id) };
});
check('Exportstand im Meta-Store je Show', meta.vorher === 'string', JSON.stringify(meta));
check('Show gelöscht: Exportstand entfernt', meta.nachLoeschen === undefined, JSON.stringify(meta));
for (const [name, v] of [['fremder Stand', 'abc'], ['Zahl', 42], ['null', null], ['Objekt', { fp: 'x' }]]) {
  await page.evaluate(async (wert) => {
    const store = await import('./js/storage.js');
    await store.setMeta('exportiert:' + window.cuePlayer.state.session.id, wert);
  }, v);
  await reload(1);
  check(`gespeicherter Exportstand ${name}: Hinweis`, (await warns()) === true);
}

check('keine Fehler in der Konsole', errors.length === 0, errors.join(' | '));
await browser.close();
console.log(failed ? `\n${failed} Prüfung(en) fehlgeschlagen` : '\nAlle Prüfungen bestanden');
process.exit(failed ? 1 : 0);
