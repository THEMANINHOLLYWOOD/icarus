// The shared world. The land itself comes from one seed, so it is the same for everyone already; what this keeps is what
// people have done in it: every square of country anyone has seen (and who saw it first), the shrines left where someone
// met a god, the places people fell, and each traveller's own journey, so they can come back to it — on this device or,
// with their travel code, on another.
//
// Storage is Supabase Postgres, reached only from here with the secret key (see supabase/world.sql; the public keys get
// nothing). Locally, with no key, it keeps everything in memory, so two tabs on the dev server still share a world.
import { json, refuse, limited, clip } from './_lib.js';
import { createHash } from 'node:crypto';

const URL_ = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const LIVE = !!(URL_ && KEY);

const SPAN = 32;            // squares either side of the asker that come back in one look (200 m each: 13 km across)
const CELL_MAX = 20000;     // the map packs squares in ±20000
const name12 = n => clip(String(n || ''), 40).toUpperCase().replace(/[^A-Z0-9 ]/g, '').replace(/\s+/g, ' ').trim().slice(0, 12) || 'SOMEONE';
const realmOf = r => (r === 'under' ? 'under' : 'over');
const int = (v, lo, hi) => (Number.isInteger(v) && v >= lo && v <= hi ? v : null);
const fin = (v, lim) => (Number.isFinite(+v) ? Math.max(-lim, Math.min(lim, +v)) : 0);
// a travel code is 12 letters and digits from a 32-character alphabet (60 bits); only its hash is stored
const codeOf = c => { const s = String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); return /^[A-HJ-NP-Z2-9]{12}$/.test(s) ? s : null; };
const hashOf = c => createHash('sha256').update('icarus-traveller:' + c).digest('hex');

