// HILLARIOUS headless test suite. Run: node --test "tests/*.test.mjs"
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { loadGame, extractGameScript, input } from './harness.mjs';

const H = loadGame();
const ROOT = new URL('..', import.meta.url);

function settle(world, seconds = 1) {
  for (let i = 0; i < seconds * 120; i++) world.step(input());
}
function finiteBike(b) {
  return [b.x, b.y, b.vx, b.vy, b.a, b.w].every(Number.isFinite);
}
function rideProfile(profile, maxT = 150, build = 'buildNobHill') {
  const w = new H.World(H[build]()), ap = new H.Autopilot(profile);
  const events = [];
  while (w.t < maxT && w.state !== 'done') { w.step(ap.input(w)); events.push(...w.drain()); }
  return { w, events, r: w.result() };
}
function dropTest(height, vx) {
  const w = new H.World(H.makeTestCourse('flat'));
  settle(w);
  const b = w.bike;
  b.y += height; b.py = b.y; b.vx = vx;
  const before = w.cargo.amount, events = [];
  for (let i = 0; i < 360; i++) { w.step(input()); events.push(...w.drain()); }
  return { w, lost: before - w.cargo.amount, land: events.find((e) => e.type === 'LAND'), events };
}

/* ------------------------------ startup ------------------------------ */

test('startup: game script passes a syntax check', () => {
  const file = path.join(os.tmpdir(), 'hillarious-game-check.js');
  fs.writeFileSync(file, extractGameScript());
  const res = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  assert.equal(res.status, 0, res.stderr);
});

test('startup: exposes the simulation API without touching the DOM', () => {
  for (const k of ['World', 'Bike', 'CoffeeCargo', 'CakeCargo', 'Terrain', 'buildNobHill', 'buildRussianHill', 'Autopilot', 'computeTip', 'tipBreakdown', 'reviewFor', 'Store', 'HumorEngine', 'DIALOGUE', 'CrossTraffic', 'LANDMARK_DATA']) {
    assert.ok(H[k], `missing HILL.${k}`);
  }
});

