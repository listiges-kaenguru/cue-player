#!/usr/bin/env node
// Erzeugt die Screenshots für das Benutzerhandbuch (docs/img/*.webp) aus der echten App im Arbeitsordner.
// Eine Beispielshow wird als .cueshow gebaut und über „Importieren“ geladen; alles im Bild zeigt die echte Oberfläche.
// Nur die nummerierten Markierungen auf dem Hauptbildschirm legt das Werkzeug darüber.
//
// Braucht Playwright (node_modules), Chromium passend dazu und ImageMagick (`magick`) – am besten in einem Container.
//   node tools/handbuch-bilder.mjs [name …]      # ohne Namen: alle Bilder
// Neu erzeugen, wenn sich die Oberfläche sichtbar ändert; danach die Bilder ansehen und die Texte im Handbuch abgleichen.
import { execFileSync } from 'node:child_process';
import { createReadStream, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { dirname, extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { buildShowFile } from '../js/showfile.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'docs/img');
const TMP = mkdtempSync(join(tmpdir(), 'cue-handbuch-'));
const PORT = Number(process.env.PORT) || 5183;
const only = process.argv.slice(2);
const VERSION = readFileSync(join(ROOT, 'sw.js'), 'utf8').match(/cue-player-v([\d.]+)/)[1];

// ---------------------------------------------------------------- App ausliefern (nur Dateien im Repo)
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.webp': 'image/webp', '.md': 'text/markdown; charset=utf-8' };
const server = createServer((req, res) => {
  let file = resolve(ROOT, '.' + decodeURIComponent(new URL(req.url, 'http://x').pathname));
  if (file.endsWith(sep) || file === ROOT) file = join(file, 'index.html');
  const inside = file.startsWith(ROOT + sep) && !file.slice(ROOT.length).split(sep).some((p) => p.startsWith('.') || p === 'node_modules');
  try { if (!inside || !statSync(file).isFile()) throw 0; } catch { res.writeHead(404).end(); return; }
  res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
  createReadStream(file).pipe(res);
}).listen(PORT, '127.0.0.1');

// ---------------------------------------------------------------- Beispielshow
// Töne mit 8 kHz, damit die Show klein bleibt. Die Lautstärke schwankt wie bei Musik, damit Wellenform und Pegel
// etwas zeigen.
function wav(freq, sec) {
  const rate = 8000, n = Math.floor(rate * sec), buf = Buffer.alloc(44 + n * 2);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write('WAVEfmt ', 8);
  buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(rate, 24); buf.writeUInt32LE(rate * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34);
  buf.write('data', 36); buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) {
    const t = i / rate;
    const env = 0.04 + 0.36 * (0.5 + 0.5 * Math.sin((2 * Math.PI * t) / (5 + (freq % 7)))) * (0.65 + 0.35 * Math.abs(Math.sin(Math.PI * t * 1.6)));
    buf.writeInt16LE(Math.round(32767 * env * Math.sin((2 * Math.PI * freq * i) / rate)), 44 + i * 2);
  }
  return buf;
}
const MEDIA = [
  ['m1', 'einlass-musik.wav', 220, 200],
  ['m2', 'gewitter.wav', 110, 48],
  ['m3', 'regen-loop.wav', 330, 30],
  ['m4', 'kauz.wav', 880, 22],
  ['m5', 'applaus.wav', 440, 14],
];
const cue = (id, type, fields) => ({ id, type, name: '', color: '', preWait: 0, postWait: 0, nextAction: 'none',
  hotkey: '', midiTrigger: '', notes: '', ...fields });
const audio = (id, m, name, extra = {}) => {
  const [mediaId, mediaName, , duration] = MEDIA.find((x) => x[0] === m);
  return cue(id, 'audio', { mediaId, mediaName, duration, name, volume: 0, pan: 0, start: 0, end: 0,
    fadeIn: 0, fadeOut: 0, fadeCurve: 'log', loop: false, ...extra });
};
const session = {
  version: 1, id: 'handbuch', name: 'Der Sturm · Akt 1', updated: Date.now(),
  settings: { layout: 'list', showMode: false, confirmEdit: true, cartColumns: 4, goLockMs: 300, stopAllFade: 1.5,
    pauseAllFade: 0, masterDb: 0, midi: { enabled: false, go: '', stopAll: '' }, wakeLock: true, sinkId: '' },
  cues: [
    audio('c1', 'm1', 'Einlassmusik', { volume: -6, nextAction: 'follow' }),
    cue('c2', 'fade', { name: 'Einlass ausblenden', target: 'c1', volume: -60, duration: 5, fadeCurve: 'log', stopAfter: true }),
    audio('c3', 'm2', 'Gewitter', { fadeIn: 2, color: '#6639ba', preWait: 2, nextAction: 'continue', postWait: 4 }),
    audio('c4', 'm3', 'Regen (Loop)', { loop: true, fadeIn: 3, volume: -9 }),
    cue('c5', 'memo', { name: 'Ariel',
      notes: 'Kauz auf das Stichwort **„Hört, hört!“**\n- danach Regen unter den Text ziehen\n- Blitz geht per MIDI ans Lichtpult' }),
    audio('c6', 'm4', 'Kauz', { pan: 0.4, hotkey: 'KeyK' }),
    cue('c7', 'fade', { name: 'Regen unter Text', target: 'c4', volume: -20, duration: 4, fadeCurve: 'log', stopAfter: false }),
    cue('c8', 'midi', { name: 'Licht: Blitz', output: '', msg: 'noteon', channel: 1, data1: 60, data2: 127 }),
    audio('c9', 'm5', 'Applaus', { hotkey: 'KeyA', color: '#1a7f37' }),
    cue('c10', 'startstop', { name: 'Alles ausblenden', target: '', mode: 'stop', fade: 5 }),
  ],
};
const SHOW = join(TMP, 'handbuch.cueshow');
{
  const items = MEDIA.map(([id, name, freq, sec]) => ({ id, name, type: 'audio/wav', blob: new Blob([wav(freq, sec)]) }));
  writeFileSync(SHOW, Buffer.from(await buildShowFile(session, items).arrayBuffer()));
}

// ---------------------------------------------------------------- Markierungen
// Nummern über Bereichen der Oberfläche: gestrichelter Rahmen um den Bereich (eine oder mehrere Selektoren, Komma),
// die runde Marke an einer freien Stelle: mitten auf `ort` (center), innen rechts (right) oder daneben (after/before).
async function markieren(page, marken) {
  await page.evaluate((marken) => {
    const rect = (sel) => {
      const els = sel.split(',').map((s) => document.querySelector(s.trim())).filter(Boolean);
      if (!els.length) throw new Error(`Markierung: ${sel} nicht gefunden`);
      return els.map((e) => e.getBoundingClientRect()).reduce((a, b) => ({ left: Math.min(a.left, b.left),
        top: Math.min(a.top, b.top), right: Math.max(a.right, b.right), bottom: Math.max(a.bottom, b.bottom) }));
    };
    const D = 24;
    const layer = document.createElement('div');
    layer.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:99999';
    for (const [n, bereich, ort, wie] of marken) {
      const r = rect(bereich), o = rect(ort);
      const box = document.createElement('div');
      // Rahmen etwas außerhalb des Bereichs, damit er keinen Text schneidet, aber im Bild
      const l = Math.max(1, r.left - 4), t = Math.max(1, r.top - 4);
      const w = Math.min(innerWidth - 1, r.right + 4) - l, hgt = Math.min(innerHeight - 1, r.bottom + 4) - t;
      box.style.cssText = `position:absolute;left:${l}px;top:${t}px;width:${w}px;height:${hgt}px;`
        + 'border:2px dashed #ff8bd8;border-radius:8px;box-sizing:border-box';
      const cy = (o.top + o.bottom) / 2 - D / 2;
      const x = { center: (o.left + o.right) / 2 - D / 2, right: o.right - D - 8, after: o.right + 8, before: o.left - D - 8 }[wie];
      const dot = document.createElement('div');
      dot.textContent = n;
      dot.style.cssText = `position:absolute;left:${x}px;top:${cy}px;width:${D}px;height:${D}px;border-radius:50%;`
        + `background:#ff8bd8;color:#14151b;font:700 15px/${D}px system-ui,sans-serif;text-align:center;box-shadow:0 0 0 2px #14151b`;
      layer.append(box, dot);
    }
    document.body.append(layer);
  }, marken);
}

// ---------------------------------------------------------------- Aufnahmen
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined,
  args: ['--autoplay-policy=no-user-gesture-required'] });
