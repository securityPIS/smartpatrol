const admin = require('firebase-admin');
const logger = require('firebase-functions/logger');
const { onDocumentWritten } = require('firebase-functions/v2/firestore');

if (!admin.apps.length) {
  admin.initializeApp();
}

const SHARED_STATE_DOCUMENT = 'smartpatrol/shared-state';
const PUSH_REGION = 'asia-southeast2';

function normalizeString(value, maxLength = 2000) {
  return String(value || '').trim().slice(0, maxLength);
}

function normalizeUserPushSubscriptions(subscriptions = []) {
  if (!Array.isArray(subscriptions)) return [];

  const merged = new Map();
  subscriptions.forEach((subscription, index) => {
    const token = normalizeString(subscription?.token, 4096);
    const deviceId = normalizeString(subscription?.deviceId, 160);
    const mergeKey = deviceId || token || `push-${index + 1}`;
    if (!mergeKey) return;

    const nextRecord = {
      token,
      deviceId: deviceId || null,
      status: normalizeString(subscription?.status || 'active', 20).toLowerCase() || 'active',
      permission: normalizeString(subscription?.permission || 'granted', 20).toLowerCase() || 'granted',
      updatedAt: normalizeString(subscription?.updatedAt || subscription?.createdAt || new Date(0).toISOString()),
      createdAt: normalizeString(subscription?.createdAt || subscription?.updatedAt || new Date(0).toISOString()),
    };

    const existingRecord = merged.get(mergeKey);
    if (!existingRecord) {
      merged.set(mergeKey, nextRecord);
      return;
    }

    const existingUpdatedAt = new Date(existingRecord.updatedAt || existingRecord.createdAt || '').getTime();
    const nextUpdatedAt = new Date(nextRecord.updatedAt || nextRecord.createdAt || '').getTime();
    merged.set(mergeKey, Number.isNaN(existingUpdatedAt) || nextUpdatedAt >= existingUpdatedAt
      ? { ...existingRecord, ...nextRecord }
      : { ...nextRecord, ...existingRecord });
  });

  return Array.from(merged.values());
}

function buildUserTokenMap(usersData = []) {
  return (Array.isArray(usersData) ? usersData : []).reduce((tokenMap, user) => {
    const activeTokens = normalizeUserPushSubscriptions(user?.pushSubscriptions || [])
      .filter((subscription) => (
        subscription.token
        && subscription.status === 'active'
        && subscription.permission !== 'denied'
      ))
      .map((subscription) => subscription.token);

    if (activeTokens.length > 0 && user?.id) {
      tokenMap.set(user.id, Array.from(new Set(activeTokens)));
    }

    return tokenMap;
  }, new Map());
}

function mapNotificationsById(notifications = []) {
  return (Array.isArray(notifications) ? notifications : []).reduce((notificationMap, notification) => {
    if (!notification?.id) return notificationMap;
    notificationMap.set(notification.id, notification);
    return notificationMap;
  }, new Map());
}

function collectNewNotificationDeliveries(beforeNotifications = [], afterNotifications = []) {
  const beforeMap = mapNotificationsById(beforeNotifications);
  const deliveries = [];

  (Array.isArray(afterNotifications) ? afterNotifications : []).forEach((notification) => {
    if (!notification?.id) return;

    const currentTargets = Array.from(new Set(Array.isArray(notification.targetUserIds) ? notification.targetUserIds.filter(Boolean) : []));
    if (currentTargets.length === 0) return;

    const previousNotification = beforeMap.get(notification.id);
    const previousTargets = new Set(
      Array.isArray(previousNotification?.targetUserIds)
        ? previousNotification.targetUserIds.filter(Boolean)
        : [],
    );
    const newTargets = currentTargets.filter((userId) => !previousTargets.has(userId));
    if (newTargets.length === 0) return;

    deliveries.push({
      notification,
      targetUserIds: newTargets,
    });
  });

  return deliveries;
}

function buildNotificationUrl(projectId, notificationId) {
  const safeProjectId = normalizeString(projectId, 120);
  const safeNotificationId = normalizeString(notificationId, 180);
  return `https://${safeProjectId}.web.app/?notificationId=${encodeURIComponent(safeNotificationId)}`;
}

