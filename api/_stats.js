// A traveller's record: what they have done (kept as one object the page adds to), where they flew (a point every
// couple of seconds, for the stats page to play back), and everything said between them and the gods. A line they
// "delete" is only hidden from them; it is kept. Asked for with the travel code, or by an account tied to one.
import { json, refuse, limited, clip } from './_lib.js';
import { rest, travellerOf, nameOf, LIVE } from './_store.js';

const MEM = globalThis.__icarusStats ||= { stats: new Map(), pts: [], talk: [], id: 1 };
const fin = (v, lim) => (Number.isFinite(+v) ? Math.max(-lim, Math.min(lim, +v)) : 0);
const GOD = /^[a-z]{2,24}$/;
const TOTALS = ['km', 'air', 'water', 'crashes', 'deaths', 'words', 'typed', 'talks', 'quests', 'flights', 'tricks', 'areas', 'tsunamis', 'dives', 'rings'];
// what the page says, folded into what was kept: totals never go down, the fastest is the fastest
function merge(old, n) {
  const o = old && typeof old === 'object' ? { ...old } : {};
  for (const k of TOTALS) if (Number.isFinite(+n[k])) o[k] = Math.max(+o[k] || 0, fin(n[k], 1e12));
  const rec = (k, better) => { const a = o[k], b = n[k]; if (!b || typeof b !== 'object' || !Number.isFinite(+b.v)) return; if (!a || better(+b.v, +a.v)) o[k] = { v: fin(b.v, 1e9), at: clip(String(b.at || ''), 32), x: fin(b.x, 4e6), z: fin(b.z, 4e6), r: b.r ? 1 : 0 }; };
  rec('top', (b, a) => b > a);            // the fastest he has ever gone, m/s
  rec('wave', (b, a) => b > a);           // the biggest wave he has raised
  rec('mile', (b, a) => b > 0 && b < a);  // his fastest mile, in seconds
  rec('km1', (b, a) => b > 0 && b < a);   // his fastest kilometre
  rec('drop', (b, a) => b > a);           // the longest fall he has lived through
  if (typeof n.first === 'string' && (!o.first || n.first < o.first)) o.first = clip(n.first, 32);
  return o;
}

