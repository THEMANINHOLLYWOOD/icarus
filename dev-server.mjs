// Local dev: serves the game and runs the api/ routes with keys from .env.local
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT) || 8123;

for (const f of ['.env', '.env.local']) {
  const p = path.join(root, f);
  if (!fs.existsSync(p)) continue;
  for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && m[2] && !line.trim().startsWith('#')) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.mp3': 'audio/mpeg', '.css': 'text/css' };

http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${port}`);
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
    const fp = path.join(root, url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname));
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
