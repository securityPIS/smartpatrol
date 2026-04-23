# SYSTEM_MAP — SmartPatrol

> Peta sistem otomatis. Terakhir diperbarui: 2026-04-22.
> Bahasa pemrograman: **JavaScript (React 19 + Vite 8)**.

---

## Project Summary

| Aspek | Detail |
|---|---|
| **Tujuan** | Aplikasi web patroli keamanan kapal/armada laut. Petugas lapangan mencatat hasil checkpoint per shift, melaporkan insiden, dan mengirim SOS darurat. Admin memantau laporan harian, mengelola user/crew, dan armada kapal. |
| **Runtime** | Node.js 22 (cloud functions), browser (SPA) |
| **Framework** | React 19 + Vite 8 + TailwindCSS v4 |
| **UI** | Single Page App, responsive (mobile-first + desktop sidebar), dark theme Chakra Petch font, glassmorphism style |
| **Backend** | Firebase (Auth, Firestore, Storage, Cloud Functions, Hosting) |
| **Database** | Firestore (dokumen `smartpatrol/shared-state` sebagai blob state + `smartpatrol/shared-signal` sebagai pemicu refresh realtime cepat) + localStorage + IndexedDB (gambar) |
| **Auth** | Firebase Auth (email/password) sebagai sumber utama. Approval akses operasional memakai `userAccess/{uid}` dan onboarding publik memakai `pendingRegistrations/{uid}`. |
| **Hosting** | Firebase Hosting (region: `asia-southeast2`) |
| **Pola arsitektur** | **Offline-first SPA** — state disimpan di localStorage, disinkronkan ke Firestore via merge. Tidak ada REST API tradisional; semua logika bisnis ada di client-side React Context. Cloud Function hanya menyediakan trusted server time. |

---

## Core Logic Flow (Function-Level Flowchart)

### 1. Login → Session / Onboarding

```
LoginPage[handleLogin] → AppContextRuntime[handleLogin]
  → firebase/auth[loginWithFirebaseEmail] → Firebase Auth
  → firebase/access[resolveOperationalAccess] → Cloud Function[resolveOperationalAccess]
  → userAccess/{uid}.enabled === true
  → saveAuthSession(localStorage) → setSessionUserId → render AppShell

LoginPage[handleRegister] → Firebase Auth[registerWithFirebaseEmail]
  → uploadRegistrationPhotoAsset (opsional) → Storage[registration-assets/{uid}/...]
  → createPendingRegistration → Firestore[pendingRegistrations/{uid}]
  → Admin review di UsersPage → Cloud Function[approvePendingRegistration]
  → Cloud Function menulis userAccess/{uid} + custom claims

ShipsPage[handleConfirmAssign / handleTogglePersonnel]
  → update usersData + shipsData lokal/cloud
  → syncOperationalUserAccess → Firestore[userAccess/{uid}]
  → status/shipAssigned aktif sinkron untuk izin login petugas
```

### 2. Patrol Checkpoint (inti patroli)

```
PatrolPage[auto-open ShiftStatusModal jika status shift belum ada]
  → AppContextRuntime[handleSaveCurrentShiftStatus]
    → createTrustedTimestampRecord() (trusted shift status snapshot)
    → setShiftStatusRecords(active shift only)
    → checkpoint actions enabled

PatrolPage[handleActionClick(checkpointId, type)]
  → guard: isCurrentShiftStatusCompleted?
    → tidak → buka ShiftStatusModal + blok checklist
    → ya → lanjut
  → usePatrol hook → pendingPatrolCameraCapture
  → PatrolCameraModal[capture photo via <input type="file">]
  → images[readImageFileAsDataUrl] → imageStore[saveImageToDB(IndexedDB)]
  → PatrolFormView[submit]
  → AppContextRuntime[handleSubmitCheckpoint]
    → createTrustedTimestampRecord() (NTP anchor)
    → normalizeTimeAuditRecord()
    → setCheckpointsByShip(updated)
    → scheduleCloudSync → saveCloudAppState(Firestore) via mergeSharedStateSnapshots
```

### 3. SOS Emergency

```
SOSButton[handleSOSTrigger(lat, lng)]
  → AppContextRuntime[handleSOSTrigger]
    → navigator.geolocation.getCurrentPosition
    → setActiveSOSAlert / setSosHistory
    → scheduleCloudSync → Firestore
  → SOSAlertModal (semua device: onSnapshot listener)
    → sosAudio[startSOSAlarm] (Web Audio API buzzer)
    → handleSOSConfirm → sosAudio[stopSOSAlarm]
```

