// Browsertest: Ausgabegerät wach halten (Einstellung je Gerät, Signal am Master vorbei, Pulsplan, Statussymbol).
// Start:  npx http-server -p 8080 -c-1 &   dann:  node tests/wachhalten.mjs
import { chromium } from 'playwright';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const URL = process.env.APP_URL || 'http://localhost:8080/';
const dir = mkdtempSync(join(tmpdir(), 'cue-wach-'));

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
const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
await context.route('https://api.github.com/**', (r) => r.fulfill({ json: { tag_name: 'v0.0.1' }, headers: { 'access-control-allow-origin': '*' } }));
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

const ready = () => page.waitForFunction(() => window.cuePlayer?.state.session && window.cuePlayer.engine.keepAlive);
const meta = (v) => page.evaluate(async (v) => {
  const s = await import('/js/storage.js');
  if (v === undefined) return s.getMeta('keepAlive');
  await s.setMeta('keepAlive', v);
  return null;
}, v);
const ka = () => page.evaluate(() => {
  const { engine } = window.cuePlayer;
  const k = engine.keepAlive;
  const now = engine.ctx?.currentTime ?? 0;
  return {
    running: k.running, audible: k.audible, settings: k.settings, lastActivity: k.lastActivity, now,
    future: k.pulses.filter(([s]) => s > now).map(([s, e]) => [s, e]),
    ctx: !!engine.ctx,
  };
});
const icon = () => page.evaluate(() => {
  const el = document.getElementById('ka-status');
  return el ? { hidden: el.hidden, state: el.dataset.state, title: el.title } : null;
});
const openSettings = async () => { await page.click('#btn-settings'); await page.waitForSelector('#ka-enabled'); };
const closeSettings = () => page.keyboard.press('Escape');

await page.goto(URL);
await ready();

// --- Standard: aus ---------------------------------------------------------------------------------------------
check('Standard: aus, keine Quelle', !(await ka()).running && (await ka()).settings.enabled === false);
let ic = await icon();
check('Standard: Statussymbol unsichtbar', ic && ic.hidden === true, JSON.stringify(ic));
await openSettings();
check('Einstellung vorhanden und aus', !(await page.isChecked('#ka-enabled')));
check('Standardwerte im Dialog', await page.evaluate(() =>
  ['ka-signal', 'ka-interval', 'ka-duration', 'ka-level'].map((id) => document.getElementById(id).value).join('|')) === 'tone|5|5|-26');

// --- Einschalten über den Dialog -------------------------------------------------------------------------------
await page.check('#ka-enabled');
await page.waitForFunction(() => window.cuePlayer.engine.keepAlive.running);
let k = await ka();
check('Eingeschaltet: Quelle läuft', k.running && k.ctx);
const stored = await meta();
check('Gespeichert je Gerät im meta-Store', stored?.enabled === true && stored.intervalMin === 5, JSON.stringify(stored));
check('Nicht in der Show gespeichert', await page.evaluate(() => !('keepAlive' in window.cuePlayer.state.session.settings)));
check('Erster Puls genau ein Intervall nach der letzten Aktivität', k.future.length > 0 && Math.abs(k.future[0][0] - k.lastActivity - 300) < 1e-6
  && Math.abs(k.future[0][1] - k.future[0][0] - 5) < 1e-6, JSON.stringify(k.future.slice(0, 2)));
check('Pulse im Abstand des Intervalls', k.future.length >= 2 && Math.abs(k.future[1][0] - k.future[0][0] - 300) < 1e-6);
ic = await icon();
check('Statussymbol aktiv', ic && !ic.hidden && ic.state === 'active', JSON.stringify(ic));

// Intervall ändern → neu geplant
await page.fill('#ka-interval', '12');
await page.dispatchEvent('#ka-interval', 'change');
k = await ka();
check('Geändertes Intervall wird übernommen und neu geplant', k.settings.intervalMin === 12 && Math.abs(k.future[0][0] - k.lastActivity - 720) < 1e-6, JSON.stringify(k.future[0]));
// Ungültige Eingabe → Grenze
await page.fill('#ka-interval', '999');
await page.dispatchEvent('#ka-interval', 'change');
check('Intervall außerhalb wird auf 60 begrenzt', (await ka()).settings.intervalMin === 60 && (await page.inputValue('#ka-interval')) === '60');
await page.fill('#ka-interval', '5');
await page.dispatchEvent('#ka-interval', 'change');
await page.fill('#ka-duration', '1');
await page.dispatchEvent('#ka-duration', 'change');

// --- Signal am Master vorbei -----------------------------------------------------------------------------------
await page.evaluate(() => {
  const { engine } = window.cuePlayer;
  const a = engine.ctx.createAnalyser();
  a.fftSize = 2048;
  engine.keepAlive.gain.connect(a);
  window.__kaAnalyser = a;
});
/** Größter Spitzenwert am Signal und am Master über ms Millisekunden */
const peaks = (ms) => page.evaluate(async (ms) => {
  const { engine } = window.cuePlayer;
  const a = window.__kaAnalyser, b = new Float32Array(a.fftSize);
  let ka = 0, master = 0;
  const end = performance.now() + ms;
  while (performance.now() < end) {
    a.getFloatTimeDomainData(b);
    for (const v of b) ka = Math.max(ka, Math.abs(v));
    master = Math.max(master, ...engine.masterPeaks());
    await new Promise((r) => setTimeout(r, 30));
  }
  return { ka, master };
}, ms);

