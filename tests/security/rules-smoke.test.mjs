/*
Tujuan: Smoke test statis untuk memastikan rules Firebase tidak kembali public-open.
Caller: `npm run test:security`.
Dependensi: node:test, node:assert, firestore.rules, dan storage.rules.
Main Functions: Memvalidasi keberadaan rule sidecar auth, domain report, dan proteksi storage.
Side Effects: Membaca file rules lokal tanpa menulis state.
*/

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('firestore rules tidak lagi public-open dan punya koleksi security sidecar', async () => {
  const rules = await readFile(new URL('../../firestore.rules', import.meta.url), 'utf8');

  assert.equal(rules.includes('allow read, write: if true;'), false);
  assert.match(rules, /match \/smartpatrol\/shared-state/);
  assert.match(rules, /match \/pendingRegistrations\/\{uid\}/);
  assert.match(rules, /match \/userAccess\/\{uid\}/);
  assert.match(rules, /match \/patrolReports\/\{shiftKey\}\/ships\/\{shipId\}\/checkpoints\/\{checkpointId\}/);
  assert.match(rules, /match \/incidents\/\{incidentId\}/);
  assert.match(rules, /hasOperationalSharedStateAccess/);
  assert.match(rules, /isValidPatrolReportWrite/);
  assert.match(rules, /isValidIncidentReportWrite/);
  assert.match(rules, /isAssignedOperationalShip/);
});

test('storage rules memisahkan aset onboarding dari aset operasional', async () => {
  const rules = await readFile(new URL('../../storage.rules', import.meta.url), 'utf8');

  assert.equal(rules.includes('allow read, write: if true;'), false);
  assert.match(rules, /match \/state-assets\/\{allPaths=\*\*\}/);
  assert.match(rules, /match \/registration-assets\/\{uid\}\/\{allPaths=\*\*\}/);
  assert.match(rules, /hasOperationalAssetAccess/);
});
