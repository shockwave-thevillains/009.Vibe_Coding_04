import * as THREE from 'three';
import { mulberry32 } from './noise.js';

// All ambient particles live in a box that wraps around a moving centre, so a
// fixed number of GPU-animated points covers the entire journey.
const WRAP = /* glsl */ `
  vec3 wrapBox(vec3 p, vec3 c, vec3 size) {
    return c + mod(p - c + size * 0.5, size) - size * 0.5;
  }
  float hash11(float n) { return fract(sin(n) * 43758.5453123); }
`;

export class Petals {
  constructor(count = 5000) {
    const rand = mulberry32(5);
    const seeds = new Float32Array(count * 4);
    for (let i = 0; i < count * 4; i++) seeds[i] = rand();
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
    geo.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 4));
    this.uniforms = {
      uTime: { value: 0 },
      uCenter: { value: new THREE.Vector3() },
      uBox: { value: new THREE.Vector3(150, 26, 150) },
      uWind: { value: new THREE.Vector3(1.2, 0, 0.6) },
      uDensity: { value: 0.5 },
      uScale: { value: 500 },
      uLight: { value: 1 },
      uColor: { value: new THREE.Color('#f59ab2') },
    };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: /* glsl */ `
        attribute vec4 aSeed;
        uniform float uTime, uDensity, uScale;
        uniform vec3 uCenter, uBox, uWind;
        varying float vRot;
        varying float vShade;
        ${WRAP}
        void main() {
          float r = aSeed.w;
          float t = uTime;
          vec3 p = aSeed.xyz * uBox;
          p.y -= t * (0.55 + r * 0.7);
          p.x += t * uWind.x * (0.6 + r * 0.8) + sin(t * 0.9 + r * 40.0) * 1.8;
          p.z += t * uWind.z * (0.6 + r * 0.8) + cos(t * 0.7 + r * 30.0) * 1.8;
          vec3 c = vec3(uCenter.x, uBox.y * 0.5, uCenter.z);
          vec3 wp = wrapBox(p, c, uBox);
          vec4 mv = viewMatrix * vec4(wp, 1.0);
          gl_Position = projectionMatrix * mv;
          float vis = step(r, uDensity) * smoothstep(1.5, 4.0, -mv.z);
          gl_PointSize = min(0.3 * (0.6 + r * 0.8) * uScale / max(-mv.z, 0.1), 22.0) * vis;
          vRot = t * (0.8 + r * 2.5) + r * 20.0;
          vShade = 0.72 + 0.28 * sin(t * 2.6 + r * 50.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor;
        uniform float uLight;
        varying float vRot;
        varying float vShade;
        void main() {
          vec2 uv = gl_PointCoord - 0.5;
          float c = cos(vRot), s = sin(vRot);
          uv = mat2(c, -s, s, c) * uv;
          float d = length(uv * vec2(2.3, 1.45));
          float notch = (1.0 - smoothstep(0.0, 0.07, abs(uv.x))) * step(0.22, uv.y);
          if (d > 0.5 || notch > 0.5) discard;
          vec3 col = mix(uColor, vec3(1.0, 0.9, 0.93), clamp(0.25 - uv.y, 0.0, 1.0) * 0.6) * vShade * uLight;
          gl_FragColor = vec4(col, 1.0);
        }
      `,
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
  }
}

export class Rain {
  constructor(count = 5000) {
    const rand = mulberry32(11);
    const pos = new Float32Array(count * 2 * 3);
    const seeds = new Float32Array(count * 2 * 4);
    const ends = new Float32Array(count * 2);
    for (let i = 0; i < count; i++) {
      const s = [rand(), rand(), rand(), rand()];
      for (let k = 0; k < 2; k++) {
        seeds.set(s, (i * 2 + k) * 4);
        ends[i * 2 + k] = k;
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 4));
    geo.setAttribute('aEnd', new THREE.BufferAttribute(ends, 1));
    this.uniforms = {
      uTime: { value: 0 },
      uCenter: { value: new THREE.Vector3() },
      uBox: { value: new THREE.Vector3(80, 40, 80) },
      uWind: { value: new THREE.Vector3(3, 0, 1.5) },
      uIntensity: { value: 0 },
      uLight: { value: 1 },
    };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      transparent: true,
      depthWrite: false,
      vertexShader: /* glsl */ `
        attribute vec4 aSeed;
        attribute float aEnd;
        uniform float uTime, uIntensity;
        uniform vec3 uCenter, uBox, uWind;
        varying float vA;
        ${WRAP}
        void main() {
          float r = aSeed.w;
          vec3 vel = vec3(uWind.x, -38.0 - r * 10.0, uWind.z);
          vec3 p = aSeed.xyz * uBox + vel * uTime;
          vec3 wp = wrapBox(p, uCenter, uBox);
          wp -= normalize(vel) * aEnd * (0.7 + r * 0.6);
          vec4 mv = viewMatrix * vec4(wp, 1.0);
          vA = step(r, uIntensity) * (1.0 - aEnd * 0.6) * smoothstep(3.0, 12.0, -mv.z) * (1.0 - smoothstep(25.0, 40.0, -mv.z)) * step(0.0, wp.y);
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uLight;
        varying float vA;
        void main() {
          if (vA < 0.01) discard;
          gl_FragColor = vec4(vec3(0.72, 0.78, 0.88) * uLight, 0.13 * vA);
        }
      `,
    });
    this.lines = new THREE.LineSegments(geo, mat);
    this.lines.frustumCulled = false;
  }
}