let p = await peaks(400);
check('Zwischen den Pulsen still', p.ka < 1e-4, JSON.stringify(p));
await page.fill('#master', '-60');
await page.dispatchEvent('#master', 'input');
await page.click('#ka-pulse');
p = await peaks(1300);
check('„Jetzt senden“: Puls mit −26 dBFS trotz Master auf Minimum', p.ka > 0.045 && p.ka < 0.056, JSON.stringify(p));
check('Puls erscheint nicht in der Master-Pegelanzeige', p.master < 1e-4, JSON.stringify(p));
p = await peaks(300);
check('Nach dem Puls wieder still', p.ka < 1e-4, JSON.stringify(p));
await page.fill('#master', '0');
await page.dispatchEvent('#master', 'input');
await closeSettings();
ic = await icon();
check('Tooltip nennt den letzten Puls', /letzter Puls \d\d:\d\d/.test(ic.title), ic.title);

// --- Wiedergabe setzt den Zähler zurück ------------------------------------------------------------------------
await page.setInputFiles('#file-audio', [wav(join(dir, 'kurz.wav'), 1.5)]);
await page.waitForFunction(() => window.cuePlayer.state.session.cues.some((c) => c.duration > 0));
await page.evaluate(() => { const { engine, state } = window.cuePlayer; engine.go(state.session.cues[0].id); });
await page.waitForFunction(() => window.cuePlayer.engine.keepAlive.audible);
k = await ka();
check('Während der Wiedergabe kein Puls geplant', k.audible && k.future.length === 0, JSON.stringify(k.future));
await page.waitForFunction(() => !window.cuePlayer.engine.keepAlive.audible, null, { timeout: 5000 });
k = await ka();
check('Nach dem Ende: erster Puls ein Intervall nach dem letzten Spielen',
  k.future.length > 0 && Math.abs(k.future[0][0] - k.lastActivity - 300) < 1e-6 && k.now - k.lastActivity < 0.5, JSON.stringify({ la: k.lastActivity, now: k.now, f: k.future[0] }));

// Pause zählt als Ende der Wiedergabe
await page.evaluate(() => { const { engine, state } = window.cuePlayer; engine.go(state.session.cues[0].id); });
await page.waitForFunction(() => window.cuePlayer.engine.keepAlive.audible);
await page.evaluate(() => window.cuePlayer.engine.pauseAll(0));
k = await ka();
check('Pause alle: Zähler beginnt neu, Quelle läuft weiter', k.running && !k.audible && k.future.length > 0 && Math.abs(k.future[0][0] - k.lastActivity - 300) < 1e-6);
await page.evaluate(() => window.cuePlayer.engine.stopAll(0));
// Während der kurzen Entknack-Rampe des Stopps gilt die Cue noch als hörbar
await page.waitForFunction(() => !window.cuePlayer.engine.keepAlive.audible, null, { timeout: 2000 });
k = await ka();
check('Stop alle beendet das Signal nicht', k.running && k.future.length > 0);
await page.evaluate(() => { const { engine, state } = window.cuePlayer; engine.setSession(state.session); });
check('Show-Wechsel beendet das Signal nicht', (await ka()).running);

// --- Ausschalten ---------------------------------------------------------------------------------------------
await openSettings();
await page.uncheck('#ka-enabled');
k = await ka();
check('Ausgeschaltet: Quelle sofort beendet', !k.running && (await page.evaluate(() => window.cuePlayer.engine.keepAlive.src === null)));
check('Ausgeschaltet: gespeichert', (await meta()).enabled === false);
await closeSettings();
check('Ausgeschaltet: Statussymbol unsichtbar', (await icon()).hidden);

// --- Neu laden: wartet auf erste Bedienung, ungültige gespeicherte Werte -----------------------------------
await meta({ enabled: true, signal: '<img src=x onerror=alert(1)>', intervalMin: 'abc', durationS: -3, levelDb: 99, extra: 1 });
await page.reload();
await ready();
k = await ka();
check('Gespeicherte Werte geprüft', JSON.stringify(k.settings) === JSON.stringify({ enabled: true, signal: 'tone', intervalMin: 5, durationS: 1, levelDb: -20 }), JSON.stringify(k.settings));
ic = await icon();
check('Vor der ersten Bedienung: wartet', !k.ctx && !k.running && ic.state === 'waiting' && /erste Bedienung/.test(ic.title), JSON.stringify(ic));
await page.click('#session-name');
await page.waitForFunction(() => window.cuePlayer.engine.keepAlive.running, null, { timeout: 3000 }).catch(() => {});
k = await ka();
check('Erste Bedienung startet das Signal (ohne GO)', k.running && k.ctx);
ic = await icon();
check('Statussymbol danach aktiv', ic.state === 'active', JSON.stringify(ic));

check('Keine Konsolenfehler', errors.length === 0, errors.join(' | '));
await browser.close();
console.log(failed ? `\n${failed} Prüfung(en) fehlgeschlagen` : '\nAlle Prüfungen bestanden');
process.exit(failed ? 1 : 0);
