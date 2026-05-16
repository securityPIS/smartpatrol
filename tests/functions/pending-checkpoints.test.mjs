/*
Tujuan: Menguji kalkulasi pending checkpoint scheduler agar hanya memakai roster shift aktif.
Caller: Node test runner saat verifikasi Cloud Functions.
Dependensi: Helper pendingCheckpoints server dan daftar checkpoint default client.
Main Functions: Memvalidasi default+custom, titik tambahan shift aktif, report aktif, dan stale shift lama.
Side Effects: Tidak ada; test berjalan in-memory tanpa Firebase.
*/

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  SERVER_DEFAULT_CHECKPOINT_NAMES,
  buildCheckpointRosterForShipShift,
  countPendingCheckpointsInRoster,
} from '../../functions/pendingCheckpoints.js';

function readClientDefaultCheckpointNames() {
  const source = readFileSync(new URL('../../src/data/defaultData.js', import.meta.url), 'utf8');
  const match = source.match(/export const DEFAULT_LOCATION_OPTIONS = \[([\s\S]*?)\];/);
  assert.ok(match, 'DEFAULT_LOCATION_OPTIONS export should exist');
  return Array.from(match[1].matchAll(/"([^"]+)"/g), (item) => item[1]);
}

const shiftMeta = {
  key: '2026-05-08|shift-1-active',
  startAt: new Date('2026-05-07T23:00:00.000Z'),
  endAt: new Date('2026-05-08T05:00:00.000Z'),
};

const ship = {
  id: 's2',
  name: 'MT SRIWIJAYA',
  customCheckpoints: [
    { name: 'Pompa Kimia', desc: 'Pastikan tidak ada kebocoran.' },
  ],
};

function buildRoster(state = {}, reportDocuments = []) {
  return buildCheckpointRosterForShipShift({
    state,
    ship,
    shiftMeta,
    reportDocuments,
  });
}

test('server default checkpoint list stays aligned with client defaults', () => {
  assert.deepEqual(SERVER_DEFAULT_CHECKPOINT_NAMES, readClientDefaultCheckpointNames());
});

test('counts all default plus custom checkpoints when no active-shift report exists', () => {
  const roster = buildRoster();

  assert.equal(roster.length, 20);
  assert.equal(countPendingCheckpointsInRoster(roster), 20);
});

test('ignores stale completed checkpoints from previous shifts', () => {
  const staleCompleted = SERVER_DEFAULT_CHECKPOINT_NAMES.slice(0, 7).map((name) => ({
    name,
    status: 'completed',
    resultType: 'aman',
    shiftKey: '2026-05-07|shift-3-active',
    updatedAt: '2026-05-07T18:30:00.000Z',
  }));
  const roster = buildRoster({
    checkpointsByShip: {
      [ship.id]: staleCompleted,
    },
  });

  assert.equal(roster.length, 20);
  assert.equal(countPendingCheckpointsInRoster(roster), 20);
});

test('does not treat sync time as active-shift patrol time for legacy records', () => {
  const staleLegacyCompleted = SERVER_DEFAULT_CHECKPOINT_NAMES.slice(0, 7).map((name) => ({
    name,
    status: 'completed',
    resultType: 'aman',
    completedAt: '2026-05-07T18:30:00.000Z',
    clientUpdatedAt: shiftMeta.startAt.getTime() + 30 * 60 * 1000,
    receivedAtServerMs: shiftMeta.startAt.getTime() + 31 * 60 * 1000,
  }));
  const roster = buildRoster({
    checkpointsByShip: {
      [ship.id]: staleLegacyCompleted,
    },
  });

  assert.equal(roster.length, 20);
  assert.equal(countPendingCheckpointsInRoster(roster), 20);
});

test('includes temporary checkpoints created for the active shift', () => {
  const temporaryCheckpoints = [
    {
      id: 's2::temporary::1',
      name: 'Manifold Tambahan',
      status: 'pending',
      shiftKey: shiftMeta.key,
      shipId: ship.id,
      shipName: ship.name,
      isTemporaryShiftNode: true,
      createdInShiftKey: shiftMeta.key,
    },
    {
      id: 's2::temporary::2',
      name: 'Area Mooring Tambahan',
      status: 'pending',
      shiftKey: shiftMeta.key,
      shipId: ship.id,
      shipName: ship.name,
      isTemporaryShiftNode: true,
      createdInShiftKey: shiftMeta.key,
    },
    {
      id: 's2::temporary::old',
      name: 'Titik Shift Lama',
      status: 'pending',
      shiftKey: '2026-05-07|shift-3-active',
      shipId: ship.id,
      shipName: ship.name,
      isTemporaryShiftNode: true,
      createdInShiftKey: '2026-05-07|shift-3-active',
    },
  ];
  const roster = buildRoster({
    checkpointsByShip: {
      [ship.id]: temporaryCheckpoints,
    },
  });

  assert.equal(roster.length, 22);
  assert.equal(countPendingCheckpointsInRoster(roster), 22);
});

test('subtracts only completed reports from the active shift roster', () => {
  const temporaryCheckpoints = [
    {
      id: 's2::temporary::1',
      name: 'Manifold Tambahan',
      status: 'pending',
      shiftKey: shiftMeta.key,
      shipId: ship.id,
      shipName: ship.name,
      isTemporaryShiftNode: true,
      createdInShiftKey: shiftMeta.key,
    },
    {
      id: 's2::temporary::2',
      name: 'Area Mooring Tambahan',
      status: 'pending',
      shiftKey: shiftMeta.key,
      shipId: ship.id,
      shipName: ship.name,
      isTemporaryShiftNode: true,
      createdInShiftKey: shiftMeta.key,
    },
  ];
  const activeReports = SERVER_DEFAULT_CHECKPOINT_NAMES.slice(0, 7).map((name) => ({
    name,
    checkpointName: name,
    status: 'completed',
    resultType: 'aman',
    shiftKey: shiftMeta.key,
    shipId: ship.id,
    shipName: ship.name,
    updatedAt: '2026-05-08T01:30:00.000Z',
  }));
  const roster = buildRoster({
    checkpointsByShip: {
      [ship.id]: temporaryCheckpoints,
    },
  }, activeReports);

  assert.equal(roster.length, 22);
  assert.equal(countPendingCheckpointsInRoster(roster), 15);
});
