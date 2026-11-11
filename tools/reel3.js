// "To dust": the across-the-sun loop, made alive. He comes in from the bottom left with a real bird's wingbeat (a fast
// power stroke, a slower recovery with the hands folded in, glides between, the body lifting on every downstroke), climbs
// into the face of a huge setting sun as a black shape — and starts to burn from the wingtips and the tail inward, a
// glowing edge eating across him while what is left keeps flying, everything it eats lifting off as fine dust that glows,
// cools to ash and drifts away on the air. The sun alone; the next one comes in. No words. Not deployed.
//
// Use: start `node tools/cap.mjs`, load the game fresh in the preview at the output size (do not begin it), then:
//   await import('/tools/reel3.js?' + Date.now())      → window.REEL; frames go to tools/cap/<pre>00000.jpg
//   ?look=1 (set up only; REEL.step(t) by hand)  &pre=d  &secs  &warm  &solo=1 (only bird, dust, sky)  &sq (painted square size)
//   &ax (where he enters, across)  &fov  &dist  &sun
import * as THREE from 'three';
const Q = new URLSearchParams(import.meta.url.split('?')[1] || '');
const num = (k, d) => (Q.has(k) ? +Q.get(k) : d);
const FPS = 60, T = num('T', 7.5), SECS = num('secs', T + 0.5), WARM = num('warm', T), LOOK = Q.get('look') === '1', PRE = Q.get('pre') || 'd', CAP = 'http://127.0.0.1:8124/f/';
const FOV = num('fov', 9), DIST = num('dist', 400), SUN_R = num('sun', 0.3), SQ = num('sq', 1.6);
const BREAK = num('brk', 3.05), DUR = num('dur', 1.55);   // when the burning starts, and how long it takes to eat him
const I = window.__icarus, p = I.player, cv = document.getElementById('c');
const R = window.REEL = { frame: 0, total: Math.round(FPS * SECS), done: false, err: null, log: [] };
window.requestAnimationFrame = () => 0;

let seed = 1;
const rng = () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
Math.random = rng;

// ── begin as ICARUS, out in the open sky
const ni = document.getElementById('nameInput'); ni.value = 'ICARUS'; ni.dispatchEvent(new Event('input'));
ni.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true }));
I.step(3); await new Promise(r => setTimeout(r, 1500));
if (I.state === 'prologue') I.endPrologue?.();
for (let i = 0; i < 160 && I.state !== 'play'; i++) I.step(30);
I.story.phase = 'gods'; I.flags.morphed = true; I.setStorm(0); I.setDay(0.74);
const quiet = () => { I.dlg.queue.length = 0; I.dlg.cur = null; I.cinema.idle = 0; };
quiet();

