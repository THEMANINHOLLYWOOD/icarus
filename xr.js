// Reading the body on Apple Vision Pro (and any WebXR headset that tracks hands). Every frame it is given the head and
// the 25 joints of each hand, and it answers with what the player is doing: steering, boosting, and the moves.
// It knows nothing about the game, so it can be tested with made-up hands (tools/xrtest.mjs).
//
// THE MOVES (the same in every headset; the game decides what each one does where he is):
//   wings   both arms out wide, hands open — glide. Tip them like a wing to bank (left hand high turns right);
//           raise both to climb, lower both to dive.
//   flap    from wings, both hands swept down hard — a wingbeat: a burst of speed. Keep flapping to keep it.
//   stoop   hands together, reaching forward, below the eyes — the falcon's dive.
//   clap    bring the palms together fast — fire: jump, burn, take wing, whatever the moment is for.
//   fold    both fists, held — fold the wings and drop as a man.
//   spread  falling as a man, throw both arms out — catch fire and fly.
//   leap    on the ground, both hands thrown upward — jump (at the edge of the mountain: the leap).
//   point   on the ground, point with one finger — walk where you point; point with both — run.
//   offer   one open palm turned up, held still — speak to a god, kindle a fire, greet an animal.
//   push    both palms shoved out in front — stop: leave a conversation, or come in to land.
//   pinch   (look at something and pinch: the headset's own tap) — the same as clap.

const FINGERS = ['index', 'middle', 'ring', 'pinky'];

const sub = (a, b) => [a.x - b.x, a.y - b.y, a.z - b.z];
const len = v => Math.hypot(v[0], v[1], v[2]);
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const dz = (v, d, r) => (Math.abs(v) < d ? 0 : clamp((v - Math.sign(v) * d) / r, -1, 1));

