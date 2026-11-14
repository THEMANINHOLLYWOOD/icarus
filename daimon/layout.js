// Where everything stands. Out of what the hub knows, this works out a place for each thing in metres about one point
// (x east, y up, z south) — and says nothing about what any of it looks like. A world takes these places and draws
// them its own way: stone and fire in three dimensions, boxes on a flat canvas, sprites on a tile map.
//
//   the HEARTH at the middle        what every agent of this owner has shared
//   HOMES in a ring about it        one per agent name: where it rests, and where its own notes are kept
//   SITES further out               one per repository, each a tree: the trunk is the main branch, every other git
//                                   branch a bough off it, and each file touched a stone on its branch that grows
//                                   as it is worked on
//   AGENTS                          at the stone they are working on, else at their branch, else at home
//
// Nothing moves when something new arrives: every place is a numbered slot, given out in order of arrival.
import { hash32, slug, baseName } from './protocol.js';

const GOLD = 2.39996323;   // the golden angle: slots given out by it never line up
export const DIMS = { homeRing: 18, homeSlots: 10, siteRing: 58, siteSlots: 5, siteStep: 64, trunkR: 1.6, boughRise: 0.36 };

export const siteIdOf = a => slug(a.repo || baseName(a.root || a.cwd) || 'scratch');
// how big a file's stone is: wider the more it is visited, taller the more it has been changed
export function stone(f) {
  const w = 0.95 + Math.min(1.15, Math.log2(1 + f.edits + f.reads * 0.25) * 0.3);
  const h = f.edits ? 0.9 + Math.min(11, f.edits * 0.5 + (f.added + f.removed) / 30) : 0.55;
  return { w, h };
}

function ring(i, slots, r0, step) { const lap = Math.floor(i / slots), n = slots * (lap + 1), k = i - lap * slots; const a = -Math.PI / 2 + (k + (lap % 2) * 0.5) * (2 * Math.PI / (lap ? n : slots)); const r = r0 + lap * step; return { x: Math.cos(a) * r, z: Math.sin(a) * r, a }; }

