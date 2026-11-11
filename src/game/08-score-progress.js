  /* =====================================================================
   * 8. SCORE, TIPS, REVIEWS
   * ===================================================================*/
  // Itemized tip: the receipt shows every line; the total is never negative.
  function tipBreakdown(s) {
    const cond = clamp(Number.isFinite(s.condition) ? s.condition : 0, 0, 100);
    const time = Number.isFinite(s.time) ? s.time : 0, par = s.par || 45;
    const r2 = (v) => Math.round(v * 100) / 100;
    const items = [{ label: 'Base tip', amount: 5 }];
    const cargoCut = r2(-4.25 * (1 - cond / 100));
    if (cargoCut < 0) items.push({ label: cargoWords(s.kind).lost, amount: cargoCut });
    if (s.crashes > 0) items.push({ label: 'Crashes', amount: r2(-Math.min(2, s.crashes * 0.5)) });
    const late = Math.max(0, time - par);
    if (late > 0) items.push({ label: 'Late', amount: r2(-Math.min(2, late * 0.08)) });
    if (s.cleanLandings > 0) items.push({ label: 'Clean landings', amount: r2(Math.min(1.5, s.cleanLandings * 0.25)) });
    if (s.nearMisses > 0) items.push({ label: 'Near misses', amount: r2(Math.min(1.2, s.nearMisses * 0.3)) });
    if (time <= par * 0.9 && cond >= 90) items.push({ label: 'Fast and flawless', amount: 1 });
    let total = r2(items.reduce((a, i) => a + i.amount, 0));
    if (Math.round(cond) <= 0 && total > 0.07) { items.push({ label: 'Empty-cargo policy', amount: r2(0.07 - total) }); total = 0.07; }
    if (total < 0) { items.push({ label: 'Minimum tip (HR insists)', amount: r2(-total) }); total = 0; }
    return { items, total: r2(Math.max(0, total)) };
  }
  function computeTip(s) { return tipBreakdown(s).total; }
  class Score {
    constructor(par, kind) { this.par = par; this.kind = kind || 'coffee'; this.time = 0; this.crashes = 0; this.nearMisses = 0; this.cleanLandings = 0; this.bigAirs = 0; this.style = 0; }
    tip(condition) {
      return computeTip({ condition, time: this.time, par: this.par, crashes: this.crashes, cleanLandings: this.cleanLandings, nearMisses: this.nearMisses, kind: this.kind });
    }
  }
  const COFFEE_REVIEWS = [
    { min: 90, stars: 5, text: 'Perfect. Only took three years off my life watching you.' },
    { min: 60, stars: 4, text: 'Good coffee. Slightly more aerodynamic than expected.' },
    { min: 30, stars: 3, text: 'Ordered a latte. Received an espresso.' },
    { min: 1, stars: 2, text: 'Coffee was delicious. All four drops.' },
    { min: 0, stars: 1, text: "The cup arrived. That's technically something." },
  ];
  const CAKE_REVIEWS = [
    { min: 90, stars: 5, text: 'Beautiful! The marriage has a fighting chance.' },
    { min: 60, stars: 4, text: 'Slightly tilted. Very San Francisco.' },
    { min: 30, stars: 3, text: 'We ordered three tiers. Got two and a half.' },
    { min: 1, stars: 2, text: "It's abstract. We're calling it modern art." },
    { min: 0, stars: 1, text: 'The cake has filed for divorce.' },
  ];
  const BOUQUET_REVIEWS = [
    { min: 90, stars: 5, text: 'Every petal, every bloom. She wept. Happily.' },
    { min: 60, stars: 4, text: 'A few petals short. The wind had opinions.' },
    { min: 30, stars: 3, text: 'Half a bouquet and a lot of stems.' },
    { min: 1, stars: 2, text: 'Mostly stems. Very dramatic stems.' },
    { min: 0, stars: 1, text: 'Ruth asked for a receipt for the petals.' },
  ];
  // The cargo registry (F-27): the one list of cargo types. Each class keeps its own rules behind the same methods
  // (update, splash, bump, kick, crashLoss, refill, resetSlosh, windShare, stability, alarm, condition); this table adds
  // what the world needs around it: how to make one, its review lines, and how it flies off the bike in a crash.
  // Player-facing words live in CARGO_WORDS, and drawing lives in CARGO_VIEW (presentation section).
  const CARGO_TYPES = {
    coffee: { make: () => new CoffeeCargo(), reviews: COFFEE_REVIEWS, crashThrow: { mx: CARGO.mountX, my: 0.15, vx: 1.5, vy: 4.2, w: -9 } },
    cake: { make: () => new CakeCargo(), reviews: CAKE_REVIEWS, crashThrow: { mx: CAKE.mountX, my: 0.2, vx: 0.5, vy: 3.2, w: -4 } },
    bouquet: { make: () => new BouquetCargo(), reviews: BOUQUET_REVIEWS, crashThrow: { mx: CARGO.mountX, my: 0.15, vx: 1.5, vy: 4.2, w: -9 } },
  };
  function cargoType(kind) { return CARGO_TYPES[cleanCargo(kind)]; } // unknown kinds fall back to the latte, like cleanCargo
  function makeCargo(kind) { return cargoType(kind).make(); }
  function reviewsFor(kind) { return cargoType(kind).reviews; }
  function reviewFor(reviews, condition) {
    const c = Math.round(clamp(Number.isFinite(condition) ? condition : 0, 0, 100));
    for (const r of reviews) if (c >= r.min) return r;
    return reviews[reviews.length - 1];
  }
  // Final employee review: both deliveries, one verdict.
  const EMPLOYEE_REVIEWS = {
    excellent: { lines: ['Employee of the Month.', "Please don't ask for benefits."], stamp: 'EXEMPLARY' },
    average: { lines: ['Your customers are confused,', 'but technically satisfied.'], stamp: 'ACCEPTABLE' },
    poor: { lines: ['Congratulations!', "You've been promoted to customer."], stamp: 'REASSIGNED' },
  };
  function shiftSummary(results) {
    const done = (results || []).filter(Boolean), n = done.length, r2 = (v) => Math.round(v * 100) / 100;
    const stars = done.map((r) => reviewFor(reviewsFor(r.kind), r.condition).stars);
    const sum = (f) => done.reduce((a, r) => a + (Number.isFinite(f(r)) ? f(r) : 0), 0);
    const avgStars = n ? stars.reduce((a, b) => a + b, 0) / n : 0;
    const crashes = sum((r) => r.crashes);
    const band = avgStars >= 4.5 && crashes <= 2 ? 'excellent' : avgStars <= 2.5 ? 'poor' : 'average';
    return {
      deliveries: n, stars, avgStars, band, verdict: EMPLOYEE_REVIEWS[band], crashes,
      tips: r2(Math.max(0, sum((r) => r.tip))), time: sum((r) => r.time), par: sum((r) => r.par),
      nearMisses: sum((r) => r.nearMisses), cleanLandings: sum((r) => r.cleanLandings), bigAirs: sum((r) => r.bigAirs), style: sum((r) => r.style), avgCondition: n ? sum((r) => clamp(r.condition, 0, 100)) / n : 0,
    };
  }
  // Keeps the three best shifts (most tips, then fastest). Returns the new list and the shift's rank (0 = unranked).
  const TOP_SHIFTS = 5; // shifts kept on the high-score board
  function recordShift(list, entry) {
    const all = (Array.isArray(list) ? list.filter((e) => e && Number.isFinite(e.tips) && Number.isFinite(e.time)) : []).concat([entry]);
    all.sort((a, b) => b.tips - a.tips || a.time - b.time);
    const top = all.slice(0, TOP_SHIFTS);
    return { list: top, rank: top.indexOf(entry) + 1 };
  }
  // Stored record format version. Version 1 adds `v` to best-tip and shift records; records without `v` still read.
  const RECORD_VERSION = 1;
  // Sanitizes a stored best-tip record. Anything that is not a finite tip and time returns null, so corrupt saves never reach the review.
  // Style best per route (TD-04): style is its own score (near misses, clean landings, big air), separate from tips.
  // Stored as 'style:<route>' { v, style }; corrupt or negative records are ignored, like best tips.
  function cleanStyleBest(raw) {
    const b = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
    return Number.isFinite(b.style) && b.style >= 0 ? { v: RECORD_VERSION, style: b.style } : null;
  }
  // Compares a run's style with the stored best. A new best needs some style: a 0-point run never sets one.
  function recordStyle(raw, style) {
    const prev = cleanStyleBest(raw), isNew = Number.isFinite(style) && style > 0 && (!prev || style > prev.style);
    return { prev, isNew, best: isNew ? { v: RECORD_VERSION, style } : prev };
  }
  function cleanBest(raw) {
    const b = plainObject(raw);
    if (!Number.isFinite(b.tip) || !Number.isFinite(b.time)) return null;
    return { v: RECORD_VERSION, tip: b.tip, condition: Number.isFinite(b.condition) ? b.condition : 0, time: b.time };
  }
  // Control labels for each input device, by game action. Hints, How to Play, the title strip and pause help all read
  // from here so they agree. Gamepad names follow the standard mapping; touch labels match the on-screen buttons.
  const CONTROL_LABELS = {
    keyboard: { pedal: ['↑'], brake: ['↓'], leanBack: ['←'], leanFwd: ['→'], hop: ['SPACE'], pause: ['P'], mute: ['M'], restart: ['R'], confirm: ['ENTER'] },
    touch: { pedal: ['PEDAL'], brake: ['BRAKE'], leanBack: ['⟲'], leanFwd: ['⟳'], hop: ['HOP'], pause: ['II'], mute: [], restart: [], confirm: ['TAP'] },
    gamepad: { pedal: ['RT'], brake: ['LT'], leanBack: ['◀'], leanFwd: ['▶'], hop: ['A'], pause: ['START'], mute: ['Y'], restart: ['SELECT'], confirm: ['A'] },
  };
  function controlKeys(actions, device) {
    const t = CONTROL_LABELS[device] || CONTROL_LABELS.keyboard;
    return (actions || []).flatMap((a) => t[a] || []);
  }
  // "Share your shift" text and intent links for the final review. They only open when a player clicks them.
  const GAME_URL = 'https://hillarious.pages.dev';
  function shareText(S) {
    const crashes = S.crashes === 1 ? '1 crash' : (S.crashes || 0) + ' crashes';
    return 'I earned ' + fmtMoney(S.tips || 0) + ' in tips on my HILLARIOUS delivery shift in ' + (S.place || 'San Francisco') + ' (' + (S.avgStars || 0).toFixed(1) + '★, ' + crashes + '). Can you beat it? 🚲 ' + GAME_URL;
  }
  function intentLinks(text) {
    const t = encodeURIComponent(text);
    return { x: 'https://x.com/intent/post?text=' + t, linkedin: 'https://www.linkedin.com/feed/?shareActive=true&text=' + t };
  }
  function shareLinks(S) { return intentLinks(shareText(S)); }
  // Daily Dispatch share card (F-36): spoiler-free, one emoji per segment (🟩 clean, 🟨 cargo lost, 💥 crash).
  const CARGO_EMOJI = { coffee: '☕', cake: '🎂', bouquet: '💐' };
  const GRID_EMOJI = ['🟩', '🟨', '💥'], GRID_LOSS = 3; // percent lost in a segment that earns a 🟨
  function segmentGrid(segments, log) {
    return (segments || []).map((g) => {
      const here = (log || []).filter((e) => e.x >= g.x0 && e.x < g.x1);
      if (here.some((e) => e.kind === 'crash')) return '💥';
      return here.reduce((t, e) => t + (e.amount || 0), 0) >= GRID_LOSS ? '🟨' : '🟩';
    }).join('');
  }
  const cleanGrid = (g) => (typeof g === 'string' && [...g].length <= 7 && [...g].every((c) => GRID_EMOJI.includes(c)) ? g : '');
  function dailyShareText(spec, res) {
    const stars = '⭐'.repeat(res.stars) + '☆'.repeat(Math.max(0, 5 - res.stars));
    const head = ['🚲 HILLARIOUS #' + spec.number, (CARGO_EMOJI[spec.cargo] || '📦') + ' ' + Math.round(res.condition) + '%', stars, '💥×' + res.crashes, '⏱ ' + fmtTime(res.time)].join(' · ');
    return [head, cleanGrid(res.grid), GAME_URL].filter(Boolean).join('\n');
  }
  // A spill episode is named after whatever did the most damage in it.
  const SPILL_CAUSES = { brake: 'Hard brake', landing: 'Rough landing', pothole: 'Pothole', bump: 'Bump', rough: 'Bumpy ride' };
  function mainCause(tally) {
    let best = 'rough', most = 0;
    for (const k in tally) if (tally[k] > most) { best = k; most = tally[k]; }
    return best;
  }
  // Keeps only letters, digits, "_" and "-", so a pasted profile URL or "@handle" becomes a plain handle.
  function cleanHandle(s, max) {
    return String(s || '').trim().replace(/[?#].*$/, '').replace(/\/+$/, '').split('/').pop().replace(/^@/, '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, max);
  }

  /* =====================================================================
   * 8b. PROGRESS: the route list, unlocks, goals, drill stamps, and which
   *     records each kind of run may write. Saved under one versioned key.
   * ===================================================================*/
  // Deliveries in shift order. A route unlocks once the route it `requires` has been delivered.
  const ROUTES = [
    { id: 'nobHill', build: buildNobHill, requires: null },
    { id: 'russianHill', build: buildRussianHill, requires: 'nobHill' },
    { id: 'telegraph', build: buildTelegraphHill, requires: 'russianHill' },
  ];
  // Neighbourhood themes (TD-12): how each course.theme looks behind the street. A theme names its far skyline and
  // mid ridge layers and sets the horizon, water, hills, parallax, and moving extras. A new neighbourhood or planet
  // adds an entry here (and a far-layer builder if it needs a new skyline) instead of branching in the renderer.
  const MID_LAYERS = {
    nob: { seed: 21, phase: 0, fill: '#c9c2b0', towers: true, trees: 0.1 },
    russian: { seed: 33, phase: 2.1, fill: '#bcc7a8', towers: false, trees: 0.22 },
  };
  const NOB_THEME = { far: 'nob', mid: 'nob', horizon: 0.6, water: '#86b9d6', hills: true, farParallax: 0.12, farDrop: 0.05, sailboats: false, ridgeCableCar: true };
  const THEMES = {
    nob: NOB_THEME,
    russian: { far: 'russian', mid: 'russian', horizon: 0.56, water: '#7fb3d3', hills: false, farParallax: 0.06, farDrop: 0.02, sailboats: true, ridgeCableCar: false },
    telegraph: { ...NOB_THEME }, // Telegraph Hill looks east over downtown, like Nob Hill, for now
  };
  function themeFor(id) { return THEMES[id] || NOB_THEME; }

  // Chapters (TD-11): a shift is one chapter's routes in order, with its own place name for sharing and its own
  // high-score key. ROUTES stays the list of every route (unlocks, Dispatch, Free Ride). San Francisco keeps the
  // original 'shifts' key, so saved scores carry over. A second shift (Mars, the Mission) adds a chapter here.
  const CHAPTERS = [
    { id: 'sf', name: 'San Francisco', place: 'San Francisco', routes: ['nobHill', 'russianHill', 'telegraph'], scoresKey: 'shifts' },
  ];
  function chapterRoutes(ch) { return ch.routes.map((id) => ROUTES.find((r) => r.id === id)).filter(Boolean); }
  // Dispatch-board teasers for deliveries that aren't built yet. Empty now that every route is built.
  const COMING_SOON = [];
  // Three optional goals per delivery. Each reads only World.result(); meeting all three masters the route.
  const ROUTE_GOALS = {
    nobHill: [
      { text: 'Deliver at least 90% of the latte', test: (r) => r.condition >= 90 },
      { text: 'Land the big Powell lip level', test: (r) => !!r.bigLipClean },
      { text: 'Beat par with no crashes', test: (r) => r.time <= r.par && r.crashes === 0 },
    ],
    russianHill: [
      { text: 'Deliver at least 90% of the cake', test: (r) => r.condition >= 90 },
      { text: 'Clear the Larkin ramp without a crash', test: (r) => !!r.rampClean },
      { text: 'Beat par with no crashes', test: (r) => r.time <= r.par && r.crashes === 0 },
    ],
    telegraph: [
      { text: 'Deliver at least 90% of the petals', test: (r) => r.condition >= 90 },
      { text: 'Lose under 5% of the petals to the gust', test: (r) => r.gustLoss < 5 },
      { text: 'Beat par with no crashes', test: (r) => r.time <= r.par && r.crashes === 0 },
    ],
  };
  function routeGoals(id, r) { return (ROUTE_GOALS[id] || []).map((g) => !!(r && g.test(r))); }

  // Courier Academy drills, in unlock order. A run's stamp is how many tiers in a row it met; tier 1 is a pass.
  const STAMPS = ['NOT YET', 'PROBATIONARY', 'CERTIFIED', 'DISTINGUISHED'];
  const PAT_VERDICTS = ['Not yet. HR has all day, and so do you.', 'Probationary. You may now be trusted near a latte.', 'Certified. HR is cautiously optimistic.', 'Distinguished. Please stop showing off.'];
  const DRILLS = [
    { id: 'drillBrake', build: buildDrillBrake, title: 'PEDAL & BRAKE', teaches: 'Stopping without a latte tsunami', tiers: [
      { text: 'Stop in both STOP boxes', test: (r) => r.stopZones > 0 && r.stops === r.stopZones },
      { text: 'Keep 90% of the latte', test: (r) => r.condition >= 90 },
      { text: 'Keep 95% of the latte', test: (r) => r.condition >= 95 },
    ] },
    { id: 'drillHop', build: buildDrillHop, title: 'HOP SCHOOL', teaches: 'Tap for small hops, hold for big ones', tiers: [
      { text: 'Clear 2 of the 3 potholes', test: (r) => r.potholeCount - r.potholesHit >= 2 },
      { text: 'Clear all 3 potholes', test: (r) => r.potholeCount > 0 && r.potholesHit === 0 },
      { text: 'Keep 95% of the latte', test: (r) => r.condition >= 95 },
    ] },
    { id: 'drillLip', build: buildDrillLip, title: 'LIP SERVICE', teaches: 'Big air, landed level', tiers: [
      { text: 'Land the lip level', test: (r) => !!r.bigLipClean },
      { text: 'Stay in the air for 0.8 s', test: (r) => r.bigLipAir >= 0.8 },
      { text: 'Keep 90% of the latte', test: (r) => r.condition >= 90 },
    ] },
    { id: 'drillStairs', build: buildDrillStairs, title: 'STAIR MASTER', teaches: 'Steps, then a stop, with a cake on board', tiers: [
      { text: 'Ride the steps and stop in the STOP box', test: (r) => r.stopZones > 0 && r.stops === r.stopZones },
      { text: 'Keep 90% of the cake', test: (r) => r.condition >= 90 },
      { text: 'Keep 96% of the cake', test: (r) => r.condition >= 96 },
    ] },
    { id: 'drillCable', build: buildDrillCable, title: 'DING DING', teaches: 'Cable-car timing', tiers: [
      { text: 'Cross without crashing', test: (r) => r.crashes === 0 },
      { text: 'Beat par', test: (r) => r.time <= r.par },
      { text: 'Beat the cable car: a near miss', test: (r) => r.nearMisses > 0 },
    ] },
    { id: 'drillExam', build: buildDrillExam, title: 'FINAL EXAM', teaches: 'Everything at once', tiers: [
      { text: 'Finish without crashing', test: (r) => r.crashes === 0 },
      { text: 'Keep 80% of the latte', test: (r) => r.condition >= 80 },
      { text: 'Beat par with 90% of the latte', test: (r) => r.time <= r.par && r.condition >= 90 },
    ] },
  ];
  function drillStamp(drill, r) { let s = 0; while (r && s < drill.tiers.length && drill.tiers[s].test(r)) s++; return s; }

  const PROGRESS_VERSION = 1;
  const plainObject = (o) => (o && typeof o === 'object' && !Array.isArray(o) ? o : {});
  // Reads saved progress in any shape, always returning a fresh copy. Before 1.3 there was no progress record,
  // only per-route best tips, so a route with a best tip counts as delivered and returning players see no false locks.
  function migrateProgress(raw, legacyBests) {
    const src = plainObject(raw), p = { v: PROGRESS_VERSION, delivered: {}, goals: {}, drills: {} };
    for (const [k, n] of Object.entries(plainObject(src.delivered))) { const c = n === true ? 1 : Math.floor(Number(n)); if (Number.isFinite(c) && c > 0) p.delivered[k] = c; }
    for (const [k, g] of Object.entries(plainObject(src.goals))) if (Array.isArray(g)) p.goals[k] = g.map(Boolean);
    for (const [k, s] of Object.entries(plainObject(src.drills))) { const n = Math.floor(Number(s)); if (Number.isFinite(n) && n > 0) p.drills[k] = Math.min(n, STAMPS.length - 1); }
    for (const [k, best] of Object.entries(plainObject(legacyBests))) if (best && Number.isFinite(best.tip) && !p.delivered[k]) p.delivered[k] = 1;
    return p;
  }
  // Dispatch-board state per route: 'locked', 'new' (never delivered), 'delivered', or 'mastered' (all goals met).
  function unlockState(routes, progress, unlockAll) {
    const d = plainObject(progress && progress.delivered), goals = plainObject(progress && progress.goals);
    return routes.map((r) => {
      const n = (ROUTE_GOALS[r.id] || []).length, g = goals[r.id] || [];
      const state = (d[r.id] || 0) > 0 ? (n && g.length >= n && g.slice(0, n).every(Boolean) ? 'mastered' : 'delivered')
        : !unlockAll && r.requires && !((d[r.requires] || 0) > 0) ? 'locked' : 'new';
      return { id: r.id, requires: r.requires, state };
    });
  }
  // A drill opens once the drill before it has at least a pass.
  function drillStates(drills, progress, unlockAll) {
    const s = plainObject(progress && progress.drills);
    return drills.map((D, i) => {
      const stamp = s[D.id] || 0, open = unlockAll || i === 0 || (s[drills[i - 1].id] || 0) > 0;
      return { id: D.id, stamp, state: stamp > 0 ? 'passed' : open ? 'open' : 'locked' };
    });
  }
  // Ids that were locked in `before` and are open in `after` (both from unlockState or drillStates).
  function newlyUnlocked(before, after) { return after.filter((a, i) => before[i] && before[i].state === 'locked' && a.state !== 'locked').map((a) => a.id); }
  // Which records a run may write. Practice never touches the high scores; only a full shift makes a shift record.
  const RUN_WRITES = {
    shift: { best: true, shift: true, delivered: true, drill: false },
    single: { best: true, shift: false, delivered: true, drill: false },
    daily: { best: false, shift: false, delivered: false, drill: false, daily: true }, // its own record (F-34)
    drill: { best: false, shift: false, delivered: false, drill: true },
    free: { best: false, shift: false, delivered: false, drill: false },
  };
  function writesFor(mode) { return RUN_WRITES[mode] || RUN_WRITES.free; }
  // Returns updated progress without changing the input. `outcome` is { goals: [bool] } for a delivery or { stamp } for a drill.
  function applyRun(progress, mode, id, outcome) {
    const w = writesFor(mode), p = migrateProgress(progress, null), o = outcome || {};
    if (w.delivered) {
      p.delivered[id] = (p.delivered[id] || 0) + 1;
      const old = p.goals[id] || [], now = o.goals || [];
      p.goals[id] = Array.from({ length: Math.max(old.length, now.length) }, (_, i) => !!(old[i] || now[i]));
    }
    if (w.drill && o.stamp > 0) p.drills[id] = Math.max(p.drills[id] || 0, Math.min(o.stamp, STAMPS.length - 1));
    return p;
  }
  // Free Ride start names: the cross street just passed, and how far past it.
  function cpLabel(course, i) {
    const cp = course.checkpoints[i];
    if (!cp || i === 0) return 'START';
    let I = null;
    for (const s of course.intersections) if (s.x0 <= cp.x + 0.5 && s.x0 > course.start) I = s;
    if (!I) return Math.round(cp.x - course.start) + ' m IN';
    return cp.x > I.x1 + 3 ? Math.round(cp.x - I.x1) + ' m PAST ' + I.name : I.name;
  }
  // The checkpoint stretch that cost the most this run, for "Practice this spot". A crash counts as an extra 10% of cargo.
  // `log` holds { kind: 'crash' | 'spill', x, amount } entries from World.result(). Returns null on a tidy run.
  function troubleSpot(course, log) {
    const cps = course.checkpoints, seg = new Map();
    for (const e of log || []) {
      if (!e || !Number.isFinite(e.x)) continue;
      let i = 0;
      while (i + 1 < cps.length && cps[i + 1].x <= e.x) i++;
      const s = seg.get(i) || { cp: i, crashes: 0, lost: 0 };
      if (e.kind === 'crash') s.crashes++;
      if (e.amount > 0) s.lost += e.amount;
      seg.set(i, s);
    }
    let best = null, most = 0;
    for (const s of seg.values()) { const v = s.lost + s.crashes * 10; if (v > most) { most = v; best = s; } }
    if (!best || most < 5) return null;
    best.label = cpLabel(course, best.cp);
    return best;
  }

