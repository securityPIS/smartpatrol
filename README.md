# SmartPatrol Local Staging

Versi ini belum dihubungkan ke Firebase. Semua input data disimpan ke `localStorage` browser agar aman untuk pengujian lokal terlebih dulu.

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

- Data patroli, temuan, user, armada, dan progress disimpan lokal di browser.
- Upload gambar dikompresi di client agar lebih hemat penyimpanan lokal.
- Password user tidak disimpan mentah; aplikasi hanya menyimpan status bahwa kredensial pernah diatur.
- File `App.jsx` lama di root tetap dibiarkan sebagai referensi prototype awal.
- Deploy Firebase Hosting saat ini hanya mempublikasikan aplikasi local-first. Sinkronisasi cloud/Auth/Storage masih perlu fase migrasi backend berikutnya.
- Kredensial web app Firebase yang Anda kirim sudah saya simpan sebagai template di [.env.example](/C:/dev/SmartPatrol/.env.example) untuk fase integrasi Auth/Firestore/Storage berikutnya.
