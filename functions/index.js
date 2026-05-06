/*
Tujuan: Menyediakan trusted server time, kontrol akses operasional, dan notifikasi operasional/admin lewat Cloud Functions.
Caller: Client web/native untuk sinkronisasi waktu, binding akun Firebase Auth, approval onboarding, registrasi push token, dan trigger Firestore.
Dependensi: Firebase Functions v2, Firebase Admin SDK, dan model sanitasi security lokal.
Main Functions: getServerTime, resolveOperationalAccess, syncOperationalUserAccess, push notification, approval onboarding, trusted time, dan pruneStaleCheckpointsFromSharedState.
Side Effects: Membaca/menulis Firestore pendingRegistrations, userAccess, pushTokens, incidents, shared-state.notifications, shared-state.checkpointsByShip (cleanup blob bengkak), memperbarui custom claims Firebase Auth, mengirim FCM, dan mengembalikan trusted server time.
*/

import { createHash } from 'node:crypto';
import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';
import { getStorage } from 'firebase-admin/storage';
import { onDocumentCreated, onDocumentWritten } from 'firebase-functions/v2/firestore';
import { HttpsError, onCall, onRequest } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import {
  ACCESS_ROLES,
  buildOperationalAccessPayload,
  buildPendingRegistrationPayload,
  sanitizeEmailValue,
  sanitizePhoneValue,
} from './accessModels.js';

initializeApp();

const TRUSTED_TIME_REGION = 'asia-southeast2';
const SHARED_STATE_COLLECTION = 'smartpatrol';
const SHARED_STATE_DOCUMENT = 'shared-state';
const PENDING_REGISTRATIONS_COLLECTION = 'pendingRegistrations';
const USER_ACCESS_COLLECTION = 'userAccess';
const PUSH_TOKENS_COLLECTION = 'pushTokens';
const PUSH_DEDUPE_COLLECTION = 'pushDedupe';
const MAX_NOTIFICATION_ITEMS = 250;
const APP_TIME_ZONE = 'Asia/Jakarta';
const PUSH_ALERT_CHANNEL_ID = 'smartpatrol-alerts';
const PUSH_SOS_CHANNEL_ID = 'smartpatrol-sos';
const SHIFT_SEQUENCE = Object.freeze([
  { id: 'shift-1-active', label: 'Shift 1', startHour: 6, startMinute: 0, endHour: 12, endMinute: 0 },
  { id: 'shift-2-active', label: 'Shift 2', startHour: 12, startMinute: 0, endHour: 18, endMinute: 0 },
  { id: 'shift-3-active', label: 'Shift 3', startHour: 18, startMinute: 0, endHour: 6, endMinute: 0, crossesMidnight: true },
]);

const firestore = getFirestore();
const adminAuth = getAuth();
const adminMessaging = getMessaging();
const adminStorage = getStorage();

function sanitizeString(value, maxLength = 160) {
  if (typeof value !== 'string') return '';
  return value
    .replace(/[\u0000-\u001f\u007f<>]/g, ' ')
    .trim()
    .slice(0, maxLength);
}

function sanitizeMultilineMessage(value, maxLength = 2000) {
  if (typeof value !== 'string') return '';
  return value
    .replace(/[\u0000-\u0009\u000b-\u001f\u007f<>]/g, ' ')
    .trim()
    .slice(0, maxLength);
}

function sanitizeStorageSegment(value, fallback = 'part') {
  return sanitizeString(String(value || ''), 120)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/(^-|-$)/g, '') || fallback;
}

function sanitizeOperationalAssetPath(path) {
  const normalizedPath = sanitizeString(path || '', 400)
    .split('/')
    .map((segment, index) => sanitizeStorageSegment(segment, `part-${index + 1}`))
    .filter(Boolean)
    .join('/');

  if (!normalizedPath.startsWith('state-assets/')) {
    throw new HttpsError('invalid-argument', 'Path aset operasional tidak valid.');
  }

  return normalizedPath;
}

function decodeDataUrlAsset(dataUrl) {
  const match = String(dataUrl || '').match(/^data:([^,]*?),(.*)$/s);
  if (!match) {
    throw new HttpsError('invalid-argument', 'Format data URL aset tidak valid.');
  }

  const metadataPart = match[1] || '';
  const payloadPart = match[2] || '';
  const isBase64 = metadataPart.includes(';base64');
  const contentType = sanitizeString(metadataPart.split(';')[0] || '', 120) || 'application/octet-stream';
  const buffer = isBase64
    ? Buffer.from(payloadPart, 'base64')
    : Buffer.from(decodeURIComponent(payloadPart), 'utf8');

  if (buffer.length === 0) {
    throw new HttpsError('invalid-argument', 'Payload aset kosong.');
  }

  if (buffer.length > 8 * 1024 * 1024) {
    throw new HttpsError('invalid-argument', 'Ukuran aset melebihi batas 8MB.');
  }

  return {
    buffer,
    contentType,
  };
}

function buildTokenDownloadUrl(bucketName, objectPath, token) {
  return `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encodeURIComponent(objectPath)}?alt=media&token=${token}`;
}

function getSharedStateRef() {
  return firestore.collection(SHARED_STATE_COLLECTION).doc(SHARED_STATE_DOCUMENT);
}

function getPendingRegistrationRef(uid) {
  return firestore.collection(PENDING_REGISTRATIONS_COLLECTION).doc(uid);
}

function getUserAccessRef(uid) {
  return firestore.collection(USER_ACCESS_COLLECTION).doc(uid);
}

