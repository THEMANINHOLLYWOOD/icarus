// "Down from Olympus": the title card's loop. Sunset over the cloud sea, the peak of Olympus standing out of it; the red
// bird comes over the summit, dives down the mountain's face toward us, pulls out and sweeps past the lens and away, and
// the mountain is left alone in the evening until he comes over the top again. The lens holds still (it only breathes),
// so the first frame and the last are the same empty mountain. The title card (ICARUS / THE LAST EMBER / SPACE TO FLY)
// is laid over it afterwards by tools/titlecard.py, from an overlay this script paints with the page's own font. Not deployed.
//
// Use: start `node tools/cap.mjs`, load the game fresh in the preview at 1920x1080 (do not begin it), then:
//   await import('/tools/reel6.js?' + Date.now())      → window.REEL; frames go to tools/cap/<pre>00000.jpg
//   ?look=1 (set up only; REEL.view(u) by hand)  &pre=t  &T  &warm  &fov  &az (lens bearing from the summit, vs the sun)
//   &dist &hc (lens height vs the summit)  &card=1 (only paint the title overlay: tools/cap/<pre>card.png, <pre>hint.png)
import * as THREE from 'three';
const Q = new URLSearchParams(import.meta.url.split('?')[1] || '');
const num = (k, d) => (Q.has(k) ? +Q.get(k) : d);
const FPS = 60, T = num('T', 9), SECS = num('secs', T + 0.5), WARM = num('warm', 3), LOOK = Q.get('look') === '1', PRE = Q.get('pre') || 't', CAP = 'http://127.0.0.1:8124/f/';
const FOV = num('fov', 38);
const I = window.__icarus, p = I.player, cv = document.getElementById('c');
const R = window.REEL = { frame: 0, total: Math.round(FPS * SECS), done: false, err: null, log: [] };
const TAU = Math.PI * 2, clamp = (v, a, b) => Math.max(a, Math.min(b, v)), ease = x => x * x * (3 - 2 * x), smooth = (a, b, x) => ease(clamp((x - a) / (b - a), 0, 1));

