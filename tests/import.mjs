// Browsertest: Import präparierter .cueshow-Dateien und Angaben aus site.json (Playwright + Chromium).
// Start:  npx http-server -p 8080 -c-1 -s &   dann:  node tests/import.mjs   (pt test erledigt beides)
// Eine .cueshow kommt aus fremder Hand. Sie muss sauber abgelehnt werden (Meldung, nichts gespeichert, App läuft
// weiter) oder importiert werden, ohne dass eingeschleuster Code läuft oder die Seite fremde Server anfragt.
import { chromium } from 'playwright';

const URL = process.env.APP_URL || 'http://localhost:8080/';
let failed = 0;
const check = (name, ok, info = '') => { console.log(`${ok ? 'OK  ' : 'FAIL'} ${name} ${ok ? '' : info}`); if (!ok) failed++; };

/** .cueshow bauen: "CUESHOW1" | uint32 LE Header-Länge | Header | Mediendaten (Optionen zum Verfälschen) */
function cueshow(header, { magic = 'CUESHOW1', hlen, media = Buffer.alloc(0), raw } = {}) {
  const h = Buffer.from(raw ?? JSON.stringify(header), 'utf8');
  const len = Buffer.alloc(4);
  len.writeUInt32LE(hlen ?? h.length, 0);
  return Buffer.concat([Buffer.from(magic, 'latin1'), len, h, media]);
}
const XSS = (n) => `<img src=x onerror="window.__xss=(window.__xss||[]).concat(${n})"><script>window.__xss=[${n}]</script>`;
const cue = (extra) => ({ id: `c${Math.random().toString(36).slice(2)}`, type: 'memo', name: '', notes: '', ...extra });
const session = (extra = {}) => ({ version: 1, id: 'fremd', name: 'Fremde Show', updated: 1, settings: {}, cues: [cue({ name: 'eins' })], ...extra });
const einMedium = { media: [{ id: 'm1', name: 'ton.wav', type: 'audio/wav', offset: 0, length: 4 }] };
const vierBytes = Buffer.from('RIFF');

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
// Ohne Service Worker: sonst kommen site.json und App-Dateien aus dessen Cache, an page.route vorbei
const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, serviceWorkers: 'block' });
const meldungen = [];
const errors = [];
const fremd = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('dialog', (d) => { errors.push('Dialog: ' + d.message()); d.dismiss(); });
// Jede Anfrage außerhalb von localhost mitschreiben und abbrechen (kein Netz; GitHub-Versionsprüfung vorgespielt)
await page.route(/^https?:\/\/(?!localhost[:/])/, (r) => {
  if (r.request().url().startsWith('https://api.github.com/')) return r.fulfill({ json: { tag_name: 'v0.0.1' }, headers: { 'access-control-allow-origin': '*' } });
  fremd.push(r.request().url());
  return r.abort();
});
await page.goto(URL);
await page.waitForFunction(() => window.cuePlayer?.state?.session);

/** Anzahl Sessions und Mediendateien in der IndexedDB */
const bestand = () => page.evaluate(() => new Promise((res, rej) => {
  const r = indexedDB.open('cue-player');
  r.onerror = () => rej(r.error);
  r.onsuccess = () => {
    const t = r.result.transaction(['sessions', 'media']);
    const out = {};
    const s = t.objectStore('sessions').count(); s.onsuccess = () => { out.sessions = s.result; };
    const m = t.objectStore('media').count(); m.onsuccess = () => { out.media = m.result; };
    t.oncomplete = () => { r.result.close(); res(out); };
  };
}));
/** Datei über das echte Dateifeld importieren, auf die nächste Meldung warten */
async function importiere(name, buffer) {
  await page.evaluate(() => { window.__letzteMeldung = null; new MutationObserver((ms, o) => { const n = ms.flatMap((m) => [...m.addedNodes])[0]; if (n) { window.__letzteMeldung = n.textContent; o.disconnect(); } }).observe(document.querySelector('#toasts'), { childList: true }); });
  await page.setInputFiles('#file-import', { name, mimeType: 'application/octet-stream', buffer });
  await page.waitForFunction(() => window.__letzteMeldung !== null, null, { timeout: 5000 }).catch(() => {});
  const m = await page.evaluate(() => window.__letzteMeldung);
  meldungen.push(m ?? '');
  return m;
}
/** App bedienbar: Standby wählen, GO, Stop alle – ohne Fehler */
async function bedienbar() {
  await page.evaluate(() => document.querySelectorAll('dialog[open]').forEach((d) => d.close()));
  await page.click('#btn-go').catch((e) => errors.push('GO: ' + e.message));
  await page.waitForTimeout(150);
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  return page.evaluate(() => !!window.cuePlayer.state.session && !!document.querySelector('#list-view, .cart-btn'));
}

