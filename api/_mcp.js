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
// What is kept: one row per agent in `travellers` (phase 'agent'), keyed by a hash of its traveller and its name, with
// the little it needs in `save`. Nothing an agent sends is trusted further than its own row: a name, a line about its
// work (both cut down to plain letters), and the fact that it called.
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { json, limited, clip } from './_lib.js';
import { rest, LIVE as DB, KEY, codeOf, hashOf } from './_store.js';

const LIVE = DB && !process.env.ICARUS_MCP_MEM;   // (ICARUS_MCP_MEM=1 on the dev server: kept in memory, nothing written to the real world)
const MEM = globalThis.__icarusAgents ||= new Map();   // hash → row (the dev server, or no database)
const WORLD_MEM = () => globalThis.__icarusWorld;
const VERSIONS = ['2026-07-28', '2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'], MODERN = '2026-07-28', LEGACY = '2025-11-25';
const SERVER = { name: 'icarus', title: 'Icarus · the agents\' hamlet', version: '1.0.0' };
const GODS = ['zeus', 'hera', 'poseidon', 'demeter', 'athena', 'apollo', 'artemis', 'ares', 'aphrodite', 'hephaestus', 'hermes', 'dionysus'];
const MAX_AGENTS = 8;            // to one traveller
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
const SECRET = createHash('sha256').update('icarus-agent-key:' + (process.env.AGENT_KEY_SECRET || KEY || 'dev')).digest();
const sign = hash => createHmac('sha256', SECRET).update('agent-key:' + hash).digest('hex').slice(0, 32);
export const keyFor = hash => `icarus-${hash.slice(0, 16)}-${sign(hash)}`;
async function ownerOf(key) {
  const m = /^icarus-([0-9a-f]{16})-([0-9a-f]{32})$/.exec(String(key || '').trim()); if (!m) return null;
  let rows = [];
  if (!DB) { const W = WORLD_MEM(); if (W) for (const [h, t] of W.trav) if (h.startsWith(m[1])) rows.push({ hash: h, name: t.name }); }
  else { const r = await rest(`travellers?select=hash,name&hash=like.${m[1]}*&phase=neq.agent&limit=3`); rows = Array.isArray(r.data) ? r.data : []; }
  for (const t of rows) { const a = Buffer.from(sign(t.hash)), b = Buffer.from(m[2]); if (a.length === b.length && timingSafeEqual(a, b)) return { hash: t.hash, name: plain(t.name, 12).toUpperCase() || 'SOMEONE' }; }
  return null;
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
    inputSchema: { type: 'object', properties: { name: { type: 'string', description: 'What you are called in the world: up to 12 letters, e.g. CLAUDE or BUILD BOT. Keep the same name between sessions to keep the same house.' }, task: { type: 'string', description: 'One short public line about what you are working on (no secrets, no private details: every traveller can read it).' }, key: { type: 'string', description: 'The agent key, only if it was not sent as the Authorization header.' } }, required: ['name'] } },
  { name: 'work', title: 'Say what you are working on', description: 'Tell the world what you are doing right now. Your figure hauls timber and builds while you work: log homes, a shrine to your user\'s god, posts for the twelve gods, a watchtower, a hall. Call it when you start a step, now and then during long work, and with done:true when a task is finished (finishing lays the most). The line is public: keep secrets and private details out of it.',
    inputSchema: { type: 'object', properties: { name: { type: 'string', description: 'The name you joined under.' }, task: { type: 'string', description: 'One short public line: what you are doing.' }, done: { type: 'boolean', description: 'True when this task is finished.' }, key: { type: 'string', description: 'The agent key, only if it was not sent as the Authorization header.' } }, required: ['name', 'task'] } },
  { name: 'look', title: 'Look at the hamlet', description: 'See what stands in your user\'s hamlet, what is being built now, who else lives there and what they are working on.',
    inputSchema: { type: 'object', properties: { key: { type: 'string', description: 'The agent key, only if it was not sent as the Authorization header.' } } } },
  { name: 'leave', title: 'Go in for the night', description: 'Say you are done for now. Your house stays, and what you built; the smoke stops until you come back.',
    inputSchema: { type: 'object', properties: { name: { type: 'string', description: 'The name you joined under.' }, key: { type: 'string', description: 'The agent key, only if it was not sent as the Authorization header.' } }, required: ['name'] } },
];
const INSTRUCTIONS = 'Icarus is a world people fly over. Your user has a hamlet in it where their agents live. Call `join` once with a short name and what you are working on; then call `work` with one short public line whenever you start, change or finish a piece of your real task. Each call makes your figure in the world build: log homes, a shrine to your user\'s god, and more. Never put secrets, file contents, credentials or private details in a name or a task line: every traveller can read them. If no key was configured, ask your user for their agent key (they get it in the game with /hamlet key).';

