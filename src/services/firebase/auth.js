import {
  createUserWithEmailAndPassword,
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
} from 'firebase/auth';
import { deleteApp, initializeApp } from 'firebase/app';
import { firebaseApp, firebaseAuth, firebaseConfig, isFirebaseConfigured } from './app';

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

async function provisionFirebaseEmailUser({ email, password, displayName = '' }) {
  ensureFirebaseAuth();

  const tempAppName = `smartpatrol-admin-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const tempApp = initializeApp(firebaseConfig, tempAppName);
  const tempAuth = getAuth(tempApp);

  try {
    const credential = await createUserWithEmailAndPassword(tempAuth, email, password);
    if (displayName) {
      await updateProfile(credential.user, { displayName });
    }
    return credential;
  } finally {
    try {
      await signOut(tempAuth);
    } catch (error) {
      console.error('Gagal membersihkan sesi Firebase sementara', error);
    }
    await deleteApp(tempApp);
  }
}

async function logoutFirebaseUser() {
  if (!firebaseAuth) return;
  await signOut(firebaseAuth);
}

function subscribeToFirebaseAuthChanges(callback) {
  if (!firebaseAuth || !firebaseApp) return () => {};
  return onAuthStateChanged(firebaseAuth, callback);
}

export {
  getFirebaseAuthErrorMessage,
  isFirebaseConfigured as isFirebaseAuthEnabled,
  loginWithFirebaseEmail,
  logoutFirebaseUser,
  provisionFirebaseEmailUser,
  registerWithFirebaseEmail,
  subscribeToFirebaseAuthChanges,
};
