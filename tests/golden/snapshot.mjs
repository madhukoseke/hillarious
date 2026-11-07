// Port check (F-28): a fingerprint of how every course builds and plays. Restructuring a route or a cargo must not change it.
// `node tests/golden/update.mjs` rewrites ports.json; only do that for an intended gameplay change, and say so in the commit.
import crypto from 'node:crypto';

export const COURSE_BUILDERS = [
  'buildNobHill', 'buildRussianHill', 'buildTelegraphHill', 'buildTitleCourse',
  'buildDrillBrake', 'buildDrillHop', 'buildDrillLip', 'buildDrillStairs', 'buildDrillCable', 'buildDrillExam', 'buildTestHill',
];
export const PROFILES = ['careful', 'typical', 'fast', 'reckless'];
export const DELIVERIES = ['buildNobHill', 'buildRussianHill', 'buildTelegraphHill'];
export const CARGOS = { coffee: 'CoffeeCargo', cake: 'CakeCargo', bouquet: 'BouquetCargo' };

const sha = (s) => crypto.createHash('sha256').update(s).digest('hex').slice(0, 16);
// JSON without the terrain object, functions, or VM prototypes; numbers keep full precision.
const plainJSON = (o) => JSON.stringify(o, (k, v) => (k === 'terrain' || typeof v === 'function' ? undefined : v));

function terrainPrint(T) {
  const parts = [];
  for (let x = T.minX; x <= T.maxX; x += 0.05) parts.push(T.height(x), T.slope(x));
  return sha(parts.join(','));
}

function ride(H, build, profile, cargo = null, opts = undefined) {
  const C = H[build]();
  if (cargo) C.cargo = cargo; // the way Free Ride swaps cargo
  const w = new H.World(C, opts), ap = new H.Autopilot(profile), trace = [], events = {};
  let n = 0;
  while (w.t < 180 && w.state !== 'done') {
    w.step(ap.input(w));
    for (const e of w.drain()) events[e.type] = (events[e.type] || 0) + 1;
    if (n++ % 60 === 0) trace.push(w.bike.x, w.bike.y, w.cargo.amount);
  }
  const r = w.result();
  return {
    state: w.state, time: r.time, condition: r.condition, crashes: r.crashes, tip: r.tip, style: r.style,
    result: sha(plainJSON(r)), trace: sha(trace.join(',')), events: sha(plainJSON(Object.keys(events).sort().map((k) => [k, events[k]]))),
  };
}

// Every cargo method, driven through a fixed script, so rules no ride happens to reach are still covered.
function cargoScript(H, cls) {
  const c = new H[cls](), b = new H.Bike(), out = [];
  const log = (tag, v) => out.push(tag, v === undefined ? 'u' : v);
  for (let i = 0; i < 720; i++) {
    b.vx = 4 + 10 * Math.sin(i / 40); b.vy = 2 * Math.sin(i / 17); b.a = 0.3 * Math.sin(i / 23); b.w = Math.sin(i / 11);
    b.grounded = i % 50 < 40; b.airTime = b.grounded ? 0 : (i % 50 - 40) / 120;
    const frozen = i >= 640, wind = i >= 200 && i < 320 ? -6 : 0;
    log('u', c.update(1 / 120, b, frozen, wind));
    if (i % 37 === 0) log('s', c.splash((i % 7) * 2.2, (i % 5) - 2, frozen));
    if (i % 29 === 0) log('b', c.bump((i % 9) * 1.5, frozen));
    if (i % 53 === 0) c.kick(0.5 + (i % 3) * 0.3);
    if (i === 500) log('x', c.crashLoss(0.6));
    if (i === 560) c.refill();
    if (i % 20 === 0) log('state', plainJSON(c));
  }
  return sha(out.join('|'));
}

export function snapshot(H) {
  const out = {};
  for (const build of COURSE_BUILDERS) {
    const C = H[build]();
    const entry = { terrain: terrainPrint(C.terrain), course: sha(plainJSON(C)), rides: {} };
    if (!C.loop) for (const p of PROFILES) entry.rides[p] = ride(H, build, p);
    out[build] = entry;
  }
  // Every cargo on every delivery route (Free Ride allows any pairing), and unbreakable cargo.
  out.cargoRides = {};
  for (const build of DELIVERIES) for (const kind of Object.keys(CARGOS)) for (const p of PROFILES) out.cargoRides[`${build} ${kind} ${p}`] = ride(H, build, p, kind);
  out.unbreakable = {};
  for (const build of DELIVERIES) out.unbreakable[build] = ride(H, build, 'reckless', null, { unbreakable: true });
  out.cargoScripts = {};
  for (const [kind, cls] of Object.entries(CARGOS)) out.cargoScripts[kind] = cargoScript(H, cls);
  return out;
}
