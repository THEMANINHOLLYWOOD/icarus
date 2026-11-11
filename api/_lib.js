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
export function limited(req, bucket, perMinute) {
  const ip = (req.headers.get('x-forwarded-for') || 'local').split(',')[0].trim();
  const key = `${bucket}:${ip}`, now = Date.now();
  const arr = (hits.get(key) || []).filter(t => now - t < 60_000);
  arr.push(now);
  hits.set(key, arr);
  if (hits.size > 5000) hits.clear();
  return arr.length > perMinute;
}