### 4. Shift Rotation & History

```
AppProvider init:
  → getShiftMeta(getTrustedDate()) → SHIFT_SEQUENCE[3 shift/hari]
  → migrateCheckpointStateToCurrentShift()
    → cek setiap checkpoint: shouldResetCheckpointForActiveShift?
    → ya → archiveToHistory (shift sebelumnya) + resetCheckpointForShift + archive crew shift status
    → setHistoryEntries / setCheckpointsByShip / retain current shift status only
```

### 5. Cloud Sync (Firestore ↔ localStorage)

```
AppProvider useEffect:
  → subscribeToCloudAppState(onSnapshot callback)
  → handleCloudSnapshot(incomingData)
    → auditIncomingCheckpoints (markTimeAuditRecordReceived + receivedAtServerMs)
    → mergeSharedStateSnapshots(localState, cloudState)
    → applyMergedState → setState × N domain
  → subscribeToCloudSyncSignal(onSnapshot callback)
    → signal doc kecil berubah
    → refreshCloudSharedState(preferServer=true) retry cepat sampai `clientUpdatedAt` shared-state ikut maju
    → khusus SOS: alert ringkas bisa dipasang lokal lebih dulu sambil menunggu state penuh

scheduleCloudSync (debounced write):
  → createCloudSyncStateSnapshot(localState)
  → prepareSharedStateForCloudSync
    → urgent sync: kirim state inti dulu, aset lokal disisihkan lalu dijadwalkan sync lanjutan
    → normal sync: uploadCloudDataUrlAsset (gambar → Firebase Storage)
    → fitSharedStateToCloudBudget (trim history/notifikasi/SOS agar dokumen Firestore tetap ringan)
  → saveCloudAppState(state, { mergeState: fn })
    → Firestore runTransaction → merge → setDoc
    → Firestore single-field indexes untuk koleksi `smartpatrol` dinonaktifkan agar write blob state tetap ringan
```

### 6. Trusted Time (NTP-like)

```
AppProvider → initializeTrustedTime()
  → syncServerTime({ reason: 'init' })
    → fetch('/api/server-time') → Cloud Function[getServerTime]
    → fallback: https://asia-southeast2-{project}.cloudfunctions.net/getServerTime
    → applyServerAnchor(adjustedServerNowMs)
  → setInterval: tick (1s), tamper check (15s), re-sync (5min)
  → detectClockTampering() → compare performance.now() vs Date.now() drift
```

---

## Clean Tree

