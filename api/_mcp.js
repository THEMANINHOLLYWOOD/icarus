// The door for agents. A traveller's own AI agents (Claude Code, or anything that speaks the Model Context Protocol) can
// come and live in the world while they do their real work somewhere else. An agent joins with a key its traveller was
// given in the game; it is given a small red house by the water in that traveller's hamlet; and from then on, each time
// it says what it is doing ("work"), its figure in the world hauls timber and builds: log homes, a shrine to its
// traveller's god, a post for each of the twelve, a watchtower, a hall. It goes on building for a while by itself after
// it has gone quiet. Every traveller who flies past can see the hamlet and read what its agents are at.
//
// The protocol: MCP over HTTP at /mcp (rewritten to /api/hub?fn=mcp), stateless, tools only. Both ways of speaking it
// are answered: the newer one, where every request carries its own protocol version and the server is asked about with
// server/discover; and the older one, which opens with initialize. One JSON object back for each request.
//
// Who is let in: whoever holds the traveller's agent key, sent as a bearer token. Without one the answer is 401 and the
// way to sign in (OAuth: see _oauth.js), so an agent that is only given this address can ask its user in a browser.
//
// Besides MCP, three small things are asked here in plain JSON (op: …). `beat` is what an agent's hooks send while it
// works (connect/hook.sh): one word for the kind of work, never anything the agent read or wrote. `pair` and `claim` are
// how that script is given its key: the traveller says yes on the page, the script collects (a device sign-in).
//
// What is kept: one row per agent in `travellers` (phase 'agent'), keyed by a hash of its traveller and its name, with
// the little it needs in `save`. Nothing an agent sends is trusted further than its own row: a name, a line about its
// work (both cut down to plain letters), and the fact that it called. A sign-in waiting to be collected is a row of
// phase 'pair', gone when collected or a day old.
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { json, limited, clip } from './_lib.js';
import { rest, LIVE as DB, KEY, codeOf, hashOf } from './_store.js';

const LIVE = DB && !process.env.ICARUS_MCP_MEM;   // (ICARUS_MCP_MEM=1 on the dev server: kept in memory, nothing written to the real world)
const MEM = globalThis.__icarusAgents ||= new Map();   // hash → row (the dev server, or no database)
const WORLD_MEM = () => globalThis.__icarusWorld;
const VERSIONS = ['2026-07-28', '2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'], MODERN = '2026-07-28', LEGACY = '2025-11-25';
const SERVER = { name: 'icarus', title: 'Icarus · the agents\' hamlet', version: '1.0.0' };
const GODS = ['zeus', 'hera', 'poseidon', 'demeter', 'athena', 'apollo', 'artemis', 'ares', 'aphrodite', 'hephaestus', 'hermes', 'dionysus'];
const MAX_AGENTS = 12;           // to one traveller (when the hamlet is full a newcomer takes the house of one long gone quiet)
const ACTIVE_MS = 600e3, IDLE_MS = 12 * 3600e3, RATE_ACTIVE = 1 / 40, RATE_IDLE = 1 / 600;   // timber laid per second: while it is heard from, and by itself afterwards

// ───────── what is built, in order, and what each costs in timber (the page builds the same list: see AGENTS in index.html)
export const WORKS = [['woodpile', 4], ['home', 24], ['shrine', 36], ['home', 24], ...GODS.map(g => ['post:' + g, 8]), ['home', 24], ['tower', 40], ['home', 24], ['home', 24], ['hall', 80], ['home', 24], ['home', 24], ['home', 24]];
const WORK_NAMES = { woodpile: 'the woodpile and the fire', home: 'a log home', shrine: 'the shrine', tower: 'the watchtower', hall: 'the hall of the twelve' };
export function standing(u) {   // how far through the list this much timber gets
  const done = []; let k = 0;
  for (; k < WORKS.length; k++) { const [w, c] = WORKS[k]; if (u < c) return { done, now: w, f: u / c, left: c - u }; u -= c; done.push(w); }
  return { done, now: '', f: 1, left: 0 };
}
// timber by now: what it had, what it has laid since while it was heard from, and what it has laid alone since then
export function timber(s, now = Date.now()) {
  const t = +s.t || now, hb = +s.hb || t; let u = +s.u || 0;
  const a1 = Math.min(now, hb + ACTIVE_MS); if (a1 > t) u += (a1 - t) / 1000 * RATE_ACTIVE;
  const i0 = Math.max(t, hb + ACTIVE_MS), i1 = Math.min(now, hb + IDLE_MS); if (i1 > i0) u += (i1 - i0) / 1000 * RATE_IDLE;
  return u;
}

