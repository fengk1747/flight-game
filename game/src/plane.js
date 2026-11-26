// Canyon Postman — the mail plane, built part by part from primitives so it reads
// as a built aircraft: spinning prop, deflecting ailerons and elevator, landing
// gear that folds away. Orange and white, the way the design doc paints it.

import { PALETTE } from './config.js';

function mat(color, opts = {}) {
  return new THREE.MeshLambertMaterial({ color, ...opts });
}

/** Build the plane. Returns { group, prop, aileronL, aileronR, elevator, gear, navL, navR }. */
export function buildPlane() {
  const group = new THREE.Group();
  const white = mat(PALETTE.planeWhite);
  const orange = mat(PALETTE.planeOrange);
  const dark = mat(PALETTE.planeDark);
  const glass = new THREE.MeshLambertMaterial({ color: 0x1c2733, transparent: true, opacity: 0.92 });

  // Fuselage: a tapered cylinder along +x (the nose), with an orange belly stripe.
  const fuselage = new THREE.Mesh(new THREE.CylinderGeometry(1.05, 0.62, 5.6, 12), white);
  fuselage.rotation.z = Math.PI / 2;
  group.add(fuselage);
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.62, 1.1, 12), orange);
  nose.rotation.z = -Math.PI / 2;
  nose.position.x = 3.3;
  group.add(nose);
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(4.6, 0.22, 2.06), orange);
  stripe.position.set(-0.2, -0.42, 0);
  group.add(stripe);

  // Canopy: a dark glass half-dome over the cockpit.
  const canopy = new THREE.Mesh(new THREE.SphereGeometry(0.78, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), glass);
  canopy.scale.set(1.5, 0.85, 1);
  canopy.position.set(1.15, 0.62, 0);
  group.add(canopy);

  // Main wing: one wide slab with orange tips, set slightly behind the middle.
  const wing = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.16, 7.6), white);
  wing.position.set(0.35, 0.05, 0);
  group.add(wing);
  for (const s of [-1, 1]) {
    const tip = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.18, 0.7), orange);
    tip.position.set(0.35, 0.05, s * 3.65);
    group.add(tip);
  }

  // Ailerons: the outer trailing-edge panels, hinged so they deflect with roll input.
  const aileronGeo = new THREE.BoxGeometry(0.55, 0.1, 1.5);
  const aileronL = new THREE.Group();
  const aileronLm = new THREE.Mesh(aileronGeo, orange);
  aileronLm.position.set(-0.28, 0, 0);
  aileronL.add(aileronLm);
  aileronL.position.set(-0.55, 0.05, -2.9);
  const aileronR = new THREE.Group();
  const aileronRm = new THREE.Mesh(aileronGeo, orange);
  aileronRm.position.set(-0.28, 0, 0);
  aileronR.add(aileronRm);
  aileronR.position.set(-0.55, 0.05, 2.9);
  group.add(aileronL, aileronR);

  // Tail: horizontal stabiliser + vertical fin, both with orange tips.
  const stab = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.12, 2.9), white);
  stab.position.set(-2.55, 0.18, 0);
  group.add(stab);
  const elevator = new THREE.Group();
  const elevMesh = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.09, 2.9), orange);
  elevMesh.position.set(-0.21, 0, 0);
  elevator.add(elevMesh);
  elevator.position.set(-3.0, 0.18, 0);
  group.add(elevator);
  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.95, 1.5, 0.14), orange);
  fin.position.set(-2.55, 0.85, 0);
  group.add(fin);

  // Propeller: hub + two blades, spinning with throttle. The blades are
  // translucent, the way a spinning prop reads as a blur, so they never fill
  // the cockpit view with a black slab.
  const prop = new THREE.Group();
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.5, 8), dark);
  hub.rotation.z = Math.PI / 2;
  prop.add(hub);
  const bladeMat = new THREE.MeshLambertMaterial({ color: PALETTE.planeDark, transparent: true, opacity: 0.25 });
  for (const a of [0, Math.PI]) {
    // Thin blades: a spinning prop reads as a blur, and a thin blade never
    // fills the cockpit view with a bar.
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.12, 2.3, 0.08), bladeMat);
    blade.rotation.x = a;
    blade.position.x = 0.1;
    prop.add(blade);
  }
  prop.position.set(3.95, 0, 0);
  group.add(prop);

  // Landing gear: two mains + a nose wheel, folding up when retracted.
  const gear = new THREE.Group();
  for (const s of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 1.1, 6), dark);
    leg.position.set(0.9, -1.0, s * 1.05);
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.24, 10), dark);
    wheel.rotation.x = Math.PI / 2;
    wheel.position.set(0.9, -1.55, s * 1.05);
    gear.add(leg, wheel);
  }
  const noseLeg = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 1.0, 6), dark);
  noseLeg.position.set(2.4, -0.95, 0);
  const noseWheel = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.22, 10), dark);
  noseWheel.rotation.x = Math.PI / 2;
  noseWheel.position.set(2.4, -1.45, 0);
  gear.add(noseLeg, noseWheel);
  group.add(gear);

  // Navigation lights: red port, green starboard, white tail — always lit.
  const navL = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff3b30 }));
  navL.position.set(0.35, 0.1, -3.85);
  const navR = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 6), new THREE.MeshBasicMaterial({ color: 0x35e07a }));
  navR.position.set(0.35, 0.1, 3.85);
  const navTail = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), new THREE.MeshBasicMaterial({ color: 0xfff2c0 }));
  navTail.position.set(-2.85, 0.2, 0);
  group.add(navL, navR, navTail);

  return { group, prop, aileronL, aileronR, elevator, gear, navL, navR };
}

/** Pose the plane's moving parts from the flight state. */
export function posePlane(parts, state, time) {
  // Prop spins with throttle (and windmills a little when gliding).
  parts.prop.rotation.x += (2 + state.throttle * 38) * (1 / 60);
  // Ailerons deflect opposite with roll input; elevator with pitch input.
  parts.aileronL.rotation.x = -state.rollInput * 0.5;
  parts.aileronR.rotation.x = state.rollInput * 0.5;
  parts.elevator.rotation.z = state.pitchInput * 0.45;
  // Gear folds up smoothly when retracted.
  const target = state.gearDown ? 0 : -Math.PI / 2;
  parts.gear.rotation.x += (target - parts.gear.rotation.x) * 0.08;
  // Nav lights blink slowly.
  const blink = Math.sin(time * 3) > -0.4;
  parts.navL.visible = blink;
  parts.navR.visible = blink;
}
