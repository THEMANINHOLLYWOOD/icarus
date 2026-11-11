// Catches what the page sends while a clip is being recorded (frames, then the soundtrack) and writes it to tools/cap/.
// Run: node tools/cap.mjs   — listens on 127.0.0.1:8124 only; the page posts to /f/<name>.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const out = path.join(path.dirname(fileURLToPath(import.meta.url)), 'cap');
fs.mkdirSync(out, { recursive: true });
http.createServer(async (req, res) => {
  // (any of this machine's own dev servers may send frames)
  const o = req.headers.origin || '', cors = { 'Access-Control-Allow-Origin': /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(o) ? o : 'http://localhost:8123', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' };
  if (req.method === 'OPTIONS') return res.writeHead(204, cors).end();
  const u = new URL(req.url, 'http://x'), m = u.pathname.match(/^\/f\/([A-Za-z0-9_.-]{1,40})$/), append = u.searchParams.get('a') === '1';   // (?a=1: add to the file — big frames arrive in pieces)
  if (req.method !== 'POST' || !m) return res.writeHead(404, cors).end();
  const chunks = []; for await (const c of req) chunks.push(c);
  (append ? fs.appendFileSync : fs.writeFileSync)(path.join(out, m[1]), Buffer.concat(chunks));
  res.writeHead(200, cors).end('ok');
}).listen(8124, '127.0.0.1', () => console.log('capture on 8124 ->', out));
