// The owner's words, turned into the owner's controls — the same in every world, typed or spoken.
//   typed(world, 'bless atlas 20')        what follows a world's own command prefix (/agents …, or a chat box)
//   spoken(world, 'tell atlas to run the tests')   plain speech; answers null when it was not about the agents at all
// Both come back with lines for the world to show however it shows things.
const names = world => [...world.state.agents.values()].filter(a => !a.parentId).map(a => a.name);
const fmtAgent = a => `${a.name} · ${a.status}${a.branch ? ` · ${a.branch}` : ''}${a.task ? ` · ${a.task}` : ''}`;
const fail = e => [e.message || String(e)];

export const HELP = [
  '@NAME words · say something to one agent      ALL words · to every agent',
  'YES · NO reason · answer what an agent is asking (the oldest first)',
  'BLESS NAME minutes · what it asks is granted for a while      UNBLESS NAME',
  'SHARE A B · hand what A knows to B      SEND task · start a new agent (needs: daimon run)',
  'WHO · what they are all doing      STOP NAME · DISMISS NAME      LINK · connect a new agent',
];

export async function typed(world, raw) {
  const text = String(raw || '').trim(), m = /^(\S+)\s*([\s\S]*)$/.exec(text); if (!m) return [];
  const c = m[1].toLowerCase().replace(/^\//, ''), arg = m[2].trim(), two = arg.split(/\s+/);
  try {
    if (c.startsWith('@')) { if (!arg) return ['@NAME and then what to tell it']; const r = await world.prompt(c.slice(1), arg); return [`told ${r.to.join(', ')}`]; }
    switch (c) {
      case 'help': case '?': return HELP;
      case 'who': case 'status': case 'list': { const all = [...world.state.agents.values()].sort((a, b) => a.depth - b.depth); return all.length ? all.map(a => (a.parentId ? '  ↳ ' : '') + fmtAgent(a)) : ['no agents are connected · LINK to connect one']; }
      case 'yes': case 'y': case 'approve': case 'ok': { const r = await world.approve(undefined, arg); return [`approved · ${r.approval.name}: ${r.approval.title}${r.left ? ` · ${r.left} more waiting` : ''}`]; }
      case 'no': case 'n': case 'deny': { const r = await world.deny(undefined, arg); return [`denied · ${r.approval.name}: ${r.approval.title}`]; }
      case 'all': case 'everyone': { if (!arg) return ['ALL and then what to tell them']; const r = await world.prompt('*', arg); return [`told ${r.to.join(', ')}`]; }
      case 'tell': { const who = two[0], what = arg.slice(who.length).trim().replace(/^to\s+/i, ''); if (!who || !what) return ['TELL NAME what to do']; const r = await world.prompt(who, what); return [`told ${r.to.join(', ')}`]; }
      case 'bless': case 'boost': { if (!two[0]) return ['BLESS NAME minutes']; const r = await world.boost(two[0], +two[1] || 10); return [`${r.name} is blessed · what it asks is granted for ${+two[1] || 10} minutes`]; }
      case 'unbless': { const r = await world.boost(two[0], 0); return [`${r.name} asks again before it acts`]; }
      case 'share': { if (two.length < 2) return ['SHARE A B · what A knows goes to B']; const r = await world.link(two[0], two[1]); return [`${r.from} → ${r.to} · ${r.notes} note${r.notes === 1 ? '' : 's'} and what it is doing`]; }
      case 'send': case 'spawn': { if (!arg) return ['SEND and then what the new agent should do']; await world.spawn(arg); return ['a new agent is on its way']; }
      case 'stop': { const r = await world.stop(two[0]); return [r.ok ? 'stopped' : 'that one is not held by a runner: stop it where it runs']; }
      case 'dismiss': { await world.dismiss(two[0]); return ['sent home']; }
      default: {   // a name first, then words: "atlas run the tests"
        const a = world.agentBy(c.replace(/[,:]$/, '')); if (a && arg) { const r = await world.prompt(a.id, arg); return [`told ${r.to.join(', ')}`]; }
        return null;
      }
    }
  } catch (e) { return fail(e); }
}

// Speech. Only what is plainly meant for the agents is taken: this answers null at once when the words were not about
// them (so the world can do what it always did with them), and otherwise a promise of lines to show.
export function spoken(world, raw) {
  const text = String(raw || '').trim().replace(/[.!?]+$/, ''), low = text.toLowerCase(), n = low.split(/\s+/).length;
  const pend = world.pending(), is = w => !!world.agentBy(w) && names(world).some(x => x.replace(/[^A-Z0-9]/g, '').toLowerCase().startsWith(String(w).toLowerCase()));
  const go = fn => fn().catch(fail);
  let m;
  if (pend.length && /^(no|deny)[, ]+(.{3,})$/.test(low)) return go(async () => { const r = await world.deny(undefined, text.replace(/^(no|deny)[, ]+/i, '')); return [`denied · ${r.approval.name}`]; });
  if (pend.length && n <= 4) {
    if (/^(yes|yeah|yep|approve(d)?|allow( it)?|do it|go ahead|ok(ay)?|granted)\b/.test(low)) return go(async () => { const r = await world.approve(); return [`approved · ${r.approval.name}`]; });
    if (/^(no|nope|deny|denied|don'?t|stop that|refuse)\b/.test(low)) return go(async () => { const r = await world.deny(); return [`denied · ${r.approval.name}`]; });
  }
  if ((m = /^(?:send|start|spawn|summon|make) (?:an?|another|a new) (?:agent|daimon)(?: to| that will| and have it)? (.+)$/i.exec(text))) return go(async () => { await world.spawn(m[1]); return ['a new agent is on its way']; });
  if ((m = /^(?:bless|supercharge|empower|boost) (\w+)(?: for (\d+) minutes?)?$/i.exec(text)) && is(m[1])) return go(async () => { const r = await world.boost(m[1], +m[2] || 10); return [`${r.name} is blessed`]; });
  if ((m = /^(?:have |let )?(\w+) (?:share|teach|tell what it knows)(?: (?:with|to))? (\w+)$/i.exec(text)) && is(m[1]) && is(m[2])) return go(async () => { const r = await world.link(m[1], m[2]); return [`${r.from} → ${r.to}`]; });
  if (/^(what are (my|the) (agents|daimons) doing|(agents?|daimons?),? (status|report)|who is working)\b/.test(low)) return typed(world, 'who');
  if (!world.state.agents.size) return null;
  if ((m = /^(?:agents|daimons|everyone|all of you)[, ]+(.+)$/i.exec(text))) return go(async () => { const r = await world.prompt('*', m[1]); return [`told ${r.to.join(', ')}`]; });
  if ((m = /^(?:tell|ask|have) (\w+) (?:to |that )?(.+)$/i.exec(text)) && is(m[1])) return go(async () => { const r = await world.prompt(m[1], m[2]); return [`told ${r.to.join(', ')}`]; });
  if ((m = /^(\w+)[, ]+(.+)$/i.exec(text)) && is(m[1])) return go(async () => { const r = await world.prompt(m[1], m[2]); return [`told ${r.to.join(', ')}`]; });
  return null;
}
