  /* =====================================================================
   * 10. WORLD: owns the simulation and its event queue
   * ===================================================================*/
  class World {
    // opts.startCp starts the run at a checkpoint (Free Ride); opts.unbreakable keeps the cargo whole (it still sloshes).
    constructor(course, opts) {
      this.course = course; this.terrain = course.terrain; this.opts = opts || {};
      this.phys = physicsFor(course.planet); // course.planet: unset means Earth
      this.bike = new Bike(this.phys);
      this.cargo = makeCargo(course.cargo);
      this.score = new Score(course.par, this.cargo.kind);
      this.obstacles = new Obstacles(this);
      this.events = []; this.t = 0; this.state = 'riding'; this.cpIndex = 0; this.crashT = 0; this.invuln = 0;
      this.rag = { on: false, x: 0, y: 0, px: 0, py: 0, vx: 0, vy: 0, a: 0, pa: 0, w: 0 };
      this.cup = { on: false, x: 0, y: 0, px: 0, py: 0, vx: 0, vy: 0, a: 0, pa: 0, w: 0 }; // flying cargo during a crash
      this.lastBonk = -9; this.brakeT = -9; this.flags = {}; this.hintIdx = 0;
      this.spill = { episode: 0, quiet: 0, acc: 0, causes: {} };
      this.lastT = {}; // world time each event type last fired
      this.boostT = 0; this.fastT = -9; this.slowAcc = 0; this.slowT = -9; this.wobbleT = -9;
      this.deliveredAt = -1;
      this.tq = { pen: 0, px: 0, py: 0, nx: 0, ny: 1, surf: null };
      this.tmp = { x: 0, y: 0 };
      this.zones = (course.stopZones || []).map((z) => ({ x0: z.x0, x1: z.x1, done: false })); // drill STOP boxes
      this.feats = { bigLipAir: 0, rampCrash: false, gustLoss: 0 }; // goal and drill evidence
      this.runLog = []; this.laps = 0;                // crashes and spills by position, for "Practice this spot"
      this.inputLog = [];                             // every step's input, packed (packInput), for crash replays (F-32)
      this.splits = [];                               // ride time at each checkpoint after the start, then at the finish (F-35)
      this.fogHz = fogHazards(course); this.fogIdx = 0; this.inFog = false; // fog warnings (F-40)
      this.spawn(course.start, 0);
      const cp = this.opts.startCp | 0;
      if (cp > 0 && cp < course.checkpoints.length) {
        const x = course.checkpoints[cp].x;
        this.cpIndex = cp; this.spawn(x, 0); this.obstacles.onRespawn(x);
        while (this.hintIdx < course.hints.length && course.hints[this.hintIdx].x < x) this.hintIdx++; // no backlog of hints
        this.fogFrom(x);
      }
    }
    emit(type, data) {
      const e = data || {};
      e.type = type; e.t = this.t;
      this.lastT[type] = this.t;
      this.events.push(e);
      if (this.events.length > 400) this.events.shift();
    }
    drain() { const ev = this.events; this.events = []; return ev; }
    spawn(x, speed) {
      const T = this.terrain, s = T.slope(x), inv = 1 / Math.sqrt(1 + s * s);
      this.bike.reset(x - s * inv * this.phys.rideH, T.height(x) + inv * this.phys.rideH, Math.atan(s), speed);
      this.cargo.resetSlosh();
    }
    // Deepest contact between a circle and the terrain or obstacle surfaces.
    queryCircle(cx, cy, r, out, withObstacles) {
      out.pen = -1e9; out.surf = null;
      const T = this.terrain, hc = T.height(cx);
      if (cy - hc < r * 1.6 + 0.4) {
        if (cy < hc) { // center below ground: push straight out
          const s = T.slope(cx), inv = 1 / Math.sqrt(1 + s * s);
          out.nx = -s * inv; out.ny = inv; out.px = cx; out.py = hc; out.pen = r + (hc - cy) * inv;
        } else {
          const N = 10, x0 = cx - r * 1.1, span = r * 2.2;
          let ax = x0, ay = T.height(x0), best = Infinity, bx = cx, by = hc;
          for (let i = 1; i <= N; i++) {
            const x = x0 + (span * i) / N, y = T.height(x), sx = x - ax, sy = y - ay, L2 = sx * sx + sy * sy;
            let t = ((cx - ax) * sx + (cy - ay) * sy) / L2;
            t = t < 0 ? 0 : t > 1 ? 1 : t;
            const px = ax + sx * t, py = ay + sy * t, d2 = (cx - px) * (cx - px) + (cy - py) * (cy - py);
            if (d2 < best) { best = d2; bx = px; by = py; }
            ax = x; ay = y;
          }
          const d = Math.sqrt(best);
          out.pen = r - d; out.px = bx; out.py = by;
          if (d > 1e-6) { out.nx = (cx - bx) / d; out.ny = (cy - by) / d; }
          else { const s = T.slope(bx), inv = 1 / Math.sqrt(1 + s * s); out.nx = -s * inv; out.ny = inv; }
        }
      }
      if (withObstacles) this.obstacles.querySurfaces(cx, cy, r, out);
      return out;
    }
    step(inp) {
      const dt = STEP, b = this.bike;
      this.inputLog.push(packInput(inp));
      this.t += dt;
      if (this.invuln > 0) this.invuln -= dt;
      b.boost = this.boostT > 0 ? 1.6 : 1;
      if (this.boostT > 0) this.boostT = Math.max(0, this.boostT - dt);
      this.obstacles.updateBoardwalk(b);
      switch (this.state) {
        case 'riding': {
          b.step(dt, inp, this, this.t);
          if (this.state !== 'riding') break;
          const windDmg = this.cargo.update(dt, b, !!this.opts.unbreakable, this.windAt(b.x, b.y));
          this.feats.gustLoss += this.cargo.windShare(windDmg); // what the gust took, for the goal
          this.trackDamage(windDmg, dt);
          this.drainCargo();
          this.score.time += dt;
          this.obstacles.update(dt);
          this.progress(inp, dt);
          if (b.x >= this.course.finishX) {
            if (this.course.loop) this.lap();
            else { this.state = 'finishing'; this.splits[this.course.checkpoints.length - 1] = this.score.time; this.emit('FINISH_LINE', { split: this.score.time }); }
          }
          break;
        }
        case 'crashed': {
          b.step(dt, NO_INPUT, this, this.t);
          this.updateBody(this.rag, dt, 0.3, 0.3);
          this.updateBody(this.cup, dt, 0.12, 0.35);
          this.crashT += dt;
          if (this.crashT >= CRASH_TIME) this.respawn();
          break;
        }
        case 'finishing': {
          b.step(dt, NO_INPUT, this, this.t);
          const d = this.course.doorX - b.x, v = Math.max(0, b.vx);
          if (d > 0.25 && v > 0.2) b.vx = Math.max(0, v - clamp((v * v) / (2 * d), 2.5, 16) * dt);
          else {
            b.vx *= 0.8;
            if (Math.abs(b.vx) < 0.12) { b.vx = 0; this.state = 'done'; this.deliveredAt = this.t; this.emit('DELIVERED', this.result()); }
          }
          this.cargo.update(dt, b, true);
          this.cargo.events.length = 0;
          break;
        }
        case 'done': {
          b.step(dt, HOLD_INPUT, this, this.t);
          this.cargo.update(dt, b, true);
          this.cargo.events.length = 0;
          break;
        }
        default: break;
      }
      this.obstacles.updateDynamic(dt);
      this.obstacles.updateProps(dt);
      if (!this.finite()) this.sanityReset();
    }
    drainCargo() {
      const ev = this.cargo.events;
      if (!ev.length) return;
      for (const e of ev) { e.x = this.bike.x; e.y = this.bike.y; this.emit(e.type, e); }
      ev.length = 0;
    }
    progress(inp, dt) {
      const b = this.bike, C = this.course;
      while (this.cpIndex + 1 < C.checkpoints.length && b.x >= C.checkpoints[this.cpIndex + 1].x) {
        this.cpIndex++;
        if (!C.loop) this.splits[this.cpIndex - 1] = this.score.time;
        this.emit('CHECKPOINT', { i: this.cpIndex, split: this.score.time });
      }
      while (this.hintIdx < C.hints.length && b.x >= C.hints[this.hintIdx].x) { this.emit('HINT', Object.assign({}, C.hints[this.hintIdx])); this.hintIdx++; }
      if (this.fogHz.length || C.fogs) this.fogStep(b);
      if (b.brakeAmt > 0.85 && b.grounded && b.vx > 10 && this.t - this.brakeT > 3) { this.brakeT = this.t; this.emit('HARD_BRAKE', { speed: b.vx }); }
      const sp = Math.hypot(b.vx, b.vy);
      if (sp > 16 && b.grounded && this.t - this.fastT > 8) { this.fastT = this.t; this.emit('PLAYER_FAST', { speed: sp }); }
      this.slowAcc = sp < 2 && this.t > 5 ? this.slowAcc + dt : 0;
      if (this.slowAcc > 2.5 && this.t - this.slowT > 10) { this.slowT = this.t; this.slowAcc = 0; this.emit('PLAYER_SLOW', {}); }
      const alarm = this.cargo.alarm(); if (alarm && this.t - this.wobbleT > 6) { this.wobbleT = this.t; this.emit(alarm, {}); }
      if (!this.flags.half && this.cargo.amount < 50) { this.flags.half = true; this.emit('CARGO_HALF', {}); }
      for (let i = 0; i < this.zones.length; i++) { // a STOP box counts once the bike is inside it below 3 m/s
        const z = this.zones[i];
        if (!z.done && b.x > z.x0 && b.x < z.x1 && sp < 3) { z.done = true; this.emit('STOP_ZONE', { i, left: this.zones.filter((q) => !q.done).length }); }
      }
    }
    // Fog (F-40): FOG_IN and FOG_OUT at a bank's edges, and one FOG_WARN per hazard once it is within warning range.
    fogStep(b) {
      const d = fogAt(this.course, b.x);
      if (d > 0 && !this.inFog) { this.inFog = true; this.emit('FOG_IN', { density: d }); }
      else if (d === 0 && this.inFog) { this.inFog = false; this.emit('FOG_OUT', {}); }
      const range = fogWarnDist(b.vx);
      while (this.fogIdx < this.fogHz.length && this.fogHz[this.fogIdx].x - b.x <= range) {
        const h = this.fogHz[this.fogIdx++];
        if (h.x >= b.x) this.emit('FOG_WARN', { kind: h.kind, x: h.x, d: h.x - b.x });
      }
    }
    fogFrom(x) { this.fogIdx = 0; while (this.fogIdx < this.fogHz.length && this.fogHz[this.fogIdx].x <= x) this.fogIdx++; this.inFog = false; }
    sinceEvent(type) { return this.lastT[type] !== undefined ? this.t - this.lastT[type] : 1e9; }
    trackDamage(amount, dt) {
      const S = this.spill;
      if (amount > 0) {
        if (S.episode <= 0) S.x = this.bike.x;
        S.episode += amount; S.quiet = 0; S.acc += amount;
        const cause = this.sinceEvent('BONK') < 0.6 ? 'bump' : this.sinceEvent('POTHOLE') < 0.6 ? 'pothole'
          : this.sinceEvent('LAND') < 0.6 ? 'landing' : this.bike.brakeAmt > 0.5 ? 'brake' : 'rough';
        S.causes[cause] = (S.causes[cause] || 0) + amount;
        if (S.acc > 0.2) { this.emit('SPILL', { amount: S.acc, dir: this.cargo.lastSpillDir || 1 }); S.acc = 0; }
      } else if (S.episode > 0) {
        S.quiet += dt;
        if (S.quiet > 0.35) {
          if (S.episode >= 1) {
            this.emit('SPILL_EPISODE', { total: S.episode, cause: mainCause(S.causes), x: S.x });
            this.runLog.push({ kind: 'spill', x: S.x, amount: S.episode });
          }
          S.episode = 0; S.acc = 0; S.causes = {};
        }
      }
    }
    collect(pu) {
      if (pu.kind === 'bubble') this.cargo.shield = true;
      else this.boostT = 6;
      this.emit('POWERUP', { kind: pu.kind, x: pu.x, y: pu.y });
    }
    onLand(impact, airTime, b) {
      const rel = wrapAngle(b.a - Math.atan(this.terrain.slope(b.x)));
      this.emit('LAND', { impact, airTime, rel, x: b.x, y: b.y });
      if (this.state !== 'riding' && this.state !== 'finishing') return;
      if (this.state === 'riding' && this.invuln <= 0 && impact > this.phys.crashLandImpact) { this.crash('landing', clamp((impact - 12) / 6, 0, 1)); return; }
      const hurt = this.cargo.splash(impact, rel, this.state !== 'riding' || !!this.opts.unbreakable);
      this.drainCargo();
      if (hurt > 0) {
        const S = this.spill;
        if (S.episode <= 0) S.x = b.x;
        S.episode += hurt; S.quiet = 0; S.causes.landing = (S.causes.landing || 0) + hurt;
        this.emit('SPLASH', { amount: hurt, x: b.x, y: b.y });
      }
      // A big lip landed level counts for goals and Lip Service. Its landings hit too hard to be "clean" (impact < 8),
      // so this asks only for real air, the bike level with the slope, and no crash (crashes returned above).
      if (this.state === 'riding' && airTime > 0.5 && Math.abs(rel) < 0.3 && this.course.lips.some((l) => l.big && b.takeoffX > l.x - 3 && b.takeoffX < l.x + 1.5)) {
        this.feats.bigLipAir = Math.max(this.feats.bigLipAir, airTime);
        this.emit('BIG_LIP', { airTime });
      }
      if (this.state === 'riding' && airTime > 0.38 && impact < 8 && Math.abs(rel) < 0.3) {
        this.score.cleanLandings++; this.score.style += 50;
        this.emit('CLEAN_LANDING', { airTime });
      }
    }
    onBigAir(b) {
      if (this.state !== 'riding') return;
      this.score.bigAirs++; this.score.style += 100;
      this.emit('BIG_AIR', { x: b.x });
    }
    onSideHit(speed, surf) {
      if (!surf || !surf.hazard || this.state !== 'riding' || this.invuln > 0) return;
      const o = surf.owner || {};
      if (o.soft) { // Maybe-Mo airbags: always a bonk, never a crash
        if (speed > 1 && this.t - this.lastBonk > 0.5) {
          this.lastBonk = this.t;
          const hurt = this.cargo.bump(speed, !!this.opts.unbreakable);
          this.drainCargo();
          this.emit('BONK', { speed, kind: o.kind, hurt });
        }
        return;
      }
      if (speed > this.phys.obstacleCrashSpeed) this.crash(o.kind === 'cablecar' ? 'cablecar' : 'obstacle', clamp((speed - 4.5) / 6, 0, 1));
      else if (speed > this.phys.bonkSpeed && this.t - this.lastBonk > 0.5) { this.lastBonk = this.t; this.cargo.kick(0.8); this.emit('BONK', { speed, kind: o.kind }); }
    }
    crash(cause, sev) {
      if (this.state !== 'riding') return;
      const b = this.bike;
      b.crashed = true; this.state = 'crashed'; this.crashT = 0; this.score.crashes++;
      const hip = b.localToWorld(-0.2, 0.3, this.tmp), r = this.rag;
      Object.assign(r, { on: true, x: hip.x, y: hip.y, px: hip.x, py: hip.y, vx: b.vx * 0.85 + 1.2, vy: Math.max(b.vy, 0) * 0.5 + 3.4, a: b.a, pa: b.a, w: b.vx >= 0 ? -6.5 : 6.5 });
      const th = cargoType(this.cargo.kind).crashThrow, cp = b.localToWorld(th.mx, th.my, this.tmp), c = this.cup;
      Object.assign(c, { on: true, x: cp.x, y: cp.y, px: cp.x, py: cp.y, vx: b.vx + th.vx, vy: Math.max(b.vy, 0) + th.vy, a: b.a, pa: b.a, w: th.w });
      let lost = 0;
      if (this.opts.unbreakable) this.cargo.resetSlosh(); else lost = this.cargo.crashLoss(sev);
      this.drainCargo();
      this.runLog.push({ kind: 'crash', x: b.x, amount: lost });
      for (const r of this.obstacles.ramps) if (b.x > r.x - 3 && b.x < r.end + 12) this.feats.rampCrash = true; // ramp and its landing
      this.emit('CRASH', { cause, sev, lost, x: b.x, y: b.y, first: this.score.crashes === 1, step: this.inputLog.length }); // step: replays end here
    }
    updateBody(o, dt, rad, e) {
      if (!o.on) return;
      o.px = o.x; o.py = o.y; o.pa = o.a;
      o.vy -= this.phys.g * dt; o.vx *= 1 - 0.1 * dt;
      o.x += o.vx * dt; o.y += o.vy * dt; o.a += o.w * dt;
      const T = this.terrain, h = T.height(o.x);
      if (o.y - rad < h) {
        const s = T.slope(o.x), inv = 1 / Math.sqrt(1 + s * s), nx = -s * inv, ny = inv;
        o.y = h + rad;
        const vn = o.vx * nx + o.vy * ny;
        if (vn < 0) {
          o.vx -= (1 + e) * vn * nx; o.vy -= (1 + e) * vn * ny;
          const tx = ny, ty = -nx, vt = o.vx * tx + o.vy * ty;
          o.vx -= vt * 0.25 * tx; o.vy -= vt * 0.25 * ty;
          o.w = o.w * 0.6 - (vt / rad) * 0.2;
        }
      }
    }
    respawn() {
      const cp = this.course.checkpoints[this.cpIndex];
      this.spawn(cp.x, 3.2);
      this.rag.on = false; this.cup.on = false;
      this.state = 'riding'; this.invuln = 0.8;
      this.obstacles.onRespawn(cp.x);
      this.fogFrom(cp.x); // hazards ahead of the checkpoint warn again
      this.emit('RECOVER', { x: cp.x });
    }
    // Looping courses (The Test Hill): the bottom leads back to the top with fresh cargo and the props reset.
    lap() {
      const x = this.course.checkpoints[0].x;
      this.laps++; this.cpIndex = 0;
      this.cargo.refill(); this.spawn(x, 3.2); this.invuln = 0.8;
      this.obstacles.onRespawn(x); this.obstacles.resetProps();
      this.emit('LAP', { laps: this.laps, x });
    }
    // The wind at a position. Pass the height too: anything on or above the boardwalk is sheltered from it.
    windAt(x, y = -Infinity) {
      const walk = this.course.boardwalk;
      if (walk && x >= walk.x0 && x <= walk.x1 && y - this.phys.rideH > polylineY(walk.pts, x) - 0.3) return 0;
      for (const g of this.course.gusts || []) if (x >= g.x0 && x <= g.x1) return g.wind;
      return 0;
    }
    result() {
      const s = this.score, C = this.course, O = this.obstacles;
      const stats = { condition: this.cargo.amount, time: s.time, par: s.par, crashes: s.crashes, nearMisses: s.nearMisses, cleanLandings: s.cleanLandings, kind: this.cargo.kind };
      const tb = tipBreakdown(stats);
      return Object.assign(stats, {
        bigAirs: s.bigAirs, style: s.style, tip: tb.total, tipItems: tb.items, course: C.id, delivery: C.index,
        decorLeft: this.cargo.decor ? this.cargo.decor.filter((d) => d.on).length : null,
        stops: this.zones.filter((z) => z.done).length, stopZones: this.zones.length,
        potholesHit: O.potholes.filter((p) => p.hit).length, potholeCount: O.potholes.length,
        bigLipClean: this.feats.bigLipAir > 0, bigLipAir: this.feats.bigLipAir,
        rampClean: O.ramps.length > 0 && !this.feats.rampCrash, gustLoss: this.feats.gustLoss, log: this.runLog.slice(), splits: this.splitList(),
      });
    }
    // Split times (F-35): one per checkpoint after the start, then the finish; null where not reached. A run that started
    // at a later checkpoint (Free Ride) or loops (The Test Hill) has none.
    splitList() {
      if (this.course.loop || (this.opts.startCp | 0) > 0) return null;
      return Array.from({ length: this.course.checkpoints.length }, (_, i) => (this.splits[i] === undefined ? null : this.splits[i]));
    }
    finite() {
      const b = this.bike, c = this.cargo, m = c.stability();
      return Number.isFinite(b.x + b.y + b.vx + b.vy + b.a + b.w + m + c.amount);
    }
    sanityReset() {
      if (typeof console !== 'undefined') console.warn('[HILLARIOUS] non-finite physics state; respawning at checkpoint');
      if (!Number.isFinite(this.cargo.amount)) this.cargo.amount = 50;
      this.bike.crashed = false;
      this.respawn();
      this.emit('SANITY', {});
    }
  }

  // Crash replay (F-32). The world is deterministic given its inputs, so instead of keeping a buffer of drawn state, a
  // replay re-runs the ride: a fresh world on a freshly built copy of the course is fast-forwarded through the input
  // log to a little before the crash, then played on through the crash, at full speed and then in slow motion.
  // Wipeout clips (F-37) can record the same playback.
  const REPLAY = { keep: 5, pre: 2.0, post: 0.8, slowFrom: 0.5, slowRate: 0.4, zoom: 1.35 }; // about 4.75 s on screen
  const INPUT_BITS = ['pedal', 'brake', 'leanBack', 'leanFwd', 'jumpHeld', 'jumpPressed'];
  function packInput(i) { let n = 0; for (let k = 0; k < INPUT_BITS.length; k++) if (i[INPUT_BITS[k]]) n |= 1 << k; return n; }
  function unpackInput(n, out = {}) { for (let k = 0; k < INPUT_BITS.length; k++) out[INPUT_BITS[k]] = !!(n & (1 << k)); return out; }
  class CrashReplay {
    // course: a fresh build of the same course (worlds change their obstacles). log: the live world's inputLog, which
    // keeps growing while the crash plays out. crashStep: the CRASH event's step.
    constructor(course, opts, log, crashStep, tune = REPLAY) {
      this.world = new World(course, opts); this.log = log; this.tune = tune; this.crashStep = crashStep;
      this.from = Math.max(0, crashStep - Math.round(Math.min(tune.pre, tune.keep) / STEP));
      this.to = crashStep + Math.round(tune.post / STEP);
      this.i = 0; this.inp = {}; this.acc = 0; this.zoom = 1;
      this.world.drain();
    }
    run(n) { const W = this.world; for (; n > 0 && this.i < this.log.length; n--) { W.step(unpackInput(this.log[this.i++], this.inp)); W.events.length = 0; } }
    // Fast-forward silently, at most `budget` steps; true once the replay can start.
    prepare(budget = Infinity) { this.run(Math.min(budget, this.from - this.i)); return this.ready; }
    get ready() { return this.i >= this.from; }
    get done() { return this.i >= this.to || this.i >= this.log.length; }
    // Playback speed (world seconds per second) at this point: full speed, then slow motion around the crash.
    rate() { return (this.crashStep - this.i) * STEP > this.tune.slowFrom ? 1 : this.tune.slowRate; }
    // How far in the camera is: it pushes in over the slow-motion part.
    zoomTarget() { return lerp(1, this.tune.zoom, smoothstep(this.tune.slowFrom, 0, (this.crashStep - this.i) * STEP)); }
    // Plays `dt` seconds of real time; returns false once the replay is over.
    advance(dt) {
      this.acc += dt * this.rate();
      while (this.acc >= STEP && !this.done) { this.run(1); this.acc -= STEP; }
      return !this.done;
    }
    get alpha() { return clamp(this.acc / STEP, 0, 1); }
    get progress() { return clamp((this.i - this.from) / Math.max(1, this.to - this.from), 0, 1); }
  }
  // Wipeout clips (F-37). The clip is the run's most costly crash (the latest one on a tie).
  function pickWipeout(crashes) {
    let best = null;
    for (const c of crashes || []) if (c && Number.isInteger(c.step) && c.step > 0 && (!best || (c.lost || 0) >= (best.lost || 0))) best = c;
    return best;
  }
  // The first video type the browser can record: WebM where possible, MP4 on Safari. null: no clips here.
  const CLIP_TYPES = [['video/webm;codecs=vp9', 'webm'], ['video/webm;codecs=vp8', 'webm'], ['video/webm', 'webm'], ['video/mp4;codecs=avc1', 'mp4'], ['video/mp4', 'mp4']];
  function clipType(isSupported) {
    if (typeof isSupported !== 'function') return null;
    for (const [mime, ext] of CLIP_TYPES) { try { if (isSupported(mime)) return { mime, ext }; } catch (e) { /* try the next */ } }
    return null;
  }
  // The replay as frames at a fixed rate: what a clip shows, frame by frame (the clip itself records in real time).
  function replayFrames(rp, fps = 30) {
    const out = [];
    rp.prepare();
    do {
      const W = rp.world, r = W.state === 'crashed' && W.rag.on ? W.rag : W.bike;
      out.push({ i: rp.i, state: W.state, x: r.x, y: r.y, a: r.a, rate: rp.rate(), zoom: rp.zoomTarget() });
    } while (rp.advance(1 / fps) && out.length < 100000);
    return out;
  }

