// Canyon Postman — tuning, palette and mission data. One place for every number
// the flight model, the world and the missions share, so the game is tuned here,
// not scattered through the code.

// --- world layout (metres; y is up, x east, z south; heading 0 = +x, turning to -z) ---
export const WORLD = {
  homeIsland: { x: 0, z: 0, top: 12, flatRadius: 70, falloff: 150 },
  farIsland: { x: 1200, z: 0, top: 16, flatRadius: 80, falloff: 170 },
  canyon: { x0: 430, x1: 870, height: 55, gapHalfWidth: 16, gapFeather: 45 },
  rocks: [
    { x: 300, z: 130, h: 10, r: 26 },
    { x: 950, z: -160, h: 14, r: 34 },
    { x: 620, z: 210, h: 9, r: 24 },
    { x: -180, z: 120, h: 8, r: 22 },
  ],
  // Home runway: flat strip on the home island top, along +x.
  homeRunway: { x0: -55, x1: 55, z: 0, halfWidth: 6, y: 12 },
  // Far runway on the far island top, along +x.
  farRunway: { x0: 1145, x1: 1255, z: 0, halfWidth: 6, y: 16 },
  // Mail drop: marked circle on the far island's near shore.
  dropPoint: { x: 1062, z: 0, radius: 14 },
  // Lighthouse rock off the home island.
  lighthouse: { x: -140, z: -90, h: 9, r: 14 },
};

// --- golden rings: the route home -> canyon arch -> far island ---
// Each ring: centre, radius, and the altitude the autopilot aims for through it.
export const RINGS = [
  { x: 150, y: 34, z: 0, r: 13 },
  { x: 260, y: 40, z: -12, r: 13 },
  { x: 360, y: 44, z: 8, r: 13 },
  { x: 470, y: 38, z: 0, r: 13 },
  { x: 580, y: 30, z: 0, r: 12 },
  { x: 650, y: 26, z: 0, r: 11 }, // through the stone arch
  { x: 780, y: 34, z: -10, r: 13 },
  { x: 920, y: 38, z: 6, r: 13 },
];

// --- flight model tuning ---
export const FLIGHT = {
  maxSpeed: 55, // m/s at full throttle
  stallSpeed: 15, // below this the wing gives up
  takeoffSpeed: 19, // lift off above this, with pitch up
  accel: 0.55, // how fast speed chases throttle * maxSpeed (1/s)
  pitchRate: 0.85, // rad/s at full stick
  rollRate: 1.7, // rad/s at full stick
  maxPitch: 0.62,
  maxRoll: 1.25,
  climbBleed: 0.22, // speed lost per m/s climbed
  diveGain: 0.16, // speed gained per m/s descended
  turnBleed: 0.020, // speed lost per rad/s of turn
  rollStability: 0.55, // roll eases back toward level (1/s)
  fuelDrain: 0.28, // %/s at full throttle
  fuelStart: 100,
  damageHardLanding: 25,
  damageGearUpLanding: 40,
  damageMax: 100,
  crashDescent: 6, // m/s down on a runway touchdown counts as hard
  landingMaxSpeed: 28,
  landingMaxDescent: 4,
};

// --- wind: canyon gusts sideways, headwind on the way home ---
export const WIND = {
  canyonGust: 4.5, // m/s sideways in the canyon, gusts come and go
  returnHeadwind: 7, // m/s against the return leg (blows +x)
};

// --- scoring ---
export const SCORE = {
  ring: 100,
  dropMax: 300, // full marks for a dead-centre drop
  dropPerMetre: 4, // points lost per metre off centre
  landingMax: 200,
  fuelPerPoint: 1, // 1 point per % of fuel left
  timeBonusMax: 200, // under 200 s
  timeBonusFalloff: 1.2, // points lost per second over 200 s
  ratingS: 1250,
  ratingA: 1000,
  ratingB: 700,
};

// --- palette: one golden-hour set for the whole game ---
export const PALETTE = {
  skyTop: 0x2e4a7a, // dusk blue overhead
  skyHorizon: 0xffb35c, // amber at the horizon
  sun: 0xffd9a0,
  fog: 0xf2a65e,
  sea: 0x2e7f86, // teal
  seaDeep: 0x1d5b66,
  sand: 0xe8c98f,
  islandTop: 0xc98a4b, // terracotta
  islandRock: 0x9c5a33,
  canyon: 0xb06a3a,
  canyonDark: 0x7e4526,
  grass: 0x7fae62,
  runway: 0x3a3f46,
  runwayMark: 0xf5f2e8,
  ring: 0xffc93c, // gold
  ringDone: 0x7fd4a8,
  planeWhite: 0xf5f0e6,
  planeOrange: 0xe86a1f,
  planeDark: 0x2b2f36,
  townLight: 0xffd27d,
  hudAmber: '#ffd60a',
  hudGreen: '#30d158',
  hudRed: '#ff453a',
};

// --- fixed step for the simulation (the starter's pattern) ---
export const STEP = 1 / 60;
export const BEST_KEY = 'canyon-postman-best';
