# YouTube Transkrip — rilis baku

## v1.0.0 — 8 Oktober 2026 (LOCK)
Aplikasi mandiri. Dipakai Teliksandi lewat alur baku n8n v1.2.

Fitur terkunci:
- Transkrip (sumber gratis, kalimat berulang dibersihkan, timestamp dibaca) + momen penting otomatis.
- Screenshot cepat: frame tepat di detik momen (storyboard lewat player HP); cadangan gambar resmi YouTube (ditandai "terdekat").
- Konteks pembicaraan di tiap gambar; ketuk gambar untuk memperbesar; "Lihat pelan" memutar video di detik itu.
- Robot Pencocok (mata Gemini): deskripsi gambar ↔ transkrip, cocok/sebagian/tidak, info tambahan dari gambar.
  Mata memilih model yang tersedia untuk kunci (tanya Google), cadangan otomatis saat penuh.
- Bagikan ke ChatGPT membawa transkrip + konteks visual (urutan tetap). Gambar dilepas setelah robot selesai.
- ↻ Link lain, 🧹 Hapus gambar, indikator mata di halaman depan, /api/status.
- MCP: get_youtube_transcript, riset_youtube (+ integrasi Teliksandi, terpisah).
- Deploy: Vercel (publik) dan Docker untuk VPS Hostinger (baku).

Perubahan setelah ini = versi baru, bukan menimpa v1.0.0.
