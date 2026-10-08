// Teliksandi SOP "paket bahan" for one video:
// transcript → relevant parts (with context) → screenshot per part → context check → package.
// Rules: no guessing — anything missing or uncertain goes into `kekurangan`.

import { getTranscript, clock } from './_transcript.js';
import { storyboardSpec, parseSpec, frameAt } from './_storyboard.js';

const STOP = new Set(['yang', 'dan', 'di', 'ke', 'dari', 'untuk', 'dengan', 'the', 'and', 'for', 'of', 'to', 'in', 'a']);

export function queryWords(q) {
  return String(q || '').toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((w) => w.length >= 2 && !STOP.has(w));
}

// Count whole-word hits for short words (so "ai" does not match "pantai"), substring hits for longer ones.
export function countWord(low, w) {
  if (w.length <= 3) return (low.match(new RegExp(`(^|[^\\p{L}\\p{N}])${w}(?=$|[^\\p{L}\\p{N}])`, 'gu')) || []).length;
  return low.split(w).length - 1;
}

// "3 hari yang lalu" / "2 weeks ago" → approximate ISO date (null if unknown).
export function approxUploadDate(published, now = new Date()) {
  const t = String(published || '').toLowerCase();
  const m = t.match(/(\d+)\s*(detik|menit|jam|hari|minggu|bulan|tahun|second|minute|hour|day|week|month|year)/);
  if (!m) return null;
  const n = Number(m[1]);
  const unit = { detik: 1, second: 1, menit: 60, minute: 60, jam: 3600, hour: 3600, hari: 86400, day: 86400, minggu: 604800, week: 604800, bulan: 2592000, month: 2592000, tahun: 31536000, year: 31536000 }[m[2]];
  return new Date(now.getTime() - n * unit * 1000).toISOString().slice(0, 10);
}

// Windows of ~30s; score by query words (main) + moment emphasis (bonus).
function relevantParts(segments, words, moments, { max = 4, windowSec = 30 } = {}) {
  const wins = [];
  let cur = null;
  for (const s of segments) {
    if (!cur || s.start - cur.start >= windowSec) {
      if (cur) wins.push(cur);
      cur = { start: s.start, parts: [] };
    }
    cur.parts.push(s.text);
  }
  if (cur) wins.push(cur);
  const W = wins.map((w, i) => ({ i, start: w.start, text: w.parts.join(' ') }));
  const momentStarts = (moments || []).map((m) => m.start);
  const scored = W.map((w) => {
    const low = w.text.toLowerCase();
    const hits = words.reduce((a, q) => a + countWord(low, q), 0);
    const bonus = momentStarts.some((s) => Math.abs(s - w.start) < windowSec) ? 2 : 0;
    return { ...w, score: hits * 3 + bonus, hits };
  }).filter((w) => w.score > 0);
  scored.sort((a, b) => b.score - a.score || a.start - b.start);
  const picked = [];
  for (const w of scored) {
    if (picked.length >= max) break;
    if (picked.some((p) => Math.abs(p.i - w.i) < 2)) continue;
    picked.push(w);
  }
  return picked.sort((a, b) => a.start - b.start).map((w) => ({
    start: Math.floor(w.start),
    clock: clock(w.start),
    kutipan: w.text.length > 400 ? w.text.slice(0, 397) + '…' : w.text,
    konteks_sebelum: W[w.i - 1] ? W[w.i - 1].text.slice(-220) : '',
    konteks_sesudah: W[w.i + 1] ? W[w.i + 1].text.slice(0, 220) : '',
    cocok_kata: w.hits,
  }));
}

