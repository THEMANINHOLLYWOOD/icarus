// "The reach": a 1:1 loop for posts. Daedalus above, wings spread, reaching down; Icarus below, falling, reaching up,
// feathers tearing loose from his wings and rising past him; their hands never quite meeting, the sun blazing in the gap
// between them. He slips, beats his ruined wings and almost makes it back, slips again — for ever. Made in the game's
// own opening scene (its sky, sun, sea and cloud, and the two winged men), seen through the game's ASCII. Not deployed.
//
// Use: start `node tools/cap.mjs`, load the game fresh in the preview at 1080x1080 (do not begin it), then:
//   await import('/tools/reel4.js?' + Date.now())     → window.REEL; frames to tools/cap/<pre>00000.jpg
//   ?look=1 (set up only; REEL.step(t) by hand)  &pre=f  &secs  &warm  &fov  &dist  &sun (sun size)
import * as THREE from 'three';
const Q = new URLSearchParams(import.meta.url.split('?')[1] || '');
const num = (k, d) => (Q.has(k) ? +Q.get(k) : d);
const FPS = 60, T = num('T', 9), SECS = num('secs', T + 0.5), WARM = num('warm', T), LOOK = Q.get('look') === '1', PRE = Q.get('pre') || 'f', CAP = 'http://127.0.0.1:8124/f/';
const FOV = num('fov', 36), DIST = num('dist', 12.8), SUNK = num('sun', 2.6), WS = num('ws', 0.7);
const I = window.__icarus, cv = document.getElementById('c'), pro = I.pro;
const R = window.REEL = { frame: 0, total: Math.round(FPS * SECS), done: false, err: null, log: [] };
window.requestAnimationFrame = () => 0;
let seed = 1;
const rng = () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
Math.random = rng;
const TAU = Math.PI * 2, clamp = (v, a, b) => Math.max(a, Math.min(b, v)), ease = x => x * x * (3 - 2 * x);

// ── into the opening, as ICARUS (the boy is drawn in the letters of the name)
const ni = document.getElementById('nameInput'); ni.value = 'ICARUS'; ni.dispatchEvent(new Event('input'));
ni.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true }));
for (let i = 0; i < 40 && !(pro.sc && pro.dad && pro.son); i++) { I.step(2); await new Promise(r => setTimeout(r, 50)); }
if (!pro.sc || !pro.dad) { if (I.startPrologue) I.startPrologue(); I.step(2); }
if (!pro.sc || !pro.dad || !pro.son) throw new Error('the opening scene did not start');
const SUN = new THREE.Vector3(-0.16, 0.6, -0.78).normalize();   // (the opening's sun)
const dad = pro.dad, son = pro.son;
if (pro.me) pro.me.group.visible = false;
// the hour: late, gold. The opening's sky is morning blue; this one is deep blue overhead, amber low down, molten round the sun
{
  const g = pro.sky.geometry, P = g.attributes.position, C = g.attributes.color, d = new THREE.Vector3(), c = new THREE.Color();
  const zen = new THREE.Color('#141a45'), up = new THREE.Color('#3b2a6e'), rose = new THREE.Color('#b8476e'), low = new THREE.Color('#ff7a3a'), glow = new THREE.Color('#ffc864');
  for (let i = 0; i < P.count; i++) {
    d.fromBufferAttribute(P, i).normalize();
    const h = Math.max(0, d.y), sd = Math.max(0, d.dot(SUN));
    // indigo overhead, violet, rose, then fire low down…
    c.copy(low).lerp(rose, Math.min(1, h * 2.2)).lerp(up, Math.min(1, Math.max(0, h - 0.35) * 2.4)).lerp(zen, Math.min(1, Math.max(0, h - 0.7) * 3));
    // …and round the sun a wide warm bloom, then molten gold close in
    c.lerp(low, Math.pow(sd, 10) * 0.75).lerp(glow, Math.pow(sd, 45) * 0.9).lerp(new THREE.Color(1.15, 0.92, 0.6), Math.pow(sd, 400) * 0.8);
    C.setXYZ(i, c.r, c.g, c.b);
  }
  C.needsUpdate = true;
  pro.disc.material.color.setRGB(1.75, 1.18, 0.5);
  pro.halo.material.color.setRGB(1.35, 0.62, 0.22);
  // the halo: not a flat disc but light, falling off softly into the sky
  pro.halo.material = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, depthTest: false, fog: false, blending: THREE.AdditiveBlending,
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `varying vec2 vUv; void main(){ float r = length(vUv - 0.5) * 2.0;
      float g = exp(-r * r * 9.0) * 0.55 + exp(-r * 3.2) * 0.28;
      gl_FragColor = vec4(vec3(1.0, 0.62, 0.26) * g * (1.0 - smoothstep(0.85, 1.0, r)), 1.0); }` });
  pro.halo.renderOrder = -2;
  // dimmer fill, so the two of them stand dark against the light; the sun behind them rims them
  pro.sc.traverse(o => { if (o.isHemisphereLight) o.intensity = num('fill', 0.45); if (o.isDirectionalLight) o.intensity = num('key', 2.8); });
}

