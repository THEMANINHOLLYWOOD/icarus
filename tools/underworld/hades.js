async (page) => {
  // FINDING HADES: over the river, the way from the far bank to his house does not burn (water on it can be swum); he speaks to him
  // when he comes up to him on foot; what he says ends the story (the ending plays, the screen says so, a key wakes him);
  // after that the objective is empty and Hades is no longer marked.
  return await page.evaluate(async () => {
    const I = window.__icarus, wait = ms => new Promise(r => setTimeout(r, ms)), p = I.player, out = { ok: false }, fail = [];
    const until = async (f, ms) => { const t0 = performance.now(); while (performance.now() - t0 < ms) { if (f()) return true; await wait(150); } return false; };
    const obj = () => document.getElementById('obj').textContent, shown = re => [...document.querySelectorAll('#markers .mk')].some(m => m.style.display !== 'none' && re.test(m.textContent));
    const stand = (x, z, face) => { I.toHumanTest(); p.pos.set(x, I.groundAt(x, z) + 0.2, z); p.vel.set(0, 0, 0); p.fallTop = p.pos.y; p.flame = 1; p.grounded = true; if (face != null) I.setCamYaw(face); };
    I.story.phase = 'gods'; I.INV.q = 9; I.UNDER.done = false;
    if (I.realm !== 'under') { I.setRealm('under', p.pos.x, p.pos.z, p.yaw); const A = I.UNDER.arrive; I.toHumanTest(); p.pos.set(A.x, I.groundAt(A.x, A.z) + 0.2, A.z); p.vel.set(0, 0, 0); p.fallTop = p.pos.y; p.grounded = true; await wait(1500); }   // (set down on the ground where he came in: left up by the roof, the bird would fly straight back out through it)
    const S = I.STYX, h = I.hades; if (!S.on || !h.active) { out.fail = ['no Styx or Hades']; return out; }
    // set down on the far bank, as the boat leaves him
    I.UNDER.crossed = true; I.UNDER.side = -1; stand(S.in.x, S.in.z); await wait(1500);
    // the walk to his house, in steps of 40 m: none of it under water, on a mountain of fire, or over the pit
    const path = []; let wet = 0; { const n = Math.ceil(Math.hypot(h.x - S.in.x, h.z - S.in.z) / 40);
      for (let i = 0; i <= n; i++) { const x = S.in.x + (h.x - S.in.x) * i / n, z = S.in.z + (h.z - S.in.z) * i / n, g = I.groundAt(x, z), w = I.hadesWhere(x, z), k = I.hlWhat(x, z); const fire = w === 'tartarus' || k === 'cone' || I.HL.falls.some(f => f.pool && Math.hypot(x - f.x, z - f.z) < f.pr + 6); if (g < I.WATER) wet++; if (fire) path.push({ i, x: Math.round(x), z: Math.round(z), g: Math.round(g), w, k }); } }
    out.badPath = path.slice(0, 6); out.wetSteps = wet; if (path.length) fail.push(`${path.length} steps of the way to Hades are fire`);
    out.hades = { x: Math.round(h.x), z: Math.round(h.z), gy: Math.round(h.gy), ground: Math.round(I.groundAt(h.x, h.z, h.gy + 2)), where: I.hadesWhere(h.x, h.z) };
    // halfway there, looking at him: he is marked and the line says to find him
    const mx = (S.in.x + h.x) / 2, mz = (S.in.z + h.z) / 2; stand(mx, mz, Math.atan2(mx - h.x, mz - h.z)); await wait(2500);
    out.marked = shown(/HADES ·/); if (!out.marked) fail.push('Hades not marked on the way');
    out.objWay = obj(); if (!/FIND HADES/.test(out.objWay)) fail.push('objective on the way is not find Hades');
    if (I.state === 'dead') fail.push('died on the way');
    // up to him, on foot, in front of him (he faces the door)
    const fx = h.x - Math.sin(h.yaw) * 7, fz = h.z - Math.cos(h.yaw) * 7; stand(fx, fz, Math.atan2(fx - h.x, fz - h.z)); h.greeted = false; h.coolUntil = 0;
    out.front = { gy: Math.round(p.pos.y), hgy: Math.round(h.gy) };
    if (!await until(() => I.state === 'talk', 10000)) { fail.push('Hades did not speak'); out.stateNow = I.state; out.fail = fail; return out; }
    out.talkWith = I.talk.god?.id;
    for (let i = 0; i < 80 && I.state === 'talk'; i++) { I.fallbackNext(false); await wait(400); }
    if (!await until(() => I.state === 'end', 5000)) { fail.push('the ending did not begin'); out.stateNow = I.state; out.fail = fail; return out; }
    out.done = I.UNDER.done; if (!I.UNDER.done) fail.push('not marked done');
    // the ending's lines, quickly, then the screen, then a touch to wake
    for (let i = 0; i < 120 && document.getElementById('end').classList.contains('hidden'); i++) { I.dlg.cur = null; await wait(250); }
    if (document.getElementById('end').classList.contains('hidden')) fail.push('the end screen never showed');
    await wait(7600); document.querySelector('canvas').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    if (!await until(() => I.state === 'play', 8000)) fail.push('did not wake after the end');
    await wait(1500);
    out.objAfter = obj(); if (out.objAfter) fail.push('objective not empty after the end');
    out.markedAfter = shown(/HADES ·/); if (out.markedAfter) fail.push('Hades still marked after the end');
    out.stateAfter = I.state; if (I.state === 'dead') fail.push('died after the end');
    out.fail = fail; out.ok = !fail.length; return out;
  });
}
