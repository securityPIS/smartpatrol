const TRUSTED_TIME_STORAGE_KEY = 'smartpatrol.trusted-time.v1';
const SERVER_TIME_ROUTE = '/api/server-time';
const TRUSTED_TIME_FUNCTION_REGION = 'asia-southeast2';
const SERVER_TIME_SYNC_INTERVAL_MS = 5 * 60 * 1000;
const CLOCK_TAMPER_CHECK_INTERVAL_MS = 15 * 1000;
const CLOCK_TAMPER_DRIFT_THRESHOLD_MS = 5000;
const REQUEST_TIMEOUT_MS = 8000;
const TICK_INTERVAL_MS = 1000;

const TRUST_LEVEL_META = {
  'server-trusted': {
    label: 'Waktu tersinkron',
    description: 'Timer mengikuti anchor waktu server SmartPatrol.',
    tone: 'success',
  },
  'offline-trusted': {
    label: 'Offline trusted',
    description: 'Timer offline dihitung dari anchor server dan performance.now().',
    tone: 'warning',
  },
  'offline-interrupted': {
    label: 'Offline interrupted',
    description: 'Aplikasi sempat restart saat offline. Timestamp tetap dicatat, tetapi perlu verifikasi.',
    tone: 'danger',
  },
  unverified: {
    label: 'Belum sinkron',
    description: 'Belum ada anchor server yang valid. Timestamp perlu verifikasi.',
    tone: 'danger',
  },
};

const DEFAULT_STATE = {
  anchorServerEpochMs: null,
  anchorPerfNowMs: null,
  anchorDeviceNowMs: null,
  anchorSyncedAtMs: null,
  offlineSessionId: null,
  offlineStartedAtMs: null,
  offlineSessionActive: false,
  offlineSessionInterrupted: false,
  clockTamperDetected: false,
  lastSyncAttemptAtMs: null,
  lastSyncError: '',
  syncSource: null,
};

const listeners = new Set();

let state = {
  ...DEFAULT_STATE,
  anchorPerfNowMs: readPerfNow(),
};

let initialized = false;
let tickTimerId = null;
let tamperTimerId = null;
let syncTimerId = null;
let visibilityListenerAttached = false;
let lastLocalNowMs = readDeviceNow();
let lastPerfNowMs = readPerfNow();
let cachedSnapshot = null;

function canUseWindow() {
  return typeof window !== 'undefined';
}

function readDeviceNow() {
  return Date.now();
}

function readPerfNow() {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now();
  }

  return Date.now();
}

function getOnlineStatus() {
  if (!canUseWindow() || typeof navigator === 'undefined') return true;
  return navigator.onLine;
}

function asFiniteNumber(value) {
  return Number.isFinite(value) ? value : null;
}

function createOfflineSessionId() {
  if (globalThis.crypto?.randomUUID) {
    return `offline-${globalThis.crypto.randomUUID()}`;
  }

  return `offline-${readDeviceNow()}-${Math.random().toString(36).slice(2, 10)}`;
}

function loadPersistedState() {
  if (!canUseWindow()) {
    return {
      ...DEFAULT_STATE,
      anchorPerfNowMs: readPerfNow(),
    };
  }

  try {
    const raw = window.localStorage.getItem(TRUSTED_TIME_STORAGE_KEY);
    if (!raw) {
      return {
        ...DEFAULT_STATE,
        anchorPerfNowMs: readPerfNow(),
      };
    }

    const parsed = JSON.parse(raw);
    const nextState = {
      ...DEFAULT_STATE,
      anchorServerEpochMs: asFiniteNumber(parsed?.anchorServerEpochMs),
      anchorPerfNowMs: readPerfNow(),
      anchorDeviceNowMs: asFiniteNumber(parsed?.anchorDeviceNowMs),
      anchorSyncedAtMs: asFiniteNumber(parsed?.anchorSyncedAtMs),
      offlineSessionId: typeof parsed?.offlineSessionId === 'string' ? parsed.offlineSessionId : null,
      offlineStartedAtMs: asFiniteNumber(parsed?.offlineStartedAtMs),
      offlineSessionActive: Boolean(parsed?.offlineSessionActive),
      offlineSessionInterrupted: Boolean(parsed?.offlineSessionInterrupted),
      clockTamperDetected: Boolean(parsed?.clockTamperDetected),
      lastSyncAttemptAtMs: asFiniteNumber(parsed?.lastSyncAttemptAtMs),
      lastSyncError: typeof parsed?.lastSyncError === 'string' ? parsed.lastSyncError : '',
      syncSource: typeof parsed?.syncSource === 'string' ? parsed.syncSource : null,
    };

    if (nextState.anchorServerEpochMs && nextState.anchorDeviceNowMs) {
      const elapsedSincePersistMs = Math.max(0, readDeviceNow() - nextState.anchorDeviceNowMs);
      nextState.anchorServerEpochMs += elapsedSincePersistMs;
      nextState.anchorDeviceNowMs = readDeviceNow();
    }

    if (!getOnlineStatus() && nextState.anchorServerEpochMs) {
      nextState.offlineSessionActive = true;
      nextState.offlineSessionId = nextState.offlineSessionId || createOfflineSessionId();
      nextState.offlineStartedAtMs = nextState.offlineStartedAtMs || nextState.anchorServerEpochMs;
      nextState.offlineSessionInterrupted = true;
    }

    return nextState;
  } catch (error) {
    console.error('Gagal memuat anchor trusted time', error);
    return {
      ...DEFAULT_STATE,
      anchorPerfNowMs: readPerfNow(),
    };
  }
}

