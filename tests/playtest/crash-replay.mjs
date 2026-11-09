// Crash replay check (F-32): a crashing rider sees a replay of each crash before respawning, it can be skipped, and it
// is off with reduced motion and in autopilot demos (unless ?replay=on). Fails on any console or page error.
// The page runs on a controlled clock (manual animation frames, fake time), so it finishes in seconds.
//
// Playwright is loaded from the folder you run this in, as with cross-browser.mjs:
//   cd /tmp/hill-pw && node /path/to/hillarious/tests/playtest/crash-replay.mjs [file-or-url-of-index.html] [shots-dir]
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
const snap = () => {
  const g = HILL.game, W = g.world;
  return { state: g.state, replaying: !!g.replaying, pending: !!g.replay, crashes: W ? W.score.crashes : 0, wstate: W ? W.state : null,
    rstate: g.replaying ? g.replay.world.state : null, rate: g.replaying ? g.replay.rate() : null, zoom: g.cam.zoom };
};

const browser = await chromium.launch();
let failed = 0;
const check = (name, ok, info) => { if (!ok) failed++; console.log((ok ? 'ok   ' : 'FAIL ') + name + (info ? ' ' + JSON.stringify(info) : '')); };

async function open(query, opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, reducedMotion: opts.reduced ? 'reduce' : 'no-preference' });
  await ctx.addInitScript(clock);
  const page = await ctx.newPage(), errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().split('\n')[0]); });
  await page.goto(`${base}?unlock=all&${query}`);
  await page.waitForTimeout(300);
  return { ctx, page, errors };
}
// Ticks `step` frames at a time until `until(snapshot)` holds; returns the snapshot, or null after `max` frames.
async function tickUntil(page, until, max = 6000, step = 5) {
  for (let i = 0; i < max; i += step) {
    await page.evaluate((n) => window.__tick(n), step);
    const s = await page.evaluate(snap);
    if (until(s)) return s;
  }
  return null;
}

// 1. Replays play: each crash replays (slowing down and zooming in), then the live rider respawns.
{
  const { ctx, page, errors } = await open('delivery=1&autopilot=reckless&replay=on');
  const start = await tickUntil(page, (s) => s.replaying);
  check('a crash starts a replay', !!start, start);
  const atCrash = await tickUntil(page, (s) => !s.replaying || s.rstate === 'crashed', 600, 2);
  check('the replay reaches the crash, in slow motion and zoomed in', atCrash && atCrash.rstate === 'crashed' && atCrash.rate < 1 && atCrash.zoom > 1.1, atCrash);
  if (shots) await page.screenshot({ path: `${shots}/replay-crash.png` });
  const live = await tickUntil(page, (s) => !s.replaying && s.wstate === 'riding', 900, 2);
  check('after the replay, the rider respawns', !!live, live);
  let replays = 1, last = live;
  for (let i = 0; i < 40 && last && last.state !== 'review' && last.state !== 'delivered'; i++) {
    const s = await tickUntil(page, (x) => x.replaying || x.state === 'delivered' || x.state === 'review', 6000);
    if (!s) break;
    if (s.replaying) { replays++; last = await tickUntil(page, (x) => !x.replaying, 900); } else last = s;
  }
  const crashes = await page.evaluate(() => HILL.game.world ? HILL.game.world.score.crashes : -1);
  check('every crash got one replay, and the delivery still finishes', last && crashes === replays && /delivered|review/.test(last.state), { crashes, replays, state: last && last.state });
  check('no console errors (replays on)', !errors.length, [...new Set(errors)]);
  await ctx.close();
}

// 2. Skipping: the hop key ends the replay at once, and the ride carries on.
{
  const { ctx, page, errors } = await open('delivery=2&autopilot=reckless&replay=on');
  await tickUntil(page, (s) => s.replaying);
  await page.evaluate((n) => window.__tick(n), 30);
  if (shots) await page.screenshot({ path: `${shots}/replay-start.png` });
  await page.keyboard.press('Space');
  const after = await tickUntil(page, (s) => !s.replaying, 10, 1);
  check('SPACE skips the replay', !!after, after);
  const back = await tickUntil(page, (s) => s.wstate === 'riding', 60, 1);
  check('and the ride carries on', !!back, back);
  check('no console errors (skip)', !errors.length, [...new Set(errors)]);
  await ctx.close();
}

// 3. Off with reduced motion, and in autopilot demos without ?replay=on.
for (const [name, query, reduced] of [['reduced motion', 'delivery=1&autopilot=reckless&replay=on', true], ['autopilot demo', 'delivery=1&autopilot=reckless', false]]) {
  const { ctx, page, errors } = await open(query, { reduced });
  const crashed = await tickUntil(page, (s) => s.crashes > 0 || s.state === 'review');
  const later = await tickUntil(page, (s) => s.replaying || s.pending, 240, 4);
  check(`no replay with ${name}`, crashed && crashed.crashes > 0 && !later, { crashed, later });
  check(`no console errors (${name})`, !errors.length, [...new Set(errors)]);
  await ctx.close();
}

await browser.close();
console.log(failed ? `${failed} failed` : 'all passed');
process.exit(failed ? 1 : 0);