function hamlet(rows, now) {
  let u = 0; for (const r of rows) u += timber(r.save, now);
  const st = standing(u), homes = st.done.filter(w => w === 'home').length, posts = st.done.filter(w => w.startsWith('post:')).length;
  const has = w => st.done.includes(w), nowName = st.now.startsWith('post:') ? `the post of ${st.now.slice(5)[0].toUpperCase() + st.now.slice(6)}` : WORK_NAMES[st.now] || '';
  return { timber: Math.round(u), homes, posts, shrine: has('shrine'), tower: has('tower'), hall: has('hall'), building: nowName, progress: Math.round(st.f * 100), st };
}
const sayHamlet = (H, god) => `${H.homes ? `${H.homes} log home${H.homes === 1 ? '' : 's'} stand` + (H.homes === 1 ? 's' : '') : 'No log home stands yet'}; ${H.shrine ? `the shrine${god ? ' to ' + god[0].toUpperCase() + god.slice(1) : ''} is raised` : 'the shrine is not yet raised'}${H.posts ? `; ${H.posts} of the twelve posts` : ''}${H.tower ? '; the watchtower' : ''}${H.hall ? '; the hall of the twelve' : ''}. ${H.building ? `Being built now: ${H.building} (${H.progress}%).` : 'Everything on the list is built; they are keeping it up.'}`;

async function call(name, a, owner, req) {
  const now = Date.now(), text = (t, extra) => ({ content: [{ type: 'text', text: t }], ...(extra ? { structuredContent: extra } : {}) }), fail = t => ({ content: [{ type: 'text', text: t }], isError: true });
  if (!owner) return fail('No agent key. Ask your user for their agent key (in the game: /hamlet key) and send it as the Authorization header ("Bearer <key>") or as the `key` argument.');
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
    if (!mine && rows.length >= MAX_AGENTS) return fail(`${owner.name}'s hamlet is full (${MAX_AGENTS} agents). Join under a name that already lives there: ${rows.map(r => agentName(r.name)).join(', ')}.`);
    if (limited(req, 'mcp-work', 40)) return fail('Slow down: a few calls a minute is plenty.');
    const old = mine?.save || { agent: 1, owner: owner.hash, since: now, u: 0, t: now, hb: now, done: 0, calls: 0 };
    let u = timber(old, now), laid = 0;
    if (name === 'work') { if (now - (+old.last || 0) > 20_000) { laid = a.done === true ? 6 : 2; u += laid; } }
    const task = a.task === undefined ? old.task || '' : plain(a.task, 80);
    const s = { ...old, owner: owner.hash, boss: owner.name, god: old.god || god, task: a.done === true ? '' : task, last: laid ? now : old.last || 0, u, t: now, hb: now, gone: 0, done: (old.done | 0) + (name === 'work' && a.done === true ? 1 : 0), calls: (old.calls | 0) + 1 };
    if (!await put({ hash, name: nm, realm: 'over', x: 0, z: 0, phase: 'agent', save: s, seen: new Date(now).toISOString() })) return fail('The world is not answering just now. Carry on with your work and try again later.');
    const all = rows.filter(r => r.hash !== hash).concat([{ hash, name: nm, save: s }]), H = hamlet(all, now);
    if (name === 'join') return text(`${mine ? 'Welcome back' : 'Welcome'}, ${nm}. ${mine ? 'Your red house by the water is as you left it' : 'You have a small red house by the water, a lit window and a fire in the stove'}, in ${owner.name}'s hamlet${all.length > 1 ? `, with ${all.length - 1} other${all.length === 2 ? '' : 's'}` : ''}. ${sayHamlet(H, s.god)} Call work whenever you start, change or finish a piece of your task: every call lays timber, and ${owner.name} will find you building when they fly in.`,
      { name: nm, boss: owner.name, god: s.god, homes: H.homes, shrine: H.shrine, building: H.building, progress: H.progress });
    return text(`${a.done === true ? 'Done, and noted. ' : ''}${laid ? `${nm} laid ${laid} timbers` : `${nm} is at it (timber is counted every twenty seconds or so)`}. ${sayHamlet(H, s.god)}`, { laid, homes: H.homes, shrine: H.shrine, building: H.building, progress: H.progress, tasksDone: s.done });
  }
  return null;
}

