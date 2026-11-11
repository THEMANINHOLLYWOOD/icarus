// "The rise": an 8-second loop for social posts, made in the game itself (the ASCII look, the red bird drawn in the letters
// ICARUS). He climbs toward the sun; burns white; breaks apart into burning pieces that fall away; the pieces come back up
// and he is whole again, and still climbing. Not deployed.
//
// Use: start `node tools/cap.mjs`, load the game fresh in the preview at the size you want (do not begin it), then:
//   await import('/tools/reel.js?' + Date.now())                 → window.REEL; frames go to tools/cap/r00000.jpg …
//   options: ?secs=8.5 (recorded length)  &warm=8 (unrecorded warm-up)  &look=1 (no capture: set up and stop, for tuning)
import * as THREE from 'three';
const Q = new URLSearchParams(import.meta.url.split('?')[1] || '');
const FPS = 60, T = 8, SECS = +(Q.get('secs') || T + 0.5), WARM = +(Q.get('warm') ?? T), LOOK = Q.get('look') === '1', CAP = 'http://127.0.0.1:8124/f/';
const I = window.__icarus, p = I.player, cv = document.getElementById('c');
const R = window.REEL = { frame: 0, total: Math.round(FPS * SECS), done: false, err: null, log: [] };
window.requestAnimationFrame = () => 0;

// ── a random number source that starts over every loop, so each 8 s is made of the same chances
let seed = 1;
const rng = () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
Math.random = rng;

// ── begin as ICARUS, past the prologue, into the open sky
const ni = document.getElementById('nameInput'); ni.value = 'ICARUS'; ni.dispatchEvent(new Event('input'));
ni.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true }));
I.step(3); await new Promise(r => setTimeout(r, 1500));
if (I.state === 'prologue') I.endPrologue();
for (let i = 0; i < 120 && I.state !== 'play'; i++) I.step(30);
I.story.phase = 'gods'; I.flags.morphed = true; I.setStorm(0); I.setDay(+(Q.get('day') || 0.3));
const CB = +(Q.get('cb') || 46), CL = +(Q.get('cl') || 24);
const quiet = () => { I.dlg.queue.length = 0; I.dlg.cur = null; I.cinema.idle = 0; };
quiet();

// where he hangs in the sky: well above the cloud, below where the sun burns
const ALT = I.SKY_LIMIT - 260, HOME = new THREE.Vector3(I.player.pos.x, ALT, I.player.pos.z);
// face the sun: the lens behind and below him looks straight along his climb into it
for (let i = 0; i < 4; i++) I.step(1);
const sd = I.sunDir.clone(), YAW = Math.atan2(-sd.x, -sd.z) + +(Q.get('yo') || 0);   // (yaw 0 looks down -z; yo turns him off the sun's line)
R.log.push(['sun', +sd.x.toFixed(2), +sd.y.toFixed(2), +sd.z.toFixed(2)]);

