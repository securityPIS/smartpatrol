/*
Tujuan: Mengunci format shiftKey server agar konsisten dengan client SmartPatrol.
Caller: Node test runner saat verifikasi Cloud Functions.
Dependensi: functions/index.js dan src/context/AppContextRuntime.jsx sebagai sumber format shiftKey.
Main Functions: Memastikan scheduler server memakai delimiter `|` seperti client.
Side Effects: Tidak ada; test membaca file sumber secara read-only.
*/

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

function readSource(path) {
  return readFileSync(new URL(path, import.meta.url), 'utf8');
}

test('Cloud Functions shiftKey format stays aligned with client activeShiftKey format', () => {
  const functionsSource = readSource('../../functions/index.js');
  const clientSource = readSource('../../src/context/AppContextRuntime.jsx');

  assert.match(
    clientSource,
    /key:\s*`\$\{dateKey\}\|\$\{definition\.id\}`/,
    'client shiftMetaFromParts should keep YYYY-MM-DD|shift-id format',
  );
  assert.match(
    functionsSource,
    /key:\s*`\$\{dateKey\}\|\$\{shift\.id\}`/,
    'server createShiftMeta should keep YYYY-MM-DD|shift-id format for patrolReports and history fallback',
  );
});
