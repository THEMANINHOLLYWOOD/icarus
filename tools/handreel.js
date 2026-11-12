// The hand-tracking reel for the X thread: the game's mirror (your webcam moves his arms, hands, fingers and head) driven by a
// scripted performance instead of a camera, since a recorder has no one in front of it. Every frame feeds cam.arm / cam.hand /
// cam.head exactly what MediaPipe would have, and logs it, so tools/handinset.py can draw the matching tracked skeleton.
// Use: node tools/cap.mjs; load the game at 1920x818 with ?mute; await import('/tools/handreel.js?' + Date.now());
//      await HR.rec('H', 24)   → <pre>00000.jpg… and <pre>log.json. Not deployed.
await import('/tools/reel7.js?' + Date.now());
const I = window.__icarus, p = I.player, V = p.pos.constructor, C = I.cam, R = window.REEL;
const HR = window.HR = {};
// body frame (his own): -x his left, +x his right, -z ahead of him, +y up
const v = (x, y, z) => new V(x, y, z).normalize();
const ease = u => u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u), lerp = (a, b, k) => a + (b - a) * k;
const mix = (a, b, k) => new V(lerp(a.x, b.x, k), lerp(a.y, b.y, k), lerp(a.z, b.z, k)).normalize();
const OPEN = [0, 0, 0, 0, 0], RELAX = [0.25, 0.2, 0.25, 0.3, 0.35], FIST = [0.9, 1, 1, 1, 1];
const COUNT = [[1, 0, 1, 1, 1], [1, 0, 0, 1, 1], [1, 0, 0, 0, 1], [1, 0, 0, 0, 0], [0, 0, 0, 0, 0]];
const PEACE = [1, 0, 0, 1, 1], HORNS = [0.9, 0, 1, 1, 0], THUMB = [0, 1, 1, 1, 1], POINT = [0.9, 0, 1, 1, 1];
// a pose for one side: upper arm, forearm, the hand's finger direction and across-the-knuckles direction, and the curls
const P = (up, fo, fd, ac, curl) => ({ up: v(...up), fo: v(...fo), fd: v(...fd), ac: v(...ac), curl });
const rest = s => P([0.16 * s, -1, 0.02], [0.08 * s, -1, -0.12], [0.05 * s, -1, -0.1], [0, 0, -1], RELAX);
// the performance: [t0, t1, (u, t) => ({ L, R, head })] — each pose eases in from whatever came before over `blend` seconds
function score(t) {
  const s = (a, b) => ease((t - a) / (b - a));
  const R0 = rest(1), L0 = rest(-1);
  const waveUp = P([0.85, 0.2, -0.25], [0.15, 1, -0.15], [0.15, 1, -0.1], [-1, 0, 0], OPEN);
  const out = { L: L0, R: R0, head: { yaw: 0, pitch: 0 } };
  // 1. hello: the right hand comes up and waves (0.6 .. 3.6)
  if (t < 3.8) {
    const k = s(0.5, 1.2) * (1 - s(3.4, 3.8)), w = Math.sin((t - 1.2) * 9.5) * s(1.1, 1.4);
    const fo = new V(0.15 + w * 0.55, 1, -0.15).normalize();
    out.R = blend(R0, { ...waveUp, fo, fd: fo }, k); out.head = { yaw: -0.18 * k, pitch: 0.05 * k };
    return out;
  }
  // 2. counting, the right hand up in front of him, palm out: one, two, three, four, five (3.8 .. 8.4)
  if (t < 8.6) {
    const hold = P([0.42, -0.45, -0.78], [-0.05, 1, -0.35], [-0.05, 1, -0.3], [-1, 0, 0], COUNT[0]);
    const i = Math.min(4, Math.max(0, Math.floor((t - 4.3) / 0.8))), f = (t - 4.3) / 0.8 - i;
    const prev = COUNT[Math.max(0, i - 1)], cur = COUNT[i], c = cur.map((x, j) => lerp(prev[j], x, t < 4.3 ? 1 : ease(f * 3)));
    const k = s(3.8, 4.3) * (1 - s(8.2, 8.6));
    out.R = blend(R0, { ...hold, curl: c }, k); out.head = { yaw: -0.25 * k, pitch: -0.1 * k };
    return out;
  }
  // 3. peace with the left, the horns with the right, then two thumbs up (8.6 .. 12.2)
  if (t < 12.4) {
    const k = s(8.6, 9.1) * (1 - s(12.0, 12.4)), th = s(10.5, 10.9);
    const Lh = P([-0.55, -0.35, -0.75], [0.1, 1, -0.3], [0.1, 1, -0.25], [1, 0, 0], PEACE);
    const Rh = P([0.55, -0.35, -0.75], [-0.1, 1, -0.3], [-0.1, 1, -0.25], [-1, 0, 0], HORNS);
    const Lt = P([-0.35, -0.6, -0.72], [0.05, 0.05, -1], [0.05, 0, -1], [0, 1, 0], THUMB);
    const Rt = P([0.35, -0.6, -0.72], [-0.05, 0.05, -1], [-0.05, 0, -1], [0, 1, 0], THUMB);
    out.L = blend(L0, blend(Lh, Lt, th), k); out.R = blend(R0, blend(Rh, Rt, th), k); out.head = { yaw: 0, pitch: 0.08 * k };
    return out;
  }
  // 4. arms out like wings, and three slow beats (12.4 .. 17.0)
  if (t < 17.2) {
    const k = s(12.4, 13.2) * (1 - s(16.6, 17.2)), b = Math.sin((t - 13.2) * 3.1) * s(13.0, 13.6) * 0.35;
    const wing = sd => P([1.0 * sd, 0.05 + b, 0.05], [1 * sd, 0.12 + b * 1.3, 0.12], [1 * sd, 0.1 + b * 1.3, 0.15], [0, 0, -1], OPEN);
    out.L = blend(L0, wing(-1), k); out.R = blend(R0, wing(1), k); out.head = { yaw: 0, pitch: 0.18 * k };
    return out;
  }
  // 5. he points straight at you (17.2 .. 19.8)
  if (t < 20.0) {
    const k = s(17.2, 17.8) * (1 - s(19.6, 20.0));
    out.R = blend(R0, P([0.18, 0.05, -1], [0.05, 0.06, -1], [0.04, 0.05, -1], [-1, 0.1, 0], POINT), k); out.head = { yaw: 0, pitch: 0.02 };
    return out;
  }
  // 6. both fists up, then down again to where it began (20.0 .. 24)
  const k = s(20.0, 20.7) * (1 - s(22.6, 23.4));
  out.L = blend(L0, P([-0.4, 0.9, -0.1], [-0.08, 1, -0.05], [-0.05, 1, 0], [1, 0, 0], FIST), k);
  out.R = blend(R0, P([0.4, 0.9, -0.1], [0.08, 1, -0.05], [0.05, 1, 0], [-1, 0, 0], FIST), k);
  out.head = { yaw: 0, pitch: 0.3 * k };
  return out;
}
function blend(a, b, k) { return { up: mix(a.up, b.up, k), fo: mix(a.fo, b.fo, k), fd: mix(a.fd, b.fd, k), ac: mix(a.ac, b.ac, k), curl: a.curl.map((x, j) => lerp(x, b.curl[j], k)) }; }
// the lenses: [until t, (t) => [pos, look, fov]] in his frame (f = ahead, r = his right)
let F = null;
function frameOf() { const y = I.human.group.rotation.y; return { fx: -Math.sin(y), fz: -Math.cos(y) }; }   // (his face is this way)
const _h = new V(); function hand(s) { return (s === 'L' ? I.human.handL : I.human.handR).getWorldPosition(_h).clone(); }
function at(a, r, up) { const { fx, fz } = F; return new V(p.pos.x + fx * a - fz * r, p.pos.y + up, p.pos.z + fz * a + fx * r); }
function lens(t) {
  const u = (a, b) => ease((t - a) / (b - a));
  if (t < 3.8) return [at(lerp(4.2, 3.4, u(0, 3.8)), 0.7, 1.45), at(0, 0, 1.45), 38];                    // medium, a little to his right
  if (t < 8.6) { const h = hand('R'); return [new V(h.x + F.fx * 1.15 - F.fz * 0.25, h.y + 0.05, h.z + F.fz * 1.15 + F.fx * 0.25), h, 34]; }   // close on the counting hand
  if (t < 12.4) return [at(lerp(2.6, 2.3, u(8.6, 12.4)), 0.2, 1.55), at(0.2, 0, 1.55), 40];               // both hands
  if (t < 17.2) return [at(lerp(2.9, 3.4, u(12.4, 17.2)), 1.0, 0.8), at(0, 0, 1.45), 54];               // low: the wings
  if (t < 20.0) return [at(lerp(2.4, 1.8, u(17.2, 20)), -0.35, 1.35), at(0.3, 0.1, 1.5), 42];             // he points at the lens
  return [at(lerp(4.2, 4.8, u(20, 24)), 1.1, 0.9), at(0, 0, 1.7), 42];                                    // low, looking up at the fists
}
HR.setup = () => {
  I.setLetters(true); I.setDay(+(new URLSearchParams(location.search).get('day') || 0.3)); I.setStorm(0); R.quiet();
  R.setCell(...(HR.cell || [6, 10]));
  // at the lip of the summit, his back to the drop, so behind him there is nothing but sky and the sea of cloud
  const ax = I.MOUNT.x - I.EDGE.x, az = I.MOUNT.z - I.EDGE.z, al = Math.hypot(ax, az) || 1, back = HR.back ?? 7;
  p.pos.set(I.EDGE.x + ax / al * back, 0, I.EDGE.z + az / al * back); p.pos.y = I.groundAt(p.pos.x, p.pos.z, 1e5); p.vel.set(0, 0, 0);
  p.yaw = Math.atan2(-ax / al, -az / al); I.human.group.rotation.y = p.yaw;
  F = frameOf(); C.on = true; C.k = 1;
};
HR.apply = t => {
  const o = score(t);
  for (const s of ['L', 'R']) { const q = o[s]; C.arm[s] = { up: q.up.clone(), fo: q.fo.clone() }; C.hand[s] = { curl: q.curl.slice(), fd: q.fd.clone(), ac: q.ac.clone() }; }
  C.head = o.head; C.seen = performance.now();
  I.setStorm(0); I.flash = 0; if (I.WX) { I.WX.thunder = 0; I.WX.rain = 0; I.WX.storm = 0; }   // (the story's first night is a thunderstorm: not here)
  const [pos, look, fov] = lens(t); R.lens(pos, look, fov);
  R.log.push(['p', +t.toFixed(4), Object.fromEntries(['L', 'R'].map(s => [s, { up: o[s].up.toArray().map(n => +n.toFixed(3)), fo: o[s].fo.toArray().map(n => +n.toFixed(3)), fd: o[s].fd.toArray().map(n => +n.toFixed(3)), ac: o[s].ac.toArray().map(n => +n.toFixed(3)), curl: o[s].curl.map(n => +n.toFixed(3)) }])), o.head]);
};
HR.look = async (t, name) => {   // one frame at time t, for setting up
  HR.setup(); for (let i = 0; i < 40; i++) { HR.apply(Math.max(0, t - (40 - i) / 60)); I.step(1); }
  const url = R.peek(960), bin = atob(url.split(',')[1]), u8 = Uint8Array.from(bin, c => c.charCodeAt(0));
  await fetch('http://127.0.0.1:8124/f/' + name + '.jpg', { method: 'POST', body: u8 });
};
HR.rec = async (pre, secs = 24) => {
  HR.setup(); for (let i = 0; i < 60; i++) { HR.apply(0); I.step(1); }
  await R.rec(pre, secs, t => HR.apply(t));
  return R.err;
};
