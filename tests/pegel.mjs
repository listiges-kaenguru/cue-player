// Browsertest: GO-Taste (Unterlängen), Pegelanzeigen, Springen in laufenden Cues, Breite des rechten Bereichs.
// Start:  npx http-server -p 8080 -c-1 &   dann:  node tests/pegel.mjs
import { chromium } from 'playwright';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const URL = process.env.APP_URL || 'http://localhost:8080/';
const dir = mkdtempSync(join(tmpdir(), 'cue-pegel-'));

/** Mono-WAV; amp(t) liefert die Amplitude (0..1) zur Zeit t in Sekunden. */
function wav(file, freq, sec, amp = () => 0.25) {
  const rate = 44100, n = Math.floor(rate * sec), buf = Buffer.alloc(44 + n * 2);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write('WAVEfmt ', 8);
  buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(rate, 24); buf.writeUInt32LE(rate * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34);
  buf.write('data', 36); buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) buf.writeInt16LE(Math.round(32767 * amp(i / rate) * Math.sin((2 * Math.PI * freq * i) / rate)), 44 + i * 2);
  writeFileSync(file, buf);
  return file;
}
const ton = wav(join(dir, 'Nachtigall gpy.wav'), 440, 12);
const laut = wav(join(dir, 'laut.wav'), 330, 4, () => 0.9);

let failed = 0;
const check = (name, ok, info = '') => { console.log(`${ok ? 'OK  ' : 'FAIL'} ${name} ${info}`); if (!ok) failed++; };

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
  args: ['--autoplay-policy=no-user-gesture-required'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.route('https://api.github.com/**', (r) => r.fulfill({ json: { tag_name: 'v0.0.1' }, headers: { 'access-control-allow-origin': '*' } }));
await page.goto(URL);
await page.setInputFiles('#file-audio', [ton, laut]);
await page.waitForFunction(() => document.querySelectorAll('.cue-row').length === 2);
await page.click('.cue-row >> nth=0');

// --- 1. GO-Taste: Standby-Name samt Unterlängen sichtbar ---
for (const w of [1280, 390]) {
  await page.setViewportSize({ width: w, height: 800 });
  await page.waitForTimeout(150);
  const m = await page.evaluate(() => {
    const go = document.getElementById('btn-go'), nx = document.getElementById('go-next');
    const g = go.getBoundingClientRect(), n = nx.getBoundingClientRect(), cs = getComputedStyle(go);
    // Unterlängen ragen bei zu kleiner Zeilenhöhe aus der Box: scrollHeight > clientHeight
    return { txt: nx.textContent, fits: nx.scrollHeight <= nx.clientHeight, bottom: n.bottom, inner: g.bottom - parseFloat(cs.borderBottomWidth) - parseFloat(cs.paddingBottom) + 0.5 };
  });
  check(`GO: Standby-Name mit Unterlängen sichtbar (${w}px)`, m.txt.includes('Nachtigall gpy') && m.fits && m.bottom <= m.inner, JSON.stringify(m));
}
await page.setViewportSize({ width: 1280, height: 800 });

// --- 2. Master-Pegel ---
const vu = () => page.evaluate(() => {
  const m = document.getElementById('master-vu');
  return { n: m?.querySelectorAll('.vu-ch').length, lvl: [...(m?.querySelectorAll('.vu-ch') ?? [])].map((c) => +c.dataset.level), clip: m?.classList.contains('clip') };
});
const two = (v) => v.n === 2 && v.lvl.length === 2;
const stopNow = async () => { await page.keyboard.down('Shift'); await page.keyboard.press('Escape'); await page.keyboard.up('Shift'); };
let v = await vu();
check('Master-Pegel: vor dem ersten GO vorhanden und leer', v.n === 2 && v.lvl.every((x) => x === 0) && !v.clip, JSON.stringify(v));
await page.click('#btn-go');
await page.waitForTimeout(600);
v = await vu();
check('Master-Pegel: zeigt Ton (L und R)', two(v) && v.lvl.every((x) => x > 0.5 && x < 1) && !v.clip, JSON.stringify(v));
await page.fill('#master', '-20');
await page.waitForTimeout(300);
const leiser = await vu();
check('Master-Pegel: misst nach der Master-Lautstärke', two(leiser) && leiser.lvl.every((x, i) => x < v.lvl[i] - 0.2), JSON.stringify({ v, leiser }));
await page.fill('#master', '0');
await stopNow();
await page.waitForTimeout(600);
v = await vu();
check('Master-Pegel: Stille → leer', two(v) && v.lvl.every((x) => x === 0), JSON.stringify(v));
await page.fill('#master', '6');
await page.click('.cue-row >> nth=1');
await page.click('#btn-go');
await page.waitForTimeout(500);
v = await vu();
check('Master-Pegel: Übersteuerung markiert', two(v) && v.clip && v.lvl.every((x) => x === 1), JSON.stringify(v));
await stopNow();
await page.fill('#master', '0');
await page.waitForTimeout(600);
check('Master-Pegel: Clip-Markierung bleibt kurz stehen', (await vu()).clip);
await page.waitForTimeout(3000);
check('Master-Pegel: Clip-Markierung verschwindet', (await vu()).clip === false);
await page.click('.cue-row >> nth=0');

check('Keine Konsolenfehler', errors.length === 0, errors.join(' | '));
await browser.close();
process.exit(failed ? 1 : 0);
