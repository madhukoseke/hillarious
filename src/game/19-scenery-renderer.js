  /* ---------- 19. SCENERY (seeded, per course) ---------- */
  const ACCENTS = ['#6b4f7a', '#3f6f73', '#b8564a', '#5b7d4a', '#a8702f', '#4a5f8a'];
  function buildScenery(course) {
    const rng = mulberry32(course.seed || 7), T = course.terrain, houses = [], lamps = [], trees = [], street = [];
    const inI = (x0, x1) => course.intersections.some((I) => x1 > I.x0 - 0.6 && x0 < I.x1 + 0.6);
    const lm = (x0, x1) => course.landmarks.some((L) => x1 > L.x0 - 0.4 && x0 < L.x1 + 0.4);
    const venue = (x0, x1) => course.venue && x1 > course.venue.x0 - 1 && x0 < course.venue.x1 + 2;
    const blocked = (x0, x1) => inI(x0, x1) || lm(x0, x1) || venue(x0, x1) || (course.park && x1 > course.park.x0 && x0 < course.park.x1) || (course.office && x1 > course.office.x0 - 0.5 && x0 < course.office.x1 + 0.5);
    const endX = Math.min(T.maxX + 60, (course.doorX < 1e8 ? course.doorX : T.maxX) + 120);
    let x = T.minX - 10;
    while (x < endX) {
      const w = 5.8 + rng() * 2.8;
      if (blocked(x, x + w)) { x += 0.8; continue; }
      const sw0 = T.height(x) + ROAD.walk, sw1 = T.height(x + w) + ROAD.walk;
      houses.push({
        x0: x, x1: x + w, base: Math.max(sw0, sw1), h: 6.2 + rng() * 3.2, color: PASTELS[(rng() * PASTELS.length) | 0],
        trim: TRIMS[(rng() * TRIMS.length) | 0], door: DOORS[(rng() * DOORS.length) | 0], bay: rng() < 0.55, floors: rng() < 0.35 ? 3 : 2,
        gable: rng() < 0.3, downhill: sw1 < sw0, accent: ACCENTS[(rng() * ACCENTS.length) | 0],
      });
      x += w + 0.12 + rng() * 0.25;
    }
    for (let lx = T.minX + 6; lx < endX; lx += 16) if (!inI(lx - 1, lx + 1) && !venue(lx, lx) && !(course.office && lx > course.office.x0 - 1 && lx < course.office.x1 + 1)) lamps.push(lx);
    if (course.park) for (let tx = course.park.x0 + 2; tx < course.park.x1 - 1; tx += 4.2 + rng() * 2.5) trees.push({ x: tx, s: 0.8 + rng() * 0.5, c: ['#7fa66b', '#6c955c', '#8db57a'][(rng() * 3) | 0] });
    if (course.streetTrees) for (let tx = course.start + 8; tx < endX; tx += 9 + rng() * 5) if (!inI(tx - 1.5, tx + 1.5) && !venue(tx, tx)) street.push({ x: tx, s: 0.55 + rng() * 0.25, c: ['#6f9a5c', '#7fa66b', '#5f8a52'][(rng() * 3) | 0] });
    return { houses, lamps, trees, street };
  }

  /* ---------- 20. RENDERER ---------- */
  class Renderer {
    constructor(canvas) {
      this.cv = canvas; this.ctx = canvas.getContext('2d', { alpha: false });
      this.dpr = 1; this.W = 1; this.H = 1; this.baseS = 50; this.S = 50;
      this.mx = 1; this.raw = false; // switchbacks (F-42): mx mirrors the view (-1 is turned around); raw: toScreen ignores it
      this.sx = new Float32Array(4096); this.sh = new Float32Array(4096); this.sb = new Float32Array(4096);
      this.scenery = null; this.sceneryFor = null;
      this.pose = { hub: [{ x: 0, y: 0 }, { x: 0, y: 0 }], spin: [0, 0] };
      this.rpose = {}; this.cg = { slosh: 0, sloshV: 0, tilt: 0, level: 0, float: 0 }; this.look = { x: 1, y: 0 };
      this.resize();
    }
    resize() {
      this.dpr = Math.min(root.devicePixelRatio || 1, 2);
      this.W = Math.max(1, root.innerWidth); this.H = Math.max(1, root.innerHeight);
      this.cv.width = Math.round(this.W * this.dpr); this.cv.height = Math.round(this.H * this.dpr);
      this.baseS = this.W < this.H ? Math.max(this.W / 14, this.H / 30) : Math.min(this.W / 22, this.H / 12.4);
      this.buildSkyline();
    }
    buildSkyline() {
      const H = Math.round(Math.max(120, this.H * 0.46));
      this.far = { nob: this.farNob(H), russian: this.farRussian(H), twin: this.farTwin(H) };
      const Hm = Math.round(Math.max(110, this.H * 0.5));
      this.mid = Object.fromEntries(Object.entries(MID_LAYERS).map(([k, spec]) => [k, this.midLayer(Hm, spec)]));
    }
    farNob(H) { // downtown skyline in front of the East Bay hills
      const W = 1800, c = document.createElement('canvas'); c.width = W; c.height = H;
      const g = c.getContext('2d'), rng = mulberry32(415);
      g.fillStyle = '#b3c7d6'; g.beginPath(); g.moveTo(0, H);
      for (let x = 0; x <= W; x += 30) g.lineTo(x, H * (0.5 + 0.08 * Math.sin(x * 0.0042) + 0.04 * Math.sin(x * 0.011 + 1)));
      g.lineTo(W, H); g.closePath(); g.fill();
      let x = 0;
      while (x < W) {
        const w = 26 + rng() * 54, h = H * (0.18 + rng() * 0.5);
        g.fillStyle = rng() < 0.5 ? '#9db2c6' : '#93a9bf';
        g.fillRect(x, H - h, w, h);
        g.fillStyle = 'rgba(255,255,255,0.16)';
        for (let wy = H - h + 8; wy < H - 6; wy += 9) for (let wx = x + 5; wx < x + w - 5; wx += 8) if (rng() < 0.55) g.fillRect(wx, wy, 3, 4);
        x += w + rng() * 6;
      }
      const tower = (cx, bw, h, kind) => {
        g.fillStyle = '#8aa1b8';
        if (kind === 'pyramid') { g.beginPath(); g.moveTo(cx - bw / 2, H); g.lineTo(cx, H - h); g.lineTo(cx + bw / 2, H); g.fill(); }
        else { g.beginPath(); g.moveTo(cx - bw / 2, H); g.lineTo(cx - bw / 2, H - h + bw / 2); g.quadraticCurveTo(cx, H - h - bw * 0.1, cx + bw / 2, H - h + bw / 2); g.lineTo(cx + bw / 2, H); g.fill(); }
      };
      tower(520, 64, H * 0.95, 'pyramid'); tower(1180, 56, H * 0.98, 'round'); tower(1500, 40, H * 0.7, 'round');
      return c;
    }
    farTwin(H) { // from Twin Peaks (F-43): the city grid falling away to the bay, Market Street running to downtown, a radio tower
      const W = 2600, c = document.createElement('canvas'); c.width = W; c.height = H;
      const g = c.getContext('2d'), rng = mulberry32(1977), B = H;
      g.fillStyle = '#c9c3b4'; g.fillRect(0, B * 0.42, W, B * 0.58); // the city floor, seen from above
      const cols = ['#f3d9c4', '#e8cfe0', '#d6e6d0', '#f6e7b8', '#cfe0ee', '#efd2c6', '#e9e2d6'];
      for (let row = 0; row < 9; row++) { // rows of blocks, smaller toward the bay
        const y = B * (0.44 + row * 0.062), h = B * (0.018 + row * 0.006), w = 10 + row * 3.5, gap = 3 + row;
        for (let x = (row * 13) % 30; x < W; x += w + gap) { g.fillStyle = cols[Math.floor(rng() * cols.length)]; g.fillRect(x, y, w, h); }
      }
      g.strokeStyle = 'rgba(110,104,96,0.55)'; g.lineWidth = 5; g.beginPath(); g.moveTo(300, B); g.lineTo(1560, B * 0.45); g.stroke(); // Market Street
      for (let i = 0; i < 9; i++) { const x = 1500 + i * 26 + rng() * 10, h = B * (0.08 + rng() * 0.16); g.fillStyle = i % 2 ? '#a9b4c2' : '#b8c1cc'; g.fillRect(x, B * 0.45 - h, 20, h); } // downtown
      // A three-legged radio tower on its hill (an original drawing).
      g.fillStyle = '#b9c7a2'; g.beginPath(); g.moveTo(2050, B); g.quadraticCurveTo(2250, B * 0.5, 2450, B); g.fill();
      const tx = 2250, base = B * 0.72, top = B * 0.06, leg = (dx) => { g.beginPath(); g.moveTo(tx + dx, base); g.lineTo(tx, top + B * 0.18); g.stroke(); };
      g.lineWidth = 4; g.strokeStyle = '#d9604c'; leg(-46); leg(46); g.strokeStyle = '#e88a78'; leg(0);
      g.lineWidth = 2; g.strokeStyle = '#f5efe6';
      for (let k = 1; k < 5; k++) { const y = base - (base - top - B * 0.18) * k / 5, half = 46 * (1 - k / 5); g.beginPath(); g.moveTo(tx - half, y); g.lineTo(tx + half, y); g.stroke(); }
      g.strokeStyle = '#d9604c'; g.lineWidth = 3; g.beginPath(); g.moveTo(tx, top + B * 0.18); g.lineTo(tx, top); g.stroke();
      g.fillStyle = 'rgba(236,239,242,0.55)'; g.fillRect(0, B * 0.3, W, B * 0.16); // a haze line where the fog sits
      return c;
    }
    farRussian(H) { // the bay: headlands, a generic red suspension bridge, Alcatraz, Angel Island, Coit Tower
      const W = 2600, c = document.createElement('canvas'); c.width = W; c.height = H;
      const g = c.getContext('2d'), rng = mulberry32(77), B = H;
      const hill = (col, pts) => { g.fillStyle = col; g.beginPath(); g.moveTo(pts[0][0], B); for (const [x, y] of pts) g.lineTo(x, B - y * H); g.lineTo(pts[pts.length - 1][0], B); g.closePath(); g.fill(); };
      hill('#a9b99d', [[0, 0.34], [150, 0.46], [360, 0.4], [560, 0.3], [760, 0.16], [880, 0.05], [940, 0]]);
      hill('#b7c6ad', [[1720, 0], [1840, 0.15], [1990, 0.22], [2140, 0.14], [2260, 0]]);
      const deck = B - H * 0.11, top = B - H * 0.66, t1 = 360, t2 = 960, a0 = 80, a1 = 1240, mid = deck - H * 0.04, Cy = 2 * mid - top;
      const cableY = (x) => {
        if (x < t1) { const u = (x - a0) / (t1 - a0); return lerp(deck - H * 0.02, top, u * u * 0.6 + u * 0.4); }
        if (x > t2) { const u = (a1 - x) / (a1 - t2); return lerp(deck - H * 0.02, top, u * u * 0.6 + u * 0.4); }
        const u = (x - t1) / (t2 - t1); return (1 - u) * (1 - u) * top + 2 * u * (1 - u) * Cy + u * u * top;
      };
      g.strokeStyle = 'rgba(178,64,48,0.85)'; g.lineWidth = 1;
      g.beginPath(); for (let x = a0 + 6; x < a1; x += 9) { g.moveTo(x, cableY(x)); g.lineTo(x, deck); } g.stroke();
      g.strokeStyle = '#b8402f'; g.lineWidth = 3; g.beginPath(); g.moveTo(a0, cableY(a0));
      for (let x = a0; x <= a1; x += 6) g.lineTo(x, cableY(x)); g.stroke();
      g.fillStyle = '#b8402f'; g.fillRect(a0 - 20, deck - 2, a1 - a0 + 40, 7);
      for (const tx of [t1, t2]) {
        g.fillRect(tx - 9, top - 8, 6, deck - top + 40); g.fillRect(tx + 3, top - 8, 6, deck - top + 40);
        for (let k = 0; k < 4; k++) g.fillRect(tx - 9, top + k * (deck - top) * 0.3, 18, 5);
      }
      g.fillStyle = '#8f8a70'; g.beginPath(); g.ellipse(1530, B, 95, H * 0.07, 0, Math.PI, 0); g.fill();       // Alcatraz
      g.fillStyle = '#d9d6cc'; g.fillRect(1480, B - H * 0.09, 86, H * 0.035); g.fillRect(1500, B - H * 0.105, 46, H * 0.02);
      g.fillStyle = '#efeadf'; g.fillRect(1580, B - H * 0.17, 6, H * 0.1); g.fillStyle = '#fff3c4'; g.fillRect(1578, B - H * 0.18, 10, 6);
      hill('#9fb58e', [[2240, 0], [2360, 0.12], [2440, 0.19], [2540, 0.13], [2600, 0.07]]);                  // Telegraph Hill
      g.fillStyle = '#ece5d6'; g.fillRect(2426, B - H * 0.19 - H * 0.2, 18, H * 0.2 + 3);                     // Coit Tower
      g.fillRect(2422, B - H * 0.4, 26, 6); g.fillStyle = 'rgba(120,110,95,0.35)';
      for (let k = 0; k < 4; k++) g.fillRect(2429 + k * 4, B - H * 0.38, 1.5, H * 0.17);
      for (let x = 2280; x < 2600; x += 14 + rng() * 10) { g.fillStyle = PASTELS[(rng() * PASTELS.length) | 0]; const h = 8 + rng() * 10; g.fillRect(x, B - h - H * 0.02 * Math.sin((x - 2240) / 120), 12, h + 6); }
      return c;
    }
    midLayer(Hm, spec) { // a nearer ridge of rooftops, hazed back
      const W = 2400, c = document.createElement('canvas'); c.width = W; c.height = Hm;
      const g = c.getContext('2d'), rng = mulberry32(spec.seed), ph = spec.phase;
      const prof = (x) => Hm * (0.4 + 0.15 * Math.sin(x * TAU / 2400 * 2 + ph) + 0.07 * Math.sin(x * TAU / 2400 * 5 + 1));
      g.fillStyle = spec.fill; g.beginPath(); g.moveTo(0, Hm);
      for (let x = 0; x <= W; x += 20) g.lineTo(x, Hm - prof(x)); g.lineTo(W, Hm); g.closePath(); g.fill();
      for (let x = 0; x < W;) {
        const w = 13 + rng() * 9, tall = spec.towers && rng() < 0.12, h = tall ? 40 + rng() * 26 : 13 + rng() * 11, y = Hm - Math.max(prof(x), prof(x + w));
        if (rng() < spec.trees) { g.fillStyle = rng() < 0.5 ? '#86a374' : '#7a9a6a'; g.beginPath(); g.arc(x + w / 2, y - 7, 8, 0, TAU); g.fill(); x += w; continue; }
        g.fillStyle = tall ? '#d8d3c6' : PASTELS[(rng() * PASTELS.length) | 0]; g.fillRect(x, y - h, w, h + 30);
        if (!tall && rng() < 0.5) { g.beginPath(); g.moveTo(x - 1, y - h); g.lineTo(x + w / 2, y - h - 6); g.lineTo(x + w + 1, y - h); g.fill(); }
        g.fillStyle = 'rgba(80,96,110,0.45)';
        for (let wy = y - h + 4; wy < y - 3; wy += 6) for (let wx = x + 3; wx < x + w - 3; wx += 5) g.fillRect(wx, wy, 2, 3);
        x += w + 1 + rng() * 2;
      }
      g.strokeStyle = 'rgba(90,90,98,0.5)'; g.lineWidth = 2; g.beginPath(); // the street along the ridge
      for (let x = 0; x <= W; x += 20) { const y = Hm - prof(x) + 2; if (x) g.lineTo(x, y); else g.moveTo(x, y); } g.stroke();
      g.fillStyle = 'rgba(214,228,236,0.42)'; g.fillRect(0, 0, W, Hm);
      c.prof = prof;
      return c;
    }
    // Outside the world scene, toScreen gives mirrored positions (labels, bubbles, and HUD arrows stay upright text).
    // Inside it (raw), the canvas transform does the mirroring, so positions are not mirrored twice.
    toScreen(cam, wx, wy, out) { out.x = (wx - cam.x + cam.sx) * this.S * (this.raw ? 1 : this.mx) + this.W / 2; out.y = this.H / 2 - (wy - cam.y + cam.sy) * this.S; return out; }
    screenSpace() { this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0); }
    sceneSpace() { const d = this.dpr, m = this.mx; this.ctx.setTransform(d * m, 0, 0, d, d * this.W * (1 - m) / 2, 0); } // screen space, mirrored with the world
    worldSpace(cam) {
      const S = this.S, d = this.dpr, m = this.mx;
      this.ctx.setTransform(d * S * m, 0, 0, -d * S, d * (this.W / 2 - (cam.x - cam.sx) * S * m), d * (this.H / 2 + (cam.y - cam.sy) * S));
    }
    ensureScenery(course) { if (this.sceneryFor !== course) { this.scenery = buildScenery(course); this.sceneryFor = course; } }
    drawBackdrop(cam, time, theme) {
      const ctx = this.ctx, W = this.W, H = this.H, T = themeFor(theme);
      const sky = ctx.createLinearGradient(0, 0, 0, H);
      sky.addColorStop(0, '#86c5ea'); sky.addColorStop(0.55, '#bfe0ef'); sky.addColorStop(1, '#fbe3bf');
      ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);
      const sun = ctx.createRadialGradient(W * 0.84, H * 0.16, 0, W * 0.84, H * 0.16, H * 0.5);
      sun.addColorStop(0, 'rgba(255,240,200,0.9)'); sun.addColorStop(0.12, 'rgba(255,232,180,0.55)'); sun.addColorStop(1, 'rgba(255,232,180,0)');
      ctx.fillStyle = sun; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = 'rgba(255,255,255,0.82)';
      for (let i = 0; i < 6; i++) {
        const span = W + 400, cx = (((i * 380 - cam.x * 2 - time * 6) % span) + span) % span - 200, cy = H * (0.1 + (i % 3) * 0.07);
        for (let k = 0; k < 4; k++) { ctx.beginPath(); ctx.ellipse(cx + k * 28, cy + Math.sin(k * 2) * 6, 34 - k * 3, 16, 0, 0, TAU); ctx.fill(); }
      }
      const horizon = H * T.horizon + clamp(cam.y * this.S * 0.025, -H * 0.1, H * 0.2);
      ctx.fillStyle = T.water; ctx.fillRect(0, horizon - H * 0.03, W, H);
      if (T.hills) {
        ctx.fillStyle = '#a7c39b'; ctx.beginPath(); ctx.moveTo(0, horizon);
        for (let x = 0; x <= W + 40; x += 40) { const wx = x + cam.x * this.S * 0.04; ctx.lineTo(x, horizon - H * 0.06 - Math.sin(wx * 0.004) * H * 0.04 - Math.sin(wx * 0.011) * H * 0.02); }
        ctx.lineTo(W, horizon); ctx.closePath(); ctx.fill();
      }
      const far = this.far && this.far[T.far];
      if (far) {
        const off = (((cam.x * this.S * T.farParallax) % far.width) + far.width) % far.width, y = horizon - far.height + H * T.farDrop;
        for (let x = -off; x < W; x += far.width) ctx.drawImage(far, x, y);
      }
      if (T.sailboats) { // sailboats drift on the bay
        for (let i = 0; i < 5; i++) {
          const span = W + 200, bx = (((i * 337 + time * (6 + i * 1.5) - cam.x * this.S * 0.08) % span) + span) % span - 100, by = horizon + H * (0.035 + (i % 3) * 0.028), s = 0.7 + (i % 3) * 0.25;
          ctx.fillStyle = '#fffaf0'; ctx.beginPath(); ctx.moveTo(bx, by - 2); ctx.lineTo(bx, by - 26 * s); ctx.lineTo(bx + 14 * s, by - 3); ctx.closePath(); ctx.fill();
          ctx.fillStyle = i % 2 ? '#e8604c' : '#2d2a32'; ctx.fillRect(bx - 9 * s, by - 2, 24 * s, 3.5 * s);
        }
      }
      ctx.fillStyle = 'rgba(251,227,191,0.25)'; ctx.fillRect(0, horizon - H * 0.12, W, H * 0.2);
      const mid = this.mid && this.mid[T.mid];
      if (mid) {
        const moff = (((cam.x * this.S * 0.3) % mid.width) + mid.width) % mid.width;
        const my = H - mid.height * 0.92 + clamp(cam.y * this.S * 0.06, -H * 0.18, H * 0.3);
        for (let x = -moff; x < W; x += mid.width) ctx.drawImage(mid, x, my);
        if (T.ridgeCableCar) { // a cable car climbs the far ridge
          const cxC = (time * 16) % mid.width;
          let sx = cxC - moff; if (sx < -60) sx += mid.width;
          if (sx > -60 && sx < W + 60) {
            const y = my + mid.height - mid.prof(cxC) + 1, a = Math.atan2(mid.prof(cxC) - mid.prof(cxC + 10), 10);
            ctx.save(); ctx.translate(sx, y); ctx.rotate(a);
            ctx.fillStyle = '#9e4a3c'; ctx.fillRect(-15, -10, 30, 7); ctx.fillStyle = '#efe3c8'; ctx.fillRect(-15, -17, 30, 7);
            ctx.fillStyle = '#7d5a4a'; ctx.fillRect(-17, -19, 34, 3); ctx.fillStyle = 'rgba(80,96,110,0.7)';
            for (let k = 0; k < 4; k++) ctx.fillRect(-12 + k * 7, -16, 4, 5);
            ctx.restore();
          }
        }
      }
    }
    sample(T, xa, xb) {
      const step = clamp(4 / this.S, 0.06, 0.5);
      let n = 0;
      for (let x = xa; n < this.sx.length - 1; x += step) {
        const xx = Math.min(x, xb); this.sx[n] = xx; this.sh[n] = T.height(xx); this.sb[n] = T.base(xx); n++;
        if (xx >= xb) break;
      }
      return n;
    }
    // Fill between two sampled profiles (A + top above, B + bot below).
    band(n, A, top, B, bot, fill) {
      const ctx = this.ctx, sx = this.sx;
      ctx.beginPath(); ctx.moveTo(sx[0], A[0] + top);
      for (let i = 1; i < n; i++) ctx.lineTo(sx[i], A[i] + top);
      for (let i = n - 1; i >= 0; i--) ctx.lineTo(sx[i], B[i] + bot);
      ctx.closePath(); ctx.fillStyle = fill; ctx.fill();
    }
    strokeAlong(T, x0, x1, off, step) {
      const ctx = this.ctx; ctx.beginPath(); ctx.moveTo(x0, T.base(x0) + off);
      for (let x = x0 + step; x < x1; x += step) ctx.lineTo(x, T.base(x) + off);
      ctx.lineTo(x1, T.base(x1) + off); ctx.stroke();
    }
    drawHouse(H, T) { // San Francisco "Painted Lady": pastel body, white trim, accent details
      const ctx = this.ctx, w = H.x1 - H.x0, top = H.base + H.h;
      ctx.fillStyle = '#c3ad92';
      ctx.beginPath(); ctx.moveTo(H.x0, H.base); ctx.lineTo(H.x1, H.base);
      ctx.lineTo(H.x1, T.height(H.x1) + ROAD.walk - 0.35); ctx.lineTo(H.x0, T.height(H.x0) + ROAD.walk - 0.35); ctx.closePath(); ctx.fill();
      const drop = H.base - Math.min(T.height(H.x0), T.height(H.x1)) - ROAD.walk;
      if (drop > 1.7) {
        const gx = H.downhill ? H.x1 - 3.1 : H.x0 + 0.5, gy = H.base - drop + 0.05;
        ctx.fillStyle = '#8f8a85'; ctx.fillRect(gx, gy, 2.6, Math.min(2.1, drop - 0.2));
        ctx.strokeStyle = '#7b7671'; ctx.lineWidth = 0.05;
        for (let k = 1; k < 5; k++) line(ctx, gx, gy + k * 0.42, gx + 2.6, gy + k * 0.42);
      }
      ctx.fillStyle = H.color; ctx.fillRect(H.x0, H.base, w, H.h);
      ctx.fillStyle = 'rgba(60,40,30,0.06)';
      for (let y = H.base + 0.32; y < top - 0.6; y += 0.32) ctx.fillRect(H.x0, y, w, 0.035); // clapboard
      ctx.fillStyle = H.trim; ctx.fillRect(H.x0, H.base, 0.16, H.h); ctx.fillRect(H.x1 - 0.16, H.base, 0.16, H.h);
      if (H.gable) {
        ctx.beginPath(); ctx.moveTo(H.x0 - 0.2, top); ctx.lineTo(H.x0 + w / 2, top + 1.6); ctx.lineTo(H.x1 + 0.2, top); ctx.closePath(); ctx.fill();
        ctx.fillStyle = H.accent; ctx.beginPath(); ctx.moveTo(H.x0 + 0.35, top + 0.12); ctx.lineTo(H.x0 + w / 2, top + 1.25); ctx.lineTo(H.x1 - 0.35, top + 0.12); ctx.closePath(); ctx.fill();
        ctx.fillStyle = H.color; // fish-scale shingles
        for (let r = 0; r < 3; r++) for (let sx = H.x0 + 0.9 + r * 0.45; sx < H.x1 - 0.9 - r * 0.45; sx += 0.32) { ctx.beginPath(); ctx.arc(sx, top + 0.3 + r * 0.3, 0.13, Math.PI, 0); ctx.fill(); }
        ctx.fillStyle = H.trim; ctx.beginPath(); ctx.arc(H.x0 + w / 2, top + 0.62, 0.22, 0, TAU); ctx.fill();
      } else {
        ctx.fillRect(H.x0 - 0.18, top - 0.38, w + 0.36, 0.38); ctx.fillRect(H.x0 - 0.1, top - 0.62, w + 0.2, 0.12);
        ctx.fillStyle = H.accent;
        for (let bx = H.x0 + 0.15; bx < H.x1 - 0.1; bx += 0.5) ctx.fillRect(bx, top - 0.86, 0.13, 0.24); // cornice brackets
      }
      const floors = H.floors, fh = (H.h - 0.9) / floors, cols = w > 7.2 ? 3 : 2, doorW = 0.95, doorX = H.downhill ? H.x0 + 0.35 : H.x1 - 0.35 - doorW;
      ctx.fillStyle = H.accent;
      for (let f = 1; f < floors; f++) ctx.fillRect(H.x0, H.base + 0.5 + f * fh - 0.32, w, 0.09); // floor bands
      ctx.fillStyle = H.door; ctx.fillRect(doorX, H.base, doorW, 1.9);
      ctx.fillStyle = H.trim; ctx.fillRect(doorX - 0.12, H.base + 1.9, doorW + 0.24, 0.16);
      ctx.beginPath(); ctx.moveTo(doorX - 0.2, H.base + 2.06); ctx.lineTo(doorX + doorW / 2, H.base + 2.45); ctx.lineTo(doorX + doorW + 0.2, H.base + 2.06); ctx.closePath(); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fillRect(doorX + 0.2, H.base + 1.2, doorW - 0.4, 0.45);
      const sw = T.height(doorX + doorW / 2) + ROAD.walk, rise = H.base - sw;
      if (rise > 0.12) { // stoop
        ctx.fillStyle = '#d9cdb8';
        for (let k = 0; k < 3; k++) ctx.fillRect(doorX - 0.1 + k * 0.08, sw + (rise * k) / 3, doorW + 0.2 - k * 0.16, rise / 3 + 0.02);
      }
      const xs0 = H.downhill ? doorX + doorW + 0.35 : H.x0 + 0.4, xs1 = H.downhill ? H.x1 - 0.35 : doorX - 0.35;
      const win = (cx, wy, ww, wh) => {
        ctx.fillStyle = H.trim; ctx.fillRect(cx - ww / 2 - 0.12, wy - 0.12, ww + 0.24, wh + 0.24);
        ctx.beginPath(); ctx.moveTo(cx - ww / 2 - 0.2, wy + wh + 0.12); ctx.lineTo(cx, wy + wh + 0.42); ctx.lineTo(cx + ww / 2 + 0.2, wy + wh + 0.12); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#9fbccc'; ctx.fillRect(cx - ww / 2, wy, ww, wh);
        ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fillRect(cx - ww / 2, wy + wh * 0.58, ww, 0.05);
        ctx.fillStyle = H.accent; ctx.fillRect(cx - ww / 2 - 0.16, wy - 0.18, ww + 0.32, 0.08);
      };
      for (let f = 0; f < floors; f++) {
        const wy = H.base + 0.5 + f * fh + (f === 0 ? 0.2 : 0);
        if (f === 0 && xs1 - xs0 < 1.2) continue;
        const span = xs1 - xs0, n = f === 0 ? Math.max(1, cols - 1) : cols;
        if (H.bay && f > 0 && f <= 2) {
          const bx = xs0 + span * 0.1, bw = Math.min(2.6, span * 0.6);
          ctx.fillStyle = H.trim; ctx.fillRect(bx - 0.15, wy - 0.2, bw + 0.3, fh * 0.82);
          ctx.fillStyle = H.accent; ctx.fillRect(bx - 0.25, wy + fh * 0.62 - 0.02, bw + 0.5, 0.12);
          ctx.fillStyle = '#9fbccc';
          for (let k = 0; k < 3; k++) ctx.fillRect(bx + k * (bw / 3) + 0.06, wy, bw / 3 - 0.12, fh * 0.55);
          ctx.fillStyle = 'rgba(255,255,255,0.4)'; ctx.fillRect(bx + 0.1, wy + fh * 0.36, bw - 0.2, 0.05);
          const rest = xs1 - (bx + bw + 0.4);
          if (rest > 1) win(bx + bw + 0.95, wy, 0.75, fh * 0.5);
          continue;
        }
        for (let k = 0; k < n; k++) win(xs0 + (span * (k + 0.5)) / n, wy, 0.8, fh * 0.5);
      }
    }
    drawScenery(world, xa, xb, time) {
      const ctx = this.ctx, T = world.terrain, C = world.course, sc = this.scenery;
      for (const L of C.landmarks) if (L.x1 > xa - 2 && L.x0 < xb + 2) drawLandmark(ctx, L, T, time);
      for (const H of sc.houses) if (H.x1 > xa - 1 && H.x0 < xb + 1) this.drawHouse(H, T);
      const tree = (tr, y) => {
        ctx.fillStyle = '#6d5a48'; ctx.fillRect(tr.x - 0.12, y, 0.24, 2.2 * tr.s);
        ctx.fillStyle = tr.c;
        ctx.beginPath(); ctx.arc(tr.x, y + 2.9 * tr.s, 1.3 * tr.s, 0, TAU); ctx.arc(tr.x - 0.9 * tr.s, y + 2.3 * tr.s, 0.95 * tr.s, 0, TAU); ctx.arc(tr.x + 0.95 * tr.s, y + 2.35 * tr.s, 1.0 * tr.s, 0, TAU); ctx.fill();
      };
      for (const tr of sc.trees) if (tr.x > xa - 4 && tr.x < xb + 4) tree(tr, T.height(tr.x) + ROAD.walk);
      for (const tr of sc.street) if (tr.x > xa - 3 && tr.x < xb + 3) { const y = T.height(tr.x) + ROAD.walk - 0.08; ctx.fillStyle = '#8f7a62'; ctx.fillRect(tr.x - 0.5, y - 0.04, 1, 0.08); tree(tr, y); }
      if (C.office && C.office.x1 > xa && C.office.x0 < xb) {
        const o = C.office, y = T.height(o.x0) + ROAD.walk, w = o.x1 - o.x0;
        ctx.fillStyle = '#d7e7ec'; ctx.fillRect(o.x0, y, w, 11);
        ctx.strokeStyle = '#9fb7c1'; ctx.lineWidth = 0.08;
        for (let gx = o.x0 + 1.5; gx < o.x1; gx += 1.5) line(ctx, gx, y, gx, y + 11);
        for (let gy = y + 2.6; gy < y + 11; gy += 2.2) line(ctx, o.x0, gy, o.x1, gy);
        ctx.fillStyle = COL.ink; ctx.fillRect(o.x0 - 0.2, y + 2.3, w + 0.4, 0.9);
        const dx = C.doorX - 0.9, out = world.deliveredAt >= 0 ? clamp((world.t - world.deliveredAt - 0.9) / 0.3, 0, 1) : 0;
        ctx.fillStyle = '#9cc6d4'; ctx.fillRect(dx, y, 1.8, 2.2); ctx.strokeStyle = COL.ink; ctx.lineWidth = 0.06; ctx.strokeRect(dx, y, 1.8, 2.2); line(ctx, dx + 0.9, y, dx + 0.9, y + 2.2);
        if (out > 0) drawPedestrian(ctx, { x: C.doorX, kind: 'tech', react: { kind: 'shock', t: 0.1, dur: 9 } }, y, time);
      }
      if (C.venue && C.venue.x1 > xa - 2 && C.venue.x0 < xb + 2) drawVenue(ctx, C, T, time, world.state === 'done' || world.state === 'finishing');
      for (const lx of sc.lamps) {
        if (lx < xa - 2 || lx > xb + 2) continue;
        const y = T.height(lx) + ROAD.walk - 0.1;
        ctx.strokeStyle = '#2f3b36'; ctx.lineWidth = 0.12; line(ctx, lx, y, lx, y + 4.4);
        ctx.lineWidth = 0.07; ctx.beginPath(); ctx.moveTo(lx, y + 4.2); ctx.quadraticCurveTo(lx + 0.6, y + 4.7, lx + 0.9, y + 4.3); ctx.stroke();
        ctx.fillStyle = '#2f3b36'; ctx.fillRect(lx + 0.7, y + 3.95, 0.4, 0.35);
        ctx.fillStyle = 'rgba(255,233,170,0.9)'; ctx.fillRect(lx + 0.76, y + 4.0, 0.28, 0.2);
      }
      for (const I of C.intersections) {
        if (I.x1 < xa - 2 || I.x0 > xb + 2) continue;
        const px = I.x1 - 0.7, y = T.height(px) + ROAD.walk - 0.1;
        ctx.strokeStyle = '#5b6b5e'; ctx.lineWidth = 0.08; line(ctx, px, y, px, y + 3.4);
        ctx.fillStyle = '#2f6d4f'; ctx.fillRect(px - 1.3, y + 3.0, 2.6, 0.36); ctx.fillRect(px - 0.18, y + 2.55, 1.6, 0.36);
      }
      for (const z of world.zones) { // a stop sign beside each STOP box
        const sx = z.x0 + 0.6;
        if (sx < xa - 2 || sx > xb + 2) continue;
        const y = T.height(sx) + ROAD.walk - 0.1;
        ctx.strokeStyle = '#4b4a52'; ctx.lineWidth = 0.08; line(ctx, sx, y, sx, y + 2.5);
        ctx.fillStyle = z.done ? '#3f9a5b' : '#c8382c'; ctx.beginPath();
        for (let k = 0; k < 8; k++) { const a = (k + 0.5) * (TAU / 8); ctx.lineTo(sx + Math.cos(a) * 0.46, y + 2.85 + Math.sin(a) * 0.46); }
        ctx.closePath(); ctx.fill(); ctx.strokeStyle = '#fff6e5'; ctx.lineWidth = 0.05; ctx.stroke();
      }
      for (const cc of world.obstacles.crossers) { // warning sign with flashers before each crossing
        const sx = cc.cx - 4.6;
        if (sx < xa - 2 || sx > xb + 2) continue;
        const y = T.height(sx) + ROAD.walk - 0.1, on = cc.active && Math.floor(time * 4) % 2 === 0;
        ctx.strokeStyle = '#4b4a52'; ctx.lineWidth = 0.09; line(ctx, sx, y, sx, y + 3.2);
        ctx.save(); ctx.translate(sx, y + 2.6); ctx.rotate(Math.PI / 4);
        ctx.fillStyle = '#f2c230'; ctx.fillRect(-0.42, -0.42, 0.84, 0.84); ctx.strokeStyle = COL.ink; ctx.lineWidth = 0.05; ctx.strokeRect(-0.36, -0.36, 0.72, 0.72);
        ctx.restore();
        ctx.fillStyle = COL.ink; ctx.fillRect(sx - 0.28, y + 2.42, 0.56, 0.26); ctx.fillRect(sx - 0.2, y + 2.32, 0.08, 0.1); ctx.fillRect(sx + 0.12, y + 2.32, 0.08, 0.1);
        ctx.fillStyle = '#2d2a32'; ctx.fillRect(sx - 0.62, y + 1.55, 1.24, 0.42);
        ctx.fillStyle = on ? '#ff5a3c' : '#5a3a36'; ctx.beginPath(); ctx.arc(sx - 0.33, y + 1.76, 0.15, 0, TAU); ctx.fill();
        ctx.fillStyle = !on && cc.active ? '#ff5a3c' : '#5a3a36'; ctx.beginPath(); ctx.arc(sx + 0.33, y + 1.76, 0.15, 0, TAU); ctx.fill();
      }
      for (const r of C.ramps) {
        const sx = r.x - 13;
        if (sx < xa - 3 || sx > xb + 3) continue;
        const y = T.height(sx) + ROAD.walk - 0.1;
        ctx.strokeStyle = '#4b4a52'; ctx.lineWidth = 0.08; line(ctx, sx - 0.5, y, sx - 0.3, y + 1.9); line(ctx, sx + 0.5, y, sx + 0.3, y + 1.9);
        ctx.save(); ctx.translate(sx, y + 2.25); ctx.rotate(Math.PI / 4); ctx.fillStyle = '#f28c28'; ctx.fillRect(-0.5, -0.5, 1, 1); ctx.restore();
        ctx.fillStyle = COL.ink; ctx.fillRect(sx - 0.05, y + 1.95, 0.1, 0.5); ctx.beginPath(); ctx.arc(sx, y + 2.55, 0.08, 0, TAU); ctx.fill();
      }
    }
    drawPedestrians(world, xa, xb, time) {
      const T = world.terrain;
      for (const B of world.course.pedestrians) {
        if (B.x < xa - 2 || B.x > xb + 2) continue;
        drawPedestrian(this.ctx, B, T.height(B.x) + ROAD.curb + 0.12, time);
      }
    }
    // Cross streets recede from our far curb; the Macondray Lane steps get concrete and a handrail.
    drawCrossStreets(world, xa, xb) {
      const ctx = this.ctx, T = world.terrain;
      for (const cc of world.obstacles.crossers) {
        if (cc.cx < xa - 6 || cc.cx > xb + 6) continue;
        const x = cc.cx, b = T.base(x), yN = b + ROAD.far - 0.02, yF = b + ROAD.walk + 2.6;
        const fade = ctx.createLinearGradient(0, yN, 0, yF);
        fade.addColorStop(0, COL.asphaltFar); fade.addColorStop(0.7, 'rgba(98,97,106,0.85)'); fade.addColorStop(1, 'rgba(98,97,106,0)');
        ctx.fillStyle = fade; ctx.beginPath(); ctx.moveTo(x - 3.2, yN); ctx.lineTo(x + 3.2, yN); ctx.lineTo(x + 1.7, yF); ctx.lineTo(x - 1.7, yF); ctx.closePath(); ctx.fill();
        const walkFade = ctx.createLinearGradient(0, yN, 0, yF);
        walkFade.addColorStop(0, COL.walk); walkFade.addColorStop(1, 'rgba(230,218,198,0)');
        ctx.fillStyle = walkFade; ctx.beginPath(); ctx.moveTo(x - 3.2, yN + 0.45); ctx.lineTo(x - 4.0, yN + 0.45); ctx.lineTo(x - 2.2, yF); ctx.lineTo(x - 1.7, yF); ctx.fill();
        ctx.beginPath(); ctx.moveTo(x + 3.2, yN + 0.45); ctx.lineTo(x + 4.0, yN + 0.45); ctx.lineTo(x + 2.2, yF); ctx.lineTo(x + 1.7, yF); ctx.fill();
        ctx.strokeStyle = 'rgba(156,153,159,0.8)'; ctx.lineWidth = 0.05;
        for (const k of [-1, 1]) { line(ctx, x + k * 0.72, yN, x + k * 0.45, yF - 0.6); }
        ctx.strokeStyle = 'rgba(47,46,52,0.6)'; ctx.lineWidth = 0.035; line(ctx, x, yN, x, yF - 0.6);
      }
    }
    drawRoadFeatures(world, xa, xb) {
      const ctx = this.ctx, T = world.terrain, C = world.course;
      for (const cc of world.obstacles.crossers) { // the cross street's rails cut across our lane
        if (cc.cx < xa - 2 || cc.cx > xb + 2) continue;
        ctx.fillStyle = 'rgba(40,39,45,0.75)';
        for (const k of [-1, 1]) { const x = cc.cx + k * 0.72; ctx.beginPath(); ctx.moveTo(x - 0.035, T.height(x) + 0.01); ctx.lineTo(x + 0.035, T.height(x) + 0.01); ctx.lineTo(x + 0.03, T.base(x) + ROAD.far - 0.02); ctx.lineTo(x - 0.03, T.base(x) + ROAD.far - 0.02); ctx.fill(); }
      }
      for (const st of C.stairs) {
        if (st.x1 < xa - 1 || st.x0 > xb + 1) continue;
        const F = T.features.find((f) => f.type === 'stairs' && Math.abs(f.x0 - st.x0) < 1e-6);
        const x0 = st.x0 - 0.02, x1 = st.x1 + 0.02;
        ctx.fillStyle = '#d4cbbb'; ctx.beginPath(); ctx.moveTo(x0, T.height(x0));
        for (let x = x0; x <= x1; x += 0.03) ctx.lineTo(x, T.height(x));
        ctx.lineTo(x1, T.height(x1)); ctx.lineTo(x1, T.base(x1) + ROAD.far); ctx.lineTo(x0, T.base(x0) + ROAD.far); ctx.closePath(); ctx.fill();
        if (F) {
          ctx.strokeStyle = '#a99f8f'; ctx.lineWidth = 0.035;
          for (let k = 0; k <= st.n; k++) {
            const xn = st.x0 + (k + 1 - F.nose - F.phase) * st.tread;
            if (xn <= st.x0 || xn >= st.x1) continue;
            line(ctx, xn, T.height(xn), xn + 0.08, T.base(xn) + ROAD.far - 0.02);
          }
        }
        ctx.strokeStyle = '#6b5b4b'; ctx.lineWidth = 0.06;
        const rail = (x) => T.base(x) + ROAD.far + 0.95;
        for (let x = st.x0 - 0.3; x <= st.x1 + 0.4; x += 1.75) line(ctx, x, T.base(x) + ROAD.far - 0.02, x, rail(x));
        ctx.lineWidth = 0.08; line(ctx, st.x0 - 0.5, rail(st.x0 - 0.5), st.x1 + 0.5, rail(st.x1 + 0.5));
      }
    }
    drawRoad(world, xa, xb) {
      const ctx = this.ctx, T = world.terrain, C = world.course;
      const n = this.sample(T, xa, xb);
      const yBot = Math.min(this.sh[0], this.sh[n - 1]) - 40, sb = this.sb, sh = this.sh;
      this.band(n, sb, ROAD.walk, sb, ROAD.curb, COL.walk);
      this.band(n, sb, ROAD.curb, sb, ROAD.far, COL.curbDark);
      this.drawCrossStreets(world, xa, xb);
      this.band(n, sb, ROAD.far, sb, ROAD.far * 0.5, COL.asphaltFar);
      this.band(n, sb, ROAD.far * 0.5, sh, 0, COL.asphalt);
      ctx.strokeStyle = COL.rail; ctx.lineWidth = 0.028;
      this.strokeAlong(T, xa, xb, 0.66, 0.4); this.strokeAlong(T, xa, xb, 0.52, 0.4);
      ctx.strokeStyle = COL.slot; ctx.lineWidth = 0.02; this.strokeAlong(T, xa, xb, 0.59, 0.4);
      ctx.strokeStyle = COL.lane; ctx.lineWidth = 0.05;
      for (let x = Math.floor(xa / 4.2) * 4.2; x < xb; x += 4.2) this.strokeAlong(T, x, x + 1.6, 0.3, 0.4);
      ctx.fillStyle = 'rgba(244,236,220,0.92)';
      const RAINBOW = ['#e8604c', '#f2b134', '#f6e05e', '#5fb36b', '#4f8fd9', '#8a5fc7'], rainbow = themeFor(C.theme).rainbowCrosswalks;
      const stripes = (x0, x1) => {
        let k = 0;
        for (let x = x0 + 0.25; x < x1 - 0.2; x += 0.55) {
          if (rainbow && x > (C.musicDrop || 0) - 15) ctx.fillStyle = RAINBOW[k++ % RAINBOW.length]; // the Castro's rainbow crossings
          else ctx.fillStyle = 'rgba(244,236,220,0.92)';
          const h0 = T.base(x), h1 = T.base(x + 0.3);
          ctx.beginPath(); ctx.moveTo(x, h0 + 0.04); ctx.lineTo(x + 0.3, h1 + 0.04); ctx.lineTo(x + 0.3, h1 + ROAD.far - 0.04); ctx.lineTo(x, h0 + ROAD.far - 0.04); ctx.closePath(); ctx.fill();
        }
      };
      for (const I of C.intersections) { if (I.x1 < xa || I.x0 > xb) continue; stripes(I.x0, I.x0 + 2.9); stripes(I.x1 - 2.9, I.x1); }
      for (const cw of C.crosswalks) if (cw.x1 > xa && cw.x0 < xb) stripes(cw.x0, cw.x1 + 0.3);
      for (const p of C.potholes) {
        if (p.x1 < xa || p.x0 > xb) continue;
        const cx = (p.x0 + p.x1) / 2, y = T.base(cx);
        ctx.fillStyle = '#77757d'; ctx.beginPath(); ctx.ellipse(cx, y + 0.2, (p.x1 - p.x0) * 0.58, 0.2, 0, 0, TAU); ctx.fill();
        ctx.fillStyle = '#2a292f'; ctx.beginPath(); ctx.ellipse(cx, y + 0.19, (p.x1 - p.x0) * 0.5, 0.15, 0, 0, TAU); ctx.fill();
      }
      for (const z of world.zones) { // drill STOP boxes: a painted box between two stop bars, green once you have stopped
        if (z.x1 < xa || z.x0 > xb) continue;
        const quad = (x0, x1) => { ctx.beginPath(); ctx.moveTo(x0, T.base(x0) + 0.03); ctx.lineTo(x1, T.base(x1) + 0.03); ctx.lineTo(x1, T.base(x1) + ROAD.far - 0.03); ctx.lineTo(x0, T.base(x0) + ROAD.far - 0.03); ctx.closePath(); ctx.fill(); };
        ctx.fillStyle = z.done ? 'rgba(120,200,140,0.55)' : 'rgba(242,177,52,0.5)'; quad(z.x0, z.x1);
        ctx.fillStyle = 'rgba(244,236,220,0.95)'; quad(z.x0, z.x0 + 0.35); quad(z.x1 - 0.35, z.x1);
      }
      this.drawRoadFeatures(world, xa, xb);
      this.band(n, sh, 0, sb, -ROAD.front, COL.curb);
      ctx.beginPath(); ctx.moveTo(this.sx[0], sb[0] - ROAD.front);
      for (let i = 1; i < n; i++) ctx.lineTo(this.sx[i], sb[i] - ROAD.front);
      ctx.lineTo(xb, yBot); ctx.lineTo(xa, yBot); ctx.closePath(); ctx.fillStyle = COL.wall; ctx.fill();
      ctx.strokeStyle = COL.wallLine; ctx.lineWidth = 0.05;
      for (let k = 1; k <= 5; k++) this.strokeAlong(T, xa, xb, -ROAD.front - k * 0.7, 0.6);
    }
    bikePose(world, alpha, game) {
      const b = world.bike, c = world.cargo, P = this.pose, cg = this.cg;
      P.x = lerp(b.px, b.x, alpha); P.y = lerp(b.py, b.y, alpha); P.a = lerpAngle(b.pa, b.a, alpha);
      for (let i = 0; i < 2; i++) {
        const wh = b.wheels[i], comp = lerp(wh.pcomp, wh.comp, alpha);
        P.hub[i].x = wh.lx; P.hub[i].y = world.phys.mountY - world.phys.suspRest + comp;
        P.spin[i] = lerp(wh.pspin, wh.spin, alpha);
      }
      const sp = Math.hypot(b.vx, b.vy);
      P.speed = sp; P.crank = b.pedalIn ? lerp(b.pcrank, b.crank, alpha) : b.crank;
      P.hgt = P.y - world.phys.rideH - world.terrain.height(P.x);
      P.wave = world.state === 'riding' && !b.grounded && b.airTime > 0.4 && P.hgt > 0.9 ? clamp((b.airTime - 0.4) / 0.15, 0, 1) * clamp((P.hgt - 0.9) / 0.4, 0, 1) : 0;
      P.lean = b.lean; P.brake = b.brakeIn ? clamp(sp / 8, 0, 1) : 0;
      P.stand = clamp(clamp((sp - 11) / 6, 0, 1) * (b.grounded ? 1 : 0.5) + (b.airTime > 0.25 ? 0.4 : 0), 0, 1);
      P.bob = (b.grounded ? Math.sin(game.time * 9) * 0.006 * clamp(sp / 8, 0, 1) : 0.02) - (b.wheels[0].comp - world.phys.sag) * 0.25;
      const view = cargoView(c.kind);
      P.view = view; P.cg = view.pose(c, cg); P.shield = c.shield; P.bellRing = game.bellT > 0 ? Math.abs(Math.sin(game.bellT * 30)) : 0;
      const worried = view.worried(c);
      P.expr = world.state === 'done' ? 'joy' : !b.grounded && b.airTime > 0.18 ? 'wow' : b.brakeIn && sp > 6 ? 'grit' : worried ? 'worried' : sp > 13 ? 'grin' : 'smile';
      this.look.x = worried ? view.lookX : 1; this.look.y = worried ? -0.8 : 0;
      P.look = this.look; P.scarf = null;
      return P;
    }
    drawBike(world, alpha, game) {
      const ctx = this.ctx, b = world.bike, T = world.terrain;
      const P = this.bikePose(world, alpha, game);
      const gh = T.height(P.x), hgt = P.y - world.phys.rideH - gh;
      ctx.fillStyle = 'rgba(30,28,34,' + clamp(0.28 - hgt * 0.04, 0.06, 0.28).toFixed(3) + ')';
      ctx.beginPath(); ctx.ellipse(P.x, gh + 0.1, clamp(0.8 - hgt * 0.06, 0.35, 0.8), 0.09, 0, 0, TAU); ctx.fill();
      const pose = riderPose(P, this.rpose);
      const ca = Math.cos(P.a), sa = Math.sin(P.a);
      const rider = world.state !== 'crashed';
      if (rider) {
        const nkx = pose.shX, nky = pose.shY + 0.06;
        const wx = P.x + nkx * ca - nky * sa, wy = P.y + nkx * sa + nky * ca;
        const S = game.scarf, L = game.scarfLocal;
        S.update(game.frameDt, wx, wy, game.windX, 0, game.time);
        for (let i = 0; i < S.n; i++) { const dx = S.x[i] - P.x, dy = S.y[i] - P.y; L.x[i] = dx * ca + dy * sa; L.y[i] = -dx * sa + dy * ca; }
        P.scarf = L;
      }
      if (b.crashed && world.cup.on) { // the cargo is in the air: an empty cup stays in the basket, otherwise nothing
        if (cargoView(world.cargo.kind).leavesCup) { P.view = CARGO_VIEW.coffee; P.cg = EMPTY_CUP; } else P.view = EMPTY_RACK;
        P.shield = false;
      }
      ctx.save(); ctx.translate(P.x, P.y); ctx.rotate(P.a);
      if (rider) drawBikeBack(ctx, P, pose);
      drawBikeBody(ctx, P, game.time);
      if (rider) drawBikeFront(ctx, P, pose, game.time);
      ctx.restore();
      if (world.rag.on) {
        const r = world.rag;
        drawRagdoll(ctx, lerp(r.px, r.x, alpha), lerp(r.py, r.y, alpha), lerpAngle(r.pa, r.a, alpha), game.time);
      }
      if (world.cup.on) {
        const c = world.cup, x = lerp(c.px, c.x, alpha), y = lerp(c.py, c.y, alpha), a = lerpAngle(c.pa, c.a, alpha);
        cargoView(world.cargo.kind).flying(ctx, x, y, a, world.cargo, game.time);
      }
    }
  }