```
SmartPatrol/
├── index.html                    # HTML entrypoint (PWA meta)
├── App.jsx                       # Root: AppProvider → AppShell (routing + modals)
├── vite.config.js                # Vite 8 + React + TailwindCSS v4
├── package.json                  # Dependencies (react 19, firebase 12, lucide-react, tailwind 4)
├── AGENTS.md                     # Pedoman kerja agent/developer: tracing, edit scope, security, dokumentasi
├── firebase.json                 # Hosting, functions, Firestore rules, Storage rules
├── firestore.rules               # Firestore security: shared-state hanya untuk userAccess enabled, onboarding publik ke pendingRegistrations/*
├── storage.rules                 # Storage security: aset operasional di state-assets/** dan onboarding di registration-assets/{uid}/**
├── .env.example                  # Firebase config keys
├── .env.local                    # Local dev overrides
├── .env.production               # Cloud sync flags
├── .firebaserc                   # Firebase project alias
├── repair.cjs                    # One-off script: patch AppContextRuntime merge functions
│
├── src/
│   ├── main.jsx                  # ReactDOM.createRoot + AppBootBoundary (error boundary)
│   ├── App.jsx                   # Re-export dari ../App.jsx
│   ├── styles.css                # Global CSS (Tailwind directives + custom)
│   │
│   ├── context/
│   │   ├── AppContextRuntime.jsx # ★ MEGA-FILE (6043 baris): semua state, logic bisnis, hooks
│   │   └── AppContext.jsx        # Versi lama/legacy (4462 baris), masih ada tapi unused by main
│   │
│   ├── services/
│   │   ├── firebase/
│   │   │   ├── app.js            # Firebase SDK init (getApp, getAuth, getFirestore, getStorage)
│   │   │   ├── auth.js           # Login/register/provision/logout Firebase Auth + normalisasi error auth/callable
│   │   │   ├── access.js         # Pending registration, approval hooks, binding akses operasional, upload aset onboarding
│   │   │   └── cloudState.js     # Firestore CRUD: subscribe, fetch, save, upload asset state operasional
│   │   └── time/
│   │       ├── trustedTime.js    # NTP-like trusted clock: sync, tamper detection, offline session
│   │       ├── trustedTimePolicy.js # Helper murni drift/tamper untuk audit dan smoke test
│   │       └── timeAudit.js      # Audit trail metadata: trust level, verification status
│   │
│   ├── pages/
│   │   ├── PatrolPage.jsx        # Halaman utama PETUGAS: checkpoint list, shift info, countdown
│   │   ├── HistoryPage.jsx       # Riwayat patroli per shift
│   │   ├── IncidentsPage.jsx     # Daftar insiden (CRUD + progress tracking)
│   │   ├── LoginPage.jsx         # Form login/register dengan onboarding publik terisolasi
│   │   ├── DailyReportPage.jsx   # Dashboard Admin: laporan harian per kapal per shift
│   │   ├── ShipsPage.jsx         # Manajemen armada kapal (CRUD kapal, dokumen, crew assignment)
│   │   ├── UsersPage.jsx         # Daftar user (Admin-only)
│   │   └── NotificationsPage.jsx # Notifikasi shift, checkpoint pending, dll.
│   │
│   ├── components/
│   │   ├── Header.jsx            # Top bar: judul halaman, jam, dropdown notifikasi & settings
│   │   ├── BottomNav.jsx         # Bottom navigation mobile: home, incidents, history, notif
│   │   ├── SideNav.jsx           # Sidebar desktop: navigasi + info user + SOS button
│   │   ├── SOSButton.jsx         # Floating SOS button: tekan → konfirmasi → kirim
│   │   ├── TimeAuditStatus.jsx   # Badge & card audit waktu (trust level, verification)
│   │   ├── AsyncImage.jsx        # Lazy image loader (mendukung idb:// protocol dari IndexedDB)
│   │   ├── LoadingSkeleton.jsx   # Placeholder skeleton UI
│   │   ├── cards.jsx             # Komponen card reusable
│   │   ├── ui.jsx                # UI primitives reusable
│   │   │
│   │   ├── modals/
│   │   │   ├── PatrolCameraModal.jsx    # Modal kamera: ambil foto checkpoint + preview
│   │   │   ├── PatrolFormModal.jsx      # Wrapper modal untuk PatrolFormView
│   │   │   ├── IncidentFormModal.jsx    # Wrapper modal untuk IncidentFormView
│   │   │   ├── IncidentDetailModal.jsx  # Wrapper modal untuk IncidentDetailView
│   │   │   ├── SOSAlertModal.jsx        # Modal SOS: alarm buzzer + GPS + info darurat
│   │   │   ├── ConfirmModal.jsx         # Dialog konfirmasi generik
│   │   │   ├── AssignDueDatePopup.jsx   # Popup assign due date crew ke kapal
│   │   │   ├── FormModals.jsx           # Lazy-loaded: ShipFormModal, ShipDocumentFormModal, UserFormModal
│   │   │   └── DetailModals.jsx         # Lazy-loaded: UserDetailModal, ReportDetailModal, PhotoPreviewModal
│   │   │
│   │   └── views/
│   │       ├── PatrolFormView.jsx       # Form isi hasil patrol (aman/temuan + deskripsi + foto)
│   │       ├── IncidentFormView.jsx     # Form buat insiden baru
│   │       ├── IncidentDetailView.jsx   # Detail insiden + progress + dokumentasi
│   │       ├── HistoryDetailView.jsx    # Detail riwayat shift (summary, cuaca, crew, checkpoint)
│   │       ├── ReportDetailView.jsx     # Detail laporan shift lengkap
│   │       ├── ShipFormView.jsx         # Form CRUD kapal
│   │       ├── ShipDocumentFormView.jsx # Form upload dokumen kapal
│   │       ├── UserFormView.jsx         # Form CRUD user
│   │       └── UserDetailView.jsx       # Detail profil user
│   │
│   ├── data/
│   │   └── defaultData.js        # Seed data: user default, kapal default, checkpoint, constants
│   │
│   ├── hooks/
│   │   └── useFocusTrap.js       # Accessibility: trap focus dalam modal
│   │
│   └── utils/
│       ├── sanitize.js           # Sanitasi input: text, email, phone, URL, ID generator
│       ├── images.js             # Baca file gambar + kompresi WebP via canvas
│       ├── imageStore.js         # IndexedDB wrapper: simpan/muat/hapus foto offline
│       ├── persistence.js        # localStorage wrapper: load/save app state + weather cache
│       ├── formatters.js         # Format tanggal Indonesia, waktu, cuaca deskriptor, Google Maps URL
│       ├── documentFiles.js      # Deteksi tipe dokumen (PDF, Word, Excel, dll.)
│       ├── sosAudio.js           # Web Audio API: generate alarm buzzer SOS (square wave 180Hz)
│       └── storageQuota.js       # Cek usage localStorage (warning >80%)
│
├── functions/
│   ├── accessModels.js           # Normalisasi payload onboarding dan akses operasional
│   ├── index.js                  # Cloud Functions: trusted time, resolve access, approval onboarding, revoke access
│   └── package.json              # Dependencies cloud functions
│
├── public/
│   ├── favicon-smartpatrol.svg   # Favicon
│   └── assets/                   # Build-time lazy-loaded modal chunks (legacy-modal-shim dll.)
│
├── docs/
│   ├── firebase-roadmap-smartpatrol.md
│   ├── planning-uiux-dashboard-pic.md
│   └── user_guideline.md
│
└── tests/
    ├── e2e/                      # (kosong)
    └── security/                 # Smoke test auth-access, rules containment, dan trusted time
```

