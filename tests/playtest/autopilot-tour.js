// Playwright MCP script: ride both deliveries with the autopilot and screenshot every set piece.
// Run with browser_run_code_unsafe { filename: 'tests/playtest/autopilot-tour.js' } against a local server.
async (page) => {
  const PROFILE = 'typical', SHOTS = '.playwright-mcp/shots/';
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.type() + ': ' + m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  await page.goto('http://127.0.0.1:8765/index.html?autopilot=' + PROFILE + '&v=' + Date.now());
  const marks = await page.evaluate(() => {
    const A = HILL.buildNobHill(), B = HILL.buildRussianHill(), big = (C) => C.lips.find((l) => l.big).x;
    return {
      nobHill: [['parked-maybemo', A.cars[0].x - 7], ['cable-car', A.crossers[0].x - 9], ['big-air', big(A) + 5], ['landmark-' + A.landmarks[0].id, A.landmarks[0].x], ['landmark-' + A.landmarks[1].id, A.landmarks[1].x], ['landmark-' + A.landmarks[2].id, A.landmarks[2].x], ['office', A.finishX + 3]],
      russianHill: [['pothole', B.potholes[0].x0 - 4], ['stairs', B.stairs[0].x0 + 1.5], ['landmark-' + B.landmarks[0].id, B.landmarks[0].x], ['cable-car', B.crossers[0].x - 8], ['big-air', big(B) + 5], ['landmark-' + B.landmarks[1].id, B.landmarks[1].x], ['ramp', B.ramps[0].x + 1], ['maybemo-crossing', B.crossers[1].x - 3], ['landmark-' + B.landmarks[2].id, B.landmarks[2].x], ['venue', B.finishX + 6]],
    };
  });
  const done = {}, log = [], t0 = Date.now();
  let n = 0, reviews = 0, lastState = '';
  while (Date.now() - t0 < 200000) {
    const s = await page.evaluate(() => {
      const g = HILL.game, w = g.world;
      return { state: g.state, id: w ? w.course.id : null, x: w ? w.bike.x : 0, fps: g.fps, results: (window.__HILL_RESULTS__ || []).length, bubble: g.fx.bubble ? g.fx.bubble.line.text : null, text: g.fx.text ? g.fx.text.line.text : null };
    });
    if (s.bubble && !log.includes('B: ' + s.bubble)) log.push('B: ' + s.bubble);
    if (s.text && !log.includes('T: ' + s.text)) log.push('T: ' + s.text);
    if (s.state !== lastState) { log.push('state ' + s.state + (s.id ? ' ' + s.id : '') + ' fps ' + s.fps.toFixed(0)); lastState = s.state; }
    if (s.id && (s.state === 'riding' || s.state === 'delivered') && marks[s.id]) {
      for (const [name, x] of marks[s.id]) {
        const key = s.id + ':' + name;
        if (!done[key] && s.x >= x) { done[key] = true; n++; await page.screenshot({ path: SHOTS + 'p2-tour-' + String(n).padStart(2, '0') + '-' + s.id + '-' + name + '.png' }); }
      }
    }
    if (s.state === 'review' && reviews < s.results) { reviews = s.results; await page.waitForTimeout(500); await page.screenshot({ path: SHOTS + 'p2-tour-review-' + reviews + '.png' }); if (reviews >= 2) break; }
    await page.waitForTimeout(60);
  }
  const results = await page.evaluate(() => (window.__HILL_RESULTS__ || []).map((r) => ({ course: r.course, time: +r.time.toFixed(1), condition: +r.condition.toFixed(1), crashes: r.crashes, tip: r.tip, items: r.tipItems.map((i) => i.label + ' ' + i.amount).join(', ') })));
  return { results, shots: n, errors: errors.slice(0, 20), log };
}
