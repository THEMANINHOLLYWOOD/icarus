// THE CROSSING, the page's side: the one file both games load (Icarus: /crossover/x.js, BURNING STUDIO MUSIC: /js/x.js).
// The source of truth is "icaurs x brn music/crossover/x.js"; tools/sync.sh copies it into both games. Edit it there.
//
// What it does for a page:
//   const X = new Crossing({ home: 'icarus', world: 'icarus' });   // home: where this player belongs; world: this page
//   X.me({ n, lk, f, pe, pl })        who I am, where (call whenever it changes; it's sent at most twice a second)
//   X.sky(p, d, f) / X.skyOff()      flying in the space between (shared-frame coordinates: see toShared)
//   X.look(true)                     in a space scene, wants to see the others out there
//   X.say(text)  X.dm(id, text)      a word to the sky, a text to one person in either world
//   await X.go('brn', { pe, f })     a ticket to cross; then cross('brn', tk) does the tear and the navigation
//   await X.arrived()                on a page just landed (#x=…): the passport, or null
//   X.admin(token)  X.op('close'|'open'|'home'|'live'|'hold'|'health')   the keeper's
// Events (X.on(name, fn)): people (Map), sky ({id,p,d,f} | {id,off}), say, dm, state ({open,live}), home, health, admin, open, close
// Nothing secret goes through here: names, looks, forms, rough places, the words people type.

export const VERSION = 1;
const LOCAL = /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
const RT_PORT = (() => { try { const q = new URLSearchParams(location.search).get('xrt'); if (q && /^\d{2,5}$/.test(q)) localStorage.setItem('x-rt', q); return localStorage.getItem('x-rt') || '8787'; } catch (e) { return '8787'; } })();   // (?xrt=8788: a second local worker)
export const RT = LOCAL ? `http://127.0.0.1:${RT_PORT}` : 'https://bsm-realtime.bsm-realtime.workers.dev';
export const WORLDS = {
  icarus: { name: 'ICARUS', url: 'https://justkeepflying.com', local: 'http://localhost:8123', style: 'ascii' },
  brn: { name: 'BURNING STUDIO MUSIC', url: 'https://burningstudiomusic.com', local: 'http://localhost:8124', style: 'px' },
};
export const worldUrl = w => (LOCAL ? WORLDS[w].local : WORLDS[w].url);
export const PETS = ['murph', 'odie', 'batman', 'cali'];

