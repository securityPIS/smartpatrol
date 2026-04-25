/*
Tujuan: Menyediakan adapter Firestore domain kecil untuk laporan checkpoint patroli realtime.
Caller: AppContextRuntime saat submit laporan, backfill offline, dan listener lintas-device.
Dependensi: Firebase Firestore singleton dan status cloud sync SmartPatrol.
Main Functions: Subscribe laporan patroli per shift/kapal dan upsert dokumen laporan per checkpoint.
Side Effects: Membaca/menulis `patrolReports/{shiftKey}/ships/{shipId}/checkpoints/{checkpointId}` di Firestore.
*/

import {
  collection,
  doc,
  limit,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  where,
} from 'firebase/firestore';
import { firebaseDb } from './app';
import { isCloudWriteEnabled } from './cloudState';

const PATROL_REPORTS_COLLECTION = 'patrolReports';
const PATROL_REPORTS_SCHEMA_VERSION = 1;
const PATROL_REPORTS_LISTEN_LIMIT = 120;

function createPathSegment(value, fallback = 'unknown') {
  const normalizedValue = String(value || '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .trim()
    .replace(/\//g, '_')
    .slice(0, 180);

  return normalizedValue || fallback;
}

function getPatrolReportsCollectionRef({ shiftKey, shipId }) {
  if (!firebaseDb || !shiftKey || !shipId) return null;

  return collection(
    firebaseDb,
    PATROL_REPORTS_COLLECTION,
    createPathSegment(shiftKey, 'shift'),
    'ships',
    createPathSegment(shipId, 'ship'),
    'checkpoints',
  );
}

function getPatrolReportDocRef(report) {
  const reportsCollectionRef = getPatrolReportsCollectionRef(report);
  if (!reportsCollectionRef || !report?.checkpointId) return null;
  return doc(reportsCollectionRef, createPathSegment(report.checkpointId, 'checkpoint'));
}

export function subscribeToPatrolReports({ shiftKey, shipId, shipName }, callback, onError) {
  const reportsCollectionRef = getPatrolReportsCollectionRef({ shiftKey, shipId });
  if (!reportsCollectionRef) return () => {};

  const reportQuery = shipName
    ? query(
        reportsCollectionRef,
        where('shipName', '==', shipName),
        limit(PATROL_REPORTS_LISTEN_LIMIT),
      )
    : query(reportsCollectionRef, limit(PATROL_REPORTS_LISTEN_LIMIT));

  return onSnapshot(
    reportQuery,
    (snapshot) => {
      callback(snapshot.docs.map((reportDoc) => ({
        ...reportDoc.data(),
        firestoreId: reportDoc.id,
      })));
    },
    onError,
  );
}

export async function savePatrolReport(report, options = {}) {
  const reportDocRef = getPatrolReportDocRef(report);
  if (!reportDocRef || !isCloudWriteEnabled) return null;

  const clientUpdatedAt = Number.isFinite(options.clientUpdatedAt)
    ? options.clientUpdatedAt
    : Date.now();

  const payload = {
    ...report,
    schemaVersion: PATROL_REPORTS_SCHEMA_VERSION,
    clientUpdatedAt,
    serverUpdatedAt: serverTimestamp(),
  };

  await setDoc(reportDocRef, payload);
  return payload;
}

export { PATROL_REPORTS_SCHEMA_VERSION };
