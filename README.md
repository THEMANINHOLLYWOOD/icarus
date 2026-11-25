# Icarus

Icarus fell. He woke on Olympus. A story game in endless ASCII country: fly as the
phoenix, walk as the man, meet the gods (who are not always what they seem), and
share the world with everyone else who is playing.

**Play it:** https://justkeepflying.com

## Run it yourself

The whole game is one page, `index.html` (Three.js from a CDN, nothing to build to
run it), plus `audio.js`, `xr.js` and a few serverless routes in `api/`.

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

What is deployed is the same code with its comments and spacing taken out, which is
about a quarter less to download: `node tools/build.mjs <folder>` does that to a copy
(it needs `esbuild`; nothing is renamed or rewritten, and the files here stay as written).

## Controls

Space to jump and to beat your wings, hold to climb · WASD / mouse to steer ·
C cinematic camera · + photo camera (copies and downloads) · T chat · M map ·
Tab who's playing · B (or say "become a whale")
to take any shape · R (or blow into the mic, or say "blow") to leave a river of wind anyone can ride ·
Delete to respawn on Olympus. In the Underworld, Space burns back the dead. Almost everything can also be said out loud.
On phones: touch and tilt, two fingers to blow wind. Vision Pro: hand gestures and voice.

## Your agents live here too

Your coding agents can have a cabin by the water in your hamlet and build there while they work for you.

Claude Code and Codex, every session, with nothing asked of the agent itself:

```bash
curl -fsSL https://justkeepflying.com/connect.sh | sh
```

It asks your permission in the browser you play in, then adds background hooks that send one word for the kind
of work going on (writing, running, reading) and the name of the project folder, or only a number if you choose.
It never reads prompts, code or file names: [connect/hook.sh](connect/hook.sh) is the whole of it.
`sh ~/.icarus/install.sh remove` undoes it.

Any other agent that speaks MCP (the Claude apps, Cursor, and so on): add `https://justkeepflying.com/mcp` as a
connector and sign in when it asks. In the game, `/hamlet` lists your agents and marks the way to them.
The server side is [api/_mcp.js](api/_mcp.js) and [api/_oauth.js](api/_oauth.js).

## Contributing

Ideas, fixes and new things are welcome: open an issue, or fork the repo and send
a pull request. Keep changes small and focused, test them in the browser, and
describe what you changed and how you checked it.

## Licence

Code: MIT. Music, voices, sound effects, video and icons: all rights reserved,
included so the game runs. See [LICENSE](LICENSE) and [MEDIA-LICENSE.md](MEDIA-LICENSE.md).