// ?x=1 turns the crossing on for this browser before it's live for everyone; ?x=0 turns it off again
export function flagged() {
  try {
    const q = new URLSearchParams(location.search).get('x');
    if (q === '1') localStorage.setItem('x-on', '1'); else if (q === '0') localStorage.removeItem('x-on');
    return localStorage.getItem('x-on') === '1';
  } catch (e) { return false; }
}
// is the way live (anyone sees the doors) and open (anyone may cross)? One small request, before opening any line
export async function state() {
  try { const r = await fetch(`${RT}/x/state`, { cache: 'no-store' }); return r.ok ? await r.json() : { open: 0, live: 0 }; } catch (e) { return { open: 0, live: 0, down: 1 }; }
}
// should this page take part at all: the flag, a ticket in the address, or the way being live
export async function wanted() {
  if (flagged() || /^#x=[0-9a-f]{16}/.test(location.hash)) return { on: true, st: null };
  const st = await state(); return { on: !!st.live, st };
}

// ---- the shared sky: Olympus (Icarus's home globe) at the origin, the BRN stadium 1000 units along +x, y up ----
// Each world knows where those two are in its own space scene (A: the globe's middle, B: the stadium's), and maps through.
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const len = a => Math.hypot(a[0], a[1], a[2]), scl = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const cross3 = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const SKY_SPAN = 1000;
function basis(A, B) {
  const ab = sub(B, A), L = len(ab) || 1, ex = scl(ab, 1 / L);
  let up = [0, 1, 0]; if (Math.abs(dot(up, ex)) > 0.95) up = [0, 0, 1];
  const ez = (() => { const c = cross3(ex, up); return scl(c, 1 / (len(c) || 1)); })(), ey = cross3(ez, ex);
  return { ex, ey, ez, s: SKY_SPAN / L };
}
export function toShared(p, A, B) { const { ex, ey, ez, s } = basis(A, B), r = sub(p, A); return [dot(r, ex) * s, dot(r, ey) * s, dot(r, ez) * s]; }
export function fromShared(q, A, B) { const { ex, ey, ez, s } = basis(A, B), k = 1 / s; return [A[0] + (ex[0] * q[0] + ey[0] * q[1] + ez[0] * q[2]) * k, A[1] + (ex[1] * q[0] + ey[1] * q[1] + ez[1] * q[2]) * k, A[2] + (ex[2] * q[0] + ey[2] * q[1] + ez[2] * q[2]) * k]; }
export function dirToShared(d, A, B) { const { ex, ey, ez } = basis(A, B); return [dot(d, ex), dot(d, ey), dot(d, ez)]; }
export function dirFromShared(q, A, B) { const { ex, ey, ez } = basis(A, B); return [ex[0] * q[0] + ey[0] * q[1] + ez[0] * q[2], ex[1] * q[0] + ey[1] * q[1] + ez[1] * q[2], ex[2] * q[0] + ey[2] * q[1] + ez[2] * q[2]]; }

// ---- the line ----
export class Crossing {
  constructor({ home, world }) {
    this.home = home; this.world = world; this.id = null; this.people = new Map(); this.skyers = new Map();
    this.st = { open: 1, live: 0 }; this.ad = false; this.h = {}; this.q = []; this.mine = { h: home, w: world };
    this.wait = new Map(); this.backoff = 1000; this.connect();
  }
  on(k, f) { (this.h[k] ||= []).push(f); return () => { this.h[k] = this.h[k].filter(g => g !== f); }; }
  emit(k, v) { for (const f of this.h[k] || []) try { f(v); } catch (e) { console.warn('[x]', k, e); } }
  connect() {
    let ws; try { ws = new WebSocket(RT.replace(/^http/, 'ws') + '/x/ws'); } catch (e) { return this.later(); }
    this.ws = ws;
    ws.onopen = () => { this.backoff = 1000; this.send({ t: 'hi', ...this.mine }); for (const m of this.q.splice(0)) this.send(m); if (this.tok) this.send({ t: 'adm', h: this.home, tok: this.tok }); this.emit('open'); };
    ws.onmessage = e => { if (e.data === 'pong') return; let m; try { m = JSON.parse(e.data); } catch (_) { return; } this.got(m); };
    ws.onclose = () => { this.ws = null; this.id = null; this.people.clear(); this.skyers.clear(); this.emit('people', this.people); this.emit('close'); this.later(); };
    clearInterval(this.pinger); this.pinger = setInterval(() => { if (this.ws?.readyState === 1) this.ws.send('ping'); }, 25e3);
  }
  later() { clearTimeout(this.rt); this.rt = setTimeout(() => this.connect(), this.backoff); this.backoff = Math.min(30e3, this.backoff * 2); }
  send(m) { if (this.ws?.readyState === 1) { this.ws.send(JSON.stringify(m)); return true; } return false; }
  sendq(m) { if (!this.send(m)) this.q.push(m); }
  cardOf(c) { return { id: c[0], h: c[1], w: c[2], n: c[3], pl: c[4], f: c[5], pe: c[6] || '', ad: !!c[7] }; }
  got(m) {
    switch (m.t) {
      case 'xw': this.id = m.id; this.st = m.st; this.people.clear(); for (const c of m.all) { const p = this.cardOf(c); this.people.set(p.id, p); }
        this.skyers.clear(); for (const s of m.sky || []) { this.skyers.set(s.id, { ...s, t: performance.now() }); this.emit('sky', s); }
        this.emit('people', this.people); this.emit('state', this.st); break;
      case 'xa': { const p = this.cardOf(m.c); this.people.set(p.id, p); this.emit('people', this.people); break; }
      case 'xb': this.people.delete(m.id); if (this.skyers.delete(m.id)) this.emit('sky', { id: m.id, off: 1 }); this.emit('people', this.people); break;
      case 'sk': { const s = { id: m.id, p: m.p, d: m.d, f: m.f, t: performance.now() }; this.skyers.set(m.id, s); this.emit('sky', s); break; }
      case 'sko': this.skyers.delete(m.id); this.emit('sky', { id: m.id, off: 1 }); break;
      case 'say': this.emit('say', m); break;
      case 'dm': this.emit('dm', m); break;
      case 'dmno': this.emit('dmno', m); break;
      case 'st': this.st = { open: m.open, live: m.live }; this.emit('state', this.st); break;
      case 'home': this.emit('home', m); break;
      case 'hl': this.health = m; this.emit('health', m); break;
      case 'adm': this.ad = !!m.ok; this.emit('admin', this.ad); break;
      case 'tk': case 'pp': { const w = this.wait.get(m.t); if (w) { this.wait.delete(m.t); w(m); } break; }
    }
  }
  me(fields) {   // who I am and where: sent now if the line's up, at most twice a second
    Object.assign(this.mine, fields, { h: this.home, w: this.world });
    if (this.meT) return;
    this.meT = setTimeout(() => { this.meT = null; this.send({ t: this.id ? 'at' : 'hi', ...this.mine }); }, 500);
  }
  sky(p, d, f) { this.send({ t: 'sk', p, d, f }); }
  skyOff() { this.send({ t: 'sk', off: 1 }); }
  look(on) { this.send({ t: 'look', on: on ? 1 : 0 }); }
  say(x) { return this.send({ t: 'say', x: String(x).slice(0, 140) }); }
  dm(id, x) { return this.send({ t: 'dm', to: id, x: String(x).slice(0, 280) }); }
  ask(kind, m, ms = 6000) { return new Promise(res => { this.wait.set(kind, res); this.sendq(m); setTimeout(() => { if (this.wait.get(kind) === res) { this.wait.delete(kind); res({ err: 'timeout' }); } }, ms); }); }
  async go(to, { pe = '', f } = {}) { return this.ask('tk', { t: 'go', to, pe, f }); }   // → { tk, vt } | { err }
  async arrived() {   // the page was opened with #x=<ticket>: redeem it (once) for the passport
    const k = /^#x=([0-9a-f]{16})/.exec(location.hash); if (!k) return null;
    history.replaceState(null, '', location.pathname + location.search);   // (out of the address bar: it's spent either way)
    const r = await this.ask('pp', { t: 'in', tk: k[1] }, 8000);
    if (!r.pp) return null;
    const pp = r.pp;
    if (pp.h !== this.world && pp.vt) { this.mine.vt = pp.vt; try { sessionStorage.setItem('x-visit', JSON.stringify(pp)); } catch (e) {} }
    else try { sessionStorage.removeItem('x-visit'); } catch (e) {}
    return pp;
  }
  visit() { try { return JSON.parse(sessionStorage.getItem('x-visit') || 'null'); } catch (e) { return null; } }   // (a visitor reloading the page stays a visitor)
  admin(tok) { this.tok = tok; this.sendq({ t: 'adm', h: this.home, tok }); }
  op(op) { return this.send({ t: 'op', op }); }
}

// the home world remembers where you left from, so coming back puts you there
export function saveReturn(world, data) { try { localStorage.setItem('x-ret:' + world, JSON.stringify({ ...data, at: Date.now() })); } catch (e) {} }
export function takeReturn(world) { try { const s = localStorage.getItem('x-ret:' + world); localStorage.removeItem('x-ret:' + world); const r = s && JSON.parse(s); return r && Date.now() - r.at < 864e5 ? r : null; } catch (e) { return null; } }

const pre = new Set();
export function prefetch(to) {   // getting close to a door: fetch the other world's page ahead, so the tear has it ready
  const u = worldUrl(to) + '/'; if (pre.has(u)) return; pre.add(u);
  const l = document.createElement('link'); l.rel = 'prefetch'; l.href = u; l.as = 'document'; document.head.appendChild(l);
}

// ---- the tear: the screen goes over from one world's style to the other's, cell by cell ----
// ascii: letters, cool on black; px: chunky palette blocks with a dither. Leaving: the page's style breaks up into the other's
// until it covers the screen, then the navigation. Landing: the new page starts covered in the old style and clears.
const GL = '@#%&*+=-:;!?/\\|<>^~$01'.split('');
const PAL = ['#0b0b12', '#1d1a2e', '#3b2a4d', '#7a2f3f', '#d9502e', '#f2a640', '#f7e28c', '#8fd3c7', '#3d7fa8', '#24324a'];
function veil() {
  let c = document.getElementById('x-tear');
  if (!c) { c = document.createElement('canvas'); c.id = 'x-tear'; c.style.cssText = 'position:fixed;inset:0;width:100vw;height:100vh;z-index:2147483646;pointer-events:none;image-rendering:pixelated'; document.documentElement.appendChild(c); }
  const dpr = Math.min(2, devicePixelRatio || 1); c.width = Math.ceil(innerWidth * dpr); c.height = Math.ceil(innerHeight * dpr);
  return { c, g: c.getContext('2d'), dpr };
}
function cellDraw(g, x, y, s, style, k) {
  if (style === 'ascii') { g.fillStyle = '#05070a'; g.fillRect(x, y, s, s); g.fillStyle = k > 0.6 ? '#ffe9b0' : '#9fd8ff'; g.font = `${Math.round(s * 0.95)}px ui-monospace,Menlo,monospace`; g.textBaseline = 'top'; g.fillText(GL[(Math.random() * GL.length) | 0], x + s * 0.18, y); }
  else { const col = PAL[(Math.random() * PAL.length) | 0]; g.fillStyle = col; g.fillRect(x, y, s, s); if ((Math.floor(x / s) + Math.floor(y / s)) & 1) { g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(x, y, s / 2, s / 2); g.fillRect(x + s / 2, y + s / 2, s / 2, s / 2); } }
}
export function tear(from, to, ms = 1100) {   // → a promise that resolves once the screen is covered (navigate then)
  return new Promise(res => {
    const { c, g, dpr } = veil(), s = Math.round(18 * dpr), W = Math.ceil(c.width / s), H = Math.ceil(c.height / s);
    const order = []; for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) { const dx = i - W / 2, dy = j - H / 2; order.push([i, j, Math.hypot(dx / W, dy / H) + Math.random() * 0.25]); }
    order.sort((a, b) => a[2] - b[2]);
    const t0 = performance.now(), N = order.length; let done = 0;
    const step = now => {
      const k = Math.min(1, (now - t0) / ms), want = Math.floor(N * k);
      for (; done < want; done++) { const [i, j] = order[done]; cellDraw(g, i * s, j * s, s, from, Math.random()); }
      // the cells already taken turn over into the other style, a few each frame
      for (let n = 0; n < Math.min(done, 40 + N / 30); n++) { const [i, j] = order[(Math.random() * done) | 0]; cellDraw(g, i * s, j * s, s, k > 0.35 ? to : from, Math.random()); }
      if (k < 1) requestAnimationFrame(step); else { g.fillStyle = to === 'ascii' ? '#05070a' : '#0b0b12'; for (let n = 0; n < N; n++) if (Math.random() < 0.6) { const [i, j] = order[n]; cellDraw(g, i * s, j * s, s, to, Math.random()); } res(); }
    };
    requestAnimationFrame(step);
  });
}
export function untear(style, ms = 1400) {   // on arrival: start covered in the style they came from, clear from the middle out
  const { c, g, dpr } = veil(), s = Math.round(18 * dpr), W = Math.ceil(c.width / s), H = Math.ceil(c.height / s);
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) cellDraw(g, i * s, j * s, s, style, Math.random());
  const order = []; for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) order.push([i, j, Math.hypot((i - W / 2) / W, (j - H / 2) / H) + Math.random() * 0.2]);
  order.sort((a, b) => a[2] - b[2]);
  let t0 = 0, done = 0; const N = order.length;
  return { go: () => new Promise(res => { t0 = performance.now(); const step = now => { const k = Math.min(1, (now - t0) / ms), want = Math.floor(N * k * k); for (; done < want; done++) { const [i, j] = order[done]; g.clearRect(i * s, j * s, s, s); } if (k < 1) requestAnimationFrame(step); else { c.remove(); res(); } }; requestAnimationFrame(step); }) };
}
// the whole crossing, for a page: ticket, return point, tear, navigate
export async function cross(X, to, { pe = '', f, ret } = {}) {
  const r = await X.go(to, { pe, f });
  if (!r.tk) return r;   // (closed, or no line: the page says so)
  if (to !== X.home && ret) saveReturn(X.home, ret);
  try { sessionStorage.setItem('x-tearfrom', WORLDS[X.world].style); } catch (e) {}
  await tear(WORLDS[X.world].style, WORLDS[to].style);
  location.href = worldUrl(to) + '/#x=' + r.tk;
  return r;
}
// a page that was just crossed into: cover at once in the style they came from (call as early as possible)
export function landing() {
  const k = /^#x=[0-9a-f]{16}/.test(location.hash); if (!k) return null;
  const from = document.referrer.includes('justkeepflying') || /:8123/.test(document.referrer) ? 'ascii' : document.referrer.includes('burningstudiomusic') || /:8124/.test(document.referrer) ? 'px' : null;
  return untear(from || 'ascii');
}

