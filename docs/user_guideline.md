# User Guideline: SmartPatrol

Selamat datang di **SmartPatrol**, aplikasi manajemen patroli keamanan dan operasional armada yang dirancang untuk efisiensi, transparansi, dan respon cepat. Dokumen ini akan membantu Anda memahami cara menggunakan aplikasi sesuai dengan peran Anda.

---

## 1. Ikhtisar Aplikasi (App Overview)

SmartPatrol adalah platform pemantauan real-time untuk kegiatan patroli di kapal/armada. Aplikasi ini mencakup:
- **Pemantauan Checkpoint**: Pencatatan kondisi setiap titik patroli.
- **Pelaporan Temuan (Incident)**: Dokumentasi masalah dengan foto dan detail 5W1H.
- **Manajemen Shift**: Pengaturan jadwal dan rotasi petugas.
- **Manajemen Armada & Dokumen**: Pengelolaan data kapal dan sertifikasi.

---

## 2. Peran Pengguna (User Roles)

Aplikasi memiliki tiga peran utama dengan izin akses yang berbeda:

| Fitur | Petugas (Security) | PIC (Supervisor) | Admin (HQ) |
| :--- | :---: | :---: | :---: |
| Melakukan Patroli | ✅ | ✅ | ✅ |
| Membuat Laporan Temuan | ✅ | ✅ | ✅ |
| Menutup (Close) Temuan | ❌ | ✅ | ✅ |
| Melihat Riwayat Seluruh Kapal | ❌ | ✅ | ✅ |
| Manajemen User & Kapal | ❌ | ❌ | ✅ |

---

## 3. Navigasi Utama

Aplikasi menggunakan sistem navigasi yang adaptif:
- **Layar Desktop**: Navigasi berada di samping (Side Bar) dan konten menggunakan sistem *dual-pane* (daftar di kiri, detail di kanan).
- **Layar Mobile**: Navigasi berada di bawah (Bottom Bar) dan konten ditampilkan satu per satu untuk kenyamanan penggunaan di lapangan.

**Tab Navigasi:**
1.  **Patroli (Home)**: Halaman utama untuk melakukan pemeriksaan titik patroli.
2.  **Temuan (Incidents)**: Daftar laporan masalah/temuan yang sedang aktif atau sudah selesai.
3.  **Riwayat (History)**: Arsip seluruh kegiatan patroli per shift.
4.  **Users** (Admin saja): Kelola data personil.
5.  **Armada** (Admin saja): Kelola data kapal dan penugasan kru.

---

## 4. Panduan Fitur: Patroli

Halaman Patroli adalah tempat utama untuk melakukan pengecekan rutin.

### Alur Kerja Patroli:
1.  **Pilih Titik (Checkpoint)**: Pilih lokasi yang akan diperiksa dari daftar.
2.  **Status AMAN**: Jika kondisi normal, klik tombol **AMAN**. Anda dapat menambahkan foto dan catatan singkat.
3.  **Status TEMUAN**: Jika ditemukan masalah, klik tombol **TEMUAN**. Anda diwajibkan mengisi detail laporan dan mengambil foto bukti.
4.  **Progress Bar**: Di bagian bawah layar, Anda dapat melihat sisa waktu shift dan persentase penyelesaian patroli.

> [!TIP]
> Pada perangkat Mobile, Anda dapat langsung mengambil foto menggunakan kamera perangkat saat melakukan submit status checkpoint.

---

## 5. Panduan Fitur: Pelaporan Temuan (Incident Management)

Laporan Temuan dibuat secara otomatis saat status patroli adalah "Temuan", atau bisa dibuat secara manual melalui tombol "Lapor Baru".

### Mengelola Temuan:
- **Update Baru**: PIC atau Petugas dapat menambahkan perkembangan (progress) pada sebuah temuan.
- **Penutupan (Closing)**: Temuan yang sudah selesai ditindaklanjuti harus di-"Close" oleh PIC atau Admin agar statusnya berubah menjadi selesai.
- **Detail 5W1H**: Setiap temuan mencakup kronologi lengkap, penyebab, dan tindak lanjut yang telah diambil.

---

## 6. Panduan Fitur: Manajemen Armada (Khusus Admin)

Admin bertanggung jawab untuk mengatur siapa yang bertugas di kapal mana.

### Penugasan Kru:
1.  Buka tab **Armada**.
2.  Pilih kapal dari daftar.
3.  Di tab **Personil**, Anda dapat menambahkan petugas dari daftar "Tersedia" ke dalam penugasan kapal tersebut.
4.  Sistem mendukung perencanaan penugasan untuk **Bulan Depan** agar rotasi dapat disiapkan lebih awal.

### Dokumen Kapal:
- Anda dapat mengunggah file sertifikasi kapal (PDF/Gambar) ke dalam tab **Dokumen** di setiap detail kapal. Dokumen ini dapat diunduh oleh personil yang berwenang.

---

## 7. Pengaturan & Profil

Klik ikon profil/pengaturan di bagian atas (Header) untuk:
- Mengganti Tema (**Dark Mode** / **Light Mode**).
- Melihat detail kontak darurat Anda.
- Keluar dari aplikasi (**Logout**).

---

## 8. FAQ & Tips

- **Bagaimana jika sisa shift habis?** Patroli akan otomatis ditutup dan titik yang belum diperiksa akan masuk ke status *Missed*.
- **Data Tidak Muncul?** Pastikan Anda memiliki koneksi internet. Status "Online/Offline" dapat dilihat di pojok bawah menu navigasi.
- **Update Foto**: Untuk hasil terbaik, gunakan foto dalam orientasi landscape atau pastikan objek utama berada di tengah.

---
*SmartPatrol V1.0 - Monitoring System for Excellence Operations*
