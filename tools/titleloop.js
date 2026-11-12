// The thread's last video: the game's own burning ICARUS over the phoenix seen from straight above, flying wide over the
// country, made to loop. The title's shader runs on one clock for both its flicker and its stages (catch, hold, burn away);
// here it is patched in the page (not in the game) so the flicker keeps running while the stage is held as long as we like.
// Use: node tools/cap.mjs; load the game at 1920x818 with ?mute; await import('/tools/titleloop.js?' + Date.now());
//      await TL.rec('TL', 13.2)   → frames and <pre>log.json. Not deployed.
await import('/tools/reel7.js?' + Date.now());
const I = window.__icarus, p = I.player, V = p.pos.constructor, R = window.REEL;
const TL = window.TL = { on: 1.6, hold: 5.2, h: 62, back: 7, fov: 50 };
const M = I.postMat, U = M.uniforms;
if (!U.uTitleStage) {
  let fs = M.fragmentShader; const sub = (a, b) => { if (!fs.includes(a)) throw new Error('title shader changed: ' + a); fs = fs.replace(a, b); };
  sub('uniform sampler2D tTitle;', 'uniform sampler2D tTitle; uniform float uTitleStage;');
  sub('vec4 titleFire(vec2 uv, float t){', 'vec4 titleFire(vec2 uv, float ft){ float t = uTitleStage;');
  sub('float fl = fT(q * vec2(5.0, 2.6) - vec2(0.0, t * 2.4)), fl2 = fT(q * vec2(11.0, 5.0) - vec2(t * 0.3, t * 4.0));', 'float fl = fT(q * vec2(5.0, 2.6) - vec2(0.0, ft * 2.4)), fl2 = fT(q * vec2(11.0, 5.0) - vec2(ft * 0.3, ft * 4.0));');
  sub('vec2 sway = vec2((fT(q * 3.0 + t * 1.1) - 0.5) * 0.016, 0.0);', 'vec2 sway = vec2((fT(q * 3.0 + ft * 1.1) - 0.5) * 0.016, 0.0);');
  sub('vec2(0.0, -t * 9.0)', 'vec2(0.0, -ft * 9.0)');
  sub('col *= 1.0 - 0.6 * smoothstep(0.0, 0.3, uTitleT) * (1.0 - smoothstep(4.2, 5.4, uTitleT));', 'col *= 1.0 - 0.6 * smoothstep(0.0, 0.3, uTitleStage) * (1.0 - smoothstep(4.2, 5.4, uTitleStage));');
  U.uTitleStage = { value: -1 }; M.fragmentShader = fs; M.needsUpdate = true;
}
const lerp = (a, b, k) => a + (b - a) * k;
// the stage of the burn at clip time t: catches at TL.on, is held whole for TL.hold, then burns away in its own time
function stage(t) {
  const u = t - TL.on; if (u < 0) return -1;
  if (u < 2.2) return u;
  if (u < 2.2 + TL.hold) return 2.2;
  const v = 2.2 + (u - 2.2 - TL.hold); return v < 5.6 ? v : -1;
}
TL.place = (x, z, yaw, alt = 260) => {
  if (p.form !== 'phoenix') I.toBird();
  p.pos.set(x, Math.max(I.groundAt(x, z, 1e5), 0) + alt, z); p.yaw = yaw; p.pitch = 0; p.bank = 0; p.speed = Math.max(p.speed || 0, 38); p.cine = null;
};
TL.fly = t => {
  p.flame = 1; p.burnout = false; p.pitch = lerp(p.pitch, TL.alt != null ? Math.max(-0.25, Math.min(0.25, (TL.alt - p.pos.y) * 0.004)) : 0, 0.1);
  I.setStorm(0); I.flash = 0; if (I.WX) { I.WX.thunder = 0; I.WX.rain = 0; I.WX.storm = 0; } R.quiet();
  const bx = -Math.sin(p.yaw), bz = -Math.cos(p.yaw);
  R.lens(new V(p.pos.x - bx * TL.back, p.pos.y + TL.h, p.pos.z - bz * TL.back), new V(p.pos.x + bx * (TL.lead ?? 6), p.pos.y, p.pos.z + bz * (TL.lead ?? 6)), TL.fov);
  I.dbgCam.fog = TL.fog ?? 9000;
  const s = TL.title === false ? -1 : stage(t);
  if (s >= 0 && !U.tTitle.value) { I.titleBurn(); }
  U.uTitleStage.value = s; U.uTitleT.value = s >= 0 ? t : -1;
};
TL.look = async (name, t = 0) => {
  R.setCell(...(TL.cell || [9, 14])); for (let i = 0; i < 30; i++) { TL.fly(t); I.step(1); }
  const url = R.peek(960), bin = atob(url.split(',')[1]), u8 = Uint8Array.from(bin, c => c.charCodeAt(0));
  await fetch('http://127.0.0.1:8124/f/' + name + '.jpg', { method: 'POST', body: u8 });
};
TL.rec = async (pre, secs = 13.2) => {
  R.setCell(...(TL.cell || [9, 14])); TL.alt = p.pos.y;
  for (let i = 0; i < 90; i++) { TL.fly(-1); I.step(1); }
  await R.rec(pre, secs, t => TL.fly(t));
  return R.err;
};