// Exact storyboard frame when YouTube allows it; otherwise nearest official still (≈25/50/75%).
async function shotsFor(id, times, duration, base) {
  let level = null;
  try {
    const sb = await storyboardSpec(id);
    const levels = sb ? parseSpec(sb.spec, sb.lengthSeconds) : [];
    if (levels.length) level = levels.reduce((a, b) => (b.width * b.height > a.width * a.height ? b : a));
  } catch {}
  return times.map((t) => {
    if (level) {
      const f = frameAt(level, t);
      return { src: `${base}/api/frames?img=${encodeURIComponent(f.url)}`, x: f.x, y: f.y, w: f.w, h: f.h, waktu: clock(t), tepat: true };
    }
    if (!duration) return { src: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`, waktu: null, tepat: false, catatan: 'sampul video (durasi tidak diketahui)' };
    const frac = t / duration;
    const k = frac < 0.375 ? 1 : frac < 0.625 ? 2 : 3;
    const approx = Math.round((duration * k) / 4);
    return { src: `https://i.ytimg.com/vi/${id}/hq${k}.jpg`, waktu: clock(approx), tepat: Math.abs(approx - t) <= 20, catatan: `gambar terdekat (±${k * 25}% video, sekitar ${clock(approx)})` };
  });
}

export async function buildPackage(video, query, base, budgetMs) {
  const words = queryWords(query);
  const kekurangan = [];
  const paket = {
    link: video.url,
    judul: video.title,
    kanal: video.channel,
    tanggal_unggah_teks: video.published_text || null,
    tanggal_unggah_perkiraan: approxUploadDate(video.published_text),
    ditonton: video.views ?? null,
    durasi_teks: video.length_text || null,
  };
  let t;
  try {
    t = await getTranscript(video.video_id, 'auto', budgetMs, { segments: true });
  } catch (e) {
    kekurangan.push(`Transkrip gagal: ${e?.message || 'tidak tersedia'}`);
  }
  const segments = t?.segments || null;
  paket.sumber_transkrip = t?.source || null;
  paket.transkrip = t ? String(t.text || '').slice(0, 20000) : null;
  if (t && !segments) kekurangan.push('Transkrip tanpa penanda waktu: bagian terpilih tidak bisa dipasangkan ke adegan.');

  const duration = t?.duration || (segments ? Math.ceil(segments[segments.length - 1].start + 10) : 0);
  let parts = segments ? relevantParts(segments, words, t.moments) : [];
  if (segments && !parts.length) {
    kekurangan.push('Tidak ada bagian yang menyebut kata kunci; dipakai momen penting umum.');
    parts = (t.moments || []).slice(0, 4).map((m) => ({ start: m.start, clock: clock(m.start), kutipan: m.label, konteks_sebelum: '', konteks_sesudah: '', cocok_kata: 0 }));
  }
  const shots = parts.length ? await shotsFor(video.video_id, parts.map((p) => p.start), duration, base) : [];
  paket.bagian_terpilih = parts.map((p, i) => ({
    ...p,
    link_detik: `https://www.youtube.com/watch?v=${video.video_id}&t=${p.start}s`,
    screenshot: shots[i] || null,
  }));
  paket.screenshot_sampul = `https://i.ytimg.com/vi/${video.video_id}/hqdefault.jpg`;

  // Context check (SOP step "Konteks sudah jelas?")
  const perluPelan = paket.bagian_terpilih.filter((p) => !p.screenshot || !p.screenshot.tepat);
  paket.perlu_lihat_pelan = perluPelan.map((p) => ({ waktu: p.clock, link: p.link_detik, alasan: p.screenshot ? 'gambar belum tepat di detik ini' : 'tidak ada gambar' }));
  if (!paket.transkrip) kekurangan.push('Tanpa transkrip: isi pembicaraan belum diketahui.');
  if (perluPelan.length) kekurangan.push(`${perluPelan.length} bagian butuh dilihat pelan (gambar belum tepat di detiknya).`);
  paket.konteks_jelas = Boolean(paket.transkrip && paket.bagian_terpilih.length && !perluPelan.length);
  paket.status = paket.konteks_jelas ? 'LENGKAP' : paket.transkrip ? 'PERLU_LIHAT_PELAN' : 'KURANG_BAHAN';
  paket.kekurangan = kekurangan;
  paket.catatan_konteks = paket.bagian_terpilih.length
    ? `${paket.bagian_terpilih.length} bagian menyebut topik "${query}"; ${paket.bagian_terpilih.filter((p) => p.screenshot?.tepat).length} sudah punya gambar tepat.`
    : 'Belum ada bagian terpilih.';
  return paket;
}
