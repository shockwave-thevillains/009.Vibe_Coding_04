import * as THREE from 'three';
import { smoothstep, clamp } from './noise.js';

const skyVertex = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const skyFragment = /* glsl */ `
  uniform vec3 uZenith;
  uniform vec3 uHorizon;
  uniform vec3 uSunDir;
  uniform vec3 uSunColor;
  uniform vec3 uMoonDir;
  uniform vec3 uCloudLit;
  uniform vec3 uCloudDark;
  uniform float uNight;
  uniform float uCloud;
  uniform float uTime;
  uniform float uLightning;
  varying vec3 vDir;

  float hash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
  float hash2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float vnoise(vec2 p) {
    vec2 i = floor(p); vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash2(i), hash2(i + vec2(1, 0)), f.x), mix(hash2(i + vec2(0, 1)), hash2(i + vec2(1, 1)), f.x), f.y);
  }
  float fbm(vec2 p) {
    float s = 0.0, a = 0.5;
    for (int i = 0; i < 5; i++) { s += a * vnoise(p); p = p * 2.03 + vec2(1.7, 9.2); a *= 0.5; }
    return s;
  }

  void main() {
    vec3 d = normalize(vDir);
    float h = d.y;
    float t = pow(clamp(h, 0.0, 1.0), 0.45);
    vec3 col = mix(uHorizon, uZenith, t);

    float clear = 1.0 - uCloud * 0.85;

    // Sun glow + disc
    float sd = max(dot(d, uSunDir), 0.0);
    col += uSunColor * (pow(sd, 6.0) * 0.18 + pow(sd, 48.0) * 0.55) * clear;
    col += uSunColor * smoothstep(0.99955, 0.9998, sd) * 12.0 * (1.0 - uCloud);

    // Moon + halo
    float md = dot(d, uMoonDir);
    col += vec3(0.85, 0.9, 1.0) * smoothstep(0.99935, 0.9996, md) * 3.0 * uNight * (1.0 - uCloud);
    col += vec3(0.25, 0.3, 0.45) * pow(max(md, 0.0), 120.0) * 0.6 * uNight * clear;

    // Stars
    if (h > 0.0) {
      vec3 sp = d * 220.0;
      vec3 cell = floor(sp);
      float r = hash(cell);
      if (r > 0.985) {
        vec3 c = cell + 0.5 + (vec3(hash(cell + 1.3), hash(cell + 7.1), hash(cell + 3.7)) - 0.5) * 0.6;
        float dist = length(sp - c);
        float tw = 0.6 + 0.4 * sin(uTime * (1.5 + r * 4.0) + r * 100.0);
        col += vec3(0.9, 0.92, 1.0) * (1.0 - smoothstep(0.0, 0.18, dist)) * tw * uNight * (1.0 - uCloud) * smoothstep(0.0, 0.25, h) * 1.6;
      }
    }

    // Clouds projected on a plane
    if (h > -0.02) {
      vec2 uv = d.xz / (h + 0.12) * 1.2 + vec2(uTime * 0.008, uTime * 0.004);
      float n = fbm(uv);
      float n2 = fbm(uv * 2.7 + 4.0);
      float cov = mix(0.75, 0.22, uCloud);
      float mask = smoothstep(cov, cov + 0.28, n * 0.75 + n2 * 0.35);
      mask *= smoothstep(-0.02, 0.18, h);
      float lit = clamp(0.5 + (n2 - 0.5) * 1.4 + pow(sd, 4.0) * 0.6, 0.0, 1.0);
      vec3 cc = mix(uCloudDark, uCloudLit, lit);
      col = mix(col, cc, mask * mix(0.85, 0.97, uCloud));
    }

    // Overcast veil and horizon haze
    col = mix(col, uHorizon, (1.0 - smoothstep(-0.02, 0.12, h)) * 0.85);

    // Lightning lights the cloud deck
    col += vec3(0.75, 0.8, 1.0) * uLightning * (0.35 + 0.65 * uCloud) * smoothstep(-0.1, 0.4, h);

    gl_FragColor = vec4(col, 1.0);
  }
`;

