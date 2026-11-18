// What a world needs to show its owner's agents: connect, and a picture of everything the hub knows is kept current
// for you; listen for events to animate; call the owner's controls. No drawing in here — that is the world's own — and
// nothing but fetch underneath, so it runs in a page, a worker, or Node.
//
//   const world = connect({ hub: 'http://localhost:4747', key: ownerKey });
//   world.on('act', e => …);  world.state.agents;  world.approve();
import { LIMITS } from './protocol.js';

// read a server-sent-event stream off a fetch response (EventSource cannot carry the key in a header)
async function* events(res) {
  const reader = res.body.getReader(), dec = new TextDecoder();
  let buf = '';
  for (;;) {
    const { value, done } = await reader.read(); if (done) return;
    buf += dec.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf('\n\n')) >= 0) {
      const block = buf.slice(0, i); buf = buf.slice(i + 2);
      let type = 'message', data = '';
      for (const line of block.split('\n')) { if (line.startsWith('event:')) type = line.slice(6).trim(); else if (line.startsWith('data:')) data += line.slice(5).trim(); }
      if (data) { try { yield { type, data: JSON.parse(data) }; } catch {} }
    }
  }
}

const siteIn = s => ({ ...s, branches: new Map((s.branches || []).map(b => [b.name, { ...b, files: new Map((b.files || []).map(f => [f.path, f])) }])) });

