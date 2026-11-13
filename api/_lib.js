// shared helpers for the API routes (underscore files are not deployed as routes)

export const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });

// own keys only: "constructor" and friends are not characters, quests or gifts
export const has = (o, k) => typeof k === 'string' && Object.hasOwn(o, k);
// a request that another website made from someone's browser, or one too big to be ours
export const refuse = (req, maxBytes = 65536) => {
  const site = req.headers.get('sec-fetch-site');
  if (site && site !== 'same-origin' && site !== 'same-site' && site !== 'none') return json({ error: 'forbidden' }, 403);
  if (+(req.headers.get('content-length') || 0) > maxBytes) return json({ error: 'too large' }, 413);
  return null;
};

export const clip = (s, n) => (typeof s === 'string' ? s.replace(/\s+/g, ' ').trim().slice(0, n) : '');

// best-effort per-IP limiter; serverless instances don't share memory, so this only blunts bursts
const hits = new Map();
// (one address: an IPv6 address counts by its /64, since one machine holds a whole /64 and can walk through it)
const ipKey = ip => { if (!ip.includes(':')) return ip; const h = ip.replace(/^\[|\]$/g, '').split('%')[0].split(':'); if (h.includes('')) { const i = h.indexOf(''), fill = Array(Math.max(0, 9 - h.length)).fill('0'); h.splice(i, 1, ...fill); } return h.slice(0, 4).map(x => x || '0').join(':') + '::/64'; };
export function limited(req, bucket, perMinute) {
  const ip = ipKey((req.headers.get('x-forwarded-for') || 'local').split(',')[0].trim());
  const key = `${bucket}:${ip}`, now = Date.now();
  const arr = (hits.get(key) || []).filter(t => now - t < 60_000);
  arr.push(now);
  hits.delete(key); hits.set(key, arr);   // (most recently used last)
  if (hits.size > 5000) {   // (sweep what has gone quiet; if that is not enough, the longest quiet go first — nobody's count is wiped to make room)
    for (const [k, v] of hits) if (!v.length || now - v[v.length - 1] >= 60_000) hits.delete(k);
    for (const k of hits.keys()) { if (hits.size <= 4000) break; hits.delete(k); }
  }
  return arr.length > perMinute;
}
