import * as THREE from 'three';

// The river is a closed, meandering loop so the journey never ends.
// A dense set of samples + a spatial hash gives fast "distance to river" queries
// that drive terrain carving and object placement.
export class River {
  constructor() {
    const pts = [];
    const N = 16;
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2;
      const r = 285 + 48 * Math.sin(a * 3 + 0.7) + 26 * Math.sin(a * 5 + 2.1);
      pts.push(new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r * 0.88));
    }
    this.curve = new THREE.CatmullRomCurve3(pts, true, 'centripetal');
    this.length = this.curve.getLength();

    const S = 1400;
    this.S = S;
    this.px = new Float32Array(S);
    this.pz = new Float32Array(S);
    this.pw = new Float32Array(S);
    const spaced = this.curve.getSpacedPoints(S);
    for (let i = 0; i < S; i++) {
      this.px[i] = spaced[i].x;
      this.pz[i] = spaced[i].z;
      this.pw[i] = this.widthAt(i / S);
    }

    this.cell = 40;
    this.grid = new Map();
    for (let i = 0; i < S; i++) {
      const k = this.key(Math.floor(this.px[i] / this.cell), Math.floor(this.pz[i] / this.cell));
      let arr = this.grid.get(k);
      if (!arr) this.grid.set(k, (arr = []));
      arr.push(i);
    }

    this._t = new THREE.Vector3();
  }

  key(ix, iz) {
    return (ix + 512) * 4096 + (iz + 512);
  }

  widthAt(u) {
    return 15 + 4.5 * Math.sin(u * Math.PI * 6 + 1.0) + 2.5 * Math.sin(u * Math.PI * 14 + 0.3);
  }

  // Nearest river sample: distance to centreline, arc parameter u, local half-width w.
  nearest(x, z) {
    const c = this.cell;
    const cx = Math.floor(x / c);
    const cz = Math.floor(z / c);
    let best = Infinity;
    let bi = -1;
    for (let ring = 0; ring <= 10; ring++) {
      for (let dx = -ring; dx <= ring; dx++) {
        for (let dz = -ring; dz <= ring; dz++) {
          if (Math.max(Math.abs(dx), Math.abs(dz)) !== ring) continue;
          const arr = this.grid.get(this.key(cx + dx, cz + dz));
          if (!arr) continue;
          for (let k = 0; k < arr.length; k++) {
            const i = arr[k];
            const ex = this.px[i] - x;
            const ez = this.pz[i] - z;
            const d2 = ex * ex + ez * ez;
            if (d2 < best) {
              best = d2;
              bi = i;
            }
          }
        }
      }
      if (bi >= 0 && Math.sqrt(best) <= ring * c) break;
    }
    if (bi < 0) return { d: 1e4, u: 0, w: 15 };
    return { d: Math.sqrt(best), u: bi / this.S, w: this.pw[bi] };
  }

  // Position, tangent and in-plane normal at arc parameter u (wraps).
  frame(u, out = {}) {
    u = ((u % 1) + 1) % 1;
    out.pos = out.pos || new THREE.Vector3();
    out.tan = out.tan || new THREE.Vector3();
    out.nor = out.nor || new THREE.Vector3();
    this.curve.getPointAt(u, out.pos);
    this.curve.getTangentAt(u, out.tan);
    out.tan.y = 0;
    out.tan.normalize();
    out.nor.set(-out.tan.z, 0, out.tan.x);
    out.w = this.widthAt(u);
    return out;
  }
}
