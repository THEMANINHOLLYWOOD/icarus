# Icarus — audit, 10 Nov 2026

Three reviewers read the whole project (game page first half, second half, and everything else). What was confirmed and safe is fixed. This file lists what is left for you to decide. Nothing here is urgent enough to block play.

## Needs your decision — gameplay

1. **Esc dodges a smite.** A god's "leave" or "smite" only happens after their line finishes; pressing Esc or answering first cancels it. Gifts are now always given; I left leave/smite alone because cancelling by walking away may be what you want.
2. **A god who walks out comes straight back.** After "leave", an unmet god can re-appear and greet you about 8 seconds later; only one of three code paths respects the 45-second cool-down.
3. **Tap in a live conversation does nothing outside the text box (phones).** The hint says "tap to say nothing". I made tap-anywhere work when the AI is off; with the AI on it would cost a request per stray tap, so I left it.
4. **No way to open photo mode on a phone without the mic.** It opens with F or by saying "camera".
5. **No way to close the map on a phone except pinching**, and the wording ("pinch all the way out") is the reverse of what the code does.
6. **Typing in a conversation on desktop:** the hint says "type and press enter", but the first keystrokes are ignored until you press Enter or click the box.
7. **Gifts that can do nothing:** `calm` and `lens` are on/off but can be given twice (Hera and Artemis both give `calm`); a gift is announced even at the cap of 3. "A soft fall" says falls no longer kill; it only raises the height by 2.5× per level.
8. **Quests that don't match their words:** Ares says "fall on purpose" but the task is a dive as the bird; Zeus says "stand in front of me" but any landing counts; a "dive" quest is completed by riding a jetstream; nothing counts in the Underworld.
9. **A "visit" quest target can be stranded** if the marked character leaves; nothing re-places them until a reload.
10. **Beacon narration mentions dusk and night** ("Three. Dusk…", "Four. Night has come") but time of day now runs on its own clock, so these can play at noon.
11. **Sisyphus** has a full persona on the server and is not in the world. Add him or delete the entry.
12. **Saying "temple" on the summit** skips the first-flight story beats (no gods introduction, Titans never march that session).
13. **Shift is an undocumented control** (run / boost at 2.8× flame). G, T, `[`, `]` and Enter are also undocumented. N on the title screen wipes the save with no confirmation.
14. **The HIGH quality tier has bigger glyphs** than both LOW and ULTRA, so an automatic step down visibly changes the look and then changes back.

## Needs your decision — cost and safety

15. **The paid endpoints are open to anyone with the URL.** I added a cross-site block, a body-size cap and own-key checks, but a script can still call them at 40 requests a minute per IP. Options: lower the limits, set a monthly budget on the OpenAI key, add a Vercel Firewall rate rule on `/api/*`.
16. **About 60 fixed opening lines are still synthesised live** for every player (each character's two opening lines). They should be recorded once like the narrator's. Needs ElevenLabs credits.
17. **TTS concurrency is now 2** (it was 3; the plan refuses more than 2). If you upgrade the plan, raise it in `ttsPump`.
18. **No cache headers on `voice/` and `sfx/`**: about 40 files are re-validated on every visit. A `vercel.json` rule would fix it, but then a re-recorded clip takes a day to reach returning players.
19. **Daedalus's prologue lines are OpenAI recordings (24 kHz); his ending line is ElevenLabs.** He may sound like two men. Re-record one set when credits allow (`tools/gendad.mjs`, `tools/genvoice3.mjs`).
20. **`voice/titans.mp3` is still missing** (known; needs credits).

## Performance — worth doing, each needs testing on a phone

21. **Render target scales with screen density but the glyph grid does not.** On a phone the scene is drawn at roughly 3–6× more pixels than the glyphs can show. Biggest single win available.
22. **The glow pass does about 30 texture reads per screen pixel**; touch devices keep glow on. Turning glow off on touch is the cheap step.
23. **Point lights:** about 13 are always in the scene, and the first transformation recompiles every material (a hitch at the first ignite and the first realm crossing).
24. **HUD markers** build a label string for every beacon, god and Titan every frame before checking whether the marker is visible.
25. **The map** creates a 256×256 canvas for every tile in view, including empty ones, and never frees them (about 300 on a phone when zoomed out).
26. **The cloud sea** (140k–280k triangles) is drawn whenever you are within 9 km of the mountain; all 260 animals go through the shadow pass.
27. **Jetstream ribbon and wing-trail ribbon** are cleared and re-uploaded every frame even when absent.
28. Smaller per-frame garbage in `updateGodDirector`, `updateTemple`, `updateDialog`, `updateTails`, `updateParticles`, `updateBirds`.

## Loose ends — low stakes

29. No timeout on the browser's own `/api/god` request (the server now times out at 15 s and the page falls back).
30. `teleport()` does not re-check the game state in its 300 ms delay; `startWarp` does not stop narration audio.
31. The microphone listener can start twice if the permission prompt is slow, and keeps recording while the tab is hidden.
32. `saveGame` writes every 20 s whether or not anything changed; the explored-map set is unbounded in memory.
33. Reversed-edge `smoothstep` in nine shader lines is undefined by the GLSL spec (works on mainstream drivers); the cape meter is the one worth making safe.
34. A corrupt saved quality value would stop the game loading.
35. Server text that disagrees with the game: Persephone "at the water's edge" (she is in the Underworld); Titan looks (sickle, scales) vs their models (bident, spear); Hades told "it is day on Olympus".
36. Unused code left in place: `K.high` cloud branches, `LOOKS.demeter` / `LOOKS.smith`, `TEMPLE.group` / `TEMPLE.dark`, `photo.back`, `jet.t`, `T.flip`, `uEdge`, the first `#talk` CSS block that the second overrides, a few stale comments, `stats()` and `setQuality` rebuild in `audio.js`, never-read persona fields (`side: 'neither'`, `disguise` on the non-Twelve).
37. Duplicate implementations: "put a god in a new temple" (three places), Hermes-on-Mykonos spawn (two), beacon lighting (two), fade-and-teleport (two).
38. `dev-server.mjs` needs a restart after any change under `api/`.
39. The project is not a git repository, so there is no history for a 430 KB single file that gets edited heavily.