// ── the lens, and our own sky and sun (as in reel2)
const CAM = new THREE.Vector3(p.pos.x, I.SKY_LIMIT - 300, p.pos.z), FWD = new THREE.Vector3(0, 0, -1);
const TAN = Math.tan(FOV / 2 * Math.PI / 180), BACK = DIST * 1.6, halfB = TAN * BACK;
const skyMat = new THREE.ShaderMaterial({
  depthWrite: true, depthTest: false, fog: false, uniforms: { uR: { value: SUN_R / SQ } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `uniform float uR; varying vec2 vUv;
    void main(){
      vec2 q = vUv - 0.5; float r = length(q) * 2.0, d = length(q) / uR;
      vec3 sky = mix(vec3(0.20, 0.075, 0.045), vec3(0.085, 0.03, 0.022), smoothstep(0.2, 1.3, r));
      sky += vec3(0.16, 0.05, 0.015) * exp(-max(d - 1.0, 0.0) * 2.6) * step(1.0, d);
      vec3 sun = mix(vec3(1.55, 1.2, 0.42), vec3(1.5, 0.72, 0.14), smoothstep(0.0, 0.8, d));
      sun = mix(sun, vec3(1.25, 0.26, 0.05), smoothstep(0.8, 1.0, d));
      sun *= 1.0 - 0.18 * smoothstep(0.3, 1.0, vUv.y - 0.5 + d * 0.3);
      gl_FragColor = vec4(mix(sky, sun, 1.0 - smoothstep(0.985, 1.015, d)), 1.0);
    }`,
});
const backdrop = new THREE.Mesh(new THREE.PlaneGeometry(halfB * 2 * SQ, halfB * 2 * SQ), skyMat);
backdrop.position.copy(CAM).addScaledVector(FWD, BACK).add(new THREE.Vector3(halfB * 0.12, halfB * 0.05, 0));
backdrop.renderOrder = -1; backdrop.frustumCulled = false;
I.scene.add(backdrop);

// ── the burning: a uniform clock, and for every point of him the moment the fire reaches it (0 = first, 1 = last)
const UT = { value: 0 }, UH = { value: 0 };
const BURN = `uniform float uT, uHeat; varying float vRel;`;
function burnMat(base) {
  const m = base.clone(), baseHook = base.onBeforeCompile;
  m.onBeforeCompile = sh => {
    baseHook.call(base, sh);
    sh.uniforms.uT = UT; sh.uniforms.uHeat = UH;
    sh.vertexShader = sh.vertexShader.replace('void main() {', `attribute float aRel; ${BURN}\nvoid main() {\n  vRel = aRel;`);
    sh.fragmentShader = sh.fragmentShader.replace('void main() {', `${BURN}\nvoid main() {`)
      .replace('gl_FragColor.a = 0.5;', `
        { float at = ${BREAK.toFixed(3)} + vRel * ${DUR.toFixed(3)}, left = at - uT;
          if (left < 0.0) discard;                                   // burnt away
          float L = dot(gl_FragColor.rgb, vec3(0.33));
          // a black shape against the sun, with the faintest warmth in its fire; as the burning nears, the rim warms
          vec3 c = vec3(0.045, 0.012, 0.008) + gl_FragColor.rgb * 0.03 + vec3(0.25, 0.06, 0.01) * uHeat * L;
          float edge = 1.0 - smoothstep(0.0, 0.2, left), front = 1.0 - smoothstep(0.0, 0.045, left);
          c = mix(c, vec3(1.9, 0.36, 0.05), edge);                  // the burning edge, deep orange-red so it shows against the sun…
          c = mix(c, vec3(2.0, 0.78, 0.14), front);                 // …and hotter right at the front
          gl_FragColor.rgb = c; }
        gl_FragColor.a = 0.5;`);
  };
  m.customProgramCacheKey = () => 'reel3-burn-' + base.type;
  return m;
}
const smooth = (x, y, z) => 0.5 + 0.5 * Math.sin(x * 0.9 + Math.sin(z * 1.3) * 1.7) * Math.cos(y * 1.1 + z * 0.7 + Math.sin(x * 0.5));   // a slow noise over his body
// let him settle into flight before reading his shape
for (let i = 0; i < 10; i++) I.step(1);
const G = I.phoenix.group; G.updateMatrixWorld(true);
const Ginv = new THREE.Matrix4().copy(G.matrixWorld).invert();
const statics = [], live = [], mats = new Map(), matFor = m => { if (!mats.has(m)) mats.set(m, burnMat(m)); return mats.get(m); };
const HEART = new THREE.Vector3(0, 0.2, -0.4), _v = new THREE.Vector3(), _m = new THREE.Matrix4();
let maxD = 1;
G.traverse(o => {
  if (!o.isMesh) return;
  const g = o.geometry;
  if (g.attributes.position.usage === THREE.DynamicDrawUsage) {
    const src = g, idx = src.index.array, n = idx.length, flat = new THREE.BufferGeometry();
    flat.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(n * 3), 3));
    for (const name of ['color', 'uv', 'normal']) if (src.attributes[name]) {
      const a = src.attributes[name], s = a.itemSize, arr = new Float32Array(n * s);
      for (let i = 0; i < n; i++) for (let k = 0; k < s; k++) arr[i * s + k] = a.array[idx[i] * s + k];
      flat.setAttribute(name, new THREE.Float32BufferAttribute(arr, s));
    }
    const cape = !src.attributes.color;
    if (cape) { const arr = new Float32Array(n * 3); flat.setAttribute('color', new THREE.Float32BufferAttribute(arr, 3)); }
    // tail plumes burn from the tips in toward him
    const rel = new Float32Array(n), uv = flat.attributes.uv.array;
    for (let i = 0; i < n; i++) rel[i] = 0.06 + (1 - Math.min(1, uv[i * 2] / 0.6)) * 0.62;
    flat.setAttribute('aRel', new THREE.Float32BufferAttribute(rel, 1));
    const mesh = new THREE.Mesh(flat, matFor(I.fireMat)); mesh.frustumCulled = false;
    o.parent.add(mesh); o.visible = false; mesh.visible = !cape;
    if (!cape) live.push({ src, flat, idx, o, mesh });
  } else {
    const flat = g.index ? g.toNonIndexed() : g.clone();
    _m.multiplyMatrices(Ginv, o.matrixWorld);
    const P = flat.attributes.position.array, n = P.length / 3, gp = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { _v.fromArray(P, i * 3).applyMatrix4(_m); gp.set([_v.x, _v.y, _v.z], i * 3); maxD = Math.max(maxD, _v.distanceTo(HEART)); }
    o.geometry = flat; o.material = matFor(o.material); o.frustumCulled = false;
    statics.push({ o, flat, gp });
  }
});
for (const S of statics) {   // the wingtips and the crest go first, the heart last, with the fire wandering a little
  const gp = S.gp, n = gp.length / 3, rel = new Float32Array(n);
  for (let i = 0; i < n; i++) { _v.fromArray(gp, i * 3); rel[i] = Math.min(1, Math.max(0, (1 - _v.distanceTo(HEART) / maxD) * 0.8 + smooth(_v.x, _v.y, _v.z) * 0.22)); }
  S.flat.setAttribute('aRel', new THREE.Float32BufferAttribute(rel, 1));
}
function syncLive() {
  for (const L of live) {
    L.mesh.position.copy(L.o.position); L.mesh.quaternion.copy(L.o.quaternion); L.mesh.scale.copy(L.o.scale);
    const S = L.src.attributes.position.array, D = L.flat.attributes.position.array, idx = L.idx;
    for (let i = 0; i < idx.length; i++) { D[i * 3] = S[idx[i] * 3]; D[i * 3 + 1] = S[idx[i] * 3 + 1]; D[i * 3 + 2] = S[idx[i] * 3 + 2]; }
    L.flat.attributes.position.needsUpdate = true;
    L.mesh.updateMatrixWorld(true);
  }
}
// no ribbons, no light of his own on a painted sky
I.scene.traverse(o => {
  const m = o.material, g = o.geometry;
  if (o.isMesh && m && m.isMeshBasicMaterial && m.vertexColors && m.blending === THREE.AdditiveBlending && g && g.index && g.attributes.position.usage === THREE.DynamicDrawUsage && !mats.has(m)) m.visible = false;
});
I.phoenix.light.intensity = 0; I.phoenix.light.visible = false;

