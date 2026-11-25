#!/usr/bin/env node
// What is sent to the server is the game with the air let out of it: the same code, with its comments and spacing taken
// away (nothing renamed, nothing rewritten), so there is a quarter less to fetch and a third less for a phone to read
// before the title comes up. The files in the repo stay as they are written; this is run on the copy that is deployed.
//
//   node tools/build.mjs <folder>      index.html (its stylesheets and the game's script), audio.js and xr.js, in place
//
// It needs esbuild (`npx --no-install esbuild`). Anything it cannot shrink, or that does not parse afterwards, is left
// exactly as it was, and it says so and exits 1: a deploy can go ahead with the files as written.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const dir = process.argv[2];
if (!dir || !fs.existsSync(path.join(dir, 'index.html'))) { console.error('usage: node tools/build.mjs <folder with index.html>'); process.exit(2); }

function shrink(code, loader) {
  const args = ['--no-install', 'esbuild', `--loader=${loader}`, '--minify-whitespace', '--legal-comments=none', '--charset=utf8', '--log-level=error'];
  if (loader === 'js') args.push('--format=esm', '--target=esnext');
  const r = spawnSync('npx', args, { input: code, encoding: 'utf8', maxBuffer: 1 << 28 });
  if (r.status !== 0 || !r.stdout) throw new Error((r.stderr || 'esbuild gave nothing back').trim().split('\n')[0]);
  return r.stdout.trim();
}
function parses(js) {   // (as a module, the way the browser will read it)
  const f = path.join(os.tmpdir(), `icarus-build-${process.pid}.mjs`);
  fs.writeFileSync(f, js); const r = spawnSync(process.execPath, ['--check', f]); fs.rmSync(f, { force: true });
  return r.status === 0;
}
const kb = n => (n / 1024).toFixed(0) + ' KB';
let failed = false;

// the page: each stylesheet, and the game's own script (the big one; the few lines before it are left alone)
{ const file = path.join(dir, 'index.html'), src = fs.readFileSync(file, 'utf8');
  try {
    const scripts = [...src.matchAll(/<script type="module">([\s\S]*?)<\/script>/g)], game = scripts.reduce((a, b) => (b[1].length > a[1].length ? b : a));
    const js = shrink(game[1], 'js');
    if (/<\/script/i.test(js) || !parses(js)) throw new Error('the game\'s script did not survive it');
    let out = src.slice(0, game.index) + '<script type="module">' + js + '</script>' + src.slice(game.index + game[0].length);
    out = out.replace(/(<style[^>]*>)([\s\S]*?)(<\/style>)/g, (all, a, css, z) => { const c = shrink(css, 'css'); if (/<\/style/i.test(c)) throw new Error('a stylesheet did not survive it'); return a + c + z; });
    fs.writeFileSync(file, out); console.log(`index.html  ${kb(src.length)} -> ${kb(out.length)}`);
  } catch (e) { failed = true; console.error('index.html left as written: ' + e.message); } }

// the two modules it loads
for (const name of ['audio.js', 'xr.js']) {
  const file = path.join(dir, name); if (!fs.existsSync(file)) continue;
  const src = fs.readFileSync(file, 'utf8');
  try { const js = shrink(src, 'js'); if (!parses(js)) throw new Error('it did not parse afterwards'); fs.writeFileSync(file, js + '\n'); console.log(`${name.padEnd(11)} ${kb(src.length)} -> ${kb(js.length)}`); }
  catch (e) { failed = true; console.error(name + ' left as written: ' + e.message); }
}
process.exit(failed ? 1 : 0);
