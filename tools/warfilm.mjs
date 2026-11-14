// Shoots "The warzone" (tools/warfilm.js) with a browser nobody sees or hears: loads the game from the dev server, gives it
// a traveller who has already flown, gets the bird into the air, then steps the game a frame at a time and keeps each one.
// Run: PORT=8125 node dev-server.mjs   ·   OUT=/some/folder node tools/warfilm.mjs   ·   then ffmpeg (see the end of this file).
// EVERY=8 keeps one frame in eight (a quick look at the cut). W and H set the picture (4:3 by default).
import fs from 'node:fs';
import path from 'node:path';
const PW = process.env.PLAYWRIGHT || 'playwright';   // (PLAYWRIGHT=/path/to/playwright/index.mjs when it is not installed beside this)
const { chromium } = await import(PW);
const OUT = process.env.OUT || path.resolve('tools/cap-warzone'), W = +(process.env.W || 1280), H = +(process.env.H || 960), EVERY = +(process.env.EVERY || 1), URL0 = process.env.URL || 'http://localhost:8125/?mute&menu=over';
fs.mkdirSync(OUT, { recursive: true }); for (const f of fs.readdirSync(OUT)) if (/^f\d+\.jpg$/.test(f)) fs.unlinkSync(path.join(OUT, f));
const say = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

const EXE = process.env.CHROME || undefined;   // (CHROME=/path/to/a Chrome binary when Playwright's own browser is not the installed one)
const browser = await chromium.launch({ headless: true, executablePath: fs.existsSync(EXE) ? EXE : undefined, args: ['--use-angle=metal', '--ignore-gpu-blocklist', '--enable-gpu', '--mute-audio'] });
const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
// off the live channel, nothing spent on voices, nothing written to the shared world
await ctx.addInitScript(() => { const WS = window.WebSocket, Fake = function (url, protos) { return new WS(/supabase/i.test(String(url)) ? 'ws://127.0.0.1:9/' : url, protos); }; Fake.prototype = WS.prototype; Fake.CONNECTING = 0; Fake.OPEN = 1; Fake.CLOSING = 2; Fake.CLOSED = 3; window.WebSocket = Fake; });
await ctx.route(/\/api\/(tts|sts)/, r => r.fulfill({ status: 500, body: '' }));
await ctx.route(/\/api\/(world|hub)/, r => r.request().method() === 'POST' ? r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }) : r.continue());
const page = await ctx.newPage();
page.on('pageerror', e => say('PAGE ERROR', String(e).slice(0, 300)));
const ready = () => page.waitForFunction(() => window.__icarus && document.querySelector('#flyBtn'), null, { timeout: 180000 });
await page.goto(URL0, { waitUntil: 'domcontentloaded' }); await ready();
await page.evaluate(() => localStorage.setItem('icarus.save.v3', JSON.stringify({ v: 3, realm: 'over', phase: 'free', deaths: 1, met: [], gossip: [], events: [], day: 0.955, titans: 'stone', quests: [], perks: {}, known: [], intro: [], lit: [], gods: {}, others: {}, great: {}, stats: {} })));
await page.goto(URL0, { waitUntil: 'domcontentloaded' }); await ready(); await page.waitForTimeout(2000);
const gl = await page.evaluate(() => { const g = document.createElement('canvas').getContext('webgl2'), e = g && g.getExtension('WEBGL_debug_renderer_info'); return g ? (e ? g.getParameter(e.UNMASKED_RENDERER_WEBGL) : 'webgl2') : 'none'; });
say('renderer:', gl);
await page.evaluate(() => document.querySelector('#flyBtn').click());
for (let i = 0; i < 16; i++) { await page.waitForTimeout(1000); await page.evaluate(() => { const I = window.__icarus; I.setDay(0.955); I.setStorm(0); }); }   // (the name burns across the sky first; and the night is let settle)
const st = await page.evaluate(() => { const I = window.__icarus; return { state: typeof I.state === 'function' ? I.state() : I.state, net: I.NET.on, morphed: I.flags.morphed }; });
say('in the air:', JSON.stringify(st)); if (st.net !== false) { say('STOP: the page is on the live channel'); await browser.close(); process.exit(1); }
await page.addScriptTag({ url: '/tools/warfilm.js?' + Date.now() });
const started = await page.evaluate(() => window.FILM.start()); say('start:', started); if (started !== 'ok') { await browser.close(); process.exit(1); }

let shot = 0, r = null, pre = 0;
for (;;) {
  r = await page.evaluate(() => window.FILM.step());
  if (r.err) { say('FILM ERROR', r.err); break; }
  if (!r.rolling) { if (++pre > 900) { say('never began rolling', JSON.stringify(r)); break; } continue; }
  if ((shot % EVERY) === 0) await page.screenshot({ path: path.join(OUT, 'f' + String(Math.floor(shot / EVERY)).padStart(5, '0') + '.jpg'), type: 'jpeg', quality: 93 });
  shot++;
  if (shot % 60 === 0) say(`frame ${shot} · ${(shot / 30).toFixed(1)} s · ${r.phase} · ${r.alive} alive · ${r.stage} ${r.bi}`);
  if (r.done || shot > 30 * 110) break;
}
const info = await page.evaluate(() => ({ kills: window.FILM.kills, log: window.FILM.log, frames: window.FILM.frame, err: window.FILM.err }));
fs.writeFileSync(path.join(OUT, 'film.json'), JSON.stringify({ frames: shot, kept: Math.ceil(shot / EVERY), ...info }, null, 1));
say('done:', shot, 'frames ·', info.kills.length, 'out ·', info.err || 'no error');
await browser.close();
// ffmpeg -framerate 30 -i f%05d.jpg -c:v libx264 -pix_fmt yuv420p -crf 17 warzone.mp4
