// Werkzeug tools/cueshow.mjs: Show lesen (Datei/Ordner), entpacken, packen, sicher schreiben.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { buildShowFile, readShowFile, mediaBlob } from '../../js/showfile.js';
import { openShow, writeFolder, writeShowFile, freePath, ToolError } from '../../tools/cueshow/io.mjs';

let tmp;
before(async () => { tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'cueshow-io-')); });
after(async () => { await fs.rm(tmp, { recursive: true, force: true }); });

const dir = async (name) => { const d = path.join(tmp, name); await fs.mkdir(d, { recursive: true }); return d; };
const hash = async (f) => createHash('sha256').update(await fs.readFile(f)).digest('hex');
const blobOf = (arr, type) => new Blob([new Uint8Array(arr)], { type });

const SESSION = {
  version: 1, id: 's1', name: 'Märchen ♪', updated: 5, settings: { layout: 'list' },
  cues: [
    { id: 'c1', type: 'audio', name: 'Ouvertüre', mediaId: 'm1', volume: -3.5 },
    { id: 'c2', type: 'audio', name: 'Donner', mediaId: 'm2' },
    { id: 'c3', type: 'audio', name: 'Ouvertüre 2', mediaId: 'm1' },
    { id: 'c4', type: 'memo', name: 'Pause', notes: 'Zeile 1\nZeile 2' },
  ],
};
const MEDIA = () => [
  { id: 'm1', name: 'Ouvertüre.mp3', type: 'audio/mpeg', blob: blobOf([1, 2, 3, 4, 5], 'audio/mpeg') },
  { id: 'm2', name: 'Donner.wav', type: 'audio/wav', blob: blobOf([9, 9], 'audio/wav') },
];

async function writeCueshow(file, session = SESSION, media = MEDIA()) {
  await fs.writeFile(file, Buffer.from(await buildShowFile(session, media).arrayBuffer()));
  return file;
}

/** Alle Dateien unterhalb von d, relativ. */
async function listAll(d) {
  const out = [];
  for (const e of await fs.readdir(d, { withFileTypes: true, recursive: true })) {
    if (e.isFile()) out.push(path.relative(d, path.join(e.parentPath ?? e.path, e.name)));
  }
  return out.sort();
}

async function rejectsTool(p, code, pattern) {
  await assert.rejects(p, (e) => {
    assert.ok(e instanceof ToolError, `ToolError erwartet, war: ${e?.stack ?? e}`);
    assert.equal(e.code, code);
    if (pattern) assert.match(e.message, pattern);
    return true;
  });
}

