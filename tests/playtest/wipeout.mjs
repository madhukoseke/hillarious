// Wipeout clip check (F-37): after a crash, the receipt offers SAVE WIPEOUT CLIP; it replays the worst crash on screen,
// records it, and downloads a video. SPACE cancels without a file. A ride with no crash offers nothing. Fails on any
// console or page error. Recording needs real time, so the crash ride runs on the real clock (sped up while riding);
// the clean ride uses a controlled clock.
//
// Playwright is loaded from the folder you run this in, as with cross-browser.mjs:
//   cd /tmp/hill-pw && node /path/to/hillarious/tests/playtest/wipeout.mjs [file-or-url-of-index.html] [shots-dir]
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';

const { chromium } = createRequire(process.cwd() + '/')('playwright');
const arg = process.argv[2] || new URL('../../index.html', import.meta.url).pathname;
const shots = process.argv[3] || null;
const base = /^https?:/.test(arg) ? arg : 'file://' + path.resolve(arg);

const browser = await chromium.launch();
let failed = 0;
const check = (name, ok, info) => { if (!ok) failed++; console.log((ok ? 'ok   ' : 'FAIL ') + name + (info !== undefined ? ' ' + JSON.stringify(info) : '')); };

// Rides delivery 1 with an autopilot, at 4× while riding, and holds the receipt open.
async function rideToReceipt(rider) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, acceptDownloads: true });
  const page = await ctx.newPage(), errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().split('\n')[0]); });
  await page.goto(`${base}?unlock=all&autopilot=${rider}&replay=off`);
  await page.waitForFunction(() => window.HILL && HILL.game && HILL.game.state === 'title');
  await page.evaluate(() => {
    HILL.game.action('start');
    const t = setInterval(() => { const g = HILL.game; if (g.state === 'riding') g.practiceScale = 4; if (g.state === 'review') { g.reviewT = null; clearInterval(t); } }, 50);
  });
  try { await page.waitForFunction(() => HILL.game.state === 'review' && HILL.game.reviewT === null, null, { timeout: 240000, polling: 100 }); }
  catch (e) { throw new Error(rider + ' never reached the receipt: ' + JSON.stringify(await page.evaluate(() => { const g = HILL.game, W = g.world; return { state: g.state, mode: g.mode, scale: g.practiceScale, x: W && W.bike.x, t: W && W.t, wstate: W && W.state }; }))); }
  return { ctx, page, errors };
}
const visible = (page) => page.evaluate(() => !document.getElementById('rv-clip').hidden);

// 1. A crash: save the clip.
{
  const { ctx, page, errors } = await rideToReceipt('reckless');
  const crashes = await page.evaluate(() => HILL.game.world.score.crashes);
  check('after a crash, the receipt offers SAVE WIPEOUT CLIP', crashes > 0 && await visible(page), { crashes });
  const fmt = await page.evaluate(() => HILL.game.clipFormat());
  const dl = page.waitForEvent('download', { timeout: 30000 });
  await page.click('#rv-clip-btn');
  await page.waitForTimeout(1500);
  const during = await page.evaluate(() => ({ state: HILL.game.state, replaying: HILL.game.replaying, rec: !!HILL.game.clipRec }));
  check('it replays the crash on screen while recording', during.state === 'clip' && during.replaying && during.rec, during);
  if (shots) await page.screenshot({ path: `${shots}/wipeout-recording.png` });
  const download = await dl;
  const file = await download.path(), size = file ? fs.statSync(file).size : 0;
  const clip = await page.evaluate(() => HILL.game.lastClip);
  check('it downloads a video of the crash', /^hillarious-wipeout-nobHill\.(webm|mp4)$/.test(download.suggestedFilename()) && size > 20000 && clip.type.startsWith('video/'), { name: download.suggestedFilename(), size, fmt, clip });
  const after = await page.evaluate(() => ({ state: HILL.game.state, status: document.getElementById('rv-clip-status').textContent }));
  check('then the receipt comes back', after.state === 'review' && /Saved hillarious-wipeout/.test(after.status), after);

  // 2. Cancel: SPACE stops it, and nothing is saved.
  let downloads = 0; page.on('download', () => downloads++);
  await page.click('#rv-clip-btn');
  await page.waitForTimeout(800);
  await page.keyboard.press('Space');
  await page.waitForTimeout(1500);
  const cancel = await page.evaluate(() => ({ state: HILL.game.state, status: document.getElementById('rv-clip-status').textContent }));
  check('SPACE cancels the clip without a file', cancel.state === 'review' && cancel.status === 'Clip cancelled.' && downloads === 0, { ...cancel, downloads });
  check('no console errors (crash ride)', !errors.length, [...new Set(errors)]);
  await ctx.close();
}

// 3. No crash, no clip. Nothing is recorded here, so this ride uses a controlled clock and finishes in seconds.
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  await ctx.addInitScript(() => {
    let now = 0; const q = [];
    window.requestAnimationFrame = (f) => { q.push(f); return q.length; };
    performance.now = () => now;
    window.__tick = (n) => { for (let i = 0; i < n; i++) { now += 1000 / 60; for (const f of q.splice(0)) f(now); } };
  });
  const page = await ctx.newPage(), errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().split('\n')[0]); });
  await page.goto(`${base}?unlock=all&autopilot=careful`);
  await page.waitForTimeout(300);
  await page.evaluate(() => HILL.game.startRun({ mode: 'single', route: 'nobHill' }));
  for (let i = 0; i < 400; i++) { await page.evaluate(() => window.__tick(30)); if (await page.evaluate(() => HILL.game.state === 'review')) break; }
  const crashes = await page.evaluate(() => HILL.game.world.score.crashes);
  check('a clean ride offers no clip', (await page.evaluate(() => HILL.game.state)) === 'review' && crashes === 0 && !(await visible(page)), { crashes });
  check('no console errors (clean ride)', !errors.length, [...new Set(errors)]);
  await ctx.close();
}

await browser.close();
console.log(failed ? `${failed} failed` : 'all passed');
process.exit(failed ? 1 : 0);
