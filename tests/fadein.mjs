// Browsertest: Fade-In und Fade-Out der Audio-Cues (unabhängig davon, wie der Cue vorher geendet hat).
// Start:  npx http-server -p 8080 -c-1 &   dann:  node tests/fadein.mjs
import { chromium } from 'playwright';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const URL = process.env.APP_URL || 'http://localhost:8080/';
const dir = mkdtempSync(join(tmpdir(), 'cue-fadein-'));

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

/** Neue Seite mit zwei Audio-Cues: 0 = 8 s, 1 = 2 s. playDelay verzögert HTMLMediaElement.play() (langsames Ausgabegerät). */
async function open(playDelay = 0) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  if (playDelay) {
    await page.addInitScript((ms) => {
      const play = HTMLMediaElement.prototype.play;
      HTMLMediaElement.prototype.play = function () {
        return new Promise((res) => setTimeout(res, ms)).then(() => play.call(this));
      };
    }, playDelay);
  }
  await page.route('https://api.github.com/**', (r) => r.fulfill({ json: { tag_name: 'v0.0.1' }, headers: { 'access-control-allow-origin': '*' } }));
  await page.goto(URL);
  await page.setInputFiles('#file-audio', [wav(join(dir, 'lang.wav'), 8), wav(join(dir, 'kurz.wav'), 2)]);
  await page.waitForFunction(() => document.querySelectorAll('.cue-row').length === 2);
  await page.waitForFunction(() => window.cuePlayer.state.session.cues.every((c) => c.duration > 0));
  return { page, errors };
}

const { page, errors } = await open();
/** Fade-Stufe (env) und Zustand des Cues i */
const st = (i = 0) => page.evaluate((i) => {
  const { engine, state } = window.cuePlayer;
  const r = engine.runners.get(state.session.cues[i].id);
  return { env: +(r.chain?.env.gain.value ?? -1).toFixed(4), state: r.state };
}, i);
const go = (o, i = 0) => page.evaluate(([o, i]) => {
  const { engine, state } = window.cuePlayer;
  const c = state.session.cues[i];
  Object.assign(c, o);
  engine.go(c.id);
}, [o, i]);
const call = (m, arg, i = 0) => page.evaluate(([m, arg, i]) => {
  const { engine, state } = window.cuePlayer;
  engine.runners.get(state.session.cues[i].id)[m](arg);
}, [m, arg, i]);

const LOG = { fadeIn: 3, fadeOut: 0, fadeCurve: 'log' };
/** log-Kurve von −60 dB auf 0 dB über 3 s: nach 0,3 s etwa −54 dB, nach 1,5 s etwa −30 dB, ab 3 s voll */
async function fadeInLog(name) {
  await go(LOG);
  await wait(300);
  const a = await st();
  await wait(1200);
  const b = await st();
  await wait(1800);
  const c = await st();
  check(`${name}: blendet ein`, a.env < 0.05 && b.env > 0.01 && b.env < 0.15 && c.env > 0.99 && c.state === 'running', JSON.stringify({ a, b, c }));
}

await fadeInLog('Erster Start eines frisch geladenen Cues');
// hart wie bei GO auf einen laufenden Cue, ohne Ausblenden (Fade-Stufe bleibt auf 1)
await page.evaluate(() => {
  const { engine, state } = window.cuePlayer;
  engine.runners.get(state.session.cues[0].id).stop(0, true);
});
await wait(100);
await fadeInLog('Nach hartem Stopp');
await call('stop', 1); // mit Fade, endet leise
await wait(1300);
await fadeInLog('Nach Stopp mit Fade');
await call('stop', 0);

