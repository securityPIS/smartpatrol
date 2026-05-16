/*
Tujuan: Menormalkan isi notifikasi sistem sebelum dikirim ke Telegram.
Caller: telegramAI.js saat shared-state notifications berubah.
Dependensi: Tidak ada; helper murni agar mudah dites tanpa Firebase.
Main Functions: Mengenali Pending Checkpoint Summary dan menentukan teks Telegram yang aman.
Side Effects: Tidak ada.
*/

const PENDING_CHECKPOINT_SUMMARY_TITLE = 'Pending Checkpoint Summary';

function normalizeText(value) {
  return String(value || '').trim();
}

export function isPendingCheckpointSummaryNotification(notification = {}) {
  return normalizeText(notification.type) === 'checkpoint_pending'
    && normalizeText(notification.title) === PENDING_CHECKPOINT_SUMMARY_TITLE;
}

export function resolveTelegramNotificationText(notification = {}) {
  if (isPendingCheckpointSummaryNotification(notification)) {
    return [
      'Masih ada checkpoint yang perlu ditinjau sebelum shift berakhir.',
      '',
      'Untuk angka dan daftar titik terbaru, buka UI SmartPatrol karena data live di aplikasi adalah sumber acuan.',
    ].join('\n');
  }

  return normalizeText(notification.message);
}