// ── where it all happens: high over the sea, in the air above the morning cloud
const GAP = new THREE.Vector3(num('gx', 0), num('gy', 1150), num('gz', -1400));   // the point between their hands
// the lens looks along the sun's line, so the sun sits right behind the gap, a little high
const VIEW = SUN.clone().add(new THREE.Vector3(0, num('vlow', -0.05), 0)).normalize();
const RIGHT = new THREE.Vector3().crossVectors(VIEW, new THREE.Vector3(0, 1, 0)).normalize(), UP = new THREE.Vector3().crossVectors(RIGHT, VIEW).normalize();
const at = (x, y, z = 0) => GAP.clone().addScaledVector(RIGHT, x).addScaledVector(UP, y).addScaledVector(VIEW, z);   // picture-plane coordinates, metres

// ── his wings coming apart: the boy's feathers get their own melt (the father's stay whole)
const MELT = { value: num('melt', 0.42) }, UTIME = { value: 0 };
function meltMat(mask) {
  const m = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide });
  m.customProgramCacheKey = () => 'reel4-plume' + (mask ? 1 : 0);
  m.onBeforeCompile = sh => {
    sh.uniforms.uTime = UTIME; sh.uniforms.uMelt = MELT;
    if (mask) sh.fragmentShader = sh.fragmentShader.replace('#include <dithering_fragment>', '#include <dithering_fragment>\ngl_FragColor.a = 0.5;');
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTime, uMelt;')
      ;
    sh.fragmentShader = sh.fragmentShader.replace('#include <dithering_fragment>', '#include <dithering_fragment>\ngl_FragColor.rgb *= vec3(1.25, 0.9, 0.62);');
    sh.vertexShader = sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
        transformed.y += sin(uTime * ${(TAU * 13 / T).toFixed(5)} + uv.y * 40.0 + uv.x * 4.0) * 0.1 * uv.x * uv.x;      // the wind shaking every feather
        float isF = step(0.0005, uv.x + uv.y), gone = smoothstep(uv.y * 0.8, uv.y * 0.8 + 0.2, uMelt) * isF;
        transformed *= 1.0 - gone;                                                               // (the ones already gone: gone)`);
  };
  return m;
}
const sonMat = meltMat(true), dadMat = (() => { const m = meltMat(false); const h = m.onBeforeCompile; m.onBeforeCompile = sh => { h(sh); sh.uniforms.uMelt = { value: 0 }; }; m.customProgramCacheKey = () => 'reel4-plume-dad'; return m; })();
dad.group.traverse(o => { if (o.isMesh && o.material && o.material.vertexColors && o.material.isMeshBasicMaterial) o.material = dadMat; });
// smaller wings than the opening gives them, so the men inside them read
for (const F of [dad, son]) for (const w of F.wings) w.root.scale.multiplyScalar(WS);
son.group.traverse(o => { if (o.isMesh && o.material && o.material.vertexColors && o.material.isMeshBasicMaterial) o.material = sonMat; });

