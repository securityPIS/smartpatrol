/*
Tujuan: Menyediakan webhook Telegram AI dan notifikasi operasional SmartPatrol ke grup Telegram.
Caller: Firebase Cloud Functions export dari functions/index.js dan trigger Firestore patrolReports/shared-state.
Dependensi: Firebase Functions v2, Google Generative AI, Telegram Bot API, dan user_guideline.md sebagai knowledge base.
Main Functions: telegramWebhook, sendTelegramMessage, onCheckpointReportCreated, onSharedStateUpdated, dan deteksi progress temuan.
Side Effects: Membaca file knowledge base saat cold start, memanggil Gemini API, mengirim pesan Telegram, dan membaca snapshot Firestore trigger.
*/

import { onRequest } from 'firebase-functions/v2/https';
import { onDocumentCreated, onDocumentUpdated } from 'firebase-functions/v2/firestore';
import { GoogleGenerativeAI } from '@google/generative-ai';
import fs from 'fs';
import {
  getForwardableTelegramSystemNotifications,
  resolveTelegramNotificationText,
} from './telegramNotifications.js';

// Inisialisasi Gemini sekali per cold start agar request Telegram tetap ringan.
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const GEMINI_MODEL_NAME = 'gemini-3.1-flash-lite-preview';

// Load the SmartPatrol knowledge base once per cold start so the file isn't
// re-read on every Telegram request.
const SMARTPATROL_KNOWLEDGE_BASE = (() => {
  try {
    return fs.readFileSync(new URL('./user_guideline.md', import.meta.url), 'utf-8');
  } catch (error) {
    console.error('Failed to load SmartPatrol knowledge base:', error);
    return '';
  }
})();

const TELEGRAM_BOT_SYSTEM_INSTRUCTION = `Anda adalah Asisten AI ramah dan cerdas dari SecurityPIS yang dapat menjawab beragam pertanyaan dalam bahasa Indonesia.

ATURAN PRIORITAS:
1. Jika pertanyaan pengguna berkaitan dengan aplikasi "SmartPatrol", operasi patroli maritim, SOP, alur kerja petugas/PIC/admin, fitur aplikasi, atau panduan teknis penggunaan SmartPatrol — gunakan "KNOWLEDGE BASE SMARTPATROL" di bawah ini sebagai sumber kebenaran utama. Jangan mengarang fitur atau prosedur di luar dokumen tersebut. Jika informasinya tidak ada di knowledge base, akui dengan jujur dan jangan menebak.

2. Untuk pertanyaan umum di luar SmartPatrol (misal: cuaca, sejarah, sains, teknologi umum, hitung-hitungan, percakapan kasual), jawab seperti asisten AI biasa berdasarkan pengetahuan umum Anda — jangan paksa kaitkan dengan SmartPatrol.

3. Jawab dengan profesional, ramah, ringkas, dan jelas dalam bahasa Indonesia. Hindari pengulangan disclaimer atau permintaan maaf yang tidak perlu.

=== KNOWLEDGE BASE SMARTPATROL ===
${SMARTPATROL_KNOWLEDGE_BASE}
=== END OF KNOWLEDGE BASE ===`;

// Cache the configured model so we don't rebuild the system prompt per request.
const geminiChatModel = genAI.getGenerativeModel({
  model: GEMINI_MODEL_NAME,
  systemInstruction: TELEGRAM_BOT_SYSTEM_INSTRUCTION,
});

const SMARTPATROL_APP_URL = 'https://smartpatrol-7ff9e.web.app';

function ensureArray(value) {
  return Array.isArray(value) ? value : [];
}

function ensureObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function sanitizeTelegramText(value, fallback = '', maxLength = 500) {
  if (value == null) return fallback;
  const normalized = String(value)
    .replace(/[\u0000-\u001f\u007f<>]/g, ' ')
    .trim()
    .slice(0, maxLength);
  return normalized || fallback;
}

