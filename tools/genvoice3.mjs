// the prologue: Icarus's own lines over the sea (pi1-pi4), in his ElevenLabs voice. Needs credits; skips clips already recorded.
// Run from this folder: node genvoice3.mjs — then deploy. The scene plays each line only once its clip exists.
import { el } from './el.mjs';
import fs from 'node:fs';
const out = '/Users/andres/Desktop/Coding/Icarus/voice';
const DAD = 'pqHfZKP75CvOlQylNhV4', HERO = 'bIHbv24MWmeRgasZH58o';
const list = [
  ['pi1', HERO, "[breathless, laughing in disbelief] We're out. Dad — we're out!"],
  ['pi2', HERO, '[shouting with joy, wind in his face] I can fly! Dad, look at me — I can fly!'],
  ['pi3', HERO, "[dreamy, quiet, half to himself] Just a little higher. It's so warm."],
];
let total = 0;
for (const [name, voice, text] of list) {
  if (fs.existsSync(`${out}/${name}.mp3`)) { console.log(name, 'exists'); continue; }
  const r = await el(`/v1/text-to-speech/${voice}?output_format=mp3_44100_128`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, model_id: 'eleven_v4', voice_settings: { stability: 0.4, similarity_boost: 0.8, style: 0.55, use_speaker_boost: true } }) });
  if (!r.ok) { console.log(name, r.status, (await r.text()).slice(0, 140)); if (r.status === 401 || r.status === 402 || r.status === 429) break; continue; }
  const b = Buffer.from(await r.arrayBuffer()); fs.writeFileSync(`${out}/${name}.mp3`, b);
  const c = +(r.headers.get('character-cost') || 0); total += c; console.log(name, b.length, 'cost', c);
}
console.log('total', total);
