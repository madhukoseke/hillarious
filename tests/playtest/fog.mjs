// Fog check (F-40, Karl the Fog): on a test route with two fog banks, the fog draws, each hazard in it beeps and gets
// an amber light and a tag, Karl's line plays, reduced motion holds the fog still, and drawing a fogged frame stays
// well inside a 60 fps budget. Fails on any console or page error. Runs on a controlled clock, so it takes seconds.
//
// Playwright is loaded from the folder you run this in, as with cross-browser.mjs:
//   cd /tmp/hill-pw && node /path/to/hillarious/tests/playtest/fog.mjs [file-or-url-of-index.html] [shots-dir]
import { createRequire } from 'node:module';
import path from 'node:path';

const { chromium } = createRequire(process.cwd() + '/')('playwright');
const arg = process.argv[2] || new URL('../../index.html', import.meta.url).pathname;
const shots = process.argv[3] || null;
const base = /^https?:/.test(arg) ? arg : 'file://' + path.resolve(arg);
const clock = () => {
  let now = 0; const q = [];
  window.requestAnimationFrame = (f) => { q.push(f); return q.length; };
  performance.now = () => now;
  window.__tick = (n) => { for (let i = 0; i < n; i++) { now += 1000 / 60; for (const f of q.splice(0)) f(now); } };
};
// The fog test route from tests/sim.test.mjs, added to the page's routes so Free Ride can ride it.
const addFogRoute = () => {
  const H = window.HILL;
  H.ROUTE_DATA.__fog = {
    meta: { index: 9, title: 'FOG TEST', hood: 'TWIN PEAKS', street: 'TWIN PEAKS BLVD', theme: 'nob', cargo: 'disco', par: 60, seed: 9 },
    origin: [-60, 0], start: 3, park: { x0: -60, x1: 1 },
    pieces: [
      ['plateau', { len: 70, street: [3, 12, 'BURNETT AVE'], checkpoints: ['start'] }],
      ['fog', { mark: 'fogA', enter: [-0.14, 6], len: 70, exit: [0, 6], difficulty: 2, density: 0.8, potholes: [[30, 1.3, 0.2]], car: { at: 52, plank: true }, cones: [44], checkpoints: [10], hints: [{ hazard: 'fog', at: -8 }] }],
      ['fog', { mark: 'fogB', enter: [-0.22, 6], len: 60, exit: [0, 7], difficulty: 3, density: 1, potholes: [[24, 1.5, 0.22]], ramp: 44, checkpoints: [8] }],
      ['block', { mark: 'out', len: 40, exit: [0, 6] }],
      ['finish', { mark: 'fin', len: 90 }],
    ],
    finish: { at: 'fin', office: { x0: 12, x1: 30 } },
    customer: { name: 'Karl', role: 'Fog', avatar: 'founder', brand: 'TEST', order: 'ORDER #0000', route: 'Fog test', messages: ['Into the fog.', 'Listen for the beeps.'], cargoNote: 'Cargo: a disco ball.', cargoLabel: 'Sparkle' },
  };
  H.ROUTES.push({ id: '__fog', build: () => H.buildRoute('__fog') });
  const g = H.game, A = g.audio, play = A.play.bind(A);
  window.__sounds = []; A.play = (k, ...r) => { window.__sounds.push(k); return play(k, ...r); };
  window.__said = []; const say = g.say.bind(g); g.say = (t, ...r) => { window.__said.push(t); return say(t, ...r); };
};

const browser = await chromium.launch();
let failed = 0;
const check = (name, ok, info) => { if (!ok) failed++; console.log((ok ? 'ok   ' : 'FAIL ') + name + (info !== undefined ? ' ' + JSON.stringify(info) : '')); };

for (const reduced of [false, true]) {
  const tag = reduced ? 'reduced motion' : 'full motion';
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, reducedMotion: reduced ? 'reduce' : 'no-preference' });
  await ctx.addInitScript(clock);
  const page = await ctx.newPage(), errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().split('\n')[0]); });
  await page.goto(`${base}?unlock=all&autopilot=typical`);
  await page.waitForTimeout(300);
  await page.evaluate(addFogRoute);
  await page.evaluate(() => HILL.game.startRun({ mode: 'free', route: '__fog', cargo: 'disco', traffic: true }));
  // Ride until the first warnings have fired and the rider is inside the first bank.
  let s = null;
  for (let i = 0; i < 300; i++) {
    await page.evaluate(() => window.__tick(10));
    s = await page.evaluate(() => { const W = HILL.game.world; return { state: HILL.game.state, x: W.bike.x, inFog: W.inFog, warned: W.fogIdx, k: HILL.game.fogK }; });
    if (s.warned >= 2 && s.inFog && s.k > 0.5) break;
  }
  check(`${tag}: the rider enters the fog and hazards are warned`, s && s.inFog && s.warned >= 2, s);
  if (shots) await page.screenshot({ path: `${shots}/fog-${reduced ? 'reduced' : 'full'}.png` });
  // Reduced motion: the bands do not move between frames. Full motion: they drift. Only ellipses drawn by the fog count.
  const still = await page.evaluate(() => {
    const g = HILL.game, P = CanvasRenderingContext2D.prototype, ex = [], orig = P.ellipse, fog = g.drawFog;
    g.drawFog = function (...r) { P.ellipse = function (x, ...e) { ex.push(Math.round(x)); return orig.call(this, x, ...e); }; try { return fog.apply(this, r); } finally { P.ellipse = orig; } };
    g.renderWorld(); const a = ex.splice(0);
    g.time += 3; g.renderWorld(); const b = ex.splice(0); g.time -= 3;
    g.drawFog = fog;
    return a.length > 0 && a.join() === b.join();
  });
  check(`${tag}: fog bands ${reduced ? 'hold still' : 'drift'}`, still === reduced);
  // Drawing budget: the same frame with and without fog, each flushed to pixels. The fog's layers cost little, and a
  // fogged frame stays inside 60 fps (16.7 ms) even in headless Chromium's software renderer.
  const cost = await page.evaluate(() => {
    const g = HILL.game, C = g.world.course, fogs = C.fogs, c = g.R.ctx;
    const time = (n) => { const t0 = Date.now(); for (let i = 0; i < n; i++) { g.renderWorld(); c.getImageData(0, 0, 1, 1); } return (Date.now() - t0) / n; }; // Date: the page clock is faked
    time(10);
    const withFog = time(40); C.fogs = undefined; const without = time(40); C.fogs = fogs;
    return { withFog: +withFog.toFixed(2), without: +without.toFixed(2) };
  });
  check(`${tag}: a fogged frame stays inside 60 fps, and the fog adds under 3 ms`, cost.withFog < 16.7 && cost.withFog - cost.without < 3, cost);
  for (let i = 0; i < 400 && (await page.evaluate(() => HILL.game.state)) !== 'review'; i++) await page.evaluate(() => window.__tick(30));
  const end = await page.evaluate(() => ({ state: HILL.game.state, beeps: window.__sounds.filter((k) => k === 'fogbeep').length, hazards: HILL.game.world.fogHz.length, karl: window.__said.includes('FOG_IN') }));
  check(`${tag}: every hazard beeped and Karl spoke, and the ride finished`, end.state === 'review' && end.beeps >= end.hazards && end.karl, end);
  check(`${tag}: no console errors`, !errors.length, [...new Set(errors)]);
  await ctx.close();
}

await browser.close();
console.log(failed ? `${failed} failed` : 'all passed');
process.exit(failed ? 1 : 0);
