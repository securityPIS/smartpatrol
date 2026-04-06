import { test, expect } from '@playwright/test';

const AUTH_STORAGE_KEY = 'smartpatrol.auth.local.v1';
const APP_STORAGE_KEY = 'smartpatrol.legacy.local.v1';
const APP_TIME_ZONE = 'Asia/Jakarta';

const tinyPngBuffer = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wn0l3sAAAAASUVORK5CYII=',
  'base64',
);

function formatNotificationTime(iso) {
  return new Intl.DateTimeFormat('id-ID', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: APP_TIME_ZONE,
  }).format(new Date(iso));
}

function wrapPersistedAppData(data, savedAt) {
  return {
    version: 1,
    savedAt,
    data,
  };
}

async function bootstrapSession(page, { nowIso, userId, appData = null }) {
  const consoleErrors = [];
  page.on('console', (message) => {
    if (message.type() === 'error') {
      consoleErrors.push(message.text());
    }
  });

  await page.addInitScript(({ nowIso, userId, authKey, appKey, appData }) => {
    const fixedTimestamp = new Date(nowIso).getTime();
    const OriginalDate = Date;

    class MockDate extends OriginalDate {
      constructor(...args) {
        return args.length === 0 ? new OriginalDate(fixedTimestamp) : new OriginalDate(...args);
      }

      static now() {
        return fixedTimestamp;
      }

      static parse(value) {
        return OriginalDate.parse(value);
      }

      static UTC(...args) {
        return OriginalDate.UTC(...args);
      }
    }

    Object.setPrototypeOf(MockDate, OriginalDate);
    window.Date = MockDate;
    window.localStorage.clear();
    window.localStorage.setItem(authKey, JSON.stringify({
      userId,
      savedAt: new OriginalDate(fixedTimestamp).toISOString(),
    }));
    if (appData) {
      window.localStorage.setItem(appKey, JSON.stringify(appData));
    } else {
      window.localStorage.removeItem(appKey);
    }
  }, {
    nowIso,
    userId,
    authKey: AUTH_STORAGE_KEY,
    appKey: APP_STORAGE_KEY,
    appData: appData ? wrapPersistedAppData(appData, nowIso) : null,
  });

  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[aria-label="Notifikasi"]');
  await page.waitForTimeout(1500);

  return {
    getConsoleErrors: () => [...consoleErrors],
  };
}

async function readPersistedAppData(page) {
  return page.evaluate((key) => {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  }, APP_STORAGE_KEY);
}

async function openNotificationInbox(page) {
  await page.locator('[aria-label="Notifikasi"]').click();
  await expect(page.getByRole('heading', { name: 'Notifikasi' })).toBeVisible();
}

function getNotificationByDedupe(notifications, dedupeKey) {
  return notifications.find((notification) => notification.dedupeKey === dedupeKey);
}

