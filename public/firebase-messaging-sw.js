/* eslint-disable no-undef */
const APP_CACHE_NAME = 'smartpatrol-shell-v2';
const APP_SHELL_ASSETS = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/favicon-smartpatrol.svg',
  '/icon-192.png',
  '/icon-512.png',
  '/smartpatrol-logo.png',
];

function parseFirebaseConfig() {
  const params = new URL(self.location.href).searchParams;
  const config = {
    apiKey: params.get('apiKey') || '',
    authDomain: params.get('authDomain') || '',
    projectId: params.get('projectId') || '',
    storageBucket: params.get('storageBucket') || '',
    messagingSenderId: params.get('messagingSenderId') || '',
    appId: params.get('appId') || '',
    measurementId: params.get('measurementId') || '',
  };

  if (!config.apiKey || !config.projectId || !config.appId || !config.messagingSenderId) {
    return null;
  }

  return config;
}

function buildLaunchUrl(notificationData = {}) {
  const url = new URL(notificationData.url || '/', self.location.origin);
  if (notificationData.notificationId) {
    url.searchParams.set('notificationId', notificationData.notificationId);
  } else {
    url.searchParams.set('openNotifications', '1');
  }
  return url.toString();
}

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(APP_CACHE_NAME).then((cache) => cache.addAll(APP_SHELL_ASSETS)),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const cacheKeys = await caches.keys();
    await Promise.all(
      cacheKeys
        .filter((cacheKey) => cacheKey !== APP_CACHE_NAME)
        .map((cacheKey) => caches.delete(cacheKey)),
    );
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const requestUrl = new URL(event.request.url);
  if (requestUrl.origin !== self.location.origin) return;

  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(async () => (
        (await caches.match('/index.html')) || caches.match('/')
      )),
    );
    return;
  }

  event.respondWith((async () => {
    const cached = await caches.match(event.request);
    if (cached) return cached;

    try {
      const response = await fetch(event.request);
      if (response && response.status === 200 && response.type === 'basic') {
        const cache = await caches.open(APP_CACHE_NAME);
        cache.put(event.request, response.clone());
      }
      return response;
    } catch (error) {
      return cached || Response.error();
    }
  })());
});

self.addEventListener('notificationclick', (event) => {
  const notificationData = event.notification?.data || {};
  const targetUrl = buildLaunchUrl(notificationData);
  event.notification.close();

  event.waitUntil((async () => {
    const windowClients = await self.clients.matchAll({
      type: 'window',
      includeUncontrolled: true,
    });

    for (const client of windowClients) {
      client.postMessage({
        type: 'SMARTPATROL_OPEN_NOTIFICATION',
        notificationId: notificationData.notificationId || '',
        url: targetUrl,
      });

      if ('focus' in client) {
        await client.focus();
      }

      if ('navigate' in client) {
        await client.navigate(targetUrl);
      }

      return;
    }

    await self.clients.openWindow(targetUrl);
  })());
});

try {
  importScripts(
    'https://www.gstatic.com/firebasejs/12.11.0/firebase-app-compat.js',
    'https://www.gstatic.com/firebasejs/12.11.0/firebase-messaging-compat.js',
  );

  const firebaseConfig = parseFirebaseConfig();

  if (firebaseConfig && self.firebase?.apps?.length === 0) {
    self.firebase.initializeApp(firebaseConfig);
  }

  if (self.firebase?.messaging) {
    const messaging = self.firebase.messaging();

    messaging.onBackgroundMessage((payload) => {
      const data = payload?.data || {};
      const title = payload?.notification?.title || data.title || 'SmartPatrol';
      const body = payload?.notification?.body || data.body || data.message || 'Ada notifikasi baru.';

      self.registration.showNotification(title, {
        body,
        icon: '/smartpatrol-logo.png',
        badge: '/icon-192.png',
        tag: data.notificationId || data.dedupeKey || `smartpatrol-${Date.now()}`,
        renotify: true,
        data: {
          notificationId: data.notificationId || '',
          url: buildLaunchUrl({
            notificationId: data.notificationId || '',
            url: data.url || '/',
          }),
        },
      });
    });
  }
} catch (error) {
  console.error('[SmartPatrol][sw] gagal inisialisasi Firebase Messaging', error);
}
