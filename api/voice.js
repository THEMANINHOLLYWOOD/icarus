import { json, limited, refuse } from './_lib.js';
import { voiceFor } from './_gods.js';

// A short sound the player made — a word, a cough, a laugh — comes back in Icarus's own voice, with the shape it went in with.
// (ElevenLabs speech-to-speech: about a second for a second of sound, billed by the second.)
const TYPES = /^audio\/(webm|ogg|mp4|mpeg|wav|x-wav|aac)/;

export async function POST(req) {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) return json({ error: 'ELEVENLABS_API_KEY is not set' }, 501);
  const no = refuse(req, 400_000); if (no) return no;
  if (limited(req, 'voice', 24)) return json({ error: 'slow down' }, 429);
  const type = (req.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
  if (!TYPES.test(type)) return json({ error: 'bad request' }, 400);
  const audio = await req.arrayBuffer();
  if (audio.byteLength < 800 || audio.byteLength > 400_000) return json({ error: 'bad request' }, 400);

  const fd = new FormData();
  fd.append('audio', new Blob([audio], { type }), 'said.' + (type.split('/')[1] || 'webm').replace('x-', '').replace('mpeg', 'mp3'));
  fd.append('model_id', 'eleven_english_sts_v2');
  let r;
  try { r = await fetch(`https://api.elevenlabs.io/v1/speech-to-speech/${voiceFor('hero')}?output_format=mp3_44100_64&optimize_streaming_latency=3`, {
    method: 'POST', signal: AbortSignal.timeout(12000), headers: { 'xi-api-key': key, Accept: 'audio/mpeg' }, body: fd }); }
  catch { return json({ error: 'elevenlabs timeout' }, 504); }
  if (r.ok) return new Response(r.body, { headers: { 'Content-Type': 'audio/mpeg', 'Cache-Control': 'no-store' } });
  const detail = (await r.text()).slice(0, 200);
  console.error('voice', r.status, detail);
  return json({ error: `elevenlabs ${r.status}`, out: r.status === 401 || r.status === 402 }, 502);
}
