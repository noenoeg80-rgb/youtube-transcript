// GET /api/status → kesiapan aplikasi YouTube Transkrip (tanpa membocorkan nilai kunci).
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('content-type', 'application/json; charset=utf-8');
  const key = process.env.GEMINI_API_KEY || '';
  const out = {
    app: 'YouTube Transkrip',
    mata_gemini: key ? 'TERPASANG' : 'BELUM',
    model_mata: process.env.GEMINI_MODEL || 'gemini-flash-latest',
    transkrip_stabil_supadata: process.env.SUPADATA_API_KEY ? 'TERPASANG' : 'BELUM (pakai sumber gratis)',
    google_drive: process.env.GOOGLE_CLIENT_ID ? 'TERPASANG' : 'BELUM',
    waktu: new Date().toISOString(),
  };
  const models = (process.env.GEMINI_MODEL ? [process.env.GEMINI_MODEL] : []).concat(['gemini-flash-latest', 'gemini-2.5-flash', 'gemini-flash-lite-latest', 'gemini-2.0-flash']).filter((m, i, a) => a.indexOf(m) === i);
  out.model_cadangan = models.slice(1);
  if (key && req.url.includes('tes=1')) {
    // Uji 1 panggilan teks ringan ke Gemini supaya tahu kuncinya valid.
    out.uji_mata = [];
    for (const m of models) {
      try {
        const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${encodeURIComponent(key)}`, {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: 'Balas satu kata: siap' }] }] }),
        });
        const d = await r.json();
        out.uji_mata.push(`${m}: ` + (r.ok ? 'OK ' + (d?.candidates?.[0]?.content?.parts?.[0]?.text || '').trim().slice(0, 20) : 'GAGAL ' + (d?.error?.message || `HTTP ${r.status}`).slice(0, 80)));
        if (r.ok) { out.mata_siap = m; break; }
      } catch (e) { out.uji_mata.push(`${m}: GAGAL ${e?.message || 'jaringan'}`); }
    }
  }
  res.end(JSON.stringify(out, null, 2));
}
