// The world in named country. It is cut into squares three kilometres across; the first time anyone flies into one,
// the page says what is there (sea or hills, a volcano, an island of a god, temples, the dark of the Underworld) and a
// name is found for it — a place-name, the kind the Greeks gave — and kept for everyone after. Each name also gets a
// way of being written on the sky (style: one of eight ways the letters arrive).
// Whoever finds a place holds its name: they may call it anything they like (op 'rename'), and that is its name for
// everyone, for good, until they change it again. What proves the finder is their travel code (only its hash is kept).
// Someone of a faction finds a place for the faction: its tag is kept beside the finder, with the hash of a proof only
// its members can make from their shared secret, and any of them may name it (the members flying vote on it first, in
// their sealed chat; the page does that and sends the name that passed).
import { createHash } from 'node:crypto';
import { json, refuse, limited, clip } from './_lib.js';
import { rest, LIVE, nameOf, travellerOf } from './_store.js';

const MEM = globalThis.__icarusAreas ||= new Map();
const KEY_RE = /^(over|under):-?\d{1,5}:-?\d{1,5}$/;
const STYLES = 8;
const HEROES = new Set(['zeus', 'hera', 'poseidon', 'demeter', 'athena', 'apollo', 'artemis', 'ares', 'aphrodite', 'hephaestus', 'hermes', 'dionysus']);
const WREATH = a => a && a.wx != null ? { w: [a.wx, a.wy, a.wz, a.wyaw], hero: a.hero || '', holder: a.holder || '' } : a && a.hero ? { hero: a.hero, holder: a.holder || '' } : {};
const FULL = 'key,name,style,by_name,named_by,renamed_at,owner_hash,group_tag,group_name,hero,holder,wx,wy,wz,wyaw', BASE = 'key,name,style,by_name';
// what the page is told of a place: its name and who gave it, and of who holds it only enough to know if it is him
// (the first sixteen of the hash, as the hamlets already show) or his faction (its public tag)
const OUT = a => ({ name: a.name, style: a.style | 0, by: a.by_name ?? '', ...(a.renamed_at ? { rn: 1, nb: a.named_by || '' } : {}), ...(a.owner_hash ? { o: String(a.owner_hash).slice(0, 16) } : {}), ...(a.group_tag ? { g: a.group_tag, gn: a.group_name || '' } : {}), ...WREATH(a) });
const groupKey = gp => /^[0-9a-f]{64}$/.test(String(gp || '')) ? createHash('sha256').update('icarus-place-group:' + gp).digest('hex') : '';
const groupOf = f => f && /^[0-9a-f]{10}$/.test(String(f.tag || '')) && groupKey(f.gp) ? { group_tag: f.tag, group_key: groupKey(f.gp), group_name: String(f.name || '').toUpperCase().replace(/[^A-Z0-9 ]/g, '').replace(/\s+/g, ' ').trim().slice(0, 16) || 'A FACTION' } : null;
async function rowsOf(filter) {   // (the columns for owners and wreaths, until the table has them: only the name)
  let r = await rest(`world_areas?select=${FULL}&${filter}`);
  if (!r.ok) r = await rest(`world_areas?select=${BASE}&${filter}`);
  return Array.isArray(r.data) ? r.data : [];
}

