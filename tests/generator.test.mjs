// Route generator (F-33): the layout rules hold for every seed, the same seed always builds the same route, and every
// generated route builds. Riding them is the fairness check's job (tests/fairness.test.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { loadGame } from './harness.mjs';

const H = loadGame();
const SEEDS = Array.from({ length: 2000 }, (_, i) => i + 1);
const CARGOS = ['coffee', 'cake', 'bouquet'];
const byId = Object.fromEntries(H.GEN_SEGMENTS.map((g) => [g.id, g]));
// A fingerprint of a built course: its road sampled every metre, and its objects.
function fingerprint(C) {
  const T = C.terrain, ys = [];
  for (let x = Math.ceil(T.minX); x <= T.maxX; x++) ys.push(T.height(x).toFixed(9));
  const objs = JSON.stringify({ par: C.par, potholes: C.potholes, stairs: C.stairs, lips: C.lips, cars: C.cars, crossers: C.crossers, gusts: C.gusts, checkpoints: C.checkpoints, hints: C.hints });
  return crypto.createHash('sha256').update(ys.join(',') + objs).digest('hex').slice(0, 16);
}

test('generator: the same seed gives the same plan, route, and road; different seeds differ', () => {
  for (const s of [1, 42, 2026, 4294967295]) {
    assert.equal(JSON.stringify(H.generateRoute(s, { cargo: 'cake' })), JSON.stringify(H.generateRoute(s, { cargo: 'cake' })));
    assert.equal(fingerprint(H.buildGenerated(s)), fingerprint(H.buildGenerated(s)));
  }
  const plans = new Set(SEEDS.slice(0, 200).map((s) => H.planRoute(s).segments.map((g) => g.id).join(',')));
  assert.ok(plans.size > 150, `${plans.size} different plans from 200 seeds`);
});

test('generator: recorded plans stay put (a change here changes every player\'s daily route)', () => {
  const plan = (s) => H.planRoute(s).segments.map((g) => g.id).join(',');
  assert.equal(plan(1), 'gentle,crossing,stairs,bigLip,cablecar');
  assert.equal(plan(3), 'gentle,pothole,car,gust,stairs,bigLip');
  assert.equal(plan(2026), 'gentle,crossing,car,park,stairs');
  assert.equal(H.generateRoute(42).meta.par, 42);
  assert.equal(fingerprint(H.buildGenerated(1)), '3d7e4e372e083057', 'seed 1 builds the same road');
});

test('generator: every seed follows the layout rules', () => {
  for (const s of SEEDS) {
    const plan = H.planRoute(s), segs = plan.segments.map((g) => byId[g.id]);
    assert.ok(segs.length >= 5 && segs.length <= 7, `seed ${s}: ${segs.length} segments`);
    assert.equal(new Set(plan.segments.map((g) => g.id)).size, segs.length, `seed ${s}: no segment twice`);
    for (let i = 1; i < segs.length; i++) {
      assert.ok(segs[i].difficulty >= segs[i - 1].difficulty, `seed ${s}: difficulty falls at ${segs[i].id}`);
      assert.ok(!(segs[i].blind && segs[i - 1].blind), `seed ${s}: two blind hazards in a row`);
    }
    assert.ok(segs.filter((g) => g.difficulty === 5).length <= 1, `seed ${s}: more than one difficulty-5 segment`);
    const streets = [plan.start, ...plan.segments.map((g) => g.street)];
    assert.equal(new Set(streets).size, streets.length, `seed ${s}: a street twice`);
    const par = H.generateRoute(s).meta.par;
    assert.ok(par >= 35 && par <= 50, `seed ${s}: par ${par}`);
  }
});

test('generator: every seed and cargo builds, its pieces join without a grade jump, and covers the whole road', () => {
  for (const s of SEEDS) for (const cargo of CARGOS) {
    const R = H.generateRoute(s, { cargo }), shapes = H.joinPieces(R).pieceShapes, C = H.buildRoute('gen', R);
    assert.equal(C.cargo, cargo);
    for (let i = 1; i < shapes.length; i++) assert.equal(shapes[i].entry, shapes[i - 1].exit, `seed ${s}: ${shapes[i].mark} starts on the grade ${shapes[i - 1].mark} ends on`);
    assert.equal(shapes.at(-1).exit, 0);
    const total = shapes.reduce((t, p) => t + p.length, 0);
    assert.ok(Math.abs(R.origin[0] + total - C.terrain.maxX) < 1e-9, `seed ${s}: pieces cover the road`);
    assert.ok(C.checkpoints.every((c, i) => i === 0 || c.x > C.checkpoints[i - 1].x), `seed ${s}: checkpoints in order`);
    assert.ok(C.finishX > C.start && C.length > 300, `seed ${s}: ${C.length} m long`);
  }
});

test('generator: rules can drop segments or set the length; unknown cargo falls back to the latte', () => {
  for (const s of SEEDS.slice(0, 300)) {
    assert.ok(!H.planRoute(s, { exclude: ['cablecar', 'gust'] }).segments.some((g) => g.id === 'cablecar' || g.id === 'gust'));
    assert.equal(H.planRoute(s, { min: 5, max: 5 }).segments.length, 5);
  }
  assert.equal(H.generateRoute(7, { cargo: 'piano' }).meta.cargo, 'coffee');
  assert.equal(H.generateRoute(7, { cargo: 'bouquet' }).meta.theme, 'telegraph');
});