function buildMessagePayload(notification, projectId) {
  return {
    title: normalizeString(notification?.title || 'SmartPatrol', 120),
    body: normalizeString(notification?.message || 'Ada notifikasi patroli baru.', 240),
    type: normalizeString(notification?.type || 'general', 80),
    route: normalizeString(notification?.route || '', 80),
    routeParams: JSON.stringify(notification?.routeParams || {}),
    shipName: normalizeString(notification?.shipName || '', 120),
    shiftKey: normalizeString(notification?.shiftKey || '', 120),
    incidentId: normalizeString(notification?.incidentId || '', 160),
    historyId: normalizeString(notification?.historyId || '', 160),
    notificationId: normalizeString(notification?.id || '', 180),
    dedupeKey: normalizeString(notification?.dedupeKey || '', 240),
    createdAt: normalizeString(notification?.createdAt || '', 80),
    url: buildNotificationUrl(projectId, notification?.id || ''),
  };
}

function collectInvalidTokensFromResponse(tokens = [], sendResponse) {
  const invalidTokens = [];
  (sendResponse?.responses || []).forEach((response, index) => {
    if (response.success) return;

    const errorCode = response.error?.code || '';
    if (
      errorCode === 'messaging/registration-token-not-registered'
      || errorCode === 'messaging/invalid-registration-token'
    ) {
      invalidTokens.push(tokens[index]);
    }
  });
  return invalidTokens;
}

async function pruneInvalidTokens(usersData = [], invalidTokens = []) {
  const invalidTokenSet = new Set(invalidTokens.filter(Boolean));
  if (invalidTokenSet.size === 0) return false;

  const stateRef = admin.firestore().doc(SHARED_STATE_DOCUMENT);
  const snapshot = await stateRef.get();
  if (!snapshot.exists) return false;

  const currentPayload = snapshot.data() || {};
  const currentState = currentPayload.state || {};
  const nextUsersData = (Array.isArray(currentState.usersData) ? currentState.usersData : []).map((user) => ({
    ...user,
    pushSubscriptions: normalizeUserPushSubscriptions(user?.pushSubscriptions || []).map((subscription) => (
      invalidTokenSet.has(subscription.token)
        ? {
            ...subscription,
            status: 'revoked',
            permission: 'denied',
            updatedAt: new Date().toISOString(),
          }
        : subscription
    )),
  }));

  await stateRef.set({
    state: {
      ...currentState,
      usersData: nextUsersData,
    },
    clientUpdatedAt: Date.now(),
  }, { merge: true });

  logger.info('Invalid push tokens pruned', {
    invalidCount: invalidTokenSet.size,
  });
  return true;
}

exports.sendPushNotificationsForSmartPatrol = onDocumentWritten(
  {
    document: SHARED_STATE_DOCUMENT,
    region: PUSH_REGION,
    memory: '256MiB',
  },
  async (event) => {
    const beforeState = event.data?.before?.data()?.state || {};
    const afterPayload = event.data?.after?.data();
    const afterState = afterPayload?.state || null;

    if (!afterState) {
      logger.info('Shared state deleted or empty, skip push sync');
      return;
    }

    const deliveries = collectNewNotificationDeliveries(
      beforeState.notifications || [],
      afterState.notifications || [],
    );

    if (deliveries.length === 0) {
      logger.info('No new notification deliveries detected');
      return;
    }

    const userTokenMap = buildUserTokenMap(afterState.usersData || []);
    const projectId = afterState.projectId || process.env.GCLOUD_PROJECT || admin.app().options.projectId || '';
    const invalidTokens = [];

    for (const delivery of deliveries) {
      const tokens = Array.from(new Set(
        delivery.targetUserIds.flatMap((userId) => userTokenMap.get(userId) || []),
      ));

      if (tokens.length === 0) {
        logger.info('No active push tokens found for notification', {
          notificationId: delivery.notification.id,
          targetUsers: delivery.targetUserIds,
        });
        continue;
      }

      const messagePayload = buildMessagePayload(delivery.notification, projectId);
      const response = await admin.messaging().sendEachForMulticast({
        tokens,
        data: messagePayload,
        webpush: {
          headers: {
            Urgency: delivery.notification?.type === 'checkpoint_missed' ? 'high' : 'normal',
          },
          fcmOptions: {
            link: messagePayload.url,
          },
        },
      });

      invalidTokens.push(...collectInvalidTokensFromResponse(tokens, response));

      logger.info('Push notification dispatched', {
        notificationId: delivery.notification.id,
        targetUsers: delivery.targetUserIds.length,
        tokens: tokens.length,
        successCount: response.successCount,
        failureCount: response.failureCount,
      });
    }

    if (invalidTokens.length > 0) {
      await pruneInvalidTokens(afterState.usersData || [], invalidTokens);
    }
  },
);
