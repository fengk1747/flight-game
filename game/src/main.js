// Canyon Postman — the game itself: boot, the loop, the camera, the screens.
// The loop is a fixed 1/60 s simulation (the starter's pattern), the renderer
// paints whatever the simulation says. `?shot=<name>` runs one autopilot sortie
// headless and renders a single frame, for the submission screenshots.

import { STEP, BEST_KEY, WORLD, SCORE } from './config.js';
import { buildWorld, terrainHeight, runwayAt } from './world.js';
import { buildPlane, posePlane } from './plane.js';
import { createFlightState, stepFlight, windAt, EVENT_TOUCHDOWN, EVENT_HARD_LANDING, EVENT_CRASH, EVENT_DITCH, EVENT_STALL, EVENT_FUEL_EMPTY } from './flight.js';
import { createMission, stepMission, currentTarget, onTouchdown, onFail, stageLabel, STAGE_DONE, STAGE_FAILED } from './missions.js';
import { createAudio } from './audio.js';
import { createHud, updateHud } from './hud.js';
import { createInput } from './input.js';
import { simulate, SHOT_SCENES } from './shots.js';

const params = new URLSearchParams(window.location.search);
const shotName = params.get('shot');
const shotScene = shotName ? SHOT_SCENES[shotName] : null;

