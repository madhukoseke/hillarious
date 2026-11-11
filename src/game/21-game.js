  /* ---------- 21. GAME (state machine + loop) ---------- */
  // The Daily Dispatch share card (F-36): verdict, stars, tip, date, and the segment grid, on a 1200×630 canvas.
  function drawShareCard(cv, spec, res) {
    const ctx = cv.getContext('2d'), W = cv.width, H = cv.height, remix = DAILY_REMIXES.find((x) => x.id === spec.remix);
    const rv = reviewFor(reviewsFor(spec.cargo), res.condition), words = cargoWords(spec.cargo);
    ctx.fillStyle = COL.cream; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = COL.coral; ctx.fillRect(0, 0, W, 120);
    ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
    ctx.fillStyle = COL.cream; ctx.font = '900 64px ' + FONT_DISPLAY; ctx.fillText('HILLARIOUS #' + spec.number, 60, 62);
    ctx.textAlign = 'right'; ctx.font = '800 26px ' + FONT_MONO; ctx.fillText('DAILY DISPATCH · ' + spec.date, W - 60, 48);
    ctx.fillText(remix.name.toUpperCase() + ' · ' + words.name, W - 60, 84);
    const av = document.createElement('canvas'); av.width = av.height = 128; drawAvatar(av, res.stars, 'founder');
    ctx.drawImage(av, 60, 165, 150, 150);
    ctx.textAlign = 'left'; ctx.fillStyle = COL.mustard; ctx.font = '900 58px ' + FONT_BODY;
    ctx.fillText('★'.repeat(res.stars), 240, 205); ctx.fillStyle = '#d8d1c4'; ctx.fillText('★'.repeat(5 - res.stars), 240 + ctx.measureText('★'.repeat(res.stars)).width, 205);
    ctx.fillStyle = COL.ink; ctx.font = 'italic 800 36px ' + FONT_BODY;
    let line = '', y = 275; const maxW = W - 300;
    for (const word of ('“' + rv.text + '”').split(' ')) { const t = line ? line + ' ' + word : word; if (ctx.measureText(t).width > maxW && line) { ctx.fillText(line, 240, y); y += 44; line = word; } else line = t; }
    ctx.fillText(line, 240, y);
    const stats = [['TIP', fmtMoney(res.tip)], [words.short.toUpperCase(), Math.round(res.condition) + '%'], ['TIME', fmtTime(res.time)], ['CRASHES', String(res.crashes)]];
    stats.forEach(([k, v], i) => {
      const x = 60 + i * 280;
      ctx.fillStyle = COL.ink; ctx.font = '800 22px ' + FONT_MONO; ctx.fillText(k, x, 420);
      ctx.fillStyle = i === 0 ? '#2f7d4a' : COL.ink; ctx.font = '900 56px ' + FONT_DISPLAY; ctx.fillText(v, x, 468);
    });
    if (res.grid) { ctx.font = '48px ' + FONT_BODY; ctx.fillText(res.grid, 60, 548); }
    ctx.fillStyle = COL.teal; ctx.fillRect(0, H - 50, W, 50);
    ctx.fillStyle = COL.cream; ctx.font = '800 24px ' + FONT_MONO; ctx.textAlign = 'center';
    ctx.fillText(GAME_URL.replace(/^https:\/\//, '') + ' · same route for everyone today', W / 2, H - 25);
  }
  class Game {
    constructor() {
      this.params = new URLSearchParams(root.location ? root.location.search : '');
      this.debug = this.params.has('debug');
      const ap = this.params.get('autopilot');
      this.autopilotName = ap === null ? null : AUTOPILOT_PROFILES[ap] ? ap : 'typical';
      this.chapter = CHAPTERS.find((c) => c.id === this.params.get('chapter')) || CHAPTERS[0];
      this.shiftRoutes = chapterRoutes(this.chapter);
      this.startIndex = clamp((Number(this.params.get('delivery')) || 1) - 1, 0, this.shiftRoutes.length - 1); // ?delivery=2 jumps straight to the cake, ?delivery=3 to the bouquet
      this.unlockAll = this.params.get('unlock') === 'all';
      this.replayPref = this.params.get('replay'); // ?replay=off turns crash replays off; ?replay=on keeps them in autopilot demos          // ?unlock=all opens every order and drill (tests, demos)
      this.reducedMotion = !!(root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches);
      this.store = new Store();
      this.progress = migrateProgress(this.store.get('progress', null), Object.fromEntries(ROUTES.map((r) => [r.id, cleanBest(this.store.get('best:' + r.id, null))])));
      const fc = plainObject(this.store.get('free', null)); // last Free Ride setup, read field by field
      this.freeCfg = { route: typeof fc.route === 'string' ? fc.route : 'testHill', cp: Math.max(0, Number(fc.cp) | 0), cargo: cleanCargo(fc.cargo),
        unbreakable: !!fc.unbreakable, traffic: fc.traffic !== false, slowmo: !!fc.slowmo, overlay: !!fc.overlay };
      this.mode = 'shift'; this.run = null; this.practiceScale = 1; this.freeStats = { bestAir: 0, totalAir: 0 }; this.courseCache = {};
      this.R = new Renderer(document.getElementById('cv'));
      this.audio = new AudioManager(this.store);
      this.input = new InputManager();
      this.input.onDevice = () => this.refreshControls();
      this.particles = new Particles(360);
      this.cam = new Camera();
      this.humor = new HumorEngine(DIALOGUE);
      this.scarf = new Scarf(9, 0.085);
      this.scarfLocal = { n: 9, x: new Float32Array(9), y: new Float32Array(9) };
      this.anchor = { x: 0, y: 0 };
      this.time = 0; this.frameDt = 1 / 60; this.acc = 0; this.alpha = 0; this.timeScale = 1; this.slowT = 0;
      this.windX = -2; this.bellT = 0; this.fps = 60; this.fpsAcc = 0; this.fpsN = 0; this.errors = 0;
      this.crashOrder = []; this.lastCrankHalf = 0; this.deliveredT = 0; this.introT = 0; this.reviewT = 0;
      this.deliveryIndex = 0; this.results = []; this.timers = []; this.greeted = new Set();
      this.resetFx();
      this.titleWorld = new World(buildTitleCourse());
      this.world = null;
      this.state = 'title';
      this.screens = {};
      for (const id of ['title', 'howto', 'board', 'train', 'free', 'intro', 'pause', 'review', 'final']) this.screens[id] = document.getElementById('s-' + id);
      document.getElementById('ui').addEventListener('click', (e) => {
        const btn = e.target.closest('[data-act]');
        if (!btn || btn.disabled) return;
        this.audio.unlock(); this.audio.play('ui'); this.action(btn.dataset.act, btn.dataset);
      });
      document.getElementById('ui').addEventListener('input', (e) => {
        const r = e.target.closest('[data-vol]');
        if (!r) return;
        this.audio.unlock();
        if (this.audio.muted && Number(r.value) > 0) this.toggleMute(); // a slider you can hear beats a silent one
        this.audio.setVolume(r.dataset.vol, Number(r.value) / 100);
        this.syncVolume();
      });
      document.getElementById('hs-form').addEventListener('submit', (e) => { this.audio.unlock(); this.submitShift(e); });
      const unlock = () => this.audio.unlock();
      root.addEventListener('pointerdown', unlock); root.addEventListener('keydown', unlock);
      root.addEventListener('resize', () => this.R.resize());
      root.addEventListener('blur', () => { this.input.clear(); if (this.state === 'riding') this.pause(); });
      document.addEventListener('visibilitychange', () => { if (document.hidden && this.state === 'riding') this.pause(); });
      this.refreshControls(); this.show('title'); this.refreshBest(); this.audio.setMusic('title'); this.syncMute(); this.syncVolume();
      this.last = performance.now();
      requestAnimationFrame((t) => this.frame(t));
      if (this.autopilotName) setTimeout(() => this.startDelivery(this.startIndex), 250);
    }
    resetFx() { this.fx = { caption: null, sub: null, hint: null, bubble: null, text: null, pops: [], flash: 0, stamp: -1, toast: null }; }
    show(id, focusEl) {
      for (const k in this.screens) this.screens[k].classList.toggle('on', k === id);
      this.shown = id || null;
      this.input.showTouch(!id);
      if (id) {
        const p = focusEl || this.screens[id].querySelector('[data-autofocus]:not(:disabled)') || this.screens[id].querySelector('.btn.primary:not(:disabled)');
        if (p) setTimeout(() => p.focus({ preventScroll: true }), 30);
      } else if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    }
    // Arrow keys and the d-pad step focus through the open menu's buttons; A / Enter press the focused one.
    // Sliders and text fields are left to Tab: once focused they keep the arrow keys for themselves.
    menuFocus(dir) {
      const scr = this.shown && this.screens[this.shown];
      if (!scr) return;
      const els = Array.from(scr.querySelectorAll('button, a[href], input[type="range"]')).filter((e) => !e.disabled && e.offsetParent !== null);
      if (!els.length) return;
      const i = els.indexOf(document.activeElement);
      els[i < 0 ? 0 : (i + dir + els.length) % els.length].focus();
    }
    // Gamepad left / right on a focused slider: one step, through the same input event a mouse drag sends.
    nudgeSlider(r, dir) {
      const step = Number(r.step) || 1, v = clamp(Number(r.value) + dir * step, Number(r.min) || 0, Number(r.max) || 100);
      if (v === Number(r.value)) return;
      r.value = String(v);
      r.dispatchEvent(new Event('input', { bubbles: true }));
    }
    focusedButton() {
      const el = document.activeElement, scr = this.shown && this.screens[this.shown];
      return scr && el && el.tagName === 'BUTTON' && !el.disabled && scr.contains(el) ? el : null;
    }
    // The countdown badge only shows when a screen advances on its own (autopilot demos).
    showCount(el, t) { el.hidden = t === null; if (t !== null) el.textContent = String(Math.ceil(t)); }
    toggleMute() { const m = this.audio.toggleMute(); this.syncMute(); this.fx.toast = { text: m ? 'Sound off' : 'Sound on', t: 0 }; return m; }
    syncMute() {
      const m = this.audio.muted;
      for (const [id, txt] of [['title-mute', m ? 'Sound: off' : 'Sound: on'], ['pause-mute', m ? 'SOUND: OFF' : 'SOUND: ON']]) {
        const el = document.getElementById(id);
        if (el) { el.textContent = txt; el.setAttribute('aria-pressed', m ? 'true' : 'false'); }
      }
    }
    syncVolume() {
      for (const r of document.querySelectorAll('[data-vol]')) r.value = String(Math.round(this.audio.vol[r.dataset.vol] * 100));
    }
    // Rewrites every on-screen control label for the device the player used last.
    refreshControls() {
      const d = this.input.device, k = (acts) => controlKeys(acts, d), $ = (id) => document.getElementById(id);
      const el = (tag, text) => { const e = document.createElement(tag); e.textContent = text; return e; };
      const caps = (labels) => labels.map((l) => el('kbd', l));
      const strip = $('title-keys'); strip.textContent = '';
      for (const [acts, name] of [[['pedal'], 'pedal'], [['brake'], 'brake'], [['leanBack', 'leanFwd'], 'lean'], [['hop'], 'hop'], [['pause'], 'pause'], [['mute'], 'mute'], [['restart'], 'restart']]) {
        const labels = k(acts);
        if (labels.length) { const s = document.createElement('span'); s.append(...caps(labels), name); strip.appendChild(s); }
      }
      const sys = ['pause', 'mute', 'restart'].filter((a) => k([a]).length), sysName = { pause: 'Pause', mute: 'Mute', restart: 'Restart delivery' };
      const rows = $('howto-rows'); rows.textContent = '';
      for (const [acts, lead, text] of HOWTO_ROWS.concat([[sys, '', sys.map((a) => sysName[a]).join(' · ')]])) {
        const row = el('div', ''), keys = el('span', ''), desc = el('span', '');
        row.className = 'row';
        keys.append(...caps(k(acts).concat(d === 'keyboard' ? acts.flatMap((a) => KEY_ALTS[a] || []) : [])));
        if (lead) desc.append(el('b', lead), ' ');
        desc.append(text); row.append(keys, desc); rows.appendChild(row);
      }
      for (const c of document.querySelectorAll('[data-control]')) c.textContent = k([c.dataset.control]).join(' / ');
      $('howto-touch').hidden = d !== 'touch';
      const press = $('title-press'); press.textContent = '';
      if (d === 'touch') press.append('Tap ', el('b', 'START SHIFT')); else press.append('Press ', el('b', k(['hop'])[0]), ' to ride');
      $('pause-sound').textContent = d === 'touch' ? '' : (d === 'gamepad' ? 'Buttons: ' : 'Keys: ') + k(['pause']) + ' resume · ' + k(['restart']) + ' restart · ' + k(['mute']) + ' sound';
    }
    announce(text) {
      const el = document.getElementById('live');
      if (!el) return;
      el.textContent = '';
      setTimeout(() => { el.textContent = text; }, 40);
    }
    refreshBest() {
      const el = document.getElementById('title-best'), parts = [];
      fillScoreList(document.getElementById('title-board'), this.store.get(this.chapter.scoresKey, []));
      for (const R of ROUTES) {
        const best = cleanBest(this.store.get('best:' + R.id, null));
        if (best) parts.push(cargoWords(ROUTE_DATA[R.id].meta.cargo).short + ' ' + fmtMoney(best.tip) + ' (' + Math.round(best.condition) + '%)');
      }
      el.textContent = parts.join('  ·  ');
    }
    action(a, data) {
      const d = data || {};
      switch (a) {
        case 'start': this.results = []; this.startDelivery(this.startIndex); break;
        case 'howto': this.state = 'howto'; this.show('howto'); break;
        case 'back': this.state = 'title'; this.show('title'); this.refreshBest(); break;
        case 'board': this.showBoard(); break;
        case 'train': this.showTrain(); break;
        case 'free-setup': this.showFree(); break;
        case 'ride': this.startRun({ mode: 'single', route: d.route }); break;
        case 'drill': this.startRun({ mode: 'drill', drill: d.drill }); break;
        case 'next-drill': { const i = DRILLS.findIndex((D) => D.id === this.run.drill); this.startRun({ mode: 'drill', drill: DRILLS[i + 1].id }); break; }
        case 'free': this.freeCfg = Object.assign(this.freeCfg, { route: d.route, cp: 0, cargo: this.courseFor(d.route).cargo }); this.showFree(); break;
        case 'free-opt': this.setFreeOpt(d.key, d.val); break;
        case 'free-go': this.store.set('free', this.freeCfg); this.startRun(Object.assign({ mode: 'free' }, this.freeCfg)); break;
        case 'daily': this.startDailyRun(false); break;
        case 'daily-practice': this.startDailyRun(true); break;
        case 'daily-copy': this.copyDaily(); break;
        case 'clip': this.startClip(); break;
        case 'daily-card': this.saveDailyCard(); break;
        case 'practice': if (this.trouble) this.startRun(Object.assign({}, this.freeCfg, this.trouble, { mode: 'free' })); break;
        case 'go': this.beginRide(); break;
        case 'resume': this.resume(); break;
        case 'restart': case 'again': this.restartDelivery(); break;
        case 'next': this.nextDelivery(); break;
        case 'final': this.showFinal(); break;
        case 'skip-save': this.skipShift(); break;
        case 'mute': this.toggleMute(); break;
        case 'quit': case 'title': this.toTitle(); break;
        default: break;
      }
    }
    get lastDelivery() { return this.deliveryIndex + 1 >= this.shiftRoutes.length; }
    // A course to read on menus (checkpoints, titles, customers), built once per id.
    courseFor(id) {
      if (!this.courseCache[id]) { const R = ROUTES.find((r) => r.id === id); this.courseCache[id] = R ? R.build() : buildTestHill(); }
      return this.courseCache[id];
    }
    // The course a run rides: a fresh build, with Free Ride's cargo and traffic choices applied.
    runCourse(spec) {
      if (spec.mode === 'drill') return DRILLS.find((D) => D.id === spec.drill).build();
      if (spec.daily) return buildDaily(spec.daily); // the day's route, scored (mode 'daily') or practice (mode 'free')
      const R = ROUTES.find((r) => r.id === spec.route), C = R ? R.build() : buildTestHill();
      if (spec.mode === 'free') {
        if (spec.cargo) C.cargo = cleanCargo(spec.cargo);
        if (!spec.traffic) { C.crossers = []; C.hints = C.hints.filter((h) => h.id !== 'cable' && h.id !== 'ramp'); }
      }
      return C;
    }
    // The run to race (F-35): the day's scored ride on a Daily route, otherwise the fastest complete run on the route.
    // None when the run starts past the first checkpoint or loops.
    splitReference(spec, C) {
      if (C.loop || (spec.mode === 'free' && (spec.cp | 0) > 0)) return null;
      const n = C.checkpoints.length;
      if (spec.daily) { const rec = cleanSplits(this.store.get('splits:daily', null), n); return rec && rec.date === spec.daily ? rec.splits : null; }
      const rec = cleanSplits(this.store.get('splits:' + C.id, null), n);
      return rec ? rec.splits : null;
    }
    // A split as the bike passes a checkpoint or the finish: the time, and how far ahead or behind the reference run.
    showSplit(i, t) {
      const ref = this.splitRef, n = this.world.course.checkpoints.length, last = i === n - 1;
      const label = (last ? 'FINISH ' : 'SPLIT ' + (i + 1) + '/' + (n - 1) + ' ') + fmtTime(t);
      if (ref && ref[i] != null) { const d = t - ref[i]; this.pop(label + ' · ' + fmtDelta(d), d <= 0 ? 'good' : 'bad', 2.2); }
      else this.pop(label, 'info', 1.8);
    }
    newWorld(spec) {
      this.run = spec; this.mode = spec.mode;
      if (spec.mode === 'shift') this.deliveryIndex = this.shiftRoutes.findIndex((r) => r.id === spec.route);
      const C = this.runCourse(spec);
      this.world = new World(C, spec.mode === 'free' ? { startCp: spec.cp, unbreakable: spec.unbreakable } : null);
      this.R.ensureScenery(C);
      this.humor.reset({ delivery: C.dialogue || C.index, cargo: C.cargo });
      this.particles.clear(); this.resetFx(); this.timers = []; this.greeted = new Set();
      this.crashOrder = CRASH_LINES.slice();
      this.scarf.ok = false; this.acc = 0; this.slowT = 0; this.timeScale = 1; this.bellT = 0;
      this.replay = null; this.replaying = false; this.dailyStarted = false; this.crashLog = [];
      this.splitRef = this.splitReference(spec, C);
      this.practiceScale = spec.mode === 'free' && spec.slowmo ? 0.5 : 1;
      this.freeStats = { bestAir: 0, totalAir: 0 };
      this.autopilot = this.autopilotName ? new Autopilot(this.autopilotName) : null;
      const b = this.world.bike;
      this.cam.snap(b.x, b.y, 0); this.cam.zoom = 1; this.cam.trauma = 0;
      this.world.drain();
    }
    startDelivery(index) { this.startRun({ mode: 'shift', route: this.shiftRoutes[index].id }); }
    // Every ride starts here: { mode: 'shift' | 'single' | 'drill' | 'free', route | drill, and Free Ride's options }.
    startRun(spec) {
      this.newWorld(spec);
      if (spec.mode === 'free') { this.beginRide(); this.fx.hint = { text: (spec.daily ? "Practice on today's route: " : 'Free ride: ') + 'nothing is saved. Pause to quit.', keys: controlKeys(['pause'], this.input.device), id: 'free', t: 0 }; return; }
      const C = this.world.course, cu = C.customer, $ = (id) => document.getElementById(id);
      this.state = 'intro'; this.introT = this.autopilotName ? 1.2 : null; // players advance themselves; autopilot demos keep a timer
      const n = DRILLS.findIndex((D) => D.id === spec.drill) + 1;
      const eyebrow = spec.mode === 'daily' ? 'DAILY DISPATCH · ' + C.hood + ' · ONE SCORED RIDE' : spec.mode === 'drill' ? 'COURIER ACADEMY · DRILL ' + n + ' OF ' + DRILLS.length : spec.mode === 'single' ? 'SINGLE ORDER · ' + C.hood : 'DELIVERY ' + (this.deliveryIndex + 1) + ' OF ' + this.shiftRoutes.length + ' · ' + C.hood;
      $('intro-eyebrow').textContent = eyebrow;
      $('intro-h').textContent = C.title;
      $('intro-route').textContent = cu.route;
      $('intro-name').textContent = cu.name; $('intro-role').textContent = cu.role;
      const box = $('intro-msgs'); box.textContent = '';
      for (const m of cu.messages) { const el = document.createElement('p'); el.className = 'msg'; el.textContent = m; box.appendChild(el); }
      $('intro-cargo').textContent = spec.mode === 'drill' ? 'To pass: ' + DRILLS[n - 1].tiers[0].text + '.' : cu.cargoNote;
      $('intro-go').textContent = spec.mode === 'drill' ? 'START DRILL' : 'START DELIVERY';
      drawAvatar($('intro-avatar'), 4, cu.avatar);
      this.showCount($('intro-count'), this.introT);
      this.show('intro'); this.audio.setMusic('title');
      this.announce(eyebrow + ': ' + C.title + '. ' + cu.messages.join(' '));
    }
    // Daily Dispatch (F-34). ?daily=YYYY-MM-DD plays another day (tests, demos); otherwise it is the local date.
    todayKey() { const p = this.params.get('daily'); return validDateKey(p) ? p : dateKey(new Date()); }
    dailyOpen() { return this.unlockAll || !!this.progress.delivered[ROUTES[0].id]; }
    dailyRecord(key) { const rec = cleanDaily(this.store.get('daily', null)); return rec && rec.date === key ? rec : null; }
    // The scored ride if today's is unused, practice otherwise (or when asked for).
    startDailyRun(practice) {
      if (!this.dailyOpen()) return;
      const key = this.todayKey();
      if (practice || this.dailyRecord(key)) this.startRun({ mode: 'free', daily: key, traffic: true });
      else this.startRun({ mode: 'daily', daily: key });
    }
    // Today's share text (F-36), from the saved record, so it also works from the Dispatch board.
    dailyShare() {
      const key = this.todayKey(), rec = this.dailyRecord(key);
      return rec && rec.result ? { spec: dailySpec(key), res: rec.result, text: dailyShareText(dailySpec(key), rec.result) } : null;
    }
    shareStatus(msg) {
      const el = document.getElementById(this.state === 'review' ? 'rv-share-status' : 'board-note');
      if (el) el.textContent = msg;
      this.announce(msg);
    }
    // Copies the share text: the clipboard API where allowed, else a hidden text box and the copy command.
    copyDaily() {
      const sh = this.dailyShare();
      if (!sh) return;
      const done = () => this.shareStatus('Copied! Paste it anywhere.');
      const fallback = () => {
        const ta = document.createElement('textarea');
        ta.value = sh.text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
        document.body.appendChild(ta); ta.select();
        let ok = false; try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
        ta.remove();
        if (ok) done(); else this.shareStatus('Copy blocked by the browser. Your result: ' + sh.text.split('\n')[0]);
      };
      if (root.navigator && navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(sh.text).then(done, fallback);
      else fallback();
    }
    // A 1200×630 PNG of today's review, shared through the phone's share sheet or saved as a file. Nothing is uploaded.
    saveDailyCard() {
      const sh = this.dailyShare();
      if (!sh) return;
      const cv = document.createElement('canvas');
      cv.width = 1200; cv.height = 630;
      drawShareCard(cv, sh.spec, sh.res);
      this.lastCard = cv; // tests read it
      cv.toBlob((blob) => {
        if (!blob) { this.shareStatus('Could not draw the card in this browser.'); return; }
        const name = 'hillarious-' + sh.spec.number + '.png', file = root.File ? new File([blob], name, { type: 'image/png' }) : null;
        if (file && this.input.touchMode && navigator.canShare && navigator.canShare({ files: [file] })) {
          navigator.share({ files: [file], text: sh.text }).then(() => this.shareStatus('Shared.'), () => this.shareStatus('Not shared.'));
          return;
        }
        const a = document.createElement('a'), url = URL.createObjectURL(blob);
        a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 4000);
        this.shareStatus('Saved ' + name + '.');
      }, 'image/png');
    }
    beginRide() {
      if (this.mode === 'daily' && !this.dailyStarted) { // the attempt is used from here: quitting or restarting won't give another
        const res = startDaily(this.store.get('daily', null), this.store.get('streak', null), dailySpec(this.run.daily));
        if (!res.scored) { this.startRun({ mode: 'free', daily: this.run.daily, traffic: true }); return; }
        this.store.set('daily', res.rec); this.store.set('streak', res.streak); this.dailyStarted = true;
      }
      this.state = 'riding'; this.show(null); this.input.clear(); this.last = performance.now(); this.audio.setMusic('ride'); }
    restartDelivery() {
      if (this.mode === 'daily') this.run = { mode: 'free', daily: this.run.daily, traffic: true }; // a restart is practice
      this.newWorld(this.run); this.beginRide(); this.fx.flash = 0.7; }
    nextDelivery() { if (!this.lastDelivery) this.startDelivery(this.deliveryIndex + 1); else this.toTitle(); }
    // Menus ride over the title scene, so the delivery world goes away.
    toMenu(state) { this.state = state; this.world = null; this.audio.update(null, false); this.audio.setMusic('title'); }
    toTitle() { this.toMenu('title'); this.show('title'); this.refreshBest(); }
    saveProgress(p) { this.progress = p; this.store.set('progress', p); }
    starsHtml(el, n, of, label) { // ★ markup only; the label goes in aria-label
      el.innerHTML = '★'.repeat(n) + '<span class="off">' + '★'.repeat(Math.max(0, of - n)) + '</span>';
      el.setAttribute('aria-label', label);
    }
    // Dispatch: one card per order, locked until the order before it has been delivered.
    // Today's Daily Dispatch card, first on the board. Returns its button to focus when today's ride is still open.
    dailyCard(box, mk) {
      const key = this.todayKey(), spec = dailySpec(key), C = buildDaily(key), open = this.dailyOpen(), rec = this.dailyRecord(key);
      const st = cleanStreak(this.store.get('streak', null)), streak = st.last && dayIndex(key) - dayIndex(st.last) <= 1 ? st.count : 0;
      const remix = DAILY_REMIXES.find((x) => x.id === spec.remix), cargo = cargoWords(C.cargo).name;
      const card = mk('div', 'order daily'), av = mk('canvas'), top = mk('div', 'order-top'), side = mk('div', 'order-side');
      card.dataset.state = !open ? 'locked' : rec ? 'delivered' : 'new';
      av.width = av.height = 104; av.setAttribute('aria-hidden', 'true'); drawAvatar(av, open ? 4 : 3, C.customer.avatar);
      top.append(mk('b', '', C.title), mk('span', 'order-streak', streak ? '🔥 ' + streak + (streak === 1 ? ' day' : ' days') : ''));
      const sub = mk('div', 'order-sub', 'DAILY DISPATCH · ' + remix.name.toUpperCase() + ' · ' + cargo + ' · PAR ' + fmtTime(C.par).replace(/\.0$/, ''));
      const res = rec && rec.result;
      const line = !open ? 'Deliver ' + this.courseFor(ROUTES[0].id).title + ' to unlock'
        : res ? "Today's ride: " + fmtMoney(res.tip) + ' · ' + fmtTime(res.time) + ' · ' + Math.round(res.condition) + '% ' + cargo.toLowerCase() + '. New route tomorrow.'
        : rec ? "Today's ride didn't finish. Practice is open; new route tomorrow." : 'Same route for everyone today. One scored ride. ' + remix.note;
      const tag = mk('span', 'order-tag', !open ? 'LOCKED' : rec ? 'DONE TODAY' : 'TODAY');
      const ride = mk('button', 'btn' + (open && !rec ? ' primary' : ''), !open ? '🔒 LOCKED' : rec ? 'PRACTICE' : 'RIDE');
      ride.dataset.act = rec ? 'daily-practice' : 'daily'; ride.disabled = !open;
      ride.setAttribute('aria-label', !open ? 'Daily Dispatch, locked. ' + line : (rec ? 'Practice ' : 'Ride ') + C.title + ', ' + remix.name + '. ' + line);
      side.append(tag, ride);
      if (res) { const sh = mk('button', 'chip', 'SHARE'); sh.dataset.act = 'daily-copy'; sh.setAttribute('aria-label', "Copy today's result to share"); side.append(sh); }
      if (open && !rec) { const pr = mk('button', 'chip', 'PRACTICE'); pr.dataset.act = 'daily-practice'; pr.setAttribute('aria-label', 'Practice ' + C.title + ', unscored'); side.append(pr); }
      card.append(av, top, side, sub, mk('div', 'order-best', line));
      box.appendChild(card);
      return open && !rec ? ride : null;
    }
    showBoard() {
      this.toMenu('board');
      const box = document.getElementById('board-orders'), states = unlockState(ROUTES, this.progress, this.unlockAll), mk = (tag, cls, text) => {
        const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e;
      };
      box.textContent = '';
      let first = this.dailyCard(box, mk);
      states.forEach((s, i) => {
        const C = this.courseFor(s.id), cu = C.customer, best = cleanBest(this.store.get('best:' + s.id, null)), goals = this.progress.goals[s.id] || [];
        const card = mk('div', 'order'), av = mk('canvas'), top = mk('div', 'order-top'), side = mk('div', 'order-side');
        card.dataset.state = s.state; av.width = av.height = 104; av.setAttribute('aria-hidden', 'true');
        drawAvatar(av, s.state === 'locked' ? 3 : 4, cu.avatar);
        top.append(mk('b', '', C.title));
        const stars = mk('span', 'order-stars'), met = goals.filter(Boolean).length;
        this.starsHtml(stars, met, 3, met + ' of 3 goals'); top.append(stars);
        const cargo = cargoWords(C.cargo).name;
        const sub = mk('div', 'order-sub', C.hood + ' · ' + cargo + ' · PAR ' + fmtTime(C.par).replace(/\.0$/, ''));
        const req = s.requires && ROUTES.find((r) => r.id === s.requires);
        const line = s.state === 'locked' ? 'Deliver ' + this.courseFor(req.id).title + ' to unlock'
          : best ? 'Best ' + fmtMoney(best.tip) + ' · ' + fmtTime(best.time) + ' · ' + Math.round(best.condition) + '% ' + cargo.toLowerCase() : cu.name + ' is waiting. ' + (i === 0 ? 'Start here.' : 'New order!');
        const tag = mk('span', 'order-tag', { locked: 'LOCKED', new: 'NEW ORDER', delivered: 'DELIVERED', mastered: 'EMPLOYEE OF THE MONTH' }[s.state]);
        const ride = mk('button', 'btn' + (s.state === 'new' ? ' primary' : ''), s.state === 'locked' ? '🔒 LOCKED' : 'RIDE');
        ride.dataset.act = 'ride'; ride.dataset.route = s.id; ride.disabled = s.state === 'locked';
        ride.setAttribute('aria-label', s.state === 'locked' ? C.title + ', locked. ' + line : 'Ride ' + C.title + '. ' + line);
        const free = mk('button', 'chip', 'FREE RIDE');
        free.dataset.act = 'free'; free.dataset.route = s.id; free.disabled = s.state === 'locked';
        free.setAttribute('aria-label', 'Free ride on ' + C.title);
        side.append(tag, ride, free);
        card.append(av, top, side, sub, mk('div', 'order-best', line));
        box.appendChild(card);
        if (!first && !ride.disabled && (s.state === 'new' || i === states.length - 1)) first = ride;
      });
      for (const soon of COMING_SOON) {
        const card = mk('div', 'order soon'), av = mk('canvas'), top = mk('div', 'order-top'), side = mk('div', 'order-side');
        av.width = av.height = 104; av.setAttribute('aria-hidden', 'true'); drawAvatar(av, 3, 'founder');
        top.append(mk('b', '', soon.title)); side.append(mk('span', 'order-tag', 'COMING SOON'));
        card.append(av, top, side, mk('div', 'order-sub', soon.hood), mk('div', 'order-best', soon.note));
        box.appendChild(card);
      }
      this.show('board', first || box.querySelector('button:not(:disabled)'));
    }
    // Training: the six drills (each opens once the one before it is passed), plus the way into Free Ride.
    showTrain() {
      this.toMenu('train');
      const box = document.getElementById('train-drills'), states = drillStates(DRILLS, this.progress, this.unlockAll);
      box.textContent = '';
      let first = null;
      states.forEach((s, i) => {
        const D = DRILLS[i], row = document.createElement('div'), num = document.createElement('div'), name = document.createElement('b');
        const info = document.createElement('span'), btn = document.createElement('button');
        row.className = 'drill'; row.dataset.state = s.state;
        num.className = 'num'; num.textContent = String(i + 1);
        name.textContent = D.title;
        if (s.stamp > 0) { const st = document.createElement('i'); st.className = 'stamp'; st.textContent = STAMPS[s.stamp]; name.append(st); }
        info.textContent = s.state === 'locked' ? 'Pass ' + DRILLS[i - 1].title + ' to unlock' : D.teaches;
        btn.className = 'btn' + (s.state === 'open' ? ' primary' : '');
        btn.textContent = s.state === 'locked' ? '🔒' : s.state === 'passed' ? 'AGAIN' : 'START';
        btn.dataset.act = 'drill'; btn.dataset.drill = D.id; btn.disabled = s.state === 'locked';
        btn.setAttribute('aria-label', D.title + (s.state === 'locked' ? ', locked' : s.stamp ? ', stamp ' + STAMPS[s.stamp] : '') + '. ' + info.textContent);
        row.append(num, name, btn, info);
        box.appendChild(row);
        if (!first && s.state === 'open') first = btn;
      });
      document.getElementById('train-cert').hidden = !((this.progress.drills.drillExam || 0) > 0);
      this.show('train', first);
    }
    // Free Ride setup: where to start, what to carry, and the practice options. Chips act like radio buttons and toggles.
    showFree(focusKey) {
      this.toMenu('free');
      const cfg = this.freeCfg, routes = unlockState(ROUTES, this.progress, this.unlockAll);
      if (cfg.route !== 'testHill' && !routes.some((s) => s.id === cfg.route && s.state !== 'locked')) cfg.route = 'testHill';
      const C = this.courseFor(cfg.route);
      if (!(cfg.cp >= 0 && cfg.cp < C.checkpoints.length)) cfg.cp = 0;
      const box = document.getElementById('free-opts'); box.textContent = '';
      let focus = null;
      const row = (label, chips) => {
        const r = document.createElement('div'), l = document.createElement('span'), list = document.createElement('div');
        r.className = 'opt-row'; l.textContent = label; list.setAttribute('role', 'group'); list.setAttribute('aria-label', label);
        for (const [key, val, text, on, disabled] of chips) {
          const b = document.createElement('button');
          b.className = 'chip'; b.textContent = text; b.dataset.act = 'free-opt'; b.dataset.key = key; b.dataset.val = String(val);
          b.setAttribute('aria-pressed', on ? 'true' : 'false'); b.disabled = !!disabled;
          if (focusKey && focusKey === key + ':' + val) focus = b;
          list.appendChild(b);
        }
        r.append(l, list); box.appendChild(r);
      };
      row('Hill', [['route', 'testHill', 'THE TEST HILL', cfg.route === 'testHill']].concat(routes.map((s) => ['route', s.id, this.courseFor(s.id).title, cfg.route === s.id, s.state === 'locked'])));
      row('Start at', C.checkpoints.map((cp, i) => ['cp', i, cpLabel(C, i), cfg.cp === i]));
      row('Cargo', Object.keys(CARGO_TYPES).map((k) => ['cargo', k, cargoWords(k).name, cfg.cargo === k]));
      row('Options', [['unbreakable', 1, 'UNBREAKABLE CARGO', cfg.unbreakable], ['traffic', 1, 'TRAFFIC', cfg.traffic], ['slowmo', 1, 'SLOW-MO 0.5×', cfg.slowmo], ['overlay', 1, 'PHYSICS OVERLAY', cfg.overlay]]);
      this.show('free', focus);
    }
    setFreeOpt(key, val) {
      const cfg = this.freeCfg;
      if (key === 'route') { cfg.route = val; cfg.cp = 0; cfg.cargo = this.courseFor(val).cargo; }
      else if (key === 'cp') cfg.cp = Number(val) | 0;
      else if (key === 'cargo') cfg.cargo = cleanCargo(val);
      else if (key in cfg) cfg[key] = !cfg[key];
      this.showFree(key + ':' + val);
    }
    pause() {
      if (this.state !== 'riding') return;
      this.state = 'paused'; this.audio.update(null, false); this.audio.setMusic(null);
      document.getElementById('pause-line').textContent = this.mode === 'drill' ? 'Pat from HR is timing this pause.' : cargoView(this.world.cargo.kind).pauseLine;
      document.getElementById('pause-restart').textContent = { drill: 'RESTART DRILL', free: 'RESTART RIDE' }[this.mode] || 'RESTART DELIVERY';
      this.syncMute();
      this.show('pause');
    }
    resume() { if (this.state !== 'paused') return; this.state = 'riding'; this.show(null); this.input.clear(); this.audio.setMusic('ride'); }
    // The receipt, for every kind of run. Saves only what writesFor(mode) allows, then shows unlocks, goals and the trouble spot.
    showReview() {
      if (this.state === 'review' || !this.world) return;
      this.state = 'review'; this.audio.update(null, false); this.audio.setMusic(null);
      const W = this.world, C = W.course, cu = C.customer, r = W.result(), $ = (id) => document.getElementById(id);
      const mode = this.mode, w = writesFor(mode), drill = mode === 'drill' ? DRILLS.find((D) => D.id === C.id) : null;
      const rv = reviewFor(reviewsFor(r.kind), r.condition);
      if (mode === 'shift') this.results[this.deliveryIndex] = r;
      const routesBefore = unlockState(ROUTES, this.progress, this.unlockAll), drillsBefore = drillStates(DRILLS, this.progress, this.unlockAll);
      const goals = w.delivered ? routeGoals(C.id, r) : [], oldGoals = (this.progress.goals[C.id] || []).slice();
      const stamp = drill ? drillStamp(drill, r) : 0, oldStamp = drill ? this.progress.drills[C.id] || 0 : 0;
      if (w.delivered || w.drill) this.saveProgress(applyRun(this.progress, mode, C.id, { goals, stamp }));
      const routesAfter = unlockState(ROUTES, this.progress, this.unlockAll), drillsAfter = drillStates(DRILLS, this.progress, this.unlockAll);
      $('rv-brand').textContent = cu.brand;
      $('rv-order').textContent = mode === 'free' ? (this.run.daily ? 'PRACTICE · ' : 'FREE RIDE · ') + 'NOTHING SAVED' : mode === 'daily' ? cu.order + ' · SCORED' : cu.order;
      $('rv-name').textContent = cu.name + ' · ' + cu.role.split(',')[0];
      if (drill) { this.starsHtml($('rv-stars'), stamp, 3, 'Stamp: ' + STAMPS[stamp]); $('rv-quote').textContent = PAT_VERDICTS[stamp]; }
      else { this.starsHtml($('rv-stars'), rv.stars, 5, rv.stars + ' out of 5 stars'); $('rv-quote').textContent = rv.text; }
      $('rv-cond-label').textContent = cargoWords(r.kind).condition;
      $('rv-cond').textContent = Math.round(r.condition) + '%' + cargoView(r.kind).condNote(r);
      $('rv-time-label').textContent = drill ? 'Drill time' : mode === 'free' ? 'Ride time' : 'Delivery time';
      $('rv-time').textContent = fmtTime(r.time);
      $('rv-near').textContent = String(r.nearMisses);
      $('rv-clean').textContent = String(r.cleanLandings);
      if (w.best) { // style best per route, saved like the best tip
        const key = 'style:' + C.id, rec = recordStyle(this.store.get(key, null), r.style);
        if (rec.isNew) this.store.set(key, rec.best);
        $('rv-style').textContent = r.style + (rec.isNew && rec.prev ? ' · NEW BEST' : rec.best && !rec.isNew ? ' · best ' + rec.best.style : '');
      } else $('rv-style').textContent = String(r.style);
      $('rv-crash').textContent = String(r.crashes);
      const items = $('rv-items'); items.textContent = '';
      const item = (label, value, cls) => {
        const row = document.createElement('div'), a = document.createElement('span'), b = document.createElement('span');
        a.textContent = label; b.textContent = value; row.className = cls; row.append(a, b); items.appendChild(row);
      };
      if (drill) drill.tiers.forEach((t, i) => item((i < stamp ? '✓ ' : '✗ ') + t.text, STAMPS[i + 1], i < stamp ? 'pos' : 'neg'));
      else if (mode !== 'free') for (const it of r.tipItems) item(it.label, (it.amount < 0 ? '−' : '+') + fmtMoney(Math.abs(it.amount)), it.amount < 0 ? 'neg' : 'pos');
      $('rv-total-label').textContent = drill ? 'STAMP' : mode === 'free' ? 'PRACTICE' : 'TIP';
      $('rv-tip').textContent = drill ? STAMPS[stamp] : fmtMoney(mode === 'free' ? 0 : r.tip);
      drawAvatar($('rv-avatar'), drill ? [1, 3, 4, 5][stamp] : rv.stars, cu.avatar);
      const el = $('rv-best');
      el.classList.remove('new');
      if (drill) {
        el.textContent = stamp > oldStamp ? 'NEW BEST STAMP: ' + STAMPS[stamp] : 'Best stamp: ' + STAMPS[Math.max(stamp, oldStamp)];
        if (stamp > oldStamp) el.classList.add('new');
      } else if (w.daily) {
        const spec = dailySpec(this.run.daily), rec = finishDaily(this.store.get('daily', null), spec, r, rv.stars, segmentGrid(C.segments, r.log)), st = cleanStreak(this.store.get('streak', null));
        if (rec) this.store.set('daily', rec);
        el.textContent = (rec ? 'HILLARIOUS #' + spec.number + ' logged.' : 'Already logged today.') + ' Streak: ' + st.count + (st.count === 1 ? ' day' : ' days') + (st.best > st.count ? ' (best ' + st.best + ')' : '');
        if (rec) el.classList.add('new');
      } else if (!w.best) el.textContent = (this.run.daily ? "Practice on today's route: nothing saved." : 'Free ride: nothing saved.') + (this.freeStats.bestAir > 0 ? ' Best air ' + this.freeStats.bestAir.toFixed(2) + ' s.' : '');
      else {
        const key = 'best:' + C.id, best = cleanBest(this.store.get(key, null));
        const better = !best || r.tip > best.tip || (r.tip === best.tip && r.time < best.time);
        if (better) { this.store.set(key, { v: RECORD_VERSION, tip: r.tip, condition: r.condition, time: r.time }); el.textContent = best ? 'NEW PERSONAL BEST TIP!' : 'First delivery logged. HR is watching.'; el.classList.add('new'); }
        else el.textContent = 'Personal best: ' + fmtMoney(best.tip) + ' · ' + fmtTime(best.time);
      }
      // Split times (F-35): this run against the reference it raced; then keep the fastest complete run.
      const sbox = $('rv-splits'); sbox.textContent = '';
      if (r.splits && r.splits.some((t) => t != null)) {
        const deltas = splitDeltas(r.splits, this.splitRef), head = document.createElement('b');
        head.textContent = this.splitRef ? (this.run.daily && mode !== 'daily' ? 'VS SCORED RIDE' : 'VS BEST') : 'SPLITS'; sbox.appendChild(head);
        r.splits.forEach((t, i) => {
          if (t == null) return;
          const sp = document.createElement('span'), d = deltas[i];
          sp.textContent = (i === r.splits.length - 1 ? '🏁 ' : '') + fmtTime(t) + (d == null ? '' : ' ' + fmtDelta(d));
          if (d != null) sp.className = d <= 0 ? 'ahead' : 'behind';
          sbox.appendChild(sp);
        });
        if (w.best) { const rec = recordSplits(this.store.get('splits:' + C.id, null), r.splits); if (rec.isNew) this.store.set('splits:' + C.id, rec.best); }
        else if (mode === 'daily' && completeSplits(r.splits)) this.store.set('splits:daily', { v: RECORD_VERSION, date: this.run.daily, splits: r.splits.slice() });
      }
      $('rv-clip').hidden = !this.canSaveClip(); $('rv-clip-status').textContent = ''; // F-37: only after a crash, where recording works
      // Share card (F-36): only for the day's scored ride, once it is logged.
      const shareRec = mode === 'daily' ? this.dailyRecord(this.run.daily) : null, shareBox = $('rv-share');
      shareBox.hidden = !(shareRec && shareRec.result); $('rv-share-status').textContent = '';
      if (!shareBox.hidden) { const links = intentLinks(dailyShareText(dailySpec(this.run.daily), shareRec.result)); $('rv-share-x').href = links.x; $('rv-share-li').href = links.linkedin; }
      const gbox = $('rv-goals'); gbox.textContent = '';
      (w.delivered ? ROUTE_GOALS[C.id] || [] : []).forEach((g, i) => { // ★ per goal: met this run, met before, or not yet
        const row = document.createElement('div'), star = document.createElement('i'), txt = document.createElement('span');
        row.className = goals[i] ? 'met' : oldGoals[i] ? 'had' : 'miss';
        star.textContent = goals[i] || oldGoals[i] ? '★' : '☆'; txt.textContent = g.text;
        row.append(star, txt);
        if (goals[i] && !oldGoals[i]) { const b = document.createElement('b'); b.textContent = 'NEW'; row.append(b); }
        gbox.appendChild(row);
      });
      const news = newlyUnlocked(routesBefore, routesAfter).map((id) => 'NEW ORDER UNLOCKED: ' + this.courseFor(id).title)
        .concat(newlyUnlocked(drillsBefore, drillsAfter).map((id) => 'NEXT DRILL UNLOCKED: ' + DRILLS.find((D) => D.id === id).title));
      const ri = ROUTES.findIndex((x) => x.id === C.id);
      if (ri >= 0 && w.delivered && routesBefore[ri].state !== 'mastered' && routesAfter[ri].state === 'mastered') news.push('ALL 3 GOALS: EMPLOYEE OF THE MONTH');
      if (drill && drill.id === 'drillExam' && stamp > 0 && !oldStamp) news.push('CERTIFIED COURIER! HR HAS UPDATED YOUR FILE');
      $('rv-unlock').textContent = news.join(' · ');
      const ts = drill ? null : troubleSpot(C, r.log), tbox = $('rv-trouble');
      this.trouble = ts ? { route: C.id, daily: this.run.daily, cp: ts.cp, cargo: r.kind, traffic: true, unbreakable: false, slowmo: false } : null;
      tbox.hidden = !ts;
      if (ts) $('rv-trouble-text').textContent = 'Most trouble: ' + ts.label + ' · ' + (ts.crashes ? ts.crashes + (ts.crashes === 1 ? ' crash, ' : ' crashes, ') : '') + '−' + Math.round(ts.lost) + cargoWords(r.kind).unit;
      const next = $('rv-next'), again = $('rv-again'), alt = $('rv-alt');
      const set = (b, act, text) => { b.dataset.act = act; (b === next ? $('rv-next-label') : b).textContent = text; };
      if (mode === 'shift') { const last = this.lastDelivery; set(next, last ? 'final' : 'next', last ? 'PERFORMANCE REVIEW' : 'NEXT DELIVERY'); set(again, 'again', 'RIDE AGAIN'); set(alt, 'title', 'TITLE'); }
      else if (mode === 'daily' || this.run.daily) { set(next, 'board', 'DISPATCH'); set(again, 'daily-practice', 'PRACTICE'); set(alt, 'title', 'TITLE'); }
      else if (mode === 'single') { set(next, 'board', 'DISPATCH'); set(again, 'again', 'RIDE AGAIN'); set(alt, 'title', 'TITLE'); }
      else if (drill) {
        const di = DRILLS.indexOf(drill), open = di + 1 < DRILLS.length && drillsAfter[di + 1].state !== 'locked';
        set(next, open ? 'next-drill' : 'train', open ? 'NEXT DRILL' : 'TRAINING'); set(again, 'again', 'TRY AGAIN'); set(alt, open ? 'train' : 'title', open ? 'TRAINING' : 'TITLE');
      } else { set(next, 'again', 'RIDE AGAIN'); set(again, 'free-setup', 'SETUP'); set(alt, 'title', 'TITLE'); }
      $('rv-shift').textContent = '';
      this.reviewT = this.autopilotName ? 2.5 : null;
      this.announce(drill ? 'Drill result: ' + STAMPS[stamp] + '. ' + PAT_VERDICTS[stamp] + ' ' + news.join('. ')
        : (mode === 'free' ? 'Free ride complete. Nothing saved. ' : '') + rv.stars + ' stars from ' + cu.name + ': ' + rv.text + (mode === 'free' ? '' : ' Tip ' + fmtMoney(r.tip) + '. ') + news.join('. '));
      this.showCount($('rv-count'), this.reviewT);
      this.show('review');
      root.__HILL_LAST_RESULT__ = r; root.__HILL_RESULTS__ = this.results.slice();
    }
    showFinal() {
      if (this.state === 'final') return;
      this.state = 'final'; this.audio.update(null, false);
      const S = shiftSummary(this.results), $ = (id) => document.getElementById(id), rows = $('fr-rows');
      S.place = this.chapter.place; // for the share text
      const starStr = (n) => '★'.repeat(n) + '☆'.repeat(5 - n);
      const late = S.time - S.par, punct = late <= 0 ? 'On time' : late <= 15 ? 'Fashionably late' : 'Geologically slow';
      const grav = S.crashes === 0 ? 'Exemplary' : S.crashes <= 2 ? 'Negotiable' : 'Under review';
      const per = this.results.filter(Boolean).map((r) => cargoWords(r.kind).short + ' ' + Math.round(r.condition) + '%').join(' · ');
      const data = [
        ['Customer satisfaction', S.avgStars.toFixed(1) + ' / 5', S.stars.map(starStr).join('  ')],
        ['Cargo care', Math.round(S.avgCondition) + '%', per],
        ['Punctuality', fmtTime(S.time), punct],
        ['Gravity compliance', grav, S.crashes + (S.crashes === 1 ? ' crash' : ' crashes')],
        ['Style', String(S.style), S.cleanLandings + ' clean landings · ' + S.nearMisses + ' near misses · ' + S.bigAirs + ' big air'],
        ['Tips earned', fmtMoney(S.tips), S.deliveries + ' of ' + this.shiftRoutes.length + ' deliveries'],
      ];
      rows.textContent = '';
      for (const [label, value, note] of data) {
        const a = document.createElement('span'), b = document.createElement('b'), n = document.createElement('span');
        a.textContent = label; n.className = 'note'; n.textContent = note; a.appendChild(n); b.textContent = value; rows.append(a, b);
      }
      $('fr-v1').textContent = S.verdict.lines[0]; $('fr-v2').textContent = S.verdict.lines[1]; $('fr-stamp').textContent = S.verdict.stamp;
      $('fr-meta').textContent = 'Courier #0042 · ' + new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
      const share = shareLinks(S);
      $('share-x').href = share.x; $('share-li').href = share.linkedin;
      // Nothing is saved yet: the player types a name (and optional X / LinkedIn) to put the shift on the board.
      this.pendingShift = { tips: S.tips, time: S.time, stars: S.avgStars, date: new Date().toISOString().slice(0, 10) };
      const rank = recordShift(this.store.get(this.chapter.scoresKey, []), this.pendingShift).rank;
      const form = $('hs-form'), profile = this.store.get('profile', {}) || {};
      for (const el of form.querySelectorAll('input, button')) el.disabled = false;
      form.hidden = !rank;
      $('hs-name').value = profile.name || ''; $('hs-x').value = profile.x ? '@' + profile.x : ''; $('hs-li').value = profile.linkedin || '';
      $('hs-status').textContent = '';
      this.renderBoard(rank ? 'Top-' + TOP_SHIFTS + ' shift! Add your name to save it.' : 'Not a top-' + TOP_SHIFTS + ' shift. HR noticed.');
      this.audio.play(S.band === 'poor' ? 'trombone' : 'success');
      this.audio.setMusic('title');
      this.show('final');
      if (rank) setTimeout(() => $('hs-name').focus({ preventScroll: true }), 60);
      this.announce('Employee performance review. ' + S.verdict.lines.join(' ') + ' Tips earned ' + fmtMoney(S.tips) + '.');
      root.__HILL_FINAL__ = S;
    }
    // Shows the top shifts; the list is kept in localStorage, so it's per browser.
    renderBoard(headline) {
      const $ = (id) => document.getElementById(id), list = this.store.get(this.chapter.scoresKey, []), ol = $('hs-board');
      $('fr-best').textContent = headline;
      fillScoreList(ol, list);
    }
    submitShift(e) {
      e.preventDefault();
      if (!this.pendingShift) return;
      const $ = (id) => document.getElementById(id);
      const name = $('hs-name').value.trim().slice(0, 20), x = cleanHandle($('hs-x').value, 15), linkedin = cleanHandle($('hs-li').value, 60);
      if (!name) { $('hs-status').textContent = 'Type a name to save your shift.'; $('hs-name').focus(); return; }
      const rec = recordShift(this.store.get(this.chapter.scoresKey, []), { ...this.pendingShift, v: RECORD_VERSION, name, x, linkedin });
      this.store.set(this.chapter.scoresKey, rec.list);
      this.store.set('profile', { name, x, linkedin });
      this.pendingShift = null;
      this.lockShiftForm('Saved to the high scores.');
      this.renderBoard('Saved as ' + name + '. Ranked #' + rec.rank + ' of your best shifts.');
      this.announce('Saved to high scores as ' + name + ', rank ' + rec.rank + '.');
    }
    // Disables the form instead of hiding it: hiding moves PLAY AGAIN up under the pointer, so a second click would start a new shift.
    lockShiftForm(status) {
      for (const el of document.querySelectorAll('#hs-form input, #hs-form button')) el.disabled = true;
      document.getElementById('hs-status').textContent = status;
    }
    skipShift() {
      this.pendingShift = null;
      this.lockShiftForm('');
      this.renderBoard('Shift not saved to the high scores.');
    }
    handleKeys() {
      const NAV = { pedal: -1, navUp: -1, leanBack: -1, navLeft: -1, brake: 1, navDown: 1, leanFwd: 1, navRight: 1 };
      for (const a of this.input.takeActions()) {
        if (a === 'mute') { this.toggleMute(); continue; }
        if (this.state !== 'riding' && this.state !== 'delivered') { // menus: move focus, or press the focused button
          const slider = document.activeElement && document.activeElement.matches && document.activeElement.matches('input[type="range"]') ? document.activeElement : null;
          if (slider && (a === 'navLeft' || a === 'navRight' || a === 'leanBack' || a === 'leanFwd')) { this.nudgeSlider(slider, a === 'navRight' || a === 'leanFwd' ? 1 : -1); continue; }
          if (slider && (a === 'confirm' || a === 'jump')) continue; // confirming a slider must not start a ride or resume
          if (NAV[a]) { this.menuFocus(NAV[a]); continue; }
          const btn = a === 'confirm' && this.focusedButton();
          if (btn) { btn.click(); continue; }
        }
        switch (this.state) {
          case 'title': if (a === 'confirm' || a === 'jump') this.action('start'); break;
          case 'howto': if (a === 'confirm' || a === 'jump' || a === 'pause') this.action('back'); break;
          case 'board': case 'train': if (a === 'pause') this.action('back'); break;
          case 'free': if (a === 'pause') this.action('train'); break;
          case 'intro': if (a === 'confirm' || a === 'jump') this.action('go'); break;
          case 'riding': if (a === 'pause') this.pause(); else if (a === 'restart') this.restartDelivery(); break;
          case 'paused': if (a === 'pause' || a === 'confirm') this.resume(); else if (a === 'restart') this.restartDelivery(); break;
          case 'delivered': if (a === 'confirm' || a === 'jump') this.showReview(); break;
          case 'review':
            if (a === 'restart') this.action('again');
            else if (a === 'confirm' || a === 'jump') this.action(document.getElementById('rv-next').dataset.act);
            break;
          case 'final': if (a === 'confirm' || a === 'jump' || a === 'restart') this.action('start'); break;
          default: break;
        }
      }
    }
    frame(now) {
      requestAnimationFrame((t) => this.frame(t));
      let dt = (now - this.last) / 1000;
      this.last = now;
      if (!(dt > 0)) dt = 0;
      if (dt > 0.1) dt = 0.1;
      this.frameDt = dt; this.time += dt;
      this.fpsAcc += dt; this.fpsN++;
      if (this.fpsAcc > 0.5) { this.fps = this.fpsN / this.fpsAcc; this.fpsAcc = 0; this.fpsN = 0; }
      try {
        this.input.pollPad();
        this.handleKeys();
        this.audio.tickMusic();
        if (this.state === 'title' || this.state === 'howto' || this.state === 'board' || this.state === 'train' || this.state === 'free') this.renderTitle();
        else {
          if (this.state === 'intro' && this.introT !== null) {
            this.introT -= dt;
            const el = document.getElementById('intro-count'), s = String(Math.max(1, Math.ceil(this.introT)));
            if (el.textContent !== s) el.textContent = s;
            if (this.introT <= 0) this.beginRide();
          }
          if (this.state === 'review' && this.reviewT !== null) {
            this.reviewT -= dt;
            const el = document.getElementById('rv-count'), s = String(Math.max(1, Math.ceil(this.reviewT)));
            if (el.textContent !== s) el.textContent = s;
            if (this.reviewT <= 0) this.action(document.getElementById('rv-next').dataset.act);
          }
          if (this.state === 'riding' || this.state === 'delivered') this.updateRiding(dt);
          else if (this.state === 'clip') this.updateClip(dt);
          this.renderWorld();
        }
      } catch (err) {
        if (this.errors++ < 3) console.error(err);
      }
    }
    // Crash replays (F-32): on by default, off with reduced motion or ?replay=off, and off in autopilot demos unless
    // ?replay=on, so they stay short.
    replaysOn() {
      if (this.replayPref === 'off' || this.reducedMotion) return false;
      return !this.autopilotName || this.replayPref === 'on';
    }
    // The live world waits, one step before it would respawn, while the replay plays.
    startReplay() {
      const rp = this.replay;
      rp.prepare();
      this.replaying = true; this.replayT = 0; this.replayHit = false;
      this.particles.clear(); this.scarf.ok = false;
      const b = rp.world.bike; this.cam.snap(b.x, b.y, b.vx); this.cam.trauma = 0;
      this.audio.update(null, false);
      this.announce('Replay. ' + controlKeys(['hop'], this.input.device).join(' or ') + ' skips it.');
    }
    endReplay() {
      this.replaying = false; this.replay = null; this.acc = 0;
      this.particles.clear(); this.scarf.ok = false; this.cam.zoom = 1;
      const W = this.world, r = W.rag.on ? W.rag : W.bike; this.cam.snap(r.x, r.y, 0);
    }
    updateReplay(dt) {
      const rp = this.replay, skip = this.input.sample().jumpPressed;
      this.replayT += dt;
      if ((skip && this.replayT > 0.25) || !rp.advance(dt)) { this.endReplay(); return; }
      this.followReplay(dt);
    }
    // The replay's camera: on the rider (or the flying body), pushing in for the slow-motion part.
    followReplay(dt) {
      const rp = this.replay, W = rp.world, b = W.bike;
      if (!this.replayHit && W.state === 'crashed') { this.replayHit = true; this.cam.shake(0.6); this.audio.play('crash'); }
      let fx = lerp(b.px, b.x, rp.alpha), fy = lerp(b.py, b.y, rp.alpha), fvx = b.vx;
      if (W.state === 'crashed' && W.rag.on) { fx = lerp(fx, W.rag.x, 0.6); fy = lerp(fy, W.rag.y, 0.6); fvx = W.rag.vx * 0.5; }
      this.cam.update(dt, fx, fy, fvx, Math.hypot(b.vx, b.vy), W.terrain, this.time, this.reducedMotion);
      rp.zoom += (rp.zoomTarget() - rp.zoom) * (1 - Math.exp(-dt * 4));
      this.cam.zoom = rp.zoom;
      this.particles.update(dt * rp.rate(), W.terrain);
    }
    // Wipeout clips (F-37): replay the run's worst crash on screen and record the canvas. The file stays on the device.
    clipFormat() {
      if (this.clipFmt === undefined) {
        const ok = root.MediaRecorder && this.R.cv && typeof this.R.cv.captureStream === 'function';
        this.clipFmt = ok ? clipType((m) => MediaRecorder.isTypeSupported(m)) : null;
      }
      return this.clipFmt;
    }
    canSaveClip() { return !!(this.world && this.clipFormat() && pickWipeout(this.crashLog)); }
    startClip() {
      const fmt = this.clipFormat(), pick = pickWipeout(this.crashLog), W = this.world;
      if (!fmt || !pick || !W || this.state !== 'review') return;
      this.replay = new CrashReplay(this.runCourse(this.run), W.opts, W.inputLog, pick.step);
      this.replay.prepare();
      this.replaying = true; this.replayT = 0; this.replayHit = false; this.reviewT = null;
      this.state = 'clip'; this.show(null); this.particles.clear(); this.scarf.ok = false;
      if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); // so SPACE cancels, not re-clicks
      const b = this.replay.world.bike; this.cam.snap(b.x, b.y, b.vx); this.cam.trauma = 0;
      const chunks = [], rec = new MediaRecorder(this.R.cv.captureStream(30), { mimeType: fmt.mime });
      rec.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
      rec.onstop = () => { if (this.clipKeep && chunks.length) this.saveClip(new Blob(chunks, { type: fmt.mime.split(';')[0] }), fmt.ext); };
      this.clipRec = rec; this.clipKeep = false;
      rec.start(250);
      this.announce('Recording your wipeout. ' + controlKeys(['hop'], this.input.device).join(' or ') + ' cancels.');
    }
    updateClip(dt) {
      const rp = this.replay, skip = this.input.sample().jumpPressed;
      this.replayT += dt;
      if (skip && this.replayT > 0.25) { this.finishClip(false); return; }
      if (!rp.advance(dt)) { this.finishClip(true); return; }
      this.followReplay(dt);
    }
    finishClip(keep) {
      this.clipKeep = keep;
      if (this.clipRec && this.clipRec.state !== 'inactive') this.clipRec.stop();
      this.clipRec = null; this.replaying = false; this.replay = null; this.cam.zoom = 1;
      this.particles.clear(); this.scarf.ok = false;
      const W = this.world, b = W.bike; this.cam.snap(b.x, b.y, 0);
      this.state = 'review'; this.show('review', document.getElementById('rv-clip-btn'));
      document.getElementById('rv-clip-status').textContent = keep ? 'Saving…' : 'Clip cancelled.';
    }
    saveClip(blob, ext) {
      const name = 'hillarious-wipeout-' + String(this.world.course.id).replace(/[^\w-]/g, '') + '.' + ext, status = document.getElementById('rv-clip-status');
      this.lastClip = { size: blob.size, type: blob.type, name }; // tests read it
      const file = root.File ? new File([blob], name, { type: blob.type }) : null;
      if (file && this.input.touchMode && navigator.canShare && navigator.canShare({ files: [file] })) {
        navigator.share({ files: [file] }).then(() => { status.textContent = 'Shared.'; }, () => { status.textContent = 'Not shared.'; });
        return;
      }
      const a = document.createElement('a'), url = URL.createObjectURL(blob);
      a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      status.textContent = 'Saved ' + name + '.'; this.announce(status.textContent);
    }
    updateRiding(dt) {
      if (this.replaying) { this.updateReplay(dt); return; }
      const W = this.world;
      if (this.replay && !this.replay.ready) this.replay.prepare(1500); // fast-forward a little each frame while the crash plays
      if (this.slowT > 0) { this.slowT -= dt; this.timeScale = this.slowT > 0.3 ? 0.3 : lerp(1, 0.3, clamp(this.slowT / 0.3, 0, 1)); }
      else this.timeScale = 1;
      this.timeScale *= this.practiceScale; // Free Ride slow-mo stacks with the crash slow-mo
      this.acc += dt * this.timeScale;
      let steps = 0;
      while (this.acc >= STEP && steps < MAX_STEPS) {
        if (this.replay && W.state === 'crashed' && W.crashT + STEP >= CRASH_TIME) { this.startReplay(); break; } // the next step respawns
        W.step(this.autopilot ? this.autopilot.input(W) : this.input.sample());
        this.acc -= STEP; steps++;
      }
      if (steps >= MAX_STEPS) this.acc = 0;
      this.alpha = this.acc / STEP;
      for (const e of W.drain()) this.onEvent(e);
      if (this.replaying) return; // it just started: the camera is on the replay now
      const b = W.bike;
      let fx = lerp(b.px, b.x, this.alpha), fy = lerp(b.py, b.y, this.alpha), fvx = b.vx;
      if (W.state === 'crashed' && W.rag.on) { fx = lerp(fx, W.rag.x, 0.6); fy = lerp(fy, W.rag.y, 0.6); fvx = W.rag.vx * 0.5; }
      this.cam.update(dt, fx, fy, fvx, Math.hypot(b.vx, b.vy), W.terrain, this.time, this.reducedMotion);
      this.particles.update(dt * this.timeScale, W.terrain);
      this.audio.update(W, true);
      this.audio.airDuck(airDuckWanted(W.state, b.grounded, b.airTime));
      const half = Math.floor(b.crank / Math.PI);
      if (b.pedalIn && half !== this.lastCrankHalf) { this.lastCrankHalf = half; this.audio.play('tick'); }
      this.updateHumor(dt);
      this.updateFx(dt);
      if (W.boostT > 0 && W.state === 'riding') { // espresso steam trail
        this.steamAcc = (this.steamAcc || 0) + dt;
        while (this.steamAcc > 0.07) { this.steamAcc -= 0.07; const p = b.localToWorld(-0.45, 0.75, this.anchor); this.particles.spawn(PK.PUFF, p.x, p.y, -b.vx * 0.15 - 0.4, 0.2, 0.7, 0.06, ''); }
      }
      if (this.state === 'delivered') {
        const prev = this.deliveredT, arrive = cargoView(W.cargo.kind).arrival;
        this.deliveredT += dt;
        if (arrive.bell && prev < 0.8 && this.deliveredT >= 0.8) { this.audio.play('bell'); this.bellT = 0.6; }
        if (arrive.bride && W.cargo.amount >= 30 && prev < 0.35 && this.deliveredT >= 0.35) this.audio.play('bride');
        if (prev < 1.25 && this.deliveredT >= 1.25) this.say('DELIVERY_COMPLETE');
        if (this.deliveredT > (this.autopilotName ? 2.8 : arrive.reviewAfter)) this.showReview();
      }
      if (this.bellT > 0) this.bellT -= dt;
    }
    // Who can talk right now (and from where). Pedestrians must be near the rider, i.e. on screen.
    speaker(who, focus) {
      const W = this.world;
      if (!W) return null;
      const b = W.bike, C = W.course;
      switch (who) {
        case 'rider': return W.state === 'crashed' ? null : { kind: 'rider' };
        case 'customer': return { kind: 'customer' };
        case 'car':
          for (const car of W.obstacles.cars) if (Math.abs(car.midX - b.x) < 30) return { kind: 'car', car };
          for (const cc of W.obstacles.crossers) if (cc.kind === 'maybemo' && cc.state !== 'DONE' && Math.abs(cc.cx - b.x) < 45) return { kind: 'crosser', cc };
          return null;
        case 'operator':
          for (const cc of W.obstacles.crossers) if (cc.kind === 'cablecar' && cc.state !== 'DONE' && Math.abs(cc.cx - b.x) < 45) return { kind: 'operator', cc };
          return null;
        case 'office': return C.office && Math.abs(C.doorX - b.x) < 30 ? { kind: 'office' } : null;
        case 'groom': return C.venue && Math.abs(C.venue.arch - b.x) < 30 ? { kind: 'groom' } : null;
        default: {
          if (focus) return who === 'any-ped' || focus.kind === who ? { kind: 'ped', ped: focus } : null;
          let best = null, bd = 24;
          for (const B of C.pedestrians) { const d = Math.abs(B.x - b.x); if (d < bd && (who === 'any-ped' || B.kind === who)) { best = B; bd = d; } }
          return best ? { kind: 'ped', ped: best } : null;
        }
      }
    }
    say(trigger, focus) {
      if (!this.world) return;
      for (const s of this.humor.offer(trigger, this.time, (who) => this.speaker(who, focus))) this.presentLine(s);
    }
    presentLine(s) {
      const line = s.line, who = s.who || {}, dur = s.until - s.t0;
      if (line.speaker === 'customer') { this.fx.text = { line, t: 0, dur }; this.audio.play('blip'); return; }
      this.fx.bubble = { line, who, t: 0, dur };
      this.audio.duck(Math.min(1.2, dur * 0.5), 0.15);
      if (who.kind === 'ped') {
        const photo = line.trigger === 'BIG_JUMP' && who.ped.kind === 'tourist';
        who.ped.react = { kind: photo ? 'photo' : 'talk', t: 0, dur };
        if (photo) this.audio.play('shutter');
        if (who.ped.kind === 'dog') this.audio.play('bark');
        this.audio.play('voice', (PED_LOOK[who.ped.kind] || PED_LOOK.tech).voice);
      } else if (who.kind === 'car' || who.kind === 'crosser') this.audio.play('mmbeep');
      else this.audio.play('voice', who.kind === 'operator' ? 0.15 : 0.5);
    }
    updateHumor(dt) {
      const W = this.world, b = W.bike;
      const q = this.humor.tick(this.time, (who) => this.speaker(who));
      if (q) this.presentLine(q);
      for (const tm of this.timers) if (!tm.done && this.time >= tm.at) { tm.done = true; this.say(tm.trigger); }
      this.timers = this.timers.filter((tm) => !tm.done);
      for (const cc of W.obstacles.crossers) if (cc.angry > 0) cc.angry -= dt;
      for (const B of W.course.pedestrians) {
        if (B.react) { B.react.t += dt; if (B.react.t > (B.react.dur || 2.2) + 0.2) B.react = null; }
        if (W.state === 'riding' && !this.greeted.has(B) && B.x - b.x < 11 && B.x - b.x > 3) { this.greeted.add(B); this.say('AMBIENT', B); }
      }
    }
    react(kind, dur, range) {
      const b = this.world.bike;
      for (const B of this.world.course.pedestrians) {
        if (Math.abs(B.x - b.x) > (range || 18) || (B.react && B.react.kind === 'talk')) continue;
        B.react = { kind: B.kind === 'tourist' && kind === 'cheer' ? 'photo' : kind, t: 0, dur };
      }
    }
    pop(text, kind, life = 1.6) { this.fx.pops.push({ text, kind, t: 0, life }); if (this.fx.pops.length > 4) this.fx.pops.shift(); }
    spawnCargoBits(n, burst) { cargoView(this.world.cargo.kind).bits(this, n, burst); }
    dropDecor(e) {
      const W = this.world, b = W.bike, d = e.decor;
      const p0 = W.state === 'crashed' && W.cup.on ? { x: W.cup.x, y: W.cup.y } : b.localToWorld(CAKE.mountX + d.x, 0.1 + d.tier * 0.17, { x: 0, y: 0 });
      const p = this.particles.spawn(PK.DECOR, p0.x, p0.y, b.vx * 0.7 - 1 + Math.random() * 2, 2 + Math.random() * 2, 3.2, d.kind === 'rose' ? 0.045 : 0.06, '');
      p.shape = d.kind; p.vr = (Math.random() - 0.5) * 16;
      this.audio.play('decor');
    }
    onEvent(e) {
      const A = this.audio, P = this.particles, W = this.world, view = cargoView(W.cargo.kind), unit = cargoWords(W.cargo.kind).unit;
      switch (e.type) {
        case 'HOP':
          A.play('hop');
          for (let i = 0; i < 4; i++) P.spawn(PK.DUST, e.x + (Math.random() - 0.5) * 0.8, e.y - W.phys.rideH + 0.05, (Math.random() - 0.5) * 1.5, Math.random() * 0.8, 0.6, 0.08, '');
          break;
        case 'LAND': {
          if (this.mode === 'free' && e.airTime > 0.12) { const S = this.freeStats; S.totalAir += e.airTime; S.bestAir = Math.max(S.bestAir, e.airTime); }
          A.play('land', clamp(e.impact / 10, 0.15, 1));
          if (e.impact > 2.5) {
            const n = Math.min(14, 3 + Math.round(e.impact));
            for (let i = 0; i < n; i++) P.spawn(PK.DUST, e.x + (Math.random() - 0.5) * 1.2, e.y - W.phys.rideH + 0.05, (Math.random() - 0.5) * 3, Math.random() * 1.2, 0.7, 0.1, '');
            this.cam.shake(Math.min(0.55, e.impact / 18));
          }
          break;
        }
        case 'SPLASH': A.play(view.splashSound); this.spawnCargoBits(Math.min(22, 5 + Math.round(e.amount * 2.5)), true); break;
        case 'SPILL':
          view.onSpill(this, e);
          break;
        case 'SPILL_EPISODE': { // bigger losses say what caused them
          const named = e.total >= 2 && SPILL_CAUSES[e.cause];
          this.pop('-' + Math.round(e.total) + unit + (named ? ' · ' + named : ''), 'bad', named ? 2.6 : 1.6);
        }
          if (view.spillLine && e.total >= 3) this.say('COFFEE_SPILL'); break;
        case 'STRAP': A.play('wobble'); this.cam.shake(0.12); break;
        case 'CAKE_DECOR': this.dropDecor(e); if (!e.crash) this.say('CAKE_DECOR'); break;
        case 'CAKE_GROOM': this.dropDecor(e); this.say('CAKE_GROOM'); break;
        case 'CAKE_WOBBLE': this.say('CAKE_WOBBLE'); break;
        case 'DISCO_TILE': A.play('glint'); this.spawnCargoBits(Math.min(5, 1 + Math.round(e.hit * 2)), false); break;
        case 'DISCO_POP': A.play('boing'); this.cam.shake(0.2); this.pop('Boing! Back in the crate', 'bad', 1.4); this.say('DISCO_POP'); break;
        case 'DISCO_ROLL': this.say('DISCO_ROLL'); break;
        case 'CLEAN_LANDING': this.pop('+$0.25 clean landing', 'good'); A.play('coin'); this.say('CLEAN_LANDING'); break;
        case 'BIG_LIP': this.pop('Landed it level · ' + e.airTime.toFixed(2) + ' s air', 'good'); break;
        case 'STOP_ZONE': this.pop(e.left ? 'Stopped! ' + e.left + ' to go' : 'Stopped! Every box done', 'good'); A.play('coin'); break;
        case 'LAP': {
          this.fx.toast = { text: 'Lap ' + (e.laps + 1) + ' · fresh cargo · best air ' + this.freeStats.bestAir.toFixed(2) + ' s', t: 0, dur: 2.8 };
          this.fx.flash = 0.6; A.play('whoosh');
          const b = W.bike; this.cam.snap(b.x, b.y, b.vx); this.scarf.ok = false; this.particles.clear();
          break;
        }
        case 'BOARDWALK': this.say('BOARDWALK'); break;
        case 'BIG_AIR': this.react('cheer', 1.6); this.say('BIG_JUMP'); break;
        case 'HARD_BRAKE': this.say('HARD_BRAKE'); break;
        case 'CARGO_HALF': this.say('CARGO_HALF'); break;
        case 'PLAYER_FAST': this.say('PLAYER_FAST'); break;
        case 'PLAYER_SLOW': this.say('PLAYER_SLOW'); break;
        case 'POTHOLE': A.play('clunk'); this.say('POTHOLE'); this.cam.shake(0.25); break;
        case 'STAIRS': this.say('STAIRS'); break;
        case 'CONE': A.play('cone'); this.say('CONE'); break;
        case 'BONK': A.play('bonk'); this.cam.shake(0.3); if (e.kind === 'car' || e.kind === 'maybemo') this.say('MAYBEMO_BONK'); break;
        case 'MAYBEMO_ENCOUNTER': this.say('MAYBEMO_ENCOUNTER'); break;
        case 'MAYBEMO_THINK': A.play('mmthink'); break;
        case 'MAYBEMO_STOPPED': this.say('MAYBEMO_STOPPED'); break;
        case 'MAYBEMO_RESUME': this.say('MAYBEMO_RESUME'); break;
        case 'MAYBEMO_HOLD': this.say('MAYBEMO_HOLD'); break;
        case 'MAYBEMO_OVER': this.say('MAYBEMO_OVER'); if (e.near) { this.pop('+$0.30 near miss', 'good'); A.play('coin'); } break;
        case 'CABLE_CAR_ENCOUNTER': this.say('CABLE_CAR_ENCOUNTER'); break;
        case 'CABLE_BELL': A.play('ding'); break;
        case 'CABLE_CAR_HOLD': this.say('CABLE_CAR_HOLD'); break;
        case 'NEAR_MISS': this.pop('+$0.30 near miss', 'good'); A.play('coin'); this.say('NEAR_MISS'); break;
        case 'POWERUP':
          A.play(e.kind === 'bubble' ? 'powerup' : 'espresso');
          for (let i = 0; i < 14; i++) P.spawn(PK.CONFETTI, e.x, e.y, (Math.random() - 0.5) * 4, Math.random() * 4, 1.0, 0.05, e.kind === 'bubble' ? '#cfe6f2' : '#f2b134');
          this.pop(e.kind === 'bubble' ? 'Bubble wrap: next hit is free' : 'Espresso: legs at 160%', 'good');
          this.say(e.kind === 'bubble' ? 'POWERUP_BUBBLE' : 'POWERUP_ESPRESSO');
          break;
        case 'SHIELD_POP':
          A.play('pop'); this.pop('Bubble wrap took the hit', 'good'); this.say('SHIELD_POP');
          for (let i = 0; i < 10; i++) P.spawn(PK.CONFETTI, W.bike.x, W.bike.y + 0.3, (Math.random() - 0.5) * 5, Math.random() * 4, 0.8, 0.04, '#e9f4fa');
          break;
        case 'CRASH': {
          this.slowT = 0.75; A.play('crash'); A.duck(1.6); this.cam.shake(0.9);
          if (e.step) this.crashLog.push({ step: e.step, lost: e.lost || 0 }); // for the wipeout clip (F-37)
          if (this.replaysOn() && e.step) this.replay = new CrashReplay(this.runCourse(this.run), W.opts, W.inputLog, e.step);
          if (!this.crashOrder.length) this.crashOrder = CRASH_LINES.slice();
          this.fx.caption = { text: this.crashOrder.shift(), t: 0 }; this.fx.bubble = null; this.announce(this.fx.caption.text);
          this.spawnCargoBits(24, true);
          if (e.lost > 0) this.pop('-' + Math.round(e.lost) + unit, 'bad');
          this.react('shock', 1.1, 24);
          if (e.cause === 'cablecar') { for (const cc of W.obstacles.crossers) cc.angry = 2.5; this.say('CABLE_CAR_CRASH'); }
          if (e.first) this.timers.push({ at: this.time + 1.5, trigger: 'FIRST_CRASH' });
          this.timers.push({ at: this.time + 0.9, trigger: 'CRASH_REACT' });
          break;
        }
        case 'RECOVER': {
          this.fx.sub = { text: RECOVER_LINE, t: 0 }; this.fx.flash = 1; A.play('whoosh');
          const b = W.bike; this.cam.snap(b.x, b.y, b.vx); this.scarf.ok = false;
          break;
        }
        case 'CHECKPOINT': if (W.splitList()) this.showSplit(e.i - 1, e.split); break;
        case 'FINISH_LINE': if (W.splitList()) this.showSplit(W.course.checkpoints.length - 1, e.split); break;
        case 'HINT': if (!this.autopilot) this.fx.hint = { text: e.text, keys: controlKeys(e.actions, this.input.device), id: e.id, t: 0 }; break;
        case 'DELIVERED': {
          this.state = 'delivered'; this.deliveredT = 0; this.fx.stamp = 0; A.setMusic(null);
          if (e.condition < 30) A.play('trombone'); else if (view.arrival.success) A.play('success');
          this.announce('Delivered! ' + cargoWords(W.cargo.kind).noun + ' ' + Math.round(e.condition) + ' percent.');
          const b = W.bike, cols = ['#e8604c', '#f2b134', '#2c7a7b', '#9fd3f0', '#fff6e5', '#f39bb0'];
          for (let i = 0; i < 70; i++) P.spawn(PK.CONFETTI, b.x + (Math.random() - 0.5) * 3, b.y + 2 + Math.random(), (Math.random() - 0.5) * 7, 3 + Math.random() * 6, 2.4 + (i % 3) * 0.1, 0.07, cols[i % cols.length]);
          this.react('cheer', 3, 30);
          break;
        }
        default: break;
      }
    }
    updateFx(dt) {
      const f = this.fx;
      for (const k of ['caption', 'sub', 'hint', 'bubble', 'text', 'toast']) if (f[k]) f[k].t += dt;
      if (f.caption && f.caption.t > 3) f.caption = null;
      if (f.sub && f.sub.t > 3.2) f.sub = null;
      const first = f.hint && (f.hint.id === 'pedal' || f.hint.id === 'cake');
      if (first && this.world && this.world.bike.pedalIn && f.hint.t > 0.8) f.hint.t = Math.max(f.hint.t, 5.6);
      if (f.hint && f.hint.t > (first ? 6 : 5)) f.hint = null;
      if (f.bubble && f.bubble.t > f.bubble.dur) f.bubble = null;
      if (f.text && f.text.t > f.text.dur) f.text = null;
      if (f.toast && f.toast.t > (f.toast.dur || 1.2)) f.toast = null;
      for (const p of f.pops) p.t += dt;
      f.pops = f.pops.filter((p) => p.t < p.life);
      if (f.flash > 0) f.flash = Math.max(0, f.flash - dt * 3);
      if (f.stamp >= 0) f.stamp += dt;
    }
    anchorFor(who, out) {
      const W = this.world, T = W.terrain, C = W.course;
      switch (who.kind) {
        case 'car': out.x = who.car.midX; out.y = who.car.roofY + 0.8; break;
        case 'crosser': case 'operator': {
          const s = who.cc.sign_;
          if (s && s.s) { out.x = s.x - (who.kind === 'operator' ? 0.3 * s.s : 0); out.y = s.y + 0.45 * s.s; } else { out.x = who.cc.cx; out.y = who.cc.y + 3.6; }
          break;
        }
        case 'ped': out.x = who.ped.x; out.y = T.height(who.ped.x) + ROAD.curb + 2.0; break;
        case 'office': out.x = C.doorX; out.y = T.height(C.doorX) + ROAD.walk + 3.2; break;
        case 'groom': out.x = C.venue.arch + 0.87; out.y = T.height(C.venue.arch) + ROAD.walk + 2.1; break;
        default: { const r = W.state === 'crashed' && W.rag.on ? W.rag : W.bike; out.x = r.x - 0.35; out.y = r.y + 1.25; }
      }
      return out;
    }
    renderTitle() {
      const R = this.R, W = this.titleWorld, b = W.bike, cam = this.cam, c = W.cargo;
      R.ensureScenery(W.course);
      if (!this.titleReady) { W.spawn(W.course.start, 0); this.titleReady = true; this.scarf.ok = false; }
      b.px = b.x; b.py = b.y; b.pa = b.a;
      c.slosh = Math.sin(this.time * 2.6) * 0.16 + Math.sin(this.time * 5.3) * 0.05; c.sloshV = Math.cos(this.time * 2.6) * 0.4;
      c.tilt = Math.sin(this.time * 2.6 + 0.6) * 0.06; c.thr = c.threshold();
      b.lean = Math.sin(this.time * 0.7) * 0.15;
      for (const cc of W.obstacles.crossers) { // the background cable car creeps up and down the hill
        cc.z = 9 + 4.5 * Math.sin(this.time * 0.18); cc.state = 'CROSSING'; cc.v = 1; cc.bellT = (this.time % 5) < 0.4 ? 1.3 : 0;
      }
      R.S = R.baseS * 0.66;
      const portrait = R.W < R.H;
      cam.x = b.x + (portrait ? 0.22 : 0.34) * (R.W / R.S); cam.y = b.y + (portrait ? 0.08 : -0.18) * (R.H / R.S); cam.sx = 0; cam.sy = 0;
      this.windX = -3.5;
      this.drawWorldScene(W, 1);
      R.screenSpace();
      this.drawLabels(W);
      const B = W.course.pedestrians[0], p = R.toScreen(cam, B.x, W.terrain.height(B.x) + ROAD.curb + 2.0, {});
      this.bubbleAt(p.x, p.y, '?!', 'big');
    }
    renderWorld() {
      const live = this.world;
      if (!live) return;
      const R = this.R, ctx = R.ctx, rp = this.replaying ? this.replay : null, W = rp ? rp.world : live;
      R.S = R.baseS * this.cam.zoom;
      R.ensureScenery(live.course); // the replay's course is a copy: same scenery
      this.windX = -2;
      this.drawWorldScene(W, rp ? rp.alpha : this.alpha);
      R.screenSpace();
      this.drawLabels(W);
      if (rp) this.drawReplay(rp);
      else {
        if (this.state !== 'intro') this.drawHud(W);
        this.drawFx(W);
      }
      if (this.state === 'paused' || this.state === 'review') { ctx.fillStyle = 'rgba(45,42,50,0.12)'; ctx.fillRect(0, 0, R.W, R.H); }
      if (this.debug) this.drawDebug(W);
    }
    // Letterbox bars, a blinking REPLAY tag, the skip key, and how much is left.
    drawReplay(rp) {
      const R = this.R, ctx = R.ctx, w = R.W, h = R.H, bar = Math.round(h * 0.09), u = clamp(Math.min(w, h) / 46, 11, 18);
      ctx.save();
      ctx.fillStyle = 'rgba(20,18,24,0.88)'; ctx.fillRect(0, 0, w, bar); ctx.fillRect(0, h - bar, w, bar);
      ctx.textBaseline = 'middle'; ctx.font = '800 ' + (u * 1.15).toFixed(1) + 'px system-ui, sans-serif';
      if (Math.floor(this.time * 2.5) % 2 === 0) { ctx.fillStyle = '#e8604c'; ctx.beginPath(); ctx.arc(u * 1.6, bar / 2, u * 0.45, 0, TAU); ctx.fill(); }
      ctx.fillStyle = '#fff6e5'; ctx.textAlign = 'left'; ctx.fillText('REPLAY', u * 2.6, bar / 2);
      if (rp.rate() < 1) { ctx.fillStyle = '#f2b134'; ctx.fillText('SLOW-MO', u * 2.6 + ctx.measureText('REPLAY  ').width, bar / 2); }
      ctx.font = '700 ' + u.toFixed(1) + 'px system-ui, sans-serif'; ctx.textAlign = 'right'; ctx.fillStyle = '#fff6e5';
      ctx.fillText(controlKeys(['hop'], this.input.device).join(' / ') + (this.state === 'clip' ? '  cancel' : '  skip'), w - u * 1.2, h - bar / 2);
      if (this.state === 'clip') { ctx.fillText('HILLARIOUS · ' + GAME_URL.replace(/^https:\/\//, ''), w - u * 1.2, bar / 2); } // the clip says where it's from
      ctx.fillStyle = 'rgba(255,246,229,0.25)'; ctx.fillRect(0, h - bar, w, 3);
      ctx.fillStyle = '#f2b134'; ctx.fillRect(0, h - bar, w * rp.progress, 3);
      ctx.restore();
    }
    drawWorldScene(W, alpha) {
      const R = this.R, ctx = R.ctx, cam = this.cam, t = this.time, O = W.obstacles;
      R.screenSpace();
      R.drawBackdrop(cam, t, W.course.theme);
      R.worldSpace(cam);
      const half = R.W / 2 / R.S + 3, xa = cam.x - half, xb = cam.x + half, vis = (x, m) => x > xa - m && x < xb + m;
      R.drawScenery(W, xa, xb, t);
      R.drawRoad(W, xa, xb);
      const front = [];
      for (const cc of O.crossers) { if (!vis(cc.cx, 4)) continue; if (crosserView(cc).zf > 0.2) drawCrosser(ctx, cc, t); else front.push(cc); }
      if (O.boardwalk) drawBoardwalk(ctx, O.boardwalk, W.terrain, xa, xb, t);
      R.drawPedestrians(W, xa, xb, t);
      this.particles.drawStains(ctx);
      for (const r of O.ramps) if (vis(r.x, 6)) drawRamp(ctx, r);
      for (const car of O.cars) if (car.x + CAR_LEN > xa && car.x - 4 < xb) drawCar(ctx, car, t);
      for (const cone of O.cones) if (vis(cone.x, 1)) drawCone(ctx, cone, alpha);
      for (const pu of O.powerups) if (!pu.taken && vis(pu.x, 1)) drawPowerup(ctx, pu, t);
      if (!(W.invuln > 0 && Math.floor(t * 16) % 2 === 0 && W.state === 'riding')) R.drawBike(W, alpha, this);
      for (const cc of front) drawCrosser(ctx, cc, t);
      this.particles.draw(ctx);
    }
    drawLabels(W) {
      const R = this.R, ctx = R.ctx, cam = this.cam, T = W.terrain, C = W.course, S = R.S, p = {};
      const half = R.W / 2 / S + 3, xa = cam.x - half, xb = cam.x + half;
      const text = (str, wx, wy, size, color, weight, family, maxW) => {
        R.toScreen(cam, wx, wy, p);
        ctx.font = weight + ' ' + size.toFixed(1) + 'px ' + family;
        const tw = ctx.measureText(str).width, sc = maxW && tw > maxW ? maxW / tw : 1;
        ctx.save(); ctx.translate(p.x, p.y); ctx.scale(sc, sc); ctx.fillStyle = color; ctx.fillText(str, 0, 0); ctx.restore();
      };
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const fs = Math.max(8, S * 0.22);
      for (const I of C.intersections) {
        if (I.x1 < xa || I.x0 > xb) continue;
        const px = I.x1 - 0.7, y = T.height(px) + ROAD.walk - 0.1;
        text(C.street, px, y + 3.18, fs, '#ffffff', '800', FONT_BODY, S * 2.45);
        text(I.name.replace(/ (ST|AVE)$/, ''), px + 0.62, y + 2.73, fs, '#ffffff', '800', FONT_BODY, S * 1.5);
      }
      for (const L of C.landmarks) {
        if (L.visual === 'historic-brick-building' && L.x1 > xa && L.x0 < xb) {
          const base = Math.max(T.height(L.x0), T.height(L.x1)) + ROAD.walk;
          text(L.name.toUpperCase(), (L.x0 + L.x1) / 2, base + 4.33, S * 0.4, '#f2dd9e', '900', FONT_DISPLAY, S * 6);
        }
        const px = L.x0 + 1.1;
        if (px < xa - 2 || px > xb + 2) continue;
        text(L.name.toUpperCase(), px, T.height(px) + ROAD.walk + 2.1, Math.max(7, S * 0.19), COL.cream, '800', FONT_BODY, S * 2.95);
      }
      if (C.office && C.office.x1 > xa && C.office.x0 < xb) {
        const y = T.height(C.office.x0) + ROAD.walk;
        text(C.office.label || 'MEETINGLESS', (C.office.x0 + C.office.x1) / 2, y + 2.75, S * 0.5, COL.cream, '900', FONT_DISPLAY);
        text(C.office.sign || 'NO BELLS PLEASE', C.doorX + 1.9, y + 1.4, Math.max(8, S * 0.16), COL.ink, '700', FONT_BODY);
      }
      for (const z of W.zones) {
        const sx = z.x0 + 0.6;
        if (sx < xa - 2 || sx > xb + 2) continue;
        text(z.done ? 'OK' : 'STOP', sx, T.height(sx) + ROAD.walk + 2.75, Math.max(7, S * 0.2), '#ffffff', '900', FONT_BODY, S * 0.7);
      }
      if (C.venue && C.venue.x1 > xa && C.venue.x0 < xb) {
        const gy = T.height(C.venue.arch) + ROAD.walk;
        R.toScreen(cam, C.venue.arch, gy + 5.35, p);
        const [signName, signSub] = cargoView(C.cargo).venueSign || CARGO_VIEW.cake.venueSign;
        ctx.font = '900 ' + (S * 0.36).toFixed(1) + 'px ' + FONT_DISPLAY;
        const tw = ctx.measureText(signName).width + S * 0.6;
        ctx.fillStyle = 'rgba(255,246,229,0.95)'; rrect(ctx, p.x - tw / 2, p.y - S * 0.36, tw, S * 0.95, S * 0.15); ctx.fill();
        ctx.strokeStyle = COL.ink; ctx.lineWidth = 2; ctx.stroke();
        ctx.fillStyle = '#c2584a'; ctx.fillText(signName, p.x, p.y - S * 0.06);
        ctx.font = '800 ' + Math.max(7, S * 0.15).toFixed(1) + 'px ' + FONT_BODY; ctx.fillStyle = COL.ink; ctx.fillText(signSub, p.x, p.y + S * 0.33);
      }
      const walk = W.obstacles && W.obstacles.boardwalk;
      if (walk && walk.x0 + 5 > xa - 6 && walk.x0 + 5 < xb + 6) {
        R.toScreen(cam, walk.x0 + 5, polylineY(walk.pts, walk.x0 + 5) + 3.1, p);
        ctx.font = '900 ' + (S * 0.3).toFixed(1) + 'px ' + FONT_DISPLAY;
        const tw = ctx.measureText(walk.name).width + S * 0.6;
        ctx.fillStyle = 'rgba(255,246,229,0.95)'; rrect(ctx, p.x - tw / 2, p.y - S * 0.32, tw, S * 0.82, S * 0.12); ctx.fill();
        ctx.strokeStyle = COL.ink; ctx.lineWidth = 2; ctx.stroke();
        ctx.fillStyle = '#6e4a2e'; ctx.fillText(walk.name, p.x, p.y - S * 0.06);
        ctx.font = '800 ' + Math.max(7, S * 0.14).toFixed(1) + 'px ' + FONT_BODY; ctx.fillStyle = COL.ink; ctx.fillText('NO WIND · HOP UP', p.x, p.y + S * 0.28);
      }
      const box = (str, wx, wy, size, fg) => {
        R.toScreen(cam, wx, wy, p);
        ctx.font = '900 ' + size.toFixed(1) + 'px ' + FONT_MONO;
        const tw = ctx.measureText(str).width + size;
        ctx.fillStyle = 'rgba(30,29,34,0.92)'; rrect(ctx, p.x - tw / 2, p.y - size * 0.8, tw, size * 1.6, size * 0.4); ctx.fill();
        ctx.fillStyle = fg; ctx.fillText(str, p.x, p.y + size * 0.05);
      };
      for (const car of W.obstacles.cars) {
        if (car.x > xb || car.x + CAR_LEN < xa) continue;
        const ca = Math.cos(car.a), sa = Math.sin(car.a);
        R.toScreen(cam, car.x + 1.75 * ca - 0.62 * sa, car.y + 1.75 * sa + 0.62 * ca, p);
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(-car.a);
        ctx.fillStyle = COL.teal; ctx.font = '900 ' + Math.max(8, S * 0.24).toFixed(1) + 'px ' + FONT_DISPLAY; ctx.fillText('MAYBE-MO', 0, 0);
        ctx.restore();
        box(car.display === 'TRAINED' ? 'TRAINED ✓' : 'THINKING…', car.x + 1.58 * ca - 1.95 * sa, car.y + 1.58 * sa + 1.95 * ca, Math.max(8, S * 0.17), '#7fe0d4');
      }
      const MM = { IDLE: 'PARKED', DRIVING: 'AUTONOMOUS', THINKING: 'THINKING…', BRAKING: 'UNSURE…', STOPPED: 'CONFIDENCE 12%', RESUMING: 'RECALCULATING' };
      for (const cc of W.obstacles.crossers) {
        const s = cc.sign_;
        if (!s || !s.s || cc.state === 'DONE' || cc.cx < xa - 4 || cc.cx > xb + 4 || crosserView(cc).alpha < 0.3) continue;
        if (cc.kind === 'cablecar') text(cc.sign, s.x, s.y, Math.max(6, S * 0.16 * s.s), '#fff3c4', '900', FONT_MONO, S * 1.65 * s.s);
        else text(cc.held ? 'AFTER YOU' : MM[cc.state] || '', s.x, s.y, Math.max(6, S * 0.14 * s.s), '#7fe0d4', '900', FONT_MONO, S * 1.15 * s.s);
      }
    }
    bubbleAt(x, y, text, kind, avoid) {
      const ctx = this.R.ctx, W = this.R.W;
      const fs = kind === 'big' ? 26 : clamp(this.R.W / 70, 13, 17);
      ctx.font = (kind === 'big' ? '900 ' : '700 ') + fs + 'px ' + (kind === 'big' ? FONT_DISPLAY : FONT_BODY);
      const maxW = Math.min(280, W * 0.5), words = text.split(' '), lines = [];
      let cur = '';
      for (const w of words) { const t = cur ? cur + ' ' + w : w; if (ctx.measureText(t).width > maxW && cur) { lines.push(cur); cur = w; } else cur = t; }
      lines.push(cur);
      const lw = Math.max(...lines.map((l) => ctx.measureText(l).width)), pad = 10, lh = fs * 1.25;
      const bw = lw + pad * 2, bh = lines.length * lh + pad * 1.4;
      let bx = clamp(x - bw / 2, 8, W - bw - 8), by = clamp(y - bh - 14, 64, this.R.H - bh - 8);
      if (avoid && bx < avoid.x1 && bx + bw > avoid.x0 && by < avoid.y1 && by + bh > avoid.y0) { // never cover the rider
        const up = avoid.y0 - bh - 16;
        if (up >= 64) by = up; else bx = clamp(x < avoid.x0 ? avoid.x0 - bw - 16 : avoid.x1 + 16, 8, W - bw - 8);
      }
      ctx.fillStyle = 'rgba(45,42,50,0.25)'; rrect(ctx, bx + 3, by + 4, bw, bh, 12); ctx.fill();
      ctx.fillStyle = COL.cream; rrect(ctx, bx, by, bw, bh, 12); ctx.fill();
      ctx.strokeStyle = COL.ink; ctx.lineWidth = 2.5; ctx.stroke();
      const tx = clamp(x, bx + 14, bx + bw - 14), ty = by + bh;
      if (y > ty) {
        ctx.beginPath(); ctx.moveTo(tx - 8, ty - 1); ctx.lineTo(tx + 2, ty + 12); ctx.lineTo(tx + 8, ty - 1); ctx.closePath();
        ctx.fillStyle = COL.cream; ctx.fill(); ctx.stroke();
        ctx.fillStyle = COL.cream; ctx.fillRect(tx - 6, ty - 4, 13, 5);
      }
      ctx.fillStyle = COL.ink; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      lines.forEach((l, i) => ctx.fillText(l, bx + pad, by + pad * 0.7 + i * lh));
    }
    drawCupIcon(ctx, x, y, h, frac) {
      const w = h * 0.7;
      ctx.save(); ctx.translate(x, y);
      ctx.beginPath(); ctx.moveTo(-w * 0.5, 0); ctx.lineTo(-w * 0.38, h); ctx.lineTo(w * 0.38, h); ctx.lineTo(w * 0.5, 0); ctx.closePath();
      ctx.fillStyle = '#e8f2f6'; ctx.fill();
      ctx.save(); ctx.clip();
      const ly = h - h * clamp(frac, 0, 1);
      ctx.fillStyle = COL.coffee; ctx.fillRect(-w, ly, w * 2, h);
      ctx.fillStyle = COL.foam; ctx.fillRect(-w, ly, w * 2, Math.min(h * 0.12, h - ly));
      ctx.restore();
      ctx.strokeStyle = COL.ink; ctx.lineWidth = 2; ctx.stroke();
      ctx.restore();
    }
    drawDiscoIcon(ctx, x, y, h, frac) { // a ball whose tiles go dark as condition drops
      const r = h * 0.42, cy = y + h * 0.5, n = 12, lit = Math.ceil(frac * n);
      ctx.save(); ctx.beginPath(); ctx.arc(x, cy, r, 0, TAU); ctx.clip();
      for (let i = 0; i < n; i++) { const col = i % 4, row = (i / 4) | 0; ctx.fillStyle = i < lit ? (i % 2 ? '#e8eef5' : '#b9c7d6') : '#3a3642'; ctx.fillRect(x - r + col * r / 2, cy - r + row * (2 * r / 3), r / 2 - 0.5, 2 * r / 3 - 0.5); }
      ctx.restore(); ctx.strokeStyle = COL.ink; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, cy, r, 0, TAU); ctx.stroke();
    }
    drawBouquetIcon(ctx, x, y, h, frac) { // one bloom per 20% of petals left
      const n = Math.max(0, Math.ceil(frac * 5));
      ctx.strokeStyle = '#4f8a5b'; ctx.lineWidth = Math.max(1, h * 0.07);
      line(ctx, x, y + h * 0.45, x, y + h * 0.05);
      for (let i = 0; i < n; i++) {
        const a = -Math.PI / 2 + (i - (n - 1) / 2) * 0.7;
        ctx.fillStyle = '#f29ab0'; ctx.beginPath(); ctx.arc(x + Math.cos(a) * h * 0.36, y + h * 0.2 + Math.sin(a) * h * 0.3, h * 0.17, 0, TAU); ctx.fill();
      }
    }
    drawCakeIcon(ctx, x, y, h, frac) { // tiers vanish as integrity drops
      const tiers = [[0.95, 0.34], [0.7, 0.3], [0.46, 0.27]], left = frac > 0.66 ? 3 : frac > 0.33 ? 2 : frac > 0 ? 1 : 0;
      let yy = y + h;
      ctx.save(); ctx.lineWidth = 2; ctx.strokeStyle = COL.ink;
      tiers.forEach(([w, th], i) => {
        const tw = w * h, hh = th * h * 0.92;
        rrect(ctx, x - tw / 2, yy - hh, tw, hh, 3);
        if (i < left) { ctx.fillStyle = '#fbf3e6'; ctx.fill(); ctx.fillStyle = '#f3a7b8'; ctx.fillRect(x - tw / 2 + 1, yy - hh * 0.45, tw - 2, 2); }
        else { ctx.setLineDash([3, 3]); }
        ctx.stroke(); ctx.setLineDash([]);
        yy -= hh;
      });
      ctx.restore();
    }
    drawHud(W) {
      const R = this.R, ctx = R.ctx, Wd = R.W, u = clamp(Math.min(Wd, R.H) / 46, 11, 18), pad = u * 0.9, C = W.course;
      const panel = (x, y, w, h) => { ctx.fillStyle = 'rgba(255,246,229,0.93)'; rrect(ctx, x, y, w, h, u * 0.7); ctx.fill(); ctx.strokeStyle = 'rgba(45,42,50,0.85)'; ctx.lineWidth = 2; ctx.stroke(); };
      ctx.textBaseline = 'middle';
      ctx.font = '900 ' + (u * 1.05).toFixed(1) + 'px ' + FONT_DISPLAY;
      const titleW = ctx.measureText(C.title).width;
      ctx.font = '800 ' + (u * 1.15).toFixed(1) + 'px ' + FONT_MONO;
      const lw = Math.max(u * 13.5, titleW + ctx.measureText('0:00.0').width + u * 2.6);
      panel(pad, pad, lw, u * 3.6);
      ctx.fillStyle = COL.coral; ctx.font = '900 ' + (u * 0.78).toFixed(1) + 'px ' + FONT_MONO; ctx.textAlign = 'left';
      const head = this.mode === 'drill' ? 'DRILL ' + (DRILLS.findIndex((D) => D.id === C.id) + 1) + '/' + DRILLS.length + ' · ACADEMY'
        : this.mode === 'daily' ? 'DAILY DISPATCH · ' + C.hood : this.mode === 'free' ? (this.run.daily ? 'PRACTICE · ' : 'FREE RIDE · ') + (C.loop ? 'LAP ' + (W.laps + 1) : C.hood) : this.mode === 'single' ? 'SINGLE ORDER · ' + C.hood
          : 'DELIVERY ' + (this.deliveryIndex + 1) + '/' + this.shiftRoutes.length + ' · ' + C.hood;
      ctx.fillText(head, pad + u * 0.8, pad + u * 0.95);
      ctx.fillStyle = COL.ink; ctx.font = '900 ' + (u * 1.05).toFixed(1) + 'px ' + FONT_DISPLAY;
      ctx.fillText(C.title, pad + u * 0.8, pad + u * 2.35);
      ctx.font = '800 ' + (u * 1.15).toFixed(1) + 'px ' + FONT_MONO; ctx.textAlign = 'right';
      ctx.fillText(fmtTime(W.score.time), pad + lw - u * 0.8, pad + u * 2.35);
      const bw = Math.min(Wd * 0.3, u * 22), bx = Wd / 2 - bw / 2, by = pad + u * 0.7;
      const endX = C.loop ? C.finishX : C.doorX, total = endX - C.start, prog = clamp((W.bike.x - C.start) / total, 0, 1);
      ctx.fillStyle = 'rgba(45,42,50,0.55)'; rrect(ctx, bx, by, bw, u * 0.55, u * 0.3); ctx.fill();
      ctx.fillStyle = COL.mustard; rrect(ctx, bx, by, Math.max(u * 0.55, bw * prog), u * 0.55, u * 0.3); ctx.fill();
      ctx.fillStyle = COL.ink; ctx.beginPath(); ctx.arc(bx + bw * prog, by + u * 0.27, u * 0.45, 0, TAU); ctx.fill();
      ctx.fillStyle = COL.cream; ctx.beginPath(); ctx.arc(bx + bw * prog, by + u * 0.27, u * 0.22, 0, TAU); ctx.fill();
      ctx.fillStyle = COL.coral; ctx.fillRect(bx + bw + u * 0.3, by - u * 0.55, u * 0.12, u * 1.3);
      ctx.beginPath(); ctx.moveTo(bx + bw + u * 0.42, by - u * 0.55); ctx.lineTo(bx + bw + u * 1.2, by - u * 0.3); ctx.lineTo(bx + bw + u * 0.42, by - u * 0.05); ctx.fill();
      ctx.textAlign = 'center'; ctx.font = '800 ' + (u * 0.8).toFixed(1) + 'px ' + FONT_BODY;
      const left = Math.max(0, Math.round(endX - W.bike.x));
      const RD = ROUTE_DATA[C.id], label = left + (C.loop ? ' m to the bottom' : this.mode === 'drill' ? ' m to the Academy' : RD && RD.dropLabel ? RD.dropLabel : cargoView(C.cargo).dropLabel);
      ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(255,246,229,0.9)'; ctx.strokeText(label, Wd / 2, by + u * 1.45);
      ctx.fillStyle = 'rgba(45,42,50,0.9)'; ctx.fillText(label, Wd / 2, by + u * 1.45);
      const rw = u * 9.2, rx = Wd - pad - rw;
      panel(rx, pad, rw, u * 3.6);
      const cond = W.cargo.amount;
      cargoView(W.cargo.kind).hudIcon(this, ctx, rx + u * 1.5, pad, u, cond / 100);
      ctx.textAlign = 'left'; ctx.fillStyle = cond < 30 ? COL.coral : COL.ink;
      ctx.font = '900 ' + (u * 1.45).toFixed(1) + 'px ' + FONT_DISPLAY;
      ctx.fillText(Math.round(cond) + '%', rx + u * 3.0, pad + u * 1.2);
      ctx.fillStyle = '#2f7d4e'; ctx.font = '800 ' + (u * 0.95).toFixed(1) + 'px ' + FONT_MONO;
      ctx.fillText(this.mode === 'drill' ? 'UNPAID' : this.mode === 'free' ? 'AIR ' + this.freeStats.bestAir.toFixed(1) + ' s' : 'TIP ' + fmtMoney(W.score.tip(cond)), rx + u * 3.0, pad + u * 2.6);
      let iy = pad + u * 4.1;
      const badge = (label, col, frac) => {
        ctx.fillStyle = 'rgba(45,42,50,0.88)'; rrect(ctx, rx, iy, rw, u * 1.5, u * 0.75); ctx.fill();
        if (frac !== undefined) { ctx.fillStyle = col; rrect(ctx, rx + u * 0.25, iy + u * 1.1, (rw - u * 0.5) * clamp(frac, 0, 1), u * 0.22, u * 0.11); ctx.fill(); }
        ctx.fillStyle = col; ctx.beginPath(); ctx.arc(rx + u * 0.85, iy + u * 0.62, u * 0.38, 0, TAU); ctx.fill();
        ctx.fillStyle = COL.cream; ctx.font = '900 ' + (u * 0.72).toFixed(1) + 'px ' + FONT_MONO; ctx.textAlign = 'left'; ctx.fillText(label, rx + u * 1.5, iy + u * 0.64);
        iy += u * 1.8;
      };
      if (W.cargo.shield) badge('BUBBLE WRAP', '#cfe6f2');
      if (W.boostT > 0) badge('ESPRESSO', COL.mustard, W.boostT / 6);
      this.fx.pops.forEach((p, i) => {
        ctx.globalAlpha = 1 - clamp((p.t - (p.life - 0.6)) / 0.6, 0, 1); ctx.textAlign = 'right';
        ctx.font = '900 ' + (u * 0.95).toFixed(1) + 'px ' + FONT_DISPLAY;
        const y = iy + u * 0.5 + i * u * 1.35 - p.t * u * 0.6;
        ctx.lineWidth = 4; ctx.strokeStyle = COL.ink; ctx.strokeText(p.text, Wd - pad, y);
        ctx.fillStyle = p.kind === 'good' ? '#9fe0a8' : p.kind === 'info' ? '#fff6e5' : '#ffb3a5'; ctx.fillText(p.text, Wd - pad, y);
        ctx.globalAlpha = 1;
      });
      const sp = {}, warn = (wx, wy, d) => { // off-screen hazard arrows
        R.toScreen(this.cam, wx, wy, sp);
        if (!(d > 0 && d < 60 && sp.x > Wd - 10 && W.state === 'riding')) return;
        const y = clamp(sp.y, u * 8, R.H - u * 3), pulse = 1 + Math.sin(this.time * 10) * 0.08;
        ctx.save(); ctx.translate(Wd - u * 1.8, y); ctx.scale(pulse, pulse);
        ctx.fillStyle = COL.coral; ctx.beginPath(); ctx.moveTo(u * 1.2, 0); ctx.lineTo(-u * 0.5, -u * 1.1); ctx.lineTo(-u * 0.5, u * 1.1); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = COL.ink; ctx.lineWidth = 2; ctx.stroke();
        ctx.fillStyle = COL.cream; ctx.font = '900 ' + (u * 1.1).toFixed(1) + 'px ' + FONT_DISPLAY; ctx.textAlign = 'center'; ctx.fillText('!', 0, u * 0.05);
        ctx.restore();
        ctx.fillStyle = COL.ink; ctx.font = '800 ' + (u * 0.7).toFixed(1) + 'px ' + FONT_MONO; ctx.textAlign = 'right';
        ctx.fillText(Math.round(d) + ' m', Wd - u * 3.1, y);
      };
      for (const car of W.obstacles.cars) warn(car.x, car.roofY, car.x - W.bike.x);
      for (const cc of W.obstacles.crossers) if (cc.active) warn(cc.cx, cc.y + 1.5, cc.x0 - W.bike.x);
    }
    drawFx(W) {
      const R = this.R, ctx = R.ctx, Wd = R.W, H = R.H, f = this.fx, u = clamp(Math.min(Wd, H) / 46, 11, 18), p = {};
      if (f.bubble) {
        const a = this.anchorFor(f.bubble.who || {}, this.anchor);
        R.toScreen(this.cam, a.x, a.y, p);
        let avoid = null;
        if (f.bubble.who && f.bubble.who.kind !== 'rider') {
          const b = W.bike, q0 = R.toScreen(this.cam, b.x - 1.1, b.y + 1.4, {}), q1 = R.toScreen(this.cam, b.x + 1.2, b.y - 1.0, {});
          avoid = { x0: q0.x, y0: q0.y, x1: q1.x, y1: q1.y };
        }
        const s = Math.min(1, f.bubble.t / 0.12);
        ctx.save(); ctx.globalAlpha = clamp((f.bubble.dur - f.bubble.t) / 0.25, 0, 1);
        ctx.translate(p.x, p.y); ctx.scale(0.7 + 0.3 * s, 0.7 + 0.3 * s); ctx.translate(-p.x, -p.y);
        this.bubbleAt(p.x, p.y, f.bubble.line.text, null, avoid);
        ctx.restore();
      }
      if (f.text) {
        const cu = W.course.customer, dur = f.text.dur, slide = Math.min(1, f.text.t / 0.25) * clamp((dur - f.text.t) / 0.25, 0, 1);
        const w = Math.min(340, Wd * 0.7), x = Wd - u * 0.9 - w * slide + (1 - slide) * 20, y = u * 5.6 + (W.cargo.shield ? u * 1.8 : 0) + (W.boostT > 0 ? u * 1.8 : 0), h = u * 4.6;
        ctx.fillStyle = 'rgba(45,42,50,0.96)'; rrect(ctx, x, y, w, h, 14); ctx.fill();
        drawAvatarInline(ctx, x + u * 1.6, y + u * 1.5, u * 1.05, cu.avatar);
        ctx.fillStyle = COL.cream; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
        ctx.font = '800 ' + (u * 0.8).toFixed(1) + 'px ' + FONT_BODY; ctx.fillText(cu.name + ' (' + (cu.tag || 'customer') + ') · now', x + u * 3.0, y + u * 1.2);
        ctx.font = '700 ' + (u * 0.88).toFixed(1) + 'px ' + FONT_BODY;
        wrapText(ctx, f.text.line.text, x + u * 0.9, y + u * 2.55, w - u * 1.8, u * 1.05);
      }
      const b = W.bike, rel = wrapAngle(b.a - Math.atan(W.terrain.slope(b.x)));
      if (W.state === 'riding' && !b.grounded && b.airTime > 0.25 && Math.abs(rel) > LEVEL_WARN) { // tilted in the air: warn before the landing
        const txt = 'LEVEL OUT!  ' + controlKeys(['leanBack', 'leanFwd'], this.input.device).join(' '), pulse = 0.85 + Math.sin(this.time * 14) * 0.15;
        ctx.font = '900 ' + (u * 1.1).toFixed(1) + 'px ' + FONT_BODY; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        const tw = ctx.measureText(txt).width + u * 2;
        ctx.globalAlpha = pulse; ctx.fillStyle = COL.coral; rrect(ctx, Wd / 2 - tw / 2, H * 0.2, tw, u * 2.2, u * 1.1); ctx.fill();
        ctx.fillStyle = COL.cream; ctx.fillText(txt, Wd / 2, H * 0.2 + u * 1.1); ctx.globalAlpha = 1;
      }
      if (f.hint) {
        const dur = f.hint.id === 'pedal' || f.hint.id === 'cake' ? 6 : 5;
        ctx.globalAlpha = clamp(f.hint.t / 0.2, 0, 1) * clamp((dur - f.hint.t) / 0.4, 0, 1);
        ctx.font = '900 ' + (u * 0.85).toFixed(1) + 'px ' + FONT_MONO;
        const keyW = (k) => Math.max(u * 1.9, ctx.measureText(k).width + u * 1.1);
        const keysW = f.hint.keys.reduce((s2, k) => s2 + keyW(k) + u * 0.4, 0);
        ctx.font = '800 ' + (u * 1.0).toFixed(1) + 'px ' + FONT_BODY;
        const tw = ctx.measureText(f.hint.text).width, w = keysW + tw + u * 2, x = Wd / 2 - w / 2, y = H - u * 4.4;
        ctx.fillStyle = 'rgba(45,42,50,0.88)'; rrect(ctx, x, y, w, u * 2.4, u * 1.2); ctx.fill();
        let kx = x + u;
        ctx.textBaseline = 'middle';
        for (const k of f.hint.keys) {
          ctx.font = '900 ' + (u * 0.85).toFixed(1) + 'px ' + FONT_MONO;
          const kw = keyW(k);
          ctx.fillStyle = COL.cream; rrect(ctx, kx, y + u * 0.45, kw, u * 1.5, u * 0.35); ctx.fill();
          ctx.fillStyle = COL.ink; ctx.textAlign = 'center'; ctx.fillText(k, kx + kw / 2, y + u * 1.2);
          kx += kw + u * 0.4;
        }
        ctx.font = '800 ' + (u * 1.0).toFixed(1) + 'px ' + FONT_BODY; ctx.fillStyle = COL.cream; ctx.textAlign = 'left';
        ctx.fillText(f.hint.text, kx + u * 0.2, y + u * 1.2);
        ctx.globalAlpha = 1;
      }
      if (f.caption) {
        const t = f.caption.t, s = t < 0.18 ? 1.3 - (t / 0.18) * 0.3 : 1, a = clamp((3 - t) / 0.3, 0, 1);
        const fs = clamp(Wd / 17, 26, 62);
        ctx.save(); ctx.globalAlpha = a; ctx.translate(Wd / 2, H * 0.33); ctx.rotate(-0.035); ctx.scale(s, s);
        ctx.font = '900 ' + fs.toFixed(1) + 'px ' + FONT_DISPLAY; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        const txt = f.caption.text, tw = ctx.measureText(txt).width, sc = tw > Wd * 0.9 ? (Wd * 0.9) / tw : 1;
        ctx.scale(sc, sc);
        ctx.lineJoin = 'round'; ctx.lineWidth = fs * 0.2; ctx.strokeStyle = COL.ink; ctx.strokeText(txt, 0, fs * 0.08);
        ctx.fillStyle = COL.coral; ctx.fillText(txt, 0, fs * 0.08);
        ctx.lineWidth = fs * 0.12; ctx.strokeText(txt, 0, 0); ctx.fillStyle = COL.cream; ctx.fillText(txt, 0, 0);
        ctx.restore();
      }
      if (f.sub) {
        ctx.globalAlpha = clamp(f.sub.t / 0.2, 0, 1) * clamp((3.2 - f.sub.t) / 0.4, 0, 1);
        ctx.font = '800 ' + clamp(Wd / 55, 14, 22).toFixed(1) + 'px ' + FONT_BODY;
        const tw = ctx.measureText(f.sub.text).width + 34;
        ctx.fillStyle = 'rgba(45,42,50,0.9)'; rrect(ctx, Wd / 2 - tw / 2, H * 0.42, tw, 44, 22); ctx.fill();
        ctx.fillStyle = COL.cream; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(f.sub.text, Wd / 2, H * 0.42 + 22);
        ctx.globalAlpha = 1;
      }
      if (f.stamp >= 0 && this.state === 'delivered') {
        const t = f.stamp, s = t < 0.15 ? 2 - t / 0.15 : 1, fs = clamp(Wd / 15, 30, 70);
        ctx.save(); ctx.translate(Wd / 2, H * 0.2); ctx.rotate(-0.12); ctx.scale(s, s); ctx.globalAlpha = clamp(t / 0.1, 0, 1) * clamp((1.25 - t) / 0.25, 0, 1);
        ctx.font = '900 ' + fs.toFixed(1) + 'px ' + FONT_DISPLAY; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        const word = this.mode === 'drill' ? 'DRILL DONE!' : 'DELIVERED!', tw = ctx.measureText(word).width;
        ctx.strokeStyle = COL.coral; ctx.lineWidth = fs * 0.09; rrect(ctx, -tw / 2 - fs * 0.35, -fs * 0.7, tw + fs * 0.7, fs * 1.4, fs * 0.2); ctx.stroke();
        ctx.fillStyle = COL.coral; ctx.fillText(word, 0, fs * 0.04);
        ctx.restore();
      }
      if (this.mode === 'free' && this.run && this.run.overlay) this.drawOverlay(W, u);
      if (f.toast) {
        ctx.font = '800 15px ' + FONT_BODY; const tw = ctx.measureText(f.toast.text).width + 28;
        ctx.fillStyle = 'rgba(45,42,50,0.9)'; rrect(ctx, Wd / 2 - tw / 2, H - u * 7.4, tw, 34, 17); ctx.fill();
        ctx.fillStyle = COL.cream; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(f.toast.text, Wd / 2, H - u * 7.4 + 17);
      }
      if (f.flash > 0) { ctx.fillStyle = 'rgba(255,246,229,' + (f.flash * 0.85).toFixed(3) + ')'; ctx.fillRect(0, 0, Wd, H); }
    }
    // Free Ride physics overlay: speed, air and a slosh (or wobble) meter under the HUD, and where an airborne bike will land.
    drawOverlay(W, u) {
      const R = this.R, ctx = R.ctx, b = W.bike, c = W.cargo, x = this.input.touchMode ? u * 5.2 : u * 0.9, y = u * 5.0, w = u * 13.5, h = u * 3.4;
      const sp = Math.hypot(b.vx, b.vy), meter = cargoView(c.kind).meter(c), slosh = meter.value;
      ctx.fillStyle = 'rgba(45,42,50,0.82)'; rrect(ctx, x, y, w, h, u * 0.6); ctx.fill();
      ctx.fillStyle = COL.cream; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.font = '800 ' + (u * 0.78).toFixed(1) + 'px ' + FONT_MONO;
      ctx.fillText('SPEED ' + sp.toFixed(1) + ' m/s · AIR ' + (b.grounded ? '0.00' : b.airTime.toFixed(2)) + ' s', x + u * 0.6, y + u * 0.8);
      ctx.fillText(meter.label + Math.round(slosh * 100) + '%', x + u * 0.6, y + u * 1.75);
      ctx.fillStyle = 'rgba(255,246,229,0.25)'; rrect(ctx, x + u * 0.6, y + u * 2.35, w - u * 1.2, u * 0.5, u * 0.25); ctx.fill();
      ctx.fillStyle = slosh > 1 ? COL.coral : slosh > 0.7 ? COL.mustard : '#9fe0a8'; rrect(ctx, x + u * 0.6, y + u * 2.35, (w - u * 1.2) * clamp(slosh, 0, 1), u * 0.5, u * 0.25); ctx.fill();
      if (b.grounded || W.state !== 'riding') return;
      const L = b.predictLanding(W, this.landing || (this.landing = { x: 0, a: 0, t: 0 })), gy = W.terrain.height(L.x), ok = Math.abs(wrapAngle(b.a - L.a)) < 0.3, p = {}, q = {};
      R.toScreen(this.cam, L.x - Math.cos(L.a) * 0.9, gy - Math.sin(L.a) * 0.9, p); R.toScreen(this.cam, L.x + Math.cos(L.a) * 0.9, gy + Math.sin(L.a) * 0.9, q);
      ctx.strokeStyle = ok ? '#2f7d4e' : COL.coral; ctx.lineWidth = 4; ctx.lineCap = 'round'; line(ctx, p.x, p.y, q.x, q.y); ctx.lineCap = 'butt';
      ctx.fillStyle = ok ? '#2f7d4e' : COL.coral; ctx.font = '900 ' + (u * 0.75).toFixed(1) + 'px ' + FONT_MONO; ctx.textAlign = 'center';
      ctx.fillText(ok ? 'LEVEL' : 'TILTED ' + Math.round(Math.abs(wrapAngle(b.a - L.a)) * 57.3) + '°', (p.x + q.x) / 2, Math.min(p.y, q.y) - u * 0.9);
    }
    drawDebug(W) {
      const ctx = this.R.ctx, b = W.bike, c = W.cargo;
      const lines = [
        'fps ' + this.fps.toFixed(0) + '  state ' + W.state + '  t ' + W.t.toFixed(2),
        'x ' + b.x.toFixed(1) + '  v ' + Math.hypot(b.vx, b.vy).toFixed(2) + ' m/s  slope ' + (Math.atan(W.terrain.slope(b.x)) * 57.3).toFixed(1) + '°',
        'pitch ' + (b.a * 57.3).toFixed(1) + '°  w ' + b.w.toFixed(2) + '  air ' + b.airTime.toFixed(2),
        'contact R/F ' + (b.wheels[0].contact ? 1 : 0) + '/' + (b.wheels[1].contact ? 1 : 0) + '  comp ' + b.wheels[0].comp.toFixed(3) + '/' + b.wheels[1].comp.toFixed(3),
        cargoView(c.kind).debug(c),
      ];
      ctx.font = '600 12px ' + FONT_MONO; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(8, this.R.H - 18 * lines.length - 16, 430, 18 * lines.length + 8);
      ctx.fillStyle = '#c8f7c5';
      lines.forEach((l, i) => ctx.fillText(l, 14, this.R.H - 18 * lines.length - 12 + i * 18));
    }
  }

  function boot() {
    try { HILL.game = new Game(); }
    catch (err) {
      console.error(err);
      const d = document.createElement('div');
      d.style.cssText = 'position:fixed;inset:0;display:grid;place-items:center;background:#fff6e5;font:700 18px system-ui;color:#2d2a32;z-index:9;padding:20px;text-align:center';
      d.textContent = 'HILLARIOUS hit a pothole while loading: ' + (err && err.message ? err.message : err);
      document.body.appendChild(d);
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})(typeof window !== 'undefined' ? window : globalThis);