---

## Module Map (The Chapters)

### Context (Otak Aplikasi)

| File | Fungsi/Class Publik Utama | Peran |
|---|---|---|
| `src/context/AppContextRuntime.jsx` | `AppProvider`, `useAuth`, `useUI`, `useRole`, `usePatrol`, `useShips`, `useIncidents`, `useUsers`, `useReports`, `useWeather`, `useHistory`, `useNotifications`, `useSOS` | **Satu-satunya state manager.** 6000+ baris berisi seluruh logika bisnis: auth, shift rotation, checkpoint CRUD, incidents, cloud sync merge, crew assignment, SOS, notifikasi, dan weather fetch. Setiap domain di-expose via dedicated React Context hook. |
| `src/context/AppContext.jsx` | (sama seperti Runtime, versi lama) | Legacy/backup context. Tidak di-import oleh `App.jsx` saat ini. |

### Services

| File | Fungsi Publik | Peran |
|---|---|---|
| `services/firebase/app.js` | `firebaseApp`, `firebaseAuth`, `firebaseDb`, `firebaseFunctions`, `firebaseStorage`, `isFirebaseConfigured`, `firebaseConfigSource` | Inisialisasi Firebase SDK singleton dari env vars dengan fallback config staging tersemat untuk mencegah build auth kosong. |
| `services/firebase/auth.js` | `loginWithFirebaseEmail`, `registerWithFirebaseEmail`, `provisionFirebaseEmailUser`, `logoutFirebaseUser`, `subscribeToFirebaseAuthChanges` | Wrapper Firebase Auth. `provisionFirebaseEmailUser` membuat akun baru tanpa mengganti sesi admin (isolated temp app). |
| `services/firebase/access.js` | `createPendingRegistration`, `uploadRegistrationPhotoAsset`, `resolveOperationalAccess`, `syncOperationalUserAccess`, `approvePendingRegistration`, `rejectPendingRegistration`, `revokeOperationalUserAccess`, `subscribeToPendingRegistrations` | Lapisan onboarding terisolasi dan sidecar authz. Public register hanya menulis `pendingRegistrations/{uid}`, sedangkan approval/binding akses operasional dijalankan lewat Cloud Functions. |
| `services/firebase/cloudState.js` | `subscribeToCloudAppState`, `fetchCloudAppState`, `saveCloudAppState`, `uploadCloudDataUrlAsset` | CRUD Firestore single-document (`smartpatrol/shared-state`). Menggunakan `runTransaction` untuk merge. Akses client sekarang digate oleh `userAccess/{uid}` di rules. |
| `services/time/trustedTime.js` | `initializeTrustedTime`, `getTrustedNowMs`, `getTrustedDate`, `getTrustedTimeSnapshot`, `createTrustedTimestampRecord`, `syncServerTime`, `detectClockTampering`, `subscribeTrustedTime`, `startOfflineSession`, `finishOfflineSession` | NTP-like clock: sinkronisasi ke server, deteksi tamper via `performance.now()` drift, offline session tracking. |
| `services/time/trustedTimePolicy.js` | `calculateClockDriftMs`, `isClockDriftSuspicious` | Helper murni untuk menghitung drift audit trusted time dan smoke test. |
| `services/time/timeAudit.js` | `buildTimeAuditInfo`, `summarizeTimeAudit`, `normalizeTimeAuditRecord`, `markTimeAuditRecordReceived`, `resolveTimeVerificationStatus`, `hasTimeAuditMetadata` | Audit trail setiap record: menentukan trust level (`server-trusted`, `offline-trusted`, `offline-interrupted`, `unverified`) dan verification status (`verified`, `pending-sync`, `needs-review`, `suspicious`, `legacy`). |

