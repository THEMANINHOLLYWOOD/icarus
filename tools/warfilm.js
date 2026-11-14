// "The warzone", as a film. Twelve birds that fly themselves, one from the house of each god, are set at each other over
// Olympus at night, under the aurora. The lens is directed from here; the bird of Zeus cannot be put out, and the others
// are, one beat after another: some alone and close, some two and three at a time and wide. ZEUS WINS, and the picture
// goes to white, which is where it began, so it loops.
// The page's clock, its timers and its CSS animations are all run by the film's frames, so it can be shot far slower than
// it plays. Driven by tools/warfilm.mjs (which loads the game, gets the bird into the air, adds this file and takes the
// frames). Not deployed.
(() => {
  const I = window.__icarus, M = I.MATCH, D = I.dbgCam, V3 = I.camera.position.constructor, FPS = 30;
  const F = window.FILM = { frame: 0, shot0: -1, phase: 'boot', rolling: false, done: false, err: null, log: [], kills: [], zeus: null };
  const ORDER = ['ares', 'aphrodite', 'hermes', 'artemis', 'apollo', 'athena', 'demeter', 'dionysus', 'hephaestus', 'poseidon', 'hera', 'zeus'];
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v)), lerp = (a, b, t) => a + (b - a) * t, ss = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  const wrap = a => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };
  const rnd = (a, b) => a + Math.random() * (b - a);

  // ── the film's own clock: every timer in the page runs by frames, not by the wall
  let vt = 0; const p0 = performance.now(), d0 = Date.now(), timers = new Map(); let tid = 9e6;
  function clockOn() {
    performance.now = () => p0 + vt; Date.now = () => d0 + Math.floor(vt); window.requestAnimationFrame = () => 0;
    const ct = window.clearTimeout.bind(window), ci = window.clearInterval.bind(window);
    window.setTimeout = (fn, ms = 0, ...a) => { const id = tid++; timers.set(id, { at: vt + Math.max(0, +ms || 0), fn, a }); return id; };
    window.setInterval = (fn, ms = 0, ...a) => { const id = tid++; timers.set(id, { at: vt + Math.max(4, +ms || 0), fn, a, every: Math.max(4, +ms || 0) }); return id; };
    window.clearTimeout = id => { if (!timers.delete(id)) ct(id); }; window.clearInterval = id => { if (!timers.delete(id)) ci(id); };
  }
  function runTimers() { for (const [id, T] of [...timers]) if (T.at <= vt && timers.has(id)) { if (T.every) T.at += T.every; else timers.delete(id); try { if (typeof T.fn === 'function') T.fn(...T.a); } catch (e) { F.log.push('timer: ' + e); } } }
  function anims() { for (const a of document.getAnimations()) { if (a.__t0 === undefined) a.__t0 = vt - 1000 / 60; try { a.pause(); a.currentTime = vt - a.__t0; } catch {} } }

  // ── what is on the glass: the game's own cards, a line when one goes out, and the white the film begins and ends in
  let feed, white;
  function dress() {
    const st = document.createElement('style');
    st.textContent = `body > *:not(#c):not(#matchBig):not(#fightCard):not(#filmFeed):not(#filmWhite):not(script):not(style) { display:none !important; }
      body::before, body::after { display:none !important; }
      #filmFeed { position:fixed; left:34px; bottom:30px; z-index:9; font:600 13px/1.9 ui-monospace, 'SF Mono', Menlo, monospace; letter-spacing:.34em; color:#ffe9c0; text-shadow:0 0 10px #000, 0 0 3px #000; pointer-events:none; }
      #filmFeed div b { font-weight:600; } #filmFeed div span { opacity:.62; }
      #filmWhite { position:fixed; inset:0; z-index:20; background:#fff; opacity:1; pointer-events:none; }
      #fightCard { bottom:13% !important; }`;
    document.head.appendChild(st);
    feed = document.createElement('div'); feed.id = 'filmFeed'; document.body.appendChild(feed);
    white = document.createElement('div'); white.id = 'filmWhite'; document.body.appendChild(white);
  }
  const lines = [];
  function said(C, left) { lines.push({ at: vt, html: `<b style="color:${I.PATRONS[C.pat][0]}">${C.name}</b> <span>IS OUT · ${left} LEFT</span>` }); }
  function glass() {
    // the card under each bird as it is shown: its god, and what that god is the god of
    const card = document.getElementById('fightCard');
    if (card && card.children[2] && /HOUSE OF/.test(card.children[2].textContent)) { const C = M.cpus.find(c => c.name === card.children[1].textContent); if (C) card.children[2].textContent = I.PATRONS[C.pat][1]; }
    while (lines.length && vt - lines[0].at > 4200) lines.shift();
    feed.innerHTML = lines.slice(-3).map(l => `<div style="opacity:${(1 - ss(3400, 4200, vt - l.at)).toFixed(2)}">${l.html}</div>`).join('');
    let w = 0; if (F.shot0 >= 0) w = Math.max(w, 1 - (F.frame - F.shot0) / 14); if (F.endF) w = Math.max(w, 1 - (F.endF - F.frame) / 16);
    white.style.opacity = clamp(w, 0, 1).toFixed(3);
  }

  // ── the lens
  const cp = new V3(), cl = new V3(), wp = new V3(), wl = new V3(), _a = new V3(), _b = new V3();
  let cut = true, fov = 60, wfov = 60;
  const fwd = (C, o) => o.set(-Math.sin(C.yaw) * Math.cos(C.pitch), Math.sin(C.pitch), -Math.cos(C.yaw) * Math.cos(C.pitch));
  const right = (C, o) => o.set(Math.cos(C.yaw), 0, -Math.sin(C.yaw));
  const floor = v => { const g = Math.max(I.groundAt(v.x, v.z, v.y + 600), I.WATER) + 7; if (v.y < g) v.y = g; return v; };
  function lens(dt, kp = 5, kl = 9) {
    floor(wp);
    if (cut) { cp.copy(wp); cl.copy(wl); fov = wfov; cut = false; }
    else { cp.lerp(wp, 1 - Math.exp(-kp * dt)); cl.lerp(wl, 1 - Math.exp(-kl * dt)); fov = lerp(fov, wfov, 1 - Math.exp(-3 * dt)); }
    floor(cp); D.on = true; D.p.copy(cp); D.l.copy(cl); D.fov = fov;
  }
  const SHOTS = {
    chase(S, C) { fwd(C, _a); right(C, _b); wp.copy(C.pos).addScaledVector(_a, -64).addScaledVector(_b, S.side * 17); wp.y += 21; wl.copy(C.pos).addScaledVector(_a, 34); wfov = 64; return [6, 10]; },
    lead(S, C) { fwd(C, _a); right(C, _b); wp.copy(C.pos).addScaledVector(_a, 78).addScaledVector(_b, S.side * 24); wp.y += 7; wl.copy(C.pos); wl.y += 2; wfov = 38; return [7, 14]; },
    flyby(S, C) { if (!S.tri) { fwd(C, _a); right(C, _b); S.tri = C.pos.clone().addScaledVector(_a, C.speed * 1.25).addScaledVector(_b, S.side * 30); S.tri.y -= 5; floor(S.tri); }
      wp.copy(S.tri); wl.copy(C.pos); wfov = lerp(30, 50, ss(120, 20, wp.distanceTo(C.pos))); return [40, 16]; },
    kill(S, C) { wp.copy(S.tri); const at = C.alive ? C.pos : S.at; wl.copy(at); if (!C.alive) wl.y += (el() - C.deadAt) * 3.5; wfov = lerp(46, 38, ss(0, 3.5, el() - S.t0)); return [40, C.alive ? 16 : 5]; },
    wide(S) { const c = S.c, ax = c.x - M.cx, az = c.z - M.cz, al = Math.hypot(ax, az) || 1, a = Math.atan2(ax, az) + S.side * (0.5 + 0.05 * (el() - S.t0));
      wp.set(M.cx + Math.sin(a) * (al + 460), c.y + 170, M.cz + Math.cos(a) * (al + 460)); wl.copy(c); wfov = 60; return [2.5, 4]; },
    top(S) { const c = S.c, a = 0.4 + 0.06 * (el() - S.t0); wp.set(c.x + Math.sin(a) * 240, c.y + 780, c.z + Math.cos(a) * 240); wl.copy(c); wfov = 62; return [2.5, 4]; },
    crown(S, C) { const a = S.a0 + 0.5 * (el() - S.t0), r = lerp(70, 210, ss(0, 3.4, el() - S.t0)); wp.set(C.pos.x + Math.sin(a) * r, C.pos.y + lerp(10, 120, ss(0.6, 3.6, el() - S.t0)), C.pos.z + Math.cos(a) * r); wl.copy(C.pos); wfov = lerp(40, 58, ss(0, 3.4, el() - S.t0)); return [6, 12]; },
  };
  let shot = null;
  function take(kind, o = {}) { shot = { kind, t0: el(), side: Math.random() < 0.5 ? -1 : 1, ...o }; cut = true; F.log.push([F.frame, kind, o.C ? o.C.name : '']); }
  function run(dt) { if (!shot) return; const k = SHOTS[shot.kind](shot, shot.C); lens(dt, k[0], k[1]); }

  // ── who is alive, and who is next
  const el = () => (performance.now() - (M.liveAt || performance.now())) / 1000;
  const others = () => M.cpus.filter(c => c.alive && c !== F.zeus);
  const mid = (list, o) => { o.set(0, 0, 0); for (const c of list) o.add(c.alive ? c.pos : c.deadPos); return o.multiplyScalar(1 / Math.max(1, list.length)); };
  // a place in somebody's fire to be flown into: near, ahead, and for choice the fire of Zeus
  function wall(C) {
    let best = null, bs = 1e9; fwd(C, _a);
    for (const T of I.TRON.trails.values()) { if (T.match !== M.id || T.id === C.id) continue; const P = T.pts;
      for (let i = T.start + 2; i < T.n - 1; i += 2) { const x = P[i * 3], y = P[i * 3 + 1], z = P[i * 3 + 2], dx = x - C.pos.x, dy = y - C.pos.y, dz = z - C.pos.z, d = Math.hypot(dx, dy, dz);
        if (d < 120 || d > 560 || Math.abs(dy) > d * 0.5) continue; const ang = Math.acos(clamp((dx * _a.x + dy * _a.y + dz * _a.z) / d, -1, 1)); if (ang > 1.9) continue;
        if (y < Math.max(I.groundAt(x, z, y + 300), I.WATER) + 12) continue;
        const s = d * (1 + ang * 0.6) * (F.zeus && T.id === F.zeus.id ? 0.5 : 1); if (s < bs) { bs = s; best = { x, y, z, by: T.id }; } } }
    return best;
  }
  function doom(C) { C.doom = el(); C.probeT = 1e9; C.q = wall(C); C.qT = 0; C.tgtT = 1e9; }
  function steer(C, dt) {
    C.probeT = 1e9; C.tgtT = 1e9; C.qT += dt; const t = el() - C.doom;
    if (t > 8) { C.turn = 0; C.climb = -1.4; return; }   // (it has missed everything: the ground will do)
    let Q = C.q; if (Q) { const hd = Math.hypot(Q.x - C.pos.x, Q.z - C.pos.z); if (hd < 16 || C.qT > 5) Q = null; }
    if (!Q) { Q = C.q = wall(C); C.qT = 0; }
    if (!Q) { C.turn = 0.5 * (C.spin || (C.spin = Math.random() < 0.5 ? -1 : 1)); C.climb = clamp(-C.pitch * 2, -0.6, 0.6); return; }
    const dx = Q.x - C.pos.x, dy = Q.y - C.pos.y, dz = Q.z - C.pos.z, hd = Math.hypot(dx, dz);
    C.turn = clamp(wrap(Math.atan2(-dx, -dz) - C.yaw) * 2.6, -2.1, 2.1); C.climb = clamp((Math.atan2(dy, hd + 1) - C.pitch) * 4.5, -1.5, 1.5);
  }
  const eta = C => C.q ? Math.hypot(C.q.x - C.pos.x, C.q.y - C.pos.y, C.q.z - C.pos.z) / Math.max(30, C.speed) : 9;

  // ── the fight, in beats: who is sent to the fire, how it is watched, and what is looked at before the next
  const BEATS = [
    { n: 1, cam: 'solo', lens: 'lead', fill: ['flyby', 'zeus', 2.0] },
    { n: 2, cam: 'wide', fill: ['chase', 'any', 1.9] },
    { n: 1, cam: 'solo', lens: 'chase', fill: ['lead', 'zeus', 2.1] },
    { n: 3, cam: 'wide', fill: ['flyby', 'any', 1.8] },
    { n: 1, cam: 'solo', lens: 'lead', fill: ['chase', 'zeus', 2.0] },
    { n: 2, cam: 'wide', fill: ['flyby', 'zeus', 1.7] },
    { n: 1, cam: 'solo', lens: 'chase', fill: null },
  ];
  let bi = -1, stage = 'open', stT = 0, group = [], slow = 0, cur = null;
  function nextBeat() {
    bi++; const B = BEATS[bi], live = others(), Z = F.zeus; if (!B || !live.length) { stage = 'wait'; return; }
    // for one alone, the one nearest the fire of Zeus; for a few together, the ones nearest each other
    if (B.n === 1) live.sort((a, b) => a.pos.distanceToSquared(Z.pos) - b.pos.distanceToSquared(Z.pos)); else { const s = live[Math.floor(Math.random() * live.length)]; live.sort((a, b) => a.pos.distanceToSquared(s.pos) - b.pos.distanceToSquared(s.pos)); }
    group = live.slice(0, B.n); for (const C of group) doom(C);
    stage = 'kill'; stT = el(); cur = null; B.went = false;
    if (B.cam !== 'solo') take(B.cam, { c: mid(group, new V3()) });
  }
  function tally() { const t = el(); for (const C of M.cpus) if (!C.alive && C.deadAt === undefined) { C.deadAt = t; C.deadPos = C.pos.clone(); F.kills.push([F.frame, C.name, +t.toFixed(1)]); said(C, others().length + 1); } }
  function live(dt) {
    const t = el(), B = BEATS[bi];
    for (const C of M.cpus) if (C.alive && C.doom !== undefined) steer(C, dt);
    tally();
    if (stage === 'open') { if (!shot || shot.kind !== 'chase') take('chase', { C: F.zeus }); if (t > 2.0) nextBeat(); }
    else if (stage === 'kill') {
      const left = group.filter(c => c.alive);
      if (B.cam !== 'solo' && !B.went && left.length && t - stT > 3.2) B.went = true;   // (they are taking their time: go in close on whoever is left)
      if (B.cam === 'solo' || B.went) { const L = B.lens || 'chase';
        if (!cur || (!cur.alive && left.length && t - cur.deadAt > 1.2)) { cur = left[0] || group[0]; take(L, { C: cur }); }
        const C = cur;
        if (C.alive && shot.kind !== 'kill' && C.q && eta(C) < 1.15) { fwd(C, _a); right(C, _b); const side = shot.side; const tri = new V3(C.q.x, C.q.y, C.q.z).addScaledVector(_b, side * 150).addScaledVector(_a, 40); tri.y += 26; floor(tri); take('kill', { C, tri, at: new V3(C.q.x, C.q.y, C.q.z), side }); if (B.cam === 'solo') slow = 2.6; }
        else if (C.alive && shot.kind === 'kill' && shot.tri.distanceTo(C.pos) > 380 && eta(C) > 1.6) take(L, { C });   // (it missed: go with it again)
        if (!C.alive && shot.kind !== 'kill') { const tri = C.deadPos.clone(); fwd(C, _a); right(C, _b); tri.addScaledVector(_b, shot.side * 150).addScaledVector(_a, -30); tri.y += 26; floor(tri); take('kill', { C, tri, at: C.deadPos.clone() }); }
        if (!C.alive && shot.kind === 'kill') shot.at = C.deadPos;
      } else if (shot.c) mid(group, shot.c);
      if (!left.length) { stage = 'hold'; stT = t; }
      else if (t - stT > 11) { for (const C of left) I.matchSetOut(C.id, 'the fire', false); }   // (should never be needed)
    }
    else if (stage === 'hold') { if (t - stT > (B.cam === 'solo' ? 2.0 : 1.3)) { if (!B.fill || !others().length) { stage = 'wait'; } else { const [kind, who] = B.fill, o = others(), C = who === 'zeus' ? F.zeus : o[Math.floor(Math.random() * o.length)]; take(kind, { C }); stage = 'fill'; stT = t; } } }
    else if (stage === 'fill') { if (t - stT > B.fill[2] || (shot.C && !shot.C.alive)) nextBeat(); }
    run(dt);
  }
  function finale(dt) {
    tally(); if (F.overT === undefined) { F.overT = el(); const Z = F.zeus, ax = Z.pos.x - M.cx, az = Z.pos.z - M.cz, al = Math.hypot(ax, az) || 1; Z.tgt.set(M.cx + ax / al * 1250, I.SUMMIT + 330, M.cz + az / al * 1250); Z.tgtT = 1e9; }   // (out into open sky)
    if (el() - F.overT < 1.7 && shot) { if (shot.kind === 'kill' && shot.C && !shot.C.alive) shot.at = shot.C.deadPos; return run(dt); }   // (the last of them, burning, a moment longer)
    if (F.phase !== 'end') { F.phase = 'end'; F.endT = el(); F.endF = F.frame + Math.round(4.4 * FPS); const Z = F.zeus; take('lead', { C: Z, side: 1 });
      I.strike(Z.pos.x - Math.sin(Z.yaw) * 260, Math.max(I.groundAt(Z.pos.x, Z.pos.z, 1e5), I.WATER), Z.pos.z - Math.cos(Z.yaw) * 260, 1); }
    const t = el() - F.endT, Z = F.zeus;
    if (t > 1.7 && shot.kind !== 'crown') take('crown', { C: Z, a0: Z.yaw + 0.6 });
    if (F.frame === F.endF - 22) I.strike(Z.pos.x + 60, Math.max(I.groundAt(Z.pos.x, Z.pos.z, 1e5), I.WATER), Z.pos.z + 60, 1);
    run(dt);
    if (F.frame >= F.endF) F.done = true;
  }
  function direct(dt) {
    const now = Date.now();
    if (M.phase === 'count') {
      if (!M.placed) { D.on = false; return; }
      if (now < M.t0 - 3000) { D.on = false; F.phase = 'intro'; if (M.intro && !F.rolling) { F.rolling = true; F.shot0 = F.frame; } return; }   // (the game's own opening, and its own lens)
      if (F.phase !== 'count') { F.phase = 'count'; cut = true; }
      const u = 1 - (M.t0 - now) / 3000, a = 2.2 + u * 0.35; wp.set(M.cx + Math.sin(a) * lerp(1500, 1180, u), I.SUMMIT + lerp(640, 430, u), M.cz + Math.cos(a) * lerp(1500, 1180, u)); wl.set(M.cx, I.SUMMIT + 130, M.cz); wfov = 56; lens(dt, 4, 6); return;
    }
    if (M.phase === 'live') { F.phase = 'live'; live(dt); return; }
    if (M.phase === 'over' || F.phase === 'end') finale(dt);
  }

  F.start = () => {
    clockOn(); dress();
    I.setStorm(0); I.setDay(0.955);
    I.MINTRO.roll.war = 9600; M.cool = 0;
    I.matchWar(12, true);
    if (M.phase !== 'count' || M.cpus.length !== 12) return (F.err = 'the warzone did not start: ' + M.phase + ' ' + M.cpus.length);
    M.cpus.slice().sort((a, b) => a.id < b.id ? -1 : 1).forEach((C, k) => { const pat = ORDER[k]; C.pat = pat; C.name = pat.toUpperCase(); M.roster.get(C.id).name = C.name; I.peerOf(C.id).name = C.name; C.skill = 0.8;
      C.v0 = C.speed = 70 + Math.random() * 8; if (pat === 'zeus') { C.charm = true; C.skill = 1; C.v0 = C.speed = 82; F.zeus = C; } });
    F.phase = 'pre'; return 'ok';
  };
  // one frame of film: two steps of the game (one, where it is slowed)
  F.step = () => {
    try {
      const n = slow > 0 ? 1 : 2; if (slow > 0) slow -= 1 / FPS;
      for (let s = 0; s < n; s++) { vt += 1000 / 60; runTimers(); I.setDay(0.955); if (I.TOAST) I.TOAST.until = 0; direct(1 / 60); I.step(1); }
      anims(); glass(); F.frame++;
    } catch (e) { F.err = String(e && e.stack || e); }
    return { f: F.frame, phase: F.phase, rolling: F.rolling, alive: M.cpus.filter(c => c.alive).length, done: F.done, err: F.err, stage, bi };
  };
})();