export function makeHands() {
  const H = {
    L: { prev: null, v: [0, 0, 0], hist: [], hold: {} }, R: { prev: null, v: [0, 0, 0], hist: [], hold: {} },
    cool: {}, sepPrev: null, sepV: 0, boostT: 0, foldHeld: 0, folded: false, spreadHeld: 0, spreadFired: false, offerHeld: 0, t: 0,
  };
  // one hand, in the head's frame: x to the right, y up, z straight ahead (metres, from between the eyes)
  function readHand(side, joints, head, dt) {
    const S = H[side];
    const need = ['wrist', 'middle-finger-phalanx-proximal', 'index-finger-phalanx-proximal', 'pinky-finger-phalanx-proximal'];
    if (!joints || need.some(n => !joints[n])) { S.prev = null; S.hist.length = 0; return null; }
    const toLocal = p => { const d = [p.x - head.x, p.y - head.y, p.z - head.z]; return { x: d[0] * head.rx + d[2] * head.rz, y: d[1], z: d[0] * head.fx + d[2] * head.fz }; };
    const dirLocal = v => ({ x: v[0] * head.rx + v[2] * head.rz, y: v[1], z: v[0] * head.fx + v[2] * head.fz });
    const w = joints.wrist, k = joints['middle-finger-phalanx-proximal'];
    const palmW = { x: (w.x + k.x) / 2, y: (w.y + k.y) / 2, z: (w.z + k.z) / 2 };
    const palm = toLocal(palmW);
    // which way the palm faces (computed in the room's own right-handed frame, then turned into the head's)
    const a = sub(joints['index-finger-phalanx-proximal'], w), b = sub(joints['pinky-finger-phalanx-proximal'], w);
    const c = side === 'R' ? cross(a, b) : cross(b, a), cl = len(c) || 1;
    const n = dirLocal([c[0] / cl, c[1] / cl, c[2] / cl]);
    // how straight each finger is: 1 laid out flat, about 0.4 in a fist
    const straight = {};
    for (const f of FINGERS) {
      const pr = joints[`${f}-finger-phalanx-proximal`], it = joints[`${f}-finger-phalanx-intermediate`], di = joints[`${f}-finger-phalanx-distal`], tp = joints[`${f}-finger-tip`];
      straight[f] = pr && it && di && tp ? dist(tp, pr) / ((dist(it, pr) + dist(di, it) + dist(tp, di)) || 1) : 0.7;
    }
    const ext = f => straight[f] > 0.86, curled = f => straight[f] < 0.68;
    const open = FINGERS.every(ext), fist = FINGERS.every(curled);
    const point = ext('index') && curled('middle') && curled('ring') && curled('pinky');
    let aim = null;
    if (point && joints['index-finger-tip']) { const v = sub(joints['index-finger-tip'], joints['index-finger-phalanx-proximal']), l = len(v) || 1; aim = dirLocal([v[0] / l, v[1] / l, v[2] / l]); }
    const pinch = joints['thumb-tip'] && joints['index-finger-tip'] ? dist(joints['thumb-tip'], joints['index-finger-tip']) < 0.02 : false;
    // how fast the palm is moving (smoothed), and where it was over the last third of a second
    if (S.prev && dt > 0) {
      const iv = [(palm.x - S.prev.x) / dt, (palm.y - S.prev.y) / dt, (palm.z - S.prev.z) / dt], k2 = Math.min(1, dt * 18);
      for (let i = 0; i < 3; i++) S.v[i] += (clamp(iv[i], -8, 8) - S.v[i]) * k2;
    } else S.v = [0, 0, 0];
    S.prev = palm;
    S.hist.push([H.t, palm.y, palm.z]); while (S.hist.length && H.t - S.hist[0][0] > 0.33) S.hist.shift();
    const dy = S.hist.length ? palm.y - Math.min(...S.hist.map(h => h[1])) : 0, dropY = S.hist.length ? Math.max(...S.hist.map(h => h[1])) - palm.y : 0;
    return { palm, palmW, n, straight, open, fist, point, aim, pinch, v: S.v, rise: dy, drop: dropY };
  }
  const ready = (name, t) => (H.cool[name] || 0) <= H.t ? ((H.cool[name] = H.t + t), true) : false;

  // head: { x, y, z, yaw } in the room's frame (yaw 0 looks down -z); L, R: joint name → {x,y,z} or null
  // ctx: { form: 'phoenix' | 'human', grounded, falling }
  function update(dt, head, L, R, ctx = {}) {
    H.t += dt;
    const hd = { ...head, rx: Math.cos(head.yaw), rz: -Math.sin(head.yaw), fx: -Math.sin(head.yaw), fz: -Math.cos(head.yaw) };
    const l = readHand('L', L, hd, dt), r = readHand('R', R, hd, dt);
    const out = { axes: [0, 0], boost: false, run: false, pose: '', events: [], hands: { l, r } };
    const both = l && r;
    const air = ctx.form === 'phoenix';
    // the distance between the palms, and how fast it is closing
    const sep = both ? Math.hypot(l.palm.x - r.palm.x, l.palm.y - r.palm.y, l.palm.z - r.palm.z) : null;
    if (sep !== null && H.sepPrev !== null && dt > 0) H.sepV += ((sep - H.sepPrev) / dt - H.sepV) * Math.min(1, dt * 20); else H.sepV = 0;
    H.sepPrev = sep;

    if (both) {
      const wide = Math.abs(r.palm.x - l.palm.x) > 0.72 && l.palm.x < -0.25 && r.palm.x > 0.25;
      // clap: palms meeting, fast
      if (sep < 0.11 && H.sepV < -1.1 && ready('clap', 0.9)) out.events.push('clap');
      // wings: arms out wide, hands open
      if (wide && l.open && r.open) {
        out.pose = 'wings';
        const bank = Math.atan2(l.palm.y - r.palm.y, r.palm.x - l.palm.x);   // left hand high → positive → bank right
        const h = (l.palm.y + r.palm.y) / 2 + 0.24;                            // against the shoulders, about a hand below the eyes
        out.axes = [dz(bank, 0.07, 0.42), h > 0 ? -dz(h, 0.05, 0.22) : dz(-h, 0.06, 0.3)];
        // flap: both swept down, hard, together
        if (l.v[1] < -1.0 && r.v[1] < -1.0 && l.drop > 0.12 && r.drop > 0.12 && ready('flap', 0.28)) { out.events.push('flap'); H.boostT = 0.9; }
        // falling as a man and throwing the arms out: catch fire
        if (!air && !ctx.grounded) { if ((H.spreadHeld += dt) > 0.25 && !H.spreadFired) { H.spreadFired = true; out.events.push('spread'); } }
      } else { H.spreadHeld = 0; H.spreadFired = false; }
      // stoop: hands together, reaching forward and down
      if (!out.pose && l.open && r.open && sep < 0.3 && l.palm.z > 0.36 && r.palm.z > 0.36 && (l.palm.y + r.palm.y) / 2 < -0.05) {
        out.pose = 'stoop'; out.axes = [dz((l.palm.x + r.palm.x) / 2, 0.06, 0.25), 1]; out.boost = true;
      }
      // fold: both fists, held
      if (l.fist && r.fist) { if ((H.foldHeld += dt) > 0.45 && !H.folded) { H.folded = true; out.events.push('fold'); } out.pose ||= 'fists'; }
      else { H.foldHeld = 0; H.folded = false; }
      // leap: both hands thrown up
      if (l.v[1] > 1.3 && r.v[1] > 1.3 && l.rise > 0.15 && r.rise > 0.15 && ready('leap', 1)) out.events.push('leap');
      // push: both palms facing ahead, shoved out
      if (l.n.z > 0.6 && r.n.z > 0.6 && l.v[2] > 1.1 && r.v[2] > 1.1 && ready('push', 1)) out.events.push('push');
    } else { H.spreadHeld = 0; H.spreadFired = false; H.foldHeld = 0; H.folded = false; }

    // offer: one palm up, open, still, in front
    const up = [l, r].find(h => h && h.open && h.n.y > 0.72 && h.palm.z > 0.15 && Math.hypot(...h.v) < 0.35);
    if (up && out.pose !== 'wings') { if ((H.offerHeld += dt) > 0.6) { H.offerHeld = -1.4; out.events.push('offer'); } out.pose ||= 'offer'; }
    else if (H.offerHeld > 0) H.offerHeld = 0; else H.offerHeld = Math.min(0, H.offerHeld + dt);

    // point: walk where the finger points (on the ground, not in the air)
    if (!air && !out.pose) {
      const pts = [r, l].filter(h => h && h.point && h.aim);
      if (pts.length) {
        const a = pts[0].aim, hl = Math.hypot(a.x, a.z);
        if (hl > 0.35) { out.axes = [a.x / hl, a.z / hl]; out.pose = 'point'; out.run = pts.length > 1; }
      }
    }
    if ((H.boostT -= dt) > 0) out.boost = true;
    return out;
  }
  return { update, state: H };
}

