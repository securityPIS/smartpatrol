/*
Tujuan: Menyediakan jalur onboarding terisolasi dan sinkronisasi akses operasional berbasis Firebase.
Caller: AppContextRuntime untuk login/register, approval admin, dan daftar onboarding pending.
Dependensi: Firebase Firestore/Functions/Storage, IndexedDB image store, dan utilitas sanitasi.
Main Functions: Membuat pending registration, upload aset registrasi, resolve binding operasional, dan approval/revoke akses.
Side Effects: Menulis koleksi pendingRegistrations dan userAccess, memanggil Cloud Functions callable, serta upload aset ke Firebase Storage.
*/

import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { getDownloadURL, ref, uploadString } from 'firebase/storage';
import { loadImageFromDB } from '../../utils/imageStore';
import { sanitizeEmail, sanitizePhone, sanitizeText, sanitizeUrl } from '../../utils/sanitize';
import {
  firebaseDb,
  firebaseFunctions,
  firebaseStorage,
} from './app';

const PENDING_REGISTRATIONS_COLLECTION = 'pendingRegistrations';
const USER_ACCESS_COLLECTION = 'userAccess';

function sanitizeStorageSegment(value, fallback = 'item') {
  return sanitizeText(String(value || ''), 120)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/(^-|-$)/g, '') || fallback;
}

function mapPendingRegistrationSnapshot(snapshot) {
  const data = snapshot?.data() || {};
  return {
    id: snapshot?.id || '',
    uid: sanitizeText(data.uid || snapshot?.id || '', 160) || '',
    email: sanitizeEmail(data.email || ''),
    name: sanitizeText(data.name || '', 80) || 'User Pending',
    phone: sanitizePhone(data.phone || ''),
    photoUrl: sanitizeUrl(data.photoUrl || '') || '',
    photoPath: sanitizeText(data.photoPath || '', 240) || '',
    type: sanitizeText(data.type || 'BUJP', 20) || 'BUJP',
    workerNumber: sanitizeText(data.workerNumber || '', 40) || '',
    status: sanitizeText(data.status || 'pending', 20).toLowerCase() || 'pending',
    createdAt: data.createdAt || null,
    updatedAt: data.updatedAt || null,
    reviewedAt: data.reviewedAt || null,
    reviewedBy: sanitizeText(data.reviewedBy || '', 160) || '',
    reviewNote: sanitizeText(data.reviewNote || '', 240) || '',
  };
}

function getCallable(name) {
  if (!firebaseFunctions) {
    throw new Error('firebase-functions-not-configured');
  }

  return httpsCallable(firebaseFunctions, name);
}

async function invokeCallable(name, payload = {}) {
  const callable = getCallable(name);
  const response = await callable(payload);
  return response?.data || null;
}

async function resolveLocalImageDataUrl(photoUrl) {
  if (!photoUrl || typeof photoUrl !== 'string') return null;
  if (photoUrl.startsWith('data:')) return photoUrl;
  if (photoUrl.startsWith('idb://')) {
    return loadImageFromDB(photoUrl);
  }
  return null;
}

export function buildRegistrationAssetPath(uid, ...segments) {
  return [
    'registration-assets',
    sanitizeStorageSegment(uid, 'anonymous'),
    ...segments.map((segment, index) => sanitizeStorageSegment(segment, `part-${index + 1}`)),
  ].join('/');
}

export async function uploadRegistrationPhotoAsset({ uid, photoUrl }) {
  if (!firebaseStorage || !uid || !photoUrl) {
    return {
      photoUrl: sanitizeUrl(photoUrl || '') || '',
      photoPath: '',
    };
  }

  const dataUrl = await resolveLocalImageDataUrl(photoUrl);
  if (!dataUrl) {
    return {
      photoUrl: sanitizeUrl(photoUrl || '') || '',
      photoPath: '',
    };
  }

  const photoPath = buildRegistrationAssetPath(uid, 'profile', `avatar-${Date.now()}`);
  const storageRef = ref(firebaseStorage, photoPath);
  await uploadString(storageRef, dataUrl, 'data_url');

  return {
    photoUrl: await getDownloadURL(storageRef),
    photoPath,
  };
}

export async function createPendingRegistration(registration) {
  if (!firebaseDb) {
    throw new Error('firebase-firestore-not-configured');
  }

  const uid = sanitizeText(registration?.uid || '', 160);
  if (!uid) {
    throw new Error('pending-registration-uid-required');
  }

  const payload = {
    uid,
    email: sanitizeEmail(registration?.email || ''),
    name: sanitizeText(registration?.name || '', 80) || 'User Baru',
    phone: sanitizePhone(registration?.phone || ''),
    photoUrl: sanitizeUrl(registration?.photoUrl || '') || '',
    photoPath: sanitizeText(registration?.photoPath || '', 240) || '',
    type: sanitizeText(registration?.type || 'BUJP', 20) || 'BUJP',
    workerNumber: sanitizeText(registration?.workerNumber || '', 40) || '',
    status: 'pending',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    reviewedAt: null,
    reviewedBy: '',
    reviewNote: '',
  };

  await setDoc(
    doc(firebaseDb, PENDING_REGISTRATIONS_COLLECTION, uid),
    payload,
    { merge: true },
  );

  return payload;
}

export function subscribeToPendingRegistrations(callback, onError) {
  if (!firebaseDb) return () => {};

  const pendingQuery = query(
    collection(firebaseDb, PENDING_REGISTRATIONS_COLLECTION),
    orderBy('createdAt', 'desc'),
  );

  return onSnapshot(
    pendingQuery,
    (snapshot) => {
      callback(snapshot.docs.map(mapPendingRegistrationSnapshot));
    },
    onError,
  );
}

export async function resolveOperationalAccess() {
  return invokeCallable('resolveOperationalAccess');
}

export async function syncOperationalUserAccess(payload) {
  return invokeCallable('syncOperationalUserAccess', payload);
}

export async function approvePendingRegistration(payload) {
  return invokeCallable('approvePendingRegistration', payload);
}

export async function rejectPendingRegistration(payload) {
  return invokeCallable('rejectPendingRegistration', payload);
}

export async function revokeOperationalUserAccess(payload) {
  return invokeCallable('revokeOperationalUserAccess', payload);
}

export {
  PENDING_REGISTRATIONS_COLLECTION,
  USER_ACCESS_COLLECTION,
};
