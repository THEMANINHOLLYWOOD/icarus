// "Across the sun": a loop for social posts, after a telephoto shot of a bird crossing the setting sun. A huge sun on a
// dark sky; the bird comes in from the bottom left, beating its wings, a black shape against the disc; in front of the sun
// it catches fire and comes apart into embers that drift on and fall; the sun alone for a breath; and the next one comes
// in from the bottom left. No words. Not deployed.
//
// Use: start `node tools/cap.mjs`, load the game fresh in the preview at 1080x1080 (do not begin it), then:
//   await import('/tools/reel2.js?' + Date.now())     → window.REEL; frames go to tools/cap/s00000.jpg …
//   ?look=1 (no capture: set up only; then REEL.step(t) by hand)   &secs  &warm  &fov  &dist
import * as THREE from 'three';
const Q = new URLSearchParams(import.meta.url.split('?')[1] || '');
const FPS = 60, T = +(Q.get('T') || 7), SECS = +(Q.get('secs') || T + 0.5), WARM = +(Q.get('warm') ?? T), LOOK = Q.get('look') === '1', CAP = 'http://127.0.0.1:8124/f/';
const FOV = +(Q.get('fov') || 9), DIST = +(Q.get('dist') || 400);
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
if (I.state === 'prologue') I.endPrologue();
for (let i = 0; i < 120 && I.state !== 'play'; i++) I.step(30);
I.story.phase = 'gods'; I.flags.morphed = true; I.setStorm(0); I.setDay(0.74);
const quiet = () => { I.dlg.queue.length = 0; I.dlg.cur = null; I.cinema.idle = 0; };
quiet();

// ── the lens: high in the air, level, looking down -z through a long lens; behind everything, our own sky and sun
const CAM = new THREE.Vector3(p.pos.x, I.SKY_LIMIT - 300, p.pos.z), FWD = new THREE.Vector3(0, 0, -1);
const halfH = Math.tan(FOV / 2 * Math.PI / 180) * DIST;        // half the height of the picture, at the bird's distance
const BACK = DIST * 1.6, halfB = Math.tan(FOV / 2 * Math.PI / 180) * BACK;
const skyMat = new THREE.ShaderMaterial({
  depthWrite: true, depthTest: false, fog: false, uniforms: { uR: { value: 0 } },   // (drawn first, and it closes off the world beyond it)
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `uniform float uR; varying vec2 vUv;
    void main(){
      vec2 q = vUv - 0.5; float r = length(q) * 2.0;           // 0 at the middle, 1 at the edge of the square
      float d = length(q) / uR;                                // 1 at the rim of the sun
      // the sky: a deep brown-red, darker toward the corners, a little warmer under the sun
      vec3 sky = mix(vec3(0.20, 0.075, 0.045), vec3(0.085, 0.03, 0.022), smoothstep(0.2, 1.3, r));
      sky += vec3(0.16, 0.05, 0.015) * exp(-max(d - 1.0, 0.0) * 2.6) * step(1.0, d);   // the air glowing round it
      // the sun: gold in the middle, orange, a red rim, the edge just soft
      vec3 sun = mix(vec3(1.55, 1.2, 0.42), vec3(1.5, 0.72, 0.14), smoothstep(0.0, 0.8, d));
      sun = mix(sun, vec3(1.25, 0.26, 0.05), smoothstep(0.8, 1.0, d));
      sun *= 1.0 - 0.18 * smoothstep(0.3, 1.0, vUv.y - 0.5 + d * 0.3);                  // a hint of haze across its lower half
      float edge = 1.0 - smoothstep(0.985, 1.015, d);
      gl_FragColor = vec4(mix(sky, sun, edge), 1.0);
    }`,
});
const SUN_R = +(Q.get('sun') || 0.3);   // radius of the sun as a share of the picture's width
skyMat.uniforms.uR.value = SUN_R;
const SQ = +(Q.get('sq') || 1.6);   // the painted square, as a multiple of the picture's width
const backdrop = new THREE.Mesh(new THREE.PlaneGeometry(halfB * 2 * SQ, halfB * 2 * SQ), skyMat);
backdrop.position.copy(CAM).addScaledVector(FWD, BACK).add(new THREE.Vector3(halfB * 0.12, halfB * 0.05, 0));   // (the sun a touch right of centre and high, like the photograph)
backdrop.renderOrder = -1; backdrop.frustumCulled = false;
I.scene.add(backdrop);
skyMat.uniforms.uR.value = SUN_R / SQ;   // (into the painted square's own uv)

