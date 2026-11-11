  /* =====================================================================
   * 11. AUTOPILOT: scripted riders for tests and ?autopilot=
   * ===================================================================*/
  const AUTOPILOT_PROFILES = {
    careful: { cruise: 8.5, brakeAt: 10.5, plank: 8.5, stairs: 4.5, ramp: 7, hop: true, lipHop: false, hold: 0.06, feather: true, waitCars: true, stopDecel: 3.6, timing: true },
    typical: { cruise: 11.5, brakeAt: 14.5, plank: 10.5, stairs: 7, ramp: 11, hop: true, lipHop: 'big', hold: 0.18, stopDecel: 6, timing: true },
    fast: { cruise: 22, brakeAt: 24, plank: 15, stairs: 13, ramp: 14, hop: true, lipHop: true, hold: 0.22, hopStairs: true, stopDecel: 7 },
    reckless: { cruise: 40, brakeAt: 99, plank: 99, stairs: 99, ramp: 99, hop: false, lipHop: true, hold: 0.22, slam: true, nosedive: true, stopDecel: 7 },
  };
  class Autopilot {
    constructor(name) {
      this.name = AUTOPILOT_PROFILES[name] ? name : 'typical';
      this.p = AUTOPILOT_PROFILES[this.name];
      this.inp = { pedal: false, brake: false, leanBack: false, leanFwd: false, jumpHeld: false, jumpPressed: false };
      this.hold = 0; this.braking = false; this.dived = false;
    }
    input(world) {
      const p = this.p, b = world.bike, C = world.course, inp = this.inp, v = b.vx, t = world.t;
      let target = p.cruise;
      for (const car of C.cars) { const d = car.x - 4 - b.x; if (d > -2 && d < 30) target = Math.min(target, p.plank); }
      for (const r of C.ramps) { const d = r.x - b.x; if (d > -1 && d < 28) target = Math.min(target, p.ramp); }
      for (const st of C.stairs) { const d = st.x0 - b.x; if (d > -(st.x1 - st.x0) && d < 22) target = Math.min(target, p.stairs); }
      // Cross traffic: go if we clear the crossing before it blocks, otherwise stop short and wait.
      let mustStop = false;
      for (const cc of world.obstacles.crossers) {
        if (!cc.active || (cc.kind === 'maybemo' && !p.waitCars)) continue;
        const gap = cc.x0 - 0.5 - (b.x + 0.95);
        if (gap < -0.5 || gap > 70) continue;
        const passT = (cc.x1 + 1.5 - (b.x - 0.95)) / Math.max(1, v);
        if (passT < cc.timeToBlock() - 0.3 || cc.timeToClear() < 0.15) continue;
        // Can't beat it: time the approach to roll through just after it clears; stop short only if that means crawling.
        const stopV = Math.sqrt(2 * p.stopDecel * Math.max(0, gap - 1.6)), arriveV = gap / (cc.timeToClear() + 0.5);
        const v1 = p.timing && arriveV > 3 ? Math.min(arriveV, stopV + 1.5) : stopV;
        if (v1 < target) { target = v1; mustStop = v1 === stopV; }
      }
      for (const z of world.zones) { // drill STOP boxes: roll in slowly and stop in the middle, then carry on
        if (z.done) continue;
        const d = (z.x0 + z.x1) / 2 - b.x;
        if (d < -3 || d > 60) continue;
        const v1 = Math.sqrt(2 * p.stopDecel * Math.max(0, d - 0.5));
        if (v1 < target) { target = v1; if (d < 8) mustStop = true; }
      }
      inp.pedal = v < target - 0.6;
      if (this.braking) { if (v < target + 0.3) this.braking = false; }
      else if (v > (target < p.cruise - 0.5 ? target + 1.2 : Math.max(p.brakeAt, target + 2))) this.braking = true;
      inp.brake = this.braking && b.grounded && (!p.feather || mustStop || t % 0.4 < 0.22); // feathering = keyboard taps
      if (p.slam && b.grounded && v > 12 && t % 6 < 0.9) { inp.brake = true; inp.pedal = false; }
      inp.jumpPressed = false;
      if (b.grounded) {
        const front = b.x + 0.6;
        if (p.hop) for (const ph of C.potholes) { const d = ph.x0 - front; if (d > 0 && d < Math.max(0.3, v * 0.07 + 0.25)) { inp.jumpPressed = true; this.hold = p.hold; } }
        if (p.hopStairs) for (const st of C.stairs) { const d = st.x0 - front; if (d > 0 && d < v * 0.07 + 0.4) { inp.jumpPressed = true; this.hold = 0.22; } }
        if (p.lipHop) for (const lip of C.lips) {
          if (p.lipHop === 'big' && !lip.big) continue;
          const d = lip.x - b.x; if (d > -0.3 && d < v * 0.04 + 0.15) { inp.jumpPressed = true; this.hold = p.hold; }
        }
      }
      inp.jumpHeld = this.hold > 0;
      if (this.hold > 0) this.hold -= STEP;
      inp.leanBack = false; inp.leanFwd = false;
      if (p.nosedive && !this.dived && !b.grounded && b.airTime > 0.4) { inp.leanFwd = true; if (b.airTime > 0.95) this.dived = true; }
      return inp;
    }
  }

  /* =====================================================================
   * 12. STORAGE (localStorage with graceful fallback)
   * ===================================================================*/
  class Store {
    constructor(backend) { this.backend = backend; this.mem = {}; }
    _b() {
      if (this.backend !== undefined) return this.backend;
      try { return root.localStorage || null; } catch (e) { return null; }
    }
    get(key, def) {
      try {
        const b = this._b(), v = b ? b.getItem('hillarious:' + key) : this.mem[key];
        return v == null ? def : JSON.parse(v);
      } catch (e) { return def; }
    }
    set(key, val) {
      const s = JSON.stringify(val);
      this.mem[key] = s;
      try { const b = this._b(); if (b) b.setItem('hillarious:' + key, s); return true; } catch (e) { return false; }
    }
  }

  const HILL = {
    STEP, PHYS, PLANETS, physicsFor, CARGO, CAKE, RIDE_H, SAG, CRASH_TIME, LANE, Terrain, CourseBuilder, buildNobHill, buildRussianHill, buildTelegraphHill, ROUTE_DATA, buildRoute, PIECES, joinPieces, GEN_SEGMENTS, PAR_SHARE, planRoute, generateRoute, buildGenerated,
    DAILY_EPOCH, DAILY_REMIXES, dateKey, dayIndex, keyForDay, validDateKey, dailyNumber, dailySeed, dailySpec, dailyRoute, buildDaily, cleanDaily, cleanStreak, nextStreak, startDaily, finishDaily, cleanSplits, splitDeltas, recordSplits, fmtDelta, segmentSpans, segmentGrid, cleanGrid, dailyShareText, intentLinks, CARGO_EMOJI, CAM_LEAD, cameraLead, AIR_DUCK, airDuckWanted, REPLAY, packInput, unpackInput, CrashReplay, pickWipeout, CLIP_TYPES, clipType, replayFrames,
    buildTitleCourse, makeTestCourse, LANDMARK_DATA, HAND_LANDMARKS, landmarksFor, Bike, CoffeeCargo, CakeCargo, BouquetCargo, CARGO_TYPES, cargoType, makeCargo, BOUQUET, World, Score,
    cleanCargo, computeTip, tipBreakdown, reviewFor, COFFEE_REVIEWS, CAKE_REVIEWS, EMPLOYEE_REVIEWS, shiftSummary, recordShift, TOP_SHIFTS, RECORD_VERSION, cleanStyleBest, recordStyle, cleanBest, cleanHandle, readTime, CONTROL_LABELS, controlKeys, SPILL_CAUSES, mainCause, shareText, shareLinks, HumorEngine, DIALOGUE, CRASH_LINES,
    RECOVER_LINE, CrossTraffic, Autopilot, AUTOPILOT_PROFILES, Store, clamp, wrapAngle, mulberry32, NO_INPUT,
    ROUTES, CHAPTERS, chapterRoutes, THEMES, MID_LAYERS, themeFor, COMING_SOON, ROUTE_GOALS, routeGoals, STAMPS, DRILLS, drillStamp, migrateProgress, unlockState, drillStates,
    newlyUnlocked, writesFor, applyRun, cpLabel, troubleSpot, buildTestHill, buildDrillBrake, buildDrillHop, buildDrillLip,
    buildDrillStairs, buildDrillCable, buildDrillExam, cargoWords,
  };
  root.HILL = HILL;
  if (HEADLESS || typeof document === 'undefined') return;

