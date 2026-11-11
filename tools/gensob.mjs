// The end: Icarus on his knees, weeping. Two ways of making it, so the better one can be kept. Writes to tools/takes/sob/.
import { el } from './el.mjs';
import fs from 'node:fs';
const dir = '/Users/andres/Desktop/Coding/Icarus/tools/takes/sob'; fs.mkdirSync(dir, { recursive: true });
const HERO = 'bIHbv24MWmeRgasZH58o';
const jobs = [
  ['fx1', () => el('/v1/sound-generation?output_format=mp3_44100_128', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: 'A young man on his knees, breaking down and quietly sobbing; ragged, shaking breaths and choked sobs, close and intimate, no music, no words', duration_seconds: 11, prompt_influence: 0.6 }) })],
  ['fx2', () => el('/v1/sound-generation?output_format=mp3_44100_128', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: 'Close-up recording of a teenage boy crying softly, hitching breaths, quiet sobs muffled into his hands, silent room', duration_seconds: 11, prompt_influence: 0.6 }) })],
  ['tts1', () => el(`/v1/text-to-speech/${HERO}?output_format=mp3_44100_128`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: '[breaking down, crying quietly] [shaky breath] ...Dad. [sobbing] [ragged breaths] [crying softly]', model_id: 'eleven_v4', voice_settings: { stability: 0.3, similarity_boost: 0.8, style: 0.7, use_speaker_boost: true } }) })],
];
for (const [name, go] of jobs) {
  if (fs.existsSync(`${dir}/${name}.mp3`)) { console.log(name, 'exists'); continue; }
  const r = await go();
  if (!r.ok) { console.log(name, r.status, (await r.text()).slice(0, 200)); continue; }
  const b = Buffer.from(await r.arrayBuffer()); fs.writeFileSync(`${dir}/${name}.mp3`, b);
  console.log(name, b.length, 'bytes, cost', r.headers.get('character-cost'));
}
