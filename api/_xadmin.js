// The keeper, for THE CROSSING (the way between this world and BURNING STUDIO MUSIC: a Durable Object on that game's realtime
// worker, which both games' pages keep a line open to). Its switch (close the way, send every visitor home, open it again)
// is the keeper's alone, and the Crossing cannot tell who he is: it asks each game's own server.
//   POST (signed in, as the keeper: adminOf) → { tok }: a token good for ten minutes, which his page hands to the Crossing.
//        It names nobody: no email, no account id, only what it is for and when it runs out, signed with this server's secret.
//   GET ?check=<tok> → { ok: true|false, who: 'icarus' }: the Crossing, server to server, asking whether a token is ours.
// /api/hub?fn=xadmin
import { json, limited } from './_lib.js';
import { adminOf } from './_store.js';
import { signOrder, orderOk } from './_bans.js';

const OP = 'xadmin', FOR = 'crossing:icarus', LIFE = 10 * 60_000;   // (a target no player's name can be: names have no colon in them)
export const mint = (now = Date.now()) => { const exp = now + LIFE; return `x1.${exp}.${signOrder(OP, FOR, exp)}`; };
export function good(tok, now = Date.now()) {
  const m = /^x1\.(\d{13})\.([0-9a-f]{40})$/.exec(String(tok || ''));
  if (!m) return false;
  const exp = +m[1]; if (exp > now + LIFE + 60_000) return false;   // (none longer than it could have been made for)
  return orderOk(OP, FOR, exp, m[2]);
}
export async function POST(req) {
  if (limited(req, 'xadmin', 20)) return json({ error: 'slow down' }, 429);
  const u = await adminOf(req);
  if (!u) return json({ error: 'not yours' }, 403);
  return json({ tok: mint() });
}
export async function GET(req) {
  if (limited(req, 'xadmin-check', 60)) return json({ error: 'slow down' }, 429);
  const tok = new URL(req.url).searchParams.get('check');
  return json({ ok: good(tok), who: 'icarus' });
}
