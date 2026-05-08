/*
Tujuan: Menghitung roster dan jumlah pending checkpoint per kapal/shift untuk Cloud Functions.
Caller: Scheduler notifikasi operasional, fallback arsip shift, cleanup shared-state, dan test helper.
Dependensi: Struktur shared-state SmartPatrol dan dokumen domain patrolReports.
Main Functions: buildCheckpointRosterForShipShift, countPendingCheckpointsInRoster, getServerCheckpointDefinitionsForShip.
Side Effects: Tidak ada; modul ini murni membaca input object dan mengembalikan hasil kalkulasi.
*/

export const SERVER_DEFAULT_CHECKPOINT_NAMES = Object.freeze([
  'Kondisi personel',
  'Cuaca',
  'Haluan',
  'Buritan',
  'Deck',
  'Sekoci',
  'Anjungan',
  'Radio Room',
  'Alat Navigasi',
  'Solar Panel',
  'Ruang Mesin',
  'Ruang Pompa',
  'Air Bersih',
  'Gudang Logistik',
  'Gudang Spare Part',
  'Alat Dapur',
  'Fasilitas Pendukung',
  'Obat-Obatan',
  'Tangga monyet',
]);

function ensureArray(value) {
  return Array.isArray(value) ? value : [];
}

function ensureObject(value) {
  return value && typeof value === 'object' ? value : {};
}

function sanitizeString(value, maxLength = 160) {
  if (typeof value !== 'string') return '';
  return value
    .replace(/[\u0000-\u001f\u007f<>]/g, ' ')
    .trim()
    .slice(0, maxLength);
}

function sanitizeStorageSegment(value, fallback = '') {
  return sanitizeString(String(value || ''), 120)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/(^-|-$)/g, '') || fallback;
}

export function normalizeCheckpointNameKey(name) {
  return sanitizeString(name || '', 120).trim().toLowerCase();
}

export function createShipCheckpointId(ship, checkpointName, index) {
  const slug = sanitizeString(checkpointName || '', 120)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '') || `checkpoint-${index + 1}`;
  return `${sanitizeString(ship?.id || ship?.name || 'ship', 120)}::${slug}::${index + 1}`;
}

export function getServerCheckpointDefinitionsForShip(ship = {}) {
  const definitionsByName = new Map();
  const pushDefinition = (checkpoint, isDefault = false) => {
    const safeName = sanitizeString(checkpoint?.name || checkpoint || '', 80);
    const nameKey = normalizeCheckpointNameKey(safeName);
    if (!safeName || !nameKey || definitionsByName.has(nameKey)) return;
    definitionsByName.set(nameKey, {
      name: safeName,
      desc: sanitizeString(checkpoint?.desc || '', 140),
      isDefault: Boolean(checkpoint?.isDefault || isDefault),
    });
  };

  SERVER_DEFAULT_CHECKPOINT_NAMES.forEach((name) => pushDefinition({ name }, true));
  ensureArray(ship?.customCheckpoints).forEach((checkpoint) => pushDefinition(checkpoint, false));

  return Array.from(definitionsByName.values());
}

export function getCheckpointCollectionForShip(state = {}, ship = {}) {
  const checkpointsByShip = ensureObject(state.checkpointsByShip);
  const candidates = [
    ship.id,
    ship.name,
    sanitizeStorageSegment(ship.name || '', ''),
  ].map((item) => sanitizeString(item || '', 120)).filter(Boolean);

  for (const candidate of candidates) {
    if (Array.isArray(checkpointsByShip[candidate])) return checkpointsByShip[candidate];
  }

  return [];
}

function createBaseCheckpointRecord(ship, checkpoint, index) {
  return {
    id: createShipCheckpointId(ship, checkpoint?.name, index),
    name: sanitizeString(checkpoint?.name || '', 80) || `Checkpoint ${index + 1}`,
    desc: sanitizeString(checkpoint?.desc || '', 140),
    status: 'pending',
    resultType: null,
    updatedAt: null,
    shipId: ship?.id || null,
    shipName: ship?.name || '',
    isTemporaryShiftNode: false,
  };
}

function getCheckpointScopedShiftKey(checkpoint = {}) {
  return sanitizeString(checkpoint?.shiftKey || checkpoint?.createdInShiftKey || '', 160) || null;
}

function getCheckpointTimestampMs(checkpoint = {}) {
  const numericCandidates = [
    checkpoint.occurredAtTrustedMs,
  ];

  for (const value of numericCandidates) {
    const numericValue = Number(value);
    if (Number.isFinite(numericValue) && numericValue > 0) return numericValue;
  }

  const stringCandidates = [
    checkpoint.occurredAtTrustedIso,
    checkpoint.completedAt,
    checkpoint.updatedAt,
    checkpoint.createdAt,
  ];

  for (const value of stringCandidates) {
    if (typeof value !== 'string' || !value.trim()) continue;
    const timestamp = new Date(value).getTime();
    if (Number.isFinite(timestamp) && timestamp > 0) return timestamp;
  }

  return null;
}

function isTimestampInShift(checkpoint = {}, shiftMeta = {}) {
  const timestamp = getCheckpointTimestampMs(checkpoint);
  const startAt = shiftMeta?.startAt instanceof Date ? shiftMeta.startAt.getTime() : null;
  const endAt = shiftMeta?.endAt instanceof Date ? shiftMeta.endAt.getTime() : null;
  if (!Number.isFinite(timestamp) || !Number.isFinite(startAt) || !Number.isFinite(endAt)) return false;
  return timestamp >= startAt && timestamp < endAt;
}

