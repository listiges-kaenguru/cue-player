// Kleiner, sicherer Markdown-Renderer für Memo-Texte und Notizen.
// Erst wird ALLES HTML escaped, danach werden nur eigene Tags erzeugt. So kann eine geteilte Show kein HTML/JS einschleusen.
//
// Unterstützt:  # / ## / ### Überschrift · **fett** · *kursiv* · ~~durchgestrichen~~ · ==markiert==
//               - Liste · 1. Liste · > Zitat · ! Warnung · Leerzeile = neuer Absatz

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = (s) => s.replace(/[&<>"']/g, (c) => ESC[c]);

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
  const lines = String(src || '').replace(/\r\n?/g, '\n').split('\n');
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
