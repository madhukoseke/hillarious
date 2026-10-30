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
  // The high-score board's X / LinkedIn profile links are only followed when a player clicks them.
  const html = fs.readFileSync(new URL('index.html', ROOT), 'utf8')
    .replaceAll('http://www.w3.org/2000/svg', '').replaceAll("'https://x.com/'", '').replaceAll("'https://www.linkedin.com/in/'", '');
  for (const bad of ['http://', 'https://', '@import', 'fetch(', 'XMLHttpRequest', 'import(', '<script src']) {
    assert.ok(!html.includes(bad), `index.html contains "${bad}"`);
  }
  for (const m of html.matchAll(/<link\b[^>]*>/g)) assert.match(m[0], /href="data:/, `non-inline <link>: ${m[0].slice(0, 60)}`);
});

/* ------------------------------ course ------------------------------ */

const COURSES = ['buildNobHill', 'buildRussianHill'];

for (const build of COURSES) {
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

test('gameplay: both deliveries are finishable by every rider; typical runs fit the 2-minute demo', () => {
  const rows = [];
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
    }
  }
  assert.ok(typicalTotal <= 92, `typical riding total ${typicalTotal.toFixed(1)} s leaves room for menus in 2 minutes`);
  console.log('\n  Autopilot results:\n  ' + rows.join('\n  '));
});

test('gameplay: humor triggers fire along both routes', () => {
  const need = {
    buildNobHill: ['MAYBEMO_ENCOUNTER', 'MAYBEMO_OVER', 'CABLE_CAR_ENCOUNTER', 'BIG_AIR', 'CLEAN_LANDING', 'POWERUP', 'HINT', 'DELIVERED'],
    buildRussianHill: ['STAIRS', 'CABLE_CAR_ENCOUNTER', 'MAYBEMO_ENCOUNTER', 'MAYBEMO_STOPPED', 'CAKE_DECOR', 'POWERUP', 'DELIVERED'],
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

test('high scores: the three best shifts are kept, ranked by tips then time', () => {
  let list = [];
  const add = (tips, time) => { const r = H.recordShift(list, { tips, time }); list = r.list; return r.rank; };
  assert.equal(add(8, 90), 1);
  assert.equal(add(10, 95), 1);
  assert.equal(add(9, 80), 2);
  assert.equal(add(7, 70), 0, 'fourth place is not kept');
  assert.equal(add(10, 85), 1, 'same tips, faster time wins');
  assert.deepEqual([...list.map((e) => e.tips)], [10, 10, 9]);
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
  for (const build of COURSES) {
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
