  /* =====================================================================
   * 6. CARGO: the latte and the wedding cake share one interface.
   *    update(dt, bike, frozen) -> damage    splash(impact, rel, frozen) -> damage
   *    bump(speed) -> damage    kick(v)    crashLoss(sev) -> lost    resetSlosh()
   *    `shield` (bubble wrap) absorbs one damaging hit; `events` reports the drama.
   * ===================================================================*/
  function absorbHit(cargo, dmg) {
    if (cargo.shield && dmg > 0.3) { cargo.shield = false; cargo.events.push({ type: 'SHIELD_POP' }); return 0; }
    return dmg;
  }

  // Coffee: the liquid surface is a damped spring chasing the effective-gravity angle in the cup frame.
  class CoffeeCargo {
    constructor() { this.kind = 'coffee'; this.amount = 100; this.shield = false; this.events = []; this.resetSlosh(); }
    refill() { this.amount = 100; this.resetSlosh(); }
    resetSlosh() {
      this.slosh = 0; this.sloshV = 0; this.tilt = 0; this.tiltV = 0; this.afx = 0; this.afy = 0;
      this.pvx = NaN; this.pvy = 0; this.pa = 0; this.float = 0; this.gMag = 1; this.lastSpillDir = 1; this.spilling = 0;
      this.thr = this.threshold();
    }
    get condition() { return this.amount; }
    level() { return 0.15 + 0.7 * (this.amount / 100); } // fill height as a fraction of the cup
    threshold() { return Math.atan((1 - this.level()) / 0.42) + CARGO.dead; }
    update(dt, b, frozen) {
      const C = CARGO, ca = Math.cos(b.a), sa = Math.sin(b.a);
      const rx = C.mountX * ca - C.mountY * sa, ry = C.mountX * sa + C.mountY * ca;
      const vx = b.vx - b.w * ry, vy = b.vy + b.w * rx;
      if (Number.isNaN(this.pvx)) { this.pvx = vx; this.pvy = vy; this.pa = b.a; }
      const ax = clamp((vx - this.pvx) / dt, -140, 140), ay = clamp((vy - this.pvy) / dt, -140, 140);
      this.pvx = vx; this.pvy = vy;
      const k = 1 - Math.exp(-dt / C.tau);
      this.afx += (ax - this.afx) * k; this.afy += (ay - this.afy) * k;
      const gx = -this.afx, gy = -b.P.g - this.afy;           // effective gravity, world frame
      const lgx = gx * ca + gy * sa, lgy = -gx * sa + gy * ca;   // ...in the cup frame
      const mag = Math.hypot(lgx, lgy) / b.P.g;
      this.gMag = mag;
      // Near free fall the liquid floats: no meaningful restoring direction, just weak surface tension.
      const fall = smoothstep(0.25, 0.55, mag);
      const eq = Math.atan2(lgx, -lgy) * fall;                   // + = liquid piles up at the front
      const dA = wrapAngle(b.a - this.pa); this.pa = b.a;
      this.slosh -= dA * C.rot;
      const stiff = C.w0 * C.w0 * lerp(0.12, Math.min(mag, 2.5), fall);
      this.sloshV += (stiff * (eq - this.slosh) - 2 * C.zeta * C.w0 * this.sloshV) * dt;
      this.slosh += this.sloshV * dt;
      if (this.slosh > 1.4) { this.slosh = 1.4; if (this.sloshV > 0) this.sloshV *= -0.3; }
      else if (this.slosh < -1.4) { this.slosh = -1.4; if (this.sloshV < 0) this.sloshV *= -0.3; }
      this.float = mag < 0.35 ? Math.min(1, this.float + dt * 2.2) : Math.max(0, this.float - dt * 5);
      this.tiltV += (-C.tiltK * this.tilt - C.tiltC * this.tiltV - lgx * C.tiltGain) * dt;
      this.tilt = clamp(this.tilt + this.tiltV * dt, -0.3, 0.3);
      this.thr = this.threshold();
      let spilled = 0;
      const ex = Math.abs(this.slosh) - this.thr;
      if (!frozen && ex > 0 && mag > 0.35 && this.amount > 0) {
        spilled = Math.min(this.amount, C.rate * ex * Math.min(mag, 2) * dt);
        this.amount -= spilled;
        this.lastSpillDir = this.slosh > 0 ? 1 : -1;
      }
      this.spilling = spilled > 0 ? Math.min(1, this.spilling + dt * 8) : Math.max(0, this.spilling - dt * 4);
      return spilled;
    }
    splash(impact, rel, frozen) {
      const C = CARGO;
      if (impact <= C.splashMin) return 0;
      const ex = impact - C.splashMin;
      this.sloshV += (rel < 0 ? 1 : -1) * ex * C.splashKick;  // nose-first landings surge forward
      if (frozen) return 0;
      const amt = absorbHit(this, Math.min(this.amount, ex * C.splashPct * (0.55 + (0.45 * this.amount) / 100) * (1 + 0.3 * this.float)));
      this.amount -= amt; this.float = 0;
      return amt;
    }
    bump(speed) { this.sloshV += 0.6 + speed * 0.15; return 0; }
    kick(v) { this.sloshV += v; }
    windShare() { return 0; }                                // coffee ignores the wind
    stability() { return this.slosh + this.sloshV; }         // the world's finite check reads this
    alarm() { return null; }
    crashLoss(sev) {
      const lost = absorbHit(this, Math.min(this.amount, CARGO.crashBase + CARGO.crashExtra * clamp(sev, 0, 1)));
      this.amount -= lost;
      this.resetSlosh();
      return lost;
    }
  }

  // Wedding cake: a strapped inverted pendulum on the rear rack. Positive angle leans it backward.
  const CAKE = {
    mountX: -0.58, mountY: -0.25,         // rack pivot (bike-local)
    tau: 0.03, L: 0.42, kI: 1.35, rot: 0.3,
    strapK: 100, strapC: 4.5, maxAngle: 0.42, bounce: 0.3,
    hitMin: 1.0, hitPct: 4.0,             // strap hits: % per rad/s over hitMin
    smearAngle: 0.28, smearRate: 14,      // sustained leaning smears the frosting: %/s per rad
    landMin: 5.0, landPct: 1.3, landKick: 0.45,
    crashBase: 15, crashExtra: 5,
  };
  // Decorations shed as integrity drops below `at`. The groom goes early, naturally.
  const CAKE_DECOR = [
    { id: 'rose-b1', kind: 'rose', tier: 0, x: -0.17, at: 93 },
    { id: 'rose-m1', kind: 'rose', tier: 1, x: 0.12, at: 87 },
    { id: 'rose-b2', kind: 'rose', tier: 0, x: 0.17, at: 81 },
    { id: 'rose-t1', kind: 'rose', tier: 2, x: -0.08, at: 75 },
    { id: 'rose-m2', kind: 'rose', tier: 1, x: -0.13, at: 69 },
    { id: 'groom', kind: 'groom', tier: 3, x: 0.05, at: 62 },
    { id: 'rose-t2', kind: 'rose', tier: 2, x: 0.09, at: 50 },
    { id: 'bride', kind: 'bride', tier: 3, x: -0.05, at: 36 },
  ];
  class CakeCargo {
    constructor() {
      this.kind = 'cake'; this.amount = 100; this.shield = false; this.events = [];
      this.decor = CAKE_DECOR.map((d) => Object.assign({ on: true }, d));
      this.resetSlosh();
    }
    refill() { this.amount = 100; for (const d of this.decor) d.on = true; this.resetSlosh(); }
    resetSlosh() {
      this.angle = 0; this.angVel = 0; this.afx = 0; this.afy = 0; this.pvx = NaN; this.pvy = 0; this.pa = 0;
      this.gMag = 1; this.top = 0; this.topV = 0; this.wobble = 0; this.spilling = 0;
    }
    get condition() { return this.amount; }
    update(dt, b, frozen) {
      const C = CAKE, ca = Math.cos(b.a), sa = Math.sin(b.a);
      const rx = C.mountX * ca - C.mountY * sa, ry = C.mountX * sa + C.mountY * ca;
      const vx = b.vx - b.w * ry, vy = b.vy + b.w * rx;
      if (Number.isNaN(this.pvx)) { this.pvx = vx; this.pvy = vy; this.pa = b.a; }
      const ax = clamp((vx - this.pvx) / dt, -140, 140), ay = clamp((vy - this.pvy) / dt, -140, 140);
      this.pvx = vx; this.pvy = vy;
      const k = 1 - Math.exp(-dt / C.tau);
      this.afx += (ax - this.afx) * k; this.afy += (ay - this.afy) * k;
      const gx = -this.afx, gy = -b.P.g - this.afy;
      const lgx = gx * ca + gy * sa, lgy = -gx * sa + gy * ca;   // effective gravity in the rack frame
      this.gMag = Math.hypot(lgx, lgy) / b.P.g;
      const dA = wrapAngle(b.a - this.pa); this.pa = b.a;
      this.angle -= dA * C.rot;                                   // the cake lags fast pitching
      const th = this.angle;
      const acc = (-Math.sin(th) * lgy - Math.cos(th) * lgx) / (C.kI * C.L) - C.strapK * th - C.strapC * this.angVel;
      this.angVel += acc * dt;
      this.angle += this.angVel * dt;
      let dmg = 0;
      if (Math.abs(this.angle) > C.maxAngle) { // the bungee straps catch it
        const hit = Math.abs(this.angVel), sgn = Math.sign(this.angle);
        this.angle = sgn * C.maxAngle;
        if (this.angVel * sgn > 0) this.angVel *= -C.bounce;
        if (hit > C.hitMin && !frozen) { dmg += absorbHit(this, (hit - C.hitMin) * C.hitPct); this.events.push({ type: 'STRAP', hit }); }
      }
      const over = Math.abs(this.angle) - C.smearAngle;
      if (over > 0 && !frozen) dmg += over * C.smearRate * dt;
      this.wobble = Math.abs(this.angle) / C.maxAngle;
      this.topV += (-160 * (this.top - this.angle) - 7 * this.topV) * dt; // upper tiers lag (visual)
      this.top += this.topV * dt;
      dmg = Math.min(this.amount, dmg);
      this.amount -= dmg;
      this.spilling = dmg > 0 ? Math.min(1, this.spilling + dt * 8) : Math.max(0, this.spilling - dt * 3);
      this.shed();
      return dmg;
    }
    shed() {
      for (const d of this.decor) {
        if (d.on && this.amount < d.at) { d.on = false; this.events.push({ type: d.kind === 'groom' ? 'CAKE_GROOM' : 'CAKE_DECOR', decor: d }); }
      }
    }
    splash(impact, rel, frozen) {
      const C = CAKE;
      if (impact <= C.landMin) return 0;
      const ex = impact - C.landMin;
      this.angVel += (rel < 0 ? -1 : 1) * ex * C.landKick;     // nose-first landings fling it forward
      if (frozen) return 0;
      const amt = absorbHit(this, Math.min(this.amount, ex * C.landPct));
      this.amount -= amt;
      this.shed();
      return amt;
    }
    bump(speed, frozen) {
      this.angVel -= 0.8 + speed * 0.25;
      if (frozen) return 0;
      const amt = absorbHit(this, Math.min(this.amount, Math.max(0, speed - 2) * 0.8));
      this.amount -= amt;
      this.shed();
      return amt;
    }
    kick(v) { this.angVel -= v * 0.8; }
    windShare() { return 0; }
    stability() { return this.angle + this.angVel; }
    alarm() { return Math.abs(this.angle) > 0.3 ? 'CAKE_WOBBLE' : null; }
    crashLoss(sev) {
      const lost = absorbHit(this, Math.min(this.amount, CAKE.crashBase + CAKE.crashExtra * clamp(sev, 0, 1)));
      this.amount -= lost;
      let extra = lost > 0 ? 2 : 0; // the impact also knocks a couple of roses loose
      for (const d of this.decor) {
        if (extra > 0 && d.on && d.kind === 'rose') { d.on = false; extra--; this.events.push({ type: 'CAKE_DECOR', decor: d, crash: true }); }
      }
      this.shed();
      this.resetSlosh();
      return lost;
    }
  }

  // Bouquet (Telegraph Hill, 1.4 prototype): no liquid or swinging mass. Petals are lost to gusts at speed, rough
  // landings, bumps, and crashes. Same interface as the other cargo; `update` also takes the wind for the gust rule.
  // Disco ball (Twin Peaks, F-39): a mirrored ball loose in an open crate on the rear rack. It rolls along the crate
  // floor under the effective gravity in the rack frame (so braking, accelerating, and pitch all roll it), chips mirror
  // tiles when it hits a crate wall hard, and a big jolt pops it out. A pop-out costs condition but is not a crash: the
  // ball bounces back in. Gusts push it too.
  const DISCO = {
    mountX: -0.58, mountY: -0.25, tau: 0.03, // the crate sits where the cake rack is
    half: 0.13, r: 0.16,                     // crate half-width the ball's centre can travel; ball radius (m)
    roll: 5 / 7, drag: 1.1, wind: 0.09,      // solid-sphere rolling; rolling resistance (1/s); gust push per m/s
    bounce: 0.45, hitMin: 0.55, hitPct: 7,   // wall hits: % per m/s over hitMin
    landMin: 5.5, landPct: 0.9,              // landings jolt it: % per unit of impact over landMin
    popMin: 8.5, popCost: 6, popPct: 1.2,    // a landing over popMin pops it out of the crate
    bumpPop: 9, airTime: 0.55,               // a bump this fast pops it too; time out of the crate (visual)
    crashBase: 10, crashExtra: 16, tiles: 24,
  };
  class DiscoCargo {
    constructor() { this.kind = 'disco'; this.amount = 100; this.shield = false; this.events = []; this.resetSlosh(); }
    refill() { this.amount = 100; this.resetSlosh(); }
    resetSlosh() { this.p = 0; this.v = 0; this.spin = 0; this.air = 0; this.afx = 0; this.afy = 0; this.pvx = NaN; this.pvy = 0; this.gMag = 1; this.spilling = 0; }
    get condition() { return this.amount; }
    get slosh() { return 0; }   // no liquid; the world's finite check reads these
    get sloshV() { return 0; }
    tilesLeft() { return Math.ceil((this.amount / 100) * DISCO.tiles); }
    update(dt, b, frozen, wind = 0) {
      const D = DISCO, ca = Math.cos(b.a), sa = Math.sin(b.a);
      const rx = D.mountX * ca - D.mountY * sa, ry = D.mountX * sa + D.mountY * ca;
      const vx = b.vx - b.w * ry, vy = b.vy + b.w * rx;
      if (Number.isNaN(this.pvx)) { this.pvx = vx; this.pvy = vy; }
      const ax = clamp((vx - this.pvx) / dt, -140, 140), ay = clamp((vy - this.pvy) / dt, -140, 140);
      this.pvx = vx; this.pvy = vy;
      const k = 1 - Math.exp(-dt / D.tau);
      this.afx += (ax - this.afx) * k; this.afy += (ay - this.afy) * k;
      const gx = -this.afx, gy = -b.P.g - this.afy;
      const lgx = gx * ca + gy * sa, lgy = -gx * sa + gy * ca;   // effective gravity in the crate frame
      this.gMag = Math.hypot(lgx, lgy) / b.P.g;
      if (this.air > 0) this.air = Math.max(0, this.air - dt);
      this.v += (D.roll * lgx - D.drag * this.v + D.wind * wind) * dt;
      this.p += this.v * dt;
      this.spin += (this.v / D.r) * dt;
      let dmg = 0;
      if (Math.abs(this.p) > D.half) { // a crate wall
        const sgn = Math.sign(this.p), hit = Math.abs(this.v);
        this.p = sgn * D.half;
        if (this.v * sgn > 0) this.v *= -D.bounce;
        if (hit > D.hitMin && !frozen) { dmg += absorbHit(this, (hit - D.hitMin) * D.hitPct); this.events.push({ type: 'DISCO_TILE', hit }); }
      }
      dmg = Math.min(this.amount, dmg);
      this.amount -= dmg;
      this.spilling = dmg > 0 ? Math.min(1, this.spilling + dt * 8) : Math.max(0, this.spilling - dt * 3);
      return dmg;
    }
    popOut(extra) { // out of the crate and back in with a boing: not a crash
      this.air = DISCO.airTime; this.p = 0; this.v = 0;
      const amt = absorbHit(this, Math.min(this.amount, DISCO.popCost + extra));
      if (amt > 0 || !this.shield) this.events.push({ type: 'DISCO_POP' });
      return amt;
    }
    splash(impact, rel, frozen) {
      const D = DISCO;
      if (impact <= D.landMin) return 0;
      this.v += (rel < 0 ? 1 : -1) * (impact - D.landMin) * 0.12; // nose-first landings throw it forward
      if (frozen) return 0;
      const amt = impact > D.popMin ? this.popOut((impact - D.popMin) * D.popPct) : absorbHit(this, Math.min(this.amount, (impact - D.landMin) * D.landPct));
      this.amount -= amt;
      return amt;
    }
    bump(speed, frozen) {
      this.v -= 0.3 + speed * 0.08;
      if (frozen) return 0;
      const amt = speed > DISCO.bumpPop ? this.popOut(0) : absorbHit(this, Math.min(this.amount, Math.max(0, speed - 2.5) * 0.6));
      this.amount -= amt;
      return amt;
    }
    kick(v) { this.v += v * 0.5; }
    windShare() { return 0; }
    stability() { return this.p + this.v; }
    alarm() { return Math.abs(this.v) > 0.9 && this.air === 0 ? 'DISCO_ROLL' : null; }
    crashLoss(sev) {
      const lost = absorbHit(this, Math.min(this.amount, DISCO.crashBase + DISCO.crashExtra * clamp(sev, 0, 1)));
      this.amount -= lost;
      this.resetSlosh();
      return lost;
    }
  }
  const BOUQUET = { windMin: 2.5, windRate: 1.4, windFloor: 6, windSpeed: 8, landMin: 6, landPct: 3, bumpMin: 2, bumpPct: 0.8, crashBase: 12, crashExtra: 20 };
  // Player-facing words for each cargo, so labels and HUD text stay in step.
  const CARGO_WORDS = {
    coffee: { name: 'LATTE', short: 'Latte', noun: 'Coffee', unit: '% latte', condition: 'Coffee remaining', lost: 'Coffee lost' },
    cake: { name: 'CAKE', short: 'Cake', noun: 'Cake', unit: '% cake', condition: 'Cake integrity', lost: 'Cake damage' },
    bouquet: { name: 'BOUQUET', short: 'Bouquet', noun: 'Bouquet', unit: '% petals', condition: 'Petals left', lost: 'Petals lost' },
    disco: { name: 'DISCO BALL', short: 'Disco ball', noun: 'Disco ball', unit: '% sparkle', condition: 'Mirror tiles left', lost: 'Tiles lost' },
  };
  // Unknown or inherited keys (such as "constructor") fall back to the latte, so saves and URLs can't break a label.
  function cleanCargo(kind) { return Object.prototype.hasOwnProperty.call(CARGO_WORDS, kind) ? kind : 'coffee'; }
  function cargoWords(kind) { return CARGO_WORDS[cleanCargo(kind)]; }

  class BouquetCargo {
    constructor() { this.kind = 'bouquet'; this.amount = 100; this.shield = false; this.events = []; this.resetSlosh(); }
    refill() { this.amount = 100; this.resetSlosh(); }
    resetSlosh() { this.spilling = 0; }
    get condition() { return this.amount; }
    get slosh() { return 0; }   // no liquid; the world's finite check reads these
    get sloshV() { return 0; }
    update(dt, b, frozen, wind = 0) {
      let dmg = 0;
      // Gusts shed nothing below windFloor (so a careful rider keeps their petals) and ramp up to full force above it.
      const gust = Math.max(0, Math.abs(wind) - BOUQUET.windMin) * clamp((Math.abs(b.vx) - BOUQUET.windFloor) / BOUQUET.windSpeed, 0, 1);
      if (gust > 0 && !frozen) dmg += gust * BOUQUET.windRate * dt;
      dmg = Math.min(this.amount, dmg);
      this.amount -= dmg;
      this.spilling = dmg > 0 ? Math.min(1, this.spilling + dt * 8) : Math.max(0, this.spilling - dt * 3);
      return dmg;
    }
    splash(impact, rel, frozen) {
      if (impact <= BOUQUET.landMin || frozen) return 0;
      const amt = absorbHit(this, Math.min(this.amount, (impact - BOUQUET.landMin) * BOUQUET.landPct));
      this.amount -= amt;
      return amt;
    }
    bump(speed, frozen) {
      if (frozen) return 0;
      const amt = absorbHit(this, Math.min(this.amount, Math.max(0, speed - BOUQUET.bumpMin) * BOUQUET.bumpPct));
      this.amount -= amt;
      return amt;
    }
    kick() { /* petals do not swing */ }
    windShare(dmg) { return dmg || 0; }                       // all of update's loss is the gust's
    stability() { return 0; }
    alarm() { return null; }
    crashLoss(sev) {
      const lost = absorbHit(this, Math.min(this.amount, BOUQUET.crashBase + BOUQUET.crashExtra * clamp(sev, 0, 1)));
      this.amount -= lost;
      this.resetSlosh();
      return lost;
    }
  }

