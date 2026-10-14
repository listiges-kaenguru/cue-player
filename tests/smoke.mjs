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

// Manifest-Icons: ladbar und nicht unter /icons/ (Apache-Standard-Alias überdeckt den Ordner)
const iconCheck = await page.evaluate(async () => {
  const m = await (await fetch('manifest.webmanifest')).json();
  return Promise.all(m.icons.map(async (i) => {
    const r = await fetch(i.src, { cache: 'no-store' });
    return { src: i.src, ok: r.ok && /^image\//.test(r.headers.get('content-type') || '') && !/^\/?icons\//.test(i.src) };
  }));
});
check('Manifest-Icons ladbar', iconCheck.every((i) => i.ok), JSON.stringify(iconCheck.filter((i) => !i.ok)));

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

// --- Pause-Cue mit Fade ---
const env = (i) => page.evaluate((i) => {
  const { engine, state } = window.cuePlayer;
  const r = engine.runners.get(state.session.cues[i].id);
  return { gain: r.chain?.env.gain.value ?? null, elPaused: r.el?.paused ?? null, state: r.state, pos: r.el?.currentTime ?? 0 };
}, i);
await page.keyboard.press('Escape'); await page.keyboard.press('Escape');
await page.click('.cue-row >> nth=2');
await page.click('#btn-add-cue');
await page.click('[data-add="pause"]');
await page.fill('#cue-form-body input[type=number] >> nth=1', '1'); // Fade beim Pausieren
await page.fill('#cue-form-body input[type=number] >> nth=2', '1'); // Fade beim Fortsetzen
await page.click('#cue-form .primary');
await page.waitForTimeout(200);
check('Pause-Cue angelegt', (await page.$$('.cue-row')).length === 4);
await page.click('.cue-row >> nth=0');
await page.click('#btn-go');
await page.waitForTimeout(400);
await page.click('.cue-row >> nth=3');
await page.click('#btn-go');
await page.waitForTimeout(500);
let e = await env(0);
check('Pause-Fade: blendet aus, spielt noch', e.state === 'paused' && e.gain > 0.01 && e.gain < 0.95 && e.elPaused === false, JSON.stringify(e));
await page.waitForTimeout(800);
e = await env(0);
const posPaused = e.pos;
check('Pause-Fade: danach angehalten', e.elPaused === true && e.gain < 0.01, JSON.stringify(e));
await page.waitForTimeout(300);
check('Pause-Fade: Position steht', (await env(0)).pos === posPaused);
await page.click('.cue-row >> nth=3');
await page.click('#btn-go');
await page.waitForTimeout(450);
e = await env(0);
check('Pause-Fade: Fortsetzen blendet ein', e.state === 'running' && e.elPaused === false && e.gain > 0.01 && e.gain < 0.95, JSON.stringify(e));
await page.waitForTimeout(800);
e = await env(0);
check('Pause-Fade: wieder volle Lautstärke', e.gain > 0.99, JSON.stringify(e));

// --- Klonen über den Editor ---
await page.keyboard.press('Escape'); await page.keyboard.press('Escape');
const before = (await page.$$('.cue-row')).length;
await page.dblclick('.cue-row >> nth=0');
await page.click('#cue-form button[value=clone]');
await page.waitForTimeout(300);
const titles = await page.$$eval('.cue-row .title', (r) => r.map((x) => x.textContent));
check('Klonen: Kopie hinter dem Original', titles.length === before + 1 && titles[1] === titles[0], JSON.stringify(titles));
check('Klonen: Editor der Kopie offen', await page.$eval('#dlg-cue', (d) => d.open) && (await page.textContent('#cue-form-title')).startsWith('Cue 2'));
await page.click('#cue-form button[value=cancel]');

// --- Memo: Kapitel-Trenner, Regiebuch, GO überspringt passive Memos ---
await page.click('.cue-row >> nth=0');
await page.click('#btn-add-cue');
await page.click('[data-add="memo"]');
await page.fill('#cue-form-body input[type=text] >> nth=0', 'Umbau');
await page.fill('#cue-form-body textarea >> nth=0', '# Kopf\n! **Achtung** <img src=x onerror=alert(1)>\n- Punkt');
const mdStyle = (sel) => page.$$eval(sel, (els) => els.map((e) => {
  const c = getComputedStyle(e);
  return [e.tagName, c.fontSize, c.fontWeight, c.textTransform, c.color, c.borderBottomWidth, c.marginTop, c.marginBottom].join(' ');
}));
const previewStyle = await mdStyle('.md-preview > *');
await page.click('#cue-form .primary');
await page.waitForTimeout(200);
check('Memo als Trenner in der Liste', await page.$eval('.cue-row >> nth=1', (r) => r.classList.contains('memo-row')));
await page.click('.cue-row >> nth=0');
await page.click('#btn-go');
await page.waitForTimeout(400);
const sbTitle = await page.$eval('.cue-row.standby .title', (t) => t.textContent);
check('GO überspringt passives Memo', sbTitle !== 'Umbau', sbTitle);
const panel = await page.$eval('#memo-panel', (d) => ({ hidden: d.hidden, html: d.querySelector('#memo-body').innerHTML }));
check('Regiebuch zeigt Memo', !panel.hidden && panel.html.includes('<strong>Achtung</strong>') && panel.html.includes('<li>Punkt</li>'));
const regieStyle = await mdStyle('#memo-body .md > *');
check('Regiebuch formatiert wie die Vorschau', JSON.stringify(regieStyle) === JSON.stringify(previewStyle), JSON.stringify({ previewStyle, regieStyle }));
check('Regiebuch escaped HTML', !panel.html.includes('<img') && panel.html.includes('&lt;img'));
await page.keyboard.press('Escape'); await page.keyboard.press('Escape');

// --- Presets ---
await page.click('.cue-row >> nth=0');
await page.click('#btn-add-cue');
await page.waitForSelector('#add-menu:not([hidden]) [data-preset]');
const presetNames = await page.$$eval('#preset-menu [data-preset]', (b) => b.map((x) => x.textContent.trim()));
check('Standard-Presets vorhanden', presetNames.length >= 4, JSON.stringify(presetNames));
const nRows = (await page.$$('.cue-row')).length;
await page.click('#preset-menu [data-preset]:has-text("Ausblenden 3 s + Stop")');
await page.waitForTimeout(300);
const ins = await page.evaluate(() => { const c = window.cuePlayer.state.session.cues; return { n: c.length, type: c[1].type, target: c[1].target, first: c[0].id, vol: c[1].volume }; });
check('Preset eingefügt (Fade auf Cue davor)', ins.n === nRows + 1 && ins.type === 'fade' && ins.target === ins.first && ins.vol === -60, JSON.stringify(ins));
page.once('dialog', (d) => d.accept('Mein Test-Preset'));
await page.dblclick('.cue-row >> nth=1');
await page.click('#cue-preset');
await page.waitForTimeout(300);
await page.click('#cue-form button[value=cancel]');
await page.click('#btn-add-cue');
await page.waitForSelector('#add-menu:not([hidden]) [data-preset]');
check('Eigenes Preset im Menü', (await page.$$eval('#preset-menu [data-preset]', (b) => b.map((x) => x.textContent))).some((t) => t.includes('Mein Test-Preset')));
await page.click('#preset-menu [data-manage]');
await page.waitForSelector('#dlg-presets[open]');
check('Presets-Dialog', (await page.$$('#preset-list .ses')).length === presetNames.length + 1);
await page.click('#dlg-presets button[value=close]');

// --- Start/Stop-Cue (Umschalten) ---
await page.keyboard.press('Escape'); await page.keyboard.press('Escape');
await page.click('.cue-row >> nth=0');
await page.click('#btn-add-cue');
await page.click('[data-add="startstop"]');
await page.click('#cue-form .primary');
await page.waitForTimeout(200);
const ss = await page.evaluate(() => { const c = window.cuePlayer.state.session.cues; return { type: c[1].type, mode: c[1].mode, ok: c[1].target === c[0].id }; });
check('Start/Stop-Cue angelegt (Ziel = Cue davor)', ss.type === 'startstop' && ss.mode === 'toggle' && ss.ok, JSON.stringify(ss));
const st0 = () => page.evaluate(() => { const { engine, state } = window.cuePlayer; return engine.runners.get(state.session.cues[0].id).state; });
await page.click('.cue-row >> nth=1');
await page.click('#btn-go');
await page.waitForTimeout(300);
check('Start/Stop: startet gestopptes Ziel', (await st0()) === 'running');
await page.click('.cue-row >> nth=1');
await page.waitForTimeout(350); // GO-Sperre
await page.click('#btn-go');
await page.waitForTimeout(300);
check('Start/Stop: stoppt laufendes Ziel', (await st0()) === 'idle');

// --- Show/Edit-Schalter mit Nachfrage ---
const showMode = () => page.$eval('#btn-showmode', (b) => b.getAttribute('aria-checked'));
await page.click('#btn-showmode');
check('Schalter: Show-Modus an', (await showMode()) === 'true' && (await page.$eval('#btn-add-audio', (b) => b.offsetParent === null)));
page.once('dialog', (d) => d.dismiss());
await page.click('#btn-showmode');
check('Schalter: Nachfrage abgelehnt → bleibt Show', (await showMode()) === 'true');
page.once('dialog', (d) => d.accept());
await page.click('#btn-showmode');
check('Schalter: Nachfrage bestätigt → Edit', (await showMode()) === 'false');

// --- Neue Show für Memo-Bestätigung und Mehrfachauswahl ---
page.once('dialog', (d) => d.accept('Test 2'));
await page.click('#btn-sessions');
await page.click('#ses-new');
await page.waitForTimeout(400);
await page.setInputFiles('#file-audio', [a, b]);
await page.waitForFunction(() => document.querySelectorAll('.cue-row').length === 2);
const cueData = () => page.evaluate(() => window.cuePlayer.state.session.cues.map((c) => ({ id: c.id, type: c.type, target: c.target, name: c.name })));
const stateOf = (i) => page.evaluate((i) => { const { engine, state } = window.cuePlayer; return engine.runners.get(state.session.cues[i].id).state; }, i);

// Memo mit Bestätigung zwischen Cue 1 und 2
await page.click('.cue-row >> nth=0');
await page.click('#btn-add-cue');
await page.click('[data-add="memo"]');
await page.fill('#cue-form-body input[type=text] >> nth=0', 'Umbau');
await page.check('#cue-form-body input[type=checkbox] >> nth=0');
await page.click('#cue-form .primary');
await page.waitForTimeout(200);
check('Memo-Bestätigung: Badge in der Liste', (await page.textContent('.memo-row')).includes('bestätigen'));
await page.click('.cue-row >> nth=2');
check('Memo-Bestätigung: GO-Taste markiert', await page.$eval('#btn-go', (b) => b.classList.contains('needs-confirm')));
await page.click('#btn-go');
await page.waitForTimeout(200);
check('Memo-Bestätigung: Abfrage statt Start', (await page.$eval('#dlg-confirm', (d) => d.open)) && (await stateOf(2)) === 'idle');
await page.keyboard.press('Escape');
await page.waitForTimeout(200);
check('Memo-Bestätigung: Abbrechen startet nichts', !(await page.$eval('#dlg-confirm', (d) => d.open)) && (await stateOf(2)) === 'idle');
await page.click('#btn-go');
await page.waitForSelector('#dlg-confirm[open]');
await page.keyboard.press('Space');
await page.waitForTimeout(300);
check('Memo-Bestätigung: Leertaste bestätigt und startet', (await stateOf(2)) === 'running');
await page.keyboard.press('Escape'); await page.keyboard.press('Escape');

// Fade auf Cue 1 als Cue 2 einfügen, dann Cue 1 + Fade auswählen
await page.click('.cue-row >> nth=0');
await page.click('#btn-add-cue');
await page.click('[data-add="fade"]');
await page.click('#cue-form .primary');
await page.waitForTimeout(200);
await page.click('.cue-row >> nth=0');
await page.click('.cue-row >> nth=0', { modifiers: ['Control'] });
await page.click('.cue-row >> nth=1', { modifiers: ['Control'] });
check('Auswahl: Leiste mit 2 Cues', !(await page.$eval('#sel-bar', (e) => e.hidden)) && (await page.textContent('#sel-count')).startsWith('2'));
page.once('dialog', (d) => d.accept('Zwei-Cue-Preset'));
await page.click('#sel-preset');
await page.waitForTimeout(300);
await page.click('.cue-row >> nth=3'); // Standby: letzter Cue
await page.click('#btn-add-cue');
await page.waitForSelector('#add-menu:not([hidden]) [data-preset]');
await page.click('#preset-menu [data-preset]:has-text("Zwei-Cue-Preset")');
await page.waitForTimeout(300);
let cd = await cueData();
check('Mehr-Cue-Preset eingefügt, Fade zielt auf neue Audio-Kopie',
  cd.length === 6 && cd[4].type === 'audio' && cd[5].type === 'fade' && cd[5].target === cd[4].id && cd[4].id !== cd[0].id, JSON.stringify(cd.map((c) => c.type)));

await page.click('.cue-row >> nth=0');
await page.click('.cue-row >> nth=1', { modifiers: ['Shift'] });
await page.click('#sel-clone');
await page.waitForTimeout(300);
cd = await cueData();
check('Auswahl klonen: Block dahinter, Verweis auf Kopie', cd.length === 8 && cd[3].target === cd[2].id && cd[2].name.includes('(Kopie)') === false, JSON.stringify(cd.map((c) => c.type)));
page.once('dialog', (d) => d.accept());
await page.click('#sel-delete');
await page.waitForTimeout(300);
check('Auswahl löschen', (await cueData()).length === 6);

// Auswahl-Modus über den Knopf ☑ (für Touch-Geräte)
await page.click('#btn-select');
check('Auswahl-Modus: Leiste sichtbar, Zeilen nicht ziehbar', !(await page.$eval('#sel-bar', (e) => e.hidden)) && !(await page.$eval('.cue-row', (r) => r.draggable)));
await page.click('.cue-row >> nth=0');
await page.click('.cue-row >> nth=2');
check('Auswahl-Modus: Antippen wählt aus', (await page.textContent('#sel-count')).startsWith('2'));
await page.click('#sel-clear');
check('Auswahl-Modus: Fertig beendet', (await page.$eval('#sel-bar', (e) => e.hidden)) && (await page.$eval('.cue-row', (r) => r.draggable)));

// Memo-Zeilen gleich breit wie andere Zeilen (auch auf dem Handy)
for (const w of [1280, 390]) {
  await page.setViewportSize({ width: w, height: 800 });
  await page.waitForTimeout(200);
  const widths = await page.$$eval('.cue-row', (rows) => rows.map((r) => Math.round(r.getBoundingClientRect().width)));
  const acts = await page.$$eval('.cue-row .c-act', (cells) => cells.map((c) => Math.round(c.getBoundingClientRect().right)));
  check(`Memo-Zeile gleich breit (${w}px)`, new Set(widths).size === 1 && new Set(acts).size === 1, JSON.stringify({ widths, acts }));
}
await page.setViewportSize({ width: 1280, height: 800 });

// Lizenz und Quelltext-Link in den Einstellungen
await page.click('#btn-settings');
await page.waitForSelector('#dlg-settings[open] #link-source');
const links = await page.$$eval('#link-license, #link-source', (as) => as.map((a) => a.href));
check('Einstellungen: Lizenz- und Quelltext-Link', links.length === 2 && links.every((u) => u.startsWith('https://github.com/')) && links[0].endsWith('/LICENSE'), JSON.stringify(links));
await page.click('#dlg-settings button[value=close]');

// Hilfe: Benutzerhandbuch im Dialog
await page.click('#btn-help');
await page.waitForSelector('#dlg-help[open] #help-body h2');
const help = await page.$eval('#help-body', (b) => ({ h2: b.querySelectorAll('h2').length, tables: b.querySelectorAll('table').length, pre: b.querySelectorAll('pre').length,
  broken: [...b.querySelectorAll('a[data-anchor]')].filter((a) => !document.getElementById('hilfe-' + a.dataset.anchor)).map((a) => a.dataset.anchor) }));
check('Hilfe: Handbuch gerendert, alle Sprungmarken gültig', help.h2 >= 13 && help.tables >= 5 && help.pre >= 1 && help.broken.length === 0, JSON.stringify(help));
await page.click('#help-body a[data-anchor="11-tastenkürzel"]');
await page.waitForTimeout(200);
const jump = await page.evaluate(() => { const b = document.getElementById('help-body'); return Math.abs(document.getElementById('hilfe-11-tastenkürzel').getBoundingClientRect().top - b.getBoundingClientRect().top); });
check('Hilfe: Link im Inhalt springt zum Abschnitt', jump < 40, String(jump));
await page.keyboard.press('Escape');
check('Hilfe: Esc schließt nur die Hilfe', !(await page.$eval('#dlg-help', (d) => d.open)));
await page.keyboard.press('F1');
check('Hilfe: F1 öffnet', await page.$eval('#dlg-help', (d) => d.open));
await page.click('#dlg-help button[value=close]');
const docXss = await page.evaluate(async () => (await import('./js/md.js')).renderDocument('[x](javascript:alert(1)) <img src=x onerror=alert(1)>\n| a |\n|---|\n| <b>b</b> |'));
check('Hilfe-Renderer escaped HTML und blockiert javascript:-Links', !/<img|<b>|href="javascript/.test(docXss), docXss);

// Impressum-Link nur, wenn site.json des Betreibers einen enthält (im Repo leer → kein Link)
await page.click('#btn-settings');
await page.waitForSelector('#dlg-settings #link-source');
check('Einstellungen: ohne site.json-Angaben kein Impressum-Link', !(await page.$('#link-legal')));
await page.keyboard.press('Escape');
const ctx2 = await browser.newContext({ serviceWorkers: 'block' });
const page2 = await ctx2.newPage();
page2.on('pageerror', (e) => errors.push(e.message));
await page2.route('**/site.json', (r) => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ legal: { url: 'https://example.org/impressum.html' } }) }));
await page2.goto(URL);
await page2.waitForTimeout(500);
await page2.click('#btn-settings');
await page2.waitForSelector('#dlg-settings #link-source');
const legal = await page2.$eval('#link-legal', (a) => [a.href, a.textContent]).catch(() => null);
check('Einstellungen: Impressum-Link aus site.json', legal?.[0] === 'https://example.org/impressum.html' && legal[1] === 'Impressum & Datenschutz', JSON.stringify(legal));
await ctx2.close();

check('Keine Konsolenfehler', errors.length === 0, errors.join(' | '));
await browser.close();
process.exit(failed ? 1 : 0);
