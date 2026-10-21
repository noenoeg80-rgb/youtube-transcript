# Pak Carik — Pekerja Laptop v0.1

Status: paket implementasi, belum diuji pada laptop Om Bek/akun YouTube asli.
Tidak ada API transkripsi berbayar. Ekstensi membaca panel transkrip YouTube yang tersedia, bukan menyalin cookie atau menyamar sebagai perangkat lain.

## Pasang satu kali (Chrome atau Edge di laptop Windows/Mac)
1. Ekstrak ZIP. Simpan folder `laptop-worker` di lokasi tetap, jangan hapus setelah dipasang.
2. Chrome: buka `chrome://extensions`. Edge: buka `edge://extensions`.
3. Aktifkan **Developer mode / Mode developer**.
4. Pilih **Load unpacked / Muat yang dibongkar**, lalu pilih folder `laptop-worker` yang berisi `manifest.json`.
5. Buka YouTube di profil browser yang sama. Jika perlu login, pemilik akun memasukkan sandi/OTP sendiri. Jangan kirim sandi/OTP/cookie ke siapa pun.
6. Buka atau refresh https://youtube-transcript-woad-nine.vercel.app/ . Muncul panel **Pekerja laptop tersambung**.

## Pakai
1. Tempel link video di kolom Link YouTube.
2. Tekan **Ambil lewat laptop** (bukan tombol Ambil Transcript server).
3. Ekstensi membuka satu tab YouTube, membisukan tab, menjeda video, dan membuka panel transkrip.
4. Kembali ke Pak Carik. Hasil dimasukkan otomatis selama link tidak berubah dan kolom impor kosong. Jika sudah ada draf, tekan **Masukkan hasil ke Pak Carik** sendiri.
5. Periksa teks dan tekan Bagikan ke ChatGPT.

Jika diminta verifikasi/login/persetujuan, pekerja berhenti. Selesaikan sendiri di YouTube; tekan **Coba lagi lewat laptop**. Tidak ada upaya melewati CAPTCHA atau pembatasan. Browser dan koneksi harus tetap aktif. Tidak semua video mempunyai caption. Tampilan YouTube dapat berubah, sehingga pengujian nyata tetap diperlukan.

## Privasi dan batas versi ini
- Hanya beroperasi pada YouTube dan alamat produksi Pak Carik yang disebut di manifest.
- Tidak meminta izin cookies, password, history, proxy, atau akses semua situs.
- Pekerja menyimpan satu tugas/hasil terakhir di `chrome.storage.local`. Tugas baru mengganti hasil sebelumnya; gunakan **Hapus hasil lokal** untuk menghapusnya.
- Teks yang masuk ke aplikasi mengikuti fitur aplikasi: jika Google Drive sebelumnya dihubungkan dan simpan otomatis aktif, aplikasi dapat menyimpannya ke Drive. Nonaktifkan simpan otomatis bila tidak diinginkan.
- Batal menghentikan penerimaan hasil; pembacaan DOM yang sudah berjalan bisa menyelesaikan putarannya dan hasilnya diabaikan. Tab tetap terbuka untuk pemilik.
- Tidak bekerja di Safari/iPhone. Versi ini dimulai dari laptop. Pengiriman tugas dari HP ke laptop belum dipasang dan memerlukan antrean terautentikasi terpisah.
- Tidak mengubah robot Teliksandi, akun, server, atau setelan laptop lain.
- Hasil diambil dari elemen transkrip yang tampil. Versi ini belum menjamin caption penuh pada tampilan YouTube yang memakai pemuatan bertahap/virtualisasi; cocokkan timestamp akhir dengan panel YouTube saat uji penerimaan.

## Uji penerimaan wajib setelah pasang
1. Video publik yang memiliki caption: cek judul/link, awal, bagian tengah, dan timestamp akhir; pastikan tidak terpotong.
2. Video tanpa caption: pesan menunggu pengguna/gagal, tidak ada teks karangan.
3. Tutup tab saat membaca: status berhenti dan dapat dicoba ulang.
4. Refresh Pak Carik: hasil terakhir masih tersedia.
5. Logout/login YouTube: login manual tetap bisa dilakukan tanpa kredensial masuk ke Pak Carik.
6. Hapus hasil: hasil lokal hilang; data yang sudah dibagikan/Drive tidak dihapus.

Jika hasil terpotong atau panel tidak ditemukan, jangan gunakan untuk analisis lengkap; laporkan tampilan YouTube agar pembaca disesuaikan.
