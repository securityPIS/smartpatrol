# SmartPatrol — Project Instructions (AI Assistant)

## ATURAN NAVIGASI & KONTEKS

### Mandatory Map Check
Setiap awal sesi baru, WAJIB baca `SYSTEM_MAP.md` di root folder sebagai kompas utama arsitektur, tech stack, dan lokasi fungsi kunci. Jangan lakukan blind scan.

### Fallback Map
Jika `SYSTEM_MAP.md` belum ada atau diduga usang terhadap kondisi kode saat ini, buat/perbarui dulu secara ringkas sebelum analisis lanjutan.

### Trace-by-Function / Trace-by-Flow
Gunakan peta untuk menentukan titik mulai, lalu telusuri alur berurutan:
`Trigger/Entry Point (UI/CLI/API/Event) → Handler/Controller → Business Logic/Service → Data Access/Repository → Database/Storage`

### Universal Layer Mapping
Jika istilah Controller/Service/Repo tidak dipakai, map ke padanan terdekat (Handler, Usecase, Domain, Adapter, DAO, dll) tanpa memaksa nama layer.

### Efisiensi Tanpa rg
Jangan gunakan `rg`. Gunakan `SYSTEM_MAP.md` + Header Doc untuk langsung ke target.

### Universal Exclusions
Selalu abaikan folder dependensi/build/IDE/cache:
`node_modules`, `.venv`, `venv`, `env`, `vendor`, `target`, `.gradle`, `bin`, `obj`, `pkg`, `.git`, `.vscode`, `.idea`, `__pycache__`, `dist`, `build`, `tmp`, `coverage`, `.next`, `.nuxt`, `.cache`.

### Super Efisien
- Minim command, minim file read. Jangan baca seluruh file besar jika tidak diperlukan; baca blok fungsi/class terkait saja.
- Untuk file >500 baris, baca per blok fungsi/class terkait, bukan full file kecuali diminta user.

### Pre-Edit Trace Note
Sebelum edit, tulis singkat (1-2 kalimat): file target + alur fungsi yang akan disentuh.

### Persetujuan Inisiatif
Jika ada perubahan di luar request user, wajib minta izin sebelum eksekusi.

### Modularitas
Pecah logika ke modul/file kecil sesuai tanggung jawab (Single Responsibility). Jangan menumpuk banyak logic dalam satu file.

---

## HARD INSTRUCTION DOKUMENTASI (WAJIB)

### Header Doc
Setiap file yang dibuat/diubah wajib punya header doc singkat di paling atas file (sesuai gaya komentar bahasa: `//`, `#`, `'`, `/* */`).

### Isi Minimal Header Doc
- **Tujuan**: tujuan file/module
- **Caller**: pemanggil/pengguna utama
- **Dependensi**: service/repo/API utama
- **Main Functions**: fungsi/class public/utama
- **Side Effects**: DB read/write, HTTP call, file I/O

### Synchronized Documentation
Setiap perubahan logic wajib diikuti update Header Doc agar tetap akurat, ringkas, konsisten, dan mudah dipindai.

### Synchronized Map Update
Jika menambah/menghapus file atau mengubah flow fungsi utama yang tercatat, WAJIB update `SYSTEM_MAP.md` pada bagian terkait di sesi yang sama.

### Larangan
Dilarang menambah/mengubah logic tanpa menyesuaikan Header Doc.

---

## STANDAR DATABASE & QUERY (WAJIB SETARA DBA SENIOR)

### Minimum Cost
Rancang query/data access dengan prinsip minimum I/O, minimum cost, minimum lock contention.

### Evaluasi Wajib
Selalu evaluasi:
- Cardinality/selectivity filter
- Pemakaian index/key
- Join order & join strategy
- Dampak CPU, memory, disk, network

### Anti-Boros Resource
Hindari proses berulang, temp table tidak perlu, write berlapis, N+1 query jika bisa diringkas dengan rencana query lebih efisien.

### Strategi Efisien Kontekstual
Pilih strategi sesuai konteks (upsert, merge, batch, incremental, query rewrite), bukan template tunggal.

### Scalability & Consistency
Pastikan aman untuk data besar: transactional consistency tepat, locking minimal, dan performa stabil saat data tumbuh.

### Justifikasi DB-Heavy
Sebelum finalize perubahan DB-heavy, jelaskan singkat alasan efisiensi, trade-off, dan risiko performa yang dihindari.