// ── A name somebody gives. Two to forty characters: letters (of any alphabet), digits, spaces, and ' - . , ! ? & only;
//    no links, no runs of one letter, no wall of punctuation, no word longer than twenty-four. And none of a short list of
//    slurs and abuse, looked for through the usual disguises (numbers for letters, letters spaced out, accents, look-alike
//    Cyrillic). The list is kept short on purpose: it blocks what is plainly abuse and leaves real place-words alone.
const LOOK = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '8': 'b', '9': 'g', '@': 'a', '$': 's', '!': 'i', '|': 'i', 'а': 'a', 'е': 'e', 'о': 'o', 'р': 'p', 'с': 'c', 'х': 'x', 'і': 'i', 'у': 'y', 'к': 'k', 'т': 't', 'н': 'h', 'м': 'm', 'в': 'b' };
const skel = s => String(s).normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/./gu, c => LOOK[c] || c);
const RUDE_IN = [/n+i+g{2,}/, /f+a+g+o+t/, /f+u+c+k/, /m+o+t+h+e+r+f/, /k{3}/, /h+i+t+l+e+r/, /s+i+e+g+h+e+i+l/, /w+h+i+t+e+p+o+w+e+r/, /p+a+e?d+o+p+h/, /w+e+t+b+a+c+k/, /t+o+w+e+l+h+e+a+d/, /r+a+g+h+e+a+d/];   // (in the letters run together)
const RUDE_WORD = new Set(['fag', 'fags', 'faggy', 'kike', 'kikes', 'spic', 'spics', 'spick', 'chink', 'chinks', 'gook', 'gooks', 'coon', 'coons', 'beaner', 'beaners', 'tranny', 'trannies', 'retard', 'retards', 'retarded', 'paki', 'pakis', 'dyke', 'dykes', 'cunt', 'cunts', 'whore', 'whores', 'slut', 'sluts', 'rape', 'raped', 'raping', 'nazi', 'nazis', 'heil', 'shit', 'shits', 'shitty', 'bitch', 'bitches', 'twat', 'twats', 'wank', 'wanker', 'wankers', 'nonce', 'pedo', 'pedos', 'paedo', 'rapist', 'rapists', 'porn', 'jizz', 'penis', 'vagina', 'tits', 'boobs', 'nig', 'nigs', 'negro', 'negroes', 'kys']);   // (whole words only: a word that is also an honest one is left out)
export function placeName(s) {
  const t = String(s || '').normalize('NFKC').replace(/[‘’ʼ`]/g, "'").replace(/[‐-—]/g, '-').replace(/\s+/g, ' ').trim(), n = [...t].length;
  if (n < 2 || n > 40) return { error: 'a name is 2 to 40 characters' };
  if (!/^[\p{L}\p{M}\p{N}' .,!?&-]+$/u.test(t)) return { error: "letters, digits, spaces and ' - . , ! ? & only" };
  if ((t.match(/[\p{L}\p{N}]/gu) || []).length < 2) return { error: 'a name needs letters in it' };
  if (/\p{M}{3,}/u.test(t) || /(\p{L})\1{3,}/u.test(t) || /[',.!?&-]{3,}/.test(t) || (t.match(/[',.!?&-]/g) || []).length > 8) return { error: 'that is not a name' };
  if (t.split(' ').some(w => [...w].length > 24)) return { error: 'no word longer than 24 letters' };
  if (/https?|www\.|\.(com|net|org|gg|io|xyz|ly|tv|me|co)\b|discord/i.test(t)) return { error: 'no links' };
  const k = skel(t), run = k.replace(/[^\p{L}\p{N}]/gu, ''), words = k.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  if (RUDE_IN.some(r => r.test(run)) || words.some(w => RUDE_WORD.has(w)) || RUDE_WORD.has(run)) return { error: 'not that name' };
  return { name: t };
}

const styleOf = k => { let h = 2166136261; for (let i = 0; i < k.length; i++) h = Math.imul(h ^ k.charCodeAt(i), 16777619); return (h >>> 0) % STYLES; };
const fallback = (k, d) => {   // (no voice to ask: a name made of what is there)
  const words = String(d || '').toLowerCase(), pick = (a) => a[(parseInt(k.replace(/\D/g, '').slice(-6) || '7', 10)) % a.length];
  if (k.startsWith('under')) return pick(['The Grey Fields', 'Asphodel Reach', 'The Long Dark', 'Lethe Shallows', 'The Ash Plain']);
  if (/volcano|lava/.test(words)) return pick(['The Burning Teeth', 'Hephaestus Forge', 'The Red Throat']);
  if (/sea|water|ocean/.test(words)) return pick(['The Wine-Dark Reach', 'Salt Narrows', 'The Open Blue', 'Gull Water']);
  if (/mountain|peak|high/.test(words)) return pick(['The High Teeth', 'Cloudhold', 'The Stone Shoulders']);
  return pick(['The Olive Hills', 'Shepherd Downs', 'The Quiet Valleys', 'Thyme Slopes', 'The Low Pastures']);
};
async function nameFor(key, desc, hero) {
  const k = process.env.OPENAI_API_KEY; if (!k) return fallback(key, desc);
  try {
    const r = await fetch('https://api.openai.com/v1/chat/completions', { method: 'POST', signal: AbortSignal.timeout(9000), headers: { Authorization: `Bearer ${k}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: process.env.OPENAI_MODEL || 'gpt-4.1-mini', max_completion_tokens: 60, temperature: 1, response_format: { type: 'json_object' }, messages: [
        { role: 'system', content: `You name regions of a mythic Greek world seen from the air by phoenixes. Given what is in a region, give it one place-name of 1 to 4 words, in English, that nobody would guess: vivid, particular, sometimes strange or funny, the way sailors and shepherds really name places after something that happened there, a shape, a smell, an animal, a feeling (e.g. "Where the Goats Argue", "The Drowned Bell", "Saltlick Rise", "Kettle of Gulls", "The Ninth Bend", "Widow Thyme", "Copper Shallows"). Avoid the pattern "The <Adjective> <Noun>" most of the time, avoid "Reach", "Vale", "Hollow" and "Expanse", and never reuse a name you would give anywhere else.${hero ? ` The first to find it flies for ${hero}; about one time in three, let the name honour that god in a small, sideways way (an emblem, a habit of theirs), never just "${hero}'s Land".` : ''} No other god names unless the region is that god's island. Answer with JSON: {"name": "..."}` },
        { role: 'user', content: `Region ${key}. What is there: ${desc}` }] }) });
    if (!r.ok) return fallback(key, desc);
    const j = await r.json(), n = JSON.parse(j.choices?.[0]?.message?.content || '{}').name;
    const clean = String(n || '').replace(/[^A-Za-z' \-]/g, '').replace(/\s+/g, ' ').trim().slice(0, 40);
    return clean.length >= 2 ? clean : fallback(key, desc);
  } catch { return fallback(key, desc); }
}

