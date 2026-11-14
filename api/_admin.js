// The keeper's orders: send someone home, ban them, ban their address, lift a ban. Only for someone signed in with a
// confirmed email listed in ADMIN_EMAILS (set on the server): a name is anyone's to type, an email has to be proved.
// An order is signed here and passed to the player it names over the live channel; their page shows it back to this
// server, which checks the signature before anything happens, and keeps the ban itself (api/_bans.js).
import { json, refuse, limited } from './_lib.js';
import { createHash } from 'node:crypto';
import { bannedFor, addBans, dropBans, ipOf, nameKey, signOrder, orderOk } from './_bans.js';
import { adminOf } from './_store.js';

const codeOf = c => { const s = String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); return /^[A-HJ-NP-Z2-9]{12}$/.test(s) ? s : null; };
const hashOf = c => createHash('sha256').update('icarus-traveller:' + c).digest('hex');
const nameOf = n => String(n || '').toUpperCase().replace(/[^A-Z0-9 ]/g, '').replace(/\s+/g, ' ').trim().slice(0, 12);
const OPS = new Set(['kick', 'ban', 'ipban', 'unban']);

export async function POST(req) {
  const bad = refuse(req, 4096); if (bad) return bad;
  if (limited(req, 'admin', 30)) return json({ error: 'slow down' }, 429);
  let b; try { b = await req.json(); } catch { return json({ error: 'bad request' }, 400); }
  if (!b || typeof b !== 'object') return json({ error: 'bad request' }, 400);
  const code = codeOf(b.code), hash = code ? hashOf(code) : '', name = nameOf(b.name), ip = ipOf(req);
  // am I allowed to play? (asked as the page opens; whatever of him is not yet on the list is added, if any of him is)
  if (b.op === 'status') {
    const hit = await bannedFor({ hash, ip, name });
    if (hit && hash && hit !== 'c:' + hash) await addBans([{ key: 'c:' + hash, kind: 'code', name }]);   // (banned by name or address: this traveller too, whatever they call themselves next)
    return json({ banned: !!hit, admin: !!(await adminOf(req)) });
  }
  // an order, from the keeper
  if (b.op === 'order') {
    const op = String(b.order || ''), target = nameOf(b.target);
    if (!OPS.has(op) || !target) return json({ error: 'bad order' }, 400);
    const me = await adminOf(req); if (!me) return json({ error: 'not yours to give' }, 403);
    if (target === name) return json({ error: 'not on yourself' }, 400);
    if (op === 'unban') return json({ ok: await dropBans(target) });
    let kept = true; if (op === 'ban' || op === 'ipban') kept = await addBans([{ key: nameKey(target), kind: 'name', name: target, by: name || me.email }]);   // (the name, at once: even if they never see the order)
    const exp = Date.now() + 90_000;
    return json({ ok: true, kept, exp, tok: signOrder(op, target, exp) });
  }
  // an order shown back by the player it names
  if (b.op === 'obey') {
    const op = String(b.order || ''), target = nameOf(b.target);
    if (!OPS.has(op) || op === 'unban' || target !== name || !orderOk(op, target, b.exp, b.tok)) return json({ ok: false }, 400);
    if (op === 'ban' || op === 'ipban') await addBans([hash && { key: 'c:' + hash, kind: 'code', name }, op === 'ipban' && ip && { key: 'i:' + ip, kind: 'ip', name }].filter(Boolean));
    return json({ ok: true, op });
  }
  return json({ error: 'bad request' }, 400);
}
