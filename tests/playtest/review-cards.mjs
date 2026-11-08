// Review-card check: every delivery, ridden by a crashing rider and a typical one, must reach its review card with no
// console or page errors. This covers code the headless tests cannot reach (the review screen, the "Most trouble" line).
// The page runs on a controlled clock (manual animation frames, fake time), so it finishes in seconds.
//
// Playwright is loaded from the folder you run this in, as with cross-browser.mjs:
//   cd /tmp/hill-pw && node /path/to/hillarious/tests/playtest/review-cards.mjs [file-or-url-of-index.html]
import { createRequire } from 'node:module';
import path from 'node:path';

const { chromium } = createRequire(process.cwd() + '/')('playwright');
const arg = process.argv[2] || new URL('../../index.html', import.meta.url).pathname;
const base = /^https?:/.test(arg) ? arg : 'file://' + path.resolve(arg);
const clock = () => {
  let now = 0; const q = [];
  window.requestAnimationFrame = (f) => { q.push(f); return q.length; };
  performance.now = () => now;
  window.__tick = (n) => { for (let i = 0; i < n; i++) { now += 1000 / 60; for (const f of q.splice(0)) f(now); } };
};

const browser = await chromium.launch();
let failed = 0;
for (const delivery of [1, 2, 3]) for (const rider of ['reckless', 'typical']) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  await ctx.addInitScript(clock);
  const page = await ctx.newPage(), errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().split('\n')[0]); });
  await page.goto(`${base}?unlock=all&delivery=${delivery}&autopilot=${rider}`);
  await page.waitForTimeout(400);
  let state = '';
  for (let i = 0; i < 300 && state !== 'review'; i++) {
    await page.evaluate(() => window.__tick(30));
    state = await page.evaluate(() => HILL.game.state);
    if (i % 25 === 0) await page.waitForTimeout(20); // let the game's real timers run
  }
  const card = await page.evaluate(() => ({ condition: document.getElementById('rv-cond').textContent, trouble: document.getElementById('rv-trouble-text').textContent }));
  const ok = state === 'review' && !errors.length;
  if (!ok) failed++;
  console.log(JSON.stringify({ delivery, rider, ok, state, ...card, errors: [...new Set(errors)] }));
  await ctx.close();
}
await browser.close();
if (failed) process.exitCode = 1;
