// Shared transcript loader.
// 1) Supadata (stable, paid) when SUPADATA_API_KEY is set — supports YouTube, TikTok, Instagram, Facebook, X.
// 2) Fallback: free youtube-transcript.ai source (YouTube only, often rate-limited).

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
  return true;
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

async function fromSupadata(sourceUrl, lang, deadline) {
  const key = process.env.SUPADATA_API_KEY;
  const params = new URLSearchParams({ url: sourceUrl, text: 'true', mode: 'auto' });
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
      if (job.status === 'completed') return { text: supadataText(job.content), language: job.lang || lang || 'auto' };
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
  return { text: supadataText(data.content), language: data.lang || lang || 'auto' };
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
      return { text, language: lang || 'auto' };
    } catch (e) {
      lastError = e?.name === 'AbortError' ? 'Sumber gratis melebihi batas waktu.' : 'Tidak dapat mengakses sumber gratis.';
    }
  }
  throw new Error(lastError);
}

// input: YouTube link/ID, or (with Supadata) a TikTok/Instagram/Facebook/X link.
export async function getTranscript(input, language = 'auto', budgetMs = 50000) {
  const deadline = Date.now() + budgetMs;
  const id = youtubeId(input);
  const sourceUrl = id ? `https://www.youtube.com/watch?v=${id}` : String(input || '').trim();
  if (!id && !isHttpUrl(sourceUrl)) throw new Error('Link tidak valid.');

  const errors = [];
  if (process.env.SUPADATA_API_KEY) {
    try {
      const res = await fromSupadata(sourceUrl, language, deadline);
      if (validTranscript(res.text)) return { ...res, source: 'supadata', video_id: id, source_url: sourceUrl };
      errors.push('Supadata: transkrip kosong.');
    } catch (e) {
      errors.push(e?.message || 'Supadata gagal.');
    }
  }
  if (id) {
    try {
      const res = await fromFreeSource(id, language);
      return { ...res, source: 'gratis', video_id: id, source_url: sourceUrl };
    } catch (e) {
      errors.push(e?.message || 'Sumber gratis gagal.');
    }
  } else if (!process.env.SUPADATA_API_KEY) {
    errors.push('Link non-YouTube butuh SUPADATA_API_KEY.');
  }
  throw new Error(errors.join(' | '));
}
