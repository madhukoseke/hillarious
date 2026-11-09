// Daily Dispatch check (F-34): the Dispatch board's Daily card, one scored ride a day, practice that saves nothing,
// a restart that turns the scored ride into practice, the streak, and the lock for new players. Fails on any console
// or page error. Runs on a controlled clock (manual animation frames, fake time), so it finishes in seconds.
//
// Playwright is loaded from the folder you run this in, as with cross-browser.mjs:
//   cd /tmp/hill-pw && node /path/to/hillarious/tests/playtest/daily.mjs [file-or-url-of-index.html] [shots-dir]
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
const state = () => page.evaluate(() => HILL.game.state);
const saved = () => page.evaluate(() => ({ daily: JSON.parse(localStorage.getItem('hillarious:daily')), streak: JSON.parse(localStorage.getItem('hillarious:streak')) }));
const card = () => page.evaluate(() => { const c = document.querySelector('#board-orders .order.daily'); return c && { state: c.dataset.state, title: c.querySelector('.order-top b').textContent, streak: c.querySelector('.order-streak').textContent, line: c.querySelector('.order-best').textContent, button: c.querySelector('.order-side .btn').textContent }; });
async function tickUntil(test, max = 9000) {
  for (let i = 0; i < max; i += 30) { await page.evaluate(() => window.__tick(30)); if (await page.evaluate(test)) return true; }
  return false;
}
async function open(query) {
  await page.goto(`${base}?${query}`);
  await page.waitForTimeout(300);
  await page.evaluate(() => window.__tick(2));
}
async function board() { await page.evaluate(() => HILL.game.action('board')); await page.evaluate(() => window.__tick(2)); }

// 1. Locked for a new player.
await open('daily=2026-11-20');
await page.evaluate(() => localStorage.clear());
await open('daily=2026-11-20');
await board();
const locked = await card();
check('a new player sees the Daily card locked', locked && locked.state === 'locked' && /unlock/.test(locked.line), locked);

// 2. The scored ride.
await open('daily=2026-11-20&unlock=all&autopilot=typical');
await board();
const fresh = await card();
check('today\'s card is open, first on the board, and numbered', fresh && fresh.state === 'new' && fresh.title === 'HILLARIOUS #12' && fresh.button === 'RIDE', fresh);
if (shots) await page.screenshot({ path: `${shots}/daily-board.png` });
await page.click('#board-orders .order.daily [data-act="daily"]');
const eyebrow = await page.evaluate(() => document.getElementById('intro-eyebrow').textContent);
check('the intro says it is the scored daily ride', /DAILY DISPATCH .* ONE SCORED RIDE/.test(eyebrow), eyebrow);
await tickUntil(() => HILL.game.state === 'riding');
const used = await saved();
check('starting the ride uses the day\'s attempt and starts the streak', used.daily && used.daily.date === '2026-11-20' && used.daily.result === null && used.streak.count === 1, used);
check('the ride is today\'s generated route', await page.evaluate(() => HILL.game.world.course.id === 'daily' && HILL.game.world.course.title === 'HILLARIOUS #12'));
const reviewed = await tickUntil(() => HILL.game.state === 'review');
const receipt = await page.evaluate(() => ({ order: document.getElementById('rv-order').textContent, best: document.getElementById('rv-best').textContent, again: document.getElementById('rv-again').textContent }));
check('the receipt is scored and logged', reviewed && /SCORED/.test(receipt.order) && /HILLARIOUS #12 logged\. Streak: 1 day/.test(receipt.best) && receipt.again === 'PRACTICE', receipt);
if (shots) await page.screenshot({ path: `${shots}/daily-receipt.png` });
const logged = await saved();
check('the result is saved', logged.daily.result && logged.daily.result.tip >= 0 && logged.daily.result.stars >= 1, logged.daily);

// 3. Back on the board: done for today, practice only.
await page.evaluate(() => HILL.game.action('board'));
const done = await card();
check('the card shows today\'s result and offers practice', done.state === 'delivered' && done.button === 'PRACTICE' && /Today's ride: \$/.test(done.line) && /1 day/.test(done.streak), done);
if (shots) await page.screenshot({ path: `${shots}/daily-done.png` });

// 4. Practice saves nothing.
await page.click('#board-orders .order.daily [data-act="daily-practice"]');
check('practice starts at once, as a free ride on today\'s route', (await state()) === 'riding' && await page.evaluate(() => HILL.game.mode === 'free' && HILL.game.world.course.id === 'daily'));
await tickUntil(() => HILL.game.state === 'review');
const prac = await page.evaluate(() => ({ order: document.getElementById('rv-order').textContent, best: document.getElementById('rv-best').textContent }));
check('the practice receipt saves nothing', /PRACTICE · NOTHING SAVED/.test(prac.order) && /nothing saved/.test(prac.best), prac);
check('the scored result is unchanged', JSON.stringify((await saved()).daily) === JSON.stringify(logged.daily));

// 5. The next day: the streak grows, and a restart turns the scored ride into practice.
await open('daily=2026-11-21&unlock=all&autopilot=typical');
await board();
await page.click('#board-orders .order.daily [data-act="daily"]');
await tickUntil(() => HILL.game.state === 'riding');
await page.evaluate(() => window.__tick(120));
await page.evaluate(() => HILL.game.restartDelivery());
const after = await saved();
check('the next day continues the streak', after.streak.count === 2 && after.streak.best === 2 && after.daily.date === '2026-11-21', after);
check('a restart is practice, and the attempt stays used', await page.evaluate(() => HILL.game.mode === 'free') && after.daily.result === null);
await tickUntil(() => HILL.game.state === 'review');
check('finishing the restarted ride does not log a score', (await saved()).daily.result === null);
await board();
const dnf = await card();
check('the card says today\'s ride did not finish', /didn't finish/.test(dnf.line) && dnf.button === 'PRACTICE', dnf);

check('no console or page errors', !errors.length, [...new Set(errors)]);
await browser.close();
console.log(failed ? `${failed} failed` : 'all passed');
process.exit(failed ? 1 : 0);
