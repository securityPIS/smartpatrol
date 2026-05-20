/*
Tujuan: Menguji format/filter notifikasi sistem Telegram agar tidak menampilkan angka stale atau placeholder Riwayat.
Caller: Node test runner saat verifikasi Cloud Functions Telegram.
Dependensi: Helper telegramNotifications murni.
Main Functions: Memvalidasi pending checkpoint dan shift wrap-up summary memakai UI SmartPatrol sebagai sumber acuan.
Side Effects: Tidak ada; test berjalan in-memory tanpa Firebase.
*/

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getForwardableTelegramSystemNotifications,
  isPendingCheckpointSummaryNotification,
  isShiftWrapUpSummaryNotification,
  resolveTelegramNotificationText,
} from '../../functions/telegramNotifications.js';

test('Telegram pending checkpoint summary renders UI-equivalent ON GOING data, not raw scheduler counts', () => {
  const notification = {
    type: 'checkpoint_pending',
    title: 'Pending Checkpoint Summary',
    message: 'Total: 99 checkpoint di 9 kapal.',
    dedupeKey: 'admin-checkpoint-pending:2026-05-16|shift-2-active',
  };
  const uiState = {
    activeShiftKey: '2026-05-16|shift-2-active',
    shipsData: [
      { id: 'ship-a', name: 'MT Alpha' },
      { id: 'ship-b', name: 'MT Beta' },
    ],
    usersData: [
      { id: 'u1', name: 'Petugas Alpha', role: 'PETUGAS', status: 'active', shipAssigned: 'MT Alpha' },
      { id: 'u2', name: 'Petugas Beta', role: 'PETUGAS', status: 'active', shipAssigned: 'MT Beta' },
    ],
    checkpointsByShip: {
      'ship-a': [
        { id: 'a1', status: 'pending' },
        { id: 'a2', status: 'completed', resultType: 'aman' },
      ],
      'ship-b': [
        { id: 'b1', status: 'pending' },
        { id: 'b2', status: 'pending' },
      ],
    },
  };
  const sameUiDifferentRawMessage = {
    ...notification,
    message: 'Total: 1 checkpoint di 1 kapal.',
  };
  const message = resolveTelegramNotificationText(notification, uiState);

  assert.equal(isPendingCheckpointSummaryNotification(notification), true);
  assert.match(message, /Sebelum Shift 2 \(12:00 - 18:00\) berakhir, masih ada checkpoint pending:/);
  assert.match(message, /MT Alpha: 1 belum dipatroli/);
  assert.match(message, /MT Beta: 2 belum dipatroli/);
  assert.match(message, /Total: 3 checkpoint di 2 kapal/);
  assert.doesNotMatch(message, /99 checkpoint/);
  assert.equal(
    resolveTelegramNotificationText(notification, uiState),
    resolveTelegramNotificationText(sameUiDifferentRawMessage, uiState),
    'perubahan angka mentah scheduler tidak boleh mengubah konten Telegram jika UI state sama',
  );
});

test('Telegram shift wrap-up summary renders UI history data, not raw backend recap', () => {
  const notification = {
    type: 'shift_history_created',
    title: 'Summary Shift Wrap Up',
    message: 'Aman: 99 | Temuan: 99 | Missed: 99',
    dedupeKey: 'shift-summary:2026-05-16-shift-1-active',
  };
  const uiState = {
    historyEntries: [
      {
        key: 'history-ship-a|2026-05-16|shift-1-active',
        dateKey: '2026-05-16',
        shiftId: 'shift-1-active',
        shift: 'Shift 1',
        time: '06:00 - 12:00',
        ship: 'MT Alpha',
        summary: { aman: 18, temuan: 1, missed: 0, total: 19 },
      },
      {
        key: 'history-ship-b|2026-05-16|shift-1-active',
        dateKey: '2026-05-16',
        shiftId: 'shift-1-active',
        shift: 'Shift 1',
        time: '06:00 - 12:00',
        ship: 'MT Beta',
        summary: { aman: 14, temuan: 2, missed: 3, total: 19 },
      },
    ],
  };
  const sameUiDifferentRawMessage = {
    ...notification,
    message: 'Aman: 1 | Temuan: 1 | Missed: 1',
  };
  const message = resolveTelegramNotificationText(notification, uiState);

  assert.equal(isShiftWrapUpSummaryNotification(notification), true);
  assert.match(message, /SUMMARY LAPORAN SHIFT 1 \(06:00 - 12:00\)/);
  assert.match(message, /Kapal: MT Alpha/);
  assert.match(message, /Aman: 18/);
  assert.match(message, /Kapal: MT Beta/);
  assert.match(message, /Missed: 3/);
  assert.doesNotMatch(message, /99/);
  assert.equal(
    resolveTelegramNotificationText(notification, uiState),
    resolveTelegramNotificationText(sameUiDifferentRawMessage, uiState),
    'perubahan angka rekap mentah tidak boleh mengubah konten Telegram jika UI history sama',
  );
});

test('Telegram shift wrap-up summary is not forwarded while UI history is not ready', () => {
  const notification = {
    id: 'notif-wrap-fallback',
    type: 'shift_history_created',
    title: 'Summary Shift Wrap Up',
    message: 'Belum ada data riwayat shift tersimpan untuk periode ini.',
    dedupeKey: 'shift-summary:2026-05-16|shift-2-active',
    shiftKey: '2026-05-16|shift-2-active',
  };

  assert.deepEqual(
    getForwardableTelegramSystemNotifications({
      beforeNotifications: [],
      afterNotifications: [notification],
      beforeState: {},
      afterState: { historyEntries: [] },
    }),
    [],
    'Telegram tidak boleh mengirim placeholder saat Riwayat UI belum siap',
  );
});

