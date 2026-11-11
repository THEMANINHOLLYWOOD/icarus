// "The leap", shot like a film: a director moves the lens through eight shots while the game plays itself, lightning is called
// on the big beats, and every strike's time and distance is logged so the soundtrack can be given real thunder afterwards.
// Use: `node tools/cap.mjs`, load the game fresh (do not begin it), then: await import('/tools/rec2.js?secs=44&' + Date.now())
// Progress in window.REC. Not deployed.
const Q = new URLSearchParams(import.meta.url.split('?')[1] || '');
const FPS = 60, SECS = +(Q.get('secs') || 44), CAP = 'http://127.0.0.1:8124/f/';
const I = window.__icarus, p = I.player, cv = document.getElementById('c'), D = I.dbgCam, V = I.camera.position.constructor;
window.requestAnimationFrame = () => 0;
const R = window.REC = { frame: 0, total: FPS * SECS, done: false, audio: false, err: null, log: [], strikes: [], shots: [] };

let off = null;
const OAC = window.OfflineAudioContext;
window.AudioContext = window.webkitAudioContext = function () { off = new OAC({ numberOfChannels: 2, length: 48000 * SECS, sampleRate: 48000 }); return off; };

const ni = document.getElementById('nameInput'); ni.value = Q.get('name') || 'ANDRES';
ni.dispatchEvent(new Event('input', { bubbles: true }));   // (that is what puts the name on him)
ni.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true }));
I.step(3);
if (I.state === 'prologue') I.endPrologue(true);   // no save on this origin: skip the opening, we are filming the summit
await new Promise(r => setTimeout(r, 2500));
for (let i = 0; i < 1200 && I.state !== 'play'; i++) I.step(1);   // wait until he is on his feet

// the first night, a little way back from the lip of the mountain
I.story.phase = 'summit'; I.flags.firstNight = true; I.flags.dawn = 0; I.flags.morphed = false; I.setDay(0.93); I.setStorm(1);
I.dlg.queue.length = 0; I.dlg.cur = null;
const ax = I.MOUNT.x - I.EDGE.x, az = I.MOUNT.z - I.EDGE.z, al = Math.hypot(ax, az) || 1;
p.form = 'human'; p.cine = null; p.wings = false; p.grounded = true; p.flame = 1; p.burnout = false; p.sub = null;
p.pos.set(I.EDGE.x + ax / al * 24, 0, I.EDGE.z + az / al * 24); p.pos.y = I.groundAt(p.pos.x, p.pos.z, 1e5); p.vel.set(0, 0, 0); p.fallTop = p.pos.y;
for (let i = 0; i < 360; i++) { I.setStorm(1); I.dlg.queue.length = 0; I.dlg.cur = null; I.step(1); }
let T0 = 0;   // the clip's own clock
D.onStrike = (x, y, z, big) => { const c = I.camera.position; R.strikes.push({ t: R.frame / FPS, d: Math.round(Math.hypot(x - c.x, y - c.y, z - c.z)), big: +big.toFixed(2) }); };