describe('Entpacken', () => {
  it('legt show.json und die Medien als Einzeldateien an', async () => {
    const d = await dir('entpacken');
    const src = await writeCueshow(path.join(d, 'show.cueshow'));
    const before = await hash(src);
    const show = await openShow(src);
    assert.equal(show.kind, 'file');
    const out = path.join(d, 'show');
    const r = await writeFolder(show, out);
    assert.equal(r.media, 2);
    assert.deepEqual(await listAll(out), ['media/Donner.wav', 'media/Ouvertüre.mp3', 'show.json']);
    const json = JSON.parse(await fs.readFile(path.join(out, 'show.json'), 'utf8'));
    assert.deepEqual(json.session, SESSION);
    assert.deepEqual(json.media, [
      { id: 'm1', name: 'Ouvertüre.mp3', type: 'audio/mpeg', file: 'media/Ouvertüre.mp3' },
      { id: 'm2', name: 'Donner.wav', type: 'audio/wav', file: 'media/Donner.wav' },
    ]);
    assert.match(await fs.readFile(path.join(out, 'show.json'), 'utf8'), /^\{\n {2}"format": 1,/);
    assert.deepEqual([...await fs.readFile(path.join(out, 'media/Ouvertüre.mp3'))], [1, 2, 3, 4, 5]);
    assert.deepEqual([...await fs.readFile(path.join(out, 'media/Donner.wav'))], [9, 9]);
    assert.equal(await hash(src), before, 'Quelle unverändert');
  });

  it('legt bei präparierten Namen nichts außerhalb von media/ an', async () => {
    const d = await dir('boese-namen');
    const evil = ['../../ausbruch.mp3', '/tmp/absolut.mp3', '..\\..\\win.wav', 'CON.mp3', '', '.', 'x.mp3', 'X.MP3'];
    const media = evil.map((name, i) => ({ id: 'm' + i, name, type: 'audio/mpeg', blob: blobOf([i], 'audio/mpeg') }));
    const session = { ...SESSION, cues: media.map((m, i) => ({ id: 'c' + i, type: 'audio', mediaId: m.id })) };
    const src = await writeCueshow(path.join(d, 'boese.cueshow'), session, media);
    const out = path.join(d, 'boese');
    await writeFolder(await openShow(src), out);
    const files = await listAll(out);
    assert.equal(files.length, evil.length + 1);
    for (const f of files) assert.ok(f === 'show.json' || /^media\/[^/\\]+$/.test(f), f);
    assert.deepEqual((await fs.readdir(d)).sort(), ['boese', 'boese.cueshow'], 'nichts neben dem Zielordner');
    assert.ok(files.includes('media/_CON.mp3'));
    assert.ok(files.includes('media/X-2.MP3'));
  });

  it('überschreibt ohne force nicht, mit force schon', async () => {
    const d = await dir('force');
    const src = await writeCueshow(path.join(d, 'show.cueshow'));
    const out = path.join(d, 'ziel');
    await fs.mkdir(out);
    await fs.writeFile(path.join(out, 'alt.txt'), 'alt');
    await rejectsTool(writeFolder(await openShow(src), out), 2, /existiert/);
    assert.deepEqual(await fs.readdir(out), ['alt.txt']);
    await writeFolder(await openShow(src), out, { force: true });
    assert.deepEqual((await fs.readdir(out)).sort(), ['media', 'show.json']);
  });

  it('lässt bei kaputter Datei nichts zurück', async () => {
    const d = await dir('kaputt');
    const src = path.join(d, 'kaputt.cueshow');
    await fs.writeFile(src, 'CUESHOW1\xff\xff\xff\xffquatsch');
    await rejectsTool(openShow(src), 1, /Keine gültige \.cueshow-Datei/);
    assert.deepEqual(await fs.readdir(d), ['kaputt.cueshow']);
  });

  it('meldet fehlende Quelle als Aufruffehler', async () => {
    await rejectsTool(openShow(path.join(tmp, 'gibt-es-nicht.cueshow')), 2, /nicht gefunden/);
  });
});

describe('Packen', () => {
  it('Rundreise ergibt eine byte-gleiche Datei', async () => {
    const d = await dir('rundreise');
    const src = await writeCueshow(path.join(d, 'show.cueshow'));
    await writeFolder(await openShow(src), path.join(d, 'show'));
    const back = path.join(d, 'zurueck.cueshow');
    const r = await writeShowFile(await openShow(path.join(d, 'show')), back);
    assert.deepEqual(r.warnings, []);
    assert.equal(await hash(back), await hash(src));
  });

  it('Rundreise auch ohne Medien und mit leerem Medium', async () => {
    const d = await dir('rundreise-leer');
    for (const [name, session, media] of [
      ['ohne', { ...SESSION, cues: [] }, []],
      ['leer', { ...SESSION, cues: [{ id: 'c', type: 'audio', mediaId: 'm' }] },
        [{ id: 'm', name: 'leer.wav', type: 'audio/wav', blob: new Blob([]) }]],
    ]) {
      const src = await writeCueshow(path.join(d, name + '.cueshow'), session, media);
      await writeFolder(await openShow(src), path.join(d, name));
      const back = path.join(d, name + '-zurueck.cueshow');
      await writeShowFile(await openShow(path.join(d, name)), back);
      assert.equal(await hash(back), await hash(src), name);
    }
  });

  it('übernimmt eine ausgetauschte Audiodatei mit neuer Länge', async () => {
    const d = await dir('austausch');
    const src = await writeCueshow(path.join(d, 'show.cueshow'));
    const folder = path.join(d, 'show');
    await writeFolder(await openShow(src), folder);
    await fs.writeFile(path.join(folder, 'media/Donner.wav'), Buffer.from([4, 4, 4, 4, 4, 4, 4]));
    const out = path.join(d, 'neu.cueshow');
    await writeShowFile(await openShow(folder), out);
    const blob = new Blob([await fs.readFile(out)]);
    const { header, base } = await readShowFile(blob);
    const m2 = header.media.find((m) => m.id === 'm2');
    assert.equal(m2.length, 7);
    assert.deepEqual([...new Uint8Array(await mediaBlob(blob, base, m2).arrayBuffer())], [4, 4, 4, 4, 4, 4, 4]);
  });

  it('lässt nicht genannte Medien mit Warnung weg', async () => {
    const d = await dir('ungenutzt');
    const media = [...MEDIA(), { id: 'm3', name: 'Probe.wav', type: 'audio/wav', blob: blobOf([3], 'audio/wav') }];
    const src = await writeCueshow(path.join(d, 'show.cueshow'), SESSION, media);
    await writeFolder(await openShow(src), path.join(d, 'show'));
    const out = path.join(d, 'neu.cueshow');
    const r = await writeShowFile(await openShow(path.join(d, 'show')), out);
    assert.equal(r.warnings.length, 1);
    assert.match(r.warnings[0], /Probe\.wav/);
    const { header } = await readShowFile(new Blob([await fs.readFile(out)]));
    assert.deepEqual(header.media.map((m) => m.id), ['m1', 'm2']);
  });

  it('leitet einen fehlenden Typ aus der Endung ab und ergänzt einen fehlenden Namen', async () => {
    const d = await dir('typ');
    const folder = path.join(d, 'show');
    await fs.mkdir(path.join(folder, 'media'), { recursive: true });
    await fs.writeFile(path.join(folder, 'media/a.ogg'), Buffer.from([1]));
    await fs.writeFile(path.join(folder, 'show.json'), JSON.stringify({
      format: 1,
      session: { ...SESSION, cues: [{ id: 'c', type: 'audio', mediaId: 'm' }] },
      media: [{ id: 'm', file: 'media/a.ogg' }],
    }));
    const show = await openShow(folder);
    assert.equal(show.kind, 'folder');
    assert.equal(show.header.media[0].type, 'audio/ogg');
    assert.equal(show.header.media[0].name, 'a.ogg');
    assert.equal(show.warnings.length, 2);
  });

  async function folderWith(name, media, extra = async () => {}) {
    const folder = await dir(name);
    await fs.mkdir(path.join(folder, 'media'), { recursive: true });
    await fs.writeFile(path.join(folder, 'media/ok.wav'), Buffer.from([1]));
    await extra(folder);
    await fs.writeFile(path.join(folder, 'show.json'), JSON.stringify({
      format: 1, session: { ...SESSION, cues: [{ id: 'c', type: 'audio', mediaId: 'm' }] }, media,
    }));
    return folder;
  }

  it('liest keine Datei außerhalb des Show-Ordners', async () => {
    const outside = path.join(tmp, 'geheim.txt');
    await fs.writeFile(outside, 'geheim');
    const m = (file) => [{ id: 'm', name: 'x', type: 'audio/wav', file }];
    for (const [name, file, extra] of [
      ['p-dotdot', '../geheim.txt'],
      ['p-dotdot-mitte', 'media/../../geheim.txt'],
      ['p-absolut', outside],
      ['p-backslash', '..\\geheim.txt'],
      ['p-laufwerk', 'C:\\geheim.txt'],
      ['p-symlink', 'media/link.wav', (f) => fs.symlink(outside, path.join(f, 'media/link.wav'))],
      ['p-symlink-ordner', 'aussen/geheim.txt', (f) => fs.symlink(tmp, path.join(f, 'aussen'))],
    ]) {
      const folder = await folderWith(name, m(file), extra);
      await rejectsTool(openShow(folder), 1, /außerhalb|ungültiger Pfad/i);
    }
  });

  it('lehnt fehlende Dateien, Ordner und falsche Angaben ab', async () => {
    const cases = [
      ['f-fehlt', [{ id: 'm', name: 'x', type: 'audio/wav', file: 'media/fehlt.wav' }], /nicht gefunden/],
      ['f-ordner', [{ id: 'm', name: 'x', type: 'audio/wav', file: 'media' }], /keine Datei/],
      ['f-kein-string', [{ id: 'm', name: 'x', type: 'audio/wav', file: 5 }], /file/],
      ['f-leer', [{ id: 'm', name: 'x', type: 'audio/wav', file: '' }], /file/],
      ['f-id', [{ id: 3, file: 'media/ok.wav' }], /id/],
      ['f-doppelt', [{ id: 'm', file: 'media/ok.wav' }, { id: 'm', file: 'media/ok.wav' }], /doppelt/],
      ['f-kein-array', {}, /media/],
    ];
    for (const [name, media, re] of cases) await rejectsTool(openShow(await folderWith(name, media)), 1, re);
  });

  it('lehnt kaputtes oder fremdes show.json ab', async () => {
    const d = await dir('json');
    await fs.writeFile(path.join(d, 'show.json'), '{"format":1,');
    await rejectsTool(openShow(d), 1, /show\.json/);
    await fs.writeFile(path.join(d, 'show.json'), JSON.stringify({ format: 2, session: SESSION, media: [] }));
    await rejectsTool(openShow(d), 1, /Format/);
    await fs.writeFile(path.join(d, 'show.json'), JSON.stringify({ format: 1, session: { cues: 'x' }, media: [] }));
    await rejectsTool(openShow(d), 1, /session/);
    const leer = await dir('ohne-json');
    await rejectsTool(openShow(leer), 2, /show\.json/);
  });

  it('überschreibt ohne force nicht und hinterlässt keine Zwischendatei', async () => {
    const d = await dir('pack-force');
    const src = await writeCueshow(path.join(d, 'show.cueshow'));
    await writeFolder(await openShow(src), path.join(d, 'show'));
    const out = path.join(d, 'ziel.cueshow');
    await fs.writeFile(out, 'alt');
    await rejectsTool(writeShowFile(await openShow(path.join(d, 'show')), out), 2, /existiert/);
    assert.equal(await fs.readFile(out, 'utf8'), 'alt');
    await writeShowFile(await openShow(path.join(d, 'show')), out, { force: true });
    assert.equal(await hash(out), await hash(src));
    assert.deepEqual((await fs.readdir(d)).filter((f) => f.includes('.tmp-')), []);
  });

  it('räumt die Zwischendatei auf, wenn eine Quelle beim Schreiben fehlt', async () => {
    const d = await dir('abbruch');
    const src = await writeCueshow(path.join(d, 'show.cueshow'));
    const folder = path.join(d, 'show');
    await writeFolder(await openShow(src), folder);
    const show = await openShow(folder);
    await fs.rm(path.join(folder, 'media/Donner.wav'));
    const out = path.join(d, 'neu.cueshow');
    await assert.rejects(writeShowFile(show, out));
    assert.deepEqual((await fs.readdir(d)).sort(), ['show', 'show.cueshow']);
  });
});

describe('freePath', () => {
  it('nummeriert, wenn der Name schon vergeben ist', async () => {
    const d = await dir('frei');
    assert.equal(await freePath(path.join(d, 'show'), ''), path.join(d, 'show'));
    await fs.mkdir(path.join(d, 'show'));
    assert.equal(await freePath(path.join(d, 'show'), ''), path.join(d, 'show-2'));
    await fs.writeFile(path.join(d, 'show-neu.cueshow'), '');
    await fs.writeFile(path.join(d, 'show-neu-2.cueshow'), '');
    assert.equal(await freePath(path.join(d, 'show-neu'), '.cueshow'), path.join(d, 'show-neu-3.cueshow'));
  });
});
