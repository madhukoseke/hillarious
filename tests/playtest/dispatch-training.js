// Playwright MCP script: Dispatch & Training from a fresh profile. The autopilot rides at 4x speed (practiceScale).
// Checks the locks, the unlock stamp, drill unlocking, that practice saves no records, and that The Test Hill laps.
async (page) => {
  const BASE = 'http://127.0.0.1:8765/index.html?v=' + Date.now(), SHOT = (n) => `.playwright-mcp/shots/dt-${n}.png`, out = {}, errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  const state = (s, timeout = 90000) => page.waitForFunction((st) => HILL.game.state === st, s, { timeout });
  const ride = async () => { await state('riding'); await page.evaluate(() => { HILL.game.practiceScale = 4; }); await state('review'); await page.evaluate(() => { HILL.game.reviewT = null; }); await page.waitForTimeout(900); };
  const records = () => page.evaluate(() => JSON.stringify(Object.keys(localStorage).sort().filter((k) => /^hillarious:(best:|shifts|progress)/.test(k)).map((k) => [k, localStorage.getItem(k)])));
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto(BASE); await page.evaluate(() => localStorage.clear()); await page.reload(); await state('title');

  await page.click('#s-title [data-act=board]'); await state('board'); await page.waitForTimeout(400);
  await page.screenshot({ path: SHOT('board-fresh') });
  out.freshBoard = await page.evaluate(() => [...document.querySelectorAll('#board-orders .order')].map((o) => o.dataset.state || 'soon').join(' ')); // new locked soon

  await page.evaluate(() => { HILL.game.autopilotName = 'typical'; });
  await page.click('[data-act=ride][data-route=nobHill]'); await ride();
  await page.screenshot({ path: SHOT('single-receipt') });
  out.unlock = await page.evaluate(() => document.getElementById('rv-unlock').textContent);
  out.singleSavedNoShift = await page.evaluate(() => !!localStorage.getItem('hillarious:best:nobHill') && !localStorage.getItem('hillarious:shifts'));
  await page.click('#rv-next'); await state('board');
  out.boardAfter = await page.evaluate(() => [...document.querySelectorAll('#board-orders .order')].map((o) => o.dataset.state || 'soon').join(' ')); // delivered new soon

  await page.click('#s-board [data-act=back]'); await page.click('#s-title [data-act=train]'); await state('train');
  await page.click('[data-act=drill][data-drill=drillBrake]'); await ride();
  await page.screenshot({ path: SHOT('drill-receipt') });
  out.drillUnlock = await page.evaluate(() => document.getElementById('rv-unlock').textContent); // NEXT DRILL UNLOCKED: HOP SCHOOL

  const before = await records();
  await page.click('#rv-alt'); await state('train'); await page.click('[data-act=free-setup]'); await state('free');
  for (const sel of ['[data-key=route][data-val=nobHill]', '[data-key=cp][data-val="4"]', '[data-key=traffic]', '[data-key=overlay]']) await page.click('#free-opts ' + sel);
  await page.screenshot({ path: SHOT('free-setup') });
  await page.click('[data-act=free-go]'); await state('riding'); await page.waitForTimeout(1500);
  await page.screenshot({ path: SHOT('free-overlay') });
  await ride();
  out.freeSavedNothing = (await records()) === before;

  await page.click('#rv-again'); await state('free'); await page.click('#free-opts [data-key=route][data-val=testHill]');
  await page.click('[data-act=free-go]'); await state('riding'); await page.evaluate(() => { HILL.game.practiceScale = 4; });
  await page.waitForFunction(() => HILL.game.world.laps >= 1, null, { timeout: 60000 });
  await page.screenshot({ path: SHOT('test-hill-lap') });
  out.testHillLaps = await page.evaluate(() => HILL.game.world.laps);
  out.errors = errors;
  return out;
}
