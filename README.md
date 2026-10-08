# YouTube Transkrip (dulu Transcript AI)

Tempel link YouTube → ambil transcript → bagikan ke ChatGPT. Juga tersedia sebagai MCP server di `/api/mcp`.

## Fitur

- **Transcript** dari Supadata (`SUPADATA_API_KEY`) dengan fallback sumber gratis; opsi timestamp `[mm:ss]`.
- **Momen penting** (`api/_moments.js`): detik-detik yang ditandai kata penekanan, kesimpulan, strategi, angka/uang, dan urutan. Ikut di hasil `/api/transcript` (`moments`), di tool MCP (`important_moments`), dan di teks yang dibagikan ke ChatGPT. Butuh segmen ber-timestamp, jadi hanya aktif lewat Supadata.
- **Simpan ke Google Drive**: setiap transcript disimpan sebagai Google Doc di folder **materi apgred** (dibuat otomatis bila belum ada), lengkap dengan metadata, daftar momen penting, dan baris `Status referensi: BELUM DITINJAU` yang nanti diganti Claude/GPT menjadi DIPAKAI atau TIDAK DIPAKAI.
- **Screenshot cepat (bawaan)**: begitu transcript selesai, aplikasi mengambil gambar pratinjau YouTube (storyboard, `api/frames.js`) untuk tiap momen penting. Tanpa izin apa pun, jalan juga di HP; gambarnya kecil (sekitar 160×90) dan bisa buram.
- **Gambar jelas (opsional, desktop Chrome/Edge)**: tombol “Gambar jelas” memutar video tanpa suara ke tiap momen dan mengambil gambarnya lewat izin berbagi tab. Kedua jenis screenshot disimpan ke folder yang sama dengan nama `Screenshot cepat …` / `Screenshot jelas …`.

## Privasi

Login Google berjalan di browser (Google Identity Services) dengan scope `drive.file`: aplikasi hanya bisa melihat file yang ia buat sendiri. Token disimpan di `sessionStorage`; server tidak menyimpan transcript, screenshot, atau token.

## Mengaktifkan Google Drive

1. Google Cloud Console → buat project → aktifkan **Google Drive API**.
2. OAuth consent screen: tipe External, mode Testing, tambahkan akun Google kamu sebagai test user.
3. Credentials → OAuth client ID → **Web application** → Authorized JavaScript origins: domain aplikasi (mis. `https://youtube-transcript-anita-5823.vercel.app`).
4. Vercel → project → Environment Variables: `GOOGLE_CLIENT_ID=<client id>` (opsional `DRIVE_FOLDER_NAME`, default `materi apgred`) → redeploy.

Catatan: karena scope `drive.file`, biarkan aplikasi yang membuat folder **materi apgred** pertama kali. Folder dengan nama sama yang dibuat dari tempat lain tidak terlihat oleh aplikasi dan akan membuat folder kedua.