export class Fireflies {
  constructor(count = 260) {
    const rand = mulberry32(21);
    const seeds = new Float32Array(count * 4);
    for (let i = 0; i < count * 4; i++) seeds[i] = rand();
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
    geo.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 4));
    this.uniforms = {
      uTime: { value: 0 },
      uCenter: { value: new THREE.Vector3() },
      uBox: { value: new THREE.Vector3(160, 7, 160) },
      uAmount: { value: 0 },
      uScale: { value: 500 },
    };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader: /* glsl */ `
        attribute vec4 aSeed;
        uniform float uTime, uAmount, uScale;
        uniform vec3 uCenter, uBox;
        varying float vGlow;
        ${WRAP}
        void main() {
          float r = aSeed.w;
          float t = uTime;
          vec3 p = aSeed.xyz * uBox;
          p.x += sin(t * 0.3 + r * 30.0) * 3.0;
          p.z += cos(t * 0.25 + r * 20.0) * 3.0;
          p.y += sin(t * 0.6 + r * 10.0) * 0.8;
          vec3 c = vec3(uCenter.x, uBox.y * 0.5 + 0.6, uCenter.z);
          vec3 wp = wrapBox(p, c, uBox);
          vec4 mv = viewMatrix * vec4(wp, 1.0);
          gl_Position = projectionMatrix * mv;
          float blink = pow(max(sin(t * (1.2 + r * 1.5) + r * 60.0), 0.0), 6.0);
          vGlow = blink * uAmount;
          gl_PointSize = min((0.12 + blink * 0.1) * uScale / max(-mv.z, 0.1), 14.0) * step(0.01, vGlow);
        }
      `,
      fragmentShader: /* glsl */ `
        varying float vGlow;
        void main() {
          float d = length(gl_PointCoord - 0.5);
          float a = (1.0 - smoothstep(0.0, 0.5, d));
          gl_FragColor = vec4(vec3(0.85, 1.0, 0.45) * 2.2 * vGlow * a, a * vGlow);
        }
      `,
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
  }
}

// Expanding rings on the water from the pole, the hull and the wake.
export class Ripples {
  constructor(max = 90) {
    this.max = max;
    const geo = new THREE.PlaneGeometry(1, 1);
    geo.rotateX(-Math.PI / 2);
    this.progress = new Float32Array(max).fill(1);
    this.strength = new Float32Array(max);
    this.items = Array.from({ length: max }, () => ({ x: 0, z: 0, age: 1, life: 1, size: 1, grow: 1 }));
    geo.setAttribute('aProgress', new THREE.InstancedBufferAttribute(this.progress, 1));
    geo.setAttribute('aStrength', new THREE.InstancedBufferAttribute(this.strength, 1));
    this.uniforms = { uLight: { value: 1 } };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      transparent: true,
      depthWrite: false,
      vertexShader: /* glsl */ `
        attribute float aProgress;
        attribute float aStrength;
        varying vec2 vUv;
        varying float vP;
        varying float vS;
        void main() {
          vUv = uv;
          vP = aProgress;
          vS = aStrength;
          gl_Position = projectionMatrix * viewMatrix * modelMatrix * instanceMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uLight;
        varying vec2 vUv;
        varying float vP;
        varying float vS;
        void main() {
          float r = length(vUv - 0.5) * 2.0;
          float ring = (1.0 - smoothstep(0.0, 0.09, abs(r - 0.86))) + 0.5 * (1.0 - smoothstep(0.0, 0.07, abs(r - 0.6)));
          float a = ring * pow(1.0 - vP, 1.6) * vS;
          if (a < 0.003) discard;
          gl_FragColor = vec4(vec3(0.9, 0.95, 1.0) * (0.12 + 0.88 * uLight), a * 0.5);
        }
      `,
    });
    this.mesh = new THREE.InstancedMesh(geo, mat, max);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 2;
    this.cursor = 0;
    this._m = new THREE.Matrix4();
  }

  spawn(x, z, strength, size) {
    const it = this.items[this.cursor];
    this.cursor = (this.cursor + 1) % this.max;
    it.x = x;
    it.z = z;
    it.age = 0;
    it.life = 1.6 + size * 0.25;
    it.size = size * 0.25;
    it.grow = size;
    it.strength = strength;
  }

  update(dt) {
    for (let i = 0; i < this.max; i++) {
      const it = this.items[i];
      it.age = Math.min(it.life, it.age + dt);
      const p = it.age / it.life;
      this.progress[i] = p;
      this.strength[i] = p >= 1 ? 0 : it.strength || 0;
      const s = it.size + it.grow * Math.sqrt(p);
      this._m.makeScale(s, 1, s).setPosition(it.x, 0.04, it.z);
      this.mesh.setMatrixAt(i, this._m);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.geometry.attributes.aProgress.needsUpdate = true;
    this.mesh.geometry.attributes.aStrength.needsUpdate = true;
  }
}

