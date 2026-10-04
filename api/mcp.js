import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';
import { getTranscript } from './_transcript.js';

export const config = { maxDuration: 60 };

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
        url: z.string().min(1).describe('Link YouTube atau video ID 11 karakter. Dengan SUPADATA_API_KEY, link TikTok, Instagram, Facebook, dan X juga didukung.'),
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
      try {
        const { text, language: usedLanguage, source, video_id: id, source_url } = await getTranscript(url, language, 45000);
        const start = Math.min(offset, text.length);
        const end = Math.min(start + max_chars, text.length);
        const chunk = text.slice(start, end);
        const hasMore = end < text.length;
        const meta = {
          video_id: id,
          source_url,
          source,
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
