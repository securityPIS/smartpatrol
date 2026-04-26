import { onRequest } from 'firebase-functions/v2/https';
import { onDocumentCreated, onDocumentUpdated } from 'firebase-functions/v2/firestore';
import { GoogleGenerativeAI } from '@google/generative-ai';

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
    // Call Gemini 3 Flash
    const model = genAI.getGenerativeModel({ model: "gemini-3.1-flash" });
    
    // Provide some context so the AI knows its role
    const prompt = `Anda adalah asisten AI cerdas untuk aplikasi operasional maritim "SmartPatrol". 
    Tugas Anda adalah membantu petugas lapangan, admin, dan PIC menjawab pertanyaan mereka dengan profesional, ringkas, dan jelas dalam bahasa Indonesia.
    Pertanyaan user: "${text}"`;

    const result = await model.generateContent(prompt);
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

    const message = `🚨 *TEMUAN PATROLI BARU* 🚨
Kapal: ${shipName}
Titik: ${checkpointName}
Pelapor: ${author}
Waktu: ${time} WIB
Keterangan: ${desc}

🔗 Cek Detail Laporan & Foto Visual:
https://smartpatrol-app.web.app/history`;

    await sendTelegramMessage(chatId, message);
  }
);
