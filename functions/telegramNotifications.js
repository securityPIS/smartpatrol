/*
Tujuan: Menormalkan isi notifikasi sistem sebelum dikirim ke Telegram.
Caller: telegramAI.js saat shared-state notifications berubah.
Dependensi: Tidak ada; helper murni agar mudah dites tanpa Firebase.
Main Functions: Mengenali Pending Checkpoint Summary/Summary Shift Wrap Up dan menentukan teks Telegram yang aman.
Side Effects: Tidak ada.
*/

const PENDING_CHECKPOINT_SUMMARY_TITLE = 'Pending Checkpoint Summary';
const SHIFT_WRAP_UP_SUMMARY_TITLE = 'Summary Shift Wrap Up';

function normalizeText(value) {
  return String(value || '').trim();
}

export function isPendingCheckpointSummaryNotification(notification = {}) {
  return normalizeText(notification.type) === 'checkpoint_pending'
    && normalizeText(notification.title) === PENDING_CHECKPOINT_SUMMARY_TITLE;
}

export function isShiftWrapUpSummaryNotification(notification = {}) {
  return normalizeText(notification.type) === 'shift_history_created'
    && normalizeText(notification.title) === SHIFT_WRAP_UP_SUMMARY_TITLE;
}

export function resolveTelegramNotificationText(notification = {}) {
  if (isPendingCheckpointSummaryNotification(notification)) {
    return [
      'Masih ada checkpoint yang perlu ditinjau sebelum shift berakhir.',
      '',
      'Untuk angka dan daftar titik terbaru, buka UI SmartPatrol karena data live di aplikasi adalah sumber acuan.',
    ].join('\n');
  }

  if (isShiftWrapUpSummaryNotification(notification)) {
    return [
      'Summary shift sudah tersedia untuk ditinjau.',
      '',
      'Untuk angka Aman, Temuan, Missed, dan detail checkpoint terbaru, buka UI SmartPatrol pada menu Riwayat karena tampilan aplikasi adalah sumber acuan.',
    ].join('\n');
  }

  return normalizeText(notification.message);
}