test('startup: index.html has no external runtime dependencies', () => {
  // The SVG namespace URI inside the inline data-URI favicon is an identifier, not a request.
  // The high-score board's profile links and the share buttons are only followed when a player clicks them.
  const clickOnly = ["'https://x.com/'", "'https://www.linkedin.com/in/'", "'https://hillarious.pages.dev'",
    "'https://x.com/intent/post?text='", "'https://www.linkedin.com/feed/?shareActive=true&text='"];
  let html = fs.readFileSync(new URL('index.html', ROOT), 'utf8').replaceAll('http://www.w3.org/2000/svg', '');
  for (const s of clickOnly) html = html.replaceAll(s, '');
  for (const bad of ['http://', 'https://', '@import', 'fetch(', 'XMLHttpRequest', 'import(', '<script src']) {
    assert.ok(!html.includes(bad), `index.html contains "${bad}"`);
  }
  for (const m of html.matchAll(/<link\b[^>]*>/g)) assert.match(m[0], /href="data:/, `non-inline <link>: ${m[0].slice(0, 60)}`);
});

/* ------------------------------ course ------------------------------ */

const COURSES = ['buildNobHill', 'buildRussianHill', 'buildTelegraphHill'];
// Landmarks come from the pinned Apify export (TD-13), so only the two original routes have them.
const LANDMARK_COURSES = ['buildNobHill', 'buildRussianHill'];
// Courier Academy drills and The Test Hill get the same geometry and respawn checks as the deliveries.
const TRAINING = ['buildDrillBrake', 'buildDrillHop', 'buildDrillLip', 'buildDrillStairs', 'buildDrillCable', 'buildDrillExam', 'buildTestHill'];

for (const build of COURSES.concat(TRAINING)) {
  test(`course ${build}: terrain (incl. potholes and stairs) is finite and C1, analytic slope matches the height`, () => {
    const T = H[build]().terrain;
    let prev = T.height(T.minX);
    for (let x = T.minX; x <= T.maxX; x += 0.01) {
      const h = T.height(x), sl = T.slope(x);
      assert.ok(Number.isFinite(h) && Number.isFinite(sl), `non-finite terrain at x=${x}`);
      assert.ok(Math.abs(h - prev) < 0.025, `height jump at x=${x.toFixed(2)}`);
      const num = (T.height(x + 1e-4) - T.height(x - 1e-4)) / 2e-4;
      assert.ok(Math.abs(num - sl) < 3e-3, `slope mismatch at x=${x.toFixed(2)}: ${num} vs ${sl}`);
      prev = h;
    }
    const knots = Array.from(T.xs);
    for (const f of T.features) {
      knots.push(f.x0, f.x1);
      if (f.type === 'pothole') knots.push(f.x0 + f.wall, f.x1 - f.wall);
      if (f.type === 'stairs') for (let i = 0; i <= f.n; i++) knots.push(f.x0 + i * f.tread, f.x0 + (i + 1 - f.nose) * f.tread);
    }
    for (const k of knots) assert.ok(Math.abs(T.slope(k + 1e-7) - T.slope(k - 1e-7)) < 2e-3, `slope discontinuity at x=${k.toFixed(3)}`);
  });

  test(`course ${build}: hazards sit inside the route; checkpoints are safe to respawn on`, () => {
    const C = H[build]();
    const inside = (x) => x >= C.start && x <= C.doorX;
    for (const x of C.cones) assert.ok(inside(x), `cone at ${x}`);
    for (const p of C.potholes) assert.ok(inside(p.x0) && inside(p.x1), 'pothole outside route');
    for (const c of C.crossers) assert.ok(inside(c.x) && c.trigger < c.x, 'crossing placement');
    for (const pu of C.powerups) assert.ok(inside(pu.x), 'power-up placement');
    assert.ok(C.finishX < C.doorX && inside(C.finishX), 'finish line placement');
    assert.ok(C.customer && C.customer.messages.length === 2, 'customer brief');
    const cps = C.checkpoints.map((c) => c.x);
    assert.deepEqual(cps, cps.slice().sort((a, b) => a - b), 'checkpoints must be ordered');
    for (const x of cps) {
      assert.ok(inside(x), `checkpoint ${x} outside route`);
      for (const p of C.potholes) assert.ok(x < p.x0 - 6 || x > p.x1 + 1, `checkpoint ${x} too close to a pothole`);
      for (const car of C.cars) assert.ok(x < car.x - 10 || x > car.x + 5, `checkpoint ${x} too close to the car`);
      for (const c of C.crossers) assert.ok(Math.abs(x - c.x) > 3, `checkpoint ${x} on a crossing`);
      for (const st of C.stairs) assert.ok(x < st.x0 - 2 || x > st.x1 + 2, `checkpoint ${x} on the stairs`);
    }
    for (let i = 0; i < cps.length; i++) {
      const w = new H.World(C);
      w.cpIndex = i; w.respawn(); w.drain();
      for (let k = 0; k < 120; k++) w.step(input());
      assert.equal(w.score.crashes, 0, `crash right after spawning at checkpoint ${i}`);
      assert.ok(finiteBike(w.bike));
    }
  });
}

/* ------------------------------ physics ------------------------------ */

test('physics: bike settles and stays put on flat ground', () => {
  const w = new H.World(H.makeTestCourse('flat'));
  settle(w, 5);
  const b = w.bike;
  assert.ok(Math.abs(b.vx) < 0.01 && Math.abs(b.vy) < 0.01, `drift v=${b.vx},${b.vy}`);
  assert.ok(Math.abs(b.a) < 0.01 && Math.abs(b.w) < 0.01, `pitch ${b.a}`);
  assert.ok(b.wheels.every((wh) => wh.contact), 'both wheels on the ground');
  assert.equal(w.state, 'riding');
});

test('physics: gravity accelerates the bike downhill without pedaling', () => {
  const w = new H.World(H.makeTestCourse('slope'));
  settle(w, 3);
  const v3 = Math.hypot(w.bike.vx, w.bike.vy);
  settle(w, 2);
  const v5 = Math.hypot(w.bike.vx, w.bike.vy);
  assert.ok(v3 > 7, `speed after 3 s: ${v3}`);
  assert.ok(v5 > v3, 'keeps accelerating');
});

test('physics: pedaling accelerates on the flat to a sensible cruise', () => {
  const w = new H.World(H.makeTestCourse('flat'));
  for (let i = 0; i < 600; i++) w.step(input({ pedal: true }));
  assert.ok(w.bike.vx > 8 && w.bike.vx < 13, `cruise ${w.bike.vx}`);
});

test('physics: braking stops the bike; brake force builds while the key is held', () => {
  const w = new H.World(H.makeTestCourse('flat'));
  settle(w);
  w.bike.vx = 15;
  w.step(input({ brake: true }));
  const early = w.bike.brakeAmt;
  let t = 0;
  while (w.bike.vx > 0.3 && t < 4) { w.step(input({ brake: true })); t += H.STEP; }
  assert.ok(early < 0.1, `brake should ramp, got ${early} after one step`);
  assert.ok(t < 2, `took ${t.toFixed(2)} s to stop from 15 m/s`);
  assert.equal(w.state, 'riding', 'hard braking on the flat must not crash');
});

test('physics: hop rises then lands on both wheels; holding SPACE hops higher', () => {
  const hop = (holdSteps) => {
    const w = new H.World(H.makeTestCourse('flat'));
    settle(w);
    const y0 = w.bike.y;
    let maxY = y0;
    w.step(input({ jumpPressed: true, jumpHeld: true }));
    for (let i = 0; i < 240; i++) { w.step(input({ jumpHeld: i < holdSteps })); maxY = Math.max(maxY, w.bike.y); }
    return { w, h: maxY - y0 };
  };
  const tap = hop(6), held = hop(40);
  assert.ok(tap.h > 0.4, `tap hop height ${tap.h}`);
  assert.ok(held.h > tap.h + 0.15, `held ${held.h} vs tap ${tap.h}`);
  for (const r of [tap, held]) {
    assert.ok(r.w.bike.grounded && r.w.bike.wheels.every((wh) => wh.contact), 'landed on both wheels');
    assert.equal(r.w.state, 'riding');
  }
});

test('physics: jump buffer triggers a hop when SPACE is pressed just before landing', () => {
  const w = new H.World(H.makeTestCourse('flat'));
  settle(w);
  const b = w.bike;
  b.y += 1.2; b.py = b.y;
  let pressed = false, hopAt = -1, landAt = -1;
  for (let i = 0; i < 240; i++) {
    const nearGround = b.y - H.RIDE_H - w.terrain.height(b.x) < 0.3 && b.vy < 0;
    const press = !pressed && nearGround;
    if (press) pressed = true;
    w.step(input({ jumpPressed: press }));
    for (const e of w.drain()) { if (e.type === 'HOP' && hopAt < 0) hopAt = w.t; if (e.type === 'LAND' && landAt < 0) landAt = w.t; }
  }
  assert.ok(pressed, 'test never pressed jump');
  assert.ok(hopAt > 0, 'buffered jump never fired');
  assert.ok(landAt > 0 && hopAt >= landAt - 1e-9 && hopAt - landAt < 0.12, `hop ${hopAt} vs land ${landAt}`);
});

test('physics: coyote time allows a hop just after rolling off a lip', () => {
  const C = H.buildNobHill(), w = new H.World(C), ap = new H.Autopilot('careful');
  const lip = C.lips.find((l) => l.big).x;
  w.cpIndex = 4; w.respawn(); w.drain();
  let offT = -1, hopped = false;
  while (w.t < 30 && w.bike.x < lip + 15) {
    const inp = Object.assign({}, ap.input(w), { jumpPressed: false });
    if (w.bike.x > lip - 1 && !w.bike.grounded && offT < 0) offT = w.t;
    if (offT > 0 && !hopped && w.t - offT > 0.05) { inp.jumpPressed = true; hopped = true; }
    w.step(inp);
    if (w.drain().some((e) => e.type === 'HOP')) { assert.ok(hopped, 'hop before press?'); return; }
  }
  assert.fail('coyote hop did not fire');
});

test('physics: crash recovery respawns on the ground at a checkpoint within 2.5 s', () => {
  const w = new H.World(H.buildNobHill());
  for (let i = 0; i < 120 * 6; i++) w.step(input({ pedal: true }));
  const cp = w.course.checkpoints[w.cpIndex].x;
  w.crash('test', 0.5);
  assert.equal(w.state, 'crashed');
  let t = 0;
  while (w.state === 'crashed' && t < 5) { w.step(input()); t += H.STEP; }
  assert.equal(w.state, 'riding');
  assert.ok(t <= 2.5, `recovery took ${t.toFixed(2)} s`);
  const b = w.bike, gap = b.y - w.terrain.height(b.x);
  assert.ok(Math.abs(b.x - cp) < 1.5, `respawned at ${b.x}, checkpoint ${cp}`);
  assert.ok(gap > 0.7 && gap < 1.4, `respawn height above ground ${gap}`);
  assert.ok(finiteBike(b) && !b.crashed);
  for (let i = 0; i < 120; i++) w.step(input());
  assert.equal(w.score.crashes, 1, 'no immediate re-crash');
});

test('physics: landing assist forgives short leans in the air; long leans crash', () => {
  const tryLean = (dir, dur) => {
    const C = H.buildNobHill(), w = new H.World(C), ap = new H.Autopilot('typical');
    const lip = C.lips.find((l) => l.big).x;
    w.cpIndex = 4; w.respawn(); w.drain();
    while (w.t < 30 && w.bike.x < lip + 30) {
      const inp = ap.input(w), b = w.bike;
      if (!b.grounded && b.x > lip - 2 && b.airTime > 0.35 && b.airTime < 0.35 + dur) { inp.leanFwd = dir < 0; inp.leanBack = dir > 0; }
      w.step(inp);
      if (w.drain().some((e) => e.type === 'CRASH')) return true;
    }
    return false;
  };
  assert.equal(tryLean(-1, 0.2), false, 'short forward lean should be recoverable');
  assert.equal(tryLean(1, 0.2), false, 'short back lean should be recoverable');
  assert.equal(tryLean(-1, 0.6), true, 'holding forward lean through a big jump should crash');
});

/* ------------------------------ coffee ------------------------------ */

test('coffee: slosh impulse response decays (damped spring)', () => {
  const w = new H.World(H.makeTestCourse('flat'));
  settle(w);
  w.cargo.kick(3);
  let peak = 0;
  for (let i = 0; i < 120 * 3; i++) { w.step(input()); peak = Math.max(peak, Math.abs(w.cargo.slosh)); }
  assert.ok(peak > 0.1, 'kick should visibly slosh');
  assert.ok(Math.abs(w.cargo.slosh) < 0.02 && Math.abs(w.cargo.sloshV) < 0.05, `still sloshing: ${w.cargo.slosh}`);
});

test('coffee: ordinary riding is forgiving (< 5% lost); a careful rider who also stops for the cable car keeps 5 stars', () => {
  const C = H.buildNobHill();
  C.crossers = [];
  const w = new H.World(C), ap = new H.Autopilot('careful');
  for (let i = 0; i < 120 * 150 && w.state !== 'done'; i++) w.step(ap.input(w));
  assert.equal(w.state, 'done');
  assert.ok(100 - w.cargo.amount < 5, `ordinary careful ride lost ${(100 - w.cargo.amount).toFixed(1)}%`);
  const { r } = rideProfile('careful');
  assert.ok(r.condition >= 90 && H.reviewFor(H.COFFEE_REVIEWS, r.condition).stars === 5, `careful ride with the cable-car stop kept ${r.condition.toFixed(1)}%`);
});

test('coffee: a hard brake from 15 m/s spills 3-8% and visibly sloshes', () => {
  const w = new H.World(H.makeTestCourse('flat'));
  settle(w);
  w.bike.vx = 15;
  const before = w.cargo.amount;
  let peak = 0;
  while (w.bike.vx > 0.3) { w.step(input({ brake: true })); peak = Math.max(peak, Math.abs(w.cargo.slosh)); }
  settle(w, 1);
  const lost = before - w.cargo.amount;
  assert.ok(lost >= 3 && lost <= 8, `hard brake lost ${lost.toFixed(2)}%`);
  assert.ok(peak > 0.5, `peak slosh ${peak}`);
});

test('coffee: tapping the brake (feathering) is nearly free', () => {
  const w = new H.World(H.makeTestCourse('flat'));
  settle(w);
  w.bike.vx = 14;
  const before = w.cargo.amount;
  for (let k = 0; k < 6; k++) { for (let i = 0; i < 26; i++) w.step(input({ brake: true })); for (let i = 0; i < 22; i++) w.step(input()); }
  assert.ok(before - w.cargo.amount < 0.5, `tapping lost ${(before - w.cargo.amount).toFixed(2)}%`);
  assert.ok(w.bike.vx < 9, 'but still slows the bike');
});

test('coffee: a big flat landing spills 5-12%', () => {
  const { lost, land, w } = dropTest(2.3, 6);
  assert.ok(land && land.impact > 8, `impact ${land && land.impact}`);
  assert.ok(lost >= 5 && lost <= 12, `big landing lost ${lost.toFixed(2)}%`);
  assert.equal(w.state, 'riding', 'aligned hard landing should not crash');
});

test('coffee: a crash costs 15-20% and sends the cup flying', () => {
  const w = new H.World(H.buildNobHill());
  for (let i = 0; i < 240; i++) w.step(input({ pedal: true }));
  const before = w.cargo.amount;
  w.crash('test', 0.4);
  const lost = before - w.cargo.amount;
  assert.ok(lost >= 15 && lost <= 20, `crash lost ${lost}`);
  assert.ok(w.cup.on && w.rag.on, 'cup and rider should go flying');
});

test('coffee: never impossible to save (spill threshold rises as the cup empties)', () => {
  const c = new H.CoffeeCargo();
  const full = c.threshold();
  c.amount = 40;
  assert.ok(c.threshold() > full + 0.3, 'half-empty cup should tolerate more slosh');
});

/* ------------------------------ gameplay ------------------------------ */

test('gameplay: 60 s of random input keeps state finite and the latte within [0, 100]', () => {
  const rng = H.mulberry32(20261012);
  for (let run = 0; run < 4; run++) {
    const w = new H.World(run % 2 ? H.buildRussianHill() : H.buildNobHill());
    const inp = input();
    for (let i = 0; i < 120 * 60; i++) {
      if (i % 9 === 0) {
        inp.pedal = rng() < 0.6; inp.brake = rng() < 0.2; inp.leanBack = rng() < 0.15; inp.leanFwd = rng() < 0.15;
        inp.jumpHeld = rng() < 0.3; inp.jumpPressed = rng() < 0.08;
      } else inp.jumpPressed = false;
      w.step(inp);
      const a = w.cargo.amount;
      assert.ok(finiteBike(w.bike), `non-finite bike at step ${i}`);
      assert.ok(a >= 0 && a <= 100, `latte ${a}`);
      assert.ok(w.score.tip(a) >= 0, 'negative tip');
      if (w.state === 'done') break;
    }
    assert.ok(!w.drain().some((e) => e.type === 'SANITY'), 'sanity reset fired');
  }
});

test('reviews: star bands and lines match the brief', () => {
  const R = (c) => H.reviewFor(H.COFFEE_REVIEWS, c);
  const cases = [[100, 5], [90, 5], [89, 4], [60, 4], [59, 3], [30, 3], [29, 2], [1, 2], [0, 1], [-5, 1], [NaN, 1]];
  for (const [c, stars] of cases) assert.equal(R(c).stars, stars, `condition ${c}`);
  assert.equal(R(95).text, 'Perfect. Only took three years off my life watching you.');
  assert.equal(R(70).text, 'Good coffee. Slightly more aerodynamic than expected.');
  assert.equal(R(45).text, 'Ordered a latte. Received an espresso.');
  assert.equal(R(10).text, 'Coffee was delicious. All four drops.');
  assert.equal(R(0).text, "The cup arrived. That's technically something.");
});

test('tips: never negative or non-finite, whatever happens', () => {
  const rng = H.mulberry32(9);
  for (let i = 0; i < 5000; i++) {
    const t = H.computeTip({
      condition: rng() < 0.05 ? NaN : rng() * 140 - 20, time: rng() * 300, par: 45,
      crashes: Math.floor(rng() * 30), cleanLandings: Math.floor(rng() * 10), nearMisses: Math.floor(rng() * 10),
    });
    assert.ok(Number.isFinite(t) && t >= 0, `tip ${t}`);
  }
  assert.ok(H.computeTip({ condition: 100, time: 30, par: 45, crashes: 0 }) > 5, 'perfect fast delivery earns a bonus');
  assert.ok(H.computeTip({ condition: 0, time: 30, par: 45, crashes: 0 }) <= 0.07, 'empty cup tip');
});

test('storage: localStorage failures are handled gracefully', () => {
  const throwing = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('quota'); } };
  const s = new H.Store(throwing);
  assert.equal(s.get('best', 'fallback'), 'fallback');
  assert.equal(s.set('best', { tip: 1 }), false);
  const mem = new H.Store(null);
  assert.equal(mem.set('muted', true), true);
  assert.equal(mem.get('muted', false), true);
  const corrupt = new H.Store({ getItem: () => '{not json', setItem() {} });
  assert.equal(corrupt.get('best', 7), 7);
});

