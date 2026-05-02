/*
Tujuan: Menjalankan sanity check lokal untuk model Gemini yang dipakai webhook Telegram SmartPatrol.
Caller: Developer lokal sebelum deploy Cloud Functions.
Dependensi: @google/generative-ai dan environment variable GEMINI_API_KEY.
Main Functions: run.
Side Effects: Memanggil Gemini API dan menulis hasil ke console.
*/

import { GoogleGenerativeAI } from '@google/generative-ai';

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  console.error('GEMINI_API_KEY is not set. Export it before running this script.');
  process.exit(1);
}

const genAI = new GoogleGenerativeAI(apiKey);

async function run() {
  try {
    const model = genAI.getGenerativeModel({ model: 'gemini-3.1-pro-preview' });
    const result = await model.generateContent('hello');
    console.log('success:', result.response.text());
  } catch (e) {
    console.log('error:', e.message);
  }
}

run();
