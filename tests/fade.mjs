// Browsertest: Fade-Cue pausieren und fortsetzen (Lautstärke friert ein, Rest läuft mit Restdauer weiter).
// Start:  npx http-server -p 8080 -c-1 &   dann:  node tests/fade.mjs
import { chromium } from 'playwright';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const URL = process.env.APP_URL || 'http://localhost:8080/';
const dir = mkdtempSync(join(tmpdir(), 'cue-fade-'));

function wav(file, sec) {
  const rate = 22050, n = Math.floor(rate * sec), buf = Buffer.alloc(44 + n * 2);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write('WAVEfmt ', 8);
  buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(rate, 24); buf.writeUInt32LE(rate * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34);
  buf.write('data', 36); buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) buf.writeInt16LE(Math.round(6000 * Math.sin((2 * Math.PI * 440 * i) / rate)), 44 + i * 2);
  writeFileSync(file, buf);
  return file;
}

let failed = 0;
const check = (name, ok, info = '') => { console.log(`${ok ? 'OK  ' : 'FAIL'} ${name} ${info}`); if (!ok) failed++; };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

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
await page.setInputFiles('#file-audio', [wav(join(dir, 'lang.wav'), 30)]);
await page.waitForFunction(() => document.querySelectorAll('.cue-row').length === 1);
await page.click('#btn-add-cue');
await page.click('[data-add="fade"]');
await page.click('#cue-form .primary');
await page.waitForFunction(() => document.querySelectorAll('.cue-row').length === 2);

const TARGET = 0.0316; // −30 dB
// Fade-Cue: 2 s auf −30 dB (Kurve je Durchlauf), Audio-Cue frisch starten, dann Fade starten
const run = (curve) => page.evaluate((curve) => {
  const { engine, state } = window.cuePlayer;
  const [a, f] = state.session.cues;
  Object.assign(f, { volume: -30, duration: 2, fadeCurve: curve, stopAfter: false, target: a.id });
  engine.go(a.id);
  return new Promise((res) => setTimeout(() => { engine.go(f.id); res(); }, 300));
}, curve);
const st = () => page.evaluate(() => {
  const { engine, state } = window.cuePlayer;
  const [a, f] = state.session.cues;
  const ra = engine.runners.get(a.id), rf = engine.runners.get(f.id);
  return { vol: ra.chain?.vol.gain.value ?? null, audio: ra.state, fade: rf.state, elapsed: +rf.progress().elapsed.toFixed(2) };
});
const fade = (m) => page.evaluate((m) => {
  const { engine, state } = window.cuePlayer;
  engine.runners.get(state.session.cues[1].id)[m](0);
}, m);
const reset = () => page.evaluate(() => window.cuePlayer.engine.stopAll(0));

for (const curve of ['log', 'linear']) {
  await run(curve);
  await wait(1000);
  await fade('pause');
  const p1 = await st();
  await wait(800);
  const p2 = await st();
  const mid = curve === 'log' ? [0.1, 0.35] : [0.35, 0.65];
  check(`[${curve}] Pause friert die Lautstärke ein`, p1.fade === 'paused' && p1.vol > mid[0] && p1.vol < mid[1] && Math.abs(p2.vol - p1.vol) < 0.005 && p2.elapsed === p1.elapsed,
    JSON.stringify({ p1, p2 }));
  await fade('resume');
  await wait(500);
  const r1 = await st();
  check(`[${curve}] Weiter setzt den Fade fort`, r1.fade === 'running' && r1.vol < p1.vol - 0.01 && r1.vol > TARGET + 0.005, JSON.stringify(r1));
  await wait(700); // Rest: 1 s ab „Weiter“
  const r2 = await st();
  check(`[${curve}] Fade endet zur angezeigten Zeit auf dem Zielwert`, r2.fade === 'idle' && Math.abs(r2.vol - TARGET) < 0.003 && r2.audio === 'running', JSON.stringify(r2));
  await reset();
  await wait(200);
}

// Mehrfach pausieren und fortsetzen, zuletzt kurz vor dem Ende
await run('log');
for (const ms of [400, 400, 400, 650]) {
  await wait(ms);
  await fade('pause');
  await wait(150);
  await fade('resume');
}
let s = await st();
check('Mehrfach pausieren: läuft weiter, Zielwert noch nicht erreicht', s.fade === 'running' && s.vol > TARGET + 0.002, JSON.stringify(s));
await wait(400);
s = await st();
check('Mehrfach pausieren: endet auf dem Zielwert', s.fade === 'idle' && Math.abs(s.vol - TARGET) < 0.003, JSON.stringify(s));
await reset();
await wait(200);

// Stop während der Pause: Lautstärke bleibt, wo sie war (kein Sprung)
await run('log');
await wait(800);
await fade('pause');
const before = (await st()).vol;
await page.evaluate(() => { const { engine, state } = window.cuePlayer; engine.runners.get(state.session.cues[1].id).stop(0); });
await wait(600);
s = await st();
check('Stop während der Pause: kein Sprung, Fade beendet', s.fade === 'idle' && Math.abs(s.vol - before) < 0.005 && s.audio === 'running', JSON.stringify({ before, s }));
await reset();
await wait(200);

// Ziel-Cue endet während der Pause: kein Fehler, Fade läuft zu Ende
await run('log');
await wait(800);
await fade('pause');
await page.evaluate(() => { const { engine, state } = window.cuePlayer; engine.runners.get(state.session.cues[0].id).stop(0, true); });
await wait(200);
await fade('resume');
await wait(1500);
s = await st();
check('Ziel endet während der Pause: Fade läuft ohne Fehler zu Ende', s.fade === 'idle' && s.audio === 'idle', JSON.stringify(s));

// Über die Transportleiste (Pause alle / Weiter)
await run('log');
await wait(1000);
await page.click('#btn-pauseall');
await wait(100);
const t1 = await st();
await wait(700);
const t2 = await st();
check('Pause alle: Fade-Cue friert ebenfalls ein', t1.fade === 'paused' && Math.abs(t2.vol - t1.vol) < 0.005, JSON.stringify({ t1, t2 }));
await page.click('#btn-resumeall');
await wait(1400);
s = await st();
check('Weiter (alle): Fade endet auf dem Zielwert', s.fade === 'idle' && Math.abs(s.vol - TARGET) < 0.003, JSON.stringify(s));
await reset();

check('Keine Konsolenfehler', errors.length === 0, errors.join(' | '));
await browser.close();
process.exit(failed ? 1 : 0);