function toPersistedState() {
  const trustedNowMs = state.anchorServerEpochMs ? getTrustedNowMs() : null;

  return {
    anchorServerEpochMs: trustedNowMs,
    anchorDeviceNowMs: state.anchorServerEpochMs ? readDeviceNow() : null,
    anchorSyncedAtMs: state.anchorSyncedAtMs,
    offlineSessionId: state.offlineSessionId,
    offlineStartedAtMs: state.offlineStartedAtMs,
    offlineSessionActive: state.offlineSessionActive,
    offlineSessionInterrupted: state.offlineSessionInterrupted,
    clockTamperDetected: state.clockTamperDetected,
    lastSyncAttemptAtMs: state.lastSyncAttemptAtMs,
    lastSyncError: state.lastSyncError,
    syncSource: state.syncSource,
  };
}

function persistState() {
  if (!canUseWindow()) return;

  try {
    window.localStorage.setItem(TRUSTED_TIME_STORAGE_KEY, JSON.stringify(toPersistedState()));
  } catch (error) {
    console.error('Gagal menyimpan anchor trusted time', error);
  }
}

function invalidateSnapshotCache() {
  cachedSnapshot = null;
}

function notifyListeners() {
  invalidateSnapshotCache();
  listeners.forEach((listener) => {
    try {
      listener();
    } catch (error) {
      console.error('Listener trusted time gagal dijalankan', error);
    }
  });
}

function commitState(patch, options = {}) {
  const { persist = true, notify = true } = options;
  state = {
    ...state,
    ...patch,
  };
  invalidateSnapshotCache();

  if (persist) persistState();
  if (notify) notifyListeners();
}

function buildFunctionFallbackUrl() {
  const projectId = import.meta.env?.VITE_FIREBASE_PROJECT_ID || '';
  if (!projectId) return null;
  return `https://${TRUSTED_TIME_FUNCTION_REGION}-${projectId}.cloudfunctions.net/getServerTime`;
}

function resolveServerTimeUrls() {
  const urls = new Set();
  const configuredUrl = (import.meta.env?.VITE_TRUSTED_TIME_URL || '').trim();

  if (configuredUrl) {
    urls.add(configuredUrl);
  }

  if (canUseWindow()) {
    urls.add(new URL(SERVER_TIME_ROUTE, window.location.origin).toString());
  }

  const functionFallbackUrl = buildFunctionFallbackUrl();
  if (functionFallbackUrl) {
    urls.add(functionFallbackUrl);
  }

  return Array.from(urls);
}

function applyServerAnchor(serverNowMs, source) {
  const deviceNowMs = readDeviceNow();
  commitState({
    anchorServerEpochMs: serverNowMs,
    anchorPerfNowMs: readPerfNow(),
    anchorDeviceNowMs: deviceNowMs,
    anchorSyncedAtMs: serverNowMs,
    offlineSessionId: null,
    offlineStartedAtMs: null,
    offlineSessionActive: false,
    offlineSessionInterrupted: false,
    clockTamperDetected: false,
    lastSyncError: '',
    syncSource: source || null,
  });
}

