// "The fall": a wide loop for the home page. Icarus falling through golden haze under a blazing sun, for ever — tumbling
// slowly, wings beating hard and fast to climb and getting nowhere, an arm thrown up toward the light, feathers tearing
// loose and rising away above him, cloud rushing up past. The game's own Icarus (the full rig, drawn in the letters of
// his name) with feathered wings instead of fire. Not deployed.
//
// Use: start `node tools/cap.mjs`, load the game fresh in the preview at the output size (e.g. 2400x1000; do not begin it):
//   await import('/tools/reel5.js?' + Date.now())     → window.REEL; frames to tools/cap/<pre>00000.jpg
//   ?look=1 (set up only; REEL.step(t) by hand)  &pre=h  &secs  &warm  &fov  &dist  &T
import * as THREE from 'three';
const Q = new URLSearchParams(import.meta.url.split('?')[1] || '');
const num = (k, d) => (Q.has(k) ? +Q.get(k) : d);
const FPS = 60, T = num('T', 16), SECS = num('secs', T + 0.5), WARM = num('warm', T), LOOK = Q.get('look') === '1', PRE = Q.get('pre') || 'h', CAP = 'http://127.0.0.1:8124/f/';
const FOV = num('fov', 30), DIST = num('dist', 5.4);
const I = window.__icarus, p = I.player, H = I.human, cv = document.getElementById('c');
const R = window.REEL = { frame: 0, total: Math.round(FPS * SECS), done: false, err: null, log: [] };
window.requestAnimationFrame = () => 0;
let seed = 1;
const rng = () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
Math.random = rng;
// slow motion: the loop is twice as long as real time would want, so everything in it moves at half speed; the feathers
// keep their own clock, slowed by the same amount
const SLOW = 8 / T;
const TAU = Math.PI * 2, clamp = (v, a, b) => Math.max(a, Math.min(b, v)), ease = x => x * x * (3 - 2 * x);

// ── begin as ICARUS (he is drawn in the letters of the name), past the opening, a man in the open sky
const ni = document.getElementById('nameInput'); ni.value = 'ICARUS'; ni.dispatchEvent(new Event('input'));
ni.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true }));
I.step(3); await new Promise(r => setTimeout(r, 1500));
// borrow the feathered wings the boy wears in the opening (made of real feathers, not fire) before the opening is cleared away
for (let i = 0; i < 40 && !(I.pro && I.pro.son); i++) { I.step(2); await new Promise(r => setTimeout(r, 50)); }
if (!(I.pro && I.pro.son) && I.startPrologue) { I.startPrologue(); I.step(1); }   // (the opening is skipped now; build it just to borrow from it)
const PLUMES = I.pro && I.pro.son ? I.pro.son.wings.map(w => ({ ...w })) : null;
if (I.state === 'prologue') I.endPrologue?.();
for (let i = 0; i < 200 && I.state !== 'play'; i++) I.step(30);
I.story.phase = 'gods'; I.flags.morphed = true; I.setStorm(0); I.setDay(num('day', 0.3));
const quiet = () => { if (I.dlg) { I.dlg.queue.length = 0; I.dlg.cur = null; } if (I.cinema) I.cinema.idle = 0; };
quiet();

// ── where he is: high in the air; the lens falls with him
const HOME = new THREE.Vector3(p.pos.x, I.SKY_LIMIT - 400, p.pos.z);
const FWD = new THREE.Vector3(0, 0, -1), RIGHT = new THREE.Vector3(1, 0, 0), UP = new THREE.Vector3(0, 1, 0);
const CAM = HOME.clone().addScaledVector(FWD, -DIST);
const aspect = cv.width / cv.height, halfH = Math.tan(FOV / 2 * Math.PI / 180), BACK = 60, hb = halfH * BACK;

