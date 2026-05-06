/*
Tujuan: Adapter Firestore domain kecil untuk laporan insiden dan update temuan realtime (mirip patrolReports).
Caller: AppContextRuntime saat submit/update/delete insiden dan listener lintas-device.
Dependensi: Firebase Firestore singleton dan status cloud sync SmartPatrol.
Main Functions: Subscribe koleksi insiden, upsert dokumen insiden/progress/dokumentasi, hapus dokumen insiden.
Side Effects: Membaca/menulis `incidents/{incidentId}` di Firestore.
*/

import {
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  limit,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore';
import { firebaseDb } from './app';
import { isCloudWriteEnabled } from './cloudState';

const INCIDENTS_COLLECTION = 'incidents';
const INCIDENTS_SCHEMA_VERSION = 1;
const INCIDENTS_LISTEN_LIMIT = 200;

function createPathSegment(value, fallback = 'unknown') {
  const normalizedValue = String(value || '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .trim()
    .replace(/\//g, '_')
    .slice(0, 180);

  return normalizedValue || fallback;
}

function getIncidentsCollectionRef() {
  if (!firebaseDb) return null;
  return collection(firebaseDb, INCIDENTS_COLLECTION);
}

function getIncidentDocRef(incidentId) {
  if (!firebaseDb || !incidentId) return null;
  return doc(firebaseDb, INCIDENTS_COLLECTION, createPathSegment(incidentId, 'incident'));
}

/**
 * Subscribe snapshot seluruh koleksi insiden.
 * @param {function} callback - dipanggil dengan array dokumen insiden
 * @param {function} onError - error handler
 * @returns {function} unsubscribe
 */
export function subscribeToIncidents(callback, onError) {
  const collectionRef = getIncidentsCollectionRef();
  if (!collectionRef) return () => {};

  const incidentsQuery = query(collectionRef, limit(INCIDENTS_LISTEN_LIMIT));

  return onSnapshot(
    incidentsQuery,
    (snapshot) => {
      callback(snapshot.docs.map((doc) => ({
        ...doc.data(),
        firestoreId: doc.id,
      })));
    },
    onError,
  );
}

/**
 * Upsert dokumen insiden ke Firestore.
 * @param {object} incident - data insiden (wajib punya id)
 * @param {object} options - { clientUpdatedAt }
 * @returns {object|null} payload yang ditulis, null jika gagal
 */
export async function saveIncidentReport(incident, options = {}) {
  const incidentId = incident?.id;
  if (!incidentId || !firebaseDb || !isCloudWriteEnabled) return null;

  const docRef = getIncidentDocRef(incidentId);
  if (!docRef) return null;

  const clientUpdatedAt = Number.isFinite(options.clientUpdatedAt)
    ? options.clientUpdatedAt
    : Date.now();
  const appendProgressItems = Array.isArray(options.appendProgressItems)
    ? options.appendProgressItems.filter(Boolean)
    : [];
  const appendDocumentationItems = Array.isArray(options.appendDocumentationItems)
    ? options.appendDocumentationItems.filter(Boolean)
    : [];
  const {
    progress,
    documentation,
    ...incidentFields
  } = incident;

  const payload = {
    ...incidentFields,
    schemaVersion: INCIDENTS_SCHEMA_VERSION,
    clientUpdatedAt,
    serverUpdatedAt: serverTimestamp(),
  };

  if (appendProgressItems.length > 0) {
    payload.progress = arrayUnion(...appendProgressItems);
  } else if (Array.isArray(progress)) {
    payload.progress = progress;
  }

  if (appendDocumentationItems.length > 0) {
    payload.documentation = arrayUnion(...appendDocumentationItems);
  } else if (Array.isArray(documentation)) {
    payload.documentation = documentation;
  }

  await setDoc(docRef, payload, { merge: true });
  return payload;
}

/**
 * Hapus dokumen insiden dari Firestore.
 * @param {string} incidentId
 * @returns {boolean} sukses/gagal
 */
export async function deleteIncidentReport(incidentId) {
  if (!incidentId || !firebaseDb || !isCloudWriteEnabled) return false;

  const docRef = getIncidentDocRef(incidentId);
  if (!docRef) return false;

  await deleteDoc(docRef);
  return true;
}

export { INCIDENTS_SCHEMA_VERSION };
