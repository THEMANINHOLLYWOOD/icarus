// Test helpers for the Browser pane (not deployed). Load with:  await import('/tools/t.js?' + Date.now())
// Stops the page's own frame loop so the game only advances when a test steps it.
window.requestAnimationFrame = () => 0;
const I = window.__icarus;
if (I.state === 'title') {
  const ni = document.getElementById('nameInput'); ni.value = ni.value || 'ANDY';
  ni.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true }));
  I.step(5);
}
window.L = { x: -492, z: 4504 };   // a big lake south of the mountain
window.T = {
  shot: async (n = 2) => { I.step(n); await new Promise(r => setTimeout(r, 150)); I.step(1); },
  fly: (x, y, z, yaw, speed, pitch = 0) => { const p = I.player; p.form = 'phoenix'; p.grounded = false; p.wings = false; p.cine = null; p.flame = 1; p.sub = null; p.pos.set(x, y, z); p.pitch = pitch; p.speed = speed; p.yaw = yaw; p.vy = 0; },
  // fly level at a fixed height and speed for n frames
  hold: (n, speed, y) => { const p = I.player; for (let i = 0; i < n; i++) { I.cinema.idle = 0; I.cinema.autoT = 0; p.speed = speed; if (y != null) { p.pos.y = y; p.pitch = 0; p.vy = 0; } p.flame = 1; I.step(1); } },
  // sit still in the air looking a given way for n frames
  hover: (n, x, y, z, yaw, pitch) => { const p = I.player; for (let i = 0; i < n; i++) { p.pos.set(x, y, z); p.speed = 18; p.pitch = pitch; p.yaw = yaw; p.flame = 1; p.vy = 0; I.step(1); } },
  raw: on => { I.postMat.uniforms.uAscii.value = on ? 0 : 1; },
  run: () => { let best = null; for (let a = 0; a < 6.28; a += 0.1) { let d = 0; while (d < 3000 && I.groundAt(L.x - Math.sin(a) * d, L.z - Math.cos(a) * d, -1000) < -41) d += 25; if (!best || d > best.d) best = { a, d }; } return best; },
};
window.RUN = T.run();
I.setDay(0.45);
// wait out a death, back to play
T.alive = () => { let k = 0; while (I.state !== 'play' && k < 1200) { I.step(1); k++; } return k; };
T.gy = (x, z) => I.groundAt(x, z, -1e4);
T.solids = () => { const all = []; for (const [, g] of I.chunks) for (const s of (g.userData.solids || [])) all.push(s); return all; };
T.near = (what, minR = 0) => T.solids().filter(s => s.what === what && s.r >= minR).sort((a, b) => Math.hypot(a.x - I.player.pos.x, a.z - I.player.pos.z) - Math.hypot(b.x - I.player.pos.x, b.z - I.player.pos.z))[0];
T.last = () => I.story.events.slice(-1).map(e => e.text)[0];

// a fixed lens on him: d metres away, at angle a round from in front of him, h up
T.frame = (d = 4, a = 0.6, h = 1.2, fov = 38) => { const p = I.player, y = I.human.group.rotation.y + a; I.dbgCam.on = true; I.dbgCam.p.set(p.pos.x - Math.sin(y) * d, p.pos.y + h, p.pos.z - Math.cos(y) * d); I.dbgCam.l.set(p.pos.x, p.pos.y + 0.95, p.pos.z); I.dbgCam.fov = fov; };
T.open = () => { for (let r = 0; r < 5000; r += 60) for (let a = 0; a < 6.28; a += 0.3) { const x = -600 + Math.cos(a) * r, z = 4300 + Math.sin(a) * r, h = T.gy(x, z); if (h > -25 && h < 300 && I.forestAt(x, z) < 0.05 && Math.abs(T.gy(x + 12, z) - h) < 1.2 && Math.abs(T.gy(x, z + 12) - h) < 1.2 && Math.abs(T.gy(x - 12, z - 12) - h) < 1.5) return { x, z, h }; } };
T.stand = (P) => { const p = I.player; p.form = 'human'; p.grounded = true; p.wings = false; p.cine = null; p.climb = null; p.trip = null; p.tumble = false; p.pos.set(P.x, P.h, P.z); p.vel.set(0, 0, 0); p.fallTop = P.h; I.dlg.queue.length = 0; I.dlg.cur = null; };
