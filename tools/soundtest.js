// Renders the game's sound offline through a scripted sequence and reports levels per stretch (not deployed).
// Use: load the game fresh in the preview (do not begin it), then: await import('/tools/soundtest.js?' + Date.now())  → window.ST
const FPS = 60, SECS = 34;
const I = window.__icarus, p = I.player;
window.requestAnimationFrame = () => 0;
let off = null;
window.AudioContext = window.webkitAudioContext = function () { off = new OfflineAudioContext({ numberOfChannels: 2, length: 48000 * SECS, sampleRate: 48000 }); return off; };
const ni = document.getElementById('nameInput'); ni.value = 'TEST';
ni.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true }));
I.step(3);
await new Promise(r => setTimeout(r, 3500));   // samples and loops decode
const ST = window.ST = { log: [], stats: null, loaded: I.audio.stats().samples, err: null };
I.story.phase = 'gods'; I.setStorm(0); I.setDay(0.45); I.dlg.queue.length = 0; I.dlg.cur = null;
const key = (code, d) => window.dispatchEvent(new KeyboardEvent(d ? 'keydown' : 'keyup', { key: code, code, bubbles: true }));
let open = null;
for (let r = 0; r < 5000 && !open; r += 60) for (let a = 0; a < 6.28 && !open; a += 0.3) { const x = -600 + Math.cos(a) * r, z = 4300 + Math.sin(a) * r, h = I.groundAt(x, z, -1e4); if (h > -25 && h < 300 && Math.abs(I.groundAt(x + 12, z, -1e4) - h) < 1.2) open = { x, z, h }; }
const SEG = [   // [from, to, what]
  [0, 3, 'summit, standing in the wind'], [3, 7, 'walking on grass'], [7, 9, 'a jump and a landing'], [9, 13, 'phoenix gliding'], [13, 17, 'phoenix boosting fast'],
  [17, 21, 'diving'], [21, 25, 'falling as a man'], [25, 29, 'storm rain on the ground'], [29, 34, 'skimming low over water'],
];
let f = 0, stage = '';
function script(t) {
  I.dlg.cur = null; I.cinema.idle = 0;
  const want = SEG.find(s => t >= s[0] && t < s[1])?.[2] || '';
  if (want !== stage) {
    stage = want; ST.log.push([t.toFixed(2), want]);
    ['KeyW', 'ShiftLeft', 'KeyS'].forEach(k => key(k, false));
    if (want.startsWith('summit')) { p.form = 'human'; p.grounded = true; p.pos.copy(I.START); p.vel.set(0, 0, 0); p.fallTop = p.pos.y; I.story.phase = 'summit'; }
    if (want.startsWith('walking')) { I.story.phase = 'gods'; p.form = 'human'; p.grounded = true; p.pos.set(open.x, open.h, open.z); p.vel.set(0, 0, 0); p.fallTop = open.h; key('KeyW', true); }
    if (want.startsWith('a jump')) { key('KeyW', false); I.jump(); }
    if (want.startsWith('phoenix gliding')) { p.form = 'phoenix'; p.cine = null; p.flame = 1; p.pos.set(open.x, open.h + 300, open.z); p.speed = 70; p.pitch = 0; }
    if (want.startsWith('phoenix boosting')) key('ShiftLeft', true);
    if (want.startsWith('diving')) { key('ShiftLeft', false); p.pos.y += 600; key('KeyS', true); }
    if (want.startsWith('falling')) { key('KeyS', false); p.form = 'human'; p.wings = false; p.grounded = false; p.tumble = true; p.pos.set(open.x, open.h + 900, open.z); p.vel.set(0, -40, 0); p.fallTop = p.pos.y; }
    if (want.startsWith('storm')) { p.tumble = false; p.form = 'human'; p.grounded = true; p.pos.copy(I.START); p.vel.set(0, 0, 0); p.fallTop = p.pos.y; I.story.phase = 'summit'; I.setStorm(1); }
    if (want.startsWith('skimming')) { I.setStorm(0); I.story.phase = 'gods'; p.form = 'phoenix'; p.cine = null; p.pos.set(-492, -31, 4504); p.speed = 120; p.pitch = 0; }
  }
  if (want.startsWith('phoenix') || want.startsWith('skimming')) { p.flame = 1; if (want.startsWith('skimming')) { p.pos.y = -31; p.pitch = 0; } }
  if (want.startsWith('falling') && p.pos.y - I.groundAt(p.pos.x, p.pos.z, p.pos.y) < 200) p.pos.y += 400;
  if (want.startsWith('diving') && p.pos.y - I.groundAt(p.pos.x, p.pos.z, p.pos.y) < 260) p.pos.y += 500;
  if (want.startsWith('storm')) I.setStorm(1);
}
function stats(buf) {
  const L = buf.getChannelData(0), R = buf.getChannelData(1), sr = buf.sampleRate;
  return SEG.map(([a, b, what]) => {
    let s = 0, pk = 0, n = 0;
    for (let i = Math.floor((a + 0.4) * sr); i < Math.floor(b * sr); i++) { const v = (L[i] + R[i]) / 2; s += v * v; n++; pk = Math.max(pk, Math.abs(L[i]), Math.abs(R[i])); }
    return [what, 'rms ' + (10 * Math.log10(s / n + 1e-12)).toFixed(1) + ' dB', 'peak ' + (20 * Math.log10(pk + 1e-9)).toFixed(1) + ' dB'];
  });
}
const tick = () => { script(f / FPS); I.step(1); f++; if (f < FPS * SECS) off.suspend(f / FPS).then(tick); off.resume(); };
off.suspend(1 / FPS).then(tick);
off.startRendering().then(buf => { ST.stats = stats(buf); ST.loops = Object.keys(I.audio.stats().samples); }, e => { ST.err = String(e); });