export async function GET(req) {
  const keys = (new URL(req.url).searchParams.get('k') || '').split(',').filter(k => KEY_RE.test(k)).slice(0, 80);
  if (!keys.length) return json({ areas: {} });
  if (!LIVE) return json({ areas: Object.fromEntries(keys.filter(k => MEM.has(k)).map(k => [k, OUT(MEM.get(k))])) });
  const rows = await rowsOf(`key=in.(${keys.map(k => `"${k}"`).join(',')})`);
  return json({ areas: Object.fromEntries(rows.map(a => [a.key, OUT(a)])) }, 200);
}
export async function POST(req) {
  const bad = refuse(req, 4096); if (bad) return bad;
  let b; try { b = await req.json(); } catch { return json({ error: 'bad request' }, 400); }
  const key = String(b && b.key || ''); if (!KEY_RE.test(key)) return json({ error: 'bad request' }, 400);
  if (b.op === 'claim') {   // lit for a hero: whoever flies through the wreath last holds the place for theirs
    if (limited(req, 'areas-claim', 12)) return json({ error: 'slow down' }, 429);
    const hero = HEROES.has(b.hero) ? b.hero : '', holder = nameOf(b.name) || '', w = Array.isArray(b.w) && b.w.length === 4 && b.w.every(v => Number.isFinite(+v)) ? b.w.map(Number) : null;
    if (!holder || !hero && !w) return json({ error: 'bad claim' }, 400);   // (no hero: only setting the wreath where its finder met it)
    if (!LIVE) { const a = MEM.get(key); if (!a) return json({ error: 'no such place' }, 404); if (w && a.wx == null && Math.abs(w[0]) < 4e5 && Math.abs(w[2]) < 4e5) Object.assign(a, { wx: w[0], wy: w[1], wz: w[2], wyaw: w[3] }); if (hero) Object.assign(a, { hero, holder }); return json({ ok: true, kept: true, ...WREATH(a) }); }
    const cur = await rest(`world_areas?select=wx&key=eq.${encodeURIComponent(key)}`);
    if (!cur.ok) return json({ ok: true, kept: false });   // (the table has no room for it yet: it is lit for whoever is flying now, and not kept)
    const row = Array.isArray(cur.data) && cur.data[0]; if (!row) return json({ error: 'no such place' }, 404);
    const body = { ...(hero ? { hero, holder, held_at: new Date().toISOString() } : {}), ...(w && row.wx == null ? { wx: w[0], wy: w[1], wz: w[2], wyaw: w[3] } : {}) }; if (!Object.keys(body).length) return json({ ok: true, kept: true });
    const r = await rest(`world_areas?key=eq.${encodeURIComponent(key)}`, { method: 'PATCH', body, prefer: 'return=minimal' });
    return json({ ok: true, kept: r.ok });
  }
  if (b.op === 'rename') {   // the one who found it (or anyone of the faction it was found for) gives it a name of their own
    if (limited(req, 'areas-rename', 6)) return json({ error: 'slow down' }, 429);
    const p = placeName(b.to); if (p.error) return json({ error: p.error }, 400);
    const T = await travellerOf(req, b); if (!T) return json({ error: 'who are you?' }, 401);
    const gk = groupKey(b.gp), by = nameOf(b.name) || 'SOMEONE';
    let row;
    if (!LIVE) row = MEM.get(key);
    else {
      const cur = await rest(`world_areas?select=owner_hash,group_key,group_name&key=eq.${encodeURIComponent(key)}`);
      if (!cur.ok) return json({ error: 'places cannot be renamed yet: the world does not keep who found them', later: true }, 503);   // (until the table has the owners' columns)
      row = Array.isArray(cur.data) && cur.data[0];
    }
    if (!row) return json({ error: 'no such place' }, 404);
    const ours = !!(row.group_key && gk && row.group_key === gk), mine = !!(row.owner_hash && row.owner_hash === T.hash);
    if (!ours && !mine) return json({ error: row.owner_hash || row.group_key ? 'this place is not yours to name' : 'nobody holds the name of this place' }, 403);
    if (b.dry) return json({ ok: true, dry: true, key, name: p.name });   // (asked before a faction votes: would it be taken)
    const set = { name: p.name, named_by: ours ? row.group_name || by : by, renamed_at: new Date().toISOString() };
    if (!LIVE) { Object.assign(row, set); return json({ ok: true, key, ...OUT(row) }); }
    const r = await rest(`world_areas?key=eq.${encodeURIComponent(key)}`, { method: 'PATCH', body: set, prefer: 'return=minimal' });
    if (!r.ok) return json({ error: 'that name could not be kept' }, 502);
    const [a] = await rowsOf(`key=eq.${encodeURIComponent(key)}`);
    return json({ ok: true, key, ...OUT(a || { ...row, ...set, style: styleOf(key) }) });
  }
  const found = LIVE ? (await rowsOf(`key=eq.${encodeURIComponent(key)}`))[0] : MEM.get(key);
  if (found) return json({ key, ...OUT(found), fresh: false });
  if (limited(req, 'areas-name', 8)) return json({ error: 'slow down' }, 429);
  const hero = HEROES.has(b.hero) ? b.hero : '', name = await nameFor(key, clip(String(b.desc || ''), 400), hero ? hero[0].toUpperCase() + hero.slice(1) : ''), style = styleOf(key), by = nameOf(b.name) || '';
  const T = await travellerOf(req, b), G = groupOf(b.fac), hold = { ...(T ? { owner_hash: T.hash } : {}), ...(G || {}) };   // (who holds its name: the finder, and the faction they fly with)
  if (!LIVE) { const a = { name, style, by_name: by, ...hold }; MEM.set(key, a); return json({ key, ...OUT(a), fresh: true }); }
  let w = await rest('world_areas?on_conflict=key', { method: 'POST', body: { key, name, style, by_name: by, ...hold }, prefer: 'resolution=ignore-duplicates,return=minimal' });
  if (!w.ok && w.status === 400 && Object.keys(hold).length) w = await rest('world_areas?on_conflict=key', { method: 'POST', body: { key, name, style, by_name: by }, prefer: 'resolution=ignore-duplicates,return=minimal' });   // (until the table has the owners' columns: the name alone)
  const [a] = await rowsOf(`key=eq.${encodeURIComponent(key)}`);   // (someone else may have named it in the same moment: theirs stands)
  const out = a || { name, style, by_name: by };
  return json({ key, ...OUT(out), fresh: w.ok && out.name === name });
}