function resolveTrustLevel() {
  if (!state.anchorServerEpochMs) return 'unverified';
  if (state.offlineSessionInterrupted) return 'offline-interrupted';
  if (!getOnlineStatus()) return 'offline-trusted';
  return 'server-trusted';
}

function getTrustMeta(trustLevel = resolveTrustLevel()) {
  return TRUST_LEVEL_META[trustLevel] || TRUST_LEVEL_META.unverified;
}

export function getTrustedNowMs() {
  if (!state.anchorServerEpochMs) {
    return readDeviceNow();
  }

  if (state.offlineSessionInterrupted) {
    const elapsedFromDeviceMs = Math.max(0, readDeviceNow() - (state.anchorDeviceNowMs || readDeviceNow()));
    return state.anchorServerEpochMs + elapsedFromDeviceMs;
  }

  const elapsedFromPerfMs = Math.max(0, readPerfNow() - (state.anchorPerfNowMs || readPerfNow()));
  return state.anchorServerEpochMs + elapsedFromPerfMs;
}

export function getTrustedDate() {
  return new Date(getTrustedNowMs());
}

export function getTimeTrustStatus() {
  const trustLevel = resolveTrustLevel();
  const meta = getTrustMeta(trustLevel);

  return {
    trustLevel,
    label: meta.label,
    description: meta.description,
    tone: meta.tone,
    clockTamperDetected: state.clockTamperDetected,
    offlineSessionId: state.offlineSessionId,
    offlineSessionActive: state.offlineSessionActive,
    offlineSessionInterrupted: state.offlineSessionInterrupted,
    anchorSyncedAtMs: state.anchorSyncedAtMs,
    lastSyncAttemptAtMs: state.lastSyncAttemptAtMs,
    lastSyncError: state.lastSyncError,
    syncSource: state.syncSource,
    isOnline: getOnlineStatus(),
  };
}

function buildTrustedTimeSnapshot() {
  const nowMs = getTrustedNowMs();
  const nowDate = new Date(nowMs);
  const status = getTimeTrustStatus();
  const warningMessage = status.clockTamperDetected
    ? 'Perubahan jam perangkat terdeteksi. Timestamp perlu audit tambahan.'
    : status.description;

  return {
    ...status,
    nowMs,
    nowDate,
    nowIso: nowDate.toISOString(),
    warningMessage,
  };
}

export function getTrustedTimeSnapshot() {
  if (cachedSnapshot) {
    return cachedSnapshot;
  }

  cachedSnapshot = buildTrustedTimeSnapshot();
  return cachedSnapshot;
}

export function createTrustedTimestampRecord() {
  const snapshot = buildTrustedTimeSnapshot();

  return {
    occurredAtTrustedMs: snapshot.nowMs,
    occurredAtTrustedIso: snapshot.nowIso,
    occurredAtClientMs: readDeviceNow(),
    receivedAtServerMs: null,
    timeTrustLevel: snapshot.trustLevel,
    offlineSessionId: snapshot.offlineSessionId,
    offlineSessionInterrupted: snapshot.offlineSessionInterrupted,
    clockTamperDetected: snapshot.clockTamperDetected,
    anchorSyncedAtMs: snapshot.anchorSyncedAtMs,
  };
}

export function startOfflineSession() {
  if (!state.anchorServerEpochMs) {
    notifyListeners();
    return;
  }

  commitState({
    offlineSessionActive: true,
    offlineSessionId: state.offlineSessionId || createOfflineSessionId(),
    offlineStartedAtMs: state.offlineStartedAtMs || getTrustedNowMs(),
  });
}

export function finishOfflineSession() {
  commitState({
    offlineSessionActive: false,
    offlineSessionId: null,
    offlineStartedAtMs: null,
    offlineSessionInterrupted: false,
  });
}

export function detectClockTampering() {
  const currentLocalNowMs = readDeviceNow();
  const currentPerfNowMs = readPerfNow();
  const localElapsedMs = currentLocalNowMs - lastLocalNowMs;
  const perfElapsedMs = currentPerfNowMs - lastPerfNowMs;
  const driftMs = Math.abs(localElapsedMs - perfElapsedMs);

  lastLocalNowMs = currentLocalNowMs;
  lastPerfNowMs = currentPerfNowMs;

  if (driftMs <= CLOCK_TAMPER_DRIFT_THRESHOLD_MS || state.clockTamperDetected) {
    return state.clockTamperDetected;
  }

  commitState({
    clockTamperDetected: true,
  });

  return true;
}