export function connect({ hub, key, name = '', fetch: f = (...a) => globalThis.fetch(...a), retry = true } = {}) {
  hub = String(hub || '').replace(/\/+$/, '');
  const state = { connected: false, error: '', owner: null, agents: new Map(), sites: new Map(), approvals: new Map(), personas: new Map(), shared: 0, feed: [], runners: [], seq: 0 };
  const subs = new Map();   // type → Set(fn)
  let closed = false, ctl = null, tries = 0, readyOk, readyNo;
  const ready = new Promise((a, b) => { readyOk = a; readyNo = b; }); ready.catch(() => {});
  const fire = (type, ev) => { for (const t of [type, '*']) for (const fn of subs.get(t) || []) { try { fn(ev, state); } catch (e) { console.error('daimon listener', e); } } };
  const H = extra => ({ Authorization: `Bearer ${key}`, ...extra });

  function apply(type, ev) {
    state.seq = ev.seq || state.seq;
    switch (type) {
      case 'hello':
        state.owner = ev.owner; state.shared = ev.shared || 0; state.runners = ev.runners || []; state.feed = ev.feed || [];
        state.agents = new Map(ev.agents.map(a => [a.id, a])); state.sites = new Map(ev.sites.map(s => [s.id, siteIn(s)]));
        state.approvals = new Map(ev.approvals.map(a => [a.id, a])); state.personas = new Map((ev.personas || []).map(p => [p.name, p]));
        break;
      case 'agent': state.agents.set(ev.agent.id, ev.agent); break;
      case 'gone': state.agents.delete(ev.agentId); break;
      case 'site':
        if (ev.site) state.sites.set(ev.site.id, siteIn(ev.site));
        else if (ev.gone) state.sites.delete(ev.gone);
        else if (ev.delta) { const d = ev.delta; let s = state.sites.get(d.id);
          if (!s) { s = { id: d.id, repo: d.repo, main: d.main, firstAt: ev.t, lastAt: ev.t, ok: 0, fail: 0, commits: 0, branches: new Map() }; state.sites.set(d.id, s); }
          s.main = d.main; s.lastAt = ev.t;
          let b = s.branches.get(d.branch); if (!b) { b = { name: d.branch, from: d.from, commits: 0, firstAt: ev.t, lastAt: ev.t, run: null, files: new Map() }; s.branches.set(d.branch, b); }
          b.lastAt = ev.t; b.from = d.from;
          if (d.dropped) b.files.delete(d.dropped);
          if (d.file) b.files.set(d.file.path, d.file);
          if (d.commits != null) { s.commits += Math.max(0, d.commits - b.commits); b.commits = d.commits; }
          if (d.run) { b.run = d.run; if (d.run.ok) s.ok++; else s.fail++; } }
        break;
      case 'approval': if (ev.approval.status === 'pending') state.approvals.set(ev.approval.id, ev.approval); else state.approvals.delete(ev.approval.id); break;
      case 'owner': if (ev.owner) state.owner = ev.owner; if (ev.personas) state.personas = new Map(ev.personas.map(p => [p.name, p])); if (ev.shared != null) state.shared = ev.shared; break;
      case 'runner': state.runners = ev.runners || []; break;
      default: state.feed.push(ev); if (state.feed.length > LIMITS.feed) state.feed.shift();
    }
  }

  async function run() {
    while (!closed) {
      try {
        ctl = new AbortController();
        const c = await f(`${hub}/v1/owner/claim`, { method: 'POST', headers: H({ 'Content-Type': 'application/json' }), body: JSON.stringify({ name }), signal: ctl.signal });
        if (!c.ok) { const j = await c.json().catch(() => ({})); throw Object.assign(new Error(j.error || `the hub said ${c.status}`), { fatal: [400, 401, 403, 404].includes(c.status) }); }
        const res = await f(`${hub}/v1/stream`, { headers: H({ Accept: 'text/event-stream' }), signal: ctl.signal });
        if (!res.ok || !res.body) throw new Error(`the hub said ${res.status}`);
        for await (const { type, data } of events(res)) {
          apply(type, data);
          if (type === 'hello') { state.connected = true; state.error = ''; tries = 0; readyOk(state); fire('connect', data); }
          fire(type, data);
        }
        throw new Error('the hub went quiet');
      } catch (e) {
        if (closed) break;
        const was = state.connected; state.connected = false; state.error = e.message || String(e);
        if (was || tries === 0) fire('disconnect', { error: state.error });
        if (e.fatal || !retry) { readyNo(e); break; }
        await new Promise(r => setTimeout(r, Math.min(15000, 800 * 2 ** Math.min(tries++, 5))));
      }
    }
  }
  run();

  async function call(path, body, method = 'POST') {
    const r = await f(hub + path, { method, headers: H(body ? { 'Content-Type': 'application/json' } : {}), body: body ? JSON.stringify(body) : undefined });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw Object.assign(new Error(j.error || `the hub said ${r.status}`), { status: r.status });
    return j;
  }
  const act = (op, body = {}) => call('/v1/act', { op, ...body });
  const pending = () => [...state.approvals.values()].sort((a, b) => a.at - b.at);
  const flat = s => String(s).toUpperCase().replace(/[^A-Z0-9]/g, '');
  function agentBy(ref) {
    ref = String(ref || '').trim().replace(/^@/, ''); if (!ref) return null; if (state.agents.has(ref)) return state.agents.get(ref);
    const all = [...state.agents.values()], k = flat(ref);
    return all.find(a => flat(a.name) === k) || all.find(a => flat(a.name).startsWith(k)) || null;
  }

  return {
    hub, state, ready, pending, agentBy,
    on(type, fn) { if (!subs.has(type)) subs.set(type, new Set()); subs.get(type).add(fn); return () => subs.get(type).delete(fn); },
    close() { closed = true; state.connected = false; try { ctl?.abort(); } catch {} },
    // the owner's controls
    approve: (id, answer) => act('approve', { id, answer }),
    deny: (id, answer) => act('deny', { id, answer }),
    prompt: (agent, text) => act('prompt', { agent, text }),
    boost: (agent, minutes = 10) => act('boost', { agent, minutes }),
    link: (from, to) => act('link', { from, to }),
    spawn: (task, name) => act('spawn', { task, name }),
    stop: agent => act('stop', { agent }),
    dismiss: agent => act('dismiss', { agent }),
    rename: (agent, n) => act('rename', { agent, name: n }),
    settings: patch => act('settings', patch),
    mint: label => call('/v1/tokens', { label }),
    tokens: () => call('/v1/tokens', null, 'GET'),
    revoke: id => call('/v1/tokens', { id }, 'DELETE'),
    detail: agent => call(`/v1/agents/${encodeURIComponent(agent)}`, null, 'GET'),
    notes: (persona = '') => call(`/v1/notes?persona=${encodeURIComponent(persona)}`, null, 'GET'),
  };
}

// An owner key for someone who has none yet: random, kept by whoever calls this.
export function newKey() { const b = new Uint8Array(24); globalThis.crypto.getRandomValues(b); return 'own_' + [...b].map(x => x.toString(16).padStart(2, '0')).join(''); }
// An owner key out of an account the world already has (a player id, a save code): the same account is the same owner
// on every device, and the hub never sees the account's own secret.
export async function keyFrom(secret, world = 'world') {
  const d = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(`daimon:${world}:${secret}`));
  return 'own_' + [...new Uint8Array(d)].map(x => x.toString(16).padStart(2, '0')).join('').slice(0, 48);
}
