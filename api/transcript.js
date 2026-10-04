import { getTranscript } from './_transcript.js';

export const config = { maxDuration: 60 };

// GET /api/transcript?url=<link atau video ID>&lang=id|en|auto
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('content-type', 'application/json; charset=utf-8');
  if (req.method !== 'GET') {
    res.statusCode = 405;
    res.end(JSON.stringify({ error: 'Gunakan GET.' }));
    return;
  }
  const url = new URL(req.url, 'http://localhost');
  const input = url.searchParams.get('url') || url.searchParams.get('id') || '';
  const lang = url.searchParams.get('lang') || 'auto';
  try {
    const result = await getTranscript(input, lang);
    res.statusCode = 200;
    res.end(JSON.stringify(result));
  } catch (e) {
    res.statusCode = 502;
    res.end(JSON.stringify({ error: e?.message || 'Gagal mengambil transcript.' }));
  }
}
