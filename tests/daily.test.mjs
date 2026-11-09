// Daily Dispatch (F-34): the date decides the route, cargo, and remix; one scored attempt a day; a streak for
// consecutive days; corrupt saves are ignored.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadGame } from './harness.mjs';

const H = loadGame();
const plain = (v) => JSON.parse(JSON.stringify(v));

test('daily: date keys are the local calendar date, and bad dates are rejected', () => {
  assert.equal(H.dateKey(new Date(2026, 10, 9, 23, 59)), '2026-11-09');
  assert.equal(H.dateKey(new Date(2027, 0, 1, 0, 0)), '2027-01-01');
  for (const bad of ['2026-02-30', '2026-13-01', '26-11-09', '', null, 20261109, '2026-11-09T00:00']) assert.ok(!H.validDateKey(bad), String(bad));
  assert.equal(H.dayIndex('2026-11-10') - H.dayIndex('2026-11-09'), 1);
  assert.equal(H.keyForDay(H.dayIndex('2028-02-29')), '2028-02-29');
});

test('daily: numbers count days from launch', () => {
  assert.equal(H.dailyNumber(H.DAILY_EPOCH), 1);
  assert.equal(H.dailyNumber(H.keyForDay(H.dayIndex(H.DAILY_EPOCH) + 41)), 42);
});

test('daily: the same date always gives the same seed, cargo, remix, and road; nearby dates differ', () => {
  const a = H.dailySpec('2026-11-20'), b = H.dailySpec('2026-11-20');
  assert.deepEqual(plain(a), plain(b));
  assert.equal(a.seed, H.dailySeed('2026-11-20'));
  assert.equal(JSON.stringify(H.buildDaily('2026-11-20').terrain.height(200)), JSON.stringify(H.buildDaily('2026-11-20').terrain.height(200)));
  const seeds = new Set(), cargos = new Set(), remixes = new Set();
  for (let d = 0; d < 60; d++) { const s = H.dailySpec(H.keyForDay(H.dayIndex(H.DAILY_EPOCH) + d)); seeds.add(s.seed); cargos.add(s.cargo); remixes.add(s.remix); }
  assert.equal(seeds.size, 60, 'a new seed every day');
  assert.equal(cargos.size, 3, 'every cargo comes up'); assert.equal(remixes.size, H.DAILY_REMIXES.length, 'every remix comes up');
  assert.equal(H.dailySpec('2026-11-09').seed, 2261889928, 'recorded: changing this changes every daily route');
  assert.throws(() => H.dailySpec('2026-02-30'), /bad date/);
});

test('daily: a daily route is a generated route with the day\'s cargo and remix, under the daily title', () => {
  for (let d = 0; d < 120; d++) {
    const key = H.keyForDay(H.dayIndex(H.DAILY_EPOCH) + d), spec = H.dailySpec(key), C = H.buildDaily(key);
    assert.equal(C.id, 'daily'); assert.equal(C.cargo, spec.cargo); assert.equal(C.title, 'HILLARIOUS #' + spec.number);
    assert.ok(C.par >= 35 && C.par <= 50, `${key}: par ${C.par}`);
    const ids = H.planRoute(spec.seed, H.DAILY_REMIXES.find((x) => x.id === spec.remix).rules).segments.map((g) => g.id);
    if (spec.remix === 'short') assert.equal(ids.length, 5);
    if (spec.remix === 'calm') assert.ok(!ids.includes('gust') && !ids.includes('cablecar'));
    assert.equal(C.gusts ? 1 : 0, ids.includes('gust') ? 1 : 0);
  }
});

test('daily: every remix keeps the layout rules and par for 2,000 seeds', () => {
  for (const remix of H.DAILY_REMIXES) for (let s = 1; s <= 2000; s++) {
    const R = H.generateRoute(s, remix.rules), plan = R.plan;
    assert.ok(R.meta.par >= 35 && R.meta.par <= 50, `${remix.id} seed ${s}: par ${R.meta.par}`);
    for (let i = 1; i < plan.length; i++) assert.ok(plan[i].difficulty >= plan[i - 1].difficulty);
  }
});

test('daily: one scored attempt a day; restarting or coming back later is practice', () => {
  const spec = H.dailySpec('2026-11-20');
  const first = H.startDaily(null, null, spec);
  assert.ok(first.scored); assert.equal(first.rec.result, null); assert.deepEqual(plain(first.streak), { v: 1, count: 1, best: 1, last: '2026-11-20' });
  const again = H.startDaily(first.rec, first.streak, spec);
  assert.ok(!again.scored, 'the second start the same day is unscored, even before a result');
  const done = H.finishDaily(first.rec, spec, { time: 41.5, condition: 88, crashes: 1, tip: 4.2 }, 4);
  assert.deepEqual(plain(done.result), { time: 41.5, condition: 88, crashes: 1, tip: 4.2, stars: 4 });
  assert.equal(H.finishDaily(done, spec, { time: 30, condition: 100, crashes: 0, tip: 9 }, 5), null, 'a later ride cannot overwrite it');
  assert.equal(H.finishDaily(first.rec, H.dailySpec('2026-11-21'), { time: 30, condition: 100, crashes: 0, tip: 9 }, 5), null, 'nor can another day\'s');
  assert.ok(H.startDaily(done, first.streak, H.dailySpec('2026-11-21')).scored, 'a new day, a new attempt');
});

test('daily: the streak grows on consecutive days, resets after a gap, and keeps its best', () => {
  let s = null;
  for (const k of ['2026-11-20', '2026-11-21', '2026-11-22']) s = H.nextStreak(s, k);
  assert.deepEqual(plain(s), { v: 1, count: 3, best: 3, last: '2026-11-22' });
  assert.deepEqual(plain(H.nextStreak(s, '2026-11-22')), plain(s), 'twice in a day changes nothing');
  const gap = H.nextStreak(s, '2026-11-25');
  assert.equal(gap.count, 1); assert.equal(gap.best, 3);
  assert.equal(H.nextStreak({ v: 1, count: 4, best: 9, last: '2026-12-31' }, '2027-01-01').count, 5, 'across a new year');
});

test('daily: corrupt saved records are ignored', () => {
  for (const bad of [null, 'x', [1], {}, { date: 'tomorrow', seed: 1 }, { date: '2026-11-20', seed: -1 }, { date: '2026-11-20', seed: 1.5 },
    { date: '2026-11-20', seed: 1, result: { time: 'fast' } }, { date: '2026-11-20', seed: 1, result: { time: 1, condition: 1, crashes: 1, tip: -2, stars: 1 } }]) {
    assert.equal(H.cleanDaily(bad), null, JSON.stringify(bad));
  }
  assert.deepEqual(plain(H.cleanDaily({ v: 1, date: '2026-11-20', seed: 5, result: null, extra: 1 })), { v: 1, date: '2026-11-20', seed: 5, result: null });
  for (const bad of [null, { count: -1, best: 0, last: null }, { count: 2, best: 1, last: null }, { count: 1, best: 1, last: 'soon' }, { count: 'many' }]) {
    assert.deepEqual(plain(H.cleanStreak(bad)), { v: 1, count: 0, best: 0, last: null }, JSON.stringify(bad));
  }
  assert.ok(H.startDaily({ date: 'garbage' }, { count: 'x' }, H.dailySpec('2026-11-20')).scored, 'a corrupt record never blocks the day\'s attempt');
});
