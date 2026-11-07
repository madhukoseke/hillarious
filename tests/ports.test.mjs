// Port check (F-28): every course must build and play exactly as recorded in tests/golden/ports.json.
// Restructuring routes (F-26) or cargo (F-27) must keep this passing without updating the file.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { loadGame } from './harness.mjs';
import { snapshot, COURSE_BUILDERS } from './golden/snapshot.mjs';

const golden = JSON.parse(fs.readFileSync(new URL('./golden/ports.json', import.meta.url), 'utf8'));

test('port check: the fingerprint is deterministic from a fresh load', () => {
  assert.deepEqual(snapshot(loadGame()), snapshot(loadGame()));
});

test('port check: every course builds and plays exactly as recorded', () => {
  const now = snapshot(loadGame());
  assert.deepEqual(Object.keys(now), [...COURSE_BUILDERS, 'cargoRides', 'unbreakable', 'cargoScripts'], 'course list');
  for (const build of COURSE_BUILDERS) {
    const g = golden[build], n = now[build];
    assert.ok(g, `${build} has no recorded fingerprint; run node tests/golden/update.mjs`);
    assert.equal(n.terrain, g.terrain, `${build}: terrain changed`);
    assert.equal(n.course, g.course, `${build}: objects, hints, checkpoints or other course data changed`);
    for (const [p, r] of Object.entries(g.rides)) {
      const m = n.rides[p];
      const where = `${build} ${p}: ${r.time.toFixed(2)} s ${r.condition.toFixed(1)}% -> ${m.time.toFixed(2)} s ${m.condition.toFixed(1)}%`;
      assert.deepEqual(m, r, `ride changed (${where})`);
    }
  }
  for (const group of ['cargoRides', 'unbreakable']) for (const [k, r] of Object.entries(golden[group])) {
    const m = now[group][k];
    assert.deepEqual(m, r, `${group} ${k} changed: ${r.time.toFixed(2)} s ${r.condition.toFixed(1)}% -> ${m.time.toFixed(2)} s ${m.condition.toFixed(1)}%`);
  }
  for (const [k, v] of Object.entries(golden.cargoScripts)) assert.equal(now.cargoScripts[k], v, `${k} cargo rules changed`);
});
