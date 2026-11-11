// Can ElevenLabs turn a recording into Icarus's voice? Converts one clip and reports time and cost. Usage: node sts.mjs <in> <out> [model]
import { el } from './el.mjs';
import fs from 'node:fs';
const [inp, out, model = 'eleven_english_sts_v2'] = process.argv.slice(2), HERO = 'bIHbv24MWmeRgasZH58o';
const fd = new FormData(); fd.append('audio', new Blob([fs.readFileSync(inp)]), 'in' + inp.slice(inp.lastIndexOf('.'))); fd.append('model_id', model); fd.append('remove_background_noise', 'false');
const t0 = Date.now();
const r = await el(`/v1/speech-to-speech/${HERO}?output_format=mp3_44100_64&optimize_streaming_latency=3`, { method: 'POST', body: fd });
if (!r.ok) { console.log(r.status, (await r.text()).slice(0, 300)); process.exit(1); }
const b = Buffer.from(await r.arrayBuffer()); fs.writeFileSync(out, b);
console.log('ok', b.length, 'bytes in', Date.now() - t0, 'ms, cost', r.headers.get('character-cost'));
