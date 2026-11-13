// The shared world. The land itself comes from one seed, so it is the same for everyone already; what this keeps is what
// people have done in it: every square of country anyone has seen (and who saw it first), the shrines left where someone
// met a god, the places people fell, and each traveller's own journey, so they can come back to it — on this device or,
// with their travel code, on another.
//
// Storage is Supabase Postgres, reached only from here with the secret key (see supabase/world.sql; the public keys get
// nothing). Locally, with no key, it keeps everything in memory, so two tabs on the dev server still share a world.
import { json, refuse, limited, clip } from './_lib.js';
import { createHash } from 'node:crypto';
import { rememberDeed, isDeed } from './_pantheon.js';
import { ALL } from './_gods.js';
// deeds the server itself sees happen, which a page cannot claim: meeting a god, a course of rings, the torches, a god's strike
const SERVER_DEEDS = new Set(['met', 'arena', 'torch', 'smitten']);

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
  try {
    const r = await fetch(`${URL_}/rest/v1/${path}`, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(6000) });
    const text = await r.text();
    let data = null; try { data = text ? JSON.parse(text) : null; } catch {}
    return { ok: r.ok, status: r.status, data, count: +(r.headers.get('content-range') || '').split('/')[1] || 0 };
  } catch { return { ok: false, status: 0, data: null, count: 0 }; }   // (slow or down: the caller carries on with what it knows)
}

// ───────── the same, in memory, for the dev server
const MEM = globalThis.__icarusWorld ||= { cells: new Map(), marks: [], trav: new Map(), winds: [], id: 1 };
MEM.winds ||= [];
MEM.rings ||= new Map();
const PATRON_IDS = new Set(['zeus', 'hera', 'poseidon', 'demeter', 'athena', 'apollo', 'artemis', 'ares', 'aphrodite', 'hephaestus', 'hermes', 'dionysus']);
const memKey = (r, x, z) => `${r}:${x}:${z}`;

