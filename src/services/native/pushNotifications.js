/*
Tujuan: Menghubungkan SmartPatrol Android ke Firebase Cloud Messaging melalui Capacitor Push Notifications.
Caller: AppContextRuntime setelah user operasional berhasil login.
Dependensi: @capacitor/push-notifications, Firebase Functions, dan adapter native Capacitor.
Main Functions: Membuat channel notifikasi, meminta izin, mendaftarkan token FCM, membaca payload launch SOS, dan meneruskan payload push ke app.
Side Effects: Memicu prompt izin notifikasi Android, menulis token push via Cloud Function, dan memasang listener native.
*/

import { httpsCallable } from 'firebase/functions';
import { sanitizeText } from '../../utils/sanitize';
import { firebaseFunctions } from '../firebase/app';
import { getNativeLaunchNotificationPayload, isNativeRuntime } from './capacitorBridge';

const ALERT_CHANNEL_ID = 'smartpatrol-alerts';
const SOS_CHANNEL_ID = 'smartpatrol-sos';

function getCallable(name) {
  if (!firebaseFunctions) return null;
  return httpsCallable(firebaseFunctions, name);
}

function normalizePushPayload(data = {}) {
  const normalized = {};
  Object.entries(data || {}).forEach(([key, value]) => {
    if (typeof value === 'string') {
      normalized[key] = value;
      return;
    }
    if (value == null) {
      normalized[key] = '';
      return;
    }
    normalized[key] = String(value);
  });
  return normalized;
}

async function registerToken(token, profile = {}) {
  const callable = getCallable('registerPushToken');
  if (!callable || !token) return;

  await callable({
    token,
    platform: 'android',
    appId: 'com.smartpatrol.app',
    legacyUserId: sanitizeText(profile.legacyUserId || '', 160),
    role: sanitizeText(profile.role || '', 20),
    shipAssigned: sanitizeText(profile.shipAssigned || '', 100),
    displayName: sanitizeText(profile.displayName || '', 100),
  });
}

async function unregisterToken(token) {
  const callable = getCallable('unregisterPushToken');
  if (!callable || !token) return;

  await callable({ token });
}

async function createNotificationChannels(PushNotifications) {
  if (typeof PushNotifications.createChannel !== 'function') return;

  await Promise.allSettled([
    PushNotifications.createChannel({
      id: ALERT_CHANNEL_ID,
      name: 'SmartPatrol Alerts',
      description: 'Notifikasi operasional SmartPatrol.',
      importance: 5,
      visibility: 1,
      lights: true,
      vibration: true,
      sound: 'default',
    }),
    PushNotifications.createChannel({
      id: SOS_CHANNEL_ID,
      name: 'SmartPatrol SOS',
      description: 'Peringatan darurat SOS SmartPatrol.',
      importance: 5,
      visibility: 1,
      lights: true,
      vibration: true,
      sound: 'default',
    }),
  ]);
}

export async function setupNativePushNotifications(profile = {}, handlers = {}) {
  if (!isNativeRuntime()) return () => {};

  const { PushNotifications } = await import('@capacitor/push-notifications');
  let activeToken = '';
  let disposed = false;
  const listenerHandles = [];

  await createNotificationChannels(PushNotifications);

  const permissionStatus = await PushNotifications.requestPermissions();
  if (permissionStatus.receive !== 'granted') {
    console.warn('Izin push notification Android belum diberikan.');
    return () => {};
  }

  listenerHandles.push(await PushNotifications.addListener('registration', async (token) => {
    activeToken = sanitizeText(token?.value || '', 4096);
    if (!activeToken || disposed) return;

    try {
      await registerToken(activeToken, profile);
    } catch (error) {
      console.error('Registrasi token push SmartPatrol gagal', error);
    }
  }));

  listenerHandles.push(await PushNotifications.addListener('registrationError', (error) => {
    console.error('Registrasi push notification Android gagal', error);
  }));

  listenerHandles.push(await PushNotifications.addListener('pushNotificationReceived', (notification) => {
    const payload = normalizePushPayload(notification?.data || {});
    handlers.onNotification?.(payload, notification);
  }));

  listenerHandles.push(await PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
    const payload = normalizePushPayload(action?.notification?.data || {});
    handlers.onAction?.(payload, action);
  }));

  await PushNotifications.register();

  const launchPayload = normalizePushPayload(await getNativeLaunchNotificationPayload());
  if (launchPayload.type || launchPayload.route || launchPayload.sosId || launchPayload.incidentId) {
    handlers.onAction?.(launchPayload, { source: 'native-launch-intent' });
  }

  return async () => {
    disposed = true;
    await Promise.allSettled(listenerHandles.map((handle) => handle?.remove?.()));
    if (activeToken) {
      await unregisterToken(activeToken).catch((error) => {
        console.warn('Unregister token push SmartPatrol gagal', error);
      });
    }
  };
}
