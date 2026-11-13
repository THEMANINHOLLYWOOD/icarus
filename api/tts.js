import { json, clip, limited, refuse } from './_lib.js';
import { voiceFor } from './_gods.js';

// Most lifelike first. The v3/v4 models act out cues like [sighs] or [quietly]; older ones would read them aloud,
// so the cues are stripped before falling back to those.
const MODELS = [process.env.ELEVENLABS_MODEL || 'eleven_v4', 'eleven_v4_turbo', 'eleven_flash_v2_5'];
// live conversation wants the answer now: the turbo model still acts the cues and comes back sooner; the player's own echoed voice uses the fastest one
const QUICK = ['eleven_v4_turbo', 'eleven_flash_v2_5'], FLASH = ['eleven_flash_v2_5'];
const acts = m => /_v[3-9]/.test(m);

export async function POST(req) {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) return json({ error: 'ELEVENLABS_API_KEY is not set' }, 501);
  const no = refuse(req); if (no) return no;
  if (limited(req, 'tts', 40)) return json({ error: 'slow down' }, 429);
  let body;
  try { body = await req.json(); } catch { return json({ error: 'bad json' }, 400); }
  const voice = voiceFor(body?.voice), text = clip(body?.text, 500);
  if (!voice || !text) return json({ error: 'bad request' }, 400);

  let fail = '';
  for (const model of [...new Set(body.flash ? FLASH : body.quick ? QUICK : MODELS)]) {
    const said = acts(model) ? text : text.replace(/\[[^\]]*\]\s*/g, '').trim();
    let r;
    try { r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voice}?output_format=mp3_44100_128`, {
      method: 'POST', signal: AbortSignal.timeout(20000),
      headers: { 'xi-api-key': key, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
      body: JSON.stringify({ text: said, model_id: model, voice_settings: { stability: 0.5, similarity_boost: 0.8, style: 0.45, use_speaker_boost: true } }),
    }); } catch { fail = 'voice timeout'; continue; }
    if (r.ok) return new Response(r.body, { headers: { 'Content-Type': 'audio/mpeg', 'Cache-Control': 'no-store', 'X-Voice-Model': model } });
    fail = `voice ${r.status}`; console.error('elevenlabs', r.status, model, (await r.text().catch(() => '')).slice(0, 200));
    if (r.status === 401 || r.status === 402 || r.status === 429) break;   // out of credit or locked out: another model won't help
  }
  return json({ error: fail }, 502);
}