// ── the bird as a silhouette that can burn and come apart (the same tearing as the other reel, in world space)
const U = { uBreak: { value: 0 }, uHeat: { value: 0 }, uDark: { value: 1 }, uCore: { value: new THREE.Vector3() } };
function shardMat(base) {
  const m = base.clone();
  const baseHook = base.onBeforeCompile;
  m.onBeforeCompile = sh => {
    baseHook.call(base, sh);
    Object.assign(sh.uniforms, U);
    const decl = 'uniform float uBreak, uHeat, uDark; uniform vec3 uCore; varying float vK; varying float vGone;';
    sh.vertexShader = sh.vertexShader.replace('void main() {', `attribute vec3 aCenter; attribute vec4 aRand; ${decl}\nvoid main() {`)
      .replace('#include <project_vertex>', `
        vec4 wp = modelMatrix * vec4(transformed, 1.0);
        vec3 wc = (modelMatrix * vec4(aCenter, 1.0)).xyz;
        float kr = max(uBreak * 1.8 - aRand.w * 0.8, 0.0), k = min(kr, 1.0);
        vK = k; vGone = smoothstep(1.4, 2.6, kr);
        if (kr > 0.0) {
          vec3 rel = wp.xyz - wc;
          vec3 ax = normalize(aRand.xyz + vec3(0.0013, 0.0021, 0.0007));
          float ang = kr * (3.0 + 8.0 * fract(aRand.w * 7.31));
          rel = rel * cos(ang) + cross(ax, rel) * sin(ang) + ax * dot(ax, rel) * (1.0 - cos(ang));
          rel *= (1.0 + 0.5 * k * (1.0 - k)) * (1.0 - vGone);   // torn pieces open out, then burn down to nothing
          vec3 outw = normalize(wc - uCore + aRand.xyz * 0.9 + vec3(0.0, 0.001, 0.0));
          float tt = kr * 1.3;
          wp.xyz = wc + outw * (2.2 * tt) + aRand.xyz * (1.6 * tt) + vec3(0.0, -1.4 * tt * tt, 0.0) + rel;
        }
        vec4 mvPosition = viewMatrix * wp;
        gl_Position = projectionMatrix * mvPosition;`);
    sh.fragmentShader = sh.fragmentShader.replace('void main() {', `${decl}\nvoid main() {`)
      .replace('gl_FragColor.a = 0.5;', `
        { float L = dot(gl_FragColor.rgb, vec3(0.33));
          // whole, he is a dark shape against the sun, just warm at the edges of his fire; catching, he goes orange;
          // torn off, each piece flares and then dulls to a red ember as it falls
          vec3 dark = vec3(0.05, 0.012, 0.008) + gl_FragColor.rgb * 0.035;
          float hot = clamp(uHeat * (0.35 + 0.65 * L) + vK * (1.0 - vK) * 3.0, 0.0, 1.0);
          vec3 c = mix(dark, vec3(1.7, 0.55, 0.1) * (0.7 + 0.4 * L), hot);
          c = mix(c, vec3(1.1, 0.2, 0.05), smoothstep(0.7, 1.0, vK));
          gl_FragColor.rgb = min(c, vec3(1.9, 0.8, 0.3)); }
        gl_FragColor.a = 0.5;`);
  };
  m.customProgramCacheKey = () => 'reel2-shard-' + base.type;
  return m;
}
function tagTris(g) {
  const P = g.attributes.position.array, n = P.length / 9, C = new Float32Array(n * 9), Rn = new Float32Array(n * 12);
  let maxD = 0; const d = new Float32Array(n);
  for (let t = 0; t < n; t++) { const o = t * 9; d[t] = Math.hypot((P[o] + P[o + 3] + P[o + 6]) / 3, (P[o + 1] + P[o + 4] + P[o + 7]) / 3, (P[o + 2] + P[o + 5] + P[o + 8]) / 3); maxD = Math.max(maxD, d[t]); }
  for (let t = 0; t < n; t++) {
    const o = t * 9, cx = (P[o] + P[o + 3] + P[o + 6]) / 3, cy = (P[o + 1] + P[o + 4] + P[o + 7]) / 3, cz = (P[o + 2] + P[o + 5] + P[o + 8]) / 3;
    const r = [rng() * 2 - 1, rng() * 2 - 1, rng() * 2 - 1, Math.min(1, Math.max(0, 1 - d[t] / (maxD || 1) + (rng() - 0.5) * 0.35))];
    for (let v = 0; v < 3; v++) { C.set([cx, cy, cz], o + v * 3); Rn.set(r, t * 12 + v * 4); }
  }
  g.setAttribute('aCenter', new THREE.Float32BufferAttribute(C, 3));
  g.setAttribute('aRand', new THREE.Float32BufferAttribute(Rn, 4));
}
const mats = new Map(), matFor = m => { if (!mats.has(m)) mats.set(m, shardMat(m)); return mats.get(m); };
const live = [];
I.phoenix.group.traverse(o => {
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
    if (!flat.attributes.color) { const arr = new Float32Array(n * 3); for (let i = 0; i < n; i++) arr.set([1.4, 0.16, 0.06], i * 3); flat.setAttribute('color', new THREE.Float32BufferAttribute(arr, 3)); }
    flat.setAttribute('aCenter', new THREE.Float32BufferAttribute(new Float32Array(n * 3), 3));
    const Rn = new Float32Array(n * 4); for (let t = 0; t < n / 3; t++) { const r = [rng() * 2 - 1, rng() * 2 - 1, rng() * 2 - 1, rng() * 0.5]; for (let v = 0; v < 3; v++) Rn.set(r, (t * 3 + v) * 4); }
    flat.setAttribute('aRand', new THREE.Float32BufferAttribute(Rn, 4));
    const mesh = new THREE.Mesh(flat, matFor(I.fireMat)); mesh.frustumCulled = false;
    o.parent.add(mesh); o.visible = false;
    if (!src.attributes.color) mesh.visible = false;   // (the cape: in a silhouette it only hangs off him like a rope)
    live.push({ src, flat, idx, o, mesh });
  } else {
    const flat = g.index ? g.toNonIndexed() : g.clone();
    tagTris(flat);
    o.geometry = flat; o.material = matFor(o.material); o.frustumCulled = false;
  }
});
function syncLive() {
  for (const L of live) {
    L.mesh.position.copy(L.o.position); L.mesh.quaternion.copy(L.o.quaternion); L.mesh.scale.copy(L.o.scale);
    const S = L.src.attributes.position.array, D = L.flat.attributes.position.array, C = L.flat.attributes.aCenter.array, idx = L.idx;
    for (let i = 0; i < idx.length; i++) { D[i * 3] = S[idx[i] * 3]; D[i * 3 + 1] = S[idx[i] * 3 + 1]; D[i * 3 + 2] = S[idx[i] * 3 + 2]; }
    for (let t = 0; t < idx.length; t += 3) for (let k = 0; k < 3; k++) { const c = (D[t * 3 + k] + D[t * 3 + 3 + k] + D[t * 3 + 6 + k]) / 3; C[t * 3 + k] = C[t * 3 + 3 + k] = C[t * 3 + 6 + k] = c; }
    L.flat.attributes.position.needsUpdate = true; L.flat.attributes.aCenter.needsUpdate = true;
  }
}
// his wingbeat, set right before the frame is drawn (the game sets its own pose each step; this one wins): eight full
// strokes to a loop, a deep downstroke with the hands swept and the wings stretched, and the high recovery of the photograph
let curU = 0;
const BEAT = T / 8;
I.scene.onBeforeRender = () => {
  const ph = (curU % BEAT) / BEAT, s = Math.sin(ph * Math.PI * 2);
  const k = 1 - Math.min(1, U.uBreak.value * 1.5);   // (broken, the pieces keep whatever pose they had)
  if (k > 0) {
    I.setWings(0.12 + 0.9 * s, Math.max(0, s) * 0.55 + 0.1, 0.05 + Math.max(0, -s) * 0.15, 1.1 + Math.max(0, -s) * 0.3);
    I.phoenix.group.updateMatrixWorld(true);
  }
  syncLive();
};
// no wind ribbons or wingtip ribbons in a held shot; no light from him on a sky that is painted
I.scene.traverse(o => {
  const m = o.material, g = o.geometry;
  if (o.isMesh && m && m.isMeshBasicMaterial && m.vertexColors && m.blending === THREE.AdditiveBlending && g && g.index && g.attributes.position.usage === THREE.DynamicDrawUsage && !mats.has(m)) m.visible = false;
});
I.phoenix.light.intensity = 0; I.phoenix.light.visible = false;
// ?solo=1: the lens sees only him, his embers and the painted sky (for a wide frame, where the far world shows past the edges)
if (Q.get('solo') === '1') {
  I.camera.layers.set(5);
  I.phoenix.group.traverse(o => o.layers.enable(5)); backdrop.layers.enable(5);
  I.scene.traverse(o => { if (o.isPoints) o.layers.enable(5); });
}

