// Port check (F-28): every course must build and play as recorded in tests/golden/ports.json.
// Restructuring routes or cargo must keep this passing without updating the file.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { loadGame } from './harness.mjs';
import { snapshot, compare, courseBuilders } from './golden/snapshot.mjs';

const golden = JSON.parse(fs.readFileSync(new URL('./golden/ports.json', import.meta.url), 'utf8'));
const H = loadGame();

test('port check: the fingerprint is deterministic from a fresh load', () => {
  assert.deepEqual(compare(snapshot(H), snapshot(loadGame())), []);
});

test('port check: every course the game lists is in the recorded baseline, and nothing else', () => {
  assert.deepEqual(Object.keys(golden.courses).sort(), courseBuilders(H).slice().sort(), 'a new or removed course needs node tests/golden/update.mjs');
});

test('port check: every course builds and plays as recorded', () => {
  const diffs = compare(golden, snapshot(H));
  assert.deepEqual(diffs.slice(0, 12), [], `${diffs.length} differences from tests/golden/ports.json`);
});
