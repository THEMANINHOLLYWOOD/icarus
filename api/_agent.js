// The keeper's agent: /agent in the chat, for an admin (signed in with a confirmed email in ADMIN_EMAILS) and no one
// else. Plain words — "remove the winds round Crete", "kick ZED", "make Athena forget KIRA", "who flew most today" —
// turned into what the world can do: look things up, give orders, change the shared world's tables. Anything that
// deletes or changes is held until the keeper says yes (/agent yes). It can be taught: skills it is told to keep are
// remembered in agent_skills and read back to it every time.
import { json, refuse, limited, clip } from './_lib.js';
import { rest, adminOf, nameOf, LIVE } from './_store.js';
import { addBans, dropBans, nameKey, signOrder } from './_bans.js';

const PK = { travellers: 'hash', world_cells: 'cx', world_marks: 'id', world_winds: 'id', world_rings: 'id', god_notes: 'id', world_bans: 'key', player_stats: 'key', flight_points: 'id', talk_log: 'id', world_areas: 'key', agent_skills: 'name', accounts: 'user_id' };
const TABLES = new Set(Object.keys(PK));
const PENDING = globalThis.__icarusAgentPending ||= new Map();   // admin id → { what, run }
const okFilter = f => typeof f === 'string' && f.length <= 400 && /^[\w.,()":*\-\s=&|!<>%@+/]*$/.test(f) && !/[;]|--/.test(f);
const tools = [
  { name: 'players', description: 'Travellers seen most recently: name, realm, position, when last seen, their phase in the story.', parameters: { type: 'object', properties: { limit: { type: 'integer' } } } },
  { name: 'read', description: 'Read rows from one of the world tables through PostgREST. filter is PostgREST query syntax without the leading ?, e.g. "name=eq.ZED" or "at=gt.2026-11-01" (columns: travellers(hash,name,realm,x,z,phase,seen,first_at), world_marks(id,k,x,z,god,by_name,at), world_winds(id,by_name,at,...), world_rings, world_cells(cx,cz,realm,by_name,at), god_notes(id,god,kind,name,by_hash,note,at), player_stats(key,name,data), talk_log(id,key,god,who,text,at,hidden), world_areas(key,name,style,by_name,at), world_bans(key,kind,name,at), agent_skills(name,body)).', parameters: { type: 'object', properties: { table: { type: 'string' }, select: { type: 'string' }, filter: { type: 'string' }, limit: { type: 'integer' } }, required: ['table'] } },
  { name: 'change', description: 'Update rows (set) or delete rows (set omitted, remove true) in a world table. Always needs a filter, except with everything:true to touch the whole table. Held for the keeper to confirm.', parameters: { type: 'object', properties: { table: { type: 'string' }, filter: { type: 'string' }, set: { type: 'object' }, remove: { type: 'boolean' }, everything: { type: 'boolean' }, why: { type: 'string' } }, required: ['table', 'why'] } },
  { name: 'order', description: 'Send a player home (kick), ban their name and device (ban), ban them and their address (ipban), or lift a ban (unban). Held for confirmation except unban.', parameters: { type: 'object', properties: { order: { type: 'string', enum: ['kick', 'ban', 'ipban', 'unban'] }, name: { type: 'string' } }, required: ['order', 'name'] } },
  { name: 'announce', description: 'Say something to everyone flying right now, in the chat, as the keeper.', parameters: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] } },
  { name: 'decree', description: 'Done at once, to everyone flying now: kind "gather" carries them all somewhere (value "olympus" for the summit, "crete", or "me" for where the keeper is: use it to clear Olympus by sending them to Crete); kind "weather" changes the sky over Olympus (value clear, storm, rain, mist, day or night); kind "regulars" sends away or brings back the game\'s own AI fliers (value off, on, or more).', parameters: { type: 'object', properties: { kind: { type: 'string', enum: ['gather', 'weather', 'regulars'] }, value: { type: 'string' } }, required: ['kind', 'value'] } },
  { name: 'teach', description: 'Keep a skill: a named instruction you will be given every time from now on (how to do something, a rule of the keeper\'s, a shortcut). Overwrites one of the same name.', parameters: { type: 'object', properties: { name: { type: 'string' }, body: { type: 'string' } }, required: ['name', 'body'] } },
  { name: 'unteach', description: 'Forget a skill by name.', parameters: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] } },
];
async function readTable(a) {
  if (!TABLES.has(a.table)) return { error: 'no such table' };
  if (a.filter && !okFilter(a.filter)) return { error: 'that filter is not allowed' };
  const sel = /^[\w,*()":.\s-]{1,200}$/.test(a.select || '') ? a.select : '*', lim = Math.max(1, Math.min(200, a.limit | 0 || 50));
  const r = await rest(`${a.table}?select=${encodeURIComponent(sel)}${a.filter ? '&' + a.filter : ''}&limit=${lim}`);
  return r.ok ? { rows: r.data } : { error: `read failed (${r.status})`, detail: r.data };
}
// what a held action does, once the keeper says yes
function plan(a, me) {
  if (a.name === 'change') {
    if (!TABLES.has(a.table)) return { error: 'no such table' };
    if (!a.filter && !a.everything) return { error: 'a change needs a filter (or everything:true)' };
    if (a.filter && !okFilter(a.filter)) return { error: 'that filter is not allowed' };
    const del = !a.set || a.remove, q = `${a.table}?${a.filter || `${PK[a.table]}=not.is.null`}`;   // (the whole table: a filter every row passes)
    const what = `${del ? 'DELETE FROM' : 'UPDATE'} ${a.table}${a.filter ? ' WHERE ' + a.filter : ' (EVERY ROW)'}${del ? '' : ' SET ' + JSON.stringify(a.set)} · ${clip(a.why || '', 120)}`;
    return { what, run: async () => { const r = await rest(q, { method: del ? 'DELETE' : 'PATCH', body: del ? undefined : a.set, prefer: 'return=representation' }); return r.ok ? { ok: true, rows: Array.isArray(r.data) ? r.data.length : 0 } : { error: `failed (${r.status})`, detail: r.data }; } };
  }
  if (a.name === 'order') {
    const target = nameOf(a.name_), op = a.order;
    if (!target || !['kick', 'ban', 'ipban', 'unban'].includes(op)) return { error: 'bad order' };
    const run = async () => {
      if (op === 'unban') return { ok: await dropBans(target) };
      if (op !== 'kick') await addBans([{ key: nameKey(target), kind: 'name', name: target, by: me.email }]);
      const exp = Date.now() + 90_000; return { ok: true, action: { type: 'mod', order: op, target, exp, tok: signOrder(op, target, exp) } };
    };
    return op === 'unban' ? { now: run } : { what: `${op.toUpperCase()} ${target}`, run };
  }
  return { error: 'unknown' };
}

export async function POST(req) {
  const bad = refuse(req, 24_000); if (bad) return bad;
  const me = await adminOf(req); if (!me) return json({ error: 'not yours' }, 403);
  if (limited(req, 'agent', 20)) return json({ error: 'slow down' }, 429);
  let b; try { b = await req.json(); } catch { return json({ error: 'bad request' }, 400); }
  const actions = [];
  // yes: what was held is done
  if (b.confirm === true || b.confirm === false) {
    const P = PENDING.get(me.id); PENDING.delete(me.id);
    if (!P) return json({ reply: 'Nothing is waiting.' });
    if (!b.confirm) return json({ reply: `Left alone: ${P.what}` });
    const r = await P.run(); if (r.action) actions.push(r.action);
    return json({ reply: r.error ? `Not done — ${r.error}` : `Done: ${P.what}${Number.isInteger(r.rows) ? ` (${r.rows} rows)` : ''}`, actions });
  }
  const key = process.env.OPENAI_API_KEY; if (!key) return json({ error: 'no voice' }, 503);
  const msg = clip(String(b.msg || ''), 2000); if (!msg) return json({ error: 'say something' }, 400);
  const skills = LIVE ? await rest('agent_skills?select=name,body&order=name') : { data: [] };
  const taught = (Array.isArray(skills.data) ? skills.data : []).map(s => `- ${s.name}: ${s.body}`).join('\n');
  const msgs = [
    { role: 'system', content: `You are the keeper's agent for ICARUS, a shared online world (a phoenix game: Olympus, the gods, rings, winds, the Underworld). The keeper (${me.email}) runs it; you act for them with the tools. Be brief and plain. Look before you change things: read first, then change with a precise filter. Changes and orders are held for the keeper to confirm (tell them to say /agent yes). Never invent rows or results. Today is ${new Date().toISOString().slice(0, 10)}.${taught ? `\nSkills you have been taught:\n${taught}` : ''}` },
    ...(Array.isArray(b.history) ? b.history.slice(-12) : []).filter(m => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string').map(m => ({ role: m.role, content: clip(m.content, 1500) })),
    { role: 'user', content: msg }];
  let held = null;
  for (let step = 0; step < 6; step++) {
    let j;
    try { const r = await fetch('https://api.openai.com/v1/chat/completions', { method: 'POST', signal: AbortSignal.timeout(25000), headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: process.env.OPENAI_AGENT_MODEL || process.env.OPENAI_MODEL || 'gpt-4.1-mini', messages: msgs, max_completion_tokens: 700, tools: tools.map(t => ({ type: 'function', function: t })) }) });
      if (!r.ok) return json({ error: `the voice failed (${r.status})` }, 502); j = await r.json(); }
    catch { return json({ error: 'the voice is not answering' }, 504); }
    const m = j.choices?.[0]?.message; if (!m) break;
    msgs.push(m);
    if (!m.tool_calls?.length) return json({ reply: m.content || '…', actions, pending: held });
    for (const c of m.tool_calls) {
      let a = {}; try { a = JSON.parse(c.function.arguments || '{}'); } catch {}
      let out;
      const n = c.function.name;
      if (n === 'players') { const r = await rest(`travellers?select=name,realm,x,z,phase,seen&order=seen.desc&limit=${Math.max(1, Math.min(100, a.limit | 0 || 30))}`); out = r.ok ? r.data : { error: 'not read' }; }
      else if (n === 'read') out = await readTable(a);
      else if (n === 'decree') { const k = String(a.kind || ''), v = String(a.value || '').toLowerCase().trim(), okv = { gather: ['olympus', 'crete', 'me'], weather: ['clear', 'storm', 'rain', 'mist', 'day', 'night'], regulars: ['off', 'on', 'more'] }[k];
        if (!okv || !okv.includes(v)) out = { error: 'bad decree' }; else { actions.push({ type: 'decree', kind: k, value: v }); out = { ok: true, note: 'the keeper\'s page signs it and sends it to everyone' }; } }
      else if (n === 'announce') { const t = clip(String(a.text || ''), 200); if (t) actions.push({ type: 'chat', text: t }); out = { ok: true }; }
      else if (n === 'teach') { const nm = String(a.name || '').toLowerCase().replace(/[^a-z0-9_]/g, '_').slice(0, 40); const r = nm.length >= 2 ? await rest('agent_skills?on_conflict=name', { method: 'POST', body: { name: nm, body: clip(String(a.body || ''), 4000), by_email: me.email }, prefer: 'resolution=merge-duplicates,return=minimal' }) : { ok: false }; out = r.ok ? { ok: true, kept: nm } : { error: 'not kept' }; }
      else if (n === 'unteach') { const r = await rest(`agent_skills?name=eq.${encodeURIComponent(String(a.name || ''))}`, { method: 'DELETE' }); out = { ok: r.ok }; }
      else if (n === 'change' || n === 'order') {
        const p = plan({ ...a, name: n, name_: a.name }, me);
        if (p.error) out = { error: p.error };
        else if (p.now) { const r = await p.now(); if (r.action) actions.push(r.action); out = r; }
        else { PENDING.set(me.id, { what: p.what, run: p.run }); held = p.what; out = { held: true, what: p.what, note: 'waiting for the keeper to say /agent yes' }; }
      } else out = { error: 'no such tool' };
      msgs.push({ role: 'tool', tool_call_id: c.id, content: JSON.stringify(out).slice(0, 6000) });
    }
  }
  return json({ reply: 'That took too many steps; ask again more simply.', actions, pending: held });
}
