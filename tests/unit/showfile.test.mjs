// Dateiformat .cueshow (showfile.js): Aufbau, Lesen, Prüfen. Gemeinsam für App (storage.js) und tools/cueshow.mjs.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as F from '../../js/showfile.js';

const enc = new TextEncoder();
const bytes = async (blob) => new Uint8Array(await blob.arrayBuffer());
const session = (cues = []) => ({ version: 1, id: 's1', name: 'Prüfung ♪', updated: 1, settings: {}, cues });

/** Baut eine Datei von Hand: Kennung | Länge | Header | Daten. */
function raw(header, data = new Uint8Array(0), { magic = F.MAGIC, hlen } = {}) {
  const h = typeof header === 'string' ? enc.encode(header) : enc.encode(JSON.stringify(header));
  const len = new Uint8Array(4);
  new DataView(len.buffer).setUint32(0, hlen ?? h.length, true);
  return new Blob([magic, len, h, data]);
}

async function rejects(blob) {
  await assert.rejects(F.readShowFile(blob), { message: F.INVALID });
}

describe('Datei schreiben', () => {
  it('legt Kennung, Header-Länge (LE), Header und Medien in dieser Reihenfolge ab', async () => {
    const a = new Blob([new Uint8Array([1, 2, 3])], { type: 'audio/wav' });
    const b = new Blob([new Uint8Array([9, 8])], { type: 'audio/mpeg' });
    const s = session([{ id: 'c1', type: 'audio', mediaId: 'm1' }, { id: 'c2', type: 'audio', mediaId: 'm2' }]);
    const file = F.buildShowFile(s, [
      { id: 'm1', name: 'a.wav', type: 'audio/wav', blob: a },
      { id: 'm2', name: 'b.mp3', type: 'audio/mpeg', blob: b },
    ]);
    const u = await bytes(file);
    assert.equal(new TextDecoder().decode(u.slice(0, 8)), 'CUESHOW1');
    const hlen = new DataView(u.buffer).getUint32(8, true);
    const json = new TextDecoder().decode(u.slice(12, 12 + hlen));
    assert.equal(json, JSON.stringify({
      format: 1,
      session: s,
      media: [
        { id: 'm1', name: 'a.wav', type: 'audio/wav', offset: 0, length: 3 },
        { id: 'm2', name: 'b.mp3', type: 'audio/mpeg', offset: 3, length: 2 },
      ],
    }), 'Schlüsselreihenfolge und kompakte Schreibweise wie bisher');
    assert.deepEqual([...u.slice(12 + hlen)], [1, 2, 3, 9, 8]);
    assert.equal(u.length, 12 + hlen + 5);
  });

  it('schreibt eine Show ohne Medien', async () => {
    const { header, base } = await F.readShowFile(F.buildShowFile(session(), []));
    assert.deepEqual(header.media, []);
    assert.equal(base, 12 + enc.encode(JSON.stringify(header)).length);
  });
});

describe('Datei lesen', () => {
  it('liest geschriebene Dateien zurück, auch mit Umlauten und leerem Medium', async () => {
    const m = [
      { id: 'm1', name: 'Ouvertüre.mp3', type: 'audio/mpeg', blob: new Blob([new Uint8Array([7, 7, 7, 7])]) },
      { id: 'm2', name: 'leer.wav', type: 'audio/wav', blob: new Blob([]) },
    ];
    const s = session([{ id: 'c1', type: 'audio', mediaId: 'm1' }]);
    const file = F.buildShowFile(s, m);
    const { header, base } = await F.readShowFile(file);
    assert.deepEqual(header.session, s);
    assert.equal(header.media[0].name, 'Ouvertüre.mp3');
    const first = F.mediaBlob(file, base, header.media[0]);
    assert.equal(first.type, 'audio/mpeg');
    assert.deepEqual([...await bytes(first)], [7, 7, 7, 7]);
    assert.equal(F.mediaBlob(file, base, header.media[1]).size, 0);
  });

  it('lehnt zu kurze Dateien und falsche Kennung ab', async () => {
    await rejects(new Blob([]));
    await rejects(new Blob(['CUESHOW1123']));
    await rejects(raw({ format: 1, session: session(), media: [] }, undefined, { magic: 'CUESHOW2' }));
    await rejects(raw({ format: 1, session: session(), media: [] }, undefined, { magic: 'cueshow1' }));
  });

  it('lehnt unsinnige Header-Längen und kaputtes JSON ab', async () => {
    const h = { format: 1, session: session(), media: [] };
    await rejects(raw(h, undefined, { hlen: 0 }));
    await rejects(raw(h, undefined, { hlen: 0xffffffff }));
    await rejects(raw(h, undefined, { hlen: JSON.stringify(h).length + 1 }));
    await rejects(raw('{"format":1,'));
    await rejects(raw('null'));
    await rejects(raw('[]'));
  });

  it('lehnt fremde Formatversionen und falschen Aufbau ab', async () => {
    await rejects(raw({ format: 2, session: session(), media: [] }));
    await rejects(raw({ format: '1', session: session(), media: [] }));
    await rejects(raw({ format: 1, media: [] }));
    await rejects(raw({ format: 1, session: { cues: {} }, media: [] }));
    await rejects(raw({ format: 1, session: { cues: [{ type: 1 }] }, media: [] }));
    await rejects(raw({ format: 1, session: { cues: [], settings: [] }, media: [] }));
    await rejects(raw({ format: 1, session: session() }));
  });

  it('lehnt Medien außerhalb der Datei und ungültige Lageangaben ab', async () => {
    const data = new Uint8Array(4);
    const h = (m) => ({ format: 1, session: session(), media: [{ id: 'm', name: 'x', type: 'audio/wav', ...m }] });
    await assert.doesNotReject(F.readShowFile(raw(h({ offset: 0, length: 4 }), data)));
    await rejects(raw(h({ offset: 1, length: 4 }), data));
    await rejects(raw(h({ offset: -1, length: 1 }), data));
    await rejects(raw(h({ offset: 0.5, length: 1 }), data));
    await rejects(raw(h({ offset: 0, length: '4' }), data));
    await rejects(raw(h({ offset: 0, length: 2 ** 53 }), data));
    await rejects(raw(h({ id: 7, offset: 0, length: 1 }), data));
  });
});

describe('validShow', () => {
  it('prüft gegen die Größe des Datenteils', () => {
    const h = { format: 1, session: session(), media: [{ id: 'm', offset: 2, length: 3 }] };
    assert.equal(F.validShow(h, 5), true);
    assert.equal(F.validShow(h, 4), false);
    assert.equal(F.validShow(null, 5), false);
  });
});