// --- boot ---
const canvas = document.getElementById('game-canvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 6000);
const world = buildWorld(scene);
const planeParts = buildPlane();
scene.add(planeParts.group);
const hud = createHud();
const input = createInput(canvas);
const audio = createAudio();

let flight = createFlightState();
let mission = createMission();
let view = 'chase'; // 'chase' | 'cockpit'
let state = shotScene ? 'shot' : 'title'; // title | playing | paused | over | shot
let message = '';
let messageKind = '';
let messageUntil = 0;
let best = 0;
try {
  best = Number(localStorage.getItem(BEST_KEY) || 0) || 0;
} catch {
  best = 0;
}
let alarmAt = 0;
let dropPressed = false;
let shotLog = [];

function showMessage(text, kind = '', seconds = 3) {
  message = text;
  messageKind = kind;
  messageUntil = flight.time + seconds;
}

function resetGame() {
  flight = createFlightState();
  mission = createMission();
  // Rings back to gold.
  for (const ring of world.rings) {
    ring.passed = false;
    ring.mesh.material.color.setHex(0xffc93c);
  }
  input.setThrottle(0);
  showMessage('Full throttle (SHIFT), lift off with ↑ — thread the rings!', '', 5);
}

// --- orientation: build the plane's basis from heading, pitch and roll ---
const _f = new THREE.Vector3();
const _r = new THREE.Vector3();
const _u = new THREE.Vector3();
const _up0 = new THREE.Vector3(0, 1, 0);
const _m = new THREE.Matrix4();

function orientPlane() {
  const h = flight.heading;
  const p = flight.pitch;
  _f.set(Math.cos(h) * Math.cos(p), Math.sin(p), -Math.sin(h) * Math.cos(p));
  _r.set(-_f.z, 0, _f.x).normalize(); // right wing: perpendicular, level
  _u.crossVectors(_r, _f).normalize();
  // Bank: rotate right and up around the nose axis.
  const cr = Math.cos(flight.roll);
  const sr = Math.sin(flight.roll);
  const rx = _r.x * cr + _u.x * sr;
  const ry = _r.y * cr + _u.y * sr;
  const rz = _r.z * cr + _u.z * sr;
  const ux = _u.x * cr - _r.x * sr;
  const uy = _u.y * cr - _r.y * sr;
  const uz = _u.z * cr - _r.z * sr;
  _r.set(rx, ry, rz);
  _u.set(ux, uy, uz);
  _m.makeBasis(_f, _u, _r);
  planeParts.group.quaternion.setFromRotationMatrix(_m);
  planeParts.group.position.set(flight.x, flight.y, flight.z);
  return { f: _f.clone(), r: _r.clone(), u: _u.clone() };
}

function updateCamera(basis) {
  const shake = flight.shake > 0.2 || flight.damage > 40 ? (flight.shake + flight.damage / 200) * 0.35 : 0;
  const jx = shake ? (Math.random() - 0.5) * shake : 0;
  const jy = shake ? (Math.random() - 0.5) * shake : 0;
  if (view === 'cockpit') {
    // Above and just behind the canopy, looking forward over the nose: the
    // camera must clear the canopy dome (top ~1.3 m) and sit far enough back
    // that the prop reads as a spinner, not a slab across the frame.
    camera.position.set(
      flight.x + basis.f.x * 0.8 + basis.u.x * 1.6 + jx,
      flight.y + basis.f.y * 0.8 + basis.u.y * 1.6 + jy,
      flight.z + basis.f.z * 0.8 + basis.u.z * 1.6,
    );
    camera.lookAt(
      flight.x + basis.f.x * 60 + basis.u.x * 0.5,
      flight.y + basis.f.y * 60 + basis.u.y * 0.5,
      flight.z + basis.f.z * 60 + basis.u.z * 0.5,
    );
    camera.up.copy(basis.u);
  } else {
    camera.position.set(
      flight.x - basis.f.x * 13 + basis.u.x * 4.6 + jx,
      flight.y - basis.f.y * 13 + basis.u.y * 4.6 + jy,
      flight.z - basis.f.z * 13 + basis.u.z * 4.6,
    );
    camera.lookAt(
      flight.x + basis.f.x * 20,
      flight.y + basis.f.y * 20 + 1,
      flight.z + basis.f.z * 20,
    );
    // The horizon banks a little with the plane, but never fully.
    camera.up.set(basis.u.x * 0.35, 0.65 + basis.u.y * 0.35, basis.u.z * 0.35).normalize();
  }
  document.getElementById('cockpit-frame').style.display = view === 'cockpit' ? 'block' : 'none';
  document.getElementById('gauges').style.width = view === 'cockpit' ? 'min(720px, 90vw)' : 'min(560px, 86vw)';
}

function setScreen(name) {
  for (const id of ['screen-title', 'screen-pause', 'screen-over']) {
    document.getElementById(id).style.display = id === `screen-${name}` ? 'flex' : 'none';
  }
}

function showHud() {
  document.getElementById('hud').style.display = 'flex';
}

function showOver() {
  state = 'over';
  const m = mission;
  document.getElementById('over-title').textContent = m.stage === STAGE_DONE ? `DELIVERED — ${m.rating} RATING` : 'SORTIE OVER';
  document.getElementById('over-verdict').textContent = m.verdict;
  document.getElementById('over-stats').innerHTML =
    `Score <b>${m.score}</b> &nbsp;·&nbsp; Rings <b>${m.ringsPassed} / 8</b> &nbsp;·&nbsp; ` +
    `Drop <b>${m.dropAccuracy === null ? '—' : `${m.dropAccuracy.toFixed(0)} m off`}</b> &nbsp;·&nbsp; ` +
    `Time <b>${Math.round(m.elapsed)} s</b> &nbsp;·&nbsp; Fuel left <b>${Math.round(flight.fuel)}%</b><br>` +
    `Best score <b>${Math.max(best, m.score)}</b>`;
  if (m.score > best) {
    best = m.score;
    try {
      localStorage.setItem(BEST_KEY, String(best));
    } catch {
      // Best score is nice to have, not essential.
    }
  }
  setScreen('over');
}

function stepGame(dt) {
  const ctl = input.read(dt);
  if (input.consume('KeyG')) flight.gearDown = !flight.gearDown;
  if (input.consume('KeyC')) {
    view = view === 'chase' ? 'cockpit' : 'chase';
    showMessage(view === 'cockpit' ? 'Cockpit view' : 'Chase view', '', 1.5);
  }
  if (input.consume('KeyM')) {
    const muted = audio.toggleMute();
    showMessage(muted ? 'Sound off' : 'Sound on', '', 1.5);
  }
  if (input.consume('Space') || input.consume('Enter')) dropPressed = true;
  const wind = windAt(flight, mission.stage);
  const events = stepFlight(flight, {
    pitch: ctl.pitch, roll: ctl.roll, throttle: ctl.throttle,
    gear: flight.gearDown, windX: wind.x, windZ: wind.z,
  }, dt);
  const mEvents = stepMission(mission, flight, world.rings, dropPressed, dt);
  dropPressed = false;

  for (const e of mEvents) {
    if (e === 'ring') {
      audio.ring();
      showMessage(`Ring ${mission.ringsPassed} of 8 — +${SCORE.ring}`, 'good', 2.5);
    } else if (e === 'drop') {
      audio.drop();
      showMessage(`Mail away — ${mission.dropAccuracy.toFixed(0)} m off centre`, 'good', 3);
    } else if (e === 'drop-too-high') {
      showMessage('Too high or too fast — get low and slow over the gold circle', 'warn', 3);
    } else if (e === 'stage') {
      showMessage(stageLabel(mission.stage), '', 4);
    }
  }
  if (events & EVENT_STALL) {
    if (flight.time - alarmAt > 1.2) {
      alarmAt = flight.time;
      audio.alarm();
      showMessage('STALL — nose down, throttle up!', 'warn', 1.5);
    }
  }
  if (events & EVENT_FUEL_EMPTY) {
    showMessage('FUEL EMPTY — glide it down, gently', 'warn', 4);
  }
  if (events & (EVENT_TOUCHDOWN | EVENT_HARD_LANDING)) {
    audio.thud();
    const rw = runwayAt(flight.x, flight.z);
    if (rw) {
      const done = onTouchdown(mission, flight, rw);
      if (done) {
        showOver();
        return;
      }
      if (events & EVENT_HARD_LANDING) showMessage('Hard landing — airframe damaged', 'warn', 3);
      else showMessage('Down safe — rolling out', '', 2);
    }
  }
  if (events & EVENT_DITCH) {
    audio.thud();
    onFail(mission, 'Forced down away from the runway — the mail is late, the pilot walks away.');
    showOver();
    return;
  }
  if (events & EVENT_CRASH) {
    audio.crash();
    const reason = flight.onGround
      ? 'Ran off the runway — the sortie ends in the rough.'
      : flight.y < 2
        ? 'Into the sea — the postman flies again tomorrow.'
        : 'Into the rock — the canyon wins this round.';
    onFail(mission, reason);
    showOver();
    return;
  }
  if (flight.fuel < 20 && flight.fuel > 0 && flight.time - alarmAt > 4) {
    alarmAt = flight.time;
    showMessage('LOW FUEL — head home', 'warn', 3);
  }
  if (flight.time > messageUntil) {
    message = '';
  }
}

// --- the loop ---
let last = performance.now();
let acc = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const dtMs = Math.min(100, now - last);
  last = now;
  if (state === 'playing') {
    acc += dtMs / 1000;
    while (acc >= STEP) {
      stepGame(STEP);
      acc -= STEP;
      if (state !== 'playing') break;
    }
  }
  if (state === 'playing' || state === 'over' || state === 'paused') {
    const basis = orientPlane();
    posePlane(planeParts, flight, flight.time);
    updateCamera(basis);
    updateHud(hud, flight, mission, currentTarget(mission), message, messageKind);
    audio.update(flight.throttle, flight.speed, flight.airborne);
    // The sea moves a little: boats drift, clouds creep.
    for (const boat of world.boats) boat.position.x += 0.004;
    for (const cloud of world.clouds) cloud.position.x += 0.01;
    renderer.render(scene, camera);
  }
}