// Keyframes indexed by sun elevation (y of normalized sun direction).
const KEYS = [
  { e: -0.4, zenith: '#03050d', horizon: '#0b1222', light: '#7f96d4', lightI: 0.75, hemiSky: '#2c3d75', hemiGround: '#0b0b12', hemiI: 1.0, cloudLit: '#1a2238', cloudDark: '#070a12', exposure: 1.35 },
  { e: -0.12, zenith: '#0c1230', horizon: '#3a3254', light: '#8a8fd0', lightI: 0.6, hemiSky: '#3a3c70', hemiGround: '#120e16', hemiI: 0.95, cloudLit: '#4a3a5e', cloudDark: '#141228', exposure: 1.3 },
  { e: -0.02, zenith: '#26346a', horizon: '#d87a5c', light: '#ff7a3c', lightI: 0.9, hemiSky: '#7d6f9e', hemiGround: '#2a1c1c', hemiI: 0.95, cloudLit: '#ff8f6a', cloudDark: '#3a2a48', exposure: 1.2 },
  { e: 0.1, zenith: '#3b63a8', horizon: '#f2b682', light: '#ffbd80', lightI: 2.2, hemiSky: '#9fb0d0', hemiGround: '#4a3a2c', hemiI: 1.3, cloudLit: '#ffe0bc', cloudDark: '#8a7a8e', exposure: 1.15 },
  { e: 0.35, zenith: '#2c66bd', horizon: '#b8d2e8', light: '#fff1dc', lightI: 3.0, hemiSky: '#b8d0ee', hemiGround: '#5a5040', hemiI: 1.3, cloudLit: '#ffffff', cloudDark: '#a8b4c4', exposure: 0.95 },
  { e: 1.0, zenith: '#245cb0', horizon: '#aecbe6', light: '#fff6ea', lightI: 3.2, hemiSky: '#c0d6f0', hemiGround: '#5a5040', hemiI: 1.3, cloudLit: '#ffffff', cloudDark: '#b0bccb', exposure: 0.9 },
].map((k) => {
  const o = { e: k.e, lightI: k.lightI, hemiI: k.hemiI, exposure: k.exposure };
  for (const name of ['zenith', 'horizon', 'light', 'hemiSky', 'hemiGround', 'cloudLit', 'cloudDark']) {
    o[name] = new THREE.Color(k[name]);
  }
  return o;
});

const COLOR_KEYS = ['zenith', 'horizon', 'light', 'hemiSky', 'hemiGround', 'cloudLit', 'cloudDark'];
const NUM_KEYS = ['lightI', 'hemiI', 'exposure'];

function samplePalette(e, out) {
  let a = KEYS[0];
  let b = KEYS[KEYS.length - 1];
  if (e <= a.e) b = a;
  else if (e >= b.e) a = b;
  else {
    for (let i = 0; i < KEYS.length - 1; i++) {
      if (e >= KEYS[i].e && e <= KEYS[i + 1].e) {
        a = KEYS[i];
        b = KEYS[i + 1];
        break;
      }
    }
  }
  const t = a === b ? 0 : (e - a.e) / (b.e - a.e);
  for (const k of COLOR_KEYS) {
    out[k] = out[k] || new THREE.Color();
    out[k].copy(a[k]).lerp(b[k], t);
  }
  for (const k of NUM_KEYS) out[k] = a[k] + (b[k] - a[k]) * t;
  return out;
}

export class Environment {
  constructor(scene, renderer) {
    this.scene = scene;
    this.renderer = renderer;

    this.sun = new THREE.DirectionalLight(0xffffff, 3);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera;
    sc.left = -90;
    sc.right = 90;
    sc.top = 90;
    sc.bottom = -90;
    sc.near = 1;
    sc.far = 800;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.6;
    scene.add(this.sun, this.sun.target);

    this.hemi = new THREE.HemisphereLight(0xb8d0ee, 0x5a5040, 1);
    scene.add(this.hemi);

    scene.fog = new THREE.FogExp2(0xb4cbdc, 0.0011);

    this.uniforms = {
      uZenith: { value: new THREE.Color() },
      uHorizon: { value: new THREE.Color() },
      uSunDir: { value: new THREE.Vector3() },
      uSunColor: { value: new THREE.Color() },
      uMoonDir: { value: new THREE.Vector3() },
      uCloudLit: { value: new THREE.Color() },
      uCloudDark: { value: new THREE.Color() },
      uNight: { value: 0 },
      uCloud: { value: 0 },
      uTime: { value: 0 },
      uLightning: { value: 0 },
    };
    const dome = new THREE.Mesh(
      new THREE.SphereGeometry(4000, 48, 24),
      new THREE.ShaderMaterial({
        uniforms: this.uniforms,
        vertexShader: skyVertex,
        fragmentShader: skyFragment,
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
      }),
    );
    dome.frustumCulled = false;
    dome.renderOrder = -10;
    this.dome = dome;
    scene.add(dome);

    this.pal = {};
    this.state = {
      sunDir: new THREE.Vector3(),
      moonDir: new THREE.Vector3(),
      lightDir: new THREE.Vector3(),
      lightColor: new THREE.Color(),
      fogColor: new THREE.Color(),
      night: 0,
      day: 1,
      ambient: 1,
      elevation: 0,
    };
    this._grey = new THREE.Color();
  }