// ── the title card, painted once with the page's own letters (IBM Plex Mono), as two transparent layers at the frame's size
async function paintCard() {
  await document.fonts.load('600 150px "IBM Plex Mono"'); await document.fonts.load('400 13px "IBM Plex Mono"');
  const W = cv.width, H = cv.height, k = W / 1920;   // (the page at 1920x1080, drawn at the canvas's size)
  const mk = () => { const c = document.createElement('canvas'); c.width = W; c.height = H; return [c, c.getContext('2d')]; };
  const send = async (c, name) => { const b = await new Promise(r => c.toBlob(r, 'image/png')); const u8 = new Uint8Array(await b.arrayBuffer()); const r = await fetch(CAP + PRE + name, { method: 'POST', body: u8 }); if (!r.ok) throw new Error('card ' + r.status); };
  // the card: the title's shade (dark at the top and the foot, clear through the middle) and the name
  const [c1, g] = mk();
  const sh = g.createLinearGradient(0, 0, 0, H);
  sh.addColorStop(0, 'rgba(5,7,13,.5)'); sh.addColorStop(0.34, 'rgba(5,7,13,0)'); sh.addColorStop(0.62, 'rgba(5,7,13,0)'); sh.addColorStop(1, 'rgba(5,7,13,.72)');
  g.fillStyle = sh; g.fillRect(0, 0, W, H);
  const spaced = (text, px, weight, ls, y, fill, shadows) => {
    g.font = `${weight} ${px * k}px "IBM Plex Mono"`; g.letterSpacing = `${ls * px * k}px`; g.textAlign = 'center'; g.textBaseline = 'top';
    const x = W / 2 + ls * px * k / 2;   // (letter-spacing leaves a space after the last letter; the page pads the left by the same)
    for (const [blur, col, oy] of shadows) { g.save(); g.shadowColor = col; g.shadowBlur = blur * k; g.shadowOffsetY = (oy || 0) * k; g.fillStyle = fill; g.fillText(text, x, y); g.restore(); }
    g.fillStyle = fill; g.fillText(text, x, y);
  };
  // (#title: padding-top 7vh; h1 150px, line-height 1, letter-spacing .32em, #ffb070 with an ember glow; .sub 13px, .4em, ink)
  const top = 0.07 * 1080 * k, h1 = 150;
  spaced('ICARUS', h1, 600, 0.32, top, '#ffb070', [[90, 'rgba(255,60,20,.45)'], [28, 'rgba(255,90,30,.75)'], [0, 'rgba(0,0,0,.4)', 2]]);
  spaced('THE LAST EMBER', 13 * num('subk', 1.6), 400, 0.4, top + h1 * k + 6 * k, '#f4ead2', [[8, '#000']]);
  await send(c1, 'card.png');
  // SPACE TO FLY, at 80% down, glowing; it blinks (laid on with its blink by titlecard.py)
  const [c2] = mk(); const g2 = c2.getContext('2d');
  const save = g; Object.assign(g2, {});
  {
    const px = 12 * num('hintk', 1.5), ls = 0.6; g2.font = `400 ${px * k}px "IBM Plex Mono"`; g2.letterSpacing = `${ls * px * k}px`; g2.textAlign = 'center'; g2.textBaseline = 'middle';
    const x = W / 2 + ls * px * k / 2, y = 0.8 * H;
    for (const [blur, col] of [[10, 'rgba(255,110,40,.8)'], [3, '#000']]) { g2.save(); g2.shadowColor = col; g2.shadowBlur = blur * k; g2.fillStyle = '#ffd8a8'; g2.fillText('SPACE TO FLY', x, y); g2.restore(); }
    g2.fillStyle = '#ffd8a8'; g2.fillText('SPACE TO FLY', x, y);
  }
  void save;
  await send(c2, 'hint.png');
}
if (Q.get('card') === '1') { await paintCard(); R.done = true; throw new Error('card painted (this is not a failure)'); }

window.requestAnimationFrame = () => 0;
let seed = 1;
const rng = () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
Math.random = rng;

// ── begin as ICARUS, then make him the bird, at the title's own hour (the evening the game opens on)
const ni = document.getElementById('nameInput'); ni.value = 'ICARUS'; ni.dispatchEvent(new Event('input'));
ni.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true }));
I.step(3); await new Promise(r => setTimeout(r, 1500));
if (I.state === 'prologue') I.endPrologue?.();
for (let i = 0; i < 200 && I.state !== 'play'; i++) I.step(30);
const DAY = num('day', 0.712);
I.story.phase = 'gods'; I.flags.morphed = true; I.setStorm(0); I.setDay(DAY);
const quiet = () => { if (I.dlg) { I.dlg.queue.length = 0; I.dlg.cur = null; } if (I.cinema) I.cinema.idle = 0; I.setStorm(0); I.setDay(DAY); };
quiet();
for (let i = 0; i < 400; i++) { quiet(); I.step(1); }   // (let the sky settle on where the sun is: it eases there)

// ── the mountain and the lens. The lens stands out over the cloud sea, a little below the peak, looking up at it with the
// sun low beside it (az: how far round from straight into the sun)
const PEAK = new THREE.Vector3(p.pos.x, 0, p.pos.z);   // (he starts on the summit)
PEAK.y = I.groundAt ? I.groundAt(PEAK.x, PEAK.z) : p.pos.y;
const sunH = new THREE.Vector3(I.sunDir.x, 0, I.sunDir.z).normalize();
const AZ = num('az', 0.28), DIST = num('dist', 460), HC = num('hc', -120);
const UPV = new THREE.Vector3(0, 1, 0);
const toCam = sunH.clone().negate().applyAxisAngle(UPV, AZ);   // (from the peak toward the lens)
const CAM = PEAK.clone().addScaledVector(toCam, DIST); CAM.y = PEAK.y + HC;
// the lens looks back at the peak, tipped up (lp, degrees) so the summit sits just under the title, turned by lyaw
const look = toCam.clone().negate().applyAxisAngle(UPV, num('lyaw', 0) * Math.PI / 180);
const LOOKAT = CAM.clone().addScaledVector(look, 100).add(new THREE.Vector3(0, 100 * Math.tan(num('lp', 10) * Math.PI / 180), 0));
const ground = (x, z) => (I.groundAt ? I.groundAt(x, z) : -1e9);
R.log.push(['peak', PEAK.toArray().map(Math.round), 'cam', CAM.toArray().map(Math.round), 'ground under lens', Math.round(ground(CAM.x, CAM.z)), 'sun', I.sunDir.toArray().map(v => +v.toFixed(2))]);