// ── his way across: in from the bottom left, rising, across the face of the sun; where it burns him
const ease = x => x * x * (3 - 2 * x), seg = (t, a, b) => Math.min(1, Math.max(0, (t - a) / (b - a)));
const PITCH = +(Q.get("pitch") || 0.95), BREAK = +(Q.get("brk") || 3.1), YO = +(Q.get('yo') || 0), BANK = +(Q.get('bank') || -0.12);   // flying away from the lens into the sun: we see his back and both wings
// in picture units (−1…1 across, −1…1 up) and metres from the lens: he enters big at the bottom left and climbs away into the sun
const A = { x: -1.05, y: -1.15, d: 0.62 }, B = { x: 0.2, y: 0.12, d: 1.15 }, SUNC = { x: 0.12, y: 0.05 };
function at(u) {
  const s = Math.min(u / 3.4, 1.25), e = 1 - Math.pow(1 - Math.min(s, 1), 1.6) + Math.max(0, s - 1) * 0.35;   // quick in, easing as he reaches the light
  const x = A.x + (B.x - A.x) * e, y = A.y + (B.y - A.y) * e + 0.08 * Math.sin(e * Math.PI), d = DIST * (A.d + (B.d - A.d) * e);
  const t = Math.tan(FOV / 2 * Math.PI / 180);
  return new THREE.Vector3(CAM.x + x * t * d, CAM.y + y * t * d, CAM.z - d);
}
function timeline(u) {
  U.uHeat.value = ease(seg(u, BREAK - 0.7, BREAK + 0.15));
  U.uBreak.value = u < BREAK ? 0 : Math.pow(seg(u, BREAK, BREAK + 2.6), 1.1) * 1.7;
}

