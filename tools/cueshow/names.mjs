// Dateinamen für entpackte Medien. Der Name stammt aus einer fremden Datei und wird nie ungeprüft als Pfad benutzt.

const TYPES = [
  ['.mp3', 'audio/mpeg', ['audio/mpeg', 'audio/mp3', 'audio/mpeg3', 'audio/x-mpeg']],
  ['.wav', 'audio/wav', ['audio/wav', 'audio/x-wav', 'audio/wave', 'audio/vnd.wave']],
  ['.ogg', 'audio/ogg', ['audio/ogg', 'application/ogg']],
  ['.opus', 'audio/opus', ['audio/opus']],
  ['.flac', 'audio/flac', ['audio/flac', 'audio/x-flac']],
  ['.m4a', 'audio/mp4', ['audio/mp4', 'audio/x-m4a', 'audio/m4a']],
  ['.aac', 'audio/aac', ['audio/aac', 'audio/x-aac']],
  ['.webm', 'audio/webm', ['audio/webm']],
  ['.aiff', 'audio/aiff', ['audio/aiff', 'audio/x-aiff']],
  ['.aif', 'audio/aiff', []],
  ['.weba', 'audio/webm', []],
  ['.mp4', 'video/mp4', ['video/mp4']],
];

const MAX = 120;
const RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;
const EXT = /\.[0-9a-z]{1,10}$/i;

/** Endung zum MIME-Typ, unbekannt: .bin */
export function extForType(type) {
  const t = String(type ?? '').split(';')[0].trim().toLowerCase();
  return TYPES.find(([, , list]) => list.includes(t))?.[0] ?? '.bin';
}

/** MIME-Typ zur Endung eines Dateinamens, unbekannt: '' */
export function typeForFile(file) {
  const m = String(file).toLowerCase().match(EXT);
  return (m && TYPES.find(([ext]) => ext === m[0])?.[1]) || '';
}

const trimEnds = (s) => s.replace(/^[.\s]+/u, '').replace(/[.\s]+$/u, '');

/** Bereinigter Dateiname ohne Pfad. index (ab 0) ergibt den Ersatznamen medium-<index+1>. */
export function safeFileName(name, type, index) {
  let n = typeof name === 'string' ? name.normalize('NFC') : '';
  n = n.split(/[/\\]/).pop();
  n = n.replace(/[\u0000-\u001f\u007f<>:"|?*]/gu, '_');
  n = trimEnds(n);
  if (!n) n = `medium-${index + 1}`;
  if (!EXT.test(n) || n === n.match(EXT)?.[0]) n += extForType(type);
  const ext = n.match(EXT)[0];
  let stem = n.slice(0, -ext.length);
  if (RESERVED.test(stem.split('.')[0])) stem = '_' + stem;
  const chars = [...stem];
  if (chars.length + ext.length > MAX) stem = trimEnds(chars.slice(0, MAX - ext.length).join('')) || `medium-${index + 1}`;
  return stem + ext;
}

/** Dateinamen für alle Medien, Dubletten (ohne Groß-/Kleinschreibung) mit -2, -3 … */
export function mediaFileNames(media) {
  const used = new Set();
  return media.map((m, i) => {
    const base = safeFileName(m.name, m.type, i);
    const ext = base.match(EXT)[0];
    const stem = base.slice(0, -ext.length);
    let name = base;
    for (let k = 2; used.has(name.toLowerCase()); k++) name = `${stem}-${k}${ext}`;
    used.add(name.toLowerCase());
    return name;
  });
}
