// Teliksandi Radar YouTube — collector for the KEPO Bank Data.
// GET /api/teliksandi?q=<kata kunci>&n=8&upload=minggu|hari|bulan|semua&deep=1
//   → videos found for the keyword (no YouTube API key needed)
//   → with deep=1: for the top video(s), transcript excerpt + important moments + preview screenshots
// Read-only: only public video data. No comments, no accounts, no personal data.

import { searchYouTube } from './_ytsearch.js';
import { getTranscript, clock } from './_transcript.js';
import { storyboardSpec, parseSpec, frameAt } from './_storyboard.js';

export const config = { maxDuration: 60 };

function origin(req) {
  const host = req.headers['x-forwarded-host'] || req.headers.host || 'youtube-transcript-anita-5823.vercel.app';
  const proto = req.headers['x-forwarded-proto'] || 'https';
  return `${proto}://${host}`;
}

async function screenshots(id, times, base) {
  if (!times.length) return [];
  const sb = await storyboardSpec(id);
  const levels = sb ? parseSpec(sb.spec, sb.lengthSeconds) : [];
  if (!levels.length) return times.map(() => null);
  const level = levels.reduce((a, b) => (b.width * b.height > a.width * a.height ? b : a));
  return times.map((t) => {
    const f = frameAt(level, t);
    return { src: `${base}/api/frames?img=${encodeURIComponent(f.url)}`, x: f.x, y: f.y, w: f.w, h: f.h };
  });
}

async function detail(video, base, deadline) {
  const budget = Math.max(8000, deadline - Date.now() - 4000);
  const out = { video_id: video.video_id, url: video.url, title: video.title };
  try {
    const t = await getTranscript(video.video_id, 'auto', budget, { timestamps: false });
    out.source = t.source;
    out.language = t.language;
    out.transcript = String(t.text || '').slice(0, 20000);
    const moments = Array.isArray(t.moments) ? t.moments : [];
    const shots = await screenshots(video.video_id, moments.map((m) => m.start), base).catch(() => []);
    out.moments = moments.map((m, i) => ({
      start: m.start,
      clock: clock(m.start),
      link: `https://www.youtube.com/watch?v=${video.video_id}&t=${m.start}s`,
      label: m.label,
      tags: m.tags,
      screenshot: shots[i] || null,
    }));
  } catch (e) {
    out.error = e?.message || 'Transkrip gagal.';
  }
  return out;
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('content-type', 'application/json; charset=utf-8');
  if (req.method !== 'GET') {
    res.statusCode = 405;
    res.end(JSON.stringify({ error: 'Gunakan GET.' }));
    return;
  }
  const deadline = Date.now() + 55000;
  const u = new URL(req.url, 'http://localhost');
  const q = (u.searchParams.get('q') || '').trim().slice(0, 120);
  const n = Math.min(15, Math.max(1, Number(u.searchParams.get('n')) || 8));
  const upload = u.searchParams.get('upload') || 'minggu';
  const deepN = Math.min(2, Math.max(0, Number(u.searchParams.get('deep')) || 0));
  if (!q) {
    res.statusCode = 400;
    res.end(JSON.stringify({ error: 'Butuh q (kata kunci).' }));
    return;
  }
  try {
    const videos = await searchYouTube(q, { limit: n, upload });
    const base = origin(req);
    const details = [];
    for (const v of videos.slice(0, deepN)) {
      if (Date.now() > deadline - 10000) break;
      details.push(await detail(v, base, deadline));
    }
    res.statusCode = 200;
    res.end(JSON.stringify({ query: q, upload, count: videos.length, videos, details, at: new Date().toISOString() }));
  } catch (e) {
    res.statusCode = 502;
    res.end(JSON.stringify({ error: e?.message || 'Gagal mencari video.' }));
  }
}
