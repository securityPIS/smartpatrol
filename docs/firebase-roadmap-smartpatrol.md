# SmartPatrol x Firebase

Dokumen ini menyesuaikan roadmap Firebase dengan implementasi SmartPatrol yang ada sekarang di repo ini.

## Kondisi aplikasi saat ini

- Frontend: React 19 + Vite
- Persistensi utama: `localStorage` untuk state aplikasi dan IndexedDB untuk media lokal
- Auth: local-only di [AppContext.jsx](/C:/dev/SmartPatrol/src/context/AppContext.jsx)
- Data domain utama:
  - `usersData`
  - `shipsData`
  - `checkpoints`
  - `incidentsData`
  - `incidentMeta`
  - `historyEntries`
  - `notifications`
- Upload foto: client-side, disimpan lokal via IndexedDB helper di `src/utils/imageStore.js`

## Target yang realistis

### Fase 0

Deploy aplikasi yang sekarang ke Firebase Hosting tanpa mengubah arsitektur local-first.

Hasil:
- Aplikasi bisa diakses via URL Firebase Hosting
- Belum ada sync cloud
- Belum ada Firebase Auth/Firestore/Storage aktif

### Fase 1

Migrasi autentikasi dari local state ke Firebase Auth.

Perubahan utama:
- Ganti login/register local di [AppContext.jsx](/C:/dev/SmartPatrol/src/context/AppContext.jsx) dengan Firebase Auth email/password
- Tambah `onAuthStateChanged`
- Peta role `ADMIN`, `PIC`, `PETUGAS` tetap dipertahankan di dokumen profil Firestore

Deliverable:
- Login berbasis Firebase Auth
- Session user tidak lagi bergantung pada `localStorage` custom

### Fase 2

Migrasi state utama ke Firestore sambil menjaga offline mode.

Koleksi yang disarankan:

```text
users/{userId}
ships/{shipId}
shipSchedules/{shipId}
patrolCheckpoints/{shiftKey}_{checkpointId}
incidents/{incidentId}
incidents/{incidentId}/progress/{progressId}
historyEntries/{historyId}
notifications/{notifId}
```

Catatan khusus untuk SmartPatrol:
- `checkpoints` saat ini adalah state shift aktif. Di Firebase sebaiknya dipisah dari `historyEntries`.
- `historyEntries` sekarang dibentuk otomatis saat shift berganti. Mekanisme ini cocok dipindahkan ke Cloud Functions atau job terjadwal.
- `incidentMeta.progress[]` lebih aman dipindah ke subcollection Firestore daripada array besar dalam satu dokumen.

### Fase 3

Migrasi media ke Firebase Storage.

Peta folder yang cocok:

```text
users/{userId}/profile.jpg
ships/{shipId}/cover.jpg
patrols/{shiftKey}/{checkpointId}.jpg
incidents/{incidentId}/main.jpg
incidents/{incidentId}/progress/{progressId}.jpg
```

Perubahan kode utama:
- `pickLocalImage()` tetap dipakai untuk memilih file
- hasilnya tidak lagi disimpan ke IndexedDB sebagai sumber utama
- file diupload ke Storage, URL disimpan ke Firestore

### Fase 4

Notifikasi real-time.

Yang sudah ada sekarang:
- sistem notifikasi internal in-app di `notifications`

Yang perlu ditambahkan:
- FCM token per user
- trigger saat incident dibuat, progress berubah, incident ditutup, shift selesai

### Fase 5

Capacitor/native build jika target mobile app tetap dilanjutkan.

## Rekomendasi implementasi untuk repo ini

Urutan yang paling aman:

1. Deploy Hosting dulu tanpa migrasi data
2. Tambah Firebase SDK dan file `src/services/firebase/*`
3. Pisahkan service layer dari `AppContext.jsx`
4. Migrasikan Auth
5. Migrasikan Firestore untuk `users`, `ships`, `incidents`, `historyEntries`
6. Baru migrasikan media ke Storage

## File yang perlu ditambahkan saat fase backend dimulai

```text
src/services/firebase/app.js
src/services/firebase/auth.js
src/services/firebase/firestore.js
src/services/firebase/storage.js
src/services/repositories/*.js
.env
.env.example
firestore.rules
storage.rules
```

## Risiko utama

- `AppContext.jsx` saat ini memegang banyak logika domain sekaligus. Migrasi langsung tanpa service layer akan rawan regression.
- Data local existing tidak otomatis pindah ke cloud. Perlu skrip bootstrap atau import seed.
- Ada worktree yang sedang aktif berubah. Deployment hosting aman, tetapi migrasi backend harus dilakukan hati-hati agar tidak bercampur dengan perubahan UI yang sedang berjalan.

## Status deploy saat ini

- Firebase Hosting: siap dikonfigurasi dan dideploy
- Git remote: belum ada di repo ini, jadi belum bisa push ke server git mana pun
- Firebase backend migration: belum dilakukan pada repo ini
