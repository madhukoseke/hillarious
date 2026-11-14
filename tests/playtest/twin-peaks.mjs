// Twin Peaks check (F-43): the Dispatch board lists THE DISCO BALL after the bouquet, the intro introduces the host,
// and a typical rider goes from the summit to the Castro: windsock, fog, the switchback, the airy music turning disco
// at Castro Street, and the receipt. Screenshots of each stretch go to shots-dir. Fails on any console or page error.
// Runs on a controlled clock, so it takes seconds.
//
// Playwright is loaded from the folder you run this in, as with cross-browser.mjs:
//   cd /tmp/hill-pw && node /path/to/hillarious/tests/playtest/twin-peaks.mjs [file-or-url-of-index.html] [shots-dir]
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
const shot = async (name) => { if (shots) await page.screenshot({ path: `${shots}/twin-peaks-${name}.png` }); };

await page.goto(`${base}?unlock=all&autopilot=typical`);
await page.waitForTimeout(300);
await page.evaluate(() => { HILL.game.action('board'); window.__tick(2); });
const card = await page.evaluate(() => [...document.querySelectorAll('#board-orders .order')].map((o) => o.querySelector('.order-top b')?.textContent || '').join(' | '));
check('the Dispatch board lists THE DISCO BALL', /THE DISCO BALL/.test(card), card);
await shot('board');

// The intro: the host and the order.
await page.evaluate(() => { const g = HILL.game, mus = []; window.__music = mus; const set = g.audio.setMusic.bind(g.audio); g.audio.setMusic = (m) => { mus.push(m); return set(m); }; g.startRun({ mode: 'single', route: 'twinPeaks' }); window.__tick(2); });
await page.evaluate(() => window.__tick(30)); // let the board fade out
const intro = await page.evaluate(() => ({ state: HILL.game.state, name: document.getElementById('intro-name').textContent, title: document.getElementById('intro-h').textContent }));
check('the intro introduces Anita Refill and the order', intro.name === 'Anita Refill' && /DISCO BALL/.test(intro.title), intro);
await shot('intro');

// Ride, taking a screenshot at each stretch.
const marks = await page.evaluate(() => { const C = HILL.game.courseFor('twinPeaks'); return { gust: C.gusts[0].x0 + 6, fog: C.fogs[1].x0 + 14, turn: C.switchbacks[0] + 6, castro: C.musicDrop + 10 }; });
const stops = Object.entries(marks).sort((a, b) => a[1] - b[1]);
let state = null;
for (let i = 0; i < 6000; i++) {
  await page.evaluate(() => window.__tick(3));
  const s = await page.evaluate(() => ({ state: HILL.game.state, x: HILL.game.world ? HILL.game.world.bike.x : 0 }));
  state = s.state;
  if (stops.length && s.state === 'riding' && s.x >= stops[0][1]) { await shot(stops.shift()[0]); }
  if (s.state === 'review') break;
}
check('the typical rider reaches the receipt', state === 'review');
check('every stretch was ridden and photographed', stops.length === 0, stops.map((s) => s[0]));
const music = await page.evaluate(() => window.__music || []);
check('the music starts airy and turns disco at Castro Street', music.includes('airy') && music.indexOf('disco') > music.indexOf('airy'), music);
const rv = await page.evaluate(() => document.body.innerText.slice(0, 6000));
check('the receipt counts the disco ball\'s tiles', /tiles/.test(rv));
await shot('receipt');
check('no console or page errors', !errors.length, [...new Set(errors)]);
await browser.close();
console.log(failed ? `${failed} failed` : 'all passed');
process.exit(failed ? 1 : 0);
