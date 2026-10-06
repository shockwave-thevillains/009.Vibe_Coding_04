import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { mulberry32 } from './noise.js';

// Collects transformed primitives per material and merges them into a handful of
// meshes, so hundreds of beams and posts cost only a few draw calls.
class Builder {
  constructor() {
    this.parts = new Map();
    this.base = new THREE.Matrix4();
    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._e = new THREE.Euler();
    this._p = new THREE.Vector3();
    this._s = new THREE.Vector3();
  }
  setBase(x, y, z, yaw = 0) {
    this.base.compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, 0)), new THREE.Vector3(1, 1, 1));
  }
  add(mat, geo, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
    this._e.set(rx, ry, rz);
    this._q.setFromEuler(this._e);
    this._m.compose(this._p.set(x, y, z), this._q, this._s.set(sx, sy, sz));
    const g = geo.clone().applyMatrix4(this._m).applyMatrix4(this.base);
    if (!this.parts.has(mat)) this.parts.set(mat, []);
    this.parts.get(mat).push(g);
  }
  build() {
    const group = new THREE.Group();
    for (const [mat, geos] of this.parts) {
      const mesh = new THREE.Mesh(mergeGeometries(geos), mat);
      mesh.castShadow = !mat.userData.noShadow;
      mesh.receiveShadow = true;
      group.add(mesh);
    }
    return group;
  }
}

// Concave hip roof with up-turned corners (the classic Japanese eave sweep).
function roofGeometry(halfX, halfZ, h, lift = 0.55) {
  const g = new THREE.PlaneGeometry(2, 2, 22, 22);
  g.rotateX(-Math.PI / 2);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const a = p.getX(i);
    const b = p.getZ(i);
    const r = Math.max(Math.abs(a), Math.abs(b));
    const y = h * Math.pow(1 - r, 1.7) + h * lift * Math.pow(r, 3) * Math.pow(Math.abs(a * b), 0.8);
    p.setXYZ(i, a * halfX, y, b * halfZ);
  }
  g.computeVertexNormals();
  return g;
}

const BOX = new THREE.BoxGeometry(1, 1, 1);
const CYL = new THREE.CylinderGeometry(1, 1, 1, 10);
const CYL6 = new THREE.CylinderGeometry(1, 1, 1, 6);
const SPH = new THREE.SphereGeometry(1, 12, 8);
const CONE = new THREE.ConeGeometry(1, 1, 10);