// ── his flight: in over the top from behind the peak, down its face toward us, out of the dive and past the lens
const right = new THREE.Vector3().crossVectors(look, UPV).normalize();
const at = (a, b, c) => PEAK.clone().addScaledVector(toCam, a).addScaledVector(right, b).add(new THREE.Vector3(0, c, 0));
const SX = num('sx', 1);   // (which way he swings: 1 = out to the right)
const D = DIST;
const PATH = new THREE.CatmullRomCurve3([
  at(-110, -30 * SX, 300),       // high behind the peak, out of the top of the frame
  at(-25, -12 * SX, 95),         // over the summit
  at(D * 0.2, 0, 10),            // down the face
  at(D * 0.42, 12 * SX, -75),
  at(D * 0.62, 28 * SX, -122),   // the bottom of the dive
  at(D * 0.78, 58 * SX, -104),   // pulling out, swinging round toward us
  at(D * 0.91, 84 * SX, -72),    // up past the lens on its right, not too close (close, his fire only blazes white)
  at(D + 30, 150 * SX, -20),     // and away
], false, 'centripetal');
const IN = num('in', 0.5), OUT = num('out', 7.2);   // when he comes over the top, and when he has gone past
const sOf = u => { const x = clamp((u - IN) / (OUT - IN), 0, 1); return 0.5 * x + 0.5 * x * x * (1.6 - 0.6 * x) / 1.0; };   // (slow over the top, faster in the dive)

// the wings: a few deep beats over the top, folded for the dive, spread to pull out, two beats as he goes past
function wings(u) {
  const s = sOf(u);
  const dive = smooth(0.18, 0.3, s) * (1 - smooth(0.52, 0.64, s));
  const beatA = 1 - smooth(0.12, 0.2, s), beatB = smooth(0.66, 0.74, s);
  const rate = 2.1, ph = TAU * rate * u;   // (not whole beats to the loop, but he is out of frame at the seam)
  const beating = Math.max(beatA, beatB);
  const f = Math.sin(ph) * (0.25 + 0.7 * beating) * (1 - dive) - 0.35 * dive;
  const fold = 0.12 + dive * 0.75 + Math.max(0, -Math.sin(ph)) * 0.35 * beating;
  return { f, fold, sweep: 0.1 + dive * 0.5, stretch: 1.1 - dive * 0.15 };
}
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3();
let lastYaw = 0;
function place(u) {
  const s = sOf(u), ds = 0.004;
  PATH.getPointAt(clamp(s, 0, 1), _a); PATH.getPointAt(clamp(s + ds, 0, 1), _b); PATH.getPointAt(clamp(s + 2 * ds, 0, 1), _c);
  const v1 = _b.clone().sub(_a), v2 = _c.clone().sub(_b);
  const yaw = Math.atan2(-v1.x, -v1.z), yaw2 = Math.atan2(-v2.x, -v2.z);
  const turn = Math.atan2(Math.sin(yaw2 - yaw), Math.cos(yaw2 - yaw));
  const pitch = Math.atan2(v1.y, Math.hypot(v1.x, v1.z));
  lastYaw = yaw;
  const pos = _a.clone(); pos.y = Math.max(pos.y, ground(pos.x, pos.z) + 10);   // (never into the mountain)
  return { pos, yaw, pitch, bank: clamp(-turn * num('bk', 60), -0.9, 0.9), seen: u > IN - 0.05 && u < OUT + 0.4 };
}

