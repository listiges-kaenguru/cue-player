// Werkzeug tools/cueshow.mjs: Namen und Notizen als Markdown herausziehen und zurückschreiben (texts, apply-texts).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { newSession, newCue } from '../../js/model.js';
import { textsToMarkdown, parseTexts, applyTexts } from '../../tools/cueshow/texts.mjs';
import { ToolError } from '../../tools/cueshow/io.mjs';

function session() {
  const s = newSession('Weihnachtsmärchen');
  s.id = 'show-1';
  s.cues = [
    newCue('audio', { id: 'a', name: 'Ouvertüre', notes: 'Einsatz, wenn das **Saallicht** aus ist.\nLautstärke prüfen.' }),
    newCue('memo', { id: 'b', name: 'Szene 1 – Wald', notes: '' }),
    newCue('fade', { id: 'c', name: '', notes: '## Überschrift in Notizen\n\n- Liste\n\nAbsatz 🎄' }),
  ];
  return s;
}

const throwsTool = (fn, re) => assert.throws(fn, (e) => e instanceof ToolError && e.code === 1 && re.test(e.message));

describe('textsToMarkdown', () => {
  it('schreibt Kopfzeile, Show-Namen und einen Abschnitt je Cue', () => {
    assert.equal(textsToMarkdown(session()), [
      '<!-- cueshow-texte format=1 show=show-1 -->',
      '# Weihnachtsmärchen',
      '',
      '<!-- cue:a nr=1 typ=audio -->',
      '## Ouvertüre',
      '',
      'Einsatz, wenn das **Saallicht** aus ist.',
      'Lautstärke prüfen.',
      '',
      '<!-- cue:b nr=2 typ=memo -->',
      '## Szene 1 – Wald',
      '',
      '<!-- cue:c nr=3 typ=fade -->',
      '##',
      '',
      '## Überschrift in Notizen',
      '',
      '- Liste',
      '',
      'Absatz 🎄',
      '',
    ].join('\n'));
  });

  it('verweigert Texte, die das Einlesen durcheinanderbrächten', () => {
    const s = session();
    s.cues[0].notes = 'a\n<!-- cue:x -->\nb';
    throwsTool(() => textsToMarkdown(s), /Cue 1.*notes/);
    const t = session();
    t.cues[1].name = 'zwei\nZeilen';
    throwsTool(() => textsToMarkdown(t), /Cue 2.*name/);
    const u = session();
    u.name = 'Show\nName';
    throwsTool(() => textsToMarkdown(u), /Show-Name/);
  });

  it('kommt mit einer Show ohne Cues und fehlenden Texten zurecht', () => {
    const s = newSession('');
    s.id = 'x';
    assert.equal(textsToMarkdown(s), '<!-- cueshow-texte format=1 show=x -->\n#\n');
    const t = session();
    delete t.cues[0].notes;
    t.cues[0].name = undefined;
    assert.match(textsToMarkdown(t), /<!-- cue:a nr=1 typ=audio -->\n##\n\n<!-- cue:b/);
  });
});

describe('Rundreise', () => {
  it('unveränderte Datei ergibt keine Änderung', () => {
    const s = session();
    const r = applyTexts(s, parseTexts(textsToMarkdown(s)));
    assert.deepEqual(r.changes, []);
    assert.deepEqual(r.session, s);
  });

  it('Notizen mit Leerzeilen am Rand gelten nicht als geändert', () => {
    const s = session();
    s.cues[1].notes = '\n\nText\n\n';
    const r = applyTexts(s, parseTexts(textsToMarkdown(s)));
    assert.deepEqual(r.changes, []);
    assert.equal(r.session.cues[1].notes, '\n\nText\n\n', 'Original bleibt erhalten');
  });

  it('übernimmt bearbeitete Namen und Notizen genau', () => {
    const s = session();
    const md = textsToMarkdown(s)
      .replace('# Weihnachtsmärchen', '# Weihnachtsmärchen 2026')
      .replace('## Ouvertüre', '## Ouvertüre (neu)')
      .replace('<!-- cue:c nr=3 typ=fade -->\n##\n', '<!-- cue:c nr=3 typ=fade -->\n## Wald aus\n')
      .replace('## Szene 1 – Wald\n', '## Szene 1 – Wald\n\nZeile 1\n\n\nZeile 2 mit ä ö ü ß\n');
    const r = applyTexts(s, parseTexts(md));
    assert.equal(r.session.name, 'Weihnachtsmärchen 2026');
    assert.equal(r.session.cues[0].name, 'Ouvertüre (neu)');
    assert.equal(r.session.cues[0].notes, s.cues[0].notes);
    assert.equal(r.session.cues[1].notes, 'Zeile 1\n\n\nZeile 2 mit ä ö ü ß');
    assert.equal(r.session.cues[2].name, 'Wald aus');
    assert.equal(r.session.cues[2].notes, s.cues[2].notes);
    assert.deepEqual(r.changes.map((c) => `${c.ort} ${c.feld}`), ['Show name', 'Cue 1 name', 'Cue 2 notes', 'Cue 3 name']);
    assert.equal(s.name, 'Weihnachtsmärchen', 'Original unverändert');
    assert.equal(s.cues[0].name, 'Ouvertüre');
  });

  it('versteht CRLF, BOM und überzählige Leerzeilen', () => {
    const s = session();
    const md = '﻿' + textsToMarkdown(s).replace('Lautstärke prüfen.', 'Lautstärke prüfen!').replace(/\n/g, '\r\n')
      .replace('<!-- cue:b', '\r\n\r\n<!-- cue:b');
    const r = applyTexts(s, parseTexts(md));
    assert.equal(r.session.cues[0].notes, 'Einsatz, wenn das **Saallicht** aus ist.\nLautstärke prüfen!');
    assert.deepEqual(r.changes.map((c) => c.ort), ['Cue 1']);
  });

  it('lässt Cues, die in der Datei fehlen, unverändert', () => {
    const s = session();
    const md = textsToMarkdown(s).split('<!-- cue:b')[0].replace('## Ouvertüre', '## Neu');
    const r = applyTexts(s, parseTexts(md));
    assert.equal(r.session.cues[0].name, 'Neu');
    assert.deepEqual(r.session.cues.slice(1), s.cues.slice(1));
  });

  it('lässt den Show-Namen unverändert, wenn die #-Zeile fehlt', () => {
    const s = session();
    const md = textsToMarkdown(s).replace('# Weihnachtsmärchen\n', '');
    assert.equal(applyTexts(s, parseTexts(md)).session.name, 'Weihnachtsmärchen');
  });
});

describe('Fehler beim Einlesen', () => {
  const md = () => textsToMarkdown(session());
  it('verlangt die Kopfzeile', () => {
    throwsTool(() => parseTexts(md().replace(/^.*\n/, '')), /Kopfzeile/);
    throwsTool(() => parseTexts(md().replace('format=1', 'format=2')), /Kopfzeile|Format/);
    throwsTool(() => parseTexts(''), /Kopfzeile/);
  });
  it('verlangt eine ##-Zeile je Abschnitt', () => {
    throwsTool(() => parseTexts(md().replace('## Ouvertüre\n', '')), /cue:a.*##/);
    throwsTool(() => parseTexts(md().replace('## Ouvertüre', '### Ouvertüre')), /cue:a.*##/);
  });
  it('lehnt doppelte und unbekannte IDs ab', () => {
    throwsTool(() => parseTexts(md().replace('<!-- cue:b ', '<!-- cue:a ')), /doppelt/);
    const s = session();
    throwsTool(() => applyTexts(s, parseTexts(md().replace('<!-- cue:b ', '<!-- cue:zz '))), /zz.*nicht/);
  });
  it('lehnt Texte einer anderen Show ab, außer mit force', () => {
    const s = session();
    const p = parseTexts(md().replace('show=show-1', 'show=andere'));
    throwsTool(() => applyTexts(s, p), /andere Show|--force/);
    const r = applyTexts(s, p, { force: true });
    assert.equal(r.warnings.length, 1);
  });
});