// ── the frame
let prevU = -1, fired = {}, held = false;
const key = (code, down) => dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', { code, key: code, bubbles: true }));
function hold(t) {
  quiet();
  const u = t % T; curU = u;
  if (u < prevU) { seed = 7; fired = {}; }
  prevU = u;
  timeline(u);
  const w0 = at(u), w1 = at(u + 0.05), dir = w1.clone().sub(w0);
  p.form = 'phoenix'; p.cine = null; p.flame = 1; p.burnout = false; p.sub = null; p.wings = false;
  p.pos.copy(w0); p.yaw = Math.atan2(-dir.x, -dir.z) * 0.35 + YO; p.pitch = PITCH + 0.06 * Math.sin(u * 2.3); p.speed = 30; p.bank = BANK + 0.12 * Math.sin(u * 1.7); p.vy = 0;
  U.uCore.value.copy(w0);
  I.dbgCam.on = true; I.dbgCam.fov = FOV; I.dbgCam.fog = 1e6;
  I.dbgCam.p.copy(CAM); I.dbgCam.l.copy(CAM).addScaledVector(FWD, 100);
  // embers: a few off him as he flies, a fall of them when he goes
  const H = w0;
  if (u < BREAK + 0.3 && rng() < 0.5) I.emit(H.x - 3 + rng() * 2, H.y + (rng() - 0.5) * 2, H.z + (rng() - 0.5) * 2, -4 - rng() * 4, -2 - rng() * 3, 0, 0.9, [1.6, 0.35, 0.06], -1.5, 0);
  if (u >= BREAK + 0.15 && !fired.blow) {
    fired.blow = true;
    for (let i = 0; i < 90; i++) { let x = rng() * 2 - 1, y = rng() * 2 - 1, z = rng() * 2 - 1; const l = Math.hypot(x, y, z) || 1, v = 3 + rng() * 5;
      I.emit(H.x + x / l * 2, H.y + y / l * 2, H.z + z / l * 2, x / l * v + 3, y / l * v - 1, z / l * v, 1.4 + rng() * 1.6, [[1.7, 0.4, 0.08], [1.6, 0.22, 0.06], [1.8, 0.75, 0.2]][i % 3], -2.5, 0); }
  }
}
async function capture() {
  const url = cv.toDataURL('image/jpeg', 0.94), bin = atob(url.slice(url.indexOf(',') + 1)), u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  const r = await fetch(CAP + 's' + String(R.frame).padStart(5, '0') + '.jpg', { method: 'POST', body: new Blob([u8], { type: 'image/jpeg' }) });
  if (!r.ok) throw new Error('capture server said ' + r.status);
}
R.step = t => { hold(t); I.step(1); };
R.bbox = () => { I.phoenix.group.updateMatrixWorld(true); const b = new THREE.Box3().setFromObject(I.phoenix.group); return [b.max.x - b.min.x, b.max.y - b.min.y, b.max.z - b.min.z].map(v => +v.toFixed(1)); };
R.log.push(['halfH at bird', +halfH.toFixed(1)]);
for (let f = 0; f < Math.round(WARM * FPS); f++) R.step(f / FPS);
if (LOOK) { R.done = true; R.log.push(['look only']); }
else (async () => {
  try { for (; R.frame < R.total && !R.err; R.frame++) { R.step(WARM + R.frame / FPS); await capture(); } } catch (e) { R.err = String(e); }
  R.done = true;
})();
