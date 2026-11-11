// Daedalus in the prologue, recorded with OpenAI's speech model while the ElevenLabs quota is out
import { oa } from './oa.mjs';
import fs from 'node:fs';
const out = '/Users/andres/Desktop/Coding/Icarus/voice';
const WHO = 'Voice: Daedalus, an old Greek craftsman in his sixties — weathered, warm, gravelly, a father. He is flying on wax-and-feather wings over open sea beside his son and must shout over the wind. Natural, cinematic film acting; no announcer tone. ';
const list = [
  ['pd1', 'Now, Icarus. Jump! Don\'t look down!', 'Urgent and low, out of breath, a man who has waited years for this second. The word "Jump!" is a bark.'],
  ['pd0', 'We\'re out. We\'re out, my boy!', 'Breathless disbelief turning into a laugh of pure relief; shouted across the wind.'],
  ['pd2', 'Stay close to me! Not too low — the sea will drag at the feathers. Not too high — the sun will take the wax!', 'Calling across the wind, steady and firm: a father teaching, loving but strict. Clear, measured, loud.'],
  ['pd3', 'Icarus! Not so high! Come down! Come back to me!', 'Shouting upward, alarm rising with every phrase; by the last words there is fear in it.'],
  ['pd4', 'Icarus! ... ICARUS!', 'Screaming at the top of his lungs in raw terror as his son falls; the voice cracks and breaks on the second name, which is long and torn.'],
];
for (const [name, input, how] of list) {
  if (fs.existsSync(`${out}/${name}.mp3`) && !process.argv.includes('--redo')) { console.log(name, 'exists'); continue; }
  const r = await oa('/v1/audio/speech', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'gpt-4o-mini-tts', voice: 'onyx', input, instructions: WHO + how, response_format: 'mp3' }) });
  if (!r.ok) { console.log(name, r.status, (await r.text()).slice(0, 200)); continue; }
  const b = Buffer.from(await r.arrayBuffer()); fs.writeFileSync(`${out}/${name}.mp3`, b); console.log(name, b.length, 'bytes');
}
