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
  // A decree, from the keeper, to everyone flying: gather them somewhere, change the weather over Olympus, send the regulars
  // away or bring them back. Signed here; every page shows it back here before it does anything, so nobody else can give one.
  if (b.op === 'decree' || b.op === 'decreeok') {
    const kind = String(b.kind || ''), arg = String(b.arg || '').slice(0, 40);
    const okArg = kind === 'gather' ? /^-?\d{1,7},-?\d{1,7}$/.test(arg) : kind === 'weather' ? /^(clear|storm|rain|mist|day|night)$/.test(arg) : kind === 'npcs' ? /^[01a]{8}$/.test(arg)
      : kind === 'fly' ? /^(end|restart|skip|shuffle):[dw][a-z0-9]{4,8}(:\d{13})?$/.test(arg) : false;   // (the keeper's hand on a fight: end it, run it again, skip its opening, shuffle its sides)
    if (!okArg) return json({ ok: false, error: 'bad decree' }, 400);
    if (b.op === 'decreeok') return json({ ok: +b.exp < Date.now() + 11 * 60_000 && orderOk('decree', kind + ':' + arg, b.exp, b.tok) });
    const me = await adminOf(req); if (!me) return json({ error: 'not yours to give' }, 403);
    const exp = Date.now() + (kind === 'npcs' ? 10 * 60_000 : 90_000);
    return json({ ok: true, exp, tok: signOrder('decree', kind + ':' + arg, exp) });
  }
  // The keeper's eye. Faction and private messages are sealed on the players' own machines; the keeper may read them all the
  // same, and players are told so. A keeper proved here (a signed-in, listed email: never a name) has the key of this visit
  // vouched for; every page asks this server whether a key shown to it on the channel really is a keeper's before it seals
  // anything to it. Nothing is kept: the vouching is a signature that runs out.
  if (b.op === 'eye') {
    const vk = typeof b.vk === 'string' && /^[A-Za-z0-9+/=]{80,100}$/.test(b.vk) ? b.vk : '';
    if (!vk) return json({ error: 'bad key' }, 400);
    const me = await adminOf(req); if (!me) return json({ error: 'not yours' }, 403);
    const exp = Date.now() + 12 * 3600_000;
    return json({ ok: true, exp, tok: signOrder('eye', createHash('sha256').update(vk).digest('hex').slice(0, 40), exp) });
  }
  if (b.op === 'eyeok') {
    const vk = typeof b.vk === 'string' && /^[A-Za-z0-9+/=]{80,100}$/.test(b.vk) ? b.vk : '';
    return json({ ok: !!vk && +b.exp < Date.now() + 13 * 3600_000 && orderOk('eye', createHash('sha256').update(vk).digest('hex').slice(0, 40), b.exp, b.tok) });
  }
  return json({ error: 'bad request' }, 400);
}
