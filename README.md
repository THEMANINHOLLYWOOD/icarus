# Icarus — The Last Ember

Icarus fell. He woke on Olympus. A story game in endless ASCII country: fly as the
phoenix, walk as the man, meet the gods (who are not always what they seem), and
share the world with everyone else who is playing.

**Play it:** https://justkeepflying.com

## Run it yourself

The whole game is one page, `index.html` (Three.js from a CDN, no build step), plus
`audio.js`, `xr.js` and a few serverless routes in `api/`.

```bash
node dev-server.mjs
```

Then open http://localhost:8123. Without any keys the game plays fully, with
scripted gods and no shared world. To turn the rest on, put keys in `.env.local`
(it is git-ignored, never commit it):

| Variable | What it enables |
|---|---|
| `OPENAI_API_KEY` | gods who answer what you say; speech to text |
| `ELEVENLABS_API_KEY` | gods' voices |
| `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` | the shared world: other players, voice chat |
| `SUPABASE_SECRET_KEY` | saving marks in the shared world (server only) |

The database schema is in `supabase/world.sql`.

## Controls

Space to jump and to beat your wings, hold to climb · WASD / mouse to steer ·
C cinematic camera · + photo camera (copies and downloads) · T chat · M map ·
Tab who's playing · Y plain picture (no letters) · B (or say "become a whale")
to take any shape · Delete to respawn on Olympus. On phones: touch and tilt. Vision Pro: hand gestures.

## Contributing

Ideas, fixes and new things are welcome: open an issue, or fork the repo and send
a pull request. Keep changes small and focused, test them in the browser, and
describe what you changed and how you checked it.

## Licence

Code: MIT. Music, voices, sound effects, video and icons: all rights reserved,
included so the game runs. See [LICENSE](LICENSE) and [MEDIA-LICENSE.md](MEDIA-LICENSE.md).
