// Who may not play. Kept in public.world_bans (see supabase/world.sql), read only from here with the secret key: a row
// per thing that is banned — a traveller (the hash of their travel code), an address (the hash of an IP, or of the /64 an
// IPv6 address belongs to), or a name. Read in one go and kept a minute, so checking costs nothing on most requests.
// Locally, or before the table exists, bans are kept in memory: real for this server, not for the next.
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

const URL_ = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const LIVE = !!(URL_ && KEY);
const MEM = globalThis.__icarusBans ||= new Map();
const CACHE = { at: 0, keys: null };

async function rest(path, { method = 'GET', body, prefer } = {}) {
  const h = { apikey: KEY, 'Content-Type': 'application/json', Accept: 'application/json' };
  if (!KEY.startsWith('sb_')) h.Authorization = `Bearer ${KEY}`;
  if (prefer) h.Prefer = prefer;
  try {
    const r = await fetch(`${URL_}/rest/v1/${path}`, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(4000) });
    const text = await r.text(); let data = null; try { data = text ? JSON.parse(text) : null; } catch {}
    return { ok: r.ok, status: r.status, data };
  } catch { return { ok: false, status: 0, data: null }; }
}
const salt = () => process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.OPENAI_API_KEY || 'icarus-dev';
// an address, as it is kept: hashed, and an IPv6 address by its /64 (one machine holds a whole /64)
export const ipOf = req => { let ip = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim(); if (!ip) return '';
  if (ip.includes(':')) { const h = ip.replace(/^\[|\]$/g, '').split('%')[0].split(':'); if (h.includes('')) { const i = h.indexOf(''); h.splice(i, 1, ...Array(Math.max(0, 9 - h.length)).fill('0')); } ip = h.slice(0, 4).map(x => x || '0').join(':') + '::/64'; }
  return createHash('sha256').update('icarus-ip:' + salt() + ':' + ip).digest('hex').slice(0, 40); };
export const nameKey = n => 'n:' + String(n || '').toUpperCase().replace(/[^A-Z0-9 ]/g, '').trim().slice(0, 12);

async function keys() {
  if (!LIVE) return new Set(MEM.keys());
  if (CACHE.keys && Date.now() - CACHE.at < 60_000) return CACHE.keys;
  const r = await rest('world_bans?select=key&limit=5000');
  const S = new Set(MEM.keys()); if (r.ok && Array.isArray(r.data)) for (const x of r.data) if (x && typeof x.key === 'string') S.add(x.key);
  CACHE.keys = S; CACHE.at = Date.now(); return S;
}
// is this request from someone banned? (any of: their traveller, their address, their name)
export async function bannedFor({ hash, ip, name }) {
  const K = await keys(); if (!K.size) return null;
  for (const k of [hash && 'c:' + hash, ip && 'i:' + ip, name && nameKey(name)]) if (k && K.has(k)) return k;
  return null;
}
export async function addBans(rows) {   // [{ key, kind, name, by }]
  for (const r of rows) MEM.set(r.key, r); CACHE.at = 0;
  if (!LIVE) return true;
  const res = await rest('world_bans?on_conflict=key', { method: 'POST', body: rows.map(r => ({ key: r.key, kind: r.kind, name: r.name || '', by_name: r.by || '' })), prefer: 'resolution=merge-duplicates,return=minimal' });
  return res.ok;   // (no table yet: the ban is in this server's memory only)
}
export async function dropBans(name) {   // everything banned under this name
  const N = String(name || '').toUpperCase().replace(/[^A-Z0-9 ]/g, '').trim().slice(0, 12); if (!N) return false;
  for (const [k, r] of MEM) if (r.name === N) MEM.delete(k); CACHE.at = 0;
  if (!LIVE) return true;
  return (await rest(`world_bans?name=eq.${encodeURIComponent(N)}`, { method: 'DELETE', prefer: 'return=minimal' })).ok;
}
// orders signed by the server: a page can show one to the player it names, and only the server can say whether it is real
const secret = () => createHash('sha256').update('icarus-mod:' + salt()).digest();
export const signOrder = (op, target, exp) => createHmac('sha256', secret()).update(`${op}|${target}|${exp}`).digest('hex').slice(0, 40);
export const orderOk = (op, target, exp, tok) => { if (typeof tok !== 'string' || tok.length !== 40 || !(+exp > Date.now())) return false; const a = Buffer.from(signOrder(op, target, +exp)), b = Buffer.from(tok); return a.length === b.length && timingSafeEqual(a, b); };
