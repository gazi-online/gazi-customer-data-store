import fs from 'fs';
import path from 'path';
import { GoogleGenAI } from '@google/genai';

function loadEnv() {
  const envPath = path.join(process.cwd(), '.env.local');
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf-8');
    envContent.split(/\r?\n/).forEach(line => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) return;
      const match = trimmed.match(/^([^=]+)=(.*)$/);
      if (match) {
        const key = match[1].trim();
        const value = match[2].trim().replace(/^["']|["']$/g, '');
        process.env[key] = value;
      }
    });
  }
}

loadEnv();
const apiKey = process.env.GEMINI_API_KEY || '';
console.log(`API Key loaded (length: ${apiKey.length})`);

const ai = new GoogleGenAI({ apiKey });

async function testModels() {
  const candidates = [
    'gemini-1.5-flash',
    'gemini-1.5-pro',
    'gemini-flash-latest',
    'gemini-2.0-flash-exp'
  ];

  for (const m of candidates) {
    try {
      console.log(`Testing model: ${m}...`);
      const res = await ai.models.generateContent({
        model: m,
        contents: 'Say hello in one word'
      });
      console.log(`✅ SUCCESS [${m}]: ${res.text?.trim()}`);
      break;
    } catch (e: any) {
      console.log(`❌ FAILED [${m}]: ${e.message}`);
    }
  }
}

testModels();
