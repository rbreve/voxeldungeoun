// Tiny procedural sound effects with WebAudio (no asset files needed).
export class Sfx {
  constructor(volume) {
    this.volume = volume;
    this.ctx = null;
  }

  // Must be called from a user gesture.
  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.volume;
    this.master.connect(this.ctx.destination);
    const len = this.ctx.sampleRate;
    this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  }

  tone(type, f0, f1, dur, vol = 0.5, delay = 0) {
    const c = this.ctx;
    const t = c.currentTime + delay;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  noise(dur, vol = 0.5, f0 = 4000, f1 = 300, delay = 0) {
    const c = this.ctx;
    const t = c.currentTime + delay;
    const src = c.createBufferSource();
    src.buffer = this.noiseBuf;
    const filt = c.createBiquadFilter();
    filt.type = 'lowpass';
    filt.frequency.setValueAtTime(f0, t);
    filt.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(filt).connect(g).connect(this.master);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.02);
  }

  play(name, vol = 1) {
    if (!this.ctx) return;
    const v = vol;
    switch (name) {
      case 'pistol':  this.tone('square', 520, 90, 0.09, 0.25 * v); this.noise(0.08, 0.35 * v, 6000, 800); break;
      case 'shotgun': this.noise(0.35, 0.8 * v, 3000, 120); this.tone('sawtooth', 160, 40, 0.2, 0.3 * v); break;
      case 'smg':     this.noise(0.06, 0.35 * v, 7000, 1200); this.tone('square', 300, 120, 0.05, 0.15 * v); break;
      case 'plasma':  this.tone('sine', 1100, 260, 0.12, 0.3 * v); this.tone('square', 550, 180, 0.08, 0.08 * v); break;
      case 'rocket':  this.noise(0.45, 0.5 * v, 1500, 100); this.tone('sawtooth', 220, 50, 0.35, 0.2 * v); break;
      case 'railgun': this.tone('sawtooth', 1600, 60, 0.45, 0.3 * v); this.noise(0.3, 0.4 * v, 9000, 500); break;
      case 'explosion': this.noise(0.8, 0.9 * v, 1800, 40); this.tone('sine', 120, 30, 0.5, 0.6 * v); break;
      case 'hit':     this.tone('square', 240, 140, 0.05, 0.12 * v); break;
      case 'monsterDie': this.tone('sawtooth', 320, 40, 0.35, 0.25 * v); this.noise(0.25, 0.25 * v, 2000, 200); break;
      case 'hurt':    this.tone('square', 170, 70, 0.22, 0.35 * v); this.noise(0.15, 0.3 * v, 1500, 200); break;
      case 'pickup':  this.tone('sine', 600, 1300, 0.12, 0.3 * v); break;
      case 'weapon':  this.tone('square', 300, 300, 0.07, 0.2 * v); this.tone('square', 450, 450, 0.07, 0.2 * v, 0.08); this.tone('square', 600, 600, 0.12, 0.2 * v, 0.16); break;
      case 'power':   [0, 0.07, 0.14, 0.21].forEach((d, i) => this.tone('triangle', 400 * (1 + i * 0.26), 400 * (1 + i * 0.26), 0.12, 0.3 * v, d)); break;
      case 'door':    this.noise(0.35, 0.5 * v, 800, 60); this.tone('square', 70, 45, 0.3, 0.25 * v); break;
      case 'clear':   [0, 0.1, 0.2].forEach((d, i) => this.tone('triangle', 523 * [1, 1.26, 1.5][i], 523 * [1, 1.26, 1.5][i], 0.18, 0.3 * v, d)); break;
      case 'enemyShoot': this.tone('sine', 520, 180, 0.18, 0.18 * v); break;
      case 'spawn':   this.tone('sine', 90, 400, 0.4, 0.2 * v); break;
      case 'empty':   this.tone('square', 900, 800, 0.03, 0.1 * v); break;
      case 'switch':  this.noise(0.05, 0.2 * v, 3000, 1500); break;
      case 'fuse':    this.tone('square', 900, 900, 0.05, 0.12 * v); break;
      case 'portal':  this.tone('sine', 200, 900, 0.9, 0.3 * v); this.tone('triangle', 300, 1200, 0.9, 0.15 * v); break;
      case 'supershotgun': this.noise(0.5, 1.0 * v, 2500, 80); this.tone('sawtooth', 120, 30, 0.35, 0.4 * v); break;
      case 'grenade': this.tone('sine', 180, 60, 0.18, 0.5 * v); this.noise(0.12, 0.3 * v, 1500, 300); break;
      case 'bounce':  this.tone('square', 260, 180, 0.04, 0.12 * v); break;
      case 'loot':    this.tone('sine', 300 + Math.random() * 200, 700, 0.08, 0.1 * v); break;
      case 'chest':   this.noise(0.2, 0.3 * v, 1200, 200); [0, 0.08, 0.16, 0.24, 0.32].forEach((d, i) => this.tone('triangle', 523 * Math.pow(1.19, i), 523 * Math.pow(1.19, i), 0.15, 0.25 * v, d)); break;
      case 'legendary': [0, 0.06, 0.12].forEach((d, i) => this.tone('sine', 1047 * [1, 1.25, 1.5][i], 1047 * [1, 1.25, 1.5][i], 0.3, 0.12 * v, d)); break;
      case 'boss':    this.tone('sawtooth', 80, 40, 1.2, 0.4 * v); this.noise(1.0, 0.3 * v, 600, 50); break;
    }
  }
}
