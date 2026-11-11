// Build check (TD-14): index.html is built from src/ by tools/build.mjs and committed, so the game still opens
// straight from the file, Cloudflare Pages serves it as is, and the other tests read it. Edit src/, then run:
// npm run build. These checks need no node_modules.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { readSources, assemble, extractRender3d, firstDiff } from '../tools/build.mjs';

const INDEX = new URL('../index.html', import.meta.url);

test('build: index.html is what src/ builds', () => {
  const html = fs.readFileSync(INDEX, 'utf8');
  // Rebuilding the diorama bundle needs esbuild, so it comes from the committed file here; CI's npm run check covers it.
  const built = assemble({ ...readSources(), render3d: extractRender3d(html) });
  const d = built === html ? null : firstDiff(built, html);
  assert.equal(d, null, d && `index.html differs from src/ at line ${d.line}. Edit src/, not index.html, then run: npm run build`);
});

test('build: the engine fragments end with the headless return, and the presentation layer follows', () => {
  const { gameFiles } = readSources();
  const dir = new URL('../src/game/', import.meta.url);
  const has = (f) => fs.readFileSync(new URL(f, dir), 'utf8').includes("if (HEADLESS || typeof document === 'undefined') return;");
  const at = gameFiles.filter(has);
  assert.deepEqual(at, ['11-autopilot-storage.js'], 'the headless return belongs at the end of 11-autopilot-storage.js');
  assert.ok(gameFiles.indexOf('13-input-audio.js') > gameFiles.indexOf('11-autopilot-storage.js'));
});

test('build: an inlined script cannot close its own tag', () => {
  const src = readSources();
  assert.throws(() => assemble({ ...src, game: src.game + "const s = '</script>';\n" }), /break the inline script/);
  assert.throws(() => assemble({ ...src, template: src.template.replace('<!-- build:game -->\n', '') }), /missing <!-- build:game -->/);
});
