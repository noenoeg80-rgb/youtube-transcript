import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';
import { getTranscript } from './_transcript.js';
import { searchYouTube } from './_ytsearch.js';
import { buildPackage, queryWords, countWord } from './_paket.js';

// Bank Data Teliksandi (KEPO). Publishable key: public by design; reads go through the
// read-only function hermes_bank_data, writes only through gpt_usul (review queue + daily quota).
const KEPO = 'https://beglzlljgbcpmfktuvbs.supabase.co/rest/v1/rpc/';
const KEPO_KEY = 'sb_publishable__2ADgDgCMCyf_9Ux_U97Ng_S7OBp6SO';
async function kepo(fn, body) {
  const r = await fetch(KEPO + fn, {
    method: 'POST',
    headers: { apikey: KEPO_KEY, Authorization: `Bearer ${KEPO_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`KEPO ${fn} HTTP ${r.status}: ${text.slice(0, 300)}`);
  try { return JSON.parse(text); } catch { return text; }
}
const BASE = 'https://youtube-transcript-woad-nine.vercel.app';
const ok = (obj) => ({ content: [{ type: 'text', text: typeof obj === 'string' ? obj : JSON.stringify(obj) }] });
const fail = (e) => ({ isError: true, content: [{ type: 'text', text: String(e?.message || e) }] });

export const config = { maxDuration: 60 };

function createServer() {
  const server = new McpServer({
    name: 'youtube-transkrip',
    version: '1.0.0',
  });

  server.registerTool(
    'get_youtube_transcript',
    {
      title: 'Get YouTube transcript',
      description: 'Gunakan tool ini ketika pengguna memberikan link YouTube dan ingin isi video, ringkasan, analisis, poin penting, insight bisnis, entitas, atau ide konten. Ambil transcript melalui layanan Transcript AI milik pengguna. Untuk transcript panjang, panggil lagi dengan next_offset sampai has_more=false sebelum membuat analisis menyeluruh. Hasil pertama bisa memuat important_moments (detik penting + link lompat) untuk dijadikan bahan insight.',
      inputSchema: {
        url: z.string().min(1).describe('Link YouTube atau video ID 11 karakter. Dengan SUPADATA_API_KEY, link TikTok, Instagram, Facebook, dan X juga didukung.'),
        language: z.string().optional().describe('Kode bahasa seperti id atau en. Kosong/auto akan mencoba id, en, lalu bahasa asli.'),
        offset: z.number().int().min(0).optional().describe('Posisi karakter mulai. Gunakan next_offset dari hasil sebelumnya untuk transcript panjang.'),
        max_chars: z.number().int().min(4000).max(30000).optional().describe('Jumlah maksimum karakter per panggilan. Default 24000.'),
        timestamps: z.boolean().optional().describe('true = transcript per blok ~30 detik dengan penanda [mm:ss], untuk dicocokkan dengan screenshot/catatan visual. Butuh SUPADATA_API_KEY; jika tidak tersedia, hasil tanpa timestamp.'),
      },
      annotations: {
        readOnlyHint: true,
        openWorldHint: true,
        destructiveHint: false,
      },
    },
    async ({ url, language = 'auto', offset = 0, max_chars = 24000, timestamps = false }) => {
      try {
        const r = await getTranscript(url, language, 45000, { timestamps });
        const { language: usedLanguage, source, video_id: id, source_url, title, moments } = r;
        const timed = Boolean(timestamps && r.timed_text);
        const text = timed ? r.timed_text : r.text;
        const start = Math.min(offset, text.length);
        const end = Math.min(start + max_chars, text.length);
        const chunk = text.slice(start, end);
        const hasMore = end < text.length;
        const meta = {
          video_id: id,
          ...(title ? { title } : {}),
          source_url,
          source,
          language: usedLanguage,
          total_chars: text.length,
          offset: start,
          returned_chars: chunk.length,
          next_offset: hasMore ? end : null,
          has_more: hasMore,
          timestamps: timed,
          ...(timed && id ? { jump_url_template: `https://www.youtube.com/watch?v=${id}&t={seconds}s` } : {}),
          ...(r.timestamps_note ? { timestamps_note: r.timestamps_note } : {}),
          // Important moments only on the first chunk, so paging does not repeat them.
          ...(start === 0 && moments?.length ? { important_moments: moments.map((m) => ({ ...m, ...(id ? { url: `https://www.youtube.com/watch?v=${id}&t=${m.start}s` } : {}) })) } : {}),
        };

        return {
          content: [
            {
              type: 'text',
              text: `TRANSCRIPT AI RESULT\n${JSON.stringify(meta)}\n\nTRANSCRIPT CHUNK:\n${chunk}`,
            },
          ],
        };
      } catch (e) {
        return {
          isError: true,
          content: [{ type: 'text', text: `Gagal mengambil transcript: ${e?.message || 'unknown error'}` }],
        };
      }
    }
  );

  // ---------------- Teliksandi (kerja bareng Claude) ----------------
  server.registerTool(
    'teliksandi_cari_youtube',
    {
      title: 'Teliksandi: cari & paketkan video YouTube (SOP)',
      description: 'Jalankan SOP Teliksandi untuk satu topik: cari video YouTube, seleksi yang relevan, ambil transkrip, pilih bagian yang membahas topik beserta konteks sebelum/sesudah, pasangkan screenshot, lalu cek apakah konteks sudah jelas. Hasil: paket bahan per video (link, judul, kanal, tanggal unggah, transkrip, bagian_terpilih, screenshot + waktu, status LENGKAP/PERLU_LIHAT_PELAN/KURANG_BAHAN, kekurangan). Jangan menebak isi yang ditandai kurang. Untuk topik "terbaru", pakai upload=minggu.',
      inputSchema: {
        topik: z.string().min(2).max(120).describe('Topik perintah Ombeck, mis. "AI agent terbaru" atau "rumah subsidi solo".'),
        upload: z.enum(['hari', 'minggu', 'bulan', 'semua']).optional().describe('Batas tanggal unggah. Default: minggu bila topik memuat "terbaru", selain itu bulan.'),
        jumlah: z.number().int().min(1).max(3).optional().describe('Jumlah video yang dipaketkan lengkap (1-3). Default 2.'),
      },
      annotations: { readOnlyHint: true, openWorldHint: true, destructiveHint: false },
    },
    async ({ topik, upload, jumlah = 2 }) => {
      try {
        const deadline = Date.now() + 52000;
        const up = upload || (/terbaru|baru|latest/i.test(topik) ? 'minggu' : 'bulan');
        const videos = await searchYouTube(topik, { limit: 12, upload: up });
        const words = queryWords(topik);
        const relevan = videos.filter((v) => words.some((w) => countWord(`${v.title} ${v.snippet}`.toLowerCase(), w) > 0));
        const paket = [];
        for (const v of relevan.slice(0, jumlah)) {
          const left = deadline - Date.now();
          if (left < 12000) break;
          paket.push(await buildPackage(v, topik, BASE, Math.min(28000, left - 6000)));
        }
        return ok({ perintah: topik, upload: up, ditemukan: videos.length, relevan: relevan.length, paket,
          kandidat_lain: relevan.slice(jumlah).map((v) => ({ link: v.url, judul: v.title, kanal: v.channel, unggah: v.published_text })),
          langkah_berikut: 'Tinjau paket. Kirim yang layak dengan teliksandi_kirim_usulan (jenis paket_youtube). Bagian di perlu_lihat_pelan jangan ditebak.' });
      } catch (e) { return fail(e); }
    }
  );

  server.registerTool(
    'teliksandi_bank_data',
    {
      title: 'Teliksandi: baca Bank Data',
      description: 'Baca Bank Data Teliksandi milik Ombeck (hanya baca). tabel: konten (berita & video), video (detail video + transkrip + screenshot), tren, kesimpulan, misi, tempat, akun, kamus. Pakai sebelum mencari, supaya tidak mengulang pekerjaan yang sudah ada.',
      inputSchema: {
        tabel: z.enum(['konten', 'video', 'tren', 'kesimpulan', 'misi', 'tempat', 'akun', 'kamus']),
        batas: z.number().int().min(1).max(100).optional().describe('Jumlah baris terbaru. Default 30.'),
        cari: z.string().max(80).optional().describe('Saring baris yang memuat kata ini (opsional).'),
      },
      annotations: { readOnlyHint: true, openWorldHint: false, destructiveHint: false },
    },
    async ({ tabel, batas = 30, cari }) => {
      try {
        let rows = await kepo('hermes_bank_data', { p_tabel: tabel, p_batas: cari ? 300 : batas });
        if (cari) rows = rows.filter((r) => JSON.stringify(r).toLowerCase().includes(cari.toLowerCase())).slice(0, batas);
        if (tabel === 'video') rows = rows.map((r) => ({ ...r, cuplikan_transkrip: String(r.cuplikan_transkrip || '').slice(0, 800) }));
        return ok({ tabel, jumlah: rows.length, data: rows });
      } catch (e) { return fail(e); }
    }
  );

  server.registerTool(
    'teliksandi_kirim_usulan',
    {
      title: 'Teliksandi: kirim usulan ke Bank Data',
      description: 'Kirim hasil kerja ke antrean tinjauan Teliksandi. Claude/Hermes meninjau dulu sebelum masuk Bank Data utama. jenis: paket_youtube (isi = satu paket dari teliksandi_cari_youtube), kesimpulan (isi = {judul, isi, bukti}), temuan, ide_konten. Hanya data publik; jangan sertakan nomor HP atau nama orang pribadi. Kuota 150 usulan per 24 jam.',
      inputSchema: {
        jenis: z.enum(['paket_youtube', 'kesimpulan', 'temuan', 'ide_konten']),
        perintah: z.string().max(300).describe('Topik/perintah Ombeck yang sedang dikerjakan.'),
        isi: z.record(z.any()).describe('Isi usulan (objek JSON).'),
      },
      annotations: { readOnlyHint: false, openWorldHint: false, destructiveHint: false, idempotentHint: false },
    },
    async ({ jenis, perintah, isi }) => {
      try {
        const r = await kepo('gpt_usul', { p_jenis: jenis, p_perintah: perintah, p_isi: isi });
        return ok(typeof r === 'string' ? r : JSON.stringify(r));
      } catch (e) { return fail(e); }
    }
  );

  return server;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'content-type, mcp-session-id, last-event-id');
  res.setHeader('Access-Control-Expose-Headers', 'Mcp-Session-Id');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }

  if (!['POST', 'GET', 'DELETE'].includes(req.method || '')) {
    res.statusCode = 405;
    res.end('Method Not Allowed');
    return;
  }

  const server = createServer();
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });

  res.on('close', () => {
    transport.close().catch(() => {});
    server.close().catch(() => {});
  });

  try {
    await server.connect(transport);
    await transport.handleRequest(req, res);
  } catch (error) {
    console.error('MCP error', error);
    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ error: 'Internal MCP error' }));
    }
  }
}
