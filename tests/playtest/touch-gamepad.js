// Playwright MCP script (browser_run_code_unsafe filename=...): touch controls and gamepad on phone-sized viewports.
// Synthetic TouchEvents are hit-tested exactly like real fingers; the gamepad is a stub behind navigator.getGamepads.
async (page) => {
  const BASE = 'http://127.0.0.1:8765/index.html?v=' + Date.now(), SHOT = (n) => `.playwright-mcp/shots/p3-${n}.png`;
  const errors = [], out = {};
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  await page.setViewportSize({ width: 844, height: 390 });
  await page.goto(BASE);
  await page.waitForTimeout(1500);
  const center = (sel) => page.evaluate((sel) => { const r = document.querySelector(sel).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, sel);
  const touch = (type, active, changed, sel) => page.evaluate(({ type, active, changed, sel }) => {
    const target = document.querySelector(sel);
    const mk = (p) => new Touch({ identifier: p.id, target, clientX: p.x, clientY: p.y, pageX: p.x, pageY: p.y, radiusX: 8, radiusY: 8 });
    target.dispatchEvent(new TouchEvent(type, { touches: active.map(mk), targetTouches: active.map(mk), changedTouches: changed.map(mk), bubbles: true, cancelable: true }));
  }, { type, active, changed, sel });
  const st = () => page.evaluate(() => {
    const g = HILL.game, w = g.world, b = w && w.bike, i = g.input;
    return { state: g.state, v: b ? +b.vx.toFixed(2) : 0, x: b ? +b.x.toFixed(2) : 0, grounded: b ? b.grounded : true, air: b ? +b.airTime.toFixed(2) : 0, muted: g.audio.muted,
      touchMode: i.touchMode, touchDown: Object.assign({}, i.touchDown), pad: i.padName, downCls: Array.from(document.querySelectorAll('#touch .down')).map((e) => e.dataset.key) };
  });
  // 1. A tap switches on touch mode
  const tap = { id: 9, x: 120, y: 120 };
  await touch('touchstart', [tap], [tap], '#cv'); await touch('touchend', [], [tap], '#cv');
  out.touchMode = await page.evaluate(() => ({ body: document.body.classList.contains('touch'), pressHidden: getComputedStyle(document.querySelector('.press')).display === 'none' }));
  await page.click('[data-act=start]'); await page.waitForTimeout(500);
  await page.click('[data-act=go]'); await page.waitForTimeout(700);
  out.controlsVisible = await page.evaluate(() => getComputedStyle(document.getElementById('touch')).display === 'block');
  await page.screenshot({ path: SHOT('touch-riding') });
  // 2. Hold PEDAL
  const P = await center('.tc-pedal'), J = await center('.tc-hop'), K = await center('.tc-brake'), Z = await center('.tc-pause');
  const pedal = { id: 1, ...P }, hop = { id: 2, ...J };
  const s0 = await st();
  await touch('touchstart', [pedal], [pedal], '.tc-pedal'); await page.waitForTimeout(1500);
  const s1 = await st();
  out.pedal = { vBefore: s0.v, vAfter: s1.v, held: s1.touchDown.pedal, highlighted: s1.downCls.includes('pedal') };
  // 3. Second finger on HOP while pedaling
  await touch('touchstart', [pedal, hop], [hop], '.tc-hop');
  let air = false;
  for (let k = 0; k < 8 && !air; k++) { await page.waitForTimeout(60); const s = await st(); air = !s.grounded; }
  await touch('touchend', [pedal], [hop], '.tc-hop');
  await touch('touchend', [], [pedal], '.tc-pedal');
  await page.waitForTimeout(150);
  const s2 = await st();
  out.hop = { airborne: air, releasedAll: !s2.touchDown.pedal && !s2.touchDown.jump && s2.downCls.length === 0 };
  // 4. Slide a finger from BRAKE onto PEDAL
  const f = { id: 3, ...K };
  await touch('touchstart', [f], [f], '.tc-brake'); await page.waitForTimeout(100);
  const s3 = await st();
  const moved = { id: 3, ...P };
  await touch('touchmove', [moved], [moved], '.tc-brake'); await page.waitForTimeout(100);
  const s4 = await st();
  await touch('touchend', [], [moved], '.tc-brake');
  out.slide = { brakeFirst: s3.touchDown.brake, thenPedal: s4.touchDown.pedal && !s4.touchDown.brake };
  // 5. Pause button
  const pz = { id: 4, ...Z };
  await touch('touchstart', [pz], [pz], '.tc-pause'); await touch('touchend', [], [pz], '.tc-pause'); await page.waitForTimeout(400);
  out.pause = (await st()).state;
  await page.screenshot({ path: SHOT('touch-pause') });
  await page.click('[data-act=resume]'); await page.waitForTimeout(300);
  // 6. Gamepad stub
  await page.evaluate(() => {
    window.__pad = { id: 'Test Pad (STANDARD GAMEPAD)', connected: true, mapping: 'standard', buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })), axes: [0, 0, 0, 0] };
    navigator.getGamepads = () => [window.__pad];
    window.__btn = (i, on) => { window.__pad.buttons[i] = { pressed: on, value: on ? 1 : 0 }; };
  });
  await page.evaluate(() => window.__btn(6, true)); await page.waitForTimeout(1600); await page.evaluate(() => window.__btn(6, false));
  const g0 = await st();
  await page.evaluate(() => window.__btn(7, true)); await page.waitForTimeout(1400);
  const g1 = await st();
  await page.evaluate(() => window.__btn(0, true));
  let gAir = false;
  for (let k = 0; k < 8 && !gAir; k++) { await page.waitForTimeout(60); gAir = !(await st()).grounded; }
  await page.evaluate(() => { window.__btn(0, false); window.__btn(7, false); });
  await page.waitForTimeout(500);
  await page.evaluate(() => window.__btn(9, true)); await page.waitForTimeout(120); await page.evaluate(() => window.__btn(9, false)); await page.waitForTimeout(120);
  const gPause = (await st()).state;
  await page.evaluate(() => window.__btn(9, true)); await page.waitForTimeout(120); await page.evaluate(() => window.__btn(9, false)); await page.waitForTimeout(120);
  const gResume = (await st()).state;
  const m0 = (await st()).muted;
  await page.evaluate(() => window.__btn(3, true)); await page.waitForTimeout(120); await page.evaluate(() => window.__btn(3, false)); await page.waitForTimeout(120);
  const m1 = (await st()).muted;
  await page.evaluate(() => window.__btn(3, true)); await page.waitForTimeout(120); await page.evaluate(() => window.__btn(3, false)); await page.waitForTimeout(120);
  const xBefore = (await st()).x;
  await page.evaluate(() => window.__btn(8, true)); await page.waitForTimeout(150); await page.evaluate(() => window.__btn(8, false)); await page.waitForTimeout(300);
  const xAfter = (await st()).x;
  out.gamepad = { name: g1.pad, brakeToV: g0.v, pedalToV: g1.v, hop: gAir, pause: gPause, resume: gResume, muteToggled: m0 !== m1, restarted: xAfter < xBefore - 5 };
  // 7. Final review at phone size (synthetic shift)
  await page.evaluate(() => {
    const g = HILL.game;
    g.results = [
      { kind: 'coffee', condition: 92, tip: 5.6, time: 39.5, par: 46, crashes: 0, nearMisses: 1, cleanLandings: 2 },
      { kind: 'cake', condition: 88, tip: 6.1, time: 41.0, par: 48, crashes: 1, nearMisses: 2, cleanLandings: 1 },
    ];
    g.showFinal();
  });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: SHOT('final-phone') });
  out.finalFits = await page.evaluate(() => { const c = document.querySelector('#s-final .card'); return { scrollH: c.scrollHeight, clientH: c.clientHeight, band: window.__HILL_FINAL__.band }; });
  // 8. Portrait title
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(BASE); await page.waitForTimeout(1600);
  await page.screenshot({ path: SHOT('title-portrait') });
  out.errors = errors;
  return out;
}
