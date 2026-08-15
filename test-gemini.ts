import { GoogleGenAI } from '@google/genai';

async function testKey(apiKey: string) {
  try {
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: 'Hello',
    });
    console.log("SUCCESS:", response.text);
  } catch (error: any) {
    console.error("ERROR:", error.message || error);
  }
}

testKey(process.argv[2]);
