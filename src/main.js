import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

import { mulberry32, createNoise2D } from './noise.js';
import { River } from './river.js';
import { makeHeightField, createTerrain, createDistantMountains } from './terrain.js';
import { createWater } from './water.js';
import { Environment } from './sky.js';
import { createFlora, windUniforms } from './flora.js';
import { createStructures } from './structures.js';
import { Boat } from './boat.js';
import { Petals, Rain, Fireflies, Ripples, RainRipples, LightningBolt } from './particles.js';
import { Weather } from './weather.js';
import { CameraRig } from './camera.js';
import { AudioEngine } from './audio.js';

const params = new URLSearchParams(location.search);
const $ = (id) => document.getElementById(id);
const nextFrame = () => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));

// ---------------------------------------------------------------- renderer
const canvas = $('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
const pixelRatio = Math.min(window.devicePixelRatio, 1.75);
renderer.setPixelRatio(pixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.9;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.shadowMap.autoUpdate = false;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.3, 9000);

const state = {
  hours: parseFloat(params.get('t') ?? '17.2'),
  timeRunning: params.get('pause') == null,
  hoursPerSecond: 1 / 40, // one in-game hour every 40 s
  time: 0,
  started: false,
  input: { up: false, down: false, left: false, right: false },
};

async function build() {
  const startBtn = $('start');
  const step = async (label) => {
    startBtn.textContent = label;
    await nextFrame();
  };

  await step('Membentuk lembah…');
  const noise = createNoise2D(mulberry32(2024));
  const river = new River();
  const field = makeHeightField(river, noise);
  scene.add(createTerrain(field, noise));
  const mountains = createDistantMountains(noise);
  scene.add(mountains);

  await step('Membangun desa…');
  const structures = createStructures(river, field);
  scene.add(structures.group);

  await step('Menanam sakura…');
  scene.add(createFlora(field, structures.exclusions));

  await step('Mengalirkan sungai…');
  const water = createWater();
  scene.add(water);
  const env = new Environment(scene, renderer);
  const weather = new Weather(params.get('w') ?? 'sakura');
  weather.set(weather.name, true);

  const boat = new Boat(river, field);
  scene.add(boat.group);

  const petals = new Petals();
  const rain = new Rain();
  const fireflies = new Fireflies();
  const ripples = new Ripples();
  const rainRipples = new RainRipples();
  const bolt = new LightningBolt();
  scene.add(petals.points, rain.lines, fireflies.points, ripples.mesh, rainRipples.mesh, bolt.mesh);

  // Keep rain streaks and surface rings out of the water's own reflection pass.
  const hideInReflection = [rain.lines, ripples.mesh, rainRipples.mesh];
  const reflect = water.onBeforeRender;
  water.onBeforeRender = function (...args) {
    for (const o of hideInReflection) o.visible = false;
    reflect.apply(this, args);
    for (const o of hideInReflection) o.visible = true;
  };

  // ------------------------------------------------------------ post-processing
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  // Guard: a single NaN/Inf pixel would otherwise be smeared across the frame by bloom.
  composer.addPass(
    new ShaderPass({
      uniforms: { tDiffuse: { value: null } },
      vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `
        uniform sampler2D tDiffuse;
        varying vec2 vUv;
        void main() {
          vec4 c = texture2D(tDiffuse, vUv);
          if (any(isnan(c)) || any(isinf(c))) c = vec4(0.0, 0.0, 0.0, 1.0);
          gl_FragColor = vec4(min(c.rgb, vec3(64.0)), c.a);
        }
      `,
    }),
  );
  const bloom = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.45, 0.65, 0.9);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
  const grade = new ShaderPass({
    uniforms: { tDiffuse: { value: null }, uTime: { value: 0 }, uVignette: { value: 0.32 }, uGrain: { value: 0.03 } },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
    `,
    fragmentShader: /* glsl */ `
      uniform sampler2D tDiffuse;
      uniform float uTime, uVignette, uGrain;
      varying vec2 vUv;
      void main() {
        vec4 c = texture2D(tDiffuse, vUv);
        vec2 d = vUv - 0.5;
        float v = (1.0 - smoothstep(0.25, 0.85, length(d * vec2(1.0, 0.85))));
        c.rgb *= mix(1.0 - uVignette, 1.0, v);
        float g = fract(sin(dot(vUv * 1000.0 + fract(uTime) * 91.0, vec2(12.9898, 78.233))) * 43758.5453);
        c.rgb += (g - 0.5) * uGrain;
        gl_FragColor = c;
      }
    `,
  });
  composer.addPass(grade);

  const rig = new CameraRig(camera, canvas, field, river);
  const audio = new AudioEngine();

  return { river, field, structures, water, env, weather, boat, petals, rain, fireflies, ripples, rainRipples, bolt, composer, bloom, grade, rig, audio, mountains };
}

function phaseName(h) {
  if (h < 4.5) return '夜 · Malam';
  if (h < 6.5) return '夜明け · Fajar';
  if (h < 10.5) return '朝 · Pagi';
  if (h < 15) return '昼 · Siang';
  if (h < 17.5) return '午後 · Sore';
  if (h < 19.3) return '夕暮れ · Senja';
  return '夜 · Malam';
}

function setupUI(app) {
  const hud = $('hud');
  const timeInput = $('time');
  const playBtn = $('play');
  const soundBtn = $('sound');
  const panelToggle = $('panel-toggle');
  panelToggle.addEventListener('click', () => {
    const open = $('panel').classList.toggle('open');
    panelToggle.setAttribute('aria-expanded', String(open));
  });

  timeInput.addEventListener('input', () => {
    state.hours = parseFloat(timeInput.value);
  });
  const syncPlay = () => {
    playBtn.textContent = state.timeRunning ? '❚❚' : '▶';
  };
  playBtn.addEventListener('click', () => {
    state.timeRunning = !state.timeRunning;
    syncPlay();
  });
  syncPlay();

  const weatherBtns = [...document.querySelectorAll('#weather button')];
  const markWeather = (name) => weatherBtns.forEach((b) => b.classList.toggle('on', b.dataset.weather === name));
  weatherBtns.forEach((b) =>
    b.addEventListener('click', () => {
      app.weather.set(b.dataset.weather);
      markWeather(b.dataset.weather);
    }),
  );
  markWeather(app.weather.name);

  const camBtns = [...document.querySelectorAll('#camera button[data-cam]')];
  const markCam = (mode) => camBtns.forEach((b) => b.classList.toggle('on', b.dataset.cam === mode));
  camBtns.forEach((b) =>
    b.addEventListener('click', () => {
      app.rig.setMode(b.dataset.cam);
      markCam(b.dataset.cam);
    }),
  );
  app.rig.onModeChange = markCam;
  const initialCam = params.get('cam');
  if (initialCam) {
    app.rig.setMode(initialCam);
    markCam(initialCam);
  }

  soundBtn.addEventListener('click', () => {
    app.audio.setMuted(!app.audio.muted);
    soundBtn.classList.toggle('off', app.audio.muted);
  });

  const keyMap = { KeyW: 'up', ArrowUp: 'up', KeyS: 'down', ArrowDown: 'down', KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right' };
  window.addEventListener('keydown', (e) => {
    if (keyMap[e.code]) {
      state.input[keyMap[e.code]] = true;
      e.preventDefault();
    }
    if (e.code === 'KeyH') hud.classList.toggle('hidden');
    if (e.code === 'KeyC') {
      const order = ['follow', 'cinematic', 'bow'];
      const next = order[(order.indexOf(app.rig.mode) + 1) % order.length];
      app.rig.setMode(next);
      markCam(next);
    }
    if (e.code === 'Space') {
      state.timeRunning = !state.timeRunning;
      syncPlay();
      e.preventDefault();
    }
  });
  window.addEventListener('keyup', (e) => {
    if (keyMap[e.code]) state.input[keyMap[e.code]] = false;
  });
  window.addEventListener('blur', () => {
    for (const k in state.input) state.input[k] = false;
  });

  for (const b of document.querySelectorAll('#touch button')) {
    const key = b.dataset.key;
    const on = (e) => {
      e.preventDefault();
      state.input[key] = true;
    };
    const off = () => (state.input[key] = false);
    b.addEventListener('pointerdown', on);
    b.addEventListener('pointerup', off);
    b.addEventListener('pointerleave', off);
    b.addEventListener('pointercancel', off);
  }

  return {
    tick() {
      const h = ((state.hours % 24) + 24) % 24;
      const hh = Math.floor(h);
      const mm = Math.floor((h - hh) * 60);
      $('clock-time').textContent = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
      $('clock-phase').textContent = phaseName(h);
      if (document.activeElement !== timeInput) timeInput.value = h.toFixed(2);
      $('speed-bar').style.width = `${Math.min(100, (app.boat.speed / 16) * 100)}%`;
    },
  };
}

function resize(app) {
  const w = window.innerWidth;
  const h = window.innerHeight;
  camera.aspect = w / h;
  camera.fov = w < h ? 72 : 55; // keep the boat in frame on portrait phones
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
  app.composer.setSize(w, h);
  const scale = (h * pixelRatio) / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)));
  app.petals.uniforms.uScale.value = scale;
  app.fireflies.uniforms.uScale.value = scale;
}

async function main() {
  const app = await build();
  const ui = setupUI(app);
  resize(app);
  window.addEventListener('resize', () => resize(app));

  const timer = new THREE.Timer();
  timer.connect(document);
  let uiTimer = 0;

  function frame(now) {
    timer.update(now);
    const dt = Math.min(timer.getDelta(), 0.05);
    state.time += dt;
    if (state.timeRunning) state.hours = (state.hours + dt * state.hoursPerSecond) % 24;

    const { weather, env, boat, rig, petals, rain, fireflies, ripples, rainRipples, bolt, water, structures, audio } = app;

    weather.update(dt, () => {
      const dist = bolt.strike(camera.position);
      audio.thunder(dist);
    });
    bolt.update(weather.lightning);

    const S = env.update(state.hours, weather, state.time, boat.position, camera.position);
    const input = state.started ? state.input : {};
    boat.update(dt, input, S, ripples, state.started ? audio : null);
    rig.update(dt, boat);
    env.dome.position.copy(camera.position);

    // Water reacts to light and weather
    const wu = water.material.uniforms;
    wu.time.value += dt * (0.55 + weather.wind * 0.35);
    wu.sunDirection.value.copy(S.lightDir);
    wu.sunColor.value.copy(S.lightColor).multiplyScalar((1 - weather.cloud * 0.8) * (0.25 + 0.75 * S.day));
    wu.waterColor.value.setRGB(0.06, 0.13, 0.12).multiplyScalar(0.25 + 0.75 * S.ambient);
    wu.distortionScale.value = 0.8 + weather.wind * 0.35 + weather.rain * 0.4;

    const light = Math.max(0.12, S.ambient) + weather.lightning * 0.5;
    petals.uniforms.uTime.value = state.time;
    petals.uniforms.uCenter.value.copy(camera.position);
    petals.uniforms.uDensity.value = weather.petals;
    petals.uniforms.uLight.value = light;
    petals.uniforms.uWind.value.set(0.8 + weather.wind * 1.5, 0, 0.4 + weather.wind * 0.8);
    rain.uniforms.uTime.value = state.time;
    rain.uniforms.uCenter.value.copy(camera.position);
    rain.uniforms.uIntensity.value = weather.rain;
    rain.uniforms.uLight.value = light;
    rain.uniforms.uWind.value.set(weather.wind * 4, 0, weather.wind * 2);
    rainRipples.uniforms.uTime.value = state.time;
    rainRipples.uniforms.uCenter.value.copy(camera.position);
    rainRipples.uniforms.uIntensity.value = weather.rain;
    rainRipples.uniforms.uLight.value = light;
    fireflies.uniforms.uTime.value = state.time;
    fireflies.uniforms.uCenter.value.copy(boat.position);
    fireflies.uniforms.uAmount.value = S.night * (1 - weather.rain);
    ripples.uniforms.uLight.value = light;
    ripples.update(dt);

    windUniforms.uTime.value = state.time;
    windUniforms.uWind.value = weather.wind;
    structures.update(S.night);

    for (let i = 0; i < app.mountains.userData.mats.length; i++) {
      const m = app.mountains.userData.mats[i];
      m.color.copy(m.userData.base).multiplyScalar(0.12 + S.ambient * 0.6).lerp(scene.fog.color, 0.25 + i * 0.2);
    }

    app.bloom.strength = 0.35 + S.night * 0.5 + weather.lightning * 0.3;
    app.grade.uniforms.uTime.value = state.time;

    audio.update({ rain: weather.rain, wind: weather.wind, night: S.night, day: S.day, speed: boat.speed });

    renderer.shadowMap.needsUpdate = true;
    app.composer.render();

    uiTimer -= dt;
    if (uiTimer <= 0) {
      uiTimer = 0.25;
      ui.tick();
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  const startBtn = $('start');
  const begin = () => {
    state.started = true;
    $('intro').classList.add('gone');
    $('hud').classList.remove('hidden');
    app.audio.start();
    canvas.focus();
  };
  startBtn.disabled = false;
  startBtn.textContent = 'Mulai Perjalanan';
  startBtn.addEventListener('click', begin);
  if (params.has('autostart')) {
    state.started = true;
    $('intro').classList.add('gone');
    $('hud').classList.remove('hidden');
  }
  if (params.has('debug')) {
    window.__app = app;
    window.__three = { renderer, scene, camera };
  }
}

main().catch((err) => {
  console.error(err);
  const btn = $('start');
  btn.textContent = 'Gagal memuat — WebGL diperlukan';
});
