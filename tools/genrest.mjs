// The lines that were waiting on ElevenLabs credits: Icarus's three in the opening, and the storyteller's line for the Titans.
// Writes to tools/takes/rest/<name>-<take>.mp3; nothing in voice/ is touched. Usage: node genrest.mjs [take] [line]
import { el } from './el.mjs';
import fs from 'node:fs';
const dir = '/Users/andres/Desktop/Coding/Icarus/tools/takes/rest'; fs.mkdirSync(dir, { recursive: true });
const NARR = 'SAz9YHcvj6GT2YYXdXww', HERO = 'bIHbv24MWmeRgasZH58o';
const hero = { stability: 0.4, similarity_boost: 0.8, style: 0.55, use_speaker_boost: true }, narr = { stability: 0.5, similarity_boost: 0.8, style: 0.4, use_speaker_boost: true };
const list = [
  ['pi1', HERO, 'eleven_v4', hero, "[breathless, laughing in disbelief] We're out. Dad — we're out!"],
  ['pi2', HERO, 'eleven_v4', hero, '[shouting with joy, wind in his face] I can fly! Dad, look at me — I can fly!'],
  ['pi3', HERO, 'eleven_v4', hero, "[dreamy, quiet, half to himself] Just a little higher. It's so warm."],
  ['titans', NARR, 'eleven_v4_turbo', narr, '[quietly, close, a storyteller by a fire] Every age the Titans come back for the mountain. Every age they are stone by morning.'],
];
const take = process.argv[2] || '1', only = process.argv[3];
let total = 0;
for (const [name, voice, model, vs, text] of list) {
  if (only && only !== name) continue;
  if (fs.existsSync(`${dir}/${name}-${take}.mp3`)) { console.log(name, 'exists'); continue; }
  const r = await el(`/v1/text-to-speech/${voice}?output_format=mp3_44100_128`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text, model_id: model, voice_settings: vs }) });
  if (!r.ok) { console.log(name, r.status, (await r.text()).slice(0, 200)); if (r.status === 401 || r.status === 402 || r.status === 429) break; continue; }
  const b = Buffer.from(await r.arrayBuffer()); fs.writeFileSync(`${dir}/${name}-${take}.mp3`, b);
  const c = +(r.headers.get('character-cost') || 0); total += c; console.log(name, b.length, 'cost', c);
}
console.log('total', total);
