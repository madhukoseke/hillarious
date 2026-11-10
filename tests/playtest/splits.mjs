// Split-time check (F-35): splits pop up at each checkpoint and the finish, the receipt lists them, the fastest complete
// run is saved, and the next run races it. Daily practice races the day's scored ride. Fails on any console or page
// error. Runs on a controlled clock (manual animation frames, fake time), so it finishes in seconds.
//
// Playwright is loaded from the folder you run this in, as with cross-browser.mjs:
//   cd /tmp/hill-pw && node /path/to/hillarious/tests/playtest/splits.mjs [file-or-url-of-index.html] [shots-dir]
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

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
await ctx.addInitScript(clock);
const page = await ctx.newPage(), errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().split('\n')[0]); });
let failed = 0;
const check = (name, ok, info) => { if (!ok) failed++; console.log((ok ? 'ok   ' : 'FAIL ') + name + (info !== undefined ? ' ' + JSON.stringify(info) : '')); };

// Rides one run to its receipt, collecting every pop that names a split. Returns the pops and the receipt's split line.
async function ride(start) {
  await page.evaluate(() => { window.__pops = []; const g = HILL.game; if (g.__splitSpy) return; g.__splitSpy = true; const pop = g.pop.bind(g); g.pop = (t, k, l) => { if (/^(SPLIT|FINISH)/.test(t)) window.__pops.push(t + ' [' + k + ']'); return pop(t, k, l); }; }); // wrap once
  await page.evaluate(start);
  for (let i = 0; i < 400; i++) { await page.evaluate(() => window.__tick(30)); if (await page.evaluate(() => HILL.game.state === 'review')) break; }
  return page.evaluate(() => ({ state: HILL.game.state, pops: window.__pops, line: [...document.querySelectorAll('#rv-splits > *')].map((e) => e.textContent + (e.className ? '(' + e.className + ')' : '')).join(' ') }));
}
const saved = (key) => page.evaluate((k) => JSON.parse(localStorage.getItem('hillarious:' + k)), key);

await page.goto(`${base}?unlock=all&autopilot=typical&daily=2026-11-20`);
await page.evaluate(() => localStorage.clear());
await page.goto(`${base}?unlock=all&autopilot=typical&daily=2026-11-20`);
await page.waitForTimeout(300);
const n = await page.evaluate(() => HILL.game.courseFor('nobHill').checkpoints.length);

// 1. First run on Nob Hill: plain splits, then saved.
const one = await ride(() => HILL.game.startRun({ mode: 'single', route: 'nobHill' }));
check('every checkpoint and the finish pops a split, with no comparison yet', one.pops.length === n && one.pops.every((p) => /\[info\]$/.test(p)) && /^FINISH/.test(one.pops.at(-1)), one.pops);
check('the receipt lists the splits', /^SPLITS/.test(one.line) && (one.line.match(/\d:\d\d\.\d/g) || []).length === n, one.line);
const best = await saved('splits:nobHill');
check('the run is saved as the best', best && best.splits.length === n, best);

// 2. Second run: races the saved one (the autopilot repeats itself exactly, so every split ties).
const two = await ride(() => HILL.game.startRun({ mode: 'single', route: 'nobHill' }));
check('the next run shows ahead/behind at every split', two.pops.length === n && two.pops.every((p) => /±0\.0 \[good\]$/.test(p)), two.pops);
check('the receipt compares against the best', /^VS BEST/.test(two.line) && /ahead/.test(two.line), two.line);
if (shots) await page.screenshot({ path: `${shots}/splits-receipt.png` });

// 3. A Free Ride from a later checkpoint has no splits.
const free = await ride(() => HILL.game.startRun({ mode: 'free', route: 'nobHill', cp: 2, traffic: true }));
check('a ride from a later checkpoint shows no splits', free.pops.length === 0 && free.line === '', free);

// 4. Daily: the scored ride saves its splits; practice races them.
await ride(() => HILL.game.startDailyRun(false));
const day = await saved('splits:daily');
check('the scored daily ride saves its splits for the day', day && day.date === '2026-11-20' && day.splits.length > 1, day);
const prac = await ride(() => HILL.game.startDailyRun(true));
check('daily practice races the scored ride', /^VS SCORED RIDE/.test(prac.line) && prac.pops.length > 0 && prac.pops.every((p) => /\[good\]$/.test(p)), prac);

check('no console or page errors', !errors.length, [...new Set(errors)]);
await browser.close();
console.log(failed ? `${failed} failed` : 'all passed');
process.exit(failed ? 1 : 0);