### Pages

| File | Komponen | Peran |
|---|---|---|
| `pages/LoginPage.jsx` | `LoginPage` | Login via Firebase Auth. Registrasi publik hanya menyimpan profil onboarding terbatas dan menunggu approval admin. |
| `pages/PatrolPage.jsx` | `PatrolPage` | Halaman utama petugas: daftar checkpoint, tab Info/Checkpoint, modal status petugas shift, progress bar, countdown shift, summary aman/temuan/missed. |
| `pages/HistoryPage.jsx` | `HistoryPage` | Riwayat patroli: list shift sebelumnya dan untuk admin menampilkan shift `ON GOING` di urutan teratas agar progres patroli aktif bisa dipantau cepat. |
| `pages/IncidentsPage.jsx` | `IncidentsPage` | Manajemen insiden: list, filter, buat baru, progress tracking, dokumentasi. |
| `pages/DailyReportPage.jsx` | `DailyReportPage` | Dashboard Admin/PIC: laporan harian per kapal + shift, statistik, detail report. |
| `pages/ShipsPage.jsx` | `ShipsPage` | CRUD armada kapal, dokumen, checkpoint definition, assign/transfer crew. |
| `pages/UsersPage.jsx` | `UsersPage` | List user (Admin only), klik untuk detail. |
| `pages/NotificationsPage.jsx` | `NotificationsPage` | Notifikasi sistem: shift change, checkpoint pending, dll. |

### Components

| File | Komponen | Peran |
|---|---|---|
| `components/Header.jsx` | `Header` | Top bar dengan judul halaman, jam real-time, dropdown notifikasi dan settings. |
| `components/BottomNav.jsx` | `BottomNav` | Navigasi bawah mobile dengan urutan tab berbeda untuk PETUGAS vs ADMIN/PIC. |
| `components/SideNav.jsx` | `SideNav` | Sidebar desktop dengan urutan tab berbeda untuk PETUGAS vs ADMIN/PIC, plus info user + tombol SOS. |
| `components/SOSButton.jsx` | `SOSButton` | Tombol floating SOS: tekan → dialog konfirmasi → ambil GPS → trigger alarm. |
| `components/TimeAuditStatus.jsx` | `TimeAuditBadge`, `TimeAuditPills`, `TimeAuditRecordCard`, `TimeAuditSummaryCard` | Komponen UI untuk menampilkan status audit waktu (badge, card, summary). |
| `components/AsyncImage.jsx` | `AsyncImage` | Image loader yang mendukung `idb://` key (resolve dari IndexedDB). |
| `components/cards.jsx` | Various card components | Komponen card reusable untuk item list. |
| `components/ui.jsx` | UI primitives | Komponen UI dasar reusable. |
| `components/modals/SOSAlertModal.jsx` | `SOSAlertModal` | Modal fullscreen SOS: alarm buzzer audio, info GPS, nama kapal, tombol "Terima & Mengerti". |
| `components/modals/PatrolCameraModal.jsx` | `PatrolCameraModal` | Modal untuk capture foto dari kamera/file, preview + crop. |
| `components/modals/ShiftStatusModal.jsx` | `ShiftStatusModal` | Modal status petugas shift yang mengunci checklist sampai snapshot patroli/istirahat tersimpan. |
| `components/modals/ConfirmModal.jsx` | `ConfirmModal` | Dialog konfirmasi generik (ya/tidak). |
| `components/modals/AssignDueDatePopup.jsx` | `AssignDueDatePopup` | Popup untuk assign crew ke kapal dengan tanggal mulai / TBC. |
| `components/views/PatrolFormView.jsx` | `PatrolFormView` | Form isi hasil patrol (tipe, deskripsi kejadian, penyebab, tindak lanjut, foto). |
| `components/views/IncidentDetailView.jsx` | `IncidentDetailView` | Detail insiden: info, progress timeline, dokumentasi, foto. |
| `components/views/HistoryDetailView.jsx` | `HistoryDetailView` | Detail riwayat shift: crew, status patroli/istirahat, cuaca, summary, daftar checkpoint. |
| `components/views/ReportDetailView.jsx` | `ReportDetailView` | Detail laporan shift lengkap. |
| `components/views/ShipFormView.jsx` | `ShipFormView` | Form CRUD kapal: info, checkpoint definitions, SOS recipients. |
| `components/views/UserFormView.jsx` | `UserFormView` | Form CRUD user: profil, kontak darurat, foto. |
| `components/views/UserDetailView.jsx` | `UserDetailView` | Profil user detail: biodata, assignment, credential status. |
| `components/views/IncidentFormView.jsx` | `IncidentFormView` | Form buat insiden baru. |
| `components/views/ShipDocumentFormView.jsx` | `ShipDocumentFormView` | Form upload dokumen kapal. |

