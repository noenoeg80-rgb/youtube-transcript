// Jalur langsung ke caption YouTube (tanpa kunci, tanpa pihak ketiga). Dipakai bila Supadata tidak diatur
// dan sumber gratis youtube-transcript.ai menolak (mis. HTTP 401).
const CLIENTS = [
  { name: 'ANDROID_VR', version: '1.60.19', ua: 'com.google.android.apps.youtube.vr.oculus/1.60.19 (Linux; U; Android 12L; eureka-user Build/SQ3A.220605.009.A1) gzip', extra: { deviceMake: 'Oculus', deviceModel: 'Quest 3', osName: 'Android', osVersion: '12L', androidSdkVersion: 32 } },
  { name: 'IOS', version: '20.10.4', ua: 'com.google.ios.youtube/20.10.4 (iPhone16,2; U; CPU iOS 18_3_2 like Mac OS X;)', extra: { deviceMake: 'Apple', deviceModel: 'iPhone16,2', osName: 'iPhone', osVersion: '18.3.2.22D82' } },
  { name: 'WEB_EMBEDDED_PLAYER', version: '1.20250310.01.00', ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36', extra: {}, embed: true },
  { name: 'MWEB', version: '2.20250311.03.00', ua: 'Mozilla/5.0 (iPad; CPU OS 16_7_10 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1', extra: {} },
  { name: 'ANDROID', version: '20.10.38', ua: 'com.google.android.youtube/20.10.38 (Linux; U; Android 14) gzip', extra: { androidSdkVersion: 34 } },
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
  const errs = [];
  let lastError = 'Caption YouTube tidak tersedia.';
  for (const c of CLIENTS) {
    try {
      const body = { context: { client: { clientName: c.name, clientVersion: c.version, hl: 'id', ...c.extra }, ...(c.embed ? { thirdParty: { embedUrl: 'https://www.google.com' } } : {}) }, videoId: id, contentCheckOk: true, racyCheckOk: true };
      const r = await ft('https://www.youtube.com/youtubei/v1/player?prettyPrint=false', { method: 'POST', headers: { 'content-type': 'application/json', 'user-agent': c.ua }, body: JSON.stringify(body) });
      if (!r.ok) { lastError = `${c.name}: HTTP ${r.status}`; errs.push(lastError); continue; }
      const j = await r.json();
      const st = j?.playabilityStatus?.status;
      if (st && st !== 'OK') { lastError = `${c.name}: ${st}${j.playabilityStatus.reason ? ` (${String(j.playabilityStatus.reason).slice(0, 60)})` : ''}`; errs.push(lastError); continue; }
      const track = pickTrack(j?.captions?.playerCaptionsTracklistRenderer?.captionTracks, lang);
      if (!track?.baseUrl) { lastError = `${c.name}: tidak ada caption`; errs.push(lastError); continue; }
      const u = new URL(track.baseUrl);
      if (!/(^|\.)youtube\.com$/.test(u.hostname)) { lastError = 'Alamat caption tidak dikenal.'; errs.push(lastError); continue; }
      u.searchParams.set('fmt', 'json3');
      const cr = await ft(u.toString(), { headers: { 'user-agent': c.ua } });
      if (!cr.ok) { lastError = `${c.name}: caption HTTP ${cr.status}`; errs.push(lastError); continue; }
      const segments = parseJson3(await cr.json());
      if (segments.length < 2) { lastError = `${c.name}: caption kosong`; errs.push(lastError); continue; }
      return { text: segments.map((s) => s.text).join(' '), segments, duration: Number(j?.videoDetails?.lengthSeconds) || 0, language: track.languageCode || 'auto' };
    } catch (e) {
      lastError = `${c.name}: ` + (e?.name === 'AbortError' ? 'waktu habis' : 'tidak terjangkau'); errs.push(lastError);
    }
  }
  throw new Error(`YouTube langsung gagal (${errs.join('; ') || lastError})`);
}
