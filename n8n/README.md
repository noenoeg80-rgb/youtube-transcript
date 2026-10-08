# n8n · Teliksandi SOP Ambil Data YouTube

Import `teliksandi-youtube-sop.json` ke n8n VPS (Workflows → Import from file).

Alur = SOP Ombeck:
A Perintah (webhook `POST /webhook/teliksandi-youtube` body `{"topik":"...", "upload":"minggu|bulan|semua", "jumlah":2}`)
→ B Koordinator (topik "terbaru" otomatis dibatasi upload seminggu)
→ C–I satu panggilan ke Transcript AI `/api/teliksandi?mode=paket`: cari, seleksi relevan, transkrip, bagian terpilih + konteks, screenshot
→ J–K Konteks jelas? → L Kumpulkan paket
→ (belum) M–P lihat pelan / tandai, tidak menebak → L
→ Q Bagian Pengangkutan: RPC `teliksandi_terima_paket` di KEPO (butuh env `SUPEROMBECK_TOKEN` di n8n, diketik Ombeck sendiri).
