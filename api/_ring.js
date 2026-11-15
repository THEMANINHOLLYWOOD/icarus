// The ring of rings, round the ring of fire over Olympus: one small ring for every traveller who has flown through the big
// one, in the colour of their god. GET says how many there are of each house (and the newest few, by name); POST marks
// that the one asking has just flown through it on their first flight. Agents, pairings, people still on the summit
// before their first flight, and test travellers (names beginning ZZTEST) are not counted. Nothing private goes out: no
// codes, no hashes, no places.
//
// What is kept: nothing new. A traveller's row already holds their save; the page now puts its god ('patron') and
// whether it has flown through the ring ('ring': 1, or 0 while it still has to) in it, and this marks the same two when
// they fly through. Rows from before that have no 'ring': they count if they are past the summit, and their house is
// not known until they next come back (an uncoloured ring meanwhile).
import { json, refuse, limited } from './_lib.js';
import { rest, travellerOf, nameOf, LIVE } from './_store.js';

const HOUSES = ['zeus', 'hera', 'poseidon', 'demeter', 'athena', 'apollo', 'artemis', 'ares', 'aphrodite', 'hephaestus', 'hermes', 'dionysus'];
const NOT_YET = new Set(['', 'agent', 'pair', 'summit', 'leap']);
const memWorld = () => globalThis.__icarusWorld || null;   // (world.js's own store, on the dev server with no database)
const counts = row => !!row && !NOT_YET.has(String(row.phase || '')) && !(LIVE && /^ZZTEST/.test(String(row.name || ''))) && !(row.save && row.save.ring === 0);   // (the dev server's own world is all tests: there they count)
const houseOf = save => (save && HOUSES.includes(save.patron) ? save.patron : '');
const CACHE = globalThis.__icarusRing ||= { at: 0, v: null };

// (PostgREST: past the summit, not an agent or a pairing, not a test, and not marked as still to fly through)
const BASE = 'phase=not.in.(agent,pair,summit,leap)&phase=neq.&name=not.like.ZZTEST*';
const NOT_ZERO = '&or=(save->>ring.is.null,save->>ring.neq.0)';
async function tally() {
  if (!LIVE) {
    const h = {}; let n = 0; const rows = [];
    for (const t of memWorld()?.trav?.values() || []) if (counts(t)) { n++; const g = houseOf(t.save); h[g] = (h[g] || 0) + 1; rows.push(t); }
    rows.sort((a, b) => String(b.first_at || '').localeCompare(String(a.first_at || '')));
    return { n, h, r: rows.slice(0, 16).map(t => [nameOf(t.name) || 'SOMEONE', houseOf(t.save)]), at: Date.now() };
  }
  let base = BASE + NOT_ZERO;
  let all = await rest(`travellers?select=hash&${base}&limit=1`, { prefer: 'count=exact' });
  if (!all.ok) { base = BASE; all = await rest(`travellers?select=hash&${base}&limit=1`, { prefer: 'count=exact' }); }   // (a server that will not filter inside the save: count without that)
  if (!all.ok) return null;
  const per = await Promise.all(HOUSES.map(g => rest(`travellers?select=hash&${base}&save->>patron=eq.${g}&limit=1`, { prefer: 'count=exact' })));
  const recent = await rest(`travellers?select=name,save->>patron&${base}&order=first_at.desc&limit=16`);
  const h = {}; let known = 0;
  HOUSES.forEach((g, i) => { if (per[i].ok && per[i].count) { h[g] = per[i].count; known += per[i].count; } });
  if (all.count > known) h[''] = all.count - known;
  const r = Array.isArray(recent.data) ? recent.data.map(t => [nameOf(t.name) || 'SOMEONE', HOUSES.includes(t.patron) ? t.patron : '']) : [];
  return { n: all.count, h, r, at: Date.now() };
}

export async function GET(req) {
  const bad = refuse(req); if (bad) return bad;
  if (limited(req, 'ring-look', 30)) return json({ error: 'slow down' }, 429);
  if (CACHE.v && Date.now() - CACHE.at < 60_000) return json(CACHE.v);   // (counted at most once a minute)
  try { const v = await tally(); if (!v) return json(CACHE.v || { error: 'the world is not answering' }, CACHE.v ? 200 : 502); CACHE.v = v; CACHE.at = Date.now(); return json(v); }
  catch (e) { console.error('ring', e); return json({ error: 'the world is not answering' }, 502); }
}

// he has just flown through it for the first time: his ring is one of them now
export async function POST(req) {
  const bad = refuse(req, 4096); if (bad) return bad;
  let b; try { b = await req.json(); } catch { return json({ error: 'bad request' }, 400); }
  if (!b || typeof b !== 'object' || b.op !== 'join') return json({ error: 'bad request' }, 400);
  if (limited(req, 'ring-join', 6)) return json({ error: 'slow down' }, 429);
  const house = HOUSES.includes(b.house) ? b.house : null; if (!house) return json({ error: 'no house' }, 400);
  const T = await travellerOf(req, b); if (!T) return json({ error: 'who are you?' }, 401);
  let row = null;
  if (!LIVE) row = memWorld()?.trav?.get(T.hash) || null;
  else { const r = await rest(`travellers?select=name,phase,save&hash=eq.${T.hash}&limit=1`); if (!r.ok) return json({ error: 'the world is not answering' }, 502); row = Array.isArray(r.data) && r.data[0] || null; }
  if (!row) return json({ ok: false, later: true });   // (not kept yet: his next save carries it)
  if (row.phase === 'agent' || row.phase === 'pair') return json({ error: 'not a traveller' }, 403);
  const added = !counts(row), save = { ...(row.save && typeof row.save === 'object' ? row.save : {}), ring: 1, patron: house };   // (added: he was not one of them a moment ago)
  if (row.save && row.save.ring === 1 && row.save.patron === house) return json({ ok: true, added: false });
  if (!LIVE) row.save = save;
  else { const r = await rest(`travellers?hash=eq.${T.hash}`, { method: 'PATCH', body: { save }, prefer: 'return=minimal' }); if (!r.ok) return json({ error: 'not kept' }, 502); }
  CACHE.at = 0;
  return json({ ok: true, added });
}
