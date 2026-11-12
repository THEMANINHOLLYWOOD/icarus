import { json, clip, limited, has, refuse } from './_lib.js';
import { ALL, GODS, WORLD, RULES, HADES_STAGE } from './_gods.js';

const SHAPE = {
  animal: g => `You are in your animal shape: ${g.disguise}. You speak from the animal's mouth.`,
  person: (g, first) => first ? `You stand before him as ${g.disguise}. You have not yet shown your true form.`   // (two of them never wore an animal)
    : `You have dropped the animal and stand before him as an ordinary-looking mortal, about his height (he is six foot two). You have not yet shown your true form.`,
  god: g => `You have shed every disguise. You stand before him in your true form, twelve feet tall, haloed, looking down at him.`,
  bolt: g => `You are at home, in your house on the summit of Olympus, and you are not in any body: you are the thunder over the roof and a bolt of lightning standing over your own empty throne. Your voice comes out of the storm.`,
};
const MORTAL_FIRST = new Set(['demeter', 'hephaestus']);
const SIDE = {
  for: 'You are one of the six on his side.',
  against: 'You are one of the six who resent that Zeus brought him up the mountain. You do not hide it.',
};
// What a character can send him to do (the game can check each of these), and what they can give.
export const KINDS = {
  dive: 'dive faster than N km/h (N from 600 to 1100)', skim: 'skim low over water for N metres (300 to 1500)', walk: 'walk N metres on his own feet (200 to 800)',
  perfect: 'make N perfect landings (1 to 3)', fall: 'fall N metres as a man and catch himself before the ground (100 to 400)', hoops: 'fly through N rings of light in the sky (3 to 12)',
  jet: 'ride a jetstream from one temple to the next (N = 1)', beacon: 'light one of the old signal fires on the hills (N = 1)', island: 'set foot on an island in the air (N = 1)',
  waterfall: 'fly through a waterfall (N = 1)', animal: 'walk up to a wild animal without frightening it (N = 1)', climb: 'climb until the sky burns him, then land alive (N = 1)',
  still: 'stand still on the ground until his cape is full of fire again (N = 1)', fly: 'fly N kilometres without touching the ground (2 to 8)', visit: 'go and find someone you have marked on his map (N = 1)',
};
export const GIFTS = {
  ember: 'a longer ember: his cape burns longer', wings: 'wider wings: a bigger bird', swift: 'the west wind: faster flight', feather: 'a soft fall: falls that would kill him do not',
  sun: "the sun's leave: he may fly higher before he burns", lens: 'the still eye: he can stop time and look at the world from anywhere', tide: "the sea's favour: skimming water feeds his fire", calm: 'the quiet step: wild things stop running from him',
};

// a task only counts if the line that set it said so out loud
const SPOKEN = {
  dive: /\b(div|plung|fast|km|speed)/i, skim: /\b(skim|water|sea|waves?|low)\b/i, walk: /\b(walk|feet|foot|step)/i, perfect: /\bland/i, fall: /\b(fall|drop|jump|leap|catch)/i,
  hoops: /\b(rings?|hoops?)\b/i, jet: /\b(stream|current|wind|river of air)/i, beacon: /\b(beacon|signal|fires?|light)\b/i, island: /\bisland/i, waterfall: /\b(waterfall|falls|falling water)\b/i,
  animal: /\b(animal|beast|creature|wild|deer|stag|fox|goat|hare|horse|bird)/i, climb: /\b(climb|higher?|rise|sky|sun)\b/i, still: /\b(still|stand|wait|rest|stay)\b/i, fly: /\b(fly|flight|kilomet|wing)/i, visit: /\b(find|go|visit|seek|see)\b/i,
};

const DEFY = /\b(coward|not afraid|not scared|don'?t scare|do it|go on then|make me|kill me|strike me|smite me|(you are|you're) nothing|pathetic|liar|like a dog|shut up|hate you|fight me|try me|or what)\b/i;
const THREAT = /\bI (could|can|will|would) (end|kill|break|drown|burn|unmake|swallow|crush|bury)\b|\b(end|kill|break|drown|unmake|swallow|crush|bury) you\b/i;

