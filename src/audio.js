export class Sound {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.noise = null;
    this.muted = false;
    this.ambient = null;
  }

  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.55;
    this.master.connect(this.ctx.destination);

    const length = Math.floor(this.ctx.sampleRate * 1.2);
    const buffer = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
    this.noise = buffer;
    this.startAmbient();
  }

  startAmbient() {
    if (!this.ctx || this.ambient) return;
    const ctx = this.ctx;
    const gain = ctx.createGain();
    gain.gain.value = 0.016;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 160;
    filter.Q.value = 0.8;
    const osc1 = ctx.createOscillator();
    osc1.type = 'sine';
    osc1.frequency.value = 48;
    const osc2 = ctx.createOscillator();
    osc2.type = 'triangle';
    osc2.frequency.value = 72.5;
    const g2 = ctx.createGain();
    g2.gain.value = 0.35;
    osc1.connect(filter);
    osc2.connect(g2);
    g2.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    osc1.start();
    osc2.start();
    this.ambient = { osc1, osc2, gain };
  }

  setMuted(muted) {
    this.muted = muted;
    if (this.master) this.master.gain.setTargetAtTime(muted ? 0 : 0.55, this.ctx.currentTime, 0.03);
  }

  noiseBurst({ duration = 0.12, gain = 0.2, freq = 1200, q = 0.8, type = 'bandpass', delay = 0 } = {}) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + delay;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.setValueAtTime(freq, t);
    filter.frequency.exponentialRampToValueAtTime(Math.max(80, freq * 0.28), t + duration);
    filter.Q.value = q;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(gain, t + 0.004);
    env.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    src.connect(filter);
    filter.connect(env);
    env.connect(this.master);
    src.start(t);
    src.stop(t + duration + 0.03);
  }

  tone({ freq = 100, to = 40, duration = 0.18, gain = 0.18, type = 'sine', delay = 0 } = {}) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, to), t + duration);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(gain, t + 0.006);
    env.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    osc.connect(env);
    env.connect(this.master);
    osc.start(t);
    osc.stop(t + duration + 0.02);
  }

  shot() {
    this.noiseBurst({ duration: 0.07, gain: 0.16, freq: 1700, q: 0.6 });
    this.noiseBurst({ duration: 0.16, gain: 0.08, freq: 500, q: 0.7, type: 'lowpass' });
    this.tone({ freq: 105, to: 42, duration: 0.1, gain: 0.11 });
  }

  enemyShot(volume = 1) {
    this.noiseBurst({ duration: 0.09, gain: 0.15 * volume, freq: 2200, q: 0.55 });
    this.noiseBurst({ duration: 0.2, gain: 0.07 * volume, freq: 700, q: 0.8, type: 'lowpass' });
    this.tone({ freq: 130, to: 48, duration: 0.12, gain: 0.09 * volume, type: 'triangle' });
  }

  hit() {
    this.tone({ freq: 1800, to: 900, duration: 0.035, gain: 0.045, type: 'square' });
    this.noiseBurst({ duration: 0.035, gain: 0.06, freq: 3200, q: 1.5 });
  }

  kill() {
    this.tone({ freq: 220, to: 60, duration: 0.24, gain: 0.12, type: 'triangle' });
    this.noiseBurst({ duration: 0.18, gain: 0.08, freq: 380, q: 0.8, type: 'lowpass' });
  }

  hurt() {
    this.tone({ freq: 90, to: 34, duration: 0.28, gain: 0.18, type: 'sawtooth' });
    this.noiseBurst({ duration: 0.16, gain: 0.1, freq: 300, q: 0.5, type: 'lowpass' });
  }

  empty() {
    this.tone({ freq: 1400, to: 1100, duration: 0.025, gain: 0.04, type: 'square' });
  }

  reload() {
    this.noiseBurst({ duration: 0.04, gain: 0.06, freq: 1800, q: 1.2, delay: 0 });
    this.noiseBurst({ duration: 0.05, gain: 0.07, freq: 1000, q: 1, delay: 0.42 });
    this.noiseBurst({ duration: 0.04, gain: 0.06, freq: 2200, q: 1.4, delay: 0.9 });
    this.tone({ freq: 210, to: 120, duration: 0.04, gain: 0.04, type: 'square', delay: 0.9 });
  }

  footstep() {
    this.noiseBurst({ duration: 0.05, gain: 0.018, freq: 240, q: 0.7, type: 'lowpass' });
  }

  win() {
    if (!this.ctx) return;
    const notes = [220, 277.18, 329.63, 440];
    notes.forEach((f, i) => {
      this.tone({ freq: f, to: f, duration: 0.6, gain: 0.045, type: 'sine', delay: i * 0.11 });
    });
    this.noiseBurst({ duration: 0.8, gain: 0.025, freq: 2200, q: 0.4, type: 'highpass', delay: 0.1 });
  }

  lose() {
    this.tone({ freq: 110, to: 28, duration: 1.1, gain: 0.14, type: 'sawtooth' });
    this.noiseBurst({ duration: 0.8, gain: 0.06, freq: 400, q: 0.4, type: 'lowpass' });
  }

  alert() {
    this.tone({ freq: 660, to: 880, duration: 0.07, gain: 0.025, type: 'sine' });
  }
}