### Utils

| File | Fungsi Publik | Peran |
|---|---|---|
| `utils/sanitize.js` | `sanitizeText`, `sanitizeEmail`, `sanitizePhone`, `sanitizeUrl`, `sanitizeCoordinate`, `sanitizeMultilineText`, `makeId` | Sanitasi input pengguna, strip control chars & angle brackets, generate UUID. |
| `utils/images.js` | `readImageFileAsDataUrl`, `readFileAsDataUrl` | Baca file gambar, resize + kompres ke WebP via canvas. |
| `utils/imageStore.js` | `saveImageToDB`, `loadImageFromDB`, `deleteOldImagesFromDB` | IndexedDB wrapper (`smartpatrol-images/photos`): simpan foto offline, cleanup otomatis >7 hari. |
| `utils/persistence.js` | `loadAppState`, `saveAppState`, `loadWeatherCache`, `saveWeatherCache` | localStorage wrapper untuk state utama + weather cache (TTL 30 menit). |
| `utils/formatters.js` | `formatDate`, `formatShortDate`, `formatTime`, `formatDateTime`, `buildMapsUrl`, `getWeatherDescriptor` | Format tanggal/waktu Indonesia, URL Google Maps, label cuaca. |
| `utils/documentFiles.js` | `detectDocumentType`, `getDocumentTypeLabel` | Deteksi tipe file dokumen (PDF, DOC, XLS, PPT, IMG). |
| `utils/sosAudio.js` | `startSOSAlarm`, `stopSOSAlarm` | Web Audio API: generate alarm buzzer keras (square wave 180Hz + harmonic). |
| `utils/storageQuota.js` | `checkStorageQuota`, `getLocalStorageUsage` | Cek penggunaan localStorage, warning jika >80% dari 5MB. |

### Cloud Functions

| File | Fungsi | Peran |
|---|---|---|
| `functions/index.js` | `getServerTime`, `resolveOperationalAccess`, `syncOperationalUserAccess`, `approvePendingRegistration`, `rejectPendingRegistration`, `revokeOperationalUserAccess`, `notifyAdminsOnPendingRegistrationCreate` | Trusted server time + kontrol binding/approval akses operasional + notifikasi admin saat registrasi onboarding baru. Region `asia-southeast2`. |

### Data

| File | Export | Peran |
|---|---|---|
| `data/defaultData.js` | `createDefaultAppState`, `getEmptyPatrolDraft`, `getEmptyIncidentDraft`, `getEmptyUserDraft`, `getEmptyShipDraft`, `createPosterDataUrl`, `DEFAULT_LOCATION_OPTIONS`, `USER_ROLE_OPTIONS`, `AGENCY_OPTIONS`, `SHIP_TYPE_OPTIONS`, `SHIP_STATUS_OPTIONS` | Seed data awal: user dummy, kapal dummy, checkpoint locations, form defaults, SVG avatar generator. |

---

## Data & Config

### Environment Variables

| File | Isi |
|---|---|
| `.env.example` | `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_STORAGE_BUCKET`, `VITE_FIREBASE_MESSAGING_SENDER_ID`, `VITE_FIREBASE_APP_ID`, `VITE_FIREBASE_MEASUREMENT_ID` |
| `.env.local` | Override lokal (tidak di-commit) |
| `.env.production` | `VITE_ENABLE_CLOUD_SYNC=1`, `VITE_ENABLE_CLOUD_SYNC_WRITE=1` |

### Skema Data (Firestore Single Document)

State operasional utama masih disimpan dalam **satu dokumen** Firestore:
`smartpatrol/shared-state`

