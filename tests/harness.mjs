// Loads the game script from index.html into a Node VM (headless: no DOM, no boot).
import fs from 'node:fs';
import vm from 'node:vm';

const INDEX = new URL('../index.html', import.meta.url);

export function extractGameScript() {
  const html = fs.readFileSync(INDEX, 'utf8');
  const m = html.match(/<script id="game">([\s\S]*?)<\/script>/);
  if (!m) throw new Error('index.html: <script id="game"> not found');
  return m[1];
}

export function loadGame() {
  const ctx = { console, Math, Number, JSON, Object, Array, Set, Map, Float32Array, Float64Array, __HILL_HEADLESS__: true };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(extractGameScript(), ctx, { filename: 'index.html#game' });
  if (!ctx.HILL) throw new Error('game script did not expose HILL');
  return ctx.HILL;
}

// Run a world with an input function until done or a time limit (sim seconds).
export function runWorld(H, world, inputFn, maxT = 120, onStep) {
  while (world.t < maxT && world.state !== 'done') {
    world.step(inputFn(world));
    if (onStep) onStep(world);
  }
  return world;
}

export const input = (o = {}) => Object.assign(
  { pedal: false, brake: false, leanBack: false, leanFwd: false, jumpHeld: false, jumpPressed: false }, o);
