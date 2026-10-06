import * as THREE from 'three';
import { clamp } from './noise.js';

const UP = new THREE.Vector3(0, 1, 0);

export class CameraRig {
  constructor(camera, dom, field, river) {
    this.camera = camera;
    this.field = field;
    this.river = river;
    this.mode = 'follow';
    this.yaw = 0.55;
    this.pitch = 0.22;
    this.dist = 17;
    this.lookYaw = 0;
    this.lookPitch = -0.05;
    this.idle = 10;
    this.look = new THREE.Vector3();
    this.desired = new THREE.Vector3();
    this.desiredLook = new THREE.Vector3();
    this.shot = 0;
    this.shotTime = 0;
    this.snap = true;
    this.fixed = new THREE.Vector3();
    this.F = {};

    const pointers = new Map();
    let pinch = 0;
    dom.addEventListener('pointerdown', (e) => {
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      dom.setPointerCapture(e.pointerId);
    });
    const end = (e) => {
      pointers.delete(e.pointerId);
      pinch = 0;
    };
    dom.addEventListener('pointerup', end);
    dom.addEventListener('pointercancel', end);
    dom.addEventListener('pointermove', (e) => {
      const p = pointers.get(e.pointerId);
      if (!p) return;
      const dx = e.clientX - p.x;
      const dy = e.clientY - p.y;
      p.x = e.clientX;
      p.y = e.clientY;
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (pinch) this.zoom((pinch - d) * 4);
        pinch = d;
        return;
      }
      this.idle = 0;
      if (this.mode === 'bow') {
        this.lookYaw -= dx * 0.004;
        this.lookPitch = clamp(this.lookPitch - dy * 0.003, -0.8, 0.8);
      } else {
        if (this.mode === 'cinematic') this.setMode('follow', true);
        this.yaw -= dx * 0.005;
        this.pitch = clamp(this.pitch + dy * 0.004, -0.05, 1.35);
      }
    });
    dom.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        this.zoom(e.deltaY);
      },
      { passive: false },
    );
    this.onModeChange = null;
  }

  zoom(delta) {
    this.dist = clamp(this.dist * (1 + delta * 0.001), 6, 90);
    this.idle = 0;
  }

  setMode(mode, fromUser = false) {
    if (this.mode === mode) return;
    this.mode = mode;
    this.shot = 0;
    this.shotTime = 0;
    this.snap = mode !== 'follow';
    if (mode === 'bow') {
      this.lookYaw = 0;
      this.lookPitch = -0.05;
    }
    if (fromUser) this.onModeChange?.(mode);
  }

  clampAboveGround(v, margin = 1.2) {
    const g = Math.max(this.field.height(v.x, v.z), 0);
    if (v.y < g + margin) v.y = g + margin;
  }

  update(dt, boat) {
    const cam = this.camera;
    const fwd = boat.forward;
    const right = new THREE.Vector3(-fwd.z, 0, fwd.x);
    const bp = boat.position;
    this.idle += dt;
    let lerpPos = 1 - Math.exp(-dt * 3.2);
    let lerpLook = 1 - Math.exp(-dt * 5);

    if (this.mode === 'follow') {
      if (this.idle > 8) {
        this.yaw += (0.55 - this.yaw) * (1 - Math.exp(-dt * 0.15));
      }
      const back = fwd.clone().negate().applyAxisAngle(UP, this.yaw);
      this.desired
        .copy(bp)
        .addScaledVector(back, this.dist * Math.cos(this.pitch))
        .addScaledVector(UP, this.dist * Math.sin(this.pitch) + 2.2);
      this.desiredLook.copy(bp).addScaledVector(UP, 1.8).addScaledVector(fwd, 2.5);
    } else if (this.mode === 'bow') {
      this.desired.copy(bp).addScaledVector(fwd, 1.7).addScaledVector(right, 0.45).addScaledVector(UP, 1.6);
      const dir = fwd.clone().applyAxisAngle(UP, this.lookYaw);
      dir.y = Math.sin(this.lookPitch);
      this.desiredLook.copy(this.desired).addScaledVector(dir.normalize(), 20);
      lerpPos = 1;
      lerpLook = 1 - Math.exp(-dt * 10);
    } else {
      this.cinematic(dt, boat, fwd, right, bp);
      lerpPos = 1 - Math.exp(-dt * 6);
    }

    this.clampAboveGround(this.desired, this.mode === 'bow' ? 0.3 : 1.0);
    if (this.snap) {
      cam.position.copy(this.desired);
      this.look.copy(this.desiredLook);
      this.snap = false;
    } else {
      cam.position.lerp(this.desired, lerpPos);
      this.look.lerp(this.desiredLook, lerpLook);
    }
    this.clampAboveGround(cam.position, 0.6);
    cam.lookAt(this.look);
  }

  cinematic(dt, boat, fwd, right, bp) {
    const DUR = 9;
    this.shotTime += dt;
    if (this.shotTime > DUR) {
      this.shotTime = 0;
      this.shot = (this.shot + 1) % 6;
      this.snap = true;
    }
    const s = this.shotTime;
    const D = this.desired;
    const L = this.desiredLook;
    switch (this.shot) {
      case 0: // low tracking shot from the side, skimming the water
        D.copy(bp).addScaledVector(right, 13).addScaledVector(fwd, 7 - s * 1.4).addScaledVector(UP, 0.9);
        L.copy(bp).addScaledVector(UP, 1.6);
        break;
      case 1: {
        // slow crane orbit
        const a = 2.3 + s * 0.07;
        const dir = fwd.clone().applyAxisAngle(UP, a);
        D.copy(bp).addScaledVector(dir, 30).addScaledVector(UP, 12 + s * 1.1);
        L.copy(bp).addScaledVector(UP, 1.2);
        break;
      }
      case 2: {
        // locked-off camera on the bank, boat sails past
        if (s < dt * 1.5 || this.fixed.lengthSq() === 0) {
          const ahead = 55 / this.river.length;
          const F = this.river.frame(boat.u + ahead, this.F);
          const side = boat.offset > 0 ? -1 : 1;
          this.fixed.copy(F.pos).addScaledVector(F.nor, side * (F.w + 3));
          this.fixed.y = Math.max(this.field.height(this.fixed.x, this.fixed.z), 0) + 1.7;
        }
        D.copy(this.fixed);
        L.copy(bp).addScaledVector(UP, 1.5);
        break;
      }
      case 3: {
        // close-up on the boatman
        const head = new THREE.Vector3();
        boat.torso.localToWorld(head.set(0, 1.0, 0));
        D.copy(bp).addScaledVector(fwd, -1.0).addScaledVector(right, 3.2).addScaledVector(UP, 2.4);
        L.copy(head);
        break;
      }
      case 4: // aerial
        D.copy(bp).addScaledVector(fwd, -50 + s * 3).addScaledVector(UP, 65);
        L.copy(bp).addScaledVector(fwd, 35);
        break;
      default: // front, low and close
        D.copy(bp).addScaledVector(fwd, 15 - s * 0.3).addScaledVector(right, -3).addScaledVector(UP, 1.3);
        L.copy(bp).addScaledVector(UP, 1.5);
    }
    if (this.shot !== 2) this.fixed.set(0, 0, 0);
  }
}
