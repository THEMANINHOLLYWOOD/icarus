// Icarus — sound design and adaptive score.
// The score is synthesized with WebAudio. Sound effects are recorded: ./sfx/index.json lists how many takes of each
// there are (sfx/<name>-<n>.mp3), and a different take plays each time, with the synthesized version of the sound
// layered quietly under it (or carrying it alone, when the files have not loaded). The long loops — wind, the dive,
// a fall, fire, rain, water — run all the time and are faded in and out by what is happening.
//
//   const audio = createAudio();
//   audio.init();                       // inside a user gesture
//   audio.update(dt, { state, form, speed, vy, grounded, diving, boost, flame, realm, summit, sky, water, skim, sub, rain, burning, falling, wind });
//   audio.sfx.flap(0.8); audio.sting('firstFlight'); src.connect(audio.voiceBus); audio.duck(seconds);

const SAMPLE_NAMES = ['flap', 'ignite', 'rebirth', 'morph', 'impact', 'splash', 'roll', 'flameout', 'thunder', 'wingsopen', 'underworld'];   // (the old single takes, if there is no index)
const LOOPS = ['windloop', 'diveloop', 'fallloop', 'fireloop', 'rainloop', 'waterloop'];
const MIX = { master: 0.85, voice: 1.3, sfx: 0.8, amb: 0.6, music: 0.56 };   // bus levels: the first place to tune the balance

