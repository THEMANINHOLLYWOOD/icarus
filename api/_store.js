// What the newer endpoints share: the database (through PostgREST, with the server's own key), the traveller behind a
// travel code, and the person behind a sign-in. A sign-in is checked with Supabase itself (a token cannot be made up);
// an admin is someone signed in with a confirmed email listed in ADMIN_EMAILS (set on the server, never in the page).
import { createHash } from 'node:crypto';

export const URL_ = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
export const KEY = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
export const PUB = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY;
export const LIVE = !!(URL_ && KEY);

// a travel code is 12 letters and digits from a 32-character alphabet; only its hash keys anything about him
export const codeOf = c => { const s = String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); return /^[A-HJ-NP-Z2-9]{12}$/.test(s) ? s : null; };
export const hashOf = c => createHash('sha256').update('icarus-traveller:' + c).digest('hex');
export const nameOf = n => String(n || '').toUpperCase().replace(/[^A-Z0-9 ]/g, '').replace(/\s+/g, ' ').trim().slice(0, 12);

export async function rest(path, { method = 'GET', body, prefer, range } = {}) {
  if (!LIVE) return { ok: false, status: 0, data: null, count: 0 };
  const h = { apikey: KEY, 'Content-Type': 'application/json', Accept: 'application/json' };
  if (!KEY.startsWith('sb_')) h.Authorization = `Bearer ${KEY}`;
  if (prefer) h.Prefer = prefer;
  if (range) h.Range = range;
  try {
    const r = await fetch(`${URL_}/rest/v1/${path}`, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(6000) });
    const text = await r.text();
    let data = null; try { data = text ? JSON.parse(text) : null; } catch {}
    return { ok: r.ok, status: r.status, data, count: +(r.headers.get('content-range') || '').split('/')[1] || 0 };
  } catch { return { ok: false, status: 0, data: null, count: 0 }; }
}

// who is signed in (asked of Supabase, and remembered for a minute)
const USERS = globalThis.__icarusUsers ||= new Map();
export async function userOf(req) {
  const tok = /^Bearer\s+([\w.-]{20,4096})$/.exec(req.headers.get('authorization') || '')?.[1];
  if (!tok || !URL_ || !PUB) return null;
  const hit = USERS.get(tok); if (hit && Date.now() - hit.at < 60_000) return hit.u;
  let u = null;
  try {
    const r = await fetch(`${URL_}/auth/v1/user`, { headers: { apikey: PUB, Authorization: `Bearer ${tok}` }, signal: AbortSignal.timeout(4000) });
    if (r.ok) { const j = await r.json(); if (j && j.id) u = { id: String(j.id), email: String(j.email || '').toLowerCase(), confirmed: !!(j.email_confirmed_at || j.confirmed_at) }; }
  } catch {}
  if (USERS.size > 500) USERS.clear();
  USERS.set(tok, { u, at: Date.now() });
  return u;
}
export const isAdminEmail = e => !!e && (process.env.ADMIN_EMAILS || '').toLowerCase().split(/[\s,;]+/).filter(Boolean).includes(String(e).toLowerCase());
export async function adminOf(req) { const u = await userOf(req); return u && u.confirmed && isAdminEmail(u.email) ? u : null; }
// the traveller asking: the code they send, or the one their account is tied to
export async function travellerOf(req, b) {
  const code = codeOf(b && b.code);
  if (code) return { code, hash: hashOf(code) };
  const u = await userOf(req); if (!u) return null;
  const r = await rest(`accounts?select=code&user_id=eq.${encodeURIComponent(u.id)}`);
  const c = Array.isArray(r.data) && r.data[0] && codeOf(r.data[0].code);
  return c ? { code: c, hash: hashOf(c) } : null;
}