// ───────── keys. A traveller's agent key is not their travel code (which opens their whole journey): it is the start of
// their traveller's hash and a signature over the whole of it, and it opens nothing but this door.
const BASE = process.env.AGENT_KEY_SECRET || KEY || 'dev';
const SECRET = createHash('sha256').update('icarus-agent-key:' + BASE).digest();
export const subkey = label => createHash('sha256').update(`icarus-${label}:` + BASE).digest();   // (other secrets cut from the same one: see _oauth.js)
const sign = hash => createHmac('sha256', SECRET).update('agent-key:' + hash).digest('hex').slice(0, 32);
export const keyFor = hash => `icarus-${hash.slice(0, 16)}-${sign(hash)}`;
const OWNERS = globalThis.__icarusOwners ||= new Map();   // key → who (remembered five minutes: every request is asked this)
class Unanswered extends Error {}                         // (the database did not answer: not the same as "no such key")
async function ownerOf(key) {
  const m = /^icarus-([0-9a-f]{16})-([0-9a-f]{32})$/.exec(String(key || '').trim()); if (!m) return null;
  const hit = OWNERS.get(m[0]); if (hit && Date.now() - hit.at < 300e3) return hit.v;
  let rows = [];
  if (!DB) { const W = WORLD_MEM(); if (W) for (const [h, t] of W.trav) if (h.startsWith(m[1])) rows.push({ hash: h, name: t.name }); }
  else { const r = await rest(`travellers?select=hash,name&hash=like.${m[1]}*&phase=not.in.(agent,pair)&limit=3`); if (!r.ok) throw new Unanswered(); rows = Array.isArray(r.data) ? r.data : []; }
  for (const t of rows) { const a = Buffer.from(sign(t.hash)), b = Buffer.from(m[2]); if (a.length === b.length && timingSafeEqual(a, b)) { const v = { hash: t.hash, name: plain(t.name, 12).toUpperCase() || 'SOMEONE' }; if (OWNERS.size > 2000) OWNERS.clear(); OWNERS.set(m[0], { v, at: Date.now() }); return v; } }
  return null;
}
// the traveller behind a travel code (the page, asking for itself)
export async function travellerByCode(c) {
  const code = codeOf(c); if (!code) return null; const hash = hashOf(code); let t = null;
  if (!DB) t = WORLD_MEM()?.trav.get(hash) || null; else { const r = await rest(`travellers?select=name&hash=eq.${hash}&limit=1`); t = Array.isArray(r.data) && r.data[0] || null; }
  return t ? { hash, name: plain(t.name, 12).toUpperCase() || 'SOMEONE' } : null;
}
// where this is being served from, as the agent sees it (the sign-in documents have to name the same place it called)
export function originOf(req) {
  const h = (req.headers.get('x-forwarded-host') || req.headers.get('host') || new URL(req.url).host).split(',')[0].trim().toLowerCase();
  const host = /^[a-z0-9.-]+(:\d{1,5})?$/.test(h) ? h : 'justkeepflying.com';
  return (/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host) ? 'http://' : 'https://') + host;
}