export function layout(state) {
  const L = { hearth: { x: 0, y: 0, z: 0, shared: state.shared || 0 }, homes: [], sites: [], agents: new Map(), extent: 40 };
  const homeBy = new Map(), siteBy = new Map();

  // homes: every name that has ever worked for this owner, and any agent here now that has none yet
  const names = new Map([...state.personas.values()].map(p => [p.name, p]));
  for (const a of state.agents.values()) if (!a.parentId && !names.has(a.name)) names.set(a.name, { name: a.name, hue: a.hue, firstAt: a.joinedAt, notes: 0, shared: 0, online: true });
  [...names.values()].sort((p, q) => (p.firstAt || 0) - (q.firstAt || 0)).forEach((p, i) => {
    const s = ring(i, DIMS.homeSlots, DIMS.homeRing, 11);
    const h = { name: p.name, hue: p.hue ?? 40, x: s.x, y: 0, z: s.z, yaw: Math.atan2(-s.x, -s.z), notes: p.notes || 0, shared: p.shared || 0, online: !!p.online, slot: i };
    L.homes.push(h); homeBy.set(p.name, h);
  });

  // sites
  [...state.sites.values()].sort((p, q) => (p.firstAt || 0) - (q.firstAt || 0)).forEach((s, i) => {
    const at = ring(i, DIMS.siteSlots, DIMS.siteRing, DIMS.siteStep), turn = (hash32(s.id) % 628) / 100;
    const all = [...s.branches.values()].sort((p, q) => (p.firstAt || 0) - (q.firstAt || 0));
    const main = all.find(b => b.name === s.main) || all[0], boughs = all.filter(b => b !== main);
    const site = { id: s.id, repo: s.repo, x: at.x, y: 0, z: at.z, ok: s.ok || 0, fail: s.fail || 0, commits: s.commits || 0, branches: [], trunkH: 11, reach: 12, baseR: 6.6, lastAt: s.lastAt };
    const byName = new Map();
    if (main) {   // the trunk: its files stand about its foot like the columns of a precinct, the first ones nearest
      const files = [...main.files.values()].map((f, j) => { const d = stone(f), a = turn + j * GOLD, r = 2.1 * Math.sqrt(j + 2.4); return { ...f, w: d.w, h: Math.min(d.h, 8), x: Math.cos(a) * r, y: 0, z: Math.sin(a) * r, a }; });
      const br = { name: main.name, main: true, from: '', commits: main.commits || 0, run: main.run, lastAt: main.lastAt, base: { x: 0, y: 0, z: 0 }, tip: { x: 0, y: 10, z: 0 }, dir: { x: 0, z: 0 }, len: 0, files };
      site.branches.push(br); byName.set(br.name, br);
      site.baseR = Math.max(site.baseR, 2.1 * Math.sqrt(files.length + 1.4) + 2.2);
    }
    boughs.forEach((b, k) => {   // a bough: out and a little up, its files standing along it
      const a = turn + 1.1 + k * GOLD, y0 = 8 + k * 6.4, n = b.files.size, len = 7 + n * 2.3, cx = Math.cos(a), cz = Math.sin(a), rise = DIMS.boughRise;
      const files = [...b.files.values()].map((f, j) => { const d = stone(f), dist = 5.2 + j * 2.3; return { ...f, w: d.w, h: Math.min(d.h, 4.6), x: cx * dist, y: y0 + dist * rise + 0.25, z: cz * dist, a }; });
      const br = { name: b.name, main: false, from: b.from, commits: b.commits || 0, run: b.run, lastAt: b.lastAt, base: { x: cx * DIMS.trunkR * 0.6, y: y0, z: cz * DIMS.trunkR * 0.6 }, tip: { x: cx * len, y: y0 + len * rise, z: cz * len }, dir: { x: cx, z: cz }, len, files };
      site.branches.push(br); byName.set(br.name, br);
      site.trunkH = Math.max(site.trunkH, y0 + 4); site.reach = Math.max(site.reach, len + 4);
    });
    site.reach = Math.max(site.reach, site.baseR + 2);
    for (const br of site.branches) if (br.main) br.tip.y = site.trunkH;
    site.byName = byName; L.sites.push(site); siteBy.set(s.id, site);
    L.extent = Math.max(L.extent, Math.hypot(at.x, at.z) + site.reach);
  });
  L.extent = Math.max(L.extent, ...L.homes.map(h => Math.hypot(h.x, h.z) + 8));

  // agents: where each should be standing right now (the world moves them there at its own pace)
  const crowd = new Map(), busy = s => s === 'working' || s === 'thinking' || s === 'waiting' || s === 'blocked';
  const spread = (key, n = 1.9) => { const i = crowd.get(key) || 0; crowd.set(key, i + 1); const a = i * GOLD + 0.6; return i ? { x: Math.cos(a) * n * (0.6 + i * 0.3), z: Math.sin(a) * n * (0.6 + i * 0.3) } : { x: 0, z: 0 }; };
  const order = [...state.agents.values()].sort((p, q) => p.depth - q.depth || p.joinedAt - q.joinedAt);
  for (const a of order) {
    const root = (() => { let x = a, n = 0; while (x.parentId && state.agents.get(x.parentId) && n++ < 8) x = state.agents.get(x.parentId); return x; })();
    const home = homeBy.get(root.name), site = siteBy.get(siteIdOf(a)), br = site?.byName.get(a.branch) || site?.branches.find(b => b.main);
    const file = a.tool?.file || (busy(a.status) ? a.file : ''), st = file && br ? br.files.find(f => f.path === file) : null;
    let p;
    if (a.status !== 'offline' && site && st) {   // at its stone: beside it, on the outside, a little above
      const out = Math.hypot(st.x, st.z) || 1, o = spread(`${site.id}/${br.name}/${st.path}`), k = st.w / 2 + 1.5;
      p = { x: site.x + st.x + st.x / out * k + o.x, y: st.y + st.h * 0.6 + 0.8, z: site.z + st.z + st.z / out * k + o.z, at: 'file', site: site.id, branch: br.name, file: st.path, look: { x: site.x + st.x, y: st.y + st.h * 0.5, z: site.z + st.z } };
    } else if (a.status !== 'offline' && site && br && busy(a.status)) {   // at its branch, with nothing in its hands yet
      const o = spread(`${site.id}/${br.name}`, 2.4), d = br.main ? site.baseR + 1.5 : Math.min(br.len, 4.5), bx = br.main ? Math.cos(a.seed % 7) : br.dir.x, bz = br.main ? Math.sin(a.seed % 7) : br.dir.z;
      p = { x: site.x + bx * d + o.x, y: (br.main ? 2.4 : br.base.y + d * DIMS.boughRise + 2.2), z: site.z + bz * d + o.z, at: 'branch', site: site.id, branch: br.name, look: { x: site.x, y: br.main ? 4 : br.base.y, z: site.z } };
    } else if (a.parentId && L.agents.get(a.parentId) && a.status !== 'done') {   // a fork with nowhere of its own yet: by the one it split from
      const q = L.agents.get(a.parentId), o = spread(`by/${a.parentId}`, 2.6);
      p = { x: q.x + o.x + 1.8, y: q.y + 0.4, z: q.z + o.z + 1.2, at: 'parent', look: q.look };
    } else if (home) {   // at home: in front of its door
      const o = spread(`home/${home.name}`, 1.6), f = 2.6;
      p = { x: home.x + Math.sin(home.yaw) * f + o.x, y: a.status === 'offline' ? 0.5 : 1.5, z: home.z + Math.cos(home.yaw) * f + o.z, at: 'home', home: home.name, look: { x: 0, y: 2, z: 0 } };
    } else p = { x: 0, y: 2, z: 6, at: 'hearth', look: { x: 0, y: 2, z: 0 } };
    L.agents.set(a.id, p);
  }
  // the corners of everything that stands, for a world that wants to frame it all
  L.points = [{ x: -8, y: 0, z: -8 }, { x: 8, y: 9, z: 8 }];
  for (const h of L.homes) L.points.push({ x: h.x - 3, y: 0, z: h.z - 3 }, { x: h.x + 3, y: 4, z: h.z + 3 });
  for (const s of L.sites) { L.points.push({ x: s.x - s.baseR, y: 0, z: s.z - s.baseR }, { x: s.x + s.baseR, y: s.trunkH + 3, z: s.z + s.baseR }); for (const b of s.branches) if (!b.main) L.points.push({ x: s.x + b.tip.x, y: b.tip.y + 4, z: s.z + b.tip.z }); }
  L.homeBy = homeBy; L.siteBy = siteBy;
  return L;
}