// ── hands, at the ends of the arms, fingers out — the thing the whole picture is about
function addHand(F, skinHex) {
  const skin = new THREE.MeshLambertMaterial({ color: skinHex });
  for (const w of F.wings) {
    const h = new THREE.Group(); h.position.set(-2.02, -0.04, 0.2);
    const palm = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), skin); palm.scale.set(1.0, 0.42, 0.75); h.add(palm);
    for (let k = 0; k < 4; k++) { const f = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.03, 0.34, 6).rotateZ(Math.PI / 2).translate(-0.17, 0, 0), skin); f.position.set(-0.14, 0, -0.12 + k * 0.08); f.rotation.y = (k - 1.5) * 0.08; h.add(f); }
    const th = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.03, 0.24, 6).rotateZ(Math.PI / 2).translate(-0.12, 0, 0), skin); th.position.set(0.02, 0, 0.16); th.rotation.y = -0.7; h.add(th);
    w.shoulder.add(h);
  }
}
addHand(dad, 0xc49470); addHand(son, 0xd9a57a);
// ── loose feathers: tearing off his wings, tumbling and turning in the light, rising away as he falls
const FN = 260, featherGeo = new THREE.PlaneGeometry(0.11, 0.42).translate(0, 0.21, 0);
const featherMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.3, 0.95, 0.62), side: THREE.DoubleSide });
const feathers = new THREE.InstancedMesh(featherGeo, featherMat, FN); feathers.frustumCulled = false; feathers.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
pro.sc.add(feathers);
const fp = Array.from({ length: FN }, () => ({ on: false, t0: 0, life: 1, p: new THREE.Vector3(), v: new THREE.Vector3(), ax: new THREE.Vector3(1, 0, 0), spin: 0, ph: 0, size: 1 }));
let fNext = 0;
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _v = new THREE.Vector3(), _w = new THREE.Vector3();
// points on his wings to tear feathers from
const wingPts = [];
son.wings.forEach(w => w.root.traverse(o => { if (o.isMesh && o.material === sonMat) { const P = o.geometry.attributes.position, uv = o.geometry.attributes.uv; for (let i = 0; i < P.count; i += 7) if (!uv || uv.getX(i) > 0.15) wingPts.push({ o, i }); } }));
function tearFeather(u) {
  const f = fp[fNext = (fNext + 1) % FN];
  const wp = wingPts[Math.floor(rng() * wingPts.length)];
  f.p.fromBufferAttribute(wp.o.geometry.attributes.position, wp.i).applyMatrix4(wp.o.matrixWorld);
  // up and away from him (he is falling out from under them), drifting toward his father's side, a little out at the lens
  f.v.copy(UP).multiplyScalar(1.6 + rng() * 2.4).addScaledVector(RIGHT, (rng() - 0.65) * 2.2).addScaledVector(VIEW, (rng() - 0.6) * 1.6);
  f.ax.set(rng() - 0.5, rng() - 0.5, rng() - 0.5).normalize(); f.spin = (2 + rng() * 5) * (rng() < 0.5 ? -1 : 1); f.ph = rng() * TAU;
  f.t0 = u; f.life = 2.4 + rng() * 2.2; f.size = 0.8 + rng() * 0.7; f.on = true;
}
function updateFeathers(u) {
  for (let i = 0; i < FN; i++) {
    const f = fp[i], a = u - f.t0;
    if (!f.on || a < 0 || a > f.life) { _m.makeScale(0, 0, 0); feathers.setMatrixAt(i, _m); continue; }
    // carried up and out, with the side-to-side see-saw of a falling feather
    _v.copy(f.p).addScaledVector(f.v, a).addScaledVector(RIGHT, Math.sin(a * 3.1 + f.ph) * 0.35 * Math.min(1, a)).addScaledVector(UP, 0.12 * a * a);
    _q.setFromAxisAngle(f.ax, f.spin * a + f.ph);
    const k = f.size * Math.min(1, a * 6) * (1 - ease(clamp((a - f.life * 0.7) / (f.life * 0.3), 0, 1)));
    _m.compose(_v, _q, _s.set(k, k, k)); feathers.setMatrixAt(i, _m);
  }
  feathers.instanceMatrix.needsUpdate = true;
}

