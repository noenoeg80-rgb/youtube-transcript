// Server mandiri untuk VPS (Docker). Menjalankan handler yang sama dengan Vercel: api/*.js + file statis.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3000;
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png', '.md': 'text/markdown' };
const handlers = new Map();

async function apiHandler(name) {
  if (!/^[a-z][\w-]*$/i.test(name) || name.startsWith('_')) return null;
  if (!handlers.has(name)) {
    const file = path.join(ROOT, 'api', `${name}.js`);
    if (!fs.existsSync(file)) return null;
    const mod = await import(file);
    handlers.set(name, mod.default);
  }
  return handlers.get(name);
}

http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname.startsWith('/api/')) {
      const h = await apiHandler(url.pathname.slice(5));
      if (!h) { res.statusCode = 404; res.end('API tidak ada'); return; }
      return await h(req, res);
    }
    let file = url.pathname === '/' ? '/index.html' : url.pathname;
    file = path.normalize(file).replace(/^(\.\.[/\\])+/, '');
    const full = path.join(ROOT, file);
    if (!full.startsWith(ROOT) || !fs.existsSync(full) || fs.statSync(full).isDirectory() || file.startsWith('/api') || file.startsWith('/node_modules')) { res.statusCode = 404; res.end('Tidak ada'); return; }
    res.setHeader('content-type', MIME[path.extname(full)] || 'application/octet-stream');
    if (full.endsWith('.html')) res.setHeader('Cache-Control', 'no-store, max-age=0, must-revalidate');
    fs.createReadStream(full).pipe(res);
  } catch (e) {
    console.error(e);
    if (!res.headersSent) { res.statusCode = 500; res.end('Kesalahan server'); }
  }
}).listen(PORT, () => console.log(`YouTube Transkrip jalan di :${PORT}`));