Sidecar authz/security:

```
pendingRegistrations/{uid} -> profil onboarding publik terbatas (pending/approved/rejected)
userAccess/{uid} -> role, status, shipAssigned, enabled flag, dan sumber approval untuk rules
```

```
{
  schemaVersion: 1,
  clientUpdatedAt: <epoch_ms>,
  updatedAt: <server_timestamp>,
  state: {
    shipsData: [                    // Array kapal
      { id, name, type, imoNumber, lat, lng, status, route, routeLoading,
        routeDischarge, cargoType, cargoAmount, photoUrl,
        personnel: [userId],        // Crew assigned saat ini
        personnelNextMonth: [userId],// Crew jadwal berikutnya
        personnelSchedules: { [userId]: { startDate, endDate } },
        customCheckpoints: [{ name, desc, isDefault }],
        documents: [{ id, title, docDate, desc, fileUrl, fileName, mimeType }],
        sosRecipientShipIds: [shipId],
      }
    ],
    usersData: [                    // Array user
      { id, name, role, type, status, shipAssigned, email,
        firebaseUid, authProvider,  // mapped dari Firebase Auth / binding operasional
        phone, dob, address, officeAddress,
        emergencyName, emergencyContact, emergencyRelation,
        photoUrl, credentialUpdatedAt,
        dutyEndDate, dutyStatus,    // crew rotation
      }
    ],
    checkpointsByShip: {            // State checkpoint per kapal per shift
      [shipId]: [
        { id, name, desc, status, completedBy, completedAt, resultType,
          photoUrl, photoGallery: [{ id, photoUrl, author, date, time, createdAt, ...timeAuditFields }],
          kejadian, penyebab, tindakLanjut, shiftKey,
          ...timeAuditFields        // occurredAtTrustedMs, timeTrustLevel, dll.
        }
      ]
    },
    activeShiftKey: "YYYY-MM-DD|shift-id",
    shiftStatusRecords: {           // Snapshot status petugas per kapal pada shift aktif
      ["shipId|shiftKey"]: {
        shipId, shipName, shiftKey, filledByUserId, filledByName,
        filledAtTrustedIso, filledAtTrustedMs, timeTrustLevel, clockTamperDetected,
        items: [{ userId, name, role, status: "patroli"|"istirahat" }]
      }
    },
    incidentsData: [                // Array insiden
      { id, date, time, location, shipName, deskripsi, penyebab,
        tindakLanjut, reportedBy, photoUrl, status, completedAt,
        ...timeAuditFields
      }
    ],
    incidentMeta: {                 // Metadata per insiden
      [incidentId]: {
        documentation: [{ id, photoUrl, author, notes, createdAt }],
        progress: [{ id, comment, photoUrl, author, createdAt, status }],
      }
    },
    historyEntries: [               // Riwayat shift
      { id, key, ship, shift, date, time, crewSnapshot, weatherSnapshot,
        shipSnapshot, checkpoints, summary: { aman, temuan, missed, completed, total },
        // crewSnapshot menyimpan score dan shiftStatusLabel per petugas saat shift diarsipkan
        completedAt,
      }
    ],
    notifications: [                // Notifikasi
      { id, type, title, body, createdAt, read, tone }
    ],
    activeSOSAlert: {               // Alert SOS aktif (null jika tidak ada)
      id, triggeredBy, shipName, lat, lng, triggeredAt, crewSnapshot,
    },
    sosHistory: [                   // Riwayat SOS
      { id, triggeredBy, shipName, lat, lng, triggeredAt, acknowledgedAt }
    ],
    theme: "dark" | "light",
  }
}
```

### Penyimpanan Lokal

| Storage | Key | Fungsi |
|---|---|---|
| localStorage | `smartpatrol.secure.local.v2` | State utama yang sudah dipangkas: tidak lagi menyimpan hash password dan membatasi profil sensitif user lain |
| localStorage | `smartpatrol.weather.local.v2` | Cache cuaca (TTL 30 menit) |
| localStorage | `smartpatrol.auth.local.v1` | Session user ID |
| localStorage | `smartpatrol.trusted-time.v1` | Anchor trusted time |
| IndexedDB | `smartpatrol-images` / store `photos` | Foto checkpoint/insiden offline (key: `idb://img-{timestamp}-{random}`) |

### Firebase Storage

Path:

```
state-assets/** -> aset operasional checkpoint/insiden
registration-assets/{uid}/** -> aset onboarding publik milik pemilik registrasi
```

