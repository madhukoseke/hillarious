  /* =====================================================================
   * 4. COURSES (hand-authored gameplay geometry + curated landmarks)
   * ===================================================================*/
  const CAR_OUTLINE = [[0.0, 0.32], [0.05, 0.66], [0.32, 0.84], [0.86, 1.36], [2.36, 1.38], [3.06, 0.94], [3.8, 0.8], [3.92, 0.34]];
  const CAR_LEN = 3.92;

  // Landmarks were collected once, before the build, with the Apify actor compass/crawler-google-places,
  // then normalized and hand-curated into data/sf-landmarks.json. Embedded verbatim: the game never fetches.
  // gameX is authored on a 0-1000 scale along each route; real coordinates never drive terrain or collisions.
  const LANDMARK_DATA = {
    source: 'apify', game: 'HILLARIOUS', city: 'San Francisco',
    routes: [
      {
        id: 'nob-hill', name: 'Nob Hill', delivery: 'The $9 Latte',
        landmarks: [
          { id: 'grace-cathedral', name: 'Grace Cathedral', type: 'cathedral', gameX: 180, visual: 'large-gothic-cathedral' },
          { id: 'huntington-park', name: 'Huntington Park', type: 'park', gameX: 480, visual: 'trees-and-park-fence' },
          { id: 'cable-car-museum', name: 'Cable Car Museum', type: 'museum', gameX: 820, visual: 'historic-brick-building' },
        ],
      },
      {
        id: 'russian-hill', name: 'Russian Hill', delivery: 'The Wedding Cake',
        landmarks: [
          { id: 'macondray-lane', name: 'Macondray Lane', type: 'residential', gameX: 180, visual: 'tree-lined-lane' },
          { id: 'ina-coolbrith-park', name: 'Ina Coolbrith Park', type: 'park', gameX: 480, visual: 'hillside-park' },
          { id: 'lombard-street', name: 'Lombard Street', type: 'street', gameX: 820, visual: 'winding-street-backdrop' },
        ],
      },
    ],
  };
  // Hand-authored stand-in, used only if the curated set ever drops below four landmarks.
  const FALLBACK_LANDMARKS = {
    routes: [
      { id: 'nob-hill', landmarks: [{ id: 'nob-park', name: 'Nob Hill', type: 'view', gameX: 500, visual: 'trees-and-park-fence' }] },
      { id: 'russian-hill', landmarks: [{ id: 'russian-park', name: 'Russian Hill', type: 'view', gameX: 500, visual: 'hillside-park' }] },
    ],
  };
  const LANDMARK_SPAN = {
    'large-gothic-cathedral': 24, 'trees-and-park-fence': 18, 'historic-brick-building': 15,
    'tree-lined-lane': 12, 'hillside-park': 20, 'winding-street-backdrop': 26,
  };
  // Hand-written landmarks for routes the Apify export doesn't cover (D-10). Kept apart so the pinned export stays unchanged.
  const HAND_LANDMARKS = {
    source: 'hand', routes: [
      { id: 'telegraph-hill', landmarks: [{ id: 'pioneer-park', name: 'Pioneer Park', type: 'park', gameX: 480, visual: 'hillside-park' }] },
    ],
  };
  function landmarkCount(data) { return (data.routes || []).reduce((n, r) => n + ((r.landmarks && r.landmarks.length) || 0), 0); }
  function landmarksFor(routeId, C, data) {
    const curated = data || LANDMARK_DATA, src = landmarkCount(curated) >= 4 ? curated : FALLBACK_LANDMARKS;
    const route = src.routes.find((r) => r.id === routeId) || HAND_LANDMARKS.routes.find((r) => r.id === routeId);
    if (!route) return [];
    const len = C.doorX - C.start;
    return route.landmarks.map((lm) => {
      const x = C.start + (clamp(+lm.gameX || 0, 0, 1000) / 1000) * len, span = LANDMARK_SPAN[lm.visual] || 16;
      return { id: lm.id, name: lm.name, type: lm.type, visual: lm.visual, x, x0: x - span / 2, x1: x + span / 2 };
    });
  }

  function emptyCourse(id) {
    return {
      id, index: 0, title: '', hood: '', street: 'CALIFORNIA', theme: 'nob', cargo: 'coffee', par: 45, seed: 7,
      start: 0, finishX: 1e9, doorX: 1e9 + 12, terrain: null, checkpoints: [{ x: 0 }],
      potholes: [], cones: [], cars: [], ramps: [], crossers: [], powerups: [], stairs: [], lips: [], intersections: [],
      crosswalks: [], pedestrians: [], hints: [], landmarks: [], park: null, office: null, venue: null, customer: null,
      streetTrees: false, stopZones: [], loop: false, dialogue: null, boardwalk: null,
    };
  }

  // Set pieces (F-30). A route is a list of pieces; each piece returns a fragment of ROUTE_DATA (path steps, features,
  // objects) plus what it is: its length and grades (measured from its path), difficulty 1–5, and the hazards it adds.
  // Inside a piece, a number is an offset from the piece's own mark and a string is any position ("larkin-6").
  // Pieces never round positions, so a route built from pieces is identical to the same route written by hand.
  const rel = (mark, ...offs) => mark + offs.map((o) => (o < 0 ? '-' + -o : '+' + o)).join('');
  const HAZARD_HINTS = {
    car: { id: 'car', actions: [], text: 'Parked robot car ahead. Ride the plank or hop it!' },
    gust: { id: 'gust', actions: ['brake'], text: 'On the road? Gust ahead. Ease off, or the petals go.' },
    fog: { id: 'fog', actions: ['brake'], text: 'Fog ahead. Listen for the beeps and watch for the amber lights.' },
  };
  function fragment(kind, mark, p) {
    const f = { kind, mark, difficulty: p.difficulty || 1, hazards: [], path: [], features: [], marks: { ...(p.marks || {}) },
      cones: [], cars: [], ramps: [], crossers: [], powerups: [], pedestrians: [], checkpoints: [], hints: [] };
    const at = (v) => (typeof v === 'string' || mark === null ? v : rel(mark, v)); // the plateau has no mark: absolute
    f.at = at;
    for (const c of p.cones || []) f.cones.push(at(c));
    for (const u of p.powerups || []) f.powerups.push({ kind: u.kind, x: at(u.at) });
    for (const w of p.pedestrians || []) f.pedestrians.push({ x: at(w.at), kind: w.kind });
    for (const c of p.checkpoints || []) f.checkpoints.push(at(c));
    return f;
  }
  const hint = (f, h) => f.hints.push({ x: f.at(h.at), id: h.id, actions: h.actions, text: h.text });
  const PIECES = {
    // The start: a flat run-up and the first intersection. Positions here are absolute.
    plateau(p) {
      const f = fragment('plateau', null, p);
      f.path.push(['straight', p.len], ['intersection', ...p.street]);
      for (const h of p.hints || []) hint(f, h);
      return f;
    },
    // A block of road: an optional grade change in, a straight, an optional grade change out, and its hazards.
    block(p) {
      const f = fragment('block', p.mark, p);
      f.path.push(p.lead === undefined ? ['mark', p.mark] : ['mark', p.mark, p.lead]); // lead: the mark sits that far from here
      if (p.enter) f.path.push(['ease', ...p.enter]);
      f.path.push(['straight', p.len]);
      if (p.exit) f.path.push(['ease', ...p.exit]);
      for (const [x, w, d] of p.potholes || []) { f.features.push(['pothole', f.at(x), w, d]); f.hazards.push('pothole'); }
      for (const [x, w, h] of p.bumps || []) { f.features.push(['bump', f.at(x), w, h]); f.hazards.push('bump'); }
      if (p.car) { f.cars.push({ x: f.at(p.car.at), plank: p.car.plank }); f.hazards.push(p.car.plank ? 'car-plank' : 'car'); }
      if (p.ramp) { f.ramps.push({ x: f.at(p.ramp) }); f.hazards.push('ramp'); }
      for (const c of p.crossers || []) { f.crossers.push({ kind: c.kind, x: f.at(c.at), trigger: f.at(c.trigger) }); f.hazards.push(c.kind); }
      for (const h of p.hints || []) hint(f, { ...(HAZARD_HINTS[h.hazard] || {}), ...h });
      return f;
    },
    // A flight of stairs on its own grade, with a run-out back to level.
    stairs(p) {
      const f = fragment('stairs', p.mark, p);
      f.path.push(['ease', -p.rise / p.tread, p.approach], ['mark', p.mark, p.lead], ['straight', p.lead + p.n * p.tread + p.runout], ['ease', ...p.exit]);
      f.features.push(['stairs', p.mark, p.n, p.tread, p.rise]);
      f.hazards.push('stairs');
      for (const c of p.checkpointsAfter || []) f.checkpoints.push(rel(p.mark, p.n * p.tread, c)); // offsets past the last step
      for (const h of p.hints || []) hint(f, h);
      return f;
    },
    // An intersection, optionally with a raised-crosswalk lip on the way out and a cable car across it.
    crossing(p) {
      const f = fragment('crossing', p.mark, p);
      f.path.push(['street', p.name, p.len, p.mark]);
      if (p.lip) {
        const L = p.lip;
        f.path.push(['ease', ...L.up]);
        if (L.flat) f.path.push(['straight', L.flat]);
        f.path.push(['mark', L.mark], ['ease', ...L.down], ['lip', L.mark, L.big, L.crosswalk]);
        f.hazards.push(L.big ? 'big-lip' : 'lip');
      }
      if (p.cablecar) { const c = p.cablecar; f.crossers.push({ kind: 'cablecar', x: f.at(c.at), trigger: f.at(c.trigger), lead: c.lead, sign: c.sign }); f.hazards.push('cablecar'); }
      for (const h of p.hints || []) hint(f, h);
      return f;
    },
    // An exposed block (F-31): a grade in, then a straight where the wind blows, then a grade out. The gust runs from
    // the piece's mark to the end of the straight; cargo that minds the wind (the bouquet) feels it.
    gust(p) {
      const f = fragment('gust', p.mark, p);
      if (p.enter) f.path.push(['ease', ...p.enter]);
      f.path.push(['mark', p.mark], ['straight', p.len], ['gust', p.mark, p.wind]);
      if (p.exit) f.path.push(['ease', ...p.exit]);
      f.hazards.push('gust');
      for (const h of p.hints || []) hint(f, { ...(HAZARD_HINTS[h.hazard] || {}), ...h });
      return f;
    },
    // A block in fog (F-40, Karl the Fog): a block whose straight is fogged from its mark to its end. Fog only changes
    // what you can see; the world warns of every hazard inside it at least 2 s ahead (FOG, fogHazards).
    fog(p) {
      const f = PIECES.block(p), i = f.path.findIndex((s) => s[0] === 'straight');
      f.kind = 'fog';
      f.path.splice(i + 1, 0, ['fog', p.mark, p.density === undefined ? 1 : p.density]);
      f.hazards.unshift('fog');
      return f;
    },
    // A raised lip mid-block, away from any crossing (a driveway or a kerb): a short run to it, up, down, then the
    // rest of the block.
    lip(p) {
      const f = fragment('lip', p.mark, p);
      f.path.push(['mark', p.mark, p.lead], ['straight', p.run], ['ease', ...p.up], ['ease', ...p.down], ['lip', p.mark, !!p.big]);
      f.path.push(['straight', p.len]);
      if (p.exit) f.path.push(['ease', ...p.exit]);
      f.hazards.push(p.big ? 'big-lip' : 'lip');
      for (const h of p.hints || []) hint(f, h);
      return f;
    },
    // The last straight to the customer's door.
    finish(p) { const f = fragment('finish', p.mark, p); f.path.push(['mark', p.mark], ['straight', p.len]); return f; },
  };
  // Measures a piece from its path: length, and the grade it starts and ends on (given the grade it is entered at).
  function pieceShape(path, entry) {
    let length = 0, grade = entry;
    for (const [op, a, b] of path) {
      if (op === 'straight') length += a;
      else if (op === 'ease') { length += b; grade = a; }
      else if (op === 'street') length += b; // ['street', name, len, mark]
    }
    return { entry, exit: grade, length };
  }
  // Joins a route's pieces into the ROUTE_DATA shape. Features keep the order the hand-written routes used:
  // potholes, then stairs, then bumps.
  const FEATURE_ORDER = ['pothole', 'stairs', 'bump'];
  function joinPieces(R) {
    const out = { ...R, path: [], features: [], marks: {}, cones: [], cars: [], ramps: [], crossers: [], powerups: [], pedestrians: [], checkpoints: [], hints: [] };
    const shapes = [];
    let grade = 0;
    for (const [kind, p] of R.pieces) {
      const make = PIECES[kind];
      if (!make) throw new Error(`route ${R.meta.title}: unknown piece "${kind}"`);
      const f = make(p), shape = pieceShape(f.path, grade);
      grade = shape.exit;
      shapes.push({ kind, mark: f.mark, difficulty: f.difficulty, hazards: f.hazards, ...shape });
      for (const k of ['path', 'cones', 'cars', 'ramps', 'crossers', 'powerups', 'pedestrians', 'checkpoints', 'hints']) out[k].push(...f[k]);
      out.features.push(...f.features);
      Object.assign(out.marks, f.marks);
    }
    out.features.sort((a, b) => FEATURE_ORDER.indexOf(a[0]) - FEATURE_ORDER.indexOf(b[0])); // stable: route order within a type
    for (const k of ['cars', 'ramps', 'crossers', 'powerups']) if (!out[k].length) delete out[k];
    delete out.pieces;
    out.pieceShapes = shapes;
    return out;
  }

  // Routes as data (F-26). Each entry is the whole route: course facts, the road as a list of steps, features, and
  // every object. Positions are numbers or a named mark plus offsets ("blockB+44", "larkin-6-1.4"), applied left to
  // right, so a block can be resized without breaking the objects on it. buildRoute turns an entry into a course.
  //   Path steps: ['straight', len] · ['ease', grade, len] · ['mark', name, offset?] (the current x, plus offset)
  //   ['street', name, len, mark?] (an intersection) · ['intersection', x0, x1, name] · ['lip', mark, big, crosswalk?]
  //   ['gust', fromMark, wind] (from the mark to here)
  //   Features: ['pothole', at, width, depth] · ['bump', at, width, height] · ['stairs', at, n, tread, rise]
  const ROUTE_DATA = {
    nobHill: {
      meta: { index: 1, title: 'THE $9 LATTE', hood: 'NOB HILL', street: 'CALIFORNIA', theme: 'nob', cargo: 'coffee', par: 46, seed: 1873 },
      origin: [-70, 0], start: 4, park: { x0: -70, x1: 3 },
      pieces: [
        ['plateau', { len: 88, street: [6, 18, 'TAYLOR ST'], checkpoints: ['start'], hints: [{ at: -1e9, id: 'pedal', actions: ['pedal'], text: 'Hold to pedal' }] }],
        ['block', { mark: 'blockA', enter: [-0.1, 5], len: 58, exit: [0, 6], difficulty: 1, potholes: [[28, 1.3, 0.2]], // the learning block, 10%
          hints: [{ at: 10, id: 'hop', actions: ['hop'], text: 'Hop the pothole. Hold for higher.' }, { at: 46, id: 'brake', actions: ['brake'], text: 'Tap to brake. Hold it and the latte surges forward.' }] }],
        ['crossing', { name: 'MASON ST', len: 12, mark: 'mason', lip: { up: [0.1, 1.6], mark: 'lipA', down: [-0.18, 1.1], big: false, crosswalk: 1.6 }, pedestrians: [{ at: 'lipA+7', kind: 'dog' }], checkpoints: [2] }],
        ['block', { mark: 'blockB', len: 78, exit: [0, 7], difficulty: 2, car: { at: 44, plank: true }, cones: [37.5], powerups: [{ kind: 'bubble', at: 28 }], checkpoints: [18, 52], hints: [{ hazard: 'car', at: 24 }] }], // 18%, parked robot car
        ['crossing', { name: 'POWELL ST', len: 13, mark: 'powell', difficulty: 4, lip: { up: [0.26, 1.8], flat: 1.2, mark: 'lipB', down: [-0.34, 1.0], big: true, crosswalk: 3.0 },
          cablecar: { at: 6.5, trigger: -30, lead: 2.9, sign: 'POWELL & MASON' }, powerups: [{ kind: 'espresso', at: 10 }], pedestrians: [{ at: 'lipB+11', kind: 'tech' }], checkpoints: [2],
          hints: [{ at: -30, id: 'cable', actions: ['brake'], text: 'DING DING: cable car crossing! Brake, or beat it.' }, { at: 8, id: 'air', actions: ['hop', 'leanBack', 'leanFwd'], text: 'Hop at the lip for BIG AIR. Lean to land level.' }] }],
        ['block', { mark: 'blockC', len: 62, exit: [0, 9], difficulty: 4, bumps: [[30, 0.9, 0.07], [34, 0.9, 0.07]] }], // 34%, absurd
        ['crossing', { name: 'STOCKTON ST', len: 12, mark: 'stockton', lip: { up: [0.06, 1.2], mark: 'lipC', down: [-0.12, 1.2], big: false, crosswalk: 1.2 }, checkpoints: [2] }],
        ['block', { mark: 'blockD', len: 62, exit: [0, 6], difficulty: 2, potholes: [[26, 1.5, 0.24]], pedestrians: [{ at: 14, kind: 'fitness' }], checkpoints: [32] }], // 12%
        ['crossing', { name: 'GRANT AVE', len: 12, mark: 'grant', lip: { up: [0.06, 1.2], mark: 'lipD', down: [-0.08, 1.2], big: false, crosswalk: 1.2 }, pedestrians: [{ at: 'lipD+6', kind: 'tourist' }], checkpoints: [2] }],
        ['block', { mark: 'blockE', len: 50, exit: [0, 6], cones: [22, 23.3] }], // 8%, the home stretch
        ['finish', { mark: 'fin', len: 140 }],
      ],
      finish: { at: 'fin', office: { x0: 12, x1: 30 } },
      customer: {
        name: 'Skyler', role: 'Founder & CEO, Meetingless', avatar: 'founder', brand: 'MEETINGLESS HQ',
        order: 'ORDER #0009 · OAT LATTE (L) · NO LID', route: 'Down California Street to the Financial District',
        messages: ["Please don't ring the bell. I'm in a meeting about reducing unnecessary meetings.", "Also: no lid. We're reducing single-use plastics."],
        cargoNote: 'Cargo: one large oat-milk latte. Lidless. Brimming.', cargoLabel: 'Coffee remaining',
      },
      length: true, landmarks: 'nob-hill',
    },
    russianHill: {
      meta: { index: 2, title: 'THE WEDDING CAKE', hood: 'RUSSIAN HILL', street: 'GREEN', theme: 'russian', cargo: 'cake', par: 48, seed: 2026, streetTrees: true },
      origin: [-70, 0], start: 3, park: { x0: -70, x1: 1 }, dropLabel: ' m to the wedding',
      pieces: [
        ['plateau', { len: 84, street: [3, 14, 'JONES ST'], pedestrians: [{ at: 9, kind: 'tourist' }], checkpoints: ['start'], hints: [{ at: -1e9, id: 'cake', actions: ['pedal'], text: 'Wedding cake on board. Smooth is fast.' }] }],
        ['block', { mark: 'block1', enter: [-0.16, 5], len: 40, difficulty: 2, potholes: [[22, 2.0, 0.28]], hints: [{ at: 8, id: 'pothole', actions: ['hop'], text: 'Big pothole. Hop it!' }] }], // 16%, the big pothole
        ['stairs', { mark: 'stairsX', rise: 0.22, tread: 0.75, n: 7, approach: 3, lead: 1.5, runout: 3, exit: [0, 6], difficulty: 3, // Macondray Lane
          pedestrians: [{ at: 2.5, kind: 'fitness' }], checkpointsAfter: [4], hints: [{ at: -12, id: 'stairs', actions: ['brake'], text: 'Macondray Lane steps. Slow down... or hop.' }] }],
        ['crossing', { name: 'LEAVENWORTH ST', len: 12, mark: 'leav', lip: { up: [0.08, 1.4], mark: 'lipA', down: [-0.3, 1.2], big: false, crosswalk: 1.4 }, powerups: [{ kind: 'bubble', at: 6 }], checkpoints: [2] }],
        ['block', { mark: 'block2', len: 60, exit: [0, 7], difficulty: 3, pedestrians: [{ at: 24, kind: 'dog' }], checkpoints: [12] }], // 30%, Ina Coolbrith Park
        ['crossing', { name: 'HYDE ST', len: 14, mark: 'hyde', difficulty: 4, lip: { up: [0.06, 1.2], mark: 'lipB', down: [-0.36, 1.0], big: true, crosswalk: 1.2 },
          cablecar: { at: 7, trigger: -45, lead: 3.6, sign: 'POWELL & HYDE' }, checkpoints: [2], hints: [{ at: -45, id: 'cable', actions: ['brake'], text: 'Cable car on Hyde! Brake early on this slope.' }] }],
        ['block', { mark: 'block3', len: 52, exit: [-0.12, 8], difficulty: 5, bumps: [[26, 0.9, 0.07], [30, 0.9, 0.07]], pedestrians: [{ at: 14, kind: 'tech' }], checkpoints: [20] }], // 36%, the dramatic one
        ['block', { mark: 'cz', len: 40, exit: [0, 5], difficulty: 4, marks: { rampX: 'larkin-6' }, ramp: 'rampX', cones: ['rampX-1.4', 9, 10.3], // construction zone: 12%
          crossers: [{ kind: 'maybemo', at: 'rampX+7.6', trigger: 'larkin-45' }], checkpoints: [-2], hints: [{ at: 'larkin-30', id: 'ramp', actions: ['pedal', 'hop'], text: 'A robot car is stalling at Larkin. Jump the ramp!' }] }],
        ['crossing', { name: 'LARKIN ST', len: 14, mark: 'larkin', lip: { up: [0.05, 1.2], mark: 'lipC', down: [-0.1, 1.2], big: false, crosswalk: 1.2 }, powerups: [{ kind: 'espresso', at: 11 }], checkpoints: [6] }],
        ['block', { mark: 'block4', len: 60, exit: [0, 6], cones: [34, 35.3], pedestrians: [{ at: 18, kind: 'tourist' }], checkpoints: [24] }], // 10%, Lombard Street backdrop
        ['finish', { mark: 'fin', len: 140 }],
      ],
      finish: { at: 'fin', venue: { x0: 7, x1: 34, arch: 18 } },
      customer: {
        name: 'Gwen', role: 'Wedding planner, Frost & Tiers Events', avatar: 'planner', brand: 'FROST & TIERS EVENTS',
        order: 'ORDER #0002 · 3-TIER CAKE · HANDLE WITH CARE', route: 'Across Russian Hill to Lombard Gardens',
        messages: ["Please keep it upright. Unlike the groom's finances.", 'Three tiers. Fondant. Zero "creative interpretations."'],
        cargoNote: 'Cargo: one three-tier wedding cake, strapped to the rack with optimism.', cargoLabel: 'Cake integrity',
      },
      length: true, landmarks: 'russian-hill',
    },
    // Telegraph Hill: a steep block with one exposed downhill gust, and the sheltered Napier Lane boardwalk above it.
    telegraph: {
      meta: { index: 3, title: 'THE BOUQUET', hood: 'TELEGRAPH HILL', street: 'GREENWICH', theme: 'telegraph', cargo: 'bouquet', par: 48, seed: 2027 },
      origin: [-60, 0], start: 3, park: { x0: -60, x1: 1 },
      pieces: [
        ['plateau', { len: 90, street: [3, 12, 'KEARNY ST'], checkpoints: ['start'], // a run-up, to choose road or boardwalk before the gust
          hints: [{ at: 6, id: 'boardwalk', actions: ['hop'], text: 'Hop up to the boardwalk: no gust, but slower.' }] }],
        ['gust', { mark: 'gust0', enter: [-0.14, 6], len: 40, wind: -6, exit: [0, 5], difficulty: 3, checkpoints: [10], hints: [{ hazard: 'gust', at: -8 }] }],
        ['lip', { mark: 'lipA', lead: 2, run: 4, up: [0.07, 1.2], down: [-0.1, 1.2], len: 40, exit: [0, 6], difficulty: 2, checkpoints: [2] }],
        ['block', { mark: 'potholeX', lead: 6, len: 120, difficulty: 2, potholes: [[0, 1.0, 0.22]] }],
        // The long run-down to Ruth's door (D-12): a second grade, a flat, and pedestrians on the sidewalk.
        ['block', { mark: 'pedA', lead: 30, len: 30, exit: [-0.12, 6], pedestrians: [{ at: 0, kind: 'tourist' }] }],
        ['block', { mark: 'grade2', len: 110, exit: [0, 6], difficulty: 2 }], // 12%
        ['block', { mark: 'flat', len: 50 }],
        ['block', { mark: 'pedB', lead: -40, len: 40, pedestrians: [{ at: 0, kind: 'dog' }] }],
        ['finish', { mark: 'fin', len: 90, checkpoints: [-10] }],
      ],
      finish: { at: 'fin', venue: { x0: 7, x1: 34, arch: 18 } },
      // The safe approach (D-12, D-17): hop up to Napier Lane's boardwalk, out of the gust and over the lip and pothole.
      // It is one-way, so a rider who doesn't hop stays on the road underneath. "ground" is the road height there.
      boardwalk: { name: 'NAPIER LANE', x0: 'gust0-18-3', x1: 'potholeX+62', speedLimit: 8.5, pts: [['gust0-18-3', 0.25], ['gust0-18', 0.55], ['gust0', 0.45], ['potholeX+62', 'ground-0.1']] },
      customer: {
        name: 'Ruth', role: 'Florist, Telegraph Blooms', avatar: 'planner', brand: 'TELEGRAPH BLOOMS',
        order: 'ORDER #0003 · BOUQUET · PETALS ONLY', route: 'Down Telegraph Hill to the Bouquet Office',
        messages: ['Every petal counts. Do not let the wind win.', 'Napier Lane is sheltered, if you can hop up to it. Gusts are not an excuse.'],
        cargoNote: 'Cargo: one hand-tied bouquet. Petals only.', cargoLabel: 'Petals left',
      },
      landmarks: 'telegraph-hill',
    },
  };

  // Karl the Fog (F-40). Fog hides the road ahead, so the world warns of each hazard inside it (or just past it) with a
  // beep and an amber light, once the bike is within warnDist of it. warnDist assumes the bike keeps accelerating
  // downhill, so at any rider's speed the warning comes at least 2 s ahead (the fog rule, tested on every route).
  const FOG = { lead: 2.4, accel: 3, minDist: 14, tail: 8, rule: 2 };
  function fogAt(C, x) {
    for (const f of C.fogs || []) if (x >= f.x0 && x <= f.x1) return f.density;
    return 0;
  }
  const fogWarnDist = (v) => Math.max(FOG.minDist, Math.max(0, v) * FOG.lead + 0.5 * FOG.accel * FOG.lead * FOG.lead);
  // Every hazard inside a fog bank (or within FOG.tail past it), in road order: { kind, x }.
  function fogHazards(C) {
    if (!C.fogs || !C.fogs.length) return [];
    const all = [
      ...C.potholes.map((h) => ({ kind: 'pothole', x: h.x0 })), ...C.stairs.map((h) => ({ kind: 'stairs', x: h.x0 })),
      ...C.lips.map((h) => ({ kind: h.big ? 'big-lip' : 'lip', x: h.x })), ...(C.cars || []).map((h) => ({ kind: 'car', x: h.x })),
      ...(C.ramps || []).map((h) => ({ kind: 'ramp', x: h.x })), ...(C.crossers || []).map((h) => ({ kind: h.kind, x: h.x })),
      ...(C.cones || []).map((x) => ({ kind: 'cone', x })),
    ];
    return all.filter((h) => C.fogs.some((f) => h.x >= f.x0 && h.x <= f.x1 + FOG.tail)).sort((a, b) => a.x - b.x);
  }

  // Turns a ROUTE_DATA entry into a course. Marks are read left to right with their offsets, so the arithmetic (and so
  // every position) is exactly what the hand-written builders produced; the port check (F-28) holds it to that.
  const POS_KEYS = new Set(['x', 'x0', 'x1', 'trigger', 'arch']);
  function buildRoute(id, data = ROUTE_DATA[id]) {
    const R = data.pieces ? joinPieces(data) : data, C = emptyCourse(id), marks = { start: R.start };
    Object.assign(C, R.meta);
    const at = (p) => {
      if (typeof p === 'number') return p;
      const m = /^([A-Za-z]\w*)((?:[+-]\d+(?:\.\d+)?)*)$/.exec(p);
      if (!m || !(m[1] in marks)) throw new Error(`route ${id}: unknown position "${p}"`);
      let v = marks[m[1]];
      for (const t of m[2].match(/[+-]\d+(?:\.\d+)?/g) || []) v = t[0] === '+' ? v + Number(t.slice(1)) : v - Number(t.slice(1));
      return v;
    };
    const place = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, POS_KEYS.has(k) ? at(v) : v]));
    const b = new CourseBuilder(R.origin[0], R.origin[1]);
    C.start = R.start; C.park = { ...R.park };
    for (const [op, ...a] of R.path) {
      if (op === 'straight') b.straight(a[0]);
      else if (op === 'ease') b.ease(a[0], a[1]);
      else if (op === 'mark') marks[a[0]] = a[1] === undefined ? b.x : b.x + a[1];
      else if (op === 'intersection') C.intersections.push({ x0: a[0], x1: a[1], name: a[2] });
      else if (op === 'street') { const x0 = b.x; if (a[2]) marks[a[2]] = x0; b.straight(a[1]); C.intersections.push({ x0, x1: b.x, name: a[0] }); }
      else if (op === 'lip') { const x = marks[a[0]]; C.lips.push({ x, big: a[1] }); if (a[2] !== undefined) C.crosswalks.push({ x0: x - a[2], x1: x }); }
      else if (op === 'gust') (C.gusts || (C.gusts = [])).push({ x0: marks[a[0]], x1: b.x, wind: a[1] });
      else if (op === 'fog') (C.fogs || (C.fogs = [])).push({ x0: marks[a[0]], x1: b.x, density: a[1] });
      else throw new Error(`route ${id}: unknown path step "${op}"`);
    }
    for (const [name, p] of Object.entries(R.marks || {})) marks[name] = at(p);
    const F = R.finish, fin = marks[F.at];
    C.finishX = fin + 6; C.doorX = fin + 18;
    if (F.office) C.office = { x0: fin + F.office.x0, x1: fin + F.office.x1 };
    if (F.venue) C.venue = { x0: fin + F.venue.x0, x1: fin + F.venue.x1, arch: fin + F.venue.arch };
    for (const [type, p, ...a] of R.features || []) b[type](at(p), ...a);
    C.terrain = b.build();
    C.potholes = b.features.filter((f) => f.type === 'pothole').map((f) => ({ x0: f.x0, x1: f.x1, depth: f.depth }));
    C.stairs = b.features.filter((f) => f.type === 'stairs').map((f) => ({ x0: f.x0, x1: f.x1, n: f.n, tread: f.tread, rise: f.rise }));
    if (R.ramps) C.ramps = R.ramps.map(place);
    if (R.cones) C.cones = R.cones.map(at);
    if (R.cars) C.cars = R.cars.map(place);
    if (R.crossers) C.crossers = R.crossers.map(place);
    if (R.powerups) C.powerups = R.powerups.map(place);
    if (R.pedestrians) C.pedestrians = R.pedestrians.map(place);
    C.checkpoints = R.checkpoints.map((p) => ({ x: at(p) }));
    if (R.boardwalk) {
      const W = R.boardwalk;
      C.boardwalk = { ...place(W), pts: W.pts.map(([x, y]) => { const px = at(x); return [px, typeof y === 'number' ? y : C.terrain.height(px) - Number(/^ground-(\d+(?:\.\d+)?)$/.exec(y)[1])]; }) };
    }
    C.hints = R.hints.map(place);
    C.customer = { ...R.customer, messages: R.customer.messages.slice() };
    if (R.length) C.length = C.doorX - C.start;
    C.landmarks = landmarksFor(R.landmarks, C);
    return C;
  }
  function buildNobHill() { return buildRoute('nobHill'); }
  function buildRussianHill() { return buildRoute('russianHill'); }
  function buildTelegraphHill() { return buildRoute('telegraph'); }

  // Route generator (F-33). It never invents terrain (D-05): it joins hand-made segments, each one or two set pieces
  // lifted from the hand-written routes, starting and ending on level ground, so every join is smooth. The layout
  // uses only mulberry32 and integer choices, so every browser builds the same route from the same seed.
  //   Rules: 5–7 segments, picked without repeats; difficulty never falls along the route; at most one difficulty-5
  //   segment; never two blind hazards (ones you can't see coming, like a cable car) in a row. Par is the sum of the
  //   segments' design times (the typical rider's measured time) over PAR_SHARE, and at most PAR_MAX: the latest picks are
  //   dropped until it fits.
  // `m` is the segment's mark prefix and `st` a cross-street name; a segment's own marks are m, m + 'x', m + 'y'.
  const GEN_SEGMENTS = [
    { id: 'gentle', difficulty: 1, time: 5.7, make: (m) => [['block', { mark: m, enter: [-0.08, 5], len: 50, exit: [0, 6], cones: [22, 23.3], checkpoints: [2] }]] },
    { id: 'pothole', difficulty: 1, time: 6.0, make: (m) => [['block', { mark: m, enter: [-0.1, 5], len: 58, exit: [0, 6], potholes: [[28, 1.3, 0.2]], checkpoints: [2],
      hints: [{ at: 10, id: 'hop', actions: ['hop'], text: 'Pothole ahead. Hop it. Hold for higher.' }] }]] },
    { id: 'crossing', difficulty: 2, time: 6.8, make: (m, st) => [
      ['crossing', { name: st, len: 12, mark: m, lip: { up: [0.06, 1.2], mark: m + 'x', down: [-0.12, 1.2], big: false, crosswalk: 1.2 }, checkpoints: [2] }],
      ['block', { mark: m + 'y', len: 62, exit: [0, 6], difficulty: 2, potholes: [[26, 1.5, 0.24]], pedestrians: [{ at: 14, kind: 'fitness' }], checkpoints: [32] }]] },
    { id: 'car', difficulty: 2, time: 8.6, make: (m, st) => [
      ['crossing', { name: st, len: 12, mark: m, lip: { up: [0.1, 1.6], mark: m + 'x', down: [-0.18, 1.1], big: false, crosswalk: 1.6 }, checkpoints: [2] }],
      ['block', { mark: m + 'y', len: 78, exit: [0, 7], difficulty: 2, car: { at: 44, plank: true }, cones: [37.5], checkpoints: [18, 52], hints: [{ hazard: 'car', at: 24 }] }]] },
    { id: 'gust', difficulty: 3, time: 4.3, make: (m) => [['gust', { mark: m, enter: [-0.14, 6], len: 40, wind: -6, exit: [0, 5], difficulty: 3, checkpoints: [10], hints: [{ hazard: 'gust', at: -8 }] }]] },
    { id: 'stairs', difficulty: 3, time: 5.7, make: (m) => [
      ['block', { mark: m, enter: [-0.12, 5], len: 30, checkpoints: [2] }],
      ['stairs', { mark: m + 'x', rise: 0.22, tread: 0.75, n: 7, approach: 3, lead: 1.5, runout: 3, exit: [0, 6], difficulty: 3, checkpointsAfter: [4],
        hints: [{ at: -12, id: 'stairs', actions: ['brake'], text: 'Steps ahead. Slow down... or hop.' }] }]] },
    { id: 'park', difficulty: 3, time: 6.7, make: (m, st) => [
      ['crossing', { name: st, len: 12, mark: m, lip: { up: [0.08, 1.4], mark: m + 'x', down: [-0.3, 1.2], big: false, crosswalk: 1.4 }, checkpoints: [2] }],
      ['block', { mark: m + 'y', len: 60, exit: [0, 7], difficulty: 3, pedestrians: [{ at: 24, kind: 'dog' }], checkpoints: [12] }]] },
    { id: 'bigLip', difficulty: 4, time: 8.4, make: (m, st) => [
      ['crossing', { name: st, len: 13, mark: m, difficulty: 4, lip: { up: [0.26, 1.8], flat: 1.2, mark: m + 'x', down: [-0.34, 1.0], big: true, crosswalk: 3.0 }, checkpoints: [2],
        hints: [{ at: 8, id: 'air', actions: ['hop', 'leanBack', 'leanFwd'], text: 'Hop at the lip for BIG AIR. Lean to land level.' }] }],
      ['block', { mark: m + 'y', len: 62, exit: [0, 9], difficulty: 4, bumps: [[30, 0.9, 0.07], [34, 0.9, 0.07]] }]] },
    { id: 'cablecar', difficulty: 5, blind: true, time: 9.0, make: (m, st) => [
      ['crossing', { name: st, len: 13, mark: m, difficulty: 5, lip: { up: [0.26, 1.8], flat: 1.2, mark: m + 'x', down: [-0.34, 1.0], big: true, crosswalk: 3.0 },
        cablecar: { at: 6.5, trigger: -30, lead: 2.9, sign: st }, checkpoints: [2],
        hints: [{ at: -30, id: 'cable', actions: ['brake'], text: 'DING DING: cable car crossing! Brake, or beat it.' }] }],
      ['block', { mark: m + 'y', len: 62, exit: [0, 9], difficulty: 4, bumps: [[30, 0.9, 0.07], [34, 0.9, 0.07]] }]] },
  ];
  const GEN_STREETS = ['TAYLOR ST', 'MASON ST', 'POWELL ST', 'STOCKTON ST', 'GRANT AVE', 'KEARNY ST', 'JONES ST', 'LEAVENWORTH ST', 'HYDE ST', 'LARKIN ST', 'POLK ST', 'VAN NESS AVE', 'FRANKLIN ST', 'GOUGH ST'];
  const GEN_PLATEAU = 2.2, GEN_FINISH = 0.6, PAR_SHARE = 0.85, PAR_MAX = 50; // design times of the start and the last metres
  const GEN_LOOK = { coffee: { theme: 'nob', dialogue: 1 }, cake: { theme: 'russian', dialogue: 2 }, bouquet: { theme: 'telegraph', dialogue: 3 } };
  const genDesignTime = (segs) => GEN_PLATEAU + GEN_FINISH + segs.reduce((t, g) => t + g.time, 0);
  // The plan only: which segments, in what order, and on which streets. Integer choices from the seed and nothing else.
  function planRoute(seed, rules = {}) {
    const rng = mulberry32(seed), pick = (n) => Math.floor(rng() * n);
    const min = rules.min || 5, max = rules.max || 7, count = min + pick(max - min + 1);
    const pool = GEN_SEGMENTS.filter((g) => !(rules.exclude || []).includes(g.id)), chosen = [];
    while (chosen.length < count && pool.length) {
      const g = pool.splice(pick(pool.length), 1)[0];
      if (g.difficulty === 5 && chosen.some((c) => c.difficulty === 5)) continue; // at most one difficulty-5 segment
      chosen.push(g);
    }
    // Keep par at most PAR_MAX: drop the latest picks, but never below `min` segments.
    while (chosen.length > min && genDesignTime(chosen) / PAR_SHARE > PAR_MAX) chosen.pop();
    chosen.sort((a, b) => a.difficulty - b.difficulty); // stable: difficulty rises, ties keep the pick order
    for (let i = 1; i < chosen.length; i++) if (chosen[i].blind && chosen[i - 1].blind) throw new Error('generator: two blind hazards in a row');
    const streets = GEN_STREETS.slice(), street = () => streets.splice(pick(streets.length), 1)[0];
    const start = street();
    return { seed, start, segments: chosen.map((g) => ({ id: g.id, street: street() })) };
  }
  // A ROUTE_DATA entry for a seed. rules.cargo picks the cargo (default: the latte); rules.min / rules.max the length.
  function generateRoute(seed, rules = {}) {
    const plan = planRoute(seed, rules), cargo = cleanCargo(rules.cargo), look = GEN_LOOK[cargo] || GEN_LOOK.coffee;
    const segs = plan.segments.map((s, i) => ({ ...GEN_SEGMENTS.find((g) => g.id === s.id), street: s.street, mark: 'g' + (i + 1) }));
    const design = genDesignTime(segs);
    const pieces = [['plateau', { len: 84, street: [6, 18, plan.start], checkpoints: ['start'], hints: [{ at: -1e9, id: 'pedal', actions: ['pedal'], text: 'Hold to pedal' }] }]];
    for (const g of segs) pieces.push(...g.make(g.mark, g.street));
    pieces.push(['finish', { mark: 'fin', len: 140 }]);
    return {
      meta: { index: 0, title: 'DAILY DISPATCH', hood: 'SAN FRANCISCO', street: plan.start.replace(/ (ST|AVE)$/, ''), theme: look.theme, cargo, par: Math.round(design / PAR_SHARE), seed: plan.seed, dialogue: look.dialogue },
      origin: [-70, 0], start: 4, park: { x0: -70, x1: 3 }, pieces,
      finish: cargo === 'coffee' ? { at: 'fin', office: { x0: 12, x1: 30 } } : { at: 'fin', venue: { x0: 7, x1: 34, arch: 18 } },
      customer: {
        name: 'Dispatch', role: 'Hillarious Couriers', avatar: 'founder', brand: 'HILLARIOUS DISPATCH',
        order: 'DAILY ORDER #' + plan.seed, route: segs.length + ' blocks from ' + plan.start + ' to the drop',
        messages: ["Today's route. Same hills for everyone. Don't make it weird."],
        cargoNote: 'Cargo: one ' + cargoWords(cargo).noun.toLowerCase() + '.', cargoLabel: 'Condition',
      },
      plan: segs.map((g) => ({ id: g.id, difficulty: g.difficulty, blind: !!g.blind, time: g.time, mark: g.mark })),
      length: true,
    };
  }
  // Split records (F-35): hillarious:splits:<route> { v, splits } keeps the fastest complete run; Daily Dispatch keeps
  // the scored ride's as hillarious:splits:daily { v, date, splits }.
  function cleanSplits(rec, n) {
    const s = rec && Array.isArray(rec.splits) ? rec.splits : null;
    if (!s || !s.length || (n !== undefined && s.length !== n)) return null;
    for (let i = 0; i < s.length; i++) if (!Number.isFinite(s[i]) || s[i] < 0 || (i && s[i] < s[i - 1])) return null;
    const out = { v: RECORD_VERSION, splits: s.slice() };
    if (rec.date !== undefined) { if (!validDateKey(rec.date)) return null; out.date = rec.date; }
    return out;
  }
  const completeSplits = (s) => Array.isArray(s) && s.length > 0 && s.every((t) => Number.isFinite(t));
  // Seconds ahead (negative) or behind (positive) at each split; null where either run has no time.
  function splitDeltas(splits, ref) {
    return (splits || []).map((t, i) => (t == null || !ref || ref[i] == null ? null : t - ref[i]));
  }
  // Keeps the faster complete run (by finish time).
  function recordSplits(prev, splits) {
    const old = cleanSplits(prev, splits ? splits.length : undefined);
    if (!completeSplits(splits)) return { isNew: false, best: old };
    if (old && old.splits[old.splits.length - 1] <= splits[splits.length - 1]) return { isNew: false, best: old };
    return { isNew: true, best: { v: RECORD_VERSION, splits: splits.slice() } };
  }
  const fmtDelta = (d) => { const t = Math.abs(d).toFixed(1); return (t === '0.0' ? '±' : d < 0 ? '−' : '+') + t; };
  function buildGenerated(seed, rules) { return buildRoute('gen-' + (seed >>> 0), generateRoute(seed, rules)); }

  // Daily Dispatch (F-34). Everyone gets the same route on the same local date: the date gives the seed, and the seed
  // gives the route, the cargo, and one remix (a generator rule). The daily number counts days from DAILY_EPOCH.
  const DAILY_EPOCH = '2026-11-09'; // HILLARIOUS #1
  const DAILY_REMIXES = [
    { id: 'classic', name: 'Classic', note: 'The usual chaos.', rules: {} },
    { id: 'short', name: 'Short haul', note: 'Five blocks. No excuses.', rules: { min: 5, max: 5 } },
    { id: 'calm', name: 'Calm day', note: 'No gusts, no cable cars.', rules: { exclude: ['gust', 'cablecar'] } },
  ];
  const DAILY_CARGOS = ['coffee', 'cake', 'bouquet'];
  const DATE_KEY = /^(\d{4})-(\d{2})-(\d{2})$/;
  function dateKey(d) { const p = (n) => String(n).padStart(2, '0'); return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()); }
  // Whole days since 1970 for a date key (no time zones: the key is already the player's local date), or NaN.
  function dayIndex(key) {
    const m = DATE_KEY.exec(typeof key === 'string' ? key : '');
    if (!m) return NaN;
    const t = Date.UTC(+m[1], +m[2] - 1, +m[3]), d = new Date(t);
    return d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3] ? Math.round(t / 86400000) : NaN;
  }
  function keyForDay(n) { return new Date(n * 86400000).toISOString().slice(0, 10); }
  const validDateKey = (key) => Number.isFinite(dayIndex(key));
  const dailyNumber = (key) => dayIndex(key) - dayIndex(DAILY_EPOCH) + 1;
  // FNV-1a over the date: integer maths only, so every engine agrees.
  function dailySeed(key) { let h = 0x811c9dc5; for (const ch of 'hillarious:' + key) h = Math.imul(h ^ ch.charCodeAt(0), 0x01000193) >>> 0; return h >>> 0; }
  function dailySpec(key) {
    if (!validDateKey(key)) throw new Error('daily: bad date "' + key + '"');
    const seed = dailySeed(key), rng = mulberry32(seed ^ 0x5bd1e995), pick = (a) => a[Math.floor(rng() * a.length)];
    const cargo = pick(DAILY_CARGOS), remix = pick(DAILY_REMIXES);
    return { date: key, number: dailyNumber(key), seed, cargo, remix: remix.id };
  }
  function dailyRoute(key) {
    const spec = dailySpec(key), remix = DAILY_REMIXES.find((x) => x.id === spec.remix), R = generateRoute(spec.seed, { cargo: spec.cargo, ...remix.rules });
    R.meta = { ...R.meta, title: 'HILLARIOUS #' + spec.number, hood: remix.name.toUpperCase() };
    R.customer = { ...R.customer, order: 'DAILY DISPATCH #' + spec.number + ' · ' + key, messages: ["Today's route. Same hills for everyone. " + remix.note] };
    R.daily = spec;
    return R;
  }
  // Where each generated segment starts and ends on the road (for the share card's grid).
  function segmentSpans(R) {
    const J = joinPieces(R), out = [];
    let x = R.origin[0];
    for (const p of J.pieceShapes) {
      const g = R.plan.find((q) => q.mark === p.mark);
      if (g) { if (out.length) out[out.length - 1].x1 = x; out.push({ id: g.id, x0: x, x1: Infinity }); }
      x += p.length;
    }
    return out;
  }
  function buildDaily(key) {
    const R = dailyRoute(key), C = buildRoute('daily', R);
    C.daily = dailySpec(key); C.segments = segmentSpans(R);
    if (C.segments.length) C.segments[C.segments.length - 1].x1 = C.finishX; // exactly the course's finish line
    return C;
  }
  // Saved as hillarious:daily { v, date, seed, result } (result is null until the scored ride finishes, and stays null if
  // it never does), and hillarious:streak { v, count, best, last }.
  const DAILY_RESULT_KEYS = ['time', 'condition', 'crashes', 'tip', 'stars'];
  function cleanDaily(rec) {
    if (!rec || typeof rec !== 'object' || Array.isArray(rec) || !validDateKey(rec.date) || !Number.isInteger(rec.seed) || rec.seed < 0) return null;
    let result = null;
    if (rec.result != null) {
      if (typeof rec.result !== 'object' || !DAILY_RESULT_KEYS.every((k) => Number.isFinite(rec.result[k]) && rec.result[k] >= 0)) return null;
      result = Object.fromEntries(DAILY_RESULT_KEYS.map((k) => [k, rec.result[k]]));
      result.grid = cleanGrid(rec.result.grid);
    }
    return { v: RECORD_VERSION, date: rec.date, seed: rec.seed, result };
  }
  function cleanStreak(rec) {
    const ok = rec && typeof rec === 'object' && Number.isInteger(rec.count) && rec.count >= 0 && Number.isInteger(rec.best) && rec.best >= rec.count && (rec.last === null || validDateKey(rec.last));
    return ok ? { v: RECORD_VERSION, count: rec.count, best: rec.best, last: rec.last } : { v: RECORD_VERSION, count: 0, best: 0, last: null };
  }
  // Playing on consecutive days grows the streak; a missed day starts it again at 1. Playing twice in a day changes nothing.
  function nextStreak(streak, key) {
    const s = cleanStreak(streak);
    if (s.last === key) return s;
    const count = s.last && dayIndex(key) - dayIndex(s.last) === 1 ? s.count + 1 : 1;
    return { v: RECORD_VERSION, count, best: Math.max(s.best, count), last: key };
  }
  // The scored attempt is used when the ride starts, so restarting or quitting can't buy a second try.
  function startDaily(rec, streak, spec) {
    const old = cleanDaily(rec);
    if (old && old.date === spec.date) return { scored: false, rec: old, streak: cleanStreak(streak) };
    return { scored: true, rec: { v: RECORD_VERSION, date: spec.date, seed: spec.seed, result: null }, streak: nextStreak(streak, spec.date) };
  }
  function finishDaily(rec, spec, r, stars, grid = '') {
    const old = cleanDaily(rec);
    if (!old || old.date !== spec.date || old.result) return null; // only the day's first scored ride counts
    return { ...old, result: { time: r.time, condition: r.condition, crashes: r.crashes, tip: r.tip, stars, grid: cleanGrid(grid) } };
  }



  // Title backdrop: a plateau that tips into an absurd descent.
  function buildTitleCourse() {
    const C = emptyCourse('title');
    const b = new CourseBuilder(-70, 0);
    b.straight(68).ease(-0.62, 2.4).straight(15).ease(0, 5).straight(90);
    C.terrain = b.build();
    C.start = -3.2;
    C.seed = 42;
    C.park = { x0: -70, x1: -15 };
    C.intersections = [{ x0: -13, x1: -2.5, name: 'TAYLOR ST' }];
    C.cars = [{ x: 20.8, plank: false }];
    C.pedestrians = [{ x: 8, kind: 'tech', worried: true }];
    C.crossers = [{ kind: 'cablecar', x: -7.75, trigger: 1e9, lead: 2, sign: 'POWELL & MASON' }]; // scenery only
    return C;
  }

  // Flat and constant-slope courses for the test suite.
  function makeTestCourse(kind, cargo) {
    const C = emptyCourse('test-' + kind);
    if (cargo) C.cargo = cargo;
    const b = new CourseBuilder(-60, 0);
    if (kind === 'slope') { b.straight(65).ease(-0.15, 4).straight(420).ease(0, 6).straight(120); C.start = 12; }
    else { b.straight(700); C.start = 0; }
    C.terrain = b.build();
    C.checkpoints = [{ x: C.start }];
    return C;
  }

