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
  resolveTelegramNotificationText,
} from '../../functions/telegramNotifications.js';

test('Telegram pending checkpoint summary directs users to SmartPatrol UI instead of raw scheduler counts', () => {
  const before = {
    type: 'checkpoint_pending',
    title: 'Pending Checkpoint Summary',
    message: 'Total: 23 checkpoint di 3 kapal.',
  };
  const after = {
    ...before,
    message: 'Total: 11 checkpoint di 2 kapal.',
  };

  assert.equal(isPendingCheckpointSummaryNotification(after), true);
  assert.match(resolveTelegramNotificationText(after), /UI SmartPatrol/);
  assert.doesNotMatch(resolveTelegramNotificationText(after), /11 checkpoint/);
  assert.equal(
    resolveTelegramNotificationText(before),
    resolveTelegramNotificationText(after),
    'perubahan angka mentah tidak boleh memicu konten Telegram berbeda',
  );
});

test('Telegram non-pending system notifications keep their original message', () => {
  const notification = {
    type: 'shift_history_created',
    title: 'Summary Shift Wrap Up',
    message: 'Aman: 18 | Temuan: 1 | Missed: 0',
  };

  assert.equal(resolveTelegramNotificationText(notification), notification.message);
});
