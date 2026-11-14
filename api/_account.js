// Signing in. The game never needs it — a name is all a new traveller gives — but once someone has been up on Olympus
// they can tie their traveller to an account (an email, or Google) and so take the same journey to any device. The
// account keeps the travel code; signing in somewhere new hands it back, and the page fetches the journey with it.
import { json, refuse, limited } from './_lib.js';
import { codeOf, nameOf, rest, userOf, isAdminEmail, LIVE } from './_store.js';

const MEM = globalThis.__icarusAccounts ||= new Map();   // (the dev server, with no database)

export async function POST(req) {
  const bad = refuse(req, 4096); if (bad) return bad;
  if (limited(req, 'account', 20)) return json({ error: 'slow down' }, 429);
  let b; try { b = await req.json(); } catch { return json({ error: 'bad request' }, 400); }
  if (!b || typeof b !== 'object') return json({ error: 'bad request' }, 400);
  const u = await userOf(req);
  if (!u) return json({ error: 'not signed in' }, 401);
  const admin = u.confirmed && isAdminEmail(u.email);
  const find = async () => { if (!LIVE) return MEM.get(u.id) || null; const r = await rest(`accounts?select=code,name,email&user_id=eq.${encodeURIComponent(u.id)}`); return Array.isArray(r.data) && r.data[0] || null; };

  // who am I, and which traveller is mine (if any yet)
  if (b.op === 'me') { const a = await find(); return json({ email: u.email, admin, code: a ? a.code : null, name: a ? a.name : null }); }

  // tie this device's traveller to the account — or, if the account already has one, hand that one back
  if (b.op === 'link') {
    const a = await find();
    if (a) { if (LIVE) await rest(`accounts?user_id=eq.${encodeURIComponent(u.id)}`, { method: 'PATCH', body: { seen_at: new Date().toISOString(), email: u.email } }); return json({ code: a.code, name: a.name, admin, linked: false }); }
    const code = codeOf(b.code), name = nameOf(b.name);
    if (!code) return json({ error: 'no traveller on this device' }, 400);
    if (!LIVE) { if ([...MEM.values()].some(x => x.code === code)) return json({ error: 'that traveller belongs to another account' }, 409); MEM.set(u.id, { code, name, email: u.email }); return json({ code, name, admin, linked: true }); }
    const taken = await rest(`accounts?select=user_id&code=eq.${code}`);
    if (Array.isArray(taken.data) && taken.data.length) return json({ error: 'that traveller belongs to another account' }, 409);
    const r = await rest('accounts', { method: 'POST', body: { user_id: u.id, email: u.email, code, name }, prefer: 'return=minimal' });
    if (!r.ok) return json({ error: 'not kept' }, 502);
    return json({ code, name, admin, linked: true });
  }
  // the name goes with the account
  if (b.op === 'name') {
    const name = nameOf(b.name); if (!name) return json({ error: 'bad name' }, 400);
    if (!LIVE) { const a = MEM.get(u.id); if (a) a.name = name; return json({ ok: true }); }
    await rest(`accounts?user_id=eq.${encodeURIComponent(u.id)}`, { method: 'PATCH', body: { name } });
    return json({ ok: true });
  }
  return json({ error: 'bad request' }, 400);
}
