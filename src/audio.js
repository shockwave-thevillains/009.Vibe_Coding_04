// Fully procedural soundscape: river, rain, wind, birds/crickets, thunder and a
// sparse koto-like melody on the Japanese "in" scale. No audio files needed.
const IN_SCALE = [62, 63, 67, 69, 70, 74, 75, 79, 81, 82]; // D Eb G A Bb (two octaves)
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.params = { rain: 0, wind: 0.5, night: 0, day: 1, speed: 0 };
    this.nextNote = 0;
    this.nextBird = 2;
  }

  start() {
    if (this.ctx) {
      this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = (this.ctx = new AC());

    this.master = ctx.createGain();
    this.master.gain.value = 0;
    this.master.gain.linearRampToValueAtTime(0.9, ctx.currentTime + 3);
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.ratio.value = 3;
    this.master.connect(comp).connect(ctx.destination);

    // Reverb from a synthetic impulse response.
    this.reverb = ctx.createConvolver();
    const len = ctx.sampleRate * 3.2;
    const ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = ir.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2);
    }
    this.reverb.buffer = ir;
    const wet = ctx.createGain();
    wet.gain.value = 0.55;
    this.reverb.connect(wet).connect(this.master);

    // Shared noise buffer
    const nlen = ctx.sampleRate * 3;
    this.noise = ctx.createBuffer(1, nlen, ctx.sampleRate);
    const nd = this.noise.getChannelData(0);
    for (let i = 0; i < nlen; i++) nd[i] = Math.random() * 2 - 1;

    const loopNoise = () => {
      const src = ctx.createBufferSource();
      src.buffer = this.noise;
      src.loop = true;
      src.start(0, Math.random() * 2);
      return src;
    };

    // River murmur
    const river = loopNoise();
    const rLP = ctx.createBiquadFilter();
    rLP.type = 'lowpass';
    rLP.frequency.value = 420;
    this.riverGain = ctx.createGain();
    this.riverGain.gain.value = 0.16;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.13;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 120;
    lfo.connect(lfoGain).connect(rLP.frequency);
    lfo.start();
    river.connect(rLP).connect(this.riverGain).connect(this.master);

    // Rain hiss
    const rain = loopNoise();
    const rHP = ctx.createBiquadFilter();
    rHP.type = 'highpass';
    rHP.frequency.value = 900;
    const rLP2 = ctx.createBiquadFilter();
    rLP2.type = 'lowpass';
    rLP2.frequency.value = 7000;
    this.rainGain = ctx.createGain();
    this.rainGain.gain.value = 0;
    rain.connect(rHP).connect(rLP2).connect(this.rainGain).connect(this.master);

    // Wind
    const wind = loopNoise();
    this.windBP = ctx.createBiquadFilter();
    this.windBP.type = 'bandpass';
    this.windBP.frequency.value = 380;
    this.windBP.Q.value = 0.7;
    this.windGain = ctx.createGain();
    this.windGain.gain.value = 0;
    wind.connect(this.windBP).connect(this.windGain).connect(this.master);

    // Crickets: high tone gated by a fast pulse and a slow chirp envelope.
    const cr = ctx.createOscillator();
    cr.type = 'triangle';
    cr.frequency.value = 4300;
    const gate = ctx.createGain();
    gate.gain.value = 0;
    const pulse = ctx.createOscillator();
    pulse.type = 'square';
    pulse.frequency.value = 28;
    const pulseGain = ctx.createGain();
    pulseGain.gain.value = 0.5;
    pulse.connect(pulseGain).connect(gate.gain);
    const slow = ctx.createOscillator();
    slow.type = 'square';
    slow.frequency.value = 1.6;
    const slowGain = ctx.createGain();
    slowGain.gain.value = 0.5;
    slow.connect(slowGain).connect(gate.gain);
    this.cricketGain = ctx.createGain();
    this.cricketGain.gain.value = 0;
    cr.connect(gate).connect(this.cricketGain).connect(this.master);
    cr.start();
    pulse.start();
    slow.start();

    // Drone
    this.droneGain = ctx.createGain();
    this.droneGain.gain.value = 0.035;
    for (const f of [mtof(38), mtof(45), mtof(50)]) {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = f;
      o.detune.value = (Math.random() - 0.5) * 8;
      o.connect(this.droneGain);
      o.start();
    }
    this.droneGain.connect(this.master);
    this.droneGain.connect(this.reverb);

    this.nextNote = ctx.currentTime + 2;
  }

  setMuted(m) {
    this.muted = m;
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(t);
    this.master.gain.setTargetAtTime(m ? 0 : 0.9, t, 0.3);
  }

  update(params) {
    Object.assign(this.params, params);
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    const t = ctx.currentTime;
    const p = this.params;
    this.rainGain.gain.setTargetAtTime(p.rain * 0.32, t, 0.5);
    this.windGain.gain.setTargetAtTime(0.02 + p.wind * 0.05, t, 0.8);
    this.windBP.frequency.setTargetAtTime(300 + p.wind * 200, t, 1);
    this.riverGain.gain.setTargetAtTime(0.12 + Math.min(p.speed, 14) * 0.006, t, 0.5);
    this.cricketGain.gain.setTargetAtTime(p.night * (1 - p.rain) * 0.012, t, 1);
    this.droneGain.gain.setTargetAtTime(0.03 + p.night * 0.02, t, 2);

    if (t > this.nextNote) this.phrase(t);
    if (t > this.nextBird) {
      this.nextBird = t + 2 + Math.random() * 6;
      if (p.day > 0.5 && p.rain < 0.3) this.bird(t);
    }
  }

  phrase(t) {
    const p = this.params;
    const notes = 1 + Math.floor(Math.random() * 4);
    let start = t + 0.05;
    let idx = Math.floor(Math.random() * IN_SCALE.length);
    for (let i = 0; i < notes; i++) {
      idx = Math.max(0, Math.min(IN_SCALE.length - 1, idx + Math.floor(Math.random() * 5) - 2));
      this.koto(IN_SCALE[idx] - (p.night > 0.5 ? 12 : 0), start, 0.09 + Math.random() * 0.05);
      start += 0.28 + Math.random() * 0.5;
    }
    this.nextNote = start + 2 + Math.random() * 5 * (1 + p.rain);
  }

  koto(midi, t, vel) {
    const ctx = this.ctx;
    const f = mtof(midi);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vel, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0008, t + 2.6);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(f * 8, t);
    lp.frequency.exponentialRampToValueAtTime(f * 1.5, t + 1.2);
    const partials = [
      [1, 'triangle', 1],
      [2, 'sine', 0.35],
      [3.01, 'sine', 0.12],
    ];
    for (const [mult, type, amp] of partials) {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.setValueAtTime(f * mult * 1.012, t);
      o.frequency.exponentialRampToValueAtTime(f * mult, t + 0.08); // pluck bend
      const og = ctx.createGain();
      og.gain.value = amp;
      o.connect(og).connect(lp);
      o.start(t);
      o.stop(t + 2.8);
    }
    lp.connect(g);
    g.connect(this.master);
    g.connect(this.reverb);
  }

  bird(t) {
    const ctx = this.ctx;
    const chirps = 2 + Math.floor(Math.random() * 4);
    const base = 2600 + Math.random() * 1800;
    const pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    if (pan) pan.pan.value = Math.random() * 2 - 1;
    for (let i = 0; i < chirps; i++) {
      const s = t + i * (0.09 + Math.random() * 0.05);
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.setValueAtTime(base, s);
      o.frequency.exponentialRampToValueAtTime(base * (1.3 + Math.random() * 0.4), s + 0.06);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, s);
      g.gain.linearRampToValueAtTime(0.025, s + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0005, s + 0.08);
      o.connect(g);
      if (pan) g.connect(pan);
      else g.connect(this.master);
      o.start(s);
      o.stop(s + 0.1);
    }
    if (pan) {
      pan.connect(this.master);
      pan.connect(this.reverb);
    }
  }

  splash(amount = 1) {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 900 + Math.random() * 600;
    bp.Q.value = 1.2;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.12 * amount, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0005, t + 0.45);
    src.connect(bp).connect(g).connect(this.master);
    src.start(t, Math.random() * 2, 0.5);
  }

  thunder(distance) {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    const delay = distance / 343;
    const t = ctx.currentTime + Math.min(delay, 3);
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(900, t);
    lp.frequency.exponentialRampToValueAtTime(90, t + 3.5);
    const g = ctx.createGain();
    const amp = 0.9 * (1 - Math.min(distance, 900) / 1300);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(amp, t + 0.08);
    g.gain.setTargetAtTime(amp * 0.5, t + 0.1, 0.4);
    g.gain.exponentialRampToValueAtTime(0.0005, t + 5);
    src.connect(lp).connect(g);
    g.connect(this.master);
    g.connect(this.reverb);
    src.start(t, 0, 5.2);
  }
}
