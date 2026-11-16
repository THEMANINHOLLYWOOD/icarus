async (page) => {
  // THE FERRY: down at the outer bank the ferryman is marked and speaks first; when he has said his piece he takes him over
  // the Styx in the boat; the far bank is dry, does not burn, and is inside the river; the objective turns to Hades and
  // Hades is marked. The way over is the boat: flying at the river throws him back.
  return await page.evaluate(async () => {
    const I = window.__icarus, wait = ms => new Promise(r => setTimeout(r, ms)), p = I.player, out = { ok: false }, fail = [];
    const until = async (f, ms) => { const t0 = performance.now(); while (performance.now() - t0 < ms) { if (f()) return true; await wait(150); } return false; };
    const obj = () => document.getElementById('obj').textContent, shown = re => [...document.querySelectorAll('#markers .mk')].some(m => m.style.display !== 'none' && re.test(m.textContent));
    const stand = (x, z, face) => { I.toHumanTest(); p.pos.set(x, I.groundAt(x, z) + 0.2, z); p.vel.set(0, 0, 0); p.fallTop = p.pos.y; p.flame = 1; p.grounded = true; if (face != null) I.setCamYaw(face); };
    I.story.phase = 'gods'; I.INV.q = 9;
    if (I.realm !== 'under') { I.setRealm('under', p.pos.x, p.pos.z, p.yaw); const A = I.UNDER.arrive; I.toHumanTest(); p.pos.set(A.x, I.groundAt(A.x, A.z) + 0.2, A.z); p.vel.set(0, 0, 0); p.fallTop = p.pos.y; p.grounded = true; await wait(1500); }   // (set down on the ground where he came in: left up by the roof, the bird would fly straight back out through it)
    const S = I.STYX, H = I.UNDER.hades, c = I.otherById.charon; if (!S.on || !H || !c) { out.fail = ['no Styx, Hades or ferryman']; return out; }
    const ux = Math.sin(S.th0), uz = Math.cos(S.th0);   // (out from the house, toward where he came down)
    // the outer bank, a little way back from the ferryman, looking at him
    stand(S.out.x + ux * 60, S.out.z + uz * 60, Math.atan2(ux, uz)); await wait(2500);
    out.objOut = obj(); if (!/CROSS THE STYX — FIND THE FERRYMAN/.test(out.objOut)) fail.push('outer bank objective wrong');
    out.ferrymanMarked = shown(/THE FERRYMAN/); if (!out.ferrymanMarked) fail.push('ferryman not marked');
    out.charon = { x: Math.round(c.x), z: Math.round(c.z), g: Math.round(c.gy), where: I.hadesWhere(c.x, c.z), active: c.active };
    if (c.gy < I.WATER) fail.push('ferryman stands in the water');
    // fly at the river from outside: it throws him back
    { I.toBird(); await wait(600); p.pos.set(S.out.x + ux * 30, I.groundAt(S.out.x, S.out.z) + 30, S.out.z + uz * 30); p.yaw = Math.atan2(ux, uz); p.pitch = 0; p.speed = 60; p.fallTop = p.pos.y; await wait(2500);
      out.flewOver = Math.hypot(p.pos.x - S.x, p.pos.z - S.z) < S.R - S.W; if (out.flewOver) fail.push('the bird flew over the Styx'); }
    // up to him on foot: he speaks first
    const ax = c.x + ux * 6, az = c.z + uz * 6; stand(ax, az, Math.atan2(ux, uz)); c.greeted = false; c.coolUntil = 0;
    if (!await until(() => I.state === 'talk', 8000)) { fail.push('the ferryman did not speak'); out.fail = fail; out.stateNow = I.state; return out; }
    out.talkWith = I.talk.god?.id;
    for (let i = 0; i < 80 && I.state === 'talk'; i++) { I.fallbackNext(false); await wait(400); }
    if (I.state === 'talk') { fail.push('talk never ended'); out.fail = fail; return out; }
    out.boarded = !!p.ferry; if (!p.ferry) fail.push('not taken into the boat');
    if (!await until(() => I.UNDER.crossed && !p.ferry, 60000)) { fail.push('never set down on the far bank'); out.fail = fail; return out; }
    await wait(4000);
    const L = S.in;
    out.farBank = { x: Math.round(p.pos.x), z: Math.round(p.pos.z), g: Math.round(I.groundAt(p.pos.x, p.pos.z)), where: I.hadesWhere(p.pos.x, p.pos.z), what: I.hlWhat(p.pos.x, p.pos.z), state: I.state, side: I.UNDER.side, inside: Math.hypot(p.pos.x - S.x, p.pos.z - S.z) < S.R };
    if (I.state === 'dead') fail.push('died on the far bank'); if (!out.farBank.inside) fail.push('far bank not inside the river'); if (out.farBank.g < I.WATER) fail.push('far bank under water');
    if (/tartarus/.test(out.farBank.where) || out.farBank.what === 'cone' || out.farBank.what === 'wet') fail.push('far bank is in fire');
    out.objIn = obj(); if (!/FIND HADES/.test(out.objIn)) fail.push('inner objective wrong');
    // Hades marked: look at his house
    I.setCamYaw(Math.atan2(p.pos.x - I.hades.x, p.pos.z - I.hades.z)); await wait(2500);
    out.hadesMarked = shown(/HADES ·/); if (!out.hadesMarked) fail.push('Hades not marked');
    out.paid = I.UNDER.paid;
    out.fail = fail; out.ok = !fail.length; return out;
  });
}
