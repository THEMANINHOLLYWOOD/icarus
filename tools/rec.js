// Records "the leap" as a clip: the first night on the summit, the walk to the edge, "I have to let go", the fire, the bird,
// and the cameras following it down through the cloud into the morning. Not deployed.
//
// Use: start `node tools/cap.mjs`, load the game fresh in the preview (do not begin it), then in the page:
//   await import('/tools/rec.js?secs=42&' + Date.now())      → progress in window.REC
// Every frame is stepped by hand and posted to the capture server as a JPEG, so the clip is exactly 60 a second whatever
// the machine is doing. The game's sound is rendered by an offline audio context that is paused at each frame, so the
// soundtrack (music, wind, thunder, his voice) lines up with the picture to the sample.
const Q = new URLSearchParams(import.meta.url.split('?')[1] || '');
const FPS = 60, SECS = +(Q.get('secs') || 42), CAP = 'http://127.0.0.1:8124/f/';
const I = window.__icarus, p = I.player, cv = document.getElementById('c');
window.requestAnimationFrame = () => 0;
const R = window.REC = { frame: 0, total: FPS * SECS, done: false, audio: false, err: null, log: [], size: [cv.width, cv.height] };

let off = null;
const OAC = window.OfflineAudioContext;
window.AudioContext = window.webkitAudioContext = function () { off = new OAC({ numberOfChannels: 2, length: 48000 * SECS, sampleRate: 48000 }); return off; };

// begin as Andres
const ni = document.getElementById('nameInput'); ni.value = Q.get('name') || 'ANDRES';
ni.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true }));
I.step(3);
await new Promise(r => setTimeout(r, 2500));   // samples and his recorded lines arrive

// the first night, a little way back from the lip of the mountain
I.story.phase = 'summit'; I.flags.firstNight = true; I.flags.dawn = 0; I.flags.morphed = false; I.setDay(0.93); I.setStorm(1);
I.dlg.queue.length = 0; I.dlg.cur = null;
const ax = I.MOUNT.x - I.EDGE.x, az = I.MOUNT.z - I.EDGE.z, al = Math.hypot(ax, az) || 1;
p.form = 'human'; p.cine = null; p.wings = false; p.grounded = true; p.flame = 1; p.burnout = false; p.sub = null;
p.pos.set(I.EDGE.x + ax / al * 24, 0, I.EDGE.z + az / al * 24); p.pos.y = I.groundAt(p.pos.x, p.pos.z, 1e5); p.vel.set(0, 0, 0); p.fallTop = p.pos.y;
for (let i = 0; i < 360; i++) { I.setStorm(1); I.dlg.queue.length = 0; I.dlg.cur = null; I.step(1); }   // let the night and the rain settle before the first frame

const held = {};
const key = (code, down) => { if (!!held[code] === down) return; held[code] = down; window.dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', { key: code.slice(3).toLowerCase(), code, bubbles: true })); };
let tLeap = -1, tSpace = -1, tPhx = -1;
function control(t) {
  I.cinema.idle = 0;
  if (p.form === 'human' && tSpace < 0) {
    if (t < 0.8) return;                                    // a breath of him standing in the storm
    if (I.story.phase === 'summit') key('KeyW', true);       // to the edge
    else {
      key('KeyW', false);
      if (tLeap < 0) { tLeap = t; R.log.push(['edge', t]); }
      if (t - tLeap > 4.4) { I.pressSpace(); tSpace = t; R.log.push(['jump', t]); }   // "I have to let go." — and he does
    }
  }
  if (tPhx < 0 && p.form === 'phoenix' && !p.cine) { tPhx = t; R.log.push(['phoenix', t]); I.cinema.manual = true; }
  if (tPhx >= 0) {
    const u = t - tPhx, fx = -Math.sin(p.yaw), fz = -Math.cos(p.yaw);
    const under = Math.max(I.groundAt(p.pos.x, p.pos.z, -1e5), I.groundAt(p.pos.x + fx * 350, p.pos.z + fz * 350, -1e5), I.groundAt(p.pos.x + fx * 700, p.pos.z + fz * 700, -1e5));
    const clear = p.pos.y - under;
    key('KeyS', u > 1.2 && u < 9 && p.pos.y > I.CLOUD_SEA - 260 && clear > 520);   // down through the cloud, wings folded, with room to spare
    if (u >= 9 && u < 24 && !held.KeyS && clear > 170) p.pitch = Math.min(p.pitch, -0.32);   // then a long shallow glide down toward the country underneath
    if (u > 14 && I.cinema.manual) { I.cinema.manual = false; I.cinema.autoT = 0; R.log.push(['follow', t]); }   // …and the lens comes back in behind him for the last of it
    key('KeyA', u > 20 && u < 21.4);                                                         // one long banked turn in the morning
    p.flame = 1;
    if (I.state !== 'play' && !R.dead) { R.dead = true; R.log.push(['state', t, I.state]); }
  }
}
async function frame() {
  try {
    control(R.frame / FPS);
    I.step(1);
    // (toDataURL, not toBlob: it reads the picture back now, in this task, where toBlob waits for a paint the preview pane rarely gives)
    const url = cv.toDataURL('image/jpeg', 0.92), bin = atob(url.slice(url.indexOf(',') + 1)), u8 = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    const blob = new Blob([u8], { type: 'image/jpeg' });
    const r = await fetch(CAP + 'f' + String(R.frame).padStart(5, '0') + '.jpg', { method: 'POST', body: blob });
    if (!r.ok) throw new Error('capture server said ' + r.status);
    R.frame++;
  } catch (e) { R.err = String(e); }
}
function wav(buf) {
  const n = buf.length, L = buf.getChannelData(0), Rr = buf.numberOfChannels > 1 ? buf.getChannelData(1) : L, out = new DataView(new ArrayBuffer(44 + n * 4));
  const str = (o, s) => { for (let i = 0; i < s.length; i++) out.setUint8(o + i, s.charCodeAt(i)); };
  str(0, 'RIFF'); out.setUint32(4, 36 + n * 4, true); str(8, 'WAVEfmt '); out.setUint32(16, 16, true); out.setUint16(20, 1, true); out.setUint16(22, 2, true);
  out.setUint32(24, buf.sampleRate, true); out.setUint32(28, buf.sampleRate * 4, true); out.setUint16(32, 4, true); out.setUint16(34, 16, true); str(36, 'data'); out.setUint32(40, n * 4, true);
  for (let i = 0, o = 44; i < n; i++, o += 4) { out.setInt16(o, Math.max(-1, Math.min(1, L[i])) * 32767, true); out.setInt16(o + 2, Math.max(-1, Math.min(1, Rr[i])) * 32767, true); }
  return new Blob([out], { type: 'audio/wav' });
}
if (off) {
  const tick = async () => { await frame(); if (R.frame < R.total && !R.err) off.suspend(R.frame / FPS).then(tick); off.resume(); };
  await frame();
  off.suspend(1 / FPS).then(tick);
  off.startRendering().then(async buf => {
    try { await fetch(CAP + 'audio.wav', { method: 'POST', body: wav(buf) }); R.audio = true; } catch (e) { R.err = 'audio: ' + e; }
    R.done = true;
  }, e => { R.err = 'render: ' + e; R.done = true; });
} else {
  R.log.push(['no audio context: picture only']);
  (async () => { while (R.frame < R.total && !R.err) await frame(); R.done = true; })();
}
