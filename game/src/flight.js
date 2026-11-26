// Canyon Postman — the flight model. Arcade, not a physics paper: speed chases the
// throttle, lift fails below the stall speed, banking turns the plane and costs
// speed and height, and every choice (throttle, line, landing) spends fuel or
// damage. The same step() drives the player, the autopilot and the screenshots.

import { FLIGHT, WIND, WORLD } from './config.js';
import { terrainHeight, runwayAt } from './world.js';

export const EVENT_NONE = 0;
export const EVENT_TOUCHDOWN = 1;
export const EVENT_HARD_LANDING = 2;
export const EVENT_CRASH = 4;
export const EVENT_DITCH = 8;
export const EVENT_STALL = 16;
export const EVENT_FUEL_EMPTY = 32;

/** Fresh flight state, sitting on the home runway ready to roll. */
export function createFlightState() {
  return {
    x: WORLD.homeRunway.x0 + 6,
    y: WORLD.homeRunway.y + 1.2,
    z: 0,
    heading: 0, // 0 = +x (east, toward the canyon)
    pitch: 0,
    roll: 0,
    speed: 0,
    throttle: 0,
    fuel: FLIGHT.fuelStart,
    damage: 0,
    gearDown: true,
    onGround: true,
    airborne: false,
    verticalSpeed: 0,
    stalled: false,
    engineOut: false,
    shake: 0,
    yawDrift: 0,
    pitchInput: 0,
    rollInput: 0,
    time: 0,
  };
}

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

/**
 * One fixed step. `input` is { pitch, roll, throttle, gear } with pitch/roll in
 * [-1, 1] and throttle in [0, 1]; `wind` is { x, z } in m/s. Returns an event mask.
 */
