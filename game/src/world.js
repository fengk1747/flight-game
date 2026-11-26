// Canyon Postman — the world: terrain height, and the Three.js scene built from it.
// The visual terrain and the collision terrain are the same function, so what you
// see is what you can hit. Everything here is procedural: no model or texture file.

import { WORLD, RINGS, PALETTE } from './config.js';

function smoothstep(a, b, x) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/** Ground height in metres at (x, z). 0 is the sea. */
export function terrainHeight(x, z) {
  let h = 0;
  // Home island: flat-topped mesa, so the runway sits level.
  const rh = Math.hypot(x - WORLD.homeIsland.x, z - WORLD.homeIsland.z);
  h = Math.max(h, WORLD.homeIsland.top * (1 - smoothstep(WORLD.homeIsland.flatRadius, WORLD.homeIsland.falloff, rh)));
  // Far island: same shape, a little taller.
  const rf = Math.hypot(x - WORLD.farIsland.x, z - WORLD.farIsland.z);
  h = Math.max(h, WORLD.farIsland.top * (1 - smoothstep(WORLD.farIsland.flatRadius, WORLD.farIsland.falloff, rf)));
  // Canyon ridge: a long terracotta wall with a notch (the arch gap) at z = 0.
  const c = WORLD.canyon;
  const sx = smoothstep(c.x0, c.x0 + 50, x) * (1 - smoothstep(c.x1 - 50, c.x1, x));
  const sz = smoothstep(c.gapHalfWidth, c.gapHalfWidth + c.gapFeather, Math.abs(z));
  h = Math.max(h, c.height * sx * sz);
  // Scattered rocks, and the lighthouse rock.
  for (const rock of WORLD.rocks) {
    const rr = Math.hypot(x - rock.x, z - rock.z);
    h = Math.max(h, rock.h * (1 - smoothstep(0, rock.r, rr)));
  }
  const rl = Math.hypot(x - WORLD.lighthouse.x, z - WORLD.lighthouse.z);
  h = Math.max(h, WORLD.lighthouse.h * (1 - smoothstep(0, WORLD.lighthouse.r, rl)));
  return h;
}

/** The runway under (x, z), or null. Runways are flat, so landings read clearly. */
export function runwayAt(x, z) {
  for (const rw of [WORLD.homeRunway, WORLD.farRunway]) {
    if (x >= rw.x0 && x <= rw.x1 && Math.abs(z - rw.z) <= rw.halfWidth) return rw;
  }
  return null;
}

/** Distance from (x, z) to the drop point's centre. */
export function dropDistance(x, z) {
  return Math.hypot(x - WORLD.dropPoint.x, z - WORLD.dropPoint.z);
}

function lambert(color, opts = {}) {
  return new THREE.MeshLambertMaterial({ color, ...opts });
}

function box(w, h, d, color, x, y, z) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), lambert(color));
  m.position.set(x, y, z);
  return m;
}

