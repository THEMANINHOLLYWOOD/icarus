// How the site itself is doing, in round numbers: whether each service behind it answers, how long it takes, and how
// much of the month's voice allowance is used. It is shown to whoever flies under the keeper's name, which is no secret,
// so nothing here is one either: no keys, no ids, no account details. The answer is remembered for a minute, so asking
// often costs nothing and reaches nobody.
import { json, limited } from './_lib.js';

let memo = null, memoT = 0;
const timed = async f => {
  const t0 = Date.now();
  try { const r = await f(); return { r, ms: Date.now() - t0 }; } catch { return { r: null, ms: Date.now() - t0 }; }
};
const get = (url, headers) => fetch(url, { headers, signal: AbortSignal.timeout(6000) });

export async function GET(req) {
  if (limited(req, 'health', 20)) return json({ error: 'slow down' }, 429);
  if (memo && Date.now() - memoT < 60_000) return json(memo);
  const oa = process.env.OPENAI_API_KEY, el = process.env.ELEVENLABS_API_KEY;
  const su = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, sk = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  const [ai, voice, db] = await Promise.all([
    oa ? timed(() => get(`https://api.openai.com/v1/models/${encodeURIComponent(process.env.OPENAI_MODEL || 'gpt-4.1-mini')}`, { Authorization: `Bearer ${oa}` })) : null,
    el ? timed(() => get('https://api.elevenlabs.io/v1/user/subscription', { 'xi-api-key': el })) : null,
    su && sk ? timed(() => get(`${su}/rest/v1/world_cells?select=cx&limit=1`, sk.startsWith('sb_') ? { apikey: sk } : { apikey: sk, Authorization: `Bearer ${sk}` })) : null,
  ]);
  const out = { at: Date.now(), ai: ai && { ok: !!ai.r?.ok, ms: ai.ms }, voice: null, db: db && { ok: !!db.r?.ok, ms: db.ms } };
  if (voice) {
    // (a key that may speak but not read its own account answers 401 here: the service is up, the allowance just isn't known)
    out.voice = { ok: !!voice.r && voice.r.status < 500 && voice.r.status !== 429, ms: voice.ms };
    if (voice.r?.ok) try {
      const j = await voice.r.json();
      if (j.character_limit > 0) out.voice.used = Math.min(100, Math.round(100 * j.character_count / j.character_limit));
    } catch {}
  }
  memo = out; memoT = Date.now();
  return json(out);
}
