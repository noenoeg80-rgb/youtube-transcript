import { youtubeId } from './_transcript.js';
import { storyboardSpec, parseSpec, frameAt, isStoryboardUrl } from './_storyboard.js';

export const config = { maxDuration: 20 };

// GET /api/frames?v=<link atau ID>&t=90,225  → frame pratinjau YouTube untuk tiap detik
// GET /api/frames?img=<url i.ytimg.com/sb/...> → proxy sprite (same-origin agar bisa dipotong di canvas)
export default async function handler(req, res) {
  const url = new URL(req.url, 'http://localhost');
  const img = url.searchParams.get('img');
  if (img) return proxy(img, res);

  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('content-type', 'application/json; charset=utf-8');
  const id = youtubeId(url.searchParams.get('v') || '');
  const times = String(url.searchParams.get('t') || '')
    .split(',').map(Number).filter((n) => Number.isFinite(n) && n >= 0).slice(0, 20);
  if (!id || !times.length) {
    res.statusCode = 400;
    res.end(JSON.stringify({ error: 'Butuh v (video YouTube) dan t (detik, dipisah koma).' }));
    return;
  }
  const sb = await storyboardSpec(id);
  const levels = sb ? parseSpec(sb.spec, sb.lengthSeconds) : [];
  if (!levels.length) {
    res.statusCode = 404;
    res.end(JSON.stringify({ error: 'Gambar pratinjau YouTube tidak tersedia untuk video ini.' }));
    return;
  }
  const level = levels.reduce((a, b) => (b.width * b.height > a.width * a.height ? b : a));
  const frames = times.map((t) => {
    const f = frameAt(level, t);
    return { t, src: `/api/frames?img=${encodeURIComponent(f.url)}`, x: f.x, y: f.y, w: f.w, h: f.h };
  });
  res.end(JSON.stringify({ video_id: id, width: level.width, height: level.height, frames }));
}

async function proxy(img, res) {
  if (!isStoryboardUrl(img)) {
    res.statusCode = 400;
    res.end('URL tidak diizinkan.');
    return;
  }
  try {
    const r = await fetch(img);
    if (!r.ok) {
      res.statusCode = 502;
      res.end(`Sprite HTTP ${r.status}`);
      return;
    }
    res.setHeader('content-type', r.headers.get('content-type') || 'image/jpeg');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.end(Buffer.from(await r.arrayBuffer()));
  } catch {
    res.statusCode = 502;
    res.end('Gagal mengambil sprite.');
  }
}