// ── posing a winged man: where he is, which way his head points, which way his back faces
const _x = new THREE.Vector3(), _y = new THREE.Vector3(), _z = new THREE.Vector3(), _b = new THREE.Matrix4();
function place(F, pos, head, back) {
  _z.copy(head).normalize().negate(); _y.copy(back).addScaledVector(_z, -back.dot(_z)).normalize(); _x.crossVectors(_y, _z);
  _b.makeBasis(_x, _y, _z); F.group.quaternion.setFromRotationMatrix(_b); F.group.position.copy(pos); F.group.updateMatrixWorld(true);
}
// one wing: up/down (beat), fore/aft (sweep), the bend at elbow and wrist
function wing(w, i, beat, sweep, elbow, wrist) {
  w.shoulder.rotation.z = -beat; w.elbow.rotation.z = -elbow; w.wrist.rotation.z = -wrist;
  w.root.rotation.y = sweep * (i === 0 ? 1 : -1);
}

// the arm lies along the first bone of the wing: find the beat and sweep that point it at a target
const _sh = new THREE.Vector3(), _hd = new THREE.Vector3(), _t1 = new THREE.Vector3(), _t2 = new THREE.Vector3();
// what reaches is the wing itself: its tip, the last feathers, stretched toward the other
function handOf(w, out) { w.root.updateMatrixWorld(true); return (w.tip || w.wrist).getWorldPosition(out); }
function aim(F, i, target, elbow = 0.05, wrist = 0) {
  const w = F.wings[i];
  let best = 1e9, bb = 0, bs = 0;
  const tryIt = (b, sw) => {
    wing(w, i, b, sw, elbow, wrist); w.root.updateMatrixWorld(true);
    w.shoulder.getWorldPosition(_sh); handOf(w, _hd);
    _t1.subVectors(_hd, _sh).normalize(); _t2.subVectors(target, _sh).normalize();
    const e = 1 - _t1.dot(_t2); if (e < best) { best = e; bb = b; bs = sw; }
  };
  for (let b = -1.5; b <= 1.5; b += 0.12) for (let sw = -1.7; sw <= 1.7; sw += 0.12) tryIt(b, sw);
  const B0 = bb, S0 = bs; for (let b = B0 - 0.12; b <= B0 + 0.12; b += 0.02) for (let sw = S0 - 0.12; sw <= S0 + 0.12; sw += 0.02) tryIt(b, sw);
  wing(w, i, bb, bs, elbow, wrist); F.group.updateMatrixWorld(true);
  return best;
}
// put a figure so that its reaching hand lands on the target (the whole man moves; the arm cannot stretch)
function reach(F, i, target, head, back, elbow, wrist, guess) {
  place(F, guess, head, back);
  for (let k = 0; k < 3; k++) {
    aim(F, i, target, elbow, wrist);
    handOf(F.wings[i], _hd);
    F.group.position.add(_t1.subVectors(target, _hd)); F.group.updateMatrixWorld(true);
  }
}

// ── the loop: he slips away, fights back up, almost reaches, slips again
const SLIP = u => { const s = u / T; return 0.5 - 0.5 * Math.cos(TAU * s); };   // 0 at the start and end of the loop (closest), 1 halfway (furthest)
function pose(u) {
  const s = SLIP(u), ph = TAU * u / T;
  UTIME.value = u;
  // the gap between their hands: a hand's breadth at its closest, an arm's length when he has slipped furthest
  const gapX = 0.09 + 0.3 * s, gapY = 0.06 + 1.0 * s;
  const dHand = at(-gapX, gapY), sHand = at(gapX, -gapY);
  // the father: holding the air with great slow beats of his far wing, reaching down with the near one
  const dB = Math.sin(TAU * u / (T / 4));
  const dHead = new THREE.Vector3().addScaledVector(RIGHT, 0.55).addScaledVector(UP, -0.62).addScaledVector(VIEW, -0.35);
  const dBack = VIEW.clone().addScaledVector(UP, 0.7).addScaledVector(RIGHT, -0.3);
  reach(dad, 1, dHand.clone().addScaledVector(UP, 0.03 * dB), dHead, dBack, 0.02, -0.02, at(-2.2, 1.7));
  wing(dad.wings[0], 0, 0.25 + 0.55 * dB, -0.1 + 0.1 * dB, 0.15 + 0.25 * Math.max(0, -dB), 0.1 + 0.2 * Math.max(0, -dB));
  dad.head.rotation.x = 1.35;
  // the son: falling back and away, turning over as he slips, his near arm up to his father, the far wing beating for nothing
  const thrash = Math.sin(ph * 5.0) * 0.5 + Math.sin(ph * 7.0 + 1) * 0.25;   // (whole numbers of cycles to the loop: seamless)
  const sHead = new THREE.Vector3().addScaledVector(RIGHT, -0.45 - 0.2 * s).addScaledVector(UP, 0.75 - 0.35 * s).addScaledVector(VIEW, -0.25);
  const sBack = VIEW.clone().negate().addScaledVector(UP, -0.5 - 0.3 * s).addScaledVector(RIGHT, 0.2);
  reach(son, 1, sHand, sHead, sBack, 0.02, 0.02, at(2.0, -1.8));
  wing(son.wings[0], 0, 0.15 + thrash * (0.6 + 0.6 * s), 0.1 + 0.3 * Math.sin(ph * 4.0), 0.3 + 0.35 * Math.max(0, thrash), 0.4);
  son.head.rotation.x = 0.55;
  return s;
}

