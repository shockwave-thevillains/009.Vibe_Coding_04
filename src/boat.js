import * as THREE from 'three';
import { clamp, lerp } from './noise.js';

const UP = new THREE.Vector3(0, 1, 0);

function std(color, opts = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.8, ...opts });
}

// Sampan hull: a lofted surface of U-shaped cross-sections. Local +z is the bow.
function hullGeometry(L = 8, segL = 40, segP = 16) {
  const positions = [];
  const indices = [];
  for (let i = 0; i <= segL; i++) {
    const t = (i / segL) * 2 - 1; // -1 stern .. 1 bow
    const w = t > 0 ? 1.15 * Math.pow(Math.max(0, 1 - Math.pow(t, 2.2)), 0.6) + 0.02 : 1.15 * Math.pow(1 - 0.75 * Math.pow(-t, 2.5), 0.6);
    const top = 0.55 + (t > 0 ? 0.65 * Math.pow(t, 3) : 0.3 * Math.pow(t, 4));
    const bottom = -0.32 * (1 - 0.5 * t * t) + (t > 0 ? 0.25 * Math.pow(t, 3) : 0);
    for (let j = 0; j <= segP; j++) {
      const a = (j / segP) * Math.PI - Math.PI / 2;
      const x = w * Math.sin(a);
      const y = bottom + (top - bottom) * (1 - Math.cos(a));
      positions.push(x, y, (t * L) / 2);
    }
  }
  const row = segP + 1;
  for (let i = 0; i < segL; i++) {
    for (let j = 0; j < segP; j++) {
      const a = i * row + j;
      const b = a + row;
      indices.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setIndex(indices);
  g.computeVertexNormals();
  return g;
}

function limb(mat, r0, r1) {
  // Unit-length cylinder from y=0 to y=1, scaled along y to the bone length.
  const g = new THREE.CylinderGeometry(r1, r0, 1, 8);
  g.translate(0, 0.5, 0);
  const m = new THREE.Mesh(g, mat);
  m.castShadow = true;
  return m;
}

function placeLimb(mesh, a, b) {
  const dir = new THREE.Vector3().subVectors(b, a);
  const len = dir.length();
  mesh.position.copy(a);
  mesh.quaternion.setFromUnitVectors(UP, dir.normalize());
  mesh.scale.set(1, len, 1);
}

export class Boat {
  constructor(river, field) {
    this.river = river;
    this.field = field;
    this.group = new THREE.Group();
    this.u = 0.005;
    this.offset = 0;
    this.speed = 5;
    this.targetSpeed = 5;
    this.steerVel = 0;
    this.phase = 0;
    this.time = 0;
    this.wakeTimer = 0;
    this.F = {};
    this.forward = new THREE.Vector3(0, 0, 1);
    this.position = new THREE.Vector3();

    const wood = std('#6b4a30', { side: THREE.DoubleSide, roughness: 0.75 });
    const darkWood = std('#3d2a1d');
    const hull = new THREE.Mesh(hullGeometry(), wood);
    hull.castShadow = true;
    hull.receiveShadow = true;
    this.group.add(hull);

    // Gunwale rails
    const railMat = darkWood;
    for (const side of [-1, 1]) {
      const pts = [];
      for (let i = 0; i <= 20; i++) {
        const t = (i / 20) * 2 - 1;
        const w = t > 0 ? 1.15 * Math.pow(Math.max(0, 1 - Math.pow(t, 2.2)), 0.6) + 0.02 : 1.15 * Math.pow(1 - 0.75 * Math.pow(-t, 2.5), 0.6);
        const top = 0.55 + (t > 0 ? 0.65 * Math.pow(t, 3) : 0.3 * Math.pow(t, 4));
        pts.push(new THREE.Vector3(side * w, top, t * 4));
      }
      const rail = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 40, 0.06, 6), railMat);
      rail.castShadow = true;
      this.group.add(rail);
    }
    // Floor planks + thwarts
    const floor = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.08, 6.2), std('#7a5a3c'));
    floor.position.set(0, 0.0, -0.2);
    floor.receiveShadow = true;
    this.group.add(floor);
    for (const z of [-2.2, 1.6]) {
      const th = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.1, 0.3), darkWood);
      th.position.set(0, 0.45, z);
      this.group.add(th);
    }
    // Stern cap
    const cap = new THREE.Mesh(new THREE.BoxGeometry(1.05, 0.5, 0.12), darkWood);
    cap.position.set(0, 0.45, -3.98);
    this.group.add(cap);
    // Cargo: baskets and a bundle
    const basket = std('#a8874f');
    for (const [x, z, r] of [[-0.45, -1.2, 0.3], [0.4, -1.5, 0.26]]) {
      const b = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 0.8, 0.45, 12), basket);
      b.position.set(x, 0.26, z);
      b.castShadow = true;
      this.group.add(b);
    }

    this.buildBoatman();
    this.buildPassenger();
    this.buildLantern();
  }

  buildBoatman() {
    const indigo = std('#2b3a5e');
    const navy = std('#1d2236');
    const skin = std('#d6a27a', { roughness: 0.6 });
    const straw = std('#c6aa70', { roughness: 0.9 });
    const man = new THREE.Group();
    man.position.set(0.3, 0.05, -3.0);
    man.rotation.y = -0.5;
    this.boatman = man;

    const skirt = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.4, 0.95, 10), navy);
    skirt.position.y = 0.5;
    const torso = new THREE.Group();
    torso.position.y = 0.95;
    const chest = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.24, 0.8, 10), indigo);
    chest.position.y = 0.4;
    const belt = new THREE.Mesh(new THREE.CylinderGeometry(0.255, 0.255, 0.1, 10), std('#b9a37a'));
    belt.position.y = 0.05;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.17, 14, 10), skin);
    head.position.y = 1.0;
    const hat = new THREE.Mesh(new THREE.ConeGeometry(0.55, 0.28, 20), straw);
    hat.position.y = 1.18;
    const towel = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.035, 6, 14), std('#e9e4da'));
    towel.rotation.x = Math.PI / 2;
    towel.position.y = 0.82;
    torso.add(chest, belt, head, hat, towel);
    for (const m of [skirt, chest, head, hat]) m.castShadow = true;
    man.add(skirt, torso);
    this.torso = torso;

    this.armR = [limb(indigo, 0.07, 0.06), limb(skin, 0.055, 0.05)];
    this.armL = [limb(indigo, 0.07, 0.06), limb(skin, 0.055, 0.05)];
    this.group.add(...this.armR, ...this.armL);
    this.shoulderR = new THREE.Object3D();
    this.shoulderL = new THREE.Object3D();
    this.shoulderR.position.set(0.3, 0.72, 0);
    this.shoulderL.position.set(-0.3, 0.72, 0);
    torso.add(this.shoulderR, this.shoulderL);
    this.group.add(man);

    // Bamboo pole pivots around the upper hand.
    this.poleGroup = new THREE.Group();
    this.poleGroup.position.set(0.85, 1.75, -2.85);
    const poleGeo = new THREE.CylinderGeometry(0.035, 0.045, 7.6, 6);
    poleGeo.translate(0, -2.3, 0);
    this.pole = new THREE.Mesh(poleGeo, std('#a99060'));
    this.pole.castShadow = true;
    this.poleGroup.add(this.pole);
    this.group.add(this.poleGroup);
    this.gripTop = new THREE.Vector3(0, 0.25, 0);
    this.gripLow = new THREE.Vector3(0, -0.55, 0);
    this.poleTipLocal = new THREE.Vector3(0, -6.1, 0);
    this.poleTopLocal = new THREE.Vector3(0, 1.5, 0);
  }

  buildPassenger() {
    const kimono = std('#c9536f');
    const obi = std('#e8c35a', { roughness: 0.5 });
    const skin = std('#e4b996', { roughness: 0.6 });
    const hair = std('#141012', { roughness: 0.45 });
    const p = new THREE.Group();
    p.position.set(0, 0.05, 0.9);
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.48, 0.75, 14), kimono);
    body.position.y = 0.38;
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.27, 0.29, 0.16, 14), obi);
    band.position.y = 0.55;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.15, 14, 10), skin);
    head.position.y = 0.92;
    const hairBack = new THREE.Mesh(new THREE.SphereGeometry(0.165, 14, 10), hair);
    hairBack.position.set(0, 0.95, -0.03);
    hairBack.scale.set(1, 1, 0.95);
    const bun = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 8), hair);
    bun.position.set(0, 1.1, -0.08);
    const pin = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), std('#ff5a7a'));
    pin.position.set(0.09, 1.12, -0.05);
    p.add(body, band, head, hairBack, bun, pin);
    for (const m of [body, head, hairBack]) m.castShadow = true;

    // Wagasa parasol
    const parasol = new THREE.Group();
    parasol.position.set(0.18, 0.7, 0);
    parasol.rotation.set(-0.35, 0, -0.25);
    const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 1.3, 6), std('#5a3a22'));
    stick.position.y = 0.6;
    const canopy = new THREE.Mesh(
      new THREE.ConeGeometry(0.95, 0.32, 24, 1, true),
      std('#b5262c', { side: THREE.DoubleSide, roughness: 0.6, emissive: '#3a0606', emissiveIntensity: 0.3 }),
    );
    canopy.position.y = 1.2;
    canopy.castShadow = true;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.012, 4, 24), std('#f2e6d0'));
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 1.2;
    parasol.add(stick, canopy, ring);
    p.add(parasol);
    this.parasol = parasol;
    this.group.add(p);
  }

  buildLantern() {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 1.6, 6), std('#3d2a1d'));
    post.position.set(0.45, 1.25, 3.0);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.6), std('#3d2a1d'));
    arm.position.set(0.45, 2.02, 3.25);
    this.group.add(post, arm);
    this.lanternPivot = new THREE.Group();
    this.lanternPivot.position.set(0.45, 2.0, 3.52);
    this.lanternMat = std('#f2d6a8', { emissive: '#ff8a2a', emissiveIntensity: 0.2, roughness: 0.7 });
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.2, 14, 10), this.lanternMat);
    body.scale.set(1, 1.3, 1);
    body.position.y = -0.38;
    const capT = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.06, 10), std('#141414'));
    capT.position.y = -0.1;
    const capB = capT.clone();
    capB.position.y = -0.66;
    this.lanternPivot.add(body, capT, capB);
    this.light = new THREE.PointLight('#ffa050', 0, 26, 1.7);
    this.light.position.y = -0.4;
    this.lanternPivot.add(this.light);
    this.group.add(this.lanternPivot);
  }

  update(dt, input, env, ripples, audio) {
    this.time += dt;
    const F = this.river.frame(this.u, this.F);

    // Throttle & steering
    if (input.up) this.targetSpeed = Math.min(16, this.targetSpeed + dt * 6);
    if (input.down) this.targetSpeed = Math.max(0, this.targetSpeed - dt * 6);
    this.speed = lerp(this.speed, this.targetSpeed, 1 - Math.exp(-dt * 1.2));
    const steerIn = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    this.steerVel = lerp(this.steerVel, steerIn * 4.5, 1 - Math.exp(-dt * 3));
    const maxOff = F.w - 4.5;
    this.offset = clamp(this.offset + this.steerVel * dt, -maxOff, maxOff);
    if (Math.abs(this.offset) >= maxOff - 0.01) this.steerVel *= 0.5;

    // Pole rhythm drives a gentle surge in speed.
    const strokeRate = 0.22 + this.speed * 0.028;
    const prevPhase = this.phase;
    this.phase = (this.phase + dt * strokeRate) % 1;
    const push = this.phase < 0.6 ? Math.sin((this.phase / 0.6) * Math.PI) : 0;
    const v = this.speed * (0.82 + 0.3 * push);
    this.u = (this.u + (v * dt) / this.river.length) % 1;

    // Pose on the river: F.nor points to the right of travel.
    this.position.copy(F.pos).addScaledVector(F.nor, this.offset);
    const yaw = Math.atan2(F.tan.x, F.tan.z) - this.steerVel * 0.06;
    this.forward.set(Math.sin(yaw), 0, Math.cos(yaw));
    const bob = Math.sin(this.time * 1.3) * 0.05 + Math.sin(this.time * 2.1 + 1) * 0.025;
    this.group.position.set(this.position.x, -0.08 + bob, this.position.z);
    this.group.rotation.set(
      Math.sin(this.time * 0.9) * 0.012 - push * 0.012,
      yaw,
      Math.sin(this.time * 1.1) * 0.022 - this.steerVel * 0.02,
      'YXZ',
    );

    this.animateCrew(push, dt);

    // Pole plant ripple + sound
    this.group.updateMatrixWorld(true);
    const tip = this.pole.localToWorld(this._v1 || (this._v1 = new THREE.Vector3()).copy(this.poleTipLocal));
    const top = this.pole.localToWorld(this._v2 || (this._v2 = new THREE.Vector3()).copy(this.poleTopLocal));
    if (top.y > 0 && tip.y < 0) {
      const k = top.y / (top.y - tip.y);
      const wx = lerp(top.x, tip.x, k);
      const wz = lerp(top.z, tip.z, k);
      if (prevPhase > this.phase || (prevPhase < 0.02 && this.phase >= 0.02)) {
        ripples.spawn(wx, wz, 0.9, 5.5);
        audio?.splash(0.6);
      } else if (this.phase < 0.6 && Math.random() < dt * 6) {
        ripples.spawn(wx, wz, 0.35, 2.5);
      }
    }

    // Wake rings from bow and stern
    this.wakeTimer -= dt;
    if (this.wakeTimer <= 0 && this.speed > 0.5) {
      this.wakeTimer = 0.32 - Math.min(0.2, this.speed * 0.012);
      const fx = this.forward.x;
      const fz = this.forward.z;
      const sx = fz;
      const sz = -fx;
      const s = 0.25 + Math.min(0.45, this.speed * 0.035);
      for (const side of [-1, 1]) {
        ripples.spawn(this.position.x + fx * 3.0 + sx * side * 0.7, this.position.z + fz * 3.0 + sz * side * 0.7, s, 4 + this.speed * 0.25);
      }
      ripples.spawn(this.position.x - fx * 4.1, this.position.z - fz * 4.1, s * 0.8, 3.5);
    }

    // Lantern
    this.lanternPivot.rotation.x = Math.sin(this.time * 1.7) * 0.12 + push * 0.08;
    this.lanternPivot.rotation.z = Math.sin(this.time * 1.3 + 1) * 0.08;
    this.lanternMat.emissiveIntensity = 0.2 + env.night * 4.5;
    this.light.intensity = env.night * 22;

    // Parasol twirl
    this.parasol.rotation.y += dt * 0.25;
  }

  animateCrew(push, dt) {
    const p = this.phase;
    // Pole pitch: planted forward, pushed back, then recovered.
    let pitch;
    let lift;
    if (p < 0.6) {
      const t = p / 0.6;
      pitch = lerp(-0.12, 0.62, t);
      lift = 0;
    } else {
      const t = (p - 0.6) / 0.4;
      pitch = lerp(0.62, -0.12, t * t * (3 - 2 * t));
      lift = Math.sin(t * Math.PI);
    }
    this.poleGroup.rotation.set(pitch, 0, 0.24 + lift * 0.08, 'XZY');
    this.pole.position.y = lift * 1.4;
    this.torso.rotation.x = 0.1 + push * 0.32;
    this.torso.rotation.z = -0.08 - push * 0.06;

    // Straight-arm IK from shoulders to the two grip points on the pole.
    this.group.updateMatrixWorld(true);
    const inv = this._inv || (this._inv = new THREE.Matrix4());
    inv.copy(this.group.matrixWorld).invert();
    const toLocal = (obj, v) => obj.localToWorld(v).applyMatrix4(inv);
    const sR = toLocal(this.shoulderR, (this._sR || (this._sR = new THREE.Vector3())).set(0, 0, 0));
    const sL = toLocal(this.shoulderL, (this._sL || (this._sL = new THREE.Vector3())).set(0, 0, 0));
    const gR = toLocal(this.pole, (this._gR || (this._gR = new THREE.Vector3())).copy(this.gripTop));
    const gL = toLocal(this.pole, (this._gL || (this._gL = new THREE.Vector3())).copy(this.gripLow));
    this.solveArm(this.armR, sR, gR);
    this.solveArm(this.armL, sL, gL);
  }

  solveArm(arm, shoulder, hand) {
    const upper = 0.38;
    const lower = 0.38;
    const d = shoulder.distanceTo(hand);
    const reach = Math.min(d, upper + lower - 0.001);
    const dir = new THREE.Vector3().subVectors(hand, shoulder).normalize();
    // Bend the elbow outward/downward.
    const bendAxis = new THREE.Vector3().crossVectors(dir, UP).normalize();
    if (bendAxis.lengthSq() < 1e-4) bendAxis.set(1, 0, 0);
    const a = Math.acos(clamp((upper * upper + reach * reach - lower * lower) / (2 * upper * reach), -1, 1));
    const elbowDir = dir.clone().applyAxisAngle(bendAxis, -a);
    const elbow = shoulder.clone().addScaledVector(elbowDir, upper);
    const handPos = shoulder.clone().addScaledVector(dir, reach);
    placeLimb(arm[0], shoulder, elbow);
    placeLimb(arm[1], elbow, handPos);
  }
}
