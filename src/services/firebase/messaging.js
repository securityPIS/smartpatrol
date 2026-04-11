import {
  getMessaging,
  getToken,
  isSupported as isMessagingSupportedByFirebase,
  onMessage,
} from 'firebase/messaging';
import { firebaseApp, firebaseConfig, isFirebaseConfigured } from './app';

const DEVICE_ID_STORAGE_KEY = 'smartpatrol.push.deviceId.v1';
const ASSIGNED_USER_STORAGE_KEY = 'smartpatrol.push.assignedUserId.v1';
const TOKEN_STORAGE_KEY = 'smartpatrol.push.token.v1';
const SERVICE_WORKER_PATH = '/firebase-messaging-sw.js';
const DEFAULT_LAUNCH_PATH = '/';

let serviceWorkerRegistrationPromise = null;

function readStorage(key) {
  try {
    return window.localStorage.getItem(key) || '';
  } catch {
    return '';
  }
}

function writeStorage(key, value) {
  try {
    if (!value) {
      window.localStorage.removeItem(key);
      return;
    }
    window.localStorage.setItem(key, value);
  } catch (error) {
    console.error('[SmartPatrol][push] gagal menulis local storage', error);
  }
}

function createDeviceId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `device-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function getServiceWorkerUrl() {
  const params = new URLSearchParams({
    apiKey: firebaseConfig.apiKey || '',
    authDomain: firebaseConfig.authDomain || '',
    projectId: firebaseConfig.projectId || '',
    storageBucket: firebaseConfig.storageBucket || '',
    messagingSenderId: firebaseConfig.messagingSenderId || '',
    appId: firebaseConfig.appId || '',
    measurementId: firebaseConfig.measurementId || '',
  });

  return `${SERVICE_WORKER_PATH}?${params.toString()}`;
}

export function getNotificationPermission() {
  if (typeof window === 'undefined' || typeof window.Notification === 'undefined') {
    return 'unsupported';
  }
  return window.Notification.permission || 'default';
}

export async function isPushMessagingSupported() {
  if (
    typeof window === 'undefined'
    || typeof navigator === 'undefined'
    || !('Notification' in window)
    || !('serviceWorker' in navigator)
  ) {
    return false;
  }

  try {
    return await isMessagingSupportedByFirebase();
  } catch {
    return false;
  }
}

export async function ensurePushServiceWorkerRegistration() {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return null;
  if (serviceWorkerRegistrationPromise) return serviceWorkerRegistrationPromise;

  serviceWorkerRegistrationPromise = navigator.serviceWorker.register(getServiceWorkerUrl(), {
    scope: '/',
    updateViaCache: 'none',
  });

  return serviceWorkerRegistrationPromise;
}

export async function requestPushPermission() {
  if (typeof window === 'undefined' || typeof window.Notification === 'undefined') {
    return 'unsupported';
  }

  if (window.Notification.permission === 'granted' || window.Notification.permission === 'denied') {
    return window.Notification.permission;
  }

  return window.Notification.requestPermission();
}

export function getOrCreatePushDeviceId() {
  const storedDeviceId = readStorage(DEVICE_ID_STORAGE_KEY);
  if (storedDeviceId) return storedDeviceId;

  const nextDeviceId = createDeviceId();
  writeStorage(DEVICE_ID_STORAGE_KEY, nextDeviceId);
  return nextDeviceId;
}

export function getStoredAssignedPushUserId() {
  return readStorage(ASSIGNED_USER_STORAGE_KEY);
}

export function setStoredAssignedPushUserId(userId) {
  writeStorage(ASSIGNED_USER_STORAGE_KEY, userId || '');
}

export function getStoredPushToken() {
  return readStorage(TOKEN_STORAGE_KEY);
}

export function setStoredPushToken(token) {
  writeStorage(TOKEN_STORAGE_KEY, token || '');
}

export function buildNotificationLaunchUrl(notificationId = '') {
  const url = new URL(DEFAULT_LAUNCH_PATH, window.location.origin);
  if (notificationId) {
    url.searchParams.set('notificationId', notificationId);
  } else {
    url.searchParams.set('openNotifications', '1');
  }
  return url.toString();
}

export function readNotificationLaunchRequest() {
  if (typeof window === 'undefined') return { notificationId: '', openNotifications: false };

  const currentUrl = new URL(window.location.href);
  return {
    notificationId: currentUrl.searchParams.get('notificationId') || '',
    openNotifications: currentUrl.searchParams.get('openNotifications') === '1',
  };
}

export function clearNotificationLaunchRequest() {
  if (typeof window === 'undefined') return;

  const currentUrl = new URL(window.location.href);
  currentUrl.searchParams.delete('notificationId');
  currentUrl.searchParams.delete('openNotifications');
  window.history.replaceState({}, document.title, currentUrl.toString());
}

export async function registerDevicePushToken() {
  const supported = await isPushMessagingSupported();
  if (!supported) {
    return { ok: false, reason: 'unsupported', permission: getNotificationPermission() };
  }

  const permission = await requestPushPermission();
  if (permission !== 'granted') {
    return { ok: false, reason: permission === 'denied' ? 'denied' : 'dismissed', permission };
  }

  if (!firebaseApp || !isFirebaseConfigured || !firebaseConfig.messagingSenderId) {
    return { ok: false, reason: 'firebase-not-configured', permission };
  }

  const vapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY || '';
  if (!vapidKey) {
    return { ok: false, reason: 'missing-vapid-key', permission };
  }

  const serviceWorkerRegistration = await ensurePushServiceWorkerRegistration();
  const messaging = getMessaging(firebaseApp);
  const token = await getToken(messaging, {
    vapidKey,
    serviceWorkerRegistration,
  });

  if (!token) {
    return { ok: false, reason: 'missing-token', permission, serviceWorkerRegistration };
  }

  setStoredPushToken(token);
  return {
    ok: true,
    token,
    permission,
    serviceWorkerRegistration,
  };
}

function normalizeForegroundPayload(payload = {}) {
  const data = payload?.data || {};
  return {
    notificationId: data.notificationId || '',
    title: payload?.notification?.title || data.title || 'SmartPatrol',
    body: payload?.notification?.body || data.body || data.message || '',
    route: data.route || '',
    shipName: data.shipName || '',
    notificationType: data.type || '',
  };
}

export async function subscribeToForegroundPushMessages(callback) {
  const supported = await isPushMessagingSupported();
  if (!supported || !firebaseApp || !isFirebaseConfigured) return () => {};

  const messaging = getMessaging(firebaseApp);
  return onMessage(messaging, (payload) => {
    callback(normalizeForegroundPayload(payload), payload);
  });
}

export async function showDeviceNotification(notification = {}, options = {}) {
  const title = notification.title || 'SmartPatrol';
  const body = notification.body || notification.message || 'Ada notifikasi baru.';
  const notificationId = notification.notificationId || notification.id || '';
  const serviceWorkerRegistration = options.serviceWorkerRegistration || await ensurePushServiceWorkerRegistration();
  const notificationOptions = {
    body,
    icon: '/smartpatrol-logo.png',
    badge: '/icon-192.png',
    tag: notificationId || notification.dedupeKey || `smartpatrol-${Date.now()}`,
    renotify: true,
    data: {
      notificationId,
      url: buildNotificationLaunchUrl(notificationId),
    },
  };

  if (serviceWorkerRegistration?.showNotification) {
    await serviceWorkerRegistration.showNotification(title, notificationOptions);
    return;
  }

  if (typeof window !== 'undefined' && typeof window.Notification !== 'undefined') {
    new window.Notification(title, notificationOptions);
  }
}
