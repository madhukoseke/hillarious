// Cross-browser check: the player flow and a full autopilot shift on Chromium, Firefox, and WebKit,
// at desktop size and as a landscape touch phone. Prints one JSON result per browser and size.
//
// Playwright is loaded from the folder you run this in, so the repo needs no node_modules:
//   mkdir -p /tmp/hill-pw && cd /tmp/hill-pw && npm i playwright@1.56.1 && npx playwright install chromium firefox webkit
//   (serve the game: python3 -m http.server 8765, from the repo root)
//   node /path/to/hillarious/tests/playtest/cross-browser.mjs [url] [screenshot-dir]
import { createRequire } from 'node:module';

const { chromium, firefox, webkit } = createRequire(process.cwd() + '/')('playwright');
const URL = process.argv[2] || 'http://127.0.0.1:8765/index.html';
const SHOTS = process.argv[3] || '.';
const engines = { chromium, firefox, webkit };
const sizes = {
  desktop: { viewport: { width: 1280, height: 720 } },
  phone: { viewport: { width: 844, height: 390 }, hasTouch: true },
};

async function run(name, engine, sizeName, size) {
  const r = { browser: name, size: sizeName, errors: [] };
  const browser = await engine.launch();
  try {
    const ctx = await browser.newContext({ ...size, ...(sizeName === 'phone' && name !== 'firefox' ? { isMobile: true } : {}) });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => r.errors.push('pageerror: ' + e.message));
    page.on('console', (m) => { if (m.type() === 'error') r.errors.push('console: ' + m.text()); });
    const touch = !!size.hasTouch;

    // Player flow: start, the intro waits, then ride.
    await page.goto(URL);
    await page.waitForFunction(() => window.HILL && HILL.game && HILL.game.state === 'title');
    if (touch) await page.tap('#s-title [data-act="start"]'); else { await page.waitForTimeout(100); await page.keyboard.press('Enter'); }
    await page.waitForTimeout(2000);
    r.introWaits = await page.evaluate(() => HILL.game.state === 'intro');
    if (touch) await page.tap('#s-intro [data-act="go"]'); else await page.keyboard.press('Enter');
    await page.waitForTimeout(800);
    r.riding = await page.evaluate(() => HILL.game.state === 'riding');
    r.device = await page.evaluate(() => HILL.game.input.device);
    await page.screenshot({ path: `${SHOTS}/${name}-${sizeName}-ride.png` });

    // Dispatch shows the locks (fresh profile), Training lists the drills, and a Free Ride starts.
    const press = (sel) => (touch ? page.tap(sel) : page.click(sel));
    await page.goto(URL);
    await page.waitForFunction(() => window.HILL && HILL.game && HILL.game.state === 'title');
    await press('#s-title [data-act="board"]');
    await page.waitForFunction(() => HILL.game.state === 'board');
    r.board = await page.evaluate(() => [...document.querySelectorAll('#board-orders .order')].map((o) => o.dataset.state || 'soon').join(' '));
    await page.screenshot({ path: `${SHOTS}/${name}-${sizeName}-board.png` });
    await press('#s-board [data-act="back"]');
    await press('#s-title [data-act="train"]');
    await page.waitForFunction(() => HILL.game.state === 'train');
    r.drills = await page.evaluate(() => [...document.querySelectorAll('#train-drills .drill')].map((d) => d.dataset.state).join(' '));
    await press('#s-train [data-act="free-setup"]');
    await page.waitForFunction(() => HILL.game.state === 'free');
    await page.screenshot({ path: `${SHOTS}/${name}-${sizeName}-free.png` });
    await press('#s-free [data-act="free-go"]');
    await page.waitForTimeout(1500);
    r.freeRide = await page.evaluate(() => HILL.game.state === 'riding' && HILL.game.mode === 'free');

    // Full autopilot shift to the final review.
    const t0 = Date.now();
    await page.goto(URL + '?autopilot=typical');
    await page.waitForFunction(() => window.HILL && HILL.game && HILL.game.state === 'final', null, { timeout: 240000, polling: 500 });
    r.shiftSeconds = Math.round((Date.now() - t0) / 1000);
    Object.assign(r, await page.evaluate(() => ({
      tips: HILL.game.results.filter(Boolean).map((x) => x.tip),
      formShown: !document.getElementById('hs-form').hidden,
      shareReady: document.getElementById('share-x').href.startsWith('https://x.com/intent/post'),
    })));
    await page.screenshot({ path: `${SHOTS}/${name}-${sizeName}-final.png` });
  } catch (e) {
    r.errors.push('run: ' + e.message.split('\n')[0]);
  } finally {
    await browser.close();
  }
  return r;
}

const jobs = [];
for (const [name, engine] of Object.entries(engines)) for (const [sizeName, size] of Object.entries(sizes)) jobs.push(run(name, engine, sizeName, size));
console.log(JSON.stringify(await Promise.all(jobs), null, 1));
