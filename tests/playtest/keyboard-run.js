// Keyboard-driven playtest for Playwright (browser_run_code_unsafe filename=...).
// Drives real key events from the bike's position like a player of STYLE; screenshots at each obstacle.
async (page) => {
  const STYLE = 'typical'; // careful | typical | reckless
  const P = {
    careful: { cruise: 9, nearCar: 7.5, hopPotholes: true, hopBig: false, brakeMs: 220, slam: false },
    typical: { cruise: 13.5, nearCar: 10, hopPotholes: true, hopBig: true, brakeMs: 260, slam: false },
    reckless: { cruise: 99, nearCar: 99, hopPotholes: false, hopBig: true, brakeMs: 0, slam: true, airLean: true },
  }[STYLE];
  const BASE = 'http://127.0.0.1:8765/index.html';
  const SHOT = (n) => `.playwright-mcp/shots/${STYLE === 'typical' ? '' : STYLE + '-'}${n}.png`;
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto(BASE);
  await page.waitForTimeout(600);
  await page.keyboard.press('Enter');              // START RIDING (focused button)
  await page.waitForTimeout(500);
  await page.screenshot({ path: SHOT('02-intro') });
  await page.keyboard.press('Space');              // START DELIVERY
  await page.waitForTimeout(150);
  const C = await page.evaluate(() => {
    const c = HILL.game.world.course;
    return { potholes: c.potholes.map((p) => p.x0), lips: c.lips, car: c.cars[0].x, door: c.doorX };
  });
  const keys = { ArrowUp: false, ArrowDown: false, Space: false, ArrowRight: false };
  const set = async (k, on) => { if (keys[k] !== on) { keys[k] = on; on ? await page.keyboard.down(k) : await page.keyboard.up(k); } };
  const shots = new Set(), log = [], fps = [];
  let brakeUntil = 0, jumpUntil = 0, lastJumpX = -99, nextSlam = Date.now() + 4000, leanUntil = 0, leaned = false;
  const t0 = Date.now();
  while (Date.now() - t0 < 80000) {
    const s = await page.evaluate(() => {
      const g = HILL.game, w = g.world, b = w.bike;
      return { st: g.state, ws: w.state, x: b.x, v: Math.hypot(b.vx, b.vy), gr: b.grounded, air: b.airTime, amt: w.cargo.amount, t: w.score.time, fps: g.fps, crashes: w.score.crashes };
    });
    const now = Date.now();
    if (s.st === 'review') { log.push(`review at ${((now - t0) / 1000).toFixed(1)}s`); break; }
    fps.push(s.fps);
    const shoot = async (name, cond) => { if (cond && !shots.has(name)) { shots.add(name); await page.screenshot({ path: SHOT(name) }); log.push(`${name}: x=${s.x.toFixed(1)} v=${s.v.toFixed(1)} latte=${s.amt.toFixed(1)} t=${s.t.toFixed(1)}`); } };
    if (s.ws === 'riding') {
      // speed control (keyboard taps, like a person)
      const nearCar = C.car - s.x < 28 && C.car - s.x > -3;
      const target = nearCar ? P.nearCar : P.cruise;
      if (P.brakeMs && s.v > target + 1.5 && s.gr && now > brakeUntil + 150) brakeUntil = now + P.brakeMs;
      if (P.slam && now > nextSlam && s.v > 12 && s.gr) { brakeUntil = now + 700; nextSlam = now + 6000; }
      await set('ArrowDown', now < brakeUntil);
      await set('ArrowUp', now >= brakeUntil && s.v < target - 1);
      // hops: potholes and the big lip
      if (P.hopPotholes) for (const px of C.potholes) { const d = px - (s.x + 0.6); if (d > 0 && d < s.v * 0.07 + 0.3 && s.gr && s.x - lastJumpX > 3) { jumpUntil = now + 110; lastJumpX = s.x; } }
      const big = C.lips.find((l) => l.big);
      if (big && P.hopBig) { const d = big.x - s.x; if (d > -0.3 && d < s.v * 0.04 + 0.2 && s.gr && s.x - lastJumpX > 3) { jumpUntil = now + 220; lastJumpX = s.x; } }
      await set('Space', now < jumpUntil);
      if (P.airLean && !leaned && !s.gr && s.air > 0.4) { leaned = true; leanUntil = now + 250; }
      await set('ArrowRight', now < leanUntil);
    } else { await set('ArrowUp', false); await set('ArrowDown', false); await set('Space', false); }
    await shoot('03-pothole-approach', s.x > C.potholes[0] - 9);
    await shoot('04-pothole-hop', !s.gr && s.x > C.potholes[0] - 2 && s.x < C.potholes[0] + 6);
    await shoot('05-car-ahead', s.x > C.car - 18);
    await shoot('06-plank', s.x > C.car - 1.5);
    await shoot('07-over-car', s.x > C.car + 2.2);
    await shoot('08-big-air', !s.gr && s.air > 0.45 && s.x > 195);
    await shoot('09-landing', s.gr && s.x > 214 && s.x < 240);
    await shoot('10-home-stretch', s.x > C.door - 70);
    await shoot('11-delivered', s.st === 'delivered');
    await page.waitForTimeout(25);
  }
  for (const k of Object.keys(keys)) await set(k, false);
  await page.waitForTimeout(400);
  await page.screenshot({ path: SHOT('12-review') });
  const result = await page.evaluate(() => window.__HILL_LAST_RESULT__ || null);
  const minFps = Math.min(...fps.slice(20)), avgFps = fps.slice(20).reduce((a, b) => a + b, 0) / Math.max(1, fps.length - 20);
  return { style: STYLE, log, result, avgFps: +avgFps.toFixed(1), minFps: +minFps.toFixed(1) };
}