// ── the sky: warm haze, the sun high to the right throwing rays, and cloud streaming up past him (tileable: it loops)
const SKY_U = { uT: { value: 0 }, uAsp: { value: aspect }, uSun: { value: new THREE.Vector2(num('sx', 0.78), num('sy', 0.82)) }, uLoop: { value: T } };
const skyMat = new THREE.ShaderMaterial({
  depthWrite: true, depthTest: false, fog: false, uniforms: SKY_U,
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `uniform float uT, uAsp, uLoop; uniform vec2 uSun; varying vec2 vUv;
    // value noise that tiles every P cells in y, so cloud scrolled by a whole period comes back to itself
    float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    float n(vec2 x, float P){ vec2 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
      float a = h(vec2(i.x, mod(i.y, P))), b = h(vec2(i.x + 1.0, mod(i.y, P))), c = h(vec2(i.x, mod(i.y + 1.0, P))), d = h(vec2(i.x + 1.0, mod(i.y + 1.0, P)));
      return mix(mix(a, b, f.x), mix(c, d, f.x), f.y); }
    float fbm(vec2 x, float P){ float s = 0.0, a = 0.5; for (int k = 0; k < 5; k++) { s += a * n(x, P); x = x * 2.0 + vec2(17.3, 0.0); P *= 2.0; a *= 0.5; } return s; }
    void main(){
      vec2 q = vec2(vUv.x * uAsp, vUv.y);
      // the haze: pale gold high up, peach, then warm amber low down
      vec3 c = mix(vec3(0.72, 0.36, 0.2), vec3(0.95, 0.66, 0.4), smoothstep(0.0, 0.85, vUv.y));
      c = mix(c, vec3(1.0, 0.82, 0.58), smoothstep(0.6, 1.0, vUv.y) * 0.45);
      // the sun, and its rays fanning down across the sky
      vec2 s = vec2(uSun.x * uAsp, uSun.y), d = q - s; float r = length(d), ang = atan(d.y, d.x);
      float rays = pow(0.5 + 0.5 * sin(ang * 13.0 + 1.3), 6.0) * 0.55 + pow(0.5 + 0.5 * sin(ang * 7.0 - 0.4), 10.0) * 0.45;
      c += vec3(1.0, 0.86, 0.6) * (exp(-r * 5.0) * 0.55 + exp(-r * 16.0) * 0.8) + vec3(1.0, 0.82, 0.55) * rays * exp(-r * 1.8) * 0.22;
      // cloud, two layers, both rising (he is falling through it): far and slow, near and fast
      float ph = uT / uLoop;
      float far = fbm(vec2(q.x * 2.2, q.y * 2.2 - ph * 4.0), 4.0 * 2.2 / 2.2);
      float nearC = fbm(vec2(q.x * 1.3 + 3.0, q.y * 1.3 - ph * 8.0), 8.0);
      c = mix(c, vec3(1.0, 0.78, 0.55), smoothstep(0.48, 0.78, far) * 0.45);
      c = mix(c, vec3(0.62, 0.3, 0.18), smoothstep(0.55, 0.8, nearC) * 0.3 * (1.0 - smoothstep(0.25, 0.75, abs(vUv.x - 0.5) * 2.0 - 0.3)));
      gl_FragColor = vec4(c, 1.0);
    }`,
});
const backdrop = new THREE.Mesh(new THREE.PlaneGeometry(hb * 2 * aspect * 1.4, hb * 2 * 1.4), skyMat);   // (well past the frame: the lens sways)
backdrop.position.copy(CAM).addScaledVector(FWD, BACK); backdrop.renderOrder = -1; backdrop.frustumCulled = false;
I.scene.add(backdrop);

