// Teliksandi Radar YouTube — collector for the KEPO Bank Data.
// GET /api/teliksandi?q=<kata kunci>&n=8&upload=minggu|hari|bulan|semua&deep=1
//   → videos found for the keyword (no YouTube API key needed)
//   → with deep=1: for the top video(s), transcript excerpt + important moments + preview screenshots
// Read-only: only public video data. No comments, no accounts, no personal data.

import { searchYouTube } from './_ytsearch.js';
import { getTranscript, clock } from './_transcript.js';
import { storyboardSpec, parseSpec, frameAt } from './_storyboard.js';
import { buildPackage, queryWords, countWord } from './_paket.js';

export const config = { maxDuration: 60 };

function origin(req) {
  const host = req.headers['x-forwarded-host'] || req.headers.host || 'youtube-transcript-anita-5823.vercel.app';
  const proto = req.headers['x-forwarded-proto'] || 'https';
  return `${proto}://${host}`;
}

// Without timed segments (free transcript source) there are no moments:
// fall back to evenly spaced preview frames across the video.
async function evenShots(id, base, count = 5) {
  const sb = await storyboardSpec(id);
  const len = sb?.lengthSeconds || 0;
  if (!len) return thumbShots(id);
  const times = Array.from({ length: count }, (_, i) => Math.floor((len * (i + 1)) / (count + 1)));
  const shots = await screenshots(id, times, base, sb);
  return times.map((t, i) => ({
    start: t,
    clock: clock(t),
    link: `https://www.youtube.com/watch?v=${id}&t=${t}s`,
    label: 'Cuplikan otomatis',
    tags: ['cuplikan'],
    screenshot: shots[i] || null,
  }));
}

// YouTube's own still images (cover + auto frames near 25%, 50%, 75% of the video).
// Always public, no storyboard needed — used when YouTube refuses the storyboard to servers.
function thumbShots(id) {
  const shots = [
    ['hqdefault', 'Sampul video', 'sampul'],
    ['hq1', 'Cuplikan ±25%', 'cuplikan'],
    ['hq2', 'Cuplikan ±50%', 'cuplikan'],
    ['hq3', 'Cuplikan ±75%', 'cuplikan'],
  ];
  return shots.map(([name, label, tag]) => ({
    start: null,
    clock: null,
    link: `https://www.youtube.com/watch?v=${id}`,
    label,
    tags: [tag],
    screenshot: { src: `https://i.ytimg.com/vi/${id}/${name}.jpg`, x: 0, y: 0, w: 480, h: 360, full: true },
  }));
}

async function screenshots(id, times, base, known = null) {
  if (!times.length) return [];
  const sb = known || (await storyboardSpec(id));
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
    if (!out.moments.length) out.moments = await evenShots(video.video_id, base).catch(() => []);
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
    if (u.searchParams.get('mode') === 'paket') {
      // SOP Teliksandi: seleksi → paket bahan (transkrip + bagian terpilih + screenshot + cek konteks)
      const words = queryWords(q);
      const relevan = videos.filter((v) => {
        const low = `${v.title} ${v.snippet}`.toLowerCase();
        return words.some((w) => countWord(low, w) > 0);
      });
      const ditolak = videos.filter((v) => !relevan.includes(v)).map((v) => ({ link: v.url, judul: v.title, alasan: 'judul/deskripsi tidak menyebut topik' }));
      const take = Math.min(3, Math.max(1, Number(u.searchParams.get('deep')) || 2));
      const paket = [];
      for (const v of relevan.slice(0, take)) {
        const left = deadline - Date.now();
        if (left < 12000) break;
        paket.push(await buildPackage(v, q, base, Math.min(30000, left - 6000)));
      }
      res.statusCode = 200;
      res.end(JSON.stringify({ perintah: q, upload, ditemukan: videos.length, relevan: relevan.length, ditolak, paket, kandidat_lain: relevan.slice(take).map((v) => ({ link: v.url, judul: v.title, kanal: v.channel, unggah: v.published_text })), at: new Date().toISOString() }));
      return;
    }
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
