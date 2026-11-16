async (page) => {
  // A GOD'S ERRAND BELOW ("go down into the Underworld, and come back up alive"): asked after an earlier trip down, it is
  // not done already; the tracker points at a way down (deep water) and Shift+J carries him there, alive; below, the line
  // says to come back up, through the sea overhead, and fast travel does not carry him anywhere down here; dying down there does not count;
  // flying up out through the sea does, and pays: the gift, a thing in his bag, the log.
  return await page.evaluate(async () => {
    const I = window.__icarus, wait = ms => new Promise(r => setTimeout(r, ms)), p = I.player, out = { ok: false }, fail = [];
    const until = async (f, ms) => { const t0 = performance.now(); while (performance.now() - t0 < ms) { if (f()) return true; await wait(150); } return false; };
    const shown = re => [...document.querySelectorAll('#markers .mk')].some(m => m.style.display !== 'none' && re.test(m.textContent));
    const track = () => document.getElementById('qtrack').textContent;
    const deepNear = () => { for (let r = 0; r < 9000; r += 250) for (let a = 0; a < 6.28; a += 0.26) { const x = p.pos.x + Math.cos(a) * r, z = p.pos.z + Math.sin(a) * r; if (I.terrainAt(x, z) < -90 && [[70, 0], [-70, 0], [0, 70], [0, -70]].every(([dx, dz]) => I.terrainAt(x + dx, z + dz) < -70)) return { x, z }; } return null; };
    const down = async () => { for (let k = 0; k < 4; k++) {   // (just after waking on Olympus he may not take the bird at once: again, until he does)
        await until(() => I.state === 'play' && !p.cine, 40000); const s = deepNear(); if (!s) return false; if (p.form !== 'phoenix') { I.toBird(); await wait(900); } if (p.form !== 'phoenix') continue;
        p.pos.set(s.x, I.WATER + 4, s.z); p.pitch = -1; p.speed = 140; p.fallTop = p.pos.y; I.enterSea(-1); if (!p.sub) { await wait(800); continue; } I.keys.KeyS = true;
        const ok = await until(() => I.realm === 'under' && !p.sub, 40000); I.keys.KeyS = false; await wait(2500); if (!ok) out.downWhy = { state: I.state, realm: I.realm, sub: p.sub && { dir: p.sub.dir, wet: p.sub.wet, t: Math.round(p.sub.t) }, y: Math.round(p.pos.y), form: p.form }; return ok; }
      out.downWhy = { gaveUp: true, state: I.state, cine: !!p.cine, form: p.form, sub: !!p.sub }; return false; };
    const up = async () => { await until(() => I.state === 'play' && !p.cine, 40000); if (p.form !== 'phoenix') { I.toBird(); await wait(700); }   // (into the sea overhead, somewhere the roof is water)
      let x = p.pos.x, z = p.pos.z; for (let r = 0; r < 3000 && I.underRoof(x, z) < I.UNDER.ceil - 2; r += 100) { x = p.pos.x + r; }
      p.pos.set(x, I.UNDER.ceil - 30, z); p.pitch = 1; p.speed = 120; p.vy = 0; p.fallTop = p.pos.y; I.keys.KeyW = true;
      const ok = await until(() => I.realm === 'over' && !p.sub, 40000); I.keys.KeyW = false; await wait(1500); return ok; };
    I.story.phase = 'gods'; I.INV.q = 9; I.UNDER.done = true;   // (the story told: only the errand is being tested)
    if (I.realm === 'under') await up();
    // an earlier trip down and back, before anyone asks
    if (!await down()) { out.fail = ['could not go down']; return out; }
    if (!await up()) { out.fail = ['could not come up']; return out; }
    const g = I.godById.poseidon; I.story.met.add('poseidon'); I.setQuest(g, 'under', 1, 'tide'); I.story.track = 'q:poseidon';
    await wait(1500);
    const q = I.questOf('poseidon'); out.doneAtOnce = q.done; if (q.done) fail.push('done the moment it was asked (an old trip counted)');
    // the way down
    const e = I.qlActive().find(e => e.key === 'q:poseidon'), w = I.qlWhere(e);
    out.wayDown = w && { x: Math.round(w.x), z: Math.round(w.z), ground: Math.round(I.terrainAt(w.x, w.z)) };
    if (!w) fail.push('no way down marked'); else if (I.terrainAt(w.x, w.z) > I.WATER - 8) fail.push('the way down is not deep water');
    out.trackOver = track();
    if (w) { I.setCamYaw(Math.atan2(p.pos.x - w.x, p.pos.z - w.z)); await wait(1500); out.markOver = shown(/POSEIDON ·/); if (!out.markOver) fail.push('no marker for the way down'); }
    // carried there
    if (w) { I.qlGo('q:poseidon'); await until(() => I.state === 'warp', 3000); await until(() => I.state === 'play', 15000);
      out.afterGo = { state: I.state, d: Math.round(Math.hypot(p.pos.x - w.x, p.pos.z - w.z)), alt: Math.round(p.pos.y - Math.max(I.terrainAt(p.pos.x, p.pos.z), I.WATER)) };
      await wait(2500); out.afterGo.later = I.state; if (I.state !== 'play') fail.push('not set down after fast travel, or dead after'); if (out.afterGo.d > 260) fail.push('fast travel did not go to the way down'); }
    // down
    if (!await down()) { fail.push('could not go down for it'); out.fail = fail; return out; }
    out.trackUnder = track(); if (!/now come back up/i.test(out.trackUnder)) fail.push('below, the line does not say to come back up'); if (!/THROUGH THE SEA OVERHEAD/.test(out.trackUnder)) fail.push('below, the line does not say which way is up');
    const eu = I.qlActive().find(e => e.key === 'q:poseidon'), wu = I.qlWhere(eu);
    out.wayUp = wu; if (wu) fail.push('marked at a place below (the way up is overhead)');
    { const x0 = p.pos.x, z0 = p.pos.z, went = I.qlGo('q:poseidon'); await wait(600);
      out.goBelow = { went, state: I.state, realm: I.realm, moved: Math.round(Math.hypot(p.pos.x - x0, p.pos.z - z0)), toast: document.getElementById('toast').textContent };
      if (went || I.state === 'warp') fail.push('fast travel below carried him somewhere'); if (!/OVER YOUR HEAD/.test(out.goBelow.toast)) fail.push('no word of the way up'); }
    // dying down here is not coming back up alive
    I.die('undead'); await until(() => I.realm === 'over' && I.state === 'play', 30000); await wait(1500);
    out.doneByDying = q.done; if (q.done) fail.push('dying below counted as coming back');
    // down again, and up out of the sea
    if (!await down()) { fail.push('could not go down again'); out.fail = fail; return out; }
    const items0 = (I.story.items || []).length, tide0 = I.perks.tide;
    if (!await up()) { fail.push('could not come up'); out.fail = fail; return out; }
    await until(() => q.done, 5000); await wait(800);
    out.done = q.done; if (!q.done) fail.push('not done after coming back up');
    out.paid = { tide: I.perks.tide - tide0, items: (I.story.items || []).length - items0, log: I.story.qlog?.[0]?.god };
    if (out.paid.tide !== 1) fail.push('no gift'); if (out.paid.items !== 1) fail.push('nothing in his bag'); if (out.paid.log !== 'poseidon') fail.push('not in the log');
    out.state = I.state; if (I.state === 'dead') fail.push('dead at the end');
    out.fail = fail; out.ok = !fail.length; return out;
  });
}
