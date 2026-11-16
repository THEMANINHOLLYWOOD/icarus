async (page) => {
  // THE OTHER WAYS DOWN AND UP: a man swimming down through deep water comes out of the roof below, falling, and can catch
  // fire before the ground has him; a man driving into deep sea faster than a fall can carry him goes straight through (the "through" rule); from a
  // swim he can turn and rise out of the deep; a throat in the earth goes down and its shaft of day comes back up; dying
  // below, or choosing to go home, wakes him on Olympus.
  return await page.evaluate(async () => {
    const I = window.__icarus, wait = ms => new Promise(r => setTimeout(r, ms)), p = I.player, out = { ok: false }, fail = [];
    const until = async (f, ms) => { const t0 = performance.now(); while (performance.now() - t0 < ms) { if (f()) return true; await wait(150); } return false; };
    const deepNear = () => { for (let r = 0; r < 9000; r += 250) for (let a = 0; a < 6.28; a += 0.26) { const x = p.pos.x + Math.cos(a) * r, z = p.pos.z + Math.sin(a) * r; if (I.terrainAt(x, z) < -90 && [[70, 0], [-70, 0], [0, 70], [0, -70]].every(([dx, dz]) => I.terrainAt(x + dx, z + dz) < -70)) return { x, z }; } return null; };
    const home = async () => { if (I.realm === 'under') I.setRealm('over', p.pos.x, p.pos.z); I.toHumanTest(); await wait(1200); };
    const catchFire = async () => { for (let i = 0; i < 12 && p.form !== 'phoenix'; i++) { I.pressSpace(); await wait(300); } return p.form === 'phoenix'; };
    I.story.phase = 'gods'; I.INV.q = 9; I.UNDER.done = true;
    if (I.realm !== 'over') { I.setRealm('over'); await wait(1500); }
    // 1. swimming down, as a man
    { const s = deepNear(); I.toHumanTest(); p.pos.set(s.x, I.WATER, s.z); p.swim = true; p.grounded = true; p.fallTop = p.pos.y; await wait(300);
      const dove = I.humanDive?.(); out.dive = { started: !!dove };
      I.keys.KeyS = true; const ok = await until(() => I.realm === 'under', 30000); I.keys.KeyS = false;
      out.dive.through = ok; out.dive.y = Math.round(p.pos.y - I.UNDER.ceil);
      if (!ok) fail.push('swimming down as a man never came through');
      else { const lit = await catchFire(); await wait(2500); out.dive.lit = lit; out.dive.state = I.state; if (!lit) fail.push('could not catch fire after coming through'); if (I.state === 'dead') fail.push('died after swimming through'); } }
    // 2. falling hard into deep sea
    await home();
    { const s = deepNear(); I.toHumanTest(); p.pos.set(s.x, I.WATER + 0.3, s.z); p.vel.set(0, -95, 0); p.grounded = false; p.fallTop = p.pos.y; p.tumble = false; I.startPlunge();   // (the moment he hits the water, driving)
      const ok = await until(() => I.realm === 'under', 20000); out.plunge = { through: ok, y: Math.round(p.pos.y - I.UNDER.ceil) };
      if (!ok) fail.push('a hard fall into the sea did not go through');
      else { const lit = await catchFire(); await wait(2500); out.plunge.lit = lit; out.plunge.state = I.state; if (I.state === 'dead') fail.push('died after falling through'); } }
    // 3. a swim, and up out of the deep
    await home();
    { const s = deepNear(); I.toHumanTest(); p.pos.set(s.x, I.WATER, s.z); p.swim = true; p.grounded = true; p.fallTop = p.pos.y; await wait(300); I.humanDive?.(); await wait(1500);
      I.riseFromDeep(); const ok = await until(() => !p.dive, 15000); out.rise = { up: ok, realm: I.realm, y: Math.round(p.pos.y - I.WATER), state: I.state };
      if (!ok || I.realm !== 'over') fail.push('did not rise out of the deep'); }
    // 4. a throat in the earth: down, and back up the shaft
    await home();
    { let S = null; const C = I.CAVE.C, cx = Math.floor(p.pos.x / C), cz = Math.floor(p.pos.z / C);
      for (let r = 0; r < 6 && !S; r++) for (let j = -r; j <= r && !S; j++) for (let i = -r; i <= r && !S; i++) S = I.caveSite(cx + i, cz + j);
      out.cave = S ? { x: Math.round(S.x), z: Math.round(S.z) } : null;
      if (S) { I.caveDown(S); await wait(2500); out.cave.down = I.realm; const lit = await catchFire(); await wait(1500);
        out.cave.lit = lit; out.cave.where = I.hadesWhere(p.pos.x, p.pos.z); out.cave.state = I.state; if (I.realm !== 'under') fail.push('the throat did not take him down'); if (I.state === 'dead') fail.push('died coming down the throat');
        I.caveUp(S); await wait(2500); out.cave.up = I.realm; out.cave.stateUp = I.state; if (I.realm !== 'over') fail.push('the shaft did not bring him up'); if (I.state === 'dead') fail.push('died coming up the shaft'); }
      else out.cave = 'none near'; }
    // 5. dying below: Olympus
    { I.setRealm('under', p.pos.x, p.pos.z, p.yaw); await wait(1500); const A = I.UNDER.arrive; I.toHumanTest(); p.pos.set(A.x, I.groundAt(A.x, A.z) + 0.2, A.z); p.vel.set(0, 0, 0); p.fallTop = p.pos.y; p.grounded = true; await wait(800);
      I.die('undead'); const ok = await until(() => I.realm === 'over' && I.state === 'play', 30000); await wait(6000);
      out.death = { back: ok, state: I.state }; if (!ok) fail.push('not given back after dying below'); if (I.state === 'dead') fail.push('died again after waking'); }
    // 6. choosing to go home from below
    { I.setRealm('under', p.pos.x, p.pos.z, p.yaw); await wait(1500); const A = I.UNDER.arrive; I.toHumanTest(); p.pos.set(A.x, I.groundAt(A.x, A.z) + 0.2, A.z); p.vel.set(0, 0, 0); p.fallTop = p.pos.y; p.grounded = true; await wait(800);
      I.respawnTop(); const ok = await until(() => I.realm === 'over' && I.state === 'play', 20000); await wait(4000);
      out.home = { back: ok, state: I.state, form: p.form }; if (!ok) fail.push('going home from below did not work'); if (I.state === 'dead') fail.push('died going home'); }
    out.fail = fail; out.ok = !fail.length; return out;
  });
}