export function createStructures(river, field) {
  const rand = mulberry32(99);
  const B = new Builder();
  const exclusions = [];
  const F = {};

  const mats = {
    red: new THREE.MeshStandardMaterial({ color: '#c23a1e', roughness: 0.55 }),
    black: new THREE.MeshStandardMaterial({ color: '#1d1b1c', roughness: 0.6 }),
    wood: new THREE.MeshStandardMaterial({ color: '#5a3f2b', roughness: 0.85 }),
    darkWood: new THREE.MeshStandardMaterial({ color: '#33241b', roughness: 0.85 }),
    plaster: new THREE.MeshStandardMaterial({ color: '#ece5d6', roughness: 0.9 }),
    stone: new THREE.MeshStandardMaterial({ color: '#8e8a80', roughness: 0.95 }),
    tile: new THREE.MeshStandardMaterial({ color: '#3a3d45', roughness: 0.7, side: THREE.DoubleSide }),
    gold: new THREE.MeshStandardMaterial({ color: '#c9a23a', roughness: 0.35, metalness: 0.8 }),
    rope: new THREE.MeshStandardMaterial({ color: '#d8c79a', roughness: 0.9 }),
  };
  const glow = {
    lantern: new THREE.MeshStandardMaterial({ color: '#ffe2b0', emissive: '#ff9a3c', emissiveIntensity: 0.1, roughness: 0.6 }),
    window: new THREE.MeshStandardMaterial({ color: '#efe3c4', emissive: '#ffb45a', emissiveIntensity: 0.05, roughness: 0.8 }),
    chochin: new THREE.MeshStandardMaterial({ color: '#d63a2a', emissive: '#ff4a22', emissiveIntensity: 0.1, roughness: 0.6 }),
  };
  for (const g of Object.values(glow)) g.userData.noShadow = true;

  function bank(u, side, dist) {
    river.frame(u, F);
    const x = F.pos.x + F.nor.x * side * dist;
    const z = F.pos.z + F.nor.z * side * dist;
    return {
      x,
      z,
      y: field.height(x, z),
      yaw: Math.atan2(-F.nor.x * side, -F.nor.z * side),
      w: F.w,
      pos: F.pos.clone(),
      tan: F.tan.clone(),
      nor: F.nor.clone(),
    };
  }

  // ---------------- Taikobashi (arched vermilion bridge) -------------------
  function taikobashi(u) {
    river.frame(u, F);
    const span = F.w * 2 + 16;
    const width = 3.6;
    // local X runs across the river (along the normal)
    const yaw = Math.atan2(-F.nor.z, F.nor.x);
    B.setBase(F.pos.x, 0, F.pos.z, yaw);
    const yAt = (x) => 1.3 + 6.0 * (1 - Math.pow((2 * x) / span, 2));
    const segs = 30;
    for (let i = 0; i < segs; i++) {
      const x0 = -span / 2 + (i * span) / segs;
      const x1 = x0 + span / segs;
      const y0 = yAt(x0);
      const y1 = yAt(x1);
      const mx = (x0 + x1) / 2;
      const my = (y0 + y1) / 2;
      const len = Math.hypot(x1 - x0, y1 - y0) * 1.04;
      const ang = Math.atan2(y1 - y0, x1 - x0);
      B.add(mats.wood, BOX, mx, my, 0, 0, 0, ang, len, 0.3, width);
      for (const sz of [-1, 1]) {
        B.add(mats.red, BOX, mx, my - 0.28, sz * (width / 2), 0, 0, ang, len, 0.65, 0.2);
        B.add(mats.red, BOX, mx, my + 1.05, sz * (width / 2 - 0.08), 0, 0, ang, len, 0.13, 0.16);
        B.add(mats.red, BOX, mx, my + 0.55, sz * (width / 2 - 0.08), 0, 0, ang, len, 0.09, 0.1);
        if (i % 3 === 0 || i === segs - 1) {
          const px = i === segs - 1 ? x1 : x0;
          const py = yAt(px);
          B.add(mats.red, BOX, px, py + 0.55, sz * (width / 2 - 0.08), 0, 0, 0, 0.2, 1.15, 0.2);
          if (i === 0 || i === segs - 1 || i === 15) {
            B.add(mats.gold, SPH, px, py + 1.3, sz * (width / 2 - 0.08), 0, 0, 0, 0.17, 0.2, 0.17);
            B.add(mats.gold, CONE, px, py + 1.55, sz * (width / 2 - 0.08), 0, 0, 0, 0.08, 0.25, 0.08);
          }
        }
      }
    }
    // Piers
    for (const px of [-(F.w - 1.5), F.w - 1.5]) {
      const top = yAt(px) - 0.4;
      for (const sz of [-1, 1]) {
        B.add(mats.red, CYL, px, (top - 4) / 2, sz * (width / 2 - 0.4), 0, 0, 0, 0.2, top + 4, 0.2);
      }
      B.add(mats.red, BOX, px, top - 0.8, 0, 0, 0, 0, 0.3, 0.3, width);
      B.add(mats.black, CYL, px, 0.2, -(width / 2 - 0.4), 0, 0, 0, 0.24, 0.5, 0.24);
      B.add(mats.black, CYL, px, 0.2, width / 2 - 0.4, 0, 0, 0, 0.24, 0.5, 0.24);
    }
    // Stone abutments
    for (const sx of [-1, 1]) {
      B.add(mats.stone, BOX, sx * (span / 2 + 1.5), 0.6, 0, 0, 0, 0, 4, 2.4, width + 1.2);
    }
    for (const sx of [-1, 1]) {
      const x = F.pos.x + F.nor.x * sx * (span / 2 + 2);
      const z = F.pos.z + F.nor.z * sx * (span / 2 + 2);
      exclusions.push({ x, z, r: 9 });
    }
  }

  // ---------------- Five-storey pagoda --------------------------------------
  function pagoda(u, side, dist) {
    const b = bank(u, side, dist);
    let y0 = Infinity;
    for (let a = 0; a < 6; a++) {
      const ang = (a / 6) * Math.PI * 2;
      y0 = Math.min(y0, field.height(b.x + Math.cos(ang) * 6, b.z + Math.sin(ang) * 6));
    }
    B.setBase(b.x, y0, b.z, b.yaw);
    B.add(mats.stone, BOX, 0, 0.2, 0, 0, 0, 0, 12, 2.4, 12);
    B.add(mats.stone, BOX, 0, 1.6, 0, 0, 0, 0, 10, 0.6, 10);
    B.add(mats.stone, BOX, 0, 0.8, 8, 0, 0, 0, 3, 0.4, 5); // steps
    let y = 1.9;
    for (let i = 0; i < 5; i++) {
      const s = 7.2 - i * 0.95;
      const bodyH = i === 0 ? 3.2 : 2.3;
      B.add(mats.plaster, BOX, 0, y + bodyH / 2, 0, 0, 0, 0, s, bodyH, s);
      for (const cx of [-1, 1])
        for (const cz of [-1, 1]) B.add(mats.red, CYL6, (cx * s) / 2, y + bodyH / 2, (cz * s) / 2, 0, 0, 0, 0.18, bodyH, 0.18);
      // doors/frames on each face
      for (let f = 0; f < 4; f++) {
        const ang = (f * Math.PI) / 2;
        const fx = Math.sin(ang) * (s / 2 + 0.02);
        const fz = Math.cos(ang) * (s / 2 + 0.02);
        B.add(mats.red, BOX, fx, y + bodyH * 0.45, fz, 0, ang, 0, s * 0.42, bodyH * 0.75, 0.06);
        B.add(mats.darkWood, BOX, fx * 1.004, y + bodyH * 0.45, fz * 1.004, 0, ang, 0, s * 0.3, bodyH * 0.6, 0.06);
      }
      B.add(mats.red, BOX, 0, y + bodyH - 0.15, 0, 0, 0, 0, s + 0.3, 0.3, s + 0.3);
      B.add(mats.darkWood, BOX, 0, y + bodyH + 0.15, 0, 0, 0, 0, s + 1.0, 0.4, s + 1.0);
      const half = s * 0.5 + 2.0;
      B.add(mats.tile, roofGeometry(half, half, 1.45), 0, y + bodyH + 0.3, 0);
      y += bodyH + 1.0;
    }
    B.add(mats.darkWood, BOX, 0, y + 0.1, 0, 0, 0, 0, 1.3, 0.6, 1.3);
    B.add(mats.gold, CYL, 0, y + 3.3, 0, 0, 0, 0, 0.12, 6.4, 0.12);
    const ring = new THREE.TorusGeometry(1, 0.22, 6, 16).rotateX(Math.PI / 2);
    for (let k = 0; k < 9; k++) {
      const r = 0.42 - k * 0.018;
      B.add(mats.gold, ring, 0, y + 1.0 + k * 0.42, 0, 0, 0, 0, r, r, r);
    }
    B.add(mats.gold, SPH, 0, y + 6.6, 0, 0, 0, 0, 0.26, 0.34, 0.26);
    exclusions.push({ x: b.x, z: b.z, r: 14 });
    return b;
  }

  // ---------------- Torii in the shallows + small shrine -------------------
  function torii(u, side) {
    const b = bank(u, side, b0(u) - 1.8);
    B.setBase(b.x, 0, b.z, b.yaw);
    const half = 3.8;
    const H = 9.5;
    for (const sx of [-1, 1]) {
      B.add(mats.red, CYL, sx * half, (H - 3.5) / 2, 0, 0, 0, sx * 0.03, 0.42, H + 3.5, 0.42);
      B.add(mats.black, CYL, sx * half, 0.3, 0, 0, 0, 0, 0.5, 1.2, 0.5);
    }
    B.add(mats.red, BOX, 0, H - 2.4, 0, 0, 0, 0, half * 2 + 2.2, 0.5, 0.5); // nuki
    B.add(mats.red, BOX, 0, H - 0.25, 0, 0, 0, 0, half * 2 + 3, 0.55, 0.85); // shimaki
    B.add(mats.black, BOX, 0, H + 0.3, 0, 0, 0, 0, half * 2 + 3.6, 0.5, 1.0); // kasagi
    for (const sx of [-1, 1]) {
      B.add(mats.black, BOX, sx * (half + 2.3), H + 0.45, 0, 0, 0, sx * 0.12, 1.5, 0.45, 1.0);
    }
    B.add(mats.red, BOX, 0, H - 1.3, 0, 0, 0, 0, 0.5, 1.6, 0.35); // gakuzuka
    B.add(mats.black, BOX, 0, H - 1.3, 0.2, 0, 0, 0, 0.9, 1.1, 0.06); // plaque

    // Shrine hall on the bank behind it
    const s = bank(u, side, b0(u) + 16);
    B.setBase(s.x, s.y, s.z, s.yaw);
    B.add(mats.stone, BOX, 0, 0.2, 0, 0, 0, 0, 10, 1.4, 8);
    B.add(mats.darkWood, BOX, 0, 1.0, 0, 0, 0, 0, 9, 0.3, 7);
    B.add(mats.plaster, BOX, 0, 2.6, 0, 0, 0, 0, 7.4, 3.0, 5.4);
    for (const cx of [-1, 1])
      for (const cz of [-1, 1]) B.add(mats.red, CYL6, cx * 3.7, 2.6, cz * 2.7, 0, 0, 0, 0.2, 3.0, 0.2);
    B.add(mats.red, BOX, 0, 2.3, 2.72, 0, 0, 0, 5.0, 2.4, 0.08);
    B.add(glow.window, BOX, 0, 2.3, 2.76, 0, 0, 0, 4.4, 1.9, 0.04);
    B.add(mats.darkWood, BOX, 0, 4.25, 0, 0, 0, 0, 8.4, 0.35, 6.4);
    B.add(mats.tile, roofGeometry(6.0, 5.0, 2.6, 0.4), 0, 4.4, 0);
    B.add(mats.gold, BOX, 0, 7.05, 0, 0, 0, 0, 1.2, 0.25, 0.25);
    exclusions.push({ x: s.x, z: s.z, r: 13 });
    exclusions.push({ x: b.x, z: b.z, r: 8 });
    // Stone path between shrine and water
    for (let k = 0; k < 5; k++) {
      const p = bank(u, side, b0(u) + 3 + k * 2.4);
      B.setBase(p.x, p.y, p.z, p.yaw);
      B.add(mats.stone, BOX, 0, 0.05, 0, 0, rand() * 0.3, 0, 2.2, 0.25, 1.8);
    }
    return b;
  }

  function b0(u) {
    return river.widthAt(((u % 1) + 1) % 1);
  }

  // ---------------- Stone lantern ------------------------------------------
  const lanternRoof = roofGeometry(0.62, 0.62, 0.38, 0.5);
  function toro(x, y, z, yaw) {
    B.setBase(x, y, z, yaw);
    B.add(mats.stone, CYL6, 0, 0.15, 0, 0, 0, 0, 0.5, 0.3, 0.5);
    B.add(mats.stone, CYL6, 0, 0.8, 0, 0, 0, 0, 0.17, 1.1, 0.17);
    B.add(mats.stone, BOX, 0, 1.42, 0, 0, 0, 0, 0.85, 0.16, 0.85);
    B.add(mats.stone, BOX, 0, 1.75, 0, 0, 0, 0, 0.6, 0.5, 0.2);
    B.add(mats.stone, BOX, 0, 1.75, 0, 0, 0, 0, 0.2, 0.5, 0.6);
    for (const cx of [-1, 1])
      for (const cz of [-1, 1]) B.add(mats.stone, BOX, cx * 0.24, 1.75, cz * 0.24, 0, 0, 0, 0.1, 0.5, 0.1);
    B.add(glow.lantern, BOX, 0, 1.75, 0, 0, 0, 0, 0.42, 0.36, 0.42);
    B.add(mats.stone, lanternRoof, 0, 2.0, 0);
    B.add(mats.stone, SPH, 0, 2.45, 0, 0, 0, 0, 0.13, 0.16, 0.13);
  }

  // ---------------- Machiya house ------------------------------------------
  function house(x, y, z, yaw, w, d) {
    B.setBase(x, y, z, yaw);
    B.add(mats.stone, BOX, 0, -0.3, 0, 0, 0, 0, w + 0.4, 1.2, d + 0.4);
    B.add(mats.darkWood, BOX, 0, 1.4, 0, 0, 0, 0, w, 2.6, d);
    B.add(mats.plaster, BOX, 0, 3.15, 0, 0, 0, 0, w - 0.1, 0.9, d - 0.1);
    // lattice front (koshi) + glowing shoji
    B.add(glow.window, BOX, 0, 1.5, d / 2 + 0.02, 0, 0, 0, w * 0.7, 1.4, 0.04);
    for (let k = -6; k <= 6; k++) {
      B.add(mats.darkWood, BOX, (k * w * 0.7) / 13, 1.5, d / 2 + 0.08, 0, 0, 0, 0.06, 1.5, 0.06);
    }
    B.add(glow.window, BOX, w / 2 + 0.02, 1.6, 0, 0, Math.PI / 2, 0, d * 0.4, 1.0, 0.04);
    B.add(mats.darkWood, BOX, 0, 2.75, d / 2 + 0.4, 0, 0, 0, w + 0.4, 0.15, 0.9); // small eave
    B.add(mats.tile, roofGeometry(w / 2 + 1.0, d / 2 + 1.0, 2.0, 0.25), 0, 3.55, 0);
  }

  // ===== Layout along the loop =============================================
  taikobashi(0.035);
  pagoda(0.17, 1, b0(0.17) + 40);
  torii(0.31, -1);

  // Village with lantern string and jetty
  const villageSide = 1;
  for (let k = 0; k < 9; k++) {
    const u = 0.465 + k * 0.0075;
    const dist = b0(u) + 10 + (k % 2) * 7 + rand() * 2;
    const h = bank(u, villageSide, dist);
    house(h.x, h.y, h.z, h.yaw, 5.5 + rand() * 1.5, 4.5 + rand() * 1.2);
    exclusions.push({ x: h.x, z: h.z, r: 7 });
  }
  for (let k = 0; k <= 12; k++) {
    const u = 0.465 + k * 0.0055;
    const p = bank(u, villageSide, b0(u) + 3.2);
    B.setBase(p.x, p.y, p.z, p.yaw);
    B.add(mats.darkWood, CYL6, 0, 1.8, 0, 0, 0, 0, 0.1, 3.6, 0.1);
    if (k < 12) {
      const q = bank(u + 0.00275, villageSide, b0(u) + 3.2);
      B.setBase(q.x, Math.max(p.y, q.y), q.z, q.yaw);
      B.add(glow.chochin, SPH, 0, 2.7, 0, 0, 0, 0, 0.32, 0.45, 0.32);
      B.add(mats.black, CYL6, 0, 3.17, 0, 0, 0, 0, 0.2, 0.08, 0.2);
      B.add(mats.black, CYL6, 0, 2.23, 0, 0, 0, 0, 0.2, 0.08, 0.2);
      B.add(mats.black, CYL6, 0, 3.4, 0, 0, 0, 0, 0.015, 0.4, 0.015);
    }
  }
  {
    const p = bank(0.5, villageSide, b0(0.5) + 1.5);
    B.setBase(p.x, 0, p.z, p.yaw);
    B.add(mats.wood, BOX, 0, 0.6, -1, 0, 0, 0, 2.4, 0.18, 9);
    for (const sx of [-1, 1]) for (const sz of [-4, 0, 4]) B.add(mats.darkWood, CYL6, sx * 1.1, -1, sz - 1, 0, 0, 0, 0.12, 3.2, 0.12);
  }

  // Flat wooden bridge
  {
    const u = 0.66;
    river.frame(u, F);
    const span = F.w * 2 + 10;
    B.setBase(F.pos.x, 0, F.pos.z, Math.atan2(-F.nor.z, F.nor.x));
    B.add(mats.wood, BOX, 0, 5.2, 0, 0, 0, 0, span, 0.35, 3);
    for (const sz of [-1, 1]) {
      B.add(mats.darkWood, BOX, 0, 6.2, sz * 1.4, 0, 0, 0, span, 0.12, 0.12);
      for (let k = 0; k <= 10; k++) B.add(mats.darkWood, BOX, -span / 2 + (k * span) / 10, 5.7, sz * 1.4, 0, 0, 0, 0.14, 1.0, 0.14);
    }
    for (const px of [-(F.w - 1.5), F.w - 1.5])
      for (const sz of [-1, 1]) B.add(mats.darkWood, CYL6, px, 1.0, sz * 1.2, 0, 0, sz * 0.05, 0.2, 8.5, 0.2);
    for (const sx of [-1, 1]) {
      const x = F.pos.x + F.nor.x * sx * (span / 2 + 1);
      const z = F.pos.z + F.nor.z * sx * (span / 2 + 1);
      exclusions.push({ x, z, r: 6 });
    }
  }

  // Lanterns along both banks
  const lanternSpots = [];
  for (let k = 0; k < 64; k++) {
    const u = k / 64 + 0.004;
    const side = k % 2 ? 1 : -1;
    const p = bank(u, side, b0(u) + 4.2);
    if (exclusions.some((e) => Math.hypot(e.x - p.x, e.z - p.z) < e.r)) continue;
    toro(p.x, p.y, p.z, p.yaw);
    lanternSpots.push(p);
    exclusions.push({ x: p.x, z: p.z, r: 2.5 });
  }

  const group = B.build();

  // A couple of real lights for the village and shrine at night.
  const villageLight = new THREE.PointLight('#ffab5c', 0, 60, 1.6);
  const vp = bank(0.49, villageSide, b0(0.49) + 6);
  villageLight.position.set(vp.x, vp.y + 4, vp.z);
  group.add(villageLight);
  const shrineLight = new THREE.PointLight('#ffab5c', 0, 40, 1.6);
  const sp = bank(0.31, -1, b0(0.31) + 9);
  shrineLight.position.set(sp.x, sp.y + 4, sp.z);
  group.add(shrineLight);

  function update(night) {
    glow.lantern.emissiveIntensity = 0.05 + night * 5;
    glow.window.emissiveIntensity = 0.03 + night * 2.2;
    glow.chochin.emissiveIntensity = 0.15 + night * 4;
    villageLight.intensity = night * 60;
    shrineLight.intensity = night * 40;
  }

  return { group, exclusions, update };
}
