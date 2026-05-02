/*
Tujuan: Menyediakan webhook Telegram AI dan notifikasi operasional SmartPatrol ke grup Telegram.
Caller: Firebase Cloud Functions export dari functions/index.js dan trigger Firestore patrolReports/shared-state.
Dependensi: Firebase Functions v2, Google Generative AI, Telegram Bot API, dan user_guideline.md sebagai knowledge base.
Main Functions: telegramWebhook, sendTelegramMessage, onCheckpointReportCreated, dan onSharedStateUpdated.
Side Effects: Membaca file knowledge base saat cold start, memanggil Gemini API, mengirim pesan Telegram, dan membaca snapshot Firestore trigger.
*/

import { onRequest } from 'firebase-functions/v2/https';
import { onDocumentCreated, onDocumentUpdated } from 'firebase-functions/v2/firestore';
import { GoogleGenerativeAI } from '@google/generative-ai';
import fs from 'fs';

// Inisialisasi Gemini sekali per cold start agar request Telegram tetap ringan.
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const GEMINI_MODEL_NAME = 'gemini-3.1-pro-preview';

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

    // Deteksi Notifikasi Sistem Lainnya (Shift, Registration, Missed, dll)
    const beforeNotifs = Array.isArray(beforeState.notifications) ? beforeState.notifications : [];
    const afterNotifs = Array.isArray(afterState.notifications) ? afterState.notifications : [];
    
    // Deteksi notifikasi baru atau yang pesannya berubah (untuk pending/wrap-up yang terupdate)
    const newOrUpdatedNotifs = afterNotifs.filter(after => {
      const before = beforeNotifs.find(b => b.id === after.id);
      if (!before) return true; // Baru
      return before.message !== after.message; // Update konten (misal: jumlah pending berubah)
    });
    
    for (const notif of newOrUpdatedNotifs) {
      // Abaikan tipe yang sudah ditangani secara khusus di atas untuk menghindari duplikasi
      const skipTypes = [
        'sos',
        'patrol_finding',
        'incident_created',
        'shift_started',
        'shift_ending_soon',
        'checkpoint_missed',
      ];
      if (skipTypes.includes(notif.type)) continue;

      // Hanya admin "Summary Shift Wrap Up" yang dikirim ke Telegram dari grup shift_history_created;
      // notifikasi per-kapal "Riwayat shift tersimpan" cukup tampil in-app saja.
      if (notif.type === 'shift_history_created' && notif.title !== 'Summary Shift Wrap Up') continue;

      let icon = '🔔';
      if (notif.type === 'shift_history_created') icon = '📊';
      if (notif.type === 'registration_pending') icon = '👤';
      if (notif.type === 'checkpoint_pending') icon = '⏳';

      const message = `${icon} *${notif.title.toUpperCase()}* ${icon}
${notif.message}

🔗 Buka Aplikasi:
https://smartpatrol-7ff9e.web.app/${notif.routeParams?.incidentId ? '?incidentId=' + notif.routeParams.incidentId : ''}`;

      await sendTelegramMessage(chatId, message);
    }
  }
);
