import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
} from 'firebase/auth';
import { firebaseAuth, isFirebaseConfigured } from './app';

function ensureFirebaseAuth() {
  if (!firebaseAuth || !isFirebaseConfigured) {
    throw new Error('firebase-auth-not-configured');
  }
  return firebaseAuth;
}

function getFirebaseAuthErrorMessage(error) {
  const code = error?.code || error?.message || '';

  if (code === 'firebase-auth-not-configured') {
    return 'Firebase Auth belum dikonfigurasi pada aplikasi ini.';
  }
  if (code === 'auth/email-already-in-use') {
    return 'Email ini sudah terdaftar di Firebase.';
  }
  if (code === 'auth/invalid-email') {
    return 'Format email tidak valid.';
  }
  if (code === 'auth/weak-password') {
    return 'Password Firebase minimal 6 karakter.';
  }
  if (code === 'auth/user-disabled') {
    return 'Akun ini dinonaktifkan di Firebase Auth.';
  }
  if (code === 'auth/too-many-requests') {
    return 'Terlalu banyak percobaan login. Coba lagi beberapa saat.';
  }
  if (code === 'auth/network-request-failed') {
    return 'Jaringan gagal menjangkau Firebase. Periksa koneksi internet.';
  }
  if (code === 'auth/invalid-credential' || code === 'auth/user-not-found' || code === 'auth/wrong-password') {
    return 'Email atau password Firebase tidak cocok.';
  }
  return 'Autentikasi Firebase gagal diproses.';
}

async function loginWithFirebaseEmail(email, password) {
  return signInWithEmailAndPassword(ensureFirebaseAuth(), email, password);
}

async function registerWithFirebaseEmail(email, password) {
  return createUserWithEmailAndPassword(ensureFirebaseAuth(), email, password);
}

async function logoutFirebaseUser() {
  if (!firebaseAuth) return;
  await signOut(firebaseAuth);
}

function subscribeToFirebaseAuthChanges(callback) {
  if (!firebaseAuth) return () => {};
  return onAuthStateChanged(firebaseAuth, callback);
}

export {
  getFirebaseAuthErrorMessage,
  isFirebaseConfigured as isFirebaseAuthEnabled,
  loginWithFirebaseEmail,
  logoutFirebaseUser,
  registerWithFirebaseEmail,
  subscribeToFirebaseAuthChanges,
};