test('gameplay: every delivery is finishable by every rider; typical runs fit the demo', () => {
  const rows = [];
  const careful = {}, typical = {};
  let typicalTotal = 0;
  for (const build of COURSES) {
    for (const p of ['careful', 'typical', 'fast', 'reckless']) {
      const { w, r } = rideProfile(p, 160, build);
      assert.equal(w.state, 'done', `${build}/${p} did not finish`);
      rows.push(`${build.slice(5).padEnd(11)} ${p.padEnd(9)} ${r.time.toFixed(1).padStart(5)} s  cargo ${r.condition.toFixed(1).padStart(5)}%  crashes ${r.crashes}  tip $${r.tip.toFixed(2)}`);
      if (p === 'typical') {
        typicalTotal += r.time;
        assert.ok(r.time >= 35 && r.time <= 46, `${build} typical time ${r.time.toFixed(1)} s`);
        assert.ok(r.condition >= 65 && r.condition <= 92, `${build} typical cargo ${r.condition.toFixed(1)}%`);
      }
      if (p === 'careful') assert.ok(r.condition >= 85, `${build} careful cargo ${r.condition.toFixed(1)}%`);
      if (p === 'careful') careful[build] = r.condition;
      if (p === 'typical') typical[build] = r.condition;
    }
  }
  // D-12: on Telegraph Hill the slower, careful rider keeps more petals in the gust than the typical rider does.
  assert.ok(careful.buildTelegraphHill > typical.buildTelegraphHill, `careful ${careful.buildTelegraphHill} should keep more petals than typical ${typical.buildTelegraphHill}`);
  // Three deliveries now (1.4): the typical riding total must leave room for the menus in a 2.5-minute demo.
  assert.ok(typicalTotal <= 130, `typical riding total ${typicalTotal.toFixed(1)} s leaves room for menus in a 2.5-minute demo`);
  console.log('\n  Autopilot results:\n  ' + rows.join('\n  '));
});

test('gameplay: humor triggers fire along both routes', () => {
  const need = {
    buildNobHill: ['MAYBEMO_ENCOUNTER', 'MAYBEMO_OVER', 'CABLE_CAR_ENCOUNTER', 'BIG_AIR', 'CLEAN_LANDING', 'POWERUP', 'HINT', 'DELIVERED'],
    buildRussianHill: ['STAIRS', 'CABLE_CAR_ENCOUNTER', 'MAYBEMO_ENCOUNTER', 'MAYBEMO_STOPPED', 'CAKE_DECOR', 'POWERUP', 'DELIVERED'],
    buildTelegraphHill: ['CLEAN_LANDING', 'DELIVERED'],
  };
  for (const build of COURSES) {
    const types = new Set(rideProfile('typical', 160, build).events.map((e) => e.type));
    for (const t of need[build]) assert.ok(types.has(t), `${build} missing ${t}`);
  }
});

function cakeWorld() { const w = new H.World(H.makeTestCourse('flat', 'cake')); settle(w); return w; }

test('cake: wobble decays, stays bounded and finite', () => {
  const w = cakeWorld();
  w.cargo.kick(3);
  let peak = 0;
  for (let i = 0; i < 120 * 4; i++) { w.step(input()); peak = Math.max(peak, Math.abs(w.cargo.angle)); assert.ok(Math.abs(w.cargo.angle) <= H.CAKE.maxAngle + 1e-9); }
  assert.ok(peak > 0.05, 'a kick should visibly wobble the cake');
  assert.ok(Math.abs(w.cargo.angle) < 0.02 && Math.abs(w.cargo.angVel) < 0.05, `still wobbling: ${w.cargo.angle}`);
});

test('cake: hard braking from 15 m/s costs 3-8%, taps are free, a big landing costs 5-12%', () => {
  let w = cakeWorld();
  w.bike.vx = 15;
  let a0 = w.cargo.amount;
  while (w.bike.vx > 0.3) w.step(input({ brake: true }));
  settle(w);
  const brake = a0 - w.cargo.amount;
  assert.ok(brake >= 3 && brake <= 8, `hard brake cost ${brake.toFixed(2)}%`);
  w = cakeWorld(); w.bike.vx = 14; a0 = w.cargo.amount;
  for (let k = 0; k < 6; k++) { for (let i = 0; i < 26; i++) w.step(input({ brake: true })); for (let i = 0; i < 22; i++) w.step(input()); }
  assert.ok(a0 - w.cargo.amount < 0.5, 'brake taps should be free');
  w = cakeWorld(); w.bike.y += 2.3; w.bike.py = w.bike.y; w.bike.vx = 6; a0 = w.cargo.amount;
  for (let i = 0; i < 360; i++) w.step(input());
  const land = a0 - w.cargo.amount;
  assert.ok(land >= 5 && land <= 12, `big landing cost ${land.toFixed(2)}%`);
});

test('cake: crashes cost 15-20%, decorations shed in order and the groom leaves first', () => {
  const w = cakeWorld();
  const shed = [];
  w.crash('test', 0.5);
  for (const e of w.drain()) if (e.type === 'CAKE_DECOR' || e.type === 'CAKE_GROOM') shed.push(e.decor.id);
  assert.ok(100 - w.cargo.amount >= 15 && 100 - w.cargo.amount <= 20, `crash cost ${100 - w.cargo.amount}`);
  assert.ok(shed.length >= 2, 'a crash knocks decorations loose');
  const c = new H.CakeCargo();
  c.amount = 61.5; c.shed();
  const ids = c.events.map((e) => e.decor.id);
  assert.ok(ids.includes('groom') && !ids.includes('bride'), 'groom falls before the bride');
});

test('power-ups: bubble wrap absorbs exactly one damaging hit; espresso boosts pedaling', () => {
  const w = cakeWorld();
  w.collect({ kind: 'bubble', x: 0, y: 0 });
  assert.equal(w.cargo.shield, true);
  const a0 = w.cargo.amount;
  w.crash('test', 0.5);
  assert.equal(w.cargo.amount, a0, 'wrapped crash costs nothing');
  assert.ok(w.drain().some((e) => e.type === 'SHIELD_POP'));
  assert.equal(w.cargo.shield, false, 'wrap is single-use');
  const plain = new H.World(H.makeTestCourse('flat')), boosted = new H.World(H.makeTestCourse('flat'));
  boosted.collect({ kind: 'espresso', x: 0, y: 0 });
  for (let i = 0; i < 240; i++) { plain.step(input({ pedal: true })); boosted.step(input({ pedal: true })); }
  assert.ok(boosted.bike.vx > plain.bike.vx + 0.8, `espresso ${boosted.bike.vx} vs plain ${plain.bike.vx}`);
});

test('cross traffic: never starts blocking on top of the rider', () => {
  const C = H.buildNobHill(), w = new H.World(C), cc = w.obstacles.crossers[0];
  w.spawn(cc.cx, 0); w.drain();
  cc.state = 'CROSSING'; cc.z = 2.0; cc.v = cc.P.speed;
  for (let i = 0; i < 240; i++) { w.step(input({ brake: true })); assert.ok(!cc.blocking, 'blocked while the rider stood on the tracks'); }
  assert.ok(cc.held);
  for (let i = 0; i < 400 && !cc.blocking; i++) w.step(input({ pedal: true }));
  assert.ok(w.bike.x > cc.x1, 'rider rolled clear');
  assert.equal(w.score.crashes, 0);
});

test('cross traffic: hitting a cable car at speed crashes; a Maybe-Mo only bonks', () => {
  const ride = (build, kind) => {
    const C = H[build](), w = new H.World(C), cc = w.obstacles.crossers.find((c) => c.kind === kind);
    w.spawn(cc.x0 - 9, 0); w.drain();
    cc.state = kind === 'cablecar' ? 'CROSSING' : 'STOPPED'; cc.z = kind === 'cablecar' ? 0 : cc.P.stopZ; cc.v = kind === 'cablecar' ? 0.001 : 0; cc.t = -99;
    cc.blocking = true; cc.box.active = true;
    const b = w.bike; b.vx = 9;
    const types = [];
    for (let i = 0; i < 180; i++) { w.step(input()); types.push(...w.drain().map((e) => e.type)); }
    return { w, types };
  };
  const cable = ride('buildNobHill', 'cablecar');
  assert.ok(cable.types.includes('CRASH'), 'cable car hit should crash');
  const mm = ride('buildRussianHill', 'maybemo');
  assert.ok(!mm.types.includes('CRASH') && mm.types.includes('BONK'), `Maybe-Mo should bonk, got ${[...new Set(mm.types)]}`);
});

test('cross traffic: the stalling Maybe-Mo runs DRIVING -> THINKING -> BRAKING -> STOPPED -> RESUMING', () => {
  const C = H.buildRussianHill(), w = new H.World(C), mm = w.obstacles.crossers.find((c) => c.kind === 'maybemo');
  w.spawn(mm.trigger + 1, 0); w.drain();
  const seen = [];
  for (let i = 0; i < 120 * 12; i++) { w.step(input({ brake: true })); if (seen[seen.length - 1] !== mm.state) seen.push(mm.state); }
  for (const s of ['DRIVING', 'THINKING', 'BRAKING', 'STOPPED', 'RESUMING', 'DONE']) assert.ok(seen.includes(s), `missing ${s} in ${seen}`);
});

test('tips: the itemized receipt always adds up to the total', () => {
  const rng = H.mulberry32(77);
  for (let i = 0; i < 2000; i++) {
    const s = { condition: rng() * 110 - 5, time: rng() * 120, par: 46, crashes: Math.floor(rng() * 6), cleanLandings: Math.floor(rng() * 5), nearMisses: Math.floor(rng() * 4), kind: rng() < 0.5 ? 'cake' : 'coffee' };
    const tb = H.tipBreakdown(s), sum = Math.round(tb.items.reduce((a, it) => a + it.amount, 0) * 100) / 100;
    assert.ok(tb.total >= 0 && Math.abs(sum - tb.total) < 0.011, `items ${sum} vs total ${tb.total}`);
    assert.equal(tb.total, H.computeTip(s));
  }
});

