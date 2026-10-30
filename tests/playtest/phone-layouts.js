// Playwright MCP script: screenshots of every overlay on a phone in landscape, and the title in portrait.
async (page) => {
  const BASE = 'http://127.0.0.1:8765/index.html?v=' + Date.now(), SHOT = (n) => `.playwright-mcp/shots/p3-${n}.png`, out = {}, errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const fits = (sel) => page.evaluate((sel) => { const c = document.querySelector(sel); return c.scrollHeight <= c.clientHeight + 2; }, sel);
  await page.setViewportSize({ width: 844, height: 390 });
  await page.goto(BASE); await page.waitForTimeout(400);
  await page.click('[data-act=start]'); await page.waitForTimeout(700);
  await page.screenshot({ path: SHOT('phone-intro') }); out.intro = await fits('#s-intro .card');
  await page.click('[data-act=go]'); await page.waitForTimeout(300);
  await page.evaluate(() => { const g = HILL.game, W = g.world; W.bike.x = W.course.doorX - 0.5; W.state = 'done'; g.state = 'delivered'; g.showReview(); });
  await page.waitForTimeout(900);
  await page.screenshot({ path: SHOT('phone-receipt') }); out.receipt = await fits('#s-review .receipt');
  await page.evaluate(() => { const g = HILL.game; g.results = [{ kind: 'coffee', condition: 92, tip: 5.6, time: 39.5, par: 46, crashes: 0, nearMisses: 1, cleanLandings: 2 }, { kind: 'cake', condition: 88, tip: 6.1, time: 41, par: 48, crashes: 1, nearMisses: 2, cleanLandings: 1 }]; g.showFinal(); });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: SHOT('phone-final') }); out.final = await fits('#s-final .card');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(BASE); await page.waitForTimeout(1600);
  await page.screenshot({ path: SHOT('portrait-title') });
  out.errors = errors;
  return out;
}
