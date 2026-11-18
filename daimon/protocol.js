// What the hub and every world agree on. This file runs in Node and in the browser, and depends on nothing.
//
// A hub holds OWNERS (a person, known by a secret key). An owner has AGENTS (one per running agent session), and what
// those agents do raises SITES: one per repository, cut into BRANCHES (the git ones), each holding the FILES that were
// touched on it. An agent can ask its owner something (an APPROVAL), be told something (the INBOX), and keep what it
// has learned (NOTES: its own, or shared with every agent of that owner). Worlds are sent all of it as EVENTS.

export const VERSION = '0.1.0';
export const DEFAULT_PORT = 4747;
// the owner the demo's made-up agents work for (daimon demo): a key everyone knows, good for nothing else
export const DEMO_KEY = 'own_demo_demo_demo_demo_demo_demo';

// what an agent is doing, as a body would show it
export const STATUS = ['idle', 'thinking', 'working', 'waiting', 'blocked', 'done', 'offline'];
// what one action is: every world draws these, in its own way
export const KINDS = ['read', 'edit', 'write', 'run', 'test', 'search', 'fetch', 'commit', 'plan', 'spawn', 'other'];
// what an agent may ask its owner
export const ASKS = ['edit', 'command', 'question', 'plan', 'tool'];

export const LIMITS = {
  name: 24, task: 160, thought: 320, say: 600, target: 240, summary: 240, detail: 4000, question: 400,
  note: 4000, noteKey: 80, notes: 400, plan: 12, planItem: 120, files: 160, branches: 16, feed: 240, inbox: 40,
  agents: 64, tokens: 32, options: 6, option: 60, sites: 24, personas: 64, ownerFiles: 2400, anchors: 8, approvals: 200,
};

export const clip = (s, n) => (typeof s === 'string' ? s : s == null ? '' : String(s)).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim().slice(0, n);
export const oneLine = (s, n) => clip(s, n * 4).replace(/\s+/g, ' ').trim().slice(0, n);
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const int = (v, a, b, d = 0) => { const n = Math.round(+v); return Number.isFinite(n) ? clamp(n, a, b) : d; };

// one number out of a string: the same agent is the same colour and the same shape in every world
export function hash32(s) { let h = 2166136261; s = String(s); for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h >>> 0; }
// a random stream out of one number (mulberry32): worlds lay things out with it, and get the same thing every time
export function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// Names for agents that have not given one. A daimon, to the Greeks, was the spirit that attends a person: these are theirs.
export const NAMES = ['ATLAS', 'CALLIOPE', 'ORION', 'THALIA', 'CASTOR', 'IRIS', 'LYRA', 'MENTOR', 'NYX', 'PHOEBE', 'ZEPHYR', 'ECHO', 'HELIOS', 'CLIO', 'TALOS',
  'SELENE', 'TYCHE', 'AURA', 'EOS', 'PAN', 'ARGUS', 'DELIA', 'KLEIO', 'MUSE', 'ARIEL', 'CYGNUS', 'DORIS', 'EUDORA', 'GALENE', 'HEBE', 'IANTHE', 'KORE'];
export const cleanName = n => String(n || '').slice(0, 200).toUpperCase().replace(/[^A-Z0-9 ._-]/g, '').replace(/\s+/g, ' ').trim().slice(0, LIMITS.name);
export function nameFor(id, taken = new Set()) {
  const h = hash32(id);
  for (let i = 0; i < NAMES.length; i++) { const n = NAMES[(h + i) % NAMES.length]; if (!taken.has(n)) return n; }
  return `${NAMES[h % NAMES.length]} ${(h >>> 8) % 90 + 10}`;
}
// twelve colours a body can burn in, far enough apart to tell at a glance (hue, in degrees)
export const HUES = [38, 96, 152, 182, 208, 232, 268, 304, 332, 16, 60, 128];
export const hueFor = (id, i = 0) => HUES[(hash32(id) + i) % HUES.length];

// "src/hub/core.js" → "core.js"; a command → its first words
export const baseName = p => String(p || '').split(/[\\/]/).filter(Boolean).pop() || '';
export const slug = s => String(s || '').slice(0, 200).toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48) || 'scratch';

// How a tool of Claude Code's (or anything named like one) is drawn. Other agents name the kind themselves.
export function kindOfTool(tool, input = {}) {
  const t = String(tool || '');
  if (/^(Edit|MultiEdit|NotebookEdit|str_replace|apply_patch)/i.test(t)) return 'edit';
  if (/^(Write|create_file)/i.test(t)) return 'write';
  if (/^(Read|NotebookRead|view)/i.test(t)) return 'read';
  if (/^(Grep|Glob|LS|ToolSearch|search)/i.test(t)) return 'search';
  if (/^(WebFetch|WebSearch|fetch)/i.test(t)) return 'fetch';
  if (/^(Task|Agent)$/i.test(t)) return 'spawn';
  if (/^(TodoWrite|ExitPlanMode|EnterPlanMode|TaskCreate|TaskUpdate|update_plan)/i.test(t)) return 'plan';
  if (/^(Bash|BashOutput|shell|exec)/i.test(t)) {
    const c = String(input.command || '');
    if (/\bgit\s+commit\b/.test(c)) return 'commit';
    if (/\b(npm|pnpm|yarn|bun)\s+(run\s+)?test\b|\b(vitest|jest|pytest|mocha|ava|playwright test)\b|\bcargo\s+test\b|\bgo\s+test\b|\bnode\s+--test\b|\bdeno\s+test\b/.test(c)) return 'test';
    return 'run';
  }
  return 'other';
}
// what the action is about, in a few words (a path, a command, a pattern)
export function targetOfTool(tool, input = {}) {
  if (!input || typeof input !== 'object') return '';
  const v = input.file_path || input.path || input.notebook_path || input.command || input.pattern || input.url || input.query || input.description || input.prompt || '';
  return oneLine(v, LIMITS.target);
}
export const isFileKind = k => k === 'read' || k === 'edit' || k === 'write';

// the events a world is sent (see README: "The feed")
export const EVENTS = ['hello', 'agent', 'gone', 'act', 'thought', 'say', 'site', 'approval', 'note', 'fork', 'merge', 'link', 'boost', 'inbox', 'owner', 'runner'];
