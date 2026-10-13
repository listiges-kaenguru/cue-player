// Browser-Smoke-Test (Playwright + Chromium).
// Start:  npx http-server -p 8080 -c-1 &   dann:  node tests/smoke.mjs
// Prüft: Audio hinzufügen, Fade-Cue, GO/Leertaste, Stop alle, Cart, Export/Import, Neuladen.
import { chromium } from 'playwright';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const URL = process.env.APP_URL || 'http://localhost:8080/';
const dir = mkdtempSync(join(tmpdir(), 'cue-smoke-'));

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
const a = wav(join(dir, 'ton-a.wav'), 440, 3);
const b = wav(join(dir, 'ton-b.wav'), 660, 2);

let failed = 0;
const check = (name, ok, info = '') => { console.log(`${ok ? 'OK  ' : 'FAIL'} ${name} ${info}`); if (!ok) failed++; };

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
  args: ['--autoplay-policy=no-user-gesture-required'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, acceptDownloads: true });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
const states = () => page.$$eval('.cue-row', (r) => r.map((x) => [...x.classList].find((c) => c.startsWith('st-'))));

await page.goto(URL);
await page.setInputFiles('#file-audio', [a, b]);
await page.waitForFunction(() => document.querySelectorAll('.cue-row').length === 2);
check('Audio-Cues angelegt', true);

await page.click('#btn-add-cue');
await page.click('[data-add="fade"]');
await page.fill('#cue-form-body input[type=number] >> nth=1', '0.55'); // Dauer
await page.click('#cue-form .primary');
await page.waitForTimeout(200);
check('Fade-Cue angelegt', (await page.$$('.cue-row')).length === 3);

await page.click('.cue-row >> nth=0');
await page.click('#btn-go');
await page.waitForTimeout(500);
check('GO startet Cue 1', (await states())[0] === 'st-running', JSON.stringify(await states()));
await page.keyboard.press('Space');
await page.waitForTimeout(1000);
check('Fade beendet Cue 1', (await states())[0] === 'st-idle', JSON.stringify(await states()));
await page.keyboard.press('Space');
await page.waitForTimeout(300);
check('Cue 3 läuft', (await states())[2] === 'st-running');
await page.keyboard.press('Escape');
await page.keyboard.press('Escape');
await page.waitForTimeout(200);
check('Stop alle', (await states()).every((s) => s === 'st-idle'));

await page.click('#btn-layout');
check('Cart-Ansicht', (await page.$$('.cart-btn')).length === 3);
await page.click('#btn-layout');

await page.click('#btn-sessions');
const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#ses-export')]);
const exp = join(dir, 'export.cueshow');
await dl.saveAs(exp);
await page.setInputFiles('#file-import', exp);
await page.waitForTimeout(1000);
check('Export/Import', (await page.$$('.cue-row')).length === 3);

await page.reload();
await page.waitForTimeout(800);
await page.click('#btn-go');
await page.waitForTimeout(500);
check('Nach Neuladen abspielbar', (await states())[0] === 'st-running');

check('Keine Konsolenfehler', errors.length === 0, errors.join(' | '));
await browser.close();
process.exit(failed ? 1 : 0);