// ── his wings: feathers, not fire — cream and white, the vanes warm where the sun comes through
const featherWing = (() => {
  const base = I.fireMat, m = base.clone(), hook = base.onBeforeCompile;
  m.onBeforeCompile = sh => {
    hook.call(base, sh);
    sh.fragmentShader = sh.fragmentShader.replace('gl_FragColor.a = 0.5;', `
      { // each feather: a darker quill end, a bright cream vane toward the tip, and its own tone; the sun warm through it
        float L = clamp(dot(vColor.rgb, vec3(0.3, 0.5, 0.2)) * 0.5, 0.0, 1.0);
        vec3 quill = vec3(0.42, 0.33, 0.27), vane = vec3(1.12, 1.04, 0.92);
        gl_FragColor.rgb = mix(quill, vane, clamp(L * 1.3 - 0.15, 0.0, 1.0)) * (0.85 + 0.3 * fract(L * 7.31)); }
      gl_FragColor.a = 0.5;`);
  };
  m.customProgramCacheKey = () => 'reel5-feather';
  return m;
})();
const WP = [];   // the wings he flies (or tries to) with
if (PLUMES) {
  H.wingParts.forEach(w => { w.root.visible = false; });
  // luminous feathers: white vanes with the sun through them, darker toward the quills (the grey of the opening reads as mud here)
  const lum = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide });
  lum.onBeforeCompile = sh => { sh.fragmentShader = sh.fragmentShader.replace('#include <dithering_fragment>', `#include <dithering_fragment>
    { float L = clamp((dot(vColor.rgb, vec3(0.333)) - 0.4) / 0.36, 0.0, 1.0);
      gl_FragColor.rgb = mix(vec3(0.62, 0.5, 0.4), vec3(1.25, 1.18, 1.04), L);
      gl_FragColor.a = 0.5; }`); };
  lum.customProgramCacheKey = () => 'reel5-lum';
  PLUMES.forEach(w => w.root.traverse(o => { if (o.isMesh && o.material && o.material.vertexColors) o.material = lum; }));
  PLUMES.forEach((w, i) => { const side = i === 0 ? -1 : 1, S = num('ps', 0.24); w.root.parent && w.root.parent.remove(w.root); w.root.scale.set(side < 0 ? S : -S, S, S); w.root.position.set(side * 0.16, 0, -0.02); w.root.visible = true; H.wings.add(w.root); WP.push(w); });
} else { H.wings.traverse(o => { if (o.isMesh) o.material = featherWing; }); WP.push(...H.wingParts); }
R.log.push(['wings', PLUMES ? 'feathered (from the opening)' : 'fire wings recoloured']);
if (H.cape) H.cape.visible = false;

// ── loose feathers, torn off by the wind and rising away above him
const FN = 140, fGeo = new THREE.PlaneGeometry(0.07, 0.3).translate(0, 0.15, 0);
const fMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.08, 1.0, 0.9), side: THREE.DoubleSide });
const feathers = new THREE.InstancedMesh(fGeo, fMat, FN); feathers.frustumCulled = false; feathers.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
I.scene.add(feathers);
const fp = Array.from({ length: FN }, () => ({ t0: 0, dead: true, life: 1, p: new THREE.Vector3(), v: new THREE.Vector3(), ax: new THREE.Vector3(1, 0, 0), spin: 0, ph: 0 }));
let fNext = 0;
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _v = new THREE.Vector3();
const tipPts = []; WP.forEach(w => w.root.traverse(o => { if (o.isMesh) { const P = o.geometry.attributes.position; for (let i = 0; i < P.count; i += 11) tipPts.push({ o, i }); } }));
function tear(u) {
  const f = fp[fNext = (fNext + 1) % FN], w = tipPts[Math.floor(rng() * tipPts.length)];
  f.p.fromBufferAttribute(w.o.geometry.attributes.position, w.i).applyMatrix4(w.o.matrixWorld);
  f.v.set((rng() - 0.5) * 2.2, 4 + rng() * 5, (rng() - 0.5) * 1.5);       // he falls away beneath them: they rise
  f.ax.set(rng() - 0.5, rng() - 0.5, rng() - 0.5).normalize(); f.spin = (3 + rng() * 6) * (rng() < 0.5 ? -1 : 1); f.ph = rng() * TAU;
  f.t0 = u; f.life = 1.6 + rng() * 1.6; f.dead = false;
}
function drawFeathers(u) {
  for (let i = 0; i < FN; i++) {
    const f = fp[i], a = (((u - f.t0) % T + T) % T) * SLOW;   // (age wraps round the loop: feathers torn off just before it restarts fly on through the seam)
    if (f.dead || a > f.life) { _m.makeScale(0, 0, 0); feathers.setMatrixAt(i, _m); continue; }
    _v.copy(f.p).addScaledVector(f.v, a).add(_s.set(Math.sin(a * 4 + f.ph) * 0.25, 0, Math.cos(a * 3 + f.ph) * 0.15));
    _q.setFromAxisAngle(f.ax, f.spin * a + f.ph);
    const k = Math.min(1, a * 8) * (1 - ease(clamp((a - f.life * 0.6) / (f.life * 0.4), 0, 1)));
    _m.compose(_v, _q, _s.set(k, k, k)); feathers.setMatrixAt(i, _m);
  }
  feathers.instanceMatrix.needsUpdate = true;
}
// the rush of air: dust and droplets streaking up past the lens
function wind() {
  for (let i = 0; i < 3; i++) I.emit(HOME.x + (rng() - 0.5) * 14 * aspect * 0.6, HOME.y - 6 - rng() * 4, HOME.z + (rng() - 0.5) * 6, 0, 26 + rng() * 14, 0, 0.7, [1.0, 0.95, 0.85], 0, 0.5);
}