// A hand, laid out in the room for tests: the palm at `at`, facing `facing` ('down' | 'up' | 'ahead' | 'in'), fingers
// pointing `toward` (unit [x,y,z] in the room), in a given shape ('open' | 'fist' | 'point'). Head at the origin looking down -z.
export function fakeHand(side, at, { shape = 'open', facing = 'down', toward = [0, 0, -1] } = {}) {
  const f = toward, nrm = { down: [0, -1, 0], up: [0, 1, 0], ahead: [0, 0, -1], in: side === 'R' ? [-1, 0, 0] : [1, 0, 0] }[facing];
  // across the palm, from the index side to the pinky side: for the right hand that is cross(fingers, normal)… solved so
  // that the game's normal rule (right: cross(index−wrist, pinky−wrist)) comes back as `nrm`
  let across = cross(f, nrm); if (side === 'L') across = across.map(x => -x);
  const al = len(across) || 1; across = across.map(x => x / al);
  const P = (u, s, h = 0) => ({ x: at[0] + f[0] * u + across[0] * s + nrm[0] * h, y: at[1] + f[1] * u + across[1] * s + nrm[1] * h, z: at[2] + f[2] * u + across[2] * s + nrm[2] * h });
  const j = { wrist: P(-0.05, 0) };
  const offs = { index: -0.03, middle: -0.01, ring: 0.01, pinky: 0.03 };
  for (const g of FINGERS) {
    const s = -offs[g];   // index on the thumb's side of the palm
    j[`${g}-finger-metacarpal`] = P(-0.04, s * 0.6);
    j[`${g}-finger-phalanx-proximal`] = P(0.05, s);
    const curl = shape === 'fist' || (shape === 'point' && g !== 'index');
    if (curl) {   // folded back under the palm
      j[`${g}-finger-phalanx-intermediate`] = P(0.085, s, 0.015);
      j[`${g}-finger-phalanx-distal`] = P(0.07, s, 0.045);
      j[`${g}-finger-tip`] = P(0.045, s, 0.05);
    } else {
      j[`${g}-finger-phalanx-intermediate`] = P(0.095, s);
      j[`${g}-finger-phalanx-distal`] = P(0.12, s);
      j[`${g}-finger-tip`] = P(0.14, s);
    }
  }
  j['thumb-tip'] = P(0.03, -0.06, 0.02);
  return j;
}
