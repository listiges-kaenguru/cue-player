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
// 12 s: erste Hälfte leise, zweite laut (Wellenform muss das zeigen)
const ton = wav(join(dir, 'Nachtigall gpy.wav'), 440, 12, (t) => (t < 6 ? 0.1 : 0.5));
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

// --- 3. Wellenform und Live-Pegel im Aktiv-Bereich ---
const cueId = (i) => page.evaluate((i) => window.cuePlayer.state.session.cues[i].id, i);
const id0 = await cueId(0);
const pos0 = () => page.evaluate((id) => {
  const r = window.cuePlayer.engine.runners.get(id);
  return { pos: r.el?.currentTime ?? null, state: r.state, elPaused: r.el?.paused ?? null, gain: r.chain?.env.gain.value ?? null };
}, id0);
const barSel = `.run-item .bar[data-cue="${id0}"]`;
const itemSel = `.run-item:has(.bar[data-cue="${id0}"])`;
await page.click('#btn-go');
await page.waitForSelector(barSel);
const hasWave = await page.waitForFunction((sel) => document.querySelector(sel)?.classList.contains('has-wave'), barSel, { timeout: 5000 }).then(() => true, () => false);
check('Aktiv: Audio-Cue bekommt Wellenform', hasWave);
const wave = await page.evaluate(async (id) => {
  const { engine, state } = window.cuePlayer;
  const c = state.session.cues.find((x) => x.id === id);
  const p = await engine.waveform(c.mediaId, c.duration);
  const avg = (a) => a.reduce((s, x) => s + x, 0) / a.length;
  const h = p.length / 2;
  return { n: p.length, leise: +avg(p.slice(5, h - 5)).toFixed(3), laut: +avg(p.slice(h + 5, -5)).toFixed(3) };
}, id0);
check('Wellenform: leise und laute Hälfte erkennbar', wave.n > 100 && Math.abs(wave.leise - 0.1) < 0.02 && Math.abs(wave.laut - 0.5) < 0.05, JSON.stringify(wave));
const canvas = await page.$eval(barSel, (b) => {
  const c = b.querySelector('canvas.wave');
  const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
  let painted = 0;
  for (let i = 3; i < d.length; i += 4) if (d[i] > 0) painted++;
  return { w: c.width, bw: Math.round(b.clientWidth * devicePixelRatio), painted };
});
check('Wellenform: Canvas in Balkenbreite gezeichnet', canvas.w === canvas.bw && canvas.painted > 100, JSON.stringify(canvas));
const noWave = await page.evaluate(async () => {
  const { engine } = window.cuePlayer;
  return [await engine.waveform('gibt-es-nicht', 10), await engine.waveform(null, 10), await engine.waveform('x', 0), await engine.waveform('x', 21 * 60)];
});
check('Wellenform: fehlende Datei, ohne Dauer oder zu lang → keine', noWave.every((x) => x === null), JSON.stringify(noWave));
await page.waitForTimeout(300);
const cueVu = await page.$eval(`${itemSel} .vu-ch.vert`, (c) => +c.dataset.level).catch(() => null);
check('Aktiv: Live-Pegel des Cues', cueVu > 0.3 && cueVu < 1, String(cueVu));

// --- 4. Springen ---
const bar = async () => page.$eval(barSel, (b) => { const r = b.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; });
const at = async (f) => { const b = await bar(); return [b.x + Math.min(b.w - 1, Math.max(1, f * b.w)), b.y + b.h / 2]; };
const near = (a, b, tol = 0.35) => a !== null && Math.abs(a - b) < tol;
let r = await bar();
check('Springen: Balken ist groß genug zum Treffen', r.h >= 28, JSON.stringify(r));
await page.mouse.click(...(await at(0.5)));
let p = await pos0();
check('Springen (Edit): Klick auf 50 % → 6 s', near(p.pos, 6) && p.state === 'running', JSON.stringify(p));
await page.mouse.click(...(await at(0)));
p = await pos0();
check('Springen: linker Rand → Anfang', near(p.pos, 0), JSON.stringify(p));

// Trimmung: nur der Bereich Start…Ende zählt
await page.evaluate((id) => { const c = window.cuePlayer.state.session.cues.find((x) => x.id === id); c.start = 2; c.end = 10; }, id0);
await page.mouse.click(...(await at(0.5)));
p = await pos0();
check('Springen mit Trimmung: 50 % von 2…10 s → 6 s', near(p.pos, 6), JSON.stringify(p));
await page.mouse.click(...(await at(0)));
p = await pos0();
check('Springen mit Trimmung: linker Rand → Start (2 s)', near(p.pos, 2), JSON.stringify(p));
await page.evaluate((id) => { const c = window.cuePlayer.state.session.cues.find((x) => x.id === id); c.start = 0; c.end = 0; }, id0);

// Tastatur
await page.focus(barSel);
await page.mouse.click(...(await at(0.25)));
await page.keyboard.press('ArrowRight');
p = await pos0();
check('Springen: → +5 s', near(p.pos, 8), JSON.stringify(p));
await page.keyboard.press('ArrowLeft');
await page.keyboard.press('ArrowLeft');
p = await pos0();
check('Springen: ← −5 s, nicht vor den Anfang', near(p.pos, 0), JSON.stringify(p));
check('Springen: Pfeiltasten ändern nicht den Standby', (await page.$$('.cue-row.standby')).length === 1);

