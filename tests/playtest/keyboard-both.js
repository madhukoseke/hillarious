// Keyboard playtest of the full demo (Playwright browser_run_code_unsafe filename=...).
// Real key events from a human-like policy: brake taps, hops, waiting at crossings; Enter/Space through the screens.
async (page) => {
  const BASE = 'http://127.0.0.1:8765/index.html?v=' + Date.now(), SHOT = (n) => `.playwright-mcp/shots/kb2-${n}.png`;
  const errors = [], log = [], fps = [];
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto(BASE);
  await page.evaluate(() => { try { localStorage.clear(); } catch (e) {} });
  await page.goto(BASE);
  await page.waitForTimeout(500);
  const keys = { ArrowUp: false, ArrowDown: false, Space: false, ArrowRight: false };
  const set = async (k, on) => { if (keys[k] !== on) { keys[k] = on; on ? await page.keyboard.down(k) : await page.keyboard.up(k); } };
  const release = async () => { for (const k of Object.keys(keys)) await set(k, false); };
  const t0 = Date.now(), shots = new Set();
  await page.keyboard.press('Enter'); // START RIDING
  for (let d = 1; d <= 2; d++) {
    await page.waitForTimeout(400);
    await page.screenshot({ path: SHOT(d + '-intro') });
    await page.keyboard.press('Space'); // START DELIVERY
    await page.waitForTimeout(120);
    const C = await page.evaluate(() => {
      const c = HILL.game.world.course;
      return { id: c.id, potholes: c.potholes.map((p) => p.x0), lips: c.lips, cars: c.cars.map((k) => k.x), stairs: c.stairs.map((s) => [s.x0, s.x1]), ramps: c.ramps.map((r) => r.x), door: c.doorX };
    });
    let brakeUntil = 0, jumpUntil = 0, lastJumpX = -99;
    const tStart = Date.now();
    while (Date.now() - tStart < 90000) {
      const s = await page.evaluate(() => {
        const g = HILL.game, w = g.world, b = w.bike;
        return {
          st: g.state, ws: w.state, x: b.x, v: Math.hypot(b.vx, b.vy), gr: b.grounded, amt: w.cargo.amount, t: w.score.time, fps: g.fps,
          wob: w.cargo.kind === 'cake' ? Math.abs(w.cargo.angle) : 0, bubble: g.fx.bubble ? g.fx.bubble.line.text : '', text: g.fx.text ? g.fx.text.line.text : '',
          cc: w.obstacles.crossers.map((c) => ({ kind: c.kind, x0: c.x0, x1: c.x1, active: c.active, blocking: c.blocking, state: c.state, ttb: c.timeToBlock(), ttc: c.timeToClear() })),
        };
      });
      const now = Date.now();
      if (s.st === 'review') break;
      fps.push(s.fps);
      if (s.bubble && !log.includes('B: ' + s.bubble)) log.push('B: ' + s.bubble);
      if (s.text && !log.includes('T: ' + s.text)) log.push('T: ' + s.text);
      const shoot = async (name, cond) => { if (cond && !shots.has(name)) { shots.add(name); await page.screenshot({ path: SHOT(name) }); log.push(`${name}: x=${s.x.toFixed(1)} v=${s.v.toFixed(1)} cargo=${s.amt.toFixed(1)} t=${s.t.toFixed(1)}`); } };
      if (s.ws === 'riding') {
        let target = 12.5;
        for (const cx of C.cars) if (cx - s.x < 28 && cx - s.x > -3) target = 10;
        for (const [a, b] of C.stairs) if (a - s.x < 20 && s.x < b) target = 6;
        for (const r of C.ramps) if (r - s.x < 25 && r - s.x > -2) target = 11;
        let waiting = false;
        for (const c of s.cc) { // look at the crossing: go if we clear it, otherwise slow and wait like a person
          if (!c.active) continue;
          const gap = c.x0 - 0.5 - (s.x + 0.95);
          if (gap < -0.5 || gap > 45) continue;
          const passT = (c.x1 + 1.5 - (s.x - 0.95)) / Math.max(1, s.v);
          if (passT < c.ttb - 0.4 || c.ttc < 0.2) continue;
          target = Math.min(target, Math.max(0, Math.sqrt(2 * 4.5 * Math.max(0, gap - 1.8))));
          waiting = true;
        }
        const tap = waiting ? 300 : 220;
        if (s.v > target + (waiting ? 0.4 : 1.5) && s.gr && now > brakeUntil + 120) brakeUntil = now + tap;
        await set('ArrowDown', now < brakeUntil);
        await set('ArrowUp', now >= brakeUntil && s.v < target - 1);
        for (const px of C.potholes) { const dd = px - (s.x + 0.6); if (dd > 0 && dd < s.v * 0.07 + 0.3 && s.gr && s.x - lastJumpX > 3) { jumpUntil = now + 150; lastJumpX = s.x; } }
        for (const lip of C.lips) if (lip.big) { const dd = lip.x - s.x; if (dd > -0.3 && dd < s.v * 0.04 + 0.2 && s.gr && s.x - lastJumpX > 3) { jumpUntil = now + 220; lastJumpX = s.x; } }
        await set('Space', now < jumpUntil);
        await shoot('waiting-' + d, waiting && s.v < 1.5);
      } else await release();
      if (C.id === 'nobHill') {
        await shoot('d1-pothole', s.x > C.potholes[0] - 6);
        await shoot('d1-car', s.x > C.cars[0] - 2);
        await shoot('d1-air', !s.gr && s.x > C.lips.find((l) => l.big).x + 2);
      } else {
        await shoot('d2-pothole-hop', !s.gr && s.x > C.potholes[0] - 3 && s.x < C.potholes[0] + 5);
        await shoot('d2-stairs', s.x > C.stairs[0][0] + 2);
        await shoot('d2-wobble', s.wob > 0.3);
        await shoot('d2-ramp-air', !s.gr && s.x > C.ramps[0] + 3);
      }
      await shoot(d + '-delivered', s.st === 'delivered');
      await page.waitForTimeout(25);
    }
    await release();
    await page.waitForTimeout(600);
    await page.screenshot({ path: SHOT(d + '-review') });
    const r = await page.evaluate(() => window.__HILL_LAST_RESULT__);
    log.push(`D${d} ${r.course}: ${r.time.toFixed(1)}s cargo ${r.condition.toFixed(1)}% crashes ${r.crashes} tip $${r.tip.toFixed(2)} (wall ${((Date.now() - tStart) / 1000).toFixed(1)}s)`);
    await page.keyboard.press('Enter'); // NEXT DELIVERY, then PERFORMANCE REVIEW
  }
  await page.waitForTimeout(1500);
  await page.screenshot({ path: SHOT('final-review') });
  const fin = await page.evaluate(() => { const S = window.__HILL_FINAL__; return S ? `${HILL.game.state}: ${S.band} · ${S.verdict.lines.join(' ')} · tips $${S.tips.toFixed(2)} · stars ${S.stars.join('+')}` : 'no final review'; });
  log.push('FINAL ' + fin);
  const tail = fps.slice(15);
  return { log, errors, avgFps: +(tail.reduce((a, b) => a + b, 0) / Math.max(1, tail.length)).toFixed(1), minFps: +Math.min(...tail).toFixed(1), wall: ((Date.now() - t0) / 1000).toFixed(1) };
}
