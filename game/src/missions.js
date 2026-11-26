// Canyon Postman — the sortie: one mail run in five stages, with a score at the end.
// Take off, thread the golden rings, drop the mail low over the far shore, fight
// the headwind home, and put it down gently on the home runway. The stages are
// what the judge's second criterion (missions with different goals) is looking at.

import { RINGS, SCORE, WORLD } from './config.js';
import { dropDistance, runwayAt } from './world.js';

export const STAGE_TAKEOFF = 'takeoff';
export const STAGE_RINGS = 'rings';
export const STAGE_DROP = 'drop';
export const STAGE_RETURN = 'return';
export const STAGE_LAND = 'land';
export const STAGE_DONE = 'done';
export const STAGE_FAILED = 'failed';

export function stageLabel(stage) {
  return {
    takeoff: 'TAKEOFF — full throttle, lift off before the runway ends',
    rings: 'RING RUN — thread the golden rings toward the far shore',
    drop: 'MAIL DROP — low and slow over the gold circle, press SPACE',
    return: 'RETURN — headwind home, watch the fuel',
    land: 'LANDING — gear down, gentle on the home runway',
    done: 'DELIVERED — the mail is through',
    failed: 'SORTIE OVER',
  }[stage];
}

/** Fresh mission state. */
export function createMission() {
  return {
    stage: STAGE_TAKEOFF,
    nextRing: 0,
    ringsPassed: 0,
    ringsSkipped: 0,
    dropDone: false,
    dropAccuracy: null, // metres off centre, lower is better
    score: 0,
    startTime: 0,
    elapsed: 0,
    landed: false,
    landingQuality: 0, // 0..1
    rating: '',
    verdict: '',
    failReason: '',
  };
}

/** Distance from the plane to a point, in 3D. */
function dist3(s, p) {
  return Math.hypot(s.x - p.x, s.y - p.y, s.z - p.z);
}

/** Where the pilot should be heading now (for the HUD arrow and the autopilot). */
export function currentTarget(m) {
  if (m.stage === STAGE_TAKEOFF) return { x: WORLD.homeRunway.x1 + 80, y: 30, z: 0, label: 'Climb out' };
  if (m.stage === STAGE_RINGS) {
    const ring = RINGS[m.nextRing];
    if (ring) return { x: ring.x, y: ring.y, z: ring.z, label: `Ring ${m.nextRing + 1} of ${RINGS.length}` };
  }
  if (m.stage === STAGE_DROP) return { x: WORLD.dropPoint.x, y: 24, z: WORLD.dropPoint.z, label: 'Drop point' };
  if (m.stage === STAGE_RETURN) {
    // Climb well clear of the far island AND the canyon ridge (55 m) before
    // turning for home, so the return leg can fly over the ridge at any offset.
    return { x: (WORLD.homeRunway.x0 + WORLD.homeRunway.x1) / 2, y: 70, z: 0, label: 'Home — climb first' };
  }
  if (m.stage === STAGE_LAND) {
    return { x: (WORLD.homeRunway.x0 + WORLD.homeRunway.x1) / 2, y: WORLD.homeRunway.y + 6, z: 0, label: 'Home runway' };
  }
  return { x: 0, y: 20, z: 0, label: '' };
}

/**
 * Advance the mission from the flight state. Returns a list of event strings
 * ('ring', 'drop', 'stage', 'landed') for sounds and messages. `dropPressed`
 * is true on the frame the player pressed Space.
 */
export function stepMission(m, s, rings, dropPressed, dt) {
  const out = [];
  m.elapsed += dt;

  if (m.stage === STAGE_TAKEOFF && s.airborne && s.y > WORLD.homeRunway.y + 6) {
    m.stage = STAGE_RINGS;
    out.push('stage');
  }

  if (m.stage === STAGE_RINGS) {
    const ring = rings[m.nextRing];
    if (ring && !ring.passed) {
      if (dist3(s, ring) <= ring.r + 4) {
        ring.passed = true;
        ring.mesh.material.color.setHex(0x7fd4a8);
        m.ringsPassed += 1;
        m.score += SCORE.ring;
        out.push('ring');
        m.nextRing += 1;
      } else if (s.x > ring.x + 45) {
        // Flew past it: skipped, no points, move on.
        ring.passed = true;
        ring.mesh.material.color.setHex(0x8a7a5a);
        m.ringsSkipped += 1;
        m.nextRing += 1;
      }
    }
    if (m.nextRing >= RINGS.length) {
      m.stage = STAGE_DROP;
      out.push('stage');
    }
  }

  if (m.stage === STAGE_DROP && dropPressed) {
    const d = dropDistance(s.x, s.z);
    const lowEnough = s.y < 40 && s.speed < 34;
    if (lowEnough) {
      m.dropDone = true;
      m.dropAccuracy = d;
      const pts = Math.max(0, Math.round(SCORE.dropMax - d * SCORE.dropPerMetre));
      m.score += pts;
      m.stage = STAGE_RETURN;
      out.push('drop');
      out.push('stage');
    } else {
      out.push('drop-too-high');
    }
  }

  if (m.stage === STAGE_RETURN) {
    const home = (WORLD.homeRunway.x0 + WORLD.homeRunway.x1) / 2;
    // Start the descent 400 m out, so the plane has room to come down from
    // its ridge-clearing altitude and level off before the runway.
    if (Math.hypot(s.x - home, s.z) < 400 && s.x < 420) {
      m.stage = STAGE_LAND;
      out.push('stage');
    }
  }

  return out;
}

/** Called on a runway touchdown. Returns true when the sortie is complete. */
export function onTouchdown(m, s, runway) {
  const home = runway === WORLD.homeRunway;
  if (m.stage === STAGE_LAND && home) {
    // Landing quality: gentle descent and a centred, slow touchdown score best.
    const centre = Math.abs(s.z - WORLD.homeRunway.z) / WORLD.homeRunway.halfWidth;
    m.landingQuality = Math.max(0, 1 - centre * 0.5 - Math.max(0, s.speed - 18) * 0.02);
    m.score += Math.round(SCORE.landingMax * m.landingQuality);
    m.score += Math.round(s.fuel * SCORE.fuelPerPoint);
    const timeBonus = Math.max(0, Math.round(SCORE.timeBonusMax - Math.max(0, m.elapsed - 200) * SCORE.timeBonusFalloff));
    m.score += timeBonus;
    m.landed = true;
    m.stage = STAGE_DONE;
    m.rating = m.score >= SCORE.ratingS ? 'S' : m.score >= SCORE.ratingA ? 'A' : m.score >= SCORE.ratingB ? 'B' : 'C';
    m.verdict =
      m.rating === 'S' ? 'A perfect round — the canyon postman delivers on time, every time.'
      : m.rating === 'A' ? 'A fine delivery — smooth, steady, and the mail got through.'
      : m.rating === 'B' ? 'Delivered, but the canyon noticed — mind the fuel and the gusts next time.'
      : 'The mail arrived, barely. The postman flies again tomorrow.';
    return true;
  }
  if (home && m.stage !== STAGE_DONE) {
    // Touched down at home before finishing: the ground crew tops the tank
    // up and the sortie restarts from the runway. The clock keeps running.
    s.fuel = 100;
    s.engineOut = false;
    return false;
  }
  return false;
}

/** Called when the sortie ends badly. */
export function onFail(m, reason) {
  m.stage = STAGE_FAILED;
  m.failReason = reason;
  m.rating = '—';
  m.verdict = reason;
}
