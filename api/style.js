// A look, from a few words. The player describes how they want the picture to be written — "old newspaper", "purple
// matrix", "hearts, pink, soft" — and this answers with a look the game can wear: which characters shade the picture from
// dark to bright, what face they are set in, and how the colour is treated. Nothing is kept; the answer is only numbers
// and a short string of characters, and the page checks every one of them again before using it.
import { json, clip, limited, refuse } from './_lib.js';

const SYSTEM = `You design looks for a game whose whole picture is drawn in text characters: every cell of the screen is one character on a tile of the scene's colour there.
Given a description, answer with ONE JSON object and nothing else:
{"name": "<two or three words, a name for this look>",
 "glyphs": "<8 to 40 characters, ordered from the emptiest (the first MUST be a space) to the heaviest, used to shade dark to bright. Any Unicode a normal system font can draw: letters, digits, punctuation, box and block characters, Greek, katakana, braille, simple symbols. No emoji.>",
 "font": "mono" | "serif" | "block" | "thin",
 "tint": [r, g, b] each 0 to 1 — the colour of a one-colour look,
 "mono": 0 to 1 — how far the scene's own colours give way to the tint (0 keeps the scene's colours, 1 is one colour only),
 "sat": 0 to 2 (1 is unchanged), "con": 0.6 to 1.8 contrast (1 unchanged), "bri": 0.6 to 1.5 brightness (1 unchanged),
 "tile": 0 to 1.4 — how strongly each cell's background tile shows (0: characters on black, like a terminal; 1: the game's usual),
 "ink": 0.6 to 1.8 — how bright the characters are, "invert": 0 or 1 — 1 is dark ink on pale paper,
 "scan": 0 to 1 — scan lines, "glow": 0 to 2 — bloom (1 usual), "edges": 0 or 1 — whether outlines are drawn with | / - \\,
 "cell": "fine" | "normal" | "big"}
Make it readable: the picture must still be recognisable. Match the description's mood with the characters as well as the colour.`;

const num = (v, lo, hi, d) => { v = +v; return Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : d; };
export function cleanStyle(o) {
  if (!o || typeof o !== 'object') return null;
  let g = [...String(o.glyphs || '')].filter(c => { const k = c.codePointAt(0); return k >= 32 && k !== 127 && !(k >= 0xd800 && k <= 0xdfff) && k < 0x1f000; });
  g = [...new Set(g)].slice(0, 40); if (g[0] !== ' ') g.unshift(' '); if (g.length < 4) return null;
  const t = Array.isArray(o.tint) ? o.tint : [1, 1, 1];
  return { name: clip(String(o.name || 'a look'), 28).replace(/[<>&"']/g, ''), glyphs: g.join(''), font: ['mono', 'serif', 'block', 'thin'].includes(o.font) ? o.font : 'mono',
    tint: [num(t[0], 0, 1, 1), num(t[1], 0, 1, 1), num(t[2], 0, 1, 1)], mono: num(o.mono, 0, 1, 0), sat: num(o.sat, 0, 2, 1), con: num(o.con, 0.6, 1.8, 1), bri: num(o.bri, 0.6, 1.5, 1),
    tile: num(o.tile, 0, 1.4, 1), ink: num(o.ink, 0.6, 1.8, 1), invert: o.invert ? 1 : 0, scan: num(o.scan, 0, 1, 0), glow: num(o.glow, 0, 2, 1), edges: o.edges === 0 || o.edges === false ? 0 : 1,
    cell: ['fine', 'normal', 'big'].includes(o.cell) ? o.cell : 'normal' };
}

export async function POST(req) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return json({ error: 'OPENAI_API_KEY is not set' }, 501);
  const no = refuse(req, 2048); if (no) return no;
  if (limited(req, 'style', 8)) return json({ error: 'slow down' }, 429);
  let body;
  try { body = await req.json(); } catch { return json({ error: 'bad json' }, 400); }
  const text = clip(String(body?.text || ''), 160);
  if (!text) return json({ error: 'nothing asked' }, 400);
  try {
    const r = await fetch('https://api.openai.com/v1/chat/completions', { method: 'POST', signal: AbortSignal.timeout(12000),
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: process.env.OPENAI_MODEL || 'gpt-4.1-mini', max_completion_tokens: 260, temperature: 0.8, response_format: { type: 'json_object' },
        messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: text }] }) });
    if (!r.ok) return json({ error: `ai ${r.status}` }, 502);
    let out = {}; try { out = JSON.parse((await r.json()).choices?.[0]?.message?.content || '{}'); } catch {}
    const style = cleanStyle(out);
    return style ? json({ style }) : json({ error: 'no look came of that' }, 502);
  } catch { return json({ error: 'timeout' }, 504); }
}