/** Build the whole scene. Returns { rings, dropMarker, sunLight, clouds, archTop }. */
export function buildWorld(scene) {
  // Sky: a big gradient dome (BackSide sphere with vertex colours), plus fog.
  const skyGeo = new THREE.SphereGeometry(2600, 24, 16);
  const top = new THREE.Color(PALETTE.skyTop);
  const horizon = new THREE.Color(PALETTE.skyHorizon);
  const colors = [];
  const pos = skyGeo.attributes.position;
  for (let i = 0; i < pos.count; i += 1) {
    const t = Math.max(0, pos.getY(i) / 2600);
    const c = horizon.clone().lerp(top, Math.pow(t, 0.7));
    colors.push(c.r, c.g, c.b);
  }
  skyGeo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  const sky = new THREE.Mesh(skyGeo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false }));
  scene.add(sky);
  scene.fog = new THREE.Fog(PALETTE.fog, 500, 2400);

  // Sun: a low golden disc with a soft halo, sitting over the far sea.
  const sun = new THREE.Mesh(
    new THREE.CircleGeometry(90, 32),
    new THREE.MeshBasicMaterial({ color: PALETTE.sun, fog: false }),
  );
  sun.position.set(1900, 150, -350);
  sun.lookAt(0, 120, 0);
  scene.add(sun);
  const halo = new THREE.Mesh(
    new THREE.CircleGeometry(190, 32),
    new THREE.MeshBasicMaterial({ color: PALETTE.sun, transparent: true, opacity: 0.22, fog: false }),
  );
  halo.position.copy(sun.position).add(new THREE.Vector3(0, 0, -4));
  halo.lookAt(0, 120, 0);
  scene.add(halo);

  // Lights: warm low sun + cool sky fill.
  const sunLight = new THREE.DirectionalLight(0xffc98a, 1.5);
  sunLight.position.set(1500, 420, -600);
  scene.add(sunLight);
  scene.add(new THREE.AmbientLight(0x8fa3c8, 0.85));

  // Sea: a big teal plane with a second, darker sheet just under it for depth.
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(5200, 2600), lambert(PALETTE.sea));
  sea.rotation.x = -Math.PI / 2;
  sea.position.set(700, 0, 0);
  scene.add(sea);

  // Terrain: one displaced plane, vertex-coloured by height and place.
  const tw = 2200;
  const td = 1100;
  const segX = 150;
  const segZ = 75;
  const geo = new THREE.PlaneGeometry(tw, td, segX, segZ);
  geo.rotateX(-Math.PI / 2);
  const p = geo.attributes.position;
  const cols = [];
  const sand = new THREE.Color(PALETTE.sand);
  const top1 = new THREE.Color(PALETTE.islandTop);
  const rock = new THREE.Color(PALETTE.canyon);
  const rockDark = new THREE.Color(PALETTE.canyonDark);
  const grass = new THREE.Color(PALETTE.grass);
  for (let i = 0; i < p.count; i += 1) {
    const x = p.getX(i) + 650;
    const z = p.getZ(i);
    const h = terrainHeight(x, z);
    p.setY(i, h);
    let c;
    if (h <= 0.5) c = sand.clone();
    else if (h < 3) c = sand.clone().lerp(grass, 0.5);
    else if (x > WORLD.canyon.x0 - 40 && x < WORLD.canyon.x1 + 40 && Math.abs(z) > 10) c = rock.clone().lerp(rockDark, Math.min(1, h / 60));
    else c = top1.clone().lerp(grass, 0.35);
    // Slight noise so the flats read as low-poly facets, not a smooth sheet.
    const n = 0.94 + 0.06 * Math.abs(Math.sin(x * 0.37 + z * 0.53));
    cols.push(c.r * n, c.g * n, c.b * n);
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  geo.computeVertexNormals();
  const terrain = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
  terrain.position.set(650, 0, 0);
  scene.add(terrain);

  // Runways: dark strips with white dashes and a threshold bar.
  for (const rw of [WORLD.homeRunway, WORLD.farRunway]) {
    const len = rw.x1 - rw.x0;
    const strip = new THREE.Mesh(new THREE.PlaneGeometry(len, rw.halfWidth * 2), lambert(PALETTE.runway));
    strip.rotation.x = -Math.PI / 2;
    strip.position.set((rw.x0 + rw.x1) / 2, rw.y + 0.15, rw.z);
    scene.add(strip);
    for (let d = -len / 2 + 12; d < len / 2 - 6; d += 14) {
      const dash = new THREE.Mesh(new THREE.PlaneGeometry(7, 0.7), lambert(PALETTE.runwayMark));
      dash.rotation.x = -Math.PI / 2;
      dash.position.set((rw.x0 + rw.x1) / 2 + d, rw.y + 0.3, rw.z);
      scene.add(dash);
    }
  }

  // The stone arch: two pillars and a lintel over the canyon gap.
  const arch = new THREE.Group();
  const pillarGeo = new THREE.BoxGeometry(10, 46, 14);
  const left = new THREE.Mesh(pillarGeo, lambert(PALETTE.canyonDark));
  left.position.set(650, 23, -22);
  const right = new THREE.Mesh(pillarGeo, lambert(PALETTE.canyonDark));
  right.position.set(650, 23, 22);
  const lintel = new THREE.Mesh(new THREE.BoxGeometry(12, 10, 62), lambert(PALETTE.canyon));
  lintel.position.set(650, 50, 0);
  arch.add(left, right, lintel);
  scene.add(arch);

  // Golden rings along the route.
  const rings = RINGS.map((ring) => {
    const mesh = new THREE.Mesh(
      new THREE.TorusGeometry(ring.r, 1.1, 10, 36),
      new THREE.MeshBasicMaterial({ color: PALETTE.ring }),
    );
    mesh.position.set(ring.x, ring.y, ring.z);
    scene.add(mesh);
    return { ...ring, mesh, passed: false };
  });

  // Mail drop marker: a gold ring flat on the ground + a flag pole.
  const dropMarker = new THREE.Group();
  const dropRing = new THREE.Mesh(
    new THREE.RingGeometry(WORLD.dropPoint.radius - 1.2, WORLD.dropPoint.radius, 40),
    new THREE.MeshBasicMaterial({ color: PALETTE.ring, side: THREE.DoubleSide }),
  );
  dropRing.rotation.x = -Math.PI / 2;
  dropRing.position.set(WORLD.dropPoint.x, terrainHeight(WORLD.dropPoint.x, WORLD.dropPoint.z) + 0.4, WORLD.dropPoint.z);
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 12, 6), lambert(PALETTE.planeDark));
  pole.position.set(WORLD.dropPoint.x, terrainHeight(WORLD.dropPoint.x, WORLD.dropPoint.z) + 6, WORLD.dropPoint.z);
  const flag = new THREE.Mesh(new THREE.PlaneGeometry(7, 4), new THREE.MeshBasicMaterial({ color: PALETTE.ring, side: THREE.DoubleSide }));
  flag.position.set(WORLD.dropPoint.x + 3.5, terrainHeight(WORLD.dropPoint.x, WORLD.dropPoint.z) + 10, WORLD.dropPoint.z);
  dropMarker.add(dropRing, pole, flag);
  scene.add(dropMarker);

  // Lighthouse on its rock, lamp lit.
  const lh = new THREE.Group();
  const tower = new THREE.Mesh(new THREE.CylinderGeometry(3, 4.5, 16, 10), lambert(0xf5f0e6));
  tower.position.y = 8;
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(3.4, 3.4, 2.5, 10), lambert(PALETTE.planeOrange));
  cap.position.y = 17;
  const lamp = new THREE.Mesh(
    new THREE.SphereGeometry(1.8, 12, 8),
    new THREE.MeshBasicMaterial({ color: 0xfff2c0 }),
  );
  lamp.position.y = 19.5;
  lh.add(tower, cap, lamp);
  lh.position.set(WORLD.lighthouse.x, WORLD.lighthouse.h, WORLD.lighthouse.z);
  scene.add(lh);

  // Home town: a handful of little houses with lit windows, near the runway.
  const town = new THREE.Group();
  const housePositions = [[-70, 34], [-88, 18], [-60, 48], [-95, 44], [-78, -30], [-100, -14]];
  for (const [hx, hz] of housePositions) {
    const hgt = 4 + ((hx * 7 + hz * 3) % 3);
    const house = box(6, hgt, 5, 0xe8dcc0, hx, terrainHeight(hx, hz) + hgt / 2, hz);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(4.6, 2.6, 4), lambert(PALETTE.planeOrange));
    roof.position.set(hx, terrainHeight(hx, hz) + hgt + 1.3, hz);
    roof.rotation.y = Math.PI / 4;
    const win = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 1.2), new THREE.MeshBasicMaterial({ color: PALETTE.townLight }));
    win.position.set(hx + 3.05, terrainHeight(hx, hz) + 2, hz);
    win.rotation.y = Math.PI / 2;
    town.add(house, roof, win);
  }
  scene.add(town);

  // Palm trees on both islands.
  const palms = new THREE.Group();
  const palmSpots = [[-40, 60], [30, -55], [55, 45], [1150, 60], [1260, -55], [1120, -50]];
  for (const [px, pz] of palmSpots) {
    const base = terrainHeight(px, pz);
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.8, 7, 6), lambert(0x8a6a45));
    trunk.position.set(px, base + 3.5, pz);
    trunk.rotation.z = 0.12;
    const crown = new THREE.Mesh(new THREE.ConeGeometry(3.4, 3.2, 6), lambert(PALETTE.grass));
    crown.position.set(px + 0.8, base + 8, pz);
    palms.add(trunk, crown);
  }
  scene.add(palms);

  // Boats on the sea, drifting slowly (animated by main.js through this list).
  const boats = [];
  for (const [bx, bz, hue] of [[220, 90, 0xe86a1f], [480, -120, 0xf5f0e6], [880, 140, 0x3a6ea5]]) {
    const boat = new THREE.Group();
    const hull = new THREE.Mesh(new THREE.BoxGeometry(7, 1.6, 2.6), lambert(hue));
    hull.position.y = 0.8;
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 5, 5), lambert(PALETTE.planeDark));
    mast.position.y = 4;
    const sail = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 4), new THREE.MeshBasicMaterial({ color: 0xf5f0e6, side: THREE.DoubleSide }));
    sail.position.set(1.2, 4, 0);
    boat.add(hull, mast, sail);
    boat.position.set(bx, 0, bz);
    boat.rotation.y = 0.6;
    boats.push(boat);
    scene.add(boat);
  }

  // Clouds: flat white low-poly blobs, high up.
  const clouds = [];
  for (const [cx, cy, cz, s] of [[300, 130, -260, 26], [700, 150, 240, 34], [1050, 120, -220, 22], [-150, 140, 200, 28], [1400, 160, 180, 30]]) {
    const cloud = new THREE.Group();
    for (let k = 0; k < 4; k += 1) {
      const puff = new THREE.Mesh(
        new THREE.IcosahedronGeometry(s * (0.5 + 0.14 * k), 0),
        new THREE.MeshLambertMaterial({ color: 0xfff4e0, transparent: true, opacity: 0.9, flatShading: true }),
      );
      puff.position.set((k - 1.5) * s * 0.55, (k % 2) * s * 0.12, (k % 3 - 1) * s * 0.3);
      cloud.add(puff);
    }
    cloud.position.set(cx, cy, cz);
    clouds.push(cloud);
    scene.add(cloud);
  }

  return { rings, dropMarker, sunLight, clouds, boats };
}
