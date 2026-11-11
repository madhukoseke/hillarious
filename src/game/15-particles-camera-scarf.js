  /* ---------- 15. PARTICLES ---------- */
  const PK = { DROP: 1, DUST: 2, CONFETTI: 3, FOAM: 4, DECOR: 5, PUFF: 6 };
  class Particles {
    constructor(n) {
      this.items = [];
      for (let i = 0; i < n; i++) this.items.push({ on: false, k: 0, x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 1, size: 0.05, rot: 0, vr: 0, c: '#000' });
      this.i = 0; this.stains = []; this.si = 0;
    }
    clear() { for (const p of this.items) p.on = false; this.stains.length = 0; this.si = 0; }
    spawn(k, x, y, vx, vy, life, size, c) {
      const it = this.items;
      let p = null;
      for (let n = 0; n < it.length; n++) { this.i = (this.i + 1) % it.length; if (!it[this.i].on) { p = it[this.i]; break; } }
      if (!p) p = it[this.i];
      p.on = true; p.k = k; p.x = x; p.y = y; p.vx = vx; p.vy = vy; p.life = life; p.max = life; p.size = size; p.c = c;
      p.rot = Math.random() * TAU; p.vr = (Math.random() - 0.5) * 14; p.stain = null; p.shape = null;
      return p;
    }
    stain(x, y, r, c) {
      c = c || 'rgba(92,56,32,0.5)';
      if (this.stains.length < 90) this.stains.push({ x, y, r, c });
      else { const s = this.stains[this.si]; s.x = x; s.y = y; s.r = r; s.c = c; this.si = (this.si + 1) % 90; }
    }
    update(dt, T) {
      for (const p of this.items) {
        if (!p.on) continue;
        p.life -= dt;
        if (p.life <= 0) { p.on = false; continue; }
        if (p.k === PK.DROP || p.k === PK.FOAM) {
          p.vy -= (p.k === PK.DROP ? 20 : 12) * dt;
          p.x += p.vx * dt; p.y += p.vy * dt;
          if (T) { const h = T.height(p.x); if (p.y < h + 0.02) { if (p.k === PK.DROP) this.stain(p.x, h, p.size * 2.4, p.stain); p.on = false; } }
        } else if (p.k === PK.DECOR) {
          p.vy -= 20 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt;
          if (T) { const h = T.height(p.x) + p.size; if (p.y < h) { p.y = h; p.vy = Math.abs(p.vy) > 2 ? -p.vy * 0.35 : 0; p.vx *= 0.6; p.vr *= 0.5; } }
        } else if (p.k === PK.DUST || p.k === PK.PUFF) {
          p.vx *= 1 - 3 * dt; p.vy = p.vy * (1 - 3 * dt) + (p.k === PK.PUFF ? 1.4 : 0.5) * dt;
          p.x += p.vx * dt; p.y += p.vy * dt; p.size += dt * 0.6;
        } else if (p.k === PK.CONFETTI) {
          p.vy -= 4 * dt; p.vx *= 1 - 1.2 * dt; p.vy *= 1 - 1.0 * dt;
          p.rot += p.vr * dt; p.x += (p.vx + Math.sin(p.rot * 2) * 0.7) * dt; p.y += p.vy * dt;
        }
      }
    }
    drawStains(ctx) {
      for (const s of this.stains) { ctx.fillStyle = s.c; ctx.beginPath(); ctx.ellipse(s.x, s.y + 0.06, s.r * 1.6, s.r * 0.45, 0, 0, TAU); ctx.fill(); }
    }
    draw(ctx) {
      for (const p of this.items) {
        if (!p.on) continue;
        const f = p.life / p.max;
        if (p.k === PK.DROP || p.k === PK.FOAM) {
          ctx.fillStyle = p.c; ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, TAU); ctx.fill();
        } else if (p.k === PK.DUST) {
          ctx.fillStyle = 'rgba(214,200,178,' + (0.45 * f).toFixed(3) + ')';
          ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, TAU); ctx.fill();
          ctx.fillStyle = 'rgba(240,230,212,' + (0.4 * f).toFixed(3) + ')';
          ctx.beginPath(); ctx.arc(p.x - p.size * 0.2, p.y + p.size * 0.2, p.size * 0.55, 0, TAU); ctx.fill();
        } else if (p.k === PK.PUFF) {
          ctx.fillStyle = 'rgba(255,255,255,' + (0.55 * f).toFixed(3) + ')';
          ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, TAU); ctx.fill();
        } else if (p.k === PK.DECOR) {
          ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.globalAlpha = clamp(p.life / 0.5, 0, 1);
          if (p.shape === 'rose') { ctx.fillStyle = '#e8708a'; ctx.beginPath(); ctx.arc(0, 0, 0.045, 0, TAU); ctx.fill(); ctx.fillStyle = '#b84a66'; ctx.beginPath(); ctx.arc(0, 0, 0.018, 0, TAU); ctx.fill(); }
          else { ctx.fillStyle = p.shape === 'groom' ? '#2d2a32' : '#ffffff'; ctx.fillRect(-0.025, -0.06, 0.05, 0.11); ctx.fillStyle = p.shape === 'groom' ? '#c98b5e' : '#f0c8a0'; ctx.beginPath(); ctx.arc(0, 0.075, 0.025, 0, TAU); ctx.fill(); }
          ctx.restore();
        } else if (p.k === PK.CONFETTI) {
          ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.fillStyle = p.c;
          if (p.max % 0.3 < 0.1) { ctx.beginPath(); ctx.ellipse(0, 0, p.size * 0.7, p.size * 0.7 * Math.max(0.25, Math.abs(Math.cos(p.rot * 3))), 0, 0, TAU); ctx.fill(); }
          else ctx.fillRect(-p.size, -p.size * 0.5, p.size * 2, p.size * Math.max(0.2, Math.abs(Math.cos(p.rot * 3))));
          ctx.restore();
        }
      }
    }
  }

  /* ---------- 16. CAMERA ---------- */
  class Camera {
    constructor() { this.x = 0; this.y = 0; this.vy = 0; this.zoom = 1; this.lead = 0; this.trauma = 0; this.sx = 0; this.sy = 0; }
    snap(x, y, vx, slope = 0) { this.lead = cameraLead(vx, slope); this.x = x + this.lead; this.y = y + 1.0; this.vy = 0; }
    shake(a) { this.trauma = Math.min(1, this.trauma + a); }
    update(dt, tx, ty, vx, speed, T, time, reduced) {
      const leadT = cameraLead(vx, T.slope(tx));
      this.lead += (leadT - this.lead) * (1 - Math.exp(-dt * 2.5));
      this.x += (tx + this.lead - this.x) * (1 - Math.exp(-dt * 7));
      const ahead = T.height(tx + 6 + this.lead * 0.5) - T.height(tx);
      const targetY = ty + clamp(ahead * 0.35, -2.8, 0.8) + 1.0;
      const k = 26, c = 2 * Math.sqrt(k);
      this.vy += (k * (targetY - this.y) - c * this.vy) * dt;
      this.y += this.vy * dt;
      const zt = lerp(1, 0.8, smoothstep(7, 18, speed));
      this.zoom += (zt - this.zoom) * (1 - Math.exp(-dt * 1.5));
      this.trauma = Math.max(0, this.trauma - dt * 1.6);
      const s = this.trauma * this.trauma * (reduced ? 0.06 : 0.22);
      this.sx = s * (Math.sin(time * 37.1) + Math.sin(time * 23.7) * 0.6);
      this.sy = s * (Math.sin(time * 31.3 + 1.7) + Math.sin(time * 19.9) * 0.6);
    }
  }

  /* ---------- 17. SCARF (verlet ribbon) ---------- */
  class Scarf {
    constructor(n, seg) { this.n = n; this.seg = seg; this.x = new Float32Array(n); this.y = new Float32Array(n); this.px = new Float32Array(n); this.py = new Float32Array(n); this.ok = false; this.acc = 0; }
    reset(ax, ay) { for (let i = 0; i < this.n; i++) { this.x[i] = this.px[i] = ax - i * this.seg; this.y[i] = this.py[i] = ay; } this.ok = true; }
    update(dt, ax, ay, windX, windY, t) {
      if (!this.ok || Math.abs(ax - this.x[0]) > 4 || Math.abs(ay - this.y[0]) > 4) this.reset(ax, ay);
      const h = 1 / 120;
      this.acc = Math.min(this.acc + dt, h * 6);
      while (this.acc >= h) {
        this.acc -= h;
        this.x[0] = this.px[0] = ax; this.y[0] = this.py[0] = ay;
        for (let i = 1; i < this.n; i++) {
          const vx = this.x[i] - this.px[i], vy = this.y[i] - this.py[i];
          this.px[i] = this.x[i]; this.py[i] = this.y[i];
          const f = i / this.n, rvx = windX - vx / h, rvy = windY - vy / h;
          const accX = rvx * 3.2 + Math.sin(t * 16 + i * 1.3) * 2.2 * f;
          const accY = -5 + rvy * 3.2 + Math.cos(t * 13 + i * 0.9) * 1.8 * f;
          this.x[i] += vx * 0.985 + accX * h * h; this.y[i] += vy * 0.985 + accY * h * h;
        }
        for (let it = 0; it < 3; it++) {
          for (let i = 1; i < this.n; i++) {
            const dx = this.x[i] - this.x[i - 1], dy = this.y[i] - this.y[i - 1], d = Math.hypot(dx, dy) || 1e-6, diff = (d - this.seg) / d;
            if (i === 1) { this.x[i] -= dx * diff; this.y[i] -= dy * diff; }
            else { this.x[i - 1] += dx * diff * 0.5; this.y[i - 1] += dy * diff * 0.5; this.x[i] -= dx * diff * 0.5; this.y[i] -= dy * diff * 0.5; }
          }
        }
      }
    }
  }

