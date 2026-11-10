// Werkzeug tools/cueshow.mjs: Kommandozeile (Befehle, Exit-Codes, Zielnamen, Ausgaben).
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { newSession, newCue } from '../../js/model.js';
import { buildShowFile } from '../../js/showfile.js';
import { openShow } from '../../tools/cueshow/io.mjs';

const TOOL = fileURLToPath(new URL('../../tools/cueshow.mjs', import.meta.url));
let tmp;
before(async () => { tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'cueshow-cli-')); });
after(async () => { await fs.rm(tmp, { recursive: true, force: true }); });

function cli(...args) {
  const r = spawnSync(process.execPath, [TOOL, ...args], { cwd: tmp, encoding: 'utf8' });
  return { code: r.status, out: r.stdout, err: r.stderr };
}
const hash = async (f) => createHash('sha256').update(await fs.readFile(f)).digest('hex');
const exists = (p) => fs.access(p).then(() => true, () => false);

function session(change = () => {}) {
  const s = newSession('Probe');
  s.cues = [
    newCue('audio', { id: 'a', name: 'Musik', mediaId: 'm1', mediaName: 'musik' }),
    newCue('memo', { id: 'b', name: 'Szene', notes: 'Licht aus' }),
  ];
  change(s);
  return s;
}
async function cueshow(name, change) {
  const file = path.join(tmp, name);
  const blob = buildShowFile(session(change), [{ id: 'm1', name: 'musik.mp3', type: 'audio/mpeg', blob: new Blob([new Uint8Array([1, 2, 3])]) }]);
  await fs.writeFile(file, Buffer.from(await blob.arrayBuffer()));
  return file;
}

describe('Aufruf', () => {
  it('zeigt ohne Befehl die Hilfe und endet mit 2', () => {
    const r = cli();
    assert.equal(r.code, 2);
    assert.match(r.out + r.err, /unpack.*\n[\s\S]*pack[\s\S]*info[\s\S]*check[\s\S]*texts[\s\S]*apply-texts/);
  });
  it('help endet mit 0, auch für einzelne Befehle', () => {
    assert.equal(cli('help').code, 0);
    const r = cli('help', 'pack');
    assert.equal(r.code, 0);
    assert.match(r.out, /pack/);
  });
  it('unbekannter Befehl, unbekannte Option, fehlende Argumente: 2', () => {
    assert.equal(cli('zaubern').code, 2);
    assert.equal(cli('info', 'x', '--gibtsnicht').code, 2);
    assert.equal(cli('info').code, 2);
    assert.equal(cli('apply-texts', 'nur-eins').code, 2);
    assert.match(cli('zaubern').err, /Unbekannter Befehl/);
  });
  it('fehlende Quelle: 2', async () => {
    const r = cli('info', 'fehlt.cueshow');
    assert.equal(r.code, 2);
    assert.match(r.err, /nicht gefunden/);
  });
  it('kaputte Datei: 1, ohne Stacktrace; mit --debug mit Stacktrace', async () => {
    await fs.writeFile(path.join(tmp, 'kaputt.cueshow'), 'kein cueshow');
    const r = cli('info', 'kaputt.cueshow');
    assert.equal(r.code, 1);
    assert.match(r.err, /Keine gültige \.cueshow-Datei/);
    assert.doesNotMatch(r.err, /\n\s+at /);
    assert.match(cli('info', 'kaputt.cueshow', '--debug').err, /\n\s+at /);
  });
});

describe('info und check', () => {
  it('info gibt Text und JSON aus', async () => {
    await cueshow('info.cueshow');
    const r = cli('info', 'info.cueshow');
    assert.equal(r.code, 0, r.err);
    assert.match(r.out, /^Show\s+Probe$/m);
    const j = JSON.parse(cli('info', 'info.cueshow', '--json').out);
    assert.equal(j.cues.total, 2);
  });
  it('check: 0 bei gültiger Show, 1 bei Fehlern, Warnungen nur mit --streng', async () => {
    await cueshow('gut.cueshow');
    await cueshow('fehler.cueshow', (s) => { s.cues[0].fadeIn = -2; });
    await cueshow('warnung.cueshow', (s) => { s.cues[0].prewait = 1; });
    assert.equal(cli('check', 'gut.cueshow').code, 0);
    const f = cli('check', 'fehler.cueshow');
    assert.equal(f.code, 1);
    assert.match(f.out, /Fehler\s+Cue 1 \(id a\) · fadeIn: /);
    assert.match(f.out, /1 Fehler, 0 Warnungen/);
    const w = cli('check', 'warnung.cueshow');
    assert.equal(w.code, 0);
    assert.match(w.out, /Warnung\s+Cue 1 \(id a\) · prewait/);
    assert.equal(cli('check', 'warnung.cueshow', '--streng').code, 1);
  });
});

