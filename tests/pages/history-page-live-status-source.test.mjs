/*
Tujuan: Mencegah list Riwayat admin ON GOING menampilkan checkpoint pending sebagai Missed.
Caller: Node test runner saat verifikasi halaman riwayat.
Dependensi: src/pages/HistoryPage.jsx.
Main Functions: Memastikan kartu status ketiga memakai label/count Pending untuk live entry dan Missed untuk history selesai.
Side Effects: Tidak ada; test membaca file sumber secara read-only.
*/

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('HistoryPage live entries render pending status summary instead of missed summary', () => {
  const source = readFileSync(new URL('../../src/pages/HistoryPage.jsx', import.meta.url), 'utf8');

  assert.match(
    source,
    /statusCount\s*=\s*isLiveEntry\s*\?\s*\(summary\.pending\s*\?\?\s*data\.pending\s*\?\?\s*0\)\s*:\s*\(summary\.missed\s*\?\?\s*data\.missed\s*\?\?\s*0\)/,
    'live ON GOING cards should count pending checkpoints, completed history cards should count missed checkpoints',
  );
  assert.match(
    source,
    /\{isLiveEntry\s*\?\s*'Pending'\s*:\s*'Missed'\}/,
    'live ON GOING cards should label the third summary as Pending',
  );
});
