import * as THREE from 'three';
import { Water } from 'three/addons/objects/Water.js';
import { mulberry32 } from './noise.js';

// Tileable normal map generated from integer-frequency sine waves, so no image
// asset is needed and it repeats seamlessly.
function makeWaterNormals(size = 256) {
  const rand = mulberry32(7);
  const waves = [];
  for (let i = 0; i < 30; i++) {
    let kx = 0;
    let ky = 0;
    while (kx === 0 && ky === 0) {
      kx = Math.round((rand() * 2 - 1) * 12);
      ky = Math.round((rand() * 2 - 1) * 12);
    }
    const k = Math.hypot(kx, ky);
    waves.push({ kx, ky, a: 1 / Math.pow(k, 1.2), p: rand() * Math.PI * 2 });
  }
  const data = new Uint8Array(size * size * 4);
  const TAU = Math.PI * 2;
  const strength = 1.6;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let dx = 0;
      let dy = 0;
      for (const w of waves) {
        const ph = (TAU * (w.kx * x + w.ky * y)) / size + w.p;
        const c = Math.cos(ph) * w.a;
        dx += c * w.kx;
        dy += c * w.ky;
      }
      let nx = -dx * strength * 0.1;
      let ny = -dy * strength * 0.1;
      let nz = 1;
      const l = Math.hypot(nx, ny, nz);
      nx /= l;
      ny /= l;
      nz /= l;
      const o = (y * size + x) * 4;
      data[o] = (nx * 0.5 + 0.5) * 255;
      data[o + 1] = (ny * 0.5 + 0.5) * 255;
      data[o + 2] = (nz * 0.5 + 0.5) * 255;
      data[o + 3] = 255;
    }
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.needsUpdate = true;
  return tex;
}

export function createWater() {
  const water = new Water(new THREE.PlaneGeometry(1700, 1700), {
    textureWidth: 512,
    textureHeight: 512,
    waterNormals: makeWaterNormals(),
    sunDirection: new THREE.Vector3(0, 1, 0),
    sunColor: 0xffffff,
    waterColor: 0x1d3836,
    distortionScale: 1.2,
    fog: true,
  });
  water.rotation.x = -Math.PI / 2;
  water.position.y = 0;
  water.material.uniforms.size.value = 4.5;
  water.name = 'water';
  return water;
}
