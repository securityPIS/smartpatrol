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
const CLOUD_STATE_SCHEMA_VERSION = 1;
const isCloudSyncAllowedByEnv = import.meta.env.VITE_ENABLE_CLOUD_SYNC !== '0';
const isCloudWriteAllowedByEnv = import.meta.env.VITE_ENABLE_CLOUD_SYNC_WRITE !== '0';

const cloudStateRef = firebaseDb
  ? doc(firebaseDb, CLOUD_STATE_COLLECTION, CLOUD_STATE_DOCUMENT)
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
  const { mergeState } = options;
  if (!cloudStateRef || !isCloudWriteEnabled) return state;

  if (typeof mergeState === 'function') {
    let resolvedState = state;

    await runTransaction(firebaseDb, async (transaction) => {
      const snapshot = await transaction.get(cloudStateRef);
      const currentState = snapshot.exists() ? snapshot.data()?.state || null : null;
      resolvedState = mergeState(currentState, state);

      transaction.set(cloudStateRef, {
        schemaVersion: CLOUD_STATE_SCHEMA_VERSION,
        clientUpdatedAt: Date.now(),
        updatedAt: serverTimestamp(),
        state: resolvedState,
      });
    });

    return resolvedState;
  }

  await setDoc(cloudStateRef, {
    schemaVersion: CLOUD_STATE_SCHEMA_VERSION,
    clientUpdatedAt: Date.now(),
    updatedAt: serverTimestamp(),
    state,
  });

  return state;
}

export async function uploadCloudDataUrlAsset({ dataUrl, path }) {
  if (!isCloudWriteEnabled || !dataUrl || !path) return null;

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
      console.warn('Upload aset patroli via callable gagal, mencoba fallback Storage SDK.', error);
    }
  }

  if (!firebaseStorage) return null;

  const storageRef = ref(firebaseStorage, path);
  await uploadString(storageRef, dataUrl, 'data_url');
  return getDownloadURL(storageRef);
}

export {
  CLOUD_STATE_SCHEMA_VERSION,
  isCloudSyncEnabled,
  isCloudWriteEnabled,
};
