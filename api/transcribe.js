import { json, limited, refuse } from './_lib.js';

// push-to-talk: the page records a short clip and we turn it into text with OpenAI
export async function POST(req) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return json({ error: 'OPENAI_API_KEY is not set' }, 501);
  const no = refuse(req, 3_200_000); if (no) return no;
  if (limited(req, 'stt', 30)) return json({ error: 'slow down' }, 429);
  const buf = await req.arrayBuffer();
  if (!buf.byteLength) return json({ error: 'empty' }, 400);
  if (buf.byteLength > 3_000_000) return json({ error: 'too long' }, 413);
  const type = (req.headers.get('content-type') || 'audio/webm').split(';')[0];
  const ext = type.includes('mp4') || type.includes('m4a') ? 'mp4' : type.includes('ogg') ? 'ogg' : type.includes('wav') ? 'wav' : 'webm';
  const fd = new FormData();
  fd.append('file', new Blob([buf], { type }), `speech.${ext}`);
  fd.append('model', process.env.OPENAI_STT_MODEL || 'gpt-4o-mini-transcribe');
  const r = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST', headers: { Authorization: `Bearer ${key}` }, body: fd,
  });
  if (!r.ok) { console.error('openai stt', r.status, (await r.text()).slice(0, 300)); return json({ error: `openai ${r.status}` }, 502); }
  const data = await r.json();
  return json({ text: (data.text || '').trim() });
}
