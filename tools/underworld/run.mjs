// The Underworld missions, played through in a browser nobody sees or hears (always ?mute, always headless).
//   PORT=8144 node tools/underworld/run.mjs                 every test here, each in a fresh page
//   PORT=8144 node tools/underworld/run.mjs ferry hades     only those (by file name, without .js)
//   SHARE=1 …                                               one page for all of them, in order (faster; they then share a world)
// Each test is a file holding `async (page) => …` that returns { ok, …what it saw }. Needs the keyless dev server
// (ICARUS_NO_ENV=1 node dev-server.mjs) and the playwright the other browser tests use.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const PW = process.env.PLAYWRIGHT || '/Users/andres/.npm/_npx/9833c18b2d85bc59/node_modules/playwright/index.mjs';
const { chromium } = await import(PW);
const EXE = '/Users/andres/Library/Caches/ms-playwright/chromium-1243/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const PORT = process.env.PORT || 8144, B = `http://localhost:${PORT}/?mute&menu=over`;
const ORDER = ['descent', 'ferry', 'hades', 'persephone', 'underquest', 'sagaunder', 'trackers', 'ways'];
const want = process.argv.slice(2), files = (want.length ? want : ORDER).map(n => path.join(HERE, n.endsWith('.js') ? n : n + '.js'));
const SEED = JSON.stringify({ v: 3, cv: 2, realm: 'over', phase: 'gods', deaths: 1, met: ['hermes', 'zeus', 'athena'], gossip: [], events: [], day: 0.5, titans: 'stone', quests: [], perks: {}, known: [], intro: [], name: 'ZZTEST' });
const browser = await chromium.launch({ headless: true, executablePath: fs.existsSync(EXE) ? EXE : undefined, args: ['--use-angle=metal', '--ignore-gpu-blocklist', '--enable-gpu', '--mute-audio', '--disable-features=WebRtcHideLocalIpsWithMdns', '--autoplay-policy=no-user-gesture-required'] });
async function boot() {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  await ctx.addInitScript(() => { const WS = window.WebSocket, Fake = function (url, protos) { return new WS(/supabase/i.test(String(url)) ? 'ws://127.0.0.1:9/' : url, protos); }; Fake.prototype = WS.prototype; Fake.CONNECTING = 0; Fake.OPEN = 1; Fake.CLOSING = 2; Fake.CLOSED = 3; window.WebSocket = Fake; });
  await ctx.route(/\/api\/(tts|sts|god|voice|guide)/, r => r.fulfill({ status: 500, body: '' }));   // (no voices, no live gods: the fixed lines are what is tested)
  await ctx.route(/\/api\/world/, r => r.request().method() === 'POST' ? r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }) : r.continue());   // (nothing written to the shared world)
  const page = await ctx.newPage(), errs = [];
  page.on('pageerror', e => errs.push('PAGEERR ' + String(e).slice(0, 400)));
  page.on('console', m => { if (m.type() === 'error' && !/127\.0\.0\.1:9|ERR_UNSAFE_PORT|status of 50\d|localhost:4747|ERR_CONNECTION_REFUSED/.test(m.text())) errs.push(m.text().slice(0, 300)); });
  const ready = () => page.waitForFunction(() => window.__icarus && document.querySelector('#flyBtn'), null, { timeout: 600000 });
  await page.goto(B, { waitUntil: 'domcontentloaded', timeout: 600000 }); await ready();
  await page.evaluate(seed => { localStorage.setItem('icarus.patron', 'zeus'); localStorage.setItem('icarus.name', 'ZZTEST'); localStorage.setItem('icarus.save.v3', seed); }, SEED);
  await page.goto(B, { waitUntil: 'domcontentloaded', timeout: 600000 }); await ready(); await page.waitForTimeout(1500);
  await page.evaluate(() => document.querySelector('#flyBtn').click());
  await page.waitForFunction(() => window.__icarus.state === 'play', null, { timeout: 120000 }).catch(() => {});
  await page.waitForTimeout(+(process.env.BURN || 6000));
  await page.evaluate(() => { window.__icarus.flags.morphed = true; });
  return { ctx, page, errs };
}
let S = null, bad = 0;
for (const f of files) {
  if (!S || !process.env.SHARE) { if (S) await S.ctx.close(); S = await boot(); }
  const name = path.basename(f, '.js'), t0 = Date.now(), n0 = S.errs.length;
  let res; try { res = await (0, eval)('(' + fs.readFileSync(f, 'utf8') + ')')(S.page); } catch (e) { res = { ok: false, threw: String(e).slice(0, 600) }; }
  const errs = S.errs.slice(n0); if (errs.length) res = { ...res, ok: false, pageErrors: errs.slice(0, 8) };
  if (!res || !res.ok) bad++;
  console.log(`${res && res.ok ? 'PASS' : 'FAIL'} ${name} (${Math.round((Date.now() - t0) / 1000)} s) ${JSON.stringify(res)}`);
}
await browser.close();
console.log(bad ? `${bad} FAILED` : 'ALL PASSED');
process.exit(bad ? 1 : 0);