// ── the dust: grains sampled over his whole surface, each lifting off at the moment the fire reaches it
const ND = num('grains', 28000);
const area = (P, i) => { const a = new THREE.Vector3().fromArray(P, i), b = new THREE.Vector3().fromArray(P, i + 3).sub(a), c = new THREE.Vector3().fromArray(P, i + 6).sub(a); return b.cross(c).length() / 2; };
const pools = [...statics.map(S => ({ kind: 's', S, geo: S.flat })), ...live.map(L => ({ kind: 'l', L, geo: L.flat }))];
let total = 0; for (const pl of pools) { const P = pl.geo.attributes.position.array; pl.cdf = []; let a = 0; for (let i = 0; i < P.length; i += 9) { a += Math.max(1e-6, pl.kind === 's' ? area(P, i) : 0.05); pl.cdf.push(a); } pl.area = a; total += a; }
const grains = [];
for (const pl of pools) {
  const n = Math.round(ND * pl.area / total);
  const rel = pl.geo.attributes.aRel.array;
  for (let k = 0; k < n; k++) {
    const x = rng() * pl.area; let lo = 0, hi = pl.cdf.length - 1; while (lo < hi) { const mid = (lo + hi) >> 1; if (pl.cdf[mid] < x) lo = mid + 1; else hi = mid; }
    let b0 = rng(), b1 = rng(); if (b0 + b1 > 1) { b0 = 1 - b0; b1 = 1 - b1; }
    const t3 = lo * 3, r = rel[t3] * (1 - b0 - b1) + rel[t3 + 1] * b0 + rel[t3 + 2] * b1;
    grains.push({ pl, tri: lo, b0, b1, at: BREAK + r * DUR + (rng() - 0.5) * 0.04 });
  }
}
grains.sort((a, b) => a.at - b.at);
const dG = new THREE.BufferGeometry(), N = grains.length;
const aStart = new Float32Array(N * 3), aVel = new Float32Array(N * 3), aT0 = new Float32Array(N).fill(1e6), aSeed = new Float32Array(N * 4);
for (let i = 0; i < N; i++) aSeed.set([rng(), rng(), rng(), rng()], i * 4);
// (BufferAttribute, not Float32BufferAttribute: that one copies the array, and these are written every frame)
dG.setAttribute('position', new THREE.BufferAttribute(aStart, 3));
dG.setAttribute('aVel', new THREE.BufferAttribute(aVel, 3));
dG.setAttribute('aT0', new THREE.BufferAttribute(aT0, 1));
dG.setAttribute('aSeed', new THREE.BufferAttribute(aSeed, 4));
const PX = num('px', 3.6) * cv.height / 2160;
const dustMat = new THREE.ShaderMaterial({
  transparent: true, depthWrite: false, depthTest: false, fog: false,
  uniforms: { uT: UT, uPx: { value: PX }, uWind: { value: new THREE.Vector3(2.4, 1.5, 0) } },
  vertexShader: `attribute vec3 aVel; attribute float aT0; attribute vec4 aSeed; uniform float uT, uPx; uniform vec3 uWind; varying float vAge;
    void main(){
      float life = 1.15 + aSeed.w * 1.5, age = uT - aT0;
      if (age < 0.0 || age > life) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); gl_PointSize = 0.0; return; }
      // thrown off with his speed, which the air soon takes away; then carried on the wind, curling as it goes
      vec3 p = position + aVel * (1.0 - exp(-age * 1.4)) / 1.4 + uWind * age * age * 0.5;
      float a = age * (1.0 + aSeed.x);
      p += vec3(sin(a * 1.9 + aSeed.x * 6.28), sin(a * 1.4 + aSeed.y * 6.28) * 0.7, sin(a * 1.6 + aSeed.z * 6.28)) * (1.2 + aSeed.w * 2.6) * age;   // (spread wide, so it thins into dust instead of smoke)
      vAge = age / life;
      vec4 mv = modelViewMatrix * vec4(p, 1.0);
      gl_Position = projectionMatrix * mv;
      gl_PointSize = uPx * (0.55 + aSeed.y * 0.9) * (1.0 + 0.8 * (1.0 - smoothstep(0.0, 0.08, vAge))) * (1.0 - smoothstep(0.65, 1.0, vAge));
    }`,
  fragmentShader: `varying float vAge;
    void main(){
      vec2 q = gl_PointCoord - 0.5; float r = length(q); if (r > 0.5) discard;
      // a spark as it leaves, then glowing ash, then grey dust that thins to nothing
      vec3 ember = mix(vec3(2.0, 0.8, 0.16), vec3(1.6, 0.28, 0.05), smoothstep(0.0, 0.1, vAge));
      vec3 c = mix(ember, vec3(0.42, 0.29, 0.21), smoothstep(0.06, 0.35, vAge));
      float a = (1.0 - smoothstep(0.35, 0.5, r)) * (1.0 - smoothstep(0.4, 1.0, vAge)) * 0.8;
      gl_FragColor = vec4(c, a);
    }`,
});
const dust = new THREE.Points(dG, dustMat); dust.frustumCulled = false; dust.renderOrder = 5;
I.scene.add(dust);
let gNext = 0;
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3();
function releaseGrains(u, vel) {
  let changed = false;
  while (gNext < N && grains[gNext].at <= u) {
    const g = grains[gNext], pl = g.pl, P = pl.geo.attributes.position.array, i = g.tri * 9;
    _a.fromArray(P, i); _b.fromArray(P, i + 3); _c.fromArray(P, i + 6);
    _v.copy(_a).multiplyScalar(1 - g.b0 - g.b1).addScaledVector(_b, g.b0).addScaledVector(_c, g.b1);
    _v.applyMatrix4(pl.kind === 's' ? pl.S.o.matrixWorld : pl.L.mesh.matrixWorld);
    aStart.set([_v.x, _v.y, _v.z], gNext * 3);
    aVel.set([vel.x * 0.8 + (rng() - 0.5) * 7, vel.y * 0.8 + (rng() - 0.35) * 7, vel.z * 0.8 + (rng() - 0.5) * 7], gNext * 3);
    aT0[gNext] = g.at;
    gNext++; changed = true;
  }
  if (changed) { dG.attributes.position.needsUpdate = true; dG.attributes.aVel.needsUpdate = true; dG.attributes.aT0.needsUpdate = true; }
}
function resetGrains() { aT0.fill(1e6); dG.attributes.aT0.needsUpdate = true; gNext = 0; }

