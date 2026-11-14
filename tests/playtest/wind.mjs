// Summit wind check (F-41): on a test summit with two windsock gusts, each gust whooshes and pops GUST AHEAD before
// it starts, the sock fills, leaves blow (and hold still with reduced motion), and the ride finishes with the disco
// ball. Fails on any console or page error. Runs on a controlled clock, so it takes seconds.
//
// Playwright is loaded from the folder you run this in, as with cross-browser.mjs:
//   cd /tmp/hill-pw && node /path/to/hillarious/tests/playtest/wind.mjs [file-or-url-of-index.html] [shots-dir]
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
// The summit test route from tests/sim.test.mjs, added to the page's routes so Free Ride can ride it.
const addSummit = () => {
  const H = window.HILL;
  H.ROUTE_DATA.__summit = {
    meta: { index: 9, title: 'SUMMIT TEST', hood: 'TWIN PEAKS', street: 'TWIN PEAKS BLVD', theme: 'nob', cargo: 'disco', par: 60, seed: 9 },
    origin: [-60, 0], start: 3, park: { x0: -60, x1: 1 },
    pieces: [
      ['plateau', { len: 90, street: [3, 12, 'CHRISTMAS TREE PT'], checkpoints: ['start'] }],
      ['gust', { mark: 'g1', enter: [-0.08, 6], len: 36, wind: -6, sock: true, exit: [-0.14, 6], difficulty: 2, checkpoints: [10] }],
      ['gust', { mark: 'g2', len: 36, wind: -6, sock: true, exit: [0, 6], difficulty: 3 }],
      ['block', { mark: 'out', len: 40 }],
      ['finish', { mark: 'fin', len: 90 }],
    ],
    finish: { at: 'fin', office: { x0: 12, x1: 30 } },
    customer: { name: 'Test', role: 'Tester', avatar: 'founder', brand: 'TEST', order: 'ORDER #0000', route: 'Summit test', messages: ['Hold on.', 'It is windy.'], cargoNote: 'Cargo: a disco ball.', cargoLabel: 'Sparkle' },
  };
  H.ROUTES.push({ id: '__summit', build: () => H.buildRoute('__summit') });
  const g = H.game, A = g.audio, play = A.play.bind(A), pop = g.pop.bind(g);
  window.__sounds = []; A.play = (k, ...r) => { window.__sounds.push(k); return play(k, ...r); };
  window.__pops = []; g.pop = (t, ...r) => { window.__pops.push(t); return pop(t, ...r); };
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
  await page.evaluate(addSummit);
  await page.evaluate(() => HILL.game.startRun({ mode: 'free', route: '__summit', cargo: 'disco', traffic: true }));
  // Ride until the rider is inside the first gust.
  let s = null;
  for (let i = 0; i < 300; i++) {
    await page.evaluate(() => window.__tick(10));
    s = await page.evaluate(() => { const W = HILL.game.world; return { x: W.bike.x, warned: W.sockIdx, wind: W.windAt(W.bike.x, W.bike.y), in: W.bike.x > W.socks[0].x0 + 4 }; });
    if (s.wind && s.in) break;
  }
  const first = await page.evaluate(() => ({ whoosh: window.__sounds.includes('whoosh'), pop: window.__pops.includes('💨 GUST AHEAD') }));
  check(`${tag}: before the first gust, a whoosh and GUST AHEAD`, s.warned >= 1 && first.whoosh && first.pop, { ...s, ...first });
  if (shots) await page.screenshot({ path: `${shots}/wind-${reduced ? 'reduced' : 'full'}.png` });
  // The leaves move between frames with full motion, and hold still with reduced motion. Only the wind's ellipses count.
  const still = await page.evaluate(() => {
    const g = HILL.game, P = CanvasRenderingContext2D.prototype, ex = [], orig = P.ellipse, draw = g.drawWind;
    g.drawWind = function (...r) { P.ellipse = function (x, ...e) { ex.push(Math.round(x)); return orig.call(this, x, ...e); }; try { return draw.apply(this, r); } finally { P.ellipse = orig; } };
    g.renderWorld(); const a = ex.splice(0);
    g.time += 0.7; g.renderWorld(); const b = ex.splice(0); g.time -= 0.7;
    g.drawWind = draw;
    return { leaves: a.length, same: a.join() === b.join() };
  });
  check(`${tag}: leaves blow through the gust and ${reduced ? 'hold still' : 'move'}`, still.leaves >= 8 && still.same === reduced, still);
  for (let i = 0; i < 400 && (await page.evaluate(() => HILL.game.state)) !== 'review'; i++) await page.evaluate(() => window.__tick(30));
  const end = await page.evaluate(() => ({ state: HILL.game.state, whooshes: window.__sounds.filter((k) => k === 'whoosh').length }));
  check(`${tag}: both gusts whooshed and the ride finished`, end.state === 'review' && end.whooshes === 2, end);
  check(`${tag}: no console errors`, !errors.length, [...new Set(errors)]);
  await ctx.close();
}

await browser.close();
console.log(failed ? `${failed} failed` : 'all passed');
process.exit(failed ? 1 : 0);