test('reviews: wedding cake bands and lines match the brief', () => {
  const R = (c) => H.reviewFor(H.CAKE_REVIEWS, c);
  assert.equal(R(95).text, 'Beautiful! The marriage has a fighting chance.');
  assert.equal(R(70).text, 'Slightly tilted. Very San Francisco.');
  assert.equal(R(40).text, 'We ordered three tiers. Got two and a half.');
  assert.equal(R(10).text, "It's abstract. We're calling it modern art.");
  assert.equal(R(0).text, 'The cake has filed for divorce.');
  assert.equal(R(0).stars, 1); assert.equal(R(90).stars, 5);
});

test('final review: verdict bands and lines match the brief', () => {
  const res = (c1, c2, crashes = 0) => [
    { kind: 'coffee', condition: c1, tip: 5, time: 40, par: 46, crashes, nearMisses: 1, cleanLandings: 2 },
    { kind: 'cake', condition: c2, tip: 5.5, time: 41, par: 48, crashes: 0, nearMisses: 0, cleanLandings: 1 },
  ];
  assert.equal(H.shiftSummary(res(95, 92)).band, 'excellent');
  assert.equal(H.shiftSummary(res(95, 75)).band, 'excellent', '5 + 4 stars averages 4.5');
  assert.equal(H.shiftSummary(res(95, 92, 3)).band, 'average', 'crash-happy employees do not get the plaque');
  assert.equal(H.shiftSummary(res(80, 70)).band, 'average');
  assert.equal(H.shiftSummary(res(40, 10)).band, 'poor');
  assert.equal(H.shiftSummary(res(0, 0)).band, 'poor');
  assert.deepEqual([...H.EMPLOYEE_REVIEWS.excellent.lines], ['Employee of the Month.', "Please don't ask for benefits."]);
  assert.deepEqual([...H.EMPLOYEE_REVIEWS.average.lines], ['Your customers are confused,', 'but technically satisfied.']);
  assert.deepEqual([...H.EMPLOYEE_REVIEWS.poor.lines], ['Congratulations!', "You've been promoted to customer."]);
  const s = H.shiftSummary(res(80, 70));
  assert.equal(s.tips, 10.5); assert.equal(s.time, 81); assert.equal(s.deliveries, 2); assert.deepEqual([...s.stars], [4, 4]);
  assert.equal(H.shiftSummary([]).band, 'poor');
});

test('high scores: the five best shifts are kept, ranked by tips then time', () => {
  assert.equal(H.TOP_SHIFTS, 5);
  let list = [];
  const add = (tips, time) => { const r = H.recordShift(list, { tips, time }); list = r.list; return r.rank; };
  assert.equal(add(8, 90), 1);
  assert.equal(add(10, 95), 1);
  assert.equal(add(9, 80), 2);
  assert.equal(add(6, 70), 4);
  assert.equal(add(5, 70), 5);
  assert.equal(add(4, 70), 0, 'sixth place is not kept');
  assert.equal(add(10, 85), 1, 'same tips, faster time wins');
  assert.deepEqual([...list.map((e) => e.tips)], [10, 10, 9, 8, 6]);
  assert.equal(H.recordShift('garbage', { tips: 1, time: 1 }).rank, 1, 'corrupt storage is ignored');
});

test('humor engine: one bubble at a time, ambient gap, critical interrupts and queues, no repeats', () => {
  const hm = new H.HumorEngine(H.DIALOGUE), all = () => ({});
  hm.reset({ delivery: 1, cargo: 'coffee' });
  assert.equal(hm.offer('POTHOLE', 0, all)[0].line.text, 'Pothole: 1. Latte: 0.');
  assert.equal(hm.offer('CONE', 1, all).length, 0, 'ambient blocked while talking');
  assert.equal(hm.offer('CONE', 3, all).length, 0, 'ambient gap not yet elapsed');
  assert.equal(hm.offer('CONE', 5, all).length, 1, 'ambient after the gap');
  assert.equal(hm.offer('MAYBEMO_OVER', 5.5, all)[0].line.priority, 4, 'critical interrupts ambient');
  assert.equal(hm.offer('CABLE_CAR_ENCOUNTER', 6, all).length, 0, 'equal-priority critical waits...');
  const freeAt = hm.bubble.until;
  assert.equal(hm.tick(freeAt - 0.1, all), null, '...while the current bubble is still up...');
  assert.ok(hm.tick(freeAt + 0.1, all), '...and is shown when the bubble frees up');
  assert.equal(hm.offer('POTHOLE', 30, all).length, 0, 'no repeats within a delivery');
  assert.equal(hm.offer('BIG_JUMP', 40, (who) => (who === 'tourist' ? {} : null))[0].line.speaker, 'tourist', 'speaker availability');
  const both = hm.offer('CARGO_HALF', 50, all);
  assert.equal(both[0].line.speaker, 'customer', 'customer texts use the phone channel');
  hm.reset({ delivery: 2, cargo: 'cake' });
  assert.equal(hm.offer('POTHOLE', 0, all)[0].line.text, 'Pothole: 1. Cake: 0.');
  assert.equal(hm.offer('MAYBEMO_ENCOUNTER', 10, all)[0].line.text, 'I was trained on flat roads.');
});

test('humor engine: lines stay up long enough to read, scaled by length', () => {
  assert.equal(H.readTime('Hi!'), 3.2, 'short lines get the floor');
  assert.equal(H.readTime('x'.repeat(200)), 6.5, 'long lines are capped');
  assert.ok(H.readTime('x'.repeat(60)) > H.readTime('x'.repeat(30)), 'longer lines stay up longer');
  const hm = new H.HumorEngine(H.DIALOGUE), all = () => ({});
  hm.reset({ delivery: 1, cargo: 'coffee' });
  for (const s of [...hm.offer('CARGO_HALF', 0, all), ...hm.offer('POTHOLE', 0, all)]) {
    const dur = s.until - s.t0;
    assert.ok(dur >= (s.line.duration || 0) && dur >= H.readTime(s.line.text) - 1e-9, `${s.line.id} held ${dur}s`);
  }
});

test('humor engine: a queued critical line expires 2.5 s after the bubble ahead of it ends', () => {
  const hm = new H.HumorEngine(H.DIALOGUE), all = () => ({});
  hm.reset({ delivery: 1, cargo: 'coffee' });
  hm.offer('MAYBEMO_OVER', 0, all);
  hm.offer('CABLE_CAR_ENCOUNTER', 0.5, all);
  assert.equal(hm.tick(hm.bubble.until + 2.6, all), null, 'too stale to show');
  assert.equal(hm.queued, null, 'and it is cleared');
});

test('controls: every hint action has a label on keyboard, touch, and gamepad', () => {
  for (const device of ['keyboard', 'touch', 'gamepad']) {
    for (const a of ['pedal', 'brake', 'leanBack', 'leanFwd', 'hop', 'pause', 'confirm']) {
      assert.ok(H.controlKeys([a], device).length > 0, `${device} has no label for ${a}`);
    }
    for (const build of COURSES) {
      for (const h of H[build]().hints) {
        assert.ok(Array.isArray(h.actions) && !('keys' in h), `${build} hint ${h.id} names actions, not keys`);
        for (const a of h.actions) assert.ok(H.controlKeys([a], device).length > 0, `${build} hint ${h.id}: no ${device} label for ${a}`);
      }
    }
  }
  assert.deepEqual(H.controlKeys(['hop', 'leanBack'], 'gamepad'), ['A', '◀']);
  assert.deepEqual(H.controlKeys(['hop'], 'nonsense'), ['SPACE'], 'unknown devices fall back to keyboard');
});

test('cargo feedback: a spill is named after the cause that did the most damage', () => {
  assert.equal(H.mainCause({}), 'rough', 'no tally means a bumpy ride');
  assert.equal(H.mainCause({ brake: 2, landing: 5, rough: 1 }), 'landing');
  for (const c of ['brake', 'landing', 'pothole', 'bump', 'rough']) assert.ok(H.SPILL_CAUSES[c], `label for ${c}`);
});

test('cargo feedback: braking hard at speed spills latte and blames the brake', () => {
  const w = new H.World(H.buildNobHill());
  w.spawn(w.course.start + 2, 13);
  const episodes = [];
  for (let i = 0; i < 120 * 3; i++) {
    w.step(input({ brake: i < 120 * 1.5 }));
    episodes.push(...w.drain().filter((e) => e.type === 'SPILL_EPISODE'));
  }
  assert.ok(episodes.length > 0, 'a hard stop should spill some latte');
  assert.equal(episodes[0].cause, 'brake');
});

test('share: shift text and post links come from the shift summary', () => {
  const text = H.shareText({ tips: 12.5, avgStars: 4.5, crashes: 1 });
  for (const part of ['$12.50', '4.5★', '1 crash)', 'https://hillarious.pages.dev']) assert.ok(text.includes(part), `missing ${part}`);
  assert.ok(H.shareText({ tips: 3, avgStars: 2, crashes: 4 }).includes('4 crashes'));
  const links = H.shareLinks({ tips: 12.5, avgStars: 4.5, crashes: 1 });
  assert.ok(links.x.startsWith('https://x.com/intent/post?text='));
  assert.ok(links.linkedin.startsWith('https://www.linkedin.com/feed/?shareActive=true&text='));
  assert.equal(decodeURIComponent(links.x.split('text=')[1]), text, 'the post text round-trips');
});

test('high scores: profile handles are reduced to safe plain handles', () => {
  assert.equal(H.cleanHandle('@madhu_k', 15), 'madhu_k');
  assert.equal(H.cleanHandle('https://x.com/madhu_k?s=20', 15), 'madhu_k');
  assert.equal(H.cleanHandle('linkedin.com/in/madhu-koseke/', 60), 'madhu-koseke');
  assert.equal(H.cleanHandle('javascript:alert(1)', 60), 'javascriptalert1', 'no scheme or punctuation survives');
  assert.equal(H.cleanHandle('"><img src=x>', 60), 'imgsrcx');
  assert.equal(H.cleanHandle('', 15), '');
  assert.equal(H.cleanHandle('a'.repeat(40), 15).length, 15, 'length is capped');
});

test('data: embedded landmarks match the curated Apify export, mapped onto both routes', () => {
  const file = JSON.parse(fs.readFileSync(new URL('data/sf-landmarks.json', ROOT), 'utf8'));
  assert.deepEqual(JSON.parse(JSON.stringify(H.LANDMARK_DATA)), file);
  for (const build of LANDMARK_COURSES) {
    const C = H[build]();
    assert.equal(C.landmarks.length, 3);
    for (const lm of C.landmarks) assert.ok(lm.x > C.start && lm.x < C.doorX && lm.name && lm.visual);
  }
});