// ── his body: a slow tumble, head going over, limbs flung out; the wings beating hard and fast, out of step, for nothing
const _e = new THREE.Euler(0, 0, 0, 'YXZ');
const W = { f: 0 };
function pose(u) {
  const ph = TAU * u / T;
  // the whole man: tipped back and over, turning slowly about himself (two gentle cycles a loop so it comes back round)
  const roll = num('roll', -2.35) + 0.32 * Math.sin(ph) + 0.08 * Math.sin(ph * 3 + 1);
  const pitch = num('pitch', 0.55) + 0.18 * Math.sin(ph * 2 + 0.6), yaw = num('yaw', 0.5) + 0.22 * Math.sin(ph + 2);
  H.group.position.copy(HOME).add(_v.set(0.18 * Math.sin(ph * 2), 0.12 * Math.sin(ph * 3 + 1), 0));
  H.group.quaternion.setFromEuler(_e.set(pitch, yaw, roll, 'YXZ'));
  H.rig.rotation.set(0, 0, 0); H.rig.position.set(0, 0, 0);
  // wings: frantic strokes, 6 to the loop on one side and 6 out of step on the other, the hands folding on the way up
  const beat = (k, off) => { const x = ((u / T) * 7 + off) % 1; return x < 0.4 ? 1 - 2 * ease(x / 0.4) : -1 + 2 * ease((x - 0.4) / 0.6); };
  if (H.cape) H.cape.visible = false;   // (the game shows his cape every frame; in this picture it only reads as a grey ribbon)
  H.wings.visible = true; H.wings.scale.setScalar(PLUMES ? 1 : num('ws', 0.21)); H.wings.rotation.set(num('wx', -1.2), num('wy', 0), 0);
  WP.forEach((w, i) => {
    const b = beat(i, i ? 0.12 : 0), up = Math.max(0, b);
    w.shoulder.rotation.z = -(0.15 + 0.85 * b); w.elbow.rotation.z = -(0.15 + 0.6 * (1 - up) * (b < 0 ? 0.3 : 1) * Math.max(0, 0.6 - b)); w.wrist.rotation.z = -(0.2 + 0.35 * Math.max(0, -b));
    w.root.rotation.y = (0.15 + 0.25 * Math.max(0, -b)) * (i === 0 ? 1 : -1);
  });
  // arms: one thrown up toward the light, the other out, clawing; legs kicking; head turned up to the sun
  H.armR.rotation.set(-0.4 + 0.25 * Math.sin(ph * 2), 0, 2.5 + 0.2 * Math.sin(ph * 3)); H.foreR.rotation.set(0.25 + 0.2 * Math.sin(ph * 4), 0, 0);
  H.armL.rotation.set(0.5 + 0.3 * Math.sin(ph * 3 + 1), 0, -1.35 - 0.35 * Math.sin(ph * 2 + 0.5)); H.foreL.rotation.set(0.6 + 0.3 * Math.sin(ph * 4 + 2), 0, 0);
  H.legL.rotation.set(-0.9 + 0.45 * Math.sin(ph * 2), 0, 0.2); H.shinL.rotation.set(1.3 + 0.4 * Math.sin(ph * 2 + 1.2), 0, 0); H.footL.rotation.set(0.6, 0, 0);
  H.legR.rotation.set(0.35 + 0.4 * Math.sin(ph * 2 + 2.6), 0, -0.25); H.shinR.rotation.set(0.5 + 0.4 * Math.sin(ph * 2 + 3.5), 0, 0); H.footR.rotation.set(0.7, 0, 0);
  H.chest.rotation.set(-0.25 + 0.08 * Math.sin(ph * 2), 0.1 * Math.sin(ph), 0); H.head.rotation.set(-0.6 + 0.1 * Math.sin(ph * 2), 0.35, 0);
  if (H.scarf) H.scarf.rotation.set(-1.4 + 0.25 * Math.sin(ph * 7), 0, 0.2 * Math.sin(ph * 5));   // streaming up off him
  if (I.setCurl) { try { I.setCurl(H.handR, 0.15); I.setCurl(H.handL, 0.55); } catch {} }
  H.group.updateMatrixWorld(true);
}

