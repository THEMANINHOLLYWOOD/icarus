// Icarus — sound design.
// Everything heard that is not the soundtrack or a spoken line is made here, out of noise, sine waves and a handful of
// recordings (./sfx/index.json lists how many takes of each there are, sfx/<name>-<n>.mp3: a different take plays each time
// with the made version under it, and the made version carries the sound alone when the files have not loaded).
//
// One palette — fire (crackle, roar), air (noise that moves), stone, water, bronze bells and low drums — and one mix:
//
//   effects ─ sfx / wet ─┐                       voice ───────────────────────────┐
//   big moments, sub ────┤   (nothing is ever in the way of these two)            │
//   his air, wings, fire ┼─ duck ─ dip ─┐                                         │
//   the world's beds ────┤              ├─ master ─ under water ─ glue ─ limiter ─ soft clip ─ out
//   the soundtrack ──────┴─ duck ─ dip ─┘        hall (one long room) and a far echo off the mountains, returned dark
//
// The ducks are one system: whoever needs room (a voice, a conversation, a big moment, death, anything the game names)
// holds a claim on it, the deepest claim wins, and the levels move there and back smoothly. The dips are for the half
// second of nothing before something very large.
//
//   const audio = createAudio();
//   audio.init();                                   // inside a user gesture
//   audio.update(dt, { state, form, speed, vy, grounded, diving, boost, flame, realm, summit, sky, water, skim, sub, rain,
//                      burning, falling, wind,   turn, bank, alt, perched });        // (the last four are optional)
//   audio.listen(px, py, pz, fx, fy, fz, vx, vy, vz);   // the ears: where, facing where, moving how (velocity optional)
//   audio.sfx.flap(0.8); audio.sting('firstFlight'); src.connect(audio.voiceBus); audio.duck(seconds);
//   audio.brush(side, amount, speed);               // his burning wingtips through leaves, every frame it is so
//   audio.emit(id, kind, x, y, z, { vx, vy, vz });  // something in the world that sounds: nearer is louder, and it bends in pitch as he closes on it and leaves it
//   audio.focus('conversation', true);              // make room; audio.focus('conversation', false) gives it back
//   audio.make(recipe); audio.voiceFor(thing); audio.become(thing);   // a voice for a thing nobody has heard before

const SAMPLE_NAMES = ['flap', 'ignite', 'rebirth', 'morph', 'impact', 'splash', 'roll', 'flameout', 'thunder', 'wingsopen', 'underworld'];   // (the old single takes, if there is no index)
const LOOPS = ['windloop', 'diveloop', 'fallloop', 'fireloop', 'rainloop', 'waterloop'];
// (recordings not used: the fire loop measures as broadband hiss — 44% of its energy above 6 kHz, nearly flat, 19 clicks a
//  second — and under his own fire it was the static. His fire is made here instead.)
const UNUSED = ['fireloop'];
// bus levels: the first place to tune the balance
const MIX = { master: 0.74, voice: 1.3, sfx: 0.8, big: 0.8, sub: 0.62, ui: 0.7, amb: 0.6, air: 0.6, world: 0.7, music: 0.56 };
// who gives way, and how far: what is left of the soundtrack (m), the world's beds (a), his own air and fire (f) and the
// effects (s) while the claim is held at full strength; how fast they go down (at) and come back (rl), in seconds
const DUCK = {
  voice: { m: 0.34, a: 0.5, f: 0.55, s: 0.8, at: 0.08, rl: 0.7 },    // a line being spoken
  talk: { m: 0.62, a: 0.5, f: 0.6, s: 0.9, at: 0.45, rl: 1.3 },      // a conversation open (between the lines too)
  big: { m: 0.3, a: 0.3, f: 0.4, s: 0.75, at: 0.03, rl: 1.1 },       // a big moment: it is given the whole room
  dead: { m: 1, a: 0.35, f: 0.2, s: 0.85, at: 0.5, rl: 1.6 },
  focus: { m: 0.5, a: 0.5, f: 0.6, s: 0.85, at: 0.4, rl: 1.2 },      // anything the game asks room for by name
};
const SOUND_C = 343;
const POP_N = 24, POP_SLOT = 0.08;   // (the bank of single crackles: how many, and how long each one's place in it is)   // the speed of sound, in the world's own metres a second: what the pitch of a thing passing bends against

const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;
const mtof = m => 440 * Math.pow(2, (m - 69) / 12);
const rnd = (a = 1, b) => b === undefined ? Math.random() * a : a + Math.random() * (b - a);
const jit = (x, p = 0.06) => x * (1 + (Math.random() * 2 - 1) * p);   // a little off, every time: nothing is heard twice the same
const num = (v, lo, hi, d) => { v = typeof v === 'number' || (typeof v === 'string' && v.trim() !== '') ? +v : NaN; return Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d; };
const hash = s => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
const prng = seed => () => { seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
// a value that wanders and never repeats (0…1): what makes a gust a gust
const wander = (x, seed) => { const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f), h = n => { let t = Math.imul((n ^ seed) | 0, 0x9E3779B1); t ^= t >>> 15; t = Math.imul(t, 0x85EBCA6B); t ^= t >>> 13; return (t >>> 0) / 4294967296; }; return h(i) + (h(i + 1) - h(i)) * u; };

// ── the score: D minor, 66 bpm, sixteenth-note grid. Two eight-bar sections; n = pad voicing, r = bass root,
//    h = the voicing for the second half of the bar (the suspension resolving). mel = [step, note] for the piano.
const BPM = 66, STEP = 60 / BPM / 4, BAR = STEP * 16;
const SEC_A = {
  ch: [
    { n: [50, 57, 64, 65], r: 38 }, { n: [48, 57, 62, 65], r: 36 }, { n: [46, 53, 57, 62], r: 34 }, { n: [43, 50, 58, 62], r: 31 },
    { n: [53, 57, 60, 67], r: 41 }, { n: [52, 55, 60, 67], r: 40 }, { n: [55, 58, 62, 65], r: 43 }, { n: [45, 57, 62, 64], h: [45, 57, 61, 64], r: 33 },
  ],
  mel: [
    [[0, 69], [6, 65], [10, 64]], [[4, 62], [12, 69]], [[0, 74], [6, 69], [10, 65]], [[4, 67], [12, 70]],
    [[0, 72], [6, 69], [10, 67]], [[4, 64], [12, 67]], [[0, 70], [6, 74], [10, 77]], [[0, 76], [8, 74], [12, 73]],
  ],
};
const SEC_B = {
  ch: [
    { n: [46, 53, 60, 62], r: 34 }, { n: [45, 53, 60, 65], r: 33 }, { n: [48, 55, 60, 64], r: 36 }, { n: [50, 57, 60, 65], r: 38 },
    { n: [46, 53, 58, 62], r: 34 }, { n: [43, 53, 58, 62], r: 31 }, { n: [45, 52, 57, 62], r: 33 }, { n: [45, 52, 57, 61], r: 33 },
  ],
  mel: [
    [[0, 77], [8, 74], [12, 72]], [[0, 72], [8, 69]], [[0, 76], [6, 79], [12, 76]], [[0, 77], [8, 74]],
    [[0, 74], [4, 77], [10, 74]], [[0, 69], [8, 70], [12, 74]], [[0, 76], [8, 74]], [[0, 73], [8, 76]],
  ],
};
const FORM = [SEC_A, SEC_A, SEC_B, SEC_A];
const OST = [0, 2, 1, 2, 3, 2, 1, 2];
// the Underworld: slow clusters over a low D, two bars each
const UNDER = [[38, 57, 58, 64], [38, 55, 58, 63], [36, 55, 56, 62], [38, 53, 57, 58]];
const GLASS = [74, 75, 81, 82, 86];
const ENDING = [
  [0, [38, 50, 57, 65, 69]], [3.3, [34, 46, 53, 62, 65]], [6.6, [41, 48, 57, 60, 72]], [9.9, [36, 48, 55, 64, 67]],
  [13.2, [43, 50, 58, 62, 70]], [16.5, [45, 52, 57, 62, 64]], [18.7, [45, 52, 57, 61, 64]], [21.4, [38, 50, 57, 66, 69, 74]],
];

