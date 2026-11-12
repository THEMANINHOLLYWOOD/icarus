// Gameplay reels for the X thread: the game plays itself (voice orders, the gods, rings, other fliers) and we record it
// at 60 fps from good angles — the game's own cameras or a lens we place. Not deployed.
//
// Use: `node tools/cap.mjs`, load the game fresh at 1920x1080 (do not begin it), then
//   await import('/tools/reel7.js?' + Date.now())   → window.REEL (boots to play, as ICARUS, on the summit)
//   REEL.rec(pre, secs, fn)  records secs of frames to tools/cap/<pre>00000.jpg…, calling fn(t, dt) before each step
//   REEL.say(text)           a voice order, as if spoken (logged with its time, for the caption laid on afterwards)
//   REEL.lens(p, l, fov)     hold a placed lens; REEL.lens(null) gives the game's own camera back
//   REEL.peek()              a small jpeg of the canvas now (for looking while setting up)
const I = window.__icarus, p = I.player, cv = document.getElementById('c');
const CAP = 'http://127.0.0.1:8124/f/', FPS = 60;
const R = window.REEL = { log: [], frame: 0, busy: false, err: null, t: 0 };
let seed = 11;
Math.random = () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
window.requestAnimationFrame = () => 0;
if (I.API) I.API.tts = false;   // (no voice credits spent while recording)

// boot: begin as ICARUS and skip the prologue
const ni = document.getElementById('nameInput');
if (I.state !== 'play') {
  ni.value = 'ICARUS'; ni.dispatchEvent(new Event('input'));
  ni.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true }));
  I.step(3); await new Promise(r => setTimeout(r, 1500));
  if (I.state === 'prologue') I.endPrologue?.();
  for (let i = 0; i < 200 && I.state !== 'play'; i++) I.step(30);
}
R.state = I.state;

R.quiet = () => { if (I.dlg) { I.dlg.queue.length = 0; I.dlg.cur = null; } };
R.say = text => { R.log.push(['say', +(R.t).toFixed(3), text]); const low = text.toLowerCase(); return I.voiceDo(low, low.split(/\s+/).length); };
R.lens = (pos, look, fov = 50) => {
  if (!pos) { I.dbgCam.on = false; return; }
  I.dbgCam.on = true; I.dbgCam.fov = fov; I.dbgCam.p.copy(pos); I.dbgCam.l.copy(look);
};
const OUTW = 1920, OUTH = Math.round(OUTW * cv.height / cv.width), small = document.createElement('canvas');
small.width = OUTW; small.height = OUTH; const sx = small.getContext('2d'); sx.imageSmoothingEnabled = true; sx.imageSmoothingQuality = 'high';
R.peek = (w = 640) => { const c = document.createElement('canvas'); c.width = w; c.height = Math.round(w * cv.height / cv.width); c.getContext('2d').drawImage(cv, 0, 0, c.width, c.height); return c.toDataURL('image/jpeg', 0.8); };
async function post(name, u8) {
  for (let k = 0; k < 6; k++) { try { if ((await fetch(CAP + name, { method: 'POST', body: u8 })).ok) return; } catch {} await new Promise(r => setTimeout(r, 250)); }
  throw new Error('capture failed: ' + name);
}
R.rec = async (pre, secs, fn) => {
  R.busy = true; R.stopNow = false; R.err = null; R.frame = 0; R.log = []; R.t = 0;
  const n = Math.round(secs * FPS);
  try {
    for (let f = 0; f < n && !R.stopNow; f++) {
      R.t = f / FPS; if (fn) fn(R.t, 1 / FPS);
      I.step(1);
      sx.drawImage(cv, 0, 0, OUTW, OUTH);
      const url = small.toDataURL('image/jpeg', 0.93), bin = atob(url.slice(url.indexOf(',') + 1)), u8 = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
      await post(pre + String(f).padStart(5, '0') + '.jpg', u8);
      R.frame = f + 1;
    }
    await post(pre + 'log.json', new TextEncoder().encode(JSON.stringify(R.log)));
  } catch (e) { R.err = String(e); }
  R.busy = false;
};
R.run = (secs, fn) => { const n = Math.round(secs * FPS); for (let f = 0; f < n; f++) { R.t = f / FPS; if (fn) fn(R.t, 1 / FPS); I.step(1); } };

