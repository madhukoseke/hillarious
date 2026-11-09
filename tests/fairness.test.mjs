// Fairness check (F-29): all four autopilot riders on every route and drill the game lists, and on generated routes, so new content is covered
// without editing this file. It fails if a rider cannot finish, if any ride silently respawns, if the careful or
// typical rider crashes, or if the typical rider's time falls outside the band around par.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadGame } from './harness.mjs';

const H = loadGame();
const PROFILES = ['careful', 'typical', 'fast', 'reckless'];
// Typical time as a share of par: at most 1 (par is beatable), at least BAND_MIN (par is not loose).
const BAND_MIN = 0.55;

function ride(build, profile) {
  const w = new H.World(build()), ap = new H.Autopilot(profile), seen = new Set();
  while (w.t < 200 && w.state !== 'done') { w.step(ap.input(w)); for (const e of w.drain()) seen.add(e.type); }
  return { w, r: w.result(), sanity: seen.has('SANITY') };
}

// Generated routes (F-33): every seed must be fair, with every cargo. Each push rides seeds 1–5, which between them use
// every segment; FAIRNESS_SEEDS=2000 rides seeds 1–2000 (FAIRNESS_FROM moves the start, to split the run).
const GEN_FROM = Number(process.env.FAIRNESS_FROM) || 1, GEN_COUNT = Number(process.env.FAIRNESS_SEEDS) || 5;
const GEN_SEEDS = Array.from({ length: GEN_COUNT }, (_, i) => GEN_FROM + i);
const generated = GEN_SEEDS.flatMap((seed) => ['coffee', 'cake', 'bouquet'].map((cargo) => ({ id: `gen-${seed}-${cargo}`, build: () => H.buildGenerated(seed, { cargo }) })));
const content = [...H.ROUTES.map((R) => ({ id: R.id, build: R.build })), ...H.DRILLS.map((D) => ({ id: D.id, build: D.build })), ...generated];

test('fairness: the generated seeds ridden on every push use every segment', () => {
  if (GEN_FROM !== 1 || GEN_COUNT < 5) return;
  const used = new Set(GEN_SEEDS.flatMap((s) => H.planRoute(s).segments.map((g) => g.id)));
  assert.equal([...used].sort().join(','), [...H.GEN_SEGMENTS.map((g) => g.id)].sort().join(','));
});

test('fairness: the check covers every route and drill the game lists', () => {
  assert.ok(H.ROUTES.length >= 3 && H.DRILLS.length >= 6, `${H.ROUTES.length} routes, ${H.DRILLS.length} drills`);
});

for (const { id, build } of content) {
  test(`fairness ${id}: every rider finishes, no silent respawns, careful and typical ride clean, typical inside the par band`, () => {
    const par = build().par;
    for (const p of PROFILES) {
      const { w, r, sanity } = ride(build, p);
      assert.equal(w.state, 'done', `${id} ${p} did not finish (x=${w.bike.x.toFixed(1)} after ${w.t.toFixed(0)} s)`);
      assert.ok(!sanity, `${id} ${p} tripped the non-finite guard`);
      if (p === 'careful' || p === 'typical') assert.equal(r.crashes, 0, `${id} ${p} crashed ${r.crashes}×`);
      if (p === 'typical') {
        const share = r.time / par;
        assert.ok(share <= 1 && share >= BAND_MIN, `${id} typical ${r.time.toFixed(1)} s is ${share.toFixed(2)}× par ${par} (band ${BAND_MIN}–1)`);
      }
    }
  });
}
