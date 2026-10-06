// YouTube storyboard ("preview thumbnails" shown when hovering the seek bar).
// Sprite sheets on i.ytimg.com/sb/ hold a grid of small frames at a fixed interval;
// we map a second to the sprite page and the cell inside it.

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

async function fetchWithTimeout(url, options = {}, ms = 10000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

// 1) Innertube player API, 2) watch page HTML. Returns { spec, lengthSeconds } or null.
async function fromPlayerApi(id) {
  const r = await fetchWithTimeout('https://www.youtube.com/youtubei/v1/player?prettyPrint=false', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'user-agent': UA },
    body: JSON.stringify({ videoId: id, context: { client: { clientName: 'WEB', clientVersion: '2.20250101.00.00', hl: 'en' } } }),
  });
  if (!r.ok) return null;
  const d = await r.json();
  const spec = d?.storyboards?.playerStoryboardSpecRenderer?.spec;
  return spec ? { spec, lengthSeconds: Number(d?.videoDetails?.lengthSeconds) || 0 } : null;
}

async function fromWatchPage(id) {
  const r = await fetchWithTimeout(`https://www.youtube.com/watch?v=${id}&hl=en`, {
    headers: { 'user-agent': UA, 'accept-language': 'en', cookie: 'CONSENT=YES+1' },
  });
  if (!r.ok) return null;
  const html = await r.text();
  const m = html.match(/"playerStoryboardSpecRenderer":\{"spec":("(?:[^"\\]|\\.)*")/);
  if (!m) return null;
  const len = html.match(/"lengthSeconds":"(\d+)"/);
  return { spec: JSON.parse(m[1]), lengthSeconds: len ? Number(len[1]) : 0 };
}

export async function storyboardSpec(id) {
  for (const get of [fromPlayerApi, fromWatchPage]) {
    try {
      const res = await get(id);
      if (res) return res;
    } catch {}
  }
  return null;
}

// spec: "<base url with $L and $N>|w#h#count#cols#rows#intervalMs#name#sigh|..."
export function parseSpec(spec, lengthSeconds = 0) {
  const [base, ...parts] = String(spec || '').split('|');
  if (!base || !parts.length) return [];
  return parts.map((p, L) => {
    const [w, h, count, cols, rows, interval, name, sigh] = p.split('#');
    const n = Number(count) || 0;
    let ms = Number(interval) || 0;
    if (!ms && n && lengthSeconds) ms = (lengthSeconds * 1000) / n;
    return { L, base, width: Number(w), height: Number(h), count: n, cols: Number(cols), rows: Number(rows), interval: ms, name, sigh };
  }).filter((l) => l.width && l.height && l.count && l.cols && l.rows && l.interval && l.name);
}

// Frame for second t in a level: sprite URL + crop rectangle.
export function frameAt(level, t) {
  const index = Math.min(level.count - 1, Math.max(0, Math.floor((t * 1000) / level.interval)));
  const perPage = level.cols * level.rows;
  const page = Math.floor(index / perPage);
  const cell = index % perPage;
  const name = level.name.replace('$M', String(page));
  let url = level.base.replace('$L', String(level.L)).replace('$N', name);
  if (level.sigh) url += `${url.includes('?') ? '&' : '?'}sigh=${level.sigh}`;
  return { url, x: (cell % level.cols) * level.width, y: Math.floor(cell / level.cols) * level.height, w: level.width, h: level.height };
}

export function isStoryboardUrl(value) {
  try {
    const u = new URL(value);
    return u.protocol === 'https:' && /^i\d*\.ytimg\.com$/.test(u.hostname) && u.pathname.startsWith('/sb/');
  } catch {
    return false;
  }
}