export function subscribeTrustedTime(listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export async function syncServerTime(options = {}) {
  const { reason = 'manual' } = options;
  const urls = resolveServerTimeUrls();
  const syncStartedAtMs = readDeviceNow();

  commitState({
    lastSyncAttemptAtMs: syncStartedAtMs,
  }, { notify: false });

  let lastError = null;

  for (const url of urls) {
    const controller = typeof AbortController === 'function' ? new AbortController() : null;
    const timeoutId = controller
      ? window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
      : null;
    const requestStartedPerfMs = readPerfNow();

    try {
      const response = await fetch(url, {
        method: 'GET',
        cache: 'no-store',
        headers: {
          Accept: 'application/json',
        },
        signal: controller?.signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const payload = await response.json();
      const serverNowMs = asFiniteNumber(payload?.serverNowMs);
      if (!serverNowMs) {
        throw new Error('Respons serverNowMs tidak valid');
      }

      const roundTripMs = Math.max(0, readPerfNow() - requestStartedPerfMs);
      const adjustedServerNowMs = serverNowMs + Math.round(roundTripMs / 2);

      applyServerAnchor(adjustedServerNowMs, payload?.source || reason || url);
      return getTrustedTimeSnapshot();
    } catch (error) {
      lastError = error;
    } finally {
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
      }
    }
  }

  commitState({
    lastSyncError: lastError?.message || 'Sinkronisasi waktu server gagal',
  });

  throw lastError;
}

export function initializeTrustedTime() {
  if (initialized) {
    return () => {};
  }

  initialized = true;
  state = loadPersistedState();
  invalidateSnapshotCache();
  lastLocalNowMs = readDeviceNow();
  lastPerfNowMs = readPerfNow();
  persistState();
  notifyListeners();

  const handleOnline = () => {
    syncServerTime({ reason: 'online' }).catch((error) => {
      console.error('Sinkronisasi trusted time saat online gagal', error);
      notifyListeners();
    });
  };

  const handleOffline = () => {
    startOfflineSession();
  };

  const handleVisibilityChange = () => {
    if (document.visibilityState !== 'visible' || !getOnlineStatus()) return;

    const timeSinceLastSyncMs = Math.max(0, readDeviceNow() - (state.lastSyncAttemptAtMs || 0));
    if (timeSinceLastSyncMs < 60 * 1000) return;

    syncServerTime({ reason: 'focus' }).catch((error) => {
      console.error('Sinkronisasi trusted time saat fokus gagal', error);
    });
  };

  if (canUseWindow()) {
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
  }

  if (typeof document !== 'undefined' && !visibilityListenerAttached) {
    document.addEventListener('visibilitychange', handleVisibilityChange);
    visibilityListenerAttached = true;
  }

  tickTimerId = window.setInterval(() => {
    notifyListeners();
  }, TICK_INTERVAL_MS);

  tamperTimerId = window.setInterval(() => {
    detectClockTampering();
  }, CLOCK_TAMPER_CHECK_INTERVAL_MS);

  syncTimerId = window.setInterval(() => {
    if (!getOnlineStatus()) return;

    syncServerTime({ reason: 'interval' }).catch((error) => {
      console.error('Sinkronisasi trusted time terjadwal gagal', error);
    });
  }, SERVER_TIME_SYNC_INTERVAL_MS);

  if (getOnlineStatus()) {
    syncServerTime({ reason: 'init' }).catch((error) => {
      console.error('Sinkronisasi trusted time saat inisialisasi gagal', error);
      notifyListeners();
    });
  } else {
    startOfflineSession();
  }

  return () => {
    initialized = false;

    if (canUseWindow()) {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    }

    if (typeof document !== 'undefined' && visibilityListenerAttached) {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      visibilityListenerAttached = false;
    }

    if (tickTimerId) {
      window.clearInterval(tickTimerId);
      tickTimerId = null;
    }

    if (tamperTimerId) {
      window.clearInterval(tamperTimerId);
      tamperTimerId = null;
    }

    if (syncTimerId) {
      window.clearInterval(syncTimerId);
      syncTimerId = null;
    }
  };
}
