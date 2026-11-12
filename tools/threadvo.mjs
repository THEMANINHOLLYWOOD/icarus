// Voices for the X thread videos: each line in a list file read aloud in its speaker's ElevenLabs voice.
// Usage: node tools/threadvo.mjs <list.json>   list = [[name, voiceId, text], …]   → tools/takes/thread/<name>.mp3
// Lines already recorded are skipped, so re-running costs nothing. Not deployed.
import { el } from './el.mjs';
import fs from 'node:fs';
const dir = '/Users/andres/Desktop/Coding/Icarus/tools/takes/thread'; fs.mkdirSync(dir, { recursive: true });
const list = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const vs = { stability: 0.4, similarity_boost: 0.8, style: 0.5, use_speaker_boost: true };
let total = 0;
for (const [name, voice, text] of list) {
  const out = `${dir}/${name}.mp3`;
  if (fs.existsSync(out)) { console.log(name, 'exists'); continue; }
  const r = await el(`/v1/text-to-speech/${voice}?output_format=mp3_44100_128`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, model_id: 'eleven_v4', voice_settings: vs }) });
  if (!r.ok) { console.log(name, r.status, (await r.text()).slice(0, 200)); if ([401, 402, 429].includes(r.status)) break; continue; }
  fs.writeFileSync(out, Buffer.from(await r.arrayBuffer()));
  const c = +(r.headers.get('character-cost') || 0); total += c; console.log(name, 'cost', c);
}
console.log('total', total);