export async function POST(req) {
  const bad = refuse(req, 160_000); if (bad) return bad;
  let b; try { b = await req.json(); } catch { return json({ error: 'bad request' }, 400); }
  if (!b || typeof b !== 'object') return json({ error: 'bad request' }, 400);
  const T = await travellerOf(req, b); if (!T) return json({ error: 'who are you?' }, 401);
  const key = T.hash, now = new Date().toISOString();

  if (b.op === 'push') {
    if (limited(req, 'stats-push', 30)) return json({ error: 'slow down' }, 429);
    const name = nameOf(b.name);
    // where he flew
    const pts = (Array.isArray(b.track) ? b.track : []).slice(0, 400).filter(p => Array.isArray(p) && p.length >= 6 && Number.isFinite(+p[0]))
      .map(p => ({ key, t: new Date(Math.min(Date.now() + 60_000, Math.max(Date.now() - 864e5 * 7, +p[0]))).toISOString(), x: fin(p[1], 4e6), y: fin(p[2], 2e5), z: fin(p[3], 4e6), r: p[4] ? 1 : 0, v: fin(p[5], 1e6), f: /^[a-z]$/.test(p[6]) ? p[6] : 'h' }));
    // what was said
    const talk = (Array.isArray(b.talk) ? b.talk : []).slice(0, 60).filter(l => Array.isArray(l) && GOD.test(String(l[0])) && (l[1] === 'me' || l[1] === 'god') && typeof l[2] === 'string' && l[2].trim())
      .map(l => ({ key, god: String(l[0]), who: l[1], text: clip(l[2], 1200), at: new Date(Number.isFinite(+l[3]) ? Math.min(Date.now() + 60_000, +l[3]) : Date.now()).toISOString() }));
    const s = b.stats && typeof b.stats === 'object' ? b.stats : null;
    if (!LIVE) {
      if (s) MEM.stats.set(key, { name: name || MEM.stats.get(key)?.name || '', data: merge(MEM.stats.get(key)?.data, s), updated_at: now });
      for (const p of pts) MEM.pts.push(p); for (const l of talk) MEM.talk.push({ id: MEM.id++, hidden: false, ...l });
      if (MEM.pts.length > 200_000) MEM.pts.splice(0, 50_000);
      return json({ ok: true });
    }
    if (s) { const o = await rest(`player_stats?select=data&key=eq.${key}`); const data = merge(Array.isArray(o.data) && o.data[0] ? o.data[0].data : null, s);
      await rest('player_stats?on_conflict=key', { method: 'POST', body: { key, name, data, updated_at: now }, prefer: 'resolution=merge-duplicates,return=minimal' }); }
    if (pts.length) await rest('flight_points', { method: 'POST', body: pts, prefer: 'return=minimal' });
    if (talk.length) await rest('talk_log', { method: 'POST', body: talk, prefer: 'return=minimal' });
    return json({ ok: true });
  }

  // the whole record, for the stats page
  if (b.op === 'get') {
    if (limited(req, 'stats-get', 30)) return json({ error: 'slow down' }, 429);
    if (!LIVE) { const s = MEM.stats.get(key) || null, mine = MEM.pts.filter(p => p.key === key);
      return json({ name: s?.name || '', data: s?.data || {}, talk: MEM.talk.filter(l => l.key === key && !l.hidden).slice(-600).map(({ key, hidden, ...l }) => l), span: mine.length ? [mine[0].t, mine[mine.length - 1].t] : null, points: mine.length, save: null }); }
    const [s, talk, first, last, trav] = await Promise.all([
      rest(`player_stats?select=name,data&key=eq.${key}`),
      rest(`talk_log?select=id,god,who,text,at&key=eq.${key}&hidden=eq.false&order=at.desc&limit=600`),
      rest(`flight_points?select=t&key=eq.${key}&order=t.asc&limit=1`),
      rest(`flight_points?select=t&key=eq.${key}&order=t.desc&limit=1`, { prefer: 'count=estimated' }),
      rest(`travellers?select=name,save,first_at&hash=eq.${key}`),
    ]);
    const row = Array.isArray(s.data) && s.data[0], tv = Array.isArray(trav.data) && trav.data[0];
    const sv = tv && tv.save && typeof tv.save === 'object' ? tv.save : null;
    return json({ name: row?.name || tv?.name || '', data: row?.data || {}, talk: Array.isArray(talk.data) ? talk.data.reverse() : [],
      span: first.data?.[0] && last.data?.[0] ? [first.data[0].t, last.data[0].t] : null, points: last.count || 0, since: tv?.first_at || null,
      save: sv ? { patron: sv.patron || null, quests: sv.quests || [], qlog: sv.qlog || [], chain: sv.chain || null, met: sv.met || [], errands: sv.errands || {}, items: sv.items || [], phase: sv.phase || '' } : null });
  }

  // where he flew between two moments (thinned to a few thousand points)
  if (b.op === 'track') {
    if (limited(req, 'stats-track', 30)) return json({ error: 'slow down' }, 429);
    const from = new Date(+b.from || 0).toISOString(), to = new Date(+b.to || Date.now()).toISOString();
    let rows;
    if (!LIVE) rows = MEM.pts.filter(p => p.key === key && p.t >= from && p.t <= to);
    else { rows = []; for (let page = 0; page < 6; page++) { const r = await rest(`flight_points?select=t,x,y,z,r,v,f&key=eq.${key}&t=gte.${encodeURIComponent(from)}&t=lte.${encodeURIComponent(to)}&order=t.asc`, { range: `${page * 1000}-${page * 1000 + 999}` }); if (!Array.isArray(r.data) || !r.data.length) break; rows.push(...r.data); if (r.data.length < 1000) break; } }
    const step = Math.max(1, Math.ceil(rows.length / 5000));
    return json({ points: rows.filter((_, i) => i % step === 0).map(p => [Date.parse(p.t), Math.round(p.x * 10) / 10, Math.round(p.y * 10) / 10, Math.round(p.z * 10) / 10, p.r, Math.round(p.v * 10) / 10, p.f]) });
  }

  // "delete" a line: hidden from him, kept all the same
  if (b.op === 'hide') {
    const id = Number.isInteger(b.id) && b.id > 0 ? b.id : null; if (!id) return json({ error: 'bad request' }, 400);
    if (!LIVE) { const l = MEM.talk.find(l => l.id === id && l.key === key); if (l) l.hidden = true; return json({ ok: true }); }
    const r = await rest(`talk_log?id=eq.${id}&key=eq.${key}`, { method: 'PATCH', body: { hidden: true }, prefer: 'return=minimal' });
    return json({ ok: r.ok });
  }
  return json({ error: 'bad request' }, 400);
}