// The model is told to be brief and to ask one thing. This makes sure of it: stage directions that slipped in as sentences
// are dropped, nothing follows the first question, and a reply that runs long is cut at the end of a sentence.
const STAGEY = /^[A-Z][a-z]+ (rings?|tinkles?|rustles?|rumbles?|flickers?|shifts?|stirs?|laughs?|sighs?|smiles?|pauses?|nods?|tilts?|snorts?|grins?|chuckles?|hums?|cracks?|flares?|ripples?|glints?|glows?|flaps?|stamps?|echoes)\b[^.?!]*[.!]\s*/;
export function tighten(text, task, cap) {
  let t = text.replace(/\*[^*]*\*/g, '').replace(/\s{2,}/g, ' ').trim();
  for (let i = 0; i < 2; i++) t = t.replace(STAGEY, '');
  let cues = 0; t = t.replace(/\[[^\]]*\]/g, m => ++cues > 2 ? '' : m);
  const words = x => x.replace(/\[[^\]]*\]/g, '').trim().split(/\s+/).filter(Boolean).length;
  const max = cap || (task ? 40 : 28);
  let parts = t.match(/[^.!?…]+[.!?…]+["”’)\]]*\s*|[^.!?…]+$/g) || [t];
  // one question only. An echo of his own words with a question mark on it ("Not afraid?") is a tic, not a question: those go
  // first; if two real questions are left, the last one stays.
  const isQ = x => /\?/.test(x);
  if (parts.filter(isQ).length > 1) { const kept = parts.filter(x => !isQ(x) || words(x) > 4); if (kept.some(isQ)) parts = kept; }
  if (parts.filter(isQ).length > 1) { const last = parts.map(isQ).lastIndexOf(true); parts = parts.filter((x, i) => !isQ(x) || i === last); }
  t = parts.join('').trim();
  const tail = t.match(/\s*(\[[^\]]*\])\s*$/);   // a cue left hanging after the last word colours nothing: it leads the last sentence instead
  if (tail && t.length > tail[0].length) { t = t.slice(0, -tail[0].length); const cut = Math.max(t.lastIndexOf('. '), t.lastIndexOf('! '), t.lastIndexOf('? ')); t = cut < 0 ? `${tail[1]} ${t}` : `${t.slice(0, cut + 2)}${tail[1]} ${t.slice(cut + 2)}`; }
  if (words(t) <= max) return t;
  // too long: the hook (the question, or failing that the last line) is what must survive; then as much of the opening as fits
  const hook = parts[parts.length - 1];
  let out = '';
  for (const s2 of parts.slice(0, -1)) { if (words(out + s2 + hook) > max) break; out += s2; }
  return (out + hook).trim();
}

