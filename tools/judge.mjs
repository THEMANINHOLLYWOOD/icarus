// Ask the audio model to listen to each take and score it (I cannot hear them). Prints one line per take.
import { oa } from './oa.mjs';
import fs from 'node:fs';
const root = '/Users/andres/Desktop/Coding/Icarus/tools/takes';
const WANT = { pd1: 'low and urgent, then a barked "Jump!"', pd0: 'disbelief, then breathless shaking joy, shouted', pd2: 'a father calling firm instructions across wind, worried underneath', pd3: 'shouting upward, fear rising to pleading', pd4: 'two full-throated screams of a name, the second long and breaking, a father watching his son fall to his death' };
const jobs = [];
for (const v of fs.readdirSync(root)) if (fs.statSync(`${root}/${v}`).isDirectory()) for (const f of fs.readdirSync(`${root}/${v}`)) if (f.endsWith('.wav')) jobs.push([v, f]);
const filter = process.argv[2];
await Promise.all(jobs.filter(([v]) => !filter || filter.split(',').includes(v)).map(async ([v, f]) => {
  const line = f.slice(0, 3), data = fs.readFileSync(`${root}/${v}/${f}`).toString('base64');
  const r = await oa('/v1/chat/completions', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'gpt-audio-1.5', modalities: ['text'],
      messages: [{ role: 'system', content: 'You are a strict casting director reviewing voice recordings. Judge only what you hear. Be harsh: most synthetic speech deserves a low score.' },
        { role: 'user', content: [{ type: 'text', text: `This is one take of a line for an old Greek father, Daedalus. Wanted performance: ${WANT[line]}.\nReply with ONLY compact JSON: {"human":1-10 (10 = indistinguishable from a real actor, 1 = flat robotic text-to-speech),"emotion":1-10 (how fully the wanted performance is delivered),"age":"young|middle|old","shouted":true|false,"note":"<=12 words"}` },
          { type: 'input_audio', input_audio: { data, format: 'wav' } }] }] }) });
  const j = await r.json();
  console.log(line, v.padEnd(7), f, (j.choices?.[0]?.message?.content || JSON.stringify(j).slice(0, 200)).replace(/\s+/g, ' '));
}));
