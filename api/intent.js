// What did he mean? A spoken order the game didn't catch by itself ("let's head down to that beach and walk a bit") is
// turned into the game's own short list of things it can do, in order.
import { json, clip, limited, refuse } from './_lib.js';

const ACTIONS = ['fly', 'land', 'glide', 'bird', 'human', 'jump', 'dive', 'climb', 'faster', 'slower', 'left', 'right', 'around', 'walk', 'run', 'stop',
  'go_there', 'map', 'photo', 'snap', 'close', 'cinematic', 'normalcam', 'players', 'chat', 'mute', 'unmute', 'help',
  'objective', 'home', 'temple', 'nova', 'blow', 'perch', 'explain', 'closer', 'further', 'face', 'wide',
  'menu', 'hands_on', 'hands_off', 'mic_off', 'tilt', 'thumb', 'quality_up', 'quality_down', 'letters_up', 'letters_down'];

const SYSTEM = `You turn what a player says to their character in a flying game into actions. The player is Icarus: a man who can walk, jump, fall and glide on wax wings, and who turns into a phoenix to fly. They may also be shapeshifted into an animal.
Actions you may use, in the order they should happen:
fly (take off / keep flying), land (come down where he is), glide (open wings and glide), bird (become the phoenix), human (become a man again / fold wings),
jump, dive, climb, faster, slower, left, right, around (turn around), walk, run, stop (stop whatever he is doing),
go_there (go to the place the player is looking at or pointing at), map, photo (photo camera), snap (take the picture), close (close whatever is open),
cinematic (cinematic camera), normalcam (normal camera), players (show who else is playing), chat,
mute, unmute, help (list what can be said), objective (what to do next in the story), home (go back to Olympus), temple (go to the next god's temple),
nova (a burst of fire all round him that burns back the dead attacking him in the Underworld),
blow (the bird breathes out a gust: a burst of speed, and a river of wind along his path that anyone can ride),
perch (land and stay a bird), explain (how to play), closer / further (move the camera in or out), face (a close-up of him), wide (a wide shot),
menu (open or close the menu), hands_on / hands_off (steer with hands seen by the camera, or stop), mic_off (stop listening), tilt / thumb (how a phone steers),
quality_up / quality_down (sharper graphics, or smoother), letters_up / letters_down (bigger or smaller letters in the picture).
To change shape, use "become:<animal>" (e.g. "become:whale").
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
  // only the game's own words come back
  const actions = (Array.isArray(out.actions) ? out.actions : []).slice(0, 5).map(a => String(a || '').toLowerCase().trim())
    .filter(a => ACTIONS.includes(a) || /^become:[a-z][a-z \-']{1,30}$/.test(a));
  return json({ actions });
}
