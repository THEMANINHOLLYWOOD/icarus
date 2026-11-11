// Transcribe a clip with word timings (to find where a word lands in a song). Usage: node hearts.mjs <file>
import fs from 'node:fs';
import { oa } from './oa.mjs';
const fd = new FormData(); fd.append('model', 'whisper-1'); fd.append('response_format', 'verbose_json'); fd.append('timestamp_granularities[]', 'word'); fd.append('timestamp_granularities[]', 'segment');
fd.append('file', new Blob([fs.readFileSync(process.argv[2])]), 'clip.wav');
const r = await oa('/v1/audio/transcriptions', { method: 'POST', body: fd }); const j = await r.json();
console.log(JSON.stringify({ text: j.text, words: (j.words || []).slice(0, 30), segments: (j.segments || []).map(s => [s.start, s.end, s.text]) }));