// ── the shatter. Every piece of fire on him gets a material that, as uBreak goes 0 → 1, tears each triangle off where it
//    is, tumbles and shrinks it, flings it out from his heart and lets it fall; uHeat burns the whole bird toward white.
const U = { uBreak: { value: 0 }, uHeat: { value: 0 }, uCore: { value: new THREE.Vector3() } };
function shardMat(base) {
  const m = base.clone();
  const baseHook = base.onBeforeCompile;
  m.onBeforeCompile = sh => {
    baseHook.call(base, sh);
    Object.assign(sh.uniforms, U);
    const decl = 'uniform float uBreak, uHeat; uniform vec3 uCore; varying float vK;';
    sh.vertexShader = sh.vertexShader.replace('void main() {', `attribute vec3 aCenter; attribute vec4 aRand; ${decl}\nvoid main() {`)
      .replace('#include <project_vertex>', `
        vec4 wp = modelMatrix * vec4(transformed, 1.0);
        vec3 wc = (modelMatrix * vec4(aCenter, 1.0)).xyz;
        float kr = max(uBreak * 1.8 - aRand.w * 0.8, 0.0), k = min(kr, 1.0);   // (kr keeps growing past 1: broken pieces go on falling)
        vK = k;
        if (kr > 0.0) {
          vec3 rel = wp.xyz - wc;
          vec3 ax = normalize(aRand.xyz + vec3(0.0013, 0.0021, 0.0007));
          float ang = k * (4.0 + 10.0 * fract(aRand.w * 7.31));
          rel = rel * cos(ang) + cross(ax, rel) * sin(ang) + ax * dot(ax, rel) * (1.0 - cos(ang));
          rel *= 1.0 + 0.6 * k * (1.0 - k) - 0.35 * k;   // pieces open out a little as they tear, then burn smaller
          vec3 outw = normalize(wc - uCore + aRand.xyz * 0.9 + vec3(0.0, 0.001, 0.0));
          float tt = kr * 1.25;
          wp.xyz = wc + outw * (6.5 * tt) + aRand.xyz * (3.5 * tt) + vec3(0.0, -1.7 * tt * tt, 0.0) + rel;
        }
        vec4 mvPosition = viewMatrix * wp;
        gl_Position = projectionMatrix * mvPosition;`);
    sh.fragmentShader = sh.fragmentShader.replace('void main() {', `${decl}\nvoid main() {`)
      .replace('gl_FragColor.a = 0.5;', `
        { float hot = clamp(uHeat + vK * (1.0 - vK) * 2.4, 0.0, 1.0);
          float L = dot(gl_FragColor.rgb, vec3(0.33));
          // hotter is orange, then gold at the very edge of breaking — never white, so it stays his colour and no glare
          gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(1.9, 0.62, 0.12) * (0.7 + 0.5 * L), hot * 0.7);
          gl_FragColor.rgb = min(gl_FragColor.rgb, vec3(2.0, 0.9, 0.35));
          gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(1.15, 0.2, 0.05), smoothstep(0.72, 1.0, vK)); }   // burnt down to a dull red ember, still falling
        gl_FragColor.a = 0.5;`);
  };
  m.customProgramCacheKey = () => 'reel-shard-' + (base.type);
  return m;
}
// per-triangle attributes for a geometry laid out as plain triangles
function tagTris(g) {
  const P = g.attributes.position.array, n = P.length / 9, C = new Float32Array(n * 9), Rn = new Float32Array(n * 12);
  let maxD = 0; const d = new Float32Array(n);
  for (let t = 0; t < n; t++) { const o = t * 9; d[t] = Math.hypot((P[o] + P[o + 3] + P[o + 6]) / 3, (P[o + 1] + P[o + 4] + P[o + 7]) / 3, (P[o + 2] + P[o + 5] + P[o + 8]) / 3); maxD = Math.max(maxD, d[t]); }
  for (let t = 0; t < n; t++) {
    const o = t * 9, cx = (P[o] + P[o + 3] + P[o + 6]) / 3, cy = (P[o + 1] + P[o + 4] + P[o + 7]) / 3, cz = (P[o + 2] + P[o + 5] + P[o + 8]) / 3;
    // the outermost go first — wingtips, tail ends — and the heart last
    const r = [rng() * 2 - 1, rng() * 2 - 1, rng() * 2 - 1, Math.min(1, Math.max(0, 1 - d[t] / (maxD || 1) + (rng() - 0.5) * 0.35))];
    for (let v = 0; v < 3; v++) { C.set([cx, cy, cz], o + v * 3); Rn.set(r, t * 12 + v * 4); }
  }
  g.setAttribute('aCenter', new THREE.Float32BufferAttribute(C, 3));
  g.setAttribute('aRand', new THREE.Float32BufferAttribute(Rn, 4));
}
const mats = new Map();
const matFor = m => { if (!mats.has(m)) mats.set(m, shardMat(m)); return mats.get(m); };
const live = [];   // meshes whose shape the game rewrites every frame (tail plumes, cape)
I.phoenix.group.traverse(o => {
  if (!o.isMesh) return;
  const g = o.geometry;
  if (g.attributes.position.usage === THREE.DynamicDrawUsage) {
    // rebuilt each frame from the game's own (indexed) copy, just before it is drawn
    const src = g, idx = src.index.array;
    const flat = new THREE.BufferGeometry();
    const n = idx.length;
    flat.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(n * 3), 3));
    for (const name of ['color', 'uv', 'normal']) if (src.attributes[name]) {
      const a = src.attributes[name], s = a.itemSize, arr = new Float32Array(n * s);
      for (let i = 0; i < n; i++) for (let k = 0; k < s; k++) arr[i * s + k] = a.array[idx[i] * s + k];
      flat.setAttribute(name, new THREE.Float32BufferAttribute(arr, s));
    }
    if (!flat.attributes.color) { const arr = new Float32Array(n * 3); for (let i = 0; i < n; i++) arr.set([1.4, 0.16, 0.06], i * 3); flat.setAttribute('color', new THREE.Float32BufferAttribute(arr, 3)); }
    flat.setAttribute('aCenter', new THREE.Float32BufferAttribute(new Float32Array(n * 3), 3));
    const Rn = new Float32Array(n * 4); for (let t = 0; t < n / 3; t++) { const r = [rng() * 2 - 1, rng() * 2 - 1, rng() * 2 - 1, rng() * 0.5]; for (let v = 0; v < 3; v++) Rn.set(r, (t * 3 + v) * 4); }
    flat.setAttribute('aRand', new THREE.Float32BufferAttribute(Rn, 4));
    const mesh = new THREE.Mesh(flat, matFor(I.fireMat)); mesh.frustumCulled = false;
    o.parent.add(mesh); o.visible = false;
    live.push({ src, flat, idx, o, mesh });
  } else {
    const flat = g.index ? g.toNonIndexed() : g.clone();
    tagTris(flat);
    o.geometry = flat; o.material = matFor(o.material);
  }
});
// copy the game's freshly built tail and cape shapes into their shard twins (called right before the frame is drawn)
function syncLive() {
  for (const L of live) {
    L.mesh.position.copy(L.o.position); L.mesh.quaternion.copy(L.o.quaternion); L.mesh.scale.copy(L.o.scale);
    const S = L.src.attributes.position.array, D = L.flat.attributes.position.array, C = L.flat.attributes.aCenter.array, idx = L.idx;
    for (let i = 0; i < idx.length; i++) { D[i * 3] = S[idx[i] * 3]; D[i * 3 + 1] = S[idx[i] * 3 + 1]; D[i * 3 + 2] = S[idx[i] * 3 + 2]; }
    for (let t = 0; t < idx.length; t += 3) for (let k = 0; k < 3; k++) { const c = (D[t * 3 + k] + D[t * 3 + 3 + k] + D[t * 3 + 6 + k]) / 3; C[t * 3 + k] = C[t * 3 + 3 + k] = C[t * 3 + 6 + k] = c; }
    L.flat.attributes.position.needsUpdate = true; L.flat.attributes.aCenter.needsUpdate = true;
  }
}
// the game draws inside step(); hook the draw of the first shard twin (or the body) to sync just in time
const hookMesh = live.length ? live[0].mesh : null;
if (hookMesh) hookMesh.onBeforeRender = syncLive;
R.log.push(['pieces', live.length, mats.size]);
// the visible wind and the wingtip ribbons are made for a moving lens; in a held shot they only cut across the picture
let ribbons = 0;
I.scene.traverse(o => {
  const m = o.material, g = o.geometry;
  if (o.isMesh && m && m.isMeshBasicMaterial && m.vertexColors && m.blending === THREE.AdditiveBlending && g && g.index && g.attributes.position.usage === THREE.DynamicDrawUsage && !mats.has(m)) { m.visible = false; ribbons++; }
});
R.log.push(['ribbons hidden', ribbons]);

