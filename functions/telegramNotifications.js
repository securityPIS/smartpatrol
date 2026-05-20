/*
Tujuan: Menormalkan isi notifikasi sistem sebelum dikirim ke Telegram.
Caller: telegramAI.js saat shared-state notifications berubah.
Dependensi: Tidak ada; helper murni agar mudah dites tanpa Firebase.
Main Functions: Mengenali Pending Checkpoint Summary/Summary Shift Wrap Up, memfilter relay Telegram, dan membangun teks dari data UI-equivalent.
Side Effects: Tidak ada.
*/

const PENDING_CHECKPOINT_SUMMARY_TITLE = 'Pending Checkpoint Summary';
const SHIFT_WRAP_UP_SUMMARY_TITLE = 'Summary Shift Wrap Up';
const SHIFT_WRAP_UP_HISTORY_PENDING_MESSAGE = 'Data Summary Shift Wrap Up belum tampil di UI Riwayat SmartPatrol saat notifikasi diproses.';
const APP_TIME_ZONE_OFFSET_HOURS = 7;
const PENDING_SUMMARY_MIN_MINUTES_BEFORE_SHIFT_END = 55;
const PENDING_SUMMARY_MAX_MINUTES_BEFORE_SHIFT_END = 60;
const SHIFT_DEFINITIONS = Object.freeze({
  'shift-1-active': { label: 'Shift 1', timeRange: '06:00 - 12:00', startHour: 6, startMinute: 0, endHour: 12, endMinute: 0 },
  'shift-2-active': { label: 'Shift 2', timeRange: '12:00 - 18:00', startHour: 12, startMinute: 0, endHour: 18, endMinute: 0 },
  'shift-3-active': { label: 'Shift 3', timeRange: '18:00 - 06:00', startHour: 18, startMinute: 0, endHour: 6, endMinute: 0, crossesMidnight: true },
  'shift-pagi': { label: 'Shift Pagi', timeRange: '06:00 - 10:00', startHour: 6, startMinute: 0, endHour: 10, endMinute: 0 },
  'shift-siang': { label: 'Shift Siang', timeRange: '10:00 - 14:00', startHour: 10, startMinute: 0, endHour: 14, endMinute: 0 },
  'shift-sore': { label: 'Shift Sore', timeRange: '14:00 - 18:00', startHour: 14, startMinute: 0, endHour: 18, endMinute: 0 },
  'shift-malam': { label: 'Shift Malam', timeRange: '18:00 - 06:00', startHour: 18, startMinute: 0, endHour: 6, endMinute: 0, crossesMidnight: true },
  'shift-1': { label: 'Shift 1', timeRange: '06:00 - 12:00', startHour: 6, startMinute: 0, endHour: 12, endMinute: 0 },
  'shift-2': { label: 'Shift 2', timeRange: '12:00 - 18:00', startHour: 12, startMinute: 0, endHour: 18, endMinute: 0 },
  'shift-3': { label: 'Shift 3', timeRange: '18:00 - 00:00', startHour: 18, startMinute: 0, endHour: 0, endMinute: 0, crossesMidnight: true },
  'shift-4': { label: 'Shift 4', timeRange: '00:00 - 06:00', startHour: 0, startMinute: 0, endHour: 6, endMinute: 0 },
});

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

function extractCanonicalShiftKey(value) {
  const text = normalizeText(value);
  const match = text.match(/(\d{4}-\d{2}-\d{2})(?:\||-)(shift-[a-z0-9-]+)/i);
  if (!match) return '';
  return `${match[1]}|${match[2]}`;
}

function getShiftIdFromKey(shiftKey = '') {
  return extractCanonicalShiftKey(shiftKey).split('|')[1] || '';
}

function getShiftDefinitionFromKey(shiftKey = '') {
  const shiftId = getShiftIdFromKey(shiftKey);
  return SHIFT_DEFINITIONS[shiftId] || {
    label: normalizeText(shiftId || 'Shift'),
    timeRange: '',
  };
}