test('data: Apify data files are unchanged', () => {
  const expected = {
    'data/apify-raw.json': '549e18aebb4a8125a1e71ac3ec8d8dfb349caefc3fe764ed1e3d3089decc303a',
    'data/sf-landmarks.json': '6ea4a26118cb75c68a4c490715a86e4d5abe23e210fc3a884125f13b89bd2298',
  };
  for (const [rel, hash] of Object.entries(expected)) {
    const got = crypto.createHash('sha256').update(fs.readFileSync(new URL(rel, ROOT))).digest('hex');
    assert.equal(got, hash, `${rel} was modified`);
  }
});

test('gameplay: rolling through a pothole registers a hit; hopping it does not', () => {
  const run = (hop) => {
    const w = new H.World(H.buildNobHill()), p = w.course.potholes[0];
    w.spawn(p.x0 - 12, 9);
    const types = [];
    while (w.bike.x < p.x1 + 4) {
      const d = p.x0 - (w.bike.x + 0.6);
      w.step(input({ pedal: w.bike.vx < 9, jumpPressed: hop && w.bike.grounded && d > 0 && d < 0.9, jumpHeld: hop }));
      types.push(...w.drain().map((e) => e.type));
    }
    return types.includes('POTHOLE');
  };
  assert.equal(run(false), true, 'rolling through should hit the pothole');
  assert.equal(run(true), false, 'a hop should clear the pothole');
});

test('physics: pedaling turns the cranks the same way as the rolling wheels (no backpedaling)', () => {
  const w = new H.World(H.makeTestCourse('flat'));
  settle(w);
  const b = w.bike, crank0 = b.crank, spin0 = b.wheels[0].spin;
  for (let i = 0; i < 120; i++) w.step(input({ pedal: true }));
  const dCrank = b.crank - crank0, dSpin = b.wheels[0].spin - spin0;
  assert.ok(b.vx > 3, 'bike should be moving forward');
  assert.ok(dSpin < 0, 'forward rolling spins the wheels clockwise (negative angle in y-up space)');
  assert.ok(dCrank < 0, `cranks must turn clockwise too, got delta ${dCrank.toFixed(2)}`);
});

/* -------------------------- dispatch & training -------------------------- */

const plain = (o) => JSON.parse(JSON.stringify(o)); // VM objects -> plain objects for deepEqual

test('routes: the shift order and unlock chain come from one list', () => {
  assert.deepEqual(plain(H.ROUTES.map((r) => r.id)), ['nobHill', 'russianHill', 'telegraph']);
  assert.deepEqual(plain(H.ROUTES.map((r) => r.requires)), [null, 'nobHill', 'russianHill']);
  for (const r of H.ROUTES) assert.equal(r.build().id, r.id, `${r.id} builds its own course`);
  assert.ok(H.COMING_SOON.every((c) => c.title && c.hood && c.note), 'teasers, if any, carry a title, hood and note');
});

test('progress: migration reads legacy bests and survives corrupt saves', () => {
  const fresh = plain(H.migrateProgress(null, null));
  assert.deepEqual(fresh, { v: 1, delivered: {}, goals: {}, drills: {} });
  // Players from before 1.3 only have best tips: those routes count as delivered.
  const legacy = plain(H.migrateProgress(undefined, { nobHill: { tip: 4.5, condition: 80, time: 44 }, russianHill: null }));
  assert.deepEqual(legacy.delivered, { nobHill: 1 });
  const junk = { delivered: { nobHill: 'lots', russianHill: -2, x: Infinity, y: true }, goals: { nobHill: 'yes', russianHill: [1, 0, 'x'] }, drills: { drillBrake: 9, drillHop: 'NaN', drillLip: 1.7 } };
  const p = plain(H.migrateProgress(junk, null));
  assert.deepEqual(p.delivered, { y: 1 });
  assert.deepEqual(p.goals, { russianHill: [true, false, true] });
  assert.deepEqual(p.drills, { drillBrake: 3, drillLip: 1 });
  assert.deepEqual(plain(H.migrateProgress(p, null)), p, 'migration is idempotent');
  for (const bad of ['oops', 42, [], { delivered: [] }]) assert.deepEqual(plain(H.migrateProgress(bad, null)), fresh);
});

test('progress: deliveries unlock in order; locks never hide a route already delivered', () => {
  const states = (p, all) => plain(H.unlockState(H.ROUTES, p, all).map((s) => s.state));
  const fresh = H.migrateProgress(null, null);
  assert.deepEqual(states(fresh), ['new', 'locked', 'locked']);
  assert.deepEqual(states(fresh, true), ['new', 'new', 'new'], '?unlock=all opens everything');
  const after = H.applyRun(fresh, 'single', 'nobHill', { goals: [false, true, false] });
  assert.deepEqual(states(after), ['delivered', 'new', 'locked']);
  assert.deepEqual(plain(H.newlyUnlocked(H.unlockState(H.ROUTES, fresh), H.unlockState(H.ROUTES, after))), ['russianHill']);
  // A cake delivered through ?delivery=2 without the latte still shows as delivered.
  assert.deepEqual(states(H.migrateProgress({ delivered: { russianHill: 1 } }, null)), ['new', 'delivered', 'new']);
  const mastered = H.applyRun(after, 'shift', 'nobHill', { goals: [true, false, true] });
  assert.deepEqual(plain(mastered.goals.nobHill), [true, true, true], 'goals are best-ever, merged across runs');
  assert.equal(mastered.delivered.nobHill, 2);
  assert.deepEqual(states(mastered), ['mastered', 'new', 'locked']);
  assert.equal(fresh.delivered.nobHill, undefined, 'applyRun never changes its input');
});

test('progress: practice never writes records; only a full shift makes a shift record', () => {
  assert.deepEqual(plain(H.writesFor('shift')), { best: true, shift: true, delivered: true, drill: false });
  assert.deepEqual(plain(H.writesFor('single')), { best: true, shift: false, delivered: true, drill: false });
  assert.deepEqual(plain(H.writesFor('drill')), { best: false, shift: false, delivered: false, drill: true });
  for (const m of ['free', 'bogus', undefined]) assert.deepEqual(plain(H.writesFor(m)), { best: false, shift: false, delivered: false, drill: false });
  const p = H.migrateProgress({ delivered: { nobHill: 1 }, drills: { drillBrake: 2 } }, null);
  assert.deepEqual(plain(H.applyRun(p, 'free', 'nobHill', { goals: [true, true, true] })), plain(p), 'free ride changes nothing');
  const d = H.applyRun(p, 'drill', 'drillBrake', { stamp: 1 });
  assert.equal(d.drills.drillBrake, 2, 'a worse stamp never replaces a better one');
  assert.equal(H.applyRun(p, 'drill', 'drillHop', { stamp: 3 }).drills.drillHop, 3);
  assert.deepEqual(plain(d.delivered), { nobHill: 1 }, 'drills never count as deliveries');
});

test('drills: unlock one after another, each with three stamp tiers', () => {
  assert.equal(H.DRILLS.length, 6);
  assert.deepEqual(plain(H.STAMPS), ['NOT YET', 'PROBATIONARY', 'CERTIFIED', 'DISTINGUISHED']);
  for (const D of H.DRILLS) {
    assert.equal(D.tiers.length, 3, `${D.id} has three tiers`);
    const C = D.build();
    assert.equal(C.id, D.id); assert.equal(C.title, D.title);
    assert.equal(C.dialogue, 'drill', 'drills use their own lines, never a delivery\'s');
  }
  const states = (p, all) => plain(H.drillStates(H.DRILLS, p, all).map((s) => s.state));
  const fresh = H.migrateProgress(null, null);
  assert.deepEqual(states(fresh), ['open', 'locked', 'locked', 'locked', 'locked', 'locked']);
  assert.deepEqual(states(H.applyRun(fresh, 'drill', 'drillBrake', { stamp: 1 })), ['passed', 'open', 'locked', 'locked', 'locked', 'locked']);
  assert.ok(states(fresh, true).every((s) => s === 'open'));
  // Stamps count tiers met in a row: a later tier never makes up for a missed earlier one.
  const D = H.DRILLS[0];
  assert.equal(H.drillStamp(D, { stops: 2, stopZones: 2, condition: 96 }), 3);
  assert.equal(H.drillStamp(D, { stops: 2, stopZones: 2, condition: 91 }), 2);
  assert.equal(H.drillStamp(D, { stops: 1, stopZones: 2, condition: 100 }), 0);
});

test('drills: every rider finishes every drill; typical passes all six, careful all but Lip Service', () => {
  const rows = [];
  for (const D of H.DRILLS) {
    for (const p of ['careful', 'typical', 'fast', 'reckless']) {
      const { w, r } = rideProfile(p, 90, 'build' + D.id.slice(0, 1).toUpperCase() + D.id.slice(1));
      assert.equal(w.state, 'done', `${D.id}/${p} did not finish`);
      const stamp = H.drillStamp(D, r);
      rows.push(`${D.id.padEnd(12)} ${p.padEnd(9)} ${r.time.toFixed(1).padStart(5)} s  cargo ${r.condition.toFixed(1).padStart(5)}%  ${H.STAMPS[stamp]}`);
      if (p === 'typical') {
        assert.ok(stamp >= 1, `typical should pass ${D.id}`);
        assert.ok(r.time <= r.par, `${D.id} typical ${r.time.toFixed(1)} s is over par ${r.par}`);
      }
      // The careful bot never hops a lip, so it cannot pass a drill that is only about big air.
      if (p === 'careful' && D.id !== 'drillLip') assert.ok(stamp >= 1, `careful should pass ${D.id}`);
    }
  }
  console.log('\n  Drill results:\n  ' + rows.join('\n  '));
});

test('goals: three per route, met by the runs that earn them', () => {
  for (const R of H.ROUTES) assert.equal(H.ROUTE_GOALS[R.id].length, 3, `${R.id} has three goals`);
  const base = { condition: 95, time: 40, par: 46, crashes: 0, bigLipClean: true, rampClean: true };
  assert.deepEqual(plain(H.routeGoals('nobHill', base)), [true, true, true]);
  assert.deepEqual(plain(H.routeGoals('nobHill', { ...base, condition: 89, bigLipClean: false, crashes: 1 })), [false, false, false]);
  assert.deepEqual(plain(H.routeGoals('russianHill', { ...base, time: 50, par: 48 })), [true, true, false]);
  assert.deepEqual(plain(H.routeGoals('nowhere', base)), []);
  // A level landing off the big Powell lip, and a careful cake that masters Russian Hill.
  assert.equal(rideProfile('typical').r.bigLipClean, true, 'typical lands the Powell lip level');
  assert.equal(rideProfile('careful').r.bigLipClean, false, 'careful never jumps it');
  assert.deepEqual(plain(H.routeGoals('russianHill', rideProfile('careful', 160, 'buildRussianHill').r)), [true, true, true]);
});

