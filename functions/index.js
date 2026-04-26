/*
Tujuan: Menyediakan trusted server time, kontrol akses operasional, dan notifikasi onboarding admin lewat Cloud Functions.
Caller: Client web untuk sinkronisasi waktu, binding akun Firebase Auth, approval onboarding, sinkronisasi akses admin, dan trigger Firestore registrasi baru.
Dependensi: Firebase Functions v2, Firebase Admin SDK, dan model sanitasi security lokal.
Main Functions: getServerTime, resolveOperationalAccess, syncOperationalUserAccess, approvePendingRegistration, rejectPendingRegistration, revokeOperationalUserAccess, notifyAdminsOnPendingRegistrationCreate.
Side Effects: Membaca/menulis Firestore pendingRegistrations, userAccess, shared-state.notifications, memperbarui custom claims Firebase Auth, dan mengembalikan trusted server time.
*/

import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { HttpsError, onCall, onRequest } from 'firebase-functions/v2/https';
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
const MAX_NOTIFICATION_ITEMS = 250;

const firestore = getFirestore();
const adminAuth = getAuth();
const adminStorage = getStorage();

function sanitizeString(value, maxLength = 160) {
  if (typeof value !== 'string') return '';
  return value
    .replace(/[\u0000-\u001f\u007f<>]/g, ' ')
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
      message: sanitizeString(notification.message || '', 240),
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

export { telegramWebhook, onCheckpointReportCreated } from './telegramAI.js';
