// Browsertest: Bilder im Benutzerhandbuch (Hilfe-Dialog), auch offline über den Service Worker.
// Start:  npx http-server -p 8080 -c-1 &   dann:  node tests/hilfe.mjs
import { chromium } from 'playwright';
import { readdirSync, readFileSync } from 'node:fs';

const URL = process.env.APP_URL || 'http://localhost:8080/';
let failed = 0;
const check = (name, ok, info = '') => { console.log(`${ok ? 'OK  ' : 'FAIL'} ${name} ${info}`); if (!ok) failed++; };

// ---------------------------------------------------------------- Dateien: Handbuch, Bildordner, Service Worker
const handbuch = readFileSync('docs/BENUTZERHANDBUCH.md', 'utf8');
const referenziert = [...handbuch.matchAll(/!\[[^\]]*\]\(([^)]+)\)/g)].map((m) => m[1]);
const dateien = readdirSync('docs/img').map((f) => `img/${f}`);
const sw = readFileSync('sw.js', 'utf8');
check('Handbuch: kein ASCII-Codeblock mehr', !/^```/m.test(handbuch));
check('Handbuch: Bilder vorhanden', referenziert.length >= 5, String(referenziert.length));
check('Handbuch: jedes Bild existiert', referenziert.every((r) => dateien.includes(r)), JSON.stringify(referenziert.filter((r) => !dateien.includes(r))));
check('docs/img: keine unbenutzten Dateien', dateien.every((d) => referenziert.includes(d)), JSON.stringify(dateien.filter((d) => !referenziert.includes(d))));
check('sw.js: alle Bilder im Offline-Cache', dateien.every((d) => sw.includes(`'docs/${d}'`)), JSON.stringify(dateien.filter((d) => !sw.includes(`'docs/${d}'`))));
const groesse = dateien.reduce((s, d) => s + readFileSync(`docs/${d}`).length, 0);
check('docs/img: zusammen höchstens 600 KB', groesse <= 600 * 1024, `${Math.round(groesse / 1024)} KB`);

// ---------------------------------------------------------------- Browser
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const fakeRelease = (r) => r.fulfill({ json: { tag_name: 'v0.0.1' }, headers: { 'access-control-allow-origin': '*' } });

async function bilder(page) {
  return page.$$eval('#help-body img', (imgs) => imgs.map((i) => ({ src: i.getAttribute('src'), alt: i.alt, ok: i.complete && i.naturalWidth > 0 })));
}
async function oeffnen(page) {
  await page.click('#btn-help');
  await page.waitForSelector('#dlg-help[open] #help-body h2');
}

// Online, mit Service Worker
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.route('https://api.github.com/**', fakeRelease);
await page.goto(URL);
await page.waitForSelector('#btn-go');
await oeffnen(page);
let imgs = await bilder(page);
check('Hilfe: alle Bilder geladen', imgs.length === referenziert.length && imgs.every((i) => i.ok), JSON.stringify(imgs.filter((i) => !i.ok)));
check('Hilfe: Bilder aus docs/img/ mit Alt-Text', imgs.every((i) => /^docs\/img\/[a-z0-9-]+\.(webp|svg|png)$/.test(i.src) && i.alt.length > 20), JSON.stringify(imgs));
// Sprung hinter alle Bilder: Kapitel 13 muss nach dem Laden der Bilder oben stehen
await page.click('#help-body a[data-anchor="13-fehlerbehebung"]');
await page.waitForTimeout(500);
const jump = await page.evaluate(() => Math.abs(document.getElementById('hilfe-13-fehlerbehebung').getBoundingClientRect().top - document.getElementById('help-body').getBoundingClientRect().top));
check('Hilfe: Sprung hinter die Bilder landet am Abschnitt', jump < 40, String(jump));
await page.click('#dlg-help button[value=close]');

// Offline: Service Worker hat Handbuch und Bilder im Cache
await page.evaluate(() => navigator.serviceWorker.ready);
await page.reload();
await page.waitForFunction(() => navigator.serviceWorker.controller);
await ctx.setOffline(true);
await page.reload();
await page.waitForSelector('#btn-go');
await oeffnen(page);
imgs = await bilder(page);
check('Offline: Hilfe zeigt alle Bilder', imgs.length === referenziert.length && imgs.every((i) => i.ok), JSON.stringify(imgs.filter((i) => !i.ok)));
await ctx.setOffline(false);
check('Keine Konsolenfehler', errors.length === 0, errors.join(' | '));
await ctx.close();

// Fehlendes Bild: Hilfe öffnet trotzdem, der Rest bleibt lesbar
const ctx2 = await browser.newContext({ viewport: { width: 1280, height: 800 }, serviceWorkers: 'block' });
const page2 = await ctx2.newPage();
await page2.route('https://api.github.com/**', fakeRelease);
await page2.route('**/docs/img/editor.webp', (r) => r.fulfill({ status: 404, body: '' }));
await page2.goto(URL);
await page2.waitForSelector('#btn-go');
await oeffnen(page2);
imgs = await bilder(page2);
const h2 = await page2.$$eval('#help-body h2', (x) => x.length);
check('Fehlendes Bild: Hilfe trotzdem vollständig', h2 >= 13 && imgs.filter((i) => !i.ok).map((i) => i.src).join() === 'docs/img/editor.webp', JSON.stringify({ h2, kaputt: imgs.filter((i) => !i.ok) }));
await ctx2.close();

// Handy: Bilder passen in die Breite, kein horizontales Scrollen
const ctx3 = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: 'block' });
const page3 = await ctx3.newPage();
await page3.route('https://api.github.com/**', fakeRelease);
await page3.goto(URL);
await page3.waitForSelector('#btn-go');
await page3.click('#btn-help');
await page3.waitForSelector('#dlg-help[open] #help-body h2');
const breit = await page3.$eval('#help-body', (b) => ({ scroll: b.scrollWidth - b.clientWidth,
  zuBreit: [...b.querySelectorAll('img')].filter((i) => i.getBoundingClientRect().right > b.getBoundingClientRect().right + 1).map((i) => i.getAttribute('src')) }));
check('Handy: Bilder passen in die Breite', breit.scroll <= 0 && breit.zuBreit.length === 0, JSON.stringify(breit));
await ctx3.close();

await browser.close();
process.exit(failed ? 1 : 0);
