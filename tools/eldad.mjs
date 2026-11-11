// Daedalus's five prologue lines in his own ElevenLabs voice (the one that calls for Icarus at the end of the game).
// Writes to tools/takes/el/ — nothing in voice/ is touched. Stops at the first quota error. Usage: node eldad.mjs [take] [line]
import { el } from './el.mjs';
import fs from 'node:fs';
const dir = '/Users/andres/Desktop/Coding/Icarus/tools/takes/el'; fs.mkdirSync(dir, { recursive: true });
const DAD = 'pqHfZKP75CvOlQylNhV4';
const list = [
  ['pd0', "[breathless, quiet, disbelieving] We're out. [then shouting over the wind with a shaking laugh] We're out, my boy!"],
  ['pd1', "[low, urgent, tight with held breath] Now, Icarus. [barking] Jump! [calling after him] Don't look down!"],
  ['pd3', '[shouting upward, alarmed] Icarus! Not so high! [more frightened] Come down! [pleading, voice cracking] Come back to me!'],
  ['pd4', '[screaming in horror at the top of his lungs] Icarus! [pause] [a long, torn, breaking scream, voice cracking] ICAAARUS!'],
  ['pd2', '[calling loudly across the wind, firm, worried underneath] Stay close to me! Not too low — the sea will drag at the feathers. Not too high — the sun will take the wax!'],
];
const take = process.argv[2] || '1', only = process.argv[3];
let total = 0;
for (const [name, text] of list) {
  if (only && only !== name) continue;
  if (fs.existsSync(`${dir}/${name}-${take}.mp3`)) { console.log(name, 'exists'); continue; }
  const r = await el(`/v1/text-to-speech/${DAD}?output_format=mp3_44100_128`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, model_id: 'eleven_v4', voice_settings: { stability: 0.35, similarity_boost: 0.8, style: 0.6, use_speaker_boost: true } }) });
  if (!r.ok) { console.log(name, r.status, (await r.text()).slice(0, 220)); if (r.status === 401 || r.status === 402 || r.status === 429) break; continue; }
  const b = Buffer.from(await r.arrayBuffer()); fs.writeFileSync(`${dir}/${name}-${take}.mp3`, b);
  const c = +(r.headers.get('character-cost') || 0); total += c; console.log(name, b.length, 'cost', c);
}
console.log('total', total);
