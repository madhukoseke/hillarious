  /* =====================================================================
   * 4b. TRAINING COURSES: Courier Academy drills and The Test Hill.
   *     Pat from HR texts the brief; a drill finishes at the Academy's door.
   * ===================================================================*/
  const PAT = { name: 'Pat', role: 'Training Lead, HILLARIOUS HR', avatar: 'hr', brand: 'COURIER ACADEMY', tag: 'HR' };
  function drillCourse(id, cfg) {
    const C = emptyCourse(id), D = DRILLS.find((d) => d.id === id); // DRILLS is defined below; builders run after it exists
    Object.assign(C, { index: 0, dialogue: 'drill', hood: 'COURIER ACADEMY', street: 'ACADEMY', theme: 'nob', cargo: 'coffee', par: 20 }, D ? { title: D.title } : {}, cfg);
    C.park = { x0: -70, x1: 2 };
    C.customer = Object.assign({}, PAT, {
      order: D ? 'DRILL ' + (DRILLS.indexOf(D) + 1) + ' OF ' + DRILLS.length + ' · ' + D.title : C.title,
      cargoLabel: cargoWords(C.cargo).condition,
    }, cfg.customer);
    return C;
  }
  // Flat run-out to the Academy door; call after every terrain feature is placed.
  function finishDrill(C, b, fin) {
    C.finishX = fin + 6; C.doorX = fin + 18;
    if (!C.loop) C.office = { x0: fin + 12, x1: fin + 30, label: 'COURIER ACADEMY', sign: 'NO RUNNING. RIDING IS FINE.' };
    C.terrain = b.build();
    C.potholes = b.features.filter((f) => f.type === 'pothole').map((f) => ({ x0: f.x0, x1: f.x1, depth: f.depth }));
    C.length = C.doorX - C.start;
    return C;
  }

  function buildDrillBrake() {
    const C = drillCourse('drillBrake', { par: 24, seed: 901, customer: {
      route: 'Two STOP boxes, two hills, one lidless latte',
      messages: ['Stop in both STOP boxes. Rolling stops count. This is California.', 'Tap the brake. Slam it and the latte surges.'],
      cargoNote: 'Cargo: one training latte. Also lidless. We are consistent.',
    } });
    const b = new CourseBuilder(-70, 0);
    b.straight(78); C.start = 4;                              // the Academy lot
    b.ease(-0.1, 5).straight(36);                             // 10%
    b.ease(0, 6);
    const i1 = b.x; b.straight(14);
    C.intersections.push({ x0: i1, x1: b.x, name: 'ONBOARDING ST' });
    C.stopZones.push({ x0: i1 + 4, x1: i1 + 11 });
    b.ease(-0.16, 5).straight(34);                            // 16%: brake sooner
    b.ease(0, 6);
    const i2 = b.x; b.straight(14);
    C.intersections.push({ x0: i2, x1: b.x, name: 'COMPLIANCE ST' });
    C.stopZones.push({ x0: i2 + 4, x1: i2 + 11 });
    b.ease(-0.06, 4).straight(16).ease(0, 4);
    const fin = b.x; b.straight(140);
    C.checkpoints = [C.start, i1 + 12, i2 + 12].map((x) => ({ x }));
    C.hints = [
      { x: -1e9, id: 'pedal', actions: ['pedal'], text: 'Hold to pedal' },
      { x: i1 - 30, id: 'stop', actions: ['brake'], text: 'STOP box ahead. Brake early and gently.' },
      { x: i2 - 28, id: 'stop2', actions: ['brake'], text: 'Steeper block. Start braking sooner.' },
    ];
    C.pedestrians = [{ x: i1 + 13, kind: 'fitness' }];
    return finishDrill(C, b, fin);
  }

  function buildDrillHop() {
    const C = drillCourse('drillHop', { par: 16, seed: 902, customer: {
      route: 'Three potholes, each worse than the last',
      messages: ['Hop all three potholes. Tap for the small one; hold for the big ones.', 'The city calls them "features". So do we, in court.'],
      cargoNote: 'Cargo: one training latte, filled to the brim on purpose.',
    } });
    const b = new CourseBuilder(-70, 0);
    b.straight(78); C.start = 4;
    b.ease(-0.06, 5).straight(70);                            // 6%: speed for hopping
    b.ease(0, 6);
    const fin = b.x; b.straight(140);
    b.pothole(30, 0.9, 0.18).pothole(46, 1.4, 0.22).pothole(64, 2.0, 0.28);
    C.checkpoints = [C.start, 37, 55].map((x) => ({ x }));
    C.hints = [
      { x: -1e9, id: 'pedal', actions: ['pedal'], text: 'Hold to pedal' },
      { x: 16, id: 'hop', actions: ['hop'], text: 'Tap to hop the small one. Hold for the big ones.' },
    ];
    C.pedestrians = [{ x: 52, kind: 'tourist' }];
    return finishDrill(C, b, fin);
  }

  function buildDrillLip() {
    const C = drillCourse('drillLip', { par: 16, seed: 903, customer: {
      route: 'One intersection lip, one steep landing',
      messages: ['Hop at the lip for big air. Lean to land with the bike level.', 'Land on the downslope. HR prefers the bike in one piece.'],
      cargoNote: 'Cargo: one training latte. It has never flown before.',
    } });
    const b = new CourseBuilder(-70, 0);
    b.straight(78); C.start = 4;
    b.ease(-0.12, 5).straight(40);                            // 12% run-up
    b.ease(0, 7);
    const i1 = b.x; b.straight(12);
    C.intersections.push({ x0: i1, x1: b.x, name: 'LIABILITY ST' });
    b.ease(0.26, 1.8).straight(1.2); const lip = b.x; b.ease(-0.32, 1.0); // the kicker
    C.lips.push({ x: lip, big: true });
    C.crosswalks.push({ x0: lip - 3.0, x1: lip });
    const blk = b.x; b.straight(48);                          // 32% landing slope
    b.ease(0, 8);
    const fin = b.x; b.straight(140);
    C.checkpoints = [C.start, i1 + 2, blk + 22].map((x) => ({ x }));
    C.hints = [
      { x: -1e9, id: 'pedal', actions: ['pedal'], text: 'Hold to pedal' },
      { x: i1 - 18, id: 'air', actions: ['hop', 'leanBack', 'leanFwd'], text: 'Hop at the lip for BIG AIR. Lean to land level.' },
    ];
    C.pedestrians = [{ x: blk + 14, kind: 'tech' }];
    return finishDrill(C, b, fin);
  }

  function buildDrillStairs() {
    const C = drillCourse('drillStairs', { cargo: 'cake', theme: 'russian', streetTrees: true, par: 22, seed: 904, customer: {
      route: 'Seven steps, a steep block, and a STOP box at the bottom',
      messages: ['Ride the steps, then stop in the STOP box. With the cake.', 'The cake is a practice cake. Your grade is not.'],
      cargoNote: 'Cargo: one practice cake, strapped to the rack with hope.',
    } });
    const RISE = 0.22, TREAD = 0.75, STEPS = 7;
    const b = new CourseBuilder(-70, 0);
    b.straight(78); C.start = 4;
    b.ease(-0.16, 5).straight(30);                            // 16% run-in
    b.ease(-RISE / TREAD, 3);
    const st = b.x + 1.5; b.straight(1.5 + STEPS * TREAD + 3); // the steps ride on their own grade
    b.ease(-0.2, 4);
    const blk = b.x; b.straight(26);                          // 20%, straight off the steps
    b.ease(0, 7);
    const i1 = b.x; b.straight(14);
    C.intersections.push({ x0: i1, x1: b.x, name: 'SYNERGY ST' });
    C.stopZones.push({ x0: i1 + 4, x1: i1 + 11 });
    b.ease(-0.05, 4).straight(14).ease(0, 4);
    const fin = b.x; b.straight(140);
    b.stairs(st, STEPS, TREAD, RISE);
    C.stairs = [{ x0: st, x1: st + STEPS * TREAD, n: STEPS, tread: TREAD, rise: RISE }];
    C.checkpoints = [C.start, blk + 6, i1 + 12].map((x) => ({ x }));
    C.hints = [
      { x: -1e9, id: 'cake', actions: ['pedal'], text: 'Practice cake on board. Smooth is fast.' },
      { x: st - 16, id: 'stairs', actions: ['brake'], text: 'Steps ahead. Roll them slowly... or hop them.' },
      { x: blk + 2, id: 'stop', actions: ['brake'], text: 'STOP box at the bottom. Brake early; the cake hates surprises.' },
    ];
    C.pedestrians = [{ x: i1 + 13, kind: 'dog' }];
    return finishDrill(C, b, fin);
  }

  function buildDrillCable() {
    const C = drillCourse('drillCable', { par: 17, seed: 905, customer: {
      route: 'One cable car, one decision',
      messages: ['Cable car at Grip St. Brake and wait, or beat it across.', 'It weighs eight tons and has right of way. Both are non-negotiable.'],
      cargoNote: 'Cargo: one training latte. Its life insurance is pending.',
    } });
    const b = new CourseBuilder(-70, 0);
    b.straight(78); C.start = 4;
    b.ease(-0.12, 5).straight(50);
    b.ease(0, 7);
    const i1 = b.x; b.straight(14);
    C.intersections.push({ x0: i1, x1: b.x, name: 'GRIP ST' });
    b.ease(-0.05, 4).straight(24).ease(0, 4);
    const fin = b.x; b.straight(140);
    C.crossers = [{ kind: 'cablecar', x: i1 + 7, trigger: i1 - 32, lead: 3.0, sign: 'ACADEMY LINE' }];
    C.checkpoints = [C.start, i1 + 12].map((x) => ({ x }));
    C.hints = [
      { x: -1e9, id: 'pedal', actions: ['pedal'], text: 'Hold to pedal' },
      { x: i1 - 32, id: 'cable', actions: ['brake'], text: 'DING DING: cable car! Brake and wait, or beat it.' },
    ];
    C.pedestrians = [{ x: i1 + 16, kind: 'tourist' }];
    return finishDrill(C, b, fin);
  }

  function buildDrillExam() {
    const C = drillCourse('drillExam', { par: 40, seed: 906, customer: {
      route: 'Everything you learned, in one block of San Francisco',
      messages: ['Pothole, robot car, cable car, big lip. No crashes.', 'Pass and you are a Certified Courier. Fail and you are a Certified Pedestrian.'],
      cargoNote: 'Cargo: one exam latte. It is also being graded.',
    } });
    const b = new CourseBuilder(-70, 0);
    b.straight(78); C.start = 4;
    b.ease(-0.1, 5);
    const blkA = b.x; b.straight(50);                         // 10%: pothole
    b.ease(0, 6);
    const i1 = b.x; b.straight(12);
    C.intersections.push({ x0: i1, x1: b.x, name: 'ORIENTATION AVE' });
    b.ease(0.08, 1.4); const lipA = b.x; b.ease(-0.18, 1.1);
    C.lips.push({ x: lipA, big: false });
    C.crosswalks.push({ x0: lipA - 1.4, x1: lipA });
    const blkB = b.x; b.straight(70);                         // 18%: the parked robot car
    b.ease(0, 7);
    const i2 = b.x; b.straight(13);
    C.intersections.push({ x0: i2, x1: b.x, name: 'GRIP ST' });
    b.ease(0.26, 1.8).straight(1.2); const lipB = b.x; b.ease(-0.3, 1.0);
    C.lips.push({ x: lipB, big: true });
    C.crosswalks.push({ x0: lipB - 3.0, x1: lipB });
    const blkC = b.x; b.straight(50);                         // 30%
    b.ease(0, 8);
    const i3 = b.x; b.straight(12);
    C.intersections.push({ x0: i3, x1: b.x, name: 'GRADUATION ST' });
    b.ease(-0.06, 4);
    const blkD = b.x; b.straight(30);
    b.ease(0, 5);
    const fin = b.x; b.straight(140);
    b.pothole(blkA + 25, 1.4, 0.22);
    C.cones = [blkD + 14, blkD + 15.3];
    C.cars = [{ x: blkB + 40, plank: true }];
    C.crossers = [{ kind: 'cablecar', x: i2 + 6.5, trigger: i2 - 30, lead: 2.9, sign: 'ACADEMY LINE' }];
    C.powerups = [{ kind: 'bubble', x: blkB + 26 }];
    C.checkpoints = [C.start, i1 + 2, blkB + 18, i2 + 2, blkC + 20, i3 + 2].map((x) => ({ x }));
    C.hints = [
      { x: -1e9, id: 'pedal', actions: ['pedal'], text: 'Hold to pedal' },
      { x: blkA + 12, id: 'hop', actions: ['hop'], text: 'Pothole. You know what to do.' },
      { x: blkB + 22, id: 'car', actions: [], text: 'Parked robot car ahead. Ride the plank or hop it!' },
      { x: i2 - 30, id: 'cable', actions: ['brake'], text: 'Cable car! Brake, or beat it.' },
      { x: i2 + 8, id: 'air', actions: ['hop', 'leanBack', 'leanFwd'], text: 'Big lip. Hop, then land level.' },
    ];
    C.pedestrians = [{ x: lipA + 7, kind: 'dog' }, { x: blkC + 14, kind: 'tech' }, { x: blkD + 6, kind: 'fitness' }];
    return finishDrill(C, b, fin);
  }

  // Free-ride sandbox: every hazard in the game on one hill. Reaching the bottom starts the next lap at the top.
  function buildTestHill() {
    const C = drillCourse('testHill', { title: 'THE TEST HILL', hood: 'FREE RIDE', dialogue: 'free', par: 60, seed: 907, loop: true, customer: {
      route: 'An endless loop of everything',
      messages: ['Ride it as many times as you like. Nothing here is graded.', 'We built it on a weekend. Please do not tell the city.'],
      cargoNote: 'Cargo: whatever you brought.',
    } });
    const RISE = 0.22, TREAD = 0.75, STEPS = 7;
    const b = new CourseBuilder(-70, 0);
    b.straight(78); C.start = 4;
    b.ease(-0.08, 5);
    const blk1 = b.x; b.straight(44);                         // 8%: pothole field
    b.ease(0, 6);
    const i1 = b.x; b.straight(12);
    C.intersections.push({ x0: i1, x1: b.x, name: 'SANDBOX ST' });
    b.ease(0.08, 1.4); const lip1 = b.x; b.ease(-0.2, 1.1);
    C.lips.push({ x: lip1, big: false });
    C.crosswalks.push({ x0: lip1 - 1.4, x1: lip1 });
    const blk2 = b.x; b.straight(64);                         // 20%: the plank car
    b.ease(0, 7);
    const i2 = b.x; b.straight(13);
    C.intersections.push({ x0: i2, x1: b.x, name: 'KICKER ST' });
    b.ease(0.28, 1.9).straight(1.3); const lip2 = b.x; b.ease(-0.36, 1.0); // the biggest kicker in town
    C.lips.push({ x: lip2, big: true });
    C.crosswalks.push({ x0: lip2 - 3.2, x1: lip2 });
    const blk3 = b.x; b.straight(56);                         // 36%
    b.ease(-0.12, 8);
    const blk4 = b.x; b.straight(26);                         // 12%: speed bumps
    b.ease(-RISE / TREAD, 3);
    const st = b.x + 1.5; b.straight(1.5 + STEPS * TREAD + 3);
    b.ease(0, 6);
    const i3 = b.x; b.straight(14);
    C.intersections.push({ x0: i3, x1: b.x, name: 'CABLE ST' });
    b.ease(-0.04, 4);
    const blk5 = b.x; b.straight(40);                         // 4%: the construction ramp
    b.ease(0, 5);
    const fin = b.x; b.straight(140);
    b.pothole(blk1 + 14, 0.9, 0.18).pothole(blk1 + 24, 1.3, 0.2).pothole(blk1 + 34, 1.8, 0.26);
    b.bump(blk4 + 8, 0.9, 0.07).bump(blk4 + 12, 0.9, 0.07);
    b.stairs(st, STEPS, TREAD, RISE);
    C.stairs = [{ x0: st, x1: st + STEPS * TREAD, n: STEPS, tread: TREAD, rise: RISE }];
    C.cars = [{ x: blk2 + 36, plank: true }];
    C.crossers = [{ kind: 'cablecar', x: i3 + 7, trigger: i3 - 34, lead: 3.2, sign: 'TEST HILL LINE' }];
    const rampX = blk5 + 22;
    C.ramps = [{ x: rampX }];
    C.cones = [blk5 + 8, blk5 + 9.3];
    C.powerups = [{ kind: 'espresso', x: blk1 + 4 }, { kind: 'bubble', x: blk2 + 22 }];
    C.checkpoints = [C.start, i1 + 2, blk2 + 16, i2 + 2, blk3 + 24, st + STEPS * TREAD + 4, i3 + 12, blk5 + 30].map((x) => ({ x }));
    C.pedestrians = [{ x: blk1 + 6, kind: 'tourist' }, { x: blk2 + 10, kind: 'dog' }, { x: blk3 + 30, kind: 'tech' }, { x: blk5 + 4, kind: 'fitness' }];
    return finishDrill(C, b, fin);
  }