const errors = [];
const webp = (src, dst, width) => execFileSync('magick', [src, '-resize', `${width}x>`, '-quality', '80', '-define', 'webp:method=6', dst]);

async function bild(name, { viewport = { width: 1280, height: 720 }, width = 1280, steps, element } = {}) {
  if (only.length && !only.includes(name)) return;
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 2, locale: 'de-DE', colorScheme: 'dark' });
  // Versionsprüfung nie echt fragen: die eigene Version melden, dann erscheint kein Update-Hinweis
  await ctx.route('https://api.github.com/**', (r) => r.fulfill({ json: { tag_name: `v${VERSION}` }, headers: { 'access-control-allow-origin': '*' } }));
  const page = await ctx.newPage();
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`${name}: ${m.text()}`); });
  page.on('pageerror', (e) => errors.push(`${name}: ${e.message}`));
  await page.goto(`http://127.0.0.1:${PORT}/`);
  await page.waitForSelector('#btn-go');
  await page.setInputFiles('#file-import', SHOW);
  await page.waitForFunction((n) => document.querySelectorAll('.cue-row').length === n, session.cues.length);
  await page.waitForSelector('.toast', { state: 'detached', timeout: 8000 }).catch(() => {});
  await steps?.(page);
  await page.waitForSelector('.toast', { state: 'detached', timeout: 8000 }).catch(() => {});
  const raw = join(TMP, `${name}.png`);
  await (element ? page.locator(element).screenshot({ path: raw }) : page.screenshot({ path: raw }));
  await ctx.close();
  webp(raw, join(OUT, `${name}.webp`), width * 2 > 1600 ? 1600 : width * 2);
  console.log(`✓ ${name}.webp (${Math.round(statSync(join(OUT, `${name}.webp`)).size / 1024)} KB)`);
}