  // hours: 0..24, weather: current blended weather params, center: focus point for shadows.
  update(hours, weather, time, center, cameraPos) {
    const S = this.state;
    const theta = ((hours - 6) / 24) * Math.PI * 2;
    S.sunDir.set(-Math.cos(theta), Math.sin(theta) * 0.8, -0.45).normalize();
    S.moonDir.set(Math.cos(theta), -Math.sin(theta) * 0.8, -0.45).normalize();
    const e = S.sunDir.y;
    S.elevation = e;
    const pal = samplePalette(e, this.pal);
    const cloud = weather.cloud;

    S.night = smoothstep(0.04, -0.16, e);
    S.day = smoothstep(-0.05, 0.2, e);

    const useSun = e > -0.06;
    S.lightDir.copy(useSun ? S.sunDir : S.moonDir);
    const switchFade = smoothstep(0.0, 0.06, Math.abs(e + 0.06));

    // Overcast desaturates everything toward a cool grey of the same brightness.
    const greyOf = (c, k) => {
      const l = c.r * 0.3 + c.g * 0.55 + c.b * 0.15;
      this._grey.setRGB(l * 0.92, l * 0.97, l * 1.05);
      return c.lerp(this._grey, k);
    };

    const fogColor = greyOf(S.fogColor.copy(pal.horizon), cloud * 0.75).multiplyScalar(1 - cloud * 0.5);
    greyOf(this.uniforms.uZenith.value.copy(pal.zenith), cloud * 0.85).multiplyScalar(1 - cloud * 0.45);

    this.sun.color.copy(pal.light);
    S.lightColor.copy(pal.light);
    this.sun.intensity = pal.lightI * switchFade * (1 - cloud * 0.72);
    this.sun.position.copy(center).addScaledVector(S.lightDir, 350);
    this.sun.target.position.copy(center);
    this.sun.castShadow = this.sun.intensity > 0.15;

    this.hemi.color.copy(pal.hemiSky);
    greyOf(this.hemi.color, cloud * 0.6);
    this.hemi.groundColor.copy(pal.hemiGround);
    this.hemi.intensity = pal.hemiI * (1 - cloud * 0.25) + weather.lightning * 4;
    S.ambient = clamp(pal.hemiI * 0.6 + pal.lightI * 0.12, 0, 1.2) * (1 - cloud * 0.3);

    this.scene.fog.color.copy(fogColor);
    this.scene.fog.density = 0.00105 * weather.fogMul * (1 + S.night * 0.15);

    const u = this.uniforms;
    u.uHorizon.value.copy(fogColor);
    u.uSunDir.value.copy(S.sunDir);
    u.uSunColor.value.copy(pal.light).multiplyScalar(smoothstep(-0.08, 0.02, e));
    u.uMoonDir.value.copy(S.moonDir);
    u.uCloudLit.value.copy(pal.cloudLit);
    greyOf(u.uCloudLit.value, cloud * 0.7).multiplyScalar(1 - cloud * 0.45);
    u.uCloudDark.value.copy(pal.cloudDark).multiplyScalar(1 - cloud * 0.3);
    u.uNight.value = S.night;
    u.uCloud.value = cloud;
    u.uTime.value = time;
    u.uLightning.value = weather.lightning;
    this.dome.position.copy(cameraPos);

    this.renderer.toneMappingExposure = pal.exposure * (1 + cloud * 0.12);
    return S;
  }
}
