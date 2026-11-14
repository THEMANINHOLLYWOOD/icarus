import { json } from './_lib.js';

// the world's epoch: raised each time the shared world is wiped clean, so every device starts again too
const EPOCH = 1;

export function GET() {
  const openai = !!process.env.OPENAI_API_KEY, eleven = !!process.env.ELEVENLABS_API_KEY;
  // multiplayer: the Supabase project's address and its publishable key, which is meant to be public (Realtime only lets it join channels)
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY;
  return json({ chat: openai, stt: openai, tts: eleven, sts: eleven, mp: url && key ? { url, key } : null, epoch: EPOCH });
}
