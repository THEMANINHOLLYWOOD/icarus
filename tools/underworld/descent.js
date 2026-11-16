async (page) => {
  // THE WAY DOWN: the objective points under the water once he knows; the burning bird dives into deep sea and comes out
  // of the roof of the Underworld; Hades' house, the Styx and the regions are laid out; he arrives somewhere that does not
  // kill him; the objective now reads "cross the Styx", and the ferryman is marked.
  return await page.evaluate(async () => {
    const I = window.__icarus, wait = ms => new Promise(r => setTimeout(r, ms)), p = I.player, out = { ok: false }, fail = [];
    const until = async (f, ms) => { const t0 = performance.now(); while (performance.now() - t0 < ms) { if (f()) return true; await wait(150); } return false; };
    const obj = () => document.getElementById('obj').textContent;
    if (I.realm !== 'over') I.setRealm('over');
    I.story.phase = 'gods'; I.INV.q = 9; I.UNDER.known = false;   // (past the axe, so the line at the top is the chain's)
    await wait(400);
    out.objBefore = obj();
    I.UNDER.known = true; await wait(400);
    out.objKnown = obj(); if (!/THE LOST ARE UNDER THE WATER/.test(out.objKnown)) fail.push('objective does not point under the water');
    // deep water near him
    let sea = null; for (let r = 300; r < 9000 && !sea; r += 300) for (let a = 0; a < 6.28 && !sea; a += 0.26) { const x = p.pos.x + Math.cos(a) * r, z = p.pos.z + Math.sin(a) * r; if (I.terrainAt(x, z) < -90 && I.terrainAt(x + 70, z) < -70 && I.terrainAt(x - 70, z) < -70 && I.terrainAt(x, z + 70) < -70 && I.terrainAt(x, z - 70) < -70) sea = { x, z }; }
    if (!sea) { fail.push('no deep sea'); out.fail = fail; return out; }
    // the bird, low over it, diving: the plunge
    if (p.form !== 'phoenix') { I.toBird?.(); await wait(800); }
    p.pos.set(sea.x, I.WATER + 4, sea.z); p.pitch = -1; p.speed = 140; p.fallTop = p.pos.y; p.vy = 0; await wait(100);
    I.enterSea(-1); I.keys.KeyS = true;   // (in the water the bird swims where it is: S takes it on down)
    const down = await until(() => I.realm === 'under' && !p.sub, 40000); I.keys.KeyS = false;
    if (!down) { fail.push('never came out underneath'); out.sub = !!p.sub; out.realm = I.realm; out.fail = fail; return out; }
    await wait(1500);
    const H = I.UNDER.hades, A = I.UNDER.arrive;
    out.arrive = A && { x: Math.round(A.x), z: Math.round(A.z), where: I.hadesWhere(A.x, A.z), what: I.hlWhat(A.x, A.z), g: Math.round(I.groundAt(A.x, A.z)) };
    out.hades = H && { x: Math.round(H.x), z: Math.round(H.z), y: Math.round(H.y), where: I.hadesWhere(I.hades.x, I.hades.z), standY: Math.round(I.hades.gy), ground: Math.round(I.groundAt(I.hades.x, I.hades.z)) };
    out.styx = { on: I.STYX.on, R: Math.round(I.STYX.R), out: I.STYX.out && [Math.round(I.STYX.out.x), Math.round(I.STYX.out.z)], in: I.STYX.in && [Math.round(I.STYX.in.x), Math.round(I.STYX.in.z)] };
    if (!H) fail.push('no house of Hades'); if (!I.STYX.on) fail.push('no Styx'); if (!I.HL.on) fail.push('no regions');
    if (out.arrive && /tartarus/.test(out.arrive.where)) fail.push('arrived over Tartarus');
    // he falls out of the roof as the bird: let him fly a little, then land him on his feet where he came down
    await wait(3000);
    out.afterFall = { state: I.state, realm: I.realm, form: p.form, y: Math.round(p.pos.y), ground: Math.round(I.groundAt(p.pos.x, p.pos.z)) };
    if (I.state === 'dead') fail.push('died on arrival');
    out.obj = obj(); if (!/CROSS THE STYX/.test(out.obj)) fail.push('objective does not say cross the Styx');
    // the ferryman marked: look at him from beside where he is
    I.toHumanTest(); const L = I.STYX.out, gx = L.x + (A.x - L.x) / Math.hypot(A.x - L.x, A.z - L.z) * 120, gz = L.z + (A.z - L.z) / Math.hypot(A.x - L.x, A.z - L.z) * 120;
    p.pos.set(gx, I.groundAt(gx, gz) + 0.5, gz); p.vel.set(0, 0, 0); p.fallTop = p.pos.y; p.flame = 1;
    I.setCamYaw(Math.atan2(gx - L.x, gz - L.z)); await wait(2500);
    const mk = [...document.querySelectorAll('#markers .mk')].filter(m => m.style.display !== 'none').map(m => m.textContent);
    out.markers = mk.filter(t => /FERRYMAN|HADES/.test(t));
    if (!mk.some(t => /THE FERRYMAN/.test(t))) fail.push('the ferryman is not marked');
    out.objNear = obj();
    out.state = I.state; if (I.state === 'dead') fail.push('died by the Styx');
    out.fail = fail; out.ok = !fail.length; return out;
  });
}
