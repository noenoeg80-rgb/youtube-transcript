# YouTube Transkrip (dulu Transcript AI)

**Aplikasi mandiri.** Tempel link YouTube → transkrip → momen penting → screenshot → Robot Pencocok (mata Gemini) mencocokkan gambar ↔ transkrip → bagikan ke ChatGPT. Bisa dipakai siapa saja, di mana saja, tanpa Teliksandi.

## Batas yang jelas

| | YouTube Transkrip (aplikasi) | Teliksandi (agen induk) |
|---|---|---|
| Tugas | mengubah 1 video / 1 topik jadi bahan: transkrip, bagian relevan, screenshot, deskripsi visual | mengumpulkan intel dari banyak sumber (YouTube, berita, tren, Maps, sosmed), menyimpulkan, melapor |
| Tahu tentang | video YouTube saja | bisnis Ombeck, misi, Bank Data, Hermes, GPT, n8n |
| Menyimpan | tidak menyimpan apa pun di server (opsional Google Drive milik pengguna) | Bank Data KEPO |
| Memori belajar | tidak punya | Hermes (`tk_memori_yt`) |
| Alur baku | tidak ada; dipanggil per permintaan | n8n `n8n/teliksandi-youtube-sop.json` |

Teliksandi **memanggil** YouTube Transkrip sebagai layanan, lalu memutuskan sendiri apa yang disimpan. YouTube Transkrip tidak pernah menulis ke Bank Data.

## Endpoint aplikasi (mandiri)
- `GET /api/transcript?url=…` transkrip + segmen + momen penting
- `GET /api/frames?v=…&t=…` gambar pratinjau per detik (storyboard; cadangan gambar resmi)
- `GET /api/riset?q=…&mode=paket` riset satu topik → paket bahan per video
- `POST /api/cocok` Robot Pencocok: deskripsi gambar ↔ transkrip (butuh `GEMINI_API_KEY`)
- `POST /api/mcp` MCP server: `get_youtube_transcript`, `riset_youtube`

## Integrasi Teliksandi (terpisah, boleh dimatikan)
- `/teliksandi.html` panel Bank Data (hanya baca)
- MCP: `teliksandi_bank_data`, `teliksandi_kirim_usulan` (antrean tinjau, kuota 150/hari)
- n8n: alur baku SOP yang memanggil `/api/riset` dan `/api/cocok`, lalu mengangkut ke Bank Data dan mencatat memori Hermes

## Env (Vercel)
`GEMINI_API_KEY` (mata Robot Pencocok, wajib untuk mode mata) · `SUPADATA_API_KEY` (opsional, transkrip stabil) · `GOOGLE_CLIENT_ID`, `DRIVE_FOLDER_NAME` (opsional, simpan ke Drive)