// ── the lens: falling with him, breathing a little
function lens(u) {
  const ph = TAU * u / T;
  I.dbgCam.on = true; I.dbgCam.fov = FOV; I.dbgCam.fog = 1e6;
  I.dbgCam.p.copy(CAM).add(_v.set(0.25 * Math.sin(ph), 0.15 * Math.sin(ph * 2 + 1), 0));
  I.dbgCam.l.copy(HOME).add(_v.set(num('lx', 0), num('ly', -0.1), 0));
}
// only him, his feathers, the air and the sky — not the world miles below
I.camera.layers.set(5);
for (const o of [H.group, backdrop, feathers]) o.traverse(c => c.layers.enable(5));
I.scene.traverse(o => { if (o.isLight) o.layers.enable(5); });   // (lights obey the lens's layers too: let them all through)
// and a warm key from the sun's side, a cool fill from below, so he reads as a body, not a hole
const key = new THREE.DirectionalLight(0xffd7a0, num('key', 2.4)); key.position.set(4, 6, 3); const fill = new THREE.HemisphereLight(0xffe6c8, 0x6a4a3a, num('fill', 1.1));
for (const L of [key, fill]) { L.layers.enable(5); I.scene.add(L); }
key.target.position.copy(HOME); I.scene.add(key.target); key.position.add(HOME);
I.scene.traverse(o => { const m = o.material, g = o.geometry; if (o.isMesh && m && m.isMeshBasicMaterial && m.vertexColors && m.blending === THREE.AdditiveBlending && g && g.index && g.attributes.position.usage === THREE.DynamicDrawUsage) m.visible = false; });

let curU = 0, prevU = -1, tearAcc = 0;
I.scene.onBeforeRender = () => { pose(curU); drawFeathers(curU); SKY_U.uT.value = curU; };
function hold(t) {
  quiet();
  const u = t % T;
  if (u < prevU) seed = 3;
  prevU = u; curU = u;
  p.form = 'human'; p.cine = null; p.grounded = false; p.wings = false; p.tumble = false; p.sub = null;
  p.pos.copy(HOME); p.vel.set(0, 0, 0); p.fallTop = HOME.y;
  lens(u);
  tearAcc += 18 * SLOW / FPS; while (tearAcc >= 1) { tearAcc -= 1; H.group.updateMatrixWorld(true); tear(u); }
}
// frames go out at the output size, scaled in the page with high-quality smoothing (full-size frames are ~4 MB each, and
// after a few hundred of them the page stops being able to send them)
const OUTW = num('ow', 2400), OUTH = Math.round(OUTW * cv.height / cv.width), small = document.createElement('canvas');
small.width = OUTW; small.height = OUTH; const sx = small.getContext('2d'); sx.imageSmoothingEnabled = true; sx.imageSmoothingQuality = 'high';
async function capture() {
  sx.drawImage(cv, 0, 0, OUTW, OUTH);
  const url = small.toDataURL('image/jpeg', 0.94), bin = atob(url.slice(url.indexOf(',') + 1)), u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  // sent as raw bytes, not a Blob: Blobs pile up in the browser's blob store over a long recording until it refuses them
  const name = CAP + PRE + String(R.frame).padStart(5, '0') + '.jpg', PIECE = 16 * 1024 * 1024;
  for (let o = 0; o < u8.length; o += PIECE) {
    let ok = false;
    for (let k = 0; k < 6 && !ok; k++) {
      try { const r = await fetch(name + (o ? '?a=1' : ''), { method: 'POST', body: o === 0 && u8.length <= PIECE ? u8 : u8.slice(o, Math.min(u8.length, o + PIECE)) }); ok = r.ok; } catch {}
      if (!ok) await new Promise(r => setTimeout(r, 250));
    }
    if (!ok) throw new Error('capture failed at frame ' + R.frame);
  }
}
R.step = t => { hold(t); I.step(1); };
for (let f = 0; f < Math.round(WARM * FPS); f++) R.step(f / FPS);
if (LOOK) R.done = true;
else (async () => {
  try { for (; R.frame < R.total && !R.err; R.frame++) { R.step(WARM + R.frame / FPS); await capture(); } } catch (e) { R.err = String(e); }
  R.done = true;
})();
