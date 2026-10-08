// Shared transcript loader.
// 1) Supadata (stable, paid) when SUPADATA_API_KEY is set — supports YouTube, TikTok, Instagram, Facebook, X.
// 2) Fallback: free youtube-transcript.ai source (YouTube only, often rate-limited).

import { pickMoments } from './_moments.js';

export function youtubeId(value) {
  const v = String(value || '').trim();
  if (/^[\w-]{11}$/.test(v)) return v;
  try {
    const u = new URL(v);
    const h = u.hostname.toLowerCase();
    let id = null;
    if (h === 'youtu.be') id = u.pathname.split('/').filter(Boolean)[0];
    if (h === 'youtube.com' || h.endsWith('.youtube.com')) {
      id = u.searchParams.get('v');
      const p = u.pathname.split('/').filter(Boolean);
      if (!id && ['shorts', 'live', 'embed'].includes(p[0])) id = p[1];
    }
    return /^[\w-]{11}$/.test(id || '') ? id : null;
  } catch {
    return null;
  }
}

function isHttpUrl(value) {
  try {
    const u = new URL(String(value || '').trim());
    return u.protocol === 'https:' || u.protocol === 'http:';
  } catch {
    return false;
  }
}

// Rejects HTML pages, JSON errors and rate-limit notices that free sources return with HTTP 200.
export function validTranscript(text) {
  const t = String(text || '').trim();
  if (t.length <= 20) return false;
  if (/^\s*(?:<!doctype|<html|\{\s*"(?:error|detail)"|(?:error|not found|unavailable|access denied|rate limit)\b)/i.test(t)) return false;
  if (t.length < 1500 && /(high volume|rate limit|too many requests|higher rate limits|api key)/i.test(t)) return false;
  if (/has no auto-generated captions|transcript cannot be extracted/i.test(t.slice(0, 2000))) return false;
  return true;
}

// Auto-captions from the free source repeat each phrase 2-3x ("A B. A B. A B.").
// Collapse immediately repeated word sequences (longest first).
export function collapseRepeats(text) {
  let w = String(text || '').split(/\s+/).filter(Boolean);
  const key = (a) => a.join(' ').toLowerCase().replace(/[.,!?;:]+/g, '');
  for (let L = Math.min(40, Math.floor(w.length / 2)); L >= 2; L--) {
    const out = [];
    let i = 0;
    while (i < w.length) {
      if (i + 2 * L <= w.length) {
        const k = key(w.slice(i, i + L));
        let j = i + L;
        while (j + L <= w.length && key(w.slice(j, j + L)) === k) j += L;
        if (j > i + L) { out.push(...w.slice(i, i + L)); i = j; continue; }
      }
      out.push(w[i]);
      i += 1;
    }
    w = out;
  }
  return w.join(' ');
}

// Free source format: header lines, then "## Transcript", then "[m:ss] text" blocks.
// Returns { body, segments, duration } with repeats collapsed.
export function parseFreeTranscript(raw) {
  const s = String(raw || '');
  const dur = s.match(/Duration:\s*((?:\d+:)?\d+:\d{2})/);
  const toSec = (c) => c.split(':').map(Number).reduce((a, b) => a * 60 + b, 0);
  const idx = s.indexOf('## Transcript');
  const body = idx >= 0 ? s.slice(idx + 13) : s;
  const segments = [];
  const re = /\[((?:\d+:)?\d+:\d{2})\]\s*([\s\S]*?)(?=\n?\s*\[(?:\d+:)?\d+:\d{2}\]|$)/g;
  let m;
  while ((m = re.exec(body))) {
    const text = collapseRepeats(m[2].replace(/\s+/g, ' ').trim());
    if (text) segments.push({ start: toSec(m[1]), text });
  }
  const text = segments.length ? segments.map((x) => x.text).join(' ') : collapseRepeats(body.replace(/\s+/g, ' ').trim());
  return { text, segments: segments.length ? segments : null, duration: dur ? toSec(dur[1]) : 0 };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchWithTimeout(url, options = {}, ms = 20000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function supadataText(content) {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) return content.map((c) => c?.text || '').join(' ');
  return '';
}

// Supadata segments: [{ text, offset (ms), duration (ms), lang }]
export function supadataSegments(content) {
  if (!Array.isArray(content)) return null;
  const segs = content
    .map((c) => ({ start: Math.max(0, Math.round(Number(c?.offset) || 0) / 1000), text: String(c?.text || '').trim() }))
    .filter((s) => s.text);
  return segs.length ? segs : null;
}

export function clock(sec) {
  const s = Math.floor(sec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${r}` : `${String(m).padStart(2, '0')}:${r}`;
}

// Groups segments into blocks of ~groupSec seconds: "[mm:ss] text ..."
export function timedText(segments, groupSec = 30) {
  const lines = [];
  let cur = null;
  for (const s of segments) {
    if (!cur || s.start - cur.start >= groupSec) {
      if (cur) lines.push(`[${clock(cur.start)}] ${cur.parts.join(' ')}`);
      cur = { start: s.start, parts: [] };
    }
    cur.parts.push(s.text);
  }
  if (cur) lines.push(`[${clock(cur.start)}] ${cur.parts.join(' ')}`);
  return lines.join('\n');
}

// Always asks for segments: they feed timestamps and important-moment detection.
async function fromSupadata(sourceUrl, lang, deadline) {
  const key = process.env.SUPADATA_API_KEY;
  const params = new URLSearchParams({ url: sourceUrl, text: 'false', mode: 'auto' });
  if (lang && lang !== 'auto') params.set('lang', lang);
  const headers = { 'x-api-key': key };

  const r = await fetchWithTimeout(`https://api.supadata.ai/v1/transcript?${params}`, { headers });
  if (r.status === 202) {
    const { jobId } = await r.json();
    if (!jobId) throw new Error('Supadata tidak memberi jobId.');
    while (Date.now() < deadline) {
      await sleep(1500);
      const p = await fetchWithTimeout(`https://api.supadata.ai/v1/transcript/${encodeURIComponent(jobId)}`, { headers });
      if (!p.ok) throw new Error(`Supadata job HTTP ${p.status}.`);
      const job = await p.json();
      if (job.status === 'completed') return { text: supadataText(job.content), segments: supadataSegments(job.content), language: job.lang || lang || 'auto' };
      if (job.status === 'failed') throw new Error(job.error?.message || 'Supadata gagal memproses video.');
    }
    throw new Error('Transkrip video panjang masih diproses. Coba lagi sebentar lagi.');
  }
  if (!r.ok) {
    let detail = '';
    try { detail = (await r.json())?.message || ''; } catch {}
    throw new Error(`Supadata HTTP ${r.status}${detail ? `: ${detail}` : ''}.`);
  }
  const data = await r.json();
  return { text: supadataText(data.content), segments: supadataSegments(data.content), language: data.lang || lang || 'auto' };
}

async function fromFreeSource(id, requestedLanguage) {
  const langs = requestedLanguage && requestedLanguage !== 'auto' ? [requestedLanguage] : ['id', 'en', ''];
  let lastError = 'Transcript tidak tersedia.';
  for (const lang of langs) {
    try {
      const suffix = lang ? `?lang=${encodeURIComponent(lang)}` : '';
      const r = await fetchWithTimeout(`https://youtube-transcript.ai/transcript/${id}.txt${suffix}`, {
        headers: { 'user-agent': 'TranscriptAI/1.0' },
      }, 15000);
      if (!r.ok) { lastError = `Sumber gratis merespons HTTP ${r.status}.`; continue; }
      const text = await r.text();
      if (!validTranscript(text)) { lastError = 'Sumber gratis menolak (batas akses) atau tidak ada caption.'; continue; }
      const parsed = parseFreeTranscript(text);
      return { text: parsed.text, segments: parsed.segments, duration: parsed.duration, raw_header: text.slice(0, text.indexOf('## Transcript') > 0 ? text.indexOf('## Transcript') : 0), language: lang || 'auto' };
    } catch (e) {
      lastError = e?.name === 'AbortError' ? 'Sumber gratis melebihi batas waktu.' : 'Tidak dapat mengakses sumber gratis.';
    }
  }
  throw new Error(lastError);
}

// Best-effort video title (YouTube oEmbed, no key). Used to name files saved to Drive.
async function youtubeTitle(sourceUrl) {
  try {
    const r = await fetchWithTimeout(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(sourceUrl)}`, {}, 4000);
    if (!r.ok) return null;
    const d = await r.json();
    return typeof d?.title === 'string' ? d.title : null;
  } catch {
    return null;
  }
}

// input: YouTube link/ID, or (with Supadata) a TikTok/Instagram/Facebook/X link.
// options.timestamps: also return segments + timed_text ("[mm:ss] ...") when the source supports it (Supadata).
// moments (important timestamps, see _moments.js) are returned whenever segments are available.
export async function getTranscript(input, language = 'auto', budgetMs = 50000, options = {}) {
  const withTimestamps = Boolean(options.timestamps);
  const deadline = Date.now() + budgetMs;
  const id = youtubeId(input);
  const sourceUrl = id ? `https://www.youtube.com/watch?v=${id}` : String(input || '').trim();
  if (!id && !isHttpUrl(sourceUrl)) throw new Error('Link tidak valid.');

  const titlePromise = id ? youtubeTitle(sourceUrl) : Promise.resolve(null);
  const errors = [];
  if (process.env.SUPADATA_API_KEY) {
    try {
      const res = await fromSupadata(sourceUrl, language, deadline);
      if (validTranscript(res.text)) {
        const out = { text: res.text, language: res.language, source: 'supadata', video_id: id, source_url: sourceUrl, title: await titlePromise };
        if (res.segments) out.moments = pickMoments(res.segments);
        if ((withTimestamps || options.segments) && res.segments) {
          out.segments = res.segments;
          out.timed_text = timedText(res.segments);
        }
        return out;
      }
      errors.push('Supadata: transkrip kosong.');
    } catch (e) {
      errors.push(e?.message || 'Supadata gagal.');
    }
  }
  if (id) {
    try {
      const res = await fromFreeSource(id, language);
      const { segments, raw_header, ...rest } = res;
      const out = { ...rest, source: 'gratis', video_id: id, source_url: sourceUrl, title: await titlePromise };
      if (segments) {
        out.moments = pickMoments(segments);
        if (withTimestamps || options.segments) {
          out.segments = segments;
          out.timed_text = timedText(segments);
        }
      } else if (withTimestamps) {
        out.timestamps_note = 'Sumber gratis tidak memberi timestamp untuk video ini.';
      }
      return out;
    } catch (e) {
      errors.push(e?.message || 'Sumber gratis gagal.');
    }
  } else if (!process.env.SUPADATA_API_KEY) {
    errors.push('Link non-YouTube butuh SUPADATA_API_KEY.');
  }
  throw new Error(errors.join(' | '));
}
