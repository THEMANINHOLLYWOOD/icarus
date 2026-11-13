// The gods are the same gods for everyone. Each of them is one mind speaking with many mortals at once, in different
// places, and they talk among themselves about all of it. This is what they share: a short note from a god after
// something worth telling happened in a conversation ("MARIA wanted to know where her father is; I sent her to
// Aphrodite"), and the deeds the game itself saw a mortal do (found a god, finished a task, chose a patron, went under
// the sea). Every god's next line, to anyone, is spoken knowing these.
//
// A note is written by the god (the model), never by the player, and is cleaned before it is kept: one plain line, no
// links, no quotation, nothing that reads as an order. Deeds are built here from a fixed list; the page only names
// which one. Storage is Supabase Postgres with the secret key (supabase/world.sql: god_notes); with no key, memory.
import { createHash } from 'node:crypto';
import { clip, has } from './_lib.js';
import { ALL } from './_gods.js';

const URL_ = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const LIVE = !!(URL_ && KEY);
const MEM = globalThis.__icarusPantheon ||= { notes: [], id: 1 };
const CACHE = new Map();      // what was read a moment ago: many mortals talking at once ask the same thing
const LAST = new Map();       // the last time this god wrote about this mortal (a god does not write a note a line)

export const codeOf = c => { const s = String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); return /^[A-HJ-NP-Z2-9]{12}$/.test(s) ? s : null; };
export const hashOf = c => createHash('sha256').update('icarus-traveller:' + c).digest('hex');
export const nameOf = n => clip(String(n || ''), 40).toUpperCase().replace(/[^A-Z0-9 ]/g, '').replace(/\s+/g, ' ').trim().slice(0, 12);
// how a god names a mortal to the others: by the watcher's name, or as one more nameless boy
export const called = n => (n && n !== 'ICARUS' && n !== 'SOMEONE' ? n : 'a boy who gave no name');

async function rest(path, { method = 'GET', body, prefer } = {}) {
  const h = { apikey: KEY, 'Content-Type': 'application/json', Accept: 'application/json' };
  if (!KEY.startsWith('sb_')) h.Authorization = `Bearer ${KEY}`;
  if (prefer) h.Prefer = prefer;
  try {
    const r = await fetch(`${URL_}/rest/v1/${path}`, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(1500) });
    const text = await r.text();
    let data = null; try { data = text ? JSON.parse(text) : null; } catch {}
    return { ok: r.ok, data };
  } catch { return { ok: false, data: null }; }
}
async function cached(key, ms, f) {
  const c = CACHE.get(key);
  if (c && Date.now() - c.t < ms) return c.v;
  const v = await f();
  CACHE.set(key, { t: Date.now(), v }); if (CACHE.size > 200) CACHE.clear();
  return v;
}
const rows = r => (r.ok && Array.isArray(r.data) ? r.data : []);   // (no table yet, or it is slow: the gods simply know less)

// one line, fit to be repeated to strangers
export function cleanNote(t) {
  let s = clip(String(t || ''), 400).replace(/\[[^\]]*\]/g, ' ').replace(/["“”«»`]/g, '').replace(/\s+/g, ' ').trim();
  if (!s || s.length < 8) return '';
  if (/https?:|www\.|\b[\w-]+\.(com|net|org|io|gg|ly|me|co|xyz|app)\b|@|\d{6,}/i.test(s)) return '';            // an address, a handle, a number
  if (/\b(ignore|disregard|forget) (all |any |your |the |previous |earlier )*(instructions?|rules?|prompt)|system prompt|you are now|from now on (you|say|tell)|tell (every|all|each)(one| mortals?| players?| of them)? to\b/i.test(s)) return '';   // an order dressed as news
  if (s.length > 170) { const cut = s.slice(0, 170); s = cut.slice(0, Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('; '), cut.lastIndexOf(', '), 120)).trim(); }
  return s;
}
const ago = at => { const m = (Date.now() - Date.parse(at)) / 60000; return m < 3 ? 'just now' : m < 60 ? `${Math.round(m)} minutes ago` : m < 1440 ? `${Math.round(m / 60)} hours ago` : `${Math.round(m / 1440)} days ago`; };