export function createAudio() {
  let ctx = null, muted = false, quality = 'high', offline = false;
  let song = null;   // the soundtrack, once it has been started
  const SCORE = false;   // the score that used to be generated when the soundtrack was not playing: off, for good
  let omen = null;   // a dark stretch of it, looped, for the night before the leap
  let echoSend = null, master, post, glue, limiter, muteGain, subF, reverb, revIn, echoIn, sfxBus, sfxWet, bigBus, subBus, uiBus, ambBus, airBus, worldBus, musicBus, voiceBus;
  let duckM, duckA, duckF, duckS, dipM, dipA, vAn = null, vBuf = null;
  let surround = null; const ear = { x: 0, y: 0, z: 0, fx: 0, fz: -1, vx: 0, vy: 0, vz: 0, yaw: 0, turn: 0, t: 0, has: false };   // (six speakers, if the machine has them; and where the listener is, faces and is going)
  let white, pink, brown, crackle, ruffle, grit, roar, pops; const BUF = {};
  const samples = {};
  let live = 0, made = 0;
  const lastP = new Map();
  let scope = null, dop = 1, trim = 1;   // inside at() and at3() the sounds being made are somewhere else: how much of them reaches here, and how their pitch is bent by the closing speed

  // continuous layers and score state
  const W = {}, L = {}, lv = { pad: 0, piano: 0, ost: 0, brass: 0, sub: 0, drum: 0, choir: 0 };
  let scoreGain, stingBus, stingPad, padIn, ostIn, under = null, held = null;
  let stepN = 0, nextT = 0, intensity = 0, flyAmt = 0, lift = 0, tAcc = 0, clock = 0;
  let mode = 'normal', modeUntil = 0, silenceUntil = 0, nextMoan = 0, lonely = false, realmUnder = false, lastState = '';
  // who is holding the room down, and where the four faders were last sent
  const claims = new Map(), duckV = [1, 1, 1, 1], duckLo = [[1, 1], [1, 1], [1, 1], [1, 1]]; let duckRl = 0.7, vEnv = 0;
  // the flight, as the sound hears it: how hard he is turning, speeding, slowing, being thrown about
  const fl = { pSpeed: 0, pVy: 0, acc: 0, dvy: 0, turn: 0, bank: 0, turb: 0, pWind: 0, gustD: 0, flareT: 0, bankT: 0, pTq: 0, speed: 0, sp: 0, own: false, flyT: 0, real: false, hand: 1, holds: 0 };
  const kick = { flap: 0, ruffle: 0, fire: 0 };
  const BR = { v: null, side: [{ tgt: 0, cur: 0, until: 0, peak: 0, hitT: 0, on: false }, { tgt: 0, cur: 0, until: 0, peak: 0, hitT: 0, on: false }], speed: 0, kind: 'leaves', next: 0, idle: 0 };
  const WK = { tgt: 0, cur: 0, until: 0, side: 0 };
  const EM = { all: new Map(), n: 0 };
  const things = { loops: new Set(), cache: new Map(), n: 0 };

  // Lean: when the machine is struggling (frames slow for a while), the sound is made cheaper before it can stutter —
  // a stuttering audio thread is heard as crackle and static. Plain left-right placing instead of the shape of a head,
  // and fewer voices at once. It comes back once frames have been quick for a good while.
  const LEAN = { on: false, slow: 0, quick: 0 };
  const cap = () => quality === 'low' || LEAN.on ? 44 : 96;
  const low = () => quality === 'low';

  // set a parameter's target only when it actually moved (keeps the automation timeline short)
  function P(param, v, tc = 0.15) {
    const last = lastP.get(param);
    if (last !== undefined && Math.abs(last - v) <= 0.003 * Math.max(1e-3, Math.abs(v), Math.abs(last))) return;
    lastP.set(param, v);
    param.setTargetAtTime(v, ctx.currentTime, tc);
  }
  // A bed that has gone quiet is taken off the graph — its source disconnected, so nothing in front of a fader at nought
  // is worked out any more — and put back the moment it is wanted, with the fader still at nought: it costs nothing while
  // it is silent, and comes back without a click. (B: { s, head, g } — the source, what it feeds, its fader.)
  function bed(B, v, tc = 0.15) {
    if (v > 1e-4) { if (!B.on) { try { B.s.connect(B.head); } catch {} B.on = true; } B.off = 0; P(B.g.gain, v, tc); return; }
    P(B.g.gain, 0, tc);
    if (B.on) { const now = ctx.currentTime; if (!B.off) B.off = now + tc * 9 + 0.05; else if (now > B.off) { try { B.s.disconnect(); } catch {} B.on = false; } }
  }
  // (the same, for a place in the world: there the test is a distance, not a proportion — a thing ten thousand metres
  //  from the middle of the map still has to be heard to move a hand's width)
  function Pabs(param, v, tc, eps) {
    const last = lastP.get(param);
    if (last !== undefined && Math.abs(last - v) <= eps) return;
    lastP.set(param, v);
    param.setTargetAtTime(v, ctx.currentTime, tc);
  }

  // ───────── buffers ─────────
  function loopable(len, fade, gen) {
    const raw = new Float32Array(len + fade); gen(raw);
    for (let i = 0; i < fade; i++) { const k = i / fade; raw[i] = raw[i] * k + raw[len + i] * (1 - k); }
    return raw.subarray(0, len);
  }
  function makeBuffers() {
    const sr = ctx.sampleRate, fade = Math.floor(sr * 0.25);
    const put = (data) => { const b = ctx.createBuffer(1, data.length, sr); b.getChannelData(0).set(data); return b; };
    const w = new Float32Array(sr * 2); for (let i = 0; i < w.length; i++) w[i] = Math.random() * 2 - 1;
    white = put(w);
    pink = put(loopable(sr * 4, fade, d => {
      let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
      for (let i = 0; i < d.length; i++) {
        const x = Math.random() * 2 - 1;
        b0 = 0.99886 * b0 + x * 0.0555179; b1 = 0.99332 * b1 + x * 0.0750759; b2 = 0.969 * b2 + x * 0.153852;
        b3 = 0.8665 * b3 + x * 0.3104856; b4 = 0.55 * b4 + x * 0.5329522; b5 = -0.7616 * b5 - x * 0.016898;
        d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + x * 0.5362) * 0.11; b6 = x * 0.115926;
      }
    }));
    brown = put(loopable(sr * 4, fade, d => {
      let last = 0;
      for (let i = 0; i < d.length; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; d[i] = last * 3.5; }
    }));
    // Fire. (It used to be milliseconds-long bursts of white noise, twenty-six a second, high-passed: measured, that was
    // half its energy above 6 kHz and nearly flat — static, not fire. Now it is made the way wood burning makes it.)
    // The crackle: wood splitting. Each one a snap a fraction of a millisecond long, rounded off and not too bright, ringing
    // the bit of wood it came out of (a short resonance, somewhere between 700 Hz and 3 kHz), and in the bigger ones the
    // low pop of the pocket of gas that burst. They come irregularly — about five a second, most of them small, a few
    // loud — and often in little runs, the way a split runs along the grain; now and then the sap fries for a moment.
    // (They wrap round the end of the buffer, so it loops without a seam.)
    const crk = (d, at, amp, small) => {
      const big = !small && amp > 0.45, len = Math.floor(sr * (big ? 0.07 : 0.022)), N = d.length;
      const sn = Math.max(4, Math.floor(sr * (small ? rnd(0.0001, 0.0002) : rnd(0.0001, 0.0005)))), lk = 1 - Math.exp(-2 * Math.PI * rnd(small ? 3500 : 2500, small ? 5500 : 5000) / sr);   // (never quicker than four samples, never brighter than 5.5 kHz: quicker and brighter measured as a step, a click)
      const f = rnd(700, 2800), r = Math.exp(-1 / (rnd(0.0005, 0.0028) * sr)), c1 = 2 * r * Math.cos(2 * Math.PI * f / sr), c2 = -r * r;
      const tf = rnd(110, 320), tt = rnd(0.004, 0.012), th = big ? rnd(0.3, 0.7) : 0, ring = small ? 0.15 : rnd(0.3, 0.8);
      const a = new Float32Array(len), b = new Float32Array(len); let lp = 0, y1 = 0, y2 = 0, pa = 1e-9, pb = 1e-9;
      for (let j = 0; j < len; j++) {
        const x = j < sn ? (Math.random() * 2 - 1) * Math.sin(Math.PI * (j + 0.5) / sn) : 0;
        lp += (x - lp) * lk; const y = c1 * y1 + c2 * y2 + lp; y2 = y1; y1 = y;
        a[j] = lp; b[j] = y; pa = Math.max(pa, Math.abs(lp)); pb = Math.max(pb, Math.abs(y));
      }
      let pk = 1e-9; const fadeN = Math.floor(len * 0.3);
      for (let j = 0; j < len; j++) {
        const s = j / sr, w = j > len - fadeN ? 0.5 + 0.5 * Math.cos(Math.PI * (j - (len - fadeN)) / fadeN) : 1;
        a[j] = (a[j] / pa + ring * b[j] / pb + (th ? th * Math.sin(2 * Math.PI * tf * s) * Math.exp(-s / tt) * (1 - Math.exp(-s / 0.0003)) : 0)) * w; pk = Math.max(pk, Math.abs(a[j]));
      }
      for (let j = 0; j < len; j++) d[(at + j) % N] += a[j] / pk * amp;
    };
    const c = new Float32Array(sr * 6), CN = c.length;
    for (let t = 0; ;) {
      t += -Math.log(1 - Math.random()) / 5.5; if (t * sr >= CN) break;
      const amp = 0.06 + 0.94 * Math.pow(Math.random(), 3); crk(c, Math.floor(t * sr), amp);
      if (Math.random() < 0.4) for (let i = 0, n = 1 + Math.floor(Math.random() * 4), u = t; i < n; i++) { u += rnd(0.006, 0.07); crk(c, Math.floor(u * sr) % CN, amp * rnd(0.15, 0.6)); }
      if (Math.random() < 0.05) for (let i = 0, n = 6 + Math.floor(Math.random() * 12), u = t + rnd(0.05, 0.2); i < n; i++) { u += rnd(0.002, 0.012); crk(c, Math.floor(u * sr) % CN, rnd(0.03, 0.1), true); }
    }
    { let pk = 1e-9; for (let i = 0; i < CN; i++) pk = Math.max(pk, Math.abs(c[i])); for (let i = 0; i < CN; i++) c[i] *= 0.9 / pk; }
    crackle = put(c);
    // single crackles, one to a slot (what a spark is now: one pop of wood, not a hiss of noise)
    { const p = new Float32Array(Math.floor(sr * POP_SLOT) * POP_N); for (let k = 0; k < POP_N; k++) crk(p, Math.floor(sr * POP_SLOT) * k + Math.floor(sr * 0.0005), 1, k % 5 === 4); pops = put(p); }
    // The roar: the body of a fire, the sound of the air it pulls in. Low (most of it under 400 Hz), never steady — a slow
    // heave, quicker licks of flame over it in the low mids, and now and then a surge — and never periodic: the wavers are
    // wandering values, not oscillators, so nothing in it beats like a motor.
    roar = put(loopable(sr * 8, fade, d => {
      const k1 = 1 - Math.exp(-2 * Math.PI * 300 / sr), kd = 1 - Math.exp(-2 * Math.PI * 38 / sr), kh = 1 - Math.exp(-2 * Math.PI * 1100 / sr), kl = 1 - Math.exp(-2 * Math.PI * 240 / sr), sd = Math.floor(Math.random() * 1e6);
      let l1 = 0, l2 = 0, dc = 0, h1 = 0, h2 = 0, sum = 0, e0 = null, e1 = null;
      const env = t => { const slow = 0.55 * wander(t * 1.7, sd) + 0.3 * wander(t * 4.1, sd + 1) + 0.15 * wander(t * 9.3, sd + 2), fast = 0.6 * wander(t * 13, sd + 3) + 0.4 * wander(t * 27, sd + 4), surge = sstep(0.62, 0.95, wander(t * 0.55, sd + 5));
        return [5.5 * (0.45 + 0.55 * slow + 0.5 * surge), 2.5 * (0.2 + 0.8 * fast) * (0.3 + 0.7 * slow) * (0.6 + 0.8 * surge)]; };   // (worked out every 64 samples and drawn straight between)
      for (let i = 0; i < d.length; i++) {
        if (!(i & 63)) { e0 = e1 || env(i / sr); e1 = env((i + 64) / sr); }
        const w = Math.random() * 2 - 1, v = Math.random() * 2 - 1, q = (i & 63) / 64;
        l1 += (w - l1) * k1; l2 += (l1 - l2) * k1; dc += (l2 - dc) * kd; const low = l2 - dc;   // (white, rolled off twice above 300 Hz, nothing under 40)
        h1 += (v - h1) * kh; h2 += (v - h2) * kl; const mid = h1 - h2;                            // (a band from 240 Hz to 1.1 kHz)
        d[i] = low * (e0[0] + (e1[0] - e0[0]) * q) + mid * (e0[1] + (e1[1] - e0[1]) * q); sum += d[i] * d[i];
      }
      const g = 0.24 / Math.sqrt(sum / d.length || 1); for (let i = 0; i < d.length; i++) d[i] = Math.tanh(d[i] * g);
    }));
    // grit: stone dust turning under a hand or a foot — a dense run of tiny hard grains, a millisecond or two each
    const gr = new Float32Array(sr * 2); let e = 0, k = 0.98, up = 0;
    for (let i = 0; i < gr.length; i++) {
      if (Math.random() < 1 / 150) { e = Math.max(e, 0.16 + Math.pow(Math.random(), 2) * 0.3); k = rnd(0.975, 0.992); up = Math.min(up, 3); }
      gr[i] = (Math.random() * 2 - 1) * e * Math.min(1, ++up / 6); e *= k;
    }
    for (let i = 0, n = Math.floor(sr * 0.02); i < n; i++) { gr[i] *= i / n; gr[gr.length - 1 - i] *= i / n; }
    grit = put(gr);
    // feathers: small soft flutters, each a few milliseconds of rounded noise, arriving in loose runs the way a wing shivers.
    // (They wrap round the end of the buffer, so it loops without a seam.)
    const r = new Float32Array(sr * 3), N = r.length; let at = 0, peak = 0;
    while (at < N) {
      const n = 3 + Math.floor(Math.random() * 7), rate = rnd(22, 46), amp0 = rnd(0.35, 1);
      for (let g = 0; g < n; g++) {
        const len = Math.floor(sr * rnd(0.008, 0.022)), a = amp0 * (1 - g / n * 0.6) * rnd(0.6, 1), col = rnd(0.25, 0.7); let y = 0;
        for (let j = 0; j < len; j++) { const win = Math.sin(Math.PI * j / len); y += ((Math.random() * 2 - 1) - y) * col; r[(at + j) % N] += y * win * win * a; }
        at += Math.floor(sr / rate * rnd(0.7, 1.3));
      }
      at += Math.floor(sr * rnd(0, 0.05));
    }
    for (let i = 0; i < N; i++) peak = Math.max(peak, Math.abs(r[i]));
    for (let i = 0; i < N; i++) r[i] *= 0.9 / (peak || 1);
    ruffle = put(r);
    Object.assign(BUF, { white, pink, brown, crackle, ruffle, grit, roar, pops });
  }
  function makeIR() {
    const sr = ctx.sampleRate, secs = low() ? 1.5 : 3.1, n = Math.floor(sr * secs), b = ctx.createBuffer(2, n, sr);
    for (let ch = 0; ch < 2; ch++) {
      const d = b.getChannelData(ch); let lp = 0;
      for (let i = 0; i < n; i++) {
        const t = i / n, x = (Math.random() * 2 - 1) * Math.pow(1 - t, 2.6) * (i < sr * 0.012 ? i / (sr * 0.012) : 1);
        const a = 0.55 - 0.42 * t;                       // the tail gets darker as it dies
        lp += (x - lp) * a; d[i] = lp * 0.9;
      }
      // a few first returns off the rock, different in each ear: they say how big the place is before the tail does
      for (let k = 0; k < 6; k++) {
        const at = Math.floor(sr * (0.013 + 0.014 * k + Math.random() * 0.009)), amp = (0.42 - k * 0.05) * (Math.random() < 0.5 ? -1 : 1);
        for (let j = 0; j < 32 && at + j < n; j++) d[at + j] += amp * Math.sin(Math.PI * j / 32) * (Math.random() * 2 - 1) * 0.5;
      }
    }
    return b;
  }

  // ───────── graph ─────────
  const gain = (v = 1) => { const g = ctx.createGain(); g.gain.value = v; return g; };
  const biq = (type, f, q = 0.7) => { const b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; return b; };
  const pan = (v) => { if (!ctx.createStereoPanner) return null; const p = ctx.createStereoPanner(); p.pan.value = clamp(v, -1, 1); return p; };
  const comp = (th, knee, ratio, att, rel) => { const c = ctx.createDynamicsCompressor(); c.threshold.value = th; c.knee.value = knee; c.ratio.value = ratio; c.attack.value = att; c.release.value = rel; return c; };
  function loop(buf, rate = 1) {
    const s = ctx.createBufferSource(); s.buffer = buf; s.loop = true; s.playbackRate.value = rate;
    s.start(0, Math.random() * (buf.duration - 0.1)); return s;
  }
  function chain(...nodes) { for (let i = 0; i < nodes.length - 1; i++) nodes[i].connect(nodes[i + 1]); return nodes[nodes.length - 1]; }

  function build() {
    makeBuffers();
    muteGain = gain(muted ? 0 : 1);
    // The last of the chain. A slow, gentle compressor that holds the mix together and lets the front of a hit through; a
    // fast limiter over it for what is really too much; and a soft clip that nothing gets past, so the output can never
    // square off however many things happen at once. (Under water, everything before them goes dull.)
    master = gain(MIX.master);
    subF = biq('lowpass', 20000, 0.5);   // closes when his head is under water
    glue = comp(-14, 12, 2.2, 0.02, 0.3);
    limiter = comp(-3, 0, 20, 0.002, 0.1);
    post = chain(master, biq('highpass', 22, 0.7), subF, glue, limiter, gain(0.82));   // (what is under 22 Hz is not sound: it only uses up the room the limiter has. The two compressors add back gain of their own, so the limiter's output is taken down 1.7 dB: in the busiest scene it still peaks under the soft clip's knee.)
    if (ctx.createWaveShaper) {
      const n = 2049, c = new Float32Array(n), sh = ctx.createWaveShaper();
      for (let i = 0; i < n; i++) { const x = (i / (n - 1) * 2 - 1) * 2, a = Math.abs(x); c[i] = Math.sign(x) * (a < 0.7 ? a : 0.7 + 0.28 * Math.tanh((a - 0.7) / 0.28)); }
      sh.curve = c; sh.oversample = low() ? '2x' : '4x'; post = chain(post, gain(0.5), sh);   // (worked out at a higher rate: when something does reach the curve, it bends without throwing fizz back down into what is heard)
    }
    chain(post, muteGain, ctx.destination);
    // Six speakers, where there are six. What is in front stays in front; the middle speaker carries a little of both
    // sides; the lowest of it goes to the sub; and the room is filled in behind — the whole of it again, quieter and a
    // breath late, so the front still leads — with anything that happens behind him sent there outright. (On two
    // speakers or headphones none of this exists: everything is placed for two ears, as before.)
    try {
      if (ctx.destination.maxChannelCount >= 6 && !offline) {
        ctx.destination.channelCount = 6; ctx.destination.channelCountMode = 'explicit'; ctx.destination.channelInterpretation = 'speakers';
        const merge = ctx.createChannelMerger(6), mono = v => { const g = gain(v); g.channelCount = 1; g.channelCountMode = 'explicit'; return g; };
        muteGain.disconnect(); const front = ctx.createChannelSplitter(2); muteGain.connect(front); front.connect(merge, 0, 0); front.connect(merge, 1, 1);
        const centre = mono(0.32); muteGain.connect(centre); centre.connect(merge, 0, 2);
        const low = biq('lowpass', 110, 0.7), sub = mono(0.8); chain(muteGain, low, sub); sub.connect(merge, 0, 3);
        const bed = gain(0.42), late = ctx.createDelay(0.05), back = ctx.createChannelSplitter(2), rearIn = gain(1), rearMute = gain(muted ? 0 : 1); late.delayTime.value = 0.014;
        chain(muteGain, bed, late); chain(rearIn, rearMute, late); late.connect(back); back.connect(merge, 0, 4); back.connect(merge, 1, 5);
        merge.connect(ctx.destination); surround = { rearIn, rearMute };
      }
    } catch (e) { console.warn('surround', e); surround = null; try { muteGain.disconnect(); muteGain.connect(ctx.destination); } catch {} }
    // the hall: one long room, a breath late, and brought back without its lowest octave (so the weight of a hit stays a
    // hit and does not turn to mud) and without its very top
    reverb = ctx.createConvolver(); reverb.buffer = makeIR();
    revIn = gain(1); { const pd = ctx.createDelay(0.1); pd.delayTime.value = 0.018; chain(revIn, pd, reverb, biq('highpass', 150, 0.5), biq('lowpass', low() ? 5200 : 7600, 0.5), gain(0.9), master); }
    // a far wall: the big things come back once more off the mountains, late and dark
    echoIn = gain(1);
    if (!low()) { const dl = ctx.createDelay(1), lp = biq('lowpass', 1400, 0.5), fb = gain(0.26), ret = gain(0.4); dl.delayTime.value = 0.36; chain(echoIn, dl, lp, ret, master); chain(lp, fb, dl); chain(ret, gain(0.5), revIn); }

    dipA = gain(1); dipA.connect(master); dipM = gain(1); dipM.connect(master);
    duckS = gain(1); duckS.connect(master);
    sfxBus = gain(MIX.sfx); sfxBus.connect(duckS); echoSend = gain(0.14); chain(sfxBus, echoSend, revIn);   // (how much of every sound goes to the hall: more inside rock)
    sfxWet = gain(MIX.sfx * 0.8); sfxWet.connect(duckS); chain(sfxWet, gain(0.7), revIn);
    bigBus = gain(MIX.big); bigBus.connect(master); chain(bigBus, gain(0.4), revIn); chain(bigBus, gain(0.3), echoIn);   // the big moments: never ducked, and the mountains answer them
    subBus = gain(MIX.sub); chain(subBus, biq('lowpass', 150, 0.6), master);   // weight: what is felt more than heard — dry, so it stays one blow
    uiBus = gain(MIX.ui); uiBus.connect(master); chain(uiBus, gain(0.05), revIn);   // the hand on the game itself: close, dry, never in the way
    duckA = gain(1); duckA.connect(dipA); ambBus = gain(MIX.amb); ambBus.connect(duckA);
    worldBus = gain(MIX.world); worldBus.connect(duckA); chain(worldBus, gain(0.12), revIn);   // things in the world that sound from where they are
    duckF = gain(1); duckF.connect(dipA); airBus = gain(MIX.air); airBus.connect(duckF); chain(airBus, gain(0.04), revIn);   // his own air, wings and fire
    duckM = gain(1); duckM.connect(dipM); chain(dipM, gain(0.34), revIn);
    musicBus = gain(MIX.music); musicBus.connect(duckM);
    voiceBus = gain(MIX.voice);
    const pres = biq('peaking', 3000, 0.8); pres.gain.value = 2.5;
    chain(voiceBus, biq('highpass', 70, 0.7), pres, master);
    // (listening to the voices, so that everything else can make room for one the moment it speaks, whoever started it)
    try { vAn = ctx.createAnalyser(); vAn.fftSize = 256; vAn.smoothingTimeConstant = 0; vBuf = new Float32Array(256); voiceBus.connect(vAn); chain(vAn, gain(0), master); } catch { vAn = null; }

    // the air: a low body, a band for each wing, a soft top, a whistle for dives and a pressure rumble at speed
    const band = (buf, rate, filters, panV, dest) => {
      const g = gain(0), p = panV ? pan(panV) : null, s = loop(buf, rate);
      chain(s, ...filters, g); (p ? chain(g, p) : g).connect(dest);
      return { g, f: filters[0], s, rate, head: filters[0] || g, on: true, off: 0 };
    };
    W.low = band(brown, 1, [biq('lowpass', 260, 0.3)], 0, airBus);
    if (low()) W.mid = [band(pink, 1, [biq('bandpass', 500, 0.5)], 0, airBus)];
    else W.mid = [band(pink, 1, [biq('bandpass', 500, 0.5)], -0.7, airBus), band(pink, 0.93, [biq('bandpass', 560, 0.5)], 0.7, airBus)];
    W.high = band(pink, 1.1, [biq('bandpass', 2200, 0.7), biq('lowpass', 5200, 0.5)], 0, airBus);
    W.whistle = band(white, 1, [biq('bandpass', 1200, 11), biq('lowpass', 5000, 0.5)], 0, airBus);
    W.rumble = band(brown, 0.5, [biq('lowpass', 80, 0.5)], 0, airBus);
    W.fall = band(white, 1, [biq('bandpass', 700, 1.6), biq('lowpass', 5000, 0.5)], 0, airBus);
    // his fire: the roar (its waver is in the recording of it, never two oscillators beating), and the crackle of it on
    // each side — sparse, and dark enough to be wood and not static
    W.fire = band(roar, 1, [biq('lowpass', 480, 0.5)], 0, airBus);
    W.crackle = [band(crackle, 0.72, [biq('lowpass', 3800, 0.5)], low() ? 0 : -0.35, airBus)];
    if (!low()) W.crackle.push(band(crackle, 0.83, [biq('lowpass', 4200, 0.5)], 0.35, airBus));
    // his feathers: what the air does to them when it is not smooth
    // (and nothing of them above about 4 kHz: at speed, over half of them was up there, and it read as fizz)
    if (low()) W.ruf = [band(ruffle, 1, [biq('bandpass', 2400, 0.6), biq('lowpass', 4200, 0.5)], 0, airBus)];
    else W.ruf = [band(ruffle, 1, [biq('bandpass', 2400, 0.6), biq('lowpass', 4200, 0.5)], -0.6, airBus), band(ruffle, 1.13, [biq('bandpass', 2600, 0.6), biq('lowpass', 4200, 0.5)], 0.6, airBus)];
    W.water = band(pink, 0.8, [biq('bandpass', 700, 0.6)], 0, ambBus);
    // (the spray and the rain: pink, in a band, and never at a steady level. They used to be white noise high-passed —
    //  two thirds of their energy over 4 kHz, flat, constant — and that is what static is.)
    W.foam = band(pink, 1, [biq('bandpass', 2600, 0.8), biq('lowpass', 5000, 0.5)], 0, ambBus);
    W.rain = band(pink, 1, [biq('bandpass', 2000, 0.45), biq('lowpass', 5500, 0.5)], 0, ambBus);
    W.rainLow = band(pink, 1, [biq('bandpass', 420, 0.5)], 0, ambBus);
    // wings buffeting (a man's, or his own in another bird's wake): low noise fluttered by an LFO
    {
      const g = gain(0), flut = gain(0.6), lfo = ctx.createOscillator(), depth = gain(0.4), f = biq('bandpass', 190, 0.9);
      lfo.type = 'sine'; lfo.frequency.value = 9; lfo.start(); chain(lfo, depth); depth.connect(flut.gain);
      const s = loop(brown, 1); chain(s, f, flut, g, airBus);
      W.buffet = { g, f, lfo, s, head: f, on: true, off: 0 };
    }

    // score: every layer has its own level so notes already sounding follow the fades
    scoreGain = gain(0); scoreGain.connect(musicBus);
    for (const k of Object.keys(lv)) { L[k] = gain(0); L[k].connect(scoreGain); }
    L.padF = biq('lowpass', 900, 0.4); padIn = gain(1); chain(padIn, L.padF, L.pad);
    L.ostF = biq('lowpass', 1500, 0.6); ostIn = gain(1); chain(ostIn, L.ostF, L.ost);
    chain(L.choir, gain(0.5), revIn);
    stingBus = gain(1); stingBus.connect(musicBus); chain(stingBus, gain(0.35), revIn);
    stingPad = biq('lowpass', 2400, 0.4); stingPad.connect(stingBus);
    nextT = ctx.currentTime + 0.1;
  }

  function buildUnder() {
    const g = gain(0); g.connect(ambBus); chain(g, gain(0.5), revIn);
    const f = biq('lowpass', 150, 0.6); f.connect(g);
    const oscs = [[36.71, 'sine', 0.5, 0], [55.0, 'sine', 0.22, -9], [73.42, 'triangle', 0.1, 6]].map(([hz, type, vol, det]) => {
      const o = ctx.createOscillator(), og = gain(vol); o.type = type; o.frequency.value = hz; o.detune.value = det; o.start(); chain(o, og, f); return o;
    });
    const cave = gain(0.5); chain(loop(brown, 0.7), biq('bandpass', 180, 2), cave, g);
    const fire = gain(0.22); chain(loop(crackle, 0.62), biq('highpass', 500, 0.5), biq('lowpass', 2600, 0.5), fire, g);
    under = { g, f, oscs };
  }

  // ───────── making room ─────────
  // A claim on the room: who, how deep (a row of DUCK), how strongly (0…1), for how long. A claim that is renewed every
  // moment (a conversation, a voice being heard) follows the strength it is given; one made once (a big moment) keeps the
  // most it was ever given until its time is up.
  function hold(name, p, k = 1, secs = Infinity, follow = false) {
    if (!ctx) return; const now = ctx.currentTime, c = claims.get(name), on = c && now < c.until;
    claims.set(name, { p, k: follow || !on ? k : Math.max(c.k, k), until: follow || !on ? now + secs : Math.max(c.until, now + secs) });
  }
  function moment(k = 1, secs = 2) {   // something big is happening here (or, quieter, somewhere else): everything gives way to it
    if (!ctx) return; if (scope) { k *= scope.k; if (k < 0.3) return; }
    hold('big', DUCK.big, clamp(k), secs);
  }
  // the half-second of nothing before something very large: the soundtrack and the world drawn right down, to the sample,
  // and let back slowly behind it
  function dip(t, depth = 0.15, fall = 0.12, wait = 0.2, rise = 1.2) {
    if (!ctx || (scope && scope.k < 0.7)) return;
    for (const g of [dipM.gain, dipA.gain]) { try { g.cancelScheduledValues(t); g.setTargetAtTime(depth, t, fall / 3); g.setTargetAtTime(1, t + fall + wait, rise / 3); } catch {} }
  }
  function voiceRms() {
    if (!vAn) return 0;
    try {
      if (vAn.getFloatTimeDomainData) vAn.getFloatTimeDomainData(vBuf);
      else { const b = new Uint8Array(vBuf.length); vAn.getByteTimeDomainData(b); for (let i = 0; i < b.length; i++) vBuf[i] = (b[i] - 128) / 128; }
      let e = 0; for (let i = 0; i < vBuf.length; i++) e += vBuf[i] * vBuf[i];
      return Math.sqrt(e / vBuf.length);
    } catch { return 0; }
  }
  function duckTick(now, dtT) {
    // a voice on the voice bus — a god, the storyteller, another player, whoever — is heard, and the room is made for it
    const r = voiceRms(); vEnv = Math.max(r, vEnv * Math.exp(-dtT / 0.45));
    const vk = sstep(0.006, 0.05, vEnv); if (vk > 0.03) hold('speech', DUCK.voice, vk, 0.15, true);
    let at = 9; for (const L of duckLo) L[0] = L[1] = 1;
    for (const [name, c] of claims) {
      if (now >= c.until || !(c.k > 0)) { claims.delete(name); duckRl = c.p.rl; continue; }
      const p = c.p, k = c.k, d = [p.m, p.a, p.f, p.s]; at = Math.min(at, p.at);
      for (let i = 0; i < 4; i++) { const v = 1 - (1 - d[i]) * k, L = duckLo[i]; if (v < L[0]) { L[1] = L[0]; L[0] = v; } else if (v < L[1]) L[1] = v; }
    }
    // (the deepest claim decides; a second one under it — a line spoken inside a conversation — takes a little more)
    const nodes = [duckM, duckA, duckF, duckS];
    for (let i = 0; i < 4; i++) { const v = duckLo[i][0] * Math.sqrt(duckLo[i][1]); if (Math.abs(v - duckV[i]) > 1e-4) { P(nodes[i].gain, v, (v < duckV[i] ? at : duckRl) / 3); duckV[i] = v; } }
  }

  // ───────── one-shot building blocks ─────────
  function done(src, nodes) {
    live++; made++;
    src.onended = () => { live--; for (const n of nodes) { try { n.disconnect(); } catch {} } };
  }
  function out(g, o, nodes) {
    let tail = g;
    if (o.lp) { const f = biq('lowpass', o.lp, 0.5); tail.connect(f); tail = f; nodes.push(f); }
    if (o.pan) { const p = pan(o.pan); if (p) { tail.connect(p); tail = p; nodes.push(p); } }
    tail.connect(o.dest || sfxBus);
  }
  function shape(g, o, t) {
    const a = Math.min(o.a ?? 0.02, o.dur * (o.swell ? 0.94 : 0.5));   // (swell: it may climb right to its end and be cut off there — the breath before a blow)
    const v = Math.max(0.0002, o.vol * trim);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + a);
    if (o.hold) g.gain.setValueAtTime(v, t + a + o.hold);
    g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
  }
  const fq = f => Math.min(16000, Math.max(12, f * dop));   // (a sound from somewhere he is closing on, or leaving, is heard higher, or lower)
  // filtered noise: { t, dur, type, f0, f1, f2, tf, q, a, swell, hold, vol, rate, lp, pan, dest }
  function nz(buf, o) {
    if (!ctx || !buf || live > cap() || !(o.vol > 0)) return;
    const t = o.t ?? ctx.currentTime, s = ctx.createBufferSource(), f = biq(o.type || 'bandpass', fq(o.f0), o.q ?? 1), g = gain(0);
    s.buffer = buf; s.loop = true; if (o.rate || dop !== 1) s.playbackRate.value = (o.rate || 1) * dop;
    f.frequency.setValueAtTime(fq(o.f0), t);
    if (o.f1) f.frequency.exponentialRampToValueAtTime(fq(o.f1), t + o.dur * (o.tf ?? 1));
    if (o.f2) f.frequency.exponentialRampToValueAtTime(fq(o.f2), t + o.dur);
    shape(g, o, t);
    const nodes = [s, f, g]; chain(s, f, g); out(g, o, nodes);
    s.start(t, Math.random() * Math.max(0.01, buf.duration - 0.5)); s.stop(t + o.dur + 0.05);
    done(s, nodes);
  }
  // a pitched tone: { t, dur, type, f0, f1, tf, a, hold, vol, det, lp, pan, dest }
  function tn(o) {
    if (!ctx || live > cap() || !(o.vol > 0)) return;
    const t = o.t ?? ctx.currentTime, os = ctx.createOscillator(), g = gain(0);
    os.type = o.type || 'sine'; os.frequency.setValueAtTime(fq(o.f0), t); if (o.det) os.detune.value = o.det;
    if (o.f1) os.frequency.exponentialRampToValueAtTime(fq(o.f1), t + o.dur * (o.tf ?? 1));
    shape(g, o, t);
    const nodes = [os, g]; os.connect(g); out(g, o, nodes);
    os.start(t); os.stop(t + o.dur + 0.05);
    done(os, nodes);
  }
  // one take of a recorded sound: never the one that played last, a touch off in pitch and level so even that one varies
  const lastTake = {};
  function smp(name, vol = 1, rate = 1, t, dest, pan = 0) {
    const L = samples[name]; if (!L || !L.length || !ctx || live > cap() || !(vol > 0)) return false;
    let k = Math.floor(Math.random() * L.length); if (L.length > 1 && k === lastTake[name]) k = (k + 1 + Math.floor(Math.random() * (L.length - 1))) % L.length;
    lastTake[name] = k;
    const S = L[k], s = ctx.createBufferSource(), g = gain(0), v = vol * trim * S.gain * rnd(0.88, 1.06);
    s.buffer = S.buf; s.playbackRate.value = rate * rnd(0.97, 1.03) * dop;
    { const t0 = t ?? ctx.currentTime, end = t0 + (S.buf.duration - S.off) / s.playbackRate.value;   // (in over 4 ms and out over the last 12: a take begun mid-wave, or cut off at its end, is a click)
      g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(v, t0 + 0.004); g.gain.setValueAtTime(v, Math.max(t0 + 0.004, end - 0.012)); g.gain.linearRampToValueAtTime(0, end); }
    if (pan && ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = clamp(pan, -1, 1); chain(s, g, p, dest || sfxBus); done(s, [s, g, p]); }
    else { chain(s, g, dest || sfxBus); done(s, [s, g]); }
    s.start(t ?? ctx.currentTime, S.off);
    return true;
  }
  const has = name => !!(samples[name] && samples[name].length);
  // the loops: each a buffer that never stops, behind its own fader (his own air and fire with the rest of his flight; the
  // rain and the water with the world)
  const loops = {};
  function startLoop(name, buf) {
    if (!ctx || loops[name]) return;
    const peak = analyse(buf)?.gain || 1; buf = seamless(buf);
    const s = ctx.createBufferSource(), g = gain(0);
    s.buffer = buf; s.loop = true; s.playbackRate.value = 1;
    const head = name === 'rainloop' ? biq('lowpass', 5200, 0.5) : g;   // (the recorded rain had two thirds of itself above 4 kHz: a hiss over everything in a storm)
    if (head !== g) chain(s, head, g, ambBus); else chain(s, g, name === 'waterloop' ? ambBus : airBus);
    s.start(ctx.currentTime, Math.random() * buf.duration);
    loops[name] = { s, g, peak, head, on: true, off: 0 };
  }
  // (A recording looped end to start jumps where it comes round: the fall and the rain by half their own loudness, every
  //  nine seconds — a tick. Its last tenth of a second is laid over its first instead, so it goes round without a seam.)
  function seamless(buf) {
    const sr = buf.sampleRate, F = Math.min(Math.floor(sr * 0.1), Math.floor(buf.length / 4)), n = buf.length - F;
    if (F < 64) return buf;
    try {
      const out = ctx.createBuffer(buf.numberOfChannels, n, sr);
      for (let c = 0; c < buf.numberOfChannels; c++) {
        const d = buf.getChannelData(c), o = out.getChannelData(c); o.set(d.subarray(0, n));
        for (let i = 0; i < F; i++) { const k = (i + 0.5) / F; o[i] = d[i] * Math.sin(k * Math.PI / 2) + d[n + i] * Math.cos(k * Math.PI / 2); }
      }
      return out;
    } catch { return buf; }
  }
  // The soundtrack: one long recording, streamed (not decoded whole), looping, through the music bus so it ducks under
  // every voice. When it is playing the generated score stands aside; the stings still play over it.
  function songMake() {
    if (song || !ctx || typeof Audio !== 'function') return;
    const el = new Audio(new URL('./music/icarus-theme.mp3', import.meta.url).href); el.loop = true; el.preload = 'auto';
    const src = ctx.createMediaElementSource(el), f = biq('lowpass', 20000, 0.5), g = gain(0);
    chain(src, f, g, duckM);
    song = { el, f, g, on: false };
    try { el.load(); } catch {}
  }
  // (made and loading ahead of the moment it is needed, so it starts the instant it is asked for)
  function songPrep() { try { songMake(); } catch (e) { console.warn('song', e); } }
  // The soundtrack is the only music there is: it starts with the player's first touch and loops for as long as the game
  // is open. (That first touch is the one moment every browser lets a page start a recording. It used to be started later,
  // from inside the game, at the leap: Safari, on a Mac, a phone or a headset, refused it there without a word, and what
  // played instead was the generated score. Now it is never stopped, only turned up and down, and asking for a place in
  // it — the bars before the first sung "Icarus", for the leap — moves it there.)
  function songPlay() { if (!song) return; try { const pr = song.el.play(); if (pr && pr.catch) pr.catch(() => { song.blocked = true; }); } catch {} }
  function songKick() { if (song && song.on && song.el.paused) songPlay(); }
  function songStart(offset = -1) {
    if (!ctx || typeof Audio !== 'function') return;
    try {
      songMake();
      const el = song.el, now = ctx.currentTime, was = song.on && !el.paused, g = song.g.gain, seek = offset >= 0 && (!was || Math.abs(el.currentTime - offset) > 0.3);
      if (!song.hooked) { song.hooked = true; if (typeof addEventListener === 'function') for (const ev of ['pointerdown', 'keydown', 'touchend', 'click']) addEventListener(ev, songKick, { capture: true, passive: true });
        el.addEventListener('ended', () => { try { el.currentTime = 0; } catch {} songPlay(); }); }   // (a loop that some browser forgets is started again by hand)
      if (seek) { try { el.currentTime = Math.max(0, offset); } catch {} }
      song.on = true; if (el.paused) songPlay();
      if (seek || !was) { g.cancelScheduledValues(now); g.setValueAtTime(0.0001, now); g.linearRampToValueAtTime(0.62, now + (offset > 1 ? 0.25 : 2.5)); }   // (cut in hard from the middle; fade in from the top)
    } catch (e) { console.warn('song', e); song = null; }
  }
  // Before he has ever flown, the song is held back: only its darkest bars, looped, low and filtered, under the storm.
  // Its first sung word is saved for the leap.
  function omenStart() {
    if (ctx) { if (!(song && song.on)) songStart(); return; }   // (there is one piece of music now: the soundtrack)
    if (!ctx || (omen && omen.on) || (song && song.on)) return;
    if (!omen) {
      const f = biq('lowpass', 2400, 0.6), g = gain(0); chain(f, g, duckM);
      omen = { f, g, on: false, src: null, buf: null };
      let url; try { url = new URL('./music/icarus-omen.wav', import.meta.url).href; } catch { return; }
      fetch(url).then(r => r.ok ? r.arrayBuffer() : null).then(b => b && new Promise(res => ctx.decodeAudioData(b, res, () => res(null)))).then(buf => {
        if (!buf || !omen) return; omen.buf = buf; if (omen.on) omenPlay();
      }).catch(() => {});
    }
    omen.on = true; if (omen.buf) omenPlay();
  }
  function omenPlay() {
    if (omen.src) return;
    const s = ctx.createBufferSource(); s.buffer = omen.buf; s.loop = true; s.connect(omen.f); s.start(ctx.currentTime + 0.05);
    omen.src = s; omen.g.gain.cancelScheduledValues(ctx.currentTime); omen.g.gain.setValueAtTime(0.0001, ctx.currentTime); omen.g.gain.linearRampToValueAtTime(1.25, ctx.currentTime + 4);
  }
  function omenStop(fade = 1.2) {
    if (!omen || !omen.on) return;
    omen.on = false; const s = omen.src; omen.src = null;
    omen.g.gain.cancelScheduledValues(ctx.currentTime); omen.g.gain.setValueAtTime(omen.g.gain.value, ctx.currentTime); omen.g.gain.linearRampToValueAtTime(0.0001, ctx.currentTime + fade);
    if (s) setTimeout(() => { try { s.stop(); } catch {} }, fade * 1000 + 150);
  }
  function songStop(fade = 2) { if (!song || !song.on) return; P(song.g.gain, 0, fade / 3); }   // (turned down, never stopped: update brings it back)
  const loopSet = (name, v, rate, tc = 0.35) => { const L = loops[name]; if (!L) return false; bed(L, v * Math.min(L.peak, 3) * 0.5, tc); if (rate && L.on) P(L.s.playbackRate, rate, 0.5); return true; };
  function analyse(buf) {
    const d = buf.getChannelData(0); let peak = 0, sum = 0;
    for (let i = 0; i < d.length; i++) { const a = Math.abs(d[i]); if (a > peak) peak = a; sum += a * a; }
    if (!(peak > 0.001)) return null;
    const rms = Math.sqrt(sum / d.length); let first = 0;
    while (first < d.length && Math.abs(d[first]) < peak * 0.03) first++;
    // (A take that is a few hundredths of a second of sound and then dead silence was cut short when it was made: played,
    //  it is a click. It is left out, and the made version of that sound carries it alone.)
    let last = d.length - 1; while (last > first && Math.abs(d[last]) < 1e-4) last--;
    if (buf.duration > 0.25 && (last - first) / buf.sampleRate < 0.07) return null;
    return { buf, gain: Math.min(0.8 / peak, 0.16 / Math.max(rms, 1e-4)), off: Math.max(0, first / buf.sampleRate - 0.005) };
  }
  function loadOne(file) {
    let url; try { url = new URL(`./sfx/${file}.mp3`, import.meta.url).href; } catch { return Promise.resolve(null); }
    return Promise.resolve().then(() => fetch(url)).then(r => r && r.ok ? r.arrayBuffer() : null)
      .then(b => b ? new Promise(res => {
        try { const p = ctx.decodeAudioData(b, res, () => res(null)); if (p && p.catch) p.catch(() => res(null)); } catch { res(null); }
      }) : null).catch(() => null);
  }
  let readyDone = null; const ready = new Promise(res => { readyDone = res; });   // (settles when every recording has loaded, or failed to: a test can wait on it)
  function loadSamples() {
    if (typeof fetch !== 'function') return readyDone(false);
    let iurl; try { iurl = new URL('./sfx/index.json', import.meta.url).href; } catch { return readyDone(false); }
    Promise.resolve().then(() => fetch(iurl)).then(r => r && r.ok ? r.json() : null).catch(() => null).then(index => {
      const list = index || Object.fromEntries(SAMPLE_NAMES.map(n => [n, 0])), jobs = [];
      for (const [name, n] of Object.entries(list)) {
        if (UNUSED.includes(name)) continue;
        const files = n ? Array.from({ length: n }, (_, k) => `${name}-${k + 1}`) : [name];
        files.forEach(f => jobs.push(loadOne(f).then(buf => {
          if (!buf) return;
          if (LOOPS.includes(name)) return startLoop(name, buf);
          const S = analyse(buf); if (S) (samples[name] = samples[name] || []).push(S);
        }).catch(() => {})));
      }
      Promise.all(jobs).then(() => readyDone(true));
    });
  }

  // ───────── instruments ─────────
  function padNote(m, t, dur, peak, dest, o = {}) {
    if (live > cap()) return;
    const att = o.att ?? 1.1, rel = o.rel ?? 2.4, f = mtof(m), g = gain(0), end = t + dur + rel * 1.5;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(peak, t + att); g.gain.setTargetAtTime(0, t + Math.max(att, dur), rel / 3.5);
    const o1 = ctx.createOscillator(); o1.type = o.dark ? 'triangle' : 'sawtooth'; o1.frequency.value = f; o1.detune.value = -7 - Math.random() * 3;
    const nodes = [o1, g]; o1.connect(g); o1.start(t); o1.stop(end);
    if (!low() || o.dark) {
      const o2 = ctx.createOscillator(); o2.type = o.dark ? 'sine' : (m > 58 ? 'sawtooth' : 'triangle'); o2.frequency.value = f; o2.detune.value = 8 + Math.random() * 3;
      o2.connect(g); o2.start(t); o2.stop(end); nodes.push(o2);
    }
    g.connect(dest); done(o1, nodes);
  }
  function pianoNote(m, t, vel, dest, dur) {
    if (live > cap()) return;
    const f = mtof(m), g = gain(0), lp = biq('lowpass', 700 + vel * 1500 + (m - 60) * 18, 0.5);
    dur = dur ?? clamp(3.2 - (m - 60) * 0.035, 1.6, 4);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vel * 0.24, t + 0.012);
    g.gain.exponentialRampToValueAtTime(vel * 0.09, t + 0.3); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const nodes = [g, lp], parts = low() ? [[1, 'triangle', 1]] : [[1, 'triangle', 1], [2, 'sine', 0.22], [1.003, 'sine', 0.5]];
    let first = null;
    for (const [mul, type, vol] of parts) {
      const o = ctx.createOscillator(), og = gain(vol); o.type = type; o.frequency.value = f * mul;
      chain(o, og, lp); o.start(t); o.stop(t + dur + 0.05); nodes.push(o, og); first = first || o;
    }
    chain(lp, g, dest); done(first, nodes);
  }
  function ostNote(m, t, vel, type = 'sawtooth') {
    if (live > cap() - 12) return;
    const g = gain(0), o = ctx.createOscillator(); o.type = type; o.frequency.value = mtof(m); o.detune.value = rnd(-5, 5);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vel * 0.075, t + 0.022); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.21);
    chain(o, g, ostIn); o.start(t); o.stop(t + 0.24); done(o, [o, g]);
  }
  function brassNote(m, t, dur, peak, dest, top) {
    if (live > cap()) return;
    const g = gain(0), lp = biq('lowpass', 180, 0.7), nodes = [g, lp];
    lp.frequency.setValueAtTime(180, t); lp.frequency.linearRampToValueAtTime(top, t + dur * 0.6); lp.frequency.linearRampToValueAtTime(240, t + dur + 0.5);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(peak, t + dur * 0.55); g.gain.linearRampToValueAtTime(0, t + dur + 0.6);
    let first = null;
    for (const det of low() ? [0] : [-6, 6]) {
      const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = mtof(m); o.detune.value = det;
      o.connect(lp); o.start(t); o.stop(t + dur + 0.7); nodes.push(o); first = first || o;
    }
    chain(lp, g, dest); done(first, nodes);
  }
  function subNote(m, t, dur, peak, dest) {
    if (live > cap()) return;
    const g = gain(0), o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = mtof(m);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(peak, t + 0.18); g.gain.setTargetAtTime(0, t + dur, 0.2);
    chain(o, g, dest); o.start(t); o.stop(t + dur + 1.2); done(o, [o, g]);
  }
  function drumHit(t, vel, dest) {
    tn({ t, dur: 0.75, f0: 104 + rnd(-4, 4), f1: 40, tf: 0.45, a: 0.004, vol: vel * 0.85, dest });
    nz(brown, { t, dur: 0.22, type: 'lowpass', f0: 520, f1: 160, a: 0.003, vol: vel * 0.55, dest });
    nz(pink, { t, dur: 0.06, f0: 900, q: 1, a: 0.002, vol: vel * 0.16, dest });
  }
  function choirNote(m, t, dur, peak, dest) {
    if (live > cap() - 8) return;
    const f = mtof(m), s = ctx.createBufferSource(), bp = biq('bandpass', f, 30), mk = gain(40), g = gain(0), tone = ctx.createOscillator(), tg = gain(0.12);
    s.buffer = pink; s.loop = true; tone.type = 'sine'; tone.frequency.value = f;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(peak, t + 1.9); g.gain.setTargetAtTime(0, t + Math.max(2, dur), 0.9);
    chain(s, bp, mk, g); chain(tone, tg, g); g.connect(dest);
    const end = t + dur + 4; s.start(t, Math.random() * 3); s.stop(end); tone.start(t); tone.stop(end);
    done(s, [s, bp, mk, g, tone, tg]);
  }
  function glassNote(m, t, peak, dest) {
    if (live > cap() - 8) return;
    const f = mtof(m), g = gain(0), nodes = [g]; let first = null;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(peak, t + 1.1); g.gain.setTargetAtTime(0, t + 1.3, 1.5);
    for (const [mul, vol] of [[1, 1], [2.76, 0.18], [5.4, 0.05]]) {
      const o = ctx.createOscillator(), og = gain(vol); o.type = 'sine'; o.frequency.value = f * mul; o.detune.value = rnd(-6, 6);
      chain(o, og, g); o.start(t); o.stop(t + 7.5); nodes.push(o, og); first = first || o;
    }
    g.connect(dest); done(first, nodes);
  }

  // ───────── the palette: bronze, horn, skin, spark, breath ─────────
  function bell(f, t, vol, dest, panV = 0) {
    if (live > cap() || !(vol > 0)) return;
    const g = gain(0), nodes = [g]; let first = null; vol *= rnd(0.9, 1.08) * trim;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t + 2.8);
    for (const [mul, v, d] of [[1, 1, 2.8], [2, 0.3, 1.4], [3.01, 0.08, 0.6]]) {
      const o = ctx.createOscillator(), og = gain(v); o.type = 'sine'; o.frequency.value = f * mul; o.detune.value = rnd(-4, 4);
      og.gain.setValueAtTime(v, t); og.gain.exponentialRampToValueAtTime(0.0001, t + d);
      chain(o, og, g); o.start(t); o.stop(t + 2.9); nodes.push(o, og); first = first || o;
    }
    const p = panV ? pan(panV) : null; if (p) { chain(g, p, dest || sfxWet); nodes.push(p); } else g.connect(dest || sfxWet);
    done(first, nodes);
  }
  // a horn: two reeds a hair apart, opening as it swells
  function horn(f, t, dur, vol, dest, top = 1200, a = 0.12) {
    if (live > cap() || !(vol > 0)) return;
    const g = gain(0), lp = biq('lowpass', 220, 0.8), nodes = [g, lp], hold = Math.max(a, dur * 0.55); let first = null; vol *= trim;
    lp.frequency.setValueAtTime(220, t); lp.frequency.linearRampToValueAtTime(top, t + Math.max(a, dur * 0.4)); lp.frequency.linearRampToValueAtTime(300, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + a); g.gain.setValueAtTime(vol, t + hold); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    for (const det of low() ? [0] : [-7, 6]) {
      const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.setValueAtTime(fq(f * 0.985), t); o.frequency.exponentialRampToValueAtTime(fq(f), t + a); o.detune.value = det;
      o.connect(lp); o.start(t); o.stop(t + dur + 0.05); nodes.push(o); first = first || o;
    }
    chain(lp, g, dest || sfxWet); done(first, nodes);
  }
  // a drum with a body under it: the skin, the shell, and the part that is felt
  function boom(t, k = 1, f = 100, dest) {
    tn({ t, dur: 0.7 + 0.3 * k, f0: jit(f, 0.04), f1: 38, tf: 0.45, a: 0.004, vol: 0.75 * k, dest: subBus });
    nz(brown, { t, dur: 0.2, type: 'lowpass', f0: 520, f1: 150, a: 0.003, vol: 0.5 * k, dest: dest || sfxWet });
    nz(pink, { t, dur: 0.05, f0: 900, q: 1, a: 0.002, vol: 0.14 * k, dest: dest || sfxWet });
  }
  // a spark: one crackle of burning wood, out of the bank of them (it used to be a burst of white noise above 2 kHz: a tss,
  // not a snap — and the leaves on fire threw out up to eighteen a second of them)
  function spark(t, v, p = 0, d) {
    if (!ctx || !pops || live > cap() || !(v > 0)) return;
    const s = ctx.createBufferSource(), g = gain(Math.min(2, v * 1.6 * trim)), nodes = [s, g];
    s.buffer = pops; s.playbackRate.value = rnd(0.85, 1.25) * dop; s.connect(g); out(g, { pan: p, dest: d }, nodes);
    s.start(t, Math.floor(Math.random() * POP_N) * POP_SLOT, POP_SLOT); done(s, nodes);
  }
  // a breath let out: air through a throat, no voice in it
  function breath(t, k = 1, p = 0, dur = 0.38) {
    nz(pink, { t, dur, f0: rnd(800, 1100), f1: 600, q: 1.6, a: dur * 0.3, vol: 0.085 * k, pan: p });
    nz(pink, { t, dur: dur * 0.9, f0: rnd(2200, 2800), f1: 1700, q: 2.2, a: dur * 0.3, vol: 0.045 * k, pan: p });
  }
  const mine = () => !scope;   // (a sound he made himself, not one heard from somewhere else: only those move his own air and fire)
  const kickFire = k => { if (!scope) kick.fire = Math.max(kick.fire, k); };
  const kickRuffle = k => { if (!scope) kick.ruffle = Math.max(kick.ruffle, k); };

  // ───────── sound effects ─────────
  const T = () => ctx.currentTime + 0.005;
  const sfx = {
    // ── flight ──
    // One beat of the wings. The downstroke is weight: air shoved down and back, a soft blow under it that is felt. Then
    // the feathers, a moment later, opening on the way up. Two wings, a hair apart. His own beat also shakes his feathers
    // and makes his fire gasp (the layers that never stop hear it).
    flap(power = 0.6) {
      if (!ctx) return; const t = T(), p = clamp(power), pn = rnd(-0.15, 0.15), k = has('flap') ? 0.5 : 1, f = rnd(0.9, 1.12);
      smp('flap', 0.5 * (0.45 + p), rnd(0.92, 1.1) - (1 - p) * 0.08, t, null, pn);
      nz(brown, { t, dur: 0.34 + p * 0.1, type: 'lowpass', f0: 300 * f, f1: 80, a: 0.045, vol: 0.55 * (0.4 + p) * k, pan: pn });
      nz(pink, { t, dur: 0.32, f0: rnd(760, 1000), f1: 180, q: 0.8, a: 0.055, vol: 0.2 * (0.5 + p) * k, pan: pn - 0.4 });
      nz(pink, { t: t + rnd(0.004, 0.014), dur: 0.32, f0: rnd(820, 1080), f1: 190, q: 0.8, a: 0.055, vol: 0.2 * (0.5 + p) * k, pan: pn + 0.4 });
      if (p > 0.4) tn({ t, dur: 0.24, f0: 72 * f, f1: 42, a: 0.03, vol: 0.26 * p * k, dest: subBus });
      nz(ruffle, { t: t + rnd(0.15, 0.2), dur: 0.2, f0: rnd(2300, 3300), f1: 1500, q: 0.7, a: 0.03, vol: 0.2 * (0.4 + p), pan: -pn * 3, rate: rnd(0.9, 1.3) });
      if (mine()) kick.flap = Math.max(kick.flap, 0.5 + 0.5 * p);
    },
    // the wings thrown open against the air to stop: a great soft blow, and every feather straining
    flare(k = 0.6) {
      if (!ctx) return; const t = T(); k = clamp(k);
      nz(brown, { t, dur: 0.55 + k * 0.2, type: 'lowpass', f0: jit(520), f1: 110, a: 0.05, vol: 0.5 * (0.4 + k) });
      nz(pink, { t, dur: 0.5, f0: jit(1500, 0.1), f1: 320, q: 0.7, a: 0.04, vol: 0.2 * (0.4 + k), pan: -0.45 });
      nz(pink, { t: t + 0.012, dur: 0.5, f0: jit(1600, 0.1), f1: 340, q: 0.7, a: 0.04, vol: 0.2 * (0.4 + k), pan: 0.45 });
      nz(ruffle, { t: t + 0.03, dur: 0.6, f0: 2600, f1: 1700, q: 0.6, a: 0.05, vol: 0.3 * (0.3 + k), rate: 1.3 });
      if (k > 0.5) tn({ t, dur: 0.3, f0: 66, f1: 40, a: 0.04, vol: 0.2 * k, dest: subBus });
      kickRuffle(0.5 + 0.5 * k);
    },
    // a hard turn: the outside wing tearing its way round, the inside one shivering near its stall. side: -1 turning left, +1 right
    bank(side = 0, k = 0.6) {
      if (!ctx) return; const t = T(), s = clamp(+side || 0, -1, 1); k = clamp(k);
      nz(pink, { t, dur: 0.6, f0: 520, f1: jit(1700, 0.1), f2: 460, tf: 0.4, q: 0.9, a: 0.22, vol: 0.24 * (0.4 + k), pan: -s * 0.7 });
      nz(ruffle, { t: t + 0.05, dur: 0.5, f0: jit(2200, 0.1), f1: 1500, q: 0.7, a: 0.08, vol: 0.28 * (0.3 + k), pan: s * 0.6, rate: rnd(1, 1.3) });
      nz(brown, { t, dur: 0.5, type: 'lowpass', f0: 160, f1: 380, f2: 120, tf: 0.5, a: 0.2, vol: 0.3 * k });
      kickRuffle(0.4 + 0.4 * k);
    },
    // feathers shaken out (k: how hard; side: which wing, 0 for both)
    ruffle(k = 0.5, side = 0) {
      if (!ctx) return; const t = T(), s = clamp(+side || 0, -1, 1); k = clamp(k);
      for (let i = 0, n = 2 + Math.floor(k * 2.5); i < n; i++) nz(ruffle, { t: t + i * rnd(0.07, 0.11), dur: rnd(0.14, 0.22), f0: rnd(2000, 3400), f1: rnd(1300, 1900), q: 0.7, a: 0.02, vol: 0.3 * (0.35 + k) * (1 - i * 0.14), pan: s * 0.6 + rnd(-0.25, 0.25), rate: rnd(0.9, 1.5) });
      kickRuffle(0.3 + 0.5 * k);
    },
    // the wings folding after a landing: three soft rustles going down, and the weight settling
    settle(k = 0.6) {
      if (!ctx) return; const t = T(); k = clamp(k);
      [0, 0.16, 0.36].forEach((d, i) => nz(ruffle, { t: t + d + rnd(0, 0.03), dur: 0.2 + i * 0.04, f0: 2600 - i * 420, f1: 1200 - i * 150, q: 0.7, a: 0.03, vol: 0.26 * (0.4 + k) * (1 - i * 0.22), pan: i === 1 ? 0.35 : i ? 0 : -0.35, rate: 1.2 - i * 0.15 }));
      nz(brown, { t: t + 0.05, dur: 0.3, type: 'lowpass', f0: 300, f1: 110, a: 0.05, vol: 0.2 * k });
      kickRuffle(0.3);
    },
    // the wings folded for the stoop: the air closing round him, tightening, and the snap of the feathers shut
    stoop() {
      if (!ctx) return; const t = T();
      nz(pink, { t, dur: 0.5, f0: jit(420), f1: jit(2600, 0.1), q: 1.5, a: 0.4, swell: true, vol: 0.3 });
      nz(brown, { t, dur: 0.45, type: 'lowpass', f0: 420, f1: 110, a: 0.03, vol: 0.4 });
      nz(ruffle, { t: t + 0.02, dur: 0.14, f0: 3000, f1: 1600, q: 0.8, a: 0.004, vol: 0.34, rate: 1.6 });
      tn({ t: t + 0.05, dur: 0.5, f0: 90, f1: 52, a: 0.2, vol: 0.2, dest: subBus });
      kickRuffle(0.5);
    },
    // out of the dive: the whole weight of him coming onto the wings, and the air torn open behind
    pullOut(k = 0.7) {
      if (!ctx) return; const t = T(); k = clamp(k);
      nz(brown, { t, dur: 0.9, type: 'lowpass', f0: 140, f1: jit(620), f2: 130, tf: 0.3, a: 0.12, vol: 0.6 * (0.4 + k) });
      nz(pink, { t: t + 0.05, dur: 1.0, f0: jit(2400, 0.1), f1: 380, q: 0.8, a: 0.08, vol: 0.26 * (0.4 + k), pan: rnd(-0.2, 0.2) });
      tn({ t, dur: 0.6, f0: 58, f1: 36, a: 0.08, vol: 0.4 * k, dest: subBus });
      nz(ruffle, { t: t + 0.1, dur: 0.7, f0: 2400, f1: 1500, q: 0.6, a: 0.1, vol: 0.26 * k, rate: 1.4 });
      kickRuffle(0.7); kickFire(0.5);
    },
    // faster than the air can get out of the way: a double blow, close together, and the long tear after it
    boom(k = 1) {
      if (!ctx) return; const t = T(); k = clamp(k);
      moment(0.5 * k, 1.2);
      for (const d of [0, 0.085]) { tn({ t: t + d, dur: 0.5, f0: 120, f1: 34, tf: 0.5, a: 0.003, vol: 0.6 * k, dest: subBus }); nz(white, { t: t + d, dur: 0.06, type: 'lowpass', f0: 4200, f1: 600, a: 0.002, vol: 0.3 * k, dest: bigBus }); }
      nz(brown, { t: t + 0.05, dur: 1.6, type: 'lowpass', f0: 1500, f1: 140, a: 0.02, vol: 0.5 * k, dest: bigBus });
    },
    // into the fast air behind another bird: the buffeting stops being his own, and he is drawn on
    slipstream() {
      if (!ctx) return; const t = T();
      nz(brown, { t, dur: 1.1, type: 'lowpass', f0: 200, f1: 520, f2: 240, tf: 0.5, a: 0.4, vol: 0.4 });
      nz(pink, { t, dur: 0.9, f0: 1800, f1: 700, q: 1.2, a: 0.5, vol: 0.16 });
      for (let i = 0; i < 4; i++) nz(brown, { t: t + 0.1 + i * rnd(0.07, 0.1), dur: 0.09, type: 'lowpass', f0: 260, f1: 140, a: 0.02, vol: 0.3 - i * 0.05, pan: i % 2 ? 0.3 : -0.3 });   // (the wake knocking at him)
      kickRuffle(0.6);
    },
    // a river of wind taking hold: wide, rising, and then steady
    jetstream() {
      if (!ctx) return; const t = T();
      nz(pink, { t, dur: 1.8, f0: 260, f1: 1100, f2: 620, tf: 0.6, q: 0.6, a: 0.9, vol: 0.36, pan: -0.5 });
      nz(pink, { t: t + 0.06, dur: 1.8, f0: 300, f1: 1250, f2: 700, tf: 0.6, q: 0.6, a: 0.9, vol: 0.36, pan: 0.5 });
      nz(brown, { t, dur: 1.9, type: 'lowpass', f0: 110, f1: 340, a: 1.0, vol: 0.5 });
      kickRuffle(0.4);
    },
    // warm air rising under him: a soft push up
    updraft() {
      if (!ctx) return; const t = T();
      nz(pink, { t, dur: 1.3, f0: 240, f1: 900, q: 0.7, a: 0.7, vol: 0.3, pan: rnd(-0.2, 0.2) });
      nz(brown, { t, dur: 1.2, type: 'lowpass', f0: 120, f1: 300, a: 0.6, vol: 0.4 });
      kickRuffle(0.3);
    },
    // a burst forward, thrown from the head: short, hot, gone
    dash() {
      if (!ctx) return; const t = T();
      nz(pink, { t, dur: 0.45, f0: jit(500, 0.1), f1: 3000, f2: 900, tf: 0.35, q: 1, a: 0.1, vol: 0.4 });
      nz(crackle, { t: t + 0.03, dur: 0.5, type: 'highpass', f0: 1600, a: 0.02, vol: 0.3, lp: 8000, rate: 1.4 });
      tn({ t, dur: 0.3, f0: 96, f1: 50, a: 0.01, vol: 0.3, dest: subBus });
      kickFire(0.7);
    },
    // ── fire ──
    ignite() {
      if (!ctx) return; const t = T(), f = jit(1, 0.08);
      moment(0.45, 1.1);
      smp('ignite', 0.7, 1, t);
      nz(pink, { t, dur: 0.3, f0: 320, f1: 1500, q: 0.9, a: 0.24, vol: 0.2 });   // the air drawn in
      nz(brown, { t: t + 0.04, dur: 1.7, type: 'lowpass', f0: 150 * f, f1: 2600 * f, f2: 320, tf: 0.35, a: 0.18, vol: 0.62 });
      nz(crackle, { t: t + 0.12, dur: 1.6, type: 'highpass', f0: 1200, a: 0.1, vol: 0.45, lp: 7000, rate: jit(1, 0.15) });
      tn({ t: t + 0.04, dur: 0.95, f0: 80 * f, f1: 37, a: 0.03, vol: 0.5, dest: subBus });
      kickFire(0.8);
    },
    // The rebirth. Everything else draws back; the air and the light are pulled in to one point; there is a held moment
    // of nothing; and then the weight of it — a drop that goes down under hearing — the body of the blast, and the fire
    // opening out of it with the bells on top. The soundtrack is let back in slowly, behind.
    rebirth() {
      if (!ctx) return; const t = T(), hit = t + 0.5;
      moment(1, 3.2); dip(t + 0.3, 0.1, 0.14, 0.22, 1.8);
      smp('rebirth', 0.8, 1, hit);
      nz(pink, { t, dur: 0.47, f0: 200, f1: 3400, q: 1.3, a: 0.44, swell: true, vol: 0.36, dest: sfxWet });                 // the breath in
      tn({ t, dur: 0.47, f0: 36, f1: 62, a: 0.42, swell: true, vol: 0.4, dest: subBus });
      nz(white, { t: t + 0.1, dur: 0.37, type: 'highpass', f0: 5000, f1: 9000, a: 0.33, swell: true, vol: 0.05, dest: sfxWet });
      tn({ t: hit, dur: 2.6, f0: 112, f1: 31, tf: 0.45, a: 0.008, vol: 0.95, dest: subBus });                 // the weight
      tn({ t: hit, dur: 0.3, f0: 190, f1: 58, a: 0.004, vol: 0.5, dest: bigBus });
      nz(brown, { t: hit, dur: 2.6, type: 'lowpass', f0: 2800, f1: 280, a: 0.02, vol: 0.75, dest: bigBus });   // the body
      nz(pink, { t: hit, dur: 0.12, type: 'lowpass', f0: 6000, f1: 900, a: 0.003, vol: 0.4, dest: bigBus });   // its edge
      nz(brown, { t: hit + 0.08, dur: 2.2, type: 'lowpass', f0: 380, f1: 1700, f2: 420, tf: 0.3, a: 0.25, vol: 0.5, dest: sfxWet });   // the fire opening
      nz(crackle, { t: hit + 0.05, dur: 2.6, type: 'highpass', f0: 1000, a: 0.06, vol: 0.5, lp: 7500 });
      bell(mtof(62), hit + 0.02, 0.07, sfxWet);
      [74, 81, 86, 90].forEach((m, i) => bell(mtof(m), hit + 0.06 + i * jit(0.075, 0.2), 0.062, sfxWet, (i - 1.5) * 0.25));
      kickFire(1);
    },
    wingsOpen() {
      if (!ctx) return; const t = T();
      smp('wingsopen', 0.7, rnd(0.95, 1.05), t);
      nz(white, { t, dur: 0.2, f0: jit(2600), f1: 600, q: 0.8, a: 0.008, vol: 0.26, lp: 5500 });
      nz(brown, { t: t + 0.02, dur: 0.45, type: 'lowpass', f0: 320, f1: 80, a: 0.03, vol: 0.7 });
      nz(pink, { t: t + 0.08, dur: 0.9, f0: 420, f1: 240, q: 0.6, a: 0.2, vol: 0.22 });
      nz(ruffle, { t: t + 0.1, dur: 0.5, f0: 2300, f1: 1400, q: 0.7, a: 0.04, vol: 0.2, rate: 1.1 });
      tn({ t: t + 0.02, dur: 0.3, f0: 78, f1: 44, a: 0.02, vol: 0.3, dest: subBus });
    },
    // the title burning down to nothing: the fire going out, then the last of it crackling as it falls apart
    flameout() {
      if (!ctx) return; const t = T();
      smp('flameout', 0.85, rnd(0.92, 1.0), t);
      nz(pink, { t, dur: 1.6, f0: 2400, f1: 500, q: 0.7, a: 0.05, vol: 0.28, lp: 6000 });
      nz(brown, { t, dur: 1.2, type: 'lowpass', f0: 700, f1: 160, a: 0.04, vol: 0.3 });
      for (let i = 0; i < 9; i++) nz(white, { t: t + 0.15 + Math.random() * 1.3, dur: 0.03 + Math.random() * 0.05, f0: 3000 + Math.random() * 3000, f1: 1500, q: 1.5, a: 0.002, vol: 0.1 + Math.random() * 0.1, pan: rnd(-0.5, 0.5) });
    },
    wingsFail() {
      if (!ctx) return; const t = T();
      smp('flameout', 0.75, 1, t);
      for (let i = 0; i < 3; i++) nz(pink, { t: t + i * jit(0.16, 0.15), dur: 0.24, f0: 1700 - i * 420, f1: 300, q: 1, a: 0.02, vol: 0.32 - i * 0.07 });
      nz(brown, { t, dur: 1.1, type: 'lowpass', f0: 1800, f1: 140, a: 0.03, vol: 0.5 });
      tn({ t, dur: 1.1, type: 'triangle', f0: 310, f1: 72, a: 0.03, vol: 0.12, lp: 900 });
    },
    swoop() {
      if (!ctx) return; const t = T();
      nz(pink, { t, dur: 0.8, f0: 300, f1: jit(1700, 0.1), f2: 240, tf: 0.45, q: 0.9, a: 0.3, vol: 0.5, pan: rnd(-0.3, 0.3) });
      nz(brown, { t, dur: 0.8, type: 'lowpass', f0: 140, f1: 420, f2: 100, tf: 0.5, a: 0.3, vol: 0.5 });
    },
    roll() {
      if (!ctx) return; const t = T();
      smp('roll', 0.7, rnd(0.95, 1.05), t);
      [[0, 0.5], [jit(0.17, 0.1), 0.36], [jit(0.36, 0.1), 0.42]].forEach(([d, v]) => {
        tn({ t: t + d, dur: 0.2, f0: rnd(78, 96), f1: 44, a: 0.004, vol: v });
        nz(brown, { t: t + d, dur: 0.12, type: 'lowpass', f0: 700, f1: 200, a: 0.003, vol: v * 0.7 });
      });
      nz(pink, { t, dur: 0.6, f0: 900, f1: 380, q: 0.6, a: 0.05, vol: 0.14 });
    },
    // coming down on his feet: the blow, the ground's answer, and (hard enough) the grit thrown out
    land(strength = 0.5) {
      if (!ctx) return; const t = T(), s = clamp(strength), k = has('land') ? 0.5 : 1;
      smp('land', 0.35 + s * 0.55, rnd(0.95, 1.05) - s * 0.08, t);
      tn({ t, dur: 0.26 + s * 0.2, f0: jit(92 + s * 20, 0.05), f1: 40, a: 0.004, vol: (0.22 + s * 0.45) * k, dest: s > 0.5 ? subBus : null });
      nz(brown, { t, dur: 0.16 + s * 0.1, type: 'lowpass', f0: 500 + s * 500, f1: 150, a: 0.003, vol: (0.2 + s * 0.4) * k, pan: rnd(-0.1, 0.1) });
      if (s > 0.6) nz(pink, { t: t + 0.02, dur: 0.4, f0: 700, f1: 300, q: 0.6, a: 0.02, vol: 0.12 });
      if (s > 0.75) for (let i = 0; i < 3; i++) nz(brown, { t: t + rnd(0.05, 0.3), dur: 0.05, type: 'lowpass', f0: rnd(700, 1300), f1: 250, a: 0.002, vol: rnd(0.06, 0.14), pan: rnd(-0.5, 0.5) });
    },
    stumble() {
      if (!ctx) return; const t = T();
      sfx.land(0.9);
      nz(pink, { t: t + 0.05, dur: 0.85, f0: 620, f1: 300, q: 0.7, a: 0.05, vol: 0.26 });                 // the skid
      tn({ t: t + jit(0.42, 0.08), dur: 0.3, f0: 80, f1: 42, a: 0.004, vol: 0.4 });
      nz(brown, { t: t + 0.42, dur: 0.14, type: 'lowpass', f0: 600, f1: 180, a: 0.003, vol: 0.3 });
    },
    // something heavy stopping all at once (k: how much of it — a branch through to a body off a mountain)
    impact(k = 1) {
      if (!ctx) return; const t = T(); k = clamp(+k || 0, 0.1, 1);
      moment(0.7 * k, 1.1);
      smp('impact', 0.9 * k, 1, t);
      tn({ t, dur: 0.5 + 0.5 * k, f0: jit(74, 0.05), f1: 24, tf: 0.5, a: 0.004, vol: 0.6 * k, dest: subBus });
      tn({ t, dur: 0.5, f0: 150, f1: 50, a: 0.003, vol: 0.36 * k, dest: bigBus });
      nz(white, { t, dur: 0.09, type: 'lowpass', f0: 3000, f1: 500, a: 0.002, vol: 0.36 * k, dest: bigBus });
      nz(brown, { t, dur: 0.7, type: 'lowpass', f0: 1100, f1: 120, a: 0.004, vol: 0.75 * k, dest: sfxWet });
      if (k > 0.5) for (let i = 0; i < 4; i++) nz(brown, { t: t + rnd(0.1, 0.6), dur: rnd(0.04, 0.08), type: 'lowpass', f0: rnd(600, 1400), f1: 220, a: 0.002, vol: rnd(0.06, 0.16) * k, pan: rnd(-0.6, 0.6) });
    },
    // a dull heavy blow that is not a landing: the ground heaving, a body struck
    thud(k = 0.85) {
      if (!ctx) return; const t = T(); k = clamp(+k || 0.85, 0.1, 1);
      tn({ t, dur: 0.42, f0: jit(70, 0.06), f1: 34, a: 0.006, vol: 0.7 * k, dest: subBus });
      nz(brown, { t, dur: 0.26, type: 'lowpass', f0: jit(420, 0.1), f1: 110, a: 0.005, vol: 0.5 * k });
      nz(pink, { t: t + 0.01, dur: 0.12, type: 'lowpass', f0: 1400, f1: 400, a: 0.003, vol: 0.3 * k });
      tn({ t, dur: 0.2, f0: jit(160, 0.08), f1: 74, a: 0.004, vol: 0.3 * k });   // (the part of it a small speaker can say)
    },
    splash(big) {
      if (!ctx) return; const t = T(), d = big ? 1.7 : 0.9, v = big ? 1 : 0.6;
      smp('splash', 0.8 * v, big ? 0.9 : 1.1, t);
      nz(white, { t, dur: d, type: 'highpass', f0: 900, f1: 2400, a: 0.02, vol: 0.3 * v, lp: 6000, dest: sfxWet });
      nz(pink, { t, dur: d * 0.8, f0: jit(1400, 0.1), f1: 400, q: 0.5, a: 0.02, vol: 0.4 * v });
      tn({ t, dur: 0.5, f0: 130, f1: 48, a: 0.006, vol: 0.5 * v, dest: big ? subBus : null });
      for (let i = 0; i < (big ? 6 : 3); i++) { const f = rnd(280, 520); tn({ t: t + 0.15 + rnd(0.7), dur: 0.09, f0: f, f1: f * 2.1, a: 0.01, vol: 0.06, pan: rnd(-0.5, 0.5) }); }
    },
    morph(seconds = 3) {
      if (!ctx) return; const t = T(), d = Math.max(0.8, seconds);
      moment(0.5, d + 0.8);
      smp('morph', 0.6, 1, t, sfxWet);
      nz(pink, { t, dur: d, f0: 260, f1: 4200, q: 1.4, a: d * 0.9, swell: true, vol: 0.3, dest: sfxWet });
      tn({ t, dur: d + 0.4, f0: 55, f1: 110, a: d * 0.6, vol: 0.3 });
      [62, 69, 74, 77].forEach((m, i) => tn({ t: t + i * d * 0.12, dur: d - i * d * 0.12 + 0.3, f0: mtof(m), f1: mtof(m + 12), a: d * 0.5, vol: 0.05, dest: sfxWet, pan: (i - 1.5) * 0.3 }));
      [86, 93, 98].forEach((m, i) => bell(mtof(m), t + d - 0.05 + i * 0.06, 0.05, sfxWet, (i - 1) * 0.3));
      tn({ t: t + d - 0.03, dur: 0.9, f0: 92, f1: 40, a: 0.004, vol: 0.5, dest: subBus });
    },
    reveal() {
      if (!ctx) return; const t = T();
      [50, 57, 62, 66, 69, 74].forEach((m, i) => padNote(m, t + i * 0.03, 2.4, 0.04, stingPad, { att: 0.45, rel: 3 }));
      tn({ t, dur: 1.6, f0: 73.4, f1: 36.7, a: 0.01, vol: 0.6, dest: subBus });
      nz(white, { t, dur: 2.2, type: 'highpass', f0: 4000, f1: 7000, a: 0.5, vol: 0.05, dest: sfxWet });
      [74, 78, 81, 86].forEach((m, i) => bell(mtof(m), t + 0.2 + i * 0.09, 0.06, sfxWet, (i - 1.5) * 0.2));
    },
    teleport() {
      if (!ctx) return; const t = T();
      nz(pink, { t, dur: 0.6, f0: 240, f1: 3600, q: 1.5, a: 0.54, swell: true, vol: 0.4, dest: sfxWet });
      tn({ t, dur: 0.6, f0: 220, f1: 880, a: 0.54, swell: true, vol: 0.07, dest: sfxWet });
      tn({ t: t + 0.56, dur: 0.6, f0: 96, f1: 38, a: 0.004, vol: 0.4, dest: subBus });
      nz(brown, { t: t + 0.56, dur: 0.9, type: 'lowpass', f0: 1600, f1: 200, a: 0.005, vol: 0.4, dest: sfxWet });
      bell(mtof(81), t + 0.58, 0.06, sfxWet);
    },
    thunder() {
      if (!ctx) return; const t = T();
      smp('thunder', 0.8, rnd(0.9, 1.05), t, sfxWet);
      nz(white, { t, dur: 0.16, type: 'highpass', f0: 1800, a: 0.004, vol: 0.4, lp: 6500, dest: sfxWet });
      nz(pink, { t: t + 0.02, dur: jit(1.5, 0.15), type: 'lowpass', f0: 1900, f1: 200, a: 0.02, vol: 0.6, dest: sfxWet, pan: rnd(-0.3, 0.3) });   // the tear of it, rolling down into the rumble
      for (let i = 0; i < 5; i++) nz(brown, { t: t + 0.05 + i * rnd(0.4, 0.75), dur: rnd(0.9, 1.6), type: 'lowpass', f0: rnd(180, 340), f1: 70, a: 0.05, vol: 0.9 - i * 0.14, dest: sfxWet, pan: rnd(-0.4, 0.4), rate: 0.6 });
      tn({ t, dur: 2.2, f0: jit(52, 0.06), f1: 28, a: 0.02, vol: 0.5, dest: subBus });
    },
    // Through a ring of light: the air tearing past on both sides as he threads it, the hoop catching with a soft whoomp
    // and a crackle, and a bell that climbs one step of the scale with every ring in the line — a fifth above it when he
    // went through the heart, and the whole chord when the line is done. (together: another bird went through with him —
    // a second bell answers a third above, a breath late and to one side.)
    ring(i = 0, perfect = false, last = false, together = false) {
      if (!ctx) return; const t = T();
      const steps = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24], f = 392 * Math.pow(2, steps[Math.min(i, steps.length - 1)] / 12);
      nz(white, { t, dur: 0.42, f0: jit(4800, 0.08), f1: 650, q: 0.8, a: 0.008, vol: 0.22, pan: -0.7 });
      nz(white, { t: t + 0.01, dur: 0.42, f0: jit(4600, 0.08), f1: 620, q: 0.8, a: 0.008, vol: 0.22, pan: 0.7 });
      nz(pink, { t, dur: 0.55, type: 'lowpass', f0: 2800, f1: 260, a: 0.015, vol: 0.42 });
      nz(brown, { t: t + 0.03, dur: 0.95, type: 'lowpass', f0: 170, f1: 1700, f2: 240, tf: 0.22, a: 0.04, vol: 0.6 });
      nz(crackle, { t: t + 0.07, dur: 1.5, type: 'highpass', f0: 1400, a: 0.07, vol: 0.3, lp: 8000, rate: jit(1, 0.2) });
      smp('ignite', 0.32, 1.2 + Math.min(i, 8) * 0.03, t + 0.02);
      tn({ t, dur: 0.5, f0: 110, f1: 52, a: 0.01, vol: perfect ? 0.45 : 0.3, dest: subBus });
      bell(f, t + 0.02, perfect ? 0.13 : 0.09, sfxWet);
      bell(f * 2, t + 0.05, 0.028, sfxWet);
      if (perfect) bell(f * 1.5, t + 0.1, 0.07, sfxWet);
      if (together) { bell(f * 1.25, t + 0.14, 0.06, sfxWet, rnd(0.4, 0.7) * (Math.random() < 0.5 ? -1 : 1)); nz(brown, { t: t + 0.12, dur: 0.6, type: 'lowpass', f0: 200, f1: 1300, f2: 260, tf: 0.25, a: 0.04, vol: 0.3, pan: rnd(-0.6, 0.6) }); }
      if (last) { [1, 1.25, 1.5, 2, 2.5].forEach((m, k) => bell(f * m / 2, t + 0.3 + k * 0.085, 0.06, sfxWet, (k - 2) * 0.2)); tn({ t: t + 0.3, dur: 1.6, f0: 73.4, f1: 36.7, a: 0.05, vol: 0.4, dest: subBus }); }
      kickFire(0.5);
    },
    ringTogether(i = 0, perfect = false, last = false) { sfx.ring(i, perfect, last, true); },
    // Zeus does not speak; this is how he talks. A strike on top of him: the tear, a blast of white noise, the recorded
    // thunder twice over (one a little slower, so it is huge and wide), a blow under hearing, and a long roll away across
    // the mountains — with everything else out of its way, so nothing in the game is larger.
    zeus(big = true) {
      if (!ctx) return; const t = T(), k = big ? 1 : 0.75;
      moment(1, big ? 3.2 : 2.2);
      nz(white, { t, dur: 0.3, type: 'highpass', f0: 2600, f1: 800, a: 0.001, vol: 0.85 * k, lp: 11000, dest: bigBus });
      nz(white, { t: t + 0.02, dur: 0.9, f0: 2000, f1: 220, q: 0.45, a: 0.002, vol: 0.8 * k, dest: bigBus });
      for (let i = 0; i < 8; i++) nz(white, { t: t + 0.03 + i * rnd(0.02, 0.07), dur: 0.06, type: 'highpass', f0: rnd(2500, 6000), a: 0.001, vol: rnd(0.35, 0.65) * k, pan: rnd(-0.8, 0.8), dest: bigBus });
      smp('crack', 1.1 * k, rnd(0.92, 1.0), t, bigBus);
      smp('thunder', 1.2 * k, rnd(0.82, 0.9), t + 0.04, bigBus);
      smp('thunder', 0.85 * k, rnd(0.68, 0.74), t + 0.32, bigBus);
      tn({ t, dur: 2.8, f0: 70, f1: 22, tf: 0.5, a: 0.003, vol: 0.7 * k, dest: subBus });
      tn({ t: t + 0.05, dur: 1.4, f0: 41, f1: 24, a: 0.01, vol: 0.45 * k, dest: subBus });
      for (let i = 0; i < 7; i++) nz(brown, { t: t + 0.25 + i * rnd(0.35, 0.7), dur: rnd(1.2, 2.2), type: 'lowpass', f0: rnd(160, 320), f1: 55, a: 0.06, vol: (1.0 - i * 0.12) * k, dest: bigBus, pan: rnd(-0.7, 0.7) });
    },
    crack() {   // lightning right beside him: the tearing crack first, then everything it shakes loose
      if (!ctx) return; const t = T(), k = has('crack') ? 0.5 : 1;
      moment(0.8, 1.8);
      smp('crack', 1, rnd(0.95, 1.05), t, bigBus);
      nz(white, { t, dur: 0.22, type: 'highpass', f0: 2400, f1: 900, a: 0.001, vol: 0.8 * k, lp: 9000, dest: bigBus });
      nz(white, { t: t + 0.03, dur: 0.5, f0: 1800, f1: 300, q: 0.5, a: 0.002, vol: 0.65 * k, dest: bigBus });
      for (let i = 0; i < 5; i++) nz(white, { t: t + 0.05 + i * rnd(0.03, 0.08), dur: 0.07, type: 'highpass', f0: rnd(2500, 5000), a: 0.001, vol: rnd(0.3, 0.6) * k, pan: rnd(-0.6, 0.6), dest: bigBus });   // the crackle
      smp('thunder', 1, rnd(1.05, 1.2), t + 0.02, bigBus);
      tn({ t, dur: 1.6, f0: 90, f1: 26, tf: 0.3, a: 0.004, vol: 0.6, dest: subBus });
      for (let i = 0; i < 4; i++) nz(brown, { t: t + 0.12 + i * rnd(0.3, 0.6), dur: rnd(1, 1.8), type: 'lowpass', f0: rnd(220, 420), f1: 70, a: 0.03, vol: (0.9 - i * 0.16) * k, dest: bigBus, pan: rnd(-0.5, 0.5), rate: 0.6 });
    },
    // ── stone, water, fire in the world ──
    // stone on stone: a hard knock with a ring in it, and grit after
    clack(k = 0.6) {
      if (!ctx) return; const t = T(), f = rnd(140, 240) / (0.6 + k);
      tn({ t, dur: 0.16 + k * 0.2, type: 'sine', f0: f * 2.1, f1: f, a: 0.002, vol: 0.2 + k * 0.25, lp: 1400 });
      nz(white, { t, dur: 0.05, type: 'bandpass', f0: rnd(1800, 3200), f1: 900, q: 1.4, a: 0.002, vol: 0.3 + k * 0.3, pan: rnd(-0.3, 0.3) });
      for (let i = 0; i < 3 + k * 4; i++) nz(brown, { t: t + rnd(0.04, 0.45), dur: rnd(0.03, 0.08), type: 'lowpass', f0: rnd(500, 1300), f1: 200, a: 0.002, vol: rnd(0.08, 0.2) * k, pan: rnd(-0.6, 0.6) });
    },
    // water on fire: a long hiss going down, with spits in it
    hiss(k = 1) {
      if (!ctx) return; const t = T();
      nz(white, { t, dur: 1.6 + k, type: 'highpass', f0: 5200, f1: 2200, a: 0.03, vol: 0.18 + k * 0.14, lp: 9000 });
      nz(pink, { t, dur: 1.2 + k * 0.8, type: 'bandpass', f0: jit(3400, 0.1), f1: 1200, q: 0.7, a: 0.05, vol: 0.16 * k });
      for (let i = 0; i < 5; i++) nz(white, { t: t + rnd(0.05, 1.1), dur: 0.03, type: 'bandpass', f0: rnd(2500, 6000), f1: 1500, q: 2, a: 0.002, vol: rnd(0.1, 0.22), pan: rnd(-0.6, 0.6) });
    },
    // a torch taking: the breath in, the soft thump of it catching, the first crackle
    whoomph() {
      if (!ctx) return; const t = T();
      nz(pink, { t, dur: 0.5, type: 'lowpass', f0: 300, f1: jit(1400, 0.12), a: 0.3, vol: 0.3 });
      tn({ t: t + 0.26, dur: 0.5, type: 'sine', f0: jit(120, 0.08), f1: 48, a: 0.004, vol: 0.34, lp: 400 });
      for (let i = 0; i < 6; i++) nz(white, { t: t + 0.3 + rnd(0, 0.7), dur: 0.02, type: 'bandpass', f0: rnd(1800, 4200), f1: 900, q: 2.5, a: 0.002, vol: rnd(0.08, 0.2), pan: rnd(-0.5, 0.5) });
    },
    // something small catching fire: a coal picked up, a beacon lit — the puff, and three quick snaps
    kindle(k = 0.6) {
      if (!ctx) return; const t = T(); k = clamp(k);
      nz(pink, { t, dur: 0.22, type: 'lowpass', f0: 500, f1: jit(2200, 0.1), a: 0.12, vol: 0.2 * (0.5 + k) });
      nz(crackle, { t: t + 0.1, dur: 0.9, type: 'highpass', f0: 1800, a: 0.02, vol: 0.4 * (0.4 + k), lp: 8000, rate: rnd(1.2, 1.6) });
      for (let i = 0; i < 3; i++) spark(t + 0.12 + i * rnd(0.05, 0.11), rnd(0.12, 0.22) * (0.5 + k), rnd(-0.4, 0.4));
      tn({ t: t + 0.1, dur: 0.25, f0: jit(160, 0.1), f1: 70, a: 0.006, vol: 0.16 * k, lp: 500 });
    },
    // a part of a story done (n: which part), and the story finished (n = 0): horns, going up
    fanfare(n = 1) {
      if (!ctx) return; const t = T(), notes = n ? [[293.7, 0], [370, 0.14], [440, 0.28]].slice(0, 1 + Math.min(2, n)) : [[293.7, 0], [370, 0.16], [440, 0.32], [587.3, 0.5], [740, 0.5]];
      for (const [f, d] of notes) { horn(f, t + d, n ? 0.75 : 1.7, 0.075, sfxWet, 1500, 0.05); tn({ t: t + d, dur: n ? 0.7 : 1.6, type: 'triangle', f0: f * 2, f1: f * 2, a: 0.03, vol: 0.026, lp: 3000, dest: sfxWet }); }
      if (!n) { horn(146.8, t, 2.3, 0.07, sfxWet, 700, 0.3); tn({ t, dur: 2.2, f0: 73.4, f1: 73.4, a: 0.3, vol: 0.3, dest: subBus }); }
    },
    // a pond: something small going into still water
    plop(k = 0.5) {
      if (!ctx) return; const t = T();
      tn({ t, dur: 0.14, type: 'sine', f0: jit(320 + k * 200, 0.1), f1: 900 + k * 500, a: 0.004, vol: 0.14 + k * 0.1, lp: 2400 });
      nz(white, { t: t + 0.02, dur: 0.22, type: 'bandpass', f0: 2600, f1: 1200, q: 0.9, a: 0.01, vol: 0.1 + k * 0.12, pan: rnd(-0.3, 0.3) });
    },
    leaves() {   // through a tree: a short tearing rush, and twigs
      if (!ctx) return; const t = T(), k = has('leaves') ? 0.5 : 1, p = rnd(-0.3, 0.3);
      smp('leaves', 0.8, rnd(0.95, 1.1), t, null, p);
      nz(pink, { t, dur: 0.5, f0: jit(2400, 0.1), f1: 900, q: 0.6, a: 0.02, vol: 0.5 * k, pan: p });
      nz(white, { t, dur: 0.35, type: 'highpass', f0: 3000, f1: 1800, a: 0.01, vol: 0.2 * k, lp: 7000 });
      for (let i = 0; i < 4; i++) nz(brown, { t: t + rnd(0.02, 0.3), dur: 0.05, type: 'lowpass', f0: rnd(900, 1500), f1: 300, a: 0.002, vol: rnd(0.2, 0.4) * k, pan: rnd(-0.5, 0.5) });
    },
    surge() {   // the sea standing up: a long low swell of noise, and the air knocked out of the way
      if (!ctx) return; const t = T(), k = has('surge') ? 0.55 : 1;
      moment(0.6, 2.6);
      smp('surge', 0.95, 1, t, sfxWet);
      tn({ t, dur: 2.6, f0: 62, f1: 30, tf: 0.6, a: 0.25, vol: 0.5, dest: subBus });
      nz(brown, { t, dur: 3.4, type: 'lowpass', f0: 160, f1: 900, f2: 140, tf: 0.35, a: 0.5, vol: 0.9 * k, dest: sfxWet });
      nz(pink, { t: t + 0.3, dur: 3, f0: 500, f1: 1900, f2: 400, tf: 0.5, q: 0.5, a: 0.8, vol: 0.4 * k, dest: sfxWet });
      nz(white, { t, dur: 0.14, type: 'highpass', f0: 1500, a: 0.004, vol: 0.3 * k, lp: 6000 });
    },
    descend() {
      if (!ctx) return; const t = T();
      moment(0.7, 3);
      sfx.splash(true);
      smp('underworld', 0.85, 1, t + 0.15, sfxWet);
      nz(pink, { t: t + 0.1, dur: 3, type: 'lowpass', f0: 3200, f1: 110, tf: 0.8, a: 0.05, vol: 0.5, dest: sfxWet });   // the water closing overhead
      tn({ t: t + 0.1, dur: 3.4, f0: 84, f1: 27, a: 0.05, vol: 0.5, dest: subBus });
      [62, 63, 69].forEach((m, i) => glassNote(m + 12, t + 1 + i * 0.5, 0.05, sfxWet));
    },
    step(stone = false) {
      if (!ctx || live > cap() - 20) return; const t = T(), p = rnd(-0.12, 0.12), k = has('step') ? 0.4 : 1;
      smp(stone && has('stepstone') ? 'stepstone' : 'step', rnd(0.14, 0.2), rnd(0.92, 1.08), t, null, p);
      tn({ t, dur: 0.07, f0: rnd(100, 130), f1: 58, a: 0.003, vol: rnd(0.1, 0.14) * k, pan: p });                                 // the heel
      nz(pink, { t, dur: 0.05, f0: rnd(700, 1300) * (stone ? 1.6 : 1), q: 0.8, a: 0.003, vol: rnd(0.2, 0.3) * k, pan: p });        // the sole on the ground
      if (stone) nz(white, { t, dur: 0.02, type: 'highpass', f0: 3000, a: 0.002, vol: 0.05 * k, pan: p });
    },
    // a footfall on whatever is underfoot: the weight of the step, and the ground's own sound laid over it
    foot(kind = 'grass', k = 1) {
      if (!ctx || live > cap() - 20) return; const t = T(), p = rnd(-0.12, 0.12), v = Math.min(1.3, 0.6 + 0.5 * k);
      const hard = kind === 'stone' || kind === 'rock', soft = kind === 'snow' || kind === 'sand' || kind === 'ash', rec = hard && has('stepstone') ? 'stepstone' : 'step';
      if (kind !== 'water') {
        smp(rec, rnd(0.12, 0.17) * v * (soft ? 0.7 : 1), rnd(0.92, 1.08) * (kind === 'snow' ? 0.9 : 1), t, null, p);
        const w = v * (soft ? 0.7 : 1) * (has(rec) ? 0.4 : 1);
        tn({ t, dur: soft ? 0.09 : 0.07, f0: rnd(96, 128) * (hard ? 1.15 : 1), f1: 56, a: 0.003, vol: rnd(0.09, 0.13) * w, pan: p });                      // the heel
        nz(pink, { t, dur: 0.05, f0: rnd(700, 1200) * (hard ? 1.6 : soft ? 0.7 : 1), q: 0.8, a: 0.003, vol: rnd(0.16, 0.24) * w, pan: p });               // the sole
      }
      if (kind === 'grass') nz(pink, { t, dur: 0.09, f0: rnd(2200, 3200), q: 0.8, a: 0.004, vol: 0.05 * v, pan: p });   // the blades brushed aside
      else if (kind === 'leaves') { nz(pink, { t, dur: 0.07, f0: rnd(2600, 4200), q: 1.4, a: 0.002, vol: 0.09 * v, pan: p }); nz(pink, { t: t + 0.05, dur: 0.06, f0: rnd(1800, 3000), q: 1.2, a: 0.002, vol: 0.06 * v, pan: p }); }   // dry leaves crackling
      else if (kind === 'snow') for (let i = 0; i < 3; i++) nz(white, { t: t + i * 0.025 + rnd(0, 0.01), dur: 0.05, f0: rnd(2600, 4800), q: 2.2, a: 0.002, vol: 0.07 * v, pan: p });   // the crunch
      else if (kind === 'sand') nz(brown, { t, dur: 0.11, type: 'lowpass', f0: 1100, f1: 400, a: 0.01, vol: 0.12 * v, pan: p });
      else if (kind === 'water') { nz(pink, { t, dur: 0.16, f0: rnd(900, 1600), f1: 600, q: 0.9, a: 0.004, vol: 0.12 * v, pan: p }); tn({ t: t + 0.02, dur: 0.09, f0: rnd(320, 420), f1: 160, a: 0.004, vol: 0.05 * v }); }   // slosh, and the bloop
      else if (hard) nz(white, { t, dur: 0.025, type: 'highpass', f0: 3000, a: 0.002, vol: 0.05 * v, pan: p });   // the click of it
      else if (kind === 'ash') nz(brown, { t, dur: 0.12, type: 'lowpass', f0: 520, f1: 260, a: 0.01, vol: 0.13 * v, pan: p });
    },
    // air moved by something quick: up (opening, rising) or down (closing, falling). The plain one: the things that have
    // a sound of their own are further down.
    whoosh(up) {
      if (!ctx) return; const t = T(), k = has('whoosh') ? 0.45 : 1, p = rnd(-0.4, 0.4);
      smp('whoosh', 0.7, up ? rnd(1.0, 1.12) : rnd(0.85, 0.95), t, null, p);
      nz(pink, { t, dur: jit(0.75, 0.1), f0: up ? jit(240, 0.1) : jit(1900, 0.1), f1: up ? jit(2300, 0.1) : 210, tf: 0.7, q: 1.1, a: 0.07, vol: 0.5 * k, pan: p });
      nz(brown, { t, dur: 0.6, type: 'lowpass', f0: up ? 120 : 420, f1: up ? 420 : 100, a: 0.08, vol: 0.4 * k });
    },
    chime(notes = [523.25, 659.25, 783.99, 1046.5, 1318.5], gap = 0.13) {
      if (!ctx) return; const t = T(), n = Math.max(1, notes.length - 1);
      notes.forEach((f, i) => bell(f, t + i * gap + rnd(0, 0.008), 0.11, sfxWet, (i / n - 0.5) * 0.5));
    },
    // the hand on the game: a small warm tick, never quite the same note twice
    ui() { if (!ctx) return; const t = T(), f = [880, 987.77, 1174.66][Math.floor(Math.random() * 3)]; tn({ t, dur: 0.07, type: 'triangle', f0: f, f1: f * 0.985, a: 0.004, vol: 0.05, lp: 3600, dest: uiBus }); nz(pink, { t, dur: 0.03, f0: 3200, q: 2, a: 0.003, vol: 0.03, dest: uiBus }); },
    // the menu: a word catching fire, the strip coming down alight, a coal under whatever the hand is over, and her
    menuOpen() { if (!ctx) return; const t = T(); nz(pink, { t, dur: 0.55, f0: 500, f1: 3200, q: 0.7, a: 0.05, vol: 0.1, dest: uiBus }); nz(brown, { t, dur: 0.7, type: 'lowpass', f0: 300, f1: 900, a: 0.08, vol: 0.18, dest: uiBus }); tn({ t: t + 0.06, dur: 0.3, f0: 196, f1: 294, a: 0.02, vol: 0.04, dest: uiBus }); },
    menuClose() { if (!ctx) return; const t = T(); nz(pink, { t, dur: 0.32, f0: 2600, f1: 380, q: 0.7, a: 0.01, vol: 0.07, dest: uiBus }); tn({ t, dur: 0.18, f0: 294, f1: 196, a: 0.004, vol: 0.035, dest: uiBus }); },
    menuHover() { if (!ctx) return; nz(pink, { t: T(), dur: 0.09, f0: rnd(3100, 3700), f1: 2200, q: 2, a: 0.004, vol: 0.04, dest: uiBus }); },
    menuPick() { if (!ctx) return; const t = T(); nz(pink, { t, dur: 0.16, f0: 1800, f1: 4200, q: 1.2, a: 0.004, vol: 0.07, dest: uiBus }); tn({ t, dur: 0.09, f0: 660, f1: 990, a: 0.003, vol: 0.05, dest: uiBus }); },
    guideOpen() { if (!ctx) return; const t = T(); bell(mtof(81), t, 0.035, sfxWet); bell(mtof(88), t + 0.11, 0.03, sfxWet); },
    // the vultures under the world: a cry that starts high and tears downward
    screech(k = 1) { if (!ctx) return; const t = T(), f = jit(1, 0.08); tn({ t, dur: 0.5, f0: (1500 + 500 * k) * f, f1: 620, a: 0.012, vol: 0.05 * k }); tn({ t: t + 0.03, dur: 0.42, f0: (2300 + 600 * k) * f, f1: 900, a: 0.01, vol: 0.03 * k }); nz(pink, { t, dur: 0.45, f0: 2600 * f, f1: 1400, q: 3, a: 0.01, vol: 0.07 * k }); },
    // what a god does to the air: a horn, a bell, drums, a choir, a harp, a roar, a whisper, a chime — low, mid or high.
    // Each has something under it now: the horn its octave below, the drums their weight, the roar the ground.
    god(kind = 'horn', pitch = 'mid') {
      if (!ctx) return; const k = pitch === 'low' ? 0.5 : pitch === 'high' ? 2 : 1, T0 = ctx.currentTime + 0.005;
      if (kind === 'horn') { for (const [f, v] of [[146.8, 0.1], [220, 0.075], [293.7, 0.05]]) horn(f * k, T0, 2.7, v, sfxWet, 950 * k, 0.5); tn({ t: T0, dur: 2.6, f0: 73.4 * k, f1: 73.4 * k, a: 0.6, vol: 0.2, dest: subBus }); }
      else if (kind === 'bell') { for (const [m, v, dd] of [[1, 0.1, 4], [2.76, 0.05, 2.6], [5.4, 0.03, 1.6], [8.93, 0.018, 1]]) tn({ t: T0, dur: dd, type: 'sine', f0: 196 * k * m, f1: 196 * k * m, a: 0.004, vol: v, lp: 9000, dest: sfxWet }); tn({ t: T0, dur: 0.5, f0: 98 * k, f1: 60, a: 0.004, vol: 0.2, dest: subBus }); }
      else if (kind === 'drums') { for (let i = 0; i < 5; i++) { const t = T0 + i * (i < 3 ? 0.42 : 0.21) + (i >= 3 ? 0.42 : 0) + rnd(0, 0.012); boom(t, 0.42 + (i === 0 || i === 4 ? 0.14 : 0), 110 * k); } }
      else if (kind === 'choir') { for (const [f, p] of [[196, -0.5], [246.9, 0.1], [293.7, 0.5], [392, -0.2]]) { tn({ t: T0, dur: 3.6, type: 'triangle', f0: f * k, f1: f * k * 1.004, a: 1.2, vol: 0.05, lp: 1500 * k, pan: p, dest: sfxWet }); tn({ t: T0, dur: 3.6, type: 'sine', f0: f * k * 1.006, f1: f * k, a: 1.4, vol: 0.035, lp: 2200, pan: -p, dest: sfxWet }); } }
      else if (kind === 'harp') { [261.6, 329.6, 392, 523.3, 659.3, 784].forEach((f, i) => tn({ t: T0 + i * jit(0.09, 0.12), dur: 1.5, type: 'triangle', f0: f * k, f1: f * k, a: 0.003, vol: 0.075 * rnd(0.85, 1.05), lp: 4200, pan: -0.5 + i * 0.2, dest: sfxWet })); }
      else if (kind === 'roar') { tn({ t: T0, dur: 1.9, type: 'sawtooth', f0: 82 * k, f1: 52 * k, a: 0.15, vol: 0.13, lp: 520 }); tn({ t: T0, dur: 1.9, type: 'sawtooth', f0: 85.5 * k, f1: 49 * k, a: 0.2, vol: 0.1, lp: 700 }); tn({ t: T0, dur: 1.6, type: 'square', f0: 41 * k, f1: 30 * k, a: 0.1, vol: 0.07, lp: 260 }); nz(brown, { t: T0, dur: 1.8, type: 'lowpass', f0: 240, f1: 600, f2: 160, tf: 0.4, a: 0.2, vol: 0.5, dest: sfxWet }); tn({ t: T0, dur: 1.6, f0: 44, f1: 30, a: 0.15, vol: 0.4, dest: subBus }); }
      else if (kind === 'whisper') { for (let i = 0; i < 6; i++) tn({ t: T0 + i * 0.22 + Math.random() * 0.08, dur: 0.34, type: 'sawtooth', f0: (1700 + Math.random() * 1600) * k, f1: (900 + Math.random() * 900) * k, a: 0.06, vol: 0.016, lp: 5200, pan: Math.random() * 2 - 1, dest: sfxWet }); }
      else { [1046.5, 1318.5, 1568, 2093].forEach((f, i) => tn({ t: T0 + i * 0.11, dur: 1.8, type: 'sine', f0: f * k, f1: f * k, a: 0.004, vol: 0.05, lp: 9000, pan: (i % 2 ? 0.4 : -0.4), dest: sfxWet })); }
    },
    // ── small made things, one for each thing he can do, so that nothing happens in silence ──
    // coming down on a high place as the bird: the wings fold, and two notes a fifth apart say he has arrived
    perch() { if (!ctx) return; const t = T(); sfx.settle(0.6); bell(392, t + 0.05, 0.07, sfxWet, -0.15); bell(587.33, t + 0.19, 0.06, sfxWet, 0.15); },
    // a place with a name and a view: three notes going up, the last one held
    lookout() { if (!ctx) return; const t = T(); [587.33, 739.99, 880].forEach((f, i) => bell(f, t + i * 0.16, 0.085, sfxWet, (i - 1) * 0.25)); bell(1174.66, t + 0.52, 0.05, sfxWet); },
    // under the water: the surface closing over, then his breath going up past his ears
    plunge() { if (!ctx) return; const t = T(); nz(brown, { t, dur: 0.9, type: 'lowpass', f0: 1400, f1: 180, a: 0.02, vol: 0.5 }); nz(pink, { t: t + 0.05, dur: 0.4, f0: 2200, f1: 500, q: 0.8, a: 0.01, vol: 0.12 }); tn({ t, dur: 0.5, f0: 90, f1: 44, a: 0.02, vol: 0.3, dest: subBus }); },
    bubble(k = 1) { if (!ctx) return; const t = T(); for (let i = 0; i < 3; i++) { const f = rnd(380, 900); tn({ t: t + i * rnd(0.05, 0.11), dur: 0.07, f0: f, f1: f * 1.6, a: 0.004, vol: 0.05 * k, pan: rnd(-0.6, 0.6) }); } },
    // the map: a sheet shaken out, and laid away; and turned from flat to standing
    mapOpen() { if (!ctx) return; const t = T(); nz(pink, { t, dur: 0.32, f0: 900, f1: 3200, q: 0.6, a: 0.05, vol: 0.12, dest: uiBus }); tn({ t: t + 0.24, dur: 0.09, f0: 660, f1: 990, a: 0.004, vol: 0.06, dest: uiBus }); },
    mapClose() { if (!ctx) return; const t = T(); nz(pink, { t, dur: 0.26, f0: 3000, f1: 800, q: 0.6, a: 0.02, vol: 0.11, dest: uiBus }); tn({ t: t + 0.12, dur: 0.08, f0: 880, f1: 520, a: 0.004, vol: 0.055, dest: uiBus }); },
    mapFlip() { if (!ctx) return; const t = T(); tn({ t, dur: 0.06, f0: 740, a: 0.004, vol: 0.06, dest: uiBus }); tn({ t: t + 0.07, dur: 0.1, f0: 1110, a: 0.004, vol: 0.06, dest: uiBus }); },
    // the map under the hand: a dial that clicks as it turns (brighter as north comes to the top), a note that rises as the
    // view goes in, the table sliding, a bird noticed, a place chosen, a place that cannot be, and north found again
    mapTurn(k = 0) { if (!ctx) return; const t = T(); tn({ t, dur: 0.045, f0: 560 + k * 300, a: 0.003, vol: 0.03, dest: uiBus }); nz(pink, { t, dur: 0.06, f0: 2200, q: 2.5, a: 0.003, vol: 0.028, dest: uiBus }); },
    mapZoom(k = 0.5) { if (!ctx) return; const t = T(); tn({ t, dur: 0.08, f0: 280 + k * 620, f1: 320 + k * 760, a: 0.004, vol: 0.032, dest: uiBus }); },
    mapMove() { if (!ctx) return; const t = T(); nz(pink, { t, dur: 0.11, f0: jit(600, 0.15), f1: 1400, q: 0.7, a: 0.02, vol: 0.036, dest: uiBus }); },
    mapHover() { if (!ctx) return; const t = T(); tn({ t, dur: 0.05, f0: 1320, a: 0.003, vol: 0.036, dest: uiBus }); tn({ t: t + 0.05, dur: 0.08, f0: 1760, a: 0.003, vol: 0.03, dest: uiBus }); },
    mapPick() { if (!ctx) return; const t = T(); [76, 81, 88].forEach((m, i) => bell(mtof(m), t + i * 0.05, 0.05, sfxWet)); tn({ t, dur: 0.12, f0: 220, f1: 330, a: 0.004, vol: 0.06, dest: uiBus }); },
    mapNo() { if (!ctx) return; const t = T(); tn({ t, dur: 0.09, f0: 196, f1: 174, a: 0.004, vol: 0.05, dest: uiBus }); },
    mapNorth() { if (!ctx) return; const t = T(); bell(mtof(76), t, 0.045, sfxWet); bell(mtof(83), t + 0.09, 0.05, sfxWet); },
    // the smith's hammer on something that is not quite metal: the blow, the ring of it, and the hiss
    hammer() { if (!ctx) return; const t = T(); tn({ t, dur: 0.16, f0: jit(180, 0.05), f1: 70, a: 0.002, vol: 0.6 }); nz(pink, { t, dur: 0.06, type: 'highpass', f0: 2000, a: 0.004, vol: 0.8, lp: 7000 }); bell(mtof(86 + Math.floor(Math.random() * 3)), t + 0.01, 0.09, sfxWet); bell(mtof(93), t + 0.02, 0.04, sfxWet); nz(pink, { t: t + 0.08, dur: 0.5, f0: 5000, f1: 2500, q: 0.8, a: 0.02, vol: 0.06, dest: sfxWet }); },
    // someone new has begun: three soft notes, far off
    newcomer() { if (!ctx) return; const t = T(); bell(mtof(69), t, 0.04, sfxWet, -0.3); bell(mtof(76), t + 0.16, 0.045, sfxWet, 0); bell(mtof(81), t + 0.34, 0.035, sfxWet, 0.3); },
    // carried by the gods. Going: the air drawn up the column, a chord that climbs an octave with him, a low note as the
    // light takes hold, and a last bright thread as he is gone. Arriving: the column coming down, the weight of it
    // landing, and the light ringing off him
    beamUp() {
      if (!ctx) return; const t = T();
      nz(pink, { t, dur: 1.5, f0: 180, f1: 5200, q: 1.2, a: 0.9, vol: 0.34, dest: sfxWet });
      nz(white, { t: t + 0.2, dur: 1.3, type: 'highpass', f0: 5000, f1: 9000, a: 0.8, vol: 0.05, dest: sfxWet });
      [57, 64, 69, 74, 76].forEach((m, i) => tn({ t: t + i * 0.11, dur: 1.5 - i * 0.11, f0: mtof(m), f1: mtof(m + 12), a: 0.5, vol: 0.035, dest: sfxWet, pan: (i - 2) * 0.2 }));
      tn({ t, dur: 0.5, f0: 110, f1: 55, a: 0.01, vol: 0.5, dest: subBus });
      tn({ t: t + 1.45, dur: 0.5, f0: 1400, f1: 3200, a: 0.02, vol: 0.05, dest: sfxWet });
    },
    beamDown() {
      if (!ctx) return; const t = T();
      nz(pink, { t, dur: 0.9, f0: 5200, f1: 300, q: 1.2, a: 0.05, vol: 0.3, dest: sfxWet });
      tn({ t: t + 0.8, dur: 0.9, f0: 82, f1: 36, a: 0.004, vol: 0.45, dest: subBus });
      nz(brown, { t: t + 0.8, dur: 1.2, type: 'lowpass', f0: 1400, f1: 160, a: 0.005, vol: 0.45, dest: sfxWet });
      [69, 76, 81, 86].forEach((m, i) => bell(mtof(m), t + 0.86 + i * 0.07, 0.05, sfxWet, (i - 1.5) * 0.2));
    },
    // the photo camera: the two blades of a shutter
    shutter() { if (!ctx) return; const t = T(); nz(pink, { t, dur: 0.035, type: 'highpass', f0: 2600, a: 0.002, vol: 0.3, dest: uiBus }); nz(pink, { t: t + 0.085, dur: 0.05, type: 'highpass', f0: 1800, a: 0.002, vol: 0.24, dest: uiBus }); tn({ t, dur: 0.05, f0: 180, f1: 90, a: 0.003, vol: 0.12, dest: uiBus }); },
    // a god chosen: the ring of light settling over his head
    halo() { if (!ctx) return; const t = T(); [1046.5, 1318.5, 1568, 2093].forEach((f, i) => bell(f, t + i * 0.09, 0.06, sfxWet, (i - 1.5) * 0.3)); nz(pink, { t, dur: 1.1, type: 'highpass', f0: 6000, f1: 9000, q: 0.5, a: 0.3, vol: 0.035 }); },
    // a star falling: almost nothing
    meteor() { if (!ctx) return; tn({ t: T(), dur: 0.5, f0: jit(2600, 0.1), f1: 1300, a: 0.05, vol: 0.02, pan: rnd(-0.7, 0.7) }); },
    // (for sounds placed in the world) falling water, a breath of it; and a fire spitting
    fallGrain(k = 1) { if (!ctx) return; const t = T(); nz(brown, { t, dur: 1.5, type: 'lowpass', f0: rnd(700, 1100), f1: rnd(500, 800), a: 0.5, vol: 0.5 * k }); nz(pink, { t, dur: 1.3, type: 'highpass', f0: rnd(2400, 3600), q: 0.5, a: 0.5, vol: 0.09 * k }); },
    crackle(k = 1) { if (!ctx) return; const t = T(); for (let i = 0, n = 2 + Math.floor(Math.random() * 4); i < n; i++) spark(t + Math.random() * 0.7, rnd(0.12, 0.3) * k); nz(roar, { t, dur: 0.9, type: 'lowpass', f0: 500, f1: 900, a: 0.25, vol: 0.3 * k }); },
    // steam: what a cloud says when something burning goes through it
    sizzle(k = 0.5) {
      if (!ctx) return; const t = T();
      nz(pink, { t, dur: rnd(0.22, 0.4), type: 'highpass', f0: rnd(2400, 3200), f1: rnd(3800, 4800), q: 0.7, a: 0.03, vol: 0.16 * k, pan: rnd(-0.5, 0.5), lp: 7000 });
      nz(pink, { t: t + 0.02, dur: 0.12, f0: rnd(1900, 2600), q: 2.2, a: 0.004, vol: 0.07 * k, pan: rnd(-0.6, 0.6) });
    },
    // a tornado, heard from where it stands: a low roar that never settles, and the higher tearing of the air round it
    twister(k = 1) {
      if (!ctx) return; const t = T();
      nz(brown, { t, dur: 1.9, type: 'lowpass', f0: rnd(90, 130), f1: rnd(170, 240), f2: rnd(80, 110), tf: 0.5, a: 0.5, vol: 0.9 * k });
      nz(pink, { t: t + rnd(0, 0.3), dur: 1.4, f0: rnd(420, 620), f1: rnd(900, 1300), q: 1.4, a: 0.4, vol: 0.2 * k });
    },
    // a great wave: the sea drawing back, and then all of it arriving
    wave(k = 1) {
      if (!ctx) return; const t = T();
      nz(brown, { t, dur: 3.4, type: 'lowpass', f0: 120, f1: 900, f2: 180, tf: 0.55, a: 1.1, vol: 0.85 * k });
      nz(pink, { t: t + 1.5, dur: 2.2, type: 'highpass', f0: 1800, f1: 5200, q: 0.6, a: 0.5, vol: 0.2 * k });
      tn({ t: t + 1.6, dur: 1.4, f0: 60, f1: 32, a: 0.2, vol: 0.4 * k, dest: subBus });
    },
    // his heart, when the ground is coming up too fast: lub-dub, low, felt more than heard
    heart(k = 1) {
      if (!ctx) return; const t = T(), v = 0.35 + 0.4 * clamp(k);
      tn({ t, dur: 0.17, type: 'sine', f0: 64, f1: 38, a: 0.006, vol: v, dest: subBus });
      tn({ t: t + jit(0.23, 0.05), dur: 0.14, type: 'sine', f0: 58, f1: 36, a: 0.006, vol: v * 0.72, dest: subBus });
      tn({ t, dur: 0.12, f0: 128, f1: 80, a: 0.006, vol: v * 0.16 }); tn({ t: t + 0.23, dur: 0.1, f0: 116, f1: 76, a: 0.006, vol: v * 0.11 });   // (its octave, faintly: what is left of it on a small speaker)
    },
    // the bird has no words: this is what it has instead. Glad: two bright notes going up, the second held. Curious: one
    // short note with a question in it. Cross: a rasp, falling. Under a hand: a long soft purr.
    cry(mood = 'glad', k = 1) {
      if (!ctx) return; const t = T(), v = 0.3 * Math.max(0.3, Math.min(1.4, k)), f = jit(1, 0.05);
      if (mood === 'cross') { tn({ t, dur: 0.42, type: 'sawtooth', f0: 620 * f, f1: 240, a: 0.01, vol: v * 0.7, lp: 3800 }); nz(pink, { t, dur: 0.4, f0: 2400, f1: 900, q: 2.5, a: 0.02, vol: v * 0.7 }); tn({ t: t + 0.12, dur: 0.3, type: 'square', f0: 310 * f, f1: 150, a: 0.01, vol: v * 0.2, lp: 2400 }); }
      else if (mood === 'purr') { for (let i = 0; i < 10; i++) tn({ t: t + i * 0.085, dur: 0.07, type: 'triangle', f0: 150 + (i % 2) * 14, f1: 132, a: 0.01, vol: v * 0.5 }); tn({ t, dur: 0.85, type: 'sine', f0: 520, f1: 560, a: 0.2, vol: v * 0.16 }); }
      else if (mood === 'curious') { tn({ t, dur: 0.16, type: 'triangle', f0: 1250 * f, f1: 1820 * f, a: 0.008, vol: v * 0.7 }); tn({ t: t + 0.015, dur: 0.14, type: 'sine', f0: 2500 * f, f1: 3600 * f, a: 0.008, vol: v * 0.2 }); }
      else { tn({ t, dur: 0.13, type: 'triangle', f0: 1050 * f, f1: 1500 * f, a: 0.006, vol: v * 0.75 }); tn({ t: t + 0.15, dur: 0.34, type: 'triangle', f0: 1400 * f, f1: 2050 * f, a: 0.01, vol: v * 0.8, dest: sfxWet }); tn({ t: t + 0.15, dur: 0.3, type: 'sine', f0: 2800 * f, f1: 4100 * f, a: 0.01, vol: v * 0.2 }); }
    },
    // pushing off the ground: the scuff, and the cloth
    jump() {
      if (!ctx) return; const t = T(), k = has('jump') ? 0.4 : 1, p = rnd(-0.1, 0.1);
      smp('jump', 0.55, rnd(0.95, 1.08), t);
      tn({ t, dur: 0.08, f0: jit(120, 0.1), f1: 60, a: 0.003, vol: 0.14 * k, pan: p });
      nz(pink, { t, dur: 0.06, f0: jit(1000, 0.15), q: 0.8, a: 0.003, vol: 0.24 * k, pan: p });
      nz(pink, { t: t + 0.02, dur: 0.2, f0: jit(700, 0.1), f1: 1500, q: 0.8, a: 0.05, vol: 0.12 * k, pan: p });
    },
    // something going past, fast, on one side
    flyby(pan = 0) {
      if (!ctx) return; const t = T(), k = has('whoosh') ? 0.45 : 1, p = clamp(+pan || 0, -1, 1);
      smp('whoosh', 0.9, rnd(0.9, 1.1), t, null, p);
      nz(pink, { t, dur: 0.7, f0: jit(700, 0.1), f1: jit(2200, 0.1), f2: 420, tf: 0.4, q: 1, a: 0.24, vol: 0.5 * k, pan: p });
      nz(brown, { t, dur: 0.7, type: 'lowpass', f0: 200, f1: 520, f2: 140, tf: 0.4, a: 0.24, vol: 0.4 * k, pan: p * 0.6 });
    },
    // ── his fire in the trees ── (the layer that never stops is audio.brush; these are its first touch and its last)
    // a burning wingtip going into leaves: they are torn aside, they catch, the twigs snap, and the flame takes a mouthful
    brushHit(side = 0, k = 0.6) {
      if (!ctx) return; const t = T(), p = clamp(+side || 0, -1, 1) * 0.75; k = clamp(k);
      nz(ruffle, { t, dur: 0.34, f0: jit(2200, 0.12), f1: 900, q: 0.8, a: 0.012, vol: 0.75 * (0.4 + k), pan: p, rate: rnd(1.2, 1.5) });
      nz(roar, { t: t + 0.02, dur: 0.4, type: 'lowpass', f0: 400, f1: jit(1500, 0.12), f2: 450, tf: 0.35, a: 0.04, vol: 0.45 * (0.4 + k), pan: p, rate: 1.2 });
      for (let i = 0, n = 3 + Math.floor(k * 4); i < n; i++) spark(t + rnd(0.01, 0.28), rnd(0.06, 0.15) * (0.4 + k), p + rnd(-0.2, 0.2));
      nz(brown, { t: t + 0.04, dur: 0.28, type: 'lowpass', f0: 240, f1: jit(900, 0.15), f2: 300, tf: 0.4, a: 0.06, vol: 0.3 * k, pan: p * 0.7 });
      kickFire(0.4 + 0.4 * k); kickRuffle(0.3 + 0.3 * k);
    },
    // out of them again: what he lit still fizzing behind the wing, and embers going out one by one
    singe(side = 0, k = 0.5) {
      if (!ctx) return; const t = T(), p = clamp(+side || 0, -1, 1) * 0.7; k = clamp(k);
      nz(crackle, { t, dur: 0.7 + k * 0.5, type: 'lowpass', f0: 5500, f1: 2500, a: 0.03, vol: 0.5 * (0.4 + k), pan: p, rate: rnd(1.1, 1.4) });
      nz(roar, { t, dur: 0.6 + k * 0.4, type: 'lowpass', f0: jit(900, 0.1), f1: 260, a: 0.02, vol: 0.3 * (0.4 + k), pan: p });
      for (let i = 0, n = 2 + Math.floor(k * 4); i < n; i++) spark(t + 0.05 + Math.pow(Math.random(), 1.6) * 0.9, rnd(0.02, 0.05) * (0.4 + k), p + rnd(-0.25, 0.25));
    },
    // ── birds among birds ──
    // another bird of fire going past, close: thin and high as it comes, full and lower as it goes, the pitch dropping
    // through the moment it is beside him; its fire, and its wash across his own feathers. (side: which side it passed on;
    // closing: how fast the two were coming together)
    pass(side = 0, k = 0.7, closing = 120) {
      if (!ctx) return; const t = T(), s = clamp(+side || 0, -1, 1) || (Math.random() < 0.5 ? -0.6 : 0.6), v = 0.4 + clamp(k) * 0.6, c = Math.abs(+closing || 120);
      const d = clamp(80 / Math.max(40, c), 0.25, 1), up = clamp(1 + c / 500, 1.1, 1.6), all = d * 0.9 + 0.5;
      nz(brown, { t, dur: all, type: 'lowpass', f0: 520 * up, f1: 900 * up, f2: 260 / up, tf: d * 0.9 / all, a: d * 0.8, vol: 0.6 * v, pan: s * 0.8, rate: 1.4 });
      nz(pink, { t, dur: all, f0: 1500 * up, f1: 2300 * up, f2: 600 / up, tf: d * 0.9 / all, q: 1, a: d * 0.8, vol: 0.34 * v, pan: s * 0.6 });
      nz(crackle, { t: t + d * 0.5, dur: 0.8, type: 'highpass', f0: 1500, a: d * 0.35, vol: 0.4 * v, pan: s * 0.9, lp: 8000, rate: up });
      nz(ruffle, { t: t + d * 0.75, dur: 0.4, f0: 2400, f1: 1300, q: 0.7, a: 0.06, vol: 0.24 * v, pan: s, rate: 1.3 });
      if (k > 0.6) tn({ t: t + d * 0.7, dur: 0.35, f0: 80, f1: 44, a: 0.08, vol: 0.2 * v, dest: subBus });
      kickRuffle(0.3 + 0.4 * clamp(k));
    },
    // wings touching: the slap of feather on feather, a knock, and his own thrown out of their rows
    clip(side = 0, k = 0.6) {
      if (!ctx) return; const t = T(), p = clamp(+side || 0, -1, 1) * 0.7; k = clamp(k);
      nz(pink, { t, dur: 0.07, type: 'lowpass', f0: 3600, f1: 700, a: 0.002, vol: 0.5 * (0.4 + k), pan: p });
      tn({ t, dur: 0.16, f0: jit(150, 0.1), f1: 62, a: 0.003, vol: 0.34 * k, pan: p * 0.5 });
      nz(ruffle, { t: t + 0.02, dur: 0.45, f0: jit(2700, 0.1), f1: 1400, q: 0.7, a: 0.01, vol: 0.4 * (0.4 + k), pan: p, rate: rnd(1.2, 1.7) });
      for (let i = 0; i < 3; i++) spark(t + rnd(0.01, 0.2), rnd(0.1, 0.24) * k, p + rnd(-0.2, 0.2));
      kickRuffle(0.6 + 0.4 * k);
    },
    // struck, in a fight: the blow in the body, his own fire knocked out of him, feathers everywhere
    hit(k = 0.7, side = 0) {
      if (!ctx) return; const t = T(), p = clamp(+side || 0, -1, 1) * 0.6; k = clamp(k);
      moment(0.55 * k, 0.9);
      tn({ t, dur: 0.4, f0: jit(96, 0.06), f1: 36, a: 0.004, vol: 0.8 * k, dest: subBus });
      nz(brown, { t, dur: 0.3, type: 'lowpass', f0: 1500, f1: 160, a: 0.003, vol: 0.6 * k, pan: p, dest: bigBus });
      nz(white, { t, dur: 0.06, type: 'lowpass', f0: 5000, f1: 900, a: 0.002, vol: 0.3 * k, pan: p, dest: bigBus });
      nz(crackle, { t: t + 0.02, dur: 0.7, type: 'highpass', f0: 1300, a: 0.01, vol: 0.5 * k, pan: p, lp: 8000, rate: 1.5 });
      nz(ruffle, { t: t + 0.03, dur: 0.5, f0: 2500, f1: 1300, q: 0.7, a: 0.01, vol: 0.34 * k, pan: -p, rate: 1.5 });
      kickRuffle(1); kickFire(0.6);
    },
    // his own blow landing on another: sharper, brighter, the fire flaring where it went in, and one bronze note for it
    strike(k = 0.7, side = 0) {
      if (!ctx) return; const t = T(), p = clamp(+side || 0, -1, 1) * 0.6; k = clamp(k);
      nz(pink, { t, dur: 0.07, type: 'highpass', f0: 1800, f1: 800, a: 0.004, vol: 0.9 * k, pan: p, lp: 6500 });
      tn({ t, dur: 0.22, f0: jit(170, 0.08), f1: 70, a: 0.003, vol: 0.4 * k, pan: p * 0.5 });
      nz(brown, { t: t + 0.01, dur: 0.4, type: 'lowpass', f0: 300, f1: jit(1800, 0.1), f2: 400, tf: 0.3, a: 0.03, vol: 0.4 * k, pan: p });
      nz(crackle, { t: t + 0.03, dur: 0.5, type: 'highpass', f0: 1600, a: 0.01, vol: 0.4 * k, pan: p, lp: 8500, rate: 1.4 });
      bell(mtof(86) * jit(1, 0.01), t + 0.01, 0.05 * k, sfxWet, p);
    },
    // a challenge thrown at him: a drum, and a horn call going up a fifth
    challenge() { if (!ctx) return; const t = T(); boom(t, 0.6, 96); horn(293.66, t, 0.5, 0.09, sfxWet, 1500, 0.04); horn(440, t + 0.34, 1.1, 0.1, sfxWet, 1900, 0.05); horn(220, t + 0.34, 1.1, 0.05, sfxWet, 900, 0.08); nz(crackle, { t: t + 0.34, dur: 0.9, type: 'highpass', f0: 1500, a: 0.05, vol: 0.2, lp: 8000 }); },
    // his own, thrown: one short note, and the fire going away from him
    challengeSent() { if (!ctx) return; const t = T(); horn(440, t, 0.45, 0.08, sfxWet, 1700, 0.03); nz(pink, { t, dur: 0.6, f0: 500, f1: 2400, q: 1, a: 0.08, vol: 0.26, pan: rnd(-0.2, 0.2) }); nz(crackle, { t: t + 0.05, dur: 0.5, type: 'highpass', f0: 1800, a: 0.02, vol: 0.2, lp: 8000 }); },
    // taken up: two drums, and the call answered with the whole chord
    challengeAccept() { if (!ctx) return; const t = T(); boom(t, 0.7, 100); boom(t + 0.2, 0.85, 92); horn(293.66, t + 0.2, 1.2, 0.08, sfxWet, 1600, 0.05); horn(440, t + 0.2, 1.2, 0.07, sfxWet, 1800, 0.05); horn(587.33, t + 0.34, 1.05, 0.06, sfxWet, 2200, 0.05); kickFire(0.6); },
    challengeDecline() { if (!ctx) return; const t = T(); horn(440, t, 0.4, 0.06, sfxWet, 1100, 0.04); horn(293.66, t + 0.24, 0.7, 0.06, sfxWet, 800, 0.06); },
    // three, two, one: a drum that tightens, a note a step higher each time; and nought: the blow that lets them go
    countdown(n = 3) {
      if (!ctx) return; const t = T(); n = Math.round(+n || 0);
      if (n > 0) { const u = 3 - Math.min(3, n); tn({ t, dur: 0.3, f0: 130 + u * 22, f1: 60, a: 0.004, vol: 0.5 }); nz(brown, { t, dur: 0.14, type: 'lowpass', f0: 700, f1: 200, a: 0.003, vol: 0.36 }); bell(mtof(74 + u * 2), t, 0.05, sfxWet); }
      else { moment(0.5, 1); boom(t, 1, 110); horn(293.66, t, 0.9, 0.08, sfxWet, 2000, 0.03); horn(587.33, t, 0.9, 0.06, sfxWet, 2600, 0.03); nz(pink, { t, dur: 0.7, f0: 400, f1: 3000, q: 0.9, a: 0.1, vol: 0.3 }); }
    },
    // won. Not loud: wide. The ground note first, the horns opening upward out of it, one drum, bells climbing, his fire
    victory() {
      if (!ctx) return; const t = T(); moment(0.8, 3.5);
      tn({ t, dur: 3.4, f0: 36.7, f1: 36.7, a: 0.9, vol: 0.4, dest: subBus }); tn({ t, dur: 3.2, f0: 73.4, f1: 73.4, a: 0.6, vol: 0.2, dest: subBus });
      [[146.83, 0, 0.09], [220, 0.12, 0.08], [293.66, 0.24, 0.075], [369.99, 0.4, 0.06], [440, 0.4, 0.05]].forEach(([f, d, v]) => horn(f, t + d, 3 - d, v, sfxWet, 1700, 0.5));
      boom(t + 0.4, 1, 96, bigBus);
      [74, 78, 81, 86, 90, 93].forEach((m, i) => bell(mtof(m), t + 0.45 + i * 0.11, 0.06, sfxWet, (i - 2.5) * 0.22));
      nz(brown, { t: t + 0.4, dur: 2.4, type: 'lowpass', f0: 300, f1: 1600, f2: 380, tf: 0.3, a: 0.3, vol: 0.4, dest: sfxWet }); nz(crackle, { t: t + 0.4, dur: 2.5, type: 'highpass', f0: 1200, a: 0.1, vol: 0.34, lp: 8000 });
      kickFire(1);
    },
    // lost: the fire going down — a low third that sinks, air leaving, a few last embers, and no blow at all
    defeat() {
      if (!ctx) return; const t = T(); moment(0.6, 2.6);
      tn({ t, dur: 2.8, f0: 73.4, f1: 49, tf: 0.9, a: 0.3, vol: 0.3, dest: subBus });
      horn(146.83, t, 2.4, 0.07, sfxWet, 600, 0.6); horn(174.61, t + 0.1, 2.2, 0.05, sfxWet, 520, 0.7);
      nz(pink, { t, dur: 2.2, type: 'lowpass', f0: 2600, f1: 240, a: 0.1, vol: 0.2, dest: sfxWet });
      for (let i = 0; i < 5; i++) spark(t + 0.3 + rnd(0, 1.6), rnd(0.04, 0.1), rnd(-0.5, 0.5));
    },
    // a war called across the sky: a low horn a long way off, twice
    matchCalled() { if (!ctx) return; const t = T(); horn(146.83, t, 1.3, 0.09, sfxWet, 800, 0.25); horn(146.83, t + 1.0, 1.9, 0.1, sfxWet, 1000, 0.3); horn(220, t + 1.0, 1.9, 0.06, sfxWet, 900, 0.35); tn({ t, dur: 2.8, f0: 73.4, f1: 73.4, a: 0.5, vol: 0.3, dest: subBus }); },
    // a name on the card: one drum, one bronze note (each name a step higher than the last)
    fightCard(i = 0) { if (!ctx) return; const t = T(), steps = [0, 2, 5, 7, 9, 12, 14, 17]; boom(t, 0.5, 104); bell(mtof(62 + steps[Math.abs(i | 0) % steps.length]), t + 0.01, 0.06, sfxWet); nz(pink, { t, dur: 0.25, f0: 2400, f1: 700, q: 0.8, a: 0.01, vol: 0.1 }); },
    // the fight begins: the drum (twice, for a war), the horns on the ground note, and fire
    matchStart(duel = true) { if (!ctx) return; const t = T(); moment(0.6, 1.6); boom(t, 1, 100, bigBus); if (!duel) boom(t + 0.16, 0.8, 92, bigBus); horn(146.83, t, 1.6, 0.1, sfxWet, 1500, 0.06); horn(220, t, 1.6, 0.07, sfxWet, 1500, 0.06); nz(brown, { t, dur: 1.4, type: 'lowpass', f0: 200, f1: 1500, f2: 300, tf: 0.25, a: 0.08, vol: 0.4, dest: sfxWet }); nz(crackle, { t: t + 0.05, dur: 1.2, type: 'highpass', f0: 1400, a: 0.05, vol: 0.26, lp: 8000 }); },
    // ── climbing ──
    // A hand finding a hold. Stone: the slap of the palm, grit turning under the fingers. A tree: softer, lower, bark, and
    // now and then the trunk creaking. Left hand, then right (or the side asked for); never the same twice.
    hold(kind = 'stone', k = 0.6, side) {
      if (!ctx || live > cap() - 12) return; k = clamp(k);
      fl.hand = Number.isFinite(side) && side ? Math.sign(side) : -fl.hand;
      const t = T() + rnd(0, 0.035), p = fl.hand * rnd(0.18, 0.34), tree = kind === 'tree' || kind === 'bark' || kind === 'wood', rec = has('grab') ? 0.5 : 1;
      smp('grab', (tree ? 0.22 : 0.3) * (0.6 + k * 0.6), tree ? rnd(0.8, 0.9) : rnd(0.93, 1.07), t, null, p);
      if (tree) {
        tn({ t, dur: 0.07, f0: rnd(105, 140), f1: 66, a: 0.004, vol: 0.1 * (0.5 + k) * rec, pan: p });
        nz(pink, { t, dur: rnd(0.05, 0.07), f0: rnd(550, 850), q: 0.8, a: 0.004, vol: 0.4 * (0.5 + k) * rec, pan: p });
        nz(pink, { t: t + 0.01, dur: rnd(0.1, 0.18), f0: rnd(900, 1500), f1: 600, q: 1.6, a: 0.02, vol: 0.3 * (0.5 + k) * rec, pan: p });
        if (Math.random() < 0.3) tn({ t: t + 0.05, dur: rnd(0.12, 0.2), type: 'triangle', f0: rnd(180, 260), f1: rnd(140, 200), a: 0.03, vol: 0.03, lp: 900, pan: p });
      } else {
        tn({ t, dur: 0.06, f0: rnd(150, 200), f1: 84, a: 0.003, vol: 0.1 * (0.5 + k) * rec, pan: p });                                      // the palm: a small dull knock
        nz(pink, { t, dur: rnd(0.04, 0.06), f0: rnd(900, 1500), q: 0.8, a: 0.003, vol: 0.45 * (0.5 + k) * rec, pan: p });                    // skin on stone
        nz(white, { t, dur: 0.02, type: 'bandpass', f0: rnd(2200, 3600), q: 1.5, a: 0.002, vol: 0.07 * (0.5 + k) * rec, pan: p });
        for (let i = 0, n = 1 + Math.floor(Math.random() * 3); i < n; i++) nz(grit, { t: t + rnd(0.02, 0.16), dur: rnd(0.05, 0.12), type: 'bandpass', f0: rnd(1800, 3800), q: 1.2, a: 0.004, vol: rnd(0.1, 0.22) * (0.5 + k), pan: p + rnd(-0.1, 0.1), rate: rnd(0.8, 1.3) });   // grit turning under the fingers
      }
    },
    // a foot finding the rock: the toe scraping for it, and the weight going on (late: seconds after now)
    foothold(kind = 'stone', k = 0.6, late = 0) {
      if (!ctx || live > cap() - 12) return; const t = T() + Math.max(0, +late || 0) + rnd(0, 0.03), p = rnd(-0.2, 0.2), d = rnd(0.1, 0.2), soft = kind === 'tree' ? 0.6 : 1; k = clamp(k);
      nz(pink, { t, dur: d, f0: rnd(1100, 1900) * soft, f1: rnd(500, 800), q: 1.1, a: d * 0.3, vol: 0.12 * (0.5 + k), pan: p });
      nz(grit, { t, dur: d + 0.05, type: 'bandpass', f0: rnd(1500, 2600) * soft, q: 1, a: 0.01, vol: 0.14 * (0.5 + k) * soft, pan: p, rate: rnd(0.8, 1.2) });
      tn({ t: t + d * 0.8, dur: 0.07, f0: rnd(100, 130), f1: 60, a: 0.004, vol: 0.05 * (0.5 + k), pan: p });
      nz(pink, { t: t + d * 0.8, dur: 0.05, f0: rnd(600, 900), q: 0.8, a: 0.004, vol: 0.2 * (0.5 + k), pan: p });
    },
    // skin, leather or a whole body dragged on stone
    scrape(k = 0.5, seconds = 0.4) {
      if (!ctx) return; const t = T(), d = clamp(+seconds || 0.4, 0.1, 2), p = rnd(-0.25, 0.25); k = clamp(k);
      nz(pink, { t, dur: d, f0: jit(1500, 0.2), f1: jit(700, 0.2), q: 0.9, a: d * 0.2, vol: 0.14 * (0.4 + k), pan: p });
      nz(grit, { t, dur: d, type: 'bandpass', f0: jit(2400, 0.2), f1: 1300, q: 0.8, a: d * 0.15, vol: 0.26 * (0.4 + k), pan: p, rate: rnd(0.9, 1.4) });
    },
    // stones let go, ticking away down the face, each a little later than the one before
    pebbles(k = 0.5) {
      if (!ctx) return; const t = T(); k = clamp(k); let at = 0;
      for (let i = 0, n = 3 + Math.floor(k * 6); i < n; i++) {
        at += rnd(0.03, 0.16) * (1 + i * 0.12); const f = rnd(900, 2600), v = 1 - i / (n + 2), p = rnd(-0.5, 0.5);
        tn({ t: t + at, dur: 0.035, f0: f, f1: f * 0.7, a: 0.002, vol: rnd(0.03, 0.08) * v, pan: p, lp: 5000 });
        nz(brown, { t: t + at, dur: 0.03, type: 'lowpass', f0: rnd(900, 1800), f1: 400, a: 0.002, vol: rnd(0.05, 0.12) * v, pan: p });
      }
    },
    // the grip going: fingers tearing down the rock, what they pulled loose, and the breath it knocks out of him
    slip(k = 0.7) {
      if (!ctx) return; const t = T(); k = clamp(k);
      nz(pink, { t, dur: 0.3, f0: jit(2400, 0.1), f1: 600, q: 1, a: 0.01, vol: 0.26 * (0.5 + k), pan: rnd(-0.2, 0.2) });
      nz(grit, { t, dur: 0.4, type: 'bandpass', f0: 2800, f1: 1100, q: 0.8, a: 0.005, vol: 0.4 * (0.5 + k), rate: 1.2 });
      tn({ t: t + 0.02, dur: 0.14, f0: jit(130, 0.1), f1: 60, a: 0.004, vol: 0.2 * k });
      breath(t + 0.06, 1.3, 0, 0.22); sfx.pebbles(0.4 + 0.5 * k);
    },
    // a breath pushed out: the work of it
    effort(k = 0.5) { if (!ctx) return; breath(T(), 0.7 + clamp(k) * 0.9, rnd(-0.1, 0.1), rnd(0.3, 0.46)); },
    // over the top: both hands flat on the edge, the body dragged up across it, a breath, and his feet under him again
    mantle(k = 0.7) {
      if (!ctx) return; const t = T(); k = clamp(k);
      sfx.hold('stone', 0.8, -1);
      nz(brown, { t: t + 0.15, dur: 0.07, type: 'lowpass', f0: 900, f1: 260, a: 0.003, vol: 0.22, pan: 0.3 });
      nz(pink, { t: t + 0.2, dur: 0.6, f0: 1300, f1: 600, q: 0.8, a: 0.15, vol: 0.14 * (0.5 + k) });
      nz(grit, { t: t + 0.2, dur: 0.6, type: 'bandpass', f0: 2200, f1: 1200, q: 0.8, a: 0.1, vol: 0.2 * (0.5 + k), rate: 1 });
      breath(t + 0.5, 1.2, 0, 0.4);
      nz(brown, { t: t + 0.82, dur: 0.1, type: 'lowpass', f0: 520, f1: 150, a: 0.004, vol: 0.2, pan: -0.1 }); nz(brown, { t: t + jit(0.95, 0.03), dur: 0.1, type: 'lowpass', f0: 480, f1: 150, a: 0.004, vol: 0.16, pan: 0.1 });
      if (Math.random() < 0.6) sfx.pebbles(0.3);
    },
    // catching the face: both hands, and the body arriving after them (k: how hard he came at it)
    climbOn(k = 0.5, kind = 'stone') {
      if (!ctx) return; const t = T(); k = clamp(k);
      sfx.hold(kind, 0.6 + k * 0.4, -1);
      nz(brown, { t: t + 0.05, dur: 0.08, type: 'lowpass', f0: 1000, f1: 260, a: 0.003, vol: 0.2 * (0.5 + k), pan: 0.28 });
      nz(brown, { t: t + 0.09, dur: 0.16, type: 'lowpass', f0: 420, f1: 120, a: 0.006, vol: 0.3 * k });
      if (k > 0.5) { breath(t + 0.12, 1, 0, 0.25); sfx.pebbles(k * 0.6); }
    },
    // pushing away from it: feet off the rock, grit, and the air
    climbOff() {
      if (!ctx) return; const t = T();
      nz(brown, { t, dur: 0.09, type: 'lowpass', f0: 800, f1: 220, a: 0.003, vol: 0.26 }); nz(grit, { t, dur: 0.15, type: 'bandpass', f0: 2400, q: 1, a: 0.004, vol: 0.2, rate: 1.1 });
      nz(pink, { t: t + 0.04, dur: 0.4, f0: 600, f1: 1500, f2: 500, tf: 0.5, q: 0.8, a: 0.12, vol: 0.14 });
    },
    // The game's own call for a hand on the next hold. It is more than a hand now: sometimes a foot follows it, sometimes
    // grit comes away, and every few holds the work of it is heard — so a climb is never a metronome.
    grab(tree) {
      if (!ctx) return; const kind = tree ? 'tree' : 'stone', r = Math.random(); fl.holds++;
      sfx.hold(kind, rnd(0.4, 0.8));
      if (r < 0.34) sfx.foothold(kind, rnd(0.3, 0.7), rnd(0.1, 0.24));
      else if (r < 0.44 && !tree) sfx.pebbles(rnd(0.15, 0.4));
      if (fl.holds % (3 + Math.floor(Math.random() * 3)) === 0) breath(T() + 0.12, 0.8, 0, 0.32);
    },
    // ── things that had borrowed a sound, and now have their own ──
    // the death that is not a blow: the world lets go of him — the air drops out from under everything, and under that there is nothing
    fallThrough() {
      if (!ctx) return; const t = T(); moment(0.9, 2.6); dip(t, 0.25, 0.3, 0.8, 2);
      nz(pink, { t, dur: 1.6, type: 'lowpass', f0: 5000, f1: 180, a: 0.03, vol: 0.4, dest: sfxWet });
      tn({ t, dur: 2.6, f0: 98, f1: 26, tf: 0.8, a: 0.08, vol: 0.7, dest: subBus });
      tn({ t, dur: 2.2, type: 'triangle', f0: 196, f1: 49, a: 0.06, vol: 0.12, lp: 500, dest: sfxWet });
      nz(white, { t: t + 0.05, dur: 1.2, type: 'highpass', f0: 6000, f1: 2500, a: 0.02, vol: 0.05, dest: sfxWet });
    },
    // the wind catching what is left of him, and lifting
    catchWind() {
      if (!ctx) return; const t = T();
      nz(pink, { t, dur: 2, f0: 220, f1: 1300, f2: 700, tf: 0.6, q: 0.7, a: 1, vol: 0.34, dest: sfxWet });
      nz(brown, { t, dur: 2, type: 'lowpass', f0: 100, f1: 320, a: 1, vol: 0.4 });
      bell(mtof(81), t + 0.9, 0.03, sfxWet, -0.3); bell(mtof(88), t + 1.2, 0.025, sfxWet, 0.3);
    },
    // up out of the deep: the weight of the water coming off him, its roar thinning into air
    surface() {
      if (!ctx) return; const t = T();
      nz(brown, { t, dur: 0.9, type: 'lowpass', f0: 220, f1: 1600, a: 0.3, vol: 0.5 });
      nz(white, { t: t + 0.25, dur: 0.9, type: 'highpass', f0: 1200, f1: 3600, a: 0.1, vol: 0.2, lp: 7000, dest: sfxWet });
      for (let i = 0; i < 6; i++) { const f = rnd(300, 800); tn({ t: t + rnd(0, 0.5), dur: 0.08, f0: f, f1: f * 1.8, a: 0.006, vol: 0.05, pan: rnd(-0.6, 0.6) }); }
      tn({ t, dur: 0.6, f0: 60, f1: 110, a: 0.3, vol: 0.3, dest: subBus });
    },
    // a line of rings set down in the sky: each one catching, a step higher and a little further off than the last
    ringsAppear(n = 3) {
      if (!ctx) return; const t = T(); n = clamp(Math.round(+n || 3), 1, 6);
      for (let i = 0; i < n; i++) {
        const d = i * 0.13, v = 1 - i * 0.13, p = (i % 2 ? 1 : -1) * 0.12 * i;
        nz(brown, { t: t + d, dur: 0.4, type: 'lowpass', f0: 200, f1: jit(1200, 0.1), f2: 300, tf: 0.3, a: 0.05, vol: 0.3 * v, pan: p });
        bell(392 * Math.pow(2, [0, 2, 4, 7, 9, 12][i] / 12), t + d + 0.03, 0.04 * v, sfxWet, p);
      }
      nz(crackle, { t: t + 0.05, dur: 0.9, type: 'highpass', f0: 1500, a: 0.05, vol: 0.2, lp: 8000 });
    },
    // the title going: a page of fire turned, and the dark behind it
    titleLeave() {
      if (!ctx) return; const t = T();
      nz(pink, { t, dur: 1.2, f0: 300, f1: 2600, f2: 900, tf: 0.5, q: 0.8, a: 0.5, vol: 0.3, dest: sfxWet });
      nz(crackle, { t, dur: 1.3, type: 'highpass', f0: 1400, a: 0.2, vol: 0.24, lp: 8000 });
      tn({ t, dur: 1.4, f0: 55, f1: 82, a: 0.6, vol: 0.3, dest: subBus });
    },
    // onto the back of something that flies: feathers taking his weight, and one wingbeat under him
    mount() {
      if (!ctx) return; const t = T();
      nz(ruffle, { t, dur: 0.4, f0: 2000, f1: 1200, q: 0.7, a: 0.02, vol: 0.34, rate: 0.9 });
      nz(brown, { t: t + 0.04, dur: 0.2, type: 'lowpass', f0: 420, f1: 120, a: 0.01, vol: 0.4 });
      nz(brown, { t: t + 0.34, dur: 0.5, type: 'lowpass', f0: 300, f1: 80, a: 0.06, vol: 0.5 }); nz(pink, { t: t + 0.34, dur: 0.45, f0: 900, f1: 200, q: 0.8, a: 0.06, vol: 0.2 });
      tn({ t: t + 0.34, dur: 0.3, f0: 70, f1: 42, a: 0.04, vol: 0.26, dest: subBus });
    },
    // off its back: the push, feathers let go, and nothing under him
    dismount() {
      if (!ctx) return; const t = T();
      nz(brown, { t, dur: 0.12, type: 'lowpass', f0: 600, f1: 180, a: 0.004, vol: 0.3 }); nz(ruffle, { t, dur: 0.25, f0: 2400, f1: 1500, q: 0.7, a: 0.01, vol: 0.24, rate: 1.3 });
      nz(pink, { t: t + 0.05, dur: 0.8, f0: 1600, f1: 300, q: 0.9, a: 0.1, vol: 0.6 });
    },
    // thrown across the world: the air folding ahead of him, one long tearing run with the pitch climbing all the way
    warp() {
      if (!ctx) return; const t = T(); moment(0.4, 1.6);
      nz(pink, { t, dur: 1.6, f0: 200, f1: 4200, q: 1.6, a: 1.4, swell: true, vol: 0.4, dest: sfxWet });
      nz(brown, { t, dur: 1.5, type: 'lowpass', f0: 120, f1: 900, a: 1.0, vol: 0.5 });
      tn({ t, dur: 1.5, type: 'triangle', f0: 73.4, f1: 293.7, a: 1.1, vol: 0.06, lp: 1600, dest: sfxWet });
      tn({ t, dur: 0.5, f0: 100, f1: 46, a: 0.01, vol: 0.4, dest: subBus });
      nz(crackle, { t: t + 0.2, dur: 1.2, type: 'highpass', f0: 1800, a: 0.6, vol: 0.2, lp: 9000, rate: 1.5 });
    },
    // a name taken: a stroke of fire, and two notes that sign it
    rename() { if (!ctx) return; const t = T(); nz(pink, { t, dur: 0.3, f0: 1200, f1: 3600, q: 1.4, a: 0.05, vol: 0.12 }); nz(crackle, { t, dur: 0.4, type: 'highpass', f0: 2200, a: 0.02, vol: 0.14, rate: 1.6 }); bell(mtof(74), t + 0.18, 0.06, sfxWet, -0.2); bell(mtof(81), t + 0.32, 0.07, sfxWet, 0.2); },
    // a god who knows him fills his fire: warmth coming up from under, and high notes that stay
    blessing() {
      if (!ctx) return; const t = T();
      nz(brown, { t, dur: 1.6, type: 'lowpass', f0: 200, f1: 1500, f2: 500, tf: 0.5, a: 0.7, vol: 0.4, dest: sfxWet });
      tn({ t, dur: 1.8, f0: 73.4, f1: 110, a: 0.8, vol: 0.3, dest: subBus });
      [74, 81, 86, 93].forEach((m, i) => bell(mtof(m), t + 0.5 + i * 0.13, 0.05, sfxWet, (i - 1.5) * 0.25));
      nz(crackle, { t: t + 0.3, dur: 1.3, type: 'highpass', f0: 1300, a: 0.3, vol: 0.24, lp: 8000 }); kickFire(0.9);
    },
    // a way of flying changed
    modeSwitch() { if (!ctx) return; const t = T(); tn({ t, dur: 0.12, type: 'triangle', f0: 392, f1: 587.33, a: 0.01, vol: 0.06, lp: 3000, dest: uiBus }); bell(mtof(86), t + 0.1, 0.04, sfxWet); nz(pink, { t, dur: 0.2, f0: 900, f1: 2600, q: 1, a: 0.04, vol: 0.06, dest: uiBus }); },
    // someone said his name: two notes close together, the second one asking
    called() { if (!ctx) return; const t = T(); bell(mtof(81), t, 0.07, sfxWet, -0.2); bell(mtof(86), t + 0.12, 0.08, sfxWet, 0.2); tn({ t: t + 0.12, dur: 0.2, type: 'triangle', f0: 1174.66, f1: 1318.5, a: 0.01, vol: 0.03, lp: 4000, dest: uiBus }); },
    // a line of talk arriving: soft, wooden, two taps
    chat() { if (!ctx) return; const t = T(), f = [587.33, 659.25, 783.99][Math.floor(Math.random() * 3)]; tn({ t, dur: 0.09, type: 'sine', f0: f, f1: f * 1.02, a: 0.006, vol: 0.04, dest: uiBus }); tn({ t: t + 0.06, dur: 0.12, type: 'sine', f0: f * 1.5, a: 0.006, vol: 0.03, dest: uiBus }); },
    // a hand held out: a warm third, rising
    friendAsk() { if (!ctx) return; const t = T(); [69, 74, 78].forEach((m, i) => bell(mtof(m), t + i * 0.13, 0.05, sfxWet, (i - 1) * 0.2)); tn({ t, dur: 0.5, type: 'triangle', f0: 220, f1: 220, a: 0.1, vol: 0.03, lp: 1200, dest: sfxWet }); },
    // his agents, glad to see him: small bright voices one after another, each its own (n: how many)
    agents(n = 1) {
      if (!ctx) return; const t = T(); n = clamp(Math.round(+n || 1), 1, 6);
      for (let i = 0; i < n; i++) {
        const f = mtof([74, 78, 81, 86, 83, 90][i]), d = i * rnd(0.11, 0.17), p = (i % 2 ? 1 : -1) * 0.3;
        tn({ t: t + d, dur: 0.1, type: 'triangle', f0: f, f1: f * 1.26, a: 0.006, vol: 0.05, pan: p, lp: 5000 });
        tn({ t: t + d + 0.11, dur: 0.16, type: 'triangle', f0: f * 1.5, f1: f * 1.5, a: 0.006, vol: 0.045, pan: p, lp: 5000, dest: sfxWet });
      }
    },
    // a race gate taken: its air on both sides, and a note one step up from the last
    gate(i = 0) {
      if (!ctx) return; const t = T(), n = Math.abs(i | 0), steps = [0, 2, 4, 7, 9];
      nz(pink, { t, dur: 0.3, f0: jit(3200, 0.08), f1: 700, q: 0.8, a: 0.008, vol: 0.2, pan: -0.5 }); nz(pink, { t, dur: 0.3, f0: jit(3000, 0.08), f1: 660, q: 0.8, a: 0.008, vol: 0.2, pan: 0.5 });
      bell(587.33 * Math.pow(2, (steps[n % 5] + 12 * (Math.floor(n / 5) % 2)) / 12), t + 0.02, 0.08, sfxWet); tn({ t, dur: 0.2, f0: 120, f1: 60, a: 0.006, vol: 0.2 });
    },
    // a landing with nothing wasted
    perfect() { if (!ctx) return; const t = T(); bell(783.99, t, 0.09, sfxWet, -0.15); bell(1174.66, t + 0.07, 0.1, sfxWet, 0.15); nz(pink, { t, dur: 0.5, type: 'highpass', f0: 6000, f1: 9000, a: 0.1, vol: 0.03 }); },
    // a story begins: a page turned, a low horn under it, three notes that open upward
    questBegin() { if (!ctx) return; const t = T(); nz(pink, { t, dur: 0.3, f0: 900, f1: 2800, q: 0.7, a: 0.06, vol: 0.1 }); horn(146.83, t + 0.1, 1.6, 0.05, sfxWet, 700, 0.4); [62, 69, 76].forEach((m, i) => bell(mtof(m), t + 0.15 + i * 0.16, 0.08, sfxWet, (i - 1) * 0.25)); },
    // a part of it done
    questStep() { if (!ctx) return; const t = T(); bell(mtof(74), t, 0.07, sfxWet, -0.15); bell(mtof(79), t + 0.1, 0.075, sfxWet, 0.15); tn({ t, dur: 0.25, type: 'triangle', f0: 147, f1: 147, a: 0.02, vol: 0.05, lp: 900, dest: sfxWet }); },
    // something given by a god: it comes down from above, and has weight when it lands
    gift() { if (!ctx) return; const t = T(); [93, 90, 86, 81].forEach((m, i) => bell(mtof(m), t + i * 0.08, 0.05, sfxWet, (1.5 - i) * 0.25)); tn({ t: t + 0.36, dur: 0.6, f0: 110, f1: 55, a: 0.01, vol: 0.4, dest: subBus }); bell(mtof(62), t + 0.36, 0.09, sfxWet); nz(pink, { t, dur: 0.5, type: 'highpass', f0: 5000, f1: 8000, a: 0.2, vol: 0.04 }); },
    // a thing picked up and put on: leather, a buckle, a small ring of metal
    item() { if (!ctx) return; const t = T(); tn({ t, dur: 0.1, f0: 200, f1: 120, a: 0.004, vol: 0.2 }); nz(white, { t, dur: 0.03, type: 'bandpass', f0: 3000, q: 2, a: 0.002, vol: 0.1 }); bell(mtof(81), t + 0.03, 0.06, sfxWet); bell(mtof(88), t + 0.09, 0.04, sfxWet); },
    // stronger: a drum, and a chord that climbs to its top note and holds it
    rankUp() { if (!ctx) return; const t = T(); moment(0.4, 1.6); boom(t, 0.8, 100); [[146.83, 0], [220, 0.1], [293.66, 0.2], [440, 0.32]].forEach(([f, d]) => horn(f, t + d, 1.6 - d, 0.06, sfxWet, 1700, 0.08)); [86, 90, 93].forEach((m, i) => bell(mtof(m), t + 0.36 + i * 0.09, 0.05, sfxWet, (i - 1) * 0.3)); },
    // something has taken some of his fire: a dull blow, and the hiss of it going
    hurt(k = 0.6) {
      if (!ctx) return; const t = T(); k = clamp(k);
      tn({ t, dur: 0.3, f0: jit(84, 0.08), f1: 38, a: 0.005, vol: 0.6 * k, dest: subBus }); nz(brown, { t, dur: 0.2, type: 'lowpass', f0: 900, f1: 160, a: 0.004, vol: 0.4 * k });
      nz(pink, { t: t + 0.03, dur: 0.5, type: 'highpass', f0: 3600, f1: 1800, a: 0.02, vol: 0.14 * k, pan: rnd(-0.4, 0.4) }); kickRuffle(0.6);
    },
    // a god displeased: the ground's own note going flat under him
    dread() {
      if (!ctx) return; const t = T(); moment(0.5, 2.4);
      tn({ t, dur: 2.6, f0: 55, f1: 49, tf: 0.9, a: 0.5, vol: 0.35, dest: subBus }); tn({ t, dur: 2.4, type: 'triangle', f0: 110, f1: 104, a: 0.6, vol: 0.12, lp: 600, dest: sfxWet }); tn({ t, dur: 2.4, type: 'triangle', f0: 116.5, f1: 110, a: 0.7, vol: 0.1, lp: 600, dest: sfxWet });
      nz(brown, { t, dur: 2.2, type: 'lowpass', f0: 90, f1: 200, f2: 80, tf: 0.5, a: 0.8, vol: 0.5, dest: sfxWet });
    },
  };
  // The mix of the one-shots, one against another, in decibels. Each sound was rendered alone through the whole chain,
  // measured (how loud its loudest twentieth of a second is to an ear, and how high its peak goes), and trimmed to sit in
  // its place: the two biggest things in the game at the top, then the large moments, the things he does, the small
  // things he does, the detail under his hands and feet, and the game's own interface at the bottom. To move one sound
  // against the rest, change its number here (or, while listening, audio.levels.flap = 2).
  const LEVEL = {
    flap: 3, flare: 1.5, bank: 11.5, ruffle: 13, settle: 10, stoop: 9.5, pullOut: 2, boom: -2, slipstream: 2, jetstream: 4.5,
    updraft: 4.5, dash: 5.5, ignite: 2, rebirth: -4.5, wingsOpen: 0, flameout: 4.5, wingsFail: -1, swoop: 5, roll: 0.5,
    land: -0.5, impact: -4.5, thud: -5, splash: -3, morph: 1, reveal: -0.5, teleport: 2, thunder: 0.5, ring: -1.5, zeus: -5,
    crack: -5, clack: -7, hiss: -1.5, whoomph: 1, kindle: 3, fanfare: 2, plop: -5.5, leaves: 3, surge: 2, step: 9, foot: 9.5,
    whoosh: 5.5, chime: 1.5, ui: 9, menuOpen: 0.5, menuClose: 6.5, menuHover: 25.5, menuPick: 6.5, guideOpen: 6, screech: 2.5,
    god: 1, lookout: 4, plunge: 3, bubble: 12.5, mapOpen: 5, mapClose: 7, mapFlip: 5.5, mapTurn: 6.5, mapZoom: 3, mapMove: 18,
    mapHover: 4, mapPick: 6, mapNo: 7, mapNorth: 1.5, hammer: -8, newcomer: 9.5, beamUp: -1, beamDown: 0.5, shutter: 2,
    halo: 8, meteor: 3, fallGrain: 4, crackle: 7, sizzle: 12, twister: 2, wave: 2.5, heart: -3.5, cry: 0, jump: 8, flyby: 3,
    brushHit: 8, singe: 1.5, pass: 1.5, clip: 3, hit: -3, strike: -3.5, challenge: 0, challengeSent: 2, challengeAccept: -1.5,
    challengeDecline: 5, countdown: -2.5, victory: -3, defeat: 6, matchCalled: 4.5, fightCard: 1, matchStart: -2.5, hold: 6,
    foothold: 16, scrape: 18.5, pebbles: 13, effort: 18, climbOff: 9.5, fallThrough: -3, catchWind: 6.5, surface: 1,
    ringsAppear: 6, titleLeave: 5.5, mount: 6.5, dismount: 6.5, warp: 2.5, rename: 7.5, blessing: 1, modeSwitch: 6, called: 6,
    chat: 11.5, friendAsk: 7.5, agents: 18, gate: 2.5, perfect: 4, questBegin: 8.5, questStep: 8, gift: -1, item: 3,
    rankUp: -2, hurt: 1, dread: 5, stumble: -2, descend: 0, perch: 4, ringTogether: -0.5, slip: 1.5, mantle: 2, climbOn: 5,
    grab: 0.5,
  };
  // Where a sound has a recording, and the recording is there, the two together are trimmed again by the second number
  // here — so the mix is the same whether the recordings have loaded or not. (Measured against the takes with their
  // tails restored; with the takes as they are installed now — a click and then silence — no recording is used at all.)
  const REC = {
    flap: ['flap', -8], ignite: ['ignite', -7], rebirth: ['rebirth', -1], wingsOpen: ['wingsopen', -4], flameout: ['flameout', -11.5], wingsFail: ['flameout', -5], roll: ['roll', -2], land: ['land', -2],
    impact: ['impact', -3], splash: ['splash', -3], morph: ['morph', -1], thunder: ['thunder', -6], ring: ['ignite', 0], zeus: ['thunder', -0.5], crack: ['crack', -0.5], leaves: ['leaves', -5.5],
    surge: ['surge', -6], descend: ['underworld', -4.5], step: ['step', -2.5], foot: ['step', -0.5], whoosh: ['whoosh', -8], jump: ['jump', -17], flyby: ['whoosh', -13.5], hold: ['grab', -11]
  };
  for (const k of Object.keys(sfx)) { const f = sfx[k]; sfx[k] = function (...a) { const was = trim, R = REC[k]; trim = was * Math.pow(10, ((LEVEL[k] || 0) + (R && has(R[0]) ? R[1] : 0)) / 20); try { return f.apply(sfx, a); } finally { trim = was; } }; }

  // ───────── the score ─────────
  function stepOver(n, t) {
    const bar = Math.floor(n / 16), s = n % 16, phrase = Math.floor(bar / 8) % FORM.length;
    const sec = FORM[phrase], ch = sec.ch[bar % 8], mel = sec.mel[bar % 8], i = intensity;
    const notes = s >= 8 && ch.h ? ch.h : ch.n;
    if (s === 0 || (s === 8 && ch.h)) {
      const dur = ch.h ? BAR / 2 : BAR;
      if (lv.pad > 0.01) {
        if (lonely) notes.slice(-2).forEach(m => padNote(m + 12, t, dur, 0.05, padIn, { att: 1.8, rel: 3, dark: true }));
        else notes.forEach(m => padNote(m, t + rnd(0.03), dur, 0.045, padIn));
      }
    }
    if (s === 0) {
      if (lv.sub > 0.02) subNote(ch.r < 36 ? ch.r + 12 : ch.r, t, BAR * 0.92, 0.3, L.sub);
      if (lv.brass > 0.02) {
        brassNote(ch.r + 12, t, BAR * 0.9, 0.09, L.brass, 500 + i * 900);
        brassNote(ch.r + 19, t, BAR * 0.9, 0.07, L.brass, 500 + i * 900);
        if (i > 0.85) brassNote(ch.r + 24, t, BAR * 0.9, 0.05, L.brass, 1500);
      }
      if (lv.choir > 0.02) notes.slice(-2).forEach(m => choirNote(Math.min(86, m + 12), t, BAR, 0.11, L.choir));
    }
    if (lv.piano > 0.02) {
      const second = phrase === 1;                      // the repeat sits an octave lower and leaves a note out
      mel.forEach(([ps, pm], k) => {
        if (ps !== s || (second && k === 1)) return;
        pianoNote(second ? pm - 12 : pm, t + rnd(0.012), rnd(0.62, 0.85) * (ps === 0 ? 1 : 0.85), L.piano);
      });
      if (s === 0 && bar % 2 === 0) pianoNote(ch.r + 12, t + 0.01, 0.5, L.piano);
    }
    if (lv.ost > 0.02) {
      const eighth = s % 2 === 0;
      if (eighth || i > 0.62) {
        let m = notes[OST[(s >> 1) % 8] % notes.length]; while (m < 55) m += 12; while (m > 74) m -= 12;
        ostNote(m, t, (s % 4 === 0 ? 1 : 0.72) * (eighth ? 1 : 0.55));
      }
    }
    if (lv.drum > 0.02) {
      if (s === 0) drumHit(t, 1, L.drum);
      else if (s === 8 && i > 0.8) drumHit(t, 0.5, L.drum);
      else if (bar % 4 === 3 && i > 0.85 && (s === 10 || s === 12 || s === 14)) drumHit(t, 0.35 + (s - 10) * 0.07, L.drum);
    }
  }
  function stepUnder(n, t) {
    const bar = Math.floor(n / 16), s = n % 16, ch = UNDER[Math.floor(bar / 2) % UNDER.length], i = intensity;
    if (s === 0 && bar % 2 === 0) {
      if (lv.pad > 0.01) ch.forEach(m => padNote(m, t + rnd(0.2), BAR * 2, 0.06, padIn, { att: 2.6, rel: 4, dark: true }));
      if (lv.brass > 0.02) brassNote(ch[0], t, BAR * 1.8, 0.1, L.brass, 380 + i * 500);
    }
    if (lv.drum > 0.02) {                                // a heartbeat a long way off
      if (s === 0 || s === 8) tn({ t, dur: 0.4, f0: 62, f1: 36, a: 0.01, vol: 0.5, dest: L.drum });
      else if (s === 3 || s === 11) tn({ t, dur: 0.34, f0: 54, f1: 34, a: 0.01, vol: 0.3, dest: L.drum });
      if (s === 0 && i > 0.6) drumHit(t, 0.55, L.drum);
    }
    if (lv.choir > 0.02 && (s === 4 || s === 14) && Math.random() < 0.3) glassNote(GLASS[Math.floor(rnd(GLASS.length))], t, 0.05, L.choir);
    if (lv.ost > 0.02 && s % 2 === 0) ostNote(s % 8 === 6 ? ch[0] + 12 : ch[0], t, s % 4 === 0 ? 1.3 : 0.9, 'sawtooth');
    if (lv.sub > 0.02 && s === 0) subNote(26, t, BAR * 0.9, 0.25, L.sub);
  }

  function releaseHeld(secs = 6) {
    if (!held) return; const h = held, now = ctx.currentTime; held = null;
    h.g.gain.setTargetAtTime(0, now, secs / 4); h.oscs.forEach(o => { try { o.stop(now + secs * 1.5); } catch {} });
  }
  function sting(name) {
    if (!ctx) return; const t = T();
    if (name === 'firstFlight') {
      lift = 0.9;
      [41, 48, 53, 57, 60, 67, 69, 72].forEach((m, k) => padNote(m, t + k * 0.04, 5.5, 0.05, stingPad, { att: 1.6, rel: 4 }));
      nz(white, { t, dur: 3.4, type: 'highpass', f0: 3000, f1: 7000, tf: 0.5, a: 1.5, vol: 0.05, dest: stingBus });
      drumHit(t + 1.45, 1, stingBus); subNote(29, t + 1.45, 4, 0.3, stingBus);
      [72, 77, 81, 84].forEach((m, k) => bell(mtof(m), t + 1.5 + k * 0.1, 0.06, stingBus));
    } else if (name === 'godMet') {
      [62, 69, 76, 77, 81].forEach((m, k) => pianoNote(m, t + k * 0.11, 0.8 - k * 0.05, stingBus));
      [50, 57, 64, 65].forEach(m => padNote(m, t, 2.6, 0.03, stingPad, { att: 0.8, rel: 3 }));
    } else if (name === 'death') {
      silenceUntil = ctx.currentTime + 5.5; moment(0.7, 3);
      tn({ t, dur: 2.9, type: 'triangle', f0: 196, f1: 41, a: 0.05, vol: 0.22, lp: 520, dest: stingBus });
      tn({ t, dur: 3.2, f0: 82, f1: 27, a: 0.05, vol: 0.5, dest: subBus });
    } else if (name === 'underworld') {
      drumHit(t, 1, stingBus);
      [38, 51, 57, 58].forEach(m => padNote(m, t + 0.3, 7, 0.06, stingPad, { att: 2, rel: 5, dark: true }));
      glassNote(86, t + 2.2, 0.05, stingBus); glassNote(81, t + 3.6, 0.04, stingBus);
    } else if (name === 'truth') {
      mode = 'truth'; modeUntil = ctx.currentTime + 90;
      releaseHeld(2);
      const g = gain(0), parts = [g], oscs = [[69, 'sine', 1, 0], [57, 'triangle', 0.25, 4], [69, 'sine', 0.5, 7]].map(([m, type, vol, det]) => {
        const o = ctx.createOscillator(), og = gain(vol); o.type = type; o.frequency.value = mtof(m); o.detune.value = det; chain(o, og, g); o.start(); parts.push(o, og); return o;
      });
      g.gain.setTargetAtTime(0.055, ctx.currentTime + 1.5, 1.6); g.connect(stingBus);
      held = { g, oscs }; live++; oscs[0].onended = () => { live--; for (const p of parts) { try { p.disconnect(); } catch {} } };
    } else if (name === 'ending') {
      mode = 'ending'; modeUntil = ctx.currentTime + 31;
      releaseHeld(8);
      for (const [at, ch] of ENDING) {
        const last = at > 21, gap = last ? 0.24 : 0.15;
        ch.forEach((m, k) => pianoNote(m, t + 0.6 + at + k * gap + rnd(0.015), (last ? 0.62 : 0.78) - k * 0.05, stingBus, last ? 8 : 4.2));
      }
    } else if (name === 'resume') {
      mode = 'normal'; silenceUntil = 0; releaseHeld(4);
    }
  }

  // ───────── his fire in the trees ─────────
  // While a burning wingtip is in (or close by) leaves, the game says so every frame: which wing, how deep, how fast.
  // Each wing has its own voice out to its own side: the rush of leaves torn past, the snap of what catches, and over the
  // top the sear. In among that, things happen one at a time, never evenly: a twig going, a cluster catching, a mouthful
  // of flame. The first touch and the leaving have sounds of their own. (Made when first needed, put away when not.)
  const BRK = { leaves: [1, 1, 1, 1], pine: [1.25, 0.8, 1.3, 1.3], dry: [0.9, 0.7, 1.6, 0.8], grass: [1.1, 0.8, 0.4, 0.6], reeds: [1.1, 0.8, 0.4, 0.6], cloud: [1.5, 0.5, 0, 1.6] };   // [how bright the rush, how much of it, how much snapping, how much searing]
  // (each wing: the leaves torn past — their own flutter, not a band of hiss; the wood catching; and the flame taking hold,
  //  which is a roar, not the white noise it used to be)
  function brushBuild() {
    const mk = side => {
      const outG = gain(1), p = pan(side * 0.78), rush = gain(0), crk = gain(0), sear = low() ? null : gain(0);
      const f1 = biq('bandpass', 1500, 0.8), s1 = loop(ruffle, 1.2 + side * 0.05), s2 = loop(crackle, 1.2 + side * 0.08);
      chain(s1, f1, rush, outG); chain(s2, biq('lowpass', 6500, 0.5), crk, outG);
      let s3 = null, f3 = null; if (sear) { s3 = loop(roar, 1.15); f3 = biq('lowpass', 900, 0.5); chain(s3, f3, sear, outG); }
      (p ? chain(outG, p) : outG).connect(airBus);
      return { rush, crk, sear, f1, f3, s1, s2, srcs: [s1, s2, s3].filter(Boolean), outG, p };
    };
    BR.v = [mk(-1), mk(1)];
  }
  function brushFree() {
    if (!BR.v) return;
    for (const V of BR.v) {
      for (const s of V.srcs) { try { s.stop(); } catch {} }
      try { V.outG.disconnect(); V.p && V.p.disconnect(); } catch {}
      for (const prm of [V.rush.gain, V.crk.gain, V.sear && V.sear.gain, V.f1.frequency, V.f3 && V.f3.frequency, V.s1.playbackRate, V.s2.playbackRate]) prm && lastP.delete(prm);
    }
    BR.v = null;
  }
  function brushTick(now, dtT) {
    let any = 0, hitK = 0, hitSide = 0; const K = BRK[BR.kind] || BRK.leaves, spd = clamp(BR.speed / 160, 0.15, 1.6);
    for (let i = 0; i < 2; i++) {
      const S = BR.side[i], sgn = i ? 1 : -1; if (now > S.until) S.tgt = 0;
      S.cur += (S.tgt - S.cur) * (1 - Math.exp(-dtT / (S.tgt > S.cur ? 0.05 : 0.22))); if (S.cur < 0.004 && S.tgt === 0) S.cur = 0;
      if (S.tgt > 0) S.peak = Math.max(S.peak, S.cur);
      if (!S.on && S.cur > 0.1 && S.tgt > 0.15) { S.on = true; if (now > S.hitT) { S.hitT = now + 0.45; hitSide += sgn; hitK = Math.max(hitK, S.tgt * (0.4 + 0.4 * Math.min(1, spd))); } }
      else if (S.on && S.tgt === 0 && S.cur < 0.08) { S.on = false; if (S.peak > 0.3) sfx.singe(sgn, S.peak); S.peak = 0; }
      any = Math.max(any, S.cur);
    }
    if (hitK > 0) sfx.brushHit(hitSide, hitK);   // (both wings going in at the same moment is one sound, in the middle)
    BR.amt = any;
    if (any > 0.004) { BR.idle = now; if (!BR.v) brushBuild(); } else if (BR.v && now - BR.idle > 4) brushFree();
    if (BR.v) for (let i = 0; i < 2; i++) {
      const V = BR.v[i], a = BR.side[i].cur;
      P(V.rush.gain, a * (0.3 + 0.7 * spd) * 0.7 * K[1], 0.05); P(V.f1.frequency, (1100 + 900 * spd) * K[0], 0.1); P(V.s1.playbackRate, 1.1 + 0.4 * spd, 0.2);
      P(V.crk.gain, a * 1.1 * K[2], 0.05); P(V.s2.playbackRate, 1.05 + 0.45 * spd, 0.2);
      if (V.sear) { P(V.sear.gain, a * (0.5 + 0.5 * spd) * 0.3 * K[3], 0.06); P(V.f3.frequency, 600 + 900 * a + 300 * spd, 0.1); }
    }
    if (any > 0.06 && now >= BR.next && live < cap() - 24) {
      const i = BR.side[0].cur * Math.random() > BR.side[1].cur * Math.random() ? 0 : 1, a = BR.side[i].cur, p = (i ? 1 : -1) * rnd(0.5, 0.9), r = Math.random(), t = now + rnd(0.005, 0.03);
      if (r < 0.7) spark(t, rnd(0.1, 0.26) * (0.4 + a) * K[2], p, airBus);
      else if (r < 0.93) nz(ruffle, { t, dur: rnd(0.1, 0.18), f0: rnd(1300, 1900), f1: rnd(2200, 3000), q: 0.9, a: 0.01, vol: 0.22 * (0.4 + a), pan: p, rate: rnd(1.1, 1.5), dest: airBus });   // (a spray of leaves)
      else { nz(roar, { t, dur: 0.26, type: 'lowpass', f0: 300, f1: rnd(900, 1400), f2: 350, tf: 0.4, a: 0.05, vol: 0.5 * a, pan: p * 0.7, rate: 1.2, dest: airBus }); kick.fire = Math.max(kick.fire, 0.3); }   // (a mouthful of flame)
      BR.next = now - Math.log(1 - Math.random() * 0.999) / (3 + 15 * any * Math.min(1.2, spd));
    }
  }

  // ───────── things in the world that sound ─────────
  // A fire, a waterfall, another bird, a ring, a storm, a god: each is told to the engine by where it is (and, if it is
  // known, how it is moving). The nearest few get a voice. A voice is louder the closer he is — and a little more when he
  // is coming at it fast, a little less once it is behind — it is placed where the thing is, and its pitch is bent by how
  // fast the two are closing: up as he comes, down through the moment he passes, lower as he leaves. (The browsers took
  // the bending out of their own panners; this is the same sum done here, on the speed of the noise, the filters and the
  // tones, and smoothed so it glides.)
  //   kind: [noise, filter, Hz, Q, level, rate] for each of two layers, an optional tone [wave, Hz, level], how near it is
  //   at full level (ref), how far it carries (max), and whether passing it at speed is worth a sound of its own
  const EMK = {
    // (a fire: the roar of it, and the wood crackling — dark, so that it is fire and not static; nothing high-passed)
    fire: { a: ['roar', 'lowpass', 900, 0.5, 0.28, 1], b: ['crackle', 'lowpass', 5200, 0.5, 0.85, 0.95], ref: 14, max: 280, pass: 'fire', dense: true },
    torch: { a: ['roar', 'lowpass', 1200, 0.5, 0.12, 1.25], b: ['crackle', 'lowpass', 7000, 0.5, 0.5, 1.3], ref: 5, max: 80 },
    ring: { a: ['roar', 'lowpass', 1000, 0.6, 0.26, 1.1], b: ['crackle', 'lowpass', 6500, 0.5, 0.55, 1.05], tone: ['sine', 196, 0.03], ref: 14, max: 320, pass: 'fire' },
    bird: { a: ['brown', 'lowpass', 760, 0.6, 0.36, 1.4], b: ['pink', 'bandpass', 950, 0.7, 0.4, 1], ref: 9, max: 240, pass: 'bird' },
    waterfall: { a: ['brown', 'lowpass', 950, 0.5, 0.56, 1], b: ['pink', 'bandpass', 2600, 0.6, 0.1, 1], ref: 34, max: 600 },
    storm: { a: ['brown', 'lowpass', 150, 0.5, 1, 0.5], b: ['pink', 'bandpass', 2200, 0.6, 0.08, 1], ref: 320, max: 2800 },
    god: { a: ['pink', 'bandpass', 1900, 7, 0.07, 1], tone: ['sine', 73.42, 0.16], ref: 40, max: 700 },
    twister: { a: ['brown', 'lowpass', 190, 0.6, 1, 0.7], b: ['pink', 'bandpass', 720, 1.4, 0.28, 1], ref: 70, max: 1000 },
    sea: { a: ['brown', 'lowpass', 320, 0.5, 0.7, 0.8], b: ['pink', 'bandpass', 1900, 0.6, 0.1, 1], ref: 40, max: 500 },
    lava: { a: ['brown', 'lowpass', 230, 0.6, 0.9, 0.8], b: ['crackle', 'bandpass', 900, 0.8, 0.7, 0.6], ref: 30, max: 420 },
    wind: { a: ['pink', 'bandpass', 620, 0.6, 0.5, 1], ref: 30, max: 400 },
    hum: { a: ['brown', 'lowpass', 260, 0.6, 0.3, 1], tone: ['triangle', 82, 0.06], ref: 12, max: 260 },
    thing: { ref: 10, max: 240 },   // (a new thing's own living voice: see voiceFor)
  };
  const tnow = () => offline || typeof performance === 'undefined' ? (ctx ? ctx.currentTime : 0) : performance.now() / 1000;
  function emitDrop(E) {
    const V = E.V; if (!V) return; E.V = null; EM.n--;
    // (faded out over a few milliseconds before anything stops: a source stopped while it is still heard is a click)
    const n = ctx.currentTime; try { V.g.gain.cancelScheduledValues(n); V.g.gain.setTargetAtTime(0, n, 0.012); } catch {}
    for (const L of [V.a, V.b]) if (L) { try { L.s.stop(n + 0.1); } catch {} lastP.delete(L.s.playbackRate); lastP.delete(L.f.frequency); lastP.delete(L.g.gain); }
    if (V.o) { try { V.o.stop(n + 0.1); } catch {} lastP.delete(V.o.frequency); }
    if (V.h) V.h.stop(0.05);
    lastP.delete(V.g.gain); if (V.pn.positionX) { lastP.delete(V.pn.positionX); lastP.delete(V.pn.positionY); lastP.delete(V.pn.positionZ); }
    setTimeout(() => { try { V.g.disconnect(); V.pn.disconnect(); } catch {} }, 250);
  }
  function emitVoice(E) {
    const K = EMK[E.kind], g = gain(0), pn = ctx.createPanner(), V = { K, g, pn, a: null, b: null, o: null, h: null, last: 0, quiet: 0 };
    pn.panningModel = low() || surround || offline || LEAN.on ? 'equalpower' : 'HRTF'; pn.distanceModel = 'linear'; pn.rolloffFactor = 0;   // (how loud it is at this distance is worked out here, not by the panner)
    if (pn.positionX) { pn.positionX.value = E.x; pn.positionY.value = E.y; pn.positionZ.value = E.z; } else pn.setPosition(E.x, E.y, E.z);
    chain(g, pn, worldBus);
    const layer = L => { const s = loop(BUF[L[0]] || pink, L[5]), f = biq(L[1], L[2], L[3]), lg = gain(L[4]); chain(s, f, lg, g); return { s, f, g: lg }; };
    if (K.a) V.a = layer(K.a); if (K.b) V.b = layer(K.b);
    if (K.tone) { const o = ctx.createOscillator(); o.type = K.tone[0]; o.frequency.value = K.tone[1]; o.start(); chain(o, gain(K.tone[2]), g); V.o = o; }
    if (E.kind === 'thing') { const R = E.recipe ? recipe({ ...pickKeys(E.recipe), kind: 'loop' }) : voiceFor(E.thing || { name: E.id }).idle; V.h = makeLoop(R, { dest: g, life: Infinity }); }
    E.V = V; EM.n++;
  }
  function emitTick(now, dtT) {
    if (!EM.all.size) return;
    const maxV = low() ? 3 : 6, list = [], rx = -ear.fz, rz = ear.fx;
    for (const E of EM.all.values()) {
      const K = EMK[E.kind], ref = E.ref || K.ref, max = E.max || K.max, gone = now > E.until;
      const dx = E.x - ear.x, dy = E.y - ear.y, dz = E.z - ear.z, d = Math.hypot(dx, dy, dz) || 0.001, ux = dx / d, uy = dy / d, uz = dz / d;
      const att = ref / (ref + Math.max(d, ref) - ref) * (1 - sstep(max * 0.7, max, d));
      // how fast the gap between them is closing: his own speed toward it, and its toward him
      const vl = ear.vx * ux + ear.vy * uy + ear.vz * uz, vs = -(E.vx * ux + E.vy * uy + E.vz * uz), told = E.closingIn !== undefined, closing = told ? E.closingIn : vl + vs, kd = E.dopK * 0.85;
      const ratio = clamp(told ? SOUND_C / Math.max(90, SOUND_C - kd * closing) : (SOUND_C + kd * vl) / Math.max(90, SOUND_C - kd * vs), 0.56, 1.8);
      E.dop += (ratio - E.dop) * (1 - Math.exp(-dtT / 0.07));
      E.aud = gone ? 0 : att * E.size * (1 + 0.3 * clamp(closing / 180, -1, 1));
      // the moment of passing: closing a moment ago, opening now, and near
      if (K.pass && E.V && !gone && E.pc > 25 && closing <= 0 && d < ref * 5 && now > E.passT) {
        E.passT = now + 1.5; const side = clamp(ux * rx + uz * rz, -1, 1), k = clamp(E.pc / 160) * clamp(1.3 - d / (ref * 5));
        if (K.pass === 'bird') sfx.pass(side, 0.35 + 0.65 * k, E.pc);
        else if (E.pc > 60 && k > 0.15) { const t = now + 0.005, p = side * 0.8; nz(roar, { t, dur: 0.6, type: 'lowpass', f0: 700, f1: 1600, f2: 300, tf: 0.25, a: 0.1, vol: 0.9 * k, pan: p, rate: 1.3, dest: worldBus }); nz(crackle, { t, dur: 0.6, type: 'lowpass', f0: 6500, a: 0.06, vol: 0.9 * k, pan: p, rate: 1.4, dest: worldBus }); }
      }
      E.pc = closing; E.d = d; E.fwd = ux * ear.fx + uz * ear.fz; E.score = E.aud * (E.V ? 1.3 : 1);
      if (gone && !E.V) EM.all.delete(E.id); else list.push(E);
    }
    list.sort((a, b) => b.score - a.score);
    // (a forest on fire is many fires: each one's crackle is drawn back by how many are sounding, so together they are
    //  as dense as about one, and do not add up to a wall of snaps)
    let dense = 0; for (let i = 0; i < Math.min(maxV, list.length); i++) if (EMK[list[i].kind].dense && list[i].aud > 0.004) dense++;
    for (let i = 0; i < list.length; i++) {
      const E = list[i], want = i < maxV && E.aud > 0.004;
      if (want && !E.V && live < cap() - 10) emitVoice(E);
      const V = E.V; if (!V) continue;
      const K = V.K, behind = Math.max(0, -E.fwd), rear = 1 - 0.4 * behind, dp = E.dop * E.pitch, target = want && !V.retire ? E.aud * (1 - 0.25 * behind) : 0;
      P(V.g.gain, target, target > V.last ? 0.08 : 0.12); V.last = target;
      if (V.a) { P(V.a.s.playbackRate, K.a[5] * dp, 0.06); P(V.a.f.frequency, Math.min(16000, K.a[2] * dp * rear), 0.06); }
      if (V.b) { P(V.b.s.playbackRate, K.b[5] * dp, 0.06); P(V.b.f.frequency, Math.min(16000, K.b[2] * dp * rear), 0.06); if (K.dense) P(V.b.g.gain, K.b[4] / Math.sqrt(Math.max(1, dense)), 0.3); }
      if (V.o) P(V.o.frequency, K.tone[1] * dp, 0.06);
      if (V.h && Math.abs(dp - (V.dp || 1)) > 0.002) { V.dp = dp; V.h.bend(dp); }
      if (V.pn.positionX) { Pabs(V.pn.positionX, E.x, 0.04, 0.02); Pabs(V.pn.positionY, E.y, 0.04, 0.02); Pabs(V.pn.positionZ, E.z, 0.04, 0.02); } else { try { V.pn.setPosition(E.x, E.y, E.z); } catch {} }
      if (target <= 0.0005) { V.quiet += dtT; if (V.quiet > 0.7) emitDrop(E); } else V.quiet = 0;
    }
  }
  function emit(id, kind, x, y, z, o = {}) {
    if (!ctx || id === undefined || id === null || ![x, y, z].every(Number.isFinite)) return;
    const key = String(id), now = ctx.currentTime, tn_ = tnow(), K = Object.prototype.hasOwnProperty.call(EMK, kind) ? kind : 'fire'; o = o || {};
    let E = EM.all.get(key);
    if (!E) {
      if (EM.all.size >= 96) { let far = null; for (const e of EM.all.values()) if (!e.V && (!far || e.d > far.d)) far = e; if (far) EM.all.delete(far.id); else return; }   // (too many told at once: the furthest silent one is forgotten)
      E = { id: key, kind: K, x, y, z, vx: 0, vy: 0, vz: 0, pt: -1, V: null, dop: 1, d: 1e9, pc: 0, passT: 0, aud: 0, fwd: 1, score: 0 }; EM.all.set(key, E);
    } else if (E.kind !== K) { emitDrop(E); E.kind = K; }
    // how it is moving: told, or worked out from where it was last time (a jump is a jump, not a speed)
    if ([o.vx, o.vy, o.vz].every(Number.isFinite)) { E.vx = o.vx; E.vy = o.vy; E.vz = o.vz; }
    else if (E.pt >= 0) {
      const dt = tn_ - E.pt;
      if (dt > 0.5) E.vx = E.vy = E.vz = 0;
      else if (dt > 0.008) { const k = 1 - Math.exp(-dt / 0.12), ax = (x - E.x) / dt, ay = (y - E.y) / dt, az = (z - E.z) / dt; if (Math.hypot(ax, ay, az) < 900) { E.vx += (ax - E.vx) * k; E.vy += (ay - E.vy) * k; E.vz += (az - E.vz) * k; } else E.vx = E.vy = E.vz = 0; }
    }
    if (E.pt < 0 || tn_ - E.pt > 0.008 || [o.vx, o.vy, o.vz].every(Number.isFinite)) { E.x = x; E.y = y; E.z = z; E.pt = tn_; }
    E.size = num(o.size, 0, 3, 1); E.ref = num(o.ref, 0.5, 5000, 0); E.max = num(o.max, 1, 20000, 0); E.dopK = num(o.doppler, 0, 1.5, 1); E.pitch = num(o.pitch, 0.25, 4, 1);
    E.until = o.hold ? Infinity : now + num(o.ttl, 0.05, 600, 0.75);
    E.closingIn = Number.isFinite(o.closing) ? o.closing : undefined;
    if (o.thing !== undefined) E.thing = o.thing; if (o.recipe !== undefined) E.recipe = o.recipe;
  }

  // ───────── per-frame ─────────
  function update(dt, s = {}) {
    if (!ctx) return;
    { const w = typeof performance !== 'undefined' ? performance.now() / 1000 : 0, raw = LEAN.w ? Math.min(1, w - LEAN.w) : 0; LEAN.w = w;   // (how the frames are really going, by the wall clock: see LEAN)
      if (raw > 0.05) { LEAN.slow += raw; LEAN.quick = 0; } else { LEAN.quick += raw; if (LEAN.quick > 1) LEAN.slow = Math.max(0, LEAN.slow - raw); }
      // (and the sound's own thread: where the browser says how often it had nothing ready in time — each of those is a
      //  crackle — three in a few seconds is reason enough to go lean, whatever the frames are doing)
      if (!offline && (LEAN.pt = (LEAN.pt || 0) - raw) <= 0) { LEAN.pt = 0.5; const ps = ctx.playoutStats, f = ps && ps.fallbackFramesEvents;
        if (Number.isFinite(f)) { if (LEAN.fb !== undefined && f > LEAN.fb) LEAN.glitch = (LEAN.glitch || 0) + Math.min(5, f - LEAN.fb); LEAN.fb = f; }
        LEAN.glitch = Math.max(0, (LEAN.glitch || 0) - 0.15); if (LEAN.glitch >= 3) { LEAN.slow = Math.max(LEAN.slow, 3); LEAN.quick = 0; } }
      if (!LEAN.on && LEAN.slow > 2.5 && !offline) { LEAN.on = true; for (const E of EM.all.values()) if (E.V) E.V.retire = true; }   // (a panner changed while it sounds jumps: the voices fade out instead, and come back plain)
      else if (LEAN.on && LEAN.quick > 30) { LEAN.on = false; LEAN.slow = 0; } }
    dt = clamp(+dt || 0, 0, 0.25); clock += dt; tAcc += dt;
    const now = ctx.currentTime, st = s.state || 'play', form = s.form || 'human';
    const speed = Math.max(0, +s.speed || 0), vy = +s.vy || 0, flame = clamp(s.flame ?? 1), air = !s.grounded;
    const title = st === 'title', talk = st === 'talk', dead = st === 'dead' || st === 'end';
    const phoenix = form === 'phoenix', wings = form === 'wings', perched = !!s.perched;
    const flying = (phoenix || wings) && air && !perched && !title && !dead;
    const falling = !title && !dead && (!!s.falling || (form === 'human' && air && vy < -10));
    realmUnder = s.realm === 'under';
    lonely = !!s.summit && !flying && !realmUnder;
    if (st !== lastState) { if (st === 'title' && mode !== 'normal') sting('resume'); lastState = st; }
    if (mode !== 'normal' && now > modeUntil) { mode = 'normal'; releaseHeld(6); }

    // how much music the moment wants
    let ti = 0;
    if (!title && !dead) {
      if (phoenix && air) ti = 0.3 + 0.5 * clamp((speed - 55) / 220) + (s.diving ? 0.12 : 0) + (s.boost ? 0.14 : 0);
      else if (wings && air) ti = 0.2;
      else if (s.burning) ti = 0.45;
      else if (falling) ti = 0.12;
    }
    lift = Math.max(0, lift - dt / 16);
    ti = Math.max(clamp(ti), talk ? 0 : lift);
    intensity += (ti - intensity) * (1 - Math.exp(-dt / (ti > intensity ? 2.2 : 6)));
    flyAmt += ((flying ? 1 : 0) - flyAmt) * (1 - Math.exp(-dt / (flying ? 1.5 : 5)));
    const i = intensity, sky = clamp(s.sky ?? (s.summit ? 1 : 0));
    let presence = title ? 0.55 : dead ? 0 : talk ? 0.3 : 0.16 + 0.84 * flyAmt;
    if (lonely && !talk && !title && !dead) presence = Math.max(presence, 0.42);
    if (s.burning) presence = Math.max(presence, 0.8);
    if (realmUnder && !dead) presence = Math.max(presence, talk ? 0.35 : 0.6);

    if (realmUnder) {
      lv.pad = 1; lv.piano = 0; lv.ost = talk ? 0 : sstep(0.45, 0.7, i) * 0.6; lv.brass = talk ? 0 : sstep(0.6, 0.85, i) * 0.6;
      lv.sub = talk ? 0 : 0.3 + 0.5 * i; lv.drum = talk ? 0.3 : 0.6 + 0.4 * i; lv.choir = 0.6;
    } else {
      lv.pad = lerp(1, 0.65 + 0.35 * i, flyAmt);
      lv.piano = talk ? 0 : Math.max(title ? 0.6 : 0, flyAmt * (1 - sstep(0.5, 0.72, i)) * 0.95);
      lv.ost = talk ? 0 : sstep(0.3, 0.5, i) * (0.45 + 0.55 * i);
      lv.brass = talk ? 0 : sstep(0.55, 0.8, i); lv.sub = talk ? 0 : sstep(0.4, 0.65, i); lv.drum = talk ? 0 : sstep(0.68, 0.86, i);
      lv.choir = dead ? 0 : Math.max(sky * 0.7, title ? 0.45 : 0, lonely ? 0.5 : 0) * (talk ? 0.5 : 1);
    }

    // the sequencer: schedule a little ahead; after a long gap carry on from now instead of catching up
    const silent = mode !== 'normal' || now < silenceUntil || presence < 0.01;
    if (nextT < now - 0.05) nextT = now + 0.06;
    let guard = 0;
    if (!SCORE) nextT = now + 0.3;   // (the generated score is retired: nothing of it is scheduled)
    while (nextT < now + 0.3 && guard++ < 8) {
      if (!silent) (realmUnder ? stepUnder : stepOver)(stepN, nextT);
      stepN++; nextT += STEP;
    }
    if (realmUnder && !dead && now > nextMoan) {
      if (nextMoan > 0) {
        const f = rnd(140, 200), pn = rnd(-0.7, 0.7), d = rnd(2.8, 4);
        tn({ dur: d, type: 'triangle', f0: f, f1: f * 0.86, a: d * 0.4, vol: 0.035, lp: 620, pan: pn, dest: sfxWet });
        tn({ dur: d, type: 'triangle', f0: f * 1.012, f1: f * 0.85, a: d * 0.45, vol: 0.025, lp: 620, pan: pn, dest: sfxWet });
      }
      nextMoan = now + rnd(18, 48);
    }

    // ── the flight, as the sound hears it. Every frame: these are rates of change, and a frame skipped is a lie.
    const sp0 = clamp(speed / 160, 0, 1.8), own = flying && phoenix;
    if (dt > 0.001) {
      const jump = !fl.own || Math.abs(speed - fl.pSpeed) > 70, k = 1 - Math.exp(-dt / 0.12);   // (put somewhere else, or only just in the air: not something he did)
      fl.acc += ((jump ? 0 : clamp((speed - fl.pSpeed) / dt, -400, 400)) - fl.acc) * k;
      fl.dvy += ((jump ? 0 : clamp((vy - fl.pVy) / dt, -400, 400)) - fl.dvy) * k;
      const w = clamp(+s.wind || 0); fl.gustD += (Math.min(1, Math.abs(w - fl.pWind) / dt * 0.5) - fl.gustD) * k; fl.pWind = w;
      fl.real = s.turn !== undefined && s.turn !== null && Number.isFinite(+s.turn);
      fl.turn += (clamp(fl.real ? +s.turn : ear.turn * 0.7, -5, 5) - fl.turn) * (1 - Math.exp(-dt / 0.08));
      const bIn = s.bank !== undefined && s.bank !== null && Number.isFinite(+s.bank) ? clamp(+s.bank / 1.1, -1, 1) : clamp(fl.turn / 1.6, -1, 1);
      fl.bank += (bIn - fl.bank) * (1 - Math.exp(-dt / 0.15));
      kick.flap *= Math.exp(-dt * 7); kick.ruffle *= Math.exp(-dt * 3.5); kick.fire *= Math.exp(-dt * 2.5);
      // what is disturbing his feathers: a hard turn, a sudden change of speed (slowing most of all) or of climb, a gust
      // arriving, the ground close under him throwing the air back, leaves, another bird's wake, his own wingbeat
      const feathers = title || dead ? 0 : phoenix ? 1 : wings && air ? 0.6 : 0, tq = clamp((Math.abs(fl.turn) - 0.3) / 1.9) * clamp(0.25 + sp0);
      const near = s.alt !== undefined && s.alt !== null && Number.isFinite(+s.alt) ? clamp(1 - s.alt / 25) * sp0 * 0.15 : 0;
      const raw = feathers ? clamp((flying ? 0.035 * sp0 + tq * 0.9 + Math.abs(fl.acc) / (fl.acc < 0 ? 130 : 240) + Math.abs(fl.dvy) / 170 + fl.gustD * 0.7 + near + (BR.amt || 0) * 0.4 + WK.cur * 0.5 : 0) + kick.flap * 0.4 + kick.ruffle, 0, 1.3) * feathers : 0;
      fl.turb += (raw - fl.turb) * (1 - Math.exp(-dt / (raw > fl.turb ? 0.04 : 0.3)));
      fl.flyT = own ? fl.flyT + dt : 0;
      // and the two things a wing does that are worth a sound of their own: thrown open to stop, and hauled round
      if (own && fl.flyT > 0.8 && st === 'play') {
        if (fl.acc < -95 && sp0 > 0.3 && now > fl.flareT) { fl.flareT = now + 1.5; sfx.flare(clamp(-fl.acc / 260, 0.3, 1)); }
        const q = Math.abs(fl.turn); if (fl.real && q > 1.5 && fl.pTq <= 1.5 && sp0 > 0.4 && now > fl.bankT) { fl.bankT = now + 1.1; sfx.bank(Math.sign(fl.turn), clamp((q - 1.1) / 1.6 * (0.5 + sp0 * 0.5), 0.3, 1)); }
        fl.pTq = q;
      }
    }
    fl.pSpeed = speed; fl.pVy = vy; fl.speed = speed; fl.sp = sp0; fl.own = own;

    if (tAcc < 0.03) return;
    const dtT = tAcc; tAcc = 0;
    // ── score levels
    if (omen && omen.on && omen.src) { P(omen.g.gain, title ? 0.7 : talk ? 0.6 : dead ? 0.8 : 1.25, 1.5); P(omen.f.frequency, s.sub > 0.5 ? 500 : 2400, 0.5); }
    if (song && song.on) {
      const end = st === 'end';
      P(song.g.gain, end ? 0 : (title ? 0.45 : dead ? 0.3 : realmUnder ? 0.5 : 0.62), end ? 2.5 : 1.2);   // (a conversation, a voice, a big moment: those are claims on the room now, below)
      P(song.f.frequency, s.sub > 0.5 ? 520 : realmUnder ? 2600 : dead ? 1400 : 20000, 0.5);   // muffled under water, darker below it
    }
    P(scoreGain.gain, !SCORE || silent || (song && song.on) || (omen && omen.on) ? 0 : presence, now < silenceUntil ? 0.25 : mode !== 'normal' ? 1.3 : presence > 0.5 ? 1.2 : 2.4);
    for (const k of Object.keys(lv)) P(L[k].gain, lv[k], 0.9);
    P(L.padF.frequency, realmUnder ? 380 + i * 520 : lonely ? 1100 : 620 + i * 2000 + Math.sin(clock * 0.21) * 120, 0.6);
    P(L.ostF.frequency, realmUnder ? 320 + i * 300 : 900 + i * 2400, 0.4);
    // ── who has the room
    if (talk) hold('talk', DUCK.talk, 1, 0.3, true);
    if (dead) hold('dead', DUCK.dead, 1, 0.3, true);
    duckTick(now, dtT);

    // ── air: the body of it, a band for each wing (the outside wing of a turn is the faster one: louder, and higher), the
    //    hiss off the feather edges, the whistle of a dive, the pressure of real speed. Climbing, it is heavier and
    //    darker; sinking, lighter. It gusts, and the gusts never come round the same way twice.
    const airspeed = falling ? Math.max(speed, -vy) : speed, sp = clamp(airspeed / 160, 0, 1.8);
    const g1 = 0.6 * wander(clock * 0.33, 11) + 0.28 * wander(clock * 0.91, 23) + 0.12 * wander(clock * 2.3, 37);
    const g2 = 0.6 * wander(clock * 0.27, 53) + 0.28 * wander(clock * 0.73, 67) + 0.12 * wander(clock * 1.9, 79);
    const gust = clamp(+s.wind || 0), top = s.summit ? 1 : 0, hush = realmUnder ? 0.45 : 1, bank = clamp(fl.bank, -1, 1), turb = fl.turb * flyAmt;
    const climb = flying ? clamp(vy / 45, -1, 1) : 0, heavy = 1 + 0.25 * Math.max(0, climb), tone = 1 - 0.16 * Math.max(0, climb) + 0.08 * Math.max(0, -climb);
    // (where a recording carries it, the generated layers stay underneath as body, not the sound itself)
    const kW = loops.windloop ? 0.5 : 1, kF = loops.fallloop ? 0.45 : 1, kX = loops.fireloop ? 0.55 : 1, kR = loops.rainloop ? 0.35 : 1, kA = loops.waterloop ? 0.5 : 1;
    P(W.low.g.gain, (0.05 + top * 0.13 + (title ? 0.07 : 0) + sp * 0.28 * heavy + gust * 0.15) * (0.55 + 0.45 * g1) * hush * kW, 0.25);
    P(W.low.f.frequency, (200 + sp * 260 + top * 60 + g1 * 60) * tone, 0.4);
    W.mid.forEach((m, k) => {
      const g = k ? g2 : g1, side = W.mid.length > 1 ? (k ? 1 : -1) : 0;
      P(m.g.gain, (0.03 + top * 0.05 + sp * 0.34 + gust * 0.14 + turb * 0.05) * (0.5 + 0.5 * g) * (1 - side * bank * 0.45) * hush * kW, 0.2);
      P(m.f.frequency, (340 + k * 60 + sp * 720 + g * 130 - top * 60) * tone * (1 - side * bank * 0.16), 0.3);
    });
    bed(W.high, (sp * sp * 0.12 + turb * 0.04) * (0.6 + 0.4 * g2) * hush, 0.25);
    P(W.high.f.frequency, 1800 + sp * 900 + turb * 500, 0.4);
    const dive = s.diving ? clamp((speed - 150) / 160) : 0;
    bed(W.whistle, dive * 0.38 * (0.6 + 0.4 * g1), 0.3);
    P(W.whistle.f.frequency, 900 + speed * 4 + g2 * 120 + (wander(clock * 3.1, 91) - 0.5) * 70, 0.3);
    bed(W.rumble, clamp((airspeed - 120) / 190) * 0.4 + (s.boost && flying ? 0.07 : 0), 0.4);
    const fl_ = falling ? clamp(-vy / 60) : 0;
    bed(W.fall, (falling ? 0.03 + fl_ * 0.2 : 0) * kF, 0.2);
    P(W.fall.f.frequency, 500 + fl_ * 1800, 0.3);
    // ── feathers: the inside wing of a turn, slow and near its stall, is the one that flutters most
    const plume = title || dead ? 0 : phoenix ? 1 : wings && air ? 0.6 : 0;
    W.ruf.forEach((m, k) => {
      const side = W.ruf.length > 1 ? (k ? 1 : -1) : 0;
      bed(m, plume * fl.turb * (0.75 + 0.25 * (k ? g1 : g2)) * (1 + side * bank * 0.35) * 0.9, 0.05);
      P(m.f.frequency, Math.min(2900, (wings ? 1300 : 1700) + sp * 1000 + fl.turb * 500), 0.2);   // (no higher than about 3 kHz: above that, at speed, a flutter was a fizz: over half of it above 4 kHz)
      P(m.s.playbackRate, m.rate * Math.min(1.45, 0.8 + sp * 0.45 + fl.turb * 0.35), 0.2);
    });
    // ── fire: his own. It roars with speed, is torn harder the faster he goes, gasps on every wingbeat, and takes a
    //    mouthful whenever it finds something to burn
    const fireOn = !title && !dead, kf = kick.flap * 0.5 + kick.fire;
    bed(W.fire, (!fireOn ? 0 : s.burning ? 0.5 : phoenix ? 0.07 + flame * 0.1 + sp * 0.09 + kf * 0.1 : wings && air ? 0.04 : 0) * kX * 0.4, 0.2);
    if (W.fire.on) { P(W.fire.f.frequency, 360 + sp * 480 + (s.burning ? 500 : 0) + kf * 260, 0.3); P(W.fire.s.playbackRate, 0.9 + Math.min(sp, 1.4) * 0.3 + kf * 0.1, 0.4); }   // (torn faster, the faster he goes)
    // (his own crackle is heard when the fire is worked — a wingbeat, the boost, something caught — and hardly between: on
    //  all the time, twenty snaps a second, it was the static heard all through a flight)
    const fc = !fireOn ? 0 : s.burning ? 0.4 : phoenix ? 0.025 + flame * 0.03 + kf * 0.16 + (s.boost ? 0.04 : 0) : wings ? 0.03 : 0;
    W.crackle.forEach((m, k) => { bed(m, fc * (k ? 1.1 : 1.4), 0.3); if (m.on) P(m.s.playbackRate, m.rate * (0.92 + sp * 0.25), 0.5); });
    // ── wings as a man; and his own, as a bird, in the broken air behind another
    if (now > WK.until) WK.tgt = 0; WK.cur += (WK.tgt - WK.cur) * (1 - Math.exp(-dtT / 0.25)); if (WK.cur < 0.003) WK.cur = 0;
    const buf = wings && air && !dead, wk = dead || title ? 0 : WK.cur;
    bed(W.buffet, Math.max(buf ? 0.25 + sp * 0.5 : 0, wk * (0.25 + sp * 0.3)), 0.25);
    if (buf || wk > 0) { P(W.buffet.lfo.frequency, 7 + sp * 9 + g1 * 2 + wk * 5, 0.3); P(W.buffet.f.frequency, 170 + sp * 160, 0.3); }
    // ── water
    // (skimming it, he hisses: fire on water; inside it, everything else goes dull)
    const wet = realmUnder || title ? 0 : clamp(+s.water || 0), wave = Math.pow(0.5 + 0.5 * Math.sin(clock * 0.9 + Math.sin(clock * 0.23) * 2), 2);
    const skim = title || dead ? 0 : clamp((+s.skim || 0) / 2), sub = clamp(+s.sub || 0);
    bed(W.water, Math.max(wet * (0.2 + 0.5 * wave) * kA, skim * 0.5, sub * 0.6), 0.3);
    P(W.water.f.frequency, sub > 0.5 ? 240 : 560 + wave * 380 + skim * 900, 0.4);
    bed(W.foam, (wet * wave * 0.05 + skim * 0.11) * (0.4 + 0.6 * wander(clock * 3.7, 131)), 0.12);   // (spray comes in bursts)
    const rain = title || dead ? 0 : clamp(+s.rain || 0);   // a storm coming down on stone
    bed(W.rain, rain * (0.17 + 0.09 * g1) * (0.7 + 0.3 * wander(clock * 1.7, 141)) * kR, 0.3); bed(W.rainLow, rain * 0.22 * kR, 0.4);   // (heavier and lighter as the wind drives it)
    // ── the recorded beds: wind round him (harder, and higher, the faster he goes), the dive's roar, the rush of a fall,
    //    his fire, the storm's rain, water lapping nearby. Pitch rides speed so a recording never sounds like a recording.
    const muffle = sub > 0.5 ? 0.25 : 1;
    loopSet('windloop', dead ? 0 : (flying ? 0.16 + sp * 0.6 : top * 0.4 + gust * 0.3 + (title ? 0.2 : 0)) * (0.62 + 0.38 * g1) * hush * muffle, 0.84 + Math.min(sp, 1.4) * 0.26 + g2 * 0.04);
    loopSet('diveloop', dead ? 0 : dive * (0.75 + 0.35 * g2) * muffle, 0.88 + dive * 0.24);
    loopSet('fallloop', dead ? 0 : (falling ? 0.12 + fl_ * 1.0 : 0) * muffle, 0.9 + fl_ * 0.22);
    loopSet('fireloop', (!fireOn ? 0 : s.burning ? 0.95 : phoenix ? (0.16 + flame * 0.24 + sp * 0.14 + kf * 0.1) * muffle : wings && air ? 0.1 : 0) * 1.3, 0.94 + Math.min(sp, 1.2) * 0.12);
    loopSet('rainloop', rain * 0.95);
    loopSet('waterloop', wet * (0.5 + 0.5 * wave) * (sub > 0.5 ? 0 : 1));
    if (subF) P(subF.frequency, sub > 0.5 ? 620 : 20000, sub > 0.5 ? 0.12 : 0.35);
    // ── the Underworld
    if (realmUnder && !under) buildUnder();
    if (under) { P(under.g.gain, realmUnder && !dead ? 0.55 : 0, 1.2); P(under.f.frequency, 130 + sp * 90 + g1 * 30, 0.8); }
    // ── leaves on fire; the things of the world; and voices made for new things that have had their time
    brushTick(now, dtT);
    emitTick(now, dtT);
    for (const h of things.loops) if (now > h.until) h.stop(0.8);
  }

  // ───────── a voice for a thing nobody has heard before ─────────
  // He can become anything he names, and new things turn up in the world that were never given a sound. So: a small
  // synthesizer that plays a recipe — a handful of plain numbers — and a way of working a recipe out, the same way every
  // time, from what is known about a thing: its name, how big it is, how it gets about, what colour it is.
  //
  //   recipe: { kind: 'shot' | 'loop', family, pitch (Hz), size 0…1, bend (semitones over the note), attack, decay (s),
  //             noise 0…1, bright 0…1, harm 0…1, wave, motion: 'none' | 'flutter' | 'wobble' | 'pulse', rate (Hz), depth 0…1,
  //             gain 0…1, pan −1…1, wet 0…1 (how much hall), sub 0…1 (weight under it), notes [semitones…], gap (s), life (s) }
  //
  // Every field is optional and every field is checked: a recipe may have come from a server, so numbers are clamped,
  // words are taken only from the lists here, and anything else is ignored.
  //   family: what kind of thing is sounding — w: its wave (null: none, only noise), fm: [ratio, depth] for struck things,
  //   fo: a throat, n: how much noise, nb/nt/nf/nq: which noise, through what, at what multiple of the pitch, a/d: attack
  //   and decay, b: bend, mo/r/dp: motion, sub: how much weight it has when it is big, lv: a trim (dB) that sets the
  //   families level with each other (measured), nfAbs/nr: a noise filter that does not follow the pitch, and a noise rate
  const FAM = {
    chirp: { lv: -4, w: 'triangle', n: 0.06, nb: 'pink', nt: 'bandpass', nf: 3, nq: 2, a: 0.008, d: 0.15, b: 7 },
    call: { lv: 0, w: 'sawtooth', fo: 1, n: 0.1, nb: 'pink', nt: 'bandpass', nf: 2.5, nq: 1.2, a: 0.03, d: 0.5, b: -3 },
    growl: { lv: 1, w: 'sawtooth', fo: 1, n: 0.35, nb: 'brown', nt: 'lowpass', nf: 5, nq: 0.7, a: 0.07, d: 0.9, b: -4, mo: 'flutter', r: 26, dp: 0.5, sub: 0.6 },
    bell: { lv: -12, w: 'sine', fm: [2.76, 1.3], n: 0.02, nb: 'white', nt: 'highpass', nf: 6, a: 0.004, d: 1.8 },
    glass: { lv: -11, w: 'sine', fm: [3.51, 0.7], n: 0.04, nb: 'white', nt: 'highpass', nf: 8, a: 0.002, d: 1.1 },
    metal: { lv: -8, w: 'triangle', fm: [1.41, 2.4], n: 0.14, nb: 'white', nt: 'bandpass', nf: 5, nq: 1.5, a: 0.002, d: 0.9 },
    wood: { lv: -4.5, w: 'sine', n: 0.4, nb: 'pink', nt: 'bandpass', nf: 2.2, nq: 1.6, a: 0.002, d: 0.13, b: -5 },
    stone: { lv: -5, w: 'sine', n: 0.7, nb: 'brown', nt: 'lowpass', nf: 6, a: 0.002, d: 0.22, b: -7, sub: 0.4 },
    water: { lv: -4.5, w: 'sine', n: 0.45, nb: 'pink', nt: 'bandpass', nf: 3, nq: 0.8, a: 0.006, d: 0.14, b: 12 },
    fire: { lv: -4, w: null, n: 1, nb: 'crackle', nt: 'highpass', nfAbs: 1100, nr: 1.7, a: 0.05, d: 0.9 },
    air: { lv: 1, w: null, n: 1, nb: 'pink', nt: 'bandpass', nf: 2, nq: 0.8, a: 0.1, d: 0.6, b: -6 },
    thump: { lv: -8, w: 'sine', n: 0.3, nb: 'brown', nt: 'lowpass', nf: 4, a: 0.004, d: 0.35, b: -12, sub: 0.7 },
    hum: { lv: -1, w: 'sawtooth', n: 0.1, nb: 'brown', nt: 'lowpass', nf: 3, a: 0.15, d: 1.2, mo: 'pulse', r: 14, dp: 0.3, sub: 0.3 },
    buzz: { lv: 3.5, w: 'sawtooth', n: 0.05, nb: 'pink', nt: 'bandpass', nf: 6, nq: 2, a: 0.03, d: 0.5, mo: 'flutter', r: 38, dp: 0.7 },
    spark: { lv: 0, w: 'square', n: 0.5, nb: 'white', nt: 'highpass', nf: 5, a: 0.002, d: 0.09, b: 14 },
    ghost: { lv: -12, w: 'sine', n: 0.3, nb: 'pink', nt: 'bandpass', nf: 2, nq: 7, a: 0.4, d: 1.8, mo: 'wobble', r: 4.5, dp: 0.35 },
  };
  const WAVES = ['sine', 'triangle', 'sawtooth', 'square'], MOTIONS = ['none', 'flutter', 'wobble', 'pulse'];
  const RKEYS = ['kind', 'family', 'pitch', 'size', 'bend', 'attack', 'decay', 'noise', 'bright', 'harm', 'wave', 'motion', 'rate', 'depth', 'gain', 'pan', 'wet', 'sub', 'notes', 'gap', 'life'];
  const pickKeys = r => { const o = {}; if (r && typeof r === 'object') for (const k of RKEYS) if (Object.prototype.hasOwnProperty.call(r, k)) o[k] = r[k]; return o; };
  function recipe(r) {
    if (!r || typeof r !== 'object' || Array.isArray(r)) return null;
    const fam = typeof r.family === 'string' && Object.prototype.hasOwnProperty.call(FAM, r.family) ? r.family : 'call', F = FAM[fam], size = num(r.size, 0, 1, 0.4);
    const notes = (Array.isArray(r.notes) ? r.notes : [0]).slice(0, 6).map(v => num(v, -24, 36, 0));
    return {
      kind: r.kind === 'loop' ? 'loop' : 'shot', family: fam, size,
      pitch: num(r.pitch, 24, 8000, 55 * Math.pow(2, (1 - size) * 5.6)), bend: num(r.bend, -36, 36, F.b || 0),
      attack: num(r.attack, 0.002, 3, F.a), decay: num(r.decay, 0.03, 8, F.d * (0.6 + size * 1.2)),
      noise: num(r.noise, 0, 1, F.n), bright: num(r.bright, 0, 1, 0.55), harm: num(r.harm, 0, 1, 0.5),
      wave: WAVES.includes(r.wave) ? r.wave : F.w,
      motion: MOTIONS.includes(r.motion) ? r.motion : F.mo || 'none', rate: num(r.rate, 0.1, 60, F.r || 6), depth: num(r.depth, 0, 1, F.dp || 0.4),
      gain: num(r.gain, 0, 1, 0.5), pan: num(r.pan, -1, 1, 0), wet: num(r.wet, 0, 1, 0.3), sub: num(r.sub, 0, 1, (F.sub || 0) * size),
      notes: notes.length ? notes : [0], gap: num(r.gap, 0.03, 1.5, 0.14), life: num(r.life, 0.5, 60, 8),
    };
  }
  // one note of it (sus: held open — a living loop — instead of dying away)
  function voice(R, t, f, vol, pn, dest, sus) {
    if (live > cap() - 6 || !(vol > 0)) return null;
    vol *= Math.pow(10, (FAM[R.family].lv || 0) / 20) * (sus ? 0.3 : 1);   // (something that goes on and on sits well under something said once)
    const F = FAM[R.family], dur = R.attack + R.decay, end = t + dur + 0.06, nodes = [], srcs = [], env = gain(0); nodes.push(env);
    env.gain.setValueAtTime(0.0001, t); env.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), t + R.attack);
    if (!sus) env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let head = env, vib = null, osc = null, nsrc = null, nfil = null, nf = 0;
    const go = (n, off) => { if (off === undefined) n.start(t); else n.start(t, off); if (!sus) n.stop(end); srcs.push(n); nodes.push(n); };
    if (R.motion !== 'none' && R.depth > 0.01) {
      const lfo = ctx.createOscillator(); lfo.type = R.motion === 'pulse' ? 'square' : 'sine'; lfo.frequency.value = R.rate; go(lfo);
      if (R.motion === 'wobble') { vib = gain(f * (Math.pow(2, R.depth * 2 / 12) - 1)); lfo.connect(vib); nodes.push(vib); }
      else {
        const am = gain(1 - R.depth * 0.5), d = gain(R.depth * 0.5); nodes.push(am, d);
        if (R.motion === 'pulse') { const soft = biq('lowpass', Math.max(20, R.rate * 5), 0.5); chain(lfo, soft, d); nodes.push(soft); } else lfo.connect(d);   // (a pulse with its corners taken off: it throbs, it does not click)
        d.connect(am.gain); am.connect(env); head = am;
      }
    }
    if (R.wave) {
      osc = ctx.createOscillator(); osc.type = R.wave; osc.frequency.setValueAtTime(fq(f), t);
      if (R.bend && !sus) osc.frequency.exponentialRampToValueAtTime(fq(f * Math.pow(2, R.bend / 12)), t + dur * 0.7);
      if (vib) vib.connect(osc.frequency);
      if (F.fm) {   // struck: a second tone bending the first, hard at the blow and letting go as it rings
        const m = ctx.createOscillator(), mg = gain(0), idx = F.fm[1] * (0.4 + R.harm * 1.2) * f; m.frequency.value = fq(f * F.fm[0]);
        mg.gain.setValueAtTime(idx, t); if (!sus) mg.gain.exponentialRampToValueAtTime(Math.max(1, idx * 0.08), t + dur * 0.8);
        chain(m, mg); mg.connect(osc.frequency); go(m); nodes.push(mg);
      }
      const pure = w => w === 'sine' || w === 'triangle', lean = pure(R.wave) && !pure(F.w) ? 0.28 : !pure(R.wave) && pure(F.w) ? 2.2 : 1;   // (the families were set level with their own wave: another one is trimmed to sit where theirs did)
      const tg = gain((1 - R.noise * 0.6) * (R.wave === 'sine' ? 1 : R.wave === 'triangle' ? 0.9 : 0.42) * lean); let tail = osc;
      if (F.fo && !pure(R.wave)) {   // a throat: two resonances, lower the bigger the thing is
        const k = 0.8 + R.bright * 0.5, b1 = biq('bandpass', fq(lerp(1100, 300, R.size) * k), 3), b2 = biq('bandpass', fq(lerp(3000, 1000, R.size) * k), 4), g2 = gain(0.2 + 0.6 * R.bright), mix = gain(2.2);
        osc.connect(b1); osc.connect(b2); b1.connect(mix); chain(b2, g2, mix); tail = mix; nodes.push(b1, b2, g2, mix);
      } else if (R.wave !== 'sine') { const lp = biq('lowpass', clamp(fq(f) * (1.5 + R.bright * 10 + R.harm * 4), 200, 14000), 0.6); osc.connect(lp); tail = lp; nodes.push(lp); }
      chain(tail, tg, head); go(osc); nodes.push(tg);
    }
    if (R.noise > 0.01) {
      const b = BUF[F.nb] || pink; nsrc = ctx.createBufferSource(); nsrc.buffer = b; nsrc.loop = true; if (dop !== 1 || F.nr) nsrc.playbackRate.value = dop * (F.nr || 1);
      nf = F.nfAbs ? F.nfAbs * (0.7 + R.bright * 0.6) : clamp(f * (F.nf || 2) * (0.6 + R.bright * 0.8), 60, 12000); nfil = biq(F.nt || 'bandpass', fq(nf), F.nq || 0.8);
      if (R.bend && !sus) { nfil.frequency.setValueAtTime(fq(nf), t); nfil.frequency.exponentialRampToValueAtTime(fq(clamp(nf * Math.pow(2, R.bend / 24), 60, 12000)), t + dur * 0.7); }
      const ng = gain(R.noise * (F.nb === 'brown' ? 1.6 : F.nb === 'pink' ? 2.2 : 1)); chain(nsrc, nfil, ng, head); nodes.push(nfil, ng);
      go(nsrc, Math.random() * Math.max(0.01, b.duration - 0.3));
    }
    if (!srcs.length || (!osc && !nsrc)) { for (const s of srcs) { try { s.stop(); } catch {} } return null; }
    if (!sus && R.sub > 0.05) tn({ t, dur: Math.min(1.6, Math.max(0.2, dur)), f0: clamp(f * 0.5, 34, 90), f1: 30, a: Math.max(0.004, Math.min(0.03, R.attack)), vol: vol * R.sub * 0.9, dest: subBus });
    const p = pn ? pan(pn) : null; let last = env; if (p) { env.connect(p); nodes.push(p); last = p; }
    if (dest) last.connect(dest);
    else { const dry = gain(1 - R.wet * 0.5), wetG = gain(R.wet); chain(last, dry, sfxBus); chain(last, wetG, sfxWet); nodes.push(dry, wetG); }
    if (!sus) done(srcs[0], nodes); else { live++; made++; }
    return { env, osc, nsrc, nfil, srcs, nodes, f, nf };
  }
  function makeShot(R, o) {
    const t0 = Math.max(ctx.currentTime, +o.t || 0) + 0.005, vol = R.gain * clamp(o.vol ?? 1, 0, 1.5), pn = clamp(R.pan + (+o.pan || 0), -1, 1), pm = num(o.pitch, 0.25, 4, 1);
    R.notes.forEach((st, i) => voice(R, t0 + i * R.gap, R.pitch * pm * Math.pow(2, st / 12), vol * (i ? 0.86 : 1) * rnd(0.94, 1.04), pn, o.dest, false));
    return null;
  }
  // a living loop: it goes on until it is stopped or its time is up, and it is never quite still — a slow drift on its
  // pitch (or its colour) that does not line up with its own motion. Returns { stop(fade), set({ gain, pitch }), keep(seconds), bend(ratio), alive }.
  function makeLoop(R, o = {}) {
    if (!o.dest && things.loops.size >= (low() ? 2 : 4)) { const old = things.loops.values().next().value; if (old) old.stop(0.4); }
    const t = ctx.currentTime + 0.01, V = voice(R, t, R.pitch * num(o.pitch, 0.25, 4, 1), R.gain * clamp(o.vol ?? 1, 0, 1.5), clamp(R.pan + (+o.pan || 0), -1, 1), o.dest, true); if (!V) return null;
    const life = ctx.createOscillator(), lg = gain(0); life.frequency.value = rnd(0.11, 0.31); life.start(t);
    if (V.osc) { lg.gain.value = 18; chain(life, lg); lg.connect(V.osc.detune); } else if (V.nfil) { lg.gain.value = 140; chain(life, lg); lg.connect(V.nfil.detune); }
    const h = {
      alive: true, until: o.life === Infinity ? Infinity : ctx.currentTime + num(o.life, 0.5, 120, R.life),
      stop(fade = 0.6) {
        if (!h.alive) return; h.alive = false; things.loops.delete(h); const n = ctx.currentTime, g = V.env.gain; fade = clamp(+fade || 0.6, 0.02, 5);
        try { if (g.cancelAndHoldAtTime) g.cancelAndHoldAtTime(n); else g.cancelScheduledValues(n); g.setTargetAtTime(0, n, fade / 4); } catch {}
        V.srcs[0].onended = () => { live--; for (const nd of [...V.nodes, life, lg]) { try { nd.disconnect(); } catch {} } };
        for (const s of [...V.srcs, life]) { try { s.stop(n + fade * 1.5 + 0.05); } catch {} }
      },
      set(k = {}) { if (!h.alive || !k) return; if (Number.isFinite(k.gain)) V.env.gain.setTargetAtTime(Math.max(0.0001, clamp(k.gain, 0, 1.5) * R.gain), Math.max(ctx.currentTime, t + R.attack), 0.1); if (Number.isFinite(k.pitch)) h.bend(k.pitch); },
      keep(seconds) { if (h.until !== Infinity) h.until = ctx.currentTime + num(seconds, 0.1, 120, R.life); },
      bend(m) { if (!h.alive) return; m = clamp(+m || 1, 0.25, 4); const n = ctx.currentTime; if (V.osc) V.osc.frequency.setTargetAtTime(Math.min(16000, V.f * m), n, 0.06); if (V.nfil) V.nfil.frequency.setTargetAtTime(Math.min(16000, V.nf * m), n, 0.06); if (V.nsrc) V.nsrc.playbackRate.setTargetAtTime(m * (FAM[R.family].nr || 1), n, 0.06); },
    };
    if (!o.dest) things.loops.add(h);
    return h;
  }
  // play a recipe. o: { vol, pan, pitch (a ratio), t (when), x, y, z (where in the world: then it is heard from there), life (loops) }
  function make(r, o) {
    if (!ctx) return null; const R = recipe(r); if (!R) return null; o = o && typeof o === 'object' ? o : {};
    if ([o.x, o.y, o.z].every(Number.isFinite)) {
      if (R.kind === 'loop') {   // somewhere, and alive: it becomes one of the things in the world that sound
        const id = String(o.id ?? 'made:' + (++things.n)), send = (x, y, z) => emit(id, 'thing', x, y, z, { recipe: R, ttl: num(o.life, 0.5, 120, R.life), size: num(o.vol, 0, 3, 1), ref: o.ref, max: o.max });
        send(o.x, o.y, o.z); return { id, move: send, stop: () => api.emitOff(id) };
      }
      api.at3(o.x, o.y, o.z, () => makeShot(R, { ...o, vol: 1 }), { vol: o.vol, ref: o.ref, max: o.max }); return null;
    }
    return R.kind === 'loop' ? makeLoop(R, o) : makeShot(R, o);
  }
  // what a name says about a voice (the first that fits): family, and what is particular to it
  const LEX = [
    [/sparrow|finch|robin|wren|canar|swallow|lark|songbird|budgie|parakeet|hummingbird|chick|nightingale|blackbird|bluebird|thrush|tit\b|bird/, 'chirp', { notes: 2 }],
    [/owl|dove|pigeon|cuckoo/, 'call', { wave: 'sine', bend: -2, notes: 2, gap: 0.3, decay: 0.3 }],
    [/eagle|hawk|falcon|kite\b|osprey|vulture|condor|gull|crow|raven|jay\b|magpie|parrot|macaw|peacock|goose|duck|swan|heron|crane|stork|pelican|albatross|penguin|rooster|chicken|turkey|ptero|griffin|gryphon|harpy/, 'call', { bend: -6, bright: 0.85 }],
    [/dragon|wyvern|hydra|dinosaur|rex\b|raptor|lion|tiger|panther|leopard|jaguar|bear|gorilla|monster|beast|kraken|godzilla|demon|ogre|troll|titan|minotaur|cerberus|chimera|crocodile|alligator|boar|hippo|rhino|bull\b|bison|buffalo|cyclops|leviathan|behemoth/, 'growl', {}],
    [/wolf|dog|hound|fox|coyote|jackal|hyena|puppy|werewolf/, 'call', { bend: 5, decay: 0.9, attack: 0.08 }],
    [/cat\b|kitten|lynx|ocelot|sphinx/, 'call', { bend: -4, wave: 'triangle', decay: 0.45 }],
    [/whale|orca|dolphin|porpoise|narwhal|manatee|dugong|seal\b|walrus|sea lion/, 'ghost', { bend: 7, wet: 0.7 }],
    [/fish|shark|ray\b|eel|squid|octopus|jelly|axolotl|salmon|trout|tuna|koi|carp|seahorse|crab|lobster|shrimp|turtle|tortoise|newt|salamander|tadpole|mermaid|siren|starfish|coral/, 'water', {}],
    [/bee\b|wasp|hornet|fly\b|mosquito|gnat|dragonfly|beetle|bug\b|insect|cicada|locust|moth|butterfly|firefly|ladybug|ladybird|mantis/, 'buzz', {}],
    [/cricket|grasshopper|frog|toad/, 'chirp', { motion: 'pulse', rate: 22, depth: 0.9, decay: 0.3, bend: 1 }],
    [/snake|serpent|cobra|viper|python|lizard|gecko|iguana|chameleon|basilisk|worm/, 'air', { bright: 0.9, decay: 0.7, bend: 3 }],
    [/horse|pony|donkey|zebra|deer|stag|elk|moose|cow\b|ox\b|goat|sheep|ram\b|lamb|pig\b|camel|llama|giraffe|elephant|mammoth|unicorn|pegasus|centaur|antelope|gazelle|satyr|faun/, 'call', { bend: -5, harm: 0.7, attack: 0.05, sub: 0.4 }],
    [/mouse|rat\b|squirrel|hamster|rabbit|hare|bunny|bat\b|hedgehog|mole\b|shrew|ferret|weasel|otter|beaver|raccoon|monkey|ape\b|chimp|lemur|sloth|koala|panda|kangaroo|imp\b|gnome|goblin/, 'chirp', { bend: 4, notes: 3 }],
    [/robot|android|mech|machine|engine|car\b|truck|train|tank|tractor|motor|drone|helicopter|plane|jet\b|rocket|ufo|spaceship|ship|boat|submarine|zeppelin|balloon|computer|clock|automaton/, 'hum', {}],
    [/bell|gong|chime|sword|blade|knife|axe\b|spear|shield|armou?r|helmet|coin|key\b|anvil|iron|steel|bronze|gold|silver|metal|chain|crown|trumpet|horn\b|lyre|harp/, 'metal', {}],
    [/crystal|glass|ice|diamond|gem|jewel|star\b|snow|mirror|prism|pearl|moon|icicle|frost/, 'glass', {}],
    [/rock|stone|boulder|mountain|golem|statue|brick|skull|bone|skeleton|pillar|column|cliff|meteorite|asteroid|planet|gargoyle/, 'stone', {}],
    [/tree|oak\b|pine\b|log\b|wood|plank|door|chair|table|barrel|box\b|crate|cart|branch|stick|ent\b|treant|puppet|violin|guitar|drum/, 'wood', {}],
    [/fire|flame|sun\b|lava|ember|torch|comet|phoenix|meteor|candle|inferno|volcano/, 'fire', {}],
    [/water|wave|rain|drop\b|bubble|river|sea\b|ocean|fountain|puddle|waterfall|tear\b/, 'water', {}],
    [/cloud|wind|ghost|spirit|angel|fog|mist|smoke|shadow|wraith|soul|phantom|fairy|sprite|wisp|god\b|goddess|nymph|genie|djinn/, 'ghost', {}],
    [/lightning|spark|electric|thunder|bolt|laser|plasma|storm|tesla/, 'spark', {}],
    [/heart|egg\b|ball|potato|bread|cheese|pillow|slime|blob|mushroom|flower|leaf|plant|cactus|vegetable|fruit|apple|pumpkin/, 'thump', {}],
  ];
  function hsl(c) {
    let r = 0.85, g = 0.7, b = 0.55;
    if (typeof c === 'string') {
      const s = c.trim(), m = /^#?([0-9a-f]{6})$/i.exec(s), m3 = /^#?([0-9a-f]{3})$/i.exec(s);
      if (m) { const n = parseInt(m[1], 16); r = (n >> 16 & 255) / 255; g = (n >> 8 & 255) / 255; b = (n & 255) / 255; }
      else if (m3) { r = parseInt(m3[1][0], 16) / 15; g = parseInt(m3[1][1], 16) / 15; b = parseInt(m3[1][2], 16) / 15; }
    } else if (typeof c === 'number' && Number.isFinite(c)) { const n = c & 0xffffff; r = (n >> 16 & 255) / 255; g = (n >> 8 & 255) / 255; b = (n & 255) / 255; }
    else if (Array.isArray(c) && c.length >= 3) { const k = Math.max(+c[0] || 0, +c[1] || 0, +c[2] || 0) > 1 ? 255 : 1; r = num(c[0] / k, 0, 1, r); g = num(c[1] / k, 0, 1, g); b = num(c[2] / k, 0, 1, b); }
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn; let h = 0;
    if (d > 1e-4) h = (mx === r ? ((g - b) / d + 6) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4) / 6;
    return [h, d < 1e-4 ? 0 : clamp(d / ((1 - Math.abs(2 * l - 1)) || 1)), l];
  }
  // The voice of a thing, worked out from what is known of it: { name, kind: 'walk' | 'fly' | 'swim', length (metres),
  // color '#rrggbb', parts? } — the same shape the game gets back when he becomes something. Big things are low and slow
  // and have weight under them; small things are high and quick. What it is called decides what kind of throat (or bell,
  // or engine) it has, where the name is one the list knows; where it is not, how it moves and how big it is decide.
  // Bright colours open the sound, strong ones make it richer, warm ones rougher, cold ones purer and further away. And
  // the name itself, hashed, settles everything left over — the exact pitch, the turn of the call — so the same thing
  // always has the same voice and two different things never quite share one.
  //   → { name, kind, size, family, call (its cry), move (a wingbeat, a stroke, a footfall), idle (a living loop: it, being there) }
  // If the thing carries a sound of its own (thing.sound: one recipe, or { call, move, idle }), that is used, checked field by field.
  function voiceFor(thing) {
    const T0 = thing && typeof thing === 'object' ? thing : { name: String(thing ?? 'thing') };
    const name = String(T0.name ?? 'thing').toLowerCase().replace(/[^a-z0-9 \-']/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60) || 'thing';
    const mv = String(T0.kind ?? T0.moves ?? '').toLowerCase(), kind = /fl[yi]|wing|air/.test(mv) ? 'fly' : /swim|water|sea/.test(mv) ? 'swim' : 'walk';
    const len = num(T0.length ?? T0.size, 0.02, 80, 1.5), col = hsl(T0.color ?? T0.colour), key = `${name}|${kind}|${len.toFixed(2)}|${col.map(v => v.toFixed(2)).join(',')}`;
    const given = T0.sound && typeof T0.sound === 'object' && !Array.isArray(T0.sound) ? T0.sound : null;
    if (!given && things.cache.has(key)) return things.cache.get(key);
    const R = prng(hash(name)), size = clamp(Math.log(len / 0.05) / Math.log(1200)), [h, sat, lum] = col;   // (5 cm → 0 … 60 m → 1)
    const warm = sat < 0.12 ? 0 : h < 0.17 || h > 0.9 ? 1 : h > 0.45 && h < 0.75 ? -1 : 0;
    let fam = null, tw = {}; for (const [re, f, t] of LEX) if (re.test(name)) { fam = f; tw = t; break; }
    const r1 = R();
    if (!fam) fam = kind === 'fly' ? (size < 0.3 ? (r1 < 0.65 ? 'chirp' : 'buzz') : size < 0.62 ? 'call' : 'growl') : kind === 'swim' ? (size < 0.5 ? 'water' : 'ghost') : size < 0.22 ? 'chirp' : size < 0.6 ? (r1 < 0.7 ? 'call' : 'thump') : 'growl';
    const F = FAM[fam], semis = (R() * 2 - 1) * 4, pitch = 55 * Math.pow(2, (1 - size) * 5.6 + semis / 12) * (fam === 'growl' ? 0.6 : fam === 'chirp' || fam === 'glass' ? 1.3 : fam === 'buzz' ? 0.35 : 1);
    const count = tw.notes ?? (fam === 'chirp' ? 1 + Math.floor(R() * 3) : fam === 'call' ? 1 + (R() < 0.35 ? 1 : 0) : 1), steps = [3, 5, 7, -2, 2, 12, -5, 4], notes = [0];
    for (let i = 1; i < count; i++) notes.push(steps[Math.floor(R() * steps.length)]);
    const call = recipe({
      family: fam, size, pitch, notes, gap: tw.gap ?? 0.09 + size * 0.3 + R() * 0.08, bend: (tw.bend ?? F.b ?? 0) * (0.7 + R() * 0.6),
      bright: tw.bright ?? clamp(0.3 + lum * 0.55 + (warm < 0 ? 0.1 : 0)), harm: tw.harm ?? clamp(0.3 + sat * 0.6 + warm * 0.1), noise: clamp(F.n * (1 + warm * 0.3)),
      wet: tw.wet ?? clamp(0.22 + (warm < 0 ? 0.25 : 0) + size * 0.2), gain: 0.42 + size * 0.2, sub: clamp(((F.sub || 0) + (tw.sub || 0)) * size),
      wave: tw.wave, attack: tw.attack, decay: tw.decay ? tw.decay * (0.7 + size * 0.8) : undefined,
      motion: tw.motion, rate: tw.rate ?? (F.r || 6) * (0.75 + R() * 0.5) * (fam === 'growl' ? 1.3 - size * 0.6 : 1), depth: tw.depth,
    });
    const legs = Array.isArray(T0.parts) ? T0.parts.filter(p => p && /^leg/.test(String(p.role))).length : 0;
    const move = kind === 'fly' ? recipe({ family: 'air', size, pitch: lerp(1400, 160, size), attack: 0.02 + size * 0.06, decay: 0.12 + size * 0.5, bend: -8, noise: 1, bright: 0.5 + lum * 0.2, sub: size > 0.55 ? (size - 0.55) * 1.6 : 0, gain: 0.3 + size * 0.3, motion: size < 0.25 ? 'flutter' : 'none', rate: clamp(46 - size * 80, 12, 46), depth: 0.8, wet: 0.1 })
      : kind === 'swim' ? recipe({ family: 'water', size, pitch: lerp(700, 120, size), attack: 0.04, decay: 0.25 + size * 0.6, bend: -5, noise: 0.8, gain: 0.3 + size * 0.25, wet: 0.35 })
        : recipe({ family: size > 0.5 ? 'thump' : 'wood', size, pitch: lerp(520, 55, size), decay: 0.06 + size * 0.35, noise: 0.5, gain: 0.25 + size * 0.45, sub: size > 0.5 ? size - 0.3 : 0, notes: legs >= 4 ? [0, -1] : [0], gap: 0.09 + size * 0.12, wet: 0.08 });
    const steady = fam === 'buzz' || fam === 'hum' || fam === 'fire' || fam === 'ghost' || fam === 'water';
    const idle = recipe(steady ? { kind: 'loop', family: fam, size, pitch: fam === 'buzz' ? lerp(420, 90, size) : fam === 'hum' ? lerp(180, 45, size) : Math.max(70, pitch * 0.5), gain: 0.3 + size * 0.1, attack: 0.5, wet: call.wet, bright: call.bright * 0.8, harm: call.harm, rate: call.rate, depth: fam === 'buzz' ? 0.7 : 0.3 }
      : { kind: 'loop', family: 'air', size, pitch: lerp(700, 180, size), gain: 0.26 + size * 0.12, attack: 0.6, noise: 1, bright: 0.4, motion: 'flutter', rate: lerp(1.4, 0.16, size), depth: 0.95, wet: 0.15 });   // (its breathing: quick if it is small, slow as a tide if it is vast)
    let out = { name, kind, size, family: fam, call, move, idle };
    if (given) {
      // (what was worked out stands under what was given; but if the given one is another kind of thing altogether, only
      //  the worked-out size, pitch and level are kept under it — a bell is not played with a throat)
      const over = (d, g, kind) => { const own = pickKeys(g), other = typeof own.family === 'string' && own.family !== d.family; return recipe({ ...(other ? { size: d.size, pitch: d.pitch, gain: d.gain, wet: d.wet, bright: d.bright } : d), ...own, kind }); };
      const sub = k => given[k] && typeof given[k] === 'object' ? over(out[k], given[k], k === 'idle' ? 'loop' : 'shot') : out[k];
      if (given.call || given.move || given.idle) out = { ...out, call: sub('call'), move: sub('move'), idle: sub('idle') };
      else out = { ...out, call: over(out.call, given, 'shot') };   // (one flat recipe: that is its call)
      out.family = out.call.family;
    } else { if (things.cache.size > 64) things.cache.delete(things.cache.keys().next().value); things.cache.set(key, out); }
    return out;
  }

  function resume() { if (ctx && !offline && ctx.state !== 'running' && ctx.resume) { try { const p = ctx.resume(); if (p && p.catch) p.catch(() => {}); } catch {} } }
  const api = {
    // (o: nothing, in the game. A test may hand in its own context — an OfflineAudioContext — and ask for no recordings.)
    init(o) {
      if (ctx) { resume(); return api; }
      if (o && o.context) { ctx = o.context; offline = typeof ctx.startRendering === 'function'; if (o.quality === 'low') quality = 'low'; }
      else {
        const Ctor = globalThis.AudioContext || globalThis.webkitAudioContext;
        if (!Ctor) return api;
        // ('balanced': a little more buffer than 'interactive', so a busy machine gets through a long frame without a gap you can hear)
        try { ctx = new Ctor({ latencyHint: 'balanced' }); } catch { try { ctx = new Ctor(); } catch { ctx = null; return api; } }
      }
      try { build(); } catch (e) { console.warn('audio: could not build', e); ctx = null; return api; }
      resume(); if (o && o.samples === false) readyDone(false); else loadSamples();
      return api;
    },
    resume, ready,
    get ctx() { return ctx; },
    get master() { return post || master || null; },   // (for a recording to listen at: the whole mix as it leaves, before the mute)
    get voiceBus() { return voiceBus || null; },
    get muted() { return muted; },
    setMuted(b) { muted = !!b; if (ctx) { muteGain.gain.setTargetAtTime(muted ? 0 : 1, ctx.currentTime, 0.05); if (surround) surround.rearMute.gain.setTargetAtTime(muted ? 0 : 1, ctx.currentTime, 0.05); } },
    setQuality(q) {
      const next = q === 'low' ? 'low' : 'high'; if (next === quality) return; quality = next;
      if (ctx && reverb) { try { reverb.buffer = makeIR(); } catch {} }
    },
    // ── making room ──
    // a line is being spoken for this long: everything else stands back for it (k: how far, 0…1)
    duck(seconds = 1, k = 1) { if (ctx) hold('voice', DUCK.voice, clamp(+k || 0), Math.max(0, +seconds || 0)); },
    // Ask for room by name, and give it back: focus('conversation', true) … focus('conversation', false). The soundtrack,
    // the world and the effects go down smoothly and come back smoothly; the deepest claim held by anyone wins. Names the
    // engine knows have their own depths ('voice', 'talk', 'big', 'dead'); any other name gets a moderate one, or its own:
    //   o: { music, world, flight, sfx (what is left of each, 0…1), attack, release (seconds), level 0…1, seconds (then it lets go by itself) }
    focus(name, on = true, o) {
      if (!ctx) return; const key = 'focus:' + String(name).slice(0, 32); o = o && typeof o === 'object' ? o : {};
      if (!on) { const c = claims.get(key); if (c) c.until = 0; return; }
      const b = Object.prototype.hasOwnProperty.call(DUCK, name) ? DUCK[name] : name === 'conversation' ? DUCK.talk : DUCK.focus;
      const p = { m: num(o.music, 0, 1, b.m), a: num(o.world, 0, 1, b.a), f: num(o.flight ?? o.world, 0, 1, b.f), s: num(o.sfx, 0, 1, b.s), at: num(o.attack, 0.01, 6, b.at), rl: num(o.release, 0.05, 12, b.rl) };
      hold(key, p, num(o.level, 0, 1, 1), num(o.seconds, 0.05, 3600, 900), true);   // (held until given back; but a claim nobody gives back lets go after a quarter of an hour, so a slip cannot leave the game quiet for good)
    },
    // play any of the sounds above as if from somewhere else: quieter, and from one side (another player's wings, say)
    at(vol, pan, fn) {
      if (!ctx || !(vol > 0.01) || typeof fn !== 'function') return;
      const v = Math.min(1, vol), g = gain(v), pn = ctx.createStereoPanner ? ctx.createStereoPanner() : null, gw = gain(0.8), send = gain(0.56 * v);
      const real = [sfxBus, sfxWet, bigBus, subBus], was = scope;
      if (pn) { pn.pan.value = clamp(pan || 0, -1, 1); chain(g, pn, real[0]); } else g.connect(real[0]);
      gw.connect(g); chain(gw, send, revIn);
      sfxBus = bigBus = subBus = g; sfxWet = gw; scope = { k: v * (was ? was.k : 1) };
      try { fn(); } finally { [sfxBus, sfxWet, bigBus, subBus] = real; scope = was; }
      setTimeout(() => { try { g.disconnect(); gw.disconnect(); send.disconnect(); pn && pn.disconnect(); } catch {} }, 6000);
    },
    // The ears. Where the listener is and which way they face (the lens) — and, if the game knows it, how they are
    // moving (otherwise it is worked out from where they were). Anything played with at3, or told with emit, is then
    // heard from where it is in the world: behind, above, coming up on the left, fading with distance, bent in pitch by
    // the closing speed.
    listen(px, py, pz, fx, fy, fz, vx, vy, vz) {
      if ([px, py, pz, fx, fz].every(Number.isFinite)) {
        const tn_ = tnow(), dt = tn_ - ear.t, l = Math.hypot(fx, fz) || 1, yaw = Math.atan2(fx, fz), step = ear.has && dt > 0.004 && dt < 0.25;
        if ([vx, vy, vz].every(Number.isFinite)) { ear.vx = vx; ear.vy = vy; ear.vz = vz; }
        else if (step) { const k = 1 - Math.exp(-dt / 0.1), ax = (px - ear.x) / dt, ay = (py - ear.y) / dt, az = (pz - ear.z) / dt; if (Math.hypot(ax, ay, az) < 900) { ear.vx += (ax - ear.vx) * k; ear.vy += (ay - ear.vy) * k; ear.vz += (az - ear.vz) * k; } else ear.vx = ear.vy = ear.vz = 0; }
        else if (dt >= 0.25) ear.vx = ear.vy = ear.vz = 0;
        if (step) { let d = yaw - ear.yaw; d -= Math.round(d / (2 * Math.PI)) * 2 * Math.PI; ear.turn += (clamp(-d / dt, -5, 5) - ear.turn) * (1 - Math.exp(-dt / 0.15)); } else if (dt >= 0.25) ear.turn = 0;   // (how fast the view is coming round: to the right is positive)
        if (!ear.has || dt > 0.004 || dt < 0) { ear.x = px; ear.y = py; ear.z = pz; ear.fx = fx / l; ear.fz = fz / l; ear.yaw = yaw; ear.t = tn_; ear.has = true; }
      }
      if (!ctx || !(px + py + pz + fx + fy + fz === px + py + pz + fx + fy + fz)) return;   // (a lens with no place yet has no ears)
      const L = ctx.listener, t = ctx.currentTime;
      if (L.positionX) { L.positionX.setTargetAtTime(px, t, 0.04); L.positionY.setTargetAtTime(py, t, 0.04); L.positionZ.setTargetAtTime(pz, t, 0.04);
        L.forwardX.setTargetAtTime(fx, t, 0.04); L.forwardY.setTargetAtTime(fy, t, 0.04); L.forwardZ.setTargetAtTime(fz, t, 0.04); if (!ear.up) { ear.up = true; L.upX.value = 0; L.upY.value = 1; L.upZ.value = 0; } }   // (up is set once: set every frame, it was three more events a frame on the ears)
      else { try { L.setPosition(px, py, pz); L.setOrientation(fx, fy, fz, 0, 1, 0); } catch {} }
    },
    // a sound made once, at a place: o: { vol, ref, max, roll, life, vx, vy, vz (how the thing that made it is moving), doppler: false (leave its pitch alone) }
    at3(x, y, z, fn, o = {}) {
      if (!ctx || live > cap() || typeof fn !== 'function' || ![x, y, z].every(Number.isFinite)) return;
      o = o || {}; const ref = o.ref ?? 12, max = o.max ?? 600, roll = o.roll ?? 1.1, v = Math.min(1.5, o.vol ?? 1);
      const dx = x - ear.x, dy = y - ear.y, dz = z - ear.z, d = Math.hypot(dx, dy, dz) || 0.001, att = ref / (ref + roll * (clamp(d, ref, max) - ref));
      const vl = (ear.vx * dx + ear.vy * dy + ear.vz * dz) / d, vs = [o.vx, o.vy, o.vz].every(Number.isFinite) ? -(o.vx * dx + o.vy * dy + o.vz * dz) / d : 0;
      const g = gain(v), pn = ctx.createPanner(), gw = gain(0.8), send = gain(0.56 * Math.min(1, v) * att);
      pn.panningModel = quality === 'low' || surround || offline || LEAN.on ? 'equalpower' : 'HRTF'; pn.distanceModel = 'inverse';   // (for two ears: the shape of a head. For a room of speakers: plain left and right, and the rear ones for what is behind)
      pn.refDistance = ref; pn.maxDistance = max; pn.rolloffFactor = roll;
      if (pn.positionX) { pn.positionX.value = x; pn.positionY.value = y; pn.positionZ.value = z; } else pn.setPosition(x, y, z);
      const real = [sfxBus, sfxWet, bigBus, subBus], was = scope, wasDop = dop;
      chain(g, pn, real[0]); gw.connect(g); chain(gw, send, revIn);
      if (surround) { const dh = Math.hypot(dx, dz) || 1, behind = Math.max(0, -(dx * ear.fx + dz * ear.fz) / dh); if (behind > 0.05) { const rb = gain(behind * 0.9 * Math.min(1, ref / Math.max(ref, dh * 0.6))); pn.connect(rb); rb.connect(surround.rearIn); setTimeout(() => { try { rb.disconnect(); } catch {} }, o.life ?? 6000); } }
      sfxBus = bigBus = subBus = g; sfxWet = gw; scope = { k: Math.min(1, v) * att * (was ? was.k : 1) };
      dop = o.doppler === false ? 1 : clamp((SOUND_C + 0.6 * vl) / Math.max(140, SOUND_C - 0.6 * vs), 0.75, 1.45);   // (a sound made once keeps the bend it was made with)
      try { fn(); } finally { [sfxBus, sfxWet, bigBus, subBus] = real; scope = was; dop = wasDop; }
      setTimeout(() => { try { g.disconnect(); pn.disconnect(); gw.disconnect(); send.disconnect(); } catch {} }, o.life ?? 6000);
    },
    // (a bus by name, for a source of the game's own: 'music' | 'world' | 'amb' | 'air' | 'sfx' | 'wet' | 'big' | 'sub' | 'ui' | 'voice')
    bus(name) { return ctx ? ({ music: musicBus, world: worldBus, amb: ambBus, air: airBus, sfx: sfxBus, wet: sfxWet, big: bigBus, sub: subBus, ui: uiBus, voice: voiceBus })[name] || null : null; },
    update, sfx, sting, song: songStart, songPrep, songStop, omen: omenStart, omenStop, get songOn() { return !!(song && song.on); },
    get songTime() { return song && song.on && !song.el.paused && song.el.readyState >= 2 ? song.el.currentTime : -1; },   // (where the song really is, for whatever has to land on a word)
    get reverbIn() { return revIn; },
    setEcho(k) { if (!ctx || !echoSend) return; echoSend.gain.setTargetAtTime(0.14 + 0.9 * clamp(k || 0), ctx.currentTime, 0.6); },   // inside a cave: every sound comes back off the walls
    // ── his fire in leaves: every frame a burning wingtip is in or near them. side: −1 the left wing, +1 the right, 0
    //    both; amount 0…1: how deep in (or how near); speed: his, in the world's units a second (left out: what update was
    //    last told); kind: 'leaves' | 'pine' | 'dry' | 'grass' | 'reeds' | 'cloud'. Stop calling and it dies away by itself.
    brush(side = 0, amount = 0, speed, kind) {
      if (!ctx) return; const now = ctx.currentTime, a = clamp(+amount || 0), s = clamp(+side || 0, -1, 1);
      BR.speed = speed !== undefined && speed !== null && Number.isFinite(+speed) ? Math.max(0, +speed) : fl.speed;
      if (typeof kind === 'string' && Object.prototype.hasOwnProperty.call(BRK, kind)) BR.kind = kind;
      if (s <= 0.5) { const S = BR.side[0]; S.tgt = a * clamp(1 - s); S.until = now + 0.18; }
      if (s >= -0.5) { const S = BR.side[1]; S.tgt = a * clamp(1 + s); S.until = now + 0.18; }
    },
    // in the broken air behind another bird, every frame it is so (amount 0…1): his own wings buffeted, his feathers thrown about
    wake(amount = 0, side = 0) { if (!ctx) return; WK.tgt = clamp(+amount || 0); WK.side = clamp(+side || 0, -1, 1); WK.until = ctx.currentTime + 0.25; },
    // ── things in the world that sound (see EMK for the kinds). Tell it where the thing is — every frame for what moves,
    //    now and then for what does not — and it is heard from there, nearer louder, bent in pitch by the closing speed.
    //    o: { vx, vy, vz (how it moves, if known: otherwise worked out from where it was), size (how much of it: 0…3),
    //         ref, max (how near is full, how far it carries), ttl (seconds it lasts without being told again: 0.75) or
    //         hold: true (until emitOff), doppler (0: none … 1: true to life), pitch (a ratio), thing or recipe (kind 'thing') }
    emit,
    emitOff(id) { const E = EM.all.get(String(id)); if (E) E.until = 0; },
    emitClear(prefix) { for (const E of EM.all.values()) if (prefix === undefined || E.id.startsWith(String(prefix))) E.until = 0; },
    // the same, for when only this is known of it: how far off, how fast the gap is closing (+: nearing), which side (−1 left … +1 right)
    near(id, distance, closing = 0, side = 0, o) {
      if (!ctx || !Number.isFinite(+distance)) return; o = o && typeof o === 'object' ? o : {};
      const s = clamp(+side || 0, -1, 1), f = Math.sqrt(1 - s * s), d = Math.max(0.5, +distance), rx = -ear.fz, rz = ear.fx;
      emit('near:' + id, o.kind || 'bird', ear.x + (rx * s + ear.fx * f) * d, ear.y, ear.z + (rz * s + ear.fz * f) * d, { ...o, closing: +closing || 0, ttl: o.ttl ?? 0.3 });
    },
    // ── voices for new things ──
    make, recipe, voiceFor, levels: LEVEL, levelsRec: REC,
    // one of a thing's own sounds: event 'call' | 'move' | 'idle' (idle returns a handle: stop it, or let its time run out)
    thing(th, event = 'call', o) { if (!ctx) return null; const V = voiceFor(th); return make(V[event === 'move' || event === 'idle' ? event : 'call'], o); },
    // he becomes it: what he was comes apart as air and sparks, drawn up toward the pitch of what he will be; it lands in
    // its new weight; and the new thing says what it is. Returns its voice.
    become(th, seconds = 1.1) {
      if (!ctx) return null; const V = voiceFor(th), t = T(), d = clamp(+seconds || 1.1, 0.4, 4), f = V.call.pitch;
      nz(pink, { t, dur: d, f0: 240, f1: clamp(f * 2, 400, 5000), q: 1.4, a: d * 0.9, swell: true, vol: 0.26, dest: sfxWet });
      nz(crackle, { t, dur: d * 0.9, type: 'highpass', f0: 1800, a: d * 0.4, vol: 0.2, lp: 8000 });
      tn({ t, dur: d + 0.2, type: 'triangle', f0: clamp(f / 4, 40, 400), f1: clamp(f / 2, 60, 800), a: d * 0.7, vol: 0.1, lp: 1800, dest: sfxWet });
      tn({ t: t + d - 0.02, dur: 0.5 + V.size * 0.6, f0: lerp(140, 80, V.size), f1: 38, a: 0.005, vol: 0.16 + V.size * 0.22, dest: subBus });
      make(V.call, { t: t + d * 0.92 });
      return V;
    },
    _debug: () => ({ W, loops, master, glue, limiter, post, EM }),   // (tests only: the insides, to listen at each layer of the mix)
    stats: () => ({ lean: LEAN.on, glitches: +(LEAN.glitch || 0).toFixed(2), live, made, intensity, mode, step: stepN, samples: Object.keys(samples), loops: Object.keys(loops), claims: [...claims.keys()], duck: duckV.slice(), turb: fl.turb, turn: fl.turn, brush: BR.amt || 0, emitters: EM.all.size, voices: EM.n, things: things.loops.size }),
  };
  return api;
}
