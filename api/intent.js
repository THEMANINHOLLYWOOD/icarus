// What did he mean? A spoken order the game didn't catch by itself ("let's head down to that beach and walk a bit") is
// turned into the game's own short list of things it can do, in order.
import { json, clip, limited, refuse } from './_lib.js';
import { ACTION_DOC, cleanActions } from './_actions.js';

const SYSTEM = `You turn what a player says to their character in a flying game into actions. The player is Icarus: a man who can walk, jump, fall and glide on wax wings, and who turns into a phoenix to fly. They may also be shapeshifted into an animal.
Actions you may use, in the order they should happen:
${ACTION_DOC}
If what they said is not an instruction to the character or the game (it's chatter, or said to someone else), return no actions.
Answer with one JSON object only: {"actions": ["..."]}`;

export async function POST(req) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return json({ error: 'OPENAI_API_KEY is not set' }, 501);
  const no = refuse(req, 4096); if (no) return no;
  if (limited(req, 'intent', 30)) return json({ error: 'slow down' }, 429);
  let body;
  try { body = await req.json(); } catch { return json({ error: 'bad json' }, 400); }
  const text = clip(String(body?.text || ''), 200);
  if (!text) return json({ actions: [] });
  const where = clip(String(body?.state || ''), 160);
  let out = {};
  try {
    const r = await fetch('https://api.openai.com/v1/chat/completions', { method: 'POST', signal: AbortSignal.timeout(10000),
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: process.env.OPENAI_MODEL || 'gpt-4.1-mini', max_completion_tokens: 120, response_format: { type: 'json_object' },
        messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: `${where ? `(He is ${where}.) ` : ''}${text}` }] }) });
    if (!r.ok) return json({ actions: [] });
    out = JSON.parse((await r.json()).choices?.[0]?.message?.content || '{}');
  } catch { return json({ actions: [] }); }
  const actions = cleanActions(out.actions);
  return json({ actions });
}
