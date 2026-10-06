import * as THREE from 'three';
import { fbm, smoothstep, clamp } from './noise.js';

// Height field: river channel carved along the loop, soft banks, then forested
// mountains rising away from the water.
export function makeHeightField(river, noise) {
  function info(x, z) {
    const { d, w, u } = river.nearest(x, z);
    let h;
    if (d < w) {
      const t = d / w;
      h = -3.4 * (1 - t * t) - 0.35;
    } else {
      h = -0.35 + smoothstep(w, w + 7, d) * 1.95;
    }
    const n1 = fbm(noise, x * 0.0035, z * 0.0035, 5) * 0.5 + 0.5;
    const ridge = 1 - Math.abs(noise(x * 0.006 + 31, z * 0.006 - 7));
    const hillT = smoothstep(w + 18, w + 240, d);
    h += Math.pow(hillT, 1.6) * (40 + 150 * n1 + 40 * ridge * ridge);
    const near = smoothstep(w + 5, w + 30, d);
    h += near * (noise(x * 0.025, z * 0.025) * 1.8 + noise(x * 0.07, z * 0.07) * 0.5);
    return { h, d, w, u };
  }
  const height = (x, z) => info(x, z).h;
  return { info, height };
}

export function createTerrain(field, noise) {
  const SIZE = 1500;
  const SEG = 300;
  const geo = new THREE.PlaneGeometry(SIZE, SIZE, SEG, SEG);
  geo.rotateX(-Math.PI / 2);

  const pos = geo.attributes.position;
  const count = pos.count;
  const dist = new Float32Array(count);
  const widths = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const r = field.info(x, z);
    pos.setY(i, r.h);
    dist[i] = r.d;
    widths[i] = r.w;
  }
  geo.computeVertexNormals();

  const nrm = geo.attributes.normal;
  const colors = new Float32Array(count * 3);
  const cGrass = new THREE.Color('#6a7a44');
  const cGrass2 = new THREE.Color('#4b5e35');
  const cForest = new THREE.Color('#2c3f2a');
  const cForest2 = new THREE.Color('#3a4a30');
  const cRock = new THREE.Color('#77716a');
  const cMud = new THREE.Color('#6e604a');
  const cBed = new THREE.Color('#4a4436');
  const cPink = new THREE.Color('#d8a3b0');
  const c = new THREE.Color();
  const tmp = new THREE.Color();

  for (let i = 0; i < count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const h = pos.getY(i);
    const d = dist[i];
    const w = widths[i];
    const slope = 1 - nrm.getY(i);
    const n = noise(x * 0.02, z * 0.02) * 0.5 + 0.5;
    const n2 = noise(x * 0.11 + 40, z * 0.11) * 0.5 + 0.5;

    c.copy(cGrass).lerp(cGrass2, n * 0.8);
    const forest = smoothstep(18, 60, h);
    tmp.copy(cForest).lerp(cForest2, n2);
    c.lerp(tmp, forest * 0.9);
    c.lerp(cRock, smoothstep(0.3, 0.55, slope) * 0.85);
    // Pink petal carpet along the banks.
    const pinkBand = smoothstep(w + 2, w + 6, d) * (1 - smoothstep(w + 30, w + 60, d));
    c.lerp(cPink, pinkBand * smoothstep(0.45, 0.85, n2) * 0.45);
    // Mud at the waterline, darker river bed below.
    c.lerp(cMud, 1 - smoothstep(w - 1, w + 4, d));
    if (h < -0.4) c.lerp(cBed, clamp((-0.4 - h) / 2, 0, 1));
    // Subtle variation so it never looks flat.
    c.multiplyScalar(0.9 + n2 * 0.2);
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 });
  // Procedural detail so close-up ground reads as grass and soil, not flat paint.
  mat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec3 vWPos;
        float th(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float tn(vec2 p) {
          vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(th(i), th(i + vec2(1.0, 0.0)), f.x), mix(th(i + vec2(0.0, 1.0)), th(i + 1.0), f.x), f.y);
        }`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        float dn = tn(vWPos.xz * 0.3) * 0.45 + tn(vWPos.xz * 1.6) * 0.35 + tn(vWPos.xz * 7.0) * 0.2;
        diffuseColor.rgb *= 0.74 + 0.48 * dn;`,
      );
  };
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  mesh.name = 'terrain';
  return mesh;
}

// Layered silhouettes far beyond the playable valley, faded by fog like ink wash.
export function createDistantMountains(noise) {
  const group = new THREE.Group();
  const layers = [
    { r: 820, base: 90, amp: 170, color: '#4a5a52' },
    { r: 1050, base: 140, amp: 260, color: '#5d6b70' },
    { r: 1350, base: 200, amp: 380, color: '#7a8590' },
  ];
  const mats = [];
  layers.forEach((L, li) => {
    const SEG = 220;
    const positions = [];
    const indices = [];
    for (let i = 0; i <= SEG; i++) {
      const a = (i / SEG) * Math.PI * 2;
      const cx = Math.cos(a);
      const sz = Math.sin(a);
      const n = fbm(noise, cx * 3.1 + li * 10, sz * 3.1 - li * 7, 5) * 0.5 + 0.5;
      const peak = Math.pow(n, 1.6);
      const top = L.base + L.amp * peak;
      positions.push(cx * L.r, -40, sz * L.r);
      positions.push(cx * (L.r - 60 * peak), top, sz * (L.r - 60 * peak));
      if (i < SEG) {
        const b = i * 2;
        indices.push(b, b + 2, b + 1, b + 1, b + 2, b + 3);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setIndex(indices);
    const mat = new THREE.MeshBasicMaterial({ color: L.color, side: THREE.DoubleSide, fog: true });
    mat.userData.base = new THREE.Color(L.color);
    mats.push(mat);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = false;
    group.add(mesh);
  });
  group.userData.mats = mats;
  return group;
}