const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;
const mtof = m => 440 * Math.pow(2, (m - 69) / 12);
const rnd = (a = 1, b) => b === undefined ? Math.random() * a : a + Math.random() * (b - a);

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
  let ctx = null, muted = false, quality = 'high';
  let song = null;   // the soundtrack, once it has been started
  let omen = null;   // a dark stretch of it, looped, for the night before the leap
  let master, limiter, muteGain, subF, reverb, revIn, sfxBus, sfxWet, ambBus, musicBus, voiceBus, duckM, duckA;
  let white, pink, brown, crackle;
  const samples = {};
  let live = 0, made = 0;
  const lastP = new Map();

  // continuous layers and score state
  const W = {}, L = {}, lv = { pad: 0, piano: 0, ost: 0, brass: 0, sub: 0, drum: 0, choir: 0 };
  let scoreGain, stingBus, stingPad, padIn, ostIn, under = null, held = null;
  let stepN = 0, nextT = 0, intensity = 0, flyAmt = 0, lift = 0, tAcc = 0, clock = 0;
  let mode = 'normal', modeUntil = 0, silenceUntil = 0, duckUntil = 0, nextMoan = 0, lonely = false, realmUnder = false, lastState = '';

  const cap = () => quality === 'low' ? 44 : 96;
  const low = () => quality === 'low';

  // set a parameter's target only when it actually moved (keeps the automation timeline short)
  function P(param, v, tc = 0.15) {
    const last = lastP.get(param);
    if (last !== undefined && Math.abs(last - v) <= 0.003 * Math.max(1e-3, Math.abs(v), Math.abs(last))) return;
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
    // fire: sparse snaps and pops, each a few milliseconds of decaying noise
    const c = new Float32Array(sr * 4); let e = 0, k = 0.9;
    for (let i = 0; i < c.length; i++) {
      if (Math.random() < 1 / 1700) { const big = Math.random() < 0.12; e = big ? rnd(0.6, 1) : Math.pow(Math.random(), 2) * 0.5; k = big ? 0.9985 : rnd(0.96, 0.995); }
      c[i] = (Math.random() * 2 - 1) * e; e *= k;
    }
    crackle = put(c);
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
    }
    return b;
  }

  // ───────── graph ─────────
  const gain = (v = 1) => { const g = ctx.createGain(); g.gain.value = v; return g; };
  const biq = (type, f, q = 0.7) => { const b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; return b; };
  const pan = (v) => { if (!ctx.createStereoPanner) return null; const p = ctx.createStereoPanner(); p.pan.value = v; return p; };
  function loop(buf, rate = 1) {
    const s = ctx.createBufferSource(); s.buffer = buf; s.loop = true; s.playbackRate.value = rate;
    s.start(0, Math.random() * (buf.duration - 0.1)); return s;
  }
  function chain(...nodes) { for (let i = 0; i < nodes.length - 1; i++) nodes[i].connect(nodes[i + 1]); return nodes[nodes.length - 1]; }

  function build() {
    makeBuffers();
    muteGain = gain(muted ? 0 : 1);
    limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -12; limiter.knee.value = 10; limiter.ratio.value = 4; limiter.attack.value = 0.006; limiter.release.value = 0.28;
    master = gain(MIX.master);
    subF = biq('lowpass', 20000, 0.5);   // closes when his head is under water
    chain(master, subF, limiter, muteGain, ctx.destination);
    reverb = ctx.createConvolver(); reverb.buffer = makeIR();
    revIn = gain(1); chain(revIn, reverb, gain(0.9), master);

    sfxBus = gain(MIX.sfx); sfxBus.connect(master); chain(sfxBus, gain(0.16), revIn);
    sfxWet = gain(MIX.sfx * 0.8); sfxWet.connect(master); chain(sfxWet, gain(0.7), revIn);
    duckA = gain(1); duckA.connect(master); ambBus = gain(MIX.amb); ambBus.connect(duckA);
    duckM = gain(1); duckM.connect(master); chain(duckM, gain(0.34), revIn);
    musicBus = gain(MIX.music); musicBus.connect(duckM);
    voiceBus = gain(MIX.voice);
    const pres = biq('peaking', 3000, 0.8); pres.gain.value = 2.5;
    chain(voiceBus, biq('highpass', 70, 0.7), pres, master);

    // wind: a low body, a stereo mid band, a soft top, a whistle for dives and a pressure rumble at speed
    const band = (buf, rate, filters, panV) => {
      const g = gain(0), p = panV ? pan(panV) : null;
      chain(loop(buf, rate), ...filters, g); (p ? chain(g, p) : g).connect(ambBus);
      return { g, f: filters[0] };
    };
    W.low = band(brown, 1, [biq('lowpass', 260, 0.3)]);
    if (low()) W.mid = [band(pink, 1, [biq('bandpass', 500, 0.5)])];
    else W.mid = [band(pink, 1, [biq('bandpass', 500, 0.5)], -0.6), band(pink, 0.93, [biq('bandpass', 560, 0.5)], 0.6)];
    W.high = band(pink, 1.1, [biq('bandpass', 2200, 0.7), biq('lowpass', 4500, 0.5)]);
    W.whistle = band(white, 1, [biq('bandpass', 1200, 14), biq('lowpass', 5000, 0.5)]);
    W.rumble = band(brown, 0.5, [biq('lowpass', 80, 0.5)]);
    W.fall = band(white, 1, [biq('bandpass', 700, 1.6), biq('lowpass', 5000, 0.5)]);
    W.fire = band(brown, 1.3, [biq('lowpass', 480, 0.6)]);
    W.crackle = band(crackle, 1, [biq('highpass', 900, 0.5), biq('lowpass', 7000, 0.5)]);
    W.water = band(pink, 0.8, [biq('bandpass', 700, 0.6)]);
    W.foam = band(white, 1, [biq('highpass', 2600, 0.5), biq('lowpass', 6500, 0.5)]);
    W.rain = band(white, 1, [biq('highpass', 1400, 0.4), biq('lowpass', 8000, 0.5)]);
    W.rainLow = band(pink, 1, [biq('bandpass', 420, 0.5)]);
    // wings buffeting: low noise fluttered by an LFO
    {
      const g = gain(0), flut = gain(0.6), lfo = ctx.createOscillator(), depth = gain(0.4), f = biq('bandpass', 190, 0.9);
      lfo.type = 'sine'; lfo.frequency.value = 9; lfo.start(); chain(lfo, depth); depth.connect(flut.gain);
      chain(loop(brown, 1), f, flut, g, ambBus);
      W.buffet = { g, f, lfo };
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
    const a = Math.min(o.a ?? 0.02, o.dur * 0.5);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(Math.max(0.0002, o.vol), t + a);
    if (o.hold) g.gain.setValueAtTime(Math.max(0.0002, o.vol), t + a + o.hold);
    g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
  }
  // filtered noise: { t, dur, type, f0, f1, f2, tf, q, a, hold, vol, rate, lp, pan, dest }
  function nz(buf, o) {
    if (!ctx || live > cap()) return;
    const t = o.t ?? ctx.currentTime, s = ctx.createBufferSource(), f = biq(o.type || 'bandpass', o.f0, o.q ?? 1), g = gain(0);
    s.buffer = buf; s.loop = true; if (o.rate) s.playbackRate.value = o.rate;
    f.frequency.setValueAtTime(o.f0, t);
    if (o.f1) f.frequency.exponentialRampToValueAtTime(o.f1, t + o.dur * (o.tf ?? 1));
    if (o.f2) f.frequency.exponentialRampToValueAtTime(o.f2, t + o.dur);
    shape(g, o, t);
    const nodes = [s, f, g]; chain(s, f, g); out(g, o, nodes);
    s.start(t, Math.random() * Math.max(0.01, buf.duration - 0.5)); s.stop(t + o.dur + 0.05);
    done(s, nodes);
  }
  // a pitched tone: { t, dur, type, f0, f1, tf, a, hold, vol, det, lp, pan, dest }
  function tn(o) {
    if (!ctx || live > cap()) return;
    const t = o.t ?? ctx.currentTime, os = ctx.createOscillator(), g = gain(0);
    os.type = o.type || 'sine'; os.frequency.setValueAtTime(o.f0, t); if (o.det) os.detune.value = o.det;
    if (o.f1) os.frequency.exponentialRampToValueAtTime(o.f1, t + o.dur * (o.tf ?? 1));
    shape(g, o, t);
    const nodes = [os, g]; os.connect(g); out(g, o, nodes);
    os.start(t); os.stop(t + o.dur + 0.05);
    done(os, nodes);
  }
  // one take of a recorded sound: never the one that played last, a touch off in pitch and level so even that one varies
  const lastTake = {};
  function smp(name, vol = 1, rate = 1, t, dest, pan = 0) {
    const L = samples[name]; if (!L || !L.length || !ctx || live > cap()) return false;
    let k = Math.floor(Math.random() * L.length); if (L.length > 1 && k === lastTake[name]) k = (k + 1 + Math.floor(Math.random() * (L.length - 1))) % L.length;
    lastTake[name] = k;
    const S = L[k], s = ctx.createBufferSource(), g = gain(vol * S.gain * rnd(0.88, 1.06));
    s.buffer = S.buf; s.playbackRate.value = rate * rnd(0.97, 1.03);
    if (pan && ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = clamp(pan, -1, 1); chain(s, g, p, dest || sfxBus); done(s, [s, g, p]); }
    else { chain(s, g, dest || sfxBus); done(s, [s, g]); }
    s.start(t ?? ctx.currentTime, S.off);
    return true;
  }
  const has = name => !!(samples[name] && samples[name].length);
  // the loops: each a buffer that never stops, behind its own fader
  const loops = {};
  function startLoop(name, buf) {
    if (!ctx || loops[name]) return;
    const s = ctx.createBufferSource(), g = gain(0);
    s.buffer = buf; s.loop = true; s.playbackRate.value = 1;
    chain(s, g, name === 'fireloop' ? sfxBus : ambBus);
    s.start(ctx.currentTime, Math.random() * buf.duration);
    loops[name] = { s, g, peak: analyse(buf)?.gain || 1 };
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
  function songStart(offset = 0) {
    if (!ctx || typeof Audio !== 'function') return;
    try {
      songMake();
      omenStop(0.7);   // the dark bars give way to the song itself
      song.el.currentTime = Math.max(0, offset); song.on = true;
      const pr = song.el.play(); if (pr && pr.catch) pr.catch(() => { song.on = false; });
      song.g.gain.cancelScheduledValues(ctx.currentTime); song.g.gain.setValueAtTime(0.0001, ctx.currentTime);
      song.g.gain.linearRampToValueAtTime(0.62, ctx.currentTime + (offset > 1 ? 0.25 : 2.5));   // (cut in hard from the middle; fade in from the top)
    } catch (e) { console.warn('song', e); song = null; }
  }
  // Before he has ever flown, the song is held back: only its darkest bars, looped, low and filtered, under the storm.
  // Its first sung word is saved for the leap.
  function omenStart() {
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
  function songStop(fade = 2) { if (!song || !song.on) return; song.on = false; P(song.g.gain, 0, fade / 3); setTimeout(() => { if (song && !song.on) song.el.pause(); }, fade * 1000 + 200); }
  const loopSet = (name, v, rate, tc = 0.35) => { const L = loops[name]; if (!L) return false; P(L.g.gain, v * Math.min(L.peak, 3) * 0.5, tc); if (rate) P(L.s.playbackRate, rate, 0.5); return true; };
  function analyse(buf) {
    const d = buf.getChannelData(0); let peak = 0, sum = 0;
    for (let i = 0; i < d.length; i++) { const a = Math.abs(d[i]); if (a > peak) peak = a; sum += a * a; }
    if (!(peak > 0.001)) return null;
    const rms = Math.sqrt(sum / d.length); let first = 0;
    while (first < d.length && Math.abs(d[first]) < peak * 0.03) first++;
    return { buf, gain: Math.min(0.8 / peak, 0.16 / Math.max(rms, 1e-4)), off: Math.max(0, first / buf.sampleRate - 0.005) };
  }
  function loadOne(file) {
    let url; try { url = new URL(`./sfx/${file}.mp3`, import.meta.url).href; } catch { return Promise.resolve(null); }
    return Promise.resolve().then(() => fetch(url)).then(r => r && r.ok ? r.arrayBuffer() : null)
      .then(b => b ? new Promise(res => {
        try { const p = ctx.decodeAudioData(b, res, () => res(null)); if (p && p.catch) p.catch(() => res(null)); } catch { res(null); }
      }) : null).catch(() => null);
  }
  function loadSamples() {
    if (typeof fetch !== 'function') return;
    let iurl; try { iurl = new URL('./sfx/index.json', import.meta.url).href; } catch { return; }
    Promise.resolve().then(() => fetch(iurl)).then(r => r && r.ok ? r.json() : null).catch(() => null).then(index => {
      const list = index || Object.fromEntries(SAMPLE_NAMES.map(n => [n, 0]));
      for (const [name, n] of Object.entries(list)) {
        const files = n ? Array.from({ length: n }, (_, k) => `${name}-${k + 1}`) : [name];
        files.forEach(f => loadOne(f).then(buf => {
          if (!buf) return;
          if (LOOPS.includes(name)) return startLoop(name, buf);
          const S = analyse(buf); if (S) (samples[name] = samples[name] || []).push(S);
        }));
      }
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
  function bell(f, t, vol, dest) {
    if (live > cap()) return;
    const g = gain(0), nodes = [g]; let first = null;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t + 2.8);
    for (const [mul, v, d] of [[1, 1, 2.8], [2, 0.3, 1.4], [3.01, 0.08, 0.6]]) {
      const o = ctx.createOscillator(), og = gain(v); o.type = 'sine'; o.frequency.value = f * mul;
      og.gain.setValueAtTime(v, t); og.gain.exponentialRampToValueAtTime(0.0001, t + d);
      chain(o, og, g); o.start(t); o.stop(t + 2.9); nodes.push(o, og); first = first || o;
    }
    g.connect(dest || sfxWet); done(first, nodes);
  }

  // ───────── sound effects ─────────
  const T = () => ctx.currentTime + 0.005;
  const sfx = {
    flap(power = 0.6) {
      if (!ctx) return; const t = T(), p = clamp(power), pn = rnd(-0.25, 0.25), k = has('flap') ? 0.4 : 1;
      smp('flap', 0.62 * (0.45 + p), rnd(0.92, 1.1) - (1 - p) * 0.08, t, null, pn);
      nz(pink, { t, dur: 0.42, f0: rnd(820, 1050), f1: 170, q: 0.8, a: 0.06, vol: 0.3 * (0.5 + p) * k, pan: pn });
      nz(brown, { t: t + 0.03, dur: 0.3, type: 'lowpass', f0: 240, f1: 90, a: 0.05, vol: 0.5 * (0.4 + p) * k, pan: pn });
    },
    ignite() {
      if (!ctx) return; const t = T();
      smp('ignite', 0.75, 1, t);
      nz(brown, { t, dur: 1.7, type: 'lowpass', f0: 150, f1: 2600, f2: 320, tf: 0.35, a: 0.18, vol: 0.7 });
      nz(crackle, { t: t + 0.1, dur: 1.6, type: 'highpass', f0: 1200, a: 0.1, vol: 0.5, lp: 7000 });
      tn({ t, dur: 0.9, f0: 78, f1: 38, a: 0.03, vol: 0.5 });
    },
    rebirth() {
      if (!ctx) return; const t = T();
      smp('rebirth', 0.85, 1, t);
      nz(pink, { t, dur: 0.55, f0: 200, f1: 3200, q: 1.2, a: 0.5, vol: 0.4, dest: sfxWet });                 // the breath in
      tn({ t: t + 0.5, dur: 1.5, f0: 118, f1: 33, tf: 0.5, a: 0.006, vol: 0.9 });                           // the boom
      nz(brown, { t: t + 0.5, dur: 2.4, type: 'lowpass', f0: 2800, f1: 300, a: 0.03, vol: 0.8, dest: sfxWet });
      nz(crackle, { t: t + 0.5, dur: 2.2, type: 'highpass', f0: 1000, a: 0.05, vol: 0.55, lp: 7500 });
      [74, 81, 86, 90].forEach((m, i) => bell(mtof(m), t + 0.55 + i * 0.07, 0.07, sfxWet));
    },
    wingsOpen() {
      if (!ctx) return; const t = T();
      smp('wingsopen', 0.7, rnd(0.95, 1.05), t);
      nz(white, { t, dur: 0.2, f0: 2600, f1: 600, q: 0.8, a: 0.008, vol: 0.3, lp: 5500 });
      nz(brown, { t: t + 0.02, dur: 0.45, type: 'lowpass', f0: 320, f1: 80, a: 0.03, vol: 0.75 });
      nz(pink, { t: t + 0.08, dur: 0.9, f0: 420, f1: 240, q: 0.6, a: 0.2, vol: 0.22 });
    },
    // the title burning down to nothing: the fire going out, then the last of it crackling as it falls apart
    flameout() {
      if (!ctx) return; const t = T();
      smp('flameout', 0.85, rnd(0.92, 1.0), t);
      nz(pink, { t, dur: 1.6, f0: 2400, f1: 500, q: 0.7, a: 0.05, vol: 0.28, lp: 6000 });
      for (let i = 0; i < 9; i++) nz(white, { t: t + 0.15 + Math.random() * 1.3, dur: 0.03 + Math.random() * 0.05, f0: 3000 + Math.random() * 3000, f1: 1500, q: 1.5, a: 0.002, vol: 0.12 + Math.random() * 0.12 });
    },
    wingsFail() {
      if (!ctx) return; const t = T();
      smp('flameout', 0.75, 1, t);
      for (let i = 0; i < 3; i++) nz(pink, { t: t + i * 0.16, dur: 0.24, f0: 1700 - i * 420, f1: 300, q: 1, a: 0.02, vol: 0.32 - i * 0.07 });
      nz(brown, { t, dur: 1.1, type: 'lowpass', f0: 1800, f1: 140, a: 0.03, vol: 0.5 });
      tn({ t, dur: 1.1, type: 'triangle', f0: 310, f1: 72, a: 0.03, vol: 0.14, lp: 900 });
    },
    swoop() {
      if (!ctx) return; const t = T();
      nz(pink, { t, dur: 0.8, f0: 300, f1: 1700, f2: 240, tf: 0.45, q: 0.9, a: 0.3, vol: 0.5, pan: rnd(-0.3, 0.3) });
      nz(brown, { t, dur: 0.8, type: 'lowpass', f0: 140, f1: 420, f2: 100, tf: 0.5, a: 0.3, vol: 0.5 });
    },
    roll() {
      if (!ctx) return; const t = T();
      smp('roll', 0.7, rnd(0.95, 1.05), t);
      [[0, 0.5], [0.17, 0.36], [0.36, 0.42]].forEach(([d, v]) => {
        tn({ t: t + d, dur: 0.2, f0: rnd(78, 96), f1: 44, a: 0.004, vol: v });
        nz(brown, { t: t + d, dur: 0.12, type: 'lowpass', f0: 700, f1: 200, a: 0.003, vol: v * 0.7 });
      });
      nz(pink, { t, dur: 0.6, f0: 900, f1: 380, q: 0.6, a: 0.05, vol: 0.14 });
    },
    land(strength = 0.5) {
      if (!ctx) return; const t = T(), s = clamp(strength);
      if (smp('land', 0.35 + s * 0.55, rnd(0.95, 1.05) - s * 0.08, t)) { if (s > 0.55) tn({ t, dur: 0.35, f0: 80, f1: 38, a: 0.004, vol: s * 0.5 }); return; }
      tn({ t, dur: 0.3 + s * 0.2, f0: 92 + s * 20, f1: 40, a: 0.004, vol: 0.25 + s * 0.5 });
      nz(brown, { t, dur: 0.16 + s * 0.1, type: 'lowpass', f0: 500 + s * 500, f1: 150, a: 0.003, vol: 0.2 + s * 0.4 });
      if (s > 0.6) nz(pink, { t: t + 0.02, dur: 0.4, f0: 700, f1: 300, q: 0.6, a: 0.02, vol: 0.12 });
    },
    stumble() {
      if (!ctx) return; const t = T();
      sfx.land(0.9);
      nz(pink, { t: t + 0.05, dur: 0.85, f0: 620, f1: 300, q: 0.7, a: 0.05, vol: 0.26 });                 // the skid
      tn({ t: t + 0.42, dur: 0.3, f0: 80, f1: 42, a: 0.004, vol: 0.4 });
      nz(brown, { t: t + 0.42, dur: 0.14, type: 'lowpass', f0: 600, f1: 180, a: 0.003, vol: 0.3 });
    },
    impact() {
      if (!ctx) return; const t = T();
      smp('impact', 0.9, 1, t);
      tn({ t, dur: 1.0, f0: 74, f1: 24, tf: 0.5, a: 0.004, vol: 1 });
      tn({ t, dur: 0.5, f0: 150, f1: 50, a: 0.003, vol: 0.4 });
      nz(white, { t, dur: 0.09, type: 'lowpass', f0: 3000, f1: 500, a: 0.002, vol: 0.4 });
      nz(brown, { t, dur: 0.7, type: 'lowpass', f0: 1100, f1: 120, a: 0.004, vol: 0.8, dest: sfxWet });
    },
    splash(big) {
      if (!ctx) return; const t = T(), d = big ? 1.7 : 0.9, v = big ? 1 : 0.6;
      smp('splash', 0.8 * v, big ? 0.9 : 1.1, t);
      nz(white, { t, dur: d, type: 'highpass', f0: 900, f1: 2400, a: 0.02, vol: 0.3 * v, lp: 6000, dest: sfxWet });
      nz(pink, { t, dur: d * 0.8, f0: 1400, f1: 400, q: 0.5, a: 0.02, vol: 0.4 * v });
      tn({ t, dur: 0.5, f0: 130, f1: 48, a: 0.006, vol: 0.5 * v });
      for (let i = 0; i < (big ? 6 : 3); i++) { const f = rnd(280, 520); tn({ t: t + 0.15 + rnd(0.7), dur: 0.09, f0: f, f1: f * 2.1, a: 0.01, vol: 0.06, pan: rnd(-0.5, 0.5) }); }
    },
    morph(seconds = 3) {
      if (!ctx) return; const t = T(), d = Math.max(0.8, seconds);
      smp('morph', 0.6, 1, t, sfxWet);
      nz(pink, { t, dur: d, f0: 260, f1: 4200, q: 1.4, a: d * 0.7, vol: 0.3, dest: sfxWet });
      tn({ t, dur: d + 0.4, f0: 55, f1: 110, a: d * 0.6, vol: 0.3 });
      [62, 69, 74, 77].forEach((m, i) => tn({ t: t + i * d * 0.12, dur: d - i * d * 0.12 + 0.3, f0: mtof(m), f1: mtof(m + 12), a: d * 0.5, vol: 0.05, dest: sfxWet, pan: (i - 1.5) * 0.3 }));
      [86, 93, 98].forEach((m, i) => bell(mtof(m), t + d - 0.05 + i * 0.06, 0.05, sfxWet));
      tn({ t: t + d - 0.03, dur: 0.9, f0: 92, f1: 40, a: 0.004, vol: 0.5 });
    },
    reveal() {
      if (!ctx) return; const t = T();
      [50, 57, 62, 66, 69, 74].forEach((m, i) => padNote(m, t + i * 0.03, 2.4, 0.04, stingPad, { att: 0.45, rel: 3 }));
      tn({ t, dur: 1.6, f0: 73.4, f1: 36.7, a: 0.01, vol: 0.6 });
      nz(white, { t, dur: 2.2, type: 'highpass', f0: 4000, f1: 7000, a: 0.5, vol: 0.05, dest: sfxWet });
      [74, 78, 81, 86].forEach((m, i) => bell(mtof(m), t + 0.2 + i * 0.09, 0.06, sfxWet));
    },
    teleport() {
      if (!ctx) return; const t = T();
      nz(pink, { t, dur: 0.6, f0: 240, f1: 3600, q: 1.5, a: 0.5, vol: 0.4, dest: sfxWet });
      tn({ t, dur: 0.6, f0: 220, f1: 880, a: 0.5, vol: 0.07, dest: sfxWet });
      tn({ t: t + 0.56, dur: 0.6, f0: 96, f1: 38, a: 0.004, vol: 0.6 });
      nz(brown, { t: t + 0.56, dur: 0.9, type: 'lowpass', f0: 1600, f1: 200, a: 0.005, vol: 0.4, dest: sfxWet });
      bell(mtof(81), t + 0.58, 0.06, sfxWet);
    },
    thunder() {
      if (!ctx) return; const t = T();
      smp('thunder', 0.8, rnd(0.9, 1.05), t, sfxWet);
      nz(white, { t, dur: 0.16, type: 'highpass', f0: 1800, a: 0.002, vol: 0.5, lp: 6500, dest: sfxWet });
      for (let i = 0; i < 5; i++) nz(brown, { t: t + 0.05 + i * rnd(0.4, 0.75), dur: rnd(0.9, 1.6), type: 'lowpass', f0: rnd(180, 340), f1: 70, a: 0.05, vol: 0.9 - i * 0.14, dest: sfxWet, pan: rnd(-0.4, 0.4), rate: 0.6 });
      tn({ t, dur: 2.2, f0: 52, f1: 28, a: 0.02, vol: 0.5 });
    },
    // Through a ring of light: the air tearing past as he threads it, the hoop catching with a soft whoomp and a crackle,
    // and a bell that climbs one step of the scale with every ring in the line — a fifth above it when he went through the
    // heart, and the whole chord when the line is done.
    ring(i = 0, perfect = false, last = false) {
      if (!ctx) return; const t = T();
      const steps = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24], f = 392 * Math.pow(2, steps[Math.min(i, steps.length - 1)] / 12);
      nz(white, { t, dur: 0.42, f0: 4800, f1: 650, q: 0.8, a: 0.008, vol: 0.34 });
      nz(pink, { t, dur: 0.55, type: 'lowpass', f0: 2800, f1: 260, a: 0.015, vol: 0.42 });
      nz(brown, { t: t + 0.03, dur: 0.95, type: 'lowpass', f0: 170, f1: 1700, f2: 240, tf: 0.22, a: 0.04, vol: 0.6 });
      nz(crackle, { t: t + 0.07, dur: 1.5, type: 'highpass', f0: 1400, a: 0.07, vol: 0.3, lp: 8000 });
      smp('ignite', 0.32, 1.2 + Math.min(i, 8) * 0.03, t + 0.02);
      tn({ t, dur: 0.5, f0: 110, f1: 52, a: 0.01, vol: perfect ? 0.45 : 0.3 });
      bell(f, t + 0.02, perfect ? 0.13 : 0.09, sfxWet);
      bell(f * 2, t + 0.05, 0.028, sfxWet);
      if (perfect) bell(f * 1.5, t + 0.1, 0.07, sfxWet);
      if (last) [1, 1.25, 1.5, 2, 2.5].forEach((m, k) => bell(f * m / 2, t + 0.3 + k * 0.085, 0.06, sfxWet));
    },
    // Zeus does not speak; this is how he talks. A strike on top of him: the tear, a blast of white noise, the recorded
    // thunder twice over (one a little slower, so it is huge and wide), a sub-bass blow you feel more than hear, and a long
    // roll away across the mountains — with everything else ducked out of its way, so nothing in the game is louder.
    zeus(big = true) {
      if (!ctx) return; const t = T(), k = big ? 1 : 0.75;
      duckUntil = Math.max(duckUntil, ctx.currentTime + (big ? 3.2 : 2.2));
      nz(white, { t, dur: 0.3, type: 'highpass', f0: 2600, f1: 800, a: 0.001, vol: 1.2 * k, lp: 11000 });
      nz(white, { t: t + 0.02, dur: 0.9, f0: 2000, f1: 220, q: 0.45, a: 0.002, vol: 1.1 * k, dest: sfxWet });
      for (let i = 0; i < 8; i++) nz(white, { t: t + 0.03 + i * rnd(0.02, 0.07), dur: 0.06, type: 'highpass', f0: rnd(2500, 6000), a: 0.001, vol: rnd(0.5, 0.9) * k, pan: rnd(-0.8, 0.8) });
      smp('crack', 1.2 * k, rnd(0.92, 1.0), t, sfxWet);
      smp('thunder', 1.3 * k, rnd(0.82, 0.9), t + 0.04, sfxWet);
      smp('thunder', 0.9 * k, rnd(0.68, 0.74), t + 0.32, sfxWet);
      tn({ t, dur: 2.8, f0: 70, f1: 22, tf: 0.5, a: 0.003, vol: 1.3 * k });
      tn({ t: t + 0.05, dur: 1.4, f0: 41, f1: 24, a: 0.01, vol: 1.1 * k });
      for (let i = 0; i < 7; i++) nz(brown, { t: t + 0.25 + i * rnd(0.35, 0.7), dur: rnd(1.2, 2.2), type: 'lowpass', f0: rnd(160, 320), f1: 55, a: 0.06, vol: (1.1 - i * 0.13) * k, dest: sfxWet, pan: rnd(-0.7, 0.7) });
    },
    crack() {   // lightning right beside him: the tearing crack first, then everything it shakes loose
      if (!ctx) return; const t = T();
      if (smp('crack', 1, rnd(0.95, 1.05), t, sfxWet)) { tn({ t, dur: 1.4, f0: 90, f1: 26, tf: 0.3, a: 0.004, vol: 0.8 }); return; }
      nz(white, { t, dur: 0.22, type: 'highpass', f0: 2400, f1: 900, a: 0.001, vol: 1, lp: 9000 });
      nz(white, { t: t + 0.03, dur: 0.5, f0: 1800, f1: 300, q: 0.5, a: 0.002, vol: 0.8, dest: sfxWet });
      for (let i = 0; i < 5; i++) nz(white, { t: t + 0.05 + i * rnd(0.03, 0.08), dur: 0.07, type: 'highpass', f0: rnd(2500, 5000), a: 0.001, vol: rnd(0.4, 0.8), pan: rnd(-0.6, 0.6) });   // the crackle
      smp('thunder', 1, rnd(1.05, 1.2), t + 0.02, sfxWet);
      tn({ t, dur: 1.6, f0: 90, f1: 26, tf: 0.3, a: 0.004, vol: 1 });
      for (let i = 0; i < 4; i++) nz(brown, { t: t + 0.12 + i * rnd(0.3, 0.6), dur: rnd(1, 1.8), type: 'lowpass', f0: rnd(220, 420), f1: 70, a: 0.03, vol: 1 - i * 0.18, dest: sfxWet, pan: rnd(-0.5, 0.5), rate: 0.6 });
    },
    leaves() {   // through a tree: a short tearing rush, and twigs
      if (!ctx) return; const t = T();
      if (smp('leaves', 0.8, rnd(0.95, 1.1), t, null, rnd(-0.3, 0.3))) return;
      nz(pink, { t, dur: 0.5, f0: 2400, f1: 900, q: 0.6, a: 0.02, vol: 0.5, pan: rnd(-0.3, 0.3) });
      nz(white, { t, dur: 0.35, type: 'highpass', f0: 3000, f1: 1800, a: 0.01, vol: 0.2, lp: 7000 });
      for (let i = 0; i < 4; i++) nz(brown, { t: t + rnd(0.02, 0.3), dur: 0.05, type: 'lowpass', f0: rnd(900, 1500), f1: 300, a: 0.002, vol: rnd(0.2, 0.4), pan: rnd(-0.5, 0.5) });
    },
    surge() {   // the sea standing up: a long low swell of noise, and the air knocked out of the way
      if (!ctx) return; const t = T();
      if (smp('surge', 0.95, 1, t, sfxWet)) { tn({ t, dur: 2.6, f0: 62, f1: 30, tf: 0.6, a: 0.25, vol: 0.6 }); return; }
      tn({ t, dur: 2.6, f0: 62, f1: 30, tf: 0.6, a: 0.25, vol: 0.9 });
      nz(brown, { t, dur: 3.4, type: 'lowpass', f0: 160, f1: 900, f2: 140, tf: 0.35, a: 0.5, vol: 0.9, dest: sfxWet });
      nz(pink, { t: t + 0.3, dur: 3, f0: 500, f1: 1900, f2: 400, tf: 0.5, q: 0.5, a: 0.8, vol: 0.4, dest: sfxWet });
      nz(white, { t, dur: 0.14, type: 'highpass', f0: 1500, a: 0.003, vol: 0.35, lp: 6000 });
    },
    descend() {
      if (!ctx) return; const t = T();
      sfx.splash(true);
      smp('underworld', 0.85, 1, t + 0.15, sfxWet);
      nz(pink, { t: t + 0.1, dur: 3, type: 'lowpass', f0: 3200, f1: 110, tf: 0.8, a: 0.05, vol: 0.5, dest: sfxWet });   // the water closing overhead
      tn({ t: t + 0.1, dur: 3.4, f0: 84, f1: 27, a: 0.05, vol: 0.8 });
      [62, 63, 69].forEach((m, i) => glassNote(m + 12, t + 1 + i * 0.5, 0.05, sfxWet));
    },
    step(stone = false) {
      if (!ctx || live > cap() - 20) return; const t = T();
      if (smp(stone && has('stepstone') ? 'stepstone' : 'step', rnd(0.14, 0.2), rnd(0.92, 1.08), t, null, rnd(-0.12, 0.12))) return;
      nz(brown, { t, dur: 0.07, type: 'lowpass', f0: rnd(380, 620), f1: 160, a: 0.003, vol: rnd(0.1, 0.16), pan: rnd(-0.12, 0.12) });
    },
    // a footfall on whatever is underfoot: the recorded step, and the ground's own sound laid over it
    foot(kind = 'grass', k = 1) {
      if (!ctx || live > cap() - 20) return; const t = T(), p = rnd(-0.12, 0.12), v = Math.min(1.3, 0.6 + 0.5 * k);
      const hard = kind === 'stone' || kind === 'rock', soft = kind === 'snow' || kind === 'sand' || kind === 'ash';
      if (kind !== 'water') smp(hard && has('stepstone') ? 'stepstone' : 'step', rnd(0.12, 0.17) * v * (soft ? 0.7 : 1), rnd(0.92, 1.08) * (kind === 'snow' ? 0.9 : 1), t, null, p);
      if (kind === 'grass') nz(pink, { t, dur: 0.09, f0: rnd(2200, 3200), q: 0.8, a: 0.004, vol: 0.05 * v, pan: p });   // the blades brushed aside
      else if (kind === 'leaves') { nz(pink, { t, dur: 0.07, f0: rnd(2600, 4200), q: 1.4, a: 0.002, vol: 0.09 * v, pan: p }); nz(pink, { t: t + 0.05, dur: 0.06, f0: rnd(1800, 3000), q: 1.2, a: 0.002, vol: 0.06 * v, pan: p }); }   // dry leaves crackling
      else if (kind === 'snow') for (let i = 0; i < 3; i++) nz(white, { t: t + i * 0.025 + rnd(0, 0.01), dur: 0.05, f0: rnd(2600, 4800), q: 2.2, a: 0.002, vol: 0.07 * v, pan: p });   // the crunch
      else if (kind === 'sand') nz(brown, { t, dur: 0.11, type: 'lowpass', f0: 1100, f1: 400, a: 0.01, vol: 0.12 * v, pan: p });
      else if (kind === 'water') { nz(pink, { t, dur: 0.16, f0: rnd(900, 1600), f1: 600, q: 0.9, a: 0.004, vol: 0.12 * v, pan: p }); tn({ t: t + 0.02, dur: 0.09, f0: rnd(320, 420), f1: 160, a: 0.004, vol: 0.05 * v }); }   // slosh, and the bloop
      else if (hard) nz(white, { t, dur: 0.025, type: 'highpass', f0: 3000, a: 0.001, vol: 0.05 * v, pan: p });   // the click of it
      else if (kind === 'ash') nz(brown, { t, dur: 0.12, type: 'lowpass', f0: 520, f1: 260, a: 0.01, vol: 0.13 * v, pan: p });
    },
    whoosh(up) {
      if (!ctx) return; const t = T();
      if (smp('whoosh', 0.7, up ? rnd(1.0, 1.12) : rnd(0.85, 0.95), t, null, rnd(-0.4, 0.4))) return;
      nz(pink, { t, dur: 0.75, f0: up ? 240 : 1900, f1: up ? 2300 : 210, tf: 0.7, q: 1.1, a: 0.07, vol: 0.5 });
      nz(brown, { t, dur: 0.6, type: 'lowpass', f0: up ? 120 : 420, f1: up ? 420 : 100, a: 0.08, vol: 0.4 });
    },
    chime(notes = [523.25, 659.25, 783.99, 1046.5, 1318.5], gap = 0.13) {
      if (!ctx) return; const t = T();
      notes.forEach((f, i) => bell(f, t + i * gap, 0.11, sfxWet));
    },
    ui() { if (!ctx) return; tn({ t: T(), dur: 0.05, f0: 880, a: 0.003, vol: 0.05 }); },
    thud() { sfx.land(0.85); },
    // ── small made things, one for each thing he can do, so that nothing happens in silence ──
    // coming down on a high place as the bird: the wings settle, and two notes a fifth apart say he has arrived
    perch() { if (!ctx) return; const t = T(); nz(pink, { t, dur: 0.28, f0: 700, f1: 240, q: 0.7, a: 0.02, vol: 0.14 }); bell(392, t + 0.05, 0.07, sfxWet); bell(587.33, t + 0.19, 0.06, sfxWet); },
    // a place with a name and a view: three notes going up, the last one held
    lookout() { if (!ctx) return; const t = T(); [440, 554.37, 659.25].forEach((f, i) => bell(f, t + i * 0.16, 0.085, sfxWet)); bell(880, t + 0.52, 0.05, sfxWet); },
    // under the water: the surface closing over, then his breath going up past his ears
    plunge() { if (!ctx) return; const t = T(); nz(brown, { t, dur: 0.9, type: 'lowpass', f0: 1400, f1: 180, a: 0.02, vol: 0.5 }); nz(pink, { t: t + 0.05, dur: 0.4, f0: 2200, f1: 500, q: 0.8, a: 0.01, vol: 0.12 }); },
    bubble(k = 1) { if (!ctx) return; const t = T(); for (let i = 0; i < 3; i++) { const f = rnd(380, 900); tn({ t: t + i * rnd(0.05, 0.11), dur: 0.07, f0: f, f1: f * 1.6, a: 0.004, vol: 0.05 * k, pan: rnd(-0.6, 0.6) }); } },
    // the map: a sheet shaken out, and laid away; and turned from flat to standing
    mapOpen() { if (!ctx) return; const t = T(); nz(pink, { t, dur: 0.32, f0: 900, f1: 3200, q: 0.6, a: 0.05, vol: 0.1 }); tn({ t: t + 0.24, dur: 0.09, f0: 660, f1: 990, a: 0.004, vol: 0.05 }); },
    mapClose() { if (!ctx) return; const t = T(); nz(pink, { t, dur: 0.26, f0: 3000, f1: 800, q: 0.6, a: 0.02, vol: 0.09 }); tn({ t: t + 0.12, dur: 0.08, f0: 880, f1: 520, a: 0.004, vol: 0.045 }); },
    mapFlip() { if (!ctx) return; const t = T(); tn({ t, dur: 0.06, f0: 740, a: 0.003, vol: 0.05 }); tn({ t: t + 0.07, dur: 0.1, f0: 1110, a: 0.003, vol: 0.05 }); },
    // the photo camera: the two blades of a shutter
    shutter() { if (!ctx) return; const t = T(); nz(pink, { t, dur: 0.035, type: 'highpass', f0: 2600, a: 0.001, vol: 0.3 }); nz(pink, { t: t + 0.085, dur: 0.05, type: 'highpass', f0: 1800, a: 0.001, vol: 0.24 }); tn({ t, dur: 0.05, f0: 180, f1: 90, a: 0.002, vol: 0.12 }); },
    // a god chosen: the ring of light settling over his head
    halo() { if (!ctx) return; const t = T(); [1046.5, 1318.5, 1568, 2093].forEach((f, i) => bell(f, t + i * 0.09, 0.06, sfxWet)); nz(pink, { t, dur: 1.1, type: 'highpass', f0: 6000, f1: 9000, q: 0.5, a: 0.3, vol: 0.035 }); },
    // a star falling: almost nothing
    meteor() { if (!ctx) return; tn({ t: T(), dur: 0.5, f0: 2600, f1: 1300, a: 0.05, vol: 0.02, pan: rnd(-0.7, 0.7) }); },
    // (for sounds placed in the world) falling water, a breath of it; and a fire spitting
    fallGrain(k = 1) { if (!ctx) return; const t = T(); nz(brown, { t, dur: 1.5, type: 'lowpass', f0: rnd(700, 1100), f1: rnd(500, 800), a: 0.5, vol: 0.5 * k }); nz(pink, { t, dur: 1.3, type: 'highpass', f0: rnd(2400, 3600), q: 0.5, a: 0.5, vol: 0.09 * k }); },
    crackle(k = 1) { if (!ctx) return; const t = T(); for (let i = 0, n = 2 + Math.floor(Math.random() * 4); i < n; i++) nz(pink, { t: t + Math.random() * 0.7, dur: rnd(0.012, 0.04), type: 'highpass', f0: rnd(1500, 4200), a: 0.001, vol: rnd(0.12, 0.3) * k }); nz(brown, { t, dur: 0.8, type: 'lowpass', f0: 320, a: 0.25, vol: 0.14 * k }); },
    // his heart, when the ground is coming up too fast: lub-dub, low, felt more than heard
    // steam: what a cloud says when something burning goes through it
    sizzle(k = 0.5) {
      if (!ctx) return; const t = T();
      nz(pink, { t, dur: rnd(0.22, 0.4), type: 'highpass', f0: rnd(3200, 4600), f1: rnd(6500, 8200), q: 0.7, a: 0.015, vol: 0.16 * k, pan: rnd(-0.5, 0.5) });
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
    },
    heart(k = 1) {
      if (!ctx) return; const t = T(), v = 0.35 + 0.4 * clamp(k);
      tn({ t, dur: 0.17, type: 'sine', f0: 64, f1: 38, a: 0.006, vol: v });
      tn({ t: t + 0.23, dur: 0.14, type: 'sine', f0: 58, f1: 36, a: 0.006, vol: v * 0.72 });
    },
    jump() { if (!ctx) return; if (!smp('jump', 0.55, rnd(0.95, 1.08), T())) sfx.step(); },
    grab(tree) { if (!ctx) return; smp('grab', tree ? 0.22 : 0.3, tree ? rnd(0.8, 0.9) : rnd(0.93, 1.07), T(), null, rnd(-0.3, 0.3)); },   // (no good bark takes came back: a rock grip, lower and softer, stands in)
    flyby(pan = 0) { if (!ctx) return; smp('whoosh', 0.9, rnd(0.9, 1.1), T(), null, pan); },
  };

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
      silenceUntil = ctx.currentTime + 5.5;
      tn({ t, dur: 2.9, type: 'triangle', f0: 196, f1: 41, a: 0.05, vol: 0.22, lp: 520, dest: stingBus });
      tn({ t, dur: 3.2, f0: 82, f1: 27, a: 0.05, vol: 0.5, dest: stingBus });
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

  // ───────── per-frame ─────────
  function update(dt, s = {}) {
    if (!ctx) return;
    dt = clamp(+dt || 0, 0, 0.25); clock += dt; tAcc += dt;
    const now = ctx.currentTime, st = s.state || 'play', form = s.form || 'human';
    const speed = Math.max(0, +s.speed || 0), vy = +s.vy || 0, flame = clamp(s.flame ?? 1), air = !s.grounded;
    const title = st === 'title', talk = st === 'talk', dead = st === 'dead' || st === 'end';
    const phoenix = form === 'phoenix', wings = form === 'wings';
    const flying = (phoenix || wings) && air && !title && !dead;
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

    if (tAcc < 0.03) return;
    tAcc = 0;
    // ── score levels
    if (omen && omen.on && omen.src) { P(omen.g.gain, title ? 0.7 : talk ? 0.6 : dead ? 0.8 : 1.25, 1.5); P(omen.f.frequency, s.sub > 0.5 ? 500 : 2400, 0.5); }
    if (song && song.on) {
      const end = st === 'end';
      P(song.g.gain, end ? 0 : (title ? 0.45 : talk ? 0.4 : dead ? 0.3 : realmUnder ? 0.5 : 0.62), end ? 2.5 : 1.2);
      P(song.f.frequency, s.sub > 0.5 ? 520 : realmUnder ? 2600 : dead ? 1400 : 20000, 0.5);   // muffled under water, darker below it
    }
    P(scoreGain.gain, silent || (song && song.on) || (omen && omen.on) ? 0 : presence, now < silenceUntil ? 0.25 : mode !== 'normal' ? 1.3 : presence > 0.5 ? 1.2 : 2.4);
    for (const k of Object.keys(lv)) P(L[k].gain, lv[k], 0.9);
    P(L.padF.frequency, realmUnder ? 380 + i * 520 : lonely ? 1100 : 620 + i * 2000 + Math.sin(clock * 0.21) * 120, 0.6);
    P(L.ostF.frequency, realmUnder ? 320 + i * 300 : 900 + i * 2400, 0.4);
    const ducked = now < duckUntil;
    P(duckM.gain, ducked ? 0.35 : 1, ducked ? 0.1 : 0.5);
    P(duckA.gain, (ducked ? 0.4 : 1) * (talk ? 0.45 : 1) * (dead ? 0.35 : 1), ducked ? 0.1 : 0.5);

    // ── air
    const airspeed = falling ? Math.max(speed, -vy) : speed, sp = clamp(airspeed / 160, 0, 1.8);
    const g1 = 0.5 + 0.5 * (Math.sin(clock * 0.37 + 1.3) * 0.5 + Math.sin(clock * 0.83 + 0.2) * 0.3 + Math.sin(clock * 1.71 + 4) * 0.2);
    const g2 = 0.5 + 0.5 * (Math.sin(clock * 0.29 + 4.1) * 0.5 + Math.sin(clock * 0.67 + 2.2) * 0.3 + Math.sin(clock * 1.43) * 0.2);
    const gust = clamp(+s.wind || 0), top = s.summit ? 1 : 0, hush = realmUnder ? 0.45 : 1;
    // (where a recording carries it, the generated layers stay underneath as body, not the sound itself)
    const kW = loops.windloop ? 0.5 : 1, kF = loops.fallloop ? 0.45 : 1, kX = loops.fireloop ? 0.55 : 1, kR = loops.rainloop ? 0.35 : 1, kA = loops.waterloop ? 0.5 : 1;
    P(W.low.g.gain, (0.05 + top * 0.13 + (title ? 0.07 : 0) + sp * 0.28 + gust * 0.15) * (0.55 + 0.45 * g1) * hush * kW, 0.25);
    P(W.low.f.frequency, 200 + sp * 260 + top * 60 + g1 * 60, 0.4);
    W.mid.forEach((m, k) => {
      const g = k ? g2 : g1;
      P(m.g.gain, (0.03 + top * 0.05 + sp * 0.34 + gust * 0.14) * (0.5 + 0.5 * g) * hush * kW, 0.25);
      P(m.f.frequency, 340 + k * 60 + sp * 720 + g * 130 - top * 60, 0.4);
    });
    P(W.high.g.gain, sp * sp * 0.12 * (0.6 + 0.4 * g2) * hush, 0.25);
    P(W.high.f.frequency, 1800 + sp * 900, 0.4);
    const dive = s.diving ? clamp((speed - 150) / 160) : 0;
    P(W.whistle.g.gain, dive * 0.42 * (0.6 + 0.4 * g1), 0.3);
    P(W.whistle.f.frequency, 900 + speed * 4 + g2 * 120, 0.3);
    P(W.rumble.g.gain, clamp((airspeed - 120) / 190) * 0.4, 0.4);
    const fl = falling ? clamp(-vy / 60) : 0;
    P(W.fall.g.gain, (falling ? 0.03 + fl * 0.2 : 0) * kF, 0.2);
    P(W.fall.f.frequency, 500 + fl * 1800, 0.3);
    // ── fire
    const fireOn = !title && !dead;
    P(W.fire.g.gain, (!fireOn ? 0 : s.burning ? 0.5 : phoenix ? 0.08 + flame * 0.1 + sp * 0.08 : wings && air ? 0.04 : 0) * kX, 0.3);
    P(W.fire.f.frequency, 380 + sp * 420 + (s.burning ? 500 : 0), 0.4);
    P(W.crackle.g.gain, !fireOn ? 0 : s.burning ? 0.5 : phoenix ? 0.1 + flame * 0.12 : wings ? 0.05 : 0, 0.3);
    // ── wings as a man
    const buf = wings && air && !dead;
    P(W.buffet.g.gain, buf ? 0.25 + sp * 0.5 : 0, 0.25);
    if (buf) { P(W.buffet.lfo.frequency, 7 + sp * 9 + g1 * 2, 0.3); P(W.buffet.f.frequency, 170 + sp * 160, 0.3); }
    // ── water
    // (skimming it, he hisses: fire on water; inside it, everything else goes dull)
    const wet = realmUnder || title ? 0 : clamp(+s.water || 0), wave = Math.pow(0.5 + 0.5 * Math.sin(clock * 0.9 + Math.sin(clock * 0.23) * 2), 2);
    const skim = title || dead ? 0 : clamp((+s.skim || 0) / 2), sub = clamp(+s.sub || 0);
    P(W.water.g.gain, Math.max(wet * (0.2 + 0.5 * wave) * kA, skim * 0.5, sub * 0.6), 0.3);
    P(W.water.f.frequency, sub > 0.5 ? 240 : 560 + wave * 380 + skim * 900, 0.4);
    P(W.foam.g.gain, wet * wave * 0.05 + skim * 0.16, 0.2);
    const rain = title || dead ? 0 : clamp(+s.rain || 0);   // a storm coming down on stone
    P(W.rain.g.gain, rain * (0.3 + 0.08 * g1) * kR, 0.4); P(W.rainLow.g.gain, rain * 0.22 * kR, 0.4);
    // ── the recorded beds: wind round him (harder, and higher, the faster he goes), the dive's roar, the rush of a fall,
    //    his fire, the storm's rain, water lapping nearby. Pitch rides speed so a recording never sounds like a recording.
    const muffle = sub > 0.5 ? 0.25 : 1;
    loopSet('windloop', dead ? 0 : (flying ? 0.16 + sp * 0.6 : top * 0.4 + gust * 0.3 + (title ? 0.2 : 0)) * (0.62 + 0.38 * g1) * hush * muffle, 0.84 + Math.min(sp, 1.4) * 0.26 + g2 * 0.04);
    loopSet('diveloop', dead ? 0 : dive * (0.75 + 0.35 * g2) * muffle, 0.88 + dive * 0.24);
    loopSet('fallloop', dead ? 0 : (falling ? 0.12 + fl * 1.0 : 0) * muffle, 0.9 + fl * 0.22);
    loopSet('fireloop', !fireOn ? 0 : s.burning ? 0.95 : phoenix ? (0.16 + flame * 0.24 + sp * 0.14) * muffle : wings && air ? 0.1 : 0, 0.94 + Math.min(sp, 1.2) * 0.12);
    loopSet('rainloop', rain * 0.95);
    loopSet('waterloop', wet * (0.5 + 0.5 * wave) * (sub > 0.5 ? 0 : 1));
    if (subF) P(subF.frequency, sub > 0.5 ? 620 : 20000, sub > 0.5 ? 0.12 : 0.35);
    // ── the Underworld
    if (realmUnder && !under) buildUnder();
    if (under) { P(under.g.gain, realmUnder && !dead ? 0.55 : 0, 1.2); P(under.f.frequency, 130 + sp * 90 + g1 * 30, 0.8); }
  }

  function resume() { if (ctx && ctx.state !== 'running' && ctx.resume) { try { const p = ctx.resume(); if (p && p.catch) p.catch(() => {}); } catch {} } }
  const api = {
    init() {
      if (ctx) { resume(); return api; }
      const Ctor = globalThis.AudioContext || globalThis.webkitAudioContext;
      if (!Ctor) return api;
      try { ctx = new Ctor({ latencyHint: 'interactive' }); } catch { try { ctx = new Ctor(); } catch { ctx = null; return api; } }
      try { build(); } catch (e) { console.warn('audio: could not build', e); ctx = null; return api; }
      resume(); loadSamples();
      return api;
    },
    resume,
    get ctx() { return ctx; },
    get voiceBus() { return voiceBus || null; },
    get muted() { return muted; },
    setMuted(b) { muted = !!b; if (ctx) muteGain.gain.setTargetAtTime(muted ? 0 : 1, ctx.currentTime, 0.05); },
    setQuality(q) {
      const next = q === 'low' ? 'low' : 'high'; if (next === quality) return; quality = next;
      if (ctx && reverb) { try { reverb.buffer = makeIR(); } catch {} }
    },
    duck(seconds = 1) { if (ctx) duckUntil = Math.max(duckUntil, ctx.currentTime + Math.max(0, seconds)); },
    // play any of the sounds above as if from somewhere else: quieter, and from one side (another player's wings, say)
    at(vol, pan, fn) {
      if (!ctx || vol <= 0.01) return;
      const g = gain(Math.min(1, vol)), pn = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
      if (pn) { pn.pan.value = Math.max(-1, Math.min(1, pan || 0)); chain(g, pn, sfxBus); } else g.connect(sfxBus);
      const real = sfxBus; sfxBus = g;
      try { fn(); } finally { sfxBus = real; }
      setTimeout(() => { try { g.disconnect(); pn && pn.disconnect(); } catch {} }, 6000);
    },
    // The ears. Where the listener is and which way they face (the lens): anything played with at3 is then heard from
    // where it is in the world — behind, above, coming up on the left — and fades with distance.
    listen(px, py, pz, fx, fy, fz) {
      if (!ctx) return; const L = ctx.listener, t = ctx.currentTime;
      if (L.positionX) { L.positionX.setTargetAtTime(px, t, 0.04); L.positionY.setTargetAtTime(py, t, 0.04); L.positionZ.setTargetAtTime(pz, t, 0.04);
        L.forwardX.setTargetAtTime(fx, t, 0.04); L.forwardY.setTargetAtTime(fy, t, 0.04); L.forwardZ.setTargetAtTime(fz, t, 0.04); L.upX.value = 0; L.upY.value = 1; L.upZ.value = 0; }
      else { try { L.setPosition(px, py, pz); L.setOrientation(fx, fy, fz, 0, 1, 0); } catch {} }
    },
    at3(x, y, z, fn, o = {}) {
      if (!ctx || live > cap()) return;
      const g = gain(Math.min(1.5, o.vol ?? 1)), pn = ctx.createPanner();
      pn.panningModel = quality === 'low' ? 'equalpower' : 'HRTF'; pn.distanceModel = 'inverse'; pn.refDistance = o.ref ?? 12; pn.maxDistance = o.max ?? 600; pn.rolloffFactor = o.roll ?? 1.1;
      if (pn.positionX) { pn.positionX.value = x; pn.positionY.value = y; pn.positionZ.value = z; } else pn.setPosition(x, y, z);
      chain(g, pn, sfxBus); const real = sfxBus; sfxBus = g;
      try { fn(); } finally { sfxBus = real; }
      setTimeout(() => { try { g.disconnect(); pn.disconnect(); } catch {} }, o.life ?? 6000);
    },
    update, sfx, sting, song: songStart, songPrep, songStop, omen: omenStart, omenStop, get songOn() { return !!(song && song.on); },
    get songTime() { return song && song.on && !song.el.paused && song.el.readyState >= 2 ? song.el.currentTime : -1; },   // (where the song really is, for whatever has to land on a word) get reverbIn() { return revIn; },
    stats: () => ({ live, made, intensity, mode, step: stepN, samples: Object.keys(samples) }),
  };
  return api;
}