function escapeTelegramMarkdown(value, fallback = '') {
  return sanitizeTelegramText(value, fallback)
    .replace(/([_*`\[])/g, '\\$1');
}

function normalizeSlugToken(value, fallback = '') {
  return sanitizeTelegramText(value, fallback, 160)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '') || fallback;
}

function createPatrolIncidentIdFromCheckpoint(checkpoint = {}) {
  const existingIncidentId = sanitizeTelegramText(checkpoint.incidentId || '', '', 200);
  if (existingIncidentId) return existingIncidentId;

  const checkpointToken = normalizeSlugToken(checkpoint.id || checkpoint.checkpointId || 'checkpoint', 'checkpoint');
  const completedToken = normalizeSlugToken(checkpoint.completedAt || checkpoint.occurredAtTrustedIso || '', '');
  return completedToken ? `p-${checkpointToken}-${completedToken}` : `p-${checkpointToken}`;
}

function getProgressItemKey(progressItem = {}, index = 0) {
  return sanitizeTelegramText(
    progressItem.id
      || progressItem.createdAt
      || progressItem.updatedAt
      || `progress-${index}`,
    '',
    220,
  );
}

function collectNewProgressItems(beforeMeta = {}, afterMeta = {}) {
  const safeBeforeMeta = ensureObject(beforeMeta);
  const safeAfterMeta = ensureObject(afterMeta);
  const beforeProgressKeys = new Set(
    ensureArray(safeBeforeMeta.progress)
      .map((item, index) => getProgressItemKey(item, index))
      .filter(Boolean),
  );

  return ensureArray(safeAfterMeta.progress)
    .map((item, index) => ({ item: ensureObject(item), key: getProgressItemKey(item, index) }))
    .filter(({ key }) => key && !beforeProgressKeys.has(key));
}

function findCheckpointIncident(state = {}, incidentId = '') {
  const checkpointsByShip = ensureObject(state.checkpointsByShip);
  for (const checkpoints of Object.values(checkpointsByShip)) {
    const match = ensureArray(checkpoints).find((checkpoint) => (
      createPatrolIncidentIdFromCheckpoint(ensureObject(checkpoint)) === incidentId
    ));
    if (match) return ensureObject(match);
  }
  return null;
}

function resolveIncidentForProgress(state = {}, incidentId = '') {
  const incident = ensureArray(state.incidentsData).find((item) => {
    const safeItem = ensureObject(item);
    return sanitizeTelegramText(safeItem.id || safeItem.incidentId || '', '', 200) === incidentId;
  });

  if (incident) {
    return {
      label: sanitizeTelegramText(incident.location || incident.name || incident.title || 'Temuan', 'Temuan', 140),
      shipName: sanitizeTelegramText(incident.shipName || '', '', 140),
    };
  }

  const checkpoint = findCheckpointIncident(state, incidentId);
  if (checkpoint) {
    return {
      label: sanitizeTelegramText(checkpoint.name || checkpoint.checkpointName || 'Temuan', 'Temuan', 140),
      shipName: sanitizeTelegramText(checkpoint.shipName || '', '', 140),
    };
  }

  return {
    label: 'Temuan',
    shipName: '',
  };
}

async function sendIncidentProgressUpdatesToTelegram(chatId, beforeState = {}, afterState = {}) {
  const beforeMetaCollection = ensureObject(beforeState.incidentMeta);
  const afterMetaCollection = ensureObject(afterState.incidentMeta);

  for (const [incidentId, afterMeta] of Object.entries(afterMetaCollection)) {
    const safeIncidentId = sanitizeTelegramText(incidentId, '', 200);
    if (!safeIncidentId) continue;

    const newProgressItems = collectNewProgressItems(beforeMetaCollection[safeIncidentId], afterMeta);
    if (newProgressItems.length === 0) continue;

    const incidentInfo = resolveIncidentForProgress(afterState, safeIncidentId);
    const incidentUrl = `${SMARTPATROL_APP_URL}/?incidentId=${encodeURIComponent(safeIncidentId)}`;

    for (const { item: progressItem } of newProgressItems) {
      const author = escapeTelegramMarkdown(progressItem.author || progressItem.createdBy || 'Petugas', 'Petugas');
      const label = escapeTelegramMarkdown(incidentInfo.label || 'Temuan', 'Temuan');
      const shipName = escapeTelegramMarkdown(incidentInfo.shipName || 'Tidak Diketahui', 'Tidak Diketahui');
      const comment = sanitizeTelegramText(progressItem.comment || progressItem.notes || '', '', 900);
      const commentLine = comment ? `\nUpdate: ${escapeTelegramMarkdown(comment)}` : '';

      // Handler khusus progress menjaga update temuan tetap terkirim tanpa
      // mengandalkan notifikasi foreground yang bisa dibuat oleh banyak device.
      const message = `*UPDATE TEMUAN*
Temuan mendapat update baru dari ${author}.

Kapal: ${shipName}
Titik: ${label}${commentLine}

Buka Aplikasi:
${incidentUrl}`;

      await sendTelegramMessage(chatId, message);
    }
  }
}

// Send Message Helper
export async function sendTelegramMessage(chatId, text) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token || !chatId) {
    console.error('Missing TELEGRAM_BOT_TOKEN or CHAT_ID');
    return;
  }
  
  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: text,
        parse_mode: 'Markdown'
      })
    });
    if (!response.ok) {
      console.error('Failed to send Telegram message:', await response.text());
    }
  } catch (err) {
    console.error('Error sending Telegram message:', err);
  }
}

// Webhook for AI Chatbot
export const telegramWebhook = onRequest(async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).send('Method Not Allowed');
    return;
  }

  const update = req.body;
  if (!update || !update.message || !update.message.text) {
    res.status(200).send('OK');
    return;
  }

  const chatId = update.message.chat.id;
  const text = update.message.text;

  // Handle /start or /id to easily get the Chat ID for notifications
  if (text.startsWith('/start') || text.startsWith('/id')) {
    await sendTelegramMessage(chatId, `🤖 SmartPatrol Bot Aktif!\n\nID Chat/Grup ini adalah: \`${chatId}\`\n\nSilakan simpan ID ini di Environment Variable Firebase Anda (TELEGRAM_CHAT_ID) agar notifikasi sistem bisa dikirim ke grup ini.`);
    res.status(200).send('OK');
    return;
  }

  try {
    const lowerText = text.toLowerCase().trim();
    const greetings = ['halo', 'hallo', 'hi', 'hey', 'p', 'siang', 'pagi', 'malam', 'sore'];
    
    if (greetings.includes(lowerText)) {
      const greetingResponse = `Halo! Saya adalah Ai buatan Bayu Samudra Baadilla dari SecurityPIS yang siap membantu Anda. 

Saya dapat menjawab berbagai pertanyaan umum maupun memberikan panduan terkait aplikasi SmartPatrol, seperti operasional patroli, manajemen insiden, hingga teknis penggunaan aplikasi di lapangan.

Ada yang bisa saya bantu hari ini?`;
      
      await sendTelegramMessage(chatId, greetingResponse);
      res.status(200).send('OK');
      return;
    }

    // The model + system instruction are configured once at module load
    // (see geminiChatModel). The user's text is the only per-request input.
    const result = await geminiChatModel.generateContent(text);
    const responseText = result.response.text();

    if (!responseText || !responseText.trim()) {
      console.warn('Gemini returned empty response for text:', text);
      await sendTelegramMessage(chatId, 'Maaf, saya belum bisa menjawab pertanyaan tersebut. Silakan ulang dengan kalimat lain.');
    } else {
      await sendTelegramMessage(chatId, responseText);
    }
  } catch (error) {
    console.error('AI Error (model:', GEMINI_MODEL_NAME, '):', error?.message || error, error?.stack);
    await sendTelegramMessage(chatId, 'Maaf, saya sedang mengalami kendala teknis saat memproses permintaan Anda.');
  }

  res.status(200).send('OK');
});