const row = (page, n) => page.click(`.cue-row >> nth=${n - 1}`);
async function go(page, n, wait = 300) { if (n) await row(page, n); await page.click('#btn-go'); await page.waitForTimeout(wait); }
// Mitten in der Szene: Gewitter und Regen laufen, das Regiebuch zeigt das Memo vor dem Kauz.
const mittendrin = async (page) => { await go(page, 3, 9000); await page.waitForTimeout(3000); };

await bild('bildschirm', {
  steps: async (page) => {
    await mittendrin(page);
    await markieren(page, [
      ['1', '.topbar', '.topbar .tb-spacer', 'center'],
      ['2', '#list-view', '.cue-table th.c-name', 'center'],
      ['3', '#memo-panel', '#memo-summary', 'right'],
      ['4', '#running', '#running h2', 'right'],
      ['5', '#btn-go', '#btn-go', 'right'],
      ['6', '.transport-btns', '.transport-btns', 'after'],
      ['7', '.master, #master-vu', '.master', 'before'],
    ]);
  },
});
await bild('editor', {
  viewport: { width: 1280, height: 1400 }, width: 640, element: '#dlg-cue',
  steps: async (page) => { await page.dblclick('.cue-row >> nth=2 >> .c-name'); await page.waitForSelector('#dlg-cue[open]'); },
});
await bild('cart', {
  steps: async (page) => { await mittendrin(page); await page.click('#btn-layout'); await page.waitForTimeout(500); },
});
await bild('einstellungen', {
  viewport: { width: 1280, height: 1800 }, width: 640, element: '#dlg-settings',
  steps: async (page) => { await page.click('#btn-settings'); await page.waitForSelector('#dlg-settings[open]'); },
});

await browser.close();
server.close();
rmSync(TMP, { recursive: true, force: true });
if (errors.length) { console.error('Konsolenfehler:\n' + errors.join('\n')); process.exitCode = 1; }
