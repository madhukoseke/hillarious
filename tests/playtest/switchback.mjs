// Switchback check (F-42): on a test route with two hairpins, the view swings 180° over about 0.8 s at each one (the
// mirror factor runs smoothly from 1 to -1 and back), the ride carries on the other way across the screen, and with
// reduced motion it cuts during a wipe through black instead. Fails on any console or page error. Runs on a controlled
// clock, so it takes seconds.
//
// Playwright is loaded from the folder you run this in, as with cross-browser.mjs:
//   cd /tmp/hill-pw && node /path/to/hillarious/tests/playtest/switchback.mjs [file-or-url-of-index.html] [shots-dir]
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
// The switchback test route from tests/sim.test.mjs, added to the page's routes so Free Ride can ride it.
const addRoute = () => {
  const H = window.HILL;
  H.ROUTE_DATA.__sb = {
    meta: { index: 9, title: 'SWITCHBACK TEST', hood: 'TWIN PEAKS', street: 'TWIN PEAKS BLVD', theme: 'nob', cargo: 'disco', par: 60, seed: 9 },
    origin: [-60, 0], start: 3, park: { x0: -60, x1: 1 },
    pieces: [
      ['plateau', { len: 90, street: [3, 12, 'BURNETT AVE'], checkpoints: ['start'] }],
      ['switchback', { mark: 'sb1', enter: [-0.1, 6], grade: -0.1, len: 30, len2: 20, checkpoints: [6] }],
      ['switchback', { mark: 'sb2', grade: -0.1, len: 20, exit: [0, 6], potholes: [[34, 1.2, 0.18]], checkpoints: [4] }],
      ['block', { mark: 'out', len: 40 }],
      ['finish', { mark: 'fin', len: 90 }],
    ],
    finish: { at: 'fin', office: { x0: 12, x1: 30 } },
    customer: { name: 'Test', role: 'Tester', avatar: 'founder', brand: 'TEST', order: 'ORDER #0000', route: 'Switchback test', messages: ['Hairpins ahead.', 'Hold on.'], cargoNote: 'Cargo: a disco ball.', cargoLabel: 'Sparkle' },
  };
  H.ROUTES.push({ id: '__sb', build: () => H.buildRoute('__sb') });
};

const browser = await chromium.launch();
let failed = 0;
const check = (name, ok, info) => { if (!ok) failed++; console.log((ok ? 'ok   ' : 'FAIL ') + name + (info !== undefined ? ' ' + JSON.stringify(info) : '')); };
const snap = () => { const g = HILL.game, W = g.world; return { mx: +g.R.mx.toFixed(3), turns: W.turns, x: +W.bike.x.toFixed(1), state: g.state }; };

for (const reduced of [false, true]) {
  const tag = reduced ? 'reduced motion' : 'full motion';
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, reducedMotion: reduced ? 'reduce' : 'no-preference' });
  await ctx.addInitScript(clock);
  const page = await ctx.newPage(), errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().split('\n')[0]); });
  await page.goto(`${base}?unlock=all&autopilot=typical`);
  await page.waitForTimeout(300);
  await page.evaluate(addRoute);
  await page.evaluate(() => HILL.game.startRun({ mode: 'free', route: '__sb', cargo: 'disco', traffic: true }));
  // Ride one frame at a time through the first hairpin, recording the mirror factor and the wipe.
  const frames = [];
  let s = await page.evaluate(snap);
  for (let i = 0; i < 4000 && s.turns < 1; i++) { await page.evaluate(() => window.__tick(4)); s = await page.evaluate(snap); }
  check(`${tag}: the rider reaches the first hairpin`, s.turns === 1, s);
  for (let i = 0; i < 70; i++) {
    await page.evaluate(() => window.__tick(1));
    frames.push(await page.evaluate(() => { const g = HILL.game, c = g.R.ctx, d = c.getImageData(g.R.cv.width / 2, 8, 1, 1).data; return { mx: g.R.mx, dark: d[0] + d[1] + d[2] < 120 }; }));
    if (shots && i === 20) await page.screenshot({ path: `${shots}/switchback-${reduced ? 'reduced' : 'full'}-mid.png` });
  }
  const mxs = frames.map((f) => f.mx), end = mxs.at(-1);
  const steps = mxs.slice(1).map((m, i) => Math.abs(m - mxs[i])), done = mxs.findIndex((m) => m <= -0.999);
  if (!reduced) {
    check(`${tag}: the view swings smoothly from 1 to -1 in about 0.8 s`, end <= -0.999 && Math.max(...steps) < 0.25 && done >= 40 && done <= 54 && mxs.some((m) => Math.abs(m) < 0.2), { done, maxStep: +Math.max(...steps).toFixed(3) });
  } else {
    check(`${tag}: the view cuts once (no swing), during a wipe through black`, end === -1 && mxs.every((m) => Math.abs(m) === 1) && frames.some((f) => f.dark), { cuts: steps.filter((x) => x > 1).length, dark: frames.filter((f) => f.dark).length });
  }
  if (shots) await page.screenshot({ path: `${shots}/switchback-${reduced ? 'reduced' : 'full'}-after.png` });
  // The second hairpin turns it back; then the ride finishes.
  for (let i = 0; i < 4000 && s.turns < 2; i++) { await page.evaluate(() => window.__tick(4)); s = await page.evaluate(snap); }
  await page.evaluate(() => window.__tick(60));
  check(`${tag}: the second hairpin turns the view back`, (await page.evaluate(snap)).mx === 1);
  for (let i = 0; i < 400 && (await page.evaluate(() => HILL.game.state)) !== 'review'; i++) await page.evaluate(() => window.__tick(30));
  check(`${tag}: the ride finishes`, (await page.evaluate(() => HILL.game.state)) === 'review');
  check(`${tag}: no console errors`, !errors.length, [...new Set(errors)]);
  await ctx.close();
}

await browser.close();
console.log(failed ? `${failed} failed` : 'all passed');
process.exit(failed ? 1 : 0);
