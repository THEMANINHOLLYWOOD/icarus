// Ask the audio model which take sounds most like a real person weeping (I cannot listen). Usage: node judgesob.mjs
import { oa } from './oa.mjs';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
const dir = '/Users/andres/Desktop/Coding/Icarus/tools/takes/sob';
for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.mp3'))) {
  const wav = `${dir}/${f}.wav`; execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', `${dir}/${f}`, '-ac', '1', '-ar', '24000', wav]);
  for (let k = 0; k < 2; k++) {
    const r = await oa('/v1/chat/completions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: 'gpt-audio-1.5', modalities: ['text'],
      messages: [{ role: 'system', content: 'You are a strict sound designer. Judge only what you hear.' }, { role: 'user', content: [{ type: 'text', text: 'This is meant to be a young man quietly weeping on his knees: real sobs, shaky breath, no words except perhaps one. Reply ONLY compact JSON: {"real":1-10,"crying":1-10,"words":"any words heard or none","artifacts":"music/noise/robotic, or none","note":"<=12 words"}' }, { type: 'input_audio', input_audio: { data: fs.readFileSync(wav).toString('base64'), format: 'wav' } }] }] }) });
    const j = await r.json(); console.log(f, (j.choices?.[0]?.message?.content || JSON.stringify(j).slice(0, 160)).replace(/\s+/g, ' '));
  }
}
