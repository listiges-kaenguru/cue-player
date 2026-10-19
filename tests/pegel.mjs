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
await page.setInputFiles('#file-audio', [ton]);
await page.waitForFunction(() => document.querySelectorAll('.cue-row').length === 1);
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

check('Keine Konsolenfehler', errors.length === 0, errors.join(' | '));
await browser.close();
process.exit(failed ? 1 : 0);
