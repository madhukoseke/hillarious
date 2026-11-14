  /* =====================================================================
   * PRESENTATION LAYER (browser only)
   * ===================================================================*/

  /* ---------- 13. INPUT (keyboard, touch, gamepad) ---------- */
  const KEYMAP = {
    ArrowUp: 'pedal', KeyW: 'pedal', ArrowDown: 'brake', KeyS: 'brake', ArrowLeft: 'leanBack', KeyA: 'leanBack',
    ArrowRight: 'leanFwd', KeyD: 'leanFwd', Space: 'jump', KeyR: 'restart', KeyM: 'mute', KeyP: 'pause',
    Escape: 'pause', Enter: 'confirm', NumpadEnter: 'confirm',
  };
  const HOLD_KEYS = ['pedal', 'brake', 'leanBack', 'leanFwd', 'jump'];
  // How to Play rows: [actions, bold lead, description]. Keycaps come from CONTROL_LABELS for the current device.
  const HOWTO_ROWS = [
    [['pedal'], 'Pedal.', 'More speed, more drama.'],
    [['brake'], 'Brake.', 'Hard stops surge the latte forward.'],
    [['leanBack'], 'Lean back.', 'Wheelie, or rotate backward in the air.'],
    [['leanFwd'], 'Lean forward.', 'Nose down, or rotate forward in the air.'],
    [['hop'], 'Hop.', 'Tap for small, hold for big. Press just before landing to hop again.'],
  ];
  const KEY_ALTS = { pedal: ['W'], brake: ['S'], leanBack: ['A'], leanFwd: ['D'] }; // keyboard only, shown in How to Play
  const LEVEL_WARN = 0.55; // radians off the slope while airborne before "LEVEL OUT!" shows (about 31°; tune after playtests)
  const FOG_LABELS = { pothole: 'POTHOLE', stairs: 'STEPS', lip: 'LIP', 'big-lip': 'BIG LIP', car: 'PARKED CAR', ramp: 'RAMP', cablecar: 'CABLE CAR', maybemo: 'ROBOT CAR', cone: 'CONES' }; // fog warning tags (F-40)
  class InputManager {
    constructor() {
      this.down = {}; this.touchDown = {}; this.padDown = {}; this.padPrev = {}; this.jumpQueued = false; this.actions = [];
      this.inp = { pedal: false, brake: false, leanBack: false, leanFwd: false, jumpHeld: false, jumpPressed: false };
      this.touchMode = false; this.padName = '';
      this.device = 'keyboard'; this.onDevice = null; // last input used: 'keyboard' | 'touch' | 'gamepad'
      root.addEventListener('keydown', (e) => this.onKey(e, true), { passive: false });
      root.addEventListener('keyup', (e) => this.onKey(e, false), { passive: false });
      this.pad = document.getElementById('touch');
      this.buttons = this.pad ? Array.from(this.pad.querySelectorAll('[data-key]')) : [];
      root.addEventListener('touchstart', () => this.enableTouch(), { passive: true, capture: true });
      if (this.pad) for (const type of ['touchstart', 'touchmove', 'touchend', 'touchcancel']) this.pad.addEventListener(type, (e) => this.onTouches(e), { passive: false });
    }
    enableTouch() { if (!this.touchMode) { this.touchMode = true; document.body.classList.add('touch'); } this.setDevice('touch'); }
    setDevice(d) { if (this.device !== d) { this.device = d; if (this.onDevice) this.onDevice(d); } }
    onKey(e, isDown) {
      if (e.target && e.target.closest && e.target.closest('input:not([type="range"]), textarea')) return; // let the name fields take typing; sliders go through the game
      const a = KEYMAP[e.code] || (e.key === ' ' ? 'jump' : null);
      if (!a) return;
      if (isDown) this.setDevice('keyboard');
      const el = document.activeElement;
      if ((a === 'confirm' || a === 'jump') && el && el.tagName === 'BUTTON') return; // let the focused button click
      e.preventDefault();
      if (isDown) {
        this.down[a] = true;
        if (!e.repeat) { if (a === 'jump') this.jumpQueued = true; this.actions.push(a); }
      } else this.down[a] = false;
    }
    // Every active finger is hit-tested on every touch event, so sliding between buttons just works.
    onTouches(e) {
      e.preventDefault();
      const now = {};
      for (let i = 0; i < e.touches.length; i++) {
        const t = e.touches[i], el = document.elementFromPoint(t.clientX, t.clientY), k = el && el.closest ? el.closest('[data-key]') : null;
        if (k && this.pad.contains(k)) now[k.dataset.key] = true;
      }
      for (const key of HOLD_KEYS.concat(['pause'])) {
        const is = !!now[key];
        if (is && !this.touchDown[key]) { if (key === 'jump') this.jumpQueued = true; if (key === 'pause') this.actions.push('pause'); }
        this.touchDown[key] = is;
      }
      for (const b of this.buttons) b.classList.toggle('down', !!this.touchDown[b.dataset.key]);
    }
    // Standard-mapping gamepads: RT / d-pad up pedal, LT / B / d-pad down brake, stick or d-pad lean, A hop + confirm,
    // Start pause, Back restart, Y mute.
    pollPad() {
      let gp = null;
      try {
        const pads = root.navigator && root.navigator.getGamepads ? root.navigator.getGamepads() : null;
        if (pads) for (let i = 0; i < pads.length; i++) if (pads[i] && pads[i].connected !== false) { gp = pads[i]; break; }
      } catch (e) { gp = null; }
      const g = this.padDown, prev = this.padPrev;
      if (!gp) { for (const k of HOLD_KEYS) g[k] = false; this.padName = ''; return; }
      this.padName = gp.id || 'gamepad';
      const b = (i) => { const x = gp.buttons && gp.buttons[i]; return !!(x && (x.pressed || x.value > 0.35)); };
      const ax = (gp.axes && gp.axes[0]) || 0, ay = (gp.axes && gp.axes[1]) || 0;
      if ((gp.buttons && Array.from(gp.buttons).some((x) => x && x.pressed)) || Math.abs(ax) > 0.4 || Math.abs(ay) > 0.55) this.setDevice('gamepad');
      g.pedal = b(7) || b(12) || ay < -0.55;
      g.brake = b(6) || b(1) || b(13) || ay > 0.55;
      g.leanBack = b(14) || ax < -0.4;
      g.leanFwd = b(15) || ax > 0.4;
      g.jump = b(0);
      if (b(0) && !prev[0]) this.jumpQueued = true;
      for (const [i, action] of [[0, 'confirm'], [9, 'pause'], [8, 'restart'], [3, 'mute']]) { const on = b(i); if (on && !prev[i]) this.actions.push(action); prev[i] = on; }
      // Menu focus moves on the d-pad or stick, once per push.
      for (const [action, on] of [['navUp', b(12) || ay < -0.55], ['navDown', b(13) || ay > 0.55], ['navLeft', b(14) || ax < -0.4], ['navRight', b(15) || ax > 0.4]]) {
        if (on && !prev[action]) this.actions.push(action);
        prev[action] = on;
      }
    }
    sample() {
      const d = this.down, t = this.touchDown, g = this.padDown, i = this.inp;
      i.pedal = !!(d.pedal || t.pedal || g.pedal); i.brake = !!(d.brake || t.brake || g.brake);
      i.leanBack = !!(d.leanBack || t.leanBack || g.leanBack); i.leanFwd = !!(d.leanFwd || t.leanFwd || g.leanFwd);
      i.jumpHeld = !!(d.jump || t.jump || g.jump); i.jumpPressed = this.jumpQueued; this.jumpQueued = false;
      return i;
    }
    showTouch(on) { if (this.pad) this.pad.classList.toggle('on', !!on); }
    takeActions() { const a = this.actions; this.actions = []; return a; }
    clear() {
      this.down = {}; this.touchDown = {}; this.jumpQueued = false; this.actions = [];
      for (const b of this.buttons) b.classList.remove('down');
    }
  }

  /* ---------- 14. AUDIO (procedural Web Audio) ---------- */
  class AudioManager {
    constructor(store) {
      this.store = store; this.ctx = null; this.muted = !!store.get('muted', false);
      this.loops = null; this.last = {}; this.rng = mulberry32(99);
      const vol = (k) => { const v = Number(store.get('vol:' + k, 1)); return Number.isFinite(v) ? clamp(v, 0, 1) : 1; };
      this.vol = { music: vol('music'), sfx: vol('sfx') }; // 0..1, scales the channel levels below
    }
    level(kind) { return kind === 'music' ? 0.26 * this.vol.music : 0.85 * this.vol.sfx; }
    setVolume(kind, v) {
      if (!(kind in this.vol)) return;
      this.vol[kind] = clamp(Number(v) || 0, 0, 1);
      this.store.set('vol:' + kind, this.vol[kind]);
      const node = kind === 'music' ? this.mus : this.sfx;
      if (this.ctx && node) node.gain.setTargetAtTime(this.level(kind), this.ctx.currentTime, 0.03);
    }
    unlock() {
      if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {}); return; }
      const AC = root.AudioContext || root.webkitAudioContext;
      if (!AC) return;
      try { this.ctx = new AC(); } catch (e) { this.ctx = null; return; }
      const c = this.ctx;
      this.master = c.createGain(); this.master.gain.value = this.muted ? 0 : 0.9;
      const comp = c.createDynamicsCompressor();
      comp.threshold.value = -14; comp.knee.value = 10; comp.ratio.value = 4; comp.attack.value = 0.004; comp.release.value = 0.2;
      this.master.connect(comp); comp.connect(c.destination);
      this.sfx = c.createGain(); this.sfx.gain.value = this.level('sfx'); this.sfx.connect(this.master);
      this.mus = c.createGain(); this.mus.gain.value = this.level('music'); this.mus.connect(this.master);
      this.seq = { next: 0, step: 0, mode: null };
      this.noise = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      this.startLoops();
    }
    toggleMute() {
      this.muted = !this.muted;
      this.store.set('muted', this.muted);
      if (this.ctx) this.master.gain.setTargetAtTime(this.muted ? 0 : 0.9, this.ctx.currentTime, 0.03);
      return this.muted;
    }
    startLoops() {
      const c = this.ctx;
      const mk = (type, freq, q) => {
        const src = c.createBufferSource(); src.buffer = this.noise; src.loop = true;
        const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
        const g = c.createGain(); g.gain.value = 0;
        src.connect(f); f.connect(g); g.connect(this.sfx); src.start();
        return { f, g };
      };
      const roll = mk('lowpass', 300, 0.7), wind = mk('bandpass', 600, 0.6);
      const osc = c.createOscillator(); osc.type = 'sawtooth'; osc.frequency.value = 2300;
      const lfo = c.createOscillator(); lfo.frequency.value = 7;
      const lg = c.createGain(); lg.gain.value = 60; lfo.connect(lg); lg.connect(osc.frequency);
      const bf = c.createBiquadFilter(); bf.type = 'bandpass'; bf.frequency.value = 2800; bf.Q.value = 7;
      const sg = c.createGain(); sg.gain.value = 0;
      osc.connect(bf); bf.connect(sg); sg.connect(this.sfx); osc.start(); lfo.start();
      this.loops = { roll, wind, squeal: sg };
    }
    update(world, active) {
      if (!this.ctx || !this.loops) return;
      const now = this.ctx.currentTime, L = this.loops;
      let roll = 0, rollF = 300, wind = 0, windF = 500, sq = 0;
      if (active && world) {
        const b = world.bike, sp = Math.hypot(b.vx, b.vy);
        if (b.grounded && !b.crashed) { roll = Math.min(0.22, sp * 0.016); rollF = 220 + sp * 45; }
        wind = Math.min(0.15, (sp / 22) * (sp / 22) * 0.2); windF = 350 + sp * 40;
        if (b.brakeIn && b.grounded && sp > 2 && !b.crashed) sq = Math.min(0.05, 0.012 + sp * 0.0028);
      }
      L.roll.g.gain.setTargetAtTime(roll, now, 0.06); L.roll.f.frequency.setTargetAtTime(rollF, now, 0.08);
      L.wind.g.gain.setTargetAtTime(wind, now, 0.1); L.wind.f.frequency.setTargetAtTime(windF, now, 0.1);
      L.squeal.gain.setTargetAtTime(sq, now, sq > 0 ? 0.02 : 0.06);
    }
    env(g, t0, peak, dur) {
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.linearRampToValueAtTime(peak, t0 + 0.006);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.006 + dur);
    }
    osc(type, f0, f1, t0, dur, peak) {
      const c = this.ctx, o = c.createOscillator(), g = c.createGain();
      o.type = type; o.frequency.setValueAtTime(f0, t0);
      if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
      this.env(g, t0, peak, dur); o.connect(g); g.connect(this.sfx);
      o.start(t0); o.stop(t0 + dur + 0.05);
      return o;
    }
    noiseHit(t0, dur, peak, type, f0, f1, q) {
      const c = this.ctx, s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
      s.buffer = this.noise; f.type = type; f.Q.value = q || 1;
      f.frequency.setValueAtTime(f0, t0);
      if (f1) f.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
      this.env(g, t0, peak, dur); s.connect(f); f.connect(g); g.connect(this.sfx);
      s.start(t0, this.rng() * 1.5); s.stop(t0 + dur + 0.05);
    }
    vibrato(o, t0, rate, depth, dur) {
      const c = this.ctx, l = c.createOscillator(), g = c.createGain();
      l.frequency.value = rate; g.gain.value = depth; l.connect(g); g.connect(o.frequency);
      l.start(t0); l.stop(t0 + dur + 0.05);
    }
    // Tiny music sequencer: a laid-back title loop and a bouncy ride loop (F - Dm - Bb - C), scheduled just ahead.
    setMusic(mode) { this.musicMode = mode; if (this.airDucked) { this.airDucked = false; if (this.ctx && this.mus) this.mus.gain.setTargetAtTime(this.level('music'), this.ctx.currentTime, 0.15); } }
    // Music dips while airborne (F-38); a crash's own duck (below) wins until it has run its course.
    airDuck(on) {
      if (!this.ctx || !this.mus || on === !!this.airDucked) return;
      const n = this.ctx.currentTime;
      if (n < (this.duckUntil || 0)) return;
      this.airDucked = on;
      this.mus.gain.setTargetAtTime(this.level('music') * (on ? AIR_DUCK.level : 1), n, on ? 0.08 : 0.15);
    }
    duck(t, level) { if (this.ctx && this.mus) { const n = this.ctx.currentTime; this.duckUntil = n + t; this.airDucked = false; this.mus.gain.cancelScheduledValues(n); this.mus.gain.setTargetAtTime((level === undefined ? 0.07 : level) * this.vol.music, n, 0.04); this.mus.gain.setTargetAtTime(this.level('music'), n + t, 0.4); } }
    tickMusic() {
      if (!this.ctx || this.ctx.state !== 'running' || !this.seq) return;
      const c = this.ctx, q = this.seq, mode = this.musicMode || null, now = c.currentTime;
      if (mode !== q.mode) { q.mode = mode; q.step = 0; q.next = now + 0.06; }
      if (!mode) return;
      const ride = mode === 'ride', dt = 60 / (ride ? 124 : 96) / 4;
      if (q.next < now - 0.2) q.next = now + 0.02;
      const BASS = [87.31, 73.42, 58.27, 65.41], CH = [[349.2, 440, 523.3], [293.7, 349.2, 440], [233.1, 293.7, 349.2], [261.6, 329.6, 392]];
      const MEL = [698.5, 0, 0, 880, 0, 784, 0, 698.5, 0, 0, 587.3, 0, 523.3, 0, 587.3, 0];
      while (q.next < now + 0.18) {
        const t = q.next, st = q.step % 16, bar = Math.floor(q.step / 16) % 4, o = this.mus;
        const tone = (type, f, d, g, dest) => { const x = c.createOscillator(), e = c.createGain(); x.type = type; x.frequency.value = f; e.gain.setValueAtTime(0.0001, t); e.gain.linearRampToValueAtTime(g, t + 0.008); e.gain.exponentialRampToValueAtTime(0.0001, t + d); x.connect(e); e.connect(dest || o); x.start(t); x.stop(t + d + 0.05); };
        if (st === 0 || st === 6 || st === 8 || (ride && st === 14)) tone('triangle', BASS[bar] * (st === 6 ? 1.5 : 1), dt * 2.2, 0.42);
        if (st === 4 || st === 12 || (ride && st === 10)) for (const f of CH[bar]) tone('square', f, dt * 0.9, 0.028);
        if (ride && (st === 0 || st === 8)) { const x = c.createOscillator(), e = c.createGain(); x.frequency.setValueAtTime(140, t); x.frequency.exponentialRampToValueAtTime(45, t + 0.12); e.gain.setValueAtTime(0.5, t); e.gain.exponentialRampToValueAtTime(0.0001, t + 0.16); x.connect(e); e.connect(o); x.start(t); x.stop(t + 0.2); }
        if (st % (ride ? 2 : 4) === 2) { const sN = c.createBufferSource(), f = c.createBiquadFilter(), e = c.createGain(); sN.buffer = this.noise; f.type = 'highpass'; f.frequency.value = 7000; e.gain.setValueAtTime(0.04, t); e.gain.exponentialRampToValueAtTime(0.0001, t + 0.04); sN.connect(f); f.connect(e); e.connect(o); sN.start(t, Math.random()); sN.stop(t + 0.06); }
        if (ride && bar % 2 === 1 && MEL[st]) tone('triangle', MEL[st] * (bar === 3 ? 0.89 : 1), dt * 1.6, 0.07);
        if (!ride && st === 0 && bar === 0) tone('sine', 1046.5, 0.5, 0.05);
        q.next += dt; q.step++;
      }
    }
    play(name, k) {
      if (!this.ctx || this.ctx.state !== 'running') return;
      const MIN = { land: 0.08, splash: 0.12, slosh: 0.22, tick: 0.05, coin: 0.06, blip: 0.1, cone: 0.06, ding: 0.5, mmbeep: 0.4, pop: 0.1, decor: 0.15, boing: 0.4, glint: 0.12, fogbeep: 0.3, bark: 0.6, shutter: 0.5, wobble: 0.7 };
      const now = this.ctx.currentTime;
      if (MIN[name] && now - (this.last[name] || -9) < MIN[name]) return;
      this.last[name] = now;
      const r = this.rng, v = (x) => x * (0.94 + r() * 0.12), t = now + 0.005;
      k = k === undefined ? 1 : k;
      switch (name) {
        case 'hop': this.noiseHit(t, 0.22, 0.26, 'bandpass', v(450), v(1800), 1.4); this.osc('sine', v(230), v(460), t, 0.09, 0.05); break;
        case 'land':
          this.osc('sine', v(150), 45, t, 0.18, 0.5 * k);
          this.noiseHit(t, 0.08, 0.3 * k, 'lowpass', 1200, 300, 0.7);
          if (k > 0.6) this.osc('triangle', v(92), 60, t, 0.12, 0.18 * k);
          break;
        case 'splash':
          this.noiseHit(t, 0.3, 0.22, 'bandpass', v(1400), 600, 1.8);
          for (let i = 0; i < 4; i++) this.osc('sine', 700 + r() * 900, 300 + r() * 400, t + i * 0.045 + r() * 0.02, 0.05, 0.08);
          break;
        case 'slosh': this.noiseHit(t, 0.15, 0.08, 'bandpass', v(900), 500, 2); this.osc('sine', 600 + r() * 500, 380, t + 0.02, 0.05, 0.05); break;
        case 'crash': {
          this.noiseHit(t, 0.45, 0.6, 'lowpass', 2000, 200, 0.8);
          this.osc('sine', 110, 35, t, 0.35, 0.55);
          const o = this.osc('sine', 1500, 260, t + 0.1, 0.8, 0.12);
          this.vibrato(o, t + 0.1, 7, 35, 0.8);
          break;
        }
        case 'bonk': { const o = this.osc('sine', v(520), 250, t, 0.32, 0.25); this.vibrato(o, t, 18, 40, 0.32); break; }
        case 'cone': this.noiseHit(t, 0.07, 0.35, 'bandpass', v(900), 600, 3); this.osc('triangle', v(240), 140, t, 0.11, 0.18); break;
        case 'clunk': this.osc('sine', v(85), 50, t, 0.14, 0.45); this.noiseHit(t, 0.06, 0.25, 'lowpass', 600, 200, 1); break;
        case 'coin': this.osc('square', 988, 988, t, 0.07, 0.05); this.osc('square', 1319, 1319, t + 0.07, 0.12, 0.05); break;
        case 'blip': this.osc('sine', v(600), v(900), t, 0.06, 0.07); break;
        case 'whoosh': this.noiseHit(t, 0.35, 0.18, 'bandpass', 300, 1500, 0.9); break;
        case 'tick': this.noiseHit(t, 0.018, 0.035, 'highpass', 3000, 0, 0.7); break;
        case 'ui': this.osc('triangle', 1100, 900, t, 0.04, 0.06); break;
        case 'bell': for (let i = 0; i < 2; i++) { this.osc('sine', 2093, 2093, t + i * 0.22, 0.55, 0.12); this.osc('sine', 3140, 3140, t + i * 0.22, 0.35, 0.05); } break;
        case 'ding': // cable car bell: two bright inharmonic strikes
          for (let i = 0; i < 2; i++) { const t0 = t + i * 0.17; this.osc('sine', 1180, 1180, t0, 0.9, 0.16); this.osc('sine', 3257, 3257, t0, 0.4, 0.06); this.osc('sine', 6372, 6372, t0, 0.15, 0.03); }
          break;
        case 'mmbeep': this.osc('square', 880, 880, t, 0.07, 0.04); this.osc('square', 660, 660, t + 0.11, 0.09, 0.04); break;
        case 'mmthink': for (let i = 0; i < 3; i++) this.osc('sine', 700 + i * 160, 760 + i * 160, t + i * 0.09, 0.05, 0.05); break;
        case 'pop': this.noiseHit(t, 0.03, 0.4, 'highpass', 1800, 0, 0.8); this.noiseHit(t + 0.06, 0.025, 0.25, 'highpass', 2200, 0, 0.8); break;
        case 'powerup': [523.3, 659.3, 784, 1046.5].forEach((f, i) => this.osc('triangle', f, f, t + i * 0.06, 0.12, 0.12)); break;
        case 'espresso': this.osc('sawtooth', 220, 1400, t, 0.28, 0.06); this.osc('triangle', 784, 1568, t + 0.12, 0.2, 0.08); break;
        case 'boing': { const o = this.osc('sine', 220, 520, t, 0.32, 0.18); this.vibrato(o, t, 14, 40, 0.32); break; } // the disco ball pops back in
        case 'fogbeep': this.osc('sine', 523, 523, t, 0.12, 0.07); this.osc('sine', 392, 392, t + 0.16, 0.16, 0.07); break; // a hazard in the fog
        case 'glint': this.osc('triangle', 2637, 2637, t, 0.08, 0.06); this.osc('triangle', 3520, 3520, t + 0.05, 0.1, 0.04); break; // a mirror tile chips
        case 'wobble': { const o = this.osc('sine', 180, 140, t, 0.45, 0.16); this.vibrato(o, t, 9, 30, 0.45); break; }
        case 'decor': this.osc('sine', v(1500), 500, t, 0.18, 0.08); break;
        case 'bark': for (let i = 0; i < 2; i++) { this.noiseHit(t + i * 0.16, 0.08, 0.3, 'bandpass', 700, 420, 2.5); this.osc('square', v(330), 180, t + i * 0.16, 0.08, 0.05); } break;
        case 'shutter': this.noiseHit(t, 0.02, 0.35, 'highpass', 4000, 0, 1); this.noiseHit(t + 0.07, 0.03, 0.25, 'highpass', 3000, 0, 1); break;
        case 'voice': { const f = 180 + k * 140; for (let i = 0; i < 3; i++) this.osc('triangle', v(f * (1 + 0.18 * Math.sin(i * 2.3))), f * 0.9, t + i * 0.07, 0.06, 0.05); break; }
        case 'trombone': {
          [[293.7, 0.32], [277.2, 0.32], [261.6, 0.32], [246.9, 1.0]].forEach(([f, d], i) => {
            const o = this.osc('sawtooth', f, i === 3 ? f * 0.96 : f, t + i * 0.36, d, 0.07);
            if (i === 3) this.vibrato(o, t + i * 0.36, 6, 6, d);
          });
          break;
        }
        case 'bride': { // Wagner's Bridal Chorus (public domain): "Here comes the bride, all dressed in white"
          const N = [[523.3, 0, 0.4], [698.5, 0.42, 0.3], [698.5, 0.74, 0.1], [698.5, 0.84, 0.75], [523.3, 1.68, 0.4], [784, 2.1, 0.3], [659.3, 2.42, 0.1], [698.5, 2.52, 0.9]];
          for (const [f, at, d] of N) { this.osc('triangle', f, f, t + at, d, 0.13); this.osc('sine', f * 2, f * 2, t + at, d * 0.6, 0.03); }
          break;
        }
        case 'success': {
          const notes = [523.25, 659.25, 783.99, 1046.5];
          notes.forEach((f, i) => { this.osc('triangle', f, f, t + i * 0.1, 0.22, 0.16); this.osc('square', f * 2, f * 2, t + i * 0.1, 0.06, 0.025); });
          [523.25, 659.25, 783.99].forEach((f) => this.osc('triangle', f, f, t + 0.42, 0.6, 0.08));
          break;
        }
        default: break;
      }
    }
  }