// a lens that rides with him: behind/beside/above in his own frame, smoothed so it swings like a camera operator's
import * as THREE from 'three';
const _cp = new THREE.Vector3(), _cl = new THREE.Vector3(), _f = new THREE.Vector3(), _r = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0);
let rig = null;
R.chase = (o) => { rig = o ? Object.assign({ back: 14, side: 5, up: 3, ahead: 6, lookUp: 1, fov: 46, k: 3, orbit: 0 }, o) : null; if (rig) rig.init = true; else I.dbgCam.on = false; };
R.rigSet = o => { if (rig) Object.assign(rig, o); };
R.rigStep = (dt) => {
  if (!rig) return;
  const yaw = p.yaw + (rig.orbit || 0) * R.t;
  _f.set(-Math.sin(yaw), 0, -Math.cos(yaw)); _r.crossVectors(_f, UP);
  const s = rig.abs ? 1 : (p.scale || 1), want = p.pos.clone().addScaledVector(_f, -rig.back * s).addScaledVector(_r, rig.side * s).addScaledVector(UP, rig.up * s);
  const g = I.groundAt ? I.groundAt(want.x, want.z) : -1e9; want.y = Math.max(want.y, g + 2);
  const lookAt = p.pos.clone().addScaledVector(_f, rig.ahead * s).addScaledVector(UP, rig.lookUp * s);
  if (rig.init) { _cp.copy(want); _cl.copy(lookAt); rig.init = false; }
  const a = 1 - Math.exp(-rig.k * dt);
  _cp.lerp(want, a); _cl.lerp(lookAt, Math.min(1, a * 2.5));
  I.dbgCam.on = true; I.dbgCam.fov = rig.fov; I.dbgCam.p.copy(_cp); I.dbgCam.l.copy(_cl);
};
{ const run0 = R.run, rec0 = R.rec;
  R.run = (secs, fn) => run0(secs, (t, dt) => { if (fn) fn(t, dt); R.rigStep(dt); });
  R.rec = (pre, secs, fn) => rec0(pre, secs, (t, dt) => { if (fn) fn(t, dt); R.rigStep(dt); }); }

// the look for the thread's second pass: big, readable glyphs (the game's coarsest cell, as on a phone) — held every frame,
// since the game resets the cell size whenever it resizes
R.cell = null;
R.setCell = (cw, ch) => { R.cell = cw ? [cw, ch] : null; };
const _applyCell = () => {
  if (!R.cell || !(I.postMat.uniforms.uAscii.value > 0.5)) return;   // (only while the letters are on)
  const U = I.postMat.uniforms, dpr = I.renderer.getPixelRatio(), [cw, ch] = R.cell;
  U.uCell.value.set(cw * dpr, ch * dpr);
  const nx = Math.max(1, Math.ceil(innerWidth / cw)), ny = Math.max(1, Math.ceil(innerHeight / ch));
  if (I.cellRT.width !== nx || I.cellRT.height !== ny) { I.cellRT.setSize(nx, ny); I.cellRT2.setSize(nx, ny); }
  U.uCells.value.set(nx, ny);
};
{ const run1 = R.run, rec1 = R.rec;
  R.run = (secs, fn) => run1(secs, (t, dt) => { if (fn) fn(t, dt); _applyCell(); });
  R.rec = (pre, secs, fn) => rec1(pre, secs, (t, dt) => { if (fn) fn(t, dt); _applyCell(); }); }

// two pictures of every frame: the game's own (through the letters) and the raw 3D render under it, with nothing on top,
// for showing how the look is built. REEL.recDual(pre, secs, fn) → <pre>a00000.jpg (game) and <pre>b00000.jpg (raw)
R.recDual = async (pre, secs, fn) => {
  R.busy = true; R.stopNow = false; R.err = null; R.frame = 0; R.log = []; R.t = 0;
  const n = Math.round(secs * FPS);
  const grab = async name => {
    sx.drawImage(cv, 0, 0, OUTW, OUTH);
    const url = small.toDataURL('image/jpeg', 0.93), bin = atob(url.slice(url.indexOf(',') + 1)), u8 = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    await post(name, u8);
  };
  try {
    for (let f = 0; f < n && !R.stopNow; f++) {
      R.t = f / FPS; if (fn) fn(R.t, 1 / FPS); R.rigStep(1 / FPS); _applyCell();
      I.step(1);
      await grab(pre + 'a' + String(f).padStart(5, '0') + '.jpg');
      const rd = I.renderer; rd.setRenderTarget(null); rd.render(I.scene, I.camera);
      await grab(pre + 'b' + String(f).padStart(5, '0') + '.jpg');
      R.frame = f + 1;
    }
    await post(pre + 'log.json', new TextEncoder().encode(JSON.stringify(R.log)));
  } catch (e) { R.err = String(e); }
  R.busy = false;
};
