// Browsertest: Standby nach dem Neuladen, Datenbank-Upgrade bei mehreren offenen Tabs.
// Start:  npx http-server -p 8080 -c-1 &   dann:  node tests/zustand.mjs
import { chromium } from 'playwright';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const URL = process.env.APP_URL || 'http://localhost:8080/';
const dir = mkdtempSync(join(tmpdir(), 'cue-zustand-'));

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
const files = ['eins', 'zwei', 'drei', 'vier'].map((n) => wav(join(dir, `${n}.wav`), 1));

let failed = 0;
const check = (name, ok, info = '') => { console.log(`${ok ? 'OK  ' : 'FAIL'} ${name} ${info}`); if (!ok) failed++; };

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const errors = [];
const watch = (p) => {
  p.on('pageerror', (e) => errors.push(e.message));
  p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  return p.route('https://api.github.com/**', (r) => r.fulfill({ json: { tag_name: 'v0.0.1' }, headers: { 'access-control-allow-origin': '*' } }));
};

// --- Standby merken ---
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const page = await ctx.newPage();
await watch(page);
await page.goto(URL);
await page.setInputFiles('#file-audio', files);
await page.waitForFunction(() => document.querySelectorAll('.cue-row').length === 4);

const standby = () => page.evaluate(() => {
  const rows = [...document.querySelectorAll('.cue-row')];
  return { index: rows.findIndex((r) => r.classList.contains('standby')), title: document.querySelector('.cue-row.standby .title')?.textContent ?? null };
});
const reload = async () => { await page.reload(); await page.waitForFunction(() => document.querySelectorAll('.cue-row').length > 0); };
const setMeta = (value) => page.evaluate(async (v) => {
  const store = await import('./js/storage.js');
  await store.setMeta('standby:' + window.cuePlayer.state.session.id, v);
}, value);

let sb = await standby();
check('Standby: neue Show beginnt bei Cue 1', sb.index === 0, JSON.stringify(sb));
await page.click('.cue-row >> nth=2');
await page.waitForTimeout(300);
await reload();
sb = await standby();
check('Standby: bleibt nach dem Neuladen (Cue 3)', sb.index === 2 && sb.title === 'drei', JSON.stringify(sb));
await page.keyboard.press('ArrowDown');
await page.waitForTimeout(300);
await reload();
check('Standby: ↓ wird ebenfalls gemerkt (Cue 4)', (await standby()).index === 3);
await page.click('#btn-go'); // GO auf dem letzten Cue → Ende der Liste
await page.waitForTimeout(300);
await reload();
sb = await standby();
check('Standby: Ende der Liste → nach dem Neuladen Cue 1', sb.index === 0, JSON.stringify(sb));

// Gelöschter Cue und ungültige Werte → Cue 1
for (const [name, v] of [['gelöschter Cue', 'gibt-es-nicht'], ['Zahl', 42], ['null', null], ['Objekt', { id: 'x' }], ['leer', '']]) {
  await page.click('.cue-row >> nth=1');
  await page.waitForTimeout(300);
  await setMeta(v);
  await reload();
  check(`Standby: ${name} → Cue 1`, (await standby()).index === 0);
}

// Passives Memo als gespeicherter Standby → nächster Cue
await page.click('.cue-row >> nth=1');
await page.click('#btn-add-cue');
await page.click('[data-add="memo"]');
await page.fill('#cue-form-body input[type=text] >> nth=0', 'Pause');
await page.click('#cue-form .primary');
await page.waitForTimeout(200);
const memoId = await page.evaluate(() => window.cuePlayer.state.session.cues.find((c) => c.type === 'memo').id);
await page.waitForTimeout(500); // Show speichern lassen
await setMeta(memoId);
await reload();
sb = await standby();
check('Standby: passives Memo → nächster Cue', sb.index === 3 && sb.title === 'drei', JSON.stringify(sb));

