// One function for the smaller endpoints (the Hobby plan allows twelve functions a deployment): the keeper's orders
// (admin), signing in (account), a traveller's record (stats), the names of the country (areas), the keeper's agent, the
// camera's director (dp), and the door travellers' own agents come in by (mcp: /mcp is rewritten to it in vercel.json).
// /api/hub?fn=<name>; each one is its own module beside this one.
import { json } from './_lib.js';
import * as admin from './_admin.js';
import * as account from './_account.js';
import * as stats from './_stats.js';
import * as areas from './_areas.js';
import * as agent from './_agent.js';
import * as dp from './_dp.js';
import * as mcp from './_mcp.js';

const R = { admin, account, stats, areas, agent, dp, mcp };
const pick = req => { const n = new URL(req.url).searchParams.get('fn'); return Object.hasOwn(R, n) ? R[n] : null; };
export function GET(req) { const m = pick(req); return m && m.GET ? m.GET(req) : json({ error: 'not found' }, 404); }
export function POST(req) { const m = pick(req); return m && m.POST ? m.POST(req) : json({ error: 'not found' }, 404); }
export function OPTIONS(req) { const m = pick(req); return m && m.OPTIONS ? m.OPTIONS(req) : json({ error: 'not found' }, 404); }
export function DELETE(req) { const m = pick(req); return m && m.DELETE ? m.DELETE(req) : json({ error: 'not found' }, 404); }