// Trigger: Temuan Baru (Checkpoint)
export const onCheckpointReportCreated = onDocumentCreated(
  {
    document: 'patrolReports/{shiftKey}/ships/{shipId}/checkpoints/{checkpointId}',
    region: 'asia-southeast2'
  },
  async (event) => {
    const data = event.data?.data();
    if (!data || data.resultType !== 'temuan') return;

    // Use TELEGRAM_CHAT_ID from env, fallback to a hardcoded one if not set
    const chatId = process.env.TELEGRAM_CHAT_ID;
    if (!chatId) {
        console.warn('TELEGRAM_CHAT_ID not set, skipping finding notification.');
        return;
    }

    const shipName = data.shipName || event.params.shipId;
    const checkpointName = data.name || event.params.checkpointId;
    const author = data.completedBy || 'Petugas';
    const time = data.time || new Date().toLocaleTimeString('id-ID');
    const desc = data.kejadian || data.desc || 'Tidak ada deskripsi.';

    let incidentId = data.incidentId || `p-${event.params.checkpointId}`;
    if (!data.incidentId && data.completedAt) {
      const completedToken = data.completedAt.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
      incidentId = `p-${event.params.checkpointId.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')}-${completedToken}`;
    }

    const message = `🚨 *TEMUAN PATROLI BARU* 🚨
Kapal: ${shipName}
Titik: ${checkpointName}
Pelapor: ${author}
Waktu: ${time} WIB
Keterangan: ${desc}

🔗 Cek Detail Laporan & Foto Visual:
https://smartpatrol-7ff9e.web.app/?incidentId=${incidentId}`;

    await sendTelegramMessage(chatId, message);
  }
);

