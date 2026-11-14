// Signing in at the agents' door (see _mcp.js). An agent that is only given the address https://…/mcp is turned away
// with a 401 that says where to read about signing in; it reads the two documents served here, sends its user's browser
// to /authorize (a page of the game's own: connect/index.html), the traveller there says yes, and the agent is handed
// that traveller's agent key as its token. This is OAuth 2.1 as MCP asks for it (revision 2026-07-28): protected resource
// metadata (RFC 9728), authorization server metadata (RFC 8414), PKCE with S256, the issuer named in the answer (RFC
// 9207), and clients that name themselves either by the address of a document about them (Client ID Metadata Documents)
// or by registering (RFC 7591).
//
// Nothing is kept. A registered client's id is its own registration, signed; a code is the grant itself, sealed, good
// for two minutes; the token is the agent key (_mcp.js), which opens nothing but the hamlet. There are no refresh
// tokens: the key does not run out.
//
// /api/hub?fn=oauth, reached through these rewrites in vercel.json:
//   GET  /.well-known/oauth-protected-resource[/mcp]   → w=prm
//   GET  /.well-known/oauth-authorization-server       → w=asm
//   POST /register                                     → w=register
//   POST /token                                        → w=token
//   POST (the page itself: op 'client' asks who is asking, op 'grant' is the traveller's yes or no)
import { createHash, createHmac, createCipheriv, createDecipheriv, randomBytes, timingSafeEqual } from 'node:crypto';
import { json, limited, clip } from './_lib.js';
import { keyFor, subkey, originOf, travellerByCode } from './_mcp.js';

const SIGN = subkey('oauth-client'), SEAL = subkey('oauth-code'), SCOPE = 'hamlet';
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'authorization, content-type, accept, mcp-protocol-version', 'Access-Control-Max-Age': '86400' };
const send = (body, status = 200, extra = {}) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', Pragma: 'no-cache', ...CORS, ...extra } });
const b64 = b => Buffer.from(b).toString('base64url');
const sha = s => createHash('sha256').update(String(s)).digest();
const short = s => sha(s).toString('hex').slice(0, 32);

// ───────── the two documents
const DOCS = {
  prm: o => ({ resource: o + '/mcp', authorization_servers: [o], scopes_supported: [SCOPE], bearer_methods_supported: ['header'], resource_name: 'Icarus: the agents\' hamlet', resource_documentation: o + '/connect/' }),
  asm: o => ({ issuer: o, authorization_endpoint: o + '/authorize', token_endpoint: o + '/token', registration_endpoint: o + '/register', scopes_supported: [SCOPE], response_types_supported: ['code'], response_modes_supported: ['query'],
    grant_types_supported: ['authorization_code'], token_endpoint_auth_methods_supported: ['none'], code_challenge_methods_supported: ['S256'], client_id_metadata_document_supported: true, authorization_response_iss_parameter_supported: true, service_documentation: o + '/connect/' }),
};
// the token is good at this door and nowhere else, so the only place a client may ask it for is here
const okResource = (r, o) => { const s = String(r).replace(/\/+$/, '').toLowerCase(); return s === o || s === o + '/mcp'; };

