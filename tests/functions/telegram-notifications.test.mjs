/*
Tujuan: Menguji format notifikasi sistem yang dikirim ke Telegram agar tidak menampilkan angka pending yang bisa stale.
Caller: Node test runner saat verifikasi Cloud Functions Telegram.
Dependensi: Helper telegramNotifications murni.
Main Functions: Memvalidasi pending checkpoint summary memakai UI SmartPatrol sebagai sumber acuan.
Side Effects: Tidak ada; test berjalan in-memory tanpa Firebase.
*/

import test from 'node:test';
import assert from 'node:assert/strict';
import {
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
  assert.match(message, /MT Alpha: 1 pending/);
  assert.match(message, /MT Beta: 2 pending/);
  assert.match(message, /Total: 3 checkpoint pending di 2 kapal/);
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
    dedupeKey: 'shift-summary:2026-05-16|shift-1-active',
  };
  const uiState = {
    historyEntries: [
      {
        key: 'ship-a|2026-05-16|shift-1-active',
        dateKey: '2026-05-16',
        shiftId: 'shift-1-active',
        shift: 'Shift 1',
        time: '06:00 - 12:00',
        ship: 'MT Alpha',
        summary: { aman: 18, temuan: 1, missed: 0, total: 19 },
      },
      {
        key: 'ship-b|2026-05-16|shift-1-active',
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

test('Telegram other system notifications keep their original message', () => {
  const notification = {
    type: 'registration_pending',
    title: 'Registrasi Menunggu Approval',
    message: 'User baru menunggu approval admin.',
  };

  assert.equal(resolveTelegramNotificationText(notification), notification.message);
});