test('Telegram shift wrap-up summary forwards only one item per shift when duplicate notifications exist', () => {
  const firstNotification = {
    id: 'notif-wrap-a',
    type: 'shift_history_created',
    title: 'Summary Shift Wrap Up',
    message: 'Aman: 1 | Temuan: 0 | Missed: 0',
    shiftKey: '2026-05-16|shift-2-active',
  };
  const duplicateNotification = {
    ...firstNotification,
    id: 'notif-wrap-b',
  };
  const afterState = {
    historyEntries: [
      {
        key: 'history-ship-a|2026-05-16|shift-2-active',
        dateKey: '2026-05-16',
        shiftId: 'shift-2-active',
        shift: 'Shift 2',
        time: '12:00 - 18:00',
        ship: 'MT Alpha',
        summary: { aman: 1, temuan: 0, missed: 0, total: 1 },
      },
    ],
  };

  assert.deepEqual(
    getForwardableTelegramSystemNotifications({
      beforeNotifications: [],
      afterNotifications: [firstNotification, duplicateNotification],
      beforeState: {},
      afterState,
    }).map((notification) => notification.id),
    ['notif-wrap-a'],
    'notifikasi wrap-up legacy untuk shift yang sama hanya boleh terkirim sekali',
  );
});

test('Telegram pending checkpoint summary is not resent when report submit changes UI pending data', () => {
  const existingNotification = {
    id: 'notif-pending-shift-2',
    type: 'checkpoint_pending',
    title: 'Pending Checkpoint Summary',
    message: 'Total: 3 checkpoint di 2 kapal.',
    dedupeKey: 'admin-checkpoint-pending:2026-05-16|shift-2-active',
    createdAt: '2026-05-16T10:00:00.000Z',
  };
  const beforeState = {
    activeShiftKey: '2026-05-16|shift-2-active',
    shipsData: [{ id: 'ship-a', name: 'MT Alpha' }],
    usersData: [
      { id: 'u1', role: 'PETUGAS', status: 'active', shipAssigned: 'MT Alpha' },
    ],
    checkpointsByShip: {
      'ship-a': [
        { id: 'a1', status: 'pending' },
        { id: 'a2', status: 'pending' },
      ],
    },
  };
  const afterState = {
    ...beforeState,
    checkpointsByShip: {
      'ship-a': [
        { id: 'a1', status: 'completed', resultType: 'aman' },
        { id: 'a2', status: 'pending' },
      ],
    },
  };

  const forwardable = getForwardableTelegramSystemNotifications({
    beforeNotifications: [existingNotification],
    afterNotifications: [{
      ...existingNotification,
      message: 'Total: 1 checkpoint di 1 kapal.',
      createdAt: '2026-05-16T10:05:00.000Z',
    }],
    beforeState,
    afterState,
  });

  assert.deepEqual(
    forwardable,
    [],
    'submit laporan boleh mengubah angka UI, tetapi Pending Checkpoint Summary lama tidak boleh dikirim ulang',
  );
});

test('Telegram pending checkpoint summary only forwards a new item near one hour before shift end', () => {
  const onWindowNotification = {
    id: 'notif-on-window',
    type: 'checkpoint_pending',
    title: 'Pending Checkpoint Summary',
    message: 'Total: 3 checkpoint di 2 kapal.',
    dedupeKey: 'admin-checkpoint-pending:2026-05-16|shift-2-active',
    createdAt: '2026-05-16T10:00:00.000Z',
  };
  const atShiftChangeNotification = {
    ...onWindowNotification,
    id: 'notif-at-shift-change',
    createdAt: '2026-05-16T11:00:00.000Z',
  };
  const afterState = {
    activeShiftKey: '2026-05-16|shift-2-active',
    shipsData: [{ id: 'ship-a', name: 'MT Alpha' }],
    usersData: [
      { id: 'u1', role: 'PETUGAS', status: 'active', shipAssigned: 'MT Alpha' },
    ],
    checkpointsByShip: {
      'ship-a': [
        { id: 'a1', status: 'pending' },
        { id: 'a2', status: 'pending' },
      ],
    },
  };

  assert.deepEqual(
    getForwardableTelegramSystemNotifications({
      beforeNotifications: [],
      afterNotifications: [onWindowNotification],
      beforeState: {},
      afterState,
      dispatchedAt: '2026-05-16T10:00:30.000Z',
    }).map((notification) => notification.id),
    ['notif-on-window'],
  );
  assert.deepEqual(
    getForwardableTelegramSystemNotifications({
      beforeNotifications: [],
      afterNotifications: [atShiftChangeNotification],
      beforeState: {},
      afterState,
      dispatchedAt: '2026-05-16T11:00:00.000Z',
    }),
    [],
    'summary baru di jam pergantian shift tidak boleh diteruskan ke Telegram',
  );
  assert.deepEqual(
    getForwardableTelegramSystemNotifications({
      beforeNotifications: [],
      afterNotifications: [{
        ...onWindowNotification,
        id: 'notif-stale-resync',
      }],
      beforeState: {},
      afterState,
      dispatchedAt: '2026-05-16T11:00:00.000Z',
    }),
    [],
    'summary lama yang tersinkron ulang saat pergantian shift tidak boleh dikirim ulang',
  );
});

test('Telegram other system notifications keep their original message', () => {
  const notification = {
    type: 'registration_pending',
    title: 'Registrasi Menunggu Approval',
    message: 'User baru menunggu approval admin.',
  };

  assert.equal(resolveTelegramNotificationText(notification), notification.message);
});