// a soft light that rides in front of his face, for the close-up (the same three.js the game loaded)
const THREE = await import('three');
const fill = new THREE.PointLight(0xffe2c8, 0, 4, 2); fill.position.set(0.45, 2.05, -1.1); I.human.group.add(fill);
const held = {};
const key = (code, down) => { if (!!held[code] === down) return; held[code] = down; window.dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', { key: code.slice(3).toLowerCase(), code, bubbles: true })); };
let tEdge = -1, tJump = -1, tPhx = -1, tCloud = -1;
const bolts = new Set();
function bolt(id, t, at, dx, dz, big = 1) {   // lightning, once, on a beat: dx, dz from him in his own frame (dx right, dz ahead)
  if (bolts.has(id) || t < at) return; bolts.add(id);
  const y = I.human.group.rotation.y, fx = -Math.sin(y), fz = -Math.cos(y), rx = -fz, rz = fx;
  const x = p.pos.x + rx * dx + fx * dz, z = p.pos.z + rz * dx + fz * dz;
  I.strike(x, Math.max(I.groundAt(x, z, 1e5), -38), z, big);
}
// ── the player
function control(t) {
  I.cinema.idle = 0;
  if (p.form === 'human' && tJump < 0) {
    if (t < 0.9) return;
    if (I.story.phase === 'summit') key('KeyW', true);
    else {
      key('KeyW', false);
      if (tEdge < 0) { tEdge = t; R.log.push(['edge', t]); }
      if (t - tEdge > 4.3) { I.pressSpace(); tJump = t; R.log.push(['jump', t]); }
    }
  }
  if (tPhx < 0 && p.form === 'phoenix' && !p.cine) { tPhx = t; R.log.push(['phoenix', t]); }
  if (tPhx >= 0) {
    const u = t - tPhx, fx = -Math.sin(p.yaw), fz = -Math.cos(p.yaw);
    const under = Math.max(I.groundAt(p.pos.x, p.pos.z, -1e5), I.groundAt(p.pos.x + fx * 350, p.pos.z + fz * 350, -1e5), I.groundAt(p.pos.x + fx * 700, p.pos.z + fz * 700, -1e5));
    const clear = p.pos.y - under;
    key('KeyS', u > 1.0 && u < 9 && p.pos.y > I.CLOUD_SEA - 260 && clear > 520);
    if (u >= 9 && !held.KeyS && clear > 160) p.pitch = Math.min(p.pitch, -0.3);
    key('KeyA', u > 19 && u < 20.6);
    p.flame = 1;
    if (tCloud < 0 && p.pos.y < I.CLOUD_SEA + 230) { tCloud = t; R.log.push(['cloud', t]); }
  }
  // lightning on the beats
  if (tEdge < 0) { bolt('a', t, 0.5, 26, 34, 1); bolt('b', t, 2.3, -40, 60, 0.8); }
  if (tEdge >= 0) { bolt('c', t, tEdge + 2.6, 30, -55, 1); }
  if (tJump >= 0) { bolt('d', t, tJump + 0.05, -22, 18, 1); }
  if (tPhx >= 0) { bolt('e', t, tPhx + 0.8, 60, 40, 1); bolt('f', t, tPhx + 2.2, -80, 120, 0.9); bolt('g', t, tPhx + 3.4, 50, 160, 1); }
}
// ── the director
const ease = u => u * u * (3 - 2 * u), lerp = (a, b, k) => a + (b - a) * k;
const P = new V(), Lk = new V(), tmp = new V();
let shot = '', s0 = 0, A = null;
function cut(name, t) { if (shot !== name) { shot = name; s0 = t; A = null; R.shots.push([name, +t.toFixed(2)]); } }
function direct(t) {
  const y = I.human.group.rotation.y, fx = -Math.sin(y), fz = -Math.cos(y), rx = -fz, rz = fx;   // his ahead and his right, on foot
  const bx = -Math.sin(p.yaw), bz = -Math.cos(p.yaw);   // the bird's heading
  D.on = true; D.fog = 0;
  if (tJump < 0 && tEdge < 0 || t < 3.0) {
    // 1. the storm on the summit: low and wide from his side, creeping in, the drop beyond him
    cut('summit', t); const k = ease(Math.min(1, (t - s0) / 3.2));
    P.set(p.pos.x + rx * lerp(10, 7, k) - fx * lerp(5, 3, k), p.pos.y + lerp(1.6, 2.3, k), p.pos.z + rz * lerp(10, 7, k) - fz * lerp(5, 3, k));
    Lk.set(p.pos.x + fx * 3.5, p.pos.y + 1.1, p.pos.z + fz * 3.5); D.fov = 46;
  } else if (tJump < 0) {
    // 2. his face as he says it: close, from in front and a little below
    cut('face', t); const k = ease(Math.min(1, (t - s0) / 4.5));
    P.set(p.pos.x + fx * lerp(3.0, 2.4, k) + rx * 1.4, p.pos.y + 1.25, p.pos.z + fz * lerp(3.0, 2.4, k) + rz * 1.4);
    Lk.set(p.pos.x, p.pos.y + 1.5, p.pos.z); D.fov = 32;
    fill.intensity = 7;   // a little light on his face
  } else if (tPhx < 0) {
    // 3. the leap: from out over the drop, looking back at the lip as he comes off it and burns
    cut('leap', t); fill.intensity = 0;
    if (!A) A = { x: p.pos.x + fx * 26 + rx * 9, y: p.pos.y - 4, z: p.pos.z + fz * 26 + rz * 9 };
    P.set(A.x, A.y, A.z); Lk.copy(p.pos).y += 1; D.fov = 44;
  } else if (tCloud < 0 || t < tCloud) {
    // 4. the dive through the storm: tight behind and above the bird, the lens shaking with it
    cut('dive', t);
    P.set(p.pos.x - bx * 26, p.pos.y + 9, p.pos.z - bz * 26); P.x += (Math.random() - 0.5) * 0.5; P.y += (Math.random() - 0.5) * 0.5;
    Lk.set(p.pos.x + bx * 30, p.pos.y - 8, p.pos.z + bz * 30); D.fov = 62;
  } else if (t < tCloud + 3.4) {
    // 5. under the clouds, looking up: the dawn coming, and he comes down out of the ceiling toward us
    cut('below', t);
    if (!A) A = { x: p.pos.x + bx * 190 + bz * 40, y: I.CLOUD_SEA - 280, z: p.pos.z + bz * 190 - bx * 40 };
    P.set(A.x, A.y, A.z); Lk.copy(p.pos); D.fov = 40; D.fog = 5200;
  } else if (t < tCloud + 12.2) {
    // 6. the whole country: straight down from very high, the bird a spark crossing it, turning slowly as we sink
    cut('top', t); const k = (t - s0) / 8.8, h = lerp(1150, 620, ease(Math.min(1, k))), a = k * 0.5;
    P.set(p.pos.x - bx * 140 + Math.cos(a) * 40, p.pos.y + h, p.pos.z - bz * 140 + Math.sin(a) * 40);
    Lk.set(p.pos.x + bx * 60, p.pos.y, p.pos.z + bz * 60); D.fov = 58; D.fog = 9000;
  } else if (t < tCloud + 18.7) {
    // 7. down with him: a low chase, the forests going by underneath
    cut('chase', t); const k = ease(Math.min(1, (t - s0) / 2));
    P.set(p.pos.x - bx * lerp(60, 24, k) + bz * 6, p.pos.y + lerp(30, 6, k), p.pos.z - bz * lerp(60, 24, k) - bx * 6);
    Lk.set(p.pos.x + bx * 25, p.pos.y, p.pos.z + bz * 25); D.fov = 56; D.fog = 4200;
  } else {
    // 8. let him go: the lens stops and rises, and he flies on into all of it
    cut('away', t);
    if (!A) A = { x: p.pos.x - bx * 20, y: p.pos.y + 4, z: p.pos.z - bz * 20 };
    const k = ease(Math.min(1, (t - s0) / 6)); P.set(A.x, A.y + k * 160, A.z); Lk.copy(p.pos); D.fov = lerp(50, 62, k); D.fog = 7000;
  }
  D.p.copy(P); D.l.copy(Lk);
}
async function frame() {
  try {
    const t = R.frame / FPS;
    control(t); direct(t);
    I.step(1);
    const url = cv.toDataURL('image/jpeg', 0.92), bin = atob(url.slice(url.indexOf(',') + 1)), u8 = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    const r = await fetch(CAP + 'f' + String(R.frame).padStart(5, '0') + '.jpg', { method: 'POST', body: new Blob([u8], { type: 'image/jpeg' }) });
    if (!r.ok) throw new Error('capture server said ' + r.status);
    R.frame++;
  } catch (e) { R.err = String(e); }
}
function wav(buf) {
  const n = buf.length, L = buf.getChannelData(0), Rr = buf.numberOfChannels > 1 ? buf.getChannelData(1) : L, out = new DataView(new ArrayBuffer(44 + n * 4));
  const str = (o, s) => { for (let i = 0; i < s.length; i++) out.setUint8(o + i, s.charCodeAt(i)); };
  str(0, 'RIFF'); out.setUint32(4, 36 + n * 4, true); str(8, 'WAVEfmt '); out.setUint32(16, 16, true); out.setUint16(20, 1, true); out.setUint16(22, 2, true);
  out.setUint32(24, buf.sampleRate, true); out.setUint32(28, buf.sampleRate * 4, true); out.setUint16(32, 4, true); out.setUint16(34, 16, true); str(36, 'data'); out.setUint32(40, n * 4, true);
  for (let i = 0, o = 44; i < n; i++, o += 4) { out.setInt16(o, Math.max(-1, Math.min(1, L[i])) * 32767, true); out.setInt16(o + 2, Math.max(-1, Math.min(1, Rr[i])) * 32767, true); }
  return new Blob([out], { type: 'audio/wav' });
}
async function finish() {
  await fetch(CAP + 'meta.json', { method: 'POST', body: JSON.stringify({ log: R.log, strikes: R.strikes, shots: R.shots }) });
}
if (off) {
  const tick = async () => { await frame(); if (R.frame < R.total && !R.err) off.suspend(R.frame / FPS).then(tick); off.resume(); };
  await frame();
  off.suspend(1 / FPS).then(tick);
  off.startRendering().then(async buf => {
    try { await fetch(CAP + 'audio.wav', { method: 'POST', body: wav(buf) }); R.audio = true; await finish(); } catch (e) { R.err = 'audio: ' + e; }
    R.done = true;
  }, e => { R.err = 'render: ' + e; R.done = true; });
} else {
  R.log.push(['no audio context: picture only']);
  (async () => { while (R.frame < R.total && !R.err) await frame(); await finish(); R.done = true; })();
}
