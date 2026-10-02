import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';

export const config = { maxDuration: 60 };

function youtubeId(value) {
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

function validTranscript(text) {
  return String(text || '').trim().length > 20 &&
    !/^\s*(?:<!doctype|<html|\{\s*"(?:error|detail)"|(?:error|not found|unavailable|access denied|rate limit)\b)/i.test(text);
}

async function loadTranscript(id, requestedLanguage = 'auto') {
  const langs = requestedLanguage && requestedLanguage !== 'auto'
    ? [requestedLanguage]
    : ['id', 'en', ''];

  let lastError = 'Transcript tidak tersedia.';
  for (const lang of langs) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 45000);
    try {
      const suffix = lang ? `?lang=${encodeURIComponent(lang)}` : '';
      const r = await fetch(`https://youtube-transcript.ai/transcript/${id}.txt${suffix}`, {
        signal: controller.signal,
        headers: { 'user-agent': 'TranscriptAI-MCP/1.0' },
      });
      if (!r.ok) {
        lastError = `Sumber transcript merespons HTTP ${r.status}.`;
        continue;
      }
      const text = await r.text();
      if (!validTranscript(text)) {
        lastError = 'Sumber tidak mengembalikan transcript yang valid.';
        continue;
      }
      return { text, language: lang || 'auto' };
    } catch (e) {
      lastError = e?.name === 'AbortError'
        ? 'Pengambilan transcript melebihi batas waktu.'
        : 'Tidak dapat mengakses sumber transcript.';
    } finally {
      clearTimeout(timer);
    }
  }
  throw new Error(lastError);
}

function createServer() {
  const server = new McpServer({
    name: 'transcript-ai',
    version: '1.0.0',
  });

  server.registerTool(
    'get_youtube_transcript',
    {
      title: 'Get YouTube transcript',
      description: 'Gunakan tool ini ketika pengguna memberikan link YouTube dan ingin isi video, ringkasan, analisis, poin penting, insight bisnis, entitas, atau ide konten. Ambil transcript melalui layanan Transcript AI milik pengguna. Untuk transcript panjang, panggil lagi dengan next_offset sampai has_more=false sebelum membuat analisis menyeluruh.',
      inputSchema: {
        url: z.string().min(1).describe('Link YouTube atau video ID 11 karakter.'),
        language: z.string().optional().describe('Kode bahasa seperti id atau en. Kosong/auto akan mencoba id, en, lalu bahasa asli.'),
        offset: z.number().int().min(0).optional().describe('Posisi karakter mulai. Gunakan next_offset dari hasil sebelumnya untuk transcript panjang.'),
        max_chars: z.number().int().min(4000).max(30000).optional().describe('Jumlah maksimum karakter per panggilan. Default 24000.'),
      },
      annotations: {
        readOnlyHint: true,
        openWorldHint: true,
        destructiveHint: false,
      },
    },
    async ({ url, language = 'auto', offset = 0, max_chars = 24000 }) => {
      const id = youtubeId(url);
      if (!id) {
        return {
          isError: true,
          content: [{ type: 'text', text: 'Link YouTube tidak valid.' }],
        };
      }

      try {
        const { text, language: usedLanguage } = await loadTranscript(id, language);
        const start = Math.min(offset, text.length);
        const end = Math.min(start + max_chars, text.length);
        const chunk = text.slice(start, end);
        const hasMore = end < text.length;
        const meta = {
          video_id: id,
          source_url: `https://www.youtube.com/watch?v=${id}`,
          language: usedLanguage,
          total_chars: text.length,
          offset: start,
          returned_chars: chunk.length,
          next_offset: hasMore ? end : null,
          has_more: hasMore,
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
