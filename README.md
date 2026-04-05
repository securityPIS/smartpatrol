# SmartPatrol Hybrid Staging

Versi ini sudah bisa dipublish ke Firebase Hosting, memakai Firebase Auth, dan mulai menyinkronkan data domain utama ke Firebase agar laporan patroli bisa muncul lintas device.

## Jalankan Lokal

```bash
npm install
npm run dev
```

## Build Lokal

```bash
npm run build
```

## Deploy ke Firebase Hosting

Konfigurasi Firebase Hosting untuk Vite SPA sudah disiapkan melalui [firebase.json](/C:/dev/SmartPatrol/firebase.json).
Project default Firebase untuk repo ini sekarang diarahkan ke `smartpatrol-7ff9e` melalui [.firebaserc](/C:/dev/SmartPatrol/.firebaserc).

```bash
npm install
npm run firebase:deploy
```

Jika ingin preview lokal dengan Firebase Hosting emulator:

```bash
npm run firebase:emulate
```

## Catatan

- Data patroli, temuan, user, armada, progress, notifikasi, dan riwayat shift tetap disimpan lokal di browser sebagai fallback, lalu disinkronkan ke Firebase saat online.
- Upload gambar dikompresi di client, disimpan lokal untuk mode offline, lalu dicoba dikirim ke Firebase Storage agar bisa tampil di device lain.
- Registrasi dari halaman login sekarang membuat akun Email/Password di Firebase Auth.
- Akun demo lama dan akun yang dibuat admin dengan password lokal masih didukung lewat fallback legacy agar staging tidak putus.
- Akun yang sudah terhubung ke Firebase Auth belum bisa ganti email/password dari panel admin. Untuk fase ini, perubahan kredensial dilakukan dari Firebase Console.
- File `App.jsx` lama di root tetap dibiarkan sebagai referensi prototype awal.
- Deploy Firebase Hosting saat ini mempublikasikan aplikasi hybrid: Hosting + Firebase Auth + sinkronisasi data cloud untuk state patroli utama.
- Kredensial web app Firebase tersedia sebagai template di [.env.example](/C:/dev/SmartPatrol/.env.example). Untuk deploy lokal saya memakai `.env.local` yang tidak ikut masuk git.
