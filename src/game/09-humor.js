  /* =====================================================================
   * 9. HUMOR ENGINE: event-driven dialogue
   * One speech bubble at a time (customer texts use a separate phone channel). Ambient lines
   * wait AMBIENT_GAP s after the last bubble, critical lines (priority >= 3) may interrupt,
   * and nothing repeats within a delivery. `available(speaker)` decides who can talk right now.
   * ===================================================================*/
  const DIALOGUE = [
    // MAYBE-MO: "Self-driving. Self-doubting."
    { id: 'mm-flat', trigger: 'MAYBEMO_ENCOUNTER', speaker: 'car', text: 'I was trained on flat roads.', priority: 3, cooldown: 3, delivery: 2 },
    { id: 'mm-think', trigger: 'MAYBEMO_ENCOUNTER', speaker: 'car', text: 'Vehicle is thinking…', priority: 3, cooldown: 3 },
    { id: 'mm-conf', trigger: 'MAYBEMO_STOPPED', speaker: 'car', text: 'Confidence: 12%.', priority: 3 },
    { id: 'mm-train', trigger: 'MAYBEMO_OVER', speaker: 'car', text: 'New training data acquired.', priority: 4 },
    { id: 'mm-recalc', trigger: 'MAYBEMO_RESUME', speaker: 'car', text: 'Recalculating... emotionally.', priority: 3 },
    { id: 'mm-bonk', trigger: 'MAYBEMO_BONK', speaker: 'car', text: 'Collision detected. Feelings hurt.', priority: 3 },
    { id: 'mm-after', trigger: 'MAYBEMO_HOLD', speaker: 'car', text: 'After you. No, after you. No—', priority: 3 },
    // Karl the Fog (F-40)
    { id: 'karl', trigger: 'FOG_IN', speaker: 'rider', text: 'Karl the Fog has entered the chat.', priority: 3 },
    // Cable car operator
    { id: 'cc-ding', trigger: 'CABLE_CAR_ENCOUNTER', speaker: 'operator', text: 'DING DING! Make way for 1873!', priority: 4 },
    { id: 'cc-tracks', trigger: 'CABLE_CAR_HOLD', speaker: 'operator', text: 'Off the tracks, Speed Racer!', priority: 4 },
    { id: 'cc-horses', trigger: 'CABLE_CAR_CRASH', speaker: 'operator', text: "I've seen better driving from the horses!", priority: 5 },
    { id: 'cc-pension', trigger: 'NEAR_MISS', speaker: 'operator', text: 'That was closer than my pension!', priority: 3 },
    // Pedestrians: big air (the classic first, then personalities)
    { id: 'ped-lane', trigger: 'BIG_JUMP', speaker: 'any-ped', text: "THAT'S NOT A BIKE LANE!", priority: 3 },
    { id: 'tour-pic', trigger: 'BIG_JUMP', speaker: 'tourist', text: 'Honey! Take a picture!', priority: 2 },
    { id: 'dog-wow', trigger: 'BIG_JUMP', speaker: 'dog', text: 'Okay, that was actually impressive.', priority: 2 },
    { id: 'fit-hr', trigger: 'BIG_JUMP', speaker: 'fitness', text: 'Your heart rate has left the chat!', priority: 2 },
    { id: 'tech-ai2', trigger: 'BIG_JUMP', speaker: 'tech', text: 'Is that an AI-powered bicycle?', priority: 2 },
    // Speed
    { id: 'tech-b', trigger: 'PLAYER_FAST', speaker: 'tech', text: 'That looks like a Series B problem!', priority: 2 },
    { id: 'dog-brakes', trigger: 'PLAYER_FAST', speaker: 'dog', text: 'My dog has better brakes!', priority: 2 },
    { id: 'fit-z2', trigger: 'PLAYER_FAST', speaker: 'fitness', text: "That's not Zone 2 cardio!", priority: 2 },
    { id: 'tour-fast', trigger: 'PLAYER_FAST', speaker: 'tourist', text: 'Is this part of the tour?', priority: 2 },
    { id: 'tech-pivot', trigger: 'PLAYER_SLOW', speaker: 'tech', text: 'Have you tried pivoting?', priority: 2 },
    { id: 'fit-slow', trigger: 'PLAYER_SLOW', speaker: 'fitness', text: "I'm literally jogging faster than you.", priority: 2 },
    // Greetings as the rider rolls by
    { id: 'tour-lombard', trigger: 'AMBIENT', speaker: 'tourist', text: 'Is this Lombard Street?', priority: 1 },
    { id: 'tech-ai', trigger: 'AMBIENT', speaker: 'tech', text: 'Is that an AI-powered bicycle?', priority: 1 },
    { id: 'dog-hi', trigger: 'AMBIENT', speaker: 'dog', text: 'He only barks at e-bikes.', priority: 1 },
    { id: 'fit-hi', trigger: 'AMBIENT', speaker: 'fitness', text: 'Hills are just stairs for wheels!', priority: 1 },
    // Landings and crashes
    { id: 'tour-five', trigger: 'CLEAN_LANDING', speaker: 'tourist', text: 'Five stars. Best tour ever.', priority: 2 },
    { id: 'r-nailed', trigger: 'CLEAN_LANDING', speaker: 'rider', text: 'Nailed it. Probably.', priority: 1 },
    { id: 'dog-saw', trigger: 'CRASH_REACT', speaker: 'dog', text: 'Even the dog saw that coming!', priority: 2 },
    { id: 'fit-walk', trigger: 'CRASH_REACT', speaker: 'fitness', text: 'Walk it off! Literally!', priority: 2 },
    { id: 'tech-gtm', trigger: 'CRASH_REACT', speaker: 'tech', text: 'Bold go-to-market strategy.', priority: 2 },
    { id: 'tour-crash', trigger: 'CRASH_REACT', speaker: 'tourist', text: 'Is this the Exploratorium?', priority: 2 },
    // The rider
    { id: 'r-pot-c', trigger: 'POTHOLE', speaker: 'rider', text: 'Pothole: 1. Latte: 0.', priority: 1, cargo: 'coffee' },
    { id: 'r-pot-k', trigger: 'POTHOLE', speaker: 'rider', text: 'Pothole: 1. Cake: 0.', priority: 1, cargo: 'cake' },
    { id: 'r-brake', trigger: 'HARD_BRAKE', speaker: 'rider', text: 'Brakes: engaged. Dignity: pending.', priority: 1 },
    { id: 'r-cone', trigger: 'CONE', speaker: 'rider', text: 'Sorry, cone!', priority: 1 },
    { id: 'r-foam', trigger: 'COFFEE_SPILL', speaker: 'rider', text: "That's... foam. Mostly foam.", priority: 1, cargo: 'coffee' },
    { id: 'r-steady', trigger: 'CAKE_WOBBLE', speaker: 'rider', text: 'Steady... steady...', priority: 2, cargo: 'cake' },
    { id: 'r-rose', trigger: 'CAKE_DECOR', speaker: 'rider', text: 'That rose was decorative anyway.', priority: 1, cargo: 'cake' },
    { id: 'r-groom', trigger: 'CAKE_GROOM', speaker: 'rider', text: 'The groom fell off. Classic groom.', priority: 3, cargo: 'cake' },
    { id: 'fit-stairs', trigger: 'STAIRS', speaker: 'fitness', text: 'Those are MY stairs!', priority: 2 },
    { id: 'r-stairs', trigger: 'STAIRS', speaker: 'rider', text: 'Macondray Lane: technically a shortcut.', priority: 2 },
    { id: 'r-bubble', trigger: 'POWERUP_BUBBLE', speaker: 'rider', text: 'Engineering solved packaging.', priority: 3 },
    { id: 'r-espresso', trigger: 'POWERUP_ESPRESSO', speaker: 'rider', text: 'Caffeine is a performance-enhancing substance.', priority: 3 },
    { id: 'r-boing', trigger: 'DISCO_POP', speaker: 'rider', text: "Boing! It's back in. Nobody saw that.", priority: 3, cargo: 'disco' },
    { id: 'r-roll', trigger: 'DISCO_ROLL', speaker: 'rider', text: 'Keep rolling, baby. No, not like that.', priority: 2, cargo: 'disco' },
    { id: 'r-pop', trigger: 'SHIELD_POP', speaker: 'rider', text: 'Bubble wrap took the hit. Pop pop!', priority: 3 },
    { id: 'r-close', trigger: 'NEAR_MISS', speaker: 'rider', text: 'Totally meant to do that.', priority: 2 },
    // Customer texts (phone channel)
    { id: 'c-gps', trigger: 'CARGO_HALF', speaker: 'customer', text: 'Why does your GPS show you 12 feet above the road?', priority: 3, cargo: 'coffee', duration: 3.6 },
    { id: 'c-tier', trigger: 'CARGO_HALF', speaker: 'customer', text: 'Please tell me the second tier is just running late.', priority: 3, cargo: 'cake', duration: 3.6 },
    { id: 'b-walk-r', trigger: 'BOARDWALK', speaker: 'rider', text: 'Napier Lane: no wind, no hurry.', priority: 2, cargo: 'bouquet' },
    { id: 'b-pot-r', trigger: 'POTHOLE', speaker: 'rider', text: 'Pothole: 1. Petals: 0.', priority: 1, cargo: 'bouquet' },
    { id: 'b-half-r', trigger: 'CARGO_HALF', speaker: 'rider', text: 'Losing petals, one bloom at a time.', priority: 2, cargo: 'bouquet' },
    { id: 'b-half-c', trigger: 'CARGO_HALF', speaker: 'customer', text: 'Are those petals or confetti? Be honest.', priority: 3, cargo: 'bouquet', duration: 3.4 },
    { id: 'b-crash-c', trigger: 'FIRST_CRASH', speaker: 'customer', text: 'Ruth here. I felt the petals leave.', priority: 3, cargo: 'bouquet', duration: 3.2 },
    { id: 'b-done-c', trigger: 'DELIVERY_COMPLETE', speaker: 'customer', text: 'Every petal? Honestly, the wind is a menace.', priority: 5, cargo: 'bouquet', duration: 2.6 },
    { id: 'c-slow1', trigger: 'PLAYER_SLOW', speaker: 'customer', text: 'My meeting about meetings ended. Where are you?', priority: 2, delivery: 1, duration: 3.4 },
    { id: 'c-slow2', trigger: 'PLAYER_SLOW', speaker: 'customer', text: 'The string quartet is improvising. Hurry.', priority: 2, delivery: 2, duration: 3.4 },
    { id: 'c-crash1', trigger: 'FIRST_CRASH', speaker: 'customer', text: 'Was that you? The whole building felt that.', priority: 3, delivery: 1, duration: 3.2 },
    { id: 'c-crash2', trigger: 'FIRST_CRASH', speaker: 'customer', text: 'I felt that in my clipboard.', priority: 3, delivery: 2, duration: 3.2 },
    { id: 'c-upright', trigger: 'CAKE_WOBBLE', speaker: 'customer', text: 'Is the cake still upright? Asking for the bride.', priority: 2, cargo: 'cake', duration: 3.4 },
    { id: 'c-groom', trigger: 'CAKE_GROOM', speaker: 'customer', text: "Did the groom just fall off the cake? Don't tell the bride.", priority: 3, cargo: 'cake', duration: 3.6 },
    // Arrival
    { id: 'f-bell', trigger: 'DELIVERY_COMPLETE', speaker: 'office', text: "I SAID DON'T RING THE BELL.", priority: 5, delivery: 1, duration: 2.6 },
    { id: 'f-finance', trigger: 'DELIVERY_COMPLETE', speaker: 'groom', text: 'Does this cake come with financing?', priority: 5, delivery: 2, duration: 2.6 },
    // Courier Academy: Pat from HR texts during drills (phone channel), and the Academy has opinions at the door
    { id: 'p-crash', trigger: 'FIRST_CRASH', speaker: 'customer', text: "That's going in your file. The file is getting thick.", priority: 4, delivery: 'drill', duration: 3.2 },
    { id: 'p-slow', trigger: 'PLAYER_SLOW', speaker: 'customer', text: 'This drill is timed. Mostly so I can go to lunch.', priority: 4, delivery: 'drill', duration: 3.4 },
    { id: 'p-half', trigger: 'CARGO_HALF', speaker: 'customer', text: 'Half a latte is still a latte. Legally. Barely.', priority: 4, delivery: 'drill', duration: 3.4 },
    { id: 'p-done', trigger: 'DELIVERY_COMPLETE', speaker: 'office', text: 'TRAINING COMPLETE. PLEASE RETURN THE CONES.', priority: 5, delivery: 'drill', duration: 2.6 },
  ];
  const CRASH_LINES = ['YOU HAVE DISCOVERED GRAVITY.', 'YOUR BRAKES HAVE REQUESTED PTO.', 'THIS WAS NOT IN THE JOB DESCRIPTION.'];
  const RECOVER_LINE = 'Employee status: still technically employed.';
  // How long a line stays up: about 50 ms per character, so a joke can be read without rushing.
  const readTime = (text) => clamp(2.4 + String(text).length * 0.05, 3.2, 6.5);

  class HumorEngine {
    constructor(lines) { this.lines = lines; this.reset(); }
    reset(ctx) {
      this.used = new Set(); this.bubble = null; this.phone = null; this.queued = null;
      this.lastBubble = -99; this.lastPhone = -99; this.cool = {};
      this.delivery = (ctx && ctx.delivery) || 1; this.cargo = (ctx && ctx.cargo) || 'coffee';
    }
    eligible(l, trigger) {
      return l.trigger === trigger && !this.used.has(l.id) && (!l.delivery || l.delivery === this.delivery) && (!l.cargo || l.cargo === this.cargo);
    }
    // Returns the lines shown (at most one per channel).
    offer(trigger, t, available) {
      if (t < (this.cool[trigger] || -99)) return [];
      const shown = [], cands = this.lines.filter((l) => this.eligible(l, trigger)).sort((a, b) => b.priority - a.priority);
      let bubbleDone = false, phoneDone = false;
      for (const line of cands) {
        const phone = line.speaker === 'customer';
        if (phone ? phoneDone : bubbleDone) continue;
        const who = available ? available(line.speaker) : {};
        if (!who) continue;
        const cur = phone ? this.phone : this.bubble;
        const busy = cur !== null && t < cur.until;
        if (busy && line.priority <= cur.line.priority) {
          if (!phone && line.priority >= 4 && !this.queued) { this.queued = { line, who, at: cur.until, trigger }; this.used.add(line.id); bubbleDone = true; }
          continue;
        }
        if (!busy && line.priority < 3 && t - (phone ? this.lastPhone : this.lastBubble) < (phone ? 6 : AMBIENT_GAP)) continue;
        shown.push(this.show(line, who, t, trigger));
        if (phone) phoneDone = true; else bubbleDone = true;
      }
      return shown;
    }
    show(line, who, t, trigger) {
      const s = { line, who, t0: t, until: t + Math.max(line.duration || 0, readTime(line.text)) };
      if (line.speaker === 'customer') { this.phone = s; this.lastPhone = t; } else { this.bubble = s; this.lastBubble = t; }
      this.used.add(line.id);
      if (line.cooldown) this.cool[trigger || line.trigger] = t + line.cooldown;
      return s;
    }
    // A critical line that arrived while another was talking gets its turn right after
    // (`at` is when that bubble ends; the line is dropped if it can't show within 2.5 s of it).
    tick(t, available) {
      if (!this.queued || (this.bubble && t < this.bubble.until)) return null;
      const q = this.queued;
      this.queued = null;
      if (t - q.at > 2.5) return null;
      const who = available ? available(q.line.speaker) : q.who;
      return who ? this.show(q.line, who, t, q.trigger) : null;
    }
    activeBubble(t) { return this.bubble && t < this.bubble.until ? this.bubble : null; }
    activePhone(t) { return this.phone && t < this.phone.until ? this.phone : null; }
  }