test('practice: checkpoint starts are named by cross street; the trouble spot names the worst stretch', () => {
  const C = H.buildNobHill(), mason = C.intersections.find((I) => I.name === 'MASON ST');
  assert.equal(H.cpLabel(C, 0), 'START');
  assert.equal(H.cpLabel(C, 1), 'MASON ST');
  assert.match(H.cpLabel(C, 2), /^\d+ m PAST MASON ST$/);
  for (let i = 0; i < C.checkpoints.length; i++) assert.ok(H.cpLabel(C, i).length > 0);
  assert.equal(H.troubleSpot(C, []), null);
  assert.equal(H.troubleSpot(C, [{ kind: 'spill', x: 30, amount: 2 }]), null, 'small losses are not worth practising');
  const x = C.checkpoints[2].x + 5;
  const t = H.troubleSpot(C, [{ kind: 'spill', x: 30, amount: 4 }, { kind: 'crash', x, amount: 15 }, { kind: 'crash', x: x + 2, amount: 16 }]);
  assert.equal(t.cp, 2); assert.equal(t.crashes, 2); assert.equal(t.lost, 31);
  assert.equal(t.label, H.cpLabel(C, 2));
  assert.ok(mason.x0 < C.checkpoints[2].x);
  // A real crash lands in the run log with its position.
  const w = new H.World(H.makeTestCourse('flat'));
  settle(w); w.crash('obstacle', 1);
  const log = w.result().log;
  assert.equal(log.length, 1); assert.equal(log[0].kind, 'crash'); assert.ok(Number.isFinite(log[0].x) && log[0].amount > 0);
});

test('free ride: start at any checkpoint with no backlog of hints; unbreakable cargo loses nothing', () => {
  const C = H.buildNobHill(), k = 4, w = new H.World(C, { startCp: k });
  assert.equal(w.cpIndex, k);
  assert.ok(Math.abs(w.bike.x - C.checkpoints[k].x) < 1, 'spawned at the checkpoint');
  const hints = [];
  for (let i = 0; i < 240; i++) { w.step(input()); hints.push(...w.drain().filter((e) => e.type === 'HINT')); }
  assert.ok(hints.length <= 1, `old hints replayed: ${hints.map((h) => h.id)}`);
  assert.equal(w.score.crashes, 0);
  const u = new H.World(H.makeTestCourse('flat'), { unbreakable: true });
  settle(u);
  u.bike.y += 3.5; u.bike.py = u.bike.y; u.bike.vx = 6;
  for (let i = 0; i < 360; i++) u.step(input({ brake: i > 120 }));
  u.crash('obstacle', 1);
  assert.equal(u.cargo.amount, 100, 'landings, hard brakes and crashes are free');
  const cake = new H.World(H.makeTestCourse('flat', 'cake'), { unbreakable: true });
  settle(cake);
  assert.equal(cake.cargo.bump(9, true), 0);
});

test('test hill: laps forever, refilling the cargo and resetting the props', () => {
  const C = H.buildTestHill(), w = new H.World(C), ap = new H.Autopilot('typical'), laps = [];
  assert.equal(C.loop, true);
  let lapCargo = null, propsBack = null, knocked = 0;
  while (w.t < 95) {
    w.step(ap.input(w));
    for (const e of w.drain()) {
      if (e.type === 'SANITY') assert.fail('non-finite physics on the Test Hill');
      if (e.type === 'CONE') knocked++;
      if (e.type === 'LAP') {
        laps.push(e.laps); lapCargo = w.cargo.amount;
        propsBack = w.obstacles.cones.every((c) => c.state === 0) && w.obstacles.powerups.every((p) => !p.taken);
      }
    }
  }
  assert.deepEqual(laps, [1, 2]);
  assert.equal(w.state, 'riding', 'a loop never finishes');
  assert.equal(lapCargo, 100, 'each lap starts with full cargo');
  assert.equal(propsBack, true, 'cones stand back up and power-ups return');
  assert.ok(knocked > 0 || C.cones.length === 0, 'the bot knocked a cone, so the reset was exercised');
});

test('physics: the landing prediction refactor keeps the landing assist unchanged', () => {
  const w = new H.World(H.makeTestCourse('slope'));
  settle(w);
  const b = w.bike;
  b.y += 2; b.vx = 9; b.vy = 2;
  const out = b.predictLanding(w, {});
  assert.ok(out.x > b.x && out.t > 0 && Number.isFinite(out.a));
  assert.equal(b.predictLandingAngle(w), out.a);
});

test('records: best-tip records are versioned, and corrupt saves are dropped', () => {
  assert.equal(H.RECORD_VERSION, 1);
  assert.equal(H.cleanBest(null), null, 'missing record');
  assert.equal(H.cleanBest('garbage'), null, 'non-object record');
  assert.equal(H.cleanBest({ tip: 'lots', time: 40 }), null, 'non-numeric tip');
  assert.equal(H.cleanBest({ tip: 5 }), null, 'missing time');
  assert.deepEqual(plain(H.cleanBest({ tip: 5, time: 40 })), { v: 1, tip: 5, condition: 0, time: 40 }, 'legacy record reads with defaults');
  assert.deepEqual(plain(H.cleanBest({ v: 1, tip: 5, condition: 88, time: 40 })), { v: 1, tip: 5, condition: 88, time: 40 });
});

test('bouquet gust: a careful rider below the speed floor keeps every petal; speed past the floor costs more', () => {
  const gusty = (vx) => { const c = new H.BouquetCargo(); for (let i = 0; i < 240; i++) c.update(1 / 120, { vx, vy: 0, w: 0, a: 0 }, false, -6); return c.amount; };
  assert.equal(gusty(5), 100, 'below the floor the gust takes nothing');
  assert.ok(gusty(12) < gusty(9) && gusty(9) < 100, 'more speed in the gust sheds more petals');
});

test('bouquet prototype: wind sheds petals only at speed, rough hits knock petals loose, unbreakable keeps them', () => {
  const H = loadGame();
  const still = { vx: 0, vy: 0, w: 0, a: 0 }, moving = { vx: 9, vy: 0, w: 0, a: 0 };
  const calm = new H.BouquetCargo();
  for (let i = 0; i < 1200; i++) calm.update(1 / 120, moving, false, 1);
  assert.equal(calm.amount, 100, 'light air sheds nothing');
  const gusty = new H.BouquetCargo();
  for (let i = 0; i < 1200; i++) gusty.update(1 / 120, still, false, -6);
  assert.equal(gusty.amount, 100, 'a gust does nothing when the rider is stopped');
  const windy = new H.BouquetCargo();
  for (let i = 0; i < 1200; i++) windy.update(1 / 120, moving, false, -6);
  assert.ok(windy.amount < 100 && windy.amount > 0, 'a gust at speed sheds petals');
  const soft = new H.BouquetCargo();
  assert.equal(soft.splash(H.BOUQUET.landMin, 1, false), 0, 'a soft landing costs nothing');
  const hard = new H.BouquetCargo();
  assert.ok(hard.splash(H.BOUQUET.landMin + 4, 1, false) > 0, 'a rough landing costs petals');
  const frozen = new H.BouquetCargo();
  frozen.update(5, moving, true, -8); frozen.splash(20, 1, true); frozen.bump(12, true);
  assert.equal(frozen.amount, 100, 'unbreakable cargo keeps every petal');
  const crash = new H.BouquetCargo();
  const lost = crash.crashLoss(5);
  assert.equal(lost, H.BOUQUET.crashBase + H.BOUQUET.crashExtra, 'a crash costs a fixed amount, capped at 1');
  assert.equal(crash.amount, 100 - lost);
  crash.crashLoss(1); crash.crashLoss(1); crash.crashLoss(1);
  assert.equal(crash.amount, 0, 'repeated crashes never go below zero');
  assert.equal(crash.crashLoss(1), 0, 'an empty bouquet loses nothing more');
});

test('telegraph hill: the bouquet route is a valid course, the gust sheds petals, and a typical rider finishes it', () => {
  const C = H.buildTelegraphHill();
  for (let x = C.terrain.minX; x <= C.terrain.maxX; x += 0.5) assert.ok(Number.isFinite(C.terrain.height(x)), `non-finite terrain at x=${x}`);
  assert.equal(C.cargo, 'bouquet');
  assert.ok(C.gusts.length === 1 && C.gusts[0].wind < -H.BOUQUET.windMin, 'one gust zone stronger than the petals can hold');
  const w = new H.World(C);
  assert.equal(w.windAt(C.gusts[0].x0 + 1), -6, 'the gust blows inside its zone');
  assert.equal(w.windAt(C.gusts[0].x1 + 5), 0, 'and nowhere else');
  assert.equal(w.cargo.kind, 'bouquet', 'the world picks the bouquet cargo');
  const { r } = rideProfile('typical', 150, 'buildTelegraphHill');
  assert.ok(r.condition < 100, 'the gust costs petals on the way down');
  assert.ok(r.condition > 0, 'a typical ride keeps some petals');
  assert.ok(r.crashes === 0 && r.time > 0, 'a typical ride finishes without a crash');
});

test('cargo words: every cargo has its own labels, and unknown kinds fall back to the latte', () => {
  const H = loadGame();
  assert.equal(H.cargoWords('bouquet').condition, 'Petals left');
  assert.equal(H.cargoWords('bouquet').lost, 'Petals lost');
  assert.equal(H.cargoWords('cake').name, 'CAKE');
  assert.equal(H.cargoWords('coffee').unit, '% latte');
  assert.equal(H.cargoWords('mystery').name, 'LATTE', 'unknown kinds fall back to the latte');
});

test('telegraph goals: 90% of the petals, under 5% lost to the gust, and par with no crashes', () => {
  const base = { condition: 95, gustLoss: 2, time: 20, par: 26, crashes: 0 };
  assert.deepEqual(plain(H.routeGoals('telegraph', base)), [true, true, true]);
  assert.deepEqual(plain(H.routeGoals('telegraph', { ...base, gustLoss: 8 })), [true, false, true], 'a gust that takes 8% misses the second goal');
  assert.deepEqual(plain(H.routeGoals('telegraph', { ...base, condition: 85, crashes: 1 })), [false, true, false]);
});

