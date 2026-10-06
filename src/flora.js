import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { mulberry32 } from './noise.js';

const Y = new THREE.Vector3(0, 1, 0);

// Shared wind uniforms: vertices sway proportionally to their local height.
export const windUniforms = { uTime: { value: 0 }, uWind: { value: 0.5 } };

export function addWind(material, strength) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = windUniforms.uTime;
    shader.uniforms.uWind = windUniforms.uWind;
    shader.vertexShader =
      'uniform float uTime;\nuniform float uWind;\n' +
      shader.vertexShader.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        #ifdef USE_INSTANCING
          vec3 ip = vec3(instanceMatrix[3].x, 0.0, instanceMatrix[3].z);
        #else
          vec3 ip = vec3(0.0);
        #endif
        float sw = max(position.y, 0.0) * ${strength.toFixed(4)} * uWind;
        float ph = uTime * 1.6 + ip.x * 0.13 + ip.z * 0.07;
        transformed.x += (sin(ph) + 0.35 * sin(ph * 2.7 + 1.3)) * sw;
        transformed.z += cos(ph * 0.8 + ip.z * 0.05) * sw * 0.6;`,
      );
  };
  material.customProgramCacheKey = () => 'wind' + strength;
  return material;
}

function cylinderBetween(a, b, r0, r1, seg = 6) {
  const dir = new THREE.Vector3().subVectors(b, a);
  const len = dir.length();
  const g = new THREE.CylinderGeometry(r1, r0, len, seg, 1);
  g.translate(0, len / 2, 0);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(Y, dir.normalize()));
  g.translate(a.x, a.y, a.z);
  return g;
}

function paint(geo, fn) {
  const pos = geo.attributes.position;
  const col = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    fn(c, pos.getX(i), pos.getY(i), pos.getZ(i), i);
    col[i * 3] = c.r;
    col[i * 3 + 1] = c.g;
    col[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return geo;
}

function blob(radius, squash, seed) {
  let g = new THREE.IcosahedronGeometry(radius, 2);
  g.deleteAttribute('normal');
  g.deleteAttribute('uv');
  g = mergeVertices(g);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    const z = p.getZ(i);
    const k =
      1 +
      0.22 * Math.sin(x * 2.3 + seed) * Math.cos(z * 2.1 - seed) +
      0.12 * Math.sin(y * 4.1 + seed * 2.0);
    p.setXYZ(i, x * k, y * k * squash, z * k);
  }
  g.computeVertexNormals();
  return g;
}

const PINKS = ['#fbd3dc', '#f6b4c4', '#f2a0b6', '#fde6ec'].map((c) => new THREE.Color(c));
const BARK = new THREE.Color('#3b2a24');

function sakuraVariant(rand) {
  const trunks = [];
  const blooms = [];
  const h = 3.0 + rand() * 1.6;
  const lean = (rand() - 0.5) * 0.9;
  const base = new THREE.Vector3(0, -0.4, 0);
  const top = new THREE.Vector3(lean, h, lean * 0.4);
  trunks.push(cylinderBetween(base, top, 0.5, 0.28, 7));

  const nb = 4 + Math.floor(rand() * 3);
  for (let b = 0; b < nb; b++) {
    const ang = (b / nb) * Math.PI * 2 + rand() * 0.7;
    const up = 0.35 + rand() * 0.6;
    const len = 2.4 + rand() * 2.0;
    const dir = new THREE.Vector3(Math.cos(ang), up, Math.sin(ang)).normalize();
    const start = top.clone().add(new THREE.Vector3(0, -rand() * 1.2, 0));
    const mid = start.clone().addScaledVector(dir, len * 0.55);
    mid.y += 0.3;
    const end = start.clone().addScaledVector(dir, len);
    end.y -= rand() * 0.6; // slight droop
    trunks.push(cylinderBetween(start, mid, 0.22, 0.14, 5));
    trunks.push(cylinderBetween(mid, end, 0.14, 0.06, 5));
    const r = 1.3 + rand() * 0.9;
    blooms.push(blob(r, 0.72, rand() * 10).translate(end.x, end.y + 0.3, end.z));
    if (rand() > 0.35) {
      const r2 = 0.9 + rand() * 0.6;
      blooms.push(blob(r2, 0.75, rand() * 10).translate(mid.x, mid.y + 0.5, mid.z));
    }
  }
  blooms.push(blob(2.0 + rand() * 0.6, 0.7, rand() * 10).translate(top.x, top.y + 1.1, top.z));

  const trunkGeo = paint(mergeGeometries(trunks), (c) => c.copy(BARK));
  const bloomGeo = mergeGeometries(blooms);
  const tint = PINKS[Math.floor(rand() * PINKS.length)];
  bloomGeo.computeBoundingBox();
  const minY = bloomGeo.boundingBox.min.y;
  const maxY = bloomGeo.boundingBox.max.y;
  paint(bloomGeo, (c, x, y, z) => {
    const t = (y - minY) / (maxY - minY);
    const n = Math.sin(x * 3.1) * Math.cos(z * 2.7) * 0.5 + 0.5;
    c.copy(PINKS[(Math.floor(n * 3.99) + 1) % 4]).lerp(tint, 0.4);
    c.multiplyScalar(0.62 + 0.48 * t);
  });
  return { trunkGeo, bloomGeo };
}

function sugiGeometry(rand) {
  const parts = [];
  const h = 9 + rand() * 6;
  const trunk = new THREE.CylinderGeometry(0.25, 0.45, h * 0.5, 6);
  trunk.translate(0, h * 0.25 - 0.5, 0);
  paint(trunk, (c) => c.set('#3a2a20'));
  parts.push(trunk);
  const tiers = 4;
  for (let i = 0; i < tiers; i++) {
    const t = i / tiers;
    const r = (2.6 - t * 1.6) * (0.9 + rand() * 0.2);
    const ch = h * 0.42;
    const cone = new THREE.ConeGeometry(r, ch, 7, 1);
    cone.translate(0, h * 0.25 + t * h * 0.55 + ch * 0.5, 0);
    paint(cone, (c, x, y) => {
      c.set(i % 2 ? '#2c4a2c' : '#24402a');
      c.multiplyScalar(0.7 + 0.3 * ((y - h * 0.25) / h));
    });
    parts.push(cone);
  }
  // Faceted look via per-face normals (cheaper and safer than material.flatShading).
  const geo = mergeGeometries(parts).toNonIndexed();
  geo.computeVertexNormals();
  return geo;
}

function reedGeometry(rand) {
  const parts = [];
  const blades = 7;
  for (let i = 0; i < blades; i++) {
    const hgt = 1.2 + rand() * 1.3;
    const g = new THREE.PlaneGeometry(0.07, hgt, 1, 4);
    g.translate(0, hgt / 2, 0);
    const p = g.attributes.position;
    const bend = (rand() - 0.2) * 0.5;
    for (let k = 0; k < p.count; k++) {
      const y = p.getY(k) / hgt;
      p.setZ(k, p.getZ(k) + bend * y * y);
    }
    g.rotateY(rand() * Math.PI);
    g.translate((rand() - 0.5) * 0.6, 0, (rand() - 0.5) * 0.6);
    parts.push(g);
  }
  const geo = mergeGeometries(parts);
  geo.computeBoundingBox();
  const maxY = geo.boundingBox.max.y;
  paint(geo, (c, x, y) => c.set('#4f6a2a').lerp(new THREE.Color('#b9a55a'), Math.pow(Math.max(0, y / maxY), 1.6)));
  geo.computeVertexNormals();
  return geo;
}

function rockGeometry() {
  let g = new THREE.DodecahedronGeometry(1, 1);
  g.deleteAttribute('normal');
  g.deleteAttribute('uv');
  g = mergeVertices(g);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    const z = p.getZ(i);
    const k = 1 + 0.18 * Math.sin(x * 4.0 + z * 3.0) + 0.1 * Math.cos(y * 5.0);
    p.setXYZ(i, x * k * 1.2, y * k * 0.65, z * k);
  }
  g = g.toNonIndexed();
  g.computeVertexNormals();
  return g;
}

function tooClose(x, z, exclusions) {
  for (const e of exclusions) {
    const dx = x - e.x;
    const dz = z - e.z;
    if (dx * dx + dz * dz < e.r * e.r) return true;
  }
  return false;
}

function slopeAt(field, x, z) {
  const hx = field.height(x + 1.5, z) - field.height(x - 1.5, z);
  const hz = field.height(x, z + 1.5) - field.height(x, z - 1.5);
  return Math.hypot(hx, hz) / 3;
}

export function createFlora(field, exclusions) {
  const rand = mulberry32(1337);
  const group = new THREE.Group();
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  const p = new THREE.Vector3();
  const euler = new THREE.Euler();

  // --- Sakura -------------------------------------------------------------
  const barkMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 });
  const bloomMat = addWind(
    new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75, emissive: '#3a1622', emissiveIntensity: 0.25 }),
    0.025,
  );
  const variants = [];
  for (let v = 0; v < 5; v++) variants.push(sakuraVariant(rand));
  const sakuraSpots = [];
  let tries = 0;
  while (sakuraSpots.length < 340 && tries < 20000) {
    tries++;
    const x = (rand() * 2 - 1) * 680;
    const z = (rand() * 2 - 1) * 680;
    const inf = field.info(x, z);
    const band = inf.d - inf.w;
    if (band < 5 || band > 90) continue;
    // Dense along the water, thinning out up the slopes.
    const accept = band < 30 ? 1 : (0.5 * (90 - band)) / 60;
    if (rand() > accept) continue;
    if (tooClose(x, z, exclusions)) continue;
    if (slopeAt(field, x, z) > 0.6) continue;
    sakuraSpots.push({ x, z, y: inf.h });
  }
  const perVariant = variants.map(() => []);
  sakuraSpots.forEach((sp, i) => perVariant[i % variants.length].push(sp));
  variants.forEach((v, vi) => {
    const list = perVariant[vi];
    const trunks = new THREE.InstancedMesh(v.trunkGeo, barkMat, list.length);
    const blooms = new THREE.InstancedMesh(v.bloomGeo, bloomMat, list.length);
    list.forEach((sp, i) => {
      const sc = 0.8 + rand() * 0.6;
      euler.set(0, rand() * Math.PI * 2, 0);
      q.setFromEuler(euler);
      s.set(sc, sc * (0.9 + rand() * 0.2), sc);
      p.set(sp.x, sp.y, sp.z);
      m.compose(p, q, s);
      trunks.setMatrixAt(i, m);
      blooms.setMatrixAt(i, m);
    });
    trunks.castShadow = blooms.castShadow = true;
    trunks.receiveShadow = blooms.receiveShadow = true;
    group.add(trunks, blooms);
  });

  // --- Sugi (cedar) forest on the hills -------------------------------------
  const sugiGeos = [sugiGeometry(rand), sugiGeometry(rand), sugiGeometry(rand)];
  const sugiMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 });
  const sugiSpots = [];
  tries = 0;
  while (sugiSpots.length < 1500 && tries < 40000) {
    tries++;
    const x = (rand() * 2 - 1) * 740;
    const z = (rand() * 2 - 1) * 740;
    const inf = field.info(x, z);
    const band = inf.d - inf.w;
    if (band < 28) continue;
    if (inf.h > 200) continue;
    if (tooClose(x, z, exclusions)) continue;
    if (slopeAt(field, x, z) > 1.1) continue;
    sugiSpots.push({ x, z, y: inf.h });
  }
  sugiGeos.forEach((g, gi) => {
    const list = sugiSpots.filter((_, i) => i % 3 === gi);
    const mesh = new THREE.InstancedMesh(g, sugiMat, list.length);
    list.forEach((sp, i) => {
      const sc = 0.8 + rand() * 0.9;
      euler.set((rand() - 0.5) * 0.08, rand() * Math.PI * 2, (rand() - 0.5) * 0.08);
      q.setFromEuler(euler);
      s.set(sc, sc * (0.85 + rand() * 0.4), sc);
      p.set(sp.x, sp.y, sp.z);
      m.compose(p, q, s);
      mesh.setMatrixAt(i, m);
    });
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  });

  // --- Reeds at the waterline -----------------------------------------------
  const reedGeo = reedGeometry(rand);
  const reedMat = addWind(
    new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, side: THREE.DoubleSide }),
    0.12,
  );
  const reedSpots = [];
  tries = 0;
  while (reedSpots.length < 1600 && tries < 60000) {
    tries++;
    const x = (rand() * 2 - 1) * 680;
    const z = (rand() * 2 - 1) * 680;
    const inf = field.info(x, z);
    const band = inf.d - inf.w;
    if (band < -2.6 || band > 2.5) continue;
    if (tooClose(x, z, exclusions)) continue;
    reedSpots.push({ x, z, y: Math.max(inf.h, -1.2) });
  }
  const reeds = new THREE.InstancedMesh(reedGeo, reedMat, reedSpots.length);
  reedSpots.forEach((sp, i) => {
    const sc = 0.8 + rand() * 0.7;
    euler.set(0, rand() * Math.PI * 2, 0);
    q.setFromEuler(euler);
    s.set(sc, sc, sc);
    p.set(sp.x, sp.y, sp.z);
    m.compose(p, q, s);
    reeds.setMatrixAt(i, m);
  });
  reeds.receiveShadow = true;
  group.add(reeds);

  // --- Rocks ------------------------------------------------------------------
  const rockMat = new THREE.MeshStandardMaterial({ color: '#7d7870', roughness: 0.92 });
  const rockSpots = [];
  tries = 0;
  while (rockSpots.length < 420 && tries < 30000) {
    tries++;
    const x = (rand() * 2 - 1) * 700;
    const z = (rand() * 2 - 1) * 700;
    const inf = field.info(x, z);
    const band = inf.d - inf.w;
    const nearBank = band > -1.5 && band < 5;
    if (!nearBank) continue;
    if (tooClose(x, z, exclusions)) continue;
    rockSpots.push({ x, z, y: inf.h, big: !nearBank });
  }
  const rocks = new THREE.InstancedMesh(rockGeometry(), rockMat, rockSpots.length);
  const rc = new THREE.Color();
  rockSpots.forEach((sp, i) => {
    const sc = sp.big ? 1.5 + rand() * 2.5 : 0.4 + rand() * 1.3;
    euler.set(rand() * 0.4, rand() * Math.PI * 2, rand() * 0.4);
    q.setFromEuler(euler);
    s.set(sc, sc, sc);
    p.set(sp.x, sp.y - sc * (sp.big ? 0.45 : 0.2), sp.z);
    m.compose(p, q, s);
    rocks.setMatrixAt(i, m);
    rc.setHSL(0.08, 0.05 + rand() * 0.06, 0.38 + rand() * 0.2);
    rocks.setColorAt(i, rc);
  });
  rocks.castShadow = true;
  rocks.receiveShadow = true;
  group.add(rocks);

  return group;
}
