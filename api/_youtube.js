// Jalur langsung ke caption YouTube (tanpa kunci, tanpa pihak ketiga). Dipakai bila Supadata tidak diatur
// dan sumber gratis youtube-transcript.ai menolak (mis. HTTP 401).
const CLIENTS = [
  { name: 'ANDROID', version: '20.10.38', ua: 'com.google.android.youtube/20.10.38 (Linux; U; Android 14) gzip', extra: { androidSdkVersion: 34 } },
  { name: 'TVHTML5_SIMPLY_EMBEDDED_PLAYER', version: '2.0', ua: 'Mozilla/5.0 (SMART-TV; Linux; Tizen 6.0) AppleWebKit/537.36 (KHTML, like Gecko) Version/6.0 TV Safari/537.36', extra: {}, embed: true },
];

async function ft(url, options = {}, ms = 12000) {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), ms);
  try { return await fetch(url, { ...options, signal: c.signal }); } finally { clearTimeout(t); }
}

export function parseJson3(data) {
  const segs = [];
  for (const ev of data?.events || []) {
    if (!ev?.segs) continue;
    const text = ev.segs.map((s) => s.utf8 || '').join('').replace(/\s+/g, ' ').trim();
    if (text) segs.push({ start: Math.max(0, (ev.tStartMs || 0) / 1000), text });
  }
  return segs;
}

export function pickTrack(tracks, lang) {
  if (!tracks?.length) return null;
  const want = lang && lang !== 'auto' ? [lang] : ['id', 'en'];
  for (const w of want) {
    const manual = tracks.find((t) => t.languageCode?.startsWith(w) && t.kind !== 'asr');
    if (manual) return manual;
    const auto = tracks.find((t) => t.languageCode?.startsWith(w));
    if (auto) return auto;
  }
  return tracks.find((t) => t.kind !== 'asr') || tracks[0];
}

export async function fromYouTube(id, lang = 'auto') {
  let lastError = 'Caption YouTube tidak tersedia.';
  for (const c of CLIENTS) {
    try {
      const body = { context: { client: { clientName: c.name, clientVersion: c.version, hl: 'id', ...c.extra }, ...(c.embed ? { thirdParty: { embedUrl: 'https://www.google.com' } } : {}) }, videoId: id, contentCheckOk: true, racyCheckOk: true };
      const r = await ft('https://www.youtube.com/youtubei/v1/player?prettyPrint=false', { method: 'POST', headers: { 'content-type': 'application/json', 'user-agent': c.ua }, body: JSON.stringify(body) });
      if (!r.ok) { lastError = `YouTube merespons HTTP ${r.status}.`; continue; }
      const j = await r.json();
      const st = j?.playabilityStatus?.status;
      if (st && st !== 'OK') { lastError = `YouTube: ${st}${j.playabilityStatus.reason ? ` (${String(j.playabilityStatus.reason).slice(0, 80)})` : ''}.`; continue; }
      const track = pickTrack(j?.captions?.playerCaptionsTracklistRenderer?.captionTracks, lang);
      if (!track?.baseUrl) { lastError = 'Video ini tidak punya caption.'; continue; }
      const u = new URL(track.baseUrl);
      if (!/(^|\.)youtube\.com$/.test(u.hostname)) { lastError = 'Alamat caption tidak dikenal.'; continue; }
      u.searchParams.set('fmt', 'json3');
      const cr = await ft(u.toString(), { headers: { 'user-agent': c.ua } });
      if (!cr.ok) { lastError = `Caption merespons HTTP ${cr.status}.`; continue; }
      const segments = parseJson3(await cr.json());
      if (segments.length < 2) { lastError = 'Caption kosong.'; continue; }
      return { text: segments.map((s) => s.text).join(' '), segments, duration: Number(j?.videoDetails?.lengthSeconds) || 0, language: track.languageCode || 'auto' };
    } catch (e) {
      lastError = e?.name === 'AbortError' ? 'YouTube melebihi batas waktu.' : 'Tidak dapat menjangkau YouTube.';
    }
  }
  throw new Error(lastError);
}