// ───────── Postgres through PostgREST (server only)
async function rest(path, { method = 'GET', body, prefer, range } = {}) {
  const h = { apikey: KEY, 'Content-Type': 'application/json', Accept: 'application/json' };
  if (!KEY.startsWith('sb_')) h.Authorization = `Bearer ${KEY}`;   // (a legacy service-role JWT also goes as the bearer)
  if (prefer) h.Prefer = prefer;
  if (range) h.Range = range;
  const r = await fetch(`${URL_}/rest/v1/${path}`, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await r.text();
  let data = null; try { data = text ? JSON.parse(text) : null; } catch {}
  return { ok: r.ok, status: r.status, data, count: +(r.headers.get('content-range') || '').split('/')[1] || 0 };
}

// ───────── the same, in memory, for the dev server
const MEM = globalThis.__icarusWorld ||= { cells: new Map(), marks: [], trav: new Map(), id: 1 };
const memKey = (r, x, z) => `${r}:${x}:${z}`;

async function look(realm, cx, cz, hash) {
  const x0 = cx - SPAN, x1 = cx + SPAN, z0 = cz - SPAN, z1 = cz + SPAN;
  let cells = [], marks = [], trav = [], totals = { cells: 0, travellers: 0 };
  if (!LIVE) {
    for (const [k, c] of MEM.cells) { const [r, x, z] = k.split(':'); if (r === realm && +x >= x0 && +x <= x1 && +z >= z0 && +z <= z1) cells.push({ cx: +x, cz: +z, by_name: c.by }); }
    marks = MEM.marks.filter(m => m.realm === realm && Math.abs(m.x / 200 - cx) <= SPAN * 2 && Math.abs(m.z / 200 - cz) <= SPAN * 2).slice(-300);
    trav = [...MEM.trav.entries()].filter(([h, t]) => h !== hash && t.realm === realm && Date.now() - Date.parse(t.seen) < 14 * 864e5).map(([, t]) => t);
    totals = { cells: MEM.cells.size, travellers: MEM.trav.size };
  } else {
    const box = `realm=eq.${realm}&cx=gte.${x0}&cx=lte.${x1}&cz=gte.${z0}&cz=lte.${z1}`;
    for (let page = 0; page < 6; page++) {   // PostgREST hands back at most 1000 rows at a time
      const r = await rest(`world_cells?select=cx,cz,by_name&${box}&order=cx,cz`, { range: `${page * 1000}-${page * 1000 + 999}` });
      if (!r.ok || !Array.isArray(r.data)) break;
      cells.push(...r.data);
      if (r.data.length < 1000) break;
    }
    const mx0 = (cx - SPAN * 2) * 200, mx1 = (cx + SPAN * 2) * 200, mz0 = (cz - SPAN * 2) * 200, mz1 = (cz + SPAN * 2) * 200;
    const [m, t, c, n] = await Promise.all([
      rest(`world_marks?select=kind,x,y,z,god,seed,by_name,by_hash,at&realm=eq.${realm}&x=gte.${mx0}&x=lte.${mx1}&z=gte.${mz0}&z=lte.${mz1}&order=at.desc&limit=300`),
      rest(`travellers?select=hash,name,x,z,phase,seen&realm=eq.${realm}&seen=gte.${new Date(Date.now() - 14 * 864e5).toISOString()}&order=seen.desc&limit=60`),
      rest('world_cells?select=cx&limit=1', { prefer: 'count=estimated' }),
      rest('travellers?select=hash&limit=1', { prefer: 'count=exact' }),
    ]);
    marks = Array.isArray(m.data) ? m.data : [];
    trav = Array.isArray(t.data) ? t.data.filter(x => x.hash !== hash) : [];
    totals = { cells: c.count, travellers: n.count };
  }
  // squares go back packed: names once each, then [cx, cz, which name]
  const names = [], ni = new Map();
  const at = n => { if (!ni.has(n)) { ni.set(n, names.length); names.push(n); } return ni.get(n); };
  return {
    live: LIVE, names, totals,
    cells: cells.map(c => [c.cx, c.cz, at(c.by_name || 'SOMEONE')]),
    marks: marks.map(m => ({ k: m.kind, x: Math.round(m.x), y: Math.round(m.y * 10) / 10, z: Math.round(m.z), g: m.god, s: m.seed, n: m.by_name, mine: !!hash && m.by_hash === hash, at: m.at })),
    travellers: trav.map(t => ({ n: t.name, x: Math.round(t.x), z: Math.round(t.z), ph: t.phase, seen: t.seen })),
  };
}

export async function GET(req) {
  const bad = refuse(req); if (bad) return bad;
  if (limited(req, 'world-look', 40)) return json({ error: 'slow down' }, 429);
  const u = new URL(req.url), cx = Math.round(fin(u.searchParams.get('x'), 4e6) / 200), cz = Math.round(fin(u.searchParams.get('z'), 4e6) / 200);
  const code = codeOf(u.searchParams.get('c'));
  try { return json(await look(realmOf(u.searchParams.get('realm')), cx, cz, code ? hashOf(code) : '')); }
  catch (e) { console.error('world look', e); return json({ error: 'the world is not answering' }, 502); }
}

export async function POST(req) {
  const bad = refuse(req, 262144); if (bad) return bad;
  let b; try { b = await req.json(); } catch { return json({ error: 'bad request' }, 400); }
  if (!b || typeof b !== 'object') return json({ error: 'bad request' }, 400);
  const code = codeOf(b.code);
  if (!code) return json({ error: 'no travel code' }, 400);
  const hash = hashOf(code), name = name12(b.name), realm = realmOf(b.realm);
  try {
    // squares he has just seen. The first to see a square keeps it: later sightings change nothing.
    if (b.op === 'chart') {
      if (limited(req, 'world-chart', 30)) return json({ error: 'slow down' }, 429);
      const seen = new Set(), rows = [];
      for (const c of Array.isArray(b.cells) ? b.cells.slice(0, 800) : []) {
        const cx = int(c?.[0], -CELL_MAX, CELL_MAX), cz = int(c?.[1], -CELL_MAX, CELL_MAX);
        if (cx === null || cz === null || seen.has(cx + ',' + cz)) continue;
        seen.add(cx + ',' + cz); rows.push({ realm, cx, cz, by_name: name });
      }
      if (!rows.length) return json({ first: 0 });
      if (!LIVE) { let first = 0; for (const r of rows) { const k = memKey(realm, r.cx, r.cz); if (!MEM.cells.has(k)) { MEM.cells.set(k, { by: name, at: Date.now() }); first++; } } return json({ first }); }
      const r = await rest('world_cells?on_conflict=realm,cx,cz&select=cx', { method: 'POST', body: rows, prefer: 'resolution=ignore-duplicates,return=representation' });
      if (!r.ok) return json({ error: 'not charted' }, 502);
      return json({ first: Array.isArray(r.data) ? r.data.length : 0 });
    }
    // something that stays: a shrine where he met a god (once per god), or the place he fell
    if (b.op === 'mark') {
      if (limited(req, 'world-mark', 12)) return json({ error: 'slow down' }, 429);
      const kind = b.kind === 'met' ? 'met' : b.kind === 'fall' ? 'fall' : null;
      if (!kind) return json({ error: 'bad mark' }, 400);
      const row = { kind, realm, x: fin(b.x, 4e6), y: fin(b.y, 2e4), z: fin(b.z, 4e6), god: clip(String(b.god || ''), 16).toLowerCase().replace(/[^a-z]/g, ''),
        seed: int(b.seed, 0, 2 ** 31 - 1) ?? 0, by_name: name, by_hash: hash };
      if (kind === 'met' && !row.god) return json({ error: 'bad mark' }, 400);
      if (!LIVE) {
        if (kind === 'met' && MEM.marks.some(m => m.kind === 'met' && m.by_hash === hash && m.god === row.god)) return json({ ok: true, again: true });
        MEM.marks.push({ ...row, id: MEM.id++, at: new Date().toISOString() }); if (MEM.marks.length > 5000) MEM.marks.shift();
        return json({ ok: true });
      }
      const r = await rest('world_marks', { method: 'POST', body: row, prefer: 'return=minimal' });
      if (r.status === 409) return json({ ok: true, again: true });   // (he met this god before: the first shrine stands)
      return r.ok ? json({ ok: true }) : json({ error: 'not marked' }, 502);
    }
    // where he is and how far his story has gone, kept for when he comes back; says what changed while he was away
    if (b.op === 'sync') {
      if (limited(req, 'world-sync', 12)) return json({ error: 'slow down' }, 429);
      const row = { hash, name, realm, x: fin(b.x, 4e6), z: fin(b.z, 4e6), phase: clip(String(b.phase || ''), 16), seen: new Date().toISOString() };
      if (b.save && typeof b.save === 'object') row.save = b.save;
      if (b.map && typeof b.map === 'object') row.map = b.map;
      let before = null;
      if (!LIVE) {
        const old = MEM.trav.get(hash); before = old ? { seen: old.seen, first_at: old.first_at } : null;
        MEM.trav.set(hash, { ...(old || { first_at: row.seen }), ...row });
      } else {
        const o = await rest(`travellers?select=seen,first_at&hash=eq.${hash}`);
        before = Array.isArray(o.data) && o.data[0] || null;
        const r = await rest('travellers?on_conflict=hash', { method: 'POST', body: row, prefer: 'resolution=merge-duplicates,return=minimal' });
        if (!r.ok) return json({ error: 'not kept' }, 502);
      }
      if (!b.hello || !before) return json({ ok: true, back: !!before });
      // he has been away: what did everyone else do meanwhile?
      let cells = 0, marks = 0, people = 0;
      if (!LIVE) {
        const since = Date.parse(before.seen);
        for (const c of MEM.cells.values()) if (c.at > since && c.by !== name) cells++;
        marks = MEM.marks.filter(m => Date.parse(m.at) > since && m.by_hash !== hash).length;
        people = [...MEM.trav.values()].filter(t => Date.parse(t.seen) > since && t.hash !== hash).length;
      } else {
        const s = encodeURIComponent(before.seen);
        const [c, m, p] = await Promise.all([
          rest(`world_cells?select=cx&at=gt.${s}&by_name=neq.${encodeURIComponent(name)}&limit=1`, { prefer: 'count=exact' }),
          rest(`world_marks?select=id&at=gt.${s}&by_hash=neq.${hash}&limit=1`, { prefer: 'count=exact' }),
          rest(`travellers?select=hash&seen=gt.${s}&hash=neq.${hash}&limit=1`, { prefer: 'count=exact' }),
        ]);
        cells = c.count; marks = m.count; people = p.count;
      }
      return json({ ok: true, back: true, since: before.seen, away: { cells, marks, people } });
    }
    // coming back on another device: the travel code brings the journey with it
    if (b.op === 'resume') {
      if (limited(req, 'world-resume', 6)) return json({ error: 'slow down' }, 429);
      let t = null;
      if (!LIVE) t = MEM.trav.get(hash) || null;
      else { const r = await rest(`travellers?select=name,save,map,seen&hash=eq.${hash}`); t = Array.isArray(r.data) && r.data[0] || null; }
      if (!t) return json({ error: 'no such traveller' }, 404);
      return json({ name: t.name, save: t.save || null, map: t.map || null, seen: t.seen });
    }
    return json({ error: 'bad request' }, 400);
  } catch (e) { console.error('world', e); return json({ error: 'the world is not answering' }, 502); }
}
