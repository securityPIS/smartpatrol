/*
Tujuan: Menginisialisasi singleton Firebase Web SDK SmartPatrol dengan fallback config staging yang aman.
Caller: Seluruh service Firebase client seperti auth, access, dan cloud state.
Dependensi: Firebase App, Auth, Firestore, Functions, Storage, dan env Vite.
Main Functions: Menyusun config Firebase, menentukan sumber config, dan mengekspor singleton SDK client.
Side Effects: Membuat instance Firebase App tunggal saat konfigurasi valid agar auth/sync siap dipakai.
*/

import { getApp, getApps, initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore, initializeFirestore } from 'firebase/firestore';
import { getFunctions } from 'firebase/functions';
import { getStorage } from 'firebase/storage';

const DEFAULT_FIREBASE_WEB_CONFIG = Object.freeze({
  apiKey: 'AIzaSyBaO_qgUQETep3-v1l554RwA25otHJr8aU',
  authDomain: 'smartpatrol-7ff9e.firebaseapp.com',
  projectId: 'smartpatrol-7ff9e',
  storageBucket: 'smartpatrol-7ff9e.firebasestorage.app',
  messagingSenderId: '1054382503865',
  appId: '1:1054382503865:web:21b75f4631799d4d06e868',
  measurementId: 'G-L158G73VVS',
});

function readFirebaseConfigValue(envValue, fallbackValue = '') {
  const normalizedEnvValue = typeof envValue === 'string' ? envValue.trim() : '';
  if (normalizedEnvValue) return normalizedEnvValue;
  const normalizedFallbackValue = typeof fallbackValue === 'string' ? fallbackValue.trim() : '';
  return normalizedFallbackValue || '';
}

const firebaseConfig = {
  apiKey: readFirebaseConfigValue(import.meta.env.VITE_FIREBASE_API_KEY, DEFAULT_FIREBASE_WEB_CONFIG.apiKey),
  authDomain: readFirebaseConfigValue(import.meta.env.VITE_FIREBASE_AUTH_DOMAIN, DEFAULT_FIREBASE_WEB_CONFIG.authDomain),
  projectId: readFirebaseConfigValue(import.meta.env.VITE_FIREBASE_PROJECT_ID, DEFAULT_FIREBASE_WEB_CONFIG.projectId),
  storageBucket: readFirebaseConfigValue(import.meta.env.VITE_FIREBASE_STORAGE_BUCKET, DEFAULT_FIREBASE_WEB_CONFIG.storageBucket),
  messagingSenderId: readFirebaseConfigValue(import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID, DEFAULT_FIREBASE_WEB_CONFIG.messagingSenderId),
  appId: readFirebaseConfigValue(import.meta.env.VITE_FIREBASE_APP_ID, DEFAULT_FIREBASE_WEB_CONFIG.appId),
  measurementId: readFirebaseConfigValue(import.meta.env.VITE_FIREBASE_MEASUREMENT_ID, DEFAULT_FIREBASE_WEB_CONFIG.measurementId),
};

const isFirebaseConfigured = Boolean(
  firebaseConfig.apiKey
  && firebaseConfig.authDomain
  && firebaseConfig.projectId
  && firebaseConfig.appId,
);

const firebaseConfigSource = isFirebaseConfigured
  ? (import.meta.env.VITE_FIREBASE_API_KEY
    && import.meta.env.VITE_FIREBASE_AUTH_DOMAIN
    && import.meta.env.VITE_FIREBASE_PROJECT_ID
    && import.meta.env.VITE_FIREBASE_APP_ID
      ? 'vite-env'
      : 'embedded-default')
  : 'missing';

const firebaseApp = isFirebaseConfigured
  ? (getApps().length > 0 ? getApp() : initializeApp(firebaseConfig))
  : null;

function createFirestoreInstance(app) {
  try {
    return initializeFirestore(app, {
      // Auto long-polling lebih stabil pada PWA/mobile field devices yang
      // sering bermasalah dengan WebChannel sehingga listener realtime terasa
      // lambat atau tidak konsisten lintas perangkat.
      experimentalAutoDetectLongPolling: true,
      useFetchStreams: false,
    });
  } catch (error) {
    const message = String(error?.message || '').toLowerCase();
    if (
      message.includes('already been started')
      || message.includes('already initialized')
      || message.includes('failed to initialize')
    ) {
      return getFirestore(app);
    }

    console.warn('Gagal mengaktifkan Firestore long-polling, memakai konfigurasi default.', error);
    return getFirestore(app);
  }
}

const firebaseAuth = firebaseApp ? getAuth(firebaseApp) : null;
const firebaseDb = firebaseApp ? createFirestoreInstance(firebaseApp) : null;
const firebaseFunctions = firebaseApp ? getFunctions(firebaseApp, 'asia-southeast2') : null;
const firebaseStorage = firebaseApp ? getStorage(firebaseApp) : null;

export {
  firebaseApp,
  firebaseAuth,
  firebaseConfig,
  firebaseConfigSource,
  firebaseDb,
  firebaseFunctions,
  firebaseStorage,
  isFirebaseConfigured,
};
