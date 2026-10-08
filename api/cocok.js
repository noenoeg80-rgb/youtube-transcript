// Robot Pencocok (YouTube Transkrip): matches each screenshot to the transcript around its timestamp
// and describes what is SEEN, so ChatGPT (text-only) receives visual context, not just words.
//
// POST /api/cocok  { video_id, title, items:[{ start, clock, label, context, image /* data:image/jpeg;base64 */, exact }] }
// → { mode: 'mata'|'tanpa_mata', items:[{ start, clock, deskripsi_gambar, cocok, catatan }], ringkasan }
//
// "mata" uses Gemini (GEMINI_API_KEY in Vercel env; free tier). Without a key, the robot runs
// "tanpa_mata": timestamp/transcript matching only, and flags every image as not-yet-seen.
// Images are processed in memory and never stored on the server.

export const config = { maxDuration: 60 };

const MODEL = process.env.GEMINI_MODEL || 'gemini-flash-latest';

function readBody(req) {
  return new Promise((ok, no) => {
    let s = '';
    req.on('data', (c) => { s += c; if (s.length > 12_000_000) { no(new Error('Body terlalu besar (maks ~12 MB).')); req.destroy(); } });
    req.on('end', () => { try { ok(JSON.parse(s || '{}')); } catch { no(new Error('JSON tidak valid.')); } });
    req.on('error', no);
  });
}

function dataUrlParts(d) {
  const m = String(d || '').match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/);
  return m ? { mime: m[1], data: m[2] } : null;
}

async function withGemini(video, items) {
  const key = process.env.GEMINI_API_KEY;
  const parts = [{
    text: `Kamu adalah Robot Pencocok YouTube Transkrip. Untuk SETIAP gambar di bawah, tulis dalam bahasa Indonesia:
1. deskripsi_gambar: apa yang terlihat (orang/produk/teks di layar/angka/grafik/lokasi), 1-3 kalimat, hanya yang benar-benar tampak.
2. cocok: "ya" jika gambar sesuai dengan kutipan transkrip di detik itu, "sebagian", atau "tidak".
3. catatan: informasi tambahan dari gambar yang TIDAK ada di transkrip (harga di layar, nama merek, tulisan, tempat), atau "-" bila tidak ada.
Jangan menebak di luar yang terlihat. Jika gambar ditandai "tidak tepat di detiknya", katakan konteks visual hanya perkiraan.
Jawab HANYA JSON: {"items":[{"start":<detik>,"deskripsi_gambar":"...","cocok":"ya|sebagian|tidak","catatan":"..."}],"ringkasan":"2-3 kalimat: apa yang ditunjukkan video secara visual dan apakah sejalan dengan yang dibicarakan"}.

Video: ${video.title || video.video_id}`,
  }];
  for (const it of items) {
    const img = dataUrlParts(it.image);
    parts.push({ text: `\n--- Gambar detik ${it.start} [${it.clock}]${it.exact ? '' : ' (tidak tepat di detiknya, gambar terdekat)'}\nKutipan transkrip: ${it.label || ''}\nKonteks sekitar: ${it.context || '-'}` });
    if (img) parts.push({ inline_data: { mime_type: img.mime, data: img.data } });
    else parts.push({ text: '(gambar tidak tersedia)' });
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 45000);
  try {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${encodeURIComponent(key)}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ contents: [{ role: 'user', parts }], generationConfig: { temperature: 0.2, responseMimeType: 'application/json' } }),
      signal: controller.signal,
    });
    const d = await r.json();
    if (!r.ok) throw new Error(d?.error?.message || `Gemini HTTP ${r.status}`);
    const text = d?.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('') || '{}';
    const out = JSON.parse(text.replace(/^```json\s*|```$/g, ''));
    return { mode: 'mata', model: MODEL, ...out };
  } finally {
    clearTimeout(timer);
  }
}

function withoutEyes(items) {
  return {
    mode: 'tanpa_mata',
    items: items.map((it) => ({
      start: it.start,
      deskripsi_gambar: it.exact ? 'Gambar di detik ini belum dilihat robot (kunci Gemini belum dipasang).' : 'Gambar terdekat, bukan detik tepat; belum dilihat robot.',
      cocok: 'belum_dicek',
      catatan: it.exact ? '-' : 'Pakai "Lihat pelan" untuk memastikan konteks visual.',
    })),
    ringkasan: 'Robot mencocokkan hanya lewat timestamp dan transkrip; isi gambar belum dideskripsikan. Pasang GEMINI_API_KEY di Vercel untuk mengaktifkan mata.',
  };
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('content-type', 'application/json; charset=utf-8');
  if (req.method !== 'POST') { res.statusCode = 405; res.end(JSON.stringify({ error: 'Gunakan POST.' })); return; }
  try {
    const body = await readBody(req);
    const items = Array.isArray(body.items) ? body.items.slice(0, 8) : [];
    if (!items.length) { res.statusCode = 400; res.end(JSON.stringify({ error: 'Butuh items[].' })); return; }
    let out;
    if (process.env.GEMINI_API_KEY) {
      try { out = await withGemini({ video_id: body.video_id, title: body.title }, items); }
      catch (e) { out = { ...withoutEyes(items), galat_mata: e?.message || 'Gemini gagal' }; }
    } else out = withoutEyes(items);
    // merge back clock/label so the client can render without re-joining
    const byStart = new Map(items.map((i) => [Number(i.start), i]));
    out.items = (out.items || []).map((o) => { const src = byStart.get(Number(o.start)) || {}; return { ...o, clock: src.clock, label: src.label, exact: src.exact !== false }; });
    res.statusCode = 200;
    res.end(JSON.stringify(out));
  } catch (e) {
    res.statusCode = 400;
    res.end(JSON.stringify({ error: e?.message || 'Gagal mencocokkan.' }));
  }
}
