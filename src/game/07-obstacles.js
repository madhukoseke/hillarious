  /* =====================================================================
   * 7. OBSTACLES: potholes and stairs (terrain), cones, power-ups, the parked
   *    Maybe-Mo and its plank, construction ramps, and cross traffic: cable cars
   *    and stalling Maybe-Mos that cross our street in depth.
   * ===================================================================*/
  function makeSurface(pts, owner, hazard) {
    const flat = new Float64Array(pts.length * 2);
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    pts.forEach((p, i) => {
      flat[2 * i] = p[0]; flat[2 * i + 1] = p[1];
      minX = Math.min(minX, p[0]); maxX = Math.max(maxX, p[0]); minY = Math.min(minY, p[1]); maxY = Math.max(maxY, p[1]);
    });
    return { pts: flat, n: pts.length, minX, maxX, minY, maxY, owner, hazard, active: true };
  }

  // Height of a left-to-right polyline at x, clamped to its ends.
  function polylineY(pts, x) {
    for (let i = 1; i < pts.length; i++) {
      if (x <= pts[i][0]) { const a = pts[i - 1], c = pts[i]; return a[1] + ((c[1] - a[1]) * clamp((x - a[0]) / (c[0] - a[0]), 0, 1)); }
    }
    return pts[pts.length - 1][1];
  }

  // D1's stalled prototype, parked on the slope with a builder's plank leaned on its hatch.
  class ParkedMaybeMo {
    constructor(cd, T, obs) {
      const x = cd.x, y = T.height(x), a = Math.atan(T.slope(x)), ca = Math.cos(a), sa = Math.sin(a);
      const tf = (lx, ly) => [x + lx * ca - ly * sa, y + lx * sa + ly * ca];
      Object.assign(this, { kind: 'car', soft: true, x, y, a, len: CAR_LEN, roofY: tf(1.6, 1.37)[1], midX: tf(1.6, 0)[0], passed: false, near: false, display: 'THINKING' });
      obs.addSurface(CAR_OUTLINE.map(([lx, ly]) => tf(lx, ly)), this, true);
      this.plank = cd.plank ? [tf(-3.85, -0.04), tf(0.9, 1.4), tf(1.15, 1.415)] : null;
      if (this.plank) obs.addSurface(this.plank, this, false);
    }
    update(dt, W) {
      const b = W.bike;
      if (!this.near && b.x > this.x - 26) { this.near = true; W.emit('MAYBEMO_ENCOUNTER', { x: this.x }); }
      if (!this.passed && b.x >= this.midX) {
        this.passed = true;
        const clear = b.y - b.P.rideH - this.roofY;
        if (clear > -0.3) {
          const near = !b.grounded && clear < 1.0;
          if (near) { W.score.nearMisses++; W.score.style += 75; }
          this.display = 'TRAINED';
          W.emit('MAYBEMO_OVER', { near, clear });
        }
      }
    }
    onRespawn(x) { if (this.midX > x) { this.passed = false; this.near = false; this.display = 'THINKING'; } }
  }

  // Cross traffic moves along the cross street, i.e. in depth z (metres; + = away from the camera).
  // It blocks our lane while its body overlaps [LANE.near, LANE.far], and never starts blocking on the rider.
  const LANE = { near: -0.6, far: 1.3 };
  const CROSSER = {
    cablecar: { speed: 4.6, len: 8.6, width: 2.6, height: 3.3, zEnd: -14, soft: false },
    maybemo: { speed: 6, len: 3.9, width: 1.8, height: 1.5, zEnd: -14, soft: true, z0: 14, stopZ: 0.35, stopTime: 3.2 },
  };
  class CrossTraffic {
    constructor(cd, T, obs) {
      this.kind = cd.kind; this.P = CROSSER[cd.kind]; this.soft = this.P.soft;
      this.cx = cd.x; this.trigger = cd.trigger; this.sign = cd.sign || '';
      this.y = T.height(cd.x);
      this.z0 = this.kind === 'cablecar' ? LANE.far + (cd.lead || 3) * this.P.speed : this.P.z0;
      const hw = this.P.width * 0.5 * 0.85, H = this.P.height; // forgiving: 85% of the drawn width
      this.x0 = this.cx - hw; this.x1 = this.cx + hw;
      this.box = obs.addSurface([[this.x0, this.y - 0.1], [this.x0, this.y + H], [this.x1, this.y + H], [this.x1, this.y - 0.1]], this, true);
      this.reset();
    }
    reset() {
      Object.assign(this, { state: 'IDLE', z: this.z0, pz: this.z0, v: 0, t: 0, blocking: false, held: false, heldSaid: false, unblockT: -9, passChecked: false, overDone: false, bellT: 0 });
      this.box.active = false;
    }
    get active() { return this.state !== 'IDLE' && this.state !== 'DONE'; }
    overlaps(z) { return z < LANE.far && z + this.P.len > LANE.near; }
    timeToBlock() {
      if (!this.active) return Infinity;
      if (this.blocking) return 0;
      return Math.max(0, (this.z - LANE.far) / Math.max(1.5, this.kind === 'cablecar' ? this.P.speed : this.v));
    }
    timeToClear() {
      if (!this.active) return 0;
      if (this.kind === 'cablecar') return Math.max(0, (this.z + this.P.len - LANE.near) / this.P.speed);
      const stop = this.state === 'STOPPED' ? Math.max(0, this.P.stopTime - this.t) : this.state === 'RESUMING' ? 0 : this.P.stopTime + 2;
      return stop + Math.max(0, this.z + this.P.len - LANE.near) / 4;
    }
    riderOnTop(b) { return b.x + 1 > this.x0 && b.x - 1 < this.x1 && b.y - b.P.rideH > this.y + this.P.height - 0.4; }
    update(dt, W) {
      const b = W.bike, P = this.P;
      this.pz = this.z; this.t += dt;
      if (this.state === 'IDLE') {
        if (W.state === 'riding' && b.x > this.trigger) {
          this.state = this.kind === 'cablecar' ? 'CROSSING' : 'DRIVING';
          this.t = 0; this.v = P.speed; this.bellT = 0;
          W.emit(this.kind === 'cablecar' ? 'CABLE_CAR_ENCOUNTER' : 'MAYBEMO_ENCOUNTER', { x: this.cx, crosser: true });
        }
        return;
      }
      if (this.state === 'DONE') return;
      if (this.kind === 'maybemo') {
        switch (this.state) {
          case 'DRIVING': this.v = P.speed; if (this.z < 6) { this.state = 'THINKING'; this.t = 0; W.emit('MAYBEMO_THINK', {}); } break;
          case 'THINKING': this.v = Math.max(3, this.v - 5 * dt); if (this.t > 0.6) { this.state = 'BRAKING'; this.t = 0; } break;
          case 'BRAKING': {
            const d = Math.max(0.02, this.z - P.stopZ);
            this.v = Math.max(0, this.v - Math.min(9, (this.v * this.v) / (2 * d)) * dt);
            if (this.v < 0.05 || this.z <= P.stopZ + 0.01) { this.v = 0; this.state = 'STOPPED'; this.t = 0; W.emit('MAYBEMO_STOPPED', {}); }
            break;
          }
          case 'STOPPED':
            this.v = 0;
            if ((this.t > P.stopTime || (this.overDone && this.t > 0.8)) && !this.riderOnTop(b)) { this.state = 'RESUMING'; this.t = 0; W.emit('MAYBEMO_RESUME', {}); }
            break;
          case 'RESUMING': this.v = Math.min(9, this.v + 3.5 * dt); break;
          default: break;
        }
      } else {
        this.bellT -= dt;
        if (this.bellT <= 0 && this.z > LANE.near - 3) { this.bellT = 1.4; W.emit('CABLE_BELL', {}); }
      }
      // Never start blocking on top of the rider: hold just outside the lane until they are clear.
      const next = this.z - this.v * dt;
      const slack = Math.abs(b.vx) < 1 ? 0.15 : Math.min(3.5, Math.abs(b.vx) * 0.25);
      const riderIn = b.x + 0.95 + slack > this.x0 && b.x - 0.95 < this.x1 + 0.3;
      if (!this.blocking && this.overlaps(next) && riderIn) {
        this.held = true;
        if (!this.heldSaid && W.state === 'riding') { this.heldSaid = true; W.emit(this.kind === 'cablecar' ? 'CABLE_CAR_HOLD' : 'MAYBEMO_HOLD', {}); }
      } else { this.z = next; this.held = false; }
      const was = this.blocking;
      this.blocking = this.overlaps(this.z);
      if (was && !this.blocking) this.unblockT = W.t;
      this.box.active = this.blocking;
      if (this.z < P.zEnd) { this.state = 'DONE'; this.blocking = false; this.box.active = false; }
      if (W.state === 'riding' && !this.passChecked && b.x > this.cx) { // the rider crossed our crossing point
        this.passChecked = true;
        if (this.blocking) {
          if (this.kind === 'maybemo' && b.y - b.P.rideH > this.y + P.height - 0.3) {
            this.overDone = true;
            const clear = b.y - b.P.rideH - (this.y + P.height), near = !b.grounded && clear < 1.0;
            if (near) { W.score.nearMisses++; W.score.style += 75; }
            W.emit('MAYBEMO_OVER', { near, clear });
          }
        } else if ((this.active && this.timeToBlock() < 0.9) || W.t - this.unblockT < 0.9) {
          W.score.nearMisses++; W.score.style += 75;
          W.emit('NEAR_MISS', { kind: this.kind });
        }
      }
    }
    onRespawn(x) {
      if (x < this.trigger) this.reset();
      else if (x < this.cx + 4 && this.state !== 'DONE') { this.state = 'DONE'; this.blocking = false; this.box.active = false; }
    }
  }

  class Obstacles {
    constructor(world) {
      const C = world.course, T = world.terrain;
      this.w = world;
      this.surfaces = [];
      this.cones = C.cones.map((x) => {
        const y = T.height(x), a = Math.atan(T.slope(x));
        return { x0: x, y0: y, a0: a, x, y, a, px: x, py: y, pa: a, vx: 0, vy: 0, w: 0, state: 0, rest: 0 };
      });
      this.cars = C.cars.map((cd) => new ParkedMaybeMo(cd, T, this));
      this.ramps = C.ramps.map((rd) => this.makeRamp(rd, T));
      this.crossers = C.crossers.map((cd) => new CrossTraffic(cd, T, this));
      this.powerups = C.powerups.map((pu) => ({ kind: pu.kind, x: pu.x, y: T.height(pu.x) + 1.15, taken: false }));
      this.potholes = C.potholes.map((ph) => ({ x0: ph.x0, x1: ph.x1, depth: ph.depth, hit: false }));
      this.stairs = C.stairs.map((st) => Object.assign({ entered: false }, st));
      this.boardwalk = C.boardwalk ? Object.assign({ kind: 'boardwalk', entered: false }, C.boardwalk) : null;
      if (this.boardwalk) { this.boardwalk.surface = this.addSurface(C.boardwalk.pts, this.boardwalk, false); this.boardwalk.surface.active = false; }
    }
    // The boardwalk is solid only once both wheels are above it. One-way contact alone isn't enough: a road rider's
    // body sticks up through the deck, counts as on top of it, and would hang there. Once on, it stays solid through
    // a hard landing's suspension travel; a respawn on the road clears it.
    updateBoardwalk(b) {
      const walk = this.boardwalk;
      if (!walk) return;
      const ca = Math.cos(b.a), sa = Math.sin(b.a), gy = b.y - b.P.rideH;
      const margin = walk.surface.active && b.x >= walk.x0 ? 0.6 : 0;
      walk.surface.active = b.wheels.every((wh) => gy + wh.lx * sa > polylineY(walk.pts, b.x + wh.lx * ca) - margin);
    }
    addSurface(pts, owner, hazard) { const S = makeSurface(pts, owner, hazard); this.surfaces.push(S); return S; }
    // A-frame construction ramp: launches you at speed, rolls you over gently when slow.
    makeRamp(rd, T) {
      const x0 = rd.x, y0 = T.height(x0), a = Math.atan(T.slope(x0 + 2)), ca = Math.cos(a), sa = Math.sin(a);
      const tf = (lx, ly) => [x0 + lx * ca - ly * sa, y0 + lx * sa + ly * ca];
      const ramp = { kind: 'ramp', x: x0, a, pts: [tf(-0.2, -0.05), tf(3.2, 0.95), tf(3.4, 0.97), tf(5.3, -0.05)], lip: tf(3.3, 0.96), end: tf(5.3, 0)[0] };
      this.addSurface(ramp.pts, ramp, false);
      return ramp;
    }
    // One-way polylines: only collide from the outward side.
    querySurfaces(cx, cy, r, out) {
      for (let s = 0; s < this.surfaces.length; s++) {
        const S = this.surfaces[s];
        if (!S.active || cx + r < S.minX || cx - r > S.maxX || cy + r < S.minY || cy - r > S.maxY) continue;
        const P = S.pts;
        for (let i = 0; i < S.n - 1; i++) {
          const ax = P[2 * i], ay = P[2 * i + 1], sx = P[2 * i + 2] - ax, sy = P[2 * i + 3] - ay;
          const L2 = sx * sx + sy * sy;
          let t = ((cx - ax) * sx + (cy - ay) * sy) / L2;
          t = t < 0 ? 0 : t > 1 ? 1 : t;
          const px = ax + sx * t, py = ay + sy * t, ddx = cx - px, ddy = cy - py;
          if (ddx * -sy + ddy * sx < 0) continue;
          const d = Math.sqrt(ddx * ddx + ddy * ddy), pen = r - d;
          if (pen > out.pen) {
            out.pen = pen; out.px = px; out.py = py; out.surf = S;
            if (d > 1e-6) { out.nx = ddx / d; out.ny = ddy / d; }
            else { const L = Math.sqrt(L2); out.nx = -sy / L; out.ny = sx / L; }
          }
        }
      }
    }
    // Rider interactions (riding state only).
    update(dt) {
      const W = this.w, b = W.bike;
      for (const c of this.cones) {
        if (c.state !== 0) continue;
        for (const wh of b.wheels) {
          if (Math.abs(wh.hx - c.x) < b.P.wheelR + 0.16 && wh.hy - c.y < b.P.wheelR + 0.42 && wh.hy > c.y - 0.2) { this.knock(c, b); break; }
        }
      }
      for (const car of this.cars) car.update(dt, W);
      for (const pu of this.powerups) {
        if (!pu.taken && Math.abs(b.x - pu.x) < 0.9 && Math.abs(b.y - 0.2 - pu.y) < 1.0) { pu.taken = true; W.collect(pu); }
      }
      for (const ph of this.potholes) {
        if (ph.hit) continue;
        for (const wh of b.wheels) {
          if (wh.contact && !wh.surf && wh.hx > ph.x0 + 0.2 && wh.hx < ph.x1 - 0.2) { // a wheel went down into it
            ph.hit = true; W.emit('POTHOLE', { x: wh.hx }); break;
          }
        }
      }
      for (const st of this.stairs) if (!st.entered && b.x > st.x0 - 1.5) { st.entered = true; W.emit('STAIRS', { x: st.x0 }); }
      const walk = this.boardwalk;
      if (walk && !walk.entered && b.x < walk.x1 - 5 && b.wheels.some((wh) => wh.contact && wh.surf && wh.surf.owner === walk)) { walk.entered = true; W.emit('BOARDWALK', { x: b.x }); }
    }
    // Things that move on their own, in every world state.
    updateDynamic(dt) { for (const c of this.crossers) c.update(dt, this.w); }
    knock(c, b) {
      c.state = 1;
      c.vx = Math.max(b.vx, 2) * 1.15 + 1; c.vy = 3 + Math.abs(b.vx) * 0.18; c.w = -10 - Math.abs(b.vx) * 0.5;
      b.vx -= Math.sign(b.vx) * Math.min(Math.abs(b.vx) * 0.06, 0.8);
      this.w.cargo.kick(0.5);
      this.w.emit('CONE', { x: c.x, y: c.y });
    }
    updateProps(dt) {
      const T = this.w.terrain;
      for (const c of this.cones) {
        c.px = c.x; c.py = c.y; c.pa = c.a;
        if (c.state !== 1) continue;
        c.vy -= this.w.phys.g * dt; c.x += c.vx * dt; c.y += c.vy * dt; c.a += c.w * dt;
        const h = T.height(c.x);
        if (c.y < h + 0.05) {
          c.y = h + 0.05;
          if (c.vy < 0) c.vy *= -0.35;
          c.vx *= 0.75; c.w *= 0.6;
          if (Math.abs(c.vx) < 0.4 && Math.abs(c.vy) < 0.8) { c.rest += dt; if (c.rest > 0.15) { c.state = 2; c.a = Math.atan(T.slope(c.x)) + Math.PI / 2; } }
        }
      }
    }
    onRespawn(x) {
      if (this.boardwalk) this.boardwalk.surface.active = false; // back on the road
      for (const car of this.cars) car.onRespawn(x);
      for (const c of this.crossers) c.onRespawn(x);
      for (const ph of this.potholes) if (ph.x0 > x) ph.hit = false;
      for (const st of this.stairs) if (st.x0 > x) st.entered = false;
    }
    // A new Test Hill lap: knocked cones stand back up and the power-ups return.
    resetProps() {
      for (const c of this.cones) Object.assign(c, { x: c.x0, y: c.y0, a: c.a0, px: c.x0, py: c.y0, pa: c.a0, vx: 0, vy: 0, w: 0, state: 0, rest: 0 });
      for (const pu of this.powerups) pu.taken = false;
    }
  }

