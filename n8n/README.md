# n8n · Teliksandi SOP Ambil Data YouTube (alur baku v1.2, mata wajib)

Import `teliksandi-youtube-sop.json` ke n8n VPS (Workflows → Import from URL):
`https://raw.githubusercontent.com/noenoeg80-rgb/youtube-transcript/main/n8n/teliksandi-youtube-sop.json`

Variables (Settings → Variables), diketik Ombeck sendiri:
- `SUPEROMBECK_TOKEN` — token Hermes; dipakai langkah Q (Bank Data) & R (memori Hermes).
- `YT_TRANSKRIP_URL` — alamat YouTube Transkrip. Di VPS yang sama: `http://youtube-transkrip:3000` (nama container). Kosong = pakai Vercel.

Alur: A Perintah → B Validasi (tolak data pribadi/akun RMS) → C–I YouTube Transkrip `/api/riset` →
Pemeriksa bidang wajib → J Robot Pencocok `/api/cocok` (MATA WAJIB) → K Konteks jelas? →
(ya) L Paket → Q Bank Data → R Hermes mengingat · (belum) M–P lihat pelan / tandai → L.

Aturan mata: paket hanya boleh LENGKAP bila robot mode `mata` dan `semua_dilihat=true`. Tanpa mata, paket ditandai
"MATA TIDAK AKTIF" dan masuk jalur lihat pelan. Tidak ada tebakan.
