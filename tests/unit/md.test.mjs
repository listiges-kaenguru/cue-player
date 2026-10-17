// Markdown-Renderer (md.js): Formatierung und vor allem Schutz vor eingeschleustem HTML/JS.
// Memo-Texte und Notizen kommen auch aus fremden .cueshow-Dateien und landen per innerHTML in der Oberfläche.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { renderMarkdown, renderDocument, firstLine, slugify } from '../../js/md.js';

/** Kein ausführbares Markup: keine fremden Tags, keine Event-Attribute, keine gefährlichen URLs */
function harmlos(html) {
  const tags = [...html.matchAll(/<\/?([a-z0-9]+)/gi)].map((m) => m[1].toLowerCase());
  const erlaubt = new Set(['p', 'br', 'strong', 'em', 'del', 'mark', 'h1', 'h2', 'h3', 'h4', 'h5', 'ul', 'ol', 'li',
    'blockquote', 'code', 'pre', 'a', 'hr', 'div', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'span']);
  for (const t of tags) assert.ok(erlaubt.has(t), `unerwartetes Tag <${t}> in ${html}`);
  // Attribute nur aus der festen Liste, Werte ohne ausbrechende Anführungszeichen
  for (const m of html.matchAll(/<[a-z0-9]+(\s[^>]*)?>/gi)) {
    const attrs = [...(m[1] ?? '').matchAll(/\s([a-z-]+)=/gi)].map((a) => a[1].toLowerCase());
    for (const a of attrs) assert.ok(['href', 'target', 'rel', 'class', 'id', 'data-anchor'].includes(a), `Attribut ${a} in ${m[0]}`);
  }
  assert.doesNotMatch(html, /href="(?!#|https?:\/\/)/i, 'nur #anker oder http(s) als Link');
}

const ANGRIFFE = [
  '<script>alert(1)</script>',
  '<img src=x onerror=alert(1)>',
  '<svg/onload=alert(1)>',
  '"><img src=x onerror=alert(1)>',
  "'><iframe src=javascript:alert(1)>",
  '**<b onmouseover=alert(1)>fett</b>**',
  '# <script>x</script>',
  '- <img src=x onerror=1>',
  '> <a href="javascript:alert(1)">zitat</a>',
  '! <style>body{display:none}</style>',
  '==<math><mi xlink:href="javascript:alert(1)">x</mi></math>==',
  '<!-- kommentar --><scr<script>ipt>',
  '&lt;script&gt; bleibt Text',
  '\u0000<script>\u0000',
];

describe('renderMarkdown: Formatierung', () => {
  it('erzeugt Überschriften, Absätze und Zeilenumbrüche', () => {
    assert.equal(renderMarkdown('# Titel'), '<h3>Titel</h3>');
    assert.equal(renderMarkdown('### Klein'), '<h5>Klein</h5>');
    assert.equal(renderMarkdown('#### kein Titel'), '<p>#### kein Titel</p>');
    assert.equal(renderMarkdown('a\nb\n\nc'), '<p>a<br>b</p><p>c</p>');
  });
  it('formatiert fett, kursiv, durchgestrichen und markiert', () => {
    assert.equal(renderMarkdown('**f** __g__ *k* _l_ ~~d~~ ==m=='),
      '<p><strong>f</strong> <strong>g</strong> <em>k</em> <em>l</em> <del>d</del> <mark>m</mark></p>');
  });
  it('lässt Unterstriche in Wörtern und einzelne Sternchen stehen', () => {
    assert.equal(renderMarkdown('datei_name_neu'), '<p>datei_name_neu</p>');
    assert.equal(renderMarkdown('3 * 4 = 12'), '<p>3 * 4 = 12</p>');
  });
  it('baut Listen, Zitate und Warnungen', () => {
    assert.equal(renderMarkdown('- a\n* b\n• c'), '<ul><li>a</li><li>b</li><li>c</li></ul>');
    assert.equal(renderMarkdown('1. a\n2) b'), '<ol><li>a</li><li>b</li></ol>');
    assert.equal(renderMarkdown('- a\n1. b'), '<ul><li>a</li></ul><ol><li>b</li></ol>');
    assert.equal(renderMarkdown('- a\ntext'), '<ul><li>a</li></ul><p>text</p>');
    assert.equal(renderMarkdown('> zitat'), '<blockquote>zitat</blockquote>');
    assert.equal(renderMarkdown('! Achtung'), '<p class="md-warn">Achtung</p>');
  });
  it('kommt mit leeren und fremden Eingaben zurecht', () => {
    for (const v of ['', null, undefined, '   \n\n  ']) assert.equal(renderMarkdown(v), '');
    assert.equal(renderMarkdown(42), '<p>42</p>');
    assert.equal(renderMarkdown('a\r\nb\rc'), '<p>a<br>b<br>c</p>');
  });
  it('lässt Unicode unverändert', () => {
    assert.equal(renderMarkdown('Grüße 🎭 שלום'), '<p>Grüße 🎭 שלום</p>');
  });
});

describe('renderMarkdown: kein eingeschleustes HTML', () => {
  for (const a of ANGRIFFE) {
    it(`maskiert ${JSON.stringify(a)}`, () => {
      const html = renderMarkdown(a);
      harmlos(html);
      assert.doesNotMatch(html, /<(script|img|svg|iframe|style|math|b |a )/i);
    });
  }
  it('maskiert alle fünf HTML-Sonderzeichen', () => {
    assert.equal(renderMarkdown(`& < > " '`), '<p>&amp; &lt; &gt; &quot; &#39;</p>');
  });
  it('bleibt bei sehr langen Eingaben schnell (kein katastrophales Backtracking)', () => {
    const start = performance.now();
    renderMarkdown('*'.repeat(50_000) + '\n' + '_a'.repeat(20_000) + '\n' + '='.repeat(50_000));
    assert.ok(performance.now() - start < 2000);
  });
});

describe('renderDocument (Benutzerhandbuch)', () => {
  it('erzeugt Anker wie GitHub, auch bei doppelten Überschriften', () => {
    assert.equal(renderDocument('## Erste Schritte\n## Erste Schritte'),
      '<h2 id="doc-erste-schritte">Erste Schritte</h2><h2 id="doc-erste-schritte-1">Erste Schritte</h2>');
    assert.match(renderDocument('# A', { prefix: 'hilfe-' }), /id="hilfe-a"/);
  });
  it('baut Tabellen, Code, Linien und Checklisten', () => {
    assert.equal(renderDocument('| a | b |\n|---|---|\n| 1 | `x*y*` |'),
      '<div class="doc-table"><table><thead><tr><th>a</th><th>b</th></tr></thead><tbody><tr><td>1</td><td><code>x*y*</code></td></tr></tbody></table></div>');
    assert.equal(renderDocument('```\n<b>\n```'), '<pre><code>&lt;b&gt;</code></pre>');
    assert.equal(renderDocument('---'), '<hr>');
    assert.equal(renderDocument('- [ ] offen\n- [x] fertig'), '<ul><li class="task">☐ offen</li><li class="task">☑ fertig</li></ul>');
  });
  it('verschachtelt Listen und hängt eingerückten Text an', () => {
    assert.equal(renderDocument('- a\n  - b\n- c'), '<ul><li>a<ul><li>b</li></ul></li><li>c</li></ul>');
    assert.equal(renderDocument('- a\n\n  mehr\n- b'), '<ul><li>a<br> mehr</li><li>b</li></ul>');
    assert.equal(renderDocument('1. a\n- b'), '<ol><li>a</li></ol><ul><li>b</li></ul>');
  });
  it('erlaubt nur #anker und http(s) als Link', () => {
    assert.equal(renderDocument('[Hilfe](#start)'), '<p><a href="#start" data-anchor="start">Hilfe</a></p>');
    assert.equal(renderDocument('[Web](https://example.org/x)'), '<p><a href="https://example.org/x" target="_blank" rel="noopener">Web</a></p>');
    for (const href of ['javascript:alert(1)', 'JaVaScRiPt:alert(1)', 'data:text/html,<script>x</script>', 'vbscript:x', '//evil.example', 'ftp://x']) {
      const html = renderDocument(`[klick](${href})`);
      harmlos(html);
      assert.doesNotMatch(html, /<a /, href);
    }
  });
  it('lässt aus einem Link-Ziel keine Attribute ausbrechen', () => {
    const html = renderDocument('[x](https://a"onmouseover="alert(1))');
    harmlos(html);
    assert.doesNotMatch(html, /"onmouseover/);
  });
  for (const a of ANGRIFFE) {
    it(`maskiert ${JSON.stringify(a)}`, () => {
      harmlos(renderDocument(a));
      harmlos(renderDocument(`| ${a} | x |\n|---|---|\n| ${a} | y |`));
      harmlos(renderDocument(`- ${a}\n  ${a}`));
    });
  }
  it('kommt mit leeren Eingaben und offenem Codeblock zurecht', () => {
    assert.equal(renderDocument(''), '');
    assert.equal(renderDocument(null), '');
    assert.equal(renderDocument('```\noffen'), '<pre><code>offen</code></pre>');
  });
});

describe('firstLine und slugify', () => {
  it('liefert die erste Zeile ohne Markdown-Zeichen', () => {
    assert.equal(firstLine('\n\n# **Umbau** jetzt\nmehr'), 'Umbau jetzt');
    assert.equal(firstLine('! ==Achtung=='), 'Achtung');
    assert.equal(firstLine('1. erster'), 'erster');
    assert.equal(firstLine(''), '');
    assert.equal(firstLine(undefined), '');
  });
  it('bildet Anker aus Überschriften', () => {
    assert.equal(slugify('Cue-Typen & Fades (Übersicht)'), 'cue-typen--fades-übersicht');
    assert.equal(slugify('**Fett** `code`'), 'fett-code');
  });
});