// Natürliches Ende ohne Fade-Out (Fade-Stufe steht danach auf 1), dann erneut GO mit Fade-In
await go({ fadeIn: 0, fadeOut: 0 }, 1);
await wait(2400);
const e0 = await st(1);
await go({ fadeIn: 1, fadeOut: 0, fadeCurve: 'linear' }, 1);
await wait(150);
const e1 = await st(1);
check('Nach natürlichem Ende: erneutes GO blendet ein', e0.state === 'idle' && e1.env < 0.4 && e1.state === 'running', JSON.stringify({ e0, e1 }));
await call('stop', 0, 1);

// Lineare Kurve: nach der halben Zeit etwa halbe Amplitude
await go({ fadeIn: 3, fadeOut: 0, fadeCurve: 'linear' });
await wait(1500);
const l = await st();
check('Linear: nach 1,5 von 3 s etwa die Hälfte', l.env > 0.35 && l.env < 0.65, JSON.stringify(l));
await call('stop', 0);

// Ohne Fade-In sofort voll
await go({ fadeIn: 0, fadeOut: 0 });
await wait(100);
const n = await st();
check('Ohne Fade-In sofort voll', n.env === 1 && n.state === 'running', JSON.stringify(n));
await call('stop', 0);

// Pause während des Fade-Ins: nach dem Fortsetzen wieder voll
await go({ fadeIn: 2, fadeOut: 0, fadeCurve: 'linear' });
await wait(500);
await call('pause', 0);
await wait(200);
await call('resume', 0);
await wait(1800);
const p = await st();
check('Pause während des Fade-Ins: danach voll', p.env > 0.99 && p.state === 'running', JSON.stringify(p));
await call('stop', 0);

// Regression: Fade-Out am Ende (8-s-Datei, 3 s Fade-Out ab 5 s)
await go({ fadeIn: 0, fadeOut: 3, fadeCurve: 'log' });
await wait(4700);
const o1 = await st();
await wait(1500);
const o2 = await st();
await wait(2200);
const o3 = await st();
check('Fade-Out am Ende', o1.env === 1 && o2.env > 0.02 && o2.env < 0.6 && o3.state === 'idle', JSON.stringify({ o1, o2, o3 }));

// Regression: Stopp mit Fade
await go({ fadeIn: 0, fadeOut: 0 });
await wait(200);
await call('stop', 1);
await wait(500);
const s1 = await st();
await wait(700);
const s2 = await st();
check('Stopp mit Fade', s1.env > 0 && s1.env < 1 && s1.state === 'running' && s2.state === 'idle', JSON.stringify({ s1, s2 }));

check('Keine Konsolenfehler', errors.length === 0, errors.join(' | '));
await page.close();

// Langsames Ausgabegerät: play() braucht 500 ms. Der Fade darf erst danach beginnen.
{
  const { page: slow, errors: err2 } = await open(500);
  const sst = () => slow.evaluate(() => {
    const { engine, state } = window.cuePlayer;
    const r = engine.runners.get(state.session.cues[0].id);
    return { env: +(r.chain?.env.gain.value ?? -1).toFixed(4), state: r.state };
  });
  await slow.evaluate(() => {
    const { engine, state } = window.cuePlayer;
    const c = state.session.cues[0];
    Object.assign(c, { fadeIn: 2, fadeOut: 0, fadeCurve: 'linear' });
    engine.go(c.id);
  });
  await wait(400);
  const a = await sst();
  await wait(1100); // 1,5 s nach GO = 1 s nach dem tatsächlichen Start
  const b = await sst();
  check('Langsames Gerät: still, bis die Wiedergabe läuft', a.env < 0.01, JSON.stringify(a));
  check('Langsames Gerät: Fade läuft ab dem tatsächlichen Start', b.env > 0.35 && b.env < 0.65, JSON.stringify(b));
  check('Langsames Gerät: keine Konsolenfehler', err2.length === 0, err2.join(' | '));
}

await browser.close();
console.log(failed ? `\n${failed} Prüfung(en) fehlgeschlagen` : '\nAlle Prüfungen bestanden');
process.exit(failed ? 1 : 0);
