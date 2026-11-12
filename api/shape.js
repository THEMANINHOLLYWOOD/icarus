// Any creature, roughed out in rounded pieces: the game asks for a shape it doesn't know ("an axolotl", "a giant moth"), and
// gets back a couple of dozen ellipsoids it can pour its blocks of text into, with what each piece is (a wing, a leg…) so it
// can move it, how the thing gets about, how big it is and what colour.
import { json, clip, limited, refuse } from './_lib.js';

const ROLES = ['body', 'head', 'neck', 'wingL', 'wingR', 'legFL', 'legFR', 'legBL', 'legBR', 'tail', 'fin', 'other'];
const KINDS = ['walk', 'fly', 'swim'];
const n = (v, lo, hi, d = 0) => { v = +v; return Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : d; };

const SYSTEM = `You build the body of a creature out of ellipsoids for a game. The player said the name of something to turn into; give its shape.
Coordinates are metres in the creature's own frame: +y is up, -z is forward (the head is toward -z), +x is the creature's right.
For something that walks, the origin is on the ground under its middle (feet at y = 0). For something that flies or swims, the origin is the middle of its body.
Each part is an ellipsoid: "c" its centre [x, y, z], "s" its three radii [rx, ry, rz], "pitch" an optional tilt about the x axis in radians (positive tips the front up), and "role", one of: ${ROLES.join(', ')}.
Mark wings wingL/wingR (left is -x), legs legFL/legFR/legBL/legBR (front/back, left/right; a two-legged thing uses legBL and legBR), tails and flukes "tail", fins and flippers "fin".
Use 6 to 26 parts. Make the silhouette unmistakable: the proportions, the head, ears, horns, trunk, beak, shell — whatever makes it that thing. Real-world size.
"kind" is how it gets about: walk, fly or swim. "length" is its length nose to tail in metres (wingspan for something that flies, if larger). "color" is its main colour as #rrggbb.
If it is not an animal (a person, a monster, a thing), still give your best shape of it.
Answer with one JSON object only: {"kind": "...", "length": 0, "color": "#......", "parts": [{"role": "...", "c": [0, 0, 0], "s": [0, 0, 0], "pitch": 0}]}`;

export async function POST(req) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return json({ error: 'OPENAI_API_KEY is not set' }, 501);
  const no = refuse(req, 4096); if (no) return no;
  if (limited(req, 'shape', 12)) return json({ error: 'slow down' }, 429);
  let body;
  try { body = await req.json(); } catch { return json({ error: 'bad json' }, 400); }
  const name = clip(String(body?.name || ''), 40).toLowerCase().replace(/[^a-z \-']/g, '').trim();
  if (!name) return json({ error: 'no name' }, 400);
  let out;
  try {
    const r = await fetch('https://api.openai.com/v1/chat/completions', { method: 'POST', signal: AbortSignal.timeout(20000),
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: process.env.OPENAI_MODEL || 'gpt-4.1-mini', max_completion_tokens: 1400, response_format: { type: 'json_object' },
        messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: name }] }) });
    if (!r.ok) { console.error('openai', r.status, (await r.text()).slice(0, 200)); return json({ error: `openai ${r.status}` }, 502); }
    out = JSON.parse((await r.json()).choices?.[0]?.message?.content || '{}');
  } catch (e) { console.error('shape', e?.name); return json({ error: 'no shape' }, 504); }
  // trust nothing that came back: every number is clamped, every word is from the list
  const parts = (Array.isArray(out.parts) ? out.parts : []).slice(0, 30).map(p => ({
    role: ROLES.includes(p?.role) ? p.role : 'other',
    c: [0, 1, 2].map(i => n(p?.c?.[i], -60, 60)),
    s: [0, 1, 2].map(i => n(p?.s?.[i], 0.01, 30, 0.1)),
    pitch: n(p?.pitch, -3.2, 3.2),
  }));
  if (parts.length < 3) return json({ error: 'no shape' }, 502);
  const color = /^#[0-9a-f]{6}$/i.test(out.color) ? out.color : '#d8cfc0';
  return json({ name, kind: KINDS.includes(out.kind) ? out.kind : 'walk', length: n(out.length, 0.05, 80, 2), color, parts });
}