export async function POST(req) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return json({ error: 'OPENAI_API_KEY is not set' }, 501);
  const no = refuse(req); if (no) return no;
  if (limited(req, 'god', 40)) return json({ error: 'The gods need a moment.' }, 429);
  let body;
  try { body = await req.json(); } catch { return json({ error: 'bad json' }, 400); }
  const god = has(ALL, body?.god) ? ALL[body.god] : null;
  if (!god) return json({ error: 'unknown character' }, 400);
  const hades = body.god === 'hades', twelve = has(GODS, body.god) && !hades;

  // everything the two of them have ever said to each other on this device (the page keeps it and sends it back)
  const history = (Array.isArray(body.messages) ? body.messages : []).slice(-40)
    .map(m => ({ role: m?.role === 'god' ? 'assistant' : 'user', content: clip(m?.text, 320) }))
    .filter(m => m.content);
  const gossip = (Array.isArray(body.gossip) ? body.gossip.slice(-200) : [])
    .filter(g => has(ALL, g?.god) && g.god !== body.god).slice(-30)
    .map(g => g.who === 'mortal'
      ? `- Icarus told ${ALL[g.god].name}: "${clip(g.text, 220)}"`
      : `- ${ALL[g.god].name} told Icarus: "${clip(g.text, 220)}"`);
  const met = [...new Set(Array.isArray(body.met) ? body.met.slice(0, 60) : [])].filter(id => has(ALL, id) && id !== body.god).map(id => ALL[id].name);
  const first = !history.some(m => m.role === 'assistant');
  const said = history.filter(m => m.role === 'assistant').length;
  const w = body.witness || {};
  const seen = (Array.isArray(w.events) ? w.events : []).slice(-12).map(e => `- ${clip(e, 200)}`);
  const deaths = Math.max(0, Math.min(9999, w.deaths | 0)), crashes = Math.max(0, w.crashes | 0), perfect = Math.max(0, w.perfect | 0);
  const form = has(SHAPE, body.form) ? body.form : 'animal';
  const stage = Math.max(0, Math.min(HADES_STAGE.length - 1, body.stage | 0));
  const q = body.quest && has(KINDS, body.quest.kind) && has(GIFTS, body.quest.reward) ? body.quest : null;
  const perks = [...new Set(Array.isArray(body.perks) ? body.perks.slice(0, 40) : [])].filter(p => has(GIFTS, p));
  const when = ['night', 'dawn', 'day', 'dusk'].includes(body.time) ? body.time : 'day';
  const behind = clip(String(body.name || '').replace(/[^A-Za-z0-9 ]/g, ''), 14);
  // every one of the Twelve passes him on to the next: who that is, and which way
  const nx = body.next && has(GODS, body.next.id) && body.next.id !== body.god && body.next.id !== 'hades' ? GODS[body.next.id] : null;
  const nxDir = nx && ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'].includes(body.next.dir) ? body.next.dir : '';
  const nxKm = nx ? Math.max(0.1, Math.min(60, +body.next.km || 0)).toFixed(1) : '';

  const who = hades ? `You are Hades, lord of the Underworld.`
    : twelve ? `You are ${god.name}, one of the Twelve gods of Olympus.`
    : god.kind === 'titan' ? `You are ${god.name}, a Titan, older than the gods.`
    : `You are ${god.name}.`;
  const where = hades ? `You sit on your throne in the Underworld, lit by blue fire. ${HADES_STAGE[stage]}`
    : twelve ? [SIDE[god.side], SHAPE[form](god, MORTAL_FIRST.has(body.god))].join(' ')
    : `How you appear: ${String(god.look || god.disguise).replace(/\.$/, '')}.`;
  const acts = hades ? '' : `WHAT YOU CAN DO BESIDES SPEAK. You are not a quest-giver in a game; you are a person with a will. Any reply may also carry one act:
- "quest": send him to do something for you. It must come out of what he just said and who you are. Kinds the world allows:
${Object.entries(KINDS).map(([k, v]) => `   ${k}: ${v}`).join('\n')}
  Promise one reward from the gifts below. He can bargain: agree, refuse, raise the price, swap the task, mock the offer — you decide. Say the task and the reward aloud in your own words.
- "gift": simply give him something (rare: when he has moved you).
- "leave": walk away. Do it when you are bored, insulted, done, or he keeps saying nothing.
- "scare": do something frightening as you speak — the light goes out of the world for a moment, or the sky cracks open beside him, or you are suddenly very close. At most once in a conversation, on a line that is a threat or a truth he does not want. When he insults you, defies you or dares you to act, that is the moment: do it, do not set him a chore.
- "weather": change the sky over him, with "sky" one of storm, rain, dark, mist, clear, waves. Use it when the moment calls for it and it is yours to do: Zeus brings storms and can clear them; Poseidon raises the sea (waves) and the rain; Apollo and Helios clear the sky; anyone may darken it in anger or clear it in kindness. Say it aloud in your own words as you do it.
- "smite": strike him dead where he stands. ${god.smites ? 'You are capable of it. Only for real insolence or a threat; say why in a few words first.' : 'It is not in you; never use it.'} (He wakes on the summit; everyone hears about it.)
Gifts: ${Object.entries(GIFTS).map(([k, v]) => `${k} = ${v}`).join('; ')}.
He already has: ${perks.length ? perks.join(', ') : 'nothing'}.
${q ? (q.done ? `THE TASK YOU SET HIM ("${clip(q.goal, 120)}") IS DONE and he has had the ${q.reward} you promised. Acknowledge it once, your way. You may set another.` : `YOU HAVE ALREADY SET HIM A TASK: "${clip(q.goal, 120)}", for ${q.reward}. It is not done. Don't set another unless he bargains you into changing it.`)
    : said < 2 ? `You have not set him a task. Not yet: first find out what he is made of.` : said < 4 ? `You have not set him a task yet. Set one when something he says hands it to you; otherwise keep pressing him.` : `You have not set him a task yet. Set one in this reply, unless you are leaving or smiting.`}
