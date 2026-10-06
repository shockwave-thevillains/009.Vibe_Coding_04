// Weather presets blend smoothly into each other; storms schedule lightning.
export const PRESETS = {
  clear: { cloud: 0.12, rain: 0, petals: 0.3, wind: 0.35, fogMul: 0.85 },
  sakura: { cloud: 0.3, rain: 0, petals: 1.0, wind: 0.7, fogMul: 1.0 },
  rain: { cloud: 0.88, rain: 0.55, petals: 0.12, wind: 0.95, fogMul: 2.0 },
  storm: { cloud: 1.0, rain: 1.0, petals: 0.04, wind: 1.7, fogMul: 2.6 },
};

export class Weather {
  constructor(name = 'sakura') {
    this.name = name;
    Object.assign(this, PRESETS[name]);
    this.lightning = 0;
    this.nextStrike = 3;
    this.pulses = [];
    this.time = 0;
  }

  set(name, instant = false) {
    if (!PRESETS[name]) return;
    this.name = name;
    if (instant) Object.assign(this, PRESETS[name]);
    if (name === 'storm') this.nextStrike = Math.min(this.nextStrike, 2.5);
  }

  update(dt, onStrike) {
    this.time += dt;
    const target = PRESETS[this.name];
    const k = 1 - Math.exp(-dt * 0.45);
    for (const key of Object.keys(target)) this[key] += (target[key] - this[key]) * k;

    if (this.name === 'storm' || (this.name === 'rain' && this.rain > 0.5)) {
      this.nextStrike -= dt * (this.name === 'storm' ? 1 : 0.25);
      if (this.nextStrike <= 0) {
        this.nextStrike = 4 + Math.random() * 9;
        const t = this.time;
        const n = 2 + Math.floor(Math.random() * 3);
        for (let i = 0; i < n; i++) this.pulses.push({ t: t + i * (0.08 + Math.random() * 0.16), a: 0.6 + Math.random() * 0.8 });
        onStrike?.();
      }
    }

    let l = 0;
    this.pulses = this.pulses.filter((p) => this.time - p.t < 1.5);
    for (const p of this.pulses) {
      const dtp = this.time - p.t;
      if (dtp >= 0) l += p.a * Math.exp(-dtp * 14);
    }
    this.lightning = Math.min(l, 2.2);
  }
}
