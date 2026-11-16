async (page) => {
  // ERRANDS OF THE UPPER WORLD, SEEN FROM BELOW: every errand the Twelve set is done up in the world (the sea, a waterfall,
  // an island, a beacon, Hermes's rings, a place named in a story, someone to find). Down here none of them may be marked at
  // the upper world's coordinates (which in this country are somewhere else, maybe the far side of the Styx or the pit),
  // and "go there" must not carry him to them: it says they are up in the world. The labours are hidden below too. Back up,
  // the same errands point at real places again.
  return await page.evaluate(async () => {
    const I = window.__icarus, wait = ms => new Promise(r => setTimeout(r, ms)), p = I.player, out = { ok: false, below: {}, above: {} }, fail = [];
    I.story.phase = 'gods'; I.INV.q = 9; I.UNDER.done = true; I.story.saga = null;
    if (I.realm !== 'over') { I.setRealm('over'); await wait(1500); }
    const set = [['hermes', 'arena', 1, 'swift'], ['hera', 'island', 1, 'calm'], ['poseidon', 'skim', 1000, 'tide'], ['apollo', 'beacon', 1, 'lens'], ['aphrodite', 'waterfall', 1, 'wings'], ['zeus', 'climb', 1, 'sun'], ['demeter', 'visit', 1, 'ember']];
    for (const [id, k, n, r] of set) { I.story.met.add(id); I.setQuest(I.godById[id], k, n, r); }
    I.sagaStart(I.godById.dionysus, { title: 'ZZTEST A Walk', why: 'test', reward: 'feather', steps: [{ kind: 'go', to: 'the summit', say: 'Go to the summit.' }, { kind: 'perfect', n: 1, say: 'Land.' }] });
    I.GREAT.fire = 1; await wait(1200);
    const keys = I.qlActive().map(e => e.key); out.keys = keys;
    // above: each has a place, and the labour is listed
    for (const k of keys) { const w = I.qlWhere(I.qlActive().find(e => e.key === k)); out.above[k] = w ? [Math.round(w.x), Math.round(w.z)] : null; (out.aboveKind ||= {})[k] = I.qlActive().find(e => e.key === k).kind; }
    if (!keys.includes('great')) fail.push('the labour is not listed above');
    // below, wherever he came down
    const standA = () => { const A = I.UNDER.arrive; I.toHumanTest(); p.pos.set(A.x, I.groundAt(A.x, A.z) + 0.2, A.z); p.vel.set(0, 0, 0); p.fallTop = p.pos.y; p.grounded = true; };
    await new Promise(r => { const t = setInterval(() => { if (I.state === 'play') { clearInterval(t); r(); } }, 200); });
    I.setRealm('under', p.pos.x, p.pos.z, p.yaw); standA(); await wait(2500);
    out.downState = I.state; if (I.realm !== 'under' || I.state !== 'play') { fail.push('could not stand below'); out.fail = fail; return out; }
    const A = I.UNDER.arrive;
    const L = I.qlActive(); out.belowKeys = L.map(e => e.key); if (out.belowKeys.includes('great')) fail.push('the labour is listed below');
    for (const e of L) {
      I.story.track = e.key; await wait(700);
      const w = I.qlWhere(e), x0 = p.pos.x, z0 = p.pos.z, went = I.qlGo(e.key); await wait(300);
      const r = out.below[e.key] = { where: w ? [Math.round(w.x), Math.round(w.z)] : null, mark: !!I.QL.mkTo, went, state: I.state, moved: Math.round(Math.hypot(p.pos.x - x0, p.pos.z - z0)), line: document.getElementById('qtrack').textContent.slice(0, 120), toast: (document.getElementById('toast')?.textContent || '').slice(0, 90) };
      if (w) fail.push(`${e.key}: marked below at an upper-world place`); if (!/UP IN THE WORLD/.test(r.line)) fail.push(`${e.key}: the line below does not say it is up in the world`);
      if (r.mark) fail.push(`${e.key}: marker drawn below`);
      if (I.state === 'warp' || r.moved > 30) { fail.push(`${e.key}: fast travel carried him somewhere below`); await new Promise(res => { const t = setInterval(() => { if (I.state !== 'warp') { clearInterval(t); res(); } }, 200); }); await wait(1500);
        r.landed = { where: I.hadesWhere(p.pos.x, p.pos.z), state: I.state }; I.toHumanTest(); p.pos.set(A.x, I.groundAt(A.x, A.z) + 0.2, A.z); p.vel.set(0, 0, 0); p.fallTop = p.pos.y; await wait(800); }
    }
    out.questLine = document.getElementById('quest').textContent;
    if (/HEARTH OF ZEUS/.test(out.questLine)) fail.push('the labour line shows below');
    out.state = I.state; if (I.state === 'dead') fail.push('dead below');
    // and back up: places again
    I.setRealm('over', p.pos.x, p.pos.z); await wait(2000);
    for (const e of I.qlActive()) { const w = I.qlWhere(e); if (!w && out.above[e.key] && out.aboveKind[e.key] === e.kind) fail.push(`${e.key}: no place above after coming back`); }
    out.fail = fail; out.ok = !fail.length; return out;
  });
}