test('telegraph: a typical ride reports the petals the gust took, and a three-delivery shift summarises', () => {
  const { r } = rideProfile('typical', 150, 'buildTelegraphHill');
  assert.ok(Number.isFinite(r.gustLoss) && r.gustLoss > 0, 'the gust loss is recorded');
  assert.ok(r.gustLoss <= 100 - r.condition + 1e-6, 'gust loss is part of the total petal loss');
  const nob = rideProfile('typical', 150, 'buildNobHill').r, russ = rideProfile('typical', 160, 'buildRussianHill').r;
  const S = plain(H.shiftSummary([nob, russ, r]));
  assert.equal(S.deliveries, 3);
  assert.equal(S.stars.length, 3, 'each delivery gets a star rating');
});

test('sanity: no ride on any route trips the non-finite guard (no silent respawns)', () => {
  const routes = ['buildNobHill', 'buildRussianHill', 'buildTelegraphHill'];
  for (const build of routes) {
    for (const profile of ['careful', 'typical', 'fast', 'reckless']) {
      const { w, events } = rideProfile(profile, 150, build);
      const bad = events.filter((e) => e.type === 'SANITY');
      assert.equal(bad.length, 0, `${build} / ${profile}: the physics guard fired ${bad.length} time(s)`);
      assert.ok(Number.isFinite(w.cargo.amount), `${build} / ${profile}: cargo stays finite`);
    }
  }
});

test('dialogue: the bouquet has its own rider and customer lines, and latte or cake lines never play for it', () => {
  const hm = new H.HumorEngine(H.DIALOGUE), all = () => ({});
  hm.reset({ delivery: 3, cargo: 'bouquet' });
  assert.equal(hm.offer('POTHOLE', 0, all)[0].line.text, 'Pothole: 1. Petals: 0.');
  const half = hm.offer('CARGO_HALF', 10, all).map((o) => o.line.cargo);
  assert.ok(half.length > 0 && half.every((c) => c === 'bouquet'), 'half-loss lines are bouquet lines');
  for (const L of H.DIALOGUE) if (L.cargo && L.cargo !== 'bouquet') assert.notEqual(L.cargo, 'bouquet');
});

test('cargo ids: Free Ride and saves accept the three cargoes; anything else, even inherited names, falls back to the latte', () => {
  for (const kind of ['coffee', 'cake', 'bouquet']) assert.equal(H.cleanCargo(kind), kind);
  for (const bad of [undefined, null, 'toaster', 'constructor', '__proto__', 7]) assert.equal(H.cleanCargo(bad), 'coffee', String(bad));
  assert.equal(H.cargoWords('constructor').name, 'LATTE', 'a label lookup never returns a prototype value');
  assert.equal(H.cargoWords('bouquet').short, 'Bouquet');
  assert.equal(H.cargoWords('cake').noun, 'Cake');
});

test('landmarks: Telegraph Hill has its hand-written park inside the route, and the Apify export stays pinned', () => {
  const C = H.buildTelegraphHill();
  assert.equal(C.landmarks.length, 1);
  const [pk] = C.landmarks;
  assert.equal(pk.name, 'Pioneer Park');
  assert.ok(pk.x > C.start && pk.x < C.doorX && pk.x0 < pk.x1, 'the park sits on the route');
  assert.ok(!plain(H.LANDMARK_DATA).routes.some((r) => r.id === 'telegraph-hill'), 'the pinned export is not edited');
});

/* ------------------------- Telegraph Hill: boardwalk ------------------------- */

// Ride a profile on Telegraph Hill, hopping once at hopAt (null stays on the road), and optionally holding a speed through the gust.
function rideTelegraph(profile, { hopAt = null, gustV = 0 } = {}) {
  const C = H.buildTelegraphHill(), w = new H.World(C), ap = new H.Autopilot(profile), events = [];
  let hopped = false, hold = 0, deckV = 0;
  while (w.t < 170 && w.state !== 'done') {
    const i = ap.input(w), b = w.bike;
    if (hopAt !== null && !hopped && b.x >= hopAt && b.grounded) { hopped = true; hold = 0.2; i.jumpPressed = true; }
    if (hold > 0) { i.jumpHeld = true; hold -= H.STEP; }
    if (gustV && b.x > C.gusts[0].x0 - 14 && b.x < C.gusts[0].x1) { i.pedal = b.vx < gustV - 0.5; i.brake = b.vx > gustV; }
    w.step(i);
    events.push(...w.drain());
    if (w.bike.x > C.gusts[0].x1 && w.bike.x < C.boardwalk.x1 - 5 && w.bike.wheels.every((wh) => wh.surf && wh.surf.owner === w.obstacles.boardwalk)) deckV = Math.max(deckV, w.bike.vx);
  }
  return { w, C, events, deckV, r: w.result() };
}
const entered = (events) => events.some((e) => e.type === 'BOARDWALK');

test('boardwalk: a rider who does not hop stays on the road, on every profile', () => {
  for (const p of ['careful', 'typical', 'fast', 'reckless']) {
    const { w, events, r } = rideTelegraph(p);
    assert.equal(w.state, 'done', `${p} road rider must finish`);
    assert.ok(!entered(events), `${p} never joined the boardwalk`);
    assert.ok(r.gustLoss > 0, `${p} rode through the gust`);
    assert.ok(!events.some((e) => e.type === 'SANITY'), `${p} did not respawn`);
  }
});

test('boardwalk: the safe approach keeps the petals, shelters from the gust, and costs time', () => {
  const road = rideTelegraph('typical').r, { events, deckV, C, r } = rideTelegraph('typical', { hopAt: 24 });
  assert.ok(entered(events), 'the hop lands on the boardwalk');
  assert.equal(r.gustLoss, 0, 'no gust up here');
  assert.ok(r.condition > road.condition + 10, `${r.condition} vs road ${road.condition}`);
  assert.ok(r.time > road.time + 3, `${r.time} should cost time against road ${road.time}`);
  assert.ok(deckV > 0 && deckV < C.boardwalk.speedLimit + 1, `held to a pace on the boards: ${deckV}`);
  assert.deepEqual(plain(H.routeGoals('telegraph', r)), [true, true, false], 'two goals: the third belongs to the road');
});

test('boardwalk: hopping anywhere along the entry gets on, with no crash or petal cost', () => {
  for (const hopAt of [14, 18, 24, 30]) {
    const { events, r } = rideTelegraph('typical', { hopAt });
    assert.ok(entered(events), `hop at ${hopAt}`);
    assert.equal(r.crashes, 0, `hop at ${hopAt} crashed`);
    assert.ok(r.condition > 99, `hop at ${hopAt} kept ${r.condition}%`);
  }
});

test('boardwalk: all three goals are still reachable, by riding the gust carefully on the road', () => {
  const { events, r } = rideTelegraph('typical', { gustV: 7.5 });
  assert.ok(!entered(events));
  assert.deepEqual(plain(H.routeGoals('telegraph', r)), [true, true, true], `time ${r.time}, gust ${r.gustLoss}`);
});

test('boardwalk: the wind depends on height; road below the deck is exposed, the deck is not', () => {
  const C = H.buildTelegraphHill(), w = new H.World(C), x = C.gusts[0].x0 + 10, deck = C.boardwalk.pts[2][1];
  assert.equal(w.windAt(x, C.terrain.height(x) + H.RIDE_H), C.gusts[0].wind, 'on the road');
  assert.equal(w.windAt(x, deck + 2), 0, 'on the deck');
  assert.equal(new H.World(H.buildNobHill()).windAt(50, 99), 0, 'routes with no boardwalk are unaffected');
});

test('boardwalk: a hard landing does not fall through the deck', () => {
  const C = H.buildTelegraphHill(), w = new H.World(C), x = C.gusts[0].x1 + 10, p = C.boardwalk.pts, s = (p[3][1] - p[2][1]) / (p[3][0] - p[2][0]);
  const deck = p[2][1] + (x - p[2][0]) * s;
  w.bike.reset(x, deck + H.RIDE_H + 4, 0, 6);
  w.bike.vy = -9;
  for (let i = 0; i < 240; i++) {
    w.step(input());
    if (w.state !== 'riding') break;
    const dx = w.bike.x - p[2][0];
    assert.ok(w.bike.y > p[2][1] + dx * s, `fell through at step ${i}`);
  }
});

test('boardwalk: a crash on the deck respawns on the road, and the road is clear from there', () => {
  const C = H.buildTelegraphHill(), w = new H.World(C), ap = new H.Autopilot('typical'), events = [];
  let hopped = false, hold = 0, crashed = false, onDeckAtCrash = false;
  while (w.t < 170 && w.state !== 'done') {
    const i = ap.input(w), b = w.bike;
    if (!hopped && b.x >= 24 && b.grounded) { hopped = true; hold = 0.2; i.jumpPressed = true; }
    if (hold > 0) { i.jumpHeld = true; hold -= H.STEP; }
    if (!crashed && b.x > 60 && w.state === 'riding') { crashed = true; onDeckAtCrash = w.obstacles.boardwalk.surface.active; w.crash('test', 0.5); }
    w.step(i);
    events.push(...w.drain());
  }
  assert.ok(onDeckAtCrash, 'the crash happened on the boardwalk');
  assert.equal(w.state, 'done', 'the rider still finishes');
  assert.equal(w.result().crashes, 1);
  assert.ok(!events.some((e) => e.type === 'SANITY'), 'no silent respawn');
});

/* --------------------------- routes as data (F-26) --------------------------- */

test('routes: every route in ROUTES is a ROUTE_DATA entry, and its builder is the generic one', () => {
  for (const R of H.ROUTES) {
    assert.ok(H.ROUTE_DATA[R.id], `${R.id} has a data entry`);
    assert.equal(JSON.stringify(R.build()), JSON.stringify(H.buildRoute(R.id)), `${R.id} builds from its entry`);
  }
});

