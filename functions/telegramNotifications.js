/*
Tujuan: Menormalkan isi notifikasi sistem sebelum dikirim ke Telegram.
Caller: telegramAI.js saat shared-state notifications berubah.
Dependensi: Tidak ada; helper murni agar mudah dites tanpa Firebase.
Main Functions: Mengenali Pending Checkpoint Summary/Summary Shift Wrap Up dan membangun teks Telegram dari data UI-equivalent.
Side Effects: Tidak ada.
*/

const PENDING_CHECKPOINT_SUMMARY_TITLE = 'Pending Checkpoint Summary';
const SHIFT_WRAP_UP_SUMMARY_TITLE = 'Summary Shift Wrap Up';

function normalizeText(value) {
  return String(value || '').trim();
}

function ensureArray(value) {
  return Array.isArray(value) ? value : [];
}

function ensureObject(value) {
  return value && typeof value === 'object' ? value : {};
}

function normalizeRole(value) {
  return normalizeText(value).toUpperCase();
}

function normalizeStatus(value) {
  return normalizeText(value).toLowerCase();
}

function getNotificationShiftKey(notification = {}, state = {}) {
  const directShiftKey = normalizeText(notification.shiftKey);
  if (directShiftKey) return directShiftKey;

  const dedupeKey = normalizeText(notification.dedupeKey);
  const dedupeMatch = dedupeKey.match(/^(?:admin-checkpoint-pending|shift-summary):(.+)$/);
  if (dedupeMatch?.[1]) return dedupeMatch[1];

  return normalizeText(state.activeShiftKey);
}

function countCheckpointSummary(checkpoints = []) {
  return ensureArray(checkpoints).reduce((summary, checkpoint) => {
    const safeCheckpoint = ensureObject(checkpoint);
    const status = normalizeStatus(safeCheckpoint.status);
    const resultType = normalizeStatus(safeCheckpoint.resultType);

    summary.total += 1;
    if (status === 'completed') {
      summary.completed += 1;
      if (resultType === 'aman') summary.aman += 1;
      if (resultType === 'temuan') summary.temuan += 1;
    }
    if (status === 'missed' || resultType === 'missed') summary.missed += 1;
    if (status === 'pending') summary.pending += 1;
    return summary;
  }, {
    total: 0,
    completed: 0,
    aman: 0,
    temuan: 0,
    missed: 0,
    pending: 0,
  });
}

function getShipCheckpointsFromUiState(state = {}, ship = {}) {
  const checkpointsByShip = ensureObject(state.checkpointsByShip);
  const shipId = normalizeText(ship.id);
  const shipName = normalizeText(ship.name);
  return ensureArray(
    checkpointsByShip[shipId]
    || checkpointsByShip[shipName]
    || [],
  );
}

function getShiftStatusRecordFromUiState(state = {}, ship = {}, shiftKey = '') {
  const shipId = normalizeText(ship.id);
  const safeShiftKey = normalizeText(shiftKey);
  if (!shipId || !safeShiftKey) return null;

  const directRecord = ensureObject(state.shiftStatusRecords)[`${shipId}|${safeShiftKey}`];
  if (directRecord) return directRecord;

  return Object.values(ensureObject(state.shiftStatusRecords)).find((record) => (
    normalizeText(record?.shipId) === shipId
    && normalizeText(record?.shiftKey) === safeShiftKey
  )) || null;
}

function hasActivePetugasForShip(state = {}, ship = {}) {
  const shipName = normalizeText(ship.name);
  if (!shipName) return false;

  return ensureArray(state.usersData).some((user) => (
    normalizeText(user?.shipAssigned) === shipName
    && normalizeStatus(user?.status) === 'active'
    && normalizeRole(user?.role) === 'PETUGAS'
  ));
}

