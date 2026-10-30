// Playtest: pothole quip, forced crash + recovery, pause/mute/restart, delivery bell gag.
async (page) => {
  const BASE = 'http://127.0.0.1:8765/index.html?v=' + Date.now();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  const SHOT = (n) => `.playwright-mcp/shots/${n}.png`;
  const state = () => page.evaluate(() => {
    const g = HILL.game, w = g.world, b = w && w.bike;
    return { st: g.state, ws: w && w.state, x: b && b.x, gr: b && b.grounded, air: b && b.airTime, amt: w && w.cargo.amount,
      crashes: w && w.score.crashes, muted: g.audio.muted, t: w && w.t, bubble: g.fx.bubble && g.fx.bubble.line.text,
      caption: g.fx.caption && g.fx.caption.text, sub: g.fx.sub && g.fx.sub.text };
  });
  const out = [];
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto(BASE);
  await page.waitForTimeout(500);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(400);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(100);
  // 1) roll straight into the first pothole without hopping
  await page.keyboard.down('ArrowUp');
  let s, shotPothole = false;
  for (let i = 0; i < 400; i++) {
    s = await state();
    if (s.x > 42 && s.x < 52 && s.bubble && !shotPothole) { shotPothole = true; await page.screenshot({ path: SHOT('13-pothole-quip') }); out.push(`pothole quip: "${s.bubble}" latte=${s.amt.toFixed(1)}`); }
    if (s.x > 60) break;
    await page.waitForTimeout(25);
  }
  await page.keyboard.up('ArrowUp');
  // 2) jump to the Powell checkpoint area and hold lean-forward through the big air -> crash
  await page.evaluate(() => { const w = HILL.game.world; w.cpIndex = 4; w.respawn(); });
  const lip = await page.evaluate(() => HILL.game.world.course.lips.find((l) => l.big).x);
  await page.keyboard.down('ArrowUp');
  let hopped = false, leaning = false, crashShot = false, recoverShot = false, t0 = Date.now();
  while (Date.now() - t0 < 15000) {
    s = await state();
    if (!hopped && s.x > lip - 0.4) { hopped = true; await page.keyboard.down('Space'); setTimeout(() => page.keyboard.up('Space'), 200); }
    if (hopped && !leaning && !s.gr && s.air > 0.2) { leaning = true; await page.keyboard.up('ArrowUp'); await page.keyboard.down('ArrowRight'); }
    if (s.ws === 'crashed' && !crashShot) { await page.waitForTimeout(250); crashShot = true; await page.screenshot({ path: SHOT('14-crash') }); const c = await state(); out.push(`crash caption: "${c.caption}" latte=${c.amt.toFixed(1)} crashes=${c.crashes}`); await page.keyboard.up('ArrowRight'); }
    if (crashShot && s.ws === 'riding' && s.sub && !recoverShot) { recoverShot = true; await page.waitForTimeout(200); await page.screenshot({ path: SHOT('15-recover') }); out.push(`recovered: "${s.sub}" at x=${s.x.toFixed(1)}`); break; }
    await page.waitForTimeout(20);
  }
  await page.keyboard.up('ArrowRight'); await page.keyboard.up('ArrowUp');
  // 3) pause / mute / resume / restart
  await page.keyboard.press('p'); await page.waitForTimeout(150);
  s = await state(); out.push(`after P: ${s.st}`);
  await page.screenshot({ path: SHOT('16-paused') });
  const tPaused = s.t; await page.waitForTimeout(400); s = await state(); out.push(`sim frozen while paused: ${Math.abs(s.t - tPaused) < 1e-6}`);
  const m0 = s.muted; await page.keyboard.press('m'); await page.waitForTimeout(80); s = await state(); out.push(`M toggles mute: ${m0} -> ${s.muted}`);
  await page.keyboard.press('m'); await page.waitForTimeout(80);
  await page.keyboard.press('p'); await page.waitForTimeout(150); s = await state(); out.push(`after P again: ${s.st}`);
  await page.keyboard.press('r'); await page.waitForTimeout(150); s = await state(); out.push(`after R: ${s.st} x=${s.x.toFixed(1)} t=${s.t.toFixed(2)} crashes=${s.crashes}`);
  // 4) finish with the typical autopilot to catch the bell gag
  await page.evaluate(() => { HILL.game.autopilot = new HILL.Autopilot('typical'); });
  t0 = Date.now(); let bellShot = false;
  while (Date.now() - t0 < 60000) {
    s = await state();
    if (s.st === 'delivered' && s.bubble && !bellShot) { bellShot = true; await page.screenshot({ path: SHOT('17-bell-gag') }); out.push(`delivery bubble: "${s.bubble}"`); }
    if (s.st === 'review') break;
    await page.waitForTimeout(50);
  }
  out.push(`final state: ${s.st}`);
  out.push(`console errors: ${errors.length ? errors.join(' | ') : 'none'}`);
  return out;
}