// every frame, after the game has posed him and just before it draws: our wings, and him exactly where the path says
let curU = 0, prevU = -1, cur = null;
const G = I.phoenix.group;
I.scene.onBeforeRender = () => {
  const W = wings(curU); I.setWings(W.f, W.fold, W.sweep, W.stretch);
  const U = I.postMat.uniforms;
  U.uSpeed.value = 0;   // (no rushing-air lines: the lens stands still)
  U.uFlash.value = 0;   // (no lightning)
  U.uHeat.value = num('heat', 0.5);   // (the evening's warmth: the game's own heat grade, held steady)
  if (cur) { G.visible = cur.seen; }
  G.updateMatrixWorld(true);
};
function hold(t) {
  quiet();
  const u = ((t % T) + T) % T;
  if (u < prevU) { seed = 7; I.phoenix.tails.forEach(tl => tl.ok = false); }
  prevU = u; curU = u;
  cur = place(u);
  p.form = 'phoenix'; p.cine = null; p.flame = 1; p.burnout = false; p.sub = null; p.wings = false; p.grounded = false; p.scale = num('scale', 2.2);
  p.pos.copy(cur.pos); p.yaw = cur.yaw; p.pitch = cur.pitch; p.bank = cur.bank; p.speed = 30; p.vy = 0; if (p.vel) p.vel.set(0, 0, 0);
  if (!cur.seen) { p.pos.copy(PEAK).add(new THREE.Vector3(0, 900, 0)); I.phoenix.tails.forEach(tl => tl.ok = false); }   // (parked far above, out of sight)
  // the lens: still, only breathing (one slow cycle a loop, so it closes)
  const ph = TAU * u / T;
  I.dbgCam.on = true; I.dbgCam.fov = FOV; I.dbgCam.fog = num('fog', 0);
  I.dbgCam.p.copy(CAM).addScaledVector(UPV, 2.5 * Math.sin(ph)).addScaledVector(right, 3 * Math.sin(ph + 1));
  I.dbgCam.l.copy(LOOKAT);
}
R.view = u => { for (let i = 0; i < 3; i++) { hold(u - (2 - i) / FPS); I.step(1); } return { u, pos: cur.pos.toArray().map(Math.round), seen: cur.seen }; };
R.PATH = PATH; R.CAM = CAM; R.PEAK = PEAK; R.hold = hold;

// frames at 1920x1080, scaled in the page with high-quality smoothing
const OUTW = num('ow', 1920), OUTH = Math.round(OUTW * cv.height / cv.width), small = document.createElement('canvas');
small.width = OUTW; small.height = OUTH; const sxc = small.getContext('2d'); sxc.imageSmoothingEnabled = true; sxc.imageSmoothingQuality = 'high';
async function capture() {
  sxc.drawImage(cv, 0, 0, OUTW, OUTH);
  const url = small.toDataURL('image/jpeg', 0.94), bin = atob(url.slice(url.indexOf(',') + 1)), u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  const name = CAP + PRE + String(R.frame).padStart(5, '0') + '.jpg';
  let ok = false;
  for (let k = 0; k < 6 && !ok; k++) { try { ok = (await fetch(name, { method: 'POST', body: u8 })).ok; } catch {} if (!ok) await new Promise(r => setTimeout(r, 250)); }
  if (!ok) throw new Error('capture failed at frame ' + R.frame);
}
R.step = t => { hold(t); I.step(1); };
for (let f = 0; f < Math.round(WARM * FPS); f++) R.step(-WARM + f / FPS);
if (LOOK) R.done = true;
else (async () => {
  try { for (; R.frame < R.total && !R.err; R.frame++) { R.step(R.frame / FPS); await capture(); } } catch (e) { R.err = String(e); }
  R.done = true;
})();