// ---- the keeper's panel: how everything is doing, and the switch. Plain DOM, mounted by either game for its admin ----
const dotc = ok => ok == null ? '#777' : ok ? '#4ade80' : '#f87171';
export function healthRows(h) {   // [label, ok (true/false/null), detail] for every service: no key values, ever
  if (!h) return [];
  const I = h.icarus || {}, B = h.brn || {}, W = h.worker || {}, S = h.supabase;
  const svc = (x, name) => x == null ? [name, null, 'no key set'] : [name, !!x.ok, x.ok ? `${x.ms ?? '?'} ms` + (x.used != null ? ` · ${x.used}% of the month` : '') : 'not answering'];
  const rows = [
    ['ICARUS site', !!I.up, I.up ? `${I.ms} ms` : 'down'],
    svc(I.ai, 'Icarus · OpenAI'), svc(I.voice, 'Icarus · ElevenLabs'), svc(I.db, 'Icarus · Supabase DB'),
    ['Icarus · realtime', S ? S.msgs < 80 : null, S ? `~${S.msgs}/${S.limit} msgs/s` + (S.msgs >= 80 ? ' · time for Supabase Pro' : '') : 'nobody to measure'],
    ['BRN site', !!B.up, B.up ? `${B.ms} ms` : 'down'],
    svc(B.store, 'BRN · Upstash'),
    ['BRN · realtime worker', !!W.up, 'up'],
    ['BRN · TURN relay', W.turn ? true : null, W.turn ? 'set' : 'no key set'],
    ['BRN · Twilio phone', W.twilio ? true : null, W.twilio ? 'set' : 'no key set'],
    ['BRN · Anthropic', W.anthropic ? true : null, W.anthropic ? 'set' : 'no key set'],
  ];
  return rows;
}
export function healthBad(h) { return healthRows(h).some(r => r[1] === false) || (h?.supabase?.msgs >= 80); }
export function mountPanel(X, { parent = document.body, startOpen = false } = {}) {
  const el = document.createElement('div'); el.id = 'x-panel';
  el.style.cssText = 'position:fixed;right:10px;top:10px;z-index:2147483600;font:12px/1.35 ui-monospace,Menlo,monospace;color:#e8e8e8;background:rgba(8,8,14,.88);border:1px solid #444;border-radius:6px;padding:8px 10px;min-width:250px;max-width:330px;display:none;backdrop-filter:blur(4px)';
  parent.appendChild(el);
  let open = startOpen, dismissed = 0;
  const btn = (op, label, warn) => `<button data-op="${op}" style="font:inherit;margin:2px;padding:3px 7px;border-radius:4px;border:1px solid ${warn ? '#a33' : '#555'};background:${warn ? '#3a1111' : '#1b1b25'};color:#eee;cursor:pointer">${label}</button>`;
  const draw = () => {
    const h = X.health, st = X.st, P = h?.people;
    if (!X.ad) { el.style.display = 'none'; return; }
    const bad = healthBad(h);
    if (bad && Date.now() - dismissed > 300e3) open = true;
    el.style.display = open ? 'block' : 'none';
    if (!open) return;
    el.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px"><b>CROSSING · KEEPER</b><span data-x="1" style="cursor:pointer;padding:0 4px">×</span></div>`
      + `<div style="margin-bottom:6px">THE LINK: <b style="color:${st.open ? '#4ade80' : '#f87171'}">${st.open ? 'OPEN' : 'CLOSED'}</b> · ${st.live ? 'LIVE for everyone' : 'held (only ?x=1)'}</div>`
      + (P ? `<div style="margin-bottom:6px">in Icarus ${P.icarus} · in BRN ${P.brn} · visiting ${P.visiting} · in the sky ${P.sky}</div>` : '')
      + healthRows(h).map(([n, ok, d]) => `<div style="display:flex;gap:6px"><span style="color:${dotc(ok)}">●</span><span style="flex:1">${n}</span><span style="color:#aaa">${d}</span></div>`).join('')
      + `<div style="margin-top:8px">${st.open ? btn('close', 'CLOSE THE LINK', 1) : btn('open', 'OPEN THE LINK')}${btn('home', 'SEND VISITORS HOME', 1)}${st.live ? btn('hold', 'HOLD (flag only)') : btn('live', 'GO LIVE')}${btn('health', '↻')}</div>`
      + `<div style="color:#888;margin-top:4px">${h ? 'checked ' + new Date(h.at).toLocaleTimeString() : 'checking…'}</div>`;
  };
  el.addEventListener('click', e => {
    const op = e.target?.dataset?.op;
    if (e.target?.dataset?.x) { open = false; dismissed = Date.now(); draw(); return; }
    if (!op) return;
    if ((op === 'close' || op === 'home') && !confirm(op === 'close' ? 'Close the link between the games? Nobody new can cross.' : 'Send every visitor back to their own world now?')) return;
    X.op(op);
  });
  for (const k of ['health', 'state', 'admin']) X.on(k, draw);
  return { el, toggle: () => { open = !open; if (open) X.op('health'); draw(); }, draw };
}
