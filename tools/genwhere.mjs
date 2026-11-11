// Icarus's first words on the mountain: "Where am I?" — two takes, judged by ear (the audio model), the better one kept.
// Writes tools/takes/where/where-<n>.mp3; installing into voice/ is a separate copy. Usage: node genwhere.mjs
import { el } from './el.mjs';
import { oa } from './oa.mjs';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
const dir = '/Users/andres/Desktop/Coding/Icarus/tools/takes/where'; fs.mkdirSync(dir, { recursive: true });
const HERO = 'bIHbv24MWmeRgasZH58o', vs = { stability: 0.4, similarity_boost: 0.8, style: 0.55, use_speaker_boost: true };
const text = '[dazed, frightened, barely above a breath, looking around] ...Where am I?';
let total = 0;
for (const n of [1, 2]) {
  const f = `${dir}/where-${n}.mp3`;
  if (!fs.existsSync(f)) {
    const r = await el(`/v1/text-to-speech/${HERO}?output_format=mp3_44100_128`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text, model_id: 'eleven_v4', voice_settings: vs }) });
    if (!r.ok) { console.log('take', n, r.status, (await r.text()).slice(0, 200)); break; }
    fs.writeFileSync(f, Buffer.from(await r.arrayBuffer())); total += +(r.headers.get('character-cost') || 0);
  }
  execFileSync('/opt/homebrew/bin/ffmpeg', ['-y', '-loglevel', 'error', '-i', f, '-ac', '1', '-ar', '24000', f.replace('.mp3', '.wav')]);
  const data = fs.readFileSync(f.replace('.mp3', '.wav')).toString('base64');
  const j = await (await oa('/v1/chat/completions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: 'gpt-audio-1.5', modalities: ['text'],
    messages: [{ role: 'system', content: 'You are a strict casting director reviewing voice recordings. Judge only what you hear. Be harsh.' },
      { role: 'user', content: [{ type: 'text', text: 'One take of a line for a frightened teenage boy who has just fallen out of the sky onto a frozen mountain in a storm and does not know where he is. Wanted: dazed, scared, quiet "Where am I?". Reply ONLY compact JSON: {"words":"exactly what is said","human":1-10,"fit":1-10,"note":"few words"}' },
        { type: 'input_audio', input_audio: { data, format: 'wav' } }] }] }) })).json();
  console.log('take', n, (j.choices?.[0]?.message?.content || JSON.stringify(j).slice(0, 200)).replace(/\s+/g, ' '));
}
console.log('characters', total);
