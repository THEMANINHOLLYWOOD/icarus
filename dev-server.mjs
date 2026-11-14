// Local dev: serves the game and runs the api/ routes with keys from .env.local
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT) || 8123;

for (const f of process.env.ICARUS_NO_ENV ? [] : ['.env', '.env.local']) {   // (ICARUS_NO_ENV=1: no keys at all, so the whole world is kept in memory and nothing real is touched)
  const p = path.join(root, f);
  if (!fs.existsSync(p)) continue;
  for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && m[2] && !line.trim().startsWith('#')) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.mp3': 'audio/mpeg', '.css': 'text/css', '.sh': 'text/plain; charset=utf-8' };

http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${port}`);
  if (url.pathname === '/mcp') { url.pathname = '/api/hub'; url.searchParams.set('fn', 'mcp'); }   // (as vercel.json rewrites it)
  { const w = { '/.well-known/oauth-protected-resource': 'prm', '/.well-known/oauth-protected-resource/mcp': 'prm', '/.well-known/oauth-authorization-server': 'asm', '/.well-known/oauth-authorization-server/mcp': 'asm', '/.well-known/openid-configuration': 'asm', '/register': 'register', '/token': 'token' }[url.pathname];
    if (w) { url.pathname = '/api/hub'; url.searchParams.set('fn', 'oauth'); url.searchParams.set('w', w); }
    else if (url.pathname === '/authorize') url.pathname = '/connect/index.html'; else if (url.pathname === '/connect.sh') url.pathname = '/connect/install.sh'; }
  try {
    const api = url.pathname.match(/^\/api\/([a-z]+)$/);
    if (api) {
      const mod = await import(pathToFileURL(path.join(root, 'api', `${api[1]}.js`)).href);
      const fn = mod[req.method];
      if (!fn) return res.writeHead(405).end();
      const chunks = [];
      for await (const c of req) chunks.push(c);
      const body = chunks.length ? Buffer.concat(chunks) : undefined;
      const request = new Request(url, { method: req.method, headers: req.headers, body: ['GET', 'HEAD'].includes(req.method) ? undefined : body });
      const out = await fn(request);
      res.writeHead(out.status, Object.fromEntries(out.headers));
      if (out.body) for await (const c of out.body) res.write(c);
      return res.end();
    }
    let fp = path.join(root, url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname));
    try { if (fs.statSync(fp).isDirectory()) fp = path.join(fp, 'index.html'); } catch {}   // (a folder: its index, the way Vercel serves one)
    if (!(fp === root || fp.startsWith(root + path.sep)) || fp.includes(`${path.sep}.`)) return res.writeHead(403).end();
    fs.readFile(fp, (e, d) => {
      if (e) return res.writeHead(404).end();
      res.writeHead(200, { 'Content-Type': TYPES[path.extname(fp)] || 'application/octet-stream' }).end(d);
    });
  } catch (e) {
    console.error(e);
    res.writeHead(500).end(String(e));
  }
}).listen(port, '127.0.0.1', () => console.log(`icarus on http://localhost:${port}`));
