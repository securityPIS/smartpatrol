import { doc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore';
import { getDownloadURL, ref, uploadString } from 'firebase/storage';
import { firebaseDb, firebaseStorage } from './app';

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

export async function saveCloudAppState(state) {
  if (!cloudStateRef || !isCloudWriteEnabled) return;

  await setDoc(cloudStateRef, {
    schemaVersion: CLOUD_STATE_SCHEMA_VERSION,
    clientUpdatedAt: Date.now(),
    updatedAt: serverTimestamp(),
    state,
  });
}

export async function uploadCloudDataUrlAsset({ dataUrl, path }) {
  if (!firebaseStorage || !isCloudWriteEnabled || !dataUrl || !path) return null;

  const storageRef = ref(firebaseStorage, path);
  await uploadString(storageRef, dataUrl, 'data_url');
  return getDownloadURL(storageRef);
}

export {
  CLOUD_STATE_SCHEMA_VERSION,
  isCloudSyncEnabled,
  isCloudWriteEnabled,
};