// Trigger: SOS dan Insiden Baru (dari shared-state)
export const onSharedStateUpdated = onDocumentUpdated(
  {
    document: 'smartpatrol/shared-state',
    region: 'asia-southeast2'
  },
  async (event) => {
    const beforeState = event.data?.before?.data()?.state || {};
    const afterState = event.data?.after?.data()?.state || {};
    
    const chatId = process.env.TELEGRAM_CHAT_ID;
    if (!chatId) return;

    // Deteksi SOS Baru
    const beforeSOS = beforeState.activeSOSAlert;
    const afterSOS = afterState.activeSOSAlert;
    if (afterSOS && (!beforeSOS || beforeSOS.id !== afterSOS.id)) {
      const shipName = afterSOS.shipName || 'Tidak Diketahui';
      const trigger = afterSOS.triggeredBy || 'Awak Kapal';
      
      const message = `🆘 *DARURAT SOS DITEKAN* 🆘
Kapal: ${shipName}
Pelapor: ${trigger}
Lokasi: ${afterSOS.lat}, ${afterSOS.lng}

🔗 Cek Koordinat & Detail SOS:
https://smartpatrol-7ff9e.web.app/?incidentId=${afterSOS.id}`;

      await sendTelegramMessage(chatId, message);
    }

    // Deteksi Insiden / Lapor Baru (Manual)
    const beforeIncidents = beforeState.incidentsData || [];
    const afterIncidents = afterState.incidentsData || [];
    
    if (afterIncidents.length > beforeIncidents.length) {
      const newIncidents = afterIncidents.filter(a => !beforeIncidents.some(b => b.id === a.id));
      for (const incident of newIncidents) {
        const shipName = incident.shipName || 'Tidak Diketahui';
        const location = incident.location || 'Area Kapal';
        const desc = incident.deskripsi || incident.kejadian || 'Tidak ada deskripsi.';
        const author = incident.reportedBy || 'Petugas';
        
        const message = `⚠️ *LAPORAN INSIDEN BARU* ⚠️
Kapal: ${shipName}
Lokasi: ${location}
Pelapor: ${author}
Keterangan: ${desc}

🔗 Cek Detail Insiden & Foto Visual:
https://smartpatrol-7ff9e.web.app/?incidentId=${incident.id}`;

        await sendTelegramMessage(chatId, message);
      }
    }

    await sendIncidentProgressUpdatesToTelegram(chatId, beforeState, afterState);

    // Deteksi Notifikasi Sistem Lainnya (Shift, Registration, Missed, dll)
    const beforeNotifs = Array.isArray(beforeState.notifications) ? beforeState.notifications : [];
    const afterNotifs = Array.isArray(afterState.notifications) ? afterState.notifications : [];
    
    // Deteksi notifikasi baru atau yang memang perlu diteruskan. Pending Checkpoint
    // Summary sengaja hanya forward saat entry baru di jendela H-1 shift, supaya
    // submit laporan tidak mengirim ulang Telegram dari notifikasi lama.
    const newOrUpdatedNotifs = getForwardableTelegramSystemNotifications({
      beforeNotifications: beforeNotifs,
      afterNotifications: afterNotifs,
      beforeState,
      afterState,
      dispatchedAt: event.time || new Date().toISOString(),
    });
    
    for (const notif of newOrUpdatedNotifs) {
      // Abaikan tipe yang sudah ditangani secara khusus di atas untuk menghindari duplikasi
      const skipTypes = [
        'sos',
        'patrol_finding',
        'incident_created',
        'incident_progress_updated',
        'shift_started',
        'shift_ending_soon',
        'checkpoint_missed',
      ];
      if (skipTypes.includes(notif.type)) continue;

      // Hanya admin "Summary Shift Wrap Up" yang dikirim ke Telegram dari grup shift_history_created;
      // notifikasi per-kapal "Riwayat shift tersimpan" cukup tampil in-app saja.
      if (notif.type === 'shift_history_created' && notif.title !== 'Summary Shift Wrap Up') continue;

      // Hanya admin "Pending Checkpoint Summary" konsolidasi yang dikirim ke Telegram;
      // per-kapal "Pending checkpoint" (FCM) dan client "Masih ada checkpoint pending" cukup in-app saja.
      if (notif.type === 'checkpoint_pending' && notif.title !== 'Pending Checkpoint Summary') continue;

      let icon = '🔔';
      if (notif.type === 'shift_history_created') icon = '📊';
      if (notif.type === 'registration_pending') icon = '👤';
      if (notif.type === 'checkpoint_pending') icon = '⏳';

      const notificationMessage = resolveTelegramNotificationText(notif, afterState);
      const message = `${icon} *${notif.title.toUpperCase()}* ${icon}
${notificationMessage}

🔗 Buka Aplikasi:
https://smartpatrol-7ff9e.web.app/${notif.routeParams?.incidentId ? '?incidentId=' + notif.routeParams.incidentId : ''}`;

      await sendTelegramMessage(chatId, message);
    }
  }
);