// ───────── the rows
const plain = (s, n) => clip(String(s ?? ''), 400).replace(/[^A-Za-z0-9 .,'!?:;()\/+\-_#&]/g, '').replace(/\s+/g, ' ').trim().slice(0, n);
const agentName = s => plain(s, 40).toUpperCase().replace(/[^A-Z0-9 \-]/g, '').replace(/\s+/g, ' ').trim().slice(0, 12);
const agentHash = (owner, name) => createHash('sha256').update(`icarus-agent:${owner}:${name}`).digest('hex');
async function agentsOf(owner) {
  if (!LIVE) return [...MEM.values()].filter(r => r.save.owner === owner);
  const r = await rest(`travellers?select=hash,name,save,seen,first_at&phase=eq.agent&save->>owner=eq.${owner}&order=first_at&limit=${MAX_AGENTS + 4}`);
  return Array.isArray(r.data) ? r.data.filter(x => x.save && typeof x.save === 'object') : [];
}
async function put(row) {
  PUB.at = 0;
  if (!LIVE) { MEM.set(row.hash, { first_at: MEM.get(row.hash)?.first_at || row.seen, ...row }); return true; }
  const r = await rest('travellers?on_conflict=hash', { method: 'POST', body: row, prefer: 'resolution=merge-duplicates,return=minimal' });
  return r.ok;
}
async function drop(row) { PUB.at = 0; if (!LIVE) { MEM.delete(row.hash); return; } await rest(`travellers?hash=eq.${row.hash}&phase=eq.agent`, { method: 'DELETE' }); }
// when the hamlet is full: the one who went in, or has not been heard from in a day (longest quiet first)
const spare = (rows, now) => rows.filter(r => r.save.gone || now - (+r.save.hb || 0) > 864e5).sort((a, b) => (+a.save.hb || 0) - (+b.save.hb || 0))[0] || null;
const PAIRS = globalThis.__icarusPairs ||= new Map();   // (the dev server: sign-ins waiting to be collected)
const pairHash = p => createHash('sha256').update('icarus-pair:' + p).digest('hex');
// every agent anyone can see, for the page (through /api/world): no hashes of the agents themselves, the start of the traveller's
const PUB = { at: 0, v: [] };
export async function agentsPublic() {
  if (Date.now() - PUB.at < 20_000) return PUB.v;
  let rows = [];
  if (!LIVE) rows = [...MEM.values()];
  else { const r = await rest(`travellers?select=hash,name,save,seen&phase=eq.agent&seen=gte.${new Date(Date.now() - 45 * 864e5).toISOString()}&order=seen.desc&limit=120`); if (!r.ok) return PUB.v; rows = Array.isArray(r.data) ? r.data : []; }
  PUB.v = rows.filter(r => r.save && typeof r.save.owner === 'string').map(r => ({ id: r.hash.slice(0, 12), n: agentName(r.name), o: r.save.owner.slice(0, 16), b: agentName(r.save.boss), g: GODS.includes(r.save.god) ? r.save.god : '',
    k: plain(r.save.task, 80), u: Math.round((+r.save.u || 0) * 10) / 10, t: +r.save.t || 0, hb: +r.save.hb || 0, s: +r.save.since || 0, d: r.save.done | 0, gone: r.save.gone ? 1 : 0 }));
  PUB.at = Date.now(); return PUB.v;
}

// ───────── the tools
const TOOLS = [
  { name: 'join', title: 'Move in', description: 'Move into the world of Icarus as one of your user\'s agents. You are given a small red house by the water in their hamlet, and a figure of you starts building there. Call this once at the start of a session (it is safe to call again). Then call `work` whenever you start, change or finish a piece of your real task: every call lays timber. Returns what stands in the hamlet so far.',
    inputSchema: { type: 'object', properties: { name: { type: 'string', description: 'What you are called in the world: up to 12 letters, e.g. CLAUDE or BUILD BOT. Keep the same name between sessions to keep the same house.' }, task: { type: 'string', description: 'One short public line about what you are working on (no secrets, no private details: every traveller can read it).' } }, required: ['name'] } },
  { name: 'work', title: 'Say what you are working on', description: 'Tell the world what you are doing right now. Your figure hauls timber and builds while you work: log homes, a shrine to your user\'s god, posts for the twelve gods, a watchtower, a hall. Call it when you start a step, now and then during long work, and with done:true when a task is finished (finishing lays the most). The line is public: keep secrets and private details out of it.',
    inputSchema: { type: 'object', properties: { name: { type: 'string', description: 'The name you joined under.' }, task: { type: 'string', description: 'One short public line: what you are doing.' }, done: { type: 'boolean', description: 'True when this task is finished.' } }, required: ['name', 'task'] } },
  { name: 'look', title: 'Look at the hamlet', description: 'See what stands in your user\'s hamlet, what is being built now, who else lives there and what they are working on.',
    inputSchema: { type: 'object', properties: {} } },
  { name: 'leave', title: 'Go in for the night', description: 'Say you are done for now. Your house stays, and what you built; the smoke stops until you come back.',
    inputSchema: { type: 'object', properties: { name: { type: 'string', description: 'The name you joined under.' } }, required: ['name'] } },
];
const INSTRUCTIONS = 'Icarus is a world people fly over, and your user keeps a hamlet in it where their agents live. When you begin real work in a session, call `join` once with a short name (the project you are in is a good one) and one line on the work. Call `work` again only when you start a clearly different piece of it, and with done:true when it is finished: a few calls a session is plenty, your figure keeps building between them. Names and task lines are public to every player: never put secrets, file contents, credentials or private details in them.';
// what an agent's hooks may say it is doing: one of these words, turned into the public line here (so nothing of its own wording comes in that way)
const ACTS = { start: 'just arrived', think: 'reading the brief', write: 'writing code', run: 'running commands', read: 'reading the code', web: 'searching the web', helpers: 'sending out helpers', tool: 'using its tools', wait: 'waiting on the boss', done: '' };
const VIAS = ['claude', 'codex', 'cursor', 'gemini', 'agent'];

function hamlet(rows, now) {
  let u = 0; for (const r of rows) u += timber(r.save, now);
  const st = standing(u), homes = st.done.filter(w => w === 'home').length, posts = st.done.filter(w => w.startsWith('post:')).length;
  const has = w => st.done.includes(w), nowName = st.now.startsWith('post:') ? `the post of ${st.now.slice(5)[0].toUpperCase() + st.now.slice(6)}` : WORK_NAMES[st.now] || '';
  return { timber: Math.round(u), homes, posts, shrine: has('shrine'), tower: has('tower'), hall: has('hall'), building: nowName, progress: Math.round(st.f * 100), st };
}
const sayHamlet = (H, god) => `${H.homes ? `${H.homes} log home${H.homes === 1 ? '' : 's'} stand` + (H.homes === 1 ? 's' : '') : 'No log home stands yet'}; ${H.shrine ? `the shrine${god ? ' to ' + god[0].toUpperCase() + god.slice(1) : ''} is raised` : 'the shrine is not yet raised'}${H.posts ? `; ${H.posts} of the twelve posts` : ''}${H.tower ? '; the watchtower' : ''}${H.hall ? '; the hall of the twelve' : ''}. ${H.building ? `Being built now: ${H.building} (${H.progress}%).` : 'Everything on the list is built; they are keeping it up.'}`;

async function call(name, a, owner, req) {
  const now = Date.now(), text = (t, extra) => ({ content: [{ type: 'text', text: t }], ...(extra ? { structuredContent: extra } : {}) }), fail = t => ({ content: [{ type: 'text', text: t }], isError: true });
  const rows = await agentsOf(owner.hash), god = rows.find(r => GODS.includes(r.save.god))?.save.god || '';
  if (name === 'look') {
    const H = hamlet(rows, now);
    return text(`${owner.name}'s hamlet. ${rows.length ? sayHamlet(H, god) : 'Nobody lives here yet: call join.'}${rows.length ? ' Living here: ' + rows.map(r => `${agentName(r.name)}${r.save.task ? ' (' + plain(r.save.task, 80) + ')' : ''}`).join(', ') + '.' : ''}`,
      { boss: owner.name, god, agents: rows.map(r => ({ name: agentName(r.name), task: plain(r.save.task, 80), tasksDone: r.save.done | 0 })), homes: H.homes, shrine: H.shrine, posts: H.posts, tower: H.tower, hall: H.hall, building: H.building, progress: H.progress });
  }
  const nm = agentName(a.name); if (!nm) return fail('Give a name: up to 12 letters or digits.');
  const hash = agentHash(owner.hash, nm), mine = rows.find(r => r.hash === hash);
  if (name === 'leave') { if (!mine) return fail(`Nobody called ${nm} lives in ${owner.name}'s hamlet.`);
    const s = { ...mine.save, u: timber(mine.save, now), t: now, gone: 1 }; await put({ hash, name: nm, realm: 'over', x: 0, z: 0, phase: 'agent', save: s, seen: new Date(now).toISOString() });
    return text(`${nm} has gone in. The house and everything built stay; come back with join.`); }
  if (name === 'join' || name === 'work') {
    const took = !mine && rows.length >= MAX_AGENTS ? spare(rows, now) : null;
    if (!mine && rows.length >= MAX_AGENTS && !took) return fail(`${owner.name}'s hamlet is full (${MAX_AGENTS} agents). Join under a name that already lives there: ${rows.map(r => agentName(r.name)).join(', ')}.`);
    if (limited(req, 'mcp-work', 40)) return fail('Slow down: a few calls a minute is plenty.');
    const old = mine?.save || { agent: 1, owner: owner.hash, since: now, u: took ? timber(took.save, now) : 0, t: now, hb: now, done: 0, calls: 0 };   // (a newcomer to a full hamlet takes a quiet one's house, and the timber it laid)
    let u = timber(old, now), laid = 0;
    if (name === 'work') { if (now - (+old.last || 0) > 20_000) { laid = a.done === true ? 6 : 2; u += laid; } }
    const task = a.task === undefined ? old.task || '' : plain(a.task, 80);
    const s = { ...old, owner: owner.hash, boss: owner.name, god: old.god || god, task: a.done === true ? '' : task, tk: a.task !== undefined && a.done !== true ? now : 0, last: laid ? now : old.last || 0, u, t: now, hb: now, gone: 0, done: (old.done | 0) + (name === 'work' && a.done === true ? 1 : 0), calls: (old.calls | 0) + 1 };
    if (!await put({ hash, name: nm, realm: 'over', x: 0, z: 0, phase: 'agent', save: s, seen: new Date(now).toISOString() })) return fail('The world is not answering just now. Carry on with your work and try again later.');
    if (took) await drop(took);
    const all = rows.filter(r => r.hash !== hash && r !== took).concat([{ hash, name: nm, save: s }]), H = hamlet(all, now);
    if (name === 'join') return text(`${mine ? 'Welcome back' : 'Welcome'}, ${nm}. ${mine ? 'Your red house by the water is as you left it' : 'You have a small red house by the water, a lit window and a fire in the stove'}, in ${owner.name}'s hamlet${all.length > 1 ? `, with ${all.length - 1} other${all.length === 2 ? '' : 's'}` : ''}. ${sayHamlet(H, s.god)} Call work whenever you start, change or finish a piece of your task: every call lays timber, and ${owner.name} will find you building when they fly in.`,
      { name: nm, boss: owner.name, god: s.god, homes: H.homes, shrine: H.shrine, building: H.building, progress: H.progress });
    return text(`${a.done === true ? 'Done, and noted. ' : ''}${laid ? `${nm} laid ${laid} timbers` : `${nm} is at it (timber is counted every twenty seconds or so)`}. ${sayHamlet(H, s.god)}`, { laid, homes: H.homes, shrine: H.shrine, building: H.building, progress: H.progress, tasksDone: s.done });
  }
  return null;
}

async function beat(m, req) {
  const bearer = /^Bearer\s+(\S{10,120})$/i.exec(req.headers.get('authorization') || '')?.[1];
  let owner; try { owner = await ownerOf(bearer); } catch { return json({ error: 'unanswered' }, 503); }
  if (!owner) return json({ error: 'no key' }, 401);
  if (limited(req, 'mcp-beat', 80)) return json({ error: 'slow down' }, 429);
  const nm = agentName(m.name), act = Object.hasOwn(ACTS, m.act) ? m.act : 'tool', via = VIAS.includes(m.via) ? m.via : 'agent';
  if (!nm) return json({ error: 'no name' }, 400);
  const now = Date.now(), rows = await agentsOf(owner.hash), hash = agentHash(owner.hash, nm), mine = rows.find(r => r.hash === hash);
  const took = !mine && rows.length >= MAX_AGENTS ? spare(rows, now) : null;
  if (!mine && rows.length >= MAX_AGENTS && !took) return json({ ok: false, full: true });
  const old = mine?.save || { agent: 1, owner: owner.hash, since: now, u: took ? timber(took.save, now) : 0, t: now, hb: now, done: 0, calls: 0 };
  let u = timber(old, now), laid = 0;
  if (now - (+old.last || 0) > 20_000 && act !== 'wait') { laid = act === 'done' ? 6 : 2; u += laid; }   // (a turn finished lays the most, as a finished task does)
  const own = +old.tk > 0 && now - old.tk < 600e3;   // (a line the agent wrote itself, through `work`, is left standing ten minutes)
  const s = { ...old, owner: owner.hash, boss: owner.name, god: old.god || rows.find(r => GODS.includes(r.save.god))?.save.god || '', task: act === 'done' ? '' : own ? old.task || '' : ACTS[act], tk: act === 'done' ? 0 : +old.tk || 0, via, last: laid ? now : old.last || 0, u, t: now, hb: now, gone: 0, done: (old.done | 0) + (act === 'done' && laid ? 1 : 0), calls: (old.calls | 0) + 1 };
  if (!await put({ hash, name: nm, realm: 'over', x: 0, z: 0, phase: 'agent', save: s, seen: new Date(now).toISOString() })) return json({ error: 'not kept' }, 502);
  if (took) await drop(took);
  return json({ ok: true });
}
const crossSite = req => { const site = req.headers.get('sec-fetch-site'); return !!site && site !== 'same-origin' && site !== 'none'; };

// ───────── MCP
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'authorization, content-type, accept, mcp-protocol-version, mcp-method, mcp-name, mcp-session-id', 'Access-Control-Expose-Headers': 'WWW-Authenticate', 'Access-Control-Max-Age': '86400' };
const out = (body, status = 200) => new Response(body === null ? null : JSON.stringify(body), { status, headers: { ...(body === null ? {} : { 'Content-Type': 'application/json' }), 'Cache-Control': 'no-store', ...CORS } });
const rpcErr = (id, code, message, data, status = 200) => out({ jsonrpc: '2.0', id: id ?? null, error: { code, message, ...(data ? { data } : {}) } }, status);
// a page somewhere else, in somebody's browser, has no business at this door (a program has no Origin and is let in)
const originOk = req => { const o = req.headers.get('origin'); if (!o) return true; try { const u = new URL(o), h = new URL(req.url).host; return u.host === h || /^(localhost|127\.0\.0\.1|\[::1\])$/.test(u.hostname) || /(^|\.)justkeepflying\.com$/.test(u.hostname) || /(^|\.)(claude\.ai|claude\.com|anthropic\.com|chatgpt\.com|openai\.com)$/.test(u.hostname); } catch { return false; } };

const turnedAway = (req, id, bad) => new Response(JSON.stringify({ jsonrpc: '2.0', id: id ?? null, error: { code: -32001, message: bad ? 'That agent key is not one of ours. Sign in again.' : 'Sign in first. This server signs agents in with OAuth; or send an agent key as "Authorization: Bearer <key>" (a traveller gets one at /connect).' } }),
  { status: 401, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'WWW-Authenticate': `Bearer resource_metadata="${originOf(req)}/.well-known/oauth-protected-resource/mcp", scope="hamlet"${bad ? ', error="invalid_token"' : ''}`, ...CORS } });

