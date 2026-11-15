// One function for the smaller endpoints (the Hobby plan allows twelve functions a deployment): the keeper's orders
// (admin), signing in (account), a traveller's record (stats), the names of the country (areas), the keeper's agent, the
// camera's director (dp), the door travellers' own agents come in by (mcp: /mcp is rewritten to it in vercel.json), and
// signing in at that door (oauth: the well-known documents, /register and /token are rewritten to it too), the keeper's
// scenes (story: read by everyone, written by him), and the ring of everyone who has flown through the ring of fire (ring).
// /api/hub?fn=<name>; each one is its own module beside this one.
import { json } from './_lib.js';
import * as admin from './_admin.js';
import * as account from './_account.js';
import * as stats from './_stats.js';
import * as areas from './_areas.js';
import * as agent from './_agent.js';
import * as dp from './_dp.js';
import * as mcp from './_mcp.js';
import * as oauth from './_oauth.js';
import * as dad from './_dad.js';
import * as npc from './_npc.js';
import * as fly from './_fly.js';
import * as story from './_story.js';
import * as ring from './_ring.js';

const R = { admin, account, stats, areas, agent, dp, mcp, oauth, dad, npc, fly, story, ring };   // (dad: what Daedalus says back, on the tower; npc: what one of the regulars types back in chat; story: the keeper's scenes; ring: the ring of everyone's rings round the ring of fire)
const pick = req => { const n = new URL(req.url).searchParams.get('fn'); return Object.hasOwn(R, n) ? R[n] : null; };
export function GET(req) { const m = pick(req); return m && m.GET ? m.GET(req) : json({ error: 'not found' }, 404); }
export function POST(req) { const m = pick(req); return m && m.POST ? m.POST(req) : json({ error: 'not found' }, 404); }
export function OPTIONS(req) { const m = pick(req); return m && m.OPTIONS ? m.OPTIONS(req) : json({ error: 'not found' }, 404); }
export function DELETE(req) { const m = pick(req); return m && m.DELETE ? m.DELETE(req) : json({ error: 'not found' }, 404); }