export function stepFlight(s, input, dt) {
  let events = EVENT_NONE;
  s.time += dt;
  s.pitchInput = input.pitch;
  s.rollInput = input.roll;
  if (input.gear !== undefined) s.gearDown = input.gear;

  // Throttle: the lever moves, the engine follows.
  const wantThrottle = s.engineOut ? 0 : clamp(input.throttle, 0, 1);
  s.throttle += (wantThrottle - s.throttle) * Math.min(1, dt * 1.6);

  // Speed chases throttle * maxSpeed, with a lag that makes throttle matter.
  const targetSpeed = s.throttle * FLIGHT.maxSpeed;
  s.speed += (targetSpeed - s.speed) * Math.min(1, dt * FLIGHT.accel);
  if (s.speed < 0) s.speed = 0;

  // Fuel: full throttle is thirsty; empty means gliding home.
  if (s.throttle > 0.02 && s.fuel > 0) {
    s.fuel -= s.throttle * FLIGHT.fuelDrain * dt;
    if (s.fuel <= 0) {
      s.fuel = 0;
      s.engineOut = true;
      events |= EVENT_FUEL_EMPTY;
    }
  }

  if (s.onGround) {
    // Rolling on the runway: steer a little with roll, lift off with pitch + speed.
    // Heading falls as the plane turns right, so right stick subtracts.
    s.heading -= s.rollInput * 0.25 * dt * Math.min(1, s.speed / 20);
    s.x += Math.cos(s.heading) * s.speed * dt;
    s.z += -Math.sin(s.heading) * s.speed * dt;
    const rwHere = runwayAt(s.x, s.z);
    if (rwHere) {
      s.y = rwHere.y + 1.2;
      if (s.speed > FLIGHT.takeoffSpeed && input.pitch > 0.15) {
        s.onGround = false;
        s.airborne = true;
        s.pitch = 0.12;
      }
      return events;
    }
    // Off the strip: rough ground. Fast is the end of the sortie.
    s.y = terrainHeight(s.x, s.z) + 1.2;
    if (s.speed > 22) {
      events |= EVENT_CRASH;
      return events;
    }
    s.speed = Math.max(0, s.speed - 12 * dt);
    if (s.speed <= 0.5) events |= EVENT_DITCH;
    return events;
  }

  // --- in the air ---
  // Pitch and roll answer the stick; roll eases back toward level on its own.
  // Pitch input is +1 for nose up, -1 for nose down (see input.js).
  s.pitch += input.pitch * FLIGHT.pitchRate * dt;
  s.pitch = clamp(s.pitch, -FLIGHT.maxPitch, FLIGHT.maxPitch);
  s.roll += input.roll * FLIGHT.rollRate * dt;
  s.roll = clamp(s.roll, -FLIGHT.maxRoll, FLIGHT.maxRoll);
  if (Math.abs(input.roll) < 0.05) s.roll -= s.roll * Math.min(1, dt * FLIGHT.rollStability);

  // A banked turn: turn rate from the bank, and it costs speed and height.
  // Banking right (roll > 0) turns right, which is heading falling.
  const turnRate = (9.81 * Math.tan(s.roll)) / Math.max(s.speed, 8);
  s.heading -= turnRate * dt;
  s.speed -= Math.abs(turnRate) * s.speed * FLIGHT.turnBleed * dt;

  // Damage makes the nose wander: the plane never quite flies straight.
  if (s.damage > 30) {
    s.yawDrift += (Math.random() - 0.5) * (s.damage / 100) * 0.02;
    s.heading += s.yawDrift * dt;
    s.yawDrift *= 0.98;
  }

  // Stall: too slow and the wing gives up — nose drops, the plane shakes.
  s.stalled = s.speed < FLIGHT.stallSpeed;
  if (s.stalled) {
    s.pitch += (-0.35 - s.pitch) * Math.min(1, dt * 2.2);
    s.shake = 1;
    events |= EVENT_STALL;
  } else {
    s.shake = Math.max(0, s.shake - dt * 2);
  }

  // Vertical speed from pitch; climbing spends speed, diving buys it back.
  s.verticalSpeed = s.speed * Math.sin(s.pitch) - (s.stalled ? 6 : 0.5);
  if (s.verticalSpeed > 0) s.speed -= s.verticalSpeed * FLIGHT.climbBleed * dt;
  else s.speed -= s.verticalSpeed * FLIGHT.diveGain * dt;

  // Move: forward along the heading, up by the climb, pushed by the wind.
  const fx = Math.cos(s.heading);
  const fz = -Math.sin(s.heading);
  s.x += fx * s.speed * dt + (input.windX || 0) * dt;
  s.z += fz * s.speed * dt + (input.windZ || 0) * dt;
  s.y += s.verticalSpeed * dt;

  // --- the ground and the sea ---
  const ground = terrainHeight(s.x, s.z);
  const rw = runwayAt(s.x, s.z);
  const overSea = ground <= 0.5;
  if (s.y <= ground + 1.2) {
    if (rw && s.gearDown && Math.abs(s.verticalSpeed) <= FLIGHT.landingMaxDescent && s.speed <= FLIGHT.landingMaxSpeed) {
      // A proper touchdown: roll out on the runway.
      const descent = Math.abs(s.verticalSpeed);
      s.onGround = true;
      s.y = rw.y + 1.2;
      s.pitch = 0;
      s.roll = 0;
      s.verticalSpeed = 0;
      if (descent > FLIGHT.crashDescent * 0.5) {
        s.damage += FLIGHT.damageHardLanding;
        events |= EVENT_HARD_LANDING;
      } else {
        events |= EVENT_TOUCHDOWN;
      }
      if (s.damage >= FLIGHT.damageMax) events |= EVENT_CRASH;
      return events;
    }
    if (rw && !s.gearDown && Math.abs(s.verticalSpeed) <= FLIGHT.landingMaxDescent && s.speed <= FLIGHT.landingMaxSpeed) {
      // Belly landing: it stops, but it costs.
      s.onGround = true;
      s.y = rw.y + 1.2;
      s.pitch = 0;
      s.roll = 0;
      s.damage += FLIGHT.damageGearUpLanding;
      events |= EVENT_HARD_LANDING;
      if (s.damage >= FLIGHT.damageMax) events |= EVENT_CRASH;
      return events;
    }
    if (s.speed < 12 && Math.abs(s.verticalSpeed) < 2.5 && s.gearDown) {
      // A gentle forced landing on flat ground: the sortie fails, the pilot walks away.
      s.onGround = true;
      s.y = ground + 1.2;
      events |= EVENT_DITCH;
      return events;
    }
    if (overSea && s.speed < 10 && Math.abs(s.verticalSpeed) < 2.5) {
      // Ditching: down on the water, slow and level — failed, not fatal.
      s.onGround = true;
      s.y = 1.2;
      events |= EVENT_DITCH;
      return events;
    }
    events |= EVENT_CRASH;
    return events;
  }
  if (s.y < 0.6 && overSea) {
    events |= EVENT_CRASH;
    return events;
  }
  return events;
}

/** Wind at the plane's position and mission stage. */
export function windAt(s, stage) {
  // Canyon gusts: sideways, coming and going with place and time.
  let windZ = 0;
  let windX = 0;
  const c = WORLD.canyon;
  if (s.x > c.x0 && s.x < c.x1 && Math.abs(s.z) < 160) {
    windZ = Math.sin(s.time * 0.7 + s.x * 0.012) * WIND.canyonGust;
  }
  // Return leg: a steady headwind against the flight home (-x).
  if (stage === 'return') windX = WIND.returnHeadwind;
  return { x: windX, z: windZ };
}