// Pausiert: springt und bleibt pausiert
await page.click(`${itemSel} button[title^="Pause"]`);
await page.waitForTimeout(400);
await page.mouse.click(...(await at(0.5)));
await page.waitForTimeout(150);
p = await pos0();
check('Springen pausiert: Position gesetzt, bleibt pausiert', near(p.pos, 6, 0.05) && p.state === 'paused' && p.elPaused === true, JSON.stringify(p));
await page.click(`${itemSel} button[title^="Pause"]`);
await page.waitForTimeout(300);

// Fade-Out am Ende: Sprung hinein blendet aus, Sprung davor stellt den Pegel wieder her
await page.evaluate((id) => { window.cuePlayer.state.session.cues.find((x) => x.id === id).fadeOut = 3; }, id0);
await page.mouse.click(...(await at(0.85)));
await page.waitForTimeout(700);
const g1 = (await pos0()).gain;
await page.mouse.click(...(await at(0.2)));
await page.waitForTimeout(150);
const g2 = (await pos0()).gain;
check('Springen und Fade-Out: in der Ausblendung leiser, davor wieder voll', g1 < 0.8 && g2 > 0.99, JSON.stringify({ g1, g2 }));
await page.evaluate((id) => { window.cuePlayer.state.session.cues.find((x) => x.id === id).fadeOut = 0; }, id0);

// Show-Modus: kurzer Tipp springt nicht, Ziehen schon, Ziehen nach außerhalb bricht ab
await page.click('#btn-showmode');
await page.mouse.click(...(await at(0.2)));
let before = (await pos0()).pos;
await page.mouse.click(...(await at(0.8)));
p = await pos0();
check('Show-Modus: kurzer Tipp springt nicht', p.pos >= before && p.pos < before + 0.5, JSON.stringify({ before, p }));
let [x, y] = await at(0.25);
await page.mouse.move(x, y);
await page.mouse.down();
await page.mouse.move(x + 30, y, { steps: 3 });
const [x2] = await at(0.75);
await page.mouse.move(x2, y, { steps: 5 });
const mark = await page.$eval(`${barSel} .seek-mark`, (m) => ({ hidden: m.hidden, txt: m.textContent, left: parseFloat(m.style.left) }));
check('Show-Modus: Ziehen zeigt Marker mit Zielzeit', !mark.hidden && mark.txt.includes('0:09') && Math.abs(mark.left - 75) < 2, JSON.stringify(mark));
check('Show-Modus: beim Ziehen noch nicht gesprungen', (await pos0()).pos < 8);
await page.mouse.up();
p = await pos0();
check('Show-Modus: Loslassen springt (75 % → 9 s)', near(p.pos, 9), JSON.stringify(p));
check('Show-Modus: Marker wieder weg', await page.$eval(`${barSel} .seek-mark`, (m) => m.hidden));
await page.mouse.click(...(await at(0.1)), { delay: 0 }).catch(() => {});
before = (await pos0()).pos;
[x, y] = await at(0.3);
await page.mouse.move(x, y);
await page.mouse.down();
await page.mouse.move(x + 60, y, { steps: 4 });
await page.mouse.move(x + 60, y + 80, { steps: 4 });
const cancelMark = await page.$eval(`${barSel} .seek-mark`, (m) => m.classList.contains('cancel'));
await page.mouse.up();
p = await pos0();
check('Show-Modus: Ziehen nach außerhalb bricht ab', cancelMark && p.pos >= before && p.pos < before + 1, JSON.stringify({ before, p, cancelMark }));
page.once('dialog', (d) => d.accept());
await page.click('#btn-showmode');

// Nicht laufende Cues und andere Cue-Typen
const idle = await page.evaluate(async (i) => {
  const { engine, state } = window.cuePlayer;
  const r = engine.runner(state.session.cues[i].id);
  return { seek: r.seek(1), bars: document.querySelectorAll('.run-item .bar.seek').length };
}, 1);
check('Springen: nicht laufender Cue → nein', idle.seek === false && idle.bars === 1, JSON.stringify(idle));
await page.click('.cue-row >> nth=1');
await page.click('#btn-add-cue');
await page.click('[data-add="fade"]');
await page.fill('#cue-form-body input[type=number] >> nth=1', '3');
await page.click('#cue-form .primary');
await page.waitForTimeout(200);
await page.click('.cue-row >> nth=1'); // Ziel des Fades muss laufen, sonst endet der Fade sofort
await page.click('#btn-go');
await page.waitForTimeout(350);
await page.click('.cue-row >> nth=2');
await page.click('#btn-go');
await page.waitForTimeout(300);
const items = await page.$$eval('.run-item', (els) => els.map((e) => ({ seek: !!e.querySelector('.bar.seek'), wave: !!e.querySelector('canvas'), vu: !!e.querySelector('.vu-ch') })));
const plain = items.filter((i) => !i.seek && !i.wave && !i.vu).length, audio = items.filter((i) => i.seek && i.vu).length;
check('Fade-Cue im Aktiv-Bereich: normaler Balken ohne Wellenform/Pegel/Springen', items.length >= 2 && plain === 1 && audio === items.length - 1, JSON.stringify(items));
await stopNow();
await page.waitForTimeout(200);

// Rechter Rand → Ende: Cue endet
await page.click('.cue-row >> nth=0');
await page.click('#btn-go');
await page.waitForSelector(barSel);
await page.mouse.click(...(await at(1)));
await page.waitForTimeout(300);
check('Springen: rechter Rand → Cue endet', (await pos0()).state === 'idle');

check('Keine Konsolenfehler', errors.length === 0, errors.join(' | '));
await browser.close();
process.exit(failed ? 1 : 0);