export function isCheckpointScopedToShift(checkpoint = {}, shiftMeta = {}, options = {}) {
  const { allowTimestampFallback = true, reportsAreShiftScoped = false } = options;
  if (!shiftMeta?.key) return true;
  if (reportsAreShiftScoped) return true;

  const scopedShiftKey = getCheckpointScopedShiftKey(checkpoint);
  if (scopedShiftKey) return scopedShiftKey === shiftMeta.key;

  return allowTimestampFallback && isTimestampInShift(checkpoint, shiftMeta);
}

function normalizeTemporaryCheckpointForShip(checkpoint = {}, ship = {}, shiftMeta = {}) {
  if (!checkpoint?.isTemporaryShiftNode) return null;
  if (!isCheckpointScopedToShift(checkpoint, shiftMeta)) return null;

  const id = sanitizeString(String(checkpoint.id || checkpoint.checkpointId || ''), 180);
  const name = sanitizeString(checkpoint.name || checkpoint.checkpointName || '', 80);
  if (!id || !name) return null;

  return {
    ...checkpoint,
    id,
    checkpointId: sanitizeString(checkpoint.checkpointId || id, 180) || id,
    name,
    checkpointName: sanitizeString(checkpoint.checkpointName || name, 100) || name,
    desc: sanitizeString(checkpoint.desc || 'Titik tambahan sementara untuk shift berjalan.', 140),
    status: sanitizeString(checkpoint.status || 'pending', 20) || 'pending',
    resultType: sanitizeString(checkpoint.resultType || '', 20) || null,
    shipId: ship?.id || checkpoint.shipId || null,
    shipName: ship?.name || checkpoint.shipName || '',
    shiftKey: getCheckpointScopedShiftKey(checkpoint) || shiftMeta?.key || null,
    createdInShiftKey: sanitizeString(checkpoint.createdInShiftKey || '', 160) || shiftMeta?.key || null,
    isTemporaryShiftNode: true,
  };
}

function getCheckpointMatchKeys(checkpoint = {}) {
  return {
    id: sanitizeString(String(checkpoint.checkpointId || checkpoint.id || checkpoint.firestoreId || ''), 200),
    nameKey: normalizeCheckpointNameKey(checkpoint.name || checkpoint.checkpointName || ''),
  };
}

function isCheckpointResolvedForPending(checkpoint = {}) {
  const status = sanitizeString(checkpoint.status || '', 30).toLowerCase();
  const resultType = sanitizeString(checkpoint.resultType || '', 30).toLowerCase();
  return status === 'completed'
    || status === 'missed'
    || Boolean(resultType && resultType !== 'pending');
}

function mergeRosterRecord(baseCheckpoint, record, shiftMeta) {
  return {
    ...baseCheckpoint,
    ...record,
    id: baseCheckpoint.id,
    checkpointId: baseCheckpoint.checkpointId || baseCheckpoint.id,
    name: baseCheckpoint.name,
    checkpointName: baseCheckpoint.name,
    desc: baseCheckpoint.desc || record.desc || '',
    shipId: baseCheckpoint.shipId || record.shipId || null,
    shipName: baseCheckpoint.shipName || record.shipName || '',
    shiftKey: record.shiftKey || shiftMeta?.key || baseCheckpoint.shiftKey || null,
  };
}

function applyCheckpointRecordsToRoster(roster, records, shiftMeta, options = {}) {
  const { reportsAreShiftScoped = false, ship = {} } = options;
  const nextRoster = [...roster];
  const findIndexForRecord = (record) => {
    const { id, nameKey } = getCheckpointMatchKeys(record);
    return nextRoster.findIndex((checkpoint) => (
      (id && String(checkpoint.id) === String(id))
      || (id && String(checkpoint.checkpointId || '') === String(id))
      || (nameKey && normalizeCheckpointNameKey(checkpoint.name) === nameKey)
    ));
  };

  ensureArray(records).forEach((record) => {
    if (!record || typeof record !== 'object') return;
    if (!isCheckpointScopedToShift(record, shiftMeta, { reportsAreShiftScoped })) return;

    const temporaryCheckpoint = normalizeTemporaryCheckpointForShip(record, ship, shiftMeta);
    if (temporaryCheckpoint) {
      const temporaryIndex = findIndexForRecord(temporaryCheckpoint);
      if (temporaryIndex >= 0) {
        nextRoster[temporaryIndex] = {
          ...nextRoster[temporaryIndex],
          ...temporaryCheckpoint,
          id: nextRoster[temporaryIndex].id,
          name: nextRoster[temporaryIndex].name,
        };
      } else {
        nextRoster.push(temporaryCheckpoint);
      }
      return;
    }

    const index = findIndexForRecord(record);
    if (index < 0) return;
    nextRoster[index] = mergeRosterRecord(nextRoster[index], record, shiftMeta);
  });

  return nextRoster;
}

export function buildCheckpointRosterForShipShift({
  state = {},
  ship = {},
  shiftMeta = {},
  reportDocuments = [],
} = {}) {
  const definitions = getServerCheckpointDefinitionsForShip(ship);
  const baseRoster = definitions.map((definition, index) => (
    createBaseCheckpointRecord(ship, definition, index)
  ));
  const rawCheckpoints = getCheckpointCollectionForShip(state, ship);
  const withSharedState = applyCheckpointRecordsToRoster(baseRoster, rawCheckpoints, shiftMeta, { ship });
  return applyCheckpointRecordsToRoster(withSharedState, reportDocuments, shiftMeta, {
    reportsAreShiftScoped: true,
    ship,
  });
}

export function countPendingCheckpointsInRoster(checkpoints = []) {
  return ensureArray(checkpoints).reduce((pendingCount, checkpoint) => (
    isCheckpointResolvedForPending(checkpoint) ? pendingCount : pendingCount + 1
  ), 0);
}