// Show-Wechsel: jede Show behält ihren eigenen Standby
await page.click('.cue-row >> nth=4');
await page.waitForTimeout(300);
page.once('dialog', (d) => d.accept('Zweite Show'));
await page.click('#btn-sessions');
await page.click('#ses-new');
await page.waitForTimeout(400);
await page.setInputFiles('#file-audio', files.slice(0, 3));
await page.waitForFunction(() => document.querySelectorAll('.cue-row').length === 3);
check('Standby: neue zweite Show beginnt bei Cue 1', (await standby()).index === 0);
await page.click('.cue-row >> nth=1');
await page.waitForTimeout(300);
const openShow = async (name) => {
  await page.click('#btn-sessions');
  await page.click(`#session-list .ses:has-text("${name}") button:has-text("Öffnen")`);
  await page.waitForTimeout(400);
};
await openShow('Meine Show');
sb = await standby();
check('Standby: zurück zur ersten Show → deren Standby (Cue 5)', sb.index === 4 && sb.title === 'vier', JSON.stringify(sb));
await openShow('Zweite Show');
check('Standby: wieder zur zweiten Show → deren Standby (Cue 2)', (await standby()).index === 1);
const exported = await page.evaluate(() => JSON.stringify(window.cuePlayer.state.session));
check('Standby: nicht in den Show-Daten (Export)', !/standby/i.test(exported));
await ctx.close();

// --- Datenbank-Upgrade, während ein anderer Tab die alte Datenbank offen hält ---
const ctx2 = await browser.newContext({ viewport: { width: 1280, height: 800 }, serviceWorkers: 'block' });
const alt = await ctx2.newPage();
await watch(alt);
await alt.goto(URL + 'manifest.webmanifest'); // gleiche Herkunft, ohne die App
// Alter Tab: Datenbank in Version 1, Verbindung bleibt offen und reagiert nicht auf Upgrades (wie eine alte App-Version)
await alt.evaluate(() => new Promise((res, rej) => {
  const r = indexedDB.open('cue-player', 1);
  r.onupgradeneeded = () => r.result.createObjectStore('sessions', { keyPath: 'id' });
  r.onsuccess = () => { window.altDb = r.result; res(); };
  r.onerror = () => rej(r.error);
}));
const neu = await ctx2.newPage();
await watch(neu);
await neu.goto(URL);
const hint = await neu.waitForSelector('.toast.blocked', { timeout: 5000 }).then((t) => t.textContent(), () => null);
check('DB-Upgrade blockiert: Hinweis „anderen Tab schließen“', !!hint && /anderen Tab/.test(hint), String(hint));
await neu.waitForTimeout(6000);
check('DB-Upgrade blockiert: Hinweis bleibt stehen, solange blockiert', !!(await neu.$('.toast.blocked')));
await alt.evaluate(() => window.altDb.close());
const loaded = await neu.waitForFunction(() => window.cuePlayer?.state.session, null, { timeout: 5000 }).then(() => true, () => false);
check('DB-Upgrade: nach Schließen des alten Tabs lädt die App', loaded);
check('DB-Upgrade: Hinweis verschwindet', !(await neu.$('.toast.blocked')));

// Umgekehrt: Die laufende App gibt ihre Datenbank frei, wenn ein anderer Tab eine neuere Version öffnet
const upg = await alt.evaluate(() => new Promise((res) => {
  const r = indexedDB.open('cue-player', 99);
  const timer = setTimeout(() => res('blockiert'), 3000);
  r.onblocked = () => {}; // bleibt blockiert, wenn die App nicht freigibt
  r.onsuccess = () => { clearTimeout(timer); r.result.close(); res('ok'); };
  r.onerror = () => { clearTimeout(timer); res('fehler'); };
}));
check('DB-Upgrade: laufende App gibt die Datenbank für eine neuere Version frei', upg === 'ok', upg);
const reloadHint = await neu.waitForSelector('.toast.blocked', { timeout: 3000 }).then((t) => t.textContent(), () => null);
check('DB-Upgrade: laufende App bittet um Neuladen', !!reloadHint && /neu laden/i.test(reloadHint), String(reloadHint));
await ctx2.close();

check('Keine Konsolenfehler', errors.length === 0, errors.join(' | '));
await browser.close();
process.exit(failed ? 1 : 0);