// ── how he flies. The wingbeat phase runs at a beat rate that changes: steady strokes coming in, a glide as he reaches
//    the light, then faster, harder strokes as he burns. Precomputed so every loop is the same.
const rate = u => (u < 1.9 ? 1 / 0.66 : u < 2.55 ? 0 : u < BREAK ? 1 / 0.62 : 1 / 0.5);
const glideW = u => { const a = Math.min(1, Math.max(0, (u - 1.75) / 0.3)), b = Math.min(1, Math.max(0, (u - 2.45) / 0.25)); return a * (1 - b); };
const PH = []; { let ph = 0; for (let i = 0; i <= T * 600 + 600; i++) { PH.push(ph); ph += rate(i / 600) / 600; } }
const phaseAt = u => PH[Math.min(PH.length - 1, Math.round(u * 600))];
function wingPose(u) {
  const ph = phaseAt(u) % 1;
  let f, fold, sweep, stretch;
  if (ph < 0.42) {   // the downstroke: fast, wings long and stretched, pulling the air down
    const s = ph / 0.42, e = 0.5 - 0.5 * Math.cos(Math.PI * s);
    f = 0.98 - 1.6 * e; fold = 0.04; sweep = 0.02; stretch = 1.12 + 0.22 * Math.sin(Math.PI * s);
  } else {           // the recovery: slower, the hands folding in and sweeping back to slip up through the air
    const s = (ph - 0.42) / 0.58, e = 0.5 - 0.5 * Math.cos(Math.PI * s);
    f = -0.62 + 1.6 * e; fold = Math.sin(Math.PI * s) * 0.9; sweep = Math.sin(Math.PI * s) * 0.32; stretch = 1.02;
  }
  const g = glideW(u);   // the glide: shoulders up, hands down a little, like a gull riding the air
  return { f: f * (1 - g) + 0.3 * g, fold: fold * (1 - g) - 0.22 * g, sweep: sweep * (1 - g) + 0.04 * g, stretch: stretch * (1 - g) + 1.14 * g, ph, g };
}
const A = { x: num('ax', -1.05), y: num('ay', -1.15), d: 0.6 }, B = { x: 0.2, y: 0.12, d: 1.12 };
function at(u) {
  const s = Math.min(u / 3.5, 1.3), e = 1 - Math.pow(1 - Math.min(s, 1), 1.6) + Math.max(0, s - 1) * 0.3;
  const W = wingPose(u), lift = (1 - W.g) * 0.018 * Math.sin(2 * Math.PI * (W.ph - 0.08));   // the body rises on each downstroke
  const x = A.x + (B.x - A.x) * e, y = A.y + (B.y - A.y) * e + 0.08 * Math.sin(e * Math.PI) + lift, d = DIST * (A.d + (B.d - A.d) * e);
  return new THREE.Vector3(CAM.x + x * TAN * d, CAM.y + y * TAN * d, CAM.z - d);
}