A reply that sets a task is two short sentences and nothing else: the task as an order in your own words, then what he gets for it. The dare is the hook; that line needs no question. If he asks what he gets, or haggles, answer THAT — do not repeat the task word for word. Never mark "quest" on a reply that does not say the task aloud.
IF HE SAYS NOTHING: a line in round brackets like "(he has said nothing for a long moment)" means exactly that. React like a person: "You still there?" "Are you all right, boy?" — in your own voice. If it happens again, you may lose patience and leave.
IF YOU ARE TOLD "(you cut him off mid-sentence)": you interrupted him. Answer what he had managed to say.`;

  const system = [
    who, WORLD,
    `YOU: ${god.persona}\nAfter all these years: ${god.years || ''}\nWhat your questions circle: ${god.asks}\n${god.feuds ? `Feuds: ${god.feuds}\n` : ''}Secret: ${god.secret || 'none'}\nWhat you want: ${god.wants}\nHow you sound: ${god.delivery || ''}`,
    where,
    hades && first ? '' : first ? `This is your first meeting. Say your name once, in passing, in your first two replies. Your first line is about him standing in front of you right now, said in your own manner — not a tally of his falls.`
      : `You have spoken before — the earlier conversation is below and you remember all of it. Do not reintroduce yourself.`,
    `It is ${when} on Olympus${body.storm ? ', and a storm is breaking over the summit' : ''}. He has met: ${met.length ? met.join(', ') : 'no one else yet'}.`,
    `WHAT YOU HAVE WATCHED HIM DO (you all see everything):
