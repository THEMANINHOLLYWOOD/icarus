// Which thunder takes sound real and huge (I cannot listen). Usage: node judgethunder.mjs
import { oa } from './oa.mjs';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
const dir = '/Users/andres/Desktop/Coding/Icarus/tools/takes/sfx';
for (const f of fs.readdirSync(dir).filter(f => /^(thunder|crack)-\d\.mp3$/.test(f))) {
  const wav = `/private/tmp/claude-501/-Users-andres-Desktop-Coding-Icarus/3bd16d09-2e69-45c2-a074-817952da89e2/scratchpad/${f}.wav`;
  execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', `${dir}/${f}`, '-ac', '1', '-ar', '24000', wav]);
  const r = await oa('/v1/chat/completions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: 'gpt-audio-1.5', modalities: ['text'],
    messages: [{ role: 'system', content: 'You are a strict film sound designer. Judge only what you hear.' }, { role: 'user', content: [{ type: 'text', text: 'Rate this thunder / lightning sound for a cinematic storm scene. Reply ONLY compact JSON: {"real":1-10,"power":1-10,"close":true|false,"artifacts":"none or what","note":"<=10 words"}' }, { type: 'input_audio', input_audio: { data: fs.readFileSync(wav).toString('base64'), format: 'wav' } }] }] }) });
  const j = await r.json(); console.log(f, (j.choices?.[0]?.message?.content || JSON.stringify(j).slice(0, 150)).replace(/\s+/g, ' '));
}