function createNotificationId(prefix = 'notification') {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function serializeTimestamp(value) {
  if (!value) return null;
  if (typeof value?.toDate === 'function') {
    return value.toDate().toISOString();
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  return null;
}

function serializePendingRegistration(data = {}) {
  return {
    uid: sanitizeString(data.uid, 160),
    email: sanitizeEmailValue(data.email),
    name: sanitizeString(data.name, 80),
    phone: sanitizePhoneValue(data.phone),
    photoUrl: sanitizeString(data.photoUrl, 500),
    photoPath: sanitizeString(data.photoPath, 240),
    type: sanitizeString(data.type, 20),
    workerNumber: sanitizeString(data.workerNumber, 40),
    status: sanitizeString(data.status, 20).toLowerCase() || 'pending',
    reviewNote: sanitizeString(data.reviewNote, 240),
    reviewedBy: sanitizeString(data.reviewedBy, 160),
    createdAt: serializeTimestamp(data.createdAt),
    updatedAt: serializeTimestamp(data.updatedAt),
    reviewedAt: serializeTimestamp(data.reviewedAt),
  };
}

function serializeOperationalAccess(data = {}) {
  return {
    uid: sanitizeString(data.uid, 160),
    email: sanitizeEmailValue(data.email),
    name: sanitizeString(data.name, 80),
    role: sanitizeString(data.role, 20).toUpperCase(),
    status: sanitizeString(data.status, 20).toLowerCase(),
    shipAssigned: sanitizeString(data.shipAssigned || '', 80) || null,
    type: sanitizeString(data.type, 20) || 'BUJP',
    workerNumber: sanitizeString(data.workerNumber, 40),
    legacyUserId: sanitizeString(data.legacyUserId || '', 160) || null,
    source: sanitizeString(data.source || '', 40) || 'manual',
    reviewState: sanitizeString(data.reviewState || '', 20).toLowerCase() || 'approved',
    enabled: Boolean(data.enabled),
    approvedBy: sanitizeString(data.approvedBy || '', 160),
    approvedAt: serializeTimestamp(data.approvedAt),
    reviewedAt: serializeTimestamp(data.reviewedAt),
    updatedAt: serializeTimestamp(data.updatedAt),
  };
}

function serializeOperationalProfile(data = {}) {
  return {
    id: sanitizeString(data.id || '', 160) || null,
    email: sanitizeEmailValue(data.email),
    firebaseUid: sanitizeString(data.firebaseUid || '', 160) || null,
    name: sanitizeString(data.name, 80),
    role: sanitizeString(data.role, 20).toUpperCase(),
    type: sanitizeString(data.type, 20) || 'BUJP',
    workerNumber: sanitizeString(data.workerNumber, 40),
    phone: sanitizePhoneValue(data.phone),
    photoUrl: sanitizeString(data.photoUrl, 500),
    status: sanitizeString(data.status, 20).toLowerCase(),
    shipAssigned: sanitizeString(data.shipAssigned || '', 80) || null,
  };
}

function assertAuthenticated(request) {
  const uid = sanitizeString(request.auth?.uid || '', 160);
  const email = sanitizeEmailValue(request.auth?.token?.email || '');
  if (!uid) {
    throw new HttpsError('unauthenticated', 'Anda harus login dengan Firebase Auth.');
  }
  return {
    uid,
    email,
  };
}

async function requireAdminUser(request) {
  const authContext = assertAuthenticated(request);
  const snapshot = await getUserAccessRef(authContext.uid).get();
  const data = snapshot.exists ? snapshot.data() || {} : {};
  const role = sanitizeString(data.role || '', 20).toUpperCase();

  if (role !== ACCESS_ROLES.ADMIN || !data.enabled) {
    throw new HttpsError('permission-denied', 'Hanya admin operasional yang boleh menjalankan aksi ini.');
  }

  return {
    ...authContext,
    access: data,
  };
}

async function requireOperationalUser(request) {
  const authContext = assertAuthenticated(request);
  const snapshot = await getUserAccessRef(authContext.uid).get();
  const data = snapshot.exists ? snapshot.data() || {} : {};
  const reviewState = sanitizeString(data.reviewState || '', 20).toLowerCase();

  if (!data.enabled || reviewState !== 'approved') {
    throw new HttpsError('permission-denied', 'Akses operasional cloud belum aktif untuk upload aset.');
  }

  return {
    ...authContext,
    access: data,
  };
}

function resolveAllowedOrigins(request) {
  let firebaseConfigProjectId = '';
  try {
    firebaseConfigProjectId = JSON.parse(process.env.FIREBASE_CONFIG || '{}').projectId || '';
  } catch {
    firebaseConfigProjectId = '';
  }
  const configuredOrigins = String(process.env.SMARTPATROL_ALLOWED_ORIGINS || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  const projectId = process.env.GCLOUD_PROJECT || firebaseConfigProjectId || '';
  const projectOrigins = projectId
    ? [
      `https://${projectId}.web.app`,
      `https://${projectId}.firebaseapp.com`,
    ]
    : [];

  const localOrigins = [
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    'http://localhost:4173',
    'http://127.0.0.1:4173',
    // Capacitor native runtime origins (Android & iOS)
    'https://localhost',
    'http://localhost',
    'capacitor://localhost',
    'ionic://localhost',
  ];

  const allowedOrigins = new Set([
    ...configuredOrigins,
    ...projectOrigins,
    ...localOrigins,
  ]);

  const requestOrigin = sanitizeString(request.get('origin') || '', 240);
  if (!requestOrigin) return '';

  return allowedOrigins.has(requestOrigin) ? requestOrigin : '';
}

function applySecurityHeaders(request, response) {
  const allowedOrigin = resolveAllowedOrigins(request);
  if (allowedOrigin) {
    response.set('Access-Control-Allow-Origin', allowedOrigin);
  }
  response.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
  response.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  response.set('Vary', 'Origin');
  response.set('Cache-Control', 'no-store, max-age=0');
  response.set('Pragma', 'no-cache');
  response.set('X-Content-Type-Options', 'nosniff');
  response.set('Referrer-Policy', 'same-origin');
  response.set('Permissions-Policy', 'camera=(self), geolocation=(self), microphone=()');
}

function scoreOperationalUser(user = {}, { email, uid }) {
  const normalizedEmail = sanitizeEmailValue(user.email);
  const normalizedUid = sanitizeString(user.firebaseUid || '', 160);
  const normalizedRole = sanitizeString(user.role || '', 20).toUpperCase();
  const normalizedStatus = sanitizeString(user.status || '', 20).toLowerCase();
  const hasUidMatch = Boolean(uid && normalizedUid && normalizedUid === uid);
  const hasEmailMatch = Boolean(email && normalizedEmail && normalizedEmail === email);

  // Legacy binding hanya boleh berjalan saat ada kecocokan identitas kuat.
  if (!hasUidMatch && !hasEmailMatch) return 0;

  let score = 0;
  if (hasUidMatch) score += 1000;
  if (hasEmailMatch) score += 900;
  if (normalizedRole === ACCESS_ROLES.ADMIN) score += 120;
  if (normalizedRole === ACCESS_ROLES.PIC) score += 80;
  if (normalizedStatus === 'active') score += 40;
  if (sanitizeString(user.shipAssigned || '', 80)) score += 20;
  return score;
}

async function findOperationalUserInSharedState({ email, uid }) {
  const snapshot = await getSharedStateRef().get();
  if (!snapshot.exists) return null;

  const users = Array.isArray(snapshot.data()?.state?.usersData)
    ? snapshot.data().state.usersData
    : [];

  const bestUser = users
    .map((user) => ({
      user,
      score: scoreOperationalUser(user, { email, uid }),
    }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score)[0];

  return bestUser?.user || null;
}

async function applyCustomClaims(uid, accessRecord) {
  const claims = {
    smartpatrolOperational: Boolean(accessRecord.enabled),
    smartpatrolRole: sanitizeString(accessRecord.role || '', 20).toUpperCase() || 'NONE',
    smartpatrolStatus: sanitizeString(accessRecord.status || '', 20).toLowerCase() || 'disabled',
    smartpatrolShipAssigned: sanitizeString(accessRecord.shipAssigned || '', 80) || '',
  };

  await adminAuth.setCustomUserClaims(uid, claims);
}

async function upsertOperationalAccess(uid, payload, options = {}) {
  const normalized = buildOperationalAccessPayload({
    ...payload,
    uid,
    source: options.source || payload?.source || 'manual',
    reviewState: options.reviewState || payload?.reviewState || 'approved',
  });

  if (!normalized.uid || !normalized.email) {
    throw new HttpsError('invalid-argument', 'UID dan email akses operasional wajib tersedia.');
  }

  const accessRecord = {
    ...normalized,
    approvedBy: sanitizeString(options.reviewedBy || '', 160),
    approvedAt: FieldValue.serverTimestamp(),
    reviewedAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  };

  await getUserAccessRef(uid).set(accessRecord, { merge: true });
  await applyCustomClaims(uid, accessRecord);

  return accessRecord;
}

async function markPendingRegistration(uid, patch = {}) {
  await getPendingRegistrationRef(uid).set({
    ...patch,
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });
}

async function getAdminNotificationTargets() {
  const snapshot = await firestore.collection(USER_ACCESS_COLLECTION)
    .where('role', '==', ACCESS_ROLES.ADMIN)
    .where('enabled', '==', true)
    .get();

  const targets = new Set();
  snapshot.forEach((docSnapshot) => {
    const data = docSnapshot.data() || {};
    const authUid = sanitizeString(data.uid || docSnapshot.id || '', 160);
    const legacyUserId = sanitizeString(data.legacyUserId || '', 160);

    if (authUid) targets.add(authUid);
    if (legacyUserId) targets.add(legacyUserId);
  });

  return Array.from(targets);
}

async function appendNotificationForAdminUsers(notification = {}) {
  const targetUserIds = await getAdminNotificationTargets();
  if (targetUserIds.length === 0) return;

  await firestore.runTransaction(async (transaction) => {
    const sharedStateRef = getSharedStateRef();
    const sharedStateSnapshot = await transaction.get(sharedStateRef);
    if (!sharedStateSnapshot.exists) return;

    const sharedStateData = sharedStateSnapshot.data() || {};
    const state = sharedStateData.state || {};
    const existingNotifications = Array.isArray(state.notifications) ? state.notifications : [];
    const nextDedupeKey = sanitizeString(notification.dedupeKey || '', 240);
    if (nextDedupeKey && existingNotifications.some((item) => sanitizeString(item?.dedupeKey || '', 240) === nextDedupeKey)) {
      return;
    }

    const nextNotification = {
      id: createNotificationId('notif'),
      type: sanitizeString(notification.type || 'general', 60) || 'general',
      title: sanitizeString(notification.title || 'Notifikasi Sistem', 120) || 'Notifikasi Sistem',
      message: sanitizeMultilineMessage(notification.message || '', 2000),
      senderName: sanitizeString(notification.senderName || 'Sistem', 80) || 'Sistem',
      senderRole: sanitizeString(notification.senderRole || 'SYSTEM', 40) || 'SYSTEM',
      targetUserIds,
      route: sanitizeString(notification.route || 'users/list', 80) || 'users/list',
      routeParams: notification.routeParams && typeof notification.routeParams === 'object'
        ? notification.routeParams
        : {},
      shipName: '',
      shiftKey: '',
      incidentId: '',
      historyId: '',
      dedupeKey: nextDedupeKey,
      readByUserIds: [],
      createdAt: new Date().toISOString(),
    };

    transaction.set(sharedStateRef, {
      state: {
        ...state,
        notifications: [
          nextNotification,
          ...existingNotifications,
        ].slice(0, MAX_NOTIFICATION_ITEMS),
      },
      updatedAt: FieldValue.serverTimestamp(),
      clientUpdatedAt: Date.now(),
    }, { merge: true });
  });
}

function hashPushToken(value) {
  return createHash('sha256')
    .update(String(value || ''))
    .digest('hex');
}

function toFcmStringMap(payload = {}) {
  return Object.fromEntries(
    Object.entries(payload)
      .filter(([key]) => sanitizeString(key, 80))
      .map(([key, value]) => [
        sanitizeString(key, 80),
        sanitizeString(value == null ? '' : String(value), 900),
      ]),
  );
}

function normalizeRoleValue(value) {
  const role = sanitizeString(value || '', 20).toUpperCase();
  if ([ACCESS_ROLES.ADMIN, ACCESS_ROLES.PIC, ACCESS_ROLES.PETUGAS].includes(role)) return role;
  return '';
}

function normalizeShipName(value) {
  return sanitizeString(value || '', 100);
}

function normalizeAccessRecord(docSnapshot) {
  const data = docSnapshot.data() || {};
  const role = normalizeRoleValue(data.role);
  const reviewState = sanitizeString(data.reviewState || '', 20).toLowerCase() || 'approved';
  return {
    uid: sanitizeString(data.uid || docSnapshot.id || '', 160),
    legacyUserId: sanitizeString(data.legacyUserId || '', 160),
    name: sanitizeString(data.name || '', 100),
    email: sanitizeEmailValue(data.email || ''),
    role,
    shipAssigned: normalizeShipName(data.shipAssigned || ''),
    enabled: Boolean(data.enabled),
    reviewState,
  };
}

function isApprovedAccessRecord(record) {
  return Boolean(record?.enabled && record?.reviewState === 'approved' && record?.uid);
}

async function getOperationalAccessRecords() {
  const snapshot = await firestore.collection(USER_ACCESS_COLLECTION)
    .where('enabled', '==', true)
    .get();

  const records = [];
  snapshot.forEach((docSnapshot) => {
    const record = normalizeAccessRecord(docSnapshot);
    if (isApprovedAccessRecord(record)) records.push(record);
  });
  return records;
}

function getAccessIdentitySet(record = {}) {
  return new Set([
    sanitizeString(record.uid || '', 160),
    sanitizeString(record.legacyUserId || '', 160),
  ].filter(Boolean));
}

function accessMatchesTargetIds(record, targetIds = []) {
  if (!targetIds.length) return true;
  const identitySet = getAccessIdentitySet(record);
  return targetIds.some((targetId) => identitySet.has(targetId));
}

function accessMatchesShip(record, shipName = '') {
  const safeShipName = normalizeShipName(shipName);
  if (!safeShipName) return true;
  if ([ACCESS_ROLES.ADMIN, ACCESS_ROLES.PIC].includes(record.role)) return true;
  return record.role === ACCESS_ROLES.PETUGAS && record.shipAssigned === safeShipName;
}

async function resolveAccessTargets(options = {}) {
  const {
    shipName = '',
    targetUserIds = [],
    includeAdmins = true,
    includePic = true,
    includePetugas = true,
  } = options;
  const safeTargetIds = Array.from(new Set(
    (Array.isArray(targetUserIds) ? targetUserIds : [])
      .map((item) => sanitizeString(item || '', 160))
      .filter(Boolean),
  ));
  const allRecords = await getOperationalAccessRecords();

  return allRecords.filter((record) => {
    if (!accessMatchesTargetIds(record, safeTargetIds)) return false;
    if (record.role === ACCESS_ROLES.ADMIN) return includeAdmins;
    if (record.role === ACCESS_ROLES.PIC) return includePic;
    if (record.role === ACCESS_ROLES.PETUGAS) return includePetugas && accessMatchesShip(record, shipName);
    return false;
  });
}

async function getPushTokenDocsForAccessRecords(accessRecords = []) {
  if (!accessRecords.length) return [];

  const allowedIdentities = new Set();
  accessRecords.forEach((record) => {
    getAccessIdentitySet(record).forEach((value) => allowedIdentities.add(value));
  });

  const snapshot = await firestore.collection(PUSH_TOKENS_COLLECTION)
    .where('enabled', '==', true)
    .get();
  const tokenDocs = [];
  const seenTokens = new Set();
  snapshot.forEach((docSnapshot) => {
    const data = docSnapshot.data() || {};
    const token = sanitizeString(data.token || '', 4096);
    const uid = sanitizeString(data.uid || '', 160);
    const legacyUserId = sanitizeString(data.legacyUserId || '', 160);
    if (!token || seenTokens.has(token)) return;
    if (!allowedIdentities.has(uid) && !allowedIdentities.has(legacyUserId)) return;
    seenTokens.add(token);
    tokenDocs.push({
      docId: docSnapshot.id,
      token,
    });
  });

  return tokenDocs;
}

async function disableInvalidPushToken(docId) {
  if (!docId) return;
  await firestore.collection(PUSH_TOKENS_COLLECTION).doc(docId).set({
    enabled: false,
    disabledAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true }).catch(() => { });
}

async function sendPushToAccessRecords(accessRecords = [], push = {}) {
  const tokenDocs = await getPushTokenDocsForAccessRecords(accessRecords);
  if (!tokenDocs.length) return { sent: 0, tokens: 0 };

  const title = sanitizeString(push.title || 'SmartPatrol', 120) || 'SmartPatrol';
  const body = sanitizeString(push.body || push.message || '', 240);
  const channelId = sanitizeString(push.channelId || PUSH_ALERT_CHANNEL_ID, 80) || PUSH_ALERT_CHANNEL_ID;
  const tag = sanitizeString(push.tag || push.type || 'smartpatrol', 80) || 'smartpatrol';
  const isSosPush = channelId === PUSH_SOS_CHANNEL_ID || sanitizeString(push.type || '', 40) === 'sos';
  const data = toFcmStringMap({
    type: push.type || 'smartpatrol',
    title,
    body,
    message: body,
    channelId,
    route: push.route || 'notifications',
    incidentId: push.incidentId || '',
    sosId: push.sosId || '',
    shipName: push.shipName || '',
    shiftKey: push.shiftKey || '',
    checkpointId: push.checkpointId || '',
    historyId: push.historyId || '',
    dedupeKey: push.dedupeKey || '',
    senderName: push.senderName || 'SmartPatrol',
    senderRole: push.senderRole || 'SYSTEM',
    createdAt: push.createdAt || new Date().toISOString(),
    fullScreen: isSosPush ? 'true' : 'false',
    click_action: 'OPEN_SMARTPATROL',
    ...push.data,
  });

  let sent = 0;
  for (let index = 0; index < tokenDocs.length; index += 500) {
    const chunk = tokenDocs.slice(index, index + 500);
    const multicastMessage = {
      tokens: chunk.map((entry) => entry.token),
      data,
      android: {
        priority: 'high',
        collapseKey: tag,
        notification: {
          channelId,
          clickAction: 'OPEN_SMARTPATROL',
          priority: 'high',
          sound: 'default',
          tag,
        },
      },
    };

    if (!isSosPush) {
      multicastMessage.notification = {
        title,
        body,
      };
    }

    const response = await adminMessaging.sendEachForMulticast(multicastMessage);

    sent += response.successCount || 0;
    await Promise.all((response.responses || []).map((item, itemIndex) => {
      const errorCode = sanitizeString(item?.error?.code || '', 80);
      if (!errorCode) return null;
      if (
        errorCode.includes('registration-token-not-registered')
        || errorCode.includes('invalid-registration-token')
        || errorCode.includes('invalid-argument')
      ) {
        return disableInvalidPushToken(chunk[itemIndex]?.docId);
      }
      return null;
    }).filter(Boolean));
  }

  return {
    sent,
    tokens: tokenDocs.length,
  };
}

async function claimPushDedupe(key) {
  const safeKey = sanitizeString(key || '', 400);
  if (!safeKey) return false;
  const dedupeId = hashPushToken(safeKey);
  const dedupeRef = firestore.collection(PUSH_DEDUPE_COLLECTION).doc(dedupeId);

  return firestore.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(dedupeRef);
    if (snapshot.exists) return false;
    transaction.set(dedupeRef, {
      key: safeKey,
      createdAt: FieldValue.serverTimestamp(),
    });
    return true;
  });
}

function ensureArray(value) {
  return Array.isArray(value) ? value : [];
}

function ensureObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function getSharedStatePayload(documentData = {}) {
  return ensureObject(documentData?.state);
}

function resolveShipNameFromState(state = {}, shipIdOrName = '') {
  const safeValue = sanitizeString(shipIdOrName || '', 120);
  if (!safeValue) return '';
  const ship = ensureArray(state.shipsData).find((item) => (
    sanitizeString(item?.id || '', 120) === safeValue
    || sanitizeString(item?.name || '', 120) === safeValue
  ));
  return normalizeShipName(ship?.name || safeValue);
}

function resolveIncidentFromState(state = {}, incidentId = '') {
  const safeIncidentId = sanitizeString(incidentId || '', 180);
  if (!safeIncidentId) return null;
  const directIncident = ensureArray(state.incidentsData).find((incident) => (
    sanitizeString(incident?.id || incident?.incidentId || '', 180) === safeIncidentId
  ));
  if (directIncident) return directIncident;
  const sos = state.activeSOSAlert?.id === safeIncidentId
    ? state.activeSOSAlert
    : ensureArray(state.sosHistory).find((entry) => entry?.id === safeIncidentId);
  if (!sos) return null;
  return {
    id: sos.id,
    isSOS: true,
    location: 'SOS',
    shipName: sos.shipName,
    senderName: sos.senderName,
  };
}

function getIncidentLabel(incident = {}, fallback = 'Temuan') {
  return sanitizeString(
    incident.location
    || incident.name
    || incident.title
    || incident.checkpointName
    || fallback,
    100,
  ) || fallback;
}

function getIncidentShipName(incident = {}, state = {}) {
  return normalizeShipName(incident.shipName || resolveShipNameFromState(state, incident.shipId || ''));
}

function getIncidentTargetUserIds(incident = {}) {
  return ensureArray(incident.targetUserIds)
    .map((item) => sanitizeString(item || '', 160))
    .filter(Boolean);
}

function getProgressItems(meta = {}) {
  return ensureArray(meta?.progress);
}

function getDomainIncidentProgressItems(incident = {}) {
  return ensureArray(incident?.progress || incident?.incidentMeta?.progress);
}

function getLatestProgressItem(progressItems = []) {
  const normalizedProgressItems = ensureArray(progressItems);
  if (normalizedProgressItems.length === 0) return null;

  return normalizedProgressItems
    .map((item, index) => ({
      item,
      index,
      timestamp: new Date(item?.createdAt || item?.updatedAt || '').getTime(),
    }))
    .sort((left, right) => (
      (Number.isNaN(right.timestamp) ? 0 : right.timestamp) - (Number.isNaN(left.timestamp) ? 0 : left.timestamp)
      || right.index - left.index
    ))[0]?.item || null;
}

function isActiveSOS(alert = {}) {
  return Boolean(alert?.id && sanitizeString(alert.status || 'active', 30) !== 'resolved');
}

function getCheckpointCollectionForShip(state = {}, ship = {}) {
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

function normalizeCheckpointNameKey(name) {
  return sanitizeString(name || '', 120).trim().toLowerCase();
}

function createShipCheckpointId(ship, checkpointName, index) {
  const slug = sanitizeString(checkpointName || '', 120)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '') || `checkpoint-${index + 1}`;
  return `${sanitizeString(ship?.id || ship?.name || 'ship', 120)}::${slug}::${index + 1}`;
}

function buildNormalizedCheckpointsForShip(state = {}, ship = {}) {
  const definitions = ensureArray(ship.customCheckpoints);
  if (definitions.length === 0) return getCheckpointCollectionForShip(state, ship);

  const rawCheckpoints = getCheckpointCollectionForShip(state, ship);
  const byId = new Map(rawCheckpoints.map((cp) => [sanitizeString(cp?.id || '', 200), cp]));
  const byName = new Map(rawCheckpoints.map((cp) => [normalizeCheckpointNameKey(cp?.name), cp]));

  return definitions.map((def, index) => {
    const expectedId = createShipCheckpointId(ship, def?.name, index);
    const nameKey = normalizeCheckpointNameKey(def?.name);
    const matched = byId.get(expectedId) || (nameKey ? byName.get(nameKey) : null);
    if (matched && matched.status === 'completed') return matched;
    return {
      id: expectedId,
      name: sanitizeString(def?.name || '', 80) || `Checkpoint ${index + 1}`,
      status: matched?.status || 'pending',
      resultType: matched?.resultType || null,
      isTemporaryShiftNode: false,
    };
  });
}

function summarizeCheckpointCollection(checkpoints = [], options = {}) {
  const { treatIncompleteAsMissed = false } = options;
  return ensureArray(checkpoints).reduce((summary, checkpoint) => {
    const status = sanitizeString(checkpoint?.status || '', 30).toLowerCase();
    const resultType = sanitizeString(checkpoint?.resultType || '', 30).toLowerCase();
    const isCompleted = status === 'completed' || Boolean(resultType && resultType !== 'pending');
    const isExplicitMissed = status === 'missed' || resultType === 'missed';
    const isMissed = isExplicitMissed || (treatIncompleteAsMissed && !isCompleted);
    const isTemporary = Boolean(checkpoint?.isTemporaryShiftNode);

    if (isTemporary) return summary;
    summary.total += 1;
    if (isCompleted) summary.completed += 1;
    if (resultType === 'aman') summary.aman += 1;
    if (resultType === 'temuan') summary.temuan += 1;
    if (isMissed) summary.missed += 1;
    return summary;
  }, {
    total: 0,
    completed: 0,
    aman: 0,
    temuan: 0,
    missed: 0,
  });
}

function countPendingCheckpoints(checkpoints = []) {
  const summary = summarizeCheckpointCollection(checkpoints);
  return Math.max(0, summary.total - summary.completed);
}

function createMissedCheckpointServer(checkpoint = {}, shiftMeta = {}) {
  return {
    id: checkpoint.id,
    name: checkpoint.name,
    status: 'missed',
    resultType: 'missed',
    completedBy: '-',
    time: '-',
    shiftKey: shiftMeta.key || null,
    shipName: checkpoint.shipName || '',
    photoUrl: null,
    penyebab: '',
    kejadian: 'Titik ini tidak dipatroli pada shift dan tanggal tersebut.',
    tindakLanjut: 'Masuk status missed pada akhir shift.',
  };
}

function buildHistoryEntryServer({ shiftMeta = {}, checkpoints = [], ship = {} } = {}) {
  const safeShipKey = sanitizeString(ship?.id || ship?.name || 'ship', 120);
  const historyKey = `${safeShipKey}|${shiftMeta.key || ''}`;
  const historyId = `history-${historyKey}`;
  const snapshotCheckpoints = ensureArray(checkpoints).map((cp) => {
    const safeCheckpoint = ensureObject(cp);
    if (safeCheckpoint.status === 'completed') {
      return { ...safeCheckpoint, readOnly: true, historyId };
    }
    return {
      ...createMissedCheckpointServer(safeCheckpoint, shiftMeta),
      readOnly: true,
      historyId,
      shipName: ship?.name || safeCheckpoint.shipName || '',
    };
  });
  const summary = summarizeCheckpointCollection(snapshotCheckpoints);
  const shipName = normalizeShipName(ship?.name || ship?.id || 'Belum Ada Kapal');
  const createdAtIso = shiftMeta.endAt instanceof Date && !Number.isNaN(shiftMeta.endAt.getTime())
    ? shiftMeta.endAt.toISOString()
    : new Date().toISOString();
  return {
    id: historyId,
    key: historyKey,
    dateKey: shiftMeta.dateKey || '',
    shift: shiftMeta.label || '',
    shiftId: shiftMeta.id || '',
    time: formatShiftTimeRange(shiftMeta),
    ship: shipName,
    shipSnapshot: ship && (ship.id || ship.name)
      ? {
          id: ship.id || null,
          name: ship.name || '',
          lat: ship.lat ?? null,
          lng: ship.lng ?? null,
        }
      : null,
    checkpoints: snapshotCheckpoints,
    summary,
    points: summary.total,
    issue: summary.temuan,
    missed: summary.missed,
    createdAt: createdAtIso,
    createdBy: 'system-cloud-function',
  };
}

function getJakartaParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: APP_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(date);
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const hour = Number(map.hour || '0');
  return {
    year: Number(map.year || '1970'),
    month: Number(map.month || '1'),
    day: Number(map.day || '1'),
    hour: hour === 24 ? 0 : hour,
    minute: Number(map.minute || '0'),
    second: Number(map.second || '0'),
  };
}

function dateKeyFromParts(parts) {
  return `${String(parts.year).padStart(4, '0')}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
}

function addDaysToDateKey(dateKey, days) {
  const [year, month, day] = String(dateKey || '').split('-').map((part) => Number(part));
  const date = new Date(Date.UTC(year || 1970, (month || 1) - 1, day || 1, 12, 0, 0));
  date.setUTCDate(date.getUTCDate() + days);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

function createJakartaDate(dateKey, hour, minute) {
  const [year, month, day] = String(dateKey || '').split('-').map((part) => Number(part));
  return new Date(Date.UTC(year || 1970, (month || 1) - 1, day || 1, Number(hour || 0) - 7, Number(minute || 0), 0));
}

function getShiftScheduleTimesForDateKey(dateKey, shift) {
  const startDateKey = dateKey;
  const endDateKey = shift.crossesMidnight ? addDaysToDateKey(dateKey, 1) : dateKey;
  return {
    startAt: createJakartaDate(startDateKey, shift.startHour, shift.startMinute),
    endAt: createJakartaDate(endDateKey, shift.endHour, shift.endMinute),
  };
}

function createShiftMeta(dateKey, shift) {
  const schedule = getShiftScheduleTimesForDateKey(dateKey, shift);
  return {
    ...shift,
    dateKey,
    key: `${dateKey}-${shift.id}`,
    startAt: schedule.startAt,
    endAt: schedule.endAt,
  };
}

function getCurrentShiftMetaForDate(date = new Date()) {
  const parts = getJakartaParts(date);
  const dateKey = dateKeyFromParts(parts);
  const minutes = parts.hour * 60 + parts.minute;

  if (minutes < 6 * 60) {
    return createShiftMeta(addDaysToDateKey(dateKey, -1), SHIFT_SEQUENCE[2]);
  }
  if (minutes < 12 * 60) {
    return createShiftMeta(dateKey, SHIFT_SEQUENCE[0]);
  }
  if (minutes < 18 * 60) {
    return createShiftMeta(dateKey, SHIFT_SEQUENCE[1]);
  }
  return createShiftMeta(dateKey, SHIFT_SEQUENCE[2]);
}

function getPreviousShiftMeta(currentShift) {
  if (currentShift.id === SHIFT_SEQUENCE[0].id) {
    return createShiftMeta(addDaysToDateKey(currentShift.dateKey, -1), SHIFT_SEQUENCE[2]);
  }
  if (currentShift.id === SHIFT_SEQUENCE[1].id) {
    return createShiftMeta(currentShift.dateKey, SHIFT_SEQUENCE[0]);
  }
  return createShiftMeta(currentShift.dateKey, SHIFT_SEQUENCE[1]);
}

function minutesBetween(leftDate, rightDate) {
  return Math.floor((leftDate.getTime() - rightDate.getTime()) / 60000);
}

function getHistoryEntryForShift(state = {}, ship = {}, shiftMeta = {}) {
  const safeShipId = sanitizeString(ship.id || '', 120);
  const safeShipName = normalizeShipName(ship.name || '');
  const targetDateKey = sanitizeString(shiftMeta.dateKey || '', 120);
  const targetShiftId = sanitizeString(shiftMeta.id || '', 80);
  return ensureArray(state.historyEntries).find((entry) => {
    const entryDateKey = sanitizeString(entry?.dateKey || '', 120);
    const entryShiftId = sanitizeString(entry?.shiftId || '', 80);
    if (entryDateKey !== targetDateKey || entryShiftId !== targetShiftId) return false;
    const entryShipId = sanitizeString(entry?.shipSnapshot?.id || entry?.shipId || '', 120);
    if (safeShipId && entryShipId && entryShipId === safeShipId) return true;
    return normalizeShipName(entry?.ship || entry?.shipName || '') === safeShipName;
  });
}

function buildShipShiftSummary(state = {}, ship = {}, shiftMeta = {}) {
  const historyEntry = getHistoryEntryForShift(state, ship, shiftMeta);
  if (historyEntry) {
    return summarizeCheckpointCollection(ensureArray(historyEntry.checkpoints));
  }
  return null;
}

function buildAdminWrapUpSummary(state = {}, shiftMeta = {}) {
  const ships = ensureArray(state.shipsData).filter((ship) => ship?.name || ship?.id);
  if (!ships.length) return `${shiftMeta.label} sebelumnya sudah tersimpan.`;

  const segments = [];
  for (const ship of ships) {
    if (segments.length >= 5) break;
    const summary = buildShipShiftSummary(state, ship, shiftMeta);
    if (!summary) continue;
    const shipName = normalizeShipName(ship.name || ship.id || 'Kapal');
    segments.push(`${shipName}: ${summary.completed}/${summary.total}, temuan ${summary.temuan}, missed ${summary.missed}`);
  }
  if (!segments.length) return `${shiftMeta.label} sebelumnya sudah tersimpan.`;
  const moreCount = Math.max(0, ships.length - segments.length);
  return `${segments.join('; ')}${moreCount ? `; +${moreCount} kapal lain` : ''}`;
}

function formatShiftTimeRange(shiftMeta = {}) {
  const pad = (value) => String(Number(value || 0)).padStart(2, '0');
  return `${pad(shiftMeta.startHour)}:${pad(shiftMeta.startMinute)} - ${pad(shiftMeta.endHour)}:${pad(shiftMeta.endMinute)}`;
}

function buildAdminWrapUpDetailedSummary(state = {}, shiftMeta = {}) {
  const ships = ensureArray(state.shipsData).filter((ship) => ship?.name || ship?.id);
  const shiftLabel = sanitizeString(shiftMeta.label || 'Shift', 80).toUpperCase();
  const timeRange = formatShiftTimeRange(shiftMeta);
  const header = `📊 SUMMARY LAPORAN ${shiftLabel} (${timeRange}) 📊`;
  if (!ships.length) return `${header}\n\nBelum ada data kapal pada shift ini.`;

  const blocks = ships.reduce((acc, ship) => {
    const summary = buildShipShiftSummary(state, ship, shiftMeta);
    if (!summary) return acc;
    const shipName = normalizeShipName(ship.name || ship.id || 'Kapal');
    acc.push(`🚢 Kapal: ${shipName}\n✅ Aman: ${summary.aman}\n⚠️ Temuan: ${summary.temuan}\n❌ Missed: ${summary.missed}`);
    return acc;
  }, []);
  if (!blocks.length) return `${header}\n\nBelum ada data riwayat shift tersimpan untuk periode ini.`;
  return `${header}\n\n${blocks.join('\n\n')}`;
}

function buildAdminPendingCheckpointSummary(shipsWithPending = [], shiftMeta = {}) {
  const shiftLabel = sanitizeString(shiftMeta.label || 'Shift', 80);
  const timeRange = formatShiftTimeRange(shiftMeta);
  const lines = [`Sebelum ${shiftLabel} (${timeRange}) berakhir, masih ada checkpoint pending:`, ''];
  shipsWithPending.forEach(({ ship, pendingCount }) => {
    const shipName = normalizeShipName(ship.name || ship.id || 'Kapal');
    lines.push(`🚢 ${shipName}: ${pendingCount} belum dipatroli`);
  });
  const totalPending = shipsWithPending.reduce((sum, item) => sum + Number(item.pendingCount || 0), 0);
  lines.push('', `Total: ${totalPending} checkpoint di ${shipsWithPending.length} kapal.`);
  return lines.join('\n');
}

async function ensureHistoryEntriesForShift(shiftMeta = {}) {
  return await firestore.runTransaction(async (transaction) => {
    const ref = getSharedStateRef();
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists) return null;

    const data = snapshot.data() || {};
    const state = getSharedStatePayload(data);
    const ships = ensureArray(state.shipsData).filter((ship) => ship?.id || ship?.name);
    if (!ships.length) return state;

    const targetDateKey = sanitizeString(shiftMeta.dateKey || '', 120);
    const targetShiftId = sanitizeString(shiftMeta.id || '', 80);

    const haveForShipKey = new Set(
      ensureArray(state.historyEntries)
        .filter((entry) => (
          sanitizeString(entry?.dateKey || '', 120) === targetDateKey
          && sanitizeString(entry?.shiftId || '', 80) === targetShiftId
        ))
        .map((entry) => sanitizeString(
          entry?.shipSnapshot?.id || entry?.shipId || entry?.ship || entry?.shipName || '',
          200,
        ))
        .filter(Boolean),
    );

    const newEntries = [];
    for (const ship of ships) {
      const shipKey = sanitizeString(ship.id || ship.name || '', 200);
      if (!shipKey || haveForShipKey.has(shipKey)) continue;
      const checkpoints = buildNormalizedCheckpointsForShip(state, ship);
      newEntries.push(buildHistoryEntryServer({ shiftMeta, checkpoints, ship }));
    }
    if (newEntries.length === 0) return state;

    const mergedHistoryEntries = [
      ...ensureArray(state.historyEntries),
      ...newEntries,
    ];

    transaction.set(ref, {
      state: {
        ...state,
        historyEntries: mergedHistoryEntries,
      },
      clientUpdatedAt: new Date().toISOString(),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });

    return {
      ...state,
      historyEntries: mergedHistoryEntries,
    };
  });
}

export const registerPushToken = onCall(
  {
    region: TRUSTED_TIME_REGION,
    maxInstances: 20,
  },
  async (request) => {
    const userContext = await requireOperationalUser(request);
    const token = sanitizeString(request.data?.token || '', 4096);
    if (!token) {
      throw new HttpsError('invalid-argument', 'Token push Android wajib tersedia.');
    }

    const access = serializeOperationalAccess({
      ...userContext.access,
      uid: userContext.uid,
    });
    const tokenId = hashPushToken(token);
    const legacyUserId = sanitizeString(request.data?.legacyUserId || access.legacyUserId || '', 160);
    await firestore.collection(PUSH_TOKENS_COLLECTION).doc(tokenId).set({
      uid: userContext.uid,
      token,
      platform: sanitizeString(request.data?.platform || 'android', 30) || 'android',
      appId: sanitizeString(request.data?.appId || 'com.smartpatrol.app', 120) || 'com.smartpatrol.app',
      legacyUserId,
      role: normalizeRoleValue(request.data?.role || access.role || ''),
      shipAssigned: normalizeShipName(request.data?.shipAssigned || access.shipAssigned || ''),
      displayName: sanitizeString(request.data?.displayName || access.name || userContext.email || '', 100),
      enabled: true,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });

    return {
      status: 'registered',
      tokenId,
    };
  },
);

export const unregisterPushToken = onCall(
  {
    region: TRUSTED_TIME_REGION,
    maxInstances: 20,
  },
  async (request) => {
    await requireOperationalUser(request);
    const token = sanitizeString(request.data?.token || '', 4096);
    if (!token) {
      throw new HttpsError('invalid-argument', 'Token push Android wajib tersedia.');
    }

    const tokenId = hashPushToken(token);
    await firestore.collection(PUSH_TOKENS_COLLECTION).doc(tokenId).set({
      enabled: false,
      disabledAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });

    return {
      status: 'unregistered',
      tokenId,
    };
  },
);

export const notifyOnPatrolReportWrite = onDocumentWritten(
  {
    region: TRUSTED_TIME_REGION,
    document: 'patrolReports/{shiftKey}/ships/{shipId}/checkpoints/{checkpointId}',
    maxInstances: 20,
  },
  async (event) => {
    const afterSnapshot = event.data?.after;
    if (!afterSnapshot?.exists) return;
    const before = event.data?.before?.exists ? event.data.before.data() || {} : {};
    const after = afterSnapshot.data() || {};
    const wasFinding = sanitizeString(before.resultType || '', 30).toLowerCase() === 'temuan';
    const isFinding = sanitizeString(after.resultType || '', 30).toLowerCase() === 'temuan';
    if (!isFinding || wasFinding) return;

    const sharedStateSnapshot = await getSharedStateRef().get();
    const sharedState = sharedStateSnapshot.exists ? getSharedStatePayload(sharedStateSnapshot.data()) : {};
    const shipName = normalizeShipName(after.shipName || resolveShipNameFromState(sharedState, event.params.shipId));
    const checkpointName = sanitizeString(after.name || after.checkpointName || event.params.checkpointId, 100);
    const incidentId = sanitizeString(after.incidentId || `patrol-${event.params.shiftKey}-${event.params.shipId}-${event.params.checkpointId}`, 180);
    const dedupeKey = `patrol-finding:${event.params.shiftKey}:${event.params.shipId}:${event.params.checkpointId}:${incidentId}:${after.completedAt || after.occurredAtTrustedIso || ''}`;
    if (!await claimPushDedupe(dedupeKey)) return;

    const targets = await resolveAccessTargets({
      shipName,
      includeAdmins: true,
      includePic: true,
      includePetugas: true,
    });
    await sendPushToAccessRecords(targets, {
      type: 'incident_created',
      title: 'Temuan patroli baru',
      body: `${checkpointName} dilaporkan sebagai temuan di ${shipName || 'kapal patroli'}.`,
      route: 'incidents/detail',
      incidentId,
      shipName,
      shiftKey: sanitizeString(event.params.shiftKey || '', 120),
      checkpointId: sanitizeString(event.params.checkpointId || '', 120),
      dedupeKey,
      tag: `finding-${incidentId}`,
    });
  },
);

export const notifyOnIncidentReportWrite = onDocumentWritten(
  {
    region: TRUSTED_TIME_REGION,
    document: 'incidents/{incidentId}',
    maxInstances: 20,
  },
  async (event) => {
    const afterSnapshot = event.data?.after;
    if (!afterSnapshot?.exists) return;

    const before = event.data?.before?.exists ? event.data.before.data() || {} : {};
    const after = afterSnapshot.data() || {};
    const beforeProgress = getDomainIncidentProgressItems(before);
    const afterProgress = getDomainIncidentProgressItems(after);
    if (afterProgress.length <= beforeProgress.length) return;

    const safeIncidentId = sanitizeString(after.id || after.incidentId || event.params.incidentId || '', 180);
    if (!safeIncidentId) return;

    const latestProgress = getLatestProgressItem(afterProgress);
    const progressId = sanitizeString(latestProgress?.id || latestProgress?.createdAt || `${afterProgress.length}`, 180);
    if (!progressId || !await claimPushDedupe(`incident-progress:${safeIncidentId}:${progressId}`)) return;

    const shipName = getIncidentShipName(after, {});
    const targets = await resolveAccessTargets({
      shipName,
      targetUserIds: getIncidentTargetUserIds(after),
      includeAdmins: true,
      includePic: true,
      includePetugas: true,
    });

    await sendPushToAccessRecords(targets, {
      type: 'incident_progress_updated',
      title: 'Update temuan',
      body: `${getIncidentLabel(after)} mendapat update baru dari ${sanitizeString(latestProgress?.author || 'petugas', 80)}.`,
      route: 'incidents/detail',
      incidentId: safeIncidentId,
      shipName,
      dedupeKey: `incident-progress:${safeIncidentId}:${progressId}`,
      tag: `incident-progress-${safeIncidentId}`,
    });
  },
);

export const notifyOnSharedStateWrite = onDocumentWritten(
  {
    region: TRUSTED_TIME_REGION,
    document: `${SHARED_STATE_COLLECTION}/${SHARED_STATE_DOCUMENT}`,
    maxInstances: 10,
  },
  async (event) => {
    const beforeSnapshot = event.data?.before;
    const afterSnapshot = event.data?.after;
    if (!beforeSnapshot?.exists || !afterSnapshot?.exists) return;

    const beforeState = getSharedStatePayload(beforeSnapshot.data() || {});
    const afterState = getSharedStatePayload(afterSnapshot.data() || {});
    const pushJobs = [];

    const beforeSOS = beforeState.activeSOSAlert || null;
    const afterSOS = afterState.activeSOSAlert || null;
    if (isActiveSOS(afterSOS) && beforeSOS?.id !== afterSOS.id) {
      pushJobs.push(async () => {
        const sosId = sanitizeString(afterSOS.id || '', 180);
        if (!await claimPushDedupe(`sos:${sosId}`)) return;
        const shipName = normalizeShipName(afterSOS.shipName || '');
        const targets = await resolveAccessTargets({
          shipName,
          targetUserIds: getIncidentTargetUserIds(afterSOS),
          includeAdmins: true,
          includePic: true,
          includePetugas: true,
        });
        await sendPushToAccessRecords(targets, {
          type: 'sos',
          title: 'DARURAT SOS',
          body: `SOS dari ${sanitizeString(afterSOS.senderName || 'petugas', 80)} di ${shipName || 'kapal patroli'}.`,
          channelId: PUSH_SOS_CHANNEL_ID,
          route: 'sos/active',
          incidentId: sosId,
          sosId,
          shipName,
          senderName: sanitizeString(afterSOS.senderName || 'SmartPatrol', 80),
          senderRole: sanitizeString(afterSOS.senderRole || 'SYSTEM', 40),
          tag: `sos-${sosId}`,
          data: {
            createdAt: sanitizeString(afterSOS.createdAt || afterSOS.triggeredAt || '', 80),
            lat: afterSOS.lat ?? '',
            lng: afterSOS.lng ?? '',
          },
        });
      });
    }

    const beforeIncidentIds = new Set(ensureArray(beforeState.incidentsData).map((incident) => sanitizeString(incident?.id || incident?.incidentId || '', 180)));
    ensureArray(afterState.incidentsData).forEach((incident) => {
      const incidentId = sanitizeString(incident?.id || incident?.incidentId || '', 180);
      if (!incidentId || beforeIncidentIds.has(incidentId) || afterSOS?.id === incidentId) return;
      pushJobs.push(async () => {
        if (!await claimPushDedupe(`manual-incident:${incidentId}`)) return;
        const shipName = getIncidentShipName(incident, afterState);
        const targets = await resolveAccessTargets({
          shipName,
          targetUserIds: getIncidentTargetUserIds(incident),
          includeAdmins: true,
          includePic: true,
          includePetugas: true,
        });
        await sendPushToAccessRecords(targets, {
          type: 'incident_created',
          title: 'Temuan baru',
          body: `${getIncidentLabel(incident)} dilaporkan di ${shipName || 'area patroli'}.`,
          route: 'incidents/detail',
          incidentId,
          shipName,
          dedupeKey: `manual-incident:${incidentId}`,
          tag: `incident-${incidentId}`,
        });
      });
    });

    Object.entries(ensureObject(afterState.incidentMeta)).forEach(([incidentId, afterMeta]) => {
      const safeIncidentId = sanitizeString(incidentId || '', 180);
      if (!safeIncidentId) return;
      const beforeProgress = getProgressItems(beforeState.incidentMeta?.[safeIncidentId]);
      const afterProgress = getProgressItems(afterMeta);
      if (afterProgress.length <= beforeProgress.length) return;
      const latestProgress = afterProgress[afterProgress.length - 1] || {};
      const progressId = sanitizeString(latestProgress.id || latestProgress.createdAt || `${afterProgress.length}`, 180);
      pushJobs.push(async () => {
        if (!await claimPushDedupe(`incident-progress:${safeIncidentId}:${progressId}`)) return;
        const incident = resolveIncidentFromState(afterState, safeIncidentId) || { id: safeIncidentId };
        const shipName = getIncidentShipName(incident, afterState);
        const targets = await resolveAccessTargets({
          shipName,
          targetUserIds: getIncidentTargetUserIds(incident),
          includeAdmins: true,
          includePic: true,
          includePetugas: true,
        });
        await sendPushToAccessRecords(targets, {
          type: 'incident_progress_updated',
          title: 'Update temuan',
          body: `${getIncidentLabel(incident)} mendapat update baru dari ${sanitizeString(latestProgress.author || 'petugas', 80)}.`,
          route: 'incidents/detail',
          incidentId: safeIncidentId,
          shipName,
          dedupeKey: `incident-progress:${safeIncidentId}:${progressId}`,
          tag: `incident-progress-${safeIncidentId}`,
        });
      });
    });

    for (const job of pushJobs.slice(0, 20)) {
      await job();
    }
  },
);

export const sendScheduledOperationalPushNotifications = onSchedule(
  {
    region: TRUSTED_TIME_REGION,
    schedule: 'every 5 minutes',
    timeZone: APP_TIME_ZONE,
    maxInstances: 1,
  },
  async () => {
    const now = new Date();
    const currentShift = getCurrentShiftMetaForDate(now);
    const previousShift = getPreviousShiftMeta(currentShift);
    const sharedStateSnapshot = await getSharedStateRef().get();
    if (!sharedStateSnapshot.exists) return;

    const state = getSharedStatePayload(sharedStateSnapshot.data() || {});
    const ships = ensureArray(state.shipsData).filter((ship) => ship?.id || ship?.name);
    const minutesAfterStart = minutesBetween(now, currentShift.startAt);
    const minutesBeforeEnd = minutesBetween(currentShift.endAt, now);

    if (minutesAfterStart >= 0 && minutesAfterStart <= 7) {
      for (const ship of ships) {
        const shipName = normalizeShipName(ship.name || ship.id || '');
        const dedupeKey = `shift-started:${currentShift.key}:${sanitizeString(ship.id || shipName, 120)}`;
        if (!await claimPushDedupe(dedupeKey)) continue;
        const targets = await resolveAccessTargets({
          shipName,
          includeAdmins: false,
          includePic: true,
          includePetugas: true,
        });
        await sendPushToAccessRecords(targets, {
          type: 'shift_started',
          title: `${currentShift.label} dimulai`,
          body: `Shift sebelumnya telah berakhir dan sudah tersimpan di riwayat. ${currentShift.label} baru telah dimulai.`,
          route: 'patrol/live',
          shipName,
          shiftKey: currentShift.key,
          tag: `shift-started-${currentShift.key}-${shipName}`,
        });
      }

      if (await claimPushDedupe(`admin-shift-wrap:${previousShift.key}`)) {
        // Server-side fallback: build history entries dari live checkpoints jika
        // client belum sempat sync (misal tidak ada user aktif saat transisi shift).
        const refreshedState = (await ensureHistoryEntriesForShift(previousShift)) || state;
        const adminTargets = await resolveAccessTargets({
          includeAdmins: true,
          includePic: false,
          includePetugas: false,
        });
        const shortSummary = buildAdminWrapUpSummary(refreshedState, previousShift);
        const detailedSummary = buildAdminWrapUpDetailedSummary(refreshedState, previousShift);
        await sendPushToAccessRecords(adminTargets, {
          type: 'shift_history_created',
          title: 'Summary Shift Wrap Up',
          body: shortSummary,
          route: 'history/list',
          shiftKey: previousShift.key,
          tag: `admin-summary-${previousShift.key}`,
        });
        await appendNotificationForAdminUsers({
          type: 'shift_history_created',
          title: 'Summary Shift Wrap Up',
          message: detailedSummary,
          senderName: 'Sistem',
          senderRole: 'SYSTEM',
          route: 'history/list',
          dedupeKey: `shift-summary:${previousShift.key}`,
        });
      }
    }

    // Notifikasi per-kapal: 1 jam sebelum shift berakhir, kirim reminder ke PIC/Petugas.
    if (minutesBeforeEnd >= 55 && minutesBeforeEnd <= 60) {
      const shipsWithPending = [];
      for (const ship of ships) {
        const checkpoints = buildNormalizedCheckpointsForShip(state, ship);
        const pendingCount = countPendingCheckpoints(checkpoints);
        if (pendingCount <= 0) continue;

        const shipName = normalizeShipName(ship.name || ship.id || '');
        const dedupeKey = `checkpoint-pending:${currentShift.key}:${sanitizeString(ship.id || shipName, 120)}`;
        if (!await claimPushDedupe(dedupeKey)) continue;
        const targets = await resolveAccessTargets({
          shipName,
          includeAdmins: false,
          includePic: true,
          includePetugas: true,
        });
        await sendPushToAccessRecords(targets, {
          type: 'checkpoint_pending',
          title: 'Pending checkpoint',
          body: `${pendingCount} checkpoint ${shipName || 'kapal'} belum selesai sebelum shift berakhir.`,
          route: 'patrol/live',
          shipName,
          shiftKey: currentShift.key,
          tag: `checkpoint-pending-${currentShift.key}-${shipName}`,
        });
        shipsWithPending.push({ ship, pendingCount });
      }

      if (shipsWithPending.length > 0) {
        if (await claimPushDedupe(`admin-checkpoint-pending:${currentShift.key}`)) {
          const adminTargets = await resolveAccessTargets({
            includeAdmins: true,
            includePic: false,
            includePetugas: false,
          });
          const detailedPendingSummary = buildAdminPendingCheckpointSummary(shipsWithPending, currentShift);
          const totalPending = shipsWithPending.reduce(
            (sum, item) => sum + Number(item.pendingCount || 0),
            0,
          );
          const shortPendingSummary = `${totalPending} checkpoint pending di ${shipsWithPending.length} kapal pada ${currentShift.label} yang akan segera berakhir.`;
          await sendPushToAccessRecords(adminTargets, {
            type: 'checkpoint_pending',
            title: 'Pending Checkpoint Summary',
            body: shortPendingSummary,
            route: 'patrol/live',
            shiftKey: currentShift.key,
            tag: `admin-pending-${currentShift.key}`,
          });
          await appendNotificationForAdminUsers({
            type: 'checkpoint_pending',
            title: 'Pending Checkpoint Summary',
            message: detailedPendingSummary,
            senderName: 'Sistem',
            senderRole: 'SYSTEM',
            route: 'patrol/live',
            dedupeKey: `admin-checkpoint-pending:${currentShift.key}`,
          });
        }
      }
    }

    await pruneStaleCheckpointsFromSharedState(ships);
  },
);

async function pruneStaleCheckpointsFromSharedState(ships = []) {
  const eligibleShips = ships.filter(
    (ship) => ensureArray(ship.customCheckpoints).length > 0,
  );
  if (eligibleShips.length === 0) return;

  await firestore.runTransaction(async (transaction) => {
    const ref = getSharedStateRef();
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists) return;

    const data = snapshot.data() || {};
    const state = ensureObject(data.state);
    const checkpointsByShip = ensureObject(state.checkpointsByShip);
    let didPrune = false;
    const pruned = { ...checkpointsByShip };

    for (const ship of eligibleShips) {
      const definitions = ensureArray(ship.customCheckpoints);
      const candidates = [ship.id, ship.name, sanitizeStorageSegment(ship.name || '', '')]
        .map((k) => sanitizeString(k || '', 120)).filter(Boolean);

      for (const key of candidates) {
        if (!Array.isArray(pruned[key])) continue;
        if (pruned[key].length <= definitions.length) break;
        pruned[key] = buildNormalizedCheckpointsForShip({ checkpointsByShip: pruned }, ship);
        didPrune = true;
        break;
      }
    }

    if (!didPrune) return;

    transaction.set(ref, {
      state: { ...state, checkpointsByShip: pruned },
      updatedAt: FieldValue.serverTimestamp(),
      clientUpdatedAt: Date.now(),
    }, { merge: true });
  });
}

export const getServerTime = onRequest(
  {
    region: TRUSTED_TIME_REGION,
    maxInstances: 5,
  },
  (request, response) => {
    applySecurityHeaders(request, response);

    if (request.method === 'OPTIONS') {
      response.status(204).send('');
      return;
    }

    if (request.method !== 'GET') {
      response.status(405).json({
        error: 'Method not allowed',
      });
      return;
    }

    const serverNowMs = Date.now();

    response.status(200).json({
      serverNowMs,
      issuedAt: new Date(serverNowMs).toISOString(),
      source: 'firebase-functions',
      timezone: 'UTC',
    });
  },
);

export const uploadOperationalAsset = onCall(
  {
    region: TRUSTED_TIME_REGION,
    maxInstances: 20,
  },
  async (request) => {
    await requireOperationalUser(request);

    const dataUrl = sanitizeString(request.data?.dataUrl || '', 8_500_000);
    const path = sanitizeOperationalAssetPath(request.data?.path || '');
    const { buffer, contentType } = decodeDataUrlAsset(dataUrl);
    const bucket = adminStorage.bucket();
    const file = bucket.file(path);
    const downloadToken = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

    await file.save(buffer, {
      resumable: false,
      validation: false,
      metadata: {
        contentType,
        cacheControl: 'public,max-age=31536000,immutable',
        metadata: {
          firebaseStorageDownloadTokens: downloadToken,
        },
      },
    });

    return {
      path,
      bucket: bucket.name,
      downloadUrl: buildTokenDownloadUrl(bucket.name, path, downloadToken),
    };
  },
);

export const notifyAdminsOnPendingRegistrationCreate = onDocumentCreated(
  {
    region: TRUSTED_TIME_REGION,
    document: `${PENDING_REGISTRATIONS_COLLECTION}/{uid}`,
    maxInstances: 10,
  },
  async (event) => {
    const pending = buildPendingRegistrationPayload(event.data?.data() || {});
    if (!pending.uid || !pending.email) return;

    await appendNotificationForAdminUsers({
      type: 'registration_pending',
      title: 'Registrasi user baru',
      message: `${pending.name} (${pending.email}) baru saja registrasi dan menunggu approval admin.`,
      senderName: 'Onboarding SmartPatrol',
      senderRole: 'SYSTEM',
      route: 'users/list',
      routeParams: {
        pendingUid: pending.uid,
      },
      dedupeKey: `pending-registration:${pending.uid}`,
    });
  },
);

export const resolveOperationalAccess = onCall(
  {
    region: TRUSTED_TIME_REGION,
    maxInstances: 20,
  },
  async (request) => {
    const authContext = assertAuthenticated(request);
    const accessSnapshot = await getUserAccessRef(authContext.uid).get();
    if (accessSnapshot.exists) {
      const access = serializeOperationalAccess(accessSnapshot.data() || {});
      return {
        status: access.enabled ? 'approved' : 'restricted',
        access,
      };
    }

    const pendingSnapshot = await getPendingRegistrationRef(authContext.uid).get();
    if (pendingSnapshot.exists) {
      return {
        status: serializePendingRegistration(pendingSnapshot.data() || {}).status || 'pending',
        pending: serializePendingRegistration(pendingSnapshot.data() || {}),
      };
    }

    const sharedUser = await findOperationalUserInSharedState(authContext);
    if (!sharedUser) {
      return {
        status: 'not-found',
      };
    }

    const accessRecord = await upsertOperationalAccess(authContext.uid, {
      ...sharedUser,
      email: authContext.email || sharedUser.email,
      legacyUserId: sanitizeString(sharedUser.id || '', 160),
    }, {
      reviewedBy: authContext.uid,
      reviewState: 'approved',
      source: 'legacy-binding',
    });

    return {
      status: accessRecord.enabled ? 'approved' : 'restricted',
      access: serializeOperationalAccess(accessRecord),
      profile: serializeOperationalProfile({
        ...sharedUser,
        firebaseUid: authContext.uid,
        email: authContext.email || sharedUser.email,
      }),
    };
  },
);

export const syncOperationalUserAccess = onCall(
  {
    region: TRUSTED_TIME_REGION,
    maxInstances: 20,
  },
  async (request) => {
    const adminContext = await requireAdminUser(request);
    const payload = buildOperationalAccessPayload(request.data || {});
    if (!payload.uid || !payload.email) {
      throw new HttpsError('invalid-argument', 'UID dan email user operasional wajib diisi.');
    }

    const accessRecord = await upsertOperationalAccess(payload.uid, payload, {
      reviewedBy: adminContext.uid,
      reviewState: payload.reviewState || 'approved',
      source: 'admin-sync',
    });

    return {
      status: accessRecord.enabled ? 'approved' : 'restricted',
      access: serializeOperationalAccess(accessRecord),
    };
  },
);

export const approvePendingRegistration = onCall(
  {
    region: TRUSTED_TIME_REGION,
    maxInstances: 20,
  },
  async (request) => {
    const adminContext = await requireAdminUser(request);
    const uid = sanitizeString(request.data?.uid || '', 160);
    if (!uid) {
      throw new HttpsError('invalid-argument', 'UID registrasi pending wajib diisi.');
    }

    const pendingSnapshot = await getPendingRegistrationRef(uid).get();
    if (!pendingSnapshot.exists) {
      throw new HttpsError('not-found', 'Registrasi pending tidak ditemukan.');
    }

    const pending = buildPendingRegistrationPayload(pendingSnapshot.data() || {});
    const role = sanitizeString(request.data?.role || ACCESS_ROLES.PETUGAS, 20).toUpperCase() || ACCESS_ROLES.PETUGAS;
    const shipAssigned = sanitizeString(request.data?.shipAssigned || '', 80);
    const status = sanitizeString(request.data?.status || 'off-duty', 20).toLowerCase() || 'off-duty';
    const type = sanitizeString(request.data?.type || pending.type || 'BUJP', 20) || 'BUJP';
    const workerNumber = sanitizeString(request.data?.workerNumber || pending.workerNumber || '', 40);

    const accessRecord = await upsertOperationalAccess(uid, {
      uid,
      email: pending.email,
      name: pending.name,
      phone: pending.phone,
      type,
      workerNumber,
      role,
      status,
      shipAssigned,
      source: 'admin-approval',
      reviewState: 'approved',
    }, {
      reviewedBy: adminContext.uid,
      reviewState: 'approved',
      source: 'admin-approval',
    });

    await markPendingRegistration(uid, {
      status: 'approved',
      reviewedBy: adminContext.uid,
      reviewedAt: FieldValue.serverTimestamp(),
      reviewNote: sanitizeString(request.data?.reviewNote || '', 240),
    });

    return {
      status: 'approved',
      access: serializeOperationalAccess(accessRecord),
      pending: serializePendingRegistration({
        ...pendingSnapshot.data(),
        status: 'approved',
        reviewedBy: adminContext.uid,
      }),
    };
  },
);

export const rejectPendingRegistration = onCall(
  {
    region: TRUSTED_TIME_REGION,
    maxInstances: 20,
  },
  async (request) => {
    const adminContext = await requireAdminUser(request);
    const uid = sanitizeString(request.data?.uid || '', 160);
    if (!uid) {
      throw new HttpsError('invalid-argument', 'UID registrasi pending wajib diisi.');
    }

    const pendingSnapshot = await getPendingRegistrationRef(uid).get();
    if (!pendingSnapshot.exists) {
      throw new HttpsError('not-found', 'Registrasi pending tidak ditemukan.');
    }

    await markPendingRegistration(uid, {
      status: 'rejected',
      reviewedBy: adminContext.uid,
      reviewedAt: FieldValue.serverTimestamp(),
      reviewNote: sanitizeString(request.data?.reviewNote || '', 240),
    });

    try {
      await adminAuth.setCustomUserClaims(uid, {
        smartpatrolOperational: false,
        smartpatrolRole: 'NONE',
        smartpatrolStatus: 'rejected',
        smartpatrolShipAssigned: '',
      });
    } catch {
      // Akun Firebase Auth bisa saja sudah dihapus; penolakan registrasi tetap dilanjutkan.
    }

    return {
      status: 'rejected',
      pending: serializePendingRegistration({
        ...pendingSnapshot.data(),
        status: 'rejected',
        reviewedBy: adminContext.uid,
        reviewNote: sanitizeString(request.data?.reviewNote || '', 240),
      }),
    };
  },
);

export const revokeOperationalUserAccess = onCall(
  {
    region: TRUSTED_TIME_REGION,
    maxInstances: 20,
  },
  async (request) => {
    const adminContext = await requireAdminUser(request);
    const uid = sanitizeString(request.data?.uid || '', 160);
    if (!uid) {
      throw new HttpsError('invalid-argument', 'UID akses operasional wajib diisi.');
    }

    const existingSnapshot = await getUserAccessRef(uid).get();
    const existingData = existingSnapshot.exists ? existingSnapshot.data() || {} : {};
    const revokedRecord = {
      ...existingData,
      uid,
      enabled: false,
      status: 'disabled',
      reviewState: 'revoked',
      approvedBy: adminContext.uid,
      reviewedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    };

    await getUserAccessRef(uid).set(revokedRecord, { merge: true });
    await adminAuth.setCustomUserClaims(uid, {
      smartpatrolOperational: false,
      smartpatrolRole: 'NONE',
      smartpatrolStatus: 'disabled',
      smartpatrolShipAssigned: '',
    });

    return {
      status: 'revoked',
      access: serializeOperationalAccess({
        ...existingData,
        enabled: false,
        status: 'disabled',
        reviewState: 'revoked',
        approvedBy: adminContext.uid,
      }),
    };
  },
);

export { telegramWebhook, onCheckpointReportCreated, onSharedStateUpdated } from './telegramAI.js';
