'use strict';
(function (root) {
  const HEADLESS = !!root.__HILL_HEADLESS__;

  /* =====================================================================
   * 1. TUNING
   * Units: meters, seconds, kilograms. World y points up.
   * ===================================================================*/
  const STEP = 1 / 120;
  const MAX_STEPS = 10;
  const TAU = Math.PI * 2;

  const PHYS = {
    g: 22,                       // arcade gravity (about 2.2 g) for snappy hops
    mass: 80, inertia: 20,       // bike + rider
    wheelBase: 1.05, wheelR: 0.34,
    mountY: -0.55, suspRest: 0.2, suspTravel: 0.15,
    springK: 14000, springC: 900,
    pedalA: 6.0, pedalVmax: 14,  // pedal accel falls off linearly to zero at pedalVmax
    brakeA: 14, brakeRamp: 0.45, brakeFront: 0.6, mu: 1.1, // brake force builds while held
    drag: 0.011, rollCrr: 0.008,
    pitchCoupling: 0.45,         // how much drive/brake forces pitch the bike
    lipPop: 0.15, lipPopTime: 0.35, // rider unweights the rear as the front leaves a lip
    leanGround: 700, wheelieLimit: 0.38, wheelieK: 2600, wheelieD: 320,
    airAccel: 10, airMaxW: 7, airDamp: 0.35,
    assistKp: 10, assistKd: 4, assistMax: 12, assistMaxW: 5,
    jumpV: 4.8, jumpHoldTime: 0.2, jumpHoldGrav: 0.4, jumpBuffer: 0.11, coyote: 0.1, hopSpin: 0.8,
    crashLandImpact: 14, obstacleCrashSpeed: 4.5, bonkSpeed: 1.2,
    maxSpeed: 28, maxW: 14,
  };
  const SAG = (PHYS.mass * PHYS.g) / (2 * PHYS.springK);
  const RIDE_H = -PHYS.mountY + PHYS.suspRest - SAG + PHYS.wheelR; // CoM height over flat ground at rest
  // Physics per world (TD-10). PHYS, SAG, and RIDE_H stay Earth's; a world takes its own from course.planet, with the
  // sag and ride height derived by the same formulas. A new planet adds a PLANETS entry; nothing else reads globals.
  const PLANETS = { earth: PHYS };
  function withDerived(P) {
    const sag = (P.mass * P.g) / (2 * P.springK);
    return Object.freeze({ ...P, sag, rideH: -P.mountY + P.suspRest - sag + P.wheelR });
  }
  const EARTH = withDerived(PHYS);
  function physicsFor(planet) { return !planet || planet === 'earth' || !PLANETS[planet] ? EARTH : withDerived(PLANETS[planet]); }

  const CARGO = {
    mountX: 0.63, mountY: 0.06,
    tau: 0.03,                   // accel low-pass filter
    w0: TAU * 1.8, zeta: 0.2,    // slosh natural frequency and damping
    rot: 0.35,                   // how much liquid lags fast cup rotation
    dead: 0.14,                  // forgiving dead-zone above the rim angle
    rate: 60,                    // % per radian-over-threshold per second
    splashMin: 5.0, splashPct: 1.15, splashKick: 0.55,
    tiltK: 140, tiltC: 8, tiltGain: 0.1,
    crashBase: 15, crashExtra: 5,
  };
  const CRASH_TIME = 1.45;
  // Feel (F-38). The camera looks further ahead with speed, and further still down a steep grade (slope < 0 is downhill),
  // so a fast descent shows what's coming. The music dips while the bike is properly airborne and returns on landing.
  const CAM_LEAD = { perSpeed: 0.42, downhill: 0.6, maxGrade: 0.4, min: -2, flatMax: 7.5, max: 10 }; // flat: as before 1.6
  function cameraLead(vx, slope) {
    const down = slope < 0 ? Math.min(-slope, CAM_LEAD.maxGrade) * clamp(vx, 0, 20) * CAM_LEAD.downhill : 0;
    return clamp(clamp(vx * CAM_LEAD.perSpeed, CAM_LEAD.min, CAM_LEAD.flatMax) + down, CAM_LEAD.min, CAM_LEAD.max);
  }
  const AIR_DUCK = { after: 0.25, level: 0.35 }; // seconds in the air before the music dips, and how far (share of normal)
  const airDuckWanted = (state, grounded, airTime) => state === 'riding' && !grounded && airTime > AIR_DUCK.after;
  const AMBIENT_GAP = 4.5;
  const ROAD = { far: 0.85, curb: 1.0, walk: 1.3, front: 0.16 };

  /* =====================================================================
   * 2. MATH
   * ===================================================================*/
  const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const smoothstep = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); };
  const wrapAngle = (a) => a - TAU * Math.floor((a + Math.PI) / TAU);
  const lerpAngle = (a, b, t) => a + wrapAngle(b - a) * t;
  const smooth01 = (u) => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u));
  const dsmooth01 = (u) => (u <= 0 || u >= 1 ? 0 : 6 * u * (1 - u));
  function mulberry32(seed) {
    let s = seed >>> 0;
    return function () {
      s = (s + 0x6d2b79f5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const fmtTime = (s) => { const m = Math.floor(s / 60), r = s - m * 60; return m + ':' + (r < 10 ? '0' : '') + r.toFixed(1); };
  const fmtMoney = (v) => '$' + (Math.round(v * 100) / 100).toFixed(2);

  /* =====================================================================
   * 3. TERRAIN: C1 cubic-Hermite height field plus additive features
   * ===================================================================*/
  // One step: the tread rises with the base grade (so it reads level), then a C1 riser drops back down.
  function stairValue(F, u) {
    const f = u - Math.floor(u), e = F.nose;
    if (f <= 1 - e) return F.rise * f;
    const t = (f - (1 - e)) / e;
    return F.rise * (2 * t * t * t - 3 * t * t + 1 - e + e * t);
  }
  function featValue(F, x) {
    if (F.type === 'pothole') {
      let s = 1;
      if (x < F.x0 + F.wall) s = smooth01((x - F.x0) / F.wall);
      else if (x > F.x1 - F.wall) s = smooth01((F.x1 - x) / F.wall);
      return -F.depth * s;
    }
    if (F.type === 'stairs') return stairValue(F, ((x - F.x0) / F.tread) + F.phase) - F.v0;
    const u = (x - F.x0) / (F.x1 - F.x0), s = Math.sin(Math.PI * u);
    return F.height * s * s;
  }
  function featSlope(F, x) {
    if (F.type === 'pothole') {
      if (x < F.x0 + F.wall) return (-F.depth * dsmooth01((x - F.x0) / F.wall)) / F.wall;
      if (x > F.x1 - F.wall) return (F.depth * dsmooth01((F.x1 - x) / F.wall)) / F.wall;
      return 0;
    }
    if (F.type === 'stairs') {
      const u = (x - F.x0) / F.tread + F.phase, f = u - Math.floor(u), e = F.nose;
      if (f <= 1 - e) return F.rise / F.tread;
      const t = (f - (1 - e)) / e;
      return (F.rise / F.tread) * (1 + (6 * t * t - 6 * t) / e);
    }
    const L = F.x1 - F.x0, u = (x - F.x0) / L;
    return (F.height * Math.sin(TAU * u) * Math.PI) / L;
  }

  class Terrain {
    constructor(pts, features) {
      const n = pts.length;
      this.n = n;
      this.xs = new Float64Array(n); this.ys = new Float64Array(n); this.ms = new Float64Array(n);
      for (let i = 0; i < n; i++) { this.xs[i] = pts[i].x; this.ys[i] = pts[i].y; this.ms[i] = pts[i].m; }
      this.features = features.slice().sort((a, b) => a.x0 - b.x0);
      this.minX = this.xs[0]; this.maxX = this.xs[n - 1];
      this._seg = 0;
    }
    _segment(x) {
      const xs = this.xs; let i = this._seg;
      if (x >= xs[i] && x < xs[i + 1]) return i;
      if (i + 2 < this.n && x >= xs[i + 1] && x < xs[i + 2]) return (this._seg = i + 1);
      let lo = 0, hi = this.n - 2;
      while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (xs[mid] <= x) lo = mid; else hi = mid - 1; }
      return (this._seg = lo);
    }
    base(x) {
      if (x <= this.minX) return this.ys[0] + this.ms[0] * (x - this.minX);
      if (x >= this.maxX) { const k = this.n - 1; return this.ys[k] + this.ms[k] * (x - this.maxX); }
      const i = this._segment(x), x0 = this.xs[i], h = this.xs[i + 1] - x0, t = (x - x0) / h, t2 = t * t, t3 = t2 * t;
      return (2 * t3 - 3 * t2 + 1) * this.ys[i] + (t3 - 2 * t2 + t) * h * this.ms[i] +
        (-2 * t3 + 3 * t2) * this.ys[i + 1] + (t3 - t2) * h * this.ms[i + 1];
    }
    baseSlope(x) {
      if (x <= this.minX) return this.ms[0];
      if (x >= this.maxX) return this.ms[this.n - 1];
      const i = this._segment(x), x0 = this.xs[i], h = this.xs[i + 1] - x0, t = (x - x0) / h, t2 = t * t;
      return ((6 * t2 - 6 * t) * this.ys[i] + (3 * t2 - 4 * t + 1) * h * this.ms[i] +
        (-6 * t2 + 6 * t) * this.ys[i + 1] + (3 * t2 - 2 * t) * h * this.ms[i + 1]) / h;
    }
    feat(x) {
      let s = 0; const f = this.features;
      for (let i = 0; i < f.length; i++) { const F = f[i]; if (x > F.x0 && x < F.x1) s += featValue(F, x); }
      return s;
    }
    featSlope(x) {
      let s = 0; const f = this.features;
      for (let i = 0; i < f.length; i++) { const F = f[i]; if (x > F.x0 && x < F.x1) s += featSlope(F, x); }
      return s;
    }
    height(x) { return this.base(x) + this.feat(x); }
    slope(x) { return this.baseSlope(x) + this.featSlope(x); }
  }

  class CourseBuilder {
    constructor(x0, y0) { this.pts = [{ x: x0, y: y0, m: 0 }]; this.features = []; }
    get last() { return this.pts[this.pts.length - 1]; }
    get x() { return this.last.x; }
    straight(len) { const p = this.last; this.pts.push({ x: p.x + len, y: p.y + p.m * len, m: p.m }); return this; }
    // Constant-curvature transition to slope m1 (an exact parabola in Hermite form).
    ease(m1, len) { const p = this.last; this.pts.push({ x: p.x + len, y: p.y + (p.m + m1) * 0.5 * len, m: m1 }); return this; }
    pothole(x, width, depth) {
      this.features.push({ type: 'pothole', x0: x - width / 2, x1: x + width / 2, depth, wall: Math.min(0.26, width * 0.3) });
      return this;
    }
    bump(x, width, height) { this.features.push({ type: 'bump', x0: x - width / 2, x1: x + width / 2, height }); return this; }
    // Stairs sit on a straight whose grade is -rise/tread; each step adds its tread-and-riser profile.
    stairs(x0, n, tread, rise) {
      // Start and end each flight where the riser's slope equals the base grade, so the join is C1.
      const e = 0.22, tz = 0.5 + Math.sqrt(36 - 24 * e) / 12, F = { type: 'stairs', x0, x1: x0 + n * tread, n, tread, rise, nose: e, phase: 1 - e + e * tz, v0: 0 };
      F.v0 = stairValue(F, F.phase);
      this.features.push(F);
      return this;
    }
    build() { return new Terrain(this.pts, this.features); }
  }