### Migration / Seed

- Tidak ada migration SQL/formal. Seed data di `data/defaultData.js` dan mock users di `AppContextRuntime.jsx` (`getMockUsersList()`).
- Crew migration (auto-transfer antar bulan) dijalankan via effect di `AppProvider` (baris ~2720).
- Shift rotation dan archiving ke history dijalankan di `migrateCheckpointStateToCurrentShift()`.

### Folder Output / Runtime Artifacts

- `dist/` — output build Vite (deploy ke Firebase Hosting)
- `public/assets/` — lazy-loaded modal chunks (generated saat build)

---

## External Integrations

| Service | Tujuan | Modul Pemanggil |
|---|---|---|
| **Firebase Auth** | Autentikasi email/password | `services/firebase/auth.js` → `AppContextRuntime` |
| **Firestore** | Penyimpanan state operasional terpusat + sidecar authz (`pendingRegistrations`, `userAccess`) | `services/firebase/cloudState.js`, `services/firebase/access.js` → `AppContextRuntime` |
| **Firebase Storage** | Upload foto/dokumen ke cloud | `services/firebase/cloudState.js` (`uploadCloudDataUrlAsset`) |
| **Firebase Hosting** | Deploy SPA | `firebase.json` |
| **Firebase Cloud Functions** | Server time endpoint (`/api/server-time`) + approval/binding akses operasional | `functions/index.js` → `services/time/trustedTime.js`, `services/firebase/access.js` |
| **Open-Meteo API** | Data cuaca real-time (suhu, angin, kondisi) | `AppContextRuntime` (inline fetch di weatherEffect, ~baris 4900-an) |
| **Google Maps** | Link ke koordinat kapal | `utils/formatters.js` (`buildMapsUrl`) |
| **Navigator Geolocation API** | Koordinat GPS untuk SOS | `components/SOSButton.jsx` |
| **Web Audio API** | Alarm buzzer SOS | `utils/sosAudio.js` |

---

## Risks / Blind Spots

| Area | Detail |
|---|---|
| **Mega-file context** | `AppContextRuntime.jsx` (6043 baris, 242KB) berisi SEMUA logika bisnis dalam satu file. Sangat sulit di-maintain. `AppContext.jsx` (4462 baris) masih ada sebagai versi lama — potensi kebingungan mana yang aktif. |
| **Single document Firestore** | Seluruh state disimpan dalam satu dokumen Firestore (`smartpatrol/shared-state`). Ada limit 1MB per dokumen Firestore — bisa tercapai jika data banyak (foto base64, history panjang). |
| **Single document Firestore** | `smartpatrol/shared-state` masih jadi blast radius besar. Rules kini sudah dibatasi ke `userAccess.enabled`, tetapi konflik merge lintas-domain masih menjadi risiko arsitektur. |
| **Storage operasional shared** | `state-assets/**` sekarang hanya bisa diakses user operasional yang enabled, tetapi aset operasional masih belum dipecah per-domain. |
| **Offline image sync** | Gambar disimpan di IndexedDB lokal, di-upload ke Firebase Storage saat sync. Race condition saat multiple device sync bersamaan bisa menyebabkan gambar hilang/terganti (bugs sebelumnya terdokumentasi). |
| **Weather API inline** | Panggilan ke Open-Meteo API di-embed langsung di `AppContextRuntime` tanpa abstraksi service terpisah. |
| **Legacy hash cleanup belum tuntas** | Flow login/register aktif sudah dipindahkan ke Firebase Auth + sidecar approval. Namun helper legacy di mega-file masih perlu dibersihkan tuntas pada refactor berikutnya. |
| **Coverage test masih minimum** | Sudah ada smoke test `tests/security/*`, tetapi belum ada integration test emulator untuk rules/callable dan belum ada e2e UI. |
| **Dynamic import minimal** | Beberapa modal menggunakan lazy import via `FormModals.jsx` dan `DetailModals.jsx`, tapi mayoritas page di-import eager di `App.jsx`. |
| **repair.cjs** | Script perbaikan manual yang memodifikasi `AppContextRuntime.jsx` secara langsung — fragile dan hanya dijalankan sekali. |
| **Trusted time drift** | Deteksi tamper bergantung pada `performance.now()` vs `Date.now()` — bisa false positive saat device sleep/resume. |
| **Config tidak ditemukan** | Tidak ada file `.env.local` di repo (gitignored). Tidak ada deployment pipeline config (CI/CD). |