describe('unpack und pack', () => {
  it('entpackt neben die Quelle, nummeriert, überschreibt nur mit --force', async () => {
    const src = await cueshow('Show.cueshow');
    const before = await hash(src);
    const r = cli('unpack', 'Show.cueshow');
    assert.equal(r.code, 0, r.err);
    assert.match(r.out, /Entpackt nach .*Show/);
    assert.ok(await exists(path.join(tmp, 'Show/show.json')));
    assert.equal(cli('unpack', 'Show.cueshow').code, 0);
    assert.ok(await exists(path.join(tmp, 'Show-2/show.json')));
    assert.equal(cli('unpack', 'Show.cueshow', '-o', 'Show').code, 2);
    assert.equal(cli('unpack', 'Show.cueshow', '-o', 'Show', '--force').code, 0);
    assert.equal(cli('unpack', 'Show').code, 2, 'Ordner kann nicht entpackt werden');
    assert.equal(await hash(src), before);
  });

  it('packt byte-gleich zurück und benennt das Ziel -neu', async () => {
    const src = await cueshow('Rund.cueshow');
    cli('unpack', 'Rund.cueshow');
    const r = cli('pack', 'Rund');
    assert.equal(r.code, 0, r.err);
    assert.match(r.out, /Gepackt: .*Rund-neu\.cueshow/);
    assert.equal(await hash(path.join(tmp, 'Rund-neu.cueshow')), await hash(src));
    assert.equal(cli('pack', 'Rund').code, 0);
    assert.ok(await exists(path.join(tmp, 'Rund-neu-2.cueshow')));
    assert.equal(cli('pack', 'Rund.cueshow').code, 2, 'Datei kann nicht gepackt werden');
  });

  it('packt nicht, wenn check Fehler findet', async () => {
    await cueshow('Kaputt.cueshow');
    cli('unpack', 'Kaputt.cueshow');
    const json = path.join(tmp, 'Kaputt/show.json');
    const h = JSON.parse(await fs.readFile(json, 'utf8'));
    h.session.cues[0].color = 'url(https://example.org/x)';
    await fs.writeFile(json, JSON.stringify(h));
    const r = cli('pack', 'Kaputt', '-o', 'out.cueshow');
    assert.equal(r.code, 1);
    assert.match(r.out + r.err, /color/);
    assert.match(r.err, /nicht gepackt/);
    assert.equal(await exists(path.join(tmp, 'out.cueshow')), false);
  });
});

describe('texts und apply-texts', () => {
  it('zieht Texte heraus, zeigt mit --probe Änderungen und schreibt eine neue Show', async () => {
    const src = await cueshow('Text.cueshow');
    const before = await hash(src);
    assert.equal(cli('texts', 'Text.cueshow').code, 0);
    const mdPath = path.join(tmp, 'Text-texte.md');
    const md = await fs.readFile(mdPath, 'utf8');
    await fs.writeFile(mdPath, md.replace('## Musik', '## Ouvertüre'));

    const p = cli('apply-texts', 'Text.cueshow', 'Text-texte.md', '--probe');
    assert.equal(p.code, 0, p.err);
    assert.match(p.out, /Cue 1\s+name: „Musik“ → „Ouvertüre“/);
    assert.match(p.out, /nichts geschrieben/);
    assert.equal(await exists(path.join(tmp, 'Text-neu.cueshow')), false);

    const a = cli('apply-texts', 'Text.cueshow', 'Text-texte.md');
    assert.equal(a.code, 0, a.err);
    const show = await openShow(path.join(tmp, 'Text-neu.cueshow'));
    assert.equal(show.header.session.cues[0].name, 'Ouvertüre');
    assert.equal(await hash(src), before);
    assert.equal(cli('texts', 'Text.cueshow', '-o', 'Text-texte.md').code, 2);
  });

  it('schreibt bei einem Ordner einen neuen Ordner', async () => {
    await cueshow('Ordner.cueshow');
    cli('unpack', 'Ordner.cueshow');
    cli('texts', 'Ordner', '-o', 'o.md');
    const md = await fs.readFile(path.join(tmp, 'o.md'), 'utf8');
    await fs.writeFile(path.join(tmp, 'o.md'), md.replace('Licht aus', 'Licht an'));
    const r = cli('apply-texts', 'Ordner', 'o.md');
    assert.equal(r.code, 0, r.err);
    const h = JSON.parse(await fs.readFile(path.join(tmp, 'Ordner-neu/show.json'), 'utf8'));
    assert.equal(h.session.cues[1].notes, 'Licht an');
    assert.ok(await exists(path.join(tmp, 'Ordner-neu/media/musik.mp3')));
  });

  it('bricht bei unbekannter Cue-ID ab und schreibt nichts', async () => {
    await cueshow('Fremd.cueshow');
    cli('texts', 'Fremd.cueshow');
    const mdPath = path.join(tmp, 'Fremd-texte.md');
    await fs.writeFile(mdPath, (await fs.readFile(mdPath, 'utf8')).replace('<!-- cue:b', '<!-- cue:zz'));
    const r = cli('apply-texts', 'Fremd.cueshow', 'Fremd-texte.md');
    assert.equal(r.code, 1);
    assert.match(r.err, /zz/);
    assert.equal(await exists(path.join(tmp, 'Fremd-neu.cueshow')), false);
  });
});
