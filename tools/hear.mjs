// What was actually said in each clip of a folder (so a take that reads its stage directions aloud is caught). Usage: node hear.mjs <dir>
import fs from 'node:fs';
import { oa } from './oa.mjs';
const dir = process.argv[2];
for (const f of fs.readdirSync(dir).filter(f => /\.(mp3|wav)$/.test(f)).sort()) {
  const fd = new FormData(); fd.append('model', 'gpt-4o-transcribe'); fd.append('file', new Blob([fs.readFileSync(`${dir}/${f}`)]), f);
  const r = await oa('/v1/audio/transcriptions', { method: 'POST', body: fd }); const j = await r.json();
  console.log(f, JSON.stringify(j.text ?? j.error?.message));
}
