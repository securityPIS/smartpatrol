/*
Tujuan: Menyediakan adapter sinkronisasi cloud SmartPatrol untuk shared state, sinyal realtime ringan, dan upload aset operasional.
Caller: AppContextRuntime dan service Firebase lain yang perlu baca/tulis state operasional.
Dependensi: Firebase Firestore, Functions, Storage, dan singleton app Firebase client.
Main Functions: Subscribe snapshot shared-state, publish sinyal sinkronisasi kecil, simpan state cloud, dan upload aset patroli.
Side Effects: Membaca/menulis dokumen Firestore `smartpatrol/*`, memanggil callable upload aset, dan mengunggah blob ke Storage.
*/

import {
  doc,
  getDoc,
  getDocFromServer,
  onSnapshot,
  runTransaction,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { getDownloadURL, ref, uploadString } from 'firebase/storage';
import { firebaseDb, firebaseFunctions, firebaseStorage } from './app';

const CLOUD_STATE_COLLECTION = 'smartpatrol';
const CLOUD_STATE_DOCUMENT = 'shared-state';
const CLOUD_SIGNAL_DOCUMENT = 'shared-signal';
const CLOUD_STATE_SCHEMA_VERSION = 1;
const isCloudSyncAllowedByEnv = import.meta.env.VITE_ENABLE_CLOUD_SYNC !== '0';
const isCloudWriteAllowedByEnv = import.meta.env.VITE_ENABLE_CLOUD_SYNC_WRITE !== '0';

const cloudStateRef = firebaseDb
  ? doc(firebaseDb, CLOUD_STATE_COLLECTION, CLOUD_STATE_DOCUMENT)
  : null;
const cloudSignalRef = firebaseDb
  ? doc(firebaseDb, CLOUD_STATE_COLLECTION, CLOUD_SIGNAL_DOCUMENT)
  : null;

const isCloudSyncEnabled = Boolean(firebaseDb) && isCloudSyncAllowedByEnv;
const isCloudWriteEnabled = isCloudSyncEnabled && isCloudWriteAllowedByEnv;

export function subscribeToCloudAppState(callback, onError) {
  if (!cloudStateRef) return () => {};

  return onSnapshot(
    cloudStateRef,
    (snapshot) => {
      if (!snapshot.exists()) {
        callback(null);
        return;
      }

      callback(snapshot.data());
    },
    onError,
  );
}

export function subscribeToCloudSyncSignal(callback, onError) {
  if (!cloudSignalRef) return () => {};

  return onSnapshot(
    cloudSignalRef,
    (snapshot) => {
      if (!snapshot.exists()) {
        callback(null);
        return;
      }

      callback(snapshot.data());
    },
    onError,
  );
}

export async function fetchCloudAppState(options = {}) {
  const { preferServer = true } = options;

  if (!cloudStateRef) return null;

  const readSnapshot = async (reader) => {
    const snapshot = await reader(cloudStateRef);
    if (!snapshot.exists()) return null;
    return snapshot.data();
  };

  if (!preferServer) {
    return readSnapshot(getDoc);
  }

  try {
    return await readSnapshot(getDocFromServer);
  } catch {
    return readSnapshot(getDoc);
  }
}

export async function saveCloudAppState(state, options = {}) {
  const { mergeState, clientUpdatedAt = Date.now() } = options;
  if (!cloudStateRef || !isCloudWriteEnabled) return state;

  if (typeof mergeState === 'function') {
    let resolvedState = state;

    await runTransaction(firebaseDb, async (transaction) => {
      const snapshot = await transaction.get(cloudStateRef);
      const currentState = snapshot.exists() ? snapshot.data()?.state || null : null;
      resolvedState = mergeState(currentState, state);

      transaction.set(cloudStateRef, {
        schemaVersion: CLOUD_STATE_SCHEMA_VERSION,
        clientUpdatedAt,
        updatedAt: serverTimestamp(),
        state: resolvedState,
      });
    });

    return resolvedState;
  }

  await setDoc(cloudStateRef, {
    schemaVersion: CLOUD_STATE_SCHEMA_VERSION,
    clientUpdatedAt,
    updatedAt: serverTimestamp(),
    state,
  });

  return state;
}

export async function publishCloudSyncSignal(signal) {
  if (!cloudSignalRef || !isCloudWriteEnabled || !signal || typeof signal !== 'object') return null;

  const clientUpdatedAt = Number.isFinite(signal.clientUpdatedAt)
    ? signal.clientUpdatedAt
    : Date.now();

  await setDoc(cloudSignalRef, {
    schemaVersion: CLOUD_STATE_SCHEMA_VERSION,
    clientUpdatedAt,
    updatedAt: serverTimestamp(),
    signal: {
      ...signal,
      clientUpdatedAt,
    },
  });

  return signal;
}

async function uploadWithRetry(dataUrl, path, maxRetries = 3) {
  if (!firebaseStorage) return null;

  // Daftar delay retry: 1 detik, 3 detik, 7 detik
  const retryDelays = [1000, 3000, 7000];
  let lastError = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const storageRef = ref(firebaseStorage, path);
      await uploadString(storageRef, dataUrl, 'data_url');
      return getDownloadURL(storageRef);
    } catch (error) {
      lastError = error;
      if (attempt < maxRetries) {
        console.warn(
          `Upload aset gagal percobaan ke-${attempt + 1}/${maxRetries + 1}, retry dalam ${retryDelays[attempt] || 5000}ms...`,
          error,
        );
        await new Promise(resolve => setTimeout(resolve, retryDelays[attempt] || 5000));
      }
    }
  }

  throw lastError || new Error('Upload gagal setelah retry');
}

export async function uploadCloudDataUrlAsset({ dataUrl, path }) {
  if (!isCloudWriteEnabled || !dataUrl || !path) return null;

  // Coba via callable function dulu (tanpa retry sendiri, callable sudah handle retry)
  if (firebaseFunctions) {
    try {
      const uploadOperationalAsset = httpsCallable(firebaseFunctions, 'uploadOperationalAsset');
      const response = await uploadOperationalAsset({
        dataUrl,
        path,
      });
      const downloadUrl = typeof response?.data?.downloadUrl === 'string'
        ? response.data.downloadUrl
        : '';
      if (downloadUrl) {
        return downloadUrl;
      }
    } catch (error) {
      console.warn('Upload aset patroli via callable gagal, mencoba fallback Storage SDK dengan retry.', error);
    }
  }

  // Fallback Storage SDK dengan retry 3x exponential backoff
  try {
    return await uploadWithRetry(dataUrl, path, 3);
  } catch (error) {
    console.error('Upload aset patroli gagal setelah semua percobaan.', error);
    return null;
  }
}

export {
  CLOUD_STATE_SCHEMA_VERSION,
  isCloudSyncEnabled,
  isCloudWriteEnabled,
};
