async (page) => {
  // PERSEPHONE: by the door of his house, standing on dry ground that does not burn; Space beside her speaks to her, her
  // two lines play, and she is known after.
  return await page.evaluate(async () => {
    const I = window.__icarus, wait = ms => new Promise(r => setTimeout(r, ms)), p = I.player, out = { ok: false }, fail = [];
    const until = async (f, ms) => { const t0 = performance.now(); while (performance.now() - t0 < ms) { if (f()) return true; await wait(150); } return false; };
    const stand = (x, z, face) => { I.toHumanTest(); p.pos.set(x, I.groundAt(x, z) + 0.2, z); p.vel.set(0, 0, 0); p.fallTop = p.pos.y; p.flame = 1; p.grounded = true; if (face != null) I.setCamYaw(face); };
    I.story.phase = 'gods'; I.INV.q = 9;
    if (I.realm !== 'under') { I.setRealm('under', p.pos.x, p.pos.z, p.yaw); const A = I.UNDER.arrive; I.toHumanTest(); p.pos.set(A.x, I.groundAt(A.x, A.z) + 0.2, A.z); p.vel.set(0, 0, 0); p.fallTop = p.pos.y; p.grounded = true; await wait(1500); }   // (set down on the ground where he came in: left up by the roof, the bird would fly straight back out through it)
    I.UNDER.crossed = true; I.UNDER.side = -1;
    const P = I.otherById.persephone; if (!P.active) { out.fail = ['Persephone is not there']; return out; }
    out.her = { x: Math.round(P.x), z: Math.round(P.z), gy: +P.gy.toFixed(1), ground: +I.groundAt(P.x, P.z).toFixed(1), where: I.hadesWhere(P.x, P.z), what: I.hlWhat(P.x, P.z), fromHades: Math.round(Math.hypot(P.x - I.hades.x, P.z - I.hades.z)) };
    if (P.gy < I.WATER + 0.5 || out.her.what === 'cone' || out.her.what === 'wet' || out.her.where === 'tartarus') fail.push('she stands in water or fire');
    // beside her, on the side away from Hades
    const ax = P.x - I.hades.x, az = P.z - I.hades.z, al = Math.hypot(ax, az) || 1, sx = P.x + ax / al * 4, sz = P.z + az / al * 4;
    stand(sx, sz, Math.atan2(sx - P.x, sz - P.z)); P.coolUntil = 0; await wait(1200);
    out.act = I.spaceAction()?.label || ''; if (!/speak with/.test(out.act)) fail.push('no "speak with" beside her');
    I.pressSpace?.(); if (I.state !== 'talk') { const e = new KeyboardEvent('keydown', { code: 'Space', key: ' ', bubbles: true }); window.dispatchEvent(e); }
    if (!await until(() => I.state === 'talk', 5000)) { fail.push('she did not answer'); out.fail = fail; return out; }
    out.talkWith = I.talk.god?.id; if (out.talkWith !== 'persephone') fail.push(`spoke to ${out.talkWith} instead`);
    for (let i = 0; i < 60 && I.state === 'talk'; i++) { I.fallbackNext(false); await wait(400); }
    await wait(800);
    out.known = I.story.known.has('persephone'); if (!out.known) fail.push('not known after');
    out.state = I.state; if (I.state === 'dead') fail.push('died by the door');
    out.fail = fail; out.ok = !fail.length; return out;
  });
}