test.describe('shift notifications', () => {
  test('petugas menerima checkpoint pending tepat 1 jam sebelum shift berakhir', async ({ page }) => {
    const session = await bootstrapSession(page, {
      nowIso: '2026-04-06T04:00:00.000Z',
      userId: 'u3',
    });

    await openNotificationInbox(page);
    const pendingCard = page.getByRole('button', { name: /Masih ada checkpoint pending/i }).first();
    await expect(pendingCard).toBeVisible();

    const persisted = await readPersistedAppData(page);
    const notifications = persisted?.data?.notifications || [];
    const checkpointPending = getNotificationByDedupe(notifications, 'checkpoint-pending:MT MENGGALA:2026-04-06|shift-1');

    expect(checkpointPending).toBeTruthy();
    expect(checkpointPending.targetUserIds).toContain('u3');
    expect(checkpointPending.createdAt).toBe('2026-04-06T04:00:00.000Z');

    const badgeClass = await pendingCard.locator('span').first().getAttribute('class');
    const timestampText = await pendingCard.locator('span').last().textContent();
    expect(badgeClass || '').toContain('border-yellow-500/30');
    expect((timestampText || '').trim()).toBe(formatNotificationTime(checkpointPending.createdAt));
    expect(session.getConsoleErrors()).toEqual([]);
  });

  test('shift dimulai dikirim ke pic dan petugas dengan timestamp jam shift', async ({ page }) => {
    const session = await bootstrapSession(page, {
      nowIso: '2026-04-05T23:00:00.000Z',
      userId: 'u2',
    });

    await openNotificationInbox(page);
    const shiftStartedCard = page.getByRole('button', { name: /Shift patroli dimulai/i }).first();
    await expect(shiftStartedCard).toBeVisible();

    const persisted = await readPersistedAppData(page);
    const notifications = persisted?.data?.notifications || [];
    const shiftStarted = getNotificationByDedupe(notifications, 'shift-started:MT MENGGALA:2026-04-06|shift-1');

    expect(shiftStarted).toBeTruthy();
    expect(shiftStarted.targetUserIds).toContain('u2');
    expect(shiftStarted.targetUserIds).toContain('u3');
    expect(shiftStarted.targetUserIds).not.toContain('u1');
    expect(shiftStarted.createdAt).toBe('2026-04-05T23:00:00.000Z');

    const timestampText = await shiftStartedCard.locator('span').last().textContent();
    expect((timestampText || '').trim()).toBe(formatNotificationTime(shiftStarted.createdAt));
    expect(session.getConsoleErrors()).toEqual([]);
  });

  test('petugas menerima shift ending soon tepat 15 menit sebelum shift berakhir', async ({ page }) => {
    const session = await bootstrapSession(page, {
      nowIso: '2026-04-06T04:45:00.000Z',
      userId: 'u3',
    });

    await openNotificationInbox(page);
    const shiftEndingSoonCard = page.getByRole('button', { name: /Shift akan berakhir 15 menit lagi silahkan cek kembali laporan patroli anda/i }).first();
    await expect(shiftEndingSoonCard).toBeVisible();

    const persisted = await readPersistedAppData(page);
    const notifications = persisted?.data?.notifications || [];
    const shiftEndingSoon = getNotificationByDedupe(notifications, 'shift-ending-soon:MT MENGGALA:2026-04-06|shift-1');

    expect(shiftEndingSoon).toBeTruthy();
    expect(shiftEndingSoon.targetUserIds).toContain('u3');
    expect(shiftEndingSoon.createdAt).toBe('2026-04-06T04:45:00.000Z');

    const timestampText = await shiftEndingSoonCard.locator('span').last().textContent();
    expect((timestampText || '').trim()).toBe(formatNotificationTime(shiftEndingSoon.createdAt));
    expect(session.getConsoleErrors()).toEqual([]);
  });

  test('pic juga menerima reminder shift, admin tidak menerima reminder petugas', async ({ page }) => {
    const picSession = await bootstrapSession(page, {
      nowIso: '2026-04-06T04:45:00.000Z',
      userId: 'u2',
    });

    await openNotificationInbox(page);
    await expect(page.getByRole('button', { name: /Masih ada checkpoint pending/i }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: /Shift akan berakhir 15 menit lagi silahkan cek kembali laporan patroli anda/i }).first()).toBeVisible();

    const persistedForPic = await readPersistedAppData(page);
    const notificationsForPic = persistedForPic?.data?.notifications || [];
    expect(getNotificationByDedupe(notificationsForPic, 'checkpoint-pending:MT MENGGALA:2026-04-06|shift-1')?.targetUserIds).toContain('u2');
    expect(getNotificationByDedupe(notificationsForPic, 'shift-ending-soon:MT MENGGALA:2026-04-06|shift-1')?.targetUserIds).toContain('u2');
    expect(picSession.getConsoleErrors()).toEqual([]);

    const adminPage = await page.context().newPage();
    const adminSession = await bootstrapSession(adminPage, {
      nowIso: '2026-04-06T04:45:00.000Z',
      userId: 'u1',
    });

    await openNotificationInbox(adminPage);
    await expect(adminPage.getByRole('button', { name: /Masih ada checkpoint pending/i })).toHaveCount(0);
    await expect(adminPage.getByRole('button', { name: /Shift akan berakhir 15 menit lagi silahkan cek kembali laporan patroli anda/i })).toHaveCount(0);
    expect(adminSession.getConsoleErrors()).toEqual([]);
    await adminPage.close();
  });

  test('admin menerima riwayat shift dan checkpoint missed saat pergantian shift', async ({ page }) => {
    const session = await bootstrapSession(page, {
      nowIso: '2026-04-06T05:05:00.000Z',
      userId: 'u1',
      appData: {
        activeShiftKey: '2026-04-06|shift-1',
      },
    });

    await openNotificationInbox(page);
    const historyCard = page.getByRole('button', { name: /Riwayat shift tersimpan/i }).first();
    const missedCard = page.getByRole('button', { name: /Ada checkpoint missed/i }).first();
    await expect(historyCard).toBeVisible();
    await expect(missedCard).toBeVisible();

    const persisted = await readPersistedAppData(page);
    const notifications = persisted?.data?.notifications || [];
    const historyNotification = getNotificationByDedupe(notifications, 'shift-history-created:s1|2026-04-06|shift-1');
    const missedNotification = getNotificationByDedupe(notifications, 'checkpoint-missed:s1|2026-04-06|shift-1');

    expect(historyNotification).toBeTruthy();
    expect(missedNotification).toBeTruthy();
    expect(historyNotification.targetUserIds).toContain('u1');
    expect(historyNotification.targetUserIds).toContain('u2');
    expect(historyNotification.targetUserIds).not.toContain('u3');
    expect(missedNotification.targetUserIds).toContain('u1');
    expect(missedNotification.targetUserIds).toContain('u2');
    expect(missedNotification.targetUserIds).not.toContain('u3');
    expect(session.getConsoleErrors()).toEqual([]);
  });

  test('timestamp temuan mengikuti jam submit patroli', async ({ page }) => {
    const session = await bootstrapSession(page, {
      nowIso: '2026-04-06T02:07:00.000Z',
      userId: 'u3',
    });

    await page.getByRole('button', { name: 'Patroli' }).first().click();
    await expect(page.getByPlaceholder('Cari titik Patroli...')).toBeVisible();
    await page.locator('main').getByRole('button', { name: 'TEMUAN' }).first().click();

    const uploadTemuanButton = page.getByRole('button', { name: 'Unggah Visual Temuan' }).first();
    await expect(uploadTemuanButton).toBeVisible();

    const [fileChooser] = await Promise.all([
      page.waitForEvent('filechooser'),
      uploadTemuanButton.click(),
    ]);

    await fileChooser.setFiles({
      name: 'temuan.png',
      mimeType: 'image/png',
      buffer: tinyPngBuffer,
    });

    await page.locator('textarea').nth(0).fill('Tes deskripsi temuan otomatis');
    await page.locator('textarea').nth(1).fill('Tes penyebab otomatis');
    await page.locator('textarea').nth(2).fill('Tes tindak lanjut otomatis');
    await page.getByRole('button', { name: /Sync Laporan/i }).click();
    await page.waitForTimeout(1200);

    const persisted = await readPersistedAppData(page);
    const notifications = persisted?.data?.notifications || [];
    const incidentCreated = notifications.find((notification) => notification.type === 'incident_created' && notification.senderName === 'Cipto Mangunkusumo');
    const mtMenggalaCheckpoints = persisted?.data?.checkpointsByShip?.s1 || [];
    const submittedCheckpoint = mtMenggalaCheckpoints.find((checkpoint) => (
      checkpoint.completedByUserId === 'u3'
      && checkpoint.resultType === 'temuan'
      && checkpoint.completedAt === '2026-04-06T02:07:00.000Z'
    ));

    expect(submittedCheckpoint).toBeTruthy();
    expect(submittedCheckpoint.time).toBe('09.07');
    expect(incidentCreated).toBeTruthy();
    expect(incidentCreated.createdAt).toBe('2026-04-06T02:07:00.000Z');
    expect(incidentCreated.targetUserIds).toContain('u1');
    expect(incidentCreated.targetUserIds).toContain('u2');
    expect(incidentCreated.targetUserIds).not.toContain('u3');
    expect(session.getConsoleErrors()).toEqual([]);
  });
});
