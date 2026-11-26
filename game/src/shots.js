// Canyon Postman — the autopilot and the fixed screenshot scenes. The autopilot
// flies with the same step() the player uses, so a screenshot is a real game
// state, not a staged diorama: the plane is where the physics put it, the rings
// are the ones the mission passed, the HUD reads the true numbers.

import { STEP, WORLD } from './config.js';
import { stepFlight, windAt } from './flight.js';
import { stepMission, currentTarget, onTouchdown, STAGE_DROP, STAGE_LAND, STAGE_RINGS } from './missions.js';
import { runwayAt } from './world.js';

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

function angleDiff(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/** Autopilot: steer the plane toward the mission's current target.
 * A PD controller, not a bang-bang one: the roll command levels the wings as
 * the heading comes right, and the pitch command eases off as the nose comes
 * up, so the plane threads the rings instead of weaving through the canyon.
 * Bank is capped at 0.7 rad — the autopilot flies like a postman, not a
 * stunt pilot. (Pitch + is nose up; heading falls as the plane turns right.) */
export function autopilot(flight, mission, rings) {
  const target = currentTarget(mission);
  let throttle = 0.8;
  let gear = flight.gearDown;

  if (mission.stage === 'takeoff') {
    throttle = 1;
    // On the runway, hold the stick back once there is flying speed; in the
    // air, climb gently toward the first ring.
    const pitch = flight.onGround ? 0.5 : 0.25;
    return { pitch, roll: 0, throttle, gear: flight.onGround, drop: false };
  }

  const wantHeading = Math.atan2(-(target.z - flight.z), target.x - flight.x);
  const headingErr = angleDiff(wantHeading, flight.heading);
  const roll = clamp(-headingErr * 1.0 - flight.roll * 0.9, -0.7, 0.7);
  const pitch = clamp((target.y - flight.y) * 0.022 - flight.pitch * 0.7, -0.5, 0.5);

  if (mission.stage === STAGE_DROP) {
    throttle = 0.5;
    const dist = Math.hypot(target.x - flight.x, target.z - flight.z);
    // Drop only when properly over the circle: a close drop scores far more.
    const drop = dist < 20 && flight.y < 35 && flight.speed < 34;
    return { pitch, roll, throttle, gear: false, drop };
  }

  if (mission.stage === STAGE_LAND) {
    gear = true;
    // Fly the runway line, not a point: west, with a gentle correction toward
    // the centreline, descending on a shallow glidepath. Aiming at the runway
    // centre itself makes the plane orbit a point right under its nose.
    const desiredHeading = Math.PI - Math.max(-0.3, Math.min(0.3, flight.z * 0.008));
    const headingErr = angleDiff(desiredHeading, flight.heading);
    const landRoll = clamp(-headingErr * 1.0 - flight.roll * 0.9, -0.5, 0.5);
    const glideAlt = WORLD.homeRunway.y + Math.max(0, flight.x) * 0.12;
    // No flare override: the glidepath itself brings the plane down to the
    // runway at about 2 m/s, inside the landing gate. A flare that levels the
    // plane off just makes it float past the strip.
    const landPitch = clamp((glideAlt - flight.y) * 0.03 - flight.pitch * 0.7, -0.5, 0.5);
    const landThrottle = 0.35;
    return { pitch: landPitch, roll: landRoll, throttle: landThrottle, gear, drop: false };
  }

  if (mission.stage === STAGE_RINGS) {
    throttle = 0.75;
    // Rings are flown through at their centre: aim dead on.
    const ring = rings[mission.nextRing];
    if (ring) {
      const want = Math.atan2(-(ring.z - flight.z), ring.x - flight.x);
      const err = angleDiff(want, flight.heading);
      return {
        pitch: clamp((ring.y - flight.y) * 0.022 - flight.pitch * 0.7, -0.5, 0.5),
        roll: clamp(-err * 1.0 - flight.roll * 0.9, -0.7, 0.7),
        throttle,
        gear: false,
        drop: false,
      };
    }
  }

  return { pitch, roll, throttle, gear, drop: false };
}

/**
 * Run the game headless for `seconds` of simulated time, autopilot flying.
 * Returns the event log (rings, drops, landings) so a scene can be verified.
 * `stopAt`, when given, ends the run early once the plane is in the right place
 * (used for the landing scene: stop on final, not after touchdown).
 */
export function simulate(flight, mission, rings, seconds, onEvent, stopAt) {
  const steps = Math.round(seconds / STEP);
  const log = [];
  for (let i = 0; i < steps; i += 1) {
    const ap = autopilot(flight, mission, rings);
    const wind = windAt(flight, mission.stage);
    const events = stepFlight(flight, { pitch: ap.pitch, roll: ap.roll, throttle: ap.throttle, gear: ap.gear, windX: wind.x, windZ: wind.z }, STEP);
    const mEvents = stepMission(mission, flight, rings, ap.drop, STEP);
    for (const e of mEvents) {
      log.push(`${flight.time.toFixed(1)}s ${e}`);
      if (onEvent) onEvent(e, flight, mission);
    }
    if (events & 1 || events & 2) {
      const rw = runwayAt(flight.x, flight.z);
      const done = rw ? onTouchdown(mission, flight, rw) : false;
      log.push(`${flight.time.toFixed(1)}s touchdown${done ? ' — sortie complete' : ''}`);
    }
    if (events & 4) {
      log.push(`${flight.time.toFixed(1)}s CRASH`);
      break;
    }
    if (events & 8) {
      log.push(`${flight.time.toFixed(1)}s ditch`);
      break;
    }
    if (stopAt && stopAt(flight, mission)) {
      log.push(`${flight.time.toFixed(1)}s stopAt`);
      break;
    }
    if (mission.stage === 'done' || mission.stage === 'failed') break;
  }
  return log;
}

// --- the four screenshot scenes, each a fixed moment in one autopilot sortie ---
// Timings come from the autopilot's pace: rings 1-8 at roughly 8-27 s, the drop
// near 33 s, the return leg to about 63 s, touchdown near 75 s.
export const SHOT_SCENES = {
  // Cover: mid ring-run, chase view, golden rings and the canyon walls ahead.
  cover: { simSeconds: 16, view: 'chase', label: 'Ring run over the canyon approach' },
  // Cockpit: on the drop approach, level and steady, far island ahead.
  cockpit: { simSeconds: 27, view: 'cockpit', label: 'Cockpit view toward the far shore' },
  // Canyon: threading the arch at ring six, low between the walls.
  canyon: { simSeconds: 21, view: 'chase', label: 'Threading the stone arch' },
  // Landing: stop on final, gear down, home runway ahead — not after touchdown.
  // Close enough that the runway reads, past ring 1 (x=150) so no passed ring
  // crowds the frame.
  landing: {
    simSeconds: 260, view: 'chase', label: 'Final approach home',
    stopAt: (flight, mission) => mission.stage === 'land' && flight.x < 135 && flight.x > 80 && flight.y < 28,
  },
};
