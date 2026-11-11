// Daedalus in the prologue, performed by OpenAI's speech-native model (gpt-audio), which acts a line instead of reading it.
// Usage: node gendad2.mjs <voice> [take]   → writes raw takes to tools/takes/<voice>/<line>-<take>.wav and prints what was said.
// Nothing here touches voice/: install a take with tools/installdad.sh once it has been checked.
import { oa } from './oa.mjs';
import fs from 'node:fs';
const voice = process.argv[2] || 'cedar', take = process.argv[3] || '1', only = process.argv[4];
const dir = `/Users/andres/Desktop/Coding/Icarus/tools/takes/${voice}`, MODEL = process.env.DAD_MODEL || 'gpt-audio-1.5';
fs.mkdirSync(dir, { recursive: true });
const ROLE = `You are a veteran stage and film actor recording a single line of dialogue for a film, in one take.
The role: Daedalus, the old Greek craftsman, in his sixties. A weathered, warm, gravel-rough voice with real age in it; a father, not a narrator.
The scene: he and his son Icarus have just leapt from the Labyrinth on wings of wax and feathers and are flying over open sea, wind tearing past. He has to throw his voice across the wind to be heard.
Volume: this is SHOUTED. He is outdoors, in a gale, calling to someone thirty metres away: project from the chest at full voice, strained, hoarse at the edges. A quiet or conversational reading is a failed take.
Rules: perform ONLY the line you are given, word for word, with nothing before or after it — no greeting, no comment, no stage directions read aloud. Fully committed and human: real breath, real effort, uneven and alive. Never an announcer, never a reader, never calm when the scene is not calm.`;
const list = [
  ['pd1', 'Now, Icarus. Jump! Don\'t look down!', 'Standing on the ledge, seconds before the guards arrive. Low, urgent, tight with held breath — then "Jump!" is a hard bark, and "Don\'t look down!" is called after him as he goes.'],
  ['pd0', 'We\'re out. We\'re out, my boy!', 'In the air, free after years. The first "We\'re out" is disbelief, almost to himself; the second breaks into a breathless, shaking laugh of joy, shouted to his son.'],
  ['pd2', 'Stay close to me! Not too low — the sea will drag at the feathers. Not too high — the sun will take the wax!', 'Calling across the wind to a boy who is not listening. Firm, loud, a father giving the one instruction that matters, with worry under the firmness. Keep it moving; do not slow down into a lecture.'],
  ['pd3', 'Icarus! Not so high! Come down! Come back to me!', 'His son is climbing away from him toward the sun. Shouted upward, each phrase more frightened than the last; by "Come back to me!" he is pleading.'],
  ['pd4', 'Icarus! ... ICARUS!', 'His son is falling out of the sky. Two screams of his name at the very top of his lungs: the first sharp with horror, then a beat, then the second long, torn and breaking — a father watching his child die. Do not hold anything back.'],
];
for (const [name, line, how] of list) {
  if (only && only !== name) continue;
  const r = await oa('/v1/chat/completions', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: MODEL, modalities: ['text', 'audio'], audio: { voice, format: 'wav' },
      messages: [{ role: 'system', content: ROLE }, { role: 'user', content: `Direction for this take: ${how}\n\nThe line (perform exactly this, nothing else):\n"${line}"` }] }) });
  if (!r.ok) { console.log(name, r.status, (await r.text()).slice(0, 300)); continue; }
  const a = (await r.json()).choices?.[0]?.message?.audio;
  if (!a?.data) { console.log(name, 'no audio'); continue; }
  fs.writeFileSync(`${dir}/${name}-${take}.wav`, Buffer.from(a.data, 'base64'));
  console.log(name, take, JSON.stringify(a.transcript));
}
