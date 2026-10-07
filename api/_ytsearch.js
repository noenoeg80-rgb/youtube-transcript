// YouTube search without an API key (Innertube "search" endpoint, same one youtube.com uses).
// Returns plain video cards; used by /api/teliksandi to find videos for a keyword.

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

// Upload-date filters (YouTube "sp"/params values).
const FILTER = { hari: 'EgIIAg%3D%3D', minggu: 'EgIIAw%3D%3D', bulan: 'EgIIBA%3D%3D', semua: '' };

const txt = (o) => (o?.simpleText ?? (Array.isArray(o?.runs) ? o.runs.map((r) => r.text).join('') : '')) || '';

// "1,2 rb x ditonton" / "12K views" / "1.234 views" → number (best effort).
export function parseViews(s) {
  const t = String(s || '').toLowerCase().replace(/\s+/g, ' ');
  const m = t.match(/([\d.,]+)\s*(rb|ribu|jt|juta|m|k|b|mln)?/);
  if (!m) return null;
  let n = m[1];
  const unit = m[2] || '';
  if (unit) n = n.replace(',', '.');
  else n = n.replace(/[.,]/g, '');
  let v = parseFloat(n);
  if (!Number.isFinite(v)) return null;
  if (['rb', 'ribu', 'k'].includes(unit)) v *= 1e3;
  if (['jt', 'juta', 'm', 'mln'].includes(unit)) v *= 1e6;
  if (unit === 'b') v *= 1e9;
  return Math.round(v);
}

function collect(node, out) {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) { for (const n of node) collect(n, out); return; }
  const v = node.videoRenderer;
  if (v?.videoId) {
    out.push({
      video_id: v.videoId,
      url: `https://www.youtube.com/watch?v=${v.videoId}`,
      title: txt(v.title),
      channel: txt(v.ownerText || v.longBylineText),
      channel_id: v.ownerText?.runs?.[0]?.navigationEndpoint?.browseEndpoint?.browseId || null,
      views_text: txt(v.viewCountText),
      views: parseViews(txt(v.viewCountText)),
      published_text: txt(v.publishedTimeText),
      length_text: txt(v.lengthText),
      snippet: txt(v.detailedMetadataSnippets?.[0]?.snippetText),
    });
    return;
  }
  for (const k of Object.keys(node)) collect(node[k], out);
}

export async function searchYouTube(query, { limit = 10, upload = 'minggu', hl = 'id', gl = 'ID' } = {}) {
  const body = {
    query,
    context: { client: { clientName: 'WEB', clientVersion: '2.20250101.00.00', hl, gl } },
  };
  const p = FILTER[upload] ?? FILTER.minggu;
  if (p) body.params = decodeURIComponent(p);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const r = await fetch('https://www.youtube.com/youtubei/v1/search?prettyPrint=false', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'user-agent': UA, 'accept-language': hl },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!r.ok) throw new Error(`YouTube search HTTP ${r.status}`);
    const d = await r.json();
    const out = [];
    collect(d?.contents, out);
    const seen = new Set();
    return out.filter((v) => !seen.has(v.video_id) && seen.add(v.video_id)).slice(0, limit);
  } finally {
    clearTimeout(timer);
  }
}
