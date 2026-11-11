  /* =====================================================================
   * 5. BICYCLE: rigid chassis + two raycast-style wheel suspensions
   * ===================================================================*/
  const FRAME_PTS = [[-0.08, -0.64, 0.06], [-0.33, -0.02, 0.06], [0.3, 0.14, 0.06], [0.8, -0.14, 0.05], [-0.78, -0.3, 0.05]];
  const RIDER_PTS = [[0.03, 0.73, 0.15], [-0.12, 0.42, 0.12]]; // head, upper back
  const NO_INPUT = Object.freeze({ pedal: false, brake: false, leanBack: false, leanFwd: false, jumpHeld: false, jumpPressed: false });
  const HOLD_INPUT = Object.freeze({ pedal: false, brake: true, leanBack: false, leanFwd: false, jumpHeld: false, jumpPressed: false });

  class Bike {
    constructor(P = EARTH) {
      this.P = P;
      this.wheels = [-P.wheelBase / 2, P.wheelBase / 2].map((lx) => ({
        lx, contact: false, was: false, comp: P.sag, pcomp: P.sag, spin: 0, pspin: 0, spinV: 0, load: 0,
        nx: 0, ny: 1, cx: 0, cy: 0, pen: 0, excess: 0, rigid: false, surf: null, hx: 0, hy: 0,
      }));
      this.q = { pen: 0, px: 0, py: 0, nx: 0, ny: 1, surf: null };
      this.tmp = { x: 0, y: 0 }; this.land = { x: 0, a: 0, t: 0 };
      this.reset(0, P.rideH, 0, 0);
    }
    reset(x, y, a, speed) {
      Object.assign(this, {
        x, y, a, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, w: 0, px: x, py: y, pa: a,
        grounded: true, airTime: 0, groundTime: 1, lastGroundT: -1, bothT: 0, jumpBufferUntil: -1, jumpHold: 0, jumpedAt: -10,
        crank: 0, pcrank: 0, lean: 0, leanIn: 0, pedalIn: 0, brakeIn: 0, brakeAmt: 0, crashed: false, boost: 1,
        impact: 0, touchImpact: 0, bottomOut: 0, bigAirSent: false, takeoffX: x,
      });
      for (const wh of this.wheels) {
        wh.contact = true; wh.was = true; wh.comp = wh.pcomp = this.P.sag; wh.spin = wh.pspin = 0; wh.spinV = 0;
        wh.load = 0; wh.rigid = false; wh.excess = 0; wh.surf = null;
      }
    }
    localToWorld(lx, ly, out) {
      const c = Math.cos(this.a), s = Math.sin(this.a);
      out.x = this.x + lx * c - ly * s; out.y = this.y + lx * s + ly * c;
      return out;
    }
    applyImpulse(px, py, nx, ny, e, mu) {
      const m = this.P.mass, I = this.P.inertia;
      const rx = px - this.x, ry = py - this.y;
      const vn = (this.vx - this.w * ry) * nx + (this.vy + this.w * rx) * ny;
      if (vn >= 0) return vn;
      const rn = rx * ny - ry * nx;
      const jn = (-(1 + e) * vn) / (1 / m + (rn * rn) / I);
      this.vx += (jn * nx) / m; this.vy += (jn * ny) / m; this.w += (rn * jn) / I;
      if (mu > 0) {
        const tx = ny, ty = -nx;
        const vt = (this.vx - this.w * ry) * tx + (this.vy + this.w * rx) * ty;
        const rt = rx * ty - ry * tx;
        const jt = clamp(-vt / (1 / m + (rt * rt) / I), -mu * jn, mu * jn);
        this.vx += (jt * tx) / m; this.vy += (jt * ty) / m; this.w += (rt * jt) / I;
      }
      return vn;
    }
    frameContact(lx, ly, r, world) {
      const p = this.localToWorld(lx, ly, this.tmp), q = this.q;
      world.queryCircle(p.x, p.y, r, q, true);
      if (q.pen <= 0) return false;
      const S = q.surf, soft = S && S.owner && S.owner.soft;
      const vn = soft ? this.applyImpulse(this.x, this.y, q.nx, q.ny, 0.35, 0) : this.applyImpulse(q.px, q.py, q.nx, q.ny, 0.15, this.crashed ? 0.7 : 0.3);
      if (S && S.hazard && Math.abs(q.nx) > 0.6) world.onSideHit(-vn, S); // the frame hit something's side
      const corr = Math.min(q.pen, 0.08) * 0.8;
      this.x += q.nx * corr; this.y += q.ny * corr;
      return true;
    }
    // Where the current flight lands (x), on what slope (a), and in how long (t). The landing assist and the
    // Free Ride physics overlay both read it.
    predictLanding(world, out) {
      const T = world.terrain, g = this.P.g;
      let t = 0.3;
      for (let k = 0; k < 3; k++) {
        const hl = T.height(this.x + this.vx * t) + this.P.rideH * 0.9;
        const disc = this.vy * this.vy + 2 * g * Math.max(0, this.y - hl);
        t = clamp((this.vy + Math.sqrt(disc)) / g, 0.02, 2);
      }
      out.x = this.x + this.vx * t; out.a = Math.atan(T.slope(out.x)); out.t = t;
      return out;
    }
    predictLandingAngle(world) { return this.predictLanding(world, this.land).a; }
    step(dt, inp, world, t) {
      const P = this.P, m = P.mass, I = P.inertia, q = this.q;
      this.px = this.x; this.py = this.y; this.pa = this.a; this.pcrank = this.crank;
      const live = !this.crashed;
      const pedal = live && inp.pedal, brake = live && inp.brake;
      const leanIn = live ? (inp.leanBack ? 1 : 0) - (inp.leanFwd ? 1 : 0) : 0;
      this.brakeAmt = brake ? Math.min(1, this.brakeAmt + dt / P.brakeRamp) : Math.max(0, this.brakeAmt - dt * 8);
      this.pedalIn = pedal ? 1 : 0; this.brakeIn = this.brakeAmt; this.leanIn = leanIn;
      this.lean += (leanIn - this.lean) * Math.min(1, dt * 9);
      const ca = Math.cos(this.a), sa = Math.sin(this.a), dx = sa, dy = -ca; // suspension axis (local down)
      let fx = 0, fy = -P.g * m, tau = 0, nContact = 0, rear = false, front = false, sumNx = 0, sumNy = 0, tauRear = 0, tauFront = 0;

      for (let i = 0; i < 2; i++) {
        const wh = this.wheels[i];
        wh.pcomp = wh.comp; wh.pspin = wh.spin;
        const mx = this.x + wh.lx * ca - P.mountY * sa, my = this.y + wh.lx * sa + P.mountY * ca;
        const hx = mx + dx * P.suspRest, hy = my + dy * P.suspRest;
        world.queryCircle(hx, hy, P.wheelR, q, true);
        if (q.pen <= 0) {
          wh.contact = false; wh.was = false; wh.load = 0; wh.rigid = false; wh.excess = 0; wh.surf = null;
          wh.comp += (0 - wh.comp) * Math.min(1, dt * 20);
          wh.spinV *= 1 - 0.4 * dt;
          if (i === 0 && pedal) wh.spinV = Math.max(wh.spinV - 30 * dt, -45);
          wh.spin += wh.spinV * dt;
          wh.hx = hx - dx * wh.comp; wh.hy = hy - dy * wh.comp;
          continue;
        }
        const nx = q.nx, ny = q.ny, cosA = -(dx * nx + dy * ny);
        const rx = q.px - this.x, ry = q.py - this.y;
        const vpx = this.vx - this.w * ry, vpy = this.vy + this.w * rx;
        const vn = vpx * nx + vpy * ny;
        if (!wh.was && -vn > this.touchImpact) this.touchImpact = -vn;
        wh.was = true; wh.contact = true;
        wh.nx = nx; wh.ny = ny; wh.cx = q.px; wh.cy = q.py; wh.surf = q.surf; wh.pen = q.pen;
        const tx = ny, ty = -nx, vt = vpx * tx + vpy * ty;
        wh.spinV = -vt / P.wheelR; wh.spin += wh.spinV * dt;
        if (cosA < 0.45) { // contact far off the suspension axis: rigid (fork) response
          wh.rigid = true; wh.excess = q.pen; wh.load = 0;
          wh.hx = hx; wh.hy = hy;
          nContact++; if (i === 0) rear = true; else front = true; sumNx += nx; sumNy += ny;
          continue;
        }
        wh.rigid = false;
        const c = q.pen / cosA, cc = c < P.suspTravel ? c : P.suspTravel;
        wh.comp = cc; wh.excess = (c - P.suspTravel) * cosA;
        wh.hx = hx - dx * cc; wh.hy = hy - dy * cc;
        let F = P.springK * cc - P.springC * vn;
        if (F < 0) F = 0;
        wh.load = F;
        if (F > 60) { nContact++; if (i === 0) rear = true; else front = true; sumNx += nx; sumNy += ny; } // grounded = loaded, not merely touching
        fx += F * nx; fy += F * ny;
        if (i === 0) tauRear += rx * F * ny - ry * F * nx; else tauFront += rx * F * ny - ry * F * nx;
        const fric = P.mu * F;
        let Ft = 0;
        if (i === 0 && pedal) {
          const vmax = P.pedalVmax * (this.boost > 1 ? 1.3 : 1);
          Ft += Math.min(m * P.pedalA * this.boost * Math.max(0, 1 - Math.max(0, vt) / vmax), fric);
        }
        if (brake) {
          const share = i === 1 ? P.brakeFront : 1 - P.brakeFront;
          const Fb = Math.min(share * m * P.brakeA * this.brakeAmt, fric, (share * m * Math.abs(vt)) / dt);
          Ft -= vt > 0 ? Fb : -Fb;
        }
        const Fr = Math.min(P.rollCrr * F, (0.5 * m * Math.abs(vt)) / dt);
        Ft -= vt > 0 ? Fr : -Fr;
        const limit = wh.surf && wh.surf.owner && wh.surf.owner.speedLimit; // the boardwalk's narrow boards hold you to a pace
        if (limit && vt > limit) Ft -= Math.min(m * 4 * (vt - limit), fric);
        fx += Ft * tx; fy += Ft * ty;
        tau += P.pitchCoupling * (rx * Ft * ty - ry * Ft * tx);
      }

      const sp = Math.hypot(this.vx, this.vy);
      if (rear && front) this.bothT = t;
      const lipPop = live && rear && !front && sp > 5 && t - this.bothT < P.lipPopTime;
      tau += tauRear * (lipPop ? P.lipPop : 1) + tauFront;
      fx -= P.drag * m * sp * this.vx; fy -= P.drag * m * sp * this.vy;

      if (this.jumpHold > 0) { // variable hop height: reduced gravity while held and rising
        if (inp.jumpHeld && this.vy > 0) { fy += P.g * m * (1 - P.jumpHoldGrav); this.jumpHold -= dt; }
        else this.jumpHold = 0;
      }

      const grounded = nContact > 0;
      if (live) {
        if (grounded) {
          tau += leanIn * P.leanGround;
          const rel = wrapAngle(this.a - Math.atan2(-sumNx, sumNy));
          if (rear && !front && rel > P.wheelieLimit) tau -= (rel - P.wheelieLimit) * P.wheelieK + Math.max(0, this.w) * P.wheelieD;
          else if (front && !rear && rel < -P.wheelieLimit) tau += (-P.wheelieLimit - rel) * P.wheelieK - Math.min(0, this.w) * P.wheelieD;
        } else {
          if (leanIn !== 0) {
            if (leanIn * this.w < P.airMaxW) tau += leanIn * I * P.airAccel;
          } else if (Math.abs(this.w) < P.assistMaxW) { // landing assist: ease toward the slope we'll land on
            const err = wrapAngle(this.predictLandingAngle(world) - this.a);
            if (Math.abs(err) < 1.7) tau += I * clamp(P.assistKp * err - P.assistKd * this.w, -P.assistMax, P.assistMax);
          }
          tau -= I * P.airDamp * this.w;
        }
      }

      this.vx += (fx / m) * dt; this.vy += (fy / m) * dt; this.w += (tau / I) * dt;

      this.bottomOut = 0;
      for (let i = 0; i < 2; i++) {
        const wh = this.wheels[i];
        if (!wh.contact || (!wh.rigid && wh.excess <= 0)) continue;
        // Soft obstacles (Maybe-Mo airbags) bounce the whole bike back without throwing the rider over the bars.
        const soft = wh.rigid && wh.surf && wh.surf.owner && wh.surf.owner.soft;
        const vn = soft ? this.applyImpulse(this.x, this.y, wh.nx, wh.ny, 0.35, 0) : this.applyImpulse(wh.cx, wh.cy, wh.nx, wh.ny, wh.rigid ? 0.2 : 0, 0);
        if (wh.rigid) world.onSideHit(-vn, wh.surf);
        else if (-vn > this.bottomOut) this.bottomOut = -vn;
        const corr = Math.min(wh.excess, 0.06) * 0.8;
        this.x += wh.nx * corr; this.y += wh.ny * corr;
      }
      for (let k = 0; k < FRAME_PTS.length; k++) this.frameContact(FRAME_PTS[k][0], FRAME_PTS[k][1], FRAME_PTS[k][2], world);

      this.x += this.vx * dt; this.y += this.vy * dt; this.a += this.w * dt;
      const spd = Math.hypot(this.vx, this.vy);
      if (spd > P.maxSpeed) { this.vx *= P.maxSpeed / spd; this.vy *= P.maxSpeed / spd; }
      this.w = clamp(this.w, -P.maxW, P.maxW);
      if (pedal) this.crank -= dt * (5 + Math.max(0, this.vx) * 0.85); // clockwise, like the wheels, when riding forward

      const was = this.grounded;
      this.grounded = grounded;
      if (grounded) {
        this.impact = Math.max(this.touchImpact, this.bottomOut);
        if (!was && this.airTime > 0.12) world.onLand(this.impact, this.airTime, this);
        this.touchImpact = 0; this.lastGroundT = t; this.airTime = 0; this.groundTime += dt; this.bigAirSent = false;
      } else {
        if (was) this.takeoffX = this.x;
        this.airTime += dt; this.groundTime = 0;
        if (!this.bigAirSent && this.airTime > 0.6) { this.bigAirSent = true; world.onBigAir(this); }
      }

      if (live) {
        if (inp.jumpPressed) this.jumpBufferUntil = t + P.jumpBuffer;
        const canJump = (grounded || t - this.lastGroundT <= P.coyote) && t - this.jumpedAt > 0.25;
        if (canJump && t <= this.jumpBufferUntil) {
          let nx = 0, ny = 1;
          if (nContact) { const L = Math.hypot(sumNx, sumNy) || 1; nx = sumNx / L; ny = sumNy / L; }
          let jx = 0.3 * nx, jy = 0.7 + 0.3 * ny;
          const jl = Math.hypot(jx, jy); jx /= jl; jy /= jl;
          const vIn = this.vx * nx + this.vy * ny;
          if (vIn < 0) { this.vx -= vIn * nx; this.vy -= vIn * ny; }
          this.vx += jx * P.jumpV; this.vy += jy * P.jumpV; this.w += P.hopSpin;
          this.jumpHold = P.jumpHoldTime; this.jumpedAt = t; this.jumpBufferUntil = -1; this.lastGroundT = -10;
          world.emit('HOP', { x: this.x, y: this.y });
        }
        if (world.state === 'riding' && world.invuln <= 0) {
          for (let k = 0; k < RIDER_PTS.length; k++) {
            const p = this.localToWorld(RIDER_PTS[k][0], RIDER_PTS[k][1], this.tmp);
            world.queryCircle(p.x, p.y, RIDER_PTS[k][2], q, true);
            if (q.pen > 0) { world.crash('head', clamp(spd / 14, 0, 1)); break; }
          }
        }
      }
    }
  }