// ── the lens: just in front of the gap, the sun behind it, drifting a little round them and back
function lens(u) {
  const ph = TAU * u / T, cam = I.camera;
  const off = new THREE.Vector3().addScaledVector(RIGHT, 0.7 * Math.sin(ph)).addScaledVector(UP, 0.25 * Math.cos(ph));
  cam.position.copy(GAP).addScaledVector(VIEW, -DIST).add(off);
  cam.fov = FOV; cam.up.set(0, 1, 0); cam.lookAt(GAP);
  cam.updateProjectionMatrix(); cam.updateMatrixWorld(true);
  // the sky goes with the lens; the sun sits on the sun's line, huge
  pro.sky.position.copy(cam.position); if (pro.seaU) pro.seaU.uCam.value.copy(cam.position);
  pro.disc.position.copy(cam.position).addScaledVector(SUN, 7000); pro.disc.scale.setScalar(300 * SUNK); pro.disc.lookAt(cam.position);
  pro.halo.position.copy(cam.position).addScaledVector(SUN, 7050); pro.halo.scale.setScalar(300 * SUNK * (2.1 + Math.sin(ph * 3) * 0.08)); pro.halo.lookAt(cam.position);
  pro.disc.updateMatrixWorld(); pro.halo.updateMatrixWorld(); pro.sky.updateMatrixWorld();
}

let curU = 0, prevU = -1, tearAcc = 0;
pro.sc.onBeforeRender = () => {
  const s = pose(curU);
  dad.group.visible = son.group.visible = true; if (pro.me) pro.me.group.visible = false;
  lens(curU);
  updateFeathers(curU);
  const PU = I.postMat.uniforms; PU.uFade.value = 1; PU.uFlash.value = 0; if (PU.uWarp) PU.uWarp.value = 0;   // (the opening's fade-in is frozen with its clock: fully up)
};
function hold(t) {
  const u = t % T;
  if (u < prevU) { seed = 5; }
  prevU = u; curU = u;
  // the opening's own clock stays where it is: this is our moment, not its story
  pro.t = num('pt', 0.5); pro.rt = pro.t; pro.slow = 1; pro.falling = false; pro.hitT = 0;
  if (I.dlg) { I.dlg.queue.length = 0; I.dlg.cur = null; }
  // tearing: a steady loss, more when he is furthest and fighting hardest
  tearAcc += (14 + 26 * SLIP(u)) / FPS;
  while (tearAcc >= 1) { tearAcc -= 1; son.group.updateMatrixWorld(true); tearFeather(u); }
}
async function capture() {
  const url = cv.toDataURL('image/jpeg', 0.94), bin = atob(url.slice(url.indexOf(',') + 1)), u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  const r = await fetch(CAP + PRE + String(R.frame).padStart(5, '0') + '.jpg', { method: 'POST', body: new Blob([u8], { type: 'image/jpeg' }) });
  if (!r.ok) throw new Error('capture server said ' + r.status);
}
R.step = t => { hold(t); I.step(1); };
R.log.push(['state', I.state, 'wing pts', wingPts.length]);
for (let f = 0; f < Math.round(WARM * FPS); f++) R.step(f / FPS);
if (LOOK) R.done = true;
else (async () => {
  try { for (; R.frame < R.total && !R.err; R.frame++) { R.step(WARM + R.frame / FPS); await capture(); } } catch (e) { R.err = String(e); }
  R.done = true;
})();
