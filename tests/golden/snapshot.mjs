// Port check (F-28): a fingerprint of how every course builds and plays. Restructuring a route or a cargo must not change it.
// `node tests/golden/update.mjs` rewrites ports.json; only do that for an intended gameplay change, and say so in the commit.
//
// Course data (terrain samples and object lists) is plain arithmetic, so it is compared exactly, by hash. Rides run the
// physics, whose last bits can differ between machines and Node builds (Math functions), so rides are stored as numbers
// and compared within TOLERANCE. That is still far finer than any real rule or layout change.
import crypto from 'node:crypto';

export const TOLERANCE = 1e-4;
export const PROFILES = ['careful', 'typical', 'fast', 'reckless'];
export const CARGOS = { coffee: 'CoffeeCargo', cake: 'CakeCargo', bouquet: 'BouquetCargo', disco: 'DiscoCargo' };
const LOOP_SECONDS = 60; // looping courses (The Test Hill) have no finish: ride them for a fixed time

// Every course the game can build: deliveries from ROUTES, drills from DRILLS, plus the title and Free Ride courses.
export function courseBuilders(H) {
  return [...H.ROUTES.map((R) => R.build.name), 'buildTitleCourse', ...H.DRILLS.map((D) => D.build.name), 'buildTestHill'];
}
const deliveries = (H) => H.ROUTES.map((R) => R.build.name);

const sha = (s) => crypto.createHash('sha256').update(s).digest('hex').slice(0, 16);
// JSON without the terrain object, functions, or VM prototypes; numbers keep full precision.
const plainJSON = (o) => JSON.stringify(o, (k, v) => (k === 'terrain' || typeof v === 'function' ? undefined : v));
const r6 = (v) => (Number.isFinite(v) ? Math.round(v * 1e6) / 1e6 : v);

function terrainPrint(T) {
  const parts = [];
  for (let x = T.minX; x <= T.maxX; x += 0.05) parts.push(T.height(x), T.slope(x));
  return sha(parts.join(','));
}

function ride(H, build, profile, cargo = null, opts = undefined) {
  const C = H[build]();
  if (cargo) C.cargo = cargo; // the way Free Ride swaps cargo
  const w = new H.World(C, opts), ap = new H.Autopilot(profile), trace = [], events = {};
  const limit = C.loop ? LOOP_SECONDS : 180;
  let n = 0;
  while (w.t < limit && w.state !== 'done') {
    w.step(ap.input(w));
    for (const e of w.drain()) events[e.type] = (events[e.type] || 0) + 1;
    if (n++ % 240 === 0) trace.push(r6(w.bike.x), r6(w.bike.y), r6(w.cargo.amount)); // every 2 s
  }
  const r = w.result();
  return {
    state: w.state, time: r6(r.time), condition: r6(r.condition), crashes: r.crashes, tip: r.tip, style: r.style,
    nearMisses: r.nearMisses, cleanLandings: r.cleanLandings, bigAirs: r.bigAirs, gustLoss: r6(r.gustLoss), laps: w.laps,
    events: Object.keys(events).sort().map((k) => k + ':' + events[k]).join(' '), trace,
  };
}

// Every cargo method, driven through a fixed script, so rules no ride happens to reach are still covered.
function cargoScript(H, cls) {
  const c = new H[cls](), b = new H.Bike(), out = [];
  const log = (v) => out.push(v === undefined ? null : r6(v));
  for (let i = 0; i < 720; i++) {
    b.vx = 4 + 10 * Math.sin(i / 40); b.vy = 2 * Math.sin(i / 17); b.a = 0.3 * Math.sin(i / 23); b.w = Math.sin(i / 11);
    b.grounded = i % 50 < 40; b.airTime = b.grounded ? 0 : (i % 50 - 40) / 120;
    const frozen = i >= 640, wind = i >= 200 && i < 320 ? -6 : 0;
    const lost = c.update(1 / 120, b, frozen, wind);
    if (i % 20 === 0) log(lost);
    if (i % 37 === 0) log(c.splash((i % 7) * 2.2, (i % 5) - 2, frozen));
    if (i % 29 === 0) log(c.bump((i % 9) * 1.5, frozen));
    if (i % 53 === 0) c.kick(0.5 + (i % 3) * 0.3);
    if (i === 500) log(c.crashLoss(0.6));
    if (i === 560) c.refill();
    if (i % 20 === 0) log(c.amount);
  }
  return out;
}

export function snapshot(H) {
  const out = { courses: {}, rides: {}, cargoRides: {}, unbreakable: {}, cargoScripts: {} };
  for (const build of courseBuilders(H)) {
    const C = H[build]();
    out.courses[build] = { terrain: terrainPrint(C.terrain), course: sha(plainJSON(C)) };
    for (const p of PROFILES) out.rides[`${build} ${p}`] = ride(H, build, p);
  }
  // Every cargo on every delivery route (Free Ride allows any pairing), and unbreakable cargo.
  for (const build of deliveries(H)) for (const kind of Object.keys(CARGOS)) for (const p of PROFILES) out.cargoRides[`${build} ${kind} ${p}`] = ride(H, build, p, kind);
  for (const build of deliveries(H)) out.unbreakable[build] = ride(H, build, 'reckless', null, { unbreakable: true });
  for (const [kind, cls] of Object.entries(CARGOS)) out.cargoScripts[kind] = cargoScript(H, cls);
  return out;
}

// Compares two snapshots: exact for strings and counts, within TOLERANCE for numbers. Returns a list of differences.
export function compare(expected, actual, path = '') {
  const diffs = [];
  if (typeof expected === 'number' && typeof actual === 'number') {
    if (!(Math.abs(expected - actual) <= TOLERANCE)) diffs.push(`${path}: ${expected} -> ${actual}`);
  } else if (Array.isArray(expected) && Array.isArray(actual)) {
    if (expected.length !== actual.length) diffs.push(`${path}: length ${expected.length} -> ${actual.length}`);
    else expected.forEach((v, i) => diffs.push(...compare(v, actual[i], `${path}[${i}]`)));
  } else if (expected && actual && typeof expected === 'object' && typeof actual === 'object') {
    const keys = new Set([...Object.keys(expected), ...Object.keys(actual)]);
    for (const k of keys) {
      if (!(k in actual)) diffs.push(`${path}.${k}: missing now`);
      else if (!(k in expected)) diffs.push(`${path}.${k}: not in the recorded baseline (run tests/golden/update.mjs if intended)`);
      else diffs.push(...compare(expected[k], actual[k], path ? `${path}.${k}` : k));
    }
  } else if (expected !== actual) diffs.push(`${path}: ${JSON.stringify(expected)} -> ${JSON.stringify(actual)}`);
  return diffs;
}
