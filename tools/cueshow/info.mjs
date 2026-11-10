// Übersicht über eine Show (info).
import { CUE_TYPES, NEXT_ACTIONS } from '../../js/model.js';

const num = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 1 });

/** Größe mit 1024er-Schritten und einer Nachkommastelle, z. B. „148,3 MB“. */
export function formatBytes(n) {
  const units = ['B', 'kB', 'MB', 'GB', 'TB'];
  let v = n;
  let u = 0;
  while (v >= 1024 && u < units.length - 1) { v /= 1024; u++; }
  return `${u === 0 ? v : num.format(v)} ${units[u]}`;
}

export function showInfo(show, findings) {
  const s = show.header.session;
  const byType = {};
  for (const c of s.cues) byType[c.type] = (byType[c.type] ?? 0) + 1;
  const media = show.header.media.map((m) => ({
    name: m.name,
    type: m.type,
    size: show.blobs.get(m.id)?.size ?? 0,
    cues: s.cues.flatMap((c, i) => (c.mediaId === m.id ? [i + 1] : [])),
  }));
  return {
    name: s.name,
    format: show.header.format,
    version: s.version,
    fileSize: show.fileSize ?? null,
    headerSize: show.headerSize ?? null,
    cues: { total: s.cues.length, byType },
    flow: {
      continue: s.cues.filter((c) => c.nextAction === 'continue').length,
      follow: s.cues.filter((c) => c.nextAction === 'follow').length,
      hotkeys: s.cues.filter((c) => c.hotkey).length,
      midi: s.cues.filter((c) => c.midiTrigger).length,
    },
    media,
    mediaBytes: media.reduce((a, m) => a + m.size, 0),
    check: {
      fehler: findings.filter((f) => f.stufe === 'fehler').length,
      warnungen: findings.filter((f) => f.stufe === 'warnung').length,
    },
  };
}

export function formatInfo(i) {
  const rows = [['Show', i.name], ['Format', `${i.format} (Show-Version ${i.version})`]];
  if (i.fileSize !== null) rows.push(['Größe', `${formatBytes(i.fileSize)} (Header ${formatBytes(i.headerSize)})`]);
  const types = [...Object.keys(CUE_TYPES), ...Object.keys(i.cues.byType).filter((t) => !(t in CUE_TYPES))]
    .filter((t) => i.cues.byType[t]).map((t) => `${CUE_TYPES[t]?.label ?? t} ${i.cues.byType[t]}`);
  rows.push(['Cues', `${i.cues.total}${types.length ? ': ' + types.join(', ') : ''}`]);
  const f = i.flow;
  rows.push(['Ablauf', `${NEXT_ACTIONS.continue} ${f.continue}, ${NEXT_ACTIONS.follow} ${f.follow}, Trigger: ${f.hotkeys} Tasten, ${f.midi} MIDI`]);
  rows.push(['Medien', `${i.media.length} Dateien, ${formatBytes(i.mediaBytes)}`]);
  const w = Math.max(...rows.map(([k]) => k.length)) + 2;
  const lines = rows.map(([k, v]) => k.padEnd(w) + v);
  if (i.media.length) {
    const nw = Math.max(...i.media.map((m) => m.name.length));
    const tw = Math.max(...i.media.map((m) => m.type.length));
    const sizes = i.media.map((m) => formatBytes(m.size));
    const sw = Math.max(...sizes.map((x) => x.length));
    i.media.forEach((m, k) => {
      const cues = m.cues.length ? 'Cue ' + m.cues.join(', ') : 'keine Cue';
      lines.push(`  ${m.name.padEnd(nw)}   ${m.type.padEnd(tw)}   ${sizes[k].padStart(sw)}   ${cues}`);
    });
  }
  lines.push('Prüfung'.padEnd(w) + `${i.check.fehler} Fehler, ${i.check.warnungen} Warnungen   (Einzelheiten: check)`);
  return lines.join('\n');
}
