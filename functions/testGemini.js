import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI("AIzaSyBrv7Y94elyCdVtB9EavNHAexHlT4K44e4");

async function run() {
  try {
    const model = genAI.getGenerativeModel({ model: "gemini-3-flash-preview" });
    const result = await model.generateContent("hello");
    console.log("success:", result.response.text());
  } catch (e) {
    console.log("error:", e.message);
  }
}
run();