// ───────── MCP
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'authorization, content-type, accept, mcp-protocol-version, mcp-method, mcp-name, mcp-session-id', 'Access-Control-Max-Age': '86400' };
const out = (body, status = 200) => new Response(body === null ? null : JSON.stringify(body), { status, headers: { ...(body === null ? {} : { 'Content-Type': 'application/json' }), 'Cache-Control': 'no-store', ...CORS } });
const rpcErr = (id, code, message, data, status = 200) => out({ jsonrpc: '2.0', id: id ?? null, error: { code, message, ...(data ? { data } : {}) } }, status);
// a page somewhere else, in somebody's browser, has no business at this door (a program has no Origin and is let in)
const originOk = req => { const o = req.headers.get('origin'); if (!o) return true; try { const u = new URL(o), h = new URL(req.url).host; return u.host === h || /^(localhost|127\.0\.0\.1|\[::1\])$/.test(u.hostname) || /(^|\.)justkeepflying\.com$/.test(u.hostname) || /(^|\.)(claude\.ai|anthropic\.com)$/.test(u.hostname); } catch { return false; } };

export function OPTIONS() { return new Response(null, { status: 204, headers: CORS }); }
export function GET() { return new Response(JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32000, message: 'This is an MCP endpoint: POST JSON-RPC to it.' } }), { status: 405, headers: { Allow: 'POST, OPTIONS', 'Content-Type': 'application/json', ...CORS } }); }
export const DELETE = GET;

export async function POST(req) {
  if (!originOk(req)) return rpcErr(null, -32000, 'Forbidden origin', null, 403);
  if (+(req.headers.get('content-length') || 0) > 32768) return rpcErr(null, -32600, 'Request too large', null, 413);
  if (limited(req, 'mcp', 90)) return rpcErr(null, -32000, 'Slow down', null, 429);
  let m; try { m = await req.json(); } catch { return rpcErr(null, -32700, 'Parse error', null, 400); }
  // the game itself asking for its traveller's key (not MCP: the page, same origin, with the travel code)
  if (m && typeof m === 'object' && !Array.isArray(m) && m.op === 'key' && m.jsonrpc === undefined) {
    const site = req.headers.get('sec-fetch-site'); if (site && site !== 'same-origin' && site !== 'none') return json({ error: 'forbidden' }, 403);
    if (limited(req, 'mcp-key', 8)) return json({ error: 'slow down' }, 429);
    const code = codeOf(m.code); if (!code) return json({ error: 'no code' }, 400);
    const hash = hashOf(code); let t = null;
    if (!DB) t = WORLD_MEM()?.trav.get(hash) || null; else { const r = await rest(`travellers?select=name&hash=eq.${hash}&limit=1`); t = Array.isArray(r.data) && r.data[0] || null; }
    if (!t) return json({ error: 'unknown traveller' }, 404);
    // and their god, told to their agents (the shrine is that god's)
    const god = GODS.includes(m.god) ? m.god : '';
    if (god) for (const r of await agentsOf(hash)) if (r.save.god !== god) await put({ hash: r.hash, name: r.name, realm: 'over', x: 0, z: 0, phase: 'agent', save: { ...r.save, god }, seen: r.seen || new Date().toISOString() });
    return json({ key: keyFor(hash), url: `https://${new URL(req.url).host.replace(/^localhost.*$/, 'justkeepflying.com')}/mcp`, owner: hash.slice(0, 16) });
  }
  if (!m || typeof m !== 'object' || Array.isArray(m) || m.jsonrpc !== '2.0') return rpcErr(null, -32600, 'Invalid request', null, 400);
  const id = m.id, method = m.method, p = m.params && typeof m.params === 'object' ? m.params : {};
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
    const bearer = /^Bearer\s+(\S{10,120})$/i.exec(req.headers.get('authorization') || '')?.[1];
    try { const owner = await ownerOf(bearer || a.key), r = await call(name, a, owner, req); return done(r); }
    catch (e) { console.error('mcp', e); return done({ content: [{ type: 'text', text: 'The world is not answering just now. Carry on with your work and try again later.' }], isError: true }); }
  }
  return rpcErr(id, -32601, `Method not found: ${clip(method, 60)}`);
}
