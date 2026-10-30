// Tuning probe: prints physics telemetry and autopilot runs. Not a test; run with `node tests/probe.mjs`.
import { loadGame, input } from './harness.mjs';
const H = loadGame();
const f = (v, d = 2) => (Number.isFinite(v) ? v.toFixed(d) : String(v));

function flat() {
  const w = new H.World(H.makeTestCourse('flat'));
  for (let i = 0; i < 600; i++) w.step(input());
  const b = w.bike;
  console.log(`flat 5s idle: x=${f(b.x)} y=${f(b.y)} vx=${f(b.vx, 3)} a=${f(b.a, 4)} w=${f(b.w, 4)} contacts=${b.wheels.map((q) => q.contact)} comp=${b.wheels.map((q) => f(q.comp, 3))}`);
  // pedal 5 s
  for (let i = 0; i < 600; i++) w.step(input({ pedal: true }));
  console.log(`flat pedal 5s: v=${f(b.vx)} pitch=${f(b.a, 3)}  latte=${f(w.cargo.amount, 1)}`);
  for (let i = 0; i < 600; i++) w.step(input({ pedal: true }));
  console.log(`flat pedal 10s: v=${f(b.vx)}`);
  // hard brake
  const v0 = b.vx, amt0 = w.cargo.amount; let t = 0; let maxSlosh = 0;
  while (b.vx > 0.2 && t < 5) { w.step(input({ brake: true })); t += H.STEP; maxSlosh = Math.max(maxSlosh, Math.abs(w.cargo.slosh)); }
  console.log(`brake from ${f(v0)}: stop in ${f(t)}s, pitch min?, latte lost ${f(amt0 - w.cargo.amount)}%, max slosh ${f(maxSlosh)} thr ${f(w.cargo.thr)} crashed=${w.state}`);
}

function hop() {
  const w = new H.World(H.makeTestCourse('flat'));
  for (let i = 0; i < 240; i++) w.step(input());
  for (let i = 0; i < 360; i++) w.step(input({ pedal: true }));
  const b = w.bike, y0 = b.y; let maxY = y0, air = 0, t = 0;
  w.step(input({ pedal: true, jumpPressed: true, jumpHeld: true }));
  let landed = false;
  for (let i = 0; i < 240; i++) {
    const held = i < 30;
    w.step(input({ jumpHeld: held }));
    maxY = Math.max(maxY, b.y);
    if (!b.grounded) air += H.STEP;
    if (air > 0.1 && b.grounded && !landed) { landed = true; t = air; }
  }
  console.log(`hop (held): height=${f(maxY - y0)}m airtime=${f(t)}s v=${f(b.vx)} state=${w.state}`);
  const w2 = new H.World(H.makeTestCourse('flat'));
  for (let i = 0; i < 240; i++) w2.step(input());
  const y1 = w2.bike.y; let m2 = y1;
  w2.step(input({ jumpPressed: true, jumpHeld: true }));
  for (let i = 0; i < 200; i++) { w2.step(input({ jumpHeld: i < 8 })); m2 = Math.max(m2, w2.bike.y); }
  console.log(`hop (tap): height=${f(m2 - y1)}m`);
}

function slope() {
  const w = new H.World(H.makeTestCourse('slope'));
  const b = w.bike;
  for (let i = 0; i < 120 * 12; i++) { w.step(input()); if (i % 240 === 0) console.log(`slope t=${f(w.t, 1)} x=${f(b.x, 1)} v=${f(Math.hypot(b.vx, b.vy))} latte=${f(w.cargo.amount, 1)} slosh=${f(w.cargo.slosh)}`); }
}

function land(h, vx) {
  const w = new H.World(H.makeTestCourse('flat'));
  for (let i = 0; i < 120; i++) w.step(input());
  const b = w.bike; b.y += h; b.vx = vx; b.px = b.x; b.py = b.y;
  const a0 = w.cargo.amount; const evs = [];
  for (let i = 0; i < 360; i++) { w.step(input()); evs.push(...w.drain()); }
  const L = evs.find((e) => e.type === 'LAND');
  console.log(`drop ${h}m @${vx}m/s: impact=${f(L && L.impact)} lost=${f(a0 - w.cargo.amount)}% state=${w.state} crashes=${w.score.crashes}`);
}

function course(profile) {
  const w = new H.World(H.buildNobHill()), ap = new H.Autopilot(profile);
  const evs = {}; let maxV = 0, maxAir = 0, air = 0; const lands = [];
  while (w.t < 150 && w.state !== 'done') {
    w.step(ap.input(w));
    const b = w.bike; maxV = Math.max(maxV, Math.hypot(b.vx, b.vy));
    if (!b.grounded) { air += H.STEP; maxAir = Math.max(maxAir, air); } else air = 0;
    for (const e of w.drain()) { evs[e.type] = (evs[e.type] || 0) + 1; if (e.type === 'LAND' && e.airTime > 0.25) lands.push(`${f(e.x, 0)}:${f(e.airTime)}s/${f(e.impact, 1)}`); if (e.type === 'CRASH') lands.push(`CRASH@${f(e.x, 0)}(${e.cause})`); }
  }
  const r = w.result();
  console.log(`[${profile}] state=${w.state} time=${f(r.time, 1)} latte=${f(r.condition, 1)} crashes=${r.crashes} tip=${f(r.tip)} maxV=${f(maxV, 1)} maxAir=${f(maxAir)} x=${f(w.bike.x, 0)}`);
  console.log('   events', JSON.stringify(evs));
  console.log('   air/land', lands.join('  '));
}

flat(); hop(); slope();
land(1.0, 6); land(2.3, 6); land(3.5, 6);
for (const p of ['careful', 'typical', 'fast', 'reckless']) course(p);

function brakeFrom(v0, kind) {
  const w = new H.World(H.makeTestCourse(kind));
  for (let i = 0; i < 120; i++) w.step(input());
  const b = w.bike, s = kind === 'slope' ? -0.15 : 0, a = Math.atan(s);
  b.vx = v0 * Math.cos(a); b.vy = v0 * Math.sin(a);
  for (let i = 0; i < 30; i++) w.step(input()); // settle
  const a0 = w.cargo.amount; let t = 0, ms = 0;
  while (Math.hypot(b.vx, b.vy) > 0.3 && t < 6) { w.step(input({ brake: true })); t += H.STEP; ms = Math.max(ms, Math.abs(w.cargo.slosh)); }
  for (let i = 0; i < 120; i++) w.step(input({ brake: true }));
  console.log(`hard brake ${v0}m/s on ${kind}: stop ${f(t)}s lost=${f(a0 - w.cargo.amount)}% maxSlosh=${f(ms)} state=${w.state}`);
}
function tapBrake(v0) {
  const w = new H.World(H.makeTestCourse('flat'));
  for (let i = 0; i < 120; i++) w.step(input());
  w.bike.vx = v0; const a0 = w.cargo.amount;
  for (let k = 0; k < 6; k++) { for (let i = 0; i < 26; i++) w.step(input({ brake: true })); for (let i = 0; i < 22; i++) w.step(input()); }
  console.log(`tap-brake x6 from ${v0}: v=${f(w.bike.vx)} lost=${f(a0 - w.cargo.amount)}%`);
}
brakeFrom(15, 'flat'); brakeFrom(15, 'slope'); brakeFrom(10, 'flat'); tapBrake(14);