// Rain drops hitting the river: thousands of tiny rings, fully GPU-driven.
export class RainRipples {
  constructor(count = 900) {
    const rand = mulberry32(31);
    const positions = [];
    const corners = [];
    const seeds = [];
    const indices = [];
    for (let i = 0; i < count; i++) {
      const s = rand();
      const s2 = rand();
      const cs = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
      for (const c of cs) {
        positions.push(0, 0, 0);
        corners.push(c[0], c[1]);
        seeds.push(s, s2);
      }
      const b = i * 4;
      indices.push(b, b + 2, b + 1, b, b + 3, b + 2);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('aCorner', new THREE.Float32BufferAttribute(corners, 2));
    geo.setAttribute('aSeed', new THREE.Float32BufferAttribute(seeds, 2));
    geo.setIndex(indices);
    this.uniforms = {
      uTime: { value: 0 },
      uCenter: { value: new THREE.Vector3() },
      uIntensity: { value: 0 },
      uLight: { value: 1 },
    };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      transparent: true,
      depthWrite: false,
      vertexShader: /* glsl */ `
        attribute vec2 aCorner;
        attribute vec2 aSeed;
        uniform float uTime, uIntensity;
        uniform vec3 uCenter;
        varying vec2 vC;
        varying float vP;
        varying float vVis;
        float h(float n) { return fract(sin(n) * 43758.5453); }
        void main() {
          float rate = 0.9 + aSeed.y * 0.6;
          float k = uTime * rate + aSeed.x * 17.0;
          float cyc = floor(k);
          vP = fract(k);
          vec2 box = vec2(70.0);
          vec2 rp = vec2(h(cyc * 1.31 + aSeed.x * 91.7), h(cyc * 7.17 + aSeed.y * 33.3)) * box - box * 0.5;
          vec3 wp = vec3(uCenter.x + rp.x, 0.05, uCenter.z + rp.y);
          float size = 0.1 + vP * 0.4;
          wp.xz += aCorner * size;
          vC = aCorner;
          vVis = step(aSeed.x, uIntensity);
          gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uLight;
        varying vec2 vC;
        varying float vP;
        varying float vVis;
        void main() {
          float r = length(vC);
          float ring = (1.0 - smoothstep(0.0, 0.18, abs(r - 0.8)));
          float a = ring * (1.0 - vP) * vVis;
          if (a < 0.01) discard;
          gl_FragColor = vec4(vec3(0.85, 0.9, 1.0) * (0.3 + 0.7 * uLight), a * 0.3);
        }
      `,
    });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 2;
  }
}

// A jagged bolt that flashes far away during storms.
export class LightningBolt {
  constructor() {
    this.mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(6, 6.5, 8), fog: false, transparent: true, opacity: 0 });
    this.mesh = new THREE.Mesh(new THREE.BufferGeometry(), this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
  }

  strike(center, rand = Math.random) {
    const ang = rand() * Math.PI * 2;
    const dist = 350 + rand() * 450;
    const x = center.x + Math.cos(ang) * dist;
    const z = center.z + Math.sin(ang) * dist;
    const pts = [];
    let px = x;
    let pz = z;
    for (let y = 420; y > 0; y -= 22 + rand() * 20) {
      pts.push(new THREE.Vector3(px, y, pz));
      px += (rand() - 0.5) * 30;
      pz += (rand() - 0.5) * 30;
    }
    pts.push(new THREE.Vector3(px, 0, pz));
    this.mesh.geometry.dispose();
    this.mesh.geometry = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.1), 60, 1.6, 5);
    this.mesh.visible = true;
    return dist;
  }

  update(flash) {
    this.mat.opacity = Math.min(1, flash * 1.2);
    this.mesh.visible = flash > 0.02;
  }
}