function getNotificationShiftKey(notification = {}, state = {}) {
  const directShiftKey = extractCanonicalShiftKey(notification.shiftKey);
  if (directShiftKey) return directShiftKey;

  const dedupeKey = normalizeText(notification.dedupeKey);
  const dedupeMatch = dedupeKey.match(/^(?:admin-checkpoint-pending|shift-summary):(.+)$/);
  const dedupeShiftKey = extractCanonicalShiftKey(dedupeMatch?.[1]);
  if (dedupeShiftKey) return dedupeShiftKey;

  return extractCanonicalShiftKey(state.activeShiftKey);
}

function addDaysToDateKey(dateKey = '', days = 0) {
  const [year, month, day] = normalizeText(dateKey).split('-').map((part) => Number(part));
  const date = new Date(Date.UTC(year || 1970, (month || 1) - 1, day || 1, 12, 0, 0));
  date.setUTCDate(date.getUTCDate() + days);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

function createJakartaWallClockDate(dateKey = '', hour = 0, minute = 0) {
  const [year, month, day] = normalizeText(dateKey).split('-').map((part) => Number(part));
  return new Date(Date.UTC(
    year || 1970,
    (month || 1) - 1,
    day || 1,
    Number(hour || 0) - APP_TIME_ZONE_OFFSET_HOURS,
    Number(minute || 0),
    0,
  ));
}

function getShiftEndDateFromKey(shiftKey = '') {
  const canonicalShiftKey = extractCanonicalShiftKey(shiftKey);
  const [dateKey, shiftId] = canonicalShiftKey.split('|');
  const shiftDefinition = SHIFT_DEFINITIONS[shiftId];
  if (!dateKey || !shiftDefinition) return null;

  const startMinutes = Number(shiftDefinition.startHour || 0) * 60 + Number(shiftDefinition.startMinute || 0);
  const endMinutes = Number(shiftDefinition.endHour || 0) * 60 + Number(shiftDefinition.endMinute || 0);
  const endDateKey = shiftDefinition.crossesMidnight || endMinutes <= startMinutes
    ? addDaysToDateKey(dateKey, 1)
    : dateKey;
  return createJakartaWallClockDate(endDateKey, shiftDefinition.endHour, shiftDefinition.endMinute);
}

function getTimestampMs(value) {
  const timestamp = Date.parse(normalizeText(value));
  return Number.isFinite(timestamp) ? timestamp : null;
}

function getPendingSummaryDispatchTimestampMs(notification = {}, options = {}) {
  return getTimestampMs(options.dispatchedAt)
    ?? getTimestampMs(notification.createdAt);
}

export function isPendingCheckpointSummaryDispatchWindow(notification = {}, state = {}, options = {}) {
  const shiftEndAt = getShiftEndDateFromKey(getNotificationShiftKey(notification, state));
  const dispatchTimestampMs = getPendingSummaryDispatchTimestampMs(notification, options);
  if (!(shiftEndAt instanceof Date) || !Number.isFinite(shiftEndAt.getTime()) || !Number.isFinite(dispatchTimestampMs)) {
    return false;
  }

  const minutesBeforeEnd = Math.floor((shiftEndAt.getTime() - dispatchTimestampMs) / 60000);
  return minutesBeforeEnd >= PENDING_SUMMARY_MIN_MINUTES_BEFORE_SHIFT_END
    && minutesBeforeEnd <= PENDING_SUMMARY_MAX_MINUTES_BEFORE_SHIFT_END;
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
  const shiftDefinition = getShiftDefinitionFromKey(shiftKey);
  const shiftLabel = normalizeText(shiftDefinition.label || 'Shift');
  const timeRange = normalizeText(shiftDefinition.timeRange);
  return [
    `Sebelum ${shiftLabel}${timeRange ? ` (${timeRange})` : ''} berakhir, masih ada checkpoint pending:`,
    '',
    ...rows.map((row) => `🚢 ${row.shipName}: ${row.pending} belum dipatroli`),
    '',
    `Total: ${totalPending} checkpoint di ${rows.length} kapal.`,
  ].join('\n');
}

function isHistoryEntryForShift(entry = {}, shiftKey = '') {
  const safeShiftKey = extractCanonicalShiftKey(shiftKey);
  if (!safeShiftKey) return false;

  const entryShiftKey = extractCanonicalShiftKey(entry.shiftKey);
  if (entryShiftKey === safeShiftKey) return true;

  const dateShiftKey = normalizeText(entry.dateKey) && normalizeText(entry.shiftId)
    ? `${normalizeText(entry.dateKey)}|${normalizeText(entry.shiftId)}`
    : '';
  if (dateShiftKey === safeShiftKey) return true;

  return extractCanonicalShiftKey(entry.key) === safeShiftKey
    || extractCanonicalShiftKey(entry.id) === safeShiftKey;
}

function getShiftWrapUpHistoryEntriesFromUiState(notification = {}, state = {}) {
  const shiftKey = getNotificationShiftKey(notification, state);
  return ensureArray(state.historyEntries)
    .filter((entry) => ensureObject(entry) && !entry.isLive && isHistoryEntryForShift(entry, shiftKey))
    .sort((left, right) => normalizeText(left.ship).localeCompare(normalizeText(right.ship)));
}

function buildShiftWrapUpSummaryFromUiState(notification = {}, state = {}) {
  const entries = getShiftWrapUpHistoryEntriesFromUiState(notification, state);
  if (entries.length === 0) {
    return SHIFT_WRAP_UP_HISTORY_PENDING_MESSAGE;
  }

  const firstEntry = entries[0] || {};
  const shiftLabel = normalizeText(firstEntry.shift || 'Shift').toUpperCase();
  const timeRange = normalizeText(firstEntry.time);
  const header = `📊 SUMMARY LAPORAN ${shiftLabel}${timeRange ? ` (${timeRange})` : ''} 📊`;
  const blocks = entries.map((entry) => {
    const summary = ensureObject(entry.summary);
    return [
      `🚢 Kapal: ${normalizeText(entry.ship || entry.shipName || 'Kapal')}`,
      `✅ Aman: ${Number(summary.aman || 0)}`,
      `⚠️ Temuan: ${Number(summary.temuan || entry.issue || 0)}`,
      `❌ Missed: ${Number(summary.missed || entry.missed || 0)}`,
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

function getNotificationMatchKey(notification = {}) {
  if (isShiftWrapUpSummaryNotification(notification)) {
    const shiftKey = getNotificationShiftKey(notification);
    if (shiftKey) return `shift-wrap-up:${shiftKey}`;
  }
  return normalizeText(notification.dedupeKey) || normalizeText(notification.id);
}

function findMatchingNotification(notifications = [], notification = {}) {
  const matchKey = getNotificationMatchKey(notification);
  if (!matchKey) return null;
  return ensureArray(notifications).find((candidate) => getNotificationMatchKey(candidate) === matchKey) || null;
}

export function shouldForwardTelegramSystemNotification({
  beforeNotification = null,
  afterNotification = {},
  beforeState = {},
  afterState = {},
  dispatchedAt = '',
} = {}) {
  if (!afterNotification || typeof afterNotification !== 'object') return false;

  if (isPendingCheckpointSummaryNotification(afterNotification)) {
    if (beforeNotification) return false;
    return isPendingCheckpointSummaryDispatchWindow(afterNotification, afterState, { dispatchedAt });
  }

  if (isShiftWrapUpSummaryNotification(afterNotification)) {
    if (getShiftWrapUpHistoryEntriesFromUiState(afterNotification, afterState).length === 0) {
      return false;
    }
  }

  if (!beforeNotification) return true;
  return resolveTelegramNotificationText(beforeNotification, beforeState)
    !== resolveTelegramNotificationText(afterNotification, afterState);
}

export function getForwardableTelegramSystemNotifications({
  beforeNotifications = [],
  afterNotifications = [],
  beforeState = {},
  afterState = {},
  dispatchedAt = '',
} = {}) {
  const forwardedMatchKeys = new Set();
  return ensureArray(afterNotifications).filter((afterNotification) => {
    const matchKey = getNotificationMatchKey(afterNotification);
    if (matchKey && forwardedMatchKeys.has(matchKey)) return false;

    const beforeNotification = findMatchingNotification(beforeNotifications, afterNotification);
    const shouldForward = shouldForwardTelegramSystemNotification({
      beforeNotification,
      afterNotification,
      beforeState,
      afterState,
      dispatchedAt,
    });
    if (shouldForward && matchKey) forwardedMatchKeys.add(matchKey);
    return shouldForward;
  });
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
