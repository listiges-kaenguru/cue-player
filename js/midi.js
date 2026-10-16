// Web-MIDI: Eingänge als Trigger, Ausgänge für MIDI-Cues.
import { Emitter, clamp } from './util.js';

export class Midi extends Emitter {
  constructor() {
    super();
    this.access = null;
    this.supported = 'requestMIDIAccess' in navigator;
  }

  async enable() {
    if (!this.supported) throw new Error('Web MIDI wird von diesem Browser nicht unterstützt');
    if (this.access) return;
    this.access = await navigator.requestMIDIAccess({ sysex: false });
    const attach = () => {
      this.access.inputs.forEach((inp) => { inp.onmidimessage = (e) => this._onMessage(e.data); });
      this.emit('ports');
    };
    this.access.onstatechange = attach;
    attach();
  }

  get enabled() { return !!this.access; }

  inputs() { return this.access ? [...this.access.inputs.values()] : []; }
  outputs() { return this.access ? [...this.access.outputs.values()] : []; }

  /** Sendet an einen bestimmten Ausgang (id) oder an alle (''). */
  send(outputId, bytes) {
    const outs = this.outputs().filter((o) => !outputId || o.id === outputId);
    outs.forEach((o) => o.send(bytes));
    return outs.length;
  }

  _onMessage(data) {
    const [status, d1, d2 = 0] = data;
    const type = status & 0xf0;
    const ch = (status & 0x0f) + 1;
    let key = null;
    if (type === 0x90 && d2 > 0) key = `noteon/${ch}/${d1}`;
    else if (type === 0xb0 && d2 > 0) key = `cc/${ch}/${d1}`;
    else if (type === 0xc0) key = `pc/${ch}/${d1}`;
    if (key) this.emit('trigger', key);
  }
}

export function midiLabel(key) {
  if (!key) return '';
  const [t, ch, n] = key.split('/');
  const name = { noteon: 'Note', cc: 'CC', pc: 'PC' }[t] ?? t;
  return `${name} ${n} · K${ch}`;
}

export function midiBytes(cue) {
  const ch = (clamp(cue.channel | 0, 1, 16) - 1) & 0x0f;
  const d1 = cue.data1 & 0x7f;
  const d2 = cue.data2 & 0x7f;
  switch (cue.msg) {
    case 'noteoff': return [0x80 | ch, d1, d2];
    case 'cc': return [0xb0 | ch, d1, d2];
    case 'pc': return [0xc0 | ch, d1];
    default: return [0x90 | ch, d1, d2];
  }
}