// --- screens ---
document.getElementById('start-btn').addEventListener('click', () => {
  audio.unlock();
  resetGame();
  state = 'playing';
  setScreen('');
  showHud();
  showMessage(stageLabel(mission.stage), '', 5);
});
document.getElementById('resume-btn').addEventListener('click', () => {
  state = 'playing';
  setScreen('');
});
document.getElementById('restart-btn').addEventListener('click', () => {
  audio.unlock();
  resetGame();
  state = 'playing';
  setScreen('');
  showHud();
});
document.getElementById('title-restart-btn').addEventListener('click', () => {
  audio.unlock();
  resetGame();
  state = 'playing';
  setScreen('');
  showHud();
});
window.addEventListener('keydown', (e) => {
  if (e.code === 'KeyP' || e.code === 'Escape') {
    if (state === 'playing') {
      state = 'paused';
      setScreen('pause');
    } else if (state === 'paused') {
      state = 'playing';
      setScreen('');
    }
  }
  if (e.code === 'KeyR' && (state === 'over' || state === 'paused')) {
    resetGame();
    state = 'playing';
    setScreen('');
    showHud();
  }
});
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// --- shot mode: one autopilot sortie, one rendered frame, then signal ready ---
if (shotScene) {
  document.getElementById('screen-title').style.display = 'none';
  showHud();
  resetGame();
  state = 'shot';
  shotLog = simulate(flight, mission, world.rings, shotScene.simSeconds, (e) => {
    if (e === 'stage') showMessage(stageLabel(mission.stage), '', 4);
  }, shotScene.stopAt);
  // The landing scene stops mid-final, so the runway and the gear are both
  // in frame; the other scenes stop mid-flight.
  const basis = orientPlane();
  posePlane(planeParts, flight, flight.time);
  view = shotScene.view;
  updateCamera(basis);
  if (mission.stage === STAGE_DONE || mission.stage === STAGE_FAILED) {
    showMessage(mission.stage === STAGE_DONE ? `DELIVERED — ${mission.rating} RATING · ${mission.score} pts` : mission.failReason, mission.stage === STAGE_DONE ? 'good' : 'warn', 99);
  } else {
    showMessage(stageLabel(mission.stage), '', 99);
  }
  updateHud(hud, flight, mission, currentTarget(mission), message, messageKind);
  audio.update(0, 0, false);
  renderer.render(scene, camera);
  window.__shotLog = shotLog;
  window.__shotState = {
    stage: mission.stage,
    score: mission.score,
    rings: mission.ringsPassed,
    x: flight.x, y: flight.y, z: flight.z,
    speed: flight.speed, fuel: flight.fuel, damage: flight.damage,
    gearDown: flight.gearDown, onGround: flight.onGround,
    time: flight.time,
  };
  window.__shotReady = true;
} else {
  document.getElementById('best-line').textContent = best > 0 ? `Best score: ${best}` : '';
  setScreen('title');
  // A parked plane on the runway behind the title screen.
  const basis = orientPlane();
  posePlane(planeParts, flight, 0);
  updateCamera(basis);
  updateHud(hud, flight, mission, currentTarget(mission), '', '');
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