// --- Ablehnung: kaputte oder verfälschte Dateien ---------------------------------------------------
const ablehnen = [
  ['falsche Kennung', cueshow({ format: 1, session: session(), media: [] }, { magic: 'CUESHOW2' })],
  ['leere Datei', Buffer.alloc(0)],
  ['abgeschnitten (6 Bytes)', Buffer.from('CUESHO')],
  ['nur Kennung, keine Länge', Buffer.from('CUESHOW1')],
  ['Headerlänge 4 GB', cueshow({ format: 1, session: session(), media: [] }, { hlen: 0xffffffff })],
  ['Headerlänge zu kurz', cueshow({ format: 1, session: session(), media: [] }, { hlen: 10 })],
  ['kaputtes JSON', cueshow(null, { raw: '{"format":1,"session":' })],
  ['Header ist null', cueshow(null, { raw: 'null' })],
  ['Session fehlt', cueshow({ format: 1, ...einMedium }, { media: vierBytes })],
  ['Session ist Text', cueshow({ format: 1, session: 'Show', ...einMedium }, { media: vierBytes })],
  ['Cues kein Array', cueshow({ format: 1, session: session({ cues: 'viele' }), ...einMedium }, { media: vierBytes })],
  ['Cue ist null', cueshow({ format: 1, session: session({ cues: [null] }), ...einMedium }, { media: vierBytes })],
  ['Media kein Array', cueshow({ format: 1, session: session(), media: { m1: 1 } })],
  ['Medium außerhalb der Datei', cueshow({ format: 1, session: session(), media: [{ id: 'm1', name: 'x', type: 'audio/wav', offset: 1e9, length: 1e9 }] })],
  ['Medium mit negativer Länge', cueshow({ format: 1, session: session(), media: [{ id: 'm1', name: 'x', type: 'audio/wav', offset: 0, length: -5 }] }, { media: vierBytes })],
  ['Settings ist Text', cueshow({ format: 1, session: session({ settings: 'laut' }), ...einMedium }, { media: vierBytes })],
  ['fremdes Format', cueshow({ format: 99, session: session(), media: [] })],
];
for (const [name, buf] of ablehnen) {
  const vor = await bestand();
  const showVorher = await page.evaluate(() => window.cuePlayer.state.session.id);
  const meldung = await importiere(`${name}.cueshow`, buf);
  const nach = await bestand();
  check(`lehnt ab: ${name}`, /Import fehlgeschlagen/.test(meldung ?? ''), `Meldung: ${meldung}`);
  check(`  … nichts gespeichert: ${name}`, nach.sessions === vor.sessions && nach.media === vor.media, `${JSON.stringify(vor)} → ${JSON.stringify(nach)}`);
  check(`  … Show bleibt offen: ${name}`, (await page.evaluate(() => window.cuePlayer.state.session.id)) === showVorher);
}
check('keine Meldung mit Stacktrace oder internen Pfaden', !meldungen.some((t) => /at \w+ \(|https?:\/\/localhost|\.js:\d+/.test(t)), meldungen.join(' | '));
check('keine Fehler nach den Ablehnungen', errors.length === 0, errors.join(' | '));
errors.length = 0;

// --- Grenzfälle, die importiert werden dürfen, die App aber nicht stören -----------------------------
const grenzfaelle = [
  ['unbekannter Cue-Typ', session({ cues: [cue({ type: 'rakete', name: 'X' }), cue({ name: 'danach' })] })],
  ['falsche Typen in Cues', session({ cues: [cue({ type: 'audio', volume: 'laut', preWait: 'bald', duration: null, mediaId: 'fehlt' }), cue({ type: 'fade', target: { x: 1 }, duration: -5 })] })],
  // Schlüssel vorn ins JSON-Objekt setzen (JSON.parse legt __proto__ dann als eigene Eigenschaft an)
  ['__proto__ im Header', JSON.parse('{"__proto__":{"boese":1},"constructor":{"prototype":{"boese":2}},' + JSON.stringify(session()).slice(1))],
  ['Unicode und Steuerzeichen', session({ name: 'Ü🎭‮שלום\u0000', cues: [cue({ name: '\u0000￿😀', notes: '# 🎭\n‮text' })] })],
  ['keine Cues', session({ cues: [] })],
];
for (const [name, s] of grenzfaelle) {
  const vor = await bestand();
  const meldung = await importiere(`${name}.cueshow`, cueshow({ format: 1, session: s, media: [] }));
  const ok = await bedienbar();
  const nach = await bestand();
  const importiert = /importiert/.test(meldung ?? '');
  check(`Grenzfall ${name}: abgelehnt oder bedienbar`, (importiert && ok) || /Import fehlgeschlagen/.test(meldung ?? ''), `Meldung: ${meldung}`);
  check(`  … höchstens eine neue Show: ${name}`, nach.sessions - vor.sessions === (importiert ? 1 : 0) && nach.media === vor.media);
  check(`  … keine Fehler: ${name}`, errors.length === 0, errors.join(' | '));
  errors.length = 0;
}
check('keine Prototyp-Verschmutzung', await page.evaluate(() => ({}).boese === undefined));

// --- Eingeschleuster Code in einer gültigen Show ----------------------------------------------------
const boese = session({
  name: XSS(1),
  settings: { midi: { enabled: false, go: XSS(2) }, sinkId: XSS(3), layout: 'list' },
  cues: [
    cue({ name: XSS(4), notes: XSS(5) + '\n**' + XSS(6) + '**\n- [x](javascript:window.__xss=[7])', confirm: true }),
    cue({ type: 'audio', name: '', mediaName: XSS(8), mediaId: 'm1', hotkey: XSS(9), color: 'red;background:url(https://evil.example/c)' }),
    cue({ type: 'fade', name: '', target: '"><img src=x onerror=window.__xss=[10]>', notes: XSS(11), color: 'url(https://evil.example/m)' }),
    cue({ type: 'midi', name: '', msg: XSS(12), data1: XSS(13), midiTrigger: XSS(14) }),
    cue({ type: 'startstop', name: '', mode: XSS(15) }),
  ],
});
const meldung = await importiere('boese.cueshow', cueshow({ format: 1, session: boese, ...einMedium }, { media: vierBytes }));
check('gültige Show mit HTML in allen Textfeldern wird importiert', /importiert/.test(meldung ?? ''), `Meldung: ${meldung}`);
// Alle Ansichten durchgehen, die Texte der Show zeigen: Liste, Regiebuch, Cart, Editor, Show-Liste, Bestätigung
await page.waitForTimeout(200);
await page.click('#btn-layout'); await page.waitForTimeout(150); await page.click('#btn-layout');
for (let i = 0; i < 5; i++) {
  await page.evaluate((n) => document.querySelectorAll('.cue-row')[n]?.dispatchEvent(new MouseEvent('dblclick', { bubbles: true })), i);
  await page.waitForTimeout(100);
  await page.evaluate(() => document.querySelectorAll('dialog[open]').forEach((d) => d.close()));
}
await page.click('#btn-sessions'); await page.waitForTimeout(150);
await page.evaluate(() => document.querySelectorAll('dialog[open]').forEach((d) => d.close()));
await page.click('.cue-row >> nth=0'); await page.click('#btn-go'); await page.waitForTimeout(200);
await page.evaluate(() => document.querySelectorAll('dialog[open]').forEach((d) => d.close()));
await page.keyboard.press('Escape');
check('kein eingeschleuster Code ausgeführt', (await page.evaluate(() => window.__xss)) === undefined, JSON.stringify(await page.evaluate(() => window.__xss)));
check('keine eingeschleusten Elemente im DOM', await page.evaluate(() => !document.querySelector('img[src="x"], script:not([src]):not([type="module"]), [onerror]')));
check('keine Anfragen an fremde Server (z. B. über Farbwerte)', fremd.length === 0, fremd.join(' '));
check('keine Fehler beim Anzeigen', errors.length === 0, errors.join(' | '));
errors.length = 0;

// --- site.json: Impressum-Link nur mit http(s) -------------------------------------------------------
async function impressum(site) {
  await page.unroute('**/site.json').catch(() => {});
  await page.route('**/site.json', (r) => r.fulfill({ json: site }));
  const geladen = page.waitForResponse('**/site.json');
  await page.reload();
  await geladen;
  await page.waitForFunction(() => window.cuePlayer?.state?.session);
  await page.waitForTimeout(100);
  await page.click('#btn-settings');
  await page.waitForSelector('#dlg-settings[open]');
  const link = await page.$('#link-legal');
  const out = link ? { href: await link.getAttribute('href'), text: await link.textContent() } : null;
  await page.evaluate(() => document.querySelectorAll('dialog[open]').forEach((d) => d.close()));
  return out;
}
const echt = await impressum({ legal: { url: 'https://example.org/impressum', label: XSS(20) } });
check('site.json: http(s)-Link wird angezeigt, Beschriftung als Text', echt?.href === 'https://example.org/impressum' && echt.text === XSS(20), JSON.stringify(echt));
for (const url of ['javascript:window.__xss=[21]', ' javascript:alert(1)', 'JAVASCRIPT:alert(1)', 'data:text/html,<script>alert(1)</script>', '//evil.example', 42, null]) {
  check(`site.json: kein Link bei ${JSON.stringify(url)}`, (await impressum({ legal: { url } })) === null);
}
for (const site of [null, 'text', [], { legal: 'x' }, { legal: null }]) {
  check(`site.json: ${JSON.stringify(site)} ohne Link und ohne Fehler`, (await impressum(site)) === null && errors.length === 0, errors.join(' | '));
}
await page.unroute('**/site.json');
await page.route('**/site.json', (r) => r.fulfill({ status: 200, body: '{kaputt', contentType: 'application/json' }));
await page.reload(); await page.waitForTimeout(300); await page.click('#btn-settings');
await page.waitForSelector('#dlg-settings[open]', { timeout: 3000 }).catch(() => {});
check('site.json kaputt: Einstellungen öffnen trotzdem', !!(await page.$('#dlg-settings[open]')) && errors.length === 0, errors.join(' | '));
check('site.json: kein eingeschleuster Code', (await page.evaluate(() => window.__xss)) === undefined);

await browser.close();
console.log(failed ? `\n${failed} Prüfung(en) fehlgeschlagen` : '\nAlle Prüfungen bestanden');
process.exit(failed ? 1 : 0);