// ── the timeline (seconds within the loop)
const ease = x => x * x * (3 - 2 * x), seg = (t, a, b) => Math.min(1, Math.max(0, (t - a) / (b - a)));
function scene(t) {
  const u = t % T;
  // heat: rising from 2.2 s to the break; gone again as he re-forms
  U.uHeat.value = ease(seg(u, 2.2, 3.4)) * (1 - ease(seg(u, 3.4, 4.4))) * 0.9 + ease(seg(u, 5.2, 6.4)) * (1 - ease(seg(u, 6.4, 7.2))) * 0.6;
  // break: 3.0 → 4.6 out; 5.4 → 6.8 back
  // 3.0 → 5.4 out and falling (past 1, the pieces just keep falling); 5.4 → 6.8 they come back up from wherever they got to
  const OUT = 1.5;
  U.uBreak.value = u < 3 ? 0 : u < 5.4 ? Math.pow(seg(u, 3, 5.4), 1.25) * OUT : u < 6.8 ? OUT * (1 - ease(seg(u, 5.4, 6.8))) : 0;
  return u;
}

// ── the frame: hold him in place, climbing; the world rushes down past him; the lens sways with the loop
let prevU = -1, fired = {};
function hold(t) {
  quiet();
  const u = scene(t), w = 2 * Math.PI * u / T;
  if (u < prevU) { seed = 1; fired = {}; }   // a new loop: the same chances as the last
  prevU = u;
  p.form = 'phoenix'; p.cine = null; p.flame = 1; p.burnout = false; p.sub = null; p.wings = false;
  p.pos.copy(HOME); p.yaw = YAW + 0.12 * Math.sin(w); p.pitch = 1.15; p.speed = 75; p.bank = 0.18 * Math.sin(w + 1.1);
  U.uCore.value.copy(HOME);
  // the lens: behind and below him, looking up past him into the sun
  const fx = -Math.sin(YAW), fz = -Math.cos(YAW), back = CB + 3 * Math.sin(w * 2), side = 7 * Math.sin(w), low = CL + 2 * Math.cos(w);
  I.dbgCam.on = true; I.dbgCam.fov = 52;
  I.dbgCam.p.set(HOME.x - fx * back + fz * side, HOME.y - low, HOME.z - fz * back - fx * side);
  I.dbgCam.l.set(HOME.x + fx * 6, HOME.y + 9, HOME.z + fz * 6);
  // the air going down past him: thin dots far out, embers close in
  const H = HOME, scatter = U.uBreak.value;
  for (let i = 0; i < 5; i++) { const a = rng() * 6.283, r = 14 + rng() * 50; I.emit(H.x + Math.cos(a) * r, H.y + 20 + rng() * 40, H.z + Math.sin(a) * r, 0, -70 - rng() * 30, 0, 0.9, [0.8, 0.78, 0.75], 0, 0.5); }
  const n = scatter > 0.05 ? 1 : 3;
  for (let i = 0; i < n; i++) I.emit(H.x + (rng() - 0.5) * 6, H.y + (rng() - 0.5) * 4, H.z + (rng() - 0.5) * 6, (rng() - 0.5) * 10, -30 - rng() * 35, (rng() - 0.5) * 10, 1.0, [1.5, 0.4, 0.07], -2, 0);
  // the moments
  const spray = (n, sp, life, cols) => { for (let i = 0; i < n; i++) { let x = rng() * 2 - 1, y = rng() * 2 - 1, z = rng() * 2 - 1; const l = Math.hypot(x, y, z) || 1, v = sp * (0.4 + rng() * 0.6);
    I.emit(H.x + x / l * 2, H.y + y / l * 2, H.z + z / l * 2, x / l * v, y / l * v - 4, z / l * v, life * (0.6 + rng() * 0.6), cols[Math.floor(rng() * cols.length)], -4, 0); } };
  if (u >= 3.55 && !fired.blow) { fired.blow = true; spray(110, 9, 1.8, [[1.6, 0.22, 0.06], [1.7, 0.45, 0.1], [1.5, 0.7, 0.2]]); I.flash = 0.1; }
  if (u >= 6.7 && !fired.whole) { fired.whole = true; spray(60, 6, 0.9, [[1.7, 0.5, 0.12], [1.7, 0.25, 0.08]]); I.flash = 0.14; }
}

async function capture() {
  const url = cv.toDataURL('image/jpeg', 0.94), bin = atob(url.slice(url.indexOf(',') + 1)), u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  const r = await fetch(CAP + 'r' + String(R.frame).padStart(5, '0') + '.jpg', { method: 'POST', body: new Blob([u8], { type: 'image/jpeg' }) });
  if (!r.ok) throw new Error('capture server said ' + r.status);
}
R.step = t => { hold(t); I.step(1); };   // (for tuning by hand)
// warm up one whole loop unrecorded, so the sky is full of what the last loop left
const t0 = WARM;
for (let f = 0; f < Math.round(WARM * FPS); f++) R.step(f / FPS);
if (LOOK) { R.done = true; R.log.push(['look only']); }
else {
  (async () => {
    try {
      for (; R.frame < R.total && !R.err; R.frame++) { R.step(t0 + R.frame / FPS); await capture(); }
    } catch (e) { R.err = String(e); }
    R.done = true;
  })();
}