test('routes: positions are a mark plus offsets, read left to right; an unknown mark or step fails loudly', () => {
  const C = H.buildRussianHill(), larkin = C.intersections.find((i) => i.name === 'LARKIN ST').x0;
  assert.equal(C.cones[0], larkin - 6 - 1.4, '"rampX-1.4" with rampX = "larkin-6"');
  // A hand-written route (path steps, no pieces) still builds: Telegraph joined by hand gives the same course.
  const raw = H.joinPieces(H.ROUTE_DATA.telegraph);
  try {
    H.ROUTE_DATA.__raw = raw;
    assert.equal(JSON.stringify(H.buildRoute('__raw')), JSON.stringify({ ...H.buildTelegraphHill(), id: '__raw' }), 'a hand-written path builds the same course');
    H.ROUTE_DATA.__raw = { ...raw, pedestrians: [{ x: 'nowhere+3', kind: 'dog' }] };
    assert.throws(() => H.buildRoute('__raw'), /unknown position "nowhere\+3"/);
    H.ROUTE_DATA.__raw = { ...raw, path: [...raw.path, ['teleport', 9]] };
    assert.throws(() => H.buildRoute('__raw'), /unknown path step "teleport"/);
  } finally { delete H.ROUTE_DATA.__raw; }
});

/* ----------------------------- set pieces (F-30) ----------------------------- */

const PIECE_ROUTES = Object.keys(H.ROUTE_DATA).filter((id) => H.ROUTE_DATA[id].pieces);

test('pieces: every route is built from set pieces', () => {
  assert.deepEqual(plain(PIECE_ROUTES), ['nobHill', 'russianHill', 'telegraph']);
});

test('pieces: the gust block (F-31) blows from its mark to the end of its straight, and declares the hazard', () => {
  const f = H.PIECES.gust({ mark: 'g', enter: [-0.1, 5], len: 30, wind: -4, exit: [0, 5], hints: [{ hazard: 'gust', at: -6 }] });
  assert.deepEqual(plain(f.path), [['ease', -0.1, 5], ['mark', 'g'], ['straight', 30], ['gust', 'g', -4], ['ease', 0, 5]]);
  assert.deepEqual(plain(f.hazards), ['gust']);
  assert.equal(f.hints[0].x, 'g-6'); assert.equal(f.hints[0].id, 'gust', 'the hint defaults to the gust warning');
  const C = H.buildTelegraphHill(), g = C.gusts[0], kearny = C.intersections.find((i) => i.name === 'KEARNY ST');
  assert.equal(C.gusts.length, 1); assert.equal(g.wind, -6);
  assert.ok(Math.abs(g.x1 - g.x0 - 40) < 1e-9 && g.x0 > kearny.x1, 'one 40 m gust, past Kearny');
  assert.ok(C.boardwalk.x0 < g.x0 && C.boardwalk.x1 > g.x1, 'the boardwalk still covers the gust');
});

for (const id of PIECE_ROUTES) {
  test(`pieces ${id}: pieces join without a grade jump, add up to the whole road, and declare difficulty and hazards`, () => {
    const R = H.ROUTE_DATA[id], shapes = H.joinPieces(R).pieceShapes, C = H.buildRoute(id);
    for (let i = 1; i < shapes.length; i++) assert.equal(shapes[i].entry, shapes[i - 1].exit, `${shapes[i].mark || shapes[i].kind} starts on the grade ${shapes[i - 1].kind} ends on`);
    const total = shapes.reduce((s, p) => s + p.length, 0);
    assert.ok(Math.abs(R.origin[0] + total - C.terrain.maxX) < 1e-9, `pieces cover ${total} m; the road ends at ${C.terrain.maxX}`);
    for (const p of shapes) assert.ok(Number.isInteger(p.difficulty) && p.difficulty >= 1 && p.difficulty <= 5, `${p.kind} difficulty ${p.difficulty}`);
    assert.equal(shapes[0].kind, 'plateau'); assert.equal(shapes.at(-1).kind, 'finish');
    const hazards = new Set(shapes.flatMap((p) => p.hazards));
    if (C.potholes.length) assert.ok(hazards.has('pothole'));
    if (C.stairs.length) assert.ok(hazards.has('stairs'));
    if (C.cars.length) assert.ok(hazards.has('car-plank') || hazards.has('car'));
    if (C.ramps.length) assert.ok(hazards.has('ramp'));
    if (C.lips.some((l) => l.big)) assert.ok(hazards.has('big-lip'));
    if (C.lips.some((l) => !l.big)) assert.ok(hazards.has('lip'));
    if ((C.gusts || []).length) assert.ok(hazards.has('gust'));
    for (const c of C.crossers) assert.ok(hazards.has(c.kind), `${c.kind} is a declared hazard`);
  });
}

test('pieces: an unknown piece fails loudly', () => {
  const pieces = H.ROUTE_DATA.nobHill.pieces;
  try {
    H.ROUTE_DATA.nobHill.pieces = [...pieces.slice(0, -1), ['loopTheLoop', {}], pieces.at(-1)];
    assert.throws(() => H.buildNobHill(), /unknown piece "loopTheLoop"/);
  } finally { H.ROUTE_DATA.nobHill.pieces = pieces; }
});

/* ---------------------------- style best (TD-04) ---------------------------- */

test('style: a separate score with a per-route best; corrupt records are ignored and a 0-point run sets nothing', () => {
  assert.equal(H.cleanStyleBest(null), null);
  assert.equal(H.cleanStyleBest({ style: -5 }), null);
  assert.equal(H.cleanStyleBest({ style: 'lots' }), null);
  assert.equal(H.cleanStyleBest([300]), null);
  assert.deepEqual(plain(H.cleanStyleBest({ style: 300 })), { v: H.RECORD_VERSION, style: 300 });
  const first = H.recordStyle(null, 450);
  assert.ok(first.isNew && !first.prev && first.best.style === 450, 'the first styled run is the best');
  assert.ok(!H.recordStyle(null, 0).isNew, 'no style, no record');
  const lower = H.recordStyle({ v: 1, style: 450 }, 300);
  assert.ok(!lower.isNew && lower.best.style === 450, 'a lower run keeps the old best');
  const higher = H.recordStyle({ v: 1, style: 450 }, 600);
  assert.ok(higher.isNew && higher.prev.style === 450 && higher.best.style === 600);
  assert.ok(H.recordStyle({ style: 'corrupt' }, 100).isNew, 'a corrupt record is replaced');
});

test('style: the shift summary totals style and big air across deliveries', () => {
  const S = H.shiftSummary([{ condition: 90, kind: 'coffee', tip: 5, time: 40, par: 46, crashes: 0, nearMisses: 1, cleanLandings: 2, bigAirs: 1, style: 275 },
    { condition: 80, kind: 'cake', tip: 4, time: 42, par: 48, crashes: 1, nearMisses: 0, cleanLandings: 3, bigAirs: 0, style: 150 }]);
  assert.equal(S.style, 425); assert.equal(S.bigAirs, 1);
});

/* ------------------------------- themes (TD-12) ------------------------------- */

test('themes: every course names a theme in THEMES, and every theme names layers that exist', () => {
  const builds = ['buildNobHill', 'buildRussianHill', 'buildTelegraphHill', 'buildTitleCourse', 'buildTestHill', ...H.DRILLS.map((D) => D.build)];
  for (const b of builds) {
    const C = typeof b === 'string' ? H[b]() : b();
    assert.ok(Object.prototype.hasOwnProperty.call(H.THEMES, C.theme), `${C.id} theme "${C.theme}" has an entry`);
  }
  for (const [id, T] of Object.entries(H.THEMES)) {
    assert.ok(H.MID_LAYERS[T.mid], `${id} mid layer "${T.mid}"`);
    assert.ok(['nob', 'russian'].includes(T.far), `${id} far skyline "${T.far}" has a builder`);
    for (const k of ['horizon', 'farParallax', 'farDrop']) assert.ok(Number.isFinite(T[k]), `${id}.${k}`);
  }
  assert.equal(H.themeFor('nowhere'), H.THEMES.nob, 'an unknown theme falls back to Nob Hill');
});

/* ------------------------------ chapters (TD-11) ------------------------------ */

test('chapters: San Francisco is the shift today, with every route in order and the original scores key', () => {
  const sf = H.CHAPTERS[0];
  assert.equal(sf.id, 'sf');
  assert.equal(sf.scoresKey, 'shifts', 'existing high scores stay where they are');
  assert.deepEqual(plain(H.chapterRoutes(sf).map((r) => r.id)), plain(H.ROUTES.map((r) => r.id)));
  const ids = new Set(), keys = new Set();
  for (const ch of H.CHAPTERS) {
    assert.ok(!ids.has(ch.id) && !keys.has(ch.scoresKey), `${ch.id} has its own id and scores key`); ids.add(ch.id); keys.add(ch.scoresKey);
    assert.equal(H.chapterRoutes(ch).length, ch.routes.length, `${ch.id} lists only real routes`);
  }
});

test('chapters: the share text names the chapter\'s place, defaulting to San Francisco', () => {
  const S = { tips: 12.5, avgStars: 4, crashes: 1 };
  assert.match(H.shareText(S), / in San Francisco \(/);
  assert.match(H.shareText({ ...S, place: 'Mars' }), / in Mars \(/);
});

/* ------------------------- physics per world (TD-10) ------------------------- */

test('physics per world: Earth is the default and matches the globals; another planet changes how a world rides', () => {
  const earth = H.physicsFor(undefined);
  assert.equal(earth, H.physicsFor('earth'));
  assert.equal(earth.g, H.PHYS.g); assert.equal(earth.sag, H.SAG); assert.equal(earth.rideH, H.RIDE_H);
  assert.equal(H.physicsFor('nowhere'), earth, 'an unknown planet falls back to Earth');
  H.PLANETS.testMoon = { ...H.PHYS, g: H.PHYS.g * 0.38 };
  try {
    const hop = (planet) => {
      const C = H.makeTestCourse('flat'); C.planet = planet;
      const w = new H.World(C);
      settle(w, 1.5);
      const rest = w.bike.y - C.terrain.height(w.bike.x);
      w.step(input({ jumpPressed: true, jumpHeld: true }));
      let air = 0;
      for (let i = 0; i < 1200; i++) { w.step(input({ jumpHeld: i < 20 })); if (!w.bike.grounded) air += H.STEP; else if (air > 0.1) break; }
      return { w, rest, air };
    };
    const e = hop(undefined), m = hop('testMoon');
    assert.equal(m.w.phys.g, H.PHYS.g * 0.38);
    assert.ok(Math.abs(e.rest - H.RIDE_H) < 0.02, `Earth bike rests at ${e.rest.toFixed(3)}`);
    assert.ok(Math.abs(m.rest - m.w.phys.rideH) < 0.02 && m.w.phys.rideH > H.RIDE_H, 'the Moon bike rests at its own, higher ride height (less sag)');
    assert.ok(m.air > e.air * 2, `low gravity hangs longer: ${m.air.toFixed(2)} s vs ${e.air.toFixed(2)} s`);
  } finally { delete H.PLANETS.testMoon; }
});
