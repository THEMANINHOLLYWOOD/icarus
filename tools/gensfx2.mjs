// Every sound effect, designed for this world and recorded several times, so the game can play a different take each time.
// Writes raw takes to tools/takes/sfx/<name>-<n>.mp3 (nothing in sfx/ is touched; pick and install with tools/installsfx.mjs).
// Usage: node gensfx2.mjs [only-these,names]
import { el } from './el.mjs';
import fs from 'node:fs';
const dir = '/Users/andres/Desktop/Coding/Icarus/tools/takes/sfx'; fs.mkdirSync(dir, { recursive: true });
const NO = ' Foley recorded close with a good microphone; no music, no voices, no reverb tail unless stated.';
// name, takes, seconds, prompt, loop
const LIST = [
  ['flap', 4, 1.0, 'One huge downstroke of a giant bird wing made of burning feathers: a deep chest-thumping whump of displaced air, hundreds of stiff feathers rattling, a soft gasp of flame at the end.'],
  ['wingsopen', 3, 1.4, 'Enormous wax-and-feather wings snapping open in a gale like a parachute catching: a sharp leathery crack, a heavy whump, then a shudder of feathers straining.'],
  ['ignite', 3, 2.8, 'A man bursting into flame from the inside: a sharp breathy intake, a rising whoosh, then a roaring sheet of fire that crackles, pops and spits sparks.'],
  ['rebirth', 3, 3.2, 'A burning man exploding into a phoenix: a deep concussive fireball boom, a tearing roar of flame unfurling outward like wings, glittering embers raining and fizzling.'],
  ['morph', 2, 3.4, 'A god changing shape: an animal snort dissolving into a slow rising shimmer of air and heat, a deep resonant hum swelling and blooming into a bright crystalline tone, settling with a soft breath.'],
  ['impact', 3, 1.2, 'A body hitting hard mountain rock after a long fall: a dull meaty thud, a crunch, loose stones and grit skittering away.'],
  ['splash', 3, 2.6, 'A burning bird diving into a deep lake at high speed: a violent slap of water, a hiss of steam as fire meets water, a heavy plunge sinking into muffled underwater bubbles.'],
  ['roll', 2, 1.3, 'A man crash-landing and rolling across rough grass and dirt: a thump, cloth and leather straps scuffing, a second bump, gravel spraying.'],
  ['flameout', 2, 1.8, 'Fire on a man\'s body guttering out in the wind: flames fluttering, sputtering, a last weak hiss and a soft puff of smoke.'],
  ['thunder', 3, 5.0, 'A thunderclap over high mountains: a sharp tearing crack overhead that splits into a deep rolling rumble echoing between peaks and fading away.'],
  ['underworld', 2, 5.0, 'Falling through dark water into a vast cavern underneath: a deep sub-bass boom, water closing overhead, a long cold hollow drone with distant stone groaning.'],
  ['step', 6, 0.5, 'A single footstep of a leather sandal on short mountain grass and dry earth, soft crunch.'],
  ['stepstone', 4, 0.5, 'A single footstep of a leather sandal on hard stone with a little grit, crisp scrape.'],
  ['land', 3, 0.9, 'A man landing on his feet on grass after a jump: a firm double thump of sandals, knees taking it, cloth flapping once.'],
  ['jump', 3, 0.7, 'A man pushing off the ground into a jump: a quick scuff of sandals on earth and a short rush of cloth.'],
  ['leaves', 3, 1.2, 'Something large crashing at speed through the leafy crown of an oak tree: a burst of rustling leaves, twigs snapping, branches whipping back.'],
  ['grab', 4, 0.6, 'A bare hand grabbing a rough rock hold while climbing: skin on stone, a scrape of grit, a grunt-free breathy exertion of the grip only.'],
  ['bark', 3, 0.6, 'Hands and sandals gripping the trunk of a tree while climbing: rough bark scraping, a creak of the trunk.'],
  ['whoosh', 4, 1.3, 'A huge bird of fire passing very close at high speed: a fast doppler roar of wind and crackling flame rushing past and away.'],
  ['crack', 2, 3.0, 'Lightning striking the ground a few metres away: an instant deafening electric crack and sizzle, the ground thud, then rumbling thunder rolling away.'],
  ['surge', 2, 4.0, 'A wall of seawater rising and rushing toward a rocky shore: a deep building roar, the wave curling and crashing, foam hissing back.'],
  // loops: long, steady, no events, so they can run under the game
  ['windloop', 2, 11, 'Steady strong wind high in the sky heard by someone flying: a broad soft roar with slow gusts, air rushing past the ears, no whistling, no events, seamless and even.', true],
  ['diveloop', 2, 11, 'Plummeting through the air at terrifying speed: a hard continuous roaring rush of wind with a thin high whistle through feathers and violent flutter, even and constant.', true],
  ['fallloop', 2, 11, 'A person in freefall: a loud constant buffeting rush of wind, loose cloth and a cloak flapping and snapping violently, even and constant.', true],
  ['fireloop', 2, 11, 'A large fire burning steadily in the wind: soft roaring flame with constant crackles and small pops, no wood creaks, even and seamless.', true],
  ['rainloop', 2, 11, 'Heavy rain in a storm falling on rock and grass on an open mountaintop, constant downpour, no thunder, even and seamless.', true],
  ['waterloop', 2, 11, 'Small waves lapping on a pebble lake shore, gentle and constant, no birds, even and seamless.', true],
];
const only = (process.argv[2] || '').split(',').filter(Boolean);
const jobs = [];
for (const [name, n, sec, prompt, loop] of LIST) {
  if (only.length && !only.includes(name)) continue;
  for (let k = 1; k <= n; k++) if (!fs.existsSync(`${dir}/${name}-${k}.mp3`)) jobs.push({ name, k, sec, prompt: prompt + NO });
}
let total = 0, i = 0, stop = false;
async function worker() {
  while (i < jobs.length && !stop) {
    const j = jobs[i++];
    const r = await el('/v1/sound-generation?output_format=mp3_44100_128', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: j.prompt, duration_seconds: j.sec, prompt_influence: 0.55 }) });
    if (!r.ok) { const t = (await r.text()).slice(0, 200); console.log(j.name, j.k, r.status, t); if (r.status === 401 || r.status === 402) stop = true; continue; }
    const b = Buffer.from(await r.arrayBuffer()); fs.writeFileSync(`${dir}/${j.name}-${j.k}.mp3`, b);
    const c = +(r.headers.get('character-cost') || 0); total += c; console.log(j.name, j.k, b.length, 'cost', c);
  }
}
await Promise.all([worker(), worker(), worker()]);
console.log('jobs', jobs.length, 'total cost', total);