He has fallen to his death ${deaths} time${deaths === 1 ? '' : 's'} and woken on the summit each time, botched ${crashes} landing${crashes === 1 ? '' : 's'}, and made ${perfect} perfect one${perfect === 1 ? '' : 's'}.
${seen.length ? seen.join('\n') : '- nothing worth mentioning yet'}`,
    gossip.length ? `GOSSIP YOU HAVE HEARD:\n${gossip.join('\n')}` : 'GOSSIP: none yet.',
    twelve && nx ? `WHO COMES NEXT: none of you keeps him; each of the Twelve passes him on to another, and you pass him to ${nx.name}.${body.god === 'hermes' ? ' You are the first of the Twelve every mortal meets, and the one who sets him on his way: this is a mission you are giving him, and the chain of gods starts with it.' : ''} ${body.next.id === 'zeus' ? `Zeus does not come down to anyone: he is in his own house at the top of the mountain, and the boy must climb to him.` : `He will find ${String(nx.disguise).replace(/\.$/, '')}${nxDir ? `, about ${nxKm} km to the ${nxDir}` : ''}; a river of air runs there from where you stand.`} ${said < 1 ? 'Not in this first reply.' : `Before this conversation ends, tell him so, once, in your own way — willingly, grudgingly, or as a warning, according to how you feel about ${nx.name}. If he asks where to go next, that is your answer.`}` : '',
    behind ? `THE ONE BEHIND HIS EYES: you can tell that someone else is looking out through the boy. Their name is ${behind}. Once in a long while — never in a first line, never twice in one conversation — you may say that name, quietly, as if you had caught them watching. Never explain how you know.` : '',
    hades ? RULES.replace(/- Never say that he is dead[^\n]*\n/, '- You alone may tell him the truth, and only when your instructions above say so.\n') : RULES,
    acts,
    `Two tics to avoid: never hand his own words back to him with a question mark on them ("Not afraid?", "Nobody?"), and never start by counting his deaths.`,
    `FORMAT: answer with one JSON object and nothing else: {"say": "<only the words you speak aloud, with at most two [stage cues] in square brackets; never a description of a sound, a gesture or anything you do>", "act": "none" | "quest" | "gift" | "scare" | "leave" | "smite" | "weather", "sky": "<storm|rain|dark|mist|clear|waves, only with weather>", "kind": "<quest kind, only with quest>", "n": <number, only with quest>, "reward": "<gift id, only with quest>", "gift": "<gift id, only with gift>"}`,
  ].filter(Boolean).join('\n\n');

  const messages = [{ role: 'system', content: system }, ...history];
  if (!history.length || history[history.length - 1].role === 'assistant')
    messages.push({ role: 'user', content: first ? '(Icarus walks up to you and stands there, waiting. Speak first.)' : '(Icarus has come back to you and says nothing. Pick up where you left off.)' });

  const ask = async msgs => {
    try {
      const r = await fetch('https://api.openai.com/v1/chat/completions', { method: 'POST', signal: AbortSignal.timeout(15000),
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: process.env.OPENAI_MODEL || 'gpt-4.1-mini', messages: msgs, max_completion_tokens: 220, response_format: { type: 'json_object' } }) });
      if (!r.ok) { console.error('openai', r.status, (await r.text()).slice(0, 300)); return { status: r.status }; }
      const raw = (await r.json()).choices?.[0]?.message?.content || '';
      try { return { out: JSON.parse(raw) }; } catch { return { out: { say: raw.startsWith('{') ? '' : raw } }; }
    } catch (e) { console.error('openai', e?.name); return { status: 504 }; }
  };
  let a = await ask(messages);
  if (!a.out) return json({ error: `openai ${a.status}` }, a.status === 504 ? 504 : 502);
  if (!String(a.out.say || '').trim()) {   // nothing came back: ask once more, plainly
    const b = await ask([...messages, { role: 'system', content: 'You said nothing. Answer him now: one short line, in the JSON format.' }]);
    if (b.out) a = b;
  }
  const out = a.out;
  let text = tighten(clip(String(out.say || ''), 460).replace(/^["“]|["”]$/g, ''), out.act === 'quest', hades ? 70 : 0);   // (Hades has things he must say whole)
  // the same stage cue two lines running is a tic: the second one goes
  const lastCue = ([...history].reverse().find(m => m.role === 'assistant')?.content.match(/\[[^\]]*\]/) || [''])[0].toLowerCase();
  if (lastCue) text = text.replace(/\[[^\]]*\]\s*/g, m => m.trim().toLowerCase() === lastCue ? '' : m).trim();
  const res = { text, act: 'none' };
  if (!hades) {
    if (out.act === 'quest' && has(KINDS, out.kind) && has(GIFTS, out.reward) && SPOKEN[out.kind].test(text)) Object.assign(res, { act: 'quest', kind: out.kind, n: Math.max(1, Math.min(1500, Math.round(+out.n || 1))), reward: out.reward });
    else if (out.act === 'gift' && has(GIFTS, out.gift)) Object.assign(res, { act: 'gift', gift: out.gift });
    else if (out.act === 'leave') res.act = 'leave';
    else if (out.act === 'weather' && ['storm', 'rain', 'dark', 'mist', 'clear', 'waves'].includes(out.sky)) Object.assign(res, { act: 'weather', sky: out.sky });
    else if (out.act === 'scare') res.act = 'scare';
    else if (out.act === 'smite' && god.smites) res.act = 'smite';
    // the model is shy of its own teeth: a threat out of their mouth, or open defiance out of his, lands with the world reacting
    const his = [...history].reverse().find(m => m.role === 'user')?.content || '';
    if (res.act === 'none' && !body.scared && said >= 1 && (THREAT.test(text) || DEFY.test(his))) res.act = 'scare';
    res.loud = !!god.smites;
  }
  return json(res);
}
