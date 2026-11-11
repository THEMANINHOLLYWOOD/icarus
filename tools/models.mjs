// which speech-capable models this OpenAI key can use (prints ids only)
import { oa } from './oa.mjs';
const r = await oa('/v1/models'); const j = await r.json();
console.log(r.status, (j.data || []).map(m => m.id).filter(id => /tts|audio|realtime|transcribe|whisper/.test(id)).sort().join('\n'));
