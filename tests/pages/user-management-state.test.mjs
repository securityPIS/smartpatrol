/*
Tujuan: Menjaga integritas state user saat admin mengubah penugasan kapal dan akses operasional.
Caller: Node test runner untuk regresi manajemen user.
Dependensi: src/utils/userManagement.js.
Main Functions: Menguji assignment eksklusif lintas kapal dan override kosong untuk unassign.
Side Effects: Tidak ada; test memakai data dummy in-memory.
*/

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  assignUserToExclusiveShip,
  removeUserFromShipAssignment,
  resolveExplicitOverride,
} from '../../src/utils/userManagement.js';

const baseShips = [
  {
    id: 'old',
    name: 'KM Lama',
    personnel: ['u1', 'u2'],
    personnelNextMonth: ['u2'],
    personnelSchedules: {
      u2: { startDate: '2026-05-01', endDate: '2026-05-31', isTBC: false },
    },
  },
  {
    id: 'new',
    name: 'KM Baru',
    personnel: [],
    personnelNextMonth: ['u2'],
    personnelSchedules: {
      u2: { startDate: '2026-06-01', endDate: '', isTBC: true },
    },
  },
];

test('assignUserToExclusiveShip removes stale current and next assignments from other ships', () => {
  const result = assignUserToExclusiveShip(baseShips, {
    userId: 'u2',
    targetShipId: 'new',
    scheduleType: 'current',
    schedule: { startDate: '2026-05-20', endDate: '2026-06-20', isTBC: false },
    mutationMeta: { updatedAt: '2026-05-20T10:00:00.000Z', updatedAtClientMs: 1, updatedAtTrustedMs: 2 },
  });

  const oldShip = result.find((ship) => ship.id === 'old');
  const newShip = result.find((ship) => ship.id === 'new');

  assert.deepEqual(oldShip.personnel, ['u1']);
  assert.deepEqual(oldShip.personnelNextMonth, []);
  assert.equal(oldShip.personnelSchedules.u2, undefined);
  assert.deepEqual(newShip.personnel, ['u2']);
  assert.deepEqual(newShip.personnelNextMonth, []);
  assert.deepEqual(newShip.personnelSchedules.u2, {
    startDate: '2026-05-20',
    endDate: '2026-06-20',
    isTBC: false,
  });
  assert.equal(newShip.updatedAt, '2026-05-20T10:00:00.000Z');
});

test('removeUserFromShipAssignment reports remaining current assignment on another ship', () => {
  const result = removeUserFromShipAssignment([
    { id: 'old', name: 'KM Lama', personnel: ['u2'], personnelNextMonth: [], personnelSchedules: { u2: {} } },
    { id: 'new', name: 'KM Baru', personnel: ['u2'], personnelNextMonth: [], personnelSchedules: { u2: {} } },
  ], {
    userId: 'u2',
    targetShipId: 'old',
    scheduleType: 'current',
    mutationMeta: { updatedAt: '2026-05-20T10:00:00.000Z' },
  });

  assert.deepEqual(result.ships.find((ship) => ship.id === 'old').personnel, []);
  assert.deepEqual(result.ships.find((ship) => ship.id === 'new').personnel, ['u2']);
  assert.deepEqual(result.remainingCurrentAssignment, { shipId: 'new', shipName: 'KM Baru' });
});

test('resolveExplicitOverride preserves an explicit empty string override', () => {
  assert.equal(
    resolveExplicitOverride({ shipAssigned: '' }, { shipAssigned: 'KM Lama' }, 'shipAssigned', ''),
    '',
  );
});
