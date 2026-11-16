async (page) => {
  // A STORY WITH A PART BELOW: a god's saga whose first part is "go down and come back up alive". It is not done by a trip
  // made before it was told; the tracker shows the part and a way down; going down and flying back up finishes the part and
  // the next one is put to him.
  return await page.evaluate(async () => {
    const I = window.__icarus, wait = ms => new Promise(r => setTimeout(r, ms)), p = I.player, out = { ok: false }, fail = [];
    const until = async (f, ms) => { const t0 = performance.now(); while (performance.now() - t0 < ms) { if (f()) return true; await wait(150); } return false; };
    const track = () => document.getElementById('qtrack').textContent;
    const deepNear = () => { for (let r = 0; r < 9000; r += 250) for (let a = 0; a < 6.28; a += 0.26) { const x = p.pos.x + Math.cos(a) * r, z = p.pos.z + Math.sin(a) * r; if (I.terrainAt(x, z) < -90 && [[70, 0], [-70, 0], [0, 70], [0, -70]].every(([dx, dz]) => I.terrainAt(x + dx, z + dz) < -70)) return { x, z }; } return null; };
    const down = async () => { for (let k = 0; k < 4; k++) {   // (just after waking on Olympus he may not take the bird at once: again, until he does)
        await until(() => I.state === 'play' && !p.cine, 40000); const s = deepNear(); if (!s) return false; if (p.form !== 'phoenix') { I.toBird(); await wait(900); } if (p.form !== 'phoenix') continue;
        p.pos.set(s.x, I.WATER + 4, s.z); p.pitch = -1; p.speed = 140; p.fallTop = p.pos.y; I.enterSea(-1); if (!p.sub) { await wait(800); continue; } I.keys.KeyS = true;
        const ok = await until(() => I.realm === 'under' && !p.sub, 40000); I.keys.KeyS = false; await wait(2500); return ok; } return false; };
    const up = async () => { await until(() => I.state === 'play' && !p.cine, 40000); if (p.form !== 'phoenix') { I.toBird(); await wait(700); }
      let x = p.pos.x, z = p.pos.z; for (let r = 0; r < 3000 && I.underRoof(x, z) < I.UNDER.ceil - 2; r += 100) { x = p.pos.x + r; }
      p.pos.set(x, I.UNDER.ceil - 30, z); p.pitch = 1; p.speed = 120; p.vy = 0; p.fallTop = p.pos.y; I.keys.KeyW = true;
      const ok = await until(() => I.realm === 'over' && !p.sub, 40000); I.keys.KeyW = false; await wait(1500); return ok; };
    I.story.phase = 'gods'; I.INV.q = 9; I.UNDER.done = true; I.story.saga = null;
    if (I.realm === 'under') await up();
    if (!await down() || !await up()) { out.fail = ['could not go down and up first']; return out; }
    const g = I.godById.athena;
    const S = { title: 'ZZTEST The Long Way Round', why: 'Athena wants to know he can come back from where nobody comes back.', reward: 'feather',
      steps: [{ kind: 'under', say: 'Go down under the water, among the dead, and come back up to me alive.' }, { kind: 'perfect', n: 1, say: 'Now land as if you meant to.' }] };
    if (!I.sagaStart(g, S)) { out.fail = ['the saga did not start']; return out; }
    I.story.track = 'q:athena'; await wait(1500);
    const q = I.questOf('athena'); out.part = q && { kind: q.kind, sg: q.sg, done: q.done }; if (!q || q.kind !== 'under') { out.fail = ['first part is not the trip below']; return out; }
    if (q.done || I.story.saga?.i !== 0) fail.push('the first part was done at once');
    out.trackOver = track(); if (!/1 of 2/.test(out.trackOver)) fail.push('tracker does not show the part');
    const w = I.qlWhere(I.qlActive().find(e => e.key === 'q:athena')); out.wayDown = w && { x: Math.round(w.x), z: Math.round(w.z), ground: Math.round(I.terrainAt(w.x, w.z)) };
    if (!w || I.terrainAt(w.x, w.z) > I.WATER - 8) fail.push('no way down marked');
    if (!await down()) { fail.push('could not go down'); out.fail = fail; return out; }
    out.trackUnder = track(); if (!/now come back up/i.test(out.trackUnder)) fail.push('below, the line does not say to come back up');
    if (!await up()) { fail.push('could not come up'); out.fail = fail; return out; }
    await until(() => I.story.saga && I.story.saga.i === 1 && I.questOf('athena') && I.questOf('athena').kind === 'perfect', 8000);
    out.after = { i: I.story.saga?.i, kind: I.questOf('athena')?.kind };
    if (out.after.i !== 1 || out.after.kind !== 'perfect') fail.push('the next part was not put to him');
    out.trackAfter = track();
    out.fail = fail; out.ok = !fail.length; return out;
  });
}