// How many courses of rings burn for each god, the whole world over (the page hangs that many rings over the god's
// throne). Counted from the claims, at most once a minute.
const HELD = { at: 0, v: null, w: null };
async function held(realm) {
  if (realm !== 'over') return null;
  const v = {}, w = {}, add = pats => { const P = [...new Set((Array.isArray(pats) ? pats : []).filter(p => PATRON_IDS.has(p)))]; for (const p of P) { v[p] = (v[p] || 0) + 1; for (const q of P) if (q !== p) ((w[p] ||= {})[q] = (w[p][q] || 0) + 1); } };   // (and which houses hold courses together)
  if (!LIVE) { for (const a of MEM.rings.values()) if (a.realm === realm && !String(a.id).startsWith('torch')) add(a.patrons); return { v, w }; }
  if (HELD.v && Date.now() - HELD.at < 60_000) return { v: HELD.v, w: HELD.w };
  for (let page = 0; page < 3; page++) {
    const r = await rest('world_rings?select=patrons&realm=eq.over&id=not.like.torch*&order=id', { range: `${page * 1000}-${page * 1000 + 999}` });   // (the torches on the summit are held the same way, and are not courses)
    if (!r.ok || !Array.isArray(r.data)) return HELD.v ? { v: HELD.v, w: HELD.w } : null;   // (no table, or no answer: whatever was known before)
    for (const a of r.data) add(a.patrons);
    if (r.data.length < 1000) break;
  }
  HELD.at = Date.now(); HELD.v = v; HELD.w = w; return { v, w };
}
async function look(realm, cx, cz, hash) {
  const x0 = cx - SPAN, x1 = cx + SPAN, z0 = cz - SPAN, z1 = cz + SPAN;
  let cells = [], marks = [], trav = [], winds = [], arenas = [], totals = { cells: 0, travellers: 0 };
  if (!LIVE) {
    for (const [k, c] of MEM.cells) { const [r, x, z] = k.split(':'); if (r === realm && +x >= x0 && +x <= x1 && +z >= z0 && +z <= z1) cells.push({ cx: +x, cz: +z, by_name: c.by }); }
    marks = MEM.marks.filter(m => m.realm === realm && Math.abs(m.x / 200 - cx) <= SPAN * 2 && Math.abs(m.z / 200 - cz) <= SPAN * 2).slice(-300);
    trav = [...MEM.trav.entries()].filter(([h, t]) => h !== hash && t.realm === realm && Date.now() - Date.parse(t.seen) < 14 * 864e5).map(([, t]) => t);
    winds = MEM.winds.filter(w => w.realm === realm && Math.abs(w.cx / 200 - cx) <= SPAN * 2 && Math.abs(w.cz / 200 - cz) <= SPAN * 2).slice(-40).reverse();
    arenas = [...MEM.rings.values()].filter(a => a.realm === realm && Math.abs(a.cx / 200 - cx) <= SPAN * 2 && Math.abs(a.cz / 200 - cz) <= SPAN * 2);
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
    const [m, t, c, n, w, a] = await Promise.all([
      rest(`world_marks?select=kind,x,y,z,god,seed,by_name,by_hash,at&realm=eq.${realm}&x=gte.${mx0}&x=lte.${mx1}&z=gte.${mz0}&z=lte.${mz1}&order=at.desc&limit=300`),
      rest(`travellers?select=hash,name,x,z,phase,seen&realm=eq.${realm}&seen=gte.${new Date(Date.now() - 14 * 864e5).toISOString()}&order=seen.desc&limit=60`),
      rest('world_cells?select=cx&limit=1', { prefer: 'count=estimated' }),
      rest('travellers?select=hash&limit=1', { prefer: 'count=estimated' }),
      rest(`world_winds?select=id,pts,patron,by_name,by_hash,at&realm=eq.${realm}&cx=gte.${mx0}&cx=lte.${mx1}&cz=gte.${mz0}&cz=lte.${mz1}&order=at.desc&limit=40`),
      rest(`world_rings?select=id,patrons,names,at,len&realm=eq.${realm}&cx=gte.${mx0}&cx=lte.${mx1}&cz=gte.${mz0}&cz=lte.${mz1}&order=at.desc&limit=300`),
    ]);
    arenas = a.ok && Array.isArray(a.data) ? a.data : [];   // (no table yet: nobody holds anything that lasts)
    winds = Array.isArray(w.data) ? w.data : [];
    marks = Array.isArray(m.data) ? m.data : [];
    trav = Array.isArray(t.data) ? t.data.filter(x => x.hash !== hash) : [];
    totals = { cells: c.count, travellers: n.count };
  }
  const heldBy = await held(realm).catch(() => null);
  // squares go back packed: names once each, then [cx, cz, which name]
  const names = [], ni = new Map();
  const at = n => { if (!ni.has(n)) { ni.set(n, names.length); names.push(n); } return ni.get(n); };
  return {
    live: LIVE, names, totals,
    cells: cells.map(c => [c.cx, c.cz, at(c.by_name || 'SOMEONE')]),
    marks: marks.map(m => ({ k: m.kind, x: Math.round(m.x), y: Math.round(m.y * 10) / 10, z: Math.round(m.z), g: m.god, s: m.seed, n: m.by_name, mine: !!hash && m.by_hash === hash, at: m.at })),
    travellers: trav.map(t => ({ n: t.name, x: Math.round(t.x), z: Math.round(t.z), ph: t.phase, seen: t.seen })),
    winds: winds.map(w => ({ id: w.id, p: w.pts, c: w.patron, n: w.by_name, mine: !!hash && w.by_hash === hash, at: w.at })),
    arenas: arenas.map(a => ({ id: a.id, c: a.patrons, n: a.names, at: a.at, l: a.len | 0 })),
    held: heldBy ? heldBy.v : undefined, heldWith: heldBy ? heldBy.w : undefined,
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
    // a river of wind he blew across the sky: it stays, for everyone to ride
    if (b.op === 'wind') {
      if (limited(req, 'world-wind', 8)) return json({ error: 'slow down' }, 429);
      const id = String(b.id || '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 12), p = Array.isArray(b.pts) ? b.pts : [];
      if (id.length < 4 || p.length < 15 || p.length > 180 || p.length % 3) return json({ error: 'bad wind' }, 400);
      const pts = p.map((v, i) => Math.round(fin(v, i % 3 === 1 ? 2e4 : 4e6)));
      let cx = 0, cz = 0;
      for (let i = 0; i < pts.length; i += 3) {
        cx += pts[i] * 3 / pts.length; cz += pts[i + 2] * 3 / pts.length;
        if (i && Math.hypot(pts[i] - pts[i - 3], pts[i + 1] - pts[i - 2], pts[i + 2] - pts[i - 1]) > 400) return json({ error: 'bad wind' }, 400);   // (a line flown, not a scrawl)
      }
      const row = { id, realm, cx, cz, pts, patron: PATRON_IDS.has(b.patron) ? b.patron : '', by_name: name, by_hash: hash };
      if (!LIVE) {
        if (!MEM.winds.some(w => w.id === id)) { MEM.winds.push({ ...row, at: new Date().toISOString() }); if (MEM.winds.length > 3000) MEM.winds.shift(); }
        return json({ ok: true });
      }
      const r = await rest('world_winds', { method: 'POST', body: row, prefer: 'return=minimal' });
      if (r.status === 409) return json({ ok: true, again: true });
      return r.ok ? json({ ok: true }) : json({ error: 'not kept' }, 502);
    }
    // a course of rings flown from first to last: it is theirs (one god or several, if they flew it together) until someone
    // of another god flies it
    if (b.op === 'arena') {
      if (limited(req, 'world-arena', 10)) return json({ error: 'slow down' }, 429);
      const id = String(b.id || '').toLowerCase(); if (!/^[a-z0-9][a-z0-9_-]{1,23}$/.test(id)) return json({ error: 'bad claim' }, 400);
      const pats = [...new Set((Array.isArray(b.pats) ? b.pats : []).filter(p => PATRON_IDS.has(p)))].slice(0, 4);
      const names = [...new Set([name, ...(Array.isArray(b.names) ? b.names : []).map(name12)])].slice(0, 4);
      if (!id || !pats.length) return json({ error: 'bad claim' }, 400);
      const row = { id, realm, cx: fin(b.cx, 4e6), cz: fin(b.cz, 4e6), patrons: pats, names, by_hash: hash, at: new Date().toISOString(), len: int(b.len, 0, 400) ?? 0 };
      const torch = id.startsWith('torch'); if (torch && (id !== 'torches' || realm !== 'over')) return json({ error: 'bad claim' }, 400);   // (the torches off the summit are kept the same way: one entry, whose they are)
      if (torch) row.len = 0;
      await rememberDeed(torch ? 'torch' : 'arena', { name, hash, god: pats[0] }).catch(() => {});   // (the gods hear whose colour it burns in now)
      if (!LIVE) { row.len = Math.max(row.len, MEM.rings.get(id)?.len || 0); MEM.rings.set(id, row); return json({ ok: true }); }
      const o = await rest(`world_rings?select=len,realm&id=eq.${encodeURIComponent(id)}`), old = Array.isArray(o.data) && o.data[0] || null;
      row.len = Math.max(row.len, old ? old.len | 0 : 0);   // (a course never gets shorter, whoever takes it)
      if (old && old.realm && old.realm !== realm) return json({ error: 'bad claim' }, 400);
      // (taken from someone: whose it is changes, and nothing else — not where it is)
      const r = old ? await rest(`world_rings?id=eq.${encodeURIComponent(id)}`, { method: 'PATCH', body: { patrons: row.patrons, names: row.names, by_hash: row.by_hash, at: row.at, len: row.len }, prefer: 'return=minimal' })
        : await rest('world_rings?on_conflict=id', { method: 'POST', body: row, prefer: 'resolution=ignore-duplicates,return=minimal' });
      return r.ok ? json({ ok: true }) : json({ ok: false, kept: false });   // (no table yet: the claim is only live)
    }
    // a course flown further than it went: it is that long now, for everyone (it only ever grows, and only once someone holds it)
    if (b.op === 'arena_len') {
      if (limited(req, 'world-arena-len', 30)) return json({ error: 'slow down' }, 429);
      const id = String(b.id || '').toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 24), len = int(b.len, 1, 400);
      if (!id || len === null) return json({ error: 'bad length' }, 400);
      if (!LIVE) { const r = MEM.rings.get(id); if (r && len > (r.len || 0)) r.len = len; return json({ ok: !!r }); }
      const r = await rest(`world_rings?id=eq.${id}&len=lt.${len}`, { method: 'PATCH', body: { len }, prefer: 'return=minimal' });
      return json({ ok: r.ok });
    }
    if (b.op === 'deed') {   // something the gods will talk about: the page names it, the words are the server's
      if (!isDeed(b.k) || SERVER_DEEDS.has(b.k) || limited(req, 'deed', 12)) return json({ ok: false });
      return json({ ok: await rememberDeed(b.k, { name, hash, god: String(b.god || '') }) });
    }
    // something that stays: a shrine where he met a god (once per god), or the place he fell
    if (b.op === 'mark') {
      if (limited(req, 'world-mark', 12)) return json({ error: 'slow down' }, 429);
      const kind = b.kind === 'met' ? 'met' : b.kind === 'fall' ? 'fall' : null;
      if (!kind) return json({ error: 'bad mark' }, 400);
      const row = { kind, realm, x: fin(b.x, 4e6), y: fin(b.y, 2e4), z: fin(b.z, 4e6), god: clip(String(b.god || ''), 16).toLowerCase().replace(/[^a-z]/g, ''),
        seed: int(b.seed, 0, 2 ** 31 - 1) ?? 0, by_name: name, by_hash: hash };
      if (kind === 'met' && !Object.hasOwn(ALL, row.god)) return json({ error: 'bad mark' }, 400);
      if (kind === 'fall') row.god = '';
      if (!LIVE) {
        if (kind === 'met' && MEM.marks.some(m => m.kind === 'met' && m.by_hash === hash && m.god === row.god)) return json({ ok: true, again: true });
        MEM.marks.push({ ...row, id: MEM.id++, at: new Date().toISOString() }); if (MEM.marks.length > 5000) MEM.marks.shift();
        if (kind === 'met') await rememberDeed('met', { name, hash, god: row.god }).catch(() => {});
        return json({ ok: true });
      }
      const r = await rest('world_marks', { method: 'POST', body: row, prefer: 'return=minimal' });
      if (r.status === 409) return json({ ok: true, again: true });   // (he met this god before: the first shrine stands)
      if (r.ok && kind === 'met') await rememberDeed('met', { name, hash, god: row.god }).catch(() => {});
      return r.ok ? json({ ok: true }) : json({ error: 'not marked' }, 502);
    }
    // where he is and how far his story has gone, kept for when he comes back; says what changed while he was away
    if (b.op === 'sync') {
      if (limited(req, 'world-sync', 12)) return json({ error: 'slow down' }, 429);
      const row = { hash, name, realm, x: fin(b.x, 4e6), z: fin(b.z, 4e6), phase: clip(String(b.phase || ''), 16), seen: new Date().toISOString() };
      const fits = (v, n) => { try { return JSON.stringify(v).length <= n; } catch { return false; } };   // (a save is small; a map of what he has seen, bigger; nothing past that is kept)
      if (b.save && typeof b.save === 'object' && fits(b.save, 48_000)) row.save = b.save;
      if (b.map && typeof b.map === 'object' && fits(b.map, 160_000)) row.map = b.map;
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
          rest(`world_cells?select=cx&at=gt.${s}&by_name=neq.${encodeURIComponent(name)}&limit=1`, { prefer: 'count=estimated' }),
          rest(`world_marks?select=id&at=gt.${s}&by_hash=neq.${hash}&limit=1`, { prefer: 'count=estimated' }),
          rest(`travellers?select=hash&seen=gt.${s}&hash=neq.${hash}&limit=1`, { prefer: 'count=estimated' }),
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
