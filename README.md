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

## Catatan

- Data patroli, temuan, user, armada, dan progress disimpan lokal di browser.
- Upload gambar dikompresi di client agar lebih hemat penyimpanan lokal.
- Password user tidak disimpan mentah; aplikasi hanya menyimpan status bahwa kredensial pernah diatur.
- File `App.jsx` lama di root tetap dibiarkan sebagai referensi prototype awal.
