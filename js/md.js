// Kleiner, sicherer Markdown-Renderer für Memo-Texte und Notizen.
// Erst wird ALLES HTML escaped, danach werden nur eigene Tags erzeugt. So kann eine geteilte Show kein HTML/JS einschleusen.
//
// Unterstützt:  # / ## / ### Überschrift · **fett** · *kursiv* · ~~durchgestrichen~~ · ==markiert==
//               - Liste · 1. Liste · > Zitat · ! Warnung · Leerzeile = neuer Absatz

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = (s) => s.replace(/[&<>"']/g, (c) => ESC[c]);
const toLines = (src) => String(src || '').replace(/\r\n?/g, '\n').split('\n');

function inline(s) {
  return s
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/__(.+?)__/g, '<strong>$1</strong>')
    .replace(/(^|[^*\w])\*(?!\s)(.+?)\*(?!\*)/g, '$1<em>$2</em>')
    .replace(/(^|[^_\w])_(?!\s)(.+?)_(?![_\w])/g, '$1<em>$2</em>')
    .replace(/~~(.+?)~~/g, '<del>$1</del>')
    .replace(/==(.+?)==/g, '<mark>$1</mark>');
}

export function renderMarkdown(src) {
  const lines = toLines(src);
  let html = '';
  let list = null;
  let para = [];
  const flushPara = () => {
    if (para.length) html += `<p>${para.map(inline).join('<br>')}</p>`;
    para = [];
  };
  const closeList = () => {
    if (list) html += `</${list}>`;
    list = null;
  };
  const block = () => { flushPara(); closeList(); };
  const item = (type, text) => {
    flushPara();
    if (list !== type) { closeList(); html += `<${type}>`; list = type; }
    html += `<li>${inline(text)}</li>`;
  };

  for (const raw of lines) {
    const line = esc(raw.trimEnd());
    let m;
    if (!line.trim()) { block(); continue; }
    if ((m = line.match(/^(#{1,3})\s+(.*)$/))) { block(); const l = m[1].length + 2; html += `<h${l}>${inline(m[2])}</h${l}>`; continue; }
    if ((m = line.match(/^\s*[-*•]\s+(.*)$/))) { item('ul', m[1]); continue; }
    if ((m = line.match(/^\s*\d+[.)]\s+(.*)$/))) { item('ol', m[1]); continue; }
    if ((m = line.match(/^!\s*(.+)$/))) { block(); html += `<p class="md-warn">${inline(m[1])}</p>`; continue; }
    if ((m = line.match(/^&gt;\s?(.*)$/))) { block(); html += `<blockquote>${inline(m[1])}</blockquote>`; continue; }
    closeList();
    para.push(line);
  }
  block();
  return html;
}

/** Erste Textzeile ohne Markdown-Zeichen (für Kurztitel). */
export function firstLine(src) {
  const l = String(src || '').split('\n').find((x) => x.trim()) || '';
  return l.replace(/^\s*(#{1,3}|[-*•]|\d+[.)]|!|>)\s*/, '').replace(/(\*\*|__|~~|==|\*|_)/g, '').trim();
}

// ---------------------------------------------------------------------------
// Dokument-Renderer für das eingebaute Benutzerhandbuch (größerer Markdown-Umfang).
// Zusätzlich: Tabellen, ``` Codeblöcke, `Code`, [Links](#anker), --- Linie, verschachtelte Listen, - [ ] Checklisten.
// Überschriften bekommen Anker wie auf GitHub (Präfix `prefix`), damit die Links im Inhaltsverzeichnis funktionieren.
// Auch hier wird alles HTML escaped; Links sind nur als #anker oder http(s) erlaubt.

/** Anker wie GitHub: klein, nur Buchstaben/Ziffern/Leer/-/_, Leerzeichen → '-'. */
export function slugify(text) {
  return text.toLowerCase().replace(/[*_~=`]/g, '').replace(/[^\p{L}\p{N}\s_-]/gu, '').replace(/\s/g, '-');
}

function docInline(s) {
  // s ist bereits escaped. Code und Links werden ausgelagert, damit *, _ usw. darin unverändert bleiben.
  const keep = [];
  const put = (html) => `\u0000${keep.push(html) - 1}\u0000`;
  s = s.replace(/`([^`]+)`/g, (_, code) => put(`<code>${code}</code>`));
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (all, text, href) => {
    if (href.startsWith('#')) return put(`<a href="${href}" data-anchor="${href.slice(1)}">${inline(text)}</a>`);
    if (/^https?:\/\//.test(href)) return put(`<a href="${href}" target="_blank" rel="noopener">${inline(text)}</a>`);
    return text;
  });
  return inline(s).replace(/\u0000(\d+)\u0000/g, (_, i) => keep[i]);
}

export function renderDocument(src, { prefix = 'doc-' } = {}) {
  const lines = toLines(src);
  const used = new Map();
  let html = '';
  let para = [];
  let blank = false;
  const lists = []; // offene Listen: { type, indent }
  const flushPara = () => {
    if (para.length) html += `<p>${para.map(docInline).join(' ')}</p>`;
    para = [];
  };
  const closeLists = (toIndent = -1) => {
    while (lists.at(-1)?.indent > toIndent) html += `</li></${lists.pop().type}>`;
  };
  const block = () => { flushPara(); closeLists(); };
  const isItem = (l) => /^\s*([-*]|\d+[.)])\s+/.test(l);
  const cells = (l) => l.trim().replace(/^\||\|$/g, '').split('|').map((c) => docInline(esc(c.trim())));

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i].trimEnd();
    const wasBlank = blank;
    blank = !raw.trim();
    let m;
    if (blank) {
      flushPara();
      // Leerzeile beendet eine Liste nur, wenn danach kein weiterer Eintrag / eingerückter Text folgt.
      const next = lines.slice(i + 1).find((l) => l.trim());
      if (lists.length && next && (isItem(next) || /^\s{2,}/.test(next))) continue;
      closeLists();
      continue;
    }
    if (/^\s*```/.test(raw)) {
      block();
      const code = [];
      while (++i < lines.length && !/^\s*```/.test(lines[i])) code.push(esc(lines[i]));
      html += `<pre><code>${code.join('\n')}</code></pre>`;
      continue;
    }
    if (/^\s*(-{3,}|\*{3,})\s*$/.test(raw)) { block(); html += '<hr>'; continue; }
    if ((m = raw.match(/^(#{1,4})\s+(.*)$/))) {
      block();
      let id = slugify(m[2]);
      const n = used.get(id) ?? 0;
      used.set(id, n + 1);
      if (n) id += `-${n}`;
      html += `<h${m[1].length} id="${prefix}${esc(id)}">${docInline(esc(m[2]))}</h${m[1].length}>`;
      continue;
    }
    if (/^\s*\|/.test(raw) && /^\s*\|?[\s:|-]+\|[\s:|-]*$/.test(lines[i + 1] ?? '')) {
      block();
      html += `<div class="doc-table"><table><thead><tr>${cells(raw).map((c) => `<th>${c}</th>`).join('')}</tr></thead><tbody>`;
      i++;
      while (i + 1 < lines.length && /^\s*\|/.test(lines[i + 1])) html += `<tr>${cells(lines[++i]).map((c) => `<td>${c}</td>`).join('')}</tr>`;
      html += '</tbody></table></div>';
      continue;
    }
    if ((m = raw.match(/^(\s*)([-*]|\d+[.)])\s+(.*)$/))) {
      flushPara();
      const indent = m[1].length;
      const type = /\d/.test(m[2]) ? 'ol' : 'ul';
      closeLists(indent);
      if (lists.at(-1)?.indent === indent && lists.at(-1).type !== type) html += `</li></${lists.pop().type}>`;
      let text = esc(m[3]);
      let cls = '';
      const task = text.match(/^\[([ xX])\]\s+(.*)$/);
      if (task) { text = `${task[1] === ' ' ? '☐' : '☑'} ${task[2]}`; cls = ' class="task"'; }
      if (lists.at(-1)?.indent === indent) html += `</li><li${cls}>`;
      else { lists.push({ type, indent }); html += `<${type}><li${cls}>`; }
      html += docInline(text);
      continue;
    }
    if (lists.length && /^\s{2,}/.test(raw)) {
      // Nach einer Leerzeile gehört eingerückter Text als neuer Absatz zu dem Eintrag, unter dem er steht.
      if (wasBlank) {
        closeLists(raw.match(/^\s*/)[0].length - 1);
        if (!/<\/[uo]l>$/.test(html)) html += '<br>';
      }
      html += ` ${docInline(esc(raw.trim()))}`;
      continue;
    }
    if ((m = raw.match(/^>\s?(.*)$/))) { block(); html += `<blockquote>${docInline(esc(m[1]))}</blockquote>`; continue; }
    closeLists();
    para.push(esc(raw));
  }
  block();
  return html;
}
