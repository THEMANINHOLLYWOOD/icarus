// The storyteller's line after the first flight, re-recorded without Mykonos: Hermes is the first stop for everyone.
import { el } from './el.mjs';
import fs from 'node:fs';
const NARR = 'SAz9YHcvj6GT2YYXdXww', out = '/Users/andres/Desktop/Coding/Icarus/tools/takes/gi3'; fs.mkdirSync(out, { recursive: true });
const text = '[quietly, close, a storyteller by a fire] Hermes is waiting below the clouds. Every one of them starts with him. Dive, and go and talk to Hermes.';
for (let k = 1; k <= 2; k++) {
  const r = await el(`/v1/text-to-speech/${NARR}?output_format=mp3_44100_128`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, model_id: 'eleven_v4_turbo', voice_settings: { stability: 0.5, similarity_boost: 0.8, style: 0.4, use_speaker_boost: true } }) });
  if (!r.ok) { console.log(k, r.status, (await r.text()).slice(0, 200)); continue; }
  const b = Buffer.from(await r.arrayBuffer()); fs.writeFileSync(`${out}/gi3-${k}.mp3`, b); console.log(k, b.length, 'cost', r.headers.get('character-cost'));
}
