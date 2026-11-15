// The keeper's scenes (/api/hub?fn=story): the campaign he writes in his studio, kept on the server so that it reaches
// every player. Anyone may read what is published (GET); only the keeper may write (a signed-in, confirmed email listed in
// ADMIN_EMAILS: adminOf in _store.js, never a name), and only he sees his drafts (GET ?all=1, signed in).
// A scene is plain data and is cleaned here the same way the page cleans it: words, a place, a trigger, and effects from
// a short safe list (a quest, a gift, a toast, a title on the sky, a god moved). Nothing in it is ever run as code, and
// the page puts its words on the screen as text. Until the table is made (supabase/world.sql, story_scenes) a read is
// simply empty and a write says so.
import { json, refuse, limited, clip } from './_lib.js';
import { rest, LIVE, adminOf } from './_store.js';

const ID = /^[a-z0-9_-]{2,40}$/, WORD = /^[a-z_]{0,20}$/;
const WHO = new Set(['narrator', 'icarus', 'daedalus', 'hades', 'prometheus', 'zeus', 'hera', 'poseidon', 'demeter', 'athena', 'apollo', 'artemis', 'ares', 'aphrodite', 'hephaestus', 'hermes', 'dionysus']);
const GODS = new Set(['zeus', 'hera', 'poseidon', 'demeter', 'athena', 'apollo', 'artemis', 'ares', 'aphrodite', 'hephaestus', 'hermes', 'dionysus']);
const ON = new Set(['hand', 'start', 'enter', 'quest', 'talk', 'phase']);
const FX = new Set(['quest', 'gift', 'toast', 'title', 'god']);
const KIND = new Set(['dive', 'skim', 'walk', 'perfect', 'fall', 'hoops', 'jet', 'beacon', 'island', 'waterfall', 'animal', 'climb', 'still', 'fly', 'visit', 'arena', 'torch', 'under', 'trees', 'stones']);
const PERK = new Set(['ember', 'wings', 'swift', 'feather', 'sun', 'lens', 'tide', 'calm', 'fire', 'bolt']);
const num = (v, lo, hi, d = 0) => Number.isFinite(+v) ? Math.max(lo, Math.min(hi, Math.round(+v))) : d;
const line = s => (typeof s === 'string' ? s.replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 300) : '');
const word = (s, set) => { const w = String(s || '').toLowerCase(); return set ? (set.has(w) ? w : '') : WORD.test(w) ? w : ''; };
export function sceneClean(s) {
  if (!s || typeof s !== 'object' || !ID.test(String(s.id || ''))) return null;
  const w = s.where && typeof s.where === 'object' && Number.isFinite(+s.where.x) && Number.isFinite(+s.where.z)
    ? { realm: s.where.realm === 'under' ? 'under' : 'over', x: num(s.where.x, -99999, 99999), z: num(s.where.z, -99999, 99999), y: num(s.where.y, -2000, 9000, 0), r: num(s.where.r, 20, 3000, 150), label: clip(s.where.label, 40) } : null;
  const on = s.on && typeof s.on === 'object' ? { k: word(s.on.k, ON) || 'hand', v: word(s.on.v) } : { k: 'hand', v: '' };
  const fx = (Array.isArray(s.fx) ? s.fx : []).slice(0, 8).map(f => {
    const k = f && word(f.k, FX); if (!k) return null;
    if (k === 'quest') { const god = word(f.god, GODS), kind = word(f.kind, KIND), perk = word(f.perk, PERK); return god && kind && perk ? { k, god, kind, n: num(f.n, 0, 5000, 1), perk } : null; }
    if (k === 'gift') { const perk = word(f.perk, PERK); return perk ? { k, perk, god: word(f.god, GODS) } : null; }
    if (k === 'toast') { const text = clip(f.text, 90); return text ? { k, text } : null; }
    if (k === 'title') { const big = clip(f.big, 26); return big ? { k, big, small: clip(f.small, 70) } : null; }
    const god = word(f.god, GODS); return god ? { k, god, at: f.at === 'here' ? 'here' : 'me' } : null;
  }).filter(Boolean);
  return { id: s.id, v: 1, title: clip(s.title, 60) || 'A scene', who: word(s.who, WHO) || 'narrator', lines: (Array.isArray(s.lines) ? s.lines : []).slice(0, 24).map(line).filter(Boolean),
    where: w, on, once: s.once !== false, fx, ord: num(s.ord, 0, 99999, 0) };
}
const MEM = globalThis.__icarusStory ||= { at: 0, list: null };
const out = rows => (Array.isArray(rows) ? rows : []).map(r => { const s = sceneClean(r && r.body); return s ? { ...s, pub: !!r.published, at: r.at || '' } : null; }).filter(Boolean);

export async function GET(req) {
  if (limited(req, 'story', 60)) return json({ error: 'slow down' }, 429);
  const all = new URL(req.url).searchParams.get('all') === '1';
  if (!LIVE) return json({ scenes: [], live: false });
  if (all) {   // (his drafts as well: only for him)
    if (!(await adminOf(req))) return json({ error: 'not yours' }, 403);
    const r = await rest('story_scenes?select=id,body,published,ord,at&order=ord.asc,at.asc&limit=500');
    return json(r.ok ? { scenes: out(r.data), live: true } : { scenes: [], live: true, missing: r.status === 404 || r.status === 400 });
  }
  if (MEM.list && Date.now() - MEM.at < 60_000) return json({ scenes: MEM.list, live: true });   // (a minute, per instance: everyone asks as they arrive)
  const r = await rest('story_scenes?select=id,body,published,ord,at&published=eq.true&order=ord.asc,at.asc&limit=300');
  const list = r.ok ? out(r.data).map(({ pub, at, ...s }) => s) : [];
  MEM.list = list; MEM.at = Date.now();
  return json({ scenes: list, live: true });
}

export async function POST(req) {
  const bad = refuse(req, 65536); if (bad) return bad;
  if (limited(req, 'story-w', 40)) return json({ error: 'slow down' }, 429);
  let b; try { b = await req.json(); } catch { return json({ error: 'bad request' }, 400); }
  if (!b || typeof b !== 'object') return json({ error: 'bad request' }, 400);
  const me = await adminOf(req); if (!me) return json({ error: 'not yours to write' }, 403);
  if (!LIVE) return json({ ok: false, error: 'no database here' });
  const missing = r => r.status === 404 || r.status === 400 ? 'the story table is not made yet (supabase/world.sql: story_scenes)' : 'the server did not keep it';
  if (b.op === 'put') {   // (one scene, as he has it: published or not)
    const s = sceneClean(b.scene); if (!s) return json({ ok: false, error: 'not a scene' }, 400);
    const r = await rest('story_scenes?on_conflict=id', { method: 'POST', prefer: 'resolution=merge-duplicates,return=minimal', body: [{ id: s.id, body: s, published: !!b.pub, ord: s.ord, by_email: me.email, at: new Date().toISOString() }] });
    MEM.list = null; return json(r.ok ? { ok: true, id: s.id, pub: !!b.pub } : { ok: false, error: missing(r) });
  }
  if (b.op === 'del') {
    const id = String(b.id || ''); if (!ID.test(id)) return json({ ok: false, error: 'bad id' }, 400);
    const r = await rest(`story_scenes?id=eq.${encodeURIComponent(id)}`, { method: 'DELETE', prefer: 'return=minimal' });
    MEM.list = null; return json(r.ok ? { ok: true } : { ok: false, error: missing(r) });
  }
  return json({ error: 'bad op' }, 400);
}
