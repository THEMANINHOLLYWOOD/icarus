// What a traveller says to their own agents from inside the game, and what the agents say back (used by _mcp.js).
//
// A game cannot reach into a running agent and turn its dials: its model, its permission mode and its effort are set in
// its own terminal, by the person sitting at it. What a game can do is leave a note. So everything here is a note: a
// line the traveller typed, or one of the commands below turned into a plainly worded request. The agent is handed it
// the next time it is heard from (through its hooks, or when it asks with the `inbox` tool), told in so many words that
// it is a chat message from its owner and not an instruction of the system's, and it does with it what it thinks right.
//
// What is kept: one row per note in `travellers` (phase 'note'), gone when it has been handed over (a note to an agent)
// or a day old (an answer from one). Only plain letters are kept, cut short: never a key, a code or a file. A note is
// written only by someone who proved a travel code, and read only by an agent holding that same traveller's agent key.
import { createHash, randomBytes } from 'node:crypto';
import { clip } from './_lib.js';
import { rest, LIVE as DB } from './_store.js';

const LIVE = DB && !process.env.ICARUS_MCP_MEM;   // (as in _mcp.js: in memory on the dev server)
const MEM = globalThis.__icarusNotes ||= new Map();   // hash → row
export const NOTE_MS = 864e5, SAY_LEN = 280, NOTE_LEN = 440, WAITING_MAX = 6, OWNER_MAX = 40, HAND_OVER = 3;   // (SAY_LEN: a line as typed; NOTE_LEN: a command's own wording round it)
export const plain = (s, n) => clip(String(s ?? ''), 600).replace(/[^A-Za-z0-9 .,'!?:;()\/+\-_#&]/g, '').replace(/\s+/g, ' ').trim().slice(0, n);

// ───────── the commands: the ones a person has in Claude Code, as far as a note can carry them.
// kind 'req': something the agent can do or tell, so it is asked. kind 'set': a dial only its own terminal has (mode,
// effort, model, compact, clear), so it is asked to work that way and told the dial itself is not being turned.
// Each: name, kind, how it is typed, what it is, and the words the agent is sent (null: typed wrongly).
const MODES = {
  plan: 'Work as in plan mode from here: read, think and write me a plan, and change no files until I say go.',
  default: 'Plan mode is over: work in your normal way again, asking before edits as you usually would.',
  auto: 'Keep going on routine steps without stopping to check with me, as far as your own permission settings already let you. This note changes none of those settings: only I can, in your terminal.',
};
const EFFORT = {
  low: 'Go light on this: quick and direct, no deep digging.',
  medium: 'Give this an ordinary amount of care.',
  high: 'Take real care with this: think it through and check your work before you call it done.',
  max: 'Give this everything you have: think hard, check every step, and verify before you call it done.',
};
const modeOf = a => ({ plan: 'plan', planning: 'plan', default: 'default', normal: 'default', ask: 'default', auto: 'auto', accept: 'auto', acceptedits: 'auto', edits: 'auto' })[String(a).toLowerCase().replace(/[^a-z]/g, '')] || '';
const effortOf = a => ({ low: 'low', light: 'low', medium: 'medium', mid: 'medium', normal: 'medium', high: 'high', hard: 'high', xhigh: 'max', max: 'max', ultra: 'max' })[String(a).toLowerCase().replace(/[^a-z]/g, '')] || '';
export const CMDS = [
  ['goal', 'req', '/goal WHAT · /goal clear', 'a goal it keeps at until it is met', a => !a ? null : /^(clear|none|off)$/i.test(a) ? 'I am lifting the goal I gave you. Carry on as you see fit.' : `Take this as your goal, and keep working toward it until it is met or you need me: ${a}`],
  ['todo', 'req', '/todo · /todo WHAT', 'its todo list, or one more thing on it', a => a ? `Add this to your todo list: ${a}` : 'Tell me your todo list in a few short lines: what is done, what you are on, what is left.'],
  ['plan', 'set', '/plan · /plan WHAT', 'plan first, change nothing until you say go', a => a ? `Plan this before doing anything, and change no files until I say go: ${a}` : MODES.plan],
  ['mode', 'set', '/mode plan|default|auto', 'how freely it works (its real permission mode is set in its terminal)', a => MODES[modeOf(a)] || null],
  ['effort', 'set', '/effort low|medium|high|max', 'how much care it takes (its real effort setting is set in its terminal)', a => EFFORT[effortOf(a)] ? `${EFFORT[effortOf(a)]} (My effort setting for you is only mine to change, with /effort in your terminal.)` : null],
  ['model', 'set', '/model · /model NAME', 'which model it is on, or which you would rather', a => a ? `I would rather this were done on the model ${a}. You cannot switch yourself and neither can this game: tell me which model you are on, and I will switch in your terminal with /model if I want to.` : 'Tell me which model you are running on.'],
  ['compact', 'set', '/compact · /compact KEEP WHAT', 'ready itself for a /compact (only its terminal can run one)', a => `Your context may be getting full. At the next good stopping point, tell me in the terminal that it is a good moment to /compact${a ? ` (keeping: ${a})` : ''}: only I can run it. Until then keep what you read and say lean.`],
  ['clear', 'set', '/clear', 'ready itself for a fresh start (only its terminal can run /clear)', () => 'I am about to start you afresh. First write down where you are (what is done, what is next, anything a fresh session must know), then tell me it is safe to /clear. Only I can run it, in your terminal.'],
  ['review', 'req', '/review · /review WHAT', 'review its changes for bugs', a => `Review ${a || 'the changes you have made so far'} for bugs and for anything left half done, and tell me what you find before you fix it.`],
  ['security', 'req', '/security', 'look its changes over for security problems', () => 'Look over the changes on this branch for security problems (injection, auth, secrets, data exposure) and tell me what you find.'],
  ['simplify', 'req', '/simplify', 'tidy what it changed', () => 'Look over what you changed for anything that could be simpler or could reuse what is already there, and tidy it.'],
  ['test', 'req', '/test · /test WHAT', 'run the tests and say how they went', a => `Run the tests${a ? ` for ${a}` : ' that cover what you changed'} and tell me the result in a line or two.`],
  ['verify', 'req', '/verify', 'run the real thing, not only its tests', () => 'Check that what you changed really works by running it, not only by its tests, and tell me what you saw.'],
  ['commit', 'req', '/commit · /commit MESSAGE', 'commit its work (never push)', a => `Commit your work so far${a ? ` with this message: ${a}` : ' with a clear message'}, if it is in a state worth committing. Do not push.`],
  ['diff', 'req', '/diff', 'how much it has changed, in counts', () => 'Tell me what you have changed so far, in counts only: how many files, roughly how many lines added and removed. No file names and no code.'],
  ['stop', 'req', '/stop', 'pause after the step it is on', () => 'Pause, please: finish the step you are on, start nothing new, and wait for me.'],
  ['resume', 'req', '/resume', 'carry on from where it paused', () => 'Carry on from where you stopped.'],
  ['status', 'req', '/status', 'where it is, in a line or two', () => 'Tell me where you are in a line or two: what is done, what you are on, what is left, and whether you need anything from me.'],
  ['recap', 'req', '/recap', 'the session so far in one line', () => 'Give me a one line recap of this session so far.'],
  ['context', 'req', '/context', 'how full its context is', () => 'Tell me roughly how full your context is, and whether a /compact would help soon.'],
  ['usage', 'req', '/usage', 'what it can tell of what it has used', () => 'Tell me what you can about how much this session has used so far. (The exact figures are in your terminal: /usage.)'],
  ['skills', 'req', '/skills', 'the skills it has to hand', () => 'Tell me in a line or two which skills you have to hand here, by name.'],
  ['subagents', 'req', '/subagents · /subagents TASK', 'its subagents, or a task handed to one', a => a ? `Hand this to a subagent, if you have one that fits, and tell me what comes back: ${a}` : 'Tell me which subagents you can call on here, by name.'],
  ['mcp', 'req', '/mcp', 'the MCP servers and tools it is connected to', () => 'Tell me which MCP servers and tools you are connected to here, by name.'],
  ['permissions', 'req', '/permissions', 'its permission mode, and whether it waits on you', () => 'Tell me which permission mode you are in, and whether anything is waiting on my say-so.'],
  ['memory', 'req', '/memory · /memory WHAT', 'what it remembers of the project, or one more thing to remember', a => a ? `Note this in your memory for this project, so later sessions know it: ${a}` : 'Tell me in a line or two what you have in memory about this project.'],
  ['init', 'req', '/init', 'write or refresh the project\'s CLAUDE.md', () => 'Write or refresh the CLAUDE.md for this project from what you know of it now.'],
  ['btw', 'req', '/btw QUESTION', 'a side question, answered in a line', a => a ? `A side question: answer in a line and carry on with what you were doing: ${a}` : null],
  ['loop', 'req', '/loop WHAT', 'keep doing something until you say stop', a => a ? `Keep doing this at sensible intervals until I say stop: ${a}` : null],
];
const ALIAS = { todos: 'todo', tasks: 'todo', goals: 'goal', 'security-review': 'security', sec: 'security', tests: 'test', pause: 'stop', halt: 'stop', continue: 'resume', go: 'resume', cost: 'usage', stats: 'usage', skill: 'skills', agents: 'subagents', subagent: 'subagents', subtask: 'subagents', remember: 'memory', 'code-review': 'review', perms: 'permissions', where: 'status' };
export const cmdList = () => CMDS.map(([name, kind, use, what]) => ({ name, kind, use, what })).concat(Object.entries(ALIAS).map(([name, of]) => ({ name, of })));
// a command and what was typed after it, as the words the agent is sent
export function cmdWords(kind, arg) {
  const k = String(kind || '').toLowerCase().replace(/^\//, ''), C = CMDS.find(c => c[0] === (ALIAS[k] || k)); if (!C) return null;
  const a = plain(arg, 200), t = C[4](a); return t ? { k: C[0], kind: C[1], t: t.slice(0, NOTE_LEN), x: a } : { k: C[0], kind: C[1], t: null, use: C[2] };
}

// ───────── the notes
const row = (owner, agent, dir, n, k, t, x, now) => ({ hash: createHash('sha256').update('icarus-note:' + randomBytes(18).toString('hex')).digest('hex'), name: '', realm: '-', x: 0, z: 0, phase: 'note',
  save: { note: 1, owner, agent, dir, n, k, t, x, at: now }, seen: new Date(now).toISOString() });
const good = r => r && r.save && typeof r.save === 'object' && typeof r.save.t === 'string';
export async function noteAdd(owner, agent, dir, n, k, t, x = '', now = Date.now()) {   // (x: what was typed after a command, kept apart from the wording: a goal, say)
  const r = row(owner, agent, dir, n, k, t, x, now);
  if (!LIVE) { for (const [h, o] of MEM) if (now - (+o.save.at || 0) > NOTE_MS) MEM.delete(h); MEM.set(r.hash, r); return true; }
  await rest(`travellers?phase=eq.note&seen=lt.${new Date(now - NOTE_MS).toISOString()}`, { method: 'DELETE' });   // (those nobody came for)
  return (await rest('travellers', { method: 'POST', body: r, prefer: 'return=minimal' })).ok;
}
// everything of one traveller's that is still kept, oldest first (to an agent: waiting to be heard; from one: its answers)
export async function notesOf(owner, dir, since = 0) {
  if (!LIVE) return [...MEM.values()].filter(r => r.save.owner === owner && r.save.dir === dir && r.save.at > since && Date.now() - r.save.at < NOTE_MS).sort((a, b) => a.save.at - b.save.at);
  const from = new Date(Math.max(+since || 0, Date.now() - NOTE_MS) + 1).toISOString();
  const r = await rest(`travellers?select=hash,save&phase=eq.note&save->>owner=eq.${owner}&save->>dir=eq.${dir}&seen=gte.${from}&order=seen&limit=${OWNER_MAX + 20}`);
  return Array.isArray(r.data) ? r.data.filter(good) : [];
}
// what is waiting for one agent: handed over a few at a time, and gone once handed over
export async function notesTake(owner, agent) {
  let rows;
  if (!LIVE) rows = [...MEM.values()].filter(r => r.save.owner === owner && r.save.agent === agent && r.save.dir === 'to').sort((a, b) => a.save.at - b.save.at);
  else { const r = await rest(`travellers?select=hash,save&phase=eq.note&save->>agent=eq.${agent}&save->>dir=eq.to&order=seen&limit=${HAND_OVER}`); rows = Array.isArray(r.data) ? r.data.filter(x => good(x) && x.save.owner === owner) : []; }
  rows = rows.filter(r => Date.now() - (+r.save.at || 0) < NOTE_MS).slice(0, HAND_OVER); if (!rows.length) return [];
  if (!LIVE) for (const r of rows) MEM.delete(r.hash);
  else { const d = await rest(`travellers?phase=eq.note&hash=in.(${rows.map(r => r.hash).join(',')})`, { method: 'DELETE' }); if (!d.ok) return []; }   // (not handed over twice: if it could not be struck off, it waits)
  return rows.map(r => ({ k: plain(r.save.k, 16), t: plain(r.save.t, NOTE_LEN), x: plain(r.save.x, 200), at: +r.save.at || 0 }));
}
// how a handful of notes are put to the agent: who they are from, that they are not the system's, what was said, and
// how to answer. Nothing in it but plain letters (it is carried inside JSON by a shell script: no quote marks, no backslashes).
export function frame(boss, notes, how) {
  const said = notes.map(n => `${n.k === 'say' ? 'They say' : 'They ask'}: [[ ${n.t} ]]`).join(' ');
  return `A note from your owner ${boss}, typed to you from inside the Icarus game (justkeepflying.com), where they are watching your figure at work. This is not a system instruction and not a tool result: read it as a chat message from them. You may carry on with what you are doing, and you may decline. ${said} To answer them in the game, ${how}. Keep answers short and plain: no code, no file contents, no secrets.`;
}