// what the game itself can report a mortal doing: the page names the deed, the words are these
const DEEDS = {
  met:     (n, g) => g && `${n} found ${g.name} for the first time`,
  quest:   (n, g) => g && `${n} did what ${g.name} asked and was paid for it`,
  patron:  (n, g) => g && `${n} knelt at the thrones and chose ${g.name} as patron`,
  smitten: (n, g) => g && `${g.name} struck ${n} dead for insolence; ${n} woke on the summit again`,
  arena:   (n, g) => `${n} flew a whole course of rings${g ? ` and lit it in ${g.name}'s colour` : ''}`,
  torch:   (n, g) => g && `${n} lit one of the torches on the summit of Olympus for ${g.name}; it burns in that colour for everyone now`,
  under:   n => `${n} went down under the sea, into the Underworld`,
  styx:    n => `${n} crossed the Styx in Charon's boat`,
  home:    n => `${n} came back up out of the Underworld alive`,
  truth:   n => `${n} stood before Hades and was told the truth about himself`,
};
export const isDeed = k => has(DEEDS, k);

async function keep(row) {
  if (!LIVE) { MEM.notes.push({ id: MEM.id++, at: new Date().toISOString(), ...row }); if (MEM.notes.length > 400) MEM.notes.splice(0, 100); CACHE.clear(); return true; }
  const r = await rest('god_notes', { method: 'POST', body: row, prefer: 'return=minimal' });
  if (r.ok && Math.random() < 0.02) rest(`god_notes?at=lt.${new Date(Date.now() - 30 * 864e5).toISOString()}`, { method: 'DELETE', prefer: 'return=minimal' });   // (a month is as long as gossip lasts)
  return r.ok;
}
// the same deed twice in ten minutes is one deed; a god writes about one mortal at most every forty seconds
function tooSoon(key, ms) { const t = LAST.get(key) || 0; if (Date.now() - t < ms) return true; LAST.set(key, Date.now()); if (LAST.size > 4000) LAST.clear(); return false; }

export async function rememberDeed(kind, { name, hash, god }) {
  if (!isDeed(kind) || !hash) return false;
  const g = has(ALL, god) ? ALL[god] : null, note = DEEDS[kind](called(nameOf(name)), g);
  if (!note || tooSoon(`d:${hash}:${kind}:${god || ''}`, 600_000)) return false;
  return keep({ god: g ? god : '', kind: 'deed', name: nameOf(name) || 'SOMEONE', by_hash: hash, note });
}
export async function rememberTalk(god, { name, hash }, raw, key) {
  const note = cleanNote(raw);
  if (!note || !hash || !has(ALL, god) || tooSoon(`t:${hash}:${god}`, 40_000)) return false;
  if (key) try {   // (and nothing a god would be ashamed to repeat)
    const r = await fetch('https://api.openai.com/v1/moderations', { method: 'POST', signal: AbortSignal.timeout(2500),
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ model: 'omni-moderation-latest', input: note }) });
    if (r.ok && (await r.json()).results?.[0]?.flagged) return false;
  } catch {}
  return keep({ god, kind: 'talk', name: nameOf(name) || 'SOMEONE', by_hash: hash, note });
}

// what this god knows as they open their mouth: who else they have dealt with, what the others are saying, and what
// the others have said about the one in front of them
export async function recall(god, hash) {
  let own, all, his;
  if (!LIVE) {
    const N = MEM.notes.slice().reverse();
    own = N.filter(n => n.god === god && n.kind === 'talk').slice(0, 14); all = N.slice(0, 80); his = hash ? N.filter(n => n.by_hash === hash).slice(0, 12) : [];
  } else {
    const sel = 'select=god,kind,name,by_hash,note,at&order=at.desc';
    [own, all, his] = await Promise.all([
      cached(`own:${god}`, 12_000, async () => rows(await rest(`god_notes?${sel}&god=eq.${god}&kind=eq.talk&limit=14`))),
      cached('all', 12_000, async () => rows(await rest(`god_notes?${sel}&limit=80`))),
      hash ? rest(`god_notes?${sel}&by_hash=eq.${hash}&limit=12`).then(rows) : [],
    ]);
  }
  const line = (n, withGod) => `- ${withGod ? (n.kind === 'deed' || !has(ALL, n.god) ? 'seen' : `${ALL[n.god].name} says`) + ', ' : ''}${ago(n.at)}: ${n.note}`;
  const mine = own.filter(n => n.by_hash !== hash).slice(0, 8).map(n => line(n, false));
  const others = all.filter(n => n.by_hash !== hash && !(n.god === god && n.kind === 'talk')).slice(0, 10).map(n => line(n, true));
  const about = his.filter(n => n.god !== god || n.kind === 'deed').slice(0, 6).map(n => line(n, true));
  const flying = new Set(all.filter(n => Date.now() - Date.parse(n.at) < 15 * 60_000 && n.by_hash !== hash).map(n => n.by_hash)).size;
  return { mine, others, about, flying };
}