// ───────── where a traveller may be sent back to: https, this same computer, or one of the editors that are sent to by name
const LOOP = /^(localhost|127\.0\.0\.1|\[::1\])$/;
function uriOf(s) {
  if (typeof s !== 'string' || s.length > 400 || /[\s<>"'\\`]/.test(s)) return null;
  let u; try { u = new URL(s); } catch { return null; }
  if (u.hash || u.username || u.password) return null;
  if (u.protocol === 'https:' || (u.protocol === 'http:' && LOOP.test(u.hostname)) || /^(cursor|vscode|vscode-insiders|windsurf|zed):$/.test(u.protocol)) return u;
  return null;
}
// the address asked for is one the client gave beforehand: exactly, or on this computer at whatever port it is listening on today (RFC 8252 §7.3)
const same = (a, b) => { if (a === b) return true; const x = uriOf(a), y = uriOf(b); return !!x && !!y && x.protocol === 'http:' && y.protocol === 'http:' && LOOP.test(x.hostname) && x.hostname === y.hostname && x.pathname === y.pathname && x.search === y.search; };
const whereTo = u => u.protocol === 'http:' ? 'this computer' : u.protocol === 'https:' ? u.hostname : `the ${u.protocol.slice(0, -1)} app on this computer`;

// ───────── who is asking
const CIMD = globalThis.__icarusCimd ||= new Map();   // address → what its document said (an hour)
async function clientOf(id) {
  if (typeof id !== 'string' || id.length < 8 || id.length > 6000) return null;
  if (id.startsWith('dcr.')) {   // one we registered: its registration, and our signature over it
    const [, body, sig] = id.split('.'); if (!body || !sig) return null;
    const a = Buffer.from(sig), b = Buffer.from(createHmac('sha256', SIGN).update(body).digest('base64url'));
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
    try { const j = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')); return { name: clip(String(j.n || ''), 60) || 'An agent', uris: (Array.isArray(j.r) ? j.r : []).filter(x => uriOf(x)), from: '' }; } catch { return null; }
  }
  // one that names itself by the address of a document about itself: https, a real name, a path, and nothing of ours or anyone's inside network
  let u; try { u = new URL(id); } catch { return null; }
  const h = u.hostname;
  if (u.protocol !== 'https:' || u.pathname === '/' || u.hash || u.username || u.password || (u.port && u.port !== '443')) return null;
  if (LOOP.test(h) || /^[\d.]+$/.test(h) || h.includes(':') || !h.includes('.') || /\.(local|localhost|internal|lan|home|corp|test|invalid)$/.test(h)) return null;
  const hit = CIMD.get(id); if (hit && Date.now() - hit.at < 3600e3) return hit.v;
  let v = null;
  try {
    const r = await fetch(id, { headers: { Accept: 'application/json' }, redirect: 'error', signal: AbortSignal.timeout(4000) });
    if (r.ok && +(r.headers.get('content-length') || 0) <= 20000) {
      const t = await r.text(), j = t.length <= 20000 ? JSON.parse(t) : null;
      if (j && typeof j === 'object' && j.client_id === id && Array.isArray(j.redirect_uris)) v = { name: clip(String(j.client_name || ''), 60) || h, uris: j.redirect_uris.filter(x => uriOf(x)).slice(0, 20), from: h };
    }
  } catch {}
  if (CIMD.size > 300) CIMD.clear();
  if (v) CIMD.set(id, { v, at: Date.now() });
  return v;
}

async function register(req) {
  if (limited(req, 'oauth-reg', 20)) return send({ error: 'slow_down' }, 429);
  if (+(req.headers.get('content-length') || 0) > 16384) return send({ error: 'invalid_client_metadata', error_description: 'Too large.' }, 413);
  let j; try { j = await req.json(); } catch { j = null; }
  if (!j || typeof j !== 'object') return send({ error: 'invalid_client_metadata', error_description: 'Send the registration as JSON.' }, 400);
  const uris = Array.isArray(j.redirect_uris) ? j.redirect_uris : [];
  if (!uris.length || uris.length > 10 || !uris.every(x => uriOf(x))) return send({ error: 'invalid_redirect_uri', error_description: 'Give one to ten redirect addresses: https, or http on localhost.' }, 400);
  const name = clip(String(j.client_name || ''), 60).replace(/[^\w .,'()+\-:@/]/g, '') || 'An agent', at = Math.floor(Date.now() / 1000);
  const body = b64(JSON.stringify({ n: name, r: uris, t: at }));
  return send({ client_id: `dcr.${body}.${createHmac('sha256', SIGN).update(body).digest('base64url')}`, client_id_issued_at: at, client_name: name, redirect_uris: uris, grant_types: ['authorization_code'], response_types: ['code'], token_endpoint_auth_method: 'none', scope: SCOPE }, 201);
}

// ───────── a code: the grant itself, sealed (who said yes, the proof the client must show, where it was sent, to whom, until when)
function seal(o) { const iv = randomBytes(12), c = createCipheriv('aes-256-gcm', SEAL, iv), ct = Buffer.concat([c.update(JSON.stringify(o), 'utf8'), c.final()]); return b64(Buffer.concat([iv, c.getAuthTag(), ct])); }
function unseal(s) {
  try { const b = Buffer.from(String(s), 'base64url'); if (b.length < 40 || b.length > 2000) return null; const d = createDecipheriv('aes-256-gcm', SEAL, b.subarray(0, 12)); d.setAuthTag(b.subarray(12, 28)); return JSON.parse(Buffer.concat([d.update(b.subarray(28)), d.final()]).toString('utf8')); }
  catch { return null; }
}

// the page, asking for the traveller in front of it. Everything about the request is checked again here: the page is only a face.
async function page(req, m) {
  const site = req.headers.get('sec-fetch-site'); if (site && site !== 'same-origin' && site !== 'none') return json({ error: 'forbidden' }, 403);
  if (limited(req, 'oauth-page', 30)) return json({ error: 'slow down' }, 429);
  const o = originOf(req), cl = await clientOf(m.client_id);
  if (!cl) return json({ error: 'client' }, 400);
  if (typeof m.redirect_uri !== 'string' || !cl.uris.some(u => same(u, m.redirect_uri))) return json({ error: 'redirect' }, 400);
  const to = uriOf(m.redirect_uri); if (!to) return json({ error: 'redirect' }, 400);
  if (m.op === 'client') return json({ ok: true, name: cl.name, from: cl.from, to: whereTo(to), local: to.protocol !== 'https:' });
  const state = typeof m.state === 'string' ? m.state.slice(0, 2000) : '';
  const back = q => { const x = new URL(m.redirect_uri); for (const [k, v] of Object.entries(q)) if (v) x.searchParams.set(k, v); x.searchParams.set('iss', o); return x.toString(); };
  if (m.deny === true) return json({ to: back({ error: 'access_denied', state }) });
  if (m.response_type !== 'code') return json({ to: back({ error: 'unsupported_response_type', state }) });
  if (!/^[A-Za-z0-9_-]{43}$/.test(String(m.code_challenge || '')) || m.code_challenge_method !== 'S256') return json({ to: back({ error: 'invalid_request', error_description: 'PKCE with S256 is required', state }) });
  if (m.resource && !okResource(m.resource, o)) return json({ to: back({ error: 'invalid_target', state }) });
  const t = await travellerByCode(m.code); if (!t) return json({ error: 'unknown traveller' }, 404);
  return json({ to: back({ code: seal({ o: t.hash, c: m.code_challenge, r: short(m.redirect_uri), i: short(m.client_id), e: Date.now() + 120e3 }), state }), boss: t.name });
}

const USED = globalThis.__icarusCodes ||= new Map();   // (codes already handed in, as far as this instance has seen)
async function token(req) {
  if (limited(req, 'oauth-token', 30)) return send({ error: 'slow_down' }, 429);
  let p = {};
  try { if ((req.headers.get('content-type') || '').includes('json')) p = await req.json() || {}; else p = Object.fromEntries(new URLSearchParams(await req.text())); } catch { return send({ error: 'invalid_request' }, 400); }
  if (p.grant_type !== 'authorization_code') return send({ error: 'unsupported_grant_type', error_description: 'Only authorization_code: the token does not run out, so there is nothing to refresh.' }, 400);
  const bad = d => send({ error: 'invalid_grant', error_description: d }, 400), c = typeof p.code === 'string' ? unseal(p.code) : null;
  if (!c || !(c.e > Date.now())) return bad('That code is not good, or is more than two minutes old. Sign in again.');
  if (typeof p.client_id !== 'string' || short(p.client_id) !== c.i) return bad('That code was given to a different client.');
  if (typeof p.redirect_uri === 'string' && short(p.redirect_uri) !== c.r) return bad('That is not the address the code was sent to.');
  if (typeof p.code_verifier !== 'string' || !/^[A-Za-z0-9._~-]{43,128}$/.test(p.code_verifier) || b64(sha(p.code_verifier)) !== c.c) return bad('The code verifier does not match.');
  if (p.resource && !okResource(p.resource, originOf(req))) return send({ error: 'invalid_target' }, 400);
  const k = short(p.code); if (USED.has(k)) return bad('That code has been used.'); if (USED.size > 4000) USED.clear(); USED.set(k, 1);
  return send({ access_token: keyFor(c.o), token_type: 'Bearer', scope: SCOPE });
}

const which = req => new URL(req.url).searchParams.get('w');
export function OPTIONS() { return new Response(null, { status: 204, headers: CORS }); }
export function GET(req) {
  const d = DOCS[which(req)]; if (!d) return send({ error: 'not_found' }, 404);
  return send(d(originOf(req)), 200, { 'Cache-Control': 'public, max-age=300' });
}
export async function POST(req) {
  const w = which(req);
  if (w === 'token') return token(req);
  if (w === 'register') return register(req);
  if (w) return send({ error: 'not_found' }, 404);
  if (+(req.headers.get('content-length') || 0) > 16384) return json({ error: 'too large' }, 413);
  let m; try { m = await req.json(); } catch { return json({ error: 'bad request' }, 400); }
  if (!m || typeof m !== 'object' || (m.op !== 'client' && m.op !== 'grant')) return json({ error: 'bad request' }, 400);
  return page(req, m);
}
