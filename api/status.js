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
  if (key && req.url.includes('tes=1')) {
    // Uji 1 panggilan teks ringan ke Gemini supaya tahu kuncinya valid.
    try {
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${out.model_mata}:generateContent?key=${encodeURIComponent(key)}`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: 'Balas satu kata: siap' }] }] }),
      });
      const d = await r.json();
      out.uji_mata = r.ok ? 'OK: ' + (d?.candidates?.[0]?.content?.parts?.[0]?.text || '').trim().slice(0, 40) : 'GAGAL: ' + (d?.error?.message || `HTTP ${r.status}`);
    } catch (e) { out.uji_mata = 'GAGAL: ' + (e?.message || 'jaringan'); }
  }
  res.end(JSON.stringify(out, null, 2));
}
