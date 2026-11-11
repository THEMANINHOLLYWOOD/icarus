// Have an audio model listen to every recorded take (I cannot hear them) and score it against what it is meant to be.
// Writes tools/takes/sfx/judge.json: { "<name>-<n>": { real, fit, even, note } }.
import { oa } from './oa.mjs';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
const dir = process.argv[2] || '/Users/andres/Desktop/Coding/Icarus/tools/takes/sfx', out = `${dir}/judge.json`;
const MEANT = {
  flap: 'one huge wing downstroke of a giant burning bird', wingsopen: 'giant wings snapping open like a parachute', ignite: 'a man bursting into flame', rebirth: 'a fireball explosion becoming a phoenix',
  morph: 'a magical shape-change, rising shimmer and swell', impact: 'a body hitting rock after a long fall', splash: 'a burning bird diving into a lake: splash, steam hiss, plunge', roll: 'a man crash-landing and rolling on grass',
  flameout: 'fire guttering out', thunder: 'a thunderclap and rolling rumble over mountains', underworld: 'plunging through water into a vast dark cavern, low drone', step: 'ONE footstep of a sandal on grass/earth',
  stepstone: 'ONE footstep of a sandal on stone', land: 'landing on both feet after a jump', jump: 'pushing off into a jump: scuff and cloth', leaves: 'crashing through a leafy tree crown',
  grab: 'a hand grabbing a rough rock hold', bark: 'gripping and climbing a tree trunk', whoosh: 'a fire bird rushing past close, doppler', crack: 'lightning striking a few metres away',
  surge: 'a wave building and crashing on a shore', windloop: 'steady strong high-altitude wind, constant', diveloop: 'plummeting: hard constant roaring wind with a thin whistle', fallloop: 'freefall wind with cloth flapping, constant',
  fireloop: 'a big fire burning steadily, constant', rainloop: 'heavy steady rain on rock and grass', waterloop: 'small waves lapping a pebble shore, constant',
};
const done = fs.existsSync(out) ? JSON.parse(fs.readFileSync(out, 'utf8')) : {};
const files = fs.readdirSync(dir).filter(f => /^[a-z]+-\d+\.mp3$/.test(f) && !done[f.replace('.mp3', '')]);
let i = 0;
async function worker() {
  while (i < files.length) {
    const f = files[i++], id = f.replace('.mp3', ''), name = id.replace(/-\d+$/, ''), loop = name.endsWith('loop');
    const wav = `/tmp/claude-501/j-${id}.wav`;
    execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', `${dir}/${f}`, '-ac', '1', '-ar', '24000', ...(loop ? ['-t', '8'] : []), wav]);
    const ask = `This is a game sound effect meant to be: ${MEANT[name]}. Judge harshly, like a film sound designer rejecting stock library sounds.
Reply ONLY compact JSON: {"real":1-10 (sounds like a real recorded event, not synthetic or generic),"fit":1-10 (how exactly it matches what it is meant to be),"even":1-10 (${loop ? 'how constant and loopable: no distinct events or swells' : 'how clean: one event, no extra junk'}),"music":true|false,"voice":true|false,"note":"<=10 words"}`;
    try {
      const r = await oa('/v1/chat/completions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: 'gpt-audio-1.5', modalities: ['text'],
        messages: [{ role: 'user', content: [{ type: 'text', text: ask }, { type: 'input_audio', input_audio: { data: fs.readFileSync(wav).toString('base64'), format: 'wav' } }] }] }) });
      const j = await r.json(), txt = j.choices?.[0]?.message?.content || '';
      const m = txt.match(/\{[\s\S]*\}/); done[id] = m ? JSON.parse(m[0]) : { err: txt.slice(0, 80) };
    } catch (e) { done[id] = { err: String(e).slice(0, 80) }; }
    console.log(id, JSON.stringify(done[id]));
  }
}
await Promise.all([worker(), worker(), worker(), worker()]);
fs.writeFileSync(out, JSON.stringify(done, null, 1));
