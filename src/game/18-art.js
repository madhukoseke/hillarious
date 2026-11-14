  /* ---------- 18. DRAWING HELPERS & ART ---------- */
  const FONT_DISPLAY = '"Arial Rounded MT Bold","Arial Black","Avenir Next","Segoe UI",system-ui,sans-serif';
  const FONT_BODY = '"Avenir Next","Segoe UI",system-ui,-apple-system,"Helvetica Neue",Arial,sans-serif';
  const FONT_MONO = 'ui-monospace,"SF Mono",Menlo,Consolas,monospace';
  const COL = {
    ink: '#2d2a32', cream: '#fff6e5', coral: '#e8604c', mustard: '#f2b134', teal: '#2c7a7b',
    frame: '#2c7a7b', frameHi: '#3f9a9b', tire: '#2b2a30', rim: '#c9c7c2', spoke: '#dedbd3',
    jacket: '#f2b134', jacketDark: '#c98f22', pants: '#3a3642', pantsDark: '#26232c', shoe: '#f4efe4',
    skin: '#c98b5e', skinDark: '#ad744b', helmet: '#e8604c', helmetDark: '#bf4835', scarf: '#d64545', scarfStripe: '#fff1d6',
    bag: '#6f4a35', basket: '#c49359', basketDark: '#8f6638', coffee: '#7a4a2e', foam: '#f4e3c8',
    asphalt: '#56555e', asphaltFar: '#62616a', lane: '#f1e7d2', rail: '#9c999f', slot: '#2f2e34',
    curb: '#d2c4ad', curbDark: '#b7a990', walk: '#e6dac6', wall: '#b79d7f', wallLine: '#a78d70',
  };
  const PASTELS = ['#a9d9c3', '#f5c8a8', '#f2dd9e', '#c4d6ee', '#eeb8b4', '#dccfe6', '#b6dcd6', '#f1d2ae'];
  const TRIMS = ['#fffaf0', '#fdf3e1', '#eef4f2'];
  const DOORS = ['#a65f4f', '#3f6f73', '#5b4a7a', '#7a5a3a'];
  const EMPTY_CUP = { slosh: 0, sloshV: 0, tilt: 0, level: 0, float: 0 };

  function line(ctx, x0, y0, x1, y1) { ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke(); }
  function rrect(ctx, x, y, w, h, r) {
    r = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.arcTo(x + w, y, x + w, y + r, r);
    ctx.lineTo(x + w, y + h - r); ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
    ctx.lineTo(x + r, y + h); ctx.arcTo(x, y + h, x, y + h - r, r);
    ctx.lineTo(x, y + r); ctx.arcTo(x, y, x + r, y, r); ctx.closePath();
  }
  function ik(ax, ay, tx, ty, l1, l2, bend, out) {
    let dx = tx - ax, dy = ty - ay, d = Math.hypot(dx, dy);
    const maxD = l1 + l2 - 1e-4;
    if (d > maxD) { dx *= maxD / d; dy *= maxD / d; d = maxD; }
    if (d < 1e-4) d = 1e-4;
    const a = Math.atan2(dy, dx), b = Math.acos(clamp((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d), -1, 1));
    out.x = ax + Math.cos(a + bend * b) * l1; out.y = ay + Math.sin(a + bend * b) * l1;
    return out;
  }
  function wrapText(ctx, text, x, y, maxW, lh) {
    const words = text.split(' ');
    let cur = '', yy = y;
    for (const w of words) { const t = cur ? cur + ' ' + w : w; if (ctx.measureText(t).width > maxW && cur) { ctx.fillText(cur, x, yy); cur = w; yy += lh; } else cur = t; }
    ctx.fillText(cur, x, yy);
  }

  // Rider and bicycle, drawn in bike-local coordinates (origin at CoM, x forward, y up).
  const BB = { x: -0.08, y: -0.6 }, CRANK = 0.17, GRIP = { x: 0.25, y: 0.16 };
  function riderPose(P, o) {
    o.hipX = -0.32 - P.lean * 0.09 + P.stand * 0.07; o.hipY = 0.08 + P.stand * 0.14;
    o.tilt = 0.6 - P.lean * 0.32 + P.stand * 0.08 + P.brake * 0.1;
    o.shX = o.hipX + Math.sin(o.tilt) * 0.5; o.shY = o.hipY + Math.cos(o.tilt) * 0.5;
    o.hdX = o.shX + Math.sin(o.tilt * 0.5) * 0.2 + 0.03; o.hdY = o.shY + Math.cos(o.tilt * 0.5) * 0.2 + P.bob;
    o.pnX = BB.x + Math.cos(P.crank) * CRANK; o.pnY = BB.y + Math.sin(P.crank) * CRANK;
    o.pfX = BB.x - Math.cos(P.crank) * CRANK; o.pfY = BB.y - Math.sin(P.crank) * CRANK;
    return o;
  }
  const J = { x: 0, y: 0 };
  function drawLeg(ctx, hx, hy, fx, fy, pants, shoe) {
    const k = ik(hx, hy, fx + 0.02, fy + 0.035, 0.46, 0.46, 1, J);
    ctx.strokeStyle = pants; ctx.lineCap = 'round';
    ctx.lineWidth = 0.13; line(ctx, hx, hy, k.x, k.y);
    ctx.lineWidth = 0.1; line(ctx, k.x, k.y, fx + 0.02, fy + 0.035);
    ctx.fillStyle = shoe; ctx.beginPath(); ctx.ellipse(fx + 0.04, fy + 0.03, 0.085, 0.04, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = COL.coral; ctx.fillRect(fx - 0.04, fy - 0.005, 0.16, 0.018);
  }
  function drawArm(ctx, sx, sy, hx, hy, col) {
    const e = ik(sx, sy, hx, hy, 0.3, 0.3, -1, J);
    ctx.strokeStyle = col; ctx.lineCap = 'round';
    ctx.lineWidth = 0.09; line(ctx, sx, sy, e.x, e.y);
    ctx.lineWidth = 0.075; line(ctx, e.x, e.y, hx, hy);
    ctx.fillStyle = COL.ink; ctx.beginPath(); ctx.arc(hx, hy, 0.042, 0, TAU); ctx.fill();
  }
  function drawWheel(ctx, x, y, spin, blur) {
    const R = PHYS.wheelR;
    ctx.lineWidth = 0.064; ctx.strokeStyle = COL.tire; ctx.beginPath(); ctx.arc(x, y, R - 0.032, 0, TAU); ctx.stroke();
    ctx.lineWidth = 0.02; ctx.strokeStyle = COL.rim; ctx.beginPath(); ctx.arc(x, y, R - 0.076, 0, TAU); ctx.stroke();
    if (blur) { ctx.fillStyle = 'rgba(220,216,206,0.16)'; ctx.beginPath(); ctx.arc(x, y, R - 0.085, 0, TAU); ctx.fill(); }
    ctx.lineWidth = 0.01; ctx.strokeStyle = blur ? 'rgba(222,219,211,0.45)' : COL.spoke; ctx.beginPath();
    for (let k = 0; k < 8; k++) { const a = spin + (k * TAU) / 8; ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * (R - 0.085), y + Math.sin(a) * (R - 0.085)); }
    ctx.stroke();
    ctx.fillStyle = '#8d8a90'; ctx.beginPath(); ctx.arc(x, y, 0.036, 0, TAU); ctx.fill();
  }
  function drawCup(ctx, cg, t) {
    ctx.save();
    ctx.translate(0.63, -0.15); ctx.rotate(cg.tilt);
    const H = 0.44, bw = 0.11, tw = 0.15;
    const inner = () => { ctx.beginPath(); ctx.moveTo(-bw + 0.014, 0.022); ctx.lineTo(bw - 0.014, 0.022); ctx.lineTo(tw - 0.016, H); ctx.lineTo(-tw + 0.016, H); ctx.closePath(); };
    ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 0.028; // handle (rear)
    ctx.beginPath(); ctx.arc(-bw - 0.04, H * 0.5, 0.08, Math.PI * 0.55, Math.PI * 1.45); ctx.stroke();
    ctx.fillStyle = 'rgba(212,234,246,0.38)'; inner(); ctx.fill();
    if (cg.level > 0) {
      ctx.save(); inner(); ctx.clip();
      const lvl = 0.022 + cg.level * (H - 0.03), k = Math.tan(clamp(cg.slosh * 1.25, -1.25, 1.25));
      const wave = 0.004 + Math.min(0.02, Math.abs(cg.sloshV) * 0.004);
      const surf = (x) => lvl + k * x + Math.sin(t * 11 + x * 34) * wave;
      ctx.beginPath(); ctx.moveTo(0.3, -0.1); ctx.lineTo(-0.3, -0.1);
      for (let i = 0; i <= 10; i++) { const x = -0.3 + i * 0.06; ctx.lineTo(x, surf(x)); }
      ctx.closePath(); ctx.fillStyle = COL.coffee; ctx.fill();
      ctx.beginPath();
      for (let i = 0; i <= 10; i++) { const x = -0.3 + i * 0.06; if (i) ctx.lineTo(x, surf(x)); else ctx.moveTo(x, surf(x)); }
      for (let i = 10; i >= 0; i--) { const x = -0.3 + i * 0.06; ctx.lineTo(x, surf(x) - 0.038); }
      ctx.closePath(); ctx.fillStyle = COL.foam; ctx.fill();
      ctx.restore();
      if (cg.float > 0.05) {
        ctx.fillStyle = COL.coffee;
        for (let i = 0; i < 4; i++) {
          const bx = -0.09 + i * 0.06, by = lvl + 0.03 + cg.float * (0.07 + 0.05 * Math.sin(t * 7 + i * 2));
          ctx.beginPath(); ctx.arc(bx, by, 0.02 + 0.008 * Math.sin(t * 5 + i), 0, TAU); ctx.fill();
        }
      }
    }
    ctx.beginPath(); ctx.moveTo(-tw, H); ctx.lineTo(-bw, 0); ctx.lineTo(bw, 0); ctx.lineTo(tw, H);
    ctx.strokeStyle = 'rgba(255,255,255,0.92)'; ctx.lineWidth = 0.02; ctx.stroke();
    ctx.strokeStyle = 'rgba(45,42,50,0.55)'; ctx.lineWidth = 0.008; ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 0.014; line(ctx, -tw * 0.62, H * 0.86, -bw * 0.55, H * 0.2);
    ctx.restore();
  }
  function drawBikeBack(ctx, P, pose) {
    drawLeg(ctx, pose.hipX, pose.hipY, pose.pfX, pose.pfY, COL.pantsDark, '#cfc9bd');
    drawArm(ctx, pose.shX - 0.02, pose.shY, GRIP.x - 0.03, GRIP.y, COL.jacketDark);
  }
  function drawBikeBody(ctx, P, t) {
    const rh = P.hub[0], fh = P.hub[1];
    const blur = P.speed > 9;
    drawWheel(ctx, rh.x, rh.y, P.spin[0], blur);
    drawWheel(ctx, fh.x, fh.y, P.spin[1], blur);
    const ST = { x: -0.27, y: -0.08 }, HT = { x: 0.33, y: -0.04 }, HB = { x: 0.39, y: -0.22 };
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.strokeStyle = '#3d3a42'; ctx.lineWidth = 0.025; // rack
    line(ctx, -0.8, -0.3, -0.36, -0.3); line(ctx, -0.72, -0.3, rh.x, rh.y); line(ctx, -0.4, -0.3, -0.29, -0.16);
    ctx.strokeStyle = COL.frame; ctx.lineWidth = 0.046;
    ctx.beginPath(); ctx.moveTo(rh.x, rh.y); ctx.lineTo(BB.x, BB.y); ctx.lineTo(ST.x, ST.y); ctx.closePath(); ctx.stroke();
    ctx.lineWidth = 0.058;
    ctx.beginPath(); ctx.moveTo(ST.x, ST.y); ctx.lineTo(HT.x, HT.y); ctx.moveTo(BB.x, BB.y); ctx.lineTo(HB.x, HB.y); ctx.stroke();
    ctx.lineWidth = 0.072; line(ctx, HT.x, HT.y, HB.x, HB.y);
    ctx.lineWidth = 0.042; line(ctx, HB.x, HB.y, fh.x, fh.y);
    ctx.strokeStyle = COL.frameHi; ctx.lineWidth = 0.014; line(ctx, ST.x + 0.03, ST.y + 0.012, HT.x - 0.03, HT.y + 0.012);
    ctx.strokeStyle = '#3d3a42'; ctx.lineWidth = 0.03; line(ctx, ST.x, ST.y, -0.31, -0.02);
    ctx.fillStyle = COL.ink; ctx.beginPath(); ctx.ellipse(-0.33, -0.006, 0.11, 0.032, 0.05, 0, TAU); ctx.fill();
    ctx.strokeStyle = '#3d3a42'; ctx.lineWidth = 0.032; line(ctx, HT.x, HT.y, 0.31, 0.11); line(ctx, 0.31, 0.11, GRIP.x, GRIP.y);
    ctx.fillStyle = COL.mustard; ctx.beginPath(); ctx.arc(0.3, 0.155, 0.026 + P.bellRing * 0.012, 0, TAU); ctx.fill();
    ctx.strokeStyle = '#5b5862'; ctx.lineWidth = 0.012; // chain
    line(ctx, BB.x, BB.y + 0.085, rh.x, rh.y + 0.04); line(ctx, BB.x, BB.y - 0.085, rh.x, rh.y - 0.04);
    ctx.fillStyle = '#a19ea6'; ctx.beginPath(); ctx.arc(BB.x, BB.y, 0.088, 0, TAU); ctx.fill();
    ctx.fillStyle = '#6c6972'; ctx.beginPath(); ctx.arc(BB.x, BB.y, 0.05, 0, TAU); ctx.fill();
    if (P.view.rack) P.view.rack(ctx, P.cg, t);
    ctx.fillStyle = COL.basketDark; rrect(ctx, 0.44, -0.18, 0.4, 0.2, 0.03); ctx.fill();
    if (P.view.basket) { P.view.basket(ctx, P.cg, t); if (P.shield) drawBubbleWrap(ctx, 0.43, -0.16, 0.42, 0.62, t); }
    ctx.fillStyle = COL.basket; rrect(ctx, 0.44, -0.18, 0.4, 0.13, 0.03); ctx.fill();
    ctx.strokeStyle = COL.basketDark; ctx.lineWidth = 0.012;
    for (let i = 1; i < 6; i++) line(ctx, 0.44 + i * 0.066, -0.18, 0.44 + i * 0.066, -0.05);
    line(ctx, 0.44, -0.115, 0.84, -0.115);
    ctx.lineWidth = 0.02; line(ctx, 0.43, -0.05, 0.85, -0.05);
  }
  function drawScarfRibbon(ctx, s) {
    if (!s || s.n < 2) return;
    const edge = (i, sign) => {
      const j = Math.min(i + 1, s.n - 1), i0 = Math.max(i - 1, 0);
      const tx = s.x[j] - s.x[i0], ty = s.y[j] - s.y[i0], L = Math.hypot(tx, ty) || 1, w = 0.05 * (1 - (i / s.n) * 0.6);
      return [s.x[i] + sign * (-ty / L) * w, s.y[i] + sign * (tx / L) * w];
    };
    ctx.fillStyle = COL.scarf; ctx.beginPath();
    for (let i = 0; i < s.n; i++) { const p = edge(i, 1); if (i === 0) ctx.moveTo(p[0], p[1]); else ctx.lineTo(p[0], p[1]); }
    for (let i = s.n - 1; i >= 0; i--) { const p = edge(i, -1); ctx.lineTo(p[0], p[1]); }
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = COL.scarfStripe; ctx.lineWidth = 0.014;
    for (let i = 2; i < s.n; i += 2) line(ctx, s.x[i] - 0.02, s.y[i] - 0.03, s.x[i] + 0.02, s.y[i] + 0.03);
  }
  function drawBikeFront(ctx, P, pose, t) {
    ctx.lineCap = 'round';
    ctx.strokeStyle = COL.bag; ctx.lineWidth = 0.022; line(ctx, pose.shX + 0.02, pose.shY - 0.02, pose.hipX + 0.1, pose.hipY + 0.05);
    ctx.save(); ctx.translate((pose.hipX + pose.shX) / 2 - 0.13, (pose.hipY + pose.shY) / 2 - 0.02); ctx.rotate(-pose.tilt);
    ctx.fillStyle = COL.bag; rrect(ctx, -0.07, -0.15, 0.14, 0.3, 0.04); ctx.fill();
    ctx.fillStyle = '#8a5f45'; ctx.fillRect(-0.07, 0.02, 0.14, 0.05);
    ctx.restore();
    ctx.strokeStyle = COL.jacket; ctx.lineWidth = 0.22; line(ctx, pose.hipX, pose.hipY + 0.04, pose.shX, pose.shY);
    ctx.strokeStyle = 'rgba(255,255,255,0.65)'; ctx.lineWidth = 0.03;
    const mx = lerp(pose.hipX, pose.shX, 0.42), my = lerp(pose.hipY, pose.shY, 0.42);
    line(ctx, mx - Math.cos(pose.tilt) * 0.1, my + Math.sin(pose.tilt) * 0.1, mx + Math.cos(pose.tilt) * 0.1, my - Math.sin(pose.tilt) * 0.1);
    drawLeg(ctx, pose.hipX + 0.01, pose.hipY, pose.pnX, pose.pnY, COL.pants, COL.shoe);
    ctx.strokeStyle = '#3d3a42'; ctx.lineWidth = 0.032; line(ctx, BB.x, BB.y, pose.pnX, pose.pnY);
    ctx.fillStyle = '#3d3a42'; ctx.fillRect(pose.pnX - 0.045, pose.pnY - 0.015, 0.09, 0.03);
    if (P.wave > 0.01) drawArm(ctx, pose.shX, pose.shY, lerp(GRIP.x, pose.shX + 0.16, P.wave), lerp(GRIP.y, pose.shY + 0.5 + Math.sin(t * 22) * 0.06, P.wave), COL.jacket);
    else drawArm(ctx, pose.shX, pose.shY, GRIP.x, GRIP.y, COL.jacket);
    drawScarfRibbon(ctx, P.scarf);
    ctx.fillStyle = COL.scarf; ctx.beginPath(); ctx.ellipse(pose.shX + 0.02, pose.shY + 0.07, 0.09, 0.05, -pose.tilt * 0.5, 0, TAU); ctx.fill();
    drawHead(ctx, pose.hdX, pose.hdY, P.expr, P.look, t, -(pose.tilt - 0.6) * 0.35);
  }
  function drawHead(ctx, x, y, expr, look, t, rot) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(rot || 0);
    ctx.fillStyle = COL.skin; ctx.beginPath(); ctx.arc(0, 0, 0.118, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(0.11, -0.012, 0.028, 0, TAU); ctx.fill();
    ctx.fillStyle = COL.skinDark; ctx.beginPath(); ctx.arc(-0.03, -0.01, 0.026, 0, TAU); ctx.fill();
    ctx.fillStyle = COL.helmet; ctx.beginPath(); ctx.moveTo(-0.15, 0.0);
    ctx.quadraticCurveTo(-0.15, 0.17, 0.02, 0.175); ctx.quadraticCurveTo(0.15, 0.17, 0.17, 0.05); ctx.lineTo(0.13, 0.03);
    ctx.quadraticCurveTo(0.0, 0.06, -0.15, 0.0); ctx.fill();
    ctx.fillStyle = COL.helmetDark; ctx.fillRect(-0.05, 0.11, 0.035, 0.05); ctx.fillRect(0.03, 0.115, 0.035, 0.05);
    ctx.strokeStyle = COL.ink; ctx.lineWidth = 0.012; line(ctx, -0.02, 0.02, 0.02, -0.1);
    const ex = 0.055, ey = 0.012;
    ctx.lineCap = 'round';
    if (expr === 'joy') {
      ctx.strokeStyle = COL.ink; ctx.lineWidth = 0.014; ctx.beginPath(); ctx.arc(ex, ey - 0.01, 0.022, 0.2, Math.PI - 0.2); ctx.stroke();
    } else if (expr === 'dizzy') {
      ctx.strokeStyle = COL.ink; ctx.lineWidth = 0.014; line(ctx, ex - 0.02, ey - 0.02, ex + 0.02, ey + 0.02); line(ctx, ex - 0.02, ey + 0.02, ex + 0.02, ey - 0.02);
    } else {
      const big = expr === 'wow' ? 1.3 : 1;
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.ellipse(ex, ey, 0.026 * big, 0.031 * big, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = COL.ink; ctx.beginPath(); ctx.arc(ex + look.x * 0.01, ey + look.y * 0.012, 0.014, 0, TAU); ctx.fill();
    }
    ctx.strokeStyle = COL.ink; ctx.lineWidth = 0.013;
    const browY = ey + 0.05, browTilt = expr === 'grit' ? -0.025 : expr === 'worried' ? 0.02 : 0;
    line(ctx, ex - 0.03, browY + browTilt, ex + 0.03, browY - browTilt * 0.4);
    const mx = 0.07, my = -0.055;
    ctx.lineWidth = 0.014;
    switch (expr) {
      case 'grin': case 'joy':
        ctx.fillStyle = COL.ink; ctx.beginPath(); ctx.arc(mx - 0.005, my + 0.012, 0.038, Math.PI * 1.08, Math.PI * 1.92); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#fff'; ctx.fillRect(mx - 0.03, my - 0.004, 0.05, 0.012); break;
      case 'wow': ctx.fillStyle = COL.ink; ctx.beginPath(); ctx.ellipse(mx, my - 0.005, 0.016, 0.022, 0, 0, TAU); ctx.fill(); break;
      case 'grit':
        ctx.fillStyle = '#fff'; ctx.fillRect(mx - 0.032, my - 0.012, 0.055, 0.022);
        ctx.strokeStyle = COL.ink; ctx.strokeRect(mx - 0.032, my - 0.012, 0.055, 0.022); line(ctx, mx - 0.032, my - 0.001, mx + 0.023, my - 0.001); break;
      case 'worried': case 'dizzy':
        ctx.beginPath(); ctx.moveTo(mx - 0.03, my); ctx.quadraticCurveTo(mx - 0.015, my + 0.015, mx, my); ctx.quadraticCurveTo(mx + 0.015, my - 0.015, mx + 0.03, my); ctx.stroke();
        if (expr === 'worried') { ctx.fillStyle = '#8fd0f0'; ctx.beginPath(); ctx.ellipse(-0.01, 0.08, 0.012, 0.02, 0.3, 0, TAU); ctx.fill(); }
        break;
      default: ctx.beginPath(); ctx.arc(mx - 0.005, my + 0.02, 0.03, Math.PI * 1.15, Math.PI * 1.85); ctx.stroke();
    }
    ctx.fillStyle = 'rgba(232,96,76,0.28)'; ctx.beginPath(); ctx.arc(0.03, -0.035, 0.022, 0, TAU); ctx.fill();
    ctx.restore();
  }
  function drawRagdoll(ctx, x, y, a, t) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(a); ctx.lineCap = 'round';
    const flail = (k) => Math.sin(t * 13 + k) * 0.6;
    ctx.strokeStyle = COL.pants; ctx.lineWidth = 0.12;
    line(ctx, 0, -0.22, Math.cos(-2.0 + flail(1)) * 0.45, -0.22 + Math.sin(-2.0 + flail(1)) * 0.45);
    line(ctx, 0, -0.22, Math.cos(-1.1 + flail(2)) * 0.45, -0.22 + Math.sin(-1.1 + flail(2)) * 0.45);
    ctx.strokeStyle = COL.jacket; ctx.lineWidth = 0.22; line(ctx, 0, -0.22, 0, 0.25);
    ctx.lineWidth = 0.08;
    line(ctx, 0, 0.2, Math.cos(2.4 + flail(3)) * 0.4, 0.2 + Math.sin(2.4 + flail(3)) * 0.4);
    line(ctx, 0, 0.2, Math.cos(0.6 + flail(4)) * 0.4, 0.2 + Math.sin(0.6 + flail(4)) * 0.4);
    drawHead(ctx, 0.02, 0.44, 'dizzy', { x: 1, y: 0 }, t, 0);
    ctx.restore();
  }
  function drawFlyingCup(ctx, x, y, a) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(a);
    ctx.beginPath(); ctx.moveTo(-0.15, 0.22); ctx.lineTo(-0.11, -0.22); ctx.lineTo(0.11, -0.22); ctx.lineTo(0.15, 0.22);
    ctx.fillStyle = 'rgba(212,234,246,0.5)'; ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.95)'; ctx.lineWidth = 0.02; ctx.stroke();
    ctx.fillStyle = COL.coffee; ctx.fillRect(-0.1, -0.2, 0.2, 0.06);
    ctx.restore();
  }
  function drawCone(ctx, c, alpha) {
    const x = lerp(c.px, c.x, alpha), y = lerp(c.py, c.y, alpha), a = lerpAngle(c.pa, c.a, alpha);
    ctx.save(); ctx.translate(x, y); ctx.rotate(a);
    ctx.fillStyle = '#3d3a42'; ctx.fillRect(-0.17, -0.02, 0.34, 0.05);
    ctx.fillStyle = '#f28c28'; ctx.beginPath(); ctx.moveTo(-0.13, 0.03); ctx.lineTo(0.13, 0.03); ctx.lineTo(0.035, 0.46); ctx.lineTo(-0.035, 0.46); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#fff6e5'; ctx.beginPath(); ctx.moveTo(-0.095, 0.16); ctx.lineTo(0.095, 0.16); ctx.lineTo(0.075, 0.25); ctx.lineTo(-0.075, 0.25); ctx.closePath(); ctx.fill();
    ctx.restore();
  }
  function drawCar(ctx, car, t) {
    const ca = Math.cos(car.a), sa = Math.sin(car.a);
    ctx.save(); ctx.transform(ca, sa, -sa, ca, car.x, car.y);
    ctx.fillStyle = 'rgba(30,28,34,0.25)'; ctx.beginPath(); ctx.ellipse(1.96, 0.02, 2.2, 0.12, 0, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.moveTo(0.04, 0.3);
    for (const [px, py] of CAR_OUTLINE) ctx.lineTo(px, py);
    ctx.lineTo(3.88, 0.3); ctx.closePath();
    ctx.fillStyle = '#f6f5f1'; ctx.fill(); ctx.strokeStyle = '#9b97a0'; ctx.lineWidth = 0.03; ctx.stroke();
    ctx.fillStyle = '#3b4a5a';
    ctx.beginPath(); ctx.moveTo(0.42, 0.86); ctx.lineTo(0.9, 1.3); ctx.lineTo(1.55, 1.31); ctx.lineTo(1.55, 0.88); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(1.65, 0.88); ctx.lineTo(1.65, 1.31); ctx.lineTo(2.33, 1.32); ctx.lineTo(2.92, 0.92); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#c9c5cc'; ctx.lineWidth = 0.015; line(ctx, 1.6, 0.4, 1.6, 1.3);
    ctx.fillStyle = COL.teal; ctx.fillRect(0.3, 0.55, 3.4, 0.07);
    ctx.fillStyle = '#e04646'; ctx.fillRect(0.0, 0.48, 0.07, 0.14);
    ctx.fillStyle = '#ffe9a8'; ctx.fillRect(3.84, 0.6, 0.07, 0.12);
    ctx.fillStyle = '#2d2a32'; ctx.fillRect(1.42, 1.38, 0.32, 0.1);
    ctx.fillStyle = COL.teal; ctx.beginPath(); ctx.ellipse(1.58, 1.52, 0.17, 0.07, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(120,230,220,' + (0.5 + 0.5 * Math.sin(t * 9)).toFixed(2) + ')'; ctx.fillRect(1.5 + Math.sin(t * 6) * 0.08, 1.5, 0.06, 0.05);
    for (const wx of [0.72, 3.12]) {
      ctx.fillStyle = '#2b2a30'; ctx.beginPath(); ctx.arc(wx, 0.3, 0.3, 0, TAU); ctx.fill();
      ctx.fillStyle = '#c9c7c2'; ctx.beginPath(); ctx.arc(wx, 0.3, 0.14, 0, TAU); ctx.fill();
    }
    ctx.restore();
    if (car.plank) {
      const p = car.plank;
      ctx.strokeStyle = '#8a5c36'; ctx.lineWidth = 0.1; ctx.lineCap = 'butt';
      ctx.beginPath(); ctx.moveTo(p[0][0], p[0][1] - 0.04); ctx.lineTo(p[1][0], p[1][1] - 0.04); ctx.lineTo(p[2][0], p[2][1] - 0.04); ctx.stroke();
      ctx.strokeStyle = '#b07a4b'; ctx.lineWidth = 0.05;
      ctx.beginPath(); ctx.moveTo(p[0][0], p[0][1] - 0.02); ctx.lineTo(p[1][0], p[1][1] - 0.02); ctx.lineTo(p[2][0], p[2][1] - 0.02); ctx.stroke();
    }
  }
  // Napier Lane's raised boardwalk: piers down to the sidewalk, a plank deck, and a planted rail for the shelter.
  function drawBoardwalk(ctx, walk, T, xa, xb, t) {
    const x0 = Math.max(walk.x0, xa - 2), x1 = Math.min(walk.x1, xb + 2);
    if (x1 <= x0) return;
    const deck = (x) => polylineY(walk.pts, x), first = Math.ceil(x0 / 5) * 5;
    ctx.lineCap = 'butt';
    ctx.strokeStyle = '#6e4a2e'; ctx.lineWidth = 0.16;
    for (let x = first; x <= x1; x += 5) {
      const y = deck(x), foot = T.height(x) + ROAD.walk;
      if (y - foot > 0.2) { ctx.beginPath(); ctx.moveTo(x, y - 0.1); ctx.lineTo(x, foot); ctx.stroke(); }
    }
    ctx.strokeStyle = '#8a6a48'; ctx.lineWidth = 0.05;
    for (let x = first; x <= x1; x += 5) { ctx.beginPath(); ctx.moveTo(x, deck(x)); ctx.lineTo(x, deck(x) + 1.25); ctx.stroke(); }
    for (let x = first + 2.5; x <= x1; x += 5) { // planters on the rail: the reason there is no wind up here
      const y = deck(x) + 1.25, sway = Math.sin(t * 1.6 + x) * 0.03;
      ctx.fillStyle = '#5f8f55'; ctx.beginPath(); ctx.ellipse(x + sway, y + 0.2, 1.05, 0.42, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = '#7dae6b'; ctx.beginPath(); ctx.ellipse(x - 0.3 + sway, y + 0.3, 0.55, 0.24, 0, 0, TAU); ctx.fill();
    }
    const line = (off, col, w) => {
      ctx.strokeStyle = col; ctx.lineWidth = w; ctx.beginPath();
      for (let i = 0; i < walk.pts.length; i++) { const q = walk.pts[i]; if (i) ctx.lineTo(q[0], q[1] + off); else ctx.moveTo(q[0], q[1] + off); }
      ctx.stroke();
    };
    line(1.25, '#8a6a48', 0.07);
    line(-0.08, '#8a5c36', 0.16);
    line(-0.015, '#c79a68', 0.05);
  }
  // High-score rows, shared by the title screen and the final review: a gold, silver, or bronze medal for the top three,
  // a plain number after that, then the name, tips, time, and X / LinkedIn icons. Handles are cleaned again here because
  // localStorage can be edited by hand; names go in with textContent.
  const SOCIAL_ICONS = {
    x: 'M18.24 2.25h3.31l-7.23 8.26 8.5 11.24h-6.65l-5.21-6.82-5.97 6.82H1.68l7.73-8.84L1.25 2.25h6.83l4.71 6.23zm-1.16 17.52h1.83L7.08 4.13H5.12z',
    li: 'M20.45 20.45h-3.56v-5.57c0-1.33-.02-3.04-1.85-3.04-1.85 0-2.14 1.45-2.14 2.94v5.67H9.35V9h3.41v1.56h.05c.48-.9 1.64-1.85 3.37-1.85 3.6 0 4.27 2.37 4.27 5.46v6.28zM5.34 7.43a2.06 2.06 0 1 1 0-4.12 2.06 2.06 0 0 1 0 4.12zM7.12 20.45H3.56V9h3.56v11.45z',
  };
  function socialLink(kind, href, label) {
    const a = document.createElement('a'), NS = 'http://www.w3.org/2000/svg', svg = document.createElementNS(NS, 'svg'), path = document.createElementNS(NS, 'path');
    a.className = 'hs-social ' + kind; a.href = href; a.target = '_blank'; a.rel = 'noopener noreferrer'; a.title = label; a.setAttribute('aria-label', label);
    svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('aria-hidden', 'true'); path.setAttribute('d', SOCIAL_ICONS[kind]);
    svg.appendChild(path); a.appendChild(svg);
    return a;
  }
  function fillScoreList(ol, list) {
    ol.textContent = '';
    const rows = (Array.isArray(list) ? list : []).filter((e) => e && Number.isFinite(e.tips)).slice(0, TOP_SHIFTS);
    rows.forEach((e, i) => {
      const li = document.createElement('li'), rank = document.createElement('span'), who = document.createElement('b'), tips = document.createElement('span');
      rank.className = 'hs-rank' + (i < 3 ? ' r' + (i + 1) : ''); rank.textContent = String(i + 1);
      rank.setAttribute('aria-label', ['1st', '2nd', '3rd'][i] || (i + 1) + 'th');
      who.textContent = String(e.name || 'Anonymous').slice(0, 20);
      tips.textContent = fmtMoney(e.tips) + (Number.isFinite(e.time) ? ' · ' + fmtTime(e.time) : '');
      li.append(rank, who, tips);
      const x = cleanHandle(e.x || '', 15), linkedin = cleanHandle(e.linkedin || '', 60), name = who.textContent;
      if (x) li.append(socialLink('x', 'https://x.com/' + x, name + ' on X (@' + x + ')'));
      if (linkedin) li.append(socialLink('li', 'https://www.linkedin.com/in/' + linkedin, name + ' on LinkedIn'));
      ol.appendChild(li);
    });
  }

  // Pedestrians: tech worker, tourist, dog walker, fitness enthusiast (the cable car operator rides along).
  const PED_LOOK = {
    tech: { top: '#3d5a80', vest: '#7a8796', pants: '#4a4a55', hair: '#3b2a20', skin: '#e0b48c', voice: 0.6 },
    tourist: { top: '#4fb3a9', pants: '#c9b28a', hair: '#e5c27a', skin: '#f0c8a0', voice: 1.0 },
    dog: { top: '#6b8f5e', pants: '#3e3a48', hair: '#2a1f1a', skin: '#8d5a3b', voice: 0.3 },
    fitness: { top: '#e8604c', pants: '#2d2a32', hair: '#1f1a17', skin: '#c98b5e', voice: 0.8 },
  };
  function drawPedestrian(ctx, B, y, t) {
    const L = PED_LOOK[B.kind] || PED_LOOK.tech, r = B.react || null, rt = r ? r.t : 9;
    const act = r && rt < (r.dur || 2.2) ? r.kind : B.worried ? 'worried' : null;
    const jog = B.kind === 'fitness' ? Math.sin(t * 11 + B.x) : 0, hop = B.kind === 'fitness' ? Math.abs(jog) * 0.06 : 0;
    const bob = Math.sin(t * 2 + B.x) * 0.015 + hop + (act === 'cheer' ? Math.abs(Math.sin(t * 10)) * 0.08 : 0);
    ctx.save(); ctx.translate(B.x, y); ctx.lineCap = 'round';
    ctx.fillStyle = 'rgba(30,28,34,0.18)'; ctx.beginPath(); ctx.ellipse(0, 0.01, 0.32, 0.05, 0, 0, TAU); ctx.fill();
    ctx.strokeStyle = B.kind === 'fitness' ? L.skin : L.pants; ctx.lineWidth = 0.11;
    line(ctx, -0.07, hop, -0.06 + jog * 0.05, 0.8 + bob); line(ctx, 0.07, hop * (1 - jog), 0.06 - jog * 0.05, 0.8 + bob);
    if (B.kind === 'fitness' || B.kind === 'tourist') { ctx.fillStyle = L.pants; rrect(ctx, -0.17, 0.62 + bob, 0.34, 0.24, 0.05); ctx.fill(); }
    ctx.fillStyle = B.kind === 'fitness' ? '#f4efe4' : COL.ink; ctx.fillRect(-0.14, -0.02 + hop, 0.13, 0.05); ctx.fillRect(0.02, -0.02 + hop * (1 - jog), 0.13, 0.05);
    ctx.fillStyle = L.top; rrect(ctx, -0.17, 0.75 + bob, 0.34, 0.6, 0.1); ctx.fill();
    if (L.vest) { ctx.fillStyle = L.vest; rrect(ctx, -0.17, 0.8 + bob, 0.34, 0.48, 0.08); ctx.fill(); ctx.fillStyle = '#5a6b80'; ctx.fillRect(-0.02, 0.82 + bob, 0.04, 0.44); }
    if (B.kind === 'tourist') { ctx.fillStyle = '#f2dd9e'; for (let k = 0; k < 4; k++) { ctx.beginPath(); ctx.arc(-0.08 + (k % 2) * 0.16, 0.95 + bob + Math.floor(k / 2) * 0.22, 0.04, 0, TAU); ctx.fill(); } }
    if (B.kind === 'fitness') { ctx.fillStyle = '#fff6e5'; ctx.fillRect(-0.17, 1.12 + bob, 0.34, 0.05); }
    // arms by mood
    const sh = 1.25 + bob, wave = Math.sin(t * 14) * 0.5;
    ctx.strokeStyle = B.kind === 'fitness' ? L.skin : L.top; ctx.lineWidth = 0.08;
    let ra = -0.9, la = Math.PI + 0.9, rl = 0.4, ll = 0.4;
    if (act === 'talk') ra = 0.9 + wave;
    else if (act === 'cheer' || act === 'shock') { ra = 1.3 + (act === 'cheer' ? wave * 0.3 : 0); la = Math.PI - 1.3 - (act === 'cheer' ? wave * 0.3 : 0); }
    else if (act === 'photo') { ra = 2.3; la = Math.PI - 2.3; rl = ll = 0.3; }
    else if (act === 'worried') { ra = 2.0; la = Math.PI - 2.0; rl = ll = 0.36; }
    else if (B.kind === 'fitness') { ra = -0.4 + jog * 0.6; la = Math.PI + 0.4 + jog * 0.6; rl = ll = 0.3; }
    line(ctx, 0.12, sh, 0.12 + Math.cos(ra) * rl, sh + Math.sin(ra) * rl);
    line(ctx, -0.12, sh, -0.12 + Math.cos(la) * ll, sh + Math.sin(la) * ll);
    const hx = 0, hy = 1.5 + bob;
    ctx.fillStyle = L.skin; ctx.beginPath(); ctx.arc(hx, hy, 0.13, 0, TAU); ctx.fill();
    ctx.fillStyle = L.hair; ctx.beginPath(); ctx.arc(hx, hy + 0.05, 0.135, 0.1, Math.PI - 0.1); ctx.fill();
    if (B.kind === 'fitness') { ctx.fillStyle = '#2c7a7b'; ctx.fillRect(-0.14, hy + 0.05, 0.28, 0.045); }
    if (B.kind === 'tourist') { ctx.fillStyle = '#f2dd9e'; ctx.beginPath(); ctx.ellipse(0, hy + 0.12, 0.24, 0.05, 0, 0, TAU); ctx.fill(); ctx.fillRect(-0.11, hy + 0.12, 0.22, 0.09); }
    if (B.kind === 'tech') { ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(0.12, hy - 0.01, 0.02, 0, TAU); ctx.fill(); }
    ctx.fillStyle = COL.ink;
    ctx.beginPath(); ctx.arc(-0.045, hy + 0.01, 0.016, 0, TAU); ctx.arc(0.045, hy + 0.01, 0.016, 0, TAU); ctx.fill();
    ctx.strokeStyle = COL.ink; ctx.lineWidth = 0.014; ctx.beginPath();
    if (act === 'shock' || act === 'worried') { ctx.fillStyle = COL.ink; ctx.ellipse(0, hy - 0.06, 0.025, 0.035, 0, 0, TAU); ctx.fill(); }
    else if (act === 'cheer' || act === 'talk') { ctx.arc(0, hy - 0.04, 0.04, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke(); }
    else { ctx.moveTo(-0.03, hy - 0.06); ctx.lineTo(0.03, hy - 0.06); ctx.stroke(); }
    if (act === 'photo' || (B.kind === 'tourist' && !act)) { // camera
      const cy = act === 'photo' ? hy - 0.02 : 1.05 + bob;
      ctx.fillStyle = COL.ink; ctx.fillRect(-0.1, cy - 0.06, 0.2, 0.12); ctx.fillStyle = '#9fbccc'; ctx.beginPath(); ctx.arc(0, cy, 0.035, 0, TAU); ctx.fill();
      if (act === 'photo' && rt < 0.15) { ctx.fillStyle = 'rgba(255,255,240,0.9)'; ctx.beginPath(); ctx.arc(0, cy, 0.35, 0, TAU); ctx.fill(); }
    }
    if (B.kind === 'tech' && act !== 'photo') { ctx.fillStyle = '#2d2a32'; ctx.fillRect(0.12 + Math.cos(ra) * rl - 0.03, sh + Math.sin(ra) * rl - 0.05, 0.06, 0.1); }
    if (B.kind === 'dog') {
      const dx = 0.75, wag = Math.sin(t * (act ? 22 : 12)) * 0.15, bark = act && Math.sin(t * 18) > 0;
      ctx.strokeStyle = COL.ink; ctx.lineWidth = 0.012; line(ctx, -0.12 + Math.cos(la) * ll, sh + Math.sin(la) * ll, dx - 0.05, 0.42);
      ctx.fillStyle = '#a0683c'; rrect(ctx, dx - 0.25, 0.18, 0.5, 0.22, 0.1); ctx.fill();
      ctx.strokeStyle = '#a0683c'; ctx.lineWidth = 0.06; line(ctx, dx - 0.18, 0.2, dx - 0.18, 0.0); line(ctx, dx + 0.17, 0.2, dx + 0.17, 0.0); line(ctx, dx - 0.24, 0.33, dx - 0.4, 0.42 + wag);
      ctx.fillStyle = '#a0683c'; ctx.beginPath(); ctx.arc(dx + 0.28, 0.42 + (bark ? 0.03 : 0), 0.11, 0, TAU); ctx.fill();
      ctx.fillStyle = '#7a4a28'; ctx.beginPath(); ctx.ellipse(dx + 0.22, 0.47, 0.04, 0.08, 0.4, 0, TAU); ctx.fill();
      ctx.fillStyle = COL.ink; ctx.beginPath(); ctx.arc(dx + 0.33, 0.45, 0.014, 0, TAU); ctx.fill();
      if (bark) { ctx.fillStyle = '#5a2a20'; ctx.beginPath(); ctx.arc(dx + 0.36, 0.37, 0.035, 0, Math.PI); ctx.fill(); }
    }
    ctx.restore();
  }
  // Portrait colours: [background, jacket, shirt, skin, hair]. Pat from HR also gets glasses and a lanyard.
  const AVATARS = {
    founder: ['#f2b134', '#7a8796', '#5a6b80', '#e0b48c', '#3b2a20'],
    planner: ['#9fd3f0', '#c2584a', '#fff6e5', '#c98b5e', '#2a1f1a'],
    hr: ['#b6dcd6', '#3f6f73', '#f2dd9e', '#d9a77c', '#5b4a3a'],
  };
  function drawAvatar(canvas, mood, who) {
    if (!canvas || !canvas.getContext) return;
    const c = canvas.getContext('2d'), s = canvas.width, pl = who === 'planner', hr = who === 'hr', A = AVATARS[who] || AVATARS.founder;
    c.setTransform(s / 100, 0, 0, s / 100, 0, 0);
    c.clearRect(0, 0, 100, 100);
    c.fillStyle = A[0]; c.beginPath(); c.arc(50, 50, 50, 0, TAU); c.fill();
    c.fillStyle = A[1]; c.beginPath(); c.moveTo(16, 100); c.quadraticCurveTo(18, 70, 50, 68); c.quadraticCurveTo(82, 70, 84, 100); c.fill();
    c.fillStyle = A[2]; c.fillRect(44, 70, 12, 30);
    c.fillStyle = A[3]; c.beginPath(); c.arc(50, 45, 21, 0, TAU); c.fill();
    c.fillStyle = A[4]; c.beginPath(); c.arc(50, 38, 22, Math.PI, 0); c.fill(); c.beginPath(); c.arc(pl ? 50 : 64, pl ? 16 : 22, pl ? 10 : 7, 0, TAU); c.fill();
    if (pl) { c.strokeStyle = '#2d2a32'; c.lineWidth = 3; c.beginPath(); c.arc(50, 44, 25, Math.PI * 1.05, Math.PI * 1.6); c.stroke(); c.fillStyle = '#2d2a32'; c.beginPath(); c.arc(27, 52, 4, 0, TAU); c.fill(); }
    if (hr) {
      c.strokeStyle = '#e8604c'; c.lineWidth = 2.4; c.beginPath(); c.moveTo(42, 70); c.lineTo(50, 86); c.lineTo(58, 70); c.stroke();
      c.fillStyle = '#fff6e5'; c.fillRect(44, 84, 12, 9); c.strokeStyle = '#2d2a32'; c.lineWidth = 1.5; c.strokeRect(44, 84, 12, 9);
      c.lineWidth = 2; c.beginPath(); c.arc(42, 46, 6, 0, TAU); c.moveTo(64, 46); c.arc(58, 46, 6, 0, TAU); c.moveTo(48, 46); c.lineTo(52, 46); c.stroke();
    }
    c.fillStyle = '#2d2a32'; c.beginPath(); c.arc(42, 46, 2.6, 0, TAU); c.arc(58, 46, 2.6, 0, TAU); c.fill();
    c.strokeStyle = '#2d2a32'; c.lineWidth = 2.6; c.lineCap = 'round'; c.beginPath();
    if (mood >= 4) { c.arc(50, 52, 9, 0.15 * Math.PI, 0.85 * Math.PI); }
    else if (mood === 3) { c.moveTo(42, 57); c.lineTo(58, 57); }
    else if (mood === 2) { c.arc(50, 63, 8, 1.15 * Math.PI, 1.85 * Math.PI); }
    else { c.ellipse(50, 58, 5, 6, 0, 0, TAU); }
    c.stroke();
    if (mood <= 2) { c.beginPath(); c.moveTo(36, 38); c.lineTo(46, 41); c.moveTo(64, 38); c.lineTo(54, 41); c.stroke(); }
  }
  function drawAvatarInline(ctx, x, y, r, who) {
    const A = AVATARS[who] || AVATARS.founder;
    ctx.save(); ctx.translate(x, y);
    ctx.fillStyle = A[0]; ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fill();
    ctx.fillStyle = A[3]; ctx.beginPath(); ctx.arc(0, -r * 0.05, r * 0.45, 0, TAU); ctx.fill();
    ctx.fillStyle = A[4]; ctx.beginPath(); ctx.arc(0, -r * 0.18, r * 0.47, Math.PI, 0); ctx.fill();
    ctx.fillStyle = A[1]; ctx.beginPath(); ctx.arc(0, r * 1.05, r * 0.7, Math.PI, 0); ctx.fill();
    ctx.restore();
  }

  // Landmarks: original stylized drawings keyed by the curated `visual` hint (no photos, no copied artwork).
  function pointedArch(ctx, cx, y, w, h) {
    ctx.beginPath(); ctx.moveTo(cx - w / 2, y); ctx.lineTo(cx - w / 2, y + h - w * 0.55);
    ctx.quadraticCurveTo(cx - w / 2, y + h - w * 0.05, cx, y + h); ctx.quadraticCurveTo(cx + w / 2, y + h - w * 0.05, cx + w / 2, y + h - w * 0.55);
    ctx.lineTo(cx + w / 2, y); ctx.closePath();
  }
  function blob(ctx, x, y, r, col) { ctx.fillStyle = col; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.arc(x - r * 0.7, y - r * 0.35, r * 0.75, 0, TAU); ctx.arc(x + r * 0.7, y - r * 0.3, r * 0.8, 0, TAU); ctx.fill(); }
  function plinth(ctx, T, x0, x1, base, col) {
    ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(x0, base); ctx.lineTo(x1, base);
    ctx.lineTo(x1, T.height(x1) + ROAD.walk - 0.35); ctx.lineTo(x0, T.height(x0) + ROAD.walk - 0.35); ctx.closePath(); ctx.fill();
  }
  function drawLandmark(ctx, L, T, time) {
    const x0 = L.x0, x1 = L.x1, w = x1 - x0, cx = (x0 + x1) / 2, base = Math.max(T.height(x0), T.height(x1)) + ROAD.walk;
    const walk = (x) => T.height(x) + ROAD.walk;
    switch (L.visual) {
      case 'large-gothic-cathedral': {
        plinth(ctx, T, x0, x1, base, '#bfb4a2');
        ctx.save(); ctx.translate(cx, base); ctx.scale(0.66, 0.66); ctx.translate(-cx, -base);
        const st = '#e3dacb', sh = '#c9bda9', dk = '#6f6a73';
        ctx.fillStyle = sh; ctx.fillRect(x0 + 1, base, w - 2, 10);
        for (let k = 0; k < 5; k++) { ctx.fillStyle = dk; pointedArch(ctx, x0 + 2.2 + k * 1.3, base + 4, 0.6, 3.6); ctx.fill(); }
        for (const tx of [cx - 6.2, cx + 6.2]) {
          ctx.fillStyle = st; ctx.fillRect(tx - 2.3, base, 4.6, 16.5);
          ctx.fillStyle = sh; ctx.fillRect(tx - 2.3, base + 16.5, 4.6, 0.5);
          for (const px of [-2.1, -0.7, 0.7, 2.1]) { ctx.fillStyle = st; ctx.beginPath(); ctx.moveTo(tx + px - 0.3, base + 17); ctx.lineTo(tx + px, base + 18.6); ctx.lineTo(tx + px + 0.3, base + 17); ctx.fill(); }
          ctx.fillStyle = dk; pointedArch(ctx, tx - 0.75, base + 9.5, 0.7, 4.2); ctx.fill(); pointedArch(ctx, tx + 0.75, base + 9.5, 0.7, 4.2); ctx.fill();
          pointedArch(ctx, tx, base + 4, 1.1, 3.2); ctx.fill();
        }
        ctx.fillStyle = st; ctx.fillRect(cx - 3.9, base, 7.8, 11.5);
        ctx.beginPath(); ctx.moveTo(cx - 3.9, base + 11.5); ctx.lineTo(cx, base + 14.2); ctx.lineTo(cx + 3.9, base + 11.5); ctx.fill();
        ctx.fillStyle = '#5d7fa6'; ctx.beginPath(); ctx.arc(cx, base + 8.4, 1.75, 0, TAU); ctx.fill();
        ctx.strokeStyle = '#e8c35a'; ctx.lineWidth = 0.09;
        for (let k = 0; k < 8; k++) { const a = (k * TAU) / 8; line(ctx, cx, base + 8.4, cx + Math.cos(a) * 1.7, base + 8.4 + Math.sin(a) * 1.7); }
        ctx.beginPath(); ctx.arc(cx, base + 8.4, 0.75, 0, TAU); ctx.stroke();
        ctx.fillStyle = '#8d6a4a'; pointedArch(ctx, cx, base, 2.4, 4.6); ctx.fill();
        ctx.strokeStyle = sh; ctx.lineWidth = 0.12; pointedArch(ctx, cx, base, 3.0, 5.2); ctx.stroke();
        ctx.restore();
        ctx.fillStyle = '#d6ccbb'; for (let k = 0; k < 3; k++) ctx.fillRect(cx - 2 + k * 0.2, walk(cx) + (k * (base - walk(cx))) / 3, 4 - k * 0.4, Math.max(0.05, (base - walk(cx)) / 3 + 0.02));
        break;
      }
      case 'trees-and-park-fence': {
        ctx.fillStyle = '#8fb874'; ctx.beginPath(); ctx.moveTo(x0, walk(x0)); ctx.lineTo(x1, walk(x1)); ctx.lineTo(x1, base + 1.2); ctx.lineTo(x0, base + 1.2); ctx.fill();
        for (const [tx, s] of [[x0 + 2.5, 1.15], [x0 + 6.5, 0.9], [x1 - 6, 1.05], [x1 - 2.2, 1.25]]) {
          ctx.fillStyle = '#6d5a48'; ctx.fillRect(tx - 0.16, walk(tx), 0.32, 3 * s);
          blob(ctx, tx, walk(tx) + 3.9 * s, 1.6 * s, '#6c955c'); blob(ctx, tx + 0.3, walk(tx) + 4.4 * s, 1.0 * s, '#7fa66b');
        }
        const fy = walk(cx);
        ctx.fillStyle = '#cfc6b6'; ctx.fillRect(cx - 1.6, fy, 3.2, 0.55); ctx.fillRect(cx - 0.18, fy + 0.55, 0.36, 1.4);
        ctx.strokeStyle = 'rgba(160,210,235,0.9)'; ctx.lineWidth = 0.06;
        for (let k = -1; k <= 1; k += 2) { ctx.beginPath(); ctx.moveTo(cx, fy + 1.95); ctx.quadraticCurveTo(cx + k * 0.9, fy + 2.3 + Math.sin(time * 6) * 0.05, cx + k * 1.4, fy + 0.6); ctx.stroke(); }
        ctx.strokeStyle = '#2f2e34'; ctx.lineWidth = 0.05;
        for (let x = x0 + 0.2; x < x1; x += 0.32) { const y = walk(x) - 0.05; line(ctx, x, y, x, y + 1.05); }
        ctx.lineWidth = 0.06; ctx.beginPath(); ctx.moveTo(x0, walk(x0) + 0.95); ctx.lineTo(x1, walk(x1) + 0.95); ctx.stroke();
        break;
      }
      case 'historic-brick-building': {
        plinth(ctx, T, x0, x1, base, '#9b8a78');
        ctx.fillStyle = '#a5523d'; ctx.fillRect(x0 + 0.5, base, w - 1, 8.4);
        ctx.fillStyle = 'rgba(70,30,20,0.18)'; for (let y = base + 0.3; y < base + 8.3; y += 0.3) ctx.fillRect(x0 + 0.5, y, w - 1, 0.04);
        ctx.fillStyle = '#8a4130'; ctx.fillRect(x1 - 3.4, base + 8.4, 1.3, 4.6); ctx.fillRect(x1 - 3.6, base + 12.8, 1.7, 0.4);
        ctx.fillStyle = '#e8dcc4'; ctx.fillRect(x0 + 0.2, base + 8.2, w - 0.4, 0.5); ctx.fillRect(x0 + 0.5, base + 3.9, w - 1, 0.25);
        for (let k = 0; k < 5; k++) {
          const wx = x0 + 1.6 + k * ((w - 3.2) / 4);
          for (const [wy, wh] of [[base + 0.6, 2.4], [base + 4.8, 2.3]]) {
            ctx.fillStyle = '#e8dcc4'; ctx.beginPath(); ctx.moveTo(wx - 0.62, wy); ctx.lineTo(wx - 0.62, wy + wh - 0.6); ctx.arc(wx, wy + wh - 0.6, 0.62, Math.PI, 0, true); ctx.lineTo(wx + 0.62, wy); ctx.fill();
            ctx.fillStyle = k === 2 && wy < base + 1 ? '#5a3a2a' : '#7f9fb0'; ctx.beginPath(); ctx.moveTo(wx - 0.48, wy); ctx.lineTo(wx - 0.48, wy + wh - 0.62); ctx.arc(wx, wy + wh - 0.62, 0.48, Math.PI, 0, true); ctx.lineTo(wx + 0.48, wy); ctx.fill();
          }
        }
        ctx.fillStyle = '#2d2a32'; ctx.fillRect(cx - 3.2, base + 3.95, 6.4, 0.75);
        const wheel = (wx) => { ctx.strokeStyle = '#3d3a42'; ctx.lineWidth = 0.08; ctx.beginPath(); ctx.arc(wx, base + 10.2, 0.9, 0, TAU); ctx.stroke(); line(ctx, wx - 0.9, base + 10.2, wx + 0.9, base + 10.2); line(ctx, wx, base + 9.3, wx, base + 11.1); };
        wheel(x0 + 2.6);
        break;
      }
      case 'tree-lined-lane': {
        const top = (x) => walk(x) + 4.3 + Math.sin((x - x0) * 1.3) * 0.45;
        ctx.fillStyle = '#7d9d63'; ctx.beginPath(); ctx.moveTo(x0, walk(x0));
        for (let x = x0; x <= x1 + 0.01; x += 0.4) ctx.lineTo(x, top(x));
        ctx.lineTo(x1, walk(x1)); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#b89a74';
        for (let k = 0; k < 7; k++) { const sx = cx - 1 + k * 0.32; ctx.fillRect(sx - 0.45, walk(sx) + 0.2 + k * 0.48, 0.9, 0.12); }
        const hx = x1 - 3.4, hy = walk(hx) + 1.6;
        ctx.fillStyle = '#d9c7a6'; ctx.fillRect(hx - 1.3, hy, 2.6, 1.9); ctx.fillStyle = '#8d6a4a';
        ctx.beginPath(); ctx.moveTo(hx - 1.6, hy + 1.9); ctx.lineTo(hx, hy + 2.9); ctx.lineTo(hx + 1.6, hy + 1.9); ctx.fill();
        ctx.fillStyle = '#ffe9a8'; ctx.fillRect(hx - 0.3, hy + 0.7, 0.6, 0.6);
        for (const [tx, s, c] of [[x0 + 1.2, 1.05, '#5f8a52'], [x0 + 3.8, 0.85, '#6f9a5c'], [cx + 1.6, 0.9, '#5a8550'], [x1 - 0.8, 1.1, '#6c955c']]) {
          ctx.fillStyle = '#6d5a48'; ctx.fillRect(tx - 0.12, walk(tx), 0.24, 3 * s); blob(ctx, tx, walk(tx) + 3.8 * s, 1.45 * s, c);
        }
        for (let k = 0; k < 6; k++) { const fx = x0 + 0.6 + k * 1.9; ctx.fillStyle = k % 2 ? '#e88aa0' : '#f3d36b'; ctx.beginPath(); ctx.arc(fx, walk(fx) + 0.35, 0.16, 0, TAU); ctx.fill(); }
        break;
      }
      case 'hillside-park': {
        const top = (x) => walk(x) + 4.8 + Math.sin((x - x0) * 0.6) * 0.4;
        ctx.fillStyle = '#86ad6c'; ctx.beginPath(); ctx.moveTo(x0, walk(x0));
        for (let x = x0; x <= x1 + 0.01; x += 0.5) ctx.lineTo(x, top(x));
        ctx.lineTo(x1, walk(x1)); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = '#b8ab95'; ctx.lineWidth = 0.3;
        for (let k = 1; k <= 3; k++) { const a = x0 + 0.6, b = x1 - 0.6; line(ctx, a, walk(a) + k * 1.1, b, walk(b) + k * 1.1); }
        for (let k = 0; k < 12; k++) { const fx = x0 + 1 + k * 1.55, fy = walk(fx) + 1.1 * (1 + (k % 3)) + 0.3; ctx.fillStyle = k % 2 ? '#e88aa0' : '#f6c9d4'; ctx.beginPath(); ctx.arc(fx, fy, 0.17, 0, TAU); ctx.fill(); }
        ctx.fillStyle = '#4f6b45';
        for (const tx of [x0 + 2.5, cx - 2.5, cx + 3.5, x1 - 2]) { const y = walk(tx) + 0.6; ctx.beginPath(); ctx.moveTo(tx - 0.75, y); ctx.lineTo(tx, y + 6.2); ctx.lineTo(tx + 0.75, y); ctx.fill(); }
        const by = walk(cx) + 2.25;
        ctx.fillStyle = '#7a5a3a'; ctx.fillRect(cx - 0.9, by + 0.4, 1.8, 0.14); ctx.fillRect(cx - 0.8, by, 0.1, 0.4); ctx.fillRect(cx + 0.7, by, 0.1, 0.4);
        break;
      }
      case 'winding-street-backdrop': { // seen across the valley: smaller and hazed
        const b0 = walk(cx) + 1.2, top = b0 + 6.2, half = 7.5;
        ctx.fillStyle = '#a9c995'; ctx.beginPath(); ctx.moveTo(cx - half - 4, walk(cx - half - 4)); ctx.lineTo(cx - half + 1, top); ctx.lineTo(cx + half - 1, top); ctx.lineTo(cx + half + 4, walk(cx + half + 4)); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = '#cf9c88'; ctx.lineWidth = 0.42; ctx.lineJoin = 'round'; ctx.beginPath();
        const n = 8; ctx.moveTo(cx - 1.6, top);
        for (let k = 0; k <= n; k++) { const y = top - ((top - b0) * k) / n, sx = k % 2 ? cx + 2.6 : cx - 2.6; ctx.quadraticCurveTo(sx + (k % 2 ? 1 : -1), y + 0.35, sx, y); }
        ctx.stroke();
        for (let k = 0; k < n; k++) {
          const y = top - ((top - b0) * (k + 0.5)) / n;
          ctx.fillStyle = '#f2b3c0'; ctx.beginPath(); ctx.ellipse(cx + (k % 2 ? -0.8 : 0.8), y, 0.95, 0.2, 0, 0, TAU); ctx.fill();
          ctx.fillStyle = '#93bb80'; ctx.fillRect(cx - 3.0, y - 0.15, 0.32, 0.32); ctx.fillRect(cx + 2.7, y - 0.15, 0.32, 0.32);
        }
        for (let k = 0; k < 4; k++) { ctx.fillStyle = PASTELS[(k * 3) % PASTELS.length]; const hx = cx - 7 + k * 3.6; ctx.fillRect(hx, top - 0.1, 3, 2.3 + (k % 2) * 0.6); ctx.fillStyle = '#b5cad6'; ctx.fillRect(hx + 0.5, top + 0.9, 0.6, 0.7); ctx.fillRect(hx + 1.8, top + 0.9, 0.6, 0.7); }
        ctx.fillStyle = 'rgba(214,228,236,0.28)'; ctx.beginPath(); ctx.moveTo(cx - half - 4, walk(cx - half - 4)); ctx.lineTo(cx - half + 1, top + 3.2); ctx.lineTo(cx + half - 1, top + 3.2); ctx.lineTo(cx + half + 4, walk(cx + half + 4)); ctx.closePath(); ctx.fill();
        break;
      }
      default: break;
    }
    // name plaque post (the text is drawn in screen space)
    const px = x0 + 1.1, py = walk(px) - 0.05;
    ctx.fillStyle = '#3d3a42'; ctx.fillRect(px - 0.05, py, 0.1, 2.1);
    ctx.fillStyle = '#2f6d4f'; rrect(ctx, px - 1.6, py + 1.75, 3.2, 0.8, 0.12); ctx.fill();
  }
  // Delivery 2 venue: a garden wedding with an arch, chairs, the couple and the planner.
  function drawVenue(ctx, C, T, time, cheer) {
    const V = C.venue, y = (x) => T.height(x) + ROAD.walk, ax = V.arch, gy = y(ax);
    ctx.fillStyle = '#9cc47f'; ctx.beginPath(); ctx.moveTo(V.x0, y(V.x0) - 0.2); ctx.lineTo(V.x1, y(V.x1) - 0.2); ctx.lineTo(V.x1, gy + 3.2); ctx.lineTo(V.x0, gy + 3.2); ctx.fill();
    ctx.strokeStyle = '#f6ecd9'; ctx.lineWidth = 0.04; ctx.beginPath(); ctx.moveTo(V.x0, gy + 4.6);
    for (let x = V.x0; x <= V.x1; x += 1.5) ctx.quadraticCurveTo(x + 0.75, gy + 4.2, x + 1.5, gy + 4.6);
    ctx.stroke();
    for (let x = V.x0 + 0.75; x < V.x1; x += 1.5) { ctx.fillStyle = ['#fff3c4', '#f9c6d0', '#cfe6f2'][Math.floor(x) % 3]; ctx.beginPath(); ctx.arc(x, gy + 4.38, 0.09, 0, TAU); ctx.fill(); }
    for (let x = V.x0 + 1; x < V.x1 - 0.5; x += 0.9) {
      if (Math.abs(x - ax) < 3.4) continue;
      const cy = y(x) + 0.35 + Math.abs(x - ax) * 0.012;
      ctx.fillStyle = '#ffffff'; ctx.fillRect(x - 0.2, cy, 0.4, 0.06); ctx.fillRect(x + 0.14, cy, 0.06, 0.5); ctx.fillRect(x - 0.2, cy - 0.35, 0.05, 0.35); ctx.fillRect(x + 0.15, cy - 0.35, 0.05, 0.35);
      if (Math.floor(x * 1.7) % 3 !== 0) { // a guest
        const arm = cheer ? 0.35 + Math.sin(time * 9 + x) * 0.15 : 0;
        ctx.fillStyle = PASTELS[Math.floor(x * 3) % PASTELS.length]; rrect(ctx, x - 0.17, cy + 0.06, 0.34, 0.5, 0.08); ctx.fill();
        ctx.fillStyle = ['#e0b48c', '#8d5a3b', '#f0c8a0', '#c98b5e'][Math.floor(x * 5) % 4]; ctx.beginPath(); ctx.arc(x, cy + 0.72, 0.13, 0, TAU); ctx.fill();
        if (cheer) { ctx.strokeStyle = ctx.fillStyle; ctx.lineWidth = 0.06; line(ctx, x - 0.15, cy + 0.45, x - 0.3, cy + 0.75 + arm); line(ctx, x + 0.15, cy + 0.45, x + 0.3, cy + 0.75 + arm); }
      }
    }
    ctx.strokeStyle = '#fbf6ee'; ctx.lineWidth = 0.14; line(ctx, ax - 1.6, gy, ax - 1.6, gy + 2.6); line(ctx, ax + 1.6, gy, ax + 1.6, gy + 2.6);
    ctx.beginPath(); ctx.arc(ax, gy + 2.6, 1.6, Math.PI, 0, true); ctx.stroke();
    for (let k = 0; k <= 12; k++) { const a = Math.PI - (k * Math.PI) / 12; ctx.fillStyle = k % 2 ? '#f39bb0' : '#fff5f7'; ctx.beginPath(); ctx.arc(ax + Math.cos(a) * 1.6, gy + 2.6 + Math.sin(a) * 1.6, 0.2, 0, TAU); ctx.fill(); }
    ctx.fillStyle = '#7fa66b'; for (let k = 0; k < 6; k++) { ctx.beginPath(); ctx.arc(ax + (k < 3 ? -1.6 : 1.6), gy + 0.4 + (k % 3) * 0.8, 0.22, 0, TAU); ctx.fill(); }
    const bob = cheer ? Math.abs(Math.sin(time * 8)) * 0.12 : 0;
    // bride (left of the arch) and groom (right)
    ctx.fillStyle = '#fffdf8'; ctx.beginPath(); ctx.moveTo(ax - 1.3, gy); ctx.lineTo(ax - 0.65, gy); ctx.lineTo(ax - 0.85, gy + 1.15 + bob); ctx.lineTo(ax - 1.1, gy + 1.15 + bob); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#f0c8a0'; ctx.beginPath(); ctx.arc(ax - 0.97, gy + 1.38 + bob, 0.16, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.beginPath(); ctx.moveTo(ax - 1.08, gy + 1.5 + bob); ctx.lineTo(ax - 1.45, gy + 0.6 + bob); ctx.lineTo(ax - 0.95, gy + 1.55 + bob); ctx.fill();
    ctx.fillStyle = '#2d2a32'; ctx.fillRect(ax + 0.7, gy, 0.12, 0.75); ctx.fillRect(ax + 0.95, gy, 0.12, 0.75); rrect(ctx, ax + 0.62, gy + 0.7, 0.5, 0.6 + bob, 0.08); ctx.fill();
    ctx.fillStyle = '#ffffff'; ctx.fillRect(ax + 0.82, gy + 1.0, 0.1, 0.28 + bob);
    ctx.fillStyle = '#c98b5e'; ctx.beginPath(); ctx.arc(ax + 0.87, gy + 1.48 + bob, 0.16, 0, TAU); ctx.fill();
    ctx.fillStyle = '#3b2a20'; ctx.beginPath(); ctx.arc(ax + 0.87, gy + 1.55 + bob, 0.165, 0.1, Math.PI - 0.1); ctx.fill();
    // the planner, clipboard ready
    const px = ax - 3.0;
    ctx.fillStyle = '#4a4a55'; ctx.fillRect(px - 0.1, gy, 0.09, 0.75); ctx.fillRect(px + 0.03, gy, 0.09, 0.75);
    ctx.fillStyle = '#c2584a'; rrect(ctx, px - 0.2, gy + 0.72, 0.42, 0.62, 0.1); ctx.fill();
    ctx.fillStyle = '#e0b48c'; ctx.beginPath(); ctx.arc(px, gy + 1.52, 0.15, 0, TAU); ctx.fill();
    ctx.fillStyle = '#2a1f1a'; ctx.beginPath(); ctx.arc(px, gy + 1.58, 0.16, Math.PI * 0.95, Math.PI * 2.05); ctx.fill(); ctx.beginPath(); ctx.arc(px - 0.14, gy + 1.62, 0.08, 0, TAU); ctx.fill();
    ctx.fillStyle = '#d9c7a6'; ctx.fillRect(px + 0.18, gy + 0.95, 0.26, 0.34); ctx.fillStyle = '#ffffff'; ctx.fillRect(px + 0.21, gy + 0.98, 0.2, 0.26);
    // the cake table, waiting
    ctx.fillStyle = '#fbf6ee'; ctx.fillRect(ax + 2.3, gy + 0.75, 1.5, 0.12); ctx.fillRect(ax + 2.4, gy, 0.08, 0.75); ctx.fillRect(ax + 3.6, gy, 0.08, 0.75);
  }

  // Construction A-frame ramp: plywood deck on posts, hazard stripes, steel lip.
  function drawRamp(ctx, r) {
    const P = r.pts, at = (a, b, u) => [lerp(P[a][0], P[b][0], u), lerp(P[a][1], P[b][1], u)];
    ctx.fillStyle = '#5f5a55';
    for (const u of [0.35, 0.7]) { const p = at(0, 1, u); ctx.fillRect(p[0] - 0.05, p[1] - (p[1] - P[0][1]), 0.1, p[1] - P[0][1]); }
    { const p = at(2, 3, 0.45); ctx.fillRect(p[0] - 0.05, P[3][1], 0.1, p[1] - P[3][1]); }
    ctx.beginPath(); ctx.moveTo(P[0][0], P[0][1]); for (let i = 1; i < 4; i++) ctx.lineTo(P[i][0], P[i][1]); ctx.closePath();
    ctx.fillStyle = 'rgba(200,155,98,0.35)'; ctx.fill();
    ctx.save(); ctx.clip();
    ctx.fillStyle = '#f28c28';
    for (let x = P[0][0] - 2; x < P[3][0] + 1; x += 0.7) { ctx.beginPath(); ctx.moveTo(x, P[0][1] - 0.2); ctx.lineTo(x + 0.35, P[0][1] - 0.2); ctx.lineTo(x + 0.75, P[0][1] + 0.5); ctx.lineTo(x + 0.4, P[0][1] + 0.5); ctx.fill(); }
    ctx.restore();
    ctx.strokeStyle = '#a8794a'; ctx.lineWidth = 0.12; ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.moveTo(P[0][0], P[0][1]); for (let i = 1; i < 4; i++) ctx.lineTo(P[i][0], P[i][1]); ctx.stroke();
    ctx.strokeStyle = '#d9b07a'; ctx.lineWidth = 0.04;
    ctx.beginPath(); ctx.moveTo(P[0][0], P[0][1] + 0.04); ctx.lineTo(P[1][0], P[1][1] + 0.04); ctx.stroke();
    ctx.strokeStyle = '#9aa0a6'; ctx.lineWidth = 0.07; line(ctx, P[1][0], P[1][1] + 0.02, P[2][0], P[2][1] + 0.02);
  }
  // Cross traffic is seen end-on: depth z maps to a vertical offset and a scale.
  function crossDepth(z) { return { s: clamp(1 / (1 + 0.06 * z), 0.45, 1.6), dy: z <= LANE.far ? (z < 0 ? z * 0.3 : (z * ROAD.far) / LANE.far) : ROAD.far + (z - LANE.far) * 0.22 }; }
  function crosserView(cc) {
    const zf = Math.max(cc.z, LANE.near - 0.5), zb = cc.z + cc.P.len;
    return { zf, alpha: clamp((zb - (LANE.near - 3.2)) / 2.6, 0, 1) };
  }
  function drawCrosser(ctx, cc, t) {
    if (cc.state === 'DONE') return;
    const v = crosserView(cc);
    if (v.alpha <= 0.01) return;
    const d = crossDepth(v.zf), s = d.s, x = cc.cx, y = cc.y + d.dy, P = cc.P, W = P.width, H = P.height;
    ctx.save(); ctx.globalAlpha = v.alpha; ctx.translate(x, y); ctx.scale(s, s);
    const rumble = cc.active && cc.v > 0.5 ? Math.sin(t * 40) * 0.015 : 0;
    ctx.translate(0, rumble);
    ctx.fillStyle = 'rgba(30,28,34,0.28)'; ctx.beginPath(); ctx.ellipse(0, 0.02, W * 0.55, 0.12, 0, 0, TAU); ctx.fill();
    cc.sign_ = cc.sign_ || { x: 0, y: 0, s: 1 };
    if (cc.kind === 'cablecar') {
      ctx.fillStyle = '#2b2a30'; ctx.fillRect(-1.0, 0, 0.32, 0.32); ctx.fillRect(0.68, 0, 0.32, 0.32);
      ctx.fillStyle = '#9e3b2f'; rrect(ctx, -1.2, 0.3, 2.4, 1.25, 0.08); ctx.fill();
      ctx.fillStyle = '#c9a24a'; ctx.fillRect(-1.2, 1.0, 2.4, 0.06);
      ctx.fillStyle = '#efe3c8'; ctx.fillRect(-1.15, 1.55, 2.3, 1.15);
      ctx.fillStyle = '#7d9fb2'; ctx.fillRect(-1.0, 1.75, 0.85, 0.8); ctx.fillRect(0.15, 1.75, 0.85, 0.8);
      ctx.fillStyle = '#6b4a3a'; ctx.beginPath(); ctx.moveTo(-1.32, 2.7); ctx.quadraticCurveTo(0, 3.15, 1.32, 2.7); ctx.lineTo(1.32, 2.62); ctx.lineTo(-1.32, 2.62); ctx.fill();
      ctx.fillStyle = '#2d2a32'; rrect(ctx, -0.9, 2.86, 1.8, 0.42, 0.06); ctx.fill();
      ctx.fillStyle = '#e2b84a'; ctx.beginPath(); ctx.arc(0.98, 3.0, 0.12 + (cc.bellT > 1.2 ? 0.03 : 0), 0, TAU); ctx.fill();
      ctx.fillStyle = cc.active ? '#ffe9a8' : '#c9c1a8'; ctx.beginPath(); ctx.arc(0, 1.25, 0.17, 0, TAU); ctx.fill();
      if (cc.active) { ctx.fillStyle = 'rgba(255,233,168,0.25)'; ctx.beginPath(); ctx.arc(0, 1.25, 0.42, 0, TAU); ctx.fill(); }
      ctx.fillStyle = '#d8cdb2'; ctx.fillRect(-1.3, 0.28, 2.6, 0.08);
      // the operator (gripman) on the front platform
      const wave = cc.held || cc.angry > 0 ? Math.sin(t * 16) * 0.3 : Math.sin(t * 3) * 0.05;
      ctx.fillStyle = '#2f3f66'; rrect(ctx, -0.55, 1.15, 0.5, 0.75, 0.1); ctx.fill();
      ctx.fillStyle = '#c98b5e'; ctx.beginPath(); ctx.arc(-0.3, 2.08, 0.17, 0, TAU); ctx.fill();
      ctx.fillStyle = '#23304f'; ctx.fillRect(-0.5, 2.18, 0.4, 0.1); ctx.fillRect(-0.45, 2.2, 0.32, 0.1);
      ctx.fillStyle = '#2d2a32'; ctx.beginPath(); ctx.arc(-0.24, 2.08, 0.025, 0, TAU); ctx.arc(-0.36, 2.08, 0.025, 0, TAU); ctx.fill();
      ctx.strokeStyle = '#2f3f66'; ctx.lineWidth = 0.1; ctx.lineCap = 'round'; line(ctx, -0.08, 1.8, 0.2, 2.15 + wave);
      ctx.strokeStyle = '#6b6870'; ctx.lineWidth = 0.06; line(ctx, 0.3, 0.9, 0.18, 1.85);
      for (const sx of [-1.36, 1.36]) { // passengers hanging off the side, as one does
        ctx.fillStyle = sx < 0 ? '#4fb3a9' : '#e8604c'; rrect(ctx, sx - 0.13, 1.05, 0.26, 0.55, 0.08); ctx.fill();
        ctx.fillStyle = '#f0c8a0'; ctx.beginPath(); ctx.arc(sx, 1.78, 0.12, 0, TAU); ctx.fill();
      }
      cc.sign_.x = x; cc.sign_.y = y + 3.07 * s; cc.sign_.s = s;
    } else {
      ctx.fillStyle = '#2b2a30'; ctx.fillRect(-0.85, 0, 0.3, 0.34); ctx.fillRect(0.55, 0, 0.3, 0.34);
      ctx.fillStyle = '#f6f5f1'; rrect(ctx, -0.92, 0.25, 1.84, 0.85, 0.22); ctx.fill();
      ctx.strokeStyle = '#9b97a0'; ctx.lineWidth = 0.03; ctx.stroke();
      ctx.fillStyle = '#f6f5f1'; ctx.beginPath(); ctx.moveTo(-0.78, 1.05); ctx.lineTo(-0.6, 1.5); ctx.lineTo(0.6, 1.5); ctx.lineTo(0.78, 1.05); ctx.fill();
      ctx.fillStyle = '#3b4a5a'; ctx.beginPath(); ctx.moveTo(-0.68, 1.08); ctx.lineTo(-0.54, 1.42); ctx.lineTo(0.54, 1.42); ctx.lineTo(0.68, 1.08); ctx.fill();
      ctx.fillStyle = COL.teal; ctx.beginPath(); ctx.ellipse(0, 1.58, 0.24, 0.09, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = 'rgba(120,230,220,' + (0.5 + 0.5 * Math.sin(t * 9)).toFixed(2) + ')'; ctx.fillRect(-0.05 + Math.sin(t * 6) * 0.12, 1.6, 0.08, 0.05);
      const worried = cc.state === 'THINKING' || cc.state === 'BRAKING' || cc.state === 'STOPPED';
      for (const ex of [-0.55, 0.55]) {
        ctx.fillStyle = '#ffe9a8'; ctx.beginPath(); ctx.arc(ex, 0.72, 0.17, 0, TAU); ctx.fill();
        ctx.fillStyle = COL.ink; ctx.beginPath(); ctx.arc(ex + (worried ? Math.sin(t * 5) * 0.06 : 0), 0.7 + (worried ? 0.03 : 0), 0.07, 0, TAU); ctx.fill();
      }
      ctx.strokeStyle = COL.ink; ctx.lineWidth = 0.04; ctx.beginPath();
      if (worried) { ctx.moveTo(-0.28, 0.45); ctx.quadraticCurveTo(-0.14, 0.52, 0, 0.45); ctx.quadraticCurveTo(0.14, 0.38, 0.28, 0.45); }
      else ctx.arc(0, 0.6, 0.25, Math.PI * 1.2, Math.PI * 1.8);
      ctx.stroke();
      ctx.fillStyle = '#e04646'; if (cc.state === 'BRAKING' || cc.state === 'STOPPED') { ctx.fillRect(-0.92, 0.88, 0.14, 0.1); ctx.fillRect(0.78, 0.88, 0.14, 0.1); }
      ctx.fillStyle = '#2d2a32'; rrect(ctx, -0.62, 1.78, 1.24, 0.34, 0.05); ctx.fill();
      cc.sign_.x = x; cc.sign_.y = y + 1.95 * s; cc.sign_.s = s;
    }
    ctx.restore();
  }

  function drawBubbleWrap(ctx, x, y, w, h, t) {
    ctx.fillStyle = 'rgba(214,236,248,0.42)'; rrect(ctx, x, y, w, h, Math.min(w, h) * 0.25); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 0.014; ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    for (let by = y + 0.05; by < y + h - 0.03; by += 0.075) for (let bx = x + 0.05 + ((by * 13) % 2) * 0.03; bx < x + w - 0.03; bx += 0.075) { ctx.beginPath(); ctx.arc(bx, by, 0.022, 0, TAU); ctx.fill(); }
  }
  function drawPowerup(ctx, pu, t) {
    const y = pu.y + Math.sin(t * 3 + pu.x) * 0.08, x = pu.x, pulse = 1 + Math.sin(t * 5 + pu.x) * 0.06;
    ctx.save(); ctx.translate(x, y); ctx.scale(pulse, pulse);
    ctx.fillStyle = pu.kind === 'bubble' ? 'rgba(159,211,240,0.35)' : 'rgba(242,177,52,0.35)'; ctx.beginPath(); ctx.arc(0, 0, 0.5, 0, TAU); ctx.fill();
    ctx.strokeStyle = COL.cream; ctx.lineWidth = 0.04; ctx.beginPath(); ctx.arc(0, 0, 0.5, 0, TAU); ctx.stroke();
    if (pu.kind === 'bubble') {
      ctx.rotate(Math.sin(t * 2) * 0.15);
      drawBubbleWrap(ctx, -0.3, -0.24, 0.6, 0.48, t);
      ctx.strokeStyle = COL.ink; ctx.lineWidth = 0.02; rrect(ctx, -0.3, -0.24, 0.6, 0.48, 0.1); ctx.stroke();
    } else {
      ctx.fillStyle = '#f4efe4'; ctx.beginPath(); ctx.ellipse(0, -0.2, 0.3, 0.06, 0, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.moveTo(-0.17, -0.17); ctx.lineTo(-0.13, 0.12); ctx.lineTo(0.13, 0.12); ctx.lineTo(0.17, -0.17); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = COL.ink; ctx.lineWidth = 0.02; ctx.stroke();
      ctx.strokeStyle = '#f4efe4'; ctx.lineWidth = 0.04; ctx.beginPath(); ctx.arc(0.19, -0.03, 0.06, -1.4, 1.4); ctx.stroke();
      ctx.fillStyle = '#5a3420'; ctx.beginPath(); ctx.ellipse(0, 0.11, 0.13, 0.03, 0, 0, TAU); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 0.025;
      for (let k = -1; k <= 1; k += 2) { ctx.beginPath(); ctx.moveTo(k * 0.05, 0.17); ctx.quadraticCurveTo(k * 0.05 + Math.sin(t * 6 + k) * 0.06, 0.26, k * 0.05, 0.36); ctx.stroke(); }
      ctx.fillStyle = COL.mustard; ctx.beginPath(); ctx.moveTo(0.26, 0.34); ctx.lineTo(0.18, 0.2); ctx.lineTo(0.25, 0.2); ctx.lineTo(0.2, 0.08); ctx.lineTo(0.32, 0.24); ctx.lineTo(0.25, 0.24); ctx.closePath(); ctx.fill();
    }
    ctx.restore();
  }
  // The wedding cake on the rear rack, in bike-local coordinates. Positive angle leans it back.
  const CAKE_TIERS = [{ w: 0.5, h: 0.2 }, { w: 0.38, h: 0.17 }, { w: 0.27, h: 0.14 }];
  function drawCakeShape(ctx, cake, t, flying) {
    const dmg = clamp(1 - cake.amount / 100, 0, 1), lag = flying ? 0 : (cake.top - cake.angle);
    ctx.fillStyle = '#d7dadf'; ctx.fillRect(-0.31, -0.035, 0.62, 0.035);
    let y = 0;
    for (let i = 0; i < 3; i++) {
      const T = CAKE_TIERS[i];
      if (i === 2 && cake.amount < 12) break; // the top tier has left the building
      ctx.save();
      ctx.translate(0, y);
      const slump = i === 0 ? 0 : dmg * dmg * 0.06 * i * (i === 2 && cake.amount < 35 ? 3 : 1);
      ctx.rotate(lag * 0.45 * i + (i === 2 && cake.amount < 35 ? 0.18 : 0));
      ctx.translate(slump, 0);
      ctx.fillStyle = '#fbf3e6'; rrect(ctx, -T.w / 2, 0, T.w, T.h, 0.025); ctx.fill();
      ctx.strokeStyle = 'rgba(160,140,120,0.45)'; ctx.lineWidth = 0.008; ctx.stroke();
      ctx.fillStyle = '#f3a7b8'; ctx.fillRect(-T.w / 2, T.h * 0.18, T.w, 0.022);
      ctx.fillStyle = '#ffffff';
      for (let k = 0; k < 6; k++) { const dx = -T.w / 2 + (T.w * (k + 0.5)) / 6; ctx.beginPath(); ctx.arc(dx, T.h - 0.002, T.w / 12, Math.PI, 0); ctx.fill(); ctx.fillRect(dx - 0.008, T.h - 0.05 - (k % 2) * 0.025, 0.016, 0.05); }
      if (dmg > 0.12) { // frosting smears
        ctx.strokeStyle = 'rgba(205,130,150,' + clamp((dmg - 0.12) * 1.5, 0, 0.8).toFixed(2) + ')'; ctx.lineWidth = 0.03; ctx.lineCap = 'round';
        line(ctx, -T.w * 0.4, T.h * 0.7, -T.w * 0.05, T.h * 0.35); if (dmg > 0.4) line(ctx, T.w * 0.1, T.h * 0.8, T.w * 0.42, T.h * 0.3);
      }
      if (dmg > 0.45 && i === 1) { ctx.strokeStyle = 'rgba(120,90,70,0.6)'; ctx.lineWidth = 0.008; ctx.beginPath(); ctx.moveTo(-0.05, T.h); ctx.lineTo(-0.02, T.h * 0.6); ctx.lineTo(-0.07, T.h * 0.3); ctx.stroke(); }
      for (const d of cake.decor) {
        if (!d.on || d.tier !== i) continue;
        ctx.fillStyle = '#e8708a'; ctx.beginPath(); ctx.arc(d.x * T.w * 1.6, T.h * 0.55, 0.035, 0, TAU); ctx.fill();
        ctx.fillStyle = '#b84a66'; ctx.beginPath(); ctx.arc(d.x * T.w * 1.6, T.h * 0.55, 0.014, 0, TAU); ctx.fill();
        ctx.fillStyle = '#7fa66b'; ctx.beginPath(); ctx.ellipse(d.x * T.w * 1.6 + 0.035, T.h * 0.5, 0.02, 0.01, 0.5, 0, TAU); ctx.fill();
      }
      if (i === 2) { // cake topper
        for (const d of cake.decor) {
          if (!d.on || d.tier !== 3) continue;
          const fx = d.x * 1.2, fy = T.h;
          if (d.kind === 'groom') { ctx.fillStyle = '#2d2a32'; ctx.fillRect(fx - 0.018, fy, 0.036, 0.09); ctx.fillStyle = '#c98b5e'; ctx.beginPath(); ctx.arc(fx, fy + 0.11, 0.019, 0, TAU); ctx.fill(); }
          else { ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.moveTo(fx - 0.03, fy); ctx.lineTo(fx + 0.03, fy); ctx.lineTo(fx + 0.012, fy + 0.085); ctx.lineTo(fx - 0.012, fy + 0.085); ctx.fill(); ctx.fillStyle = '#f0c8a0'; ctx.beginPath(); ctx.arc(fx, fy + 0.105, 0.018, 0, TAU); ctx.fill(); }
        }
      }
      ctx.restore();
      y += T.h;
    }
  }
  function drawCakeOnRack(ctx, cake, t) {
    ctx.save(); ctx.translate(CAKE.mountX, CAKE.mountY + 0.035); ctx.rotate(cake.angle);
    drawCakeShape(ctx, cake, t, false);
    if (cake.shield) drawBubbleWrap(ctx, -0.33, -0.03, 0.66, 0.6, t);
    ctx.restore();
    const ca = Math.cos(cake.angle), sa = Math.sin(cake.angle), top = (lx, ly) => [CAKE.mountX + 0.035 * -sa + lx * ca - ly * sa, CAKE.mountY + 0.035 * ca + lx * sa + ly * ca];
    ctx.lineCap = 'round'; ctx.lineWidth = 0.016;
    const a = top(-0.24, 0.19), b = top(0.24, 0.19);
    ctx.strokeStyle = '#d64545'; ctx.beginPath(); ctx.moveTo(-0.8, -0.3); ctx.quadraticCurveTo(a[0] - 0.05, a[1] + 0.05, b[0], b[1]); ctx.stroke();
    ctx.strokeStyle = '#2d2a32'; ctx.beginPath(); ctx.moveTo(-0.36, -0.3); ctx.quadraticCurveTo(b[0] + 0.05, b[1] + 0.05, a[0], a[1]); ctx.stroke();
  }
  function drawFlyingCake(ctx, x, y, a, cake, t) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(a); ctx.translate(0, -0.25);
    drawCakeShape(ctx, cake, t, true);
    ctx.restore();
  }
  // Bouquet in the basket: one bloom per 20% of petals left, so losses show as bare stems.
  function drawBouquet(ctx, bq, t) {
    ctx.save(); ctx.translate(0.63, -0.1); ctx.rotate(bq.tilt || 0);
    const blooms = Math.max(0, Math.ceil(bq.amount / 20)), sway = Math.sin(t * 3) * 0.02;
    const heads = [[-0.1, 0.42], [-0.02, 0.5], [0.07, 0.44], [0, 0.36], [-0.12, 0.34]];
    ctx.strokeStyle = '#4f8a5b'; ctx.lineWidth = 0.018;
    heads.forEach(([x, y]) => line(ctx, 0, 0.02, x + sway, y - 0.03));
    heads.forEach(([x, y], i) => {
      if (i >= blooms) return;
      ctx.fillStyle = '#f29ab0';
      for (let k = 0; k < 5; k++) { const a = k * TAU / 5 + i; ctx.beginPath(); ctx.arc(x + sway + Math.cos(a) * 0.035, y + Math.sin(a) * 0.035, 0.03, 0, TAU); ctx.fill(); }
      ctx.fillStyle = '#f2b33d'; ctx.beginPath(); ctx.arc(x + sway, y, 0.018, 0, TAU); ctx.fill();
    });
    ctx.fillStyle = '#d64545'; rrect(ctx, -0.14, 0, 0.28, 0.05, 0.02); ctx.fill();
    ctx.restore();
  }
  // Disco ball (F-39): a mirror-tiled ball rolling in an open crate on the rack. Missing tiles are dark squares.
  function drawDiscoBall(ctx, r, spin, left, t) {
    ctx.save(); ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.clip();
    ctx.fillStyle = '#9aa8b8'; ctx.fillRect(-r, -r, 2 * r, 2 * r);
    const cols = 6, rows = 4, cw = (2 * r) / cols * 1.25, rh = (2 * r) / rows, off = ((spin * r) % cw + cw) % cw;
    for (let j = 0; j < rows; j++) for (let i = -1; i <= cols; i++) {
      const k = j * cols + ((i % cols) + cols) % cols, x = -r + i * cw - off, y = -r + j * rh;
      ctx.fillStyle = k >= left ? '#2d2a32' : (i + j + Math.floor(t * 3)) % 3 === 0 ? '#ffffff' : (i + j) % 2 ? '#dbe3ec' : '#b9c7d6';
      ctx.fillRect(x + 0.004, y + 0.004, cw - 0.008, rh - 0.008);
    }
    ctx.restore();
    ctx.strokeStyle = '#2d2a32'; ctx.lineWidth = 0.012; ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.beginPath(); ctx.arc(-r * 0.4, r * 0.45, r * 0.18, 0, TAU); ctx.fill(); // highlight (y is up)
  }
  function drawDiscoInCrate(ctx, c, t) {
    const D = DISCO, w = D.half + D.r + 0.02, hop = c.air > 0 ? Math.sin((1 - c.air / D.airTime) * Math.PI) * 0.45 : 0;
    ctx.save(); ctx.translate(D.mountX, D.mountY + 0.03);
    ctx.fillStyle = '#c99a5b'; ctx.strokeStyle = '#7a5530'; ctx.lineWidth = 0.014;
    rrect(ctx, -w, 0, 2 * w, 0.05, 0.01); ctx.fill(); ctx.stroke();                 // crate floor
    for (const sx of [-1, 1]) { rrect(ctx, sx * w - 0.02, 0, 0.04, 0.17, 0.01); ctx.fill(); ctx.stroke(); } // low walls
    ctx.save(); ctx.translate(c.p, 0.05 + D.r + hop); ctx.rotate(-c.spin);
    drawDiscoBall(ctx, D.r, 0, c.tilesLeft(), t);
    ctx.restore();
    if (c.shield) drawBubbleWrap(ctx, -w, 0, 2 * w, 0.3, t);
    ctx.restore();
  }
  function drawFlyingDisco(ctx, x, y, a, c, t) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(a * 2);
    drawDiscoBall(ctx, DISCO.r, 0, c ? c.tilesLeft() : DISCO.tiles, t || 0);
    ctx.restore();
  }
  function drawFlyingBouquet(ctx, x, y, a) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(a); ctx.translate(0, -0.25);
    ctx.fillStyle = '#f29ab0';
    for (let i = 0; i < 6; i++) { ctx.beginPath(); ctx.ellipse(Math.cos(i * 1.7) * 0.2, Math.sin(i * 2.3) * 0.15, 0.05, 0.03, i, 0, TAU); ctx.fill(); }
    ctx.restore();
  }

  // How each cargo looks and sounds (F-27). The engine half of the contract is CARGO_TYPES; this is the presentation half.
  // A new cargo adds one entry here: rack or basket drawing, crash flight, HUD icon, meters, lines, and spill effects.
  function cupBits(game, n, burst) {
    const W = game.world, b = W.bike, P = game.particles, rim = b.localToWorld(CARGO.mountX + 0.02, 0.3, { x: 0, y: 0 });
    const dir = W.cargo.lastSpillDir, ca = Math.cos(b.a), sa = Math.sin(b.a);
    for (let i = 0; i < n; i++) {
      const out = burst ? (Math.random() - 0.5) * 2.4 : dir * (0.8 + Math.random() * 1.6);
      const up = 1.2 + Math.random() * (burst ? 3 : 1.8);
      const vx = b.vx * 0.9 + out * ca - up * sa, vy = b.vy * 0.9 + out * sa + up * ca;
      if (i % 4 === 3) P.spawn(PK.FOAM, rim.x, rim.y, vx, vy, 1.4, 0.035, COL.foam);
      else P.spawn(PK.DROP, rim.x + (Math.random() - 0.5) * 0.12, rim.y, vx, vy, 1.6, 0.022 + Math.random() * 0.02, i % 2 ? '#7a4a2e' : '#8f5a38');
    }
  }
  function cakeBits(game, n, burst) {
    const W = game.world, b = W.bike, P = game.particles, rim = b.localToWorld(CAKE.mountX, 0.45, { x: 0, y: 0 });
    const dir = W.cargo.angle > 0 ? -1 : 1, ca = Math.cos(b.a), sa = Math.sin(b.a);
    for (let i = 0; i < n; i++) {
      const out = burst ? (Math.random() - 0.5) * 2.4 : dir * (0.8 + Math.random() * 1.6);
      const up = 1.2 + Math.random() * (burst ? 3 : 1.8);
      const vx = b.vx * 0.9 + out * ca - up * sa, vy = b.vy * 0.9 + out * sa + up * ca;
      const p = P.spawn(PK.DROP, rim.x + (Math.random() - 0.5) * 0.2, rim.y, vx, vy, 1.6, 0.025 + Math.random() * 0.025, i % 3 ? '#fbf3e6' : '#f3a7b8');
      p.stain = i % 3 ? 'rgba(251,243,230,0.85)' : 'rgba(243,167,184,0.8)';
    }
  }
  function petalBits(game, n, burst) {
    const W = game.world, b = W.bike, P = game.particles, rim = b.localToWorld(CARGO.mountX + 0.02, 0.4, { x: 0, y: 0 });
    const ca = Math.cos(b.a), sa = Math.sin(b.a);
    for (let i = 0; i < n; i++) {
      const out = (Math.random() - 0.5) * (burst ? 3 : 1.6), up = 0.8 + Math.random() * (burst ? 2.4 : 1.2);
      const vx = b.vx * 0.7 + out * ca - up * sa, vy = b.vy * 0.7 + out * sa + up * ca;
      P.spawn(PK.CONFETTI, rim.x + (Math.random() - 0.5) * 0.2, rim.y, vx, vy, 1.8, 0.03 + Math.random() * 0.02, i % 3 ? '#f29ab0' : '#fff2f5');
    }
  }
  function discoBits(game, n, burst) { // mirror shards
    const W = game.world, b = W.bike, P = game.particles, rim = b.localToWorld(DISCO.mountX + (W.cargo.p || 0), 0.2, { x: 0, y: 0 });
    const ca = Math.cos(b.a), sa = Math.sin(b.a);
    for (let i = 0; i < n; i++) {
      const out = (Math.random() - 0.5) * (burst ? 3 : 1.8), up = 1 + Math.random() * (burst ? 2.6 : 1.4);
      const vx = b.vx * 0.7 + out * ca - up * sa, vy = b.vy * 0.7 + out * sa + up * ca;
      P.spawn(PK.CONFETTI, rim.x, rim.y, vx, vy, 1.4, 0.025 + Math.random() * 0.015, i % 3 ? '#dbe3ec' : '#ffffff');
    }
  }
  const cupSpill = (game, e) => { game.audio.play('slosh'); game.spawnCargoBits(Math.min(9, 2 + Math.round(e.amount * 4)), false); };
  const CARGO_VIEW = {
    coffee: {
      pose(c, cg) { cg.slosh = c.slosh; cg.sloshV = c.sloshV; cg.tilt = c.tilt; cg.level = c.level(); cg.float = c.float; return cg; },
      basket: drawCup,
      worried: (c) => Math.abs(c.slosh) > c.thr * 0.72 || c.spilling > 0.2, lookX: 0.6,
      flying: (ctx, x, y, a) => drawFlyingCup(ctx, x, y, a),
      hudIcon: (game, ctx, x, top, u, frac) => game.drawCupIcon(ctx, x, top + u * 0.55, u * 2.4, frac),
      meter: (c) => ({ label: 'SLOSH ', value: Math.abs(c.slosh) / Math.max(0.05, c.thr) }),
      debug: (c) => 'slosh ' + c.slosh.toFixed(2) + '  thr ' + c.thr.toFixed(2) + '  g ' + c.gMag.toFixed(2) + '  latte ' + c.amount.toFixed(1) + '%',
      pauseLine: 'The latte is getting cold. And judgmental.', dropLabel: ' m to the latte drop', leavesCup: true, // the cup stays in the basket when the latte flies
      arrival: { bell: true, bride: false, reviewAfter: 3.9, success: true },
      splashSound: 'splash', bits: cupBits, onSpill: cupSpill, spillLine: true, condNote: () => '',
    },
    cake: {
      venueSign: ['LOMBARD GARDENS', 'WEDDING TODAY · CAKE ENTRANCE →'], // the sign over the finish venue's arch
      pose: (c) => c,
      rack: drawCakeOnRack,
      worried: (c) => Math.abs(c.angle) > 0.22 || c.spilling > 0.2, lookX: -1,
      flying: (ctx, x, y, a, c, t) => drawFlyingCake(ctx, x, y, a, c, t),
      hudIcon: (game, ctx, x, top, u, frac) => game.drawCakeIcon(ctx, x, top + u * 0.5, u * 2.6, frac),
      meter: (c) => ({ label: 'WOBBLE ', value: Math.abs(c.angle) / CAKE.maxAngle }),
      debug: (c) => 'cake angle ' + c.angle.toFixed(2) + '  w ' + c.angVel.toFixed(2) + '  g ' + c.gMag.toFixed(2) + '  integrity ' + c.amount.toFixed(1) + '%',
      pauseLine: 'The cake is sweating. And judgmental.', dropLabel: ' m to the cake drop',
      arrival: { bell: false, bride: true, reviewAfter: 4.4, success: false },
      splashSound: 'wobble', bits: cakeBits, onSpill: (game) => { if (Math.random() < 0.5) game.spawnCargoBits(2, false); }, spillLine: false,
      condNote: (r) => (r.decorLeft !== null ? ' · ' + r.decorLeft + '/' + CAKE_DECOR.length + ' decor' : ''),
    },
    bouquet: {
      venueSign: ['TELEGRAPH BLOOMS', 'FLOWER DROP-OFF · PETALS ONLY →'],
      pose: (c) => c,
      basket: drawBouquet,
      worried: (c) => c.spilling > 0.2, lookX: 0.6,
      flying: (ctx, x, y, a) => drawFlyingBouquet(ctx, x, y, a),
      hudIcon: (game, ctx, x, top, u, frac) => game.drawBouquetIcon(ctx, x, top + u * 0.55, u * 2.4, frac),
      meter: (c) => ({ label: 'PETALS LOST ', value: (100 - c.amount) / 100 }),
      debug: (c) => 'petals ' + c.amount.toFixed(1) + '%  spilling ' + c.spilling.toFixed(2),
      pauseLine: 'The petals are holding on. Barely. And judgmental.', dropLabel: ' m to the bouquet drop',
      arrival: { bell: true, bride: false, reviewAfter: 3.9, success: true },
      splashSound: 'wobble', bits: petalBits, onSpill: (game, e) => game.spawnCargoBits(Math.min(6, 1 + Math.round(e.amount * 3)), false),
      spillLine: true, condNote: () => '',
    },
  };
  CARGO_VIEW.disco = {
    venueSign: ['THE MIRROR ROOM', 'DRAG BRUNCH TODAY · SPARKLE ENTRANCE →'],
    pose: (c) => c,
    rack: drawDiscoInCrate,
    worried: (c) => Math.abs(c.v) > 0.8 || c.air > 0 || c.spilling > 0.2, lookX: -1,
    flying: (ctx, x, y, a, c, t) => drawFlyingDisco(ctx, x, y, a, c, t),
    hudIcon: (game, ctx, x, top, u, frac) => game.drawDiscoIcon(ctx, x, top + u * 0.5, u * 2.5, frac),
    meter: (c) => ({ label: 'ROLL ', value: Math.min(1, Math.abs(c.v) / 1.4) }),
    debug: (c) => 'ball p ' + c.p.toFixed(3) + '  v ' + c.v.toFixed(2) + '  air ' + c.air.toFixed(2) + '  tiles ' + c.tilesLeft() + '/' + DISCO.tiles + '  ' + c.amount.toFixed(1) + '%',
    pauseLine: 'The disco ball is still spinning. And judgmental.', dropLabel: ' m to the sparkle drop',
    arrival: { bell: true, bride: false, reviewAfter: 3.9, success: true },
    splashSound: 'glint', bits: discoBits, onSpill: () => {}, spillLine: false, condNote: (r) => ' · ' + Math.ceil((r.condition / 100) * DISCO.tiles) + '/' + DISCO.tiles + ' tiles',
  };
  function cargoView(kind) { return CARGO_VIEW[cleanCargo(kind)]; }
  const EMPTY_RACK = {}; // nothing on the rack or in the basket