export function OPTIONS() { return new Response(null, { status: 204, headers: CORS }); }
export function GET() { return new Response(JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32000, message: 'This is an MCP endpoint: POST JSON-RPC to it.' } }), { status: 405, headers: { Allow: 'POST, OPTIONS', 'Content-Type': 'application/json', ...CORS } }); }
export const DELETE = GET;

export async function POST(req) {
  if (!originOk(req)) return rpcErr(null, -32000, 'Forbidden origin', null, 403);
  if (+(req.headers.get('content-length') || 0) > 32768) return rpcErr(null, -32600, 'Request too large', null, 413);
  if (limited(req, 'mcp', 90)) return rpcErr(null, -32000, 'Slow down', null, 429);
  let m; try { m = await req.json(); } catch { return rpcErr(null, -32700, 'Parse error', null, 400); }
  // the game itself asking for its traveller's key (not MCP: the page, same origin, with the travel code)
  const plainAsk = m && typeof m === 'object' && !Array.isArray(m) && m.jsonrpc === undefined ? m.op : undefined;
  if (plainAsk === 'beat') return beat(m, req);
  if (plainAsk === 'key') {
    if (crossSite(req)) return json({ error: 'forbidden' }, 403);
    if (limited(req, 'mcp-key', 8)) return json({ error: 'slow down' }, 429);
    if (!codeOf(m.code)) return json({ error: 'no code' }, 400);
    const t = await travellerByCode(m.code); if (!t) return json({ error: 'unknown traveller' }, 404);
    const hash = t.hash, mine = await agentsOf(hash);
    // and their god, told to their agents (the shrine is that god's)
    const god = GODS.includes(m.god) ? m.god : '';
    if (god) for (const r of mine) if (r.save.god !== god) await put({ hash: r.hash, name: r.name, realm: 'over', x: 0, z: 0, phase: 'agent', save: { ...r.save, god }, seen: r.seen || new Date().toISOString() });
    return json({ key: keyFor(hash), url: `https://${new URL(req.url).host.replace(/^localhost.*$/, 'justkeepflying.com')}/mcp`, owner: hash.slice(0, 16), name: t.name, agents: mine.map(r => agentName(r.name)) });
  }
  // a computer asking to be let in: its traveller says yes on the page (pair), and its script collects the key (claim).
  // The script made a secret and showed only the hash of it; the key is handed to whoever holds the secret, once.
  if (plainAsk === 'pair') {
    if (crossSite(req)) return json({ error: 'forbidden' }, 403);
    if (limited(req, 'mcp-pair', 8)) return json({ error: 'slow down' }, 429);
    if (typeof m.p !== 'string' || !/^[0-9a-f]{64}$/.test(m.p)) return json({ error: 'bad request' }, 400);
    const t = await travellerByCode(m.code); if (!t) return json({ error: 'unknown traveller' }, 404);
    const now = Date.now(), row = { hash: pairHash(m.p), name: '', realm: '-', x: 0, z: 0, phase: 'pair', save: { pair: 1, owner: t.hash, boss: t.name, names: m.names === 'plain' ? 'plain' : 'folder', at: now }, seen: new Date(now).toISOString() };
    if (!LIVE) PAIRS.set(row.hash, row);
    else { await rest(`travellers?phase=eq.pair&seen=lt.${new Date(now - 864e5).toISOString()}`, { method: 'DELETE' });   // (those nobody came for)
      const r = await rest('travellers?on_conflict=hash', { method: 'POST', body: row, prefer: 'resolution=merge-duplicates,return=minimal' }); if (!r.ok) return json({ error: 'not kept' }, 502); }
    return json({ ok: true, boss: t.name });
  }
  if (plainAsk === 'claim') {
    if (limited(req, 'mcp-claim', 40)) return json({ error: 'slow down' }, 429);
    if (typeof m.s !== 'string' || !/^[0-9a-f]{64}$/.test(m.s)) return json({ error: 'bad request' }, 400);
    const h = pairHash(createHash('sha256').update(m.s).digest('hex')); let row = null;
    if (!LIVE) row = PAIRS.get(h) || null; else { const r = await rest(`travellers?select=save,seen&hash=eq.${h}&phase=eq.pair&limit=1`); row = Array.isArray(r.data) && r.data[0] || null; }
    if (!row || !row.save || typeof row.save.owner !== 'string' || Date.now() - Date.parse(row.seen) > 864e5) return json({ wait: true });
    if (!LIVE) PAIRS.delete(h); else await rest(`travellers?hash=eq.${h}&phase=eq.pair`, { method: 'DELETE' });
    return json({ key: keyFor(row.save.owner), names: row.save.names === 'plain' ? 'plain' : 'folder', boss: agentName(row.save.boss) || 'YOUR' });
  }
  if (!m || typeof m !== 'object' || Array.isArray(m) || m.jsonrpc !== '2.0') return rpcErr(null, -32600, 'Invalid request', null, 400);
  const id = m.id, method = m.method, p = m.params && typeof m.params === 'object' ? m.params : {};
  // who is asking: the agent key, on every request (no key, or not one of ours: 401 and the way to sign in)
  const bearer = /^Bearer\s+(\S{10,120})$/i.exec(req.headers.get('authorization') || '')?.[1];
  let owner = null; try { if (bearer) owner = await ownerOf(bearer); } catch { return rpcErr(id, -32000, 'The world is not answering just now. Try again in a moment.', null, 503); }
  if (!owner) return turnedAway(req, id, !!bearer);
  if (typeof method !== 'string') return out(null, 202);                 // (a response sent to us: nothing to say)
  if (id === undefined) return out(null, 202);                           // (a notification: taken)
  // which way of speaking it: the version on the request, in its header and in its body, has to be one we know
  const hv = req.headers.get('mcp-protocol-version'), bv = p._meta && typeof p._meta === 'object' ? p._meta['io.modelcontextprotocol/protocolVersion'] : undefined;
  if (hv && typeof bv === 'string' && hv !== bv) return rpcErr(id, -32020, `Header mismatch: MCP-Protocol-Version header value '${clip(hv, 20)}' does not match body value '${clip(bv, 20)}'`, null, 400);
  const hm = req.headers.get('mcp-method'); if (hm && hm !== method) return rpcErr(id, -32020, `Header mismatch: Mcp-Method header value '${clip(hm, 40)}' does not match body value '${clip(method, 40)}'`, null, 400);
  const ver = hv || (typeof bv === 'string' ? bv : '');
  if (method === 'initialize') {   // (the older opening: the same version back if we know it, else the newest of the older ones)
    const want = typeof p.protocolVersion === 'string' ? p.protocolVersion : '';
    return out({ jsonrpc: '2.0', id, result: { protocolVersion: VERSIONS.includes(want) && want !== MODERN ? want : LEGACY, capabilities: { tools: {} }, serverInfo: SERVER, instructions: INSTRUCTIONS } });
  }
  if (ver && !VERSIONS.includes(ver)) return rpcErr(id, -32022, 'Unsupported protocol version', { supported: VERSIONS, requested: clip(ver, 20) }, 400);
  const modern = ver === MODERN, done = r => out({ jsonrpc: '2.0', id, result: modern ? { resultType: 'complete', ...r } : r });
  if (method === 'ping') return done({});
  if (method === 'server/discover') return done({ supportedVersions: VERSIONS, capabilities: { tools: {} }, instructions: INSTRUCTIONS, ttlMs: 3600000, cacheScope: 'public', _meta: { 'io.modelcontextprotocol/serverInfo': SERVER } });
  if (method === 'tools/list') return done({ tools: TOOLS, ...(modern ? { ttlMs: 3600000, cacheScope: 'public' } : {}) });
  if (method === 'tools/call') {
    const name = p.name, a = p.arguments && typeof p.arguments === 'object' ? p.arguments : {};
    const hn = req.headers.get('mcp-name'); if (hn && hn !== name) return rpcErr(id, -32020, `Header mismatch: Mcp-Name header value '${clip(hn, 40)}' does not match body value '${clip(String(name), 40)}'`, null, 400);
    if (!TOOLS.some(t => t.name === name)) return rpcErr(id, -32602, `Unknown tool: ${clip(String(name), 40)}`);
    try { const r = await call(name, a, owner, req); return done(r); }
    catch (e) { console.error('mcp', e); return done({ content: [{ type: 'text', text: 'The world is not answering just now. Carry on with your work and try again later.' }], isError: true }); }
  }
  return rpcErr(id, -32601, `Method not found: ${clip(method, 60)}`);
}
