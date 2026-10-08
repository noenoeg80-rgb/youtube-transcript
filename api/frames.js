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
  let sb = await storyboardSpec(id);
  // Client may pass the storyboard spec it read from the YouTube player (server lookups are often refused).
  const clientSpec = url.searchParams.get('spec');
  if (!sb && clientSpec && clientSpec.includes('|')) sb = { spec: clientSpec, lengthSeconds: Number(url.searchParams.get('len')) || 0 };
  const levels = sb ? parseSpec(sb.spec, sb.lengthSeconds) : [];
  if (!levels.length) {
    // Fallback: YouTube's official stills (cover + frames near 25/50/75%). Always available, not time-exact.
    const len = Number(url.searchParams.get('len')) || 0;
    const frames = times.map((t) => {
      const k = len ? Math.min(3, Math.max(1, Math.round((t / len) * 4))) : 0;
      const name = k ? `hq${k}` : 'hqdefault';
      const approx = len ? Math.round((len * k) / 4) : null;
      return { t, src: `https://i.ytimg.com/vi/${id}/${name}.jpg`, x: 0, y: 0, w: 480, h: 360, full: true, approx, exact: false };
    });
    res.statusCode = 200;
    res.end(JSON.stringify({ video_id: id, width: 480, height: 360, exact: false, frames, note: 'Storyboard ditolak YouTube; dipakai gambar resmi terdekat (±25/50/75%).' }));
    return;
  }
  const level = levels.reduce((a, b) => (b.width * b.height > a.width * a.height ? b : a));
  const frames = times.map((t) => {
    const f = frameAt(level, t);
    return { t, src: `/api/frames?img=${encodeURIComponent(f.url)}`, x: f.x, y: f.y, w: f.w, h: f.h };
  });
  res.end(JSON.stringify({ video_id: id, width: level.width, height: level.height, exact: true, frames: frames.map((f) => ({ ...f, exact: true })) }));
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