// every frame, after the game has posed him and just before it draws: our wingbeat, his tail, and the dust he sheds
let curU = 0, curVel = new THREE.Vector3();
I.scene.onBeforeRender = () => {
  const W = wingPose(curU);
  I.setWings(W.f, W.fold, W.sweep, W.stretch);
  G.updateMatrixWorld(true);
  syncLive();
  releaseGrains(curU, curVel);
};
// ?solo=1: the lens sees only him, his dust and the painted sky (for wide frames)
if (Q.get('solo') === '1') {
  I.camera.layers.set(5);
  G.traverse(o => o.layers.enable(5)); backdrop.layers.enable(5); dust.layers.enable(5);
}

let prevU = -1;
function hold(t) {
  quiet();
  const u = t % T;
  if (u < prevU) { seed = 11; resetGrains(); }
  prevU = u; curU = u; UT.value = u;
  UH.value = Math.min(1, Math.max(0, (u - (BREAK - 0.9)) / 0.9));
  const w0 = at(u), w1 = at(u + 1 / 60), dir = w1.clone().sub(w0);
  curVel.copy(dir).multiplyScalar(60);
  const W = wingPose(u);
  p.form = 'phoenix'; p.cine = null; p.flame = 1; p.burnout = false; p.sub = null; p.wings = false;
  p.pos.copy(w0); p.yaw = Math.atan2(-dir.x, -dir.z) * 0.35;
  p.pitch = 0.95 + 0.05 * Math.sin(2 * Math.PI * W.ph + 1.2) * (1 - W.g) - 0.08 * W.g;
  p.bank = -0.12 + 0.09 * Math.sin(u * 1.3) + 0.04 * Math.sin(u * 3.1 + 1) + (u > BREAK ? 0.12 * Math.sin((u - BREAK) * 5.5) : 0);   // he lurches as it takes him
  p.speed = 30; p.vy = 0;
  I.dbgCam.on = true; I.dbgCam.fov = FOV; I.dbgCam.fog = 1e6;
  I.dbgCam.p.copy(CAM); I.dbgCam.l.copy(CAM).addScaledVector(FWD, 100);
}
async function capture() {
  const url = cv.toDataURL('image/jpeg', 0.94), bin = atob(url.slice(url.indexOf(',') + 1)), u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  const r = await fetch(CAP + PRE + String(R.frame).padStart(5, '0') + '.jpg', { method: 'POST', body: new Blob([u8], { type: 'image/jpeg' }) });
  if (!r.ok) throw new Error('capture server said ' + r.status);
}
R.step = t => { hold(t); I.step(1); };
R.log.push(['grains', N, 'meshes', statics.length, live.length]);
for (let f = 0; f < Math.round(WARM * FPS); f++) R.step(f / FPS);
if (LOOK) { R.done = true; }
else (async () => {
  try { for (; R.frame < R.total && !R.err; R.frame++) { R.step(WARM + R.frame / FPS); await capture(); } } catch (e) { R.err = String(e); }
  R.done = true;
})();
