// The world in named country. It is cut into squares three kilometres across; the first time anyone flies into one,
// the page says what is there (sea or hills, a volcano, an island of a god, temples, the dark of the Underworld) and a
// name is found for it — a place-name, the kind the Greeks gave — and kept for everyone after. Each name also gets a
// way of being written on the sky (style: one of eight ways the letters arrive).
import { json, refuse, limited, clip } from './_lib.js';
import { rest, LIVE, nameOf } from './_store.js';

const MEM = globalThis.__icarusAreas ||= new Map();
const KEY_RE = /^(over|under):-?\d{1,5}:-?\d{1,5}$/;
const STYLES = 8;
const HEROES = new Set(['zeus', 'hera', 'poseidon', 'demeter', 'athena', 'apollo', 'artemis', 'ares', 'aphrodite', 'hephaestus', 'hermes', 'dionysus']);
const WREATH = a => a && a.wx != null ? { w: [a.wx, a.wy, a.wz, a.wyaw], hero: a.hero || '', holder: a.holder || '' } : a && a.hero ? { hero: a.hero, holder: a.holder || '' } : {};
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
  if (!LIVE) return json({ areas: Object.fromEntries(keys.filter(k => MEM.has(k)).map(k => { const a = MEM.get(k); return [k, { name: a.name, style: a.style, by: a.by, ...WREATH(a) }]; })) });
  const inK = keys.map(k => `"${k}"`).join(',');
  let r = await rest(`world_areas?select=key,name,style,by_name,hero,holder,wx,wy,wz,wyaw&key=in.(${inK})`);
  if (!r.ok) r = await rest(`world_areas?select=key,name,style,by_name&key=in.(${inK})`);   // (until the table has the wreath's columns)
  return json({ areas: Object.fromEntries((Array.isArray(r.data) ? r.data : []).map(a => [a.key, { name: a.name, style: a.style, by: a.by_name, ...WREATH(a) }])) }, 200);
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
  const have = LIVE ? await rest(`world_areas?select=name,style,by_name&key=eq.${encodeURIComponent(key)}`) : null;
  const found = LIVE ? (Array.isArray(have.data) && have.data[0]) : MEM.get(key);
  if (found) return json({ key, name: found.name, style: found.style, by: found.by_name ?? found.by, fresh: false });
  if (limited(req, 'areas-name', 8)) return json({ error: 'slow down' }, 429);
  const hero = HEROES.has(b.hero) ? b.hero : '', name = await nameFor(key, clip(String(b.desc || ''), 400), hero ? hero[0].toUpperCase() + hero.slice(1) : ''), style = styleOf(key), by = nameOf(b.name) || '';
  if (!LIVE) { MEM.set(key, { name, style, by }); return json({ key, name, style, by, fresh: true }); }
  const w = await rest('world_areas?on_conflict=key', { method: 'POST', body: { key, name, style, by_name: by }, prefer: 'resolution=ignore-duplicates,return=minimal' });
  const again = await rest(`world_areas?select=name,style,by_name&key=eq.${encodeURIComponent(key)}`);   // (someone else may have named it in the same moment: theirs stands)
  const a = Array.isArray(again.data) && again.data[0] || { name, style, by_name: by };
  return json({ key, name: a.name, style: a.style, by: a.by_name, fresh: w.ok && a.name === name });
}
