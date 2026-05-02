// Local sanity check for the Gemini chat model used by the Telegram bot.
// Run with:   GEMINI_API_KEY=... node functions/testGemini.js
// The API key MUST come from the environment - do not hardcode it.

import { GoogleGenerativeAI } from '@google/generative-ai';

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  console.error('GEMINI_API_KEY is not set. Export it before running this script.');
  process.exit(1);
}

const genAI = new GoogleGenerativeAI(apiKey);

async function run() {
  try {
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
    const result = await model.generateContent('hello');
    console.log('success:', result.response.text());
  } catch (e) {
    console.log('error:', e.message);
  }
}

run();