function buildPendingCheckpointSummaryFromUiState(notification = {}, state = {}) {
  const shiftKey = getNotificationShiftKey(notification, state);
  const rows = ensureArray(state.shipsData)
    .map((ship) => {
      const safeShip = ensureObject(ship);
      const checkpoints = getShipCheckpointsFromUiState(state, safeShip);
      const summary = countCheckpointSummary(checkpoints);
      const shiftStatusRecord = getShiftStatusRecordFromUiState(state, safeShip, shiftKey);
      const hasOngoingPatrol = hasActivePetugasForShip(state, safeShip)
        || ensureArray(shiftStatusRecord?.items).length > 0
        || summary.completed > 0;

      return {
        shipName: normalizeText(safeShip.name || safeShip.id || 'Kapal'),
        pending: summary.pending,
        hasOngoingPatrol,
      };
    })
    .filter((row) => row.hasOngoingPatrol && row.pending > 0)
    .sort((left, right) => left.shipName.localeCompare(right.shipName));

  if (rows.length === 0) {
    return 'Berdasarkan UI Riwayat ON GOING SmartPatrol, tidak ada checkpoint pending yang tampil.';
  }

  const totalPending = rows.reduce((sum, row) => sum + row.pending, 0);
  return [
    'PENDING CHECKPOINT SUMMARY',
    '',
    'Berdasarkan UI Riwayat ON GOING SmartPatrol:',
    '',
    ...rows.map((row) => `${row.shipName}: ${row.pending} pending`),
    '',
    `Total: ${totalPending} checkpoint pending di ${rows.length} kapal.`,
  ].join('\n');
}

function isHistoryEntryForShift(entry = {}, shiftKey = '') {
  const safeShiftKey = normalizeText(shiftKey);
  if (!safeShiftKey) return false;

  const entryShiftKey = normalizeText(entry.shiftKey);
  if (entryShiftKey === safeShiftKey) return true;

  const dateShiftKey = normalizeText(entry.dateKey) && normalizeText(entry.shiftId)
    ? `${normalizeText(entry.dateKey)}|${normalizeText(entry.shiftId)}`
    : '';
  if (dateShiftKey === safeShiftKey) return true;

  return normalizeText(entry.key).includes(safeShiftKey)
    || normalizeText(entry.id).includes(safeShiftKey);
}

function buildShiftWrapUpSummaryFromUiState(notification = {}, state = {}) {
  const shiftKey = getNotificationShiftKey(notification, state);
  const entries = ensureArray(state.historyEntries)
    .filter((entry) => ensureObject(entry) && !entry.isLive && isHistoryEntryForShift(entry, shiftKey))
    .sort((left, right) => normalizeText(left.ship).localeCompare(normalizeText(right.ship)));

  if (entries.length === 0) {
    return 'Data Summary Shift Wrap Up belum tampil di UI Riwayat SmartPatrol saat notifikasi diproses.';
  }

  const firstEntry = entries[0] || {};
  const shiftLabel = normalizeText(firstEntry.shift || 'Shift').toUpperCase();
  const timeRange = normalizeText(firstEntry.time);
  const header = `SUMMARY LAPORAN ${shiftLabel}${timeRange ? ` (${timeRange})` : ''}`;
  const blocks = entries.map((entry) => {
    const summary = ensureObject(entry.summary);
    return [
      `Kapal: ${normalizeText(entry.ship || entry.shipName || 'Kapal')}`,
      `Aman: ${Number(summary.aman || 0)}`,
      `Temuan: ${Number(summary.temuan || entry.issue || 0)}`,
      `Missed: ${Number(summary.missed || entry.missed || 0)}`,
    ].join('\n');
  });

  return [
    header,
    '',
    ...blocks,
  ].join('\n\n');
}

export function isPendingCheckpointSummaryNotification(notification = {}) {
  return normalizeText(notification.type) === 'checkpoint_pending'
    && normalizeText(notification.title) === PENDING_CHECKPOINT_SUMMARY_TITLE;
}

export function isShiftWrapUpSummaryNotification(notification = {}) {
  return normalizeText(notification.type) === 'shift_history_created'
    && normalizeText(notification.title) === SHIFT_WRAP_UP_SUMMARY_TITLE;
}

export function resolveTelegramNotificationText(notification = {}, state = {}) {
  if (isPendingCheckpointSummaryNotification(notification)) {
    return buildPendingCheckpointSummaryFromUiState(notification, state);
  }

  if (isShiftWrapUpSummaryNotification(notification)) {
    return buildShiftWrapUpSummaryFromUiState(notification, state);
  }

  return normalizeText(notification.message);
}
