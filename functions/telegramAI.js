import { onRequest } from 'firebase-functions/v2/https';
import { onDocumentCreated, onDocumentUpdated } from 'firebase-functions/v2/firestore';
import { GoogleGenerativeAI } from '@google/generative-ai';
import fs from 'fs';

// Initialize Gemini
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

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
    // Load Knowledge Base
    const knowledgeBase = fs.readFileSync(new URL('./user_guideline.md', import.meta.url), 'utf-8');

    // Call Gemini Flash
    const model = genAI.getGenerativeModel({ 
      model: "gemini-3-flash-preview",
      systemInstruction: `Anda adalah Asisten Bot AI cerdas untuk aplikasi operasional maritim "SmartPatrol". 
Gunakan dokumen "Panduan Pengguna & Basis Pengetahuan" berikut sebagai SATU-SATUNYA referensi kebenaran untuk menjawab pertanyaan user. 
Jangan mengarang fitur yang tidak disebutkan dalam dokumen. Jawab dengan profesional, ramah, ringkas, dan jelas dalam bahasa Indonesia.

=== KNOWLEDGE BASE ===
${knowledgeBase}
=== END OF KNOWLEDGE BASE ===`
    });
    
    // Pertanyaan user langsung diberikan sebagai prompt utama
    const result = await model.generateContent(text);
    const responseText = result.response.text();

    await sendTelegramMessage(chatId, responseText);
  } catch (error) {
    console.error('AI Error:', error);
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
    const beforeNotifs = beforeState.notifications || [];
    const afterNotifs = afterState.notifications || [];
    
    if (afterNotifs.length > beforeNotifs.length) {
      const newNotifs = afterNotifs.filter(a => !beforeNotifs.some(b => b.id === a.id));
      
      for (const notif of newNotifs) {
        // Abaikan tipe yang sudah ditangani secara khusus di atas untuk menghindari duplikasi
        const skipTypes = ['sos', 'patrol_finding', 'incident_created'];
        if (skipTypes.includes(notif.type)) continue;

        let icon = '🔔';
        if (notif.type === 'shift_started') icon = '🚀';
        if (notif.type === 'shift_history_created') icon = '📊';
        if (notif.type === 'checkpoint_missed') icon = '❌';
        if (notif.type === 'registration_pending') icon = '👤';
        if (notif.type === 'checkpoint_pending') icon = '⏳';
        if (notif.type === 'shift_ending_soon') icon = '⚠️';

        const message = `${icon} *${notif.title.toUpperCase()}* ${icon}
${notif.message}

🔗 Buka Aplikasi:
https://smartpatrol-7ff9e.web.app/${notif.routeParams?.incidentId ? '?incidentId=' + notif.routeParams.incidentId : ''}`;

        await sendTelegramMessage(chatId, message);
      }
    }
  }
);
  }
);
