// Two reels for the X thread, both of the game's own cameras rather than a lens we place:
//   CINE  — cinematic mode (C): the game cuts between its own shots while the phoenix flies; every cut is logged by name.
//   PHOTO — the photo camera (P, "the still eye"): time all but stops and the camera is walked round the frozen bird.
// The photo camera slows the world through the game's real frame loop, which a frame-stepping recorder bypasses, so for that
// reel the loop itself is captured (the function the game hands to requestAnimationFrame) and driven on a made-up clock that
// advances exactly 1/60 s a frame. Use: node tools/cap.mjs; load the game at 1920x818 through /tools/loopwrap.html?mute=1 (the photo reel needs it), then
//   await import('/tools/cinereel.js?' + Date.now());  await CR.cine('CN', 24)   or   await CR.photo('PH', 21). Not deployed.
const loop = window.__loop || null;   // (caught by tools/loopwrap.html as the game started; absent on the plain page)
await import('/tools/reel7.js?' + Date.now());
window.requestAnimationFrame = () => 0;
const I = window.__icarus, p = I.player, V = p.pos.constructor, R = window.REEL, cv = document.getElementById('c');
const CR = window.CR = { loop: !!loop, alt: 170 };
const lerp = (a, b, k) => a + (b - a) * k, clamp = (v, a, b) => Math.max(a, Math.min(b, v)), ease = u => u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u);
const held = {};
const key = (code, down) => { if (!!held[code] === down) return; held[code] = down; window.dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', { key: code.slice(3).toLowerCase(), code, bubbles: true })); };
CR.calm = () => { I.setStorm(0); I.flash = 0; if (I.WX) { I.WX.thunder = 0; I.WX.rain = 0; I.WX.storm = 0; } R.quiet(); p.flame = 1; p.burnout = false; };
CR.place = (x, z, yaw, alt = CR.alt) => {
  I.flags.firstNight = false; I.story.phase = 'free';
  if (p.form !== 'phoenix') I.toBird();
  p.pos.set(x, Math.max(I.groundAt(x, z, 1e5), 0) + alt, z); p.yaw = yaw; p.pitch = 0; p.bank = 0; p.speed = Math.max(p.speed || 0, 40); p.cine = null;
};
// hold a height over the country ahead, and wander: long slow turns one way then the other
CR.fly = (t, turn = true) => {
  CR.calm();
  const fx = -Math.sin(p.yaw), fz = -Math.cos(p.yaw);
  const under = Math.max(0, I.groundAt(p.pos.x, p.pos.z, -1e5), I.groundAt(p.pos.x + fx * 300, p.pos.z + fz * 300, -1e5), I.groundAt(p.pos.x + fx * 650, p.pos.z + fz * 650, -1e5));
  p.pitch = lerp(p.pitch, clamp((under + CR.alt - p.pos.y) * 0.005, -0.3, 0.35), 0.08);
  if (turn) { const s = Math.sin(t * 0.42 + (CR.phase || 0)); key('KeyA', s > 0.55); key('KeyD', s < -0.55); } else { key('KeyA', false); key('KeyD', false); }
};
async function grab(name) {
  const c = document.createElement('canvas'); c.width = 1920; c.height = Math.round(1920 * cv.height / cv.width); c.getContext('2d').drawImage(cv, 0, 0, c.width, c.height);
  const url = c.toDataURL('image/jpeg', 0.93), bin = atob(url.slice(url.indexOf(',') + 1)), u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  for (let k = 0; k < 6; k++) { try { if ((await fetch('http://127.0.0.1:8124/f/' + name, { method: 'POST', body: u8 })).ok) return; } catch {} await new Promise(r => setTimeout(r, 250)); }
  throw new Error('capture failed: ' + name);
}
CR.peek = name => grab(name + '.jpg');

// ── cinematic mode
CR.cine = async (pre, secs = 24, cap = 4.6) => {
  R.setCell(...(CR.cell || [9, 14])); R.lens(null);
  I.cinema.manual = true; I.cinema.last = ''; let last = null;
  for (let i = 0; i < 60; i++) { CR.fly(0, false); I.step(1); }
  I.cinema.on = false;   // (so the reel opens on a fresh first shot)
  await R.rec(pre, secs, t => {
    CR.fly(t);
    const sh = I.cinema.shot;
    if (sh && sh !== last) { last = sh; if (sh.type !== 'flyby') sh.dur = Math.min(sh.dur, cap); R.log.push(['shot', +t.toFixed(3), sh.type]); }
  });
  I.cinema.manual = false; key('KeyA', false); key('KeyD', false);
  return R.err || R.log.filter(e => e[0] === 'shot');
};

// ── the photo camera, on the game's own loop and a clock of our own
let clock = performance.now(); const realNow = performance.now.bind(performance);
CR.tick = () => { clock += 1000 / 60; loop(); };
CR.photo = async (pre, secs = 21, plan = CR.plan) => {
  if (!loop) throw new Error('the game loop was not caught: open the game through /tools/loopwrap.html');
  R.setCell(...(CR.cell || [9, 14]));
  performance.now = () => clock;
  const log = [], n = Math.round(secs * 60); let err = null, mode = 'fly', A = null;
  const chase = t => {   // before and after: low behind and to one side, as the game's own camera might sit
    const bx = -Math.sin(p.yaw), bz = -Math.cos(p.yaw);
    R.lens(new V(p.pos.x - bx * 30 + bz * 10, p.pos.y + 9, p.pos.z - bz * 30 - bx * 10), new V(p.pos.x + bx * 12, p.pos.y + 1, p.pos.z + bz * 12), 52);
  };
  try {
    for (let i = 0; i < 90; i++) { CR.fly(0, false); chase(0); CR.tick(); }
    for (let f = 0; f < n; f++) {
      const t = f / 60, P = I.photo;
      if (t < plan.stop) { CR.fly(t, false); chase(t); }
      else if (t < plan.go) {
        if (mode === 'fly') { mode = 'photo'; I.dbgCam.on = false; I.openPhoto(true); log.push(['stop', t]); }
        // which move we are in, and how far through it
        const mv = plan.moves.filter(m => t >= m.t).pop();
        if (mv && A !== mv) { A = mv; if (mv.preset) I.photoPreset(mv.preset); mv.p0 = P.pos.clone(); mv.yaw0 = P.yaw; mv.pitch0 = P.pitch; mv.fov0 = P.fov; mv.c = p.pos.clone(); log.push(['move', t, mv.name || '']); }
        if (mv) {
          const u = ease((t - mv.t) / mv.len);
          if (mv.orbit) {   // swing round him, keeping him in the middle
            const d0 = mv.p0.clone().sub(mv.c), r0 = Math.hypot(d0.x, d0.z), a0 = Math.atan2(d0.z, d0.x), a = a0 + mv.orbit * u, r = r0 * lerp(1, mv.close ?? 1, u);
            P.pos.set(p.pos.x + Math.cos(a) * r, mv.p0.y + (mv.rise || 0) * u, p.pos.z + Math.sin(a) * r);
            const dx = p.pos.x - P.pos.x, dy = p.pos.y + (mv.aim || 0) - P.pos.y, dz = p.pos.z - P.pos.z;
            P.yaw = Math.atan2(-dx, -dz); P.pitch = Math.atan2(dy, Math.hypot(dx, dz));
          } else if (mv.push) {   // a slow move straight in along the lens
            P.pos.copy(mv.p0).lerp(mv.c, mv.push * u);
          }
          if (mv.fov) P.fov = lerp(mv.fov0, mv.fov, u);
          if (mv.roll != null) P.roll = mv.roll * u;
        }
        for (const s of plan.snaps) if (Math.abs(t - s) < 1 / 120) log.push(['snap', t]);
      } else {
        if (mode === 'photo') { mode = 'after'; I.closePhoto(); log.push(['go', t]); }
        CR.fly(t, false); chase(t);
      }
      CR.tick();
      await grab(pre + String(f).padStart(5, '0') + '.jpg');
      R.frame = f + 1;
    }
    await fetch('http://127.0.0.1:8124/f/' + pre + 'log.json', { method: 'POST', body: JSON.stringify(log) });
  } catch (e) { err = String(e.stack || e); }
  performance.now = realNow;
  if (I.state === 'photo') I.closePhoto();
  return err || log;
};
CR.plan = { stop: 3.0, go: 18.2, snaps: [6.9, 9.9, 12.9, 15.7, 18.0],
  moves: [
    { t: 3.0, len: 3.9, name: 'orbit', orbit: 2.4, close: 0.6, rise: -4, aim: 1 },
    { t: 7.0, len: 2.9, name: 'hero', preset: 6, push: 0.25 },
    { t: 10.0, len: 2.9, name: 'far', preset: 1, fov: 11 },
    { t: 13.0, len: 2.7, name: 'above', preset: 4, roll: 0.5, fov: 26 },
    { t: 15.8, len: 2.2, name: 'close', preset: 2, push: 0.3, fov: 28 },
  ] };
